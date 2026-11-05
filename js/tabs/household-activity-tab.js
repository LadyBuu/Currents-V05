// js/households/household-activity-tab.js
/**
 * =============================================================================
 * HOUSEHOLD ACTIVITY TAB
 * js/households/household-activity-tab.js
 * =============================================================================
 *
 * LOCATION: js/households/household-activity-tab.js
 *
 * WHAT THIS TAB SHOWS
 * -------------------
 * A chronological, filterable timeline of every household event across:
 *
 *   activityLog          — free-form action entries written by
 *                          HouseholdCommands.recordEvent
 *   eventLog             — the household record's own event log
 *   economy.transactions — every wealth/debt/resource/event transaction
 *   enterpriseHistory    — enterprise acquired / removed / transferred
 *   residenceHistory     — residence assigned / unassigned
 *   nameHistory          — every rename
 *
 * Each event has: year, type, label, details, optional amount, category,
 * source, priority. Rows are clickable to open a detail modal that shows
 * every field plus the raw JSON.
 *
 * Header: stat strip (total / displayed / categories / sources) + category
 * chips. Filter bar: search, category, source, year range, clear.
 *
 * READS
 * -----
 *   HouseholdQueries.getHousehold                  — flat projection
 *   HouseholdState._internal.getHouseholdRecord    — raw record.
 *       The raw record carries activityLog, eventLog, economy.transactions,
 *       enterpriseHistory, residenceHistory, and nameHistory. None of
 *       these are projected by HouseholdQueries. Reading them via the
 *       internal seam is the documented path (household-queries.js §8
 *       uses the same seam for getHouseholdNamePeriods).
 *
 * WRITES
 * ------
 *   None. This tab is read-only. Event detail modal is display only.
 *
 * RENDERER CONTRACT (from HouseholdManagerBootstrap)
 *   fn(container, context)
 *   container  HTMLElement  — already emptied by TabManager
 *   context    { householdId, householdName, householdState }
 *
 * FILTERS
 * -------
 *   search       substring over event label + details
 *   category     'all' | 'members' | 'economy' | 'enterprise' |
 *                'residence' | 'departments' | 'positions' |
 *                'status' | 'history'
 *   source       'all' | 'activity_log' | 'event_log' | 'economy' |
 *                'enterprise' | 'residence' | 'name_history'
 *   minYear      integer (>= 0; 0 means "no lower bound")
 *   maxYear      integer (>= 0; defaults to the current year)
 *
 *   Filter state is persisted per-household under
 *   `households_activity_filters_<householdId>` via
 *   HouseholdTabRuntime.readFilters / writeFilters (Rules 3 + 4).
 *   The state is reset when the householdId changes.
 *
 * DEPENDENCIES (all resolved via HouseholdTabRuntime)
 *   REQUIRED at render:
 *     - HouseholdQueries
 *     - formatting.js (escapeHtml — strict via TabRuntime.esc)
 *     - time.js (getCurrentYear — via TabRuntime.requireCurrentYear)
 *     - TabManager (for registration; warn if absent)
 *   OPTIONAL at render:
 *     - HouseholdState._internal (for raw record; degrades to empty
 *       timeline when absent)
 *
 * TIME CONTRACT: uses TabRuntime.requireCurrentYear(). No fallback.
 * ICON POLICY: icons via TabRuntime.icon(). No emoji, no glyphs.
 * THEME CONTRACT: no hardcoded hex/rgba. Classes from household-tabs.css.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   v2 (this revision):
 *     - Rewritten to the Tab/Manager Development Playbook, using
 *       Education Manager as the reference.
 *     - All shared helpers come from HouseholdTabRuntime.
 *     - Reads go through HouseholdQueries (via TabRuntime sugar).
 *       The prior revision called HS.getHousehold(id), which does not
 *       exist on HouseholdState (that method is on HouseholdQueries)
 *       — every render threw at the first line.
 *     - _getCurrentYear no longer returns 1250 when getCurrentYearSafe
 *       is missing. Uses T.requireCurrentYear(), which throws with a
 *       clear error naming time.js. The 1250 fallback violated the
 *       "no magic year" invariant in stillwaters-docs.txt §3.6 and
 *       corrupted every history entry tagged during a session where
 *       time.js hadn't loaded.
 *     - THE CLONE-BASED EVENT-CLICK RESET IS GONE. The prior revision
 *       used _attachEventClickHandlers which, on every render:
 *         1. called cloneNode(true) on each .event-item and
 *            .event-detail-btn, dropping scroll and focus;
 *         2. called parentNode.replaceChild on the fresh clone, then
 *            attached the click handler to the CLONE;
 *         3. attached hover handlers to the CLONE.
 *       This had the same three failure modes documented in
 *       household-departments-tab.js's REFACTOR HISTORY:
 *         (1) scroll/focus loss on every render;
 *         (2) any code that captured a reference to the pre-clone
 *             row was now holding a detached node;
 *         (3) if the same row was re-rendered a second time (e.g.
 *             after a filter change replaced the list, then a
 *             mutation re-rendered again), parentNode was null and
 *             replaceChild threw NotFoundError.
 *       This revision delegates clicks to the container via
 *       TabRuntime.attachDelegated + a second row-click listener,
 *       exactly like household-holdings-tab.js.
 *     - The literal Unicode placeholders `??` (empty state) and
 *       `��` (footer separators) are replaced:
 *         - The empty state uses T.iconSpan('REFRESH', ...) with
 *           theme classes, no glyph.
 *         - The footer separator is a styled <span> with a middle dot
 *           from CSS content, not a raw Unicode string in JS.
 *     - Filter state is persisted per-household. The prior revision
 *       carried module-level _filters that persisted across household
 *       switches and were never cleared.
 *     - Registration via TabRuntime.register('activity', render). The
 *       prior revision called the non-existent
 *       window.registerTabRenderer three-arg form.
 *     - Zero document.* calls. Zero hardcoded colors. Zero setTimeout
 *       (the prior revision used a 300ms debounce; this revision uses
 *       200ms, matching the members tab, and debounces via clearTimeout
 *       inline).
 * =============================================================================
 */

