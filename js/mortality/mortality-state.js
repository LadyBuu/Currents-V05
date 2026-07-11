/**
 * =============================================================================
 * STILL WATERS - MORTALITY STATE (js/core/mortality/mortality-state.js)
 * =============================================================================
 * 
 * Single source of truth for all mortality data.
 * 
 * DEPENDENCIES:
 *   - storage.js (masterData)
 *   - accessors.js (getCharacters, getCharacterById)
 * 
 * FEATURES:
 *   - Death records cache (mirrors character-state.js pattern)
 *   - Murder records cache
 *   - Execution records cache
 *   - Living/Deceased caches
 *   - Change notifications via subscriptions
 *   - UI state management (filters, sorting)
 *   - Recursion guard
 *   - Auto-load on masterData updates
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. STATE DEFINITION
    // =========================================================================

    var _state = {
        deathRecords: new Map(),
        murderRecords: [],
        executionRecords: [],
        cache: {
            living: [],
            deceased: [],
            byYear: new Map(),
            byCause: new Map(),
            byAgeGroup: new Map(),
            byGender: new Map()
        },
        uiState: {
            filters: {
                searchTerm: '',
                genderFilter: 'all',
                ageGroupFilter: 'all',
                causeFilter: 'all',
                locationFilter: 'all'
            },
            sortBy: 'age_desc',
            collapsedFilters: false,
            selectedCharacterId: null
        },
        subscribers: [],
        _processingState: false,
        _initialized: false,
        lastUpdated: null
    };

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getMasterData() {
        return typeof window.masterData !== 'undefined' ? window.masterData : null;
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        return [];
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

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    // =========================================================================
    // 3. DATA LOADING
    // =========================================================================

    function _loadDeathRecords() {
        var characters = _getCharacters();
        var deathRecords = new Map();
        var murderRecords = [];
        var executionRecords = [];

        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];
            
            if (char.isDeceased) {
                deathRecords.set(char.id, {
                    characterId: char.id,
                    name: char.name,
                    surname: char.surname || '',
                    gender: char.gender || 'unknown',
                    birthYear: char.birthYear,
                    deathYear: char.deathYear,
                    deathCause: char.deathCause || 'Unknown',
                    deathNotes: char.deathNotes || '',
                    ageAtDeath: _calculateAge(char.birthYear, true, char.deathYear),
                    isMurder: char.isMurder || false,
                    isExecution: char.isExecution || false,
                    killerId: char.killerId || null,
                    killerName: char.killerId ? (_getCharacterById(char.killerId)?.name || 'Unknown') : null,
                    murderMotive: char.murderMotive || null,
                    murderMethod: char.murderMethod || null,
                    executionReason: char.executionReason || null,
                    executionMethod: char.executionMethod || null,
                    executionLocation: char.executionLocation || null,
                    locationId: char.deathLocationId || char.currentLocationId || null
                });

                if (char.isMurder) {
                    murderRecords.push({
                        victimId: char.id,
                        victimName: char.name,
                        killerId: char.killerId,
                        killerName: char.killerId ? (_getCharacterById(char.killerId)?.name || 'Unknown') : 'Unknown',
                        year: char.deathYear,
                        motive: char.murderMotive,
                        method: char.murderMethod,
                        notes: char.deathNotes
                    });
                }

                if (char.isExecution) {
                    executionRecords.push({
                        condemnedId: char.id,
                        condemnedName: char.name,
                        year: char.deathYear,
                        reason: char.executionReason,
                        method: char.executionMethod,
                        location: char.executionLocation,
                        notes: char.deathNotes
                    });
                }
            }
        }

        return { deathRecords: deathRecords, murderRecords: murderRecords, executionRecords: executionRecords };
    }

    function _loadData() {
        var data = _loadDeathRecords();
        _state.deathRecords = data.deathRecords;
        _state.murderRecords = data.murderRecords;
        _state.executionRecords = data.executionRecords;
        _rebuildCaches();
        _state._initialized = true;
        _state.lastUpdated = Date.now();
    }

    // =========================================================================
    // 4. CACHE MANAGEMENT
    // =========================================================================

    function _rebuildCaches() {
        var cache = _state.cache;
        var characters = _getCharacters();

        cache.living = [];
        cache.deceased = [];
        cache.byYear.clear();
        cache.byCause.clear();
        cache.byAgeGroup.clear();
        cache.byGender.clear();

        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];
            if (char.isDeceased) {
                cache.deceased.push(char);
                
                var year = char.deathYear || 'Unknown';
                if (!cache.byYear.has(year)) cache.byYear.set(year, []);
                cache.byYear.get(year).push(char);

                var cause = char.deathCause ? char.deathCause.split(':')[0].trim() : 'Unknown';
                if (!cache.byCause.has(cause)) cache.byCause.set(cause, []);
                cache.byCause.get(cause).push(char);

                var age = _calculateAge(char.birthYear, true, char.deathYear);
                var group = _getAgeGroup(age);
                if (!cache.byAgeGroup.has(group)) cache.byAgeGroup.set(group, []);
                cache.byAgeGroup.get(group).push(char);

                var gender = char.gender || 'unknown';
                if (!cache.byGender.has(gender)) cache.byGender.set(gender, []);
                cache.byGender.get(gender).push(char);
            } else {
                cache.living.push(char);
            }
        }
    }

    function invalidateCache() {
        if (_state._processingState) return;
        _state._processingState = true;
        try {
            _rebuildCaches();
            _notifySubscribers({ type: 'cacheInvalidated' });
        } finally {
            _state._processingState = false;
        }
    }

    function _getAgeGroup(age) {
        var groups = ['0-10', '11-20', '21-30', '31-40', '41-50', '51-60', '61-70', '71-80', '81-90', '91+'];
        for (var i = 0; i < groups.length; i++) {
            var parts = groups[i].split('-');
            var min = parseInt(parts[0]);
            var max = parts[1] === '+' ? Infinity : parseInt(parts[1]);
            if (age >= min && age <= max) return groups[i];
        }
        return '91+';
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
                // Silent fail
            }
        }
    }

    function _emitMortalityChange(action, data) {
        _notifySubscribers({ type: 'mortalityChanged', action: action, data: data });
        try {
            if (typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(new CustomEvent('mortalityDataChanged', {
                    detail: { action: action }
                }));
            }
        } catch (e) {
            // Silent fail
        }
    }

    // =========================================================================
    // 6. STATE MUTATION (Internal)
    // =========================================================================

    function _setDeathRecord(characterId, record) {
        _state.deathRecords.set(characterId, record);
        _rebuildCaches();
        _saveMasterData();
        _emitMortalityChange('deathRecordAdded', record);
    }

    function _updateDeathRecord(characterId, updates) {
        var record = _state.deathRecords.get(characterId);
        if (!record) return null;

        for (var key in updates) {
            if (updates.hasOwnProperty(key)) {
                record[key] = updates[key];
            }
        }
        _state.deathRecords.set(characterId, record);
        _rebuildCaches();
        _saveMasterData();
        _emitMortalityChange('deathRecordUpdated', record);
        return record;
    }

    function _addMurderRecord(record) {
        _state.murderRecords.push(record);
        _saveMasterData();
        _emitMortalityChange('murderRecordAdded', record);
        return record;
    }

    function _addExecutionRecord(record) {
        _state.executionRecords.push(record);
        _saveMasterData();
        _emitMortalityChange('executionRecordAdded', record);
        return record;
    }

    // =========================================================================
    // 7. PUBLIC API
    // =========================================================================

    var MortalityState = {

        // ---- Data Access ----
        getDeathRecord: function(characterId) {
            return _state.deathRecords.get(characterId) || null;
        },

        getAllDeathRecords: function() {
            return Array.from(_state.deathRecords.values());
        },

        getDeceasedCharacters: function() {
            return _state.cache.deceased.slice();
        },

        getLivingCharacters: function() {
            return _state.cache.living.slice();
        },

        getMurderRecords: function() {
            return _state.murderRecords.slice();
        },

        getExecutionRecords: function() {
            return _state.executionRecords.slice();
        },

        getDeathCount: function() {
            return _state.deathRecords.size;
        },

        getMurderCount: function() {
            return _state.murderRecords.length;
        },

        getExecutionCount: function() {
            return _state.executionRecords.length;
        },

        getDeathsByYear: function(year) {
            return _state.cache.byYear.get(year) || [];
        },

        getDeathsByCause: function(cause) {
            return _state.cache.byCause.get(cause) || [];
        },

        getDeathsByAgeGroup: function(group) {
            return _state.cache.byAgeGroup.get(group) || [];
        },

        getDeathsByGender: function(gender) {
            return _state.cache.byGender.get(gender) || [];
        },

        // ---- UI State ----
        getUIState: function() {
            return _state.uiState;
        },

        updateUIState: function(updates) {
            var changed = false;
            for (var key in updates) {
                if (updates.hasOwnProperty(key)) {
                    if (key === 'filters') {
                        for (var filterKey in updates.filters) {
                            if (_state.uiState.filters[filterKey] !== updates.filters[filterKey]) {
                                _state.uiState.filters[filterKey] = updates.filters[filterKey];
                                changed = true;
                            }
                        }
                    } else if (_state.uiState[key] !== updates[key]) {
                        _state.uiState[key] = updates[key];
                        changed = true;
                    }
                }
            }
            if (changed) {
                _notifySubscribers({ type: 'uiStateChanged', data: _state.uiState });
            }
            return changed;
        },

        resetFilters: function() {
            _state.uiState.filters = {
                searchTerm: '',
                genderFilter: 'all',
                ageGroupFilter: 'all',
                causeFilter: 'all',
                locationFilter: 'all'
            };
            _state.uiState.sortBy = 'age_desc';
            _notifySubscribers({ type: 'uiStateChanged', data: _state.uiState });
            return true;
        },

        toggleFiltersCollapsed: function() {
            _state.uiState.collapsedFilters = !_state.uiState.collapsedFilters;
            _notifySubscribers({ type: 'uiStateChanged', data: _state.uiState });
            return _state.uiState.collapsedFilters;
        },

        setSelectedCharacter: function(characterId) {
            _state.uiState.selectedCharacterId = characterId;
            _notifySubscribers({ type: 'selectionChanged', data: characterId });
        },

        getSelectedCharacter: function() {
            return _state.uiState.selectedCharacterId;
        },

        // ---- Subscriptions ----
        subscribe: subscribe,

        // ---- Cache ----
        invalidateCache: invalidateCache,

        // ---- Internal (for commands) ----
        _setDeathRecord: _setDeathRecord,
        _updateDeathRecord: _updateDeathRecord,
        _addMurderRecord: _addMurderRecord,
        _addExecutionRecord: _addExecutionRecord,
        _loadData: _loadData,
        _rebuildCaches: _rebuildCaches,

        // ---- Helper ----
        isProcessing: function() {
            return _state._processingState;
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
        window.addEventListener('characterDataChanged', function() {
            _loadData();
        });
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.MortalityState = MortalityState;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = MortalityState;
    }

})();