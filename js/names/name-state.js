/**
 * =============================================================================
 * NAME STATE - Single source of truth for name data
 * =============================================================================
 * 
 * Responsibilities:
 * - Store name lists by country
 * - Cache surname histories
 * - Track name generation rules by country
 * - Change notifications
 * - UI state management
 * 
 * DEPENDENCIES:
 *   - accessors.js (getPlaces, getPlaceById, getCharacterById, getNameLists)
 *   - storage.js (saveMasterData)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _initializingState = false;
    var _notifyingSubscribers = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getPlaces() {
        return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
    }

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getNameLists() {
        return typeof window.getNameLists === 'function' ? window.getNameLists() : {};
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') return window.getCurrentYearSafe();
        if (typeof window.getCurrentYear === 'function') return window.getCurrentYear();
        return 1250;
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') window.saveMasterData();
    }

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    // =========================================================================
    // 3. STATE DEFINITION
    // =========================================================================

    var _state = {
        // Raw data from masterData
        nameLists: {},
        surnameHistories: new Map(),
        
        // Caches for performance
        cache: {
            countryNameLists: new Map(),
            characterSurnameHistory: new Map(),
            randomNames: new Map(),
            randomSurnames: new Map()
        },
        
        // Change listeners
        subscribers: [],
        
        // UI State
        uiState: {
            selectedCountry: null,
            selectedGender: 'male',
            previewName: '',
            previewSurname: '',
            generationMode: 'random',
            filters: {
                gender: 'all',
                minAge: null,
                maxAge: null
            }
        },
        
        // Initialization flag
        initialized: false
    };

    // =========================================================================
    // 4. INITIALIZATION
    // =========================================================================

    function _initializeState() {
        if (_initializingState) {
            return;
        }
        _initializingState = true;

        try {
            if (_state.initialized) return;

            // Load name lists from masterData
            var nameLists = _getNameLists();
            _state.nameLists = nameLists || {};

            // Ensure all places have at least empty name lists
            var places = _getPlaces();
            for (var i = 0; i < places.length; i++) {
                var placeId = places[i].id;
                if (!_state.nameLists[placeId]) {
                    _state.nameLists[placeId] = {
                        male: [],
                        female: [],
                        surnames: [],
                        rules: null
                    };
                }
            }

            // Load surname histories from characters
            var characters = typeof window.getCharacters === 'function' ? window.getCharacters() : [];
            for (var i = 0; i < characters.length; i++) {
                var char = characters[i];
                if (char.surnameHistory) {
                    _state.surnameHistories.set(char.id, char.surnameHistory);
                    _state.cache.characterSurnameHistory.set(char.id, char.surnameHistory);
                }
            }

            _state.initialized = true;
            _notifySubscribers('initialized', null);

        } catch(e) {
            console.warn('NameState initialization error:', e);
        } finally {
            _initializingState = false;
        }
    }

    // =========================================================================
    // 5. CORE STATE ACCESS
    // =========================================================================

    function getNameLists() {
        if (!_state.initialized) _initializeState();
        return _state.nameLists;
    }

    function getNameList(countryId) {
        if (!_state.initialized) _initializeState();
        if (!countryId) return null;
        return _state.nameLists[countryId] || null;
    }

    function getSurnameHistory(characterId) {
        if (!_state.initialized) _initializeState();
        if (!characterId) return null;

        // Check cache first
        if (_state.cache.characterSurnameHistory.has(characterId)) {
            return _state.cache.characterSurnameHistory.get(characterId);
        }

        // Try to load from character
        var char = _getCharacterById(characterId);
        if (char && char.surnameHistory) {
            _state.surnameHistories.set(characterId, char.surnameHistory);
            _state.cache.characterSurnameHistory.set(characterId, char.surnameHistory);
            return char.surnameHistory;
        }

        return null;
    }

    function getUiState() {
        return _state.uiState;
    }

    function setUiState(updates) {
        for (var key in updates) {
            if (updates.hasOwnProperty(key)) {
                _state.uiState[key] = updates[key];
            }
        }
        _notifySubscribers('uiStateChanged', _state.uiState);
    }

    // =========================================================================
    // 6. CACHE MANAGEMENT
    // =========================================================================

    function invalidateCache() {
        _state.cache.countryNameLists.clear();
        _state.cache.characterSurnameHistory.clear();
        _state.cache.randomNames.clear();
        _state.cache.randomSurnames.clear();
        _notifySubscribers('cacheInvalidated', null);
    }

    function refreshFromMasterData() {
        _state.initialized = false;
        _initializeState();
        invalidateCache();
    }

    // =========================================================================
    // 7. CHANGE NOTIFICATIONS (Observer Pattern)
    // =========================================================================

    function subscribe(callback) {
        if (typeof callback !== 'function') return null;
        _state.subscribers.push(callback);
        
        // Return unsubscribe function
        return function unsubscribe() {
            var index = _state.subscribers.indexOf(callback);
            if (index !== -1) {
                _state.subscribers.splice(index, 1);
            }
        };
    }

    function _notifySubscribers(event, data) {
        if (_notifyingSubscribers) {
            return;
        }
        _notifyingSubscribers = true;

        try {
            var subscribers = _state.subscribers.slice();
            for (var i = 0; i < subscribers.length; i++) {
                try {
                    subscribers[i]({ type: event, data: data });
                } catch(e) {
                    // Don't let one subscriber break others
                }
            }
        } finally {
            _notifyingSubscribers = false;
        }
    }

    // =========================================================================
    // 8. CACHE GETTERS/SETTERS (Internal)
    // =========================================================================

    function _getCache(cacheName, key) {
        if (!_state.cache[cacheName]) return null;
        return _state.cache[cacheName].get(key) || null;
    }

    function _setCache(cacheName, key, value) {
        if (!_state.cache[cacheName]) {
            _state.cache[cacheName] = new Map();
        }
        _state.cache[cacheName].set(key, value);
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.NameState = {
        // Core access
        getNameLists: getNameLists,
        getNameList: getNameList,
        getSurnameHistory: getSurnameHistory,
        
        // UI State
        getUiState: getUiState,
        setUiState: setUiState,
        
        // Cache management
        invalidateCache: invalidateCache,
        refreshFromMasterData: refreshFromMasterData,
        
        // Subscription
        subscribe: subscribe,
        
        // Internal cache access (for queries)
        _getCache: _getCache,
        _setCache: _setCache,
        
        // Initialize
        _initialize: _initializeState
    };

    // Auto-initialize
    if (typeof window !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                _initializeState();
            });
        } else {
            setTimeout(function() {
                _initializeState();
            }, 0);
        }
    }


})();