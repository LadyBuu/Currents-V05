/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT CRIME QUERIES
 * js/settlement/settlement-crime-queries.js
 * =============================================================================
 *
 * CRIME QUERIES.
 *
 * This file provides read-only calculation of a settlement's crime rate
 * and its associated modifiers. It answers:
 *   - what is the current crime rate of a settlement?
 *   - how do prosperity, taxation, watch, features, unemployment,
 *     military spending, justice severity, and religious unity each
 *     contribute to the crime rate?
 *
 * It is a query module. It:
 *   - reads canonical settlement data through SettlementQueries
 *   - reads justice severity from SettlementGovernmentDefinitions
 *   - reads feature-based crime reduction from SettlementFeatureQueries
 *   - reads employment through SettlementEmploymentQueries
 *   - reads religious unity through SettlementReligionQueries
 *   - does not mutate anything
 *   - does not persist
 *   - does not display UI
 *   - does not fabricate missing values
 *   - does not use recursion guards
 *
 * Contract reference: Settlement Architecture Contracts §10 (Query
 * Contract), §11 (Query Results and Missing Data), §22 (Prosperity
 * Contract analog for a derived value), §32 (Completion Standard).
 *
 * Crime rate is derived:
 *
 *   Under the current architecture, `settlement.crimeRate` is a legacy
 *   persisted field. Under the new architecture, crime rate is a derived
 *   value: the sum of a baseline plus a set of modifiers, clamped to
 *   [0.01, 0.8]. The canonical settlement record does not need to store
 *   it. If it does store it (for backward compatibility), the stored
 *   value is ignored in favor of the calculation.
 *
 *   This module is the single source of truth for the crime rate
 *   calculation. Every subsystem that needs a settlement's crime rate
 *   reads it from here.
 *
 * PROSPERITY INPUT:
 *   The prosperity term in the crime calculation reads
 *   `settlement.baseProsperity`, a canonical settlement field initialized
 *   by SettlementFactory. It does NOT call
 *   SettlementProsperityQueries.getProsperityValue.
 *
 *   Rationale: SettlementProsperityQueries.getProsperity consumes the
 *   crime rate (via SettlementCrimeQueries.getCrimeRateValue) as one of
 *   its modifiers. Reading prosperity from SettlementProsperityQueries
 *   here would create a cycle (crime → prosperity → crime), which the
 *   architecture forbids (§20 RECURSION GUARD POLICY). baseProsperity
 *   is the stored input that breaks the cycle: it is a neutral value
 *   the settlement carries, not a derived one. See BASE PROSPERITY
 *   FIELD in settlement-factory.js for the field's definition and for
 *   its coupling to SettlementProsperityDefinitions.BASE_PROSPERITY.
 *
 *   Prior revisions read `settlement.prosperity`, which the factory
 *   never set. The prosperity term in the crime rate was silently zero
 *   for every settlement. The fix is documented in the refactor history
 *   below.
 *
 * Missing data:
 *
 *   - settlement missing             → queries return null
 *   - population/employment missing  → employment term is 0, rest still
 *                                       computed
 *   - religion missing               → unity term is 0 (no fabricated
 *                                       neutral value)
 *   - baseProsperity missing         → prosperity term is 0
 *   - required dependency missing    → the call throws (required)
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Prosperity term now reads `settlement.baseProsperity` instead of
 *       `settlement.prosperity`. The prior field was never set by
 *       SettlementFactory, so the prosperity modifier was silently 0
 *       for every settlement. The new field is a canonical factory-owned
 *       input, which also resolves the crime ↔ prosperity query cycle.
 *       See PROSPERITY INPUT in the module header.
 *     - Header PROSPERITY INPUT section added.
 *     - No public signature change, no public return-shape change. The
 *       prosperity modifier field on the result object is unchanged;
 *       only the source of its input changed.
 *   Previous revisions:
 *     - Initial implementation.
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

    function _getEmploymentQueries() {
        return window.SettlementEmploymentQueries;
    }

    function _getReligionQueries() {
        return window.SettlementReligionQueries;
    }

    function _getGovernmentDefinitions() {
        return window.SettlementGovernmentDefinitions;
    }

    // =========================================================================
    // 2. CONSTANTS
    // =========================================================================

    var BASE_CRIME_RATE = 0.05;
    var MIN_CRIME_RATE = 0.01;
    var MAX_CRIME_RATE = 0.8;

    // =========================================================================
    // 3. HELPERS
    // =========================================================================

    function _isFiniteNumber(value) {
        return typeof value === 'number' && isFinite(value);
    }

    function _getJusticeFactor(severityId) {
        var severities = _getGovernmentDefinitions().JUSTICE_SEVERITIES;
        for (var i = 0; i < severities.length; i++) {
            if (severities[i].id === severityId) {
                return severities[i].crimeFactor;
            }
        }
        return null;
    }

    // =========================================================================
    // 4. CRIME RATE CALCULATION
    // =========================================================================

    /**
     * Returns the settlement's crime rate and a breakdown of the
     * modifiers that produced it.
     *
     * Returns null if the settlement does not exist.
     *
     * Result shape:
     *   {
     *     value: number,         // final crime rate, in [0.01, 0.8]
     *     base: number,          // BASE_CRIME_RATE
     *     modifiers: {
     *       prosperity: number,
     *       taxRate: number,
     *       watch: number,
     *       features: number,
     *       unemployment: number,
     *       militarySpending: number,
     *       justiceSeverity: number,
     *       religiousUnity: number,
     *       placesOfWorship: number
     *     }
     *   }
     *
     * Each modifier is the delta applied. Their sum, added to base and
     * followed by the justice severity multiplier, produces the value.
     * The breakdown is explanatory; consumers that only need the rate
     * read `.value`.
     *
     * The prosperity modifier reads `settlement.baseProsperity`, not
     * `SettlementProsperityQueries`. See PROSPERITY INPUT in the module
     * header.
     *
     * @param {string} locationId
     * @returns {Object|null}
     */
    function getCrimeRate(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) return null;

        var modifiers = {
            prosperity: 0,
            taxRate: 0,
            watch: 0,
            features: 0,
            unemployment: 0,
            militarySpending: 0,
            justiceSeverity: 0,
            religiousUnity: 0,
            placesOfWorship: 0
        };

        var crimeRate = BASE_CRIME_RATE;

        // --- Prosperity effect ---
        // Reads settlement.baseProsperity, the factory-initialized
        // canonical input. NOT SettlementProsperityQueries — see
        // PROSPERITY INPUT in the module header for the cycle rationale.
        var prosperity = settlement.baseProsperity;
        if (_isFiniteNumber(prosperity)) {
            var prosperityDelta = 0;
            if (prosperity < 30) prosperityDelta = 0.10;
            else if (prosperity < 50) prosperityDelta = 0.05;
            else if (prosperity > 70) prosperityDelta = -0.03;
            modifiers.prosperity = prosperityDelta;
            crimeRate += prosperityDelta;
        }

        // --- Tax rate effect ---
        var taxRate = settlement.taxRate;
        if (_isFiniteNumber(taxRate)) {
            var taxDelta = 0;
            if (taxRate > 20) taxDelta = 0.10;
            else if (taxRate > 15) taxDelta = 0.05;
            modifiers.taxRate = taxDelta;
            crimeRate += taxDelta;
        }

        // --- Watch effect ---
        if (settlement.hasWatch === true && _isFiniteNumber(settlement.watchSize) && settlement.watchSize > 0) {
            var watchDelta = -Math.min(0.3, settlement.watchSize / 100);
            modifiers.watch = watchDelta;
            crimeRate += watchDelta;
        }

        // --- Feature crime reduction ---
        var featureEffects = _getFeatureQueries().getSettlementFeatureEffects(locationId);
        if (featureEffects) {
            var featureDelta = -featureEffects.crimeReduction;
            modifiers.features = featureDelta;
            crimeRate += featureDelta;
        }

        // --- Unemployment effect ---
        var employment = _getEmploymentQueries().getEmployment(locationId);
        if (employment && _isFiniteNumber(employment.unemployed) && _isFiniteNumber(employment.workingAgePopulation)
            && employment.workingAgePopulation > 0) {
            var unemploymentRate = employment.unemployed / employment.workingAgePopulation;
            var unemploymentDelta = unemploymentRate * 0.1;
            modifiers.unemployment = unemploymentDelta;
            crimeRate += unemploymentDelta;
        }

        // --- Military spending effect ---
        var militarySpend = settlement.militarySpending;
        if (_isFiniteNumber(militarySpend)) {
            var militaryDelta = 0;
            if (militarySpend > 50) militaryDelta = -0.10;
            else if (militarySpend > 20) militaryDelta = -0.05;
            modifiers.militarySpending = militaryDelta;
            crimeRate += militaryDelta;
        }

        // --- Religious unity effect ---
        var unity = _getReligionQueries().getReligiousUnity(locationId);
        if (_isFiniteNumber(unity)) {
            var unityDelta = 0;
            if (unity > 80) unityDelta = -0.02;
            else if (unity < 30) unityDelta = 0.03;
            modifiers.religiousUnity = unityDelta;
            crimeRate += unityDelta;
        }

        // --- Places of worship effect ---
        var placeCount = _getReligionQueries().getActivePlaceOfWorshipCount(locationId);
        if (_isFiniteNumber(placeCount) && placeCount > 0) {
            var placeDelta = -Math.min(0.03, placeCount * 0.005);
            modifiers.placesOfWorship = placeDelta;
            crimeRate += placeDelta;
        }

        // --- Justice severity effect ---
        // The justice severity is a multiplier applied to the
        // accumulated rate. It represents the deterrence strength of the
        // settlement's justice system.
        var justiceFactor = _getJusticeFactor(settlement.justiceSeverity);
        if (_isFiniteNumber(justiceFactor)) {
            // The delta is the change caused by applying the multiplier.
            // It is recorded as "final - intermediate" so the breakdown
            // sums to the actual change.
            var intermediate = crimeRate;
            crimeRate = crimeRate * (1 - justiceFactor * 0.3);
            modifiers.justiceSeverity = crimeRate - intermediate;
        }

        // --- Clamp ---
        if (crimeRate < MIN_CRIME_RATE) crimeRate = MIN_CRIME_RATE;
        if (crimeRate > MAX_CRIME_RATE) crimeRate = MAX_CRIME_RATE;

        return {
            value: crimeRate,
            base: BASE_CRIME_RATE,
            modifiers: modifiers
        };
    }

    /**
     * Returns the settlement's crime rate as a number in [0.01, 0.8], or
     * null if the settlement does not exist.
     *
     * @param {string} locationId
     * @returns {number|null}
     */
    function getCrimeRateValue(locationId) {
        var result = getCrimeRate(locationId);
        return result === null ? null : result.value;
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.SettlementCrimeQueries = Object.freeze({
        getCrimeRate: getCrimeRate,
        getCrimeRateValue: getCrimeRateValue,
        BASE_CRIME_RATE: BASE_CRIME_RATE,
        MIN_CRIME_RATE: MIN_CRIME_RATE,
        MAX_CRIME_RATE: MAX_CRIME_RATE
    });

})();
