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
 *   - Provide a default death-cause catalogue
 *   - Provide a default age-banded mortality rate table
 *   - Pick a death cause from the catalogue, deterministically given a roll
 *
 * DOES NOT:
 *   - Read CharacterState
 *   - Read masterData
 *   - Save data
 *   - Mutate characters
 *   - Generate random numbers
 *   - Dispatch events
 *   - Choose a death cause by itself (it always receives a roll)
 *
 * DEATH CAUSE VOCABULARY (closed set):
 *   natural, disease, accident, murder, execution, childbed_fever, unknown
 *
 * The specific free-text cause lives in deathCauseDetail on the record.
 *
 * DEFAULT CAUSE CATALOGUE:
 *   The catalogue below describes plausible causes with weights and
 *   eligibility (age bands, gender). It is the default used by
 *   pickRandomCause when the caller does not supply its own catalogue.
 *   The caller may supply a different catalogue.
 *
 * DEFAULT RATE TABLE:
 *   The table below is a reasonable age-banded annual mortality rate.
 *   The caller may supply its own rate table through getMortalityRate.
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
    // 2. DEFAULT CAUSE CATALOGUE
    // =========================================================================
    //
    // Each entry:
    //   {
    //     cause:        stable id from DEATH_CAUSE
    //     detail:       display string, e.g. 'Fever'
    //     weight:       relative selection weight
    //     minAge:       optional, inclusive
    //     maxAge:       optional, inclusive
    //     requiresFemale: optional, only eligible for female characters
    //   }
    //
    // The weight is used by pickRandomCause. Higher = more likely.
    // The catalogue is intentionally conservative; a caller with its own
    // world model may supply a different one.

    var DEFAULT_DEATH_CAUSES = [
        // Natural
        { cause: DEATH_CAUSE.NATURAL, detail: 'Old age', weight: 30, minAge: 60 },
        { cause: DEATH_CAUSE.NATURAL, detail: 'Natural causes', weight: 20, minAge: 45 },
        { cause: DEATH_CAUSE.NATURAL, detail: 'Heart failure', weight: 8, minAge: 30 },
        { cause: DEATH_CAUSE.NATURAL, detail: 'Stroke', weight: 6, minAge: 40 },

        // Disease
        { cause: DEATH_CAUSE.DISEASE, detail: 'Fever', weight: 12 },
        { cause: DEATH_CAUSE.DISEASE, detail: 'Consumption', weight: 10 },
        { cause: DEATH_CAUSE.DISEASE, detail: 'Pneumonia', weight: 8 },
        { cause: DEATH_CAUSE.DISEASE, detail: 'Infection', weight: 6 },
        { cause: DEATH_CAUSE.DISEASE, detail: 'Dysentery', weight: 5 },
        { cause: DEATH_CAUSE.DISEASE, detail: 'Smallpox', weight: 4 },
        { cause: DEATH_CAUSE.DISEASE, detail: 'Plague', weight: 3 },

        // Accident / misadventure
        { cause: DEATH_CAUSE.ACCIDENT, detail: 'Drowning', weight: 5 },
        { cause: DEATH_CAUSE.ACCIDENT, detail: 'Fell from a height', weight: 4 },
        { cause: DEATH_CAUSE.ACCIDENT, detail: 'Hunting accident', weight: 3 },
        { cause: DEATH_CAUSE.ACCIDENT, detail: 'Fire', weight: 3 },
        { cause: DEATH_CAUSE.ACCIDENT, detail: 'Crushed by falling object', weight: 2 },
        { cause: DEATH_CAUSE.ACCIDENT, detail: 'Animal attack', weight: 3 },
        { cause: DEATH_CAUSE.ACCIDENT, detail: 'Killed in battle', weight: 4, minAge: 16 },

        // Childbed fever
        {
            cause: DEATH_CAUSE.CHILDBED_FEVER,
            detail: 'Childbed fever',
            weight: 4,
            minAge: 14,
            maxAge: 50,
            requiresFemale: true
        }
    ];

    // =========================================================================
    // 3. DEFAULT MORTALITY RATE TABLE
    // =========================================================================
    //
    // Annual mortality risk per age band. This is simulation policy,
    // not a universal truth. Callers may supply their own.

    var DEFAULT_MORTALITY_RATE_BANDS = [
        { minAge: 0,  maxAge: 0,  rate: 0.02 },
        { minAge: 1,  maxAge: 4,  rate: 0.01 },
        { minAge: 5,  maxAge: 17, rate: 0.005 },
        { minAge: 18, maxAge: 44, rate: 0.01 },
        { minAge: 45, maxAge: 59, rate: 0.02 },
        { minAge: 60, maxAge: 74, rate: 0.05 },
        { minAge: 75, maxAge: 89, rate: 0.10 },
        { minAge: 90, maxAge: Infinity, rate: 0.20 }
    ];

    // =========================================================================
    // 4. HELPERS
    // =========================================================================

    function _isValidYear(value) {
        return typeof value === 'number'
            && Number.isFinite(value)
            && Number.isInteger(value);
    }

    function _hasId(value) {
        return typeof value === 'string' && value.length > 0;
    }

    function _isValidRoll(v) {
        return typeof v === 'number'
            && Number.isFinite(v)
            && v >= 0
            && v < 1;
    }

    // =========================================================================
    // 5. AGE
    // =========================================================================

    function calculateAgeAtYear(birthYear, year) {
        if (!_isValidYear(birthYear) || !_isValidYear(year)) {
            return null;
        }
        return year - birthYear;
    }

    // =========================================================================
    // 6. YEAR VALIDATION
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
    // 7. LIFE-STATE TRANSITION
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
    // 8. DEATH CAUSE
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
    // 9. FULL DEATH VALIDATION
    // =========================================================================

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
    // 10. CAUSE ELIGIBILITY
    // =========================================================================

    /**
     * Evaluates whether a particular cause is eligible for a character,
     * given explicit policy facts.
     *
     * If policy is undefined, the default policy derived from
     * DEFAULT_DEATH_CAUSES is used. Callers may supply their own.
     *
     * facts:
     *   { gender, age, isPregnant, isChildbirthRelated }
     *
     * policy:
     *   {
     *     requiresFemale,
     *     minAge,
     *     maxAge,
     *     requiresPregnancy,
     *     requiresChildbirth
     *   }
     */
    function isCauseEligible(facts, policy) {
        var errors = [];

        if (!facts || typeof facts !== 'object') {
            return { valid: false, errors: ['missing_facts'] };
        }
        if (policy === undefined || policy === null) {
            policy = {};
        }
        if (typeof policy !== 'object') {
            return { valid: false, errors: ['invalid_cause_policy'] };
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
    // 11. MORTALITY ROLL
    // =========================================================================

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

        if (!_isValidRoll(roll)) {
            return { valid: false, dies: false, errors: ['invalid_roll'] };
        }

        return {
            valid: true,
            dies: roll < facts.mortalityRate,
            errors: []
        };
    }

    // =========================================================================
    // 12. MORTALITY RATE LOOKUP
    // =========================================================================

    /**
     * Looks up a mortality rate from explicit age bands.
     * When bands is not supplied, DEFAULT_MORTALITY_RATE_BANDS is used.
     */
    function getMortalityRate(age, bands) {
        if (typeof age !== 'number' || !Number.isFinite(age)) return null;
        if (!Array.isArray(bands)) bands = DEFAULT_MORTALITY_RATE_BANDS;

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

    function getDefaultMortalityRate(age) {
        return getMortalityRate(age, DEFAULT_MORTALITY_RATE_BANDS);
    }

    // =========================================================================
    // 13. CAUSE CATALOGUE
    // =========================================================================

    function getDefaultCauseCatalogue() {
        // Return a deep copy so callers cannot mutate the canonical list.
        var out = [];
        for (var i = 0; i < DEFAULT_DEATH_CAUSES.length; i++) {
            var e = DEFAULT_DEATH_CAUSES[i];
            out.push({
                cause: e.cause,
                detail: e.detail,
                weight: e.weight,
                minAge: typeof e.minAge === 'number' ? e.minAge : undefined,
                maxAge: typeof e.maxAge === 'number' ? e.maxAge : undefined,
                requiresFemale: e.requiresFemale === true
            });
        }
        return out;
    }

    /**
     * Returns the entries in a catalogue eligible for the given facts.
     * facts: { age, gender }
     */
    function getEligibleCauses(facts, catalogue) {
        if (!facts || typeof facts !== 'object') return [];
        var list = Array.isArray(catalogue) ? catalogue : DEFAULT_DEATH_CAUSES;
        var out = [];
        for (var i = 0; i < list.length; i++) {
            var e = list[i];
            if (!e) continue;
            if (typeof e.weight !== 'number' || e.weight <= 0) continue;
            if (typeof e.minAge === 'number'
                && (typeof facts.age !== 'number' || facts.age < e.minAge)) {
                continue;
            }
            if (typeof e.maxAge === 'number'
                && (typeof facts.age !== 'number' || facts.age > e.maxAge)) {
                continue;
            }
            if (e.requiresFemale === true && facts.gender !== 'female') {
                continue;
            }
            out.push(e);
        }
        return out;
    }

    /**
     * Picks a death cause from the eligible set, deterministically given
     * a supplied roll in [0, 1). No randomness occurs here.
     *
     * facts:     { age, gender }
     * roll:      number in [0, 1)
     * catalogue: optional array; defaults to DEFAULT_DEATH_CAUSES
     *
     * Returns { cause, detail } or null.
     */
    function pickRandomCause(facts, roll, catalogue) {
        if (!_isValidRoll(roll)) return null;
        var eligible = getEligibleCauses(facts, catalogue);
        if (eligible.length === 0) return null;

        var total = 0;
        for (var i = 0; i < eligible.length; i++) total += eligible[i].weight;
        if (total <= 0) return null;

        var target = roll * total;
        var acc = 0;
        for (var j = 0; j < eligible.length; j++) {
            acc += eligible[j].weight;
            if (target < acc) {
                return {
                    cause: eligible[j].cause,
                    detail: eligible[j].detail
                };
            }
        }
        // Floating-point safety: last entry.
        return {
            cause: eligible[eligible.length - 1].cause,
            detail: eligible[eligible.length - 1].detail
        };
    }

    // =========================================================================
    // 14. DEATH RECORD PROJECTION VALIDATION
    // =========================================================================

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
    // 15. EXPORTS
    // =========================================================================

    window.MortalityRules = {
        DEATH_CAUSE: DEATH_CAUSE,
        MORTALITY_STATUS: MORTALITY_STATUS,
        DEATH_CATEGORY: DEATH_CATEGORY,

        DEFAULT_MORTALITY_RATE_BANDS: DEFAULT_MORTALITY_RATE_BANDS,

        calculateAgeAtYear: calculateAgeAtYear,
        validateDeathYear: validateDeathYear,
        canDie: canDie,

        isValidDeathCause: isValidDeathCause,
        classifyDeathCause: classifyDeathCause,
        validateDeath: validateDeath,

        isCauseEligible: isCauseEligible,

        evaluateMortalityRoll: evaluateMortalityRoll,
        getMortalityRate: getMortalityRate,
        getDefaultMortalityRate: getDefaultMortalityRate,

        getDefaultCauseCatalogue: getDefaultCauseCatalogue,
        getEligibleCauses: getEligibleCauses,
        pickRandomCause: pickRandomCause,

        validateDeathRecord: validateDeathRecord
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.MortalityRules;
    }
})();
