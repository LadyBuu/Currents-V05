/**
 * =============================================================================
 * STILL WATERS - EVENT LOGGER (js/events/eventLogger.js)
 * =============================================================================
 *
 * The canonical event logger. Every subsystem that records a timeline
 * event calls window.logEvent. This module is the sole definer.
 *
 * EVENT SHAPE (written to masterData.data.eventLog):
 *
 *   {
 *     id: string,
 *     year: number,
 *     category: string,
 *     type: string,
 *     message: string,
 *     subjects: string[],
 *     subjectNames: string[],
 *     locationName: string|null,
 *     timestamp: number
 *   }
 *
 * CONTRACT
 *
 *   logEvent(category, type, message, subjects, locationName)
 *
 *   Missing optionals default to [] / null. Required fields that are not
 *   strings are coerced to strings. The function never throws for
 *   well-shaped input.
 *
 * DEPENDENCIES (SOFT — works without any of them):
 *   - masterData.data.eventLog  write target; drops events if missing
 *   - generateId                id generation; falls back to timestamp+random
 *   - getCurrentYear            year lookup; falls back to masterData
 *   - markDataDirty             schedules a save; skipped if absent
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    var MAX_EVENT_LOG_ENTRIES = 5000;
    var _warnedMissingMasterData = false;
    var _warnedMissingEventLog = false;

    function _coerceString(v, fallback) {
        if (typeof v === 'string') return v;
        if (v === null || v === undefined) return fallback || '';
        return String(v);
    }

    function _resolveCurrentYear() {
        if (typeof window.getCurrentYear === 'function') {
            try {
                var y = window.getCurrentYear();
                if (typeof y === 'number' && Number.isFinite(y)) return y;
            } catch (e) { /* fall through */ }
        }
        if (window.masterData && window.masterData.data
            && typeof window.masterData.data.currentYear === 'number'
            && Number.isFinite(window.masterData.data.currentYear)) {
            return window.masterData.data.currentYear;
        }
        return 0;
    }

    function _resolveId() {
        if (typeof window.generateId === 'function') {
            try {
                var id = window.generateId('event');
                if (typeof id === 'string' && id.length > 0) return id;
            } catch (e) { /* fall through */ }
        }
        return 'event_' + Date.now() + '_' +
            Math.floor(Math.random() * 1000000);
    }

    function _normalizeSubject(entry) {
        if (!entry) return null;
        if (typeof entry === 'string') {
            return { id: entry, name: '' };
        }
        if (typeof entry === 'object') {
            var id = (typeof entry.id === 'string') ? entry.id : '';
            var name = '';
            if (typeof entry.name === 'string') {
                name = entry.name;
                if (typeof entry.surname === 'string' && entry.surname.length > 0) {
                    name += ' ' + entry.surname;
                }
            }
            return { id: id, name: name };
        }
        return null;
    }

    function _normalizeSubjects(subjects) {
        if (!Array.isArray(subjects)) {
            return { ids: [], names: [] };
        }
        var ids = [];
        var names = [];
        for (var i = 0; i < subjects.length; i++) {
            var normalized = _normalizeSubject(subjects[i]);
            if (!normalized) continue;
            if (normalized.id) ids.push(normalized.id);
            if (normalized.name) names.push(normalized.name);
        }
        return { ids: ids, names: names };
    }

    function _ensureEventLog() {
        if (!window.masterData || !window.masterData.data) {
            if (!_warnedMissingMasterData && typeof console !== 'undefined' && console.warn) {
                _warnedMissingMasterData = true;
                console.warn(
                    'eventLogger.js: masterData is not initialized. ' +
                    'Events logged before storage.js runs will be dropped.'
                );
            }
            return null;
        }
        if (!Array.isArray(window.masterData.data.eventLog)) {
            if (!_warnedMissingEventLog && typeof console !== 'undefined' && console.warn) {
                _warnedMissingEventLog = true;
                console.warn(
                    'eventLogger.js: masterData.data.eventLog is not an array. ' +
                    'Initializing to [].'
                );
            }
            window.masterData.data.eventLog = [];
        }
        return window.masterData.data.eventLog;
    }

    function _trimIfNeeded(log) {
        if (log.length <= MAX_EVENT_LOG_ENTRIES) return;
        var excess = log.length - MAX_EVENT_LOG_ENTRIES;
        log.splice(0, excess);
    }

    function logEvent(category, type, message, subjects, locationName) {
        var log = _ensureEventLog();
        if (!log) return null;

        var normalized = _normalizeSubjects(subjects);

        var entry = {
            id: _resolveId(),
            year: _resolveCurrentYear(),
            category: _coerceString(category, 'unknown'),
            type: _coerceString(type, 'event'),
            message: _coerceString(message, ''),
            subjects: normalized.ids,
            subjectNames: normalized.names,
            locationName: (typeof locationName === 'string' && locationName.length > 0)
                ? locationName
                : null,
            timestamp: Date.now()
        };

        log.push(entry);
        _trimIfNeeded(log);

        if (typeof window.markDataDirty === 'function') {
            try { window.markDataDirty(); }
            catch (e) { /* storage not ready yet */ }
        }

        return entry;
    }

    window.logEvent = logEvent;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { logEvent: logEvent };
    }

})();
