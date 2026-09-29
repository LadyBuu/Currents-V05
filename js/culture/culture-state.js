/**
 * =============================================================================
 * STILL WATERS - CULTURE STATE
 * js/culture/culture-state.js
 * =============================================================================
 *
 * Derived indexes and subscriptions for culture data.
 *
 * This module is deliberately boring.
 *
 * It owns:
 *   - derived lookup indexes (byId, byName, byDisplayName, etc.)
 *   - a subscription mechanism for interested consumers
 *   - a way to rebuild indexes from canonical culture data
 *
 * It does NOT own:
 *   - culture records                  (masterData.data.cultures)
 *   - persistence                      (application save mechanism)
 *   - mutation                         (CultureCommands)
 *   - queries                          (CultureQueries)
 *   - domain vocabulary                (appearance, mythology, etc.)
 *   - presentation                     (CultureViewModels / CultureUI)
 *
 * Relationship to canonical data:
 *
 *     masterData.data.cultures
 *             │
 *             ├── CultureCommands ──── mutate + rebuild + save + notify
 *             │
 *             ├── CultureQueries ───── read / interpret
 *             │
 *             └── CultureState ─────── index
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. STATE
    // =========================================================================

    /**
     * The only state this module holds.
     *
     * Note the absence of:
     *   - a cultures array (canonical data lives in masterData)
     *   - a _processing flag (nothing here needs recursion protection)
     *   - a lastRefresh timestamp (nobody should be branching on it)
     *   - an _initialized flag (empty indexes are a valid state)
     */
    var _indexes = {
        byId:                    new Map(),
        byName:                  new Map(),  // name  -> [culture, ...]
        byDisplayName:           new Map(),  // label -> [culture, ...]
        byPrimaryCultureLocation: new Map(), // locationId -> [culture, ...]
        byAssociatedLocation:    new Map(),  // locationId -> [culture, ...]
        byReligion:              new Map()   // religionId -> [culture, ...]
    };

    var _subscribers = [];

    // =========================================================================
    // 2. DEPENDENCY REQUIREMENT
    // =========================================================================

    /**
     * Throws when a required capability is missing.
     *
     * Called at use time rather than at module load time so that load order
     * during the migration does not become a chicken-and-egg problem.
     *
     * Missing dependencies must be loud, not substituted.
     */
    function _requireMasterData() {
        if (typeof window.masterData === 'undefined' || !window.masterData) {
            throw new Error(
                'CultureState requires window.masterData. ' +
                'This is a required dependency, not an optional one.'
            );
        }
        return window.masterData;
    }

    /**
     * Reads the canonical culture collection.
     *
     * This is the ONLY place State reads culture records from.
     * State never caches this array, and never writes to it.
     */
    function _readCanonicalCultures() {
        var master = _requireMasterData();

        if (!master.data) {
            // The shape of masterData is a required invariant, not something
            // State should silently paper over.
            throw new Error(
                'CultureState requires masterData.data to exist. ' +
                'Canonical storage is not initialized.'
            );
        }

        // An absent cultures array is legitimately equivalent to "no cultures".
        // Unlike a missing masterData, this is a valid empty state.
        return Array.isArray(master.data.cultures) ? master.data.cultures : [];
    }

    // =========================================================================
    // 3. INDEX REBUILDING
    // =========================================================================

    /**
     * Rebuilds all derived indexes from a canonical cultures array.
     *
     * Called by:
     *   - CultureCommands after a successful mutation
     *   - CultureState.refreshFromMasterData() after external canonical change
     *
     * NOT called by:
     *   - queries
     *   - UI
     *   - "just in case" defensive code
     *
     * @param {Array} cultures - canonical culture records
     */
    function rebuildIndexes(cultures) {
        if (!Array.isArray(cultures)) {
            throw new Error('CultureState.rebuildIndexes requires an array');
        }

        _indexes.byId.clear();
        _indexes.byName.clear();
        _indexes.byDisplayName.clear();
        _indexes.byPrimaryCultureLocation.clear();
        _indexes.byAssociatedLocation.clear();
        _indexes.byReligion.clear();

        for (var i = 0; i < cultures.length; i++) {
            var c = cultures[i];
            if (!c || !c.id) continue;

            _indexes.byId.set(c.id, c);

            _indexIntoStringMap(
                _indexes.byName,
                (c.name || '').toLowerCase().trim(),
                c
            );

            _indexIntoStringMap(
                _indexes.byDisplayName,
                (c.displayName || '').toLowerCase().trim(),
                c
            );

            // Associated locations: descriptive relationship stored on the
            // culture record itself.
            _indexIntoArrayMap(_indexes.byAssociatedLocation, c.locations, c);

            // Religion association: also stored on the culture record.
            _indexIntoArrayMap(_indexes.byReligion, c.religions, c);
        }
    }

    /**
     * Rebuilds indexes from the current canonical data.
     *
     * This exists for cases where canonical data changed outside of a
     * CultureCommands transaction (e.g. application-level reload, import,
     * or migration). Normal mutations should not call this directly —
     * they should call rebuildIndexes() with the array they just produced.
     */
    function refreshFromMasterData() {
        rebuildIndexes(_readCanonicalCultures());
    }

    // =========================================================================
    // 4. INDEX WRITE HELPERS
    // =========================================================================

    function _indexIntoStringMap(map, key, culture) {
        if (!key) return; // empty name/displayName is not an indexable key
        var bucket = map.get(key);
        if (!bucket) {
            bucket = [];
            map.set(key, bucket);
        }
        bucket.push(culture);
    }

    function _indexIntoArrayMap(map, keys, culture) {
        if (!Array.isArray(keys)) return;
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            if (!key) continue;
            var bucket = map.get(key);
            if (!bucket) {
                bucket = [];
                map.set(key, bucket);
            }
            bucket.push(culture);
        }
    }

    // =========================================================================
    // 5. INDEX ACCESS
    // =========================================================================
    //
    // State exposes narrow lookup primitives. It does NOT expose semantic
    // queries like "getCulturesForLocation()" — that interpretation belongs
    // to CultureQueries.
    //
    // Note: State deliberately does NOT expose getAllCultures(). Providing
    // it here would recreate the second-query-API problem we're refactoring
    // away from. CultureQueries reads canonical data through its own path.
    //

    function getById(id) {
        if (!id) return null;
        return _indexes.byId.get(id) || null;
    }

    function getByName(name) {
        if (!name) return [];
        return _indexes.byName.get(name.toLowerCase().trim()) || [];
    }

    function getByDisplayName(displayName) {
        if (!displayName) return [];
        return _indexes.byDisplayName.get(displayName.toLowerCase().trim()) || [];
    }

    /**
     * Cultures associated with a location via the descriptive
     * culture.locations relationship.
     *
     * This does NOT walk the location hierarchy. Hierarchy semantics belong
     * to CultureQueries, which composes this with PlaceQueries.
     */
    function getByAssociatedLocation(locationId) {
        if (!locationId) return [];
        return _indexes.byAssociatedLocation.get(locationId) || [];
    }

    /**
     * Cultures for which this location is the PRIMARY culture.
     *
     * Populated by CultureCommands / the application from Place.cultureId.
     * State does not derive it; it is told about it.
     *
     * NOTE: This accessor is present so the shape of the relationship is
     * explicit, but it depends on State being fed primary-culture data
     * during index construction. Until the Culture ↔ Location relationship
     * is finalized (see ADR discussion), this index may remain empty.
     * That is preferable to silently conflating it with byAssociatedLocation.
     */
    function getByPrimaryCultureLocation(locationId) {
        if (!locationId) return [];
        return _indexes.byPrimaryCultureLocation.get(locationId) || [];
    }

    function getByReligion(religionId) {
        if (!religionId) return [];
        return _indexes.byReligion.get(religionId) || [];
    }

    // =========================================================================
    // 6. SUBSCRIPTIONS
    // =========================================================================
    //
    // State provides the mechanism. It does NOT decide what event to emit,
    // when to emit it, or what shape it should have. That is the command
    // layer's responsibility.
    //

    function subscribe(callback) {
        if (typeof callback !== 'function') {
            throw new Error('CultureState.subscribe requires a function');
        }
        _subscribers.push(callback);
        return function unsubscribe() {
            var i = _subscribers.indexOf(callback);
            if (i !== -1) _subscribers.splice(i, 1);
        };
    }

    /**
     * Publishes an event to all subscribers.
     *
     * @param {Object} event - { type: string, ...payload }
     */
    function notify(event) {
        // Copy so that a subscriber unsubscribing during dispatch does not
        // affect the current round.
        var snapshot = _subscribers.slice();

        for (var i = 0; i < snapshot.length; i++) {
            try {
                snapshot[i](event);
            } catch (err) {
                // A broken subscriber must not prevent other subscribers
                // from receiving the event.
                _reportSubscriberError(err);
            }
        }
    }

    function _reportSubscriberError(err) {
        // Route through whatever centralized error reporting exists.
        // Silently swallowing here would hide real bugs in consumers.
        if (typeof window.reportError === 'function') {
            try { window.reportError(err); return; } catch (e) {}
        }
        if (typeof console !== 'undefined' && console.error) {
            console.error('[CultureState] subscriber error', err);
        }
    }

    // =========================================================================
    // 7. DIAGNOSTICS
    // =========================================================================

    function getIndexStats() {
        return {
            byId:                     _indexes.byId.size,
            byName:                   _indexes.byName.size,
            byDisplayName:            _indexes.byDisplayName.size,
            byPrimaryCultureLocation: _indexes.byPrimaryCultureLocation.size,
            byAssociatedLocation:     _indexes.byAssociatedLocation.size,
            byReligion:               _indexes.byReligion.size,
            subscriberCount:          _subscribers.length
        };
    }

    // =========================================================================
    // 8. PUBLIC API
    // =========================================================================

    window.CultureState = {
        // ---- Index lifecycle ----
        rebuildIndexes: rebuildIndexes,
        refreshFromMasterData: refreshFromMasterData,

        // ---- Index access (primitives) ----
        getById: getById,
        getByName: getByName,
        getByDisplayName: getByDisplayName,
        getByPrimaryCultureLocation: getByPrimaryCultureLocation,
        getByAssociatedLocation: getByAssociatedLocation,
        getByReligion: getByReligion,

        // ---- Subscriptions ----
        subscribe: subscribe,
        notify: notify,

        // ---- Diagnostics ----
        getIndexStats: getIndexStats
    };

    // =========================================================================
    // 9. INITIAL BUILD
    // =========================================================================
    //
    // Attempt an initial build if canonical data already exists. If it does
    // not, indexes remain empty and refreshFromMasterData() can be called
    // later. State must be loadable before masterData is ready.
    //
    // Note: this does not throw when masterData is absent — empty indexes are
    // a legitimate initial state. It only throws when someone actually asks
    // State to read canonical data that the application claimed existed.
    //

    try {
        if (typeof window.masterData !== 'undefined' &&
            window.masterData && window.masterData.data) {
            refreshFromMasterData();
        }
    } catch (err) {
        _reportSubscriberError(err);
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CultureState;
    }

})();
