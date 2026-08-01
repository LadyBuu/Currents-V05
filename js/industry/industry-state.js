/**
 * =============================================================================
 * STILL WATERS - INDUSTRY STATE (industry-state.js)
 * =============================================================================
 * 
 * Single source of truth for all enterprise data.
 * Manages caching, subscriptions, and data persistence.
 * 
 * DEPENDENCIES:
 *   - storage.js (masterData, saveMasterData)
 *   - ids.js (generateId)
 *   - accessors.js (getPlaceById)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARDS
    // =========================================================================

    var _processingState = false;
    var _initialized = false;

    // =========================================================================
    // 2. INTERNAL STATE
    // =========================================================================

    var _state = {
        enterprises: [],
        enterpriseTypes: [],
        cache: {
            byId: new Map(),
            byOwner: new Map(),
            byLocation: new Map(),
            byStatus: new Map(),
            byType: new Map(),
            byOwnershipType: new Map(),
            summary: new Map()
        },
        subscribers: [],
        _processingState: false,
        _initialized: false
    };

    // =========================================================================
    // 3. DEPENDENCY WRAPPERS
    // =========================================================================

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

    function _getMasterData() {
        if (typeof window.masterData !== 'undefined') {
            return window.masterData;
        }
        return null;
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    // =========================================================================
    // 4. NOTIFICATION SYSTEM
    // =========================================================================

    function _notifySubscribers(eventType, data) {
        var subscribers = _state.subscribers.slice();
        for (var i = 0; i < subscribers.length; i++) {
            try {
                subscribers[i]({
                    type: eventType,
                    data: data,
                    timestamp: Date.now()
                });
            } catch (e) {
                // Ignore subscriber errors
            }
        }
    }

    function subscribe(callback) {
        if (typeof callback !== 'function') {
            return function() {};
        }
        _state.subscribers.push(callback);
        return function() {
            var index = _state.subscribers.indexOf(callback);
            if (index !== -1) {
                _state.subscribers.splice(index, 1);
            }
        };
    }

    // =========================================================================
    // 5. CACHE MANAGEMENT
    // =========================================================================

    function _rebuildCaches() {
        if (_processingState) return;
        _processingState = true;

        try {
            var enterprises = _state.enterprises;

            // Clear all caches
            _state.cache.byId.clear();
            _state.cache.byOwner.clear();
            _state.cache.byLocation.clear();
            _state.cache.byStatus.clear();
            _state.cache.byType.clear();
            _state.cache.byOwnershipType.clear();
            _state.cache.summary.clear();

            // Rebuild caches
            for (var i = 0; i < enterprises.length; i++) {
                var e = enterprises[i];
                if (!e) continue;

                // byId
                _state.cache.byId.set(e.id, e);

                // byOwner
                if (e.ownerId) {
                    var ownerKey = e.ownerId + '|' + (e.ownerType || 'unknown');
                    if (!_state.cache.byOwner.has(ownerKey)) {
                        _state.cache.byOwner.set(ownerKey, []);
                    }
                    _state.cache.byOwner.get(ownerKey).push(e);
                }

                // byLocation
                if (e.locationId) {
                    if (!_state.cache.byLocation.has(e.locationId)) {
                        _state.cache.byLocation.set(e.locationId, []);
                    }
                    _state.cache.byLocation.get(e.locationId).push(e);
                }

                // byStatus
                var status = e.status || 'active';
                if (!_state.cache.byStatus.has(status)) {
                    _state.cache.byStatus.set(status, []);
                }
                _state.cache.byStatus.get(status).push(e);

                // byType
                if (e.typeId) {
                    if (!_state.cache.byType.has(e.typeId)) {
                        _state.cache.byType.set(e.typeId, []);
                    }
                    _state.cache.byType.get(e.typeId).push(e);
                }

                // byOwnershipType
                var ownershipType = e.ownershipType || 'private';
                if (!_state.cache.byOwnershipType.has(ownershipType)) {
                    _state.cache.byOwnershipType.set(ownershipType, []);
                }
                _state.cache.byOwnershipType.get(ownershipType).push(e);

                // summary
                _state.cache.summary.set(e.id, _buildSummary(e));
            }

        } finally {
            _processingState = false;
        }
    }

    function _buildSummary(enterprise) {
        if (!enterprise) return null;

        var totalWages = 0;
        if (enterprise.workerWages) {
            for (var workerId in enterprise.workerWages) {
                if (enterprise.workerWages.hasOwnProperty(workerId)) {
                    totalWages += enterprise.workerWages[workerId] || 0;
                }
            }
        }

        return {
            id: enterprise.id,
            name: enterprise.name,
            type: enterprise.typeName || enterprise.typeId || 'Unknown',
            category: enterprise.category || 'Unknown',
            ownershipType: enterprise.ownershipType || 'private',
            isPublic: (enterprise.ownershipType === 'public'),
            ownerType: enterprise.ownerType || 'none',
            ownerId: enterprise.ownerId || null,
            ownerName: enterprise.ownerName || 'None',
            locationId: enterprise.locationId || null,
            locationName: enterprise.locationName || 'Unknown',
            wealth: enterprise.wealth || 0,
            debt: enterprise.debt || 0,
            income: enterprise.income || 0,
            expenses: enterprise.expenses || 0,
            wages: enterprise.wages || 0,
            totalWages: totalWages,
            workerCount: enterprise.workerCount || 0,
            maxWorkers: enterprise.maxWorkers || 0,
            annualProfit: (enterprise.income || 0) - (enterprise.expenses || 0) - totalWages,
            status: enterprise.status || 'active',
            foundedYear: enterprise.foundedYear || 0,
            lastProcessedYear: enterprise.lastProcessedYear || 0,
            notes: enterprise.notes || ''
        };
    }

    function invalidateCache() {
        _rebuildCaches();
    }

    // =========================================================================
    // 6. DATA LOADING
    // =========================================================================

    function _loadData() {
        if (_processingState) return;
        _processingState = true;

        try {
            var masterData = _getMasterData();
            if (!masterData) return;

            // Load enterprises
            if (masterData.data && masterData.data.enterprises) {
                _state.enterprises = masterData.data.enterprises.slice();
            } else if (masterData.enterprises) {
                _state.enterprises = masterData.enterprises.slice();
            } else {
                _state.enterprises = [];
            }

            // Load enterprise types
            if (masterData.data && masterData.data.enterpriseTypes) {
                _state.enterpriseTypes = masterData.data.enterpriseTypes.slice();
            } else if (masterData.enterpriseTypes) {
                _state.enterpriseTypes = masterData.enterpriseTypes.slice();
            } else {
                _state.enterpriseTypes = [];
            }

            // Initialize enterprise fields if needed
            for (var i = 0; i < _state.enterprises.length; i++) {
                _ensureEnterpriseInitialized(_state.enterprises[i]);
            }

            _rebuildCaches();
            _initialized = true;

        } finally {
            _processingState = false;
        }
    }

    function _ensureEnterpriseInitialized(enterprise) {
        if (!enterprise) return;

        // Ownership fields
        if (enterprise.ownershipType === undefined) {
            enterprise.ownershipType = 'private';
        }
        if (enterprise.isPublic === undefined) {
            enterprise.isPublic = (enterprise.ownershipType === 'public');
        }
        if (enterprise.ownerType === undefined) {
            enterprise.ownerType = enterprise.ownerId ? 'character' : 'none';
        }

        // Financial fields
        if (enterprise.wealth === undefined) enterprise.wealth = 0;
        if (enterprise.debt === undefined) enterprise.debt = 0;
        if (enterprise.income === undefined) enterprise.income = 0;
        if (enterprise.expenses === undefined) enterprise.expenses = 0;
        if (enterprise.wages === undefined) enterprise.wages = 0;

        // Worker fields
        if (enterprise.workerCount === undefined) enterprise.workerCount = 0;
        if (enterprise.maxWorkers === undefined) enterprise.maxWorkers = 0;
        if (enterprise.workerList === undefined) enterprise.workerList = [];
        if (enterprise.workerWages === undefined) enterprise.workerWages = {};

        // Status fields
        if (enterprise.status === undefined) enterprise.status = 'active';
        if (enterprise.foundedYear === undefined) enterprise.foundedYear = 0;
        if (enterprise.lastProcessedYear === undefined) enterprise.lastProcessedYear = 0;

        // History
        if (enterprise.history === undefined) enterprise.history = [];

        // Metadata
        if (enterprise.notes === undefined) enterprise.notes = '';
        if (enterprise.createdAt === undefined) enterprise.createdAt = Date.now();
        if (enterprise.updatedAt === undefined) enterprise.updatedAt = Date.now();

        // Location fields
        if (!enterprise.locationName && enterprise.locationId) {
            var place = _getPlaceById(enterprise.locationId);
            if (place) {
                enterprise.locationName = place.displayName || 'Unknown';
            }
        }
    }

    // =========================================================================
    // 7. ENTERPRISE ACCESSORS
    // =========================================================================

    function getEnterprise(id) {
        if (!id) return null;
        return _state.cache.byId.get(id) || null;
    }

    function getAllEnterprises() {
        return _state.enterprises.slice();
    }

    function getEnterprisesByOwner(ownerId, ownerType) {
        if (!ownerId) return [];
        var key = ownerId + '|' + (ownerType || 'unknown');
        var results = _state.cache.byOwner.get(key);
        return results ? results.slice() : [];
    }

    function getEnterprisesByLocation(locationId) {
        if (!locationId) return [];
        var results = _state.cache.byLocation.get(locationId);
        return results ? results.slice() : [];
    }

    function getEnterprisesByType(typeId) {
        if (!typeId) return [];
        var results = _state.cache.byType.get(typeId);
        return results ? results.slice() : [];
    }

    function getEnterprisesByStatus(status) {
        if (!status) return [];
        var results = _state.cache.byStatus.get(status);
        return results ? results.slice() : [];
    }

    // =========================================================================
    // 8. OWNERSHIP TYPE ACCESSORS
    // =========================================================================

    function getEnterprisesByOwnershipType(ownershipType) {
        if (!ownershipType) return [];
        var results = _state.cache.byOwnershipType.get(ownershipType);
        return results ? results.slice() : [];
    }

    function getPublicEnterprises(locationId) {
        var results = getEnterprisesByOwnershipType('public');
        if (locationId) {
            results = results.filter(function(e) {
                return e.locationId === locationId;
            });
        }
        return results;
    }

    function getPrivateEnterprises(locationId) {
        var results = getEnterprisesByOwnershipType('private');
        if (locationId) {
            results = results.filter(function(e) {
                return e.locationId === locationId;
            });
        }
        return results;
    }

    // =========================================================================
    // 9. ENTERPRISE TYPE ACCESSORS
    // =========================================================================

    function getEnterpriseTypes() {
        return _state.enterpriseTypes.slice();
    }

    function getEnterpriseTypeById(id) {
        if (!id) return null;
        for (var i = 0; i < _state.enterpriseTypes.length; i++) {
            if (_state.enterpriseTypes[i].id === id) {
                return _state.enterpriseTypes[i];
            }
        }
        return null;
    }

    // =========================================================================
    // 10. INTERNAL STATE MUTATORS
    // =========================================================================

    function _setEnterprises(enterprises) {
        if (_processingState) return;
        _processingState = true;

        try {
            _state.enterprises = enterprises.slice();
            for (var i = 0; i < _state.enterprises.length; i++) {
                _ensureEnterpriseInitialized(_state.enterprises[i]);
            }
            _rebuildCaches();
            _persistState();
            _notifySubscribers('enterprises_updated', { count: _state.enterprises.length });
        } finally {
            _processingState = false;
        }
    }

    function _setEnterpriseTypes(types) {
        if (_processingState) return;
        _processingState = true;

        try {
            _state.enterpriseTypes = types.slice();
            _persistState();
            _notifySubscribers('enterprise_types_updated', { count: _state.enterpriseTypes.length });
        } finally {
            _processingState = false;
        }
    }

    function _addEnterprise(enterprise) {
        if (_processingState) return null;
        _processingState = true;

        try {
            _ensureEnterpriseInitialized(enterprise);
            if (!enterprise.id) {
                enterprise.id = _generateId('ent');
            }
            _state.enterprises.push(enterprise);
            _rebuildCaches();
            _persistState();
            _notifySubscribers('enterprise_added', { enterprise: enterprise });
            return enterprise;
        } finally {
            _processingState = false;
        }
    }

    function _updateEnterprise(id, updates) {
        if (_processingState) return null;
        _processingState = true;

        try {
            var enterprise = getEnterprise(id);
            if (!enterprise) return null;

            // Apply updates
            for (var key in updates) {
                if (updates.hasOwnProperty(key)) {
                    enterprise[key] = updates[key];
                }
            }

            enterprise.updatedAt = Date.now();
            _ensureEnterpriseInitialized(enterprise);
            _rebuildCaches();
            _persistState();
            _notifySubscribers('enterprise_updated', { enterprise: enterprise });
            return enterprise;
        } finally {
            _processingState = false;
        }
    }

    function _deleteEnterprise(id) {
        if (_processingState) return false;
        _processingState = true;

        try {
            var index = -1;
            for (var i = 0; i < _state.enterprises.length; i++) {
                if (_state.enterprises[i].id === id) {
                    index = i;
                    break;
                }
            }
            if (index === -1) return false;

            _state.enterprises.splice(index, 1);
            _rebuildCaches();
            _persistState();
            _notifySubscribers('enterprise_deleted', { id: id });
            return true;
        } finally {
            _processingState = false;
        }
    }

    // =========================================================================
    // 11. PERSISTENCE
    // =========================================================================

    function _persistState() {
        try {
            var masterData = _getMasterData();
            if (!masterData) return;

            if (!masterData.data) masterData.data = {};
            masterData.data.enterprises = _state.enterprises.slice();
            masterData.data.enterpriseTypes = _state.enterpriseTypes.slice();

            _saveMasterData();
        } catch (e) {
            // Ignore persistence errors
        }
    }

    // =========================================================================
    // 12. STATE QUERIES
    // =========================================================================

    function _getState() {
        return _state;
    }

    function isProcessing() {
        return _processingState;
    }

    function isInitialized() {
        return _initialized;
    }

    // =========================================================================
    // 13. INITIALIZATION
    // =========================================================================

    function _initializeState() {
        if (_initialized) return;
        _loadData();
        if (!_initialized) {
            _initialized = true;
        }
    }

    // Initialize on load
    _initializeState();

    // =========================================================================
    // 14. EXPORTS
    // =========================================================================

    window.IndustryState = {
        // Enterprise accessors
        getEnterprise: getEnterprise,
        getAllEnterprises: getAllEnterprises,
        getEnterprisesByOwner: getEnterprisesByOwner,
        getEnterprisesByLocation: getEnterprisesByLocation,
        getEnterprisesByType: getEnterprisesByType,
        getEnterprisesByStatus: getEnterprisesByStatus,

        // Ownership type accessors
        getEnterprisesByOwnershipType: getEnterprisesByOwnershipType,
        getPublicEnterprises: getPublicEnterprises,
        getPrivateEnterprises: getPrivateEnterprises,

        // Enterprise type accessors
        getEnterpriseTypes: getEnterpriseTypes,
        getEnterpriseTypeById: getEnterpriseTypeById,

        // Cache
        invalidateCache: invalidateCache,

        // Subscriptions
        subscribe: subscribe,

        // Internal methods (for commands)
        _setEnterprises: _setEnterprises,
        _setEnterpriseTypes: _setEnterpriseTypes,
        _addEnterprise: _addEnterprise,
        _updateEnterprise: _updateEnterprise,
        _deleteEnterprise: _deleteEnterprise,
        _loadData: _loadData,
        _getState: _getState,
        _initializeState: _initializeState,
        isProcessing: isProcessing,
        isInitialized: isInitialized
    };

    // Legacy aliases
    window._getIndustryState = function() {
        return _getState();
    };
    window._getAllEnterprises = getAllEnterprises;
    window._getEnterprise = getEnterprise;
    window._getEnterprisesByOwner = getEnterprisesByOwner;
    window._getEnterprisesByLocation = getEnterprisesByLocation;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            getEnterprise: getEnterprise,
            getAllEnterprises: getAllEnterprises,
            getEnterprisesByOwner: getEnterprisesByOwner,
            getEnterprisesByLocation: getEnterprisesByLocation,
            getEnterprisesByType: getEnterprisesByType,
            getEnterprisesByStatus: getEnterprisesByStatus,
            getEnterprisesByOwnershipType: getEnterprisesByOwnershipType,
            getPublicEnterprises: getPublicEnterprises,
            getPrivateEnterprises: getPrivateEnterprises,
            getEnterpriseTypes: getEnterpriseTypes,
            getEnterpriseTypeById: getEnterpriseTypeById,
            invalidateCache: invalidateCache,
            subscribe: subscribe
        };
    }

})();