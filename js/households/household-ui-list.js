/**
 * =============================================================================
 * HOUSEHOLD UI LIST (household-ui-list.js) - COMPLETE REWRITE
 * =============================================================================
 * 
 * PURPOSE: Renders household list with filters, search, and selection.
 * 
 * FIXED: Complete rewrite to prevent infinite render loops
 * FIXED: Clean separation of render and event handling
 * FIXED: Proper subscription management
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. STATE
    // =========================================================================

    var _renderLock = false;
    var _renderTimeout = null;
    var _isMounted = false;
    var _unsubscribe = null;

    var listState = {
        containerId: null,
        onSelectCallback: null,
        selectedId: null,
        searchTerm: '',
        statusFilter: 'all',
        locationFilter: 'all',
        filtersCollapsed: true,
        showPositions: false,
        _initialized: false
    };

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
        if (typeof window._getIcon === 'function') return window._getIcon(name);
        if (window.Icons && window.Icons[name]) return window.Icons[name];
        return '';
    }

    function _getIconSafe(name) {
        var icon = _getIcon(name);
        return icon || '';
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') return window.getCharacterById(id);
        return null;
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') return window.getPlaceById(id);
        return null;
    }

    function _getPlaces() {
        if (typeof window.getPlaces === 'function') return window.getPlaces();
        return window.masterData?.data?.places || [];
    }

    function _iconSpan(icon, title) {
        if (!icon) return '';
        var titleAttr = title ? ' title="' + _escapeHtml(title) + '"' : '';
        return '<span style="display:inline-flex;align-items:center;vertical-align:middle;' + (title ? 'cursor:help;' : '') + '"' + titleAttr + '>' + icon + '</span>';
    }

    // =========================================================================
    // 3. STATE HELPERS
    // =========================================================================

    var _state = window.HouseholdState;
    var _queries = window.HouseholdQueries;

    function _getHouseholds() {
        if (!_state) return [];
        try {
            return _state.getAllHouseholds() || [];
        } catch(e) {
            return [];
        }
    }

    function _getHouseholdStatusInfo(household) {
        if (!household) {
            return { status: 'nonexistent', statusIcon: _getIconSafe('X_HEAVY'), statusMessage: 'Does not exist', statusColor: '#6a6a6a', livingCount: 0, totalMembers: 0, deceasedCount: 0, isEmpty: true, isVacant: true, isActive: false };
        }

        if (household.status === 'deprecated') {
            return { status: 'deprecated', statusIcon: _getIconSafe('X_HEAVY'), statusMessage: 'Deprecated', statusColor: '#6a6a6a', livingCount: 0, totalMembers: 0, deceasedCount: 0, isEmpty: true, isVacant: true, isActive: false };
        }

        if (household.status === 'destroyed') {
            return { status: 'destroyed', statusIcon: _getIconSafe('X_HEAVY'), statusMessage: 'Destroyed', statusColor: '#8a2020', livingCount: 0, totalMembers: 0, deceasedCount: 0, isEmpty: true, isVacant: true, isActive: false };
        }

        var livingCount = 0;
        var deceasedCount = 0;
        var totalMembers = household.members ? household.members.length : 0;

        if (household.members) {
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

        var isEmpty = totalMembers === 0;
        var isVacant = livingCount === 0 && totalMembers > 0;
        var isActive = livingCount > 0;

        var status = 'active';
        var statusIcon = _getIconSafe('CIRCLE_DOT');
        var statusMessage = 'Active (' + livingCount + ' living)';
        var statusColor = '#4a9e6a';

        if (isEmpty) {
            status = 'empty';
            statusIcon = _getIconSafe('CIRCLE_OUTLINE');
            statusMessage = 'Empty (no members)';
            statusColor = '#9e9e9e';
        } else if (isVacant) {
            status = 'vacant';
            statusIcon = _getIconSafe('CIRCLE_HALF_LEFT');
            statusMessage = 'Vacant (' + deceasedCount + ' deceased)';
            statusColor = '#c87040';
        } else if (isActive) {
            var head = _state ? _state.getHouseholdHead(household.id) : null;
            statusIcon = head ? _getIconSafe('CROWN') : _getIconSafe('CIRCLE_DOT');
            statusMessage = 'Active (' + livingCount + ' living' + (deceasedCount > 0 ? ', ' + deceasedCount + ' deceased' : '') + ')';
            statusColor = '#4a9e6a';
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
            isVacant: isVacant,
            isActive: isActive
        };
    }

    function _getLocationName(locationId) {
        if (!locationId) return 'Unknown';
        if (locationId === 'all') return 'All Locations';
        if (locationId === 'unknown') return 'Unknown Location';
        var place = _getPlaceById(locationId);
        return place ? place.displayName : 'Unknown';
    }

    function _getAllDescendantIds(locationId) {
        var result = [locationId];
        if (!locationId || locationId === 'all' || locationId === 'unknown') return result;
        
        var place = _getPlaceById(locationId);
        if (!place) return result;
        
        var allPlaces = _getPlaces();
        var descendants = [];
        
        function findDescendants(parentId) {
            for (var i = 0; i < allPlaces.length; i++) {
                if (allPlaces[i].parentId === parentId) {
                    descendants.push(allPlaces[i].id);
                    findDescendants(allPlaces[i].id);
                }
            }
        }
        
        findDescendants(locationId);
        
        for (var i = 0; i < descendants.length; i++) {
            result.push(descendants[i]);
        }
        
        return result;
    }

    // =========================================================================
    // 4. PERSISTENCE
    // =========================================================================

    var STORAGE_KEY = 'household_list_state_v4';

    function _loadState() {
        try {
            var saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                var data = JSON.parse(saved);
                listState.searchTerm = data.searchTerm || '';
                listState.statusFilter = data.statusFilter || 'all';
                listState.locationFilter = data.locationFilter || 'all';
                listState.filtersCollapsed = data.filtersCollapsed !== undefined ? data.filtersCollapsed : true;
                listState.showPositions = data.showPositions || false;
            }
        } catch(e) {}
    }

    function _saveState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                searchTerm: listState.searchTerm,
                statusFilter: listState.statusFilter,
                locationFilter: listState.locationFilter,
                filtersCollapsed: listState.filtersCollapsed,
                showPositions: listState.showPositions
            }));
        } catch(e) {}
    }

    // =========================================================================
    // 5. BUILD LOCATION DROPDOWN
    // =========================================================================

    function _buildLocationDropdown(selectedId) {
        var places = _getPlaces();
        if (!places || places.length === 0) {
            return '<option value="all">— All Locations —</option>';
        }

        var html = '<option value="all"' + (selectedId === 'all' ? ' selected' : '') + '>— All Locations —</option>';
        
        // Simple flat list sorted by name
        var sorted = places.slice().sort(function(a, b) {
            return (a.displayName || '').localeCompare(b.displayName || '');
        });

        for (var i = 0; i < sorted.length; i++) {
            var p = sorted[i];
            var selected = (selectedId === p.id) ? 'selected' : '';
            var mark = p.isCapital ? ' ⭐' : '';
            html += '<option value="' + p.id + '" ' + selected + '>' + _escapeHtml(p.displayName || p.name || 'Unknown') + mark + '</option>';
        }
        
        html += '<option value="unknown"' + (selectedId === 'unknown' ? ' selected' : '') + '>Unknown Location</option>';
        
        return html;
    }

    // =========================================================================
    // 6. FILTER FUNCTION
    // =========================================================================

    function _applyFilters(households) {
        var filtered = households.slice();

        if (listState.searchTerm) {
            var searchLower = listState.searchTerm.toLowerCase();
            filtered = filtered.filter(function(h) {
                return h.name && h.name.toLowerCase().indexOf(searchLower) !== -1;
            });
        }

        if (listState.locationFilter !== 'all' && listState.locationFilter !== 'unknown') {
            var descendantIds = _getAllDescendantIds(listState.locationFilter);
            var idSet = {};
            for (var i = 0; i < descendantIds.length; i++) {
                idSet[descendantIds[i]] = true;
            }
            filtered = filtered.filter(function(h) {
                return h.locationId && idSet[h.locationId];
            });
        } else if (listState.locationFilter === 'unknown') {
            filtered = filtered.filter(function(h) {
                return !h.locationId || h.locationId === 'unknown';
            });
        }

        if (listState.statusFilter !== 'all') {
            filtered = filtered.filter(function(h) {
                var info = _getHouseholdStatusInfo(h);
                return info.status === listState.statusFilter;
            });
        }

        filtered.sort(function(a, b) {
            return (a.name || '').localeCompare(b.name || '');
        });

        return filtered;
    }

    // =========================================================================
    // 7. MAIN RENDER FUNCTION - CLEAN REWRITE
    // =========================================================================

    function renderHouseholdList(containerId, onSelect, preserveSelection) {
        // Prevent re-entrant rendering
        if (_renderLock) {
            // If we're already rendering, schedule a refresh but don't render now
            if (!_renderTimeout) {
                _renderTimeout = setTimeout(function() {
                    _renderTimeout = null;
                    renderHouseholdList(containerId, onSelect, preserveSelection);
                }, 200);
            }
            return;
        }

        _renderLock = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) {
                _renderLock = false;
                return;
            }

            // Initialize if needed
            if (!listState._initialized) {
                _loadState();
                listState._initialized = true;
            }

            listState.containerId = containerId;
            listState.onSelectCallback = onSelect;
            
            // Preserve selection
            if (!preserveSelection) {
                listState.selectedId = null;
            }

            // Get data
            var households = _getHouseholds();
            var filtered = _applyFilters(households);

            // Count stats
            var totalHouseholds = households.length;
            var activeCount = 0, vacantCount = 0, emptyCount = 0, deprecatedCount = 0, destroyedCount = 0;
            for (var i = 0; i < households.length; i++) {
                var info = _getHouseholdStatusInfo(households[i]);
                if (info.status === 'active') activeCount++;
                else if (info.status === 'vacant') vacantCount++;
                else if (info.status === 'empty') emptyCount++;
                else if (info.status === 'deprecated') deprecatedCount++;
                else if (info.status === 'destroyed') destroyedCount++;
            }

            // Build HTML
            var locationOptionsHtml = _buildLocationDropdown(listState.locationFilter);

            var html = '';
            
            // Filters
            html += '<div class="household-filters" style="padding:4px 6px;background:var(--bg2);border-bottom:1px solid var(--border);font-size:0.65rem;">';
            html += '<div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">';
            html += '<input type="text" id="householdSearchInput" placeholder="Search households" value="' + _escapeHtml(listState.searchTerm) + '" style="flex:2;min-width:60px;padding:4px 6px;background:var(--bg);border:1px solid var(--border);border-radius:3px;font-size:0.6rem;color:var(--text);">';
            html += '<span class="filter-toggle" style="cursor:pointer;font-size:0.6rem;padding:2px 4px;color:var(--accent);">' + (listState.filtersCollapsed ? '▶' : '▼') + '</span>';
            html += '<span style="font-size:0.5rem;color:var(--dim);margin-left:auto;">' + filtered.length + '/' + totalHouseholds + '</span>';
            html += '</div>';
            html += '<div class="filter-content" style="' + (listState.filtersCollapsed ? 'display:none;' : '') + 'margin-top:4px;">';
            html += '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:4px;">';
            html += '<select id="householdStatusFilter" style="flex:1;min-width:60px;padding:3px 4px;background:var(--bg);border:1px solid var(--border);border-radius:3px;font-size:0.6rem;color:var(--text);">';
            html += '<option value="all" ' + (listState.statusFilter === 'all' ? 'selected' : '') + '>All (' + totalHouseholds + ')</option>';
            html += '<option value="active" ' + (listState.statusFilter === 'active' ? 'selected' : '') + '>Active (' + activeCount + ')</option>';
            html += '<option value="vacant" ' + (listState.statusFilter === 'vacant' ? 'selected' : '') + '>Vacant (' + vacantCount + ')</option>';
            html += '<option value="empty" ' + (listState.statusFilter === 'empty' ? 'selected' : '') + '>Empty (' + emptyCount + ')</option>';
            if (deprecatedCount > 0) {
                html += '<option value="deprecated" ' + (listState.statusFilter === 'deprecated' ? 'selected' : '') + '>Deprecated (' + deprecatedCount + ')</option>';
            }
            if (destroyedCount > 0) {
                html += '<option value="destroyed" ' + (listState.statusFilter === 'destroyed' ? 'selected' : '') + '>Destroyed (' + destroyedCount + ')</option>';
            }
            html += '</select>';
            html += '<select id="householdLocationFilter" style="flex:1;min-width:60px;padding:3px 4px;background:var(--bg);border:1px solid var(--border);border-radius:3px;font-size:0.6rem;color:var(--text);">';
            html += locationOptionsHtml;
            html += '</select>';
            html += '</div>';
            html += '<div style="display:flex;gap:4px;flex-wrap:wrap;">';
            html += '<button id="clearHouseholdFiltersBtn" class="btn tiny" style="padding:1px 6px;font-size:0.5rem;background:var(--bg3);border:1px solid var(--border);border-radius:3px;cursor:pointer;color:var(--text);">Clear</button>';
            html += '<label style="display:flex;align-items:center;gap:4px;font-size:0.5rem;cursor:pointer;color:var(--dim);">';
            html += '<input type="checkbox" id="showPositionsToggle" ' + (listState.showPositions ? 'checked' : '') + ' style="cursor:pointer;">';
            html += 'Show Positions</label>';
            html += '</div>';
            html += '</div></div>';

            // Household list
            if (filtered.length === 0) {
                var msg = listState.searchTerm ? 'No households match your search' : 'No households found';
                html += '<div style="padding:20px;text-align:center;color:var(--dim);font-size:0.65rem;">' + msg + '</div>';
            } else {
                var locationIcon = _getIconSafe('LOCATION');
                var personIcon = _getIconSafe('PERSON');
                var warningIcon = _getIconSafe('WARNING');
                var positionIcon = _getIconSafe('CIRCLE_DOT');

                html += '<div style="padding:4px;">';
                for (var i = 0; i < filtered.length; i++) {
                    var h = filtered[i];
                    var isSelected = (listState.selectedId === h.id);
                    var statusInfo = _getHouseholdStatusInfo(h);
                    var locationName = _getLocationName(h.locationId);

                    var positionCount = 0, assignmentCount = 0;
                    if (listState.showPositions) {
                        var posData = _queries ? _queries.getHouseholdPositions({ householdId: h.id }) : [];
                        positionCount = posData.length;
                        var assignData = _state ? _state.getAssignmentsForHousehold(h.id, true) : [];
                        assignmentCount = assignData.length;
                    }

                    var positionInfo = '';
                    if (listState.showPositions) {
                        positionInfo = '<span title="Positions">' + _iconSpan(positionIcon) + ' ' + positionCount + '</span>' +
                            '<span title="Staff">' + _iconSpan(personIcon) + ' ' + assignmentCount + '</span>';
                    }

                    var statusBadge = '';
                    if (statusInfo.status === 'active') {
                        statusBadge = '<span style="font-size:0.4rem;color:#4a9e6a;padding:1px 4px;border:1px solid #4a9e6a;border-radius:8px;">' + statusInfo.livingCount + ' living</span>';
                    } else if (statusInfo.status === 'vacant') {
                        statusBadge = '<span style="font-size:0.4rem;color:#c87040;padding:1px 4px;border:1px solid #c87040;border-radius:8px;">Vacant</span>';
                    } else if (statusInfo.status === 'empty') {
                        statusBadge = '<span style="font-size:0.4rem;color:#9e9e9e;padding:1px 4px;border:1px solid #9e9e9e;border-radius:8px;">Empty</span>';
                    } else if (statusInfo.status === 'deprecated') {
                        statusBadge = '<span style="font-size:0.4rem;color:#6a6a6a;padding:1px 4px;border:1px solid #6a6a6a;border-radius:8px;">Deprecated</span>';
                    } else if (statusInfo.status === 'destroyed') {
                        statusBadge = '<span style="font-size:0.4rem;color:#8a2020;padding:1px 4px;border:1px solid #8a2020;border-radius:8px;">Destroyed</span>';
                    }

                    html += '<div class="household-item" data-id="' + _escapeHtml(h.id) + '" style="';
                    html += 'cursor:pointer;';
                    html += 'padding:4px 8px;';
                    html += 'margin-bottom:2px;';
                    html += 'background:' + (isSelected ? 'rgba(106,158,207,0.12)' : 'var(--bg3)') + ';';
                    html += 'border:1px solid ' + (isSelected ? 'var(--accent)' : 'var(--border)') + ';';
                    html += 'border-radius:3px;';
                    html += 'transition:all 0.1s;';
                    html += 'font-size:0.7rem;';
                    html += '">';
                    html += '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">';
                    html += '<div style="display:flex;align-items:center;gap:4px;min-width:0;flex:1;">';
                    html += '<span style="color:' + statusInfo.statusColor + ';font-size:0.6rem;">' + _iconSpan(statusInfo.statusIcon, statusInfo.statusMessage) + '</span>';
                    html += '<span style="font-weight:' + (isSelected ? 'bold' : 'normal') + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + _escapeHtml(h.name) + '</span>';
                    html += statusBadge;
                    html += '</div>';
                    html += '<div style="display:flex;gap:6px;font-size:0.5rem;color:var(--dim);flex-shrink:0;">';
                    html += '<span title="Members">' + _iconSpan(personIcon) + ' ' + statusInfo.totalMembers + '</span>';
                    if (positionInfo) {
                        html += positionInfo;
                    }
                    if (locationName && locationName !== 'Unknown') {
                        html += '<span title="Location">' + _iconSpan(locationIcon) + ' ' + _escapeHtml(locationName) + '</span>';
                    } else {
                        html += '<span title="No location" style="color:var(--warn);">' + _iconSpan(warningIcon) + ' None</span>';
                    }
                    html += '</div>';
                    html += '</div></div>';
                }
                html += '</div>';
            }

            // Set the HTML
            container.innerHTML = html;

            // =========================================================================
            // ATTACH EVENT HANDLERS - CLEAN
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
            var showPositionsToggle = document.getElementById('showPositionsToggle');

            // Apply filters function - with safety to prevent loops
            var applyFilters = function() {
                // Clear any pending render timeout
                if (_renderTimeout) {
                    clearTimeout(_renderTimeout);
                    _renderTimeout = null;
                }
                
                var searchVal = searchInput ? searchInput.value : '';
                var statusVal = statusFilter ? statusFilter.value : 'all';
                var locationVal = locationFilter ? locationFilter.value : 'all';
                var showPos = showPositionsToggle ? showPositionsToggle.checked : false;

                listState.searchTerm = searchVal;
                listState.statusFilter = statusVal;
                listState.locationFilter = locationVal;
                listState.showPositions = showPos;
                _saveState();

                // Schedule a render with a delay to prevent loops
                _renderTimeout = setTimeout(function() {
                    _renderTimeout = null;
                    renderHouseholdList(listState.containerId, listState.onSelectCallback, true);
                }, 50);
            };

            var debouncedApply = function() {
                if (_renderTimeout) {
                    clearTimeout(_renderTimeout);
                    _renderTimeout = null;
                }
                _renderTimeout = setTimeout(applyFilters, 300);
            };

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

            if (showPositionsToggle) {
                showPositionsToggle.onchange = applyFilters;
            }

            if (clearBtn) {
                clearBtn.onclick = function() {
                    if (searchInput) searchInput.value = '';
                    if (statusFilter) statusFilter.value = 'all';
                    if (locationFilter) locationFilter.value = 'all';
                    if (showPositionsToggle) showPositionsToggle.checked = false;
                    
                    listState.searchTerm = '';
                    listState.statusFilter = 'all';
                    listState.locationFilter = 'all';
                    listState.showPositions = false;
                    _saveState();

                    if (_renderTimeout) {
                        clearTimeout(_renderTimeout);
                        _renderTimeout = null;
                    }
                    _renderTimeout = setTimeout(function() {
                        _renderTimeout = null;
                        renderHouseholdList(listState.containerId, listState.onSelectCallback, true);
                    }, 50);
                };
            }

            // Household item click - using event delegation on the container
            // Remove any existing listeners by replacing the container's onclick
            container.onclick = function(e) {
                var item = e.target.closest('.household-item');
                if (!item) return;
                
                var clickedId = item.dataset.id;
                if (!clickedId) return;
                
                // Update selection
                if (listState.selectedId !== clickedId) {
                    listState.selectedId = clickedId;
                    
                    // Update styles
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

            // Hover effects
            container.onmouseover = function(e) {
                var item = e.target.closest('.household-item');
                if (item) {
                    var id = item.dataset.id;
                    if (id && id !== listState.selectedId) {
                        item.style.background = 'var(--bg2)';
                    }
                }
            };

            container.onmouseout = function(e) {
                var item = e.target.closest('.household-item');
                if (item) {
                    var id = item.dataset.id;
                    if (id && id !== listState.selectedId) {
                        item.style.background = 'var(--bg3)';
                    }
                }
            };

            // =========================================================================
            // SUBSCRIPTION - Single, safe subscription
            // =========================================================================
            
            if (_state && typeof _state.subscribe === 'function') {
                // Unsubscribe from previous
                if (_unsubscribe) {
                    try { _unsubscribe(); } catch(e) {}
                    _unsubscribe = null;
                }
                
                // Only subscribe once
                if (!listState._subscribed) {
                    listState._subscribed = true;
                    _unsubscribe = _state.subscribe(function(event) {
                        // Only respond to external changes
                        if (event.type === 'change' || event.type === 'refresh') {
                            var containerCheck = document.getElementById(listState.containerId);
                            if (containerCheck && !_renderLock) {
                                if (_renderTimeout) {
                                    clearTimeout(_renderTimeout);
                                    _renderTimeout = null;
                                }
                                _renderTimeout = setTimeout(function() {
                                    _renderTimeout = null;
                                    renderHouseholdList(listState.containerId, listState.onSelectCallback, true);
                                }, 100);
                            }
                        }
                    });
                }
            }

        } catch (e) {
            // Silent fail
        } finally {
            _renderLock = false;
        }
    }

    // =========================================================================
    // 8. UTILITY FUNCTIONS
    // =========================================================================

    function selectHousehold(id) {
        if (!id) return;
        listState.selectedId = id;
        
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
        return listState.selectedId;
    }

    function refreshHouseholdList() {
        if (listState.containerId) {
            if (_renderTimeout) {
                clearTimeout(_renderTimeout);
                _renderTimeout = null;
            }
            _renderTimeout = setTimeout(function() {
                _renderTimeout = null;
                renderHouseholdList(listState.containerId, listState.onSelectCallback, true);
            }, 50);
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
        listState.showPositions = false;
        _saveState();
        refreshHouseholdList();
    }

    // =========================================================================
    // 9. POSITION AND STAFF LIST FUNCTIONS (Minimal versions)
    // =========================================================================

    function renderHouseholdPositionList(containerId, householdId, options) {
        var container = document.getElementById(containerId);
        if (!container) return;
        
        try {
            options = options || {};
            var positions = _state ? _state.getHouseholdPositions({ householdId: householdId }) : [];
            
            var html = '<div class="household-position-list">';
            if (positions.length === 0) {
                html += '<div style="text-align:center;padding:20px;color:var(--dim);font-size:0.6rem;">No positions created</div>';
            } else {
                for (var i = 0; i < positions.length; i++) {
                    var p = positions[i];
                    html += '<div style="padding:4px 8px;background:var(--bg3);border-radius:4px;margin-bottom:2px;border-left:2px solid var(--accent);">';
                    html += '<span style="font-size:0.65rem;">' + _escapeHtml(p.name) + '</span>';
                    html += '</div>';
                }
            }
            html += '</div>';
            container.innerHTML = html;
        } catch(e) {
            container.innerHTML = '<div style="color:var(--dim);text-align:center;padding:20px;">Error loading positions</div>';
        }
    }

    function renderHouseholdStaffList(containerId, householdId, options) {
        var container = document.getElementById(containerId);
        if (!container) return;
        
        try {
            var staff = _queries ? _queries.getHouseholdStaff(householdId, { activeOnly: true }) : [];
            
            var html = '<div class="household-staff-list">';
            if (staff.length === 0) {
                html += '<div style="text-align:center;padding:20px;color:var(--dim);font-size:0.6rem;">No staff members</div>';
            } else {
                for (var i = 0; i < staff.length; i++) {
                    var s = staff[i];
                    html += '<div style="padding:4px 8px;background:var(--bg3);border-radius:4px;margin-bottom:2px;border-left:2px solid var(--border);">';
                    html += '<span style="font-size:0.6rem;">' + _escapeHtml(s.characterName) + '</span>';
                    if (s.role) html += ' <span style="font-size:0.5rem;color:var(--dim);">(' + _escapeHtml(s.role) + ')</span>';
                    html += '</div>';
                }
            }
            html += '</div>';
            container.innerHTML = html;
        } catch(e) {
            container.innerHTML = '<div style="color:var(--dim);text-align:center;padding:20px;">Error loading staff</div>';
        }
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.renderHouseholdList = renderHouseholdList;
    window.renderHouseholdPositionList = renderHouseholdPositionList;
    window.renderHouseholdStaffList = renderHouseholdStaffList;
    window.selectHousehold = selectHousehold;
    window.getSelectedHouseholdId = getSelectedHouseholdId;
    window.refreshHouseholdList = refreshHouseholdList;
    window.searchHouseholds = searchHouseholds;
    window.filterHouseholdsByStatus = filterHouseholdsByStatus;
    window.filterHouseholdsByLocation = filterHouseholdsByLocation;
    window.clearHouseholdFilters = clearHouseholdFilters;
    window.householdListState = listState;

})();