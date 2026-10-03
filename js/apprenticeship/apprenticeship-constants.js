/**
 * =============================================================================
 * STILL WATERS - APPRENTICESHIP CONSTANTS
 * js/apprenticeship/apprenticeship-constants.js
 * =============================================================================
 *
 * Pure apprenticeship vocabulary. No logic. No dependencies.
 *
 * SCOPE:
 *   - APPRENTICESHIP_STAGES: stages of the master/apprentice relationship
 *   - APPRENTICESHIP_STATUS: status values for the relationship
 *   - APPRENTICESHIP_ROLES: role of each party
 *   - TEACHING_CONSTANTS: immutable teaching configuration
 *
 * SKILL_LEVELS and SKILL_TRANSFER_METHODS live in the professional domain:
 *   - js/professional/skill-constants.js
 *   - js/professional/skill-transfer-constants.js
 *
 * APPRENTICESHIP_STAGES vs SKILL_LEVELS:
 *   These are DELIBERATELY DIFFERENT TAXONOMIES.
 *   - SKILL_LEVELS describes competence (Untrained → Master, 0-100).
 *   - APPRENTICESHIP_STAGES describes training relationship stage
 *     (Novice → Master, 0-100), with requiredYears attached.
 *   A character at skill 80 is an "Expert" by competence and a "Master"
 *   by apprenticeship stage. That is intentional.
 * =============================================================================
 */

const APPRENTICESHIP_STAGES = {
    NOVICE:     { id: 'novice',     name: 'Novice',     minLevel: 0,  maxLevel: 25,  requiredYears: 2, icon: '⌇' },
    APPRENTICE: { id: 'apprentice', name: 'Apprentice', minLevel: 26, maxLevel: 50,  requiredYears: 3, icon: '⌇' },
    JOURNEYMAN: { id: 'journeyman', name: 'Journeyman', minLevel: 51, maxLevel: 75,  requiredYears: 4, icon: '⌇' },
    MASTER:     { id: 'master',     name: 'Master',     minLevel: 76, maxLevel: 100, requiredYears: 5, icon: '◉' }
};

const APPRENTICESHIP_STATUS = {
    ONGOING:   'ongoing',
    COMPLETED: 'completed',
    ENDED:     'ended',
    CANCELLED: 'cancelled'
};

const APPRENTICESHIP_ROLES = {
    MASTER:    'master',
    APPRENTICE: 'apprentice'
};

const TEACHING_CONSTANTS = {
    MIN_MASTER_SKILL:       51,   // Journeyman minimum to teach
    COMPLETION_SKILL:       76,   // Skill threshold for completion eligibility
    DEFAULT_INITIAL_SKILL:  10,
    DEFAULT_PROGRESS_GAIN:  5,
    DEFAULT_TEACHING_HOURS: 1,
    MAX_SKILL:              100,
    MIN_SKILL:              0
};

window.APPRENTICESHIP_STAGES = APPRENTICESHIP_STAGES;
window.APPRENTICESHIP_STATUS = APPRENTICESHIP_STATUS;
window.APPRENTICESHIP_ROLES = APPRENTICESHIP_ROLES;
window.TEACHING_CONSTANTS = TEACHING_CONSTANTS;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        APPRENTICESHIP_STAGES,
        APPRENTICESHIP_STATUS,
        APPRENTICESHIP_ROLES,
        TEACHING_CONSTANTS
    };
}
