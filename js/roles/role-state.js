/**
 * =============================================================================
 * STILL WATERS - ROLE STATE (role-state.js)
 * =============================================================================
 * 
 * This file is the SINGLE SOURCE OF TRUTH for role data.
 * - Caching for fast lookups
 * - Change notifications (subscribe/unsubscribe)
 * - UI state management
 * - NO business logic
 * 
 * DEPENDENCIES:
 *   - accessors.js (getCharacters, getRoles)
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
        roles: [],
        categories: null,
        cache: {
            byId: new Map(),
            byName: new Map(),
            byCategory: new Map()
        },
        uiState: {
            selectedRoleId: null,
            searchTerm: '',
            filterCategory: 'all',
            filterGender: 'all',
            viewMode: 'list',
            expandedRoleId: null,
            filterMasterOnly: false
        },
        subscribers: [],
        lastUpdated: null,
        _initialized: false
    };

    // =========================================================================
    // 3. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getRoles() {
        if (typeof window.getRoles === 'function') {
            return window.getRoles();
        }
        return window.masterData?.data?.roles || [];
    }

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        return [];
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
    // 4. PRIVATE HELPERS
    // =========================================================================

    function _initializeState() {
        if (_state._initialized) return;

        _state.roles = _getRoles();
        _state.categories = _buildCategories();
        _rebuildCaches();
        _state._initialized = true;
        _state.lastUpdated = Date.now();
    }

    function _buildCategories() {
        var categories = {};

        // Start with defaults
        var defaults = window.DEFAULT_ROLE_CATEGORIES || {};
        for (var key in defaults) {
            if (defaults.hasOwnProperty(key)) {
                categories[key] = { ...defaults[key] };
            }
        }

        // Add uncategorized
        categories[window.UNCATEGORIZED_ID || 'uncategorized'] = {
            id: window.UNCATEGORIZED_ID || 'uncategorized',
            name: window.UNCATEGORIZED_NAME || 'Uncategorized',
            icon: window.UNCATEGORIZED_ICON || '⌇'
        };

        // Try to load saved categories from masterData
        if (window.masterData?.data?.roleCategories) {
            var saved = window.masterData.data.roleCategories;
            if (typeof saved === 'object' && saved !== null) {
                for (var key in saved) {
                    if (saved.hasOwnProperty(key) && saved[key] && saved[key].id) {
                        categories[key] = saved[key];
                    }
                }
            }
        }

        return categories;
    }

    function _rebuildCaches() {
        _state.cache.byId.clear();
        _state.cache.byName.clear();
        _state.cache.byCategory.clear();

        for (var i = 0; i < _state.roles.length; i++) {
            var role = _state.roles[i];
            if (!role) continue;

            _state.cache.byId.set(role.id, role);

            if (role.name) {
                _state.cache.byName.set(role.name.toLowerCase(), role);
            }

            var category = role.category || window.UNCATEGORIZED_ID || 'uncategorized';
            if (!_state.cache.byCategory.has(category)) {
                _state.cache.byCategory.set(category, []);
            }
            _state.cache.byCategory.get(category).push(role);
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
        _state.categories = _buildCategories();
        if (window.masterData && window.masterData.data) {
            window.masterData.data.roleCategories = _state.categories;
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

    function getAllRoles() {
        _initializeState();
        return _state.roles.slice();
    }

    function getRole(id) {
        _initializeState();
        if (!id || typeof id !== 'string') return null;
        return _state.cache.byId.get(id) || null;
    }

    function getRoleByName(name) {
        _initializeState();
        if (!name) return null;
        return _state.cache.byName.get(name.toLowerCase()) || null;
    }

    function getRolesByCategory(categoryId) {
        _initializeState();
        if (!categoryId) return [];
        return _state.cache.byCategory.get(categoryId) || [];
    }

    function getCategories() {
        _initializeState();
        return { ..._state.categories };
    }

    function getUIState() {
        _initializeState();
        return { ..._state.uiState };
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

    function _addRole(role) {
        _initializeState();
        _state.roles.push(role);
        _rebuildCaches();
        _persistState();
        _notifySubscribers('roleAdded', role);
        return role;
    }

    function _updateRole(id, updates) {
        _initializeState();
        var role = _state.cache.byId.get(id);
        if (!role) return null;

        for (var key in updates) {
            if (updates.hasOwnProperty(key)) {
                role[key] = updates[key];
            }
        }

        _rebuildCaches();
        _persistState();
        _notifySubscribers('roleUpdated', { id: id, updates: updates });
        return role;
    }

    function _deleteRole(id) {
        _initializeState();
        var index = -1;
        for (var i = 0; i < _state.roles.length; i++) {
            if (_state.roles[i].id === id) {
                index = i;
                break;
            }
        }
        if (index === -1) return false;

        var role = _state.roles[index];
        _state.roles.splice(index, 1);
        _rebuildCaches();
        _persistState();
        _notifySubscribers('roleDeleted', role);
        return true;
    }

    function _setRoles(roles) {
        _initializeState();
        _state.roles = roles;
        _rebuildCaches();
        _persistState();
        _notifySubscribers('rolesSet', roles);
        return true;
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.RoleState = {
        subscribe: subscribe,
        getAllRoles: getAllRoles,
        getRole: getRole,
        getRoleByName: getRoleByName,
        getRolesByCategory: getRolesByCategory,
        getCategories: getCategories,
        getUIState: getUIState,
        updateUIState: updateUIState,

        _addRole: _addRole,
        _updateRole: _updateRole,
        _deleteRole: _deleteRole,
        _setRoles: _setRoles,
        _rebuildCaches: _rebuildCaches,
        _persistState: _persistState,
        _initializeState: _initializeState,

        _getState: function() { return _state; }
    };

    // =========================================================================
    // 8. LEGACY ALIASES
    // =========================================================================

    window._getRoles = function() {
        return RoleState.getAllRoles();
    };

    window._getRoleById = function(id) {
        return RoleState.getRole(id);
    };

    window._getRoleCategories = function() {
        return RoleState.getCategories();
    };

    // =========================================================================
    // 9. INITIALIZE ON LOAD
    // =========================================================================

    _initializeState();

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            RoleState: window.RoleState,
            subscribe: subscribe,
            getAllRoles: getAllRoles,
            getRole: getRole,
            getRoleByName: getRoleByName,
            getRolesByCategory: getRolesByCategory,
            getCategories: getCategories
        };
    }

})();