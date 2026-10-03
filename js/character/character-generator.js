/**
 * =============================================================================
 * STILL WATERS - CHARACTER GENERATOR (js/character/character-generator.js)
 * =============================================================================
 *
 * Random character data generation.
 *
 * Produces a plain `data` object suitable for `buildCharacter(data, options)`.
 * Does NOT construct the character entity. Does NOT mutate the canonical
 * collection. Does NOT persist. Does NOT emit events.
 *
 * SCOPE:
 *   - Random gender, age, name, surname selection
 *   - Random birthplace selection
 *   - Country resolution for cultural context
 *   - Religion selection weighted by location follower count (if available)
 *   - Culture resolution for appearance generation (if available)
 *   - Appearance generation (if available)
 *   - Profession selection (if roles and age permit)
 *   - Assembly of a plain `data` object for the factory
 *
 * OUT OF SCOPE:
 *   - Character schema construction → character-factory.js
 *   - Collection mutation → character-creation-commands.js
 *   - Name generation internals → names.js
 *   - Culture/appearance internals → culture-generation.js
 *   - Religion internals → religion-queries.js
 *   - Family / relationship / apprenticeship establishment → their commands
 *   - Persistence → storage.js
 *
 * SEMANTIC RULES:
 *   - Missing (undefined/null) options use documented defaults.
 *   - Invalid explicit options are REJECTED. No silent coercion.
 *   - Year 0 is preserved.
 *   - All randomness flows through randomness.js. No direct Math.random.
 *   - "generate character" means: produce a person who EXISTS at the current
 *     simulation year. Not a newborn. Not a womb-to-grave simulation.
 *     Profession startYear is chosen within [birthYear + MIN_PROFESSION_AGE,
 *     currentYear] so a 60-year-old blacksmith is not "just starting".
 *   - Missing optional dependencies are treated as a feature being
 *     unavailable. The generated field is left absent (never fabricated).
 *     Callers who need religion or appearance must ensure those modules
 *     are loaded.
 *   - A character without a resolvable country receives an empty surname.
 *     No fallback names are invented.
 *   - A character without any resolvable given name fails generation
 *     with a structured reason. It does not fabricate one.
 *
 * DOMAIN-OWNED FIELDS:
 *   The generator produces ONLY character-owned input fields. Domain-owned
 *   embedded fields (professions, relationships, family, apprenticeship)
 *   are NOT generated here. Profession generation is an exception because
 *   it is character-owned input at creation time (the character IS a
 *   blacksmith at year N); it is written as `professions: [...]` and the
 *   factory copies it verbatim. Once RoleCommands takes over, all
 *   subsequent profession changes go through CharacterCommands.
 *
 * DEPENDENCIES (REQUIRED):
 *   - randomness.js: pickRandom, random, randomBoolean, randomInt,
 *                    pickWeighted
 *   - time.js:       getCurrentYear, isValidYear
 *   - world.js:      getPlaceById (via accessors.js)
 *   - accessors.js:  getPlaces, getPlaceById, getNameLists, getRoles
 *   - names.js:      getRandomNameFromCountry, getRandomSurnameFromCountry
 *
 * DEPENDENCIES (OPTIONAL, feature-gated):
 *   - religion-queries.js  (ReligionQueries)   — for religion selection
 *   - culture-queries.js   (CultureQueries)    — for culture resolution
 *   - culture-generation.js (CultureGeneration) — for appearance generation
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 0. HARD DEPENDENCY CHECK
    // =========================================================================

    var _required = [
        'pickRandom',
        'random',
        'randomBoolean',
        'randomInt',
        'pickWeighted',
        'getCurrentYear',
        'isValidYear',
        'getPlaces',
        'getPlaceById',
        'getNameLists',
        'getRoles',
        'getRandomNameFromCountry',
        'getRandomSurnameFromCountry'
    ];
    var _missing = [];
    for (var _i = 0; _i < _required.length; _i++) {
        if (typeof window[_required[_i]] === 'undefined') {
            _missing.push(_required[_i]);
        }
    }
    if (_missing.length > 0) {
        throw new Error(
            'character-generator.js: missing required dependencies: ' +
            _missing.join(', ')
        );
    }

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    // Age bands. `min` and `max` are inclusive. Bands do not overlap.
    // Weight is the relative selection probability within the total.
    var AGE_BANDS = [
        { min: 0,  max: 5,  weight: 10 },
        { min: 6,  max: 17, weight: 15 },
        { min: 18, max: 35, weight: 30 },
        { min: 36, max: 55, weight: 25 },
        { min: 56, max: 75, weight: 15 },
        { min: 76, max: 90, weight: 5 }
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

    function _validateOptionalString(value, name) {
        if (_isMissing(value)) return { ok: true, value: null };
        if (typeof value !== 'string') {
            return { ok: false, reason: name + ' must be a string when provided' };
        }
        return { ok: true, value: value };
    }

    function _validateOptionalAge(value) {
        if (_isMissing(value)) return { ok: true, value: null };
        if (typeof value !== 'number' || !Number.isFinite(value)
            || !Number.isInteger(value) || value < 0) {
            return { ok: false, reason: 'age must be a non-negative integer when provided' };
        }
        return { ok: true, value: value };
    }

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

    function _randomInt(min, max) {
        return window.randomInt(min, max);
    }

    // =========================================================================
    // 3. LOCATION RESOLUTION
    // =========================================================================

    /**
     * Walks the parent hierarchy of a place to find the country-scoped
     * ancestor. Returns the country place object or null.
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
     * Returns a random place with a non-empty variableKey, preferring
     * places that have name data.
     */
    function _getRandomLocationWithVariableKey() {
        var places = window.getPlaces();
        var withKey = [];
        for (var i = 0; i < places.length; i++) {
            var p = places[i];
            if (_hasId(p.variableKey)) withKey.push(p);
        }

        if (withKey.length === 0) {
            var named = [];
            for (var j = 0; j < places.length; j++) {
                var np = places[j];
                if (typeof np.displayName === 'string' && np.displayName.length > 0) {
                    named.push(np);
                }
            }
            if (named.length === 0) return null;
            return window.pickRandom(named);
        }

        var nameLists = window.getNameLists();
        var preferred = [];
        for (var k = 0; k < withKey.length; k++) {
            var pk = withKey[k];
            var list = nameLists[pk.id];
            var hasMale = list && Array.isArray(list.male) && list.male.length > 0;
            var hasFemale = list && Array.isArray(list.female) && list.female.length > 0;
            if (hasMale || hasFemale) preferred.push(pk);
        }

        return preferred.length > 0
            ? window.pickRandom(preferred)
            : window.pickRandom(withKey);
    }

    /**
     * Returns a random place whose id is a key in nameLists. Falls back to
     * any country-scoped place. Returns null if nothing is available.
     */
    function _getRandomCountryWithNameData() {
        var nameLists = window.getNameLists();
        var countryIds = Object.keys(nameLists).filter(function (id) {
            var list = nameLists[id];
            if (!list) return false;
            var hasMale = Array.isArray(list.male) && list.male.length > 0;
            var hasFemale = Array.isArray(list.female) && list.female.length > 0;
            return hasMale || hasFemale;
        });

        if (countryIds.length > 0) {
            var chosenId = window.pickRandom(countryIds);
            return window.getPlaceById(chosenId);
        }

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

        return countries.length > 0 ? window.pickRandom(countries) : null;
    }

    // =========================================================================
    // 4. AGE
    // =========================================================================

    function _generateAge() {
        var total = 0;
        for (var i = 0; i < AGE_BANDS.length; i++) total += AGE_BANDS[i].weight;

        var roll = window.random() * total;
        var accumulated = 0;
        var chosen = AGE_BANDS[AGE_BANDS.length - 1];

        for (var j = 0; j < AGE_BANDS.length; j++) {
            accumulated += AGE_BANDS[j].weight;
            if (roll < accumulated) {
                chosen = AGE_BANDS[j];
                break;
            }
        }

        return _randomInt(chosen.min, chosen.max);
    }

    // =========================================================================
    // 5. NAME AND SURNAME
    // =========================================================================

    function _generateGivenName(countryId, gender) {
        if (_hasId(countryId)) {
            var cultural = window.getRandomNameFromCountry(countryId, gender);
            if (typeof cultural === 'string' && cultural.length > 0) {
                return cultural;
            }
        }
        var generic = window.getRandomNameFromCountry(null, gender);
        if (typeof generic === 'string' && generic.length > 0) {
            return generic;
        }
        return null;
    }

    /**
     * Generates a surname. NO FALLBACK.
     * Empty string when no surname data is available for the country.
     */
    function _generateSurname(countryId, gender) {
        if (!_hasId(countryId)) return '';

        if (typeof window.NameQueries !== 'undefined'
            && typeof window.NameQueries.getCountrySurnameRules === 'function'
            && typeof window.NameQueries.generateSurnameFromRules === 'function') {
            var rules = window.NameQueries.getCountrySurnameRules(countryId);
            if (rules && rules.type) {
                var fromRules = window.NameQueries.generateSurnameFromRules(
                    null, null, gender, rules
                );
                if (typeof fromRules === 'string' && fromRules.length > 0) {
                    return fromRules;
                }
            }
        }

        var cultural = window.getRandomSurnameFromCountry(countryId);
        if (typeof cultural === 'string' && cultural.length > 0) {
            if (cultural === 'Unknown' || cultural === 'Unnamed') return '';
            return cultural;
        }

        return '';
    }

    function _surnameSourceFor(surname, countryId) {
        if (!surname) return 'none';
        if (_hasId(countryId)) return 'country';
        return 'custom';
    }

    // =========================================================================
    // 6. RELIGION
    // =========================================================================

    /**
     * Selects a religion at a location weighted by follower count.
     * Returns null when ReligionQueries is unavailable or the location has
     * no religions. Absence is a legitimate state, not a failure.
     */
    function _selectReligion(locationId) {
        if (!_hasId(locationId)) return null;
        if (typeof window.ReligionQueries === 'undefined') return null;
        if (typeof window.ReligionQueries.getReligionsByLocation !== 'function') return null;

        var religions = window.ReligionQueries.getReligionsByLocation(locationId);
        if (!Array.isArray(religions) || religions.length === 0) return null;

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

        var chosen = window.pickWeighted(weighted, function (item) { return item.weight; });
        return chosen ? chosen.id : null;
    }

    // =========================================================================
    // 7. CULTURE AND APPEARANCE
    // =========================================================================

    function _resolveCultureForLocation(locationId) {
        if (!_hasId(locationId)) return null;
        if (typeof window.CultureQueries === 'undefined') return null;
        if (typeof window.CultureQueries.getCultureByLocation !== 'function') return null;

        var culture = window.CultureQueries.getCultureByLocation(locationId);
        if (!culture || !_hasId(culture.id)) return null;
        return culture.id;
    }

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
    // 8. PROFESSION
    // =========================================================================

    /**
     * Selects a profession for a character.
     *
     * The character EXISTS at currentYear, so the profession startYear is
     * chosen between birthYear + MIN_PROFESSION_AGE and currentYear.
     * A 60-year-old blacksmith started decades ago, not today.
     */
    function _selectProfession(age, birthYear, currentYear, gender) {
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
            if (restriction === gender) eligible.push(role);
        }

        if (eligible.length === 0) return null;

        var role = window.pickRandom(eligible);
        if (!role) return null;

        var skillLevel = _randomInt(MIN_PROFESSION_SKILL, MAX_PROFESSION_SKILL);
        var earliestStart = birthYear + MIN_PROFESSION_AGE;
        if (earliestStart > currentYear) earliestStart = currentYear;
        var startYear = _randomInt(earliestStart, currentYear);

        return {
            id: role.id,
            name: role.name,
            primary: true,
            specs: [],
            skillLevel: skillLevel,
            startYear: startYear,
            notes: '',
            baseSalary: typeof role.baseSalary === 'number' ? role.baseSalary : 0,
            customSalary: null,
            salaryHistory: [],
            salaryLastCalculated: null,
            paysSalary: true
        };
    }

    // =========================================================================
    // 9. PUBLIC ENTRY POINT
    // =========================================================================

    /**
     * Generates random character data suitable for buildCharacter().
     *
     * @param {Object} [options]
     * @param {string} [options.gender]        'male' | 'female' — random if omitted
     * @param {number} [options.age]           specific age — random if omitted
     * @param {string} [options.countryId]     specific country place id
     * @param {string} [options.religionId]    specific religion id
     * @param {boolean} [options.assignProfession] default true
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
            gender = window.randomBoolean(0.5) ? 'male' : 'female';
        }

        // 2. Age and birthYear
        var age = ageResult.value;
        if (age === null) age = _generateAge();
        var birthYear = currentYear - age;

        // 3. Birthplace
        var birthplaceId = null;
        if (_hasId(countryIdResult.value)) {
            var specified = window.getPlaceById(countryIdResult.value);
            if (!specified) {
                return { success: false, reason: 'Specified countryId does not resolve to a place' };
            }
            // Explicit countryId → birthplace is the country itself.
            // We do not silently pick a sub-place; the caller asked for a country.
            birthplaceId = specified.id;
        } else {
            var birthplace = _getRandomLocationWithVariableKey();
            if (birthplace) birthplaceId = birthplace.id;
        }

        // 4. Country resolution for cultural context
        var countryId = null;
        if (_hasId(birthplaceId)) {
            var country = _getCountryFromLocation(birthplaceId);
            if (country) countryId = country.id;
        }
        if (!countryId) {
            var randomCountry = _getRandomCountryWithNameData();
            if (randomCountry) countryId = randomCountry.id;
        }

        // 5. Given name
        var name = _generateGivenName(countryId, gender);
        if (!name) {
            return {
                success: false,
                reason: 'No name could be generated (names.js has no generatable name pool)'
            };
        }

        // 6. Surname
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
            var profession = _selectProfession(age, birthYear, currentYear, gender);
            if (profession) professions.push(profession);
        }

        // 10. Assemble
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

            religionId: religionId,
            cultureId: cultureId,

            appearance: appearance,
            notes: '',

            professions: professions
        };

        return { success: true, data: data };
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.generateRandomCharacterData = generateRandomCharacterData;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            generateRandomCharacterData: generateRandomCharacterData
        };
    }
})();
