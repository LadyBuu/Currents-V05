/**
 * =============================================================================
 * STILL WATERS - INDUSTRY QUERIES (industry-queries.js)
 * =============================================================================
 *
 * LOCATION: js/core/industry/industry-queries.js
 *
 * Read operations for the industry system.
 *
 * ARCHITECTURAL RULES (Phase 1):
 *   - No recursion guards. Composition is expected.
 *   - No fabricated dependency fallbacks. Missing deps are failures.
 *   - No domain defaults. Missing data stays missing.
 *   - No silent catches. Errors propagate.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY ACCESS
    // =========================================================================
    //
    // These are read lazily on each call so that tests can install stubs.
    // Missing dependencies are NOT silently tolerated — callers will see
    // the resulting error.

    function _requireState() {
        var state = window.IndustryState;
        if (!state) {
            throw new Error('IndustryQueries: IndustryState dependency missing');
        }
        return state;
    }

    function _requireTime() {
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error('IndustryQueries: time dependency missing (getCurrentYearSafe)');
        }
        return window.getCurrentYearSafe();
    }

    function _requireCharacterAccessor() {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('IndustryQueries: character accessor missing (getCharacterById)');
        }
        return window.getCharacterById;
    }

    function _requireHouseholdAccessor() {
        if (typeof window.getHouseholdById === 'function') {
            return window.getHouseholdById;
        }
        if (typeof window.getHousehold === 'function') {
            return window.getHousehold;
        }
        throw new Error('IndustryQueries: household accessor missing');
    }

    function _requirePlaceAccessor() {
        if (typeof window.getPlaceById !== 'function') {
            throw new Error('IndustryQueries: place accessor missing (getPlaceById)');
        }
        return window.getPlaceById;
    }

    // =========================================================================
    // 2. ENTERPRISE QUERIES
    // =========================================================================

    function getEnterprise(id) {
        if (!id) return null;
        return _requireState().getEnterprise(id);
    }

    function getAllEnterprises() {
        return _requireState().getAllEnterprises();
    }

    function getEnterprisesByOwner(ownerId, ownerType) {
        if (!ownerId) return [];
        if (ownerType === undefined || ownerType === null) {
            throw new Error('IndustryQueries.getEnterprisesByOwner: ownerType is required');
        }
        return _requireState().getEnterprisesByOwner(ownerId, ownerType);
    }

    function getEnterprisesByLocation(locationId) {
        if (!locationId) return [];
        return _requireState().getEnterprisesByLocation(locationId);
    }

    function getEnterprisesByCategory(category) {
        if (!category) return [];
        var all = _requireState().getAllEnterprises();
        var result = [];
        for (var i = 0; i < all.length; i++) {
            if (all[i].category === category) {
                result.push(all[i]);
            }
        }
        return result;
    }

    function getEnterprisesByStatus(status) {
        if (!status) return [];
        return _requireState().getEnterprisesByStatus(status);
    }

    function getStateEnterprises(locationId) {
        if (!locationId) return [];
        var all = _requireState().getAllEnterprises();
        var result = [];
        for (var i = 0; i < all.length; i++) {
            if (all[i].ownerType === 'state' && all[i].ownerId === locationId) {
                result.push(all[i]);
            }
        }
        return result;
    }

    // =========================================================================
    // 3. OWNERSHIP TYPE QUERIES
    // =========================================================================

    function getEnterprisesByOwnershipType(ownershipType, locationId) {
        if (!ownershipType) return [];
        var enterprises = _requireState().getEnterprisesByOwnershipType(ownershipType);
        if (locationId !== undefined && locationId !== null) {
            return enterprises.filter(function(e) { return e.locationId === locationId; });
        }
        return enterprises;
    }

    function getPublicEnterprises(locationId) {
        return getEnterprisesByOwnershipType('public', locationId);
    }

    function getPrivateEnterprises(locationId) {
        return getEnterprisesByOwnershipType('private', locationId);
    }

    function getEnterpriseOwnershipType(enterpriseId) {
        var enterprise = getEnterprise(enterpriseId);
        if (!enterprise) return null;
        return enterprise.ownershipType;
    }

    // =========================================================================
    // 4. ENTERPRISE SUMMARY
    // =========================================================================

    function getEnterpriseSummary(enterpriseId) {
        var enterprise = getEnterprise(enterpriseId);
        if (!enterprise) return null;

        var workerList = enterprise.workerList || [];
        var workerCount = workerList.length;
        var totalWages = _calculateTotalWages(enterprise, workerList);

        var annualProfit = (enterprise.income || 0)
            - (enterprise.expenses || 0)
            - totalWages;

        var ownerName = _resolveOwnerName(enterprise);

        return {
            id: enterprise.id,
            name: enterprise.name,
            type: enterprise.typeName,
            category: enterprise.category,
            ownershipType: enterprise.ownershipType,
            isPublic: enterprise.ownershipType === 'public',
            ownerType: enterprise.ownerType,
            ownerId: enterprise.ownerId,
            ownerName: ownerName,
            locationId: enterprise.locationId,
            locationName: enterprise.locationName,
            wealth: enterprise.wealth,
            debt: enterprise.debt,
            income: enterprise.income,
            expenses: enterprise.expenses,
            wages: enterprise.wages,
            totalWages: totalWages,
            workerCount: workerCount,
            maxWorkers: enterprise.maxWorkers,
            annualProfit: annualProfit,
            status: enterprise.status,
            foundedYear: enterprise.foundedYear,
            lastProcessedYear: enterprise.lastProcessedYear,
            notes: enterprise.notes
        };
    }

    function _calculateTotalWages(enterprise, workerList) {
        var total = 0;
        var overrides = enterprise.workerWages || {};
        var baseWage = enterprise.wages;
        if (baseWage === undefined || baseWage === null) {
            baseWage = 0;
        }
        for (var i = 0; i < workerList.length; i++) {
            var workerId = workerList[i];
            var override = overrides[workerId];
            if (override === undefined || override === null) {
                total += baseWage;
            } else {
                total += override;
            }
        }
        return total;
    }

    function _resolveOwnerName(enterprise) {
        if (!enterprise.ownerId || !enterprise.ownerType) return null;

        if (enterprise.ownerType === 'character') {
            var getChar = _requireCharacterAccessor();
            var char = getChar(enterprise.ownerId);
            if (!char) return null;
            return char.name + (char.surname ? ' ' + char.surname : '');
        }
        if (enterprise.ownerType === 'household') {
            var getHH = _requireHouseholdAccessor();
            var hh = getHH(enterprise.ownerId);
            return hh ? hh.name : null;
        }
        if (enterprise.ownerType === 'state' || enterprise.ownerType === 'settlement') {
            var getPlace = _requirePlaceAccessor();
            var place = getPlace(enterprise.ownerId);
            return place ? place.displayName : null;
        }
        return null;
    }

    function getOwnerEnterprisesSummary(ownerId, ownerType) {
        var enterprises = getEnterprisesByOwner(ownerId, ownerType);
        var result = [];
        for (var i = 0; i < enterprises.length; i++) {
            result.push(getEnterpriseSummary(enterprises[i].id));
        }
        return result;
    }

    function getLocationEnterprisesSummary(locationId) {
        var enterprises = getEnterprisesByLocation(locationId);
        var result = [];
        for (var i = 0; i < enterprises.length; i++) {
            result.push(getEnterpriseSummary(enterprises[i].id));
        }
        return result;
    }

    // =========================================================================
    // 5. SEARCH
    // =========================================================================

    function searchEnterprises(query) {
        var all = getAllEnterprises();
        if (!query || query.trim() === '') return all;

        var lowerQuery = query.toLowerCase().trim();
        var result = [];
        for (var i = 0; i < all.length; i++) {
            var e = all[i];
            if (e.name && e.name.toLowerCase().indexOf(lowerQuery) !== -1) {
                result.push(e);
            } else if (e.typeName && e.typeName.toLowerCase().indexOf(lowerQuery) !== -1) {
                result.push(e);
            }
        }
        return result;
    }

    // =========================================================================
    // 6. STATISTICS
    // =========================================================================

    function getEnterpriseStatistics() {
        var all = getAllEnterprises();
        var stats = {
            total: all.length,
            byStatus: {},
            byCategory: {},
            byOwnerType: {},
            byOwnershipType: {},
            totalWealth: 0,
            totalDebt: 0,
            totalWorkers: 0,
            profitable: 0,
            unprofitable: 0,
            publicCount: 0,
            privateCount: 0
        };

        for (var i = 0; i < all.length; i++) {
            var e = all[i];
            var summary = getEnterpriseSummary(e.id);
            if (!summary) continue;

            _increment(stats.byStatus, e.status);
            _increment(stats.byCategory, e.category);
            _increment(stats.byOwnerType, e.ownerType);
            _increment(stats.byOwnershipType, e.ownershipType);

            if (e.ownershipType === 'public') stats.publicCount++;
            else if (e.ownershipType === 'private') stats.privateCount++;

            stats.totalWealth += summary.wealth || 0;
            stats.totalDebt += summary.debt || 0;
            stats.totalWorkers += summary.workerCount;

            if (summary.annualProfit > 0) stats.profitable++;
            else if (summary.annualProfit < 0) stats.unprofitable++;
        }

        return stats;
    }

    function _increment(obj, key) {
        if (key === undefined || key === null) return;
        obj[key] = (obj[key] || 0) + 1;
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.IndustryQueries = {
        getEnterprise: getEnterprise,
        getAllEnterprises: getAllEnterprises,
        getEnterprisesByOwner: getEnterprisesByOwner,
        getEnterprisesByLocation: getEnterprisesByLocation,
        getEnterprisesByCategory: getEnterprisesByCategory,
        getEnterprisesByStatus: getEnterprisesByStatus,
        getStateEnterprises: getStateEnterprises,
        getEnterpriseSummary: getEnterpriseSummary,
        getOwnerEnterprisesSummary: getOwnerEnterprisesSummary,
        getLocationEnterprisesSummary: getLocationEnterprisesSummary,
        searchEnterprises: searchEnterprises,
        getEnterpriseStatistics: getEnterpriseStatistics,
        getEnterprisesByOwnershipType: getEnterprisesByOwnershipType,
        getPublicEnterprises: getPublicEnterprises,
        getPrivateEnterprises: getPrivateEnterprises,
        getEnterpriseOwnershipType: getEnterpriseOwnershipType
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.IndustryQueries;
    }

})();
