/**
 * =============================================================================
 * STILL WATERS - NAMING SYSTEM (names.js)
 * =============================================================================
 * 
 * LOCATION: js/core/names.js
 * 
 * This file contains ALL naming-related functions including:
 * - Character name generation
 * - Character surname rules & epithets (MOVED FROM accessors.js)
 * - Role categories (MOVED FROM accessors.js)
 * - Dynasty/House name generation
 * - City/Location name generation
 * - Title formatting
 * - Name validation
 * - Regnal numbering
 * 
 * DEPENDENCIES:
 *   - randomness.js: pickRandom, random, randomBoolean
 *   - accessors.js: getCharacters, getCharacterById, getActiveRankDisplay, getRoles
 * 
 * ICON POLICY: No emojis. Use icons.js sparingly.
 * 
 * =============================================================================
 */

// =============================================================================
// 0. DEPENDENCY VERIFICATION
// =============================================================================

if (typeof window.pickRandom !== 'function') {
    window.pickRandom = function(arr) {
        if (!arr || arr.length === 0) return null;
        return arr[Math.floor(Math.random() * arr.length)];
    };
}

// =============================================================================
// 1. DEPENDENCY WRAPPERS - ALIASES TO CANONICAL SOURCES
// =============================================================================

function _pickRandom(arr) {
    if (typeof window.pickRandom === 'function') return window.pickRandom(arr);
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
}

function _random() {
    if (typeof window.random === 'function') return window.random();
    return Math.random();
}

function _randomBoolean(bias) {
    bias = bias || 0.5;
    return _random() < bias;
}

function _getCharacters() {
    if (typeof window.getCharacters === 'function') {
        return window.getCharacters();
    }
    return [];
}

function _getCharacterById(id) {
    if (typeof window.getCharacterById === 'function') {
        return window.getCharacterById(id);
    }
    return null;
}

function _getActiveRankDisplay(character) {
    if (typeof window.getActiveRankDisplay === 'function') {
        return window.getActiveRankDisplay(character);
    }
    return null;
}

function _getNameLists() {
    if (typeof window.getNameLists === 'function') {
        return window.getNameLists();
    }
    return {};
}

function _getCityNameParts() {
    if (typeof window.getCityNameParts === 'function') {
        return window.getCityNameParts();
    }
    return {};
}

function _getRoles() {
    if (typeof window.getRoles === 'function') {
        return window.getRoles();
    }
    return [];
}

// =============================================================================
// 2. CHARACTER NAMES - PRIMARY DEFINITIONS
// =============================================================================

function getRandomNameFromCountry(countryId, gender) {
    gender = gender || 'any';
    var nameLists = _getNameLists();
    
    if (!countryId) {
        var countries = Object.keys(nameLists);
        if (countries.length === 0) return null;
        countryId = countries[0];
    }
    
    var nameList = nameLists[countryId];
    if (!nameList) {
        return null;
    }
    
    if (gender === 'male' && nameList.male && nameList.male.length) {
        return _pickRandom(nameList.male);
    }
    if (gender === 'female' && nameList.female && nameList.female.length) {
        return _pickRandom(nameList.female);
    }
    
    var allNames = [];
    if (nameList.male) {
        for (var i = 0; i < nameList.male.length; i++) {
            allNames.push(nameList.male[i]);
        }
    }
    if (nameList.female) {
        for (var i = 0; i < nameList.female.length; i++) {
            allNames.push(nameList.female[i]);
        }
    }
    if (allNames.length) {
        return _pickRandom(allNames);
    }
    
    return null;
}

function getRandomSurnameFromCountry(countryId) {
    var nameLists = _getNameLists();
    
    if (!countryId) {
        var countries = Object.keys(nameLists);
        if (countries.length === 0) return '';
        countryId = countries[0];
    }
    
    var nameList = nameLists[countryId];
    if (!nameList) {
        return '';
    }
    
    if (nameList.surnames && nameList.surnames.length) {
        return _pickRandom(nameList.surnames);
    }
    
    return '';
}

