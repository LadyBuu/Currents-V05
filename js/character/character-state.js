/**
 * =============================================================================
 * STILL WATERS - CHARACTER STATE (js/core/character/character-state.js)
 * =============================================================================
 * 
 * Single source of truth for all character data.
 * 
 * DEPENDENCIES:
 *   - storage.js (masterData)
 *   - ids.js (generateId)
 * 
 * FEATURES:
 *   - Full caching by ID, name, location, household, status
 *   - Change notifications via subscriptions
 *   - Recursion guard
 *   - Auto-load on masterData updates
 *   - Religion tracking (religionId, religionHistory)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. STATE DEFINITION
    // =========================================================================

    var _state = {
        characters: [],
        cache: {
            byId: new Map(),
            byName: new Map(),
            byLocation: new Map(),
            byHousehold: new Map(),
            byStatus: new Map(),
            byGender: new Map(),
            byProfession: new Map(),
            byRank: new Map(),
            byBirthDecade: new Map(),
            byReligion: new Map()  // NEW: religion cache
        },
        subscribers: [],
        _processingState: false
    };

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getMasterData() {
        return typeof window.masterData !== 'undefined' ? window.masterData : null;
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    function _generateId(prefix) {
        if (typeof window.generateId === 'function') {
            return window.generateId(prefix);
        }
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        if (typeof window.getCurrentYear === 'function') {
            return window.getCurrentYear();
        }
        return 1250;
    }

    function _calculateAge(birthYear, isDeceased, deathYear) {
        if (typeof window.calculateAge === 'function') {
            return window.calculateAge(birthYear, isDeceased, deathYear);
        }
        var currentYear = _getCurrentYear();
        if (!birthYear) return 0;
        if (isDeceased && deathYear) return Math.max(0, deathYear - birthYear);
        return Math.max(0, currentYear - birthYear);
    }

    // =========================================================================
    // 3. DATA LOADING
    // =========================================================================

    function _loadCharacters() {
        var master = _getMasterData();
        if (master && master.data) {
            if (!master.data.characters) {
                master.data.characters = [];
            }
            return master.data.characters;
        }
        return [];
    }

    function _loadData() {
        _state.characters = _loadCharacters();
        _rebuildCaches();
    }

    // =========================================================================
    // 4. CACHE MANAGEMENT
    // =========================================================================

    function _rebuildCaches() {
        var cache = _state.cache;
        cache.byId.clear();
        cache.byName.clear();
        cache.byLocation.clear();
        cache.byHousehold.clear();
        cache.byStatus.clear();
        cache.byGender.clear();
        cache.byProfession.clear();
        cache.byRank.clear();
        cache.byBirthDecade.clear();
        cache.byReligion.clear();  // NEW

        var characters = _state.characters;
        for (var i = 0; i < characters.length; i++) {
            var c = characters[i];
            if (!c || !c.id) continue;

            // By ID
            cache.byId.set(c.id, c);

            // By Name (full name)
            var fullName = (c.name || '') + ' ' + (c.surname || '');
            var key = fullName.toLowerCase().trim();
            if (!cache.byName.has(key)) {
                cache.byName.set(key, []);
            }
            cache.byName.get(key).push(c);

            // By Location
            var locationKey = c.currentLocationId || c.birthplaceId || 'none';
            if (!cache.byLocation.has(locationKey)) {
                cache.byLocation.set(locationKey, []);
            }
            cache.byLocation.get(locationKey).push(c);

            // By Household
            var householdKey = c.household || 'none';
            if (!cache.byHousehold.has(householdKey)) {
                cache.byHousehold.set(householdKey, []);
            }
            cache.byHousehold.get(householdKey).push(c);

            // By Status
            var statusKey = c.isDeceased ? 'deceased' : 'living';
            if (!cache.byStatus.has(statusKey)) {
                cache.byStatus.set(statusKey, []);
            }
            cache.byStatus.get(statusKey).push(c);

            // By Gender
            var genderKey = c.gender || 'unknown';
            if (!cache.byGender.has(genderKey)) {
                cache.byGender.set(genderKey, []);
            }
            cache.byGender.get(genderKey).push(c);

            // By Profession
            if (c.professions) {
                for (var j = 0; j < c.professions.length; j++) {
                    var prof = c.professions[j];
                    if (!cache.byProfession.has(prof.id)) {
                        cache.byProfession.set(prof.id, []);
                    }
                    cache.byProfession.get(prof.id).push(c);
                }
            }

            // By Rank
            if (c.activeRankId) {
                if (!cache.byRank.has(c.activeRankId)) {
                    cache.byRank.set(c.activeRankId, []);
                }
                cache.byRank.get(c.activeRankId).push(c);
            }
            if (c.rankAssignments) {
                for (var j = 0; j < c.rankAssignments.length; j++) {
                    var ra = c.rankAssignments[j];
                    if (ra.rankId && !ra.isDeprecated) {
                        if (!cache.byRank.has(ra.rankId)) {
                            cache.byRank.set(ra.rankId, []);
                        }
                        cache.byRank.get(ra.rankId).push(c);
                    }
                }
            }

            // By Birth Decade
            if (c.birthYear) {
                var decade = Math.floor(c.birthYear / 10) * 10;
                var decadeKey = 'decade_' + decade;
                if (!cache.byBirthDecade.has(decadeKey)) {
                    cache.byBirthDecade.set(decadeKey, []);
                }
                cache.byBirthDecade.get(decadeKey).push(c);
            }

            // NEW: By Religion
            if (c.religionId) {
                if (!cache.byReligion.has(c.religionId)) {
                    cache.byReligion.set(c.religionId, []);
                }
                cache.byReligion.get(c.religionId).push(c);
            }
        }
    }

    function invalidateCache() {
        if (_state._processingState) {
            return;
        }
        _state._processingState = true;
        try {
            _rebuildCaches();
            _notifySubscribers({ type: 'cacheInvalidated' });
        } finally {
            _state._processingState = false;
        }
    }

    // =========================================================================
    // 5. SUBSCRIPTION MANAGEMENT
    // =========================================================================

    function subscribe(callback) {
        if (typeof callback !== 'function') return null;
        _state.subscribers.push(callback);
        return function unsubscribe() {
            var index = _state.subscribers.indexOf(callback);
            if (index !== -1) {
                _state.subscribers.splice(index, 1);
            }
        };
    }

    function _notifySubscribers(event) {
        var subscribers = _state.subscribers;
        for (var i = 0; i < subscribers.length; i++) {
            try {
                subscribers[i](event);
            } catch (e) {
                // Silent fail for subscriber errors
            }
        }
    }

    // =========================================================================
    // 6. STATE MUTATION (Internal)
    // =========================================================================

    function _setCharacters(characters) {
        _state.characters = characters;
        var master = _getMasterData();
        if (master && master.data) {
            master.data.characters = characters;
        }
        _rebuildCaches();
        _saveMasterData();
        _notifySubscribers({ type: 'change', data: { characters: characters } });
    }

    function _emitCharacterChange(action, character) {
        _notifySubscribers({ type: 'characterChanged', action: action, character: character });
        try {
            if (typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(new CustomEvent('characterDataChanged', {
                    detail: { action: action, characterId: character?.id }
                }));
            }
        } catch (e) {
            // Silent fail
        }
    }

    // =========================================================================
    // 7. PUBLIC API
    // =========================================================================

    var CharacterState = {

        // ---- Data Access ----
        getCharacter: function(id) {
            if (!id) return null;
            return _state.cache.byId.get(id) || null;
        },

        getAllCharacters: function() {
            return _state.characters.slice();
        },

        getCharactersByLocation: function(locationId) {
            var key = locationId || 'none';
            var result = _state.cache.byLocation.get(key);
            return result ? result.slice() : [];
        },

        getCharactersByHousehold: function(householdId) {
            var key = householdId || 'none';
            var result = _state.cache.byHousehold.get(key);
            return result ? result.slice() : [];
        },

        getCharactersByStatus: function(status) {
            var key = status === 'deceased' ? 'deceased' : 'living';
            var result = _state.cache.byStatus.get(key);
            return result ? result.slice() : [];
        },

        getLivingCharacters: function() {
            return this.getCharactersByStatus('living');
        },

        getDeceasedCharacters: function() {
            return this.getCharactersByStatus('deceased');
        },

        getCharactersByGender: function(gender) {
            var key = gender || 'unknown';
            var result = _state.cache.byGender.get(key);
            return result ? result.slice() : [];
        },

        getCharactersByProfession: function(roleId) {
            var result = _state.cache.byProfession.get(roleId);
            return result ? result.slice() : [];
        },

        getCharactersByRank: function(rankId) {
            var result = _state.cache.byRank.get(rankId);
            return result ? result.slice() : [];
        },

        getCharactersByBirthDecade: function(decade) {
            var key = 'decade_' + decade;
            var result = _state.cache.byBirthDecade.get(key);
            return result ? result.slice() : [];
        },

        // NEW: Get characters by religion
        getCharactersByReligion: function(religionId) {
            var result = _state.cache.byReligion.get(religionId);
            return result ? result.slice() : [];
        },

        searchByName: function(query) {
            if (!query || query.trim() === '') return this.getAllCharacters();
            var lowerQuery = query.toLowerCase().trim();
            var result = [];
            var byName = _state.cache.byName;
            for (var key of byName.keys()) {
                if (key.indexOf(lowerQuery) !== -1) {
                    var chars = byName.get(key);
                    for (var i = 0; i < chars.length; i++) {
                        result.push(chars[i]);
                    }
                }
            }
            return result;
        },

        getCharactersByAgeRange: function(minAge, maxAge, asOfYear) {
            var currentYear = asOfYear || _getCurrentYear();
            var all = this.getAllCharacters();
            var result = [];
            for (var i = 0; i < all.length; i++) {
                var c = all[i];
                if (c.isDeceased) continue;
                var age = _calculateAge(c.birthYear, false, null);
                if (age >= minAge && age <= maxAge) {
                    result.push(c);
                }
            }
            return result;
        },

        // ---- State Mutation (Internal use only) ----
        _setCharacters: _setCharacters,
        _loadData: _loadData,
        _emitCharacterChange: _emitCharacterChange,

        // ---- Cache ----
        invalidateCache: invalidateCache,

        // ---- Subscriptions ----
        subscribe: subscribe,

        // ---- Helper ----
        isProcessing: function() {
            return _state._processingState;
        },

        // ---- Character Count ----
        getTotalCharacterCount: function() {
            return _state.characters.length;
        }
    };

    // =========================================================================
    // 8. AUTO-LOAD
    // =========================================================================

    _loadData();

    if (typeof window !== 'undefined') {
        window.addEventListener('masterDataUpdated', function() {
            _loadData();
        });
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.CharacterState = CharacterState;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = CharacterState;
    }

})();