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
 *   Base classes (`.events-row`, `.events-list`, `.events-stats-bar`,
 *   `.events-filters`, `.events-empty`, `.events-unavailable`) are
 *   defined by events-deaths-tab.js's own injected stylesheet
 *   (`id="events-deaths-tab-styles"`). Per-facet extras (e.g.
 *   `.events-stork-couple`, `.events-stork-man`) are defined by that
 *   facet's own tab file. This module does NOT inject styles.
 *
 * DEPENDENCIES (required, verified at load):
 *   - EventsViewModels  (for emptyStateMessage)
 *   - window.escapeHtml (from formatting.js)
 *   - window.getIcon    (from icons.js)
 *
 * ICON POLICY: No emojis. No Unicode glyphs. Icons via _icon().
 * =============================================================================
 *
 * REFACTOR HISTORY:
 *   Current revision (Phase 3A):
 *     - Added the stork facet's renderers:
 *         renderChildCircles(children)
 *         renderCoupleRow(vm)
 *         renderManGroup(vm, options)
 *         renderStorkTabBody(input)
 *       The child circles use <button> rather than <span> so they are
 *       keyboard-activatable via the tab's delegated handler. The
 *       couple row shows the pregnancy label only when present (set
 *       by the view model when pregnancy count != child count).
 *     - No behavioural change to any deaths-facet renderer.
 *   Previous revision (initial):
 *     - Created with the deaths facet's renderers
 *       (renderStatsBar, renderOptionList, renderCharacterRow,
 *       renderCharacterList, renderRecentEvents, renderEmptyState,
 *       renderTabBody).
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
    // 3. FILTER BAR OPTION LISTS
    // =========================================================================

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
    // 4. CHARACTER ROW (deaths facet)
    // =========================================================================

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
    // 5. RECENT EVENTS LIST
    // =========================================================================

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

    function renderEmptyState(caseId, options) {
        options = options || {};
        var message = VM.emptyStateMessage(caseId) || 'Nothing to show.';
        var iconName = caseId === 'unavailable'
            ? 'WARNING'
            : caseId === 'no-context'
                ? 'LOCATION'
                : caseId === 'no-couples'
                    ? 'STORK'
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
    // 7. UNIFIED TAB BODY (deaths facet)
    // =========================================================================

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
                html += renderEmptyState('no-matches');
            }
        }

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 8. STORK FACET: CHILD CIRCLES
    // =========================================================================
    //
    // Small circular markers showing one child each. Gender-tinted,
    // deceased-tinted, with tooltip. Rendered as <button> so they
    // are keyboard-activatable; the tab's delegated click handler
    // intercepts data-action="open-character".

    function renderChildCircles(children) {
        if (!Array.isArray(children) || children.length === 0) {
            return '<span class="events-stork-child-circles__empty">No children</span>';
        }
        var html = '<div class="events-stork-child-circles">';
        for (var i = 0; i < children.length; i++) {
            var c = children[i];
            if (!c || !c.id) continue;

            var classes = ['events-stork-child-circles__circle'];
            if (c.isDeceased) classes.push('events-stork-child-circles__circle--deceased');
            if (c.gender === 'male') classes.push('events-stork-child-circles__circle--male');
            else if (c.gender === 'female') classes.push('events-stork-child-circles__circle--female');

            var tooltip = c.displayName;
            if (c.ageLabel && c.ageLabel !== 'Unknown') {
                tooltip += ' (' + c.ageLabel + ')';
            }
            if (c.ageGroup) tooltip += ' · ' + c.ageGroup;
            if (c.isDeceased) tooltip += ' · Deceased';

            html += '<button type="button" class="' +
                _esc(classes.join(' ')) + '" ' +
                'data-action="open-character" data-character-id="' + _esc(c.id) + '" ' +
                'title="' + _esc(tooltip) + '" ' +
                'aria-label="' + _esc(tooltip) + '">' +
                _icon(c.genderIconName) +
                '</button>';
        }
        html += '</div>';
        return html;
    }

    // =========================================================================
    // 9. STORK FACET: COUPLE ROW
    // =========================================================================
    //
    // One row per couple. Layout: rank + woman name + age + location |
    // fertility + children/expected + pregnancy label (if present) |
    // child circles | + Child + Surprise buttons.

    function renderCoupleRow(vm) {
        if (!vm) return '';

        var html = '<div class="events-stork-couple" ' +
            'data-woman-id="' + _esc(vm.womanId) + '">';

        // Identity block
        html += '<div class="events-stork-couple__identity">';
        if (vm.womanRankDisplay) {
            html += '<span class="events-stork-couple__rank">' +
                _esc(vm.womanRankDisplay) + '</span>';
        }
        html += '<span class="events-stork-couple__name">' +
            _esc(vm.womanDisplayName) + '</span>';
        html += '<span class="events-stork-couple__age">(' +
            _esc(vm.womanAgeLabel) + ')</span>';
        if (vm.womanLocationName) {
            html += '<span class="events-stork-couple__location">' +
                _esc(vm.womanLocationName) + '</span>';
        }
        html += '</div>';

        // Stats block
        html += '<div class="events-stork-couple__stats">';
        html += '<span class="events-stork-couple__fertility" ' +
            'title="Fertility modifier">' +
            _esc(String(vm.fertilityPercent)) + '%</span>';

        var countText = String(vm.existingChildCount);
        if (typeof vm.expectedTotal === 'number') {
            countText += ' / ' + vm.expectedTotal;
        }
        html += '<span class="events-stork-couple__count" ' +
            'title="Children / expected total">' +
            _esc(countText) + '</span>';

        if (vm.pregnancyLabel) {
            html += '<span class="events-stork-couple__pregnancies" ' +
                'title="Total pregnancies (including losses)">' +
                _esc(vm.pregnancyLabel) + '</span>';
        }
        html += '</div>';

        // Children block
        html += '<div class="events-stork-couple__children">' +
            renderChildCircles(vm.childCircles) + '</div>';

        // Actions block
        html += '<div class="events-stork-couple__actions">';
        html += '<button type="button" class="events-stork-couple__action" ' +
            'data-action="add-child" ' +
            'data-woman-id="' + _esc(vm.womanId) + '" ' +
            'aria-label="Add child">' +
            _icon('STORK') + '<span>+ Child</span></button>';
        html += '<button type="button" class="events-stork-couple__action events-stork-couple__action--surprise" ' +
            'data-action="surprise-birth" ' +
            'data-woman-id="' + _esc(vm.womanId) + '" ' +
            'aria-label="Surprise birth">' +
            _icon('EVENTS') + '<span>Surprise</span></button>';
        html += '</div>';

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 10. STORK FACET: MAN GROUP (COLLAPSIBLE)
    // =========================================================================

    function renderManGroup(vm, options) {
        if (!vm) return '';
        options = options || {};
        var expanded = options.expanded === true;

        var html = '<div class="events-stork-man" ' +
            'data-man-id="' + _esc(vm.manId) + '">';

        html += '<div class="events-stork-man__header" ' +
            'data-action="toggle-man" data-man-id="' + _esc(vm.manId) + '" ' +
            'role="button" tabindex="0">';

        html += '<span class="events-stork-man__expand-icon" aria-hidden="true">' +
            _icon(expanded ? 'TRIANGLE_DOWN' : 'TRIANGLE_UP') + '</span>';

        if (vm.manRankDisplay) {
            html += '<span class="events-stork-man__rank">' +
                _esc(vm.manRankDisplay) + '</span>';
        }
        html += '<span class="events-stork-man__name">' +
            _esc(vm.manDisplayName) + '</span>';
        html += '<span class="events-stork-man__age">(' +
            _esc(vm.manAgeLabel) + ')</span>';
        if (vm.manLocationName) {
            html += '<span class="events-stork-man__location">' +
                _esc(vm.manLocationName) + '</span>';
        }

        html += '<span class="events-stork-man__stats">' +
            _esc(String(vm.partnerCount)) + ' partner' +
            (vm.partnerCount === 1 ? '' : 's') + ' · ' +
            _esc(String(vm.totalChildren)) + ' children' +
            (typeof vm.totalExpected === 'number'
                ? ' / ' + _esc(String(vm.totalExpected))
                : '') +
            '</span>';

        html += '</div>'; // header

        if (expanded) {
            html += '<div class="events-stork-man__partners">';
            for (var i = 0; i < vm.partners.length; i++) {
                html += renderCoupleRow(vm.partners[i]);
            }
            if (vm.partners.length === 0) {
                html += '<div class="events-stork-man__empty">No partners</div>';
            }
            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 11. STORK FACET: FULL BODY
    // =========================================================================

    function renderStorkTabBody(input) {
        input = input || {};

        var html = '<div class="events-stork-body">';

        if (input.statsBar) {
            html += renderStatsBar(input.statsBar);
        }

        if (input.emptyState) {
            html += renderEmptyState(input.emptyState, input.emptyStateOptions);
        } else if (Array.isArray(input.manGroups) && input.manGroups.length > 0) {
            html += '<div class="events-stork-list">';
            for (var i = 0; i < input.manGroups.length; i++) {
                html += renderManGroup(input.manGroups[i], {
                    expanded: input.expandedMap
                        ? input.expandedMap[input.manGroups[i].manId] === true
                        : true
                });
            }
            html += '</div>';
        } else {
            html += renderEmptyState('no-matches');
        }

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 12. EXPORTS
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

        // Character list (deaths facet)
        renderCharacterRow: renderCharacterRow,
        renderCharacterList: renderCharacterList,

        // Recent events strip
        renderRecentEvents: renderRecentEvents,

        // Empty states
        renderEmptyState: renderEmptyState,

        // Unified body (deaths facet)
        renderTabBody: renderTabBody,

        // Child circles (stork facet)
        renderChildCircles: renderChildCircles,

        // Couple row (stork facet)
        renderCoupleRow: renderCoupleRow,

        // Man group (stork facet)
        renderManGroup: renderManGroup,

        // Full body (stork facet)
        renderStorkTabBody: renderStorkTabBody
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.EventsUIList;
    }
})();
