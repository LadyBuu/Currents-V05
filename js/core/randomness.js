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
 *   - Generic random data (strings, UUID-like tokens)
 * 
 * OUT OF SCOPE:
 *   - Simulation-specific generators (randomRealisticAge, randomLifespan,
 *     randomFertilityModifier, randomYear) → see simulation-generators.js
 *   - Application IDs → see ids.js
 *   - Time bounds → see time.js
 * 
 * SEMANTIC RULES:
 *   - Invalid numeric arguments return null (not 0, which is legitimate).
 *   - Optional parameters are only defaulted for `undefined`/`null`.
 *   - 0 is preserved as a valid value everywhere.
 *   - Dice counts and sides must be positive integers.
 *   - Weighted selection with totalWeight === 0 returns undefined.
 *   - The RNG state is global; adding a call anywhere shifts the sequence.
 *   - No function here reads from masterData or any domain state.
 * 
 * DEPENDENCIES: 
 *   - localStorage (optional, for seed persistence only)
 * 
 * ICON POLICY: No emojis. No icons.
 * 
 * =============================================================================
 */

// =============================================================================
// 1. CONSTANTS
// =============================================================================

var RNG_CONSTANTS = Object.freeze({
    SEED_STORAGE_KEY: 'stillwaters_rng_seed'
});

// =============================================================================
// 2. INTERNAL HELPERS
// =============================================================================

/**
 * Returns defaultValue only when value is undefined or null.
 * Preserves 0, '', false.
 * @private
 */
function _defaultIfMissing(value, defaultValue) {
    return (value === undefined || value === null) ? defaultValue : value;
}

/**
 * Returns true if value is a finite integer.
 * @private
 */
function _isFiniteInteger(value) {
    return typeof value === 'number'
        && Number.isFinite(value)
        && Number.isInteger(value);
}

/**
 * Returns true if value is a positive integer (>= 1).
 * @private
 */
function _isPositiveInteger(value) {
    return _isFiniteInteger(value) && value > 0;
}

/**
 * Returns true if value is a finite non-negative number.
 * @private
 */
