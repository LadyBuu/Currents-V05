/**
 * =============================================================================
 * STILL WATERS - INDUSTRY STATE (industry-state.js)
 * =============================================================================
 *
 * LOCATION: js/core/industry/industry-state.js
 *
 * Derived indexes and subscriptions over canonical industry data.
 *
 * ARCHITECTURAL RULES (Phase 1):
 *   - Canonical data lives in masterData.data.enterprises and
 *     masterData.data.enterpriseTypes. State does not own records.
 *   - State does not persist. Commands own save.
 *   - State does not generate IDs. Commands do.
 *   - State does not migrate, normalize, or default. Migration is explicit.
 *   - State does not resolve places, characters, or households.
 *   - State does not calculate summaries.
 *   - State does not expose mutation methods.
 *   - State does not have a processing guard.
 *   - Indexes are rebuilt from canonical data on demand.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY ACCESS
    // =========================================================================

    function _requireMasterData() {
        var md = window.masterData;
        if (!md) {
            throw new Error('IndustryState: masterData dependency missing');
        }
        return md;
    }

    function _getCanonicalEnterprises() {
        var md = _requireMasterData();
        if (!md.data) return [];
        return md.data.enterprises || [];
    }

    function _getCanonicalEnterpriseTypes() {
        var md = _requireMasterData();
        if (!md.data) return [];
        return md.data.enterpriseTypes || [];
    }

    // =========================================================================
    // 2. INTERNAL STATE (indexes + subscribers only)
    // =========================================================================

    var _indexes = {
        byId: new Map(),
        byOwner: new Map(),
        byLocation: new Map(),
        byStatus: new Map(),
        byType: new Map(),
        byOwnershipType: new Map(),

        typesById: new Map(),
        typesByCategory: new Map()
    };

    var _subscribers = [];

    // =========================================================================
    // 3. SUBSCRIPTIONS
    // =========================================================================

    function subscribe(callback) {
        if (typeof callback !== 'function') {
            return function() {};
        }
        _subscribers.push(callback);
        return function() {
            var index = _subscribers.indexOf(callback);
            if (index !== -1) {
                _subscribers.splice(index, 1);
            }
        };
    }

    function notify(eventType, data) {
        var subscribers = _subscribers.slice();
        for (var i = 0; i < subscribers.length; i++) {
            try {
                subscribers[i]({
                    type: eventType,
                    data: data,
                    timestamp: Date.now()
                });
            } catch (e) {
                if (typeof window.reportError === 'function') {
                    window.reportError(e, 'IndustryState subscriber');
                } else {
                    // Re-throw asynchronously so one broken subscriber
                    // doesn't halt notification for others, but the error
                    // remains observable.
                    setTimeout(function() { throw e; }, 0);
                }
            }
        }
    }

    // =========================================================================
    // 4. INDEX REBUILD
    // =========================================================================

    function rebuildIndexes() {
        var enterprises = _getCanonicalEnterprises();
        var types = _getCanonicalEnterpriseTypes();

        _rebuildEnterpriseIndexes(enterprises);
        _rebuildTypeIndexes(types);
    }

    function _rebuildEnterpriseIndexes(enterprises) {
        _indexes.byId.clear();
        _indexes.byOwner.clear();
        _indexes.byLocation.clear();
        _indexes.byStatus.clear();
        _indexes.byType.clear();
        _indexes.byOwnershipType.clear();

        for (var i = 0; i < enterprises.length; i++) {
            var e = enterprises[i];
            if (!e || !e.id) continue;

            _indexes.byId.set(e.id, e);

            if (e.ownerId !== undefined && e.ownerId !== null &&
                e.ownerType !== undefined && e.ownerType !== null) {
                var ownerKey = e.ownerId + '|' + e.ownerType;
                _pushToIndex(_indexes.byOwner, ownerKey, e);
            }

            if (e.locationId !== undefined && e.locationId !== null) {
                _pushToIndex(_indexes.byLocation, e.locationId, e);
            }

            if (e.status !== undefined && e.status !== null) {
                _pushToIndex(_indexes.byStatus, e.status, e);
            }

            if (e.typeId !== undefined && e.typeId !== null) {
                _pushToIndex(_indexes.byType, e.typeId, e);
            }

            if (e.ownershipType !== undefined && e.ownershipType !== null) {
                _pushToIndex(_indexes.byOwnershipType, e.ownershipType, e);
            }
        }
    }

    function _rebuildTypeIndexes(types) {
        _indexes.typesById.clear();
        _indexes.typesByCategory.clear();

        for (var i = 0; i < types.length; i++) {
            var t = types[i];
            if (!t || !t.id) continue;

            _indexes.typesById.set(t.id, t);

            if (t.category !== undefined && t.category !== null) {
                _pushToIndex(_indexes.typesByCategory, t.category, t);
            }
        }
    }

    function _pushToIndex(map, key, value) {
        var list = map.get(key);
        if (!list) {
            list = [];
            map.set(key, list);
        }
        list.push(value);
    }

    // =========================================================================
    // 5. ENTERPRISE INDEX ACCESSORS
    // =========================================================================

    function getEnterprise(id) {
        if (!id) return null;
        return _indexes.byId.get(id) || null;
    }

    function getAllEnterprises() {
        return _getCanonicalEnterprises().slice();
    }

    function getEnterprisesByOwner(ownerId, ownerType) {
        if (!ownerId || ownerType === undefined || ownerType === null) return [];
        var key = ownerId + '|' + ownerType;
        var list = _indexes.byOwner.get(key);
        return list ? list.slice() : [];
    }

    function getEnterprisesByLocation(locationId) {
        if (!locationId) return [];
        var list = _indexes.byLocation.get(locationId);
        return list ? list.slice() : [];
    }

    function getEnterprisesByType(typeId) {
        if (!typeId) return [];
        var list = _indexes.byType.get(typeId);
        return list ? list.slice() : [];
    }

    function getEnterprisesByStatus(status) {
        if (!status) return [];
        var list = _indexes.byStatus.get(status);
        return list ? list.slice() : [];
    }

    function getEnterprisesByOwnershipType(ownershipType) {
        if (!ownershipType) return [];
        var list = _indexes.byOwnershipType.get(ownershipType);
        return list ? list.slice() : [];
    }

    // =========================================================================
    // 6. TYPE INDEX ACCESSORS
    // =========================================================================

    function getEnterpriseTypes() {
        return _getCanonicalEnterpriseTypes().slice();
    }

    function getEnterpriseTypeById(id) {
        if (!id) return null;
        return _indexes.typesById.get(id) || null;
    }

    function getEnterpriseTypesByCategory(category) {
        if (!category) return [];
        var list = _indexes.typesByCategory.get(category);
        return list ? list.slice() : [];
    }

    // =========================================================================
    // 7. LIFECYCLE
    // =========================================================================

    function refreshFromMasterData() {
        rebuildIndexes();
    }

    // =========================================================================
    // 8. INITIALIZATION
    // =========================================================================

    function _initialize() {
        if (!window.masterData) return;
        rebuildIndexes();
    }

    _initialize();

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.IndustryState = {
        // Enterprise indexes
        getEnterprise: getEnterprise,
        getAllEnterprises: getAllEnterprises,
        getEnterprisesByOwner: getEnterprisesByOwner,
        getEnterprisesByLocation: getEnterprisesByLocation,
        getEnterprisesByType: getEnterprisesByType,
        getEnterprisesByStatus: getEnterprisesByStatus,
        getEnterprisesByOwnershipType: getEnterprisesByOwnershipType,

        // Type indexes
        getEnterpriseTypes: getEnterpriseTypes,
        getEnterpriseTypeById: getEnterpriseTypeById,
        getEnterpriseTypesByCategory: getEnterpriseTypesByCategory,

        // Lifecycle
        rebuildIndexes: rebuildIndexes,
        refreshFromMasterData: refreshFromMasterData,

        // Subscriptions
        subscribe: subscribe,
        notify: notify
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.IndustryState;
    }

})();
