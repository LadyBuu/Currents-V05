/**
 * professional-rules.js
 *
 * Pure policy for professional relationships.
 *
 * Professional relationships are:
 *   apprenticeship    A = master,    B = apprentice
 *   mastership        A = master,    B = expert
 *   employment        A = employer,  B = employee
 *   guild_membership  A = guild,     B = member
 *
 * Owns:
 *   - transition tables for each professional archetype
 *   - skill scale (bounds, clamping, tiers)
 *   - teaching eligibility (skill floor)
 *   - apprenticeship validation
 *   - employment validation
 *   - guild membership validation
 *   - the professional archetype predicate
 *
 * Does NOT own:
 *   - state access
 *   - mutation
 *   - persistence
 *   - randomness
 *   - skill reads (those come from SkillQueries at call time)
 *   - queries (see professional-queries.js)
 *
 * Skill levels live on the character record. This module never reads
 * them; callers supply explicit values.
 *
 * Every function is deterministic and takes explicit facts.
 *
 * Load order: after relationship-types.js, relationship-utils.js.
 */

(function() {
    'use strict';

    var A = window.RELATIONSHIP_ARCHETYPES;
    var STATUS = window.RELATIONSHIP_STATUS;
    var Utils = window.RelationshipUtils;

    if (!A || !STATUS || !Utils) {
        throw new Error('professional-rules.js: relationship-types.js and relationship-utils.js must load first');
    }

    var APPRENTICESHIP   = A.APPRENTICESHIP;
    var MASTERSHIP       = A.MASTERSHIP;
    var EMPLOYMENT       = A.EMPLOYMENT;
    var GUILD_MEMBERSHIP = A.GUILD_MEMBERSHIP;

    // -------------------------------------------------------------------------
    // PROFESSIONAL ARCHETYPE PREDICATE
    // -------------------------------------------------------------------------

    var PROFESSIONAL_TYPES = {};
    PROFESSIONAL_TYPES[APPRENTICESHIP]   = true;
    PROFESSIONAL_TYPES[MASTERSHIP]       = true;
    PROFESSIONAL_TYPES[EMPLOYMENT]       = true;
    PROFESSIONAL_TYPES[GUILD_MEMBERSHIP] = true;

    function isProfessionalArchetype(type) {
        return !!PROFESSIONAL_TYPES[type];
    }

    // -------------------------------------------------------------------------
    // TRANSITION TABLES
    //
    // All four archetypes share the same simple lifecycle:
    // ongoing -> ended, and ended -> {} (terminal).
    // A new relationship is a new record.
    // -------------------------------------------------------------------------

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
     * facts: { archetype, from, to }
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

    // -------------------------------------------------------------------------
    // ATTRIBUTE SETS
    //
    // Professional relationships have no attributes in v1. Structural
    // validation still runs (empty array permitted).
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // SKILL SCALE
    // -------------------------------------------------------------------------

    var SKILL_MIN = 0;
    var SKILL_MAX = 100;
    var SKILL_DEFAULT = 0;

    var TEACHING_MIN_SKILL = 51;
    var MASTER_MIN_SKILL   = 76;

    var SKILL_TIER = {
        UNTRAINED:  'untrained',
        NOVICE:     'novice',
        APPRENTICE: 'apprentice',
        JOURNEYMAN: 'journeyman',
        EXPERT:     'expert',
        MASTER:     'master'
    };

    function clampSkill(value) {
        if (typeof value !== 'number' || isNaN(value)) return SKILL_DEFAULT;
        if (value < SKILL_MIN) return SKILL_MIN;
        if (value > SKILL_MAX) return SKILL_MAX;
        return value;
    }

    function skillTier(skill) {
        var s = clampSkill(skill);
        if (s >= 91) return SKILL_TIER.MASTER;
        if (s >= 76) return SKILL_TIER.EXPERT;
        if (s >= 51) return SKILL_TIER.JOURNEYMAN;
        if (s >= 26) return SKILL_TIER.APPRENTICE;
        if (s >= 1)  return SKILL_TIER.NOVICE;
        return SKILL_TIER.UNTRAINED;
    }

    function canTeach(skillLevel, minSkill) {
        var threshold = (typeof minSkill === 'number') ? minSkill : TEACHING_MIN_SKILL;
        return clampSkill(skillLevel) >= threshold;
    }

    // -------------------------------------------------------------------------
    // APPRENTICESHIP
    // -------------------------------------------------------------------------

    /**
     * facts: {
     *   masterId, apprenticeId,
     *   masterSkillLevel, apprenticeSkillLevel,
     *   masterAge, apprenticeAge,
     *   roleId
     * }
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
     * facts: { status }
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
     * facts: { status, skillLevel }
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

    // -------------------------------------------------------------------------
    // EMPLOYMENT
    // -------------------------------------------------------------------------

    /**
     * facts: { employerId, employeeId, employerAge, employeeAge }
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

    // -------------------------------------------------------------------------
    // GUILD MEMBERSHIP
    // -------------------------------------------------------------------------

    /**
     * facts: { guildId, memberId, memberAge, rank }
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

    // -------------------------------------------------------------------------
    // EXPORTS
    // -------------------------------------------------------------------------

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

        // Skill
        SKILL_MIN: SKILL_MIN,
        SKILL_MAX: SKILL_MAX,
        SKILL_DEFAULT: SKILL_DEFAULT,
        TEACHING_MIN_SKILL: TEACHING_MIN_SKILL,
        MASTER_MIN_SKILL: MASTER_MIN_SKILL,
        SKILL_TIER: SKILL_TIER,
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

})();
