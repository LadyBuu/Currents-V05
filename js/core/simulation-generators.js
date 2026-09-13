/**
 * =============================================================================
 * STILL WATERS - SIMULATION GENERATORS (simulation-generators.js)
 * =============================================================================
 * 
 * LOCATION: js/modules/simulation/simulation-generators.js
 * 
 * SCOPE:
 *   Simulation-specific random value generation. These apply domain rules
 *   (fertility ranges, mortality models, year bounds) on top of the generic
 *   RNG. They belong to the simulation domain, not core randomness.
 * 
 * OUT OF SCOPE:
 *   - Generic RNG primitives → randomness.js
 *   - Time bounds → time.js
 *   - Character creation pipeline → character-commands.js or similar
 * 
 * SEMANTIC RULES:
 *   - All numeric parameters use explicit missing checks.
 *   - Year bounds come from TIME_CONSTANTS; no duplicate 1250.
 *   - Invalid input returns null (not 0, which is legitimate).
 * 
 * DEPENDENCIES (REQUIRED):
 *   - randomness.js: randomNormal, randomExponential, randomInt
 *   - time.js: TIME_CONSTANTS
 * 
 * ICON POLICY: No emojis. No icons.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY GUARDS
    // =========================================================================

    function _requireRandomness() {
        var required = ['randomNormal', 'randomExponential', 'randomInt'];
        var missing = [];
        for (var i = 0; i < required.length; i++) {
            if (typeof window[required[i]] !== 'function') {
                missing.push(required[i]);
            }
        }
        if (missing.length > 0) {
            throw new Error(
                'simulation-generators.js: missing randomness.js functions: ' +
                missing.join(', ')
            );
        }
    }

    function _requireTime() {
        if (typeof window.TIME_CONSTANTS === 'undefined') {
            throw new Error('simulation-generators.js: time.js must load first.');
        }
    }

    // =========================================================================
    // 1. DOMAIN CONSTANTS
    // =========================================================================
    // 
    // These are simulation policy, not generic RNG concerns. They would
    // eventually move into per-world configuration if Still Waters supports
    // multiple simulated worlds.

    var FERTILITY_MIN = 0.5;
    var FERTILITY_MAX = 1.5;
    var FERTILITY_MEAN = 1.0;
    var FERTILITY_STD_DEV = 0.2;

    var LIFESPAN_BASE_EXPECTANCY = 70;
    var LIFESPAN_STD_DEV = 20;
    var LIFESPAN_MAX_AGE = 120;

    var DEFAULT_MAX_AGE = 120;

    // =========================================================================
    // 2. INTERNAL HELPERS
    // =========================================================================

    function _isMissing(v) {
        return v === null || v === undefined;
    }

    function _isFiniteInt(v) {
        return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v);
    }

    // =========================================================================
    // 3. AGE DISTRIBUTIONS
    // =========================================================================

    /**
     * Generates a young-biased age distribution.
     * 
     * @param {number} [maxAge] - default 120
     * @param {boolean} [includeInfants] - default true
     * @returns {number|null} age in [0, maxAge] or null for invalid input
     */
    function randomRealisticAge(maxAge, includeInfants) {
        _requireRandomness();

        maxAge = _isMissing(maxAge) ? DEFAULT_MAX_AGE : maxAge;
        includeInfants = includeInfants !== false;

        if (!_isFiniteInt(maxAge) || maxAge < 0) return null;

        var age = window.randomExponential(0, maxAge, 0.6);
        if (age === null) return null;

        age = Math.floor(age);
        age = Math.min(maxAge, Math.max(0, age));
        if (!includeInfants && age === 0) age = 1;
        return age;
    }

    /**
     * Generates a random year within range of a reference year, clamped to
     * TIME_CONSTANTS.MIN_YEAR..MAX_YEAR.
     * 
     * @param {number} currentYear - must be a valid integer year
     * @param {number} [maxFutureYears] - default 10
     * @param {number} [maxPastYears] - default 120
     * @returns {number|null}
     */
    function randomYear(currentYear, maxFutureYears, maxPastYears) {
        _requireRandomness();
        _requireTime();

        if (!_isFiniteInt(currentYear)) return null;

        maxFutureYears = _isMissing(maxFutureYears) ? 10 : maxFutureYears;
        maxPastYears = _isMissing(maxPastYears) ? 120 : maxPastYears;

        if (!_isFiniteInt(maxFutureYears) || maxFutureYears < 0) return null;
        if (!_isFiniteInt(maxPastYears) || maxPastYears < 0) return null;

        var minYear = Math.max(
            window.TIME_CONSTANTS.MIN_YEAR,
            currentYear - maxPastYears
        );
        var maxYear = Math.min(
            window.TIME_CONSTANTS.MAX_YEAR,
            currentYear + maxFutureYears
        );

        if (minYear > maxYear) return null;
        return window.randomInt(minYear, maxYear);
    }

    // =========================================================================
    // 4. FERTILITY
    // =========================================================================

    /**
     * Generates a fertility modifier, clamped to [0.5, 1.5].
     * 
     * @param {number} [mean] - default 1.0
     * @param {number} [stdDev] - default 0.2
     * @returns {number|null}
     */
    function randomFertilityModifier(mean, stdDev) {
        _requireRandomness();

        mean = _isMissing(mean) ? FERTILITY_MEAN : mean;
        stdDev = _isMissing(stdDev) ? FERTILITY_STD_DEV : stdDev;

        var raw = window.randomNormal(mean, stdDev);
        if (raw === null) return null;

        return Math.min(FERTILITY_MAX, Math.max(FERTILITY_MIN, raw));
    }

    // =========================================================================
    // 5. LIFESPAN / MORTALITY
    // =========================================================================

    /**
     * Generates an age at death for a character of the given age.
     * Uses a simple normal model around base life expectancy.
     * 
     * Semantics:
     *   - If currentAge exceeds baseLifeExpectancy, the expected remaining
     *     lifespan is 0 and the model returns currentAge.
     *   - Result is clamped to LIFESPAN_MAX_AGE.
     * 
     * @param {number} [currentAge] - default 0
     * @param {number} [baseLifeExpectancy] - default 70
     * @returns {number|null}
     */
    function randomLifespan(currentAge, baseLifeExpectancy) {
        _requireRandomness();

        currentAge = _isMissing(currentAge) ? 0 : currentAge;
        baseLifeExpectancy = _isMissing(baseLifeExpectancy)
            ? LIFESPAN_BASE_EXPECTANCY
            : baseLifeExpectancy;

        if (!_isFiniteInt(currentAge) || currentAge < 0) return null;
        if (typeof baseLifeExpectancy !== 'number'
            || !Number.isFinite(baseLifeExpectancy)
            || baseLifeExpectancy <= 0) {
            return null;
        }

        var remaining = window.randomNormal(
            baseLifeExpectancy - currentAge,
            LIFESPAN_STD_DEV
        );
        if (remaining === null) return null;

        if (remaining < 0) remaining = 0;

        var deathAge = currentAge + Math.floor(remaining);
        return Math.min(LIFESPAN_MAX_AGE, deathAge);
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.randomRealisticAge = randomRealisticAge;
    window.randomYear = randomYear;
    window.randomFertilityModifier = randomFertilityModifier;
    window.randomLifespan = randomLifespan;

})();