/**
 * =============================================================================
 * STILL WATERS - INDUSTRY COMMANDS (industry-commands.js)
 * =============================================================================
 * 
 * LOCATION: js/core/industry/industry-commands.js
 * 
 * All write operations for the industry system.
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

    function _getHouseholdState() {
        return typeof window.HouseholdState !== 'undefined' ? window.HouseholdState : null;
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
        }
        return null;
    }

    function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
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

    // =========================================================================
    // 2. FIXED: Get enterprise type from IndustryTypes
    // =========================================================================

    function _getEnterpriseTypeById(id) {
        // Try IndustryTypes first
        if (typeof window.IndustryTypes !== 'undefined' && window.IndustryTypes.getEnterpriseTypeById) {
            return window.IndustryTypes.getEnterpriseTypeById(id);
        }
        // Try legacy access
        if (typeof window._getEnterpriseTypeById === 'function') {
            return window._getEnterpriseTypeById(id);
        }
        return null;
    }

    function _getEnterpriseTypes() {
        if (typeof window.IndustryTypes !== 'undefined' && window.IndustryTypes.getEnterpriseTypes) {
            return window.IndustryTypes.getEnterpriseTypes();
        }
        return [];
    }

    // =========================================================================
    // 3. RECURSION GUARD
    // =========================================================================

    var _processing = false;

    // =========================================================================
    // 4. CORE CRUD OPERATIONS
    // =========================================================================

    /**
     * Creates a new enterprise
     */
    function createEnterprise(data) {
        if (_processing) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processing = true;

        try {
            var state = _getState();
            if (!state) {
                return { success: false, reason: 'Industry state not available' };
            }

            // Validate required fields
            if (!data.name || data.name.trim() === '') {
                return { success: false, reason: 'Enterprise name is required' };
            }

            if (!data.typeId) {
                return { success: false, reason: 'Enterprise type is required' };
            }

            // Get type defaults
            var type = _getEnterpriseTypeById(data.typeId);
            if (!type) {
                return { success: false, reason: 'Enterprise type not found: ' + data.typeId };
            }

            // Build enterprise object
            var enterprise = {
                id: _generateId('ent'),
                name: data.name.trim(),
                typeId: data.typeId,
                typeName: type.name,
                category: type.category || 'other',
                
                // Ownership
                ownershipType: data.ownershipType || 'private',
                isPublic: (data.ownershipType === 'public'),
                ownerType: data.ownerType || 'none',
                ownerId: data.ownerId || null,
                ownerName: data.ownerName || null,
                
                // Location
                locationId: data.locationId || null,
                locationName: data.locationName || 'Unknown',
                
                // Financials (use provided or type defaults)
                wealth: data.wealth !== undefined ? data.wealth : 0,
                debt: data.debt !== undefined ? data.debt : 0,
                income: data.income !== undefined ? data.income : (type.baseIncome || 10),
                expenses: data.expenses !== undefined ? data.expenses : (type.baseExpenses || 5),
                wages: data.wages !== undefined ? data.wages : (type.baseWages || 8),
                
                // Workers
                workerCount: data.workerCount !== undefined ? data.workerCount : (type.baseWorkers || 2),
                maxWorkers: data.maxWorkers !== undefined ? data.maxWorkers : (type.maxWorkers || 10),
                workerList: [],
                workerWages: {},
                
                // Status
                status: data.status || 'active',
                foundedYear: data.foundedYear || _getCurrentYear(),
                lastProcessedYear: data.foundedYear || _getCurrentYear(),
                
                // History and metadata
                history: [],
                notes: data.notes || '',
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            // Add to state
            var result = state._addEnterprise(enterprise);
            if (!result) {
                return { success: false, reason: 'Failed to add enterprise to state' };
            }

            // If household owner, add to household's enterprise list
            if (enterprise.ownerType === 'household' && enterprise.ownerId) {
                var householdState = _getHouseholdState();
                if (householdState && typeof householdState.addEnterpriseToHousehold === 'function') {
                    householdState.addEnterpriseToHousehold(enterprise.ownerId, enterprise.id, enterprise.foundedYear);
                }
            }

            _saveMasterData();
            _logEvent('enterprise', 'Enterprise Created', 
                'Enterprise "' + enterprise.name + '" created in ' + enterprise.locationName,
                []);

            if (data.silent !== true) {
                _showToast('Enterprise created: ' + enterprise.name, 'success');
            }

            return { success: true, data: enterprise };

        } catch (e) {
            return { success: false, reason: e.message };
        } finally {
            _processing = false;
        }
    }

    /**
     * Updates an existing enterprise
     */
    function updateEnterprise(id, updates) {
        if (_processing) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processing = true;

        try {
            var state = _getState();
            if (!state) {
                return { success: false, reason: 'Industry state not available' };
            }

            var enterprise = state.getEnterprise(id);
            if (!enterprise) {
                return { success: false, reason: 'Enterprise not found' };
            }

            // Apply updates
            var changed = false;
            var allowedFields = [
                'name', 'typeId', 'typeName', 'category',
                'ownershipType', 'isPublic', 'ownerType', 'ownerId', 'ownerName',
                'locationId', 'locationName',
                'wealth', 'debt', 'income', 'expenses', 'wages',
                'workerCount', 'maxWorkers',
                'status', 'lastProcessedYear',
                'notes'
            ];

            for (var i = 0; i < allowedFields.length; i++) {
                var key = allowedFields[i];
                if (updates[key] !== undefined) {
                    enterprise[key] = updates[key];
                    changed = true;
                }
            }

            // Special handling for ownershipType changes
            if (updates.ownershipType !== undefined) {
                enterprise.isPublic = (updates.ownershipType === 'public');
                changed = true;
            }

            // If typeId changed, update typeName and category
            if (updates.typeId && updates.typeId !== enterprise.typeId) {
                var type = _getEnterpriseTypeById(updates.typeId);
                if (type) {
                    enterprise.typeName = type.name;
                    enterprise.category = type.category || 'other';
                }
                changed = true;
            }

            if (!changed) {
                return { success: false, reason: 'No changes to apply' };
            }

            enterprise.updatedAt = Date.now();

            // Update in state
            var result = state._updateEnterprise(id, enterprise);

            _saveMasterData();
            _logEvent('enterprise', 'Enterprise Updated',
                'Enterprise "' + enterprise.name + '" updated',
                []);

            if (updates.silent !== true) {
                _showToast('Enterprise updated: ' + enterprise.name, 'success');
            }

            return { success: true, data: enterprise };

        } catch (e) {
            return { success: false, reason: e.message };
        } finally {
            _processing = false;
        }
    }

    /**
     * Deletes an enterprise
     */
    function deleteEnterprise(id) {
        if (_processing) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processing = true;

        try {
            var state = _getState();
            if (!state) {
                return { success: false, reason: 'Industry state not available' };
            }

            var enterprise = state.getEnterprise(id);
            if (!enterprise) {
                return { success: false, reason: 'Enterprise not found' };
            }

            // Remove from household if owned
            if (enterprise.ownerType === 'household' && enterprise.ownerId) {
                var householdState = _getHouseholdState();
                if (householdState && typeof householdState.removeEnterpriseFromHousehold === 'function') {
                    householdState.removeEnterpriseFromHousehold(enterprise.ownerId, id, _getCurrentYear());
                }
            }

            var name = enterprise.name;
            var result = state._deleteEnterprise(id);

            if (!result) {
                return { success: false, reason: 'Failed to delete enterprise' };
            }

            _saveMasterData();
            _logEvent('enterprise', 'Enterprise Deleted',
                'Enterprise "' + name + '" deleted',
                []);

            _showToast('Enterprise deleted: ' + name, 'info');

            return { success: true };

        } catch (e) {
            return { success: false, reason: e.message };
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 5. WORKER MANAGEMENT
    // =========================================================================

    function addWorkerToEnterprise(enterpriseId, workerId, wage) {
        if (_processing) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processing = true;

        try {
            var state = _getState();
            if (!state) {
                return { success: false, reason: 'Industry state not available' };
            }

            var enterprise = state.getEnterprise(enterpriseId);
            if (!enterprise) {
                return { success: false, reason: 'Enterprise not found' };
            }

            if (enterprise.status === 'bankrupt' || enterprise.status === 'closed') {
                return { success: false, reason: 'Cannot add workers to a ' + enterprise.status + ' enterprise' };
            }

            // Check if already a worker
            if (enterprise.workerList && enterprise.workerList.indexOf(workerId) !== -1) {
                return { success: false, reason: 'Character is already a worker' };
            }

            // Check max workers
            var currentCount = enterprise.workerList ? enterprise.workerList.length : 0;
            if (currentCount >= (enterprise.maxWorkers || 10)) {
                return { success: false, reason: 'Enterprise is at maximum worker capacity' };
            }

            // Initialize arrays if needed
            if (!enterprise.workerList) enterprise.workerList = [];
            if (!enterprise.workerWages) enterprise.workerWages = {};

            // Add worker
            enterprise.workerList.push(workerId);
            enterprise.workerWages[workerId] = wage || enterprise.wages || 8;
            enterprise.workerCount = enterprise.workerList.length;

            enterprise.updatedAt = Date.now();

            state._updateEnterprise(enterpriseId, enterprise);

            _saveMasterData();
            _logEvent('enterprise', 'Worker Added',
                'Worker added to "' + enterprise.name + '"',
                [workerId]);

            _showToast('Worker added to ' + enterprise.name, 'success');

            return { success: true };

        } catch (e) {
            return { success: false, reason: e.message };
        } finally {
            _processing = false;
        }
    }

    function removeWorkerFromEnterprise(enterpriseId, workerId) {
        if (_processing) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processing = true;

        try {
            var state = _getState();
            if (!state) {
                return { success: false, reason: 'Industry state not available' };
            }

            var enterprise = state.getEnterprise(enterpriseId);
            if (!enterprise) {
                return { success: false, reason: 'Enterprise not found' };
            }

            if (!enterprise.workerList || enterprise.workerList.indexOf(workerId) === -1) {
                return { success: false, reason: 'Worker not found in enterprise' };
            }

            // Remove worker
            var index = enterprise.workerList.indexOf(workerId);
            enterprise.workerList.splice(index, 1);
            delete enterprise.workerWages[workerId];
            enterprise.workerCount = enterprise.workerList.length;

            enterprise.updatedAt = Date.now();

            state._updateEnterprise(enterpriseId, enterprise);

            _saveMasterData();
            _logEvent('enterprise', 'Worker Removed',
                'Worker removed from "' + enterprise.name + '"',
                [workerId]);

            _showToast('Worker removed from ' + enterprise.name, 'info');

            return { success: true };

        } catch (e) {
            return { success: false, reason: e.message };
        } finally {
            _processing = false;
        }
    }

    function setWorkerWage(enterpriseId, workerId, wage) {
        if (_processing) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processing = true;

        try {
            var state = _getState();
            if (!state) {
                return { success: false, reason: 'Industry state not available' };
            }

            var enterprise = state.getEnterprise(enterpriseId);
            if (!enterprise) {
                return { success: false, reason: 'Enterprise not found' };
            }

            if (!enterprise.workerList || enterprise.workerList.indexOf(workerId) === -1) {
                return { success: false, reason: 'Worker not found in enterprise' };
            }

            if (typeof wage !== 'number' || wage < 0) {
                return { success: false, reason: 'Invalid wage value' };
            }

            if (!enterprise.workerWages) enterprise.workerWages = {};
            enterprise.workerWages[workerId] = wage;
            enterprise.updatedAt = Date.now();

            state._updateEnterprise(enterpriseId, enterprise);

            _saveMasterData();

            return { success: true };

        } catch (e) {
            return { success: false, reason: e.message };
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 6. FINANCIAL OPERATIONS
    // =========================================================================

    function updateEnterpriseWealth(enterpriseId, amount, reason) {
        if (_processing) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processing = true;

        try {
            var state = _getState();
            if (!state) {
                return { success: false, reason: 'Industry state not available' };
            }

            var enterprise = state.getEnterprise(enterpriseId);
            if (!enterprise) {
                return { success: false, reason: 'Enterprise not found' };
            }

            if (enterprise.status === 'demolished') {
                return { success: false, reason: 'Cannot modify wealth of demolished enterprise' };
            }

            var oldWealth = enterprise.wealth || 0;
            enterprise.wealth = oldWealth + amount;
            enterprise.updatedAt = Date.now();

            // Add to history
            if (!enterprise.history) enterprise.history = [];
            enterprise.history.push({
                year: _getCurrentYear(),
                type: 'wealth_change',
                amount: amount,
                newWealth: enterprise.wealth,
                reason: reason || 'Wealth adjustment'
            });

            state._updateEnterprise(enterpriseId, enterprise);

            _saveMasterData();

            return { 
                success: true, 
                newWealth: enterprise.wealth,
                change: amount
            };

        } catch (e) {
            return { success: false, reason: e.message };
        } finally {
            _processing = false;
        }
    }

    function updateEnterpriseDebt(enterpriseId, amount, reason) {
        if (_processing) {
            return { success: false, reason: 'Command already in progress' };
        }
        _processing = true;

        try {
            var state = _getState();
            if (!state) {
                return { success: false, reason: 'Industry state not available' };
            }

            var enterprise = state.getEnterprise(enterpriseId);
            if (!enterprise) {
                return { success: false, reason: 'Enterprise not found' };
            }

            if (enterprise.status === 'demolished') {
                return { success: false, reason: 'Cannot modify debt of demolished enterprise' };
            }

            var oldDebt = enterprise.debt || 0;
            enterprise.debt = Math.max(0, oldDebt + amount);
            enterprise.updatedAt = Date.now();

            // Add to history
            if (!enterprise.history) enterprise.history = [];
            enterprise.history.push({
                year: _getCurrentYear(),
                type: 'debt_change',
                amount: amount,
                newDebt: enterprise.debt,
                reason: reason || 'Debt adjustment'
            });

            state._updateEnterprise(enterpriseId, enterprise);

            _saveMasterData();

            return { 
                success: true, 
                newDebt: enterprise.debt,
                change: amount
            };

        } catch (e) {
            return { success: false, reason: e.message };
        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 7. PUBLIC ENTERPRISE HELPERS
    // =========================================================================

    function createPublicEnterprise(locationId, data) {
        data.ownershipType = 'public';
        data.ownerType = 'settlement';
        data.ownerId = locationId;
        
        var place = _getPlaceById(locationId);
        if (place) {
            data.ownerName = place.displayName;
            data.locationName = place.displayName;
        }
        
        return createEnterprise(data);
    }

    function convertEnterpriseToPublic(enterpriseId, locationId) {
        var place = _getPlaceById(locationId);
        return updateEnterprise(enterpriseId, {
            ownershipType: 'public',
            ownerType: 'settlement',
            ownerId: locationId,
            ownerName: place ? place.displayName : 'Settlement'
        });
    }

    // =========================================================================
    // 8. DEMOLISH/RECONSTRUCT FUNCTIONS (from your existing file)
    // =========================================================================

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

            // Apply updates
            for (var key in updates) {
                if (updates.hasOwnProperty(key)) {
                    enterprise[key] = updates[key];
                }
            }

            // Add to history
            if (!enterprise.history) enterprise.history = [];
            enterprise.history.push({
                year: demolishYear,
                type: 'demolished',
                reason: demolishReason,
                destroyedBy: options.destroyedBy || 'manual',
                disasterId: options.disasterId || null,
                record: demolitionRecord,
                timestamp: Date.now()
            });

            state._updateEnterprise(enterpriseId, enterprise);

            // Remove from any household's enterprise list
            if (enterprise.ownerId && enterprise.ownerType === 'household') {
                var householdState = _getHouseholdState();
                if (householdState && typeof householdState.removeEnterpriseFromHousehold === 'function') {
                    householdState.removeEnterpriseFromHousehold(enterprise.ownerId, enterpriseId, demolishYear);
                }
            }

            _saveMasterData();
            _logEvent('enterprise', 'Enterprise Demolished',
                'Enterprise "' + enterprise.name + '" demolished: ' + demolishReason,
                []);

            if (!options.silent) {
                _showToast('Enterprise "' + enterprise.name + '" demolished', 'info');
            }

            return {
                success: true,
                demolitionRecord: demolitionRecord,
                enterprise: enterprise
            };

        } catch (e) {
            return { success: false, error: e.message };
        } finally {
            _processing = false;
        }
    }

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

            for (var key in updates) {
                if (updates.hasOwnProperty(key)) {
                    enterprise[key] = updates[key];
                }
            }

            // Add rebuild history
            if (!enterprise.history) enterprise.history = [];
            enterprise.history.push({
                year: rebuildYearValue,
                type: 'rebuilt',
                reason: options.reason || 'Rebuilt after destruction',
                fromRecord: record,
                timestamp: Date.now()
            });

            state._updateEnterprise(enterpriseId, enterprise);

            // Re-add to household if it was owned
            if (record.ownerId && record.ownerType === 'household') {
                var householdState = _getHouseholdState();
                if (householdState && typeof householdState.addEnterpriseToHousehold === 'function') {
                    householdState.addEnterpriseToHousehold(record.ownerId, enterpriseId, rebuildYearValue);
                }
            }

            _saveMasterData();
            _logEvent('enterprise', 'Enterprise Rebuilt',
                'Enterprise "' + enterprise.name + '" rebuilt: ' + (options.reason || 'Unknown'),
                []);

            if (!options.silent) {
                _showToast('Enterprise "' + enterprise.name + '" rebuilt', 'success');
            }

            return {
                success: true,
                enterprise: enterprise,
                rebuiltAt: rebuildYearValue
            };

        } catch (e) {
            return { success: false, error: e.message };
        } finally {
            _processing = false;
        }
    }

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
                    var result = {};
                    for (var key in e) {
                        if (e.hasOwnProperty(key) && key !== 'demolishedRecord') {
                            result[key] = e[key];
                        }
                    }
                    return result;
                });
            }

            return filtered;
        } catch (e) {
            return [];
        }
    }

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

                var destroyedBy = e.destroyedBy || 'unknown';
                if (!stats.byDestroyedBy[destroyedBy]) {
                    stats.byDestroyedBy[destroyedBy] = 0;
                }
                stats.byDestroyedBy[destroyedBy]++;

                var category = e.category || 'other';
                if (!stats.byCategory[category]) {
                    stats.byCategory[category] = 0;
                }
                stats.byCategory[category]++;

                var type = e.typeName || 'unknown';
                if (!stats.byType[type]) {
                    stats.byType[type] = 0;
                }
                stats.byType[type]++;

                if (record && record.previousWealth) {
                    stats.totalWealthLost += record.previousWealth;
                }

                if (record && record.previousWorkerCount) {
                    stats.totalWorkersLost += record.previousWorkerCount;
                }

                if (stats.recentDemolitions.length < 5) {
                    stats.recentDemolitions.push({
                        name: e.name,
                        destroyedAt: e.demolishedAt,
                        destroyedBy: e.destroyedBy,
                        reason: e.demolishedReason
                    });
                }
            }

            stats.recentDemolitions.sort(function(a, b) {
                return (b.destroyedAt || 0) - (a.destroyedAt || 0);
            });

        } catch (e) {
            // Error getting stats
        }

        return stats;
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.IndustryCommands = {
        // Core CRUD
        createEnterprise: createEnterprise,
        updateEnterprise: updateEnterprise,
        deleteEnterprise: deleteEnterprise,
        
        // Worker management
        addWorkerToEnterprise: addWorkerToEnterprise,
        removeWorkerFromEnterprise: removeWorkerFromEnterprise,
        setWorkerWage: setWorkerWage,
        
        // Financial operations
        updateEnterpriseWealth: updateEnterpriseWealth,
        updateEnterpriseDebt: updateEnterpriseDebt,
        
        // Public enterprise helpers
        createPublicEnterprise: createPublicEnterprise,
        convertEnterpriseToPublic: convertEnterpriseToPublic,
        
        // Demolish/rebuild
        demolishEnterprise: demolishEnterprise,
        rebuildEnterprise: rebuildEnterprise,
        getDemolishedEnterprises: getDemolishedEnterprises,
        getEnterpriseDemolitionStats: getEnterpriseDemolitionStats
    };

    // Legacy aliases
    if (typeof window !== 'undefined') {
        window._createEnterprise = createEnterprise;
        window._updateEnterprise = updateEnterprise;
        window._deleteEnterprise = deleteEnterprise;
        window._addWorkerToEnterprise = addWorkerToEnterprise;
        window._removeWorkerFromEnterprise = removeWorkerFromEnterprise;
        window._setWorkerWage = setWorkerWage;
        window._updateEnterpriseWealth = updateEnterpriseWealth;
        window._updateEnterpriseDebt = updateEnterpriseDebt;
        window._createPublicEnterprise = createPublicEnterprise;
        window._convertEnterpriseToPublic = convertEnterpriseToPublic;
        window._demolishEnterprise = demolishEnterprise;
        window._rebuildEnterprise = rebuildEnterprise;
        window._getDemolishedEnterprises = getDemolishedEnterprises;
        window._getEnterpriseDemolitionStats = getEnterpriseDemolitionStats;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.IndustryCommands;
    }

})();