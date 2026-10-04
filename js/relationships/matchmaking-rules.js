/**
 * matchmaking-rules.js
 *
 * Pure policy for matchmaking.
 *
 * Owns:
 *   - eligibility filters for surprise matches and late-spring matches
 *   - age-gap policy
 *   - gender-preference policy
 *   - acceptance chance as a function of age gap
 *   - preference vocabulary
 *
 * Does NOT own:
 *   - state access
 *   - mutation
 *   - persistence
 *   - randomness (rolls are supplied by the caller as an array)
 *   - queries (see matchmaking-queries.js)
 *   - the resulting relationship (creating it is RomanceCommands'
 *     responsibility)
 *
 * Every function is deterministic and takes explicit facts.
 *
 * Load order: after relationship-types.js.
 */

(function() {
    'use strict';

    var A = window.RELATIONSHIP_ARCHETYPES;
    var STATUS = window.RELATIONSHIP_STATUS;

    if (!A || !STATUS) {
        throw new Error('matchmaking-rules.js: relationship-types.js must load first');
    }

    // -------------------------------------------------------------------------
    // CONSTANTS
    // -------------------------------------------------------------------------

    var DEFAULT_MIN_AGE         = 12;
    var DEFAULT_MAX_AGE_GAP     = 20;

    var LATE_SPRING_MIN_AGE     = 30;
    var LATE_SPRING_MAX_AGE_GAP = 15;

    // Preference keys.
    var PREFERENCE = {
        ANY:          'any',
        OPPOSITE_SEX: 'opposite_sex',
        SAME_SEX:     'same_sex'
    };

    // -------------------------------------------------------------------------
    // PREFERENCE
    // -------------------------------------------------------------------------

    function isValidPreference(pref) {
        if (typeof pref !== 'string') return false;
        return pref === PREFERENCE.ANY ||
               pref === PREFERENCE.OPPOSITE_SEX ||
               pref === PREFERENCE.SAME_SEX;
    }

    /**
     * facts: {
     *   subjectGender: 'male' | 'female' | 'unknown' | null,
     *   candidateGender: 'male' | 'female' | 'unknown' | null,
     *   preference: PREFERENCE
     * }
     *
     * When preference is ANY, always true. When genders are missing,
     * only ANY passes. No fabrication of gender.
     */
    function passesGenderPreference(facts) {
        if (!facts || typeof facts !== 'object') return false;
        var pref = facts.preference || PREFERENCE.ANY;
        if (pref === PREFERENCE.ANY) return true;

        var a = facts.subjectGender;
        var b = facts.candidateGender;
        if (!a || !b) return false;

        if (pref === PREFERENCE.OPPOSITE_SEX) {
            return (a === 'male'   && b === 'female') ||
                   (a === 'female' && b === 'male');
        }
        if (pref === PREFERENCE.SAME_SEX) {
            return a === b;
        }
        return false;
    }

    // -------------------------------------------------------------------------
    // AGE-GAP
    // -------------------------------------------------------------------------

    /**
     * facts: { ageGap, maxAgeGap? }
     */
    function passesAgeGap(facts) {
        if (!facts || typeof facts !== 'object') return false;
        var gap = (typeof facts.ageGap === 'number') ? facts.ageGap : 0;
        var max = (typeof facts.maxAgeGap === 'number')
            ? facts.maxAgeGap
            : DEFAULT_MAX_AGE_GAP;
        return gap <= max;
    }

    /**
     * facts: { ageGap, maxAgeGap? }
     * Linear falloff toward maxAgeGap. Returns a number in [0, 1].
     */
    function acceptanceChance(facts) {
        if (!facts || typeof facts !== 'object') return 0;
        var gap = (typeof facts.ageGap === 'number') ? facts.ageGap : 0;
        var max = (typeof facts.maxAgeGap === 'number')
            ? facts.maxAgeGap
            : DEFAULT_MAX_AGE_GAP;
        if (gap > max) return 0;
        var chance = 1 - (gap / (max + 5));
        if (chance < 0) return 0;
        if (chance > 1) return 1;
        return chance;
    }

    // -------------------------------------------------------------------------
    // ELIGIBILITY
    // -------------------------------------------------------------------------

    /**
     * facts: {
     *   isDeceased: boolean,
     *   age: number | null,
     *   hasActivePartner: boolean,
     *   minAge?: number
     * }
     */
    function isEligibleSingle(facts) {
        if (!facts || typeof facts !== 'object') return false;
        if (facts.isDeceased) return false;

        var minAge = (typeof facts.minAge === 'number')
            ? facts.minAge
            : DEFAULT_MIN_AGE;

        if (typeof facts.age !== 'number' || isNaN(facts.age)) return false;
        if (facts.age < minAge) return false;
        if (facts.hasActivePartner) return false;

        return true;
    }

    /**
     * Late-spring: widowed characters past the late-spring age floor,
     * with no active partner.
     *
     * facts: {
     *   isDeceased: boolean,
     *   age: number | null,
     *   isWidowed: boolean,
     *   hasActivePartner: boolean
     * }
     */
    function isEligibleLateSpring(facts) {
        if (!facts || typeof facts !== 'object') return false;
        if (facts.isDeceased) return false;
        if (!facts.isWidowed) return false;
        if (facts.hasActivePartner) return false;
        if (typeof facts.age !== 'number' || isNaN(facts.age)) return false;
        if (facts.age < LATE_SPRING_MIN_AGE) return false;
        return true;
    }

    // -------------------------------------------------------------------------
    // SAME-SEX / BIOLOGICAL CONSTRAINT NOTE
    //
    // Matchmaking is not a mechanism for producing biological children;
    // that is ChildrenCommands' concern. A same-sex match is a valid
    // match. No biological gate exists here.
    // -------------------------------------------------------------------------

    // -------------------------------------------------------------------------
    // EXPORTS
    // -------------------------------------------------------------------------

    window.MatchmakingRules = {
        DEFAULT_MIN_AGE: DEFAULT_MIN_AGE,
        DEFAULT_MAX_AGE_GAP: DEFAULT_MAX_AGE_GAP,
        LATE_SPRING_MIN_AGE: LATE_SPRING_MIN_AGE,
        LATE_SPRING_MAX_AGE_GAP: LATE_SPRING_MAX_AGE_GAP,
        PREFERENCE: PREFERENCE,

        isValidPreference: isValidPreference,
        passesGenderPreference: passesGenderPreference,
        passesAgeGap: passesAgeGap,
        acceptanceChance: acceptanceChance,

        isEligibleSingle: isEligibleSingle,
        isEligibleLateSpring: isEligibleLateSpring
    };

})();
