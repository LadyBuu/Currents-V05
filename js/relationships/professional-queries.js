/**
 * =============================================================================
 * STILL WATERS - PROFESSIONAL QUERIES (professional-queries.js)
 * =============================================================================
 *
 * LOCATION: js/social/professional-queries.js
 *
 * Semantic reads for professional relationship edges.
 *
 * DIRECTION
 *
 *   apprenticeship    A = master,     B = apprentice
 *   mastership        A = master,     B = expert
 *   employment        A = employer,   B = employee
 *   guild_membership  A = guild,      B = member
 *
 * OWNERSHIP
 *
 *   ProfessionalQueries owns:
 *       - defensive projections of professional edges, from either
 *         participant's perspective
 *       - existence checks
 *       - counts and simple statistics
 *
 *   ProfessionalQueries does NOT own:
 *       - state access (goes through RelationshipQueries)
 *       - mutation (see ProfessionalCommands)
 *       - apprenticeship lifecycle policy (see ApprenticeshipRules)
 *       - skill storage  (see CharacterCommands.getProfession — the
 *         character domain owns `character.professions`)
 *       - role catalogue (see RoleState.getRole)
 *
 * SKILL READS
 *
 *   Skill is a field on the character's profession record:
 *
 *       character.professions[i].skillLevel
 *
 *   `CharacterCommands.getProfession(characterId, roleId)` is the
 *   canonical accessor. This module reads through it. It does not
 *   reach into `character.professions` directly, and it does not
 *   depend on a `SkillQueries` module.
 *
 * RETURN CONTRACT
 *
 *   Singular lookup:  T | null
 *   Collection:       T[]
 *   Every returned object is a defensive projection. Live records never
 *   leave RelationshipState.
 *
 * DEPENDENCIES (must be loaded first):
 *   - relationship-queries.js (RelationshipQueries)
 *   - professional-rules.js   (ProfessionalRules)
 *   - character-commands.js   (CharacterCommands)
 *   - role-state.js           (RoleState)
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HARD DEPENDENCY CHECK
    // =========================================================================

    if (!window.RelationshipQueries) {
        throw new Error(
            'professional-queries.js requires relationship-queries.js ' +
            '(RelationshipQueries) first.'
        );
    }
    if (!window.ProfessionalRules) {
        throw new Error(
            'professional-queries.js requires professional-rules.js ' +
            '(ProfessionalRules) first.'
        );
    }
    if (!window.RELATIONSHIP_ARCHETYPES) {
        throw new Error(
            'professional-queries.js requires relationship-types.js ' +
            '(RELATIONSHIP_ARCHETYPES) first.'
        );
    }
    if (!window.RELATIONSHIP_STATUS) {
        throw new Error(
            'professional-queries.js requires relationship-types.js ' +
            '(RELATIONSHIP_STATUS) first.'
        );
    }
    if (!window.CharacterCommands ||
        typeof window.CharacterCommands.getProfession !== 'function') {
        throw new Error(
            'professional-queries.js requires character-commands.js ' +
            '(CharacterCommands.getProfession) first.'
        );
    }
    if (!window.RoleState || typeof window.RoleState.getRole !== 'function') {
        throw new Error(
            'professional-queries.js requires role-state.js ' +
            '(RoleState.getRole) first.'
        );
    }

    var RQ = window.RelationshipQueries;
    var PR = window.ProfessionalRules;
    var CC = window.CharacterCommands;
    var RS = window.RoleState;

    var A = window.RELATIONSHIP_ARCHETYPES;
    var STATUS = window.RELATIONSHIP_STATUS;

    var APPRENTICESHIP   = A.APPRENTICESHIP;
    var MASTERSHIP       = A.MASTERSHIP;
    var EMPLOYMENT       = A.EMPLOYMENT;
    var GUILD_MEMBERSHIP = A.GUILD_MEMBERSHIP;

    // =========================================================================
    // 2. SKILL / ROLE PROVIDERS
    // =========================================================================
    //
    // CharacterCommands.getProfession returns the profession record
    // (which carries skillLevel), or null if the character does not
    // hold the role.

    function _skillLevel(characterId, roleId) {
        if (!roleId) return null;
        var profession = CC.getProfession(characterId, roleId);
        if (!profession) return null;
        return typeof profession.skillLevel === 'number'
            ? profession.skillLevel
            : 0;
    }

    function _roleName(roleId) {
        if (!roleId) return null;
        var role = RS.getRole(roleId);
        if (role && typeof role.name === 'string' && role.name.length > 0) {
            return role.name;
        }
        return roleId;
    }

    // =========================================================================
    // 3. INTERNAL HELPERS
    // =========================================================================

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

    function _isActive(record) {
        return record.status === STATUS.ONGOING;
    }

    // =========================================================================
    // 4. APPRENTICESHIP PROJECTIONS
    // =========================================================================

    function _projectApprenticeshipForMaster(record) {
        var apprenticeId = record.participantB;
        var roleId = _meta(record, 'roleId', null);
        var skill = _skillLevel(apprenticeId, roleId);
        var tier = (skill !== null) ? PR.skillTier(skill) : null;
        var specializationsTaught = _meta(record, 'specializationsTaught', []);
        if (!Array.isArray(specializationsTaught)) specializationsTaught = [];

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
            specializationsTaught: specializationsTaught.slice(),
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
     * Active apprenticeships where the character is master.
     * @param {string} characterId
     * @param {Object} [options]  { includeEnded?: boolean }
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
     * Active apprenticeships where the character is apprentice.
     * @param {string} characterId
     * @param {Object} [options]  { includeEnded?: boolean }
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

    /**
     * Convenience: the single active master if exactly one exists, else
     * the most recent. Returns null if none. Callers that need all
     * masters must use getMasterRelationships().
     */
    function getMaster(characterId, options) {
        var ids = getMasterIds(characterId, options);
        return ids.length > 0 ? ids[0] : null;
    }

    function isApprentice(characterId) {
        return getMasterRelationships(characterId).length > 0;
    }

    /**
     * Active apprenticeship between master and apprentice, projected from
     * the master's perspective, or null.
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
     * The active roleId of the character's apprenticeship, or null.
     * If the character has multiple concurrent apprenticeships, returns
     * the role of the most recent one.
     */
    function getApprenticeshipRoleId(characterId) {
        var rels = getMasterRelationships(characterId);
        for (var i = 0; i < rels.length; i++) {
            if (rels[i].roleId) return rels[i].roleId;
        }
        return null;
    }

    /**
     * All active apprenticeships where the character is apprentice.
     * Alias kept for callers that prefer the plural-by-default form.
     */
    function getApprenticeshipRelationships(characterId, options) {
        return getMasterRelationships(characterId, options);
    }

    // =========================================================================
    // 5. MASTERSHIP PROJECTIONS
    // =========================================================================

    function _projectMastershipForMaster(record) {
        var roleId = _meta(record, 'roleId', null);
        return {
            relationshipId: record.id,
            type: MASTERSHIP,
            status: record.status,
            masterId: record.participantA,
            expertId: record.participantB,
            roleId: roleId,
            roleName: _roleName(roleId),
            startYear: record.startYear,
            endYear: record.endYear,
            notes: _meta(record, 'notes', '')
        };
    }

    function _projectMastershipForExpert(record) {
        var roleId = _meta(record, 'roleId', null);
        return {
            relationshipId: record.id,
            type: MASTERSHIP,
            status: record.status,
            masterId: record.participantA,
            expertId: record.participantB,
            roleId: roleId,
            roleName: _roleName(roleId),
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
            out.push(_projectMastershipForExpert(records[i]));
        }
        out.sort(_sortByStartDesc);
        return out;
    }

    // =========================================================================
    // 6. EMPLOYMENT PROJECTIONS
    // =========================================================================

    function _projectEmployment(record) {
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
            out.push(_projectEmployment(records[i]));
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
            out.push(_projectEmployment(records[i]));
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
                return _projectEmployment(records[i]);
            }
        }
        return null;
    }

    // =========================================================================
    // 7. GUILD MEMBERSHIP PROJECTIONS
    // =========================================================================

    function _projectGuildMembership(record) {
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
            out.push(_projectGuildMembership(records[i]));
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
            out.push(_projectGuildMembership(records[i]));
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

    // =========================================================================
    // 8. GENERAL
    // =========================================================================

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
                if (!options.includeEnded && !_isActive(records[i])) continue;
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

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

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
        getApprenticeshipRelationships: getApprenticeshipRelationships,

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

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.ProfessionalQueries;
    }
})();
