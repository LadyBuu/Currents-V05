/**
 * STILL WATERS - EDUCATION SYSTEM (legacy wrapper)
 * Thin compatibility shim. Exposes old global names as aliases to the
 * canonical Education modules. Contains no constants, no fallbacks, no
 * persistence, no business logic, no UI helpers.
 *
 * Every alias is marked // legacy: and can be deleted once its callers
 * have migrated to the canonical module. This file exists to be removed.
 */

(function() {
    'use strict';

    // --- Load-order contract ---
    // All canonical modules must be loaded before this file.
    // If any is missing, we fail immediately and visibly.

    var REQUIRED_MODULES = [
        'EducationState',
        'EducationRules',
        'EducationLearning',
        'EducationQueries',
        'EducationCommands',
        'EducationAnnual',
        'EducationHistory'
    ];

    (function() {
        var missing = [];
        for (var i = 0; i < REQUIRED_MODULES.length; i++) {
            if (typeof window[REQUIRED_MODULES[i]] === 'undefined') {
                missing.push(REQUIRED_MODULES[i]);
            }
        }
        if (missing.length > 0) {
            throw new Error(
                'education-system.js: canonical modules missing: ' + missing.join(', ') +
                '. Load them before education-system.js.'
            );
        }
    })();

    var State     = window.EducationState;
    var Queries   = window.EducationQueries;
    var Commands  = window.EducationCommands;
    var Learning  = window.EducationLearning;
    var Annual    = window.EducationAnnual;
    var History   = window.EducationHistory;

    // --- State / read aliases ---

    // legacy: use EducationState.getAllInstitutions
    window.getAllEducationalInstitutions = State.getAllInstitutions;

    // legacy: use EducationState.getInstitution
    window.getEducationalInstitution = State.getInstitution;

    // legacy: use EducationState.getInstitutionsByLocation
    window.getInstitutionsAtLocation = State.getInstitutionsByLocation;

    // legacy: use EducationState.getInstitutionsByType
    window.getInstitutionsByType = State.getInstitutionsByType;

    // --- Command aliases ---

    // legacy: use EducationCommands.createInstitution
    window.createEducationalInstitution = Commands.createInstitution;

    // legacy: use EducationCommands.updateInstitution
    window.updateEducationalInstitution = Commands.updateInstitution;

    // legacy: use EducationCommands.deleteInstitution
    window.deleteEducationalInstitution = Commands.deleteInstitution;

    // legacy: use EducationCommands.updateReputation
    window.updateInstitutionReputation = Commands.updateReputation;

    // legacy: use EducationCommands.enrollStudent
    window.enrollStudent = Commands.enrollStudent;

    // legacy: use EducationCommands.graduateStudent
    window.graduateStudent = Commands.graduateStudent;

    // legacy: use EducationCommands.withdrawStudent
    window.withdrawStudent = Commands.withdrawStudent;

    // legacy: use EducationCommands.hireTeacher
    window.hireTeacher = Commands.hireTeacher;

    // legacy: use EducationCommands.fireTeacher
    window.fireTeacher = Commands.fireTeacher;

    // legacy: use EducationCommands.setHeadmaster
    window.setHeadmaster = Commands.setHeadmaster;

    // legacy: use EducationCommands.endHeadmasterTerm
    window.endHeadmasterTerm = Commands.endHeadmasterTerm;

    // --- Query aliases ---

    // legacy: use EducationQueries.getInstitutionDetails
    window.getInstitutionDetails = Queries.getInstitutionDetails;

    // legacy: use EducationQueries.getInstitutionsInRegion
    window.getInstitutionsInRegion = Queries.getInstitutionsInRegion;

    // legacy: use EducationQueries.getInstitutionStudents
    window.getInstitutionStudents = Queries.getInstitutionStudents;

    // legacy: use EducationQueries.getInstitutionGraduates
    window.getInstitutionGraduates = Queries.getInstitutionGraduates;

    // legacy: use EducationQueries.getInstitutionTeachers
    window.getInstitutionTeachers = Queries.getInstitutionTeachers;

    // legacy: use EducationQueries.isStudentEnrolled
    window.isStudentEnrolled = Queries.isStudentEnrolled;

    // legacy: use EducationQueries.getHeadmaster
    window.getHeadmaster = Queries.getHeadmaster;

    // legacy: use EducationQueries.getHeadmasterHistory
    window.getHeadmasterHistory = Queries.getHeadmasterHistory;

    // legacy: use EducationQueries.getInstitutionStatistics
    window.getInstitutionStatistics = Queries.getInstitutionStatistics;

    // legacy: use EducationQueries.getLocationEducationSummary
    window.getLocationEducationSummary = Queries.getLocationEducationSummary;

    // legacy: use EducationQueries.getEducationHealthScore
    window.getEducationHealthScore = Queries.getEducationHealthScore;

    // legacy: use EducationQueries.recommendNewSchoolLocations
    window.recommendNewSchoolLocation = Queries.recommendNewSchoolLocations;

    // legacy: use EducationQueries.getInstitutionsNeedingTeachers
    window.getInstitutionsNeedingTeachers = Queries.getInstitutionsNeedingTeachers;

    // --- Learning aliases ---

    // legacy: use EducationCommands.advanceLearning
    window.advanceLearning = Commands.advanceLearning;

    // legacy: use EducationLearning.getProficiency
    window.getProficiency = Learning.getProficiency;

    // legacy: use EducationLearning.getSubjectProficiency
    window.getSubjectProficiency = Learning.getSubjectProficiency;

    // legacy: use EducationLearning.getCharacterProficiencies
    window.getCharacterProficiencies = Learning.getCharacterProficiencies;

    // legacy: use EducationLearning.getEducationLevel
    window.getEducationLevel = Learning.getEducationLevel;

    // legacy: use EducationLearning.isLiterate
    window.isLiterate = Learning.isLiterate;

    // legacy: use EducationQueries.getLiteracyRate
    window.getLiteracyRate = Queries.getLiteracyRate;

    // legacy: use EducationQueries.getSchoolAgePopulation
    window.getSchoolAgePopulation = Queries.getSchoolAgePopulation;

    // legacy: use EducationQueries.getEligibleStudents
    window.getEligibleStudents = Queries.getEligibleStudents;

    // legacy: use EducationQueries.getStudentDemand
    window.getStudentDemand = Queries.getStudentDemand;

    // --- Annual aliases ---

    // legacy: use EducationAnnual.processAnnualEducation
    window.processAnnualEducation = Annual.processAnnualEducation;

    // legacy: use EducationAnnual.processAnnualInstitution
    window.processAnnualInstitution = Annual.processAnnualInstitution;

    // legacy: use EducationQueries.getStudentsReadyForGraduation
    window.getStudentsReadyForGraduation = Queries.getStudentsReadyForGraduation;

    // --- History aliases ---

    // legacy: use EducationHistory.addEvent
    window.addEducationHistoryEvent = History.addEvent;

    // legacy: use EducationHistory.getInstitutionHistory
    window.getInstitutionHistory = History.getInstitutionHistory;

    // legacy: use EducationHistory.getInstitutionHistoryStats
    window.getInstitutionHistoryStats = History.getInstitutionHistoryStats;

    // legacy: use EducationHistory.recordTeacherHired
    window.recordTeacherHired = History.recordTeacherHired;

    // legacy: use EducationHistory.recordTeacherDeparted
    window.recordTeacherDeparted = History.recordTeacherDeparted;

    // legacy: use EducationHistory.recordStudentEnrolled
    window.recordStudentEnrolled = History.recordStudentEnrolled;

    // legacy: use EducationHistory.recordStudentGraduated
    window.recordStudentGraduated = History.recordStudentGraduated;

    // legacy: use EducationHistory.recordStudentWithdrew
    window.recordStudentWithdrew = History.recordStudentWithdrew;

    // legacy: use EducationHistory.recordHeadmasterAppointed
    window.recordHeadmasterAppointed = History.recordHeadmasterAppointed;

    // legacy: use EducationHistory.recordHeadmasterEnded
    window.recordHeadmasterEnded = History.recordHeadmasterEnded;

    // legacy: use EducationHistory.recordInstitutionRenamed
    window.recordInstitutionRenamed = History.recordInstitutionRenamed;

    // legacy: use EducationHistory.recordInstitutionMoved
    window.recordInstitutionMoved = History.recordInstitutionMoved;

    // legacy: use EducationHistory.recordReputationChanged
    window.recordReputationChanged = History.recordReputationChanged;

    // --- Exports for CommonJS ---

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            // Canonical modules re-exported for convenience.
            EducationState: State,
            EducationRules: window.EducationRules,
            EducationLearning: Learning,
            EducationQueries: Queries,
            EducationCommands: Commands,
            EducationAnnual: Annual,
            EducationHistory: History,

            // Legacy alias map.
            getAllEducationalInstitutions: window.getAllEducationalInstitutions,
            getEducationalInstitution: window.getEducationalInstitution,
            getInstitutionsAtLocation: window.getInstitutionsAtLocation,
            getInstitutionsByType: window.getInstitutionsByType,

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
            getInstitutionsNeedingTeachers: window.getInstitutionsNeedingTeachers,

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

            processAnnualEducation: window.processAnnualEducation,
            processAnnualInstitution: window.processAnnualInstitution,
            getStudentsReadyForGraduation: window.getStudentsReadyForGraduation,

            addEducationHistoryEvent: window.addEducationHistoryEvent,
            getInstitutionHistory: window.getInstitutionHistory,
            getInstitutionHistoryStats: window.getInstitutionHistoryStats,
            recordTeacherHired: window.recordTeacherHired,
            recordTeacherDeparted: window.recordTeacherDeparted,
            recordStudentEnrolled: window.recordStudentEnrolled,
            recordStudentGraduated: window.recordStudentGraduated,
            recordStudentWithdrew: window.recordStudentWithdrew,
            recordHeadmasterAppointed: window.recordHeadmasterAppointed,
            recordHeadmasterEnded: window.recordHeadmasterEnded,
            recordInstitutionRenamed: window.recordInstitutionRenamed,
            recordInstitutionMoved: window.recordInstitutionMoved,
            recordReputationChanged: window.recordReputationChanged
        };
    }
})();