function generateRandomFullName(countryId, gender) {
    var name = getRandomNameFromCountry(countryId, gender);
    if (!name) return null;
    var surname = getRandomSurnameFromCountry(countryId);
    return { name: name, surname: surname || '' };
}

// =============================================================================
// 3. CHARACTER SURNAME RULES & EPITHETS (MOVED FROM accessors.js)
// =============================================================================

function getCharacterSurnameRules(characterId) {
    var character = _getCharacterById(characterId);
    if (!character) return null;
    return character.surnameRules || null;
}

function getCharacterEpithet(characterId) {
    var character = _getCharacterById(characterId);
    if (!character) return '';
    return character.epithet || '';
}

function getCharacterSurnameSource(characterId) {
    var character = _getCharacterById(characterId);
    if (!character) return 'country';
    return character.surnameSource || 'country';
}

// =============================================================================
// 4. ROLE CATEGORIES (MOVED FROM accessors.js)
// =============================================================================

function getRoleCategories(roles) {
    var roleArray = roles || _getRoles();
    
    var categories = {};
    
    var defaultCategories = {
        combat: { id: 'combat', name: 'Combat & Military', icon: '⚔' },
        craft: { id: 'craft', name: 'Craftsmanship', icon: '⌇' },
        trade: { id: 'trade', name: 'Trade & Commerce', icon: '⌇' },
        agriculture: { id: 'agriculture', name: 'Agriculture & Fishing', icon: '⌇' },
        academic: { id: 'academic', name: 'Academic & Scholar', icon: '⌇' },
        religious: { id: 'religious', name: 'Religious', icon: '⌆' },
        admin: { id: 'admin', name: 'Administration', icon: '⌇' },
        service: { id: 'service', name: 'Service', icon: '⌇' },
        art: { id: 'art', name: 'Artistic', icon: '⌇' }
    };
    
    for (var key in defaultCategories) {
        if (defaultCategories.hasOwnProperty(key)) {
            categories[key] = defaultCategories[key];
        }
    }
    
    for (var i = 0; i < roleArray.length; i++) {
        var role = roleArray[i];
        if (role.category && !categories[role.category]) {
            categories[role.category] = {
                id: role.category,
                name: role.category.charAt(0).toUpperCase() + role.category.slice(1),
                icon: '⌇'
            };
        }
    }
    
    return categories;
}

// =============================================================================
// 5. DYNASTY / HOUSE NAMES - PRIMARY DEFINITIONS
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

function generateDynastyName(type, options) {
    type = type || 'default';
    options = options || {};
    switch (type) {
        case 'location':
            var location = options.location || 'Greenfield';
            var suffix = _pickRandom(_LOCATION_SUFFIXES);
            return location + suffix;
        case 'founder':
            var founder = options.founder || 'Unknown';
            var prefix = _pickRandom(_DYNASTY_PREFIXES);
            return prefix + ' ' + founder;
        case 'adjective':
            var adjective = _pickRandom(_ADJECTIVE_PREFIXES);
            var base = _pickRandom(_ADJECTIVE_BASE);
            return adjective + ' ' + base;
        default:
            return _pickRandom(_DEFAULT_DYNASTIES);
    }
}

function formatDynastyName(dynastyName, includeHousePrefix) {
    includeHousePrefix = includeHousePrefix !== false;
    if (!dynastyName) return '';
    if (includeHousePrefix && dynastyName.indexOf('House of ') !== 0) {
        return 'House of ' + dynastyName;
    }
    return dynastyName;
}

// =============================================================================
// 6. CITY / LOCATION NAMES - PRIMARY DEFINITIONS
// =============================================================================

