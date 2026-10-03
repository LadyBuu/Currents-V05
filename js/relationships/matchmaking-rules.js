/**
 * matchmaking-rules.js
 *
 * Pure policy for matchmaking.
 * No I/O, no state, no mutation, no randomness.
 */

(function() {
    'use strict';

    // -------------------------------------------------------------------------
    // CONSTANTS
    // -------------------------------------------------------------------------

    var DEFAULT_MIN_AGE = 12;
    var DEFAULT_MAX_AGE_GAP = 20;

    var LATE_SPRING_MIN_AGE = 30;
    var LATE_SPRING_MAX_AGE_GAP = 15;

    // Preference keys (user-facing categories)
    var PREFERENCE = {
        ANY:            'any',
        OPPOSITE_SEX:   'opposite_sex',
        SAME_SEX:       'same_sex'
    };

    // -------------------------------------------------------------------------
    // ELIGIBILITY
    // -------------------------------------------------------------------------

    /**
     * facts: {
     *   isDeceased: boolean,
     *   age: number,
     *   hasActivePartner: boolean,
     *   minAge?: number
     * }
     */
    function isEligibleSingle(facts) {
        if (!facts) return false;
        if (facts.isDeceased) return false;
        var minAge = (facts.minAge !== undefined) ? facts.minAge : DEFAULT_MIN_AGE;
        if (typeof facts.age !== 'number' || facts.age < minAge) return false;
        if (facts.hasActivePartner) return false;
        return true;
    }

    /**
     * facts: {
     *   isDeceased: boolean,
     *   age: number,
     *   isWidowed: boolean,
     *   hasActivePartner: boolean
     * }
     */
    function isEligibleLateSpring(facts) {
        if (!facts) return false;
        if (facts.isDeceased) return false;
        if (!facts.isWidowed) return false;
        if (facts.hasActivePartner) return false;
        if (typeof facts.age !== 'number' || facts.age < LATE_SPRING_MIN_AGE) return false;
        return true;
    }

    // -------------------------------------------------------------------------
    // GENDER PREFERENCE
    // -------------------------------------------------------------------------

    /**
     * facts: {
     *   subjectGender: 'male' | 'female' | other,
     *   candidateGender: 'male' | 'female' | other,
     *   preference: PREFERENCE.ANY | OPPOSITE_SEX | SAME_SEX
     * }
     */
    function passesGenderPreference(facts) {
        if (!facts) return true;
        var pref = facts.preference || PREFERENCE.ANY;
        if (pref === PREFERENCE.ANY) return true;

        var a = facts.subjectGender;
        var b = facts.candidateGender;
        if (!a || !b) return pref === PREFERENCE.ANY;

        if (pref === PREFERENCE.OPPOSITE_SEX) {
            return (a === 'male' && b === 'female') ||
                   (a === 'female' && b === 'male');
        }
        if (pref === PREFERENCE.SAME_SEX) {
            return a === b;
        }
        return true;
    }

    // -------------------------------------------------------------------------
    // ACCEPTANCE
    // -------------------------------------------------------------------------

    /**
     * Probability a pair would accept a match, given age gap.
     * facts: { ageGap, maxAgeGap? }
     */
    function acceptanceChance(facts) {
        if (!facts) return 0;
        var gap = facts.ageGap || 0;
        var max = (facts.maxAgeGap !== undefined) ? facts.maxAgeGap : DEFAULT_MAX_AGE_GAP;
        if (gap > max) return 0;
        // Linear falloff toward maxAgeGap
        var chance = 1 - (gap / (max + 5));
        return Math.max(0, Math.min(1, chance));
    }

    /**
     * Determines whether a pair passes the age-gap gate.
     */
    function passesAgeGap(facts) {
        if (!facts) return false;
        var max = (facts.maxAgeGap !== undefined) ? facts.maxAgeGap : DEFAULT_MAX_AGE_GAP;
        return (facts.ageGap || 0) <= max;
    }

    // -------------------------------------------------------------------------
    // LATE SPRING
    // -------------------------------------------------------------------------

    function lateSpringMaxAgeGap() {
        return LATE_SPRING_MAX_AGE_GAP;
    }

    // -------------------------------------------------------------------------

    window.MatchmakingRules = {
        DEFAULT_MIN_AGE: DEFAULT_MIN_AGE,
        DEFAULT_MAX_AGE_GAP: DEFAULT_MAX_AGE_GAP,
        LATE_SPRING_MIN_AGE: LATE_SPRING_MIN_AGE,
        LATE_SPRING_MAX_AGE_GAP: LATE_SPRING_MAX_AGE_GAP,
        PREFERENCE: PREFERENCE,

        isEligibleSingle: isEligibleSingle,
        isEligibleLateSpring: isEligibleLateSpring,
        passesGenderPreference: passesGenderPreference,
        acceptanceChance: acceptanceChance,
        passesAgeGap: passesAgeGap,
        lateSpringMaxAgeGap: lateSpringMaxAgeGap
    };

})();
