/**
 * =============================================================================
 * STILL WATERS - EDUCATION HISTORY (education-history.js)
 * =============================================================================
 * 
 * This file tracks historical events for educational institutions:
 * - Teacher appointments and departures
 * - Student enrollments, graduations, and withdrawals
 * - Headmaster appointments and term endings
 * - Institution name changes, location changes
 * - Reputation changes over time
 * 
 * DEPENDENCIES:
 *   - accessors.js (getCharacterById, getEducationalInstitution)
 *   - storage.js (saveMasterData)
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

    var _processingHistory = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getEducationalInstitution(id) {
        if (typeof window.getEducationalInstitution === 'function') {
            return window.getEducationalInstitution(id);
        }
        if (typeof window.EducationState !== 'undefined') {
            return window.EducationState.getInstitution(id);
        }
        return null;
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    function _getAllEducationalInstitutions() {
        if (typeof window.getAllEducationalInstitutions === 'function') {
            return window.getAllEducationalInstitutions();
        }
        if (typeof window.EducationState !== 'undefined') {
            return window.EducationState.getAllInstitutions();
        }
        return [];
    }

    function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    function _generateId(prefix) {
        if (typeof window.generateId === 'function') {
            return window.generateId(prefix);
        }
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(str);
        }
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // =========================================================================
    // 3. INSTITUTION HISTORY
    // =========================================================================

    function _initInstitutionHistory(institution) {
        if (!institution) return institution;
        if (!institution.history) institution.history = [];
        if (!institution.historyEvents) institution.historyEvents = [];
        return institution;
    }

    function addEducationHistoryEvent(institutionId, event) {
        if (_processingHistory) {
            return false;
        }
        _processingHistory = true;

        try {
            var institution = _getEducationalInstitution(institutionId);
            if (!institution) return false;

            _initInstitutionHistory(institution);

            var eventRecord = {
                id: _generateId('edu_evt'),
                type: event.type || 'unknown',
                year: event.year || _getCurrentYear(),
                entityId: event.entityId || null,
                entityName: event.entityName || null,
                details: event.details || '',
                reason: event.reason || '',
                previousValue: event.previousValue !== undefined ? event.previousValue : null,
                newValue: event.newValue !== undefined ? event.newValue : null,
                extra: event.extra || null,
                timestamp: Date.now()
            };

            institution.history.push(eventRecord);
            institution.historyEvents.push(eventRecord);

            if (institution.history.length > 1000) {
                institution.history = institution.history.slice(-1000);
            }
            if (institution.historyEvents.length > 1000) {
                institution.historyEvents = institution.historyEvents.slice(-1000);
            }

            _saveMasterData();
            return true;

        } finally {
            _processingHistory = false;
        }
    }

    function getInstitutionHistory(institutionId, type, limit, entityId) {
        if (_processingHistory) {
            return [];
        }
        _processingHistory = true;

        try {
            var institution = _getEducationalInstitution(institutionId);
            if (!institution) return [];

            _initInstitutionHistory(institution);

            var events = institution.history || [];

            if (type) {
                events = events.filter(function(e) { return e.type === type; });
            }

            if (entityId) {
                events = events.filter(function(e) { return e.entityId === entityId; });
            }

            events = events.slice().sort(function(a, b) {
                return (b.year || 0) - (a.year || 0);
            });

            if (limit) {
                events = events.slice(0, limit);
            }

            return events;

        } finally {
            _processingHistory = false;
        }
    }

    function getFormattedEducationHistory(institutionId, limit, filterType) {
        if (_processingHistory) {
            return '';
        }
        _processingHistory = true;

        try {
            var events = getInstitutionHistory(institutionId, filterType, limit || 50);
            var institution = _getEducationalInstitution(institutionId);

            if (events.length === 0) {
                return '<div style="color:var(--dim);font-size:0.55rem;padding:8px;">No recorded events</div>';
            }

            var typeLabels = {
                'teacher_hired': 'Teacher hired',
                'teacher_fired': 'Teacher left',
                'student_enrolled': 'Student enrolled',
                'student_graduated': 'Student graduated',
                'student_withdrawn': 'Student withdrew',
                'headmaster_appointed': 'Headmaster appointed',
                'headmaster_ended': 'Headmaster term ended',
                'institution_renamed': 'Institution renamed',
                'institution_moved': 'Institution moved',
                'reputation_changed': 'Reputation changed'
            };

            var typeColors = {
                'teacher_hired': '#4a9e6a',
                'teacher_fired': '#c84444',
                'student_enrolled': '#4a7db5',
                'student_graduated': '#c8a844',
                'student_withdrawn': '#c87040',
                'headmaster_appointed': '#6a9ecf',
                'headmaster_ended': '#8a5a20',
                'institution_renamed': '#6a7a8a',
                'institution_moved': '#6a7a8a',
                'reputation_changed': '#8a7a5a'
            };

            var typeIcons = {
                'teacher_hired': '◉',
                'teacher_fired': '✗',
                'student_enrolled': '◉',
                'student_graduated': '★',
                'student_withdrawn': '✗',
                'headmaster_appointed': '◉',
                'headmaster_ended': '✗',
                'institution_renamed': '⌇',
                'institution_moved': '⌇',
                'reputation_changed': '⌇'
            };

            var html = '<div style="display:flex;flex-direction:column;gap:4px;">';

            for (var i = 0; i < events.length; i++) {
                var e = events[i];
                var label = typeLabels[e.type] || e.type;
                var color = typeColors[e.type] || 'var(--border)';
                var icon = typeIcons[e.type] || '⌇';
                var details = e.details || '';
                var entityDisplay = e.entityName ? ' <strong>' + _escapeHtml(e.entityName) + '</strong>' : '';
                var reasonDisplay = e.reason ? ' <span style="color:var(--dim);font-size:0.5rem;">(' + _escapeHtml(e.reason) + ')</span>' : '';

                html += '<div style="display:flex;align-items:flex-start;gap:8px;padding:4px 8px;background:var(--bg3);border-left:3px solid ' + color + ';border-radius:4px;font-size:0.55rem;">' +
                    '<span style="min-width:40px;color:var(--dim);font-weight:bold;">' + e.year + '</span>' +
                    '<span style="color:' + color + ';">' + icon + '</span>' +
                    '<span style="color:var(--accent);">' + label + '</span>' +
                    entityDisplay +
                    (details ? '<span style="color:var(--dim);">— ' + _escapeHtml(details) + '</span>' : '') +
                    reasonDisplay +
                    '</div>';
            }

            html += '</div>';
            return html;

        } finally {
            _processingHistory = false;
        }
    }

    function getInstitutionHistoryStats(institutionId) {
        if (_processingHistory) {
            return {};
        }
        _processingHistory = true;

        try {
            var events = getInstitutionHistory(institutionId);
            var stats = {};

            for (var i = 0; i < events.length; i++) {
                var e = events[i];
                if (!stats[e.type]) stats[e.type] = 0;
                stats[e.type]++;
            }

            return stats;

        } finally {
            _processingHistory = false;
        }
    }

    // =========================================================================
    // 4. TEACHER HISTORY
    // =========================================================================

    function recordTeacherHired(institutionId, teacherId, subjectId, year, skill, notes) {
        var teacher = _getCharacterById(teacherId);
        var institution = _getEducationalInstitution(institutionId);
        if (!institution || !teacher) return false;

        var subjectName = subjectId;
        var curriculum = institution.curriculum || [];
        for (var i = 0; i < curriculum.length; i++) {
            if (curriculum[i].id === subjectId) {
                subjectName = curriculum[i].name;
                break;
            }
        }

        var details = 'Teaching ' + subjectName + (skill ? ' (Skill: ' + skill + ')' : '');

        return addEducationHistoryEvent(institutionId, {
            type: 'teacher_hired',
            year: year || _getCurrentYear(),
            entityId: teacherId,
            entityName: teacher.name + (teacher.surname ? ' ' + teacher.surname : ''),
            details: details,
            reason: notes || '',
            extra: JSON.stringify({
                subjectId: subjectId,
                subjectName: subjectName,
                skill: skill || null
            })
        });
    }

    function recordTeacherLeft(institutionId, teacherId, year, reason, notes) {
        var teacher = _getCharacterById(teacherId);
        if (!teacher) return false;

        return addEducationHistoryEvent(institutionId, {
            type: 'teacher_fired',
            year: year || _getCurrentYear(),
            entityId: teacherId,
            entityName: teacher.name + (teacher.surname ? ' ' + teacher.surname : ''),
            details: notes || '',
            reason: reason || 'Left position'
        });
    }

    function getTeacherEmploymentHistory(teacherId) {
        if (_processingHistory) {
            return [];
        }
        _processingHistory = true;

        try {
            var institutions = _getAllEducationalInstitutions();
            var events = [];

            for (var i = 0; i < institutions.length; i++) {
                var inst = institutions[i];
                if (!inst.history) continue;

                var teacherEvents = inst.history.filter(function(e) {
                    return e.entityId === teacherId &&
                        (e.type === 'teacher_hired' || e.type === 'teacher_fired');
                });

                for (var j = 0; j < teacherEvents.length; j++) {
                    var e = teacherEvents[j];
                    var extra = null;
                    try {
                        if (e.extra) extra = JSON.parse(e.extra);
                    } catch (err) {}

                    events.push({
                        institutionId: inst.id,
                        institutionName: inst.name,
                        type: e.type,
                        year: e.year,
                        entityId: e.entityId,
                        entityName: e.entityName,
                        details: e.details,
                        reason: e.reason,
                        extra: extra
                    });
                }
            }

            events.sort(function(a, b) {
                return (b.year || 0) - (a.year || 0);
            });

            return events;

        } finally {
            _processingHistory = false;
        }
    }

    function getFormattedTeacherEmploymentHistory(teacherId) {
        if (_processingHistory) {
            return '';
        }
        _processingHistory = true;

        try {
            var events = getTeacherEmploymentHistory(teacherId);

            if (events.length === 0) {
                return '<div style="color:var(--dim);font-size:0.55rem;padding:8px;">No teaching history</div>';
            }

            var html = '<div style="display:flex;flex-direction:column;gap:4px;">';

            for (var i = 0; i < events.length; i++) {
                var e = events[i];
                var icon = e.type === 'teacher_hired' ? '◉' : '✗';
                var color = e.type === 'teacher_hired' ? '#4a9e6a' : '#c84444';
                var label = e.type === 'teacher_hired' ? 'Hired at' : 'Left';
                var subjectInfo = e.extra && e.extra.subjectName ? ' (' + _escapeHtml(e.extra.subjectName) + ')' : '';

                html += '<div style="display:flex;align-items:flex-start;gap:8px;padding:4px 8px;background:var(--bg3);border-left:3px solid ' + color + ';border-radius:4px;font-size:0.55rem;">' +
                    '<span style="min-width:40px;color:var(--dim);font-weight:bold;">' + e.year + '</span>' +
                    '<span style="color:' + color + ';">' + icon + '</span>' +
                    '<span style="color:var(--accent);">' + label + '</span>' +
                    '<strong>' + _escapeHtml(e.institutionName) + '</strong>' +
                    subjectInfo +
                    (e.reason ? ' <span style="color:var(--dim);font-size:0.5rem;">(' + _escapeHtml(e.reason) + ')</span>' : '') +
                    '</div>';
            }

            html += '</div>';
            return html;

        } finally {
            _processingHistory = false;
        }
    }

    // =========================================================================
    // 5. STUDENT HISTORY
    // =========================================================================

    function recordStudentEnrolled(institutionId, studentId, year, notes) {
        var student = _getCharacterById(studentId);
        if (!student) return false;

        return addEducationHistoryEvent(institutionId, {
            type: 'student_enrolled',
            year: year || _getCurrentYear(),
            entityId: studentId,
            entityName: student.name + (student.surname ? ' ' + student.surname : ''),
            details: notes || 'Enrolled',
            reason: notes || ''
        });
    }

    function recordStudentGraduated(institutionId, studentId, year, notes) {
        var student = _getCharacterById(studentId);
        if (!student) return false;

        return addEducationHistoryEvent(institutionId, {
            type: 'student_graduated',
            year: year || _getCurrentYear(),
            entityId: studentId,
            entityName: student.name + (student.surname ? ' ' + student.surname : ''),
            details: notes || 'Graduated',
            reason: notes || ''
        });
    }

    function recordStudentWithdrew(institutionId, studentId, year, reason, notes) {
        var student = _getCharacterById(studentId);
        if (!student) return false;

        return addEducationHistoryEvent(institutionId, {
            type: 'student_withdrawn',
            year: year || _getCurrentYear(),
            entityId: studentId,
            entityName: student.name + (student.surname ? ' ' + student.surname : ''),
            details: notes || '',
            reason: reason || 'Withdrew'
        });
    }

    function getStudentEducationHistory(studentId) {
        if (_processingHistory) {
            return [];
        }
        _processingHistory = true;

        try {
            var institutions = _getAllEducationalInstitutions();
            var events = [];

            for (var i = 0; i < institutions.length; i++) {
                var inst = institutions[i];
                if (!inst.history) continue;

                var studentEvents = inst.history.filter(function(e) {
                    return e.entityId === studentId &&
                        (e.type === 'student_enrolled' ||
                            e.type === 'student_graduated' ||
                            e.type === 'student_withdrawn');
                });

                for (var j = 0; j < studentEvents.length; j++) {
                    var e = studentEvents[j];
                    events.push({
                        institutionId: inst.id,
                        institutionName: inst.name,
                        type: e.type,
                        year: e.year,
                        entityId: e.entityId,
                        entityName: e.entityName,
                        details: e.details,
                        reason: e.reason
                    });
                }
            }

            events.sort(function(a, b) {
                return (b.year || 0) - (a.year || 0);
            });

            return events;

        } finally {
            _processingHistory = false;
        }
    }

    function getFormattedStudentEducationHistory(studentId) {
        if (_processingHistory) {
            return '';
        }
        _processingHistory = true;

        try {
            var events = getStudentEducationHistory(studentId);

            if (events.length === 0) {
                return '<div style="color:var(--dim);font-size:0.55rem;padding:8px;">No education history</div>';
            }

            var typeLabels = {
                'student_enrolled': 'Enrolled at',
                'student_graduated': 'Graduated from',
                'student_withdrawn': 'Withdrew from'
            };

            var typeColors = {
                'student_enrolled': '#4a7db5',
                'student_graduated': '#c8a844',
                'student_withdrawn': '#c87040'
            };

            var html = '<div style="display:flex;flex-direction:column;gap:4px;">';

            for (var i = 0; i < events.length; i++) {
                var e = events[i];
                var label = typeLabels[e.type] || e.type;
                var color = typeColors[e.type] || 'var(--border)';

                html += '<div style="display:flex;align-items:flex-start;gap:8px;padding:4px 8px;background:var(--bg3);border-left:3px solid ' + color + ';border-radius:4px;font-size:0.55rem;">' +
                    '<span style="min-width:40px;color:var(--dim);font-weight:bold;">' + e.year + '</span>' +
                    '<span style="color:' + color + ';">◉</span>' +
                    '<span style="color:var(--accent);">' + label + '</span>' +
                    '<strong>' + _escapeHtml(e.institutionName) + '</strong>' +
                    (e.reason ? ' <span style="color:var(--dim);font-size:0.5rem;">(' + _escapeHtml(e.reason) + ')</span>' : '') +
                    '</div>';
            }

            html += '</div>';
            return html;

        } finally {
            _processingHistory = false;
        }
    }

    // =========================================================================
    // 6. HEADMASTER HISTORY
    // =========================================================================

    function recordHeadmasterAppointed(institutionId, characterId, title, year, notes) {
        var character = _getCharacterById(characterId);
        if (!character) return false;

        return addEducationHistoryEvent(institutionId, {
            type: 'headmaster_appointed',
            year: year || _getCurrentYear(),
            entityId: characterId,
            entityName: character.name + (character.surname ? ' ' + character.surname : ''),
            details: 'Appointed as ' + (title || 'Headmaster'),
            reason: notes || '',
            extra: JSON.stringify({ title: title || 'Headmaster' })
        });
    }

    function recordHeadmasterEnded(institutionId, characterId, year, reason, notes) {
        var character = _getCharacterById(characterId);
        if (!character) return false;

        return addEducationHistoryEvent(institutionId, {
            type: 'headmaster_ended',
            year: year || _getCurrentYear(),
            entityId: characterId,
            entityName: character.name + (character.surname ? ' ' + character.surname : ''),
            details: notes || '',
            reason: reason || 'Term ended'
        });
    }

    function getCharacterHeadmasterHistory(characterId) {
        if (_processingHistory) {
            return [];
        }
        _processingHistory = true;

        try {
            var institutions = _getAllEducationalInstitutions();
            var events = [];

            for (var i = 0; i < institutions.length; i++) {
                var inst = institutions[i];
                if (!inst.history) continue;

                var hmEvents = inst.history.filter(function(e) {
                    return e.entityId === characterId &&
                        (e.type === 'headmaster_appointed' || e.type === 'headmaster_ended');
                });

                for (var j = 0; j < hmEvents.length; j++) {
                    var e = hmEvents[j];
                    events.push({
                        institutionId: inst.id,
                        institutionName: inst.name,
                        type: e.type,
                        year: e.year,
                        entityId: e.entityId,
                        entityName: e.entityName,
                        details: e.details,
                        reason: e.reason
                    });
                }
            }

            events.sort(function(a, b) {
                return (b.year || 0) - (a.year || 0);
            });

            return events;

        } finally {
            _processingHistory = false;
        }
    }

    // =========================================================================
    // 7. INSTITUTION CHANGE HISTORY
    // =========================================================================

    function recordInstitutionRenamed(institutionId, oldName, newName, year, reason) {
        return addEducationHistoryEvent(institutionId, {
            type: 'institution_renamed',
            year: year || _getCurrentYear(),
            details: 'Renamed from "' + oldName + '" to "' + newName + '"' + (reason ? ' (' + reason + ')' : ''),
            previousValue: oldName,
            newValue: newName,
            reason: reason || ''
        });
    }

    function recordInstitutionMoved(institutionId, oldLocation, newLocation, year, reason) {
        return addEducationHistoryEvent(institutionId, {
            type: 'institution_moved',
            year: year || _getCurrentYear(),
            details: 'Moved from "' + oldLocation + '" to "' + newLocation + '"' + (reason ? ' (' + reason + ')' : ''),
            previousValue: oldLocation,
            newValue: newLocation,
            reason: reason || ''
        });
    }

    function recordReputationChanged(institutionId, oldReputation, newReputation, year, reason) {
        return addEducationHistoryEvent(institutionId, {
            type: 'reputation_changed',
            year: year || _getCurrentYear(),
            details: 'Reputation changed from ' + oldReputation + ' to ' + newReputation + (reason ? ' (' + reason + ')' : ''),
            previousValue: oldReputation,
            newValue: newReputation,
            reason: reason || ''
        });
    }

    // =========================================================================
    // 8. COMBINED HISTORY
    // =========================================================================

    function getCharacterEducationHistory(characterId) {
        if (_processingHistory) {
            return { characterId: characterId, asStudent: [], asTeacher: [], asHeadmaster: [], totalEvents: 0 };
        }
        _processingHistory = true;

        try {
            var studentHistory = getStudentEducationHistory(characterId);
            var teacherHistory = getTeacherEmploymentHistory(characterId);
            var headmasterHistory = getCharacterHeadmasterHistory(characterId);

            return {
                characterId: characterId,
                asStudent: studentHistory,
                asTeacher: teacherHistory,
                asHeadmaster: headmasterHistory,
                totalEvents: studentHistory.length + teacherHistory.length + headmasterHistory.length
            };

        } finally {
            _processingHistory = false;
        }
    }

    function getFormattedCharacterEducationHistory(characterId) {
        if (_processingHistory) {
            return '';
        }
        _processingHistory = true;

        try {
            var data = getCharacterEducationHistory(characterId);

            if (data.totalEvents === 0) {
                return '<div style="color:var(--dim);font-size:0.55rem;padding:8px;">No education history</div>';
            }

            var html = '<div style="display:flex;flex-direction:column;gap:4px;">';

            for (var i = 0; i < data.asStudent.length; i++) {
                var e = data.asStudent[i];
                var label = e.type === 'student_enrolled' ? 'Enrolled at' :
                    (e.type === 'student_graduated' ? 'Graduated from' : 'Withdrew from');
                html += '<div style="display:flex;align-items:flex-start;gap:8px;padding:4px 8px;background:var(--bg3);border-left:3px solid #4a7db5;border-radius:4px;font-size:0.55rem;">' +
                    '<span style="min-width:40px;color:var(--dim);font-weight:bold;">' + e.year + '</span>' +
                    '<span style="color:#4a7db5;">◉</span>' +
                    '<span style="color:var(--accent);">Student</span>' +
                    '<span>' + label + '</span>' +
                    '<strong>' + _escapeHtml(e.institutionName) + '</strong>' +
                    (e.reason ? ' <span style="color:var(--dim);font-size:0.5rem;">(' + _escapeHtml(e.reason) + ')</span>' : '') +
                    '</div>';
            }

            for (var i = 0; i < data.asTeacher.length; i++) {
                var e = data.asTeacher[i];
                var label = e.type === 'teacher_hired' ? 'Hired at' : 'Left';
                var color = e.type === 'teacher_hired' ? '#4a9e6a' : '#c84444';
                var icon = e.type === 'teacher_hired' ? '◉' : '✗';
                html += '<div style="display:flex;align-items:flex-start;gap:8px;padding:4px 8px;background:var(--bg3);border-left:3px solid ' + color + ';border-radius:4px;font-size:0.55rem;">' +
                    '<span style="min-width:40px;color:var(--dim);font-weight:bold;">' + e.year + '</span>' +
                    '<span style="color:' + color + ';">' + icon + '</span>' +
                    '<span style="color:var(--accent);">Teacher</span>' +
                    '<span>' + label + '</span>' +
                    '<strong>' + _escapeHtml(e.institutionName) + '</strong>' +
                    (e.reason ? ' <span style="color:var(--dim);font-size:0.5rem;">(' + _escapeHtml(e.reason) + ')</span>' : '') +
                    '</div>';
            }

            for (var i = 0; i < data.asHeadmaster.length; i++) {
                var e = data.asHeadmaster[i];
                var label = e.type === 'headmaster_appointed' ? 'Appointed at' : 'Term ended at';
                var color = e.type === 'headmaster_appointed' ? '#6a9ecf' : '#8a5a20';
                var icon = e.type === 'headmaster_appointed' ? '◉' : '✗';
                html += '<div style="display:flex;align-items:flex-start;gap:8px;padding:4px 8px;background:var(--bg3);border-left:3px solid ' + color + ';border-radius:4px;font-size:0.55rem;">' +
                    '<span style="min-width:40px;color:var(--dim);font-weight:bold;">' + e.year + '</span>' +
                    '<span style="color:' + color + ';">' + icon + '</span>' +
                    '<span style="color:var(--accent);">Headmaster</span>' +
                    '<span>' + label + '</span>' +
                    '<strong>' + _escapeHtml(e.institutionName) + '</strong>' +
                    (e.reason ? ' <span style="color:var(--dim);font-size:0.5rem;">(' + _escapeHtml(e.reason) + ')</span>' : '') +
                    '</div>';
            }

            html += '</div>';
            return html;

        } finally {
            _processingHistory = false;
        }
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.addEducationHistoryEvent = addEducationHistoryEvent;
    window.getInstitutionHistory = getInstitutionHistory;
    window.getFormattedEducationHistory = getFormattedEducationHistory;
    window.getInstitutionHistoryStats = getInstitutionHistoryStats;

    window.recordTeacherHired = recordTeacherHired;
    window.recordTeacherLeft = recordTeacherLeft;
    window.getTeacherEmploymentHistory = getTeacherEmploymentHistory;
    window.getFormattedTeacherEmploymentHistory = getFormattedTeacherEmploymentHistory;

    window.recordStudentEnrolled = recordStudentEnrolled;
    window.recordStudentGraduated = recordStudentGraduated;
    window.recordStudentWithdrew = recordStudentWithdrew;
    window.getStudentEducationHistory = getStudentEducationHistory;
    window.getFormattedStudentEducationHistory = getFormattedStudentEducationHistory;

    window.recordHeadmasterAppointed = recordHeadmasterAppointed;
    window.recordHeadmasterEnded = recordHeadmasterEnded;
    window.getCharacterHeadmasterHistory = getCharacterHeadmasterHistory;

    window.recordInstitutionRenamed = recordInstitutionRenamed;
    window.recordInstitutionMoved = recordInstitutionMoved;
    window.recordReputationChanged = recordReputationChanged;

    window.getCharacterEducationHistory = getCharacterEducationHistory;
    window.getFormattedCharacterEducationHistory = getFormattedCharacterEducationHistory;

    // Legacy aliases
    window._addEducationHistoryEvent = addEducationHistoryEvent;
    window._getInstitutionHistory = getInstitutionHistory;
    window._getFormattedEducationHistory = getFormattedEducationHistory;
    window._getInstitutionHistoryStats = getInstitutionHistoryStats;
    window._recordTeacherHired = recordTeacherHired;
    window._recordTeacherLeft = recordTeacherLeft;
    window._getTeacherEmploymentHistory = getTeacherEmploymentHistory;
    window._getFormattedTeacherEmploymentHistory = getFormattedTeacherEmploymentHistory;
    window._recordStudentEnrolled = recordStudentEnrolled;
    window._recordStudentGraduated = recordStudentGraduated;
    window._recordStudentWithdrew = recordStudentWithdrew;
    window._getStudentEducationHistory = getStudentEducationHistory;
    window._getFormattedStudentEducationHistory = getFormattedStudentEducationHistory;
    window._recordHeadmasterAppointed = recordHeadmasterAppointed;
    window._recordHeadmasterEnded = recordHeadmasterEnded;
    window._getCharacterHeadmasterHistory = getCharacterHeadmasterHistory;
    window._recordInstitutionRenamed = recordInstitutionRenamed;
    window._recordInstitutionMoved = recordInstitutionMoved;
    window._recordReputationChanged = recordReputationChanged;
    window._getCharacterEducationHistory = getCharacterEducationHistory;
    window._getFormattedCharacterEducationHistory = getFormattedCharacterEducationHistory;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            addEducationHistoryEvent: addEducationHistoryEvent,
            getInstitutionHistory: getInstitutionHistory,
            getFormattedEducationHistory: getFormattedEducationHistory,
            getInstitutionHistoryStats: getInstitutionHistoryStats,
            recordTeacherHired: recordTeacherHired,
            recordTeacherLeft: recordTeacherLeft,
            getTeacherEmploymentHistory: getTeacherEmploymentHistory,
            getFormattedTeacherEmploymentHistory: getFormattedTeacherEmploymentHistory,
            recordStudentEnrolled: recordStudentEnrolled,
            recordStudentGraduated: recordStudentGraduated,
            recordStudentWithdrew: recordStudentWithdrew,
            getStudentEducationHistory: getStudentEducationHistory,
            getFormattedStudentEducationHistory: getFormattedStudentEducationHistory,
            recordHeadmasterAppointed: recordHeadmasterAppointed,
            recordHeadmasterEnded: recordHeadmasterEnded,
            getCharacterHeadmasterHistory: getCharacterHeadmasterHistory,
            recordInstitutionRenamed: recordInstitutionRenamed,
            recordInstitutionMoved: recordInstitutionMoved,
            recordReputationChanged: recordReputationChanged,
            getCharacterEducationHistory: getCharacterEducationHistory,
            getFormattedCharacterEducationHistory: getFormattedCharacterEducationHistory
        };
    }

})();