/**
 * =============================================================================
 * STILL WATERS - CHARACTER LIFECYCLE (js/character/character-lifecycle.js)
 * =============================================================================
 *
 * Time progression, mortality orchestration, age classification, and
 * lifespan estimation for the character domain.
 *
 * SCOPE:
 *   - Advance simulation time by N years
 *   - Evaluate mortality per year per character
 *   - Choose a death cause (from a caller-supplied selector, or the
 *     MortalityRules catalogue)
 *   - Build a canonical death transition
 *   - Delegate the mutation to CharacterCommands.markDeceased
 *   - Dispatch family consequences through FamilyCommands
 *   - Life stage classification
 *   - Age group classification
 *   - Elderly check
 *   - Group characters by age band
 *   - Death wrappers (natural, accidental, random-cause)
 *   - Lifespan estimation (deterministic)
 *
 * OUT OF SCOPE:
 *   - Mortality policy                 -> mortality-rules.js
 *   - Canonical character mutation     -> character-commands.js
 *   - Death reads                      -> mortality-queries.js
 *   - Aggregate statistics             -> mortality-statistics.js
 *   - Childbirth orchestration         -> children-commands.js
 *   - Succession / inheritance         -> future succession domain
 *   - Relationship termination on death -> future relationship domain
 *   - Rank deprecation on death         -> future rank domain
 *
 * CONTRACT:
 *   - One year of progression is processed per iteration. A multi-year
 *     advance evaluates each year in sequence, using that year's age
 *     and that year's rate.
 *   - Randomness is injected. Callers supply `options.random` (returns
 *     [0, 1)). When absent, Math.random is used. Rules are deterministic.
 *   - The death mutation goes through CharacterCommands.markDeceased
 *     exactly once per death.
 *   - The death cause is a stable id. Detail text is passed separately.
 *   - Life stage helpers accept either a character projection or a
 *     numeric age. They never reach into state for a missing birth year.
 *
 * AGE CLASSIFICATION:
 *   LIFE_STAGES comes from constants.js. It maps stage keys to
 *   { min, max, name, group }. AGE_GROUPS is an ordered array of band
 *   keys such as '0-10', '11-20', ..., '91+'. Both are read from the
 *   global scope at call time; if either is missing, the corresponding
 *   helper returns null rather than fabricating a classification.
 *
 * LIFESPAN ESTIMATION:
 *   predictLifespan computes a deterministic estimate from the
 *   character's identity hash and rank priority. It does not use
 *   MortalityRules bands, because the bands describe annual risk and
 *   the estimate is a policy-light heuristic. If you want a
 *   mortality-model-driven estimate, iterate simulateRemainingYears.
 *
 * DEPENDENCIES (REQUIRED):
 *   - character-state.js:        CharacterState
 *   - character-commands.js:     CharacterCommands (markDeceased)
 *   - mortality-rules.js:        MortalityRules
 *   - time.js:                   getCurrentYear
 *
 * DEPENDENCIES (OPTIONAL, called only if loaded):
 *   - family-commands.js:        FamilyCommands.handleCharacterDeath
 *   - event-log.js:              logEvent
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    if (!window.CharacterState) {
        throw new Error(
            'character-lifecycle.js: character-state.js must load first.'
        );
    }
    if (!window.CharacterCommands) {
        throw new Error(
            'character-lifecycle.js: character-commands.js must load first.'
        );
    }
    if (!window.MortalityRules) {
        throw new Error(
            'character-lifecycle.js: mortality-rules.js must load first.'
        );
    }
    if (typeof window.getCurrentYear !== 'function') {
        throw new Error(
            'character-lifecycle.js: time.js (getCurrentYear) must load first.'
        );
    }

    var CS = window.CharacterState;
    var CC = window.CharacterCommands;
    var MR = window.MortalityRules;

    if (typeof CC.markDeceased !== 'function') {
        throw new Error(
            'character-lifecycle.js: CharacterCommands.markDeceased is required.'
        );
    }

    // =========================================================================
    // 1. HELPERS
    // =========================================================================

    function _isPlainObject(v) {
        if (v === null || typeof v !== 'object') return false;
        var proto = Object.getPrototypeOf(v);
        return proto === Object.prototype || proto === null;
    }

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isValidAge(v) {
        return typeof v === 'number'
            && Number.isFinite(v)
            && v >= 0;
    }

    function _getRandomFn(options) {
        if (options && typeof options.random === 'function') {
            return options.random;
        }
        return Math.random;
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    /**
     * Resolves an age from a character projection, a character id, or a
     * numeric age. Returns null for anything else.
     */
    function _resolveAge(input) {
        if (input === null || input === undefined) return null;

        if (typeof input === 'number') {
            return _isValidAge(input) ? input : null;
        }

        if (typeof input === 'string') {
            var projection = CS.getCharacter(input);
            if (!projection) return null;
            return _ageOfProjection(projection);
        }

        if (typeof input === 'object') {
            return _ageOfProjection(input);
        }

        return null;
    }

    function _ageOfProjection(character) {
        if (!character) return null;
        if (typeof character.birthYear !== 'number') return null;
        if (character.isDeceased === true && typeof character.deathYear === 'number') {
            return character.deathYear - character.birthYear;
        }
        var currentYear = window.getCurrentYear();
        var age = currentYear - character.birthYear;
        return age >= 0 ? age : null;
    }

    // =========================================================================
    // 2. LIFE STAGE CLASSIFICATION
    // =========================================================================

    /**
     * Returns the life stage for a character or an age.
     *
     * @returns {{ key, name, min, max, group } | null}
     */
    function getLifeStage(charOrAge) {
        var age = _resolveAge(charOrAge);
        if (age === null) return null;

        var stages = window.LIFE_STAGES;
        if (!stages || typeof stages !== 'object') return null;

        var keys = Object.keys(stages);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var stage = stages[key];
            if (!stage || typeof stage !== 'object') continue;
            if (typeof stage.min !== 'number' || typeof stage.max !== 'number') {
                continue;
            }
            if (age >= stage.min && age <= stage.max) {
                return {
                    key: key,
                    name: stage.name || key,
                    min: stage.min,
                    max: stage.max,
                    group: stage.group || null
                };
            }
        }
        return null;
    }

    function getLifeStageName(charOrAge) {
        var stage = getLifeStage(charOrAge);
        return stage ? stage.name : null;
    }

    // =========================================================================
    // 3. AGE GROUP CLASSIFICATION
    // =========================================================================

    /**
     * Returns the age group key for a character or age.
     * Age groups are strings like '0-10', '91+'.
     *
     * @returns {string | null}
     */
    function getAgeGroup(charOrAge) {
        var age = _resolveAge(charOrAge);
        if (age === null) return null;

        var groups = window.AGE_GROUPS;
        if (!Array.isArray(groups)) return null;

        for (var i = 0; i < groups.length; i++) {
            var group = groups[i];
            if (typeof group !== 'string') continue;
            var parts = group.split('-');
            if (parts.length !== 2) continue;
            var min = parseInt(parts[0], 10);
            var maxPart = parts[1];
            var max = maxPart === '+' ? Infinity : parseInt(maxPart, 10);
            if (!Number.isFinite(min) && min !== 0) {
                if (isNaN(min)) continue;
            }
            if (maxPart !== '+' && isNaN(max)) continue;
            if (age >= min && age <= max) return group;
        }
        return null;
    }

    function getAllAgeGroups() {
        if (!Array.isArray(window.AGE_GROUPS)) return [];
        return window.AGE_GROUPS.slice();
    }

    function getAgeGroupIndex(group) {
        if (typeof group !== 'string') return -1;
        if (!Array.isArray(window.AGE_GROUPS)) return -1;
        return window.AGE_GROUPS.indexOf(group);
    }

    /**
     * True if the character or age is elderly (60 or above).
     *
     * @returns {boolean | null}
     */
    function isElderly(charOrAge) {
        var age = _resolveAge(charOrAge);
        if (age === null) return null;
        return age >= 60;
    }

    /**
     * Groups an array of character projections by age group.
     *
     * @param {Array} characters
     * @param {boolean} [excludeDeceased] default true
     * @returns {Object<string, Array>}
     */
    function groupCharactersByAgeGroup(characters, excludeDeceased) {
        if (!Array.isArray(characters)) return {};
        if (excludeDeceased === undefined) excludeDeceased = true;

        var groups = {};
        var ageGroups = window.AGE_GROUPS;
        if (Array.isArray(ageGroups)) {
            for (var i = 0; i < ageGroups.length; i++) {
                groups[ageGroups[i]] = [];
            }
        }

        for (var j = 0; j < characters.length; j++) {
            var character = characters[j];
            if (!character) continue;
            if (excludeDeceased === true && character.isDeceased === true) continue;

            var age = _ageOfProjection(character);
            if (age === null) continue;

            var group = getAgeGroup(age);
            if (!group) continue;
            if (!groups[group]) groups[group] = [];
            groups[group].push(character);
        }

        // Sort each group by age ascending.
        var keys = Object.keys(groups);
        for (var k = 0; k < keys.length; k++) {
            groups[keys[k]].sort(function (a, b) {
                var aAge = _ageOfProjection(a);
                var bAge = _ageOfProjection(b);
                if (aAge === null && bAge === null) return 0;
                if (aAge === null) return 1;
                if (bAge === null) return -1;
                return aAge - bAge;
            });
        }

        return groups;
    }

    // =========================================================================
    // 4. DEATH CAUSE SELECTION
    // =========================================================================

    /**
     * Chooses a death cause for a character.
     *
     * If options.chooseDeathCause is supplied, it is called and must
     * return { deathCause, deathCauseDetail? }.
     *
     * Otherwise, MortalityRules.pickRandomCause is used with the
     * caller's random function.
     */
    function _chooseDeathCause(character, age, year, options) {
        if (typeof options.chooseDeathCause === 'function') {
            var custom = options.chooseDeathCause(character, age, year);
            if (custom && MR.isValidDeathCause(custom.deathCause)) {
                return {
                    cause: custom.deathCause,
                    detail: typeof custom.deathCauseDetail === 'string'
                        ? custom.deathCauseDetail
                        : ''
                };
            }
            // Fall through if the caller's selector returned something
            // invalid; the deterministic picker is more forgiving.
        }

        var random = _getRandomFn(options);
        var roll = random();
        var picked = MR.pickRandomCause(
            { age: age, gender: character.gender },
            roll
        );
        if (picked) {
            return { cause: picked.cause, detail: picked.detail };
        }
        return { cause: MR.DEATH_CAUSE.UNKNOWN, detail: 'Cause not recorded' };
    }

    // =========================================================================
    // 5. MORTALITY RATE
    // =========================================================================

    function _getRateForCharacter(character, age, year, options) {
        if (typeof options.getMortalityRate === 'function') {
            var custom = options.getMortalityRate(character, age, year);
            if (typeof custom === 'number'
                && Number.isFinite(custom)
                && custom >= 0
                && custom <= 1) {
                return custom;
            }
        }
        return MR.getDefaultMortalityRate(age);
    }

    // =========================================================================
    // 6. PER-CHARACTER MORTALITY EVALUATION
    // =========================================================================

    function _evaluateCharacterForYear(character, year, options) {
        var age = MR.calculateAgeAtYear(character.birthYear, year);
        if (age === null) {
            return { died: false, reason: 'invalid_birth_year' };
        }

        var rate = _getRateForCharacter(character, age, year, options);
        if (typeof rate !== 'number') {
            return { died: false, reason: 'no_rate' };
        }

        var random = _getRandomFn(options);
        var roll = random();

        var result = MR.evaluateMortalityRoll(
            { age: age, mortalityRate: rate },
            roll
        );
        if (!result.valid) {
            return { died: false, reason: 'invalid_evaluation' };
        }
        if (!result.dies) {
            return { died: false };
        }

        var choice = _chooseDeathCause(character, age, year, options);

        return {
            died: true,
            cause: choice.cause,
            causeDetail: choice.detail,
            ageAtDeath: age
        };
    }

    // =========================================================================
    // 7. DEATH TRANSITION
    // =========================================================================

    function _die(character, year, evaluation, options) {
        var deathData = {
            deathYear: year,
            deathCause: evaluation.cause,
            deathCauseDetail: evaluation.causeDetail,
            deathNotes: '',
            isMurder: evaluation.cause === MR.DEATH_CAUSE.MURDER,
            killerId: null,
            murderMotive: null,
            murderMethod: null,
            isExecution: evaluation.cause === MR.DEATH_CAUSE.EXECUTION,
            executionReason: null,
            executionMethod: null,
            executionLocation: null
        };

        var deathResult = CC.markDeceased(character.id, deathData);
        if (!deathResult || deathResult.success !== true) {
            throw new Error(
                'character-lifecycle.js: markDeceased failed for '
                + character.id
                + ': '
                + (deathResult && deathResult.reason ? deathResult.reason : 'unknown')
            );
        }

        _logEvent('death', 'Death',
            character.name + ' died of '
            + evaluation.cause
            + (evaluation.causeDetail ? ' (' + evaluation.causeDetail + ')' : '')
            + ' in ' + year,
            [character]);

        if (typeof window.FamilyCommands !== 'undefined'
            && typeof window.FamilyCommands.handleCharacterDeath === 'function') {
            window.FamilyCommands.handleCharacterDeath(character.id, year);
        }

        return deathResult;
    }

    // =========================================================================
    // 8. TIME PROGRESSION
    // =========================================================================

    /**
     * Advances mortality by N years, one year at a time.
     *
     * options:
     * {
     *   getMortalityRate(character, age, year)  ->  number | null
     *   chooseDeathCause(character, age, year)  ->  { deathCause, deathCauseDetail? }
     *   random()                                ->  number in [0,1)
     *   maxDeaths                               ->  number | undefined
     * }
     */
    function advanceMortality(yearsAdvanced, options) {
        if (typeof yearsAdvanced !== 'number'
            || !Number.isFinite(yearsAdvanced)
            || !Number.isInteger(yearsAdvanced)
            || yearsAdvanced < 0) {
            return {
                success: false,
                reason: 'yearsAdvanced must be a non-negative integer.'
            };
        }
        if (options === undefined || options === null) options = {};
        if (!_isPlainObject(options)) {
            return { success: false, reason: 'options must be a plain object.' };
        }

        var currentYear = window.getCurrentYear();
        var deaths = [];
        var maxDeaths = typeof options.maxDeaths === 'number'
            ? options.maxDeaths
            : Infinity;

        for (var offset = 1; offset <= yearsAdvanced; offset++) {
            var year = currentYear + offset;

            var living = CS.getLivingCharacters();
            for (var i = 0; i < living.length; i++) {
                if (deaths.length >= maxDeaths) break;

                var projection = living[i];
                var live = CS._getLiveCharacterForMutation(projection.id);
                if (!live || live.isDeceased === true) continue;

                var evaluation = _evaluateCharacterForYear(live, year, options);
                if (!evaluation.died) continue;

                _die(live, year, evaluation, options);
                deaths.push({
                    characterId: live.id,
                    name: live.name,
                    surname: live.surname || '',
                    deathYear: year,
                    deathCause: evaluation.cause,
                    deathCauseDetail: evaluation.causeDetail,
                    ageAtDeath: evaluation.ageAtDeath
                });
            }
        }

        return {
            success: true,
            yearsAdvanced: yearsAdvanced,
            deaths: deaths,
            deathCount: deaths.length
        };
    }

    // =========================================================================
    // 9. PUBLIC DEATH COMMANDS
    // =========================================================================

    /**
     * Kills a specific character with explicit death data.
     * Thin wrapper around CharacterCommands.markDeceased that adds
     * lifecycle-level dispatch (family consequences) and event logging.
     */
    function killCharacter(characterId, deathData) {
        if (!_hasId(characterId)) {
            return { success: false, reason: 'characterId is required.' };
        }
        if (!_isPlainObject(deathData)) {
            return { success: false, reason: 'deathData must be a plain object.' };
        }

        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character) {
            return { success: false, reason: 'Character not found.' };
        }
        if (character.isDeceased === true) {
            return { success: false, reason: 'Character is already deceased.' };
        }

        var result = CC.markDeceased(characterId, deathData);
        if (!result || result.success !== true) {
            return {
                success: false,
                reason: result && result.reason ? result.reason : 'markDeceased failed.'
            };
        }

        var year = typeof deathData.deathYear === 'number'
            ? deathData.deathYear
            : window.getCurrentYear();

        _logEvent('death', 'Death',
            character.name + ' died of '
            + (deathData.deathCause || 'unknown')
            + (deathData.deathCauseDetail ? ' (' + deathData.deathCauseDetail + ')' : '')
            + ' in ' + year,
            [character]);

        if (typeof window.FamilyCommands !== 'undefined'
            && typeof window.FamilyCommands.handleCharacterDeath === 'function') {
            window.FamilyCommands.handleCharacterDeath(characterId, year);
        }

        return result;
    }

    /**
     * Kills a character with a randomly chosen cause from the
     * MortalityRules catalogue. The roll is drawn from options.random.
     *
     * options:
     * {
     *   year,             default current year
     *   random()          optional
     *   catalogue         optional cause catalogue
     *   notes             optional death notes
     * }
     */
    function killCharacterRandomCause(characterId, options) {
        if (!_hasId(characterId)) {
            return { success: false, reason: 'characterId is required.' };
        }
        if (options === undefined || options === null) options = {};
        if (!_isPlainObject(options)) {
            return { success: false, reason: 'options must be a plain object.' };
        }

        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character) {
            return { success: false, reason: 'Character not found.' };
        }
        if (character.isDeceased === true) {
            return { success: false, reason: 'Character is already deceased.' };
        }

        var year = typeof options.year === 'number'
            ? options.year
            : window.getCurrentYear();

        var age = MR.calculateAgeAtYear(character.birthYear, year);
        if (age === null) {
            return { success: false, reason: 'Character has no determinable age.' };
        }

        var random = _getRandomFn(options);
        var picked = MR.pickRandomCause(
            { age: age, gender: character.gender },
            random(),
            options.catalogue
        );
        if (!picked) {
            return { success: false, reason: 'No eligible death cause.' };
        }

        return killCharacter(characterId, {
            deathYear: year,
            deathCause: picked.cause,
            deathCauseDetail: picked.detail,
            deathNotes: typeof options.notes === 'string' ? options.notes : ''
        });
    }

    /**
     * Kills a character from natural causes appropriate to their age.
     */
    function triggerNaturalDeath(characterId, options) {
        if (!_hasId(characterId)) {
            return { success: false, reason: 'characterId is required.' };
        }
        if (options === undefined || options === null) options = {};

        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character) {
            return { success: false, reason: 'Character not found.' };
        }

        var year = typeof options.year === 'number'
            ? options.year
            : window.getCurrentYear();

        var age = MR.calculateAgeAtYear(character.birthYear, year);
        if (age === null) {
            return { success: false, reason: 'Character has no determinable age.' };
        }

        var detail = age >= 60 ? 'Old age' : 'Natural causes';

        return killCharacter(characterId, {
            deathYear: year,
            deathCause: MR.DEATH_CAUSE.NATURAL,
            deathCauseDetail: detail,
            deathNotes: typeof options.notes === 'string' ? options.notes : ''
        });
    }

    /**
     * Kills a character by accident. If no accidentType is supplied, one
     * is chosen from options.random.
     */
    function triggerAccidentalDeath(characterId, options) {
        if (!_hasId(characterId)) {
            return { success: false, reason: 'characterId is required.' };
        }
        if (options === undefined || options === null) options = {};
        if (!_isPlainObject(options)) {
            return { success: false, reason: 'options must be a plain object.' };
        }

        var defaults = [
            'Fell from a height',
            'Drowning',
            'Fire',
            'Hunting accident',
            'Crushed by falling object',
            'Animal attack',
            'Cart accident',
            'Building collapse'
        ];

        var year = typeof options.year === 'number'
            ? options.year
            : window.getCurrentYear();

        var detail;
        if (typeof options.accidentType === 'string' && options.accidentType.length > 0) {
            detail = options.accidentType;
        } else {
            var random = _getRandomFn(options);
            var idx = Math.floor(random() * defaults.length);
            if (idx < 0) idx = 0;
            if (idx >= defaults.length) idx = defaults.length - 1;
            detail = defaults[idx];
        }

        return killCharacter(characterId, {
            deathYear: year,
            deathCause: MR.DEATH_CAUSE.ACCIDENT,
            deathCauseDetail: detail,
            deathNotes: typeof options.notes === 'string' ? options.notes : ''
        });
    }

    // =========================================================================
    // 10. LIFESPAN ESTIMATION (DETERMINISTIC)
    // =========================================================================
    //
    // predictLifespan is a DETERMINISTIC query. It does not consume RNG.
    // Two calls for the same character return the same number. This makes
    // it safe to call from UI rendering paths.
    //
    // getExpectedRemainingYears derives from predictLifespan and the
    // character's current age.

    function predictLifespan(character) {
        if (!character || typeof character !== 'object') return null;

        var base = character.gender === 'female' ? 45 : 40;

        // Rank modifier.
        if (_hasId(character.activeRankId)
            && typeof window.getRankById === 'function') {
            var rank = window.getRankById(character.activeRankId);
            if (rank && typeof rank.priority === 'number') {
                if (rank.priority <= 2) base += 10;
                else if (rank.priority <= 3) base += 5;
            }
        }

        // Deterministic identity-hash adjustment.
        if (_hasId(character.id)) {
            var hash = 0;
            for (var i = 0; i < character.id.length; i++) {
                hash = (hash * 31 + character.id.charCodeAt(i)) | 0;
            }
            var offset = (hash % 21) - 10;
            base += offset;
        }

        if (base < 1) base = 1;
        if (base > 95) base = 95;
        return base;
    }

    function getExpectedRemainingYears(character) {
        if (!character || character.isDeceased === true) return null;
        var age = _ageOfProjection(character);
        if (age === null) return null;
        var predicted = predictLifespan(character);
        if (predicted === null) return null;
        return Math.max(0, predicted - age);
    }

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.CharacterLifecycle = {
        // Age classification
        getLifeStage: getLifeStage,
        getLifeStageName: getLifeStageName,
        getAgeGroup: getAgeGroup,
        getAllAgeGroups: getAllAgeGroups,
        getAgeGroupIndex: getAgeGroupIndex,
        isElderly: isElderly,
        groupCharactersByAgeGroup: groupCharactersByAgeGroup,

        // Time progression
        advanceMortality: advanceMortality,

        // Death commands
        killCharacter: killCharacter,
        killCharacterRandomCause: killCharacterRandomCause,
        triggerNaturalDeath: triggerNaturalDeath,
        triggerAccidentalDeath: triggerAccidentalDeath,

        // Lifespan estimation (deterministic)
        predictLifespan: predictLifespan,
        getExpectedRemainingYears: getExpectedRemainingYears
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterLifecycle;
    }
})();
