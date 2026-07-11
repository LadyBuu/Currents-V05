/**
 * =============================================================================
 * STILL WATERS - RANDOMNESS ENGINE (randomness.js)
 * =============================================================================
 * 
 * LOCATION: js/core/randomness.js
 * 
 * This file contains ALL random number generation and probability functions:
 * - Core RNG (seeded, deterministic)
 * - Random element selection from arrays
 * - Weighted random selection (with probabilities)
 * - Random number generation (integer, float, ranges)
 * - Dice rolling
 * - Shuffling
 * 
 * This is a CENTRALIZED STOCHASTIC ENGINE.
 * Used for births, deaths, scandals, disasters, political events, etc.
 * Enables deterministic simulation with seed support.
 * 
 * DEPENDENCIES: None (pure RNG)
 * =============================================================================
 * EXPORTED FUNCTIONS (on window):
 * =============================================================================
 * 
 * Constants:
 *   - RNG_CONSTANTS - Object with MIN_YEAR, MAX_YEAR, DEFAULT_MAX_AGE, SEED_STORAGE_KEY, etc.
 * 
 * Core RNG (Seedable):
 *   - setRandomSeed(seed, persist) - Sets RNG seed for deterministic simulations
 *   - getRandomSeed() - Gets current RNG seed
 *   - loadPersistedSeed() - Loads persisted seed from localStorage
 *   - random() - Core PRNG, returns float [0, 1)
 *   - randomInt(min, max) - Random integer between min and max (inclusive)
 *   - randomFloat(min, max) - Random float between min and max
 *   - chance(probability) - Returns true with given probability (0-1)
 * 
 * Dice Rolling:
 *   - rollDice(diceString) - Rolls dice notation (e.g., "2d6", "d20", "2d6+4")
 *   - roll(sides) - Simple dice roll (e.g., roll(20) = d20)
 *   - rollHighest(count, sides) - Rolls pool, returns highest result
 *   - rollLowest(count, sides) - Rolls pool, returns lowest result
 *   - rollWithDropLowest(count, sides, dropLowest) - Rolls dice, drops lowest N
 * 
 * Array Randomization:
 *   - pickRandom(arr) - Picks random element from array
 *   - pickRandomMultiple(arr, count) - Picks multiple distinct random elements
 *   - pickWeighted(items, weightGetter) - Weighted random selection
 *   - pickWeightedKey(weightedMap) - Picks random key from object by weight values
 * 
 * Array Shuffling:
 *   - shuffleArrayInPlace(arr) - Shuffles array in-place (Fisher-Yates)
 *   - shuffleArray(arr) - Returns shuffled copy (original unchanged)
 *   - shuffleString(str) - Shuffles characters in string
 * 
 * Probability Helpers:
 *   - percentile() - Rolls d100, returns 1-100
 *   - checkPercentile(target) - Returns true if percentile roll <= target
 *   - randomBoolean(trueChance) - Returns boolean with given bias (default 0.5)
 *   - randomSign() - Returns -1 or 1
 *   - randomVariation(base, percentVariation) - Adds random ±% variation to base
 *   - randomNormal(mean, stdDev) - Normal distribution (Box-Muller)
 *   - randomGaussian(mean, stdDev) - Alias for randomNormal
 * 
 * Random Data Generation:
 *   - randomExponential(min, max, exponent) - Exponential distribution (exponent<1 = more low numbers)
 *   - randomUUID() - Generates random UUID v4
 *   - randomString(length) - Generates random alphanumeric string
 *   - randomNameFromLists(firstNames, surnames) - Generates random name from lists
 * 
 * Simulation-Specific Randomness:
 *   - randomRealisticAge(maxAge, includeInfants) - Realistic age distribution
 *   - randomYear(currentYear, maxFutureYears, maxPastYears) - Random year within range (supports BC)
 *   - randomFertilityModifier(mean, stdDev) - Random fertility modifier (0.5-1.5)
 *   - randomLifespan(currentAge, baseLifeExpectancy) - Random age at death based on mortality
 * 
 * Weighted Chance Tables:
 *   - weightedTable(table) - Weighted chance table lookup (array of { chance, result })
 *   - createWeightedTable(items, weightKey) - Creates function for weighted selection
 *   - CHANCE_TABLES - Predefined helpers (oneIn, rare, uncommon, common, d4, d6, d8, d10, d12, d20, d100, ageGroupBias)
 * 
 * =============================================================================
 */

