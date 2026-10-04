/**
 * =============================================================================
 * STILL WATERS - CHILDREN RULES (js/character/children-rules.js)
 * =============================================================================
 *
 * Pure policy for fertility, pregnancy, birth, surrogacy, and adoption
 * metadata.
 *
 * RESPONSIBILITIES:
 *   - Fertility age eligibility
 *   - Conception chance from explicit facts
 *   - Pregnancy complication / miscarriage / stillbirth / maternal death
 *     evaluation against supplied random rolls
 *   - Multiple-birth eligibility
 *   - Pregnancy outcome classification
 *   - Surrogacy arrangement validation
 *   - Adoption metadata validation (type, year, status)
 *   - Birth record validation
 *
 * DOES NOT:
 *   - Read CharacterState, ChildrenState, or masterData
 *   - Save data
 *   - Mutate characters
 *   - Generate random numbers
 *   - Dispatch events
 *   - Choose a pregnancy outcome by itself
 *
 * Randomness belongs to the caller. This module evaluates supplied rolls
 * against supplied policy.
 *
 * LEGITIMIZATION:
 *   Legitimization is deliberately absent. It requires canonical
 *   legitimacy state this codebase does not define. When legitimacy state
 *   exists, it gets its own rules module.
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

    var FERTILITY_CONSTANTS = {
        MIN_FERTILE_AGE: 14,
        MAX_FERTILE_AGE: 47,
        MIN_FATHER_AGE: 12,
        MAX_FATHER_AGE: 90,

        MULTIPLE_BIRTH_CHANCE: 0.02,
        TRIPLET_CHANCE: 0.002
    };

    var ADOPTION_TYPE = {
        LEGAL: 'legal',
        GUARDIANSHIP: 'guardianship',
        FOSTER: 'foster'
    };

    var ADOPTION_STATUS = {
        ACTIVE: 'active',
        ENDED: 'ended',
        DISSOLVED: 'dissolved'
    };

    var SURROGACY_TYPE = {
        TRADITIONAL: 'traditional',
        GESTATIONAL: 'gestational'
    };

    var SURROGACY_STATUS = {
        ACTIVE: 'active',
        COMPLETED: 'completed',
        CANCELLED: 'cancelled'
    };

    var PREGNANCY_OUTCOME = {
        NONE: 'none',
        MISCARRIAGE: 'miscarriage',
        STILLBIRTH: 'stillbirth',
        LIVE_BIRTH: 'live_birth'
    };

    // =========================================================================
    // 2. HELPERS
    // =========================================================================

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isValidYear(v) {
        return typeof v === 'number'
            && Number.isFinite(v)
            && Number.isInteger(v);
    }

    function _isValidRoll(v) {
        return typeof v === 'number'
            && Number.isFinite(v)
            && v >= 0
            && v < 1;
    }

    function _isValidChance(v) {
        return typeof v === 'number'
            && Number.isFinite(v)
            && v >= 0
            && v <= 1;
    }

    // =========================================================================
    // 3. FERTILITY
    // =========================================================================

    function getFertilityAgeModifier(age) {
        if (typeof age !== 'number' || !Number.isFinite(age)) return 0;
        if (age < FERTILITY_CONSTANTS.MIN_FERTILE_AGE) return 0;
        if (age > FERTILITY_CONSTANTS.MAX_FERTILE_AGE) return 0;
        if (age <= 25) return 1.0;
        if (age <= 30) return 0.9;
        if (age <= 35) return 0.7;
        if (age <= 40) return 0.4;
        if (age <= 45) return 0.2;
        return 0.1;
    }

    function getFatherAgeModifier(age) {
        if (typeof age !== 'number' || !Number.isFinite(age)) return 1.0;
        if (age < FERTILITY_CONSTANTS.MIN_FATHER_AGE) return 0;
        if (age > FERTILITY_CONSTANTS.MAX_FATHER_AGE) return 0;
        if (age > 50) return 0.7;
        if (age > 60) return 0.5;
        if (age > 70) return 0.3;
        return 1.0;
    }

    /**
     * facts:
     * {
     *   motherAge, motherGender, motherIsDeceased,
     *   fatherAge, fatherGender,
     *   baseChance,          optional; default 0.20
     *   modifier             optional; caller-supplied fertility modifier
     * }
     */
    function canConceive(facts) {
        var errors = [];
        if (!facts || typeof facts !== 'object') {
            return { valid: false, errors: ['missing_facts'] };
        }
        if (facts.motherGender !== 'female') errors.push('mother_not_female');
        if (facts.motherIsDeceased === true) errors.push('mother_deceased');
        if (typeof facts.motherAge !== 'number') {
            errors.push('missing_mother_age');
        } else {
            if (facts.motherAge < FERTILITY_CONSTANTS.MIN_FERTILE_AGE) {
                errors.push('mother_too_young');
            }
            if (facts.motherAge > FERTILITY_CONSTANTS.MAX_FERTILE_AGE) {
                errors.push('mother_too_old');
            }
        }
        if (typeof facts.fatherAge === 'number') {
            if (facts.fatherAge < FERTILITY_CONSTANTS.MIN_FATHER_AGE) {
                errors.push('father_too_young');
            }
            if (facts.fatherAge > FERTILITY_CONSTANTS.MAX_FATHER_AGE) {
                errors.push('father_too_old');
            }
        }
        return { valid: errors.length === 0, errors: errors };
    }

    /**
     * Computes conception chance. Caller supplies the mother's age,
     * father's age, and a fertility modifier from external sources
     * (traits, world state). No randomness.
     */
    function getConceptionChance(facts) {
        if (!facts || typeof facts !== 'object') return null;
        if (typeof facts.motherAge !== 'number') return null;

        var base = typeof facts.baseChance === 'number'
            ? facts.baseChance
            : 0.20;

        var motherModifier = getFertilityAgeModifier(facts.motherAge);
        if (motherModifier === 0) return 0;

        var fatherModifier = typeof facts.fatherAge === 'number'
            ? getFatherAgeModifier(facts.fatherAge)
            : 1.0;
        if (fatherModifier === 0) return 0;

        var externalModifier = typeof facts.modifier === 'number'
            && Number.isFinite(facts.modifier)
            && facts.modifier >= 0
            ? facts.modifier
            : 1.0;

        var chance = base * motherModifier * fatherModifier * externalModifier;
        if (chance > 0.45) chance = 0.45;
        if (chance < 0) chance = 0;
        return chance;
    }

    // =========================================================================
    // 4. PREGNANCY OUTCOME EVALUATION
    // =========================================================================

    /**
     * Evaluates a supplied conception roll.
     * No randomness occurs here.
     */
    function evaluateConception(facts, roll) {
        if (!facts || typeof facts !== 'object') {
            return { valid: false, conceived: false, errors: ['missing_facts'] };
        }
        if (!_isValidChance(facts.conceptionChance)) {
            return { valid: false, conceived: false, errors: ['invalid_conception_chance'] };
        }
        if (!_isValidRoll(roll)) {
            return { valid: false, conceived: false, errors: ['invalid_roll'] };
        }
        return {
            valid: true,
            conceived: roll < facts.conceptionChance,
            errors: []
        };
    }

    /**
     * facts:
     * {
     *   motherAge,
     *   pregnancyNumber   optional, default 0
     * }
     * Returns a chance in [0, 1]. Caller rolls against it.
     */
    function getComplicationChance(facts) {
        if (!facts || typeof facts !== 'object') return 0;
        var chance = 0.10;
        if (typeof facts.motherAge === 'number') {
            if (facts.motherAge > 40) chance += 0.15;
            if (facts.motherAge > 45) chance += 0.25;
        }
        if (typeof facts.pregnancyNumber === 'number'
            && facts.pregnancyNumber > 5) {
            chance += 0.10;
        }
        if (chance > 0.6) chance = 0.6;
        return chance;
    }

    function getMiscarriageChance(facts) {
        if (!facts || typeof facts !== 'object') return 0;
        var chance = 0.05;
        if (typeof facts.motherAge === 'number') {
            if (facts.motherAge > 35) chance += 0.05;
            if (facts.motherAge > 40) chance += 0.10;
            if (facts.motherAge > 45) chance += 0.20;
        }
        if (chance > 0.5) chance = 0.5;
        return chance;
    }

    function getStillbirthChance(facts) {
        if (!facts || typeof facts !== 'object') return 0;
        var chance = 0.02;
        if (facts.hasComplications === true) chance += 0.05;
        if (typeof facts.motherAge === 'number' && facts.motherAge > 40) {
            chance += 0.03;
        }
        if (chance > 0.25) chance = 0.25;
        return chance;
    }

    function getMaternalDeathChance(facts) {
        if (!facts || typeof facts !== 'object') return 0;
        var chance = 0.03;
        if (facts.hasComplications === true) chance *= 2;
        if (facts.isMultiple === true) chance *= 1.5;
        if (typeof facts.motherAge === 'number') {
            if (facts.motherAge > 40) chance += 0.02;
            if (facts.motherAge > 45) chance += 0.05;
        }
        if (chance > 0.3) chance = 0.3;
        return chance;
    }

    /**
     * facts:
     * {
     *   multipleBirthRoll,
     *   forceSingle       optional boolean
     * }
     * Returns { fetusCount, isMultiple }.
     */
    function resolveFetusCount(facts) {
        if (!facts || typeof facts !== 'object') {
            return { fetusCount: 1, isMultiple: false };
        }
        if (facts.forceSingle === true) {
            return { fetusCount: 1, isMultiple: false };
        }
        var roll = facts.multipleBirthRoll;
        if (!_isValidRoll(roll)) {
            return { fetusCount: 1, isMultiple: false };
        }
        if (roll < FERTILITY_CONSTANTS.TRIPLET_CHANCE) {
            return { fetusCount: 3, isMultiple: true };
        }
        if (roll < FERTILITY_CONSTANTS.MULTIPLE_BIRTH_CHANCE) {
            return { fetusCount: 2, isMultiple: true };
        }
        return { fetusCount: 1, isMultiple: false };
    }

    /**
     * fullFacts:
     * {
     *   motherAge,
     *   pregnancyNumber,
     *   forceSingle,
     *   rolls: {
     *     complication,
     *     miscarriage,
     *     stillbirth,
     *     maternalDeath,
     *     multipleBirth
     *   }
     * }
     *
     * Returns:
     * {
     *   valid,
     *   errors,
     *   outcome,          PREGNANCY_OUTCOME
     *   fetusCount,
     *   isMultiple,
     *   hasComplications,
     *   maternalDeath
     * }
     */
    function resolvePregnancyOutcome(fullFacts) {
        var errors = [];
        if (!fullFacts || typeof fullFacts !== 'object') {
            return { valid: false, errors: ['missing_facts'] };
        }
        var rolls = fullFacts.rolls;
        if (!rolls || typeof rolls !== 'object') {
            return { valid: false, errors: ['missing_rolls'] };
        }

        var complicationChance = getComplicationChance(fullFacts);
        var miscarriageChance = getMiscarriageChance(fullFacts);

        var hasComplications = false;
        if (_isValidRoll(rolls.complication)) {
            hasComplications = rolls.complication < complicationChance;
        }

        var stillbirthChance = getStillbirthChance({
            motherAge: fullFacts.motherAge,
            hasComplications: hasComplications
        });

        var multipleBirth = resolveFetusCount({
            multipleBirthRoll: rolls.multipleBirth,
            forceSingle: fullFacts.forceSingle
        });

        var maternalDeathChance = getMaternalDeathChance({
            motherAge: fullFacts.motherAge,
            hasComplications: hasComplications,
            isMultiple: multipleBirth.isMultiple
        });

        var maternalDeath = false;
        if (_isValidRoll(rolls.maternalDeath)) {
            maternalDeath = rolls.maternalDeath < maternalDeathChance;
        }

        // Miscarriage short-circuits stillbirth and live birth.
        if (_isValidRoll(rolls.miscarriage)
            && rolls.miscarriage < miscarriageChance) {
            return {
                valid: true,
                errors: [],
                outcome: PREGNANCY_OUTCOME.MISCARRIAGE,
                fetusCount: multipleBirth.fetusCount,
                isMultiple: multipleBirth.isMultiple,
                hasComplications: hasComplications,
                maternalDeath: false
            };
        }

        var stillbirth = false;
        if (_isValidRoll(rolls.stillbirth)) {
            stillbirth = rolls.stillbirth < stillbirthChance;
        }

        return {
            valid: true,
            errors: [],
            outcome: stillbirth
                ? PREGNANCY_OUTCOME.STILLBIRTH
                : PREGNANCY_OUTCOME.LIVE_BIRTH,
            fetusCount: multipleBirth.fetusCount,
            isMultiple: multipleBirth.isMultiple,
            hasComplications: hasComplications,
            maternalDeath: maternalDeath
        };
    }

    // =========================================================================
    // 5. ADOPTION METADATA
    // =========================================================================

    function isValidAdoptionType(type) {
        return type === ADOPTION_TYPE.LEGAL
            || type === ADOPTION_TYPE.GUARDIANSHIP
            || type === ADOPTION_TYPE.FOSTER;
    }

    function isValidAdoptionStatus(status) {
        return status === ADOPTION_STATUS.ACTIVE
            || status === ADOPTION_STATUS.ENDED
            || status === ADOPTION_STATUS.DISSOLVED;
    }

    /**
     * facts:
     * {
     *   childId,
     *   adopterId,
     *   year,
     *   type,
     *   currentYear
     * }
     */
    function validateAdoptionMetadata(facts) {
        var errors = [];
        if (!facts || typeof facts !== 'object') {
            return { valid: false, errors: ['missing_facts'] };
        }
        if (!_hasId(facts.childId)) errors.push('missing_child_id');
        if (!_hasId(facts.adopterId)) errors.push('missing_adopter_id');
        if (!_isValidYear(facts.year)) errors.push('invalid_year');
        if (!isValidAdoptionType(facts.type)) errors.push('invalid_adoption_type');
        if (_isValidYear(facts.currentYear)
            && _isValidYear(facts.year)
            && facts.year > facts.currentYear) {
            errors.push('adoption_after_current_year');
        }
        return { valid: errors.length === 0, errors: errors };
    }

    // =========================================================================
    // 6. SURROGACY VALIDATION
    // =========================================================================

    function isValidSurrogacyType(type) {
        return type === SURROGACY_TYPE.TRADITIONAL
            || type === SURROGACY_TYPE.GESTATIONAL;
    }

    function isValidSurrogacyStatus(status) {
        return status === SURROGACY_STATUS.ACTIVE
            || status === SURROGACY_STATUS.COMPLETED
            || status === SURROGACY_STATUS.CANCELLED;
    }

    /**
     * facts:
     * {
     *   intendedParentId,
     *   surrogateId,
     *   surrogateGender,
     *   surrogateAge,
     *   surrogateIsDeceased,
     *   arrangementYear,
     *   currentYear,
     *   type
     * }
     */
    function validateSurrogacyArrangement(facts) {
        var errors = [];
        if (!facts || typeof facts !== 'object') {
            return { valid: false, errors: ['missing_facts'] };
        }
        if (!_hasId(facts.intendedParentId)) errors.push('missing_intended_parent');
        if (!_hasId(facts.surrogateId)) errors.push('missing_surrogate');
        if (facts.intendedParentId === facts.surrogateId) {
            errors.push('same_person');
        }
        if (facts.surrogateGender !== 'female') {
            errors.push('surrogate_not_female');
        }
        if (facts.surrogateIsDeceased === true) {
            errors.push('surrogate_deceased');
        }
        if (typeof facts.surrogateAge === 'number') {
            if (facts.surrogateAge < 18) errors.push('surrogate_too_young');
            if (facts.surrogateAge > 50) errors.push('surrogate_too_old');
        }
        if (!_isValidYear(facts.arrangementYear)) errors.push('invalid_arrangement_year');
        if (_isValidYear(facts.currentYear)
            && _isValidYear(facts.arrangementYear)
            && facts.arrangementYear > facts.currentYear) {
            errors.push('arrangement_after_current_year');
        }
        if (!isValidSurrogacyType(facts.type)) errors.push('invalid_surrogacy_type');
        return { valid: errors.length === 0, errors: errors };
    }

    // =========================================================================
    // 7. BIRTH VALIDATION
    // =========================================================================

    /**
     * facts:
     * {
     *   motherId,
     *   fatherId,          optional; may be null
     *   birthYear,
     *   currentYear,
     *   gender             optional
     * }
     */
    function validateBirth(facts) {
        var errors = [];
        if (!facts || typeof facts !== 'object') {
            return { valid: false, errors: ['missing_facts'] };
        }
        if (!_hasId(facts.motherId)) errors.push('missing_mother_id');
        if (facts.fatherId !== null
            && facts.fatherId !== undefined
            && !_hasId(facts.fatherId)) {
            errors.push('invalid_father_id');
        }
        if (facts.motherId === facts.fatherId) {
            errors.push('same_parent');
        }
        if (!_isValidYear(facts.birthYear)) errors.push('invalid_birth_year');
        if (_isValidYear(facts.currentYear)
            && _isValidYear(facts.birthYear)
            && facts.birthYear > facts.currentYear) {
            errors.push('birth_after_current_year');
        }
        if (!_isValidYear(facts.birthYear)) errors.push('invalid_birth_year');
        return { valid: errors.length === 0, errors: errors };
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.ChildrenRules = {
        FERTILITY_CONSTANTS: FERTILITY_CONSTANTS,
        ADOPTION_TYPE: ADOPTION_TYPE,
        ADOPTION_STATUS: ADOPTION_STATUS,
        SURROGACY_TYPE: SURROGACY_TYPE,
        SURROGACY_STATUS: SURROGACY_STATUS,
        PREGNANCY_OUTCOME: PREGNANCY_OUTCOME,

        getFertilityAgeModifier: getFertilityAgeModifier,
        getFatherAgeModifier: getFatherAgeModifier,
        canConceive: canConceive,
        getConceptionChance: getConceptionChance,

        evaluateConception: evaluateConception,

        getComplicationChance: getComplicationChance,
        getMiscarriageChance: getMiscarriageChance,
        getStillbirthChance: getStillbirthChance,
        getMaternalDeathChance: getMaternalDeathChance,
        resolveFetusCount: resolveFetusCount,
        resolvePregnancyOutcome: resolvePregnancyOutcome,

        isValidAdoptionType: isValidAdoptionType,
        isValidAdoptionStatus: isValidAdoptionStatus,
        validateAdoptionMetadata: validateAdoptionMetadata,

        isValidSurrogacyType: isValidSurrogacyType,
        isValidSurrogacyStatus: isValidSurrogacyStatus,
        validateSurrogacyArrangement: validateSurrogacyArrangement,

        validateBirth: validateBirth
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.ChildrenRules;
    }
})();
