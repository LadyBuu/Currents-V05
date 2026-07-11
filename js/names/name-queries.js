/**
 * =============================================================================
 * NAME QUERIES - All read operations for names
 * =============================================================================
 * 
 * Responsibilities:
 * - Generate random names/surnames by country
 * - Generate names with rules (family, patronymic, chain)
 * - Get ancestor chains
 * - Get surname history
 * - No side effects, no mutations
 * - Uses caching for performance
 * 
 * DEPENDENCIES:
 *   - name-state.js (NameState)
 *   - accessors.js (getCharacterById, getPlaceById, getPlaces)
 *   - icons.js (Icons for SVG icons only, no emojis)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _processingQuery = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getPlaces() {
        return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') return window.getCurrentYearSafe();
        if (typeof window.getCurrentYear === 'function') return window.getCurrentYear();
        return 1250;
    }

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    // =========================================================================
    // 3. HELPER FUNCTIONS
    // =========================================================================

    function _capitalizeFirstLetter(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    }

    function _getBaseNameForPatronymic(character) {
        if (!character) return '';
        var name = character.name || '';
        // Remove epithets and suffixes
        name = name.replace(/\s+the\s+\w+$/, '');
        name = name.replace(/\s+of\s+\w+$/, '');
        return name.trim();
    }

    function _getCharacterGender(character) {
        if (!character) return 'neutral';
        if (character.gender === 'male') return 'male';
        if (character.gender === 'female') return 'female';
        return 'neutral';
    }

    function _splitSurname(surname) {
        if (!surname) return [];
        return surname.split(/\s+/);
    }

    function _getSurnamePart(surname, position) {
        if (!surname) return '';
        var parts = _splitSurname(surname);
        if (parts.length === 0) return '';
        if (position === 'last') {
            return parts[parts.length - 1];
        }
        return parts[0];
    }

    function _getConnector(connectorType, customConnector) {
        if (connectorType === 'custom') {
            return customConnector || '-';
        } else if (connectorType === 'hyphen') {
            return '-';
        } else if (connectorType === 'space') {
            return ' ';
        } else if (connectorType === 'none') {
            return '';
        }
        return ' ';
    }

    // =========================================================================
    // 4. GET RANDOM NAME
    // =========================================================================

    function getRandomName(countryId, gender) {
        // RECURSION GUARD
        if (_processingQuery) {
            console.warn('Name query already processing, skipping');
            return null;
        }
        _processingQuery = true;

        try {
            if (!countryId) {
                // Pick first available country
                var nameLists = NameState.getNameLists();
                var countries = Object.keys(nameLists);
                if (countries.length === 0) return null;
                countryId = countries[0];
            }

            var nameList = NameState.getNameList(countryId);
            if (!nameList) return null;

            // Check cache
            var cacheKey = countryId + '_' + (gender || 'all');
            var cached = NameState._getCache('randomNames', cacheKey);
            if (cached) return cached;

            var names = [];
            if (gender === 'male') {
                names = nameList.male || [];
            } else if (gender === 'female') {
                names = nameList.female || [];
            } else {
                names = [].concat(nameList.male || [], nameList.female || []);
            }

            if (!names || names.length === 0) {
                // Try parent country
                var place = _getPlaceById(countryId);
                if (place && place.parentId) {
                    var result = getRandomName(place.parentId, gender);
                    if (result) {
                        NameState._setCache('randomNames', cacheKey, result);
                        return result;
                    }
                }
                return null;
            }

            var result = names[Math.floor(Math.random() * names.length)];
            NameState._setCache('randomNames', cacheKey, result);
            return result;

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 5. GET RANDOM SURNAME
    // =========================================================================

    function getRandomSurname(countryId) {
        // RECURSION GUARD
        if (_processingQuery) {
            console.warn('Name query already processing, skipping');
            return '';
        }
        _processingQuery = true;

        try {
            if (!countryId) {
                var nameLists = NameState.getNameLists();
                var countries = Object.keys(nameLists);
                if (countries.length === 0) return '';
                countryId = countries[0];
            }

            var nameList = NameState.getNameList(countryId);
            if (!nameList) return '';

            // Check cache
            var cacheKey = countryId + '_surname';
            var cached = NameState._getCache('randomSurnames', cacheKey);
            if (cached) return cached;

            var surnames = nameList.surnames || [];

            if (surnames.length === 0) {
                // Try parent country
                var place = _getPlaceById(countryId);
                if (place && place.parentId) {
                    var result = getRandomSurname(place.parentId);
                    if (result) {
                        NameState._setCache('randomSurnames', cacheKey, result);
                        return result;
                    }
                }
                return '';
            }

            var result = surnames[Math.floor(Math.random() * surnames.length)];
            NameState._setCache('randomSurnames', cacheKey, result);
            return result;

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 6. GENERATE FAMILY SURNAME
    // =========================================================================

    function generateFamilySurname(father, mother, rules) {
        // RECURSION GUARD
        if (_processingQuery) {
            console.warn('Name query already processing, skipping');
            return '';
        }
        _processingQuery = true;

        try {
            if (!father && !mother) return '';

            rules = rules || {};
            var source = rules.source || 'both';
            var order = rules.order || 'father_first';
            var count = rules.count || 1;
            var position = rules.position || 'first';

            var fatherPart = father ? _getSurnamePart(father.surname, position) : '';
            var motherPart = mother ? _getSurnamePart(mother.surname, position) : '';

            var parts = [];

            if (source === 'father') {
                if (fatherPart) parts.push(fatherPart);
            } else if (source === 'mother') {
                if (motherPart) parts.push(motherPart);
            } else { // both
                if (order === 'father_first') {
                    if (fatherPart) parts.push(fatherPart);
                    if (motherPart) parts.push(motherPart);
                } else {
                    if (motherPart) parts.push(motherPart);
                    if (fatherPart) parts.push(fatherPart);
                }
            }

            // Apply count (1 or 2)
            if (parts.length > count) {
                parts = parts.slice(0, count);
            }

            if (parts.length === 0) return '';

            var connector = _getConnector(rules.connector, rules.customConnector);
            var result = parts.join(connector);

            return _capitalizeFirstLetter(result);

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 7. GENERATE PATRONYMIC SURNAME
    // =========================================================================

    function generatePatronymicSurname(parent, childGender, rules) {
        // RECURSION GUARD
        if (_processingQuery) {
            console.warn('Name query already processing, skipping');
            return '';
        }
        _processingQuery = true;

        try {
            if (!parent) return '';

            rules = rules || {};
            var baseName = _getBaseNameForPatronymic(parent);
            if (!baseName) return '';

            var prefix = '';
            var suffix = '';

            if (childGender === 'male') {
                if (rules.usePrefix !== false && rules.malePrefix) prefix = rules.malePrefix;
                if (rules.useSuffix !== false && rules.maleSuffix) suffix = rules.maleSuffix;
            } else if (childGender === 'female') {
                if (rules.usePrefix !== false && rules.femalePrefix) prefix = rules.femalePrefix;
                if (rules.useSuffix !== false && rules.femaleSuffix) suffix = rules.femaleSuffix;
            } else {
                // Default to male form
                if (rules.usePrefix !== false && rules.malePrefix) prefix = rules.malePrefix;
                if (rules.useSuffix !== false && rules.maleSuffix) suffix = rules.maleSuffix;
            }

            var result = '';
            if (prefix && suffix) {
                result = prefix + baseName + suffix;
            } else if (prefix) {
                result = prefix + baseName;
            } else if (suffix) {
                result = baseName + suffix;
            } else {
                result = baseName;
            }

            return _capitalizeFirstLetter(result);

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 8. GENERATE CHAIN SURNAME
    // =========================================================================

    function generateChainSurname(character, rules) {
        // RECURSION GUARD
        if (_processingQuery) {
            console.warn('Name query already processing, skipping');
            return '';
        }
        _processingQuery = true;

        try {
            if (!character) return '';

            rules = rules || {};
            var order = rules.order || ['father', 'mother'];
            var depth = rules.depth || 1;
            var source = rules.source || 'firstname';

            var names = _getAncestorNames(character, order, depth, source);
            if (names.length === 0) return '';

            var connector = _getConnector(rules.connector, rules.customConnector);
            var result = names.join(connector);

            return _capitalizeFirstLetter(result);

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 9. GET ANCESTOR NAMES
    // =========================================================================

    function _getAncestorNames(character, order, depth, source) {
        if (!character || !order || order.length === 0) return [];

        var results = [];
        var visited = new Set();

        for (var i = 0; i < Math.min(order.length, depth * 2); i++) {
            var type = order[i % order.length];
            var ancestor = _getAncestorData(character, type);

            if (ancestor && !visited.has(ancestor.id)) {
                visited.add(ancestor.id);
                var name = source === 'firstname' ? ancestor.firstName : ancestor.surname;
                if (name) results.push(name);
            }

            // If we've reached max depth, stop
            if (results.length >= depth) break;
        }

        return results;
    }

    function _getAncestorData(character, type) {
        if (!character) return null;

        switch (type) {
            case 'father':
                if (character.fatherId) {
                    var father = _getCharacterById(character.fatherId);
                    if (father) {
                        return {
                            id: father.id,
                            firstName: _getBaseNameForPatronymic(father),
                            surname: father.surname || ''
                        };
                    }
                }
                return null;

            case 'mother':
                if (character.motherId) {
                    var mother = _getCharacterById(character.motherId);
                    if (mother) {
                        return {
                            id: mother.id,
                            firstName: _getBaseNameForPatronymic(mother),
                            surname: mother.surname || ''
                        };
                    }
                }
                return null;

            case 'paternal_grandfather':
                if (character.fatherId) {
                    var father = _getCharacterById(character.fatherId);
                    if (father && father.fatherId) {
                        var gf = _getCharacterById(father.fatherId);
                        if (gf) {
                            return {
                                id: gf.id,
                                firstName: _getBaseNameForPatronymic(gf),
                                surname: gf.surname || ''
                            };
                        }
                    }
                }
                return null;

            case 'paternal_grandmother':
                if (character.fatherId) {
                    var father = _getCharacterById(character.fatherId);
                    if (father && father.motherId) {
                        var gm = _getCharacterById(father.motherId);
                        if (gm) {
                            return {
                                id: gm.id,
                                firstName: _getBaseNameForPatronymic(gm),
                                surname: gm.surname || ''
                            };
                        }
                    }
                }
                return null;

            case 'maternal_grandfather':
                if (character.motherId) {
                    var mother = _getCharacterById(character.motherId);
                    if (mother && mother.fatherId) {
                        var gf = _getCharacterById(mother.fatherId);
                        if (gf) {
                            return {
                                id: gf.id,
                                firstName: _getBaseNameForPatronymic(gf),
                                surname: gf.surname || ''
                            };
                        }
                    }
                }
                return null;

            case 'maternal_grandmother':
                if (character.motherId) {
                    var mother = _getCharacterById(character.motherId);
                    if (mother && mother.motherId) {
                        var gm = _getCharacterById(mother.motherId);
                        if (gm) {
                            return {
                                id: gm.id,
                                firstName: _getBaseNameForPatronymic(gm),
                                surname: gm.surname || ''
                            };
                        }
                    }
                }
                return null;

            default:
                return null;
        }
    }

    // =========================================================================
    // 10. GET SURNAME HISTORY QUERIES
    // =========================================================================

    function getSurnameHistory(characterId) {
        return NameState.getSurnameHistory(characterId);
    }

    function getBirthSurname(characterId) {
        var history = NameState.getSurnameHistory(characterId);
        return history ? history.birthSurname : '';
    }

    function getCurrentSurname(characterId) {
        var character = _getCharacterById(characterId);
        return character ? character.surname : '';
    }

    function getSurnameChanges(characterId) {
        var history = NameState.getSurnameHistory(characterId);
        return history ? history.entries : [];
    }

    function getSurnameChangeCount(characterId) {
        var changes = getSurnameChanges(characterId);
        return changes.length;
    }

    // =========================================================================
    // 11. COUNTRY RULES QUERIES
    // =========================================================================

    function getCountrySurnameRules(countryId) {
        if (!countryId) return null;
        var nameList = NameState.getNameList(countryId);
        return nameList ? nameList.rules : null;
    }

    function getCharacterCountryId(character) {
        if (!character) return null;

        // Get current location
        var locationId = null;
        if (character.currentLocationId) {
            locationId = character.currentLocationId;
        } else if (character.currentLocation) {
            var place = _getPlaceById(character.currentLocation);
            if (place) locationId = place.id;
        } else if (character.birthplaceId) {
            locationId = character.birthplaceId;
        }

        if (!locationId) return null;

        // Walk up to find country (type priority 1)
        var current = _getPlaceById(locationId);
        var visited = new Set();

        while (current && !visited.has(current.id)) {
            visited.add(current.id);
            var type = typeof window.getLocationTypeById === 'function' ?
                window.getLocationTypeById(current.typeId) : null;
            if (type && type.priority === 1) {
                return current.id;
            }
            if (!current.parentId) break;
            current = _getPlaceById(current.parentId);
        }

        return null;
    }

    // =========================================================================
    // 12. DETERMINE NEWBORN SURNAME
    // =========================================================================

    function determineNewbornSurname(mother, father, countryId) {
        // RECURSION GUARD
        if (_processingQuery) {
            console.warn('Name query already processing, skipping');
            return null;
        }
        _processingQuery = true;

        try {
            // Priority 1: Mother's current location rules
            if (mother) {
                var motherCountryId = getCharacterCountryId(mother);
                if (motherCountryId) {
                    var rules = getCountrySurnameRules(motherCountryId);
                    if (rules && rules.type) {
                        var generated = generateSurnameFromRules(mother, father, 'unknown', rules);
                        if (generated) {
                            return {
                                surname: generated,
                                surnameSource: 'country_rules',
                                surnameRules: rules,
                                countryId: motherCountryId
                            };
                        }
                    }
                }
            }

            // Priority 2: Father's current location rules
            if (father) {
                var fatherCountryId = getCharacterCountryId(father);
                if (fatherCountryId) {
                    var rules = getCountrySurnameRules(fatherCountryId);
                    if (rules && rules.type) {
                        var generated = generateSurnameFromRules(mother, father, 'unknown', rules);
                        if (generated) {
                            return {
                                surname: generated,
                                surnameSource: 'country_rules',
                                surnameRules: rules,
                                countryId: fatherCountryId
                            };
                        }
                    }
                }
            }

            // Priority 3: Cultural surname from country
            if (countryId) {
                var randomSurname = getRandomSurname(countryId);
                if (randomSurname && randomSurname !== '' && randomSurname !== 'Unknown') {
                    return {
                        surname: randomSurname,
                        surnameSource: 'country',
                        surnameRules: null,
                        countryId: countryId
                    };
                }
            }

            // Priority 4: Father's surname
            if (father && father.surname && father.surname !== '' && father.surname !== 'Unknown') {
                return {
                    surname: father.surname,
                    surnameSource: father.surnameSource || 'country',
                    surnameRules: null,
                    countryId: countryId
                };
            }

            // Priority 5: Mother's surname
            if (mother && mother.surname && mother.surname !== '' && mother.surname !== 'Unknown') {
                return {
                    surname: mother.surname,
                    surnameSource: mother.surnameSource || 'country',
                    surnameRules: null,
                    countryId: countryId
                };
            }

            return null;

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 13. UNIFIED SURNAME GENERATION
    // =========================================================================

    function generateSurnameFromRules(mother, father, childGender, rules) {
        if (!rules || !rules.type) return '';

        switch (rules.type) {
            case 'family':
                return generateFamilySurname(father, mother, rules.family);

            case 'patronymic':
                var parent = rules.patronymic.source === 'father' ? father : mother;
                return generatePatronymicSurname(parent, childGender, rules.patronymic);

            case 'chain':
                // Build a temporary character for chain generation
                var childChar = {
                    fatherId: father ? father.id : null,
                    motherId: mother ? mother.id : null,
                    name: 'Child'
                };
                return generateChainSurname(childChar, rules.chain);

            default:
                return '';
        }
    }

    // =========================================================================
    // 14. EXPORTS
    // =========================================================================

    window.NameQueries = {
        // Core generation
        getRandomName: getRandomName,
        getRandomSurname: getRandomSurname,
        generateFamilySurname: generateFamilySurname,
        generatePatronymicSurname: generatePatronymicSurname,
        generateChainSurname: generateChainSurname,
        generateSurnameFromRules: generateSurnameFromRules,

        // Ancestor queries
        getAncestorData: _getAncestorData,

        // Surname history
        getSurnameHistory: getSurnameHistory,
        getBirthSurname: getBirthSurname,
        getCurrentSurname: getCurrentSurname,
        getSurnameChanges: getSurnameChanges,
        getSurnameChangeCount: getSurnameChangeCount,

        // Country rules
        getCountrySurnameRules: getCountrySurnameRules,
        getCharacterCountryId: getCharacterCountryId,
        determineNewbornSurname: determineNewbornSurname,

        // Helpers (exposed for other modules)
        _capitalizeFirstLetter: _capitalizeFirstLetter,
        _getBaseNameForPatronymic: _getBaseNameForPatronymic,
        _getCharacterGender: _getCharacterGender,
        _splitSurname: _splitSurname,
        _getSurnamePart: _getSurnamePart,
        _getConnector: _getConnector
    };

  
})();