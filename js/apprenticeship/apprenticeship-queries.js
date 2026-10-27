/**
 * =============================================================================
 * STILL WATERS - APPRENTICESHIP QUERIES
 * js/apprenticeship/apprenticeship-queries.js
 * =============================================================================
 *
 * Read-only semantic queries for apprenticeships. Returns stable
 * projections, never raw records.
 *
 * RULES
 *
 *   - Never mutate.
 *   - Never fall back to legacy globals.
 *   - Never return [] to hide a missing dependency.
 *   - Every projection has a documented shape.
 *   - skillLevel is READ from the profession record (canonical).
 *   - The relationship metadata cache is never used as truth.
 *
 * SKILL AUTHORITY
 *
 *   Skill lives on the character's profession record:
 *
 *       character.professions[i].skillLevel
 *
 *   `CharacterCommands.getProfession(characterId, roleId)` is the
 *   canonical reader. This module reaches it through
 *   `CharacterCommands.getProfession` directly. It never reaches into
 *   `character.professions` and it never reads a cached
 *   `metadata.skillLevel`.
 *
 * ROLEID CONTRACT
 *
 *   `getApprenticeship(masterId, apprenticeId, roleId)` requires
 *   roleId. A character may have concurrent apprenticeships with
 *   multiple masters for different roles. Silently returning the first
 *   ongoing relationship when roleId is omitted is a bug, not a feature.
 *
 *   Callers that do not know the role should use
 *   `getOngoingApprenticeships(masterId, apprenticeId)`, which returns
 *   an array, or `getOngoingApprenticeship(masterId, apprenticeId)`,
 *   which returns the single result and fails loudly if the pair has
 *   more than one.
 *
 * EDGE SOURCE
 *
 *   All edge reads route through RelationshipQueries. This module does
 *   NOT go through ProfessionalQueries for apprenticeship edge reads:
 *   ProfessionalQueries is a generic professional-edge projection layer
 *   and returns its own shape, while this module needs the raw
 *   RelationshipState records so that projectApprenticeship can
 *   assemble the domain-specific view. The raw records come from
 *   RelationshipQueries, which is the canonical edge reader.
 *
 * DEPENDENCIES (required, checked at load):
 *   - RelationshipQueries       (edge reads)
 *   - CharacterCommands         (getProfession)
 *   - RoleState                 (getRole)
 *   - ApprenticeshipRules       (getStageForSkill)
 *   - accessors                 (getCharacterById)
 *   - time                      (getCurrentYearSafe)
 *   - relationship-types        (RELATIONSHIP_ARCHETYPES, RELATIONSHIP_STATUS)
 *
 * DEPENDENCIES (required for findPotentialMasters only):
 *   - SettlementQueries         (getSettlementMastersByRole)
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
            'apprenticeship-queries.js requires relationship-types.js ' +
            '(RELATIONSHIP_ARCHETYPES) first.'
        );
    }
    if (!window.RELATIONSHIP_STATUS) {
        throw new Error(
            'apprenticeship-queries.js requires relationship-types.js ' +
            '(RELATIONSHIP_STATUS) first.'
        );
    }
    if (!window.RelationshipQueries) {
        throw new Error(
            'apprenticeship-queries.js requires relationship-queries.js ' +
            '(RelationshipQueries) first.'
        );
    }
    if (!window.CharacterCommands ||
        typeof window.CharacterCommands.getProfession !== 'function') {
        throw new Error(
            'apprenticeship-queries.js requires character-commands.js ' +
            '(CharacterCommands.getProfession) first.'
        );
    }
    if (!window.RoleState || typeof window.RoleState.getRole !== 'function') {
        throw new Error(
            'apprenticeship-queries.js requires role-state.js ' +
            '(RoleState.getRole) first.'
        );
    }
    if (!window.ApprenticeshipRules ||
        typeof window.ApprenticeshipRules.getStageForSkill !== 'function') {
        throw new Error(
            'apprenticeship-queries.js requires apprenticeship-rules.js ' +
            '(ApprenticeshipRules.getStageForSkill) first.'
        );
    }
    if (typeof window.getCharacterById !== 'function') {
        throw new Error(
            'apprenticeship-queries.js requires accessors.js ' +
            '(getCharacterById) first.'
        );
    }
    if (typeof window.getCurrentYearSafe !== 'function') {
        throw new Error(
            'apprenticeship-queries.js requires time.js ' +
            '(getCurrentYearSafe) first.'
        );
    }

    var A = window.RELATIONSHIP_ARCHETYPES;
    var STATUS = window.RELATIONSHIP_STATUS;
    var RQ = window.RelationshipQueries;
    var CC = window.CharacterCommands;
    var RS = window.RoleState;

    var APPRENTICESHIP = A.APPRENTICESHIP;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCharacterById(id) {
        return window.getCharacterById(id);
    }

    function _getCurrentYearSafe() {
        return window.getCurrentYearSafe();
    }

    // =========================================================================
    // 3. SKILL / ROLE READS
    // =========================================================================
    //
    // Skill is a field on the character's profession record. The
    // profession record is owned by CharacterCommands. This module reads
    // it through that module's accessor. There is no metadata.skillLevel
    // cache to consult.

    function getProfessionRecord(characterId, roleId) {
        return CC.getProfession(characterId, roleId);
    }

    /**
     * Returns the character's skill in the role, or null if the character
     * does not hold that role. Null and 0 are different: 0 is a real
     * skill value for a character who holds the role but has no training.
     */
    function getSkillLevel(characterId, roleId) {
        var profession = getProfessionRecord(characterId, roleId);
        if (!profession) return null;
        return typeof profession.skillLevel === 'number'
            ? profession.skillLevel
            : 0;
    }

    function hasRole(characterId, roleId) {
        return getProfessionRecord(characterId, roleId) !== null;
    }

    function getRole(roleId) {
        return roleId ? RS.getRole(roleId) : null;
    }

    // =========================================================================
    // 4. RELATIONSHIP LOOKUP
    // =========================================================================
    //
    // All edge reads route through RelationshipQueries. That module owns
    // the archetype filter and returns raw records (RelationshipState
    // projections), which projectApprenticeship consumes.

    /**
     * Raw relationship records between (master, apprentice) with type
     * apprenticeship. Includes ended records.
     *
     * @returns {Array<Object>}  Raw records from RelationshipQueries.
     */
    function getApprenticeshipRelationships(masterId, apprenticeId) {
        if (typeof masterId !== 'string' || typeof apprenticeId !== 'string') {
            return [];
        }
        if (masterId === apprenticeId) return [];
        return RQ.getBetweenOfType(masterId, apprenticeId, APPRENTICESHIP);
    }

    /**
     * The ongoing apprenticeship for (master, apprentice, roleId).
     *
     * roleId is REQUIRED. A character may have concurrent apprenticeships
     * with multiple masters for different roles. If roleId is omitted,
     * this function throws rather than silently returning an arbitrary
     * record.
     *
     * @param {string} masterId
     * @param {string} apprenticeId
     * @param {string} roleId
     * @returns {Object|null}  Raw record or null.
     */
    function getApprenticeship(masterId, apprenticeId, roleId) {
        if (!roleId) {
            throw new Error(
                'ApprenticeshipQueries.getApprenticeship: roleId is required. ' +
                'Use getOngoingApprenticeship(masterId, apprenticeId) if the ' +
                'role is not known.'
            );
        }
        if (typeof masterId !== 'string' || typeof apprenticeId !== 'string') {
            return null;
        }
        if (masterId === apprenticeId) return null;

        var records = getApprenticeshipRelationships(masterId, apprenticeId);
        for (var i = 0; i < records.length; i++) {
            var rel = records[i];
            if (rel.status !== STATUS.ONGOING) continue;
            if (!rel.metadata) continue;
            if (rel.metadata.roleId !== roleId) continue;
            if (rel.participantA !== masterId) continue;
            if (rel.participantB !== apprenticeId) continue;
            return rel;
        }
        return null;
    }

    /**
     * All ongoing apprenticeships for (master, apprentice), across all
     * roles. Returns raw records.
     *
     * @returns {Array<Object>}
     */
    function getOngoingApprenticeships(masterId, apprenticeId) {
        if (typeof masterId !== 'string' || typeof apprenticeId !== 'string') {
            return [];
        }
        if (masterId === apprenticeId) return [];

        var records = getApprenticeshipRelationships(masterId, apprenticeId);
        var out = [];
        for (var i = 0; i < records.length; i++) {
            var rel = records[i];
            if (rel.status !== STATUS.ONGOING) continue;
            if (rel.participantA !== masterId) continue;
            if (rel.participantB !== apprenticeId) continue;
            out.push(rel);
        }
        return out;
    }

    /**
     * The single ongoing apprenticeship for (master, apprentice).
     *
     * Returns null if there are none. Throws if the pair has more than
     * one ongoing apprenticeship — the caller must disambiguate by role.
     *
     * @returns {Object|null}  Raw record or null.
     */
    function getOngoingApprenticeship(masterId, apprenticeId) {
        var ongoing = getOngoingApprenticeships(masterId, apprenticeId);
        if (ongoing.length === 0) return null;
        if (ongoing.length > 1) {
            throw new Error(
                'ApprenticeshipQueries.getOngoingApprenticeship: ' +
                'more than one ongoing apprenticeship between ' +
                masterId + ' and ' + apprenticeId +
                '; use getOngoingApprenticeships() or specify roleId.'
            );
        }
        return ongoing[0];
    }

    function getApprenticeshipById(id) {
        if (typeof id !== 'string' || id.length === 0) return null;
        var rel = RQ.getById(id);
        if (!rel) return null;
        return rel.type === APPRENTICESHIP ? rel : null;
    }

    // =========================================================================
    // 5. PROJECTIONS (stable shapes for UI)
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
    function projectApprenticeship(rel) {
        if (!rel) return null;

        var master = _getCharacterById(rel.participantA);
        var apprentice = _getCharacterById(rel.participantB);
        var meta = rel.metadata || {};
        var roleId = meta.roleId || null;
        var role = roleId ? RS.getRole(roleId) : null;

        // Canonical skill: profession record. No metadata cache fallback.
        var profession = roleId
            ? getProfessionRecord(rel.participantB, roleId)
            : null;
        var skillLevel = profession && typeof profession.skillLevel === 'number'
            ? profession.skillLevel
            : 0;

        var stage = window.ApprenticeshipRules.getStageForSkill(skillLevel);

        var currentYear = _getCurrentYearSafe();
        var startYear = rel.startYear != null ? rel.startYear : null;
        var endYear = rel.endYear != null ? rel.endYear : null;
        var durationYears = null;
        if (startYear != null && currentYear != null) {
            durationYears = (endYear != null ? endYear : currentYear) - startYear;
        }

        return {
            id: rel.id,
            masterId: rel.participantA,
            masterName: master
                ? ((master.name || '') + ' ' + (master.surname || '')).trim()
                : 'Unknown',
            apprenticeId: rel.participantB,
            apprenticeName: apprentice
                ? ((apprentice.name || '') + ' ' + (apprentice.surname || '')).trim()
                : 'Unknown',
            roleId: roleId,
            roleName: role ? role.name : (meta.roleName || 'Unknown'),
            skillLevel: skillLevel,
            stage: {
                id: stage.id,
                name: stage.name,
                minLevel: stage.minLevel,
                maxLevel: stage.maxLevel
            },
            status: rel.status || STATUS.ONGOING,
            startYear: startYear,
            endYear: endYear,
            durationYears: durationYears,
            notes: meta.notes || '',
            specializations: profession && Array.isArray(profession.specs)
                ? profession.specs.slice()
                : [],
            completed: rel.status === 'completed'
        };
    }

    function getApprenticeshipDetails(masterId, apprenticeId, roleId) {
        var rel = getApprenticeship(masterId, apprenticeId, roleId);
        if (!rel) return null;
        return projectApprenticeship(rel);
    }

    // =========================================================================
    // 6. CHARACTER-CENTRIC QUERIES
    // =========================================================================

    function getApprentices(masterId, activeOnly) {
        var records = RQ.getForCharacter(
            masterId,
            activeOnly
                ? { type: APPRENTICESHIP, activeOnly: true }
                : { type: APPRENTICESHIP }
        );
        var results = [];
        for (var i = 0; i < records.length; i++) {
            var rel = records[i];
            if (rel.participantA !== masterId) continue;
            results.push(projectApprenticeship(rel));
        }
        return results;
    }

    /**
     * All masters a character is apprenticed to. Plural by design — a
     * character may have multiple masters for different roles.
     */
    function getMasters(characterId, activeOnly) {
        var records = RQ.getForCharacter(
            characterId,
            activeOnly
                ? { type: APPRENTICESHIP, activeOnly: true }
                : { type: APPRENTICESHIP }
        );
        var results = [];
        for (var i = 0; i < records.length; i++) {
            var rel = records[i];
            if (rel.participantB !== characterId) continue;
            results.push(projectApprenticeship(rel));
        }
        return results;
    }

    /**
     * Convenience: the single active master if exactly one exists. Returns
     * null if none. Throws if more than one active master exists — callers
     * should use getMasters() in that case.
     */
    function getMaster(characterId) {
        var masters = getMasters(characterId, true);
        if (masters.length === 0) return null;
        if (masters.length > 1) {
            throw new Error(
                'getMaster: character has multiple active masters; ' +
                'use getMasters()'
            );
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
        return RS.getRole(masters[0].roleId);
    }

    // =========================================================================
    // 7. AGGREGATE QUERIES
    // =========================================================================

    function getAllApprenticeships(filter) {
        var records = RQ.getByType(APPRENTICESHIP);
        var results = [];
        for (var i = 0; i < records.length; i++) {
            var rel = records[i];
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

    function getApprenticeshipsByRole(roleId) {
        var records = RQ.getByType(APPRENTICESHIP);
        var results = [];
        for (var i = 0; i < records.length; i++) {
            var rel = records[i];
            if (!rel.metadata) continue;
            if (rel.metadata.roleId !== roleId) continue;
            results.push(projectApprenticeship(rel));
        }
        return results;
    }

    // =========================================================================
    // 8. TEACHABILITY / DISCOVERY
    // =========================================================================

    /**
     * Returns the master's professions whose skill reaches the teaching
     * threshold, as { id, name, skillLevel } projections.
     *
     * Reads through CharacterCommands.getProfessions, which is the
     * canonical profession reader. Does NOT reach into
     * character.professions directly — some character projections strip
     * that field, and relying on it would silently return [] for those
     * callers.
     *
     * @param {string} masterId
     * @returns {Array<{ id: string, name: string, skillLevel: number }>}
     */
    function getTeachableSkills(masterId) {
        var professions = CC.getProfessions(masterId);
        if (!Array.isArray(professions) || professions.length === 0) return [];

        var minSkill = window.TEACHING_CONSTANTS
            ? window.TEACHING_CONSTANTS.MIN_MASTER_SKILL
            : null;
        if (typeof minSkill !== 'number') {
            throw new Error(
                'ApprenticeshipQueries.getTeachableSkills: ' +
                'TEACHING_CONSTANTS.MIN_MASTER_SKILL is required.'
            );
        }

        var results = [];
        for (var i = 0; i < professions.length; i++) {
            var prof = professions[i];
            var skill = typeof prof.skillLevel === 'number' ? prof.skillLevel : 0;
            if (skill < minSkill) continue;
            results.push({
                id: prof.id,
                name: prof.name || prof.id,
                skillLevel: skill
            });
        }
        return results;
    }

    /**
     * Finds characters who could serve as masters for a role at a location.
     *
     * SettlementQueries is required. Silent empty results hide load-order
     * problems; a missing dependency should be visible.
     */
    function findPotentialMasters(roleId, locationId, minSkillLevel) {
        if (typeof window.SettlementQueries === 'undefined' ||
            typeof window.SettlementQueries.getSettlementMastersByRole !== 'function') {
            throw new Error(
                'ApprenticeshipQueries.findPotentialMasters: ' +
                'SettlementQueries.getSettlementMastersByRole is required.'
            );
        }

        var threshold = (typeof minSkillLevel === 'number')
            ? minSkillLevel
            : (window.TEACHING_CONSTANTS
                ? window.TEACHING_CONSTANTS.MIN_MASTER_SKILL
                : null);

        if (typeof threshold !== 'number') {
            throw new Error(
                'ApprenticeshipQueries.findPotentialMasters: ' +
                'minSkillLevel or TEACHING_CONSTANTS.MIN_MASTER_SKILL is required.'
            );
        }

        var raw = window.SettlementQueries.getSettlementMastersByRole(
            locationId, roleId
        ) || [];

        var results = [];
        for (var i = 0; i < raw.length; i++) {
            var entry = raw[i];
            if (entry && typeof entry.skillLevel === 'number') {
                if (entry.skillLevel < threshold) continue;
                results.push(entry);
            } else {
                results.push(entry);
            }
        }
        return results;
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.ApprenticeshipQueries = {
        // skill (canonical = profession record)
        getSkillLevel: getSkillLevel,
        getProfessionRecord: getProfessionRecord,
        hasRole: hasRole,
        getRole: getRole,

        // relationship lookup
        getApprenticeship: getApprenticeship,
        getOngoingApprenticeship: getOngoingApprenticeship,
        getOngoingApprenticeships: getOngoingApprenticeships,
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
        getApprenticeshipsByRole: getApprenticeshipsByRole,

        // discovery
        getTeachableSkills: getTeachableSkills,
        findPotentialMasters: findPotentialMasters
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.ApprenticeshipQueries;
    }
})();
