/**
 * =============================================================================
 * STILL WATERS - NAMING SYSTEM (names.js)
 * =============================================================================
 * 
 * LOCATION: js/core/names.js
 * 
 * SCOPE:
 *   - Character name generation (given name + surname)
 *   - Character name rules queries (surname rules, epithets)
 *   - Dynasty/house name generation
 *   - City/region/landmark name generation
 *   - Title formatting (rank + ordinal)
 *   - Name normalization
 *   - Regnal numbering
 * 
 * OUT OF SCOPE:
 *   - Role categories (see role-constants.js / role-queries.js)
 *   - Name validation (see validation.js)
 *   - Name formatting for display (see formatting.js)
 * 
 * SEMANTIC RULES:
 *   - RNG comes from randomness.js. No fallback implementation.
 *   - `_randomBoolean(0)` returns false. `_randomBoolean(1)` returns true.
 *   - Missing countryId returns null (not "first country").
 *   - Preserves `0` for ordinals — no `if (number)` truthiness checks.
 * 
 * DEPENDENCIES:
 *   - randomness.js (pickRandom, random, randomBoolean, chance)
 *   - accessors.js (getCharacterById, getActiveRankDisplay — for epithets/titles)
 * 
 * ICON POLICY: No emojis. No icons.
 * 
 * =============================================================================
 */

// =============================================================================
// 0. DEPENDENCY GUARDS
// =============================================================================

function _requireRandomness() {
    if (typeof window.pickRandom !== 'function'
        || typeof window.random !== 'function'
        || typeof window.randomBoolean !== 'function') {
        throw new Error('names.js: randomness.js must load first.');
    }
}

function _random() {
    _requireRandomness();
    return window.random();
}

function _pickRandom(arr) {
    _requireRandomness();
    return window.pickRandom(arr);
}

function _randomBoolean(bias) {
    _requireRandomness();
    return window.randomBoolean(bias);
}

// =============================================================================
// 1. DATA ACCESSORS
// =============================================================================

function _getNameLists() {
    if (typeof window.getNameLists === 'function') return window.getNameLists();
    return {};
}

function _getCityNameParts() {
    if (typeof window.getCityNameParts === 'function') return window.getCityNameParts();
    return {};
}

function _getCharacterById(id) {
    if (typeof window.getCharacterById === 'function') return window.getCharacterById(id);
    return null;
}

function _getActiveRankDisplay(character) {
    if (typeof window.getActiveRankDisplay === 'function') return window.getActiveRankDisplay(character);
    return null;
}

// =============================================================================
// 2. CHARACTER NAMES
// =============================================================================

/**
 * Picks a random given name from a country's name lists.
 * 
 * If `countryId` is null, returns null. (The old behavior of "first country
 * in the object" was non-deterministic in a way the caller didn't ask for.)
 * 
 * @param {string|null} countryId
 * @param {string} [gender] - 'male' | 'female' | 'any'
 * @returns {string|null}
 */
function getRandomNameFromCountry(countryId, gender) {
    gender = gender || 'any';
    if (!countryId) return null;

    var lists = _getNameLists();
    var country = lists[countryId];
    if (!country) return null;

    if (gender === 'male' && Array.isArray(country.male) && country.male.length) {
        return _pickRandom(country.male);
    }
    if (gender === 'female' && Array.isArray(country.female) && country.female.length) {
        return _pickRandom(country.female);
    }

    var pool = [];
    if (Array.isArray(country.male)) pool = pool.concat(country.male);
    if (Array.isArray(country.female)) pool = pool.concat(country.female);
    if (pool.length === 0) return null;
    return _pickRandom(pool);
}

/**
 * Picks a random surname from a country's name lists.
 * Returns '' if the country has no surname list.
 */
function getRandomSurnameFromCountry(countryId) {
    if (!countryId) return '';
    var lists = _getNameLists();
    var country = lists[countryId];
    if (!country) return '';
    if (Array.isArray(country.surnames) && country.surnames.length) {
        return _pickRandom(country.surnames);
    }
    return '';
}

/**
 * Generates a full name (given + surname) from a country.
 * Returns null if no given name could be picked.
 */
function generateRandomFullName(countryId, gender) {
    var name = getRandomNameFromCountry(countryId, gender);
    if (!name) return null;
    var surname = getRandomSurnameFromCountry(countryId);
    return { name: name, surname: surname || '' };
}

// =============================================================================
// 3. CHARACTER NAME RULES QUERIES
// =============================================================================

/**
 * Gets the surname rules attached to a character (if any).
 * @param {string} characterId
 * @returns {Object|null}
 */
function getCharacterSurnameRules(characterId) {
    var c = _getCharacterById(characterId);
    if (!c) return null;
    return c.surnameRules || null;
}

