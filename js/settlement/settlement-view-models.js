/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT VIEW MODELS
 * js/settlement/settlement-view-models.js
 * =============================================================================
 *
 * (Header preserved — see current file. Only the time-dependency block
 * below changed.)
 *
 * Time dependency:
 *   window.getCurrentYear, defined in js/core/time.js. The deprecated
 *   window.getCurrentYearSafe alias is NOT used here.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    function _getSettlementQueries()        { return window.SettlementQueries; }
    function _getPlaceQueries()             { return window.PlaceQueries; }
    function _getRankRules()                { return window.SettlementRankRules; }
    function _getFeatureQueries()           { return window.SettlementFeatureQueries; }
    function _getEconomyQueries()           { return window.SettlementEconomyQueries; }
    function _getProsperityQueries()        { return window.SettlementProsperityQueries; }
    function _getCrimeQueries()             { return window.SettlementCrimeQueries; }
    function _getEmploymentQueries()        { return window.SettlementEmploymentQueries; }
    function _getLawQueries()               { return window.SettlementLawQueries; }
    function _getReligionQueries()          { return window.SettlementReligionQueries; }
    function _getFiscalDefinitions()        { return window.SettlementFiscalDefinitions; }
    function _getProsperityDefinitions()    { return window.SettlementProsperityDefinitions; }
    function _getGovernmentDefinitions()    { return window.SettlementGovernmentDefinitions; }
    function _getPopulationAccessor()       { return window.getLocationPopulationCount; }

    function _isFiniteNumber(value) {
        return typeof value === 'number' && isFinite(value);
    }

    function _placeName(locationId) {
        if (locationId === null || locationId === undefined) return null;
        var place = _getPlaceQueries().getPlaceById(locationId);
        return place ? place.displayName : null;
    }

    function _rankName(rankId) {
        if (!rankId) return null;
        var rank = _getRankRules().getRankById(rankId);
        return rank ? rank.name : null;
    }

    function _governmentName(governmentTypeId) {
        if (!governmentTypeId) return null;
        var types = _getGovernmentDefinitions().GOVERNMENT_TYPES;
        for (var i = 0; i < types.length; i++) {
            if (types[i].id === governmentTypeId) return types[i].name;
        }
        return null;
    }

    function _justiceSeverityName(severityId) {
        if (!severityId) return null;
        var severities = _getGovernmentDefinitions().JUSTICE_SEVERITIES;
        for (var i = 0; i < severities.length; i++) {
            if (severities[i].id === severityId) return severities[i].name;
        }
        return null;
    }

    function _currentYear() {
        if (typeof window.getCurrentYear !== 'function') {
            throw new Error(
                'settlement-view-models.js requires time.js (getCurrentYear).'
            );
        }
        return window.getCurrentYear();
    }

    function buildSettlementSummary(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) return null;

        var population = _getPopulationAccessor()(locationId);
        var populationValue = _isFiniteNumber(population) ? population : null;

        var rank = _getRankRules().getRankById(settlement.rankId);
        var currentRank = rank
            ? { id: rank.id, name: rank.name, order: rank.order }
            : null;

        var prosperity = _getProsperityQueries().getProsperity(locationId);
        var prosperityView = prosperity
            ? {
                value: prosperity.value,
                base: prosperity.base,
                band: prosperity.band,
                modifiers: prosperity.modifiers
            }
            : null;

        var crimeRate = _getCrimeQueries().getCrimeRateValue(locationId);
        var crimeView = _isFiniteNumber(crimeRate)
            ? { value: crimeRate }
            : null;

        var employment = _getEmploymentQueries().getEmployment(locationId);

        var dominantReligion = _getReligionQueries().getDominantReligion(locationId);
        var unity = _getReligionQueries().getReligiousUnity(locationId);
        var placesCount = _getReligionQueries().getActivePlaceOfWorshipCount(locationId);

        var lawCount = _getLawQueries().getCivilLawCount(locationId);

        return {
            locationId: locationId,
            name: _placeName(locationId),
            rank: currentRank,
            population: populationValue,
            wealth: _isFiniteNumber(settlement.wealth) ? settlement.wealth : null,
            totalDebt: _isFiniteNumber(settlement.totalDebt) ? settlement.totalDebt : null,
            taxRate: _isFiniteNumber(settlement.taxRate) ? settlement.taxRate : null,
            tradeTariff: _isFiniteNumber(settlement.tradeTariff) ? settlement.tradeTariff : null,
            industryTaxRate: _isFiniteNumber(settlement.industryTaxRate) ? settlement.industryTaxRate : null,
            governmentType: settlement.governmentType || null,
            governmentTypeName: _governmentName(settlement.governmentType),
            justiceSeverity: settlement.justiceSeverity || null,
            justiceSeverityName: _justiceSeverityName(settlement.justiceSeverity),
            hasWatch: settlement.hasWatch === true,
            watchSize: _isFiniteNumber(settlement.watchSize) ? settlement.watchSize : null,
            specializationRoleId: settlement.specializationRoleId || null,
            foundedYear: _isFiniteNumber(settlement.foundedYear) ? settlement.foundedYear : null,
            lastUpgraded: _isFiniteNumber(settlement.lastUpgraded) ? settlement.lastUpgraded : null,
            prosperity: prosperityView,
            crime: crimeView,
            employment: employment,
            dominantReligion: dominantReligion,
            religiousUnity: _isFiniteNumber(unity) ? unity : null,
            activePlaceOfWorshipCount: _isFiniteNumber(placesCount) ? placesCount : null,
            civilLawCount: _isFiniteNumber(lawCount) ? lawCount : null,
            featureCount: settlement.featureIds ? settlement.featureIds.length : 0
        };
    }

    function buildSettlementListRow(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) return null;

        var rank = _getRankRules().getRankById(settlement.rankId);
        var prosperity = _getProsperityQueries().getProsperity(locationId);
        var lawCount = _getLawQueries().getCivilLawCount(locationId);
        var placeCount = _getReligionQueries().getActivePlaceOfWorshipCount(locationId);

        var population = _getPopulationAccessor()(locationId);

        return {
            locationId: locationId,
            name: _placeName(locationId),
            rank: rank ? { id: rank.id, name: rank.name } : null,
            population: _isFiniteNumber(population) ? population : null,
            wealth: _isFiniteNumber(settlement.wealth) ? settlement.wealth : null,
            totalDebt: _isFiniteNumber(settlement.totalDebt) ? settlement.totalDebt : null,
            prosperity: prosperity
                ? { value: prosperity.value, band: prosperity.band }
                : null,
            civilLawCount: _isFiniteNumber(lawCount) ? lawCount : null,
            activePlaceOfWorshipCount: _isFiniteNumber(placeCount) ? placeCount : null
        };
    }

    function buildSettlementList() {
        var settlements = _getSettlementQueries().getAllSettlements();
        var result = [];
        for (var i = 0; i < settlements.length; i++) {
            var row = buildSettlementListRow(settlements[i].locationId);
            if (row) result.push(row);
        }
        return result;
    }

    function buildSettlementDetails(locationId) {
        var summary = buildSettlementSummary(locationId);
        if (!summary) return null;

        var settlement = _getSettlementQueries().getSettlementData(locationId);

        var budget = _getEconomyQueries().getBudgetSummary(locationId);
        var efficiency = _getEconomyQueries().getEfficiencyScore(locationId);
        var debtRatio = _getEconomyQueries().getDebtRatio(locationId);

        var featureIds = settlement.featureIds || [];
        var features = [];
        for (var i = 0; i < featureIds.length; i++) {
            var feature = _getFeatureQueries().getFeatureById(featureIds[i]);
            if (feature) features.push({ id: feature.id, name: feature.name });
        }

        return {
            summary: summary,
            budget: budget,
            efficiency: efficiency,
            debtRatio: _isFiniteNumber(debtRatio) ? debtRatio : null,
            features: features
        };
    }

    function buildBudgetView(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) return null;

        var budget = _getEconomyQueries().getBudgetSummary(locationId);
        if (!budget) return null;

        return {
            locationId: locationId,
            name: _placeName(locationId),
            income: budget.income,
            expenses: budget.expenses,
            surplus: budget.surplus,
            wealth: _isFiniteNumber(settlement.wealth) ? settlement.wealth : null,
            totalDebt: _isFiniteNumber(settlement.totalDebt) ? settlement.totalDebt : null
        };
    }

    function buildEfficiencyView(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) return null;

        var score = _getEconomyQueries().getEfficiencyScore(locationId);
        if (!score) return null;

        var bands = window.SettlementFinanceDefinitions.EFFICIENCY_BANDS;
        var band = null;
        for (var i = 0; i < bands.length; i++) {
            if (score.efficiency >= bands[i].min) {
                band = bands[i];
                break;
            }
        }

        var population = _getPopulationAccessor()(locationId);
        var incomePerCapita = null;
        if (_isFiniteNumber(population) && population > 0) {
            incomePerCapita = Math.round(score.income / population);
        }

        return {
            locationId: locationId,
            name: _placeName(locationId),
            efficiency: score.efficiency,
            band: band,
            income: score.income,
            expenses: score.expenses,
            surplus: score.surplus,
            population: _isFiniteNumber(population) ? population : null,
            incomePerCapita: incomePerCapita
        };
    }

    function buildDebtView(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) return null;

        var debtRatio = _getEconomyQueries().getDebtRatio(locationId);

        var debtRatioBands = window.SettlementFinanceDefinitions.DEBT_RATIO_BANDS;
        var debtRatioBand = null;
        if (_isFiniteNumber(debtRatio)) {
            for (var i = 0; i < debtRatioBands.length; i++) {
                var band = debtRatioBands[i];
                var withinMin = debtRatio >= band.min;
                var withinMax = band.max === undefined || debtRatio < band.max;
                if (withinMin && withinMax) {
                    debtRatioBand = band;
                    break;
                }
            }
        }

        var interestRate = window.SettlementFinanceDefinitions.DEBT_INTEREST_RATE.annualFraction;
        var projectedInterest = 0;
        if (_isFiniteNumber(settlement.totalDebt) && settlement.totalDebt > 0 && _isFiniteNumber(interestRate)) {
            projectedInterest = Math.floor(settlement.totalDebt * interestRate);
        }

        return {
            locationId: locationId,
            name: _placeName(locationId),
            totalDebt: _isFiniteNumber(settlement.totalDebt) ? settlement.totalDebt : null,
            wealth: _isFiniteNumber(settlement.wealth) ? settlement.wealth : null,
            debtRatio: _isFiniteNumber(debtRatio) ? debtRatio : null,
            debtRatioBand: debtRatioBand,
            interestRate: _isFiniteNumber(interestRate) ? interestRate : null,
            projectedAnnualInterest: projectedInterest
        };
    }

    function buildFinancialReportView(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) return null;

        var budget = _getEconomyQueries().getBudgetSummary(locationId);
        if (!budget) return null;

        var efficiency = _getEconomyQueries().getEfficiencyScore(locationId);

        return {
            locationId: locationId,
            name: _placeName(locationId),
            isHistorical: false,
            currentYear: _currentYear(),
            income: budget.income,
            expenses: budget.expenses,
            surplus: budget.surplus,
            efficiency: efficiency
        };
    }

    function buildProsperityView(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) return null;

        var prosperity = _getProsperityQueries().getProsperity(locationId);
        if (!prosperity) return null;

        return {
            locationId: locationId,
            name: _placeName(locationId),
            value: prosperity.value,
            base: prosperity.base,
            band: prosperity.band,
            modifiers: prosperity.modifiers
        };
    }

    function buildCrimeView(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) return null;

        var crime = _getCrimeQueries().getCrimeRate(locationId);
        if (!crime) return null;

        return {
            locationId: locationId,
            name: _placeName(locationId),
            value: crime.value,
            base: crime.base,
            modifiers: crime.modifiers,
            justiceSeverity: settlement.justiceSeverity || null,
            justiceSeverityName: _justiceSeverityName(settlement.justiceSeverity)
        };
    }

    function buildEmploymentView(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) return null;

        var employment = _getEmploymentQueries().getEmployment(locationId);
        if (!employment) return null;

        return {
            locationId: locationId,
            name: _placeName(locationId),
            workingAgePopulation: employment.workingAgePopulation,
            totalEmployed: employment.totalEmployed,
            stateEmployed: employment.stateEmployed,
            publicEmployed: employment.publicEmployed,
            privateEmployed: employment.privateEmployed,
            unemployed: employment.unemployed,
            employmentRate: employment.employmentRate,
            averageWage: employment.averageWage,
            totalWages: employment.totalWages
        };
    }

    function buildRankView(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) return null;

        var rank = _getRankRules().getRankById(settlement.rankId);

        var population = _getPopulationAccessor()(locationId);
        var eligibleRank = _isFiniteNumber(population)
            ? _getRankRules().getRankFromPopulation(population)
            : null;

        var nextRank = _getRankRules().getNextRank(settlement.rankId);

        var upgradeStatus = window.SettlementRankQueries.getUpgradeStatus(locationId);

        return {
            locationId: locationId,
            name: _placeName(locationId),
            currentRank: rank
                ? { id: rank.id, name: rank.name, order: rank.order }
                : null,
            eligibleRank: eligibleRank
                ? { id: eligibleRank.id, name: eligibleRank.name }
                : null,
            nextRank: nextRank
                ? {
                    id: nextRank.id,
                    name: nextRank.name,
                    minPopulation: nextRank.minPopulation
                }
                : null,
            population: _isFiniteNumber(population) ? population : null,
            upgradeAvailable: upgradeStatus.available,
            upgradeEligible: upgradeStatus.eligible,
            upgradeReasons: upgradeStatus.reasons
        };
    }

    window.SettlementViewModels = Object.freeze({
        buildSettlementSummary: buildSettlementSummary,
        buildSettlementListRow: buildSettlementListRow,
        buildSettlementList: buildSettlementList,
        buildSettlementDetails: buildSettlementDetails,
        buildBudgetView: buildBudgetView,
        buildEfficiencyView: buildEfficiencyView,
        buildDebtView: buildDebtView,
        buildFinancialReportView: buildFinancialReportView,
        buildProsperityView: buildProsperityView,
        buildCrimeView: buildCrimeView,
        buildEmploymentView: buildEmploymentView,
        buildRankView: buildRankView
    });

})();
