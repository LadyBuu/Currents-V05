/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD ECONOMY (household-economy.js)
 * =============================================================================
 *
 * Household economic domain: policy, calculation, and canonical mutation
 * of household wealth, debt, resources, income, and expenses.
 *
 * Contract:
 *   - Pure calculations never mutate.
 *   - Mutations route through HouseholdCommands.
 *   - One logical operation → one committed mutation via HouseholdCommands.
 *   - No direct calls to HouseholdState._internal.replaceHouseholds.
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
            id: 'good_harvest', name: 'Good Harvest',
            description: 'A bountiful harvest brings prosperity',
            delta: function() { return 10 + Math.floor(Math.random() * 20); },
            chance: 0.15
        },
        poor_harvest: {
            id: 'poor_harvest', name: 'Poor Harvest',
            description: 'Poor harvest leads to food shortages',
            delta: function() { return -(10 + Math.floor(Math.random() * 15)); },
            chance: 0.10
        },
        trade_bonus: {
            id: 'trade_bonus', name: 'Trade Windfall',
            description: 'A profitable trade deal brings extra income',
            delta: function() { return 15 + Math.floor(Math.random() * 30); },
            chance: 0.08
        },
        tax_increase: {
            id: 'tax_increase', name: 'Tax Increase',
            description: 'Increased taxes reduce household wealth',
            delta: function() { return -(5 + Math.floor(Math.random() * 10)); },
            chance: 0.12
        },
        theft: {
            id: 'theft', name: 'Theft',
            description: 'Household was robbed',
            delta: function() { return -(10 + Math.floor(Math.random() * 20)); },
            chance: 0.05
        },
        inheritance: {
            id: 'inheritance', name: 'Inheritance',
            description: 'Received inheritance from distant relative',
            delta: function() { return 20 + Math.floor(Math.random() * 50); },
            chance: 0.03
        },
        fire: {
            id: 'fire', name: 'Fire',
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
    // 3. PURE CALCULATIONS
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

    function calculateRentIncome(householdId) {
        var rs = _residenceSystem();
        if (!rs || typeof rs.getTotalRentIncome !== 'function') return 0;
        var v = rs.getTotalRentIncome(householdId, 'household');
        return typeof v === 'number' && isFinite(v) ? v : 0;
    }

    function calculateRentExpenses(householdId) {
        var rs = _residenceSystem();
        if (!rs || typeof rs.getTotalRentExpenses !== 'function') return 0;
        var v = rs.getTotalRentExpenses(householdId, 'household');
        return typeof v === 'number' && isFinite(v) ? v : 0;
    }

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

    function calculateAnnualIncome(householdId) {
        var income = 0;
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

        if (Array.isArray(record.members)) {
            for (var j = 0; j < record.members.length; j++) {
                var member = record.members[j];
                var character = null;
                try {
                    character = window.getCharacterById
                        ? window.getCharacterById(member.characterId)
                        : null;
                } catch (e) { character = null; }
                if (!character || !Array.isArray(character.professions)) continue;
                for (var k = 0; k < character.professions.length; k++) {
                    var p = character.professions[k];
                    if (typeof p.baseSalary === 'number') income += p.baseSalary;
                    if (typeof p.customSalary === 'number') income += p.customSalary;
                }
            }
        }

        var ent = calculateEnterpriseNet(householdId);
        income += ent.income;
        income += calculateRentIncome(householdId);

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

        if (Array.isArray(record.members)) {
            for (var j = 0; j < record.members.length; j++) {
                if (record.members[j].type === 'staff') expenses += 8;
            }
        }

        var ent = calculateEnterpriseNet(householdId);
        expenses += ent.expense;
        expenses += calculateRentExpenses(householdId);

        if (Array.isArray(economy.tuitionExpensesHistory)) {
            var currentYear = _currentYear();
            for (var k = 0; k < economy.tuitionExpensesHistory.length; k++) {
                if (economy.tuitionExpensesHistory[k].year === currentYear) {
                    expenses += economy.tuitionExpensesHistory[k].amount || 0;
                }
            }
        }

        var debt = typeof record.debt === 'number' ? record.debt : 0;
        if (debt > 0) expenses += debt * DEBT_INTEREST_RATE;

        return expenses;
    }

    function computeNetAnnualChange(householdId) {
        return calculateAnnualIncome(householdId) - calculateAnnualExpenses(householdId);
    }

    function isBankrupt(householdId) {
        var h = _queries().getHousehold(householdId);
        if (!h) return false;
        return typeof h.wealth === 'number' && h.wealth < BANKRUPTCY_THRESHOLD;
    }

    // =========================================================================
    // 4. INTERNAL MUTATION HELPERS
    // =========================================================================
    //
    // These mutate the live household record in place. The command layer
    // (HouseholdCommands.updateHousehold) is invoked exactly once to persist.
    // =========================================================================

    function _mutateRecord(householdId, mutator) {
        var state = window.HouseholdState;
        if (!state) throw new Error('HouseholdEconomy: HouseholdState required');
        var record = state._internal.getHouseholdRecord(householdId);
        if (!record) return null;
        mutator(record);
        return record;
    }

    function _persistRecord(householdId) {
        var result = _commands().updateHousehold(householdId, {});
        if (!result || result.success === false) {
            throw new Error('HouseholdEconomy: persistence failed for ' +
                householdId + ' (' + ((result && result.reason) || 'unknown') + ')');
        }
    }

    // =========================================================================
    // 5. WEALTH / DEBT / RESOURCE MUTATIONS
    // =========================================================================

    function updateHouseholdWealth(householdId, delta, reason) {
        if (typeof delta !== 'number' || !isFinite(delta)) {
            throw new Error('HouseholdEconomy.updateHouseholdWealth: delta must be a finite number');
        }
        var h = _queries().getHousehold(householdId);
        if (!h) return null;

        var oldWealth = typeof h.wealth === 'number' ? h.wealth : 0;
        var newWealth = oldWealth + delta;

        _mutateRecord(householdId, function(record) {
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
                record.economy.transactions =
                    record.economy.transactions.slice(-MAX_TRANSACTION_HISTORY);
            }
            record.wealth = newWealth;
        });

        _persistRecord(householdId);
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

        _mutateRecord(householdId, function(record) {
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
                record.economy.transactions =
                    record.economy.transactions.slice(-MAX_TRANSACTION_HISTORY);
            }
            record.debt = newDebt;
        });

        _persistRecord(householdId);
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

        var newValue = null;

        _mutateRecord(householdId, function(record) {
            if (!record.resources || typeof record.resources !== 'object') {
                record.resources = { food: 0, livestock: 0, goods: 0 };
            }
            var oldValue = typeof record.resources[resourceType] === 'number'
                ? record.resources[resourceType] : 0;
            newValue = Math.max(0, oldValue + delta);

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

            record.resources[resourceType] = newValue;
        });

        _persistRecord(householdId);
        return newValue;
    }

    // =========================================================================
    // 6. SALARY / TUITION / SCHOOL PROFIT
    // =========================================================================

    function receiveSalary(householdId, characterId, roleId, salary, year) {
        if (typeof salary !== 'number' || !isFinite(salary)) return false;
        var h = _queries().getHousehold(householdId);
        if (!h) return false;

        var y = year === undefined || year === null ? _currentYear() : year;
        var newWealth = (typeof h.wealth === 'number' ? h.wealth : 0) + salary;

        _mutateRecord(householdId, function(record) {
            if (!record.economy || typeof record.economy !== 'object') record.economy = {};
            var economy = record.economy;

            economy.salaryIncome = (typeof economy.salaryIncome === 'number'
                ? economy.salaryIncome : 0) + salary;

            if (!Array.isArray(economy.salaryIncomeHistory)) {
                economy.salaryIncomeHistory = [];
            }
            economy.salaryIncomeHistory.push({
                year: y, characterId: characterId, roleId: roleId || null, amount: salary
            });
            if (economy.salaryIncomeHistory.length > MAX_SALARY_HISTORY) {
                economy.salaryIncomeHistory =
                    economy.salaryIncomeHistory.slice(-MAX_SALARY_HISTORY);
            }

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

            record.wealth = newWealth;
        });

        try {
            _persistRecord(householdId);
            return true;
        } catch (e) {
            return false;
        }
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
        var newWealth = (typeof h.wealth === 'number' ? h.wealth : 0) - tuition;

        _mutateRecord(householdId, function(record) {
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

            record.wealth = newWealth;
        });

        try {
            _persistRecord(householdId);
            return true;
        } catch (e) {
            return false;
        }
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
        var newWealth = (typeof h.wealth === 'number' ? h.wealth : 0) + amount;

        _mutateRecord(householdId, function(record) {
            if (!record.economy || typeof record.economy !== 'object') record.economy = {};
            var economy = record.economy;

            economy.schoolProfits = (typeof economy.schoolProfits === 'number'
                ? economy.schoolProfits : 0) + amount;

            if (!Array.isArray(economy.schoolProfitHistory)) {
                economy.schoolProfitHistory = [];
            }
            economy.schoolProfitHistory.push({
                year: y, institutionId: institutionId || null, amount: amount
            });
            if (economy.schoolProfitHistory.length > MAX_SCHOOL_PROFIT_HISTORY) {
                economy.schoolProfitHistory =
                    economy.schoolProfitHistory.slice(-MAX_SCHOOL_PROFIT_HISTORY);
            }

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

            record.wealth = newWealth;
        });

        try {
            _persistRecord(householdId);
            return true;
        } catch (e) {
            return false;
        }
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
    // 7. TRADE
    // =========================================================================

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

        // Validate
        if ((sourceGives.wealth || 0) > sourceWealth) {
            return { success: false, code: 'INSUFFICIENT_WEALTH',
                reason: 'Source cannot afford wealth portion' };
        }
        if ((sourceGives.food || 0) > sourceResources.food) {
            return { success: false, code: 'INSUFFICIENT_FOOD', reason: 'Source lacks food' };
        }
        if ((sourceGives.livestock || 0) > sourceResources.livestock) {
            return { success: false, code: 'INSUFFICIENT_LIVESTOCK', reason: 'Source lacks livestock' };
        }
        if ((sourceGives.goods || 0) > sourceResources.goods) {
            return { success: false, code: 'INSUFFICIENT_GOODS', reason: 'Source lacks goods' };
        }
        if ((targetGives.wealth || 0) > targetWealth) {
            return { success: false, code: 'INSUFFICIENT_WEALTH',
                reason: 'Target cannot afford wealth portion' };
        }
        if ((targetGives.food || 0) > targetResources.food) {
            return { success: false, code: 'INSUFFICIENT_FOOD', reason: 'Target lacks food' };
        }
        if ((targetGives.livestock || 0) > targetResources.livestock) {
            return { success: false, code: 'INSUFFICIENT_LIVESTOCK', reason: 'Target lacks livestock' };
        }
        if ((targetGives.goods || 0) > targetResources.goods) {
            return { success: false, code: 'INSUFFICIENT_GOODS', reason: 'Target lacks goods' };
        }

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

        var year = _currentYear();

        // Capture rollback snapshot (only wealth + resources; transaction
        // history is append-only and safe to leave on rollback)
        var sourceSnapshot = {
            wealth: sourceWealth,
            resources: {
                food: sourceResources.food,
                livestock: sourceResources.livestock,
                goods: sourceResources.goods
            }
        };

        // Mutate source in place, then persist via command
        _mutateRecord(sourceId, function(record) {
            record.wealth = newSourceWealth;
            record.resources = newSourceResources;

            if (!record.economy || typeof record.economy !== 'object') record.economy = {};
            if (!Array.isArray(record.economy.trades)) record.economy.trades = [];
            record.economy.trades.push({
                year: year,
                partnerId: targetId,
                type: 'export',
                gave: JSON.parse(JSON.stringify(sourceGives)),
                received: JSON.parse(JSON.stringify(targetGives))
            });
        });

        try {
            _persistRecord(sourceId);
        } catch (e) {
            return { success: false, code: 'SOURCE_UPDATE_FAILED', reason: e.message };
        }

        // Mutate target in place, then persist via command
        _mutateRecord(targetId, function(record) {
            record.wealth = newTargetWealth;
            record.resources = newTargetResources;

            if (!record.economy || typeof record.economy !== 'object') record.economy = {};
            if (!Array.isArray(record.economy.trades)) record.economy.trades = [];
            record.economy.trades.push({
                year: year,
                partnerId: sourceId,
                type: 'import',
                gave: JSON.parse(JSON.stringify(targetGives)),
                received: JSON.parse(JSON.stringify(sourceGives))
            });
        });

        try {
            _persistRecord(targetId);
        } catch (e) {
            // Best-effort rollback of source
            try {
                _mutateRecord(sourceId, function(record) {
                    record.wealth = sourceSnapshot.wealth;
                    record.resources = sourceSnapshot.resources;
                });
                _persistRecord(sourceId);
            } catch (rollbackErr) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('HouseholdEconomy.executeTrade: rollback failed',
                        rollbackErr);
                }
            }
            return { success: false, code: 'TARGET_UPDATE_FAILED', reason: e.message };
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
    // 8. ECONOMIC EVENTS
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

        return { event: event, delta: delta, newWealth: newWealth };
    }

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
    // 9. ANNUAL PROCESSING
    // =========================================================================

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

        var summaries;
        try {
            summaries = _queries().getHouseholdEnterpriseSummaries(householdId);
        } catch (e) { summaries = []; }
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

        var rentIncome = calculateRentIncome(householdId);
        var rentExpense = calculateRentExpenses(householdId);
        if (rentIncome > 0) {
            _commands().recordEvent(householdId, {
                year: year, type: 'rent_income', amount: rentIncome,
                message: 'Rent income from properties owned'
            });
        }
        if (rentExpense > 0) {
            _commands().recordEvent(householdId, {
                year: year, type: 'rent_expense', amount: rentExpense,
                message: 'Rent expenses for properties rented'
            });
        }

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

        if (availableFood > 0) {
            updateHouseholdResources(householdId, 'food', -availableFood);
        }

        if (resources.livestock > 0) {
            var livestockNeeded = Math.ceil(deficit / 3);
            var livestockUsed = Math.min(resources.livestock, livestockNeeded);
            updateHouseholdResources(householdId, 'livestock', -livestockUsed);
            var foodFromLivestock = livestockUsed * 3;
            deficit -= foodFromLivestock;
        }

        if (deficit > 0) {
            var cost = deficit * 0.5;
            updateHouseholdWealth(householdId, -cost, 'Emergency food purchase');
        }

        return false;
    }

    // =========================================================================
    // 10. BANKRUPTCY
    // =========================================================================

    function handleBankruptcy(householdId) {
        if (!isBankrupt(householdId)) {
            return { success: false, code: 'NOT_BANKRUPT', reason: 'Household is not bankrupt' };
        }

        var h = _queries().getHousehold(householdId);
        if (!h) return { success: false, code: 'NOT_FOUND', reason: 'Household not found' };

        _commands().updateHousehold(householdId, { debt: 0 });
        _commands().updateHousehold(householdId, { wealth: 0 });
        _commands().setStatus(householdId, 'bankrupt', {
            year: _currentYear(),
            reason: 'Bankruptcy processed - debt forgiven',
            recordEvent: true
        });

        return { success: true, data: { householdId: householdId } };
    }

    // =========================================================================
    // 11. EXPORTS
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