/**
 * Gets the character's epithet (if any).
 */
function getCharacterEpithet(characterId) {
    var c = _getCharacterById(characterId);
    if (!c) return '';
    return c.epithet || '';
}

/**
 * Gets the character's surname source: 'country' or 'rank'.
 */
function getCharacterSurnameSource(characterId) {
    var c = _getCharacterById(characterId);
    if (!c) return 'country';
    return c.surnameSource || 'country';
}

// =============================================================================
// 4. DYNASTY / HOUSE NAMES
// =============================================================================

var _DYNASTY_PREFIXES = ['House of', 'Clan', 'Dynasty of', 'Line of', 'Descendants of'];
var _DYNASTY_SUFFIXES = ['dynasty', 'clan', 'line', 'house'];
var _LOCATION_SUFFIXES = ['burg', 'shire', 'ford', 'bridge', 'ton', 'wick', 'worth'];
var _ADJECTIVE_PREFIXES = ['Golden', 'Silver', 'Iron', 'Steel', 'Ancient', 'Eternal', 'Mighty', 'Noble'];
var _ADJECTIVE_BASE = ['Lion', 'Wolf', 'Eagle', 'Hawk', 'Dragon', 'Phoenix', 'Bear', 'Stag', 'Falcon'];
var _DEFAULT_DYNASTIES = [
    'Starkhaven', 'Blackwood', 'Redcliff', 'Oakenshield', 'Ironfist',
    'Goldenthorn', 'Silverstream', 'Winterfell', 'Summerhall', 'Shadowmere',
    'Brightwater', 'Darkholm', 'Eaglecrest', 'Falconreach', 'Ravenwood'
];

/**
 * Generates a dynasty/house name.
 * @param {string} [type] - 'location' | 'founder' | 'adjective' | 'default'
 * @param {Object} [options] - { location, founder }
 * @returns {string}
 */
function generateDynastyName(type, options) {
    type = type || 'default';
    options = options || {};

    switch (type) {
        case 'location': {
            var location = options.location || 'Greenfield';
            var suffix = _pickRandom(_LOCATION_SUFFIXES);
            return location + suffix;
        }
        case 'founder': {
            var founder = options.founder || 'Unknown';
            var prefix = _pickRandom(_DYNASTY_PREFIXES);
            return prefix + ' ' + founder;
        }
        case 'adjective': {
            var adj = _pickRandom(_ADJECTIVE_PREFIXES);
            var base = _pickRandom(_ADJECTIVE_BASE);
            return adj + ' ' + base;
        }
        default:
            return _pickRandom(_DEFAULT_DYNASTIES);
    }
}

/**
 * Formats a dynasty name with an optional "House of" prefix.
 */
function formatDynastyName(dynastyName, includeHousePrefix) {
    includeHousePrefix = includeHousePrefix !== false;
    if (!dynastyName) return '';
    if (includeHousePrefix && dynastyName.indexOf('House of ') !== 0) {
        return 'House of ' + dynastyName;
    }
    return dynastyName;
}

// =============================================================================
// 5. CITY / LOCATION NAMES
// =============================================================================

var _CITY_PREFIXES = ['North', 'South', 'East', 'West', 'New', 'Old', 'Great', 'Little', 'Upper', 'Lower'];
var _CITY_ROOTS = ['bridge', 'bury', 'chester', 'ford', 'ham', 'ington', 'mere', 'mouth', 'port', 'stead', 'ton', 'wick', 'worth'];
var _CITY_SUFFIXES = ['shire', 'land', 'field', 'brook', 'dale', 'heath', 'wood', 'hurst'];
var _REGION_PREFIXES = ['Greater', 'Lesser', 'Northern', 'Southern', 'Eastern', 'Western', 'Central', 'Coastal', 'Mountain', 'River'];
var _REGION_BASES = ['March', 'Reach', 'Vale', 'Heath', 'Moor', 'Downs', 'Wolds', 'Fells', 'Hills', 'Plains'];
var _REGION_SUFFIXES = ['shire', 'land', 'mark', 'ia'];
var _LANDMARK_ADJECTIVES = ['Great', 'High', 'Deep', 'Dark', 'Misty', 'Silent', 'Ancient', 'Forgotten', 'Sacred', 'Cursed'];
var _LANDMARK_DESCRIPTORS = ["Giant's", "Dragon's", "Demon's", "Angel's", "King's", "Queen's", "Witch's", "Sorcerer's"];
var _LANDMARK_BASES = {
    mountain: ['Peak', 'Mountain', 'Mount', 'Summit', 'Crag', 'Tor', 'Fell', 'Kop'],
    river: ['River', 'Stream', 'Brook', 'Creek', 'Water', 'Flow'],
    forest: ['Forest', 'Woods', 'Grove', 'Wildwood', 'Thicket', 'Copse'],
    lake: ['Lake', 'Mere', 'Water', 'Pool', 'Tarn', 'Loch'],
    desert: ['Desert', 'Waste', 'Sands', 'Dunes', 'Expanse', 'Barrens']
};

