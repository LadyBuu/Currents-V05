/**
 * =============================================================================
 * STILL WATERS - ROLE CONSTANTS (role-constants.js)
 * =============================================================================
 * 
 * This file contains ALL role-related constants.
 * 
 * DEPENDENCIES: None (pure constants)
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
        combat: { id: 'combat', name: 'Combat & Military' },
        craft: { id: 'craft', name: 'Craftsmanship' },
        trade: { id: 'trade', name: 'Trade & Commerce' },
        agriculture: { id: 'agriculture', name: 'Agriculture & Fishing' },
        academic: { id: 'academic', name: 'Academic & Scholar' },
        medical: { id: 'medical', name: 'Medical & Healing' },
        religious: { id: 'religious', name: 'Religious' },
        admin: { id: 'admin', name: 'Administration' },
        service: { id: 'service', name: 'Service' },
        art: { id: 'art', name: 'Artistic' },
        government: { id: 'government', name: 'Government & Public Service' },
        household: { id: 'household', name: 'Household & Domestic Service' },
        industrial: { id: 'industrial', name: 'Industry & Manufacturing' },
        other: { id: 'other', name: 'Other' }
    };

    // =========================================================================
    // 4. SALARY CONSTANTS
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
        'industrial': 14,
        'other': 10
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
    // 5. LITERACY REQUIREMENT CONSTANTS
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
    // 6. SUGGESTED ROLES - REMOVED
    // =========================================================================

    // NOTE: SUGGESTED_ROLES has been removed.
    // Users should create roles through the role management UI.
    // Specific household positions (Maid, Cook, Gardener, etc.) are now
    // defined as Household Positions in the household system,
    // NOT as Roles in the role system.

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.UNCATEGORIZED_ID = UNCATEGORIZED_ID;
    window.UNCATEGORIZED_NAME = UNCATEGORIZED_NAME;
    window.UNCATEGORIZED_ICON = UNCATEGORIZED_ICON;
    window.TEACHING_THRESHOLDS = TEACHING_THRESHOLDS;
    window.DEFAULT_ROLE_CATEGORIES = DEFAULT_ROLE_CATEGORIES;

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