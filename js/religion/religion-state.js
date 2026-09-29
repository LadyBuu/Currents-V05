/**
 * =============================================================================
 * STILL WATERS - RELIGION STATE (religion-state.js)
 * =============================================================================
 * 
 * LOCATION: js/core/religion/religion-state.js
 * 
 * Derived indexes and subscription machinery ONLY.
 * 
 * This module does NOT contain:
 *   - A religion-record collection (canonical store is masterData.data.religions)
 *   - Semantic queries (those live in religion-queries.js)
 *   - Mutations (those live in religion-commands.js)
 *   - UI state (that lives in religion-ui-state.js)
 *   - Persistence (that is a command-layer concern)
 * 
 * DEPENDENCIES:
 *   - accessors.js: getCharacters (required for follower index)
 * 
 * ICON POLICY: No emojis. No icons in confirm/cancel buttons.
 * 
 * =============================================================================
 * PHASE 3 BOUNDARY RESTRUCTURE (2026):
 *   - Deleted _state.religions entirely. State holds no religion records.
 *   - Deleted all semantic query methods (getReligion, getAllReligions,
 *     getFollowers, getReligionStatistics, etc.). Moved to ReligionQueries.
 *   - Deleted all private mutators (_addReligion, _updateReligion, etc.).
 *     Commands mutate masterData.data.religions directly.
 *   - Deleted _persistState. Save is command-layer responsibility.
 *   - Deleted _uiState / getUIState / updateUIState. Moved to ReligionUIState.
 *   - Renamed _cache.byCharacter → _cache.followersByReligion. The old name
 *     was misleading: the index was keyed by religionId, not characterId.
 *   - Renamed _rebuildCaches → rebuildIndexes.
 *   - Renamed invalidateCache → rebuildIndexes (same operation).
 *   - Added notify() as public method (commands call it after mutations).
 *   - _loadData no longer copies masterData.data.religions into internal
 *     state. It only verifies the array exists and triggers index rebuild.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. STATE STRUCTURE
    // =========================================================================

    // No canonical religion records here. Only subscribers.
    var _subscribers = [];

    // Derived indexes. All rebuildable from masterData.data.religions
    // and character records. Never persisted as canonical data.
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
        // Required dependency. Throws if missing (ADR Decision 8).
        if (typeof window.getCharacters !== 'function') {
            throw new Error(
                'ReligionState requires accessors.getCharacters. ' +
                'Check script order or dependency wiring.'
            );
        }
        return window.getCharacters();
    }

    function _getCanonicalReligions() {
        // Reads from the canonical store. Returns the live array.
        // State never owns a copy of this.
        if (!window.masterData || !window.masterData.data) {
            return null;
        }
        if (!Array.isArray(window.masterData.data.religions)) {
            // Canonical store hasn't been initialized yet. Distinguish
            // "not ready" (null) from "empty" ([]).
            return null;
        }
        return window.masterData.data.religions;
    }

    // =========================================================================
    // 3. INDEX BUILDING
    // =========================================================================

    function rebuildIndexes() {
        var religions = _getCanonicalReligions();

        if (religions === null) {
            // Canonical store not ready. Do not clear indexes, do not fake
            // empty data. Leave previous indexes intact and let the caller
            // decide when to retry (via refreshFromMasterData).
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

        for (var i = 0; i < religions.length; i++) {
            var religion = religions[i];

            if (!religion || !religion.id) continue;

            _indexes.byId.set(religion.id, religion);

            if (religion.trait) {
                if (!_indexes.byTrait.has(religion.trait)) {
                    _indexes.byTrait.set(religion.trait, []);
                }
                _indexes.byTrait.get(religion.trait).push(religion);
            }

            if (religion.locations && religion.locations.length > 0) {
                for (var j = 0; j < religion.locations.length; j++) {
                    var locationId = religion.locations[j];
                    if (!_indexes.byLocation.has(locationId)) {
                        _indexes.byLocation.set(locationId, []);
                    }
                    _indexes.byLocation.get(locationId).push(religion);
                }
            }

            if (religion.leader && religion.leader.characterId) {
                _indexes.byLeader.set(religion.leader.characterId, religion);
            }

            if (religion.gods && religion.gods.length > 0) {
                for (var k = 0; k < religion.gods.length; k++) {
                    var god = religion.gods[k];
                    if (god && god.id) {
                        _indexes.godsById.set(god.id, god);
                    }
                }
            }

            if (religion.laws && religion.laws.length > 0) {
                for (var l = 0; l < religion.laws.length; l++) {
                    var law = religion.laws[l];
                    if (law && law.id) {
                        _indexes.lawsById.set(law.id, law);
                    }
                }
            }

            if (religion.placesOfWorship && religion.placesOfWorship.length > 0) {
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

    function _buildFollowersIndex() {
        // Cross-domain: reads character records. Character records are owned
        // by the character domain. This index is derived state that declares
        // a dependency on that domain (see ADR Decision 13).
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
        // Called by cross-domain commands (e.g. character religion change)
        // to rebuild only the follower index, without rebuilding everything.
        _buildFollowersIndex();
    }

    // =========================================================================
    // 4. INDEX ACCESSORS
    // =========================================================================
    // Queries read through these. The indexes are the only thing State owns.

    function getIndexes() {
        return _indexes;
    }

    function getReligionById(id) {
        if (!id || typeof id !== 'string') return null;
        return _indexes.byId.get(id) || null;
    }

    function getReligionsByTraitIndex(trait) {
        if (!trait) return [];
        return _indexes.byTrait.get(trait) || [];
    }

    function getReligionsByLocationIndex(locationId) {
        if (!locationId) return [];
        return _indexes.byLocation.get(locationId) || [];
    }

    function getReligionByLeaderIndex(characterId) {
        if (!characterId) return null;
        return _indexes.byLeader.get(characterId) || null;
    }

    function getFollowersByReligionIndex(religionId) {
        if (!religionId) return [];
        return _indexes.followersByReligion.get(religionId) || [];
    }

    function getGodByIdIndex(godId) {
        if (!godId) return null;
        return _indexes.godsById.get(godId) || null;
    }

    function getLawByIdIndex(lawId) {
        if (!lawId) return null;
        return _indexes.lawsById.get(lawId) || null;
    }

    function getPlaceOfWorshipByIdIndex(placeId) {
        if (!placeId) return null;
        return _indexes.placesOfWorshipById.get(placeId) || null;
    }

    // =========================================================================
    // 5. REFRESH
    // =========================================================================

    function refreshFromMasterData() {
        var ok = rebuildIndexes();
        if (ok) {
            _initialized = true;
            notify({ type: 'refresh', timestamp: Date.now() });
        }
        return ok;
    }

    // =========================================================================
    // 6. SUBSCRIPTIONS
    // =========================================================================

    function subscribe(callback) {
        if (typeof callback !== 'function') return null;

        _subscribers.push(callback);

        return function() {
            var index = _subscribers.indexOf(callback);
            if (index !== -1) {
                _subscribers.splice(index, 1);
            }
        };
    }

    function notify(event) {
        // Public. Called by commands at the end of a transaction to announce
        // that in-memory mutation is complete. Does NOT mean durable
        // persistence has succeeded (ADR Decision 9).
        for (var i = 0; i < _subscribers.length; i++) {
            try {
                _subscribers[i](event);
            } catch (e) {
                console.error('[ReligionState] Subscriber error:', e);
            }
        }
    }

    // =========================================================================
    // 7. INITIALIZATION
    // =========================================================================

    function _init() {
        if (_initialized) return;

        var ok = rebuildIndexes();
        if (ok) {
            _initialized = true;
            return;
        }

        // Canonical store not ready. Retry on DOM ready, then on window load.
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', _init);
        } else {
            setTimeout(_init, 0);
        }
    }

    _init();

    window.addEventListener('load', function() {
        if (!_initialized) {
            _init();
        }
    });

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.ReligionState = {
        // Lifecycle
        refreshFromMasterData: refreshFromMasterData,
        rebuildIndexes: rebuildIndexes,

        // Subscription
        subscribe: subscribe,
        notify: notify,

        // Index accessors (Queries use these)
        getIndexes: getIndexes,
        getReligionById: getReligionById,
        getReligionsByTraitIndex: getReligionsByTraitIndex,
        getReligionsByLocationIndex: getReligionsByLocationIndex,
        getReligionByLeaderIndex: getReligionByLeaderIndex,
        getFollowersByReligionIndex: getFollowersByReligionIndex,
        getGodByIdIndex: getGodByIdIndex,
        getLawByIdIndex: getLawByIdIndex,
        getPlaceOfWorshipByIdIndex: getPlaceOfWorshipByIdIndex,

        // Cross-domain index refresh (for character religion changes)
        invalidateFollowerIndex: _invalidateFollowerIndex
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            ReligionState: window.ReligionState
        };
    }

})();
