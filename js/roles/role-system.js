/**
 * =============================================================================
 * STILL WATERS - ROLE SYSTEM COMPATIBILITY SHIM (role-system.js)
 * =============================================================================
 *
 * LOCATION: js/systems/roles/role-system.js
 *
 * Purpose: expose the pre-refactor global API as one-way aliases onto the
 * canonical modules, for the remaining callers that have not yet been
 * migrated.
 *
 * This file:
 *   - declares NO constants
 *   - provides NO fallback implementations
 *   - returns NO fake empty data
 *   - contains NO business logic
 *   - defines NO domain behaviour
 *
 * If a canonical module is missing, this file throws. Silent degradation is
 * not a compatibility feature; it is how the previous architecture survived
 * six refactors.
 *
 * Migration policy:
 *   Every alias below is one-way. New code must call RoleConstants,
 *   RoleState, RoleQueries, RoleCommands, SkillUtils directly. The aliases
 *   exist so existing call sites keep working during the transition. Each
 *   alias should be removed once no caller references it.
 *
 *   To find remaining consumers:  grep -rn "window\.getRoles\b" js/
 *   (repeat for each alias; delete the alias when the count reaches zero.)
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HARD DEPENDENCY CHECK
    // =========================================================================

    var REQUIRED = [
        ['RoleConstants', 'role-constants.js'],
        ['RoleState',     'role-state.js'],
        ['RoleQueries',   'role-queries.js'],
        ['RoleCommands',  'role-commands.js'],
        ['SkillUtils',    'skill-utils.js']
    ];
    var missing = [];
    for (var i = 0; i < REQUIRED.length; i++) {
        if (typeof window[REQUIRED[i][0]] === 'undefined') {
            missing.push(REQUIRED[i][0] + ' (' + REQUIRED[i][1] + ')');
        }
    }
    if (missing.length > 0) {
        throw new Error(
            'role-system.js cannot install legacy aliases. Missing canonical modules: ' +
            missing.join(', ')
        );
    }

    var RC = window.RoleConstants;
    var RS = window.RoleState;
    var RQ = window.RoleQueries;
    var RCMD = window.RoleCommands;
    var SU = window.SkillUtils;

    // =========================================================================
    // 2. CONSTANTS (aliases onto RoleConstants)
    // =========================================================================

    window.UNCATEGORIZED_ID   = RC.UNCATEGORIZED_ID;
    window.UNCATEGORIZED_NAME = RC.UNCATEGORIZED_NAME;
    window.TEACHING_THRESHOLDS = RC.TEACHING_THRESHOLDS;
    window.DEFAULT_ROLE_CATEGORIES = RC.DEFAULT_ROLE_CATEGORIES;
    window.BASE_SALARY_BY_CATEGORY = RC.BASE_SALARY_BY_CATEGORY;
    window.DEFAULT_SALARY = RC.DEFAULT_SALARY;
    window.MIN_SALARY = RC.MIN_SALARY;
    window.MAX_SALARY = RC.MAX_SALARY;
    window.SALARY_SKILL_MULTIPLIER_MIN = RC.SALARY_SKILL_MULTIPLIER_MIN;
    window.SALARY_SKILL_MULTIPLIER_MAX = RC.SALARY_SKILL_MULTIPLIER_MAX;
    window.SALARY_EXPERIENCE_BONUS_PER_YEAR = RC.SALARY_EXPERIENCE_BONUS_PER_YEAR;
    window.SALARY_EXPERIENCE_BONUS_CAP = RC.SALARY_EXPERIENCE_BONUS_CAP;
    window.SALARY_EXPERIENCE_YEARS_CAP = RC.SALARY_EXPERIENCE_YEARS_CAP;
    window.SALARY_URBAN_MODIFIER = RC.SALARY_URBAN_MODIFIER;
    window.SALARY_RURAL_MODIFIER = RC.SALARY_RURAL_MODIFIER;
    window.LITERACY_LEVELS = RC.LITERACY_LEVELS;
    window.LITERACY_LEVEL_NAMES = RC.LITERACY_LEVEL_NAMES;
    window.LITERACY_LEVEL_THRESHOLDS = RC.LITERACY_LEVEL_THRESHOLDS;

    // Legacy name kept as an alias for the renamed constant.
    window.SALARY_EXPERIENCE_BONUS_MAX = RC.SALARY_EXPERIENCE_BONUS_CAP;
    window.SALARY_EXPERIENCE_CAP = RC.SALARY_EXPERIENCE_YEARS_CAP;

    // UNCATEGORIZED_ICON is deliberately NOT aliased. Icons are a UI concern
    // and are provided by icons.js. Any caller still reading this global
    // should be updated to resolve the icon through the icon system.

    // =========================================================================
    // 3. STATE ALIASES (read helpers onto RoleState)
    // =========================================================================

    window.subscribeRoles = function (callback) {
        return RS.subscribe(callback);
    };
    window.getAllRoles = function () {
        return RS.getAllRoles();
    };
    window.getRole = function (id) {
        return RS.getRole(id);
    };
    window.getRoleByName = function (name) {
        return RS.getRoleByName(name);
    };
    window.getRolesByCategory = function (categoryId) {
        return RS.getRolesByCategory(categoryId);
    };
    window.getRoleCategories = function () {
        return RS.getCategories();
    };

    // Legacy underscore-prefixed aliases used by older modules.
    window._getRoles = RS.getAllRoles;
    window._getRoleById = RS.getRole;
    window._getRoleCategories = RS.getCategories;

    // =========================================================================
    // 4. QUERY ALIASES (onto RoleQueries)
    // =========================================================================

    window.getRoles = RQ.getRoles;
    window.searchRoles = RQ.searchRoles;
    window.getCharactersWithRole = RQ.getCharactersWithRole;
    window.getCharactersWithRoleDetails = RQ.getCharactersWithRoleDetails;
    window.getRoleStatistics = RQ.getRoleStatistics;
    window.getRoleCategoryList = function () {
        // Legacy shape: array of category objects. Derived from the
        // canonical category-with-counts query so it stays consistent.
        return RQ.getRoleCategoriesWithCounts().map(function (c) {
            return { id: c.id, name: c.name };
        });
    };
    window.getRoleCategoriesWithCounts = RQ.getRoleCategoriesWithCounts;
    window.getTeachingThresholdName = function (level) {
        return SU.getTier(level).name;
    };
    window.getSkillLevel = RQ.getSkillLevel;

    window._getCharactersWithRole = RQ.getCharactersWithRole;
    window._getCharactersWithRoleDetails = RQ.getCharactersWithRoleDetails;
    window._getRoleStatistics = RQ.getRoleStatistics;
    window._getRoleCategoryList = window.getRoleCategoryList;
    window._getRoleCategoriesWithCounts = RQ.getRoleCategoriesWithCounts;
    window._getTeachingThresholdName = window.getTeachingThresholdName;
    window._getSkillLevel = RQ.getSkillLevel;

    // =========================================================================
    // 5. COMMAND ALIASES (onto RoleCommands)
    // =========================================================================

    window.createRole = RCMD.createRole;
    window.updateRole = RCMD.updateRole;
    window.deleteRole = RCMD.deleteRole;
    window.setRoles = RCMD.setRoles;

    window.addCategory = RCMD.addCategory;
    window.updateCategory = RCMD.updateCategory;
    window.deleteCategory = RCMD.deleteCategory;

    window.assignRoleToCharacter = RCMD.assignRoleToCharacter;
    window.removeRoleFromCharacter = RCMD.removeRoleFromCharacter;
    window.updateCharacterSkill = RCMD.updateCharacterSkill;
    window.bulkAssignRole = RCMD.bulkAssignRole;

    window.updateRoleSalary = RCMD.updateRoleSalary;
    window.updateRoleLiteracyRequirement = RCMD.updateRoleLiteracyRequirement;

    window.getRoleSpecializations = RQ.getRoleSpecializations;
    window.getAllRoleSpecializations = RQ.getAllRoleSpecializations;
    window.addRoleSpecialization = RCMD.addRoleSpecialization;
    window.removeRoleSpecialization = RCMD.removeRoleSpecialization;

    window._createRole = RCMD.createRole;
    window._updateRole = RCMD.updateRole;
    window._deleteRole = RCMD.deleteRole;
    window._setRoles = RCMD.setRoles;
    window._addCategory = RCMD.addCategory;
    window._updateCategory = RCMD.updateCategory;
    window._deleteCategory = RCMD.deleteCategory;
    window._assignRoleToCharacter = RCMD.assignRoleToCharacter;
    window._removeRoleFromCharacter = RCMD.removeRoleFromCharacter;
    window._updateCharacterSkill = RCMD.updateCharacterSkill;
    window._bulkAssignRole = RCMD.bulkAssignRole;
    window._updateRoleSalary = RCMD.updateRoleSalary;
    window._updateRoleLiteracyRequirement = RCMD.updateRoleLiteracyRequirement;

    // NOTE: window._updateProfessionSkill is NOT aliased here. It has no
    // equivalent: profession skill updates go through CharacterCommands
    // directly, or through RoleCommands.updateCharacterSkill for the
    // role-scoped use case. Any caller still using the old global should
    // migrate to one of those two.

    // =========================================================================
    // 6. DELETED ALIASES (intentionally not reinstated)
    // =========================================================================
    //
    // The following globals existed in the pre-refactor module and are
    // deliberately not provided. They either returned domain data that is
    // now computed elsewhere, or they leaked presentation into the domain.
    //
    //   UNCATEGORIZED_ICON              → resolve via Icons (UI layer)
    //   SUGGESTED_ROLES                 → removed; roles are user-created
    //   _updateProfessionSkill          → see CharacterCommands / RoleCommands
    //   _getRoleSpecializations (old)   → now RQ.getRoleSpecializations
    //   _getAllRoleSpecializations      → now RQ.getAllRoleSpecializations
    //   _addRoleSpecialization          → now RCMD.addRoleSpecialization
    //   _removeRoleSpecialization       → now RCMD.removeRoleSpecialization
    //
    // If any of these are still referenced by name, fix the caller rather
    // than reinstating the alias. Reinstating them would be how the previous
    // architecture survives the current refactor.

    // =========================================================================
    // 7. DIAGNOSTIC
    // =========================================================================

    if (window.console && typeof window.console.debug === 'function') {
        window.console.debug(
            'role-system.js: legacy aliases installed (compatibility shim). ' +
            'New code should use RoleConstants / RoleState / RoleQueries / ' +
            'RoleCommands / SkillUtils directly.'
        );
    }

    // =========================================================================
    // 8. COMMONJS EXPORT
    // =========================================================================

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            // Constants
            UNCATEGORIZED_ID: window.UNCATEGORIZED_ID,
            UNCATEGORIZED_NAME: window.UNCATEGORIZED_NAME,
            TEACHING_THRESHOLDS: window.TEACHING_THRESHOLDS,
            DEFAULT_ROLE_CATEGORIES: window.DEFAULT_ROLE_CATEGORIES,
            BASE_SALARY_BY_CATEGORY: window.BASE_SALARY_BY_CATEGORY,

            // State
            subscribeRoles: window.subscribeRoles,
            getAllRoles: window.getAllRoles,
            getRole: window.getRole,
            getRoleByName: window.getRoleByName,
            getRolesByCategory: window.getRolesByCategory,
            getRoleCategories: window.getRoleCategories,

            // Queries
            getRoles: window.getRoles,
            searchRoles: window.searchRoles,
            getCharactersWithRole: window.getCharactersWithRole,
            getCharactersWithRoleDetails: window.getCharactersWithRoleDetails,
            getRoleStatistics: window.getRoleStatistics,
            getRoleCategoriesWithCounts: window.getRoleCategoriesWithCounts,
            getTeachingThresholdName: window.getTeachingThresholdName,
            getSkillLevel: window.getSkillLevel,

            // Commands
            createRole: window.createRole,
            updateRole: window.updateRole,
            deleteRole: window.deleteRole,
            setRoles: window.setRoles,
            addCategory: window.addCategory,
            updateCategory: window.updateCategory,
            deleteCategory: window.deleteCategory,
            assignRoleToCharacter: window.assignRoleToCharacter,
            removeRoleFromCharacter: window.removeRoleFromCharacter,
            updateCharacterSkill: window.updateCharacterSkill,
            bulkAssignRole: window.bulkAssignRole,
            updateRoleSalary: window.updateRoleSalary,
            updateRoleLiteracyRequirement: window.updateRoleLiteracyRequirement,
            addRoleSpecialization: window.addRoleSpecialization,
            removeRoleSpecialization: window.removeRoleSpecialization
        };
    }
})();
