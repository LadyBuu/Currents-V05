/**
 * =============================================================================
 * EVENTS DISASTERS TAB
 * js/tabs/events-disasters-tab.js
 * =============================================================================
 *
 * LOCATION: js/tabs/events-disasters-tab.js
 *
 * The Events Manager's Disasters tab. Renders the disaster list with
 * type/year filters, per-disaster expand for details, stats bar,
 * type distribution strip, and top-affected-locations strip. Provides
 * quick actions to create a disaster, trigger a mass-death event,
 * simulate a random disaster, and refresh.
 *
 * RENDERER CONTRACT (from EventsManagerBootstrap):
 *   fn(container, context)
 *   container  HTMLElement  -- already emptied by TabManager
 *   context    { locationId, locationName, eventsState }
 *
 * DATA SOURCES:
 *   EventsQueries.getDisasterRecords(locationId)
 *   EventsQueries.getRecentDeathEvents({ limit, year })  [not used]
 *   DisasterQueries.getDisasterStats / getDisasterSeverityStats
 *                   getLocationDisasterRisk / getGlobalDestructionStatistics
 *   DisasterConstants.DISASTER_TYPES / classifySeverity
 *   DisasterViewModels.*          (row shaping)
 *   DisasterModals.openCreateDisasterModal
 *                  .openMassDeathEventModal
 *                  .openRandomDisasterModal
 *                  .openDestroyedItemsModal
 *                  .openDisasterStatsModal
 *   UIState.getFilters / setFilters (panel 'events-disasters')
 *   UIState.getCollapsed / setCollapsed
 *
 * FILTERS (persisted per location via UIState):
 *   type            'all' | <disasterId>
 *   yearStart       number | null
 *   yearEnd         number | null
 *   sortBy          'year' | 'severity' | 'deaths'
 *   showAllLocations boolean (default true)
 *
 * DELEGATED EVENTS:
 *   One click listener on the tab container (attached once per
 *   container instance, via a __eventsDisastersWired marker).
 *     data-action="toggle-expand" data-disaster-id=<id>
 *     data-action="open-destroyed-items" data-disaster-id=<id>
 *     data-action="create-disaster"
 *     data-action="mass-death"
 *     data-action="random-disaster"
 *     data-action="refresh"
 *     data-action="clear-filters"
 *     data-action="set-type" data-type=<id>
 *     data-action="toggle-collapse"
 *   Inputs (select / year range) are new on every render, so their
 *   listeners are attached per render.
 *
 * DEPENDENCIES (all soft; guarded at call time):
 *   - EventsQueries       REQUIRED
 *   - EventsViewModels    REQUIRED
 *   - EventsUIList        REQUIRED
 *   - EventsConstants     REQUIRED
 *   - DisasterConstants   REQUIRED (disaster type catalog)
 *   - TabManager          REQUIRED for registration
 *   - ui.js showToast     OPTIONAL (silent if absent)
 *   - UIState             REQUIRED (filters persistence)
 *   - DisasterModals.*    OPTIONAL (toast + console.error if absent)
 *   - DisasterQueries.*   OPTIONAL (some stats helpers degrade)
 *
 * TIME CONTRACT: uses window.getCurrentYear (no fallback).
 * ICON POLICY: no emojis, no Unicode glyphs. Icons via _icon().
 * =============================================================================
 *
 * REFACTOR HISTORY:
 *   Initial revision.
 *     - Ported from disasterTabUI.js's renderDisasterManagerTab. The
 *       functionality is preserved; the implementation is rewritten
 *       against the Events Manager's tab skeleton.
 *     - Removed hardcoded hex severity colors -> theme tokens.
 *     - Removed Unicode expand glyphs -> Icons.TRIANGLE_UP/DOWN.
 *     - Removed SKULL / FIRE icon references (keys not in icons.js);
 *       replaced with real Icons keys.
 *     - Removed per-element listeners on .type-stat / .location-tag;
 *       delegated to the container with data-action attributes.
 *     - Removed per-render container click listener; guarded by
 *       container.__eventsDisastersWired.
 *     - Removed setTimeout-based refresh after modal close; modal
 *       onSuccess calls _refresh() directly.
 *     - Filter state via UIState instead of a module-level object.
 *     - Three-way empty state (no-disasters / no-matches /
 *       unavailable).
 *     - Per-disaster expand state lives on UIState.getData /
 *       setData under key 'expandedDisasterId', so it survives
 *       tab switches and page reloads.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var TAB_ID = 'disasters';
    var SCOPE  = 'events';

    // =========================================================================
    // 2. DEPENDENCY ACCESSORS
    // =========================================================================

    function _queries()    { return window.EventsQueries || null; }
    function _vm()         { return window.EventsViewModels || null; }
    function _ui()         { return window.EventsUIList || null; }
    function _eventsConst() { return window.EventsConstants || null; }
    function _disasterConst() { return window.DisasterConstants || null; }
    function _tabManager() { return window.TabManager || null; }
    function _uiState()    { return window.UIState || null; }
    function _disasterModals() { return window.DisasterModals || null; }
    function _disasterQueries() { return window.DisasterQueries || null; }

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

    function _panelId(locationId) {
        var C = _eventsConst();
        var base = C ? C.panelIdFor(TAB_ID) : ('events-' + TAB_ID);
        return base + ':' + (locationId || 'all');
    }

    // =========================================================================
    // 4. FILTER STATE
    // =========================================================================

    var _state = null;
    var _lastPanelId = null;

    function _defaultFilters() {
        return {
            type: 'all',
            yearStart: null,
            yearEnd: null,
            sortBy: 'year',
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

    function _readExpandedId(panelId) {
        var U = _uiState();
        if (!U) return null;
        var v = U.getData(panelId, 'expandedDisasterId', null);
        return typeof v === 'string' && v.length > 0 ? v : null;
    }

    function _writeExpandedId(panelId, id) {
        var U = _uiState();
        if (!U) return;
        if (id) U.setData(panelId, 'expandedDisasterId', id);
        else U.removeData(panelId, 'expandedDisasterId');
    }

    // =========================================================================
    // 5. FILTERING / SORTING
    // =========================================================================

    function _applyFilters(records, filters) {
        if (!Array.isArray(records)) return [];

        var type = filters.type || 'all';
        var yearStart = (typeof filters.yearStart === 'number') ? filters.yearStart : null;
        var yearEnd = (typeof filters.yearEnd === 'number') ? filters.yearEnd : null;
        var sortBy = filters.sortBy || 'year';

        var filtered = [];
        for (var i = 0; i < records.length; i++) {
            var d = records[i];
            if (!d) continue;
            if (type !== 'all' && d.disasterId !== type) continue;
            if (yearStart !== null
                && (typeof d.year !== 'number' || d.year < yearStart)) continue;
            if (yearEnd !== null
                && (typeof d.year !== 'number' || d.year > yearEnd)) continue;
            filtered.push(d);
        }

        filtered.sort(function(a, b) {
            if (sortBy === 'severity') {
                return _numOrZero(b.severity) - _numOrZero(a.severity);
            }
            if (sortBy === 'deaths') {
                return _deathsOf(b) - _deathsOf(a);
            }
            return _numOrZero(b.year) - _numOrZero(a.year);
        });

        return filtered;
    }

    function _numOrZero(n) {
        return (typeof n === 'number' && isFinite(n)) ? n : 0;
    }

    function _deathsOf(d) {
        if (typeof d.actualDeaths === 'number' && isFinite(d.actualDeaths)) {
            return d.actualDeaths;
        }
        if (typeof d.deaths === 'number' && isFinite(d.deaths)) {
            return d.deaths;
        }
        return 0;
    }

    // =========================================================================
    // 6. STATS / AGGREGATES
    // =========================================================================

    function _computeStats(records) {
        var stats = {
            total: 0,
            totalDeaths: 0,
            totalSeverity: 0,
            avgSeverity: 0,
            byType: {}
        };
        if (!Array.isArray(records)) return stats;

        for (var i = 0; i < records.length; i++) {
            var d = records[i];
            if (!d) continue;
            stats.total++;
            stats.totalDeaths += _deathsOf(d);
            stats.totalSeverity += _numOrZero(d.severity);
            var typeKey = d.disasterId || 'unknown';
            stats.byType[typeKey] = (stats.byType[typeKey] || 0) + 1;
        }
        stats.avgSeverity = stats.total > 0
            ? Math.round(stats.totalSeverity / stats.total)
            : 0;
        return stats;
    }

    function _computeTopLocations(records, limit) {
        var counts = {};
        if (Array.isArray(records)) {
            for (var i = 0; i < records.length; i++) {
                var d = records[i];
                if (!d) continue;
                var name = (typeof d.locationName === 'string' && d.locationName.length > 0)
                    ? d.locationName
                    : 'Unknown Location';
                counts[name] = (counts[name] || 0) + 1;
            }
        }
        var entries = [];
        for (var k in counts) {
            if (!Object.prototype.hasOwnProperty.call(counts, k)) continue;
            entries.push({ name: k, count: counts[k] });
        }
        entries.sort(function(a, b) { return b.count - a.count; });
        var cap = (typeof limit === 'number' && limit > 0) ? limit : 5;
        return entries.slice(0, cap);
    }

    // =========================================================================
    // 7. SEVERITY LABELS (delegate to DisasterConstants)
    // =========================================================================

    function _severityColorToken(severity) {
        var C = _disasterConst();
        if (!C || typeof C.classifySeverity !== 'function') return 'dim';
        var band = C.classifySeverity(severity);
        switch (band) {
            case 'low':      return 'success';
            case 'medium':   return 'accent';
            case 'high':     return 'warn';
            case 'critical': return 'danger';
            default:         return 'dim';
        }
    }

    function _severityLabel(severity) {
        var C = _disasterConst();
        if (!C || typeof C.classifySeverity !== 'function') return 'Unknown';
        var band = C.classifySeverity(severity);
        switch (band) {
            case 'low':      return 'Minor';
            case 'medium':   return 'Moderate';
            case 'high':     return 'Severe';
            case 'critical': return 'Catastrophic';
            default:         return 'Unknown';
        }
    }

    // =========================================================================
    // 8. FILTER BAR
    // =========================================================================

    function _renderFilterBar(context, filters) {
        var C = _disasterConst();
        if (!C || !Array.isArray(C.DISASTER_TYPES)) {
            return '';
        }

        var typeOptions = '<option value="all"' +
            (filters.type === 'all' ? ' selected' : '') +
            '>All Types</option>';
        for (var i = 0; i < C.DISASTER_TYPES.length; i++) {
            var t = C.DISASTER_TYPES[i];
            var sel = (t.id === filters.type) ? ' selected' : '';
            typeOptions += '<option value="' + _esc(t.id) + '"' + sel + '>' +
                _esc(t.name) + '</option>';
        }

        var sortOptions =
            '<option value="year"' + (filters.sortBy === 'year' ? ' selected' : '') +
            '>Sort: Year</option>' +
            '<option value="severity"' + (filters.sortBy === 'severity' ? ' selected' : '') +
            '>Sort: Severity</option>' +
            '<option value="deaths"' + (filters.sortBy === 'deaths' ? ' selected' : '') +
            '>Sort: Deaths</option>';

        var showAllLocations = filters.showAllLocations === true;
        var locationName = (context && context.locationName) ? context.locationName : '';
        var collapsed = filters.collapsed === true;
        var collapseIconName = collapsed ? 'TRIANGLE_DOWN' : 'TRIANGLE_UP';

        var html = '';
        html += '<div class="events-filters events-filters--disasters">';
        html += '<div class="events-filters__header">';
        html += '<button type="button" class="events-filters__collapse" ' +
            'data-action="toggle-collapse" aria-label="Toggle filters">' +
            _icon(collapseIconName) +
            '<span>Filters</span>' +
            '</button>';

        html += '<label class="events-filters__scope">';
        html += '<input type="checkbox" class="ev-disasters-input" ' +
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

        html += '<div class="events-filters__body"' +
            (collapsed ? ' style="display:none;"' : '') + '>';
        html += '<select class="ev-disasters-input events-filters__select" data-input="type">' +
            typeOptions + '</select>';
        html += '<input type="number" class="ev-disasters-input events-filters__year" ' +
            'data-input="yearStart" placeholder="From Year" value="' +
            _esc(filters.yearStart != null ? String(filters.yearStart) : '') + '">';
        html += '<input type="number" class="ev-disasters-input events-filters__year" ' +
            'data-input="yearEnd" placeholder="To Year" value="' +
            _esc(filters.yearEnd != null ? String(filters.yearEnd) : '') + '">';
        html += '<select class="ev-disasters-input events-filters__select" data-input="sortBy">' +
            sortOptions + '</select>';
        html += '</div>';

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 9. STATS BAR
    // =========================================================================

    function _renderStatsBar(stats) {
        var cells = [
            { label: 'Total Disasters', value: String(stats.total),
              colorToken: 'accent', iconName: 'EVENTS' },
            { label: 'Total Deaths', value: _formatNumber(stats.totalDeaths),
              colorToken: 'danger', iconName: 'DEATHSTARS' },
            { label: 'Avg Severity', value: String(stats.avgSeverity),
              colorToken: 'warn', iconName: 'STAR' },
            { label: 'Types', value: String(Object.keys(stats.byType).length),
              colorToken: null, iconName: 'GEAR' }
        ];

        var html = '<div class="events-stats-bar events-stats-bar--disasters">';
        for (var i = 0; i < cells.length; i++) {
            var c = cells[i];
            var style = c.colorToken
                ? ' style="color:var(--' + _esc(c.colorToken) + ');"'
                : '';
            html += '<div class="events-stats-bar__cell">' +
                '<span class="events-stats-bar__icon" aria-hidden="true">' +
                _icon(c.iconName) +
                '</span>' +
                '<span class="events-stats-bar__label">' + _esc(c.label) + '</span>' +
                '<span class="events-stats-bar__value"' + style + '>' +
                _esc(c.value) + '</span>' +
                '</div>';
        }
        html += '</div>';
        return html;
    }

    function _formatNumber(n) {
        if (typeof n !== 'number' || !isFinite(n)) return '0';
        return String(Math.round(n));
    }

    // =========================================================================
    // 10. QUICK ACTIONS
    // =========================================================================

    function _renderQuickActions() {
        var html = '<div class="events-quick-actions">';
        html += '<button type="button" class="events-quick-actions__btn" ' +
            'data-action="create-disaster">' +
            _icon('GEAR') + '<span>Create Disaster</span></button>';
        html += '<button type="button" class="events-quick-actions__btn" ' +
            'data-action="mass-death">' +
            _icon('DEATHSTARS') + '<span>Mass Death Event</span></button>';
        html += '<button type="button" class="events-quick-actions__btn" ' +
            'data-action="random-disaster">' +
            _icon('WARNING') + '<span>Random Disaster</span></button>';
        html += '</div>';
        return html;
    }

    // =========================================================================
    // 11. TOP LOCATIONS STRIP
    // =========================================================================

    function _renderTopLocations(topLocations) {
        if (!Array.isArray(topLocations) || topLocations.length === 0) return '';
        var html = '<div class="events-disasters-top-locations">';
        html += '<div class="events-section-header">' +
            _icon('HOME') + ' Most Affected Locations</div>';
        html += '<div class="events-disasters-top-locations__list">';
        for (var i = 0; i < topLocations.length; i++) {
            var loc = topLocations[i];
            html += '<span class="events-disasters-top-locations__tag" ' +
                'data-action="filter-location" data-location-name="' +
                _esc(loc.name) + '">' +
                _esc(loc.name) + ' (' + loc.count + ')' +
                '</span>';
        }
        html += '</div></div>';
        return html;
    }

    // =========================================================================
    // 12. TYPE DISTRIBUTION STRIP
    // =========================================================================

    function _renderTypeDistribution(stats) {
        var keys = Object.keys(stats.byType);
        if (keys.length === 0) return '';
        var C = _disasterConst();
        var html = '<div class="events-disasters-type-distribution">';
        html += '<div class="events-section-header">' +
            _icon('CIRCLE_DOT') + ' Disaster Type Distribution</div>';
        html += '<div class="events-disasters-type-distribution__list">';
        for (var i = 0; i < keys.length; i++) {
            var typeId = keys[i];
            var count = stats.byType[typeId];
            var label = typeId;
            if (C && Array.isArray(C.DISASTER_TYPES)) {
                for (var j = 0; j < C.DISASTER_TYPES.length; j++) {
                    if (C.DISASTER_TYPES[j].id === typeId) {
                        label = C.DISASTER_TYPES[j].name;
                        break;
                    }
                }
            }
            html += '<span class="events-disasters-type-distribution__tag" ' +
                'data-action="set-type" data-type="' + _esc(typeId) + '">' +
                _esc(label) + ' (' + count + ')' +
                '</span>';
        }
        html += '</div></div>';
        return html;
    }

    // =========================================================================
    // 13. DISASTER ROW
    // =========================================================================

    function _renderDisasterRow(d, expandedId) {
        if (!d || typeof d.id !== 'string') return '';

        var isExpanded = d.id === expandedId;
        var colorToken = _severityColorToken(d.severity);
        var severityLabel = _severityLabel(d.severity);
        var deaths = _deathsOf(d);
        var year = (typeof d.year === 'number') ? d.year : null;
        var yearLabel = (year === null) ? '?' : String(year);

        var expandIconName = isExpanded ? 'TRIANGLE_DOWN' : 'TRIANGLE_UP';

        var html = '<div class="events-disasters-row' +
            (isExpanded ? ' events-disasters-row--expanded' : '') + '" ' +
            'data-disaster-id="' + _esc(d.id) + '">';

        // Header
        html += '<div class="events-disasters-row__header" ' +
            'data-action="toggle-expand" data-disaster-id="' + _esc(d.id) + '" ' +
            'role="button" tabindex="0">';

        html += '<span class="events-disasters-row__type-icon" ' +
            'style="color:var(--' + _esc(colorToken) + ');" aria-hidden="true">' +
            _icon('EVENTS') + '</span>';

        html += '<div class="events-disasters-row__title">';
        html += '<span class="events-disasters-row__name">' +
            _esc(d.disasterType || 'Unknown') + '</span>';
        if (typeof d.locationName === 'string' && d.locationName.length > 0) {
            html += '<span class="events-disasters-row__location">' +
                _icon('HOME') + ' ' + _esc(d.locationName) + '</span>';
        }
        html += '<span class="events-disasters-row__year">' + _esc(yearLabel) + '</span>';
        html += '</div>';

        html += '<div class="events-disasters-row__stats">';
        html += '<span class="events-disasters-row__severity" ' +
            'style="color:var(--' + _esc(colorToken) + ');">' +
            _esc(severityLabel) + ' (' + _esc(String(d.severity || 0)) + ')' +
            '</span>';
        html += '<span class="events-disasters-row__deaths">' +
            _icon('DEATHSTARS') + ' ' + _esc(_formatNumber(deaths)) +
            '</span>';
        html += '<span class="events-disasters-row__expand-icon" aria-hidden="true">' +
            _icon(expandIconName) + '</span>';
        html += '</div>';

        html += '</div>'; // header

        if (isExpanded) {
            html += _renderDisasterDetails(d, deaths);
        }

        html += '</div>';
        return html;
    }

    function _renderDisasterDetails(d, deaths) {
        var html = '<div class="events-disasters-row__details">';

        var population = (typeof d.population === 'number' && d.population > 0)
            ? d.population : null;
        var percentOfPop = (population !== null)
            ? Math.round((deaths / population) * 100)
            : null;

        // Grid of detail cells
        html += '<div class="events-disasters-row__detail-grid">';

        html += _detailCell('Severity',
            _esc(_severityLabel(d.severity)) + ' (' +
            _esc(String(d.severity || 0)) + ')');

        html += _detailCell('Deaths',
            population !== null
                ? _esc(_formatNumber(deaths)) + ' / ' +
                  _esc(_formatNumber(population)) + ' (' +
                  _esc(String(percentOfPop)) + '%)'
                : _esc(_formatNumber(deaths)));

        html += _detailCell('Prosperity Loss',
            _esc(String(d.prosperityLoss || 0)) + ' points');

        html += _detailCell('Crime Rate Increase',
            _esc(String(Math.round((d.crimeIncrease || 0) * 100))) + '%');

        html += '</div>'; // grid

        // Description
        if (typeof d.description === 'string' && d.description.length > 0) {
            html += '<div class="events-disasters-row__description">';
            html += '<div class="events-disasters-row__detail-label">Description</div>';
            html += '<div class="events-disasters-row__detail-value">' +
                _esc(d.description) + '</div>';
            html += '</div>';
        }

        // Structural damage
        var damage = d.structuralDamage || null;
        if (damage && _hasAnyDamage(damage)) {
            html += '<div class="events-disasters-row__damage">';
            html += '<div class="events-disasters-row__detail-label">Structural Damage</div>';
            html += '<div class="events-disasters-row__detail-value">' +
                _renderDamageBreakdown(damage) +
                '</div>';
            html += '<button type="button" class="events-disasters-row__detail-btn" ' +
                'data-action="open-destroyed-items" data-disaster-id="' +
                _esc(d.id) + '">' +
                _icon('BOOK') + ' View Destroyed Items' +
                '</button>';
            html += '</div>';
        }

        html += '</div>'; // details
        return html;
    }

    function _hasAnyDamage(damage) {
        return !!(damage.featuresDestroyed
            || damage.schoolsDestroyed
            || damage.enterprisesDestroyed
            || damage.residencesDemolished
            || damage.householdsDestroyed);
    }

    function _renderDamageBreakdown(damage) {
        var parts = [];
        if (damage.featuresDestroyed) {
            parts.push(_esc(String(damage.featuresDestroyed)) + ' features');
        }
        if (damage.schoolsDestroyed) {
            parts.push(_esc(String(damage.schoolsDestroyed)) + ' schools');
        }
        if (damage.enterprisesDestroyed) {
            parts.push(_esc(String(damage.enterprisesDestroyed)) + ' enterprises');
        }
        if (damage.residencesDemolished) {
            parts.push(_esc(String(damage.residencesDemolished)) + ' residences');
        }
        if (damage.householdsDestroyed) {
            parts.push(_esc(String(damage.householdsDestroyed)) + ' households');
        }
        var text = parts.join(' · ');
        if (typeof damage.totalLoss === 'number' && damage.totalLoss > 0) {
            text += ' · ' + _esc(String(damage.totalLoss)) + ' gold lost';
        }
        return text;
    }

    function _detailCell(label, valueHtml) {
        return '<div class="events-disasters-row__detail-cell">' +
            '<div class="events-disasters-row__detail-label">' +
            _esc(label) + '</div>' +
            '<div class="events-disasters-row__detail-value">' +
            valueHtml + '</div>' +
            '</div>';
    }

    // =========================================================================
    // 14. MAIN RENDER
    // =========================================================================

    function renderDisastersTab(container, context) {
        if (!container) return;

        var q = _queries();
        var U = _ui();
        var C = _eventsConst();

        if (!q || !U || !C) {
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

        var expandedId = _readExpandedId(panelId);

        // Fetch
        var effectiveLocationId = _state.showAllLocations ? null : locationId;
        var result = q.getDisasterRecords(effectiveLocationId);

        if (!result || result.available !== true) {
            container.innerHTML =
                '<div class="events-unavailable">' +
                _esc('Disaster records are not available: ' +
                     (result && result.reason ? result.reason : 'unknown')) +
                '</div>';
            return;
        }

        var records = Array.isArray(result.records) ? result.records : [];
        var totalCount = records.length;
        var filtered = _applyFilters(records, _state);
        var stats = _computeStats(records);
        var topLocations = _computeTopLocations(records, 5);

        // Build
        var filterBar = _renderFilterBar({
            locationId: locationId,
            locationName: context && context.locationName
        }, _state);
        var statsBar = _renderStatsBar(stats);
        var quickActions = _renderQuickActions();
        var topLocationsStrip = _renderTopLocations(topLocations);
        var typeDistribution = _renderTypeDistribution(stats);

        var listHtml = '';
        if (filtered.length === 0) {
            listHtml = _renderEmptyState(totalCount, records.length);
        } else {
            listHtml = '<div class="events-list events-list--disasters">';
            for (var i = 0; i < filtered.length; i++) {
                listHtml += _renderDisasterRow(filtered[i], expandedId);
            }
            listHtml += '</div>';
        }

        container.innerHTML =
            '<div class="events-disasters-tab">' +
            filterBar +
            statsBar +
            quickActions +
            topLocationsStrip +
            typeDistribution +
            listHtml +
            '</div>';

        // Wire
        _wireInputs(container, locationId);
        _wireDelegated(container, locationId);
    }

    function _renderEmptyState(totalCount, rawCount) {
        var caseId;
        if (rawCount === 0) caseId = 'no-disasters';
        else if (totalCount === 0) caseId = 'no-disasters';
        else caseId = 'no-matches';

        var message = caseId === 'no-disasters'
            ? 'No disasters recorded. Use the actions above to add one.'
            : 'No disasters match your filters. Try clearing them.';

        return '<div class="events-empty">' +
            '<div class="events-empty__icon" style="color:var(--dim);">' +
            _icon('EVENTS') +
            '</div>' +
            '<div class="events-empty__message">' + _esc(message) + '</div>' +
            '</div>';
    }

    // =========================================================================
    // 15. INPUT WIRING (per-render, fresh elements)
    // =========================================================================

    function _wireInputs(container, locationId) {
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

        var inputs = container.querySelectorAll('.ev-disasters-input');
        for (var i = 0; i < inputs.length; i++) {
            (function(input) {
                var key = input.getAttribute('data-input');
                if (!key) return;

                var eventName = (input.tagName === 'SELECT' || input.type === 'checkbox')
                    ? 'change'
                    : 'change';

                input.addEventListener(eventName, function() {
                    if (input.type === 'checkbox') {
                        commit({ showAllLocations: input.checked === true });
                        return;
                    }
                    if (key === 'yearStart' || key === 'yearEnd') {
                        var parsed = parseInt(input.value, 10);
                        var val = isFinite(parsed) ? parsed : null;
                        var patch = {};
                        patch[key] = val;
                        commit(patch);
                        return;
                    }
                    var p2 = {};
                    p2[key] = input.value;
                    commit(p2);
                });
            })(inputs[i]);
        }
    }

    // =========================================================================
    // 16. DELEGATED CLICK HANDLER
    // =========================================================================

    function _wireDelegated(container, locationId) {
        if (container.__eventsDisastersWired) return;
        container.__eventsDisastersWired = true;

        container.addEventListener('click', function(e) {
            var target = e.target;
            if (!target || typeof target.closest !== 'function') return;

            var actionEl = target.closest('[data-action]');
            if (!actionEl || !container.contains(actionEl)) return;

            var action = actionEl.getAttribute('data-action');

            if (action === 'toggle-expand') {
                e.preventDefault();
                var id = actionEl.getAttribute('data-disaster-id');
                if (!id) return;
                var U = _uiState();
                if (!U) return;
                var panelId = _panelId(locationId);
                var current = _readExpandedId(panelId);
                _writeExpandedId(panelId, current === id ? null : id);
                _refresh();
                return;
            }

            if (action === 'open-destroyed-items') {
                e.preventDefault();
                e.stopPropagation();
                var id2 = actionEl.getAttribute('data-disaster-id');
                if (!id2) return;
                _openDestroyedItemsModal(id2);
                return;
            }

            if (action === 'create-disaster') {
                e.preventDefault();
                _openCreateDisasterModal(locationId);
                return;
            }

            if (action === 'mass-death') {
                e.preventDefault();
                _openMassDeathEventModal(locationId);
                return;
            }

            if (action === 'random-disaster') {
                e.preventDefault();
                _openRandomDisasterModal();
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

            if (action === 'set-type') {
                e.preventDefault();
                var typeId = actionEl.getAttribute('data-type');
                if (!typeId) return;
                _state.type = typeId;
                _writeFilters(_panelId(locationId), _state);
                _refresh();
                return;
            }

            if (action === 'filter-location') {
                e.preventDefault();
                // The old disasterTabUI only toasted a hint here. We
                // do the same: selecting a location filter from the
                // tag is not a supported action; the sidebar is the
                // canonical location picker.
                var locName = actionEl.getAttribute('data-location-name') || '';
                _toast('Use the sidebar to filter by ' + locName + '.', 'info');
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
    // 17. FILTER RESET
    // =========================================================================

    function _clearFilters(locationId) {
        var defaults = _defaultFilters();
        _state = {
            type: defaults.type,
            yearStart: defaults.yearStart,
            yearEnd: defaults.yearEnd,
            sortBy: defaults.sortBy,
            showAllLocations: _state.showAllLocations,
            collapsed: _state.collapsed
        };
        _writeFilters(_panelId(locationId), _state);
        _refresh();
        _toast('Filters cleared.', 'info');
    }

    // =========================================================================
    // 18. MODAL DELEGATES
    // =========================================================================

    function _openCreateDisasterModal(locationId) {
        var M = _disasterModals();
        if (!M || typeof M.openCreateDisasterModal !== 'function') {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    '[events-disasters-tab] openCreateDisasterModal is not ' +
                    'loaded; load modals-disaster.js.'
                );
            }
            _toast('Create disaster modal is not available.', 'error');
            return;
        }
        // The new modals-disaster.js accepts an options object.
        M.openCreateDisasterModal({
            locationId: locationId || null,
            onComplete: function() { _refresh(); }
        });
    }

    function _openMassDeathEventModal(locationId) {
        var M = _disasterModals();
        // The new modals-disaster.js does not expose
        // openMassDeathEventModal as a top-level function; mass-death
        // events are modeled as triggerPlague / triggerFamine via the
        // create modal, or directly via DisasterCommands.
        // Fall back to the create modal with the mass-death types
        // pre-selected.
        if (M && typeof M.openCreateDisasterModal === 'function') {
            M.openCreateDisasterModal({
                locationId: locationId || null,
                disasterType: 'plague',
                onComplete: function() { _refresh(); }
            });
            return;
        }
        _toast('Mass death event is not available.', 'error');
    }

    function _openRandomDisasterModal() {
        var Cmd = window.DisasterCommands;
        if (!Cmd || typeof Cmd.simulateRandomDisaster !== 'function') {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    '[events-disasters-tab] DisasterCommands.simulateRandomDisaster ' +
                    'is not loaded; load disaster-commands.js.'
                );
            }
            _toast('Random disaster is not available.', 'error');
            return;
        }
        var year = _getCurrentYear();
        var result = Cmd.simulateRandomDisaster(year, 0.05);
        if (!result || result.success !== true) {
            _toast('Simulation failed: ' +
                (result && result.reason ? result.reason : 'unknown'), 'error');
            return;
        }
        if (!result.data || !result.data.disaster) {
            _toast('No disaster occurred this year.', 'info');
            return;
        }
        _toast(result.data.disaster.disasterType + ' occurred.', 'warning');
        _refresh();
        // Persist once, after the simulation. The create modal
        // persists on its own; the direct command path needs an
        // explicit persist call.
        if (typeof Cmd.persist === 'function') {
            var p = Cmd.persist();
            if (!p || p.success !== true) {
                _toast('Saved in memory, but disk save failed: ' +
                    (p && p.reason ? p.reason : 'unknown'), 'warning');
            }
        }
    }

    function _openDestroyedItemsModal(disasterId) {
        var M = _disasterModals();
        if (!M || typeof M.openDestroyedItemsModal !== 'function') {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    '[events-disasters-tab] openDestroyedItemsModal is not ' +
                    'loaded; load modals-disaster.js.'
                );
            }
            _toast('Destroyed items modal is not available.', 'error');
            return;
        }
        M.openDestroyedItemsModal(disasterId);
    }

    // =========================================================================
    // 19. REFRESH
    // =========================================================================

    function _refresh() {
        var TM = _tabManager();
        if (TM && typeof TM.requestRender === 'function') {
            TM.requestRender(SCOPE, TAB_ID);
        }
    }

    // =========================================================================
    // 20. STYLES (injected once)
    // =========================================================================

    function _ensureStyles() {
        if (document.getElementById('events-disasters-tab-styles')) return;
        var style = document.createElement('style');
        style.id = 'events-disasters-tab-styles';
        style.textContent = [
            // The tab reuses the base .events-* classes that
            // events-deaths-tab.js defines (.events-filters,
            // .events-stats-bar, .events-list, .events-empty,
            // .events-unavailable). This stylesheet adds the classes
            // specific to the disasters facet.

            '.events-disasters-tab {',
            '  display: flex;',
            '  flex-direction: column;',
            '  gap: 0.75rem;',
            '}',

            '.events-quick-actions {',
            '  display: flex;',
            '  gap: 0.5rem;',
            '  flex-wrap: wrap;',
            '  padding: 0.5rem 0.75rem;',
            '  background: var(--bg2);',
            '  border: 1px solid var(--border);',
            '  border-radius: var(--radius);',
            '}',
            '.events-quick-actions__btn {',
            '  display: inline-flex;',
            '  align-items: center;',
            '  gap: 0.3125rem;',
            '  padding: 0.3125rem 0.75rem;',
            '  background: var(--bg3);',
            '  border: 1px solid var(--border);',
            '  border-radius: var(--radius);',
            '  color: var(--text);',
            '  font-family: var(--f-body);',
            '  font-size: 0.65rem;',
            '  cursor: pointer;',
            '}',
            '.events-quick-actions__btn:hover {',
            '  border-color: var(--accent);',
            '  color: var(--accent-light);',
            '}',
            '.events-quick-actions__btn svg {',
            '  width: 0.85em;',
            '  height: 0.85em;',
            '  fill: currentColor;',
            '}',

            '.events-section-header {',
            '  display: flex;',
            '  align-items: center;',
            '  gap: 0.3125rem;',
            '  font-family: var(--f-display);',
            '  font-size: 0.55rem;',
            '  text-transform: uppercase;',
            '  letter-spacing: 0.05em;',
            '  color: var(--dim);',
            '  margin-bottom: 0.375rem;',
            '}',
            '.events-section-header svg {',
            '  width: 0.9em;',
            '  height: 0.9em;',
            '  fill: currentColor;',
            '}',

            '.events-disasters-top-locations,',
            '.events-disasters-type-distribution {',
            '  padding: 0.5rem 0.75rem;',
            '  background: var(--bg2);',
            '  border: 1px solid var(--border);',
            '  border-radius: var(--radius);',
            '}',
            '.events-disasters-top-locations__list,',
            '.events-disasters-type-distribution__list {',
            '  display: flex;',
            '  gap: 0.375rem;',
            '  flex-wrap: wrap;',
            '}',
            '.events-disasters-top-locations__tag,',
            '.events-disasters-type-distribution__tag {',
            '  display: inline-flex;',
            '  align-items: center;',
            '  padding: 0.1875rem 0.5rem;',
            '  background: var(--bg3);',
            '  border: 1px solid var(--border);',
            '  border-radius: 999px;',
            '  font-size: 0.6rem;',
            '  color: var(--text);',
            '  cursor: pointer;',
            '}',
            '.events-disasters-top-locations__tag:hover,',
            '.events-disasters-type-distribution__tag:hover {',
            '  border-color: var(--accent);',
            '  color: var(--accent-light);',
            '}',

            '.events-list--disasters {',
            '  display: flex;',
            '  flex-direction: column;',
            '  gap: 0.25rem;',
            '}',
            '.events-disasters-row {',
            '  background: var(--bg2);',
            '  border: 1px solid var(--border);',
            '  border-left: 3px solid var(--border);',
            '  border-radius: var(--radius);',
            '  overflow: hidden;',
            '}',
            '.events-disasters-row--expanded {',
            '  border-left-color: var(--warn);',
            '}',
            '.events-disasters-row__header {',
            '  display: flex;',
            '  align-items: center;',
            '  gap: 0.625rem;',
            '  padding: 0.5rem 0.75rem;',
            '  cursor: pointer;',
            '}',
            '.events-disasters-row__header:hover {',
            '  background: var(--bg3);',
            '}',
            '.events-disasters-row__header:focus-visible {',
            '  outline: 2px solid var(--accent);',
            '  outline-offset: -2px;',
            '}',
            '.events-disasters-row__type-icon {',
            '  display: inline-flex;',
            '  width: 1.25rem;',
            '  height: 1.25rem;',
            '  flex-shrink: 0;',
            '}',
            '.events-disasters-row__type-icon svg {',
            '  width: 100%;',
            '  height: 100%;',
            '  fill: currentColor;',
            '}',
            '.events-disasters-row__title {',
            '  display: flex;',
            '  align-items: baseline;',
            '  gap: 0.5rem;',
            '  flex-wrap: wrap;',
            '  flex: 1;',
            '  min-width: 0;',
            '}',
            '.events-disasters-row__name {',
            '  font-family: var(--f-display);',
            '  font-size: 0.8rem;',
            '  font-weight: 600;',
            '}',
            '.events-disasters-row__location {',
            '  display: inline-flex;',
            '  align-items: center;',
            '  gap: 0.1875rem;',
            '  font-size: 0.6rem;',
            '  color: var(--dim);',
            '}',
            '.events-disasters-row__location svg {',
            '  width: 0.9em;',
            '  height: 0.9em;',
            '  fill: currentColor;',
            '}',
            '.events-disasters-row__year {',
            '  font-family: var(--f-mono);',
            '  font-size: 0.6rem;',
            '  color: var(--dim);',
            '}',
            '.events-disasters-row__stats {',
            '  display: flex;',
            '  align-items: center;',
            '  gap: 0.5rem;',
            '  flex-wrap: wrap;',
            '}',
            '.events-disasters-row__severity,',
            '.events-disasters-row__deaths {',
            '  display: inline-flex;',
            '  align-items: center;',
            '  gap: 0.1875rem;',
            '  font-size: 0.55rem;',
            '}',
            '.events-disasters-row__deaths svg {',
            '  width: 0.85em;',
            '  height: 0.85em;',
            '  fill: currentColor;',
            '}',
            '.events-disasters-row__expand-icon {',
            '  display: inline-flex;',
            '  width: 0.75em;',
            '  height: 0.75em;',
            '  color: var(--dim);',
            '}',
            '.events-disasters-row__expand-icon svg {',
            '  width: 100%;',
            '  height: 100%;',
            '  fill: currentColor;',
            '}',

            '.events-disasters-row__details {',
            '  padding: 0.75rem;',
            '  border-top: 1px solid var(--border);',
            '  background: var(--bg3);',
            '  display: flex;',
            '  flex-direction: column;',
            '  gap: 0.5rem;',
            '}',
            '.events-disasters-row__detail-grid {',
            '  display: grid;',
            '  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));',
            '  gap: 0.5rem;',
            '}',
            '.events-disasters-row__detail-cell {',
            '  background: var(--bg2);',
            '  border: 1px solid var(--border);',
            '  border-radius: var(--radius);',
            '  padding: 0.375rem 0.5rem;',
            '}',
            '.events-disasters-row__detail-label {',
            '  font-family: var(--f-display);',
            '  font-size: 0.5rem;',
            '  text-transform: uppercase;',
            '  letter-spacing: 0.05em;',
            '  color: var(--dim);',
            '  margin-bottom: 0.125rem;',
            '}',
            '.events-disasters-row__detail-value {',
            '  font-size: 0.7rem;',
            '  color: var(--text);',
            '}',
            '.events-disasters-row__description,',
            '.events-disasters-row__damage {',
            '  background: var(--bg2);',
            '  border: 1px solid var(--border);',
            '  border-radius: var(--radius);',
            '  padding: 0.375rem 0.5rem;',
            '}',
            '.events-disasters-row__detail-btn {',
            '  display: inline-flex;',
            '  align-items: center;',
            '  gap: 0.3125rem;',
            '  margin-top: 0.375rem;',
            '  padding: 0.1875rem 0.5rem;',
            '  background: var(--bg3);',
            '  border: 1px solid var(--border);',
            '  border-radius: var(--radius);',
            '  color: var(--accent-light);',
            '  font-family: var(--f-body);',
            '  font-size: 0.6rem;',
            '  cursor: pointer;',
            '}',
            '.events-disasters-row__detail-btn:hover {',
            '  border-color: var(--accent);',
            '}',
            '.events-disasters-row__detail-btn svg {',
            '  width: 0.85em;',
            '  height: 0.85em;',
            '  fill: currentColor;',
            '}',

            // Scoped to this tab: the .events-filters--disasters
            // modifier exists so the disaster filter bar can grow
            // extra inputs without touching the deaths filter bar.
            '.events-filters--disasters .events-filters__year {',
            '  width: 6rem;',
            '  padding: 0.3125rem 0.5rem;',
            '  background: var(--bg);',
            '  border: 1px solid var(--border);',
            '  border-radius: var(--radius);',
            '  color: var(--text);',
            '  font-family: var(--f-body);',
            '  font-size: 0.72rem;',
            '}',
            '.events-filters--disasters .events-filters__year:focus {',
            '  outline: none;',
            '  border-color: var(--accent);',
            '}'
        ].join('\n');
        document.head.appendChild(style);
    }

    // =========================================================================
    // 21. REGISTRATION
    // =========================================================================

    _ensureStyles();

    var TM = _tabManager();
    if (TM && typeof TM.register === 'function') {
        TM.register(SCOPE, TAB_ID, renderDisastersTab);
    } else if (typeof console !== 'undefined' && console.warn) {
        console.warn(
            'events-disasters-tab.js: TabManager is not available at load ' +
            'time; the disasters tab was not registered. Load tab-manager.js ' +
            'first.'
        );
    }

    // =========================================================================
    // 22. EXPORTS
    // =========================================================================

    window.EventsDisastersTab = {
        id: TAB_ID,
        render: renderDisastersTab,

        _helpers: {
            applyFilters: _applyFilters,
            computeStats: _computeStats,
            computeTopLocations: _computeTopLocations,
            defaultFilters: _defaultFilters,
            severityColorToken: _severityColorToken,
            severityLabel: _severityLabel,
            panelId: _panelId
        }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.EventsDisastersTab;
    }
})();
