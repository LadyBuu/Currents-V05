/**
 * =============================================================================
 * STILL WATERS - APPRENTICESHIP STATE (apprenticeship-state.js)
 * =============================================================================
 * 
 * This file is the SINGLE SOURCE OF TRUTH for apprenticeship data.
 * - Caching for fast lookups
 * - Change notifications (subscribe/unsubscribe)
 * - UI state management
 * - NO business logic
 * - NO TRUST SYSTEM
 * 
 * DEPENDENCIES:
 *   - accessors.js (getCharacterById, getCharacters)
 *   - relationship-registry.js (getAllRelationships, getRelationshipBetween)
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
        apprenticeships: [],
        cache: {
            byMaster: new Map(),
            byApprentice: new Map(),
            byRole: new Map()
        },
        uiState: {
            selectedMasterId: null,
            selectedApprenticeId: null,
            filters: {
                role: null,
                status: 'ongoing'
            }
        },
        subscribers: [],
        lastUpdated: null,
        _initialized: false
    };

    // =========================================================================
    // 3. DEPENDENCY WRAPPERS
    // =========================================================================

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

    function _getAllRelationships() {
        if (typeof window.getAllRelationships === 'function') {
            return window.getAllRelationships();
        }
        return [];
    }

    function _getRelationshipBetween(idA, idB) {
        if (typeof window.getRelationshipBetween === 'function') {
            return window.getRelationshipBetween(idA, idB);
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

    function _getRelationshipArchetypes() {
        return window.RELATIONSHIP_ARCHETYPES || {
            APPRENTICESHIP: 'apprenticeship',
            MENTORSHIP: 'mentorship'
        };
    }

    function _getRelationshipStatus() {
        return window.RELATIONSHIP_STATUS || {
            ONGOING: 'ongoing',
            ENDED: 'ended'
        };
    }

    // =========================================================================
    // 4. PRIVATE HELPERS
    // =========================================================================

    function _initializeState() {
        if (_state._initialized) return;

        var ARCHETYPES = _getRelationshipArchetypes();
        var allRelationships = _getAllRelationships();

        if (allRelationships && Array.isArray(allRelationships)) {
            _state.apprenticeships = allRelationships.filter(function(r) {
                return r.type === ARCHETYPES.APPRENTICESHIP;
            });
        }

        _rebuildCaches();
        _state._initialized = true;
        _state.lastUpdated = Date.now();
    }

    function _rebuildCaches() {
        _state.cache.byMaster.clear();
        _state.cache.byApprentice.clear();
        _state.cache.byRole.clear();

        var ARCHETYPES = _getRelationshipArchetypes();

        for (var i = 0; i < _state.apprenticeships.length; i++) {
            var app = _state.apprenticeships[i];
            if (!app) continue;

            var masterId = app.participantA;
            var apprenticeId = app.participantB;
            var roleId = app.metadata?.roleId;

            if (masterId) {
                if (!_state.cache.byMaster.has(masterId)) {
                    _state.cache.byMaster.set(masterId, []);
                }
                _state.cache.byMaster.get(masterId).push(app);
            }

            if (apprenticeId) {
                if (!_state.cache.byApprentice.has(apprenticeId)) {
                    _state.cache.byApprentice.set(apprenticeId, []);
                }
                _state.cache.byApprentice.get(apprenticeId).push(app);
            }

            if (roleId) {
                if (!_state.cache.byRole.has(roleId)) {
                    _state.cache.byRole.set(roleId, []);
                }
                _state.cache.byRole.get(roleId).push(app);
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
                    // Silently handle
                }
            }
        } finally {
            _processingStateUpdate = false;
        }
    }

    function _persistState() {
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

    function getAllApprenticeships() {
        _initializeState();
        return _state.apprenticeships.slice();
    }

    function getApprenticeshipById(id) {
        _initializeState();
        for (var i = 0; i < _state.apprenticeships.length; i++) {
            if (_state.apprenticeships[i].id === id) {
                return _state.apprenticeships[i];
            }
        }
        return null;
    }

    function getApprenticeshipsByMaster(masterId) {
        _initializeState();
        if (!masterId) return [];
        return _state.cache.byMaster.get(masterId) || [];
    }

    function getApprenticeshipsByApprentice(apprenticeId) {
        _initializeState();
        if (!apprenticeId) return [];
        return _state.cache.byApprentice.get(apprenticeId) || [];
    }

    function getApprenticeshipsByRole(roleId) {
        _initializeState();
        if (!roleId) return [];
        return _state.cache.byRole.get(roleId) || [];
    }

    function getApprenticeshipBetween(masterId, apprenticeId) {
        _initializeState();
        if (!masterId || !apprenticeId) return null;
        return _getRelationshipBetween(masterId, apprenticeId);
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

    function _addApprenticeship(apprenticeship) {
        _initializeState();
        _state.apprenticeships.push(apprenticeship);
        _rebuildCaches();
        _persistState();
        _notifySubscribers('apprenticeshipAdded', apprenticeship);
        return apprenticeship;
    }

    function _updateApprenticeship(id, updates) {
        _initializeState();
        var index = -1;
        for (var i = 0; i < _state.apprenticeships.length; i++) {
            if (_state.apprenticeships[i].id === id) {
                index = i;
                break;
            }
        }
        if (index === -1) return null;

        var app = _state.apprenticeships[index];
        for (var key in updates) {
            if (updates.hasOwnProperty(key)) {
                app[key] = updates[key];
            }
        }

        _rebuildCaches();
        _persistState();
        _notifySubscribers('apprenticeshipUpdated', { id: id, updates: updates });
        return app;
    }

    function _deleteApprenticeship(id) {
        _initializeState();
        var index = -1;
        for (var i = 0; i < _state.apprenticeships.length; i++) {
            if (_state.apprenticeships[i].id === id) {
                index = i;
                break;
            }
        }
        if (index === -1) return false;

        var app = _state.apprenticeships[index];
        _state.apprenticeships.splice(index, 1);
        _rebuildCaches();
        _persistState();
        _notifySubscribers('apprenticeshipDeleted', app);
        return true;
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.ApprenticeshipState = {
        subscribe: subscribe,
        getAllApprenticeships: getAllApprenticeships,
        getApprenticeshipById: getApprenticeshipById,
        getApprenticeshipsByMaster: getApprenticeshipsByMaster,
        getApprenticeshipsByApprentice: getApprenticeshipsByApprentice,
        getApprenticeshipsByRole: getApprenticeshipsByRole,
        getApprenticeshipBetween: getApprenticeshipBetween,
        getUIState: getUIState,
        updateUIState: updateUIState,

        _addApprenticeship: _addApprenticeship,
        _updateApprenticeship: _updateApprenticeship,
        _deleteApprenticeship: _deleteApprenticeship,
        _rebuildCaches: _rebuildCaches,
        _persistState: _persistState,
        _initializeState: _initializeState,

        _getState: function() { return _state; }
    };

    // =========================================================================
    // 8. LEGACY ALIASES
    // =========================================================================

    window._getAllApprenticeships = function() {
        return ApprenticeshipState.getAllApprenticeships();
    };

    // =========================================================================
    // 9. INITIALIZE ON LOAD
    // =========================================================================

    _initializeState();

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            ApprenticeshipState: window.ApprenticeshipState,
            subscribe: subscribe,
            getAllApprenticeships: getAllApprenticeships,
            getApprenticeshipById: getApprenticeshipById,
            getApprenticeshipsByMaster: getApprenticeshipsByMaster,
            getApprenticeshipsByApprentice: getApprenticeshipsByApprentice,
            getApprenticeshipBetween: getApprenticeshipBetween
        };
    }

})();