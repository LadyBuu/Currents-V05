/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT VIEW MODELS
 * js/settlement/settlement-view-models.js
 * =============================================================================
 *
 * (Header preserved — see current file. Time-dependency block, the
 * financial-report year contract, the religion status fields, and the
 * definition-shape guards changed.)
 *
 * Time dependency:
 *   window.getCurrentYear, defined in js/core/time.js. The deprecated
 *   window.getCurrentYearSafe alias is NOT used here.
 *
 * FINANCIAL REPORT YEAR CONTRACT:
 *   buildFinancialReportView(locationId, options) accepts an optional
 *   options.year. When supplied and valid, that year is used as the
 *   report year. When omitted, window.getCurrentYear() is used.
 *
 *   The result carries:
 *
 *     reportYear     the year the report describes
 *     isHistorical   true if reportYear !== getCurrentYear() at the
 *                    moment of the call
 *
 *   Prior revisions hardcoded isHistorical: false and read the clock
 *   directly, which meant a report for a past year would still claim
 *   to be current. Under the year-transition path, the caller drives
 *   the clock; the view model must accept the year explicitly so it
 *   can render both current and historical reports without inventing
 *   the year.
 *
 *   Other view builders in this file do not need a year parameter:
 *   every fact they compose is either year-agnostic (wealth, taxRate,
 *   feature counts) or year-scoped through a query that owns its own
 *   clock (prosperity reads currentYear for leader tenure only; the
 *   caller can supply options.year to the future
 *   SettlementProsperityQueries.getProsperity when it gains one).
 *
 * RELIGION STATUS FIELDS:
 *   buildSettlementSummary exposes two nullable reason codes alongside
 *   the existing value fields:
 *
 *     religiousUnity        number|null
 *     religiousUnityReason  'available' | 'no_population' |
 *                           'no_breakdown' | 'settlement_not_found'
 *
 *     dominantReligion          Object|null
 *     dominantReligionReason    'available' | 'no_population' |
 *                               'no_breakdown' | 'unaffiliated_majority' |
 *                               'no_religions' | 'settlement_not_found'
 *
 *   Prior revisions only exposed the value fields, which collapsed
 *   "unaffiliated majority" and "no religions at all" into the same
 *   dominantReligion: null. Consumers that want to render honest copy
 *   ("Unaffiliated majority" vs. "No religions") read the reason field.
 *
 * DEFINITION-SHAPE GUARDS:
 *   buildDebtView and buildFinancialReportView read
 *   SettlementFinanceDefinitions.DEBT_INTEREST_RATE and
 *   SettlementViewModels' own band iteration. The definition modules
 *   are required at load; if their shape is malformed (e.g. a future
 *   edit drops annualFraction), the view models now degrade to null
 *   rather than produce NaN. Per settlement-docs.txt §4, missing
 *   definition data is not converted into a domain fact; it is
 *   reported as unavailable.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - buildFinancialReportView now accepts options.year. When
 *       supplied and valid, that year is used for the report and
 *       isHistorical reflects whether it differs from
 *       getCurrentYear(). Adds reportYear to the result.
 *     - buildSettlementSummary now reads getReligiousUnityStatus and
 *       getDominantReligionStatus. Exposes religiousUnityReason and
 *       dominantReligionReason alongside the value fields. Existing
 *       value fields are unchanged (same names, same nullability).
 *     - buildDebtView guards the DEBT_INTEREST_RATE read. A malformed
 *       or missing annualFraction now produces projectedAnnualInterest:
 *       null and interestRate: null instead of NaN.
 *     - buildEfficiencyView and buildDebtView guard their band-list
 *       reads. A malformed or missing band list produces band: null
 *       (the views already handle that case).
 *     - Header FINANCIAL REPORT YEAR CONTRACT, RELIGION STATUS
 *       FIELDS, and DEFINITION-SHAPE GUARDS sections added.
 *     - No public signature change to any existing function. The
 *       buildFinancialReportView signature gains an optional second
 *       argument; existing callers pass one argument and get the same
 *       behavior as before.
 *   Previous revisions:
 *     - Initial implementation.
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
    function _getFinanceDefinitions()       { return window.SettlementFinanceDefinitions; }
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

    /**
     * Resolves the year to use for a report. When options.year is a
     * valid world year, that year is used. When options.year is
     * missing, the current year is used. When options.year is present
     * but invalid, an Error is thrown.
     *
     * @private
     * @param {Object} options
     * @returns {number}
     * @throws {Error} if options.year is present but not a valid world year
     */
    function _resolveReportYear(options) {
        if (!options || options.year === undefined || options.year === null) {
            return _currentYear();
        }
        if (typeof window.isValidYear !== 'function') {
            throw new Error(
                'settlement-view-models.js: time.js (isValidYear) is not ' +
                'available; cannot validate options.year.'
            );
        }
        if (window.isValidYear(options.year) !== true) {
            throw new Error(
                'settlement-view-models.js: options.year must be a valid ' +
                'world year (got ' + options.year + ').'
            );
        }
        return options.year;
    }

    /**
     * Looks up the efficiency band that a numeric score falls into.
     * Returns null when the band list is malformed or missing, matching
     * DEFINITION-SHAPE GUARDS in the module header.
     *
     * @private
     * @param {number} score
     * @returns {Object|null}
     */
    function _efficiencyBandFor(score) {
        var bands = _getFinanceDefinitions().EFFICIENCY_BANDS;
        if (!Array.isArray(bands)) return null;
        for (var i = 0; i < bands.length; i++) {
            if (score >= bands[i].min) return bands[i];
        }
        return null;
    }

    /**
     * Looks up the debt-ratio band that a numeric ratio falls into.
     * Returns null when the band list is malformed or missing.
     *
     * @private
     * @param {number} ratio
     * @returns {Object|null}
     */
    function _debtRatioBandFor(ratio) {
        var bands = _getFinanceDefinitions().DEBT_RATIO_BANDS;
        if (!Array.isArray(bands)) return null;
        for (var i = 0; i < bands.length; i++) {
            var band = bands[i];
            var withinMin = ratio >= band.min;
            var withinMax = band.max === undefined || ratio < band.max;
            if (withinMin && withinMax) return band;
        }
        return null;
    }

    /**
     * Resolves the DEBT_INTEREST_RATE.annualFraction definition.
     * Returns null when the definition is missing or malformed.
     * @private
     */
    function _interestRateFraction() {
        var def = _getFinanceDefinitions().DEBT_INTEREST_RATE;
        if (!def || typeof def !== 'object') return null;
        if (!_isFiniteNumber(def.annualFraction)) return null;
        return def.annualFraction;
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

        // Religion: read both value and reason. See RELIGION STATUS
        // FIELDS in the module header.
        var unityStatus = _getReligionQueries().getReligiousUnityStatus(locationId);
        var dominantStatus = _getReligionQueries().getDominantReligionStatus(locationId);

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
            dominantReligion: dominantStatus.religion,
            dominantReligionReason: dominantStatus.reason,
            religiousUnity: unityStatus.unity,
            religiousUnityReason: unityStatus.reason,
            activePlaceOfWorshipCount: (function () {
                var c = _getReligionQueries().getActivePlaceOfWorshipCount(locationId);
                return _isFiniteNumber(c) ? c : null;
            })(),
            civilLawCount: _isFiniteNumber(lawCount) ? lawCount : null,
            featureCount: Array.isArray(settlement.featureIds)
                ? settlement.featureIds.length
                : 0
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

        var featureIds = _getSettlementQueries().getFeatureIds(locationId) || [];
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

        var band = _efficiencyBandFor(score.efficiency);

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
        var debtRatioBand = _isFiniteNumber(debtRatio)
            ? _debtRatioBandFor(debtRatio)
            : null;

        var interestRate = _interestRateFraction();

        // projectedAnnualInterest: null when either the totalDebt or the
        // interest rate is unavailable. See DEFINITION-SHAPE GUARDS in
        // the module header.
        var projectedInterest = null;
        if (_isFiniteNumber(settlement.totalDebt)
            && settlement.totalDebt > 0
            && _isFiniteNumber(interestRate)) {
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

    /**
     * Builds the financial report view.
     *
     * @param {string} locationId
     * @param {Object} [options]
     * @param {number} [options.year]
     *   The world year the report describes. When omitted, the current
     *   year is used and isHistorical is false. When supplied and equal
     *   to the current year, isHistorical is false. When supplied and
     *   different from the current year, isHistorical is true.
     *
     * @returns {Object|null}
     */
    function buildFinancialReportView(locationId, options) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) return null;

        var budget = _getEconomyQueries().getBudgetSummary(locationId);
        if (!budget) return null;

        var efficiency = _getEconomyQueries().getEfficiencyScore(locationId);

        var reportYear = _resolveReportYear(options);
        var currentYear = _currentYear();

        return {
            locationId: locationId,
            name: _placeName(locationId),
            reportYear: reportYear,
            isHistorical: reportYear !== currentYear,
            currentYear: currentYear,
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
