/**
 * =============================================================================
 * STILL WATERS - GOVERNMENT TYPES UI
 * File: js/ui/gm-government-type-tab-ui.js
 * =============================================================================
 * 
 * UPDATED: Full integration with GovernmentState, GovernmentCommands,
 *          GovernmentQueries
 * UPDATED: Add button now properly calls the modal function
 * UPDATED: Edit and Delete buttons now work with the new modal functions
 * 
 * FEATURES:
 * - List all government types with usage counts
 * - Add/Edit/Delete government types
 * - Manage allowed ranks for each type
 * - View locations using each type
 * - Filter and search types
 * - Integration with rank system
 * 
 * DEPENDENCIES:
 *   - government-state.js (GovernmentState)
 *   - government-commands.js (GovernmentCommands)
 *   - government-queries.js (GovernmentQueries)
 *   - accessors.js (getPlaceById, getPlaces, getRankById, getRanks)
 *   - modals-government.js (openAddGovernmentTypeModal, openEditGovernmentTypeModal, openDeleteGovernmentTypeModal)
 * 
 * ICON POLICY:
 *   - All icons from icons.js via _getIcon()
 *   - NO emojis
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
    // 2. SVG ICON HELPERS
    // =========================================================================

    function _getIcon(name, fallback) {
        if (typeof window.Icons !== 'undefined' && window.Icons[name]) {
            return window.Icons[name];
        }
        return fallback || '●';
    }

    function _getCheckIcon() { return _getIcon('CHECK', '✓'); }
    function _getCrossIcon() { return _getIcon('X', '✗'); }
    function _getCircleIcon() { return _getIcon('CIRCLE', '●'); }
    function _getHomeIcon() { return _getIcon('HOME', '⌂'); }
    function _getWarningIcon() { return _getIcon('WARNING', '⚠'); }
    function _getRefreshIcon() { return _getIcon('REFRESH', '⟳'); }
    function _getSearchIcon() { return _getIcon('SEARCH', '⌕'); }
    function _getStarIcon() { return _getIcon('STAR', '★'); }
    function _getGearIcon() { return _getIcon('GEAR', '⚙'); }
    function _getShieldIcon() { return _getIcon('SHIELD', '🛡'); }
    function _getPersonIcon() { return _getIcon('PERSON', '👤'); }
    function _getFlagIcon() { return _getIcon('FLAG', '🏴'); }
    function _getCrownIcon() { return _getIcon('CROWN', '👑'); }
    function _getBookIcon() { return _getIcon('BOOK', '📚'); }

    // =========================================================================
    // 3. DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _showToast(msg, type) {
        var plainMessage = msg;
        if (typeof msg === 'string') {
            plainMessage = msg.replace(/<[^>]*>/g, '');
        }
        if (typeof window._showToast === 'function') return window._showToast(plainMessage, type);
        if (typeof window.showToast === 'function') return window.showToast(plainMessage, type);
        console.log('[' + (type || 'info') + '] ' + plainMessage);
    }

    function _getCurrentYear() {
        if (typeof window._getCurrentYear === 'function') return window._getCurrentYear();
        if (typeof window.getCurrentYearSafe === 'function') return window.getCurrentYearSafe();
        if (typeof window.getCurrentYear === 'function') return window.getCurrentYear();
        return 1250;
    }

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getPlaces() {
        return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
    }

    function _getRankById(id) {
        return typeof window.getRankById === 'function' ? window.getRankById(id) : null;
    }

    function _getRanks() {
        if (typeof window.getRanks === 'function') return window.getRanks();
        return [];
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') window.saveMasterData();
    }

    function _invalidateWorldCache() {
        if (typeof window.invalidateAccessorCaches === 'function') {
            window.invalidateAccessorCaches();
        }
        if (typeof window.refreshCaches === 'function') {
            window.refreshCaches();
        }
    }

    // =========================================================================
    // 4. MODAL WRAPPERS - Uses modals-government.js functions
    // =========================================================================

    function _openModal(options) {
        if (typeof window.openModal === 'function') return window.openModal(options);
        if (typeof window._openModal === 'function') return window._openModal(options);
        return null;
    }

    function _closeTopModal() {
        if (typeof window.closeTopModal === 'function') window.closeTopModal();
        if (typeof window._closeTopModal === 'function') window._closeTopModal();
    }

    function _openAddGovernmentTypeModal(onSuccess) {
        if (typeof window.openAddGovernmentTypeModal === 'function') {
            return window.openAddGovernmentTypeModal(onSuccess);
        }
        if (typeof window._openAddGovernmentTypeModal === 'function') {
            return window._openAddGovernmentTypeModal(onSuccess);
        }
        _showToast('Add government type modal not available', 'error');
        return null;
    }

    function _openEditGovernmentTypeModal(typeId, onSuccess) {
        if (typeof window.openEditGovernmentTypeModal === 'function') {
            return window.openEditGovernmentTypeModal(typeId, onSuccess);
        }
        if (typeof window._openEditGovernmentTypeModal === 'function') {
            return window._openEditGovernmentTypeModal(typeId, onSuccess);
        }
        _showToast('Edit government type modal not available', 'error');
        return null;
    }

    function _openDeleteGovernmentTypeModal(typeId, onSuccess) {
        if (typeof window.openDeleteGovernmentTypeModal === 'function') {
            return window.openDeleteGovernmentTypeModal(typeId, onSuccess);
        }
        if (typeof window._openDeleteGovernmentTypeModal === 'function') {
            return window._openDeleteGovernmentTypeModal(typeId, onSuccess);
        }
        _showToast('Delete government type modal not available', 'error');
        return null;
    }

    // =========================================================================
    // 5. GOVERNMENT SYSTEM WRAPPERS
    // =========================================================================

    var _state = window.GovernmentState;
    var _commands = window.GovernmentCommands;
    var _queries = window.GovernmentQueries;

    function _getGovernmentTypes() {
        return _state ? _state.getGovernmentTypes() : [];
    }

    function _getGovernmentTypeById(id) {
        return _state ? _state.getGovernmentTypeById(id) : null;
    }

    function _createGovernmentType(data) {
        return _commands ? _commands.createGovernmentType(data) : null;
    }

    function _updateGovernmentType(typeId, updates) {
        return _commands ? _commands.updateGovernmentType(typeId, updates) : null;
    }

    function _deleteGovernmentType(typeId) {
        return _commands ? _commands.deleteGovernmentType(typeId) : false;
    }

    function _getGovernmentStatistics() {
        return _queries ? _queries.getStatistics({ includeDeprecated: false }) : null;
    }

    // =========================================================================
    // 6. STATE
    // =========================================================================

    var governmentTypesState = {
        searchTerm: '',
        expandedTypeId: null,
        sortBy: 'name'
    };

    // =========================================================================
    // 7. HELPER FUNCTIONS
    // =========================================================================

    function applyGovernmentTypesFilters(types) {
        var filtered = types.slice();

        if (governmentTypesState.searchTerm) {
            var searchLower = governmentTypesState.searchTerm.toLowerCase();
            filtered = filtered.filter(function(t) {
                return t.name.toLowerCase().indexOf(searchLower) !== -1 ||
                    (t.description || '').toLowerCase().indexOf(searchLower) !== -1;
            });
        }

        if (governmentTypesState.sortBy === 'name') {
            filtered.sort(function(a, b) { return a.name.localeCompare(b.name); });
        } else if (governmentTypesState.sortBy === 'usage') {
            filtered.sort(function(a, b) {
                var usageA = getPlacesByGovernmentTypeCount(a.id);
                var usageB = getPlacesByGovernmentTypeCount(b.id);
                return usageB - usageA;
            });
        } else if (governmentTypesState.sortBy === 'ranks') {
            filtered.sort(function(a, b) {
                var ranksA = (a.allowedRankIds || []).length;
                var ranksB = (b.allowedRankIds || []).length;
                return ranksB - ranksA;
            });
        }

        return filtered;
    }

    function getPlacesByGovernmentTypeCount(govTypeId) {
        var places = _getPlaces();
        var count = 0;
        for (var i = 0; i < places.length; i++) {
            if (places[i].governmentTypeId === govTypeId) count++;
        }
        return count;
    }

    function getPlacesByGovernmentType(govTypeId) {
        var places = _getPlaces();
        var result = [];
        for (var i = 0; i < places.length; i++) {
            if (places[i].governmentTypeId === govTypeId) result.push(places[i]);
        }
        return result;
    }

    // =========================================================================
    // 8. MAIN RENDER FUNCTION
    // =========================================================================

    function renderGovernmentTypesTab(containerId, onRefresh) {
        if (_rendering) return;
        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) return;

            var govTypes = _getGovernmentTypes();
            govTypes = applyGovernmentTypesFilters(govTypes);

            var totalTypes = govTypes.length;
            var totalUsage = 0;
            for (var i = 0; i < govTypes.length; i++) {
                totalUsage += getPlacesByGovernmentTypeCount(govTypes[i].id);
            }
            var mostUsed = govTypes.length > 0 ? govTypes.reduce(function(a, b) {
                return getPlacesByGovernmentTypeCount(a.id) > getPlacesByGovernmentTypeCount(b.id) ? a : b;
            }) : null;

            var stats = _getGovernmentStatistics();

            var html = 
                '<div class="government-types-tab" style="padding:16px;">' +
                '<div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px;">' +
                '<div style="background: var(--bg2); padding: 10px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 1.2rem; font-weight: bold;">' + totalTypes + '</div>' +
                '<div style="font-size: 0.6rem; color: var(--dim);">' + _getGearIcon() + ' Government Types</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 10px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 1.2rem; font-weight: bold;">' + totalUsage + '</div>' +
                '<div style="font-size: 0.6rem; color: var(--dim);">' + _getHomeIcon() + ' Locations Using</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 10px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.8rem; font-weight: bold;">' + (mostUsed ? _escapeHtml(mostUsed.name) : '—') + '</div>' +
                '<div style="font-size: 0.6rem; color: var(--dim);">' + _getStarIcon() + ' Most Used</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 10px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.8rem; font-weight: bold;">' + (stats ? stats.totalDepartments : '0') + '</div>' +
                '<div style="font-size: 0.6rem; color: var(--dim);">' + _getHomeIcon() + ' Total Departments</div>' +
                '</div>' +
                '</div>' +

                '<div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:20px; padding:12px 16px; background:rgba(13,17,25,0.6); border-radius:12px;">' +
                '<button id="addGovTypeBtn" class="btn primary" style="background:var(--accent);border:none;color:white;padding:6px 14px;border-radius:4px;cursor:pointer;">' + _getCheckIcon() + ' Add Type</button>' +
                '<div style="flex:1; min-width:150px;">' +
                '<input type="text" id="govTypeSearch" placeholder="Search types..." value="' + _escapeHtml(governmentTypesState.searchTerm) + '" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '</div>' +
                '<select id="govTypeSort" style="padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '<option value="name" ' + (governmentTypesState.sortBy === 'name' ? 'selected' : '') + '>Sort by: Name</option>' +
                '<option value="usage" ' + (governmentTypesState.sortBy === 'usage' ? 'selected' : '') + '>Sort by: Usage</option>' +
                '<option value="ranks" ' + (governmentTypesState.sortBy === 'ranks' ? 'selected' : '') + '>Sort by: Ranks</option>' +
                '</select>' +
                '<button id="clearGovTypeFiltersBtn" class="btn small" style="padding:4px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">' + _getCrossIcon() + ' Clear</button>' +
                '<button id="refreshGovTypesBtn" class="btn small" style="padding:4px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">' + _getRefreshIcon() + ' Refresh</button>' +
                '</div>' +

                '<div id="govTypesList" class="government-types-list">' +
                (govTypes.length === 0 ? '<div class="empty-state" style="text-align:center;padding:60px;color:var(--dim);">' + _getHomeIcon() + ' No government types defined. Click "' + _getCheckIcon() + ' Add Type" to create one.</div>' : 
                    govTypes.map(function(type) { return renderGovernmentTypeCard(type); }).join('')) +
                '</div>' +
                '</div>';

            container.innerHTML = html;

            attachGovernmentTypeActionHandlers(onRefresh);
            attachGovernmentTypeFilterHandlers(onRefresh);
            attachGovernmentTypeCardHandlers(onRefresh);

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 9. TYPE CARD RENDERER
    // =========================================================================

    function renderGovernmentTypeCard(type) {
        var isExpanded = governmentTypesState.expandedTypeId === type.id;
        var allowedRanks = (type.allowedRankIds || []).map(function(rankId) { return _getRankById(rankId); }).filter(function(r) { return r; });
        var placeCount = getPlacesByGovernmentTypeCount(type.id);
        var places = getPlacesByGovernmentType(type.id).slice(0, 5);
        var hasMorePlaces = getPlacesByGovernmentTypeCount(type.id) > 5;

        return '<div class="government-type-card" data-type-id="' + type.id + '" style="background:rgba(13,17,25,0.8); border:1px solid var(--border); border-radius:12px; margin-bottom:12px; overflow:hidden;">' +
            '<div class="government-type-header" data-type-id="' + type.id + '" style="padding:12px 16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; cursor:pointer;">' +
            '<div style="display:flex; flex-wrap:wrap; align-items:center; gap:10px; flex:1;">' +
            '<strong style="font-size:0.85rem; color:var(--accent);">' + _escapeHtml(type.name) + '</strong>' +
            (type.description ? '<span style="font-size:0.6rem; color:var(--dim);">' + _escapeHtml(type.description) + '</span>' : '') +
            '<span style="font-size:0.5rem; padding:2px 8px; background:rgba(106,158,207,0.15); border-radius:12px;">' + _getHomeIcon() + ' ' + placeCount + ' locations</span>' +
            '<span style="font-size:0.5rem; padding:2px 8px; background:rgba(106,158,207,0.15); border-radius:12px;">' + _getShieldIcon() + ' ' + allowedRanks.length + ' ranks</span>' +
            '</div>' +
            '<div style="display:flex; gap:6px; flex-wrap:wrap;">' +
            '<button class="edit-gov-type-btn btn small" data-type-id="' + type.id + '" title="Edit Type" style="padding:3px 8px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">' + _getGearIcon() + '</button>' +
            '<button class="delete-gov-type-btn btn small danger" data-type-id="' + type.id + '" title="Delete Type" style="padding:3px 8px;background:#8a3020;border:none;color:white;border-radius:4px;cursor:pointer;">' + _getCrossIcon() + '</button>' +
            '<button class="expand-type-btn btn small" data-type-id="' + type.id + '" title="Show/Hide Details" style="padding:3px 8px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">' + (isExpanded ? '▲' : '▼') + '</button>' +
            '</div>' +
            '</div>' +
            (isExpanded ? renderGovernmentTypeDetails(type, allowedRanks, places, hasMorePlaces) : '') +
            '</div>';
    }

    // =========================================================================
    // 10. TYPE DETAILS RENDERER
    // =========================================================================

    function renderGovernmentTypeDetails(type, allowedRanks, places, hasMorePlaces) {
        var ranks = _getRanks();
        var availableRanks = ranks.filter(function(r) { return (type.allowedRankIds || []).indexOf(r.id) === -1; });

        return '<div class="government-type-details" style="padding:16px; border-top:1px solid var(--border); background:rgba(9,12,18,0.4);">' +
            '<div style="margin-bottom:16px;">' +
            '<div style="font-size:0.6rem; color:var(--accent); margin-bottom:6px;">' + _getBookIcon() + ' Description</div>' +
            '<textarea id="govTypeDesc_' + type.id + '" class="gov-type-desc" rows="2" placeholder="Description..." style="width:100%; padding:6px 8px; background:rgba(9,12,18,0.8); border:1px solid var(--border); border-radius:6px; color:var(--text); font-size:0.65rem;">' + _escapeHtml(type.description || '') + '</textarea>' +
            '<small style="font-size:0.5rem; color:var(--dim);">Changes save automatically when you click away.</small>' +
            '</div>' +

            '<div style="margin-bottom:16px;">' +
            '<div style="font-size:0.6rem; color:var(--accent); margin-bottom:6px;">' + _getShieldIcon() + ' Allowed Ranks</div>' +
            '<div id="allowedRanksList_' + type.id + '" style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px;">' +
            (allowedRanks.length === 0 ? '<div style="color:var(--dim); font-size:0.6rem;">' + _getCircleIcon() + ' No rank restrictions. All ranks allowed.</div>' : 
                allowedRanks.map(function(rank) {
                    return '<span class="rank-tag" data-rank-id="' + rank.id + '" style="display:inline-flex; align-items:center; gap:4px; padding:3px 8px; background:rgba(106,158,207,0.15); border:1px solid var(--accent); border-radius:16px; font-size:0.6rem; color:var(--accent);">' +
                        (rank.symbol || _getCircleIcon()) + ' ' + _escapeHtml(rank.name) +
                        '<button class="remove-rank-btn" data-type-id="' + type.id + '" data-rank-id="' + rank.id + '" style="background:none; border:none; color:var(--danger-lt); cursor:pointer; padding:0 4px; font-size:0.5rem;">' + _getCrossIcon() + '</button>' +
                        '</span>';
                }).join('')) +
            '</div>' +
            (availableRanks.length > 0 ? 
            '<div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">' +
            '<select id="addRank_' + type.id + '" class="add-rank-select" style="flex:1; min-width:120px; padding:4px 6px; background:rgba(9,12,18,0.8); border:1px solid var(--border); border-radius:4px; font-size:0.6rem; color:var(--text);">' +
            '<option value="">— Add rank —</option>' +
            availableRanks.map(function(r) {
                return '<option value="' + r.id + '">' + (r.symbol || _getCircleIcon()) + ' ' + _escapeHtml(r.name) + '</option>';
            }).join('') +
            '</select>' +
            '<button class="add-rank-btn btn small" data-type-id="' + type.id + '" style="padding:2px 8px; font-size:0.5rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:4px;cursor:pointer;">' + _getCheckIcon() + ' Add</button>' +
            '</div>' : 
            '<div style="font-size:0.55rem; color:var(--dim);">' + _getCircleIcon() + ' All ranks are already allowed or no ranks available.</div>') +
            '</div>' +

            '<div>' +
            '<div style="font-size:0.6rem; color:var(--accent); margin-bottom:6px;">' + _getHomeIcon() + ' Locations Using This Government</div>' +
            (places.length === 0 ? 
            '<div style="font-size:0.6rem; color:var(--dim);">' + _getCircleIcon() + ' No locations currently use this government type.</div>' : 
            '<div style="display:flex; flex-wrap:wrap; gap:6px;">' +
            places.map(function(place) {
                return '<span class="place-item clickable" data-place-id="' + place.id + '" style="display:inline-flex; align-items:center; gap:4px; padding:3px 8px; background:rgba(9,12,18,0.6); border:1px solid var(--border2); border-radius:4px; font-size:0.6rem; cursor:pointer;">' +
                    _getHomeIcon() + ' ' + _escapeHtml(place.displayName) +
                    '</span>';
            }).join('') +
            (hasMorePlaces ? '<span style="font-size:0.55rem; color:var(--dim);">+' + (getPlacesByGovernmentTypeCount(type.id) - 5) + ' more...</span>' : '') +
            '</div>') +
            '</div>' +
            '</div>';
    }

    // =========================================================================
    // 11. EVENT HANDLERS - FIXED: Add button properly calls modal
    // =========================================================================

    function attachGovernmentTypeActionHandlers(onRefresh) {
        var addBtn = document.getElementById('addGovTypeBtn');
        var refreshBtn = document.getElementById('refreshGovTypesBtn');
        var clearFiltersBtn = document.getElementById('clearGovTypeFiltersBtn');

        // FIXED: Add button - proper modal call
        if (addBtn && !addBtn._clickAttached) {
            addBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                _openAddGovernmentTypeModal(function(result) {
                    if (onRefresh) onRefresh();
                    if (result) {
                        _showToast('Government type created', 'success');
                    }
                });
            });
            addBtn._clickAttached = true;
        }

        if (refreshBtn && !refreshBtn._clickAttached) {
            refreshBtn.addEventListener('click', function() {
                if (onRefresh) onRefresh();
                _showToast('Government types refreshed', 'success');
            });
            refreshBtn._clickAttached = true;
        }

        if (clearFiltersBtn && !clearFiltersBtn._clickAttached) {
            clearFiltersBtn.addEventListener('click', function() {
                governmentTypesState.searchTerm = '';
                governmentTypesState.sortBy = 'name';
                var searchInput = document.getElementById('govTypeSearch');
                var sortSelect = document.getElementById('govTypeSort');
                if (searchInput) searchInput.value = '';
                if (sortSelect) sortSelect.value = 'name';
                if (onRefresh) onRefresh();
                _showToast('Filters cleared', 'info');
            });
            clearFiltersBtn._clickAttached = true;
        }
    }

    function attachGovernmentTypeFilterHandlers(onRefresh) {
        var searchInput = document.getElementById('govTypeSearch');
        var sortSelect = document.getElementById('govTypeSort');

        var updateFilters = function() {
            governmentTypesState.searchTerm = searchInput ? searchInput.value : '';
            governmentTypesState.sortBy = sortSelect ? sortSelect.value : 'name';
            if (onRefresh) onRefresh();
        };

        if (searchInput && !searchInput._inputAttached) {
            searchInput.addEventListener('input', updateFilters);
            searchInput._inputAttached = true;
        }

        if (sortSelect && !sortSelect._changeAttached) {
            sortSelect.addEventListener('change', updateFilters);
            sortSelect._changeAttached = true;
        }
    }

    function attachGovernmentTypeCardHandlers(onRefresh) {
        var container = document.getElementById('govTypesList') || document;

        if (container._delegateAttached) return;
        container._delegateAttached = true;

        container.addEventListener('click', function(e) {
            var editBtn = e.target.closest('.edit-gov-type-btn');
            if (editBtn) {
                e.stopPropagation();
                var typeId = editBtn.dataset.typeId;
                _openEditGovernmentTypeModal(typeId, onRefresh);
                return;
            }

            var deleteBtn = e.target.closest('.delete-gov-type-btn');
            if (deleteBtn) {
                e.stopPropagation();
                var typeId = deleteBtn.dataset.typeId;
                _openDeleteGovernmentTypeModal(typeId, onRefresh);
                return;
            }

            var expandBtn = e.target.closest('.expand-type-btn');
            if (expandBtn) {
                e.stopPropagation();
                var typeId = expandBtn.dataset.typeId;
                if (governmentTypesState.expandedTypeId === typeId) {
                    governmentTypesState.expandedTypeId = null;
                } else {
                    governmentTypesState.expandedTypeId = typeId;
                }
                if (onRefresh) onRefresh();
                return;
            }

            var header = e.target.closest('.government-type-header');
            if (header && !e.target.closest('button')) {
                var typeId = header.dataset.typeId;
                if (governmentTypesState.expandedTypeId === typeId) {
                    governmentTypesState.expandedTypeId = null;
                } else {
                    governmentTypesState.expandedTypeId = typeId;
                }
                if (onRefresh) onRefresh();
                return;
            }

            var addRankBtn = e.target.closest('.add-rank-btn');
            if (addRankBtn) {
                e.stopPropagation();
                var typeId = addRankBtn.dataset.typeId;
                var select = document.getElementById('addRank_' + typeId);
                var rankId = select ? select.value : null;

                if (rankId) {
                    var govType = _getGovernmentTypeById(typeId);
                    if (govType) {
                        if (!govType.allowedRankIds) govType.allowedRankIds = [];
                        if (govType.allowedRankIds.indexOf(rankId) === -1) {
                            govType.allowedRankIds.push(rankId);
                            _saveMasterData();
                            if (onRefresh) onRefresh();
                            var rank = _getRankById(rankId);
                            _showToast('Added ' + (rank ? rank.name : 'rank'), 'success');
                        } else {
                            _showToast('Rank already allowed', 'warning');
                        }
                    }
                } else {
                    _showToast('Select a rank', 'warning');
                }
                return;
            }

            var removeRankBtn = e.target.closest('.remove-rank-btn');
            if (removeRankBtn) {
                e.stopPropagation();
                var typeId = removeRankBtn.dataset.typeId;
                var rankId = removeRankBtn.dataset.rankId;

                var govType = _getGovernmentTypeById(typeId);
                if (govType && govType.allowedRankIds) {
                    govType.allowedRankIds = govType.allowedRankIds.filter(function(id) { return id !== rankId; });
                    _saveMasterData();
                    if (onRefresh) onRefresh();
                    var rank = _getRankById(rankId);
                    _showToast('Removed ' + (rank ? rank.name : 'rank'), 'info');
                }
                return;
            }

            var placeItem = e.target.closest('.place-item');
            if (placeItem) {
                e.stopPropagation();
                var placeId = placeItem.dataset.placeId;
                if (placeId && typeof window.selectPlaceInTree === 'function') {
                    window.selectPlaceInTree(placeId);
                }
                return;
            }
        });

        var descTextareas = document.querySelectorAll('.gov-type-desc');
        for (var i = 0; i < descTextareas.length; i++) {
            var textarea = descTextareas[i];
            if (textarea._blurAttached) continue;
            textarea.addEventListener('blur', function() {
                var typeId = this.id.split('_')[1];
                var govType = _getGovernmentTypeById(typeId);
                if (govType) {
                    govType.description = this.value;
                    _saveMasterData();
                    _showToast('Description saved', 'success');
                }
            });
            textarea._blurAttached = true;
        }
    }

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    window.renderGovernmentTypesTab = renderGovernmentTypesTab;
    window.governmentTypesState = governmentTypesState;

})();