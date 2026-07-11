/**
 * =============================================================================
 * STILL WATERS - NAMING SYSTEM (names.js)
 * =============================================================================
 * 
 * LOCATION: js/core/names.js
 * 
 * This file contains ALL naming-related functions including:
 * - Character name generation (given names, surnames)
 * - Dynasty/House name generation
 * - City/Location name generation
 * - Title formatting
 * - Epithet generation
 * - Name validation and normalization
 * - Regnal numbering
 * - Character surname rules and epithets (moved from accessors.js)
 * 
 * FIXED VERSION - NO FALLBACKS to other cultures
 * 
 * FIXES:
 * - getRandomNameFromCountry: Returns null if country has no names (NO FALLBACK)
 * - getRandomSurnameFromCountry: Returns empty string if country has no surnames (NO FALLBACK)
 * - generateRandomFullName: Returns null if name generation fails (NO FALLBACK)
 * 
 * =============================================================================
 */

// =============================================================================
// 0. DEPENDENCY VERIFICATION & WRAPPERS
// =============================================================================

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
    return _random() < (bias || 0.5);
}

// =============================================================================
// 1. CHARACTER NAMES (Given Names) - NO FALLBACK
// =============================================================================

/**
 * Gets a random given name from a country's name list
 * @param {string|null} countryId - Country ID (null for default)
 * @param {string} gender - 'male', 'female', or any (default 'any')
 * @returns {string|null} Random given name or null if none found
 */
function getRandomNameFromCountry(countryId, gender = 'any') {
    const nameLists = _getNameLists();
    
    // If no countryId, try to find the first available country
    if (!countryId) {
        const countries = Object.keys(nameLists);
        if (countries.length === 0) return null;
        countryId = countries[0];
    }
    
    // Check if this country has name data
    const nameList = nameLists[countryId];
    if (!nameList) {
        return null;
    }
    
    // Try to get name by gender
    if (gender === 'male' && nameList.male && nameList.male.length) {
        return _pickRandom(nameList.male);
    }
    if (gender === 'female' && nameList.female && nameList.female.length) {
        return _pickRandom(nameList.female);
    }
    
    // Try combined list
    const allNames = [...(nameList.male || []), ...(nameList.female || [])];
    if (allNames.length) {
        return _pickRandom(allNames);
    }
    
    // NO FALLBACK - return null
    return null;
}

/**
 * Gets a random surname from a country's name list
 * Returns empty string if no surnames defined (some cultures have no surnames)
 * @param {string|null} countryId - Country ID (null for default)
 * @returns {string} Random surname or empty string if none
 */
function getRandomSurnameFromCountry(countryId) {
    const nameLists = _getNameLists();
    
    // If no countryId, try to find the first available country
    if (!countryId) {
        const countries = Object.keys(nameLists);
        if (countries.length === 0) return '';
        countryId = countries[0];
    }
    
    // Check if this country has name data
    const nameList = nameLists[countryId];
    if (!nameList) {
        return '';
    }
    
    // Check if this country has surnames
    if (nameList.surnames && nameList.surnames.length) {
        return _pickRandom(nameList.surnames);
    }
    
    // NO FALLBACK - return empty string (some cultures have no surnames)
    return '';
}

/**
 * Generates a full random name (given + surname)
 * @param {string|null} countryId - Country ID
 * @param {string} gender - 'male' or 'female'
 * @returns {Object|null} { name: string, surname: string } or null if name generation fails
 */
function generateRandomFullName(countryId, gender) {
    const name = getRandomNameFromCountry(countryId, gender);
    if (!name) return null;
    
    const surname = getRandomSurnameFromCountry(countryId);
    return { name: name, surname: surname || '' };
}

// =============================================================================
// 2. CHARACTER SURNAME RULES & EPITHETS (moved from accessors.js)
// =============================================================================

/**
 * Gets a character's surname generation rules
 * @param {string} characterId - Character ID
 * @returns {Object|null} Surname rules object or null
 */
function getCharacterSurnameRules(characterId) {
    const character = _getCharacterById(characterId);
    if (!character) return null;
    return character.surnameRules || null;
}