// =============================================================================
// 1. CONSTANTS
// =============================================================================

const RNG_CONSTANTS = {
    MIN_YEAR: -10000,  // Support BC years
    MAX_YEAR: 9999,
    DEFAULT_MAX_AGE: 120,
    MIN_FERTILITY_MODIFIER: 0.5,
    MAX_FERTILITY_MODIFIER: 1.5,
    DEFAULT_FERTILITY_MEAN: 1.0,
    DEFAULT_FERTILITY_STD_DEV: 0.2,
    SEED_STORAGE_KEY: 'stillwaters_rng_seed'
};

// =============================================================================
// 2. CORE RNG (Seedable)
// =============================================================================

let _rngSeed = Date.now();
let _rngState = _rngSeed;

/**
 * Sets the RNG seed for deterministic simulations
 * @param {number} seed - Seed value
 * @param {boolean} persist - Whether to persist seed to localStorage (default false)
 */
function setRandomSeed(seed, persist = false) {
    _rngSeed = seed;
    _rngState = seed;
    
    if (persist) {
        try {
            localStorage.setItem(RNG_CONSTANTS.SEED_STORAGE_KEY, seed.toString());
        } catch (e) {
            console.warn('Could not persist RNG seed:', e);
        }
    }
}

/**
 * Gets the current RNG seed
 * @returns {number} Current seed
 */
function getRandomSeed() {
    return _rngSeed;
}

/**
 * Loads a persisted seed from localStorage (if available)
 * @returns {boolean} True if a persisted seed was loaded
 */
function loadPersistedSeed() {
    try {
        const stored = localStorage.getItem(RNG_CONSTANTS.SEED_STORAGE_KEY);
        if (stored !== null) {
            const seed = parseInt(stored, 10);
            if (!isNaN(seed)) {
                setRandomSeed(seed, false);
                return true;
            }
        }
    } catch (e) {
        // Ignore storage errors
    }
    return false;
}

/**
 * Core pseudo-random number generator (mulberry32 algorithm)
 * Returns a float between 0 and 1 (inclusive of 0, exclusive of 1)
 * @returns {number} Random float [0, 1)
 */
