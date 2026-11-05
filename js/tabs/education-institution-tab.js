/**
 * =============================================================================
 * STILL WATERS - EDUCATION INSTITUTIONS TAB
 * js/tabs/education-institutions-tab.js
 * =============================================================================
 *
 * LOCATION: js/tabs/education-institutions-tab.js
 *
 * The settlement-scoped institution list. The workhorse of the Education
 * Manager — the first tab after Overview, and the tab that proves the
 * onSuccess → TabManager.requestRender loop works end-to-end before the
 * remaining four tabs copy the pattern.
 *
 * CONTRACT (TabManager renderer):
 *
 *     function renderInstitutionsTab(container, context)
 *
 *   - container  HTMLElement  already emptied by TabManager
 *   - context    { locationId, locationName, educationState }
 *                guaranteed non-null; TabManager writes the no-context
 *                empty state before calling us
 *
 * READS:
 *   - context.educationState.summary          header counts (may be null
 *                                             on query failure; handled)
 *   - EducationQueries.getInstitutions({ location, ...filters })
 *   - EducationQueries.getInstitutionsNeedingTeachers(locationId)
 *
 * WRITES (delegated, never direct):
 *   - openCreateInstitutionModal(onSuccess, { locationId })
 *   - openInstitutionDetailsModal(id, onSuccess)
 *   - openEditInstitutionModal(id, onSuccess)
 *   - openTuitionManagementModal(id, onSuccess)
 *   - openOwnershipManagementModal(id, onSuccess)
 *   - openDeleteInstitutionModal(id, onSuccess)
 *
 *   Every onSuccess calls TabManager.requestRender('education',
 *   'institutions') so the pane refreshes without a full page reload.
 *   The bootstrap does NOT wrap the modal exports — the tab owns the
 *   refresh decision.
 *
 * FILTERS:
 *   search          string   substring of name or description
 *   ownershipType   'all' | 'public' | 'private' | 'religious'
 *
 *   Persisted per-location to:
 *     education_institutions_filters_<locationId>
 *
 *   Read once at render. Written on every filter change. Guards
 *   localStorage in try/catch (matches EducationUIState's discipline).
 *
 * ACTIONS (per-row buttons use .edu-manager-btn; click handlers attached
 * after innerHTML; each is scoped to a single row's data-institution-id):
 *
 *   View      → openInstitutionDetailsModal
 *   Edit      → openEditInstitutionModal
 *   Tuition   → openTuitionManagementModal   (public schools → the modal
 *                                              renders read-only, which is
 *                                              the modal's own contract)
 *   Ownership → openOwnershipManagementModal
 *   Delete    → openDeleteInstitutionModal
 *
 *   The tab does NOT call EducationCommands.persist(). Persistence is
 *   the modal's job. The tab only re-renders after the modal reports
 *   success.
 *
 * RENDERING:
 *   - Header: title + subtitle (counts from summary) + "New Institution"
 *   - Warning strip if institutions-needing-teachers is non-empty
 *   - Filter bar: search input + ownership select + clear
 *   - List: .edu-manager-row per institution
 *   - Empty state: "No institutions in this settlement" with a
 *     "Create one" button that opens the create modal
 *
 *   No setTimeout. No module-level _rendering guard. Event handlers
 *   attach after innerHTML and are scoped to the container.
 *
 * DEPENDENCIES (checked at render, not at load):
 *   - window.EducationQueries       (reads)
 *   - window.TabManager             (requestRender)
 *   - window.TAB_MANAGER_SCOPE? no — hardcoded 'education' string
 *   - modal exports are typeof-guarded; a missing modal shows a toast
 *     ("not available") rather than throwing
 *   - window._showToast / window.showToast (soft, via _toast)
 *   - window.Icons                  (soft, via _icon)
 *   - window.escapeHtml / _escapeHtml (soft, via _esc)
 *
 *   No hard load-time guard. If the tab file is accidentally loaded
 *   without EducationQueries, the first render fails gracefully with an
 *   error state instead of crashing the whole bootstrap.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var TAB_ID = 'institutions';
    var SCOPE  = 'education';
    var FILTER_KEY_PREFIX = 'education_institutions_filters_';

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS (soft)
    // =========================================================================

    function _queries() {
        return (typeof window.EducationQueries !== 'undefined')
            ? window.EducationQueries
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

    // =========================================================================
    // 3. FILTER PERSISTENCE
    // =========================================================================
    //
    // Per-location, per-tab, JSON-encoded. Guards localStorage in
    // try/catch (matches EducationUIState's STORAGE FAILURES contract).

    function _filterKey(locationId) {
        return FILTER_KEY_PREFIX + String(locationId);
    }

    function _readFilters(locationId) {
        var defaults = { search: '', ownershipType: 'all' };
        if (!locationId) return defaults;
        try {
            if (typeof localStorage === 'undefined') return defaults;
            var raw = localStorage.getItem(_filterKey(locationId));
            if (!raw) return defaults;
            var parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return defaults;

            var out = { search: '', ownershipType: 'all' };
            if (typeof parsed.search === 'string') out.search = parsed.search;
            if (parsed.ownershipType === 'public'
                || parsed.ownershipType === 'private'
                || parsed.ownershipType === 'religious'
                || parsed.ownershipType === 'all') {
                out.ownershipType = parsed.ownershipType;
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
                ownershipType: filters.ownershipType || 'all'
            }));
        } catch (e) { /* ignore */ }
    }

    // =========================================================================
    // 4. SUMMARY READ
    // =========================================================================
    //
    // The summary in context.educationState is computed once per render
    // by the bootstrap. On a query failure it is null and the fields
    // are mirrored into summaryError. This tab reads the summary when
    // available and falls back to counting the filtered list when not.

    function _safeSummary(context) {
        if (!context || !context.educationState) return null;
        return context.educationState.summary || null;
    }

    // =========================================================================
    // 5. QUERY
    // =========================================================================

    function _getInstitutions(locationId, filters) {
        var Q = _queries();
        if (!Q) return { ok: false, reason: 'EducationQueries is not available.', institutions: [] };

        var query = { location: locationId };
        if (filters.ownershipType && filters.ownershipType !== 'all') {
            query.ownershipType = filters.ownershipType;
        }
        if (filters.search && filters.search.trim().length > 0) {
            query.search = filters.search.trim();
        }

        try {
            var list = Q.getInstitutions(query);
            return { ok: true, institutions: Array.isArray(list) ? list : [] };
        } catch (e) {
            return {
                ok: false,
                reason: e && e.message ? e.message : 'Institution query failed.',
                institutions: []
            };
        }
    }

    function _getInstitutionsNeedingTeachers(locationId) {
        var Q = _queries();
        if (!Q || typeof Q.getInstitutionsNeedingTeachers !== 'function') {
            return { ok: false, count: 0, institutions: [] };
        }
        try {
            // getInstitutionsNeedingTeachers does not take a location in the
            // query API. Filter the returned list by locationId client-side.
            // This is O(institutions) once per render; acceptable.
            var all = Q.getInstitutionsNeedingTeachers();
            var scoped = [];
            for (var i = 0; i < all.length; i++) {
                if (all[i] && all[i].locationId === locationId) {
                    scoped.push(all[i]);
                }
            }
            return { ok: true, count: scoped.length, institutions: scoped };
        } catch (e) {
            return { ok: false, count: 0, institutions: [] };
        }
    }

    // =========================================================================
    // 6. MODAL DELEGATION
    // =========================================================================
    //
    // Every modal call goes through this helper, which:
    //   - checks the global is a function
    //   - wires the tab's onSuccess to TabManager.requestRender
    //   - toasts "not available" if the modal is missing
    //
    // A missing modal does NOT throw. A missing TabManager does NOT throw;
    // it falls back to a direct render call so the tab still refreshes
    // (degraded but functional).

    function _refresh() {
        var TM = _tabManager();
        if (TM && typeof TM.requestRender === 'function') {
            try {
                TM.requestRender(SCOPE, TAB_ID);
                return;
            } catch (e) { /* fall through */ }
        }
        // Fallback: no TabManager. Re-render the current pane directly
        // using the last known context.
        if (_lastContext) {
            var container = document.getElementById('education-pane-' + TAB_ID);
            if (container) renderInstitutionsTab(container, _lastContext);
        }
    }

    function _invokeModal(globalName, args, opts) {
        opts = opts || {};
        if (typeof window[globalName] !== 'function') {
            _toast((opts.label || globalName) + ' is not available.', 'error');
            return;
        }
        // Append the refresh callback as the last argument. Every
        // education modal takes a trailing onSuccess function.
        var callArgs = args.slice();
        callArgs.push(function () { _refresh(); });
        try {
            window[globalName].apply(null, callArgs);
        } catch (e) {
            _toast('Failed to open: ' + (e && e.message ? e.message : 'unknown error'), 'error');
        }
    }

    // =========================================================================
    // 7. HTML BUILDERS
    // =========================================================================

    function _ownershipBadge(ownershipType) {
        // Reuse the generic ownership presentation from EducationUI if it's
        // loaded. Otherwise emit a minimal inline-badge so the list is still
        // readable.
        if (window.EducationUI && typeof window.EducationUI.getOwnershipBadge === 'function') {
            try {
                return window.EducationUI.getOwnershipBadge(ownershipType, null);
            } catch (e) { /* fall through */ }
        }
        var label = 'Unknown';
        if (ownershipType === 'public')    label = 'Public';
        else if (ownershipType === 'private')   label = 'Private';
        else if (ownershipType === 'religious') label = 'Religious';
        return '<span style="font-size:0.55rem;color:var(--dim);">' +
            _esc(label) + '</span>';
    }

    function _statusBadge(status) {
        if (window.EducationUI && typeof window.EducationUI.getStatusBadge === 'function') {
            try {
                return window.EducationUI.getStatusBadge(status);
            } catch (e) { /* fall through */ }
        }
        if (status === 'demolished') {
            return '<span style="font-size:0.55rem;color:var(--danger-lt);">Demolished</span>';
        }
        return '<span style="font-size:0.55rem;color:var(--ok);">Active</span>';
    }

    function _renderHeader(summary, totalCount, needingTeachersCount) {
        var subParts = [];
        if (summary) {
            subParts.push(summary.institutionCount + ' institution' +
                (summary.institutionCount === 1 ? '' : 's'));
            subParts.push(summary.currentStudents + ' student' +
                (summary.currentStudents === 1 ? '' : 's'));
        } else if (totalCount > 0) {
            subParts.push(totalCount + ' institution' + (totalCount === 1 ? '' : 's'));
        }
        if (needingTeachersCount > 0) {
            subParts.push(needingTeachersCount + ' needing teacher' +
                (needingTeachersCount === 1 ? '' : 's'));
        }

        return '<div class="edu-manager-header">' +
            '<div>' +
                '<h2 class="edu-manager-title">Institutions</h2>' +
                '<p class="edu-manager-subtitle">' +
                    _esc(subParts.join(' · ')) +
                '</p>' +
            '</div>' +
            '<div class="edu-manager-actions">' +
                '<button type="button" id="eduInstNewBtn" class="edu-manager-btn edu-manager-btn--primary">' +
                    _icon('PLUS') + ' New Institution' +
                '</button>' +
            '</div>' +
        '</div>';
    }

    function _renderWarning(needingTeachers) {
        if (!needingTeachers || needingTeachers.length === 0) return '';

        // Show up to three names, then a count.
        var names = [];
        var limit = Math.min(needingTeachers.length, 3);
        for (var i = 0; i < limit; i++) {
            names.push(needingTeachers[i].institutionName || '(unnamed)');
        }
        var more = needingTeachers.length > limit
            ? ' and ' + (needingTeachers.length - limit) + ' more'
            : '';

        return '<div class="edu-manager-warning">' +
            _icon('WARNING') +
            '<div>' +
                '<strong>' + needingTeachers.length + ' institution' +
                    (needingTeachers.length === 1 ? '' : 's') +
                    ' need' + (needingTeachers.length === 1 ? 's' : '') +
                    ' a teacher.</strong> ' +
                _esc(names.join(', ') + more) +
            '</div>' +
        '</div>';
    }

    function _renderFilters(filters) {
        function opt(value, label) {
            var sel = (filters.ownershipType === value) ? ' selected' : '';
            return '<option value="' + _esc(value) + '"' + sel + '>' +
                _esc(label) + '</option>';
        }

        return '<div class="edu-manager-filters">' +
            '<input type="search" id="eduInstFilterSearch" ' +
                'placeholder="Search institutions…" ' +
                'value="' + _esc(filters.search || '') + '" ' +
                'aria-label="Filter institutions by name or description">' +
            '<select id="eduInstFilterOwnership" aria-label="Filter by ownership type">' +
                opt('all',       'All ownership') +
                opt('public',    'Public') +
                opt('private',   'Private') +
                opt('religious', 'Religious') +
            '</select>' +
            '<button type="button" id="eduInstFilterClear" class="edu-manager-btn">' +
                'Clear' +
            '</button>' +
        '</div>';
    }

    function _renderRow(inst) {
        var isDemolished = inst.status === 'demolished';

        var metaParts = [];
        metaParts.push(_esc(inst.typeName || inst.type || 'Unknown'));
        metaParts.push(_esc(inst.locationName || 'Unknown'));
        metaParts.push('<span style="color:' +
            _reputationColor(inst.reputation) + ';">Rep ' +
            _esc(inst.reputation) + '</span>');
        if (inst.headmasterName) {
            metaParts.push('Head: ' + _esc(inst.headmasterName));
        }

        var capacity = '';
        if (inst.maxStudents > 0) {
            capacity = inst.currentStudentCount + '/' + inst.maxStudents +
                ' (' + inst.utilization + '%)';
        } else {
            capacity = String(inst.currentStudentCount) + ' students';
        }

        var actionButtons = '' +
            '<button type="button" class="edu-manager-btn edu-inst-action" ' +
                'data-action="view" data-institution-id="' + _esc(inst.id) + '">View</button>' +
            '<button type="button" class="edu-manager-btn edu-inst-action" ' +
                'data-action="edit" data-institution-id="' + _esc(inst.id) + '"' +
                (isDemolished ? ' disabled' : '') + '>Edit</button>' +
            '<button type="button" class="edu-manager-btn edu-inst-action" ' +
                'data-action="tuition" data-institution-id="' + _esc(inst.id) + '"' +
                (isDemolished ? ' disabled' : '') + '>Tuition</button>' +
            '<button type="button" class="edu-manager-btn edu-inst-action" ' +
                'data-action="ownership" data-institution-id="' + _esc(inst.id) + '"' +
                (isDemolished ? ' disabled' : '') + '>Ownership</button>' +
            '<button type="button" class="edu-manager-btn edu-manager-btn--danger edu-inst-action" ' +
                'data-action="delete" data-institution-id="' + _esc(inst.id) + '"' +
                (isDemolished ? ' disabled' : '') + '>Delete</button>';

        return '<div class="edu-manager-row' +
                (isDemolished ? ' edu-manager-row--selected' : '') + '" ' +
                'data-institution-id="' + _esc(inst.id) + '"' +
                (isDemolished ? ' style="opacity:0.6;"' : '') + '>' +
            '<div class="edu-manager-row-main">' +
                '<div class="edu-manager-row-title">' +
                    _esc(inst.name || '(unnamed institution)') +
                '</div>' +
                '<div class="edu-manager-row-meta">' +
                    metaParts.join(' · ') +
                    ' · ' + _esc(capacity) +
                    ' · ' + _statusBadge(inst.status) +
                    ' ' + _ownershipBadge(inst.ownershipType) +
                '</div>' +
            '</div>' +
            '<div class="edu-manager-row-actions">' +
                actionButtons +
            '</div>' +
        '</div>';
    }

    function _reputationColor(rep) {
        var n = typeof rep === 'number' ? rep : 50;
        if (n >= 80) return 'var(--ok)';
        if (n >= 60) return 'var(--ok)';
        if (n >= 40) return 'var(--warn)';
        if (n >= 20) return 'var(--warn)';
        return 'var(--danger-lt)';
    }

    function _renderEmpty(filters) {
        var hasFilters = (filters.search && filters.search.trim().length > 0) ||
            (filters.ownershipType && filters.ownershipType !== 'all');

        if (hasFilters) {
            return '<div class="edu-manager-empty">' +
                'No institutions match your filters.' +
                '<div class="edu-manager-empty-hint">' +
                    'Try clearing the search or ownership filter.' +
                '</div>' +
            '</div>';
        }

        return '<div class="edu-manager-empty">' +
            '<span class="edu-manager-empty-icon">' + _icon('HOME') + '</span>' +
            'No institutions in this settlement yet.' +
            '<div class="edu-manager-empty-hint">' +
                'Create one to begin enrolling students and hiring teachers.' +
            '</div>' +
        '</div>';
    }

    function _renderError(reason) {
        return '<div class="edu-manager-error">' +
            'Could not load institutions. ' +
            _esc(reason || 'Unknown error.') +
        '</div>';
    }

    // =========================================================================
    // 8. EVENT WIRING
    // =========================================================================

    function _attachHandlers(container, context, filters, renderedList) {
        var locationId = context.locationId;

        // ---- Header: New Institution ----
        var newBtn = container.querySelector('#eduInstNewBtn');
        if (newBtn) {
            newBtn.addEventListener('click', function () {
                _invokeModal(
                    'openCreateInstitutionModal',
                    [null, { locationId: locationId }],
                    { label: 'Create institution' }
                );
            });
        }

        // ---- Filters ----
        var searchInput = container.querySelector('#eduInstFilterSearch');
        if (searchInput) {
            // Debounce 200 ms so typing does not re-render per keystroke.
            // Local debounce (not window.debounce) so this file has no
            // hard collection.js dependency.
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

        var ownershipSel = container.querySelector('#eduInstFilterOwnership');
        if (ownershipSel) {
            ownershipSel.addEventListener('change', function () {
                filters.ownershipType = this.value || 'all';
                _writeFilters(locationId, filters);
                _refresh();
            });
        }

        var clearBtn = container.querySelector('#eduInstFilterClear');
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                filters.search = '';
                filters.ownershipType = 'all';
                _writeFilters(locationId, filters);
                _refresh();
            });
        }

        // ---- Row actions (delegated) ----
        // Single listener on the list container; dispatch by data-action.
        // Avoids per-row handler allocation and survives a re-render
        // without rebinding.
        var list = container.querySelector('#eduInstList');
        if (!list) return;

        list.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-action]');
            if (!btn) return;
            var action = btn.getAttribute('data-action');
            var institutionId = btn.getAttribute('data-institution-id');
            if (!institutionId) return;

            e.preventDefault();
            e.stopPropagation();

            switch (action) {
                case 'view':
                    _invokeModal(
                        'openInstitutionDetailsModal',
                        [institutionId],
                        { label: 'Institution details' }
                    );
                    break;
                case 'edit':
                    _invokeModal(
                        'openEditInstitutionModal',
                        [institutionId],
                        { label: 'Edit institution' }
                    );
                    break;
                case 'tuition':
                    _invokeModal(
                        'openTuitionManagementModal',
                        [institutionId],
                        { label: 'Tuition management' }
                    );
                    break;
                case 'ownership':
                    _invokeModal(
                        'openOwnershipManagementModal',
                        [institutionId],
                        { label: 'Ownership management' }
                    );
                    break;
                case 'delete':
                    _invokeModal(
                        'openDeleteInstitutionModal',
                        [institutionId],
                        { label: 'Delete institution' }
                    );
                    break;
                default:
                    break;
            }
        });
    }

    // =========================================================================
    // 9. RENDER
    // =========================================================================

    var _lastContext = null;

    function renderInstitutionsTab(container, context) {
        if (!container) return;
        _lastContext = context || null;

        // Defensive: TabManager guarantees a non-null context, but a
        // direct render call might not. Fail safe.
        if (!context || !context.locationId) {
            container.innerHTML = '<div class="edu-manager-empty">' +
                'Select a settlement from the sidebar to manage its institutions.' +
            '</div>';
            return;
        }

        var locationId = context.locationId;

        // Read persisted filters.
        var filters = _readFilters(locationId);

        // Query the institutions with those filters.
        var result = _getInstitutions(locationId, filters);

        // Query the "needing teachers" list for the warning strip. This is
        // a separate query; on failure the strip is simply omitted.
        var needingTeachersResult = _getInstitutionsNeedingTeachers(locationId);
        var needingTeachers = needingTeachersResult.institutions || [];

        var summary = _safeSummary(context);

        // Compose.
        var html = '';
        html += _renderHeader(summary, result.institutions.length, needingTeachers.length);
        html += _renderWarning(needingTeachers);
        html += _renderFilters(filters);

        if (!result.ok) {
            html += _renderError(result.reason);
        } else if (result.institutions.length === 0) {
            html += _renderEmpty(filters);
        } else {
            html += '<div id="eduInstList">';
            for (var i = 0; i < result.institutions.length; i++) {
                html += _renderRow(result.institutions[i]);
            }
            html += '</div>';
        }

        container.innerHTML = html;

        // Attach handlers only after the DOM is in place. No global
        // document.getElementById; every lookup is scoped to the container.
        _attachHandlers(container, context, filters, result.institutions);
    }

    // =========================================================================
    // 10. REGISTRATION
    // =========================================================================

    var TM = _tabManager();
    if (TM && typeof TM.register === 'function') {
        try {
            TM.register(SCOPE, TAB_ID, renderInstitutionsTab);
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'education-institutions-tab.js: TabManager.register failed:', e
                );
            }
        }
    } else {
        if (typeof console !== 'undefined' && console.error) {
            console.error(
                'education-institutions-tab.js: TabManager is not available at ' +
                'load time; the tab was not registered. Load tab-manager.js ' +
                'before this file.'
            );
        }
    }

    // =========================================================================
    // 11. EXPORTS (for tests and future direct callers)
    // =========================================================================

    if (typeof window !== 'undefined') {
        window.EducationInstitutionsTab = {
            render: renderInstitutionsTab,
            // Exposed for tests: not part of the TabManager contract.
            _readFilters: _readFilters,
            _writeFilters: _writeFilters
        };
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.EducationInstitutionsTab;
    }
})();
