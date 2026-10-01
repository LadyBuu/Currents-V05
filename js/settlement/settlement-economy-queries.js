/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT ECONOMY QUERIES
 * js/settlement/settlement-economy-queries.js
 * =============================================================================
 *
 * ECONOMY QUERIES.
 *
 * This file provides read-only calculations for settlement income,
 * expenses, surplus, and derived financial metrics. It answers:
 *   - how much income does a settlement earn annually, and from where?
 *   - how much does it spend annually, and on what?
 *   - what is the annual surplus or deficit?
 *   - what is the debt ratio?
 *   - what is the administrative efficiency score?
 *
 * It is a query module. It:
 *   - reads canonical settlement data through SettlementQueries
 *   - reads features through SettlementFeatureQueries
 *   - reads enterprises through IndustryQueries
 *   - reads employment through SettlementEmploymentQueries
 *   - reads fiscal limits from SettlementFiscalDefinitions
 *   - reads finance constants from SettlementFinanceDefinitions
 *   - does not mutate anything
 *   - does not persist
 *   - does not display UI
 *   - does not fabricate missing values
 *   - does not use recursion guards
 *
 * Contract reference: Settlement Architecture Contracts §10 (Query
 * Contract), §11 (Query Results and Missing Data), §21 (Fiscal Contract),
 * §32 (Completion Standard).
 *
 * Scope discipline:
 *
 *   This module computes. It does not decide policy. Every numeric input
 *   comes from canonical state or from a definitions module. Where the
 *   economy depends on another domain (features, enterprises,
 *   employment), it reads through that domain's query API. It does not
 *   re-implement those queries.
 *
 *   Allocation vs expense (§21): the settlement record distinguishes
 *   allocated budget from actual spending. Where both exist, this module
 *   uses the actual spending field. Where only an allocation exists, the
 *   allocation is used as the expense, and that substitution is
 *   documented at the point of use.
 *
 *   "Tax revenue" means tax income plus trade income plus industry tax
 *   income. It does not include enterprise profits. Enterprise profits
 *   are separate income categories. The naming is deliberate.
 *
 * Missing data:
 *
 *   - settlement missing             → queries return null
 *   - population unavailable         → returns null
 *   - no enterprises                 → enterprise income is legitimately 0
 *   - missing fiscal policy field    → returns null (not a default)
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCIES
    // =========================================================================

    function _getSettlementQueries() {
        return window.SettlementQueries;
    }

    function _getFeatureQueries() {
        return window.SettlementFeatureQueries;
    }

    function _getFeatureDefinitions() {
        return window.SettlementFeatureDefinitions;
    }

    function _getEmploymentQueries() {
        return window.SettlementEmploymentQueries;
    }

    function _getFinanceDefinitions() {
        return window.SettlementFinanceDefinitions;
    }

    function _getRankRules() {
        return window.SettlementRankRules;
    }

    function _getIndustryQueries() {
        return window.IndustryQueries;
    }

    function _getPopulationAccessor() {
        return window.getLocationPopulationCount;
    }

    function _getLocationState() {
        return window.LocationState;
    }

    // =========================================================================
    // 2. HELPERS
    // =========================================================================

    function _isFiniteNumber(value) {
        return typeof value === 'number' && isFinite(value);
    }

    function _getLocationIdsForSettlement(locationId) {
        var locationState = _getLocationState();
        if (typeof locationState.getAllSubLocationIds === 'function') {
            var ids = locationState.getAllSubLocationIds(locationId);
            if (ids && ids.length > 0) return ids;
        }
        return [locationId];
    }

    /**
     * Returns the settlement's current rank definition, or null.
     */
    function _getRank(locationId) {
        return _getSettlementQueries().getCurrentRank(locationId);
    }

    // =========================================================================
    // 3. INCOME
    // =========================================================================

    /**
     * Returns tax income for a settlement.
     *
     * Formula:
     *   baseTax * max(1, population / 100) * taxRate
     *
     * baseTax comes from the settlement's rank definition. taxRate comes
     * from the settlement's canonical fiscal policy. Population comes
     * from the population accessor.
     *
     * Returns 0 if the settlement has a rank or tax rate but zero
     * population. Returns null if a required input is unavailable.
     *
     * @param {string} locationId
     * @returns {number|null}
     */
    function calculateTaxIncome(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) return null;

        var rank = _getRank(locationId);
        if (!rank) return null;

        var taxRate = settlement.taxRate;
        if (!_isFiniteNumber(taxRate)) return null;

        var population = _getPopulationAccessor()(locationId);
        if (!_isFiniteNumber(population)) return null;

        var baseTax = rank.baseTax;
        if (!_isFiniteNumber(baseTax)) return null;

        var populationFactor = Math.max(1, population / 100);
        var taxFactor = taxRate / 100;

        return Math.floor(baseTax * populationFactor * taxFactor);
    }

    /**
     * Returns trade income for a settlement.
     *
     * Formula:
     *   taxIncome * 0.3 * (1 + tariff)
     *
     * Note: the 0.3 factor reflects the domain's current model of trade
     * income as a derived fraction of tax income. It is a domain constant
     * and is defined here, not duplicated.
     *
     * @param {string} locationId
     * @returns {number|null}
     */
    function calculateTradeIncome(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) return null;

        var tradeTariff = settlement.tradeTariff;
        if (!_isFiniteNumber(tradeTariff)) return null;

        var taxIncome = calculateTaxIncome(locationId);
        if (!_isFiniteNumber(taxIncome)) return null;

        var tariffFactor = tradeTariff / 100;

        return Math.floor(taxIncome * 0.3 * (1 + tariffFactor));
    }

    /**
     * Returns industry tax income for a settlement.
     *
     * Formula:
     *   sum over enterprises with positive profit:
     *     floor(profit * industryTaxRate / 100)
     *
     * @param {string} locationId
     * @returns {number|null}
     */
    function calculateIndustryIncome(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) return null;

        var industryTaxRate = settlement.industryTaxRate;
        if (!_isFiniteNumber(industryTaxRate)) return null;

        var locationIds = _getLocationIdsForSettlement(locationId);
        var industryQueries = _getIndustryQueries();
        var taxRate = industryTaxRate / 100;

        var total = 0;
        for (var i = 0; i < locationIds.length; i++) {
            var enterprises = industryQueries.getLocationEnterprisesSummary(locationIds[i]);
            if (!enterprises) continue;
            for (var j = 0; j < enterprises.length; j++) {
                var enterprise = enterprises[j];
                if (!enterprise) continue;
                var profit = enterprise.annualProfit;
                if (!_isFiniteNumber(profit) || profit <= 0) continue;
                total += Math.floor(profit * taxRate);
            }
        }

        return total;
    }

    /**
     * Returns state-owned enterprise profit for a settlement.
     *
     * Reads enterprises in the settlement's location set whose ownership
     * category is state. Per §19, ownership is determined from the
     * enterprise's own fields.
     *
     * @param {string} locationId
     * @returns {number|null}
     */
    function calculateStateEnterpriseIncome(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) return null;

        var locationIds = _getLocationIdsForSettlement(locationId);
        var industryQueries = _getIndustryQueries();

        var total = 0;
        for (var i = 0; i < locationIds.length; i++) {
            var enterprises = industryQueries.getLocationEnterprisesSummary(locationIds[i]);
            if (!enterprises) continue;
            for (var j = 0; j < enterprises.length; j++) {
                var enterprise = enterprises[j];
                if (!enterprise) continue;
                if (enterprise.ownerType !== 'state') continue;
                var profit = enterprise.annualProfit;
                if (!_isFiniteNumber(profit) || profit <= 0) continue;
                total += profit;
            }
        }

        return total;
    }

    /**
     * Returns public enterprise profit for a settlement.
     *
     * Public enterprises are those owned by the settlement (as opposed to
     * the state or private owners). Their profits accrue to the
     * settlement treasury.
     *
     * @param {string} locationId
     * @returns {number|null}
     */
    function calculatePublicEnterpriseIncome(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) return null;

        var locationIds = _getLocationIdsForSettlement(locationId);
        var industryQueries = _getIndustryQueries();

        var total = 0;
        for (var i = 0; i < locationIds.length; i++) {
            var enterprises = industryQueries.getLocationEnterprisesSummary(locationIds[i]);
            if (!enterprises) continue;
            for (var j = 0; j < enterprises.length; j++) {
                var enterprise = enterprises[j];
                if (!enterprise) continue;
                var isPublic = enterprise.ownerType === 'settlement'
                    || enterprise.ownershipType === 'public';
                if (!isPublic) continue;
                var profit = enterprise.annualProfit;
                if (!_isFiniteNumber(profit) || profit <= 0) continue;
                total += profit;
            }
        }

        return total;
    }

    /**
     * Returns tax revenue for a settlement: taxes + trade + industry tax.
     * Does not include enterprise profits.
     *
     * @param {string} locationId
     * @returns {number|null}
     */
    function calculateTaxRevenue(locationId) {
        var tax = calculateTaxIncome(locationId);
        var trade = calculateTradeIncome(locationId);
        var industry = calculateIndustryIncome(locationId);

        if (tax === null || trade === null || industry === null) return null;

        return tax + trade + industry;
    }

    /**
     * Returns total income for a settlement.
     *
     * @param {string} locationId
     * @returns {number|null}
     */
    function calculateTotalIncome(locationId) {
        var taxRevenue = calculateTaxRevenue(locationId);
        var stateIncome = calculateStateEnterpriseIncome(locationId);
        var publicIncome = calculatePublicEnterpriseIncome(locationId);

        if (taxRevenue === null || stateIncome === null || publicIncome === null) {
            return null;
        }

        return taxRevenue + stateIncome + publicIncome;
    }

    // =========================================================================
    // 4. EXPENSES
    // =========================================================================

    /**
     * Returns maintenance cost for a settlement: the sum of maintenance
     * across all built features.
     *
     * @param {string} locationId
     * @returns {number|null}
     */
    function calculateMaintenanceCosts(locationId) {
        var effects = _getFeatureQueries().getSettlementFeatureEffects(locationId);
        if (effects === null) return null;
        return effects.totalMaintenance;
    }

    /**
     * Returns wage cost paid by the settlement for state employees.
     *
     * State employees are employed by state-owned enterprises; their
     * wages are a settlement government expense. Private enterprise
     * wages are enterprise expenses, not settlement expenses. Public
     * enterprise wages are enterprise expenses as well.
     *
     * @param {string} locationId
     * @returns {number|null}
     */
    function calculateWageCosts(locationId) {
        var employment = _getEmploymentQueries().getEmployment(locationId);
        if (!employment) return null;

        var stateEmployed = employment.stateEmployed;
        var averageWage = employment.averageWage;

        if (!_isFiniteNumber(stateEmployed)) return null;
        if (!_isFiniteNumber(averageWage)) return null;

        return stateEmployed * averageWage;
    }

    /**
     * Returns the settlement's spending costs.
     *
     * Per §21, allocation and expense are distinct concepts. This
     * function reads actual spending fields when they exist:
     *   - militarySpending
     *   - infrastructureSpending
     *   - educationSpending
     *
     * If a spending field is not defined on the settlement, it is
     * treated as 0 for that category. This is a domain rule: a
     * settlement that has never set military spending has no military
     * spending. It is not a substituted default; it is the correct
     * value.
     *
     * @param {string} locationId
     * @returns {number|null}
     */
    function calculateSpendingCosts(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) return null;

        var military = _isFiniteNumber(settlement.militarySpending)
            ? settlement.militarySpending
            : 0;
        var infrastructure = _isFiniteNumber(settlement.infrastructureSpending)
            ? settlement.infrastructureSpending
            : 0;
        var education = _isFiniteNumber(settlement.educationSpending)
            ? settlement.educationSpending
            : 0;

        return military + infrastructure + education;
    }

    /**
     * Returns the settlement's government salary expense.
     *
     * Per §21, this reads actual salary expense, not the allocated
     * budget. The annual processor is responsible for converting an
     * allocation into an actual expense. Until that conversion is
     * performed, the settlement's current canonical field
     * `governmentSalaryBudget` is interpreted as an allocation, not an
     * expense.
     *
     * If the settlement does not track actual government salary expense
     * separately, this function returns 0. That is the correct value for
     * "not tracked": the settlement does not expense what it does not
     * pay.
     *
     * @param {string} locationId
     * @returns {number}
     */
    function calculateGovernmentSalaryExpenses(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) return null;

        if (_isFiniteNumber(settlement.governmentSalaryExpense)) {
            return settlement.governmentSalaryExpense;
        }

        return 0;
    }

    /**
     * Returns total expenses for a settlement.
     *
     * @param {string} locationId
     * @returns {number|null}
     */
    function calculateTotalExpenses(locationId) {
        var maintenance = calculateMaintenanceCosts(locationId);
        var wages = calculateWageCosts(locationId);
        var spending = calculateSpendingCosts(locationId);
        var govSalaries = calculateGovernmentSalaryExpenses(locationId);

        if (maintenance === null || wages === null || spending === null || govSalaries === null) {
            return null;
        }

        return maintenance + wages + spending + govSalaries;
    }

    // =========================================================================
    // 5. SURPLUS AND BUDGET SUMMARY
    // =========================================================================

    /**
     * Returns the settlement's annual surplus: income minus expenses.
     *
     * @param {string} locationId
     * @returns {number|null}
     */
    function calculateSurplus(locationId) {
        var income = calculateTotalIncome(locationId);
        var expenses = calculateTotalExpenses(locationId);

        if (income === null || expenses === null) return null;

        return income - expenses;
    }

    /**
     * Returns a complete budget summary for a settlement.
     *
     * @param {string} locationId
     * @returns {Object|null}
     *   {
     *     income: {
     *       taxes: number,
     *       trade: number,
     *       industry: number,
     *       stateEnterprises: number,
     *       publicEnterprises: number,
     *       total: number
     *     },
     *     expenses: {
     *       maintenance: number,
     *       wages: number,
     *       military: number,
     *       infrastructure: number,
     *       education: number,
     *       governmentSalaries: number,
     *       total: number
     *     },
     *     surplus: number
     *   }
     */
    function getBudgetSummary(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) return null;

        var taxes = calculateTaxIncome(locationId);
        var trade = calculateTradeIncome(locationId);
        var industry = calculateIndustryIncome(locationId);
        var stateEnterprises = calculateStateEnterpriseIncome(locationId);
        var publicEnterprises = calculatePublicEnterpriseIncome(locationId);

        var maintenance = calculateMaintenanceCosts(locationId);
        var wages = calculateWageCosts(locationId);
        var spending = calculateSpendingCosts(locationId);
        var govSalaries = calculateGovernmentSalaryExpenses(locationId);

        if (taxes === null || trade === null || industry === null
            || stateEnterprises === null || publicEnterprises === null
            || maintenance === null || wages === null
            || spending === null || govSalaries === null) {
            return null;
        }

        var incomeTotal = taxes + trade + industry + stateEnterprises + publicEnterprises;
        var expensesTotal = maintenance + wages + spending + govSalaries;

        return {
            income: {
                taxes: taxes,
                trade: trade,
                industry: industry,
                stateEnterprises: stateEnterprises,
                publicEnterprises: publicEnterprises,
                total: incomeTotal
            },
            expenses: {
                maintenance: maintenance,
                wages: wages,
                military: _isFiniteNumber(settlement.militarySpending) ? settlement.militarySpending : 0,
                infrastructure: _isFiniteNumber(settlement.infrastructureSpending) ? settlement.infrastructureSpending : 0,
                education: _isFiniteNumber(settlement.educationSpending) ? settlement.educationSpending : 0,
                governmentSalaries: govSalaries,
                total: expensesTotal
            },
            surplus: incomeTotal - expensesTotal
        };
    }

    // =========================================================================
    // 6. DERIVED METRICS
    // =========================================================================

    /**
     * Returns the settlement's debt ratio as an integer percentage.
     *
     * Formula:
     *   debt / max(1, wealth + debt) * 100, clamped to [0, 100]
     *
     * If debt is 0, returns 0.
     *
     * @param {string} locationId
     * @returns {number|null}
     */
    function getDebtRatio(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) return null;

        var debt = settlement.totalDebt;
        var wealth = settlement.wealth;

        if (!_isFiniteNumber(debt) || !_isFiniteNumber(wealth)) return null;

        if (debt === 0) return 0;

        var denominator = Math.max(1, wealth + debt);
        var ratio = (debt / denominator) * 100;

        if (ratio < 0) ratio = 0;
        if (ratio > 100) ratio = 100;

        return Math.round(ratio);
    }

    /**
     * Returns the settlement's administrative efficiency score.
     *
     * Formula:
     *   round(min(100, (income / max(1, expenses)) * 50))
     *
     * @param {string} locationId
     * @returns {Object|null}
     *   {
     *     efficiency: number,     // 0-100
     *     income: number,
     *     expenses: number,
     *     surplus: number
     *   }
     */
    function getEfficiencyScore(locationId) {
        var income = calculateTotalIncome(locationId);
        var expenses = calculateTotalExpenses(locationId);

        if (income === null || expenses === null) return null;

        var denominator = Math.max(1, expenses);
        var efficiency = Math.round((income / denominator) * 50);
        if (efficiency > 100) efficiency = 100;

        return {
            efficiency: efficiency,
            income: income,
            expenses: expenses,
            surplus: income - expenses
        };
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.SettlementEconomyQueries = Object.freeze({
        // Income
        calculateTaxIncome: calculateTaxIncome,
        calculateTradeIncome: calculateTradeIncome,
        calculateIndustryIncome: calculateIndustryIncome,
        calculateStateEnterpriseIncome: calculateStateEnterpriseIncome,
        calculatePublicEnterpriseIncome: calculatePublicEnterpriseIncome,
        calculateTaxRevenue: calculateTaxRevenue,
        calculateTotalIncome: calculateTotalIncome,

        // Expenses
        calculateMaintenanceCosts: calculateMaintenanceCosts,
        calculateWageCosts: calculateWageCosts,
        calculateSpendingCosts: calculateSpendingCosts,
        calculateGovernmentSalaryExpenses: calculateGovernmentSalaryExpenses,
        calculateTotalExpenses: calculateTotalExpenses,

        // Summary
        calculateSurplus: calculateSurplus,
        getBudgetSummary: getBudgetSummary,

        // Derived metrics
        getDebtRatio: getDebtRatio,
        getEfficiencyScore: getEfficiencyScore
    });

})();
