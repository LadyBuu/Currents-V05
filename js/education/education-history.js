/**
 * STILL WATERS - EDUCATION HISTORY
 * Append-only event ledger embedded on each institution (`institution.history`).
 * Structured events only. No persistence, no formatting, no character lookups
 * beyond snapshotting a name at event time.
 */

(function() {
    'use strict';

    var HISTORY = window.HISTORY_EVENT_TYPES;

    if (!HISTORY) {
        throw new Error('education-history.js requires education-constants.js (HISTORY_EVENT_TYPES)');
    }

    // --- Dependencies: no fallbacks. Missing dependency = broken load order. ---

    function _getInstitution(id) {
        if (typeof window.EducationState === 'undefined' ||
            typeof window.EducationState.getInstitution !== 'function') {
            throw new Error('education-history.js requires EducationState.getInstitution');
        }
        return window.EducationState.getInstitution(id);
    }

    function _getAllInstitutions() {
        if (typeof window.EducationState === 'undefined' ||
            typeof window.EducationState.getAllInstitutions !== 'function') {
            throw new Error('education-history.js requires EducationState.getAllInstitutions');
        }
        return window.EducationState.getAllInstitutions();
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('education-history.js requires getCharacterById');
        }
        return window.getCharacterById(id);
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error('education-history.js requires getCurrentYearSafe');
        }
        return window.getCurrentYearSafe();
    }

    function _generateId(prefix) {
        if (typeof window.generateId !== 'function') {
            throw new Error('education-history.js requires generateId');
        }
        return window.generateId(prefix);
    }

    // --- Event vocabulary validation ---

    var _VALID_TYPES = {};
    (function() {
        for (var k in HISTORY) {
            if (HISTORY.hasOwnProperty(k)) _VALID_TYPES[HISTORY[k]] = true;
        }
    })();

    function _validateEventType(type) {
        if (!type || !_VALID_TYPES[type]) {
            throw new Error('Invalid education history event type: ' + String(type));
        }
    }

    // --- Defensive copies ---

    function _copyEvent(e) {
        return Object.freeze({
            id: e.id,
            type: e.type,
            year: e.year,
            entityId: e.entityId,
            entityName: e.entityName,
            details: e.details,
            reason: e.reason,
            previousValue: e.previousValue,
            newValue: e.newValue,
            metadata: e.metadata ? Object.freeze(Object.assign({}, e.metadata)) : null,
            timestamp: e.timestamp
        });
    }

    function _sortEvents(a, b) {
        if (a.year !== b.year) return b.year - a.year;
        if (a.timestamp !== b.timestamp) return b.timestamp - a.timestamp;
        return a.id < b.id ? 1 : (a.id > b.id ? -1 : 0);
    }

    // --- Core API ---

    /**
     * Append an event to an institution's history.
     * Mutates the canonical institution object. Caller owns persistence.
     *
     * @param {Object|string} institutionOrId - Canonical institution object or its id.
     * @param {Object} event
     * @param {string} event.type        - Must be in HISTORY_EVENT_TYPES.
     * @param {number} [event.year]      - Defaults to current year.
     * @param {string} [event.entityId]  - Character or entity involved.
     * @param {string} [event.entityName]- Snapshot of the entity's name at event time.
     * @param {string} [event.details]   - Human-readable description.
     * @param {string} [event.reason]    - Reason or context.
     * @param {*}      [event.previousValue]
     * @param {*}      [event.newValue]
     * @param {Object} [event.metadata]  - Structured extra data (subject id, etc.).
     * @returns {Object} The stored event (frozen copy).
     */
    function addEvent(institutionOrId, event) {
        if (!event || typeof event !== 'object') {
            throw new Error('addEvent: event object is required');
        }

        _validateEventType(event.type);

        var institution = (typeof institutionOrId === 'string')
            ? _getInstitution(institutionOrId)
            : institutionOrId;

        if (!institution) {
            throw new Error('addEvent: institution not found');
        }

        if (!institution.history) institution.history = [];

        var record = {
            id: _generateId('edu_evt'),
            type: event.type,
            year: (event.year !== undefined) ? event.year : _getCurrentYear(),
            entityId: event.entityId || null,
            entityName: event.entityName || null,
            details: event.details || '',
            reason: event.reason || '',
            previousValue: (event.previousValue !== undefined) ? event.previousValue : null,
            newValue: (event.newValue !== undefined) ? event.newValue : null,
            metadata: event.metadata ? Object.assign({}, event.metadata) : null,
            timestamp: Date.now()
        };

        institution.history.push(record);

        return _copyEvent(record);
    }

    /**
     * Get history events for an institution.
     * Returns frozen copies. Sorted by (year desc, timestamp desc, id desc).
     *
     * @param {string} institutionId
     * @param {Object} [options]
     * @param {string} [options.type]      - Filter by event type.
     * @param {string} [options.entityId]  - Filter by entity id.
     * @param {number} [options.limit]     - Maximum number of events.
     * @returns {Array<Object>}
     */
    function getInstitutionHistory(institutionId, options) {
        options = options || {};
        var institution = _getInstitution(institutionId);
        if (!institution) return [];

        var events = institution.history ? institution.history.slice() : [];

        if (options.type) {
            events = events.filter(function(e) { return e.type === options.type; });
        }
        if (options.entityId) {
            events = events.filter(function(e) { return e.entityId === options.entityId; });
        }

        events.sort(_sortEvents);

        if (options.limit && options.limit > 0) {
            events = events.slice(0, options.limit);
        }

        return events.map(_copyEvent);
    }

    function getInstitutionHistoryStats(institutionId) {
        var events = getInstitutionHistory(institutionId);
        var stats = {};
        for (var i = 0; i < events.length; i++) {
            var t = events[i].type;
            stats[t] = (stats[t] || 0) + 1;
        }
        return stats;
    }

    // --- Character-centric queries ---

    function _collectEventsForEntity(entityId, typeFilter) {
        var institutions = _getAllInstitutions();
        var collected = [];

        for (var i = 0; i < institutions.length; i++) {
            var inst = institutions[i];
            if (!inst.history) continue;

            for (var j = 0; j < inst.history.length; j++) {
                var e = inst.history[j];
                if (e.entityId !== entityId) continue;
                if (typeFilter && typeFilter.indexOf(e.type) === -1) continue;

                collected.push({
                    event: e,
                    institutionId: inst.id,
                    institutionName: inst.name
                });
            }
        }

        collected.sort(function(a, b) { return _sortEvents(a.event, b.event); });

        return collected.map(function(item) {
            var copy = _copyEvent(item.event);
            // Institution fields added on top of the frozen event for context.
            // Object.assign produces a new object; freeze it too.
            return Object.freeze(Object.assign({}, copy, {
                institutionId: item.institutionId,
                institutionName: item.institutionName
            }));
        });
    }

    function getTeacherEmploymentHistory(teacherId) {
        return _collectEventsForEntity(teacherId, [
            HISTORY.TEACHER_HIRED,
            HISTORY.TEACHER_DEPARTED
        ]);
    }

    function getStudentEducationHistory(studentId) {
        return _collectEventsForEntity(studentId, [
            HISTORY.STUDENT_ENROLLED,
            HISTORY.STUDENT_GRADUATED,
            HISTORY.STUDENT_WITHDREW
        ]);
    }

    function getCharacterHeadmasterHistory(characterId) {
        return _collectEventsForEntity(characterId, [
            HISTORY.HEADMASTER_APPOINTED,
            HISTORY.HEADMASTER_ENDED
        ]);
    }

    function getCharacterEducationHistory(characterId) {
        var asStudent = getStudentEducationHistory(characterId);
        var asTeacher = getTeacherEmploymentHistory(characterId);
        var asHeadmaster = getCharacterHeadmasterHistory(characterId);

        return {
            characterId: characterId,
            asStudent: asStudent,
            asTeacher: asTeacher,
            asHeadmaster: asHeadmaster,
            totalEvents: asStudent.length + asTeacher.length + asHeadmaster.length
        };
    }

    // --- Event recorders ---
    // Commands call these during their mutation. They do not persist.

    function recordTeacherHired(institutionId, teacherId, subjectId, year, skill, notes) {
        var institution = _getInstitution(institutionId);
        var teacher = _getCharacterById(teacherId);
        if (!institution || !teacher) return null;

        var subjectName = subjectId;
        var curriculum = institution.curriculum || [];
        for (var i = 0; i < curriculum.length; i++) {
            if (curriculum[i].id === subjectId) { subjectName = curriculum[i].name; break; }
        }

        return addEvent(institution, {
            type: HISTORY.TEACHER_HIRED,
            year: year,
            entityId: teacherId,
            entityName: _formatCharacterName(teacher),
            details: 'Teaching ' + subjectName,
            metadata: {
                subjectId: subjectId,
                subjectName: subjectName,
                skill: skill !== undefined ? skill : null
            }
        });
    }

    function recordTeacherDeparted(institutionId, teacherId, year, reason, notes) {
        var institution = _getInstitution(institutionId);
        var teacher = _getCharacterById(teacherId);
        if (!institution || !teacher) return null;

        return addEvent(institution, {
            type: HISTORY.TEACHER_DEPARTED,
            year: year,
            entityId: teacherId,
            entityName: _formatCharacterName(teacher),
            details: notes || '',
            reason: reason || 'Departed'
        });
    }

    function recordStudentEnrolled(institutionId, studentId, year, notes) {
        var institution = _getInstitution(institutionId);
        var student = _getCharacterById(studentId);
        if (!institution || !student) return null;

        return addEvent(institution, {
            type: HISTORY.STUDENT_ENROLLED,
            year: year,
            entityId: studentId,
            entityName: _formatCharacterName(student),
            details: notes || 'Enrolled',
            reason: notes || ''
        });
    }

    function recordStudentGraduated(institutionId, studentId, year, notes) {
        var institution = _getInstitution(institutionId);
        var student = _getCharacterById(studentId);
        if (!institution || !student) return null;

        return addEvent(institution, {
            type: HISTORY.STUDENT_GRADUATED,
            year: year,
            entityId: studentId,
            entityName: _formatCharacterName(student),
            details: notes || 'Graduated',
            reason: notes || ''
        });
    }

    function recordStudentWithdrew(institutionId, studentId, year, reason, notes) {
        var institution = _getInstitution(institutionId);
        var student = _getCharacterById(studentId);
        if (!institution || !student) return null;

        return addEvent(institution, {
            type: HISTORY.STUDENT_WITHDREW,
            year: year,
            entityId: studentId,
            entityName: _formatCharacterName(student),
            details: notes || '',
            reason: reason || 'Withdrew'
        });
    }

    function recordHeadmasterAppointed(institutionId, characterId, title, year, notes) {
        var institution = _getInstitution(institutionId);
        var character = _getCharacterById(characterId);
        if (!institution || !character) return null;

        var displayTitle = title || 'Headmaster';
        return addEvent(institution, {
            type: HISTORY.HEADMASTER_APPOINTED,
            year: year,
            entityId: characterId,
            entityName: _formatCharacterName(character),
            details: 'Appointed as ' + displayTitle,
            reason: notes || '',
            metadata: { title: displayTitle }
        });
    }

    function recordHeadmasterEnded(institutionId, characterId, year, reason, notes) {
        var institution = _getInstitution(institutionId);
        var character = _getCharacterById(characterId);
        if (!institution || !character) return null;

        return addEvent(institution, {
            type: HISTORY.HEADMASTER_ENDED,
            year: year,
            entityId: characterId,
            entityName: _formatCharacterName(character),
            details: notes || '',
            reason: reason || 'Term ended'
        });
    }

    function recordInstitutionRenamed(institutionId, oldName, newName, year, reason) {
        return addEvent(institutionId, {
            type: HISTORY.INSTITUTION_RENAMED,
            year: year,
            details: 'Renamed from "' + oldName + '" to "' + newName + '"',
            previousValue: oldName,
            newValue: newName,
            reason: reason || ''
        });
    }

    function recordInstitutionMoved(institutionId, oldLocationName, newLocationName, year, reason) {
        return addEvent(institutionId, {
            type: HISTORY.INSTITUTION_MOVED,
            year: year,
            details: 'Moved from "' + oldLocationName + '" to "' + newLocationName + '"',
            previousValue: oldLocationName,
            newValue: newLocationName,
            reason: reason || ''
        });
    }

    function recordReputationChanged(institutionId, oldReputation, newReputation, year, reason) {
        return addEvent(institutionId, {
            type: HISTORY.REPUTATION_CHANGED,
            year: year,
            details: 'Reputation changed from ' + oldReputation + ' to ' + newReputation,
            previousValue: oldReputation,
            newValue: newReputation,
            reason: reason || ''
        });
    }

    // --- Internal ---

    function _formatCharacterName(character) {
        if (!character) return '';
        return character.name + (character.surname ? ' ' + character.surname : '');
    }

    // --- Exports ---

    window.EducationHistory = {
        addEvent: addEvent,
        getInstitutionHistory: getInstitutionHistory,
        getInstitutionHistoryStats: getInstitutionHistoryStats,
        getTeacherEmploymentHistory: getTeacherEmploymentHistory,
        getStudentEducationHistory: getStudentEducationHistory,
        getCharacterHeadmasterHistory: getCharacterHeadmasterHistory,
        getCharacterEducationHistory: getCharacterEducationHistory,

        recordTeacherHired: recordTeacherHired,
        recordTeacherDeparted: recordTeacherDeparted,
        recordStudentEnrolled: recordStudentEnrolled,
        recordStudentGraduated: recordStudentGraduated,
        recordStudentWithdrew: recordStudentWithdrew,
        recordHeadmasterAppointed: recordHeadmasterAppointed,
        recordHeadmasterEnded: recordHeadmasterEnded,
        recordInstitutionRenamed: recordInstitutionRenamed,
        recordInstitutionMoved: recordInstitutionMoved,
        recordReputationChanged: recordReputationChanged
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.EducationHistory;
    }
})();
