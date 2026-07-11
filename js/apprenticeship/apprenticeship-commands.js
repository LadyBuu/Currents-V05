/**
 * =============================================================================
 * STILL WATERS - APPRENTICESHIP COMMANDS (apprenticeship-commands.js)
 * =============================================================================
 * 
 * This file contains ALL write operations for apprenticeships.
 * - NO TRUST SYSTEM
 * - Full validation
 * - History recording
 * 
 * DEPENDENCIES:
 *   - apprenticeship-state.js (ApprenticeshipState)
 *   - apprenticeship-constants.js (APPRENTICESHIP_STAGES)
 *   - apprenticeship-queries.js (ApprenticeshipQueries)
 *   - accessors.js (getCharacterById, getCharacters, getRoleById)
 *   - relationship-registry.js (createRelationship, updateRelationship, endRelationship)
 *   - ids.js (generateId)
 *   - time.js (getCurrentYearSafe)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARDS
    // =========================================================================

    var _processingCommand = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
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
        return null;
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

    function _generateId(prefix) {
        if (typeof window.generateId === 'function') {
            return window.generateId(prefix);
        }
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(message, type);
        }
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

    function _getRelationshipArchetypes() {
        return window.RELATIONSHIP_ARCHETYPES || {
            APPRENTICESHIP: 'apprenticeship'
        };
    }

    function _getRelationshipStatus() {
        return window.RELATIONSHIP_STATUS || {
            ONGOING: 'ongoing',
            ENDED: 'ended'
        };
    }

    function _createRelationship(idA, idB, options) {
        if (typeof window.createRelationship === 'function') {
            return window.createRelationship(idA, idB, options);
        }
        return null;
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
    // 3. STAGE HELPERS
    // =========================================================================

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

    function _getLevelForStage(stageId) {
        var stages = window.APPRENTICESHIP_STAGES || {};
        var stage = stages[stageId.toUpperCase()];
        return stage ? stage.minLevel : 0;
    }

    // =========================================================================
    // 4. CREATE APPRENTICESHIP
    // =========================================================================

    /**
     * Creates a new apprenticeship
     * @param {string} masterId - Master character ID
     * @param {string} apprenticeId - Apprentice character ID
     * @param {Object} options - Options
     * @param {string} options.roleId - Role ID (required)
     * @param {number} options.startYear - Start year (default: current)
     * @param {number} options.initialSkill - Initial skill level (default: 10)
     * @param {string} options.notes - Notes
     * @param {Array} options.specializations - Initial specializations
     * @returns {Object|null} Created apprenticeship or null
     */
    function createApprenticeship(masterId, apprenticeId, options) {
        // RECURSION GUARD
        if (_processingCommand) {
            return null;
        }
        _processingCommand = true;

        try {
            options = options || {};

            var master = _getCharacterById(masterId);
            var apprentice = _getCharacterById(apprenticeId);

            if (!master || !apprentice) {
                _showToast('Character not found', 'error');
                return null;
            }

            if (masterId === apprenticeId) {
                _showToast('Cannot apprentice to yourself', 'error');
                return null;
            }

            if (master.isDeceased) {
                _showToast('Master is deceased', 'error');
                return null;
            }

            if (apprentice.isDeceased) {
                _showToast('Apprentice is deceased', 'error');
                return null;
            }

            var roleId = options.roleId;
            if (!roleId) {
                _showToast('Role ID is required', 'error');
                return null;
            }

            var role = _getRoleById(roleId);
            if (!role) {
                _showToast('Role not found', 'error');
                return null;
            }

            // Check master skill
            var masterSkill = 0;
            if (master.professions) {
                for (var i = 0; i < master.professions.length; i++) {
                    if (master.professions[i].id === roleId) {
                        masterSkill = master.professions[i].skillLevel || 0;
                        break;
                    }
                }
            }

            if (masterSkill < 51) {
                _showToast('Master does not have sufficient skill (needs Journeyman level 51+)', 'error');
                return null;
            }

            // Check if apprentice already has this role
            if (apprentice.professions) {
                for (var i = 0; i < apprentice.professions.length; i++) {
                    if (apprentice.professions[i].id === roleId) {
                        _showToast('Apprentice already has this profession', 'error');
                        return null;
                    }
                }
            }

            // Check if already in apprenticeship
            var existing = ApprenticeshipState.getApprenticeshipBetween(masterId, apprenticeId);
            var STATUS = _getRelationshipStatus();
            if (existing && existing.status === STATUS.ONGOING) {
                _showToast('Already in an apprenticeship', 'error');
                return null;
            }

            var ARCHETYPES = _getRelationshipArchetypes();
            var startYear = options.startYear || _getCurrentYear();
            var initialSkill = options.initialSkill !== undefined ? options.initialSkill : 10;
            var initialStage = _getStageFromLevel(initialSkill);

            // Create the apprenticeship relationship
            var apprenticeship = _createRelationship(masterId, apprenticeId, {
                type: ARCHETYPES.APPRENTICESHIP,
                status: STATUS.ONGOING,
                startYear: startYear,
                metadata: {
                    roleId: roleId,
                    roleName: role.name,
                    skillLevel: Math.min(100, Math.max(0, initialSkill)),
                    stage: initialStage.id,
                    startAge: _calculateAge(apprentice.birthYear, false, null),
                    startSkill: initialSkill,
                    specializationsTaught: options.specializations || [],
                    teachingHistory: [],
                    notes: options.notes || ''
                }
            });

            if (!apprenticeship) {
                _showToast('Failed to create apprenticeship', 'error');
                return null;
            }

            // Add profession to apprentice
            var profResult = _addProfession(apprenticeId, roleId, {
                skillLevel: initialSkill,
                startYear: startYear,
                learnedVia: 'apprenticeship',
                masterId: masterId,
                notes: 'Apprenticeship under ' + master.name + (options.notes ? ': ' + options.notes : '')
            });

            if (!profResult || !profResult.success) {
                // Rollback relationship if profession add fails
                _endRelationship(apprenticeship.id, startYear, 'Failed to add profession');
                _showToast('Failed to add profession', 'error');
                return null;
            }

            // Update state
            ApprenticeshipState._addApprenticeship(apprenticeship);

            _logEvent('apprenticeship', 'Apprenticeship Begun',
                apprentice.name + ' began apprenticing under ' + master.name + ' as a ' + role.name,
                [master, apprentice]);

            _showToast('Created apprenticeship: ' + apprentice.name + ' → ' + master.name + ' (' + role.name + ')', 'success');

            if (typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(new CustomEvent('apprenticeshipsUpdated', { detail: { apprenticeshipId: apprenticeship.id } }));
            }

            return apprenticeship;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 5. UPDATE APPRENTICESHIP
    // =========================================================================

    /**
     * Updates an apprenticeship
     * @param {string} masterId - Master character ID
     * @param {string} apprenticeId - Apprentice character ID
     * @param {Object} updates - Updates to apply
     * @param {string} updates.roleId - New role ID
     * @param {number} updates.skillLevel - New skill level
     * @param {string} updates.notes - New notes
     * @param {number} updates.startYear - New start year
     * @param {string} updates.status - New status
     * @param {Array} updates.specializationsTaught - New specializations
     * @returns {boolean} True if updated
     */
    function updateApprenticeship(masterId, apprenticeId, updates) {
        // RECURSION GUARD
        if (_processingCommand) {
            return false;
        }
        _processingCommand = true;

        try {
            var apprenticeship = ApprenticeshipState.getApprenticeshipBetween(masterId, apprenticeId);
            if (!apprenticeship) {
                _showToast('Apprenticeship not found', 'error');
                return false;
            }

            var STATUS = _getRelationshipStatus();
            var metadata = { ...apprenticeship.metadata };
            var relationshipUpdates = {};

            // Update role
            if (updates.roleId !== undefined && updates.roleId !== metadata.roleId) {
                var role = _getRoleById(updates.roleId);
                if (role) {
                    metadata.roleId = updates.roleId;
                    metadata.roleName = role.name;

                    // Update profession
                    var apprentice = _getCharacterById(apprenticeId);
                    if (apprentice && apprentice.professions) {
                        var existingProf = null;
                        for (var i = 0; i < apprentice.professions.length; i++) {
                            if (apprentice.professions[i].id === updates.roleId) {
                                existingProf = apprentice.professions[i];
                                break;
                            }
                        }
                        if (!existingProf) {
                            _addProfession(apprenticeId, updates.roleId, {
                                skillLevel: metadata.skillLevel || 0,
                                startYear: apprenticeship.startYear || _getCurrentYear(),
                                learnedVia: 'apprenticeship',
                                masterId: masterId,
                                notes: 'Apprenticeship under ' + (_getCharacterById(masterId)?.name || 'Master')
                            });
                        }
                    }
                }
            }

            // Update skill level
            if (updates.skillLevel !== undefined) {
                var boundedLevel = Math.min(100, Math.max(0, updates.skillLevel));
                metadata.skillLevel = boundedLevel;
                metadata.stage = _getStageFromLevel(boundedLevel).id;

                var roleId = metadata.roleId || apprenticeship.metadata?.roleId;
                if (roleId) {
                    _updateProfessionSkill(apprenticeId, roleId, boundedLevel);
                }
            }

            // Update notes
            if (updates.notes !== undefined) {
                metadata.notes = updates.notes;
            }

            // Update start year
            if (updates.startYear !== undefined) {
                relationshipUpdates.startYear = updates.startYear;
            }

            // Update status
            if (updates.status !== undefined) {
                relationshipUpdates.status = updates.status;
            }

            // Update specializations
            if (updates.specializationsTaught !== undefined) {
                metadata.specializationsTaught = updates.specializationsTaught;
            }

            // Apply updates
            _updateRelationship(apprenticeship.id, {
                ...relationshipUpdates,
                metadata: metadata
            });

            // Update state
            ApprenticeshipState._updateApprenticeship(apprenticeship.id, {
                status: relationshipUpdates.status || apprenticeship.status,
                startYear: relationshipUpdates.startYear || apprenticeship.startYear,
                metadata: metadata
            });

            _logEvent('apprenticeship', 'Apprenticeship Updated',
                'Apprenticeship between ' + (_getCharacterById(masterId)?.name || 'Master') + ' and ' + (_getCharacterById(apprenticeId)?.name || 'Apprentice') + ' was updated',
                []);

            _showToast('Apprenticeship updated', 'success');

            if (typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(new CustomEvent('apprenticeshipsUpdated', {}));
            }

            return true;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 6. SET SKILL LEVEL
    // =========================================================================

    /**
     * Sets the skill level for an apprenticeship
     * @param {string} masterId - Master character ID
     * @param {string} apprenticeId - Apprentice character ID
     * @param {number} level - New skill level (0-100)
     * @returns {boolean} True if set
     */
    function setSkillLevel(masterId, apprenticeId, level) {
        // RECURSION GUARD
        if (_processingCommand) {
            return false;
        }
        _processingCommand = true;

        try {
            return updateApprenticeship(masterId, apprenticeId, {
                skillLevel: level
            });

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 7. PROGRESS APPRENTICESHIP
    // =========================================================================

    /**
     * Progresses an apprenticeship by a certain amount
     * @param {string} masterId - Master character ID
     * @param {string} apprenticeId - Apprentice character ID
     * @param {number} amount - Amount to progress (default: 5)
     * @returns {Object} Result object
     */
    function progressApprenticeship(masterId, apprenticeId, amount) {
        // RECURSION GUARD
        if (_processingCommand) {
            return { success: false, reason: 'Already processing' };
        }
        _processingCommand = true;

        try {
            amount = amount || 5;

            var apprenticeship = ApprenticeshipState.getApprenticeshipBetween(masterId, apprenticeId);
            if (!apprenticeship) {
                return { success: false, reason: 'Apprenticeship not found' };
            }

            var STATUS = _getRelationshipStatus();
            if (apprenticeship.status !== STATUS.ONGOING) {
                return { success: false, reason: 'Apprenticeship is not active' };
            }

            var currentLevel = apprenticeship.metadata?.skillLevel || 0;
            var oldStage = _getStageFromLevel(currentLevel);
            var newLevel = Math.min(100, currentLevel + amount);
            var newStage = _getStageFromLevel(newLevel);
            var stageChanged = oldStage.id !== newStage.id;

            // Update skill level
            var success = setSkillLevel(masterId, apprenticeId, newLevel);
            if (!success) {
                return { success: false, reason: 'Failed to update skill level' };
            }

            // Add to teaching history
            var metadata = { ...apprenticeship.metadata };
            if (!metadata.teachingHistory) metadata.teachingHistory = [];
            metadata.teachingHistory.push({
                gain: amount,
                newLevel: newLevel,
                year: _getCurrentYear()
            });
            if (metadata.teachingHistory.length > 50) {
                metadata.teachingHistory = metadata.teachingHistory.slice(-50);
            }

            _updateRelationship(apprenticeship.id, {
                metadata: metadata
            });

            ApprenticeshipState._updateApprenticeship(apprenticeship.id, {
                metadata: metadata
            });

            var completed = false;
            if (newStage.id === 'master') {
                var completeResult = completeApprenticeship(masterId, apprenticeId);
                completed = completeResult;
            }

            _logEvent('apprenticeship', 'Skill Progress',
                (_getCharacterById(apprenticeId)?.name || 'Apprentice') + ' progressed to ' + newStage.name + ' (' + newLevel + ')',
                []);

            if (typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(new CustomEvent('apprenticeshipsUpdated', {}));
            }

            return {
                success: true,
                oldLevel: currentLevel,
                newLevel: newLevel,
                gained: newLevel - currentLevel,
                oldStage: oldStage.name,
                newStage: newStage.name,
                stageChanged: stageChanged,
                completed: completed
            };

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 8. COMPLETE APPRENTICESHIP
    // =========================================================================

    /**
     * Completes an apprenticeship
     * @param {string} masterId - Master character ID
     * @param {string} apprenticeId - Apprentice character ID
     * @param {number} finalSkillLevel - Final skill level (optional)
     * @returns {boolean} True if completed
     */
    function completeApprenticeship(masterId, apprenticeId, finalSkillLevel) {
        // RECURSION GUARD
        if (_processingCommand) {
            return false;
        }
        _processingCommand = true;

        try {
            var apprenticeship = ApprenticeshipState.getApprenticeshipBetween(masterId, apprenticeId);
            if (!apprenticeship) {
                _showToast('Apprenticeship not found', 'error');
                return false;
            }

            var STATUS = _getRelationshipStatus();
            if (apprenticeship.status !== STATUS.ONGOING) {
                _showToast('Apprenticeship is not active', 'error');
                return false;
            }

            var currentSkill = apprenticeship.metadata?.skillLevel || 0;
            var finalSkill = finalSkillLevel !== undefined ? finalSkillLevel : Math.max(currentSkill, 76);

            // Set final skill level
            var success = setSkillLevel(masterId, apprenticeId, finalSkill);
            if (!success) {
                _showToast('Failed to set final skill level', 'error');
                return false;
            }

            // End the apprenticeship
            var endYear = _getCurrentYear();
            _endRelationship(apprenticeship.id, endYear, 'Apprenticeship completed');

            // Update state
            ApprenticeshipState._updateApprenticeship(apprenticeship.id, {
                status: 'completed',
                endYear: endYear
            });

            // Update apprentice status
            var apprentice = _getCharacterById(apprenticeId);
            if (apprentice) {
                if (finalSkill >= 51) apprentice.isJourneyman = true;
                if (finalSkill >= 76) apprentice.isMaster = true;

                // Update profession
                var roleId = apprenticeship.metadata?.roleId;
                if (roleId) {
                    _updateProfessionSkill(apprenticeId, roleId, finalSkill);
                    if (apprentice.professions) {
                        for (var i = 0; i < apprentice.professions.length; i++) {
                            if (apprentice.professions[i].id === roleId) {
                                apprentice.professions[i].completed = true;
                                apprentice.professions[i].completionYear = endYear;
                                break;
                            }
                        }
                    }
                }
            }

            _logEvent('apprenticeship', 'Apprenticeship Completed',
                (_getCharacterById(apprenticeId)?.name || 'Apprentice') + ' completed apprenticeship with final skill ' + finalSkill,
                []);

            _showToast('Apprenticeship completed!', 'success');

            if (typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(new CustomEvent('apprenticeshipsUpdated', {}));
            }

            return true;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 9. END APPRENTICESHIP
    // =========================================================================

    /**
     * Ends an apprenticeship
     * @param {string} masterId - Master character ID
     * @param {string} apprenticeId - Apprentice character ID
     * @param {Object} options - Options
     * @param {number} options.endYear - End year (default: current)
     * @param {string} options.reason - Reason for ending
     * @returns {boolean} True if ended
     */
    function endApprenticeship(masterId, apprenticeId, options) {
        // RECURSION GUARD
        if (_processingCommand) {
            return false;
        }
        _processingCommand = true;

        try {
            options = options || {};

            var apprenticeship = ApprenticeshipState.getApprenticeshipBetween(masterId, apprenticeId);
            if (!apprenticeship) {
                _showToast('Apprenticeship not found', 'error');
                return false;
            }

            var endYear = options.endYear || _getCurrentYear();
            var reason = options.reason || 'Apprenticeship ended';

            _endRelationship(apprenticeship.id, endYear, reason);

            ApprenticeshipState._updateApprenticeship(apprenticeship.id, {
                status: 'ended',
                endYear: endYear,
                endReason: reason
            });

            _logEvent('apprenticeship', 'Apprenticeship Ended',
                'Apprenticeship between ' + (_getCharacterById(masterId)?.name || 'Master') + ' and ' + (_getCharacterById(apprenticeId)?.name || 'Apprentice') + ' ended: ' + reason,
                []);

            _showToast('Apprenticeship ended', 'info');

            if (typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(new CustomEvent('apprenticeshipsUpdated', {}));
            }

            return true;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 10. CANCEL APPRENTICESHIP (Alias for end)
    // =========================================================================

    function cancelApprenticeship(masterId, apprenticeId, reason) {
        return endApprenticeship(masterId, apprenticeId, {
            reason: reason || 'Cancelled'
        });
    }

    // =========================================================================
    // 11. TERMINATE APPRENTICESHIP (Alias for end)
    // =========================================================================

    function terminateApprenticeship(masterId, apprenticeId, reason) {
        return endApprenticeship(masterId, apprenticeId, {
            reason: reason || 'Terminated'
        });
    }

    // =========================================================================
    // 12. PROGRESS STAGE
    // =========================================================================

    /**
     * Progresses an apprenticeship to a specific stage
     * @param {string} masterId - Master character ID
     * @param {string} apprenticeId - Apprentice character ID
     * @param {string} stageId - Stage ID ('novice', 'apprentice', 'journeyman', 'master')
     * @returns {boolean} True if progressed
     */
    function progressApprenticeshipStage(masterId, apprenticeId, stageId) {
        // RECURSION GUARD
        if (_processingCommand) {
            return false;
        }
        _processingCommand = true;

        try {
            var targetLevel = _getLevelForStage(stageId);
            if (targetLevel === 0) {
                _showToast('Invalid stage', 'error');
                return false;
            }

            return setSkillLevel(masterId, apprenticeId, targetLevel);

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 13. EXPORTS
    // =========================================================================

    window.ApprenticeshipCommands = {
        createApprenticeship: createApprenticeship,
        updateApprenticeship: updateApprenticeship,
        setSkillLevel: setSkillLevel,
        progressApprenticeship: progressApprenticeship,
        completeApprenticeship: completeApprenticeship,
        endApprenticeship: endApprenticeship,
        cancelApprenticeship: cancelApprenticeship,
        terminateApprenticeship: terminateApprenticeship,
        progressApprenticeshipStage: progressApprenticeshipStage
    };

    // Legacy aliases
    window._createApprenticeship = createApprenticeship;
    window._updateApprenticeship = updateApprenticeship;
    window._setSkillLevel = setSkillLevel;
    window._progressApprenticeship = progressApprenticeship;
    window._completeApprenticeship = completeApprenticeship;
    window._endApprenticeship = endApprenticeship;
    window._cancelApprenticeship = cancelApprenticeship;
    window._terminateApprenticeship = terminateApprenticeship;
    window._progressApprenticeshipStage = progressApprenticeshipStage;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            createApprenticeship: createApprenticeship,
            updateApprenticeship: updateApprenticeship,
            setSkillLevel: setSkillLevel,
            progressApprenticeship: progressApprenticeship,
            completeApprenticeship: completeApprenticeship,
            endApprenticeship: endApprenticeship,
            cancelApprenticeship: cancelApprenticeship,
            terminateApprenticeship: terminateApprenticeship,
            progressApprenticeshipStage: progressApprenticeshipStage
        };
    }

})();