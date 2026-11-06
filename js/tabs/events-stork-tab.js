/**
 * =============================================================================
 * EVENTS STORK TAB
 * js/tabs/events-stork-tab.js
 * =============================================================================
 *
 * LOCATION: js/tabs/events-stork-tab.js
 *
 * The Events Manager's Births tab (internally "stork"). Renders the
 * fertile-couple roster grouped by man; each man can have multiple
 * partners, each partner is a couple row with existing-children
 * circles, an expected-children count, a fertility percentage, and
 * two actions: + Child (opens the batch birth modal) and Surprise
 * (opens the surprise birth modal).
 *
 * RENDERER CONTRACT (from EventsManagerBootstrap):
 *   fn(container, context)
 *   container  HTMLElement  -- already emptied by TabManager
 *   context    { locationId, locationName, eventsState }
 *
 * DATA SOURCES:
 *   EventsQueries.getFertileCouples(locationId, filters)
 *   EventsQueries.getCharacterPopulationStats(locationId)
 *   CharacterQueries.getCharacterSummary  (child summaries for
 *                                          child circles)
 *   EventsViewModels.toManGroup / toCoupleRow / toChildCircle
 *   EventsUIList.renderStorkTabBody / renderOptionList
 *   UIState.getFilters / setFilters / getData / setData / getCollapsed
 *   window.openBatchBirthModal(motherId, fatherId, onSuccess)
 *   window.openSurpriseBirthModal(motherId, fatherId, onSuccess)
 *   window.openCharacterDetailsModal(characterId)
 *
 * FILTERS (persisted per location via UIState):
 *   search           string
 *   fertileOnly      boolean (default true)
 *   hasCapacityOnly  boolean (default true)
 *   childlessOnly    boolean (default false)
 *   sortBy           'rank' | 'name' | 'children'
 *   showAllLocations boolean (default true)
 *   collapsed        boolean (filters collapsed)
 *
 * PER-MAN EXPAND STATE:
 *   Persisted via UIState.getData / setData under key
 *   'expandedMan:<manId>' -> boolean. Default: expanded (true).
 *
 * DELEGATED EVENTS:
 *   One click listener on the container (attached once via
 *   container.__eventsStorkWired).
 *     data-action="add-child"        data-woman-id (father from parent man)
 *     data-action="surprise-birth"   data-woman-id (father from parent man)
 *     data-action="open-character"   data-character-id
 *     data-action="toggle-man"       data-man-id
 *     data-action="refresh"
 *     data-action="clear-filters"
 *     data-action="toggle-collapse"
 *
 * DEPENDENCIES (all soft; guarded at call time):
 *   - EventsQueries, EventsViewModels, EventsUIList, EventsConstants
 *   - TabManager        REQUIRED for registration
 *   - formatting.js     escapeHtml  REQUIRED (via EventsUIList)
 *   - icons.js          getIcon     REQUIRED (via EventsUIList)
 *   - ui.js             showToast   OPTIONAL
 *   - UIState           REQUIRED (filters + collapse + expand)
 *   - window.openBatchBirthModal       OPTIONAL (toast if absent)
 *   - window.openSurpriseBirthModal    OPTIONAL (toast if absent)
 *   - window.openCharacterDetailsModal OPTIONAL (silent no-op)
 *
 * TIME CONTRACT: uses window.getCurrentYear (no fallback).
 * ICON POLICY: no emojis, no Unicode glyphs. Icons via EventsUIList.icon.
 * =============================================================================
 *
 * REFACTOR HISTORY:
 *   Initial revision.
 *     - Ported from Stork_v03.html + bioChildrenTabUI.js. The old
 *       file was a manager-local sub-tab app; the new file is a
 *       single Events Manager facet tab.
 *     - Reads through RomanceQueries.getActiveCommittedPartners
 *       (old file read char.relationships which is not in the
 *       projection, always empty in the new tree) and
 *       FamilyQueries.getBiologicalChildIds (old file read
 *       child.motherId / child.fatherId which are not on the
 *       record, always undefined in the new tree).
 *     - Filter state via UIState (old file used module-level state
 *       that reset on every render).
 *     - Per-man expand state via UIState.getData / setData (old
 *       file expanded every group by default with no per-group
 *       override).
 *     - Delegated click handler on the container (old file
 *       attached btn.onclick per element and accumulated listeners
 *       across renders).
 *     - Filter inputs get per-render listeners (they are new
 *       elements on each render — attaching to the container
 *       would break input event delegation during IME composition).
 *     - No setTimeout. No document.getElementById outside
 *       _ensureStyles. No literal Unicode glyphs. No hardcoded
 *       colors. Three-way empty state.
 *     - Modal delegates route through window.openBatchBirthModal
 *       and window.openSurpriseBirthModal (from the current
 *       modals-children-birth.js). The old page's
 *       openAddChildrenModal name does not exist in the new tree.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var TAB_ID = 'stork';
    var SCOPE  = 'events';

    // =========================================================================
    // 2. DEPENDENCY ACCESSORS
    // =========================================================================

    function _queries()        { return window.EventsQueries || null; }
    function _vm()             { return window.EventsViewModels || null; }
    function _ui()             { return window.EventsUIList || null; }
    function _constants()      { return window.EventsConstants || null; }
    function _tabManager()     { return window.TabManager || null; }
    function _uiState()        { return window.UIState || null; }
    function _characterQueries() { return window.CharacterQueries || null; }

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
            fertileOnly: true,
            hasCapacityOnly: true,
            childlessOnly: false,
            sortBy: 'rank',
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
    // 5. PER-MAN EXPAND STATE
    // =========================================================================

    function _readExpandedMap(panelId, manIds) {
        var U = _uiState();
        var out = {};
        for (var i = 0; i < manIds.length; i++) {
            var key = 'expandedMan:' + manIds[i];
            var v = U ? U.getData(panelId, key, true) : true;
            out[manIds[i]] = v !== false;
        }
        return out;
    }

    function _writeExpanded(panelId, manId, expanded) {
        var U = _uiState();
        if (!U) return;
        U.setData(panelId, 'expandedMan:' + manId, expanded === true);
    }

    // =========================================================================
    // 6. AGE GROUP RESOLVER
    // =========================================================================
    //
    // The view-model shaper accepts an ageGroupFn callback. This tab
    // supplies one that routes through CharacterLifecycle.getAgeGroup
    // when available; otherwise it computes the group inline from
    // window.AGE_GROUPS if present, otherwise returns null.

    function _ageGroupForAge(age) {
        if (typeof age !== 'number' || !isFinite(age) || age < 0) return null;

        if (window.CharacterLifecycle
            && typeof window.CharacterLifecycle.getAgeGroup === 'function') {
            try {
                var g = window.CharacterLifecycle.getAgeGroup(age);
                if (typeof g === 'string') return g;
            } catch (e) { /* fall through */ }
        }

        if (Array.isArray(window.AGE_GROUPS)) {
            for (var i = 0; i < window.AGE_GROUPS.length; i++) {
                var band = window.AGE_GROUPS[i];
                if (typeof band !== 'string') continue;
                var parts = band.split('-');
                if (parts.length !== 2) continue;
                var min = parseInt(parts[0], 10);
                var maxPart = parts[1];
                var max = maxPart === '+' ? Infinity : parseInt(maxPart, 10);
                if (isNaN(min)) continue;
                if (maxPart !== '+' && isNaN(max)) continue;
                if (age >= min && age <= max) return band;
            }
        }
        return null;
    }

    // =========================================================================
    // 7. CHILD SUMMARY BULK FETCH
    // =========================================================================
    //
    // The stork tab renders child circles across every couple. Fetch
    // every unique child's summary once, in a single pre-pass, so the
    // view-model shaper can look each one up by id.
    //
    // The old bioChildrenTabUI.js fetched children per couple in a
    // loop; this is O(M unique children) rather than O(N partners).

    function _buildChildSummaryMap(couplesResult) {
        var CQ = _characterQueries();
        if (!CQ || typeof CQ.getCharacterSummary !== 'function') {
            return {};
        }
        var men = (couplesResult && Array.isArray(couplesResult.men))
            ? couplesResult.men
            : [];
        var seen = {};
        var out = {};
        for (var i = 0; i < men.length; i++) {
            var manEntry = men[i];
            if (!manEntry || !Array.isArray(manEntry.partners)) continue;
            for (var p = 0; p < manEntry.partners.length; p++) {
                var partner = manEntry.partners[p];
                if (!partner || !Array.isArray(partner.existingChildIds)) continue;
                for (var c = 0; c < partner.existingChildIds.length; c++) {
                    var cid = partner.existingChildIds[c];
                    if (!cid || seen[cid]) continue;
                    seen[cid] = true;
                    var summary;
                    try { summary = CQ.getCharacterSummary(cid); }
                    catch (e) { summary = null; }
                    if (summary) out[cid] = summary;
                }
            }
        }
        return out;
    }

    // =========================================================================
    // 8. FILTER BAR RENDERER
    // =========================================================================

    function _renderFilterBar(context, filters) {
        var C = _constants();
        var vm = _vm();
        var U = _ui();
        if (!C || !vm || !U) return '';

        var sortOpts = vm.toStorkSortOptions
            ? vm.toStorkSortOptions(filters.sortBy)
            : [];
        var sortHtml = U.renderOptionList(sortOpts);

        var showAllLocations = filters.showAllLocations === true;
        var locationName = (context && context.locationName) ? context.locationName : '';
        var collapsed = filters.collapsed === true;
        var collapseIconName = collapsed ? 'TRIANGLE_DOWN' : 'TRIANGLE_UP';

        var html = '';
        html += '<div class="events-filters events-filters--stork">';

        // Header line
        html += '<div class="events-filters__header">';
        html += '<button type="button" class="events-filters__collapse" ' +
            'data-action="toggle-collapse" aria-label="Toggle filters">' +
            _icon(collapseIconName) +
            '<span>Filters</span>' +
            '</button>';

        html += '<label class="events-filters__scope">';
        html += '<input type="checkbox" class="ev-stork-input" ' +
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

        // Search
        html += '<input type="search" class="ev-stork-input events-filters__search" ' +
            'data-input="search" placeholder="Search by name..." ' +
            'value="' + _esc(filters.search || '') + '">';

        // Sort select
        html += '<select class="ev-stork-input events-filters__select" data-input="sortBy">' +
            sortHtml + '</select>';

        // Checkboxes
        html += '<label class="events-filters__checkbox">';
        html += '<input type="checkbox" class="ev-stork-input" ' +
            'data-input="fertile-only"' +
            (filters.fertileOnly === true ? ' checked' : '') + '>';
        html += '<span>Fertile</span>';
        html += '</label>';

        html += '<label class="events-filters__checkbox">';
        html += '<input type="checkbox" class="ev-stork-input" ' +
            'data-input="has-capacity-only"' +
            (filters.hasCapacityOnly === true ? ' checked' : '') + '>';
        html += '<span>Has Capacity</span>';
        html += '</label>';

        html += '<label class="events-filters__checkbox events-filters__checkbox--highlight">';
        html += '<input type="checkbox" class="ev-stork-input" ' +
            'data-input="childless-only"' +
            (filters.childlessOnly === true ? ' checked' : '') + '>';
        html += '<span>Childless Only</span>';
        html += '</label>';

        html += '</div>'; // body
        html += '</div>'; // wrapper

        return html;
    }

    // =========================================================================
    // 9. STATS BAR (via bootstrap context)
    // =========================================================================
    //
    // The bootstrap pre-computes the deaths-style stats bar in
    // context.eventsState.statsBar. For the stork tab, that bar shows
    // living/deceased counts (same source) which is relevant context;
    // we pass it straight through. If the bootstrap didn't supply
    // one, we compute it here.

    function _resolveStatsBar(context) {
        var vm = _vm();
        var q = _queries();
        if (!vm || !q) return null;

        var cached = context && context.eventsState && context.eventsState.statsBar;
        if (cached) return cached;

        var popStats = q.getCharacterPopulationStats(
            (context && context.locationId) || null
        );
        return vm.toDeathsStatsBarViewModel(popStats, {
            showInLocation: !!(context && context.locationId)
        });
    }

    // =========================================================================
    // 10. EMPTY-STATE CASE DETECTION
    // =========================================================================

    function _detectEmptyState(result) {
        if (!result || result.available !== true) {
            return 'unavailable';
        }
        if (!Array.isArray(result.men) || result.men.length === 0) {
            return 'no-couples';
        }
        return null;
    }

    // =========================================================================
    // 11. MAIN RENDER
    // =========================================================================

    function renderStorkTab(container, context) {
        if (!container) return;

        var q = _queries();
        var vm = _vm();
        var U = _ui();
        var C = _constants();

        if (!q || !vm || !U || !C) {
            container.innerHTML =
                '<div class="events-unavailable">' +
                _esc('Events module is not fully loaded. ' +
                     'Check that events-constants.js, events-queries.js, ' +
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
        var result = q.getFertileCouples(effectiveLocationId, _state);

        // Stats bar (same source as the deaths tab)
        var statsBar = _resolveStatsBar({
            locationId: effectiveLocationId,
            eventsState: context && context.eventsState
        });

        // Empty state (no-couples / no-matches / unavailable)
        var emptyState = _detectEmptyState(result);

        // If result is available and has men, build the view models
        var manGroups = [];
        var expandedMap = {};
        if (result && result.available === true && Array.isArray(result.men)) {
            var childSummaryMap = _buildChildSummaryMap(result);
            var manIds = [];
            for (var m = 0; m < result.men.length; m++) {
                if (result.men[m] && result.men[m].manId) {
                    manIds.push(result.men[m].manId);
                }
            }
            expandedMap = _readExpandedMap(panelId, manIds);

            for (var n = 0; n < result.men.length; n++) {
                var manVm = vm.toManGroup(
                    result.men[n],
                    childSummaryMap,
                    _ageGroupForAge
                );
                if (manVm) manGroups.push(manVm);
            }
        }

        // Build the filter bar + body
        var filterBarHtml = _renderFilterBar(
            { locationId: locationId, locationName: context && context.locationName },
            _state
        );
        var bodyHtml = U.renderStorkTabBody({
            statsBar: statsBar,
            manGroups: manGroups,
            expandedMap: expandedMap,
            emptyState: emptyState,
            emptyStateOptions: emptyState
                ? _emptyStateOptions(emptyState, result)
                : null
        });

        container.innerHTML =
            '<div class="events-stork-tab">' +
            filterBarHtml +
            bodyHtml +
            '</div>';

        // Wire
        _wireFilterInputs(container, locationId);
        _wireDelegatedHandlers(container, locationId);
    }

    function _emptyStateOptions(caseId, result) {
        var options = {};
        if (caseId === 'unavailable' && result && result.reason) {
            options.extraHint = result.reason;
        }
        if (caseId === 'no-couples') {
            options.extraHint = 'Try adjusting the Fertile or Has Capacity filters.';
        }
        return options;
    }

    // =========================================================================
    // 12. FILTER INPUT WIRING (per-render, fresh elements)
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

        var inputs = container.querySelectorAll('.ev-stork-input');
        for (var i = 0; i < inputs.length; i++) {
            (function(input) {
                var key = input.getAttribute('data-input');
                if (!key) return;

                var eventName = (input.tagName === 'SELECT' || input.type === 'checkbox')
                    ? 'change'
                    : 'input';

                // Search input gets a small debounce.
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
                        if (key === 'fertile-only') {
                            commit({ fertileOnly: input.checked === true });
                            return;
                        }
                        if (key === 'has-capacity-only') {
                            commit({ hasCapacityOnly: input.checked === true });
                            return;
                        }
                        if (key === 'childless-only') {
                            commit({ childlessOnly: input.checked === true });
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
    // 13. DELEGATED CLICK HANDLER
    // =========================================================================

    function _wireDelegatedHandlers(container, locationId) {
        if (container.__eventsStorkWired) return;
        container.__eventsStorkWired = true;

        container.addEventListener('click', function(e) {
            var target = e.target;
            if (!target || typeof target.closest !== 'function') return;

            var actionEl = target.closest('[data-action]');
            if (!actionEl || !container.contains(actionEl)) return;

            var action = actionEl.getAttribute('data-action');

            if (action === 'add-child') {
                e.preventDefault();
                e.stopPropagation();
                _handleAddChild(actionEl, locationId);
                return;
            }

            if (action === 'surprise-birth') {
                e.preventDefault();
                e.stopPropagation();
                _handleSurpriseBirth(actionEl, locationId);
                return;
            }

            if (action === 'open-character') {
                e.preventDefault();
                e.stopPropagation();
                var cid = actionEl.getAttribute('data-character-id');
                if (cid) _openCharacterDetails(cid);
                return;
            }

            if (action === 'toggle-man') {
                e.preventDefault();
                var manId = actionEl.getAttribute('data-man-id');
                if (!manId) return;
                var U = _uiState();
                if (!U) return;
                var panelId = _panelId(locationId);
                var current = U.getData(panelId, 'expandedMan:' + manId, true);
                _writeExpanded(panelId, manId, current === false);
                _refresh();
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

        // Keyboard: Enter / Space on man group headers opens/closes.
        container.addEventListener('keydown', function(e) {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            var header = e.target && e.target.closest
                ? e.target.closest('.events-stork-man__header[role="button"]')
                : null;
            if (!header || !container.contains(header)) return;
            if (e.target !== header) return;
            e.preventDefault();
            var manId = header.getAttribute('data-man-id');
            if (!manId) return;
            var U = _uiState();
            if (!U) return;
            var panelId = _panelId(locationId);
            var current = U.getData(panelId, 'expandedMan:' + manId, true);
            _writeExpanded(panelId, manId, current === false);
            _refresh();
        });
    }

    // =========================================================================
    // 14. ADD-CHILD / SURPRISE HANDLERS
    // =========================================================================
    //
    // Each couple row's action button carries data-woman-id only.
    // The father id is resolved by walking up to the parent
    // .events-stork-man[data-man-id] element.

    function _resolveManIdForAction(actionEl) {
        var manEl = actionEl.closest('.events-stork-man');
        if (!manEl) return null;
        return manEl.getAttribute('data-man-id');
    }

    function _handleAddChild(actionEl, locationId) {
        var womanId = actionEl.getAttribute('data-woman-id');
        var manId = _resolveManIdForAction(actionEl);
        if (!womanId || !manId) {
            _toast('Could not determine couple.', 'error');
            return;
        }

        if (typeof window.openBatchBirthModal !== 'function') {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    '[events-stork-tab] openBatchBirthModal is not loaded; ' +
                    'load modals-children-birth.js.'
                );
            }
            _toast(
                'Birth modal is unavailable. Load modals-children-birth.js.',
                'error'
            );
            return;
        }

        window.openBatchBirthModal(womanId, manId, function() {
            _refresh();
        });
    }

    function _handleSurpriseBirth(actionEl, locationId) {
        var womanId = actionEl.getAttribute('data-woman-id');
        var manId = _resolveManIdForAction(actionEl);
        if (!womanId || !manId) {
            _toast('Could not determine couple.', 'error');
            return;
        }

        if (typeof window.openSurpriseBirthModal !== 'function') {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    '[events-stork-tab] openSurpriseBirthModal is not loaded; ' +
                    'load modals-children-birth.js.'
                );
            }
            _toast(
                'Surprise birth modal is unavailable. Load modals-children-birth.js.',
                'error'
            );
            return;
        }

        window.openSurpriseBirthModal(womanId, manId, function() {
            _refresh();
        });
    }

    // =========================================================================
    // 15. CHARACTER DETAILS DELEGATE
    // =========================================================================

    function _openCharacterDetails(characterId) {
        if (typeof window.openCharacterDetailsModal !== 'function') {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    '[events-stork-tab] openCharacterDetailsModal is not loaded.'
                );
            }
            return;
        }
        window.openCharacterDetailsModal(characterId);
    }

    // =========================================================================
    // 16. FILTER RESET
    // =========================================================================

    function _clearFilters(locationId) {
        var defaults = _defaultFilters();
        _state = {
            search: defaults.search,
            fertileOnly: defaults.fertileOnly,
            hasCapacityOnly: defaults.hasCapacityOnly,
            childlessOnly: defaults.childlessOnly,
            sortBy: defaults.sortBy,
            showAllLocations: _state.showAllLocations,
            collapsed: _state.collapsed
        };
        _writeFilters(_panelId(locationId), _state);
        _refresh();
        _toast('Filters cleared.', 'info');
    }

    // =========================================================================
    // 17. REFRESH
    // =========================================================================

    function _refresh() {
        var TM = _tabManager();
        if (TM && typeof TM.requestRender === 'function') {
            TM.requestRender(SCOPE, TAB_ID);
        }
    }

    // =========================================================================
    // 18. STYLES
    // =========================================================================
    //
    // Base classes (.events-filters, .events-stats-bar, .events-list,
    // .events-empty, .events-unavailable) are defined by
    // events-deaths-tab.js. This stylesheet defines only the classes
    // specific to the stork facet: the couple row, the child circles,
    // the man card, and the two checkbox variants.

    function _ensureStyles() {
        if (document.getElementById('events-stork-tab-styles')) return;
        var style = document.createElement('style');
        style.id = 'events-stork-tab-styles';
        style.textContent = [
            '.events-stork-tab {',
            '  display: flex;',
            '  flex-direction: column;',
            '  gap: 0.75rem;',
            '}',

            // Filter bar additions
            '.events-filters--stork .events-filters__body {',
            '  gap: 0.5rem;',
            '  flex-wrap: wrap;',
            '}',
            '.events-filters__checkbox {',
            '  display: inline-flex;',
            '  align-items: center;',
            '  gap: 0.3125rem;',
            '  font-size: 0.65rem;',
            '  color: var(--text);',
            '  cursor: pointer;',
            '}',
            '.events-filters__checkbox--highlight {',
            '  background: var(--warn-soft, var(--bg3));',
            '  padding: 0.125rem 0.5rem;',
            '  border-radius: var(--radius);',
            '}',

            // Body wrapper
            '.events-stork-body {',
            '  display: flex;',
            '  flex-direction: column;',
            '  gap: 0.75rem;',
            '}',
            '.events-stork-list {',
            '  display: flex;',
            '  flex-direction: column;',
            '  gap: 0.5rem;',
            '}',

            // Man card
            '.events-stork-man {',
            '  background: var(--bg2);',
            '  border: 1px solid var(--border);',
            '  border-radius: var(--radius);',
            '  overflow: hidden;',
            '}',
            '.events-stork-man__header {',
            '  display: flex;',
            '  align-items: center;',
            '  gap: 0.5rem;',
            '  padding: 0.5rem 0.75rem;',
            '  background: var(--bg3);',
            '  border-bottom: 1px solid var(--border);',
            '  cursor: pointer;',
            '  flex-wrap: wrap;',
            '}',
            '.events-stork-man__header:hover {',
            '  background: var(--accent-dim);',
            '}',
            '.events-stork-man__header:focus-visible {',
            '  outline: 2px solid var(--accent);',
            '  outline-offset: -2px;',
            '}',
            '.events-stork-man__expand-icon {',
            '  display: inline-flex;',
            '  width: 0.75em;',
            '  height: 0.75em;',
            '  color: var(--accent);',
            '}',
            '.events-stork-man__expand-icon svg {',
            '  width: 100%;',
            '  height: 100%;',
            '  fill: currentColor;',
            '}',
            '.events-stork-man__rank {',
            '  color: var(--accent);',
            '  font-size: 0.6rem;',
            '}',
            '.events-stork-man__name {',
            '  font-family: var(--f-display);',
            '  font-size: 0.85rem;',
            '  font-weight: 600;',
            '  color: var(--text);',
            '}',
            '.events-stork-man__age {',
            '  font-size: 0.6rem;',
            '  color: var(--dim);',
            '}',
            '.events-stork-man__location {',
            '  font-size: 0.55rem;',
            '  color: var(--dim);',
            '}',
            '.events-stork-man__stats {',
            '  font-size: 0.55rem;',
            '  color: var(--accent-light);',
            '  margin-left: auto;',
            '}',
            '.events-stork-man__partners {',
            '  padding: 0.25rem 0;',
            '}',
            '.events-stork-man__empty {',
            '  padding: 0.75rem;',
            '  text-align: center;',
            '  color: var(--dim);',
            '  font-size: 0.65rem;',
            '}',

            // Couple row
            '.events-stork-couple {',
            '  display: grid;',
            '  grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 1.5fr) auto;',
            '  gap: 0.5rem;',
            '  align-items: center;',
            '  padding: 0.5rem 0.75rem;',
            '  border-bottom: 1px solid var(--border);',
            '  background: var(--bg2);',
            '}',
            '.events-stork-couple:last-child {',
            '  border-bottom: none;',
            '}',
            '.events-stork-couple:hover {',
            '  background: var(--bg3);',
            '}',
            '@media (max-width: 900px) {',
            '  .events-stork-couple {',
            '    grid-template-columns: 1fr;',
            '  }',
            '}',
            '.events-stork-couple__identity {',
            '  display: flex;',
            '  align-items: baseline;',
            '  gap: 0.375rem;',
            '  flex-wrap: wrap;',
            '}',
            '.events-stork-couple__rank {',
            '  color: var(--accent);',
            '  font-size: 0.55rem;',
            '}',
            '.events-stork-couple__name {',
            '  font-family: var(--f-display);',
            '  font-size: 0.75rem;',
            '  font-weight: 600;',
            '  color: var(--text);',
            '}',
            '.events-stork-couple__age {',
            '  font-size: 0.55rem;',
            '  color: var(--dim);',
            '}',
            '.events-stork-couple__location {',
            '  font-size: 0.55rem;',
            '  color: var(--dim);',
            '}',
            '.events-stork-couple__stats {',
            '  display: flex;',
            '  align-items: center;',
            '  gap: 0.375rem;',
            '  flex-wrap: wrap;',
            '}',
            '.events-stork-couple__fertility {',
            '  font-size: 0.6rem;',
            '  color: var(--accent);',
            '  font-weight: 500;',
            '}',
            '.events-stork-couple__count {',
            '  font-size: 0.6rem;',
            '  color: var(--dim);',
            '  font-family: var(--f-mono);',
            '}',
            '.events-stork-couple__pregnancies {',
            '  font-size: 0.55rem;',
            '  color: var(--dim);',
            '  font-style: italic;',
            '}',
            '.events-stork-couple__children {',
            '  min-width: 0;',
            '}',
            '.events-stork-couple__actions {',
            '  display: flex;',
            '  gap: 0.3125rem;',
            '  flex-shrink: 0;',
            '}',
            '.events-stork-couple__action {',
            '  display: inline-flex;',
            '  align-items: center;',
            '  gap: 0.1875rem;',
            '  padding: 0.3125rem 0.625rem;',
            '  background: var(--bg3);',
            '  border: 1px solid var(--border);',
            '  border-radius: var(--radius);',
            '  color: var(--text);',
            '  font-family: var(--f-body);',
            '  font-size: 0.6rem;',
            '  cursor: pointer;',
            '  white-space: nowrap;',
            '}',
            '.events-stork-couple__action:hover {',
            '  border-color: var(--accent);',
            '  color: var(--accent-light);',
            '}',
            '.events-stork-couple__action svg {',
            '  width: 0.85em;',
            '  height: 0.85em;',
            '  fill: currentColor;',
            '}',
            '.events-stork-couple__action--surprise {',
            '  border-color: var(--warn);',
            '  color: var(--warn);',
            '}',
            '.events-stork-couple__action--surprise:hover {',
            '  background: var(--warn-soft, var(--bg3));',
            '}',

            // Child circles
            '.events-stork-child-circles {',
            '  display: flex;',
            '  flex-wrap: wrap;',
            '  gap: 0.1875rem;',
            '}',
            '.events-stork-child-circles__circle {',
            '  display: inline-flex;',
            '  align-items: center;',
            '  justify-content: center;',
            '  width: 1.5rem;',
            '  height: 1.5rem;',
            '  padding: 0;',
            '  border-radius: 50%;',
            '  background: var(--accent-dim);',
            '  border: 2px solid var(--accent);',
            '  color: var(--accent-fg, var(--text));',
            '  font-size: 0.6rem;',
            '  cursor: pointer;',
            '}',
            '.events-stork-child-circles__circle svg {',
            '  width: 0.75em;',
            '  height: 0.75em;',
            '  fill: currentColor;',
            '}',
            '.events-stork-child-circles__circle--male {',
            '  border-color: var(--accent);',
            '}',
            '.events-stork-child-circles__circle--female {',
            '  border-color: var(--accent-light);',
            '}',
            '.events-stork-child-circles__circle--deceased {',
            '  background: var(--bg3);',
            '  border-color: var(--danger-lt);',
            '  color: var(--danger-lt);',
            '  opacity: 0.7;',
            '}',
            '.events-stork-child-circles__circle:hover {',
            '  filter: brightness(1.2);',
            '}',
            '.events-stork-child-circles__empty {',
            '  font-size: 0.55rem;',
            '  color: var(--dim);',
            '  font-style: italic;',
            '}'
        ].join('\n');
        document.head.appendChild(style);
    }

    // =========================================================================
    // 19. REGISTRATION
    // =========================================================================

    _ensureStyles();

    var TM = _tabManager();
    if (TM && typeof TM.register === 'function') {
        TM.register(SCOPE, TAB_ID, renderStorkTab);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn(
            'events-stork-tab.js: TabManager is not available at load ' +
            'time; the stork tab was not registered. Load tab-manager.js ' +
            'first.'
        );
    }

    // =========================================================================
    // 20. EXPORTS
    // =========================================================================

    window.EventsStorkTab = {
        id: TAB_ID,
        render: renderStorkTab,

        _helpers: {
            defaultFilters: _defaultFilters,
            panelId: _panelId,
            ageGroupForAge: _ageGroupForAge,
            detectEmptyState: _detectEmptyState
        }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.EventsStorkTab;
    }
})();
