/**
 * =============================================================================
 * STILL WATERS - PROFESSIONAL RULES (professional-rules.js)
 * =============================================================================
 *
 * LOCATION: js/social/professional-rules.js
 *
 * Pure policy for professional relationship edges. No state access. No
 * mutation. No persistence. No randomness. No window.* side effects.
 *
 * PROFESSIONAL ARCHETYPES
 *
 *   apprenticeship    A = master,     B = apprentice
 *   mastership        A = master,     B = expert
 *   employment        A = employer,   B = employee
 *   guild_membership  A = guild,      B = member
 *
 * OWNERSHIP
 *
 *   ProfessionalRules owns:
 *       - the professional-archetype predicate
 *       - transition tables for the four professional archetypes
 *       - attribute-set validation for professional edges (empty in v1)
 *       - creation validators for apprenticeship, employment, guild
 *       - apprenticeship progression / completion validators
 *
 *   ProfessionalRules does NOT own:
 *       - the skill taxonomy or thresholds    → SkillUtils
 *       - the apprenticeship lifecycle policy → ApprenticeshipRules
 *       - the role catalogue or specialization membership → RoleRules
 *       - state reads                          → ProfessionalQueries
 *       - state writes                         → ProfessionalCommands
 *
 * SKILL THRESHOLDS
 *
 *   Every skill number is read from SkillUtils at load time. This file
 *   does not restate 0, 1, 26, 51, 76, or 91. If SkillUtils moves a
 *   threshold, this file moves with it. The exports below mirror the
 *   canonical values for convenience; they are not a second source of
 *   truth.
 *
 * DEPENDENCIES (must be loaded first):
 *   - relationship-types.js (RELATIONSHIP_ARCHETYPES, RELATIONSHIP_STATUS)
 *   - relationship-utils.js (RelationshipUtils)
 *   - skill-utils.js        (SkillUtils)
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HARD DEPENDENCY CHECK
    // =========================================================================

    if (!window.RELATIONSHIP_ARCHETYPES) {
        throw new Error(
            'professional-rules.js requires relationship-types.js ' +
            '(RELATIONSHIP_ARCHETYPES) first.'
        );
    }
    if (!window.RELATIONSHIP_STATUS) {
        throw new Error(
            'professional-rules.js requires relationship-types.js ' +
            '(RELATIONSHIP_STATUS) first.'
        );
    }
    if (!window.RelationshipUtils) {
        throw new Error(
            'professional-rules.js requires relationship-utils.js ' +
            '(RelationshipUtils) first.'
        );
    }
    if (!window.SkillUtils || typeof window.SkillUtils.getThresholds !== 'function') {
        throw new Error(
            'professional-rules.js requires skill-utils.js (SkillUtils) first.'
        );
    }

    var A = window.RELATIONSHIP_ARCHETYPES;
    var STATUS = window.RELATIONSHIP_STATUS;
    var Utils = window.RelationshipUtils;
    var SU = window.SkillUtils;

    var APPRENTICESHIP   = A.APPRENTICESHIP;
    var MASTERSHIP       = A.MASTERSHIP;
    var EMPLOYMENT       = A.EMPLOYMENT;
    var GUILD_MEMBERSHIP = A.GUILD_MEMBERSHIP;

    var THRESHOLDS = SU.getThresholds();

    // =========================================================================
    // 2. PROFESSIONAL ARCHETYPE PREDICATE
    // =========================================================================

    var PROFESSIONAL_TYPES = {};
    PROFESSIONAL_TYPES[APPRENTICESHIP]   = true;
    PROFESSIONAL_TYPES[MASTERSHIP]       = true;
    PROFESSIONAL_TYPES[EMPLOYMENT]       = true;
    PROFESSIONAL_TYPES[GUILD_MEMBERSHIP] = true;

    function isProfessionalArchetype(type) {
        return !!PROFESSIONAL_TYPES[type];
    }

    // =========================================================================
    // 3. TRANSITION TABLES
    // =========================================================================
    //
    // All four professional archetypes share the same simple lifecycle:
    //
    //     ongoing → ended
    //     ended   → (terminal)
    //
    // A new relationship is a new record. Status is opaque to State.

    var APPRENTICESHIP_TRANSITIONS = Utils.freezeTable({
        'ongoing': { 'ended': true },
        'ended':   {}
    });

    var MASTERSHIP_TRANSITIONS = Utils.freezeTable({
        'ongoing': { 'ended': true },
        'ended':   {}
    });

    var EMPLOYMENT_TRANSITIONS = Utils.freezeTable({
        'ongoing': { 'ended': true },
        'ended':   {}
    });

    var GUILD_MEMBERSHIP_TRANSITIONS = Utils.freezeTable({
        'ongoing': { 'ended': true },
        'ended':   {}
    });

    function getTransitionTable(archetype) {
        if (archetype === APPRENTICESHIP)   return APPRENTICESHIP_TRANSITIONS;
        if (archetype === MASTERSHIP)       return MASTERSHIP_TRANSITIONS;
        if (archetype === EMPLOYMENT)       return EMPLOYMENT_TRANSITIONS;
        if (archetype === GUILD_MEMBERSHIP) return GUILD_MEMBERSHIP_TRANSITIONS;
        return null;
    }

    /**
     * @param {Object} facts  { archetype, from, to }
     * @returns {{ valid: boolean, errors?: string[] }}
     */
    function canTransition(facts) {
        if (!facts || typeof facts !== 'object') {
            return { valid: false, errors: ['missing_facts'] };
        }
        var table = getTransitionTable(facts.archetype);
        if (!table) {
            return { valid: false, errors: ['unknown_archetype:' + facts.archetype] };
        }
        return Utils.validateStatusTransition(facts.from, facts.to, table);
    }

    // =========================================================================
    // 4. ATTRIBUTE SET
    // =========================================================================
    //
    // Professional relationships have no attributes in v1. Structural
    // validation still runs (empty array permitted, non-empty rejected).

    var PROFESSIONAL_ALLOWED_ATTRIBUTES = Object.freeze({});

    function validateAttributes(attributes) {
        if (attributes === undefined || attributes === null) {
            return { valid: true, errors: [], unknown: [] };
        }
        if (!Array.isArray(attributes)) {
            return { valid: false, errors: ['attributes_not_array'], unknown: [] };
        }
        if (attributes.length === 0) {
            return { valid: true, errors: [], unknown: [] };
        }
        return {
            valid: false,
            errors: ['professional_has_no_attributes'],
            unknown: attributes.slice()
        };
    }

    // =========================================================================
    // 5. SKILL — DELEGATED TO SkillUtils
    // =========================================================================
    //
    // Every skill number and every tier classification is read from
    // SkillUtils. The exports below mirror the canonical values for
    // convenience; they are not a second source of truth.

    var SKILL_MIN     = SU.clampLevel(0);        // 0
    var SKILL_MAX     = SU.clampLevel(100);      // 100
    var SKILL_DEFAULT = 0;

    var TEACHING_MIN_SKILL = THRESHOLDS.JOURNEYMAN;   // 51
    var MASTER_MIN_SKILL   = THRESHOLDS.EXPERT;       // 76

    function clampSkill(value) {
        return SU.clampLevel(value);
    }

    function skillTier(skill) {
        return SU.getTierId(skill);
    }

    function canTeach(skillLevel, minSkill) {
        var threshold = (typeof minSkill === 'number')
            ? minSkill
            : TEACHING_MIN_SKILL;
        return SU.clampLevel(skillLevel) >= threshold;
    }

    // =========================================================================
    // 6. APPRENTICESHIP VALIDATORS
    // =========================================================================
    //
    // Apprenticeship lifecycle policy — teaching outcomes, progression
    // curves, completion thresholds — lives in ApprenticeshipRules.
    // These validators cover only what the professional-edge layer needs
    // to know at creation and transition time.

    /**
     * @param {Object} facts
     * @param {string} facts.masterId
     * @param {string} facts.apprenticeId
     * @param {number} [facts.masterSkillLevel]
     * @param {number} [facts.apprenticeSkillLevel]
     * @param {number} [facts.masterAge]
     * @param {number} [facts.apprenticeAge]
     * @param {string} facts.roleId
     * @returns {{ valid: boolean, errors: string[] }}
     */
    function canCreateApprenticeship(facts) {
        var errors = [];
        if (!facts || typeof facts !== 'object') {
            return { valid: false, errors: ['missing_facts'] };
        }

        if (typeof facts.masterId !== 'string' || facts.masterId.length === 0) {
            errors.push('missing_masterId');
        }
        if (typeof facts.apprenticeId !== 'string' || facts.apprenticeId.length === 0) {
            errors.push('missing_apprenticeId');
        }
        if (facts.masterId && facts.apprenticeId &&
            facts.masterId === facts.apprenticeId) {
            errors.push('same_person');
        }
        if (typeof facts.roleId !== 'string' || facts.roleId.length === 0) {
            errors.push('missing_roleId');
        }

        if (typeof facts.masterAge === 'number' && facts.masterAge < 16) {
            errors.push('master_too_young');
        }
        if (typeof facts.apprenticeAge === 'number' && facts.apprenticeAge < 7) {
            errors.push('apprentice_too_young');
        }

        if (typeof facts.masterSkillLevel === 'number' &&
            !canTeach(facts.masterSkillLevel)) {
            errors.push('master_skill_too_low');
        }

        if (typeof facts.masterSkillLevel === 'number' &&
            typeof facts.apprenticeSkillLevel === 'number' &&
            facts.apprenticeSkillLevel >= facts.masterSkillLevel) {
            errors.push('apprentice_already_at_level');
        }

        return { valid: errors.length === 0, errors: errors };
    }

    /**
     * @param {Object} facts  { status }
     * @returns {{ valid: boolean, errors: string[] }}
     */
    function canProgressApprenticeship(facts) {
        if (!facts || typeof facts !== 'object') {
            return { valid: false, errors: ['missing_facts'] };
        }
        var errors = [];
        if (facts.status !== STATUS.ONGOING) {
            errors.push('not_active');
        }
        return { valid: errors.length === 0, errors: errors };
    }

    /**
     * @param {Object} facts  { status, skillLevel? }
     * @returns {{ valid: boolean, errors: string[] }}
     */
    function canCompleteApprenticeship(facts) {
        if (!facts || typeof facts !== 'object') {
            return { valid: false, errors: ['missing_facts'] };
        }
        var errors = [];
        if (facts.status !== STATUS.ONGOING) {
            errors.push('not_active');
        }
        if (facts.skillLevel !== undefined && facts.skillLevel !== null) {
            if (typeof facts.skillLevel !== 'number' || isNaN(facts.skillLevel)) {
                errors.push('invalid_final_skill');
            }
        }
        return { valid: errors.length === 0, errors: errors };
    }

    // =========================================================================
    // 7. EMPLOYMENT VALIDATORS
    // =========================================================================

    /**
     * @param {Object} facts
     * @param {string} facts.employerId
     * @param {string} facts.employeeId
     * @param {number} [facts.employerAge]
     * @param {number} [facts.employeeAge]
     * @returns {{ valid: boolean, errors: string[] }}
     */
    function canCreateEmployment(facts) {
        var errors = [];
        if (!facts || typeof facts !== 'object') {
            return { valid: false, errors: ['missing_facts'] };
        }

        if (typeof facts.employerId !== 'string' || facts.employerId.length === 0) {
            errors.push('missing_employerId');
        }
        if (typeof facts.employeeId !== 'string' || facts.employeeId.length === 0) {
            errors.push('missing_employeeId');
        }
        if (facts.employerId && facts.employeeId &&
            facts.employerId === facts.employeeId) {
            errors.push('same_person');
        }
        if (typeof facts.employeeAge === 'number' && facts.employeeAge < 12) {
            errors.push('employee_too_young');
        }

        return { valid: errors.length === 0, errors: errors };
    }

    // =========================================================================
    // 8. GUILD MEMBERSHIP VALIDATORS
    // =========================================================================

    /**
     * @param {Object} facts
     * @param {string} facts.guildId
     * @param {string} facts.memberId
     * @param {number} [facts.memberAge]
     * @param {string} [facts.rank]
     * @returns {{ valid: boolean, errors: string[] }}
     */
    function canCreateGuildMembership(facts) {
        var errors = [];
        if (!facts || typeof facts !== 'object') {
            return { valid: false, errors: ['missing_facts'] };
        }

        if (typeof facts.guildId !== 'string' || facts.guildId.length === 0) {
            errors.push('missing_guildId');
        }
        if (typeof facts.memberId !== 'string' || facts.memberId.length === 0) {
            errors.push('missing_memberId');
        }
        if (facts.guildId && facts.memberId &&
            facts.guildId === facts.memberId) {
            errors.push('same_person');
        }
        if (typeof facts.memberAge === 'number' && facts.memberAge < 14) {
            errors.push('member_too_young');
        }

        return { valid: errors.length === 0, errors: errors };
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.ProfessionalRules = {
        // Predicate
        isProfessionalArchetype: isProfessionalArchetype,

        // Transition tables (read-only)
        APPRENTICESHIP_TRANSITIONS: APPRENTICESHIP_TRANSITIONS,
        MASTERSHIP_TRANSITIONS: MASTERSHIP_TRANSITIONS,
        EMPLOYMENT_TRANSITIONS: EMPLOYMENT_TRANSITIONS,
        GUILD_MEMBERSHIP_TRANSITIONS: GUILD_MEMBERSHIP_TRANSITIONS,
        getTransitionTable: getTransitionTable,
        canTransition: canTransition,

        // Attribute set
        PROFESSIONAL_ALLOWED_ATTRIBUTES: PROFESSIONAL_ALLOWED_ATTRIBUTES,
        validateAttributes: validateAttributes,

        // Skill — mirrors SkillUtils, provided here for role-domain convenience
        SKILL_MIN: SKILL_MIN,
        SKILL_MAX: SKILL_MAX,
        SKILL_DEFAULT: SKILL_DEFAULT,
        TEACHING_MIN_SKILL: TEACHING_MIN_SKILL,
        MASTER_MIN_SKILL: MASTER_MIN_SKILL,
        clampSkill: clampSkill,
        skillTier: skillTier,
        canTeach: canTeach,

        // Validators
        canCreateApprenticeship: canCreateApprenticeship,
        canProgressApprenticeship: canProgressApprenticeship,
        canCompleteApprenticeship: canCompleteApprenticeship,
        canCreateEmployment: canCreateEmployment,
        canCreateGuildMembership: canCreateGuildMembership
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.ProfessionalRules;
    }
})();
