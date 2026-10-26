/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD ECONOMY (household-economy.js)
 * =============================================================================
 *
 * LOCATION: js/households/household-economy.js
 *
 * PURPOSE
 * -------
 * Household economic domain: pure calculation, canonical mutation of
 * household wealth / debt / resources / income / expense history, and
 * annual economy processing.
 *
 * CONVERGED PATTERN
 * -----------------
 *   - Pure calculations never mutate. Never throw on missing household;
 *     return 0 / false / null / empty as appropriate.
 *   - Mutations route through HouseholdCommands.updateHousehold with a
 *     real patch object, then HouseholdCommands.persist() exactly ONCE
 *     per logical operation.
 *   - One logical operation → one mutation primitive → one commit →
 *     one persist.
 *   - No direct calls to HouseholdState._internal.replaceHouseholds.
 *   - Structured results everywhere:
 *       { success: true,  data: ... }
 *       { success: false, code: 'SOME_CODE', reason: 'human message' }
 *
 * CONSTANTS AND RULES
 * -------------------
 * Every economic catalog (ECONOMIC_TIERS, INCOME_SOURCES,
 * EXPENSE_CATEGORIES, ECONOMIC_EVENTS), every threshold
 * (BANKRUPTCY, DEBT_INTEREST_RATE, history caps), and every
 * residence-cost multiplier lives in household-constants.js.
 *
 * Every pure economic calculation (getEconomicTier, netAnnualChange,
 * calculateAnnualDebtInterest, evaluateBankruptcy,
 * calculateEnterpriseNet) lives in household-rules.js. This module
 * delegates to those functions; it does not reimplement them.
 *
 * This module previously carried its own copies of the constants and
 * rules. That produced two divergent catalogs and made it impossible to
 * change a threshold without editing three files. The local copies are
 * gone.
 *
 * RANDOMNESS
 * ----------
 * The economic-event system no longer rolls internally. The catalog
 * describes bounds (minDelta, maxDelta) and a probability weight
 * (chance). The delta is computed by
 * HouseholdConstants.getEconomicEventDelta(eventId, randomFn), which
 * takes a caller-supplied random function.
 *
 * applyRandomEconomicEvent therefore accepts an options.random (or uses
 * window.random from randomness.js). No function in this module calls
 * Math.random. A missing random source throws — silent fallback to
 * Math.random would break seeded simulation reproducibility.
 *
 * CLOCK CONTRACT
 * --------------
 * Annual economy is processed AGAINST AN EXPLICIT YEAR. Every function
 * that needs "now" accepts options.year (or the `year` parameter
 * directly). When the caller omits it, the function falls back to
 * getCurrentYearSafe(). This is required so a multi-year simulation
 * driver can call:
 *
 *     for (var y = startYear + 1; y <= finalYear; y++) {
 *         HouseholdEconomy.processAnnualEconomy(householdId, { year: y });
 *     }
 *
 * ...without every year's accounting collapsing onto the wall-clock
 * year. The prior version read getCurrentYearSafe() inside every
 * calculation, which made a 5-year advance produce 5 identical
 * ledger entries tagged with the same year.
 *
 * CROSS-DOMAIN
 * ------------
 *   - Enterprise ownership  → IndustryQueries (read-only here)
 *   - Rent income/expenses  → ResidenceSystem (read-only here)
 *   - Salary / tuition      → stored on household.economy (local history)
 *
 * DEPENDENCIES (REQUIRED, verified at load):
 *   - household-constants.js
 *   - household-rules.js
 *   - household-commands.js  (updateHousehold, recordEvent, setStatus, persist)
 *   - household-queries.js   (getHousehold, getHouseholdEnterpriseSummaries)
 *   - time.js                (getCurrentYearSafe)
 *   - randomness.js          (random)
 *   - accessors.js           (getCharacterById)
 *
 * DEPENDENCIES (OPTIONAL, checked at call time):
 *   - residence-system.js    (calculateRentIncome/Expenses)
 *   - industry-queries.js    (getHouseholdEnterpriseSummaries)
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. HARD DEPENDENCY CHECKS
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

    // Constants + rules — required
    var C = _requireObject('HouseholdConstants', window.HouseholdConstants);
    if (!C.THRESHOLDS || typeof C.THRESHOLDS.BANKRUPTCY !== 'number') {
        throw new Error(
            'HouseholdEconomy: HouseholdConstants.THRESHOLDS is missing or too old.'
        );
    }
    if (typeof C.getEconomicEventDelta !== 'function') {
        throw new Error(
            'HouseholdEconomy: HouseholdConstants.getEconomicEventDelta is required.'
        );
    }

    var R = _requireObject('HouseholdRules', window.HouseholdRules);
    _requireFunction('HouseholdRules.getEconomicTier', R.getEconomicTier);
    _requireFunction('HouseholdRules.netAnnualChange', R.netAnnualChange);
    _requireFunction('HouseholdRules.calculateAnnualDebtInterest',
        R.calculateAnnualDebtInterest);
    _requireFunction('HouseholdRules.evaluateBankruptcy', R.evaluateBankruptcy);
    _requireFunction('HouseholdRules.calculateEnterpriseNet',
        R.calculateEnterpriseNet);

    // Commands + queries — required
    var _commands = _requireObject('HouseholdCommands', window.HouseholdCommands);
    _requireFunction('HouseholdCommands.updateHousehold', _commands.updateHousehold);
    _requireFunction('HouseholdCommands.recordEvent', _commands.recordEvent);
    _requireFunction('HouseholdCommands.setStatus', _commands.setStatus);
    _requireFunction('HouseholdCommands.persist', _commands.persist);

    var _queries = _requireObject('HouseholdQueries', window.HouseholdQueries);
    _requireFunction('HouseholdQueries.getHousehold', _queries.getHousehold);
    _requireFunction('HouseholdQueries.getHouseholdEnterpriseSummaries',
        _queries.getHouseholdEnterpriseSummaries);

    // Time + randomness + accessors — required
    var _getCurrentYearSafe = _requireFunction('getCurrentYearSafe',
        window.getCurrentYearSafe);
    var _getCharacterById = _requireFunction('getCharacterById',
        window.getCharacterById);

    if (typeof window.random !== 'function') {
        throw new Error(
            'HouseholdEconomy: randomness.js must load first (random missing).'
        );
    }
    var _random = window.random;

    // Optional deps — checked at call time
    function _residenceSystem() {
        return (typeof window.ResidenceSystem !== 'undefined'
                && window.ResidenceSystem !== null)
            ? window.ResidenceSystem
            : null;
    }

    // =========================================================================
    // 1. RESULT HELPERS
    // =========================================================================

    function _ok(data) {
        return { success: true, data: data === undefined ? null : data };
    }
    function _fail(code, reason, extra) {
        var result = { success: false, code: code, reason: reason || code };
        if (extra) {
            for (var k in extra) {
                if (Object.prototype.hasOwnProperty.call(extra, k)) {
                    result[k] = extra[k];
                }
            }
        }
        return result;
    }

    // =========================================================================
    // 2. YEAR / NUMBER HELPERS
    // =========================================================================

    function _effectiveYear(options) {
        options = options || {};
        if (options.year !== undefined && options.year !== null) {
            if (typeof options.year === 'number' && isFinite(options.year)) {
                return options.year;
            }
            // Invalid explicit year is a caller bug; return null so
            // callers abort rather than silently substituting current year.
            return null;
        }
        return _getCurrentYearSafe();
    }

    function _isFiniteNumber(v) {
        return typeof v === 'number' && isFinite(v);
    }

    function _readArrayHistory(arr, limit) {
        if (!Array.isArray(arr)) return [];
        if (typeof limit !== 'number' || !isFinite(limit) || limit <= 0) {
            return arr.slice();
        }
        if (arr.length <= limit) return arr.slice();
        return arr.slice(-limit);
    }

    // =========================================================================
    // 3. PURE CALCULATIONS
    // =========================================================================
    //
    // These never mutate. Missing household / missing data returns 0
    // (or an empty object). Invalid arguments return 0.
    //
    // Every function accepts options.year where the calculation depends
    // on "now"; the fallback is getCurrentYearSafe().

    /**
     * Returns the economic tier object for a wealth value.
     * Delegates to HouseholdRules.getEconomicTier.
     */
    function getEconomicTier(wealth) {
        return R.getEconomicTier(wealth);
    }

    function getHouseholdWealth(householdId) {
        var h = _queries.getHousehold(householdId);
        return h && _isFiniteNumber(h.wealth) ? h.wealth : 0;
    }

    function getHouseholdDebt(householdId) {
        var h = _queries.getHousehold(householdId);
        return h && _isFiniteNumber(h.debt) ? h.debt : 0;
    }

    function getHouseholdResources(householdId) {
        var h = _queries.getHousehold(householdId);
        if (!h) return { food: 0, livestock: 0, goods: 0 };

        // Resources are not on the flat projection; read the canonical
        // record read-only via HouseholdState._internal.
        var state = window.HouseholdState;
        if (!state || !state._internal
            || typeof state._internal.getHouseholdRecord !== 'function') {
            return { food: 0, livestock: 0, goods: 0 };
        }
        var record = state._internal.getHouseholdRecord(householdId);
        if (!record) return { food: 0, livestock: 0, goods: 0 };
        var r = record.resources || {};
        return {
            food: _isFiniteNumber(r.food) ? r.food : 0,
            livestock: _isFiniteNumber(r.livestock) ? r.livestock : 0,
            goods: _isFiniteNumber(r.goods) ? r.goods : 0
        };
    }

    function calculateRentIncome(householdId) {
        var rs = _residenceSystem();
        if (!rs || typeof rs.getTotalRentIncome !== 'function') return 0;
        var v = rs.getTotalRentIncome(householdId, 'household');
        return _isFiniteNumber(v) ? v : 0;
    }

    function calculateRentExpenses(householdId) {
        var rs = _residenceSystem();
        if (!rs || typeof rs.getTotalRentExpenses !== 'function') return 0;
        var v = rs.getTotalRentExpenses(householdId, 'household');
        return _isFiniteNumber(v) ? v : 0;
    }

    /**
     * Enterprise net income/expense. Delegates to HouseholdRules.
     * Returns {income, expense}. Missing IndustryQueries → 0/0.
     */
    function calculateEnterpriseNet(householdId) {
        var summaries = [];
        try {
            summaries = _queries.getHouseholdEnterpriseSummaries(householdId);
        } catch (e) {
            // Household has enterprises but Industry is not loaded.
            // Return 0/0 rather than throwing — annual processing should
            // still work for a household whose enterprises cannot be
            // summarised right now.
            return { income: 0, expense: 0 };
        }
        return R.calculateEnterpriseNet(summaries);
    }

    /**
     * Total annual income.
     *
     * Includes: explicit income sources, member salaries (from
     * professions), private enterprise profit, rent income, and
     * school-profit entries for the effective year.
     *
     * @param {string} householdId
     * @param {Object} [options] - {year}
     * @returns {number}
     */
    function calculateAnnualIncome(householdId, options) {
        var year = _effectiveYear(options);
        if (year === null) return 0;

        var state = window.HouseholdState;
        if (!state || !state._internal
            || typeof state._internal.getHouseholdRecord !== 'function') {
            return 0;
        }
        var record = state._internal.getHouseholdRecord(householdId);
        if (!record) return 0;

        var income = 0;
        var economy = record.economy || {};

        // Explicit income sources (year-agnostic; they represent standing
        // streams of revenue, not per-year entries).
        if (Array.isArray(economy.incomeSources)) {
            for (var i = 0; i < economy.incomeSources.length; i++) {
                income += economy.incomeSources[i].amount || 0;
            }
        }

        // Member professions (year-agnostic — profession salary is a
        // standing rate, not a per-year figure).
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
                    if (_isFiniteNumber(p.baseSalary)) income += p.baseSalary;
                    if (_isFiniteNumber(p.customSalary)) income += p.customSalary;
                }
            }
        }

        // Enterprise profit (year-agnostic — annualProfit is the standing
        // annual figure per enterprise).
        var ent = calculateEnterpriseNet(householdId);
        income += ent.income;

        // Rent income (year-agnostic — current contract rent).
        income += calculateRentIncome(householdId);

        // School profit for the effective year only.
        if (Array.isArray(economy.schoolProfitHistory)) {
            for (var m = 0; m < economy.schoolProfitHistory.length; m++) {
                if (economy.schoolProfitHistory[m].year === year) {
                    income += economy.schoolProfitHistory[m].amount || 0;
                }
            }
        }

        return income;
    }

    /**
     * Total annual expenses.
     *
     * Includes: explicit expense entries, staff wages, private
     * enterprise loss, rent expenses, tuition for the effective year,
     * and debt interest.
     *
     * @param {string} householdId
     * @param {Object} [options] - {year}
     * @returns {number}
     */
    function calculateAnnualExpenses(householdId, options) {
        var year = _effectiveYear(options);
        if (year === null) return 0;

        var state = window.HouseholdState;
        if (!state || !state._internal
            || typeof state._internal.getHouseholdRecord !== 'function') {
            return 0;
        }
        var record = state._internal.getHouseholdRecord(householdId);
        if (!record) return 0;

        var expenses = 0;
        var economy = record.economy || {};

        if (Array.isArray(economy.expenses)) {
            for (var i = 0; i < economy.expenses.length; i++) {
                expenses += economy.expenses[i].amount || 0;
            }
        }

        // Staff wages: flat per staff member. (Domain policy; the per-
        // member figure is a placeholder until wage tracking moves to
        // household.economy.staffWages.)
        if (Array.isArray(record.members)) {
            for (var j = 0; j < record.members.length; j++) {
                if (record.members[j].type === 'staff') expenses += 8;
            }
        }

        // Enterprise loss.
        var ent = calculateEnterpriseNet(householdId);
        expenses += ent.expense;

        // Rent expenses.
        expenses += calculateRentExpenses(householdId);

        // Tuition for the effective year only.
        if (Array.isArray(economy.tuitionExpensesHistory)) {
            for (var k = 0; k < economy.tuitionExpensesHistory.length; k++) {
                if (economy.tuitionExpensesHistory[k].year === year) {
                    expenses += economy.tuitionExpensesHistory[k].amount || 0;
                }
            }
        }

        // Debt interest. Delegated to HouseholdRules.
        expenses += R.calculateAnnualDebtInterest(record.debt);

        return expenses;
    }

    function computeNetAnnualChange(householdId, options) {
        return calculateAnnualIncome(householdId, options)
             - calculateAnnualExpenses(householdId, options);
    }

    function isBankrupt(householdId) {
        var h = _queries.getHousehold(householdId);
        if (!h) return false;
        return R.evaluateBankruptcy(h.wealth);
    }

    // =========================================================================
    // 4. MUTATION CORE
    // =========================================================================
    //
    // _applyMutation is the ONLY place in this module that mutates a
    // household record. It:
    //
    //   1. Reads the canonical record via HouseholdQueries (verifying
    //      the household exists).
    //   2. Runs a PURE projection function (`mutator`) that receives
    //      the current record and returns a PATCH object — a plain
    //      object of field → new value. The mutator MUST NOT mutate
    //      the record it was given.
    //   3. Applies the patch via HouseholdCommands.updateHousehold. The
    //      command validates the allowlist and commits (marks dirty,
    //      publishes, dispatches).
    //   4. Persists ONCE via HouseholdCommands.persist.
    //
    // Why patch-then-command instead of mutate-then-commit:
    //
    //   - updateHousehold validates field ownership. A mutator that
    //     wrote a forbidden field would have partially applied the
    //     mutation before the command rejected it. Patch-then-command
    //     means the command sees the whole change at once and can
    //     reject it cleanly before any field is touched.
    //
    //   - The mutation is expressed in one place (the patch), so the
    //     audit trail (transaction history) and the actual change are
    //     built from the same values.
    //
    // Mutator contract:
    //
    //   function mutator(record) -> patch
    //     - record is the CANONICAL household object; treat as read-only.
    //     - patch is a plain object whose keys are in the
    //       _ALLOWED_HOUSEHOLD_UPDATE_FIELDS allowlist of
    //       household-commands.js. Typically { wealth, debt, resources,
    //       economy, eventLog, status }.
    //     - Mutators that need to abort return { __abort: true,
    //       code, reason }. _applyMutation surfaces that as a _fail.
    //
    // _applyMutation returns:
    //
    //   _ok({ householdId, ...extra })
    //   _fail(code, reason)
    //
    // It does NOT dispatch domain-specific events beyond what
    // HouseholdCommands.updateHousehold already publishes
    // ('householdUpdated'). Callers that need a distinct event name (for
    // subscriber listeners) call HouseholdState.publish themselves
    // AFTER the mutation succeeds.

    function _applyMutation(householdId, mutator, extraData) {
        var state = window.HouseholdState;
        if (!state || !state._internal
            || typeof state._internal.getHouseholdRecord !== 'function') {
            return _fail('STATE_UNAVAILABLE', 'HouseholdState is not available');
        }
        var record = state._internal.getHouseholdRecord(householdId);
        if (!record) return _fail('NOT_FOUND', 'Household not found');

        // Run the pure projection.
        var patch;
        try {
            patch = mutator(record);
        } catch (e) {
            return _fail(
                'MUTATOR_THREW',
                (e && e.message) ? e.message : 'Mutator threw'
            );
        }

        if (!patch || typeof patch !== 'object') {
            return _fail(
                'MUTATOR_INVALID',
                'Mutator returned a non-object patch'
            );
        }
        if (patch.__abort === true) {
            return _fail(
                patch.code || 'MUTATION_ABORTED',
                patch.reason || 'Mutation aborted'
            );
        }

        // Apply via the command. The command's allowlist rejects
        // forbidden fields. The command's _commit does markDirty +
        // publish('householdUpdated') + dispatch.
        var commitResult = _commands.updateHousehold(householdId, patch);
        if (!commitResult || commitResult.success === false) {
            return _fail(
                (commitResult && commitResult.code) || 'COMMIT_FAILED',
                (commitResult && commitResult.reason) || 'Failed to apply mutation'
            );
        }

        // Persist once.
        var persistResult = _commands.persist();
        if (!persistResult || persistResult.success === false) {
            return _fail(
                (persistResult && persistResult.code) || 'PERSIST_FAILED',
                (persistResult && persistResult.reason) || 'Failed to persist'
            );
        }

        var data = { householdId: householdId };
        if (extraData && typeof extraData === 'object') {
            for (var k in extraData) {
                if (Object.prototype.hasOwnProperty.call(extraData, k)) {
                    data[k] = extraData[k];
                }
            }
        }
        return _ok(data);
    }

    /**
     * Appends a transaction entry to the household's economy.transactions
     * and trims the history. Mutates `economy` in place — callers pass a
     * shallow copy of the current economy object.
     *
     * @private
     */
    function _pushTransaction(economy, entry) {
        if (!economy || typeof economy !== 'object') return;
        if (!Array.isArray(economy.transactions)) economy.transactions = [];
        economy.transactions.push(entry);
        var cap = C.THRESHOLDS.MAX_TRANSACTION_HISTORY;
        if (economy.transactions.length > cap) {
            economy.transactions = economy.transactions.slice(-cap);
        }
    }

    /**
     * Returns a shallow copy of the household's economy object plus an
     * `economy.transactions` array that is guaranteed to exist and to be
     * a real array (not a reference into canonical state).
     *
     * @private
     */
    function _copyEconomy(record) {
        var economy = (record && record.economy && typeof record.economy === 'object')
            ? Object.assign({}, record.economy)
            : {};
        economy.transactions = Array.isArray(economy.transactions)
            ? economy.transactions.slice()
            : [];
        return economy;
    }

    // =========================================================================
    // 5. WEALTH / DEBT / RESOURCE MUTATIONS
    // =========================================================================

    function updateHouseholdWealth(householdId, delta, reason, options) {
        if (!_isFiniteNumber(delta)) {
            return _fail('INVALID_DELTA', 'delta must be a finite number');
        }
        var h = _queries.getHousehold(householdId);
        if (!h) return _fail('NOT_FOUND', 'Household not found');

        var year = _effectiveYear(options);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid year');

        var oldWealth = _isFiniteNumber(h.wealth) ? h.wealth : 0;

        return _applyMutation(householdId, function(record) {
            var currentWealth = _isFiniteNumber(record.wealth) ? record.wealth : 0;
            var newWealth = currentWealth + delta;

            var economy = _copyEconomy(record);
            _pushTransaction(economy, {
                year: year,
                type: 'wealth_change',
                amount: delta,
                reason: reason || 'Wealth adjustment',
                oldWealth: currentWealth,
                newWealth: newWealth,
                timestamp: Date.now()
            });

            return {
                wealth: newWealth,
                economy: economy
            };
        }, {
            oldWealth: oldWealth,
            newWealth: oldWealth + delta,
            delta: delta
        });
    }

    function modifyHouseholdDebt(householdId, delta, options) {
        if (!_isFiniteNumber(delta)) {
            return _fail('INVALID_DELTA', 'delta must be a finite number');
        }
        var h = _queries.getHousehold(householdId);
        if (!h) return _fail('NOT_FOUND', 'Household not found');

        var year = _effectiveYear(options);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid year');

        var oldDebt = _isFiniteNumber(h.debt) ? h.debt : 0;

        return _applyMutation(householdId, function(record) {
            var currentDebt = _isFiniteNumber(record.debt) ? record.debt : 0;
            var newDebt = Math.max(0, currentDebt + delta);

            var economy = _copyEconomy(record);
            _pushTransaction(economy, {
                year: year,
                type: 'debt_change',
                amount: delta,
                oldDebt: currentDebt,
                newDebt: newDebt,
                timestamp: Date.now()
            });

            return {
                debt: newDebt,
                economy: economy
            };
        }, {
            oldDebt: oldDebt,
            newDebt: Math.max(0, oldDebt + delta),
            delta: delta
        });
    }

    function updateHouseholdResources(householdId, resourceType, delta, options) {
        var valid = ['food', 'livestock', 'goods'];
        if (valid.indexOf(resourceType) === -1) {
            return _fail(
                'INVALID_RESOURCE_TYPE',
                'Resource type must be food, livestock, or goods'
            );
        }
        if (!_isFiniteNumber(delta)) {
            return _fail('INVALID_DELTA', 'delta must be a finite number');
        }

        var year = _effectiveYear(options);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid year');

        var current = getHouseholdResources(householdId);
        var oldValue = current[resourceType] || 0;
        var newValue = Math.max(0, oldValue + delta);

        return _applyMutation(householdId, function(record) {
            var currentResources = (record.resources
                && typeof record.resources === 'object')
                ? Object.assign({}, record.resources)
                : { food: 0, livestock: 0, goods: 0 };

            var currentVal = _isFiniteNumber(currentResources[resourceType])
                ? currentResources[resourceType]
                : 0;
            var newVal = Math.max(0, currentVal + delta);

            var economy = _copyEconomy(record);
            if (!Array.isArray(economy.resourceHistory)) economy.resourceHistory = [];
            economy.resourceHistory.push({
                year: year,
                resource: resourceType,
                delta: delta,
                oldValue: currentVal,
                newValue: newVal,
                timestamp: Date.now()
            });
            var cap = C.THRESHOLDS.MAX_RESOURCE_HISTORY;
            if (economy.resourceHistory.length > cap) {
                economy.resourceHistory = economy.resourceHistory.slice(-cap);
            }

            currentResources[resourceType] = newVal;

            return {
                resources: currentResources,
                economy: economy
            };
        }, {
            resourceType: resourceType,
            oldValue: oldValue,
            newValue: newValue,
            delta: delta
        });
    }

    // =========================================================================
    // 6. SALARY / TUITION / SCHOOL PROFIT
    // =========================================================================

    function receiveSalary(householdId, characterId, roleId, salary, year) {
        if (!_isFiniteNumber(salary)) {
            return _fail('INVALID_SALARY', 'salary must be a finite number');
        }

        var h = _queries.getHousehold(householdId);
        if (!h) return _fail('NOT_FOUND', 'Household not found');

        var y = (year === undefined || year === null)
            ? _getCurrentYearSafe()
            : year;
        if (!_isFiniteNumber(y)) {
            return _fail('INVALID_YEAR', 'Invalid year');
        }

        var oldWealth = _isFiniteNumber(h.wealth) ? h.wealth : 0;

        return _applyMutation(householdId, function(record) {
            var currentWealth = _isFiniteNumber(record.wealth) ? record.wealth : 0;
            var newWealth = currentWealth + salary;

            var economy = _copyEconomy(record);

            economy.salaryIncome = (_isFiniteNumber(economy.salaryIncome)
                ? economy.salaryIncome : 0) + salary;

            if (!Array.isArray(economy.salaryIncomeHistory)) {
                economy.salaryIncomeHistory = [];
            }
            economy.salaryIncomeHistory.push({
                year: y,
                characterId: characterId,
                roleId: roleId || null,
                amount: salary,
                timestamp: Date.now()
            });
            var cap = C.THRESHOLDS.MAX_SALARY_HISTORY;
            if (economy.salaryIncomeHistory.length > cap) {
                economy.salaryIncomeHistory = economy.salaryIncomeHistory.slice(-cap);
            }

            _pushTransaction(economy, {
                year: y,
                type: 'salary_received',
                amount: salary,
                roleId: roleId || null,
                characterId: characterId,
                oldWealth: currentWealth,
                newWealth: newWealth,
                timestamp: Date.now()
            });

            return {
                wealth: newWealth,
                economy: economy
            };
        }, {
            characterId: characterId,
            roleId: roleId || null,
            amount: salary,
            year: y
        });
    }

    function getSalaryIncome(householdId, year) {
        var y = (year === undefined || year === null)
            ? _getCurrentYearSafe()
            : year;
        if (!_isFiniteNumber(y)) return 0;

        var state = window.HouseholdState;
        if (!state || !state._internal
            || typeof state._internal.getHouseholdRecord !== 'function') {
            return 0;
        }
        var record = state._internal.getHouseholdRecord(householdId);
        if (!record || !record.economy
            || !Array.isArray(record.economy.salaryIncomeHistory)) {
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
        if (!state || !state._internal
            || typeof state._internal.getHouseholdRecord !== 'function') {
            return 0;
        }
        var record = state._internal.getHouseholdRecord(householdId);
        if (!record || !record.economy) return 0;
        return _isFiniteNumber(record.economy.salaryIncome)
            ? record.economy.salaryIncome
            : 0;
    }

    function trackTuitionExpense(householdId, tuition, institutionId, studentId, year) {
        if (!_isFiniteNumber(tuition)) {
            return _fail('INVALID_TUITION', 'tuition must be a finite number');
        }

        var h = _queries.getHousehold(householdId);
        if (!h) return _fail('NOT_FOUND', 'Household not found');

        var y = (year === undefined || year === null)
            ? _getCurrentYearSafe()
            : year;
        if (!_isFiniteNumber(y)) {
            return _fail('INVALID_YEAR', 'Invalid year');
        }

        var oldWealth = _isFiniteNumber(h.wealth) ? h.wealth : 0;

        return _applyMutation(householdId, function(record) {
            var currentWealth = _isFiniteNumber(record.wealth) ? record.wealth : 0;
            var newWealth = currentWealth - tuition;

            var economy = _copyEconomy(record);

            economy.tuitionExpenses = (_isFiniteNumber(economy.tuitionExpenses)
                ? economy.tuitionExpenses : 0) + tuition;

            if (!Array.isArray(economy.tuitionExpensesHistory)) {
                economy.tuitionExpensesHistory = [];
            }
            economy.tuitionExpensesHistory.push({
                year: y,
                institutionId: institutionId || null,
                studentId: studentId || null,
                amount: tuition,
                timestamp: Date.now()
            });
            var cap = C.THRESHOLDS.MAX_TUITION_HISTORY;
            if (economy.tuitionExpensesHistory.length > cap) {
                economy.tuitionExpensesHistory =
                    economy.tuitionExpensesHistory.slice(-cap);
            }

            _pushTransaction(economy, {
                year: y,
                type: 'tuition_paid',
                amount: -tuition,
                institutionId: institutionId || null,
                studentId: studentId || null,
                oldWealth: currentWealth,
                newWealth: newWealth,
                timestamp: Date.now()
            });

            return {
                wealth: newWealth,
                economy: economy
            };
        }, {
            institutionId: institutionId || null,
            studentId: studentId || null,
            amount: tuition,
            year: y
        });
    }

    function getTuitionExpenses(householdId, year) {
        var y = (year === undefined || year === null)
            ? _getCurrentYearSafe()
            : year;
        if (!_isFiniteNumber(y)) return 0;

        var state = window.HouseholdState;
        if (!state || !state._internal
            || typeof state._internal.getHouseholdRecord !== 'function') {
            return 0;
        }
        var record = state._internal.getHouseholdRecord(householdId);
        if (!record || !record.economy
            || !Array.isArray(record.economy.tuitionExpensesHistory)) {
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
        if (!_isFiniteNumber(amount)) {
            return _fail('INVALID_AMOUNT', 'amount must be a finite number');
        }

        var h = _queries.getHousehold(householdId);
        if (!h) return _fail('NOT_FOUND', 'Household not found');

        var y = (year === undefined || year === null)
            ? _getCurrentYearSafe()
            : year;
        if (!_isFiniteNumber(y)) {
            return _fail('INVALID_YEAR', 'Invalid year');
        }

        var oldWealth = _isFiniteNumber(h.wealth) ? h.wealth : 0;

        return _applyMutation(householdId, function(record) {
            var currentWealth = _isFiniteNumber(record.wealth) ? record.wealth : 0;
            var newWealth = currentWealth + amount;

            var economy = _copyEconomy(record);

            economy.schoolProfits = (_isFiniteNumber(economy.schoolProfits)
                ? economy.schoolProfits : 0) + amount;

            if (!Array.isArray(economy.schoolProfitHistory)) {
                economy.schoolProfitHistory = [];
            }
            economy.schoolProfitHistory.push({
                year: y,
                institutionId: institutionId || null,
                amount: amount,
                timestamp: Date.now()
            });
            var cap = C.THRESHOLDS.MAX_SCHOOL_PROFIT_HISTORY;
            if (economy.schoolProfitHistory.length > cap) {
                economy.schoolProfitHistory =
                    economy.schoolProfitHistory.slice(-cap);
            }

            _pushTransaction(economy, {
                year: y,
                type: 'school_profit',
                amount: amount,
                institutionId: institutionId || null,
                oldWealth: currentWealth,
                newWealth: newWealth,
                timestamp: Date.now()
            });

            return {
                wealth: newWealth,
                economy: economy
            };
        }, {
            institutionId: institutionId || null,
            amount: amount,
            year: y
        });
    }

    function getSchoolProfits(householdId, year) {
        var y = (year === undefined || year === null)
            ? _getCurrentYearSafe()
            : year;
        if (!_isFiniteNumber(y)) return 0;

        var state = window.HouseholdState;
        if (!state || !state._internal
            || typeof state._internal.getHouseholdRecord !== 'function') {
            return 0;
        }
        var record = state._internal.getHouseholdRecord(householdId);
        if (!record || !record.economy
            || !Array.isArray(record.economy.schoolProfitHistory)) {
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
    // 7. TRADE
    // =========================================================================
    //
    // Trade touches two households. Each side is its own logical operation
    // (its own commit + persist). If the target side fails after the
    // source succeeds, we attempt a rollback of the source through the
    // same mutation primitive.
    //
    // Both sides are validated BEFORE either is applied, so we never
    // start a trade that cannot finish.

    function executeTrade(sourceId, targetId, trade, options) {
        if (!trade || typeof trade !== 'object') {
            return _fail('INVALID_TRADE', 'Trade data required');
        }
        var source = _queries.getHousehold(sourceId);
        var target = _queries.getHousehold(targetId);
        if (!source) return _fail('SOURCE_NOT_FOUND', 'Source household not found');
        if (!target) return _fail('TARGET_NOT_FOUND', 'Target household not found');

        var year = _effectiveYear(options);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid year');

        var sourceGives = trade.sourceGives || {};
        var targetGives = trade.targetGives || {};

        var sourceResources = getHouseholdResources(sourceId);
        var targetResources = getHouseholdResources(targetId);
        var sourceWealth = _isFiniteNumber(source.wealth) ? source.wealth : 0;
        var targetWealth = _isFiniteNumber(target.wealth) ? target.wealth : 0;

        // Validate both sides can afford what they're giving.
        if ((sourceGives.wealth || 0) > sourceWealth) {
            return _fail('INSUFFICIENT_WEALTH', 'Source cannot afford wealth portion');
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
        if ((targetGives.wealth || 0) > targetWealth) {
            return _fail('INSUFFICIENT_WEALTH', 'Target cannot afford wealth portion');
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

        // Snapshot the source for rollback.
        var sourceSnapshot = {
            wealth: sourceWealth,
            resources: {
                food: sourceResources.food,
                livestock: sourceResources.livestock,
                goods: sourceResources.goods
            }
        };

        // Apply source side.
        var sourceResult = _applyTradeSide(
            sourceId,
            sourceWealth - (sourceGives.wealth || 0) + (targetGives.wealth || 0),
            {
                food: sourceResources.food - (sourceGives.food || 0) + (targetGives.food || 0),
                livestock: sourceResources.livestock - (sourceGives.livestock || 0) + (targetGives.livestock || 0),
                goods: sourceResources.goods - (sourceGives.goods || 0) + (targetGives.goods || 0)
            },
            {
                year: year,
                partnerId: targetId,
                type: 'export',
                gave: JSON.parse(JSON.stringify(sourceGives)),
                received: JSON.parse(JSON.stringify(targetGives))
            }
        );
        if (!sourceResult.success) {
            return _fail(
                'SOURCE_UPDATE_FAILED',
                sourceResult.reason || 'Failed to update source'
            );
        }

        // Apply target side.
        var targetResult = _applyTradeSide(
            targetId,
            targetWealth - (targetGives.wealth || 0) + (sourceGives.wealth || 0),
            {
                food: targetResources.food - (targetGives.food || 0) + (sourceGives.food || 0),
                livestock: targetResources.livestock - (targetGives.livestock || 0) + (sourceGives.livestock || 0),
                goods: targetResources.goods - (targetGives.goods || 0) + (sourceGives.goods || 0)
            },
            {
                year: year,
                partnerId: sourceId,
                type: 'import',
                gave: JSON.parse(JSON.stringify(targetGives)),
                received: JSON.parse(JSON.stringify(sourceGives))
            }
        );
        if (!targetResult.success) {
            // Best-effort rollback of source.
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
                        received: {},
                        reason: 'Target update failed'
                    }
                );
            } catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error(
                        'HouseholdEconomy.executeTrade: rollback failed',
                        e
                    );
                }
            }
            return _fail(
                'TARGET_UPDATE_FAILED',
                targetResult.reason || 'Failed to update target'
            );
        }

        return _ok({
            sourceId: sourceId,
            targetId: targetId,
            year: year
        });
    }

    /**
     * Applies one side of a trade. Builds a patch that sets wealth +
     * resources and appends a trade history entry, then applies via
     * _applyMutation (one commit, one persist per side).
     */
    function _applyTradeSide(householdId, newWealth, newResources, tradeEntry) {
        return _applyMutation(householdId, function(record) {
            var economy = _copyEconomy(record);
            if (!Array.isArray(economy.trades)) economy.trades = [];
            economy.trades.push(tradeEntry);
            var cap = C.THRESHOLDS.MAX_TRANSACTION_HISTORY;
            if (economy.trades.length > cap) {
                economy.trades = economy.trades.slice(-cap);
            }

            // Overwrite resources wholesale — the caller computed the
            // full new resource state. This matches the previous
            // behaviour and is safe because the caller validated bounds.
            var resourcesCopy = {
                food: _isFiniteNumber(newResources.food) ? newResources.food : 0,
                livestock: _isFiniteNumber(newResources.livestock) ? newResources.livestock : 0,
                goods: _isFiniteNumber(newResources.goods) ? newResources.goods : 0
            };

            return {
                wealth: newWealth,
                resources: resourcesCopy,
                economy: economy
            };
        }, {
            partnerId: tradeEntry.partnerId,
            type: tradeEntry.type
        });
    }

    function getTradePartners(householdId) {
        var state = window.HouseholdState;
        if (!state || !state._internal
            || typeof state._internal.getHouseholdRecord !== 'function') {
            return [];
        }
        var record = state._internal.getHouseholdRecord(householdId);
        if (!record || !record.economy
            || !Array.isArray(record.economy.trades)) {
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
    // 8. ECONOMIC EVENTS
    // =========================================================================
    //
    // The catalog lives in household-constants.js. The delta calculation
    // lives in HouseholdConstants.getEconomicEventDelta(eventId, randomFn).
    // This module only:
    //   - validates the event id
    //   - picks a random event weighted by chance (applyRandomEconomicEvent)
    //   - dispatches to updateHouseholdWealth + recordEvent for the actual
    //     mutation
    //
    // All randomness routes through window.random (or options.random).

    function _resolveRandom(options) {
        if (options && typeof options.random === 'function') {
            return options.random;
        }
        return _random;
    }

    /**
     * Fires a specific economic event.
     *
     * Single logical operation: the wealth change and the event-log entry
     * are applied in ONE patch (so a mid-operation failure cannot leave
     * wealth changed but the event unrecorded), then committed and
     * persisted once.
     *
     * @param {string} householdId
     * @param {string} eventTypeId
     * @param {Object} [options] - { year, random }
     * @returns {{success, data?, code?, reason?}}
     */
    function triggerEconomicEvent(householdId, eventTypeId, options) {
        var event = C.ECONOMIC_EVENTS[eventTypeId];
        if (!event) {
            return _fail('INVALID_EVENT', 'Unknown economic event "' +
                String(eventTypeId) + '"');
        }

        var h = _queries.getHousehold(householdId);
        if (!h) return _fail('NOT_FOUND', 'Household not found');

        var year = _effectiveYear(options);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid year');

        var randomFn = _resolveRandom(options);
        var delta;
        try {
            delta = C.getEconomicEventDelta(eventTypeId, randomFn);
        } catch (e) {
            return _fail(
                'INVALID_DELTA',
                (e && e.message) ? e.message : 'Failed to compute event delta'
            );
        }

        if (delta === 0) {
            return _ok({
                householdId: householdId,
                event: event,
                delta: 0,
                newWealth: _isFiniteNumber(h.wealth) ? h.wealth : 0,
                noChange: true
            });
        }

        var oldWealth = _isFiniteNumber(h.wealth) ? h.wealth : 0;

        return _applyMutation(householdId, function(record) {
            var currentWealth = _isFiniteNumber(record.wealth) ? record.wealth : 0;
            var newWealth = currentWealth + delta;

            var economy = _copyEconomy(record);
            _pushTransaction(economy, {
                year: year,
                type: 'economic_event',
                eventId: event.id,
                eventName: event.name,
                amount: delta,
                oldWealth: currentWealth,
                newWealth: newWealth,
                timestamp: Date.now()
            });

            // Also append to eventLog so it shows in the UI history.
            var eventLog = Array.isArray(record.eventLog)
                ? record.eventLog.slice()
                : [];
            eventLog.push({
                year: year,
                type: 'economic_event',
                message: event.name,
                details: event.description,
                amount: delta,
                timestamp: Date.now()
            });
            var cap = C.THRESHOLDS.MAX_EVENT_LOG;
            if (eventLog.length > cap) eventLog = eventLog.slice(-cap);

            return {
                wealth: newWealth,
                economy: economy,
                eventLog: eventLog
            };
        }, {
            event: event,
            delta: delta,
            newWealth: oldWealth + delta,
            year: year
        });
    }

    /**
     * Rolls a weighted random event and triggers it if one fires.
     *
     * The chance weights come from the catalog. Only events whose chance
     * is > 0 participate. The roll is a single draw against the sum of
     * weights; if the draw exceeds the sum, no event fires (the "nothing
     * happens" probability is 1 - sum(chances)).
     *
     * @param {string} householdId
     * @param {Object} [options] - { year, random }
     */
    function applyRandomEconomicEvent(householdId, options) {
        options = options || {};

        var h = _queries.getHousehold(householdId);
        if (!h) return _fail('NOT_FOUND', 'Household not found');

        var year = _effectiveYear(options);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid year');

        var randomFn = _resolveRandom(options);

        // Build weighted list from catalog.
        var weights = [];
        var totalChance = 0;
        for (var i = 0; i < C.ECONOMIC_EVENT_IDS.length; i++) {
            var id = C.ECONOMIC_EVENT_IDS[i];
            var event = C.ECONOMIC_EVENTS[id];
            var chance = _isFiniteNumber(event.chance) ? event.chance : 0;
            if (chance > 0) {
                weights.push({ id: id, chance: chance });
                totalChance += chance;
            }
        }

        if (totalChance <= 0) {
            return _ok({ householdId: householdId, triggered: false });
        }

        var roll = randomFn();
        if (roll >= totalChance) {
            return _ok({
                householdId: householdId,
                triggered: false,
                roll: roll,
                totalChance: totalChance
            });
        }

        var cumulative = 0;
        for (var j = 0; j < weights.length; j++) {
            cumulative += weights[j].chance;
            if (roll < cumulative) {
                var triggerResult = triggerEconomicEvent(householdId, weights[j].id, {
                    year: year,
                    random: randomFn
                });
                if (!triggerResult.success) return triggerResult;
                return _ok(Object.assign({ triggered: true }, triggerResult.data));
            }
        }

        // Floating-point safety net; should not be reachable.
        return _ok({ householdId: householdId, triggered: false });
    }

    // =========================================================================
    // 9. ANNUAL PROCESSING
    // =========================================================================

    /**
     * Processes one year of economy for a household.
     *
     * Single patch:
     *   - wealth += net change
     *   - append annual_economy transaction
     *   - append event-log entries for enterprise profit/loss, rent
     *     income, rent expense (year-tagged)
     *   - flip status to 'bankrupt' if the new wealth crosses the
     *     threshold
     *
     * One commit, one persist.
     *
     * @param {string} householdId
     * @param {Object} [options] - { year }
     */
    function processAnnualEconomy(householdId, options) {
        var h = _queries.getHousehold(householdId);
        if (!h) return _fail('NOT_FOUND', 'Household not found');

        var year = _effectiveYear(options);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid year');

        var oldWealth = _isFiniteNumber(h.wealth) ? h.wealth : 0;
        var income = calculateAnnualIncome(householdId, { year: year });
        var expenses = calculateAnnualExpenses(householdId, { year: year });
        var netChange = income - expenses;
        var newWealth = oldWealth + netChange;
        var nowBankrupt = R.evaluateBankruptcy(newWealth);

        var rentIncome = calculateRentIncome(householdId);
        var rentExpense = calculateRentExpenses(householdId);

        var enterpriseSummaries = [];
        try {
            enterpriseSummaries = _queries.getHouseholdEnterpriseSummaries(householdId);
        } catch (e) {
            enterpriseSummaries = [];
        }

        return _applyMutation(householdId, function(record) {
            var currentWealth = _isFiniteNumber(record.wealth) ? record.wealth : 0;
            var computedWealth = currentWealth + netChange;

            var economy = _copyEconomy(record);
            _pushTransaction(economy, {
                year: year,
                type: 'annual_economy',
                amount: netChange,
                income: income,
                expenses: expenses,
                oldWealth: currentWealth,
                newWealth: computedWealth,
                timestamp: Date.now()
            });

            // Append event-log entries.
            var eventLog = Array.isArray(record.eventLog)
                ? record.eventLog.slice()
                : [];

            for (var i = 0; i < enterpriseSummaries.length; i++) {
                var s = enterpriseSummaries[i];
                if (!_isFiniteNumber(s.annualProfit) || s.annualProfit === 0) {
                    continue;
                }
                eventLog.push({
                    year: year,
                    type: s.annualProfit > 0
                        ? 'enterprise_profit'
                        : 'enterprise_loss',
                    amount: Math.abs(s.annualProfit),
                    details: s.name,
                    timestamp: Date.now()
                });
            }

            if (rentIncome > 0) {
                eventLog.push({
                    year: year,
                    type: 'rent_income',
                    amount: rentIncome,
                    message: 'Rent income from properties owned',
                    timestamp: Date.now()
                });
            }
            if (rentExpense > 0) {
                eventLog.push({
                    year: year,
                    type: 'rent_expense',
                    amount: rentExpense,
                    message: 'Rent expenses for properties rented',
                    timestamp: Date.now()
                });
            }

            var eventCap = C.THRESHOLDS.MAX_EVENT_LOG;
            if (eventLog.length > eventCap) {
                eventLog = eventLog.slice(-eventCap);
            }

            // Status transition.
            var patch = {
                wealth: computedWealth,
                economy: economy,
                eventLog: eventLog
            };

            if (nowBankrupt && record.status !== 'bankrupt') {
                patch.status = 'bankrupt';
            } else if (!nowBankrupt && record.status === 'bankrupt' && computedWealth > 10) {
                patch.status = 'active';
            }

            return patch;
        }, {
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
     * Consumes annual food based on member count. Falls back to livestock,
     * then emergency wealth purchase. One commit, one persist.
     */
    function consumeAnnualFood(householdId, options) {
        var state = window.HouseholdState;
        if (!state || !state._internal
            || typeof state._internal.getHouseholdRecord !== 'function') {
            return _fail('STATE_UNAVAILABLE', 'HouseholdState is not available');
        }
        var record = state._internal.getHouseholdRecord(householdId);
        if (!record) return _fail('NOT_FOUND', 'Household not found');

        var year = _effectiveYear(options);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid year');

        var memberCount = Array.isArray(record.members) ? record.members.length : 0;
        var foodNeeded = memberCount * 2;

        var resources = getHouseholdResources(householdId);
        var availableFood = resources.food;
        var availableLivestock = resources.livestock;

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

        var computedNewFood = Math.max(0, availableFood - foodUsed);
        var computedNewLivestock = Math.max(0, availableLivestock - livestockUsed);

        return _applyMutation(householdId, function(r) {
            var currentWealth = _isFiniteNumber(r.wealth) ? r.wealth : 0;
            var newWealth = currentWealth - emergencyCost;

            var currentResources = (r.resources && typeof r.resources === 'object')
                ? Object.assign({}, r.resources)
                : { food: 0, livestock: 0, goods: 0 };
            currentResources.food = computedNewFood;
            currentResources.livestock = computedNewLivestock;

            var economy = _copyEconomy(r);
            _pushTransaction(economy, {
                year: year,
                type: 'food_consumption',
                foodUsed: foodUsed,
                livestockUsed: livestockUsed,
                emergencyCost: emergencyCost,
                oldWealth: currentWealth,
                newWealth: newWealth,
                timestamp: Date.now()
            });

            return {
                wealth: newWealth,
                resources: currentResources,
                economy: economy
            };
        }, {
            foodUsed: foodUsed,
            livestockUsed: livestockUsed,
            emergencyCost: emergencyCost,
            insufficient: deficit > 0,
            newFood: computedNewFood,
            newLivestock: computedNewLivestock
        });
    }

    // =========================================================================
    // 10. BANKRUPTCY
    // =========================================================================

    function handleBankruptcy(householdId, options) {
        if (!isBankrupt(householdId)) {
            return _fail('NOT_BANKRUPT', 'Household is not bankrupt');
        }

        var year = _effectiveYear(options);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid year');

        var h = _queries.getHousehold(householdId);
        var oldWealth = h && _isFiniteNumber(h.wealth) ? h.wealth : 0;
        var oldDebt = h && _isFiniteNumber(h.debt) ? h.debt : 0;

        return _applyMutation(householdId, function(record) {
            var eventLog = Array.isArray(record.eventLog)
                ? record.eventLog.slice()
                : [];
            eventLog.push({
                year: year,
                type: 'status_changed',
                from: record.status || 'active',
                to: 'bankrupt',
                reason: 'Bankruptcy processed - debt forgiven',
                timestamp: Date.now()
            });
            var cap = C.THRESHOLDS.MAX_EVENT_LOG;
            if (eventLog.length > cap) eventLog = eventLog.slice(-cap);

            return {
                wealth: 0,
                debt: 0,
                status: 'bankrupt',
                eventLog: eventLog
            };
        }, {
            year: year,
            oldWealth: oldWealth,
            oldDebt: oldDebt,
            newWealth: 0,
            newDebt: 0
        });
    }

    // =========================================================================
    // 11. CONSTANT / RULE RE-EXPORTS (compatibility surface)
    // =========================================================================
    //
    // The prior module exposed ECONOMIC_TIERS, INCOME_SOURCES,
    // EXPENSE_CATEGORIES, ECONOMIC_EVENTS, BANKRUPTCY_THRESHOLD directly
    // on window.HouseholdEconomy. Those re-exports are preserved so
    // existing callers don't break — but they point at the SAME frozen
    // objects as HouseholdConstants, so there is no divergence risk.

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    window.HouseholdEconomy = {
        // ===== Constant re-exports (compatibility surface) =====
        ECONOMIC_TIERS: C.ECONOMIC_TIERS,
        INCOME_SOURCES: C.INCOME_SOURCES,
        EXPENSE_CATEGORIES: C.EXPENSE_CATEGORIES,
        ECONOMIC_EVENTS: C.ECONOMIC_EVENTS,
        BANKRUPTCY_THRESHOLD: C.THRESHOLDS.BANKRUPTCY,

        // ===== Pure calculations =====
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

        // ===== Wealth / debt / resource mutations =====
        updateHouseholdWealth: updateHouseholdWealth,
        modifyHouseholdDebt: modifyHouseholdDebt,
        updateHouseholdResources: updateHouseholdResources,

        // ===== Salary / tuition / school =====
        receiveSalary: receiveSalary,
        getSalaryIncome: getSalaryIncome,
        getTotalSalariesReceived: getTotalSalariesReceived,
        trackTuitionExpense: trackTuitionExpense,
        getTuitionExpenses: getTuitionExpenses,
        receiveSchoolProfit: receiveSchoolProfit,
        getSchoolProfits: getSchoolProfits,

        // ===== Trade =====
        executeTrade: executeTrade,
        getTradePartners: getTradePartners,

        // ===== Events =====
        triggerEconomicEvent: triggerEconomicEvent,
        applyRandomEconomicEvent: applyRandomEconomicEvent,

        // ===== Annual processing =====
        processAnnualEconomy: processAnnualEconomy,
        consumeAnnualFood: consumeAnnualFood,

        // ===== Bankruptcy =====
        handleBankruptcy: handleBankruptcy
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.HouseholdEconomy;
    }

})();
