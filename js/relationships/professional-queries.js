/**
 * professional-queries.js
 *
 * Semantic reads for professional relationships.
 *
 * DIRECTION
 *   apprenticeship    participantA = master,   participantB = apprentice
 *   mastership        participantA = master,   participantB = expert
 *   employment        participantA = employer, participantB = employee
 *   guild_membership  participantA = guild,    participantB = member
 *
 * Owns:
 *   - projections of professional relationships from the perspective
 *     of either participant
 *   - lookups: masters of, apprentices of, employers of, employees of,
 *     guilds of, members of
 *   - existence checks
 *   - statistics
 *
 * Depends on:
 *   - RelationshipQueries for raw edge reads
 *   - ProfessionalRules for tier classification
 *   - SkillQueries for skill level reads (professional is the domain
 *     allowed to interpret skill data on relationship projections)
 *
 * Does NOT own:
 *   - state access (goes through RelationshipQueries)
 *   - mutation
 *   - persistence
 *   - randomness
 *   - skill writes (SkillCommands / CharacterCommands own them)
 *
 * Every returned value is a defensive projection. Never a live record.
 * Unknown inputs return null or []. No fabrication.
 *
 * Load order: after relationship-queries.js and professional-rules.js.
 */

(function() {
    'use strict';

    var RQ = window.RelationshipQueries;
    var PR = window.ProfessionalRules;

    var A = window.RELATIONSHIP_ARCHETYPES;
    var STATUS = window.RELATIONSHIP_STATUS;

    if (!RQ || !PR || !A || !STATUS) {
        throw new Error('professional-queries.js: relationship-queries.js and professional-rules.js must load first');
    }

    var APPRENTICESHIP   = A.APPRENTICESHIP;
    var MASTERSHIP       = A.MASTERSHIP;
    var EMPLOYMENT       = A.EMPLOYMENT;
    var GUILD_MEMBERSHIP = A.GUILD_MEMBERSHIP;

    // -------------------------------------------------------------------------
    // SKILL PROVIDER (required for skill-aware projections)
    //
    // Skill data lives on the character record. This module never reads
    // it directly; it goes through SkillQueries, which must exist.
    // -------------------------------------------------------------------------

    function _skillProvider() {
        if (!window.SkillQueries) {
            throw new Error('professional-queries.js: SkillQueries required');
        }
        return window.SkillQueries;
    }

    function _skillLevel(characterId, roleId) {
        if (!roleId) return null;
        var sp = _skillProvider();
        if (typeof sp.getSkillLevel !== 'function') {
            throw new Error('professional-queries.js: SkillQueries.getSkillLevel required');
        }
        var level = sp.getSkillLevel(characterId, roleId);
        return (typeof level === 'number') ? level : null;
    }

    function _roleName(roleId) {
        if (!roleId) return null;
        var sp = _skillProvider();
        if (typeof sp.getRoleName !== 'function') return roleId;
        var name = sp.getRoleName(roleId);
        return (typeof name === 'string' && name.length > 0) ? name : roleId;
    }

    // -------------------------------------------------------------------------
    // INTERNAL HELPERS
    // -------------------------------------------------------------------------

    function _otherId(record, characterId) {
        if (record.participantA === characterId) return record.participantB;
        if (record.participantB === characterId) return record.participantA;
        return null;
    }

    function _meta(record, key, fallback) {
        if (!record.metadata) return fallback;
        var v = record.metadata[key];
        return (v === undefined) ? fallback : v;
    }

    function _sortByStartDesc(a, b) {
        var ay = typeof a.startYear === 'number' ? a.startYear : -Infinity;
        var by = typeof b.startYear === 'number' ? b.startYear : -Infinity;
        return by - ay;
    }

    // -------------------------------------------------------------------------
    // APPRENTICESHIP PROJECTIONS
    // -------------------------------------------------------------------------

    function _projectApprenticeshipForMaster(record) {
        var apprenticeId = record.participantB;
        var roleId = _meta(record, 'roleId', null);
        var skill = _skillLevel(apprenticeId, roleId);
        var tier = (skill !== null) ? PR.skillTier(skill) : null;

        return {
            relationshipId: record.id,
            type: APPRENTICESHIP,
            status: record.status,
            masterId: record.participantA,
            apprenticeId: apprenticeId,
            roleId: roleId,
            roleName: _roleName(roleId),
            skillLevel: skill,
            tier: tier,
            specializationsTaught: Array.isArray(_meta(record, 'specializationsTaught', []))
                ? _meta(record, 'specializationsTaught', []).slice()
                : [],
            startYear: record.startYear,
            endYear: record.endYear,
            notes: _meta(record, 'notes', '')
        };
    }

    function _projectApprenticeshipForApprentice(record) {
        var masterId = record.participantA;
        var roleId = _meta(record, 'roleId', null);
        var skill = _skillLevel(record.participantB, roleId);
        var tier = (skill !== null) ? PR.skillTier(skill) : null;

        return {
            relationshipId: record.id,
            type: APPRENTICESHIP,
            status: record.status,
            masterId: masterId,
            apprenticeId: record.participantB,
            roleId: roleId,
            roleName: _roleName(roleId),
            skillLevel: skill,
            tier: tier,
            startYear: record.startYear,
            endYear: record.endYear,
            notes: _meta(record, 'notes', '')
        };
    }

    /**
     * Returns active apprenticeships where the character is master.
     * options: { includeEnded?: boolean }
     */
    function getApprentices(characterId, options) {
        options = options || {};
        var opts = { type: APPRENTICESHIP };
        if (!options.includeEnded) opts.activeOnly = true;

        var records = RQ.getForCharacter(characterId, opts);
        var out = [];
        for (var i = 0; i < records.length; i++) {
            if (records[i].participantA !== characterId) continue;
            out.push(_projectApprenticeshipForMaster(records[i]));
        }
        out.sort(_sortByStartDesc);
        return out;
    }

    function getApprenticeIds(characterId, options) {
        var list = getApprentices(characterId, options);
        var out = [];
        for (var i = 0; i < list.length; i++) out.push(list[i].apprenticeId);
        return out;
    }

    function isMaster(characterId) {
        return getApprentices(characterId).length > 0;
    }

    function getApprenticeCount(characterId) {
        return getApprentices(characterId).length;
    }

    /**
     * Returns active apprenticeships where the character is apprentice.
     * options: { includeEnded?: boolean }
     */
    function getMasterRelationships(characterId, options) {
        options = options || {};
        var opts = { type: APPRENTICESHIP };
        if (!options.includeEnded) opts.activeOnly = true;

        var records = RQ.getForCharacter(characterId, opts);
        var out = [];
        for (var i = 0; i < records.length; i++) {
            if (records[i].participantB !== characterId) continue;
            out.push(_projectApprenticeshipForApprentice(records[i]));
        }
        out.sort(_sortByStartDesc);
        return out;
    }

    function getMasterIds(characterId, options) {
        var list = getMasterRelationships(characterId, options);
        var out = [];
        for (var i = 0; i < list.length; i++) out.push(list[i].masterId);
        return out;
    }

    function getMaster(characterId, options) {
        var ids = getMasterIds(characterId, options);
        return ids.length > 0 ? ids[0] : null;
    }

    function isApprentice(characterId) {
        return getMasterRelationships(characterId).length > 0;
    }

    /**
     * Returns the active apprenticeship between master and apprentice
     * if it exists, or null. Uses master's perspective.
     */
    function getApprenticeshipBetween(masterId, apprenticeId) {
        if (typeof masterId !== 'string' || typeof apprenticeId !== 'string') return null;
        if (masterId === apprenticeId) return null;

        var records = RQ.getActiveBetweenOfType(masterId, apprenticeId, APPRENTICESHIP);
        for (var i = 0; i < records.length; i++) {
            if (records[i].participantA === masterId &&
                records[i].participantB === apprenticeId) {
                return _projectApprenticeshipForMaster(records[i]);
            }
        }
        return null;
    }

    /**
     * Returns the active roleId of the character's apprenticeship, or
     * null if not apprenticed.
     */
    function getApprenticeshipRoleId(characterId) {
        var rels = getMasterRelationships(characterId);
        for (var i = 0; i < rels.length; i++) {
            if (rels[i].roleId) return rels[i].roleId;
        }
        return null;
    }

    // -------------------------------------------------------------------------
    // MASTERSHIP PROJECTIONS
    //
    // A mastership is a distinct archetype: A = master, B = expert.
    // -------------------------------------------------------------------------

    function _projectMastershipForMaster(record) {
        return {
            relationshipId: record.id,
            type: MASTERSHIP,
            status: record.status,
            masterId: record.participantA,
            expertId: record.participantB,
            roleId: _meta(record, 'roleId', null),
            roleName: _roleName(_meta(record, 'roleId', null)),
            startYear: record.startYear,
            endYear: record.endYear,
            notes: _meta(record, 'notes', '')
        };
    }

    function getExperts(characterId, options) {
        options = options || {};
        var opts = { type: MASTERSHIP };
        if (!options.includeEnded) opts.activeOnly = true;

        var records = RQ.getForCharacter(characterId, opts);
        var out = [];
        for (var i = 0; i < records.length; i++) {
            if (records[i].participantA !== characterId) continue;
            out.push(_projectMastershipForMaster(records[i]));
        }
        out.sort(_sortByStartDesc);
        return out;
    }

    function getMasterships(characterId, options) {
        options = options || {};
        var opts = { type: MASTERSHIP };
        if (!options.includeEnded) opts.activeOnly = true;

        var records = RQ.getForCharacter(characterId, opts);
        var out = [];
        for (var i = 0; i < records.length; i++) {
            if (records[i].participantB !== characterId) continue;
            out.push({
                relationshipId: records[i].id,
                type: MASTERSHIP,
                status: records[i].status,
                masterId: records[i].participantA,
                expertId: records[i].participantB,
                roleId: _meta(records[i], 'roleId', null),
                roleName: _roleName(_meta(records[i], 'roleId', null)),
                startYear: records[i].startYear,
                endYear: records[i].endYear
            });
        }
        out.sort(_sortByStartDesc);
        return out;
    }

    // -------------------------------------------------------------------------
    // EMPLOYMENT PROJECTIONS
    // -------------------------------------------------------------------------

    function _projectEmploymentForEmployer(record) {
        var wages = _meta(record, 'wages', null);
        return {
            relationshipId: record.id,
            type: EMPLOYMENT,
            status: record.status,
            employerId: record.participantA,
            employeeId: record.participantB,
            role: _meta(record, 'role', null),
            wages: (typeof wages === 'number') ? wages : null,
            startYear: record.startYear,
            endYear: record.endYear,
            notes: _meta(record, 'notes', '')
        };
    }

    function _projectEmploymentForEmployee(record) {
        var wages = _meta(record, 'wages', null);
        return {
            relationshipId: record.id,
            type: EMPLOYMENT,
            status: record.status,
            employerId: record.participantA,
            employeeId: record.participantB,
            role: _meta(record, 'role', null),
            wages: (typeof wages === 'number') ? wages : null,
            startYear: record.startYear,
            endYear: record.endYear,
            notes: _meta(record, 'notes', '')
        };
    }

    function getEmployees(employerId, options) {
        options = options || {};
        var opts = { type: EMPLOYMENT };
        if (!options.includeEnded) opts.activeOnly = true;

        var records = RQ.getForCharacter(employerId, opts);
        var out = [];
        for (var i = 0; i < records.length; i++) {
            if (records[i].participantA !== employerId) continue;
            out.push(_projectEmploymentForEmployer(records[i]));
        }
        out.sort(_sortByStartDesc);
        return out;
    }

    function getEmployeeIds(employerId, options) {
        var list = getEmployees(employerId, options);
        var out = [];
        for (var i = 0; i < list.length; i++) out.push(list[i].employeeId);
        return out;
    }

    function isEmployer(characterId) {
        return getEmployees(characterId).length > 0;
    }

    function getEmployerRelationships(employeeId, options) {
        options = options || {};
        var opts = { type: EMPLOYMENT };
        if (!options.includeEnded) opts.activeOnly = true;

        var records = RQ.getForCharacter(employeeId, opts);
        var out = [];
        for (var i = 0; i < records.length; i++) {
            if (records[i].participantB !== employeeId) continue;
            out.push(_projectEmploymentForEmployee(records[i]));
        }
        out.sort(_sortByStartDesc);
        return out;
    }

    function getEmployerIds(employeeId, options) {
        var list = getEmployerRelationships(employeeId, options);
        var out = [];
        for (var i = 0; i < list.length; i++) out.push(list[i].employerId);
        return out;
    }

    function getEmployer(employeeId, options) {
        var ids = getEmployerIds(employeeId, options);
        return ids.length > 0 ? ids[0] : null;
    }

    function isEmployed(characterId) {
        return getEmployerRelationships(characterId).length > 0;
    }

    function getEmploymentBetween(employerId, employeeId) {
        if (typeof employerId !== 'string' || typeof employeeId !== 'string') return null;
        if (employerId === employeeId) return null;

        var records = RQ.getActiveBetweenOfType(employerId, employeeId, EMPLOYMENT);
        for (var i = 0; i < records.length; i++) {
            if (records[i].participantA === employerId &&
                records[i].participantB === employeeId) {
                return _projectEmploymentForEmployer(records[i]);
            }
        }
        return null;
    }

    // -------------------------------------------------------------------------
    // GUILD MEMBERSHIP PROJECTIONS
    // -------------------------------------------------------------------------

    function _projectGuildForMember(record) {
        return {
            relationshipId: record.id,
            type: GUILD_MEMBERSHIP,
            status: record.status,
            guildId: record.participantA,
            memberId: record.participantB,
            rank: _meta(record, 'rank', null),
            startYear: record.startYear,
            endYear: record.endYear,
            notes: _meta(record, 'notes', '')
        };
    }

    function getGuildMembers(guildId, options) {
        options = options || {};
        var opts = { type: GUILD_MEMBERSHIP };
        if (!options.includeEnded) opts.activeOnly = true;

        var records = RQ.getForCharacter(guildId, opts);
        var out = [];
        for (var i = 0; i < records.length; i++) {
            if (records[i].participantA !== guildId) continue;
            out.push(_projectGuildForMember(records[i]));
        }
        return out;
    }

    function getGuildMemberIds(guildId, options) {
        var list = getGuildMembers(guildId, options);
        var out = [];
        for (var i = 0; i < list.length; i++) out.push(list[i].memberId);
        return out;
    }

    function getGuildMemberships(characterId, options) {
        options = options || {};
        var opts = { type: GUILD_MEMBERSHIP };
        if (!options.includeEnded) opts.activeOnly = true;

        var records = RQ.getForCharacter(characterId, opts);
        var out = [];
        for (var i = 0; i < records.length; i++) {
            if (records[i].participantB !== characterId) continue;
            out.push(_projectGuildForMember(records[i]));
        }
        return out;
    }

    function getGuildIds(characterId, options) {
        var list = getGuildMemberships(characterId, options);
        var out = [];
        for (var i = 0; i < list.length; i++) out.push(list[i].guildId);
        return out;
    }

    function isInGuild(characterId, guildId) {
        if (typeof characterId !== 'string' || characterId.length === 0) return false;
        var memberships = getGuildMemberships(characterId);
        if (typeof guildId !== 'string' || guildId.length === 0) {
            return memberships.length > 0;
        }
        for (var i = 0; i < memberships.length; i++) {
            if (memberships[i].guildId === guildId) return true;
        }
        return false;
    }

    function getGuildMembership(characterId, guildId) {
        if (typeof characterId !== 'string' || typeof guildId !== 'string') return null;
        var memberships = getGuildMemberships(characterId);
        for (var i = 0; i < memberships.length; i++) {
            if (memberships[i].guildId === guildId) return memberships[i];
        }
        return null;
    }

    function getGuildRank(characterId, guildId) {
        var m = getGuildMembership(characterId, guildId);
        return m ? m.rank : null;
    }

    // -------------------------------------------------------------------------
    // GENERAL
    // -------------------------------------------------------------------------

    function getProfessionalRelationships(characterId, options) {
        options = options || {};
        var types = options.type
            ? [options.type]
            : [APPRENTICESHIP, MASTERSHIP, EMPLOYMENT, GUILD_MEMBERSHIP];

        var out = [];
        for (var t = 0; t < types.length; t++) {
            var opts = { type: types[t] };
            if (!options.includeEnded) opts.activeOnly = true;
            var records = RQ.getForCharacter(characterId, opts);
            for (var i = 0; i < records.length; i++) {
                out.push({
                    relationshipId: records[i].id,
                    type: records[i].type,
                    status: records[i].status,
                    participantA: records[i].participantA,
                    participantB: records[i].participantB,
                    otherId: _otherId(records[i], characterId),
                    startYear: records[i].startYear,
                    endYear: records[i].endYear
                });
            }
        }
        return out;
    }

    function getProfessionalRelationshipsBetween(aId, bId, options) {
        options = options || {};
        if (typeof aId !== 'string' || typeof bId !== 'string') return [];
        if (aId === bId) return [];

        var types = options.type
            ? [options.type]
            : [APPRENTICESHIP, MASTERSHIP, EMPLOYMENT, GUILD_MEMBERSHIP];

        var out = [];
        for (var t = 0; t < types.length; t++) {
            var records = RQ.getBetweenOfType(aId, bId, types[t]);
            for (var i = 0; i < records.length; i++) {
                if (!options.includeEnded && records[i].status !== STATUS.ONGOING) continue;
                out.push({
                    relationshipId: records[i].id,
                    type: records[i].type,
                    status: records[i].status,
                    participantA: records[i].participantA,
                    participantB: records[i].participantB,
                    startYear: records[i].startYear,
                    endYear: records[i].endYear
                });
            }
        }
        return out;
    }

    function getProfessionalStats(characterId) {
        var all = getProfessionalRelationships(characterId, { includeEnded: true });
        var active = 0;
        var counts = {};

        for (var i = 0; i < all.length; i++) {
            var t = all[i].type;
            counts[t] = (counts[t] || 0) + 1;
            if (all[i].status === STATUS.ONGOING) active++;
        }

        return {
            totalRelationships: all.length,
            activeRelationships: active,
            byType: counts
        };
    }

    // -------------------------------------------------------------------------
    // EXPORTS
    // -------------------------------------------------------------------------

    window.ProfessionalQueries = {
        // Apprenticeship
        getApprentices: getApprentices,
        getApprenticeIds: getApprenticeIds,
        isMaster: isMaster,
        getApprenticeCount: getApprenticeCount,
        getMasterRelationships: getMasterRelationships,
        getMasterIds: getMasterIds,
        getMaster: getMaster,
        isApprentice: isApprentice,
        getApprenticeshipBetween: getApprenticeshipBetween,
        getApprenticeshipRoleId: getApprenticeshipRoleId,

        // Mastership
        getExperts: getExperts,
        getMasterships: getMasterships,

        // Employment
        getEmployees: getEmployees,
        getEmployeeIds: getEmployeeIds,
        isEmployer: isEmployer,
        getEmployerRelationships: getEmployerRelationships,
        getEmployerIds: getEmployerIds,
        getEmployer: getEmployer,
        isEmployed: isEmployed,
        getEmploymentBetween: getEmploymentBetween,

        // Guild
        getGuildMembers: getGuildMembers,
        getGuildMemberIds: getGuildMemberIds,
        getGuildMemberships: getGuildMemberships,
        getGuildIds: getGuildIds,
        isInGuild: isInGuild,
        getGuildMembership: getGuildMembership,
        getGuildRank: getGuildRank,

        // General
        getProfessionalRelationships: getProfessionalRelationships,
        getProfessionalRelationshipsBetween: getProfessionalRelationshipsBetween,
        getProfessionalStats: getProfessionalStats
    };

})();
