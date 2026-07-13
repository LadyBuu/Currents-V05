/**
 * =============================================================================
 * STILL WATERS - RELIGION STATE (religion-state.js)
 * =============================================================================
 * 
 * LOCATION: js/core/religion/religion-state.js
 * 
 * This is the SINGLE SOURCE OF TRUTH for all religion data.
 * Manages caching, subscriptions, and data persistence.
 * 
 * DEPENDENCIES:
 *   - accessors.js: getCharacters, getCharacterById, getPlaces, getPlaceById
 *   - ids.js: generateId
 *   - storage.js: saveMasterData
 * 
 * ICON POLICY: No emojis. No icons in confirm/cancel buttons.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _processingState = false;
    var _initialized = false;

    // =========================================================================
    // 2. STATE STRUCTURE
    // =========================================================================

    var _state = {
        religions: [],
        subscribers: []
    };

    var _cache = {
        byId: new Map(),
        byTrait: new Map(),
        byLocation: new Map(),
        byLeader: new Map(),
        byCharacter: new Map(),
        gods: new Map(),
        placesOfWorship: new Map(),
        laws: new Map()
    };

    // =========================================================================
    // 3. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        return [];
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    function _getPlaces() {
        if (typeof window.getPlaces === 'function') {
            return window.getPlaces();
        }
        return [];
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
        }
        return null;
    }

    function _generateId(prefix) {
        if (typeof window.generateId === 'function') {
            return window.generateId(prefix);
        }
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    function _invalidateAccessorCaches() {
        if (typeof window.invalidateAccessorCaches === 'function') {
            window.invalidateAccessorCaches();
        }
    }

    // =========================================================================
    // 4. DATA LOADING
    // =========================================================================

    function _loadData() {
        if (_processingState) return;

        _processingState = true;

        try {
            var masterData = window.masterData;

            if (masterData && masterData.data) {
                if (masterData.data.religions) {
                    _state.religions = masterData.data.religions;
                } else {
                    _state.religions = [];
                    masterData.data.religions = [];
                }

                _rebuildCaches();
            }

            _initialized = true;
        } catch (e) {
            _state.religions = [];
        } finally {
            _processingState = false;
        }
    }

    // =========================================================================
    // 5. CACHE MANAGEMENT
    // =========================================================================

    function _rebuildCaches() {
        _cache.byId = new Map();
        _cache.byTrait = new Map();
        _cache.byLocation = new Map();
        _cache.byLeader = new Map();
        _cache.gods = new Map();
        _cache.placesOfWorship = new Map();
        _cache.laws = new Map();
        _cache.byCharacter = new Map();

        var religions = _state.religions;

        for (var i = 0; i < religions.length; i++) {
            var religion = religions[i];

            if (religion.id) {
                _cache.byId.set(religion.id, religion);

                if (religion.trait) {
                    if (!_cache.byTrait.has(religion.trait)) {
                        _cache.byTrait.set(religion.trait, []);
                    }
                    _cache.byTrait.get(religion.trait).push(religion);
                }

                if (religion.locations && religion.locations.length > 0) {
                    for (var j = 0; j < religion.locations.length; j++) {
                        var locationId = religion.locations[j];
                        if (!_cache.byLocation.has(locationId)) {
                            _cache.byLocation.set(locationId, []);
                        }
                        _cache.byLocation.get(locationId).push(religion);
                    }
                }

                if (religion.leader && religion.leader.characterId) {
                    _cache.byLeader.set(religion.leader.characterId, religion);
                }

                if (religion.gods && religion.gods.length > 0) {
                    for (var k = 0; k < religion.gods.length; k++) {
                        var god = religion.gods[k];
                        if (god.id) {
                            _cache.gods.set(god.id, god);
                        }
                    }
                }

                if (religion.laws && religion.laws.length > 0) {
                    for (var l = 0; l < religion.laws.length; l++) {
                        var law = religion.laws[l];
                        if (law.id) {
                            _cache.laws.set(law.id, law);
                        }
                    }
                }

                if (religion.placesOfWorship && religion.placesOfWorship.length > 0) {
                    for (var m = 0; m < religion.placesOfWorship.length; m++) {
                        var placeId = religion.placesOfWorship[m];
                        _cache.placesOfWorship.set(placeId, {
                            religionId: religion.id,
                            religionName: religion.name
                        });
                    }
                }
            }
        }

        _buildCharacterCache();
    }

    function _buildCharacterCache() {
        _cache.byCharacter = new Map();

        var characters = _getCharacters();

        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];
            if (char.religionId) {
                if (!_cache.byCharacter.has(char.religionId)) {
                    _cache.byCharacter.set(char.religionId, []);
                }
                _cache.byCharacter.get(char.religionId).push(char);
            }
        }
    }

    function invalidateCache() {
        _rebuildCaches();
        _notifySubscribers({ type: 'cache_invalidated', timestamp: Date.now() });
    }

    // =========================================================================
    // 6. PERSISTENCE
    // =========================================================================

    function _persistState() {
        if (_processingState) return;

        _processingState = true;

        try {
            if (window.masterData && window.masterData.data) {
                window.masterData.data.religions = _state.religions;
            }

            _saveMasterData();
            _invalidateAccessorCaches();

            _rebuildCaches();

            _notifySubscribers({ type: 'state_updated', timestamp: Date.now() });
        } catch (e) {
            // Silent fail
        } finally {
            _processingState = false;
        }
    }

    // =========================================================================
    // 7. SUBSCRIPTIONS
    // =========================================================================

    function subscribe(callback) {
        if (typeof callback !== 'function') return null;

        _state.subscribers.push(callback);

        return function() {
            var index = _state.subscribers.indexOf(callback);
            if (index !== -1) {
                _state.subscribers.splice(index, 1);
            }
        };
    }

    function _notifySubscribers(event) {
        for (var i = 0; i < _state.subscribers.length; i++) {
            try {
                _state.subscribers[i](event);
            } catch (e) {
                // Silent fail
            }
        }
    }

    // =========================================================================
    // 8. REFRESH
    // =========================================================================

    function refreshFromMasterData() {
        _loadData();
        _rebuildCaches();
        _notifySubscribers({ type: 'refresh', timestamp: Date.now() });
    }

    // =========================================================================
    // 9. STATE ACCESSORS
    // =========================================================================

    function _getState() {
        return {
            religions: _state.religions,
            cache: _cache
        };
    }

    function isProcessing() {
        return _processingState;
    }

    // =========================================================================
    // 10. RELIGION QUERIES
    // =========================================================================

    function getReligion(id) {
        if (!id || typeof id !== 'string') return null;
        return _cache.byId.get(id) || null;
    }

    function getAllReligions(options) {
        options = options || {};
        var includeDeprecated = options.includeDeprecated || false;

        var religions = _state.religions;

        if (!includeDeprecated) {
            var filtered = [];
            for (var i = 0; i < religions.length; i++) {
                if (!religions[i].isDeprecated) {
                    filtered.push(religions[i]);
                }
            }
            return filtered;
        }

        return religions.slice();
    }

    function getReligionsByLocation(locationId) {
        if (!locationId) return [];
        return _cache.byLocation.get(locationId) || [];
    }

    function getReligionsByTrait(trait) {
        if (!trait) return [];
        return _cache.byTrait.get(trait) || [];
    }

    function getReligionByLeader(characterId) {
        if (!characterId) return null;
        return _cache.byLeader.get(characterId) || null;
    }

    function getGod(godId) {
        if (!godId) return null;
        return _cache.gods.get(godId) || null;
    }

    function getGodsByReligion(religionId) {
        var religion = getReligion(religionId);
        if (!religion) return [];
        return religion.gods || [];
    }

    function getLaw(lawId) {
        if (!lawId) return null;
        return _cache.laws.get(lawId) || null;
    }

    function getLawsByReligion(religionId) {
        var religion = getReligion(religionId);
        if (!religion) return [];
        return religion.laws || [];
    }

    function getPlaceOfWorship(placeId) {
        if (!placeId) return null;

        var allReligions = getAllReligions({ includeDeprecated: true });

        for (var i = 0; i < allReligions.length; i++) {
            var religion = allReligions[i];
            if (religion.placesOfWorship) {
                for (var j = 0; j < religion.placesOfWorship.length; j++) {
                    if (religion.placesOfWorship[j] === placeId) {
                        return {
                            id: placeId,
                            religionId: religion.id,
                            religionName: religion.name
                        };
                    }
                }
            }
        }

        return null;
    }

    function getFollowers(religionId, options) {
        options = options || {};
        var includeDeceased = options.includeDeceased || false;

        var followers = _cache.byCharacter.get(religionId) || [];

        if (!includeDeceased) {
            var living = [];
            for (var i = 0; i < followers.length; i++) {
                if (!followers[i].isDeceased) {
                    living.push(followers[i]);
                }
            }
            return living;
        }

        return followers.slice();
    }

    function getFollowerCount(religionId) {
        var followers = _cache.byCharacter.get(religionId) || [];
        var count = 0;
        for (var i = 0; i < followers.length; i++) {
            if (!followers[i].isDeceased) {
                count++;
            }
        }
        return count;
    }

    function getFollowersByLocation(religionId, locationId) {
        if (!religionId || !locationId) return [];

        var followers = getFollowers(religionId, { includeDeceased: false });
        var result = [];

        for (var i = 0; i < followers.length; i++) {
            var char = followers[i];
            var charLocationId = null;

            if (typeof window.getCurrentLocationId === 'function') {
                charLocationId = window.getCurrentLocationId(char);
            } else if (char.currentLocationId) {
                charLocationId = char.currentLocationId;
            }

            if (charLocationId === locationId) {
                result.push(char);
            }
        }

        return result;
    }

    function getReligionStatistics(religionId) {
        var religion = getReligion(religionId);
        if (!religion) return null;

        var followers = getFollowers(religionId, { includeDeceased: false });

        return {
            religionId: religion.id,
            religionName: religion.name,
            trait: religion.trait,
            followerCount: followers.length,
            locationCount: religion.locations ? religion.locations.length : 0,
            godCount: religion.gods ? religion.gods.length : 0,
            lawCount: religion.laws ? religion.laws.length : 0,
            placeCount: religion.placesOfWorship ? religion.placesOfWorship.length : 0,
            schoolCount: religion.schools ? religion.schools.length : 0,
            isDeprecated: religion.isDeprecated || false,
            hasLeader: religion.leader !== null && religion.leader !== undefined,
            leaderName: religion.leader ? religion.leader.characterName : null
        };
    }

    function getGlobalReligionStatistics() {
        var allReligions = getAllReligions({ includeDeprecated: false });

        var stats = {
            totalReligions: allReligions.length,
            totalFollowers: 0,
            byTrait: {},
            largest: null,
            oldest: null
        };

        var largestCount = 0;

        for (var i = 0; i < allReligions.length; i++) {
            var religion = allReligions[i];
            var count = getFollowerCount(religion.id);

            stats.totalFollowers += count;

            if (religion.trait) {
                if (!stats.byTrait[religion.trait]) {
                    stats.byTrait[religion.trait] = 0;
                }
                stats.byTrait[religion.trait] += count;
            }

            if (count > largestCount) {
                largestCount = count;
                stats.largest = {
                    id: religion.id,
                    name: religion.name,
                    followers: count
                };
            }

            if (!stats.oldest || religion.createdAt < stats.oldest.createdAt) {
                stats.oldest = {
                    id: religion.id,
                    name: religion.name,
                    createdAt: religion.createdAt
                };
            }
        }

        return stats;
    }

    function getCharacterReligion(characterId) {
        var character = _getCharacterById(characterId);
        if (!character) return null;
        if (!character.religionId) return null;
        return getReligion(character.religionId);
    }

    function getCharacterReligionHistory(characterId) {
        var character = _getCharacterById(characterId);
        if (!character) return [];
        return character.religionHistory || [];
    }

    // =========================================================================
    // 11. UI STATE
    // =========================================================================

    var _uiState = {
        selectedReligionId: null,
        filters: {
            searchTerm: '',
            traitFilter: 'all',
            statusFilter: 'all'
        },
        viewMode: 'list',
        expandedReligions: {}
    };

    function getUIState() {
        return {
            selectedReligionId: _uiState.selectedReligionId,
            filters: {
                searchTerm: _uiState.filters.searchTerm,
                traitFilter: _uiState.filters.traitFilter,
                statusFilter: _uiState.filters.statusFilter
            },
            viewMode: _uiState.viewMode,
            expandedReligions: _uiState.expandedReligions
        };
    }

    function updateUIState(updates) {
        var changed = false;

        if (updates.selectedReligionId !== undefined) {
            _uiState.selectedReligionId = updates.selectedReligionId;
            changed = true;
        }

        if (updates.filters) {
            if (updates.filters.searchTerm !== undefined) {
                _uiState.filters.searchTerm = updates.filters.searchTerm;
                changed = true;
            }
            if (updates.filters.traitFilter !== undefined) {
                _uiState.filters.traitFilter = updates.filters.traitFilter;
                changed = true;
            }
            if (updates.filters.statusFilter !== undefined) {
                _uiState.filters.statusFilter = updates.filters.statusFilter;
                changed = true;
            }
        }

        if (updates.viewMode !== undefined) {
            _uiState.viewMode = updates.viewMode;
            changed = true;
        }

        if (updates.expandedReligions !== undefined) {
            _uiState.expandedReligions = updates.expandedReligions;
            changed = true;
        }

        if (changed) {
            _notifySubscribers({ type: 'ui_state_updated', updates: updates });
        }

        return changed;
    }

    // =========================================================================
    // 12. INTERNAL MUTATORS (For Commands)
    // =========================================================================

    function _addReligion(religion) {
        _state.religions.push(religion);
        _persistState();
        _notifySubscribers({ type: 'religion_added', data: religion });
        return religion;
    }

    function _updateReligion(religionId, updates) {
        var index = -1;
        for (var i = 0; i < _state.religions.length; i++) {
            if (_state.religions[i].id === religionId) {
                index = i;
                break;
            }
        }

        if (index === -1) return null;

        var religion = _state.religions[index];

        for (var key in updates) {
            if (updates.hasOwnProperty(key)) {
                if (key === 'gods' || key === 'laws' || key === 'leaderHistory' ||
                    key === 'locations' || key === 'schools' || key === 'placesOfWorship') {
                    religion[key] = updates[key];
                } else if (key === 'leader' && updates[key] === null) {
                    religion.leader = null;
                } else if (key === 'leader') {
                    religion.leader = updates[key];
                } else {
                    religion[key] = updates[key];
                }
            }
        }

        religion.updatedAt = Date.now();

        _persistState();
        _notifySubscribers({ type: 'religion_updated', data: religion });

        return religion;
    }

    function _deleteReligion(religionId) {
        var index = -1;
        for (var i = 0; i < _state.religions.length; i++) {
            if (_state.religions[i].id === religionId) {
                index = i;
                break;
            }
        }

        if (index === -1) return false;

        _state.religions.splice(index, 1);

        _persistState();
        _notifySubscribers({ type: 'religion_deleted', data: { id: religionId } });

        return true;
    }

    function _addGodToReligion(religionId, god) {
        var religion = getReligion(religionId);
        if (!religion) return null;

        if (!religion.gods) religion.gods = [];

        religion.gods.push(god);
        _updateReligion(religionId, { gods: religion.gods });

        return god;
    }

    function _removeGodFromReligion(religionId, godId) {
        var religion = getReligion(religionId);
        if (!religion) return false;

        if (!religion.gods) return false;

        var index = -1;
        for (var i = 0; i < religion.gods.length; i++) {
            if (religion.gods[i].id === godId) {
                index = i;
                break;
            }
        }

        if (index === -1) return false;

        religion.gods.splice(index, 1);
        _updateReligion(religionId, { gods: religion.gods });

        return true;
    }

    function _addLawToReligion(religionId, law) {
        var religion = getReligion(religionId);
        if (!religion) return null;

        if (!religion.laws) religion.laws = [];

        religion.laws.push(law);
        _updateReligion(religionId, { laws: religion.laws });

        return law;
    }

    function _removeLawFromReligion(religionId, lawId) {
        var religion = getReligion(religionId);
        if (!religion) return false;

        if (!religion.laws) return false;

        var index = -1;
        for (var i = 0; i < religion.laws.length; i++) {
            if (religion.laws[i].id === lawId) {
                index = i;
                break;
            }
        }

        if (index === -1) return false;

        religion.laws.splice(index, 1);
        _updateReligion(religionId, { laws: religion.laws });

        return true;
    }

    // =========================================================================
    // 13. INITIALIZATION
    // =========================================================================

    function _init() {
        if (_initialized) return;

        _loadData();

        if (typeof window !== 'undefined') {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', function() {
                    if (!_initialized) {
                        _loadData();
                    }
                });
            }
        }

        _initialized = true;
    }

    // Auto-initialize
    _init();

    // =========================================================================
    // 14. EXPORTS
    // =========================================================================

    // State access
    window.ReligionState = {
        getState: _getState,
        isProcessing: isProcessing,
        refreshFromMasterData: refreshFromMasterData,
        invalidateCache: invalidateCache,
        subscribe: subscribe,

        // Queries
        getReligion: getReligion,
        getAllReligions: getAllReligions,
        getReligionsByLocation: getReligionsByLocation,
        getReligionsByTrait: getReligionsByTrait,
        getReligionByLeader: getReligionByLeader,
        getGod: getGod,
        getGodsByReligion: getGodsByReligion,
        getLaw: getLaw,
        getLawsByReligion: getLawsByReligion,
        getPlaceOfWorship: getPlaceOfWorship,
        getFollowers: getFollowers,
        getFollowerCount: getFollowerCount,
        getFollowersByLocation: getFollowersByLocation,
        getReligionStatistics: getReligionStatistics,
        getGlobalReligionStatistics: getGlobalReligionStatistics,
        getCharacterReligion: getCharacterReligion,
        getCharacterReligionHistory: getCharacterReligionHistory,

        // UI State
        getUIState: getUIState,
        updateUIState: updateUIState,

        // Internal mutators (for commands)
        _addReligion: _addReligion,
        _updateReligion: _updateReligion,
        _deleteReligion: _deleteReligion,
        _addGodToReligion: _addGodToReligion,
        _removeGodFromReligion: _removeGodFromReligion,
        _addLawToReligion: _addLawToReligion,
        _removeLawFromReligion: _removeLawFromReligion
    };

    // Legacy aliases
    window.ReligionState.getReligionById = getReligion;
    window.ReligionState.getAllReligionsWithDeprecated = function() {
        return getAllReligions({ includeDeprecated: true });
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            ReligionState: window.ReligionState
        };
    }

})();