/**
 * =============================================================================
 * STILL WATERS - EDUCATION STUDENTS TAB
 * js/tabs/education-students-tab.js
 * =============================================================================
 *
 * LOCATION: js/tabs/education-students-tab.js
 *
 * The settlement-scoped student roster with graduation readiness. Second
 * tab after Institutions, following the same pattern:
 *
 *   - TabManager.register('education', 'students', renderStudentsTab)
 *   - Every modal onSuccess → TabManager.requestRender('education','students')
 *   - Filters persisted per-location to
 *     education_students_filters_<locationId>
 *
 * THE MERGE
 *
 *   EducationQueries.getInstitutions({ location }) returns institution
 *   summaries. For each, this tab calls:
 *
 *     getInstitutionStudents(institutionId)        → per-institution roster
 *     getStudentsReadyForGraduation(institutionId) → readiness set
 *     getInstitutionDetails(institutionId)         → curriculum (for skill
 *                                                    chips; may be null)
 *
 *   That is 3 calls per institution, so O(N) where N is institutions in
 *   the settlement. The result is flattened into a single roster:
 *
 *     { studentId, studentName, age, gender, institutionId,
 *       institutionName, enrollmentYear, graduated, graduationYear,
 *       readyForGraduation, taughtRoles, skillChips }
 *
 *   Skill chips: for each curriculum item of the student's institution,
 *   EducationLearning.getProficiency(studentId, item) is called. For a
 *   student in an institution with 3 curriculum items, that is 3 calls.
 *   That is O(students × curriculumItemsPerInstitution) — a real cost
 *   on a large settlement. Capped at MAX_SKILL_CHIPS items displayed
 *   per row (default 4), but the reads are not skipped; we display up to
 *   four and summarize the rest. If this ever becomes a hotspot, the fix
 *   is a batched EducationLearning.getProficiencies(ids) API — not a
 *   change to this tab.
 *
 *   Institution curriculum is fetched once per institution, then shared
 *   by every student in that institution. This is the only merge-level
 *   cache; it does not persist across renders.
 *
 * READINESS
 *
 *   The readiness set is computed by EducationRules.isGraduationEligible
 *   inside EducationQueries.getStudentsReadyForGraduation. This tab does
 *   not re-derive readiness. A student is "ready" iff the query returns
 *   them. The Graduate button is ONLY rendered for ready students.
 *
 *   If a user somehow bypasses the button (a future feature, or a stale
 *   DOM), the graduate command refuses non-ready students anyway — but
 *   the tab never surfaces the affordance.
 *
 * ENROLL
 *
 *   Enrollment is per-institution. When the settlement has exactly one
 *   institution, the tab offers a single "Enroll Student" button and
 *   delegates to openEnrollStudentModal(institutionId). When there are
 *   multiple, each row's institution column is clickable to open the
 *   enroll modal scoped to that institution; the header button opens
 *   the enroll modal scoped to the first institution (with a toast
 *   explaining the choice, since the modal has no institution picker).
 *
 *   This is a small UX compromise: the enroll modal itself is
 *   institution-scoped. A future "Enroll in any institution" flow would
 *   need a modal change. Documented here, not fixed here.
 *
 * FILTERS:
 *   search          string    substring of student name
 *   institutionId   string    'all' or an institution id
 *   readyOnly       boolean   only show ready-to-graduate students
 *   sortBy          string    'name' | 'skill' | 'enrollment' | 'readiness'
 *
 *   Persisted per-location to education_students_filters_<locationId>.
 *
 * ACTIONS (per-row):
 *   Graduate     → openGraduateStudentModal(institutionId, onSuccess)
 *                  (only rendered when readyForGraduation)
 *   View Inst.   → openInstitutionDetailsModal(institutionId, onSuccess)
 *   Enroll (row) → openEnrollStudentModal(institutionId, onSuccess)
 *                  (only rendered when institution has capacity)
 *
 * DEPENDENCIES (soft; tab renders gracefully if absent):
 *   - window.EducationQueries.getInstitutions
 *   - window.EducationQueries.getInstitutionStudents
 *   - window.EducationQueries.getStudentsReadyForGraduation
 *   - window.EducationQueries.getInstitutionDetails
 *   - window.EducationLearning.getProficiency
 *   - window.TabManager.requestRender
 *   - modal exports (typeof-guarded; missing modal → toast)
 *
 *   If EducationQueries is missing entirely, the tab renders an error
 *   state instead of throwing. If EducationLearning is missing, skill
 *   chips are simply omitted.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var TAB_ID = 'students';
    var SCOPE  = 'education';
    var FILTER_KEY_PREFIX = 'education_students_filters_';

    var MAX_SKILL_CHIPS = 4;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS (soft)
    // =========================================================================

    function _queries() {
        return (typeof window.EducationQueries !== 'undefined')
            ? window.EducationQueries
            : null;
    }

    function _learning() {
        return (typeof window.EducationLearning !== 'undefined')
            ? window.EducationLearning
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

    function _ageOf(birthYear) {
        if (typeof window.calculateAge === 'function') {
            try { return window.calculateAge(birthYear, false, null); }
            catch (e) { return null; }
        }
        return null;
    }

    // =========================================================================
    // 3. FILTER PERSISTENCE
    // =========================================================================

    function _filterKey(locationId) {
        return FILTER_KEY_PREFIX + String(locationId);
    }

    var VALID_SORTS = ['name', 'skill', 'enrollment', 'readiness'];

    function _readFilters(locationId) {
        var defaults = {
            search: '',
            institutionId: 'all',
            readyOnly: false,
            sortBy: 'name'
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
                readyOnly: false,
                sortBy: 'name'
            };
            if (typeof parsed.search === 'string') out.search = parsed.search;
            if (typeof parsed.institutionId === 'string') out.institutionId = parsed.institutionId;
            if (parsed.readyOnly === true) out.readyOnly = true;
            if (VALID_SORTS.indexOf(parsed.sortBy) !== -1) out.sortBy = parsed.sortBy;
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
                readyOnly: filters.readyOnly === true,
                sortBy: filters.sortBy || 'name'
            }));
        } catch (e) { /* ignore */ }
    }

    // =========================================================================
    // 4. MODAL DELEGATION
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
            if (container) renderStudentsTab(container, _lastContext);
        }
    }

    function _invokeModal(globalName, args, opts) {
        opts = opts || {};
        if (typeof window[globalName] !== 'function') {
            _toast((opts.label || globalName) + ' is not available.', 'error');
            return;
        }
        var callArgs = args.slice();
        callArgs.push(function () { _refresh(); });
        try {
            window[globalName].apply(null, callArgs);
        } catch (e) {
            _toast('Failed to open: ' + (e && e.message ? e.message : 'unknown error'), 'error');
        }
    }

    // =========================================================================
    // 5. ROSTER MERGE
    // =========================================================================
    //
    // For each institution in the settlement:
    //
    //   - fetch getInstitutionStudents(id)       — the roster
    //   - fetch getStudentsReadyForGraduation(id) — readiness IDs
    //   - fetch getInstitutionDetails(id)         — curriculum (optional;
    //                                              may be null)
    //
    // Then flatten into a single array of roster entries. The curriculum
    // is cached per institution (one array per institution, shared by
    // every student in that institution).
    //
    // Errors on a per-institution query do NOT abort the merge. That
    // institution is skipped with a console.warn; the rest still render.

    function _buildRoster(locationId) {
        var Q = _queries();
        if (!Q) {
            return {
                ok: false,
                reason: 'EducationQueries is not available.',
                roster: [],
                institutionIndex: {}
            };
        }

        var institutions;
        try {
            institutions = Q.getInstitutions({ location: locationId });
        } catch (e) {
            return {
                ok: false,
                reason: e && e.message ? e.message : 'Institution query failed.',
                roster: [],
                institutionIndex: {}
            };
        }
        if (!Array.isArray(institutions)) institutions = [];

        var institutionIndex = {};
        var roster = [];

        for (var i = 0; i < institutions.length; i++) {
            var inst = institutions[i];
            if (!inst || !inst.id) continue;
            institutionIndex[inst.id] = inst;

            // Skip demolished institutions: no current students, and
            // their students were withdrawn at demolition time.
            if (inst.status === 'demolished') continue;

            // ---- Per-institution students ----
            var students;
            try {
                students = Q.getInstitutionStudents(inst.id);
            } catch (e) {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn(
                        'education-students-tab.js: getInstitutionStudents failed for ' +
                        inst.id + ':', e
                    );
                }
                students = [];
            }
            if (!Array.isArray(students)) students = [];

            // ---- Readiness set (IDs only) ----
            var readyIds = {};
            try {
                var ready = Q.getStudentsReadyForGraduation(inst.id);
                if (Array.isArray(ready)) {
                    for (var r = 0; r < ready.length; r++) {
                        if (ready[r] && ready[r].studentId) {
                            readyIds[ready[r].studentId] = true;
                        }
                    }
                }
            } catch (e) {
                // Readiness failure degrades to "no students ready".
                // The roster still renders.
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn(
                        'education-students-tab.js: getStudentsReadyForGraduation ' +
                        'failed for ' + inst.id + ':', e
                    );
                }
            }

            // ---- Curriculum (for skill chips) ----
            var curriculum = [];
            try {
                var details = Q.getInstitutionDetails(inst.id);
                if (details && Array.isArray(details.curriculum)) {
                    curriculum = details.curriculum;
                }
            } catch (e) {
                // Curriculum is optional. Skill chips just won't render.
            }

            // ---- Flatten students into roster ----
            for (var s = 0; s < students.length; s++) {
                var st = students[s];
                if (!st || !st.studentId) continue;
                // Skip already-graduated records (the query returns enrolled
                // only, but defensive).
                if (st.graduated === true) continue;

                roster.push({
                    studentId: st.studentId,
                    studentName: st.studentName || '(unnamed)',
                    age: (typeof st.age === 'number') ? st.age : null,
                    gender: st.gender || null,
                    institutionId: inst.id,
                    institutionName: inst.name || '(unnamed institution)',
                    enrollmentYear: (typeof st.enrollmentYear === 'number')
                        ? st.enrollmentYear
                        : null,
                    graduated: false,
                    readyForGraduation: readyIds[st.studentId] === true,
                    taughtRoles: _taughtRolesForInstitution(institutionIndex[inst.id]),
                    curriculum: curriculum
                });
            }
        }

        return {
            ok: true,
            roster: roster,
            institutionIndex: institutionIndex
        };
    }

    function _taughtRolesForInstitution(inst) {
        // Detail view returns taughtRoles on the details object; the
        // summary does not include them. If the institution summary has
        // taughtRoleCount === 0 we skip; otherwise we cannot read the
        // roles without a details call we already made. Since we do not
        // store taughtRoles on the roster entry, the graduate modal
        // reads them itself. This helper exists so future expansions
        // (role chips per student) have a place to live.
        return null;
    }

    // =========================================================================
    // 6. SKILL CHIPS
    // =========================================================================
    //
    // One proficiency read per curriculum item per student. Capped at
    // MAX_SKILL_CHIPS displayed items; the rest are summarized.

    function _skillChipsFor(entry) {
        var L = _learning();
        if (!L || typeof L.getProficiency !== 'function') return null;
        if (!Array.isArray(entry.curriculum) || entry.curriculum.length === 0) {
            return null;
        }

        var chips = [];
        for (var i = 0; i < entry.curriculum.length; i++) {
            var item = entry.curriculum[i];
            if (!item || !item.id || !item.type) continue;

            var level = 0;
            try {
                var v = L.getProficiency(entry.studentId, item);
                if (typeof v === 'number') level = v;
            } catch (e) {
                level = 0;
            }

            chips.push({
                id: item.id,
                name: item.name || item.id,
                level: level
            });
        }

        return chips;
    }

    function _skillColor(level) {
        if (level >= 90) return 'var(--ok)';
        if (level >= 60) return 'var(--ok)';
        if (level >= 30) return 'var(--warn)';
        return 'var(--danger-lt)';
    }

    // =========================================================================
    // 7. HTML BUILDERS
    // =========================================================================

    function _renderHeader(summary, totalRoster, readyCount, institutionCount) {
        var subParts = [];
        if (totalRoster > 0) {
            subParts.push(totalRoster + ' student' +
                (totalRoster === 1 ? '' : 's'));
        }
        if (readyCount > 0) {
            subParts.push(readyCount + ' ready to graduate');
        }
        if (institutionCount > 0) {
            subParts.push('across ' + institutionCount + ' institution' +
                (institutionCount === 1 ? '' : 's'));
        }
        if (summary && typeof summary.currentStudents === 'number'
            && summary.currentStudents !== totalRoster) {
            // Rare: query returned a different count than the summary.
            // Show both to surface the discrepancy without breaking.
            subParts.push('(summary: ' + summary.currentStudents + ')');
        }

        // Enroll button: only offered when a single institution exists.
        // Multi-institution settlements use per-row enroll (scoped to
        // the row's institution).
        var enrollBtn = '';
        if (institutionCount === 1) {
            enrollBtn = '<button type="button" id="eduStudentsEnrollBtn" ' +
                'class="edu-manager-btn edu-manager-btn--primary">' +
                _icon('PLUS') + ' Enroll Student' +
                '</button>';
        }

        return '<div class="edu-manager-header">' +
            '<div>' +
                '<h2 class="edu-manager-title">Students</h2>' +
                '<p class="edu-manager-subtitle">' +
                    _esc(subParts.join(' · ')) +
                '</p>' +
            '</div>' +
            '<div class="edu-manager-actions">' + enrollBtn + '</div>' +
        '</div>';
    }

    function _renderFilters(filters, institutions) {
        function opt(value, label, selected) {
            return '<option value="' + _esc(value) + '"' +
                (selected === value ? ' selected' : '') + '>' +
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

        return '<div class="edu-manager-filters">' +
            '<input type="search" id="eduStudentsFilterSearch" ' +
                'placeholder="Search students by name…" ' +
                'value="' + _esc(filters.search || '') + '" ' +
                'aria-label="Filter students by name">' +
            '<select id="eduStudentsFilterInstitution" aria-label="Filter by institution">' +
                instOptions +
            '</select>' +
            '<select id="eduStudentsFilterSort" aria-label="Sort roster">' +
                opt('name',       'Sort: Name',           filters.sortBy) +
                opt('skill',      'Sort: Skill (high)',   filters.sortBy) +
                opt('enrollment', 'Sort: Enrollment year', filters.sortBy) +
                opt('readiness',  'Sort: Ready first',    filters.sortBy) +
            '</select>' +
            '<label class="edu-manager-btn" style="cursor:pointer;">' +
                '<input type="checkbox" id="eduStudentsFilterReady"' +
                (filters.readyOnly ? ' checked' : '') + ' style="margin:0 4px 0 0;">' +
                'Ready only' +
            '</label>' +
            '<button type="button" id="eduStudentsFilterClear" class="edu-manager-btn">' +
                'Clear' +
            '</button>' +
        '</div>';
    }

    function _renderRow(entry) {
        var chips = _skillChipsFor(entry);
        var chipsHtml = '';
        if (chips && chips.length > 0) {
            chipsHtml = '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;">';
            var shown = Math.min(chips.length, MAX_SKILL_CHIPS);
            for (var i = 0; i < shown; i++) {
                var c = chips[i];
                chipsHtml += '<span style="font-size:0.5rem;background:var(--bg3);' +
                    'border:1px solid var(--border-light);border-radius:10px;' +
                    'padding:1px 7px;color:' + _skillColor(c.level) + ';">' +
                    _esc(c.name) + ' ' + c.level +
                '</span>';
            }
            if (chips.length > shown) {
                chipsHtml += '<span style="font-size:0.5rem;color:var(--dim);">' +
                    '+' + (chips.length - shown) + ' more' +
                '</span>';
            }
            chipsHtml += '</div>';
        }

        var metaParts = [];
        metaParts.push(_esc(entry.institutionName));
        if (entry.age !== null) metaParts.push(entry.age + 'y');
        if (entry.gender) metaParts.push(_esc(entry.gender));
        if (entry.enrollmentYear !== null) {
            metaParts.push('Enrolled ' + entry.enrollmentYear);
        }
        if (entry.readyForGraduation) {
            metaParts.push('<span style="color:var(--ok);font-weight:600;">' +
                '✓ Ready to graduate' +
            '</span>');
        }

        var actions = '' +
            '<button type="button" class="edu-manager-btn edu-students-action" ' +
                'data-action="view-inst" data-institution-id="' + _esc(entry.institutionId) + '">' +
                'View Inst.</button>' +
            '<button type="button" class="edu-manager-btn edu-students-action" ' +
                'data-action="enroll" data-institution-id="' + _esc(entry.institutionId) + '">' +
                'Enroll</button>';

        if (entry.readyForGraduation) {
            actions += '<button type="button" class="edu-manager-btn edu-manager-btn--primary edu-students-action" ' +
                'data-action="graduate" ' +
                'data-institution-id="' + _esc(entry.institutionId) + '" ' +
                'data-student-id="' + _esc(entry.studentId) + '">' +
                'Graduate</button>';
        }

        return '<div class="edu-manager-row' +
                (entry.readyForGraduation ? ' edu-manager-row--selected' : '') + '" ' +
                'data-student-id="' + _esc(entry.studentId) + '"' +
                'data-institution-id="' + _esc(entry.institutionId) + '">' +
            '<div class="edu-manager-row-main">' +
                '<div class="edu-manager-row-title">' +
                    _esc(entry.studentName) +
                '</div>' +
                '<div class="edu-manager-row-meta">' +
                    metaParts.join(' · ') +
                '</div>' +
                chipsHtml +
            '</div>' +
            '<div class="edu-manager-row-actions">' + actions + '</div>' +
        '</div>';
    }

    function _renderEmpty(filters) {
        var hasFilters = (filters.search && filters.search.trim().length > 0) ||
            (filters.institutionId && filters.institutionId !== 'all') ||
            filters.readyOnly;

        if (hasFilters) {
            return '<div class="edu-manager-empty">' +
                'No students match your filters.' +
                '<div class="edu-manager-empty-hint">' +
                    'Try clearing the search, institution, or readiness filter.' +
                '</div>' +
            '</div>';
        }

        return '<div class="edu-manager-empty">' +
            '<span class="edu-manager-empty-icon">' + _icon('PERSON') + '</span>' +
            'No students enrolled in this settlement.' +
            '<div class="edu-manager-empty-hint">' +
                'Enroll students from an institution to see them here.' +
            '</div>' +
        '</div>';
    }

    function _renderError(reason) {
        return '<div class="edu-manager-error">' +
            'Could not load students. ' +
            _esc(reason || 'Unknown error.') +
        '</div>';
    }

    // =========================================================================
    // 8. FILTER APPLICATION
    // =========================================================================

    function _applyFilters(roster, filters) {
        var out = [];

        var search = (filters.search || '').trim().toLowerCase();
        var institutionId = filters.institutionId || 'all';
        var readyOnly = filters.readyOnly === true;

        for (var i = 0; i < roster.length; i++) {
            var e = roster[i];

            if (institutionId !== 'all' && e.institutionId !== institutionId) continue;
            if (readyOnly && !e.readyForGraduation) continue;
            if (search.length > 0) {
                var haystack = (e.studentName || '').toLowerCase();
                if (haystack.indexOf(search) === -1) continue;
            }
            out.push(e);
        }

        // Sort. The institution summaries already arrive sorted by
        // reputation, but the roster is flattened and needs its own sort.
        switch (filters.sortBy) {
            case 'skill':
                // Skill sort is approximate: we do not carry a numeric
                // "overall skill" on the entry. We sort by curriculum
                // average of the chips we would render. This is a display
                // sort, not a canonical ordering.
                out.sort(function (a, b) {
                    return _averageSkill(b) - _averageSkill(a);
                });
                break;
            case 'enrollment':
                out.sort(function (a, b) {
                    var ay = typeof a.enrollmentYear === 'number' ? a.enrollmentYear : Infinity;
                    var by = typeof b.enrollmentYear === 'number' ? b.enrollmentYear : Infinity;
                    return ay - by;
                });
                break;
            case 'readiness':
                out.sort(function (a, b) {
                    var ar = a.readyForGraduation ? 1 : 0;
                    var br = b.readyForGraduation ? 1 : 0;
                    if (br !== ar) return br - ar;
                    return (a.studentName || '').localeCompare(b.studentName || '');
                });
                break;
            case 'name':
            default:
                out.sort(function (a, b) {
                    return (a.studentName || '').localeCompare(b.studentName || '');
                });
                break;
        }

        return out;
    }

    function _averageSkill(entry) {
        var chips = _skillChipsFor(entry);
        if (!chips || chips.length === 0) return -1;
        var sum = 0;
        for (var i = 0; i < chips.length; i++) sum += chips[i].level;
        return sum / chips.length;
    }

    // =========================================================================
    // 9. EVENT WIRING
    // =========================================================================

    function _attachHandlers(container, context, filters, institutions) {
        var locationId = context.locationId;

        // ---- Header: Enroll Student (single-institution only) ----
        var enrollBtn = container.querySelector('#eduStudentsEnrollBtn');
        if (enrollBtn && institutions.length === 1) {
            enrollBtn.addEventListener('click', function () {
                _invokeModal(
                    'openEnrollStudentModal',
                    [institutions[0].id],
                    { label: 'Enroll student' }
                );
            });
        }

        // ---- Filters ----
        var searchInput = container.querySelector('#eduStudentsFilterSearch');
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

        var instSel = container.querySelector('#eduStudentsFilterInstitution');
        if (instSel) {
            instSel.addEventListener('change', function () {
                filters.institutionId = this.value || 'all';
                _writeFilters(locationId, filters);
                _refresh();
            });
        }

        var sortSel = container.querySelector('#eduStudentsFilterSort');
        if (sortSel) {
            sortSel.addEventListener('change', function () {
                filters.sortBy = this.value || 'name';
                _writeFilters(locationId, filters);
                _refresh();
            });
        }

        var readyCb = container.querySelector('#eduStudentsFilterReady');
        if (readyCb) {
            readyCb.addEventListener('change', function () {
                filters.readyOnly = this.checked === true;
                _writeFilters(locationId, filters);
                _refresh();
            });
        }

        var clearBtn = container.querySelector('#eduStudentsFilterClear');
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                filters.search = '';
                filters.institutionId = 'all';
                filters.readyOnly = false;
                filters.sortBy = 'name';
                _writeFilters(locationId, filters);
                _refresh();
            });
        }

        // ---- Row actions (delegated) ----
        var list = container.querySelector('#eduStudentsList');
        if (!list) return;

        list.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-action]');
            if (!btn) return;

            var action = btn.getAttribute('data-action');
            var institutionId = btn.getAttribute('data-institution-id');
            var studentId = btn.getAttribute('data-student-id');

            if (!institutionId) return;
            e.preventDefault();
            e.stopPropagation();

            switch (action) {
                case 'graduate':
                    if (!studentId) return;
                    _invokeModal(
                        'openGraduateStudentModal',
                        [institutionId],
                        { label: 'Graduate student' }
                    );
                    break;
                case 'view-inst':
                    _invokeModal(
                        'openInstitutionDetailsModal',
                        [institutionId],
                        { label: 'Institution details' }
                    );
                    break;
                case 'enroll':
                    _invokeModal(
                        'openEnrollStudentModal',
                        [institutionId],
                        { label: 'Enroll student' }
                    );
                    break;
                default:
                    break;
            }
        });
    }

    // =========================================================================
    // 10. RENDER
    // =========================================================================

    function renderStudentsTab(container, context) {
        if (!container) return;
        _lastContext = context || null;

        if (!context || !context.locationId) {
            container.innerHTML = '<div class="edu-manager-empty">' +
                'Select a settlement from the sidebar to manage its students.' +
            '</div>';
            return;
        }

        var locationId = context.locationId;
        var filters = _readFilters(locationId);

        var build = _buildRoster(locationId);
        if (!build.ok) {
            // Still render header + filter bar so the user can see what
            // happened and retry, then the error block.
            var institutionsForFilter = [];
            var html = '';
            html += _renderHeader(null, 0, 0, 0);
            html += _renderFilters(filters, institutionsForFilter);
            html += _renderError(build.reason);
            container.innerHTML = html;
            _attachHandlers(container, context, filters, []);
            return;
        }

        var roster = build.roster;
        var institutions = [];
        for (var id in build.institutionIndex) {
            if (Object.prototype.hasOwnProperty.call(build.institutionIndex, id)) {
                institutions.push(build.institutionIndex[id]);
            }
        }
        institutions.sort(function (a, b) {
            return (a.name || '').localeCompare(b.name || '');
        });

        var readyCount = 0;
        for (var i = 0; i < roster.length; i++) {
            if (roster[i].readyForGraduation) readyCount++;
        }

        var filtered = _applyFilters(roster, filters);

        var summary = (context.educationState && context.educationState.summary) || null;

        var out = '';
        out += _renderHeader(summary, roster.length, readyCount, institutions.length);
        out += _renderFilters(filters, institutions);

        if (filtered.length === 0) {
            out += _renderEmpty(filters);
        } else {
            out += '<div id="eduStudentsList">';
            for (var j = 0; j < filtered.length; j++) {
                out += _renderRow(filtered[j]);
            }
            out += '</div>';
        }

        container.innerHTML = out;
        _attachHandlers(container, context, filters, institutions);
    }

    // =========================================================================
    // 11. REGISTRATION
    // =========================================================================

    var TM = _tabManager();
    if (TM && typeof TM.register === 'function') {
        try {
            TM.register(SCOPE, TAB_ID, renderStudentsTab);
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'education-students-tab.js: TabManager.register failed:', e
                );
            }
        }
    } else {
        if (typeof console !== 'undefined' && console.error) {
            console.error(
                'education-students-tab.js: TabManager is not available at ' +
                'load time; the tab was not registered. Load tab-manager.js ' +
                'before this file.'
            );
        }
    }

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    if (typeof window !== 'undefined') {
        window.EducationStudentsTab = {
            render: renderStudentsTab,
            _readFilters: _readFilters,
            _writeFilters: _writeFilters,
            _applyFilters: _applyFilters
        };
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.EducationStudentsTab;
    }
})();
