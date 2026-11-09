/**
 * =============================================================================
 * EVENTS SURROGACY TAB
 * js/tabs/events-surrogacy-tab.js
 * =============================================================================
 *
 * LOCATION: js/tabs/events-surrogacy-tab.js
 *
 * The Events Manager's Surrogacy tab. This tab is the PRIMARY WRITE
 * SURFACE for surrogacy arrangements: every child born through
 * ChildrenCommands.recordSurrogacyArrangement enters the world
 * through the flow this tab exposes.
 *
 * Renders every surrogacy arrangement record in the world, grouped
 * by status (Active → Completed → Cancelled), sorted within each
 * group by the caller-selected sort key. Provides filter controls,
 * a surrogacy-specific stats bar, a prominent "New Arrangement"
 * action, and per-row Complete / Cancel actions on active records.
 *
 * RENDERER CONTRACT (from EventsManagerBootstrap):
 *   fn(container, context)
 *   container  HTMLElement  -- already emptied by TabManager
 *   context    { locationId, locationName, eventsState }
 *
 * DATA SOURCES:
 *   EventsQueries.getSurrogacyRecords(locationId)
 *   EventsViewModels.toSurrogacyRow / toSurrogacyRows
 *                   .toSurrogacyStatusFilterOptions
 *                   .toSurrogacyTypeFilterOptions
 *                   .toSurrogacySortOptions
 *                   .toSurrogacyStatsBarViewModel
 *                   .surrogacyStatusPriority
 *   EventsUIList.renderSurrogacyTabBody / renderOptionList
 *                   .renderChildCircles
 *   UIState.getFilters / setFilters
 *   CharacterQueries.getAllCharacters  (for the New Arrangement
 *                                       intended-parent picker)
 *   window.openSurrogacyArrangementModal(intendedParentId, onSuccess)
 *   window.openCompleteSurrogacyModal(arrangementId, onSuccess)
 *   window.openCancelSurrogacyModal(arrangementId, onSuccess)
 *
 * FILTERS (persisted per location via UIState):
 *   search           string
 *   status           'all' | 'active' | 'completed' | 'cancelled'
 *   type             'all' | 'traditional' | 'gestational'
 *   sortBy           'year' | 'intendedName' | 'surrogateName'
 *   showAllLocations boolean (default true)
 *   collapsed        boolean (filters collapsed)
 *
 * ACTION SET:
 *   Top of tab:  New Arrangement (primary action)
 *   Active:      Complete, Cancel  (per-row, both prominent)
 *   Completed:   none (terminal state)
 *   Cancelled:   none (terminal state)
 *
 * THE WRITE FLOW:
 *   "New Arrangement" opens openSurrogacyArrangementModal with the
 *   selected intended parent. The modal owns the wizard (surrogate,
 *   partner, donors, type, child count, birth year). On success,
 *   ChildrenCommands.recordSurrogacyArrangement creates the
 *   arrangement AND the children (if the birth year is <= the
 *   current year) in a single transaction.
 *
 *   "Complete" opens openCompleteSurrogacyModal. That modal only
 *   flips the status to 'completed' and sets actualBirthYear -- it
 *   does NOT create children (children are created at arrangement
 *   time by recordSurrogacyArrangement). A completed arrangement
 *   with childIds === [] is possible and legitimate; the row renders
 *   it honestly ("Completed with no children recorded").
 *
 *   "Cancel" opens openCancelSurrogacyModal. Flips status to
 *   'cancelled'; children are never touched.
 *
 * CREATE FLOW — INLINE PICKER, NOT A NULL-ARG MODAL:
 *   openSurrogacyArrangementModal REQUIRES an intendedParentId. It
 *   does not accept null. This tab therefore shows a small picker
 *   above the list: a single <select> of living characters,
 *   followed by a "New Arrangement" button. On submit, the tab
 *   calls openSurrogacyArrangementModal with the selected id.
 *
 *   This is intentionally simpler than the adoption tab's two-
 *   picker bar: the adoption modal needs child + adopter (two
 *   roles), but the surrogacy modal only needs intended parent +
 *   surrogate, and the surrogate is picked INSIDE the wizard. So
 *   only the intended parent needs an inline picker here.
 *
 * DELEGATED EVENTS:
 *   One click listener on the tab container (attached once via
 *   container.__eventsSurrogacyWired).
 *     data-action="new-surrogacy"
 *     data-action="complete-surrogacy"  data-surrogacy-id=<id>
 *     data-action="cancel-surrogacy"    data-surrogacy-id=<id>
 *     data-action="open-character"      data-character-id=<id>
 *     data-action="refresh"
 *     data-action="clear-filters"
 *     data-action="toggle-collapse"
 *   Input/change listeners on the search box and filter selects are
 *   attached per render (they are new elements every render).
 *
 * FILTER APPLICATION:
 *   - status    narrows the rendered status groups (an empty group
 *               is omitted entirely)
 *   - type      narrows the rows within each group (the type filter
 *               is orthogonal to the status grouping)
 *   - search    matches intended parent, intended partner,
 *               surrogate, sperm donor, egg donor names
 *   The status grouping itself is stable: groups render in a fixed
 *   order (active → completed → cancelled) regardless of filters
 *   or sort. Filters remove groups; they never reorder them.
 *
 * DEPENDENCIES (all soft; guarded at call time):
 *   - EventsQueries         REQUIRED
 *   - EventsViewModels      REQUIRED
 *   - EventsUIList          REQUIRED
 *   - EventsConstants       REQUIRED
 *   - TabManager            REQUIRED for registration
 *   - formatting.js escapeHtml  REQUIRED (via EventsUIList at load)
 *   - icons.js getIcon          REQUIRED (via EventsUIList at load)
 *   - ui.js showToast       OPTIONAL (silent if absent)
 *   - UIState               REQUIRED (filters persistence)
 *   - CharacterQueries      OPTIONAL (only used to populate the
 *                           New Arrangement picker; if absent, the
 *                           picker block renders a disabled hint
 *                           and the button is disabled)
 *   - window.openSurrogacyArrangementModal OPTIONAL (toast if absent)
 *   - window.openCompleteSurrogacyModal    OPTIONAL (toast if absent)
 *   - window.openCancelSurrogacyModal      OPTIONAL (toast if absent)
 *   - window.openCharacterDetailsModal     OPTIONAL (silent no-op
 *                                          when absent -- the circle
 *                                          and party clicks would
 *                                          otherwise do nothing)
 *
 * TIME CONTRACT: uses window.getCurrentYear (no fallback).
 * ICON POLICY: no emojis, no Unicode glyphs. Icons via EventsUIList.icon.
 * =============================================================================
 *
 * REFACTOR HISTORY:
 *   Initial revision (Phase 3C).
 *     - Ported the create / complete / cancel surrogacy flows from
 *       modals-children-surrogacy.js into a per-row tab surface.
 *     - The tab is treated as the PRIMARY WRITE SURFACE for the
 *       surrogacy facet: it is where children are born. The
 *       "New Arrangement" action is prominent (accent-colored button
 *       in the filter bar header, above the picker), the intro line
 *       explains that arrangements produce children, and the
 *       per-row Complete action is a prominent accent button, not a
 *       small inline icon.
 *     - Inline intended-parent picker (single <select> populated
 *       from CharacterQueries.getAllCharacters, filtered to living
 *       characters) is used INSTEAD of delegating picker selection
 *       to the modal, because openSurrogacyArrangementModal
 *       requires the intended parent id.
 *     - Filters (search, status, type, sortBy) persist per-location
 *       via UIState (key: 'events-surrogacy:<locationId|all>').
 *     - Filters reset on location change via _lastPanelId.
 *     - Surrogacy-specific stats bar (Total / Active / Completed /
 *       Cancelled / Children / Traditional / Gestational) computed
 *       by toSurrogacyStatsBarViewModel from the already-fetched
 *       records.
 *     - Delegated click handler lives on the tab container,
 *       guarded by container.__eventsSurrogacyWired.
 *     - Filter inputs wired per render (they're new elements).
 *     - Three-way empty state (no-surrogacies / no-matches /
 *       unavailable).
 *     - The "Completed with no children recorded" warning renders
 *       honestly in the row's children block (from the view model's
 *       childrenMissingDespiteCompletion flag) rather than an empty
 *       child circles block that would look like a rendering bug.
 *     - No setTimeout. No document.getElementById outside
 *       _ensureStyles. No literal Unicode glyphs. No hardcoded
 *       colors. No inline writes.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var TAB_ID = 'surrogacy';
    var SCOPE  = 'events';

    // Fixed group render order. This is a UI contract, not a
    // preference: users learn that active arrangements appear
    // first, and switching the order based on a filter would be
    // disorienting.
    var STATUS_GROUP_ORDER = ['active', 'completed', 'cancelled'];

    // =========================================================================
    // 2. DEPENDENCY ACCESSORS
    // =========================================================================

    function _queries()           { return window.EventsQueries || null; }
    function _vm()                { return window.EventsViewModels || null; }
    function _ui()                { return window.EventsUIList || null; }
    function _constants()         { return window.EventsConstants || null; }
    function _tabManager()        { return window.TabManager || null; }
    function _uiState()           { return window.UIState || null; }
    function _characterQueries()  { return window.CharacterQueries || null; }

    function _toast(msg, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, type);
        }
    }

    function _esc(v) {
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(v == null ? '' : String(v));
        }
        return '';
    }

    function _icon(name) {
        if (typeof window.getIcon === 'function') {
            return window.getIcon(name, 'CIRCLE');
        }
        return '';
    }

    // =========================================================================
    // 3. PANEL ID
    // =========================================================================

    function _panelId(locationId) {
        var C = _constants();
        var base = C ? C.panelIdFor(TAB_ID) : ('events-' + TAB_ID);
        return base + ':' + (locationId || 'all');
    }

    // =========================================================================
    // 4. FILTER STATE
    // =========================================================================

    var _state = null;
    var _lastPanelId = null;

    function _defaultFilters() {
        var C = _constants();
        if (C && typeof C.getDefaultFiltersForFacet === 'function') {
            return C.getDefaultFiltersForFacet(TAB_ID);
        }
        return {
            search: '',
            status: 'all',
            type: 'all',
            sortBy: 'year',
            locationId: null,
            showAllLocations: true,
            collapsed: false
        };
    }

    function _readFilters(panelId) {
        var U = _uiState();
        if (!U) return _defaultFilters();
        var stored = U.getFilters(panelId);
        if (!stored || typeof stored !== 'object') return _defaultFilters();

        var base = _defaultFilters();
        for (var key in stored) {
            if (Object.prototype.hasOwnProperty.call(stored, key)) {
                base[key] = stored[key];
            }
        }
        return base;
    }

    function _writeFilters(panelId, filters) {
        var U = _uiState();
        if (!U) return;
        U.setFilters(panelId, filters);
    }

    // =========================================================================
    // 5. FILTER APPLICATION
    // =========================================================================

    function _applyFilters(records, filters) {
        if (!Array.isArray(records)) return [];

        var status = filters.status || 'all';
        var type = filters.type || 'all';
        var search = (typeof filters.search === 'string')
            ? filters.search.trim().toLowerCase()
            : '';

        var filtered = [];
        for (var i = 0; i < records.length; i++) {
            var r = records[i];
            if (!r) continue;
            if (status !== 'all' && r.status !== status) continue;
            if (type !== 'all' && r.type !== type) continue;

            if (search.length > 0) {
                // Search across every party. The intended parent,
                // intended partner, surrogate, and both donors are
                // all legitimately "who this arrangement involves",
                // so a search by any of their names should find it.
                var hay = '';
                if (r.intendedParent) {
                    hay += ' ' + (r.intendedParent.name || '')
                         + ' ' + (r.intendedParent.surname || '');
                }
                if (r.intendedPartner) {
                    hay += ' ' + (r.intendedPartner.name || '')
                         + ' ' + (r.intendedPartner.surname || '');
                }
                if (r.surrogate) {
                    hay += ' ' + (r.surrogate.name || '')
                         + ' ' + (r.surrogate.surname || '');
                }
                if (r.spermDonor) {
                    hay += ' ' + (r.spermDonor.name || '')
                         + ' ' + (r.spermDonor.surname || '');
                }
                if (r.eggDonor) {
                    hay += ' ' + (r.eggDonor.name || '')
                         + ' ' + (r.eggDonor.surname || '');
                }
                if (hay.toLowerCase().indexOf(search) === -1) {
                    continue;
                }
            }

            filtered.push(r);
        }
        return filtered;
    }

    // =========================================================================
    // 6. GROUPING
    // =========================================================================
    //
    // Groups the filtered rows by status, sorts within each group by
    // the caller-selected sortBy. The groups themselves render in a
    // fixed order (active → completed → cancelled) so the UI is
    // stable across renders.
    //
    // Within each group, rows sort by:
    //   - statusPriority (defensive; all rows in a group have the
    //     same status, so this is a no-op for the visible ordering,
    //     but it protects the grouping invariant if a filter is ever
    //     added that crosses statuses)
    //   - then the caller-selected sortBy

    function _groupByStatus(filteredRecords, filters) {
        var sortBy = filters.sortBy || 'year';
        var VM = _vm();

        var buckets = { active: [], completed: [], cancelled: [] };

        for (var i = 0; i < filteredRecords.length; i++) {
            var r = filteredRecords[i];
            if (!r) continue;
            var bucket = buckets[r.status];
            if (!bucket) continue; // unknown status; skip defensively
            bucket.push(r);
        }

        for (var s = 0; s < STATUS_GROUP_ORDER.length; s++) {
            var statusKey = STATUS_GROUP_ORDER[s];
            var list = buckets[statusKey];
            list.sort(function(a, b) {
                // Defensive: status priority first. In practice all
                // rows here share a status, so this is a no-op for
                // the visible ordering.
                var pa = VM && typeof VM.surrogacyStatusPriority === 'function'
                    ? VM.surrogacyStatusPriority(a.status)
                    : 0;
                var pb = VM && typeof VM.surrogacyStatusPriority === 'function'
                    ? VM.surrogacyStatusPriority(b.status)
                    : 0;
                if (pa !== pb) return pa - pb;

                if (sortBy === 'intendedName') {
                    var an = a.intendedParent
                        ? ((a.intendedParent.name || '') + ' ' +
                           (a.intendedParent.surname || '')).trim()
                        : '';
                    var bn = b.intendedParent
                        ? ((b.intendedParent.name || '') + ' ' +
                           (b.intendedParent.surname || '')).trim()
                        : '';
                    return an.localeCompare(bn);
                }
                if (sortBy === 'surrogateName') {
                    var as = a.surrogate
                        ? ((a.surrogate.name || '') + ' ' +
                           (a.surrogate.surname || '')).trim()
                        : '';
                    var bs = b.surrogate
                        ? ((b.surrogate.name || '') + ' ' +
                           (b.surrogate.surname || '')).trim()
                        : '';
                    return as.localeCompare(bs);
                }
                // year (default, descending -- newest first)
                var ya = (typeof a.arrangementYear === 'number') ? a.arrangementYear : 0;
                var yb = (typeof b.arrangementYear === 'number') ? b.arrangementYear : 0;
                if (ya !== yb) return yb - ya;
                return String(a.id).localeCompare(String(b.id));
            });
        }

        var groups = [];
        for (var g = 0; g < STATUS_GROUP_ORDER.length; g++) {
            var statusId = STATUS_GROUP_ORDER[g];
            var rows = buckets[statusId];
            if (rows.length === 0) continue;
            groups.push({
                statusId: statusId,
                statusLabel: VM && typeof VM.surrogacyStatusLabel === 'function'
                    ? VM.surrogacyStatusLabel(statusId)
                    : statusId,
                statusIconName: VM && typeof VM.surrogacyStatusIconName === 'function'
                    ? VM.surrogacyStatusIconName(statusId)
                    : 'CIRCLE',
                rows: rows
            });
        }

        return groups;
    }

    // =========================================================================
    // 7. EMPTY-STATE CASE DETECTION
    // =========================================================================
    //
    // Cases:
    //   'unavailable'            records query failed
    //   'no-surrogacies'         zero records exist at all (before filters)
    //   'no-active-surrogacies'  records exist but filters exclude all
    //   null                     filtered records exist; render the groups

    function _detectEmptyState(recordsResult, totalRecordCount, filteredCount) {
        if (!recordsResult || recordsResult.available !== true) {
            return 'unavailable';
        }
        if (totalRecordCount === 0) return 'no-surrogacies';
        if (filteredCount === 0) return 'no-active-surrogacies';
        return null;
    }

    // =========================================================================
    // 8. INLINE NEW ARRANGEMENT BLOCK
    // =========================================================================
    //
    // The create modal requires an intended parent id. This block
    // collects it inline via a single <select> populated from
    // CharacterQueries.getAllCharacters, filtered to living
    // characters.
    //
    // If CharacterQueries is absent, the picker renders an
    // "unavailable" hint and the New Arrangement button is disabled.
    // That is a legitimate reduced-harness state, not an error.

    function _populateSelectOptions(selectEl, characters, placeholderText) {
        if (!selectEl) return;
        selectEl.innerHTML = '';

        var placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = placeholderText;
        selectEl.appendChild(placeholder);

        for (var i = 0; i < characters.length; i++) {
            var c = characters[i];
            if (!c || !c.id) continue;
            var name = ((c.name || '') + ' ' + (c.surname || '')).trim();
            if (!name) name = c.id;
            if (typeof c.age === 'number') name += ' (' + c.age + 'y)';
            var opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = name;
            selectEl.appendChild(opt);
        }
    }

    function _livingCharacters() {
        var CQ = _characterQueries();
        if (!CQ || typeof CQ.getAllCharacters !== 'function') return null;
        var all;
        try { all = CQ.getAllCharacters(); }
        catch (e) { return null; }
        if (!Array.isArray(all)) return null;

        var out = [];
        for (var i = 0; i < all.length; i++) {
            var c = all[i];
            if (!c || !c.id) continue;
            if (c.isDeceased === true) continue;
            if (c.isDeleted === true) continue;
            out.push(c);
        }
        return out;
    }

    function _renderNewArrangementBlock(context) {
        var characters = _livingCharacters();
        var hasCharacters = Array.isArray(characters);

        var disabledAttr = hasCharacters ? '' : ' disabled';
        var hint = hasCharacters
            ? ''
            : '<div class="events-surrogacy-new__hint">' +
              'Character picker unavailable: CharacterQueries is not loaded.' +
              '</div>';

        var introText = '';
        var C = _constants();
        if (C && C.UI_COPY && typeof C.UI_COPY.surrogacyIntro === 'string') {
            introText = '<div class="events-surrogacy-new__intro">' +
                _esc(C.UI_COPY.surrogacyIntro) +
                '</div>';
        }

        var html = '<div class="events-surrogacy-new">';
        html += '<div class="events-surrogacy-new__header">' +
            _icon('GUARDIANSHIP') +
            '<span>New Surrogacy Arrangement</span>' +
            '</div>';
        if (introText) html += introText;
        html += '<div class="events-surrogacy-new__pickers">';
        html += '<label class="events-surrogacy-new__field">' +
            '<span>Intended Parent</span>' +
            '<select class="ev-surrogacy-input events-surrogacy-new__select" ' +
            'data-input="new-intended-parent-id"' + disabledAttr + '>' +
            '<option value="">Select an intended parent…</option>' +
            '</select>' +
            '</label>';
        html += '<button type="button" class="events-surrogacy-new__create" ' +
            'data-action="new-surrogacy"' + disabledAttr + '>' +
            _icon('CHECK_SIMPLE') + '<span>New Arrangement</span></button>';
        html += '</div>';
        html += hint;
        html += '</div>';
        return html;
    }

    function _wireNewArrangementBlock(container) {
        var characters = _livingCharacters();
        if (!Array.isArray(characters)) return;

        var parentSelect = container.querySelector(
            '[data-input="new-intended-parent-id"]'
        );
        if (parentSelect) {
            _populateSelectOptions(
                parentSelect,
                characters,
                'Select an intended parent…'
            );
        }
    }

    // =========================================================================
    // 9. FILTER BAR
    // =========================================================================

    function _renderFilterBar(context, filters) {
        var C = _constants();
        var VM = _vm();
        var U = _ui();
        if (!C || !VM || !U) return '';

        var statusOpts = VM.toSurrogacyStatusFilterOptions(filters.status);
        var typeOpts = VM.toSurrogacyTypeFilterOptions(filters.type);
        var sortOpts = VM.toSurrogacySortOptions(filters.sortBy);

        var showAllLocations = filters.showAllLocations === true;
        var locationName = (context && context.locationName) ? context.locationName : '';
        var collapsed = filters.collapsed === true;
        var collapseIconName = collapsed ? 'TRIANGLE_DOWN' : 'TRIANGLE_UP';

        var html = '';
        html += '<div class="events-filters events-filters--surrogacy">';

        // Header line
        html += '<div class="events-filters__header">';
        html += '<button type="button" class="events-filters__collapse" ' +
            'data-action="toggle-collapse" aria-label="Toggle filters">' +
            _icon(collapseIconName) +
            '<span>Filters</span>' +
            '</button>';

        html += '<label class="events-filters__scope">';
        html += '<input type="checkbox" class="ev-surrogacy-input" ' +
            'data-input="show-all-locations"' +
            (showAllLocations ? ' checked' : '') + '>';
        html += '<span>Show all locations</span>';
        html += '</label>';

        if (!showAllLocations && locationName) {
            html += '<span class="events-filters__scope-name">' +
                _esc(locationName) + '</span>';
        }

        html += '<span class="events-filters__spacer"></span>';

        html += '<button type="button" class="events-filters__clear" ' +
            'data-action="clear-filters" aria-label="Clear filters">' +
            _icon('X_HEAVY') +
            '<span>Clear</span>' +
            '</button>';
        html += '<button type="button" class="events-filters__refresh" ' +
            'data-action="refresh" aria-label="Refresh">' +
            _icon('REFRESH') +
            '<span>Refresh</span>' +
            '</button>';
        html += '</div>';

        // Body of filters (collapses)
        html += '<div class="events-filters__body"' +
            (collapsed ? ' style="display:none;"' : '') + '>';

        html += '<input type="search" class="ev-surrogacy-input events-filters__search" ' +
            'data-input="search" placeholder="Search by name…" ' +
            'value="' + _esc(filters.search || '') + '">';

        html += '<select class="ev-surrogacy-input events-filters__select" data-input="status">' +
            U.renderOptionList(statusOpts) + '</select>';
        html += '<select class="ev-surrogacy-input events-filters__select" data-input="type">' +
            U.renderOptionList(typeOpts) + '</select>';
        html += '<select class="ev-surrogacy-input events-filters__select" data-input="sortBy">' +
            U.renderOptionList(sortOpts) + '</select>';

        html += '</div>';
        html += '</div>';
        return html;
    }

    // =========================================================================
    // 10. MAIN RENDER
    // =========================================================================

    function renderSurrogacyTab(container, context) {
        if (!container) return;

        var q = _queries();
        var VM = _vm();
        var U = _ui();
        var C = _constants();

        if (!q || !VM || !U || !C) {
            container.innerHTML =
                '<div class="events-unavailable">' +
                _esc('Events module is not fully loaded. Check that ' +
                     'events-constants.js, events-queries.js, ' +
                     'events-view-models.js, events-ui-list.js are loaded.') +
                '</div>';
            return;
        }

        // Resolve scope + filters
        var locationId = (context && context.locationId) || null;
        var panelId = _panelId(locationId);
        if (_lastPanelId !== panelId) {
            _state = _readFilters(panelId);
            _lastPanelId = panelId;
        }
        if (!_state) _state = _defaultFilters();

        // Fetch
        var effectiveLocationId = _state.showAllLocations ? null : locationId;
        var result = q.getSurrogacyRecords(effectiveLocationId);

        if (!result || result.available !== true) {
            container.innerHTML =
                '<div class="events-unavailable">' +
                _esc('Surrogacy records are not available: ' +
                     (result && result.reason ? result.reason : 'unknown')) +
                '</div>';
            return;
        }

        var records = Array.isArray(result.records) ? result.records : [];
        var totalRecordCount = records.length;

        // Filter + group
        var filtered = _applyFilters(records, _state);
        var statusGroups = _groupByStatus(filtered, _state);

        // Empty state detection
        var emptyState = _detectEmptyState(result, totalRecordCount, filtered.length);
        var emptyStateOptions = emptyState
            ? _emptyStateOptions(emptyState)
            : null;

        // Surrogacy-specific stats bar (computed from the RAW
        // records, not the filtered set -- the stats bar describes
        // the world, the filters narrow the list below it).
        var statsBar = VM.toSurrogacyStatsBarViewModel(records);

        // Build the HTML
        var filterBarHtml = _renderFilterBar(
            { locationId: locationId, locationName: context && context.locationName },
            _state
        );
        var newArrangementHtml = _renderNewArrangementBlock(context);
        var bodyHtml = U.renderSurrogacyTabBody({
            statsBar: statsBar,
            statusGroups: statusGroups,
            emptyState: emptyState,
            emptyStateOptions: emptyStateOptions
        });

        container.innerHTML =
            '<div class="events-surrogacy-tab">' +
            filterBarHtml +
            newArrangementHtml +
            bodyHtml +
            '</div>';

        // Wire
        _wireFilterInputs(container, locationId);
        _wireNewArrangementBlock(container);
        _wireDelegatedHandlers(container, locationId);
    }

    function _emptyStateOptions(caseId) {
        var options = {};
        if (caseId === 'no-active-surrogacies') {
            options.extraHint = 'Try clearing filters or widening the search.';
        }
        if (caseId === 'no-surrogacies') {
            options.extraHint =
                'Use the New Surrogacy Arrangement block above to create one.';
        }
        return options;
    }

    // =========================================================================
    // 11. FILTER INPUT WIRING (per-render, fresh elements)
    // =========================================================================

    function _wireFilterInputs(container, locationId) {
        var U = _uiState();
        if (!U) return;

        var panelId = _panelId(locationId);

        function commit(patch) {
            for (var key in patch) {
                if (Object.prototype.hasOwnProperty.call(patch, key)) {
                    _state[key] = patch[key];
                }
            }
            _writeFilters(panelId, _state);
            _refresh();
        }

        var inputs = container.querySelectorAll('.ev-surrogacy-input');
        for (var i = 0; i < inputs.length; i++) {
            (function(input) {
                var key = input.getAttribute('data-input');
                if (!key) return;
                // The new-arrangement picker is wired by
                // _wireNewArrangementBlock, not by this loop.
                if (key === 'new-intended-parent-id') return;

                // Search input: debounced.
                if (input.type === 'search') {
                    var timer = null;
                    input.addEventListener('input', function() {
                        if (timer) clearTimeout(timer);
                        timer = setTimeout(function() {
                            timer = null;
                            commit({ search: input.value || '' });
                        }, 200);
                    });
                    return;
                }

                if (input.type === 'checkbox') {
                    input.addEventListener('change', function() {
                        if (key === 'show-all-locations') {
                            commit({ showAllLocations: input.checked === true });
                            return;
                        }
                    });
                    return;
                }

                if (input.tagName === 'SELECT') {
                    input.addEventListener('change', function() {
                        var patch = {};
                        patch[key] = input.value;
                        commit(patch);
                    });
                    return;
                }
            })(inputs[i]);
        }
    }

    // =========================================================================
    // 12. DELEGATED CLICK HANDLER
    // =========================================================================

    function _wireDelegatedHandlers(container, locationId) {
        if (container.__eventsSurrogacyWired) return;
        container.__eventsSurrogacyWired = true;

        container.addEventListener('click', function(e) {
            var target = e.target;
            if (!target || typeof target.closest !== 'function') return;

            var actionEl = target.closest('[data-action]');
            if (!actionEl || !container.contains(actionEl)) return;

            var action = actionEl.getAttribute('data-action');

            if (action === 'new-surrogacy') {
                e.preventDefault();
                _handleNewArrangement(container);
                return;
            }

            if (action === 'complete-surrogacy') {
                e.preventDefault();
                e.stopPropagation();
                var completeId = actionEl.getAttribute('data-surrogacy-id');
                if (completeId) _openCompleteSurrogacy(completeId);
                return;
            }

            if (action === 'cancel-surrogacy') {
                e.preventDefault();
                e.stopPropagation();
                var cancelId = actionEl.getAttribute('data-surrogacy-id');
                if (cancelId) _openCancelSurrogacy(cancelId);
                return;
            }

            if (action === 'open-character') {
                e.preventDefault();
                e.stopPropagation();
                var charId = actionEl.getAttribute('data-character-id');
                if (charId) _openCharacterDetails(charId);
                return;
            }

            if (action === 'refresh') {
                e.preventDefault();
                _refresh();
                return;
            }

            if (action === 'clear-filters') {
                e.preventDefault();
                _clearFilters(locationId);
                return;
            }

            if (action === 'toggle-collapse') {
                e.preventDefault();
                _state.collapsed = !_state.collapsed;
                _writeFilters(_panelId(locationId), _state);
                _refresh();
                return;
            }
        });

        // Keyboard: Enter / Space on a child-circle button (which
        // is a <button>, so it should already work, but the row
        // itself is not focusable, so the browser's default
        // button behavior is what fires the delegated click
        // above -- no extra handler needed). We do add a keydown
        // delegate for the picker selects when they are focused
        // inside the container, so tabbing through the picker and
        // pressing Enter still triggers the New Arrangement
        // button if it has focus, matching default browser
        // behavior. This is a defensive block for the case where
        // a future style change alters focus visuals but leaves
        // the button's native activation intact.
        container.addEventListener('keydown', function(e) {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            var btn = e.target && e.target.closest
                ? e.target.closest('.events-surrogacy-new__create')
                : null;
            if (!btn || !container.contains(btn)) return;
            if (e.target !== btn) return;
            e.preventDefault();
            _handleNewArrangement(container);
        });
    }

    // =========================================================================
    // 13. ACTION HANDLERS
    // =========================================================================

    function _handleNewArrangement(container) {
        var selectEl = container.querySelector(
            '[data-input="new-intended-parent-id"]'
        );
        var intendedParentId = selectEl ? selectEl.value : '';

        if (!intendedParentId) {
            _toast('Please select an intended parent.', 'error');
            return;
        }

        if (typeof window.openSurrogacyArrangementModal !== 'function') {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    '[events-surrogacy-tab] openSurrogacyArrangementModal ' +
                    'is not loaded; load modals-children-surrogacy.js.'
                );
            }
            _toast(
                'New arrangement is unavailable: the surrogacy modal is not loaded.',
                'error'
            );
            return;
        }

        var result = window.openSurrogacyArrangementModal(
            intendedParentId,
            function() {
                _refresh();
            }
        );
        if (!result || result.success !== true) {
            _toast(
                'Could not open surrogacy arrangement modal: ' +
                (result && result.reason ? result.reason : 'unknown'),
                'error'
            );
        }
    }

    function _openCompleteSurrogacy(arrangementId) {
        if (typeof window.openCompleteSurrogacyModal !== 'function') {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    '[events-surrogacy-tab] openCompleteSurrogacyModal ' +
                    'is not loaded; load modals-children-surrogacy.js.'
                );
            }
            _toast(
                'Complete is unavailable: the surrogacy modal is not loaded.',
                'error'
            );
            return;
        }
        var result = window.openCompleteSurrogacyModal(arrangementId, function() {
            _refresh();
        });
        if (!result || result.success !== true) {
            _toast(
                'Could not open complete-arrangement modal: ' +
                (result && result.reason ? result.reason : 'unknown'),
                'error'
            );
        }
    }

    function _openCancelSurrogacy(arrangementId) {
        if (typeof window.openCancelSurrogacyModal !== 'function') {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    '[events-surrogacy-tab] openCancelSurrogacyModal ' +
                    'is not loaded; load modals-children-surrogacy.js.'
                );
            }
            _toast(
                'Cancel is unavailable: the surrogacy modal is not loaded.',
                'error'
            );
            return;
        }
        var result = window.openCancelSurrogacyModal(arrangementId, function() {
            _refresh();
        });
        if (!result || result.success !== true) {
            _toast(
                'Could not open cancel-arrangement modal: ' +
                (result && result.reason ? result.reason : 'unknown'),
                'error'
            );
        }
    }

    function _openCharacterDetails(characterId) {
        if (typeof window.openCharacterDetailsModal !== 'function') {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    '[events-surrogacy-tab] openCharacterDetailsModal is not loaded.'
                );
            }
            return;
        }
        window.openCharacterDetailsModal(characterId);
    }

    // =========================================================================
    // 14. FILTER RESET
    // =========================================================================

    function _clearFilters(locationId) {
        var defaults = _defaultFilters();
        _state = {
            search: defaults.search,
            status: defaults.status,
            type: defaults.type,
            sortBy: defaults.sortBy,
            showAllLocations: _state.showAllLocations,
            collapsed: _state.collapsed
        };
        _writeFilters(_panelId(locationId), _state);
        _refresh();
        _toast('Filters cleared.', 'info');
    }

    // =========================================================================
    // 15. REFRESH
    // =========================================================================

    function _refresh() {
        var TM = _tabManager();
        if (TM && typeof TM.requestRender === 'function') {
            TM.requestRender(SCOPE, TAB_ID);
        }
    }

    // =========================================================================
    // 16. STYLES
    // =========================================================================
    //
    // The base .events-filters, .events-stats-bar, .events-list,
    // .events-empty, .events-unavailable, and .events-stork-child-
    // circles classes are defined by other tab files' injected
    // stylesheets. This stylesheet adds the classes specific to the
    // surrogacy facet: the new-arrangement block, the status group
    // containers, the two-line row, and the genetic-parents line.
    //
    // Active rows get an accent left border (the "work in flight");
    // completed rows get a success left border; cancelled rows get a
    // dim left border. That is the tab's visual signature for "this
    // is what I do".

    function _ensureStyles() {
        if (document.getElementById('events-surrogacy-tab-styles')) return;
        var style = document.createElement('style');
        style.id = 'events-surrogacy-tab-styles';
        style.textContent = [
            '.events-surrogacy-tab {',
            '  display: flex;',
            '  flex-direction: column;',
            '  gap: 0.75rem;',
            '}',

            // Filter bar additions
            '.events-filters--surrogacy .events-filters__body {',
            '  gap: 0.5rem;',
            '  flex-wrap: wrap;',
            '}',

            // New arrangement block
            '.events-surrogacy-new {',
            '  display: flex;',
            '  flex-direction: column;',
            '  gap: 0.5rem;',
            '  padding: 0.5rem 0.75rem;',
            '  background: var(--bg2);',
            '  border: 1px solid var(--border);',
            '  border-radius: var(--radius);',
            '}',
            '.events-surrogacy-new__header {',
            '  display: flex;',
            '  align-items: center;',
            '  gap: 0.375rem;',
            '  font-family: var(--f-display);',
            '  font-size: 0.6rem;',
            '  text-transform: uppercase;',
            '  letter-spacing: 0.06em;',
            '  color: var(--accent);',
            '}',
            '.events-surrogacy-new__header svg {',
            '  width: 0.9em;',
            '  height: 0.9em;',
            '  fill: currentColor;',
            '}',
            '.events-surrogacy-new__intro {',
            '  font-size: 0.65rem;',
            '  line-height: 1.5;',
            '  color: var(--dim);',
            '}',
            '.events-surrogacy-new__pickers {',
            '  display: flex;',
            '  gap: 0.5rem;',
            '  align-items: flex-end;',
            '  flex-wrap: wrap;',
            '}',
            '.events-surrogacy-new__field {',
            '  display: flex;',
            '  flex-direction: column;',
            '  gap: 0.1875rem;',
            '  flex: 1 1 12rem;',
            '  min-width: 0;',
            '  font-size: 0.55rem;',
            '  text-transform: uppercase;',
            '  letter-spacing: 0.05em;',
            '  color: var(--dim);',
            '}',
            '.events-surrogacy-new__select {',
            '  padding: 0.3125rem 0.5rem;',
            '  background: var(--bg);',
            '  border: 1px solid var(--border);',
            '  border-radius: var(--radius);',
            '  color: var(--text);',
            '  font-family: var(--f-body);',
            '  font-size: 0.72rem;',
            '  text-transform: none;',
            '  letter-spacing: 0;',
            '}',
            '.events-surrogacy-new__select:focus {',
            '  outline: none;',
            '  border-color: var(--accent);',
            '}',
            '.events-surrogacy-new__create {',
            '  display: inline-flex;',
            '  align-items: center;',
            '  gap: 0.3125rem;',
            '  padding: 0.375rem 0.875rem;',
            '  background: var(--accent);',
            '  border: 1px solid var(--accent);',
            '  border-radius: var(--radius);',
            '  color: var(--accent-fg);',
            '  font-family: var(--f-body);',
            '  font-size: 0.7rem;',
            '  font-weight: 600;',
            '  cursor: pointer;',
            '}',
            '.events-surrogacy-new__create:hover {',
            '  background: var(--accent-dark);',
            '  border-color: var(--accent-dark);',
            '}',
            '.events-surrogacy-new__create:disabled {',
            '  opacity: 0.5;',
            '  cursor: not-allowed;',
            '}',
            '.events-surrogacy-new__create svg {',
            '  width: 0.85em;',
            '  height: 0.85em;',
            '  fill: currentColor;',
            '}',
            '.events-surrogacy-new__hint {',
            '  font-size: 0.6rem;',
            '  color: var(--danger-lt);',
            '  font-style: italic;',
            '}',

            // Status groups
            '.events-surrogacy-list {',
            '  display: flex;',
            '  flex-direction: column;',
            '  gap: 0.5rem;',
            '}',
            '.events-surrogacy-group {',
            '  background: var(--bg2);',
            '  border: 1px solid var(--border);',
            '  border-radius: var(--radius);',
            '  overflow: hidden;',
            '}',
            '.events-surrogacy-group__header {',
            '  display: flex;',
            '  align-items: center;',
            '  gap: 0.375rem;',
            '  padding: 0.5rem 0.75rem;',
            '  background: var(--bg3);',
            '  border-bottom: 1px solid var(--border);',
            '  font-family: var(--f-display);',
            '  font-size: 0.6rem;',
            '  text-transform: uppercase;',
            '  letter-spacing: 0.06em;',
            '  color: var(--accent);',
            '}',
            '.events-surrogacy-group__header svg {',
            '  width: 0.9em;',
            '  height: 0.9em;',
            '  fill: currentColor;',
            '}',
            '.events-surrogacy-group__count {',
            '  color: var(--dim);',
            '  font-size: 0.55rem;',
            '}',
            '.events-surrogacy-group__rows {',
            '  display: flex;',
            '  flex-direction: column;',
            '}',

            // Row
            '.events-surrogacy-row {',
            '  display: flex;',
            '  flex-direction: column;',
            '  gap: 0.375rem;',
            '  padding: 0.5rem 0.75rem;',
            '  border-bottom: 1px solid var(--border);',
            '  border-left: 3px solid var(--border);',
            '  background: var(--bg2);',
            '}',
            '.events-surrogacy-row:last-child {',
            '  border-bottom: none;',
            '}',
            '.events-surrogacy-row--active {',
            '  border-left-color: var(--accent);',
            '}',
            '.events-surrogacy-row--completed {',
            '  border-left-color: var(--success);',
            '}',
            '.events-surrogacy-row--cancelled {',
            '  border-left-color: var(--dim);',
            '}',

            // Line 1: relationship
            '.events-surrogacy-row__line1 {',
            '  display: flex;',
            '  align-items: center;',
            '  gap: 0.5rem;',
            '  flex-wrap: wrap;',
            '}',
            '.events-surrogacy-row__type-icon {',
            '  display: inline-flex;',
            '  align-items: center;',
            '  justify-content: center;',
            '  width: 1.25rem;',
            '  height: 1.25rem;',
            '  color: var(--accent);',
            '  flex-shrink: 0;',
            '}',
            '.events-surrogacy-row__type-icon svg {',
            '  width: 100%;',
            '  height: 100%;',
            '  fill: currentColor;',
            '}',
            '.events-surrogacy-row__originators {',
            '  display: flex;',
            '  align-items: baseline;',
            '  gap: 0.375rem;',
            '  flex-wrap: wrap;',
            '  min-width: 0;',
            '}',
            '.events-surrogacy-row__party {',
            '  display: inline-flex;',
            '  align-items: baseline;',
            '  gap: 0.3125rem;',
            '}',
            '.events-surrogacy-row__party--unknown {',
            '  color: var(--dim);',
            '  font-style: italic;',
            '}',
            '.events-surrogacy-row__gender-icon {',
            '  display: inline-flex;',
            '  width: 0.85em;',
            '  height: 0.85em;',
            '}',
            '.events-surrogacy-row__gender-icon svg {',
            '  width: 100%;',
            '  height: 100%;',
            '  fill: currentColor;',
            '}',
            '.events-surrogacy-row__name {',
            '  font-family: var(--f-display);',
            '  font-size: 0.78rem;',
            '  font-weight: 600;',
            '  color: var(--text);',
            '}',
            '.events-surrogacy-row__age {',
            '  font-size: 0.55rem;',
            '  color: var(--dim);',
            '}',
            '.events-surrogacy-row__deceased {',
            '  display: inline-flex;',
            '  width: 0.75em;',
            '  height: 0.75em;',
            '  color: var(--danger-lt);',
            '}',
            '.events-surrogacy-row__deceased svg {',
            '  width: 100%;',
            '  height: 100%;',
            '  fill: currentColor;',
            '}',
            '.events-surrogacy-row__pair-sep {',
            '  color: var(--dim);',
            '  font-size: 0.6rem;',
            '  font-style: italic;',
            '}',
            '.events-surrogacy-row__arrow {',
            '  display: inline-flex;',
            '  width: 0.85em;',
            '  height: 0.85em;',
            '  color: var(--dim);',
            '  flex-shrink: 0;',
            '}',
            '.events-surrogacy-row__arrow svg {',
            '  width: 100%;',
            '  height: 100%;',
            '  fill: currentColor;',
            '}',
            '.events-surrogacy-row__surrogate {',
            '  display: inline-flex;',
            '  align-items: baseline;',
            '  gap: 0.3125rem;',
            '  flex-shrink: 0;',
            '}',
            '.events-surrogacy-row__children {',
            '  display: flex;',
            '  align-items: center;',
            '  gap: 0.25rem;',
            '  flex-shrink: 0;',
            '}',
            '.events-surrogacy-row__no-children {',
            '  font-size: 0.6rem;',
            '  color: var(--dim);',
            '  font-style: italic;',
            '}',
            '.events-surrogacy-row__warning {',
            '  display: inline-flex;',
            '  align-items: center;',
            '  gap: 0.1875rem;',
            '  padding: 0.125rem 0.5rem;',
            '  background: var(--warning-soft);',
            '  border: 1px solid var(--warn);',
            '  border-radius: var(--radius);',
            '  color: var(--warn);',
            '  font-size: 0.6rem;',
            '}',
            '.events-surrogacy-row__warning svg {',
            '  width: 0.85em;',
            '  height: 0.85em;',
            '  fill: currentColor;',
            '}',

            // Line 2: administration
            '.events-surrogacy-row__line2 {',
            '  display: flex;',
            '  align-items: center;',
            '  gap: 0.75rem;',
            '  flex-wrap: wrap;',
            '  padding-top: 0.25rem;',
            '  border-top: 1px dashed var(--border-light, var(--border));',
            '}',
            '.events-surrogacy-row__genetic-parents {',
            '  display: flex;',
            '  align-items: baseline;',
            '  gap: 0.5rem;',
            '  flex: 1 1 16rem;',
            '  min-width: 0;',
            '  font-size: 0.55rem;',
            '  color: var(--dim);',
            '  flex-wrap: wrap;',
            '}',
            '.events-surrogacy-row__genetic-label {',
            '  font-family: var(--f-display);',
            '  text-transform: uppercase;',
            '  letter-spacing: 0.05em;',
            '  color: var(--tmut, var(--dim));',
            '}',
            '.events-surrogacy-row__genetic-name {',
            '  color: var(--text);',
            '  font-weight: 500;',
            '}',
            '.events-surrogacy-row__genetic-note {',
            '  color: var(--dim);',
            '  font-style: italic;',
            '}',
            '.events-surrogacy-row__sep {',
            '  opacity: 0.5;',
            '}',
            '.events-surrogacy-row__status {',
            '  display: flex;',
            '  flex-direction: column;',
            '  align-items: flex-end;',
            '  gap: 0.125rem;',
            '  font-size: 0.55rem;',
            '  flex-shrink: 0;',
            '}',
            '.events-surrogacy-row__status-badge {',
            '  display: inline-flex;',
            '  align-items: center;',
            '  gap: 0.1875rem;',
            '  font-weight: 600;',
            '  letter-spacing: 0.03em;',
            '  text-transform: uppercase;',
            '}',
            '.events-surrogacy-row__status-badge svg {',
            '  width: 0.85em;',
            '  height: 0.85em;',
            '  fill: currentColor;',
            '}',
            '.events-surrogacy-row__year {',
            '  color: var(--dim);',
            '  font-family: var(--f-mono);',
            '}',
            '.events-surrogacy-row__actions {',
            '  display: flex;',
            '  gap: 0.3125rem;',
            '  flex-shrink: 0;',
            '}',
            '.events-surrogacy-row__action {',
            '  display: inline-flex;',
            '  align-items: center;',
            '  gap: 0.1875rem;',
            '  padding: 0.25rem 0.625rem;',
            '  background: var(--bg3);',
            '  border: 1px solid var(--border);',
            '  border-radius: var(--radius);',
            '  color: var(--text);',
            '  font-family: var(--f-body);',
            '  font-size: 0.65rem;',
            '  font-weight: 500;',
            '  cursor: pointer;',
            '}',
            '.events-surrogacy-row__action:hover {',
            '  filter: brightness(1.1);',
            '}',
            '.events-surrogacy-row__action svg {',
            '  width: 0.85em;',
            '  height: 0.85em;',
            '  fill: currentColor;',
            '}',
            '.events-surrogacy-row__action--complete {',
            '  border-color: var(--accent);',
            '  color: var(--accent);',
            '}',
            '.events-surrogacy-row__action--cancel {',
            '  border-color: var(--danger-lt);',
            '  color: var(--danger-lt);',
            '}'
        ].join('\n');
        document.head.appendChild(style);
    }

    // =========================================================================
    // 17. REGISTRATION
    // =========================================================================

    _ensureStyles();

    var TM = _tabManager();
    if (TM && typeof TM.register === 'function') {
        TM.register(SCOPE, TAB_ID, renderSurrogacyTab);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn(
            'events-surrogacy-tab.js: TabManager is not available at load ' +
            'time; the surrogacy tab was not registered. Load tab-manager.js ' +
            'first.'
        );
    }

    // =========================================================================
    // 18. EXPORTS
    // =========================================================================

    window.EventsSurrogacyTab = {
        id: TAB_ID,
        render: renderSurrogacyTab,

        // Exposed for tests.
        _helpers: {
            applyFilters: _applyFilters,
            groupByStatus: _groupByStatus,
            defaultFilters: _defaultFilters,
            detectEmptyState: _detectEmptyState,
            panelId: _panelId
        }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.EventsSurrogacyTab;
    }
})();
