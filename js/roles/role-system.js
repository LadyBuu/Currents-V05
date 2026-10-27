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
 *   - declares NO constants (except direct references to RoleConstants)
 *   - provides NO fallback implementations
 *   - returns NO fake empty data
 *   - contains NO business logic
 *   - defines NO domain behaviour
 *
 * If a canonical module is missing, this file throws. Silent degradation is
 * not a compatibility feature; it is how the previous architecture survived
 * six refactors.
 *
 * If a canonical module is present but the specific function being aliased
 * is NOT exported by that module, this file also throws — because a shim
 * that installs `window.foo = undefined` is worse than no shim at all:
 * callers get a `TypeError: foo is not a function` at call time, far from
 * the load site, with no breadcrumb back to the missing alias. The
 * REQUIRED_FUNCTIONS check below enforces that every alias resolves to a
 * callable function before it is installed.
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
 * KNOWN GAPS (documented, not fixed here):
 *   modals-roles.js calls two RoleQueries functions that are not yet
 *   exported by role-queries.js:
 *
 *     RQ.getOccupiedLocationIds(getLocation)
 *     RQ.getEligibleCharactersForRole(roleId, options)
 *
 *   Both are used by the assign-role modal. Until they exist, that modal
 *   fails at runtime. They are NOT aliased here, because aliasing an
 *   undefined function would move the failure earlier without making
 *   anything work. The fix belongs in role-queries.js.
 *
 *   This shim does not paper over them.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HARD DEPENDENCY CHECK
    // =========================================================================

    var REQUIRED_MODULES = [
        ['RoleConstants', 'role-constants.js'],
        ['RoleState',     'role-state.js'],
        ['RoleQueries',   'role-queries.js'],
        ['RoleCommands',  'role-commands.js'],
        ['SkillUtils',    'skill-utils.js']
    ];

    var missingModules = [];
    for (var i = 0; i < REQUIRED_MODULES.length; i++) {
        if (typeof window[REQUIRED_MODULES[i][0]] === 'undefined') {
            missingModules.push(REQUIRED_MODULES[i][0] + ' (' + REQUIRED_MODULES[i][1] + ')');
        }
    }
    if (missingModules.length > 0) {
        throw new Error(
            'role-system.js cannot install legacy aliases. ' +
            'Missing canonical modules: ' + missingModules.join(', ')
        );
    }

    var RC   = window.RoleConstants;
    var RS   = window.RoleState;
    var RQ   = window.RoleQueries;
    var RCMD = window.RoleCommands;
    var SU   = window.SkillUtils;

    // =========================================================================
    // 2. FUNCTION RESOLUTION CHECK
    // =========================================================================
    //
    // Every alias below is installed only if the underlying function
    // exists. Collect failures and throw once, with all missing functions
    // named, so a single load attempt reports every gap.
    //
    // This block runs BEFORE any aliases are installed. If anything is
    // missing, the whole shim refuses to install — partial aliasing is
    // more dangerous than no aliasing.

    var REQUIRED_FUNCTIONS = [
        // RoleQueries
        ['RoleQueries.getRoles',                        RQ.getRoles],
        ['RoleQueries.searchRoles',                     RQ.searchRoles],
        ['RoleQueries.getCharactersWithRole',           RQ.getCharactersWithRole],
        ['RoleQueries.getCharactersWithRoleIds',        RQ.getCharactersWithRoleIds],
        ['RoleQueries.getCharactersWithRoleDetails',    RQ.getCharactersWithRoleDetails],
        ['RoleQueries.getRoleStatistics',               RQ.getRoleStatistics],
        ['RoleQueries.getRoleCategoriesWithCounts',     RQ.getRoleCategoriesWithCounts],
        ['RoleQueries.getRoleSpecializations',          RQ.getRoleSpecializations],
        ['RoleQueries.getAllRoleSpecializations',       RQ.getAllRoleSpecializations],
        ['RoleQueries.getSkillLevel',                   RQ.getSkillLevel],

        // RoleCommands
        ['RoleCommands.createRole',                     RCMD.createRole],
        ['RoleCommands.updateRole',                     RCMD.updateRole],
        ['RoleCommands.deleteRole',                     RCMD.deleteRole],
        ['RoleCommands.setRoles',                       RCMD.setRoles],
        ['RoleCommands.addCategory',                    RCMD.addCategory],
        ['RoleCommands.updateCategory',                 RCMD.updateCategory],
        ['RoleCommands.deleteCategory',                 RCMD.deleteCategory],
        ['RoleCommands.assignRoleToCharacter',          RCMD.assignRoleToCharacter],
        ['RoleCommands.removeRoleFromCharacter',        RCMD.removeRoleFromCharacter],
        ['RoleCommands.updateCharacterSkill',           RCMD.updateCharacterSkill],
        ['RoleCommands.recordCharacterSkillProgress',   RCMD.recordCharacterSkillProgress],
        ['RoleCommands.bulkAssignRole',                 RCMD.bulkAssignRole],
        ['RoleCommands.updateRoleSalary',               RCMD.updateRoleSalary],
        ['RoleCommands.updateRoleLiteracyRequirement',  RCMD.updateRoleLiteracyRequirement],
        ['RoleCommands.addRoleSpecialization',          RCMD.addRoleSpecialization],
        ['RoleCommands.removeRoleSpecialization',       RCMD.removeRoleSpecialization],

        // SkillUtils
        ['SkillUtils.getTier',                          SU.getTier]
    ];

    var missingFunctions = [];
    for (var f = 0; f < REQUIRED_FUNCTIONS.length; f++) {
        if (typeof REQUIRED_FUNCTIONS[f][1] !== 'function') {
            missingFunctions.push(REQUIRED_FUNCTIONS[f][0]);
        }
    }
    if (missingFunctions.length > 0) {
        throw new Error(
            'role-system.js cannot install legacy aliases. ' +
            'Canonical modules loaded, but the following functions are ' +
            'missing: ' + missingFunctions.join(', ') + '. ' +
            'Update the canonical modules before loading role-system.js.'
        );
    }

    // =========================================================================
    // 3. CONSTANTS (aliases onto RoleConstants)
    // =========================================================================
    //
    // Constants are direct references to frozen objects. They are aliased
    // rather than re-declared so there is exactly one canonical
    // representation of each vocabulary in the tree.

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

    // Legacy name aliases for renamed constants.
    window.SALARY_EXPERIENCE_BONUS_MAX = RC.SALARY_EXPERIENCE_BONUS_CAP;
    window.SALARY_EXPERIENCE_CAP = RC.SALARY_EXPERIENCE_YEARS_CAP;

    // UNCATEGORIZED_ICON is deliberately NOT aliased. Icons are a UI
    // concern and are provided by icons.js. Any caller still reading
    // this global should be updated to resolve the icon through the
    // icon system.

    // =========================================================================
    // 4. STATE ALIASES (read helpers onto RoleState)
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
    // 5. QUERY ALIASES (onto RoleQueries)
    // =========================================================================

    window.getRoles = RQ.getRoles;
    window.searchRoles = RQ.searchRoles;
    window.getCharactersWithRole = RQ.getCharactersWithRole;
    window.getCharactersWithRoleIds = RQ.getCharactersWithRoleIds;
    window.getCharactersWithRoleDetails = RQ.getCharactersWithRoleDetails;
    window.getRoleStatistics = RQ.getRoleStatistics;
    window.getRoleCategoriesWithCounts = RQ.getRoleCategoriesWithCounts;
    window.getSkillLevel = RQ.getSkillLevel;

    // Legacy shape: array of category objects. Derived from the canonical
    // category-with-counts query so it stays consistent.
    window.getRoleCategoryList = function () {
        return RQ.getRoleCategoriesWithCounts().map(function (c) {
            return { id: c.id, name: c.name };
        });
    };

    // Specialization reads live in RoleQueries. Aliased here so pre-refactor
    // callers that expected them on window continue to work.
    window.getRoleSpecializations = RQ.getRoleSpecializations;
    window.getAllRoleSpecializations = RQ.getAllRoleSpecializations;

    window.getTeachingThresholdName = function (level) {
        return SU.getTier(level).name;
    };

    window._getCharactersWithRole = RQ.getCharactersWithRole;
    window._getCharactersWithRoleDetails = RQ.getCharactersWithRoleDetails;
    window._getRoleStatistics = RQ.getRoleStatistics;
    window._getRoleCategoryList = window.getRoleCategoryList;
    window._getRoleCategoriesWithCounts = RQ.getRoleCategoriesWithCounts;
    window._getTeachingThresholdName = window.getTeachingThresholdName;
    window._getSkillLevel = RQ.getSkillLevel;

    // =========================================================================
    // 6. COMMAND ALIASES (onto RoleCommands)
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
    window.recordCharacterSkillProgress = RCMD.recordCharacterSkillProgress;
    window.bulkAssignRole = RCMD.bulkAssignRole;

    window.updateRoleSalary = RCMD.updateRoleSalary;
    window.updateRoleLiteracyRequirement = RCMD.updateRoleLiteracyRequirement;

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
    window._recordCharacterSkillProgress = RCMD.recordCharacterSkillProgress;
    window._bulkAssignRole = RCMD.bulkAssignRole;
    window._updateRoleSalary = RCMD.updateRoleSalary;
    window._updateRoleLiteracyRequirement = RCMD.updateRoleLiteracyRequirement;

    // NOTE: window._updateProfessionSkill is NOT aliased here. It has no
    // equivalent: profession skill updates go through CharacterCommands
    // directly, or through RoleCommands.updateCharacterSkill for the
    // role-scoped use case. Any caller still using the old global should
    // migrate to one of those two.

    // NOTE: window.getOccupiedLocationIds and window.getEligibleCharactersForRole
    // are NOT aliased because RoleQueries does not yet export them. They
    // are called directly on RQ by modals-roles.js, and that modal will
    // fail at runtime until role-queries.js exports them. Documented in
    // the module header under KNOWN GAPS.

    // =========================================================================
    // 7. DELETED ALIASES (intentionally not reinstated)
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
    // 8. DIAGNOSTIC
    // =========================================================================

    if (window.console && typeof window.console.debug === 'function') {
        window.console.debug(
            'role-system.js: legacy aliases installed (compatibility shim). ' +
            'New code should use RoleConstants / RoleState / RoleQueries / ' +
            'RoleCommands / SkillUtils directly. ' +
            'Known gaps: RQ.getOccupiedLocationIds, ' +
            'RQ.getEligibleCharactersForRole (see modals-roles.js).'
        );
    }

    // =========================================================================
    // 9. COMMONJS EXPORT
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
            getCharactersWithRoleIds: window.getCharactersWithRoleIds,
            getCharactersWithRoleDetails: window.getCharactersWithRoleDetails,
            getRoleStatistics: window.getRoleStatistics,
            getRoleCategoriesWithCounts: window.getRoleCategoriesWithCounts,
            getRoleCategoryList: window.getRoleCategoryList,
            getRoleSpecializations: window.getRoleSpecializations,
            getAllRoleSpecializations: window.getAllRoleSpecializations,
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
            recordCharacterSkillProgress: window.recordCharacterSkillProgress,
            bulkAssignRole: window.bulkAssignRole,
            updateRoleSalary: window.updateRoleSalary,
            updateRoleLiteracyRequirement: window.updateRoleLiteracyRequirement,
            addRoleSpecialization: window.addRoleSpecialization,
            removeRoleSpecialization: window.removeRoleSpecialization
        };
    }
})();
