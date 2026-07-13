/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD ECONOMY (household-economy.js)
 * =============================================================================
 * 
 * LOCATION: js/systems/household/household-economy.js
 * 
 * Business logic for household economy management including wealth, resources,
 * income, expenses, and enterprise integration.
 * 
 * UPDATED: Enhanced enterprise profit/loss tracking
 *          Added enterprise history tracking
 *          Added enterprise value calculation
 * 
 * DEPENDENCIES:
 *   - household-state.js (HouseholdState)
 *   - household-queries.js (HouseholdQueries)
 *   - household-commands.js (HouseholdCommands)
 *   - accessors.js (getCharacterById, getCharacters, getPlaceById, getCurrentYear)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getState() {
        return typeof window.HouseholdState !== 'undefined' ? window.HouseholdState : null;
    }

    function _getQueries() {
        return typeof window.HouseholdQueries !== 'undefined' ? window.HouseholdQueries : null;
    }

    function _getCommands() {
        return typeof window.HouseholdCommands !== 'undefined' ? window.HouseholdCommands : null;
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        return [];
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

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    // =========================================================================
    // 2. RECURSION GUARD
    // =========================================================================

    var _processingEconomy = false;
    var _processingTrade = false;

    // =========================================================================
    // 3. CONSTANTS
    // =========================================================================

    var ECONOMIC_TIERS = {
        DESTITUTE: { id: 'destitute', minWealth: 0, maxWealth: 10, label: 'Destitute', icon: '💀' },
        POOR: { id: 'poor', minWealth: 11, maxWealth: 30, label: 'Poor', icon: '😟' },
        MODERATE: { id: 'moderate', minWealth: 31, maxWealth: 70, label: 'Moderate', icon: '😐' },
        PROSPEROUS: { id: 'prosperous', minWealth: 71, maxWealth: 120, label: 'Prosperous', icon: '😊' },
        WEALTHY: { id: 'wealthy', minWealth: 121, maxWealth: 200, label: 'Wealthy', icon: '💰' },
        NOBLE: { id: 'noble', minWealth: 201, maxWealth: 500, label: 'Noble', icon: '👑' },
        VERY_NOBLE: { id: 'very_noble', minWealth: 501, maxWealth: 1000, label: 'High Noble', icon: '👑' },
        ROYAL: { id: 'royal', minWealth: 1001, maxWealth: Infinity, label: 'Royal', icon: '🏛️' }
    };

    var INCOME_SOURCES = {
        agriculture: { id: 'agriculture', name: 'Agriculture', baseIncome: 10 },
        livestock: { id: 'livestock', name: 'Livestock', baseIncome: 8 },
        trade: { id: 'trade', name: 'Trade', baseIncome: 15 },
        crafts: { id: 'crafts', name: 'Crafts', baseIncome: 12 },
        taxes: { id: 'taxes', name: 'Taxes', baseIncome: 20 },
        rent: { id: 'rent', name: 'Rent', baseIncome: 10 },
        tribute: { id: 'tribute', name: 'Tribute', baseIncome: 25 },
        patronage: { id: 'patronage', name: 'Patronage', baseIncome: 5 },
        military: { id: 'military', name: 'Military Service', baseIncome: 15 },
        mining: { id: 'mining', name: 'Mining', baseIncome: 18 }
    };

    var EXPENSE_CATEGORIES = {
        food: { id: 'food', name: 'Food & Supplies', baseExpense: 8 },
        maintenance: { id: 'maintenance', name: 'Property Maintenance', baseExpense: 6 },
        taxes: { id: 'taxes', name: 'Taxes Paid', baseExpense: 10 },
        staff: { id: 'staff', name: 'Staff Wages', baseExpense: 12 },
        luxury: { id: 'luxury', name: 'Luxury Goods', baseExpense: 15 },
        debt: { id: 'debt', name: 'Debt Payments', baseExpense: 10 },
        tithe: { id: 'tithe', name: 'Religious Tithe', baseExpense: 5 },
        medical: { id: 'medical', name: 'Medical Expenses', baseExpense: 8 }
    };

    // =========================================================================
    // 4. WEALTH MANAGEMENT
    // =========================================================================

    function getHouseholdWealth(householdId) {
        if (_processingEconomy) return 0;
        _processingEconomy = true;

        try {
            var state = _getState();
            if (!state) return 0;

            var household = state.getHousehold(householdId);
            if (!household) return 0;

            return household.wealth || 0;
        } finally {
            _processingEconomy = false;
        }
    }

    function updateHouseholdWealth(householdId, delta, reason) {
        if (_processingEconomy) return null;
        _processingEconomy = true;

        try {
            var state = _getState();
            if (!state) return null;

            var household = state.getHousehold(householdId);
            if (!household) return null;

            if (household.wealth === undefined) household.wealth = 0;
            var oldWealth = household.wealth;
            household.wealth = Math.max(0, household.wealth + delta);

            // Track in economy history
            if (!household.economy) household.economy = {};
            if (!household.economy.transactions) household.economy.transactions = [];
            household.economy.transactions.push({
                year: _getCurrentYear(),
                type: 'wealth_change',
                amount: delta,
                reason: reason || 'Wealth adjustment',
                oldWealth: oldWealth,
                newWealth: household.wealth
            });

            // Keep only last 100 transactions
            if (household.economy.transactions.length > 100) {
                household.economy.transactions = household.economy.transactions.slice(-100);
            }

            // Save changes
            var households = state.getAllHouseholds({ includeDeprecated: true });
            var index = -1;
            for (var i = 0; i < households.length; i++) {
                if (households[i].id === householdId) {
                    index = i;
                    break;
                }
            }
            if (index !== -1) {
                households[index] = household;
                state._setHouseholds(households);
            }

            return household.wealth;
        } finally {
            _processingEconomy = false;
        }
    }

    function getHouseholdDebt(householdId) {
        if (_processingEconomy) return 0;
        _processingEconomy = true;

        try {
            var state = _getState();
            if (!state) return 0;

            var household = state.getHousehold(householdId);
            if (!household) return 0;

            return household.debt || 0;
        } finally {
            _processingEconomy = false;
        }
    }

    function modifyHouseholdDebt(householdId, delta) {
        if (_processingEconomy) return null;
        _processingEconomy = true;

        try {
            var state = _getState();
            if (!state) return null;

            var household = state.getHousehold(householdId);
            if (!household) return null;

            if (household.debt === undefined) household.debt = 0;
            household.debt = Math.max(0, household.debt + delta);

            // Track in economy history
            if (!household.economy) household.economy = {};
            if (!household.economy.transactions) household.economy.transactions = [];
            household.economy.transactions.push({
                year: _getCurrentYear(),
                type: 'debt_change',
                amount: delta,
                oldDebt: household.debt - delta,
                newDebt: household.debt
            });

            // Save changes
            var households = state.getAllHouseholds({ includeDeprecated: true });
            var index = -1;
            for (var i = 0; i < households.length; i++) {
                if (households[i].id === householdId) {
                    index = i;
                    break;
                }
            }
            if (index !== -1) {
                households[index] = household;
                state._setHouseholds(households);
            }

            return household.debt;
        } finally {
            _processingEconomy = false;
        }
    }

    function getEconomicTier(wealth) {
        wealth = wealth || 0;
        var tiers = Object.keys(ECONOMIC_TIERS);
        for (var i = 0; i < tiers.length; i++) {
            var tier = ECONOMIC_TIERS[tiers[i]];
            if (wealth >= tier.minWealth && wealth <= tier.maxWealth) {
                return tier;
            }
        }
        return ECONOMIC_TIERS.DESTITUTE;
    }

    // =========================================================================
    // 5. RESOURCE MANAGEMENT
    // =========================================================================

    function getHouseholdResources(householdId) {
        if (_processingEconomy) return null;
        _processingEconomy = true;

        try {
            var state = _getState();
            if (!state) return null;

            var household = state.getHousehold(householdId);
            if (!household) return null;

            if (!household.resources) {
                household.resources = { food: 0, livestock: 0, goods: 0 };
            }

            return {
                food: household.resources.food || 0,
                livestock: household.resources.livestock || 0,
                goods: household.resources.goods || 0
            };
        } finally {
            _processingEconomy = false;
        }
    }

    function updateHouseholdResources(householdId, resourceType, delta) {
        if (_processingEconomy) return null;
        _processingEconomy = true;

        try {
            var state = _getState();
            if (!state) return null;

            var household = state.getHousehold(householdId);
            if (!household) return null;

            if (!household.resources) {
                household.resources = { food: 0, livestock: 0, goods: 0 };
            }

            var validTypes = ['food', 'livestock', 'goods'];
            if (validTypes.indexOf(resourceType) === -1) {
                return null;
            }

            var oldValue = household.resources[resourceType] || 0;
            household.resources[resourceType] = Math.max(0, oldValue + delta);

            // Track in economy history
            if (!household.economy) household.economy = {};
            if (!household.economy.resourceHistory) household.economy.resourceHistory = [];
            household.economy.resourceHistory.push({
                year: _getCurrentYear(),
                resource: resourceType,
                delta: delta,
                oldValue: oldValue,
                newValue: household.resources[resourceType]
            });

            // Keep only last 100 entries
            if (household.economy.resourceHistory.length > 100) {
                household.economy.resourceHistory = household.economy.resourceHistory.slice(-100);
            }

            // Save changes
            var households = state.getAllHouseholds({ includeDeprecated: true });
            var index = -1;
            for (var i = 0; i < households.length; i++) {
                if (households[i].id === householdId) {
                    index = i;
                    break;
                }
            }
            if (index !== -1) {
                households[index] = household;
                state._setHouseholds(households);
            }

            return household.resources[resourceType];
        } finally {
            _processingEconomy = false;
        }
    }

    // =========================================================================
    // 6. INCOME & EXPENSES (UPDATED with Enterprise Integration)
    // =========================================================================

    function calculateAnnualIncome(householdId) {
        if (_processingEconomy) return 0;
        _processingEconomy = true;

        try {
            var state = _getState();
            var queries = _getQueries();
            if (!state) return 0;

            var household = state.getHousehold(householdId);
            if (!household) return 0;

            var income = 0;

            // 1. Base income from household economy
            if (household.economy && household.economy.incomeSources) {
                for (var i = 0; i < household.economy.incomeSources.length; i++) {
                    var source = household.economy.incomeSources[i];
                    income += source.amount || 0;
                }
            }

            // 2. Member salaries (government/role salaries flowing into household)
            if (household.members) {
                for (var i = 0; i < household.members.length; i++) {
                    var member = household.members[i];
                    var char = _getCharacterById(member.characterId);
                    if (char && char.professions) {
                        for (var j = 0; j < char.professions.length; j++) {
                            var prof = char.professions[j];
                            if (prof.baseSalary) {
                                income += prof.baseSalary;
                            }
                            if (prof.customSalary) {
                                income += prof.customSalary;
                            }
                        }
                    }
                }
            }

            // ================================================================
            // 3. ENTERPRISE PROFITS (ENHANCED)
            // ================================================================
            if (queries && typeof queries.getHouseholdEnterpriseSummaries === 'function') {
                var summaries = queries.getHouseholdEnterpriseSummaries(householdId);
                var stateObj = _getState();
                for (var i = 0; i < summaries.length; i++) {
                    var s = summaries[i];
                    
                    // Only track private enterprises (public profits go to settlement)
                    if (s.ownershipType === 'public') continue;
                    
                    var profit = s.annualProfit || 0;
                    if (profit > 0) {
                        income += profit;
                        // Track profit in household history
                        if (stateObj && typeof stateObj.trackEnterpriseProfit === 'function') {
                            stateObj.trackEnterpriseProfit(
                                householdId, 
                                s.id, 
                                profit, 
                                _getCurrentYear()
                            );
                        }
                    }
                }
            }
            // ================================================================

            // 4. School profits (if household owns schools)
            if (household.economy && household.economy.schoolProfits) {
                var schoolProfits = getSchoolProfits(householdId, _getCurrentYear());
                income += schoolProfits;
            }

            return income;
        } finally {
            _processingEconomy = false;
        }
    }

    function calculateAnnualExpenses(householdId) {
        if (_processingEconomy) return 0;
        _processingEconomy = true;

        try {
            var state = _getState();
            var queries = _getQueries();
            if (!state) return 0;

            var household = state.getHousehold(householdId);
            if (!household) return 0;

            var expenses = 0;

            // 1. Base expenses from household economy
            if (household.economy && household.economy.expenses) {
                for (var i = 0; i < household.economy.expenses.length; i++) {
                    var exp = household.economy.expenses[i];
                    expenses += exp.amount || 0;
                }
            }

            // 2. Staff wages
            if (household.members) {
                for (var i = 0; i < household.members.length; i++) {
                    var member = household.members[i];
                    if (member.type === 'staff') {
                        // Base staff wage
                        expenses += 8; // Default staff wage
                    }
                }
            }

            // ================================================================
            // 3. ENTERPRISE LOSSES (ENHANCED)
            // ================================================================
            if (queries && typeof queries.getHouseholdEnterpriseSummaries === 'function') {
                var summaries = queries.getHouseholdEnterpriseSummaries(householdId);
                var stateObj = _getState();
                for (var i = 0; i < summaries.length; i++) {
                    var s = summaries[i];
                    
                    // Only track private enterprises
                    if (s.ownershipType === 'public') continue;
                    
                    var profit = s.annualProfit || 0;
                    if (profit < 0) {
                        var loss = Math.abs(profit);
                        expenses += loss;
                        // Track loss in household history
                        if (stateObj && typeof stateObj.trackEnterpriseProfit === 'function') {
                            stateObj.trackEnterpriseProfit(
                                householdId, 
                                s.id, 
                                profit, // Negative value
                                _getCurrentYear()
                            );
                        }
                    }
                }
            }
            // ================================================================

            // 4. Tuition expenses
            if (household.economy && household.economy.tuitionExpenses) {
                var tuition = getTuitionExpenses(householdId, _getCurrentYear());
                expenses += tuition;
            }

            // 5. Debt interest
            var debt = household.debt || 0;
            if (debt > 0) {
                expenses += debt * 0.05; // 5% annual interest
            }

            return expenses;
        } finally {
            _processingEconomy = false;
        }
    }

    function computeNetAnnualChange(householdId) {
        if (_processingEconomy) return 0;
        _processingEconomy = true;

        try {
            var income = calculateAnnualIncome(householdId);
            var expenses = calculateAnnualExpenses(householdId);
            return income - expenses;
        } finally {
            _processingEconomy = false;
        }
    }

    // =========================================================================
    // 7. ANNUAL PROCESSING (UPDATED with Enterprise Integration)
    // =========================================================================

    function processAnnualEconomy(householdId) {
        if (_processingEconomy) {
            return { success: false, reason: 'Already processing' };
        }
        _processingEconomy = true;

        try {
            var state = _getState();
            var queries = _getQueries();
            if (!state) {
                return { success: false, reason: 'Household state not available' };
            }

            var household = state.getHousehold(householdId);
            if (!household) {
                return { success: false, reason: 'Household not found' };
            }

            var year = _getCurrentYear();
            var oldWealth = household.wealth || 0;

            // Calculate net change
            var netChange = computeNetAnnualChange(householdId);

            // Apply net change
            if (netChange !== 0) {
                updateHouseholdWealth(householdId, netChange, 'Annual economy processing');
            }

            // Process enterprise events (ENHANCED)
            if (queries && typeof queries.getHouseholdEnterpriseSummaries === 'function') {
                var summaries = queries.getHouseholdEnterpriseSummaries(householdId);
                if (!household.eventLog) household.eventLog = [];

                for (var i = 0; i < summaries.length; i++) {
                    var s = summaries[i];
                    if (s.annualProfit !== 0) {
                        household.eventLog.push({
                            year: year,
                            type: s.annualProfit > 0 ? 'enterprise_profit' : 'enterprise_loss',
                            amount: Math.abs(s.annualProfit),
                            enterpriseName: s.name,
                            enterpriseId: s.id,
                            ownershipType: s.ownershipType || 'private'
                        });
                    }
                }

                // Keep only last 200 events
                if (household.eventLog.length > 200) {
                    household.eventLog = household.eventLog.slice(-200);
                }
            }

            // Check for bankruptcy
            var isBankrupt = (household.wealth || 0) < -50;

            if (isBankrupt) {
                if (household.status !== 'bankrupt') {
                    household.status = 'bankrupt';
                    if (!household.eventLog) household.eventLog = [];
                    household.eventLog.push({
                        year: year,
                        type: 'bankruptcy',
                        message: 'Household declared bankrupt'
                    });
                }
            } else if (household.status === 'bankrupt' && (household.wealth || 0) > 10) {
                household.status = 'active';
                if (!household.eventLog) household.eventLog = [];
                household.eventLog.push({
                    year: year,
                    type: 'recovery',
                    message: 'Household recovered from bankruptcy'
                });
            }

            // Save household
            var households = state.getAllHouseholds({ includeDeprecated: true });
            var index = -1;
            for (var i = 0; i < households.length; i++) {
                if (households[i].id === householdId) {
                    index = i;
                    break;
                }
            }
            if (index !== -1) {
                households[index] = household;
                state._setHouseholds(households);
            }

            return {
                success: true,
                householdId: householdId,
                householdName: household.name || 'Unnamed',
                oldWealth: oldWealth,
                newWealth: household.wealth || 0,
                netChange: netChange,
                eventCount: household.eventLog ? household.eventLog.filter(function(e) {
                    return e.year === year;
                }).length : 0,
                bankrupt: isBankrupt,
                year: year
            };
        } finally {
            _processingEconomy = false;
        }
    }

    function consumeAnnualFood(householdId) {
        if (_processingEconomy) return false;
        _processingEconomy = true;

        try {
            var state = _getState();
            if (!state) return false;

            var household = state.getHousehold(householdId);
            if (!household) return false;

            if (!household.resources) household.resources = { food: 0, livestock: 0, goods: 0 };

            var members = household.members ? household.members.length : 0;
            var foodNeeded = members * 2; // 2 units of food per person per year

            if (household.resources.food >= foodNeeded) {
                household.resources.food -= foodNeeded;
                return true;
            } else {
                // Not enough food - use livestock or buy
                var deficit = foodNeeded - household.resources.food;
                household.resources.food = 0;

                // Try to use livestock
                if (household.resources.livestock > 0) {
                    var livestockUsed = Math.min(household.resources.livestock, Math.ceil(deficit / 3));
                    household.resources.livestock -= livestockUsed;
                    // Each livestock provides ~3 units of food
                    var foodFromLivestock = livestockUsed * 3;
                    if (foodFromLivestock < deficit) {
                        // Still short - spend wealth
                        var remaining = deficit - foodFromLivestock;
                        var wealthCost = remaining * 0.5;
                        updateHouseholdWealth(householdId, -wealthCost, 'Food purchase');
                    }
                } else {
                    // No livestock - buy food
                    var cost = deficit * 0.5;
                    updateHouseholdWealth(householdId, -cost, 'Emergency food purchase');
                }

                // Save changes
                var households = state.getAllHouseholds({ includeDeprecated: true });
                var index = -1;
                for (var i = 0; i < households.length; i++) {
                    if (households[i].id === householdId) {
                        index = i;
                        break;
                    }
                }
                if (index !== -1) {
                    households[index] = household;
                    state._setHouseholds(households);
                }

                return false;
            }
        } finally {
            _processingEconomy = false;
        }
    }

    // =========================================================================
    // 8. SALARY AND TUITION TRACKING
    // =========================================================================

    function receiveSalary(householdId, characterId, roleId, salary, year) {
        if (_processingEconomy) return false;
        _processingEconomy = true;

        try {
            var state = _getState();
            if (!state) return false;

            var household = state.getHousehold(householdId);
            if (!household) return false;

            year = year || _getCurrentYear();

            if (!household.economy) household.economy = {};
            if (!household.economy.salaryIncome) household.economy.salaryIncome = 0;
            if (!household.economy.salaryIncomeHistory) household.economy.salaryIncomeHistory = [];

            household.economy.salaryIncome += salary;
            household.economy.salaryIncomeHistory.push({
                year: year,
                characterId: characterId,
                roleId: roleId,
                amount: salary
            });

            // Keep only last 100 entries
            if (household.economy.salaryIncomeHistory.length > 100) {
                household.economy.salaryIncomeHistory = household.economy.salaryIncomeHistory.slice(-100);
            }

            // Update wealth
            updateHouseholdWealth(householdId, salary, 'Salary: ' + (roleId || 'Unknown role'));

            return true;
        } finally {
            _processingEconomy = false;
        }
    }

    function getSalaryIncome(householdId, year) {
        if (_processingEconomy) return 0;
        _processingEconomy = true;

        try {
            var state = _getState();
            if (!state) return 0;

            var household = state.getHousehold(householdId);
            if (!household || !household.economy) return 0;

            year = year || _getCurrentYear();

            var total = 0;
            if (household.economy.salaryIncomeHistory) {
                for (var i = 0; i < household.economy.salaryIncomeHistory.length; i++) {
                    if (household.economy.salaryIncomeHistory[i].year === year) {
                        total += household.economy.salaryIncomeHistory[i].amount;
                    }
                }
            }
            return total;
        } finally {
            _processingEconomy = false;
        }
    }

    function getTotalSalariesReceived(householdId) {
        if (_processingEconomy) return 0;
        _processingEconomy = true;

        try {
            var state = _getState();
            if (!state) return 0;

            var household = state.getHousehold(householdId);
            if (!household || !household.economy) return 0;

            return household.economy.salaryIncome || 0;
        } finally {
            _processingEconomy = false;
        }
    }

    function trackTuitionExpense(householdId, tuition, institutionId, studentId, year) {
        if (_processingEconomy) return false;
        _processingEconomy = true;

        try {
            var state = _getState();
            if (!state) return false;

            var household = state.getHousehold(householdId);
            if (!household) return false;

            year = year || _getCurrentYear();

            if (!household.economy) household.economy = {};
            if (!household.economy.tuitionExpenses) household.economy.tuitionExpenses = 0;
            if (!household.economy.tuitionExpensesHistory) household.economy.tuitionExpensesHistory = [];

            household.economy.tuitionExpenses += tuition;
            household.economy.tuitionExpensesHistory.push({
                year: year,
                institutionId: institutionId,
                studentId: studentId,
                amount: tuition
            });

            // Keep only last 100 entries
            if (household.economy.tuitionExpensesHistory.length > 100) {
                household.economy.tuitionExpensesHistory = household.economy.tuitionExpensesHistory.slice(-100);
            }

            // Deduct from wealth
            updateHouseholdWealth(householdId, -tuition, 'Tuition: ' + (institutionId || 'Unknown institution'));

            return true;
        } finally {
            _processingEconomy = false;
        }
    }

    function getTuitionExpenses(householdId, year) {
        if (_processingEconomy) return 0;
        _processingEconomy = true;

        try {
            var state = _getState();
            if (!state) return 0;

            var household = state.getHousehold(householdId);
            if (!household || !household.economy) return 0;

            year = year || _getCurrentYear();

            var total = 0;
            if (household.economy.tuitionExpensesHistory) {
                for (var i = 0; i < household.economy.tuitionExpensesHistory.length; i++) {
                    if (household.economy.tuitionExpensesHistory[i].year === year) {
                        total += household.economy.tuitionExpensesHistory[i].amount;
                    }
                }
            }
            return total;
        } finally {
            _processingEconomy = false;
        }
    }

    function receiveSchoolProfit(householdId, amount, institutionId, year) {
        if (_processingEconomy) return false;
        _processingEconomy = true;

        try {
            var state = _getState();
            if (!state) return false;

            var household = state.getHousehold(householdId);
            if (!household) return false;

            year = year || _getCurrentYear();

            if (!household.economy) household.economy = {};
            if (!household.economy.schoolProfits) household.economy.schoolProfits = 0;
            if (!household.economy.schoolProfitHistory) household.economy.schoolProfitHistory = [];

            household.economy.schoolProfits += amount;
            household.economy.schoolProfitHistory.push({
                year: year,
                institutionId: institutionId,
                amount: amount
            });

            // Keep only last 100 entries
            if (household.economy.schoolProfitHistory.length > 100) {
                household.economy.schoolProfitHistory = household.economy.schoolProfitHistory.slice(-100);
            }

            // Add to wealth
            updateHouseholdWealth(householdId, amount, 'School profit: ' + (institutionId || 'Unknown institution'));

            return true;
        } finally {
            _processingEconomy = false;
        }
    }

    function getSchoolProfits(householdId, year) {
        if (_processingEconomy) return 0;
        _processingEconomy = true;

        try {
            var state = _getState();
            if (!state) return 0;

            var household = state.getHousehold(householdId);
            if (!household || !household.economy) return 0;

            year = year || _getCurrentYear();

            var total = 0;
            if (household.economy.schoolProfitHistory) {
                for (var i = 0; i < household.economy.schoolProfitHistory.length; i++) {
                    if (household.economy.schoolProfitHistory[i].year === year) {
                        total += household.economy.schoolProfitHistory[i].amount;
                    }
                }
            }
            return total;
        } finally {
            _processingEconomy = false;
        }
    }

    // =========================================================================
    // 9. TRADE
    // =========================================================================

    function executeTrade(sourceId, targetId, trade) {
        if (_processingTrade) {
            return false;
        }
        _processingTrade = true;

        try {
            var state = _getState();
            if (!state) return false;

            var source = state.getHousehold(sourceId);
            var target = state.getHousehold(targetId);
            if (!source || !target) return false;

            trade = trade || {};
            var sourceGives = trade.sourceGives || {};
            var targetGives = trade.targetGives || {};

            // Validate source has enough resources
            if (sourceGives.wealth && (source.wealth || 0) < sourceGives.wealth) return false;
            if (sourceGives.food && (source.resources && source.resources.food || 0) < sourceGives.food) return false;
            if (sourceGives.livestock && (source.resources && source.resources.livestock || 0) < sourceGives.livestock) return false;
            if (sourceGives.goods && (source.resources && source.resources.goods || 0) < sourceGives.goods) return false;

            // Execute trade
            if (sourceGives.wealth) {
                source.wealth = (source.wealth || 0) - sourceGives.wealth;
                target.wealth = (target.wealth || 0) + sourceGives.wealth;
            }
            if (targetGives.wealth) {
                target.wealth = (target.wealth || 0) - targetGives.wealth;
                source.wealth = (source.wealth || 0) + targetGives.wealth;
            }

            // Resource transfers
            if (!source.resources) source.resources = { food: 0, livestock: 0, goods: 0 };
            if (!target.resources) target.resources = { food: 0, livestock: 0, goods: 0 };

            if (sourceGives.food) {
                source.resources.food = (source.resources.food || 0) - sourceGives.food;
                target.resources.food = (target.resources.food || 0) + sourceGives.food;
            }
            if (targetGives.food) {
                target.resources.food = (target.resources.food || 0) - targetGives.food;
                source.resources.food = (source.resources.food || 0) + targetGives.food;
            }

            if (sourceGives.livestock) {
                source.resources.livestock = (source.resources.livestock || 0) - sourceGives.livestock;
                target.resources.livestock = (target.resources.livestock || 0) + sourceGives.livestock;
            }
            if (targetGives.livestock) {
                target.resources.livestock = (target.resources.livestock || 0) - targetGives.livestock;
                source.resources.livestock = (source.resources.livestock || 0) + targetGives.livestock;
            }

            if (sourceGives.goods) {
                source.resources.goods = (source.resources.goods || 0) - sourceGives.goods;
                target.resources.goods = (target.resources.goods || 0) + sourceGives.goods;
            }
            if (targetGives.goods) {
                target.resources.goods = (target.resources.goods || 0) - targetGives.goods;
                source.resources.goods = (source.resources.goods || 0) + targetGives.goods;
            }

            // Log trade
            if (!source.economy) source.economy = {};
            if (!source.economy.trades) source.economy.trades = [];
            source.economy.trades.push({
                year: _getCurrentYear(),
                partnerId: targetId,
                type: 'export',
                gave: sourceGives,
                received: targetGives
            });

            if (!target.economy) target.economy = {};
            if (!target.economy.trades) target.economy.trades = [];
            target.economy.trades.push({
                year: _getCurrentYear(),
                partnerId: sourceId,
                type: 'import',
                gave: targetGives,
                received: sourceGives
            });

            // Save changes
            var households = state.getAllHouseholds({ includeDeprecated: true });
            var sourceIdx = -1, targetIdx = -1;
            for (var i = 0; i < households.length; i++) {
                if (households[i].id === sourceId) sourceIdx = i;
                if (households[i].id === targetId) targetIdx = i;
            }
            if (sourceIdx !== -1) households[sourceIdx] = source;
            if (targetIdx !== -1) households[targetIdx] = target;
            if (sourceIdx !== -1 || targetIdx !== -1) {
                state._setHouseholds(households);
            }

            return true;
        } finally {
            _processingTrade = false;
        }
    }

    function getTradePartners(householdId) {
        if (_processingTrade) return [];
        _processingTrade = true;

        try {
            var state = _getState();
            if (!state) return [];

            var household = state.getHousehold(householdId);
            if (!household || !household.economy || !household.economy.trades) {
                return [];
            }

            var partners = {};
            for (var i = 0; i < household.economy.trades.length; i++) {
                var trade = household.economy.trades[i];
                if (trade.partnerId) {
                    partners[trade.partnerId] = true;
                }
            }

            var result = [];
            var partnerIds = Object.keys(partners);
            for (var j = 0; j < partnerIds.length; j++) {
                var partner = state.getHousehold(partnerIds[j]);
                if (partner) {
                    result.push(partner);
                }
            }

            return result;
        } finally {
            _processingTrade = false;
        }
    }

    // =========================================================================
    // 10. ECONOMIC EVENTS
    // =========================================================================

    var ECONOMIC_EVENTS = {
        good_harvest: {
            id: 'good_harvest',
            name: 'Good Harvest',
            description: 'A bountiful harvest brings prosperity',
            delta: function(household) { return 10 + Math.floor(Math.random() * 20); },
            chance: 0.15
        },
        poor_harvest: {
            id: 'poor_harvest',
            name: 'Poor Harvest',
            description: 'Poor harvest leads to food shortages',
            delta: function(household) { return -10 - Math.floor(Math.random() * 15); },
            chance: 0.10
        },
        trade_bonus: {
            id: 'trade_bonus',
            name: 'Trade Windfall',
            description: 'A profitable trade deal brings extra income',
            delta: function(household) { return 15 + Math.floor(Math.random() * 30); },
            chance: 0.08
        },
        tax_increase: {
            id: 'tax_increase',
            name: 'Tax Increase',
            description: 'Increased taxes reduce household wealth',
            delta: function(household) { return -5 - Math.floor(Math.random() * 10); },
            chance: 0.12
        },
        theft: {
            id: 'theft',
            name: 'Theft',
            description: 'Household was robbed',
            delta: function(household) { return -10 - Math.floor(Math.random() * 20); },
            chance: 0.05
        },
        inheritance: {
            id: 'inheritance',
            name: 'Inheritance',
            description: 'Received inheritance from distant relative',
            delta: function(household) { return 20 + Math.floor(Math.random() * 50); },
            chance: 0.03
        },
        fire: {
            id: 'fire',
            name: 'Fire',
            description: 'Property damaged by fire',
            delta: function(household) { return -15 - Math.floor(Math.random() * 30); },
            chance: 0.04
        },
        // NEW: Enterprise-related events
        enterprise_boom: {
            id: 'enterprise_boom',
            name: 'Enterprise Boom',
            description: 'Your enterprises are thriving!',
            delta: function(household) { 
                var state = _getState();
                if (state && typeof state.getHouseholdEnterprises === 'function') {
                    var enterprises = state.getHouseholdEnterprises(household.id);
                    return enterprises.length * 5 + Math.floor(Math.random() * 20);
                }
                return 15 + Math.floor(Math.random() * 20);
            },
            chance: 0.04
        },
        enterprise_crisis: {
            id: 'enterprise_crisis',
            name: 'Enterprise Crisis',
            description: 'Market downturn affects your businesses',
            delta: function(household) { 
                var state = _getState();
                if (state && typeof state.getHouseholdEnterprises === 'function') {
                    var enterprises = state.getHouseholdEnterprises(household.id);
                    return -(enterprises.length * 3 + Math.floor(Math.random() * 15));
                }
                return -(10 + Math.floor(Math.random() * 15));
            },
            chance: 0.04
        }
    };

    function triggerEconomicEvent(householdId, eventTypeId) {
        if (_processingEconomy) return null;
        _processingEconomy = true;

        try {
            var state = _getState();
            if (!state) return null;

            var household = state.getHousehold(householdId);
            if (!household) return null;

            var event = ECONOMIC_EVENTS[eventTypeId];
            if (!event) return null;

            var delta = typeof event.delta === 'function' ? event.delta(household) : (event.delta || 0);

            if (delta !== 0) {
                updateHouseholdWealth(householdId, delta, event.name);

                if (!household.eventLog) household.eventLog = [];
                household.eventLog.push({
                    year: _getCurrentYear(),
                    type: 'economic_event',
                    eventId: eventTypeId,
                    eventName: event.name,
                    description: event.description,
                    delta: delta,
                    newWealth: household.wealth || 0
                });

                // Save household
                var households = state.getAllHouseholds({ includeDeprecated: true });
                var index = -1;
                for (var i = 0; i < households.length; i++) {
                    if (households[i].id === householdId) {
                        index = i;
                        break;
                    }
                }
                if (index !== -1) {
                    households[index] = household;
                    state._setHouseholds(households);
                }
            }

            return {
                event: event,
                delta: delta,
                newWealth: household.wealth || 0
            };
        } finally {
            _processingEconomy = false;
        }
    }

    function applyRandomEconomicEvent(householdId) {
        if (_processingEconomy) return null;
        _processingEconomy = true;

        try {
            var eventIds = Object.keys(ECONOMIC_EVENTS);

            // Weighted selection based on chance
            var totalChance = 0;
            var weightedEvents = [];
            for (var i = 0; i < eventIds.length; i++) {
                var event = ECONOMIC_EVENTS[eventIds[i]];
                weightedEvents.push({
                    id: eventIds[i],
                    chance: event.chance || 0.05
                });
                totalChance += event.chance || 0.05;
            }

            // Roll to see if any event occurs
            var roll = Math.random();
            if (roll > totalChance) {
                return null;
            }

            // Select event
            var cumulative = 0;
            for (var j = 0; j < weightedEvents.length; j++) {
                cumulative += weightedEvents[j].chance;
                if (roll <= cumulative) {
                    return triggerEconomicEvent(householdId, weightedEvents[j].id);
                }
            }

            return null;
        } finally {
            _processingEconomy = false;
        }
    }

    // =========================================================================
    // 11. BANKRUPTCY
    // =========================================================================

    function isBankrupt(householdId) {
        if (_processingEconomy) return false;
        _processingEconomy = true;

        try {
            var state = _getState();
            if (!state) return false;

            var household = state.getHousehold(householdId);
            if (!household) return true;

            return (household.wealth || 0) < -50;
        } finally {
            _processingEconomy = false;
        }
    }

    function handleBankruptcy(householdId) {
        if (_processingEconomy) return false;
        _processingEconomy = true;

        try {
            var state = _getState();
            if (!state) return false;

            var household = state.getHousehold(householdId);
            if (!household) return false;

            if (!isBankrupt(householdId)) {
                return false;
            }

            // Reset debt
            household.debt = 0;

            // Reduce wealth to 0
            household.wealth = 0;

            // Mark status
            household.status = 'bankrupt';

            if (!household.eventLog) household.eventLog = [];
            household.eventLog.push({
                year: _getCurrentYear(),
                type: 'bankruptcy',
                message: 'Household bankruptcy processed - debt forgiven'
            });

            // Save household
            var households = state.getAllHouseholds({ includeDeprecated: true });
            var index = -1;
            for (var i = 0; i < households.length; i++) {
                if (households[i].id === householdId) {
                    index = i;
                    break;
                }
            }
            if (index !== -1) {
                households[index] = household;
                state._setHouseholds(households);
            }

            return true;
        } finally {
            _processingEconomy = false;
        }
    }

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    window.HouseholdEconomy = {
        // Constants
        ECONOMIC_TIERS: ECONOMIC_TIERS,
        INCOME_SOURCES: INCOME_SOURCES,
        EXPENSE_CATEGORIES: EXPENSE_CATEGORIES,
        ECONOMIC_EVENTS: ECONOMIC_EVENTS,

        // Wealth Management
        getHouseholdWealth: getHouseholdWealth,
        updateHouseholdWealth: updateHouseholdWealth,
        getHouseholdDebt: getHouseholdDebt,
        modifyHouseholdDebt: modifyHouseholdDebt,
        getEconomicTier: getEconomicTier,

        // Resource Management
        getHouseholdResources: getHouseholdResources,
        updateHouseholdResources: updateHouseholdResources,

        // Income & Expenses (UPDATED with Enterprise Integration)
        calculateAnnualIncome: calculateAnnualIncome,
        calculateAnnualExpenses: calculateAnnualExpenses,
        computeNetAnnualChange: computeNetAnnualChange,

        // Annual Processing (UPDATED with Enterprise Integration)
        processAnnualEconomy: processAnnualEconomy,
        consumeAnnualFood: consumeAnnualFood,

        // Salary and Tuition
        receiveSalary: receiveSalary,
        getSalaryIncome: getSalaryIncome,
        getTotalSalariesReceived: getTotalSalariesReceived,
        trackTuitionExpense: trackTuitionExpense,
        getTuitionExpenses: getTuitionExpenses,
        receiveSchoolProfit: receiveSchoolProfit,
        getSchoolProfits: getSchoolProfits,

        // Trade
        executeTrade: executeTrade,
        getTradePartners: getTradePartners,

        // Economic Events
        triggerEconomicEvent: triggerEconomicEvent,
        applyRandomEconomicEvent: applyRandomEconomicEvent,

        // Bankruptcy
        isBankrupt: isBankrupt,
        handleBankruptcy: handleBankruptcy,

        // Internal (for commands)
        _getState: function() { return _getState(); }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.HouseholdEconomy;
    }

})();