/**
 * =============================================================================
 * EVENTS ADOPTION TAB
 * js/tabs/events-adoption-tab.js
 * =============================================================================
 *
 * LOCATION: js/tabs/events-adoption-tab.js
 *
 * The Events Manager's Adoption tab. Renders every adoption metadata
 * record in the world, grouped by type (Legal Adoption / Guardianship
 * / Foster Care), sorted within each type group by status (active
 * first) and then by the caller-selected sort key. Provides filter
 * controls, a stats bar with adoption-specific counts, an inline
 * "New Adoption" creation block (child picker + adopter picker +
 * Create button), and per-row Edit / End actions.
 *
 * RENDERER CONTRACT (from EventsManagerBootstrap):
 *   fn(container, context)
 *   container  HTMLElement  -- already emptied by TabManager
 *   context    { locationId, locationName, eventsState }
 *              eventsState: { statsBar, ... } -- bootstrap-provided
 *              initial reads (may be absent; this tab computes its
 *              own adoption-specific stats bar regardless).
 *
 * DATA SOURCES:
 *   EventsQueries.getAdoptionRecords(locationId)
 *   EventsViewModels.toAdoptionRow / toAdoptionRows
 *                   .toAdoptionTypeFilterOptions
 *                   .toAdoptionStatusFilterOptions
 *                   .toAdoptionSortOptions
 *                   .toAdoptionStatsBarViewModel
 *                   .adoptionStatusPriority
 *   EventsUIList.renderAdoptionTabBody / renderOptionList
 *   UIState.getFilters / setFilters
 *   window.openCreateAdoptionModal(childId, adopterId, onSuccess)
 *   window.openEditAdoptionModal(adoptionId, onSuccess)
 *   window.openEndAdoptionModal(adoptionId, onSuccess)
 *   CharacterQueries.getAllCharacters  (for the inline pickers)
 *
 * FILTERS (persisted per location via UIState):
 *   search           string
 *   type             'all' | 'legal' | 'guardianship' | 'foster'
 *   status           'all' | 'active' | 'ended' | 'dissolved'
 *   sortBy           'year' | 'childName' | 'adopterName'
 *   showAllLocations boolean (default true)
 *   collapsed        boolean (filters collapsed)
 *
 * ACTION SET:
 *   Per-row, on active records:   End Adoption, Edit
 *   Per-row, on ended/dissolved:  Edit only
 *     (endAdoptionMetadata refuses non-active records; showing an
 *      End button that always errors would be misleading)
 *
 * CREATE FLOW:
 *   The inline New Adoption block has two <select> pickers (child,
 *   adopter) and a Create button. Both pickers are populated from
 *   CharacterQueries.getAllCharacters, filtered to living characters
 *   (the modals-character adoption modal requires living
 *   participants). On submit, the tab calls openCreateAdoptionModal
 *   with both ids resolved. The modal itself collects the record's
 *   type, role, year, and notes; the tab does not duplicate that
 *   form.
 *
 *   NOTE: openCreateAdoptionModal does NOT accept null ids -- it
 *   resolves _readSummary(childId) and fails immediately on a missing
 *   child. That is why this tab has an inline picker bar instead of
 *   delegating picker selection to the modal.
 *
 * DELEGATED EVENTS:
 *   One click listener on the tab container (attached once via
 *   container.__eventsAdoptionWired).
 *     data-action="new-adoption"
 *     data-action="edit-adoption"     data-adoption-id=<id>
 *     data-action="end-adoption"      data-adoption-id=<id>
 *     data-action="refresh"
 *     data-action="clear-filters"
 *     data-action="toggle-collapse"
 *   Input/change listeners on the search box and filter selects are
 *   attached per render (they are new elements every render).
 *
 * FILTER APPLICATION:
 *   - type      narrows the rendered type groups (an empty type group
 *               is omitted entirely)
 *   - status    narrows the rows within each group
 *   - search    matches child name, child surname, adopter name,
 *               adopter surname
 *   The type grouping itself is stable: groups render in a fixed
 *   order (legal, guardianship, foster) regardless of filters or
 *   sort. Filters remove groups, they never reorder them.
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
 *                           inline New Adoption pickers; if absent,
 *                           the picker block renders an unavailable
 *                           hint and the Create button is disabled)
 *   - window.openCreateAdoptionModal OPTIONAL (toast if absent)
 *   - window.openEditAdoptionModal   OPTIONAL (toast if absent)
 *   - window.openEndAdoptionModal    OPTIONAL (toast if absent)
 *
 * TIME CONTRACT: uses window.getCurrentYear (no fallback).
 * ICON POLICY: no emojis, no Unicode glyphs. Icons via EventsUIList.icon.
 * =============================================================================
 *
 * REFACTOR HISTORY:
 *   Initial revision (Phase 3B).
 *     - Ported the create / edit / end adoption flows from
 *       modals-children-adoption.js into a per-row tab surface.
 *     - Inline New Adoption picker (two <select>s populated from
 *       CharacterQueries.getAllCharacters) is used INSTEAD of
 *       delegating picker selection to the modal, because
 *       openCreateAdoptionModal requires both ids.
 *     - Filters (search, type, status, sortBy) persist per-location
 *       via UIState (key: 'events-adoption:<locationId|all>').
 *     - Filters reset on location change via _lastPanelId.
 *     - Adapter-specific stats bar (Total / Active / Ended / Legal /
 *       Guardianship / Foster) is computed by
 *       toAdoptionStatsBarViewModel from the already-fetched
 *       records. The bootstrap's generic eventsState.statsBar is
 *       ignored.
 *     - Delegated click handler lives on the tab container,
 *       guarded by container.__eventsAdoptionWired.
 *     - Filter inputs wired per render (they're new elements).
 *     - Three-way empty state (no-adoptions / no-matches /
 *       unavailable).
 *     - No setTimeout. No document.getElementById outside
 *       _ensureStyles. No literal Unicode glyphs. No hardcoded
 *       colors. No inline writes.
 *     - Per-row action set: End + Edit on active; Edit only on
 *       inactive (endAdoptionMetadata refuses non-active records).
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var TAB_ID = 'adoption';
    var SCOPE  = 'events';

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
            type: 'all',
            status: 'all',
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
    //
    // Applies the type / status / search filters to the records.
    // Returns the filtered records (still sorted by the query layer
    // for stability; the grouping step does its own sorting within
    // each group).

    function _applyFilters(records, filters) {
        if (!Array.isArray(records)) return [];

        var type = filters.type || 'all';
        var status = filters.status || 'all';
        var search = (typeof filters.search === 'string')
            ? filters.search.trim().toLowerCase()
            : '';

        var filtered = [];
        for (var i = 0; i < records.length; i++) {
            var r = records[i];
            if (!r) continue;
            if (type !== 'all' && r.type !== type) continue;
            if (status !== 'all' && r.status !== status) continue;

            if (search.length > 0) {
                var child = r.child || null;
                var adopter = r.adopter || null;
                var childHay = child
                    ? ((child.name || '') + ' ' + (child.surname || '')).toLowerCase()
                    : '';
                var adopterHay = adopter
                    ? ((adopter.name || '') + ' ' + (adopter.surname || '')).toLowerCase()
                    : '';
                if (childHay.indexOf(search) === -1
                    && adopterHay.indexOf(search) === -1) {
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
    // Groups the filtered rows by type, sorts within each group by
    // status priority (active first, then ended, then dissolved),
    // then by the caller-selected sortBy. The groups themselves
    // render in a fixed order (legal, guardianship, foster) so the
    // UI is stable across renders.
    //
    // The type group order is a UI contract: users learn "legal
    // adoptions appear first" and expect it to stay that way.

    var TYPE_GROUP_ORDER = ['legal', 'guardianship', 'foster'];

    function _groupByType(filteredRecords, filters) {
        var sortBy = filters.sortBy || 'year';
        var VM = _vm();

        var buckets = { legal: [], guardianship: [], foster: [] };

        for (var i = 0; i < filteredRecords.length; i++) {
            var r = filteredRecords[i];
            if (!r) continue;
            var bucket = buckets[r.type];
            if (!bucket) {
                // Unknown type (defensive): skip -- no group to add to.
                continue;
            }
            bucket.push(r);
        }

        // Sort within each bucket: status priority, then sortBy key.
        for (var t = 0; t < TYPE_GROUP_ORDER.length; t++) {
            var typeKey = TYPE_GROUP_ORDER[t];
            var list = buckets[typeKey];
            list.sort(function(a, b) {
                var pa = VM && typeof VM.adoptionStatusPriority === 'function'
                    ? VM.adoptionStatusPriority(a.status)
                    : 0;
                var pb = VM && typeof VM.adoptionStatusPriority === 'function'
                    ? VM.adoptionStatusPriority(b.status)
                    : 0;
                if (pa !== pb) return pa - pb;

                if (sortBy === 'childName') {
                    var an = a.child
                        ? ((a.child.name || '') + ' ' + (a.child.surname || '')).trim()
                        : '';
                    var bn = b.child
                        ? ((b.child.name || '') + ' ' + (b.child.surname || '')).trim()
                        : '';
                    return an.localeCompare(bn);
                }
                if (sortBy === 'adopterName') {
                    var aan = a.adopter
                        ? ((a.adopter.name || '') + ' ' + (a.adopter.surname || '')).trim()
                        : '';
                    var bbn = b.adopter
                        ? ((b.adopter.name || '') + ' ' + (b.adopter.surname || '')).trim()
                        : '';
                    return aan.localeCompare(bbn);
                }
                // year (default, descending -- newest first)
                var ya = (typeof a.year === 'number') ? a.year : 0;
                var yb = (typeof b.year === 'number') ? b.year : 0;
                if (ya !== yb) return yb - ya;
                return String(a.id).localeCompare(String(b.id));
            });
        }

        var groups = [];
        for (var g = 0; g < TYPE_GROUP_ORDER.length; g++) {
            var typeId = TYPE_GROUP_ORDER[g];
            var rows = buckets[typeId];
            if (rows.length === 0) continue;
            groups.push({
                typeId: typeId,
                typeLabel: VM && typeof VM.adoptionTypeLabel === 'function'
                    ? VM.adoptionTypeLabel(typeId)
                    : typeId,
                typeIconName: VM && typeof VM.adoptionTypeIconName === 'function'
                    ? VM.adoptionTypeIconName(typeId)
                    : 'ADOPTION_LEGAL',
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
    //   'unavailable'   records query failed
    //   'no-adoptions'  zero records exist at all (before filters)
    //   'no-matches'    records exist but filters exclude all
    //   null            filtered records exist; render the groups

    function _detectEmptyState(recordsResult, totalRecordCount, filteredCount) {
        if (!recordsResult || recordsResult.available !== true) {
            return 'unavailable';
        }
        if (totalRecordCount === 0) return 'no-adoptions';
        if (filteredCount === 0) return 'no-matches';
        return null;
    }

    // =========================================================================
    // 8. INLINE NEW ADOPTION BLOCK
    // =========================================================================
    //
    // The create modal requires both ids. This block collects them
    // inline via two <select> pickers populated from
    // CharacterQueries.getAllCharacters, filtered to living
    // characters.
    //
    // If CharacterQueries is absent, the pickers render an
    // "unavailable" hint and the Create button is disabled. That is
    // a legitimate reduced-harness state, not an error.

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

    function _renderNewAdoptionBlock(context) {
        var characters = _livingCharacters();
        var hasCharacters = Array.isArray(characters);

        var disabledAttr = hasCharacters ? '' : ' disabled';
        var hint = hasCharacters
            ? ''
            : '<div class="events-adoption-new__hint">' +
              'Character picker unavailable: CharacterQueries is not loaded.' +
              '</div>';

        var html = '<div class="events-adoption-new">';
        html += '<div class="events-adoption-new__header">' +
            _icon('ADOPTION_LEGAL') +
            '<span>New Adoption</span>' +
            '</div>';
        html += '<div class="events-adoption-new__pickers">';
        html += '<label class="events-adoption-new__field">' +
            '<span>Child</span>' +
            '<select class="ev-adoption-input events-adoption-new__select" data-input="new-child-id"' +
            disabledAttr + '>' +
            '<option value="">Select a child…</option>' +
            '</select>' +
            '</label>';
        html += '<label class="events-adoption-new__field">' +
            '<span>Adopter</span>' +
            '<select class="ev-adoption-input events-adoption-new__select" data-input="new-adopter-id"' +
            disabledAttr + '>' +
            '<option value="">Select an adopter…</option>' +
            '</select>' +
            '</label>';
        html += '<button type="button" class="events-adoption-new__create" ' +
            'data-action="new-adoption"' + disabledAttr + '>' +
            _icon('CHECK_SIMPLE') + '<span>Create</span></button>';
        html += '</div>';
        html += hint;
        html += '</div>';
        return html;
    }

    function _wireNewAdoptionBlock(container) {
        var characters = _livingCharacters();
        if (!Array.isArray(characters)) return;

        var childSelect = container.querySelector('[data-input="new-child-id"]');
        var adopterSelect = container.querySelector('[data-input="new-adopter-id"]');
        if (childSelect) _populateSelectOptions(childSelect, characters, 'Select a child…');
        if (adopterSelect) _populateSelectOptions(adopterSelect, characters, 'Select an adopter…');
    }

    // =========================================================================
    // 9. FILTER BAR
    // =========================================================================

    function _renderFilterBar(context, filters) {
        var C = _constants();
        var VM = _vm();
        var U = _ui();
        if (!C || !VM || !U) return '';

        var typeOpts = VM.toAdoptionTypeFilterOptions(filters.type);
        var statusOpts = VM.toAdoptionStatusFilterOptions(filters.status);
        var sortOpts = VM.toAdoptionSortOptions(filters.sortBy);

        var showAllLocations = filters.showAllLocations === true;
        var locationName = (context && context.locationName) ? context.locationName : '';
        var collapsed = filters.collapsed === true;
        var collapseIconName = collapsed ? 'TRIANGLE_DOWN' : 'TRIANGLE_UP';

        var html = '';
        html += '<div class="events-filters events-filters--adoption">';

        // Header line
        html += '<div class="events-filters__header">';
        html += '<button type="button" class="events-filters__collapse" ' +
            'data-action="toggle-collapse" aria-label="Toggle filters">' +
            _icon(collapseIconName) +
            '<span>Filters</span>' +
            '</button>';

        html += '<label class="events-filters__scope">';
        html += '<input type="checkbox" class="ev-adoption-input" ' +
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

        html += '<input type="search" class="ev-adoption-input events-filters__search" ' +
            'data-input="search" placeholder="Search by name…" ' +
            'value="' + _esc(filters.search || '') + '">';

        html += '<select class="ev-adoption-input events-filters__select" data-input="type">' +
            U.renderOptionList(typeOpts) + '</select>';
        html += '<select class="ev-adoption-input events-filters__select" data-input="status">' +
            U.renderOptionList(statusOpts) + '</select>';
        html += '<select class="ev-adoption-input events-filters__select" data-input="sortBy">' +
            U.renderOptionList(sortOpts) + '</select>';

        html += '</div>';
        html += '</div>';
        return html;
    }

    // =========================================================================
    // 10. MAIN RENDER
    // =========================================================================

    function renderAdoptionTab(container, context) {
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
        var result = q.getAdoptionRecords(effectiveLocationId);

        if (!result || result.available !== true) {
            container.innerHTML =
                '<div class="events-unavailable">' +
                _esc('Adoption records are not available: ' +
                     (result && result.reason ? result.reason : 'unknown')) +
                '</div>';
            return;
        }

        var records = Array.isArray(result.records) ? result.records : [];
        var totalRecordCount = records.length;

        // Filter + group
        var filtered = _applyFilters(records, _state);
        var typeGroups = _groupByType(filtered, _state);

        // Empty state detection
        var emptyState = _detectEmptyState(result, totalRecordCount, filtered.length);
        var emptyStateOptions = emptyState
            ? _emptyStateOptions(emptyState)
            : null;

        // Adoption-specific stats bar (computed from the RAW records,
        // not the filtered set -- the stats bar describes the world,
        // the filters narrow the list below it).
        var statsBar = VM.toAdoptionStatsBarViewModel(records);

        // Build the HTML
        var filterBarHtml = _renderFilterBar(
            { locationId: locationId, locationName: context && context.locationName },
            _state
        );
        var newAdoptionHtml = _renderNewAdoptionBlock(context);
        var bodyHtml = U.renderAdoptionTabBody({
            statsBar: statsBar,
            typeGroups: typeGroups,
            emptyState: emptyState,
            emptyStateOptions: emptyStateOptions
        });

        container.innerHTML =
            '<div class="events-adoption-tab">' +
            filterBarHtml +
            newAdoptionHtml +
            bodyHtml +
            '</div>';

        // Wire
        _wireFilterInputs(container, locationId);
        _wireNewAdoptionBlock(container);
        _wireDelegatedHandlers(container, locationId);
    }

    function _emptyStateOptions(caseId) {
        var options = {};
        if (caseId === 'no-matches') {
            options.extraHint = 'Try clearing filters or widening the search.';
        }
        if (caseId === 'no-adoptions') {
            options.extraHint = 'Use the New Adoption block above to create one.';
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

        var inputs = container.querySelectorAll('.ev-adoption-input');
        for (var i = 0; i < inputs.length; i++) {
            (function(input) {
                var key = input.getAttribute('data-input');
                if (!key) return;
                // The new-adoption pickers are wired by
                // _wireNewAdoptionBlock, not by this loop.
                if (key === 'new-child-id' || key === 'new-adopter-id') return;

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
        if (container.__eventsAdoptionWired) return;
        container.__eventsAdoptionWired = true;

        container.addEventListener('click', function(e) {
            var target = e.target;
            if (!target || typeof target.closest !== 'function') return;

            var actionEl = target.closest('[data-action]');
            if (!actionEl || !container.contains(actionEl)) return;

            var action = actionEl.getAttribute('data-action');

            if (action === 'new-adoption') {
                e.preventDefault();
                _handleNewAdoption(container);
                return;
            }

            if (action === 'edit-adoption') {
                e.preventDefault();
                e.stopPropagation();
                var editId = actionEl.getAttribute('data-adoption-id');
                if (editId) _openEditAdoption(editId);
                return;
            }

            if (action === 'end-adoption') {
                e.preventDefault();
                e.stopPropagation();
                var endId = actionEl.getAttribute('data-adoption-id');
                if (endId) _openEndAdoption(endId);
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
    }

    // =========================================================================
    // 13. ACTION HANDLERS
    // =========================================================================

    function _handleNewAdoption(container) {
        var childSelect = container.querySelector('[data-input="new-child-id"]');
        var adopterSelect = container.querySelector('[data-input="new-adopter-id"]');

        var childId = childSelect ? childSelect.value : '';
        var adopterId = adopterSelect ? adopterSelect.value : '';

        if (!childId) {
            _toast('Please select a child.', 'error');
            return;
        }
        if (!adopterId) {
            _toast('Please select an adopter.', 'error');
            return;
        }
        if (childId === adopterId) {
            _toast('A character cannot adopt themselves.', 'error');
            return;
        }

        if (typeof window.openCreateAdoptionModal !== 'function') {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    '[events-adoption-tab] openCreateAdoptionModal is not ' +
                    'loaded; load modals-children-adoption.js.'
                );
            }
            _toast(
                'Adoption creation is unavailable: the adoption modal is not loaded.',
                'error'
            );
            return;
        }

        var result = window.openCreateAdoptionModal(childId, adopterId, function() {
            _refresh();
        });
        if (!result || result.success !== true) {
            _toast(
                'Could not open create-adoption modal: ' +
                (result && result.reason ? result.reason : 'unknown'),
                'error'
            );
        }
    }

    function _openEditAdoption(adoptionId) {
        if (typeof window.openEditAdoptionModal !== 'function') {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    '[events-adoption-tab] openEditAdoptionModal is not ' +
                    'loaded; load modals-children-adoption.js.'
                );
            }
            _toast(
                'Adoption editing is unavailable: the adoption modal is not loaded.',
                'error'
            );
            return;
        }
        var result = window.openEditAdoptionModal(adoptionId, function() {
            _refresh();
        });
        if (!result || result.success !== true) {
            _toast(
                'Could not open edit-adoption modal: ' +
                (result && result.reason ? result.reason : 'unknown'),
                'error'
            );
        }
    }

    function _openEndAdoption(adoptionId) {
        if (typeof window.openEndAdoptionModal !== 'function') {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    '[events-adoption-tab] openEndAdoptionModal is not ' +
                    'loaded; load modals-children-adoption.js.'
                );
            }
            _toast(
                'Adoption ending is unavailable: the adoption modal is not loaded.',
                'error'
            );
            return;
        }
        var result = window.openEndAdoptionModal(adoptionId, function() {
            _refresh();
        });
        if (!result || result.success !== true) {
            _toast(
                'Could not open end-adoption modal: ' +
                (result && result.reason ? result.reason : 'unknown'),
                'error'
            );
        }
    }

    // =========================================================================
    // 14. FILTER RESET
    // =========================================================================

    function _clearFilters(locationId) {
        var defaults = _defaultFilters();
        _state = {
            search: defaults.search,
            type: defaults.type,
            status: defaults.status,
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
    // .events-empty, .events-unavailable classes are defined by
    // events-deaths-tab.js's own injected stylesheet. This stylesheet
    // adds the classes specific to the adoption facet: the new-
    // adoption block, the type group containers, and the row layout.

    function _ensureStyles() {
        if (document.getElementById('events-adoption-tab-styles')) return;
        var style = document.createElement('style');
        style.id = 'events-adoption-tab-styles';
        style.textContent = [
            '.events-adoption-tab {',
            '  display: flex;',
            '  flex-direction: column;',
            '  gap: 0.75rem;',
            '}',

            // Filter bar additions
            '.events-filters--adoption .events-filters__body {',
            '  gap: 0.5rem;',
            '  flex-wrap: wrap;',
            '}',

            // New adoption block
            '.events-adoption-new {',
            '  display: flex;',
            '  flex-direction: column;',
            '  gap: 0.5rem;',
            '  padding: 0.5rem 0.75rem;',
            '  background: var(--bg2);',
            '  border: 1px solid var(--border);',
            '  border-radius: var(--radius);',
            '}',
            '.events-adoption-new__header {',
            '  display: flex;',
            '  align-items: center;',
            '  gap: 0.375rem;',
            '  font-family: var(--f-display);',
            '  font-size: 0.6rem;',
            '  text-transform: uppercase;',
            '  letter-spacing: 0.06em;',
            '  color: var(--accent);',
            '}',
            '.events-adoption-new__header svg {',
            '  width: 0.9em;',
            '  height: 0.9em;',
            '  fill: currentColor;',
            '}',
            '.events-adoption-new__pickers {',
            '  display: flex;',
            '  gap: 0.5rem;',
            '  align-items: flex-end;',
            '  flex-wrap: wrap;',
            '}',
            '.events-adoption-new__field {',
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
            '.events-adoption-new__select {',
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
            '.events-adoption-new__select:focus {',
            '  outline: none;',
            '  border-color: var(--accent);',
            '}',
            '.events-adoption-new__create {',
            '  display: inline-flex;',
            '  align-items: center;',
            '  gap: 0.3125rem;',
            '  padding: 0.3125rem 0.75rem;',
            '  background: var(--accent);',
            '  border: 1px solid var(--accent);',
            '  border-radius: var(--radius);',
            '  color: var(--accent-fg);',
            '  font-family: var(--f-body);',
            '  font-size: 0.65rem;',
            '  font-weight: 500;',
            '  cursor: pointer;',
            '}',
            '.events-adoption-new__create:hover {',
            '  background: var(--accent-dark);',
            '  border-color: var(--accent-dark);',
            '}',
            '.events-adoption-new__create:disabled {',
            '  opacity: 0.5;',
            '  cursor: not-allowed;',
            '}',
            '.events-adoption-new__create svg {',
            '  width: 0.85em;',
            '  height: 0.85em;',
            '  fill: currentColor;',
            '}',
            '.events-adoption-new__hint {',
            '  font-size: 0.6rem;',
            '  color: var(--danger-lt);',
            '  font-style: italic;',
            '}',

            // Group list
            '.events-adoption-list {',
            '  display: flex;',
            '  flex-direction: column;',
            '  gap: 0.5rem;',
            '}',
            '.events-adoption-group {',
            '  background: var(--bg2);',
            '  border: 1px solid var(--border);',
            '  border-radius: var(--radius);',
            '  overflow: hidden;',
            '}',
            '.events-adoption-group__header {',
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
            '.events-adoption-group__header svg {',
            '  width: 0.9em;',
            '  height: 0.9em;',
            '  fill: currentColor;',
            '}',
            '.events-adoption-group__count {',
            '  color: var(--dim);',
            '  font-size: 0.55rem;',
            '}',
            '.events-adoption-group__rows {',
            '  display: flex;',
            '  flex-direction: column;',
            '}',

            // Row
            '.events-adoption-row {',
            '  display: grid;',
            '  grid-template-columns: 1.25rem minmax(0, 1fr) minmax(0, 1fr) auto auto;',
            '  gap: 0.5rem;',
            '  align-items: center;',
            '  padding: 0.5rem 0.75rem;',
            '  border-bottom: 1px solid var(--border);',
            '  background: var(--bg2);',
            '}',
            '.events-adoption-row:last-child {',
            '  border-bottom: none;',
            '}',
            '.events-adoption-row:hover {',
            '  background: var(--bg3);',
            '}',
            '@media (max-width: 900px) {',
            '  .events-adoption-row {',
            '    grid-template-columns: 1fr;',
            '  }',
            '}',
            '.events-adoption-row__type-icon {',
            '  display: inline-flex;',
            '  align-items: center;',
            '  justify-content: center;',
            '  width: 1.25rem;',
            '  height: 1.25rem;',
            '  color: var(--accent);',
            '  flex-shrink: 0;',
            '}',
            '.events-adoption-row__type-icon svg {',
            '  width: 100%;',
            '  height: 100%;',
            '  fill: currentColor;',
            '}',

            // Person identity
            '.events-adoption-row__person {',
            '  display: flex;',
            '  align-items: baseline;',
            '  gap: 0.3125rem;',
            '  min-width: 0;',
            '  flex-wrap: wrap;',
            '}',
            '.events-adoption-row__gender-icon {',
            '  display: inline-flex;',
            '  width: 0.85em;',
            '  height: 0.85em;',
            '}',
            '.events-adoption-row__gender-icon svg {',
            '  width: 100%;',
            '  height: 100%;',
            '  fill: currentColor;',
            '}',
            '.events-adoption-row__name {',
            '  font-family: var(--f-display);',
            '  font-size: 0.78rem;',
            '  font-weight: 600;',
            '  color: var(--text);',
            '}',
            '.events-adoption-row__age {',
            '  font-size: 0.55rem;',
            '  color: var(--dim);',
            '}',
            '.events-adoption-row__deceased {',
            '  display: inline-flex;',
            '  width: 0.75em;',
            '  height: 0.75em;',
            '  color: var(--danger-lt);',
            '}',
            '.events-adoption-row__deceased svg {',
            '  width: 100%;',
            '  height: 100%;',
            '  fill: currentColor;',
            '}',

            // Status block
            '.events-adoption-row__status {',
            '  display: flex;',
            '  flex-direction: column;',
            '  align-items: flex-end;',
            '  gap: 0.125rem;',
            '  font-size: 0.55rem;',
            '}',
            '.events-adoption-row__status-badge {',
            '  font-weight: 600;',
            '  letter-spacing: 0.03em;',
            '  text-transform: uppercase;',
            '}',
            '.events-adoption-row__year {',
            '  color: var(--dim);',
            '  font-family: var(--f-mono);',
            '}',

            // Actions block
            '.events-adoption-row__actions {',
            '  display: flex;',
            '  gap: 0.3125rem;',
            '  flex-shrink: 0;',
            '}',
            '.events-adoption-row__action {',
            '  display: inline-flex;',
            '  align-items: center;',
            '  gap: 0.1875rem;',
            '  padding: 0.25rem 0.5rem;',
            '  background: var(--bg3);',
            '  border: 1px solid var(--border);',
            '  border-radius: var(--radius);',
            '  color: var(--text);',
            '  font-family: var(--f-body);',
            '  font-size: 0.6rem;',
            '  cursor: pointer;',
            '}',
            '.events-adoption-row__action:hover {',
            '  border-color: var(--accent);',
            '  color: var(--accent-light);',
            '}',
            '.events-adoption-row__action svg {',
            '  width: 0.85em;',
            '  height: 0.85em;',
            '  fill: currentColor;',
            '}',
            '.events-adoption-row__action--end {',
            '  border-color: var(--danger-lt);',
            '  color: var(--danger-lt);',
            '}',
            '.events-adoption-row__action--end:hover {',
            '  background: var(--danger-soft);',
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
        TM.register(SCOPE, TAB_ID, renderAdoptionTab);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn(
            'events-adoption-tab.js: TabManager is not available at load ' +
            'time; the adoption tab was not registered. Load tab-manager.js ' +
            'first.'
        );
    }

    // =========================================================================
    // 18. EXPORTS
    // =========================================================================

    window.EventsAdoptionTab = {
        id: TAB_ID,
        render: renderAdoptionTab,

        // Exposed for tests.
        _helpers: {
            applyFilters: _applyFilters,
            groupByType: _groupByType,
            defaultFilters: _defaultFilters,
            detectEmptyState: _detectEmptyState,
            panelId: _panelId
        }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.EventsAdoptionTab;
    }
})();
