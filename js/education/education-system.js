/**
 * =============================================================================
 * STILL WATERS - EDUCATION SYSTEM (Wrapper)
 * =============================================================================
 * 
 * LOCATION: js/systems/education/educationSystem.js
 * 
 * This file re-exports all education functions from the modular structure.
 * Kept for backward compatibility with existing code.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. CONSTANTS (from education-constants.js)
    // =========================================================================

    if (typeof window.EDUCATION_LEVELS === 'undefined') {
        window.EDUCATION_LEVELS = {
            ILLITERATE: { id: 'illiterate', name: 'Illiterate', yearsRequired: 0, literacy: 0, icon: '✗', description: 'Cannot read or write' },
            BASIC: { id: 'basic', name: 'Basic Literacy', yearsRequired: 2, literacy: 30, icon: '⌇', description: 'Can read simple texts' },
            LITERATE: { id: 'literate', name: 'Literate', yearsRequired: 4, literacy: 60, icon: '⌇', description: 'Can read and write fluently' },
            EDUCATED: { id: 'educated', name: 'Educated', yearsRequired: 6, literacy: 80, icon: '✓', description: 'Well-read and knowledgeable' },
            SCHOLAR: { id: 'scholar', name: 'Scholar', yearsRequired: 10, literacy: 95, icon: '◉', description: 'Master of multiple disciplines' }
        };
    }

    if (typeof window.GENERAL_SUBJECTS === 'undefined') {
        window.GENERAL_SUBJECTS = {
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
    }

    if (typeof window.HIGHER_SUBJECTS === 'undefined') {
        window.HIGHER_SUBJECTS = {
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
    }

    if (typeof window.ALL_SUBJECTS === 'undefined') {
        window.ALL_SUBJECTS = {};
        for (var key in window.GENERAL_SUBJECTS) {
            if (window.GENERAL_SUBJECTS.hasOwnProperty(key)) {
                window.ALL_SUBJECTS[key] = window.GENERAL_SUBJECTS[key];
            }
        }
        for (var key in window.HIGHER_SUBJECTS) {
            if (window.HIGHER_SUBJECTS.hasOwnProperty(key)) {
                window.ALL_SUBJECTS[key] = window.HIGHER_SUBJECTS[key];
            }
        }
    }

    if (typeof window.INSTITUTION_TYPES === 'undefined') {
        window.INSTITUTION_TYPES = {
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
    }

    // =========================================================================
    // 2. RE-EXPORT FUNCTIONS
    // =========================================================================

    // State layer (education-state.js)
    if (typeof window.EducationState !== 'undefined') {
        if (typeof window.subscribe === 'undefined') {
            window.subscribe = function(callback) {
                return window.EducationState.subscribe(callback);
            };
        }
        if (typeof window.getAllEducationalInstitutions === 'undefined') {
            window.getAllEducationalInstitutions = function() {
                return window.EducationState.getAllInstitutions();
            };
        }
        if (typeof window.getEducationalInstitution === 'undefined') {
            window.getEducationalInstitution = function(id) {
                return window.EducationState.getInstitution(id);
            };
        }
        if (typeof window.getInstitutionsAtLocation === 'undefined') {
            window.getInstitutionsAtLocation = function(locationId) {
                return window.EducationState.getInstitutionsByLocation(locationId);
            };
        }
        if (typeof window.getInstitutionsByType === 'undefined') {
            window.getInstitutionsByType = function(typeId) {
                return window.EducationState.getInstitutionsByType(typeId);
            };
        }
    }

    // Commands (education-commands.js)
    if (typeof window.EducationCommands !== 'undefined') {
        if (typeof window.createEducationalInstitution === 'undefined') {
            window.createEducationalInstitution = window.EducationCommands.createInstitution;
        }
        if (typeof window.updateEducationalInstitution === 'undefined') {
            window.updateEducationalInstitution = window.EducationCommands.updateInstitution;
        }
        if (typeof window.deleteEducationalInstitution === 'undefined') {
            window.deleteEducationalInstitution = window.EducationCommands.deleteInstitution;
        }
        if (typeof window.updateInstitutionReputation === 'undefined') {
            window.updateInstitutionReputation = window.EducationCommands.updateReputation;
        }
        if (typeof window.enrollStudent === 'undefined') {
            window.enrollStudent = window.EducationCommands.enrollStudent;
        }
        if (typeof window.graduateStudent === 'undefined') {
            window.graduateStudent = window.EducationCommands.graduateStudent;
        }
        if (typeof window.withdrawStudent === 'undefined') {
            window.withdrawStudent = window.EducationCommands.withdrawStudent;
        }
        if (typeof window.hireTeacher === 'undefined') {
            window.hireTeacher = window.EducationCommands.hireTeacher;
        }
        if (typeof window.fireTeacher === 'undefined') {
            window.fireTeacher = window.EducationCommands.fireTeacher;
        }
        if (typeof window.setHeadmaster === 'undefined') {
            window.setHeadmaster = window.EducationCommands.setHeadmaster;
        }
        if (typeof window.endHeadmasterTerm === 'undefined') {
            window.endHeadmasterTerm = window.EducationCommands.endHeadmasterTerm;
        }
        if (typeof window.getInstitutionsNeedingTeachers === 'undefined') {
            window.getInstitutionsNeedingTeachers = window.EducationCommands.getInstitutionsNeedingTeachers;
        }
    }

    // Queries (education-queries.js)
    if (typeof window.EducationQueries !== 'undefined') {
        if (typeof window.getInstitutionDetails === 'undefined') {
            window.getInstitutionDetails = window.EducationQueries.getInstitutionDetails;
        }
        if (typeof window.getInstitutionsInRegion === 'undefined') {
            window.getInstitutionsInRegion = window.EducationQueries.getInstitutionsInRegion;
        }
        if (typeof window.getInstitutionStudents === 'undefined') {
            window.getInstitutionStudents = window.EducationQueries.getInstitutionStudents;
        }
        if (typeof window.getInstitutionGraduates === 'undefined') {
            window.getInstitutionGraduates = window.EducationQueries.getInstitutionGraduates;
        }
        if (typeof window.getInstitutionTeachers === 'undefined') {
            window.getInstitutionTeachers = window.EducationQueries.getInstitutionTeachers;
        }
        if (typeof window.isStudentEnrolled === 'undefined') {
            window.isStudentEnrolled = window.EducationQueries.isStudentEnrolled;
        }
        if (typeof window.getHeadmaster === 'undefined') {
            window.getHeadmaster = window.EducationQueries.getHeadmaster;
        }
        if (typeof window.getHeadmasterHistory === 'undefined') {
            window.getHeadmasterHistory = window.EducationQueries.getHeadmasterHistory;
        }
        if (typeof window.getInstitutionStatistics === 'undefined') {
            window.getInstitutionStatistics = window.EducationQueries.getInstitutionStatistics;
        }
        if (typeof window.getLocationEducationSummary === 'undefined') {
            window.getLocationEducationSummary = window.EducationQueries.getLocationEducationSummary;
        }
        if (typeof window.getEducationHealthScore === 'undefined') {
            window.getEducationHealthScore = window.EducationQueries.getEducationHealthScore;
        }
        if (typeof window.recommendNewSchoolLocation === 'undefined') {
            window.recommendNewSchoolLocation = window.EducationQueries.recommendNewSchoolLocations;
        }
    }

    // Learning (education-learning.js)
    if (typeof window.EducationLearning !== 'undefined') {
        if (typeof window.advanceLearning === 'undefined') {
            window.advanceLearning = window.EducationLearning.advanceLearning;
        }
        if (typeof window.getProficiency === 'undefined') {
            window.getProficiency = window.EducationLearning.getProficiency;
        }
        if (typeof window.getSubjectProficiency === 'undefined') {
            window.getSubjectProficiency = window.EducationLearning.getSubjectProficiency;
        }
        if (typeof window.getCharacterProficiencies === 'undefined') {
            window.getCharacterProficiencies = window.EducationLearning.getCharacterProficiencies;
        }
        if (typeof window.getEducationLevel === 'undefined') {
            window.getEducationLevel = window.EducationLearning.getEducationLevel;
        }
        if (typeof window.isLiterate === 'undefined') {
            window.isLiterate = window.EducationLearning.isLiterate;
        }
        if (typeof window.getLiteracyRate === 'undefined') {
            window.getLiteracyRate = window.EducationLearning.getLiteracyRate;
        }
        if (typeof window.getSchoolAgePopulation === 'undefined') {
            window.getSchoolAgePopulation = window.EducationLearning.getSchoolAgePopulation;
        }
        if (typeof window.getEligibleStudents === 'undefined') {
            window.getEligibleStudents = window.EducationLearning.getEligibleStudents;
        }
        if (typeof window.getStudentDemand === 'undefined') {
            window.getStudentDemand = window.EducationLearning.getStudentDemand;
        }
    }

    // Annual (education-annual.js)
    if (typeof window.EducationAnnual !== 'undefined') {
        if (typeof window.processAnnualEducation === 'undefined') {
            window.processAnnualEducation = window.EducationAnnual.processAnnualEducation;
        }
        if (typeof window.processAnnualInstitution === 'undefined') {
            window.processAnnualInstitution = window.EducationAnnual.processAnnualInstitution;
        }
        if (typeof window.getStudentsReadyForGraduation === 'undefined') {
            window.getStudentsReadyForGraduation = window.EducationAnnual.getStudentsReadyForGraduation;
        }
    }

    // =========================================================================
    // 3. INTERNAL FUNCTIONS (for wrappers)
    // =========================================================================

    if (typeof window._getInstitutions === 'undefined') {
        window._getInstitutions = function() {
            if (typeof window.getAllEducationalInstitutions === 'function') {
                return window.getAllEducationalInstitutions();
            }
            return [];
        };
    }

    if (typeof window._saveInstitutions === 'undefined') {
        window._saveInstitutions = function() {
            if (typeof window.EducationState !== 'undefined') {
                window.EducationState._persistState();
            }
        };
    }

    if (typeof window._refreshInstitutionCache === 'undefined') {
        window._refreshInstitutionCache = function() {
            if (typeof window.EducationState !== 'undefined') {
                window.EducationState._rebuildCaches();
            }
        };
    }

    if (typeof window._initCharacterEducationFields === 'undefined') {
        window._initCharacterEducationFields = function(character) {
            if (typeof window.EducationLearning !== 'undefined') {
                return window.EducationLearning.initCharacterEducationFields(character);
            }
            return character;
        };
    }

    if (typeof window._getEducationLevel === 'undefined') {
        window._getEducationLevel = function(characterId) {
            if (typeof window.getEducationLevel === 'function') {
                return window.getEducationLevel(characterId);
            }
            return window.EDUCATION_LEVELS?.ILLITERATE || { id: 'illiterate', name: 'Illiterate', literacy: 0 };
        };
    }

    if (typeof window._isLiterate === 'undefined') {
        window._isLiterate = function(characterId) {
            if (typeof window.isLiterate === 'function') {
                return window.isLiterate(characterId);
            }
            return false;
        };
    }

    if (typeof window._getSchoolAgePopulation === 'undefined') {
        window._getSchoolAgePopulation = function(locationId) {
            if (typeof window.getSchoolAgePopulation === 'function') {
                return window.getSchoolAgePopulation(locationId);
            }
            return 0;
        };
    }

    if (typeof window._getEligibleStudents === 'undefined') {
        window._getEligibleStudents = function(locationId, minAge, maxAge) {
            if (typeof window.getEligibleStudents === 'function') {
                return window.getEligibleStudents(locationId, minAge, maxAge);
            }
            return [];
        };
    }

    if (typeof window._getStudentDemand === 'undefined') {
        window._getStudentDemand = function(locationId) {
            if (typeof window.getStudentDemand === 'function') {
                return window.getStudentDemand(locationId);
            }
            return {};
        };
    }

    if (typeof window._processAnnualEducation === 'undefined') {
        window._processAnnualEducation = function(year) {
            if (typeof window.processAnnualEducation === 'function') {
                return window.processAnnualEducation(year);
            }
            return { graduations: [], skillGains: [] };
        };
    }

    if (typeof window._getInstitutionsSummaryAtLocation === 'undefined') {
        window._getInstitutionsSummaryAtLocation = function(locationId) {
            if (typeof window.getLocationEducationSummary === 'function') {
                return window.getLocationEducationSummary(locationId, false);
            }
            return {};
        };
    }

    if (typeof window._getInstitutionsInRegion === 'undefined') {
        window._getInstitutionsInRegion = function(placeId) {
            if (typeof window.getInstitutionsInRegion === 'function') {
                return window.getInstitutionsInRegion(placeId);
            }
            return [];
        };
    }

    if (typeof window._getEducationHealthScore === 'undefined') {
        window._getEducationHealthScore = function(locationId) {
            if (typeof window.getEducationHealthScore === 'function') {
                return window.getEducationHealthScore(locationId);
            }
            return {};
        };
    }

    if (typeof window._recommendNewSchoolLocation === 'undefined') {
        window._recommendNewSchoolLocation = function(minDensity, minSchoolAgePop) {
            if (typeof window.recommendNewSchoolLocation === 'function') {
                return window.recommendNewSchoolLocation(minDensity, minSchoolAgePop);
            }
            return [];
        };
    }

    if (typeof window._getEducationLevels === 'undefined') {
        window._getEducationLevels = function() {
            return window.EDUCATION_LEVELS || {};
        };
    }

    if (typeof window._getInstitutionsNeedingTeachers === 'undefined') {
        window._getInstitutionsNeedingTeachers = function(maxReputation, minStudents) {
            if (typeof window.getInstitutionsNeedingTeachers === 'function') {
                return window.getInstitutionsNeedingTeachers(maxReputation, minStudents);
            }
            return [];
        };
    }

    if (typeof window._getTeacherSkillLevelName === 'undefined') {
        window._getTeacherSkillLevelName = function(level) {
            if (typeof window.EducationCommands !== 'undefined' && window.EducationCommands._getTeacherSkillLevelName) {
                return window.EducationCommands._getTeacherSkillLevelName(level);
            }
            if (level >= 91) return 'Master';
            if (level >= 76) return 'Expert';
            if (level >= 51) return 'Journeyman';
            if (level >= 26) return 'Apprentice';
            if (level >= 1) return 'Novice';
            return 'Untrained';
        };
    }

    // =========================================================================
    // 4. MODAL HELPER FUNCTIONS (for UI modals)
    // =========================================================================

    if (typeof window._getIconHTML === 'undefined') {
        window._getIconHTML = function(name, size) {
            var icon = typeof window._getIcon === 'function' ? window._getIcon(name) : '';
            if (!size) size = '1em';
            if (icon) {
                return icon.replace(/width="[^"]*"/, 'width="' + size + '"').replace(/height="[^"]*"/, 'height="' + size + '"');
            }
            return '';
        };
    }

    if (typeof window._getAgeGroupEmoji === 'undefined') {
        window._getAgeGroupEmoji = function(group) {
            if (window.AGE_GROUPS_MAP && window.AGE_GROUPS_MAP[group]) {
                return window.AGE_GROUPS_MAP[group].emoji;
            }
            var emojis = {
                '0-10': '👶', '11-20': '🧑', '21-30': '👨', '31-40': '👨',
                '41-50': '👩', '51-60': '👩', '61-70': '👵', '71-80': '👵',
                '81-90': '🧓', '91+': '👴'
            };
            return emojis[group] || '👤';
        };
    }

    if (typeof window._getLocationTypeName === 'undefined') {
        window._getLocationTypeName = function(typeId) {
            if (typeof window.getLocationTypeName === 'function') {
                return window.getLocationTypeName(typeId);
            }
            var type = typeof window.getLocationTypeById === 'function' ? window.getLocationTypeById(typeId) : null;
            return type ? type.displayName : 'Unknown';
        };
    }

    if (typeof window._getRankById === 'undefined') {
        window._getRankById = function(id) {
            if (typeof window.getRankById === 'function') {
                return window.getRankById(id);
            }
            return null;
        };
    }

    // =========================================================================
    // 5. HISTORY FUNCTIONS (re-export from education-history.js)
    // =========================================================================

    // History functions are already on window from education-history.js
    // Only add if missing

    if (typeof window.addEducationHistoryEvent === 'undefined' && typeof window._addEducationHistoryEvent === 'function') {
        window.addEducationHistoryEvent = window._addEducationHistoryEvent;
    }

    if (typeof window.getInstitutionHistory === 'undefined' && typeof window._getInstitutionHistory === 'function') {
        window.getInstitutionHistory = window._getInstitutionHistory;
    }

    if (typeof window.getFormattedEducationHistory === 'undefined' && typeof window._getFormattedEducationHistory === 'function') {
        window.getFormattedEducationHistory = window._getFormattedEducationHistory;
    }

    if (typeof window.getInstitutionHistoryStats === 'undefined' && typeof window._getInstitutionHistoryStats === 'function') {
        window.getInstitutionHistoryStats = window._getInstitutionHistoryStats;
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            // Constants
            EDUCATION_LEVELS: window.EDUCATION_LEVELS,
            GENERAL_SUBJECTS: window.GENERAL_SUBJECTS,
            HIGHER_SUBJECTS: window.HIGHER_SUBJECTS,
            ALL_SUBJECTS: window.ALL_SUBJECTS,
            INSTITUTION_TYPES: window.INSTITUTION_TYPES,

            // State
            subscribe: window.subscribe,
            getAllEducationalInstitutions: window.getAllEducationalInstitutions,
            getEducationalInstitution: window.getEducationalInstitution,
            getInstitutionsAtLocation: window.getInstitutionsAtLocation,
            getInstitutionsByType: window.getInstitutionsByType,

            // Commands
            createEducationalInstitution: window.createEducationalInstitution,
            updateEducationalInstitution: window.updateEducationalInstitution,
            deleteEducationalInstitution: window.deleteEducationalInstitution,
            updateInstitutionReputation: window.updateInstitutionReputation,
            enrollStudent: window.enrollStudent,
            graduateStudent: window.graduateStudent,
            withdrawStudent: window.withdrawStudent,
            hireTeacher: window.hireTeacher,
            fireTeacher: window.fireTeacher,
            setHeadmaster: window.setHeadmaster,
            endHeadmasterTerm: window.endHeadmasterTerm,
            getInstitutionsNeedingTeachers: window.getInstitutionsNeedingTeachers,

            // Queries
            getInstitutionDetails: window.getInstitutionDetails,
            getInstitutionsInRegion: window.getInstitutionsInRegion,
            getInstitutionStudents: window.getInstitutionStudents,
            getInstitutionGraduates: window.getInstitutionGraduates,
            getInstitutionTeachers: window.getInstitutionTeachers,
            isStudentEnrolled: window.isStudentEnrolled,
            getHeadmaster: window.getHeadmaster,
            getHeadmasterHistory: window.getHeadmasterHistory,
            getInstitutionStatistics: window.getInstitutionStatistics,
            getLocationEducationSummary: window.getLocationEducationSummary,
            getEducationHealthScore: window.getEducationHealthScore,
            recommendNewSchoolLocation: window.recommendNewSchoolLocation,

            // Learning
            advanceLearning: window.advanceLearning,
            getProficiency: window.getProficiency,
            getSubjectProficiency: window.getSubjectProficiency,
            getCharacterProficiencies: window.getCharacterProficiencies,
            getEducationLevel: window.getEducationLevel,
            isLiterate: window.isLiterate,
            getLiteracyRate: window.getLiteracyRate,
            getSchoolAgePopulation: window.getSchoolAgePopulation,
            getEligibleStudents: window.getEligibleStudents,
            getStudentDemand: window.getStudentDemand,

            // Annual
            processAnnualEducation: window.processAnnualEducation,
            processAnnualInstitution: window.processAnnualInstitution,
            getStudentsReadyForGraduation: window.getStudentsReadyForGraduation,

            // History
            addEducationHistoryEvent: window.addEducationHistoryEvent,
            getInstitutionHistory: window.getInstitutionHistory,
            getFormattedEducationHistory: window.getFormattedEducationHistory,
            getInstitutionHistoryStats: window.getInstitutionHistoryStats,
            recordTeacherHired: window.recordTeacherHired,
            recordTeacherLeft: window.recordTeacherLeft,
            getTeacherEmploymentHistory: window.getTeacherEmploymentHistory,
            getFormattedTeacherEmploymentHistory: window.getFormattedTeacherEmploymentHistory,
            recordStudentEnrolled: window.recordStudentEnrolled,
            recordStudentGraduated: window.recordStudentGraduated,
            recordStudentWithdrew: window.recordStudentWithdrew,
            getStudentEducationHistory: window.getStudentEducationHistory,
            getFormattedStudentEducationHistory: window.getFormattedStudentEducationHistory,
            recordHeadmasterAppointed: window.recordHeadmasterAppointed,
            recordHeadmasterEnded: window.recordHeadmasterEnded,
            getCharacterHeadmasterHistory: window.getCharacterHeadmasterHistory,
            recordInstitutionRenamed: window.recordInstitutionRenamed,
            recordInstitutionMoved: window.recordInstitutionMoved,
            recordReputationChanged: window.recordReputationChanged,
            getCharacterEducationHistory: window.getCharacterEducationHistory,
            getFormattedCharacterEducationHistory: window.getFormattedCharacterEducationHistory
        };
    }

})();