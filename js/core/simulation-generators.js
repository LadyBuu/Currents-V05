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
 *   - Generic numeric validation for RNG parameters → randomness.js
 *
 * SEMANTIC RULES:
 *   - All numeric parameters use explicit missing checks.
 *   - Year bounds and year validation come from time.js. This module does
 *     not duplicate the world's year range.
 *   - Invalid input returns null (not 0, which is legitimate).
 *   - Missing input (undefined/null) uses the documented default.
 *   - Explicit invalid input (wrong type, out of domain range) returns null.
 *
 * DEPENDENCIES (REQUIRED):
 *   - randomness.js: randomNormal, randomExponential, randomInt
 *   - time.js:       TIME_CONSTANTS.MIN_YEAR, TIME_CONSTANTS.MAX_YEAR
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
        if (typeof window.TIME_CONSTANTS === 'undefined'
            || typeof window.TIME_CONSTANTS.MIN_YEAR !== 'number'
            || typeof window.TIME_CONSTANTS.MAX_YEAR !== 'number') {
            throw new Error(
                'simulation-generators.js: time.js must load first ' +
                '(TIME_CONSTANTS.MIN_YEAR / MAX_YEAR missing).'
            );
        }
    }

    // =========================================================================
    // 1. DOMAIN CONSTANTS
    // =========================================================================
    //
    // Simulation policy. These would eventually move into per-world
    // configuration if Still Waters supports multiple simulated worlds.
    // Do not build that machinery yet; these constants are the only
    // consumers today.

    var FERTILITY_MIN = 0.5;
    var FERTILITY_MAX = 1.5;
    var FERTILITY_MEAN = 1.0;
    var FERTILITY_STD_DEV = 0.2;

    var LIFESPAN_BASE_EXPECTANCY = 70;
    var LIFESPAN_STD_DEV = 20;

    // Maximum age any simulation-generated character can reach. This is a
    // hard cap for both age generation and lifespan modelling; it is one
    // constant, not two.
    var LIFESPAN_MAX_AGE = 120;

    // Shape of the age-of-existence distribution. Not time policy; not
    // randomness policy; specifically simulation policy.
    var AGE_DISTRIBUTION_EXPONENT = 0.6;

    // Default future/past window for randomYear, in years.
    var DEFAULT_FUTURE_YEARS = 10;
    var DEFAULT_PAST_YEARS = 120;

    // =========================================================================
    // 2. INTERNAL HELPERS
    // =========================================================================

    function _isMissing(v) {
        return v === null || v === undefined;
    }

    function _isFiniteInt(v) {
        return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v);
    }

    function _isFiniteNumber(v) {
        return typeof v === 'number' && Number.isFinite(v);
    }

    /**
     * True if `year` is within TIME_CONSTANTS.MIN_YEAR..MAX_YEAR and is
     * an integer. Delegates to the world's canonical year bounds; this
     * module does not maintain its own.
     * @private
     */
    function _isValidWorldYear(year) {
        if (!_isFiniteInt(year)) return false;
        return year >= window.TIME_CONSTANTS.MIN_YEAR
            && year <= window.TIME_CONSTANTS.MAX_YEAR;
    }

    // =========================================================================
    // 3. AGE DISTRIBUTIONS
    // =========================================================================

    /**
     * Generates a young-biased age distribution.
     *
     * Semantics:
     *   - maxAge missing → LIFESPAN_MAX_AGE
     *   - maxAge must be a non-negative integer; otherwise null
     *   - includeInfants defaults to true; when false, age 0 is excluded
     *   - If includeInfants is false and maxAge === 0, returns null
     *     (no valid non-infant age exists in the empty range)
     *
     * @param {number} [maxAge] - default LIFESPAN_MAX_AGE
     * @param {boolean} [includeInfants] - default true
     * @returns {number|null} age in [0, maxAge] (or [1, maxAge] when
     *   includeInfants is false), or null for invalid input
     */
    function randomRealisticAge(maxAge, includeInfants) {
        _requireRandomness();

        maxAge = _isMissing(maxAge) ? LIFESPAN_MAX_AGE : maxAge;
        includeInfants = includeInfants !== false;

        if (!_isFiniteInt(maxAge) || maxAge < 0) return null;

        // The documented range is empty when infants are excluded and
        // maxAge is 0. Returning a fabricated age would violate the
        // range contract.
        if (!includeInfants && maxAge === 0) return null;

        var age = window.randomExponential(0, maxAge, AGE_DISTRIBUTION_EXPONENT);
        if (age === null) return null;

        age = Math.floor(age);
        age = Math.min(maxAge, Math.max(0, age));
        if (!includeInfants && age === 0) age = 1;
        return age;
    }

    /**
     * Generates a random year within a window around a reference year,
     * clamped to TIME_CONSTANTS.MIN_YEAR..MAX_YEAR.
     *
     * The reference year must itself be a valid world year. It is not
     * silently clamped; an out-of-range reference is a caller error and
     * returns null.
     *
     * @param {number} currentYear - must be a valid world year
     * @param {number} [maxFutureYears] - default 10
     * @param {number} [maxPastYears]   - default 120
     * @returns {number|null}
     */
    function randomYear(currentYear, maxFutureYears, maxPastYears) {
        _requireRandomness();
        _requireTime();

        if (!_isValidWorldYear(currentYear)) return null;

        maxFutureYears = _isMissing(maxFutureYears)
            ? DEFAULT_FUTURE_YEARS
            : maxFutureYears;
        maxPastYears = _isMissing(maxPastYears)
            ? DEFAULT_PAST_YEARS
            : maxPastYears;

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
     * Generates a fertility modifier, clamped to [FERTILITY_MIN, FERTILITY_MAX].
     *
     * Generic RNG parameter validation (e.g., negative stdDev) is owned by
     * randomness.js. This function passes parameters through and clamps the
     * result to its own domain range.
     *
     * @param {number} [mean]   - default FERTILITY_MEAN
     * @param {number} [stdDev] - default FERTILITY_STD_DEV
     * @returns {number|null}
     */
    function randomFertilityModifier(mean, stdDev) {
        _requireRandomness();

        mean = _isMissing(mean) ? FERTILITY_MEAN : mean;
        stdDev = _isMissing(stdDev) ? FERTILITY_STD_DEV : stdDev;

        if (!_isFiniteNumber(mean) || !_isFiniteNumber(stdDev)) return null;

        var raw = window.randomNormal(mean, stdDev);
        if (raw === null) return null;

        return Math.min(FERTILITY_MAX, Math.max(FERTILITY_MIN, raw));
    }

    // =========================================================================
    // 5. LIFESPAN / MORTALITY
    // =========================================================================

    /**
     * Generates an age at death for a character of the given age.
     *
     * MODEL (as implemented, not as ideally theorized):
     *
     *   The remaining lifespan is sampled from
     *       Normal(baseLifeExpectancy - currentAge, LIFESPAN_STD_DEV)
     *
     *   Negative samples are clamped to 0, and the final death age is
     *   capped at LIFESPAN_MAX_AGE.
     *
     *   Behavioural consequences:
     *     - For currentAge well below baseLifeExpectancy, the mean remaining
     *       lifespan is positive and the character dies around the base
     *       expectancy.
     *     - As currentAge approaches baseLifeExpectancy, the mean remaining
     *       lifespan shrinks toward 0.
     *     - For currentAge above baseLifeExpectancy, the mean remaining
     *       lifespan is negative and the distribution is heavily truncated
     *       at 0. Such characters mostly die "immediately" in model time,
     *       with occasional longer survivals from the positive tail.
     *
     *   This is a deliberate simplification, not a realistic actuarial
     *   model. If it stops being the policy you want, change it here;
     *   do not paper over it by tweaking other constants.
     *
     * CONTRACT:
     *   - currentAge must be a non-negative integer <= LIFESPAN_MAX_AGE.
     *     Ages above the cap cannot produce a valid death age under the
     *     model, so they are rejected rather than silently clamped.
     *   - The returned death age is always >= currentAge and <= LIFESPAN_MAX_AGE.
     *   - baseLifeExpectancy must be a positive finite number.
     *
     * @param {number} [currentAge] - default 0
     * @param {number} [baseLifeExpectancy] - default LIFESPAN_BASE_EXPECTANCY
     * @returns {number|null}
     */
    function randomLifespan(currentAge, baseLifeExpectancy) {
        _requireRandomness();

        currentAge = _isMissing(currentAge) ? 0 : currentAge;
        baseLifeExpectancy = _isMissing(baseLifeExpectancy)
            ? LIFESPAN_BASE_EXPECTANCY
            : baseLifeExpectancy;

        if (!_isFiniteInt(currentAge) || currentAge < 0) return null;
        if (currentAge > LIFESPAN_MAX_AGE) return null;

        if (!_isFiniteNumber(baseLifeExpectancy) || baseLifeExpectancy <= 0) {
            return null;
        }

        var remaining = window.randomNormal(
            baseLifeExpectancy - currentAge,
            LIFESPAN_STD_DEV
        );
        if (remaining === null) return null;

        if (remaining < 0) remaining = 0;

        var deathAge = currentAge + Math.floor(remaining);

        // Belt-and-braces: the cap must never push the result below the
        // current age. With the pre-checks above this cannot happen, but
        // the invariant is worth keeping explicit.
        if (deathAge < currentAge) deathAge = currentAge;
        if (deathAge > LIFESPAN_MAX_AGE) deathAge = LIFESPAN_MAX_AGE;

        return deathAge;
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.randomRealisticAge = randomRealisticAge;
    window.randomYear = randomYear;
    window.randomFertilityModifier = randomFertilityModifier;
    window.randomLifespan = randomLifespan;

})();