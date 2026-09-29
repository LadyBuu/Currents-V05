/**
 * =============================================================================
 * STILL WATERS - INDUSTRY ECONOMICS (industry-economics.js)
 * =============================================================================
 *
 * LOCATION: js/core/industry/industry-economics.js
 *
 * Pure economic calculations for enterprises.
 *
 * RULES:
 *   - No state access
 *   - No commands
 *   - No persistence
 *   - No DOM
 *   - Deterministic: same input → same output
 *   - Every function takes an enterprise-shaped object and returns a result
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. WAGE CALCULATION
    // =========================================================================

    /**
     * Calculates total annual payroll for an enterprise.
     *
     * Authoritative model:
     *   workerList       — who is employed
     *   workerWages[id]  — per-worker override (optional)
     *   wages            — base wage for workers without override
     *
     * @param {Object} enterprise
     * @returns {number}
     */
    function calculateTotalWages(enterprise) {
        var workerList = enterprise.workerList || [];
        var overrides = enterprise.workerWages || {};
        var baseWage = enterprise.wages;
        if (baseWage === undefined || baseWage === null) {
            throw new Error('IndustryEconomics: enterprise.wages is required');
        }

        var total = 0;
        for (var i = 0; i < workerList.length; i++) {
            var workerId = workerList[i];
            var override = overrides[workerId];
            if (override === undefined || override === null) {
                total += baseWage;
            } else {
                total += override;
            }
        }
        return total;
    }

    // =========================================================================
    // 2. ANNUAL PROFIT
    // =========================================================================

    /**
     * Calculates annual net profit (before interest).
     *
     * @param {Object} enterprise
     * @returns {number}
     */
    function calculateAnnualProfit(enterprise) {
        var income = enterprise.income;
        var expenses = enterprise.expenses;
        if (income === undefined || income === null) {
            throw new Error('IndustryEconomics: enterprise.income is required');
        }
        if (expenses === undefined || expenses === null) {
            throw new Error('IndustryEconomics: enterprise.expenses is required');
        }
        return income - expenses - calculateTotalWages(enterprise);
    }

    // =========================================================================
    // 3. DEBT INTEREST
    // =========================================================================

    var DEBT_INTEREST_RATE = 0.05;

    /**
     * Calculates interest accrued over a number of years.
     *
     * @param {number} debt
     * @param {number} years
     * @returns {number}
     */
    function calculateDebtInterest(debt, years) {
        if (debt <= 0 || years <= 0) return 0;
        return Math.floor(debt * DEBT_INTEREST_RATE * years);
    }

    // =========================================================================
    // 4. YEAR RESOLUTION
    // =========================================================================

    /**
     * Determines how many years to process for this enterprise.
     *
     * @param {Object} enterprise
     * @param {number} currentYear
     * @returns {{ ok: boolean, years?: number, reason?: string }}
     */
    function resolveYearsToProcess(enterprise, currentYear) {
        var lastProcessed = enterprise.lastProcessedYear;
        if (lastProcessed === undefined || lastProcessed === null) {
            lastProcessed = enterprise.foundedYear;
        }
        if (lastProcessed === undefined || lastProcessed === null) {
            return {
                ok: false,
                reason: 'Enterprise has neither lastProcessedYear nor foundedYear'
            };
        }
        if (currentYear < lastProcessed) {
            return {
                ok: false,
                reason: 'currentYear (' + currentYear + ') is before lastProcessedYear (' + lastProcessed + ')'
            };
        }
        return { ok: true, years: currentYear - lastProcessed };
    }

    // =========================================================================
    // 5. ANNUAL TRANSITION
    // =========================================================================

    /**
     * Calculates the full annual transition for an enterprise.
     *
     * Pure. No side effects.
     *
     * @param {Object} enterprise
     * @param {number} currentYear
     * @param {Object} [options]
     * @param {boolean} [options.iterative=false]  — if true, process year by year
     * @param {number}  [options.bankruptcyThreshold=-100]
     * @returns {Object} transition result:
     *   {
     *     ok: true,
     *     currentYear,
     *     yearsProcessed,
     *     annualIncome,
     *     annualExpenses,
     *     totalWages,
     *     netProfit,
     *     totalProfit,
     *     interest,
     *     newWealth,
     *     newDebt,
     *     nextStatus,
     *     historyEntries
     *   }
     *   or { ok: false, reason }
     */
    function calculateAnnualTransition(enterprise, currentYear, options) {
        options = options || {};

        var yearsResult = resolveYearsToProcess(enterprise, currentYear);
        if (!yearsResult.ok) {
            return { ok: false, reason: yearsResult.reason };
        }
        var yearsProcessed = yearsResult.years;

        // Status unchanged when nothing to process
        if (yearsProcessed === 0) {
            return {
                ok: true,
                currentYear: currentYear,
                yearsProcessed: 0,
                annualIncome: enterprise.income,
                annualExpenses: enterprise.expenses,
                totalWages: calculateTotalWages(enterprise),
                netProfit: calculateAnnualProfit(enterprise),
                totalProfit: 0,
                interest: 0,
                newWealth: enterprise.wealth,
                newDebt: enterprise.debt,
                nextStatus: enterprise.status,
                historyEntries: []
            };
        }

        if (options.iterative === true) {
            return _calculateIterative(enterprise, currentYear, yearsProcessed, options);
        }
        return _calculateLinear(enterprise, currentYear, yearsProcessed, options);
    }

    function _calculateLinear(enterprise, currentYear, yearsProcessed, options) {
        var annualIncome = enterprise.income;
        var baseExpenses = enterprise.expenses;
        var totalWages = calculateTotalWages(enterprise);
        var annualExpenses = baseExpenses + totalWages;
        var netProfit = annualIncome - annualExpenses;
        var totalProfit = netProfit * yearsProcessed;

        var newWealth = (enterprise.wealth || 0) + totalProfit;
        var newDebt = enterprise.debt || 0;

        var interest = calculateDebtInterest(newDebt, yearsProcessed);
        if (interest > 0) {
            newDebt += interest;
        }

        var threshold = options.bankruptcyThreshold === undefined
            ? -100
            : options.bankruptcyThreshold;

        var nextStatus = enterprise.status;
        if (newWealth < threshold && enterprise.status === 'active') {
            nextStatus = 'bankrupt';
        }

        var historyEntries = [{
            year: currentYear,
            type: 'annual_processing',
            yearsProcessed: yearsProcessed,
            totalProfit: totalProfit,
            interest: interest,
            newWealth: newWealth,
            newDebt: newDebt,
            timestamp: Date.now()
        }];

        return {
            ok: true,
            currentYear: currentYear,
            yearsProcessed: yearsProcessed,
            annualIncome: annualIncome,
            annualExpenses: annualExpenses,
            totalWages: totalWages,
            netProfit: netProfit,
            totalProfit: totalProfit,
            interest: interest,
            newWealth: newWealth,
            newDebt: newDebt,
            nextStatus: nextStatus,
            historyEntries: historyEntries
        };
    }

    function _calculateIterative(enterprise, currentYear, yearsProcessed, options) {
        // Reserved for future. Behaves like linear for now but keeps the
        // shape of the API stable so we can swap in year-by-year logic
        // without touching callers.
        return _calculateLinear(enterprise, currentYear, yearsProcessed, options);
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.IndustryEconomics = {
        calculateTotalWages: calculateTotalWages,
        calculateAnnualProfit: calculateAnnualProfit,
        calculateDebtInterest: calculateDebtInterest,
        resolveYearsToProcess: resolveYearsToProcess,
        calculateAnnualTransition: calculateAnnualTransition,
        DEBT_INTEREST_RATE: DEBT_INTEREST_RATE
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.IndustryEconomics;
    }

})();
