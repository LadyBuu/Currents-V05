/**
 * =============================================================================
 * GOVERNMENT TYPE MANAGER TAB (js/tabs/government-type-manager-tab.js)
 * =============================================================================
 * 
 * A modular tab for managing government types.
 * REUSES existing modals from modals-government.js
 * 
 * DEPENDENCIES:
 *   - GovernmentState (from government-state.js)
 *   - modals-government.js (openAddGovernmentTypeModal, openEditGovernmentTypeModal, openDeleteGovernmentTypeModal)
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

    function _getGovernmentTypes() {
        if (typeof GovernmentState !== 'undefined' && GovernmentState.getGovernmentTypes) {
            return GovernmentState.getGovernmentTypes();
        }
        if (typeof window.getGovernmentTypes === 'function') {
            return window.getGovernmentTypes();
        }
        if (window.masterData && window.masterData.data && window.masterData.data.governmentTypes) {
            return window.masterData.data.governmentTypes;
        }
        return [];
    }

    function _getPlaces() {
        if (typeof window.getPlaces === 'function') {
            return window.getPlaces();
        }
        if (window.masterData && window.masterData.data && window.masterData.data.places) {
            return window.masterData.data.places;
        }
        return [];
    }

    function _invalidateCache() {
        if (typeof GovernmentState !== 'undefined' && GovernmentState.invalidateCache) {
            GovernmentState.invalidateCache();
        }
        if (typeof window.invalidateGovernmentCache === 'function') {
            window.invalidateGovernmentCache();
        }
        if (typeof window.invalidateAccessorCaches === 'function') {
            window.invalidateAccessorCaches();
        }
    }

    function _getRankById(id) {
        if (typeof window.getRankById === 'function') {
            return window.getRankById(id);
        }
        return null;
    }

    // =========================================================================
    // GOVERNMENT TYPE ICON MAPPING
    // =========================================================================

    function getGovernmentTypeIcon(type) {
        // Check if type has a custom icon
        if (type.icon && window.Icons && window.Icons[type.icon]) {
            return window.Icons[type.icon];
        }
        
        // Default icons based on government type name
        var name = (type.name || '').toLowerCase();
        if (name.includes('monarchy') || name.includes('kingdom') || name.includes('empire')) {
            return window.Icons.CROWN || window.Icons.CIRCLE;
        }
        if (name.includes('republic') || name.includes('democracy') || name.includes('commonwealth')) {
            return window.Icons.CIRCLE_DOT || window.Icons.CIRCLE;
        }
        if (name.includes('oligarchy') || name.includes('aristocracy') || name.includes('noble')) {
            return window.Icons.DIAMOND || window.Icons.CIRCLE;
        }
        if (name.includes('theocracy') || name.includes('church') || name.includes('religious')) {
            return window.Icons.CROSS || window.Icons.CIRCLE;
        }
        if (name.includes('tribal') || name.includes('chiefdom') || name.includes('clan')) {
            return window.Icons.SHIELD || window.Icons.CIRCLE;
        }
        if (name.includes('dictatorship') || name.includes('autocracy') || name.includes('tyranny')) {
            return window.Icons.SWORD || window.Icons.CIRCLE;
        }
        if (name.includes('federation') || name.includes('confederation') || name.includes('union')) {
            return window.Icons.STAR || window.Icons.CIRCLE;
        }
        if (name.includes('commune') || name.includes('collective') || name.includes('council')) {
            return window.Icons.CIRCLE_HALF_LEFT || window.Icons.CIRCLE;
        }
        if (name.includes('principality') || name.includes('duchy') || name.includes('county')) {
            return window.Icons.DIAMOND_OUTLINE || window.Icons.CIRCLE;
        }
        
        // Default
        return window.Icons.GEAR || window.Icons.CIRCLE;
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

            var types = _getGovernmentTypes();
            var places = _getPlaces();

            var usageCounts = {};
            for (var i = 0; i < places.length; i++) {
                var typeId = places[i].governmentTypeId;
                if (typeId) {
                    if (!usageCounts[typeId]) usageCounts[typeId] = 0;
                    usageCounts[typeId]++;
                }
            }

            var sorted = types.slice().sort(function(a, b) {
                return (a.name || '').localeCompare(b.name || '');
            });

            var html = '';

            // --- Toolbar ---
            html +=
                '<div class="tab-toolbar">' +
                '<div class="info">' +
                '<span class="count">' + sorted.length + '</span> government types defined' +
                '</div>' +
                '<div class="actions">' +
                '<button id="addGovTypeBtn" class="btn primary">' +
                _getIcon('PLUS') + ' Add Type' +
                '</button>' +
                '</div>' +
                '</div>';

            if (sorted.length === 0) {
                html +=
                    '<div class="empty-state">' +
                    '<div class="icon">' + _getIcon('GEAR') + '</div>' +
                    '<div class="message">No government types defined yet.</div>' +
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
                    '<th>Description</th>' +
                    '<th class="center">Allowed Ranks</th>' +
                    '<th class="center">Used By</th>' +
                    '<th class="center">Actions</th>' +
                    '</tr>' +
                    '</thead>' +
                    '<tbody>';

                for (var i = 0; i < sorted.length; i++) {
                    var type = sorted[i];
                    var usage = usageCounts[type.id] || 0;
                    var isUsed = usage > 0;
                    
                    // Get icon based on type
                    var iconDisplay = getGovernmentTypeIcon(type);

                    var rankNames = [];
                    if (type.allowedRankIds && type.allowedRankIds.length > 0) {
                        for (var j = 0; j < type.allowedRankIds.length; j++) {
                            var rank = _getRankById(type.allowedRankIds[j]);
                            if (rank) {
                                rankNames.push(rank.name);
                            }
                        }
                    }
                    var rankDisplay = rankNames.length > 0 ? rankNames.join(', ') : 'All ranks';

                    html +=
                        '<tr>' +
                        '<td class="symbol-cell">' + iconDisplay + '</td>' +
                        '<td class="name-cell">' + _escapeHtml(type.name) + '</td>' +
                        '<td class="dim-text">' + _escapeHtml(type.description || '') + '</td>' +
                        '<td class="center dim-text">' + _escapeHtml(rankDisplay) + '</td>' +
                        '<td class="center">' +
                        (usage > 0 ?
                            '<span class="accent-text">' + usage + '</span>' :
                            '<span class="empty-badge">—</span>'
                        ) +
                        '</td>' +
                        '<td class="actions-cell">' +
                        '<button class="edit-govtype-btn action-btn" data-type-id="' + type.id + '">' +
                        _getIcon('EDIT') + ' Edit' +
                        '</button>' +
                        '<button class="delete-govtype-btn action-btn danger" data-type-id="' + type.id + '"' + (isUsed ? ' disabled' : '') + '>' +
                        _getIcon('TRASH') + ' Delete' +
                        '</button>' +
                        '</td>' +
                        '</tr>';
                }

                html += '</tbody></table></div>';
            }

            container.innerHTML = html;

            // --- Event Listeners ---
            var addBtn = document.getElementById('addGovTypeBtn');
            if (addBtn) {
                addBtn.addEventListener('click', function() {
                    if (typeof window.openAddGovernmentTypeModal === 'function') {
                        window.openAddGovernmentTypeModal(function() {
                            renderTypeList(containerId);
                        });
                    } else if (typeof window._openAddGovernmentTypeModal === 'function') {
                        window._openAddGovernmentTypeModal(function() {
                            renderTypeList(containerId);
                        });
                    }
                });
            }

            var editBtns = container.querySelectorAll('.edit-govtype-btn');
            for (var i = 0; i < editBtns.length; i++) {
                (function(btn) {
                    btn.addEventListener('click', function() {
                        var typeId = this.dataset.typeId;
                        if (typeof window.openEditGovernmentTypeModal === 'function') {
                            window.openEditGovernmentTypeModal(typeId, function() {
                                renderTypeList(containerId);
                            });
                        } else if (typeof window._openEditGovernmentTypeModal === 'function') {
                            window._openEditGovernmentTypeModal(typeId, function() {
                                renderTypeList(containerId);
                            });
                        }
                    });
                })(editBtns[i]);
            }

            var deleteBtns = container.querySelectorAll('.delete-govtype-btn:not([disabled])');
            for (var i = 0; i < deleteBtns.length; i++) {
                (function(btn) {
                    btn.addEventListener('click', function() {
                        var typeId = this.dataset.typeId;
                        if (typeof window.openDeleteGovernmentTypeModal === 'function') {
                            window.openDeleteGovernmentTypeModal(typeId, function() {
                                renderTypeList(containerId);
                            });
                        } else if (typeof window._openDeleteGovernmentTypeModal === 'function') {
                            window._openDeleteGovernmentTypeModal(typeId, function() {
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
            window.registerTabRenderer('governmenttypes', tabRenderer, false);
            _registered = true;
        }
    }

    // =========================================================================
    // INITIALIZATION
    // =========================================================================

    function init(containerId) {
        if (_initialized) return;
        _initialized = true;

        containerId = containerId || 'tab-governmenttypes';

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

    window.GovernmentTypeManager = {
        init: init,
        renderTypeList: renderTypeList,
        tabRenderer: tabRenderer,
        registerWithTabSystem: registerWithTabSystem
    };

    if (document.getElementById('tab-governmenttypes')) {
        init('tab-governmenttypes');
    }

})();