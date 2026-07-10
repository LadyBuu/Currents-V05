/**
 * =============================================================================
 * HOUSEHOLD UI LIST (household-ui-list.js)
 * =============================================================================
 * 
 * PURPOSE: Renders household list with filters, search, and selection.
 *          Uses HouseholdState for data and subscribes to changes.
 * 
 * DEPENDS ON:
 *   - household-state.js (HouseholdState)
 *   - household-queries.js (HouseholdQueries)
 *   - modals-core.js (_escapeHtml, _getIcon, _showToast)
 * 
 * EXPORTS:
 *   - renderHouseholdList() - Render household list with filters
 *   - selectHousehold() - Select a household by ID
 *   - getSelectedHouseholdId() - Get selected household ID
 *   - refreshHouseholdList() - Refresh the list
 *   - searchHouseholds() - Search by name
 *   - filterHouseholdsByStatus() - Filter by status
 *   - filterHouseholdsByLocation() - Filter by location
 *   - clearHouseholdFilters() - Clear all filters
 *   - householdListState - Expose state for debugging
 * 
 * ICON POLICY:
 *   - All icons from icons.js via _getIcon()
 *   - NO emojis
 *   - NO icons in search field placeholder
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. RECURSION GUARD
    // =========================================================================

    var _rendering = false;

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') {
            return window._escapeHtml(str);
        }
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(str);
        }
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

    function _getIcon(name) {
        if (typeof window._getIcon === 'function') {
            return window._getIcon(name);
        }
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    function _getCurrentYear() {
        if (typeof window._getCurrentYear === 'function') {
            return window._getCurrentYear();
        }
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        if (typeof window.getCurrentYear === 'function') {
            return window.getCurrentYear();
        }
        return 1250;
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
        }
        return null;
    }

    function _getPlaces() {
        if (typeof window.getPlaces === 'function') {
            return window.getPlaces();
        }
        return window.masterData?.data?.places || [];
    }

    // =========================================================================
    // 2. STATE REFERENCE
    // =========================================================================

    var _state = window.HouseholdState;
    var _queries = window.HouseholdQueries;

    // =========================================================================
    // 3. ICON HELPERS
    // =========================================================================

    function _getIconSafe(name) {
        var icon = _getIcon(name);
        return icon || '';
    }

    function _iconSpan(icon, title) {
        if (!icon) return '';
        var titleAttr = title ? ' title="' + _escapeHtml(title) + '"' : '';
        return '<span style="display:inline-flex;align-items:center;vertical-align:middle;' + (title ? 'cursor:help;' : '') + '"' + titleAttr + '>' + icon + '</span>';
    }

    // =========================================================================
    // 4. STATE
    // =========================================================================

    var HOUSEHOLD_STORAGE_KEY = 'household_list_state_v3';

    var listState = {
        containerId: null,
        onSelectCallback: null,
        selection: null,
        searchTerm: '',
        statusFilter: 'all',
        locationFilter: 'all',
        filtersCollapsed: true,
        _initialized: false
    };

    // Selection manager
    var selection = {
        _selected: null,
        isSelected: function(id) { return this._selected === id; },
        select: function(id) { this._selected = id; },
        get: function() { return this._selected; },
        clear: function() { this._selected = null; }
    };

    listState.selection = selection;

    // =========================================================================
    // 5. PERSISTENCE
    // =========================================================================

    function _loadState() {
        try {
            var saved = localStorage.getItem(HOUSEHOLD_STORAGE_KEY);
            if (saved) {
                var data = JSON.parse(saved);
                listState.searchTerm = data.searchTerm || '';
                listState.statusFilter = data.statusFilter || 'all';
                listState.locationFilter = data.locationFilter || 'all';
                listState.filtersCollapsed = data.filtersCollapsed !== undefined ? data.filtersCollapsed : true;
            }
        } catch (e) {
            // Silent fail
        }
    }

    function _saveState() {
        try {
            localStorage.setItem(HOUSEHOLD_STORAGE_KEY, JSON.stringify({
                searchTerm: listState.searchTerm,
                statusFilter: listState.statusFilter,
                locationFilter: listState.locationFilter,
                filtersCollapsed: listState.filtersCollapsed
            }));
        } catch (e) {
            // Silent fail
        }
    }

    // =========================================================================
    // 6. HELPER FUNCTIONS
    // =========================================================================

    /**
     * Gets detailed household status info
     */
    function _getHouseholdStatusInfo(household) {
        if (!household) {
            return {
                status: 'nonexistent',
                statusIcon: _getIconSafe('X_HEAVY'),
                statusMessage: 'Does not exist',
                statusColor: '#6a6a6a',
                livingCount: 0,
                totalMembers: 0,
                deceasedCount: 0,
                isEmpty: true,
                isVacant: true
            };
        }

        var livingCount = 0;
        var deceasedCount = 0;

        if (household.members && household.members.length) {
            for (var i = 0; i < household.members.length; i++) {
                var character = _getCharacterById(household.members[i].characterId);
                if (character) {
                    if (character.isDeceased) {
                        deceasedCount++;
                    } else {
                        livingCount++;
                    }
                } else {
                    deceasedCount++;
                }
            }
        }

        var totalMembers = household.members ? household.members.length : 0;
        var isEmpty = totalMembers === 0;
        var isVacant = livingCount === 0 && deceasedCount > 0;

        var status = 'active';
        var statusIcon = _getIconSafe('CIRCLE_DOT');
        var statusMessage = 'Occupied and active';
        var statusColor = '#4a9e6a';

        if (isEmpty) {
            status = 'empty';
            statusIcon = _getIconSafe('CIRCLE_OUTLINE');
            statusMessage = 'Empty - no members';
            statusColor = '#9e9e9e';
        } else if (isVacant) {
            status = 'vacant';
            statusIcon = _getIconSafe('CIRCLE_HALF_LEFT');
            statusMessage = 'Vacant - only deceased remain';
            statusColor = '#c87040';
        }

        // Override with stored status
        if (household.status && household.status !== 'active') {
            status = household.status;
            if (status === 'abandoned') {
                statusIcon = _getIconSafe('X_HEAVY');
                statusMessage = 'Abandoned';
                statusColor = '#8a3020';
            } else if (status === 'vacant') {
                statusIcon = _getIconSafe('CIRCLE_HALF_LEFT');
                statusMessage = 'Vacant';
                statusColor = '#c87040';
            } else if (status === 'deprecated') {
                statusIcon = _getIconSafe('X_HEAVY');
                statusMessage = 'Deprecated';
                statusColor = '#6a6a6a';
            }
        }

        return {
            status: status,
            statusIcon: statusIcon,
            statusMessage: statusMessage,
            statusColor: statusColor,
            livingCount: livingCount,
            deceasedCount: deceasedCount,
            totalMembers: totalMembers,
            isEmpty: isEmpty,
            isVacant: isVacant
        };
    }

    /**
     * Gets location name from ID
     */
    function _getLocationName(locationId) {
        if (!locationId) return 'Unknown';
        if (locationId === 'all') return 'All Locations';
        if (locationId === 'unknown') return 'Unknown Location';
        var place = _getPlaceById(locationId);
        return place ? place.displayName : 'Unknown';
    }

    /**
     * Gets all locations with hierarchical display names
     */
    function _getAllLocations() {
        var places = _getPlaces();
        var result = [];
        var locationMap = {};

        // Build map
        for (var i = 0; i < places.length; i++) {
            var place = places[i];
            if (place.variableKey !== undefined && place.variableKey !== '') {
                var displayName = place.displayName || place.name || 'Unknown';
                var parentId = place.parentId || null;
                locationMap[place.id] = {
                    id: place.id,
                    name: displayName,
                    displayName: displayName,
                    parentId: parentId,
                    children: []
                };
            }
        }

        // Build hierarchy
        var roots = [];
        for (var id in locationMap) {
            var node = locationMap[id];
            if (node.parentId && locationMap[node.parentId]) {
                locationMap[node.parentId].children.push(node);
            } else {
                roots.push(node);
            }
        }

        // Sort
        roots.sort(function(a, b) { return a.name.localeCompare(b.name); });
        for (var id in locationMap) {
            if (locationMap[id].children.length > 0) {
                locationMap[id].children.sort(function(a, b) { return a.name.localeCompare(b.name); });
            }
        }

        // Flatten with indentation
        function flattenNodes(nodes, depth) {
            depth = depth || 0;
            var flat = [];
            var indent = '';
            for (var j = 0; j < depth; j++) {
                indent += '  ';
            }
            for (var i = 0; i < nodes.length; i++) {
                var node = nodes[i];
                var displayWithIndent = indent + node.name;
                flat.push({
                    id: node.id,
                    name: node.name,
                    displayName: displayWithIndent,
                    depth: depth
                });
                if (node.children.length > 0) {
                    var childFlat = flattenNodes(node.children, depth + 1);
                    flat = flat.concat(childFlat);
                }
            }
            return flat;
        }

        return flattenNodes(roots);
    }

    /**
     * Debounce helper
     */
    function _debounce(fn, delay) {
        var timeoutId;
        return function() {
            var args = arguments;
            var context = this;
            clearTimeout(timeoutId);
            timeoutId = setTimeout(function() { fn.apply(context, args); }, delay);
        };
    }

    // =========================================================================
    // 7. FILTER FUNCTIONS
    // =========================================================================

    function _applyFilters(households) {
        var filtered = households.slice();

        // Search filter - plain text search on name only
        if (listState.searchTerm) {
            var searchLower = listState.searchTerm.toLowerCase();
            filtered = filtered.filter(function(h) {
                return h.name && h.name.toLowerCase().indexOf(searchLower) !== -1;
            });
        }

        // Location filter
        if (listState.locationFilter !== 'all') {
            filtered = filtered.filter(function(h) {
                return h.locationId === listState.locationFilter;
            });
        }

        // Status filter
        if (listState.statusFilter !== 'all') {
            filtered = filtered.filter(function(h) {
                var statusInfo = _getHouseholdStatusInfo(h);
                return statusInfo.status === listState.statusFilter;
            });
        }

        // Sort by name
        filtered.sort(function(a, b) {
            return (a.name || '').localeCompare(b.name || '');
        });

        return filtered;
    }

    // =========================================================================
    // 8. RENDER FUNCTION
    // =========================================================================

    function renderHouseholdList(containerId, onSelect, preserveSelection) {
        if (_rendering) {
            return;
        }
        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) {
                return;
            }

            // Initialize state
            if (!listState._initialized) {
                _loadState();
                listState._initialized = true;
            }

            listState.containerId = containerId;
            listState.onSelectCallback = onSelect;

            // Get data
            var households = _state ? _state.getAllHouseholds() : [];
            if (!households || !Array.isArray(households)) {
                households = [];
            }

            var allLocations = _getAllLocations();

            // Apply filters
            var filtered = _applyFilters(households);

            // Count totals
            var totalHouseholds = households.length;
            var activeCount = 0;
            var vacantCount = 0;
            var emptyCount = 0;

            for (var i = 0; i < households.length; i++) {
                var info = _getHouseholdStatusInfo(households[i]);
                if (info.status === 'active') activeCount++;
                else if (info.status === 'vacant') vacantCount++;
                else if (info.status === 'empty') emptyCount++;
            }

            // Build location options
            var locationOptionsHtml = '<option value="all">All Locations</option>';
            for (var i = 0; i < allLocations.length; i++) {
                var loc = allLocations[i];
                var selected = (listState.locationFilter === loc.id) ? 'selected' : '';
                var indent = '';
                for (var j = 0; j < loc.depth; j++) {
                    indent += '  ';
                }
                locationOptionsHtml += '<option value="' + _escapeHtml(loc.id) + '" ' + selected + '>' +
                    indent + _escapeHtml(loc.name) +
                    '</option>';
            }

            // Build filter bar - NO ICONS in search field, plain text only
            var filterBarHtml = '';
            filterBarHtml += '<div class="household-filters" style="padding:4px 6px;background:var(--bg2);border-bottom:1px solid var(--border);font-size:0.65rem;">';
            filterBarHtml += '<div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">';
            filterBarHtml += '<input type="text" id="householdSearchInput" placeholder="Search households" value="' + _escapeHtml(listState.searchTerm) + '" style="flex:2;min-width:60px;padding:4px 6px;background:var(--bg);border:1px solid var(--border);border-radius:3px;font-size:0.6rem;color:var(--text);">';
            filterBarHtml += '<span class="filter-toggle" style="cursor:pointer;font-size:0.6rem;padding:2px 4px;color:var(--accent);">' + (listState.filtersCollapsed ? '▶' : '▼') + '</span>';
            filterBarHtml += '<span style="font-size:0.5rem;color:var(--dim);margin-left:auto;">' + filtered.length + '/' + totalHouseholds + '</span>';
            filterBarHtml += '</div>';
            filterBarHtml += '<div class="filter-content" style="' + (listState.filtersCollapsed ? 'display:none;' : '') + 'margin-top:4px;">';
            filterBarHtml += '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:4px;">';
            filterBarHtml += '<select id="householdStatusFilter" style="flex:1;min-width:60px;padding:3px 4px;background:var(--bg);border:1px solid var(--border);border-radius:3px;font-size:0.6rem;color:var(--text);">';
            filterBarHtml += '<option value="all" ' + (listState.statusFilter === 'all' ? 'selected' : '') + '>All (' + totalHouseholds + ')</option>';
            filterBarHtml += '<option value="active" ' + (listState.statusFilter === 'active' ? 'selected' : '') + '>Active (' + activeCount + ')</option>';
            filterBarHtml += '<option value="vacant" ' + (listState.statusFilter === 'vacant' ? 'selected' : '') + '>Vacant (' + vacantCount + ')</option>';
            filterBarHtml += '<option value="empty" ' + (listState.statusFilter === 'empty' ? 'selected' : '') + '>Empty (' + emptyCount + ')</option>';
            filterBarHtml += '</select>';
            filterBarHtml += '<select id="householdLocationFilter" style="flex:1;min-width:60px;padding:3px 4px;background:var(--bg);border:1px solid var(--border);border-radius:3px;font-size:0.6rem;color:var(--text);">';
            filterBarHtml += locationOptionsHtml;
            filterBarHtml += '</select>';
            filterBarHtml += '</div>';
            filterBarHtml += '<div style="display:flex;gap:4px;">';
            filterBarHtml += '<button id="clearHouseholdFiltersBtn" class="btn tiny" style="padding:1px 6px;font-size:0.5rem;background:var(--bg3);border:1px solid var(--border);border-radius:3px;cursor:pointer;color:var(--text);">Clear</button>';
            filterBarHtml += '</div>';
            filterBarHtml += '</div></div>';

            // Build households list
            var householdsHtml = '';
            if (filtered.length === 0) {
                var emptyMessage = 'No households found';
                if (listState.searchTerm) emptyMessage = 'No households match your search';
                householdsHtml = '<div style="padding:20px;text-align:center;color:var(--dim);font-size:0.65rem;">' + emptyMessage + '</div>';
            } else {
                var locationIcon = _getIconSafe('LOCATION');
                var personIcon = _getIconSafe('PERSON');
                var warningIcon = _getIconSafe('WARNING');

                householdsHtml = '<div style="padding:4px;">';
                for (var i = 0; i < filtered.length; i++) {
                    var h = filtered[i];
                    var isSelected = listState.selection.isSelected(h.id);
                    var statusInfo = _getHouseholdStatusInfo(h);
                    var locationName = _getLocationName(h.locationId);
                    var locationDisplay = (locationName && locationName !== 'Unknown') ? locationName : 'None';

                    householdsHtml += '<div class="household-item" data-id="' + _escapeHtml(h.id) + '" style="';
                    householdsHtml += 'cursor:pointer;';
                    householdsHtml += 'padding:4px 8px;';
                    householdsHtml += 'margin-bottom:2px;';
                    householdsHtml += 'background:' + (isSelected ? 'rgba(106,158,207,0.12)' : 'var(--bg3)') + ';';
                    householdsHtml += 'border:1px solid ' + (isSelected ? 'var(--accent)' : 'var(--border)') + ';';
                    householdsHtml += 'border-radius:3px;';
                    householdsHtml += 'transition:all 0.1s;';
                    householdsHtml += 'font-size:0.7rem;';
                    householdsHtml += '">';
                    householdsHtml += '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">';
                    householdsHtml += '<div style="display:flex;align-items:center;gap:4px;min-width:0;flex:1;">';
                    householdsHtml += '<span style="color:' + statusInfo.statusColor + ';font-size:0.6rem;">' + _iconSpan(statusInfo.statusIcon, statusInfo.statusMessage) + '</span>';
                    householdsHtml += '<span style="font-weight:' + (isSelected ? 'bold' : 'normal') + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + _escapeHtml(h.name) + '</span>';
                    householdsHtml += '</div>';
                    householdsHtml += '<div style="display:flex;gap:6px;font-size:0.5rem;color:var(--dim);flex-shrink:0;">';
                    householdsHtml += '<span title="Members">' + _iconSpan(personIcon) + ' ' + statusInfo.totalMembers + '</span>';
                    if (locationName && locationName !== 'Unknown') {
                        householdsHtml += '<span title="Location">' + _iconSpan(locationIcon) + ' ' + _escapeHtml(locationName) + '</span>';
                    } else {
                        householdsHtml += '<span title="No location" style="color:var(--warn);">' + _iconSpan(warningIcon) + ' None</span>';
                    }
                    householdsHtml += '</div>';
                    householdsHtml += '</div></div>';
                }
                householdsHtml += '</div>';
            }

            container.innerHTML = filterBarHtml + householdsHtml;

            // =========================================================================
            // EVENT HANDLERS
            // =========================================================================

            // Filter toggle
            var filterToggle = container.querySelector('.filter-toggle');
            var filterContent = container.querySelector('.filter-content');
            if (filterToggle && filterContent) {
                filterToggle.onclick = function() {
                    var isHidden = filterContent.style.display === 'none';
                    filterContent.style.display = isHidden ? 'block' : 'none';
                    filterToggle.textContent = isHidden ? '▼' : '▶';
                    listState.filtersCollapsed = !isHidden;
                    _saveState();
                };
            }

            // Search input
            var searchInput = document.getElementById('householdSearchInput');
            var statusFilter = document.getElementById('householdStatusFilter');
            var locationFilter = document.getElementById('householdLocationFilter');
            var clearBtn = document.getElementById('clearHouseholdFiltersBtn');

            // Apply filters with debounce
            var applyFilters = function() {
                listState.searchTerm = searchInput ? searchInput.value : '';
                listState.statusFilter = statusFilter ? statusFilter.value : 'all';
                listState.locationFilter = locationFilter ? locationFilter.value : 'all';
                _saveState();
                renderHouseholdList(listState.containerId, listState.onSelectCallback, true);
            };

            var debouncedApply = _debounce(applyFilters, 300);

            if (searchInput) {
                searchInput.oninput = debouncedApply;
                searchInput.placeholder = 'Search households';
            }

            if (statusFilter) {
                statusFilter.onchange = applyFilters;
            }

            if (locationFilter) {
                locationFilter.onchange = applyFilters;
            }

            if (clearBtn) {
                clearBtn.onclick = function() {
                    if (searchInput) searchInput.value = '';
                    if (statusFilter) statusFilter.value = 'all';
                    if (locationFilter) locationFilter.value = 'all';
                    listState.searchTerm = '';
                    listState.statusFilter = 'all';
                    listState.locationFilter = 'all';
                    _saveState();
                    renderHouseholdList(listState.containerId, listState.onSelectCallback, true);
                };
            }

            // Click handlers for household items
            var items = container.querySelectorAll('.household-item');
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                var newItem = item.cloneNode(true);
                if (item.parentNode) {
                    item.parentNode.replaceChild(newItem, item);
                }

                (function(el) {
                    el.onclick = function(e) {
                        e.stopPropagation();
                        var clickedId = el.dataset.id;

                        if (!listState.selection.isSelected(clickedId)) {
                            listState.selection.select(clickedId);

                            var allItems = container.querySelectorAll('.household-item');
                            for (var j = 0; j < allItems.length; j++) {
                                var it = allItems[j];
                                if (it.dataset.id === clickedId) {
                                    it.style.background = 'rgba(106,158,207,0.12)';
                                    it.style.borderColor = 'var(--accent)';
                                } else {
                                    it.style.background = 'var(--bg3)';
                                    it.style.borderColor = 'var(--border)';
                                }
                            }
                        }

                        if (listState.onSelectCallback && typeof listState.onSelectCallback === 'function') {
                            listState.onSelectCallback(clickedId);
                        }
                    };
                })(newItem);
            }

            // Subscribe to state changes
            if (_state && typeof _state.subscribe === 'function' && !listState._subscribed) {
                listState._subscribed = true;
                _state.subscribe(function(event) {
                    if (event.type === 'change' || event.type === 'refresh') {
                        // Only refresh if the container is still in the DOM
                        var containerCheck = document.getElementById(listState.containerId);
                        if (containerCheck) {
                            renderHouseholdList(listState.containerId, listState.onSelectCallback, true);
                        }
                    }
                });
            }

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 9. UTILITY FUNCTIONS
    // =========================================================================

    function selectHousehold(id) {
        if (!listState.selection) return;

        listState.selection.select(id);

        var container = document.getElementById(listState.containerId);
        if (container) {
            var items = container.querySelectorAll('.household-item');
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                if (item.dataset.id === id) {
                    item.style.background = 'rgba(106,158,207,0.12)';
                    item.style.borderColor = 'var(--accent)';
                } else {
                    item.style.background = 'var(--bg3)';
                    item.style.borderColor = 'var(--border)';
                }
            }
        }

        if (listState.onSelectCallback && typeof listState.onSelectCallback === 'function') {
            listState.onSelectCallback(id);
        }
    }

    function getSelectedHouseholdId() {
        return listState.selection ? listState.selection.get() : null;
    }

    function refreshHouseholdList() {
        if (listState.containerId) {
            renderHouseholdList(
                listState.containerId,
                listState.onSelectCallback,
                true
            );
        }
    }

    function searchHouseholds(term) {
        listState.searchTerm = term || '';
        _saveState();
        refreshHouseholdList();
    }

    function filterHouseholdsByStatus(status) {
        listState.statusFilter = status || 'all';
        _saveState();
        refreshHouseholdList();
    }

    function filterHouseholdsByLocation(locationId) {
        listState.locationFilter = locationId || 'all';
        _saveState();
        refreshHouseholdList();
    }

    function clearHouseholdFilters() {
        listState.searchTerm = '';
        listState.statusFilter = 'all';
        listState.locationFilter = 'all';
        _saveState();
        refreshHouseholdList();
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.renderHouseholdList = renderHouseholdList;
    window.selectHousehold = selectHousehold;
    window.getSelectedHouseholdId = getSelectedHouseholdId;
    window.refreshHouseholdList = refreshHouseholdList;
    window.searchHouseholds = searchHouseholds;
    window.filterHouseholdsByStatus = filterHouseholdsByStatus;
    window.filterHouseholdsByLocation = filterHouseholdsByLocation;
    window.clearHouseholdFilters = clearHouseholdFilters;
    window.householdListState = listState;

    // ES Module exports
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            renderHouseholdList: renderHouseholdList,
            selectHousehold: selectHousehold,
            getSelectedHouseholdId: getSelectedHouseholdId,
            refreshHouseholdList: refreshHouseholdList,
            searchHouseholds: searchHouseholds,
            filterHouseholdsByStatus: filterHouseholdsByStatus,
            filterHouseholdsByLocation: filterHouseholdsByLocation,
            clearHouseholdFilters: clearHouseholdFilters,
            householdListState: listState
        };
    }

})();