/**
 * =============================================================================
 * STILL WATERS - APPRENTICESHIP RULES
 * js/apprenticeship/apprenticeship-rules.js
 * =============================================================================
 *
 * Pure policy for the apprenticeship lifecycle. No mutation. No persistence.
 * No window.* side effects. No state reads. No randomness.
 *
 * Every function receives facts and returns a decision. The caller
 * (ApprenticeshipCommands) applies the decision.
 *
 * OWNERSHIP
 *
 *   ApprenticeshipRules owns:
 *       - stage derivation from skill level
 *       - skill clamping and range validation
 *       - creation validation for an apprenticeship
 *       - status-transition validation
 *       - teaching outcome calculation (roll is supplied by the caller)
 *       - annual progress calculation
 *       - completion eligibility
 *       - teaching eligibility
 *       - required-years lookup per stage
 *
 *   ApprenticeshipRules does NOT own:
 *       - specialization membership      → RoleRules.validateSpecialization
 *       - skill taxonomy / thresholds    → SkillUtils
 *       - the profession record          → CharacterCommands
 *       - the relationship edge          → ProfessionalCommands
 *       - the apprenticeship lifecycle   → ApprenticeshipCommands
 *
 * REMOVED IN THIS VERSION
 *
 *   validateSpecialization() has moved to RoleRules. The role catalogue
 *   (role.specializations) is the authority on which specializations
 *   exist for a role; that is a role-domain question, not an
 *   apprenticeship question. ApprenticeshipCommands now calls
 *   RoleRules.validateSpecialization().
 *
 * STAGE DERIVATION
 *
 *   APPRENTICESHIP_STAGES is derived from SkillUtils.TIERS in
 *   apprenticeship-constants.js. This module's getStageForSkill() reads
 *   from that derived table. It does not restate boundaries. If a tier
 *   boundary moves in SkillUtils, both files move together.
 *
 * DEPENDENCIES (must be loaded first):
 *   - apprenticeship-constants.js (APPRENTICESHIP_STAGES, APPRENTICESHIP_STATUS, TEACHING_CONSTANTS)
 *   - skill-utils.js              (SkillUtils)
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HARD DEPENDENCY CHECK
    // =========================================================================

    if (!window.APPRENTICESHIP_STAGES) {
        throw new Error(
            'apprenticeship-rules.js requires apprenticeship-constants.js ' +
            '(APPRENTICESHIP_STAGES) first.'
        );
    }
    if (!window.APPRENTICESHIP_STATUS) {
        throw new Error(
            'apprenticeship-rules.js requires apprenticeship-constants.js ' +
            '(APPRENTICESHIP_STATUS) first.'
        );
    }
    if (!window.TEACHING_CONSTANTS) {
        throw new Error(
            'apprenticeship-rules.js requires apprenticeship-constants.js ' +
            '(TEACHING_CONSTANTS) first.'
        );
    }
    if (!window.SkillUtils || typeof window.SkillUtils.getThresholds !== 'function') {
        throw new Error(
            'apprenticeship-rules.js requires skill-utils.js (SkillUtils) first.'
        );
    }

    var STAGES = window.APPRENTICESHIP_STAGES;
    var STATUS = window.APPRENTICESHIP_STATUS;
    var TEACH  = window.TEACHING_CONSTANTS;
    var SU     = window.SkillUtils;

    var THRESHOLDS = SU.getThresholds();

    // =========================================================================
    // 2. STAGE / LEVEL
    // =========================================================================
    //
    // Stage derivation delegates to SkillUtils for the tier boundary,
    // then maps the tier id onto the apprenticeship stage table
    // (which augments the tier with requiredYears).

    /**
     * Returns the apprenticeship stage object whose boundaries contain
     * skillLevel. SkillUtils.getTierId is the sole authority on the
     * boundary; STAGES is the apprenticeship-local view that adds
     * requiredYears.
     *
     * @param {number} skillLevel
     * @returns {Object}  A frozen stage record from APPRENTICESHIP_STAGES.
     */
    function getStageForSkill(skillLevel) {
        var tierId = SU.getTierId(skillLevel);
        var stage = STAGES[tierId.toUpperCase()];
        if (!stage) {
            // Defensive: APPRENTICESHIP_STAGES is validated against
            // SkillUtils.TIERS at apprenticeship-constants.js load time,
            // so this should be unreachable. Fail loudly anyway.
            throw new Error(
                'ApprenticeshipRules.getStageForSkill: no stage for tier "' +
                tierId + '".'
            );
        }
        return stage;
    }

    function clampSkill(skillLevel) {
        return SU.clampLevel(skillLevel);
    }

    function isSkillInRange(skillLevel) {
        return SU.isValidLevel(skillLevel);
    }

    // =========================================================================
    // 3. VALIDATION
    // =========================================================================

    /**
     * Validate that a creation request is permissible.
     *
     * @param {Object} facts
     * @param {Object} facts.master             { id, name, isDeceased, skillLevel }
     * @param {Object} facts.apprentice         { id, name, isDeceased, existingSkill }
     * @param {Object} facts.role               { id, name }
     * @param {number} facts.initialSkill
     * @param {boolean} facts.existsActiveForRole
     * @returns {{valid:boolean, code?:string, reason?:string, resolvedInitialSkill?:number}}
     */
    function validateCreation(facts) {
        if (!facts.master || !facts.apprentice) {
            return {
                valid: false,
                code: 'MISSING_PARTY',
                reason: 'Master and apprentice are required'
            };
        }
        if (!facts.role) {
            return {
                valid: false,
                code: 'MISSING_ROLE',
                reason: 'Role is required'
            };
        }
        if (facts.master.id === facts.apprentice.id) {
            return {
                valid: false,
                code: 'SAME_PARTY',
                reason: 'Master and apprentice cannot be the same person'
            };
        }
        if (facts.master.isDeceased) {
            return {
                valid: false,
                code: 'MASTER_DECEASED',
                reason: 'Master is deceased'
            };
        }
        if (facts.apprentice.isDeceased) {
            return {
                valid: false,
                code: 'APPRENTICE_DECEASED',
                reason: 'Apprentice is deceased'
            };
        }
        if (facts.master.skillLevel < TEACH.MIN_MASTER_SKILL) {
            return {
                valid: false,
                code: 'MASTER_SKILL_TOO_LOW',
                reason: 'Master requires skill ' + TEACH.MIN_MASTER_SKILL +
                        '+ (Journeyman) to teach'
            };
        }
        if (!isSkillInRange(facts.initialSkill)) {
            return {
                valid: false,
                code: 'INVALID_SKILL',
                reason: 'Initial skill must be 0-100'
            };
        }
        if (facts.existsActiveForRole) {
            return {
                valid: false,
                code: 'DUPLICATE_APPRENTICESHIP',
                reason: 'An active apprenticeship already exists for this role'
            };
        }

        // Apprentice may already hold the role at a higher skill. Never
        // downgrade: the apprenticeship starts from the higher of the two.
        var existingSkill = Number(facts.apprentice.existingSkill) || 0;
        var resolvedInitialSkill = Math.max(facts.initialSkill, existingSkill);

        return {
            valid: true,
            resolvedInitialSkill: resolvedInitialSkill,
            existingSkill: existingSkill
        };
    }

    function validateStatusTransition(fromStatus, toStatus) {
        var allowed = {
            ongoing:   ['completed', 'ended', 'cancelled'],
            completed: [],
            ended:     [],
            cancelled: []
        };
        if (!allowed[fromStatus]) {
            return {
                valid: false,
                code: 'UNKNOWN_STATUS',
                reason: 'Unknown source status: ' + fromStatus
            };
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
    // 4. TEACHING OUTCOME (deterministic — caller supplies roll)
    // =========================================================================

    /**
     * @param {Object} facts
     * @param {number} facts.currentSkill
     * @param {Object} facts.method       { id, baseSuccess, gain }
     * @param {number} facts.roll         0..1
     * @returns {{success:boolean, gain:number, newSkill:number, successChance:number, roll:number, methodId:string}}
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

    function calculateAnnualProgress(facts) {
        var masterSkill = facts.masterSkill || 0;
        var gain = 2;
        if (masterSkill >= THRESHOLDS.MASTER)     gain = 8;
        else if (masterSkill >= THRESHOLDS.EXPERT) gain = 6;
        else if (masterSkill >= THRESHOLDS.JOURNEYMAN) gain = 4;
        else                                       gain = 2;

        var newSkill = clampSkill(facts.currentSkill + gain);
        return { gain: newSkill - facts.currentSkill, newSkill: newSkill };
    }

    // =========================================================================
    // 5. COMPLETION
    // =========================================================================

    function canComplete(facts) {
        if (!facts) {
            return {
                valid: false,
                code: 'MISSING_FACTS',
                reason: 'No facts supplied'
            };
        }
        if (facts.status !== STATUS.ONGOING) {
            return {
                valid: false,
                code: 'NOT_ONGOING',
                reason: 'Apprenticeship is not ongoing'
            };
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
        return SU.clampLevel(masterSkillLevel) >= TEACH.MIN_MASTER_SKILL;
    }

    function getRequiredYearsForStage(stageId) {
        for (var key in STAGES) {
            if (!Object.prototype.hasOwnProperty.call(STAGES, key)) continue;
            if (STAGES[key].id === stageId) return STAGES[key].requiredYears;
        }
        return null;
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================
    //
    // validateSpecialization is NOT exported. It lives in RoleRules.

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
