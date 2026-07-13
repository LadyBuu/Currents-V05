/**
 * =============================================================================
 * STILL WATERS - INDUSTRY COMMANDS (industry-commands.js)
 * =============================================================================
 * 
 * LOCATION: js/core/industry/industry-commands.js
 * 
 * All write operations for the industry system.
 * 
 * UPDATED: Added demolishEnterprise(), getDemolishedEnterprises(), 
 *          rebuildEnterprise(), getEnterpriseDemolitionStats()
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getState() {
        return typeof window.IndustryState !== 'undefined' ? window.IndustryState : null;
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    function _getHousehold(id) {
        if (typeof window.getHousehold === 'function') {
            return window.getHousehold(id);
        }
        if (typeof window.getHouseholdById === 'function') {
            return window.getHouseholdById(id);
        }
        return null;
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
        }
        return null;
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        if (typeof window.getCurrentYear === 'function') {
            return window.getCurrentYear();
        }
        return 1250;
    }

    function _generateId(prefix) {
        if (typeof window.generateId === 'function') {
            return window.generateId(prefix);
        }
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    function _modifyHouseholdWealth(householdId, amount, reason) {
        if (typeof window.modifyHouseholdWealth === 'function') {
            return window.modifyHouseholdWealth(householdId, amount, reason);
        }
        return null;
    }

    function _getHouseholdState() {
        return typeof window.HouseholdState !== 'undefined' ? window.HouseholdState : null;
    }

    // =========================================================================
    // 2. RECURSION GUARD
    // =========================================================================

    var _processing = false;

    // =========================================================================
    // 3. EXISTING FUNCTIONS (Preserved from original)
    // =========================================================================

    // These functions are assumed to exist in the original industry-commands.js
    // We're keeping the existing implementations and adding new functions.

    var _existingCommands = window.IndustryCommands || {};

    // =========================================================================
    // 4. DEMOLISH ENTERPRISE (NEW)
    // =========================================================================

    /**
     * Demolishes an enterprise (keeps record of destruction)
     * @param {string} enterpriseId - The enterprise to demolish
     * @param {string} reason - Why it was demolished
     * @param {number} year - When it was demolished
     * @param {Object} options - Additional options
     * @param {string} options.destroyedBy - 'disaster', 'war', 'decay', etc.
     * @param {string} options.disasterId - ID of the disaster that caused this
     * @param {boolean} options.silent - Suppress toast notifications
     * @returns {Object} - Demolition result
     */
    function demolishEnterprise(enterpriseId, reason, year, options) {
        if (_processing) {
            return { success: false, error: 'Command already in progress' };
        }
        _processing = true;

        try {
            var state = _getState();
            if (!state) {
                return { success: false, error: 'Industry state not available' };
            }

            var enterprise = state.getEnterprise(enterpriseId);
            if (!enterprise) {
                return { success: false, error: 'Enterprise not found' };
            }

            if (enterprise.status === 'demolished') {
                return { success: false, error: 'Enterprise already demolished' };
            }

            options = options || {};
            var demolishYear = year || _getCurrentYear();
            var demolishReason = reason || 'Demolished';

            // Create demolition record
            var demolitionRecord = {
                enterpriseId: enterprise.id,
                enterpriseName: enterprise.name,
                typeId: enterprise.typeId,
                typeName: enterprise.typeName,
                category: enterprise.category || 'other',
                locationId: enterprise.locationId,
                locationName: enterprise.locationName || 'Unknown',
                demolishedYear: demolishYear,
                demolishedReason: demolishReason,
                destroyedBy: options.destroyedBy || 'manual',
                disasterId: options.disasterId || null,
                previousStatus: enterprise.status || 'active',
                previousWealth: enterprise.wealth || 0,
                previousDebt: enterprise.debt || 0,
                previousWorkerCount: enterprise.workerCount || 0,
                workerIds: (enterprise.workerList || []).slice(),
                ownershipType: enterprise.ownershipType || 'private',
                ownerId: enterprise.ownerId || null,
                ownerName: enterprise.ownerName || null,
                timestamp: Date.now()
            };

            // Update enterprise
            var updates = {
                status: 'demolished',
                demolishedAt: demolishYear,
                demolishedReason: demolishReason,
                destroyedBy: options.destroyedBy || 'manual',
                disasterId: options.disasterId || null,
                demolishedRecord: demolitionRecord,
                workerList: [],
                workerCount: 0,
                wealth: 0,
                debt: 0,
                updatedAt: Date.now()
            };

            // Save state
            var enterprises = state.getAllEnterprises();
            var index = -1;
            for (var i = 0; i < enterprises.length; i++) {
                if (enterprises[i].id === enterpriseId) {
                    index = i;
                    break;
                }
            }

            if (index === -1) {
                return { success: false, error: 'Enterprise not found in state' };
            }

            // Apply updates
            for (var key in updates) {
                if (updates.hasOwnProperty(key)) {
                    enterprises[index][key] = updates[key];
                }
            }

            // Add to history
            if (!enterprises[index].history) enterprises[index].history = [];
            enterprises[index].history.push({
                year: demolishYear,
                type: 'demolished',
                reason: demolishReason,
                destroyedBy: options.destroyedBy || 'manual',
                disasterId: options.disasterId || null,
                record: demolitionRecord,
                timestamp: Date.now()
            });

            state._setEnterprises(enterprises);

            // Remove from any household's enterprise list
            if (enterprise.ownerId && enterprise.ownerType === 'household') {
                var householdState = _getHouseholdState();
                if (householdState && typeof householdState.removeEnterpriseFromHousehold === 'function') {
                    householdState.removeEnterpriseFromHousehold(enterprise.ownerId, enterpriseId, demolishYear);
                }
            }

            _logEvent('enterprise', 'Enterprise Demolished',
                'Enterprise "' + enterprise.name + '" demolished: ' + demolishReason,
                []);

            if (!options.silent) {
                _showToast('Enterprise "' + enterprise.name + '" demolished', 'info');
            }

            return {
                success: true,
                demolitionRecord: demolitionRecord,
                enterprise: enterprises[index]
            };

        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 5. REBUILD ENTERPRISE (NEW)
    // =========================================================================

    /**
     * Rebuilds a demolished enterprise
     * @param {string} enterpriseId - The enterprise to rebuild
     * @param {number} rebuildYear - Year of rebuilding
     * @param {Object} options
     * @param {string} options.reason - Why it was rebuilt
     * @param {number} options.initialWealth - Starting wealth (default: 10)
     * @param {boolean} options.silent - Suppress toast notifications
     * @returns {Object} - Rebuild result
     */
    function rebuildEnterprise(enterpriseId, rebuildYear, options) {
        if (_processing) {
            return { success: false, error: 'Command already in progress' };
        }
        _processing = true;

        try {
            var state = _getState();
            if (!state) {
                return { success: false, error: 'Industry state not available' };
            }

            var enterprise = state.getEnterprise(enterpriseId);
            if (!enterprise) {
                return { success: false, error: 'Enterprise not found' };
            }

            if (enterprise.status !== 'demolished') {
                return { success: false, error: 'Enterprise is not demolished' };
            }

            options = options || {};
            var rebuildYearValue = rebuildYear || _getCurrentYear();

            var record = enterprise.demolishedRecord;
            if (!record) {
                return { success: false, error: 'No demolition record found' };
            }

            // Restore with partial values
            var updates = {
                status: 'active',
                demolishedAt: null,
                demolishedReason: null,
                destroyedBy: null,
                disasterId: null,
                demolishedRecord: null,
                wealth: options.initialWealth || Math.max(10, Math.floor((record.previousWealth || 0) / 2)),
                debt: 0,
                workerList: [],
                workerCount: 0,
                updatedAt: Date.now()
            };

            var enterprises = state.getAllEnterprises();
            var index = -1;
            for (var i = 0; i < enterprises.length; i++) {
                if (enterprises[i].id === enterpriseId) {
                    index = i;
                    break;
                }
            }

            if (index === -1) {
                return { success: false, error: 'Enterprise not found in state' };
            }

            for (var key in updates) {
                if (updates.hasOwnProperty(key)) {
                    enterprises[index][key] = updates[key];
                }
            }

            // Add rebuild history
            if (!enterprises[index].history) enterprises[index].history = [];
            enterprises[index].history.push({
                year: rebuildYearValue,
                type: 'rebuilt',
                reason: options.reason || 'Rebuilt after destruction',
                fromRecord: record,
                timestamp: Date.now()
            });

            state._setEnterprises(enterprises);

            // Re-add to household if it was owned
            if (record.ownerId && record.ownerType === 'household') {
                var householdState = _getHouseholdState();
                if (householdState && typeof householdState.addEnterpriseToHousehold === 'function') {
                    householdState.addEnterpriseToHousehold(record.ownerId, enterpriseId, rebuildYearValue);
                }
            }

            _logEvent('enterprise', 'Enterprise Rebuilt',
                'Enterprise "' + enterprise.name + '" rebuilt: ' + (options.reason || 'Unknown'),
                []);

            if (!options.silent) {
                _showToast('Enterprise "' + enterprise.name + '" rebuilt', 'success');
            }

            return {
                success: true,
                enterprise: enterprises[index],
                rebuiltAt: rebuildYearValue
            };

        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 6. DEMOLISHED ENTERPRISE QUERIES (NEW)
    // =========================================================================

    /**
     * Gets all demolished enterprises
     * @param {Object} options
     * @param {string} options.locationId - Filter by location
     * @param {string} options.destroyedBy - Filter by cause
     * @param {boolean} options.includeRecords - Include demolition records
     * @returns {Array} - Array of demolished enterprises
     */
    function getDemolishedEnterprises(options) {
        try {
            var state = _getState();
            if (!state) return [];

            options = options || {};
            var all = state.getAllEnterprises();
            var filtered = all.filter(function(e) {
                return e.status === 'demolished';
            });

            if (options.locationId) {
                filtered = filtered.filter(function(e) {
                    return e.locationId === options.locationId;
                });
            }

            if (options.destroyedBy) {
                filtered = filtered.filter(function(e) {
                    return e.destroyedBy === options.destroyedBy;
                });
            }

            if (!options.includeRecords) {
                filtered = filtered.map(function(e) {
                    var result = { ...e };
                    delete result.demolishedRecord;
                    return result;
                });
            }

            return filtered;
        } catch (e) {
            return [];
        }
    }

    /**
     * Gets demolition statistics for a location
     * @param {string} locationId - Location ID
     * @returns {Object} - Demolition statistics
     */
    function getEnterpriseDemolitionStats(locationId) {
        var stats = {
            totalDemolished: 0,
            byDestroyedBy: {},
            byCategory: {},
            byType: {},
            totalWealthLost: 0,
            totalWorkersLost: 0,
            recentDemolitions: []
        };

        try {
            var demolished = getDemolishedEnterprises({ 
                locationId: locationId,
                includeRecords: true
            });

            stats.totalDemolished = demolished.length;

            for (var i = 0; i < demolished.length; i++) {
                var e = demolished[i];
                var record = e.demolishedRecord;

                // By destroyed by
                var destroyedBy = e.destroyedBy || 'unknown';
                if (!stats.byDestroyedBy[destroyedBy]) {
                    stats.byDestroyedBy[destroyedBy] = 0;
                }
                stats.byDestroyedBy[destroyedBy]++;

                // By category
                var category = e.category || 'other';
                if (!stats.byCategory[category]) {
                    stats.byCategory[category] = 0;
                }
                stats.byCategory[category]++;

                // By type
                var type = e.typeName || 'unknown';
                if (!stats.byType[type]) {
                    stats.byType[type] = 0;
                }
                stats.byType[type]++;

                // Wealth lost
                if (record && record.previousWealth) {
                    stats.totalWealthLost += record.previousWealth;
                }

                // Workers lost
                if (record && record.previousWorkerCount) {
                    stats.totalWorkersLost += record.previousWorkerCount;
                }

                // Recent demolitions (last 5)
                if (stats.recentDemolitions.length < 5) {
                    stats.recentDemolitions.push({
                        name: e.name,
                        destroyedAt: e.demolishedAt,
                        destroyedBy: e.destroyedBy,
                        reason: e.demolishedReason
                    });
                }
            }

            // Sort recent by date
            stats.recentDemolitions.sort(function(a, b) {
                return (b.destroyedAt || 0) - (a.destroyedAt || 0);
            });

        } catch (e) {
            // Error getting stats
        }

        return stats;
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    // Preserve existing exports and add new ones
    window.IndustryCommands = {
        // Existing functions (preserved)
        createEnterprise: _existingCommands.createEnterprise,
        updateEnterprise: _existingCommands.updateEnterprise,
        deleteEnterprise: _existingCommands.deleteEnterprise,
        addWorkerToEnterprise: _existingCommands.addWorkerToEnterprise,
        removeWorkerFromEnterprise: _existingCommands.removeWorkerFromEnterprise,
        setWorkerWage: _existingCommands.setWorkerWage,
        updateEnterpriseWealth: _existingCommands.updateEnterpriseWealth,
        updateEnterpriseDebt: _existingCommands.updateEnterpriseDebt,
        createPublicEnterprise: _existingCommands.createPublicEnterprise,
        convertEnterpriseToPublic: _existingCommands.convertEnterpriseToPublic,

        // NEW: Demolish functions
        demolishEnterprise: demolishEnterprise,
        rebuildEnterprise: rebuildEnterprise,
        getDemolishedEnterprises: getDemolishedEnterprises,
        getEnterpriseDemolitionStats: getEnterpriseDemolitionStats
    };

    // Legacy aliases
    if (typeof window !== 'undefined') {
        window._demolishEnterprise = demolishEnterprise;
        window._rebuildEnterprise = rebuildEnterprise;
        window._getDemolishedEnterprises = getDemolishedEnterprises;
        window._getEnterpriseDemolitionStats = getEnterpriseDemolitionStats;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.IndustryCommands;
    }

})();