var _CITY_PREFIXES = ['North', 'South', 'East', 'West', 'New', 'Old', 'Great', 'Little', 'Upper', 'Lower'];
var _CITY_ROOTS = ['bridge', 'bury', 'chester', 'ford', 'ham', 'ington', 'mere', 'mouth', 'port', 'stead', 'ton', 'wick', 'worth'];
var _CITY_SUFFIXES = ['shire', 'land', 'field', 'brook', 'dale', 'heath', 'wood', 'hurst'];
var _REGION_PREFIXES = ['Greater', 'Lesser', 'Northern', 'Southern', 'Eastern', 'Western', 'Central', 'Coastal', 'Mountain', 'River'];
var _REGION_BASES = ['March', 'Reach', 'Vale', 'Heath', 'Moor', 'Downs', 'Wolds', 'Fells', 'Hills', 'Plains'];
var _REGION_SUFFIXES = ['shire', 'land', 'mark', 'ia'];
var _LANDMARK_ADJECTIVES = ['Great', 'High', 'Deep', 'Dark', 'Misty', 'Silent', 'Ancient', 'Forgotten', 'Sacred', 'Cursed'];
var _LANDMARK_DESCRIPTORS = ['Giant\'s', 'Dragon\'s', 'Demon\'s', 'Angel\'s', 'King\'s', 'Queen\'s', 'Witch\'s', 'Sorcerer\'s'];
var _LANDMARK_BASES = {
    mountain: ['Peak', 'Mountain', 'Mount', 'Summit', 'Crag', 'Tor', 'Fell', 'Kop'],
    river: ['River', 'Stream', 'Brook', 'Creek', 'Water', 'Flow'],
    forest: ['Forest', 'Woods', 'Grove', 'Wildwood', 'Thicket', 'Copse'],
    lake: ['Lake', 'Mere', 'Water', 'Pool', 'Tarn', 'Loch'],
    desert: ['Desert', 'Waste', 'Sands', 'Dunes', 'Expanse', 'Barrens']
};

function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function generateCityName(countryId) {
    var cityParts = _getCityNameParts();
    
    if (countryId && cityParts && cityParts[countryId]) {
        var parts = cityParts[countryId];
        if (parts.prefixes && parts.prefixes.length && parts.roots && parts.roots.length) {
            var name = _pickRandom(parts.prefixes);
            name += _pickRandom(parts.roots);
            if (parts.suffixes && parts.suffixes.length && _randomBoolean(0.4)) {
                name += _pickRandom(parts.suffixes);
            }
            return capitalize(name);
        }
    }
    
    var name = '';
    if (_randomBoolean(0.7)) {
        name = _pickRandom(_CITY_PREFIXES) + _pickRandom(_CITY_ROOTS);
    } else {
        name = _pickRandom(_CITY_ROOTS);
    }
    if (_randomBoolean(0.3)) {
        name += _pickRandom(_CITY_SUFFIXES);
    }
    return capitalize(name);
}

