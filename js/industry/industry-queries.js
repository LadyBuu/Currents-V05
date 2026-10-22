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
 * PHASE 3:
 *   - Resolves typeName, category, isPublic, workerCount on read.
 *   - These fields are NO LONGER stored on the canonical record.
 *   - A missing typeId resolves to null metadata, not a fabricated type.
 *
 * DEPENDENCIES (REQUIRED at load):
 *   - industry-state.js    (IndustryState)
 *   - industry-types.js    (IndustryTypes)
 *   - accessors.js         (getCharacterById, getPlaceById, getHouseholdById)
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. LOAD-TIME DEPENDENCY VERIFICATION
    // =========================================================================

    if (typeof window.IndustryState === 'undefined') {
        throw new Error(
            'industry-queries.js requires industry-state.js to load first.'
        );
    }
    if (typeof window.IndustryTypes === 'undefined') {
        throw new Error(
            'industry-queries.js requires industry-types.js to load first.'
        );
    }
    if (typeof window.getCharacterById !== 'function') {
        throw new Error(
            'industry-queries.js requires accessors.js (getCharacterById).'
        );
    }
    if (typeof window.getPlaceById !== 'function') {
        throw new Error('industry-queries.js requires accessors.js (getPlaceById).');
    }
    if (typeof window.getHouseholdById !== 'function') {
        throw new Error(
            'industry-queries.js requires accessors.js (getHouseholdById).'
        );
    }

    var IS = window.IndustryState;
    var IT = window.IndustryTypes;

    // =========================================================================
    // 2. RESOLVERS
    // =========================================================================

    /**
     * Resolves typeName and category from typeId.
     *
     * A broken reference (typeId points to a type that does not exist)
     * resolves to null metadata. It is NOT repaired.
     *
     * @param {Object} enterprise
     * @returns {{ typeName: string|null, category: string|null }}
     */
    function resolveTypeMetadata(enterprise) {
        if (!enterprise || typeof enterprise.typeId !== 'string'
            || enterprise.typeId.length === 0) {
            return { typeName: null, category: null };
        }
        var type = IT.getEnterpriseTypeById(enterprise.typeId);
        if (!type) {
            return { typeName: null, category: null };
        }
        return { typeName: type.name, category: type.category };
    }

    function resolveIsPublic(enterprise) {
        return enterprise.ownershipType === 'public';
    }

    function resolveWorkerCount(enterprise) {
        return Array.isArray(enterprise.workerList)
            ? enterprise.workerList.length
            : 0;
    }

    // =========================================================================
    // 3. ENTERPRISE QUERIES
    // =========================================================================

    function getEnterprise(id) {
        if (!id) return null;
        return IS.getEnterprise(id);
    }

    function getAllEnterprises() {
        return IS.getAllEnterprises();
    }

    function getEnterprisesByOwner(ownerId, ownerType) {
        if (!ownerId) return [];
        if (ownerType === undefined || ownerType === null) {
            throw new Error(
                'IndustryQueries.getEnterprisesByOwner: ownerType is required'
            );
        }
        return IS.getEnterprisesByOwner(ownerId, ownerType);
    }

    function getEnterprisesByLocation(locationId) {
        if (!locationId) return [];
        return IS.getEnterprisesByLocation(locationId);
    }

    function getEnterprisesByCategory(category) {
        if (!category) return [];
        var all = IS.getAllEnterprises();
        var result = [];
        for (var i = 0; i < all.length; i++) {
            var meta = resolveTypeMetadata(all[i]);
            if (meta.category === category) {
                result.push(all[i]);
            }
        }
        return result;
    }

    function getEnterprisesByStatus(status) {
        if (!status) return [];
        return IS.getEnterprisesByStatus(status);
    }

    function getStateEnterprises(locationId) {
        if (!locationId) return [];
        var all = IS.getAllEnterprises();
        var result = [];
        for (var i = 0; i < all.length; i++) {
            if (all[i].ownerType === 'state' && all[i].ownerId === locationId) {
                result.push(all[i]);
            }
        }
        return result;
    }

    // =========================================================================
    // 4. OWNERSHIP TYPE QUERIES
    // =========================================================================

    function getEnterprisesByOwnershipType(ownershipType, locationId) {
        if (!ownershipType) return [];
        var enterprises = IS.getEnterprisesByOwnershipType(ownershipType);
        if (locationId !== undefined && locationId !== null) {
            return enterprises.filter(function (e) {
                return e.locationId === locationId;
            });
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
    // 5. WORKER RESOLUTION
    // =========================================================================

    function getEnterpriseWorkers(enterpriseId) {
        var enterprise = getEnterprise(enterpriseId);
        if (!enterprise) return [];

        var list = enterprise.workerList || [];
        var overrides = enterprise.workerWages || {};
        var baseWage = enterprise.wages;

        var result = [];
        for (var i = 0; i < list.length; i++) {
            var workerId = list[i];
            var character = window.getCharacterById(workerId);
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

            result.push({ id: workerId, name: name, wage: wage });
        }
        return result;
    }

    // =========================================================================
    // 6. ENTERPRISE SUMMARY
    // =========================================================================

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
        }
        return total;
    }

    function _resolveOwnerName(enterprise) {
        if (!enterprise.ownerId || !enterprise.ownerType) return null;

        if (enterprise.ownerType === 'character') {
            var char = window.getCharacterById(enterprise.ownerId);
            if (!char) return null;
            return char.name + (char.surname ? ' ' + char.surname : '');
        }
        if (enterprise.ownerType === 'household') {
            var hh = window.getHouseholdById(enterprise.ownerId);
            return hh ? hh.name : null;
        }
        if (enterprise.ownerType === 'state' || enterprise.ownerType === 'settlement') {
            var place = window.getPlaceById(enterprise.ownerId);
            return place ? place.displayName : null;
        }
        return null;
    }

    function _resolveLocationName(enterprise) {
        if (!enterprise.locationId) return null;
        var place = window.getPlaceById(enterprise.locationId);
        return place ? place.displayName : null;
    }

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

        var typeMeta = resolveTypeMetadata(enterprise);
        var ownerName = _resolveOwnerName(enterprise);
        var locationName = _resolveLocationName(enterprise);
        var isPublic = resolveIsPublic(enterprise);

        return {
            id: enterprise.id,
            name: enterprise.name,
            type: typeMeta.typeName,
            category: typeMeta.category,

            ownershipType: enterprise.ownershipType,
            isPublic: isPublic,

            ownerType: enterprise.ownerType,
            ownerId: enterprise.ownerId,
            ownerName: ownerName,

            locationId: enterprise.locationId,
            locationName: locationName,

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
    // 7. SEARCH
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
                continue;
            }
            var meta = resolveTypeMetadata(e);
            if (meta.typeName
                && meta.typeName.toLowerCase().indexOf(lowerQuery) !== -1) {
                result.push(e);
            }
        }
        return result;
    }

    // =========================================================================
    // 8. STATISTICS
    // =========================================================================

    function _increment(obj, key) {
        if (key === undefined || key === null) {
            obj._unknown = (obj._unknown || 0) + 1;
            return;
        }
        obj[key] = (obj[key] || 0) + 1;
    }

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
            unknownOwnershipCount: 0,
            brokenTypeReferences: 0
        };

        for (var i = 0; i < all.length; i++) {
            var e = all[i];
            var summary = getEnterpriseSummary(e.id);
            if (!summary) continue;

            _increment(stats.byStatus, e.status);

            var meta = resolveTypeMetadata(e);
            if (meta.category) {
                _increment(stats.byCategory, meta.category);
            } else {
                stats.brokenTypeReferences++;
            }

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
            stats.totalWorkers += resolveWorkerCount(e);

            if (typeof summary.annualProfit === 'number') {
                if (summary.annualProfit > 0) stats.profitable++;
                else if (summary.annualProfit < 0) stats.unprofitable++;
                else stats.neutral++;
            }
        }

        return stats;
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.IndustryQueries = Object.freeze({
        getEnterprise: getEnterprise,
        getAllEnterprises: getAllEnterprises,
        getEnterprisesByOwner: getEnterprisesByOwner,
        getEnterprisesByLocation: getEnterprisesByLocation,
        getEnterprisesByCategory: getEnterprisesByCategory,
        getEnterprisesByStatus: getEnterprisesByStatus,
        getStateEnterprises: getStateEnterprises,

        getEnterprisesByOwnershipType: getEnterprisesByOwnershipType,
        getPublicEnterprises: getPublicEnterprises,
        getPrivateEnterprises: getPrivateEnterprises,
        getEnterpriseOwnershipType: getEnterpriseOwnershipType,

        getEnterpriseWorkers: getEnterpriseWorkers,

        getEnterpriseSummary: getEnterpriseSummary,
        getOwnerEnterprisesSummary: getOwnerEnterprisesSummary,
        getLocationEnterprisesSummary: getLocationEnterprisesSummary,

        searchEnterprises: searchEnterprises,
        getEnterpriseStatistics: getEnterpriseStatistics,

        resolveTypeMetadata: resolveTypeMetadata,
        resolveIsPublic: resolveIsPublic,
        resolveWorkerCount: resolveWorkerCount
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.IndustryQueries;
    }
})();