/**
 * Gets a character's epithet/nickname
 * @param {string} characterId - Character ID
 * @returns {string} Epithet or empty string
 */
function getCharacterEpithet(characterId) {
    const character = _getCharacterById(characterId);
    if (!character) return '';
    return character.epithet || '';
}

/**
 * Gets a character's surname source ('country' or 'rank')
 * @param {string} characterId - Character ID
 * @returns {string} Surname source ('country' or 'rank')
 */
function getCharacterSurnameSource(characterId) {
    const character = _getCharacterById(characterId);
    if (!character) return 'country';
    return character.surnameSource || 'country';
}

// =============================================================================
// 3. DYNASTY / HOUSE NAMES
// =============================================================================

const _DYNASTY_PREFIXES = ['House of', 'Clan', 'Dynasty of', 'Line of', 'Descendants of'];
const _DYNASTY_SUFFIXES = ['dynasty', 'clan', 'line', 'house'];
const _LOCATION_SUFFIXES = ['burg', 'shire', 'ford', 'bridge', 'ton', 'wick', 'worth'];
const _ADJECTIVE_PREFIXES = ['Golden', 'Silver', 'Iron', 'Steel', 'Ancient', 'Eternal', 'Mighty', 'Noble'];
const _ADJECTIVE_BASE = ['Lion', 'Wolf', 'Eagle', 'Hawk', 'Dragon', 'Phoenix', 'Bear', 'Stag', 'Falcon'];
const _DEFAULT_DYNASTIES = [
    'Starkhaven', 'Blackwood', 'Redcliff', 'Oakenshield', 'Ironfist',
    'Goldenthorn', 'Silverstream', 'Winterfell', 'Summerhall', 'Shadowmere',
    'Brightwater', 'Darkholm', 'Eaglecrest', 'Falconreach', 'Ravenwood'
];

function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function generateDynastyName(type = 'default', options = {}) {
    switch (type) {
        case 'location':
            const location = options.location || 'Greenfield';
            const suffix = _pickRandom(_LOCATION_SUFFIXES);
            return `${location}${suffix}`;
        case 'founder':
            const founder = options.founder || 'Unknown';
            const prefix = _pickRandom(_DYNASTY_PREFIXES);
            return `${prefix} ${founder}`;
        case 'adjective':
            const adjective = _pickRandom(_ADJECTIVE_PREFIXES);
            const base = _pickRandom(_ADJECTIVE_BASE);
            return `${adjective} ${base}`;
        default:
            return _pickRandom(_DEFAULT_DYNASTIES);
    }
}

function formatDynastyName(dynastyName, includeHousePrefix = true) {
    if (!dynastyName) return '';
    if (includeHousePrefix && !dynastyName.startsWith('House of')) {
        return `House of ${dynastyName}`;
    }
    return dynastyName;
}

// =============================================================================
// 4. CITY / LOCATION NAMES
// =============================================================================

const _CITY_PREFIXES = ['North', 'South', 'East', 'West', 'New', 'Old', 'Great', 'Little', 'Upper', 'Lower'];
const _CITY_ROOTS = ['bridge', 'bury', 'chester', 'ford', 'ham', 'ington', 'mere', 'mouth', 'port', 'stead', 'ton', 'wick', 'worth'];
const _CITY_SUFFIXES = ['shire', 'land', 'field', 'brook', 'dale', 'heath', 'wood', 'hurst'];
const _REGION_PREFIXES = ['Greater', 'Lesser', 'Northern', 'Southern', 'Eastern', 'Western', 'Central', 'Coastal', 'Mountain', 'River'];
const _REGION_BASES = ['March', 'Reach', 'Vale', 'Heath', 'Moor', 'Downs', 'Wolds', 'Fells', 'Hills', 'Plains'];
const _REGION_SUFFIXES = ['shire', 'land', 'mark', 'ia'];
const _LANDMARK_ADJECTIVES = ['Great', 'High', 'Deep', 'Dark', 'Misty', 'Silent', 'Ancient', 'Forgotten', 'Sacred', 'Cursed'];
const _LANDMARK_DESCRIPTORS = ['Giant\'s', 'Dragon\'s', 'Demon\'s', 'Angel\'s', 'King\'s', 'Queen\'s', 'Witch\'s', 'Sorcerer\'s'];
const _LANDMARK_BASES = {
    mountain: ['Peak', 'Mountain', 'Mount', 'Summit', 'Crag', 'Tor', 'Fell', 'Kop'],
    river: ['River', 'Stream', 'Brook', 'Creek', 'Water', 'Flow'],
    forest: ['Forest', 'Woods', 'Grove', 'Wildwood', 'Thicket', 'Copse'],
    lake: ['Lake', 'Mere', 'Water', 'Pool', 'Tarn', 'Loch'],
    desert: ['Desert', 'Waste', 'Sands', 'Dunes', 'Expanse', 'Barrens']
};

