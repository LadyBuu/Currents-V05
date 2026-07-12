/**
 * =============================================================================
 * STILL WATERS - ROLE CONSTANTS (role-constants.js)
 * =============================================================================
 * 
 * This file contains ALL role-related constants.
 * 
 * DEPENDENCIES: None (pure constants)
 * 
 * UPDATED: Added BASE_SALARY_BY_CATEGORY, DEFAULT_SALARY, salary constants,
 *          literacy requirement constants
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. UNCATEGORIZED CONSTANTS
    // =========================================================================

    var UNCATEGORIZED_ID = 'uncategorized';
    var UNCATEGORIZED_NAME = 'Uncategorized';
    var UNCATEGORIZED_ICON = '⌇';

    // =========================================================================
    // 2. TEACHING THRESHOLDS
    // =========================================================================

    var TEACHING_THRESHOLDS = {
        NOVICE: 0,
        APPRENTICE: 26,
        JOURNEYMAN: 51,
        EXPERT: 76,
        MASTER: 91
    };

    // =========================================================================
    // 3. DEFAULT ROLE CATEGORIES (Monochrome icons only)
    // =========================================================================

    var DEFAULT_ROLE_CATEGORIES = {
        combat: { id: 'combat', name: 'Combat & Military', icon: '⚔' },
        craft: { id: 'craft', name: 'Craftsmanship', icon: '⌇' },
        trade: { id: 'trade', name: 'Trade & Commerce', icon: '⌇' },
        agriculture: { id: 'agriculture', name: 'Agriculture & Fishing', icon: '⌇' },
        academic: { id: 'academic', name: 'Academic & Scholar', icon: '⌇' },
        medical: { id: 'medical', name: 'Medical & Healing', icon: '⌇' },
        religious: { id: 'religious', name: 'Religious', icon: '⌆' },
        admin: { id: 'admin', name: 'Administration', icon: '⌇' },
        service: { id: 'service', name: 'Service', icon: '⌇' },
        art: { id: 'art', name: 'Artistic', icon: '⌇' },
        government: { id: 'government', name: 'Government & Public Service', icon: '◉' },
        household: { id: 'household', name: 'Household & Domestic Service', icon: '⌂' }
    };

    // =========================================================================
    // 4. SALARY CONSTANTS (NEW)
    // =========================================================================

    var BASE_SALARY_BY_CATEGORY = {
        'combat': 20,
        'craft': 12,
        'trade': 15,
        'agriculture': 8,
        'academic': 18,
        'medical': 16,
        'religious': 10,
        'admin': 18,
        'service': 10,
        'art': 12,
        'government': 22,
        'household': 8,
        'uncategorized': 10
    };

    var DEFAULT_SALARY = 10;
    var MIN_SALARY = 0;
    var MAX_SALARY = 200;

    var SALARY_SKILL_MULTIPLIER_MIN = 0.5;
    var SALARY_SKILL_MULTIPLIER_MAX = 1.0;

    var SALARY_EXPERIENCE_BONUS_PER_YEAR = 0.5;
    var SALARY_EXPERIENCE_BONUS_MAX = 15;
    var SALARY_EXPERIENCE_CAP = 30;

    var SALARY_URBAN_MODIFIER = 1.3;
    var SALARY_RURAL_MODIFIER = 0.9;

    // =========================================================================
    // 5. LITERACY REQUIREMENT CONSTANTS (NEW)
    // =========================================================================

    var LITERACY_LEVELS = {
        NONE: null,
        BASIC: 'basic',
        LITERATE: 'literate',
        EDUCATED: 'educated',
        SCHOLAR: 'scholar'
    };

    var LITERACY_LEVEL_NAMES = {
        'basic': 'Basic Literacy',
        'literate': 'Literate',
        'educated': 'Educated',
        'scholar': 'Scholar'
    };

    var LITERACY_LEVEL_THRESHOLDS = {
        'basic': 30,
        'literate': 60,
        'educated': 80,
        'scholar': 95
    };

    // =========================================================================
    // 6. SUGGESTED ROLES
    // =========================================================================

    var SUGGESTED_ROLES = {
        government: [
            { name: 'Government Worker', icon: '◉', category: 'government', baseSalary: 22 },
            { name: 'Civil Servant', icon: '◉', category: 'government', baseSalary: 18 },
            { name: 'Diplomat', icon: '◉', category: 'government', baseSalary: 25 }
        ],
        household: [
            { name: 'Servant', icon: '⌂', category: 'household', baseSalary: 8 },
            { name: 'Domestic Worker', icon: '⌂', category: 'household', baseSalary: 8 },
            { name: 'Housekeeper', icon: '⌂', category: 'household', baseSalary: 10 }
        ]
    };

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.UNCATEGORIZED_ID = UNCATEGORIZED_ID;
    window.UNCATEGORIZED_NAME = UNCATEGORIZED_NAME;
    window.UNCATEGORIZED_ICON = UNCATEGORIZED_ICON;
    window.TEACHING_THRESHOLDS = TEACHING_THRESHOLDS;
    window.DEFAULT_ROLE_CATEGORIES = DEFAULT_ROLE_CATEGORIES;
    window.SUGGESTED_ROLES = SUGGESTED_ROLES;

    window.BASE_SALARY_BY_CATEGORY = BASE_SALARY_BY_CATEGORY;
    window.DEFAULT_SALARY = DEFAULT_SALARY;
    window.MIN_SALARY = MIN_SALARY;
    window.MAX_SALARY = MAX_SALARY;
    window.SALARY_SKILL_MULTIPLIER_MIN = SALARY_SKILL_MULTIPLIER_MIN;
    window.SALARY_SKILL_MULTIPLIER_MAX = SALARY_SKILL_MULTIPLIER_MAX;
    window.SALARY_EXPERIENCE_BONUS_PER_YEAR = SALARY_EXPERIENCE_BONUS_PER_YEAR;
    window.SALARY_EXPERIENCE_BONUS_MAX = SALARY_EXPERIENCE_BONUS_MAX;
    window.SALARY_EXPERIENCE_CAP = SALARY_EXPERIENCE_CAP;
    window.SALARY_URBAN_MODIFIER = SALARY_URBAN_MODIFIER;
    window.SALARY_RURAL_MODIFIER = SALARY_RURAL_MODIFIER;

    window.LITERACY_LEVELS = LITERACY_LEVELS;
    window.LITERACY_LEVEL_NAMES = LITERACY_LEVEL_NAMES;
    window.LITERACY_LEVEL_THRESHOLDS = LITERACY_LEVEL_THRESHOLDS;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            UNCATEGORIZED_ID: UNCATEGORIZED_ID,
            UNCATEGORIZED_NAME: UNCATEGORIZED_NAME,
            UNCATEGORIZED_ICON: UNCATEGORIZED_ICON,
            TEACHING_THRESHOLDS: TEACHING_THRESHOLDS,
            DEFAULT_ROLE_CATEGORIES: DEFAULT_ROLE_CATEGORIES,
            SUGGESTED_ROLES: SUGGESTED_ROLES,
            BASE_SALARY_BY_CATEGORY: BASE_SALARY_BY_CATEGORY,
            DEFAULT_SALARY: DEFAULT_SALARY,
            MIN_SALARY: MIN_SALARY,
            MAX_SALARY: MAX_SALARY,
            SALARY_SKILL_MULTIPLIER_MIN: SALARY_SKILL_MULTIPLIER_MIN,
            SALARY_SKILL_MULTIPLIER_MAX: SALARY_SKILL_MULTIPLIER_MAX,
            SALARY_EXPERIENCE_BONUS_PER_YEAR: SALARY_EXPERIENCE_BONUS_PER_YEAR,
            SALARY_EXPERIENCE_BONUS_MAX: SALARY_EXPERIENCE_BONUS_MAX,
            SALARY_EXPERIENCE_CAP: SALARY_EXPERIENCE_CAP,
            SALARY_URBAN_MODIFIER: SALARY_URBAN_MODIFIER,
            SALARY_RURAL_MODIFIER: SALARY_RURAL_MODIFIER,
            LITERACY_LEVELS: LITERACY_LEVELS,
            LITERACY_LEVEL_NAMES: LITERACY_LEVEL_NAMES,
            LITERACY_LEVEL_THRESHOLDS: LITERACY_LEVEL_THRESHOLDS
        };
    }

})();