/**
 * =============================================================================
 * STILL WATERS - EDUCATION STATE (education-state.js)
 * =============================================================================
 * 
 * This file is the SINGLE SOURCE OF TRUTH for education data.
 * - Caching for fast lookups
 * - Change notifications (subscribe/unsubscribe)
 * - UI state management
 * - NO business logic
 * 
 * UPDATED: Added tuition fields to institution schema
 * 
 * DEPENDENCIES:
 *   - accessors.js (getCharacters, getPlaces)
 *   - ids.js (generateId)
 *   - storage.js (saveMasterData)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARDS
    // =========================================================================

    var _processingStateUpdate = false;

    // =========================================================================
    // 2. PRIVATE STATE
    // =========================================================================

    var _state = {
        institutions: [],
        cache: {
            byId: new Map(),
            byLocation: new Map(),
            byType: new Map()
        },
        uiState: {
            selectedInstitutionId: null,
            filters: {
                type: null,
                location: null,
                minReputation: null
            },
            viewMode: 'list'
        },
        subscribers: [],
        lastUpdated: null,
        _initialized: false
    };

    // =========================================================================
    // 3. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        return window.masterData?.data?.characters || [];
    }

    function _getPlaces() {
        if (typeof window.getPlaces === 'function') {
            return window.getPlaces();
        }
        return window.masterData?.data?.places || [];
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
        }
        return null;
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

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    }

    // =========================================================================
    // 4. PRIVATE HELPERS
    // =========================================================================

    function _initializeState() {
        if (_state._initialized) return;

        if (window.masterData?.data?.educationalInstitutions) {
            _state.institutions = window.masterData.data.educationalInstitutions;
        }

        _rebuildCaches();
        _state._initialized = true;
        _state.lastUpdated = Date.now();
    }

    function _ensureInstitutionInitialized(institution) {
        if (!institution) return;

        // Existing fields
        if (!institution.students) institution.students = [];
        if (!institution.graduates) institution.graduates = [];
        if (!institution.teachers) institution.teachers = [];
        if (!institution.curriculum) institution.curriculum = [];
        if (!institution.taughtRoles) institution.taughtRoles = [];
        if (!institution.history) institution.history = [];
        if (!institution.headmasterHistory) institution.headmasterHistory = [];

        // ================================================================
        // NEW: Tuition fields
        // ================================================================
        if (institution.tuitionPerYear === undefined || institution.tuitionPerYear === null) {
            var typeTuition = window.DEFAULT_TUITION_BY_TYPE?.[institution.type];
            institution.tuitionPerYear = typeTuition !== undefined ? typeTuition : window.DEFAULT_TUITION || 10;
        }

        if (institution.customTuition === undefined) {
            institution.customTuition = null; // null = use calculated
        }

        if (!institution.tuitionHistory) {
            institution.tuitionHistory = [];
        }

        if (institution.waiveTuition === undefined) {
            institution.waiveTuition = false; // Scholarship/sponsorship flag
        }
    }

    function _rebuildCaches() {
        _state.cache.byId.clear();
        _state.cache.byLocation.clear();
        _state.cache.byType.clear();

        for (var i = 0; i < _state.institutions.length; i++) {
            var inst = _state.institutions[i];
            if (!inst) continue;

            _ensureInstitutionInitialized(inst);

            _state.cache.byId.set(inst.id, inst);

            if (inst.locationId) {
                if (!_state.cache.byLocation.has(inst.locationId)) {
                    _state.cache.byLocation.set(inst.locationId, []);
                }
                _state.cache.byLocation.get(inst.locationId).push(inst);
            }

            if (inst.type) {
                if (!_state.cache.byType.has(inst.type)) {
                    _state.cache.byType.set(inst.type, []);
                }
                _state.cache.byType.get(inst.type).push(inst);
            }
        }
    }

    function _notifySubscribers(eventType, data) {
        if (_processingStateUpdate) {
            return;
        }

        _processingStateUpdate = true;
        try {
            var subscribers = _state.subscribers.slice();
            for (var i = 0; i < subscribers.length; i++) {
                try {
                    subscribers[i]({
                        type: eventType,
                        data: data,
                        timestamp: Date.now()
                    });
                } catch (err) {
                    // Silently handle subscriber errors
                }
            }
        } finally {
            _processingStateUpdate = false;
        }
    }

    function _persistState() {
        if (window.masterData && window.masterData.data) {
            window.masterData.data.educationalInstitutions = _state.institutions;
        }
        _saveMasterData();
        _invalidateAccessorCaches();
        _state.lastUpdated = Date.now();
    }

    // =========================================================================
    // 5. PUBLIC STATE API
    // =========================================================================

    function subscribe(callback) {
        if (typeof callback !== 'function') {
            return function() {};
        }

        _state.subscribers.push(callback);
        return function unsubscribe() {
            var index = _state.subscribers.indexOf(callback);
            if (index !== -1) {
                _state.subscribers.splice(index, 1);
            }
        };
    }

    function getAllInstitutions() {
        _initializeState();
        var result = _state.institutions.slice();
        for (var i = 0; i < result.length; i++) {
            _ensureInstitutionInitialized(result[i]);
        }
        return result;
    }

    function getInstitution(id) {
        _initializeState();
        if (!id || typeof id !== 'string') return null;
        var inst = _state.cache.byId.get(id) || null;
        if (inst) _ensureInstitutionInitialized(inst);
        return inst;
    }

    function getInstitutionsByLocation(locationId) {
        _initializeState();
        if (!locationId) return [];
        var result = _state.cache.byLocation.get(locationId) || [];
        for (var i = 0; i < result.length; i++) {
            _ensureInstitutionInitialized(result[i]);
        }
        return result;
    }

    function getInstitutionsByType(typeId) {
        _initializeState();
        if (!typeId) return [];
        var result = _state.cache.byType.get(typeId) || [];
        for (var i = 0; i < result.length; i++) {
            _ensureInstitutionInitialized(result[i]);
        }
        return result;
    }

    function getUIState() {
        _initializeState();
        return _state.uiState;
    }

    function updateUIState(updates) {
        _initializeState();
        for (var key in updates) {
            if (updates.hasOwnProperty(key)) {
                _state.uiState[key] = updates[key];
            }
        }
        _notifySubscribers('uiStateChanged', _state.uiState);
    }

    // =========================================================================
    // 6. INTERNAL STATE MUTATORS (For Commands)
    // =========================================================================

    function _addInstitution(institution) {
        _initializeState();
        _ensureInstitutionInitialized(institution);
        _state.institutions.push(institution);
        _rebuildCaches();
        _persistState();
        _notifySubscribers('institutionAdded', institution);
        return institution;
    }

    function _updateInstitution(id, updates) {
        _initializeState();
        var institution = _state.cache.byId.get(id);
        if (!institution) return null;

        for (var key in updates) {
            if (updates.hasOwnProperty(key)) {
                institution[key] = updates[key];
            }
        }

        _ensureInstitutionInitialized(institution);

        _rebuildCaches();
        _persistState();
        _notifySubscribers('institutionUpdated', { id: id, updates: updates });
        return institution;
    }

    function _deleteInstitution(id) {
        _initializeState();
        var index = -1;
        for (var i = 0; i < _state.institutions.length; i++) {
            if (_state.institutions[i].id === id) {
                index = i;
                break;
            }
        }
        if (index === -1) return false;

        var institution = _state.institutions[index];
        _state.institutions.splice(index, 1);
        _rebuildCaches();
        _persistState();
        _notifySubscribers('institutionDeleted', institution);
        return true;
    }

    function _clearAllInstitutions() {
        _initializeState();
        _state.institutions = [];
        _rebuildCaches();
        _persistState();
        _notifySubscribers('institutionsCleared', null);
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.EducationState = {
        subscribe: subscribe,
        getAllInstitutions: getAllInstitutions,
        getInstitution: getInstitution,
        getInstitutionsByLocation: getInstitutionsByLocation,
        getInstitutionsByType: getInstitutionsByType,
        getUIState: getUIState,
        updateUIState: updateUIState,

        _addInstitution: _addInstitution,
        _updateInstitution: _updateInstitution,
        _deleteInstitution: _deleteInstitution,
        _clearAllInstitutions: _clearAllInstitutions,
        _rebuildCaches: _rebuildCaches,
        _persistState: _persistState,
        _initializeState: _initializeState,
        _ensureInstitutionInitialized: _ensureInstitutionInitialized,

        _getState: function() { return _state; }
    };

    // =========================================================================
    // 8. LEGACY ALIASES
    // =========================================================================

    window._getInstitutions = function() {
        return EducationState.getAllInstitutions();
    };

    window._saveInstitutions = function() {
        EducationState._persistState();
    };

    window._refreshInstitutionCache = function() {
        EducationState._rebuildCaches();
    };

    // =========================================================================
    // 9. INITIALIZE ON LOAD
    // =========================================================================

    _initializeState();

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            EducationState: window.EducationState,
            subscribe: subscribe,
            getAllInstitutions: getAllInstitutions,
            getInstitution: getInstitution,
            getInstitutionsByLocation: getInstitutionsByLocation,
            getInstitutionsByType: getInstitutionsByType
        };
    }

})();