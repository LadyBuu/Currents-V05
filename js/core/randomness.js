/**
 * =============================================================================
 * STILL WATERS - RANDOMNESS ENGINE (randomness.js)
 * =============================================================================
 * 
 * LOCATION: js/core/randomness.js
 * 
 * This is the SINGLE SOURCE OF TRUTH for ALL random number generation
 * that participates in the simulation stream.
 * 
 * SEMANTIC RULES:
 *   - Optional parameters use `undefined`/`null` checks, NOT `||`.
 *     This means 0 and '' are preserved as legitimate values.
 *   - The RNG state is global; adding a call anywhere shifts the sequence
 *     for everything downstream. This is intentional for reproducibility.
 *   - IDs must NOT consume this stream. See ids.js.
 * 
 * EXPORTED FUNCTIONS:
 *   - setRandomSeed() - Sets RNG seed for deterministic simulations
 *   - getRandomSeed() - Gets current RNG seed
 *   - loadPersistedSeed() - Loads persisted seed from localStorage
 *   - random() - Core PRNG, returns float [0, 1)
 *   - randomInt() - Random integer between min and max (inclusive)
 *   - randomFloat() - Random float between min and max
 *   - chance() - Returns true with given probability
 *   - rollDice() - Rolls dice notation (e.g., "2d6")
 *   - roll() - Simple dice roll
 *   - rollHighest() - Rolls pool, returns highest result
 *   - rollLowest() - Rolls pool, returns lowest result
 *   - rollWithDropLowest() - Rolls dice, drops lowest N
 *   - pickRandom() - Picks random element from array
 *   - pickRandomMultiple() - Picks multiple distinct random elements
 *   - pickWeighted() - Weighted random selection
 *   - pickWeightedKey() - Picks random key from object by weight values
 *   - shuffleArrayInPlace() - Shuffles array in-place (Fisher-Yates)
 *   - shuffleArray() - Returns shuffled copy
 *   - shuffleString() - Shuffles characters in string
 *   - percentile() - Rolls d100, returns 1-100
 *   - checkPercentile() - Returns true if percentile roll <= target
 *   - randomBoolean() - Returns boolean with given bias
 *   - randomSign() - Returns -1 or 1
 *   - randomVariation() - Adds random ±% variation to base
 *   - randomNormal() - Normal distribution (Box-Muller)
 *   - randomGaussian() - Alias for randomNormal
 *   - randomExponential() - Exponential distribution
 *   - randomUUID() - Generates random UUID v4-style string
 *   - randomString() - Generates random alphanumeric string
 *   - randomRealisticAge() - Skewed-young age distribution
 *   - randomYear() - Random year within range (supports BC)
 *   - randomFertilityModifier() - Random fertility modifier (0.5-1.5)
 *   - randomLifespan() - Random age at death based on mortality
 *   - weightedTable() - Weighted chance table lookup
 *   - createWeightedTable() - Creates function for weighted selection
 * 
 * DEPENDENCIES: 
 *   - Browser localStorage (optional, for seed persistence only)
 * 
 * ICON POLICY: No emojis. No icons.
 * 
 * =============================================================================
 */

// =============================================================================
// 1. CONSTANTS
// =============================================================================

var RNG_CONSTANTS = {
    MIN_YEAR: -10000,
    MAX_YEAR: 9999,
    DEFAULT_MAX_AGE: 120,
    MIN_FERTILITY_MODIFIER: 0.5,
    MAX_FERTILITY_MODIFIER: 1.5,
    DEFAULT_FERTILITY_MEAN: 1.0,
    DEFAULT_FERTILITY_STD_DEV: 0.2,
    SEED_STORAGE_KEY: 'stillwaters_rng_seed'
};

// =============================================================================
// 2. HELPERS
// =============================================================================

/**
 * Returns defaultValue only if value is undefined or null.
 * Preserves 0, '', false.
 * @private
 */
function _defaultIfMissing(value, defaultValue) {
    return (value === undefined || value === null) ? defaultValue : value;
}

/**
 * Validates seed is a finite integer (or number that can be coerced to one).
 * @private
 */
function _normalizeSeed(seed) {
    if (typeof seed === 'number' && Number.isFinite(seed)) {
        return Math.floor(seed) | 0;
    }
    if (typeof seed === 'string') {
        var parsed = parseInt(seed, 10);
        if (!isNaN(parsed) && Number.isFinite(parsed)) {
            return parsed | 0;
        }
    }
    return Date.now() | 0;
}

/**
 * Validates weight value: must be finite non-negative number.
 * Returns 0 for invalid weights (do not select).
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
 * Sets the RNG seed. Persists to localStorage if requested.
 * @param {number|string} seed
 * @param {boolean} persist - default false
 */
