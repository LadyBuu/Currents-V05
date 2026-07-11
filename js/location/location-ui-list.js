/**
 * =============================================================================
 * LOCATION UI LIST - UI list rendering for locations and moves
 * =============================================================================
 * 
 * Responsibilities:
 * - Render location lists with filters
 * - Render hierarchy lists
 * - Render move lists
 * - Handle selection and sorting
 * 
 * DEPENDENCIES:
 *   - location-state.js (LocationState)
 *   - location-queries.js (LocationQueries)
 *   - modals-core.js (_escapeHtml, _getIcon, _showToast)
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
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(message, type);
        }
    }

    // =========================================================================
    // 3. RENDER LOCATION LIST
    // =========================================================================

    function renderLocationList(containerId, options) {
        if (_rendering) {
            return;
        }
        _rendering = true;

        try {
            options = options || {};
            var container = document.getElementById(containerId);
            if (!container) return;

            var typeId = options.typeId || null;
            var searchTerm = options.searchTerm || '';
            var onSelect = options.onSelect || null;
            var selectedId = options.selectedId || null;
            var sortBy = options.sortBy || 'name';
            var sortOrder = options.sortOrder || 'asc';

            var places = LocationState.getAllPlaces({ includeDeprecated: false });

            if (typeId) {
                places = places.filter(function(p) { return p.typeId === typeId; });
            }

            if (searchTerm) {
                var lower = searchTerm.toLowerCase();
                places = places.filter(function(p) {
                    return p.displayName.toLowerCase().indexOf(lower) !== -1 ||
                        (p.variableKey && p.variableKey.toLowerCase().indexOf(lower) !== -1);
                });
            }

            places.sort(function(a, b) {
                var compare = 0;
                switch (sortBy) {
                    case 'name':
                        compare = (a.displayName || '').localeCompare(b.displayName || '');
                        break;
                    case 'type':
                        var typeA = LocationState.getLocationTypeName(a.typeId);
                        var typeB = LocationState.getLocationTypeName(b.typeId);
                        compare = typeA.localeCompare(typeB);
                        break;
                    case 'population':
                        var popA = LocationState.getPopulationCount(a.id, false);
                        var popB = LocationState.getPopulationCount(b.id, false);
                        compare = popA - popB;
                        break;
                    default:
                        compare = (a.displayName || '').localeCompare(b.displayName || '');
                }
                return sortOrder === 'desc' ? -compare : compare;
            });

            var locationIcon = _getIcon('LOCATION');
            var homeIcon = _getIcon('HOME');

            var html = '<div class="location-list">';

            if (places.length === 0) {
                html += '<div style="text-align: center; padding: 40px; color: var(--dim);">No locations found</div>';
            } else {
                for (var i = 0; i < places.length; i++) {
                    var p = places[i];
                    var isSelected = (selectedId === p.id);
                    var population = LocationState.getPopulationCount(p.id, false);
                    var typeName = LocationState.getLocationTypeName(p.typeId);
                    var typePriority = LocationState.getLocationTypePriority(p.typeId);

                    var priorityLabel = '';
                    if (typePriority === 1) priorityLabel = ' (Country)';
                    else if (typePriority === 2) priorityLabel = ' (Region)';
                    else if (typePriority === 3) priorityLabel = ' (County)';
                    else if (typePriority === 4) priorityLabel = ' (Town)';

                    html +=
                        '<div class="location-item" data-loc-id="' + p.id + '" style="' +
                        'background: ' + (isSelected ? 'var(--accent-dim)' : 'var(--bg3)') + ';' +
                        'border: 1px solid ' + (isSelected ? 'var(--accent)' : 'var(--border)') + ';' +
                        'border-radius: 6px;' +
                        'padding: 10px 14px;' +
                        'margin-bottom: 6px;' +
                        'cursor: pointer;' +
                        'transition: all 0.1s;' +
                        '">' +
                        '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">' +
                        '<div>' +
                        '<span style="font-size: 0.8rem;">' + locationIcon + ' ' + _escapeHtml(p.displayName) + '</span>' +
                        '<span style="font-size: 0.55rem; color: var(--dim); margin-left: 6px;">' + _escapeHtml(typeName) + priorityLabel + '</span>' +
                        (p.isCapital ? '<span style="font-size: 0.5rem; background: var(--accent); padding: 2px 6px; border-radius: 10px; color: white; margin-left: 4px;">Capital</span>' : '') +
                        '</div>' +
                        '<div style="font-size: 0.55rem; color: var(--dim);">' +
                        '<span>' + homeIcon + ' ' + population + ' pop</span>' +
                        '</div>' +
                        '</div>' +
                        '</div>';
                }
            }

            html += '</div>';
            container.innerHTML = html;

            if (onSelect) {
                var items = container.querySelectorAll('.location-item');
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
                            this.style.background = 'var(--bg2)';
                        });
                        item.addEventListener('mouseleave', function() {
                            this.style.background = 'var(--bg3)';
                        });
                    })(items[i]);
                }
            }

            var uiState = LocationState.getUIState();
            uiState.filters.searchTerm = searchTerm || '';
            uiState.selectedLocationId = selectedId || null;

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 4. RENDER HIERARCHY LIST
    // =========================================================================

    function renderHierarchyList(containerId, locationId, options) {
        if (_rendering) {
            return;
        }
        _rendering = true;

        try {
            options = options || {};
            var container = document.getElementById(containerId);
            if (!container) return;

            var onSelect = options.onSelect || null;
            var selectedId = options.selectedId || null;

            var hierarchy = LocationState.getPlaceHierarchy(locationId);
            var locationIcon = _getIcon('LOCATION');

            var html = '<div class="hierarchy-list">';

            if (hierarchy.length === 0) {
                html += '<div style="text-align: center; padding: 20px; color: var(--dim);">No hierarchy found</div>';
            } else {
                for (var i = 0; i < hierarchy.length; i++) {
                    var p = hierarchy[i];
                    var isSelected = (selectedId === p.id);
                    var indent = '';
                    for (var j = 0; j < i; j++) {
                        indent += '&nbsp;&nbsp;&nbsp;&nbsp;';
                    }
                    var prefix = i > 0 ? '└─ ' : '';

                    html +=
                        '<div class="hierarchy-item" data-loc-id="' + p.id + '" style="' +
                        'background: ' + (isSelected ? 'var(--accent-dim)' : 'transparent') + ';' +
                        'border-left: 2px solid ' + (isSelected ? 'var(--accent)' : 'transparent') + ';' +
                        'padding: 4px 8px;' +
                        'cursor: pointer;' +
                        'transition: all 0.1s;' +
                        '">' +
                        '<span style="font-size: 0.7rem;">' + indent + prefix + locationIcon + ' ' + _escapeHtml(p.displayName) + '</span>' +
                        (p.isCapital ? ' <span style="font-size: 0.5rem; color: var(--accent);">(Capital)</span>' : '') +
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
    // 5. RENDER MOVE LIST
    // =========================================================================

    function renderMoveList(containerId, characterId, options) {
        if (_rendering) {
            return;
        }
        _rendering = true;

        try {
            options = options || {};
            var container = document.getElementById(containerId);
            if (!container) return;

            var moves = LocationState.getMoveHistory(characterId);
            var onSelect = options.onSelect || null;
            var selectedId = options.selectedId || null;
            var character = _getCharacterById(characterId);

            var locationIcon = _getIcon('LOCATION');

            var html = '<div class="move-list">';

            if (moves.length === 0) {
                html += '<div style="text-align: center; padding: 20px; color: var(--dim);">No moves recorded</div>';
            } else {
                for (var i = moves.length - 1; i >= 0; i--) {
                    var move = moves[i];
                    var isSelected = (selectedId === i);

                    html +=
                        '<div class="move-item" data-move-index="' + i + '" style="' +
                        'background: ' + (isSelected ? 'var(--accent-dim)' : 'var(--bg3)') + ';' +
                        'border: 1px solid ' + (isSelected ? 'var(--accent)' : 'var(--border)') + ';' +
                        'border-radius: 4px;' +
                        'padding: 6px 10px;' +
                        'margin-bottom: 4px;' +
                        'cursor: pointer;' +
                        'transition: all 0.1s;' +
                        '">' +
                        '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">' +
                        '<div>' +
                        '<span style="font-size: 0.7rem;">' + locationIcon + ' ' + _escapeHtml(move.locationName || 'Unknown') + '</span>' +
                        (move.isBirthMove ? ' <span style="font-size: 0.5rem; color: var(--accent);">(Birth)</span>' : '') +
                        '</div>' +
                        '<div style="font-size: 0.55rem; color: var(--dim);">' +
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
    // 6. EXPORTS
    // =========================================================================

    window.LocationUI = {
        renderLocationList: renderLocationList,
        renderHierarchyList: renderHierarchyList,
        renderMoveList: renderMoveList
    };

})();