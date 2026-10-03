/**
 * =============================================================================
 * STILL WATERS - MORTALITY RULES (js/character/mortality-rules.js)
 * =============================================================================
 *
 * Pure mortality policy.
 *
 * RESPONSIBILITIES:
 *   - Validate death transitions
 *   - Validate death years
 *   - Validate death causes
 *   - Determine mortality eligibility from explicit facts
 *   - Determine age-at-death from explicit years
 *   - Validate cause-specific eligibility
 *   - Classify mortality circumstances
 *
 * DOES NOT:
 *   - Read CharacterState
 *   - Read masterData
 *   - Save data
 *   - Mutate characters
 *   - Generate random numbers
 *   - Dispatch events
 *   - Choose a death cause by itself
 *
 * Randomness belongs to the caller. This module evaluates a supplied
 * random roll against supplied mortality policy.
 *
 * DEATH CAUSE VOCABULARY (closed set):
 *   natural         — old age, peaceful death, unspecified natural
 *   disease         — fever, plague, pneumonia, infection, etc.
 *   accident        — fall, drowning, fire, animal attack, war, suicide
 *   murder          — killed by another character
 *   execution       — judicial killing
 *   childbed_fever  — maternal death in childbirth
 *   unknown         — explicit "we don't know"
 *
 * The specific free-text cause lives in deathCauseDetail on the record.
 *
 * DEPENDENCIES (REQUIRED): None.
 *   This module is pure and can load before any other module in the
 *   character subsystem.
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. VOCABULARY
    // =========================================================================

    var DEATH_CAUSE = {
        NATURAL: 'natural',
        DISEASE: 'disease',
        ACCIDENT: 'accident',
        MURDER: 'murder',
        EXECUTION: 'execution',
        CHILDBED_FEVER: 'childbed_fever',
        UNKNOWN: 'unknown'
    };

    var MORTALITY_STATUS = {
        LIVING: 'living',
        DECEASED: 'deceased'
    };

    var DEATH_CATEGORY = {
        NATURAL: 'natural',
        MEDICAL: 'medical',
        VIOLENT: 'violent',
        EXECUTION: 'execution',
        UNKNOWN: 'unknown'
    };

    // =========================================================================
    // 2. HELPERS
    // =========================================================================

    function _isValidYear(value) {
        return typeof value === 'number'
            && Number.isFinite(value)
            && Number.isInteger(value);
    }

    function _hasId(value) {
        return typeof value === 'string' && value.length > 0;
    }

    // =========================================================================
    // 3. AGE
    // =========================================================================

    function calculateAgeAtYear(birthYear, year) {
        if (!_isValidYear(birthYear) || !_isValidYear(year)) {
            return null;
        }
        return year - birthYear;
    }

    // =========================================================================
    // 4. YEAR VALIDATION
    // =========================================================================

    function validateDeathYear(facts) {
        var errors = [];

        if (!facts || typeof facts !== 'object') {
            return { valid: false, errors: ['missing_facts'] };
        }

        if (!_isValidYear(facts.birthYear)) errors.push('invalid_birth_year');
        if (!_isValidYear(facts.deathYear)) errors.push('invalid_death_year');

        if (_isValidYear(facts.birthYear)
            && _isValidYear(facts.deathYear)
            && facts.deathYear < facts.birthYear) {
            errors.push('death_before_birth');
        }

        if (_isValidYear(facts.currentYear)
            && _isValidYear(facts.deathYear)
            && facts.deathYear > facts.currentYear) {
            errors.push('death_after_current_year');
        }

        return { valid: errors.length === 0, errors: errors };
    }

    // =========================================================================
    // 5. LIFE-STATE TRANSITION
    // =========================================================================

    function canDie(facts) {
        var errors = [];

        if (!facts || typeof facts !== 'object') {
            return { valid: false, errors: ['missing_facts'] };
        }

        if (!_hasId(facts.characterId)) errors.push('missing_character_id');
        if (facts.isDeceased === true) errors.push('already_deceased');

        var yearResult = validateDeathYear(facts);
        for (var i = 0; i < yearResult.errors.length; i++) {
            errors.push(yearResult.errors[i]);
        }

        return { valid: errors.length === 0, errors: errors };
    }

    // =========================================================================
    // 6. DEATH CAUSE
    // =========================================================================

    function isValidDeathCause(cause) {
        return cause === DEATH_CAUSE.NATURAL
            || cause === DEATH_CAUSE.DISEASE
            || cause === DEATH_CAUSE.ACCIDENT
            || cause === DEATH_CAUSE.MURDER
            || cause === DEATH_CAUSE.EXECUTION
            || cause === DEATH_CAUSE.CHILDBED_FEVER
            || cause === DEATH_CAUSE.UNKNOWN;
    }

    function classifyDeathCause(cause) {
        if (cause === DEATH_CAUSE.MURDER || cause === DEATH_CAUSE.ACCIDENT) {
            return DEATH_CATEGORY.VIOLENT;
        }
        if (cause === DEATH_CAUSE.EXECUTION) {
            return DEATH_CATEGORY.EXECUTION;
        }
        if (cause === DEATH_CAUSE.CHILDBED_FEVER || cause === DEATH_CAUSE.DISEASE) {
            return DEATH_CATEGORY.MEDICAL;
        }
        if (cause === DEATH_CAUSE.NATURAL) {
            return DEATH_CATEGORY.NATURAL;
        }
        return DEATH_CATEGORY.UNKNOWN;
    }

    // =========================================================================
    // 7. FULL DEATH VALIDATION
    // =========================================================================

    /**
     * Validates a full set of death facts.
     *
     * facts:
     * {
     *   characterId,
     *   isDeceased,       boolean; must not be true
     *   birthYear,        number; required
     *   deathYear,        number; required
     *   currentYear,      number; required
     *   deathCause,       string; required, must be a valid cause
     *   isMurder,         boolean | undefined
     *   killerId,         string | null | undefined
     *   isExecution,      boolean | undefined
     *   executionReason,  string | null | undefined
     * }
     */
    function validateDeath(facts) {
        var errors = [];

        if (!facts || typeof facts !== 'object') {
            return { valid: false, errors: ['missing_facts'] };
        }

        if (!_hasId(facts.characterId)) errors.push('missing_character_id');
        if (facts.isDeceased === true) errors.push('already_deceased');
        if (!isValidDeathCause(facts.deathCause)) errors.push('invalid_death_cause');

        var yearResult = validateDeathYear(facts);
        for (var i = 0; i < yearResult.errors.length; i++) {
            errors.push(yearResult.errors[i]);
        }

        if (facts.isMurder === true
            && facts.deathCause !== DEATH_CAUSE.MURDER) {
            errors.push('murder_cause_mismatch');
        }
        if (facts.isMurder === true && !_hasId(facts.killerId)) {
            errors.push('murder_missing_killer');
        }

        if (facts.isExecution === true
            && facts.deathCause !== DEATH_CAUSE.EXECUTION) {
            errors.push('execution_cause_mismatch');
        }
        if (facts.isExecution === true && !_hasId(facts.executionReason)) {
            errors.push('execution_missing_reason');
        }

        return { valid: errors.length === 0, errors: errors };
    }

    // =========================================================================
    // 8. CAUSE ELIGIBILITY
    // =========================================================================

    /**
     * Evaluates whether a particular cause is eligible for a character,
     * given explicit policy facts.
     *
     * facts:
     * {
     *   gender,
     *   age,
     *   isPregnant,
     *   isChildbirthRelated
     * }
     *
     * policy:
     * {
     *   requiresFemale,       boolean
     *   minAge,               number
     *   maxAge,               number
     *   requiresPregnancy,    boolean
     *   requiresChildbirth,   boolean
     * }
     *
     * No hard-coded biological assumptions here. Callers supply the policy.
     */
    function isCauseEligible(facts, policy) {
        var errors = [];

        if (!facts || typeof facts !== 'object') {
            return { valid: false, errors: ['missing_facts'] };
        }
        if (!policy || typeof policy !== 'object') {
            return { valid: false, errors: ['missing_cause_policy'] };
        }

        if (policy.requiresFemale === true && facts.gender !== 'female') {
            errors.push('requires_female');
        }
        if (typeof policy.minAge === 'number') {
            if (typeof facts.age !== 'number' || facts.age < policy.minAge) {
                errors.push('below_minimum_age');
            }
        }
        if (typeof policy.maxAge === 'number') {
            if (typeof facts.age !== 'number' || facts.age > policy.maxAge) {
                errors.push('above_maximum_age');
            }
        }
        if (policy.requiresPregnancy === true && facts.isPregnant !== true) {
            errors.push('requires_pregnancy');
        }
        if (policy.requiresChildbirth === true
            && facts.isChildbirthRelated !== true) {
            errors.push('requires_childbirth');
        }

        return { valid: errors.length === 0, errors: errors };
    }

    // =========================================================================
    // 9. MORTALITY ROLL
    // =========================================================================

    /**
     * Evaluates a supplied mortality roll. The caller supplies the rate
     * and the roll. No randomness occurs here.
     *
     * facts: { age, mortalityRate }
     * roll:  number in [0, 1)
     */
    function evaluateMortalityRoll(facts, roll) {
        if (!facts || typeof facts !== 'object') {
            return { valid: false, dies: false, errors: ['missing_facts'] };
        }

        if (typeof facts.mortalityRate !== 'number'
            || !Number.isFinite(facts.mortalityRate)
            || facts.mortalityRate < 0
            || facts.mortalityRate > 1) {
            return { valid: false, dies: false, errors: ['invalid_mortality_rate'] };
        }

        if (typeof roll !== 'number'
            || !Number.isFinite(roll)
            || roll < 0
            || roll >= 1) {
            return { valid: false, dies: false, errors: ['invalid_roll'] };
        }

        return {
            valid: true,
            dies: roll < facts.mortalityRate,
            errors: []
        };
    }

    // =========================================================================
    // 10. MORTALITY RATE LOOKUP
    // =========================================================================

    /**
     * Looks up a mortality rate from explicit age bands.
     *
     * bands: [{ minAge, maxAge, rate }, ...]
     */
    function getMortalityRate(age, bands) {
        if (typeof age !== 'number' || !Number.isFinite(age)) return null;
        if (!Array.isArray(bands)) return null;

        for (var i = 0; i < bands.length; i++) {
            var band = bands[i];
            if (!band || typeof band !== 'object') continue;
            if (typeof band.minAge !== 'number'
                || typeof band.maxAge !== 'number'
                || typeof band.rate !== 'number') {
                continue;
            }
            if (age >= band.minAge && age <= band.maxAge) {
                return band.rate;
            }
        }
        return null;
    }

    // =========================================================================
    // 11. DEATH RECORD PROJECTION VALIDATION
    // =========================================================================

    /**
     * Validates a death record projection produced by MortalityQueries.
     * Used to catch corrupted records before consumers rely on them.
     */
    function validateDeathRecord(record) {
        var errors = [];

        if (!record || typeof record !== 'object') {
            return { valid: false, errors: ['missing_record'] };
        }

        if (!_hasId(record.characterId)) errors.push('missing_character_id');
        if (!_isValidYear(record.deathYear)) errors.push('invalid_death_year');
        if (!isValidDeathCause(record.deathCause)) errors.push('invalid_death_cause');

        if (record.isMurder === true && record.deathCause !== DEATH_CAUSE.MURDER) {
            errors.push('murder_cause_mismatch');
        }
        if (record.isExecution === true && record.deathCause !== DEATH_CAUSE.EXECUTION) {
            errors.push('execution_cause_mismatch');
        }
        if (record.deathCause === DEATH_CAUSE.MURDER && !_hasId(record.killerId)) {
            errors.push('murder_missing_killer');
        }

        return { valid: errors.length === 0, errors: errors };
    }

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    window.MortalityRules = {
        DEATH_CAUSE: DEATH_CAUSE,
        MORTALITY_STATUS: MORTALITY_STATUS,
        DEATH_CATEGORY: DEATH_CATEGORY,

        calculateAgeAtYear: calculateAgeAtYear,
        validateDeathYear: validateDeathYear,
        canDie: canDie,

        isValidDeathCause: isValidDeathCause,
        classifyDeathCause: classifyDeathCause,
        validateDeath: validateDeath,

        isCauseEligible: isCauseEligible,

        evaluateMortalityRoll: evaluateMortalityRoll,
        getMortalityRate: getMortalityRate,

        validateDeathRecord: validateDeathRecord
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.MortalityRules;
    }
})();
