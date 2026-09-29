/**
 * =============================================================================
 * STILL WATERS - CULTURE GENERATION
 * js/culture/culture-generation.js
 * =============================================================================
 *
 * Deterministic-under-seed appearance generation from culture data.
 *
 * Two layers live in this file, and they have deliberately different
 * dependency profiles:
 *
 *   PURE CORE
 *       rollWeightedValue(options, rng)
 *       rollWeightedValues(options, count, rng)
 *       rollHeight(config, gender, rng)
 *       generateAppearanceFromCulture(culture, gender, opts, rng)
 *
 *       No window lookups. No CultureQueries. No CultureState. No
 *       masterData. Given the same inputs and the same RNG, these produce
 *       the same output. This is what unit tests use.
 *
 *   QUERY-INTEGRATED WRAPPERS
 *       generateAppearance(cultureId, gender, opts, rng)
 *       generateAppearanceForLocation(locationId, gender, opts, rng)
 *       generateAppearanceWithRandomCulture(gender, opts, rng)
 *
 *       These resolve a culture through CultureQueries and then delegate
 *       to the pure core. They are the only functions that require the
 *       Culture subsystem to be present.
 *
 * The module does NOT:
 *   - read canonical data directly
 *   - read CultureState directly
 *   - read masterData
 *   - mutate anything
 *   - emit events
 *   - persist
 *   - decide which culture applies to a location (that is CultureQueries)
 *
 * RNG contract:
 *   The randomness source is a required argument, not a hidden global.
 *   Callers pass `window.randomness` (or any object exposing the same
 *   API) explicitly. This makes generation testable and removes the
 *   "fallback to a local Math.random implementation" habit.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY REQUIREMENT
    // =========================================================================

    function _requireQueries() {
        if (!window.CultureQueries) {
            throw new Error(
                'CultureGeneration requires CultureQueries for culture resolution.'
            );
        }
        return window.CultureQueries;
    }

    /**
     * Requires an RNG provider.
     *
     * The provider must expose:
     *     pickWeighted(items)
     *     randomInt(min, max)
     *     pickRandom(arr)
     *
     * If a caller does not supply one, `window.randomness` is used.
     * If neither exists, this throws. There is no local Math.random
     * fallback, because a silent difference in RNG semantics is exactly
     * the kind of bug that hides for years.
     */
    function _resolveRng(rng) {
        if (rng) return _assertRngShape(rng);
        if (window.randomness) return _assertRngShape(window.randomness);
        throw new Error(
            'CultureGeneration requires a randomness provider. ' +
            'Pass one explicitly, or expose window.randomness.'
        );
    }

    function _assertRngShape(rng) {
        if (typeof rng.pickWeighted !== 'function' ||
            typeof rng.randomInt !== 'function' ||
            typeof rng.pickRandom !== 'function') {
            throw new Error(
                'RNG provider must expose pickWeighted, randomInt, and pickRandom.'
            );
        }
        return rng;
    }

    // =========================================================================
    // 2. OPTION HELPERS
    // =========================================================================

    /**
     * Reads an option using explicit missing-value semantics.
     *
     *     readOption({ commonFeatureCount: 0 }, 'commonFeatureCount', 2)
     *         -> 0
     *
     *     readOption({}, 'commonFeatureCount', 2)
     *         -> 2
     *
     *     readOption({ commonFeatureCount: null }, 'commonFeatureCount', 2)
     *         -> null
     */
    function _readOption(options, key, fallback) {
        if (!options) return fallback;
        if (!Object.prototype.hasOwnProperty.call(options, key)) return fallback;
        return options[key];
    }

    // =========================================================================
    // 3. PURE CORE — WEIGHTED ROLLS
    // =========================================================================

    /**
     * Rolls a single value from a weighted option list.
     *
     * @param {Array} options   [{ value, weight }, ...]
     * @param {Object} rng
     * @returns {*} The selected `.value`, or undefined if the list is empty.
     */
    function rollWeightedValue(options, rng) {
        if (!Array.isArray(options) || options.length === 0) return undefined;
        var rngImpl = _resolveRng(rng);
        var selected = rngImpl.pickWeighted(options);
        return selected ? selected.value : undefined;
    }

    /**
     * Rolls N distinct values from a weighted option list.
     *
     * @param {Array} options
     * @param {number} count
     * @param {Object} rng
     * @returns {Array}
     */
    function rollWeightedValues(options, count, rng) {
        if (!Array.isArray(options) || options.length === 0) return [];
        if (typeof count !== 'number' || count <= 0) return [];

        var rngImpl = _resolveRng(rng);
        var remaining = options.slice();
        var results = [];
        var take = Math.min(count, remaining.length);

        for (var i = 0; i < take; i++) {
            var selected = rngImpl.pickWeighted(remaining);
            if (!selected) break;
            results.push(selected.value);
            var idx = remaining.indexOf(selected);
            if (idx !== -1) remaining.splice(idx, 1);
        }
        return results;
    }

    /**
     * Rolls a height within a gender-specific range.
     *
     * @param {Object} heightConfig { male: { min, max }, female: { min, max } }
     * @param {string} gender       'male' or 'female'
     * @param {Object} rng
     * @param {Object} [fallback]   { min, max } used when heightConfig is
     *                              absent. If neither the config nor the
     *                              fallback supplies a range, returns null.
     * @returns {number|null}
     */
    function rollHeight(heightConfig, gender, rng, fallback) {
        var rngImpl = _resolveRng(rng);
        var range = _resolveHeightRange(heightConfig, gender, fallback);
        if (!range) return null;
        return rngImpl.randomInt(range.min, range.max);
    }

    function _resolveHeightRange(heightConfig, gender, fallback) {
        if (heightConfig && typeof heightConfig === 'object') {
            var genderRange = gender ? heightConfig[gender] : null;
            if (genderRange &&
                typeof genderRange.min === 'number' &&
                typeof genderRange.max === 'number') {
                return genderRange;
            }
            // Some cultures may store a single flat range rather than
            // per-gender ranges. Accept that shape only if both bounds
            // exist as numbers.
            if (typeof heightConfig.min === 'number' &&
                typeof heightConfig.max === 'number') {
                return heightConfig;
            }
        }

        if (fallback &&
            typeof fallback.min === 'number' &&
            typeof fallback.max === 'number') {
            return fallback;
        }

        return null;
    }

    // =========================================================================
    // 4. PURE CORE — FULL APPEARANCE
    // =========================================================================

    /**
     * Generates a complete appearance object from a culture.
     *
     * @param {Object} culture      canonical culture record (or null)
     * @param {string} gender       'male' or 'female'
     * @param {Object} [options]    generation options
     * @param {Object} rng
     * @returns {Object} appearance
     */
    function generateAppearanceFromCulture(culture, gender, options, rng) {
        options = options || {};
        var rngImpl = _resolveRng(rng);

        var appearance = culture && culture.appearance ? culture.appearance : {};

        var featureCount = _readOption(options, 'commonFeatureCount', undefined);
        if (featureCount === undefined) {
            featureCount = rngImpl.randomInt(1, 2);
        }

        var commonFeatures = rollWeightedValues(
            appearance.commonFeatures,
            featureCount,
            rngImpl
        );

        return {
            skinTone: rollWeightedValue(appearance.skinTones, rngImpl),
            eyeColor: rollWeightedValue(appearance.eyeColors, rngImpl),
            hairColor: rollWeightedValue(appearance.hairColors, rngImpl),
            hairType: rollWeightedValue(appearance.hairTypes, rngImpl),
            build: rollWeightedValue(appearance.buildTypes, rngImpl),
            height: rollHeight(appearance.height, gender, rngImpl, options.heightFallback),
            commonFeatures: commonFeatures
        };
    }

    // =========================================================================
    // 5. QUERY-INTEGRATED WRAPPERS
    // =========================================================================

    /**
     * Generates appearance for a culture by ID.
     *
     * If the culture is not found, this throws. Callers who want a
     * generic appearance should pass a culture object to the pure core
     * directly, or use generateAppearanceWithRandomCulture.
     *
     * @param {string} cultureId
     * @param {string} gender
     * @param {Object} [options]
     * @param {Object} [rng]
     * @returns {Object} appearance
     */
    function generateAppearance(cultureId, gender, options, rng) {
        if (!cultureId) {
            throw new Error(
                'generateAppearance requires a cultureId. ' +
                'To generate without a culture, call generateAppearanceFromCulture directly.'
            );
        }

        var queries = _requireQueries();
        var culture = queries.getCultureById(cultureId);
        if (!culture) {
            throw new Error('Culture not found: ' + cultureId);
        }

        return generateAppearanceFromCulture(culture, gender, options, rng);
    }

    /**
     * Generates appearance for a location using its primary culture.
     *
     * If no primary culture applies to the location (or its ancestors),
     * this throws. Callers who want a "best effort" behaviour should
     * call getPrimaryCultureForLocation themselves and decide.
     *
     * @param {string} locationId
     * @param {string} gender
     * @param {Object} [options]
     * @param {Object} [rng]
     * @returns {Object} appearance
     */
    function generateAppearanceForLocation(locationId, gender, options, rng) {
        if (!locationId) {
            throw new Error('generateAppearanceForLocation requires a locationId.');
        }

        var queries = _requireQueries();
        var culture = queries.getPrimaryCultureForLocation(locationId);
        if (!culture) {
            throw new Error(
                'No primary culture applies to location: ' + locationId
            );
        }

        return generateAppearanceFromCulture(culture, gender, options, rng);
    }

    /**
     * Generates appearance from a randomly selected culture.
     *
     * @param {string} gender
     * @param {Object} [options]
     * @param {Object} [rng]
     * @returns {{ culture: Object, appearance: Object }}
     */
    function generateAppearanceWithRandomCulture(gender, options, rng) {
        var rngImpl = _resolveRng(rng);
        var queries = _requireQueries();

        var cultures = queries.getAllCultures();
        if (cultures.length === 0) {
            throw new Error(
                'No cultures available. Cannot generate appearance with a random culture.'
            );
        }

        var culture = rngImpl.pickRandom(cultures);
        var appearance = generateAppearanceFromCulture(culture, gender, options, rngImpl);

        return { culture: culture, appearance: appearance };
    }

    // =========================================================================
    // 6. PUBLIC API
    // =========================================================================

    window.CultureGeneration = {
        // Pure core
        rollWeightedValue: rollWeightedValue,
        rollWeightedValues: rollWeightedValues,
        rollHeight: rollHeight,
        generateAppearanceFromCulture: generateAppearanceFromCulture,

        // Query-integrated
        generateAppearance: generateAppearance,
        generateAppearanceForLocation: generateAppearanceForLocation,
        generateAppearanceWithRandomCulture: generateAppearanceWithRandomCulture
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CultureGeneration;
    }

})();
