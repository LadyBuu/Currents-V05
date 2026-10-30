/**
 * =============================================================================
 * STILL WATERS - RELIGION STATE (religion-state.js)
 * =============================================================================
 *
 * LOCATION: js/religion/religion-state.js
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
 * CANONICAL ARRAY OWNERSHIP
 * -------------------------
 *   masterData.data.religions is the canonical store. This module DOES
 *   NOT hold a permanent reference to that array. Every mutation
 *   primitive reassigns masterData.data.religions to a NEW array
 *   (built via slice of the freshly-mutated working copy). Callers
 *   that captured the array reference before a mutation see a stale
 *   array, not a mutated one — same guarantee role-state.js provides
 *   via `masterData.data.roles = _roles.slice()`.
 *
 *   Prior revisions called religions.push(religion) / religions.splice()
 *   on the live array. A caller holding `masterData.data.religions` and
 *   iterating it during a mutation saw the array change mid-iteration
 *   (skipped records, out-of-bounds reads). Same bug class the
 *   settlement-queries.js SETTLEMENT DATA ACCESS CONTRACT flagged and
 *   role-state.js fixed.
 *
 * READ/WRITE CONTRACT
 * -------------------
 *     getById(id)                   → clone (public, safe)
 *     getByTrait(trait)             → clones
 *     getByLocation(locationId)     → clones
 *     getByLeader(characterId)      → clone
 *     getFollowersByReligion(id)    → slice() of live records the
 *                                     follower index holds (character
 *                                     domain owns them; cloned reads
 *                                     happen at religion-queries.js)
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
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - _addReligion / _updateReligion / _removeReligion no longer
 *       mutate masterData.data.religions in place. Every primitive
 *       builds a working copy, mutates the copy, then assigns
 *       masterData.data.religions = workingCopy. Stale references held
 *       by callers (including the enumerator used by
 *       religion-queries.js::_enumerateCanonicalReligions) are now
 *       snapshots, not aliases. Same guarantee role-state.js provides.
 *     - _getReligionCanonical / _getGodCanonical / _getLawCanonical
 *       continue to return the LIVE record the caller can mutate, but
 *       that record lives inside the working copy that gets reassigned
 *       — so mutating it via a canonical read is only safe if the
 *       caller immediately calls _updateReligion with the (re-built)
 *       copy. This was already the contract; the reassignment makes it
 *       observable in the by-reference case (a caller holding the old
 *       reference sees the OLD record, not the current one).
 *     - Header CANONICAL ARRAY OWNERSHIP section added.
 *     - _notifySubscriberError now routes through window.reportError
 *       when available (SettlementState's pattern) before falling back
 *       to console.error. Same diagnostic surface across domains.
 *     - No behavioral change to hydrateFromMasterData, the mutation
 *       policy, the subscriptions, or the diagnostics.
 *   Previous revisions:
 *     - Phase 3: removed _state.religions; renamed cache → indexes.
 *     - Phase 7: hydrateFromMasterData; public reads return clones;
 *       _getXCanonical accessors added; mutation primitives added;
 *       duplicate-id detection on hydrate; validateIntegrity;
 *       publish(eventName, data).
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. STATE STRUCTURE
    // =========================================================================

    // No canonical religion records held here. Only subscribers.
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
        if (typeof window.getCharacters !== 'function') {
            throw new Error(
                'ReligionState requires accessors.getCharacters. ' +
                'Check script order or dependency wiring.'
            );
        }
        return window.getCharacters();
    }

    function _getCanonicalReligionsArray() {
        // Reads from the canonical store. Returns whatever the current
        // array reference is. After any mutation primitive runs, this
        // is a NEW array; callers holding a prior reference have a
        // snapshot. See CANONICAL ARRAY OWNERSHIP in the header.
        if (!window.masterData || !window.masterData.data) {
            return null;
        }
        if (!Array.isArray(window.masterData.data.religions)) {
            // "Not ready" (null) is distinct from "empty" ([]).
            return null;
        }
        return window.masterData.data.religions;
    }

    function _setCanonicalReligionsArray(newArray) {
        // Reassign rather than mutate-in-place. Every mutation primitive
        // calls this with a working copy. See CANONICAL ARRAY OWNERSHIP.
        if (!window.masterData || !window.masterData.data) {
            throw new Error(
                'ReligionState: masterData.data is not available. ' +
                'Cannot write canonical religions.'
            );
        }
        window.masterData.data.religions = newArray;
    }

    function _markDirty() {
        if (typeof window.markDataDirty === 'function') {
            try { window.markDataDirty(); return; } catch (e) { /* fall through */ }
        }
        // Non-fatal. markDataDirty is a persistence hint, not the save.
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
     *   - ReligionCommands at the end of every mutation (via the State
     *     mutation primitive, which is called by the command)
     *   - ReligionBootstrap.init() at page load
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
            // Canonical store not ready. Leave previous indexes intact
            // and let the caller decide when to retry.
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

    function rebuildIndexes() {
        return hydrateFromMasterData();
    }

    function refreshFromMasterData() {
        var ok = hydrateFromMasterData();
        if (ok) {
            _initialized = true;
            publish('refresh', null);
        }
        return ok;
    }

    function _buildFollowersIndex() {
        // Cross-domain: reads character records. Character records are
        // owned by the character domain. This index is derived state
        // that declares a dependency on that domain.
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
     * Followers of a religion. Returns a slice of the follower index
     * entries (character records). The elements are LIVE character
     * records, not projections — this is documented behavior. Religion
     * queries that need projections call
     * window.getCharacterById(id) on each element (see
     * religion-queries.js::_projectFollowers).
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
    // CANONICAL ARRAY OWNERSHIP: every primitive builds a working copy,
    // mutates the copy, then reassigns masterData.data.religions. The
    // old array (held by any caller) becomes a stale snapshot. See the
    // header section.
    //

    function _buildWorkingCopy() {
        // Returns a slice of the canonical array (new array, same element
        // references). Caller is expected to replace elements or push /
        // splice, then call _setCanonicalReligionsArray(workingCopy).
        var religions = _getCanonicalReligionsArray();
        if (religions === null) {
            throw new Error(
                'ReligionState: canonical store not initialized. ' +
                'Cannot mutate religions.'
            );
        }
        return religions.slice();
    }

    function _addReligion(religion) {
        if (!religion || !religion.id) {
            throw new Error('ReligionState._addReligion requires a religion with an id.');
        }

        if (_indexes.byId.has(religion.id)) {
            throw new Error(
                'ReligionState._addReligion: religion id already exists: ' + religion.id
            );
        }

        var working = _buildWorkingCopy();
        working.push(religion);
        _setCanonicalReligionsArray(working);

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

        var working = _buildWorkingCopy();

        var index = -1;
        for (var i = 0; i < working.length; i++) {
            if (working[i] && working[i].id === id) {
                index = i;
                break;
            }
        }
        if (index === -1) {
            throw new Error('ReligionState._updateReligion: religion not found: ' + id);
        }

        working[index] = religion;
        _setCanonicalReligionsArray(working);

        hydrateFromMasterData();
        _markDirty();
        return religion;
    }

    function _removeReligion(id) {
        if (!id) {
            throw new Error('ReligionState._removeReligion requires an id.');
        }

        var working = _buildWorkingCopy();

        var index = -1;
        for (var i = 0; i < working.length; i++) {
            if (working[i] && working[i].id === id) {
                index = i;
                break;
            }
        }
        if (index === -1) {
            throw new Error('ReligionState._removeReligion: religion not found: ' + id);
        }

        var removed = working[index];
        working.splice(index, 1);
        _setCanonicalReligionsArray(working);

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

    function notify(event) {
        if (!event || typeof event.type !== 'string') {
            publish('unknown', event);
            return;
        }
        publish(event.type, event.data !== undefined ? event.data : null);
    }

    function _reportSubscriberError(err) {
        // Prefer the DOM global error reporter (SettlementState's
        // pattern). Fall back to console.error. Never swallow.
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

    function _init() {
        if (_initialized) return;

        var ok = hydrateFromMasterData();
        if (ok) {
            _initialized = true;
            return;
        }

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
        rebuildIndexes: rebuildIndexes,              // deprecated alias
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
        notify: notify,

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