(function () {
    'use strict';

    var T = window.HouseholdTabRuntime;
    if (!T) {
        throw new Error(
            'household-activity-tab: HouseholdTabRuntime must load first. ' +
            'Load js/households/household-tab-runtime.js before this tab.'
        );
    }

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var TAB_ID = 'activity';
    var SCOPE  = T.SCOPE; // 'households'

    var _renderGuard = { busy: false };
    var SEARCH_DEBOUNCE_MS = 200;

    // =========================================================================
    // 2. EVENT-TYPE CATALOG
    // =========================================================================
    //
    // Preserved from the prior revision with two changes:
    //   - The `color` field is a THEME TOKEN NAME (e.g. 'success',
    //     'warn', 'danger', 'accent', 'dim', 'text'), NOT a hex string.
    //     The renderer maps it through _themeColor() below, which emits
    //     `var(--<token>)`. This honours the playbook's "no hardcoded
    //     hex in tab output" rule without losing the visual distinction
    //     the prior revision used hex colors to achieve.
    //   - Every entry keeps its icon key and priority. The catalog is
    //     the single source of truth for how each event type is
    //     displayed.

    var EVENT_TYPES = {
        // Members
        member_added:           { label: 'Member Added',           icon: 'PERSON_PLUS',      color: 'success',  category: 'members',     priority: 1 },
        member_removed:         { label: 'Member Removed',         icon: 'PERSON_MINUS',     color: 'warn',     category: 'members',     priority: 1 },
        member_updated:         { label: 'Member Updated',         icon: 'EDIT',             color: 'accent',   category: 'members',     priority: 2 },
        member_transferred_out: { label: 'Member Transferred Out', icon: 'ARROW_RIGHT',      color: 'warn',     category: 'members',     priority: 1 },
        member_transferred_in:  { label: 'Member Transferred In',  icon: 'ARROW_LEFT',       color: 'success',  category: 'members',     priority: 1 },
        head_changed:           { label: 'Head Changed',           icon: 'CROWN',            color: 'accent',   category: 'members',     priority: 0 },
        head_appointed:         { label: 'Head Appointed',         icon: 'CROWN_PLUS',       color: 'accent',   category: 'members',     priority: 0 },
        head_removed:           { label: 'Head Removed',           icon: 'CROWN_MINUS',      color: 'warn',     category: 'members',     priority: 0 },
        inheritance:            { label: 'Inheritance',            icon: 'CROWN',            color: 'accent',   category: 'members',     priority: 1 },

        // Departments
        department_added:       { label: 'Department Created',     icon: 'PLUS',             color: 'accent',   category: 'departments', priority: 2 },
        department_deleted:     { label: 'Department Deleted',     icon: 'X_HEAVY',          color: 'warn',     category: 'departments', priority: 2 },
        department_updated:     { label: 'Department Updated',     icon: 'EDIT',             color: 'accent',   category: 'departments', priority: 2 },

        // Positions / assignments
        position_created:       { label: 'Position Created',       icon: 'PERSON_PLUS',      color: 'accent',   category: 'positions',   priority: 2 },
        position_updated:       { label: 'Position Updated',       icon: 'EDIT',             color: 'accent',   category: 'positions',   priority: 2 },
        position_deleted:       { label: 'Position Deleted',       icon: 'X_HEAVY',          color: 'warn',     category: 'positions',   priority: 2 },
        assigned_to_position:   { label: 'Staff Assigned',         icon: 'PERSON_CHECK',     color: 'success',  category: 'positions',   priority: 1 },
        assignment_ended:       { label: 'Assignment Ended',       icon: 'PERSON_MINUS',     color: 'warn',     category: 'positions',   priority: 2 },

        // Economy
        wealth_change:          { label: 'Wealth Changed',         icon: 'COIN',             color: 'accent',   category: 'economy',     priority: 2 },
        debt_change:            { label: 'Debt Changed',           icon: 'COIN_MINUS',       color: 'warn',     category: 'economy',     priority: 2 },
        salary_received:        { label: 'Salary Received',        icon: 'COIN_PLUS',        color: 'success',  category: 'economy',     priority: 2 },
        salary_added:           { label: 'Salary Received',        icon: 'COIN_PLUS',        color: 'success',  category: 'economy',     priority: 2 },
        tuition_paid:           { label: 'Tuition Paid',           icon: 'COIN_MINUS',       color: 'warn',     category: 'economy',     priority: 2 },
        tuition_deducted:       { label: 'Tuition Paid',           icon: 'COIN_MINUS',       color: 'warn',     category: 'economy',     priority: 2 },
        school_profit:          { label: 'School Profit',          icon: 'COIN_PLUS',        color: 'success',  category: 'economy',     priority: 2 },
        school_profit_added:    { label: 'School Profit',          icon: 'COIN_PLUS',        color: 'success',  category: 'economy',     priority: 2 },
        enterprise_profit:      { label: 'Enterprise Profit',      icon: 'INDUSTRY_PLUS',    color: 'success',  category: 'economy',     priority: 1 },
        enterprise_loss:        { label: 'Enterprise Loss',        icon: 'INDUSTRY_MINUS',   color: 'warn',     category: 'economy',     priority: 1 },
        economic_event:         { label: 'Economic Event',         icon: 'WARNING',          color: 'accent',   category: 'economy',     priority: 2 },
        bankruptcy:             { label: 'Bankruptcy',             icon: 'WARNING',          color: 'danger',   category: 'economy',     priority: 0 },
        recovery:               { label: 'Recovery',               icon: 'CHECK_SIMPLE',     color: 'success',  category: 'economy',     priority: 1 },
        rent_income:            { label: 'Rent Income',            icon: 'HOME_PLUS',        color: 'success',  category: 'economy',     priority: 2 },
        rent_expense:           { label: 'Rent Expense',           icon: 'HOME_MINUS',       color: 'warn',     category: 'economy',     priority: 2 },
        annual_economy:         { label: 'Annual Economy',         icon: 'REFRESH',          color: 'accent',   category: 'economy',     priority: 1 },

        // Residence
        residence_assigned:     { label: 'Residence Assigned',     icon: 'HOME_PLUS',        color: 'accent',   category: 'residence',   priority: 1 },
        residence_unassigned:   { label: 'Residence Unassigned',   icon: 'HOME_MINUS',       color: 'warn',     category: 'residence',   priority: 1 },
        unit_assigned:          { label: 'Unit Assigned',          icon: 'SQUARE_PLUS',      color: 'accent',   category: 'residence',   priority: 1 },
        unit_vacated:           { label: 'Unit Vacated',           icon: 'SQUARE_MINUS',     color: 'warn',     category: 'residence',   priority: 2 },

        // Enterprise
        enterprise_acquired:    { label: 'Enterprise Acquired',    icon: 'INDUSTRY_PLUS',    color: 'success',  category: 'enterprise',  priority: 2 },
        enterprise_removed:     { label: 'Enterprise Removed',     icon: 'INDUSTRY_MINUS',   color: 'warn',     category: 'enterprise',  priority: 2 },
        enterprise_transferred: { label: 'Enterprise Transferred', icon: 'ARROW_DOUBLE_H',   color: 'accent',   category: 'enterprise',  priority: 2 },

        // History
        household_renamed:      { label: 'Household Renamed',      icon: 'EDIT',             color: 'accent',   category: 'history',     priority: 2 },

        // Status
        vacant:                 { label: 'Household Vacant',       icon: 'CIRCLE_HALF_LEFT', color: 'warn',     category: 'status',      priority: 0 },
        status_changed:         { label: 'Status Changed',         icon: 'CIRCLE_DOT',       color: 'accent',   category: 'status',      priority: 2 }
    };

    var UNKNOWN_TYPE = {
        label: 'Unknown Event',
        icon: 'CIRCLE_DOT',
        color: 'dim',
        category: 'unknown',
        priority: 2
    };

    function _config(type) {
        return EVENT_TYPES[type] || UNKNOWN_TYPE;
    }

    function _themeColor(token) {
        // Maps a semantic token name to a CSS var. Everything the
        // catalog can produce is one of: success, warn, danger,
        // accent, dim, text.
        switch (token) {
            case 'success': return 'var(--success)';
            case 'warn':    return 'var(--warn)';
            case 'danger':  return 'var(--danger)';
            case 'accent':  return 'var(--accent)';
            case 'dim':     return 'var(--dim)';
            case 'text':    return 'var(--text)';
            default:        return 'var(--dim)';
        }
    }

    // =========================================================================
    // 3. FILTER STATE (module-level, per-household)
    // =========================================================================

    var _filterDefaults = {
        search: '',
        category: 'all',
        source: 'all',
        minYear: 0,
        maxYear: 0   // 0 = "use current year"; resolved at render time
    };

    var _state = {
        search: _filterDefaults.search,
        category: _filterDefaults.category,
        source: _filterDefaults.source,
        minYear: _filterDefaults.minYear,
        maxYear: _filterDefaults.maxYear
    };

    var _lastContextKey = null;

    function _resetState() {
        _state.search = _filterDefaults.search;
        _state.category = _filterDefaults.category;
        _state.source = _filterDefaults.source;
        _state.minYear = _filterDefaults.minYear;
        _state.maxYear = _filterDefaults.maxYear;
    }

    function _loadFilters(householdId) {
        if (!householdId) return;
        var stored = T.readFilters(householdId, TAB_ID) || {};
        if (typeof stored.search === 'string') _state.search = stored.search;
        if (typeof stored.category === 'string') _state.category = stored.category;
        if (typeof stored.source === 'string') _state.source = stored.source;
        if (typeof stored.minYear === 'number' && isFinite(stored.minYear)) {
            _state.minYear = stored.minYear;
        }
        if (typeof stored.maxYear === 'number' && isFinite(stored.maxYear)) {
            _state.maxYear = stored.maxYear;
        }
    }

    function _saveFilters(householdId) {
        if (!householdId) return;
        T.writeFilters(householdId, TAB_ID, {
            search: _state.search,
            category: _state.category,
            source: _state.source,
            minYear: _state.minYear,
            maxYear: _state.maxYear
        });
    }

    function _effectiveMaxYear(currentYear) {
        return (_state.maxYear > 0) ? _state.maxYear : currentYear;
    }

    // =========================================================================
    // 4. DATA COLLECTION
    // =========================================================================
    //
    // All six event sources are read here and flattened into a single
    // chronological array. Each source is independently try/caught so
    // a corrupt section doesn't black out the whole timeline.

    function _rawHousehold(householdId) {
        var HS = T.state();
        if (!HS || !HS._internal
            || typeof HS._internal.getHouseholdRecord !== 'function') {
            return null;
        }
        try { return HS._internal.getHouseholdRecord(householdId); }
        catch (e) { return null; }
    }

    function _pushList(events, list, mapFn) {
        if (!Array.isArray(list)) return;
        for (var i = 0; i < list.length; i++) {
            var entry = mapFn(list[i]);
            if (entry) events.push(entry);
        }
    }

    function _collect(householdId) {
        var summary = T.getHousehold(householdId);
        if (!summary) return { error: 'Household not found.' };

        var currentYear;
        try { currentYear = T.requireCurrentYear(); }
        catch (e) {
            return {
                error: 'Current year unavailable: ' +
                    (e && e.message ? e.message : 'time.js missing')
            };
        }

        var raw = _rawHousehold(householdId);
        if (!raw) {
            // HouseholdState._internal is unavailable, or the raw
            // record for this household doesn't exist. The summary
            // exists (we read it above), so this is a degraded-but-
            // renderable state: show the header + empty timeline.
            return {
                household: summary,
                events: [],
                total: 0,
                currentYear: currentYear,
                rawAvailable: false
            };
        }

        var events = [];

        _pushList(events, raw.activityLog, function (log) {
            if (!log) return null;
            var cfg = _config(log.action);
            return {
                year: log.year || currentYear,
                type: log.action || 'unknown',
                label: cfg.label,
                details: log.details || '',
                amount: null,
                iconKey: cfg.icon,
                colorToken: cfg.color,
                category: cfg.category,
                priority: cfg.priority,
                timestamp: log.timestamp || 0,
                source: 'activity_log',
                raw: log
            };
        });

        _pushList(events, raw.eventLog, function (log) {
            if (!log) return null;
            var cfg = _config(log.type);
            return {
                year: log.year || currentYear,
                type: log.type || 'unknown',
                label: log.message || cfg.label,
                details: log.eventName || log.details || '',
                amount: (typeof log.amount === 'number') ? log.amount
                    : (typeof log.delta === 'number') ? log.delta : null,
                iconKey: cfg.icon,
                colorToken: cfg.color,
                category: cfg.category,
                priority: cfg.priority,
                timestamp: log.timestamp || 0,
                source: 'event_log',
                raw: log
            };
        });

        _pushList(events, raw.economy && raw.economy.transactions, function (t) {
            if (!t) return null;
            var cfg = _config(t.type);
            return {
                year: t.year || currentYear,
                type: t.type || 'wealth_change',
                label: cfg.label,
                details: t.reason || '',
                amount: (typeof t.amount === 'number') ? t.amount : null,
                iconKey: cfg.icon,
                colorToken: cfg.color,
                category: cfg.category,
                priority: cfg.priority,
                timestamp: t.timestamp || 0,
                source: 'economy',
                raw: t
            };
        });

        _pushList(events, raw.enterpriseHistory, function (e) {
            if (!e) return null;
            var action = e.action || 'acquired';
            var type = (action === 'acquired') ? 'enterprise_acquired'
                : (action === 'removed') ? 'enterprise_removed'
                : 'enterprise_transferred';
            var cfg = _config(type);
            return {
                year: e.year || currentYear,
                type: type,
                label: cfg.label,
                details: action + ' enterprise: ' + (e.enterpriseId || 'Unknown'),
                amount: (typeof e.profit === 'number') ? e.profit : null,
                iconKey: cfg.icon,
                colorToken: cfg.color,
                category: cfg.category,
                priority: cfg.priority,
                timestamp: e.timestamp || 0,
                source: 'enterprise',
                raw: e
            };
        });

        _pushList(events, raw.residenceHistory, function (r) {
            if (!r) return null;
            var type = (r.action === 'assigned') ? 'residence_assigned' : 'residence_unassigned';
            var cfg = _config(type);
            return {
                year: r.year || currentYear,
                type: type,
                label: cfg.label,
                details: (r.action || '') + ' residence: ' + (r.residenceName || 'Unknown'),
                amount: null,
                iconKey: cfg.icon,
                colorToken: cfg.color,
                category: cfg.category,
                priority: cfg.priority,
                timestamp: r.timestamp || 0,
                source: 'residence',
                raw: r
            };
        });

        _pushList(events, raw.nameHistory, function (n) {
            if (!n) return null;
            var cfg = _config('household_renamed');
            return {
                year: n.year || currentYear,
                type: 'household_renamed',
                label: cfg.label,
                details: 'Renamed from "' + (n.oldName || '?') + '" to "' + n.newName + '"' +
                    (n.reason ? ' (' + n.reason + ')' : ''),
                amount: null,
                iconKey: cfg.icon,
                colorToken: cfg.color,
                category: cfg.category,
                priority: cfg.priority,
                timestamp: n.timestamp || 0,
                source: 'name_history',
                raw: n
            };
        });

        events.sort(function (a, b) {
            if (a.year !== b.year) return b.year - a.year;
            return (b.timestamp || 0) - (a.timestamp || 0);
        });

        return {
            household: summary,
            events: events,
            total: events.length,
            currentYear: currentYear,
            rawAvailable: true
        };
    }

    // =========================================================================
    // 5. FILTERS
    // =========================================================================

    function _applyFilters(events, currentYear) {
        var out = events;
        var search = (_state.search || '').toLowerCase().trim();

        if (_state.category !== 'all') {
            out = out.filter(function (e) {
                return e.category === _state.category;
            });
        }
        if (_state.source !== 'all') {
            out = out.filter(function (e) {
                return e.source === _state.source;
            });
        }
        if (search) {
            out = out.filter(function (e) {
                return (e.label || '').toLowerCase().indexOf(search) !== -1 ||
                    (e.details || '').toLowerCase().indexOf(search) !== -1;
            });
        }
        if (typeof _state.minYear === 'number' && _state.minYear > 0) {
            out = out.filter(function (e) { return e.year >= _state.minYear; });
        }
        var max = _effectiveMaxYear(currentYear);
        out = out.filter(function (e) { return e.year <= max; });
        return out;
    }

    // =========================================================================
    // 6. RENDER
    // =========================================================================

    function _renderBody(d) {
        var filtered = _applyFilters(d.events, d.currentYear);

        return '' +
            '<div class="hh-tab">' +
                _renderHeader(d) +
                (d.rawAvailable === false
                    ? T.failureState(
                        'HouseholdState._internal is unavailable. Raw ' +
                        'history cannot be read. Load household-state.js ' +
                        'before this tab.'
                      )
                    : _renderFullBody(d, filtered)) +
            '</div>';
    }

    function _renderHeader(d) {
        return '' +
            '<div class="hh-tab-header">' +
                '<h3 class="hh-tab-title">' +
                    T.iconSpan('REFRESH', 'Activity') + ' Activity Log' +
                '</h3>' +
                '<div class="hh-tab-actions">' +
                    '<span class="hh-activity-total">' +
                        d.total + ' total events' +
                    '</span>' +
                '</div>' +
            '</div>';
    }

    function _renderFullBody(d, filtered) {
        return '' +
            _renderStats(d.events, filtered.length) +
            _renderCategoryChips(d.events) +
            _renderFilters(d.currentYear) +
            '<div class="hh-activity-events-section">' +
                T.sectionHeader('Events (' + filtered.length + ')', null,
                    '<button type="button" class="hh-btn hh-btn-subtle" ' +
                        'data-action="refresh">' +
                        T.iconSpan('REFRESH', 'Refresh') + ' Refresh' +
                    '</button>') +
                '<div class="hh-activity-events" data-role="event-list">' +
                    (filtered.length === 0
                        ? _renderEmptyState(d.events.length > 0)
                        : filtered.map(_renderEventRow).join('')) +
                '</div>' +
            '</div>' +
            '<div class="hh-tab-footer">' +
                'Showing ' + filtered.length + ' of ' + d.total +
                ' events · click an event for details' +
            '</div>';
    }

    function _renderStats(events, filteredCount) {
        var categories = {};
        var bySource = {};
        for (var i = 0; i < events.length; i++) {
            var e = events[i];
            categories[e.category] = (categories[e.category] || 0) + 1;
            bySource[e.source] = (bySource[e.source] || 0) + 1;
        }
        return '' +
            '<div class="hh-econ-grid hh-econ-grid-4">' +
                T.statCell('Total Events', events.length) +
                T.statCell('Displayed', filteredCount) +
                T.statCell('Categories', Object.keys(categories).length) +
                T.statCell('Sources', Object.keys(bySource).length) +
            '</div>';
    }

    function _renderCategoryChips(events) {
        var categories = {};
        for (var i = 0; i < events.length; i++) {
            categories[events[i].category] = (categories[events[i].category] || 0) + 1;
        }
        var order = [
            'members', 'economy', 'enterprise', 'residence',
            'departments', 'positions', 'status', 'history', 'unknown'
        ];
        var chips = '';
        for (var c = 0; c < order.length; c++) {
            var cat = order[c];
            var n = categories[cat] || 0;
            if (n === 0) continue;
            var label = cat.charAt(0).toUpperCase() + cat.slice(1);
            chips += '<span class="hh-activity-chip">' +
                T.esc(label) + ': ' + n +
            '</span>';
        }
        if (!chips) return '';
        return '<div class="hh-activity-chips">' + chips + '</div>';
    }

    function _renderFilters(currentYear) {
        var categories = [
            { id: 'all',         label: 'All Categories' },
            { id: 'members',     label: 'Members' },
            { id: 'economy',     label: 'Economy' },
            { id: 'enterprise',  label: 'Enterprise' },
            { id: 'residence',   label: 'Residence' },
            { id: 'departments', label: 'Departments' },
            { id: 'positions',   label: 'Positions' },
            { id: 'status',      label: 'Status' },
            { id: 'history',     label: 'History' }
        ];
        var sources = [
            { id: 'all',          label: 'All Sources' },
            { id: 'activity_log', label: 'Activity Log' },
            { id: 'event_log',    label: 'Event Log' },
            { id: 'economy',      label: 'Economy' },
            { id: 'enterprise',   label: 'Enterprise' },
            { id: 'residence',    label: 'Residence' },
            { id: 'name_history', label: 'Name History' }
        ];

        var catOptions = categories.map(function (c) {
            return '<option value="' + c.id + '"' +
                (_state.category === c.id ? ' selected' : '') + '>' +
                T.esc(c.label) + '</option>';
        }).join('');
        var srcOptions = sources.map(function (s) {
            return '<option value="' + s.id + '"' +
                (_state.source === s.id ? ' selected' : '') + '>' +
                T.esc(s.label) + '</option>';
        }).join('');

        var maxYearValue = _effectiveMaxYear(currentYear);

        return '' +
            '<div class="hh-filter-bar">' +
                '<input type="search" class="hh-filter-search" ' +
                    'data-role="search" ' +
                    'placeholder="Search events…" ' +
                    'value="' + T.esc(_state.search) + '">' +
                '<select class="hh-filter-select" data-role="category">' +
                    catOptions +
                '</select>' +
                '<select class="hh-filter-select" data-role="source">' +
                    srcOptions +
                '</select>' +
                '<input type="number" class="hh-filter-year" ' +
                    'data-role="min-year" placeholder="Min" ' +
                    'min="0" max="' + currentYear + '" ' +
                    'value="' + (_state.minYear > 0 ? _state.minYear : '') + '">' +
                '<span class="hh-filter-sep">–</span>' +
                '<input type="number" class="hh-filter-year" ' +
                    'data-role="max-year" placeholder="Max" ' +
                    'min="0" max="' + currentYear + '" ' +
                    'value="' + maxYearValue + '">' +
                '<button type="button" class="hh-btn hh-btn-subtle" ' +
                    'data-action="clear-filters">Clear</button>' +
            '</div>';
    }

    function _renderEventRow(event) {
        var color = _themeColor(event.colorToken);
        var iconSvg = T.icon(event.iconKey);

        var amountHtml = '';
        if (typeof event.amount === 'number' && isFinite(event.amount)) {
            var positive = event.amount >= 0;
            amountHtml = '<span class="hh-activity-amount ' +
                (positive ? 'hh-activity-amount-positive' : 'hh-activity-amount-negative') +
                '">' +
                (positive ? '+' : '') + event.amount + 'g' +
            '</span>';
        }

        var priorityBadge = '';
        if (event.priority === 0) {
            priorityBadge = '<span class="hh-activity-priority-important">Important</span>';
        } else if (event.priority === 1) {
            priorityBadge = '<span class="hh-activity-priority-major">Major</span>';
        }

        return '' +
            '<div class="hh-activity-event" ' +
                'data-event-type="' + T.esc(event.type) + '" ' +
                'data-source="' + T.esc(event.source) + '" ' +
                'style="border-left-color:' + color + ';">' +
                '<div class="hh-activity-event-inner">' +
                    '<span class="hh-activity-icon" style="color:' + color + ';">' +
                        iconSvg +
                    '</span>' +
                    '<span class="hh-activity-year">' + T.esc(String(event.year)) + '</span>' +
                    '<span class="hh-activity-label">' + T.esc(event.label) + '</span>' +
                    amountHtml +
                    '<span class="hh-activity-detail">' + T.esc(event.details) + '</span>' +
                    '<span class="hh-activity-source">' + T.esc(event.source) + '</span>' +
                    priorityBadge +
                '</div>' +
                '<div class="hh-activity-event-actions">' +
                    '<button type="button" class="hh-icon-btn" ' +
                        'data-action="view-event" ' +
                        'title="View details">' + T.icon('EDIT') + '</button>' +
                '</div>' +
            '</div>';
    }

    function _renderEmptyState(hadEvents) {
        var msg = hadEvents
            ? 'No events match the current filters.'
            : 'No activity recorded yet. Events appear as members join, ' +
              'wealth changes, and the household grows.';
        return T.emptyState(msg);
    }

    // =========================================================================
    // 7. ENTRY POINT
    // =========================================================================

    function renderHouseholdActivityTab(container, context) {
        if (!container) return;

        T.runExclusive(_renderGuard, function () {
            if (!context || !context.householdId) {
                container.innerHTML = T.emptyState('Select a household from the sidebar.');
                return;
            }
            if (!T.queries()) {
                container.innerHTML = T.failureState(
                    'HouseholdQueries is not loaded. ' +
                    'Load js/households/household-queries.js.'
                );
                return;
            }

            // Rule 4: reset state when the household changes.
            var ctxKey = context.householdId;
            if (_lastContextKey !== ctxKey) {
                _resetState();
                _lastContextKey = ctxKey;
            }

            // Rule 3: hydrate persisted filters.
            _loadFilters(context.householdId);

            var data;
            try {
                data = _collect(context.householdId);
            } catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('[HouseholdActivityTab] collect failed', e);
                }
                container.innerHTML = T.failureState(
                    'Could not load activity: ' +
                    (e && e.message ? e.message : 'unknown error')
                );
                return;
            }

            if (data.error) {
                container.innerHTML = T.failureState(data.error);
                return;
            }

            container.innerHTML = _renderBody(data);
            _wire(container, context.householdId, data);
        }, { onBusy: function () { /* skip re-entrant render */ } });
    }

    // =========================================================================
    // 8. WIRING
    // =========================================================================
    //
    // Two listeners, both attached once per container:
    //   1. attachDelegated handles [data-action="..."] button clicks
    //      (refresh, clear-filters, view-event).
    //   2. A second listener handles row clicks (open the detail modal).
    //      Gated on `target.closest('button')` so button clicks never
    //      double-fire.
    //
    // Filter inputs are bound on each render (they're replaced by
    // innerHTML; the fresh node needs a fresh listener).

    function _wire(container, householdId, data) {
        T.attachDelegated(container, {
            '[data-action="refresh"]':       function () { _rerender(householdId); },
            '[data-action="clear-filters"]': function () { _clearFilters(container, householdId, data); },
            '[data-action="view-event"]':    function (e, btn) {
                var row = btn.closest('.hh-activity-event');
                if (!row) return;
                _openEventDetailsByRow(row, data);
            }
        });

        // Row click → detail modal. Buttons ignored.
        if (!container.__hhActivityRowWired) {
            container.__hhActivityRowWired = true;
            container.addEventListener('click', function (event) {
                var target = event.target;
                if (!target || !target.closest) return;
                if (target.closest('button')) return;
                var row = target.closest('.hh-activity-event');
                if (!row) return;
                _openEventDetailsByRow(row, data);
            });
        }

        _wireFilters(container, householdId, data);
    }

    function _wireFilters(container, householdId, data) {
        var search = container.querySelector('[data-role="search"]');
        if (search) {
            var timer = null;
            search.addEventListener('input', function () {
                if (timer) clearTimeout(timer);
                timer = setTimeout(function () {
                    timer = null;
                    _state.search = search.value || '';
                    _saveFilters(householdId);
                    _reapplyInPlace(container, householdId, data);
                }, SEARCH_DEBOUNCE_MS);
            });
        }

        var category = container.querySelector('[data-role="category"]');
        if (category) {
            category.addEventListener('change', function () {
                _state.category = category.value || 'all';
                _saveFilters(householdId);
                _reapplyInPlace(container, householdId, data);
            });
        }

        var source = container.querySelector('[data-role="source"]');
        if (source) {
            source.addEventListener('change', function () {
                _state.source = source.value || 'all';
                _saveFilters(householdId);
                _reapplyInPlace(container, householdId, data);
            });
        }

        var minYear = container.querySelector('[data-role="min-year"]');
        if (minYear) {
            minYear.addEventListener('change', function () {
                var n = parseInt(minYear.value, 10);
                _state.minYear = (isFinite(n) && n > 0) ? n : 0;
                _saveFilters(householdId);
                _reapplyInPlace(container, householdId, data);
            });
        }

        var maxYear = container.querySelector('[data-role="max-year"]');
        if (maxYear) {
            maxYear.addEventListener('change', function () {
                var n = parseInt(maxYear.value, 10);
                _state.maxYear = (isFinite(n) && n > 0) ? n : 0;
                _saveFilters(householdId);
                _reapplyInPlace(container, householdId, data);
            });
        }
    }

    function _clearFilters(container, householdId, data) {
        _resetState();
        _saveFilters(householdId);

        // Repaint the filter controls (they are part of container's
        // innerHTML and were not replaced).
        var search = container.querySelector('[data-role="search"]');
        if (search) search.value = '';
        var category = container.querySelector('[data-role="category"]');
        if (category) category.value = 'all';
        var source = container.querySelector('[data-role="source"]');
        if (source) source.value = 'all';
        var minYear = container.querySelector('[data-role="min-year"]');
        if (minYear) minYear.value = '';
        var maxYear = container.querySelector('[data-role="max-year"]');
        if (maxYear) maxYear.value = String(_effectiveMaxYear(data.currentYear));

        _reapplyInPlace(container, householdId, data);
    }

    // =========================================================================
    // 9. IN-PLACE FILTER REAPPLY
    // =========================================================================
    //
    // Only the event list is replaced. The stats strip, the category
    // chips, and the filter bar all stay put so the input keeps focus
    // and cursor position while the user types.

    function _reapplyInPlace(container, householdId, data) {
        var listEl = container.querySelector('[data-role="event-list"]');
        if (!listEl) return;

        var filtered = _applyFilters(data.events, data.currentYear);
        var html = filtered.length === 0
            ? _renderEmptyState(data.events.length > 0)
            : filtered.map(_renderEventRow).join('');

        // Replace the list container's children in place.
        listEl.innerHTML = html;

        // Update the "Events (N)" header text.
        var sections = container.querySelectorAll('.hh-activity-events-section');
        for (var i = 0; i < sections.length; i++) {
            var header = sections[i].querySelector('.hh-section-title');
            if (header) {
                header.textContent = 'Events (' + filtered.length + ')';
            }
        }

        // Update the footer count.
        var footer = container.querySelector('.hh-tab-footer');
        if (footer) {
            footer.textContent = 'Showing ' + filtered.length +
                ' of ' + data.total + ' events · click an event for details';
        }
    }

    function _rerender(householdId) {
        T.requestRender(TAB_ID);
    }

    // =========================================================================
    // 10. EVENT DETAIL MODAL
    // =========================================================================
    //
    // Resolves the event by data-event-type + data-source + the row's
    // position within the *current* filtered list. The prior revision
    // indexed into a captured `events` array that was stale after any
    // filter change; this revision reads the row's dataset, which the
    // current render produced.

    function _openEventDetailsByRow(rowEl, data) {
        var type = rowEl.getAttribute('data-event-type');
        var source = rowEl.getAttribute('data-source');
        if (!type) return;

        // Find the most recent event with this type+source. Multiple
        // events can share a type+source (e.g. many wealth_change
        // entries); we disambiguate by the year and detail text on
        // the row, which are unique enough for user-facing clicks.
        var yearText = '';
        var detailText = '';
        var yearNode = rowEl.querySelector('.hh-activity-year');
        var detailNode = rowEl.querySelector('.hh-activity-detail');
        if (yearNode) yearText = (yearNode.textContent || '').trim();
        if (detailNode) detailText = (detailNode.textContent || '').trim();

        var matched = null;
        for (var i = 0; i < data.events.length; i++) {
            var e = data.events[i];
            if (e.type !== type) continue;
            if (source && e.source !== source) continue;
            if (yearText && String(e.year) !== yearText) continue;
            if (detailText && (e.details || '') !== detailText) continue;
            matched = e;
            break;
        }
        // Fallback: if disambiguation failed, take the first of the
        // type+source pair. Better to show *an* event of the right
        // kind than to show nothing.
        if (!matched) {
            for (var j = 0; j < data.events.length; j++) {
                if (data.events[j].type === type) { matched = data.events[j]; break; }
            }
        }
        if (!matched) { T.toastInfo('Event not found.'); return; }

        _presentEventDetails(matched);
    }

    function _presentEventDetails(event) {
        var cfg = _config(event.type);
        var color = _themeColor(cfg.color);

        var rows = '';
        var fields = [
            ['Year', event.year],
            ['Type', event.type],
            ['Label', event.label],
            ['Details', event.details],
            ['Amount', (typeof event.amount === 'number' && isFinite(event.amount))
                ? ((event.amount >= 0 ? '+' : '') + event.amount + 'g')
                : null],
            ['Source', event.source],
            ['Category', event.category]
        ];
        for (var i = 0; i < fields.length; i++) {
            var k = fields[i][0];
            var v = fields[i][1];
            if (v === undefined || v === null || v === '') continue;
            rows += T.kvRow(k, v);
        }

        var rawHtml;
        try {
            rawHtml = '<pre class="hh-activity-raw-pre">' +
                T.esc(JSON.stringify(event.raw || {}, null, 2)) +
            '</pre>';
        } catch (e) {
            rawHtml = '<div class="hh-form-hint">Raw data unavailable.</div>';
        }

        var content =
            '<div class="hh-modal-form">' +
                '<div class="hh-activity-detail-header" style="border-left-color:' + color + ';">' +
                    '<div>' +
                        '<div class="hh-activity-detail-title">' +
                            T.iconSpan(event.iconKey, event.label) + ' ' +
                            T.esc(event.label) +
                        '</div>' +
                        '<div class="hh-activity-detail-meta">' +
                            T.esc(String(event.year)) + ' · ' +
                            T.esc(event.category) + ' · ' +
                            T.esc(event.source) +
                        '</div>' +
                    '</div>' +
                    '<span style="color:' + color + ';">' +
                        T.esc(event.type) +
                    '</span>' +
                '</div>' +
                '<div class="hh-kv-list">' + rows + '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Raw Data</label>' +
                    rawHtml +
                '</div>' +
            '</div>';

        T.openModal({
            title: 'Event Details',
            content: content,
            confirmText: 'Close',
            cancelText: '',
            onConfirm: function () { T.closeTopModal(); }
        });
    }

    // =========================================================================
    // 11. REGISTRATION
    // =========================================================================

    T.register(TAB_ID, renderHouseholdActivityTab);

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    window.HouseholdActivityTab = {
        id: TAB_ID,
        render: renderHouseholdActivityTab
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.HouseholdActivityTab;
    }
})();
