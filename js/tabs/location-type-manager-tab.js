/**
 * =============================================================================
 * LOCATION TYPE MANAGER TAB (js/tabs/location-type-manager-tab.js)
 * =============================================================================
 * 
 * A modular tab for managing location types.
 * REUSES existing modals from modals-location.js
 * 
 * DEPENDENCIES:
 *   - LocationState (from location-state.js)
 *   - modals-location.js (openAddLocationTypeModal, openEditLocationTypeModal, openDeleteLocationTypeModal)
 *   - ui.js (registerTabRenderer)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    var _initialized = false;
    var _rendering = false;
    var _registered = false;

    // =========================================================================
    // DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _getIcon(name) {
        if (typeof window._getIcon === 'function') return window._getIcon(name);
        if (window.Icons && window.Icons[name]) return window.Icons[name];
        return '';
    }

    function _getLocationTypes() {
        if (typeof LocationState !== 'undefined' && LocationState.getLocationTypes) {
            return LocationState.getLocationTypes();
        }
        if (window.masterData && window.masterData.data && window.masterData.data.locationTypes) {
            return window.masterData.data.locationTypes;
        }
        return [];
    }

    function _getPlaces() {
        if (typeof LocationState !== 'undefined' && LocationState.getAllPlaces) {
            return LocationState.getAllPlaces({ includeDeprecated: false });
        }
        if (window.masterData && window.masterData.data && window.masterData.data.places) {
            return window.masterData.data.places;
        }
        return [];
    }

    function _invalidateCache() {
        if (typeof LocationState !== 'undefined' && LocationState.invalidateCache) {
            LocationState.invalidateCache();
        }
        if (typeof window._invalidateAccessorCaches === 'function') {
            window._invalidateAccessorCaches();
        }
    }

    // =========================================================================
    // PRIORITY LABELS
    // =========================================================================

    var PRIORITY_LABELS = {
        1: { label: '⭐ 1 – Country / Kingdom', short: 'Country' },
        2: { label: '⬡ 2 – Region / Province', short: 'Region' },
        3: { label: '◉ 3 – County / Duchy', short: 'County' },
        4: { label: '⌂ 4 – Town / Village', short: 'Town' },
        5: { label: '⌇ 5 – Other / Locality', short: 'Other' }
    };

    function getPriorityLabel(priority) {
        return PRIORITY_LABELS[priority] || PRIORITY_LABELS[5];
    }

    // =========================================================================
    // ICON MAPPING FOR LOCATION TYPES
    // =========================================================================

    function getLocationTypeIcon(priority) {
        var iconMap = {
            1: window.Icons.LOCATION_COUNTRY || window.Icons.CIRCLE,
            2: window.Icons.LOCATION_REGION || window.Icons.CIRCLE,
            3: window.Icons.LOCATION_COUNTY || window.Icons.CIRCLE,
            4: window.Icons.LOCATION_TOWN || window.Icons.CIRCLE,
            5: window.Icons.LOCATION_LOCALITY || window.Icons.CIRCLE
        };
        return iconMap[priority] || window.Icons.CIRCLE;
    }

    // =========================================================================
    // RENDER TYPE LIST
    // =========================================================================

    function renderTypeList(containerId) {
        if (_rendering) return;
        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) {
                _rendering = false;
                return;
            }

            _invalidateCache();

            var types = _getLocationTypes();
            var places = _getPlaces();

            var usageCounts = {};
            for (var i = 0; i < places.length; i++) {
                var typeId = places[i].typeId;
                if (!usageCounts[typeId]) usageCounts[typeId] = 0;
                usageCounts[typeId]++;
            }

            var sorted = types.slice().sort(function(a, b) {
                var pa = a.priority || 5;
                var pb = b.priority || 5;
                if (pa !== pb) return pa - pb;
                return (a.displayName || a.name || '').localeCompare(b.displayName || b.name || '');
            });

            var html = '';

            // --- Toolbar ---
            html +=
                '<div class="tab-toolbar">' +
                '<div class="info">' +
                '<span class="count">' + sorted.length + '</span> location types defined' +
                '</div>' +
                '<div class="actions">' +
                '<button id="addLocationTypeBtn" class="btn primary">' +
                _getIcon('PLUS') + ' Add Type' +
                '</button>' +
                '</div>' +
                '</div>';

            if (sorted.length === 0) {
                html +=
                    '<div class="empty-state">' +
                    '<div class="icon">' + _getIcon('LOCATION') + '</div>' +
                    '<div class="message">No location types defined yet.</div>' +
                    '<div class="sub-message">Click "Add Type" to create one.</div>' +
                    '</div>';
            } else {
                html +=
                    '<div class="table-container">' +
                    '<table class="data-table">' +
                    '<thead>' +
                    '<tr>' +
                    '<th class="center">Icon</th>' +
                    '<th>Name</th>' +
                    '<th class="center">Priority</th>' +
                    '<th class="center">Level</th>' +
                    '<th class="center">Used By</th>' +
                    '<th class="center">Actions</th>' +
                    '</tr>' +
                    '</thead>' +
                    '<tbody>';

                for (var i = 0; i < sorted.length; i++) {
                    var type = sorted[i];
                    var priority = type.priority || 5;
                    var priorityInfo = getPriorityLabel(priority);
                    var usage = usageCounts[type.id] || 0;
                    var displayName = type.displayName || type.name || 'Unnamed';
                    var isUsed = usage > 0;
                    
                    // Get icon based on priority
                    var iconDisplay = getLocationTypeIcon(priority);
                    
                    // Override with custom icon if set
                    if (type.icon && window.Icons && window.Icons[type.icon]) {
                        iconDisplay = window.Icons[type.icon];
                    }

                    html +=
                        '<tr>' +
                        '<td class="symbol-cell">' + iconDisplay + '</td>' +
                        '<td class="name-cell">' + _escapeHtml(displayName) + '</td>' +
                        '<td class="center">' + priority + '</td>' +
                        '<td class="center dim-text">' + _escapeHtml(priorityInfo.short) + '</td>' +
                        '<td class="center">' +
                        (usage > 0 ?
                            '<span class="accent-text">' + usage + '</span>' :
                            '<span class="empty-badge">—</span>'
                        ) +
                        '</td>' +
                        '<td class="actions-cell">' +
                        '<button class="edit-type-btn action-btn" data-type-id="' + type.id + '">' +
                        _getIcon('EDIT') + ' Edit' +
                        '</button>' +
                        '<button class="delete-type-btn action-btn danger" data-type-id="' + type.id + '"' + (isUsed ? ' disabled' : '') + '>' +
                        _getIcon('TRASH') + ' Delete' +
                        '</button>' +
                        '</td>' +
                        '</tr>';
                }

                html += '</tbody></table></div>';
            }

            container.innerHTML = html;

            // --- Event Listeners ---
            var addBtn = document.getElementById('addLocationTypeBtn');
            if (addBtn) {
                addBtn.addEventListener('click', function() {
                    if (typeof window.openAddLocationTypeModal === 'function') {
                        window.openAddLocationTypeModal(function() {
                            renderTypeList(containerId);
                        });
                    }
                });
            }

            var editBtns = container.querySelectorAll('.edit-type-btn');
            for (var i = 0; i < editBtns.length; i++) {
                (function(btn) {
                    btn.addEventListener('click', function() {
                        var typeId = this.dataset.typeId;
                        if (typeof window.openEditLocationTypeModal === 'function') {
                            window.openEditLocationTypeModal(typeId, function() {
                                renderTypeList(containerId);
                            });
                        }
                    });
                })(editBtns[i]);
            }

            var deleteBtns = container.querySelectorAll('.delete-type-btn:not([disabled])');
            for (var i = 0; i < deleteBtns.length; i++) {
                (function(btn) {
                    btn.addEventListener('click', function() {
                        var typeId = this.dataset.typeId;
                        if (typeof window.openDeleteLocationTypeModal === 'function') {
                            window.openDeleteLocationTypeModal(typeId, function() {
                                renderTypeList(containerId);
                            });
                        }
                    });
                })(deleteBtns[i]);
            }

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // TAB RENDERER (for ui.js tab system)
    // =========================================================================

    function tabRenderer(containerId, locationId, summary) {
        renderTypeList(containerId);
    }

    // =========================================================================
    // REGISTER WITH TAB SYSTEM
    // =========================================================================

    function registerWithTabSystem() {
        if (_registered) return;
        if (typeof window.registerTabRenderer === 'function') {
            window.registerTabRenderer('locationtypes', tabRenderer, false);
            _registered = true;
        }
    }

    // =========================================================================
    // INITIALIZATION
    // =========================================================================

    function init(containerId) {
        if (_initialized) return;
        _initialized = true;

        containerId = containerId || 'tab-locationtypes';

        registerWithTabSystem();

        if (!_registered && typeof window.registerTabRenderer !== 'function') {
            var checkInterval = setInterval(function() {
                if (typeof window.registerTabRenderer === 'function') {
                    clearInterval(checkInterval);
                    registerWithTabSystem();
                    if (document.getElementById(containerId)) {
                        renderTypeList(containerId);
                    }
                }
            }, 100);
            setTimeout(function() {
                clearInterval(checkInterval);
            }, 5000);
            return;
        }

        var checkContainer = function() {
            var container = document.getElementById(containerId);
            if (container) {
                renderTypeList(containerId);
                return;
            }
            setTimeout(checkContainer, 100);
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', checkContainer);
        } else {
            setTimeout(checkContainer, 50);
        }
    }

    // =========================================================================
    // EXPORTS
    // =========================================================================

    window.LocationTypeManager = {
        init: init,
        renderTypeList: renderTypeList,
        tabRenderer: tabRenderer,
        registerWithTabSystem: registerWithTabSystem
    };

    if (document.getElementById('tab-locationtypes')) {
        init('tab-locationtypes');
    }

})();