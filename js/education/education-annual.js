/**
 * =============================================================================
 * STILL WATERS - EDUCATION ANNUAL (education-annual.js)
 * =============================================================================
 * 
 * This file contains annual processing for education:
 * - Student skill advancement
 * - Graduation checks
 * - Enrollment age checks
 * 
 * DEPENDENCIES:
 *   - education-state.js (EducationState)
 *   - education-commands.js (EducationCommands)
 *   - education-learning.js (EducationLearning)
 *   - accessors.js (getCharacterById)
 *   - time.js (getCurrentYearSafe)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARDS
    // =========================================================================

    var _processingAnnual = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        if (typeof window.getCurrentYear === 'function') {
            return window.getCurrentYear();
        }
        return 1250;
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(message, type);
        }
    }

    // =========================================================================
    // 3. ANNUAL PROCESSING
    // =========================================================================

    function processAnnualEducation(year, options) {
        if (_processingAnnual) {
            return { graduations: [], skillGains: [] };
        }
        _processingAnnual = true;

        try {
            options = options || {};
            var silent = options.silent === true;

            var institutions = EducationState.getAllInstitutions();
            var results = {
                graduations: [],
                skillGains: [],
                year: year || _getCurrentYear(),
                processedCount: 0
            };

            if (!institutions || institutions.length === 0) {
                return results;
            }

            var currentYear = year || _getCurrentYear();

            for (var i = 0; i < institutions.length; i++) {
                var institution = institutions[i];
                if (!institution.students || institution.students.length === 0) continue;

                var skillGainPerYear = institution.skillGainPerYear || 10;
                var students = institution.students.slice();

                for (var j = 0; j < students.length; j++) {
                    var studentRecord = students[j];
                    var student = _getCharacterById(studentRecord.studentId);

                    if (!student || student.isDeceased) {
                        if (typeof window.withdrawStudent === 'function') {
                            window.withdrawStudent(institution.id, studentRecord.studentId, 'Student deceased');
                        }
                        continue;
                    }

                    var yearsEnrolled = currentYear - studentRecord.enrollmentYear;
                    if (yearsEnrolled < 1) continue;

                    var gainAmount = skillGainPerYear;

                    if (institution.curriculum) {
                        for (var k = 0; k < institution.curriculum.length; k++) {
                            var curriculumItem = institution.curriculum[k];
                            var currentSkill = getProficiency(student.id, curriculumItem);
                            if (currentSkill >= 100) continue;

                            var result = advanceLearning(student.id, curriculumItem, gainAmount);
                            if (result && result.increased > 0) {
                                results.skillGains.push({
                                    studentName: student.name,
                                    studentId: student.id,
                                    institutionName: institution.name,
                                    institutionId: institution.id,
                                    subject: curriculumItem.name,
                                    gain: result.increased,
                                    newLevel: result.newLevel,
                                    yearsEnrolled: yearsEnrolled
                                });
                            }
                        }
                    }

                    var allMastered = true;
                    if (institution.curriculum) {
                        for (var k = 0; k < institution.curriculum.length; k++) {
                            var skill = getProficiency(student.id, institution.curriculum[k]);
                            if (skill < 90) {
                                allMastered = false;
                                break;
                            }
                        }
                    }

                    var minYears = institution.requiredYears || 3;
                    var hasEnoughYears = yearsEnrolled >= minYears;

                    if (allMastered && hasEnoughYears && !studentRecord.graduated) {
                        if (typeof window.graduateStudent === 'function') {
                            var success = window.graduateStudent(institution.id, student.id, currentYear);
                            if (success) {
                                results.graduations.push({
                                    studentName: student.name,
                                    studentId: student.id,
                                    institutionName: institution.name,
                                    institutionId: institution.id,
                                    year: currentYear,
                                    yearsEnrolled: yearsEnrolled
                                });
                            }
                        }
                    }

                    results.processedCount++;
                }
            }

            _saveMasterData();

            var messages = [];
            if (results.graduations.length > 0) {
                messages.push(results.graduations.length + ' students graduated');
            }
            if (results.skillGains.length > 0) {
                messages.push(results.skillGains.length + ' skill gains');
            }

            if (messages.length > 0 && !silent) {
                _showToast('Education Year ' + currentYear + ': ' + messages.join(', '), 'info');
            }

            return results;

        } finally {
            _processingAnnual = false;
        }
    }

    function processAnnualInstitution(institutionId, year) {
        if (_processingAnnual) {
            return { graduations: [], skillGains: [] };
        }
        _processingAnnual = true;

        try {
            var institution = EducationState.getInstitution(institutionId);
            if (!institution) {
                return { graduations: [], skillGains: [] };
            }

            var currentYear = year || _getCurrentYear();
            var results = {
                institutionId: institutionId,
                institutionName: institution.name,
                graduations: [],
                skillGains: [],
                processedCount: 0
            };

            if (!institution.students || institution.students.length === 0) {
                return results;
            }

            var skillGainPerYear = institution.skillGainPerYear || 10;
            var students = institution.students.slice();

            for (var j = 0; j < students.length; j++) {
                var studentRecord = students[j];
                var student = _getCharacterById(studentRecord.studentId);

                if (!student || student.isDeceased) {
                    if (typeof window.withdrawStudent === 'function') {
                        window.withdrawStudent(institutionId, studentRecord.studentId, 'Student deceased');
                    }
                    continue;
                }

                var yearsEnrolled = currentYear - studentRecord.enrollmentYear;
                if (yearsEnrolled < 1) continue;

                var gainAmount = skillGainPerYear;

                if (institution.curriculum) {
                    for (var k = 0; k < institution.curriculum.length; k++) {
                        var curriculumItem = institution.curriculum[k];
                        var currentSkill = getProficiency(student.id, curriculumItem);
                        if (currentSkill >= 100) continue;

                        var result = advanceLearning(student.id, curriculumItem, gainAmount);
                        if (result && result.increased > 0) {
                            results.skillGains.push({
                                studentName: student.name,
                                studentId: student.id,
                                subject: curriculumItem.name,
                                gain: result.increased,
                                newLevel: result.newLevel,
                                yearsEnrolled: yearsEnrolled
                            });
                        }
                    }
                }

                var allMastered = true;
                if (institution.curriculum) {
                    for (var k = 0; k < institution.curriculum.length; k++) {
                        var skill = getProficiency(student.id, institution.curriculum[k]);
                        if (skill < 90) {
                            allMastered = false;
                            break;
                        }
                    }
                }

                var minYears = institution.requiredYears || 3;
                var hasEnoughYears = yearsEnrolled >= minYears;

                if (allMastered && hasEnoughYears && !studentRecord.graduated) {
                    if (typeof window.graduateStudent === 'function') {
                        var success = window.graduateStudent(institutionId, student.id, currentYear);
                        if (success) {
                            results.graduations.push({
                                studentName: student.name,
                                studentId: student.id,
                                year: currentYear,
                                yearsEnrolled: yearsEnrolled
                            });
                        }
                    }
                }

                results.processedCount++;
            }

            _saveMasterData();
            return results;

        } finally {
            _processingAnnual = false;
        }
    }

    function getStudentsReadyForGraduation(institutionId, year) {
        if (_processingAnnual) {
            return [];
        }
        _processingAnnual = true;

        try {
            var institution = EducationState.getInstitution(institutionId);
            if (!institution || !institution.students) return [];

            var currentYear = year || _getCurrentYear();
            var ready = [];

            for (var i = 0; i < institution.students.length; i++) {
                var studentRecord = institution.students[i];
                if (studentRecord.graduated) continue;

                var student = _getCharacterById(studentRecord.studentId);
                if (!student || student.isDeceased) continue;

                var yearsEnrolled = currentYear - studentRecord.enrollmentYear;
                var minYears = institution.requiredYears || 3;

                if (yearsEnrolled < minYears) continue;

                var allMastered = true;
                if (institution.curriculum) {
                    for (var j = 0; j < institution.curriculum.length; j++) {
                        var skill = getProficiency(student.id, institution.curriculum[j]);
                        if (skill < 90) {
                            allMastered = false;
                            break;
                        }
                    }
                }

                if (allMastered) {
                    ready.push({
                        student: student,
                        record: studentRecord,
                        yearsEnrolled: yearsEnrolled,
                        proficiencies: getCharacterProficiencies(student.id)
                    });
                }
            }

            return ready;

        } finally {
            _processingAnnual = false;
        }
    }

    // =========================================================================
    // 4. EXPORTS
    // =========================================================================

    window.EducationAnnual = {
        processAnnualEducation: processAnnualEducation,
        processAnnualInstitution: processAnnualInstitution,
        getStudentsReadyForGraduation: getStudentsReadyForGraduation
    };

    // Legacy aliases
    window._processAnnualEducation = processAnnualEducation;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            processAnnualEducation: processAnnualEducation,
            processAnnualInstitution: processAnnualInstitution,
            getStudentsReadyForGraduation: getStudentsReadyForGraduation
        };
    }

})();