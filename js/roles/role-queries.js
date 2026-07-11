/**
 * =============================================================================
 * STILL WATERS - ROLE QUERIES (role-queries.js)
 * =============================================================================
 * 
 * This file contains ALL read operations for roles.
 * - NO side effects
 * - NO UI
 * 
 * DEPENDENCIES:
 *   - role-state.js (RoleState)
 *   - role-constants.js (TEACHING_THRESHOLDS)
 *   - accessors.js (getCharacterById, getCharacters, getRoleById)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARDS
    // =========================================================================

    var _processingQuery = false;

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

    function _getSkillLevel(characterId, roleId) {
        if (typeof window.ApprenticeshipQueries !== 'undefined') {
            return window.ApprenticeshipQueries.getSkillLevel(characterId, roleId);
        }
        if (typeof window.getSkillLevel === 'function') {
            return window.getSkillLevel(characterId, roleId);
        }
        return 0;
    }

    function _getSkillLevelName(level) {
        if (typeof window.ApprenticeshipQueries !== 'undefined') {
            return window.ApprenticeshipQueries.getSkillLevelName(level);
        }
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

    function _getTeachingThresholds() {
        return window.TEACHING_THRESHOLDS || {
            NOVICE: 0,
            APPRENTICE: 26,
            JOURNEYMAN: 51,
            EXPERT: 76,
            MASTER: 91
        };
    }

    // =========================================================================
    // 3. ROLE QUERIES
    // =========================================================================

    /**
     * Gets all roles with optional filtering
     * @param {Object} filters - Optional filters
     * @param {string} filters.category - Category filter
     * @param {string} filters.gender - 'male', 'female', 'both'
     * @param {string} filters.search - Search term
     * @returns {Array} Array of role objects
     */
    function getRoles(filters) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            filters = filters || {};
            var roles = RoleState.getAllRoles();
            var result = roles.slice();

            if (filters.category && filters.category !== 'all') {
                result = result.filter(function(r) {
                    return r.category === filters.category;
                });
            }

            if (filters.gender && filters.gender !== 'all') {
                result = result.filter(function(r) {
                    return r.genderRestriction === 'both' || r.genderRestriction === filters.gender;
                });
            }

            if (filters.search && typeof filters.search === 'string' && filters.search.trim()) {
                var searchLower = filters.search.toLowerCase().trim();
                result = result.filter(function(r) {
                    return r.name.toLowerCase().indexOf(searchLower) !== -1 ||
                        (r.notes && r.notes.toLowerCase().indexOf(searchLower) !== -1);
                });
            }

            result.sort(function(a, b) {
                return a.name.localeCompare(b.name);
            });

            return result;

        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets characters with a specific role, including skill details
     * @param {string} roleId - Role ID
     * @param {boolean} mastersOnly - Only return characters with skill level 76+
     * @returns {Array} Characters with skill info
     */
    function getCharactersWithRoleDetails(roleId, mastersOnly) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            var role = RoleState.getRole(roleId);
            if (!role) return [];

            var characters = _getCharacters();
            var results = [];
            var thresholds = _getTeachingThresholds();

            for (var i = 0; i < characters.length; i++) {
                var char = characters[i];
                var profession = null;
                if (char.professions) {
                    for (var j = 0; j < char.professions.length; j++) {
                        if (char.professions[j].id === roleId) {
                            profession = char.professions[j];
                            break;
                        }
                    }
                }

                if (profession) {
                    var skillLevel = profession.skillLevel || 0;
                    if (mastersOnly && skillLevel < thresholds.EXPERT) continue;

                    results.push({
                        character: char,
                        profession: profession,
                        skillLevel: skillLevel,
                        skillTier: _getSkillLevelName(skillLevel),
                        specializations: profession.specs || [],
                        isPrimary: profession.primary === true,
                        isMaster: skillLevel >= thresholds.MASTER,
                        isExpert: skillLevel >= thresholds.EXPERT,
                        isJourneyman: skillLevel >= thresholds.JOURNEYMAN,
                        canTeach: skillLevel >= thresholds.JOURNEYMAN
                    });
                }
            }

            results.sort(function(a, b) {
                return b.skillLevel - a.skillLevel;
            });

            return results;

        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets characters with a specific role (just the character objects)
     * @param {string} roleId - Role ID
     * @param {boolean} mastersOnly - Only return characters with skill level 76+
     * @returns {Array} Character objects
     */
    function getCharactersWithRole(roleId, mastersOnly) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            var results = getCharactersWithRoleDetails(roleId, mastersOnly);
            return results.map(function(r) { return r.character; });

        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets comprehensive statistics for a role
     * @param {string} roleId - Role ID
     * @returns {Object} Statistics object
     */
    function getRoleStatistics(roleId) {
        if (_processingQuery) {
            return { totalCharacters: 0, averageSkill: 0, masterCount: 0, expertCount: 0,
                     journeymanCount: 0, apprenticeCount: 0, noviceCount: 0,
                     canTeachCount: 0, specializations: [], totalSpecializations: 0 };
        }
        _processingQuery = true;

        try {
            var role = RoleState.getRole(roleId);
            if (!role) {
                return { totalCharacters: 0, averageSkill: 0, masterCount: 0, expertCount: 0,
                         journeymanCount: 0, apprenticeCount: 0, noviceCount: 0,
                         canTeachCount: 0, specializations: [], totalSpecializations: 0 };
            }

            var charactersWithRole = getCharactersWithRoleDetails(roleId);
            var totalCount = charactersWithRole.length;
            var totalSkill = 0;
            var masterCount = 0;
            var expertCount = 0;
            var journeymanCount = 0;
            var apprenticeCount = 0;
            var noviceCount = 0;
            var thresholds = _getTeachingThresholds();

            for (var i = 0; i < charactersWithRole.length; i++) {
                var c = charactersWithRole[i];
                totalSkill += c.skillLevel;

                if (c.skillLevel >= thresholds.MASTER) masterCount++;
                else if (c.skillLevel >= thresholds.EXPERT) expertCount++;
                else if (c.skillLevel >= thresholds.JOURNEYMAN) journeymanCount++;
                else if (c.skillLevel >= thresholds.APPRENTICE) apprenticeCount++;
                else if (c.skillLevel >= thresholds.NOVICE) noviceCount++;
            }

            var canTeachCount = charactersWithRole.filter(function(c) {
                return c.skillLevel >= thresholds.JOURNEYMAN;
            }).length;

            var specializations = role.specializations || [];

            return {
                totalCharacters: totalCount,
                averageSkill: totalCount > 0 ? Math.round(totalSkill / totalCount) : 0,
                masterCount: masterCount,
                expertCount: expertCount,
                journeymanCount: journeymanCount,
                apprenticeCount: apprenticeCount,
                noviceCount: noviceCount,
                canTeachCount: canTeachCount,
                specializations: specializations,
                totalSpecializations: specializations.length
            };

        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets role categories
     * @returns {Object} Categories object
     */
    function getRoleCategories() {
        if (_processingQuery) {
            return {};
        }
        _processingQuery = true;

        try {
            return RoleState.getCategories();

        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets all role categories as an array
     * @returns {Array} Array of category objects
     */
    function getRoleCategoryList() {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            var categories = RoleState.getCategories();
            var result = [];
            for (var key in categories) {
                if (categories.hasOwnProperty(key)) {
                    result.push(categories[key]);
                }
            }
            result.sort(function(a, b) {
                return a.name.localeCompare(b.name);
            });
            return result;

        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Searches roles by name
     * @param {string} searchTerm - Search term
     * @param {Object} options - Options
     * @param {string} options.category - Category filter
     * @param {string} options.gender - Gender filter
     * @param {number} options.limit - Max results
     * @returns {Array} Array of matching roles
     */
    function searchRoles(searchTerm, options) {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            options = options || {};
            var roles = RoleState.getAllRoles();
            var result = roles.slice();

            if (searchTerm && typeof searchTerm === 'string' && searchTerm.trim()) {
                var searchLower = searchTerm.toLowerCase().trim();
                result = result.filter(function(r) {
                    return r.name.toLowerCase().indexOf(searchLower) !== -1;
                });
            }

            if (options.category && options.category !== 'all') {
                result = result.filter(function(r) {
                    return r.category === options.category;
                });
            }

            if (options.gender && options.gender !== 'all') {
                result = result.filter(function(r) {
                    return r.genderRestriction === 'both' || r.genderRestriction === options.gender;
                });
            }

            result.sort(function(a, b) {
                return a.name.localeCompare(b.name);
            });

            if (options.limit && options.limit > 0) {
                result = result.slice(0, options.limit);
            }

            return result;

        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets all available categories with role counts
     * @returns {Array} Array of category objects with counts
     */
    function getRoleCategoriesWithCounts() {
        if (_processingQuery) {
            return [];
        }
        _processingQuery = true;

        try {
            var categories = getRoleCategoryList();
            var roles = RoleState.getAllRoles();
            var result = [];

            for (var i = 0; i < categories.length; i++) {
                var cat = categories[i];
                var count = 0;
                for (var j = 0; j < roles.length; j++) {
                    if (roles[j].category === cat.id) {
                        count++;
                    }
                }
                result.push({
                    id: cat.id,
                    name: cat.name,
                    icon: cat.icon || '⌇',
                    count: count
                });
            }

            result.sort(function(a, b) {
                return b.count - a.count || a.name.localeCompare(b.name);
            });

            return result;

        } finally {
            _processingQuery = false;
        }
    }

    /**
     * Gets the teaching threshold level name
     * @param {number} level - Skill level
     * @returns {string} Threshold name
     */
    function getTeachingThresholdName(level) {
        if (_processingQuery) {
            return 'Novice';
        }
        _processingQuery = true;

        try {
            var thresholds = _getTeachingThresholds();
            if (level >= thresholds.MASTER) return 'Master';
            if (level >= thresholds.EXPERT) return 'Expert';
            if (level >= thresholds.JOURNEYMAN) return 'Journeyman';
            if (level >= thresholds.APPRENTICE) return 'Apprentice';
            return 'Novice';

        } finally {
            _processingQuery = false;
        }
    }

    // =========================================================================
    // 4. EXPORTS
    // =========================================================================

    window.RoleQueries = {
        getRoles: getRoles,
        getCharactersWithRoleDetails: getCharactersWithRoleDetails,
        getCharactersWithRole: getCharactersWithRole,
        getRoleStatistics: getRoleStatistics,
        getRoleCategories: getRoleCategories,
        getRoleCategoryList: getRoleCategoryList,
        searchRoles: searchRoles,
        getRoleCategoriesWithCounts: getRoleCategoriesWithCounts,
        getTeachingThresholdName: getTeachingThresholdName
    };

    // Legacy aliases
    window._getRoles = getRoles;
    window._getCharactersWithRole = getCharactersWithRole;
    window._getCharactersWithRoleDetails = getCharactersWithRoleDetails;
    window._getRoleStatistics = getRoleStatistics;
    window._getRoleCategories = getRoleCategories;
    window._getRoleCategoryList = getRoleCategoryList;
    window._searchRoles = searchRoles;
    window._getRoleCategoriesWithCounts = getRoleCategoriesWithCounts;
    window._getTeachingThresholdName = getTeachingThresholdName;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            getRoles: getRoles,
            getCharactersWithRoleDetails: getCharactersWithRoleDetails,
            getCharactersWithRole: getCharactersWithRole,
            getRoleStatistics: getRoleStatistics,
            getRoleCategories: getRoleCategories,
            getRoleCategoryList: getRoleCategoryList,
            searchRoles: searchRoles,
            getRoleCategoriesWithCounts: getRoleCategoriesWithCounts,
            getTeachingThresholdName: getTeachingThresholdName
        };
    }

})();