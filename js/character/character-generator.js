/**
 * =============================================================================
 * STILL WATERS - CHARACTER GENERATOR (js/character/character-generator.js)
 * =============================================================================
 *
 * Random character data generation.
 *
 * Produces a plain `data` object suitable for `CharacterFactory.buildCharacter`.
 * Does NOT construct the character entity itself, does NOT mutate the
 * canonical collection, does NOT persist, does NOT emit events.
 *
 * SCOPE:
 *   - Random gender, age, name, surname, religion, culture, appearance,
 *     and profession selection
 *   - Location and country resolution for cultural context
 *   - Orchestration of the above into a `data` object
 *
 * OUT OF SCOPE:
 *   - Character schema construction → character-factory.js
 *   - Mutation of the canonical collection → CharacterCommands
 *   - Name generation internals → names.js
 *   - Culture/appearance internals → culture-generation.js
 *   - Religion internals → religion-queries.js
 *   - Persistence → storage.js
 *
 * SEMANTIC RULES:
 *   - Missing (undefined/null) options use documented defaults.
 *   - Invalid explicit options are rejected. No silent coercion.
 *   - Year 0 is preserved.
 *   - All randomness flows through randomness.js. No direct Math.random.
 *   - Missing optional dependencies (CultureGeneration, NameQueries,
 *     ReligionQueries) are tolerated only when the feature they provide is
 *     not required for the requested generation. If the feature is
 *     required, its absence returns a structured failure.
 *   - A character without a resolvable country receives an empty surname
 *     (no fallback names). The surname field is explicitly set to ''.
 *   - A character without a resolvable country and without any name data
 *     receives a generated name from names.js's generic pool. If
 *     names.js cannot produce a name, generation fails.
 *
 * DEPENDENCIES (REQUIRED):
 *   - randomness.js: pickRandom, random, randomBoolean, pickWeighted
 *   - time.js:       getCurrentYear, isValidYear
 *   - world.js:      getChildPlaces, getLocationTypeScope
 *   - accessors.js:  getCharacters, getCharacterById, getPlaces, getPlaceById,
 *                    getNameLists, getRoles
 *   - names.js:      getRandomNameFromCountry, getRandomSurnameFromCountry,
 *                    generateRandomFullName
 *
 * DEPENDENCIES (OPTIONAL):
 *   - culture-generation.js (CultureGeneration) — required when a culture
 *     is resolvable and appearance generation is requested
 *   - culture-queries.js    (CultureQueries)    — for location → culture
 *   - religion-queries.js   (ReligionQueries)   — for religion selection
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

    function _requireDependencies() {
        var required = [
            'pickRandom',
            'random',
            'randomBoolean',
            'getCurrentYear',
            'isValidYear',
            'getCharacterById',
            'getCharacters',
            'getPlaces',
            'getPlaceById',
            'getNameLists',
            'getRoles',
            'getRandomNameFromCountry',
            'getRandomSurnameFromCountry'
        ];
        var missing = [];
        for (var i = 0; i < required.length; i++) {
            if (typeof window[required[i]] === 'undefined') {
                missing.push(required[i]);
            }
        }
        if (missing.length > 0) {
            throw new Error(
                'character-generator.js: missing required dependencies: ' +
                missing.join(', ')
            );
        }
    }

    _requireDependencies();

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    // Age distribution policy. These are simulation parameters, not
    // generic randomness. Adjust here if the demographic shape changes.
    var AGE_BANDS = [
        { max: 5,  weight: 10 },   // 0-5:   10%
        { max: 17, weight: 15 },   // 6-17:  15%
        { max: 35, weight: 30 },   // 18-35: 30%
        { max: 55, weight: 25 },   // 36-55: 25%
        { max: 75, weight: 15 },   // 56-75: 15%
        { max: 90, weight: 5 }     // 76-90: 5%
    ];

    var MIN_PROFESSION_AGE = 14;
    var MIN_PROFESSION_SKILL = 20;
    var MAX_PROFESSION_SKILL = 79;
    var DEFAULT_ATTRACTION = 'both';

    var VALID_GENDERS = ['male', 'female'];

    // =========================================================================
    // 2. INTERNAL HELPERS
    // =========================================================================

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    /**
     * Validates an optional string option.
     */
    function _validateOptionalString(value, name) {
        if (_isMissing(value)) return { ok: true, value: null };
        if (typeof value !== 'string') {
            return { ok: false, reason: name + ' must be a string when provided' };
        }
        return { ok: true, value: value };
    }

    /**
     * Validates an optional positive integer option (like `age`).
     */
    function _validateOptionalAge(value) {
        if (_isMissing(value)) return { ok: true, value: null };
        if (typeof value !== 'number' || !Number.isFinite(value)
            || !Number.isInteger(value) || value < 0) {
            return { ok: false, reason: 'age must be a non-negative integer when provided' };
        }
        return { ok: true, value: value };
    }

    /**
     * Validates an optional gender option.
     */
    function _validateOptionalGender(value) {
        if (_isMissing(value)) return { ok: true, value: null };
        if (typeof value !== 'string') {
            return { ok: false, reason: 'gender must be a string when provided' };
        }
        if (VALID_GENDERS.indexOf(value) === -1) {
            return { ok: false, reason: 'gender must be one of: ' + VALID_GENDERS.join(', ') };
        }
        return { ok: true, value: value };
    }

    // =========================================================================
    // 3. RANDOM PRIMITIVES (delegating to randomness.js)
    // =========================================================================

    function _pickRandom(arr) {
        return window.pickRandom(arr);
    }

    function _random() {
        return window.random();
    }

    function _randomBoolean(bias) {
        return window.randomBoolean(bias);
    }

    function _randomInt(min, max) {
        // We do not require randomInt specifically (it's in randomness.js),
        // but if it's available, use it; otherwise compute from random().
        if (typeof window.randomInt === 'function') {
            return window.randomInt(min, max);
        }
        return Math.floor(window.random() * (max - min + 1)) + min;
    }

    // =========================================================================
    // 4. LOCATION RESOLUTION
    // =========================================================================

    /**
     * Resolves the country of a location by walking the parent hierarchy
     * and matching on locationScope === 'country'.
     *
     * Returns the country place object or null.
     */
    function _getCountryFromLocation(locationId) {
        if (!_hasId(locationId)) return null;

        var place = window.getPlaceById(locationId);
        if (!place) return null;

        var current = place;
        var visited = new Set();

        while (current) {
            if (!_hasId(current.id)) break;
            if (visited.has(current.id)) break;
            visited.add(current.id);

            if (typeof window.getPlaceScope === 'function') {
                if (window.getPlaceScope(current) === 'country') return current;
            } else if (typeof window.getLocationTypeScope === 'function') {
                if (window.getLocationTypeScope(current.typeId) === 'country') return current;
            }

            if (!_hasId(current.parentId)) break;
            current = window.getPlaceById(current.parentId);
        }

        return null;
    }

    /**
     * Returns places with a non-empty variableKey, prioritized by whether
     * they have name data associated.
     *
     * Uses randomness.js for selection.
     */
    function _getRandomLocationWithVariableKey() {
        var places = window.getPlaces();
        var placesWithKey = [];
        for (var i = 0; i < places.length; i++) {
            var p = places[i];
            if (_hasId(p.variableKey)) placesWithKey.push(p);
        }

        if (placesWithKey.length === 0) {
            // Fall back to any named place.
            var namedPlaces = [];
            for (var j = 0; j < places.length; j++) {
                var np = places[j];
                if (typeof np.displayName === 'string' && np.displayName.length > 0) {
                    namedPlaces.push(np);
                }
            }
            if (namedPlaces.length === 0) return null;
            return _pickRandom(namedPlaces);
        }

        // Prefer places with name lists.
        var nameLists = window.getNameLists();
        var preferred = [];
        for (var k = 0; k < placesWithKey.length; k++) {
            var pk = placesWithKey[k];
            var list = nameLists[pk.id];
            if (list && (Array.isArray(list.male) && list.male.length
                      || Array.isArray(list.female) && list.female.length)) {
                preferred.push(pk);
            }
        }

        if (preferred.length > 0) return _pickRandom(preferred);
        return _pickRandom(placesWithKey);
    }

    /**
     * Returns a random place whose ID is a key in nameLists and whose
     * nameLists entry has male or female names. Falls back to any place
     * with locationScope === 'country'. Falls back to null.
     */
    function _getRandomCountryWithNameData() {
        var nameLists = window.getNameLists();
        var countryIds = Object.keys(nameLists).filter(function(id) {
            var list = nameLists[id];
            if (!list) return false;
            var hasMale = Array.isArray(list.male) && list.male.length > 0;
            var hasFemale = Array.isArray(list.female) && list.female.length > 0;
            return hasMale || hasFemale;
        });

        if (countryIds.length > 0) {
            var chosenId = _pickRandom(countryIds);
            return window.getPlaceById(chosenId);
        }

        // Fall back to any country-scoped place.
        var places = window.getPlaces();
        var countries = [];
        for (var i = 0; i < places.length; i++) {
            var scope = null;
            if (typeof window.getPlaceScope === 'function') {
                scope = window.getPlaceScope(places[i]);
            } else if (typeof window.getLocationTypeScope === 'function') {
                scope = window.getLocationTypeScope(places[i].typeId);
            }
            if (scope === 'country') countries.push(places[i]);
        }

        if (countries.length > 0) return _pickRandom(countries);
        return null;
    }

    // =========================================================================
    // 5. AGE GENERATION
    // =========================================================================

    /**
     * Selects an age using the configured band distribution.
     */
    function _generateAge() {
        var total = 0;
        for (var i = 0; i < AGE_BANDS.length; i++) total += AGE_BANDS[i].weight;

        var roll = _random() * total;
        var accumulated = 0;
        var lowerBound = 0;
        var upperBound = AGE_BANDS[AGE_BANDS.length - 1].max;

        for (var j = 0; j < AGE_BANDS.length; j++) {
            var band = AGE_BANDS[j];
            accumulated += band.weight;
            if (roll <= accumulated) {
                upperBound = band.max;
                break;
            }
            lowerBound = band.max;
        }

        // Uniform within the band.
        return _randomInt(lowerBound, upperBound);
    }

    // =========================================================================
    // 6. NAME AND SURNAME
    // =========================================================================

    /**
     * Generates a given name. Tries the cultural name pool first, then the
     * generic pool from names.js. Returns null if neither yields a name.
     */
    function _generateGivenName(countryId, gender) {
        if (_hasId(countryId)) {
            var culturalName = window.getRandomNameFromCountry(countryId, gender);
            if (typeof culturalName === 'string' && culturalName.length > 0) {
                return culturalName;
            }
        }

        // Generic pool: names.js uses the same function with a null country
        // only when the module supports it. If not, we generate via names.js
        // with a null country and accept whatever comes back.
        var generic = window.getRandomNameFromCountry(null, gender);
        if (typeof generic === 'string' && generic.length > 0) {
            return generic;
        }

        return null;
    }

    /**
     * Generates a surname. NO FALLBACK.
     *
     * If the country has surname rules, apply them (delegated to names.js
     * via NameQueries if available). Otherwise, ask names.js for a
     * cultural surname. Otherwise, return ''.
     */
    function _generateSurname(countryId, gender) {
        if (!_hasId(countryId)) return '';

        // Prefer surname rules if the name system exposes them.
        if (typeof window.NameQueries !== 'undefined'
            && typeof window.NameQueries.getCountrySurnameRules === 'function'
            && typeof window.NameQueries.generateSurnameFromRules === 'function') {
            var rules = window.NameQueries.getCountrySurnameRules(countryId);
            if (rules && rules.type) {
                var ruleSurname = window.NameQueries.generateSurnameFromRules(null, null, gender, rules);
                if (typeof ruleSurname === 'string' && ruleSurname.length > 0) {
                    return ruleSurname;
                }
            }
        }

        // Cultural surname pool.
        var cultural = window.getRandomSurnameFromCountry(countryId);
        if (typeof cultural === 'string' && cultural.length > 0) {
            // Defensive: reject literal placeholder strings that might come
            // from malformed name lists.
            if (cultural === 'Unknown' || cultural === 'Unnamed') return '';
            return cultural;
        }

        return '';
    }

    /**
     * Determines the surnameSource tag based on the surname and country.
     */
    function _surnameSourceFor(surname, countryId) {
        if (!surname) return 'none';
        if (_hasId(countryId)) return 'cultural';
        return 'custom';
    }

    // =========================================================================
    // 7. RELIGION SELECTION
    // =========================================================================

    /**
     * Selects a religion at the given location, weighted by follower count.
     * Returns a religion ID or null.
     *
     * Religion selection is optional. If ReligionQueries is unavailable,
     * generation continues without a religion.
     */
    function _selectReligion(locationId) {
        if (!_hasId(locationId)) return null;
        if (typeof window.ReligionQueries === 'undefined') return null;

        if (typeof window.ReligionQueries.getReligionsByLocation !== 'function') return null;

        var religions = window.ReligionQueries.getReligionsByLocation(locationId);
        if (!Array.isArray(religions) || religions.length === 0) return null;

        // Weight by follower count, minimum 1.
        var weighted = [];
        for (var i = 0; i < religions.length; i++) {
            var religion = religions[i];
            if (!religion || !_hasId(religion.id)) continue;

            var count = 0;
            if (typeof window.ReligionQueries.getFollowerCount === 'function') {
                var result = window.ReligionQueries.getFollowerCount(religion.id);
                if (typeof result === 'number' && Number.isFinite(result) && result >= 0) {
                    count = result;
                }
            }
            weighted.push({
                id: religion.id,
                weight: Math.max(1, count)
            });
        }

        if (weighted.length === 0) return null;

        // Use randomness.js weighted selection.
        if (typeof window.pickWeighted === 'function') {
            var chosen = window.pickWeighted(weighted, function(item) { return item.weight; });
            return chosen ? chosen.id : null;
        }

        // Fallback for environments without pickWeighted: manual weighted roll.
        var totalWeight = 0;
        for (var j = 0; j < weighted.length; j++) totalWeight += weighted[j].weight;
        if (totalWeight === 0) return null;

        var roll = _random() * totalWeight;
        var accumulated = 0;
        for (var k = 0; k < weighted.length; k++) {
            accumulated += weighted[k].weight;
            if (roll <= accumulated) return weighted[k].id;
        }
        return weighted[weighted.length - 1].id;
    }

    // =========================================================================
    // 8. CULTURE AND APPEARANCE
    // =========================================================================

    function _resolveCultureForLocation(locationId) {
        if (!_hasId(locationId)) return null;
        if (typeof window.CultureQueries === 'undefined') return null;
        if (typeof window.CultureQueries.getCultureByLocation !== 'function') return null;

        var culture = window.CultureQueries.getCultureByLocation(locationId);
        if (!culture || !_hasId(culture.id)) return null;
        return culture.id;
    }

    /**
     * Generates an appearance for the character based on culture.
     * Delegates entirely to culture-generation.js.
     *
     * If cultureId is missing, asks CultureGeneration for a generic
     * appearance. If CultureGeneration is unavailable, returns an empty
     * appearance object — the character will simply have no appearance
     * data, which is legitimate.
     */
    function _generateAppearance(cultureId, gender) {
        if (typeof window.CultureGeneration === 'undefined') return {};
        if (typeof window.CultureGeneration.generateAppearance !== 'function') return {};

        var appearance = window.CultureGeneration.generateAppearance(cultureId, gender);
        if (!appearance || typeof appearance !== 'object' || Array.isArray(appearance)) {
            return {};
        }
        return appearance;
    }

    // =========================================================================
    // 9. PROFESSION SELECTION
    // =========================================================================

    /**
     * Selects a profession for the character based on their age and gender.
     * Returns a profession record or null.
     *
     * Professions are optional. If no eligible roles exist, returns null.
     */
    function _selectProfession(age, gender) {
        if (age < MIN_PROFESSION_AGE) return null;

        var roles = window.getRoles();
        if (!Array.isArray(roles) || roles.length === 0) return null;

        var eligible = [];
        for (var i = 0; i < roles.length; i++) {
            var role = roles[i];
            if (!role || !_hasId(role.id)) continue;

            var restriction = role.genderRestriction;
            if (_isMissing(restriction) || restriction === 'both') {
                eligible.push(role);
                continue;
            }
            if (restriction === gender) {
                eligible.push(role);
            }
        }

        if (eligible.length === 0) return null;

        var role = _pickRandom(eligible);
        if (!role) return null;

        var skillLevel = _randomInt(MIN_PROFESSION_SKILL, MAX_PROFESSION_SKILL);

        return {
            id: role.id,
            primary: true,
            specs: [],
            skillLevel: skillLevel,
            startYear: window.getCurrentYear(),
            notes: ''
        };
    }

    // =========================================================================
    // 10. PUBLIC ENTRY POINT
    // =========================================================================

    /**
     * Generates random character data suitable for buildCharacter().
     *
     * @param {Object} [options]
     * @param {string} [options.gender] - 'male' | 'female'. Random when omitted.
     * @param {number} [options.age] - specific age. Random when omitted.
     * @param {string} [options.countryId] - specific country place ID.
     * @param {string} [options.religionId] - specific religion ID.
     * @param {boolean} [options.assignProfession] - default true
     *
     * @returns {{ success: boolean, data?: Object, reason?: string }}
     */
    function generateRandomCharacterData(options) {
        if (_isMissing(options)) options = {};
        if (typeof options !== 'object' || Array.isArray(options)) {
            return { success: false, reason: 'options must be an object' };
        }

        var genderResult = _validateOptionalGender(options.gender);
        if (!genderResult.ok) return { success: false, reason: genderResult.reason };

        var ageResult = _validateOptionalAge(options.age);
        if (!ageResult.ok) return { success: false, reason: ageResult.reason };

        var countryIdResult = _validateOptionalString(options.countryId, 'countryId');
        if (!countryIdResult.ok) return { success: false, reason: countryIdResult.reason };

        var religionIdResult = _validateOptionalString(options.religionId, 'religionId');
        if (!religionIdResult.ok) return { success: false, reason: religionIdResult.reason };

        var currentYear = window.getCurrentYear();

        // 1. Gender
        var gender = genderResult.value;
        if (gender === null) {
            gender = _randomBoolean(0.5) ? 'male' : 'female';
        }

        // 2. Age and birth year
        var age = ageResult.value;
        if (age === null) {
            age = _generateAge();
        }
        var birthYear = currentYear - age;

        // 3. Birthplace
        var birthplaceId = null;
        if (_hasId(countryIdResult.value)) {
            var specified = window.getPlaceById(countryIdResult.value);
            if (!specified) {
                return { success: false, reason: 'Specified countryId does not resolve to a place' };
            }
            birthplaceId = specified.id;
        } else {
            var birthplace = _getRandomLocationWithVariableKey();
            if (birthplace) birthplaceId = birthplace.id;
        }

        // 4. Country resolution for cultural context
        var country = null;
        var countryId = null;
        if (_hasId(birthplaceId)) {
            country = _getCountryFromLocation(birthplaceId);
            if (country) countryId = country.id;
        }
        if (!countryId) {
            var randomCountry = _getRandomCountryWithNameData();
            if (randomCountry) {
                country = randomCountry;
                countryId = randomCountry.id;
            }
        }

        // 5. Name
        var name = _generateGivenName(countryId, gender);
        if (!name) {
            return {
                success: false,
                reason: 'No name could be generated (names.js has no generatable name pool)'
            };
        }

        // 6. Surname (no fallback — empty string when unavailable)
        var surname = _generateSurname(countryId, gender);
        var surnameSource = _surnameSourceFor(surname, countryId);

        // 7. Religion
        var religionId = null;
        if (_hasId(religionIdResult.value)) {
            religionId = religionIdResult.value;
        } else {
            religionId = _selectReligion(birthplaceId);
        }

        // 8. Culture and appearance
        var cultureId = _resolveCultureForLocation(birthplaceId);
        var appearance = _generateAppearance(cultureId, gender);

        // 9. Profession
        var professions = [];
        if (options.assignProfession !== false) {
            var profession = _selectProfession(age, gender);
            if (profession) professions.push(profession);
        }

        // 10. Assemble data for the factory
        var data = {
            name: name,
            surname: surname,
            surnameSource: surnameSource,
            gender: gender,
            attraction: DEFAULT_ATTRACTION,
            birthYear: birthYear,
            isDeceased: false,
            isLegitimate: true,

            birthplaceId: birthplaceId,
            currentLocationId: birthplaceId,
            moves: [],

            relationships: [],
            friends: [],
            friendshipDetails: {},

            household: null,
            householdHistory: [],

            rankAssignments: [],
            activeRankId: null,
            activeRankNumber: null,
            professions: professions,

            motherId: null,
            fatherId: null,
            children: [],
            adoptedParents: [],
            adoptedChildren: [],

            apprentices: [],
            masterId: null,
            isMaster: false,
            masterProfessionId: null,
            apprenticeshipDetails: {},

            epithet: '',
            notes: 'Randomly generated character',
            appearance: appearance,

            religionId: religionId,
            religionHistory: [],

            cultureId: cultureId,

            surnameHistory: {
                birthSurname: surname,
                entries: [],
                lastUpdated: birthYear
            }
        };

        return { success: true, data: data };
    }

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.generateRandomCharacterData = generateRandomCharacterData;

})();