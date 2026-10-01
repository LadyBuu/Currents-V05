/**
 * =============================================================================
 * STILL WATERS - ROLE CONSTANTS (role-constants.js)
 * =============================================================================
 *
 * Pure vocabulary and tunable rules for the role domain.
 *
 * This file:
 *   - declares the category vocabulary
 *   - declares salary policy
 *   - declares literacy vocabulary
 *   - declares teaching-eligibility wrappers (delegating to SkillUtils)
 *   - validates its own internal consistency at load time
 *
 * This file does NOT:
 *   - contain icons or any presentation data
 *   - contain UI state
 *   - contain behaviour, calculations, or storage
 *   - depend on any other module except SkillUtils (for teaching thresholds)
 *
 * DEPENDENCIES:
 *   - skill-utils.js   (SkillUtils) — for canonical teaching thresholds
 *
 * LOAD ORDER:
 *   skill-utils.js MUST be loaded before this file.
 *   If it is not, this module throws immediately. Silent fallback is not
 *   permitted: two authorities for one vocabulary is how the last six
 *   refactors were born.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HARD DEPENDENCY CHECK
    // =========================================================================

    if (!window.SkillUtils || typeof window.SkillUtils.getThresholds !== 'function') {
        throw new Error(
            'role-constants.js requires skill-utils.js to be loaded first.'
        );
    }

    // =========================================================================
    // 2. CATEGORY VOCABULARY
    // =========================================================================
    //
    // This is the ONLY canonical list of role categories.
    // Any other representation (salary map, UI dropdown, test fixtures) MUST
    // be derived from or validated against this object.
    //
    // Categories carry NO presentation data. Icons, colours, and labels for
    // display belong in the UI layer.

    var UNCATEGORIZED_ID = 'uncategorized';
    var UNCATEGORIZED_NAME = 'Uncategorized';

    var DEFAULT_ROLE_CATEGORIES = Object.freeze({
        combat:      Object.freeze({ id: 'combat',      name: 'Combat & Military' }),
        craft:       Object.freeze({ id: 'craft',       name: 'Craftsmanship' }),
        trade:       Object.freeze({ id: 'trade',       name: 'Trade & Commerce' }),
        agriculture: Object.freeze({ id: 'agriculture', name: 'Agriculture & Fishing' }),
        academic:    Object.freeze({ id: 'academic',    name: 'Academic & Scholar' }),
        medical:     Object.freeze({ id: 'medical',     name: 'Medical & Healing' }),
        religious:   Object.freeze({ id: 'religious',   name: 'Religious' }),
        admin:       Object.freeze({ id: 'admin',       name: 'Administration' }),
        service:     Object.freeze({ id: 'service',     name: 'Service' }),
        art:         Object.freeze({ id: 'art',         name: 'Artistic' }),
        government:  Object.freeze({ id: 'government',  name: 'Government & Public Service' }),
        household:   Object.freeze({ id: 'household',   name: 'Household & Domestic Service' }),
        industrial:  Object.freeze({ id: 'industrial',  name: 'Industry & Manufacturing' }),
        other:       Object.freeze({ id: 'other',       name: 'Other' })
    });

    // =========================================================================
    // 3. SALARY POLICY
    // =========================================================================
    //
    // Salary is a policy concern, not a category concern, so it lives in its
    // own map. The keys of this map are validated against
    // DEFAULT_ROLE_CATEGORIES below, so the two cannot drift apart silently.

    var BASE_SALARY_BY_CATEGORY = Object.freeze({
        combat:      20,
        craft:       12,
        trade:       15,
        agriculture:  8,
        academic:    18,
        medical:     16,
        religious:   10,
        admin:       18,
        service:     10,
        art:         12,
        government:  22,
        household:    8,
        industrial:  14,
        other:       10
    });

    var DEFAULT_SALARY = 10;
    var MIN_SALARY = 0;
    var MAX_SALARY = 200;

    var SALARY_SKILL_MULTIPLIER_MIN = 0.5;
    var SALARY_SKILL_MULTIPLIER_MAX = 1.0;

    var SALARY_EXPERIENCE_BONUS_PER_YEAR = 0.5;
    var SALARY_EXPERIENCE_BONUS_CAP = 15;
    var SALARY_EXPERIENCE_YEARS_CAP = 30;

    var SALARY_URBAN_MODIFIER = 1.3;
    var SALARY_RURAL_MODIFIER = 0.9;

    // =========================================================================
    // 4. LITERACY VOCABULARY
    // =========================================================================
    //
    // LITERACY_LEVELS is a closed set of strings. 'none' is a real value, not
    // null. Whether a role *requires* literacy is a separate boolean on the
    // role record (requiresLiteracy). Do not conflate the two:
    //
    //     requiresLiteracy: false           → role has no literacy requirement
    //     requiresLiteracy: true,
    //         literacyLevel: 'basic'        → role requires basic literacy
    //
    // literacyLevel MUST be null when requiresLiteracy is false.

    var LITERACY_LEVELS = Object.freeze({
        NONE:     'none',
        BASIC:    'basic',
        LITERATE: 'literate',
        EDUCATED: 'educated',
        SCHOLAR:  'scholar'
    });

    var LITERACY_LEVEL_NAMES = Object.freeze({
        'none':     'None',
        'basic':    'Basic Literacy',
        'literate': 'Literate',
        'educated': 'Educated',
        'scholar':  'Scholar'
    });

    // Character literacy score thresholds corresponding to each required level.
    var LITERACY_LEVEL_THRESHOLDS = Object.freeze({
        'none':     0,
        'basic':    30,
        'literate': 60,
        'educated': 80,
        'scholar':  95
    });

    // The set of levels that may appear as a *requirement*.
    // 'none' is deliberately excluded: a role either has no requirement
    // (requiresLiteracy = false) or requires one of the four real levels.
    var REQUIRABLE_LITERACY_LEVELS = Object.freeze([
        LITERACY_LEVELS.BASIC,
        LITERACY_LEVELS.LITERATE,
        LITERACY_LEVELS.EDUCATED,
        LITERACY_LEVELS.SCHOLAR
    ]);

    // =========================================================================
    // 5. TEACHING THRESHOLDS (delegated to SkillUtils)
    // =========================================================================
    //
    // SkillUtils is the sole authority. This constant is exported here purely
    // as a convenience for role-domain consumers so they have one import site
    // for everything role-related. The values are read from SkillUtils, not
    // re-declared.

    var TEACHING_THRESHOLDS = Object.freeze({
        NOVICE:     window.SkillUtils.getThresholds().NOVICE,
        APPRENTICE: window.SkillUtils.getThresholds().APPRENTICE,
        JOURNEYMAN: window.SkillUtils.getThresholds().JOURNEYMAN,
        EXPERT:     window.SkillUtils.getThresholds().EXPERT,
        MASTER:     window.SkillUtils.getThresholds().MASTER
    });

    // =========================================================================
    // 6. INTERNAL CONSISTENCY VALIDATION
    // =========================================================================
    //
    // The category vocabulary and the salary map describe the same set of
    // keys. If somebody adds a category and forgets to add its salary, or
    // vice versa, the application fails immediately at load time instead of
    // producing mysterious role behaviour later.

    (function _validateConsistency() {
        var categoryKeys = Object.keys(DEFAULT_ROLE_CATEGORIES);
        var salaryKeys = Object.keys(BASE_SALARY_BY_CATEGORY);

        var missingSalary = [];
        for (var i = 0; i < categoryKeys.length; i++) {
            if (!Object.prototype.hasOwnProperty.call(BASE_SALARY_BY_CATEGORY, categoryKeys[i])) {
                missingSalary.push(categoryKeys[i]);
            }
        }

        var orphanSalary = [];
        for (var j = 0; j < salaryKeys.length; j++) {
            if (!Object.prototype.hasOwnProperty.call(DEFAULT_ROLE_CATEGORIES, salaryKeys[j])) {
                orphanSalary.push(salaryKeys[j]);
            }
        }

        if (missingSalary.length > 0) {
            throw new Error(
                'role-constants.js: BASE_SALARY_BY_CATEGORY is missing entries for categories: ' +
                missingSalary.join(', ')
            );
        }

        if (orphanSalary.length > 0) {
            throw new Error(
                'role-constants.js: BASE_SALARY_BY_CATEGORY defines salary for categories that do not exist: ' +
                orphanSalary.join(', ')
            );
        }

        if (MIN_SALARY > DEFAULT_SALARY || DEFAULT_SALARY > MAX_SALARY) {
            throw new Error(
                'role-constants.js: salary bounds are inconsistent ' +
                '(MIN=' + MIN_SALARY + ', DEFAULT=' + DEFAULT_SALARY + ', MAX=' + MAX_SALARY + ')'
            );
        }

        if (SALARY_SKILL_MULTIPLIER_MIN > SALARY_SKILL_MULTIPLIER_MAX) {
            throw new Error(
                'role-constants.js: SALARY_SKILL_MULTIPLIER_MIN exceeds SALARY_SKILL_MULTIPLIER_MAX'
            );
        }
    })();

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.RoleConstants = {
        // Categories
        UNCATEGORIZED_ID: UNCATEGORIZED_ID,
        UNCATEGORIZED_NAME: UNCATEGORIZED_NAME,
        DEFAULT_ROLE_CATEGORIES: DEFAULT_ROLE_CATEGORIES,

        // Salary
        BASE_SALARY_BY_CATEGORY: BASE_SALARY_BY_CATEGORY,
        DEFAULT_SALARY: DEFAULT_SALARY,
        MIN_SALARY: MIN_SALARY,
        MAX_SALARY: MAX_SALARY,
        SALARY_SKILL_MULTIPLIER_MIN: SALARY_SKILL_MULTIPLIER_MIN,
        SALARY_SKILL_MULTIPLIER_MAX: SALARY_SKILL_MULTIPLIER_MAX,
        SALARY_EXPERIENCE_BONUS_PER_YEAR: SALARY_EXPERIENCE_BONUS_PER_YEAR,
        SALARY_EXPERIENCE_BONUS_CAP: SALARY_EXPERIENCE_BONUS_CAP,
        SALARY_EXPERIENCE_YEARS_CAP: SALARY_EXPERIENCE_YEARS_CAP,
        SALARY_URBAN_MODIFIER: SALARY_URBAN_MODIFIER,
        SALARY_RURAL_MODIFIER: SALARY_RURAL_MODIFIER,

        // Literacy
        LITERACY_LEVELS: LITERACY_LEVELS,
        LITERACY_LEVEL_NAMES: LITERACY_LEVEL_NAMES,
        LITERACY_LEVEL_THRESHOLDS: LITERACY_LEVEL_THRESHOLDS,
        REQUIRABLE_LITERACY_LEVELS: REQUIRABLE_LITERACY_LEVELS,

        // Teaching (mirrors SkillUtils, exported here for role-domain convenience)
        TEACHING_THRESHOLDS: TEACHING_THRESHOLDS
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.RoleConstants;
    }
})();