function generateRegionName(countryId) {
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
// 7. TITLE NAMING - PRIMARY DEFINITIONS
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

function formatTitleName(rank, number, useRoman) {
    useRoman = useRoman !== false;
    if (!rank) return '';
    var symbol = rank.symbol || '';
    var name = rank.name || '';
    var numberStr = '';
    if (number) {
        if (useRoman && number >= 1 && number <= 10) {
            var romanNumerals = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
            numberStr = ' ' + romanNumerals[number];
        } else {
            numberStr = ' ' + number;
        }
    }
    return (symbol + ' ' + name + numberStr).trim();
}

function generateEpithet(char, type) {
    type = type || 'random';
    var epithets;
    var useType = type;
    if (useType === 'random') {
        var roll = _random();
        if (roll < 0.33) useType = 'positive';
        else if (roll < 0.66) useType = 'negative';
        else useType = 'neutral';
    }
    switch (useType) {
        case 'positive': epithets = _EPITHET_POSITIVE; break;
        case 'negative': epithets = _EPITHET_NEGATIVE; break;
        default: epithets = _EPITHET_NEUTRAL;
    }
    return _pickRandom(epithets);
}

function formatFullTitle(char, includeEpithet) {
    includeEpithet = includeEpithet !== false;
    if (!char) return '';
    var rankDisplay = null;
    var rank = _getActiveRankDisplay(char);
    rankDisplay = rank ? rank.display : null;
    var rankStr = rankDisplay ? rankDisplay + ' ' : '';
    var nameStr = (char.name + ' ' + (char.surname || '')).trim();
    if (includeEpithet && char.epithet) {
        return rankStr + nameStr + ' ' + char.epithet;
    }
    return rankStr + nameStr;
}

// =============================================================================
// 8. NAME VALIDATION & FORMATTING - PRIMARY DEFINITIONS
// =============================================================================

function capitalizeFirstLetter(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function normalizeName(name) {
    if (!name) return '';
    var parts = name.split(' ');
    var result = [];
    for (var i = 0; i < parts.length; i++) {
        result.push(capitalizeFirstLetter(parts[i]));
    }
    return result.join(' ');
}

function validateName(name) {
    if (!name || name.trim() === '') {
        return { isValid: false, message: 'Name cannot be empty' };
    }
    if (name.length > 50) {
        return { isValid: false, message: 'Name cannot exceed 50 characters' };
    }
    var nameRegex = /^[\p{L}\s\-'\.]+$/u;
    if (!nameRegex.test(name)) {
        return { isValid: false, message: 'Name contains invalid characters (use letters, spaces, hyphens, apostrophes, or dots)' };
    }
    return { isValid: true, message: 'Valid name' };
}

// =============================================================================
// 9. DYNASTIC SUCCESSION NAMING - PRIMARY DEFINITIONS
// =============================================================================

function formatRegnalName(baseName, number, useRoman) {
    useRoman = useRoman !== false;
    if (!baseName) return '';
    if (!number || number < 2) return baseName;
    if (useRoman) {
        var romanNumerals = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
        if (number <= 10) {
            return baseName + ' ' + romanNumerals[number];
        }
    }
    return baseName + ' ' + number;
}

function getNextRegnalNumber(name, previousRulers) {
    var highest = 0;
    var pattern = new RegExp('^' + name + '\\s*(\\d+)$|^' + name + '\\s*([IVXLCDM]+)$', 'i');
    for (var i = 0; i < previousRulers.length; i++) {
        var ruler = previousRulers[i];
        var match = ruler.match(pattern);
        if (match) {
            if (match[1]) {
                var num = parseInt(match[1], 10);
                if (num > highest) highest = num;
            } else if (match[2]) {
                var roman = match[2].toUpperCase();
                var romanValues = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
                var value = 0;
                var prevValue = 0;
                for (var j = roman.length - 1; j >= 0; j--) {
                    var currValue = romanValues[roman[j]] || 0;
                    if (currValue < prevValue) {
                        value -= currValue;
                    } else {
                        value += currValue;
                    }
                    prevValue = currValue;
                }
                if (value > highest) highest = value;
            }
        }
    }
    return highest + 1;
}

// =============================================================================
// 10. EXPORTS - SINGLE SOURCE OF TRUTH
// =============================================================================

// Character names
window.getRandomNameFromCountry = getRandomNameFromCountry;
window.getRandomSurnameFromCountry = getRandomSurnameFromCountry;
window.generateRandomFullName = generateRandomFullName;

// Character surname rules & epithets (MOVED FROM accessors.js)
window.getCharacterSurnameRules = getCharacterSurnameRules;
window.getCharacterEpithet = getCharacterEpithet;
window.getCharacterSurnameSource = getCharacterSurnameSource;

// Role categories (MOVED FROM accessors.js)
window.getRoleCategories = getRoleCategories;

// Dynasty names
window.generateDynastyName = generateDynastyName;
window.formatDynastyName = formatDynastyName;

// City/Location names
window.generateCityName = generateCityName;
window.generateRegionName = generateRegionName;
window.generateLandmarkName = generateLandmarkName;

// Title formatting
window.formatTitleName = formatTitleName;
window.generateEpithet = generateEpithet;
window.formatFullTitle = formatFullTitle;

// Name validation & formatting
window.capitalize = capitalize;
window.capitalizeFirstLetter = capitalizeFirstLetter;
window.normalizeName = normalizeName;
window.validateName = validateName;

// Regnal numbering
window.formatRegnalName = formatRegnalName;
window.getNextRegnalNumber = getNextRegnalNumber;