function random() {
    _rngState = (_rngState + 0x6D2B79F5) | 0;
    let t = Math.imul(_rngState ^ _rngState >>> 15, 1 | _rngState);
    t = (t + Math.imul(t ^ t >>> 7, 61 | t)) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

/**
 * Generates a random integer between min and max (inclusive)
 * @param {number} min - Minimum value (inclusive)
 * @param {number} max - Maximum value (inclusive)
 * @returns {number} Random integer
 */
function randomInt(min, max) {
    if (min > max) [min, max] = [max, min];
    return Math.floor(random() * (max - min + 1)) + min;
}

/**
 * Generates a random float between min and max
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Random float
 */
function randomFloat(min, max) {
    if (min > max) [min, max] = [max, min];
    return min + random() * (max - min);
}

/**
 * Returns true with a given probability
 * @param {number} probability - Probability between 0 and 1
 * @returns {boolean}
 */
function chance(probability) {
    // Clamp probability to valid range
    const p = Math.min(1, Math.max(0, probability));
    return random() < p;
}

// =============================================================================
// 3. DICE ROLLING
// =============================================================================

/**
 * Rolls dice (e.g., "2d6" = two six-sided dice)
 * @param {string} diceString - Dice notation (e.g., "3d8", "d20", "2d6+4")
 * @returns {Object} { total: number, rolls: Array, modifier: number, error?: string }
 */
function rollDice(diceString) {
    const match = diceString.match(/^(\d*)d(\d+)([+-]\d+)?$/i);
    if (!match) {
        return { total: 0, rolls: [], modifier: 0, error: 'Invalid dice notation' };
    }
    
    const count = match[1] === '' ? 1 : parseInt(match[1], 10);
    const sides = parseInt(match[2], 10);
    const modifier = match[3] ? parseInt(match[3], 10) : 0;
    
    // Validate range
    if (count > 1000) {
        return { total: 0, rolls: [], modifier: 0, error: 'Too many dice (max 1000)' };
    }
    if (sides < 1 || sides > 10000) {
        return { total: 0, rolls: [], modifier: 0, error: 'Invalid number of sides' };
    }
    
    const rolls = [];
    for (let i = 0; i < count; i++) {
        rolls.push(randomInt(1, sides));
    }
    
    const sum = rolls.reduce((a, b) => a + b, 0);
    const total = sum + modifier;
    
    return { total, rolls, modifier };
}

/**
 * Simple dice roll (e.g., roll(20) = d20)
 * @param {number} sides - Number of sides on the die
 * @returns {number} Roll result
 */
function roll(sides) {
    return randomInt(1, Math.max(1, sides));
}

/**
 * Rolls a pool of dice and returns the highest result
 * @param {number} count - Number of dice
 * @param {number} sides - Number of sides per die
 * @returns {number} Highest roll (0 if count <= 0)
 */
function rollHighest(count, sides) {
    if (count <= 0 || sides <= 0) return 0;
    let highest = 0;
    for (let i = 0; i < count; i++) {
        const roll = randomInt(1, sides);
        if (roll > highest) highest = roll;
    }
    return highest;
}

/**
 * Rolls a pool of dice and returns the lowest result
 * @param {number} count - Number of dice
 * @param {number} sides - Number of sides per die
 * @returns {number} Lowest roll (0 if count <= 0)
 */
function rollLowest(count, sides) {
    if (count <= 0 || sides <= 0) return 0;
    let lowest = sides + 1;
    for (let i = 0; i < count; i++) {
        const roll = randomInt(1, sides);
        if (roll < lowest) lowest = roll;
    }
    return lowest === sides + 1 ? 0 : lowest;
}

/**
 * Rolls dice and returns the sum, dropping the lowest rolls
 * @param {number} count - Number of dice to roll
 * @param {number} sides - Number of sides per die
 * @param {number} dropLowest - Number of lowest dice to drop
 * @returns {number} Sum after dropping dice
 */
function rollWithDropLowest(count, sides, dropLowest) {
    if (count <= 0 || sides <= 0) return 0;
    const rolls = [];
    for (let i = 0; i < count; i++) {
        rolls.push(randomInt(1, sides));
    }
    rolls.sort((a, b) => b - a); // Sort descending
    const keepCount = Math.max(0, count - dropLowest);
    return rolls.slice(0, keepCount).reduce((a, b) => a + b, 0);
}

// =============================================================================
// 4. ARRAY RANDOMIZATION
// =============================================================================

/**
 * Picks a random element from an array
 * @param {Array} arr - Source array
 * @returns {*} Random element (undefined if array empty)
 */
function pickRandom(arr) {
    if (!arr || arr.length === 0) return undefined;
    return arr[Math.floor(random() * arr.length)];
}

/**
 * Picks multiple random distinct elements from an array
 * @param {Array} arr - Source array
 * @param {number} count - Number of elements to pick
 * @returns {Array} Array of picked elements
 */
function pickRandomMultiple(arr, count) {
    if (!arr || arr.length === 0) return [];
    const actualCount = Math.min(count, arr.length);
    const shuffled = shuffleArray([...arr]);
    return shuffled.slice(0, actualCount);
}

/**
 * Picks a random element with weighted probability
 * @param {Array} items - Array of items (each with optional 'weight' property)
 * @param {Function} weightGetter - Optional function to get weight from item
 * @returns {*} Selected item (or undefined if no items)
 */
function pickWeighted(items, weightGetter = null) {
    if (!items || items.length === 0) return undefined;
    
    let totalWeight = 0;
    const weights = [];
    
    for (let i = 0; i < items.length; i++) {
        let weight = 1;
        if (weightGetter) {
            weight = weightGetter(items[i]);
        } else if (items[i].weight !== undefined) {
            weight = items[i].weight;
        }
        
        // Ensure positive weight
        weight = Math.max(0, weight);
        totalWeight += weight;
        weights.push(weight);
    }
    
    if (totalWeight === 0) return pickRandom(items);
    
    let roll = random() * totalWeight;
    let accumulated = 0;
    
    for (let i = 0; i < items.length; i++) {
        accumulated += weights[i];
        if (roll <= accumulated) {
            return items[i];
        }
    }
    
    return items[items.length - 1];
}

/**
 * Picks a random key from an object (weighted by values)
 * @param {Object} weightedMap - Object where keys are options, values are weights
 * @returns {string|null} Selected key or null if empty
 */
function pickWeightedKey(weightedMap) {
    const entries = Object.entries(weightedMap);
    if (entries.length === 0) return null;
    
    let totalWeight = 0;
    for (const [_, weight] of entries) {
        totalWeight += Math.max(0, weight);
    }
    
    if (totalWeight === 0) {
        const keys = entries.map(([key]) => key);
        return pickRandom(keys);
    }
    
    let roll = random() * totalWeight;
    let accumulated = 0;
    
    for (const [key, weight] of entries) {
        if (weight > 0) {
            accumulated += weight;
            if (roll <= accumulated) {
                return key;
            }
        }
    }
    
    return entries[0]?.[0] || null;
}

// =============================================================================
// 5. ARRAY SHUFFLING (Fisher-Yates)
// =============================================================================

/**
 * Shuffles an array in-place (Fisher-Yates algorithm)
 * @param {Array} arr - Array to shuffle (modified in-place)
 * @returns {Array} The shuffled array (same reference)
 */
function shuffleArrayInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/**
 * Returns a shuffled copy of an array (original unchanged)
 * @param {Array} arr - Array to shuffle
 * @returns {Array} New shuffled array
 */
function shuffleArray(arr) {
    const copy = [...arr];
    return shuffleArrayInPlace(copy);
}

/**
 * Shuffles a string (returns a new string with characters randomized)
 * @param {string} str - Input string
 * @returns {string} Shuffled string
 */
function shuffleString(str) {
    if (!str) return '';
    const chars = Array.from(str);
    shuffleArrayInPlace(chars);
    return chars.join('');
}

// =============================================================================
// 6. PROBABILITY HELPERS
// =============================================================================

/**
 * Rolls a percentile dice (d100)
 * @returns {number} Result between 1 and 100
 */
function percentile() {
    return randomInt(1, 100);
}

/**
 * Performs a percentile check (returns true if roll <= target)
 * @param {number} target - Target percentage (1-100)
 * @returns {boolean}
 */
function checkPercentile(target) {
    return percentile() <= target;
}

/**
 * Generates a random boolean with given bias
 * @param {number} trueChance - Probability of true (0-1)
 * @returns {boolean}
 */
function randomBoolean(trueChance = 0.5) {
    return chance(trueChance);
}

/**
 * Generates a random sign (-1 or 1)
 * @returns {number} -1 or 1
 */
function randomSign() {
    return randomBoolean() ? 1 : -1;
}

/**
 * Generates a random variation around a base value
 * @param {number} base - Base value
 * @param {number} percentVariation - Variation as percentage (e.g., 0.2 = ±20%)
 * @returns {number} Varied value
 */
function randomVariation(base, percentVariation) {
    const variation = base * Math.abs(percentVariation);
    return base + randomFloat(-variation, variation);
}

/**
 * Generates a random number following a normal distribution (approximated)
 * @param {number} mean - Mean value
 * @param {number} stdDev - Standard deviation
 * @returns {number} Random normally-distributed value
 */
function randomNormal(mean = 0, stdDev = 1) {
    // Box-Muller transform
    let u = 0, v = 0;
    while (u === 0) u = random();
    while (v === 0) v = random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return mean + z * stdDev;
}

/**
 * Alias for randomNormal (Gaussian distribution)
 * @param {number} mean - Mean value
 * @param {number} stdDev - Standard deviation
 * @returns {number} Random normally-distributed value
 */
function randomGaussian(mean = 0, stdDev = 1) {
    return randomNormal(mean, stdDev);
}

// =============================================================================
// 7. RANDOM DATA GENERATION
// =============================================================================

/**
 * Generates a random number between min and max (inclusive, non-uniform)
 * Weighted toward lower numbers (exponential distribution)
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {number} exponent - Distribution exponent (<1 = more low numbers, >1 = more high numbers)
 * @returns {number} Random number (clamped to [min, max])
 */
function randomExponential(min, max, exponent = 0.5) {
    const raw = min + Math.pow(random(), exponent) * (max - min);
    // Clamp to range due to floating point precision
    return Math.min(max, Math.max(min, raw));
}

/**
 * Generates a random UUID (v4) - primarily for debugging/export
 * @returns {string} UUID
 */
function randomUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = (random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

/**
 * Generates a random alphanumeric string
 * @param {number} length - Desired length
 * @returns {string} Random string
 */
function randomString(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(random() * chars.length));
    }
    return result;
}