function generateCityName(countryId) {
    const cityParts = _getCityNameParts();
    
    if (countryId && cityParts && cityParts[countryId]) {
        const parts = cityParts[countryId];
        
        if (parts.prefixes && parts.prefixes.length && parts.roots && parts.roots.length) {
            let name = _pickRandom(parts.prefixes);
            name += _pickRandom(parts.roots);
            if (parts.suffixes && parts.suffixes.length && _randomBoolean(0.4)) {
                name += _pickRandom(parts.suffixes);
            }
            return capitalize(name);
        }
    }
    
    let name = '';
    
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
    let name = '';
    
    if (_randomBoolean(0.6)) {
        name = _pickRandom(_REGION_PREFIXES) + ' ';
    }
    
    name += _pickRandom(_REGION_BASES);
    
    if (_randomBoolean(0.3)) {
        name += _pickRandom(_REGION_SUFFIXES);
    }
    
    return name.trim();
}

function generateLandmarkName(type = 'mountain') {
    const bases = _LANDMARK_BASES[type] || _LANDMARK_BASES.mountain;
    const roll = _random();
    let name = '';
    
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
// 5. TITLE NAMING
// =============================================================================

function formatTitleName(rank, number = null, useRoman = true) {
    if (!rank) return '';
    
    if (typeof window.formatTitle === 'function') {
        return window.formatTitle(rank, number);
    }
    
    const symbol = rank.symbol || '';
    const name = rank.name || '';
    let numberStr = '';
    
    if (number) {
        if (useRoman && number >= 1 && number <= 10) {
            const romanNumerals = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
            numberStr = ' ' + romanNumerals[number];
        } else {
            numberStr = ' ' + number;
        }
    }
    
    return `${symbol} ${name}${numberStr}`.trim();
}

const _EPITHET_POSITIVE = [
    'the Great', 'the Wise', 'the Brave', 'the Bold', 'the Magnificent',
    'the Conqueror', 'the Unifier', 'the Just', 'the Merciful', 'the Pious',
    'the Strong', 'the Swift', 'the Victorious', 'the Blessed', 'the Golden'
];
const _EPITHET_NEGATIVE = [
    'the Terrible', 'the Cruel', 'the Mad', 'the Usurper', 'the Unworthy',
    'the Accursed', 'the Tyrant', 'the Vain', 'the Foolish', 'the Reckless'
];
const _EPITHET_NEUTRAL = [
    'the Old', 'the Young', 'the Red', 'the Black', 'the White',
    'the Tall', 'the Short', 'the Silent', 'the Restless', 'the Wanderer'
];

function generateEpithet(char, type = 'random') {
    let epithets;
    let useType = type;
    
    if (useType === 'random') {
        const roll = _random();
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

function formatFullTitle(char, includeEpithet = true) {
    if (!char) return '';
    
    let rankDisplay = null;
    if (typeof window.getActiveRankDisplay === 'function') {
        const rank = window.getActiveRankDisplay(char);
        rankDisplay = rank ? rank.display : null;
    }
    
    const rankStr = rankDisplay ? rankDisplay + ' ' : '';
    const nameStr = `${char.name} ${char.surname || ''}`.trim();
    
    if (includeEpithet && char.epithet) {
        return `${rankStr}${nameStr} ${char.epithet}`;
    }
    
    return `${rankStr}${nameStr}`;
}

// =============================================================================
// 6. NAME VALIDATION & FORMATTING
// =============================================================================

function validateName(name) {
    if (typeof window.validateName === 'function' && 
        window.validateName !== validateName) {
        return window.validateName(name);
    }
    
    if (!name || name.trim() === '') {
        return { isValid: false, message: 'Name cannot be empty' };
    }
    
    if (name.length > 50) {
        return { isValid: false, message: 'Name cannot exceed 50 characters' };
    }
    
    const nameRegex = /^[\p{L}\s\-'\.]+$/u;
    if (!nameRegex.test(name)) {
        return { isValid: false, message: 'Name contains invalid characters (use letters, spaces, hyphens, apostrophes, or dots)' };
    }
    
    return { isValid: true, message: 'Valid name' };
}

function capitalizeFirstLetter(str) {
    if (typeof window.capitalize === 'function') {
        return window.capitalize(str);
    }
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function normalizeName(name) {
    if (typeof window.normalizeNameForStorage === 'function') {
        return window.normalizeNameForStorage(name);
    }
    
    if (!name) return '';
    return name.split(' ')
        .map(part => capitalizeFirstLetter(part))
        .join(' ');
}

// =============================================================================
// 7. DYNASTIC SUCCESSION NAMING
// =============================================================================

function formatRegnalName(baseName, number, useRoman = true) {
    if (!baseName) return '';
    if (!number || number < 2) return baseName;
    
    if (useRoman) {
        if (typeof window.formatSuccessionNumber === 'function') {
            const roman = window.formatSuccessionNumber(number);
            if (roman) {
                return `${baseName} ${roman}`;
            }
        }
        
        const romanNumerals = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
        if (number <= 10) {
            return `${baseName} ${romanNumerals[number]}`;
        }
    }
    
    return `${baseName} ${number}`;
}

function getNextRegnalNumber(name, previousRulers) {
    let highest = 0;
    
    const pattern = new RegExp(`^${name}\\s*(\\d+)$|^${name}\\s*([IVXLCDM]+)$`, 'i');
    
    for (const ruler of previousRulers) {
        const match = ruler.match(pattern);
        if (match) {
            if (match[1]) {
                const num = parseInt(match[1], 10);
                if (num > highest) highest = num;
            } else if (match[2]) {
                const roman = match[2].toUpperCase();
                const romanValues = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
                let value = 0;
                let prevValue = 0;
                for (let i = roman.length - 1; i >= 0; i--) {
                    const currValue = romanValues[roman[i]] || 0;
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
// 8. ROLE CATEGORIES (moved from accessors.js)
// =============================================================================

/**
 * Gets all role categories from roles (derived, not stored separately)
 * Uses monochrome simple icons
 * @param {Array} roles - Optional roles array (defaults to getRoles())
 * @returns {Object} Object mapping category IDs to category info
 */
function getRoleCategories(roles) {
    let roleArray = roles;
    if (!roleArray) {
        if (typeof window.getRoles === 'function') {
            roleArray = window.getRoles();
        } else {
            roleArray = [];
        }
    }
    
    const categories = {};
    
    // Default categories with monochrome icons
    const defaultCategories = {
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
    
    // Start with defaults
    Object.assign(categories, defaultCategories);
    
    // Add any custom categories from roles
    for (const role of roleArray) {
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
// 9. EXPORTS
// =============================================================================

// Character names
window.getRandomNameFromCountry = getRandomNameFromCountry;
window.getRandomSurnameFromCountry = getRandomSurnameFromCountry;
window.generateRandomFullName = generateRandomFullName;

// Character surname rules & epithets (moved from accessors.js)
window.getCharacterSurnameRules = getCharacterSurnameRules;
window.getCharacterEpithet = getCharacterEpithet;
window.getCharacterSurnameSource = getCharacterSurnameSource;

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
window.validateName = validateName;
window.capitalizeFirstLetter = capitalizeFirstLetter;
window.normalizeName = normalizeName;

// Regnal numbering
window.formatRegnalName = formatRegnalName;
window.getNextRegnalNumber = getNextRegnalNumber;

// Role categories (moved from accessors.js)
window.getRoleCategories = getRoleCategories;
