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
 *   - Random trait selection
 *   - Random birthplace selection
 *   - Culture resolution for names and appearance
 *   - Religion selection weighted by location follower count (if available)
 *   - Appearance generation (if available)
 *   - Profession selection (if roles and age permit)
 *   - Assembly of a plain `data` object for the factory
 *
 * OUT OF SCOPE:
 *   - Character schema construction → character-factory.js
 *   - Collection mutation → character-creation-commands.js
 *   - Name generation internals → name-queries.js / name-system.js
 *   - Culture/appearance internals → culture-generation.js
 *   - Religion internals → religion-queries.js
 *   - Family / relationship / apprenticeship establishment → their commands
 *   - Trait vocabulary / acquisition policy → constants/character-traits.js
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
 *   - Missing optional dependencies (religion, culture, appearance) are
 *     treated as a feature being unavailable. The generated field is left
 *     absent (never fabricated).
 *   - A character must end up with a resolvable culture that has actual
 *     given-name data (or a culture whose name pool can be supplemented
 *     by the fallback name list — John/Jane/Emery style). If the
 *     location's primary culture has no name data and no other culture
 *     does either, the character is assigned the location's culture and
 *     given a name from the built-in fallback pool. The alternative —
 *     leaving cultureId null and passing it into NameQueries.getRandomName
 *     — throws.
 *
 * NAME GENERATION KEY — CULTURE, NOT COUNTRY
 * ------------------------------------------
 * The name subsystem migrated from country-keyed to culture-keyed reads
 * (see js/modules/names/name-queries.js's header). Name pools live at
 * masterData.data.nameLists[cultureId]; there is no nameLists[placeId]
 * lookup. window.getRandomNameFromCountry / getRandomSurnameFromCountry
 * are legacy alias names on name-system.js that now take a CULTURE id.
 *
 * Prior revisions of this generator computed a country (place) id and
 * passed it as the "cultureId" argument. NameQueries.getRandomName
 * refuses a place id (no nameLists entry) and the fallback path passed
 * `null`, which throws "getRandomName: cultureId must be a non-empty
 * string". Random character generation failed for every character.
 *
 * This revision resolves a CULTURE id from the birthplace first, uses
 * that id for names, surnames, and appearance, and falls back to a
 * random culture with name data (or, ultimately, to the built-in
 * fallback name list) when no culture has data.
 *
 * SURNAME SOURCE VOCABULARY
 * -------------------------
 * The factory accepts: country, cultural, inherited, custom, none.
 * This generator emits 'cultural' (surname from a culture's surname
 * pool), 'custom' (surname was supplied/overridden by the caller), and
 * 'none' (no surname). It does NOT emit 'culture' — that spelling is
 * not in the factory's allowlist and will be rejected at build time.
 *
 * FALLBACK NAME POOL
 * ------------------
 * When no culture has any name data (empty nameLists everywhere, or a
 * single culture with all-empty pools), the generator falls back to a
 * small built-in name pool (JOHN/JANE/EMERY). The fallback names are
 * cosmetic only; they do NOT invent a culture. The character keeps
 * whatever culture the location resolved to (possibly null).
 *
 * DEPENDENCIES (REQUIRED):
 *   - randomness.js: pickRandom, random, randomBoolean, randomInt,
 *                    pickWeighted
 *   - time.js:       getCurrentYear, isValidYear
 *   - world.js:      getPlaceScope, getLocationTypeScope
 *   - accessors.js:  getPlaces, getPlaceById, getNameLists, getRoles
 *   - names.js:      getRandomNameFromCountry, getRandomSurnameFromCountry
 *                    (legacy aliases on name-system.js; culture-keyed)
 *   - constants/character-traits.js:
 *                    CHARACTER_TRAIT_VALUES (validated at load time)
 *
 * DEPENDENCIES (OPTIONAL, feature-gated):
 *   - religion-queries.js  (ReligionQueries)   — for religion selection
 *   - culture-queries.js   (CultureQueries)    — for culture resolution.
 *                             Method used: getPrimaryCultureForLocation.
 *   - culture-generation.js (CultureGeneration) — for appearance generation
 *   - name-queries.js      (NameQueries)       — for the culture-with-
 *                             name-data fallback (getCultureIdsWithGivenNames,
 *                             hasGivenNameData, hasSurnameData)
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Culture resolution runs BEFORE names (step 5), and the resolved
 *       culture is reused for names, surnames, and appearance.
 *     - _generateGivenName takes a cultureId and consults
 *       NameQueries.hasGivenNameData before calling
 *       getRandomNameFromCountry. Empty cultures fall through to a
 *       random culture with data, then to the built-in fallback pool.
 *     - _generateSurname takes a cultureId and consults
 *       NameQueries.hasSurnameData; empty cultures return ''.
 *     - _surnameSourceFor emits 'cultural' (not 'culture'), matching
 *       the factory's allowlist.
 *     - Added FALLBACK_FIRST_NAMES (JOHN/JANE/EMERY) for the "no
 *       culture has name data at all" case.
 *   Previous revision (K2):
 *     - _resolveCultureForLocation now calls
 *       CultureQueries.getPrimaryCultureForLocation, not
 *       CultureQueries.getCultureByLocation.
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
        'getPlaceScope',
        'getLocationTypeScope',
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

    if (!Array.isArray(window.CHARACTER_TRAIT_VALUES)) {
        throw new Error(
            'character-generator.js: character-traits.js must load first ' +
            '(CHARACTER_TRAIT_VALUES missing). The generator requires the ' +
            'canonical trait vocabulary; there is no soft-fail path.'
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

    // Trait generation policy. The generator picks between MIN and MAX
    // distinct traits from the canonical vocabulary. Fixed at generation
    // time; there is no per-call override.
    var MIN_TRAITS = 1;
    var MAX_TRAITS = 3;

    // Fallback given-name pool. Used ONLY when no culture has any name
    // data (empty nameLists everywhere, or a single culture with empty
    // pools). Cosmetic names; they do NOT invent a culture.
    var FALLBACK_FIRST_NAMES = {
        male: ['John', 'Emery', 'Aldric', 'Cedric', 'Rowan'],
        female: ['Jane', 'Emery', 'Adela', 'Celia', 'Rowena']
    };

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

    function _nameQueries() {
        return (typeof window.NameQueries !== 'undefined') ? window.NameQueries : null;
    }

    // =========================================================================
    // 3. TRAIT SELECTION
    // =========================================================================

    function _selectTraits() {
        var pool = window.CHARACTER_TRAIT_VALUES;
        if (pool.length === 0) return [];

        if (pool.length <= MIN_TRAITS) {
            return pool.slice();
        }

        var count = _randomInt(MIN_TRAITS, Math.min(MAX_TRAITS, pool.length));

        if (typeof window.pickRandomMultiple === 'function') {
            var picked = window.pickRandomMultiple(pool, count);
            if (Array.isArray(picked)) return picked.slice();
        }

        if (typeof window.shuffleArray === 'function') {
            var shuffled = window.shuffleArray(pool.slice());
            return shuffled.slice(0, count);
        }

        var chosen = [];
        var attempts = 0;
        while (chosen.length < count && attempts < count * 4) {
            attempts++;
            var t = window.pickRandom(pool);
            if (typeof t === 'string' && chosen.indexOf(t) === -1) {
                chosen.push(t);
            }
        }
        return chosen;
    }

    // =========================================================================
    // 4. LOCATION RESOLUTION
    // =========================================================================

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

            if (window.getPlaceScope(current) === 'country') return current;

            if (!_hasId(current.parentId)) break;
            current = window.getPlaceById(current.parentId);
        }

        return null;
    }

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

    // =========================================================================
    // 5. AGE
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
    // 6. CULTURE RESOLUTION
    // =========================================================================
    //
    // Culture is resolved BEFORE names. The name subsystem keys its pools
    // by culture.id (see name-queries.js's header), so without a culture
    // we cannot resolve a name.

    function _resolveCultureForLocation(locationId) {
        if (!_hasId(locationId)) return null;
        if (typeof window.CultureQueries === 'undefined') return null;
        if (typeof window.CultureQueries.getPrimaryCultureForLocation !== 'function') {
            return null;
        }

        var culture = window.CultureQueries.getPrimaryCultureForLocation(locationId);
        if (!culture || !_hasId(culture.id)) return null;
        return culture.id;
    }

    /**
     * Returns a random culture id that has actual given-name data
     * (male or female pool non-empty). Prefers NameQueries'
     * getCultureIdsWithGivenNames when available; falls back to scanning
     * the raw nameLists map otherwise.
     */
    function _resolveRandomCultureWithGivenNames() {
        var NQ = _nameQueries();
        if (NQ && typeof NQ.getCultureIdsWithGivenNames === 'function') {
            var ids = NQ.getCultureIdsWithGivenNames();
            if (Array.isArray(ids) && ids.length > 0) {
                var chosen = window.pickRandom(ids);
                return _hasId(chosen) ? chosen : null;
            }
            return null;
        }

        // Fallback scan against raw canonical data when NameQueries is
        // not loaded or does not expose the helper.
        var nameLists = window.getNameLists();
        if (!nameLists || typeof nameLists !== 'object') return null;
        var withNames = [];
        var keys = Object.keys(nameLists);
        for (var i = 0; i < keys.length; i++) {
            var list = nameLists[keys[i]];
            if (!list || typeof list !== 'object') continue;
            var hasMale = Array.isArray(list.male) && list.male.length > 0;
            var hasFemale = Array.isArray(list.female) && list.female.length > 0;
            if (hasMale || hasFemale) withNames.push(keys[i]);
        }
        if (withNames.length === 0) return null;
        var pick = window.pickRandom(withNames);
        return _hasId(pick) ? pick : null;
    }

    function _cultureHasGivenNames(cultureId) {
        var NQ = _nameQueries();
        if (NQ && typeof NQ.hasGivenNameData === 'function') {
            try { return NQ.hasGivenNameData(cultureId) === true; }
            catch (e) { /* fall through */ }
        }
        // Fallback: inspect the raw pool directly.
        var nameLists = window.getNameLists();
        if (!nameLists || typeof nameLists !== 'object') return false;
        var list = nameLists[cultureId];
        if (!list || typeof list !== 'object') return false;
        var hasMale = Array.isArray(list.male) && list.male.length > 0;
        var hasFemale = Array.isArray(list.female) && list.female.length > 0;
        return hasMale || hasFemale;
    }

    function _cultureHasSurnames(cultureId) {
        var NQ = _nameQueries();
        if (NQ && typeof NQ.hasSurnameData === 'function') {
            try { return NQ.hasSurnameData(cultureId) === true; }
            catch (e) { /* fall through */ }
        }
        var nameLists = window.getNameLists();
        if (!nameLists || typeof nameLists !== 'object') return false;
        var list = nameLists[cultureId];
        if (!list || typeof list !== 'object') return false;
        return Array.isArray(list.surnames) && list.surnames.length > 0;
    }

    // =========================================================================
    // 7. NAME AND SURNAME
    // =========================================================================
    //
    // Both functions take a CULTURE id. When the resolved culture has no
    // data, they return null/'' so the caller can decide. The public
    // entry point has a final fallback path that tries a random culture
    // with name data, then the built-in FALLBACK_FIRST_NAMES pool.

    function _generateGivenNameFromCulture(cultureId, gender) {
        if (!_hasId(cultureId)) return null;
        if (!_cultureHasGivenNames(cultureId)) return null;

        var NQ = _nameQueries();
        if (NQ && typeof NQ.getRandomName === 'function') {
            try {
                var fromNQ = NQ.getRandomName(cultureId, gender);
                if (typeof fromNQ === 'string' && fromNQ.length > 0) {
                    return fromNQ;
                }
            } catch (e) { /* fall through to legacy alias */ }
        }
        if (typeof window.getRandomNameFromCountry === 'function') {
            var fromAlias = window.getRandomNameFromCountry(cultureId, gender);
            if (typeof fromAlias === 'string' && fromAlias.length > 0) {
                return fromAlias;
            }
        }
        return null;
    }

    function _generateGivenName(gender) {
        var finalGender = (gender === 'female') ? 'female' : 'male';
        var pool = FALLBACK_FIRST_NAMES[finalGender];
        if (!Array.isArray(pool) || pool.length === 0) return null;
        return window.pickRandom(pool);
    }

    function _generateSurnameFromCulture(cultureId, gender) {
        if (!_hasId(cultureId)) return '';
        if (!_cultureHasSurnames(cultureId)) return '';

        var NQ = _nameQueries();
        if (NQ
            && typeof NQ.getCultureSurnameRules === 'function'
            && typeof NQ.generateSurnameFromRules === 'function') {
            var rules = null;
            try { rules = NQ.getCultureSurnameRules(cultureId); }
            catch (e) { rules = null; }
            if (rules && rules.type) {
                var fromRules = null;
                try {
                    fromRules = NQ.generateSurnameFromRules(
                        null, null, gender, rules
                    );
                } catch (e) { fromRules = null; }
                if (typeof fromRules === 'string' && fromRules.length > 0) {
                    return fromRules;
                }
            }
        }

        if (typeof window.getRandomSurnameFromCountry === 'function') {
            var cultural = window.getRandomSurnameFromCountry(cultureId);
            if (typeof cultural === 'string' && cultural.length > 0) {
                if (cultural === 'Unknown' || cultural === 'Unnamed') return '';
                return cultural;
            }
        }
        return '';
    }

    function _surnameSourceFor(surname, cultureId) {
        if (!surname) return 'none';
        if (_hasId(cultureId) && _cultureHasSurnames(cultureId)) return 'cultural';
        return 'custom';
    }

    // =========================================================================
    // 8. RELIGION
    // =========================================================================

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
    // 9. APPEARANCE
    // =========================================================================

    function _generateAppearance(cultureId, gender) {
        if (typeof window.CultureGeneration === 'undefined') return {};
        if (typeof window.CultureGeneration.generateAppearance !== 'function') return {};

        var appearance = null;
        try {
            appearance = window.CultureGeneration.generateAppearance(cultureId, gender);
        } catch (e) {
            // Appearance is optional. A culture without appearance data
            // throws inside generateAppearance; treat as unavailable.
            return {};
        }
        if (!appearance || typeof appearance !== 'object' || Array.isArray(appearance)) {
            return {};
        }
        return appearance;
    }

    // =========================================================================
    // 10. PROFESSION
    // =========================================================================

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
    // 11. PUBLIC ENTRY POINT
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

        // 3. Traits — 1..3 distinct from the canonical vocabulary.
        var traits = _selectTraits();

        // 4. Birthplace
        var birthplaceId = null;
        if (_hasId(countryIdResult.value)) {
            var specified = window.getPlaceById(countryIdResult.value);
            if (!specified) {
                return {
                    success: false,
                    reason: 'Specified countryId does not resolve to a place'
                };
            }
            birthplaceId = specified.id;
        } else {
            var birthplace = _getRandomLocationWithVariableKey();
            if (birthplace) birthplaceId = birthplace.id;
        }

        // 5. Culture resolution — BEFORE names.
        //
        // The name subsystem keys by culture.id. If the location has a
        // primary culture, that's what we use. If the culture exists but
        // has no name data, we reassign the character to a culture that
        // does, so the character's cultureId always points at a culture
        // that can produce a name.
        var cultureId = _resolveCultureForLocation(birthplaceId);

        if (!cultureId) {
            // No location culture at all — pick any culture with names.
            cultureId = _resolveRandomCultureWithGivenNames();
        } else if (!_cultureHasGivenNames(cultureId)) {
            // Location culture exists but its name pool is empty. Reassign
            // to a random culture with names so the character's cultureId
            // matches the culture whose name was actually used.
            var replacement = _resolveRandomCultureWithGivenNames();
            if (replacement) {
                cultureId = replacement;
            }
            // If no replacement exists, cultureId stays as the empty
            // culture; the fallback name pool below will supply a name.
        }

        // 6. Given name
        var name = _generateGivenNameFromCulture(cultureId, gender);
        if (!name) {
            // No culture produced a name. Try the fallback name pool.
            // This is the JOHN/JANE/EMERY path — cosmetic only. The
            // character keeps whatever cultureId we resolved above
            // (which may be an empty culture, or null if the map is
            // entirely without cultures).
            name = _generateGivenName(gender);
        }
        if (!name) {
            return {
                success: false,
                reason: 'No name could be generated (no culture has a ' +
                    'name pool and the fallback pool is unavailable)'
            };
        }

        // 7. Surname
        var surname = _generateSurnameFromCulture(cultureId, gender);
        var surnameSource = _surnameSourceFor(surname, cultureId);

        // 8. Religion
        var religionId = null;
        if (_hasId(religionIdResult.value)) {
            religionId = religionIdResult.value;
        } else {
            religionId = _selectReligion(birthplaceId);
        }

        // 9. Appearance — reuses the cultureId resolved at step 5.
        var appearance = _generateAppearance(cultureId, gender);

        // 10. Profession
        var professions = [];
        if (options.assignProfession !== false) {
            var profession = _selectProfession(age, birthYear, currentYear, gender);
            if (profession) professions.push(profession);
        }

        // 11. Assemble
        var data = {
            name: name,
            surname: surname,
            surnameSource: surnameSource,
            gender: gender,
            attraction: DEFAULT_ATTRACTION,
            traits: traits,
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
    // 12. EXPORTS
    // =========================================================================

    window.generateRandomCharacterData = generateRandomCharacterData;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            generateRandomCharacterData: generateRandomCharacterData
        };
    }
})();
