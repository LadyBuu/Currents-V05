/**
 * =============================================================================
 * STILL WATERS - EDUCATION CONSTANTS (education-constants.js)
 * =============================================================================
 * 
 * This file contains ALL education-related constants.
 * 
 * DEPENDENCIES: None (pure constants)
 * 
 * UPDATED: Removed requiredTeacherSkill from INSTITUTION_TYPES
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =============================================================================
    // 1. EDUCATION LEVELS
    // =============================================================================

    var EDUCATION_LEVELS = {
        ILLITERATE: { id: 'illiterate', name: 'Illiterate', yearsRequired: 0, literacy: 0, icon: '✗', description: 'Cannot read or write' },
        BASIC: { id: 'basic', name: 'Basic Literacy', yearsRequired: 2, literacy: 30, icon: '⌇', description: 'Can read simple texts' },
        LITERATE: { id: 'literate', name: 'Literate', yearsRequired: 4, literacy: 60, icon: '⌇', description: 'Can read and write fluently' },
        EDUCATED: { id: 'educated', name: 'Educated', yearsRequired: 6, literacy: 80, icon: '✓', description: 'Well-read and knowledgeable' },
        SCHOLAR: { id: 'scholar', name: 'Scholar', yearsRequired: 10, literacy: 95, icon: '◉', description: 'Master of multiple disciplines' }
    };

    // =============================================================================
    // 2. GENERAL SUBJECTS (Academic)
    // =============================================================================

    var GENERAL_SUBJECTS = {
        LITERACY: { id: 'literacy', name: 'Literacy', icon: '⌇', category: 'academic', baseLearnRate: 15, isRoleSubject: false },
        BASIC_MATH: { id: 'basic_math', name: 'Basic Mathematics', icon: '⌇', category: 'academic', baseLearnRate: 10, isRoleSubject: false },
        ADVANCED_MATH: { id: 'advanced_math', name: 'Advanced Mathematics', icon: '⌇', category: 'academic', baseLearnRate: 8, isRoleSubject: false },
        HISTORY: { id: 'history', name: 'History', icon: '⌇', category: 'academic', baseLearnRate: 12, isRoleSubject: false },
        PHILOSOPHY: { id: 'philosophy', name: 'Philosophy', icon: '⌇', category: 'academic', baseLearnRate: 10, isRoleSubject: false },
        LAW: { id: 'law', name: 'Law', icon: '⌇', category: 'legal', baseLearnRate: 10, isRoleSubject: false },
        THEOLOGY: { id: 'theology', name: 'Theology', icon: '⌆', category: 'religious', baseLearnRate: 12, isRoleSubject: false },
        LATIN: { id: 'latin', name: 'Latin', icon: '⌇', category: 'language', baseLearnRate: 8, isRoleSubject: false },
        ETIQUETTE: { id: 'etiquette', name: 'Etiquette', icon: '⌇', category: 'social', baseLearnRate: 15, isRoleSubject: false },
        DIPLOMACY: { id: 'diplomacy', name: 'Diplomacy', icon: '⌇', category: 'social', baseLearnRate: 10, isRoleSubject: false },
        LANGUAGES: { id: 'languages', name: 'Foreign Languages', icon: '⌇', category: 'language', baseLearnRate: 8, isRoleSubject: false },
        TACTICS: { id: 'tactics', name: 'Military Tactics', icon: '⚔', category: 'military', baseLearnRate: 10, isRoleSubject: false },
        STRATEGY: { id: 'strategy', name: 'Strategic Command', icon: '⚔', category: 'military', baseLearnRate: 8, isRoleSubject: false },
        COMBAT: { id: 'combat', name: 'Combat Training', icon: '⚔', category: 'military', baseLearnRate: 12, isRoleSubject: false },
        CRAFT: { id: 'craft', name: 'Craftsmanship', icon: '⌇', category: 'craft', baseLearnRate: 12, isRoleSubject: false },
        TRADE: { id: 'trade', name: 'Trade', icon: '⌇', category: 'commercial', baseLearnRate: 10, isRoleSubject: false },
        BUSINESS: { id: 'business', name: 'Business', icon: '⌇', category: 'commercial', baseLearnRate: 10, isRoleSubject: false }
    };

    // =============================================================================
    // 3. HIGHER SUBJECTS (Advanced)
    // =============================================================================

    var HIGHER_SUBJECTS = {
        ASTRONOMY: { id: 'astronomy', name: 'Astronomy', icon: '⌇', category: 'science', baseLearnRate: 8, isRoleSubject: false },
        BIOLOGY: { id: 'biology', name: 'Biology', icon: '⌇', category: 'science', baseLearnRate: 8, isRoleSubject: false },
        CHEMISTRY: { id: 'chemistry', name: 'Chemistry', icon: '⌇', category: 'science', baseLearnRate: 8, isRoleSubject: false },
        PHYSICS: { id: 'physics', name: 'Physics', icon: '⌇', category: 'science', baseLearnRate: 8, isRoleSubject: false },
        MEDICINE: { id: 'medicine', name: 'Medicine', icon: '⌆', category: 'science', baseLearnRate: 8, isRoleSubject: false },
        LITERATURE: { id: 'literature', name: 'Literature', icon: '⌇', category: 'humanities', baseLearnRate: 10, isRoleSubject: false },
        RHETORIC: { id: 'rhetoric', name: 'Rhetoric', icon: '⌇', category: 'humanities', baseLearnRate: 10, isRoleSubject: false },
        LOGIC: { id: 'logic', name: 'Logic', icon: '⌇', category: 'humanities', baseLearnRate: 10, isRoleSubject: false },
        POLITICS: { id: 'politics', name: 'Political Science', icon: '⌇', category: 'social', baseLearnRate: 10, isRoleSubject: false },
        ECONOMICS: { id: 'economics', name: 'Economics', icon: '⌇', category: 'social', baseLearnRate: 10, isRoleSubject: false },
        GEOGRAPHY: { id: 'geography', name: 'Geography', icon: '⌇', category: 'social', baseLearnRate: 10, isRoleSubject: false },
        ARCHITECTURE: { id: 'architecture', name: 'Architecture', icon: '⌇', category: 'professional', baseLearnRate: 8, isRoleSubject: false },
        ENGINEERING: { id: 'engineering', name: 'Engineering', icon: '⌇', category: 'professional', baseLearnRate: 8, isRoleSubject: false }
    };

    // =============================================================================
    // 4. ALL SUBJECTS (Combined)
    // =============================================================================

    var ALL_SUBJECTS = {};
    for (var key in GENERAL_SUBJECTS) {
        if (GENERAL_SUBJECTS.hasOwnProperty(key)) {
            ALL_SUBJECTS[key] = GENERAL_SUBJECTS[key];
        }
    }
    for (var key in HIGHER_SUBJECTS) {
        if (HIGHER_SUBJECTS.hasOwnProperty(key)) {
            ALL_SUBJECTS[key] = HIGHER_SUBJECTS[key];
        }
    }

    // =============================================================================
    // 5. INSTITUTION TYPES (NO requiredTeacherSkill)
    // =============================================================================

    var INSTITUTION_TYPES = {
        VILLAGE_SCHOOL: { 
            id: 'village_school', 
            name: 'Village School', 
            icon: '⌂', 
            costPerYear: 5, 
            maxStudents: 30,
            baseReputation: 30,
            requiredYears: 3,
            minPopulation: 200,
            description: 'Small local school for basic education',
            skillGainPerYear: 10
        },
        GUILD_HALL: { 
            id: 'guild_hall', 
            name: 'Guild Hall', 
            icon: '◧', 
            costPerYear: 20, 
            maxStudents: 50,
            baseReputation: 50,
            requiredYears: 5,
            minPopulation: 1000,
            description: 'Trade and craft education center',
            skillGainPerYear: 10
        },
        CATHEDRAL_SCHOOL: { 
            id: 'cathedral_school', 
            name: 'Cathedral School', 
            icon: '⌆', 
            costPerYear: 15, 
            maxStudents: 40,
            baseReputation: 60,
            requiredYears: 4,
            minPopulation: 500,
            description: 'Religious and classical education',
            skillGainPerYear: 10
        },
        UNIVERSITY: { 
            id: 'university', 
            name: 'University', 
            icon: '⌂', 
            costPerYear: 50, 
            maxStudents: 200,
            baseReputation: 80,
            requiredYears: 6,
            minPopulation: 5000,
            description: 'Higher education institution',
            skillGainPerYear: 12
        },
        MILITARY_ACADEMY: { 
            id: 'military_academy', 
            name: 'Military Academy', 
            icon: '⚔', 
            costPerYear: 30, 
            maxStudents: 100,
            baseReputation: 65,
            requiredYears: 4,
            minPopulation: 2000,
            description: 'Officer training and military science',
            skillGainPerYear: 10
        },
        COURT_TUTOR: { 
            id: 'court_tutor', 
            name: 'Court Tutor', 
            icon: '◉', 
            costPerYear: 100, 
            maxStudents: 5,
            baseReputation: 90,
            requiredYears: 4,
            minPopulation: 100,
            description: 'Private education for nobility',
            skillGainPerYear: 15
        },
        SPECIALIZED_SCHOOL: {
            id: 'specialized_school',
            name: 'Specialized School',
            icon: '◉',
            costPerYear: 25,
            maxStudents: 40,
            baseReputation: 50,
            requiredYears: 4,
            minPopulation: 500,
            description: 'School focused on a specific profession',
            skillGainPerYear: 12
        }
    };

    // =============================================================================
    // 6. TUITION CONSTANTS
    // =============================================================================

    var DEFAULT_TUITION_BY_TYPE = {
        'village_school': 5,
        'guild_hall': 15,
        'cathedral_school': 12,
        'university': 40,
        'military_academy': 25,
        'court_tutor': 80,
        'specialized_school': 20
    };

    var DEFAULT_TUITION = 10;
    var MIN_TUITION = 0;
    var MAX_TUITION = 200;

    var TUITION_REPUTATION_MODIFIER_MIN = 0.75;
    var TUITION_REPUTATION_MODIFIER_MAX = 1.25;
    var TUITION_REPUTATION_NEUTRAL = 50;

    var TUITION_TYPE_MULTIPLIERS = {
        'village_school': 1.0,
        'guild_hall': 1.0,
        'cathedral_school': 1.0,
        'university': 1.5,
        'military_academy': 1.2,
        'court_tutor': 1.0,
        'specialized_school': 1.0
    };

    // =============================================================================
    // 7. ROLE CATEGORY OPTIONS (for specialization)
    // =============================================================================

    var ROLE_CATEGORY_OPTIONS = {
        'combat': { id: 'combat', name: 'Combat & Military', icon: '⚔' },
        'craft': { id: 'craft', name: 'Craftsmanship', icon: '⌇' },
        'trade': { id: 'trade', name: 'Trade & Commerce', icon: '⌇' },
        'agriculture': { id: 'agriculture', name: 'Agriculture & Fishing', icon: '⌇' },
        'academic': { id: 'academic', name: 'Academic & Scholar', icon: '⌇' },
        'medical': { id: 'medical', name: 'Medical & Healing', icon: '⌆' },
        'religious': { id: 'religious', name: 'Religious', icon: '⌆' },
        'admin': { id: 'admin', name: 'Administration', icon: '⌇' },
        'service': { id: 'service', name: 'Service', icon: '⌇' },
        'art': { id: 'art', name: 'Artistic', icon: '⌇' },
        'government': { id: 'government', name: 'Government & Public Service', icon: '⌇' },
        'household': { id: 'household', name: 'Household & Domestic Service', icon: '⌇' },
        'industrial': { id: 'industrial', name: 'Industry & Manufacturing', icon: '⌇' },
        'other': { id: 'other', name: 'Other', icon: '⌇' }
    };

    // =============================================================================
    // 8. EXPORTS
    // =============================================================================

    window.EDUCATION_LEVELS = EDUCATION_LEVELS;
    window.GENERAL_SUBJECTS = GENERAL_SUBJECTS;
    window.HIGHER_SUBJECTS = HIGHER_SUBJECTS;
    window.ALL_SUBJECTS = ALL_SUBJECTS;
    window.INSTITUTION_TYPES = INSTITUTION_TYPES;
    window.ROLE_CATEGORY_OPTIONS = ROLE_CATEGORY_OPTIONS;

    window.DEFAULT_TUITION_BY_TYPE = DEFAULT_TUITION_BY_TYPE;
    window.DEFAULT_TUITION = DEFAULT_TUITION;
    window.MIN_TUITION = MIN_TUITION;
    window.MAX_TUITION = MAX_TUITION;
    window.TUITION_REPUTATION_MODIFIER_MIN = TUITION_REPUTATION_MODIFIER_MIN;
    window.TUITION_REPUTATION_MODIFIER_MAX = TUITION_REPUTATION_MODIFIER_MAX;
    window.TUITION_REPUTATION_NEUTRAL = TUITION_REPUTATION_NEUTRAL;
    window.TUITION_TYPE_MULTIPLIERS = TUITION_TYPE_MULTIPLIERS;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            EDUCATION_LEVELS: EDUCATION_LEVELS,
            GENERAL_SUBJECTS: GENERAL_SUBJECTS,
            HIGHER_SUBJECTS: HIGHER_SUBJECTS,
            ALL_SUBJECTS: ALL_SUBJECTS,
            INSTITUTION_TYPES: INSTITUTION_TYPES,
            ROLE_CATEGORY_OPTIONS: ROLE_CATEGORY_OPTIONS,
            DEFAULT_TUITION_BY_TYPE: DEFAULT_TUITION_BY_TYPE,
            DEFAULT_TUITION: DEFAULT_TUITION,
            MIN_TUITION: MIN_TUITION,
            MAX_TUITION: MAX_TUITION,
            TUITION_REPUTATION_MODIFIER_MIN: TUITION_REPUTATION_MODIFIER_MIN,
            TUITION_REPUTATION_MODIFIER_MAX: TUITION_REPUTATION_MODIFIER_MAX,
            TUITION_REPUTATION_NEUTRAL: TUITION_REPUTATION_NEUTRAL,
            TUITION_TYPE_MULTIPLIERS: TUITION_TYPE_MULTIPLIERS
        };
    }

})();