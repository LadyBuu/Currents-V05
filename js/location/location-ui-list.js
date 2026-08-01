/**
 * =============================================================================
 * LOCATION UI LIST - UI list rendering for locations and moves
 * =============================================================================
 * 
 * LOCATION: js/location/location-ui-list.js
 * 
 * Responsibilities:
 * - Render FULLY NESTED hierarchical location lists
 * - Render location cards
 * - Render move lists
 * - Handle selection and expansion
 * - Display culture association
 * - Expand/collapse with localStorage persistence
 * 
 * DEPENDENCIES:
 *   - LocationState (public API)
 *   - Core wrappers from modals-core.js
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _rendering = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS (Using core wrappers)
    // =========================================================================

    function _escapeHtml(str) {
        return typeof window._escapeHtml === 'function' ? window._escapeHtml(str) : (str || '');
    }

    function _getIcon(name) {
        return typeof window._getIcon === 'function' ? window._getIcon(name) : '';
    }

    function _getIconSafe(name) {
        return typeof window._getIconSafe === 'function' ? window._getIconSafe(name) : '';
    }

    function _getPlaceById(id) {
        return typeof window._getPlaceById === 'function' ? window._getPlaceById(id) : null;
    }

    function _getCharacterById(id) {
        return typeof window._getCharacterById === 'function' ? window._getCharacterById(id) : null;
    }

    function _getLocationTypeById(id) {
        return typeof window._getLocationTypeById === 'function' ? window._getLocationTypeById(id) : null;
    }

    function _getLocationTypePriority(typeId) {
        return typeof window._getLocationTypePriority === 'function' ? window._getLocationTypePriority(typeId) : 5;
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        }
    }

    function _getCultureName(cultureId) {
        if (!cultureId) return null;
        try {
            if (typeof window.CultureState !== 'undefined' &&
                typeof window.CultureState.getCulture === 'function') {
                var culture = window.CultureState.getCulture(cultureId);
                return culture ? (culture.displayName || culture.name) : null;
            }
        } catch (e) {
            // CultureState not available, ignore
        }
        return null;
    }

    function _getCultureIcon(cultureId) {
        if (!cultureId) return null;
        try {
            if (typeof window.CultureState !== 'undefined' &&
                typeof window.CultureState.getCulture === 'function') {
                var culture = window.CultureState.getCulture(cultureId);
                return culture ? (culture.icon || '✦') : null;
            }
        } catch (e) {
            // CultureState not available, ignore
        }
        return null;
    }

    // =========================================================================
    // 3. STORAGE KEYS
    // =========================================================================

    var STORAGE_KEY = 'location_tree_expanded';

    function _getExpandedState() {
        try {
            var stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                var parsed = JSON.parse(stored);
                return parsed || {};
            }
        } catch (e) {
            // Ignore
        }
        return {};
    }

    function _saveExpandedState(expanded) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(expanded));
        } catch (e) {
            // Ignore
        }
    }

    // =========================================================================
    // 4. BUILD LOCATION TREE
    // =========================================================================

    function _buildLocationTree(places) {
        var locationMap = {};
        var roots = [];

        for (var i = 0; i < places.length; i++) {
            var p = places[i];
            var priority = LocationState.getLocationTypePriority(p.typeId);
            locationMap[p.id] = {
                id: p.id,
                name: p.displayName,
                typeId: p.typeId,
                priority: priority,
                parentId: p.parentId || null,
                isCapital: p.isCapital || false,
                status: p.status || 'active',
                cultureId: p.cultureId || null,
                population: LocationState.getOwnPopulation(p.id, false),
                totalPopulation: LocationState.getPopulationCount(p.id, false),
                children: [],
                variableKey: p.variableKey || null,
                notes: p.notes || null
            };
        }

        for (var id in locationMap) {
            if (locationMap.hasOwnProperty(id)) {
                var node = locationMap[id];
                if (node.parentId && locationMap[node.parentId]) {
                    locationMap[node.parentId].children.push(node);
                } else {
                    roots.push(node);
                }
            }
        }

        function sortNodes(nodes) {
            nodes.sort(function(a, b) {
                if (a.priority !== b.priority) return a.priority - b.priority;
                return a.name.localeCompare(b.name);
            });
            for (var i = 0; i < nodes.length; i++) {
                if (nodes[i].children && nodes[i].children.length > 0) {
                    sortNodes(nodes[i].children);
                }
            }
        }
        sortNodes(roots);

        return roots;
    }

    // =========================================================================
    // 5. RENDER FULLY NESTED LOCATION LIST
    // =========================================================================

    function renderLocationList(containerId, options) {
        if (_rendering) {
            return;
        }
        _rendering = true;

        try {
            options = options || {};
            var container = document.getElementById(containerId);
            if (!container) {
                _rendering = false;
                return;
            }

            var onSelect = options.onSelect || null;
            var selectedId = options.selectedId || null;
            var searchTerm = options.searchTerm || '';
            var typeFilter = options.typeFilter || '';
            var statusFilter = options.statusFilter || '';
            var showCulture = options.showCulture !== undefined ? options.showCulture : true;
            var showPopulation = options.showPopulation !== undefined ? options.showPopulation : true;

            var places = LocationState.getAllPlaces({ includeDeprecated: false });

            if (searchTerm || typeFilter || statusFilter) {
                var filteredIds = new Set();
                var allPlaces = places;

                for (var i = 0; i < allPlaces.length; i++) {
                    var p = allPlaces[i];
                    var match = true;

                    if (searchTerm) {
                        var lower = searchTerm.toLowerCase();
                        var nameMatch = p.displayName.toLowerCase().indexOf(lower) !== -1;
                        var keyMatch = p.variableKey && p.variableKey.toLowerCase().indexOf(lower) !== -1;
                        if (!nameMatch && !keyMatch) {
                            match = false;
                        }
                    }

                    if (match && typeFilter && p.typeId !== typeFilter) {
                        match = false;
                    }

                    if (match && statusFilter && p.status !== statusFilter) {
                        match = false;
                    }

                    if (match) {
                        filteredIds.add(p.id);
                        var hierarchy = LocationState.getPlaceHierarchy(p.id);
                        for (var j = 0; j < hierarchy.length; j++) {
                            filteredIds.add(hierarchy[j].id);
                        }
                    }
                }

                var filteredPlaces = [];
                for (var i = 0; i < allPlaces.length; i++) {
                    if (filteredIds.has(allPlaces[i].id)) {
                        filteredPlaces.push(allPlaces[i]);
                    }
                }
                places = filteredPlaces;
            }

            var tree = _buildLocationTree(places);
            var expandedState = _getExpandedState();

            var html = _renderNestedList(tree, selectedId, expandedState, 0, showCulture, showPopulation);
            container.innerHTML = html;

            container.dataset.expanded = JSON.stringify(expandedState);
            _attachNestedListEvents(container, onSelect);

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 6. RENDER NESTED LIST - CLEAN INDENTATION (NO LINES)
    // =========================================================================

    function _renderNestedList(nodes, selectedId, expandedState, depth, showCulture, showPopulation) {
        var html = '';

        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            var isSelected = (selectedId === node.id);
            var isExpanded = expandedState[node.id] === true;
            var hasChildren = node.children && node.children.length > 0;
            var type = _getLocationTypeById(node.typeId);
            var typeIcon = (type && type.icon) ? type.icon : '';

            // INDENTATION ONLY - no lines
            var paddingLeft = 8 + (depth * 16);

            // Culture badge
            var cultureBadge = '';
            if (showCulture && node.cultureId) {
                var cultureName = _getCultureName(node.cultureId);
                if (cultureName) {
                    cultureBadge = '<span class="location-tree-badge culture">' +
                        _escapeHtml(cultureName) +
                        '</span>';
                }
            }

            // Population display
            var popDisplay = '';
            if (showPopulation && node.totalPopulation > 0) {
                var popText = node.totalPopulation >= 1000 ? 
                    (node.totalPopulation / 1000).toFixed(1) + 'k' : 
                    node.totalPopulation;
                popDisplay = '<span class="location-tree-badge population">' +
                    popText +
                    '</span>';
            }

            var statusBadge = '';
            if (node.status === 'disputed') {
                statusBadge = '<span class="location-tree-badge disputed">⚡</span>';
            } else if (node.status === 'abandoned') {
                statusBadge = '<span class="location-tree-badge abandoned">🏚️</span>';
            } else if (node.status === 'ruined') {
                statusBadge = '<span class="location-tree-badge ruined">💀</span>';
            }

            var capitalBadge = node.isCapital ? 
                '<span class="location-tree-badge capital">⭐</span>' : '';

            var typeBadge = type ? 
                '<span class="location-tree-badge type">' + _escapeHtml(type.displayName) + '</span>' : '';

            var toggleHtml = '';
            if (hasChildren) {
                toggleHtml = '<span class="location-tree-toggle" data-node-id="' + node.id + '">' + 
                    (isExpanded ? '▼' : '▶') + 
                    '</span>';
            } else {
                toggleHtml = '<span class="location-tree-toggle leaf">▶</span>';
            }

            var rowClass = 'location-tree-item depth-' + depth;
            if (isSelected) rowClass += ' selected';
            if (node.status === 'disputed') rowClass += ' disputed';
            if (node.status === 'abandoned' || node.status === 'ruined') rowClass += ' abandoned';

            // Row HTML - INDENTATION ONLY (no lines)
            html += '<div class="location-tree-node">';
            html += '<div class="' + rowClass + '" data-node-id="' + node.id + '" style="padding-left:' + paddingLeft + 'px;">';
            html += toggleHtml;
            html += '<span class="location-tree-name">' + _escapeHtml(node.name) + '</span>';
            html += capitalBadge;
            html += statusBadge;
            html += typeBadge;
            html += cultureBadge;
            html += popDisplay;
            html += '</div>';

            if (hasChildren && isExpanded) {
                var childHtml = _renderNestedList(
                    node.children,
                    selectedId,
                    expandedState,
                    depth + 1,
                    showCulture,
                    showPopulation
                );
                html += '<div class="location-tree-children" data-parent-id="' + node.id + '" style="display:block;">' +
                    childHtml +
                    '</div>';
            } else if (hasChildren && !isExpanded) {
                var childHtml = _renderNestedList(
                    node.children,
                    selectedId,
                    expandedState,
                    depth + 1,
                    showCulture,
                    showPopulation
                );
                html += '<div class="location-tree-children" data-parent-id="' + node.id + '" style="display:none;">' +
                    childHtml +
                    '</div>';
            }

            html += '</div>';
        }

        return html;
    }

    // =========================================================================
    // 7. ATTACH NESTED LIST EVENTS - FIXED
    // =========================================================================

    function _attachNestedListEvents(container, onSelect) {
        var newContainer = container.cloneNode(true);
        container.parentNode.replaceChild(newContainer, container);

        newContainer.addEventListener('click', function(e) {
            var target = e.target;
            var item = target.closest('.location-tree-item');
            
            if (target.classList.contains('location-tree-toggle')) {
                var toggle = target;
                var nodeId = toggle.dataset.nodeId;
                if (!nodeId) return;
                
                e.stopPropagation();
                e.preventDefault();
                
                var parentItem = toggle.closest('.location-tree-item');
                if (!parentItem) return;
                
                var parentNode = parentItem.parentElement;
                if (!parentNode) return;
                
                var childrenContainer = parentNode.querySelector('.location-tree-children[data-parent-id="' + nodeId + '"]');
                if (!childrenContainer) return;
                
                var isExpanded = childrenContainer.style.display !== 'none';
                childrenContainer.style.display = isExpanded ? 'none' : 'block';
                toggle.textContent = isExpanded ? '▶' : '▼';
                
                var expandedState = _getExpandedState();
                if (isExpanded) {
                    delete expandedState[nodeId];
                } else {
                    expandedState[nodeId] = true;
                }
                _saveExpandedState(expandedState);
                
                var treeContainer = toggle.closest('#locationTree, [data-expanded]');
                if (treeContainer) {
                    treeContainer.dataset.expanded = JSON.stringify(expandedState);
                }
                return;
            }
            
            if (item) {
                var nodeId = item.dataset.nodeId;
                if (nodeId && onSelect) {
                    var place = LocationState.getPlace(nodeId);
                    if (place) {
                        onSelect(place);
                    }
                }
            }
        });

        newContainer.addEventListener('mouseenter', function(e) {
            var item = e.target.closest('.location-tree-item');
            if (item && !item.classList.contains('selected')) {
                item.style.background = '#1a2d48';
            }
        }, true);

        newContainer.addEventListener('mouseleave', function(e) {
            var item = e.target.closest('.location-tree-item');
            if (item && !item.classList.contains('selected')) {
                item.style.background = '';
            }
        }, true);

        return newContainer;
    }

    // =========================================================================
    // 8. RENDER HIERARCHY LIST
    // =========================================================================

    function renderHierarchyList(containerId, locationId, options) {
        if (_rendering) {
            return;
        }
        _rendering = true;

        try {
            options = options || {};
            var container = document.getElementById(containerId);
            if (!container) {
                _rendering = false;
                return;
            }

            var onSelect = options.onSelect || null;
            var selectedId = options.selectedId || null;
            var showCulture = options.showCulture !== undefined ? options.showCulture : true;

            var hierarchy = LocationState.getPlaceHierarchy(locationId);

            var html = '<div class="hierarchy-list" style="font-size:0.75rem;">';

            if (hierarchy.length === 0) {
                html += '<div style="text-align:center;padding:20px;color:var(--dim);">No hierarchy found</div>';
            } else {
                for (var i = 0; i < hierarchy.length; i++) {
                    var p = hierarchy[i];
                    var isSelected = (selectedId === p.id);
                    
                    // INDENTATION ONLY
                    var indent = '';
                    for (var j = 0; j < i; j++) {
                        indent += '&nbsp;&nbsp;&nbsp;&nbsp;';
                    }
                    var type = _getLocationTypeById(p.typeId);
                    var typeIcon = (type && type.icon) ? type.icon : '';

                    var cultureBadge = '';
                    if (showCulture && p.cultureId) {
                        var cultureName = _getCultureName(p.cultureId);
                        if (cultureName) {
                            cultureBadge = '<span style="font-size:0.45rem;background:var(--bg2);padding:1px 4px;border-radius:8px;border:1px solid var(--border-light);margin-left:4px;">' +
                                _escapeHtml(cultureName) +
                                '</span>';
                        }
                    }

                    html +=
                        '<div class="hierarchy-item" data-loc-id="' + p.id + '" style="' +
                        'background:' + (isSelected ? 'var(--accent-dim)' : 'transparent') + ';' +
                        'border-left:2px solid ' + (isSelected ? 'var(--accent)' : 'transparent') + ';' +
                        'padding:4px 8px;' +
                        'cursor:pointer;' +
                        'transition:all 0.1s;' +
                        '">' +
                        '<span style="font-size:0.7rem;">' + indent + typeIcon + ' ' + _escapeHtml(p.displayName) + '</span>' +
                        cultureBadge +
                        (p.isCapital ? ' <span style="font-size:0.5rem;color:var(--accent);">⭐ Capital</span>' : '') +
                        '</div>';
                }
            }

            html += '</div>';
            container.innerHTML = html;

            if (onSelect) {
                var items = container.querySelectorAll('.hierarchy-item');
                for (var i = 0; i < items.length; i++) {
                    (function(item) {
                        item.addEventListener('click', function() {
                            var locId = this.dataset.locId;
                            var place = LocationState.getPlace(locId);
                            if (place) {
                                onSelect(place);
                            }
                        });
                        item.addEventListener('mouseenter', function() {
                            this.style.background = 'var(--bg3)';
                        });
                        item.addEventListener('mouseleave', function() {
                            this.style.background = 'transparent';
                        });
                    })(items[i]);
                }
            }

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 9. RENDER MOVE LIST
    // =========================================================================

    function renderMoveList(containerId, characterId, options) {
        if (_rendering) {
            return;
        }
        _rendering = true;

        try {
            options = options || {};
            var container = document.getElementById(containerId);
            if (!container) {
                _rendering = false;
                return;
            }

            var moves = LocationState.getMoveHistory(characterId);
            var onSelect = options.onSelect || null;
            var selectedId = options.selectedId || null;

            var html = '<div class="move-list">';

            if (moves.length === 0) {
                html += '<div style="text-align:center;padding:20px;color:var(--dim);">No moves recorded</div>';
            } else {
                for (var i = moves.length - 1; i >= 0; i--) {
                    var move = moves[i];
                    var isSelected = (selectedId === i);

                    html +=
                        '<div class="move-item" data-move-index="' + i + '" style="' +
                        'background:' + (isSelected ? 'var(--accent-dim)' : 'var(--bg3)') + ';' +
                        'border:1px solid ' + (isSelected ? 'var(--accent)' : 'var(--border)') + ';' +
                        'border-radius:4px;' +
                        'padding:6px 10px;' +
                        'margin-bottom:4px;' +
                        'cursor:pointer;' +
                        'transition:all 0.1s;' +
                        '">' +
                        '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">' +
                        '<div>' +
                        '<span style="font-size:0.7rem;">' + _escapeHtml(move.locationName || 'Unknown') + '</span>' +
                        (move.isBirthMove ? ' <span style="font-size:0.5rem;color:var(--accent);">(Birth)</span>' : '') +
                        '</div>' +
                        '<div style="font-size:0.55rem;color:var(--dim);">' +
                        move.year +
                        (move.fromLocationName ? ' from ' + _escapeHtml(move.fromLocationName) : '') +
                        (move.note ? ' - ' + _escapeHtml(move.note) : '') +
                        '</div>' +
                        '</div>' +
                        '</div>';
                }
            }

            html += '</div>';
            container.innerHTML = html;

            if (onSelect) {
                var items = container.querySelectorAll('.move-item');
                for (var i = 0; i < items.length; i++) {
                    (function(item) {
                        item.addEventListener('click', function() {
                            var index = parseInt(this.dataset.moveIndex);
                            onSelect(index);
                        });
                        item.addEventListener('mouseenter', function() {
                            this.style.background = 'var(--bg2)';
                        });
                        item.addEventListener('mouseleave', function() {
                            this.style.background = 'var(--bg3)';
                        });
                    })(items[i]);
                }
            }

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 10. RENDER LOCATION CARD
    // =========================================================================

    function renderLocationCard(place) {
        if (!place) {
            return '<div style="text-align:center;padding:20px;color:var(--dim);">Location not found</div>';
        }

        var population = LocationState.getPopulationCount(place.id, false);
        var ownPopulation = LocationState.getOwnPopulation(place.id, false);
        var typeName = LocationState.getLocationTypeName(place.typeId);
        var typePriority = LocationState.getLocationTypePriority(place.typeId);

        var priorityLabel = '';
        if (typePriority === 1) priorityLabel = 'Country';
        else if (typePriority === 2) priorityLabel = 'Region';
        else if (typePriority === 3) priorityLabel = 'County';
        else if (typePriority === 4) priorityLabel = 'Town';
        else priorityLabel = 'Other';

        var cultureBadge = '';
        if (place.cultureId) {
            var cultureName = _getCultureName(place.cultureId);
            var cultureIcon = _getCultureIcon(place.cultureId);
            if (cultureName) {
                cultureBadge = '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">' +
                    (cultureIcon ? _escapeHtml(cultureIcon) + ' ' : '') +
                    'Culture: <strong>' + _escapeHtml(cultureName) + '</strong>' +
                    '</div>';
            }
        }

        var parentName = 'None';
        if (place.parentId) {
            var parent = LocationState.getPlace(place.parentId);
            if (parent) parentName = parent.displayName;
        }

        var children = LocationState.getPlaceChildren(place.id, false);
        var childCount = children.length;

        var statusDisplay = place.status || 'Active';
        if (place.status === 'disputed') statusDisplay = '⚡ Disputed';
        else if (place.status === 'abandoned') statusDisplay = '🏚️ Abandoned';
        else if (place.status === 'ruined') statusDisplay = '💀 Ruined';

        return '<div class="location-card" style="' +
            'background:var(--bg2);border-radius:8px;padding:16px;' +
            'border:1px solid var(--border);' +
            '">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
            '<h4 style="margin:0;font-size:0.9rem;">' +
            _escapeHtml(place.displayName) +
            (place.isCapital ? ' <span style="font-size:0.6rem;color:var(--accent);">⭐ Capital</span>' : '') +
            '</h4>' +
            '<span style="font-size:0.55rem;color:var(--dim);padding:2px 10px;border-radius:12px;border:1px solid var(--border-light);">' +
            _escapeHtml(priorityLabel) +
            '</span>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.65rem;">' +
            '<div><span style="color:var(--dim);">Type</span><br><strong>' + _escapeHtml(typeName) + '</strong></div>' +
            '<div><span style="color:var(--dim);">Population</span><br><strong>' + population + '</strong>' +
            (ownPopulation > 0 ? ' (' + ownPopulation + ' local)' : '') +
            '</div>' +
            '<div><span style="color:var(--dim);">Parent</span><br><strong>' + _escapeHtml(parentName) + '</strong></div>' +
            '<div><span style="color:var(--dim);">Status</span><br><strong>' + _escapeHtml(statusDisplay) + '</strong></div>' +
            '<div><span style="color:var(--dim);">Children</span><br><strong>' + childCount + '</strong></div>' +
            '<div><span style="color:var(--dim);">Key</span><br><strong>' + _escapeHtml(place.variableKey || '—') + '</strong></div>' +
            '</div>' +
            cultureBadge +
            (place.notes ? '<div style="margin-top:8px;font-size:0.55rem;color:var(--dim);padding-top:8px;border-top:1px solid var(--border-light);">' + _escapeHtml(place.notes) + '</div>' : '') +
            '</div>';
    }

    // =========================================================================
    // 11. EXPAND/COLLAPSE ALL
    // =========================================================================

    function expandAllLocations(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;

        var childrenContainers = container.querySelectorAll('.location-tree-children');
        var toggles = container.querySelectorAll('.location-tree-toggle:not(.leaf)');

        for (var i = 0; i < childrenContainers.length; i++) {
            childrenContainers[i].style.display = 'block';
        }

        for (var i = 0; i < toggles.length; i++) {
            toggles[i].textContent = '▼';
        }

        var expandedState = {};
        var allNodes = container.querySelectorAll('.location-tree-item');
        for (var i = 0; i < allNodes.length; i++) {
            var nodeId = allNodes[i].dataset.nodeId;
            if (nodeId) {
                var toggle = container.querySelector('.location-tree-toggle[data-node-id="' + nodeId + '"]');
                if (toggle && !toggle.classList.contains('leaf')) {
                    expandedState[nodeId] = true;
                }
            }
        }
        _saveExpandedState(expandedState);
        container.dataset.expanded = JSON.stringify(expandedState);
    }

    function collapseAllLocations(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;

        var childrenContainers = container.querySelectorAll('.location-tree-children');
        var toggles = container.querySelectorAll('.location-tree-toggle:not(.leaf)');

        for (var i = 0; i < childrenContainers.length; i++) {
            childrenContainers[i].style.display = 'none';
        }

        for (var i = 0; i < toggles.length; i++) {
            toggles[i].textContent = '▶';
        }

        var expandedState = {};
        _saveExpandedState(expandedState);
        container.dataset.expanded = JSON.stringify(expandedState);
    }

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    window.LocationUI = {
        renderLocationList: renderLocationList,
        renderHierarchyList: renderHierarchyList,
        renderMoveList: renderMoveList,
        renderLocationCard: renderLocationCard,
        expandAllLocations: expandAllLocations,
        collapseAllLocations: collapseAllLocations
    };

})();