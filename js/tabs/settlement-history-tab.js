/**
 * =============================================================================
 * SETTLEMENT HISTORY TAB
 * js/tabs/settlement-history-tab.js
 * =============================================================================
 *
 * Renders the settlement's two append-only history logs as a single
 * chronological timeline:
 *
 *   annualHistory       per-year financial transition entries
 *   demolitionHistory   feature demolition entries
 *
 * Each entry is one event. The two logs have different shapes; the
 * renderer normalizes them into a common { year, kind, label, details }
 * record, then groups by year.
 *
 * RENDERER CONTRACT:
 *   fn(container, context) with context = { locationId, data, viewModel }
 *
 * DATA SOURCES:
 *   - SettlementQueries.getSettlementData(locationId)
 *     reads settlement.annualHistory / settlement.demolitionHistory
 *
 * FILTERS:
 *   - search (free-text, matched against the rendered label + details)
 *   - kind   ('all' | 'annual' | 'demolition')
 *   - year range (optional start / end)
 *
 *   Filter state is persisted per-settlement to localStorage under
 *   `settlement_history_filters_<locationId>`. Restored on next render.
 *
 * EXPORT:
 *   Serializes annualHistory + demolitionHistory as JSON and triggers a
 *   download. The export is the raw canonical record, not the current
 *   filter view.
 *
 * NO CLEAR BUTTON: history arrays are canonical append-only state. No
 * command exists to clear them, and the UI must not mutate canonical
 * state (§16).
 *
 * TIME CONTRACT: every year shown is the year stored on the entry. The
 * tab does not call getCurrentYear.
 *
 * NO CSS. Class-only rendering.
 * =============================================================================
 */

