/**
 * =============================================================================
 * STILL WATERS - INDUSTRY COMMANDS (industry-commands.js)
 * =============================================================================
 * 
 * LOCATION: js/core/industry/industry-commands.js
 * 
 * All write operations for the industry system.
 * 
 * DEPENDENCIES:
 *   - industry-state.js (IndustryState)
 *   - accessors.js (getCharacterById, getHousehold, getPlaceById)
 *   - ids.js (generateId)
 *   - formatting.js (escapeHtml)
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

    // =========================================================================
    // 2. RECURSION GUARD
    // =========================================================================

    var _processing = false;

    // =========================================================================
    // 3. ENTERPRISE CRUD
    // =========================================================================

    function createEnterprise(data) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
        }
        _processing = true;

        try {
            data = data || {};

            var state = _getState();
            if (!state) {
                return { success: false, reason: 'Industry state not available' };
            }

            // Validate type
            var type = state.getEnterpriseTypeById(data.typeId);
            if (!type) {
                return { success: false, reason: 'Enterprise type not found' };
            }

            // Validate owner
            var ownerType = data.ownerType || 'character';
            var ownerId = data.ownerId || null;
            var ownerName = data.ownerName || null;

            if (ownerId) {
                if (ownerType === 'character') {
                    var char = _getCharacterById(ownerId);
                    if (!char) {
                        return { success: false, reason: 'Owner character not found' };
                    }
                    ownerName = ownerName || (char.name + (char.surname ? ' ' + char.surname : ''));
                } else if (ownerType === 'household') {
                    var household = _getHousehold(ownerId);
                    if (!household) {
                        return { success: false, reason: 'Owner household not found' };
                    }
                    ownerName = ownerName || household.name;
                } else if (ownerType === 'state') {
                    var place = _getPlaceById(ownerId);
                    if (!place) {
                        return { success: false, reason: 'State location not found' };
                    }
                    ownerName = ownerName || place.displayName;
                }
            }

            // Validate location
            var locationId = data.locationId || null;
            if (locationId) {
                var place = _getPlaceById(locationId);
                if (!place) {
                    return { success: false, reason: 'Location not found' };
                }
            }

            var currentYear = _getCurrentYear();

            var enterprise = {
                id: _generateId('ent'),
                name: (data.name || type.name || 'Unnamed Enterprise').trim(),
                typeId: type.id,
                typeName: type.name,
                category: type.category || 'other',

                ownerType: ownerType,
                ownerId: ownerId,
                ownerName: ownerName || null,

                locationId: locationId,
                locationName: data.locationName || null,

                wealth: data.wealth !== undefined ? data.wealth : 0,
                debt: data.debt !== undefined ? data.debt : 0,
                income: data.income !== undefined ? data.income : type.baseIncome || 10,
                expenses: data.expenses !== undefined ? data.expenses : type.baseExpenses || 5,
                wages: data.wages !== undefined ? data.wages : type.baseWages || 8,

                workerCount: data.workerCount !== undefined ? data.workerCount : type.baseWorkers || 2,
                maxWorkers: data.maxWorkers !== undefined ? data.maxWorkers : type.maxWorkers || 10,
                workerList: data.workerList || [],
                workerWages: data.workerWages || {},

                status: data.status || 'active',
                foundedYear: data.foundedYear || currentYear,
                lastProcessedYear: data.lastProcessedYear || currentYear,

                history: data.history || [],
                notes: data.notes || '',

                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            // Get current enterprises
            var enterprises = state.getAllEnterprises();
            enterprises.push(enterprise);
            state._setEnterprises(enterprises);

            _logEvent('enterprise', 'Enterprise Created',
                'Created enterprise: ' + enterprise.name + ' (' + type.name + ')',
                []);

            // If owned by household, deduct initial cost
            if (ownerType === 'household' && ownerId) {
                _modifyHouseholdWealth(ownerId, -enterprise.debt, 'Enterprise creation cost');
            }

            _showToast('Created enterprise: ' + enterprise.name, 'success');
            return { success: true, data: enterprise };

        } finally {
            _processing = false;
        }
    }

    function updateEnterprise(enterpriseId, updates) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
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

            var allowedFields = [
                'name', 'typeId', 'ownerType', 'ownerId', 'ownerName',
                'locationId', 'locationName', 'wealth', 'debt', 'income',
                'expenses', 'wages', 'workerCount', 'maxWorkers',
                'workerList', 'workerWages', 'status', 'notes'
            ];

            var changed = false;
            for (var i = 0; i < allowedFields.length; i++) {
                var key = allowedFields[i];
                if (updates[key] !== undefined) {
                    enterprise[key] = updates[key];
                    changed = true;
                }
            }

            if (!changed) {
                return { success: true, data: enterprise, message: 'No changes' };
            }

            enterprise.updatedAt = Date.now();

            var enterprises = state.getAllEnterprises();
            var index = -1;
            for (var j = 0; j < enterprises.length; j++) {
                if (enterprises[j].id === enterpriseId) {
                    index = j;
                    break;
                }
            }
            if (index !== -1) {
                enterprises[index] = enterprise;
                state._setEnterprises(enterprises);
            }

            _showToast('Updated enterprise: ' + enterprise.name, 'success');
            return { success: true, data: enterprise };

        } finally {
            _processing = false;
        }
    }

    function deleteEnterprise(enterpriseId) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
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

            var enterprises = state.getAllEnterprises();
            var newEnterprises = [];
            for (var i = 0; i < enterprises.length; i++) {
                if (enterprises[i].id !== enterpriseId) {
                    newEnterprises.push(enterprises[i]);
                }
            }

            if (newEnterprises.length === enterprises.length) {
                return { success: false, reason: 'Enterprise not found' };
            }

            state._setEnterprises(newEnterprises);

            _logEvent('enterprise', 'Enterprise Deleted',
                'Deleted enterprise: ' + enterprise.name,
                []);

            _showToast('Deleted enterprise: ' + enterprise.name, 'info');
            return { success: true };

        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 4. WORKER MANAGEMENT
    // =========================================================================

    function addWorkerToEnterprise(enterpriseId, workerId, wage) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
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

            if (!enterprise.workerList) enterprise.workerList = [];
            if (!enterprise.workerWages) enterprise.workerWages = {};

            // Check if already in list
            for (var i = 0; i < enterprise.workerList.length; i++) {
                if (enterprise.workerList[i] === workerId) {
                    return { success: false, reason: 'Worker already in this enterprise' };
                }
            }

            if (enterprise.workerList.length >= enterprise.maxWorkers) {
                return { success: false, reason: 'Enterprise is at maximum workers' };
            }

            var character = _getCharacterById(workerId);
            if (!character) {
                return { success: false, reason: 'Character not found' };
            }

            enterprise.workerList.push(workerId);
            enterprise.workerWages[workerId] = wage || enterprise.wages || 8;
            enterprise.workerCount = enterprise.workerList.length;
            enterprise.updatedAt = Date.now();

            var enterprises = state.getAllEnterprises();
            var index = -1;
            for (var j = 0; j < enterprises.length; j++) {
                if (enterprises[j].id === enterpriseId) {
                    index = j;
                    break;
                }
            }
            if (index !== -1) {
                enterprises[index] = enterprise;
                state._setEnterprises(enterprises);
            }

            _showToast('Added worker to ' + enterprise.name, 'success');
            return { success: true, data: { workerId: workerId, wage: wage || enterprise.wages || 8 } };

        } finally {
            _processing = false;
        }
    }

    function removeWorkerFromEnterprise(enterpriseId, workerId) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
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

            if (!enterprise.workerList) {
                return { success: false, reason: 'No workers in this enterprise' };
            }

            var index = -1;
            for (var i = 0; i < enterprise.workerList.length; i++) {
                if (enterprise.workerList[i] === workerId) {
                    index = i;
                    break;
                }
            }
            if (index === -1) {
                return { success: false, reason: 'Worker not found in enterprise' };
            }

            enterprise.workerList.splice(index, 1);
            if (enterprise.workerWages) {
                delete enterprise.workerWages[workerId];
            }
            enterprise.workerCount = enterprise.workerList.length;
            enterprise.updatedAt = Date.now();

            var enterprises = state.getAllEnterprises();
            var idx = -1;
            for (var j = 0; j < enterprises.length; j++) {
                if (enterprises[j].id === enterpriseId) {
                    idx = j;
                    break;
                }
            }
            if (idx !== -1) {
                enterprises[idx] = enterprise;
                state._setEnterprises(enterprises);
            }

            _showToast('Removed worker from ' + enterprise.name, 'info');
            return { success: true };

        } finally {
            _processing = false;
        }
    }

    function setWorkerWage(enterpriseId, workerId, wage) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
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

            if (!enterprise.workerWages) enterprise.workerWages = {};
            if (!enterprise.workerList || enterprise.workerList.indexOf(workerId) === -1) {
                return { success: false, reason: 'Worker not found in enterprise' };
            }

            enterprise.workerWages[workerId] = wage;
            enterprise.updatedAt = Date.now();

            var enterprises = state.getAllEnterprises();
            var idx = -1;
            for (var j = 0; j < enterprises.length; j++) {
                if (enterprises[j].id === enterpriseId) {
                    idx = j;
                    break;
                }
            }
            if (idx !== -1) {
                enterprises[idx] = enterprise;
                state._setEnterprises(enterprises);
            }

            _showToast('Updated wage for worker', 'success');
            return { success: true };

        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 5. FINANCIAL OPERATIONS
    // =========================================================================

    function updateEnterpriseWealth(enterpriseId, amount, reason) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
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

            enterprise.wealth = (enterprise.wealth || 0) + amount;
            enterprise.updatedAt = Date.now();

            if (!enterprise.history) enterprise.history = [];
            enterprise.history.push({
                year: _getCurrentYear(),
                type: 'wealth_change',
                amount: amount,
                reason: reason || 'Wealth adjustment',
                newWealth: enterprise.wealth
            });

            if (enterprise.history.length > 100) {
                enterprise.history = enterprise.history.slice(-100);
            }

            var enterprises = state.getAllEnterprises();
            var idx = -1;
            for (var j = 0; j < enterprises.length; j++) {
                if (enterprises[j].id === enterpriseId) {
                    idx = j;
                    break;
                }
            }
            if (idx !== -1) {
                enterprises[idx] = enterprise;
                state._setEnterprises(enterprises);
            }

            return { success: true, data: { newWealth: enterprise.wealth } };

        } finally {
            _processing = false;
        }
    }

    function updateEnterpriseDebt(enterpriseId, amount, reason) {
        if (_processing) {
            return { success: false, reason: 'Already processing' };
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

            enterprise.debt = Math.max(0, (enterprise.debt || 0) + amount);
            enterprise.updatedAt = Date.now();

            if (!enterprise.history) enterprise.history = [];
            enterprise.history.push({
                year: _getCurrentYear(),
                type: 'debt_change',
                amount: amount,
                reason: reason || 'Debt adjustment',
                newDebt: enterprise.debt
            });

            if (enterprise.history.length > 100) {
                enterprise.history = enterprise.history.slice(-100);
            }

            var enterprises = state.getAllEnterprises();
            var idx = -1;
            for (var j = 0; j < enterprises.length; j++) {
                if (enterprises[j].id === enterpriseId) {
                    idx = j;
                    break;
                }
            }
            if (idx !== -1) {
                enterprises[idx] = enterprise;
                state._setEnterprises(enterprises);
            }

            return { success: true, data: { newDebt: enterprise.debt } };

        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.IndustryCommands = {
        createEnterprise: createEnterprise,
        updateEnterprise: updateEnterprise,
        deleteEnterprise: deleteEnterprise,
        addWorkerToEnterprise: addWorkerToEnterprise,
        removeWorkerFromEnterprise: removeWorkerFromEnterprise,
        setWorkerWage: setWorkerWage,
        updateEnterpriseWealth: updateEnterpriseWealth,
        updateEnterpriseDebt: updateEnterpriseDebt
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.IndustryCommands;
    }

})();