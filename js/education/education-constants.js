/**
 * =============================================================================
 * STILL WATERS - EDUCATION CONSTANTS (education-constants.js)
 * =============================================================================
 * 
 * This file contains ALL education-related constants.
 * 
 * DEPENDENCIES: None (pure constants)
 * 
 * =============================================================================
 */

// =============================================================================
// 1. EDUCATION LEVELS
// =============================================================================

const EDUCATION_LEVELS = {
    ILLITERATE: { id: 'illiterate', name: 'Illiterate', yearsRequired: 0, literacy: 0, icon: '✗', description: 'Cannot read or write' },
    BASIC: { id: 'basic', name: 'Basic Literacy', yearsRequired: 2, literacy: 30, icon: '⌇', description: 'Can read simple texts' },
    LITERATE: { id: 'literate', name: 'Literate', yearsRequired: 4, literacy: 60, icon: '⌇', description: 'Can read and write fluently' },
    EDUCATED: { id: 'educated', name: 'Educated', yearsRequired: 6, literacy: 80, icon: '✓', description: 'Well-read and knowledgeable' },
    SCHOLAR: { id: 'scholar', name: 'Scholar', yearsRequired: 10, literacy: 95, icon: '◉', description: 'Master of multiple disciplines' }
};

// =============================================================================
// 2. GENERAL SUBJECTS (Academic)
// =============================================================================

const GENERAL_SUBJECTS = {
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

const HIGHER_SUBJECTS = {
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

const ALL_SUBJECTS = {};
Object.assign(ALL_SUBJECTS, GENERAL_SUBJECTS);
Object.assign(ALL_SUBJECTS, HIGHER_SUBJECTS);

// =============================================================================
// 5. INSTITUTION TYPES
// =============================================================================

const INSTITUTION_TYPES = {
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
        skillGainPerYear: 10,
        requiredTeacherSkill: 51
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
        skillGainPerYear: 10,
        requiredTeacherSkill: 51
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
        skillGainPerYear: 10,
        requiredTeacherSkill: 60
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
        skillGainPerYear: 12,
        requiredTeacherSkill: 76
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
        skillGainPerYear: 10,
        requiredTeacherSkill: 60
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
        skillGainPerYear: 15,
        requiredTeacherSkill: 76
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
        skillGainPerYear: 12,
        requiredTeacherSkill: 60
    }
};

// =============================================================================
// 6. EXPORTS
// =============================================================================

window.EDUCATION_LEVELS = EDUCATION_LEVELS;
window.GENERAL_SUBJECTS = GENERAL_SUBJECTS;
window.HIGHER_SUBJECTS = HIGHER_SUBJECTS;
window.ALL_SUBJECTS = ALL_SUBJECTS;
window.INSTITUTION_TYPES = INSTITUTION_TYPES;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        EDUCATION_LEVELS,
        GENERAL_SUBJECTS,
        HIGHER_SUBJECTS,
        ALL_SUBJECTS,
        INSTITUTION_TYPES
    };
}