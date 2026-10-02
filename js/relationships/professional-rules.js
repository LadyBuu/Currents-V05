/**
 * professional-rules.js
 *
 * Pure policy for professional relationships.
 * No I/O, no state, no mutation.
 */

(function() {
    'use strict';

    var A = window.RELATIONSHIP_ARCHETYPES;
    if (!A) {
        throw new Error('professional-rules.js: relationship-types.js must load first');
    }

    var APPRENTICESHIP  = A.APPRENTICESHIP;
    var MASTERSHIP      = A.MASTERSHIP;
    var EMPLOYMENT      = A.EMPLOYMENT;
    var GUILD_MEMBERSHIP= A.GUILD_MEMBERSHIP;

    var PROFESSIONAL_TYPES = {};
    PROFESSIONAL_TYPES[APPRENTICESHIP]   = true;
    PROFESSIONAL_TYPES[MASTERSHIP]       = true;
    PROFESSIONAL_TYPES[EMPLOYMENT]       = true;
    PROFESSIONAL_TYPES[GUILD_MEMBERSHIP] = true;

    // -------------------------------------------------------------------------
    // SKILL THRESHOLDS
    // -------------------------------------------------------------------------

    var SKILL_MIN = 0;
    var SKILL_MAX = 100;
    var TEACHING_MIN_SKILL = 51;    // journeyman or above
    var MASTER_MIN_SKILL = 76;      // expert or above
    var SKILL_DEFAULT = 0;

    // Skill tiers (stable ids; UI maps to labels)
    var SKILL_TIER = {
        UNTRAINED: 'untrained',
        NOVICE: 'novice',
        APPRENTICE: 'apprentice',
        JOURNEYMAN: 'journeyman',
        EXPERT: 'expert',
        MASTER: 'master'
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
        var threshold = (minSkill !== undefined) ? minSkill : TEACHING_MIN_SKILL;
        return clampSkill(skillLevel) >= threshold;
    }

    // -------------------------------------------------------------------------
    // APPRENTICESHIP
    // -------------------------------------------------------------------------

    /**
     * facts: {
     *   masterId, apprenticeId,
     *   masterSkillLevel,       // in the role being taught
     *   apprenticeSkillLevel,   // current skill in that role
     *   masterAge, apprenticeAge,
     *   roleId
     * }
     */
    function canCreateApprenticeship(facts) {
        var errors = [];
        if (!facts) return { valid: false, errors: ['missing_facts'] };
        if (!facts.masterId || !facts.apprenticeId) errors.push('missing_id');
        if (facts.masterId === facts.apprenticeId) errors.push('same_person');
        if (!facts.roleId) errors.push('missing_role');

        if (typeof facts.masterAge === 'number' && facts.masterAge < 16) {
            errors.push('master_too_young');
        }
        if (typeof facts.apprenticeAge === 'number' && facts.apprenticeAge < 7) {
            errors.push('apprentice_too_young');
        }
        if (!canTeach(facts.masterSkillLevel)) {
            errors.push('master_skill_too_low');
        }
        if (typeof facts.masterSkillLevel === 'number' &&
            typeof facts.apprenticeSkillLevel === 'number' &&
            facts.apprenticeSkillLevel >= facts.masterSkillLevel) {
            errors.push('apprentice_already_at_level');
        }

        return { valid: errors.length === 0, errors: errors };
    }

    function canProgressApprenticeship(facts) {
        var errors = [];
        if (!facts) return { valid: false, errors: ['missing_facts'] };
        if (facts.status && facts.status !== 'ongoing') {
            errors.push('not_active');
        }
        return { valid: errors.length === 0, errors: errors };
    }

    function canCompleteApprenticeship(facts) {
        var errors = [];
        if (!facts) return { valid: false, errors: ['missing_facts'] };
        if (facts.status && facts.status !== 'ongoing') {
            errors.push('not_active');
        }
        if (typeof facts.skillLevel === 'number' && facts.skillLevel < SKILL_MIN) {
            errors.push('invalid_final_skill');
        }
        return { valid: errors.length === 0, errors: errors };
    }

    // -------------------------------------------------------------------------
    // EMPLOYMENT
    // -------------------------------------------------------------------------

    /**
     * facts: { employerId, employeeId, employerAge, employeeAge, role }
     */
    function canCreateEmployment(facts) {
        var errors = [];
        if (!facts) return { valid: false, errors: ['missing_facts'] };
        if (!facts.employerId || !facts.employeeId) errors.push('missing_id');
        if (facts.employerId === facts.employeeId) errors.push('same_person');
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
        if (!facts) return { valid: false, errors: ['missing_facts'] };
        if (!facts.guildId || !facts.memberId) errors.push('missing_id');
        if (facts.guildId === facts.memberId) errors.push('same_person');
        if (typeof facts.memberAge === 'number' && facts.memberAge < 14) {
            errors.push('member_too_young');
        }
        return { valid: errors.length === 0, errors: errors };
    }

    // -------------------------------------------------------------------------
    // GENERIC
    // -------------------------------------------------------------------------

    function isProfessionalType(type) {
        return !!PROFESSIONAL_TYPES[type];
    }

    // -------------------------------------------------------------------------

    window.ProfessionalRules = {
        SKILL_MIN: SKILL_MIN,
        SKILL_MAX: SKILL_MAX,
        SKILL_DEFAULT: SKILL_DEFAULT,
        TEACHING_MIN_SKILL: TEACHING_MIN_SKILL,
        MASTER_MIN_SKILL: MASTER_MIN_SKILL,
        SKILL_TIER: SKILL_TIER,

        clampSkill: clampSkill,
        skillTier: skillTier,
        canTeach: canTeach,

        canCreateApprenticeship: canCreateApprenticeship,
        canProgressApprenticeship: canProgressApprenticeship,
        canCompleteApprenticeship: canCompleteApprenticeship,

        canCreateEmployment: canCreateEmployment,
        canCreateGuildMembership: canCreateGuildMembership,

        isProfessionalType: isProfessionalType
    };

})();