/**
 * Generates a random name from a list of first names and surnames
 * @param {Array} firstNames - Array of first names
 * @param {Array} surnames - Array of surnames (optional)
 * @returns {Object} { firstName: string, surname: string|null }
 */
function randomNameFromLists(firstNames, surnames = null) {
    const firstName = pickRandom(firstNames) || 'Unknown';
    const surname = surnames ? pickRandom(surnames) : null;
    return { firstName, surname };
}

// =============================================================================
// 8. SIMULATION-SPECIFIC RANDOMNESS
// =============================================================================

/**
 * Generates a random age with realistic distribution (more young, fewer old)
 * @param {number} maxAge - Maximum possible age
 * @param {boolean} includeInfants - Whether to include age 0 (infants)
 * @returns {number} Realistic random age
 */
function randomRealisticAge(maxAge = RNG_CONSTANTS.DEFAULT_MAX_AGE, includeInfants = true) {
    // Exponential distribution for age (more people die young)
    let age = Math.floor(randomExponential(0, maxAge, 0.6));
    
    // Ensure age is within bounds
    age = Math.min(maxAge, Math.max(0, age));
    
    // Infants (age 0) have about 1-2% chance
    if (!includeInfants && age === 0) {
        age = 1;
    }
    
    return age;
}

/**
 * Generates a random year within plausible range of current year
 * Supports BC years (negative numbers)
 * @param {number} currentYear - Current world year
 * @param {number} maxFutureYears - Maximum years in future (default 10)
 * @param {number} maxPastYears - Maximum years in past (default 120)
 * @returns {number} Random year
 */
