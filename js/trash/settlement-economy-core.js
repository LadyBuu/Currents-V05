/**
 * =============================================================================
 * SETTLEMENT ECONOMY CORE - Income, expenses, surplus, and reporting js/settlement/settlement-economy-core.js
 * =============================================================================
 * 
 * This file contains business logic for:
 * - Income calculation (taxes, trade, industry, state enterprises, public enterprises)
 * - Expense calculation (maintenance, wages, spending, government salaries)
 * - Surplus calculation
 * - Financial reporting
 * - Efficiency scoring
 * - Debt ratio
 * 
 * DEPENDENCIES:
 *   - settlement-state.js (SettlementState)
 *   - accessors.js (getPlaceById, getCurrentYear)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _processingEconomy = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getPlaces() {
        return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
    }

    function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

    function _getLocationPopulationCount(locationId) {
        if (typeof window.getLocationPopulationCount === 'function') {
            return window.getLocationPopulationCount(locationId);
        }
        return 0;
    }

    function _getRoleById(id) {
        if (typeof window.getRoleById === 'function') {
            return window.getRoleById(id);
        }
        return null;
    }

    function _getIndustryQueries() {
        return typeof window.IndustryQueries !== 'undefined' ? window.IndustryQueries : null;
    }

    function _getGovernmentState() {
        return typeof window.GovernmentState !== 'undefined' ? window.GovernmentState : null;
    }

    function _getSettlementData(locationId) {
        return SettlementState.getSettlementData(locationId);
    }

    function _getSettlementFeatures(locationId) {
        return SettlementState.getSettlementFeatures(locationId);
    }

    function _getSettlementEmployment(locationId) {
        return SettlementState.getSettlementEmployment(locationId);
    }

    function _getStateEnterpriseIds(locationId) {
        return SettlementState.getStateEnterpriseIds(locationId);
    }

    function _getPublicEnterpriseIds(locationId) {
        return SettlementState.getPublicEnterpriseIds(locationId);
    }

    function _getSettlementRanks() {
        return SettlementState._getAllRanks();
    }

    // =========================================================================
    // 3. INCOME CALCULATIONS
    // =========================================================================

    function calculateTaxIncome(locationId) {
        if (_processingEconomy) {
            return 0;
        }
        _processingEconomy = true;

        try {
            var data = _getSettlementData(locationId);
            if (!data) return 0;

            var population = _getLocationPopulationCount(locationId);
            var ranks = _getSettlementRanks();
            var rank = ranks.find(function(r) { return r.id === data.rankId; });
            var baseTax = rank ? rank.baseTax || 5 : 5;

            var taxRate = (data.taxRate || 10) / 100;
            var taxIncome = baseTax * Math.max(1, population / 100) * taxRate;

            return Math.floor(taxIncome);

        } finally {
            _processingEconomy = false;
        }
    }

    function calculateTradeIncome(locationId) {
        if (_processingEconomy) {
            return 0;
        }
        _processingEconomy = true;

        try {
            var data = _getSettlementData(locationId);
            if (!data) return 0;

            var population = _getLocationPopulationCount(locationId);
            var taxIncome = calculateTaxIncome(locationId);
            var tariff = (data.tradeTariff || 5) / 100;

            return Math.floor(taxIncome * 0.3 * (1 + tariff));

        } finally {
            _processingEconomy = false;
        }
    }

    function calculateIndustryIncome(locationId) {
        if (_processingEconomy) {
            return 0;
        }
        _processingEconomy = true;

        try {
            var govState = _getGovernmentState();
            if (govState && typeof govState.getIndustryTaxRevenue === 'function') {
                return govState.getIndustryTaxRevenue(locationId);
            }

            var queries = _getIndustryQueries();
            if (!queries) return 0;

            var enterprises = queries.getLocationEnterprisesSummary(locationId);
            if (!enterprises || enterprises.length === 0) return 0;

            var data = _getSettlementData(locationId);
            var taxRate = (data ? data.industryTaxRate || 8 : 8) / 100;

            var totalTax = 0;
            for (var i = 0; i < enterprises.length; i++) {
                if (enterprises[i].annualProfit > 0) {
                    totalTax += Math.floor(enterprises[i].annualProfit * taxRate);
                }
            }

            return totalTax;

        } finally {
            _processingEconomy = false;
        }
    }

    function calculateStateEnterpriseIncome(locationId) {
        if (_processingEconomy) {
            return 0;
        }
        _processingEconomy = true;

        try {
            var queries = _getIndustryQueries();
            if (!queries) return 0;

            var stateIds = _getStateEnterpriseIds(locationId);
            if (!stateIds || stateIds.length === 0) return 0;

            var totalProfit = 0;
            for (var i = 0; i < stateIds.length; i++) {
                var summary = queries.getEnterpriseSummary(stateIds[i]);
                if (summary && summary.annualProfit > 0) {
                    totalProfit += summary.annualProfit;
                }
            }

            return totalProfit;

        } finally {
            _processingEconomy = false;
        }
    }

    function calculatePublicEnterpriseIncome(locationId) {
        if (_processingEconomy) {
            return 0;
        }
        _processingEconomy = true;

        try {
            var queries = _getIndustryQueries();
            if (!queries) return 0;

            var publicIds = _getPublicEnterpriseIds(locationId);
            if (!publicIds || publicIds.length === 0) return 0;

            var totalProfit = 0;
            for (var i = 0; i < publicIds.length; i++) {
                var summary = queries.getEnterpriseSummary(publicIds[i]);
                if (summary && summary.annualProfit > 0) {
                    totalProfit += summary.annualProfit;
                }
            }

            return totalProfit;

        } finally {
            _processingEconomy = false;
        }
    }

    function calculateTotalIncome(locationId) {
        if (_processingEconomy) {
            return 0;
        }
        _processingEconomy = true;

        try {
            var taxIncome = calculateTaxIncome(locationId);
            var tradeIncome = calculateTradeIncome(locationId);
            var industryIncome = calculateIndustryIncome(locationId);
            var stateIncome = calculateStateEnterpriseIncome(locationId);
            var publicIncome = calculatePublicEnterpriseIncome(locationId);

            return taxIncome + tradeIncome + industryIncome + stateIncome + publicIncome;

        } finally {
            _processingEconomy = false;
        }
    }

    // =========================================================================
    // 4. EXPENSE CALCULATIONS
    // =========================================================================

    function calculateMaintenanceCosts(locationId) {
        if (_processingEconomy) {
            return 0;
        }
        _processingEconomy = true;

        try {
            var features = _getSettlementFeatures(locationId);
            var total = 0;

            for (var i = 0; i < features.length; i++) {
                if (features[i].maintenance) {
                    total += features[i].maintenance;
                }
            }

            return total;

        } finally {
            _processingEconomy = false;
        }
    }

    function calculateWageCosts(locationId) {
        if (_processingEconomy) {
            return 0;
        }
        _processingEconomy = true;

        try {
            var employment = _getSettlementEmployment(locationId);
            if (!employment) return 0;

            var stateEmployed = employment.stateEmployed || 0;
            var averageWage = employment.averageWage || 5;

            return stateEmployed * averageWage;

        } finally {
            _processingEconomy = false;
        }
    }

    function calculateSpendingCosts(locationId) {
        if (_processingEconomy) {
            return 0;
        }
        _processingEconomy = true;

        try {
            var data = _getSettlementData(locationId);
            if (!data) return 0;

            var military = data.militarySpending || 0;
            var infrastructure = data.infrastructureSpending || 0;
            var education = data.educationSpending || 0;

            return military + infrastructure + education;

        } finally {
            _processingEconomy = false;
        }
    }

    function calculateGovernmentSalaryExpenses(locationId) {
        if (_processingEconomy) {
            return 0;
        }
        _processingEconomy = true;

        try {
            var data = _getSettlementData(locationId);
            if (!data) return 0;

            return data.governmentSalaryBudget || 0;

        } finally {
            _processingEconomy = false;
        }
    }

    function calculateTotalExpenses(locationId) {
        if (_processingEconomy) {
            return 0;
        }
        _processingEconomy = true;

        try {
            var maintenance = calculateMaintenanceCosts(locationId);
            var wages = calculateWageCosts(locationId);
            var spending = calculateSpendingCosts(locationId);
            var govSalaries = calculateGovernmentSalaryExpenses(locationId);

            return maintenance + wages + spending + govSalaries;

        } finally {
            _processingEconomy = false;
        }
    }

    // =========================================================================
    // 5. SURPLUS & TAX REVENUE
    // =========================================================================

    function calculateSurplus(locationId) {
        if (_processingEconomy) {
            return 0;
        }
        _processingEconomy = true;

        try {
            var income = calculateTotalIncome(locationId);
            var expenses = calculateTotalExpenses(locationId);

            return income - expenses;

        } finally {
            _processingEconomy = false;
        }
    }

    function calculateTaxRevenue(locationId) {
        if (_processingEconomy) {
            return 0;
        }
        _processingEconomy = true;

        try {
            return calculateTaxIncome(locationId) + calculateTradeIncome(locationId) +
                   calculateIndustryIncome(locationId) + calculateStateEnterpriseIncome(locationId) +
                   calculatePublicEnterpriseIncome(locationId);

        } finally {
            _processingEconomy = false;
        }
    }

    // =========================================================================
    // 6. EMPLOYMENT CALCULATION
    // =========================================================================

    function calculateEmployment(locationId) {
        if (_processingEconomy) {
            return {
                totalWorkers: 0,
                stateEmployed: 0,
                privateEmployed: 0,
                unemployed: 0,
                averageWage: 0,
                employmentRate: 0
            };
        }
        _processingEconomy = true;

        try {
            var data = _getSettlementData(locationId);
            if (!data) {
                return {
                    totalWorkers: 0,
                    stateEmployed: 0,
                    privateEmployed: 0,
                    unemployed: 0,
                    averageWage: 0,
                    employmentRate: 0
                };
            }

            var population = _getLocationPopulationCount(locationId);
            var adults = Math.max(0, Math.floor(population * 0.6));

            var privateEmployed = 0;
            var stateEmployed = 0;
            var publicEmployed = 0;
            var totalWages = 0;

            var queries = _getIndustryQueries();
            if (queries) {
                var enterprises = queries.getLocationEnterprisesSummary(locationId);
                for (var i = 0; i < enterprises.length; i++) {
                    var e = enterprises[i];
                    if (e.workerCount) {
                        if (e.ownerType === 'state') {
                            stateEmployed += e.workerCount;
                        } else if (e.ownerType === 'settlement' || e.ownershipType === 'public') {
                            publicEmployed += e.workerCount;
                        } else {
                            privateEmployed += e.workerCount;
                        }
                        totalWages += (e.workerCount * (e.wages || 8));
                    }
                }
            }

            var totalEmployed = privateEmployed + stateEmployed + publicEmployed;
            var unemployed = Math.max(0, adults - totalEmployed);
            var averageWage = totalEmployed > 0 ? Math.floor(totalWages / totalEmployed) : 0;

            var employment = {
                totalWorkers: totalEmployed,
                stateEmployed: stateEmployed,
                privateEmployed: privateEmployed,
                unemployed: unemployed,
                averageWage: averageWage,
                employmentRate: adults > 0 ? Math.round((totalEmployed / adults) * 100) : 0
            };

            return employment;

        } finally {
            _processingEconomy = false;
        }
    }

    // =========================================================================
    // 7. CRIME RATE CALCULATION
    // =========================================================================

    function calculateCrimeRate(locationId) {
        if (_processingEconomy) {
            return 0.05;
        }
        _processingEconomy = true;

        try {
            var data = _getSettlementData(locationId);
            if (!data) return 0.05;

            var crimeRate = data.crimeRate || 0.05;

            // Prosperity effects
            if (data.prosperity < 30) crimeRate += 0.1;
            else if (data.prosperity < 50) crimeRate += 0.05;
            else if (data.prosperity > 70) crimeRate -= 0.03;

            // Tax rate effects
            var taxRate = data.taxRate || 10;
            if (taxRate > 20) crimeRate += 0.1;
            else if (taxRate > 15) crimeRate += 0.05;

            // Watch effects
            if (data.hasWatch && data.watchSize > 0) {
                var watchEffect = Math.min(0.3, data.watchSize / 100);
                crimeRate -= watchEffect;
            }

            // Feature crime reduction
            var features = _getSettlementFeatures(locationId);
            for (var i = 0; i < features.length; i++) {
                if (features[i].crimeReduction) crimeRate -= features[i].crimeReduction;
            }

            // Unemployment effects
            var employment = _getSettlementEmployment(locationId);
            if (employment && employment.unemployed > 0) {
                var unemploymentRate = employment.unemployed / Math.max(1, employment.totalWorkers + employment.unemployed);
                crimeRate += unemploymentRate * 0.1;
            }

            // Military spending effects
            var militarySpend = data.militarySpending || 0;
            if (militarySpend > 50) crimeRate -= 0.1;
            else if (militarySpend > 20) crimeRate -= 0.05;

            // Justice severity effects
            var justiceFactors = {
                lenient: 0.3,
                medium: 0.5,
                harsh: 0.7,
                extreme: 0.9
            };
            var justiceFactor = justiceFactors[data.justiceSeverity] || 0.5;
            crimeRate = crimeRate * (1 - justiceFactor * 0.3);

            // Religious unity effect on crime
            var religiousUnity = data.religiousUnity || 50;
            if (religiousUnity > 80) {
                crimeRate -= 0.02;
            } else if (religiousUnity < 30) {
                crimeRate += 0.03;
            }

            // Places of worship effect
            var placesOfWorship = data.placesOfWorship || [];
            if (placesOfWorship && placesOfWorship.length > 0) {
                crimeRate -= Math.min(0.03, placesOfWorship.length * 0.005);
            }

            return Math.min(0.8, Math.max(0.01, crimeRate));

        } finally {
            _processingEconomy = false;
        }
    }

    // =========================================================================
    // 8. SPECIALIZATION BONUSES
    // =========================================================================

    function calculateSpecializationIncomeBonus(locationId) {
        if (_processingEconomy) {
            return 1.0;
        }
        _processingEconomy = true;

        try {
            var data = _getSettlementData(locationId);
            if (!data) return 1.0;

            var roleId = data.specializationRoleId;
            if (!roleId) return 1.0;

            var role = _getRoleById(roleId);
            if (!role) return 1.0;

            var specializations = role.specializations || [];
            if (specializations.length === 0) return 1.0;

            var bonus = 1.0;
            var specLower = specializations.map(function(s) { return s.toLowerCase(); });

            if (specLower.some(function(s) { return s.includes('trade') || s.includes('merchant') || s.includes('commerce'); })) {
                bonus *= 1.8;
            } else if (specLower.some(function(s) { return s.includes('mining') || s.includes('ore') || s.includes('metal'); })) {
                bonus *= 1.5;
            } else if (specLower.some(function(s) { return s.includes('port') || s.includes('harbor') || s.includes('ship'); })) {
                bonus *= 1.6;
            } else if (specLower.some(function(s) { return s.includes('craft') || s.includes('artisan') || s.includes('smith'); })) {
                bonus *= 1.3;
            } else if (specLower.some(function(s) { return s.includes('farming') || s.includes('agriculture') || s.includes('grain'); })) {
                bonus *= 1.2;
            } else if (specLower.some(function(s) { return s.includes('industrial') || s.includes('factory') || s.includes('mill'); })) {
                bonus *= 1.7;
            }

            return Math.max(0.5, Math.min(3.0, bonus));

        } finally {
            _processingEconomy = false;
        }
    }

    function calculateSpecializationProsperityBonus(locationId) {
        if (_processingEconomy) {
            return 0;
        }
        _processingEconomy = true;

        try {
            var data = _getSettlementData(locationId);
            if (!data) return 0;

            var roleId = data.specializationRoleId;
            if (!roleId) return 0;

            var role = _getRoleById(roleId);
            if (!role) return 0;

            var specializations = role.specializations || [];
            if (specializations.length === 0) return 0;

            var bonus = 0;
            var specLower = specializations.map(function(s) { return s.toLowerCase(); });

            if (specLower.some(function(s) { return s.includes('trade') || s.includes('commerce'); })) bonus += 8;
            if (specLower.some(function(s) { return s.includes('religious') || s.includes('temple'); })) bonus += 7;
            if (specLower.some(function(s) { return s.includes('craft') || s.includes('artisan'); })) bonus += 6;
            if (specLower.some(function(s) { return s.includes('mining'); })) bonus += 10;
            if (specLower.some(function(s) { return s.includes('port'); })) bonus += 8;
            if (specLower.some(function(s) { return s.includes('farming'); })) bonus += 5;
            if (specLower.some(function(s) { return s.includes('industrial') || s.includes('factory'); })) bonus += 12;

            return bonus;

        } finally {
            _processingEconomy = false;
        }
    }

    // =========================================================================
    // 9. FINANCIAL REPORTING
    // =========================================================================

    function getFinancialReport(locationId, years) {
        if (_processingEconomy) {
            return null;
        }
        _processingEconomy = true;

        try {
            years = years || 5;
            var currentYear = _getCurrentYear();
            var reports = [];

            for (var i = 0; i < years; i++) {
                var year = currentYear - i;
                reports.push({
                    year: year,
                    income: calculateTotalIncome(locationId),
                    expenses: calculateTotalExpenses(locationId),
                    surplus: calculateSurplus(locationId)
                });
            }

            return {
                locationId: locationId,
                reports: reports,
                summary: {
                    averageIncome: Math.round(reports.reduce(function(sum, r) { return sum + r.income; }, 0) / reports.length),
                    averageExpenses: Math.round(reports.reduce(function(sum, r) { return sum + r.expenses; }, 0) / reports.length),
                    averageSurplus: Math.round(reports.reduce(function(sum, r) { return sum + r.surplus; }, 0) / reports.length)
                }
            };

        } finally {
            _processingEconomy = false;
        }
    }

    function getEfficiencyScore(locationId) {
        if (_processingEconomy) {
            return null;
        }
        _processingEconomy = true;

        try {
            var income = calculateTotalIncome(locationId);
            var expenses = calculateTotalExpenses(locationId);
            var population = _getLocationPopulationCount(locationId);

            if (population === 0) return { efficiency: 0, rating: 'No population' };

            var efficiency = Math.min(100, Math.round((income / Math.max(1, expenses)) * 50));
            var rating = efficiency >= 80 ? 'Excellent' :
                        efficiency >= 60 ? 'Good' :
                        efficiency >= 40 ? 'Average' :
                        efficiency >= 20 ? 'Poor' : 'Critical';

            return {
                efficiency: efficiency,
                rating: rating,
                income: income,
                expenses: expenses,
                surplus: income - expenses,
                population: population,
                incomePerCapita: Math.round(income / population)
            };

        } finally {
            _processingEconomy = false;
        }
    }

    function getDebtRatio(locationId) {
        if (_processingEconomy) {
            return 0;
        }
        _processingEconomy = true;

        try {
            var data = _getSettlementData(locationId);
            if (!data) return 0;

            var debt = data.totalDebt || 0;
            var wealth = data.wealth || 0;

            if (debt === 0) return 0;
            if (wealth === 0) return 100;

            return Math.min(100, Math.round((debt / Math.abs(wealth)) * 100));

        } finally {
            _processingEconomy = false;
        }
    }

    // =========================================================================
    // 10. LITERACY STATS
    // =========================================================================

    function getSettlementLiteracyStats(locationId) {
        if (_processingEconomy) {
            return {
                locationId: locationId,
                totalPopulation: 0,
                literateCount: 0,
                literacyRate: 0,
                educationLevels: { illiterate: 0, basic: 0, literate: 0, educated: 0, scholar: 0 },
                hasSchools: false
            };
        }
        _processingEconomy = true;

        try {
            var emptyResult = {
                locationId: locationId,
                totalPopulation: 0,
                literateCount: 0,
                literacyRate: 0,
                educationLevels: { illiterate: 0, basic: 0, literate: 0, educated: 0, scholar: 0 },
                hasSchools: false
            };

            if (!locationId) return emptyResult;

            var characters = typeof window.getCharacters === 'function' ? window.getCharacters() : [];
            var locationIds = typeof LocationState !== 'undefined' && LocationState.getAllSubLocationIds ?
                LocationState.getAllSubLocationIds(locationId) : [locationId];
            var locationIdSet = new Set(locationIds);

            var displayNameToId = {};
            var places = _getPlaces();
            for (var i = 0; i < places.length; i++) {
                displayNameToId[places[i].displayName] = places[i].id;
            }

            var total = 0;
            var literate = 0;
            var educationLevels = {
                illiterate: 0,
                basic: 0,
                literate: 0,
                educated: 0,
                scholar: 0
            };

            var hasLiteracySystem = typeof window.isLiterate === 'function' &&
                                   typeof window.getEducationLevel === 'function';

            for (var i = 0; i < characters.length; i++) {
                var char = characters[i];
                if (char.isDeceased) continue;

                var charLocation = typeof window.getCurrentLocation === 'function' ?
                    window.getCurrentLocation(char) : 'Unknown';
                var charLocationId = displayNameToId[charLocation];

                if (charLocationId && locationIdSet.has(charLocationId)) {
                    total++;

                    if (hasLiteracySystem) {
                        if (window.isLiterate(char.id)) {
                            literate++;
                        }
                        var eduLevel = window.getEducationLevel(char.id);
                        if (eduLevel && educationLevels[eduLevel.id] !== undefined) {
                            educationLevels[eduLevel.id]++;
                        }
                    } else {
                        var literacyLevel = (char.subjectProgress && char.subjectProgress.literacy) ?
                            char.subjectProgress.literacy.level || 0 : 0;
                        if (literacyLevel >= 30) literate++;

                        if (literacyLevel >= 70) educationLevels.scholar++;
                        else if (literacyLevel >= 50) educationLevels.educated++;
                        else if (literacyLevel >= 30) educationLevels.literate++;
                        else if (literacyLevel >= 10) educationLevels.basic++;
                        else educationLevels.illiterate++;
                    }
                }
            }

            var hasSchools = false;
            var features = _getSettlementFeatures(locationId);
            for (var i = 0; i < features.length; i++) {
                if (features[i].id === 'school' || features[i].id === 'library') {
                    hasSchools = true;
                    break;
                }
            }

            return {
                locationId: locationId,
                totalPopulation: total,
                literateCount: literate,
                literacyRate: total > 0 ? Math.round((literate / total) * 100) : 0,
                educationLevels: educationLevels,
                hasSchools: hasSchools
            };

        } finally {
            _processingEconomy = false;
        }
    }

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.SettlementEconomy = {
        // Income
        calculateTaxIncome: calculateTaxIncome,
        calculateTradeIncome: calculateTradeIncome,
        calculateIndustryIncome: calculateIndustryIncome,
        calculateStateEnterpriseIncome: calculateStateEnterpriseIncome,
        calculatePublicEnterpriseIncome: calculatePublicEnterpriseIncome,
        calculateTotalIncome: calculateTotalIncome,

        // Expenses
        calculateMaintenanceCosts: calculateMaintenanceCosts,
        calculateWageCosts: calculateWageCosts,
        calculateSpendingCosts: calculateSpendingCosts,
        calculateGovernmentSalaryExpenses: calculateGovernmentSalaryExpenses,
        calculateTotalExpenses: calculateTotalExpenses,

        // Surplus & Tax
        calculateSurplus: calculateSurplus,
        calculateTaxRevenue: calculateTaxRevenue,

        // Employment
        calculateEmployment: calculateEmployment,

        // Crime
        calculateCrimeRate: calculateCrimeRate,

        // Specialization
        calculateSpecializationIncomeBonus: calculateSpecializationIncomeBonus,
        calculateSpecializationProsperityBonus: calculateSpecializationProsperityBonus,

        // Literacy
        getSettlementLiteracyStats: getSettlementLiteracyStats,

        // Reporting
        getFinancialReport: getFinancialReport,
        getEfficiencyScore: getEfficiencyScore,
        getDebtRatio: getDebtRatio
    };

})();
