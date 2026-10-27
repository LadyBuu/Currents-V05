/**
 * =============================================================================
 * STILL WATERS - RELIGION RENDER (religion-render.js)
 * =============================================================================
 *
 * LOCATION: js/religion/religion-render.js
 *
 * Pure renderer for religion lists, cards, and tables.
 *
 * This module is deliberately stupid.
 *
 * It receives prepared view models from ReligionViewModels, escapes strings,
 * and writes HTML. It does not:
 *   - call ReligionQueries
 *   - call ReligionState
 *   - call ReligionCommands
 *   - call accessors
 *   - inspect law or god structure
 *   - resolve location or leader names     (view models do)
 *   - decide fallback labels                (view models do)
 *   - format enums                          (ReligionFormat does; view models
 *                                            call it and pass through)
 *   - emit inline CSS                       (CSS classes only)
 *   - attach per-row listeners              (one delegated listener per
 *                                            container via bindReligionListEvents)
 *
 * ICON POLICY
 * -----------
 * Religion-record icons (row.icon) are data and are rendered verbatim.
 * Chrome icons (chevrons, markers, close buttons) must route through
 * window.getIcon(name). This file currently renders no chrome icons.
 *
 * EVENT BINDING
 * -------------
 * Event binding is opt-in and separate from rendering. Callers call
 * renderReligionList(container, rows, options) to paint, then optionally
 * bindReligionListEvents(container, handlers) to attach the delegated click
 * handler. Binding is guarded by a WeakSet so a container is bound only
 * once, even across re-renders.
 *
 * DEPENDENCIES:
 *   - formatting.js: escapeHtml
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Phase 4: renamed from religion-ui-list.js. Pure renderer. Event
 *            delegation. Per-container refresh. No inline styles.
 *   Phase 6: deleted ReligionRender.getTraitName alias. Kept window.ReligionUI
 *            alias marked for removal.
 *   Phase 7 (current): converge to the reference pattern.
 *     - e.target.closest null guard in all three event branches.
 *     - Refresh timer fallback keyed per container (not container.id).
 *     - Load-time verification.
 *     - Header documents the pure-renderer contract.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window.escapeHtml !== 'function') {
            throw new Error(
                'religion-render.js requires formatting.js (escapeHtml).'
            );
        }
        return window.escapeHtml(str);
    }

    // =========================================================================
    // 2. CSS CLASS HELPERS
    // =========================================================================

    function _traitClass(traitId) {
        return traitId ? ('religion-trait religion-trait--' + traitId) : 'religion-trait';
    }

    function _statusClass(row) {
        return row && row.isDeprecated
            ? 'religion-status religion-status--deprecated'
            : 'religion-status religion-status--active';
    }

    function _statusLabel(row) {
        return (row && row.isDeprecated) ? 'Deprecated' : 'Active';
    }

    // =========================================================================
    // 3. RENDER RELIGION LIST
    // =========================================================================

    function renderReligionList(container, rows, options) {
        if (!container) {
            throw new Error('ReligionRender.renderReligionList: container is required');
        }
        if (!Array.isArray(rows)) {
            throw new Error('ReligionRender.renderReligionList: rows must be an array');
        }

        options = options || {};

        if (rows.length === 0) {
            container.innerHTML = renderEmptyState(
                options.emptyMessage || 'No religions found'
            );
            return;
        }

        var selectedId = options.selectedId || null;
        var showActions = options.showActions !== false;
        var showStats = options.showStats !== false;

        var html = '<div class="religion-list">';

        for (var i = 0; i < rows.length; i++) {
            html += _renderReligionListItem(rows[i], {
                selectedId: selectedId,
                showActions: showActions,
                showStats: showStats
            });
        }

        html += '</div>';

        container.innerHTML = html;
    }

    function _renderReligionListItem(row, opts) {
        var isSelected = (opts.selectedId === row.id);

        var itemClasses = ['religion-item'];
        if (isSelected) itemClasses.push('religion-item--selected');
        if (row.isDeprecated) itemClasses.push('religion-item--deprecated');

        var html = '<div class="' + itemClasses.join(' ') + '"' +
            ' data-religion-id="' + _escapeHtml(row.id) + '">';

        html += '<div class="religion-item__main">';

        if (row.icon) {
            // Religion-record icon. Rendered verbatim. Do not route through
            // getIcon — that is for chrome.
            html += '<span class="religion-item__icon">' + _escapeHtml(row.icon) + '</span>';
        }

        html += '<div class="religion-item__body">';
        html += '<div class="religion-item__header">';
        html += '<span class="religion-item__name">' + _escapeHtml(row.displayName) + '</span>';
        html += '<span class="' + _statusClass(row) + '">' + _escapeHtml(_statusLabel(row)) + '</span>';

        if (row.isOrganized) {
            html += '<span class="religion-item__badge">Organized</span>';
        }

        html += '</div>';

        html += '<div class="religion-item__meta">';
        if (row.traitLabel) {
            html += '<span class="' + _traitClass(row.traitId) + '">' + _escapeHtml(row.traitLabel) + '</span>';
        }
        if (row.leaderName) {
            html += '<span class="religion-item__leader">' + _escapeHtml(row.leaderName) + '</span>';
        }
        if (row.locationNames.length > 0) {
            var locText = row.locationNames.slice(0, 2).join(', ');
            if (row.locationNames.length > 2) {
                locText += ' (+' + (row.locationNames.length - 2) + ')';
            }
            html += '<span class="religion-item__locations">' + _escapeHtml(locText) + '</span>';
        }
        html += '</div>';
        html += '</div>';
        html += '</div>';

        html += '<div class="religion-item__aside">';

        if (opts.showStats) {
            html += '<div class="religion-item__stats">';
            html += '<span class="religion-stat religion-stat--followers" title="Followers">' + row.followerCount + '</span>';
            html += '<span class="religion-stat religion-stat--gods" title="Gods">' + row.godCount + '</span>';
            html += '<span class="religion-stat religion-stat--laws" title="Laws">' + row.lawCount + '</span>';
            html += '<span class="religion-stat religion-stat--places" title="Places of Worship">' + row.placeCount + '</span>';
            html += '</div>';
        }

        if (opts.showActions) {
            html += '<div class="religion-item__actions">';
            html += '<button type="button" class="btn view-religion-btn" data-religion-id="' + _escapeHtml(row.id) + '">View</button>';
            if (!row.isDeprecated) {
                html += '<button type="button" class="btn edit-religion-btn" data-religion-id="' + _escapeHtml(row.id) + '">Edit</button>';
            }
            html += '</div>';
        }

        html += '</div>';

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 4. RENDER RELIGION CARD
    // =========================================================================

    function renderReligionCard(row, options) {
        if (!row) return '';

        options = options || {};
        var compact = options.compact === true;
        var showActions = options.showActions !== false;

        var cardClasses = ['religion-card'];
        if (compact) cardClasses.push('religion-card--compact');

        var html = '<div class="' + cardClasses.join(' ') + '">';

        html += '<div class="religion-card__header">';
        html += '<div class="religion-card__identity">';
        if (row.icon) {
            html += '<span class="religion-card__icon">' + _escapeHtml(row.icon) + '</span>';
        }
        html += '<div>';
        html += '<div class="religion-card__name">' + _escapeHtml(row.displayName) + '</div>';
        if (row.traitLabel) {
            html += '<div class="' + _traitClass(row.traitId) + '">' + _escapeHtml(row.traitLabel) + '</div>';
        }
        html += '</div>';
        html += '</div>';
        html += '<span class="' + _statusClass(row) + '">' + _escapeHtml(_statusLabel(row)) + '</span>';
        html += '</div>';

        if (row.description && !compact) {
            html += '<div class="religion-card__description">' + _escapeHtml(row.description) + '</div>';
        }

        html += '<div class="religion-card__stats">';
        html += '<span class="religion-stat religion-stat--followers">' + row.followerCount + ' followers</span>';
        html += '<span class="religion-stat religion-stat--gods">' + row.godCount + ' gods</span>';
        html += '<span class="religion-stat religion-stat--laws">' + row.lawCount + ' laws</span>';
        html += '<span class="religion-stat religion-stat--places">' + row.placeCount + ' places</span>';
        if (row.leaderName) {
            html += '<span class="religion-card__leader">' + _escapeHtml(row.leaderName) + '</span>';
        }
        html += '</div>';

        if (row.locationNames.length > 0) {
            var locText = row.locationNames.slice(0, 3).join(', ');
            if (row.locationNames.length > 3) {
                locText += ' (+' + (row.locationNames.length - 3) + ')';
            }
            html += '<div class="religion-card__locations">Locations: ' + _escapeHtml(locText) + '</div>';
        }

        if (row.isOrganized) {
            html += '<div class="religion-card__feature">Organized religion</div>';
        }

        if (showActions) {
            html += '<div class="religion-card__actions">';
            html += '<button type="button" class="btn view-religion-btn" data-religion-id="' + _escapeHtml(row.id) + '">View Details</button>';
            if (!row.isDeprecated) {
                html += '<button type="button" class="btn edit-religion-btn" data-religion-id="' + _escapeHtml(row.id) + '">Edit</button>';
            }
            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 5. RENDER RELIGION TABLE
    // =========================================================================

    // Column header labels. These are NOT display-name resolution — display
    // names for values (trait, law type, etc.) come from ReligionFormat via
    // view models. These are just the English column headers.
    var _COLUMN_LABELS = {
        name: 'Name',
        trait: 'Trait',
        followers: 'Followers',
        gods: 'Gods',
        laws: 'Laws',
        places: 'Places',
        leader: 'Leader',
        locations: 'Locations',
        status: 'Status'
    };

    function renderReligionTable(rows, options) {
        options = options || {};
        var columns = options.columns || ['name', 'trait', 'followers', 'gods', 'laws', 'places', 'leader', 'status'];
        var showActions = options.showActions !== false;

        if (!rows || rows.length === 0) {
            return _renderEmptyTable(columns, showActions, options.emptyMessage || 'No religions found');
        }

        var html = '<table class="religion-table">';
        html += '<thead><tr>';
        for (var i = 0; i < columns.length; i++) {
            html += '<th>' + _escapeHtml(_COLUMN_LABELS[columns[i]] || columns[i]) + '</th>';
        }
        if (showActions) {
            html += '<th>Actions</th>';
        }
        html += '</tr></thead>';
        html += '<tbody>';

        for (var r = 0; r < rows.length; r++) {
            var row = rows[r];
            var rowClasses = [];
            if (row.isDeprecated) rowClasses.push('religion-table__row--deprecated');
            html += '<tr class="' + rowClasses.join(' ') + '">';

            for (var c = 0; c < columns.length; c++) {
                html += '<td>' + _renderTableCell(row, columns[c]) + '</td>';
            }

            if (showActions) {
                html += '<td class="religion-table__actions">';
                html += '<button type="button" class="btn view-religion-btn" data-religion-id="' + _escapeHtml(row.id) + '">View</button>';
                if (!row.isDeprecated) {
                    html += '<button type="button" class="btn edit-religion-btn" data-religion-id="' + _escapeHtml(row.id) + '">Edit</button>';
                }
                html += '</td>';
            }

            html += '</tr>';
        }

        html += '</tbody></table>';
        return html;
    }

    function _renderTableCell(row, column) {
        switch (column) {
            case 'name':
                var nameHtml = '';
                if (row.icon) nameHtml += _escapeHtml(row.icon) + ' ';
                nameHtml += _escapeHtml(row.displayName);
                return nameHtml;

            case 'trait':
                if (!row.traitLabel) return '';
                return '<span class="' + _traitClass(row.traitId) + '">' + _escapeHtml(row.traitLabel) + '</span>';

            case 'followers':
                return String(row.followerCount);

            case 'gods':
                return String(row.godCount);

            case 'laws':
                return String(row.lawCount);

            case 'places':
                return String(row.placeCount);

            case 'leader':
                return row.leaderName ? _escapeHtml(row.leaderName) : 'None';

            case 'locations':
                if (!row.locationNames || row.locationNames.length === 0) return 'None';
                return _escapeHtml(row.locationNames.join(', '));

            case 'status':
                return '<span class="' + _statusClass(row) + '">' + _escapeHtml(_statusLabel(row)) + '</span>';

            default:
                return '';
        }
    }

    function _renderEmptyTable(columns, showActions, message) {
        var colspan = columns.length + (showActions ? 1 : 0);
        var html = '<table class="religion-table religion-table--empty">';
        html += '<tbody><tr><td colspan="' + colspan + '" class="religion-table__empty">';
        html += _escapeHtml(message);
        html += '</td></tr></tbody></table>';
        return html;
    }

    // =========================================================================
    // 6. EMPTY STATE
    // =========================================================================

    function renderEmptyState(message) {
        return '<div class="religion-empty">' + _escapeHtml(message) + '</div>';
    }

    // =========================================================================
    // 7. EVENT BINDING (delegated)
    // =========================================================================

    var _boundContainers = typeof WeakSet !== 'undefined' ? new WeakSet() : null;

    function bindReligionListEvents(container, handlers) {
        if (!container || !handlers) return;

        if (_boundContainers) {
            if (_boundContainers.has(container)) return;
            _boundContainers.add(container);
        }

        container.addEventListener('click', function(e) {
            var target = e.target;
            if (!target || typeof target.closest !== 'function') return;

            var viewBtn = target.closest('.view-religion-btn');
            if (viewBtn && container.contains(viewBtn)) {
                e.preventDefault();
                e.stopPropagation();
                if (handlers.onView) {
                    handlers.onView(viewBtn.dataset.religionId);
                }
                return;
            }

            var editBtn = target.closest('.edit-religion-btn');
            if (editBtn && container.contains(editBtn)) {
                e.preventDefault();
                e.stopPropagation();
                if (handlers.onEdit) {
                    handlers.onEdit(editBtn.dataset.religionId);
                }
                return;
            }

            var item = target.closest('.religion-item');
            if (item && container.contains(item)) {
                if (handlers.onSelect) {
                    handlers.onSelect(item.dataset.religionId);
                }
            }
        });
    }

    // =========================================================================
    // 8. REFRESH SCHEDULER (per-container)
    // =========================================================================

    var _refreshTimers = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
    var _refreshTimersFallback = {};
    var _fallbackKeyCounter = 0;

    /**
     * Resolve a stable per-container key for the WeakMap fallback path.
     *
     * The previous version keyed by `container.id || 'default'`, which
     * collided for every id-less container. Now each container gets a
     * lazily-assigned unique property.
     */
    function _getContainerKey(container) {
        if (container.__religionRefreshKey) return container.__religionRefreshKey;
        _fallbackKeyCounter++;
        var key = '__religionRefreshKey_' + _fallbackKeyCounter;
        try {
            container.__religionRefreshKey = key;
        } catch (e) {
            // Container is not extensible. Fall back to a non-unique key —
            // refresh will still work, just with possible collision. This
            // is a pathological case (frozen DOM node) and preferable to
            // throwing.
            return 'default';
        }
        return key;
    }

    function refreshReligionList(container, rows, options) {
        if (!container) return;

        var existing;
        if (_refreshTimers) {
            existing = _refreshTimers.get(container);
        } else {
            existing = _refreshTimersFallback[_getContainerKey(container)];
        }

        if (existing) clearTimeout(existing);

        var timer = setTimeout(function() {
            renderReligionList(container, rows, options);

            if (_refreshTimers) {
                _refreshTimers.delete(container);
            } else {
                delete _refreshTimersFallback[_getContainerKey(container)];
            }
        }, 50);

        if (_refreshTimers) {
            _refreshTimers.set(container, timer);
        } else {
            _refreshTimersFallback[_getContainerKey(container)] = timer;
        }
    }

    // =========================================================================
    // 9. LOAD-TIME VERIFICATION
    // =========================================================================

    (function _verifyLoadTimeDependencies() {
        if (typeof window.escapeHtml !== 'function') {
            throw new Error(
                'religion-render.js loaded but window.escapeHtml is missing. ' +
                'Check script tag order (formatting.js must load first).'
            );
        }
    })();

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.ReligionRender = {
        renderReligionList: renderReligionList,
        renderReligionCard: renderReligionCard,
        renderReligionTable: renderReligionTable,
        renderEmptyState: renderEmptyState,
        bindReligionListEvents: bindReligionListEvents,
        refreshReligionList: refreshReligionList
    };

    // Legacy alias. Kept during migration. Removed once external consumers
    // are confirmed migrated.
    if (typeof window.ReligionUI === 'undefined') {
        window.ReligionUI = window.ReligionRender;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ReligionRender: window.ReligionRender };
    }

})();
