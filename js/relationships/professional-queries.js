/**
 * professional-queries.js
 *
 * Semantic reads for professional relationships.
 * Returns defensive projections. Never live entities.
 * No policy, no mutation, no persistence.
 *
 * DIRECTION:
 *   APPRENTICESHIP  participantA = master,   participantB = apprentice
 *   MASTERSHIP      participantA = master,   participantB = expert
 *   EMPLOYMENT      participantA = employer, participantB = employee
 *   GUILD_MEMBERSHIP participantA = guild,   participantB = member
 *
 * SKILL PROVIDER (required):
 *   window.SkillQueries.getSkillLevel(characterId, roleId) -> number
 *   window.SkillQueries.getRoleName(roleId) -> string
 *   These must exist; this module never reaches into character records.
 */

(function() {
    'use strict';

    var RQ = window.RelationshipQueries;
    var A  = window.RELATIONSHIP_ARCHETYPES;
    var STATUS = window.RELATIONSHIP_STATUS;
    var PR = window.ProfessionalRules;

    if (!RQ || !A || !STATUS || !PR) {
        throw new Error('professional-queries.js: relationship-queries.js, relationship-types.js, professional-rules.js must load first');
    }

    var APPRENTICESHIP   = A.APPRENTICESHIP;
    var MASTERSHIP       = A.MASTERSHIP;
    var EMPLOYMENT       = A.EMPLOYMENT;
    var GUILD_MEMBERSHIP = A.GUILD_MEMBERSHIP;

    // -------------------------------------------------------------------------
    // SKILL PROVIDER (required)
    // -------------------------------------------------------------------------

    function _skillProvider() {
        if (!window.SkillQueries) {
            throw new Error('professional-queries.js: SkillQueries required');
        }
        return window.SkillQueries;
    }

    function _roleName(roleId) {
        if (!roleId) return null;
        var sp = _skillProvider();
        if (typeof sp.getRoleName !== 'function') return roleId;
        return sp.getRoleName(roleId) || roleId;
    }

    function _skillLevel(characterId, roleId) {
        var sp = _skillProvider();
        if (typeof sp.getSkillLevel !== 'function') return 0;
        return sp.getSkillLevel(characterId, roleId) || 0;
    }

    // -------------------------------------------------------------------------
    // APPRENTICESHIP
    // -------------------------------------------------------------------------

    function getMasterRelationships(apprenticeId, options) {
        options = options || {};
        var opts = { type: APPRENTICESHIP };
        if (options.activeOnly !== false) opts.status = STATUS.ONGOING;
        var rels = RQ.getForCharacter(apprenticeId, opts);
        var out = [];
        for (var i = 0; i < rels.length; i++) {
            if (rels[i].participantB !== apprenticeId) continue;
            out.push(rels[i]);
        }
        return out;
    }

    function getMasterIds(apprenticeId, options) {
        var rels = getMasterRelationships(apprenticeId, options);
        var ids = [];
        for (var i = 0; i < rels.length; i++) ids.push(rels[i].participantA);
        return ids;
    }

    function getMaster(apprenticeId, options) {
        var ids = getMasterIds(apprenticeId, options);
        return ids.length > 0 ? ids[0] : null;
    }

    function isApprentice(characterId) {
        return getMasterIds(characterId).length > 0;
    }

    /**
     * Returns projections of apprentices for a master.
     */
    function getApprentices(masterId, options) {
        options = options || {};
        var opts = { type: APPRENTICESHIP };
        if (options.activeOnly !== false) opts.status = STATUS.ONGOING;
        var rels = RQ.getForCharacter(masterId, opts);
        var out = [];
        for (var i = 0; i < rels.length; i++) {
            var rel = rels[i];
            if (rel.participantA !== masterId) continue;
            var apprenticeId = rel.participantB;
            var meta = rel.metadata || {};
            var roleId = meta.roleId || null;
            var skill = roleId ? _skillLevel(apprenticeId, roleId) : (meta.skillLevel || 0);

            out.push({
                relationshipId: rel.id,
                apprenticeId: apprenticeId,
                roleId: roleId,
                roleName: _roleName(roleId),
                skillLevel: skill,
                tier: PR.skillTier(skill),
                startYear: rel.startYear,
                endYear: rel.endYear,
                status: rel.status,
                specializationsTaught: meta.specializationsTaught || []
            });
        }
        out.sort(function(a, b) { return b.skillLevel - a.skillLevel; });
        return out;
    }

    function isMaster(characterId) {
        return getApprentices(characterId, { activeOnly: true }).length > 0;
    }

    function getApprenticeshipBetween(masterId, apprenticeId) {
        var rels = RQ.getBetweenOfType(masterId, apprenticeId, APPRENTICESHIP);
        for (var i = 0; i < rels.length; i++) {
            if (rels[i].participantA === masterId &&
                rels[i].participantB === apprenticeId) {
                return rels[i];
            }
        }
        return null;
    }

    function getApprenticeshipRoleId(apprenticeId) {
        var rels = getMasterRelationships(apprenticeId, { activeOnly: true });
        for (var i = 0; i < rels.length; i++) {
            var meta = rels[i].metadata || {};
            if (meta.roleId) return meta.roleId;
        }
        return null;
    }

    // -------------------------------------------------------------------------
    // EMPLOYMENT
    // -------------------------------------------------------------------------

    function getEmployerRelationships(employeeId, options) {
        options = options || {};
        var opts = { type: EMPLOYMENT };
        if (options.activeOnly !== false) opts.status = STATUS.ONGOING;
        var rels = RQ.getForCharacter(employeeId, opts);
        var out = [];
        for (var i = 0; i < rels.length; i++) {
            if (rels[i].participantB !== employeeId) continue;
            out.push(rels[i]);
        }
        return out;
    }

    function getEmployerIds(employeeId, options) {
        var rels = getEmployerRelationships(employeeId, options);
        var ids = [];
        for (var i = 0; i < rels.length; i++) ids.push(rels[i].participantA);
        return ids;
    }

    function getEmployer(employeeId, options) {
        var ids = getEmployerIds(employeeId, options);
        return ids.length > 0 ? ids[0] : null;
    }

    function isEmployed(characterId) {
        return getEmployerIds(characterId).length > 0;
    }

    function getEmployees(employerId, options) {
        options = options || {};
        var opts = { type: EMPLOYMENT };
        if (options.activeOnly !== false) opts.status = STATUS.ONGOING;
        var rels = RQ.getForCharacter(employerId, opts);
        var out = [];
        for (var i = 0; i < rels.length; i++) {
            var rel = rels[i];
            if (rel.participantA !== employerId) continue;
            var meta = rel.metadata || {};
            out.push({
                relationshipId: rel.id,
                employeeId: rel.participantB,
                role: meta.role || null,
                wages: (typeof meta.wages === 'number') ? meta.wages : null,
                startYear: rel.startYear,
                endYear: rel.endYear,
                status: rel.status,
                notes: meta.notes || ''
            });
        }
        return out;
    }

    function getEmploymentBetween(employerId, employeeId) {
        var rels = RQ.getBetweenOfType(employerId, employeeId, EMPLOYMENT);
        for (var i = 0; i < rels.length; i++) {
            if (rels[i].participantA === employerId &&
                rels[i].participantB === employeeId) {
                return rels[i];
            }
        }
        return null;
    }

    // -------------------------------------------------------------------------
    // GUILD MEMBERSHIP
    // -------------------------------------------------------------------------

    function getGuildMembers(guildId, options) {
        options = options || {};
        var opts = { type: GUILD_MEMBERSHIP };
        if (options.activeOnly !== false) opts.status = STATUS.ONGOING;
        var rels = RQ.getForCharacter(guildId, opts);
        var out = [];
        for (var i = 0; i < rels.length; i++) {
            var rel = rels[i];
            if (rel.participantA !== guildId) continue;
            var meta = rel.metadata || {};
            out.push({
                relationshipId: rel.id,
                memberId: rel.participantB,
                rank: meta.rank || null,
                startYear: rel.startYear,
                endYear: rel.endYear,
                status: rel.status,
                notes: meta.notes || ''
            });
        }
        return out;
    }

    function getGuildMembershipsForCharacter(characterId, options) {
        options = options || {};
        var opts = { type: GUILD_MEMBERSHIP };
        if (options.activeOnly !== false) opts.status = STATUS.ONGOING;
        var rels = RQ.getForCharacter(characterId, opts);
        var out = [];
        for (var i = 0; i < rels.length; i++) {
            var rel = rels[i];
            if (rel.participantB !== characterId) continue;
            var meta = rel.metadata || {};
            out.push({
                relationshipId: rel.id,
                guildId: rel.participantA,
                rank: meta.rank || null,
                startYear: rel.startYear,
                endYear: rel.endYear,
                status: rel.status,
                notes: meta.notes || ''
            });
        }
        return out;
    }

    function isInGuild(characterId, guildId) {
        var rels = RQ.getBetweenOfType(characterId, guildId, GUILD_MEMBERSHIP, { status: STATUS.ONGOING });
        if (!guildId) return rels.length > 0;
        for (var i = 0; i < rels.length; i++) {
            if (rels[i].participantA === guildId &&
                rels[i].participantB === characterId) {
                return true;
            }
        }
        return false;
    }

    function getGuildMembership(characterId, guildId) {
        var rels = RQ.getBetweenOfType(characterId, guildId, GUILD_MEMBERSHIP, { status: STATUS.ONGOING });
        for (var i = 0; i < rels.length; i++) {
            if (rels[i].participantA === guildId &&
                rels[i].participantB === characterId) {
                return rels[i];
            }
        }
        return null;
    }

    function getGuildRank(characterId, guildId) {
        var m = getGuildMembership(characterId, guildId);
        return m && m.metadata ? (m.metadata.rank || null) : null;
    }

    // -------------------------------------------------------------------------
    // GENERAL
    // -------------------------------------------------------------------------

    function getProfessionalRelationships(characterId, options) {
        options = options || {};
        var types = [APPRENTICESHIP, MASTERSHIP, EMPLOYMENT, GUILD_MEMBERSHIP];
        if (options.type) types = [options.type];

        var result = [];
        for (var t = 0; t < types.length; t++) {
            var opts = { type: types[t] };
            if (options.activeOnly !== false) opts.status = STATUS.ONGOING;
            var rels = RQ.getForCharacter(characterId, opts);
            for (var i = 0; i < rels.length; i++) result.push(rels[i]);
        }
        return result;
    }

    function getProfessionalRelationshipsBetween(aId, bId, options) {
        options = options || {};
        var types = [APPRENTICESHIP, MASTERSHIP, EMPLOYMENT, GUILD_MEMBERSHIP];
        if (options.type) types = [options.type];

        var result = [];
        for (var t = 0; t < types.length; t++) {
            var rels = RQ.getBetweenOfType(aId, bId, types[t]);
            for (var i = 0; i < rels.length; i++) {
                if (options.activeOnly !== false && rels[i].status !== STATUS.ONGOING) continue;
                result.push(rels[i]);
            }
        }
        return result;
    }

    // -------------------------------------------------------------------------

    window.ProfessionalQueries = {
        // Apprenticeship
        getMasterRelationships: getMasterRelationships,
        getMasterIds: getMasterIds,
        getMaster: getMaster,
        isApprentice: isApprentice,
        getApprentices: getApprentices,
        isMaster: isMaster,
        getApprenticeshipBetween: getApprenticeshipBetween,
        getApprenticeshipRoleId: getApprenticeshipRoleId,

        // Employment
        getEmployerRelationships: getEmployerRelationships,
        getEmployerIds: getEmployerIds,
        getEmployer: getEmployer,
        isEmployed: isEmployed,
        getEmployees: getEmployees,
        getEmploymentBetween: getEmploymentBetween,

        // Guild
        getGuildMembers: getGuildMembers,
        getGuildMembershipsForCharacter: getGuildMembershipsForCharacter,
        isInGuild: isInGuild,
        getGuildMembership: getGuildMembership,
        getGuildRank: getGuildRank,

        // General
        getProfessionalRelationships: getProfessionalRelationships,
        getProfessionalRelationshipsBetween: getProfessionalRelationshipsBetween
    };

})();
