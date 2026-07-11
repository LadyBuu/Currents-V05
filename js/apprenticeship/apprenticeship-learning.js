/**
 * =============================================================================
 * STILL WATERS - APPRENTICESHIP LEARNING (apprenticeship-learning.js)
 * =============================================================================
 * 
 * This file contains business logic for apprenticeship learning:
 * - Teaching skills
 * - Teaching specializations
 * - Conducting teaching sessions
 * - Annual skill advancement
 * - Knowledge preservation
 * - NO TRUST SYSTEM
 * 
 * DEPENDENCIES:
 *   - apprenticeship-state.js (ApprenticeshipState)
 *   - apprenticeship-commands.js (ApprenticeshipCommands)
 *   - apprenticeship-queries.js (ApprenticeshipQueries)
 *   - apprenticeship-constants.js (SKILL_TRANSFER_METHODS)
 *   - accessors.js (getCharacterById, getCharacters)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARDS
    // =========================================================================

    var _processingLearning = false;

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

    function _calculateAge(birthYear, isDeceased, deathYear) {
        if (typeof window.calculateAge === 'function') {
            return window.calculateAge(birthYear, isDeceased, deathYear);
        }
        var currentYear = _getCurrentYear();
        if (!birthYear) return 0;
        if (isDeceased && deathYear) return Math.max(0, deathYear - birthYear);
        return Math.max(0, currentYear - birthYear);
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

    function _chance(probability) {
        if (typeof window.chance === 'function') {
            return window.chance(probability);
        }
        return Math.random() < probability;
    }

    function _addProfession(characterId, roleId, options) {
        if (typeof window.addProfession === 'function') {
            return window.addProfession(characterId, roleId, options);
        }
        return { success: false };
    }

    function _addProfessionSpecialization(characterId, roleId, specialization) {
        if (typeof window.addProfessionSpecialization === 'function') {
            return window.addProfessionSpecialization(characterId, roleId, specialization);
        }
        return { success: false };
    }

    function _getSkillLevel(characterId, roleId) {
        if (typeof window.ApprenticeshipQueries !== 'undefined') {
            return window.ApprenticeshipQueries.getSkillLevel(characterId, roleId);
        }
        return 0;
    }

    function _getSkillLevelName(level) {
        if (typeof window.ApprenticeshipQueries !== 'undefined') {
            return window.ApprenticeshipQueries.getSkillLevelName(level);
        }
        var skillLevels = window.SKILL_LEVELS || {};
        for (var key in skillLevels) {
            var tier = skillLevels[key];
            if (level >= tier.min && level <= tier.max) {
                return tier.name;
            }
        }
        return 'Untrained';
    }

    function _progressApprenticeship(masterId, apprenticeId, amount) {
        if (typeof window.ApprenticeshipCommands !== 'undefined') {
            return window.ApprenticeshipCommands.progressApprenticeship(masterId, apprenticeId, amount);
        }
        return { success: false };
    }

    function _getApprenticeship(masterId, apprenticeId) {
        if (typeof window.ApprenticeshipState !== 'undefined') {
            return window.ApprenticeshipState.getApprenticeshipBetween(masterId, apprenticeId);
        }
        return null;
    }

    function _updateApprenticeship(masterId, apprenticeId, updates) {
        if (typeof window.ApprenticeshipCommands !== 'undefined') {
            return window.ApprenticeshipCommands.updateApprenticeship(masterId, apprenticeId, updates);
        }
        return false;
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    function _getSkillTransferMethods() {
        return window.SKILL_TRANSFER_METHODS || {};
    }

    // =========================================================================
    // 3. TEACH SKILL
    // =========================================================================

    /**
     * Teaches a skill to an apprentice
     * @param {string} masterId - Master character ID
     * @param {string} apprenticeId - Apprentice character ID
     * @param {string} method - Teaching method (from SKILL_TRANSFER_METHODS)
     * @returns {Object} Result object
     */
    function teachSkill(masterId, apprenticeId, method) {
        // RECURSION GUARD
        if (_processingLearning) {
            return { success: false, reason: 'Already processing' };
        }
        _processingLearning = true;

        try {
            var master = _getCharacterById(masterId);
            var apprentice = _getCharacterById(apprenticeId);

            if (!master || !apprentice) {
                return { success: false, reason: 'Character not found' };
            }

            var apprenticeship = _getApprenticeship(masterId, apprenticeId);
            if (!apprenticeship) {
                return { success: false, reason: 'No apprenticeship found' };
            }

            var roleId = apprenticeship.metadata?.roleId;
            var role = roleId ? _getRoleById(roleId) : null;

            if (!role) {
                return { success: false, reason: 'Role not found' };
            }

            var methods = _getSkillTransferMethods();
            var methodConfig = methods[method.toUpperCase()] || methods.TEACHING || {
                name: 'Teaching',
                baseSuccess: 0.75,
                gain: 5
            };

            var currentLevel = apprenticeship.metadata?.skillLevel || 0;

            // Calculate success chance
            var successChance = methodConfig.baseSuccess || 0.75;

            // Master skill bonus
            var masterSkill = _getSkillLevel(masterId, roleId);
            if (masterSkill >= 90) successChance += 0.15;
            else if (masterSkill >= 75) successChance += 0.1;

            // Diminishing returns at high levels
            if (currentLevel >= 90) successChance -= 0.2;
            else if (currentLevel >= 75) successChance -= 0.1;
            else if (currentLevel < 30) successChance += 0.1;

            successChance = Math.min(0.95, Math.max(0.05, successChance));

            var success = _chance(successChance);

            if (success) {
                var gain = methodConfig.gain || 5;
                var result = _progressApprenticeship(masterId, apprenticeId, gain);

                _logEvent('skill', 'Skill Taught',
                    master.name + ' taught ' + apprentice.name + ' ' + role.name + ' (' + methodConfig.name + ')',
                    [master, apprentice]);

                return {
                    success: true,
                    method: methodConfig.name,
                    successChance: successChance,
                    profession: role.name,
                    gain: gain,
                    newLevel: result.newLevel || currentLevel + gain,
                    newStage: result.newStage || 'unknown'
                };
            }

            return {
                success: false,
                reason: 'Teaching attempt failed',
                successChance: successChance,
                method: methodConfig.name
            };

        } finally {
            _processingLearning = false;
        }
    }

    // =========================================================================
    // 4. TEACH SPECIALIZATION
    // =========================================================================

    /**
     * Teaches a specialization to an apprentice
     * @param {string} masterId - Master character ID
     * @param {string} apprenticeId - Apprentice character ID
     * @param {string} specialization - Specialization name
     * @returns {Object} Result object
     */
    function teachSpecialization(masterId, apprenticeId, specialization) {
        // RECURSION GUARD
        if (_processingLearning) {
            return { success: false, reason: 'Already processing' };
        }
        _processingLearning = true;

        try {
            var master = _getCharacterById(masterId);
            var apprentice = _getCharacterById(apprenticeId);

            if (!master || !apprentice) {
                return { success: false, reason: 'Character not found' };
            }

            var apprenticeship = _getApprenticeship(masterId, apprenticeId);
            if (!apprenticeship) {
                return { success: false, reason: 'No apprenticeship found' };
            }

            var roleId = apprenticeship.metadata?.roleId;
            var role = roleId ? _getRoleById(roleId) : null;

            if (!role) {
                return { success: false, reason: 'Role not found' };
            }

            if (!role.specializations || role.specializations.indexOf(specialization) === -1) {
                return {
                    success: false,
                    reason: '"' + specialization + '" is not a valid specialization for ' + role.name
                };
            }

            var masterSkill = _getSkillLevel(masterId, roleId);
            if (masterSkill < 60) {
                return {
                    success: false,
                    reason: 'Master is not skilled enough to teach this specialization (needs 60+)'
                };
            }

            var apprenticeProfession = null;
            if (apprentice.professions) {
                for (var i = 0; i < apprentice.professions.length; i++) {
                    if (apprentice.professions[i].id === roleId) {
                        apprenticeProfession = apprentice.professions[i];
                        break;
                    }
                }
            }

            if (apprenticeProfession && apprenticeProfession.specs &&
                apprenticeProfession.specs.indexOf(specialization) !== -1) {
                return { success: false, reason: 'Apprentice already knows ' + specialization };
            }

            var result = _addProfessionSpecialization(apprenticeId, roleId, specialization);
            if (result && result.success) {
                // Track taught specialization
                var taughtSpecs = apprenticeship.metadata?.specializationsTaught || [];
                if (taughtSpecs.indexOf(specialization) === -1) {
                    taughtSpecs.push(specialization);
                    _updateApprenticeship(masterId, apprenticeId, {
                        specializationsTaught: taughtSpecs
                    });
                }

                _logEvent('skill', 'Specialization Taught',
                    master.name + ' taught ' + apprentice.name + ' specialization: ' + specialization,
                    [master, apprentice]);

                _saveMasterData();

                return { success: true, specialization: specialization };
            }

            return { success: false, reason: 'Failed to add specialization' };

        } finally {
            _processingLearning = false;
        }
    }

    // =========================================================================
    // 5. CONDUCT TEACHING SESSION
    // =========================================================================

    /**
     * Conducts a teaching session
     * @param {string} masterId - Master character ID
     * @param {string} apprenticeId - Apprentice character ID
     * @param {number} hours - Hours spent teaching
     * @returns {Object} Result object
     */
    function conductTeachingSession(masterId, apprenticeId, hours) {
        // RECURSION GUARD
        if (_processingLearning) {
            return { success: false, reason: 'Already processing' };
        }
        _processingLearning = true;

        try {
            var apprenticeship = _getApprenticeship(masterId, apprenticeId);
            if (!apprenticeship) {
                return { success: false, reason: 'No apprenticeship found' };
            }

            var currentLevel = apprenticeship.metadata?.skillLevel || 0;
            var baseGain = Math.floor(hours / 10) * 2;

            var gain = baseGain;
            if (currentLevel > 75) {
                gain = Math.max(1, Math.floor(gain * 0.5));
            } else if (currentLevel < 25) {
                gain = Math.floor(gain * 1.5);
            }

            gain = Math.max(1, Math.min(10, gain));

            var result = _progressApprenticeship(masterId, apprenticeId, gain);

            var master = _getCharacterById(masterId);
            var apprentice = _getCharacterById(apprenticeId);

            _logEvent('skill', 'Teaching Session',
                (master ? master.name : 'Master') + ' taught ' + (apprentice ? apprentice.name : 'Apprentice') + ' for ' + hours + ' hours',
                [master, apprentice]);

            return {
                success: true,
                hoursSpent: hours,
                gain: gain,
                newLevel: result.newLevel || currentLevel + gain,
                stage: result.newStage || 'unknown'
            };

        } finally {
            _processingLearning = false;
        }
    }

    // =========================================================================
    // 6. ANNUAL SKILL ADVANCEMENT
    // =========================================================================

    /**
     * Advances all apprenticeships by one year
     * @param {number} year - Current year
     * @returns {Array} Array of advancement results
     */
    function advanceApprenticeshipSkills(year) {
        // RECURSION GUARD
        if (_processingLearning) {
            return [];
        }
        _processingLearning = true;

        try {
            year = year || _getCurrentYear();
            var apprenticeships = ApprenticeshipState.getAllApprenticeships();
            var STATUS = window.RELATIONSHIP_STATUS || { ONGOING: 'ongoing' };
            var results = [];

            for (var i = 0; i < apprenticeships.length; i++) {
                var app = apprenticeships[i];
                if (app.status !== STATUS.ONGOING) continue;

                var masterId = app.participantA;
                var apprenticeId = app.participantB;
                var startYear = app.startYear || year;
                var yearsActive = Math.max(0, year - startYear);

                if (yearsActive < 1) continue;

                var currentSkill = app.metadata?.skillLevel || 0;
                var gainAmount = 5;
                var newSkill = Math.min(100, currentSkill + gainAmount);

                if (newSkill > currentSkill) {
                    var result = _progressApprenticeship(masterId, apprenticeId, gainAmount);
                    if (result && result.success) {
                        var completed = false;
                        if (newSkill >= 76 && currentSkill < 76) {
                            completed = true;
                            if (typeof window.ApprenticeshipCommands !== 'undefined') {
                                window.ApprenticeshipCommands.completeApprenticeship(masterId, apprenticeId);
                            }
                        }

                        results.push({
                            apprenticeshipId: app.id,
                            masterId: masterId,
                            apprenticeId: apprenticeId,
                            roleId: app.metadata?.roleId,
                            oldSkill: currentSkill,
                            newSkill: newSkill,
                            gain: gainAmount,
                            completed: completed,
                            yearsActive: yearsActive
                        });
                    }
                }
            }

            if (results.length > 0) {
                _saveMasterData();
                if (typeof window.dispatchEvent === 'function') {
                    window.dispatchEvent(new CustomEvent('apprenticeshipsUpdated', {}));
                }
            }

            return results;

        } finally {
            _processingLearning = false;
        }
    }

    // =========================================================================
    // 7. KNOWLEDGE PRESERVATION
    // =========================================================================

    /**
     * Preserves knowledge from a dying character to an heir
     * @param {string} dyingId - Dying character ID
     * @param {string} heirId - Heir character ID
     * @returns {Array} Transferred skills
     */
    function preserveKnowledgeOnDeath(dyingId, heirId) {
        // RECURSION GUARD
        if (_processingLearning) {
            return [];
        }
        _processingLearning = true;

        try {
            var dying = _getCharacterById(dyingId);
            var heir = _getCharacterById(heirId);

            if (!dying || !heir) {
                return [];
            }

            var transferredSkills = [];

            for (var i = 0; i < (dying.professions || []).length; i++) {
                var profession = dying.professions[i];
                var skillLevel = profession.skillLevel || 25;
                var transferChance = skillLevel / 100;

                if (_chance(transferChance)) {
                    var existingProf = null;
                    if (heir.professions) {
                        for (var j = 0; j < heir.professions.length; j++) {
                            if (heir.professions[j].id === profession.id) {
                                existingProf = heir.professions[j];
                                break;
                            }
                        }
                    }

                    if (!existingProf) {
                        var result = _addProfession(heirId, profession.id, {
                            skillLevel: Math.max(1, skillLevel - 30),
                            specializations: profession.specs || [],
                            notes: 'Preserved knowledge from ' + dying.name
                        });
                        if (result && result.success) {
                            transferredSkills.push(profession.name);
                        }
                    } else {
                        var newLevel = Math.min(100, existingProf.skillLevel + 15);
                        if (typeof window.updateProfessionSkill === 'function') {
                            window.updateProfessionSkill(heirId, profession.id, newLevel);
                            transferredSkills.push(profession.name + ' (improved)');
                        }
                    }
                }
            }

            if (transferredSkills.length > 0) {
                _saveMasterData();
                _logEvent('knowledge', 'Knowledge Preserved',
                    heir.name + ' preserved ' + transferredSkills.length + ' skills from ' + dying.name,
                    [dying, heir]);
            }

            return transferredSkills;

        } finally {
            _processingLearning = false;
        }
    }

    // =========================================================================
    // 8. ASSESS KNOWLEDGE LOSS
    // =========================================================================

    /**
     * Assesses the impact of a character's death on knowledge
     * @param {string} characterId - Character ID
     * @returns {Object} Knowledge loss assessment
     */
    function assessKnowledgeLoss(characterId) {
        // RECURSION GUARD
        if (_processingLearning) {
            return { hasKnowledge: false, uniqueSkills: [], lossSeverity: 0, isCritical: false };
        }
        _processingLearning = true;

        try {
            var character = _getCharacterById(characterId);
            if (!character || !character.professions) {
                return { hasKnowledge: false, uniqueSkills: [], lossSeverity: 0, isCritical: false };
            }

            var uniqueSkills = [];
            var lossSeverity = 0;
            var allChars = _getCharacters();

            for (var i = 0; i < character.professions.length; i++) {
                var prof = character.professions[i];
                var skillLevel = prof.skillLevel || 25;

                if (skillLevel >= 80) {
                    var othersWithSkill = allChars.filter(function(c) {
                        if (c.id === characterId) return false;
                        if (c.isDeceased) return false;
                        if (!c.professions) return false;
                        for (var j = 0; j < c.professions.length; j++) {
                            if (c.professions[j].id === prof.id && (c.professions[j].skillLevel || 25) >= 70) {
                                return true;
                            }
                        }
                        return false;
                    });

                    if (othersWithSkill.length === 0) {
                        uniqueSkills.push({
                            profession: prof.name,
                            skillLevel: skillLevel,
                            skillTier: _getSkillLevelName(skillLevel)
                        });
                        lossSeverity += skillLevel;
                    }
                }
            }

            return {
                hasKnowledge: uniqueSkills.length > 0,
                uniqueSkills: uniqueSkills,
                lossSeverity: Math.min(100, lossSeverity / 10),
                isCritical: uniqueSkills.some(function(s) { return s.skillLevel >= 90; })
            };

        } finally {
            _processingLearning = false;
        }
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.ApprenticeshipLearning = {
        teachSkill: teachSkill,
        teachSpecialization: teachSpecialization,
        conductTeachingSession: conductTeachingSession,
        advanceApprenticeshipSkills: advanceApprenticeshipSkills,
        preserveKnowledgeOnDeath: preserveKnowledgeOnDeath,
        assessKnowledgeLoss: assessKnowledgeLoss
    };

    // Legacy aliases
    window._teachSkill = teachSkill;
    window._teachSpecialization = teachSpecialization;
    window._conductTeachingSession = conductTeachingSession;
    window._advanceApprenticeshipSkills = advanceApprenticeshipSkills;
    window._preserveKnowledgeOnDeath = preserveKnowledgeOnDeath;
    window._assessKnowledgeLoss = assessKnowledgeLoss;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            teachSkill: teachSkill,
            teachSpecialization: teachSpecialization,
            conductTeachingSession: conductTeachingSession,
            advanceApprenticeshipSkills: advanceApprenticeshipSkills,
            preserveKnowledgeOnDeath: preserveKnowledgeOnDeath,
            assessKnowledgeLoss: assessKnowledgeLoss
        };
    }

})();