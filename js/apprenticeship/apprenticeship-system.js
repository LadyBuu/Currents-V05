/**
 * =============================================================================
 * STILL WATERS - APPRENTICESHIP SYSTEM
 * =============================================================================
 * 
 * Manages apprenticeship relationships including creation, progression,
 * completion, and termination.
 * 
 * CREATION FUNCTIONS:
 *   - createApprenticeship()
 *   - completeApprenticeship()
 *   - terminateApprenticeship()
 *   - updateApprenticeship()
 *   - progressApprenticeship()
 *   - teachSkill()
 *   - teachSpecialization()
 *   - conductTeachingSession()
 *   - advanceApprenticeshipSkills()
 *   - preserveKnowledgeOnDeath()
 *   - assessKnowledgeLoss()
 * 
 * QUERY FUNCTIONS (delegated to ProfessionalLogic):
 *   - getMaster()
 *   - getApprentices()
 *   - isApprentice()
 *   - isMaster()
 *   - getApprenticeship()
 *   - getApprenticeshipRole()
 *   - getTeachableSkills()
 *   - findPotentialMasters()
 *   - canTeach()
 * 
 * DEPENDENCIES:
 *   - relationship-registry.js (createRelationship, getRelationshipBetween, 
 *     getRelationshipsForCharacter, updateRelationship, endRelationship)
 *   - relationship-types.js (RELATIONSHIP_ARCHETYPES, RELATIONSHIP_STATUS)
 *   - accessors.js (getCharacterById, getCharacters, getRoleById)
 *   - storage.js (saveMasterData)
 *   - time.js (getCurrentYearSafe, calculateAge)
 *   - professional-logic.js (QUERY ONLY)
 *   - skill-utils.js (getSkillLevelName, getStageFromLevel)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _processing = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
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

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    // =========================================================================
    // 3. RELATIONSHIP REGISTRY WRAPPERS
    // =========================================================================

    function _createRelationship(idA, idB, options) {
        if (typeof window.createRelationship === 'function') {
            return window.createRelationship(idA, idB, options);
        }
        if (typeof window._createRelationship === 'function') {
            return window._createRelationship(idA, idB, options);
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

    // =========================================================================
    // 4. SKILL/ROLE DELEGATION
    // =========================================================================

    function _getSkillLevel(characterId, roleId) {
        // Try RoleQueries first
        if (typeof window.RoleQueries !== 'undefined' && 
            typeof window.RoleQueries.getSkillLevel === 'function') {
            return window.RoleQueries.getSkillLevel(characterId, roleId);
        }
        // Fallback to direct access
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

    function _updateSkill(characterId, roleId, skillLevel) {
        var char = _getCharacterById(characterId);
        if (!char || !char.professions) return false;
        
        for (var i = 0; i < char.professions.length; i++) {
            if (char.professions[i].id === roleId) {
                char.professions[i].skillLevel = Math.min(100, Math.max(0, skillLevel));
                _saveMasterData();
                return true;
            }
        }
        return false;
    }

    /**
     * Assigns a role to a character - ULTRA DIRECT VERSION
     * Bypasses all systems and directly manipulates masterData
     */
    function _assignRole(characterId, roleId, options) {
        options = options || {};
        var skillLevel = Math.min(100, Math.max(0, options.skillLevel || 0));
        var startYear = options.startYear || _getCurrentYear();
        var notes = options.notes || '';

        console.log('_assignRole: Direct assignment -', 'char:', characterId, 'role:', roleId, 'skill:', skillLevel);

        // Get the role
        var role = _getRoleById(roleId);
        if (!role) {
            console.error('_assignRole: Role not found:', roleId);
            return { success: false, reason: 'Role not found' };
        }

        // Try RoleCommands first (if available)
        if (typeof window.RoleCommands !== 'undefined' && 
            typeof window.RoleCommands.assignRoleToCharacter === 'function') {
            try {
                var result = window.RoleCommands.assignRoleToCharacter(characterId, roleId, {
                    skillLevel: skillLevel,
                    startYear: startYear,
                    primary: options.primary || false,
                    notes: notes
                });
                if (result && result.success) {
                    console.log('_assignRole: RoleCommands succeeded');
                    _saveMasterData();
                    _dispatchEvents();
                    return result;
                }
                console.warn('_assignRole: RoleCommands failed:', result);
            } catch (e) {
                console.error('_assignRole: RoleCommands error:', e);
            }
        }

        // DIRECT MASTERDATA MANIPULATION (bypasses all systems)
        console.log('_assignRole: Using direct masterData manipulation');
        
        try {
            // Get the character directly from masterData
            var masterData = window.masterData;
            if (!masterData || !masterData.data || !masterData.data.characters) {
                console.error('_assignRole: masterData not available');
                return { success: false, reason: 'masterData not available' };
            }

            // Find the character
            var charData = null;
            for (var i = 0; i < masterData.data.characters.length; i++) {
                if (masterData.data.characters[i].id === characterId) {
                    charData = masterData.data.characters[i];
                    break;
                }
            }

            if (!charData) {
                console.error('_assignRole: Character not found in masterData:', characterId);
                return { success: false, reason: 'Character not found in masterData' };
            }

            // Ensure professions array exists
            if (!charData.professions) {
                charData.professions = [];
            }

            // Check if already exists
            var existing = null;
            for (var i = 0; i < charData.professions.length; i++) {
                if (charData.professions[i].id === roleId) {
                    existing = charData.professions[i];
                    break;
                }
            }

            if (existing) {
                existing.skillLevel = skillLevel;
                existing.startYear = startYear;
                existing.notes = notes;
                if (options.primary !== undefined) existing.primary = options.primary;
                console.log('_assignRole: Updated existing profession in masterData');
            } else {
                var newProfession = {
                    id: roleId,
                    name: role.name,
                    skillLevel: skillLevel,
                    startYear: startYear,
                    notes: notes || 'Apprenticeship role',
                    specs: [],
                    primary: options.primary || false
                };
                charData.professions.push(newProfession);
                console.log('_assignRole: Added new profession to masterData:', newProfession);
            }

            // Save masterData
            _saveMasterData();

            // Also try to save through the accessor cache invalidation
            if (typeof window.invalidateAccessorCaches === 'function') {
                try {
                    window.invalidateAccessorCaches();
                } catch (e) {
                    console.warn('_assignRole: invalidateAccessorCaches failed:', e);
                }
            }

            // Dispatch events
            _dispatchEvents();

            return { 
                success: true, 
                character: charData, 
                role: role,
                wasExisting: !!existing,
                method: 'direct_masterdata'
            };

        } catch (e) {
            console.error('_assignRole: Direct masterData manipulation failed:', e);
            return { success: false, reason: 'Direct assignment failed: ' + e.message };
        }
    }

    function _getSkillLevelName(level) {
        if (typeof window.SkillUtils !== 'undefined') {
            return window.SkillUtils.getSkillLevelName(level);
        }
        if (typeof window._getSkillLevelName === 'function') {
            return window._getSkillLevelName(level);
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
        if (typeof window._getStageFromLevel === 'function') {
            return window._getStageFromLevel(level);
        }
        if (level >= 76) return { id: 'master', name: 'Master', minLevel: 76, maxLevel: 100 };
        if (level >= 51) return { id: 'journeyman', name: 'Journeyman', minLevel: 51, maxLevel: 75 };
        if (level >= 26) return { id: 'apprentice', name: 'Apprentice', minLevel: 26, maxLevel: 50 };
        if (level >= 1) return { id: 'novice', name: 'Novice', minLevel: 1, maxLevel: 25 };
        return { id: 'novice', name: 'Novice', minLevel: 0, maxLevel: 25 };
    }

    function _dispatchEvents() {
        if (typeof window.dispatchEvent === 'function') {
            window.dispatchEvent(new CustomEvent('apprenticeshipUpdated', {}));
            window.dispatchEvent(new CustomEvent('characterUpdated', {}));
            window.dispatchEvent(new CustomEvent('rolesUpdated', {}));
        }
    }

    // =========================================================================
    // 5. CONSTANTS
    // =========================================================================

    var ARCHETYPES = window.RELATIONSHIP_ARCHETYPES || {};
    var STATUS = window.RELATIONSHIP_STATUS || { ONGOING: 'ongoing' };

    // =========================================================================
    // 6. APPRENTICESHIP CREATION - FIXED
    // =========================================================================

    /**
     * Creates an apprenticeship relationship between master and apprentice
     * @param {string} masterId - Master character ID
     * @param {string} apprenticeId - Apprentice character ID
     * @param {Object} options - Options
     * @param {string} options.roleId - Profession/role ID (required)
     * @param {number} options.startYear - Year started (default: current year)
     * @param {number} options.initialSkill - Initial skill level (default: 10)
     * @param {Array} options.specializations - Specializations to teach
     * @param {string} options.notes - Additional notes
     * @returns {Object|null} Relationship object or null
     */
    function createApprenticeship(masterId, apprenticeId, options) {
        if (_processing) return null;
        _processing = true;

        try {
            options = options || {};
            var master = _getCharacterById(masterId);
            var apprentice = _getCharacterById(apprenticeId);

            if (!master || !apprentice) {
                console.error('createApprenticeship: Master or apprentice not found');
                return null;
            }
            if (masterId === apprenticeId) {
                console.error('createApprenticeship: Master and apprentice are the same');
                return null;
            }
            if (master.isDeceased || apprentice.isDeceased) {
                console.error('createApprenticeship: Master or apprentice is deceased');
                return null;
            }

            var roleId = options.roleId;
            if (!roleId) {
                console.error('createApprenticeship: No roleId provided');
                return null;
            }

            var role = _getRoleById(roleId);
            if (!role) {
                console.error('createApprenticeship: Role not found:', roleId);
                return null;
            }

            var masterSkill = _getSkillLevel(masterId, roleId);
            if (masterSkill < 51) {
                console.error('createApprenticeship: Master skill too low:', masterSkill);
                return null;
            }

            var startYear = options.startYear || _getCurrentYear();
            var initialSkill = options.initialSkill !== undefined ? options.initialSkill : 10;

            var apprenticeHasRole = false;
            var existingSkill = 0;
            var apprenticeChar = _getCharacterById(apprenticeId);
            if (apprenticeChar && apprenticeChar.professions) {
                for (var i = 0; i < apprenticeChar.professions.length; i++) {
                    if (apprenticeChar.professions[i].id === roleId) {
                        apprenticeHasRole = true;
                        existingSkill = apprenticeChar.professions[i].skillLevel || 0;
                        break;
                    }
                }
            }

            var effectiveSkill = apprenticeHasRole ? existingSkill : initialSkill;
            var initialStage = _getStageFromLevel(effectiveSkill);

            var relationship = _createRelationship(masterId, apprenticeId, {
                type: ARCHETYPES.APPRENTICESHIP,
                status: STATUS.ONGOING,
                startYear: startYear,
                metadata: {
                    roleId: roleId,
                    roleName: role.name,
                    skillLevel: Math.min(100, Math.max(0, effectiveSkill)),
                    stage: initialStage.id,
                    startSkill: effectiveSkill,
                    specializationsTaught: options.specializations || [],
                    teachingHistory: [],
                    notes: options.notes || ''
                }
            });

            if (relationship) {
                console.log('createApprenticeship: Relationship created:', relationship.id);
                
                // IMPORTANT: Assign the role to the apprentice
                var assignResult = _assignRole(apprenticeId, roleId, {
                    skillLevel: effectiveSkill,
                    startYear: startYear,
                    primary: false,
                    notes: 'Apprenticeship under ' + master.name + (options.notes ? ' (' + options.notes + ')' : '')
                });

                // Log assignment result for debugging
                if (!assignResult || !assignResult.success) {
                    console.error('createApprenticeship: Failed to assign role to apprentice:', 
                        apprenticeId, roleId, assignResult?.reason || 'Unknown reason');
                    
                    // Try one more time with a direct approach - get the apprentice from masterData
                    try {
                        console.log('createApprenticeship: Trying emergency direct assignment');
                        var masterData = window.masterData;
                        if (masterData && masterData.data && masterData.data.characters) {
                            for (var i = 0; i < masterData.data.characters.length; i++) {
                                if (masterData.data.characters[i].id === apprenticeId) {
                                    var charData = masterData.data.characters[i];
                                    if (!charData.professions) charData.professions = [];
                                    
                                    var exists = false;
                                    for (var j = 0; j < charData.professions.length; j++) {
                                        if (charData.professions[j].id === roleId) {
                                            charData.professions[j].skillLevel = effectiveSkill;
                                            exists = true;
                                            break;
                                        }
                                    }
                                    if (!exists) {
                                        charData.professions.push({
                                            id: roleId,
                                            name: role.name,
                                            skillLevel: effectiveSkill,
                                            startYear: startYear,
                                            notes: 'Apprenticeship under ' + master.name,
                                            specs: [],
                                            primary: false
                                        });
                                    }
                                    _saveMasterData();
                                    console.log('createApprenticeship: Emergency assignment succeeded');
                                    break;
                                }
                            }
                        }
                    } catch (e) {
                        console.error('createApprenticeship: Emergency assignment failed:', e);
                    }
                } else {
                    console.log('createApprenticeship: Role assigned successfully to', apprentice.name);
                }

                // Always save to ensure data persistence
                _saveMasterData();
                _dispatchEvents();
            } else {
                console.error('createApprenticeship: Failed to create relationship');
            }

            return relationship;

        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 7. APPRENTICESHIP PROGRESSION & COMPLETION
    // =========================================================================

    /**
     * Progresses an apprenticeship by increasing skill level
     * @param {string} masterId - Master character ID
     * @param {string} apprenticeId - Apprentice character ID
     * @param {number} amount - Amount to progress (default: 5)
     * @returns {Object} Progress result
     */
    function progressApprenticeship(masterId, apprenticeId, amount) {
        if (_processing) return { success: false, reason: 'Already processing' };
        _processing = true;

        try {
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
                _updateSkill(apprenticeId, metadata.roleId, newLevel);
            }

            var completed = false;
            if (newStage.id === 'master') {
                completed = completeApprenticeship(masterId, apprenticeId);
            }

            _saveMasterData();
            _dispatchEvents();

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

        } finally {
            _processing = false;
        }
    }

    /**
     * Completes an apprenticeship
     * @param {string} masterId - Master character ID
     * @param {string} apprenticeId - Apprentice character ID
     * @param {number} finalSkillLevel - Final skill level (default: current level)
     * @returns {boolean} True if completed
     */
    function completeApprenticeship(masterId, apprenticeId, finalSkillLevel) {
        if (_processing) return false;
        _processing = true;

        try {
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
            if (apprentice && metadata.roleId) {
                _updateSkill(apprenticeId, metadata.roleId, finalLevel);
                if (finalLevel >= 51) apprentice.isJourneyman = true;
                if (finalLevel >= 76) apprentice.isMaster = true;
                _saveMasterData();
            }

            _dispatchEvents();

            return true;

        } finally {
            _processing = false;
        }
    }

    /**
     * Terminates an apprenticeship
     * @param {string} masterId - Master character ID
     * @param {string} apprenticeId - Apprentice character ID
     * @param {string} reason - Reason for termination
     * @returns {boolean} True if terminated
     */
    function terminateApprenticeship(masterId, apprenticeId, reason) {
        if (_processing) return false;
        _processing = true;

        try {
            reason = reason || 'Terminated';
            var relationship = _getRelationshipBetween(masterId, apprenticeId);

            if (!relationship || relationship.type !== ARCHETYPES.APPRENTICESHIP) {
                return false;
            }

            var result = _endRelationship(relationship.id, _getCurrentYear(), reason);

            if (result) {
                _saveMasterData();
                _dispatchEvents();
            }

            return result;

        } finally {
            _processing = false;
        }
    }

    /**
     * Updates an apprenticeship
     * @param {string} masterId - Master character ID
     * @param {string} apprenticeId - Apprentice character ID
     * @param {Object} updates - Updates to apply
     * @param {number} updates.skillLevel - New skill level
     * @param {string} updates.notes - New notes
     * @param {Array} updates.specializationsTaught - New specializations
     * @param {string} updates.status - New status
     * @param {number} updates.startYear - New start year
     * @returns {boolean} True if updated
     */
    function updateApprenticeship(masterId, apprenticeId, updates) {
        if (_processing) return false;
        _processing = true;

        try {
            var relationship = _getRelationshipBetween(masterId, apprenticeId);
            if (!relationship || relationship.type !== ARCHETYPES.APPRENTICESHIP) {
                return false;
            }

            var metadata = relationship.metadata || {};

            if (updates.skillLevel !== undefined) {
                var newLevel = Math.min(100, Math.max(0, updates.skillLevel));
                metadata.skillLevel = newLevel;
                metadata.stage = _getStageFromLevel(newLevel).id;

                if (metadata.roleId) {
                    _updateSkill(apprenticeId, metadata.roleId, newLevel);
                }
            }

            if (updates.notes !== undefined) {
                metadata.notes = updates.notes;
            }

            if (updates.specializationsTaught !== undefined) {
                metadata.specializationsTaught = updates.specializationsTaught;
            }

            if (updates.status !== undefined) {
                relationship.status = updates.status;
                if (updates.status !== 'ongoing' && updates.status !== STATUS.ONGOING) {
                    relationship.endYear = _getCurrentYear();
                }
            }

            if (updates.startYear !== undefined) {
                relationship.startYear = updates.startYear;
            }

            _updateRelationship(relationship.id, {
                metadata: metadata,
                status: relationship.status,
                startYear: relationship.startYear,
                endYear: relationship.endYear
            });

            _saveMasterData();
            _dispatchEvents();

            return true;

        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 8. TEACHING FUNCTIONS
    // =========================================================================

    /**
     * Teaches a skill to an apprentice
     * @param {string} masterId - Master character ID
     * @param {string} apprenticeId - Apprentice character ID
     * @param {string} method - Teaching method ID
     * @returns {Object} Teaching result
     */
    function teachSkill(masterId, apprenticeId, method) {
        if (_processing) return { success: false, reason: 'Already processing' };
        _processing = true;

        try {
            var relationship = _getRelationshipBetween(masterId, apprenticeId);
            if (!relationship || relationship.type !== ARCHETYPES.APPRENTICESHIP) {
                return { success: false, reason: 'Apprenticeship not found' };
            }

            if (relationship.status !== STATUS.ONGOING) {
                return { success: false, reason: 'Apprenticeship is not active' };
            }

            var master = _getCharacterById(masterId);
            var apprentice = _getCharacterById(apprenticeId);
            if (!master || !apprentice) {
                return { success: false, reason: 'Character not found' };
            }

            var metadata = relationship.metadata || {};
            var roleId = metadata.roleId;
            if (!roleId) {
                return { success: false, reason: 'No role being taught' };
            }

            var masterSkill = _getSkillLevel(masterId, roleId);
            if (masterSkill < 51) {
                return { success: false, reason: 'Master skill too low to teach' };
            }

            var currentSkill = metadata.skillLevel || 0;
            var gain = 5;
            var successChance = 0.75;

            var methods = window.SKILL_TRANSFER_METHODS || {};
            var methodData = null;
            for (var key in methods) {
                if (methods[key].id === method) {
                    methodData = methods[key];
                    break;
                }
            }
            if (methodData) {
                gain = methodData.gain || 5;
                successChance = methodData.baseSuccess || 0.75;
            }

            var roll = Math.random();
            var success = roll < successChance;

            if (!success) {
                return {
                    success: false,
                    reason: 'Teaching attempt failed',
                    gain: 0,
                    currentSkill: currentSkill,
                    successChance: successChance,
                    roll: roll
                };
            }

            var newSkill = Math.min(100, currentSkill + gain);
            metadata.skillLevel = newSkill;
            metadata.stage = _getStageFromLevel(newSkill).id;

            if (!metadata.teachingHistory) metadata.teachingHistory = [];
            metadata.teachingHistory.push({
                type: 'teach_skill',
                method: method,
                gain: gain,
                newLevel: newSkill,
                year: _getCurrentYear()
            });

            _updateRelationship(relationship.id, {
                metadata: metadata
            });

            _updateSkill(apprenticeId, roleId, newSkill);

            _saveMasterData();
            _dispatchEvents();

            return {
                success: true,
                gain: gain,
                newSkill: newSkill,
                currentSkill: currentSkill,
                successChance: successChance,
                roll: roll,
                completed: newSkill >= 76
            };

        } finally {
            _processing = false;
        }
    }

    /**
     * Teaches a specialization to an apprentice
     * @param {string} masterId - Master character ID
     * @param {string} apprenticeId - Apprentice character ID
     * @param {string} specialization - Specialization ID
     * @returns {Object} Teaching result
     */
    function teachSpecialization(masterId, apprenticeId, specialization) {
        if (_processing) return { success: false, reason: 'Already processing' };
        _processing = true;

        try {
            var relationship = _getRelationshipBetween(masterId, apprenticeId);
            if (!relationship || relationship.type !== ARCHETYPES.APPRENTICESHIP) {
                return { success: false, reason: 'Apprenticeship not found' };
            }

            if (relationship.status !== STATUS.ONGOING) {
                return { success: false, reason: 'Apprenticeship is not active' };
            }

            var metadata = relationship.metadata || {};
            if (!metadata.specializationsTaught) {
                metadata.specializationsTaught = [];
            }

            if (metadata.specializationsTaught.indexOf(specialization) !== -1) {
                return { success: false, reason: 'Specialization already taught' };
            }

            metadata.specializationsTaught.push(specialization);

            if (!metadata.teachingHistory) metadata.teachingHistory = [];
            metadata.teachingHistory.push({
                type: 'teach_specialization',
                specialization: specialization,
                year: _getCurrentYear()
            });

            _updateRelationship(relationship.id, {
                metadata: metadata
            });

            _saveMasterData();
            _dispatchEvents();

            return {
                success: true,
                specialization: specialization,
                specializationsTaught: metadata.specializationsTaught
            };

        } finally {
            _processing = false;
        }
    }

    /**
     * Conducts a teaching session (multiple skill gains)
     * @param {string} masterId - Master character ID
     * @param {string} apprenticeId - Apprentice character ID
     * @param {number} hours - Hours of teaching
     * @returns {Object} Session result
     */
    function conductTeachingSession(masterId, apprenticeId, hours) {
        if (_processing) return { success: false, reason: 'Already processing' };
        _processing = true;

        try {
            hours = hours || 1;
            var totalGain = 0;
            var sessions = [];

            for (var i = 0; i < hours; i++) {
                var result = teachSkill(masterId, apprenticeId, 'teaching');
                if (result.success) {
                    totalGain += result.gain;
                    sessions.push(result);
                }
            }

            var relationship = _getRelationshipBetween(masterId, apprenticeId);
            var metadata = relationship?.metadata || {};
            var currentLevel = metadata.skillLevel || 0;

            return {
                success: true,
                totalGain: totalGain,
                sessions: sessions,
                newLevel: currentLevel,
                hours: hours
            };

        } finally {
            _processing = false;
        }
    }

    /**
     * Advances all apprenticeship skills for a year
     * @param {number} year - Year to process
     * @returns {Array} Results for all apprenticeships
     */
    function advanceApprenticeshipSkills(year) {
        if (_processing) return [];
        _processing = true;

        try {
            year = year || _getCurrentYear();
            var allChars = _getCharacters();
            var results = [];

            for (var i = 0; i < allChars.length; i++) {
                var char = allChars[i];
                if (char.isDeceased) continue;

                var relationships = _getRelationshipsForCharacter(char.id, {
                    type: ARCHETYPES.APPRENTICESHIP,
                    activeOnly: true
                });

                for (var j = 0; j < relationships.length; j++) {
                    var rel = relationships[j];
                    if (rel.participantB !== char.id) continue;

                    var metadata = rel.metadata || {};
                    var currentLevel = metadata.skillLevel || 0;
                    var masterId = rel.participantA;
                    var masterSkill = _getSkillLevel(masterId, metadata.roleId);

                    var gain = 0;
                    if (masterSkill >= 91) gain = 8;
                    else if (masterSkill >= 76) gain = 6;
                    else if (masterSkill >= 51) gain = 4;
                    else gain = 2;

                    var newLevel = Math.min(100, currentLevel + gain);
                    if (newLevel > currentLevel) {
                        metadata.skillLevel = newLevel;
                        metadata.stage = _getStageFromLevel(newLevel).id;

                        if (!metadata.teachingHistory) metadata.teachingHistory = [];
                        metadata.teachingHistory.push({
                            type: 'annual_advance',
                            gain: gain,
                            newLevel: newLevel,
                            year: year
                        });

                        _updateRelationship(rel.id, {
                            metadata: metadata
                        });

                        if (metadata.roleId) {
                            _updateSkill(char.id, metadata.roleId, newLevel);
                        }

                        results.push({
                            apprenticeId: char.id,
                            apprenticeName: char.name,
                            masterId: masterId,
                            gain: gain,
                            newLevel: newLevel,
                            completed: newLevel >= 76
                        });
                    }
                }
            }

            if (results.length > 0) {
                _saveMasterData();
                _dispatchEvents();
            }

            return results;

        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 9. KNOWLEDGE PRESERVATION
    // =========================================================================

    /**
     * Preserves knowledge from a dying character to an heir
     * @param {string} dyingId - Dying character ID
     * @param {string} heirId - Heir character ID
     * @returns {Array} Preserved skills
     */
    function preserveKnowledgeOnDeath(dyingId, heirId) {
        if (_processing) return [];
        _processing = true;

        try {
            var dying = _getCharacterById(dyingId);
            var heir = _getCharacterById(heirId);
            if (!dying || !heir) return [];

            var preserved = [];
            if (!dying.professions) return preserved;

            for (var i = 0; i < dying.professions.length; i++) {
                var prof = dying.professions[i];
                var skillLevel = prof.skillLevel || 0;
                if (skillLevel < 10) continue;

                var inheritedLevel = Math.max(0, Math.floor(skillLevel * 0.5));
                var roleId = prof.id;

                var existing = null;
                if (!heir.professions) heir.professions = [];
                for (var j = 0; j < heir.professions.length; j++) {
                    if (heir.professions[j].id === roleId) {
                        existing = heir.professions[j];
                        break;
                    }
                }

                if (existing) {
                    existing.skillLevel = Math.max(existing.skillLevel || 0, inheritedLevel);
                } else {
                    var role = _getRoleById(roleId);
                    heir.professions.push({
                        id: roleId,
                        name: role ? role.name : prof.name || 'Unknown',
                        skillLevel: inheritedLevel,
                        startYear: _getCurrentYear(),
                        notes: 'Inherited from ' + dying.name,
                        specs: []
                    });
                }

                preserved.push({
                    roleId: roleId,
                    originalLevel: skillLevel,
                    inheritedLevel: inheritedLevel,
                    roleName: prof.name || 'Unknown'
                });
            }

            if (preserved.length > 0) {
                _saveMasterData();
                _dispatchEvents();
            }

            return preserved;

        } finally {
            _processing = false;
        }
    }

    /**
     * Assesses knowledge loss risk for a character
     * @param {string} characterId - Character ID
     * @returns {Object} Knowledge loss assessment
     */
    function assessKnowledgeLoss(characterId) {
        if (_processing) return { risk: 0, skills: [] };
        _processing = true;

        try {
            var char = _getCharacterById(characterId);
            if (!char) return { risk: 0, skills: [] };

            var age = 0;
            if (typeof window.calculateAge === 'function') {
                age = window.calculateAge(char.birthYear, char.isDeceased, char.deathYear);
            } else {
                var currentYear = _getCurrentYear();
                if (char.birthYear) {
                    age = char.isDeceased && char.deathYear ? char.deathYear - char.birthYear : currentYear - char.birthYear;
                }
            }

            var ageFactor = Math.min(1, Math.max(0, (age - 50) / 50));
            var baseRisk = ageFactor * 0.5;

            var skills = [];
            if (char.professions) {
                for (var i = 0; i < char.professions.length; i++) {
                    var prof = char.professions[i];
                    var skillLevel = prof.skillLevel || 0;
                    var lossRisk = baseRisk * (1 - (skillLevel / 100));

                    skills.push({
                        roleId: prof.id,
                        roleName: prof.name || 'Unknown',
                        skillLevel: skillLevel,
                        lossRisk: Math.min(0.9, Math.max(0, lossRisk))
                    });
                }
            }

            return {
                risk: Math.min(0.9, baseRisk),
                age: age,
                skills: skills
            };

        } finally {
            _processing = false;
        }
    }

    // =========================================================================
    // 10. QUERY FUNCTIONS (DELEGATED TO PROFESSIONALLOGIC)
    // =========================================================================

    function getMaster(characterId) {
        if (typeof window.ProfessionalLogic !== 'undefined') {
            return window.ProfessionalLogic.getMaster(characterId);
        }
        if (typeof window.getMaster === 'function') {
            return window.getMaster(characterId);
        }
        return null;
    }

    function getApprentices(masterId, activeOnly) {
        if (typeof window.ProfessionalLogic !== 'undefined') {
            return window.ProfessionalLogic.getApprentices(masterId, activeOnly);
        }
        if (typeof window.getApprentices === 'function') {
            return window.getApprentices(masterId, activeOnly);
        }
        return [];
    }

    function isApprentice(characterId) {
        if (typeof window.ProfessionalLogic !== 'undefined') {
            return window.ProfessionalLogic.isApprentice(characterId);
        }
        if (typeof window.isApprentice === 'function') {
            return window.isApprentice(characterId);
        }
        return false;
    }

    function isMaster(characterId) {
        if (typeof window.ProfessionalLogic !== 'undefined') {
            return window.ProfessionalLogic.isMaster(characterId);
        }
        if (typeof window.isMaster === 'function') {
            return window.isMaster(characterId);
        }
        return false;
    }

    function getApprenticeship(masterId, apprenticeId) {
        if (typeof window.ProfessionalLogic !== 'undefined') {
            return window.ProfessionalLogic.getApprenticeship(masterId, apprenticeId);
        }
        if (typeof window.getApprenticeship === 'function') {
            return window.getApprenticeship(masterId, apprenticeId);
        }
        return null;
    }

    function getApprenticeshipRole(characterId) {
        if (typeof window.ProfessionalLogic !== 'undefined') {
            return window.ProfessionalLogic.getApprenticeshipRole(characterId);
        }
        if (typeof window.getApprenticeshipRole === 'function') {
            return window.getApprenticeshipRole(characterId);
        }
        return null;
    }

    function getTeachableSkills(characterId, minSkillLevel) {
        if (typeof window.ProfessionalLogic !== 'undefined') {
            return window.ProfessionalLogic.getTeachableSkills(characterId, minSkillLevel);
        }
        if (typeof window.getTeachableSkills === 'function') {
            return window.getTeachableSkills(characterId, minSkillLevel);
        }
        return [];
    }

    function findPotentialMasters(roleId, locationId, minSkillLevel) {
        if (typeof window.ProfessionalLogic !== 'undefined') {
            return window.ProfessionalLogic.findPotentialMasters(roleId, locationId, minSkillLevel);
        }
        if (typeof window.findPotentialMasters === 'function') {
            return window.findPotentialMasters(roleId, locationId, minSkillLevel);
        }
        return [];
    }

    function canTeach(characterId, roleId, minSkillLevel) {
        if (typeof window.ProfessionalLogic !== 'undefined') {
            return window.ProfessionalLogic.canTeach(characterId, roleId, minSkillLevel);
        }
        if (typeof window.canTeach === 'function') {
            return window.canTeach(characterId, roleId, minSkillLevel);
        }
        var skill = _getSkillLevel(characterId, roleId);
        return skill >= (minSkillLevel || 51);
    }

    // =========================================================================
    // 11. STATE QUERIES (Using Relationship Registry)
    // =========================================================================

    function getAllApprenticeships() {
        if (typeof window.getAllRelationships === 'function') {
            return window.getAllRelationships().filter(function(r) {
                return r.type === ARCHETYPES.APPRENTICESHIP;
            });
        }
        return [];
    }

    function getApprenticeshipById(id) {
        if (typeof window.getRelationshipById === 'function') {
            var rel = window.getRelationshipById(id);
            if (rel && rel.type === ARCHETYPES.APPRENTICESHIP) return rel;
        }
        return null;
    }

    function getApprenticeshipsByMaster(masterId) {
        if (typeof window.getRelationshipsForCharacter === 'function') {
            return window.getRelationshipsForCharacter(masterId, { type: ARCHETYPES.APPRENTICESHIP });
        }
        return [];
    }

    function getApprenticeshipsByApprentice(apprenticeId) {
        if (typeof window.getRelationshipsForCharacter === 'function') {
            return window.getRelationshipsForCharacter(apprenticeId, { type: ARCHETYPES.APPRENTICESHIP });
        }
        return [];
    }

    function getApprenticeshipBetween(masterId, apprenticeId) {
        return getApprenticeship(masterId, apprenticeId);
    }

    // =========================================================================
    // 12. INTERNAL HELPERS (Backward Compatibility)
    // =========================================================================

    function _getApprenticeships() {
        return getAllApprenticeships();
    }

    function _getAllApprenticeships() {
        return getAllApprenticeships();
    }

    function _validateApprenticeship(masterId, apprenticeId, roleId) {
        var master = _getCharacterById(masterId);
        var apprentice = _getCharacterById(apprenticeId);

        if (!master || !apprentice) {
            return { valid: false, reason: 'Character not found' };
        }

        var masterSkill = _getSkillLevel(masterId, roleId);
        if (masterSkill < 51) {
            return {
                valid: false,
                reason: 'Master is only ' + (_getSkillLevelName(masterSkill)) + '. Need Journeyman level (51+) to teach.'
            };
        }

        return { valid: true, reason: 'Valid apprenticeship' };
    }

    function _getApprenticeshipSkillLevel(masterId, apprenticeId) {
        var app = getApprenticeship(masterId, apprenticeId);
        return app?.metadata?.skillLevel || 0;
    }

    function _getApprenticeshipStage(masterId, apprenticeId) {
        var app = getApprenticeship(masterId, apprenticeId);
        if (app) {
            var stageId = app.metadata?.stage || 'novice';
            var stages = window.APPRENTICESHIP_STAGES || {};
            return stages[stageId.toUpperCase()] || stages.NOVICE || { id: 'novice', name: 'Novice', minLevel: 0, maxLevel: 25 };
        }
        return { id: 'novice', name: 'Novice', minLevel: 0, maxLevel: 25 };
    }

    function _getApprenticeshipProgress(masterId, apprenticeId) {
        var app = getApprenticeship(masterId, apprenticeId);
        if (app) {
            var skillLevel = app.metadata?.skillLevel || 0;
            var stage = _getApprenticeshipStage(masterId, apprenticeId);
            var range = stage.maxLevel - stage.minLevel;
            if (range === 0) return 100;
            var stageProgress = ((skillLevel - stage.minLevel) / range) * 100;
            return Math.min(100, Math.max(0, Math.floor(stageProgress)));
        }
        return 0;
    }

    function _getApprenticeshipRole(masterId, apprenticeId) {
        var app = getApprenticeship(masterId, apprenticeId);
        var roleId = app?.metadata?.roleId;
        if (roleId) {
            return _getRoleById(roleId);
        }
        return null;
    }

    // =========================================================================
    // 13. EXPORTS
    // =========================================================================

    window.ApprenticeshipSystem = {
        // Creation
        createApprenticeship: createApprenticeship,
        updateApprenticeship: updateApprenticeship,
        progressApprenticeship: progressApprenticeship,
        completeApprenticeship: completeApprenticeship,
        terminateApprenticeship: terminateApprenticeship,

        // Teaching
        teachSkill: teachSkill,
        teachSpecialization: teachSpecialization,
        conductTeachingSession: conductTeachingSession,
        advanceApprenticeshipSkills: advanceApprenticeshipSkills,

        // Knowledge preservation
        preserveKnowledgeOnDeath: preserveKnowledgeOnDeath,
        assessKnowledgeLoss: assessKnowledgeLoss,

        // Queries (delegated)
        getMaster: getMaster,
        getApprentices: getApprentices,
        isApprentice: isApprentice,
        isMaster: isMaster,
        getApprenticeship: getApprenticeship,
        getApprenticeshipRole: getApprenticeshipRole,
        getTeachableSkills: getTeachableSkills,
        findPotentialMasters: findPotentialMasters,
        canTeach: canTeach,

        // State queries
        getAllApprenticeships: getAllApprenticeships,
        getApprenticeshipById: getApprenticeshipById,
        getApprenticeshipsByMaster: getApprenticeshipsByMaster,
        getApprenticeshipsByApprentice: getApprenticeshipsByApprentice,
        getApprenticeshipBetween: getApprenticeshipBetween,

        // Internal helpers (backward compatibility)
        _getApprenticeships: _getApprenticeships,
        _getAllApprenticeships: _getAllApprenticeships,
        _validateApprenticeship: _validateApprenticeship,
        _getApprenticeshipSkillLevel: _getApprenticeshipSkillLevel,
        _getApprenticeshipStage: _getApprenticeshipStage,
        _getApprenticeshipProgress: _getApprenticeshipProgress,
        _getApprenticeshipRole: _getApprenticeshipRole,

        // Legacy aliases
        endApprenticeship: terminateApprenticeship,
        cancelApprenticeship: function(masterId, apprenticeId, reason) {
            return terminateApprenticeship(masterId, apprenticeId, reason);
        }
    };

    // Legacy aliases
    window.createApprenticeship = createApprenticeship;
    window.updateApprenticeship = updateApprenticeship;
    window.progressApprenticeship = progressApprenticeship;
    window.completeApprenticeship = completeApprenticeship;
    window.terminateApprenticeship = terminateApprenticeship;
    window.teachSkill = teachSkill;
    window.teachSpecialization = teachSpecialization;
    window.conductTeachingSession = conductTeachingSession;
    window.advanceApprenticeshipSkills = advanceApprenticeshipSkills;
    window.preserveKnowledgeOnDeath = preserveKnowledgeOnDeath;
    window.assessKnowledgeLoss = assessKnowledgeLoss;
    window.getAllApprenticeships = getAllApprenticeships;
    window.getApprenticeshipById = getApprenticeshipById;
    window.getApprenticeshipsByMaster = getApprenticeshipsByMaster;
    window.getApprenticeshipsByApprentice = getApprenticeshipsByApprentice;
    window.getApprenticeshipBetween = getApprenticeshipBetween;
    window._getApprenticeships = _getApprenticeships;
    window._getAllApprenticeships = _getAllApprenticeships;
    window._validateApprenticeship = _validateApprenticeship;
    window._getApprenticeshipSkillLevel = _getApprenticeshipSkillLevel;
    window._getApprenticeshipStage = _getApprenticeshipStage;
    window._getApprenticeshipProgress = _getApprenticeshipProgress;
    window._getApprenticeshipRole = _getApprenticeshipRole;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.ApprenticeshipSystem;
    }

})();