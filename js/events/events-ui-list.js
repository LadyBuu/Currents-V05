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
 *   `.events-stork-couple`, `.events-stork-man`,
 *   `.events-adoption-row`, `.events-surrogacy-row`) are defined by
 *   that facet's own tab file. This module does NOT inject styles.
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
 *   Current revision (Phase 3C):
 *     - Added the surrogacy facet's renderers:
 *         renderSurrogacyRow(vm)
 *         renderSurrogacyGroup(statusId, statusLabel, rows, statusIconName)
 *         renderSurrogacyTabBody(input)
 *       The row is a TWO-LINE layout:
 *         Line 1: [type icon] [Parent (& Partner)] → [Surrogate]
 *                 [child circles | children summary]
 *         Line 2: [genetic-parent badge] [status badge + year range]
 *                 [Complete] [Cancel]
 *       This is deliberate: the family relationship is the primary
 *       fact (line 1); administrative actions are secondary
 *       (line 2). Trying to cram six columns into one row loses the
 *       relationship at narrow widths.
 *     - Actions per status:
 *         active     Complete + Cancel (both accent/danger bordered)
 *         completed  none (terminal state)
 *         cancelled  none (terminal state)
 *     - The row renders the "Completed with no children recorded"
 *       warning honestly (from the view model's
 *       childrenMissingDespiteCompletion flag) instead of an empty
 *       child-circles block that looks like a rendering bug.
 *     - The children block reuses renderChildCircles (same shape
 *       as the stork facet's child circles) when the arrangement
 *       produced children, and falls back to a childrenSummaryLabel
 *       span when it didn't (or when there are children but the
 *       summaries are missing).
 *     - renderEmptyState gains icon fallbacks for the two new
 *       surrogacy cases:
 *         no-surrogacies         -> GUARDIANSHIP
 *         no-active-surrogacies  -> GUARDIANSHIP
 *     - No behavioural change to any deaths-, stork-, or
 *       adoption-facet renderer.
 *   Previous revision (Phase 3B):
 *     - Added the adoption facet's renderers.
 *   Previous revision (Phase 3A):
 *     - Added the stork facet's renderers.
 *   Initial revision:
 *     - Created with the deaths facet's renderers.
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
                secondaryParts.join('<span class="events-row__sep">\u00b7</span>') +
                '</div>';
        }

        if (deathParts.length > 0) {
            html += '<div class="events-row__death">' +
                deathParts.join('<span class="events-row__sep">\u00b7</span>') +
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
    //
    // Icon selection per case id. The adoption and surrogacy cases
    // fall back to their facet icon so an "empty X" empty state
    // visually matches the facet even when the tab body is fully
    // empty (as opposed to one type group being empty while another
    // is populated).

    function _emptyStateIconName(caseId) {
        if (caseId === 'unavailable') return 'WARNING';
        if (caseId === 'no-context')  return 'LOCATION';
        if (caseId === 'no-couples')  return 'STORK';
        if (caseId === 'no-adoptions') return 'ADOPTION_LEGAL';
        if (caseId === 'no-guardianships') return 'GUARDIANSHIP';
        if (caseId === 'no-foster') return 'HOME';
        if (caseId === 'no-surrogacies') return 'GUARDIANSHIP';
        if (caseId === 'no-active-surrogacies') return 'GUARDIANSHIP';
        return 'PERSON';
    }

    function renderEmptyState(caseId, options) {
        options = options || {};
        var message = VM.emptyStateMessage(caseId) || 'Nothing to show.';
        var iconName = _emptyStateIconName(caseId);
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
    //
    // Reused by the surrogacy facet for the children block, so the
    // visual language is consistent across "children produced by
    // this relationship" surfaces.

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
            if (c.ageGroup) tooltip += ' \u00b7 ' + c.ageGroup;
            if (c.isDeceased) tooltip += ' \u00b7 Deceased';

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
            (vm.partnerCount === 1 ? '' : 's') + ' \u00b7 ' +
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
    // 12. ADOPTION FACET: ROW
    // =========================================================================

    function _renderAdoptionPersonIdentity(displayName, ageLabel, genderIconName, genderColorToken, isDeceased, extraClasses) {
        var classes = _classNames([
            'events-adoption-row__person',
            extraClasses
        ]);

        var html = '<div class="' + _esc(classes) + '">';
        html += '<span class="events-adoption-row__gender-icon" ' +
            'style="color:' + _esc(_color(genderColorToken)) + ';" ' +
            'aria-hidden="true">' +
            _icon(genderIconName) +
            '</span>';
        html += '<span class="events-adoption-row__name">' +
            _esc(displayName) +
            '</span>';
        if (ageLabel && ageLabel !== 'Unknown') {
            html += '<span class="events-adoption-row__age">(' +
                _esc(ageLabel) + ')</span>';
        }
        if (isDeceased) {
            html += '<span class="events-adoption-row__deceased" ' +
                'title="Deceased">' + _icon('DEATHSTARS') + '</span>';
        }
        html += '</div>';
        return html;
    }

    function renderAdoptionRow(vm) {
        if (!vm || !_hasId(vm.id)) return '';

        var statusStyle = 'color:' + _esc(_color(vm.statusColorToken)) + ';';

        var childHtml = _renderAdoptionPersonIdentity(
            vm.childDisplayName,
            vm.childAgeLabel,
            vm.childGenderIconName,
            vm.childGenderColorToken,
            vm.childIsDeceased,
            'events-adoption-row__person--child'
        );

        var adopterHtml = _renderAdoptionPersonIdentity(
            vm.adopterDisplayName,
            vm.adopterAgeLabel,
            vm.adopterGenderIconName,
            vm.adopterGenderColorToken,
            vm.adopterIsDeceased,
            'events-adoption-row__person--adopter'
        );

        var actionsHtml = '';
        if (vm.isActive) {
            actionsHtml +=
                '<button type="button" class="events-adoption-row__action events-adoption-row__action--end" ' +
                'data-action="end-adoption" data-adoption-id="' + _esc(vm.id) + '" ' +
                'aria-label="End adoption">' +
                _icon('X_HEAVY') + '<span>End</span></button>';
        }
        actionsHtml +=
            '<button type="button" class="events-adoption-row__action events-adoption-row__action--edit" ' +
            'data-action="edit-adoption" data-adoption-id="' + _esc(vm.id) + '" ' +
            'aria-label="Edit adoption">' +
            _icon('EDIT') + '<span>Edit</span></button>';

        return '<div class="events-adoption-row" ' +
            'data-adoption-id="' + _esc(vm.id) + '" ' +
            'data-adoption-type="' + _esc(vm.type) + '" ' +
            'data-adoption-status="' + _esc(vm.status) + '">' +
            '<span class="events-adoption-row__type-icon" ' +
            'title="' + _esc(vm.typeLabel) + '" aria-hidden="true">' +
            _icon(vm.typeIconName) +
            '</span>' +
            '<div class="events-adoption-row__child">' + childHtml + '</div>' +
            '<div class="events-adoption-row__adopter">' + adopterHtml + '</div>' +
            '<div class="events-adoption-row__status">' +
            '<span class="events-adoption-row__status-badge" style="' +
            _esc(statusStyle) + '">' +
            _esc(vm.statusLabel) +
            '</span>' +
            '<span class="events-adoption-row__year">' +
            _esc(vm.yearRangeLabel) +
            '</span>' +
            '</div>' +
            '<div class="events-adoption-row__actions">' + actionsHtml + '</div>' +
            '</div>';
    }

    // =========================================================================
    // 13. ADOPTION FACET: GROUPED LIST
    // =========================================================================

    function renderAdoptionGroup(typeId, typeLabel, rows, typeIconName) {
        if (!Array.isArray(rows) || rows.length === 0) return '';

        var html = '<div class="events-adoption-group" data-type="' +
            _esc(typeId) + '">';

        html += '<div class="events-adoption-group__header">' +
            '<span class="events-adoption-group__icon" aria-hidden="true">' +
            _icon(typeIconName) +
            '</span>' +
            '<span class="events-adoption-group__label">' +
            _esc(typeLabel) +
            '</span>' +
            '<span class="events-adoption-group__count">(' +
            _esc(String(rows.length)) + ')</span>' +
            '</div>';

        html += '<div class="events-adoption-group__rows">';
        for (var i = 0; i < rows.length; i++) {
            html += renderAdoptionRow(rows[i]);
        }
        html += '</div>';

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 14. ADOPTION FACET: FULL BODY
    // =========================================================================

    function renderAdoptionTabBody(input) {
        input = input || {};

        var html = '<div class="events-adoption-body">';

        if (input.statsBar) {
            html += renderStatsBar(input.statsBar);
        }

        if (input.emptyState) {
            html += renderEmptyState(input.emptyState, input.emptyStateOptions);
        } else if (Array.isArray(input.typeGroups) && input.typeGroups.length > 0) {
            var renderedAny = false;
            var groupsHtml = '';
            for (var i = 0; i < input.typeGroups.length; i++) {
                var g = input.typeGroups[i];
                if (!g) continue;
                var gHtml = renderAdoptionGroup(
                    g.typeId,
                    g.typeLabel,
                    g.rows,
                    g.typeIconName
                );
                if (gHtml) {
                    groupsHtml += gHtml;
                    renderedAny = true;
                }
            }
            if (renderedAny) {
                html += '<div class="events-adoption-list">' + groupsHtml + '</div>';
            } else {
                html += renderEmptyState('no-matches');
            }
        } else {
            html += renderEmptyState('no-matches');
        }

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 15. SURROGACY FACET: PARTY RENDERING
    // =========================================================================
    //
    // One shaped "party" entry (from the view model's _surrogacyParty
    // helper) rendered as inline HTML: gender icon, name, age,
    // deceased marker. Reused by the row renderer for each of the
    // four party slots.

    function _renderSurrogacyParty(party, extraClasses) {
        if (!party || !party.hasData) {
            return '<span class="' +
                _esc(_classNames(['events-surrogacy-row__party',
                    'events-surrogacy-row__party--unknown',
                    extraClasses])) + '">' +
                '<span class="events-surrogacy-row__name">(unknown)</span>' +
                '</span>';
        }

        var classes = _classNames([
            'events-surrogacy-row__party',
            extraClasses
        ]);

        var html = '<span class="' + _esc(classes) + '">';
        html += '<span class="events-surrogacy-row__gender-icon" ' +
            'style="color:' + _esc(_color(party.genderColorToken)) + ';" ' +
            'aria-hidden="true">' +
            _icon(party.genderIconName) +
            '</span>';
        html += '<span class="events-surrogacy-row__name">' +
            _esc(party.displayName) + '</span>';
        if (party.ageLabel && party.ageLabel !== 'Unknown') {
            html += '<span class="events-surrogacy-row__age">(' +
                _esc(party.ageLabel) + ')</span>';
        }
        if (party.isDeceased) {
            html += '<span class="events-surrogacy-row__deceased" ' +
                'title="Deceased">' + _icon('DEATHSTARS') + '</span>';
        }
        html += '</span>';
        return html;
    }

    // =========================================================================
    // 16. SURROGACY FACET: GENETIC-PARENT BADGE
    // =========================================================================
    //
    // The row's family chain is: [intended parent (+ partner)]
    //   -> [surrogate] -> [children].
    //
    // Below that chain, a small "genetic parents" line makes the
    // family facts explicit:
    //   Traditional  -> "Genetic mother: <surrogate>" (the surrogate
    //                   is the egg donor by definition)
    //   Gestational  -> "Genetic mother: <egg donor>" if egg donor
    //                   present, otherwise "(no egg donor recorded)"
    //   Sperm donor  -> "Genetic father: <donor>" if present,
    //                   otherwise "(no sperm donor recorded)"
    //
    // This is the whole point of showing a surrogacy arrangement on
    // a "who is related to this child" surface: the intended parents
    // may not be the genetic parents, and the row must say so.

    function _renderGeneticParentLine(vm) {
        var parts = [];

        if (vm.surrogateIsGeneticMother) {
            parts.push(
                '<span class="events-surrogacy-row__genetic-label">Genetic mother:</span> ' +
                '<span class="events-surrogacy-row__genetic-name">' +
                _esc(vm.surrogate.displayName) +
                '</span> <span class="events-surrogacy-row__genetic-note">' +
                '(surrogate)</span>'
            );
        } else if (vm.eggDonorIsGeneticMother && vm.eggDonor) {
            parts.push(
                '<span class="events-surrogacy-row__genetic-label">Genetic mother:</span> ' +
                '<span class="events-surrogacy-row__genetic-name">' +
                _esc(vm.eggDonor.displayName) +
                '</span> <span class="events-surrogacy-row__genetic-note">' +
                '(egg donor)</span>'
            );
        }

        if (vm.spermDonorIsGeneticFather && vm.spermDonor) {
            parts.push(
                '<span class="events-surrogacy-row__genetic-label">Genetic father:</span> ' +
                '<span class="events-surrogacy-row__genetic-name">' +
                _esc(vm.spermDonor.displayName) +
                '</span> <span class="events-surrogacy-row__genetic-note">' +
                '(sperm donor)</span>'
            );
        }

        if (parts.length === 0) return '';

        return '<div class="events-surrogacy-row__genetic-parents">' +
            parts.join('<span class="events-surrogacy-row__sep">\u00b7</span>') +
            '</div>';
    }

    // =========================================================================
    // 17. SURROGACY FACET: ROW
    // =========================================================================
    //
    // Two-line layout.
    //
    // Line 1 (relationship): [type icon] [Parent (& Partner)]
    //                       → [Surrogate] [children block]
    // Line 2 (administration): [genetic parents line]
    //                          [status badge + year range] [actions]
    //
    // Actions per status:
    //   active     Complete + Cancel (both prominent)
    //   completed  none
    //   cancelled  none
    //
    // The "Completed with no children recorded" warning renders
    // inline in the children block when that case applies (a
    // legitimate state produced by completeSurrogacyArrangement when
    // an arrangement was created with a future birthYear and then
    // completed without children actually being recorded). Rendering
    // that warning honestly is the point of the flag; hiding it
    // behind "No children" would erase a data quality issue.

    function renderSurrogacyRow(vm) {
        if (!vm || !_hasId(vm.id)) return '';

        var statusStyle = 'color:' + _esc(_color(vm.statusColorToken)) + ';';

        // Line 1: relationship
        var originatorHtml = _renderSurrogacyParty(
            vm.intendedParent,
            'events-surrogacy-row__party--intended'
        );
        if (vm.intendedPartner && vm.intendedPartner.hasData) {
            originatorHtml +=
                '<span class="events-surrogacy-row__pair-sep" aria-hidden="true">' +
                '&amp;' +
                '</span>' +
                _renderSurrogacyParty(
                    vm.intendedPartner,
                    'events-surrogacy-row__party--partner'
                );
        }

        var surrogateHtml = _renderSurrogacyParty(
            vm.surrogate,
            'events-surrogacy-row__party--surrogate'
        );

        var childrenHtml;
        if (vm.childrenMissingDespiteCompletion) {
            childrenHtml =
                '<span class="events-surrogacy-row__warning" ' +
                'title="A completed arrangement with no children recorded">' +
                _icon('WARNING') +
                '<span>Completed with no children recorded</span>' +
                '</span>';
        } else if (vm.childCircles.length > 0) {
            childrenHtml = renderChildCircles(vm.childCircles);
        } else if (vm.childrenSummaryLabel) {
            childrenHtml = '<span class="events-surrogacy-row__no-children">' +
                _esc(vm.childrenSummaryLabel) +
                '</span>';
        } else {
            childrenHtml = '';
        }

        // Line 2: administration
        var geneticLineHtml = _renderGeneticParentLine(vm);

        var actionsHtml = '';
        if (vm.isActive) {
            actionsHtml +=
                '<button type="button" class="events-surrogacy-row__action events-surrogacy-row__action--complete" ' +
                'data-action="complete-surrogacy" data-surrogacy-id="' + _esc(vm.id) + '" ' +
                'aria-label="Complete arrangement">' +
                _icon('CHECK_SIMPLE') + '<span>Complete</span></button>';
            actionsHtml +=
                '<button type="button" class="events-surrogacy-row__action events-surrogacy-row__action--cancel" ' +
                'data-action="cancel-surrogacy" data-surrogacy-id="' + _esc(vm.id) + '" ' +
                'aria-label="Cancel arrangement">' +
                _icon('X_HEAVY') + '<span>Cancel</span></button>';
        }

        // Row-level class: active rows are visually distinct (the
        // tab's CSS colors the left border by status).
        var rowClasses = _classNames([
            'events-surrogacy-row',
            'events-surrogacy-row--' + vm.status
        ]);

        return '<div class="' + _esc(rowClasses) + '" ' +
            'data-surrogacy-id="' + _esc(vm.id) + '" ' +
            'data-surrogacy-status="' + _esc(vm.status) + '" ' +
            'data-surrogacy-type="' + _esc(vm.type) + '">' +

            // Line 1
            '<div class="events-surrogacy-row__line1">' +
            '<span class="events-surrogacy-row__type-icon" ' +
            'title="' + _esc(vm.typeLabel) + '" aria-hidden="true">' +
            _icon(vm.typeIconName) +
            '</span>' +
            '<div class="events-surrogacy-row__originators">' +
            originatorHtml +
            '</div>' +
            '<span class="events-surrogacy-row__arrow" aria-hidden="true">' +
            _icon('ARROW_RIGHT') +
            '</span>' +
            '<div class="events-surrogacy-row__surrogate">' +
            surrogateHtml +
            '</div>' +
            '<div class="events-surrogacy-row__children">' +
            childrenHtml +
            '</div>' +
            '</div>' +

            // Line 2
            '<div class="events-surrogacy-row__line2">' +
            geneticLineHtml +
            '<div class="events-surrogacy-row__status">' +
            '<span class="events-surrogacy-row__status-badge" style="' +
            _esc(statusStyle) + '">' +
            _icon(vm.statusIconName) + ' ' + _esc(vm.statusLabel) +
            '</span>' +
            '<span class="events-surrogacy-row__year">' +
            _esc(vm.yearRangeLabel) +
            '</span>' +
            '</div>' +
            '<div class="events-surrogacy-row__actions">' +
            actionsHtml +
            '</div>' +
            '</div>' +

            '</div>';
    }

    // =========================================================================
    // 18. SURROGACY FACET: GROUPED LIST
    // =========================================================================
    //
    // The surrogacy list is grouped by STATUS (active -> completed
    // -> cancelled). Within each group the tab does its own sorting;
    // this renderer only emits the group and its rows. Empty groups
    // are omitted entirely (the tab does not call this with an empty
    // rows array; the guard is defensive).

    function renderSurrogacyGroup(statusId, statusLabel, rows, statusIconName) {
        if (!Array.isArray(rows) || rows.length === 0) return '';

        var html = '<div class="events-surrogacy-group" data-status="' +
            _esc(statusId) + '">';

        html += '<div class="events-surrogacy-group__header">' +
            '<span class="events-surrogacy-group__icon" aria-hidden="true">' +
            _icon(statusIconName) +
            '</span>' +
            '<span class="events-surrogacy-group__label">' +
            _esc(statusLabel) +
            '</span>' +
            '<span class="events-surrogacy-group__count">(' +
            _esc(String(rows.length)) + ')</span>' +
            '</div>';

        html += '<div class="events-surrogacy-group__rows">';
        for (var i = 0; i < rows.length; i++) {
            html += renderSurrogacyRow(rows[i]);
        }
        html += '</div>';

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 19. SURROGACY FACET: FULL BODY
    // =========================================================================
    //
    // Accepts:
    //   statsBar           surrogacy-specific stats bar VM (pre-computed
    //                      by the tab via toSurrogacyStatsBarViewModel).
    //   statusGroups       array of
    //                        { statusId, statusLabel, statusIconName,
    //                          rows: [row] }
    //                      Empty groups are omitted.
    //   emptyState         case id
    //   emptyStateOptions  { extraHint? }
    //
    // If emptyState is set, the status groups are ignored. If
    // emptyState is null and statusGroups has at least one non-empty
    // group, the groups render. If emptyState is null and every
    // group is empty, the renderer falls back to a no-matches empty
    // state (defensive; the tab should have set emptyState before
    // calling).

    function renderSurrogacyTabBody(input) {
        input = input || {};

        var html = '<div class="events-surrogacy-body">';

        if (input.statsBar) {
            html += renderStatsBar(input.statsBar);
        }

        if (input.emptyState) {
            html += renderEmptyState(input.emptyState, input.emptyStateOptions);
        } else if (Array.isArray(input.statusGroups) && input.statusGroups.length > 0) {
            var renderedAny = false;
            var groupsHtml = '';
            for (var i = 0; i < input.statusGroups.length; i++) {
                var g = input.statusGroups[i];
                if (!g) continue;
                var gHtml = renderSurrogacyGroup(
                    g.statusId,
                    g.statusLabel,
                    g.rows,
                    g.statusIconName
                );
                if (gHtml) {
                    groupsHtml += gHtml;
                    renderedAny = true;
                }
            }
            if (renderedAny) {
                html += '<div class="events-surrogacy-list">' + groupsHtml + '</div>';
            } else {
                html += renderEmptyState('no-matches');
            }
        } else {
            html += renderEmptyState('no-matches');
        }

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 20. EXPORTS
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

        // Child circles (stork + surrogacy facets)
        renderChildCircles: renderChildCircles,

        // Couple row (stork facet)
        renderCoupleRow: renderCoupleRow,

        // Man group (stork facet)
        renderManGroup: renderManGroup,

        // Full body (stork facet)
        renderStorkTabBody: renderStorkTabBody,

        // Adoption facet
        renderAdoptionRow: renderAdoptionRow,
        renderAdoptionGroup: renderAdoptionGroup,
        renderAdoptionTabBody: renderAdoptionTabBody,

        // Surrogacy facet
        renderSurrogacyRow: renderSurrogacyRow,
        renderSurrogacyGroup: renderSurrogacyGroup,
        renderSurrogacyTabBody: renderSurrogacyTabBody
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.EventsUIList;
    }
})();