/**
 * Capitalizes the first letter and lowercases the rest.
 * (Consolidated: this was previously duplicated as `capitalize` and
 * `capitalizeFirstLetter`. One canonical version now.)
 */
function capitalize(str) {
    if (!str || typeof str !== 'string') return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function generateCityName(countryId) {
    var cityParts = _getCityNameParts();

    if (countryId && cityParts && cityParts[countryId]) {
        var parts = cityParts[countryId];
        if (Array.isArray(parts.prefixes) && parts.prefixes.length
            && Array.isArray(parts.roots) && parts.roots.length) {
            var name = _pickRandom(parts.prefixes);
            name += _pickRandom(parts.roots);
            if (Array.isArray(parts.suffixes) && parts.suffixes.length && _randomBoolean(0.4)) {
                name += _pickRandom(parts.suffixes);
            }
            return capitalize(name);
        }
    }

    var fallback = '';
    if (_randomBoolean(0.7)) {
        fallback = _pickRandom(_CITY_PREFIXES) + _pickRandom(_CITY_ROOTS);
    } else {
        fallback = _pickRandom(_CITY_ROOTS);
    }
    if (_randomBoolean(0.3)) {
        fallback += _pickRandom(_CITY_SUFFIXES);
    }
    return capitalize(fallback);
}

function generateRegionName(countryId) {
    // countryId currently unused; kept for API symmetry with generateCityName
    var name = '';
    if (_randomBoolean(0.6)) {
        name = _pickRandom(_REGION_PREFIXES) + ' ';
    }
    name += _pickRandom(_REGION_BASES);
    if (_randomBoolean(0.3)) {
        name += _pickRandom(_REGION_SUFFIXES);
    }
    return name.trim();
}

function generateLandmarkName(type) {
    type = type || 'mountain';
    var bases = _LANDMARK_BASES[type] || _LANDMARK_BASES.mountain;

    var roll = _random();
    var name = '';
    if (roll < 0.33) {
        name = _pickRandom(_LANDMARK_ADJECTIVES) + ' ' + _pickRandom(bases);
    } else if (roll < 0.66) {
        name = _pickRandom(_LANDMARK_DESCRIPTORS) + ' ' + _pickRandom(bases);
    } else {
        name = _pickRandom(bases) + ' of the ' + _pickRandom(_LANDMARK_ADJECTIVES);
    }
    return name.trim();
}

// =============================================================================
// 6. TITLE / ORDINAL FORMATTING
// =============================================================================

var _EPITHET_POSITIVE = [
    'the Great', 'the Wise', 'the Brave', 'the Bold', 'the Magnificent',
    'the Conqueror', 'the Unifier', 'the Just', 'the Merciful', 'the Pious',
    'the Strong', 'the Swift', 'the Victorious', 'the Blessed', 'the Golden'
];
var _EPITHET_NEGATIVE = [
    'the Terrible', 'the Cruel', 'the Mad', 'the Usurper', 'the Unworthy',
    'the Accursed', 'the Tyrant', 'the Vain', 'the Foolish', 'the Reckless'
];
var _EPITHET_NEUTRAL = [
    'the Old', 'the Young', 'the Red', 'the Black', 'the White',
    'the Tall', 'the Short', 'the Silent', 'the Restless', 'the Wanderer'
];

var _ROMAN_NUMERALS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/**
 * Formats a rank + ordinal (as Roman numeral for 1-10).
 * 
 * Uses explicit `number !== null && number !== undefined` so that 0 is
 * preserved (and treated as "no ordinal" since ordinals start at 1).
 */
function formatTitleName(rank, number, useRoman) {
    useRoman = useRoman !== false;
    if (!rank) return '';
    var symbol = rank.symbol || '';
    var name = rank.name || '';
    var numberStr = '';

    if (number !== null && number !== undefined) {
        if (useRoman && number >= 1 && number <= 10) {
            numberStr = ' ' + _ROMAN_NUMERALS[number];
        } else if (number >= 1) {
            numberStr = ' ' + number;
        }
    }
    return (symbol + ' ' + name + numberStr).trim();
}

/**
 * Generates a random epithet for a character.
 * @param {Object} char - currently unused; kept for API stability
 * @param {string} [type] - 'positive' | 'negative' | 'neutral' | 'random'
 * @returns {string}
 */
function generateEpithet(char, type) {
    type = type || 'random';
    var pool;
    var resolvedType = type;

    if (resolvedType === 'random') {
        var roll = _random();
        if (roll < 0.33) resolvedType = 'positive';
        else if (roll < 0.66) resolvedType = 'negative';
        else resolvedType = 'neutral';
    }

    switch (resolvedType) {
        case 'positive': pool = _EPITHET_POSITIVE; break;
        case 'negative': pool = _EPITHET_NEGATIVE; break;
        default: pool = _EPITHET_NEUTRAL;
    }
    return _pickRandom(pool);
}

/**
 * Formats a character's full title with rank display and optional epithet.
 */
function formatFullTitle(char, includeEpithet) {
    includeEpithet = includeEpithet !== false;
    if (!char) return '';

    var rankDisplay = null;
    var rank = _getActiveRankDisplay(char);
    if (rank) rankDisplay = rank.display;

    var rankStr = rankDisplay ? rankDisplay + ' ' : '';
    var nameStr = ((char.name || '') + ' ' + (char.surname || '')).trim();

    if (includeEpithet && char.epithet) {
        return rankStr + nameStr + ' ' + char.epithet;
    }
    return rankStr + nameStr;
}

// =============================================================================
// 7. NAME NORMALIZATION
// =============================================================================

/**
 * Normalizes a name for storage/display: trims and collapses whitespace,
 * then capitalizes each word.
 */
function normalizeName(name) {
    if (!name || typeof name !== 'string') return '';
    var parts = name.split(' ').filter(function(p) { return p.length > 0; });
    var result = [];
    for (var i = 0; i < parts.length; i++) {
        result.push(capitalize(parts[i]));
    }
    return result.join(' ');
}

// =============================================================================
// 8. REGNAL NAMING
// =============================================================================

/**
 * Formats a regnal name with an ordinal.
 */
function formatRegnalName(baseName, number, useRoman) {
    useRoman = useRoman !== false;
    if (!baseName) return '';
    if (number === null || number === undefined || number < 2) return baseName;
    if (useRoman && number <= 10) {
        return baseName + ' ' + _ROMAN_NUMERALS[number];
    }
    return baseName + ' ' + number;
}

/**
 * Determines the next regnal number for a given name, given previous rulers.
 * 
 * Escapes regex metacharacters in the name before building the matcher.
 * 
 * @param {string} name
 * @param {string[]} previousRulers - names like ["Henry II", "Henry IV"]
 * @returns {number}
 */
function getNextRegnalNumber(name, previousRulers) {
    if (!name || !Array.isArray(previousRulers)) return 1;

    // Escape regex metacharacters
    var escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var pattern = new RegExp('^' + escaped + '\\s*(\\d+)$|^' + escaped + '\\s*([IVXLCDM]+)$', 'i');

    var romanValues = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    var highest = 0;

    for (var i = 0; i < previousRulers.length; i++) {
        var ruler = previousRulers[i];
        if (typeof ruler !== 'string') continue;
        var match = ruler.match(pattern);
        if (!match) continue;

        if (match[1]) {
            var num = parseInt(match[1], 10);
            if (num > highest) highest = num;
        } else if (match[2]) {
            var roman = match[2].toUpperCase();
            var value = 0;
            var prevValue = 0;
            for (var j = roman.length - 1; j >= 0; j--) {
                var curr = romanValues[roman[j]] || 0;
                if (curr < prevValue) value -= curr;
                else value += curr;
                prevValue = curr;
            }
            if (value > highest) highest = value;
        }
    }
    return highest + 1;
}

// =============================================================================
// 9. EXPORTS
// =============================================================================

// Character names
window.getRandomNameFromCountry = getRandomNameFromCountry;
window.getRandomSurnameFromCountry = getRandomSurnameFromCountry;
window.generateRandomFullName = generateRandomFullName;

// Character name rule queries
window.getCharacterSurnameRules = getCharacterSurnameRules;
window.getCharacterEpithet = getCharacterEpithet;
window.getCharacterSurnameSource = getCharacterSurnameSource;

// Dynasty names
window.generateDynastyName = generateDynastyName;
window.formatDynastyName = formatDynastyName;

// City/region/landmark names
window.generateCityName = generateCityName;
window.generateRegionName = generateRegionName;
window.generateLandmarkName = generateLandmarkName;

// Titles
window.formatTitleName = formatTitleName;
window.generateEpithet = generateEpithet;
window.formatFullTitle = formatFullTitle;

// Normalization (single canonical capitalize)
window.capitalize = capitalize;
window.normalizeName = normalizeName;

// Regnal naming
window.formatRegnalName = formatRegnalName;
window.getNextRegnalNumber = getNextRegnalNumber;

// Deprecated aliases (kept only during migration)
window.capitalizeFirstLetter = capitalize; // deprecated; use capitalize