(function () {
    'use strict';

    var TAB_ID = 'history';
    var SCOPE  = 'settlement';
    var FILTER_KEY_PREFIX = 'settlement_history_filters_';

    function H() { return window.SettlementTabHelpers; }
    function esc(v)       { return H().esc(v); }
    function icon(n)      { return H().icon(n); }
    function fmtNum(v)    { return H().fmtNumber(v); }
    function unknown()    { return H().unknown(); }
    function refresh()    { H().requestRefresh(SCOPE, TAB_ID); }

    function _getSettlementQueries() { return window.SettlementQueries; }

    function _placeName(locationId) {
        var pq = window.PlaceQueries;
        if (!pq || typeof pq.getPlaceById !== 'function') return null;
        var place = pq.getPlaceById(locationId);
        return place ? (place.displayName || place.name || null) : null;
    }

    // -------------------------------------------------------------------
    // Event normalization
    // -------------------------------------------------------------------

    function _normalizeAnnual(entry) {
        var year = typeof entry.year === 'number' ? entry.year : null;
        var interest = typeof entry.interest === 'number' ? entry.interest : null;
        var debtAfter = typeof entry.debtAfter === 'number' ? entry.debtAfter : null;
        var wealthAfter = typeof entry.wealthAfter === 'number'
            ? entry.wealthAfter : null;
        var wealthBefore = typeof entry.wealthBefore === 'number'
            ? entry.wealthBefore : null;

        var label;
        if (interest !== null && interest > 0) {
            label = 'Debt interest applied: ' + interest.toLocaleString() + 'g';
        } else {
            label = 'Annual processing complete';
        }

        var detailsParts = [];
        if (debtAfter !== null) {
            detailsParts.push('Debt: ' + debtAfter.toLocaleString() + 'g');
        }
        if (wealthAfter !== null) {
            var delta = wealthBefore !== null ? wealthAfter - wealthBefore : null;
            if (delta !== null && delta !== 0) {
                var sign = delta > 0 ? '+' : '';
                detailsParts.push('Wealth: ' + wealthAfter.toLocaleString() +
                    'g (' + sign + delta.toLocaleString() + 'g)');
            } else {
                detailsParts.push('Wealth: ' + wealthAfter.toLocaleString() + 'g');
            }
        }

        return {
            kind: 'annual',
            year: year,
            label: label,
            details: detailsParts.join(' \u00b7 '),
            searchText: (label + ' ' + detailsParts.join(' ')).toLowerCase(),
            raw: entry
        };
    }

    function _normalizeDemolition(entry) {
        var year = typeof entry.demolishedYear === 'number'
            ? entry.demolishedYear : null;
        var featureName = entry.featureName || entry.featureId || 'Feature';
        var reason = entry.demolishedReason || 'Demolished';
        var category = entry.category || '';

        var label = 'Demolished "' + featureName + '"';
        var detailsParts = [reason];
        if (category) detailsParts.push(category);

        return {
            kind: 'demolition',
            year: year,
            label: label,
            details: detailsParts.join(' \u00b7 '),
            searchText: (label + ' ' + detailsParts.join(' ')).toLowerCase(),
            raw: entry
        };
    }

    function _collectEvents(locationId) {
        var Q = _getSettlementQueries();
        if (!Q) return [];
        var data = Q.getSettlementData(locationId);
        if (!data) return [];

        var events = [];

        var annual = Array.isArray(data.annualHistory) ? data.annualHistory : [];
        for (var i = 0; i < annual.length; i++) {
            var a = annual[i];
            if (!a || typeof a !== 'object') continue;
            events.push(_normalizeAnnual(a));
        }

        var demolition = Array.isArray(data.demolitionHistory)
            ? data.demolitionHistory : [];
        for (var j = 0; j < demolition.length; j++) {
            var d = demolition[j];
            if (!d || typeof d !== 'object') continue;
            events.push(_normalizeDemolition(d));
        }

        events.sort(function (a, b) {
            if (a.year === null && b.year === null) {
                return _kindOrder(a) - _kindOrder(b);
            }
            if (a.year === null) return 1;
            if (b.year === null) return -1;
            if (a.year !== b.year) return b.year - a.year;
            var at = a.raw.recordedAt || a.raw.timestamp || 0;
            var bt = b.raw.recordedAt || b.raw.timestamp || 0;
            if (at !== bt) return bt - at;
            return _kindOrder(a) - _kindOrder(b);
        });

        return events;
    }

    function _kindOrder(e) {
        return e.kind === 'annual' ? 0 : 1;
    }

    // -------------------------------------------------------------------
    // Filter state
    // -------------------------------------------------------------------

    function _filterKey(locationId) {
        return FILTER_KEY_PREFIX + locationId;
    }

    function _loadFilterState(locationId) {
        var defaults = { search: '', kind: 'all', yearStart: '', yearEnd: '' };
        if (!locationId) return defaults;
        try {
            var raw = localStorage.getItem(_filterKey(locationId));
            if (!raw) return defaults;
            var p = JSON.parse(raw);
            if (!p || typeof p !== 'object') return defaults;
            return {
                search: typeof p.search === 'string' ? p.search : '',
                kind: (p.kind === 'annual' || p.kind === 'demolition')
                    ? p.kind : 'all',
                yearStart: (typeof p.yearStart === 'string'
                            || typeof p.yearStart === 'number')
                    ? String(p.yearStart) : '',
                yearEnd: (typeof p.yearEnd === 'string'
                          || typeof p.yearEnd === 'number')
                    ? String(p.yearEnd) : ''
            };
        } catch (e) {
            return defaults;
        }
    }

    function _writeFilterState(locationId, state) {
        if (!locationId) return;
        try {
            localStorage.setItem(_filterKey(locationId), JSON.stringify(state));
        } catch (e) { /* non-fatal */ }
    }

    function _parseYear(raw) {
        if (raw === '' || raw === null || raw === undefined) return null;
        var n = parseInt(raw, 10);
        if (isNaN(n) || !isFinite(n)) return null;
        return n;
    }

    function _applyFilters(events, state) {
        var search = (state.search || '').trim().toLowerCase();
        var kind = state.kind || 'all';
        var yearStart = _parseYear(state.yearStart);
        var yearEnd = _parseYear(state.yearEnd);

        var out = [];
        for (var i = 0; i < events.length; i++) {
            var e = events[i];
            if (kind !== 'all' && e.kind !== kind) continue;
            if (yearStart !== null) {
                if (e.year === null || e.year < yearStart) continue;
            }
            if (yearEnd !== null) {
                if (e.year === null || e.year > yearEnd) continue;
            }
            if (search && e.searchText.indexOf(search) === -1) continue;
            out.push(e);
        }
        return out;
    }

    // -------------------------------------------------------------------
    // Sections
    // -------------------------------------------------------------------

    function _buildHeader(context, counts) {
        var name = context.viewModel && context.viewModel.name
            ? context.viewModel.name
            : (_placeName(context.locationId) || '(unnamed location)');
        var total = counts.annual + counts.demolition;

        var exportBtn = '<button type="button" class="st-btn" ' +
            'data-action="export">' +
            icon('COIN') + ' Export</button>';
        var refreshBtn = '<button type="button" class="st-btn" ' +
            'data-action="refresh">' +
            icon('REFRESH') + ' Refresh</button>';

        return '<div class="st-header">' +
            '<div>' +
            '<div class="st-header__title">' +
            icon('BOOK') + ' Settlement History</div>' +
            '<div class="st-header__subtitle">' +
            esc(name) + ' \u00b7 ' + fmtNum(total) +
            ' recorded event' + (total === 1 ? '' : 's') +
            '</div>' +
            '</div>' +
            '<div class="st-header__actions">' +
            refreshBtn + exportBtn +
            '</div>' +
            '</div>';
    }

    function _buildFilterBar(state) {
        function yearField(id, label, value) {
            return '<div class="st-filters__field">' +
                '<label class="st-filters__label">' + esc(label) + '</label>' +
                '<input type="number" class="st-filters__input" ' +
                'data-filter="' + esc(id) + '" ' +
                'value="' + esc(value) + '" placeholder="Any">' +
                '</div>';
        }

        function kindOption(value, label) {
            return '<option value="' + esc(value) + '"' +
                (state.kind === value ? ' selected' : '') + '>' +
                esc(label) + '</option>';
        }

        return '<div class="st-filters">' +
            '<div class="st-filters__field">' +
            '<label class="st-filters__label">' +
            icon('SEARCH') + ' Search</label>' +
            '<input type="text" class="st-filters__input" ' +
            'data-filter="search" ' +
            'value="' + esc(state.search) + '" ' +
            'placeholder="Search events...">' +
            '</div>' +
            '<div class="st-filters__field">' +
            '<label class="st-filters__label">Kind</label>' +
            '<select class="st-filters__select" data-filter="kind">' +
            kindOption('all', 'All kinds') +
            kindOption('annual', 'Annual') +
            kindOption('demolition', 'Demolition') +
            '</select>' +
            '</div>' +
            yearField('yearStart', 'Year From', state.yearStart) +
            yearField('yearEnd', 'Year To', state.yearEnd) +
            '<div class="st-filters__footer">' +
            '<button type="button" class="st-btn st-btn--small" ' +
            'data-action="clear-filters">Clear Filters</button>' +
            '</div>' +
            '</div>';
    }

    function _buildEventRow(event) {
        var yearDisplay = event.year === null
            ? unknown() : esc(String(event.year));
        var cls = event.kind === 'demolition'
            ? 'st-row st-row--danger'
            : 'st-row st-row--dim';

        var detailsLine = event.details
            ? '<div class="st-row__meta">' + esc(event.details) + '</div>'
            : '';

        return '<div class="' + cls + '">' +
            '<div class="st-row__meta">' + yearDisplay + '</div>' +
            '<div class="st-row__body">' +
            '<div class="st-row__title">' + esc(event.label) + '</div>' +
            detailsLine +
            '</div>' +
            '</div>';
    }

    function _buildTimeline(events) {
        if (events.length === 0) {
            return '<div class="st-empty">' +
                icon('BOOK') + ' No events match the current filters.</div>';
        }

        var groups = [];
        var currentYear = undefined;
        var currentGroup = null;
        for (var i = 0; i < events.length; i++) {
            var e = events[i];
            if (currentGroup === null || e.year !== currentYear) {
                currentYear = e.year;
                currentGroup = { year: e.year, events: [] };
                groups.push(currentGroup);
            }
            currentGroup.events.push(e);
        }

        var html = '<div class="st-rows">';
        for (var g = 0; g < groups.length; g++) {
            var group = groups[g];
            var yearHeader = group.year === null
                ? 'Year unknown' : String(group.year);
            html += '<div>' +
                '<div class="st-row__meta">' +
                esc(yearHeader) + ' (' + group.events.length + ')</div>';
            for (var k = 0; k < group.events.length; k++) {
                html += _buildEventRow(group.events[k]);
            }
            html += '</div>';
        }
        html += '</div>';
        return html;
    }

    function _buildStatsSection(events) {
        if (events.length === 0) return '';
        var counts = { annual: 0, demolition: 0 };
        for (var i = 0; i < events.length; i++) {
            if (events[i].kind === 'annual') counts.annual++;
            else counts.demolition++;
        }

        function pill(label, count, cls) {
            return '<span class="st-badge ' + cls + '">' +
                esc(label) + ': <strong>' + fmtNum(count) + '</strong></span>';
        }

        return '<div class="st-section">' +
            '<div class="st-section__title">' +
            icon('COIN') + ' Event Totals</div>' +
            '<div class="st-header__actions">' +
            pill('Annual', counts.annual, 'st-badge--dim') +
            pill('Demolition', counts.demolition, 'st-badge--neg') +
            '</div>' +
            '</div>';
    }

    function _buildFooter() {
        return '<div class="st-footer">' + icon('CIRCLE_DOT') +
            ' <span>History tracks annual financial processing and feature ' +
            'demolitions. Other settlement changes (fiscal policy, laws, ' +
            'specialization) are not recorded in this log.</span></div>';
    }

    // -------------------------------------------------------------------
    // Export
    // -------------------------------------------------------------------

    function _exportHistory(locationId) {
        var Q = _getSettlementQueries();
        if (!Q) {
            H().toast('Settlement not found.', 'error');
            return;
        }
        var data = Q.getSettlementData(locationId);
        if (!data) {
            H().toast('Settlement not found.', 'error');
            return;
        }

        var annual = Array.isArray(data.annualHistory) ? data.annualHistory : [];
        var demolition = Array.isArray(data.demolitionHistory)
            ? data.demolitionHistory : [];

        if (annual.length === 0 && demolition.length === 0) {
            H().toast('No history to export.', 'warning');
            return;
        }

        var placeName = _placeName(locationId) || locationId;
        var payload = {
            settlement: { locationId: locationId, name: placeName },
            exportedAt: new Date().toISOString(),
            annualHistory: annual,
            demolitionHistory: demolition
        };

        try {
            var json = JSON.stringify(payload, null, 2);
            var blob = new Blob([json], { type: 'application/json' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            var stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
            a.download = 'settlement_history_' +
                placeName.replace(/[^a-z0-9_-]/gi, '_') +
                '_' + stamp + '.json';
            a.click();
            URL.revokeObjectURL(url);
            H().toast('History exported.', 'success');
        } catch (err) {
            H().toast(
                'Failed to export history: ' +
                (err && err.message ? err.message : 'unknown error'),
                'error');
        }
    }

    // -------------------------------------------------------------------
    // Wiring
    // -------------------------------------------------------------------

    function _collectFilterState(container) {
        var search = container.querySelector('[data-filter="search"]');
        var kind = container.querySelector('[data-filter="kind"]');
        var yearStart = container.querySelector('[data-filter="yearStart"]');
        var yearEnd = container.querySelector('[data-filter="yearEnd"]');
        return {
            search: search ? search.value : '',
            kind: kind ? kind.value : 'all',
            yearStart: yearStart ? yearStart.value : '',
            yearEnd: yearEnd ? yearEnd.value : ''
        };
    }

    function _rerenderTimeline(container, locationId) {
        var allEvents = _collectEvents(locationId);
        var state = _collectFilterState(container);
        _writeFilterState(locationId, state);
        var filtered = _applyFilters(allEvents, state);
        var host = container.querySelector('[data-timeline-host]');
        if (host) host.innerHTML = _buildTimeline(filtered);
    }

    function _wireActions(container, locationId) {
        if (container.__stHistoryWired) return;
        container.__stHistoryWired = true;

        container.addEventListener('click', function (event) {
            var btn = event.target.closest('[data-action]');
            if (!btn || !container.contains(btn)) return;
            var action = btn.dataset.action;
            if (action === 'refresh') {
                event.preventDefault();
                refresh();
                return;
            }
            if (action === 'export') {
                event.preventDefault();
                _exportHistory(locationId);
                return;
            }
            if (action === 'clear-filters') {
                event.preventDefault();
                _writeFilterState(locationId, {
                    search: '', kind: 'all', yearStart: '', yearEnd: ''
                });
                refresh();
                return;
            }
        });

        // Debounced input: coalesce keystrokes via requestAnimationFrame.
        var searchEl = container.querySelector('[data-filter="search"]');
        if (searchEl) {
            var rafHandle = null;
            searchEl.addEventListener('input', function () {
                if (rafHandle !== null) return;
                rafHandle = requestAnimationFrame(function () {
                    rafHandle = null;
                    _rerenderTimeline(container, locationId);
                });
            });
        }
        var kindEl = container.querySelector('[data-filter="kind"]');
        if (kindEl) {
            kindEl.addEventListener('change', function () {
                _rerenderTimeline(container, locationId);
            });
        }
        var yearStartEl = container.querySelector('[data-filter="yearStart"]');
        if (yearStartEl) {
            yearStartEl.addEventListener('input', function () {
                _rerenderTimeline(container, locationId);
            });
        }
        var yearEndEl = container.querySelector('[data-filter="yearEnd"]');
        if (yearEndEl) {
            yearEndEl.addEventListener('input', function () {
                _rerenderTimeline(container, locationId);
            });
        }
    }

    // -------------------------------------------------------------------
    // Renderer
    // -------------------------------------------------------------------

    function renderSettlementHistory(container, context) {
        if (!container) return;
        if (!context || !context.locationId) {
            container.innerHTML = H().emptyState('no-context');
            return;
        }

        var locationId = context.locationId;
        var allEvents = _collectEvents(locationId);

        var counts = { annual: 0, demolition: 0 };
        for (var i = 0; i < allEvents.length; i++) {
            if (allEvents[i].kind === 'annual') counts.annual++;
            else counts.demolition++;
        }

        var filterState = _loadFilterState(locationId);
        var filtered = _applyFilters(allEvents, filterState);

        var html = '<div class="st-tab">' +
            _buildHeader(context, counts) +
            _buildStatsSection(allEvents) +
            _buildFilterBar(filterState) +
            '<div class="st-section">' +
            '<div class="st-section__title">' +
            icon('BOOK') + ' Timeline</div>' +
            '<div data-timeline-host>' +
            _buildTimeline(filtered) +
            '</div>' +
            '</div>' +
            _buildFooter() +
            '</div>';

        container.innerHTML = html;
        _wireActions(container, locationId);
    }

    // -------------------------------------------------------------------
    // Registration
    // -------------------------------------------------------------------

    if (window.TabManager && typeof window.TabManager.register === 'function') {
        window.TabManager.register(SCOPE, TAB_ID, renderSettlementHistory);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn(
            'settlement-history-tab: TabManager is not available at load ' +
            'time; the tab was not registered.'
        );
    }

    window.renderSettlementHistory = renderSettlementHistory;

})();
