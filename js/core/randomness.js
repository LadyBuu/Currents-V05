/**
 * =============================================================================
 * STILL WATERS - RANDOMNESS ENGINE (randomness.js)
 * =============================================================================
 * 
 * LOCATION: js/core/randomness.js
 * 
 * This is the SINGLE SOURCE OF TRUTH for ALL random number generation.
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
 *   - randomUUID() - Generates random UUID v4
 *   - randomString() - Generates random alphanumeric string
 *   - randomNameFromLists() - Generates random name from lists
 *   - randomRealisticAge() - Realistic age distribution
 *   - randomYear() - Random year within range (supports BC)
 *   - randomFertilityModifier() - Random fertility modifier (0.5-1.5)
 *   - randomLifespan() - Random age at death based on mortality
 *   - weightedTable() - Weighted chance table lookup
 *   - createWeightedTable() - Creates function for weighted selection
 * 
 * DEPENDENCIES: None (pure RNG)
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
// 2. CORE RNG (Seedable)
// =============================================================================

var _rngSeed = Date.now();
var _rngState = _rngSeed;

function setRandomSeed(seed, persist) {
    persist = persist || false;
    _rngSeed = seed;
    _rngState = seed;
    
    if (persist) {
        try {
            localStorage.setItem(RNG_CONSTANTS.SEED_STORAGE_KEY, seed.toString());
        } catch (e) {}
    }
}

function getRandomSeed() {
    return _rngSeed;
}

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
    } catch (e) {}
    return false;
}

function random() {
    _rngState = (_rngState + 0x6D2B79F5) | 0;
    var t = Math.imul(_rngState ^ (_rngState >>> 15), 1 | _rngState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function randomInt(min, max) {
    if (min > max) { var temp = min; min = max; max = temp; }
    return Math.floor(random() * (max - min + 1)) + min;
}

function randomFloat(min, max) {
    if (min > max) { var temp = min; min = max; max = temp; }
    return min + random() * (max - min);
}

function chance(probability) {
    var p = Math.min(1, Math.max(0, probability));
    return random() < p;
}

// =============================================================================
// 3. DICE ROLLING - PRIMARY DEFINITIONS
// =============================================================================

function rollDice(diceString) {
    var match = diceString.match(/^(\d*)d(\d+)([+-]\d+)?$/i);
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
    for (var i = 0; i < count; i++) {
        rolls.push(randomInt(1, sides));
    }
    
    var sum = 0;
    for (var i = 0; i < rolls.length; i++) {
        sum += rolls[i];
    }
    var total = sum + modifier;
    
    return { total: total, rolls: rolls, modifier: modifier };
}

function roll(sides) {
    return randomInt(1, Math.max(1, sides));
}

function rollHighest(count, sides) {
    if (count <= 0 || sides <= 0) return 0;
    var highest = 0;
    for (var i = 0; i < count; i++) {
        var r = randomInt(1, sides);
        if (r > highest) highest = r;
    }
    return highest;
}

function rollLowest(count, sides) {
    if (count <= 0 || sides <= 0) return 0;
    var lowest = sides + 1;
    for (var i = 0; i < count; i++) {
        var r = randomInt(1, sides);
        if (r < lowest) lowest = r;
    }
    return lowest === sides + 1 ? 0 : lowest;
}

function rollWithDropLowest(count, sides, dropLowest) {
    if (count <= 0 || sides <= 0) return 0;
    var rolls = [];
    for (var i = 0; i < count; i++) {
        rolls.push(randomInt(1, sides));
    }
    rolls.sort(function(a, b) { return b - a; });
    var keepCount = Math.max(0, count - dropLowest);
    var sum = 0;
    for (var i = 0; i < keepCount; i++) {
        sum += rolls[i];
    }
    return sum;
}

// =============================================================================
// 4. ARRAY RANDOMIZATION - PRIMARY DEFINITIONS
// =============================================================================

function pickRandom(arr) {
    if (!arr || arr.length === 0) return undefined;
    return arr[Math.floor(random() * arr.length)];
}

function pickRandomMultiple(arr, count) {
    if (!arr || arr.length === 0) return [];
    var actualCount = Math.min(count, arr.length);
    var shuffled = shuffleArray(arr.slice());
    return shuffled.slice(0, actualCount);
}

function pickWeighted(items, weightGetter) {
    weightGetter = weightGetter || null;
    if (!items || items.length === 0) return undefined;
    
    var totalWeight = 0;
    var weights = [];
    
    for (var i = 0; i < items.length; i++) {
        var weight = 1;
        if (weightGetter) {
            weight = weightGetter(items[i]);
        } else if (items[i].weight !== undefined) {
            weight = items[i].weight;
        }
        weight = Math.max(0, weight);
        totalWeight += weight;
        weights.push(weight);
    }
    
    if (totalWeight === 0) return pickRandom(items);
    
    var roll = random() * totalWeight;
    var accumulated = 0;
    
    for (var i = 0; i < items.length; i++) {
        accumulated += weights[i];
        if (roll <= accumulated) {
            return items[i];
        }
    }
    
    return items[items.length - 1];
}

function pickWeightedKey(weightedMap) {
    var entries = [];
    for (var key in weightedMap) {
        if (weightedMap.hasOwnProperty(key)) {
            entries.push({ key: key, weight: weightedMap[key] });
        }
    }
    if (entries.length === 0) return null;
    
    var totalWeight = 0;
    for (var i = 0; i < entries.length; i++) {
        totalWeight += Math.max(0, entries[i].weight);
    }
    
    if (totalWeight === 0) {
        var keys = [];
        for (var i = 0; i < entries.length; i++) {
            keys.push(entries[i].key);
        }
        return pickRandom(keys);
    }
    
    var roll = random() * totalWeight;
    var accumulated = 0;
    
    for (var i = 0; i < entries.length; i++) {
        if (entries[i].weight > 0) {
            accumulated += entries[i].weight;
            if (roll <= accumulated) {
                return entries[i].key;
            }
        }
    }
    
    return entries[0] ? entries[0].key : null;
}

// =============================================================================
// 5. ARRAY SHUFFLING - PRIMARY DEFINITIONS
// =============================================================================

function shuffleArrayInPlace(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(random() * (i + 1));
        var temp = arr[i];
        arr[i] = arr[j];
        arr[j] = temp;
    }
    return arr;
}

function shuffleArray(arr) {
    var copy = arr.slice();
    return shuffleArrayInPlace(copy);
}

function shuffleString(str) {
    if (!str) return '';
    var chars = Array.from(str);
    shuffleArrayInPlace(chars);
    return chars.join('');
}

// =============================================================================
// 6. PROBABILITY HELPERS - PRIMARY DEFINITIONS
// =============================================================================

function percentile() {
    return randomInt(1, 100);
}

function checkPercentile(target) {
    return percentile() <= target;
}

function randomBoolean(trueChance) {
    trueChance = trueChance || 0.5;
    return chance(trueChance);
}

function randomSign() {
    return randomBoolean() ? 1 : -1;
}

function randomVariation(base, percentVariation) {
    var variation = base * Math.abs(percentVariation);
    return base + randomFloat(-variation, variation);
}

function randomNormal(mean, stdDev) {
    mean = mean || 0;
    stdDev = stdDev || 1;
    var u = 0, v = 0;
    while (u === 0) u = random();
    while (v === 0) v = random();
    var z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return mean + z * stdDev;
}

function randomGaussian(mean, stdDev) {
    return randomNormal(mean, stdDev);
}

// =============================================================================
// 7. RANDOM DATA GENERATION - PRIMARY DEFINITIONS
// =============================================================================

function randomExponential(min, max, exponent) {
    exponent = exponent || 0.5;
    var raw = min + Math.pow(random(), exponent) * (max - min);
    return Math.min(max, Math.max(min, raw));
}

function randomUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = (random() * 16) | 0;
        var v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

function randomString(length) {
    length = length || 8;
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var result = '';
    for (var i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(random() * chars.length));
    }
    return result;
}

function randomNameFromLists(firstNames, surnames) {
    surnames = surnames || null;
    var firstName = pickRandom(firstNames) || 'Unknown';
    var surname = surnames ? pickRandom(surnames) : null;
    return { firstName: firstName, surname: surname };
}

// =============================================================================
// 8. SIMULATION-SPECIFIC RANDOMNESS - PRIMARY DEFINITIONS
// =============================================================================

function randomRealisticAge(maxAge, includeInfants) {
    maxAge = maxAge || RNG_CONSTANTS.DEFAULT_MAX_AGE;
    includeInfants = includeInfants !== false;
    var age = Math.floor(randomExponential(0, maxAge, 0.6));
    age = Math.min(maxAge, Math.max(0, age));
    if (!includeInfants && age === 0) {
        age = 1;
    }
    return age;
}

function randomYear(currentYear, maxFutureYears, maxPastYears) {
    maxFutureYears = maxFutureYears || 10;
    maxPastYears = maxPastYears || 120;
    var minYear = currentYear - maxPastYears;
    var maxYear = currentYear + maxFutureYears;
    return randomInt(minYear, maxYear);
}

function randomFertilityModifier(mean, stdDev) {
    mean = mean || RNG_CONSTANTS.DEFAULT_FERTILITY_MEAN;
    stdDev = stdDev || RNG_CONSTANTS.DEFAULT_FERTILITY_STD_DEV;
    var raw = randomNormal(mean, stdDev);
    return Math.min(RNG_CONSTANTS.MAX_FERTILITY_MODIFIER, 
                    Math.max(RNG_CONSTANTS.MIN_FERTILITY_MODIFIER, raw));
}

function randomLifespan(currentAge, baseLifeExpectancy) {
    currentAge = currentAge || 0;
    baseLifeExpectancy = baseLifeExpectancy || 70;
    var remaining = Math.max(0, randomNormal(baseLifeExpectancy - currentAge, 20));
    if (remaining < 0) remaining = 0;
    var deathAge = currentAge + Math.floor(remaining);
    return Math.min(RNG_CONSTANTS.DEFAULT_MAX_AGE, deathAge);
}

// =============================================================================
// 9. WEIGHTED CHANCE TABLES - PRIMARY DEFINITIONS
// =============================================================================

function weightedTable(table) {
    if (!table || table.length === 0) return null;
    
    var validEntries = [];
    for (var i = 0; i < table.length; i++) {
        if (table[i].chance > 0) {
            validEntries.push(table[i]);
        }
    }
    if (validEntries.length === 0) return null;
    
    var total = 0;
    for (var i = 0; i < validEntries.length; i++) {
        total += validEntries[i].chance;
    }
    
    if (total <= 0) return validEntries[0] ? validEntries[0].result : null;
    
    var roll = random() * total;
    var accumulated = 0;
    
    for (var i = 0; i < validEntries.length; i++) {
        accumulated += validEntries[i].chance;
        if (roll <= accumulated) {
            return validEntries[i].result;
        }
    }
    
    return validEntries[0] ? validEntries[0].result : null;
}

function createWeightedTable(items, weightKey) {
    weightKey = weightKey || 'weight';
    return function() {
        return pickWeighted(items, function(item) { return item[weightKey] || 1; });
    };
}

// =============================================================================
// 10. CHANCE TABLES
// =============================================================================

var CHANCE_TABLES = {
    oneIn: function(x) { return chance(1 / Math.max(1, x)); },
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
    d100: function() { return percentile(); },
    ageGroupBias: function(minAge, maxAge, biasTowardYoung) {
        biasTowardYoung = biasTowardYoung !== false;
        if (biasTowardYoung) {
            return Math.floor(randomExponential(minAge, maxAge, 0.7));
        }
        return randomInt(minAge, maxAge);
    }
};

// =============================================================================
// 11. EXPORTS - SINGLE SOURCE OF TRUTH
// =============================================================================

// Constants
window.RNG_CONSTANTS = RNG_CONSTANTS;

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