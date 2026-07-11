/**
 * =============================================================================
 * STILL WATERS - APPRENTICESHIP QUERIES (apprenticeship-queries.js)
 * =============================================================================
 * 
 * This file contains ALL read operations for apprenticeships.
 * - NO TRUST SYSTEM
 * - NO side effects
 * 
 * DEPENDENCIES:
 *   - apprenticeship-state.js (ApprenticeshipState)
 *   - apprenticeship-constants.js (APPRENTICESHIP_STAGES, SKILL_LEVELS)
 *   - accessors.js (getCharacterById, getCharacters, getRoleById)
 *   - relationship-registry.js (getAllRelationships)
 *   - time.js (getCurrentYearSafe, calculateAge)
 *   - world.js (getCurrentLocation)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _processingQuery = false;

    // =========================================================================
    // 2. DEPENDENCIES - Direct references to global functions
    // =========================================================================

    // All functions are available globally from accessors.js, time.js, and world.js
    // No wrapper functions needed - use them directly!

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

    function _getSkillLevelName(level) {
        var skillLevels = window.SKILL_LEVELS || {};
        for (var key in skillLevels) {
            var tier = skillLevels[key];
            if (level >= tier.min && level <= tier.max) {
                return tier.name;
            }
        }
        return 'Untrained';
    }

    // =========================================================================
    // 4. APPRENTICESHIP QUERIES
    // =========================================================================

    /**
     * Gets the master of a character
     * @param {string} characterId - Character ID
     * @returns {Object|null} Master character or null
     */
    function getMaster(characterId) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;

        try {
            var apprenticeships = ApprenticeshipState.getApprenticeshipsByApprentice(characterId);
            var STATUS = window.RELATIONSHIP_STATUS || { ONGOING: 'ongoing', ENDED: 'ended' };

            for (var i = 0; i < apprenticeships.length; i++) {
                var app = apprenticeships[i];
                if (app.status === STATUS.ONGOING) {
                    return window.getCharacterById(app.participantA);
                }
            }
            return null;

        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets all apprentices of a master
     * @param {string} masterId - Master character ID
     * @param {boolean} activeOnly - Only active apprenticeships (default: true)
     * @returns {Array} Array of apprentice objects with details
     */
    function getApprentices(masterId, activeOnly) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            activeOnly = activeOnly !== undefined ? activeOnly : true;
            var apprenticeships = ApprenticeshipState.getApprenticeshipsByMaster(masterId);
            var STATUS = window.RELATIONSHIP_STATUS || { ONGOING: 'ongoing', ENDED: 'ended' };
            var result = [];

            for (var i = 0; i < apprenticeships.length; i++) {
                var app = apprenticeships[i];
                if (activeOnly && app.status !== STATUS.ONGOING) continue;

                var apprentice = window.getCharacterById(app.participantB);
                if (!apprentice) continue;

                result.push({
                    id: app.id,
                    character: apprentice,
                    roleId: app.metadata?.roleId,
                    roleName: app.metadata?.roleName,
                    skillLevel: app.metadata?.skillLevel || 0,
                    stage: app.metadata?.stage || 'novice',
                    startYear: app.startYear,
                    specializationsTaught: app.metadata?.specializationsTaught || [],
                    status: app.status
                });
            }

            result.sort(function(a, b) {
                return b.skillLevel - a.skillLevel;
            });

            return result;

        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Checks if a character is an apprentice
     * @param {string} characterId - Character ID
     * @returns {boolean} True if apprentice
     */
    function isApprentice(characterId) {
        if (_processingQuery) {
            return false;
        }
        _processingQuery = true;

        try {
            return getMaster(characterId) !== null;

        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Checks if a character is a master (has apprentices)
     * @param {string} characterId - Character ID
     * @returns {boolean} True if master
     */
    function isMaster(characterId) {
        if (_processingQuery) {
            return false;
        }
        _processingQuery = true;

        try {
            return getApprentices(characterId, true).length > 0;

        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets an apprenticeship between master and apprentice
     * @param {string} masterId - Master character ID
     * @param {string} apprenticeId - Apprentice character ID
     * @returns {Object|null} Apprenticeship object or null
     */
    function getApprenticeship(masterId, apprenticeId) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;

        try {
            return ApprenticeshipState.getApprenticeshipBetween(masterId, apprenticeId);

        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets the skill level of a character in a role
     * @param {string} characterId - Character ID
     * @param {string} roleId - Role ID
     * @returns {number} Skill level (0-100)
     */
    function getSkillLevel(characterId, roleId) {
        if (_processingQuery) {
            return 0;
        }
        _processingQuery = true;

        try {
            var character = window.getCharacterById(characterId);
            if (!character) return 0;

            var profession = null;
            if (character.professions) {
                for (var i = 0; i < character.professions.length; i++) {
                    if (character.professions[i].id === roleId) {
                        profession = character.professions[i];
                        break;
                    }
                }
            }

            if (profession && profession.skillLevel !== undefined) {
                return profession.skillLevel;
            }

            var master = getMaster(characterId);
            if (master) {
                var app = getApprenticeship(master.id, characterId);
                if (app && app.metadata?.roleId === roleId) {
                    return app.metadata?.skillLevel || 0;
                }
            }

            return 0;

        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets the skill level name for a skill level
     * @param {number} level - Skill level (0-100)
     * @returns {string} Skill level name
     */
    function getSkillLevelName(level) {
        if (_processingQuery) {
            return 'Untrained';
        }
        _processingQuery = true;

        try {
            return _getSkillLevelName(level);

        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets the skill modifier for a character in a role
     * @param {string} characterId - Character ID
     * @param {string} roleId - Role ID
     * @returns {number} Skill modifier (0-1.1)
     */
    function getSkillModifier(characterId, roleId) {
        if (_processingQuery) {
            return 0;
        }
        _processingQuery = true;

        try {
            var level = getSkillLevel(characterId, roleId);
            var skillLevels = window.SKILL_LEVELS || {};
            for (var key in skillLevels) {
                var tier = skillLevels[key];
                if (level >= tier.min && level <= tier.max) {
                    return tier.modifier || 0;
                }
            }
            return 0;

        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets the apprenticeship stage for a character
     * @param {string} characterId - Character ID
     * @param {string} roleId - Role ID (optional)
     * @returns {Object} Stage object
     */
    function getApprenticeshipStage(characterId, roleId) {
        if (_processingQuery) {
            return { id: 'novice', name: 'Novice', minLevel: 0, maxLevel: 25 };
        }
        _processingQuery = true;

        try {
            var skill = getSkillLevel(characterId, roleId);
            return _getStageFromLevel(skill);

        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets the apprenticeship progress percentage
     * @param {string} characterId - Character ID
     * @param {string} roleId - Role ID (optional)
     * @returns {number} Progress percentage (0-100)
     */
    function getApprenticeshipProgress(characterId, roleId) {
        if (_processingQuery) {
            return 0;
        }
        _processingQuery = true;

        try {
            var skill = getSkillLevel(characterId, roleId);
            var stage = _getStageFromLevel(skill);
            var range = stage.maxLevel - stage.minLevel;
            if (range === 0) return 100;
            var stageProgress = ((skill - stage.minLevel) / range) * 100;
            return Math.min(100, Math.max(0, Math.floor(stageProgress)));

        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets the role being learned in an apprenticeship
     * @param {string} characterId - Character ID
     * @returns {Object|null} Role object or null
     */
    function getApprenticeshipRole(characterId) {
        if (_processingQuery) {
            return null;
        }
        _processingQuery = true;

        try {
            var master = getMaster(characterId);
            if (!master) return null;

            var app = getApprenticeship(master.id, characterId);
            if (!app || !app.metadata?.roleId) return null;

            return window.getRoleById(app.metadata.roleId);

        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets all teachable skills for a character
     * @param {string} characterId - Character ID
     * @param {number} minSkillLevel - Minimum skill level (default: 51)
     * @returns {Array} Array of teachable skills
     */
    function getTeachableSkills(characterId, minSkillLevel) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            minSkillLevel = minSkillLevel || 51;
            var character = window.getCharacterById(characterId);
            if (!character || !character.professions) return [];

            var teachable = [];
            for (var i = 0; i < character.professions.length; i++) {
                var prof = character.professions[i];
                var skillLevel = prof.skillLevel || 0;
                if (skillLevel >= minSkillLevel) {
                    var role = window.getRoleById(prof.id);
                    if (role) {
                        teachable.push({
                            role: role,
                            skillLevel: skillLevel,
                            skillTier: _getSkillLevelName(skillLevel),
                            specializations: prof.specs || []
                        });
                    }
                }
            }
            return teachable;

        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Finds potential masters for a role
     * @param {string} roleId - Role ID
     * @param {string} locationId - Location ID (optional)
     * @param {number} minSkillLevel - Minimum skill level (default: 51)
     * @returns {Array} Array of potential masters
     */
    function findPotentialMasters(roleId, locationId, minSkillLevel) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            minSkillLevel = minSkillLevel || 51;
            var allChars = window.getCharacters();
            var masters = [];

            for (var i = 0; i < allChars.length; i++) {
                var char = allChars[i];
                if (char.isDeceased) continue;

                var skillLevel = getSkillLevel(char.id, roleId);
                if (skillLevel < minSkillLevel) continue;

                if (locationId) {
                    var charLocation = window.getCurrentLocation(char);
                    var place = typeof window.getPlaceByDisplayName === 'function'
                        ? window.getPlaceByDisplayName(charLocation)
                        : null;
                    if (!place || place.id !== locationId) continue;
                }

                masters.push({
                    character: char,
                    skillLevel: skillLevel,
                    skillTier: _getSkillLevelName(skillLevel),
                    age: window.calculateAge(char.birthYear, false, null),
                    apprenticeCount: getApprentices(char.id, true).length,
                    canTeach: skillLevel >= 51,
                    rank: window.getActiveRankDisplay(char)
                });
            }

            masters.sort(function(a, b) {
                return b.skillLevel - a.skillLevel;
            });

            return masters;

        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Recommends masters for a character
     * @param {string} characterId - Character ID
     * @param {string} roleId - Role ID
     * @returns {Array} Array of recommended masters
     */
    function recommendMastersForCharacter(characterId, roleId) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            var character = window.getCharacterById(characterId);
            if (!character) return [];

            var allChars = window.getCharacters();
            var recommendations = [];

            for (var i = 0; i < allChars.length; i++) {
                var candidate = allChars[i];
                if (candidate.id === characterId) continue;
                if (candidate.isDeceased) continue;

                var skillLevel = getSkillLevel(candidate.id, roleId);
                if (skillLevel < 51) continue;

                var score = 0;
                score += skillLevel * 0.5;

                var charLocation = window.getCurrentLocation(character);
                var candLocation = window.getCurrentLocation(candidate);
                if (charLocation === candLocation) {
                    score += 20;
                }

                var existingApprentices = getApprentices(candidate.id, true).length;
                if (existingApprentices < 3) {
                    score += 10;
                }

                var age = window.calculateAge(candidate.birthYear, false, null);
                if (age >= 30 && age <= 60) {
                    score += 10;
                }

                recommendations.push({
                    master: candidate,
                    skillLevel: skillLevel,
                    skillTier: _getSkillLevelName(skillLevel),
                    sameLocation: charLocation === candLocation,
                    apprenticeCount: existingApprentices,
                    age: age,
                    score: Math.min(100, score)
                });
            }

            recommendations.sort(function(a, b) {
                return b.score - a.score;
            });

            return recommendations.slice(0, 10);

        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Checks if a character can teach a role
     * @param {string} characterId - Character ID
     * @param {string} roleId - Role ID
     * @param {number} minSkillLevel - Minimum skill level (default: 51)
     * @returns {boolean} True if can teach
     */
    function canTeach(characterId, roleId, minSkillLevel) {
        if (_processingQuery) {
            return false;
        }
        _processingQuery = true;

        try {
            minSkillLevel = minSkillLevel || 51;
            var skill = getSkillLevel(characterId, roleId);
            return skill >= minSkillLevel;

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.ApprenticeshipQueries = {
        getMaster: getMaster,
        getApprentices: getApprentices,
        isApprentice: isApprentice,
        isMaster: isMaster,
        getApprenticeship: getApprenticeship,
        getSkillLevel: getSkillLevel,
        getSkillLevelName: getSkillLevelName,
        getSkillModifier: getSkillModifier,
        getApprenticeshipStage: getApprenticeshipStage,
        getApprenticeshipProgress: getApprenticeshipProgress,
        getApprenticeshipRole: getApprenticeshipRole,
        getTeachableSkills: getTeachableSkills,
        findPotentialMasters: findPotentialMasters,
        recommendMastersForCharacter: recommendMastersForCharacter,
        canTeach: canTeach
    };

    // Legacy aliases
    window._getMaster = getMaster;
    window._getApprentices = getApprentices;
    window._isApprentice = isApprentice;
    window._isMaster = isMaster;
    window._getApprenticeship = getApprenticeship;
    window._getSkillLevel = getSkillLevel;
    window._getSkillLevelName = getSkillLevelName;
    window._getSkillModifier = getSkillModifier;
    window._getApprenticeshipStage = getApprenticeshipStage;
    window._getApprenticeshipProgress = getApprenticeshipProgress;
    window._getApprenticeshipRole = getApprenticeshipRole;
    window._getTeachableSkills = getTeachableSkills;
    window._findPotentialMasters = findPotentialMasters;
    window._recommendMastersForCharacter = recommendMastersForCharacter;
    window._canTeach = canTeach;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            getMaster: getMaster,
            getApprentices: getApprentices,
            isApprentice: isApprentice,
            isMaster: isMaster,
            getApprenticeship: getApprenticeship,
            getSkillLevel: getSkillLevel,
            getSkillLevelName: getSkillLevelName,
            getSkillModifier: getSkillModifier,
            getApprenticeshipStage: getApprenticeshipStage,
            getApprenticeshipProgress: getApprenticeshipProgress,
            getApprenticeshipRole: getApprenticeshipRole,
            getTeachableSkills: getTeachableSkills,
            findPotentialMasters: findPotentialMasters,
            recommendMastersForCharacter: recommendMastersForCharacter,
            canTeach: canTeach
        };
    }

})();