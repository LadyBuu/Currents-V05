/**
 * =============================================================================
 * LOCATION UI LIST
 * =============================================================================
 *
 * LOCATION: js/location/location-ui-list.js
 *
 * Renders prepared ViewModels. Does not query the domain.
 * No inline styles. No emoji. No fabricated values. No ASCII glyphs for icons.
 *
 * Depends on (checked at load time):
 *   - LocationViewModels    (data preparation)
 *   - LocationUIState       (transient UI state)
 *   - window.Icons          (icons.js) — read directly so unknown names
 *                           throw rather than silently falling back to
 *                           Icons.CIRCLE
 *
 * Optional, used when present:
 *   - window.escapeHtml     (formatting.js)
 *
 * Icon policy:
 *   Every glyph routes through _icon(name). Names map to the icons.js
 *   vocabulary. _icon throws on unknown names — a wrong icon name is a
 *   programming error, not a UI state to silently paper over. The prior
 *   revision used window.getIcon(name), which falls back to
 *   Icons.CIRCLE when the name is unknown; that masked the fact that
 *   the toggle icon names (CHEVRON_DOWN, CHEVRON_RIGHT) did not exist
 *   in icons.js. This revision uses the existing TRIANGLE_DOWN and
 *   ARROW_RIGHT icons, which do exist, and reads window.Icons directly
 *   so future drift is caught immediately.
 *
 *   window.getIcon is NOT a load-time dependency of this module. It is
 *   present on icons.js and is consumed by other modules, but this file
 *   does not call it. An earlier revision required it at load, which
 *   would have made a future removal of getIcon from icons.js break
 *   this file for no reason. The load-time guard now requires only
 *   window.Icons — the one thing this file actually reads.
 *
 * ICON CHOICES:
 *   EXPANDED   : TRIANGLE_DOWN   (▾)  — standard "expanded" affordance
 *   COLLAPSED  : ARROW_RIGHT     (▶)  — standard "collapsed" affordance
 *
 *   Both are already defined in icons.js. No new SVG assets needed.
 *   The prior CHEVRON_* names did not exist in icons.js; the previous
 *   revision fell through to Icons.CIRCLE for both, so every toggle
 *   rendered as a circle. This revision uses the correct existing names.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Removed the getIcon load-time dependency check. The module
 *       requires window.Icons (which _icon reads directly) but never
 *       calls window.getIcon. The prior guard was a dead dependency:
 *       removing getIcon from icons.js would have broken this file
 *       even though it never used the function.
 *     - Header "Icon policy" section updated to document the removal
 *       and the reasoning.
 *     - No behavioural change to any render path.
 *   Previous revision:
 *     - ICONS.EXPANDED changed from 'CHEVRON_DOWN' to 'TRIANGLE_DOWN'.
 *       ICONS.COLLAPSED changed from 'CHEVRON_RIGHT' to 'ARROW_RIGHT'.
 *       Neither CHEVRON_* name existed in icons.js; the prior revision
 *       fell through to Icons.CIRCLE, so every toggle rendered as a
 *       circle regardless of state.
 *     - _icon(name) now reads window.Icons[name] directly and throws on
 *       unknown names, matching the module's documented contract
 *       ("Missing icon throws — do not silently render a blank glyph").
 *       The prior implementation called window.getIcon(name), which
 *       silently falls back to Icons.CIRCLE.
 *     - window.Icons added to load-time dependency check.
 *     - Header ICON CHOICES section added.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HARD DEPENDENCY CHECKS (load time)
    // =========================================================================

    if (!window.LocationViewModels) {
        throw new Error(
            'location-ui-list.js requires location-view-models.js first.'
        );
    }
    if (!window.LocationUIState) {
        throw new Error(
            'location-ui-list.js requires location-ui-state.js first.'
        );
    }
    if (!window.Icons || typeof window.Icons !== 'object') {
        throw new Error(
            'location-ui-list.js requires icons.js (window.Icons) to load first.'
        );
    }
    // NOTE: window.getIcon is NOT required here. This module reads
    // window.Icons[name] directly in _icon() and throws on unknown
    // names. getIcon (with its CIRCLE fallback) is not called by this
    // file. Requiring it would be a dead dependency — see the header
    // "Icon policy" section.

    var VM = window.LocationViewModels;
    var UI = window.LocationUIState;

    // =========================================================================
    // 2. HELPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(str);
        }
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Returns the SVG markup for a named icon.
     *
     * Reads window.Icons[name] directly and throws on unknown names.
     * The prior implementation called window.getIcon(name), which
     * silently falls back to Icons.CIRCLE. That fallback masked a
     * wrong-icon-name bug for an entire release cycle: every toggle
     * rendered as a circle because CHEVRON_DOWN and CHEVRON_RIGHT did
     * not exist in icons.js. Reading Icons directly and throwing
     * surfaces the same class of bug at the first render, not a month
     * later when someone notices the toggles look wrong.
     *
     * A wrong icon name is a programming error, not a UI state. The
     * module's own docstring already said this; the code now enforces it.
     */
    function _icon(name) {
        var svg = window.Icons[name];
        if (typeof svg !== 'string' || svg.length === 0) {
            throw new Error(
                'location-ui-list.js: unknown icon "' + name +
                '". icons.js does not define this name. Add the SVG to ' +
                'icons.js or use an existing icon name.'
            );
        }
        return svg;
    }

    // Icon vocabulary used by this view. Maps domain meaning to icons.js names.
    //
    // EXPANDED / COLLAPSED: standard triangle/arrow affordances for a
    // tree view. Both are defined in icons.js (TRIANGLE_DOWN, ARROW_RIGHT).
    // The prior CHEVRON_* names did not exist in icons.js and silently
    // fell back to CIRCLE.
    var ICONS = {
        EXPANDED: 'TRIANGLE_DOWN',
        COLLAPSED: 'ARROW_RIGHT',
        LEAF: 'CIRCLE_DOT',
        CAPITAL: 'CROWN',
        DISPUTED: 'WARNING',
        ABANDONED: 'WARNING',
        RUINED: 'WARNING',
        TYPE: 'LOCATION',
        CULTURE: 'CIRCLE_DOT',
        POPULATION: 'PERSON'
    };

    // =========================================================================
    // 3. TREE RENDERING
    // =========================================================================

    function _renderNode(node, selectedId) {
        var hasChildren = node.children && node.children.length > 0;
        var isExpanded = UI.isExpanded(node.id);
        var isSelected = selectedId === node.id;

        var classes = ['location-tree-item', 'depth-' + (node.depth || 0)];
        if (isSelected) classes.push('is-selected');
        if (node.status === 'disputed') classes.push('is-disputed');
        if (node.status === 'abandoned' || node.status === 'ruined') {
            classes.push('is-abandoned');
        }

        var html = '<div class="location-tree-node" data-node-id="' +
            _escapeHtml(node.id) + '">';

        html += '<div class="' + classes.join(' ') +
            '" data-node-id="' + _escapeHtml(node.id) + '">';

        // Toggle.
        html += '<button type="button" class="location-tree-toggle' +
            (hasChildren ? '' : ' is-leaf') +
            '" data-toggle-id="' + _escapeHtml(node.id) + '"' +
            ' aria-label="' +
            (hasChildren
                ? (isExpanded ? 'Collapse' : 'Expand')
                : 'Leaf') +
            '">';
        if (hasChildren) {
            html += '<span class="location-tree-toggle-icon">' +
                (isExpanded
                    ? _icon(ICONS.EXPANDED)
                    : _icon(ICONS.COLLAPSED)) +
                '</span>';
        } else {
            html += '<span class="location-tree-toggle-icon is-leaf-icon">' +
                _icon(ICONS.LEAF) +
                '</span>';
        }
        html += '</button>';

        // Name.
        html += '<span class="location-tree-name">' +
            _escapeHtml(node.name) +
            '</span>';

        // Badges.
        if (node.isCapital) {
            html += '<span class="location-tree-badge badge-capital">' +
                _icon(ICONS.CAPITAL) + ' Capital' +
                '</span>';
        }
        if (node.status === 'disputed') {
            html += '<span class="location-tree-badge badge-disputed">' +
                _icon(ICONS.DISPUTED) + ' Disputed' +
                '</span>';
        }
        if (node.status === 'abandoned') {
            html += '<span class="location-tree-badge badge-abandoned">' +
                _icon(ICONS.ABANDONED) + ' Abandoned' +
                '</span>';
        }
        if (node.status === 'ruined') {
            html += '<span class="location-tree-badge badge-ruined">' +
                _icon(ICONS.RUINED) + ' Ruined' +
                '</span>';
        }
        if (node.typeName) {
            html += '<span class="location-tree-badge badge-type">' +
                _icon(ICONS.TYPE) + ' ' + _escapeHtml(node.typeName) +
                '</span>';
        }
        if (node.cultureLabel) {
            html += '<span class="location-tree-badge badge-culture">' +
                _icon(ICONS.CULTURE) + ' ' +
                _escapeHtml(node.cultureLabel) +
                '</span>';
        }
        if (node.populationLabel) {
            html += '<span class="location-tree-badge badge-population">' +
                _icon(ICONS.POPULATION) + ' ' +
                _escapeHtml(node.populationLabel) +
                '</span>';
        }

        html += '</div>';

        // Children.
        if (hasChildren) {
            html += '<div class="location-tree-children' +
                (isExpanded ? ' is-expanded' : '') +
                '" data-parent-id="' + _escapeHtml(node.id) + '">';
            for (var i = 0; i < node.children.length; i++) {
                html += _renderNode(node.children[i], selectedId);
            }
            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 4. BINDING
    // =========================================================================

    /**
     * Delegated click handler. Replaces toggle glyphs and child visibility
     * without a full re-render, so scroll position and focus are preserved.
     *
     * The container is bound exactly once. Subsequent renderLocationList
     * calls reuse the same handler; the handler reads live UI state.
     */
    function _bindTreeEvents(container, options) {
        if (container._locationTreeBound) return;
        container._locationTreeBound = true;

        container.addEventListener('click', function (e) {
            // Toggle.
            var toggle = e.target.closest && e.target.closest('.location-tree-toggle');
            if (toggle && !toggle.classList.contains('is-leaf')) {
                var id = toggle.getAttribute('data-toggle-id');
                if (id) {
                    UI.toggleExpanded(id);
                    var children = container.querySelector(
                        '.location-tree-children[data-parent-id="' + id + '"]'
                    );
                    var expanded = UI.isExpanded(id);
                    if (children) {
                        children.classList.toggle('is-expanded', expanded);
                    }
                    var glyphHost = toggle.querySelector('.location-tree-toggle-icon');
                    if (glyphHost) {
                        glyphHost.innerHTML = expanded
                            ? _icon(ICONS.EXPANDED)
                            : _icon(ICONS.COLLAPSED);
                    }
                    e.stopPropagation();
                    return;
                }
            }

            // Row select.
            var item = e.target.closest && e.target.closest('.location-tree-item');
            if (item && options.onSelect) {
                var nodeId = item.getAttribute('data-node-id');
                if (nodeId) {
                    UI.setSelectedLocationId(nodeId);
                    options.onSelect(nodeId);
                }
            }
        });
    }

    // =========================================================================
    // 5. PUBLIC RENDERS
    // =========================================================================

    function renderLocationList(containerId, options) {
        options = options || {};
        var container = typeof containerId === 'string'
            ? document.getElementById(containerId)
            : containerId;
        if (!container) return;

        var selectedId = options.selectedId !== undefined
            ? options.selectedId
            : UI.getSelectedLocationId();
        var filters = options.filters || UI.getFilters();

        var tree = VM.buildLocationTree({
            search: filters.searchTerm,
            typeId: filters.typeFilter,
            status: filters.statusFilter
        });

        var html = '';
        for (var i = 0; i < tree.length; i++) {
            html += _renderNode(tree[i], selectedId);
        }

        container.innerHTML = html;
        _bindTreeEvents(container, options);
    }

    function renderHierarchyList(containerId, placeId, options) {
        options = options || {};
        var container = typeof containerId === 'string'
            ? document.getElementById(containerId)
            : containerId;
        if (!container) return;

        var rows = VM.buildHierarchyRows(placeId);
        var html = '<div class="hierarchy-list">';
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            var classes = ['hierarchy-item', 'depth-' + r.depth];
            if (r.isCurrent) classes.push('is-current');
            html += '<div class="' + classes.join(' ') +
                '" data-loc-id="' + _escapeHtml(r.id) + '">';
            html += '<span class="hierarchy-name">' +
                _escapeHtml(r.name) +
                '</span>';
            if (r.isCapital) {
                html += '<span class="location-tree-badge badge-capital">' +
                    _icon(ICONS.CAPITAL) + ' Capital' +
                    '</span>';
            }
            if (r.typeName) {
                html += '<span class="location-tree-badge badge-type">' +
                    _icon(ICONS.TYPE) + ' ' + _escapeHtml(r.typeName) +
                    '</span>';
            }
            if (r.cultureLabel) {
                html += '<span class="location-tree-badge badge-culture">' +
                    _icon(ICONS.CULTURE) + ' ' +
                    _escapeHtml(r.cultureLabel) +
                    '</span>';
            }
            html += '</div>';
        }
        html += '</div>';
        container.innerHTML = html;

        if (options.onSelect && !container._hierarchyBound) {
            container._hierarchyBound = true;
            container.addEventListener('click', function (e) {
                var item = e.target.closest && e.target.closest('.hierarchy-item');
                if (item) {
                    var id = item.getAttribute('data-loc-id');
                    if (id) options.onSelect(id);
                }
            });
        }
    }

    function renderMoveList(containerId, characterId, options) {
        options = options || {};
        var container = typeof containerId === 'string'
            ? document.getElementById(containerId)
            : containerId;
        if (!container) return;

        var rows = VM.buildMoveRows(characterId);
        var html = '<div class="move-list">';
        if (rows.length === 0) {
            html += '<div class="empty-state">No moves recorded</div>';
        } else {
            for (var i = rows.length - 1; i >= 0; i--) {
                var r = rows[i];
                html += '<div class="move-item" data-move-index="' +
                    r.index + '">';
                html += '<div class="move-location">' +
                    _escapeHtml(r.locationName);
                if (r.isBirthMove) {
                    html += ' <span class="location-tree-badge badge-birth">Birth</span>';
                }
                html += '</div>';
                html += '<div class="move-meta">';
                html += '<span class="move-year">' +
                    (r.year === null
                        ? 'year unknown'
                        : _escapeHtml(String(r.year))) +
                    '</span>';
                if (r.fromLocationName) {
                    html += ' <span class="move-from">from ' +
                        _escapeHtml(r.fromLocationName) +
                        '</span>';
                }
                if (r.note) {
                    html += ' <span class="move-note">' +
                        _escapeHtml(r.note) +
                        '</span>';
                }
                html += '</div></div>';
            }
        }
        html += '</div>';
        container.innerHTML = html;

        if (options.onSelect && !container._moveListBound) {
            container._moveListBound = true;
            container.addEventListener('click', function (e) {
                var item = e.target.closest && e.target.closest('.move-item');
                if (item) {
                    var idx = parseInt(
                        item.getAttribute('data-move-index'), 10
                    );
                    if (!isNaN(idx)) options.onSelect(idx);
                }
            });
        }
    }

    function renderLocationCard(containerId, placeId) {
        var container = typeof containerId === 'string'
            ? document.getElementById(containerId)
            : containerId;
        if (!container) return;

        var card = VM.buildLocationCard(placeId);
        if (!card) {
            container.innerHTML =
                '<div class="empty-state">Location not found</div>';
            return;
        }

        var html = '<div class="location-card">';
        html += '<div class="location-card-header">';
        html += '<h4>' + _escapeHtml(card.name);
        if (card.isCapital) {
            html += ' <span class="location-tree-badge badge-capital">' +
                _icon(ICONS.CAPITAL) + ' Capital' +
                '</span>';
        }
        html += '</h4>';
        if (card.typeName) {
            html += '<span class="location-card-type">' +
                _icon(ICONS.TYPE) + ' ' + _escapeHtml(card.typeName) +
                '</span>';
        }
        html += '</div>';
        html += '<dl class="location-card-fields">';
        html += '<dt>Population</dt><dd>' + card.population +
            (card.ownPopulation > 0
                ? ' (' + card.ownPopulation + ' local)'
                : '') +
            '</dd>';
        html += '<dt>Parent</dt><dd>' +
            (card.parentName ? _escapeHtml(card.parentName) : 'None') +
            '</dd>';
        html += '<dt>Status</dt><dd>' +
            (card.status ? _escapeHtml(card.status) : 'Unspecified') +
            '</dd>';
        html += '<dt>Children</dt><dd>' + card.childCount + '</dd>';
        if (card.variableKey) {
            html += '<dt>Key</dt><dd>' +
                _escapeHtml(card.variableKey) +
                '</dd>';
        }
        if (card.cultureLabel) {
            html += '<dt>Culture</dt><dd>' +
                _icon(ICONS.CULTURE) + ' ' + _escapeHtml(card.cultureLabel) +
                '</dd>';
        }
        html += '</dl>';
        if (card.notes) {
            html += '<p class="location-card-notes">' +
                _escapeHtml(card.notes) +
                '</p>';
        }
        html += '</div>';
        container.innerHTML = html;
    }

    // =========================================================================
    // 6. EXPAND / COLLAPSE
    // =========================================================================

    function expandAll(containerId) {
        var container = typeof containerId === 'string'
            ? document.getElementById(containerId)
            : containerId;
        if (!container) return;

        var ids = [];
        container.querySelectorAll('.location-tree-node[data-node-id]')
            .forEach(function (el) {
                ids.push(el.getAttribute('data-node-id'));
            });
        UI.expandAll(ids);

        container.querySelectorAll('.location-tree-children')
            .forEach(function (el) { el.classList.add('is-expanded'); });

        container.querySelectorAll('.location-tree-toggle')
            .forEach(function (el) {
                if (el.classList.contains('is-leaf')) return;
                var glyphHost = el.querySelector('.location-tree-toggle-icon');
                if (glyphHost) glyphHost.innerHTML = _icon(ICONS.EXPANDED);
            });
    }

    function collapseAll(containerId) {
        var container = typeof containerId === 'string'
            ? document.getElementById(containerId)
            : containerId;
        if (!container) return;

        UI.collapseAll();

        container.querySelectorAll('.location-tree-children')
            .forEach(function (el) { el.classList.remove('is-expanded'); });

        container.querySelectorAll('.location-tree-toggle')
            .forEach(function (el) {
                if (el.classList.contains('is-leaf')) return;
                var glyphHost = el.querySelector('.location-tree-toggle-icon');
                if (glyphHost) glyphHost.innerHTML = _icon(ICONS.COLLAPSED);
            });
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.LocationUI = {
        renderLocationList: renderLocationList,
        renderHierarchyList: renderHierarchyList,
        renderMoveList: renderMoveList,
        renderLocationCard: renderLocationCard,
        expandAll: expandAll,
        collapseAll: collapseAll
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.LocationUI;
    }

})();
