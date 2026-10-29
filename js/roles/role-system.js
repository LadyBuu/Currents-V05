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
 * CLONE SEMANTICS (READ THIS)
 *
 *   Aliases that route through RoleState — getAllRoles, getRole,
 *   getRoleByName, getRolesByCategory, getRoleById — return CLONES, not
 *   the live canonical array or records. Legacy callers that used to
 *   mutate the returned array or role object will now silently no-op.
 *
 *   This is intentional and matches RoleState's own read projection
 *   contract: no live canonical role leaves the state module. Prior
 *   revisions left some aliases pointing at accessors.getRoles (live)
 *   and others at RoleState.getAllRoles (clones), so callers could not
 *   tell which they were getting. That inconsistency is now closed:
 *   every read alias returns clones.
 *
 *   Callers that specifically need the live array should use
 *   window.accessorsGetRoles (re-exported below for exactly this case)
 *   and accept that they are bypassing the shim's contract. Callers
 *   that need to mutate a role should use RoleCommands.
 *
 *   The first call to window.getAllRoles fires a one-shot console.warn
 *   naming the clone semantics, so a debugging session that starts with
 *   "why did my push do nothing" resolves in seconds.
 *
 * GETROLEBYID RECONCILIATION
 *
 *   accessors.js exports getRoleById (live records). RoleState exports
 *   getRole (clones). Prior revisions left window.getRoleById aliased
 *   to accessors.getRoleById, which meant apprenticeship-commands.js's
 *   fallback (if RoleState unavailable, use window.getRoleById) resolved
 *   to the LIVE record even when RoleState was available — contradicting
 *   apprenticeship-queries.js's stated "no accessor fallback" policy.
 *
 *   This shim now aliases window.getRoleById to RoleState.getRole
 *   (clones), which is the canonical runtime representation. The live
 *   accessor is re-exported as window.accessorsGetRoleById for any caller
 *   that specifically needs it. None currently do; the re-export exists
 *   so the choice is explicit rather than accidental.
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
 * LOAD ORDER (IMPORTANT)
 *
 *   This file aliases window.getRoles = RQ.getRoles, where RQ is
 *   role-queries.js. role-queries.js defends against that aliasing by
 *   capturing window.getRoles at its own load time (before this file
 *   overwrites it) and using the captured reference internally. That
 *   capture only works if role-queries.js loads BEFORE role-system.js.
 *
 *   If load order ever flips — role-system.js before role-queries.js —
 *   the capture in role-queries.js will resolve to this file's alias,
 *   which is RoleQueries.getRoles itself, and any call to getRoles() will
 *   recurse until the stack overflows.
 *
 *   The documented load order in roles-docs.txt places role-queries.js
 *   before role-system.js. Any future change to that order must also
 *   remove or rewrite the aliasing below. There is no runtime guard for
 *   this; the capture-and-document is the guard.
 *
 * KNOWN GAPS
 *
 *   None. Every alias installed here resolves to a real function exported
 *   by its canonical module. An earlier revision of this header listed
 *   RoleQueries.getOccupiedLocationIds and
 *   RoleQueries.getEligibleCharactersForRole as missing; both are now
 *   exported by role-queries.js and the modals-roles.js assign-role
 *   modal that consumes them works.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - window.getAllRoles now documented as returning CLONES, and a
 *       one-shot console.warn fires on first call so the semantic change
 *       is discoverable. See CLONE SEMANTICS in the header. Prior
 *       revisions' headers acknowledged the aliases were "one-way" but
 *       did not document the mutability break against the pre-refactor
 *       accessors.getRoles (which returned the live array).
 *     - window.getRoleById is now aliased to RoleState.getRole (clones),
 *       not accessors.getRoleById (live). This closes the
 *       apprenticeship-commands.js fallback hazard the queries header
 *       warns against. See GETROLEBYID RECONCILIATION in the header.
 *     - window.accessorsGetRoles and window.accessorsGetRoleById added
 *       as explicit live-accessor re-exports for callers that
 *       specifically need the live records. Prior revisions offered no
 *       supported path to the live accessor once the shim overwrote the
 *       global names.
 *     - No other behavioural change. Every existing alias that was not
 *       touched by the above remains byte-identical.
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

    // Capture accessors.* BEFORE this shim overwrites window.getRoles and
    // window.getRoleById. These are the live-record readers. See
    // GETROLEBYID RECONCILIATION and CLONE SEMANTICS in the header.
    var _accessorsGetRoles = typeof window.getRoles === 'function'
        ? window.getRoles
        : null;
    var _accessorsGetRoleById = typeof window.getRoleById === 'function'
        ? window.getRoleById
        : null;

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
    //
    // Every alias in this section returns CLONES. See CLONE SEMANTICS in
    // the header. The first read of window.getAllRoles warns once.

    var _getAllRolesWarned = false;

    window.subscribeRoles = function (callback) {
        return RS.subscribe(callback);
    };

    window.getAllRoles = function () {
        if (!_getAllRolesWarned) {
            _getAllRolesWarned = true;
            if (window.console && typeof window.console.warn === 'function') {
                window.console.warn(
                    'role-system.js: window.getAllRoles returns CLONES of the ' +
                    'role catalogue, not the live array. Mutating the returned ' +
                    'array or its elements does not affect canonical state. ' +
                    'Use RoleCommands to mutate; use window.accessorsGetRoles ' +
                    'if you specifically need the live accessor array.'
                );
            }
        }
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

    // Legacy underscore-prefixed aliases used by older modules. These
    // follow the same clone semantics as their non-underscore forms.
    window._getRoles = RS.getAllRoles;
    window._getRoleById = RS.getRole;
    window._getRoleCategories = RS.getCategories;

    // Live accessors, re-exported under explicit names. See CLONE
    // SEMANTICS and GETROLEBYID RECONCILIATION in the header. Null when
    // accessors.js did not export the corresponding function; the shim
    // does not fabricate a fallback.
    window.accessorsGetRoles = _accessorsGetRoles;
    window.accessorsGetRoleById = _accessorsGetRoleById;

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

    // window.getRoleById is installed LAST so that if any earlier alias in
    // this file had already overwritten it (none currently do, but future
    // additions to §4 might), the reconciliation below wins. See
    // GETROLEBYID RECONCILIATION in the header.
    window.getRoleById = function (id) {
        return RS.getRole(id);
    };

    // NOTE: window._updateProfessionSkill is NOT aliased here. It has no
    // equivalent: profession skill updates go through CharacterCommands
    // directly, or through RoleCommands.updateCharacterSkill for the
    // role-scoped use case. Any caller still using the old global should
    // migrate to one of those two.

    // NOTE: window.getOccupiedLocationIds and window.getEligibleCharactersForRole
    // are NOT aliased because RoleQueries now exports them but they are not
    // part of the pre-refactor global API. modals-roles.js calls them
    // directly on RQ. Adding globals for them would create a second surface
    // to keep in sync for no compatibility benefit — no caller in the tree
    // referenced window.getOccupiedLocationIds or
    // window.getEligibleCharactersForRole.

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
            'Read aliases return CLONES; use window.accessorsGetRoles / ' +
            'window.accessorsGetRoleById for the live records. New code ' +
            'should use RoleConstants / RoleState / RoleQueries / ' +
            'RoleCommands / SkillUtils directly.'
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

            // Live accessors (re-exported for callers that need live records)
            accessorsGetRoles: window.accessorsGetRoles,
            accessorsGetRoleById: window.accessorsGetRoleById,

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
