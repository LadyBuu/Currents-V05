/**
 * =============================================================================
 * STILL WATERS - RANDOMNESS ENGINE (randomness.js)
 * =============================================================================
 *
 * LOCATION: js/core/randomness.js
 *
 * SINGLE SOURCE OF TRUTH for random number generation.
 *
 * SCOPE:
 *   - Seedable core RNG
 *   - Numeric distributions
 *   - Dice rolling
 *   - Array selection and shuffling
 *   - Weighted selection
 *   - Generic random data (strings)
 *
 * OUT OF SCOPE:
 *   - Simulation-specific generators (randomRealisticAge, randomLifespan,
 *     randomFertilityModifier, randomYear) → see simulation-generators.js
 *   - Application IDs → see ids.js
 *   - Time bounds → see time.js
 *   - Domain probability vocabulary (rare/common/legendary) → the domain
 *     that defines what those words mean
 *
 * INVALID-INPUT RETURN CONVENTIONS:
 *   The module uses three conventions. Which one applies depends on the
 *   function's natural output type.
 *
 *   - NUMERIC GENERATORS return null for invalid numeric arguments.
 *     (randomInt, randomFloat, roll, rollHighest, rollLowest,
 *      rollWithDropLowest, randomVariation, randomNormal, randomExponential)
 *
 *   - BOOLEAN / PROBABILITY PREDICATES return false for invalid
 *     probability input. Finite inputs outside [0,1] are clamped.
 *     (chance, checkPercentile, randomBoolean)
 *
 *   - STRUCTURED / COLLECTION OPERATIONS return their documented
 *     sentinel: undefined for "no selectable item", [] for "empty
 *     result", '' for "empty string", an error field for dice
 *     notation. (pickRandom, pickRandomMultiple, pickWeighted,
 *      pickWeightedKey, weightedTable, randomString, rollDice)
 *
 * SEMANTIC RULES:
 *   - Optional parameters default only for undefined/null. 0 is preserved.
 *   - Integer bounds must be integers. No silent floor/ceil.
 *   - Reversed numeric bounds are invalid input, not silently swapped.
 *   - Dice counts and sides must be positive safe integers.
 *   - The RNG state is global; adding a call anywhere shifts the sequence.
 *     Do NOT consume the simulation RNG stream from UI or presentation code.
 *   - No function here reads from masterData or any domain state.
 *
 * CANONICAL ENTRY POINTS
 *
 *   The module exposes the core PRNG under multiple names, all pointing
 *   at the same function so there is exactly one RNG stream:
 *
 *     window.random        — direct function form (used by names.js,
 *                            simulation-generators.js, and most callers)
 *     window.Random.next   — namespaced form, preferred by the social
 *                            domain's _roll() wrappers in
 *                            jealousy-commands.js, affair-commands.js,
 *                            and relationship-integrations.js
 *     window.randomNext    — deprecated legacy alias, honoured by those
 *                            same _roll() implementations as a fallback
 *     window.randomness    — GROUPED PROVIDER (see PROVIDER below).
 *                            Preferred by consumers that expect a
 *                            namespaced object with the standard
 *                            pickWeighted / randomInt / pickRandom shape
 *                            (notably culture-generation.js).
 *
 *   All four names consume the same `_rngState`. There is no separate
 *   stream, no divergence, and no way to accidentally fork the sequence
 *   by picking a different accessor.
 *
 *   Prior revisions exported window.random and the individual functions
 *   but not a grouped provider. The relationship domain's _roll() helpers
 *   were written against a `window.Random.next` that did not exist and
 *   a `window.randomNext` fallback that also did not exist. Those were
 *   added in a prior revision. The grouped `window.randomness` provider
 *   is added in this revision so that culture-generation.js's
 *   _resolveRng — which looks for `window.randomness` and throws when
 *   absent — finds a valid provider by default instead of requiring
 *   every caller to construct one.
 *
 * PROVIDER (window.randomness)
 *
 *   A frozen object exposing the module's function surface under the
 *   names a generic RNG provider is expected to expose:
 *
 *     pickWeighted       — items → selected item
 *     pickWeightedKey    — weight map → selected key
 *     pickRandom         — array → element
 *     pickRandomMultiple — array, count → elements
 *     randomInt          — min, max → int
 *     randomFloat        — min, max → float
 *     random             — no args → [0, 1)
 *     next               — alias for random
 *     chance             — probability → boolean
 *     randomBoolean      — trueChance → boolean
 *     shuffleArray       — array → shuffled copy
 *     shuffleArrayInPlace — array → array
 *
 *   Every function on the provider is the SAME function exported at
 *   window.<name>. There is no duplicate implementation, no second
 *   state, no wrapper layer. Passing `window.randomness` to
 *   culture-generation.js is exactly equivalent to calling the globals
 *   directly.
 *
 * DEPENDENCIES:
 *   - localStorage (optional, for seed persistence only)
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (P2-6):
 *     - window.randomness provider added. A frozen namespaced object
 *       exposing the standard RNG surface (pickWeighted, randomInt,
 *       pickRandom, random, ...). Points at the same functions the
 *       module already exports; no new RNG state, no divergence.
 *     - This unblocks culture-generation.js, whose _resolveRng requires
 *       window.randomness (or an explicit provider argument) and throws
 *       otherwise. Under the documented load order, window.getCharacterById
 *       resolves to character-queries.js's projection-returning version,
 *       so culture generation was reached via character-generator.js
 *       without an explicit provider argument and threw on every call.
 *     - Header CANONICAL ENTRY POINTS and PROVIDER sections added.
 *     - No behavioural change to any existing export.
 *   Previous revision:
 *     - window.Random and window.randomNext aliases added. Both point
 *       at the same `random` function the module already exported as
 *       window.random, so no new RNG state, no divergence, and no
 *       change to any existing caller.
 *     - The relationship domain's _roll() helpers
 *       (jealousy-commands.js, affair-commands.js,
 *       relationship-integrations.js) and
 *       relationship-bootstrap.js::REQUIRED_GLOBALS required one of
 *       these names; neither was exported, so all three _roll()
 *       helpers threw on first call and the bootstrap failed before
 *       any module ran. Fixed.
 *     - Header CANONICAL ENTRY POINTS section added.
 *     - No behavioural change to any existing export.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var RNG_CONSTANTS = Object.freeze({
        SEED_STORAGE_KEY: 'stillwaters_rng_seed',
        MAX_STRING_LENGTH: 10000
    });

    // =========================================================================
    // 2. INTERNAL HELPERS
    // =========================================================================

    function _defaultIfMissing(value, defaultValue) {
        return (value === undefined || value === null) ? defaultValue : value;
    }

    function _isFiniteInteger(value) {
        return typeof value === 'number'
            && Number.isFinite(value)
            && Number.isInteger(value);
    }

    function _isPositiveInteger(value) {
        return _isFiniteInteger(value) && value > 0;
    }

    function _isSafePositiveInteger(value) {
        return _isPositiveInteger(value) && Number.isSafeInteger(value);
    }

    function _isFiniteNonNegative(value) {
        return typeof value === 'number' && Number.isFinite(value) && value >= 0;
    }

    /**
     * Normalizes a seed into a signed 32-bit integer.
     *
     * Accepts:
     *   - finite integers (non-integers are REJECTED, not truncated)
     *   - numeric strings representing integers (canonical form)
     *
     * Returns null for anything else.
     *
     * NOTE: values beyond signed-32-bit range are reduced mod 2^32.
     * Thus 0, 4294967296, and -4294967296 all yield the same internal
     * seed. This is a property of the PRNG state, not a bug.
     * @private
     */
    function _normalizeSeed(seed) {
        if (typeof seed === 'number') {
            if (!Number.isFinite(seed)) return null;
            if (!Number.isInteger(seed)) return null;
            return seed | 0;
        }
        if (typeof seed === 'string') {
            if (!/^-?\d+$/.test(seed)) return null;
            var parsed = parseInt(seed, 10);
            if (!Number.isFinite(parsed) || !Number.isSafeInteger(parsed)) return null;
            return parsed | 0;
        }
        return null;
    }

    /**
     * Normalizes a weight to a finite non-negative number.
     * Invalid weights become 0 (excluded).
     * @private
     */
    function _normalizeWeight(w) {
        if (typeof w !== 'number') return 0;
        if (!Number.isFinite(w)) return 0;
        if (w < 0) return 0;
        return w;
    }

    // =========================================================================
    // 3. CORE RNG (Seedable)
    // =========================================================================

    var _rngSeed = Date.now() | 0;
    var _rngState = _rngSeed;

    /**
     * Sets the RNG seed.
     *
     * Accepts finite integers or canonical integer strings. Non-integer
     * numbers (e.g. 12.9) and non-integer strings (e.g. "12.9") are both
     * rejected for consistency.
     *
     * @param {number|string} seed
     * @param {boolean} [persist]
     * @throws {Error} if seed cannot be normalized
     */
    function setRandomSeed(seed, persist) {
        persist = persist === true;
        var normalized = _normalizeSeed(seed);
        if (normalized === null) {
            throw new Error(
                'setRandomSeed: seed must be a finite integer or canonical integer-string'
            );
        }

        _rngSeed = normalized;
        _rngState = normalized;

        if (persist) {
            try {
                localStorage.setItem(RNG_CONSTANTS.SEED_STORAGE_KEY, String(normalized));
            } catch (e) {
                // Optional convenience persistence; failure is not fatal.
            }
        }
    }

    function getRandomSeed() {
        return _rngSeed;
    }

    /**
     * Loads the persisted seed if available.
     * @returns {boolean} true if a seed was loaded
     */
    function loadPersistedSeed() {
        try {
            var stored = localStorage.getItem(RNG_CONSTANTS.SEED_STORAGE_KEY);
            if (stored === null) return false;
            var normalized = _normalizeSeed(stored);
            if (normalized === null) return false;
            _rngSeed = normalized;
            _rngState = normalized;
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Core PRNG. Returns float in [0, 1).
     * @returns {number}
     */
    function random() {
        _rngState = (_rngState + 0x6D2B79F5) | 0;
        var t = Math.imul(_rngState ^ (_rngState >>> 15), 1 | _rngState);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /**
     * Random integer in [min, max], inclusive.
     *
     * Requires integer bounds. Reversed bounds are invalid input and
     * return null. Fractional bounds are invalid input.
     *
     * @param {number} min
     * @param {number} max
     * @returns {number|null}
     */
    function randomInt(min, max) {
        if (!_isFiniteInteger(min) || !_isFiniteInteger(max)) return null;
        if (min > max) return null;
        return Math.floor(random() * (max - min + 1)) + min;
    }

    /**
     * Random float in [min, max).
     *
     * Reversed bounds are invalid input and return null.
     *
     * @param {number} min
     * @param {number} max
     * @returns {number|null}
     */
    function randomFloat(min, max) {
        if (typeof min !== 'number' || typeof max !== 'number') return null;
        if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
        if (min > max) return null;
        return min + random() * (max - min);
    }

    /**
     * True with the given probability.
     *
     * Finite probabilities are clamped to [0, 1].
     * Non-finite or non-numeric input returns false.
     *
     * @param {number} probability
     * @returns {boolean}
     */
    function chance(probability) {
        if (typeof probability !== 'number' || !Number.isFinite(probability)) {
            return false;
        }
        var p = probability < 0 ? 0 : (probability > 1 ? 1 : probability);
        return random() < p;
    }

    // =========================================================================
    // 4. DICE ROLLING
    // =========================================================================

    /**
     * Rolls dice notation: "2d6", "d20", "2d6+4", "2d6-1".
     * Returns an error field for invalid notation or out-of-range values.
     *
     * Count and sides must be positive safe integers; modifier must be a
     * safe integer. This prevents silent precision loss on absurd input
     * like "2d6+999999999999999999999".
     *
     * @param {string} diceString
     * @returns {{ total: number, rolls: number[], modifier: number, error?: string }}
     */
    function rollDice(diceString) {
        if (typeof diceString !== 'string') {
            return { total: 0, rolls: [], modifier: 0, error: 'Invalid dice notation' };
        }

        var match = diceString.match(/^(\d*)d(\d+)([+-]\d+)?$/i);
        if (!match) {
            return { total: 0, rolls: [], modifier: 0, error: 'Invalid dice notation' };
        }

        var count = match[1] === '' ? 1 : parseInt(match[1], 10);
        var sides = parseInt(match[2], 10);
        var modifier = match[3] ? parseInt(match[3], 10) : 0;

        if (!_isSafePositiveInteger(count)) {
            return { total: 0, rolls: [], modifier: 0, error: 'Dice count must be positive' };
        }
        if (count > 1000) {
            return { total: 0, rolls: [], modifier: 0, error: 'Too many dice (max 1000)' };
        }
        if (!_isSafePositiveInteger(sides) || sides > 10000) {
            return { total: 0, rolls: [], modifier: 0, error: 'Invalid number of sides' };
        }
        if (!Number.isSafeInteger(modifier)) {
            return { total: 0, rolls: [], modifier: 0, error: 'Modifier out of range' };
        }

        var rolls = [];
        var sum = 0;
        for (var i = 0; i < count; i++) {
            var r = randomInt(1, sides);
            rolls.push(r);
            sum += r;
        }
        return { total: sum + modifier, rolls: rolls, modifier: modifier };
    }

    /**
     * Rolls a single die with the given number of sides.
     * Returns null for invalid sides.
     */
    function roll(sides) {
        if (!_isPositiveInteger(sides)) return null;
        return randomInt(1, sides);
    }

    /**
     * Rolls `count` dice, returns the highest.
     * Returns null for invalid inputs.
     */
    function rollHighest(count, sides) {
        if (!_isPositiveInteger(count)) return null;
        if (!_isPositiveInteger(sides)) return null;

        var highest = 0;
        for (var i = 0; i < count; i++) {
            var r = randomInt(1, sides);
            if (r > highest) highest = r;
        }
        return highest;
    }

    /**
     * Rolls `count` dice, returns the lowest.
     * Returns null for invalid inputs.
     */
    function rollLowest(count, sides) {
        if (!_isPositiveInteger(count)) return null;
        if (!_isPositiveInteger(sides)) return null;

        var lowest = Infinity;
        for (var i = 0; i < count; i++) {
            var r = randomInt(1, sides);
            if (r < lowest) lowest = r;
        }
        return lowest === Infinity ? null : lowest;
    }

    /**
     * Rolls `count` dice, drops the lowest `dropLowest`, sums remaining.
     *
     * Returns null for invalid count/sides/dropLowest.
     * Returns 0 if dropLowest >= count (all dice dropped) — this is a
     * legitimate mathematical result, not an error.
     */
    function rollWithDropLowest(count, sides, dropLowest) {
        if (!_isPositiveInteger(count)) return null;
        if (!_isPositiveInteger(sides)) return null;

        dropLowest = _defaultIfMissing(dropLowest, 0);
        if (!_isFiniteInteger(dropLowest) || dropLowest < 0) return null;

        var rolls = [];
        for (var i = 0; i < count; i++) {
            rolls.push(randomInt(1, sides));
        }
        rolls.sort(function(a, b) { return b - a; });

        var keep = Math.max(0, count - dropLowest);
        var sum = 0;
        for (var j = 0; j < keep; j++) {
            sum += rolls[j];
        }
        return sum;
    }

    // =========================================================================
    // 5. ARRAY RANDOMIZATION
    // =========================================================================

    /**
     * Picks a random element from an array.
     * @param {Array} arr
     * @returns {*|undefined}
     */
    function pickRandom(arr) {
        if (!Array.isArray(arr) || arr.length === 0) return undefined;
        return arr[Math.floor(random() * arr.length)];
    }

    /**
     * Picks `count` distinct random elements from an array.
     *
     * CAP SEMANTICS: if count exceeds arr.length, the entire array is
     * returned (shuffled) rather than an error. This is a deliberate
     * convenience for a generic selection helper.
     *
     * Returns null only if count is not a non-negative integer.
     *
     * @param {Array} arr
     * @param {number} count
     * @returns {Array|null}
     */
    function pickRandomMultiple(arr, count) {
        if (!Number.isInteger(count) || count < 0) return null;
        if (count === 0) return [];
        if (!Array.isArray(arr) || arr.length === 0) return [];

        var actual = Math.min(count, arr.length);
        var shuffled = shuffleArray(arr.slice());
        return shuffled.slice(0, actual);
    }

    /**
     * Weighted random selection.
     *
     * Zero-weight items are never selected.
     * Invalid weights (NaN, Infinity, negative, non-numeric) are treated
     * as 0 and are therefore excluded. This is intentional for a generic
     * utility: malformed weights degrade to exclusion rather than
     * throwing. Callers who want strict weight validation should
     * validate before calling.
     *
     * Returns undefined when:
     *   - items is not a non-empty array
     *   - total weight is 0 (all items have weight 0)
     *
     * @param {Array} items
     * @param {Function} [weightGetter]
     * @returns {*|undefined}
     */
    function pickWeighted(items, weightGetter) {
        if (!Array.isArray(items) || items.length === 0) return undefined;

        var totalWeight = 0;
        var weights = [];

        for (var i = 0; i < items.length; i++) {
            var w;
            if (typeof weightGetter === 'function') {
                w = weightGetter(items[i]);
            } else if (items[i] && typeof items[i] === 'object') {
                w = items[i].weight;
            } else {
                w = 1;
            }
            w = _normalizeWeight(w);
            weights.push(w);
            totalWeight += w;
        }

        if (totalWeight === 0) return undefined;

        var roll_ = random() * totalWeight;
        var accumulated = 0;
        for (var j = 0; j < items.length; j++) {
            if (weights[j] === 0) continue;
            accumulated += weights[j];
            if (roll_ < accumulated) return items[j];
        }

        for (var k = items.length - 1; k >= 0; k--) {
            if (weights[k] > 0) return items[k];
        }
        return undefined;
    }

    /**
     * Picks a random key from an object by weight values.
     *
     * Returns undefined when no valid weights exist. (Uniform with
     * pickWeighted's "no selectable item" result.)
     *
     * @param {Object} weightedMap
     * @returns {string|undefined}
     */
    function pickWeightedKey(weightedMap) {
        if (!weightedMap || typeof weightedMap !== 'object') return undefined;

        var entries = [];
        var keys = Object.keys(weightedMap);
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            if (!Object.prototype.hasOwnProperty.call(weightedMap, k)) continue;
            var w = _normalizeWeight(weightedMap[k]);
            if (w > 0) entries.push({ key: k, weight: w });
        }

        if (entries.length === 0) return undefined;

        var total = 0;
        for (var j = 0; j < entries.length; j++) total += entries[j].weight;

        var roll_ = random() * total;
        var accumulated = 0;
        for (var m = 0; m < entries.length; m++) {
            accumulated += entries[m].weight;
            if (roll_ < accumulated) return entries[m].key;
        }
        return entries[entries.length - 1].key;
    }

    // =========================================================================
    // 6. ARRAY SHUFFLING
    // =========================================================================

    /**
     * In-place Fisher-Yates shuffle. Mutates its input.
     */
    function shuffleArrayInPlace(arr) {
        if (!Array.isArray(arr)) return arr;
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(random() * (i + 1));
            var temp = arr[i];
            arr[i] = arr[j];
            arr[j] = temp;
        }
        return arr;
    }

    /**
     * Returns a shuffled copy.
     */
    function shuffleArray(arr) {
        if (!Array.isArray(arr)) return [];
        return shuffleArrayInPlace(arr.slice());
    }

    /**
     * Shuffles characters in a string.
     * Uses Array.from to respect code points (not UTF-16 units). Not
     * fully grapheme-cluster aware.
     */
    function shuffleString(str) {
        if (!str) return '';
        var chars = Array.from(str);
        shuffleArrayInPlace(chars);
        return chars.join('');
    }

    // =========================================================================
    // 7. PROBABILITY HELPERS
    // =========================================================================

    /**
     * Rolls d100, returns 1-100.
     */
    function percentile() {
        return randomInt(1, 100);
    }

    /**
     * True if percentile() <= target.
     *
     * Non-finite target returns false. Finite targets are NOT clamped;
     * a target <= 0 is always false and a target >= 100 is always true.
     * This matches the natural mathematical meaning of "roll at or below
     * target on a d100."
     */
    function checkPercentile(target) {
        if (typeof target !== 'number' || !Number.isFinite(target)) return false;
        return percentile() <= target;
    }

    /**
     * Returns a boolean with the given bias toward true.
     * Preserves 0 and 1 as valid biases. See chance() for clamping.
     */
    function randomBoolean(trueChance) {
        trueChance = _defaultIfMissing(trueChance, 0.5);
        return chance(trueChance);
    }

    /**
     * Returns -1 or 1.
     */
    function randomSign() {
        return randomBoolean() ? 1 : -1;
    }

    /**
     * Adds random ±% variation to a base value.
     *
     * Variation magnitude is computed from Math.abs(base), so negative
     * bases work as expected: randomVariation(-100, 0.1) varies -100 by
     * ±10, not by ±(-10).
     *
     * @param {number} base
     * @param {number} percentVariation - magnitude (0.1 = ±10%)
     * @returns {number|null}
     */
    function randomVariation(base, percentVariation) {
        if (typeof base !== 'number' || !Number.isFinite(base)) return null;
        percentVariation = _defaultIfMissing(percentVariation, 0);
        if (typeof percentVariation !== 'number' || !Number.isFinite(percentVariation)) {
            return null;
        }

        var magnitude = Math.abs(percentVariation);
        if (magnitude === 0) return base;

        var variation = Math.abs(base) * magnitude;
        return base + randomFloat(-variation, variation);
    }

    /**
     * Normal distribution (Box-Muller).
     *
     * stdDev must be a finite non-negative number. stdDev of 0 returns
     * mean WITHOUT consuming RNG state — a useful deterministic property.
     */
    function randomNormal(mean, stdDev) {
        mean = _defaultIfMissing(mean, 0);
        stdDev = _defaultIfMissing(stdDev, 1);

        if (typeof mean !== 'number' || !Number.isFinite(mean)) return null;
        if (typeof stdDev !== 'number' || !Number.isFinite(stdDev)) return null;
        if (stdDev < 0) return null;
        if (stdDev === 0) return mean;

        var u = 0, v = 0;
        while (u === 0) u = random();
        while (v === 0) v = random();
        var z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        return mean + z * stdDev;
    }

    /**
     * Alias for randomNormal.
     */
    function randomGaussian(mean, stdDev) {
        return randomNormal(mean, stdDev);
    }

    /**
     * Power-transformed uniform distribution over [min, max].
     *
     * The name is historical: this is NOT the standard mathematical
     * exponential distribution. It samples random()^exponent and maps
     * that onto [min, max]. exponent 0 → min; exponent 1 → uniform.
     *
     * Reversed bounds return null.
     */
    function randomExponential(min, max, exponent) {
        min = _defaultIfMissing(min, 0);
        max = _defaultIfMissing(max, 1);
        exponent = _defaultIfMissing(exponent, 0.5);

        if (typeof min !== 'number' || !Number.isFinite(min)) return null;
        if (typeof max !== 'number' || !Number.isFinite(max)) return null;
        if (typeof exponent !== 'number' || !Number.isFinite(exponent)) return null;
        if (min > max) return null;
        if (exponent < 0) return null;

        if (exponent === 0) return min;
        var raw = min + Math.pow(random(), exponent) * (max - min);
        return Math.min(max, Math.max(min, raw));
    }

    // =========================================================================
    // 8. RANDOM DATA GENERATION
    // =========================================================================

    /**
     * Generates a random alphanumeric string.
     *
     * SAFETY CAP: lengths greater than MAX_STRING_LENGTH are silently
     * reduced to the cap. This is a defensive limit, not a contract
     * violation — asking for 10 billion characters is never useful.
     * Non-positive or non-integer length returns ''.
     *
     * @param {number} [length] - default 8
     * @returns {string}
     */
    function randomString(length) {
        length = _defaultIfMissing(length, 8);
        if (!Number.isInteger(length) || length <= 0) return '';
        if (length > RNG_CONSTANTS.MAX_STRING_LENGTH) length = RNG_CONSTANTS.MAX_STRING_LENGTH;

        var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        var result = '';
        for (var i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(random() * chars.length));
        }
        return result;
    }

    // =========================================================================
    // 9. WEIGHTED CHANCE TABLES
    // =========================================================================

    /**
     * Looks up a weighted chance table: [{ chance, result }, ...].
     * Invalid chances are excluded (same policy as pickWeighted).
     * Returns undefined when no valid entries exist.
     *
     * @param {Array} table
     * @returns {*|undefined}
     */
    function weightedTable(table) {
        if (!Array.isArray(table) || table.length === 0) return undefined;

        var valid = [];
        var total = 0;
        for (var i = 0; i < table.length; i++) {
            var entry = table[i];
            if (!entry) continue;
            var c = _normalizeWeight(entry.chance);
            if (c > 0) {
                valid.push({ chance: c, result: entry.result });
                total += c;
            }
        }
        if (valid.length === 0) return undefined;

        var roll_ = random() * total;
        var accumulated = 0;
        for (var j = 0; j < valid.length; j++) {
            accumulated += valid[j].chance;
            if (roll_ < accumulated) return valid[j].result;
        }
        return valid[valid.length - 1].result;
    }

    /**
     * Creates a function that picks a weighted item from items.
     *
     * Missing weight (undefined/null) defaults to 1.
     * Zero weight excludes the item.
     */
    function createWeightedTable(items, weightKey) {
        weightKey = _defaultIfMissing(weightKey, 'weight');
        return function() {
            return pickWeighted(items, function(item) {
                if (!item || typeof item !== 'object') return 1;
                var w = item[weightKey];
                if (w === undefined || w === null) return 1;
                return w;
            });
        };
    }

    // =========================================================================
    // 10. CHANCE TABLES
    // =========================================================================
    //
    // Generic convenience helpers. The dice aliases are pure wrappers over
    // the dice engine. Domain vocabulary (rare, common, legendary, etc.)
    // does NOT live here — those words are policy, and if a module needs
    // them, it should define them.

    var CHANCE_TABLES = Object.freeze({
        oneIn: function(x) {
            if (typeof x !== 'number' || x < 1) return false;
            return chance(1 / x);
        },
        d4: function() { return roll(4); },
        d6: function() { return roll(6); },
        d8: function() { return roll(8); },
        d10: function() { return roll(10); },
        d12: function() { return roll(12); },
        d20: function() { return roll(20); },
        d100: function() { return percentile(); }
    });

    // =========================================================================
    // 11. PROVIDER (window.randomness)
    // =========================================================================
    //
    // Frozen grouped provider exposing the standard RNG surface.
    // Consumers that expect a namespaced object (notably
    // culture-generation.js's _resolveRng) get a valid provider by
    // default instead of needing to construct one.
    //
    // Every function below is the SAME function exported at window.<name>
    // in section 12. There is no wrapper, no second state, no divergence.

    var randomnessProvider = Object.freeze({
        // Core
        random:               random,
        next:                 random,    // alias for the namespaced form

        // Numeric
        randomInt:            randomInt,
        randomFloat:          randomFloat,
        randomNormal:         randomNormal,
        randomGaussian:       randomGaussian,
        randomExponential:    randomExponential,
        randomVariation:      randomVariation,

        // Probability
        chance:               chance,
        randomBoolean:        randomBoolean,
        randomSign:           randomSign,
        percentile:           percentile,
        checkPercentile:      checkPercentile,

        // Selection
        pickRandom:           pickRandom,
        pickRandomMultiple:   pickRandomMultiple,
        pickWeighted:         pickWeighted,
        pickWeightedKey:      pickWeightedKey,

        // Shuffling
        shuffleArray:         shuffleArray,
        shuffleArrayInPlace:  shuffleArrayInPlace,
        shuffleString:        shuffleString,

        // Dice
        roll:                 roll,
        rollDice:             rollDice,
        rollHighest:          rollHighest,
        rollLowest:           rollLowest,
        rollWithDropLowest:   rollWithDropLowest,

        // Tables
        weightedTable:        weightedTable,
        createWeightedTable:  createWeightedTable,

        // String
        randomString:         randomString
    });

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    window.RNG_CONSTANTS = RNG_CONSTANTS;

    // Seed management
    window.setRandomSeed = setRandomSeed;
    window.getRandomSeed = getRandomSeed;
    window.loadPersistedSeed = loadPersistedSeed;

    // Core RNG
    window.random = random;
    window.randomInt = randomInt;
    window.randomFloat = randomFloat;
    window.chance = chance;

    // Canonical namespaced accessors. All point at the same `random`
    // function exported above. See CANONICAL ENTRY POINTS in the header.
    //
    //   window.Random.next   — namespaced form, preferred by the social
    //                          domain's _roll() helpers
    //   window.randomNext    — deprecated legacy alias, honoured by
    //                          those same _roll() helpers as a fallback
    //
    // Neither introduces a second RNG stream. Both consume _rngState.
    window.Random = Object.freeze({ next: random });
    window.randomNext = random;

    // Grouped provider (frozen). See PROVIDER in the header.
    // Every method points at the same function exported at window.<name>.
    // Consumers that expect a namespaced surface use this; consumers that
    // call the individual globals get identical behaviour.
    window.randomness = randomnessProvider;

    // Dice
    window.rollDice = rollDice;
    window.roll = roll;
    window.rollHighest = rollHighest;
    window.rollLowest = rollLowest;
    window.rollWithDropLowest = rollWithDropLowest;

    // Array randomization
    window.pickRandom = pickRandom;
    window.pickRandomMultiple = pickRandomMultiple;
    window.pickWeighted = pickWeighted;
    window.pickWeightedKey = pickWeightedKey;

    // Shuffling
    window.shuffleArrayInPlace = shuffleArrayInPlace;
    window.shuffleArray = shuffleArray;
    window.shuffleString = shuffleString;

    // Probability helpers
    window.percentile = percentile;
    window.checkPercentile = checkPercentile;
    window.randomBoolean = randomBoolean;
    window.randomSign = randomSign;
    window.randomVariation = randomVariation;
    window.randomNormal = randomNormal;
    window.randomGaussian = randomGaussian;
    window.randomExponential = randomExponential;

    // Random data
    window.randomString = randomString;

    // Weighted tables
    window.weightedTable = weightedTable;
    window.createWeightedTable = createWeightedTable;
    window.CHANCE_TABLES = CHANCE_TABLES;

})();
