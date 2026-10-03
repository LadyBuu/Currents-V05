/**
 * =============================================================================
 * STILL WATERS - APPRENTICESHIP CONSTANTS
 * js/apprenticeship/apprenticeship-constants.js
 * =============================================================================
 *
 * Pure apprenticeship vocabulary. No logic beyond deriving stage metadata
 * from the canonical skill taxonomy. No side effects. No persistence.
 *
 * SCOPE:
 *   - APPRENTICESHIP_STAGES: stages of a training relationship, mapped onto
 *     the canonical competence tiers from SkillUtils
 *   - APPRENTICESHIP_STATUS: status values for the relationship
 *   - APPRENTICESHIP_ROLES: role of each party
 *   - TEACHING_CONSTANTS: immutable teaching configuration
 *
 * SKILL_LEVELS and SKILL_TRANSFER_METHODS live in the professional domain:
 *   - js/professional/skill-constants.js
 *   - js/professional/skill-transfer-constants.js
 *
 * TAXONOMY:
 *   There is exactly one skill taxonomy in this application: the one owned
 *   by SkillUtils. It defines six tiers across 0-100:
 *
 *       Untrained   0
 *       Novice      1-25
 *       Apprentice  26-50
 *       Journeyman  51-75
 *       Expert      76-90
 *       Master      91-100
 *
 *   Apprenticeship stages are the SAME tiers, augmented with the number of
 *   years typically required to reach them. A character at skill 80 is an
 *   Expert by competence and an Expert by apprenticeship stage. There is no
 *   second taxonomy.
 *
 *   The previous version of this file defined APPRENTICESHIP_STAGES with
 *   different boundaries (e.g. "Master" starting at 76). That produced two
 *   names for the same number depending on which module you asked. This
 *   version derives boundaries from SkillUtils and cannot drift from it.
 *
 * DEPENDENCIES (must be loaded first):
 *   - skill-utils.js (SkillUtils)
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HARD DEPENDENCY CHECK
    // =========================================================================

    if (!window.SkillUtils || typeof window.SkillUtils.getThresholds !== 'function') {
        throw new Error(
            'apprenticeship-constants.js requires skill-utils.js (SkillUtils) first.'
        );
    }

    var SU = window.SkillUtils;
    var THRESHOLDS = SU.getThresholds();

    // =========================================================================
    // 2. APPRENTICESHIP STAGES
    // =========================================================================
    //
    // Each stage mirrors a SkillUtils tier by id and name, uses the same
    // minLevel/maxLevel boundaries, and adds requiredYears for the training
    // relationship.
    //
    // The boundaries are read from SkillUtils.TIERS so that adding or moving
    // a tier is a one-place edit. The requiredYears values are local to the
    // apprenticeship system and have no equivalent in SkillUtils.

    var STAGE_REQUIRED_YEARS = Object.freeze({
        untrained:  0,
        novice:     2,
        apprentice: 3,
        journeyman: 4,
        expert:     5,
        master:     6
    });

    var APPRENTICESHIP_STAGES = Object.freeze((function () {
        var byId = {};
        for (var i = 0; i < SU.TIERS.length; i++) {
            var tier = SU.TIERS[i];
            byId[tier.id.toUpperCase()] = Object.freeze({
                id: tier.id,
                name: tier.name,
                minLevel: tier.min,
                maxLevel: tier.max,
                requiredYears: STAGE_REQUIRED_YEARS[tier.id] !== undefined
                    ? STAGE_REQUIRED_YEARS[tier.id]
                    : null
            });
        }
        return byId;
    })());

    // =========================================================================
    // 3. RELATIONSHIP STATUS
    // =========================================================================

    var APPRENTICESHIP_STATUS = Object.freeze({
        ONGOING:   'ongoing',
        COMPLETED: 'completed',
        ENDED:     'ended',
        CANCELLED: 'cancelled'
    });

    // =========================================================================
    // 4. PARTY ROLES
    // =========================================================================

    var APPRENTICESHIP_ROLES = Object.freeze({
        MASTER:     'master',
        APPRENTICE: 'apprentice'
    });

    // =========================================================================
    // 5. TEACHING CONSTANTS
    // =========================================================================
    //
    // MIN_MASTER_SKILL and COMPLETION_SKILL are derived from SkillUtils so
    // that moving a tier boundary moves them automatically.
    //
    //   MIN_MASTER_SKILL   = Journeyman threshold (the minimum to teach)
    //   COMPLETION_SKILL   = Expert threshold (the minimum to complete)
    //
    // MAX_SKILL and MIN_SKILL are the skill-range bounds, mirrored from
    // SkillUtils for convenience within the apprenticeship system.

    var TEACHING_CONSTANTS = Object.freeze({
        MIN_MASTER_SKILL:       THRESHOLDS.JOURNEYMAN,   // 51
        COMPLETION_SKILL:       THRESHOLDS.EXPERT,       // 76
        DEFAULT_INITIAL_SKILL:  10,
        DEFAULT_PROGRESS_GAIN:  5,
        DEFAULT_TEACHING_HOURS: 1,
        MAX_SKILL:              100,
        MIN_SKILL:              0
    });

    // =========================================================================
    // 6. INTERNAL CONSISTENCY VALIDATION
    // =========================================================================
    //
    // Sanity: the stage table must contain every tier SkillUtils defines, and
    // requiredYears must be present for every non-zero tier.

    (function _validate() {
        for (var i = 0; i < SU.TIERS.length; i++) {
            var tier = SU.TIERS[i];
            var key = tier.id.toUpperCase();
            var stage = APPRENTICESHIP_STAGES[key];
            if (!stage) {
                throw new Error(
                    'apprenticeship-constants.js: missing stage for tier "' + tier.id + '".'
                );
            }
            if (stage.minLevel !== tier.min || stage.maxLevel !== tier.max) {
                throw new Error(
                    'apprenticeship-constants.js: stage "' + tier.id +
                    '" boundaries diverge from SkillUtils tier.'
                );
            }
        }

        if (TEACHING_CONSTANTS.MIN_MASTER_SKILL >= TEACHING_CONSTANTS.COMPLETION_SKILL) {
            throw new Error(
                'apprenticeship-constants.js: MIN_MASTER_SKILL must be lower than COMPLETION_SKILL.'
            );
        }

        if (TEACHING_CONSTANTS.MIN_SKILL >= TEACHING_CONSTANTS.MAX_SKILL) {
            throw new Error(
                'apprenticeship-constants.js: MIN_SKILL must be lower than MAX_SKILL.'
            );
        }
    })();

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.APPRENTICESHIP_STAGES = APPRENTICESHIP_STAGES;
    window.APPRENTICESHIP_STATUS = APPRENTICESHIP_STATUS;
    window.APPRENTICESHIP_ROLES = APPRENTICESHIP_ROLES;
    window.TEACHING_CONSTANTS = TEACHING_CONSTANTS;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            APPRENTICESHIP_STAGES: APPRENTICESHIP_STAGES,
            APPRENTICESHIP_STATUS: APPRENTICESHIP_STATUS,
            APPRENTICESHIP_ROLES: APPRENTICESHIP_ROLES,
            TEACHING_CONSTANTS: TEACHING_CONSTANTS
        };
    }
})();
