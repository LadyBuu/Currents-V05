/**
 * =============================================================================
 * STILL WATERS - SKILL UTILITIES (skill-utils.js)
 * =============================================================================
 *
 * The single source of truth for skill-tier classification.
 *
 * Every other module (RoleQueries, RoleUI, apprenticeship, professional logic,
 * character panels) MUST ask this module rather than re-deriving thresholds.
 *
 * Canonical tiers:
 *
 *     0        Untrained
 *     1  - 25  Novice
 *     26 - 50  Apprentice
 *     51 - 75  Journeyman
 *     76 - 90  Expert
 *     91 - 100 Master
 *
 * DEPENDENCIES: none.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. THRESHOLDS
    // =========================================================================

    var THRESHOLDS = Object.freeze({
        UNTRAINED: 0,
        NOVICE: 1,
        APPRENTICE: 26,
        JOURNEYMAN: 51,
        EXPERT: 76,
        MASTER: 91
    });

    // Teaching eligibility: anyone at Journeyman or above may teach.
    var TEACHING_THRESHOLD = THRESHOLDS.JOURNEYMAN;

    var MIN_LEVEL = 0;
    var MAX_LEVEL = 100;

    // =========================================================================
    // 2. TIER DEFINITIONS
    // =========================================================================

    var TIERS = Object.freeze([
        Object.freeze({ id: 'untrained', name: 'Untrained', min: 0,  max: 0  }),
        Object.freeze({ id: 'novice',    name: 'Novice',    min: 1,  max: 25 }),
        Object.freeze({ id: 'apprentice',name: 'Apprentice',min: 26, max: 50 }),
        Object.freeze({ id: 'journeyman',name: 'Journeyman',min: 51, max: 75 }),
        Object.freeze({ id: 'expert',    name: 'Expert',    min: 76, max: 90 }),
        Object.freeze({ id: 'master',    name: 'Master',    min: 91, max: 100})
    ]);

    // =========================================================================
    // 3. INTERNAL HELPERS
    // =========================================================================

    function _clamp(level) {
        var n = Number(level);
        if (!Number.isFinite(n)) return MIN_LEVEL;
        if (n < MIN_LEVEL) return MIN_LEVEL;
        if (n > MAX_LEVEL) return MAX_LEVEL;
        return Math.floor(n);
    }

    // =========================================================================
    // 4. PUBLIC API
    // =========================================================================

    /**
     * Returns the canonical tier object for a skill level.
     * Always returns one of the frozen TIERS entries.
     */
    function getTier(level) {
        var lvl = _clamp(level);
        if (lvl >= THRESHOLDS.MASTER)     return TIERS[5];
        if (lvl >= THRESHOLDS.EXPERT)     return TIERS[4];
        if (lvl >= THRESHOLDS.JOURNEYMAN) return TIERS[3];
        if (lvl >= THRESHOLDS.APPRENTICE) return TIERS[2];
        if (lvl >= THRESHOLDS.NOVICE)     return TIERS[1];
        return TIERS[0];
    }

    /**
     * Convenience: just the display name.
     * Level 0 -> 'Untrained'. Levels 1..25 -> 'Novice'. Etc.
     */
    function getSkillLevelName(level) {
        return getTier(level).name;
    }

    /**
     * Convenience: just the tier id.
     */
    function getTierId(level) {
        return getTier(level).id;
    }

    /**
     * Legacy name preserved for callers that used getStageFromLevel().
     * Returns the same frozen tier object as getTier().
     * There is exactly one tier taxonomy in this application.
     */
    function getStageFromLevel(level) {
        return getTier(level);
    }

    function getStageIdFromLevel(level) {
        return getTier(level).id;
    }

    /**
     * True if the level is high enough to teach.
     */
    function canTeach(level) {
        return _clamp(level) >= TEACHING_THRESHOLD;
    }

    /**
     * Returns a shallow copy of the threshold table.
     * Callers get a fresh object they can read but not mutate the canonical one.
     */
    function getThresholds() {
        return {
            UNTRAINED: THRESHOLDS.UNTRAINED,
            NOVICE: THRESHOLDS.NOVICE,
            APPRENTICE: THRESHOLDS.APPRENTICE,
            JOURNEYMAN: THRESHOLDS.JOURNEYMAN,
            EXPERT: THRESHOLDS.EXPERT,
            MASTER: THRESHOLDS.MASTER
        };
    }

    function getTeachingThreshold() {
        return TEACHING_THRESHOLD;
    }

    function clampLevel(level) {
        return _clamp(level);
    }

    function isValidLevel(level) {
        var n = Number(level);
        return Number.isFinite(n) && n >= MIN_LEVEL && n <= MAX_LEVEL;
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.SkillUtils = {
        // Tier lookups
        getTier: getTier,
        getSkillLevelName: getSkillLevelName,
        getTierId: getTierId,

        // Legacy aliases pointing at the same canonical taxonomy.
        getStageFromLevel: getStageFromLevel,
        getStageIdFromLevel: getStageIdFromLevel,

        // Teaching
        canTeach: canTeach,
        getTeachingThreshold: getTeachingThreshold,

        // Thresholds
        getThresholds: getThresholds,

        // Validation / normalisation
        clampLevel: clampLevel,
        isValidLevel: isValidLevel,

        // Data
        TIERS: TIERS
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.SkillUtils;
    }
})();
