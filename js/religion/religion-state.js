/**
 * =============================================================================
 * STILL WATERS - RELIGION STATE (religion-state.js)
 * =============================================================================
 *
 * LOCATION: js/core/religion/religion-state.js
 *
 * Derived indexes, subscriptions, and mutation primitives for religion data.
 *
 * This module is deliberately boring.
 *
 * It owns:
 *   - derived lookup indexes (byId, byTrait, byLocation, byLeader, followers,
 *     gods, laws, places of worship)
 *   - mutation primitives that write canonical data and re-hydrate indexes
 *   - a subscription mechanism
 *
 * It does NOT own:
 *   - religion records                  (masterData.data.religions)
 *   - persistence                      (ReligionCommands.persist is the
 *                                        single save site)
 *   - mutation policy                  (ReligionCommands; the primitives here
 *                                        are the mechanism, not the decision)
 *   - queries                          (ReligionQueries)
 *   - domain rules                     (ReligionRules)
 *   - validation                       (ReligionValidation)
 *   - UI state                         (ReligionUIState)
 *   - presentation                     (ReligionViewModels / ReligionRender)
 *
 * Read/write contract:
 *
 *     getById(id)                   → clone (public, safe)
 *     getByTrait(trait)             → clones
 *     getByLocation(locationId)     → clones
 *     getByLeader(characterId)      → clone
 *     getFollowersByReligion(id)    → array of live character records
 *                                     (character records are owned by the
 *                                     character domain; cloning them here
 *                                     would create a false impression that
 *                                     mutation was safe)
 *     getGodById(id)                → clone
 *     getLawById(id)                → clone
 *     getPlaceOfWorshipById(id)     → clone
 *     _getReligionCanonical(id)     → live record (commands only)
 *     _getGodCanonical(id)          → live record (commands only)
 *     _getLawCanonical(id)          → live record (commands only)
 *
 *     _addReligion(religion)        → commands only
 *     _updateReligion(id, record)   → commands only
 *     _removeReligion(id)           → commands only
 *
 * Cross-domain:
 *   - Followers index reads character records via accessors.getCharacters.
 *     That is a declared dependency. See header note on getFollowersByReligion.
 *   - invalidateFollowerIndex() is exposed for the character domain to call
 *     when a character's religionId changes. Do not call it from religion
 *     mutation primitives — those already re-hydrate everything.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Phase 3 (previous): removed _state.religions, moved semantic queries to
 *     ReligionQueries, renamed cache → indexes, added notify().
 *   Phase 7 (current): converge to the rank/role/relationship/education
 *     reference pattern:
 *       - hydrateFromMasterData replaces rebuildIndexes
 *       - public reads return clones
 *       - _getXCanonical accessors added for commands
 *       - mutation primitives added (_addReligion / _updateReligion /
 *         _removeReligion) so Commands stop touching masterData directly
 *       - duplicate-id detection on hydrate
 *       - validateIntegrity for bootstrap
 *       - publish(eventName, data) replaces notify(event)
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. STATE STRUCTURE
    // =========================================================================

    // No canonical religion records here. Only subscribers.
    var _subscribers = [];

    // Derived indexes. Rebuildable from masterData.data.religions and
    // character records. Never persisted as canonical data.
    var _indexes = {
        byId: new Map(),
        byTrait: new Map(),
        byLocation: new Map(),
        byLeader: new Map(),
        followersByReligion: new Map(),
        godsById: new Map(),
        lawsById: new Map(),
        placesOfWorshipById: new Map()
    };

    var _initialized = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCharacters() {
        // Required dependency. Throws if missing.
        if (typeof window.getCharacters !== 'function') {
            throw new Error(
                'ReligionState requires accessors.getCharacters. ' +
                'Check script order or dependency wiring.'
            );
        }
        return window.getCharacters();
    }

    function _getCanonicalReligionsArray() {
        // Reads from the canonical store. Returns the live array.
        // State never owns a copy of this.
        if (!window.masterData || !window.masterData.data) {
            return null;
        }
        if (!Array.isArray(window.masterData.data.religions)) {
            // Canonical store hasn't been initialized. Distinguish
            // "not ready" (null) from "empty" ([]).
            return null;
        }
        return window.masterData.data.religions;
    }

    function _markDirty() {
        if (typeof window.markDataDirty === 'function') {
            try { window.markDataDirty(); return; } catch (e) { /* fall through */ }
        }
        // Non-fatal. markDataDirty is a persistence hint, not the save itself.
    }

    // =========================================================================
    // 3. CLONE
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

    function _cloneArray(list) {
        if (!list) return [];
        var out = new Array(list.length);
        for (var i = 0; i < list.length; i++) out[i] = _clone(list[i]);
        return out;
    }

    // =========================================================================
    // 4. HYDRATION
    // =========================================================================

    /**
     * Rebuilds all derived indexes from canonical data.
     *
     * Called by:
     *   - ReligionCommands at the end of every mutation (via _commit)
     *   - ReligionBootstrap.init() at page load
     *   - ReligionState mutation primitives (after write)
     *   - Application-level reload / import
     *
     * NOT called by:
     *   - queries (they read; they don't mutate)
     *   - UI
     *
     * Returns true on success, false if canonical data is not yet ready.
     * Throws on duplicate ids (corrupted canonical data).
     */
    function hydrateFromMasterData() {
        var religions = _getCanonicalReligionsArray();

        if (religions === null) {
            // Canonical store not ready. Do not clear indexes, do not fake
            // empty data. Leave previous indexes intact and let the caller
            // decide when to retry.
            return false;
        }

        _indexes.byId = new Map();
        _indexes.byTrait = new Map();
        _indexes.byLocation = new Map();
        _indexes.byLeader = new Map();
        _indexes.godsById = new Map();
        _indexes.lawsById = new Map();
        _indexes.placesOfWorshipById = new Map();
        _indexes.followersByReligion = new Map();

        var seenIds = Object.create(null);

        for (var i = 0; i < religions.length; i++) {
            var religion = religions[i];
            if (!religion || !religion.id) continue;

            if (seenIds[religion.id]) {
                throw new Error(
                    'ReligionState.hydrateFromMasterData: duplicate religion id "' +
                    religion.id + '". Canonical data is corrupted.'
                );
            }
            seenIds[religion.id] = true;

            _indexes.byId.set(religion.id, religion);

            if (religion.trait) {
                if (!_indexes.byTrait.has(religion.trait)) {
                    _indexes.byTrait.set(religion.trait, []);
                }
                _indexes.byTrait.get(religion.trait).push(religion);
            }

            if (Array.isArray(religion.locations)) {
                for (var j = 0; j < religion.locations.length; j++) {
                    var locationId = religion.locations[j];
                    if (!locationId) continue;
                    if (!_indexes.byLocation.has(locationId)) {
                        _indexes.byLocation.set(locationId, []);
                    }
                    _indexes.byLocation.get(locationId).push(religion);
                }
            }

            if (religion.leader && religion.leader.characterId) {
                _indexes.byLeader.set(religion.leader.characterId, religion);
            }

            if (Array.isArray(religion.gods)) {
                for (var k = 0; k < religion.gods.length; k++) {
                    var god = religion.gods[k];
                    if (god && god.id) {
                        _indexes.godsById.set(god.id, god);
                    }
                }
            }

            if (Array.isArray(religion.laws)) {
                for (var l = 0; l < religion.laws.length; l++) {
                    var law = religion.laws[l];
                    if (law && law.id) {
                        _indexes.lawsById.set(law.id, law);
                    }
                }
            }

            if (Array.isArray(religion.placesOfWorship)) {
                for (var m = 0; m < religion.placesOfWorship.length; m++) {
                    var placeId = religion.placesOfWorship[m];
                    if (placeId) {
                        _indexes.placesOfWorshipById.set(placeId, {
                            religionId: religion.id,
                            religionName: religion.name
                        });
                    }
                }
            }
        }

        _buildFollowersIndex();

        return true;
    }

    /**
     * Deprecated alias for hydrateFromMasterData().
     * Kept so any un-migrated caller during the refactor does not break.
     */
    function rebuildIndexes() {
        return hydrateFromMasterData();
    }

    /**
     * Deprecated alias for hydrateFromMasterData().
     */
    function refreshFromMasterData() {
        var ok = hydrateFromMasterData();
        if (ok) {
            _initialized = true;
            publish('refresh', null);
        }
        return ok;
    }

    function _buildFollowersIndex() {
        // Cross-domain: reads character records. Character records are owned
        // by the character domain. This index is derived state that declares
        // a dependency on that domain.
        _indexes.followersByReligion = new Map();

        var characters = _getCharacters();

        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];
            if (char && char.religionId) {
                if (!_indexes.followersByReligion.has(char.religionId)) {
                    _indexes.followersByReligion.set(char.religionId, []);
                }
                _indexes.followersByReligion.get(char.religionId).push(char);
            }
        }
    }

    /**
     * Rebuilds only the follower index. Called by the character domain when a
     * character's religionId changes. Do not call from religion mutation
     * primitives — those already re-hydrate everything.
     */
    function _invalidateFollowerIndex() {
        _buildFollowersIndex();
    }

    // =========================================================================
    // 5. PUBLIC READS (clones)
    // =========================================================================

    function getById(id) {
        if (!id) return null;
        var rec = _indexes.byId.get(id);
        return rec ? _clone(rec) : null;
    }

    function getByTrait(trait) {
        if (!trait) return [];
        return _cloneArray(_indexes.byTrait.get(trait) || []);
    }

    function getByLocation(locationId) {
        if (!locationId) return [];
        return _cloneArray(_indexes.byLocation.get(locationId) || []);
    }

    function getByLeader(characterId) {
        if (!characterId) return null;
        var rec = _indexes.byLeader.get(characterId);
        return rec ? _clone(rec) : null;
    }

    /**
     * Followers of a religion. Returns live character records.
     *
     * Character records are owned by the character domain. Cloning them here
     * would create a false impression that mutation is safe. Callers who want
     * a snapshot should deep-clone themselves.
     */
    function getFollowersByReligion(religionId) {
        if (!religionId) return [];
        var list = _indexes.followersByReligion.get(religionId) || [];
        return list.slice();
    }

    function getGodById(id) {
        if (!id) return null;
        var rec = _indexes.godsById.get(id);
        return rec ? _clone(rec) : null;
    }

    function getLawById(id) {
        if (!id) return null;
        var rec = _indexes.lawsById.get(id);
        return rec ? _clone(rec) : null;
    }

    function getPlaceOfWorshipById(placeId) {
        if (!placeId) return null;
        var rec = _indexes.placesOfWorshipById.get(placeId);
        return rec ? _clone(rec) : null;
    }

    // Deprecated: exposes the live Map wrappers. Kept only for any remaining
    // caller during the migration. New code must use the named getters.
    function getIndexes() {
        return _indexes;
    }

    // =========================================================================
    // 6. CANONICAL READS (live records — commands only)
    // =========================================================================

    function _getReligionCanonical(id) {
        if (!id) return null;
        return _indexes.byId.get(id) || null;
    }

    function _getGodCanonical(id) {
        if (!id) return null;
        return _indexes.godsById.get(id) || null;
    }

    function _getLawCanonical(id) {
        if (!id) return null;
        return _indexes.lawsById.get(id) || null;
    }

    // =========================================================================
    // 7. MUTATION PRIMITIVES (commands only)
    // =========================================================================
    //
    // These are the mechanism, not the decision. ReligionCommands decides
    // what to write and when; State executes and re-hydrates.
    //
    // Every primitive:
    //   - mutates masterData.data.religions
    //   - re-hydrates indexes
    //   - marks data dirty
    //
    // Every primitive throws on missing canonical data, missing ids, or
    // id mismatches. Corruption must be loud.
    //

    function _addReligion(religion) {
        if (!religion || !religion.id) {
            throw new Error('ReligionState._addReligion requires a religion with an id.');
        }

        var religions = _getCanonicalReligionsArray();
        if (religions === null) {
            throw new Error(
                'ReligionState._addReligion: canonical store not initialized.'
            );
        }

        if (_indexes.byId.has(religion.id)) {
            throw new Error(
                'ReligionState._addReligion: religion id already exists: ' + religion.id
            );
        }

        religions.push(religion);
        hydrateFromMasterData();
        _markDirty();
        return religion;
    }

    function _updateReligion(id, religion) {
        if (!id) {
            throw new Error('ReligionState._updateReligion requires an id.');
        }
        if (!religion || !religion.id) {
            throw new Error('ReligionState._updateReligion requires a religion with an id.');
        }
        if (religion.id !== id) {
            throw new Error(
                'ReligionState._updateReligion: id mismatch (' + id + ' vs ' + religion.id + ').'
            );
        }

        var religions = _getCanonicalReligionsArray();
        if (religions === null) {
            throw new Error(
                'ReligionState._updateReligion: canonical store not initialized.'
            );
        }

        var index = -1;
        for (var i = 0; i < religions.length; i++) {
            if (religions[i] && religions[i].id === id) {
                index = i;
                break;
            }
        }
        if (index === -1) {
            throw new Error('ReligionState._updateReligion: religion not found: ' + id);
        }

        religions[index] = religion;
        hydrateFromMasterData();
        _markDirty();
        return religion;
    }

    function _removeReligion(id) {
        if (!id) {
            throw new Error('ReligionState._removeReligion requires an id.');
        }

        var religions = _getCanonicalReligionsArray();
        if (religions === null) {
            throw new Error(
                'ReligionState._removeReligion: canonical store not initialized.'
            );
        }

        var index = -1;
        for (var i = 0; i < religions.length; i++) {
            if (religions[i] && religions[i].id === id) {
                index = i;
                break;
            }
        }
        if (index === -1) {
            throw new Error('ReligionState._removeReligion: religion not found: ' + id);
        }

        var removed = religions[index];
        religions.splice(index, 1);
        hydrateFromMasterData();
        _markDirty();
        return removed;
    }

    // =========================================================================
    // 8. SUBSCRIPTIONS
    // =========================================================================

    function subscribe(callback) {
        if (typeof callback !== 'function') return null;

        _subscribers.push(callback);

        return function unsubscribe() {
            var index = _subscribers.indexOf(callback);
            if (index !== -1) {
                _subscribers.splice(index, 1);
            }
        };
    }

    /**
     * Publishes an event to all subscribers.
     *
     * @param {string} eventName
     * @param {*} data
     */
    function publish(eventName, data) {
        var event = {
            type: eventName,
            data: data,
            timestamp: Date.now()
        };
        var snapshot = _subscribers.slice();
        for (var i = 0; i < snapshot.length; i++) {
            try {
                snapshot[i](event);
            } catch (e) {
                _reportSubscriberError(e);
            }
        }
    }

    /**
     * Deprecated alias for publish(). Some old callers used notify(event).
     */
    function notify(event) {
        if (!event || typeof event.type !== 'string') {
            publish('unknown', event);
            return;
        }
        // Strip the old shape and re-publish in the new form so subscribers
        // see a consistent event object.
        publish(event.type, event.data !== undefined ? event.data : null);
    }

    function _reportSubscriberError(err) {
        if (typeof window.reportError === 'function') {
            try { window.reportError(err); return; } catch (e) { /* fall through */ }
        }
        if (typeof console !== 'undefined' && console.error) {
            console.error('[ReligionState] subscriber error', err);
        }
    }

    // =========================================================================
    // 9. INTEGRITY / DIAGNOSTICS
    // =========================================================================

    /**
     * Warn-only integrity check. Called by ReligionBootstrap.init().
     * Returns an array of {level, message}. Never throws.
     */
    function validateIntegrity() {
        var findings = [];

        var religions;
        try {
            religions = _getCanonicalReligionsArray();
        } catch (e) {
            findings.push({ level: 'error', message: e.message });
            return findings;
        }

        if (religions === null) {
            findings.push({
                level: 'info',
                message: 'Canonical religion store not initialized yet.'
            });
            return findings;
        }

        if (religions.length === 0) {
            findings.push({
                level: 'info',
                message: 'No religions defined. This is a valid initial state.'
            });
            return findings;
        }

        var seenIds = Object.create(null);
        var orphanLeaders = 0;

        for (var i = 0; i < religions.length; i++) {
            var r = religions[i];
            if (!r) {
                findings.push({ level: 'warn', message: 'Null religion at index ' + i });
                continue;
            }
            if (!r.id) {
                findings.push({ level: 'error', message: 'Religion at index ' + i + ' has no id' });
                continue;
            }
            if (seenIds[r.id]) {
                findings.push({ level: 'error', message: 'Duplicate religion id: ' + r.id });
            }
            seenIds[r.id] = true;

            if (typeof r.name !== 'string' || r.name.length === 0) {
                findings.push({ level: 'warn', message: 'Religion ' + r.id + ' has no name' });
            }

            if (r.leader && !r.leader.characterId) {
                orphanLeaders++;
            }
        }

        if (orphanLeaders > 0) {
            findings.push({
                level: 'warn',
                message: orphanLeaders + ' religion(s) have a leader record with no characterId.'
            });
        }

        return findings;
    }

    function getIndexStats() {
        return {
            byId:                 _indexes.byId.size,
            byTrait:              _indexes.byTrait.size,
            byLocation:           _indexes.byLocation.size,
            byLeader:             _indexes.byLeader.size,
            followersByReligion:  _indexes.followersByReligion.size,
            godsById:             _indexes.godsById.size,
            lawsById:             _indexes.lawsById.size,
            placesOfWorshipById:  _indexes.placesOfWorshipById.size,
            subscriberCount:      _subscribers.length
        };
    }

    // =========================================================================
    // 10. INITIAL BUILD
    // =========================================================================
    //
    // Attempt an initial build if canonical data already exists. If it does
    // not, indexes remain empty and ReligionBootstrap.init() (or an explicit
    // refreshFromMasterData call) will hydrate later.
    //
    // The retry-on-DOM-ready pattern from the previous version is retained
    // because it was load-bearing for pages where scripts load before data.
    //

    function _init() {
        if (_initialized) return;

        var ok = hydrateFromMasterData();
        if (ok) {
            _initialized = true;
            return;
        }

        // Canonical store not ready. Retry on DOM ready, then on window load.
        if (typeof document !== 'undefined') {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', _init);
            } else {
                setTimeout(_init, 0);
            }
        }
    }

    _init();

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('load', function() {
            if (!_initialized) _init();
        });
    }

    // =========================================================================
    // 11. LOAD-TIME VERIFICATION
    // =========================================================================

    (function _verifyLoadTimeDependencies() {
        if (typeof window.getCharacters !== 'function') {
            throw new Error(
                'religion-state.js loaded but window.getCharacters is missing. ' +
                'Check script tag order (accessors.js must load first).'
            );
        }
    })();

    // =========================================================================
    // 12. PUBLIC API
    // =========================================================================

    window.ReligionState = {
        // ---- Lifecycle ----
        hydrateFromMasterData: hydrateFromMasterData,
        rebuildIndexes: rebuildIndexes,          // deprecated alias
        refreshFromMasterData: refreshFromMasterData, // deprecated alias

        // ---- Public reads (clones) ----
        getById: getById,
        getByTrait: getByTrait,
        getByLocation: getByLocation,
        getByLeader: getByLeader,
        getFollowersByReligion: getFollowersByReligion,
        getGodById: getGodById,
        getLawById: getLawById,
        getPlaceOfWorshipById: getPlaceOfWorshipById,

        // ---- Deprecated: raw index access ----
        getIndexes: getIndexes,

        // ---- Canonical reads (commands only) ----
        _getReligionCanonical: _getReligionCanonical,
        _getGodCanonical: _getGodCanonical,
        _getLawCanonical: _getLawCanonical,

        // ---- Mutation primitives (commands only) ----
        _addReligion: _addReligion,
        _updateReligion: _updateReligion,
        _removeReligion: _removeReligion,

        // ---- Subscriptions ----
        subscribe: subscribe,
        publish: publish,
        notify: notify,                          // deprecated alias

        // ---- Cross-domain refresh ----
        invalidateFollowerIndex: _invalidateFollowerIndex,

        // ---- Diagnostics ----
        validateIntegrity: validateIntegrity,
        getIndexStats: getIndexStats
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ReligionState: window.ReligionState };
    }

})();
