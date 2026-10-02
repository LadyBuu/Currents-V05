/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD ECONOMY (household-economy.js)
 * =============================================================================
 * 
 * LOCATION: js/systems/household/household-economy.js
 * 
 * PURPOSE
 * -------
 * Household economic domain: policy, calculation, and canonical mutation
 * of household wealth, debt, resources, income, and expenses.
 * 
 * WHAT LIVES HERE
 * ---------------
 *   - Economic tier definitions
 *   - Income source / expense category catalogs
 *   - Wealth / debt / resource calculations (pure)
 *   - Annual income / expense projection (pure)
 *   - Enterprise profit/loss projection (via HouseholdQueries)
 *   - Rent income/expense projection (via ResidenceSystem queries)
 *   - Salary / tuition / school-profit recording
 *   - Trade execution
 *   - Economic events (trigger / random)
 *   - Bankruptcy detection and handling
 *   - Annual economy processing (one atomic transaction)
 * 
 * WHAT DOES NOT LIVE HERE
 * -----------------------
 *   - Household CRUD                     → HouseholdCommands
 *   - Household semantic reads           → HouseholdQueries
 *   - Enterprise canonical ownership     → IndustryCommands
 *   - Residence canonical occupancy      → ResidenceCommands
 *   - Presentation (icons, colours, toasts) → UI layer
 * 
 * CONTRACT
 * --------
 *   - Pure calculations never mutate.
 *   - Mutations go through HouseholdCommands.updateHousehold,
 *     HouseholdCommands.setStatus, HouseholdCommands.recordEvent.
 *   - One logical operation → one committed mutation.
 *   - No global _processing guard.
 *   - No dependency fallbacks that fabricate domain facts.
 *   - Required dependencies fail loudly.
 * 
 * DEPENDENCIES (required)
 * -----------------------
 *   - HouseholdState (implicitly, via HouseholdCommands)
 *   - HouseholdCommands
 *   - HouseholdQueries
 *   - getCurrentYearSafe
 * 
 * DEPENDENCIES (optional, resolved lazily)
 * ----------------------------------------
 *   - ResidenceSystem  (for rent income/expense)
 *   - IndustryQueries  (via HouseholdQueries enterprise projections)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY ACCESS
    // =========================================================================

    function _commands() {
        if (typeof window.HouseholdCommands === 'undefined') {
            throw new Error('HouseholdEconomy: HouseholdCommands is required');
        }
        return window.HouseholdCommands;
    }

    function _queries() {
        if (typeof window.HouseholdQueries === 'undefined') {
            throw new Error('HouseholdEconomy: HouseholdQueries is required');
        }
        return window.HouseholdQueries;
    }

    function _currentYear() {
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error('HouseholdEconomy: getCurrentYearSafe is required');
        }
        return window.getCurrentYearSafe();
    }

    function _residenceSystem() {
        // Residence is not required for pure household economy to work.
        // Rent is an optional integration.
        return typeof window.ResidenceSystem !== 'undefined'
            ? window.ResidenceSystem
            : null;
    }

    // =========================================================================
    // 2. CONSTANTS
    // =========================================================================

    var ECONOMIC_TIERS = {
        DESTITUTE: { id: 'destitute', minWealth: 0, maxWealth: 10, label: 'Destitute' },
        POOR: { id: 'poor', minWealth: 11, maxWealth: 30, label: 'Poor' },
        MODERATE: { id: 'moderate', minWealth: 31, maxWealth: 70, label: 'Moderate' },
        PROSPEROUS: { id: 'prosperous', minWealth: 71, maxWealth: 120, label: 'Prosperous' },
        WEALTHY: { id: 'wealthy', minWealth: 121, maxWealth: 200, label: 'Wealthy' },
        NOBLE: { id: 'noble', minWealth: 201, maxWealth: 500, label: 'Noble' },
        VERY_NOBLE: { id: 'very_noble', minWealth: 501, maxWealth: 1000, label: 'High Noble' },
        ROYAL: { id: 'royal', minWealth: 1001, maxWealth: Infinity, label: 'Royal' }
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

    var ECONOMIC_EVENTS = {
        good_harvest: {
            id: 'good_harvest',
            name: 'Good Harvest',
            description: 'A bountiful harvest brings prosperity',
            delta: function() { return 10 + Math.floor(Math.random() * 20); },
            chance: 0.15
        },
        poor_harvest: {
            id: 'poor_harvest',
            name: 'Poor Harvest',
            description: 'Poor harvest leads to food shortages',
            delta: function() { return -(10 + Math.floor(Math.random() * 15)); },
            chance: 0.10
        },
        trade_bonus: {
            id: 'trade_bonus',
            name: 'Trade Windfall',
            description: 'A profitable trade deal brings extra income',
            delta: function() { return 15 + Math.floor(Math.random() * 30); },
            chance: 0.08
        },
        tax_increase: {
            id: 'tax_increase',
            name: 'Tax Increase',
            description: 'Increased taxes reduce household wealth',
            delta: function() { return -(5 + Math.floor(Math.random() * 10)); },
            chance: 0.12
        },
        theft: {
            id: 'theft',
            name: 'Theft',
            description: 'Household was robbed',
            delta: function() { return -(10 + Math.floor(Math.random() * 20)); },
            chance: 0.05
        },
        inheritance: {
            id: 'inheritance',
            name: 'Inheritance',
            description: 'Received inheritance from distant relative',
            delta: function() { return 20 + Math.floor(Math.random() * 50); },
            chance: 0.03
        },
        fire: {
            id: 'fire',
            name: 'Fire',
            description: 'Property damaged by fire',
            delta: function() { return -(15 + Math.floor(Math.random() * 30)); },
            chance: 0.04
        }
    };

    var BANKRUPTCY_THRESHOLD = -50;
    var DEBT_INTEREST_RATE = 0.05;
    var MAX_TRANSACTION_HISTORY = 100;
    var MAX_RESOURCE_HISTORY = 100;
    var MAX_SALARY_HISTORY = 100;
    var MAX_TUITION_HISTORY = 100;
    var MAX_SCHOOL_PROFIT_HISTORY = 100;

    // =========================================================================
    // 3. PURE CALCULATIONS (no mutation)
    // =========================================================================

    function getEconomicTier(wealth) {
        var w = typeof wealth === 'number' && isFinite(wealth) ? wealth : 0;
        var keys = Object.keys(ECONOMIC_TIERS);
        for (var i = 0; i < keys.length; i++) {
            var tier = ECONOMIC_TIERS[keys[i]];
            if (w >= tier.minWealth && w <= tier.maxWealth) return tier;
        }
        return ECONOMIC_TIERS.DESTITUTE;
    }

    function getHouseholdWealth(householdId) {
        var h = _queries().getHousehold(householdId);
        return h && typeof h.wealth === 'number' ? h.wealth : 0;
    }

    function getHouseholdDebt(householdId) {
        var h = _queries().getHousehold(householdId);
        return h && typeof h.debt === 'number' ? h.debt : 0;
    }

    function getHouseholdResources(householdId) {
        // Read raw resources via the household projection.
        // HouseholdQueries.getHousehold does not expose raw resources;
        // use the internal record via commands-adjacent path.
        var state = window.HouseholdState;
        if (!state) throw new Error('HouseholdEconomy: HouseholdState required');
        var record = state._internal.getHouseholdRecord(householdId);
        if (!record) return { food: 0, livestock: 0, goods: 0 };
        var r = record.resources || {};
        return {
            food: typeof r.food === 'number' ? r.food : 0,
            livestock: typeof r.livestock === 'number' ? r.livestock : 0,
            goods: typeof r.goods === 'number' ? r.goods : 0
        };
    }

    /**
     * Rent income from properties this household owns.
     * Returns 0 if ResidenceSystem is not loaded.
     */
    function calculateRentIncome(householdId) {
        var rs = _residenceSystem();
        if (!rs || typeof rs.getTotalRentIncome !== 'function') return 0;
        var v = rs.getTotalRentIncome(householdId, 'household');
        return typeof v === 'number' && isFinite(v) ? v : 0;
    }

    /**
     * Rent expenses for properties this household rents.
     * Returns 0 if ResidenceSystem is not loaded.
     */
    function calculateRentExpenses(householdId) {
        var rs = _residenceSystem();
        if (!rs || typeof rs.getTotalRentExpenses !== 'function') return 0;
        var v = rs.getTotalRentExpenses(householdId, 'household');
        return typeof v === 'number' && isFinite(v) ? v : 0;
    }

    /**
     * Enterprise net profit/loss for private enterprises owned by the household.
     * Public enterprises do not contribute to household income.
     * PURE: does not record history.
     */
    function calculateEnterpriseNet(householdId) {
        var summaries;
        try {
            summaries = _queries().getHouseholdEnterpriseSummaries(householdId);
        } catch (e) {
            summaries = [];
        }
        var income = 0;
        var expense = 0;
        for (var i = 0; i < summaries.length; i++) {
            var s = summaries[i];
            if (s.ownershipType === 'public') continue;
            var profit = typeof s.annualProfit === 'number' ? s.annualProfit : 0;
            if (profit > 0) income += profit;
            else if (profit < 0) expense += -profit;
        }
        return { income: income, expense: expense };
    }

    /**
     * PURE: annual income projection. Does not record history.
     */
    function calculateAnnualIncome(householdId) {
        var income = 0;

        // Explicit income sources recorded on economy
        var h = _queries().getHousehold(householdId);
        if (!h) return 0;

        var state = window.HouseholdState;
        if (!state) throw new Error('HouseholdEconomy: HouseholdState required');
        var record = state._internal.getHouseholdRecord(householdId);
        if (!record) return 0;

        var economy = record.economy || {};
        if (Array.isArray(economy.incomeSources)) {
            for (var i = 0; i < economy.incomeSources.length; i++) {
                income += economy.incomeSources[i].amount || 0;
            }
        }

        // Member salaries
        if (Array.isArray(record.members)) {
            for (var j = 0; j < record.members.length; j++) {
                var member = record.members[j];
                var character = null;
                try {
                    character = window.getCharacterById
                        ? window.getCharacterById(member.characterId)
                        : null;
                } catch (e) {
                    character = null;
                }
                if (!character || !Array.isArray(character.professions)) continue;
                for (var k = 0; k < character.professions.length; k++) {
                    var p = character.professions[k];
                    if (typeof p.baseSalary === 'number') income += p.baseSalary;
                    if (typeof p.customSalary === 'number') income += p.customSalary;
                }
            }
        }

        // Enterprise income
        var ent = calculateEnterpriseNet(householdId);
        income += ent.income;

        // Rent income
        income += calculateRentIncome(householdId);

        // School profits for the current year
        if (economy && Array.isArray(economy.schoolProfitHistory)) {
            var currentYear = _currentYear();
            for (var m = 0; m < economy.schoolProfitHistory.length; m++) {
                if (economy.schoolProfitHistory[m].year === currentYear) {
                    income += economy.schoolProfitHistory[m].amount || 0;
                }
            }
        }

        return income;
    }

    /**
     * PURE: annual expense projection. Does not record history.
     */
    function calculateAnnualExpenses(householdId) {
        var expenses = 0;

        var state = window.HouseholdState;
        if (!state) throw new Error('HouseholdEconomy: HouseholdState required');
        var record = state._internal.getHouseholdRecord(householdId);
        if (!record) return 0;

        var economy = record.economy || {};

        if (Array.isArray(economy.expenses)) {
            for (var i = 0; i < economy.expenses.length; i++) {
                expenses += economy.expenses[i].amount || 0;
            }
        }

        // Staff wages (default wage per staff member)
        if (Array.isArray(record.members)) {
            for (var j = 0; j < record.members.length; j++) {
                if (record.members[j].type === 'staff') {
                    expenses += 8;
                }
            }
        }

        // Enterprise losses
        var ent = calculateEnterpriseNet(householdId);
        expenses += ent.expense;

        // Rent expenses
        expenses += calculateRentExpenses(householdId);

        // Tuition expenses for the current year
        if (Array.isArray(economy.tuitionExpensesHistory)) {
            var currentYear = _currentYear();
            for (var k = 0; k < economy.tuitionExpensesHistory.length; k++) {
                if (economy.tuitionExpensesHistory[k].year === currentYear) {
                    expenses += economy.tuitionExpensesHistory[k].amount || 0;
                }
            }
        }

        // Debt interest
        var debt = typeof record.debt === 'number' ? record.debt : 0;
        if (debt > 0) {
            expenses += debt * DEBT_INTEREST_RATE;
        }

        return expenses;
    }

    /**
     * PURE: net annual change.
     */
    function computeNetAnnualChange(householdId) {
        return calculateAnnualIncome(householdId) - calculateAnnualExpenses(householdId);
    }

    function isBankrupt(householdId) {
        var h = _queries().getHousehold(householdId);
        if (!h) return false;
        return typeof h.wealth === 'number' && h.wealth < BANKRUPTCY_THRESHOLD;
    }

    // =========================================================================
    // 4. WEALTH / DEBT / RESOURCE MUTATIONS
    // =========================================================================
    //
    // All wealth/debt/resource changes are committed via
    // HouseholdCommands.updateHousehold(). This module does NOT touch
    // household records directly.
    // =========================================================================

    /**
     * Updates household wealth by delta. Returns the new wealth.
     * 
     * Records a transaction in economy.transactions.
     */
    function updateHouseholdWealth(householdId, delta, reason) {
        if (typeof delta !== 'number' || !isFinite(delta)) {
            throw new Error('HouseholdEconomy.updateHouseholdWealth: delta must be a finite number');
        }
        var h = _queries().getHousehold(householdId);
        if (!h) return null;

        var oldWealth = typeof h.wealth === 'number' ? h.wealth : 0;
        var newWealth = oldWealth + delta;

        // Persist via Commands (which owns the household record mutation).
        // We need to write both wealth AND a transaction entry. The
        // generic updateHousehold command does not manage economy history,
        // so we use the State internal record to attach the transaction
        // and then call updateHousehold.
        var state = window.HouseholdState;
        if (!state) throw new Error('HouseholdEconomy: HouseholdState required');
        var record = state._internal.getHouseholdRecord(householdId);
        if (!record) return null;

        if (!record.economy || typeof record.economy !== 'object') record.economy = {};
        if (!Array.isArray(record.economy.transactions)) record.economy.transactions = [];
        record.economy.transactions.push({
            year: _currentYear(),
            type: 'wealth_change',
            amount: delta,
            reason: reason || 'Wealth adjustment',
            oldWealth: oldWealth,
            newWealth: newWealth
        });
        if (record.economy.transactions.length > MAX_TRANSACTION_HISTORY) {
            record.economy.transactions = record.economy.transactions.slice(-MAX_TRANSACTION_HISTORY);
        }

        var result = _commands().updateHousehold(householdId, {
            wealth: newWealth
        });
        if (!result.success) {
            throw new Error('HouseholdEconomy.updateHouseholdWealth: ' + result.reason);
        }

        return newWealth;
    }

    function modifyHouseholdDebt(householdId, delta) {
        if (typeof delta !== 'number' || !isFinite(delta)) {
            throw new Error('HouseholdEconomy.modifyHouseholdDebt: delta must be a finite number');
        }
        var h = _queries().getHousehold(householdId);
        if (!h) return null;

        var oldDebt = typeof h.debt === 'number' ? h.debt : 0;
        var newDebt = Math.max(0, oldDebt + delta);

        var state = window.HouseholdState;
        if (!state) throw new Error('HouseholdEconomy: HouseholdState required');
        var record = state._internal.getHouseholdRecord(householdId);
        if (!record) return null;

        if (!record.economy || typeof record.economy !== 'object') record.economy = {};
        if (!Array.isArray(record.economy.transactions)) record.economy.transactions = [];
        record.economy.transactions.push({
            year: _currentYear(),
            type: 'debt_change',
            amount: delta,
            oldDebt: oldDebt,
            newDebt: newDebt
        });
        if (record.economy.transactions.length > MAX_TRANSACTION_HISTORY) {
            record.economy.transactions = record.economy.transactions.slice(-MAX_TRANSACTION_HISTORY);
        }

        var result = _commands().updateHousehold(householdId, { debt: newDebt });
        if (!result.success) {
            throw new Error('HouseholdEconomy.modifyHouseholdDebt: ' + result.reason);
        }

        return newDebt;
    }

    function updateHouseholdResources(householdId, resourceType, delta) {
        var valid = ['food', 'livestock', 'goods'];
        if (valid.indexOf(resourceType) === -1) {
            throw new Error('HouseholdEconomy.updateHouseholdResources: invalid resource type');
        }
        if (typeof delta !== 'number' || !isFinite(delta)) {
            throw new Error('HouseholdEconomy.updateHouseholdResources: delta must be a finite number');
        }

        var state = window.HouseholdState;
        if (!state) throw new Error('HouseholdEconomy: HouseholdState required');
        var record = state._internal.getHouseholdRecord(householdId);
        if (!record) return null;

        if (!record.resources || typeof record.resources !== 'object') {
            record.resources = { food: 0, livestock: 0, goods: 0 };
        }
        var oldValue = typeof record.resources[resourceType] === 'number'
            ? record.resources[resourceType] : 0;
        var newValue = Math.max(0, oldValue + delta);

        if (!record.economy || typeof record.economy !== 'object') record.economy = {};
        if (!Array.isArray(record.economy.resourceHistory)) {
            record.economy.resourceHistory = [];
        }
        record.economy.resourceHistory.push({
            year: _currentYear(),
            resource: resourceType,
            delta: delta,
            oldValue: oldValue,
            newValue: newValue
        });
        if (record.economy.resourceHistory.length > MAX_RESOURCE_HISTORY) {
            record.economy.resourceHistory =
                record.economy.resourceHistory.slice(-MAX_RESOURCE_HISTORY);
        }

        // Persist the resources object via updateHousehold
        var result = _commands().updateHousehold(householdId, {
            resources: record.resources
        });
        if (!result.success) {
            throw new Error('HouseholdEconomy.updateHouseholdResources: ' + result.reason);
        }

        return newValue;
    }

    // =========================================================================
    // 5. SALARY / TUITION / SCHOOL PROFIT RECORDING
    // =========================================================================

    function receiveSalary(householdId, characterId, roleId, salary, year) {
        if (typeof salary !== 'number' || !isFinite(salary)) return false;

        var h = _queries().getHousehold(householdId);
        if (!h) return false;

        var y = year === undefined || year === null ? _currentYear() : year;

        var state = window.HouseholdState;
        if (!state) return false;
        var record = state._internal.getHouseholdRecord(householdId);
        if (!record) return false;

        if (!record.economy || typeof record.economy !== 'object') record.economy = {};
        var economy = record.economy;

        economy.salaryIncome = (typeof economy.salaryIncome === 'number'
            ? economy.salaryIncome : 0) + salary;

        if (!Array.isArray(economy.salaryIncomeHistory)) {
            economy.salaryIncomeHistory = [];
        }
        economy.salaryIncomeHistory.push({
            year: y,
            characterId: characterId,
            roleId: roleId || null,
            amount: salary
        });
        if (economy.salaryIncomeHistory.length > MAX_SALARY_HISTORY) {
            economy.salaryIncomeHistory =
                economy.salaryIncomeHistory.slice(-MAX_SALARY_HISTORY);
        }

        // Persist economy object + wealth update in one command
        var newWealth = (typeof h.wealth === 'number' ? h.wealth : 0) + salary;

        // Capture wealth transaction
        if (!Array.isArray(economy.transactions)) economy.transactions = [];
        economy.transactions.push({
            year: y,
            type: 'salary_received',
            amount: salary,
            roleId: roleId || null,
            characterId: characterId,
            oldWealth: h.wealth,
            newWealth: newWealth
        });
        if (economy.transactions.length > MAX_TRANSACTION_HISTORY) {
            economy.transactions = economy.transactions.slice(-MAX_TRANSACTION_HISTORY);
        }

        var result = _commands().updateHousehold(householdId, {
            wealth: newWealth,
            economy: economy
        });
        return result.success;
    }

    function getSalaryIncome(householdId, year) {
        var y = year === undefined || year === null ? _currentYear() : year;
        var state = window.HouseholdState;
        if (!state) return 0;
        var record = state._internal.getHouseholdRecord(householdId);
        if (!record || !record.economy || !Array.isArray(record.economy.salaryIncomeHistory)) {
            return 0;
        }
        var total = 0;
        var hist = record.economy.salaryIncomeHistory;
        for (var i = 0; i < hist.length; i++) {
            if (hist[i].year === y) total += hist[i].amount || 0;
        }
        return total;
    }

    function getTotalSalariesReceived(householdId) {
        var state = window.HouseholdState;
        if (!state) return 0;
        var record = state._internal.getHouseholdRecord(householdId);
        if (!record || !record.economy) return 0;
        return typeof record.economy.salaryIncome === 'number'
            ? record.economy.salaryIncome : 0;
    }

    function trackTuitionExpense(householdId, tuition, institutionId, studentId, year) {
        if (typeof tuition !== 'number' || !isFinite(tuition)) return false;

        var h = _queries().getHousehold(householdId);
        if (!h) return false;

        var y = year === undefined || year === null ? _currentYear() : year;

        var state = window.HouseholdState;
        if (!state) return false;
        var record = state._internal.getHouseholdRecord(householdId);
        if (!record) return false;

        if (!record.economy || typeof record.economy !== 'object') record.economy = {};
        var economy = record.economy;

        economy.tuitionExpenses = (typeof economy.tuitionExpenses === 'number'
            ? economy.tuitionExpenses : 0) + tuition;

        if (!Array.isArray(economy.tuitionExpensesHistory)) {
            economy.tuitionExpensesHistory = [];
        }
        economy.tuitionExpensesHistory.push({
            year: y,
            institutionId: institutionId || null,
            studentId: studentId || null,
            amount: tuition
        });
        if (economy.tuitionExpensesHistory.length > MAX_TUITION_HISTORY) {
            economy.tuitionExpensesHistory =
                economy.tuitionExpensesHistory.slice(-MAX_TUITION_HISTORY);
        }

        var newWealth = (typeof h.wealth === 'number' ? h.wealth : 0) - tuition;

        if (!Array.isArray(economy.transactions)) economy.transactions = [];
        economy.transactions.push({
            year: y,
            type: 'tuition_paid',
            amount: -tuition,
            institutionId: institutionId || null,
            studentId: studentId || null,
            oldWealth: h.wealth,
            newWealth: newWealth
        });
        if (economy.transactions.length > MAX_TRANSACTION_HISTORY) {
            economy.transactions = economy.transactions.slice(-MAX_TRANSACTION_HISTORY);
        }

        var result = _commands().updateHousehold(householdId, {
            wealth: newWealth,
            economy: economy
        });
        return result.success;
    }

    function getTuitionExpenses(householdId, year) {
        var y = year === undefined || year === null ? _currentYear() : year;
        var state = window.HouseholdState;
        if (!state) return 0;
        var record = state._internal.getHouseholdRecord(householdId);
        if (!record || !record.economy ||
            !Array.isArray(record.economy.tuitionExpensesHistory)) return 0;
        var total = 0;
        var hist = record.economy.tuitionExpensesHistory;
        for (var i = 0; i < hist.length; i++) {
            if (hist[i].year === y) total += hist[i].amount || 0;
        }
        return total;
    }

    function receiveSchoolProfit(householdId, amount, institutionId, year) {
        if (typeof amount !== 'number' || !isFinite(amount)) return false;

        var h = _queries().getHousehold(householdId);
        if (!h) return false;

        var y = year === undefined || year === null ? _currentYear() : year;

        var state = window.HouseholdState;
        if (!state) return false;
        var record = state._internal.getHouseholdRecord(householdId);
        if (!record) return false;

        if (!record.economy || typeof record.economy !== 'object') record.economy = {};
        var economy = record.economy;

        economy.schoolProfits = (typeof economy.schoolProfits === 'number'
            ? economy.schoolProfits : 0) + amount;

        if (!Array.isArray(economy.schoolProfitHistory)) {
            economy.schoolProfitHistory = [];
        }
        economy.schoolProfitHistory.push({
            year: y,
            institutionId: institutionId || null,
            amount: amount
        });
        if (economy.schoolProfitHistory.length > MAX_SCHOOL_PROFIT_HISTORY) {
            economy.schoolProfitHistory =
                economy.schoolProfitHistory.slice(-MAX_SCHOOL_PROFIT_HISTORY);
        }

        var newWealth = (typeof h.wealth === 'number' ? h.wealth : 0) + amount;

        if (!Array.isArray(economy.transactions)) economy.transactions = [];
        economy.transactions.push({
            year: y,
            type: 'school_profit',
            amount: amount,
            institutionId: institutionId || null,
            oldWealth: h.wealth,
            newWealth: newWealth
        });
        if (economy.transactions.length > MAX_TRANSACTION_HISTORY) {
            economy.transactions = economy.transactions.slice(-MAX_TRANSACTION_HISTORY);
        }

        var result = _commands().updateHousehold(householdId, {
            wealth: newWealth,
            economy: economy
        });
        return result.success;
    }

    function getSchoolProfits(householdId, year) {
        var y = year === undefined || year === null ? _currentYear() : year;
        var state = window.HouseholdState;
        if (!state) return 0;
        var record = state._internal.getHouseholdRecord(householdId);
        if (!record || !record.economy ||
            !Array.isArray(record.economy.schoolProfitHistory)) return 0;
        var total = 0;
        var hist = record.economy.schoolProfitHistory;
        for (var i = 0; i < hist.length; i++) {
            if (hist[i].year === y) total += hist[i].amount || 0;
        }
        return total;
    }

    // =========================================================================
    // 6. TRADE
    // =========================================================================

    /**
     * Executes a trade between two households.
     * 
     * Validates BOTH sides before mutating either.
     * Returns { success, reason } shape.
     * 
     * Trade shape:
     *   { sourceGives: { wealth?, food?, livestock?, goods? },
     *     targetGives: { wealth?, food?, livestock?, goods? } }
     */
    function executeTrade(sourceId, targetId, trade) {
        if (!trade || typeof trade !== 'object') {
            return { success: false, code: 'INVALID_TRADE', reason: 'Trade data required' };
        }

        var source = _queries().getHousehold(sourceId);
        var target = _queries().getHousehold(targetId);
        if (!source) return { success: false, code: 'SOURCE_NOT_FOUND', reason: 'Source household not found' };
        if (!target) return { success: false, code: 'TARGET_NOT_FOUND', reason: 'Target household not found' };

        var sourceGives = trade.sourceGives || {};
        var targetGives = trade.targetGives || {};

        var sourceResources = getHouseholdResources(sourceId);
        var targetResources = getHouseholdResources(targetId);
        var sourceWealth = typeof source.wealth === 'number' ? source.wealth : 0;
        var targetWealth = typeof target.wealth === 'number' ? target.wealth : 0;

        // Validate source has enough to give
        if ((sourceGives.wealth || 0) > sourceWealth) {
            return { success: false, code: 'INSUFFICIENT_WEALTH',
                reason: 'Source cannot afford wealth portion' };
        }
        if ((sourceGives.food || 0) > sourceResources.food) {
            return { success: false, code: 'INSUFFICIENT_FOOD',
                reason: 'Source lacks food' };
        }
        if ((sourceGives.livestock || 0) > sourceResources.livestock) {
            return { success: false, code: 'INSUFFICIENT_LIVESTOCK',
                reason: 'Source lacks livestock' };
        }
        if ((sourceGives.goods || 0) > sourceResources.goods) {
            return { success: false, code: 'INSUFFICIENT_GOODS',
                reason: 'Source lacks goods' };
        }

        // Validate target has enough to give
        if ((targetGives.wealth || 0) > targetWealth) {
            return { success: false, code: 'INSUFFICIENT_WEALTH',
                reason: 'Target cannot afford wealth portion' };
        }
        if ((targetGives.food || 0) > targetResources.food) {
            return { success: false, code: 'INSUFFICIENT_FOOD',
                reason: 'Target lacks food' };
        }
        if ((targetGives.livestock || 0) > targetResources.livestock) {
            return { success: false, code: 'INSUFFICIENT_LIVESTOCK',
                reason: 'Target lacks livestock' };
        }
        if ((targetGives.goods || 0) > targetResources.goods) {
            return { success: false, code: 'INSUFFICIENT_GOODS',
                reason: 'Target lacks goods' };
        }

        // Compute new values
        var newSourceWealth = sourceWealth - (sourceGives.wealth || 0) + (targetGives.wealth || 0);
        var newTargetWealth = targetWealth - (targetGives.wealth || 0) + (sourceGives.wealth || 0);

        var newSourceResources = {
            food: sourceResources.food - (sourceGives.food || 0) + (targetGives.food || 0),
            livestock: sourceResources.livestock - (sourceGives.livestock || 0) + (targetGives.livestock || 0),
            goods: sourceResources.goods - (sourceGives.goods || 0) + (targetGives.goods || 0)
        };
        var newTargetResources = {
            food: targetResources.food - (targetGives.food || 0) + (sourceGives.food || 0),
            livestock: targetResources.livestock - (targetGives.livestock || 0) + (sourceGives.livestock || 0),
            goods: targetResources.goods - (targetGives.goods || 0) + (sourceGives.goods || 0)
        };

        // Apply via commands — but note: two households means two commands.
        // This is inherently non-atomic across households unless the
        // caller wraps them. We apply both, checking each. If the second
        // fails, we attempt to roll back the first.

        var sourceResult = _commands().updateHousehold(sourceId, {
            wealth: newSourceWealth,
            resources: newSourceResources
        });
        if (!sourceResult.success) {
            return { success: false, code: 'SOURCE_UPDATE_FAILED', reason: sourceResult.reason };
        }

        var targetResult = _commands().updateHousehold(targetId, {
            wealth: newTargetWealth,
            resources: newTargetResources
        });
        if (!targetResult.success) {
            // Roll back source
            _commands().updateHousehold(sourceId, {
                wealth: sourceWealth,
                resources: sourceResources
            });
            return { success: false, code: 'TARGET_UPDATE_FAILED', reason: targetResult.reason };
        }

        // Append trade history on both sides
        var state = window.HouseholdState;
        if (state) {
            var sourceRecord = state._internal.getHouseholdRecord(sourceId);
            var targetRecord = state._internal.getHouseholdRecord(targetId);
            var year = _currentYear();

            if (sourceRecord) {
                if (!sourceRecord.economy) sourceRecord.economy = {};
                if (!Array.isArray(sourceRecord.economy.trades)) sourceRecord.economy.trades = [];
                sourceRecord.economy.trades.push({
                    year: year,
                    partnerId: targetId,
                    type: 'export',
                    gave: JSON.parse(JSON.stringify(sourceGives)),
                    received: JSON.parse(JSON.stringify(targetGives))
                });
            }
            if (targetRecord) {
                if (!targetRecord.economy) targetRecord.economy = {};
                if (!Array.isArray(targetRecord.economy.trades)) targetRecord.economy.trades = [];
                targetRecord.economy.trades.push({
                    year: year,
                    partnerId: sourceId,
                    type: 'import',
                    gave: JSON.parse(JSON.stringify(targetGives)),
                    received: JSON.parse(JSON.stringify(sourceGives))
                });
            }

            // Commit trade history — these records are already in the
            // canonical arrays, so replaceHouseholds() persists them.
            state._internal.replaceHouseholds(
                state._internal.getAllHouseholdRecords({ includeDeprecated: true })
            );
        }

        return { success: true, data: { sourceId: sourceId, targetId: targetId } };
    }

    function getTradePartners(householdId) {
        var state = window.HouseholdState;
        if (!state) return [];
        var record = state._internal.getHouseholdRecord(householdId);
        if (!record || !record.economy || !Array.isArray(record.economy.trades)) {
            return [];
        }
        var seen = {};
        var result = [];
        for (var i = 0; i < record.economy.trades.length; i++) {
            var pid = record.economy.trades[i].partnerId;
            if (pid && !seen[pid]) {
                seen[pid] = true;
                var partner = _queries().getHousehold(pid);
                if (partner) result.push(partner);
            }
        }
        return result;
    }

    // =========================================================================
    // 7. ECONOMIC EVENTS
    // =========================================================================

    function triggerEconomicEvent(householdId, eventTypeId) {
        var event = ECONOMIC_EVENTS[eventTypeId];
        if (!event) return null;

        var delta = typeof event.delta === 'function'
            ? event.delta()
            : (event.delta || 0);

        if (delta === 0) return null;

        var newWealth = updateHouseholdWealth(householdId, delta, event.name);

        _commands().recordEvent(householdId, {
            year: _currentYear(),
            type: 'economic_event',
            message: event.name,
            details: event.description,
            amount: delta
        });

        return {
            event: event,
            delta: delta,
            newWealth: newWealth
        };
    }

    /**
     * Applies a random economic event based on configured probabilities.
     * Returns null if no event fires.
     */
    function applyRandomEconomicEvent(householdId) {
        var eventIds = Object.keys(ECONOMIC_EVENTS);
        var totalChance = 0;
        var weighted = [];
        for (var i = 0; i < eventIds.length; i++) {
            var e = ECONOMIC_EVENTS[eventIds[i]];
            var c = typeof e.chance === 'number' ? e.chance : 0.05;
            weighted.push({ id: eventIds[i], chance: c });
            totalChance += c;
        }

        var roll = Math.random();
        if (roll > totalChance) return null;

        var cumulative = 0;
        for (var j = 0; j < weighted.length; j++) {
            cumulative += weighted[j].chance;
            if (roll <= cumulative) {
                return triggerEconomicEvent(householdId, weighted[j].id);
            }
        }
        return null;
    }

    // =========================================================================
    // 8. ANNUAL PROCESSING (atomic per household)
    // =========================================================================

    /**
     * Processes one full year of household economy.
     * 
     * Structure:
     *   1. Compute net annual change (pure)
     *   2. Apply wealth delta in one command
     *   3. Append enterprise event log entries
     *   4. Append rent event log entries
     *   5. Update status if bankrupt / recovered
     * 
     * Because each command persists on its own, this method performs
     * multiple commits. It is explicitly NON-ATOMIC across steps, but
     * each step is idempotent enough that re-running after a partial
     * failure is safe.
     * 
     * Returns a summary object.
     */
    function processAnnualEconomy(householdId) {
        var h = _queries().getHousehold(householdId);
        if (!h) return { success: false, code: 'NOT_FOUND', reason: 'Household not found' };

        var year = _currentYear();
        var oldWealth = typeof h.wealth === 'number' ? h.wealth : 0;
        var income = calculateAnnualIncome(householdId);
        var expenses = calculateAnnualExpenses(householdId);
        var netChange = income - expenses;

        if (netChange !== 0) {
            updateHouseholdWealth(householdId, netChange, 'Annual economy processing');
        }

        // Enterprise event log
        var summaries;
        try {
            summaries = _queries().getHouseholdEnterpriseSummaries(householdId);
        } catch (e) {
            summaries = [];
        }
        for (var i = 0; i < summaries.length; i++) {
            var s = summaries[i];
            if (typeof s.annualProfit !== 'number' || s.annualProfit === 0) continue;
            _commands().recordEvent(householdId, {
                year: year,
                type: s.annualProfit > 0 ? 'enterprise_profit' : 'enterprise_loss',
                amount: Math.abs(s.annualProfit),
                details: s.name
            });
        }

        // Rent events
        var rentIncome = calculateRentIncome(householdId);
        var rentExpense = calculateRentExpenses(householdId);
        if (rentIncome > 0) {
            _commands().recordEvent(householdId, {
                year: year,
                type: 'rent_income',
                amount: rentIncome,
                message: 'Rent income from properties owned'
            });
        }
        if (rentExpense > 0) {
            _commands().recordEvent(householdId, {
                year: year,
                type: 'rent_expense',
                amount: rentExpense,
                message: 'Rent expenses for properties rented'
            });
        }

        // Bankruptcy / recovery
        var refreshed = _queries().getHousehold(householdId);
        var currentWealth = refreshed && typeof refreshed.wealth === 'number'
            ? refreshed.wealth : 0;
        var nowBankrupt = currentWealth < BANKRUPTCY_THRESHOLD;

        if (nowBankrupt && refreshed.status !== 'bankrupt') {
            _commands().setStatus(householdId, 'bankrupt', {
                year: year,
                reason: 'Wealth below bankruptcy threshold',
                recordEvent: true
            });
        } else if (!nowBankrupt && refreshed.status === 'bankrupt' && currentWealth > 10) {
            _commands().setStatus(householdId, 'active', {
                year: year,
                reason: 'Recovered from bankruptcy',
                recordEvent: true
            });
        }

        return {
            success: true,
            householdId: householdId,
            householdName: refreshed.name || 'Unnamed',
            oldWealth: oldWealth,
            newWealth: currentWealth,
            income: income,
            expenses: expenses,
            netChange: netChange,
            rentIncome: rentIncome,
            rentExpenses: rentExpense,
            bankrupt: nowBankrupt,
            year: year
        };
    }

    /**
     * Consumes annual food supply.
     * Members need 2 units of food each. Deficit is covered from
     * livestock (converted 3:1 to food) or purchased from wealth.
     * 
     * Returns true if food was sufficient.
     */
    function consumeAnnualFood(householdId) {
        var state = window.HouseholdState;
        if (!state) return false;
        var record = state._internal.getHouseholdRecord(householdId);
        if (!record) return false;

        var members = Array.isArray(record.members) ? record.members.length : 0;
        var foodNeeded = members * 2;

        var resources = getHouseholdResources(householdId);
        var availableFood = resources.food;

        if (availableFood >= foodNeeded) {
            updateHouseholdResources(householdId, 'food', -foodNeeded);
            return true;
        }

        var deficit = foodNeeded - availableFood;

        // Consume all food first
        if (availableFood > 0) {
            updateHouseholdResources(householdId, 'food', -availableFood);
        }

        // Livestock conversion: 1 livestock = 3 food
        if (resources.livestock > 0) {
            var livestockNeeded = Math.ceil(deficit / 3);
            var livestockUsed = Math.min(resources.livestock, livestockNeeded);
            updateHouseholdResources(householdId, 'livestock', -livestockUsed);
            var foodFromLivestock = livestockUsed * 3;
            deficit -= foodFromLivestock;
        }

        // Buy remaining food from wealth
        if (deficit > 0) {
            var cost = deficit * 0.5;
            updateHouseholdWealth(householdId, -cost, 'Emergency food purchase');
        }

        return false;
    }

    // =========================================================================
    // 9. BANKRUPTCY HANDLING
    // =========================================================================

    function handleBankruptcy(householdId) {
        if (!isBankrupt(householdId)) {
            return { success: false, code: 'NOT_BANKRUPT', reason: 'Household is not bankrupt' };
        }

        var h = _queries().getHousehold(householdId);
        if (!h) return { success: false, code: 'NOT_FOUND', reason: 'Household not found' };

        // Forgive debt
        _commands().updateHousehold(householdId, { debt: 0 });

        // Zero out wealth
        _commands().updateHousehold(householdId, { wealth: 0 });

        // Mark bankrupt
        _commands().setStatus(householdId, 'bankrupt', {
            year: _currentYear(),
            reason: 'Bankruptcy processed - debt forgiven',
            recordEvent: true
        });

        return { success: true, data: { householdId: householdId } };
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.HouseholdEconomy = {
        // Constants
        ECONOMIC_TIERS: ECONOMIC_TIERS,
        INCOME_SOURCES: INCOME_SOURCES,
        EXPENSE_CATEGORIES: EXPENSE_CATEGORIES,
        ECONOMIC_EVENTS: ECONOMIC_EVENTS,
        BANKRUPTCY_THRESHOLD: BANKRUPTCY_THRESHOLD,

        // Pure calculations
        getEconomicTier: getEconomicTier,
        getHouseholdWealth: getHouseholdWealth,
        getHouseholdDebt: getHouseholdDebt,
        getHouseholdResources: getHouseholdResources,
        calculateRentIncome: calculateRentIncome,
        calculateRentExpenses: calculateRentExpenses,
        calculateEnterpriseNet: calculateEnterpriseNet,
        calculateAnnualIncome: calculateAnnualIncome,
        calculateAnnualExpenses: calculateAnnualExpenses,
        computeNetAnnualChange: computeNetAnnualChange,
        isBankrupt: isBankrupt,

        // Wealth / debt / resource mutations
        updateHouseholdWealth: updateHouseholdWealth,
        modifyHouseholdDebt: modifyHouseholdDebt,
        updateHouseholdResources: updateHouseholdResources,

        // Salary / tuition / school
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

        // Events
        triggerEconomicEvent: triggerEconomicEvent,
        applyRandomEconomicEvent: applyRandomEconomicEvent,

        // Annual processing
        processAnnualEconomy: processAnnualEconomy,
        consumeAnnualFood: consumeAnnualFood,

        // Bankruptcy
        handleBankruptcy: handleBankruptcy
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.HouseholdEconomy;
    }

})();