function setRandomSeed(seed, persist) {
    persist = persist === true;
    var normalized = _normalizeSeed(seed);
    _rngSeed = normalized;
    _rngState = normalized;

    if (persist) {
        try {
            localStorage.setItem(RNG_CONSTANTS.SEED_STORAGE_KEY, String(normalized));
        } catch (e) {
            // localStorage unavailable — seed persists in memory only
        }
    }
}

/**
 * Returns the current RNG seed (not the current state).
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
        if (stored !== null) {
            var seed = parseInt(stored, 10);
            if (!isNaN(seed)) {
                setRandomSeed(seed, false);
                return true;
            }
        }
    } catch (e) {
        // ignore
    }
    return false;
}

/**
 * Core PRNG (mulberry32). Returns float [0, 1).
 * @returns {number}
 */
function random() {
    _rngState = (_rngState + 0x6D2B79F5) | 0;
    var t = Math.imul(_rngState ^ (_rngState >>> 15), 1 | _rngState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Random integer between min and max, inclusive.
 * Both bounds are coerced to integers.
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randomInt(min, max) {
    if (typeof min !== 'number' || typeof max !== 'number') {
        return 0;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
        return 0;
    }
    min = Math.ceil(min);
    max = Math.floor(max);
    if (min > max) {
        var temp = min;
        min = max;
        max = temp;
    }
    return Math.floor(random() * (max - min + 1)) + min;
}

/**
 * Random float between min and max.
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function randomFloat(min, max) {
    if (typeof min !== 'number' || typeof max !== 'number') return 0;
    if (!Number.isFinite(min) || !Number.isFinite(max)) return 0;
    if (min > max) {
        var temp = min;
        min = max;
        max = temp;
    }
    return min + random() * (max - min);
}

/**
 * Returns true with the given probability.
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

    if (count > 1000) {
        return { total: 0, rolls: [], modifier: 0, error: 'Too many dice (max 1000)' };
    }
    if (sides < 1 || sides > 10000) {
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
 * Simple dice roll: roll(20) = d20.
 * @param {number} sides
 * @returns {number}
 */
function roll(sides) {
    if (typeof sides !== 'number' || !Number.isFinite(sides) || sides < 1) return 0;
    return randomInt(1, Math.floor(sides));
}

/**
 * Rolls count dice, returns highest.
 * @param {number} count
 * @param {number} sides
 * @returns {number}
 */
function rollHighest(count, sides) {
    if (typeof count !== 'number' || typeof sides !== 'number') return 0;
    if (count <= 0 || sides <= 0) return 0;
    var highest = 0;
    for (var i = 0; i < count; i++) {
        var r = randomInt(1, sides);
        if (r > highest) highest = r;
    }
    return highest;
}

/**
 * Rolls count dice, returns lowest.
 * @param {number} count
 * @param {number} sides
 * @returns {number}
 */
function rollLowest(count, sides) {
    if (typeof count !== 'number' || typeof sides !== 'number') return 0;
    if (count <= 0 || sides <= 0) return 0;
    var lowest = Infinity;
    for (var i = 0; i < count; i++) {
        var r = randomInt(1, sides);
        if (r < lowest) lowest = r;
    }
    return lowest === Infinity ? 0 : lowest;
}

/**
 * Rolls count dice, drops lowest `dropLowest`, sums remaining.
 * If dropLowest >= count, returns 0.
 * @param {number} count
 * @param {number} sides
 * @param {number} dropLowest
 * @returns {number}
 */
function rollWithDropLowest(count, sides, dropLowest) {
    if (typeof count !== 'number' || typeof sides !== 'number') return 0;
    if (count <= 0 || sides <= 0) return 0;
    dropLowest = _defaultIfMissing(dropLowest, 0);

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
 * @returns {*} Element or undefined
 */
function pickRandom(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return undefined;
    return arr[Math.floor(random() * arr.length)];
}

/**
 * Picks multiple distinct random elements from an array.
 * @param {Array} arr
 * @param {number} count
 * @returns {Array}
 */
function pickRandomMultiple(arr, count) {
    if (!Array.isArray(arr) || arr.length === 0) return [];
    var actualCount = Math.min(count, arr.length);
    if (actualCount <= 0) return [];
    var shuffled = shuffleArray(arr.slice());
    return shuffled.slice(0, actualCount);
}

/**
 * Weighted random selection.
 * Zero-weight items are never selected.
 * Invalid weights (NaN, Infinity, negative) are treated as 0.
 * 
 * @param {Array} items
 * @param {Function} weightGetter - optional; defaults to item.weight
 * @returns {*}
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

    if (totalWeight === 0) {
        // No valid weights — fall back to uniform pick
        return pickRandom(items);
    }

    var roll = random() * totalWeight;
    var accumulated = 0;
    for (var j = 0; j < items.length; j++) {
        if (weights[j] === 0) continue;
        accumulated += weights[j];
        if (roll < accumulated) {
            return items[j];
        }
    }

    // Floating-point edge: return last non-zero-weight item
    for (var k = items.length - 1; k >= 0; k--) {
        if (weights[k] > 0) return items[k];
    }
    return items[items.length - 1];
}

/**
 * Picks a random key from an object by weight values.
 * @param {Object} weightedMap - { key: weight, ... }
 * @returns {string|null}
 */
function pickWeightedKey(weightedMap) {
    if (!weightedMap || typeof weightedMap !== 'object') return null;

    var entries = [];
    for (var key in weightedMap) {
        if (weightedMap.hasOwnProperty(key)) {
            var w = _normalizeWeight(weightedMap[key]);
            if (w > 0) entries.push({ key: key, weight: w });
        }
    }

    if (entries.length === 0) return null;

    var total = 0;
    for (var i = 0; i < entries.length; i++) total += entries[i].weight;

    var roll = random() * total;
    var accumulated = 0;
    for (var j = 0; j < entries.length; j++) {
        accumulated += entries[j].weight;
        if (roll < accumulated) return entries[j].key;
    }
    return entries[entries.length - 1].key;
}

// =============================================================================
// 6. ARRAY SHUFFLING
// =============================================================================

/**
 * Fisher-Yates shuffle in place.
 * @param {Array} arr
 * @returns {Array} Same array
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
 * @param {Array} arr
 * @returns {Array}
 */
function shuffleArray(arr) {
    if (!Array.isArray(arr)) return [];
    return shuffleArrayInPlace(arr.slice());
}

/**
 * Shuffles characters in a string.
 * @param {string} str
 * @returns {string}
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
 * @returns {number}
 */
function percentile() {
    return randomInt(1, 100);
}

/**
 * Returns true if percentile() <= target.
 * @param {number} target
 * @returns {boolean}
 */
function checkPercentile(target) {
    if (typeof target !== 'number' || !Number.isFinite(target)) return false;
    return percentile() <= target;
}

/**
 * Returns a boolean with the given bias toward true.
 * Preserves 0 and 1 as valid explicit biases.
 * @param {number} trueChance - default 0.5
 * @returns {boolean}
 */
function randomBoolean(trueChance) {
    trueChance = _defaultIfMissing(trueChance, 0.5);
    return chance(trueChance);
}

/**
 * Returns -1 or 1.
 * @returns {number}
 */
function randomSign() {
    return randomBoolean() ? 1 : -1;
}

/**
 * Adds random ±% variation to a base value.
 * @param {number} base
 * @param {number} percentVariation - magnitude (0.1 = ±10%)
 * @returns {number}
 */
function randomVariation(base, percentVariation) {
    if (typeof base !== 'number' || !Number.isFinite(base)) return base;
    var v = Math.abs(_defaultIfMissing(percentVariation, 0));
    if (v === 0) return base;
    var variation = base * v;
    return base + randomFloat(-variation, variation);
}

/**
 * Normal distribution (Box-Muller).
 * Preserves explicit 0 for mean and stdDev.
 * @param {number} mean - default 0
 * @param {number} stdDev - default 1
 * @returns {number}
 */
function randomNormal(mean, stdDev) {
    mean = _defaultIfMissing(mean, 0);
    stdDev = _defaultIfMissing(stdDev, 1);

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

// =============================================================================
// 8. RANDOM DATA GENERATION
// =============================================================================

/**
 * Exponential distribution between min and max.
 * Exponent 0 returns min. Exponent 1 returns uniform.
 * Preserves explicit 0.
 * @param {number} min
 * @param {number} max
 * @param {number} exponent - default 0.5
 * @returns {number}
 */
function randomExponential(min, max, exponent) {
    min = _defaultIfMissing(min, 0);
    max = _defaultIfMissing(max, 1);
    exponent = _defaultIfMissing(exponent, 0.5);

    if (exponent === 0) return min;
    var raw = min + Math.pow(random(), exponent) * (max - min);
    return Math.min(max, Math.max(min, raw));
}

/**
 * Generates a UUID v4-style string using this RNG stream.
 * NOT cryptographically secure — for application IDs only.
 * @returns {string}
 */
function randomUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = (random() * 16) | 0;
        var v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

/**
 * Generates a random alphanumeric string.
 * @param {number} length - default 8
 * @returns {string}
 */
function randomString(length) {
    length = _defaultIfMissing(length, 8);
    if (length <= 0) return '';
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var result = '';
    for (var i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(random() * chars.length));
    }
    return result;
}

// =============================================================================
// 9. SIMULATION-SPECIFIC RANDOMNESS
// =============================================================================

/**
 * Skewed-young age distribution.
 * @param {number} maxAge - default 120
 * @param {boolean} includeInfants - default true
 * @returns {number}
 */
function randomRealisticAge(maxAge, includeInfants) {
    maxAge = _defaultIfMissing(maxAge, RNG_CONSTANTS.DEFAULT_MAX_AGE);
    includeInfants = includeInfants !== false;
    var age = Math.floor(randomExponential(0, maxAge, 0.6));
    age = Math.min(maxAge, Math.max(0, age));
    if (!includeInfants && age === 0) age = 1;
    return age;
}

/**
 * Random year within range around currentYear.
 * Preserves explicit 0 for maxFutureYears/maxPastYears.
 * @param {number} currentYear
 * @param {number} maxFutureYears - default 10
 * @param {number} maxPastYears - default 120
 * @returns {number}
 */
function randomYear(currentYear, maxFutureYears, maxPastYears) {
    currentYear = _defaultIfMissing(currentYear, 1250);
    maxFutureYears = _defaultIfMissing(maxFutureYears, 10);
    maxPastYears = _defaultIfMissing(maxPastYears, 120);
    var minYear = currentYear - maxPastYears;
    var maxYear = currentYear + maxFutureYears;
    return randomInt(minYear, maxYear);
}

/**
 * Random fertility modifier clamped to [0.5, 1.5].
 * Preserves explicit 0 for mean and stdDev.
 * @param {number} mean - default 1.0
 * @param {number} stdDev - default 0.2
 * @returns {number}
 */
function randomFertilityModifier(mean, stdDev) {
    mean = _defaultIfMissing(mean, RNG_CONSTANTS.DEFAULT_FERTILITY_MEAN);
    stdDev = _defaultIfMissing(stdDev, RNG_CONSTANTS.DEFAULT_FERTILITY_STD_DEV);
    var raw = randomNormal(mean, stdDev);
    return Math.min(
        RNG_CONSTANTS.MAX_FERTILITY_MODIFIER,
        Math.max(RNG_CONSTANTS.MIN_FERTILITY_MODIFIER, raw)
    );
}

/**
 * Random lifespan (age at death) based on mortality.
 * Preserves explicit 0 for currentAge.
 * @param {number} currentAge - default 0
 * @param {number} baseLifeExpectancy - default 70
 * @returns {number}
 */
function randomLifespan(currentAge, baseLifeExpectancy) {
    currentAge = _defaultIfMissing(currentAge, 0);
    baseLifeExpectancy = _defaultIfMissing(baseLifeExpectancy, 70);
    var remaining = randomNormal(baseLifeExpectancy - currentAge, 20);
    if (remaining < 0) remaining = 0;
    var deathAge = currentAge + Math.floor(remaining);
    return Math.min(RNG_CONSTANTS.DEFAULT_MAX_AGE, deathAge);
}

// =============================================================================
// 10. WEIGHTED CHANCE TABLES
// =============================================================================

/**
 * Looks up a weighted chance table: [{ chance, result }, ...].
 * @param {Array} table
 * @returns {*}
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

    var roll = random() * total;
    var accumulated = 0;
    for (var j = 0; j < valid.length; j++) {
        accumulated += valid[j].chance;
        if (roll < accumulated) return valid[j].result;
    }
    return valid[valid.length - 1].result;
}

/**
 * Creates a function that picks a weighted item from items.
 * Weight 0 means the item is excluded.
 * @param {Array} items
 * @param {string} weightKey - default 'weight'
 * @returns {Function}
 */
function createWeightedTable(items, weightKey) {
    weightKey = _defaultIfMissing(weightKey, 'weight');
    return function() {
        return pickWeighted(items, function(item) {
            if (!item || typeof item !== 'object') return 1;
            var w = item[weightKey];
            return w === undefined ? 1 : w;
        });
    };
}

// =============================================================================
// 11. CHANCE TABLES
// =============================================================================

var CHANCE_TABLES = {
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
};

// =============================================================================
// 12. EXPORTS — SINGLE SOURCE OF TRUTH
// =============================================================================

// Constants
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

// Random data generation
window.randomExponential = randomExponential;
window.randomUUID = randomUUID;
window.randomString = randomString;

// Simulation helpers
window.randomRealisticAge = randomRealisticAge;
window.randomYear = randomYear;
window.randomFertilityModifier = randomFertilityModifier;
window.randomLifespan = randomLifespan;

// Weighted tables
window.weightedTable = weightedTable;
window.createWeightedTable = createWeightedTable;
window.CHANCE_TABLES = CHANCE_TABLES;