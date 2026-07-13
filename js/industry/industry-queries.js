/**
 * =============================================================================
 * STILL WATERS - INDUSTRY QUERIES (industry-queries.js)
 * =============================================================================
 * 
 * LOCATION: js/core/industry/industry-queries.js
 * 
 * All read operations for the industry system.
 * 
 * UPDATED: Added getPublicEnterprises() and getPrivateEnterprises()
 *          Added getEnterpriseOwnershipType()
 *          Updated getEnterpriseSummary() to include ownership type
 * 
 * DEPENDENCIES:
 *   - industry-state.js (IndustryState)
 *   - accessors.js (getCharacterById, getPlaceById, getHouseholdById)
 *   - time.js (getCurrentYearSafe)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY REFERENCES
    // =========================================================================

    // All functions are available globally from accessors.js and time.js
    // No wrapper functions needed - use them directly!

    // =========================================================================
    // 2. RECURSION GUARD
    // =========================================================================

    var _processing = false;

    // =========================================================================
    // 3. ENTERPRISE QUERIES
    // =========================================================================

    function getEnterprise(id) {
        if (_processing) return null;
        _processing = true;
        try {
            var state = window.IndustryState;
            if (!state) return null;
            return state.getEnterprise(id);
        } finally {
            _processing = false;
        }
    }

    function getAllEnterprises() {
        if (_processing) return [];
        _processing = true;
        try {
            var state = window.IndustryState;
            if (!state) return [];
            return state.getAllEnterprises();
        } finally {
            _processing = false;
        }
    }

    function getEnterprisesByOwner(ownerId, ownerType) {
        if (_processing) return [];
        _processing = true;
        try {
            var state = window.IndustryState;
            if (!state) return [];
            return state.getEnterprisesByOwner(ownerId, ownerType);
        } finally {
            _processing = false;
        }
    }

    function getEnterprisesByLocation(locationId) {
        if (_processing) return [];
        _processing = true;
        try {
            var state = window.IndustryState;
            if (!state) return [];
            return state.getEnterprisesByLocation(locationId);
        } finally {
            _processing = false;
        }
    }

    function getEnterprisesByCategory(category) {
        if (_processing) return [];
        _processing = true;
        try {
            var state = window.IndustryState;
            if (!state) return [];
            var all = state.getAllEnterprises();
            var result = [];
            for (var i = 0; i < all.length; i++) {
                if (all[i].category === category) {
                    result.push(all[i]);
                }
            }
            return result;
        } finally {
            _processing = false;
        }
    }

    function getEnterprisesByStatus(status) {
        if (_processing) return [];
        _processing = true;
        try {
            var state = window.IndustryState;
            if (!state) return [];
            return state.getEnterprisesByStatus(status);
        } finally {
            _processing = false;
        }
    }

    function getStateEnterprises(locationId) {
        if (_processing) return [];
        _processing = true;
        try {
            var state = window.IndustryState;
            if (!state) return [];
            var all = state.getAllEnterprises();
            var result = [];
            for (var i = 0; i < all.length; i++) {
                if (all[i].ownerType === 'state' && all[i].ownerId === locationId) {
                    result.push(all[i]);
                }
            }
            return result;
        } finally {
            _processing = false;
        }
    }

    function getWorkerWage(enterpriseId, workerId) {
        if (_processing) return 0;
        _processing = true;
        try {
            var enterprise = getEnterprise(enterpriseId);
            if (!enterprise || !enterprise.workerWages) return enterprise ? enterprise.wages || 0 : 0;
            return enterprise.workerWages[workerId] || enterprise.wages || 0;
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 4. OWNERSHIP TYPE QUERIES (NEW)
    // =========================================================================

    /**
     * Gets enterprises by ownership type (public or private)
     * @param {string} ownershipType - 'public' or 'private'
     * @param {string} locationId - Optional location filter
     * @returns {Array} Array of enterprises
     */
    function getEnterprisesByOwnershipType(ownershipType, locationId) {
        if (_processing) return [];
        _processing = true;
        try {
            var state = window.IndustryState;
            if (!state) return [];
            var enterprises = state.getEnterprisesByOwnershipType(ownershipType);
            if (locationId) {
                return enterprises.filter(function(e) { return e.locationId === locationId; });
            }
            return enterprises;
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets public enterprises
     * @param {string} locationId - Optional location filter
     * @returns {Array} Array of public enterprises
     */
    function getPublicEnterprises(locationId) {
        if (_processing) return [];
        _processing = true;
        try {
            var state = window.IndustryState;
            if (!state) return [];
            return state.getPublicEnterprises(locationId);
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets private enterprises
     * @param {string} locationId - Optional location filter
     * @returns {Array} Array of private enterprises
     */
    function getPrivateEnterprises(locationId) {
        if (_processing) return [];
        _processing = true;
        try {
            var state = window.IndustryState;
            if (!state) return [];
            return state.getPrivateEnterprises(locationId);
        } finally {
            _processing = false;
        }
    }

    /**
     * Gets the ownership type of an enterprise
     * @param {string} enterpriseId - Enterprise ID
     * @returns {string} 'public' or 'private'
     */
    function getEnterpriseOwnershipType(enterpriseId) {
        if (_processing) return 'private';
        _processing = true;
        try {
            var enterprise = getEnterprise(enterpriseId);
            if (!enterprise) return 'private';
            return enterprise.ownershipType || 'private';
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 5. ENTERPRISE SUMMARY (UPDATED with ownership type)
    // =========================================================================

    function getEnterpriseSummary(enterpriseId) {
        if (_processing) return null;
        _processing = true;
        try {
            var enterprise = getEnterprise(enterpriseId);
            if (!enterprise) return null;

            var totalWages = 0;
            var workerCount = enterprise.workerList ? enterprise.workerList.length : 0;
            if (enterprise.workerWages) {
                for (var workerId in enterprise.workerWages) {
                    if (enterprise.workerWages.hasOwnProperty(workerId)) {
                        totalWages += enterprise.workerWages[workerId] || 0;
                    }
                }
            } else {
                totalWages = workerCount * (enterprise.wages || 8);
            }

            var annualProfit = (enterprise.income || 0) - (enterprise.expenses || 0) - totalWages;

            var ownerName = enterprise.ownerName;
            var owner = null;
            if (enterprise.ownerId) {
                if (enterprise.ownerType === 'character') {
                    owner = window.getCharacterById(enterprise.ownerId);
                    ownerName = owner ? owner.name + ' ' + (owner.surname || '') : ownerName;
                } else if (enterprise.ownerType === 'household') {
                    var household = window.getHouseholdById(enterprise.ownerId);
                    ownerName = household ? household.name : ownerName;
                } else if (enterprise.ownerType === 'state' || enterprise.ownerType === 'settlement') {
                    var place = window.getPlaceById(enterprise.ownerId);
                    ownerName = place ? place.displayName : ownerName;
                }
            }

            // ================================================================
            // UPDATED: Include ownership type in summary
            // ================================================================
            var ownershipType = enterprise.ownershipType || 'private';

            return {
                id: enterprise.id,
                name: enterprise.name,
                type: enterprise.typeName,
                category: enterprise.category,
                ownershipType: ownershipType,
                isPublic: ownershipType === 'public',
                ownerType: enterprise.ownerType,
                ownerId: enterprise.ownerId,
                ownerName: ownerName || 'None',
                locationId: enterprise.locationId,
                locationName: enterprise.locationName || 'Unknown',
                wealth: enterprise.wealth || 0,
                debt: enterprise.debt || 0,
                income: enterprise.income || 0,
                expenses: enterprise.expenses || 0,
                wages: enterprise.wages || 0,
                totalWages: totalWages,
                workerCount: workerCount,
                maxWorkers: enterprise.maxWorkers || 10,
                annualProfit: annualProfit,
                status: enterprise.status || 'active',
                foundedYear: enterprise.foundedYear,
                lastProcessedYear: enterprise.lastProcessedYear,
                notes: enterprise.notes || ''
            };
        } finally {
            _processing = false;
        }
    }

    function getOwnerEnterprisesSummary(ownerId, ownerType) {
        if (_processing) return [];
        _processing = true;
        try {
            var enterprises = getEnterprisesByOwner(ownerId, ownerType);
            var result = [];
            for (var i = 0; i < enterprises.length; i++) {
                result.push(getEnterpriseSummary(enterprises[i].id));
            }
            return result;
        } finally {
            _processing = false;
        }
    }

    function getLocationEnterprisesSummary(locationId) {
        if (_processing) return [];
        _processing = true;
        try {
            var enterprises = getEnterprisesByLocation(locationId);
            var result = [];
            for (var i = 0; i < enterprises.length; i++) {
                result.push(getEnterpriseSummary(enterprises[i].id));
            }
            return result;
        } finally {
            _processing = false;
        }
    }

    function searchEnterprises(query) {
        if (_processing) return [];
        _processing = true;
        try {
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
                } else if (e.ownerName && e.ownerName.toLowerCase().indexOf(lowerQuery) !== -1) {
                    result.push(e);
                }
            }
            return result;
        } finally {
            _processing = false;
        }
    }

    function getEnterpriseStatistics() {
        if (_processing) return null;
        _processing = true;
        try {
            var all = getAllEnterprises();
            var stats = {
                total: all.length,
                byStatus: {},
                byCategory: {},
                byOwnerType: {},
                byOwnershipType: {}, // NEW
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

                stats.byStatus[e.status || 'active'] = (stats.byStatus[e.status || 'active'] || 0) + 1;
                stats.byCategory[e.category || 'other'] = (stats.byCategory[e.category || 'other'] || 0) + 1;
                stats.byOwnerType[e.ownerType || 'character'] = (stats.byOwnerType[e.ownerType || 'character'] || 0) + 1;

                // ============================================================
                // NEW: Track by ownership type
                // ============================================================
                var ownershipType = e.ownershipType || 'private';
                stats.byOwnershipType[ownershipType] = (stats.byOwnershipType[ownershipType] || 0) + 1;
                if (ownershipType === 'public') {
                    stats.publicCount++;
                } else {
                    stats.privateCount++;
                }

                stats.totalWealth += summary.wealth;
                stats.totalDebt += summary.debt;
                stats.totalWorkers += summary.workerCount;

                if (summary.annualProfit > 0) stats.profitable++;
                else if (summary.annualProfit < 0) stats.unprofitable++;
            }

            return stats;
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.IndustryQueries = {
        getEnterprise: getEnterprise,
        getAllEnterprises: getAllEnterprises,
        getEnterprisesByOwner: getEnterprisesByOwner,
        getEnterprisesByLocation: getEnterprisesByLocation,
        getEnterprisesByCategory: getEnterprisesByCategory,
        getEnterprisesByStatus: getEnterprisesByStatus,
        getStateEnterprises: getStateEnterprises,
        getWorkerWage: getWorkerWage,
        getEnterpriseSummary: getEnterpriseSummary,
        getOwnerEnterprisesSummary: getOwnerEnterprisesSummary,
        getLocationEnterprisesSummary: getLocationEnterprisesSummary,
        searchEnterprises: searchEnterprises,
        getEnterpriseStatistics: getEnterpriseStatistics,
        // NEW: Ownership type queries
        getEnterprisesByOwnershipType: getEnterprisesByOwnershipType,
        getPublicEnterprises: getPublicEnterprises,
        getPrivateEnterprises: getPrivateEnterprises,
        getEnterpriseOwnershipType: getEnterpriseOwnershipType
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.IndustryQueries;
    }

})();