/**
 * =============================================================================
 * LOCATION UI LIST
 * =============================================================================
 *
 * Renders prepared ViewModels. Does not query the domain.
 * No inline styles. No emoji. No fabricated values.
 *
 * Depends on:
 *   - LocationViewModels (data)
 *   - LocationUIState    (transient UI state)
 *
 * =============================================================================
 */

(function () {
    'use strict';

    function _vm() {
        if (!window.LocationViewModels) throw new Error('LocationUI: LocationViewModels required');
        return window.LocationViewModels;
    }
    function _uiState() {
        if (!window.LocationUIState) throw new Error('LocationUI: LocationUIState required');
        return window.LocationUIState;
    }
    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _renderNode(node, selectedId) {
        var hasChildren = node.children && node.children.length > 0;
        var isExpanded = _uiState().isExpanded(node.id);
        var isSelected = selectedId === node.id;

        var classes = ['location-tree-item', 'depth-' + (node.depth || 0)];
        if (isSelected) classes.push('is-selected');
        if (node.status === 'disputed') classes.push('is-disputed');
        if (node.status === 'abandoned' || node.status === 'ruined') classes.push('is-abandoned');

        var html = '<div class="location-tree-node" data-node-id="' + _escapeHtml(node.id) + '">';
        html += '<div class="' + classes.join(' ') + '" data-node-id="' + _escapeHtml(node.id) + '">';
        html += '<button type="button" class="location-tree-toggle' +
            (hasChildren ? '' : ' is-leaf') + '" data-toggle-id="' + _escapeHtml(node.id) + '">' +
            (hasChildren ? (isExpanded ? 'v' : '>') : '') + '</button>';
        html += '<span class="location-tree-name">' + _escapeHtml(node.name) + '</span>';
        if (node.isCapital) html += '<span class="location-tree-badge badge-capital">Capital</span>';
        if (node.status === 'disputed') html += '<span class="location-tree-badge badge-disputed">Disputed</span>';
        if (node.status === 'abandoned') html += '<span class="location-tree-badge badge-abandoned">Abandoned</span>';
        if (node.status === 'ruined') html += '<span class="location-tree-badge badge-ruined">Ruined</span>';
        if (node.typeName) html += '<span class="location-tree-badge badge-type">' + _escapeHtml(node.typeName) + '</span>';
        if (node.cultureLabel) html += '<span class="location-tree-badge badge-culture">' + _escapeHtml(node.cultureLabel) + '</span>';
        if (node.populationLabel) html += '<span class="location-tree-badge badge-population">' + _escapeHtml(node.populationLabel) + '</span>';
        html += '</div>';

        if (hasChildren) {
            html += '<div class="location-tree-children' + (isExpanded ? ' is-expanded' : '') +
                '" data-parent-id="' + _escapeHtml(node.id) + '">';
            for (var i = 0; i < node.children.length; i++) {
                html += _renderNode(node.children[i], selectedId);
            }
            html += '</div>';
        }
        html += '</div>';
        return html;
    }

    function renderLocationList(containerId, options) {
        options = options || {};
        var container = document.getElementById(containerId);
        if (!container) return;

        var selectedId = options.selectedId !== undefined
            ? options.selectedId
            : _uiState().getSelectedLocationId();
        var filters = options.filters || _uiState().getFilters();

        var tree = _vm().buildLocationTree({
            search: filters.searchTerm,
            typeId: filters.typeFilter,
            status: filters.statusFilter
        });

        var html = '';
        for (var i = 0; i < tree.length; i++) {
            html += _renderNode(tree[i], selectedId);
        }

        container.innerHTML = html;
        _bindTreeEvents(container, options.onSelect);
    }

    function _bindTreeEvents(container, onSelect) {
        if (container._locationTreeBound) return;
        container._locationTreeBound = true;

        container.addEventListener('click', function (e) {
            var toggle = e.target.closest && e.target.closest('.location-tree-toggle');
            if (toggle && !toggle.classList.contains('is-leaf')) {
                var id = toggle.getAttribute('data-toggle-id');
                if (id) {
                    _uiState().toggleExpanded(id);
                    var children = container.querySelector(
                        '.location-tree-children[data-parent-id="' + id + '"]'
                    );
                    var expanded = _uiState().isExpanded(id);
                    if (children) children.classList.toggle('is-expanded', expanded);
                    toggle.textContent = expanded ? 'v' : '>';
                    e.stopPropagation();
                    return;
                }
            }
            var item = e.target.closest && e.target.closest('.location-tree-item');
            if (item && onSelect) {
                var nodeId = item.getAttribute('data-node-id');
                if (nodeId) {
                    _uiState().setSelectedLocationId(nodeId);
                    onSelect(nodeId);
                }
            }
        });
    }

    function renderHierarchyList(containerId, placeId, options) {
        options = options || {};
        var container = document.getElementById(containerId);
        if (!container) return;

        var rows = _vm().buildHierarchyRows(placeId);
        var html = '<div class="hierarchy-list">';
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            var classes = ['hierarchy-item', 'depth-' + r.depth];
            if (r.isCurrent) classes.push('is-current');
            html += '<div class="' + classes.join(' ') + '" data-loc-id="' + _escapeHtml(r.id) + '">';
            html += '<span class="hierarchy-name">' + _escapeHtml(r.name) + '</span>';
            if (r.isCapital) html += '<span class="location-tree-badge badge-capital">Capital</span>';
            if (r.typeName) html += '<span class="location-tree-badge badge-type">' + _escapeHtml(r.typeName) + '</span>';
            if (r.cultureLabel) html += '<span class="location-tree-badge badge-culture">' + _escapeHtml(r.cultureLabel) + '</span>';
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
        var container = document.getElementById(containerId);
        if (!container) return;

        var rows = _vm().buildMoveRows(characterId);
        var html = '<div class="move-list">';
        if (rows.length === 0) {
            html += '<div class="empty-state">No moves recorded</div>';
        } else {
            for (var i = rows.length - 1; i >= 0; i--) {
                var r = rows[i];
                html += '<div class="move-item" data-move-index="' + r.index + '">';
                html += '<div class="move-location">' + _escapeHtml(r.locationName);
                if (r.isBirthMove) html += ' <span class="location-tree-badge badge-birth">Birth</span>';
                html += '</div>';
                html += '<div class="move-meta">';
                html += '<span class="move-year">' + (r.year === null ? 'year unknown' : _escapeHtml(String(r.year))) + '</span>';
                if (r.fromLocationName) html += ' <span class="move-from">from ' + _escapeHtml(r.fromLocationName) + '</span>';
                if (r.note) html += ' <span class="move-note">' + _escapeHtml(r.note) + '</span>';
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
                    var idx = parseInt(item.getAttribute('data-move-index'), 10);
                    if (!isNaN(idx)) options.onSelect(idx);
                }
            });
        }
    }

    function renderLocationCard(containerId, placeId) {
        var container = document.getElementById(containerId);
        if (!container) return;

        var card = _vm().buildLocationCard(placeId);
        if (!card) {
            container.innerHTML = '<div class="empty-state">Location not found</div>';
            return;
        }

        var html = '<div class="location-card">';
        html += '<div class="location-card-header">';
        html += '<h4>' + _escapeHtml(card.name);
        if (card.isCapital) html += ' <span class="location-tree-badge badge-capital">Capital</span>';
        html += '</h4>';
        if (card.typeName) html += '<span class="location-card-type">' + _escapeHtml(card.typeName) + '</span>';
        html += '</div>';
        html += '<dl class="location-card-fields">';
        html += '<dt>Population</dt><dd>' + card.population +
            (card.ownPopulation > 0 ? ' (' + card.ownPopulation + ' local)' : '') + '</dd>';
        html += '<dt>Parent</dt><dd>' + (card.parentName ? _escapeHtml(card.parentName) : 'None') + '</dd>';
        html += '<dt>Status</dt><dd>' + (card.status ? _escapeHtml(card.status) : 'Unspecified') + '</dd>';
        html += '<dt>Children</dt><dd>' + card.childCount + '</dd>';
        if (card.variableKey) html += '<dt>Key</dt><dd>' + _escapeHtml(card.variableKey) + '</dd>';
        if (card.cultureLabel) html += '<dt>Culture</dt><dd>' + _escapeHtml(card.cultureLabel) + '</dd>';
        html += '</dl>';
        if (card.notes) html += '<p class="location-card-notes">' + _escapeHtml(card.notes) + '</p>';
        html += '</div>';
        container.innerHTML = html;
    }

    function expandAll(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;
        var ids = [];
        container.querySelectorAll('.location-tree-node[data-node-id]').forEach(function (el) {
            ids.push(el.getAttribute('data-node-id'));
        });
        _uiState().expandAll(ids);
        container.querySelectorAll('.location-tree-children').forEach(function (el) { el.classList.add('is-expanded'); });
        container.querySelectorAll('.location-tree-toggle').forEach(function (el) {
            if (!el.classList.contains('is-leaf')) el.textContent = 'v';
        });
    }

    function collapseAll(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;
        _uiState().collapseAll();
        container.querySelectorAll('.location-tree-children').forEach(function (el) { el.classList.remove('is-expanded'); });
        container.querySelectorAll('.location-tree-toggle').forEach(function (el) {
            if (!el.classList.contains('is-leaf')) el.textContent = '>';
        });
    }

    window.LocationUI = {
        renderLocationList: renderLocationList,
        renderHierarchyList: renderHierarchyList,
        renderMoveList: renderMoveList,
        renderLocationCard: renderLocationCard,
        expandAll: expandAll,
        collapseAll: collapseAll
    };

})();
