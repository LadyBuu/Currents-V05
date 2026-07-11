/**
 * =============================================================================
 * STILL WATERS - INDUSTRY STATE (industry-state.js)
 * =============================================================================
 * 
 * LOCATION: js/core/industry/industry-state.js
 * 
 * Single source of truth for all enterprise data.
 * 
 * DEPENDENCIES:
 *   - storage.js (masterData)
 *   - ids.js (generateId)
 *   - accessors.js (getPlaceById)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. STATE DEFINITION
    // =========================================================================

    var _state = {
        enterprises: [],
        enterpriseTypes: [],
        cache: {
            byId: new Map(),
            byOwner: new Map(),
            byLocation: new Map(),
            byType: new Map(),
            byStatus: new Map()
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
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    }

    // =========================================================================
    // 3. DATA LOADING
    // =========================================================================

    function _loadEnterprises() {
        var master = _getMasterData();
        if (master && master.data) {
            if (!master.data.enterprises) {
                master.data.enterprises = [];
            }
            return master.data.enterprises;
        }
        return [];
    }

    function _loadEnterpriseTypes() {
        var master = _getMasterData();
        if (master && master.data) {
            if (!master.data.enterpriseTypes) {
                master.data.enterpriseTypes = [];
            }
            return master.data.enterpriseTypes;
        }
        return [];
    }

    function _loadData() {
        _state.enterprises = _loadEnterprises();
        _state.enterpriseTypes = _loadEnterpriseTypes();
        _rebuildCaches();
    }

    // =========================================================================
    // 4. CACHE MANAGEMENT
    // =========================================================================

    function _rebuildCaches() {
        var cache = _state.cache;
        cache.byId.clear();
        cache.byOwner.clear();
        cache.byLocation.clear();
        cache.byType.clear();
        cache.byStatus.clear();

        var enterprises = _state.enterprises;
        for (var i = 0; i < enterprises.length; i++) {
            var e = enterprises[i];
            if (!e || !e.id) continue;

            cache.byId.set(e.id, e);

            var ownerKey = e.ownerType + ':' + (e.ownerId || 'none');
            if (!cache.byOwner.has(ownerKey)) {
                cache.byOwner.set(ownerKey, []);
            }
            cache.byOwner.get(ownerKey).push(e);

            var locationKey = e.locationId || 'none';
            if (!cache.byLocation.has(locationKey)) {
                cache.byLocation.set(locationKey, []);
            }
            cache.byLocation.get(locationKey).push(e);

            var typeKey = e.typeId || 'none';
            if (!cache.byType.has(typeKey)) {
                cache.byType.set(typeKey, []);
            }
            cache.byType.get(typeKey).push(e);

            var statusKey = e.status || 'active';
            if (!cache.byStatus.has(statusKey)) {
                cache.byStatus.set(statusKey, []);
            }
            cache.byStatus.get(statusKey).push(e);
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

    function _setEnterprises(enterprises) {
        _state.enterprises = enterprises;
        var master = _getMasterData();
        if (master && master.data) {
            master.data.enterprises = enterprises;
        }
        _rebuildCaches();
        _saveMasterData();
        _notifySubscribers({ type: 'change', data: { enterprises: enterprises } });
    }

    function _setEnterpriseTypes(types) {
        _state.enterpriseTypes = types;
        var master = _getMasterData();
        if (master && master.data) {
            master.data.enterpriseTypes = types;
        }
        _rebuildCaches();
        _saveMasterData();
        _notifySubscribers({ type: 'typesChange', data: { types: types } });
    }

    // =========================================================================
    // 7. PUBLIC API
    // =========================================================================

    var IndustryState = {

        // ---- Data Access ----
        getEnterprise: function(id) {
            if (!id) return null;
            if (_state.cache.byId.has(id)) {
                return _state.cache.byId.get(id);
            }
            return null;
        },

        getAllEnterprises: function() {
            return _state.enterprises.slice();
        },

        getEnterprisesByOwner: function(ownerId, ownerType) {
            ownerType = ownerType || 'character';
            var key = ownerType + ':' + (ownerId || 'none');
            var result = _state.cache.byOwner.get(key);
            return result ? result.slice() : [];
        },

        getEnterprisesByLocation: function(locationId) {
            var key = locationId || 'none';
            var result = _state.cache.byLocation.get(key);
            return result ? result.slice() : [];
        },

        getEnterprisesByType: function(typeId) {
            var key = typeId || 'none';
            var result = _state.cache.byType.get(key);
            return result ? result.slice() : [];
        },

        getEnterprisesByStatus: function(status) {
            var key = status || 'active';
            var result = _state.cache.byStatus.get(key);
            return result ? result.slice() : [];
        },

        getEnterpriseTypes: function() {
            return _state.enterpriseTypes.slice();
        },

        getEnterpriseTypeById: function(id) {
            var types = _state.enterpriseTypes;
            for (var i = 0; i < types.length; i++) {
                if (types[i].id === id) {
                    return types[i];
                }
            }
            return null;
        },

        // ---- State Mutation (Internal use only) ----
        _setEnterprises: _setEnterprises,
        _setEnterpriseTypes: _setEnterpriseTypes,
        _loadData: _loadData,
        _getState: function() { return _state; },

        // ---- Cache ----
        invalidateCache: invalidateCache,

        // ---- Subscriptions ----
        subscribe: subscribe,

        // ---- Helper ----
        isProcessing: function() {
            return _state._processingState;
        }
    };

    // =========================================================================
    // 8. AUTO-LOAD
    // =========================================================================

    // Load data on initialization
    _loadData();

    // Listen for master data updates
    if (typeof window !== 'undefined') {
        window.addEventListener('masterDataUpdated', function() {
            _loadData();
        });
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.IndustryState = IndustryState;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = IndustryState;
    }

})();