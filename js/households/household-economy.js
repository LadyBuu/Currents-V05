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
 * CONVERGED PATTERN
 * -----------------
 *   - Pure calculations never mutate. Never throw on missing household;
 *     return 0 / false / null as appropriate.
 *   - Mutations route through HouseholdCommands, then call
 *     HouseholdCommands.persist() exactly ONCE per logical operation.
 *   - One logical operation → one mutation primitive → one commit →
 *     one persist.
 *   - No direct calls to HouseholdState._internal.replaceHouseholds.
 *   - Structured results everywhere:
 *       { success: true,  data: ... }
 *       { success: false, code: 'SOME_CODE', reason: 'human message' }
 *
 * RESULT SHAPE CHANGE
 * -------------------
 * This module previously returned raw values (wealth number, true/false)
 * from mutating functions. It now returns structured results from all
 * mutations so callers can distinguish "no household" from "zero wealth".
 * Pure reads still return raw values.
 *
 * CROSS-DOMAIN
 * ------------
 *   - Enterprise ownership  → IndustryQueries (read-only here)
 *   - Rent income/expenses  → ResidenceSystem (read-only here)
 *   - Salary tracking       → stored on household.economy (local)
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. LOAD-TIME DEPENDENCY VERIFICATION
    // =========================================================================

    function _requireObject(name, obj) {
        if (typeof obj === 'undefined' || obj === null) {
            throw new Error('HouseholdEconomy: ' + name + ' is required');
        }
        return obj;
    }

    function _requireFunction(name, fn) {
        if (typeof fn !== 'function') {
            throw new Error('HouseholdEconomy: ' + name + ' is required');
        }
        return fn;
    }

    var _commands = _requireObject('HouseholdCommands', window.HouseholdCommands);
    _requireFunction('HouseholdCommands.updateHousehold', _commands.updateHousehold);
    _requireFunction('HouseholdCommands.recordEvent', _commands.recordEvent);
    _requireFunction('HouseholdCommands.setStatus', _commands.setStatus);
    _requireFunction('HouseholdCommands.persist', _commands.persist);

    var _queries = _requireObject('HouseholdQueries', window.HouseholdQueries);
    _requireFunction('HouseholdQueries.getHousehold', _queries.getHousehold);
    _requireFunction('HouseholdQueries.getHouseholdEnterpriseSummaries',
        _queries.getHouseholdEnterpriseSummaries);

    var _getCurrentYearSafe = _requireFunction('getCurrentYearSafe',
        window.getCurrentYearSafe);
    var _getCharacterById = _requireFunction('getCharacterById',
        window.getCharacterById);

    // Optional deps — recorded at load, checked at call time
    var _residenceSystemPresent = typeof window.ResidenceSystem !== 'undefined' &&
        window.ResidenceSystem !== null;
    var _industryQueriesPresent = typeof window.IndustryQueries !== 'undefined' &&
        window.IndustryQueries !== null;

    // =========================================================================
    // 2. RESULT HELPERS
    // =========================================================================

    function _ok(data) {
        return { success: true, data: data === undefined ? null : data };
    }
    function _fail(code, reason) {
        return { success: false, code: code, reason: reason || code };
    }

    // =========================================================================
    // 3. CONSTANTS (to be extracted to household-constants.js)
    // =========================================================================

    var ECONOMIC_TIERS = {
        DESTITUTE:  { id: 'destitute',  minWealth: 0,    maxWealth: 10,       label: 'Destitute' },
        POOR:       { id: 'poor',       minWealth: 11,   maxWealth: 30,       label: 'Poor' },
        MODERATE:   { id: 'moderate',   minWealth: 31,   maxWealth: 70,       label: 'Moderate' },
        PROSPEROUS: { id: 'prosperous', minWealth: 71,   maxWealth: 120,      label: 'Prosperous' },
        WEALTHY:    { id: 'wealthy',    minWealth: 121,  maxWealth: 200,      label: 'Wealthy' },
        NOBLE:      { id: 'noble',      minWealth: 201,  maxWealth: 500,      label: 'Noble' },
        VERY_NOBLE: { id: 'very_noble', minWealth: 501,  maxWealth: 1000,     label: 'High Noble' },
        ROYAL:      { id: 'royal',      minWealth: 1001, maxWealth: Infinity, label: 'Royal' }
    };

    var INCOME_SOURCES = {
        agriculture: { id: 'agriculture', name: 'Agriculture',     baseIncome: 10 },
        livestock:   { id: 'livestock',   name: 'Livestock',       baseIncome: 8 },
        trade:       { id: 'trade',       name: 'Trade',           baseIncome: 15 },
        crafts:      { id: 'crafts',      name: 'Crafts',          baseIncome: 12 },
        taxes:       { id: 'taxes',       name: 'Taxes',           baseIncome: 20 },
        rent:        { id: 'rent',        name: 'Rent',            baseIncome: 10 },
        tribute:     { id: 'tribute',     name: 'Tribute',         baseIncome: 25 },
        patronage:   { id: 'patronage',   name: 'Patronage',       baseIncome: 5 },
        military:    { id: 'military',    name: 'Military Service', baseIncome: 15 },
        mining:      { id: 'mining',      name: 'Mining',          baseIncome: 18 }
    };

    var EXPENSE_CATEGORIES = {
        food:        { id: 'food',        name: 'Food & Supplies',      baseExpense: 8 },
        maintenance: { id: 'maintenance', name: 'Property Maintenance', baseExpense: 6 },
        taxes:       { id: 'taxes',       name: 'Taxes Paid',           baseExpense: 10 },
        staff:       { id: 'staff',       name: 'Staff Wages',          baseExpense: 12 },
        luxury:      { id: 'luxury',      name: 'Luxury Goods',         baseExpense: 15 },
        debt:        { id: 'debt',        name: 'Debt Payments',        baseExpense: 10 },
        tithe:       { id: 'tithe',       name: 'Religious Tithe',      baseExpense: 5 },
        medical:     { id: 'medical',     name: 'Medical Expenses',     baseExpense: 8 }
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
    var MAX_EVENT_LOG = 200;

    // =========================================================================
    // 4. PURE CALCULATIONS
    // =========================================================================
    //
    // These never mutate. They never throw on missing household; they
    // return 0 / false / null / empty as appropriate. Callers that need
    // to distinguish "missing" from "zero" should check the household
    // via HouseholdQueries first.
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
        var h = _queries.getHousehold(householdId);
        return h && typeof h.wealth === 'number' ? h.wealth : 0;
    }

    function getHouseholdDebt(householdId) {
        var h = _queries.getHousehold(householdId);
        return h && typeof h.debt === 'number' ? h.debt : 0;
    }

    function getHouseholdResources(householdId) {
        var h = _queries.getHousehold(householdId);
        if (!h) return { food: 0, livestock: 0, goods: 0 };
        // Resources are not in the household projection; read the canonical
        // record directly (read-only).
        var state = window.HouseholdState;
        if (!state || !state._internal) return { food: 0, livestock: 0, goods: 0 };
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
        if (!_residenceSystemPresent) return 0;
        var rs = window.ResidenceSystem;
        if (typeof rs.getTotalRentIncome !== 'function') return 0;
        var v = rs.getTotalRentIncome(householdId, 'household');
        return typeof v === 'number' && isFinite(v) ? v : 0;
    }

    function calculateRentExpenses(householdId) {
        if (!_residenceSystemPresent) return 0;
        var rs = window.ResidenceSystem;
        if (typeof rs.getTotalRentExpenses !== 'function') return 0;
        var v = rs.getTotalRentExpenses(householdId, 'household');
        return typeof v === 'number' && isFinite(v) ? v : 0;
    }

    function calculateEnterpriseNet(householdId) {
        var summaries;
        try {
            summaries = _queries.getHouseholdEnterpriseSummaries(householdId);
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

        var state = window.HouseholdState;
        if (!state || !state._internal) return 0;
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
                    character = _getCharacterById(member.characterId);
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

        var ent = calculateEnterpriseNet(householdId);
        income += ent.income;
        income += calculateRentIncome(householdId);

        if (economy && Array.isArray(economy.schoolProfitHistory)) {
            var currentYear = _getCurrentYearSafe();
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
        if (!state || !state._internal) return 0;
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
            var currentYear = _getCurrentYearSafe();
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
        var h = _queries.getHousehold(householdId);
        if (!h) return false;
        return typeof h.wealth === 'number' && h.wealth < BANKRUPTCY_THRESHOLD;
    }

    // =========================================================================
    // 5. MUTATION CORE
    // =========================================================================
    //
    // _applyMutation is the ONLY place in this module that:
    //   - gets the live canonical record
    //   - runs a mutator against it
    //   - commits via HouseholdCommands (one commit)
    //   - persists via HouseholdCommands.persist (one save)
    //
    // Every economy mutation funnels through it. If the mutator returns
    // { abort: true, code, reason }, we skip commit and persist.
    // =========================================================================

    function _applyMutation(householdId, mutator, eventName, payload) {
        var state = window.HouseholdState;
        if (!state || !state._internal) {
            return _fail('STATE_UNAVAILABLE', 'HouseholdState is not available');
        }
        var record = state._internal.getHouseholdRecord(householdId);
        if (!record) return _fail('NOT_FOUND', 'Household not found');

        var result = mutator(record);
        if (result && result.abort) {
            return _fail(result.code || 'MUTATION_ABORTED',
                result.reason || 'Mutation aborted');
        }

        // Commit via commands. updateHousehold with empty updates is the
        // canonical no-op that still fires _commit and markDirty.
        // We pass a single event name so the domain event is what
        // subscribers actually see.
        var commitResult = _commands.updateHousehold(householdId, {});
        if (!commitResult || commitResult.success === false) {
            return _fail(
                (commitResult && commitResult.code) || 'COMMIT_FAILED',
                (commitResult && commitResult.reason) || 'Failed to commit mutation'
            );
        }

        // Publish the domain-specific event
        if (eventName && typeof state.publish === 'function') {
            state.publish(eventName, payload || {});
        }

        // Persist once
        var persistResult = _commands.persist();
        if (!persistResult || persistResult.success === false) {
            return _fail(
                (persistResult && persistResult.code) || 'PERSIST_FAILED',
                (persistResult && persistResult.reason) || 'Failed to persist'
            );
        }

        return _ok({ householdId: householdId });
    }

    // =========================================================================
    // 6. WEALTH / DEBT / RESOURCE MUTATIONS
    // =========================================================================

    function updateHouseholdWealth(householdId, delta, reason) {
        if (typeof delta !== 'number' || !isFinite(delta)) {
            return _fail('INVALID_DELTA', 'delta must be a finite number');
        }

        var state = window.HouseholdState;
        var h = _queries.getHousehold(householdId);
        if (!h) return _fail('NOT_FOUND', 'Household not found');
        var record = state && state._internal
            ? state._internal.getHouseholdRecord(householdId) : null;
        if (!record) return _fail('NOT_FOUND', 'Household record not found');

        var oldWealth = typeof record.wealth === 'number' ? record.wealth : 0;
        var newWealth = oldWealth + delta;

        var mutResult = _applyMutation(householdId, function(r) {
            if (!r.economy || typeof r.economy !== 'object') r.economy = {};
            if (!Array.isArray(r.economy.transactions)) r.economy.transactions = [];
            r.economy.transactions.push({
                year: _getCurrentYearSafe(),
                type: 'wealth_change',
                amount: delta,
                reason: reason || 'Wealth adjustment',
                oldWealth: oldWealth,
                newWealth: newWealth
            });
            if (r.economy.transactions.length > MAX_TRANSACTION_HISTORY) {
                r.economy.transactions =
                    r.economy.transactions.slice(-MAX_TRANSACTION_HISTORY);
            }
            r.wealth = newWealth;
        }, 'householdWealthChanged', {
            householdId: householdId,
            oldWealth: oldWealth,
            newWealth: newWealth,
            delta: delta,
            reason: reason || 'Wealth adjustment'
        });

        if (!mutResult.success) return mutResult;

        return _ok({
            householdId: householdId,
            oldWealth: oldWealth,
            newWealth: newWealth,
            delta: delta
        });
    }

    function modifyHouseholdDebt(householdId, delta) {
        if (typeof delta !== 'number' || !isFinite(delta)) {
            return _fail('INVALID_DELTA', 'delta must be a finite number');
        }

        var state = window.HouseholdState;
        var h = _queries.getHousehold(householdId);
        if (!h) return _fail('NOT_FOUND', 'Household not found');
        var record = state && state._internal
            ? state._internal.getHouseholdRecord(householdId) : null;
        if (!record) return _fail('NOT_FOUND', 'Household record not found');

        var oldDebt = typeof record.debt === 'number' ? record.debt : 0;
        var newDebt = Math.max(0, oldDebt + delta);

        var mutResult = _applyMutation(householdId, function(r) {
            if (!r.economy || typeof r.economy !== 'object') r.economy = {};
            if (!Array.isArray(r.economy.transactions)) r.economy.transactions = [];
            r.economy.transactions.push({
                year: _getCurrentYearSafe(),
                type: 'debt_change',
                amount: delta,
                oldDebt: oldDebt,
                newDebt: newDebt
            });
            if (r.economy.transactions.length > MAX_TRANSACTION_HISTORY) {
                r.economy.transactions =
                    r.economy.transactions.slice(-MAX_TRANSACTION_HISTORY);
            }
            r.debt = newDebt;
        }, 'householdDebtChanged', {
            householdId: householdId,
            oldDebt: oldDebt,
            newDebt: newDebt,
            delta: delta
        });

        if (!mutResult.success) return mutResult;

        return _ok({
            householdId: householdId,
            oldDebt: oldDebt,
            newDebt: newDebt,
            delta: delta
        });
    }

    function updateHouseholdResources(householdId, resourceType, delta) {
        var valid = ['food', 'livestock', 'goods'];
        if (valid.indexOf(resourceType) === -1) {
            return _fail('INVALID_RESOURCE_TYPE',
                'Resource type must be food, livestock, or goods');
        }
        if (typeof delta !== 'number' || !isFinite(delta)) {
            return _fail('INVALID_DELTA', 'delta must be a finite number');
        }

        var state = window.HouseholdState;
        var record = state && state._internal
            ? state._internal.getHouseholdRecord(householdId) : null;
        if (!record) return _fail('NOT_FOUND', 'Household not found');

        var oldValue = (record.resources &&
            typeof record.resources[resourceType] === 'number')
            ? record.resources[resourceType] : 0;
        var newValue = Math.max(0, oldValue + delta);

        var mutResult = _applyMutation(householdId, function(r) {
            if (!r.resources || typeof r.resources !== 'object') {
                r.resources = { food: 0, livestock: 0, goods: 0 };
            }
            if (!r.economy || typeof r.economy !== 'object') r.economy = {};
            if (!Array.isArray(r.economy.resourceHistory)) {
                r.economy.resourceHistory = [];
            }
            r.economy.resourceHistory.push({
                year: _getCurrentYearSafe(),
                resource: resourceType,
                delta: delta,
                oldValue: oldValue,
                newValue: newValue
            });
            if (r.economy.resourceHistory.length > MAX_RESOURCE_HISTORY) {
                r.economy.resourceHistory =
                    r.economy.resourceHistory.slice(-MAX_RESOURCE_HISTORY);
            }
            r.resources[resourceType] = newValue;
        }, 'householdResourcesChanged', {
            householdId: householdId,
            resourceType: resourceType,
            oldValue: oldValue,
            newValue: newValue,
            delta: delta
        });

        if (!mutResult.success) return mutResult;

        return _ok({
            householdId: householdId,
            resourceType: resourceType,
            oldValue: oldValue,
            newValue: newValue,
            delta: delta
        });
    }

    // =========================================================================
    // 7. SALARY / TUITION / SCHOOL PROFIT
    // =========================================================================

    function receiveSalary(householdId, characterId, roleId, salary, year) {
        if (typeof salary !== 'number' || !isFinite(salary)) {
            return _fail('INVALID_SALARY', 'salary must be a finite number');
        }

        var record = window.HouseholdState && window.HouseholdState._internal
            ? window.HouseholdState._internal.getHouseholdRecord(householdId)
            : null;
        if (!record) return _fail('NOT_FOUND', 'Household not found');

        var y = year === undefined || year === null ? _getCurrentYearSafe() : year;
        var oldWealth = typeof record.wealth === 'number' ? record.wealth : 0;
        var newWealth = oldWealth + salary;

        var mutResult = _applyMutation(householdId, function(r) {
            if (!r.economy || typeof r.economy !== 'object') r.economy = {};
            var economy = r.economy;

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

            if (!Array.isArray(economy.transactions)) economy.transactions = [];
            economy.transactions.push({
                year: y,
                type: 'salary_received',
                amount: salary,
                roleId: roleId || null,
                characterId: characterId,
                oldWealth: oldWealth,
                newWealth: newWealth
            });
            if (economy.transactions.length > MAX_TRANSACTION_HISTORY) {
                economy.transactions =
                    economy.transactions.slice(-MAX_TRANSACTION_HISTORY);
            }

            r.wealth = newWealth;
        }, 'householdSalaryReceived', {
            householdId: householdId,
            characterId: characterId,
            roleId: roleId || null,
            amount: salary,
            year: y
        });

        if (!mutResult.success) return mutResult;

        return _ok({
            householdId: householdId,
            characterId: characterId,
            amount: salary,
            year: y
        });
    }

    function getSalaryIncome(householdId, year) {
        var y = year === undefined || year === null ? _getCurrentYearSafe() : year;
        var state = window.HouseholdState;
        if (!state || !state._internal) return 0;
        var record = state._internal.getHouseholdRecord(householdId);
        if (!record || !record.economy ||
            !Array.isArray(record.economy.salaryIncomeHistory)) {
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
        if (!state || !state._internal) return 0;
        var record = state._internal.getHouseholdRecord(householdId);
        if (!record || !record.economy) return 0;
        return typeof record.economy.salaryIncome === 'number'
            ? record.economy.salaryIncome : 0;
    }

    function trackTuitionExpense(householdId, tuition, institutionId, studentId, year) {
        if (typeof tuition !== 'number' || !isFinite(tuition)) {
            return _fail('INVALID_TUITION', 'tuition must be a finite number');
        }

        var record = window.HouseholdState && window.HouseholdState._internal
            ? window.HouseholdState._internal.getHouseholdRecord(householdId)
            : null;
        if (!record) return _fail('NOT_FOUND', 'Household not found');

        var y = year === undefined || year === null ? _getCurrentYearSafe() : year;
        var oldWealth = typeof record.wealth === 'number' ? record.wealth : 0;
        var newWealth = oldWealth - tuition;

        var mutResult = _applyMutation(householdId, function(r) {
            if (!r.economy || typeof r.economy !== 'object') r.economy = {};
            var economy = r.economy;

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
                oldWealth: oldWealth,
                newWealth: newWealth
            });
            if (economy.transactions.length > MAX_TRANSACTION_HISTORY) {
                economy.transactions =
                    economy.transactions.slice(-MAX_TRANSACTION_HISTORY);
            }

            r.wealth = newWealth;
        }, 'householdTuitionPaid', {
            householdId: householdId,
            institutionId: institutionId || null,
            studentId: studentId || null,
            amount: tuition,
            year: y
        });

        if (!mutResult.success) return mutResult;

        return _ok({
            householdId: householdId,
            amount: tuition,
            year: y
        });
    }

    function getTuitionExpenses(householdId, year) {
        var y = year === undefined || year === null ? _getCurrentYearSafe() : year;
        var state = window.HouseholdState;
        if (!state || !state._internal) return 0;
        var record = state._internal.getHouseholdRecord(householdId);
        if (!record || !record.economy ||
            !Array.isArray(record.economy.tuitionExpensesHistory)) {
            return 0;
        }
        var total = 0;
        var hist = record.economy.tuitionExpensesHistory;
        for (var i = 0; i < hist.length; i++) {
            if (hist[i].year === y) total += hist[i].amount || 0;
        }
        return total;
    }

    function receiveSchoolProfit(householdId, amount, institutionId, year) {
        if (typeof amount !== 'number' || !isFinite(amount)) {
            return _fail('INVALID_AMOUNT', 'amount must be a finite number');
        }

        var record = window.HouseholdState && window.HouseholdState._internal
            ? window.HouseholdState._internal.getHouseholdRecord(householdId)
            : null;
        if (!record) return _fail('NOT_FOUND', 'Household not found');

        var y = year === undefined || year === null ? _getCurrentYearSafe() : year;
        var oldWealth = typeof record.wealth === 'number' ? record.wealth : 0;
        var newWealth = oldWealth + amount;

        var mutResult = _applyMutation(householdId, function(r) {
            if (!r.economy || typeof r.economy !== 'object') r.economy = {};
            var economy = r.economy;

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

            if (!Array.isArray(economy.transactions)) economy.transactions = [];
            economy.transactions.push({
                year: y,
                type: 'school_profit',
                amount: amount,
                institutionId: institutionId || null,
                oldWealth: oldWealth,
                newWealth: newWealth
            });
            if (economy.transactions.length > MAX_TRANSACTION_HISTORY) {
                economy.transactions =
                    economy.transactions.slice(-MAX_TRANSACTION_HISTORY);
            }

            r.wealth = newWealth;
        }, 'householdSchoolProfitReceived', {
            householdId: householdId,
            institutionId: institutionId || null,
            amount: amount,
            year: y
        });

        if (!mutResult.success) return mutResult;

        return _ok({
            householdId: householdId,
            amount: amount,
            year: y
        });
    }

    function getSchoolProfits(householdId, year) {
        var y = year === undefined || year === null ? _getCurrentYearSafe() : year;
        var state = window.HouseholdState;
        if (!state || !state._internal) return 0;
        var record = state._internal.getHouseholdRecord(householdId);
        if (!record || !record.economy ||
            !Array.isArray(record.economy.schoolProfitHistory)) {
            return 0;
        }
        var total = 0;
        var hist = record.economy.schoolProfitHistory;
        for (var i = 0; i < hist.length; i++) {
            if (hist[i].year === y) total += hist[i].amount || 0;
        }
        return total;
    }

    // =========================================================================
    // 8. TRADE
    // =========================================================================
    //
    // Trade touches two households. Per the converged pattern, each
    // household is its own logical operation → one commit → one persist.
    // If the target commit fails after the source succeeds, we roll back
    // the source through the same mutation primitive, so the rollback is
    // structurally identical to a normal mutation.
    // =========================================================================

    function executeTrade(sourceId, targetId, trade) {
        if (!trade || typeof trade !== 'object') {
            return _fail('INVALID_TRADE', 'Trade data required');
        }

        var source = _queries.getHousehold(sourceId);
        var target = _queries.getHousehold(targetId);
        if (!source) return _fail('SOURCE_NOT_FOUND', 'Source household not found');
        if (!target) return _fail('TARGET_NOT_FOUND', 'Target household not found');

        var sourceGives = trade.sourceGives || {};
        var targetGives = trade.targetGives || {};

        var sourceResources = getHouseholdResources(sourceId);
        var targetResources = getHouseholdResources(targetId);
        var sourceWealth = typeof source.wealth === 'number' ? source.wealth : 0;
        var targetWealth = typeof target.wealth === 'number' ? target.wealth : 0;

        // Validate source can afford
        if ((sourceGives.wealth || 0) > sourceWealth) {
            return _fail('INSUFFICIENT_WEALTH',
                'Source cannot afford wealth portion');
        }
        if ((sourceGives.food || 0) > sourceResources.food) {
            return _fail('INSUFFICIENT_FOOD', 'Source lacks food');
        }
        if ((sourceGives.livestock || 0) > sourceResources.livestock) {
            return _fail('INSUFFICIENT_LIVESTOCK', 'Source lacks livestock');
        }
        if ((sourceGives.goods || 0) > sourceResources.goods) {
            return _fail('INSUFFICIENT_GOODS', 'Source lacks goods');
        }

        // Validate target can afford
        if ((targetGives.wealth || 0) > targetWealth) {
            return _fail('INSUFFICIENT_WEALTH',
                'Target cannot afford wealth portion');
        }
        if ((targetGives.food || 0) > targetResources.food) {
            return _fail('INSUFFICIENT_FOOD', 'Target lacks food');
        }
        if ((targetGives.livestock || 0) > targetResources.livestock) {
            return _fail('INSUFFICIENT_LIVESTOCK', 'Target lacks livestock');
        }
        if ((targetGives.goods || 0) > targetResources.goods) {
            return _fail('INSUFFICIENT_GOODS', 'Target lacks goods');
        }

        var year = _getCurrentYearSafe();

        // Snapshot source for rollback
        var sourceSnapshot = {
            wealth: sourceWealth,
            resources: {
                food: sourceResources.food,
                livestock: sourceResources.livestock,
                goods: sourceResources.goods
            }
        };

        // Apply source
        var sourceApply = _applyTradeSide(
            sourceId,
            sourceWealth - (sourceGives.wealth || 0) + (targetGives.wealth || 0),
            {
                food: sourceResources.food - (sourceGives.food || 0) + (targetGives.food || 0),
                livestock: sourceResources.livestock - (sourceGives.livestock || 0) +
                    (targetGives.livestock || 0),
                goods: sourceResources.goods - (sourceGives.goods || 0) + (targetGives.goods || 0)
            },
            {
                year: year,
                partnerId: targetId,
                type: 'export',
                gave: JSON.parse(JSON.stringify(sourceGives)),
                received: JSON.parse(JSON.stringify(targetGives))
            },
            'householdTradeSource'
        );
        if (!sourceApply.success) {
            return _fail('SOURCE_UPDATE_FAILED',
                sourceApply.reason || 'Failed to update source');
        }

        // Apply target
        var targetApply = _applyTradeSide(
            targetId,
            targetWealth - (targetGives.wealth || 0) + (sourceGives.wealth || 0),
            {
                food: targetResources.food - (targetGives.food || 0) + (sourceGives.food || 0),
                livestock: targetResources.livestock - (targetGives.livestock || 0) +
                    (sourceGives.livestock || 0),
                goods: targetResources.goods - (targetGives.goods || 0) + (sourceGives.goods || 0)
            },
            {
                year: year,
                partnerId: sourceId,
                type: 'import',
                gave: JSON.parse(JSON.stringify(targetGives)),
                received: JSON.parse(JSON.stringify(sourceGives))
            },
            'householdTradeTarget'
        );
        if (!targetApply.success) {
            // Best-effort rollback of source
            try {
                _applyTradeSide(
                    sourceId,
                    sourceSnapshot.wealth,
                    sourceSnapshot.resources,
                    {
                        year: year,
                        partnerId: targetId,
                        type: 'rollback',
                        gave: {},
                        received: {}
                    },
                    'householdTradeRollback'
                );
            } catch (rollbackErr) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error(
                        'HouseholdEconomy.executeTrade: rollback failed',
                        rollbackErr
                    );
                }
            }
            return _fail('TARGET_UPDATE_FAILED',
                targetApply.reason || 'Failed to update target');
        }

        return _ok({
            sourceId: sourceId,
            targetId: targetId,
            year: year
        });
    }

    /**
     * Applies one side of a trade. Records the trade entry in economy.trades,
     * updates wealth and resources. Commits and persists once.
     */
    function _applyTradeSide(householdId, newWealth, newResources, tradeEntry, eventName) {
        return _applyMutation(householdId, function(r) {
            r.wealth = newWealth;
            r.resources = newResources;

            if (!r.economy || typeof r.economy !== 'object') r.economy = {};
            if (!Array.isArray(r.economy.trades)) r.economy.trades = [];
            r.economy.trades.push(tradeEntry);
            if (r.economy.trades.length > MAX_TRANSACTION_HISTORY) {
                r.economy.trades = r.economy.trades.slice(-MAX_TRANSACTION_HISTORY);
            }
        }, eventName, {
            householdId: householdId,
            partnerId: tradeEntry.partnerId,
            type: tradeEntry.type
        });
    }

    function getTradePartners(householdId) {
        var state = window.HouseholdState;
        if (!state || !state._internal) return [];
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
                var partner = _queries.getHousehold(pid);
                if (partner) result.push(partner);
            }
        }
        return result;
    }

    // =========================================================================
    // 9. ECONOMIC EVENTS
    // =========================================================================

    function triggerEconomicEvent(householdId, eventTypeId) {
        var event = ECONOMIC_EVENTS[eventTypeId];
        if (!event) return _fail('INVALID_EVENT', 'Unknown economic event');

        var delta = typeof event.delta === 'function'
            ? event.delta()
            : (event.delta || 0);
        if (delta === 0) {
            return _ok({ householdId: householdId, delta: 0, noChange: true });
        }

        var wealthResult = updateHouseholdWealth(householdId, delta, event.name);
        if (!wealthResult.success) return wealthResult;

        // Separate logical operation: record the event. This is a second
        // commit + persist. Acceptable: an event is a discrete domain
        // action, not a batch.
        _commands.recordEvent(householdId, {
            year: _getCurrentYearSafe(),
            type: 'economic_event',
            message: event.name,
            details: event.description,
            amount: delta
        });
        var persistResult = _commands.persist();
        if (!persistResult.success) {
            return _fail('PERSIST_FAILED',
                persistResult.reason || 'Failed to persist event');
        }

        return _ok({
            householdId: householdId,
            event: event,
            delta: delta,
            newWealth: wealthResult.data.newWealth
        });
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
        if (roll > totalChance) {
            return _ok({ householdId: householdId, triggered: false });
        }

        var cumulative = 0;
        for (var j = 0; j < weighted.length; j++) {
            cumulative += weighted[j].chance;
            if (roll <= cumulative) {
                return triggerEconomicEvent(householdId, weighted[j].id);
            }
        }
        return _ok({ householdId: householdId, triggered: false });
    }

    // =========================================================================
    // 10. ANNUAL PROCESSING
    // =========================================================================
    //
    // Single mutation: wealth += netChange, append events, update status
    // if bankrupt. One commit, one persist.
    // =========================================================================

    function processAnnualEconomy(householdId) {
        var h = _queries.getHousehold(householdId);
        if (!h) return _fail('NOT_FOUND', 'Household not found');

        var year = _getCurrentYearSafe();
        var oldWealth = typeof h.wealth === 'number' ? h.wealth : 0;
        var income = calculateAnnualIncome(householdId);
        var expenses = calculateAnnualExpenses(householdId);
        var netChange = income - expenses;
        var newWealth = oldWealth + netChange;
        var nowBankrupt = newWealth < BANKRUPTCY_THRESHOLD;

        var rentIncome = calculateRentIncome(householdId);
        var rentExpense = calculateRentExpenses(householdId);
        var enterpriseSummaries = [];
        try {
            enterpriseSummaries = _queries.getHouseholdEnterpriseSummaries(householdId);
        } catch (e) {
            enterpriseSummaries = [];
        }

        // Single mutation + commit + persist
        var mutResult = _applyMutation(householdId, function(r) {
            r.wealth = newWealth;

            if (!r.economy || typeof r.economy !== 'object') r.economy = {};
            if (!Array.isArray(r.economy.transactions)) r.economy.transactions = [];

            r.economy.transactions.push({
                year: year,
                type: 'annual_economy',
                amount: netChange,
                income: income,
                expenses: expenses,
                oldWealth: oldWealth,
                newWealth: newWealth
            });
            if (r.economy.transactions.length > MAX_TRANSACTION_HISTORY) {
                r.economy.transactions =
                    r.economy.transactions.slice(-MAX_TRANSACTION_HISTORY);
            }

            // Append economic events for this year
            if (!Array.isArray(r.eventLog)) r.eventLog = [];

            for (var i = 0; i < enterpriseSummaries.length; i++) {
                var s = enterpriseSummaries[i];
                if (typeof s.annualProfit !== 'number' || s.annualProfit === 0) {
                    continue;
                }
                r.eventLog.push({
                    year: year,
                    type: s.annualProfit > 0 ? 'enterprise_profit' : 'enterprise_loss',
                    amount: Math.abs(s.annualProfit),
                    details: s.name,
                    timestamp: Date.now()
                });
            }

            if (rentIncome > 0) {
                r.eventLog.push({
                    year: year,
                    type: 'rent_income',
                    amount: rentIncome,
                    message: 'Rent income from properties owned',
                    timestamp: Date.now()
                });
            }
            if (rentExpense > 0) {
                r.eventLog.push({
                    year: year,
                    type: 'rent_expense',
                    amount: rentExpense,
                    message: 'Rent expenses for properties rented',
                    timestamp: Date.now()
                });
            }

            if (r.eventLog.length > MAX_EVENT_LOG) {
                r.eventLog = r.eventLog.slice(-MAX_EVENT_LOG);
            }

            // Status transition
            if (nowBankrupt && r.status !== 'bankrupt') {
                r.status = 'bankrupt';
            } else if (!nowBankrupt && r.status === 'bankrupt' && newWealth > 10) {
                r.status = 'active';
            }
        }, 'householdAnnualEconomyProcessed', {
            householdId: householdId,
            year: year,
            oldWealth: oldWealth,
            newWealth: newWealth,
            income: income,
            expenses: expenses,
            netChange: netChange,
            bankrupt: nowBankrupt
        });

        if (!mutResult.success) return mutResult;

        return _ok({
            householdId: householdId,
            householdName: h.name || 'Unnamed',
            year: year,
            oldWealth: oldWealth,
            newWealth: newWealth,
            income: income,
            expenses: expenses,
            netChange: netChange,
            rentIncome: rentIncome,
            rentExpenses: rentExpense,
            bankrupt: nowBankrupt
        });
    }

    /**
     * Consumes annual food based on member count.
     *
     * Single mutation: subtract food, fall back to livestock, fall back to
     * emergency wealth purchase. One commit, one persist.
     */
    function consumeAnnualFood(householdId) {
        var record = window.HouseholdState && window.HouseholdState._internal
            ? window.HouseholdState._internal.getHouseholdRecord(householdId)
            : null;
        if (!record) return _fail('NOT_FOUND', 'Household not found');

        var memberCount = Array.isArray(record.members) ? record.members.length : 0;
        var foodNeeded = memberCount * 2;

        var resources = getHouseholdResources(householdId);
        var availableFood = resources.food;
        var availableLivestock = resources.livestock;
        var oldWealth = typeof record.wealth === 'number' ? record.wealth : 0;

        var foodUsed = 0;
        var livestockUsed = 0;
        var emergencyCost = 0;
        var deficit = 0;

        if (availableFood >= foodNeeded) {
            foodUsed = foodNeeded;
        } else {
            foodUsed = availableFood;
            deficit = foodNeeded - availableFood;

            if (availableLivestock > 0) {
                var livestockNeeded = Math.ceil(deficit / 3);
                livestockUsed = Math.min(availableLivestock, livestockNeeded);
                deficit -= livestockUsed * 3;
            }

            if (deficit > 0) {
                emergencyCost = deficit * 0.5;
            }
        }

        var newFood = Math.max(0, availableFood - foodUsed);
        var newLivestock = Math.max(0, availableLivestock - livestockUsed);
        var newWealth = oldWealth - emergencyCost;

        var mutResult = _applyMutation(householdId, function(r) {
            if (!r.resources || typeof r.resources !== 'object') {
                r.resources = { food: 0, livestock: 0, goods: 0 };
            }
            r.resources.food = newFood;
            r.resources.livestock = newLivestock;
            r.wealth = newWealth;

            if (!r.economy || typeof r.economy !== 'object') r.economy = {};
            if (!Array.isArray(r.economy.transactions)) r.economy.transactions = [];

            r.economy.transactions.push({
                year: _getCurrentYearSafe(),
                type: 'food_consumption',
                foodUsed: foodUsed,
                livestockUsed: livestockUsed,
                emergencyCost: emergencyCost,
                oldWealth: oldWealth,
                newWealth: newWealth
            });
            if (r.economy.transactions.length > MAX_TRANSACTION_HISTORY) {
                r.economy.transactions =
                    r.economy.transactions.slice(-MAX_TRANSACTION_HISTORY);
            }
        }, 'householdFoodConsumed', {
            householdId: householdId,
            foodUsed: foodUsed,
            livestockUsed: livestockUsed,
            emergencyCost: emergencyCost,
            deficit: deficit > 0
        });

        if (!mutResult.success) return mutResult;

        return _ok({
            householdId: householdId,
            foodUsed: foodUsed,
            livestockUsed: livestockUsed,
            emergencyCost: emergencyCost,
            insufficient: deficit > 0,
            newFood: newFood,
            newLivestock: newLivestock,
            newWealth: newWealth
        });
    }

    // =========================================================================
    // 11. BANKRUPTCY
    // =========================================================================

    function handleBankruptcy(householdId) {
        if (!isBankrupt(householdId)) {
            return _fail('NOT_BANKRUPT', 'Household is not bankrupt');
        }

        var record = window.HouseholdState && window.HouseholdState._internal
            ? window.HouseholdState._internal.getHouseholdRecord(householdId)
            : null;
        if (!record) return _fail('NOT_FOUND', 'Household not found');

        var oldWealth = typeof record.wealth === 'number' ? record.wealth : 0;
        var oldDebt = typeof record.debt === 'number' ? record.debt : 0;
        var year = _getCurrentYearSafe();

        // Single mutation: reset wealth + debt, set status, record event
        var mutResult = _applyMutation(householdId, function(r) {
            r.wealth = 0;
            r.debt = 0;
            r.status = 'bankrupt';

            if (!r.eventLog) r.eventLog = [];
            r.eventLog.push({
                year: year,
                type: 'status_changed',
                from: record.status || 'active',
                to: 'bankrupt',
                reason: 'Bankruptcy processed - debt forgiven',
                timestamp: Date.now()
            });
            if (r.eventLog.length > MAX_EVENT_LOG) {
                r.eventLog = r.eventLog.slice(-MAX_EVENT_LOG);
            }
        }, 'householdBankruptcyProcessed', {
            householdId: householdId,
            year: year,
            oldWealth: oldWealth,
            oldDebt: oldDebt
        });

        if (!mutResult.success) return mutResult;

        return _ok({
            householdId: householdId,
            year: year,
            oldWealth: oldWealth,
            oldDebt: oldDebt,
            newWealth: 0,
            newDebt: 0
        });
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
