/**
 * =============================================================================
 * STILL WATERS - APPRENTICESHIP RULES
 * js/apprenticeship/apprenticeship-rules.js
 * =============================================================================
 *
 * Pure policy. No mutation. No persistence. No window.* side effects.
 * Every function receives facts and returns a decision.
 *
 * The caller (ApprenticeshipCommands) applies mutations.
 * =============================================================================
 */

(function () {
    'use strict';

    var STAGES = window.APPRENTICESHIP_STAGES || {};
    var STATUS = window.APPRENTICESHIP_STATUS || {};
    var TEACH  = window.TEACHING_CONSTANTS || {};

    // =========================================================================
    // 1. STAGE / LEVEL
    // =========================================================================

    function getStageForSkill(skillLevel) {
        var level = clampSkill(skillLevel);
        if (level >= STAGES.MASTER.minLevel)     return STAGES.MASTER;
        if (level >= STAGES.JOURNEYMAN.minLevel) return STAGES.JOURNEYMAN;
        if (level >= STAGES.APPRENTICE.minLevel) return STAGES.APPRENTICE;
        return STAGES.NOVICE;
    }

    function clampSkill(skillLevel) {
        var n = Number(skillLevel);
        if (!isFinite(n)) return 0;
        return Math.max(TEACH.MIN_SKILL, Math.min(TEACH.MAX_SKILL, n));
    }

    function isSkillInRange(skillLevel) {
        var n = Number(skillLevel);
        return isFinite(n) && n >= TEACH.MIN_SKILL && n <= TEACH.MAX_SKILL;
    }

    // =========================================================================
    // 2. VALIDATION
    // =========================================================================

    /**
     * Validate that a creation request is permissible.
     * @param {Object} facts
     * @param {Object} facts.master             { id, name, isDeceased, skillLevel }
     * @param {Object} facts.apprentice         { id, name, isDeceased }
     * @param {Object} facts.role               { id, name }
     * @param {number} facts.initialSkill
     * @param {boolean} facts.existsActiveForRole
     * @returns {{valid:boolean, code?:string, reason?:string}}
     */
    function validateCreation(facts) {
        if (!facts.master || !facts.apprentice) {
            return { valid: false, code: 'MISSING_PARTY', reason: 'Master and apprentice are required' };
        }
        if (!facts.role) {
            return { valid: false, code: 'MISSING_ROLE', reason: 'Role is required' };
        }
        if (facts.master.id === facts.apprentice.id) {
            return { valid: false, code: 'SAME_PARTY', reason: 'Master and apprentice cannot be the same person' };
        }
        if (facts.master.isDeceased) {
            return { valid: false, code: 'MASTER_DECEASED', reason: 'Master is deceased' };
        }
        if (facts.apprentice.isDeceased) {
            return { valid: false, code: 'APPRENTICE_DECEASED', reason: 'Apprentice is deceased' };
        }
        if (facts.master.skillLevel < TEACH.MIN_MASTER_SKILL) {
            return {
                valid: false,
                code: 'MASTER_SKILL_TOO_LOW',
                reason: 'Master requires skill ' + TEACH.MIN_MASTER_SKILL + '+ (Journeyman) to teach'
            };
        }
        if (!isSkillInRange(facts.initialSkill)) {
            return { valid: false, code: 'INVALID_SKILL', reason: 'Initial skill must be 0-100' };
        }
        if (facts.existsActiveForRole) {
            return {
                valid: false,
                code: 'DUPLICATE_APPRENTICESHIP',
                reason: 'An active apprenticeship already exists for this role'
            };
        }
        return { valid: true };
    }

    function validateStatusTransition(fromStatus, toStatus) {
        var allowed = {
            ongoing:   ['completed', 'ended', 'cancelled'],
            completed: [],
            ended:     [],
            cancelled: []
        };
        if (!allowed[fromStatus]) {
            return { valid: false, code: 'UNKNOWN_STATUS', reason: 'Unknown source status: ' + fromStatus };
        }
        if (allowed[fromStatus].indexOf(toStatus) === -1) {
            return {
                valid: false,
                code: 'ILLEGAL_TRANSITION',
                reason: 'Cannot transition from ' + fromStatus + ' to ' + toStatus
            };
        }
        return { valid: true };
    }

    // =========================================================================
    // 3. TEACHING OUTCOME (deterministic — caller supplies roll)
    // =========================================================================

    /**
     * Calculate teaching outcome.
     * @param {Object} facts
     * @param {number} facts.currentSkill
     * @param {Object} facts.method       { id, baseSuccess, gain }
     * @param {number} facts.roll         0..1
     * @returns {{success:boolean, gain:number, newSkill:number, successChance:number, roll:number}}
     */
    function calculateTeachingOutcome(facts) {
        var method = facts.method || { baseSuccess: 0.75, gain: 5 };
        var successChance = method.baseSuccess;
        var gain = method.gain;
        var roll = Number(facts.roll);

        if (!isFinite(roll) || roll < 0 || roll > 1) {
            roll = 0;
        }

        var success = roll < successChance;
        var newSkill = success
            ? clampSkill(facts.currentSkill + gain)
            : clampSkill(facts.currentSkill);

        return {
            success: success,
            gain: success ? (newSkill - facts.currentSkill) : 0,
            newSkill: newSkill,
            successChance: successChance,
            roll: roll,
            methodId: method.id || 'teaching'
        };
    }

    /**
     * Calculate annual progression gain for an apprentice.
     * @param {Object} facts
     * @param {number} facts.masterSkill
     * @param {number} facts.currentSkill
     * @returns {{gain:number, newSkill:number}}
     */
    function calculateAnnualProgress(facts) {
        var masterSkill = facts.masterSkill || 0;
        var gain = 2;
        if (masterSkill >= 91)      gain = 8;
        else if (masterSkill >= 76) gain = 6;
        else if (masterSkill >= 51) gain = 4;
        else                        gain = 2;

        var newSkill = clampSkill(facts.currentSkill + gain);
        return { gain: newSkill - facts.currentSkill, newSkill: newSkill };
    }

    // =========================================================================
    // 4. COMPLETION
    // =========================================================================

    function canComplete(facts) {
        if (!facts) return { valid: false, code: 'MISSING_FACTS', reason: 'No facts supplied' };
        if (facts.status !== STATUS.ONGOING) {
            return { valid: false, code: 'NOT_ONGOING', reason: 'Apprenticeship is not ongoing' };
        }
        if (facts.skillLevel < TEACH.COMPLETION_SKILL) {
            return {
                valid: false,
                code: 'SKILL_TOO_LOW',
                reason: 'Skill must be ' + TEACH.COMPLETION_SKILL + '+ to complete'
            };
        }
        return { valid: true };
    }

    function canTeach(masterSkillLevel) {
        return Number(masterSkillLevel) >= TEACH.MIN_MASTER_SKILL;
    }

    function getRequiredYearsForStage(stageId) {
        for (var key in STAGES) {
            if (STAGES[key].id === stageId) return STAGES[key].requiredYears;
        }
        return null;
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.ApprenticeshipRules = {
        getStageForSkill: getStageForSkill,
        clampSkill: clampSkill,
        isSkillInRange: isSkillInRange,
        validateCreation: validateCreation,
        validateStatusTransition: validateStatusTransition,
        calculateTeachingOutcome: calculateTeachingOutcome,
        calculateAnnualProgress: calculateAnnualProgress,
        canComplete: canComplete,
        canTeach: canTeach,
        getRequiredYearsForStage: getRequiredYearsForStage
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.ApprenticeshipRules;
    }
})();
