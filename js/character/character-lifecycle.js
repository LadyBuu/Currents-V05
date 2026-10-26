/**
 * =============================================================================
 * STILL WATERS - CHARACTER LIFECYCLE (js/character/character-lifecycle.js)
 * =============================================================================
 *
 * LOCATION: js/character/character-lifecycle.js
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
 *   - Dispatch cross-domain consequences:
 *       - family consequences via FamilyCommands.handleCharacterDeath
 *       - relationship consequences via RelationshipIntegration.handleCharacterDeath
 *       - rank consequences via RankIssues.handleCharacterDeath
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
 *   - Relationship termination logic   -> relationship-integration.js
 *   - Rank deprecation logic           -> rank-issues.js
 *
 * CONTRACT:
 *   - One year of progression is processed per iteration. A multi-year
 *     advance evaluates each year in sequence, using that year's age
 *     and that year's rate.
 *   - Randomness is injected. Callers supply `options.random` (returns
 *     [0, 1)). When absent, Math.random is used. Rules are deterministic.
 *   - The death mutation goes through CharacterCommands.markDeceased
 *     exactly once per death, with the SIMULATED year passed as
 *     referenceYear. This is required: markDeceased validates
 *     deathYear <= referenceYear, and during a multi-year advance the
 *     simulated year is ahead of wall-clock current year. Passing the
 *     wall-clock year would reject every death after the first
 *     simulated year.
 *   - The death cause is a stable id. Detail text is passed separately.
 *   - Life stage helpers accept either a character projection or a
 *     numeric age. They never reach into state for a missing birth year.
 *
 * CROSS-DOMAIN DEATH DISPATCH:
 *   After CharacterCommands.markDeceased succeeds, three subsystems are
 *   notified, in this order:
 *
 *     1. FamilyCommands.handleCharacterDeath
 *     2. RelationshipIntegration.handleCharacterDeath
 *     3. RankIssues.handleCharacterDeath
 *
 *   Each is called if and only if the module and method are present.
 *   Failures are swallowed; the death has already been written and the
 *   cascade proceeds. The death operation is NOT transactional across
 *   domains. This is deliberate: each domain owns its own state, and a
 *   failure in one subsystem's cleanup must not prevent another's.
 *
 *   The dispatch is centralised in _dispatchDeathEffects, which is
 *   called from both _die (simulation path) and killCharacter (command
 *   path). This ensures the two paths cannot drift. In particular,
 *   children-commands.js routes maternal death through killCharacter,
 *   and therefore through the same dispatch — family edges, rank
 *   assignments, and relationships are all cleaned up consistently
 *   regardless of how the death was triggered.
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
 *   - family-commands.js:              FamilyCommands.handleCharacterDeath
 *   - relationships/relationship-integration.js:
 *                                       RelationshipIntegration.handleCharacterDeath
 *   - ranks/rank-issues.js:            RankIssues.handleCharacterDeath
 *   - event-log.js:                    logEvent
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
    // 2. CROSS-DOMAIN DEATH DISPATCH
    // =========================================================================
    //
    // Called exactly once per successful death, from _die and
    // killCharacter. Family is notified first, then relationship, then
    // rank. Each call is guarded: if the module or method is absent, that
    // subsystem is skipped.
    //
    // Failures inside a sub-dispatch are swallowed. Each subsystem owns
    // its own state; a failure in one must not prevent the others from
    // running.

    function _notifyCrossDomainDeath(characterId, year) {
        if (!_hasId(characterId)) return;
        if (typeof year !== 'number' || !Number.isFinite(year)) {
            year = window.getCurrentYear();
        }

        // Family: structural parentage edges. Notified first because
        // parent-child edges are structural and unrelated to the
        // relationship or rank state.
        if (window.FamilyCommands
            && typeof window.FamilyCommands.handleCharacterDeath === 'function') {
            window.FamilyCommands.handleCharacterDeath(characterId, year);
        }

        // Relationship: end every active edge. Committed relationships
        // become widowed; others end. Notified before rank because rank
        // inheritance sources may resolve through a spouse who has just
        // died.
        //
        // Module name is RelationshipIntegration (singular), matching
        // the exported namespace of relationships/relationship-integration.js.
        // Earlier revisions referenced the plural form; that module never
        // existed. The singular form is the correct name.
        if (window.RelationshipIntegration
            && typeof window.RelationshipIntegration.handleCharacterDeath === 'function') {
            window.RelationshipIntegration.handleCharacterDeath(characterId, {
                deathYear: year
            });
        }

        // Rank: deprecate any rank assignment with deprecateOnDeath, then
        // renumber the affected ranks. Notified last so it reads the
        // freshest relationship state.
        if (window.RankIssues
            && typeof window.RankIssues.handleCharacterDeath === 'function') {
            window.RankIssues.handleCharacterDeath(characterId, {
                deathYear: year
            });
        }
    }

    /**
     * Logs the death event and dispatches cross-domain consequences.
     * Shared by the simulation path (_die) and the command path
     * (killCharacter). Keeping this in one place is what guarantees the
     * two paths cannot drift.
     *
     * The death itself must already have been written via markDeceased
     * before this is called.
     */
    function _dispatchDeathEffects(character, year, cause, causeDetail) {
        if (!character) return;
        if (typeof year !== 'number' || !Number.isFinite(year)) {
            year = window.getCurrentYear();
        }

        var name = typeof character.name === 'string' ? character.name : '';
        var causeStr = typeof cause === 'string' && cause.length > 0
            ? cause
            : 'unknown';
        var detailStr = typeof causeDetail === 'string' && causeDetail.length > 0
            ? ' (' + causeDetail + ')'
            : '';

        _logEvent('death', 'Death',
            name + ' died of ' + causeStr + detailStr + ' in ' + year,
            [character]);

        _notifyCrossDomainDeath(character.id, year);
    }

    /**
     * Calls CharacterCommands.markDeceased with the referenceYear option
     * set to the simulated (or explicit) death year. This is the ONLY
     * path from this module to markDeceased; it exists so we cannot
     * accidentally omit referenceYear and re-introduce the multi-year
     * validation bug.
     */
    function _markDeceasedWithReferenceYear(characterId, deathData, referenceYear) {
        return CC.markDeceased(characterId, deathData, {
            referenceYear: referenceYear
        });
    }

    // =========================================================================
    // 3. LIFE STAGE CLASSIFICATION
    // =========================================================================

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
    // 4. AGE GROUP CLASSIFICATION
    // =========================================================================

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

    function isElderly(charOrAge) {
        var age = _resolveAge(charOrAge);
        if (age === null) return null;
        return age >= 60;
    }

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
    // 5. DEATH CAUSE SELECTION
    // =========================================================================

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
    // 6. MORTALITY RATE
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
    // 7. PER-CHARACTER MORTALITY EVALUATION
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
    // 8. DEATH TRANSITION (SIMULATION PATH)
    // =========================================================================

    function _die(character, year, evaluation) {
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

        var deathResult = _markDeceasedWithReferenceYear(
            character.id,
            deathData,
            year
        );
        if (!deathResult || deathResult.success !== true) {
            throw new Error(
                'character-lifecycle.js: markDeceased failed for '
                + character.id
                + ': '
                + (deathResult && deathResult.reason ? deathResult.reason : 'unknown')
            );
        }

        _dispatchDeathEffects(
            character,
            year,
            evaluation.cause,
            evaluation.causeDetail
        );

        return deathResult;
    }

    // =========================================================================
    // 9. TIME PROGRESSION
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

                _die(live, year, evaluation);
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
    // 10. PUBLIC DEATH COMMANDS
    // =========================================================================

    /**
     * Kills a specific character with explicit death data.
     *
     * Thin wrapper around CharacterCommands.markDeceased that:
     *   - passes the death year as referenceYear (so simulation-driven
     *     deaths from children-commands work correctly),
     *   - dispatches cross-domain consequences (family + relationship
     *     + rank),
     *   - logs the death event.
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

        var year = typeof deathData.deathYear === 'number'
            ? deathData.deathYear
            : window.getCurrentYear();

        var result = _markDeceasedWithReferenceYear(characterId, deathData, year);
        if (!result || result.success !== true) {
            return {
                success: false,
                reason: result && result.reason ? result.reason : 'markDeceased failed.'
            };
        }

        _dispatchDeathEffects(
            character,
            year,
            deathData.deathCause,
            deathData.deathCauseDetail
        );

        return result;
    }

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
    // 11. LIFESPAN ESTIMATION (DETERMINISTIC)
    // =========================================================================

    function predictLifespan(character) {
        if (!character || typeof character !== 'object') return null;

        var base = character.gender === 'female' ? 45 : 40;

        if (_hasId(character.activeRankId)
            && typeof window.getRankById === 'function') {
            var rank = window.getRankById(character.activeRankId);
            if (rank && typeof rank.priority === 'number') {
                if (rank.priority <= 2) base += 10;
                else if (rank.priority <= 3) base += 5;
            }
        }

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
    // 12. EXPORTS
    // =========================================================================

    window.CharacterLifecycle = {
        getLifeStage: getLifeStage,
        getLifeStageName: getLifeStageName,
        getAgeGroup: getAgeGroup,
        getAllAgeGroups: getAllAgeGroups,
        getAgeGroupIndex: getAgeGroupIndex,
        isElderly: isElderly,
        groupCharactersByAgeGroup: groupCharactersByAgeGroup,

        advanceMortality: advanceMortality,

        killCharacter: killCharacter,
        killCharacterRandomCause: killCharacterRandomCause,
        triggerNaturalDeath: triggerNaturalDeath,
        triggerAccidentalDeath: triggerAccidentalDeath,

        predictLifespan: predictLifespan,
        getExpectedRemainingYears: getExpectedRemainingYears
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterLifecycle;
    }
})();
