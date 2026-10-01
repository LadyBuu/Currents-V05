/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT VIEW MODELS
 * js/settlement/settlement-view-models.js
 * =============================================================================
 *
 * PRESENTATION-READY VIEW MODELS.
 *
 * This file composes query results into structures that a UI can render
 * directly. It provides:
 *
 *   - buildSettlementSummary    : a summary of one settlement
 *   - buildSettlementListRow    : a compact list row
 *   - buildSettlementDetails    : a details panel
 *   - buildBudgetView           : a budget summary panel
 *   - buildEfficiencyView       : an efficiency panel
 *   - buildDebtView             : a debt management panel
 *   - buildFinancialReportView  : a financial report panel
 *   - buildProsperityView       : a prosperity panel
 *   - buildCrimeView            : a crime panel
 *   - buildEmploymentView       : an employment panel
 *   - buildRankView             : a rank panel
 *
 * It is a ViewModel module. It:
 *   - reads through query modules
 *   - resolves display labels from definitions
 *   - composes values into UI-shaped objects
 *   - does not mutate anything
 *   - does not persist
 *   - does not create settlement records
 *   - does not fabricate domain values
 *   - does not use recursion guards
 *
 * Contract reference: Settlement Architecture Contracts §15 (ViewModel
 * Contract), §32 (Completion Standard).
 *
 * Scope discipline:
 *
 *   ViewModels translate domain facts into presentation shapes. They
 *   may resolve display names from definitions. They may combine query
 *   results. They may compute presentation-only fields (such as a band
 *   name or an availability flag). They MUST NOT invent domain values:
 *
 *     - a missing tax rate is `null`, not 10
 *     - a missing prosperity is `null`, not 50
 *     - a missing settlement produces null, not a fabricated record
 *     - a missing place produces null, not the string "Unknown"
 *
 *   When a value is unavailable, the ViewModel returns the field as
 *   null (or omits it, for optional presentation-only fields) and
 *   exposes an `availability` marker when a UI needs to render an empty
 *   state.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCIES
    // =========================================================================

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

    // =========================================================================
    // 2. HELPERS
    // =========================================================================

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

    // =========================================================================
    // 3. SETTLEMENT SUMMARY
    // =========================================================================

    /**
     * Builds a complete summary of a settlement for display.
     *
     * Returns null if the settlement does not exist. Otherwise returns an
     * object containing every field a summary view might need, with
     * missing sub-values represented as null (never fabricated).
     *
     * @param {string} locationId
     * @returns {Object|null}
     */
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

    // =========================================================================
    // 4. LIST ROW
    // =========================================================================

    /**
     * Builds a compact row for a settlement list view.
     *
     * Returns null if the settlement does not exist.
     *
     * @param {string} locationId
     * @returns {Object|null}
     */
    function buildSettlementListRow(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) return null;

        var rank = _getRankRules().getRankById(settlement.rankId);
        var prosperity = _getProsperityQueries().getProsperity(locationId);
        var lawCount = _getLawQueries().getCivilLawCount(locationId);
        var placeCount = _getReligionQueries().getActivePlaceOfWorshipCount(locationId);

        return {
            locationId: locationId,
            name: _placeName(locationId),
            rank: rank ? { id: rank.id, name: rank.name } : null,
            population: _isFiniteNumber(_getPopulationAccessor()(locationId))
                ? _getPopulationAccessor()(locationId)
                : null,
            wealth: _isFiniteNumber(settlement.wealth) ? settlement.wealth : null,
            totalDebt: _isFiniteNumber(settlement.totalDebt) ? settlement.totalDebt : null,
            prosperity: prosperity
                ? { value: prosperity.value, band: prosperity.band }
                : null,
            civilLawCount: _isFiniteNumber(lawCount) ? lawCount : null,
            activePlaceOfWorshipCount: _isFiniteNumber(placeCount) ? placeCount : null
        };
    }

    /**
     * Builds a list of summary rows for all settlements.
     *
     * @returns {Array<Object>}
     */
    function buildSettlementList() {
        var settlements = _getSettlementQueries().getAllSettlements();
        var result = [];
        for (var i = 0; i < settlements.length; i++) {
            var row = buildSettlementListRow(settlements[i].locationId);
            if (row) result.push(row);
        }
        return result;
    }

    // =========================================================================
    // 5. DETAILS PANEL
    // =========================================================================

    /**
     * Builds the complete details view for a settlement.
     *
     * Returns null if the settlement does not exist.
     *
     * @param {string} locationId
     * @returns {Object|null}
     */
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

    // =========================================================================
    // 6. BUDGET VIEW
    // =========================================================================

    /**
     * Builds a budget view for a settlement.
     *
     * Returns null if the settlement does not exist.
     *
     * @param {string} locationId
     * @returns {Object|null}
     */
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

    // =========================================================================
    // 7. EFFICIENCY VIEW
    // =========================================================================

    /**
     * Builds an efficiency view for a settlement.
     *
     * Returns null if the settlement does not exist or if efficiency
     * cannot be calculated.
     *
     * @param {string} locationId
     * @returns {Object|null}
     */
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

    // =========================================================================
    // 8. DEBT VIEW
    // =========================================================================

    /**
     * Builds a debt management view for a settlement.
     *
     * Returns null if the settlement does not exist.
     *
     * @param {string} locationId
     * @returns {Object|null}
     */
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

    // =========================================================================
    // 9. FINANCIAL REPORT VIEW
    // =========================================================================
    //
    // NOTE: under the new architecture, there is no persisted historical
    // financial data. This view reports the current annual budget
    // summary. It does NOT fabricate historical years. If historical
    // data is added to the settlement record later, this function is
    // updated to consume it. Until then, the view is a snapshot of the
    // current year, clearly labeled.
    //

    /**
     * Builds a current financial snapshot for a settlement.
     *
     * Returns null if the settlement does not exist.
     *
     * @param {string} locationId
     * @returns {Object|null}
     */
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
            currentYear: window.Time.getCurrentYear(),
            income: budget.income,
            expenses: budget.expenses,
            surplus: budget.surplus,
            efficiency: efficiency
        };
    }

    // =========================================================================
    // 10. PROSPERITY VIEW
    // =========================================================================

    /**
     * @param {string} locationId
     * @returns {Object|null}
     */
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

    // =========================================================================
    // 11. CRIME VIEW
    // =========================================================================

    /**
     * @param {string} locationId
     * @returns {Object|null}
     */
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

    // =========================================================================
    // 12. EMPLOYMENT VIEW
    // =========================================================================

    /**
     * @param {string} locationId
     * @returns {Object|null}
     */
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

    // =========================================================================
    // 13. RANK VIEW
    // =========================================================================

    /**
     * @param {string} locationId
     * @returns {Object|null}
     */
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

    // =========================================================================
    // 14. EXPORTS
    // =========================================================================

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
