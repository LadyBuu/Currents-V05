/**
 * =============================================================================
 * STILL WATERS - PROFESSIONAL LOGIC
 * =============================================================================
 * 
 * Professional relationship business logic built on top of the relationship registry.
 * Includes: Apprenticeship, Employment, Guild Membership
 * 
 * DEPENDENCIES:
 *   - relationship-registry.js (createRelationship, getRelationshipBetween)
 *   - relationship-types.js (RELATIONSHIP_ARCHETYPES, RELATIONSHIP_STATUS)
 *   - accessors.js (getCharacterById, getCharacters, getRoleById)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getCharacters() {
        return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
    }

    function _getRoleById(id) {
        return typeof window.getRoleById === 'function' ? window.getRoleById(id) : null;
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        if (typeof window.getCurrentYear === 'function') {
            return window.getCurrentYear();
        }
        return 1250;
    }

    function _calculateAge(birthYear, isDeceased, deathYear) {
        if (typeof window.calculateAge === 'function') {
            return window.calculateAge(birthYear, isDeceased, deathYear);
        }
        var currentYear = _getCurrentYear();
        if (!birthYear) return 0;
        if (isDeceased && deathYear) return Math.max(0, deathYear - birthYear);
        return Math.max(0, currentYear - birthYear);
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    function _getSkillLevelName(level) {
        if (typeof window.getSkillLevelName === 'function') {
            return window.getSkillLevelName(level);
        }
        if (level >= 91) return 'Master';
        if (level >= 76) return 'Expert';
        if (level >= 51) return 'Journeyman';
        if (level >= 26) return 'Apprentice';
        if (level >= 1) return 'Novice';
        return 'Untrained';
    }

    function _getStageFromLevel(skillLevel) {
        var stages = window.APPRENTICESHIP_STAGES || {};
        for (var key in stages) {
            var stage = stages[key];
            if (skillLevel >= stage.minLevel && skillLevel <= stage.maxLevel) {
                return stage;
            }
        }
        return stages.NOVICE || { id: 'novice', name: 'Novice', minLevel: 0, maxLevel: 25 };
    }

    // =========================================================================
    // 2. RELATIONSHIP REGISTRY WRAPPERS
    // =========================================================================

    function _createRelationship(idA, idB, options) {
        if (typeof window.createRelationship === 'function') {
            return window.createRelationship(idA, idB, options);
        }
        return null;
    }

    function _getRelationshipBetween(idA, idB) {
        if (typeof window.getRelationshipBetween === 'function') {
            return window.getRelationshipBetween(idA, idB);
        }
        return null;
    }

    function _getRelationshipsForCharacter(id, options) {
        if (typeof window.getRelationshipsForCharacter === 'function') {
            return window.getRelationshipsForCharacter(id, options);
        }
        return [];
    }

    function _updateRelationship(relId, updates) {
        if (typeof window.updateRelationship === 'function') {
            return window.updateRelationship(relId, updates);
        }
        return null;
    }

    function _endRelationship(relId, endYear, reason) {
        if (typeof window.endRelationship === 'function') {
            return window.endRelationship(relId, endYear, reason);
        }
        return false;
    }

    function _addProfession(characterId, roleId, options) {
        if (typeof window.addProfession === 'function') {
            return window.addProfession(characterId, roleId, options);
        }
        return { success: false };
    }

    function _updateProfessionSkill(characterId, roleId, skillLevel) {
        if (typeof window.updateProfessionSkill === 'function') {
            return window.updateProfessionSkill(characterId, roleId, skillLevel);
        }
        return false;
    }

    // =========================================================================
    // 3. CONSTANTS
    // =========================================================================

    var ARCHETYPES = window.RELATIONSHIP_ARCHETYPES || {};
    var STATUS = window.RELATIONSHIP_STATUS || { ONGOING: 'ongoing' };

    // =========================================================================
    // 4. APPRENTICESHIP
    // =========================================================================

    function createApprenticeship(masterId, apprenticeId, options) {
        options = options || {};
        var master = _getCharacterById(masterId);
        var apprentice = _getCharacterById(apprenticeId);

        if (!master || !apprentice) return null;
        if (masterId === apprenticeId) return null;
        if (master.isDeceased || apprentice.isDeceased) return null;

        var roleId = options.roleId;
        if (!roleId) return null;

        var role = _getRoleById(roleId);
        if (!role) return null;

        var masterSkill = 0;
        if (master.professions) {
            for (var i = 0; i < master.professions.length; i++) {
                if (master.professions[i].id === roleId) {
                    masterSkill = master.professions[i].skillLevel || 0;
                    break;
                }
            }
        }

        if (masterSkill < 51) return null;

        var startYear = options.startYear || _getCurrentYear();
        var initialSkill = options.initialSkill !== undefined ? options.initialSkill : 10;
        var initialStage = _getStageFromLevel(initialSkill);

        var relationship = _createRelationship(masterId, apprenticeId, {
            type: ARCHETYPES.APPRENTICESHIP,
            status: STATUS.ONGOING,
            startYear: startYear,
            metadata: {
                roleId: roleId,
                roleName: role.name,
                skillLevel: Math.min(100, Math.max(0, initialSkill)),
                stage: initialStage.id,
                startSkill: initialSkill,
                specializationsTaught: options.specializations || [],
                teachingHistory: [],
                notes: options.notes || ''
            }
        });

        if (relationship) {
            _addProfession(apprenticeId, roleId, {
                skillLevel: initialSkill,
                startYear: startYear,
                learnedVia: 'apprenticeship',
                masterId: masterId,
                notes: 'Apprenticeship under ' + master.name
            });

            _logEvent('professional', 'Apprenticeship Created',
                apprentice.name + ' began apprenticing under ' + master.name + ' as a ' + role.name,
                [master, apprentice]);
        }

        return relationship;
    }

    function getMaster(characterId) {
        var relationships = _getRelationshipsForCharacter(characterId, {
            type: ARCHETYPES.APPRENTICESHIP,
            activeOnly: true
        });

        for (var i = 0; i < relationships.length; i++) {
            var rel = relationships[i];
            if (rel.participantB === characterId) {
                return _getCharacterById(rel.participantA);
            }
        }

        return null;
    }

    function getApprentices(masterId, activeOnly) {
        activeOnly = activeOnly !== undefined ? activeOnly : true;
        var relationships = _getRelationshipsForCharacter(masterId, {
            type: ARCHETYPES.APPRENTICESHIP
        });

        var result = [];

        for (var i = 0; i < relationships.length; i++) {
            var rel = relationships[i];
            if (activeOnly && rel.status !== STATUS.ONGOING) continue;

            var apprenticeId = rel.participantB;
            var apprentice = _getCharacterById(apprenticeId);
            if (!apprentice) continue;

            var metadata = rel.metadata || {};

            result.push({
                id: rel.id,
                character: apprentice,
                roleId: metadata.roleId,
                roleName: metadata.roleName,
                skillLevel: metadata.skillLevel || 0,
                stage: metadata.stage || 'novice',
                startYear: rel.startYear,
                specializationsTaught: metadata.specializationsTaught || [],
                status: rel.status
            });
        }

        result.sort(function(a, b) {
            return b.skillLevel - a.skillLevel;
        });

        return result;
    }

    function progressApprenticeship(masterId, apprenticeId, amount) {
        amount = amount || 5;

        var relationship = _getRelationshipBetween(masterId, apprenticeId);
        if (!relationship || relationship.type !== ARCHETYPES.APPRENTICESHIP) {
            return { success: false, reason: 'Apprenticeship not found' };
        }

        if (relationship.status !== STATUS.ONGOING) {
            return { success: false, reason: 'Apprenticeship is not active' };
        }

        var metadata = relationship.metadata || {};
        var currentLevel = metadata.skillLevel || 0;
        var oldStage = _getStageFromLevel(currentLevel);
        var newLevel = Math.min(100, currentLevel + amount);
        var newStage = _getStageFromLevel(newLevel);

        metadata.skillLevel = newLevel;
        metadata.stage = newStage.id;

        if (!metadata.teachingHistory) metadata.teachingHistory = [];
        metadata.teachingHistory.push({
            gain: amount,
            newLevel: newLevel,
            year: _getCurrentYear()
        });

        _updateRelationship(relationship.id, {
            metadata: metadata
        });

        if (metadata.roleId) {
            _updateProfessionSkill(apprenticeId, metadata.roleId, newLevel);
        }

        var completed = false;
        if (newStage.id === 'master') {
            completed = completeApprenticeship(masterId, apprenticeId);
        }

        return {
            success: true,
            oldLevel: currentLevel,
            newLevel: newLevel,
            gained: newLevel - currentLevel,
            oldStage: oldStage.name,
            newStage: newStage.name,
            stageChanged: oldStage.id !== newStage.id,
            completed: completed
        };
    }

    function completeApprenticeship(masterId, apprenticeId, finalSkillLevel) {
        var relationship = _getRelationshipBetween(masterId, apprenticeId);
        if (!relationship || relationship.type !== ARCHETYPES.APPRENTICESHIP) {
            return false;
        }

        if (relationship.status !== STATUS.ONGOING) {
            return false;
        }

        var metadata = relationship.metadata || {};
        var currentLevel = metadata.skillLevel || 0;
        var finalLevel = finalSkillLevel !== undefined ? finalSkillLevel : Math.max(currentLevel, 76);

        metadata.skillLevel = finalLevel;
        metadata.stage = 'master';

        _updateRelationship(relationship.id, {
            status: 'completed',
            endYear: _getCurrentYear(),
            metadata: metadata
        });

        var apprentice = _getCharacterById(apprenticeId);
        if (apprentice) {
            if (finalLevel >= 51) apprentice.isJourneyman = true;
            if (finalLevel >= 76) apprentice.isMaster = true;

            if (metadata.roleId) {
                _updateProfessionSkill(apprenticeId, metadata.roleId, finalLevel);
            }
        }

        _logEvent('professional', 'Apprenticeship Completed',
            (_getCharacterById(apprenticeId)?.name || 'Apprentice') + ' completed apprenticeship',
            [_getCharacterById(masterId), _getCharacterById(apprenticeId)]);

        return true;
    }

    function endApprenticeship(masterId, apprenticeId, options) {
        options = options || {};
        var relationship = _getRelationshipBetween(masterId, apprenticeId);

        if (!relationship || relationship.type !== ARCHETYPES.APPRENTICESHIP) {
            return false;
        }

        var endYear = options.endYear || _getCurrentYear();
        var reason = options.reason || 'Apprenticeship ended';

        var result = _endRelationship(relationship.id, endYear, reason);

        if (result) {
            _logEvent('professional', 'Apprenticeship Ended',
                'Apprenticeship between ' + (_getCharacterById(masterId)?.name || 'Master') + ' and ' +
                (_getCharacterById(apprenticeId)?.name || 'Apprentice') + ' ended: ' + reason,
                [_getCharacterById(masterId), _getCharacterById(apprenticeId)]);
        }

        return result;
    }

    // =========================================================================
    // 5. EMPLOYMENT
    // =========================================================================

    function createEmployment(employerId, employeeId, options) {
        options = options || {};
        var employer = _getCharacterById(employerId);
        var employee = _getCharacterById(employeeId);

        if (!employer || !employee) return null;
        if (employerId === employeeId) return null;

        var startYear = options.startYear || _getCurrentYear();

        var relationship = _createRelationship(employerId, employeeId, {
            type: ARCHETYPES.EMPLOYMENT,
            status: STATUS.ONGOING,
            startYear: startYear,
            metadata: {
                role: options.role || 'Employee',
                wages: options.wages || 0,
                notes: options.notes || ''
            }
        });

        if (relationship) {
            _logEvent('professional', 'Employment Created',
                employee.name + ' employed by ' + employer.name + ' as ' + (options.role || 'Employee'),
                [employer, employee]);
        }

        return relationship;
    }

    function getEmployer(characterId) {
        var relationships = _getRelationshipsForCharacter(characterId, {
            type: ARCHETYPES.EMPLOYMENT,
            activeOnly: true
        });

        for (var i = 0; i < relationships.length; i++) {
            var rel = relationships[i];
            if (rel.participantB === characterId) {
                return _getCharacterById(rel.participantA);
            }
        }

        return null;
    }

    function getEmployees(employerId, activeOnly) {
        activeOnly = activeOnly !== undefined ? activeOnly : true;
        var relationships = _getRelationshipsForCharacter(employerId, {
            type: ARCHETYPES.EMPLOYMENT
        });

        var result = [];
        for (var i = 0; i < relationships.length; i++) {
            var rel = relationships[i];
            if (activeOnly && rel.status !== STATUS.ONGOING) continue;

            var employeeId = rel.participantB;
            var employee = _getCharacterById(employeeId);
            if (!employee) continue;

            var metadata = rel.metadata || {};

            result.push({
                id: rel.id,
                character: employee,
                role: metadata.role || 'Employee',
                wages: metadata.wages || 0,
                startYear: rel.startYear,
                notes: metadata.notes || '',
                status: rel.status
            });
        }

        return result;
    }

    // =========================================================================
    // 6. GUILD MEMBERSHIP
    // =========================================================================

    function createGuildMembership(guildId, memberId, options) {
        options = options || {};
        var guild = _getCharacterById(guildId);
        var member = _getCharacterById(memberId);

        if (!guild || !member) return null;
        if (guildId === memberId) return null;

        var startYear = options.startYear || _getCurrentYear();

        var relationship = _createRelationship(guildId, memberId, {
            type: ARCHETYPES.GUILD_MEMBERSHIP,
            status: STATUS.ONGOING,
            startYear: startYear,
            metadata: {
                rank: options.rank || 'Member',
                notes: options.notes || ''
            }
        });

        if (relationship) {
            _logEvent('professional', 'Guild Membership Created',
                member.name + ' joined guild ' + guild.name + ' as ' + (options.rank || 'Member'),
                [guild, member]);
        }

        return relationship;
    }

    function getGuildMembers(guildId, activeOnly) {
        activeOnly = activeOnly !== undefined ? activeOnly : true;
        var relationships = _getRelationshipsForCharacter(guildId, {
            type: ARCHETYPES.GUILD_MEMBERSHIP
        });

        var result = [];
        for (var i = 0; i < relationships.length; i++) {
            var rel = relationships[i];
            if (activeOnly && rel.status !== STATUS.ONGOING) continue;

            var memberId = rel.participantB;
            var member = _getCharacterById(memberId);
            if (!member) continue;

            var metadata = rel.metadata || {};

            result.push({
                id: rel.id,
                character: member,
                rank: metadata.rank || 'Member',
                startYear: rel.startYear,
                notes: metadata.notes || '',
                status: rel.status
            });
        }

        return result;
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.ProfessionalLogic = {
        // Apprenticeship
        createApprenticeship: createApprenticeship,
        getMaster: getMaster,
        getApprentices: getApprentices,
        progressApprenticeship: progressApprenticeship,
        completeApprenticeship: completeApprenticeship,
        endApprenticeship: endApprenticeship,

        // Employment
        createEmployment: createEmployment,
        getEmployer: getEmployer,
        getEmployees: getEmployees,

        // Guild
        createGuildMembership: createGuildMembership,
        getGuildMembers: getGuildMembers
    };

    // Legacy aliases
    window.createApprenticeship = createApprenticeship;
    window.getMaster = getMaster;
    window.getApprentices = getApprentices;
    window.progressApprenticeship = progressApprenticeship;
    window.completeApprenticeship = completeApprenticeship;
    window.endApprenticeship = endApprenticeship;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.ProfessionalLogic;
    }

})();