/**
 * =============================================================================
 * STILL WATERS - APPRENTICESHIP QUERIES
 * js/apprenticeship/apprenticeship-queries.js
 * =============================================================================
 *
 * Read-only semantic queries. Returns stable projections, never raw records.
 *
 * Rules:
 *   - Never mutate
 *   - Never fall back to legacy globals
 *   - Every projection has a documented shape
 *   - skillLevel is READ from the profession record (canonical)
 *   - metadata.skillLevel is only a cache; it is refreshed on read
 * =============================================================================
 */

(function () {
    'use strict';

    var STAGES = window.APPRENTICESHIP_STAGES || {};
    var STATUS = window.APPRENTICESHIP_STATUS || {};

    // =========================================================================
    // 1. DEPENDENCIES (fail loudly if missing)
    // =========================================================================

    function _require(name, fn) {
        if (typeof fn !== 'function') {
            throw new Error('ApprenticeshipQueries: missing dependency ' + name);
        }
        return fn;
    }

    function _getCharacterById(id) {
        return _require('getCharacterById', window.getCharacterById)(id);
    }
    function _getRoleById(id) {
        return _require('getRoleById', window.getRoleById)(id);
    }
    function _getRelationshipsForCharacter(id, opts) {
        return _require('getRelationshipsForCharacter', window.getRelationshipsForCharacter)(id, opts);
    }
    function _getRelationshipById(id) {
        return _require('getRelationshipById', window.getRelationshipById)(id);
    }
    function _getAllRelationships() {
        return _require('getAllRelationships', window.getAllRelationships)();
    }
    function _getArchetypes() {
        return _require('RELATIONSHIP_ARCHETYPES', window.RELATIONSHIP_ARCHETYPES);
    }

    // =========================================================================
    // 2. PROFESSION RECORD (canonical skill)
    // =========================================================================

    function getProfessionRecord(characterId, roleId) {
        var character = _getCharacterById(characterId);
        if (!character || !character.professions) return null;
        for (var i = 0; i < character.professions.length; i++) {
            if (character.professions[i].id === roleId) {
                return character.professions[i];
            }
        }
        return null;
    }

    function getSkillLevel(characterId, roleId) {
        var profession = getProfessionRecord(characterId, roleId);
        return profession ? (profession.skillLevel || 0) : 0;
    }

    // =========================================================================
    // 3. RELATIONSHIP LOOKUP (typed — never singular generic)
    // =========================================================================

    function getApprenticeshipRelationships(masterId, apprenticeId) {
        var archetypes = _getArchetypes();
        var forMaster = _getRelationshipsForCharacter(masterId, {
            type: archetypes.APPRENTICESHIP
        });
        var results = [];
        for (var i = 0; i < forMaster.length; i++) {
            var rel = forMaster[i];
            if (rel.participantA === masterId && rel.participantB === apprenticeId) {
                results.push(rel);
            }
        }
        return results;
    }

    /**
     * Returns the active apprenticeship for (master, apprentice, roleId).
     * If roleId is omitted, returns the first active one.
     */
    function getApprenticeship(masterId, apprenticeId, roleId) {
        var rels = getApprenticeshipRelationships(masterId, apprenticeId);
        for (var i = 0; i < rels.length; i++) {
            var rel = rels[i];
            if (rel.status !== STATUS.ONGOING) continue;
            if (roleId && rel.metadata && rel.metadata.roleId !== roleId) continue;
            return rel;
        }
        return null;
    }

    function getApprenticeshipById(id) {
        var archetypes = _getArchetypes();
        var rel = _getRelationshipById(id);
        if (rel && rel.type === archetypes.APPRENTICESHIP) return rel;
        return null;
    }

    // =========================================================================
    // 4. PROJECTIONS (stable shapes for UI)
    // =========================================================================

    /**
     * @returns {Object|null}
     * {
     *   id, masterId, masterName,
     *   apprenticeId, apprenticeName,
     *   roleId, roleName,
     *   skillLevel,          // canonical (from profession record)
     *   stage,               // { id, name, minLevel, maxLevel }
     *   status,
     *   startYear, endYear, durationYears,
     *   notes,
     *   specializations,     // from profession record
     *   completed
     * }
     */
    function getApprenticeshipDetails(masterId, apprenticeId, roleId) {
        var rel = getApprenticeship(masterId, apprenticeId, roleId);
        if (!rel) return null;
        return projectApprenticeship(rel);
    }

    function projectApprenticeship(rel) {
        if (!rel) return null;
        var master = _getCharacterById(rel.participantA);
        var apprentice = _getCharacterById(rel.participantB);
        var meta = rel.metadata || {};
        var roleId = meta.roleId || null;
        var role = roleId ? _getRoleById(roleId) : null;

        // Canonical skill: profession record.
        var profession = roleId ? getProfessionRecord(rel.participantB, roleId) : null;
        var skillLevel = profession ? (profession.skillLevel || 0) : (meta.skillLevel || 0);

        var stage = window.ApprenticeshipRules
            ? window.ApprenticeshipRules.getStageForSkill(skillLevel)
            : STAGES.NOVICE;

        var currentYear = (typeof window.getCurrentYearSafe === 'function')
            ? window.getCurrentYearSafe()
            : null;

        var startYear = rel.startYear != null ? rel.startYear : null;
        var endYear = rel.endYear != null ? rel.endYear : null;
        var durationYears = null;
        if (startYear != null && currentYear != null) {
            durationYears = (endYear != null ? endYear : currentYear) - startYear;
        }

        return {
            id: rel.id,
            masterId: rel.participantA,
            masterName: master ? (master.name + ' ' + (master.surname || '')).trim() : 'Unknown',
            apprenticeId: rel.participantB,
            apprenticeName: apprentice ? (apprentice.name + ' ' + (apprentice.surname || '')).trim() : 'Unknown',
            roleId: roleId,
            roleName: role ? role.name : (meta.roleName || 'Unknown'),
            skillLevel: skillLevel,
            stage: { id: stage.id, name: stage.name, minLevel: stage.minLevel, maxLevel: stage.maxLevel },
            status: rel.status || STATUS.ONGOING,
            startYear: startYear,
            endYear: endYear,
            durationYears: durationYears,
            notes: meta.notes || '',
            specializations: profession && profession.specs ? profession.specs.slice() : [],
            completed: rel.status === STATUS.COMPLETED
        };
    }

    // =========================================================================
    // 5. CHARACTER-CENTRIC QUERIES
    // =========================================================================

    function getApprentices(masterId, activeOnly) {
        var archetypes = _getArchetypes();
        var rels = _getRelationshipsForCharacter(masterId, {
            type: archetypes.APPRENTICESHIP
        });
        var results = [];
        for (var i = 0; i < rels.length; i++) {
            var rel = rels[i];
            if (rel.participantA !== masterId) continue;
            if (activeOnly && rel.status !== STATUS.ONGOING) continue;
            results.push(projectApprenticeship(rel));
        }
        return results;
    }

    /**
     * Returns all masters a character is apprenticed to.
     * Plural by design — a character may have multiple masters for different roles.
     */
    function getMasters(characterId, activeOnly) {
        var archetypes = _getArchetypes();
        var rels = _getRelationshipsForCharacter(characterId, {
            type: archetypes.APPRENTICESHIP
        });
        var results = [];
        for (var i = 0; i < rels.length; i++) {
            var rel = rels[i];
            if (rel.participantB !== characterId) continue;
            if (activeOnly && rel.status !== STATUS.ONGOING) continue;
            results.push(projectApprenticeship(rel));
        }
        return results;
    }

    /**
     * Convenience: the single active master (if only one). Returns null if none.
     * Throws if more than one active master exists — caller should use getMasters().
     */
    function getMaster(characterId) {
        var masters = getMasters(characterId, true);
        if (masters.length === 0) return null;
        if (masters.length > 1) {
            throw new Error('getMaster: character has multiple active masters; use getMasters()');
        }
        return masters[0];
    }

    function isApprentice(characterId) {
        return getMasters(characterId, true).length > 0;
    }

    function isMaster(characterId) {
        return getApprentices(characterId, true).length > 0;
    }

    function getApprenticeshipRole(characterId) {
        var masters = getMasters(characterId, true);
        if (masters.length === 0) return null;
        return _getRoleById(masters[0].roleId);
    }

    // =========================================================================
    // 6. AGGREGATE QUERIES
    // =========================================================================

    function getAllApprenticeships(filter) {
        var archetypes = _getArchetypes();
        var rels = _getAllRelationships();
        var results = [];
        for (var i = 0; i < rels.length; i++) {
            var rel = rels[i];
            if (rel.type !== archetypes.APPRENTICESHIP) continue;
            if (filter && filter.status && rel.status !== filter.status) continue;
            results.push(projectApprenticeship(rel));
        }
        return results;
    }

    function getActiveApprenticeships() {
        return getAllApprenticeships({ status: STATUS.ONGOING });
    }

    function getApprenticeshipsByMaster(masterId) {
        return getApprentices(masterId, false);
    }

    function getApprenticeshipsByApprentice(apprenticeId) {
        return getMasters(apprenticeId, false);
    }

    function getApprenticeshipBetween(masterId, apprenticeId, roleId) {
        return getApprenticeshipDetails(masterId, apprenticeId, roleId);
    }

    // =========================================================================
    // 7. TEACHABILITY / DISCOVERY
    // =========================================================================

    function getTeachableSkills(masterId) {
        var master = _getCharacterById(masterId);
        if (!master || !master.professions) return [];
        var minSkill = window.TEACHING_CONSTANTS
            ? window.TEACHING_CONSTANTS.MIN_MASTER_SKILL
            : 51;
        var results = [];
        for (var i = 0; i < master.professions.length; i++) {
            var prof = master.professions[i];
            var skill = prof.skillLevel || 0;
            if (skill < minSkill) continue;
            results.push({
                id: prof.id,
                name: prof.name || prof.id,
                skillLevel: skill
            });
        }
        return results;
    }

    function findPotentialMasters(roleId, locationId, minSkillLevel) {
        if (typeof window.SettlementQueries === 'undefined' ||
            typeof window.SettlementQueries.getSettlementMastersByRole !== 'function') {
            return [];
        }
        return window.SettlementQueries.getSettlementMastersByRole(locationId, roleId) || [];
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.ApprenticeshipQueries = {
        // skill (canonical = profession record)
        getSkillLevel: getSkillLevel,
        getProfessionRecord: getProfessionRecord,

        // relationship lookup
        getApprenticeship: getApprenticeship,
        getApprenticeshipById: getApprenticeshipById,
        getApprenticeshipRelationships: getApprenticeshipRelationships,

        // projections
        getApprenticeshipDetails: getApprenticeshipDetails,
        projectApprenticeship: projectApprenticeship,

        // character-centric
        getApprentices: getApprentices,
        getMasters: getMasters,
        getMaster: getMaster,
        isApprentice: isApprentice,
        isMaster: isMaster,
        getApprenticeshipRole: getApprenticeshipRole,

        // aggregate
        getAllApprenticeships: getAllApprenticeships,
        getActiveApprenticeships: getActiveApprenticeships,
        getApprenticeshipsByMaster: getApprenticeshipsByMaster,
        getApprenticeshipsByApprentice: getApprenticeshipsByApprentice,
        getApprenticeshipBetween: getApprenticeshipBetween,

        // discovery
        getTeachableSkills: getTeachableSkills,
        findPotentialMasters: findPotentialMasters
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.ApprenticeshipQueries;
    }
})();
