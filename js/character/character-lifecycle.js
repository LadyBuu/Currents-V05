/**
 * =============================================================================
 * STILL WATERS - CHARACTER LIFECYCLE (js/character/character-lifecycle.js)
 * =============================================================================
 *
 * Time progression and mortality orchestration for the character domain.
 *
 * SCOPE:
 *   - Advance simulation time by N years
 *   - Evaluate mortality per year per character
 *   - Choose a death cause
 *   - Build a canonical death transition
 *   - Delegate the mutation to CharacterCommands.markDeceased
 *   - Post-death consequence dispatch to family (and, later, to
 *     succession, relationships, rank, household)
 *
 * OUT OF SCOPE:
 *   - Mortality policy               -> mortality-rules.js
 *   - Canonical character mutation   -> character-commands.js
 *   - Death reads                    -> mortality-queries.js
 *   - Aggregate statistics           -> mortality-statistics.js
 *   - Childbirth orchestration       -> future children domain
 *   - Succession / inheritance       -> future succession domain
 *
 * CONTRACT:
 *   - One year of progression is processed per iteration. A multi-year
 *     advance does NOT evaluate everyone against a single rate; it
 *     evaluates each year in sequence. This fixes the historical bug
 *     where a multi-year advance evaluated against the wrong year.
 *   - Randomness is injected. Callers supply `options.random` (returns
 *     [0, 1)). When absent, Math.random is used. Rules are deterministic.
 *   - The death mutation goes through CharacterCommands.markDeceased
 *     exactly once per death.
 *   - The death cause is a stable id. Detail text is passed separately.
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

    // =========================================================================
    // 2. DEATH CAUSE CHOICE
    // =========================================================================
    //
    // The default cause chooser is deliberately minimal: it returns a
    // stable id and, optionally, a detail string. Callers who need a
    // richer choice (age-banded tables, world-specific catalogues) pass
    // options.chooseDeathCause.
    //
    // The default chooser will be replaced by the caller when this
    // system ships into a real simulation.

    function _defaultChooseDeathCause(character, age, year) {
        return {
            deathCause: MR.DEATH_CAUSE.NATURAL,
            deathCauseDetail: 'Old age'
        };
    }

    // =========================================================================
    // 3. PER-CHARACTER MORTALITY EVALUATION
    // =========================================================================

    /**
     * Evaluates one character for one year.
     *
     * Returns:
     *   { died: false } when the roll does not kill the character
     *   { died: true, record: {...} } when the character dies
     */
    function _evaluateCharacterForYear(character, year, options) {
        var age = MR.calculateAgeAtYear(character.birthYear, year);
        if (age === null) {
            return { died: false, reason: 'invalid_birth_year' };
        }

        var mortalityRate = null;
        if (typeof options.getMortalityRate === 'function') {
            mortalityRate = options.getMortalityRate(character, age, year);
        }
        if (typeof mortalityRate !== 'number' || !Number.isFinite(mortalityRate)) {
            return { died: false, reason: 'no_rate' };
        }

        var random = _getRandomFn(options);
        var roll = random();

        var result = MR.evaluateMortalityRoll(
            { age: age, mortalityRate: mortalityRate },
            roll
        );
        if (!result.valid) {
            return { died: false, reason: 'invalid_evaluation' };
        }
        if (!result.dies) {
            return { died: false };
        }

        var chooser = typeof options.chooseDeathCause === 'function'
            ? options.chooseDeathCause
            : _defaultChooseDeathCause;
        var choice = chooser(character, age, year);

        if (!choice || typeof choice !== 'object') {
            return { died: false, reason: 'invalid_cause_choice' };
        }
        if (!MR.isValidDeathCause(choice.deathCause)) {
            return { died: false, reason: 'invalid_cause' };
        }

        return {
            died: true,
            cause: choice.deathCause,
            causeDetail: typeof choice.deathCauseDetail === 'string'
                ? choice.deathCauseDetail
                : '',
            ageAtDeath: age
        };
    }

    // =========================================================================
    // 4. DEATH TRANSITION
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
    // 5. TIME PROGRESSION
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
    // 6. PUBLIC DEATH COMMAND
    // =========================================================================

    /**
     * Kills a specific character with explicit death data.
     * Thin wrapper around CharacterCommands.markDeceased that adds
     * lifecycle-level dispatch (family consequences) and event logging.
     *
     * deathData:
     * {
     *   deathYear,
     *   deathCause,             required; stable id
     *   deathCauseDetail,       optional free text
     *   deathNotes,             optional
     *   isMurder,               optional boolean
     *   killerId,               optional string
     *   murderMotive,           optional
     *   murderMethod,           optional
     *   isExecution,            optional boolean
     *   executionReason,        optional string
     *   executionMethod,        optional string
     *   executionLocation,      optional string
     * }
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

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.CharacterLifecycle = {
        advanceMortality: advanceMortality,
        killCharacter: killCharacter
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterLifecycle;
    }
})();