function _isFiniteNonNegative(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * Normalizes a seed into a signed 32-bit integer.
 * Accepts:
 *   - finite integers
 *   - numeric strings representing integers
 * Rejects everything else (returns null).
 * @private
 */
function _normalizeSeed(seed) {
    if (typeof seed === 'number') {
        if (!Number.isFinite(seed)) return null;
        if (!Number.isInteger(seed)) {
            // Truncate finite non-integers to keep historical behavior
            seed = Math.floor(seed);
        }
        return seed | 0;
    }

    if (typeof seed === 'string') {
        if (!/^-?\d+$/.test(seed)) return null;
        var parsed = parseInt(seed, 10);
        if (!Number.isFinite(parsed)) return null;
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

// =============================================================================
// 3. CORE RNG (Seedable)
// =============================================================================

var _rngSeed = Date.now() | 0;
var _rngState = _rngSeed;

/**
 * Sets the RNG seed.
 * 
 * @param {number|string} seed - finite integer or integer-string
 * @param {boolean} [persist] - if true, persist to localStorage
 * @throws {Error} if seed cannot be normalized
 */
function setRandomSeed(seed, persist) {
    persist = persist === true;
    var normalized = _normalizeSeed(seed);
    if (normalized === null) {
        throw new Error('setRandomSeed: seed must be a finite integer or integer-string');
    }

    _rngSeed = normalized;
    _rngState = normalized;

    if (persist) {
        try {
            localStorage.setItem(RNG_CONSTANTS.SEED_STORAGE_KEY, String(normalized));
        } catch (e) {
            // localStorage unavailable; seed persists in memory only
        }
    }
}

/**
 * Returns the current seed (the starting point, not the current state).
 * @returns {number}
 */
function getRandomSeed() {
    return _rngSeed;
}

/**
 * Loads the persisted seed from localStorage if available.
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
 * Random integer in [min, max] (inclusive).
 * 
 * Returns null if inputs are not finite numbers.
 * Returns null if either bound is not finite.
 * 
 * @param {number} min
 * @param {number} max
 * @returns {number|null}
 */
function randomInt(min, max) {
    if (typeof min !== 'number' || typeof max !== 'number') return null;
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;

    var lo = Math.ceil(min);
    var hi = Math.floor(max);
    if (lo > hi) {
        var tmp = lo;
        lo = hi;
        hi = tmp;
    }
    return Math.floor(random() * (hi - lo + 1)) + lo;
}

/**
 * Random float in [min, max).
 * 
 * Returns null if inputs are not finite numbers.
 * 
 * @param {number} min
 * @param {number} max
 * @returns {number|null}
 */
function randomFloat(min, max) {
    if (typeof min !== 'number' || typeof max !== 'number') return null;
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    if (min > max) {
        var tmp = min;
        min = max;
        max = tmp;
    }
    return min + random() * (max - min);
}

/**
 * True with the given probability.
 * Returns false for non-finite probability.
 * 
 * @param {number} probability - clamped to [0, 1]
 * @returns {boolean}
 */
function chance(probability) {
    if (typeof probability !== 'number' || !Number.isFinite(probability)) {
        return false;
    }
    var p = Math.min(1, Math.max(0, probability));
    return random() < p;
}

// =============================================================================
// 4. DICE ROLLING
// =============================================================================

/**
 * Rolls dice notation: "2d6", "d20", "2d6+4", "2d6-1".
 * Returns an error field for invalid notation or count/sides out of range.
 * 
 * @param {string} diceString
 * @returns {{ total: number, rolls: number[], modifier: number, error?: string }}
 */
function rollDice(diceString) {
    var match = String(diceString).match(/^(\d*)d(\d+)([+-]\d+)?$/i);
    if (!match) {
        return { total: 0, rolls: [], modifier: 0, error: 'Invalid dice notation' };
    }

    var count = match[1] === '' ? 1 : parseInt(match[1], 10);
    var sides = parseInt(match[2], 10);
    var modifier = match[3] ? parseInt(match[3], 10) : 0;

    if (!_isPositiveInteger(count)) {
        return { total: 0, rolls: [], modifier: 0, error: 'Dice count must be positive' };
    }
    if (count > 1000) {
        return { total: 0, rolls: [], modifier: 0, error: 'Too many dice (max 1000)' };
    }
    if (!_isPositiveInteger(sides) || sides > 10000) {
        return { total: 0, rolls: [], modifier: 0, error: 'Invalid number of sides' };
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
 * 
 * @param {number} sides - must be a positive integer
 * @returns {number|null}
 */
function roll(sides) {
    if (!_isPositiveInteger(sides)) return null;
    return randomInt(1, sides);
}

/**
 * Rolls `count` dice, returns the highest.
 * Returns null for invalid inputs.
 * 
 * @param {number} count
 * @param {number} sides
 * @returns {number|null}
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
 * 
 * @param {number} count
 * @param {number} sides
 * @returns {number|null}
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
 * Returns null if count/sides are invalid or dropLowest is not a
 * non-negative integer.
 * Returns 0 if dropLowest >= count (all dice dropped).
 * 
 * @param {number} count
 * @param {number} sides
 * @param {number} [dropLowest] - default 0
 * @returns {number|null}
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

// =============================================================================
// 5. ARRAY RANDOMIZATION
// =============================================================================

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
 * Returns null if count is not a non-negative integer.
 * Returns [] if count is 0 or arr is empty.
 * Caps count at arr.length.
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
 * Invalid weights (NaN, Infinity, negative) are treated as 0.
 * 
 * Returns undefined when:
 *   - items is not a non-empty array
 *   - total weight is 0 (all items have weight 0)
 * 
 * @param {Array} items
 * @param {Function} [weightGetter] - defaults to reading item.weight
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

    // Floating-point edge: return the last non-zero-weight item
    for (var k = items.length - 1; k >= 0; k--) {
        if (weights[k] > 0) return items[k];
    }
    return undefined;
}

/**
 * Picks a random key from an object by weight values.
 * Returns null when no valid weights exist.
 * 
 * @param {Object} weightedMap
 * @returns {string|null}
 */
function pickWeightedKey(weightedMap) {
    if (!weightedMap || typeof weightedMap !== 'object') return null;

    var entries = [];
    var keys = Object.keys(weightedMap);
    for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (!Object.prototype.hasOwnProperty.call(weightedMap, k)) continue;
        var w = _normalizeWeight(weightedMap[k]);
        if (w > 0) entries.push({ key: k, weight: w });
    }

    if (entries.length === 0) return null;

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

// =============================================================================
// 6. ARRAY SHUFFLING
// =============================================================================

/**
 * In-place Fisher-Yates shuffle.
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
 */
function shuffleString(str) {
    if (!str) return '';
    var chars = Array.from(str);
    shuffleArrayInPlace(chars);
    return chars.join('');
}

// =============================================================================
// 7. PROBABILITY HELPERS
// =============================================================================

/**
 * Rolls d100, returns 1-100.
 */
function percentile() {
    return randomInt(1, 100);
}

/**
 * True if percentile() <= target.
 * Non-finite target returns false.
 */
function checkPercentile(target) {
    if (typeof target !== 'number' || !Number.isFinite(target)) return false;
    return percentile() <= target;
}

/**
 * Returns a boolean with the given bias toward true.
 * Preserves 0 and 1 as valid biases.
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
 * Non-finite inputs return null.
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

    var variation = base * magnitude;
    return base + randomFloat(-variation, variation);
}

/**
 * Normal distribution (Box-Muller).
 * 
 * stdDev must be a finite non-negative number. stdDev of 0 returns mean.
 * Non-finite mean or stdDev returns null.
 * 
 * @param {number} [mean] - default 0
 * @param {number} [stdDev] - default 1
 * @returns {number|null}
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
 * Exponential distribution between min and max.
 * 
 * Required: min <= max, exponent >= 0, all finite.
 * exponent 0 returns min. exponent 1 is uniform.
 * 
 * @param {number} min
 * @param {number} max
 * @param {number} [exponent] - default 0.5
 * @returns {number|null}
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

// =============================================================================
// 8. RANDOM DATA GENERATION
// =============================================================================

/**
 * Generates a random alphanumeric string.
 * Returns '' for non-positive length.
 * 
 * @param {number} [length] - default 8
 * @returns {string}
 */
function randomString(length) {
    length = _defaultIfMissing(length, 8);
    if (!Number.isInteger(length) || length <= 0) return '';
    if (length > 10000) length = 10000;

    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var result = '';
    for (var i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(random() * chars.length));
    }
    return result;
}

// =============================================================================
// 9. WEIGHTED CHANCE TABLES
// =============================================================================

/**
 * Looks up a weighted chance table: [{ chance, result }, ...].
 * Returns null when no valid entries exist.
 * 
 * @param {Array} table
 * @returns {*|null}
 */
function weightedTable(table) {
    if (!Array.isArray(table) || table.length === 0) return null;

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
    if (valid.length === 0) return null;

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
 * Missing weight (undefined) defaults to 1.
 * Null weight is treated as missing (defaults to 1).
 * Zero weight excludes the item.
 * 
 * @param {Array} items
 * @param {string} [weightKey] - default 'weight'
 * @returns {Function}
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

// =============================================================================
// 10. CHANCE TABLES
// =============================================================================

var CHANCE_TABLES = Object.freeze({
    oneIn: function(x) {
        if (typeof x !== 'number' || x < 1) return false;
        return chance(1 / x);
    },
    rare: function() { return chance(0.1); },
    uncommon: function() { return chance(0.25); },
    common: function() { return chance(0.5); },
    veryCommon: function() { return chance(0.75); },
    d4: function() { return roll(4); },
    d6: function() { return roll(6); },
    d8: function() { return roll(8); },
    d10: function() { return roll(10); },
    d12: function() { return roll(12); },
    d20: function() { return roll(20); },
    d100: function() { return percentile(); }
});

// =============================================================================
// 11. EXPORTS
// =============================================================================

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