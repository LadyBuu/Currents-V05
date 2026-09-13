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
 *   - Regnal numbering
 *   - Epithet generation
 * 
 * OUT OF SCOPE:
 *   - String case conversion (see formatting.js: capitalize, titleCase, etc.)
 *   - Name validation (see validation.js: validateName)
 *   - Role categories (see role-queries.js)
 *   - Display formatting (see formatting.js)
 *   - Character CRUD/accessors (see character-queries.js)
 * 
 * SEMANTIC RULES:
 *   - RNG comes from randomness.js. No fallback implementation.
 *   - Missing required dependencies throw.
 *   - Missing countryId (null/undefined) → null.
 *   - Valid country with no surname list → ''.
 *   - Invalid explicit inputs (bad ordinal, unknown epithet type, unknown
 *     landmark type) throw rather than silently defaulting.
 *   - `0` is preserved in all optional parameters.
 * 
 * DEPENDENCIES (all REQUIRED):
 *   - randomness.js: pickRandom, random, randomBoolean
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
        var required = ['pickRandom', 'random', 'randomBoolean'];
        var missing = [];
        for (var i = 0; i < required.length; i++) {
            if (typeof window[required[i]] !== 'function') {
                missing.push(required[i]);
            }
        }
        if (missing.length > 0) {
            throw new Error('names.js: missing required dependencies from randomness.js: ' + missing.join(', '));
        }
    }

    function _requireAccessor(name, moduleHint) {
        if (typeof window[name] !== 'function') {
            throw new Error('names.js: ' + name + ' is required (load ' + moduleHint + ' first).');
        }
    }

    // =========================================================================
    // 1. INTERNAL HELPERS
    // =========================================================================

    function _random() { return window.random(); }
    function _pickRandom(arr) { return window.pickRandom(arr); }
    function _randomBoolean(bias) { return window.randomBoolean(bias); }

    function _isMissing(v) { return v === null || v === undefined; }

    /**
     * Returns the canonical Roman numeral for n (1..10). Returns String(n)
     * for values > 10. Returns null for invalid input.
     * @private
     */
    function _romanNumeral(n) {
        if (!Number.isInteger(n) || n < 1) return null;
        var numerals = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
        if (n <= 10) return numerals[n];
        return String(n);
    }

    /**
     * Parses a Roman numeral string to a number. Returns null if invalid.
     * Accepts strictly canonical forms (rejects "IIV", "IIX", "VX").
     * @private
     */
    function _parseRoman(str) {
        if (typeof str !== 'string' || str.length === 0) return null;
        var upper = str.toUpperCase();
        if (!/^[IVXLCDM]+$/.test(upper)) return null;

        var values = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
        var total = 0;
        var prevValue = 0;
        for (var i = upper.length - 1; i >= 0; i--) {
            var curr = values[upper[i]];
            if (curr === undefined) return null;
            if (curr < prevValue) total -= curr;
            else total += curr;
            prevValue = curr;
        }

        // Round-trip check: only accept canonical forms
        var canonical = _romanNumeral(total);
        if (canonical === null) return null;
        if (canonical !== upper) return null;
        return total;
    }

    // =========================================================================
    // 2. CHARACTER NAMES
    // =========================================================================

    function _getNameLists() {
        _requireAccessor('getNameLists', 'accessors.js');
        return window.getNameLists();
    }

    /**
     * Picks a random given name from a country's name lists.
     * 
     * @param {string} countryId
     * @param {string} [gender] - 'male' | 'female' | 'any' (default 'any')
     * @returns {string|null} null if country missing or unknown
     */
    function getRandomNameFromCountry(countryId, gender) {
        if (_isMissing(countryId)) return null;
        if (typeof countryId !== 'string' || countryId.length === 0) return null;

        gender = _isMissing(gender) ? 'any' : gender;

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
     * 
     * Semantics:
     *   - missing countryId (null/undefined) → null
     *   - unknown countryId → null
     *   - valid country with no surnames → ''
     *   - valid country with surnames → string
     * 
     * @param {string} countryId
     * @returns {string|null}
     */
    function getRandomSurnameFromCountry(countryId) {
        if (_isMissing(countryId)) return null;
        if (typeof countryId !== 'string' || countryId.length === 0) return null;

        var lists = _getNameLists();
        var country = lists[countryId];
        if (!country) return null;

        if (Array.isArray(country.surnames) && country.surnames.length) {
            return _pickRandom(country.surnames);
        }
        return '';
    }

    /**
     * Generates a full name from a country.
     * Returns null if given name cannot be generated.
     * Surname field is null when the country is unknown; '' when there are
     * no surnames for that country.
     */
    function generateRandomFullName(countryId, gender) {
        var name = getRandomNameFromCountry(countryId, gender);
        if (!name) return null;
        var surname = getRandomSurnameFromCountry(countryId);
        return { name: name, surname: surname };
    }

    // =========================================================================
    // 3. CHARACTER NAME RULE QUERIES
    // =========================================================================

    function getCharacterSurnameRules(characterId) {
        _requireAccessor('getCharacterById', 'accessors.js');
        var c = window.getCharacterById(characterId);
        if (!c) return null;
        return c.surnameRules || null;
    }

    function getCharacterEpithet(characterId) {
        _requireAccessor('getCharacterById', 'accessors.js');
        var c = window.getCharacterById(characterId);
        if (!c) return '';
        return c.epithet || '';
    }

    function getCharacterSurnameSource(characterId) {
        _requireAccessor('getCharacterById', 'accessors.js');
        var c = window.getCharacterById(characterId);
        if (!c) return 'country';
        return c.surnameSource || 'country';
    }

    // =========================================================================
    // 4. DYNASTY / HOUSE NAMES
    // =========================================================================

    var _DYNASTY_PREFIXES = ['House of', 'Clan', 'Dynasty of', 'Line of', 'Descendants of'];
    var _LOCATION_SUFFIXES = ['burg', 'shire', 'ford', 'bridge', 'ton', 'wick', 'worth'];
    var _ADJECTIVE_PREFIXES = ['Golden', 'Silver', 'Iron', 'Steel', 'Ancient', 'Eternal', 'Mighty', 'Noble'];
    var _ADJECTIVE_BASE = ['Lion', 'Wolf', 'Eagle', 'Hawk', 'Dragon', 'Phoenix', 'Bear', 'Stag', 'Falcon'];
    var _DEFAULT_DYNASTIES = [
        'Ashvale', 'Blackwood', 'Redcliff', 'Oakenshield', 'Ironfist',
        'Goldenthorn', 'Silverstream', 'Winterbourne', 'Summerhall', 'Shadowmere',
        'Brightwater', 'Darkholm', 'Eaglecrest', 'Falconreach', 'Ravenwood'
    ];

    function generateDynastyName(type, options) {
        type = _isMissing(type) ? 'default' : type;
        options = options || {};

        switch (type) {
            case 'location': {
                var location = options.location;
                if (_isMissing(location)) location = 'Greenfield';
                if (typeof location !== 'string' || location.length === 0) return null;
                var suffix = _pickRandom(_LOCATION_SUFFIXES);
                return location + suffix;
            }
            case 'founder': {
                var founder = options.founder;
                if (_isMissing(founder)) founder = 'Unknown';
                if (typeof founder !== 'string' || founder.length === 0) return null;
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

    function formatDynastyName(dynastyName, includeHousePrefix) {
        includeHousePrefix = includeHousePrefix !== false;
        if (!dynastyName) return '';
        if (includeHousePrefix && dynastyName.indexOf('House of ') !== 0) {
            return 'House of ' + dynastyName;
        }
        return dynastyName;
    }

    // =========================================================================
    // 5. CITY / REGION / LANDMARK NAMES
    // =========================================================================

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

    // Probability constants
    var CITY_SUFFIX_CHANCE = 0.4;
    var CITY_PREFIX_CHANCE = 0.7;
    var CITY_EXTRA_SUFFIX_CHANCE = 0.3;
    var REGION_PREFIX_CHANCE = 0.6;
    var REGION_SUFFIX_CHANCE = 0.3;

    /**
     * Capitalizes the first letter, lowercases the rest.
     * @private
     */
    function _capitalizeWord(str) {
        if (!str || typeof str !== 'string') return '';
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }

    function _getCityNameParts() {
        _requireAccessor('getCityNameParts', 'accessors.js');
        return window.getCityNameParts();
    }

    function generateCityName(countryId) {
        var cityParts = _getCityNameParts();

        if (countryId && cityParts && cityParts[countryId]) {
            var parts = cityParts[countryId];
            if (Array.isArray(parts.prefixes) && parts.prefixes.length
                && Array.isArray(parts.roots) && parts.roots.length) {
                var name = _pickRandom(parts.prefixes);
                name += _pickRandom(parts.roots);
                if (Array.isArray(parts.suffixes) && parts.suffixes.length
                    && _randomBoolean(CITY_SUFFIX_CHANCE)) {
                    name += _pickRandom(parts.suffixes);
                }
                return _capitalizeWord(name);
            }
        }

        var fallback = '';
        if (_randomBoolean(CITY_PREFIX_CHANCE)) {
            fallback = _pickRandom(_CITY_PREFIXES) + _pickRandom(_CITY_ROOTS);
        } else {
            fallback = _pickRandom(_CITY_ROOTS);
        }
        if (_randomBoolean(CITY_EXTRA_SUFFIX_CHANCE)) {
            fallback += _pickRandom(_CITY_SUFFIXES);
        }
        return _capitalizeWord(fallback);
    }

    /**
     * Generates a region name.
     * Country-specific regional naming is not yet supported.
     */
    function generateRegionName() {
        var name = '';
        if (_randomBoolean(REGION_PREFIX_CHANCE)) {
            name = _pickRandom(_REGION_PREFIXES) + ' ';
        }
        name += _pickRandom(_REGION_BASES);
        if (_randomBoolean(REGION_SUFFIX_CHANCE)) {
            name += _pickRandom(_REGION_SUFFIXES);
        }
        return name.trim();
    }

    /**
     * Generates a landmark name.
     * Unknown explicit types throw. Null/undefined defaults to 'mountain'.
     * 
     * @param {string} [type]
     * @returns {string}
     * @throws {Error} for unknown landmark types
     */
    function generateLandmarkName(type) {
        if (_isMissing(type)) type = 'mountain';
        if (typeof type !== 'string') {
            throw new Error('generateLandmarkName: type must be a string');
        }

        var bases = _LANDMARK_BASES[type];
        if (!bases) {
            throw new Error('generateLandmarkName: unknown landmark type "' + type + '"');
        }

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

    // =========================================================================
    // 6. TITLE / ORDINAL
    // =========================================================================

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
    var _EPITHET_TYPES = ['positive', 'negative', 'neutral', 'random'];

    /**
     * Formats a rank + ordinal.
     * 
     * Semantics:
     *   - number null/undefined → no ordinal
     *   - number 0 or negative → no ordinal (ordinals start at 1)
     *   - number non-integer → throws
     *   - number >= 1 → formatted (Roman for 1..10, Arabic otherwise)
     * 
     * @param {Object} rank
     * @param {number} [number]
     * @param {boolean} [useRoman]
     * @returns {string}
     */
    function formatTitleName(rank, number, useRoman) {
        useRoman = useRoman !== false;
        if (!rank || typeof rank !== 'object') return '';

        var symbol = (typeof rank.symbol === 'string') ? rank.symbol : '';
        var name = (typeof rank.name === 'string') ? rank.name : '';
        var numberStr = '';

        if (!_isMissing(number)) {
            if (typeof number !== 'number' || !Number.isFinite(number)) {
                throw new Error('formatTitleName: number must be a finite number');
            }
            if (!Number.isInteger(number)) {
                throw new Error('formatTitleName: number must be an integer');
            }
            if (number >= 1) {
                if (useRoman && number <= 10) {
                    numberStr = ' ' + _romanNumeral(number);
                } else {
                    numberStr = ' ' + number;
                }
            }
        }

        return (symbol + ' ' + name + numberStr).trim();
    }

    /**
     * Generates an epithet string.
     * @param {string} [type] - 'positive' | 'negative' | 'neutral' | 'random'
     * @returns {string}
     * @throws {Error} for unknown type
     */
    function generateEpithet(type) {
        if (_isMissing(type)) type = 'random';
        if (typeof type !== 'string') {
            throw new Error('generateEpithet: type must be a string');
        }
        if (_EPITHET_TYPES.indexOf(type) === -1) {
            throw new Error('generateEpithet: unknown epithet type "' + type + '"');
        }

        var resolvedType = type;
        if (resolvedType === 'random') {
            var roll = _random();
            if (roll < 0.33) resolvedType = 'positive';
            else if (roll < 0.66) resolvedType = 'negative';
            else resolvedType = 'neutral';
        }

        switch (resolvedType) {
            case 'positive': return _pickRandom(_EPITHET_POSITIVE);
            case 'negative': return _pickRandom(_EPITHET_NEGATIVE);
            default: return _pickRandom(_EPITHET_NEUTRAL);
        }
    }

    // =========================================================================
    // 7. NAME NORMALIZATION
    // =========================================================================

    /**
     * Normalizes a name for storage/display.
     * 
     * Does NOT capitalize. Preserves casing because "McDonald" and "Mcdonald"
     * are different names, and the computer does not know which is correct.
     * 
     * @param {string} name
     * @returns {string} trimmed, single-spaced
     */
    function normalizeName(name) {
        if (typeof name !== 'string') return '';
        return name.trim().replace(/\s+/g, ' ');
    }

    // =========================================================================
    // 8. REGNAL NAMING
    // =========================================================================

    /**
     * Formats a regnal name with an ordinal.
     * 
     * @param {string} baseName
     * @param {number} [number]
     * @param {boolean} [useRoman]
     * @returns {string}
     * @throws {Error} for non-integer numbers
     */
    function formatRegnalName(baseName, number, useRoman) {
        useRoman = useRoman !== false;
        if (!baseName) return '';

        if (_isMissing(number)) return baseName;

        if (typeof number !== 'number' || !Number.isFinite(number)) {
            throw new Error('formatRegnalName: number must be a finite number');
        }
        if (!Number.isInteger(number)) {
            throw new Error('formatRegnalName: number must be an integer');
        }

        if (number < 2) return baseName;
        if (useRoman && number <= 10) {
            return baseName + ' ' + _romanNumeral(number);
        }
        return baseName + ' ' + number;
    }

    /**
     * Determines the next regnal number for a given name.
     * 
     * Accepts canonical Roman numerals only (rejects "IIV", "IIX", etc.).
     * 
     * @param {string} name
     * @param {string[]} previousRulers - e.g. ["Henry II", "Henry IV"]
     * @returns {number} next number (>= 1)
     */
    function getNextRegnalNumber(name, previousRulers) {
        if (typeof name !== 'string' || name.length === 0) return 1;
        if (!Array.isArray(previousRulers)) return 1;

        var escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var pattern = new RegExp('^' + escaped + '\\s+(\\d+)$|^' + escaped + '\\s+([IVXLCDM]+)$', 'i');

        var highest = 0;
        for (var i = 0; i < previousRulers.length; i++) {
            var ruler = previousRulers[i];
            if (typeof ruler !== 'string') continue;
            var match = ruler.match(pattern);
            if (!match) continue;

            var value = 0;
            if (match[1]) {
                value = parseInt(match[1], 10);
                if (!Number.isFinite(value)) continue;
            } else if (match[2]) {
                value = _parseRoman(match[2]);
                if (value === null) continue;
            }
            if (value > highest) highest = value;
        }
        return highest + 1;
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    // Character names
    window.getRandomNameFromCountry = getRandomNameFromCountry;
    window.getRandomSurnameFromCountry = getRandomSurnameFromCountry;
    window.generateRandomFullName = generateRandomFullName;

    // Character name rules
    window.getCharacterSurnameRules = getCharacterSurnameRules;
    window.getCharacterEpithet = getCharacterEpithet;
    window.getCharacterSurnameSource = getCharacterSurnameSource;

    // Dynasty
    window.generateDynastyName = generateDynastyName;
    window.formatDynastyName = formatDynastyName;

    // City/region/landmark
    window.generateCityName = generateCityName;
    window.generateRegionName = generateRegionName;
    window.generateLandmarkName = generateLandmarkName;

    // Titles
    window.formatTitleName = formatTitleName;
    window.generateEpithet = generateEpithet;

    // Normalization
    window.normalizeName = normalizeName;

    // Regnal
    window.formatRegnalName = formatRegnalName;
    window.getNextRegnalNumber = getNextRegnalNumber;

})();