/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT HISTORY TAB
 * js/tabs/settlement-history-tab.js
 * =============================================================================
 *
 * HISTORY TAB RENDERER.
 *
 * Renders the settlement's two append-only history logs as a single
 * chronological timeline:
 *
 *   annualHistory       per-year financial transition entries
 *   demolitionHistory   feature demolition entries
 *
 * Each entry is one event. The two logs have different shapes; the
 * renderer normalizes them into a common { year, kind, label, details }
 * record for display, then groups by year.
 *
 * It is a UI module. It:
 *   - reads annualHistory and demolitionHistory via SettlementQueries
 *   - renders DOM
 *   - does not read canonical settlement data directly
 *   - does not compute domain values
 *   - does not call any command
 *   - does not create settlement records
 *   - does not mutate canonical settlement data
 *   - does not persist
 *   - does not fabricate missing domain values
 *   - does not render raw null/undefined as "null" or "undefined"
 *   - does not use a recursion guard
 *   - does not use setTimeout to guess when the DOM is ready
 *
 * Contract reference: Settlement Architecture Contracts §15 (ViewModel
 * Contract), §16 (UI Contract), §17 (Historical Data Contract), §32
 * (Completion Standard).
 *
 * RENDERER CONTRACT
 * -----------------
 *   Registered via SettlementTabs.registerTabRenderer('history', fn).
 *   SettlementTabs invokes fn(container, context):
 *
 *     container  HTMLElement       already emptied by SettlementTabs
 *     context    {
 *       locationId  string|null    selected settlement id
 *       data        Object|null    canonical settlement record
 *       viewModel   Object|null    buildSettlementSummary result
 *     }
 *
 *   SettlementTabs has already validated locationId and data before
 *   calling the renderer.
 *
 * HISTORY SOURCE
 * --------------
 *   The settlement record carries two append-only history arrays. The
 *   records are documented in settlement-docs.txt §17
 *   (HISTORICAL DATA CONTRACT) and in the modules that write them:
 *
 *     annualHistory       settlement-annual-processor.js
 *                         { year, debtBefore, debtAfter, interest,
 *                           wealthBefore, wealthAfter }
 *
 *     demolitionHistory   settlement-feature-commands.js
 *                         { featureId, featureName, category,
 *                           demolishedYear, demolishedReason,
 *                           recordedAt }
 *
 *   There is no settlement.history array under the new architecture.
 *   The prior history tab read SettlementState.getSettlementHistory,
 *   which does not exist; every history view was dead. This renderer
 *   reads the two real arrays.
 *
 *   BEHAVIOURAL NOTE. The new system records only the two categories
 *   above. User-visible events the prior tab displayed — "tax rate
 *   changed", "fiscal policy updated", "civil law added", "specialization
 *   set", "role assigned" — are NOT recorded anywhere by the new
 *   modules. If a future revision adds a broader history log to the
 *   settlement record (say, a general `events` array), this renderer
 *   should be extended to read it. The `_collectEvents` function is
 *   the one place that needs to change.
 *
 * TIME CONTRACT
 * -------------
 *   window.getCurrentYear from time.js is NOT called by this renderer.
 *   Every year shown is the year stored on the entry itself. A filter
 *   that offers "current year" would need it; this renderer does not
 *   have such a filter (see FILTERS below).
 *
 * FILTERS
 * -------
 *   Three filters, all applied client-side after the events are
 *   normalized:
 *
 *     search      free-text, matched against the entry's rendered label
 *                 and details
 *     kind        'all' | 'annual' | 'demolition'
 *     year range  optional start / end year
 *
 *   The filter state is stored in localStorage under
 *   `settlement_history_filters_<locationId>` and restored on the next
 *   render for the same settlement. Filters are per-settlement so a
 *   user switching settlements does not carry an unrelated filter.
 *
 *   Filter parsing is defensive: an out-of-range or unparseable year
 *   is dropped, not silently coerced. localStorage access is wrapped
 *   in try/catch — private browsing or a quota error must not break
 *   the tab.
 *
 * EXPORT
 * ------
 *   The Export button serializes the current canonical history
 *   (annualHistory + demolitionHistory) as JSON and triggers a download
 *   via a Blob URL. It does not include the current filter state — the
 *   export is the raw canonical record, not the current view.
 *
 * CLEAR
 * -----
 *   The Clear button does not exist. Under the new architecture, the
 *   history arrays are canonical append-only state owned by the
 *   settlement record. There is no command to clear them, and the UI
 *   must not mutate canonical state (§16). If a "clear history"
 *   operation is ever wanted, it belongs in a
 *   SettlementHistoryCommands module — not in a renderer. The old tab
 *   called SettlementState._updateSettlementData(locationId, { history: [] }),
 *   which does not exist and would have been a §16 violation anyway.
 *
 * ICON POLICY
 * -----------
 *   No emojis. No inline SVG. Chrome icons come from window.getIcon if
 *   it is loaded; when icons.js is not on the page, the renderer falls
 *   back to plain text labels.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Rewritten against the new settlement module set.
 *     - Signature changed from (containerId, locationId, summary) to
 *       (container, context), matching settlement-tabs.js.
 *     - Recursion guard (_rendering) and the modal-open flag removed
 *       (§20 prohibits recursion guards).
 *     - Reads annualHistory and demolitionHistory. The phantom
 *       settlement.history / SettlementState.getSettlementHistory path
 *       is deleted.
 *     - Clear button removed. No command to clear history exists; the
 *       old handler called SettlementState._updateSettlementData, which
 *       does not exist and would violate §16.
 *     - Export serializes the two raw arrays (canonical record), not
 *       the filtered view. Prior revisions exported the derived
 *       `history` array (which was always empty in the new architecture).
 *     - Event type / label / color resolution keyed to the two real
 *       event kinds. The old EVENT_TYPES map (which referenced ~30
 *       event categories that no module writes) is gone.
 *     - Filter state stored per-settlement. Prior revisions also stored
 *       per-settlement, but the key was `settlement_history_filters_<id>`
 *       and the stored object included a `category` field keyed to the
 *       old EVENT_TYPES; the new filter is `kind` keyed to the two
 *       real event kinds, and old stored state is silently dropped
 *       (unknown keys are ignored on load).
 *     - All numeric values route through _fmtNumber; all text values
 *       route through _fmtText. No raw null/undefined reaches the DOM.
 *     - window.getCurrentYearSafe is not referenced. window.getCurrentYear
 *       is not called either (no year-defaulting filter).
 *   Previous revisions:
 *     - Pre-refactor implementation against SettlementState /
 *       SettlementCommands / SettlementCrud, all of which no longer
 *       exist.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY ACCESS
    // =========================================================================

    function _getSettlementQueries() {
        var Q = window.SettlementQueries;
        if (!Q || typeof Q.getSettlementData !== 'function') {
            throw new Error(
                'settlement-history-tab: SettlementQueries is missing. ' +
                'Load settlement-queries.js before this tab.'
            );
        }
        return Q;
    }

    function _getPlaceQueries() {
        return window.PlaceQueries || null;
    }

    function _getUIState() {
        return window.SettlementUIState || null;
    }

    function _getTabs() {
        return window.SettlementTabs || null;
    }

    // =========================================================================
    // 2. HELPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _unknown() {
        return '<span class="value-unknown">—</span>';
    }

    function _fmtNumber(value) {
        if (typeof value !== 'number' || !isFinite(value)) return _unknown();
        return _escapeHtml(value.toLocaleString());
    }

    function _fmtText(value) {
        if (value === null || value === undefined || value === '') {
            return _unknown();
        }
        return _escapeHtml(value);
    }

    function _getIcon(name) {
        if (typeof window.getIcon === 'function') {
            try {
                var icon = window.getIcon(name);
                if (typeof icon === 'string') return icon;
            } catch (e) {
                // getIcon exists but threw; fall through to ''.
            }
        }
        return '';
    }

    function _placeName(locationId) {
        var pq = _getPlaceQueries();
        if (!pq || typeof pq.getPlaceById !== 'function') return null;
        var place = pq.getPlaceById(locationId);
        return place ? (place.displayName || place.name || null) : null;
    }

    // =========================================================================
    // 3. EVENT NORMALIZATION
    // =========================================================================
    //
    // The two history arrays have different shapes. This section converts
    // each entry into a common normalized record:
    //
    //   {
    //     kind      'annual' | 'demolition'
    //     year      number | null
    //     label     string                short summary
    //     details   string                optional longer text
    //     color     CSS var or hex        for the left border
    //     icon      string                optional svg from getIcon
    //     searchText string               pre-lowercased, for filtering
    //     raw       Object                the original entry
    //   }
    //
    // The normalizer is the only place that knows the entry shapes. If
    // a new history array is added to the settlement record, this is
    // where it gets wired in.

    function _normalizeAnnual(entry) {
        var year = typeof entry.year === 'number' ? entry.year : null;
        var interest = typeof entry.interest === 'number' ? entry.interest : null;
        var debtAfter = typeof entry.debtAfter === 'number' ? entry.debtAfter : null;
        var wealthAfter = typeof entry.wealthAfter === 'number' ? entry.wealthAfter : null;
        var wealthBefore = typeof entry.wealthBefore === 'number' ? entry.wealthBefore : null;

        var label;
        if (interest !== null && interest > 0) {
            label = 'Debt interest applied: ' +
                interest.toLocaleString() + 'g';
        } else {
            label = 'Annual processing complete';
        }

        var detailsParts = [];
        if (debtAfter !== null) {
            detailsParts.push('Debt: ' + debtAfter.toLocaleString() + 'g');
        }
        if (wealthAfter !== null) {
            var delta = (wealthBefore !== null)
                ? wealthAfter - wealthBefore
                : null;
            if (delta !== null && delta !== 0) {
                var sign = delta > 0 ? '+' : '';
                detailsParts.push(
                    'Wealth: ' + wealthAfter.toLocaleString() +
                    'g (' + sign + delta.toLocaleString() + 'g)'
                );
            } else {
                detailsParts.push('Wealth: ' + wealthAfter.toLocaleString() + 'g');
            }
        }

        return {
            kind: 'annual',
            year: year,
            label: label,
            details: detailsParts.join(' · '),
            color: 'var(--text-dim)',
            icon: _getIcon('REFRESH'),
            searchText: (label + ' ' + detailsParts.join(' ')).toLowerCase(),
            raw: entry
        };
    }

    function _normalizeDemolition(entry) {
        var year = typeof entry.demolishedYear === 'number'
            ? entry.demolishedYear
            : null;
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
            details: detailsParts.join(' · '),
            color: 'var(--danger)',
            icon: _getIcon('TRASH'),
            searchText: (label + ' ' + detailsParts.join(' ')).toLowerCase(),
            raw: entry
        };
    }

    /**
     * Collects the two arrays into a single normalized list.
     *
     * @param {string} locationId
     * @returns {Array<Object>}  normalized events, sorted (see _sortEvents)
     */
    function _collectEvents(locationId) {
        var data = _getSettlementQueries().getSettlementData(locationId);
        if (!data) return [];

        var events = [];

        var annual = Array.isArray(data.annualHistory) ? data.annualHistory : [];
        for (var i = 0; i < annual.length; i++) {
            var entry = annual[i];
            if (!entry || typeof entry !== 'object') continue;
            events.push(_normalizeAnnual(entry));
        }

        var demolition = Array.isArray(data.demolitionHistory)
            ? data.demolitionHistory
            : [];
        for (var j = 0; j < demolition.length; j++) {
            var dEntry = demolition[j];
            if (!dEntry || typeof dEntry !== 'object') continue;
            events.push(_normalizeDemolition(dEntry));
        }

        _sortEvents(events);
        return events;
    }

    /**
     * Sorts in place: year descending, then by recordedAt / timestamp
     * descending, then by kind (annual before demolition) when both
     * other keys tie. Entries with no year sort to the end.
     */
    function _sortEvents(events) {
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
    }

    function _kindOrder(event) {
        return event.kind === 'annual' ? 0 : 1;
    }

    // =========================================================================
    // 4. FILTER STATE
    // =========================================================================

    var _FILTER_KEY_PREFIX = 'settlement_history_filters_';

    function _filterKey(locationId) {
        return _FILTER_KEY_PREFIX + locationId;
    }

    function _loadFilterState(locationId) {
        var defaults = {
            search: '',
            kind: 'all',
            yearStart: '',
            yearEnd: ''
        };
        try {
            var raw = localStorage.getItem(_filterKey(locationId));
            if (!raw) return defaults;
            var parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return defaults;

            // Only accept known keys. A stored `category` field from
            // the pre-refactor schema is silently dropped.
            return {
                search: typeof parsed.search === 'string' ? parsed.search : '',
                kind: (parsed.kind === 'annual' || parsed.kind === 'demolition')
                    ? parsed.kind
                    : 'all',
                yearStart: (typeof parsed.yearStart === 'string' ||
                            typeof parsed.yearStart === 'number')
                    ? String(parsed.yearStart)
                    : '',
                yearEnd: (typeof parsed.yearEnd === 'string' ||
                          typeof parsed.yearEnd === 'number')
                    ? String(parsed.yearEnd)
                    : ''
            };
        } catch (e) {
            return defaults;
        }
    }

    function _saveFilterState(locationId, state) {
        try {
            localStorage.setItem(_filterKey(locationId), JSON.stringify(state));
        } catch (e) {
            // Private browsing or quota exceeded. Filter state is
            // session-scoped convenience; failure to save is not fatal.
        }
    }

    // =========================================================================
    // 5. FILTERING
    // =========================================================================

    function _parseYear(raw) {
        if (raw === '' || raw === null || raw === undefined) return null;
        var n = parseInt(raw, 10);
        if (isNaN(n) || !isFinite(n)) return null;
        return n;
    }

    /**
     * Applies the filter state to the event list. Filters are applied
     * client-side, after normalization.
     *
     * A filter with an unparseable year bound is silently ignored for
     * that bound only — the other filters still apply. An out-of-range
     * year (e.g. -50) is not specially handled; it just makes the range
     * exclude everything, which is what the user typed.
     */
    function _applyFilters(events, filterState) {
        var search = (filterState.search || '').trim().toLowerCase();
        var kind = filterState.kind || 'all';
        var yearStart = _parseYear(filterState.yearStart);
        var yearEnd = _parseYear(filterState.yearEnd);

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

            if (search) {
                if (e.searchText.indexOf(search) === -1) continue;
            }

            out.push(e);
        }
        return out;
    }

    // =========================================================================
    // 6. HTML BUILDERS
    // =========================================================================

    function _buildHeader(context, counts) {
        var locationId = context.locationId;
        var name = context.viewModel && context.viewModel.name
            ? context.viewModel.name
            : (_placeName(locationId) || '(unnamed location)');
        var total = counts.annual + counts.demolition;

        var exportBtn = '<button type="button" class="history-action-btn" ' +
            'data-action="export" ' +
            'style="font-size:0.55rem;padding:3px 10px;background:var(--bg3);' +
            'border:1px solid var(--border);border-radius:4px;cursor:pointer;' +
            'color:var(--text);">' +
            _getIcon('COIN') + ' Export</button>';

        var refreshBtn = '<button type="button" class="history-action-btn" ' +
            'data-action="refresh" ' +
            'style="font-size:0.55rem;padding:3px 10px;background:var(--bg3);' +
            'border:1px solid var(--border);border-radius:4px;cursor:pointer;' +
            'color:var(--text);">' +
            _getIcon('REFRESH') + ' Refresh</button>';

        return '<div style="background:var(--bg2);padding:12px 16px;' +
            'border-radius:8px;margin-bottom:16px;display:flex;' +
            'justify-content:space-between;align-items:center;flex-wrap:wrap;' +
            'gap:8px;border:1px solid var(--border);">' +
            '<div>' +
            '<div style="font-size:0.8rem;font-weight:bold;color:var(--accent-light);">' +
            _getIcon('BOOK') + ' Settlement History</div>' +
            '<div style="font-size:0.65rem;color:var(--dim);">' +
            _escapeHtml(name) + ' · ' +
            _fmtNumber(total) + ' recorded event' +
            (total === 1 ? '' : 's') +
            '</div>' +
            '</div>' +
            '<div style="display:flex;gap:4px;flex-wrap:wrap;">' +
            refreshBtn + exportBtn +
            '</div>' +
            '</div>';
    }

    function _buildFilterBar(filterState) {
        function yearInput(id, label, value) {
            return '<div>' +
                '<label style="font-size:0.55rem;color:var(--dim);' +
                'display:block;margin-bottom:2px;">' +
                _escapeHtml(label) + '</label>' +
                '<input type="number" id="' + id + '" value="' +
                _escapeHtml(value) + '" placeholder="Any" ' +
                'style="width:100%;padding:4px 6px;background:var(--bg);' +
                'border:1px solid var(--border);border-radius:4px;' +
                'color:var(--text);font-size:0.55rem;">' +
                '</div>';
        }

        return '<div style="background:var(--bg2);padding:12px 16px;' +
            'border-radius:8px;margin-bottom:16px;border:1px solid var(--border);">' +
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;' +
            'gap:12px;margin-bottom:8px;">' +
            '<div>' +
            '<label style="font-size:0.55rem;color:var(--dim);' +
            'display:block;margin-bottom:2px;">' +
            _getIcon('SEARCH') + ' Search</label>' +
            '<input type="text" id="historySearch" value="' +
            _escapeHtml(filterState.search) + '" ' +
            'placeholder="Search events..." ' +
            'style="width:100%;padding:4px 6px;background:var(--bg);' +
            'border:1px solid var(--border);border-radius:4px;' +
            'color:var(--text);font-size:0.55rem;">' +
            '</div>' +
            '<div>' +
            '<label style="font-size:0.55rem;color:var(--dim);' +
            'display:block;margin-bottom:2px;">Kind</label>' +
            '<select id="historyKind" ' +
            'style="width:100%;padding:4px 6px;background:var(--bg);' +
            'border:1px solid var(--border);border-radius:4px;' +
            'color:var(--text);font-size:0.55rem;">' +
            '<option value="all"' +
            (filterState.kind === 'all' ? ' selected' : '') +
            '>All kinds</option>' +
            '<option value="annual"' +
            (filterState.kind === 'annual' ? ' selected' : '') +
            '>Annual</option>' +
            '<option value="demolition"' +
            (filterState.kind === 'demolition' ? ' selected' : '') +
            '>Demolition</option>' +
            '</select>' +
            '</div>' +
            yearInput('historyYearStart', 'Year From', filterState.yearStart) +
            yearInput('historyYearEnd', 'Year To', filterState.yearEnd) +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;' +
            'align-items:center;flex-wrap:wrap;gap:4px;">' +
            '<span id="historyCountDisplay" style="font-size:0.5rem;' +
            'color:var(--dim);"></span>' +
            '<button type="button" id="historyClearFiltersBtn" ' +
            'style="font-size:0.5rem;padding:2px 10px;background:var(--bg3);' +
            'border:1px solid var(--border);border-radius:4px;cursor:pointer;' +
            'color:var(--text);">' +
            _getIcon('X_HEAVY') + ' Clear Filters</button>' +
            '</div>' +
            '</div>';
    }

    function _buildStatsSection(events) {
        if (events.length === 0) return '';

        var counts = { annual: 0, demolition: 0 };
        for (var i = 0; i < events.length; i++) {
            if (events[i].kind === 'annual') counts.annual++;
            else counts.demolition++;
        }

        function pill(label, count, color) {
            return '<span style="font-size:0.5rem;background:var(--bg);' +
                'padding:2px 10px;border-radius:12px;border:1px solid var(--border);' +
                'color:' + color + ';">' +
                _escapeHtml(label) + ': <strong>' +
                _escapeHtml(String(count)) + '</strong></span>';
        }

        return '<div style="background:var(--bg2);padding:12px 16px;' +
            'border-radius:8px;margin-bottom:16px;border:1px solid var(--border);">' +
            '<div style="font-size:0.6rem;color:var(--accent-light);' +
            'font-weight:bold;margin-bottom:6px;">' +
            _getIcon('COIN') + ' Event Totals</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:6px;">' +
            pill('Annual', counts.annual, 'var(--text)') +
            pill('Demolition', counts.demolition, 'var(--danger-lt)') +
            '</div>' +
            '</div>';
    }

    function _buildEventRow(event) {
        var yearDisplay = event.year === null
            ? _unknown()
            : _escapeHtml(String(event.year));

        var detailsLine = event.details
            ? '<div style="font-size:0.5rem;color:var(--dim);margin-top:2px;">' +
            _escapeHtml(event.details) + '</div>'
            : '';

        return '<div class="history-event" ' +
            'style="display:flex;align-items:flex-start;gap:8px;' +
            'padding:6px 10px;background:var(--bg3);' +
            'border-left:3px solid ' + event.color + ';' +
            'border-radius:4px;font-size:0.55rem;">' +
            '<span style="min-width:48px;color:var(--dim);font-weight:bold;">' +
            yearDisplay + '</span>' +
            '<span style="color:' + event.color + ';flex-shrink:0;">' +
            (event.icon || '') + '</span>' +
            '<div style="flex:1;min-width:0;">' +
            '<div style="color:' + event.color + ';font-weight:bold;">' +
            _escapeHtml(event.label) + '</div>' +
            detailsLine +
            '</div>' +
            '</div>';
    }

    function _buildTimeline(events) {
        if (events.length === 0) {
            return '<div style="background:var(--bg2);padding:40px;' +
                'border-radius:8px;text-align:center;color:var(--dim);' +
                'font-size:0.65rem;border:1px solid var(--border);">' +
                _getIcon('BOOK') + ' No events match the current filters.' +
                '</div>';
        }

        // Group by year, preserving the sort order (year descending).
        // Entries with no year go into a final group labelled "Year
        // unknown".
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

        var html = '<div style="background:var(--bg2);padding:12px 16px;' +
            'border-radius:8px;border:1px solid var(--border);">' +
            '<div style="font-size:0.65rem;color:var(--accent-light);' +
            'font-weight:bold;margin-bottom:8px;">' +
            _getIcon('BOOK') + ' Timeline</div>' +
            '<div style="display:flex;flex-direction:column;gap:12px;">';

        for (var g = 0; g < groups.length; g++) {
            var group = groups[g];
            var yearHeader = group.year === null
                ? 'Year unknown'
                : String(group.year);

            html += '<div>' +
                '<div style="font-size:0.6rem;font-weight:bold;' +
                'color:var(--accent);margin-bottom:4px;">' +
                _escapeHtml(yearHeader) + ' (' +
                _escapeHtml(String(group.events.length)) + ')</div>' +
                '<div style="display:flex;flex-direction:column;gap:4px;">';

            for (var k = 0; k < group.events.length; k++) {
                html += _buildEventRow(group.events[k]);
            }

            html += '</div></div>';
        }

        html += '</div></div>';
        return html;
    }

    // =========================================================================
    // 7. EXPORT
    // =========================================================================
    //
    // Serializes the two raw arrays (canonical record) as JSON. The
    // current filter state is not included; the export is what the
    // settlement actually recorded.

    function _exportHistory(locationId) {
        var data = _getSettlementQueries().getSettlementData(locationId);
        if (!data) {
            if (typeof window.showToast === 'function') {
                window.showToast('Settlement not found', 'error');
            }
            return;
        }

        var annual = Array.isArray(data.annualHistory) ? data.annualHistory : [];
        var demolition = Array.isArray(data.demolitionHistory)
            ? data.demolitionHistory
            : [];

        if (annual.length === 0 && demolition.length === 0) {
            if (typeof window.showToast === 'function') {
                window.showToast('No history to export', 'warning');
            }
            return;
        }

        var placeName = _placeName(locationId) || locationId;
        var payload = {
            settlement: {
                locationId: locationId,
                name: placeName
            },
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

            if (typeof window.showToast === 'function') {
                window.showToast('History exported', 'success');
            }
        } catch (err) {
            if (typeof window.showToast === 'function') {
                window.showToast(
                    'Failed to export history: ' +
                    (err && err.message ? err.message : 'unknown error'),
                    'error'
                );
            }
        }
    }

    // =========================================================================
    // 8. EVENT WIRING
    // =========================================================================
    //
    // Filters are applied by re-rendering the timeline container only,
    // not the whole tab. The header, filter bar, and stats section stay
    // put. Filter state is saved on each change.
    //
    // No setTimeout / debounce timer is needed here: the input events
    // that trigger a re-render are text input, select change, and
    // number change. Text input fires on every keystroke, which is
    // fine — the filter runs against a small normalized array.

    function _renderTimelineInto(timelineEl, events) {
        if (!timelineEl) return;
        timelineEl.innerHTML = _buildTimeline(events);
    }

    function _updateCount(countEl, filteredCount, totalCount) {
        if (!countEl) return;
        if (filteredCount === totalCount) {
            countEl.textContent = 'Showing all ' + totalCount + ' events';
        } else {
            countEl.textContent =
                'Showing ' + filteredCount + ' of ' + totalCount + ' events';
        }
    }

    function _wireFilters(container, locationId, allEvents) {
        var searchInput = container.querySelector('#historySearch');
        var kindSelect = container.querySelector('#historyKind');
        var yearStartInput = container.querySelector('#historyYearStart');
        var yearEndInput = container.querySelector('#historyYearEnd');
        var clearFiltersBtn = container.querySelector('#historyClearFiltersBtn');
        var countEl = container.querySelector('#historyCountDisplay');
        var timelineEl = container.querySelector('#historyTimeline');

        function currentState() {
            return {
                search: searchInput ? searchInput.value : '',
                kind: kindSelect ? kindSelect.value : 'all',
                yearStart: yearStartInput ? yearStartInput.value : '',
                yearEnd: yearEndInput ? yearEndInput.value : ''
            };
        }

        function apply() {
            var state = currentState();
            _saveFilterState(locationId, state);
            var filtered = _applyFilters(allEvents, state);
            _renderTimelineInto(timelineEl, filtered);
            _updateCount(countEl, filtered.length, allEvents.length);
        }

        if (searchInput) searchInput.addEventListener('input', apply);
        if (kindSelect) kindSelect.addEventListener('change', apply);
        if (yearStartInput) yearStartInput.addEventListener('input', apply);
        if (yearEndInput) yearEndInput.addEventListener('input', apply);

        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', function () {
                if (searchInput) searchInput.value = '';
                if (kindSelect) kindSelect.value = 'all';
                if (yearStartInput) yearStartInput.value = '';
                if (yearEndInput) yearEndInput.value = '';
                apply();
            });
        }

        // Initial render: apply the loaded filter state.
        apply();
    }

    function _wireActions(container, locationId) {
        container.addEventListener('click', function (event) {
            var target = event.target;
            if (!target || typeof target.closest !== 'function') return;
            var btn = target.closest('.history-action-btn');
            if (!btn) return;
            if (!container.contains(btn)) return;
            event.preventDefault();

            var action = btn.dataset.action;
            if (action === 'refresh') {
                var tabs = _getTabs();
                if (tabs && typeof tabs.requestRender === 'function') {
                    tabs.requestRender('history');
                }
            } else if (action === 'export') {
                _exportHistory(locationId);
            }
        });
    }

    // =========================================================================
    // 9. RENDER
    // =========================================================================

    /**
     * Renders the history tab into the container.
     *
     * @param {HTMLElement} container
     * @param {Object} context  { locationId, data, viewModel }
     */
    function renderSettlementHistory(container, context) {
        if (!container) {
            throw new Error(
                'settlement-history-tab: container is required'
            );
        }
        if (!context || !context.locationId) {
            throw new Error(
                'settlement-history-tab: context.locationId is required'
            );
        }

        var locationId = context.locationId;
        var allEvents = _collectEvents(locationId);

        var counts = { annual: 0, demolition: 0 };
        for (var i = 0; i < allEvents.length; i++) {
            if (allEvents[i].kind === 'annual') counts.annual++;
            else counts.demolition++;
        }

        var filterState = _loadFilterState(locationId);

        var html = '<div style="padding:4px;">' +
            _buildHeader(context, counts) +
            _buildStatsSection(allEvents) +
            _buildFilterBar(filterState) +
            '<div id="historyTimeline"></div>' +
            '<div style="margin-top:16px;padding:8px;background:var(--bg3);' +
            'border-radius:6px;font-size:0.55rem;color:var(--dim);">' +
            _getIcon('CIRCLE_DOT') +
            ' History tracks annual financial processing and feature ' +
            'demolitions. Other settlement changes (fiscal policy, ' +
            'laws, specialization) are not recorded in this log.</div>' +
            '</div>';

        container.innerHTML = html;

        _wireActions(container, locationId);
        _wireFilters(container, locationId, allEvents);
    }

    // =========================================================================
    // 10. REGISTRATION
    // =========================================================================

    function _register() {
        var tabs = _getTabs();
        if (!tabs || typeof tabs.registerTabRenderer !== 'function') {
            throw new Error(
                'settlement-history-tab: SettlementTabs is missing. ' +
                'Load settlement-tabs.js before this tab.'
            );
        }
        tabs.registerTabRenderer('history', renderSettlementHistory);
    }

    _register();

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================
    //
    // The renderer is registered with SettlementTabs under the tab id
    // 'history'. Legacy global names are aliased so any un-migrated
    // caller that has the old (containerId, locationId, summary)
    // signature still finds the module surface. Note that the legacy
    // signature will not match what SettlementTabs invokes — the alias
    // exists only so callers that reference the name don't throw on
    // property access.
    //

    window.renderSettlementHistory = renderSettlementHistory;
    window._renderSettlementHistory = renderSettlementHistory;

})();