function randomYear(currentYear, maxFutureYears = 10, maxPastYears = 120) {
    // Allow BC years (negative)
    const minYear = currentYear - maxPastYears;
    const maxYear = currentYear + maxFutureYears;
    return randomInt(minYear, maxYear);
}

/**
 * Generates a random fertility rate modifier
 * @param {number} mean - Mean modifier (default 1.0)
 * @param {number} stdDev - Standard deviation (default 0.2)
 * @returns {number} Modifier between 0.5 and 1.5
 */
function randomFertilityModifier(mean = RNG_CONSTANTS.DEFAULT_FERTILITY_MEAN, stdDev = RNG_CONSTANTS.DEFAULT_FERTILITY_STD_DEV) {
    const raw = randomNormal(mean, stdDev);
    return Math.min(RNG_CONSTANTS.MAX_FERTILITY_MODIFIER, 
                    Math.max(RNG_CONSTANTS.MIN_FERTILITY_MODIFIER, raw));
}

/**
 * Generates a random lifespan based on mortality tables
 * @param {number} currentAge - Current age (for conditional probability)
 * @param {number} baseLifeExpectancy - Base life expectancy (default 70)
 * @returns {number} Random age at death
 */
function randomLifespan(currentAge = 0, baseLifeExpectancy = 70) {
    // Simple model: normal distribution around life expectancy, but skewed
    let remaining = Math.max(0, randomNormal(baseLifeExpectancy - currentAge, 20));
    if (remaining < 0) remaining = 0;
    const deathAge = currentAge + Math.floor(remaining);
    return Math.min(RNG_CONSTANTS.DEFAULT_MAX_AGE, deathAge);
}

