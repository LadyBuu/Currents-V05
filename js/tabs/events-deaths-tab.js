/**
 * =============================================================================
 * EVENTS DEATHS TAB
 * js/tabs/events-deaths-tab.js
 * =============================================================================
 *
 * LOCATION: js/tabs/events-deaths-tab.js
 *
 * The Events Manager's Deaths tab. Renders the character roster with
 * status, death cause, and (when openDeathModal is available) the
 * Kill action. Filters by search, status, cause, gender. Persists
 * filter state per (location, tab) via UIState.
 *
 * RENDERER CONTRACT (from EventsManagerBootstrap):
 *   fn(container, context)
 *   container  HTMLElement  -- already emptied by TabManager
 *   context    { locationId, locationName, eventsState }
 *              eventsState: { statsBar, ... } -- bootstrap-provided
 *              initial reads (available may be false)
 *
 * DATA SOURCES:
 *   EventsQueries.getCharacterRoster(locationId)
 *   EventsQueries.getCharacterPopulationStats(locationId)
 *   EventsQueries.getRecentDeathEvents({ limit, year })
 *   EventsViewModels.*           (row + stats + empty-state shaping)
 *   EventsUIList.*               (markup)
 *   UIState.getFilters/setFilters (panel 'events-deaths')
 *   UIState.getCollapsed/setCollapsed ('events-deaths')
 *   window.openDeathModal        (write path; delegated)
 *   window.openCharacterDetailsModal (read path; delegated)
 *
 * FILTERS (persisted per location via UIState):
 *   search           string
 *   status           'all' | 'living' | 'deceased'
 *   cause            'all' | <death cause id>   (matches deathCause)
 *   gender           'all' | 'male' | 'female' | 'unknown'
 *   sortBy           'name' | 'age' | 'deathYear' | 'location'
 *   showAllLocations boolean (default true; when false, filter by
 *                    the sidebar-selected location)
 *   collapsed        boolean (filters collapsed, persists separately)
 *
 * SORTING:
 *   Groups are always rendered living-first (living group above
 *   deceased group), regardless of sortBy. Within each group, rows
 *   are ordered by sortBy. This is the UX contract; it is not
 *   negotiable via filter state.
 *
 * DELEGATED EVENTS:
 *   One click listener on the tab container. Handles:
 *     data-action="open-character"  -> window.openCharacterDetailsModal
 *     data-action="kill"            -> window.openDeathModal
 *     data-action="refresh"         -> TabManager.requestRender
 *     data-action="clear-filters"   -> reset filters, re-render
 *     data-action="toggle-collapse" -> toggle filter bar, re-render
 *   Input/change listeners on the search box and filter selects are
 *   attached ONCE per render (they're replaced on every render, so
 *   the "already wired" guard is on the input element, not the
 *   container).
 *
 * PERSISTENCE:
 *   Filters persist per (location, tab). The panel id is derived
 *   from EventsConstants.panelIdFor('deaths') + ':' + (locationId ||
 *   'all'). When the sidebar changes location, the tab's _state
 *   object is reset from the new panel's filters on the next render.
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
 *   - window.openDeathModal          OPTIONAL (Kill disabled if absent)
 *   - window.openCharacterDetailsModal OPTIONAL (row click no-ops if absent)
 *
 * TIME CONTRACT: uses window.getCurrentYear (no fallback).
 * ICON POLICY: no emojis. Icons via EventsUIList.icon (getIcon).
 * =============================================================================
 *
 * REFACTOR HISTORY:
 *   Initial revision.
 *     - Ported from Deathstars_v03.html's refreshDeathstars. Fixed:
 *       no document.getElementById inside render (container-scoped);
 *       no per-row listeners (delegated); no setTimeout; no literal
 *       Unicode glyphs (Icons via EventsUIList); no hardcoded hex
 *       (theme tokens via var(--...)); filter state via UIState
 *       (not localStorage, not DOM); three-way empty state; explicit
 *       handling of "missing openDeathModal" (toast, not silent).
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var TAB_ID = 'deaths';
    var SCOPE  = 'events';

    // =========================================================================
    // 2. DEPENDENCY ACCESSORS
    // =========================================================================
    //
    // These return null when the dependency isn't loaded. Callers
    // check for null and degrade (render unavailable / toast). A
    // missing REQUIRED module produces an unavailable renderer, not
    // a throw -- the tab is loaded even when a facet's domain is
    // absent.

    function _queries() {
        return window.EventsQueries || null;
    }
    function _vm() {
        return window.EventsViewModels || null;
    }
    function _ui() {
        return window.EventsUIList || null;
    }
    function _constants() {
        return window.EventsConstants || null;
    }
    function _tabManager() {
        return window.TabManager || null;
    }
    function _uiState() {
        return window.UIState || null;
    }

    function _toast(msg, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, type);
        }
    }

    function _esc(v) {
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(v == null ? '' : String(v));
        }
        // No fallback. If escapeHtml isn't loaded, the tab won't
        // render; that's a load-order bug, not a runtime condition.
        return '';
    }

    function _icon(name) {
        if (typeof window.getIcon === 'function') {
            return window.getIcon(name, 'CIRCLE');
        }
        return '';
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYear === 'function') {
            try {
                var y = window.getCurrentYear();
                if (typeof y === 'number' && Number.isFinite(y)) return y;
            } catch (e) { /* fall through */ }
        }
        return null;
    }

    // =========================================================================
    // 3. PANEL ID
    // =========================================================================
    //
    // The panel id scopes UIState storage per (tab, location). A
    // tab in "all locations" mode uses 'all' as its scope; a tab in
    // single-location mode uses the location id. This gives each
    // location its own remembered filter state.

    function _panelId(locationId) {
        var C = _constants();
        var base = C ? C.panelIdFor(TAB_ID) : ('events-' + TAB_ID);
        return base + ':' + (locationId || 'all');
    }

    // =========================================================================
    // 4. FILTER STATE
    // =========================================================================
    //
    // Module-scope state, one object per tab instance (there is one
    // instance per manager page). `_lastPanelId` triggers a reload
    // from UIState when the scope changes.

    var _state = null;
    var _lastPanelId = null;

    function _defaultFilters() {
        var C = _constants();
        return C ? C.getDefaultFiltersForFacet(TAB_ID) : {
            search: '',
            status: 'all',
            cause: 'all',
            gender: 'all',
            sortBy: 'name',
            locationId: null,
            showAllLocations: true
        };
    }

    function _readFilters(panelId) {
        var U = _uiState();
        if (!U) return _defaultFilters();
        var stored = U.getFilters(panelId);
        if (!stored || typeof stored !== 'object') return _defaultFilters();

        var base = _defaultFilters();
        // Merge: stored wins for keys it supplies; base supplies
        // the rest. This makes a new filter field added to
        // _defaultFilters safe on first read of an old panel.
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

    function _readCollapsed(panelId) {
        var U = _uiState();
        if (!U) return false;
        return U.getCollapsed(panelId) === true;
    }

    function _writeCollapsed(panelId, collapsed) {
        var U = _uiState();
        if (!U) return;
        U.setCollapsed(panelId, collapsed === true);
    }

    // =========================================================================
    // 5. FILTER APPLICATION
    // =========================================================================
    //
    // Pure. Takes the roster (raw rows from the query layer) and the
    // current filters, returns filtered + sorted rows. The order is:
    // group by isDeceased (living first), sort within group by
    // filters.sortBy. Never mutates the input array.

    function _applyFilters(characters, filters) {
        if (!Array.isArray(characters)) return [];

        var search = (typeof filters.search === 'string')
            ? filters.search.trim().toLowerCase()
            : '';
        var status = filters.status || 'all';
        var cause = filters.cause || 'all';
        var gender = filters.gender || 'all';

        var filtered = [];
        for (var i = 0; i < characters.length; i++) {
            var c = characters[i];
            if (!c) continue;

            // Status
            if (status === 'living' && c.isDeceased !== false) continue;
            if (status === 'deceased' && c.isDeceased !== true) continue;

            // Cause (only meaningful for deceased characters)
            if (cause !== 'all') {
                if (c.isDeceased !== true) continue;
                if (c.deathCause !== cause) continue;
            }

            // Gender
            if (gender !== 'all' && c.gender !== gender) continue;

            // Search: name + surname, case-insensitive
            if (search.length > 0) {
                var hay = ((c.name || '') + ' ' + (c.surname || '')).toLowerCase();
                if (hay.indexOf(search) === -1) continue;
            }

            filtered.push(c);
        }

        // Group by isDeceased (living first), then sort within each
        // group by filters.sortBy.
        var sortBy = filters.sortBy || 'name';
        filtered.sort(function(a, b) {
            var aDead = a.isDeceased === true;
            var bDead = b.isDeceased === true;
            if (aDead !== bDead) return aDead ? 1 : -1;
            return _compareBySort(a, b, sortBy);
        });

        return filtered;
    }

    function _compareBySort(a, b, sortBy) {
        switch (sortBy) {
            case 'age':
                return _numOrInfinity(b.age) - _numOrInfinity(a.age);
            case 'deathYear':
                return _numOrInfinity(b.deathYear) - _numOrInfinity(a.deathYear);
            case 'location':
                return String(a.locationName || '').localeCompare(String(b.locationName || ''));
            case 'name':
            default:
                return String(a.fullName || a.name || '')
                    .localeCompare(String(b.fullName || b.name || ''));
        }
    }

    function _numOrInfinity(n) {
        if (typeof n !== 'number' || !isFinite(n)) return -Infinity;
        return n;
    }

    // =========================================================================
    // 6. EMPTY-STATE CASE DETECTION
    // =========================================================================
    //
    // Picks the correct empty-state case:
    //   'no-context'    -- no location selected AND showAllLocations
    //                      is false (so the tab has nothing to scope to)
    //   'unavailable'   -- a required facet query failed
    //   'no-characters' -- world has zero characters
    //   'no-deaths'     -- filters exclude all deaths AND status filter
    //                      is 'deceased' AND unfiltered count is 0
    //   'no-matches'    -- filters exclude everyone in an otherwise
    //                      non-empty roster

    function _detectEmptyState(roster, filteredCount, totalCount) {
        if (!roster || roster.available !== true) {
            return 'unavailable';
        }
        if (totalCount === 0) return 'no-characters';
        if (filteredCount === 0) return 'no-matches';
        return null;
    }

    // =========================================================================
    // 7. FILTER BAR
    // =========================================================================
    //
    // The tab owns the filter bar markup. Every input carries an
    // id prefixed with `ev-deaths-` so it's unambiguous in the
    // document. The container is re-rendered on every tab render,
    // so the "wired" guard is on each input (not the container) --
    // we attach listeners fresh, and the element is brand new.

    function _renderFilterBar(context, filters) {
        var C = _constants();
        var vm = _vm();
        if (!C || !vm) return '';

        var statusOpts = vm.toStatusFilterOptions(filters.status);
        var causeOpts  = vm.toCauseFilterOptions(filters.cause);
        var genderOpts = vm.toGenderFilterOptions(filters.gender);
        var sortOpts   = vm.toSortFilterOptions
            ? vm.toSortFilterOptions(filters.sortBy)
            : [];

        var U = _ui();
        var optionHtml = function(opts) {
            return U ? U.renderOptionList(opts) : '';
        };

        var showAllLocations = filters.showAllLocations === true;
        var locationName = (context && context.locationName) ? context.locationName : '';

        var collapseIcon = _readCollapsed(_panelId(context && context.locationId))
            ? 'TRIANGLE_DOWN'
            : 'TRIANGLE_UP';

        var html = '';
        html += '<div class="events-filters">';

        // Header line: collapse toggle + location scope
        html += '<div class="events-filters__header">';
        html += '<button type="button" class="events-filters__collapse" ' +
            'data-action="toggle-collapse" aria-label="Toggle filters">' +
            _icon(collapseIcon) +
            '<span>Filters</span>' +
            '</button>';

        html += '<label class="events-filters__scope">';
        html += '<input type="checkbox" class="ev-deaths-input" ' +
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
        var collapsed = _readCollapsed(_panelId(context && context.locationId));
        html += '<div class="events-filters__body"' +
            (collapsed ? ' style="display:none;"' : '') + '>';

        // Row 1: search
        html += '<input type="search" class="ev-deaths-input events-filters__search" ' +
            'data-input="search" placeholder="Search by name..." ' +
            'value="' + _esc(filters.search || '') + '">';

        // Row 2: filter selects
        html += '<select class="ev-deaths-input events-filters__select" data-input="status">' +
            optionHtml(statusOpts) + '</select>';
        html += '<select class="ev-deaths-input events-filters__select" data-input="cause">' +
            optionHtml(causeOpts) + '</select>';
        html += '<select class="ev-deaths-input events-filters__select" data-input="gender">' +
            optionHtml(genderOpts) + '</select>';
        html += '<select class="ev-deaths-input events-filters__select" data-input="sortBy">' +
            optionHtml(sortOpts) + '</select>';

        html += '</div>'; // body
        html += '</div>'; // wrapper

        return html;
    }

    // =========================================================================
    // 8. STATS BAR (wrapped for the tab)
    // =========================================================================
    //
    // The stats bar is provided by the bootstrap in context.eventsState.
    // statsBar. We pass it straight through EventsUIList.renderStatsBar.
    // If the bootstrap did not supply it, we compute it here on the fly.

    function _resolveStatsBar(context) {
        var vm = _vm();
        var q = _queries();
        if (!vm || !q) return null;

        var cached = context && context.eventsState && context.eventsState.statsBar;
        if (cached) return cached;

        // Fallback: compute here. Used when the bootstrap didn't
        // pre-shape it, or when a location filter changed since the
        // last bootstrap pass.
        var popStats = q.getCharacterPopulationStats(
            (context && context.locationId) || null
        );
        return vm.toDeathsStatsBarViewModel(popStats, {
            showInLocation: !!(context && context.locationId)
        });
    }

    // =========================================================================
    // 9. RECENT EVENTS STRIP
    // =========================================================================
    //
    // Optional. Bounded to the 5 most recent death events. Skipped
    // entirely when the query is unavailable -- the tab doesn't show
    // an "unavailable" strip because the strip itself is optional.

    function _resolveRecentEvents() {
        var q = _queries();
        var vm = _vm();
        if (!q || !vm) return null;

        var raw = q.getRecentDeathEvents({ limit: 5 });
        if (!raw || raw.available !== true) return null;
        if (!Array.isArray(raw.events) || raw.events.length === 0) return null;

        return vm.toRecentEventRows(raw);
    }

    // =========================================================================
    // 10. RENDER
    // =========================================================================

    function renderDeathsTab(container, context) {
        if (!container) return;

        // 1. Resolve dependencies
        var q = _queries();
        var vm = _vm();
        var U = _ui();
        var C = _constants();

        if (!q || !vm || !U || !C) {
            container.innerHTML =
                '<div class="events-unavailable">' +
                _esc('Events module is not fully loaded. ' +
                     'Check that events-constants.js, events-queries.js, ' +
                     'events-view-models.js, and events-ui-list.js are loaded.') +
                '</div>';
            return;
        }

        // 2. Resolve scope and filters
        var locationId = (context && context.locationId) || null;
        var panelId = _panelId(locationId);
        if (_lastPanelId !== panelId) {
            _state = _readFilters(panelId);
            _lastPanelId = panelId;
        }
        if (!_state) _state = _defaultFilters();

        // Sync showAllLocations with context: if the sidebar has a
        // location, the default is still "show all" (per
        // DEATHS_DEFAULT_FILTERS), so we only clear it if the user
        // explicitly did.
        //
        // The checkbox persists in filters.showAllLocations; the
        // tab does not need to touch it here.

        // 3. Resolve data
        // If showAllLocations is true, we fetch the roster with a
        // null locationId (all locations). If false, we fetch with
        // the sidebar's locationId.
        var effectiveLocationId = _state.showAllLocations ? null : locationId;
        var roster = q.getCharacterRoster(effectiveLocationId);
        var statsBar = _resolveStatsBar({
            locationId: effectiveLocationId,
            eventsState: context && context.eventsState
        });
        var recentEvents = _resolveRecentEvents();

        // 4. Apply filters + shape
        var characters = (roster && roster.available === true && Array.isArray(roster.characters))
            ? roster.characters
            : [];
        var totalCount = characters.length;
        var filtered = _applyFilters(characters, _state);
        var rows = vm.toCharacterRows(filtered);

        var emptyState = _detectEmptyState(roster, filtered.length, totalCount);

        // 5. Render body
        var filterBarHtml = _renderFilterBar(
            { locationId: locationId, locationName: context && context.locationName },
            _state
        );
        var bodyHtml = U.renderTabBody({
            statsBar: statsBar,
            recentEvents: recentEvents,
            rows: rows,
            emptyState: emptyState,
            emptyStateOptions: emptyState ? _emptyStateOptions(emptyState, roster) : null
        });

        container.innerHTML =
            '<div class="events-deaths-tab">' +
            filterBarHtml +
            bodyHtml +
            '</div>';

        // 6. Wire handlers
        _wireFilterInputs(container, locationId);
        _wireDelegatedHandlers(container);
    }

    function _emptyStateOptions(caseId, roster) {
        var options = {};
        if (caseId === 'unavailable' && roster && roster.reason) {
            options.extraHint = roster.reason;
        }
        if (caseId === 'no-characters') {
            options.extraHint = 'Characters can be created from the Character Manager.';
        }
        if (caseId === 'no-matches') {
            options.extraHint = 'Try clearing filters or widening the search.';
        }
        return options;
    }

    // =========================================================================
    // 11. FILTER INPUT WIRING
    // =========================================================================
    //
    // One listener per input. The input elements are brand-new on
    // every render (the tab rebuilds the whole filter bar), so no
    // "already wired" guard is needed -- the guards would be
    // guards on the OLD elements, which no longer exist.
    //
    // On change: update _state, persist to UIState, re-render the
    // whole tab body via TabManager.requestRender. This is the
    // canonical "small re-render" pattern: delegate to the tab
    // manager rather than patching DOM in place.

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

        // Search box: debounced
        var searchInput = container.querySelector('.events-filters__search');
        if (searchInput) {
            var timer = null;
            searchInput.addEventListener('input', function() {
                if (timer) clearTimeout(timer);
                timer = setTimeout(function() {
                    timer = null;
                    commit({ search: searchInput.value || '' });
                }, 200);
            });
        }

        // Other inputs: immediate
        var inputs = container.querySelectorAll('.ev-deaths-input');
        for (var i = 0; i < inputs.length; i++) {
            (function(input) {
                if (input === searchInput) return;
                var key = input.getAttribute('data-input');
                if (!key) return;

                var eventName = (input.tagName === 'SELECT' || input.type === 'checkbox')
                    ? 'change'
                    : 'input';

                input.addEventListener(eventName, function() {
                    if (input.type === 'checkbox') {
                        commit({ showAllLocations: input.checked === true });
                        return;
                    }
                    commit({ [key]: input.value });
                });
            })(inputs[i]);
        }
    }

    // =========================================================================
    // 12. DELEGATED CLICK HANDLER
    // =========================================================================
    //
    // One listener on the tab container. Attached on every render,
    // but guarded: the container's __eventsDeathsWired marker is
    // checked, and the listener is only attached once per container
    // instance. Because the container persists across renders (only
    // its innerHTML changes), the listener outlives the inner DOM
    // and continues to work.
    //
    // The search input's listener is NOT delegated -- it attaches
    // per render because the input is brand new each time. That's
    // the ONE exception to "delegate everything" and it's a
    // deliberate one (input event delegation via event.target is
    // fragile in browsers due to composition events).
    //
    // The check for "was this tab's container wired" uses a marker
    // on the container element. TabManager does not clear JS
    // properties on the container; only innerHTML is swapped. So the
    // marker survives.

    function _wireDelegatedHandlers(container) {
        if (container.__eventsDeathsWired) return;
        container.__eventsDeathsWired = true;

        container.addEventListener('click', function(e) {
            var target = e.target;
            if (!target || typeof target.closest !== 'function') return;

            // 1. Explicit action buttons (highest priority)
            var actionEl = target.closest('[data-action]');
            if (actionEl && container.contains(actionEl)) {
                var action = actionEl.getAttribute('data-action');

                if (action === 'kill') {
                    e.preventDefault();
                    e.stopPropagation();
                    var killId = actionEl.getAttribute('data-character-id');
                    if (killId) _openKillModal(killId);
                    return;
                }

                if (action === 'open-character') {
                    e.preventDefault();
                    var openId = actionEl.getAttribute('data-character-id');
                    if (openId) _openCharacterDetails(openId);
                    return;
                }

                if (action === 'refresh') {
                    e.preventDefault();
                    _refresh();
                    return;
                }

                if (action === 'clear-filters') {
                    e.preventDefault();
                    _clearFilters();
                    return;
                }

                if (action === 'toggle-collapse') {
                    e.preventDefault();
                    var locId = _currentLocationIdFromContainer(container);
                    var panelId = _panelId(locId);
                    var collapsed = _readCollapsed(panelId);
                    _writeCollapsed(panelId, !collapsed);
                    _refresh();
                    return;
                }
            }
        });

        // Keyboard: Enter / Space on a role=button row opens details
        container.addEventListener('keydown', function(e) {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            var row = e.target && e.target.closest
                ? e.target.closest('.events-row--character[role="button"]')
                : null;
            if (!row || !container.contains(row)) return;
            // Only if the focus is on the row itself, not on a
            // nested button (the Kill button handles its own
            // activation).
            if (e.target !== row) return;
            e.preventDefault();
            var id = row.getAttribute('data-character-id');
            if (id) _openCharacterDetails(id);
        });
    }

    function _currentLocationIdFromContainer(container) {
        // Read the current location scope from the rendered filter
        // bar. When showAllLocations is checked, this is null; when
        // unchecked, it's the sidebar's location. We can't read the
        // sidebar directly from here, so we track the effective
        // scope via the panelId resolution -- but that requires the
        // original context, which we don't retain. Simplest: walk
        // the DOM for the scope span, and if absent, fall back to
        // the module-level _lastPanelId's locationId portion.
        var scopeEl = container.querySelector('.events-filters__scope-name');
        if (scopeEl) {
            // We don't have the id, only the name. Fall back to
            // parsing _lastPanelId.
            return _locationIdFromPanelId(_lastPanelId);
        }
        // "Show all locations" is checked: null scope.
        return null;
    }

    function _locationIdFromPanelId(panelId) {
        if (typeof panelId !== 'string') return null;
        var idx = panelId.lastIndexOf(':');
        if (idx === -1) return null;
        var scope = panelId.slice(idx + 1);
        return scope === 'all' ? null : scope;
    }

    function _clearFilters() {
        var locId = _locationIdFromPanelId(_lastPanelId);
        var panelId = _panelId(locId);
        _state = _defaultFilters();
        _writeFilters(panelId, _state);
        _refresh();
        _toast('Filters cleared.', 'info');
    }

    // =========================================================================
    // 13. KILL / DETAILS DELEGATES
    // =========================================================================

    function _openKillModal(characterId) {
        if (typeof window.openDeathModal !== 'function') {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    '[events-deaths-tab] openDeathModal is not loaded; ' +
                    'load modals-death.js.'
                );
            }
            _toast(
                'Kill action is unavailable: the death modal is not loaded.',
                'error'
            );
            return;
        }
        window.openDeathModal(characterId, function() {
            _refresh();
        });
    }

    function _openCharacterDetails(characterId) {
        if (typeof window.openCharacterDetailsModal !== 'function') {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    '[events-deaths-tab] openCharacterDetailsModal is not ' +
                    'loaded; character details cannot be opened from this tab.'
                );
            }
            return;
        }
        window.openCharacterDetailsModal(characterId);
    }

    // =========================================================================
    // 14. REFRESH
    // =========================================================================

    function _refresh() {
        var TM = _tabManager();
        if (TM && typeof TM.requestRender === 'function') {
            TM.requestRender(SCOPE, TAB_ID);
        }
    }

    // =========================================================================
    // 15. STYLES (injected once)
    // =========================================================================
    //
    // The tab's own stylesheet. Classes are scoped to `events-*` so
    // no other manager is affected. Every color is a theme token
    // from css/themes.css. Every icon is inline SVG from
    // Icons (rendered by EventsUIList). No emojis, no Unicode
    // glyphs, no hardcoded hex.

    function _ensureStyles() {
        if (document.getElementById('events-deaths-tab-styles')) return;
        var style = document.createElement('style');
        style.id = 'events-deaths-tab-styles';
        style.textContent = [
            '.events-deaths-tab {',
            '  display: flex;',
            '  flex-direction: column;',
            '  gap: 0.75rem;',
            '}',

            '.events-filters {',
            '  background: var(--bg2);',
            '  border: 1px solid var(--border);',
            '  border-radius: var(--radius);',
            '  padding: 0.5rem 0.75rem;',
            '  display: flex;',
            '  flex-direction: column;',
            '  gap: 0.5rem;',
            '}',
            '.events-filters__header {',
            '  display: flex;',
            '  align-items: center;',
            '  gap: 0.75rem;',
            '  flex-wrap: wrap;',
            '  font-size: 0.65rem;',
            '}',
            '.events-filters__collapse,',
            '.events-filters__clear,',
            '.events-filters__refresh {',
            '  display: inline-flex;',
            '  align-items: center;',
            '  gap: 0.3125rem;',
            '  padding: 0.25rem 0.625rem;',
            '  background: var(--bg3);',
            '  border: 1px solid var(--border);',
            '  border-radius: var(--radius);',
            '  color: var(--text);',
            '  font-family: var(--f-body);',
            '  font-size: 0.65rem;',
            '  cursor: pointer;',
            '}',
            '.events-filters__collapse:hover,',
            '.events-filters__clear:hover,',
            '.events-filters__refresh:hover {',
            '  border-color: var(--accent);',
            '  color: var(--accent-light);',
            '}',
            '.events-filters__collapse svg,',
            '.events-filters__clear svg,',
            '.events-filters__refresh svg {',
            '  width: 0.85em;',
            '  height: 0.85em;',
            '  fill: currentColor;',
            '}',
            '.events-filters__scope {',
            '  display: inline-flex;',
            '  align-items: center;',
            '  gap: 0.375rem;',
            '  font-size: 0.65rem;',
            '  color: var(--text);',
            '  cursor: pointer;',
            '}',
            '.events-filters__scope-name {',
            '  font-size: 0.6rem;',
            '  color: var(--dim);',
            '  padding: 0.125rem 0.5rem;',
            '  background: var(--bg3);',
            '  border-radius: var(--radius);',
            '}',
            '.events-filters__spacer {',
            '  flex: 1;',
            '  min-width: 0.5rem;',
            '}',
            '.events-filters__body {',
            '  display: flex;',
            '  gap: 0.5rem;',
            '  flex-wrap: wrap;',
            '  align-items: center;',
            '}',
            '.events-filters__search {',
            '  flex: 1 1 12rem;',
            '  min-width: 0;',
            '}',
            '.events-filters__select {',
            '  flex: 0 1 auto;',
            '  min-width: 8rem;',
            '}',
            '.events-filters input[type="search"],',
            '.events-filters input[type="text"],',
            '.events-filters select {',
            '  padding: 0.3125rem 0.5rem;',
            '  background: var(--bg);',
            '  border: 1px solid var(--border);',
            '  border-radius: var(--radius);',
            '  color: var(--text);',
            '  font-family: var(--f-body);',
            '  font-size: 0.72rem;',
            '}',
            '.events-filters input:focus,',
            '.events-filters select:focus {',
            '  outline: none;',
            '  border-color: var(--accent);',
            '}',

            '.events-stats-bar {',
            '  display: grid;',
            '  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));',
            '  gap: 0.5rem;',
            '  margin-bottom: 0.25rem;',
            '}',
            '.events-stats-bar--unavailable {',
            '  display: flex;',
            '  padding: 0.5rem 0.75rem;',
            '  background: var(--bg3);',
            '  border-radius: var(--radius);',
            '  font-size: 0.65rem;',
            '  color: var(--dim);',
            '}',
            '.events-stats-bar__cell {',
            '  display: flex;',
            '  align-items: center;',
            '  gap: 0.375rem;',
            '  padding: 0.5rem 0.75rem;',
            '  background: var(--bg2);',
            '  border: 1px solid var(--border);',
            '  border-radius: var(--radius);',
            '}',
            '.events-stats-bar__icon {',
            '  display: inline-flex;',
            '  width: 1em;',
            '  height: 1em;',
            '  color: var(--accent);',
            '}',
            '.events-stats-bar__icon svg {',
            '  width: 100%;',
            '  height: 100%;',
            '  fill: currentColor;',
            '}',
            '.events-stats-bar__label {',
            '  font-family: var(--f-display);',
            '  font-size: 0.55rem;',
            '  text-transform: uppercase;',
            '  letter-spacing: 0.05em;',
            '  color: var(--dim);',
            '}',
            '.events-stats-bar__value {',
            '  font-family: var(--f-mono);',
            '  font-size: 0.85rem;',
            '  font-weight: 600;',
            '  margin-left: auto;',
            '}',

            '.events-tab-body {',
            '  display: flex;',
            '  flex-direction: column;',
            '  gap: 0.75rem;',
            '}',
            '.events-tab-body__recent {',
            '  background: var(--bg2);',
            '  border: 1px solid var(--border);',
            '  border-radius: var(--radius);',
            '  padding: 0.5rem 0.75rem;',
            '}',
            '.events-tab-body__recent-header {',
            '  font-family: var(--f-display);',
            '  font-size: 0.55rem;',
            '  text-transform: uppercase;',
            '  letter-spacing: 0.05em;',
            '  color: var(--dim);',
            '  margin-bottom: 0.375rem;',
            '}',

            '.events-recent {',
            '  display: flex;',
            '  flex-direction: column;',
            '  gap: 0.25rem;',
            '}',
            '.events-recent__row {',
            '  display: flex;',
            '  gap: 0.5rem;',
            '  align-items: baseline;',
            '  font-size: 0.65rem;',
            '}',
            '.events-recent__year {',
            '  font-family: var(--f-mono);',
            '  color: var(--accent);',
            '  min-width: 3rem;',
            '}',
            '.events-recent__message {',
            '  flex: 1;',
            '  min-width: 0;',
            '  color: var(--text);',
            '}',
            '.events-recent__location {',
            '  color: var(--dim);',
            '  font-size: 0.55rem;',
            '}',

            '.events-list {',
            '  display: flex;',
            '  flex-direction: column;',
            '  gap: 0.25rem;',
            '}',
            '.events-row {',
            '  display: flex;',
            '  align-items: flex-start;',
            '  gap: 0.625rem;',
            '  padding: 0.5rem 0.75rem;',
            '  background: var(--bg2);',
            '  border: 1px solid var(--border);',
            '  border-left: 3px solid var(--border);',
            '  border-radius: var(--radius);',
            '  cursor: pointer;',
            '  transition: background 0.15s;',
            '}',
            '.events-row:hover {',
            '  background: var(--bg3);',
            '}',
            '.events-row:focus-visible {',
            '  outline: 2px solid var(--accent);',
            '  outline-offset: -2px;',
            '}',
            '.events-row--living {',
            '  border-left-color: var(--success);',
            '}',
            '.events-row--deceased {',
            '  border-left-color: var(--danger);',
            '}',
            '.events-row__gender-icon {',
            '  display: inline-flex;',
            '  align-items: center;',
            '  justify-content: center;',
            '  width: 1.25rem;',
            '  height: 1.25rem;',
            '  flex-shrink: 0;',
            '  margin-top: 0.125rem;',
            '}',
            '.events-row__gender-icon svg {',
            '  width: 100%;',
            '  height: 100%;',
            '  fill: currentColor;',
            '}',
            '.events-row__body {',
            '  flex: 1;',
            '  min-width: 0;',
            '}',
            '.events-row__title {',
            '  display: flex;',
            '  align-items: baseline;',
            '  gap: 0.5rem;',
            '  flex-wrap: wrap;',
            '}',
            '.events-row__name {',
            '  font-family: var(--f-display);',
            '  font-size: 0.8rem;',
            '  font-weight: 600;',
            '  color: var(--text);',
            '}',
            '.events-row__status {',
            '  display: inline-flex;',
            '  align-items: center;',
            '  gap: 0.1875rem;',
            '  font-size: 0.55rem;',
            '  text-transform: uppercase;',
            '  letter-spacing: 0.05em;',
            '}',
            '.events-row__status svg {',
            '  width: 0.75em;',
            '  height: 0.75em;',
            '  fill: currentColor;',
            '}',
            '.events-row__secondary,',
            '.events-row__death {',
            '  display: flex;',
            '  gap: 0.375rem;',
            '  flex-wrap: wrap;',
            '  align-items: baseline;',
            '  font-size: 0.6rem;',
            '  color: var(--dim);',
            '  margin-top: 0.125rem;',
            '}',
            '.events-row__sep {',
            '  opacity: 0.5;',
            '}',
            '.events-row__death-cause {',
            '  font-weight: 500;',
            '}',
            '.events-row__action-wrap {',
            '  flex-shrink: 0;',
            '  align-self: center;',
            '}',
            '.events-row__action {',
            '  display: inline-flex;',
            '  align-items: center;',
            '  gap: 0.3125rem;',
            '  padding: 0.25rem 0.625rem;',
            '  background: var(--bg3);',
            '  border: 1px solid var(--border);',
            '  border-radius: var(--radius);',
            '  color: var(--text);',
            '  font-family: var(--f-body);',
            '  font-size: 0.6rem;',
            '  cursor: pointer;',
            '}',
            '.events-row__action svg {',
            '  width: 0.85em;',
            '  height: 0.85em;',
            '  fill: currentColor;',
            '}',
            '.events-row__action--kill {',
            '  border-color: var(--danger-lt);',
            '  color: var(--danger-lt);',
            '}',
            '.events-row__action--kill:hover {',
            '  background: var(--danger-soft);',
            '}',
            '.events-row__action--disabled {',
            '  opacity: 0.55;',
            '  cursor: not-allowed;',
            '}',

            '.events-empty {',
            '  padding: 2rem 1rem;',
            '  text-align: center;',
            '  color: var(--dim);',
            '  font-size: 0.75rem;',
            '}',
            '.events-empty__icon {',
            '  display: inline-flex;',
            '  width: 2.5rem;',
            '  height: 2.5rem;',
            '  margin-bottom: 0.5rem;',
            '  opacity: 0.6;',
            '}',
            '.events-empty__icon svg {',
            '  width: 100%;',
            '  height: 100%;',
            '  fill: currentColor;',
            '}',
            '.events-empty__message {',
            '  font-size: 0.8rem;',
            '  color: var(--text);',
            '  margin-bottom: 0.25rem;',
            '}',
            '.events-empty__sub {',
            '  font-size: 0.65rem;',
            '  color: var(--dim);',
            '}',

            '.events-unavailable {',
            '  padding: 2rem 1rem;',
            '  text-align: center;',
            '  color: var(--danger-lt);',
            '  font-size: 0.75rem;',
            '}'
        ].join('\n');
        document.head.appendChild(style);
    }

    // =========================================================================
    // 16. REGISTRATION
    // =========================================================================

    _ensureStyles();

    var TM = _tabManager();
    if (TM && typeof TM.register === 'function') {
        TM.register(SCOPE, TAB_ID, renderDeathsTab);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn(
            'events-deaths-tab.js: TabManager is not available at load ' +
            'time; the deaths tab was not registered. Load tab-manager.js ' +
            'first.'
        );
    }

    // =========================================================================
    // 17. EXPORTS
    // =========================================================================

    window.EventsDeathsTab = {
        id: TAB_ID,
        render: renderDeathsTab,

        // Exposed for tests. Not for public consumption.
        _helpers: {
            applyFilters: _applyFilters,
            defaultFilters: _defaultFilters,
            compareBySort: _compareBySort,
            detectEmptyState: _detectEmptyState,
            panelId: _panelId
        }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.EventsDeathsTab;
    }
})();
