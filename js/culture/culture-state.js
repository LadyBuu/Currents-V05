/**
 * =============================================================================
 * STILL WATERS - CULTURE STATE
 * js/culture/culture-state.js
 * =============================================================================
 *
 * Derived indexes, subscriptions, and mutation primitives for culture data.
 *
 * This module is deliberately boring.
 *
 * It owns:
 *   - derived lookup indexes (byId, byName, byDisplayName, etc.)
 *   - a subscription mechanism for interested consumers
 *   - mutation primitives that mutate the canonical array and rebuild indexes
 *   - a way to hydrate indexes from canonical culture data
 *
 * It does NOT own:
 *   - culture records                  (masterData.data.cultures)
 *   - persistence                      (saveMasterData; see CultureCommands.persist)
 *   - mutation policy                  (CultureCommands; the primitives here are
 *                                       the mechanism, not the decision)
 *   - queries                          (CultureQueries)
 *   - domain vocabulary                (appearance, mythology, etc.)
 *   - presentation                     (CultureViewModels / CultureUI)
 *
 * Relationship to canonical data:
 *
 *     masterData.data.cultures
 *             │
 *             ├── CultureCommands ──── validate → mutate via primitives
 *             │                        → hydrate → markDirty → publish
 *             │                        → persist (single save site)
 *             │
 *             ├── CultureQueries ───── read / interpret (clones)
 *             │
 *             └── CultureState ─────── index + primitives
 *
 * Read/write contract:
 *
 *     getById(id)                 → clone (public, safe)
 *     getByName(name)             → clones
 *     getByDisplayName(name)      → clones
 *     getByAssociatedLocation(id) → clones
 *     getByReligion(id)           → clones
 *     _getCultureCanonical(id)    → live record (commands + hierarchy only)
 *
 *     _addCulture(culture)        → commands only
 *     _updateCulture(id, culture) → commands only
 *     _removeCulture(id)          → commands only
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
     *
     * Note the absence of `byPrimaryCultureLocation`: that relationship
     * lives on `Place.cultureId`, not on the culture record. Indexing it
     * here would require State to read Place data, which is not its job.
     * CultureQueries walks the hierarchy instead.
     */
    var _indexes = {
        byId:                 new Map(),
        byName:               new Map(),  // name  -> [culture, ...]
        byDisplayName:        new Map(),  // label -> [culture, ...]
        byAssociatedLocation: new Map(),  // locationId -> [culture, ...]
        byReligion:           new Map()   // religionId -> [culture, ...]
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
     * State never caches this array, and never writes to it — mutation
     * goes through the primitives, which write to it and then re-hydrate.
     */
    function _readCanonicalCultures() {
        var master = _requireMasterData();

        if (!master.data) {
            throw new Error(
                'CultureState requires masterData.data to exist. ' +
                'Canonical storage is not initialized.'
            );
        }

        // An absent cultures array is legitimately equivalent to "no cultures".
        // Unlike a missing masterData, this is a valid empty state.
        return Array.isArray(master.data.cultures) ? master.data.cultures : [];
    }

    function _markDirty() {
        if (typeof window.markDataDirty === 'function') {
            try { window.markDataDirty(); return; } catch (e) { /* fall through */ }
        }
        // No fatal error: markDataDirty is the persistence hint, not the
        // persistence itself. Commands still call persist() explicitly.
    }

    // =========================================================================
    // 3. HYDRATION
    // =========================================================================

    /**
     * Rebuilds all derived indexes from the canonical cultures array.
     *
     * Called by:
     *   - CultureCommands after a successful mutation
     *   - CultureState._addCulture / _updateCulture / _removeCulture
     *   - CultureBootstrap.init() at load time
     *   - Application-level reload / import
     *
     * NOT called by:
     *   - queries (they read; they don't mutate)
     *   - UI
     *   - "just in case" defensive code
     *
     * Throws on duplicate ids. A duplicate id is corrupted canonical data,
     * and silently picking the first occurrence would hide the corruption.
     */
    function hydrateFromMasterData() {
        var cultures = _readCanonicalCultures();

        _indexes.byId.clear();
        _indexes.byName.clear();
        _indexes.byDisplayName.clear();
        _indexes.byAssociatedLocation.clear();
        _indexes.byReligion.clear();

        var seenIds = Object.create(null);

        for (var i = 0; i < cultures.length; i++) {
            var c = cultures[i];
            if (!c || !c.id) continue;

            if (seenIds[c.id]) {
                throw new Error(
                    'CultureState.hydrateFromMasterData: duplicate culture id "' +
                    c.id + '". Canonical data is corrupted.'
                );
            }
            seenIds[c.id] = true;

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
     * Deprecated alias for hydrateFromMasterData().
     *
     * Kept so any un-migrated caller during the refactor does not break.
     * New code should call hydrateFromMasterData().
     */
    function refreshFromMasterData() {
        hydrateFromMasterData();
    }

    // =========================================================================
    // 4. INDEX WRITE HELPERS
    // =========================================================================

    function _indexIntoStringMap(map, key, culture) {
        if (!key) return;
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
    // 5. CLONE
    // =========================================================================

    function _clone(value) {
        if (value === null || typeof value !== 'object') return value;
        if (Array.isArray(value)) {
            var arr = new Array(value.length);
            for (var i = 0; i < value.length; i++) arr[i] = _clone(value[i]);
            return arr;
        }
        var out = {};
        for (var k in value) {
            if (Object.prototype.hasOwnProperty.call(value, k)) {
                out[k] = _clone(value[k]);
            }
        }
        return out;
    }

    // =========================================================================
    // 6. PUBLIC READS (clones)
    // =========================================================================

    function getById(id) {
        if (!id) return null;
        var rec = _indexes.byId.get(id);
        return rec ? _clone(rec) : null;
    }

    function getByName(name) {
        if (!name) return [];
        var list = _indexes.byName.get(name.toLowerCase().trim()) || [];
        return _cloneArray(list);
    }

    function getByDisplayName(displayName) {
        if (!displayName) return [];
        var list = _indexes.byDisplayName.get(displayName.toLowerCase().trim()) || [];
        return _cloneArray(list);
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
        var list = _indexes.byAssociatedLocation.get(locationId) || [];
        return _cloneArray(list);
    }

    function getByReligion(religionId) {
        if (!religionId) return [];
        var list = _indexes.byReligion.get(religionId) || [];
        return _cloneArray(list);
    }

    function _cloneArray(list) {
        var out = new Array(list.length);
        for (var i = 0; i < list.length; i++) out[i] = _clone(list[i]);
        return out;
    }

    // =========================================================================
    // 7. CANONICAL READS (live records — commands only)
    // =========================================================================

    /**
     * Returns the live canonical record for a culture.
     *
     * Reserved for CultureCommands and (via CultureQueries) the hierarchy
     * module during a transaction. Every other consumer must use getById(),
     * which returns a clone.
     */
    function _getCultureCanonical(id) {
        if (!id) return null;
        return _indexes.byId.get(id) || null;
    }

    // =========================================================================
    // 8. MUTATION PRIMITIVES
    // =========================================================================
    //
    // These are the mechanism, not the decision. CultureCommands decides
    // what to write and when; State executes and re-hydrates.
    //
    // Every primitive:
    //   - mutates masterData.data.cultures
    //   - re-hydrates indexes
    //   - marks data dirty (for the save prompt / autosave hint)
    //
    // Every primitive is idempotent from a "safe to call twice" perspective
    // only in the sense that a no-op write re-hydrates without corrupting.
    // Callers must not call them with the intent "maybe I'll do something."
    //

    function _addCulture(culture) {
        if (!culture || !culture.id) {
            throw new Error('CultureState._addCulture requires a culture with an id.');
        }
        var cultures = _readCanonicalCultures();
        if (_indexes.byId.has(culture.id)) {
            throw new Error(
                'CultureState._addCulture: culture id already exists: ' + culture.id
            );
        }
        cultures.push(culture);
        hydrateFromMasterData();
        _markDirty();
        return culture;
    }

    function _updateCulture(id, culture) {
        if (!id) {
            throw new Error('CultureState._updateCulture requires an id.');
        }
        if (!culture || !culture.id) {
            throw new Error('CultureState._updateCulture requires a culture with an id.');
        }
        if (culture.id !== id) {
            throw new Error(
                'CultureState._updateCulture: id mismatch (' + id + ' vs ' + culture.id + ').'
            );
        }
        var cultures = _readCanonicalCultures();
        var index = _findIndex(cultures, id);
        if (index === -1) {
            throw new Error('CultureState._updateCulture: culture not found: ' + id);
        }
        cultures[index] = culture;
        hydrateFromMasterData();
        _markDirty();
        return culture;
    }

    function _removeCulture(id) {
        if (!id) {
            throw new Error('CultureState._removeCulture requires an id.');
        }
        var cultures = _readCanonicalCultures();
        var index = _findIndex(cultures, id);
        if (index === -1) {
            throw new Error('CultureState._removeCulture: culture not found: ' + id);
        }
        var removed = cultures[index];
        cultures.splice(index, 1);
        hydrateFromMasterData();
        _markDirty();
        return removed;
    }

    function _findIndex(cultures, id) {
        for (var i = 0; i < cultures.length; i++) {
            if (cultures[i] && cultures[i].id === id) return i;
        }
        return -1;
    }

    // =========================================================================
    // 9. SUBSCRIPTIONS
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
     * @param {string} eventName
     * @param {*} data - payload. Usually the affected culture record.
     */
    function publish(eventName, data) {
        var event = { type: eventName, data: data };
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
        if (typeof window.reportError === 'function') {
            try { window.reportError(err); return; } catch (e) {}
        }
        if (typeof console !== 'undefined' && console.error) {
            console.error('[CultureState] subscriber error', err);
        }
    }

    // =========================================================================
    // 10. INTEGRITY / DIAGNOSTICS
    // =========================================================================

    /**
     * Warn-only integrity check. Called by CultureBootstrap.init().
     *
     * Returns a list of { level, message } findings. Never throws.
     */
    function validateIntegrity() {
        var findings = [];

        var cultures;
        try {
            cultures = _readCanonicalCultures();
        } catch (err) {
            findings.push({ level: 'error', message: err.message });
            return findings;
        }

        if (cultures.length === 0) {
            findings.push({
                level: 'info',
                message: 'No cultures defined. This is a valid initial state.'
            });
            return findings;
        }

        var seenIds = Object.create(null);

        for (var i = 0; i < cultures.length; i++) {
            var c = cultures[i];
            if (!c) {
                findings.push({ level: 'warn', message: 'Null culture at index ' + i });
                continue;
            }
            if (!c.id) {
                findings.push({ level: 'error', message: 'Culture at index ' + i + ' has no id' });
                continue;
            }
            if (seenIds[c.id]) {
                findings.push({ level: 'error', message: 'Duplicate culture id: ' + c.id });
            }
            seenIds[c.id] = true;

            if (typeof c.name !== 'string' || c.name.length === 0) {
                findings.push({ level: 'warn', message: 'Culture ' + c.id + ' has no name' });
            }
        }

        return findings;
    }

    function getIndexStats() {
        return {
            byId:                 _indexes.byId.size,
            byName:               _indexes.byName.size,
            byDisplayName:        _indexes.byDisplayName.size,
            byAssociatedLocation: _indexes.byAssociatedLocation.size,
            byReligion:           _indexes.byReligion.size,
            subscriberCount:      _subscribers.length
        };
    }

    // =========================================================================
    // 11. PUBLIC API
    // =========================================================================

    window.CultureState = {
        // ---- Lifecycle ----
        hydrateFromMasterData: hydrateFromMasterData,
        refreshFromMasterData: refreshFromMasterData,  // deprecated alias

        // ---- Public reads (clones) ----
        getById: getById,
        getByName: getByName,
        getByDisplayName: getByDisplayName,
        getByAssociatedLocation: getByAssociatedLocation,
        getByReligion: getByReligion,

        // ---- Canonical reads (commands only) ----
        _getCultureCanonical: _getCultureCanonical,

        // ---- Mutation primitives (commands only) ----
        _addCulture: _addCulture,
        _updateCulture: _updateCulture,
        _removeCulture: _removeCulture,

        // ---- Subscriptions ----
        subscribe: subscribe,
        publish: publish,

        // ---- Diagnostics ----
        validateIntegrity: validateIntegrity,
        getIndexStats: getIndexStats
    };

    // =========================================================================
    // 12. INITIAL BUILD
    // =========================================================================
    //
    // Attempt an initial build if canonical data already exists. If it does
    // not, indexes remain empty and hydrateFromMasterData() can be called
    // later. State must be loadable before masterData is ready.
    //
    // Bootstrap calls init explicitly when the load order is correct.
    // This fallback exists only for the case where masterData is available
    // before bootstrap runs (e.g. a page that inlines data).
    //

    try {
        if (typeof window.masterData !== 'undefined' &&
            window.masterData && window.masterData.data) {
            hydrateFromMasterData();
        }
    } catch (err) {
        _reportSubscriberError(err);
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CultureState;
    }

})();
