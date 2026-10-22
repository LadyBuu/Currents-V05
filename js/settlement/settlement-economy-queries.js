/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT ECONOMY QUERIES
 * js/settlement/settlement-economy-queries.js
 * =============================================================================
 *
 * ECONOMY QUERIES.
 *
 * This file provides read-only calculations for settlement income,
 * expenses, surplus, and derived financial metrics.
 *
 * It is a query module. It reads through the owning query modules and
 * does not mutate, persist, or display UI.
 *
 * Location hierarchy:
 *   Location hierarchy is owned by LocationQueries. This file previously
 *   called LocationState.getAllSubLocationIds, which does not exist on
 *   LocationState. Corrected to LocationQueries.getAllSubLocationIds.
 *
 * DEPENDENCIES (REQUIRED at load):
 *   - SettlementQueries
 *   - SettlementFeatureQueries
 *   - SettlementEmploymentQueries
 *   - SettlementFinanceDefinitions
 *   - SettlementRankRules
 *   - IndustryQueries
 *   - LocationQueries
 *   - getLocationPopulationCount
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCIES
    // =========================================================================

    function _getSettlementQueries()        { return window.SettlementQueries; }
    function _getFeatureQueries()           { return window.SettlementFeatureQueries; }
    function _getFeatureDefinitions()       { return window.SettlementFeatureDefinitions; }
    function _getEmploymentQueries()        { return window.SettlementEmploymentQueries; }
    function _getFinanceDefinitions()       { return window.SettlementFinanceDefinitions; }
    function _getRankRules()                { return window.SettlementRankRules; }
    function _getIndustryQueries()          { return window.IndustryQueries; }
    function _getPopulationAccessor()       { return window.getLocationPopulationCount; }
    function _getLocationQueries()          { return window.LocationQueries; }

    // =========================================================================
    // 2. HELPERS
    // =========================================================================

    function _isFiniteNumber(value) {
        return typeof value === 'number' && isFinite(value);
    }

    function _getLocationIdsForSettlement(locationId) {
        var ids = _getLocationQueries().getAllSubLocationIds(locationId);
        if (ids && ids.length > 0) return ids;
        return [locationId];
    }

    function _getRank(locationId) {
        return _getSettlementQueries().getCurrentRank(locationId);
    }

    // =========================================================================
    // 3. INCOME
    // =========================================================================

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

    function calculateTaxRevenue(locationId) {
        var tax = calculateTaxIncome(locationId);
        var trade = calculateTradeIncome(locationId);
        var industry = calculateIndustryIncome(locationId);

        if (tax === null || trade === null || industry === null) return null;

        return tax + trade + industry;
    }

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

    function calculateMaintenanceCosts(locationId) {
        var effects = _getFeatureQueries().getSettlementFeatureEffects(locationId);
        if (effects === null) return null;
        return effects.totalMaintenance;
    }

    function calculateWageCosts(locationId) {
        var employment = _getEmploymentQueries().getEmployment(locationId);
        if (!employment) return null;

        var stateEmployed = employment.stateEmployed;
        var averageWage = employment.averageWage;

        if (!_isFiniteNumber(stateEmployed)) return null;
        if (!_isFiniteNumber(averageWage)) return null;

        return stateEmployed * averageWage;
    }

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

    function calculateGovernmentSalaryExpenses(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) return null;

        if (_isFiniteNumber(settlement.governmentSalaryExpense)) {
            return settlement.governmentSalaryExpense;
        }

        return 0;
    }

    function calculateTotalExpenses(locationId) {
        var maintenance = calculateMaintenanceCosts(locationId);
        var wages = calculateWageCosts(locationId);
        var spending = calculateSpendingCosts(locationId);
        var govSalaries = calculateGovernmentSalaryExpenses(locationId);

        if (maintenance === null || wages === null ||
            spending === null || govSalaries === null) {
            return null;
        }

        return maintenance + wages + spending + govSalaries;
    }

    // =========================================================================
    // 5. SURPLUS AND BUDGET SUMMARY
    // =========================================================================

    function calculateSurplus(locationId) {
        var income = calculateTotalIncome(locationId);
        var expenses = calculateTotalExpenses(locationId);

        if (income === null || expenses === null) return null;

        return income - expenses;
    }

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
