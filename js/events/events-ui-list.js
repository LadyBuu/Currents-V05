/**
 * =============================================================================
 * STILL WATERS - EVENTS UI LIST (js/events/events-ui-list.js)
 * =============================================================================
 *
 * LOCATION: js/events/events-ui-list.js
 *
 * PURPOSE:
 *   HTML renderers for the Events Manager. Every function takes a
 *   view model (from events-view-models.js) and returns an HTML
 *   string. No listeners. No state. No queries. No DOM lookups.
 *
 * CONTRACT:
 *   - Every renderer returns an HTML string. It does NOT attach
 *     listeners. The tab file delegates clicks on its own container
 *     and reads data-* attributes from the rendered markup.
 *   - Every user-supplied string is escaped through _esc() (which
 *     uses window.escapeHtml). Missing escapeHtml throws -- it does
 *     not silently fall back to a regex, because a silently-missing
 *     escaper is a security bug that must be loud.
 *   - Every icon is resolved via _icon(name) which delegates to
 *     window.getIcon(name, 'CIRCLE'). Missing icons render as the
 *     CIRCLE fallback. No inline <svg> in this module.
 *   - Every color is a theme token wrapped in var(--<token>). No
 *     hex, no rgb, no named CSS colors.
 *   - Every class name is scoped to `events-*` so the module does
 *     not collide with any other manager's stylesheet.
 *
 * STYLE INJECTION:
 *   Classes below are defined by events-deaths-tab.js's own
 *   injected stylesheet (id "events-deaths-tab-styles"). This
 *   module does NOT inject styles. A future facet (stork,
 *   disasters, social, educational) that reuses these renderers
 *   must also inject a stylesheet defining the same class names --
 *   or the manager host page must include them in its shell CSS.
 *
 * DEPENDENCIES (required, verified at load):
 *   - EventsViewModels  (for the option-list rendering helpers)
 *   - window.escapeHtml (from formatting.js)
 *   - window.getIcon    (from icons.js)
 *
 * ICON POLICY: No emojis. No Unicode glyphs. Icons via _icon().
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. LOAD-TIME DEPENDENCY RESOLUTION
    // =========================================================================

    if (typeof window.escapeHtml !== 'function') {
        throw new Error(
            'events-ui-list.js requires formatting.js (escapeHtml). ' +
            'This is a hard requirement -- the module will not silently ' +
            'fall back to a regex escaper.'
        );
    }
    if (typeof window.getIcon !== 'function') {
        throw new Error(
            'events-ui-list.js requires icons.js (getIcon).'
        );
    }
    if (!window.EventsViewModels) {
        throw new Error('events-ui-list.js requires events-view-models.js.');
    }

    var VM = window.EventsViewModels;

    // =========================================================================
    // 1. LOW-LEVEL HELPERS
    // =========================================================================

    function _esc(v) {
        return window.escapeHtml(v == null ? '' : String(v));
    }

    function _icon(name) {
        return window.getIcon(name, 'CIRCLE');
    }

    function _color(token) {
        if (!token) return 'var(--dim)';
        return 'var(--' + token + ', var(--accent))';
    }

    function _classNames(parts) {
        var out = [];
        for (var i = 0; i < parts.length; i++) {
            var p = parts[i];
            if (typeof p === 'string' && p.length > 0) out.push(p);
        }
        return out.join(' ');
    }

    function _attr(name, value) {
        if (value === null || value === undefined) return '';
        if (typeof value === 'string' && value.length === 0) return '';
        return ' ' + name + '="' + _esc(value) + '"';
    }

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    // =========================================================================
    // 2. STATS BAR
    // =========================================================================
    //
    // Input: the shape produced by
    // EventsViewModels.toDeathsStatsBarViewModel.
    //
    // Output: the horizontal stat strip the tab renders under the
    // filter bar. Each cell is { label, value, colorToken, iconName }.

    function renderStatsBar(vm) {
        if (!vm) return '';
        if (vm.available !== true) {
            return '<div class="events-stats-bar events-stats-bar--unavailable">' +
                '<span class="events-stats-bar__reason">' +
                _esc(vm.reason || 'Statistics unavailable.') +
                '</span>' +
                '</div>';
        }
        if (!Array.isArray(vm.cells) || vm.cells.length === 0) {
            return '';
        }

        var html = '<div class="events-stats-bar">';
        for (var i = 0; i < vm.cells.length; i++) {
            html += _renderStatsCell(vm.cells[i]);
        }
        html += '</div>';
        return html;
    }

    function _renderStatsCell(cell) {
        if (!cell) return '';
        var style = cell.colorToken
            ? ' style="color:' + _esc(_color(cell.colorToken)) + ';"'
            : '';
        var iconName = cell.iconName || 'CIRCLE';
        return '<div class="events-stats-bar__cell">' +
            '<span class="events-stats-bar__icon" aria-hidden="true">' +
            _icon(iconName) +
            '</span>' +
            '<span class="events-stats-bar__label">' +
            _esc(cell.label) +
            '</span>' +
            '<span class="events-stats-bar__value"' + style + '>' +
            _esc(cell.value) +
            '</span>' +
            '</div>';
    }

    // =========================================================================
    // 3. FILTER BAR
    // =========================================================================
    //
    // The tab builds the filter bar markup itself (it owns the state
    // and the input ids). This module provides the <option> list
    // renderers so the tab does not have to re-derive selected flags
    // per option.

    /**
     * @param {Array<{id,label,selected}>} options
     *        Output of VM.toStatusFilterOptions / toGenderFilterOptions
     *        / toCauseFilterOptions / toSortOptions.
     * @returns {string}  <option> elements, or '' if options is empty.
     */
    function renderOptionList(options) {
        if (!Array.isArray(options) || options.length === 0) return '';
        var html = '';
        for (var i = 0; i < options.length; i++) {
            var o = options[i];
            if (!o || !_hasId(o.id)) continue;
            html += '<option value="' + _esc(o.id) + '"' +
                (o.selected ? ' selected' : '') +
                '>' + _esc(o.label) + '</option>';
        }
        return html;
    }

    // =========================================================================
    // 4. CHARACTER ROW
    // =========================================================================
    //
    // Input: the shape from EventsViewModels.toCharacterRow.
    //
    // Output: a single row for the character roster list. The row is
    // a <div> (not a <button>), because rows contain nested
    // interactive elements (Kill button). Rows respond to delegated
    // clicks by data-* attributes; the Kill button stops propagation
    // in the tab's own handler.

    function renderCharacterRow(vm) {
        if (!vm || !_hasId(vm.id)) return '';

        var rowClasses = _classNames([
            'events-row',
            'events-row--character',
            vm.isDeceased ? 'events-row--deceased' : 'events-row--living'
        ]);

        var secondaryParts = [];
        if (vm.ageLabel) secondaryParts.push(_esc(vm.ageLabel));
        if (vm.locationName) secondaryParts.push(_esc(vm.locationName));
        if (vm.rankDisplay) secondaryParts.push(_esc(vm.rankDisplay));

        var deathParts = [];
        if (vm.isDeceased) {
            if (vm.deathCauseLabel) {
                deathParts.push(
                    '<span class="events-row__death-cause" style="color:' +
                    _esc(_color(vm.deathCauseColorToken)) + ';">' +
                    _esc(vm.deathCauseLabel) +
                    '</span>'
                );
            }
            if (vm.deathCauseDetail) {
                deathParts.push(
                    '<span class="events-row__death-detail">' +
                    _esc(vm.deathCauseDetail) +
                    '</span>'
                );
            }
            if (vm.deathYearLabel) {
                deathParts.push(
                    '<span class="events-row__death-year">' +
                    _esc(vm.deathYearLabel) +
                    '</span>'
                );
            }
        }

        var actionHtml = '';
        if (vm.isDeceased) {
            actionHtml =
                '<button type="button" class="events-row__action events-row__action--disabled" ' +
                'disabled aria-label="Already deceased">' +
                _icon('DEATHSTARS') +
                '<span>Deceased</span>' +
                '</button>';
        } else {
            actionHtml =
                '<button type="button" class="events-row__action events-row__action--kill" ' +
                'data-action="kill" data-character-id="' + _esc(vm.id) + '" ' +
                'aria-label="Kill ' + _esc(vm.displayName) + '">' +
                _icon('SWORD') +
                '<span>Kill</span>' +
                '</button>';
        }

        return '<div class="' + _esc(rowClasses) + '" ' +
            'data-action="open-character" ' +
            'data-character-id="' + _esc(vm.id) + '" ' +
            'role="button" tabindex="0">' +
            _renderRowLeading(vm) +
            _renderRowBody(vm, secondaryParts, deathParts) +
            '<div class="events-row__action-wrap">' + actionHtml + '</div>' +
            '</div>';
    }

    function _renderRowLeading(vm) {
        return '<span class="events-row__gender-icon" ' +
            'style="color:' + _esc(_color(vm.genderColorToken)) + ';" ' +
            'aria-hidden="true">' +
            _icon(vm.genderIconName) +
            '</span>';
    }

    function _renderRowBody(vm, secondaryParts, deathParts) {
        var statusStyle = 'color:' + _esc(_color(vm.statusColorToken)) + ';';
        var statusIconName = vm.isDeceased ? 'DEATHSTARS' : 'CHECK_SIMPLE';

        var html = '<div class="events-row__body">';

        html += '<div class="events-row__title">';
        html += '<span class="events-row__name">' + _esc(vm.displayName) + '</span>';
        html += '<span class="events-row__status" style="' + _esc(statusStyle) + '">' +
            _icon(statusIconName) +
            '<span>' + _esc(vm.statusLabel) + '</span>' +
            '</span>';
        html += '</div>';

        if (secondaryParts.length > 0) {
            html += '<div class="events-row__secondary">' +
                secondaryParts.join('<span class="events-row__sep">·</span>') +
                '</div>';
        }

        if (deathParts.length > 0) {
            html += '<div class="events-row__death">' +
                deathParts.join('<span class="events-row__sep">·</span>') +
                '</div>';
        }

        html += '</div>';
        return html;
    }

    function renderCharacterList(rows) {
        if (!Array.isArray(rows) || rows.length === 0) return '';
        var html = '<div class="events-list">';
        for (var i = 0; i < rows.length; i++) {
            html += renderCharacterRow(rows[i]);
        }
        html += '</div>';
        return html;
    }

    // =========================================================================
    // 5. RECENT EVENTS LIST (optional strip)
    // =========================================================================
    //
    // Input: the shape from EventsViewModels.toRecentEventRows.
    //
    // Output: a small unbordered list. The tab chooses whether to
    // render this strip; the renderer is provided for symmetry.

    function renderRecentEvents(vm) {
        if (!vm) return '';
        if (vm.available !== true) {
            return '<div class="events-recent events-recent--unavailable">' +
                _esc(vm.reason || 'Recent events unavailable.') +
                '</div>';
        }
        if (!Array.isArray(vm.rows) || vm.rows.length === 0) {
            return '<div class="events-recent events-recent--empty">' +
                'No recent events.' +
                '</div>';
        }

        var html = '<div class="events-recent">';
        for (var i = 0; i < vm.rows.length; i++) {
            var row = vm.rows[i];
            if (!row) continue;
            var yearLabel = row.yearLabel || '?';
            html += '<div class="events-recent__row">' +
                '<span class="events-recent__year">' + _esc(yearLabel) + '</span>' +
                '<span class="events-recent__message">' + _esc(row.message) + '</span>' +
                (row.locationName
                    ? '<span class="events-recent__location">' +
                      _esc(row.locationName) + '</span>'
                    : '') +
                '</div>';
        }
        html += '</div>';
        return html;
    }

    // =========================================================================
    // 6. EMPTY STATE
    // =========================================================================
    //
    // `caseId` is one of 'no-context', 'no-characters', 'no-matches',
    // 'no-deaths', 'unavailable'. The message comes from the view
    // model's emptyStateMessage helper (which sources from
    // EventsConstants.UI_COPY).
    //
    // The 'no-context' case additionally renders the sidebar hint:
    // the tab is in "Select a location or enable Show all locations"
    // state, which is different from "no characters exist".

    function renderEmptyState(caseId, options) {
        options = options || {};
        var message = VM.emptyStateMessage(caseId) || 'Nothing to show.';
        var iconName = caseId === 'unavailable'
            ? 'WARNING'
            : caseId === 'no-context'
                ? 'LOCATION'
                : 'PERSON';
        var iconColor = caseId === 'unavailable' ? 'danger' : 'dim';

        var extra = '';
        if (options.extraHint) {
            extra = '<div class="events-empty__sub">' + _esc(options.extraHint) + '</div>';
        }

        return '<div class="events-empty events-empty--' + _esc(caseId) + '">' +
            '<div class="events-empty__icon" style="color:' +
            _esc(_color(iconColor)) + ';" aria-hidden="true">' +
            _icon(iconName) +
            '</div>' +
            '<div class="events-empty__message">' + _esc(message) + '</div>' +
            extra +
            '</div>';
    }

    // =========================================================================
    // 7. UNIFIED TAB BODY RENDERER
    // =========================================================================
    //
    // Renders the full Deaths tab content body — stats bar, optional
    // recent strip, and either the roster list or the empty state.
    // Does NOT render the filter bar (the tab owns that markup,
    // because it needs to bind input handlers). Does NOT render the
    // header (the manager's tab strip provides the header context).
    //
    // Input shape:
    //   {
    //     statsBar: { available, cells, ... } | null,
    //     recentEvents: { available, rows } | null,
    //     rows: [characterRowVm...],
    //     emptyState: 'no-context' | 'no-characters' | 'no-matches'
    //                 | 'no-deaths' | 'unavailable' | null,
    //     emptyStateOptions: { extraHint? } | null
    //   }

    function renderTabBody(input) {
        input = input || {};

        var html = '<div class="events-tab-body">';

        if (input.statsBar) {
            html += renderStatsBar(input.statsBar);
        }

        if (input.emptyState) {
            html += renderEmptyState(input.emptyState, input.emptyStateOptions);
        } else {
            if (input.recentEvents && input.recentEvents.available === true
                && Array.isArray(input.recentEvents.rows)
                && input.recentEvents.rows.length > 0) {
                html += '<div class="events-tab-body__recent">' +
                    '<div class="events-tab-body__recent-header">Recent Activity</div>' +
                    renderRecentEvents(input.recentEvents) +
                    '</div>';
            }

            if (Array.isArray(input.rows) && input.rows.length > 0) {
                html += renderCharacterList(input.rows);
            } else {
                // The tab should have set emptyState; if it did not,
                // render the generic no-matches empty state as a
                // safety net.
                html += renderEmptyState('no-matches');
            }
        }

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.EventsUIList = {
        // Low-level helpers (exposed so tab files can compose their
        // own markup without reaching into this module's internals)
        esc: _esc,
        icon: _icon,
        color: _color,

        // Stats bar
        renderStatsBar: renderStatsBar,

        // Filter option lists
        renderOptionList: renderOptionList,

        // Character list
        renderCharacterRow: renderCharacterRow,
        renderCharacterList: renderCharacterList,

        // Recent events strip
        renderRecentEvents: renderRecentEvents,

        // Empty states
        renderEmptyState: renderEmptyState,

        // Full tab body
        renderTabBody: renderTabBody
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.EventsUIList;
    }
})();