// =============================================================================
// 9. WEIGHTED CHANCE TABLES
// =============================================================================

/**
 * Weighted chance table for quick lookups
 * @param {Array} table - Array of { chance: number, result: any }
 * @returns {any|null} Selected result or null if table empty
 */
function weightedTable(table) {
    if (!table || table.length === 0) return null;
    
    // Filter out entries with zero or negative chance
    const validEntries = table.filter(entry => entry.chance > 0);
    if (validEntries.length === 0) return null;
    
    let total = 0;
    for (const entry of validEntries) {
        total += entry.chance;
    }
    
    if (total <= 0) return validEntries[0]?.result || null;
    
    let roll = random() * total;
    let accumulated = 0;
    
    for (const entry of validEntries) {
        accumulated += entry.chance;
        if (roll <= accumulated) {
            return entry.result;
        }
    }
    
    return validEntries[0]?.result || null;
}

/**
 * Creates a weighted table from an array of items with weights
 * @param {Array} items - Array of items with 'weight' property
 * @param {string} weightKey - Key name for weight (default 'weight')
 * @returns {Function} Function that returns a random item from the table
 */
function createWeightedTable(items, weightKey = 'weight') {
    return function() {
        return pickWeighted(items, (item) => item[weightKey] || 1);
    };
}

// Predefined common chance tables
const CHANCE_TABLES = {
    // 1 in X chance
    oneIn: (x) => chance(1 / Math.max(1, x)),
    
    // Rare vs common
    rare: () => chance(0.1),
    uncommon: () => chance(0.25),
    common: () => chance(0.5),
    veryCommon: () => chance(0.75),
    
    // Dice roll helpers
    d4: () => roll(4),
    d6: () => roll(6),
    d8: () => roll(8),
    d10: () => roll(10),
    d12: () => roll(12),
    d20: () => roll(20),
    d100: () => percentile(),
    
    // Age group biases
    ageGroupBias: (minAge, maxAge, biasTowardYoung = true) => {
        if (biasTowardYoung) {
            return Math.floor(randomExponential(minAge, maxAge, 0.7));
        }
        return randomInt(minAge, maxAge);
    }
};

// =============================================================================
// 10. EXPORTS (Global Availability)
// =============================================================================

// Constants
window.RNG_CONSTANTS = Object.freeze({ ...RNG_CONSTANTS });

// Core RNG
window.setRandomSeed = setRandomSeed;
window.getRandomSeed = getRandomSeed;
window.loadPersistedSeed = loadPersistedSeed;
window.random = random;
window.randomInt = randomInt;
window.randomFloat = randomFloat;
window.chance = chance;

// Dice rolling
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

// Array shuffling
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
window.randomNameFromLists = randomNameFromLists;

// Simulation randomness
window.randomRealisticAge = randomRealisticAge;
window.randomYear = randomYear;
window.randomFertilityModifier = randomFertilityModifier;
window.randomLifespan = randomLifespan;

// Weighted tables
window.weightedTable = weightedTable;
window.createWeightedTable = createWeightedTable;
window.CHANCE_TABLES = CHANCE_TABLES;
