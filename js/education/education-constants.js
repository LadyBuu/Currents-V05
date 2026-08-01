/**
 * =============================================================================
 * STILL WATERS - EDUCATION CONSTANTS (education-constants.js)
 * =============================================================================
 * 
 * This file contains ALL education-related constants.
 * 
 * DEPENDENCIES: None (pure constants)
 * 
 * UPDATED: Ultra-broad, generic school types from dirt-poor to filthy rich.
 *          These are simple size/prestige categories that work for ANY setting.
 *          Specialization comes from curriculum and role assignments, not type.
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
    // 2. SUBJECTS (Combined into one list for simplicity)
    // =============================================================================

    var ALL_SUBJECTS = {
        // Core academic
        LITERACY: { id: 'literacy', name: 'Literacy', icon: '⌇', category: 'academic', baseLearnRate: 15 },
        BASIC_MATH: { id: 'basic_math', name: 'Basic Mathematics', icon: '⌇', category: 'academic', baseLearnRate: 10 },
        ADVANCED_MATH: { id: 'advanced_math', name: 'Advanced Mathematics', icon: '⌇', category: 'academic', baseLearnRate: 8 },
        HISTORY: { id: 'history', name: 'History', icon: '⌇', category: 'academic', baseLearnRate: 12 },
        PHILOSOPHY: { id: 'philosophy', name: 'Philosophy', icon: '⌇', category: 'academic', baseLearnRate: 10 },
        
        // Languages
        NATIVE_LANGUAGE: { id: 'native_language', name: 'Native Language', icon: '⌇', category: 'language', baseLearnRate: 15 },
        FOREIGN_LANGUAGES: { id: 'foreign_languages', name: 'Foreign Languages', icon: '⌇', category: 'language', baseLearnRate: 8 },
        CLASSICAL_LANGUAGES: { id: 'classical_languages', name: 'Classical Languages', icon: '⌇', category: 'language', baseLearnRate: 8 },
        
        // Social sciences
        LAW: { id: 'law', name: 'Law', icon: '⌇', category: 'social', baseLearnRate: 10 },
        POLITICS: { id: 'politics', name: 'Political Science', icon: '⌇', category: 'social', baseLearnRate: 10 },
        ECONOMICS: { id: 'economics', name: 'Economics', icon: '⌇', category: 'social', baseLearnRate: 10 },
        DIPLOMACY: { id: 'diplomacy', name: 'Diplomacy', icon: '⌇', category: 'social', baseLearnRate: 10 },
        ETIQUETTE: { id: 'etiquette', name: 'Etiquette', icon: '⌇', category: 'social', baseLearnRate: 15 },
        
        // Sciences
        ASTRONOMY: { id: 'astronomy', name: 'Astronomy', icon: '⌇', category: 'science', baseLearnRate: 8 },
        BIOLOGY: { id: 'biology', name: 'Biology', icon: '⌇', category: 'science', baseLearnRate: 8 },
        CHEMISTRY: { id: 'chemistry', name: 'Chemistry', icon: '⌇', category: 'science', baseLearnRate: 8 },
        PHYSICS: { id: 'physics', name: 'Physics', icon: '⌇', category: 'science', baseLearnRate: 8 },
        MEDICINE: { id: 'medicine', name: 'Medicine', icon: '⌆', category: 'science', baseLearnRate: 8 },
        GEOGRAPHY: { id: 'geography', name: 'Geography', icon: '⌇', category: 'science', baseLearnRate: 10 },
        
        // Humanities
        LITERATURE: { id: 'literature', name: 'Literature', icon: '⌇', category: 'humanities', baseLearnRate: 10 },
        RHETORIC: { id: 'rhetoric', name: 'Rhetoric', icon: '⌇', category: 'humanities', baseLearnRate: 10 },
        LOGIC: { id: 'logic', name: 'Logic', icon: '⌇', category: 'humanities', baseLearnRate: 10 },
        THEOLOGY: { id: 'theology', name: 'Theology', icon: '⌆', category: 'religious', baseLearnRate: 12 },
        
        // Practical skills
        AGRICULTURE: { id: 'agriculture', name: 'Agriculture', icon: '⌇', category: 'practical', baseLearnRate: 12 },
        HORTICULTURE: { id: 'horticulture', name: 'Horticulture', icon: '⌇', category: 'practical', baseLearnRate: 10 },
        ANIMAL_HUSBANDRY: { id: 'animal_husbandry', name: 'Animal Husbandry', icon: '⌇', category: 'practical', baseLearnRate: 12 },
        NAVIGATION: { id: 'navigation', name: 'Navigation', icon: '⌇', category: 'practical', baseLearnRate: 10 },
        SEAMANSHIP: { id: 'seamanship', name: 'Seamanship', icon: '⌇', category: 'practical', baseLearnRate: 12 },
        FISHING: { id: 'fishing', name: 'Fishing', icon: '⌇', category: 'practical', baseLearnRate: 12 },
        
        // Craft skills
        WEAVING: { id: 'weaving', name: 'Weaving', icon: '⌇', category: 'craft', baseLearnRate: 12 },
        CARPENTRY: { id: 'carpentry', name: 'Carpentry', icon: '⌇', category: 'craft', baseLearnRate: 10 },
        MASONRY: { id: 'masonry', name: 'Masonry', icon: '⌇', category: 'craft', baseLearnRate: 10 },
        BLACKSMITHING: { id: 'blacksmithing', name: 'Blacksmithing', icon: '⌇', category: 'craft', baseLearnRate: 10 },
        POTTERY: { id: 'pottery', name: 'Pottery', icon: '⌇', category: 'craft', baseLearnRate: 12 },
        WOODWORKING: { id: 'woodworking', name: 'Woodworking', icon: '⌇', category: 'craft', baseLearnRate: 10 },
        METALWORK: { id: 'metalwork', name: 'Metalwork', icon: '⌇', category: 'craft', baseLearnRate: 10 },
        LEATHERWORK: { id: 'leatherwork', name: 'Leatherwork', icon: '⌇', category: 'craft', baseLearnRate: 12 },
        TEXTILE_WORK: { id: 'textile_work', name: 'Textile Work', icon: '⌇', category: 'craft', baseLearnRate: 12 },
        
        // Professional
        ARCHITECTURE: { id: 'architecture', name: 'Architecture', icon: '⌇', category: 'professional', baseLearnRate: 8 },
        ENGINEERING: { id: 'engineering', name: 'Engineering', icon: '⌇', category: 'professional', baseLearnRate: 8 },
        BUSINESS: { id: 'business', name: 'Business', icon: '⌇', category: 'professional', baseLearnRate: 10 },
        ACCOUNTING: { id: 'accounting', name: 'Accounting', icon: '⌇', category: 'professional', baseLearnRate: 10 },
        
        // Military
        TACTICS: { id: 'tactics', name: 'Military Tactics', icon: '⚔', category: 'military', baseLearnRate: 10 },
        STRATEGY: { id: 'strategy', name: 'Strategic Command', icon: '⚔', category: 'military', baseLearnRate: 8 },
        COMBAT: { id: 'combat', name: 'Combat Training', icon: '⚔', category: 'military', baseLearnRate: 12 },
        LEADERSHIP: { id: 'leadership', name: 'Leadership', icon: '⌇', category: 'military', baseLearnRate: 10 },
        
        // Arts
        MUSIC: { id: 'music', name: 'Music', icon: '⌇', category: 'arts', baseLearnRate: 10 },
        PAINTING: { id: 'painting', name: 'Painting', icon: '⌇', category: 'arts', baseLearnRate: 10 },
        SCULPTURE: { id: 'sculpture', name: 'Sculpture', icon: '⌇', category: 'arts', baseLearnRate: 10 },
        PERFORMING_ARTS: { id: 'performing_arts', name: 'Performing Arts', icon: '⌇', category: 'arts', baseLearnRate: 10 }
    };

    // =============================================================================
    // 3. ULTRA-BROAD INSTITUTION TYPES
    // ONLY 7 types - distinguished purely by size, scale, and prestige
    // Specialization comes from curriculum, not from the type name
    // =============================================================================

    var INSTITUTION_TYPES = {

        // ================================================================
        // TYPE 1: HUT SCHOOL - Dirt poor, minimal
        // ================================================================

        HUT_SCHOOL: {
            id: 'hut_school',
            name: 'Hut School',
            icon: '⌂',
            costPerYear: 0,
            maxStudents: 10,
            baseReputation: 10,
            requiredYears: 2,
            minPopulation: 20,
            description: 'The most basic education possible - a single teacher, often outdoors or in a humble dwelling. Teaches only what the teacher knows.',
            skillGainPerYear: 5,
            tier: 'dirt_poor',
            tuitionBase: 0,
            requiredTeacherSkill: 10
        },

        // ================================================================
        // TYPE 2: SMALL SCHOOL - Poor, basic education
        // ================================================================

        SMALL_SCHOOL: {
            id: 'small_school',
            name: 'Small School',
            icon: '⌂',
            costPerYear: 5,
            maxStudents: 30,
            baseReputation: 25,
            requiredYears: 3,
            minPopulation: 150,
            description: 'A modest school serving a local community. One or two teachers provide basic literacy, numeracy, and practical knowledge.',
            skillGainPerYear: 8,
            tier: 'poor',
            tuitionBase: 5,
            requiredTeacherSkill: 25
        },

        // ================================================================
        // TYPE 3: TOWN SCHOOL - Lower middle, decent education
        // ================================================================

        TOWN_SCHOOL: {
            id: 'town_school',
            name: 'Town School',
            icon: '⌂',
            costPerYear: 12,
            maxStudents: 50,
            baseReputation: 40,
            requiredYears: 4,
            minPopulation: 400,
            description: 'A proper school in a town or village. Multiple teachers, a building, and a solid curriculum covering literacy, arithmetic, and basic sciences.',
            skillGainPerYear: 10,
            tier: 'lower_middle',
            tuitionBase: 12,
            requiredTeacherSkill: 40
        },

        // ================================================================
        // TYPE 4: ACADEMY - Middle class, good education
        // ================================================================

        ACADEMY: {
            id: 'academy',
            name: 'Academy',
            icon: '⌂',
            costPerYear: 25,
            maxStudents: 100,
            baseReputation: 55,
            requiredYears: 5,
            minPopulation: 800,
            description: 'A substantial institution with multiple teachers, specialized subjects, and a reputation for quality education. Often attracts students from surrounding areas.',
            skillGainPerYear: 11,
            tier: 'middle',
            tuitionBase: 25,
            requiredTeacherSkill: 50
        },

        // ================================================================
        // TYPE 5: COLLEGE - Upper middle, excellent education
        // ================================================================

        COLLEGE: {
            id: 'college',
            name: 'College',
            icon: '⌂',
            costPerYear: 45,
            maxStudents: 200,
            baseReputation: 70,
            requiredYears: 6,
            minPopulation: 2000,
            description: 'A major educational institution with a broad curriculum, specialist teachers, and strong reputation. Prepares students for leadership roles in society.',
            skillGainPerYear: 13,
            tier: 'upper_middle',
            tuitionBase: 45,
            requiredTeacherSkill: 65
        },

        // ================================================================
        // TYPE 6: UNIVERSITY - Rich, elite education
        // ================================================================

        UNIVERSITY: {
            id: 'university',
            name: 'University',
            icon: '⌂',
            costPerYear: 80,
            maxStudents: 400,
            baseReputation: 85,
            requiredYears: 7,
            minPopulation: 5000,
            description: 'A premier institution of higher learning with world-class faculty, extensive resources, and students from across the known world. The pinnacle of education.',
            skillGainPerYear: 15,
            tier: 'rich',
            tuitionBase: 80,
            requiredTeacherSkill: 75
        },

        // ================================================================
        // TYPE 7: GRAND UNIVERSITY - Filthy rich, unmatched education
        // ================================================================

        GRAND_UNIVERSITY: {
            id: 'grand_university',
            name: 'Grand University',
            icon: '⌂',
            costPerYear: 150,
            maxStudents: 600,
            baseReputation: 95,
            requiredYears: 8,
            minPopulation: 15000,
            description: 'The most prestigious educational institution in the world. Royal patronage, the greatest minds, and resources beyond compare. Only the wealthiest and most capable gain entry.',
            skillGainPerYear: 18,
            tier: 'filthy_rich',
            tuitionBase: 150,
            requiredTeacherSkill: 88
        }
    };

    // =============================================================================
    // 4. OWNERSHIP TYPES
    // =============================================================================

    var OWNERSHIP_TYPES = {
        PUBLIC: 'public',
        PRIVATE: 'private',
        RELIGIOUS: 'religious'
    };

    // =============================================================================
    // 5. TUITION CONSTANTS
    // =============================================================================

    var DEFAULT_TUITION_BY_TYPE = {
        'hut_school': 0,
        'small_school': 5,
        'town_school': 12,
        'academy': 25,
        'college': 45,
        'university': 80,
        'grand_university': 150
    };

    var DEFAULT_TUITION = 10;
    var MIN_TUITION = 0;
    var MAX_TUITION = 200;

    var TUITION_REPUTATION_MODIFIER_MIN = 0.75;
    var TUITION_REPUTATION_MODIFIER_MAX = 1.25;
    var TUITION_REPUTATION_NEUTRAL = 50;

    var TUITION_TYPE_MULTIPLIERS = {
        'hut_school': 0.5,
        'small_school': 0.7,
        'town_school': 0.9,
        'academy': 1.0,
        'college': 1.3,
        'university': 1.7,
        'grand_university': 2.5
    };

    // =============================================================================
    // 6. SCHOOL TIERS (for easy filtering)
    // =============================================================================

    var SCHOOL_TIERS = {
        DIRT_POOR: { id: 'dirt_poor', label: 'Dirt Poor', minReputation: 0, maxReputation: 20, tuitionRange: '0-5' },
        POOR: { id: 'poor', label: 'Poor', minReputation: 20, maxReputation: 40, tuitionRange: '5-15' },
        LOWER_MIDDLE: { id: 'lower_middle', label: 'Lower Middle', minReputation: 35, maxReputation: 55, tuitionRange: '10-25' },
        MIDDLE: { id: 'middle', label: 'Middle', minReputation: 50, maxReputation: 70, tuitionRange: '20-45' },
        UPPER_MIDDLE: { id: 'upper_middle', label: 'Upper Middle', minReputation: 65, maxReputation: 80, tuitionRange: '40-80' },
        RICH: { id: 'rich', label: 'Rich', minReputation: 75, maxReputation: 92, tuitionRange: '80-150' },
        FILTHY_RICH: { id: 'filthy_rich', label: 'Filthy Rich', minReputation: 88, maxReputation: 100, tuitionRange: '150-200' }
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
        'maritime': { id: 'maritime', name: 'Maritime & Seafaring', icon: '⌇' },
        'legal': { id: 'legal', name: 'Legal', icon: '⌇' },
        'diplomacy': { id: 'diplomacy', name: 'Diplomacy & Statecraft', icon: '⌇' },
        'finance': { id: 'finance', name: 'Finance & Economics', icon: '⌇' },
        'science': { id: 'science', name: 'Science & Research', icon: '⌇' },
        'other': { id: 'other', name: 'Other', icon: '⌇' }
    };

    // =============================================================================
    // 8. EXPORTS
    // =============================================================================

    window.EDUCATION_LEVELS = EDUCATION_LEVELS;
    window.ALL_SUBJECTS = ALL_SUBJECTS;
    window.INSTITUTION_TYPES = INSTITUTION_TYPES;
    window.OWNERSHIP_TYPES = OWNERSHIP_TYPES;
    window.ROLE_CATEGORY_OPTIONS = ROLE_CATEGORY_OPTIONS;
    window.SCHOOL_TIERS = SCHOOL_TIERS;

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
            ALL_SUBJECTS: ALL_SUBJECTS,
            INSTITUTION_TYPES: INSTITUTION_TYPES,
            OWNERSHIP_TYPES: OWNERSHIP_TYPES,
            ROLE_CATEGORY_OPTIONS: ROLE_CATEGORY_OPTIONS,
            SCHOOL_TIERS: SCHOOL_TIERS,
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