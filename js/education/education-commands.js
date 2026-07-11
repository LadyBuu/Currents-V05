/**
 * =============================================================================
 * STILL WATERS - EDUCATION COMMANDS (education-commands.js)
 * =============================================================================
 * 
 * This file contains ALL write operations for education:
 * - Institution CRUD
 * - Teacher management
 * - Student management
 * - Headmaster management
 * - Reputation management
 * - Institutions needing teachers
 * 
 * DEPENDENCIES:
 *   - education-state.js (EducationState)
 *   - education-constants.js (INSTITUTION_TYPES, EDUCATION_LEVELS)
 *   - education-history.js (recordTeacherHired, recordTeacherLeft, etc.)
 *   - accessors.js (getCharacterById, getCharacters, getPlaceById)
 *   - ids.js (generateId)
 *   - time.js (getCurrentYearSafe)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARDS
    // =========================================================================

    var _processingCommand = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        return [];
    }

    function _getRoleById(id) {
        if (typeof window.getRoleById === 'function') {
            return window.getRoleById(id);
        }
        return null;
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
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

    function _generateId(prefix) {
        if (typeof window.generateId === 'function') {
            return window.generateId(prefix);
        }
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
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

    function _recordTeacherHired(institutionId, teacherId, subjectId, year, skill, notes) {
        if (typeof window.recordTeacherHired === 'function') {
            return window.recordTeacherHired(institutionId, teacherId, subjectId, year, skill, notes);
        }
        return false;
    }

    function _recordTeacherLeft(institutionId, teacherId, year, reason, notes) {
        if (typeof window.recordTeacherLeft === 'function') {
            return window.recordTeacherLeft(institutionId, teacherId, year, reason, notes);
        }
        return false;
    }

    function _recordStudentEnrolled(institutionId, studentId, year, notes) {
        if (typeof window.recordStudentEnrolled === 'function') {
            return window.recordStudentEnrolled(institutionId, studentId, year, notes);
        }
        return false;
    }

    function _recordStudentGraduated(institutionId, studentId, year, notes) {
        if (typeof window.recordStudentGraduated === 'function') {
            return window.recordStudentGraduated(institutionId, studentId, year, notes);
        }
        return false;
    }

    function _recordStudentWithdrew(institutionId, studentId, year, reason, notes) {
        if (typeof window.recordStudentWithdrew === 'function') {
            return window.recordStudentWithdrew(institutionId, studentId, year, reason, notes);
        }
        return false;
    }

    function _recordHeadmasterAppointed(institutionId, characterId, title, year, notes) {
        if (typeof window.recordHeadmasterAppointed === 'function') {
            return window.recordHeadmasterAppointed(institutionId, characterId, title, year, notes);
        }
        return false;
    }

    function _recordHeadmasterEnded(institutionId, characterId, year, reason, notes) {
        if (typeof window.recordHeadmasterEnded === 'function') {
            return window.recordHeadmasterEnded(institutionId, characterId, year, reason, notes);
        }
        return false;
    }

    function _recordInstitutionRenamed(institutionId, oldName, newName, year, reason) {
        if (typeof window.recordInstitutionRenamed === 'function') {
            return window.recordInstitutionRenamed(institutionId, oldName, newName, year, reason);
        }
        return false;
    }

    function _getInstitutionTypes() {
        if (typeof window.INSTITUTION_TYPES !== 'undefined') {
            return window.INSTITUTION_TYPES;
        }
        return {};
    }

    // =========================================================================
    // 3. INSTITUTION MANAGEMENT
    // =========================================================================

    function createInstitution(name, typeId, locationId, options) {
        if (_processingCommand) {
            return null;
        }
        _processingCommand = true;

        try {
            options = options || {};

            if (!name || typeof name !== 'string' || name.trim() === '') {
                _showToast('Institution name is required', 'error');
                return null;
            }

            var types = _getInstitutionTypes();
            var type = types[typeId.toUpperCase()];
            if (!type) {
                _showToast('Invalid institution type', 'error');
                return null;
            }

            var location = _getPlaceById(locationId);
            if (!location) {
                _showToast('Location not found', 'error');
                return null;
            }

            var currentYear = _getCurrentYear();

            var curriculum = options.curriculum || [
                { type: 'subject', id: 'literacy', name: 'Literacy', icon: '⌇', baseLearnRate: 15 },
                { type: 'subject', id: 'basic_math', name: 'Basic Mathematics', icon: '⌇', baseLearnRate: 10 }
            ];

            var institution = {
                id: _generateId('edu'),
                name: name.trim(),
                type: type.id,
                typeName: type.name,
                icon: type.icon,
                locationId: locationId,
                locationName: location.displayName,
                students: [],
                graduates: [],
                teachers: [],
                foundedYear: options.foundedYear || currentYear,
                curriculum: curriculum,
                taughtRoles: options.taughtRoles || [],
                isSpecialized: options.isSpecialized || false,
                costPerYear: type.costPerYear,
                reputation: options.reputation !== undefined ? options.reputation : type.baseReputation,
                maxStudents: options.maxStudents || type.maxStudents,
                description: options.description || type.description,
                requiredYears: options.requiredYears || type.requiredYears,
                skillGainPerYear: options.skillGainPerYear || type.skillGainPerYear,
                requiredTeacherSkill: type.requiredTeacherSkill,
                notes: options.notes || '',
                headmaster: options.headmaster || null,
                headmasterHistory: options.headmasterHistory || [],
                history: options.history || []
            };

            var result = EducationState._addInstitution(institution);

            _logEvent('education', 'Institution Founded',
                institution.name + ' (' + type.name + ') founded in ' + location.displayName,
                []);

            _showToast('Created institution: ' + institution.name, 'success');
            return result;

        } finally {
            _processingCommand = false;
        }
    }

    function updateInstitution(institutionId, updates) {
        if (_processingCommand) {
            return false;
        }
        _processingCommand = true;

        try {
            var institution = EducationState.getInstitution(institutionId);
            if (!institution) {
                _showToast('Institution not found', 'error');
                return false;
            }

            if (updates.name !== undefined && updates.name !== institution.name) {
                var oldName = institution.name;
                _recordInstitutionRenamed(institutionId, oldName, updates.name, _getCurrentYear(), 'Renamed');
            }

            if (updates.locationId !== undefined && updates.locationId !== institution.locationId) {
                var location = _getPlaceById(updates.locationId);
                if (location) {
                    updates.locationName = location.displayName;
                }
            }

            if (updates.type !== undefined && updates.type !== institution.type) {
                var types = _getInstitutionTypes();
                var type = types[updates.type.toUpperCase()];
                if (type) {
                    updates.typeName = type.name;
                    updates.icon = type.icon;
                }
            }

            var result = EducationState._updateInstitution(institutionId, updates);

            if (result) {
                _showToast('Institution updated: ' + result.name, 'success');
                return true;
            }

            return false;

        } finally {
            _processingCommand = false;
        }
    }

    function deleteInstitution(institutionId, cascade) {
        if (_processingCommand) {
            return false;
        }
        _processingCommand = true;

        try {
            var institution = EducationState.getInstitution(institutionId);
            if (!institution) {
                _showToast('Institution not found', 'error');
                return false;
            }

            if (cascade) {
                var characters = _getCharacters();
                for (var i = 0; i < characters.length; i++) {
                    var char = characters[i];
                    if (char.education && char.education[institutionId]) {
                        delete char.education[institutionId];
                    }
                    if (char.educationHistory) {
                        char.educationHistory = char.educationHistory.filter(function(h) {
                            return h.institutionId !== institutionId;
                        });
                    }
                }
            }

            var result = EducationState._deleteInstitution(institutionId);

            if (result) {
                _logEvent('education', 'Institution Deleted', 'Deleted institution: ' + institution.name, []);
                _showToast('Deleted institution: ' + institution.name, 'info');
                return true;
            }

            return false;

        } finally {
            _processingCommand = false;
        }
    }

    function updateReputation(institutionId, delta) {
        if (_processingCommand) {
            return 0;
        }
        _processingCommand = true;

        try {
            var institution = EducationState.getInstitution(institutionId);
            if (!institution) return 0;

            var oldReputation = institution.reputation || 50;
            var newReputation = Math.min(100, Math.max(0, oldReputation + delta));

            EducationState._updateInstitution(institutionId, { reputation: newReputation });

            if (typeof window.recordReputationChanged === 'function') {
                window.recordReputationChanged(institutionId, oldReputation, newReputation, _getCurrentYear(), 'Manual adjustment');
            }

            return newReputation;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 4. TEACHER MANAGEMENT
    // =========================================================================

    function hireTeacher(institutionId, teacherId, subjectId, skill) {
        if (_processingCommand) {
            return false;
        }
        _processingCommand = true;

        try {
            var institution = EducationState.getInstitution(institutionId);
            var teacher = _getCharacterById(teacherId);
            var types = _getInstitutionTypes();

            if (!institution || !teacher) {
                _showToast('Institution or teacher not found', 'error');
                return false;
            }

            if (institution.teachers && institution.teachers.some(function(t) { return t.teacherId === teacherId; })) {
                _showToast(teacher.name + ' is already a teacher at this institution', 'error');
                return false;
            }

            var curriculumItem = null;
            if (institution.curriculum) {
                for (var i = 0; i < institution.curriculum.length; i++) {
                    if (institution.curriculum[i].id === subjectId) {
                        curriculumItem = institution.curriculum[i];
                        break;
                    }
                }
            }

            if (!curriculumItem) {
                _showToast('Subject "' + subjectId + '" not found in curriculum', 'error');
                return false;
            }

            var requiredSkill = institution.requiredTeacherSkill || 51;
            var teacherSkill = skill || 50;

            if (curriculumItem.type === 'role') {
                var hasProfession = false;
                if (teacher.professions) {
                    for (var i = 0; i < teacher.professions.length; i++) {
                        if (teacher.professions[i].id === subjectId) {
                            hasProfession = true;
                            teacherSkill = teacher.professions[i].skillLevel || 0;
                            break;
                        }
                    }
                }

                if (!hasProfession) {
                    _showToast(teacher.name + ' does not have the profession "' + curriculumItem.name + '"', 'error');
                    return false;
                }

                if (teacherSkill < requiredSkill) {
                    _showToast(teacher.name + ' has only ' + teacherSkill + ' skill in ' + curriculumItem.name + '. Need ' + requiredSkill + '+', 'error');
                    return false;
                }
            }

            if (!institution.teachers) institution.teachers = [];

            var teacherEntry = {
                teacherId: teacherId,
                teacherName: teacher.name,
                subjectId: subjectId,
                subjectName: curriculumItem.name,
                subjectType: curriculumItem.type,
                skill: Math.min(100, Math.max(0, teacherSkill)),
                hiredYear: _getCurrentYear()
            };

            institution.teachers.push(teacherEntry);
            EducationState._updateInstitution(institutionId, { teachers: institution.teachers });

            _logEvent('education', 'Teacher Hired',
                teacher.name + ' hired as ' + curriculumItem.name + ' teacher at ' + institution.name,
                [teacher]);

            _recordTeacherHired(institutionId, teacherId, subjectId, _getCurrentYear(), teacherSkill);

            _showToast(teacher.name + ' hired as ' + curriculumItem.name + ' teacher', 'success');
            return true;

        } finally {
            _processingCommand = false;
        }
    }

    function fireTeacher(institutionId, teacherId, reason) {
        if (_processingCommand) {
            return false;
        }
        _processingCommand = true;

        try {
            var institution = EducationState.getInstitution(institutionId);
            if (!institution || !institution.teachers) {
                _showToast('Institution not found', 'error');
                return false;
            }

            var index = -1;
            var teacherEntry = null;
            for (var i = 0; i < institution.teachers.length; i++) {
                if (institution.teachers[i].teacherId === teacherId) {
                    index = i;
                    teacherEntry = institution.teachers[i];
                    break;
                }
            }

            if (index === -1) {
                _showToast('Teacher not found', 'error');
                return false;
            }

            institution.teachers.splice(index, 1);
            EducationState._updateInstitution(institutionId, { teachers: institution.teachers });

            _logEvent('education', 'Teacher Fired',
                teacherEntry.teacherName + ' fired from ' + institution.name,
                []);

            _recordTeacherLeft(institutionId, teacherId, _getCurrentYear(), reason || 'Fired');

            _showToast(teacherEntry.teacherName + ' fired from ' + institution.name, 'info');
            return true;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 5. STUDENT MANAGEMENT
    // =========================================================================

    function enrollStudent(institutionId, studentId, startYear) {
        if (_processingCommand) {
            return false;
        }
        _processingCommand = true;

        try {
            var institution = EducationState.getInstitution(institutionId);
            var student = _getCharacterById(studentId);

            if (!institution || !student) {
                _showToast('Institution or student not found', 'error');
                return false;
            }

            if (student.isDeceased) {
                _showToast('Student is deceased', 'error');
                return false;
            }

            if (institution.students && institution.students.length >= institution.maxStudents) {
                _showToast(institution.name + ' is at capacity', 'error');
                return false;
            }

            if (institution.students && institution.students.some(function(s) { return s.studentId === studentId; })) {
                _showToast('Student already enrolled', 'error');
                return false;
            }

            if (!institution.students) institution.students = [];

            var enrollmentYear = startYear || _getCurrentYear();

            institution.students.push({
                studentId: studentId,
                studentName: student.name,
                enrollmentYear: enrollmentYear,
                progress: {},
                graduated: false,
                graduationYear: null,
                attendance: 100,
                notes: ''
            });

            EducationState._updateInstitution(institutionId, { students: institution.students });

            if (typeof window._initCharacterEducationFields === 'function') {
                window._initCharacterEducationFields(student);
            }

            if (student.education) {
                student.education[institutionId] = {
                    institutionName: institution.name,
                    institutionType: institution.type,
                    enrolledYear: enrollmentYear,
                    graduated: false
                };
            }

            _logEvent('education', 'Student Enrolled',
                student.name + ' enrolled at ' + institution.name,
                [student]);

            _recordStudentEnrolled(institutionId, studentId, enrollmentYear);

            _showToast(student.name + ' enrolled', 'success');
            return true;

        } finally {
            _processingCommand = false;
        }
    }

    function graduateStudent(institutionId, studentId, graduationYear) {
        if (_processingCommand) {
            return false;
        }
        _processingCommand = true;

        try {
            var institution = EducationState.getInstitution(institutionId);
            if (!institution || !institution.students) {
                _showToast('Institution not found', 'error');
                return false;
            }

            var index = -1;
            var studentRecord = null;
            for (var i = 0; i < institution.students.length; i++) {
                if (institution.students[i].studentId === studentId) {
                    index = i;
                    studentRecord = institution.students[i];
                    break;
                }
            }

            if (index === -1) {
                _showToast('Student not found', 'error');
                return false;
            }

            if (studentRecord.graduated) {
                _showToast('Student already graduated', 'error');
                return false;
            }

            var gradYear = graduationYear || _getCurrentYear();

            studentRecord.graduated = true;
            studentRecord.graduationYear = gradYear;

            if (!institution.graduates) institution.graduates = [];
            institution.graduates.push({
                studentId: studentId,
                studentName: studentRecord.studentName,
                graduationYear: gradYear
            });

            institution.students.splice(index, 1);

            EducationState._updateInstitution(institutionId, {
                students: institution.students,
                graduates: institution.graduates
            });

            var student = _getCharacterById(studentId);
            if (student && student.education && student.education[institutionId]) {
                student.education[institutionId].graduated = true;
                student.education[institutionId].graduationYear = gradYear;

                if (institution.isSpecialized && institution.taughtRoles && institution.taughtRoles.length > 0) {
                    for (var i = 0; i < institution.taughtRoles.length; i++) {
                        var roleId = institution.taughtRoles[i];
                        var existingProf = null;
                        if (student.professions) {
                            for (var j = 0; j < student.professions.length; j++) {
                                if (student.professions[j].id === roleId) {
                                    existingProf = student.professions[j];
                                    break;
                                }
                            }
                        }

                        if (!existingProf && typeof window.addProfession === 'function') {
                            window.addProfession(studentId, roleId, {
                                skillLevel: 100,
                                startYear: studentRecord.enrollmentYear,
                                learnedVia: 'institution',
                                institutionId: institutionId,
                                notes: 'Graduated from ' + institution.name
                            });
                        } else if (existingProf && typeof window.updateProfessionSkill === 'function') {
                            window.updateProfessionSkill(studentId, roleId, 100);
                        }
                    }
                }

                if (institution.curriculum && student.subjectProgress) {
                    for (var i = 0; i < institution.curriculum.length; i++) {
                        var item = institution.curriculum[i];
                        var key = item.type === 'role' ? 'role_' + item.id : item.id;
                        if (student.subjectProgress[key]) {
                            student.subjectProgress[key].level = 100;
                        }
                    }
                }

                if (!student.educationHistory) student.educationHistory = [];
                student.educationHistory.push({
                    institutionId: institutionId,
                    institutionName: institution.name,
                    institutionType: institution.type,
                    enrolledYear: studentRecord.enrollmentYear,
                    graduationYear: gradYear,
                    curriculum: institution.curriculum ? institution.curriculum.map(function(c) { return c.name; }) : []
                });
            }

            updateReputation(institutionId, 2);

            _logEvent('education', 'Student Graduated',
                studentRecord.studentName + ' graduated from ' + institution.name,
                [student]);

            _recordStudentGraduated(institutionId, studentId, gradYear);

            _showToast(studentRecord.studentName + ' graduated!', 'success');
            return true;

        } finally {
            _processingCommand = false;
        }
    }

    function withdrawStudent(institutionId, studentId, reason) {
        if (_processingCommand) {
            return false;
        }
        _processingCommand = true;

        try {
            var institution = EducationState.getInstitution(institutionId);
            if (!institution || !institution.students) {
                _showToast('Institution not found', 'error');
                return false;
            }

            var index = -1;
            var studentRecord = null;
            for (var i = 0; i < institution.students.length; i++) {
                if (institution.students[i].studentId === studentId) {
                    index = i;
                    studentRecord = institution.students[i];
                    break;
                }
            }

            if (index === -1) {
                _showToast('Student not found', 'error');
                return false;
            }

            institution.students.splice(index, 1);
            EducationState._updateInstitution(institutionId, { students: institution.students });

            var student = _getCharacterById(studentId);
            if (student && student.education && student.education[institutionId]) {
                student.education[institutionId].withdrawn = true;
                student.education[institutionId].withdrawnReason = reason || 'Withdrew';
                student.education[institutionId].withdrawnYear = _getCurrentYear();
            }

            updateReputation(institutionId, -1);

            _recordStudentWithdrew(institutionId, studentId, _getCurrentYear(), reason || 'Withdrew');

            _showToast((student ? student.name : 'Student') + ' withdrew', 'info');
            return true;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 6. HEADMASTER MANAGEMENT
    // =========================================================================

    function setHeadmaster(institutionId, characterId, title, startYear) {
        if (_processingCommand) {
            return false;
        }
        _processingCommand = true;

        try {
            var institution = EducationState.getInstitution(institutionId);
            var character = _getCharacterById(characterId);

            if (!institution || !character) {
                _showToast('Institution or character not found', 'error');
                return false;
            }

            if (institution.headmaster && institution.headmaster.characterId !== characterId) {
                if (!institution.headmasterHistory) institution.headmasterHistory = [];
                institution.headmasterHistory.push({
                    characterId: institution.headmaster.characterId,
                    name: institution.headmaster.name,
                    title: institution.headmaster.title,
                    startYear: institution.headmaster.startYear,
                    endYear: (startYear || _getCurrentYear()) - 1,
                    reason: 'Replaced'
                });
            }

            var appointmentYear = startYear || _getCurrentYear();

            institution.headmaster = {
                characterId: characterId,
                name: character.name,
                title: title || 'Headmaster',
                startYear: appointmentYear
            };

            EducationState._updateInstitution(institutionId, {
                headmaster: institution.headmaster,
                headmasterHistory: institution.headmasterHistory
            });

            _logEvent('education', 'Headmaster Appointed',
                character.name + ' appointed as ' + (title || 'Headmaster') + ' of ' + institution.name,
                [character]);

            _recordHeadmasterAppointed(institutionId, characterId, title || 'Headmaster', appointmentYear);

            _showToast(character.name + ' appointed as ' + (title || 'Headmaster'), 'success');
            return true;

        } finally {
            _processingCommand = false;
        }
    }

    function endHeadmasterTerm(institutionId, endYear, reason) {
        if (_processingCommand) {
            return false;
        }
        _processingCommand = true;

        try {
            var institution = EducationState.getInstitution(institutionId);
            if (!institution || !institution.headmaster) {
                _showToast('No headmaster to remove', 'error');
                return false;
            }

            if (!institution.headmasterHistory) institution.headmasterHistory = [];

            var endYearValue = endYear || _getCurrentYear();

            institution.headmasterHistory.push({
                characterId: institution.headmaster.characterId,
                name: institution.headmaster.name,
                title: institution.headmaster.title,
                startYear: institution.headmaster.startYear,
                endYear: endYearValue,
                reason: reason || 'Term ended'
            });

            var formerHeadmaster = institution.headmaster;
            institution.headmaster = null;

            EducationState._updateInstitution(institutionId, {
                headmaster: institution.headmaster,
                headmasterHistory: institution.headmasterHistory
            });

            _logEvent('education', 'Headmaster Term Ended',
                formerHeadmaster.name + ' ended their term as ' + formerHeadmaster.title + ' of ' + institution.name,
                []);

            _recordHeadmasterEnded(institutionId, formerHeadmaster.characterId, endYearValue, reason || 'Term ended');

            _showToast(formerHeadmaster.name + "'s term ended", 'info');
            return true;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 7. INSTITUTIONS NEEDING TEACHERS
    // =========================================================================

    function getInstitutionsNeedingTeachers(maxReputation, minStudents) {
        if (_processingCommand) {
            return [];
        }
        _processingCommand = true;

        try {
            maxReputation = maxReputation || 70;
            minStudents = minStudents || 0;

            var institutions = EducationState.getAllInstitutions();
            var needing = [];

            for (var i = 0; i < institutions.length; i++) {
                var inst = institutions[i];
                if (inst.reputation > maxReputation) continue;
                if (minStudents > 0 && (inst.students?.length || 0) < minStudents) continue;

                var subjectsTaught = {};
                if (inst.teachers) {
                    for (var j = 0; j < inst.teachers.length; j++) {
                        subjectsTaught[inst.teachers[j].subjectId] = true;
                    }
                }

                var curriculumSubjects = inst.curriculum || [];
                var missingSubjects = [];
                for (var j = 0; j < curriculumSubjects.length; j++) {
                    if (!subjectsTaught[curriculumSubjects[j].id]) {
                        missingSubjects.push(curriculumSubjects[j]);
                    }
                }

                if (missingSubjects.length > 0) {
                    needing.push({
                        institution: inst,
                        missingSubjects: missingSubjects,
                        teacherCount: inst.teachers ? inst.teachers.length : 0,
                        studentCount: inst.students ? inst.students.length : 0,
                        teacherStudentRatio: (inst.students?.length || 0) / Math.max(1, inst.teachers?.length || 0),
                        priority: Math.floor((100 - inst.reputation) / 10)
                    });
                }
            }

            needing.sort(function(a, b) {
                return b.priority - a.priority || b.missingSubjects.length - a.missingSubjects.length;
            });

            return needing;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 8. TEACHER SKILL LEVEL NAME
    // =========================================================================

    function _getTeacherSkillLevelName(level) {
        if (level >= 91) return 'Master';
        if (level >= 76) return 'Expert';
        if (level >= 51) return 'Journeyman';
        if (level >= 26) return 'Apprentice';
        if (level >= 1) return 'Novice';
        return 'Untrained';
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.EducationCommands = {
        createInstitution: createInstitution,
        updateInstitution: updateInstitution,
        deleteInstitution: deleteInstitution,
        updateReputation: updateReputation,
        hireTeacher: hireTeacher,
        fireTeacher: fireTeacher,
        enrollStudent: enrollStudent,
        graduateStudent: graduateStudent,
        withdrawStudent: withdrawStudent,
        setHeadmaster: setHeadmaster,
        endHeadmasterTerm: endHeadmasterTerm,
        getInstitutionsNeedingTeachers: getInstitutionsNeedingTeachers,
        _getTeacherSkillLevelName: _getTeacherSkillLevelName
    };

    // Legacy aliases
    window._createEducationalInstitution = createInstitution;
    window._updateEducationalInstitution = updateInstitution;
    window._deleteEducationalInstitution = deleteInstitution;
    window._updateInstitutionReputation = updateReputation;
    window._hireTeacher = hireTeacher;
    window._fireTeacher = fireTeacher;
    window._enrollStudent = enrollStudent;
    window._graduateStudent = graduateStudent;
    window._withdrawStudent = withdrawStudent;
    window._setHeadmaster = setHeadmaster;
    window._endHeadmasterTerm = endHeadmasterTerm;
    window._getInstitutionsNeedingTeachers = getInstitutionsNeedingTeachers;
    window._getTeacherSkillLevelName = _getTeacherSkillLevelName;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            createInstitution: createInstitution,
            updateInstitution: updateInstitution,
            deleteInstitution: deleteInstitution,
            updateReputation: updateReputation,
            hireTeacher: hireTeacher,
            fireTeacher: fireTeacher,
            enrollStudent: enrollStudent,
            graduateStudent: graduateStudent,
            withdrawStudent: withdrawStudent,
            setHeadmaster: setHeadmaster,
            endHeadmasterTerm: endHeadmasterTerm,
            getInstitutionsNeedingTeachers: getInstitutionsNeedingTeachers,
            _getTeacherSkillLevelName: _getTeacherSkillLevelName
        };
    }

})();