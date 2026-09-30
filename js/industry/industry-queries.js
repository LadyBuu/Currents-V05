/**
 * =============================================================================
 * STILL WATERS - INDUSTRY QUERIES (industry-queries.js)
 * =============================================================================
 *
 * LOCATION: js/core/industry/industry-queries.js
 *
 * Read operations for the industry system.
 *
 * ARCHITECTURAL RULES:
 *   - No recursion guards. Composition is expected.
 *   - No fabricated dependency fallbacks. Missing deps fail loudly.
 *   - No domain defaults. Missing data stays missing.
 *   - No silent catches. Errors propagate.
 *   - Reads from IndustryState (indexes) and cross-domain accessors.
 *
 * PHASE 2:
 *   - Added getEnterpriseWorkers(): resolves workerList + wages into
 *     display-ready entries with resolved character names.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY ACCESS
    // =========================================================================
    //
    // Read lazily on each call so tests can install stubs.
    // Missing dependencies throw — they are application errors, not data.

    function _requireState() {
        var state = window.IndustryState;
        if (!state) {
            throw new Error('IndustryQueries: IndustryState dependency missing');
        }
        return state;
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
    // 4. WORKER RESOLUTION
    // =========================================================================

    /**
     * Resolves an enterprise's worker list into display-ready entries.
     *
     * Authoritative model:
     *   workerList       — who is employed
     *   workerWages[id]  — per-worker wage override (optional)
     *   wages            — base wage for workers without override
     *
     * @param {string} enterpriseId
     * @returns {Array}  [{ id, name, wage }]
     *                   empty array if enterprise not found
     *                   wage may be undefined if neither override nor base wage exists
     */
    function getEnterpriseWorkers(enterpriseId) {
        var enterprise = getEnterprise(enterpriseId);
        if (!enterprise) return [];

        var list = enterprise.workerList || [];
        var overrides = enterprise.workerWages || {};
        var baseWage = enterprise.wages;

        var getChar = _requireCharacterAccessor();
        var result = [];
        for (var i = 0; i < list.length; i++) {
            var workerId = list[i];
            var character = getChar(workerId);
            var name = character
                ? (character.name + (character.surname ? ' ' + character.surname : ''))
                : workerId;

            var wage;
            if (overrides[workerId] !== undefined && overrides[workerId] !== null) {
                wage = overrides[workerId];
            } else if (baseWage !== undefined && baseWage !== null) {
                wage = baseWage;
            } else {
                wage = undefined;
            }

            result.push({
                id: workerId,
                name: name,
                wage: wage
            });
        }
        return result;
    }

    // =========================================================================
    // 5. ENTERPRISE SUMMARY
    // =========================================================================

    /**
     * Builds a summary of an enterprise.
     *
     * Missing fields stay missing. Presentation layer decides how to display.
     *
     * @param {string} enterpriseId
     * @returns {Object|null}
     */
    function getEnterpriseSummary(enterpriseId) {
        var enterprise = getEnterprise(enterpriseId);
        if (!enterprise) return null;

        var workerList = enterprise.workerList || [];
        var workerCount = workerList.length;
        var totalWages = _calculateTotalWages(enterprise, workerList);

        var income = enterprise.income;
        var expenses = enterprise.expenses;
        var annualProfit;
        if (typeof income === 'number' && typeof expenses === 'number') {
            annualProfit = income - expenses - totalWages;
        } else {
            annualProfit = undefined;
        }

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
        var baseWage = enterprise.wages;
        var overrides = enterprise.workerWages || {};
        var total = 0;

        for (var i = 0; i < workerList.length; i++) {
            var workerId = workerList[i];
            var override = overrides[workerId];
            if (override !== undefined && override !== null) {
                total += override;
            } else if (baseWage !== undefined && baseWage !== null) {
                total += baseWage;
            }
            // Neither present — worker contributes 0 to total. Not fabricated.
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
            var summary = getEnterpriseSummary(enterprises[i].id);
            if (summary) result.push(summary);
        }
        return result;
    }

    function getLocationEnterprisesSummary(locationId) {
        var enterprises = getEnterprisesByLocation(locationId);
        var result = [];
        for (var i = 0; i < enterprises.length; i++) {
            var summary = getEnterpriseSummary(enterprises[i].id);
            if (summary) result.push(summary);
        }
        return result;
    }

    // =========================================================================
    // 6. SEARCH
    // =========================================================================

    /**
     * Searches enterprises by name and type.
     *
     * Note: does NOT search by ownerName, because ownerName is derived and
     * not stored canonically. If owner-name search is required, either
     * resolve owners during search or index owner names separately.
     */
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
    // 7. STATISTICS
    // =========================================================================

    /**
     * Aggregated statistics over all enterprises.
     *
     * Enterprises with missing classification fields are counted separately
     * under an "unknown" bucket, not silently assigned to a default bucket.
     */
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
            neutral: 0,
            publicCount: 0,
            privateCount: 0,
            unknownOwnershipCount: 0
        };

        for (var i = 0; i < all.length; i++) {
            var e = all[i];
            var summary = getEnterpriseSummary(e.id);
            if (!summary) continue;

            _increment(stats.byStatus, e.status);
            _increment(stats.byCategory, e.category);
            _increment(stats.byOwnerType, e.ownerType);

            if (e.ownershipType === 'public') {
                _increment(stats.byOwnershipType, 'public');
                stats.publicCount++;
            } else if (e.ownershipType === 'private') {
                _increment(stats.byOwnershipType, 'private');
                stats.privateCount++;
            } else {
                stats.unknownOwnershipCount++;
            }

            if (typeof summary.wealth === 'number') stats.totalWealth += summary.wealth;
            if (typeof summary.debt === 'number') stats.totalDebt += summary.debt;
            stats.totalWorkers += summary.workerCount;

            if (typeof summary.annualProfit === 'number') {
                if (summary.annualProfit > 0) stats.profitable++;
                else if (summary.annualProfit < 0) stats.unprofitable++;
                else stats.neutral++;
            }
        }

        return stats;
    }

    function _increment(obj, key) {
        if (key === undefined || key === null) {
            obj._unknown = (obj._unknown || 0) + 1;
            return;
        }
        obj[key] = (obj[key] || 0) + 1;
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.IndustryQueries = {
        // Enterprise accessors
        getEnterprise: getEnterprise,
        getAllEnterprises: getAllEnterprises,
        getEnterprisesByOwner: getEnterprisesByOwner,
        getEnterprisesByLocation: getEnterprisesByLocation,
        getEnterprisesByCategory: getEnterprisesByCategory,
        getEnterprisesByStatus: getEnterprisesByStatus,
        getStateEnterprises: getStateEnterprises,

        // Ownership type queries
        getEnterprisesByOwnershipType: getEnterprisesByOwnershipType,
        getPublicEnterprises: getPublicEnterprises,
        getPrivateEnterprises: getPrivateEnterprises,
        getEnterpriseOwnershipType: getEnterpriseOwnershipType,

        // Worker resolution
        getEnterpriseWorkers: getEnterpriseWorkers,

        // Summaries
        getEnterpriseSummary: getEnterpriseSummary,
        getOwnerEnterprisesSummary: getOwnerEnterprisesSummary,
        getLocationEnterprisesSummary: getLocationEnterprisesSummary,

        // Search and statistics
        searchEnterprises: searchEnterprises,
        getEnterpriseStatistics: getEnterpriseStatistics
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.IndustryQueries;
    }

})();
