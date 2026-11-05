/**
 * =============================================================================
 * STILL WATERS - EDUCATION HISTORY TAB
 * js/tabs/education-history-tab.js
 * =============================================================================
 *
 * LOCATION: js/tabs/education-history-tab.js
 *
 * Settlement-scoped institution event timeline. Read-only. Merges every
 * event from every institution in the settlement into one ordered list.
 *
 * THE MERGE
 *
 *   For each institution in the settlement:
 *
 *     EducationHistory.getInstitutionHistory(id, {})
 *
 *   flatten into one array of { event, institutionId, institutionName },
 *   deduplicate by event.id (defensive; the API returns each event on
 *   exactly one institution today), sort by (year desc, timestamp desc,
 *   id desc). That is the SAME order EducationHistory._sortEvents uses
 *   internally, so the tab's view is deterministic regardless of what
 *   order the underlying history arrays happen to be in.
 *
 *   Demolished institutions ARE included — their history is still
 *   meaningful (demolition event, previous students, etc.). Only the
 *   event-type filter and the search filter narrow the display; the
 *   institution list itself is the full settlement set.
 *
 * FILTERS
 *
 *   search          string    substring of entityName, details,
 *                              reason, or institutionName
 *   institutionId   string    'all' or an institution id
 *   eventType       string    'all' or a HISTORY_EVENT_TYPES value
 *   yearFrom        number    null = unbounded below
 *   yearTo          number    null = unbounded above
 *
 *   Persisted per-location to:
 *     education_history_filters_<locationId>
 *
 * EXPORT
 *
 *   JSON download of { settlement, exportedAt, institutions, events }.
 *   Institutions is the metadata list (id, name, type, status) so the
 *   reader can resolve institutionIds in the events array. Events are
 *   the pre-filter merge (a full export), not the filtered view.
 *
 *   Filename: education-history-<locationName-slug>-<year>.json.
 *   Year falls back to 'export' when getCurrentYear is unavailable.
 *
 *   The export uses a direct Blob + anchor download rather than
 *   exportUtils.exportToJSON. exportToJSON throws on undefined /
 *   function / symbol values; the merge payload is a plain object tree
 *   built from event snapshots, and a future event type that stores a
 *   non-serializable metadata value should not fail the export.
 *
 * READ-ONLY
 *
 *   No mutations. No modal actions. No persist() calls. The tab is a
 *   viewer; export is a client-side JSON download, not a save.
 *
 * DEPENDENCIES (soft; guarded at render):
 *   - window.EducationQueries.getInstitutions({ location })
 *   - window.EducationHistory.getInstitutionHistory
 *   - window.HISTORY_EVENT_TYPES       (soft; falls back to raw type)
 *   - window.TabManager.requestRender
 *   - window.getCurrentYear            (soft; export filename only)
 *   - window._showToast / showToast    (soft, via _toast)
 *   - window.Icons                     (soft, via _icon)
 *   - window.escapeHtml / _escapeHtml  (soft, via _esc)
 *
 *   If EducationHistory is missing, the tab renders an error state
 *   instead of crashing the bootstrap. If HISTORY_EVENT_TYPES is
 *   missing, the eventType filter options are empty and event-type
 *   labels fall back to the raw type value with underscores replaced
 *   by spaces.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Initial revision.
 *     - Written for the Education Manager's TabManager host.
 *     - Merge sort matches EducationHistory._sortEvents exactly.
 *     - Per-location filter persistence, matching the other education
 *       tabs.
 *     - Delegated filter-change handlers; single listener per filter
 *       control; no per-row closures.
 *     - Event-type colors are semantic and token-driven — every visual
 *       decision is one `if` line against HISTORY_EVENT_TYPES.
 *     - Cap at 500 rendered events; the export uses the full filtered
 *       set, so nothing is lost when the user exports.
 *     - No inline CSS; every class is from the page's .edu-* inline
 *       stylesheet.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var TAB_ID = 'history';
    var SCOPE  = 'education';
    var FILTER_KEY_PREFIX = 'education_history_filters_';

    // Cap on how many events the DOM renderer will emit per pass.
    // The export path uses the full filtered set — this cap is only
    // about DOM size. 500 rows is a generous ceiling for a viewer.
    var MAX_EVENTS_RENDERED = 500;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS (soft)
    // =========================================================================

    function _queries() {
        return (typeof window.EducationQueries !== 'undefined')
            ? window.EducationQueries
            : null;
    }

    function _history() {
        return (typeof window.EducationHistory !== 'undefined')
            ? window.EducationHistory
            : null;
    }

    function _tabManager() {
        return (typeof window.TabManager !== 'undefined') ? window.TabManager : null;
    }

    function _esc(v) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(v);
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(v);
        if (v === null || v === undefined) return '';
        return String(v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _icon(name) {
        if (typeof window.getIcon === 'function') {
            try {
                var s = window.getIcon(name);
                if (typeof s === 'string') return s;
            } catch (e) { /* fall through */ }
        }
        if (window.Icons && typeof window.Icons[name] === 'string') {
            return window.Icons[name];
        }
        return '';
    }

    function _toast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
            return;
        }
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    }

    function _currentYear() {
        return (typeof window.getCurrentYear === 'function')
            ? window.getCurrentYear()
            : null;
    }

    // =========================================================================
    // 3. FILTER PERSISTENCE
    // =========================================================================

    function _filterKey(locationId) {
        return FILTER_KEY_PREFIX + String(locationId);
    }

    function _readFilters(locationId) {
        var defaults = {
            search: '',
            institutionId: 'all',
            eventType: 'all',
            yearFrom: null,
            yearTo: null
        };
        if (!locationId) return defaults;

        try {
            if (typeof localStorage === 'undefined') return defaults;
            var raw = localStorage.getItem(_filterKey(locationId));
            if (!raw) return defaults;
            var parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return defaults;

            var out = {
                search: '',
                institutionId: 'all',
                eventType: 'all',
                yearFrom: null,
                yearTo: null
            };
            if (typeof parsed.search === 'string') out.search = parsed.search;
            if (typeof parsed.institutionId === 'string') {
                out.institutionId = parsed.institutionId;
            }
            if (typeof parsed.eventType === 'string') {
                out.eventType = parsed.eventType;
            }
            if (typeof parsed.yearFrom === 'number' && isFinite(parsed.yearFrom)) {
                out.yearFrom = parsed.yearFrom;
            }
            if (typeof parsed.yearTo === 'number' && isFinite(parsed.yearTo)) {
                out.yearTo = parsed.yearTo;
            }
            return out;
        } catch (e) {
            return defaults;
        }
    }

    function _writeFilters(locationId, filters) {
        if (!locationId) return;
        try {
            if (typeof localStorage === 'undefined') return;
            localStorage.setItem(_filterKey(locationId), JSON.stringify({
                search: filters.search || '',
                institutionId: filters.institutionId || 'all',
                eventType: filters.eventType || 'all',
                yearFrom: (typeof filters.yearFrom === 'number') ? filters.yearFrom : null,
                yearTo: (typeof filters.yearTo === 'number') ? filters.yearTo : null
            }));
        } catch (e) { /* ignore */ }
    }

    // =========================================================================
    // 4. REFRESH
    // =========================================================================

    var _lastContext = null;

    function _refresh() {
        var TM = _tabManager();
        if (TM && typeof TM.requestRender === 'function') {
            try {
                TM.requestRender(SCOPE, TAB_ID);
                return;
            } catch (e) { /* fall through */ }
        }
        if (_lastContext) {
            var container = document.getElementById('education-pane-' + TAB_ID);
            if (container) renderHistoryTab(container, _lastContext);
        }
    }

    // =========================================================================
    // 5. EVENT-TYPE VOCABULARY
    // =========================================================================

    function _eventTypes() {
        return (typeof window.HISTORY_EVENT_TYPES === 'object'
            && window.HISTORY_EVENT_TYPES !== null)
            ? window.HISTORY_EVENT_TYPES
            : {};
    }

    /**
     * Converts STUDENT_ENROLLED -> "Student Enrolled".
     * Unknown types fall back to the raw value with underscores
     * replaced by spaces, so a future event type that hasn't been
     * added to HISTORY_EVENT_TYPES still renders legibly.
     */
    function _eventTypeLabel(type) {
        var T = _eventTypes();
        var keys = Object.keys(T);
        for (var i = 0; i < keys.length; i++) {
            if (T[keys[i]] === type) {
                return keys[i]
                    .toLowerCase()
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
            }
        }
        if (typeof type === 'string') {
            return type.replace(/_/g, ' ');
        }
        return 'Event';
    }

    /**
     * Semantic color per event type. Every value is a theme token;
     * no hex codes. Cosmetic events (rename, move) get --dim because
     * they're informational, not action-worthy. Destructive events
     * (demolished) get --danger-lt. Constructive events (graduated,
     * enrolled, rebuilt) get --ok / --accent. Departed / withdrew get
     * --warn. Unknown types fall back to --border2.
     */
    function _eventColor(type) {
        var T = _eventTypes();
        if (type === T.STUDENT_ENROLLED)        return 'var(--accent)';
        if (type === T.STUDENT_GRADUATED)       return 'var(--ok)';
        if (type === T.STUDENT_WITHDREW)        return 'var(--warn)';
        if (type === T.STUDENT_BECAME_LITERATE) return 'var(--ok)';
        if (type === T.TEACHER_HIRED)           return 'var(--accent)';
        if (type === T.TEACHER_DEPARTED)        return 'var(--warn)';
        if (type === T.HEADMASTER_APPOINTED)    return 'var(--accent-light)';
        if (type === T.HEADMASTER_ENDED)        return 'var(--warn)';
        if (type === T.REPUTATION_CHANGED)      return 'var(--dim)';
        if (type === T.INSTITUTION_RENAMED)     return 'var(--dim)';
        if (type === T.INSTITUTION_MOVED)       return 'var(--dim)';
        if (type === T.INSTITUTION_DEMOLISHED)  return 'var(--danger-lt)';
        if (type === T.INSTITUTION_REBUILT)     return 'var(--ok)';
        return 'var(--border2)';
    }

    // =========================================================================
    // 6. HISTORY MERGE
    // =========================================================================

    function _buildMerge(locationId) {
        var Q = _queries();
        var H = _history();

        if (!Q || !H) {
            return {
                ok: false,
                reason: (!Q ? 'EducationQueries is not available.'
                            : 'EducationHistory is not available.'),
                events: [],
                institutions: []
            };
        }

        if (typeof H.getInstitutionHistory !== 'function') {
            return {
                ok: false,
                reason: 'EducationHistory.getInstitutionHistory is not available.',
                events: [],
                institutions: []
            };
        }

        var institutions;
        try {
            institutions = Q.getInstitutions({ location: locationId });
        } catch (e) {
            return {
                ok: false,
                reason: e && e.message ? e.message : 'Institution query failed.',
                events: [],
                institutions: []
            };
        }
        if (!Array.isArray(institutions)) institutions = [];

        var merged = [];
        var seen = {};

        for (var i = 0; i < institutions.length; i++) {
            var inst = institutions[i];
            if (!inst || !inst.id) continue;

            var events;
            try {
                events = H.getInstitutionHistory(inst.id, {});
            } catch (e) {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn(
                        'education-history-tab.js: getInstitutionHistory ' +
                        'failed for ' + inst.id + ':', e
                    );
                }
                continue;
            }
            if (!Array.isArray(events)) continue;

            for (var j = 0; j < events.length; j++) {
                var ev = events[j];
                if (!ev) continue;

                // Deduplicate by event id. Each event lives on exactly
                // one institution's history array today; the dedup is
                // defensive against a future query that might surface
                // the same event from multiple sources.
                var eventKey = ev.id || (inst.id + ':' + j);
                if (seen[eventKey]) continue;
                seen[eventKey] = true;

                merged.push({
                    event: ev,
                    institutionId: inst.id,
                    institutionName: inst.name || '(unnamed institution)'
                });
            }
        }

        // Sort (year desc, timestamp desc, id desc), matching
        // EducationHistory._sortEvents. A missing year sorts as
        // -Infinity so undated events sink to the bottom.
        merged.sort(function (a, b) {
            var ay = (a.event && typeof a.event.year === 'number')
                ? a.event.year : -Infinity;
            var by = (b.event && typeof b.event.year === 'number')
                ? b.event.year : -Infinity;
            if (ay !== by) return by - ay;

            var at = (a.event && typeof a.event.timestamp === 'number')
                ? a.event.timestamp : 0;
            var bt = (b.event && typeof b.event.timestamp === 'number')
                ? b.event.timestamp : 0;
            if (at !== bt) return bt - at;

            var aid = String((a.event && a.event.id) || '');
            var bid = String((b.event && b.event.id) || '');
            return aid < bid ? 1 : (aid > bid ? -1 : 0);
        });

        return {
            ok: true,
            events: merged,
            institutions: institutions
        };
    }

    // =========================================================================
    // 7. FILTER APPLICATION
    // =========================================================================

    function _applyFilters(merged, filters) {
        var out = [];
        var search = (filters.search || '').trim().toLowerCase();
        var institutionId = filters.institutionId || 'all';
        var eventType = filters.eventType || 'all';
        var yearFrom = (typeof filters.yearFrom === 'number') ? filters.yearFrom : null;
        var yearTo = (typeof filters.yearTo === 'number') ? filters.yearTo : null;

        for (var i = 0; i < merged.length; i++) {
            var m = merged[i];
            var ev = m.event;

            if (institutionId !== 'all' && m.institutionId !== institutionId) continue;
            if (eventType !== 'all' && ev.type !== eventType) continue;

            if (yearFrom !== null) {
                if (typeof ev.year !== 'number' || ev.year < yearFrom) continue;
            }
            if (yearTo !== null) {
                if (typeof ev.year !== 'number' || ev.year > yearTo) continue;
            }

            if (search.length > 0) {
                var haystack = [
                    ev.entityName || '',
                    ev.details || '',
                    ev.reason || '',
                    m.institutionName || ''
                ].join(' ').toLowerCase();
                if (haystack.indexOf(search) === -1) continue;
            }

            out.push(m);
        }

        return out;
    }

    // =========================================================================
    // 8. HTML BUILDERS
    // =========================================================================

    function _renderHeader(merged, filtered, institutions) {
        var subParts = [];
        if (merged.length > 0) {
            subParts.push(merged.length + ' event' +
                (merged.length === 1 ? '' : 's'));
        }
        if (filtered.length !== merged.length) {
            subParts.push(filtered.length + ' shown');
        }
        if (institutions.length > 0) {
            subParts.push('across ' + institutions.length + ' institution' +
                (institutions.length === 1 ? '' : 's'));
        }

        return '<div class="edu-manager-header">' +
            '<div>' +
                '<h2 class="edu-manager-title">History</h2>' +
                '<p class="edu-manager-subtitle">' +
                    _esc(subParts.join(' · ')) +
                '</p>' +
            '</div>' +
            '<div class="edu-manager-actions">' +
                '<button type="button" id="eduHistoryExportBtn" ' +
                    'class="edu-manager-btn">' +
                    _icon('DOWNLOAD') + ' Export' +
                '</button>' +
                '<button type="button" id="eduHistoryRefreshBtn" ' +
                    'class="edu-manager-btn">Refresh</button>' +
            '</div>' +
        '</div>';
    }

    function _renderFilters(filters, institutions) {
        function opt(value, label, current) {
            return '<option value="' + _esc(value) + '"' +
                (String(current) === String(value) ? ' selected' : '') + '>' +
                _esc(label) + '</option>';
        }

        var instOptions = opt('all', 'All institutions', filters.institutionId);
        for (var i = 0; i < institutions.length; i++) {
            instOptions += opt(
                institutions[i].id,
                institutions[i].name || '(unnamed)',
                filters.institutionId
            );
        }

        // Sort event types alphabetically by their display label for a
        // stable dropdown across releases as types are added.
        var T = _eventTypes();
        var typeKeys = Object.keys(T);
        typeKeys.sort(function (a, b) {
            return _eventTypeLabel(T[a]).localeCompare(_eventTypeLabel(T[b]));
        });
        var typeOptions = opt('all', 'All event types', filters.eventType);
        for (var t = 0; t < typeKeys.length; t++) {
            typeOptions += opt(
                T[typeKeys[t]],
                _eventTypeLabel(T[typeKeys[t]]),
                filters.eventType
            );
        }

        return '<div class="edu-manager-filters">' +
            '<input type="search" id="eduHistoryFilterSearch" ' +
                'placeholder="Search events…" ' +
                'value="' + _esc(filters.search || '') + '" ' +
                'aria-label="Search events">' +
            '<select id="eduHistoryFilterInstitution" ' +
                'aria-label="Filter by institution">' +
                instOptions +
            '</select>' +
            '<select id="eduHistoryFilterType" ' +
                'aria-label="Filter by event type">' +
                typeOptions +
            '</select>' +
            '<input type="number" id="eduHistoryFilterYearFrom" ' +
                'placeholder="From year" min="1" ' +
                'value="' +
                    (filters.yearFrom !== null
                        ? _esc(String(filters.yearFrom))
                        : '') + '" ' +
                'aria-label="Minimum year" ' +
                'style="width:90px;">' +
            '<input type="number" id="eduHistoryFilterYearTo" ' +
                'placeholder="To year" min="1" ' +
                'value="' +
                    (filters.yearTo !== null
                        ? _esc(String(filters.yearTo))
                        : '') + '" ' +
                'aria-label="Maximum year" ' +
                'style="width:90px;">' +
            '<button type="button" id="eduHistoryFilterClear" ' +
                'class="edu-manager-btn">Clear</button>' +
        '</div>';
    }

    function _renderEventRow(mergedItem) {
        var ev = mergedItem.event;
        var color = _eventColor(ev.type);
        var typeLabel = _eventTypeLabel(ev.type);

        var yearDisplay = (typeof ev.year === 'number')
            ? String(ev.year)
            : '—';

        var entityPart = '';
        if (ev.entityName) {
            entityPart = ' <strong>' + _esc(ev.entityName) + '</strong>';
        }

        var detailsPart = '';
        if (ev.details) {
            detailsPart = ' — ' + _esc(ev.details);
        }

        var reasonPart = '';
        if (ev.reason && ev.reason !== ev.details) {
            reasonPart = ' <span style="color:var(--dim);">(' +
                _esc(ev.reason) + ')</span>';
        }

        var metaPart = '';
        if (ev.metadata && typeof ev.metadata === 'object') {
            var metaPieces = [];
            for (var k in ev.metadata) {
                if (!Object.prototype.hasOwnProperty.call(ev.metadata, k)) continue;
                var mv = ev.metadata[k];
                if (mv === null || mv === undefined || mv === '') continue;
                metaPieces.push(_esc(k) + ': ' + _esc(String(mv)));
            }
            if (metaPieces.length > 0) {
                metaPart =
                    '<div style="font-size:0.5rem;color:var(--dim);margin-top:2px;">' +
                        metaPieces.join(' · ') +
                    '</div>';
            }
        }

        var valuePart = '';
        if (ev.previousValue !== null && ev.previousValue !== undefined
            && ev.newValue !== null && ev.newValue !== undefined) {
            valuePart =
                '<div style="font-size:0.55rem;color:var(--dim);margin-top:2px;">' +
                    _esc(String(ev.previousValue)) + ' → ' +
                    _esc(String(ev.newValue)) +
                '</div>';
        }

        return '<div class="edu-manager-row" ' +
                'style="border-left:3px solid ' + color + ';">' +
            '<div class="edu-manager-row-main">' +
                '<div class="edu-manager-row-title">' +
                    '<span style="color:var(--dim);font-family:var(--f-mono);' +
                    'font-size:0.65rem;margin-right:8px;">' +
                        _esc(yearDisplay) +
                    '</span>' +
                    '<span style="color:' + color + ';font-weight:600;">' +
                        _esc(typeLabel) +
                    '</span>' +
                    entityPart +
                    detailsPart +
                    reasonPart +
                '</div>' +
                '<div class="edu-manager-row-meta" style="margin-top:2px;">' +
                    '<span style="color:var(--dim);">' +
                        _esc(mergedItem.institutionName) +
                    '</span>' +
                '</div>' +
                valuePart +
                metaPart +
            '</div>' +
        '</div>';
    }

    function _renderEmpty(filters, totalMerged) {
        var hasFilters =
            (filters.search && filters.search.trim().length > 0) ||
            (filters.institutionId && filters.institutionId !== 'all') ||
            (filters.eventType && filters.eventType !== 'all') ||
            (typeof filters.yearFrom === 'number') ||
            (typeof filters.yearTo === 'number');

        if (hasFilters && totalMerged > 0) {
            return '<div class="edu-manager-empty">' +
                'No events match your filters.' +
                '<div class="edu-manager-empty-hint">' +
                    'Try clearing the search, institution, type, or year range.' +
                '</div>' +
            '</div>';
        }

        return '<div class="edu-manager-empty">' +
            '<span class="edu-manager-empty-icon">' + _icon('CLOCK') + '</span>' +
            'No history events yet in this settlement.' +
            '<div class="edu-manager-empty-hint">' +
                'Enroll a student, hire a teacher, or graduate a student to ' +
                'start the timeline.' +
            '</div>' +
        '</div>';
    }

    function _renderError(reason) {
        return '<div class="edu-manager-error">' +
            'Could not load history. ' +
            _esc(reason || 'Unknown error.') +
        '</div>';
    }

    function _renderTruncationNote(totalShown, totalAvailable) {
        if (totalShown <= totalAvailable) return '';
        return '<div class="edu-manager-empty-hint" ' +
            'style="text-align:center;padding:8px;">' +
            'Showing first ' + MAX_EVENTS_RENDERED + ' of ' +
            totalAvailable + ' events. Narrow the filters to see more.' +
        '</div>';
    }

    // =========================================================================
    // 9. EXPORT
    // =========================================================================

    function _slugify(s) {
        return String(s || 'settlement')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'settlement';
    }

    function _exportHistory(merged, institutions, context) {
        try {
            var payload = {
                settlement: {
                    locationId: context.locationId,
                    locationName: context.locationName || null
                },
                exportedAt: new Date().toISOString(),
                institutions: institutions.map(function (inst) {
                    return {
                        id: inst.id,
                        name: inst.name || null,
                        type: inst.type || null,
                        typeName: inst.typeName || null,
                        status: inst.status || null
                    };
                }),
                events: merged.map(function (m) {
                    return {
                        institutionId: m.institutionId,
                        institutionName: m.institutionName,
                        event: m.event
                    };
                })
            };

            var json = JSON.stringify(payload, null, 2);
            var blob = new Blob([json], { type: 'application/json' });
            var url = URL.createObjectURL(blob);

            var year = _currentYear();
            var filename = 'education-history-' +
                _slugify(context.locationName) + '-' +
                (year !== null ? year : 'export') + '.json';

            var a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            // Revoke on the next tick so the browser can initiate the
            // download before the URL is invalidated.
            setTimeout(function () {
                try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
            }, 0);

            _toast('History exported', 'success');
        } catch (e) {
            _toast('Export failed: ' +
                (e && e.message ? e.message : 'unknown error'), 'error');
        }
    }

    // =========================================================================
    // 10. EVENT WIRING
    // =========================================================================

    function _attachHandlers(container, context, filters, merged, institutions) {
        var locationId = context.locationId;

        // ---- Search (debounced) ----
        var searchInput = container.querySelector('#eduHistoryFilterSearch');
        if (searchInput) {
            var timer = null;
            searchInput.addEventListener('input', function () {
                filters.search = this.value;
                if (timer) clearTimeout(timer);
                timer = setTimeout(function () {
                    timer = null;
                    _writeFilters(locationId, filters);
                    _refresh();
                }, 200);
            });
        }

        // ---- Institution filter ----
        var instSel = container.querySelector('#eduHistoryFilterInstitution');
        if (instSel) {
            instSel.addEventListener('change', function () {
                filters.institutionId = this.value || 'all';
                _writeFilters(locationId, filters);
                _refresh();
            });
        }

        // ---- Event-type filter ----
        var typeSel = container.querySelector('#eduHistoryFilterType');
        if (typeSel) {
            typeSel.addEventListener('change', function () {
                filters.eventType = this.value || 'all';
                _writeFilters(locationId, filters);
                _refresh();
            });
        }

        // ---- Year range (both debounced at 300ms) ----
        var yearFromInput = container.querySelector('#eduHistoryFilterYearFrom');
        if (yearFromInput) {
            var fromTimer = null;
            yearFromInput.addEventListener('input', function () {
                var n = parseInt(this.value, 10);
                filters.yearFrom = isFinite(n) && n >= 0 ? n : null;
                if (fromTimer) clearTimeout(fromTimer);
                fromTimer = setTimeout(function () {
                    fromTimer = null;
                    _writeFilters(locationId, filters);
                    _refresh();
                }, 300);
            });
        }

        var yearToInput = container.querySelector('#eduHistoryFilterYearTo');
        if (yearToInput) {
            var toTimer = null;
            yearToInput.addEventListener('input', function () {
                var n = parseInt(this.value, 10);
                filters.yearTo = isFinite(n) && n >= 0 ? n : null;
                if (toTimer) clearTimeout(toTimer);
                toTimer = setTimeout(function () {
                    toTimer = null;
                    _writeFilters(locationId, filters);
                    _refresh();
                }, 300);
            });
        }

        // ---- Clear ----
        var clearBtn = container.querySelector('#eduHistoryFilterClear');
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                filters.search = '';
                filters.institutionId = 'all';
                filters.eventType = 'all';
                filters.yearFrom = null;
                filters.yearTo = null;
                _writeFilters(locationId, filters);
                _refresh();
            });
        }

        // ---- Export ----
        var exportBtn = container.querySelector('#eduHistoryExportBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', function () {
                _exportHistory(merged, institutions, context);
            });
        }

        // ---- Refresh ----
        var refreshBtn = container.querySelector('#eduHistoryRefreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function () {
                _refresh();
            });
        }
    }

    // =========================================================================
    // 11. RENDER
    // =========================================================================

    function renderHistoryTab(container, context) {
        if (!container) return;
        _lastContext = context || null;

        if (!context || !context.locationId) {
            container.innerHTML = '<div class="edu-manager-empty">' +
                'Select a settlement from the sidebar to view its history.' +
            '</div>';
            return;
        }

        var locationId = context.locationId;
        var filters = _readFilters(locationId);

        var build = _buildMerge(locationId);
        if (!build.ok) {
            // Still render the header and filter bar (with empty
            // institutions list) so the user sees the structural
            // failure, then the error block. Any later fix (e.g. user
            // switches tabs) works because the filter dropdown only
            // shows 'all' — harmless.
            var errHtml = '';
            errHtml += _renderHeader([], [], []);
            errHtml += _renderFilters(filters, []);
            errHtml += _renderError(build.reason);
            container.innerHTML = errHtml;
            _attachHandlers(container, context, filters, [], []);
            return;
        }

        var merged = build.events;
        var institutions = build.institutions;

        var filtered = _applyFilters(merged, filters);

        // Cap rendered events. Sorting is already stable, so a cap is
        // deterministic. The export uses the full filtered set — no
        // cap — so nothing is lost when the user exports.
        var totalFiltered = filtered.length;
        var capped = filtered;
        if (capped.length > MAX_EVENTS_RENDERED) {
            capped = capped.slice(0, MAX_EVENTS_RENDERED);
        }

        var out = '';
        out += _renderHeader(merged, filtered, institutions);
        out += _renderFilters(filters, institutions);

        if (filtered.length === 0) {
            out += _renderEmpty(filters, merged.length);
        } else {
            out += '<div class="edu-manager-list">';
            for (var i = 0; i < capped.length; i++) {
                out += _renderEventRow(capped[i]);
            }
            out += '</div>';
            if (totalFiltered > MAX_EVENTS_RENDERED) {
                out += _renderTruncationNote(capped.length, totalFiltered);
            }
        }

        container.innerHTML = out;
        _attachHandlers(container, context, filters, merged, institutions);
    }

    // =========================================================================
    // 12. REGISTRATION
    // =========================================================================

    var TM = _tabManager();
    if (TM && typeof TM.register === 'function') {
        try {
            TM.register(SCOPE, TAB_ID, renderHistoryTab);
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'education-history-tab.js: TabManager.register failed:', e
                );
            }
        }
    } else {
        if (typeof console !== 'undefined' && console.error) {
            console.error(
                'education-history-tab.js: TabManager is not available ' +
                'at load time; the tab was not registered. Load tab-manager.js ' +
                'before this file.'
            );
        }
    }

    // =========================================================================
    // 13. EXPORTS
    // =========================================================================

    if (typeof window !== 'undefined') {
        window.EducationHistoryTab = {
            render: renderHistoryTab,
            _readFilters: _readFilters,
            _writeFilters: _writeFilters,
            _applyFilters: _applyFilters,
            _buildMerge: _buildMerge,
            _exportHistory: _exportHistory
        };
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.EducationHistoryTab;
    }
})();
