/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT CRIME QUERIES
 * js/settlement/settlement-crime-queries.js
 * =============================================================================
 *
 * CRIME QUERIES.
 *
 * Read-only calculation of a settlement's crime rate and its associated
 * modifiers.
 *
 * This is a query module. It:
 *   - reads canonical settlement data through SettlementQueries
 *   - reads prosperity through SettlementProsperityQueries (the canonical
 *     owner of the derived prosperity value)
 *   - reads justice severity from SettlementGovernmentDefinitions
 *   - reads feature-based crime reduction from SettlementFeatureQueries
 *   - reads employment through SettlementEmploymentQueries
 *   - reads religious unity through SettlementReligionQueries
 *   - does not mutate anything
 *   - does not persist
 *   - does not display UI
 *   - does not fabricate missing values
 *
 * PROSPERITY SOURCE
 * -----------------
 *   `settlement.prosperity` is a DERIVED value in the current
 *   architecture. It is computed by SettlementProsperityQueries and is
 *   NOT persisted on the settlement record (settlement-docs.txt §3
 *   lists it under "Derived (not stored; calculated by queries)";
 *   §16 says "Persisted values named prosperity on old settlement
 *   records are ignored by the new architecture").
 *
 *   Prior revisions of this module read `settlement.prosperity`
 *   directly. On any save created after the architecture refactor,
 *   that field is absent, so the `prosperity < 30` / `< 50` / `> 70`
 *   branches never fired — the prosperity modifier was silently 0 for
 *   every settlement. Crime rate was computed without it.
 *
 *   Current revision calls SettlementProsperityQueries.getProsperityValue
 *   and reads the `.value` from the result. This is the canonical
 *   source. If the prosperity module is unavailable (bare harness), the
 *   modifier is skipped and the crime rate is computed from the
 *   remaining inputs — a documented graceful degradation, not a
 *   fabricated prosperity value.
 *
 * CRIME RATE IS DERIVED:
 *   Sum of baseline + modifiers, then a justice-severity multiplier,
 *   clamped to [0.01, 0.8]. Canonical `settlement.crimeRate` (if it
 *   exists on an old save) is ignored; the calculation below is the
 *   single source of truth.
 *
 * MISSING DATA:
 *   - settlement missing             → returns null
 *   - population/employment missing  → employment term is 0, rest computed
 *   - religion missing               → unity term is 0, rest computed
 *   - prosperity missing             → prosperity term is 0, rest computed
 *   - required dependency missing    → the call throws (required)
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Prosperity modifier now reads from
 *       SettlementProsperityQueries.getProsperityValue(locationId)
 *       instead of `settlement.prosperity`. The persisted field does
 *       not exist in the current architecture, so the modifier never
 *       fired and every settlement's crime rate omitted it. Fixed at
 *       all call sites (there is only one).
 *     - Added _readProsperity(locationId): returns the number or null.
 *       Handles the case where SettlementProsperityQueries is not
 *       loaded (bare harness), returning null so the caller skips the
 *       modifier. It never fabricates a default.
 *     - Header PROSPERITY SOURCE section added.
 *     - No behavioral change to the other modifiers, the justice
 *       multiplier, the clamp, or the return shape.
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

    /**
     * Reads the settlement's derived prosperity value through
     * SettlementProsperityQueries. Returns the numeric value or null
     * when the module is unavailable, the settlement has no prosperity
     * (which is a legitimate "unavailable" state), or the value is
     * non-finite.
     *
     * Does NOT read `settlement.prosperity` — that field is absent on
     * any save created after the architecture refactor. See
     * PROSPERITY SOURCE in the header.
     *
     * @private
     * @param {string} locationId
     * @returns {number|null}
     */
    function _readProsperity(locationId) {
        if (typeof window.SettlementProsperityQueries === 'undefined'
            || !window.SettlementProsperityQueries
            || typeof window.SettlementProsperityQueries.getProsperityValue !== 'function') {
            // Prosperity module not loaded. The modifier is skipped.
            // This is a documented graceful degradation, not a silent
            // fabrication.
            return null;
        }
        var value = window.SettlementProsperityQueries.getProsperityValue(locationId);
        if (!_isFiniteNumber(value)) return null;
        return value;
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
        // Read through SettlementProsperityQueries, not settlement.prosperity.
        // See PROSPERITY SOURCE in the header.
        var prosperity = _readProsperity(locationId);
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
        if (settlement.hasWatch === true
            && _isFiniteNumber(settlement.watchSize)
            && settlement.watchSize > 0) {
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
        if (employment
            && _isFiniteNumber(employment.unemployed)
            && _isFiniteNumber(employment.workingAgePopulation)
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

        // --- Justice severity effect (multiplier) ---
        var justiceFactor = _getJusticeFactor(settlement.justiceSeverity);
        if (_isFiniteNumber(justiceFactor)) {
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
