/**
 * =============================================================================
 * STILL WATERS - PROFESSIONAL LOGIC (PURE QUERY LAYER)
 * =============================================================================
 * 
 * PURE QUERY FUNCTIONS for professional relationships.
 * NO CREATION - creation belongs in domain modules (apprenticeship, industry, household, government).
 * 
 * DEPENDENCIES:
 *   - relationship-registry.js (getRelationshipBetween, getRelationshipsForCharacter)
 *   - relationship-types.js (RELATIONSHIP_ARCHETYPES, RELATIONSHIP_STATUS)
 *   - accessors.js (getCharacterById, getCharacters)
 *   - skill-utils.js (getSkillLevelName, getStageFromLevel)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        if (typeof window._getCharacterById === 'function') {
            return window._getCharacterById(id);
        }
        return null;
    }

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        return [];
    }

    function _getRoleById(id) {
        if (typeof window.getRoleById === 'function') {
            return window.getRoleById(id);
        }
        if (typeof window._getRoleById === 'function') {
            return window._getRoleById(id);
        }
        return null;
    }

    function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

    // =========================================================================
    // 2. RELATIONSHIP REGISTRY WRAPPERS
    // =========================================================================

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

    // =========================================================================
    // 3. SKILL/ROLE DELEGATION (QUERY ONLY)
    // =========================================================================

    function _getSkillLevel(characterId, roleId) {
        if (typeof window.RoleQueries !== 'undefined' && typeof window.RoleQueries.getSkillLevel === 'function') {
            return window.RoleQueries.getSkillLevel(characterId, roleId);
        }
        var char = _getCharacterById(characterId);
        if (char && char.professions) {
            for (var i = 0; i < char.professions.length; i++) {
                if (char.professions[i].id === roleId) {
                    return char.professions[i].skillLevel || 0;
                }
            }
        }
        return 0;
    }

    function _getSkillLevelName(level) {
        if (typeof window.SkillUtils !== 'undefined') {
            return window.SkillUtils.getSkillLevelName(level);
        }
        if (level >= 91) return 'Master';
        if (level >= 76) return 'Expert';
        if (level >= 51) return 'Journeyman';
        if (level >= 26) return 'Apprentice';
        if (level >= 1) return 'Novice';
        return 'Untrained';
    }

    function _getStageFromLevel(level) {
        if (typeof window.SkillUtils !== 'undefined') {
            return window.SkillUtils.getStageFromLevel(level);
        }
        if (level >= 76) return { id: 'master', name: 'Master', minLevel: 76, maxLevel: 100 };
        if (level >= 51) return { id: 'journeyman', name: 'Journeyman', minLevel: 51, maxLevel: 75 };
        if (level >= 26) return { id: 'apprentice', name: 'Apprentice', minLevel: 26, maxLevel: 50 };
        if (level >= 1) return { id: 'novice', name: 'Novice', minLevel: 1, maxLevel: 25 };
        return { id: 'novice', name: 'Novice', minLevel: 0, maxLevel: 25 };
    }

    // =========================================================================
    // 4. CONSTANTS
    // =========================================================================

    var ARCHETYPES = window.RELATIONSHIP_ARCHETYPES || {};
    var STATUS = window.RELATIONSHIP_STATUS || { ONGOING: 'ongoing' };

    // =========================================================================
    // 5. APPRENTICESHIP QUERIES
    // =========================================================================

    /**
     * Gets the master of a character (if they are an apprentice)
     * @param {string} characterId - Character ID
     * @returns {Object|null} Master character or null
     */
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

    /**
     * Gets all apprentices of a master
     * @param {string} masterId - Master character ID
     * @param {boolean} activeOnly - Only return active apprenticeships
     * @returns {Array} Array of apprentice objects with details
     */
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

    /**
     * Checks if a character is an apprentice
     * @param {string} characterId - Character ID
     * @returns {boolean} True if apprentice
     */
    function isApprentice(characterId) {
        return getMaster(characterId) !== null;
    }

    /**
     * Checks if a character is a master (has apprentices)
     * @param {string} characterId - Character ID
     * @returns {boolean} True if master
     */
    function isMaster(characterId) {
        return getApprentices(characterId, true).length > 0;
    }

    /**
     * Gets the apprenticeship relationship between master and apprentice
     * @param {string} masterId - Master character ID
     * @param {string} apprenticeId - Apprentice character ID
     * @returns {Object|null} Relationship object or null
     */
    function getApprenticeship(masterId, apprenticeId) {
        return _getRelationshipBetween(masterId, apprenticeId);
    }

    /**
     * Gets the role being learned in an apprenticeship
     * @param {string} characterId - Character ID
     * @returns {string|null} Role ID or null
     */
    function getApprenticeshipRole(characterId) {
        var relationships = _getRelationshipsForCharacter(characterId, {
            type: ARCHETYPES.APPRENTICESHIP,
            activeOnly: true
        });

        for (var i = 0; i < relationships.length; i++) {
            var rel = relationships[i];
            if (rel.participantB === characterId) {
                return rel.metadata?.roleId || null;
            }
        }

        return null;
    }

    /**
     * Gets the current apprenticeship stage for a character
     * @param {string} characterId - Character ID
     * @param {string} roleId - Optional role ID
     * @returns {Object} Stage object
     */
    function getApprenticeshipStage(characterId, roleId) {
        var skillLevel = 0;
        if (roleId) {
            skillLevel = _getSkillLevel(characterId, roleId);
        } else {
            var relationships = _getRelationshipsForCharacter(characterId, {
                type: ARCHETYPES.APPRENTICESHIP,
                activeOnly: true
            });
            for (var i = 0; i < relationships.length; i++) {
                var rel = relationships[i];
                if (rel.participantB === characterId) {
                    skillLevel = rel.metadata?.skillLevel || 0;
                    break;
                }
            }
        }
        return _getStageFromLevel(skillLevel);
    }

    /**
     * Gets the apprenticeship progress percentage (0-100)
     * @param {string} characterId - Character ID
     * @param {string} roleId - Optional role ID
     * @returns {number} Progress percentage
     */
    function getApprenticeshipProgress(characterId, roleId) {
        var stage = getApprenticeshipStage(characterId, roleId);
        var skillLevel = 0;
        if (roleId) {
            skillLevel = _getSkillLevel(characterId, roleId);
        } else {
            var relationships = _getRelationshipsForCharacter(characterId, {
                type: ARCHETYPES.APPRENTICESHIP,
                activeOnly: true
            });
            for (var i = 0; i < relationships.length; i++) {
                var rel = relationships[i];
                if (rel.participantB === characterId) {
                    skillLevel = rel.metadata?.skillLevel || 0;
                    break;
                }
            }
        }
        var range = stage.maxLevel - stage.minLevel;
        if (range === 0) return 100;
        var stageProgress = ((skillLevel - stage.minLevel) / range) * 100;
        return Math.min(100, Math.max(0, Math.floor(stageProgress)));
    }

    /**
     * Gets all skills a character can teach
     * @param {string} characterId - Character ID
     * @param {number} minSkillLevel - Minimum skill level to teach (default 51)
     * @returns {Array} Array of teachable skills
     */
    function getTeachableSkills(characterId, minSkillLevel) {
        minSkillLevel = minSkillLevel || 51;
        var char = _getCharacterById(characterId);
        if (!char || !char.professions) return [];

        var result = [];
        for (var i = 0; i < char.professions.length; i++) {
            var prof = char.professions[i];
            var skillLevel = prof.skillLevel || 0;
            if (skillLevel >= minSkillLevel) {
                var role = _getRoleById(prof.id);
                if (role) {
                    result.push({
                        id: prof.id,
                        name: role.name,
                        skillLevel: skillLevel,
                        tier: _getSkillLevelName(skillLevel)
                    });
                }
            }
        }

        return result;
    }

    /**
     * Finds potential masters for a role
     * @param {string} roleId - Role ID
     * @param {string} locationId - Location ID
     * @param {number} minSkillLevel - Minimum skill level (default 51)
     * @returns {Array} Array of potential masters with details
     */
    function findPotentialMasters(roleId, locationId, minSkillLevel) {
        minSkillLevel = minSkillLevel || 51;
        var characters = _getCharacters();
        var result = [];

        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];
            if (char.isDeceased) continue;

            if (char.professions) {
                for (var j = 0; j < char.professions.length; j++) {
                    if (char.professions[j].id === roleId) {
                        var skillLevel = char.professions[j].skillLevel || 0;
                        if (skillLevel >= minSkillLevel) {
                            result.push({
                                character: char,
                                skillLevel: skillLevel,
                                apprenticeCount: getApprentices(char.id, true).length
                            });
                            break;
                        }
                    }
                }
            }
        }

        result.sort(function(a, b) {
            return b.skillLevel - a.skillLevel;
        });

        return result;
    }

    /**
     * Recommends masters for a character
     * @param {string} characterId - Character ID
     * @param {string} roleId - Role ID to learn
     * @returns {Array} Array of recommended masters
     */
    function recommendMastersForCharacter(characterId, roleId) {
        var char = _getCharacterById(characterId);
        if (!char) return [];

        // Find masters of the role
        var masters = findPotentialMasters(roleId, null, 51);
        if (masters.length === 0) return [];

        // Score masters by proximity, apprentice count, skill level
        var scored = masters.map(function(m) {
            var score = m.skillLevel / 100;
            // Prefer masters with fewer apprentices (more time to teach)
            if (m.apprenticeCount < 3) score += 0.2;
            else if (m.apprenticeCount < 6) score += 0.1;
            else score -= 0.1;

            // If character has a location, prefer masters in same location
            if (char.currentLocationId && m.character.currentLocationId) {
                if (char.currentLocationId === m.character.currentLocationId) {
                    score += 0.2;
                }
            }

            return {
                character: m.character,
                skillLevel: m.skillLevel,
                apprenticeCount: m.apprenticeCount,
                score: Math.min(1, Math.max(0, score))
            };
        });

        scored.sort(function(a, b) { return b.score - a.score; });

        return scored;
    }

    /**
     * Checks if a character can teach a role
     * @param {string} characterId - Character ID
     * @param {string} roleId - Role ID
     * @param {number} minSkillLevel - Minimum skill level (default 51)
     * @returns {boolean} True if can teach
     */
    function canTeach(characterId, roleId, minSkillLevel) {
        minSkillLevel = minSkillLevel || 51;
        var skill = _getSkillLevel(characterId, roleId);
        return skill >= minSkillLevel;
    }

    // =========================================================================
    // 6. EMPLOYMENT QUERIES
    // =========================================================================

    /**
     * Gets the employer of a character
     * @param {string} characterId - Character ID
     * @returns {Object|null} Employer character or null
     */
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

    /**
     * Gets the employees of an employer
     * @param {string} employerId - Employer character ID
     * @param {boolean} activeOnly - Only return active employees
     * @returns {Array} Array of employee objects with details
     */
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

    /**
     * Checks if a character has an employer
     * @param {string} characterId - Character ID
     * @returns {boolean} True if employed
     */
    function isEmployed(characterId) {
        return getEmployer(characterId) !== null;
    }

    /**
     * Gets the employment relationship between employer and employee
     * @param {string} employerId - Employer character ID
     * @param {string} employeeId - Employee character ID
     * @returns {Object|null} Relationship object or null
     */
    function getEmployment(employerId, employeeId) {
        return _getRelationshipBetween(employerId, employeeId);
    }

    // =========================================================================
    // 7. GUILD MEMBERSHIP QUERIES
    // =========================================================================

    /**
     * Gets the guild members of a guild
     * @param {string} guildId - Guild character ID
     * @param {boolean} activeOnly - Only return active members
     * @returns {Array} Array of member objects with details
     */
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

    /**
     * Checks if a character is in a guild
     * @param {string} characterId - Character ID
     * @param {string} guildId - Optional guild ID to check specific guild
     * @returns {boolean} True if in guild
     */
    function isInGuild(characterId, guildId) {
        var relationships = _getRelationshipsForCharacter(characterId, {
            type: ARCHETYPES.GUILD_MEMBERSHIP,
            activeOnly: true
        });

        for (var i = 0; i < relationships.length; i++) {
            var rel = relationships[i];
            if (guildId) {
                if (rel.participantA === guildId && rel.participantB === characterId) {
                    return true;
                }
            } else {
                return true;
            }
        }
        return false;
    }

    /**
     * Gets the guild membership of a character
     * @param {string} characterId - Character ID
     * @param {string} guildId - Optional guild ID
     * @returns {Object|null} Relationship object or null
     */
    function getGuildMembership(characterId, guildId) {
        var relationships = _getRelationshipsForCharacter(characterId, {
            type: ARCHETYPES.GUILD_MEMBERSHIP,
            activeOnly: true
        });

        for (var i = 0; i < relationships.length; i++) {
            var rel = relationships[i];
            if (guildId) {
                if (rel.participantA === guildId && rel.participantB === characterId) {
                    return rel;
                }
            } else {
                return rel;
            }
        }
        return null;
    }

    /**
     * Gets the guild rank of a character
     * @param {string} characterId - Character ID
     * @param {string} guildId - Guild ID
     * @returns {string|null} Rank name or null
     */
    function getGuildRank(characterId, guildId) {
        var membership = getGuildMembership(characterId, guildId);
        return membership?.metadata?.rank || null;
    }

    /**
     * Gets all guild memberships for a character
     * @param {string} characterId - Character ID
     * @param {boolean} activeOnly - Only return active memberships
     * @returns {Array} Array of membership objects with details
     */
    function getGuildMembershipsForCharacter(characterId, activeOnly) {
        activeOnly = activeOnly !== undefined ? activeOnly : true;
        var relationships = _getRelationshipsForCharacter(characterId, {
            type: ARCHETYPES.GUILD_MEMBERSHIP
        });

        var result = [];
        for (var i = 0; i < relationships.length; i++) {
            var rel = relationships[i];
            if (activeOnly && rel.status !== STATUS.ONGOING) continue;

            var guildId = rel.participantA;
            var guild = _getCharacterById(guildId);
            if (!guild) continue;

            var metadata = rel.metadata || {};

            result.push({
                id: rel.id,
                guild: guild,
                guildId: guildId,
                rank: metadata.rank || 'Member',
                startYear: rel.startYear,
                notes: metadata.notes || '',
                status: rel.status
            });
        }

        return result;
    }

    // =========================================================================
    // 8. GENERAL PROFESSIONAL RELATIONSHIP QUERIES
    // =========================================================================

    /**
     * Gets all professional relationships for a character
     * @param {string} characterId - Character ID
     * @param {Object} options - Filter options
     * @param {boolean} options.activeOnly - Only return active relationships
     * @param {string} options.type - Filter by relationship type
     * @returns {Array} Array of relationship objects
     */
    function getProfessionalRelationships(characterId, options) {
        options = options || {};
        var activeOnly = options.activeOnly !== undefined ? options.activeOnly : true;

        var professionalTypes = [
            ARCHETYPES.APPRENTICESHIP,
            ARCHETYPES.EMPLOYMENT,
            ARCHETYPES.GUILD_MEMBERSHIP
        ];

        if (options.type) {
            professionalTypes = [options.type];
        }

        var allRelationships = [];
        for (var i = 0; i < professionalTypes.length; i++) {
            var rels = _getRelationshipsForCharacter(characterId, {
                type: professionalTypes[i],
                activeOnly: activeOnly
            });
            allRelationships = allRelationships.concat(rels);
        }

        return allRelationships;
    }

    /**
     * Gets the professional relationship between two characters
     * @param {string} charAId - First character ID
     * @param {string} charBId - Second character ID
     * @returns {Object|null} Relationship object or null
     */
    function getProfessionalRelationshipBetween(charAId, charBId) {
        var professionalTypes = [
            ARCHETYPES.APPRENTICESHIP,
            ARCHETYPES.EMPLOYMENT,
            ARCHETYPES.GUILD_MEMBERSHIP
        ];

        for (var i = 0; i < professionalTypes.length; i++) {
            var rel = _getRelationshipBetween(charAId, charBId);
            if (rel && rel.type === professionalTypes[i]) {
                return rel;
            }
        }
        return null;
    }

    /**
     * Gets the professional relationship description between two characters
     * @param {string} charAId - First character ID
     * @param {string} charBId - Second character ID
     * @returns {string|null} Description or null
     */
    function getProfessionalRelationshipDescription(charAId, charBId) {
        var rel = getProfessionalRelationshipBetween(charAId, charBId);
        if (!rel) return null;

        var charA = _getCharacterById(charAId);
        var charB = _getCharacterById(charBId);
        if (!charA || !charB) return null;

        var metadata = rel.metadata || {};
        var typeName = '';
        var direction = '';

        switch (rel.type) {
            case ARCHETYPES.APPRENTICESHIP:
                if (rel.participantA === charAId) {
                    typeName = 'master of';
                    direction = charA.name + ' is the master of ' + charB.name;
                } else {
                    typeName = 'apprentice of';
                    direction = charA.name + ' is the apprentice of ' + charB.name;
                }
                if (metadata.roleName) {
                    direction += ' (learning ' + metadata.roleName + ')';
                }
                break;
            case ARCHETYPES.EMPLOYMENT:
                if (rel.participantA === charAId) {
                    typeName = 'employer of';
                    direction = charA.name + ' employs ' + charB.name;
                } else {
                    typeName = 'employee of';
                    direction = charA.name + ' is employed by ' + charB.name;
                }
                if (metadata.role) {
                    direction += ' as ' + metadata.role;
                }
                break;
            case ARCHETYPES.GUILD_MEMBERSHIP:
                if (rel.participantA === charAId) {
                    typeName = 'guild master of';
                    direction = charA.name + ' leads the guild containing ' + charB.name;
                } else {
                    typeName = 'guild member of';
                    direction = charA.name + ' is a member of ' + charB.name + '\'s guild';
                }
                if (metadata.rank) {
                    direction += ' (' + metadata.rank + ')';
                }
                break;
            default:
                return null;
        }

        return direction;
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.ProfessionalLogic = {
        // Apprenticeship queries
        getMaster: getMaster,
        getApprentices: getApprentices,
        isApprentice: isApprentice,
        isMaster: isMaster,
        getApprenticeship: getApprenticeship,
        getApprenticeshipRole: getApprenticeshipRole,
        getApprenticeshipStage: getApprenticeshipStage,
        getApprenticeshipProgress: getApprenticeshipProgress,
        getTeachableSkills: getTeachableSkills,
        findPotentialMasters: findPotentialMasters,
        recommendMastersForCharacter: recommendMastersForCharacter,
        canTeach: canTeach,

        // Employment queries
        getEmployer: getEmployer,
        getEmployees: getEmployees,
        isEmployed: isEmployed,
        getEmployment: getEmployment,

        // Guild membership queries
        getGuildMembers: getGuildMembers,
        isInGuild: isInGuild,
        getGuildMembership: getGuildMembership,
        getGuildRank: getGuildRank,
        getGuildMembershipsForCharacter: getGuildMembershipsForCharacter,

        // General professional queries
        getProfessionalRelationships: getProfessionalRelationships,
        getProfessionalRelationshipBetween: getProfessionalRelationshipBetween,
        getProfessionalRelationshipDescription: getProfessionalRelationshipDescription
    };

    // Legacy aliases for backward compatibility
    window.getMaster = getMaster;
    window.getApprentices = getApprentices;
    window.isApprentice = isApprentice;
    window.isMaster = isMaster;
    window.getApprenticeship = getApprenticeship;
    window.getApprenticeshipRole = getApprenticeshipRole;
    window.getTeachableSkills = getTeachableSkills;
    window.findPotentialMasters = findPotentialMasters;
    window.canTeach = canTeach;
    window.getEmployer = getEmployer;
    window.getEmployees = getEmployees;
    window.getGuildMembers = getGuildMembers;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.ProfessionalLogic;
    }

})();
