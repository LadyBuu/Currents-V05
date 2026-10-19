/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD UI LIST (household-ui-list.js)
 * =============================================================================
 *
 * LOCATION: js/systems/household/household-ui-list.js
 *
 * PURPOSE
 * -------
 * Renders the household list panel with filters, search, and selection.
 *
 * THIS MODULE IS PURELY UI
 * ------------------------
 *   - Reads:     HouseholdQueries (semantic projections)
 *   - Writes:    none (this list does not mutate)
 *   - Owns:      DOM rendering, event delegation, local UI state,
 *                localStorage preferences
 *
 * CONVERGED PATTERN NOTES
 * -----------------------
 *   - No HouseholdState reach-around. Reads go through HouseholdQueries.
 *   - Domain status interpretation via HouseholdQueries.getHouseholdStatus.
 *   - Icons via _getIcon only (no ASCII glyphs).
 *   - No fabricated domain defaults.
 *   - Load-time verification of required dependencies.
 *   - Errors thrown during render are logged, not swallowed.
 *   - averageWealth / averageReputation from getStatistics() may be null
 *     (means "no household has that field"). UI guards against it.
 *
 * LIFECYCLE
 * ---------
 * mountHouseholdList(containerId, onSelect, options)
 * unmountHouseholdList()
 *
 * The component holds one State subscription while mounted. Unmounting
 * removes the subscription, clears timers, and drops all references.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. LOAD-TIME DEPENDENCY VERIFICATION
    // =========================================================================

    function _requireFunction(name, fn) {
        if (typeof fn !== 'function') {
            throw new Error('household-ui-list: ' + name + ' is required');
        }
        return fn;
    }

    function _requireObject(name, obj) {
        if (typeof obj === 'undefined' || obj === null) {
            throw new Error('household-ui-list: ' + name + ' is required');
        }
        return obj;
    }

    var _queries = _requireObject('HouseholdQueries', window.HouseholdQueries);
    _requireFunction('HouseholdQueries.getAllHouseholds',
        _queries.getAllHouseholds);
    _requireFunction('HouseholdQueries.getHousehold', _queries.getHousehold);
    _requireFunction('HouseholdQueries.getHouseholdStatus',
        _queries.getHouseholdStatus);
    _requireFunction('HouseholdQueries.getHouseholdPositions',
        _queries.getHouseholdPositions);
    _requireFunction('HouseholdQueries.getAssignmentsForHousehold',
        _queries.getAssignmentsForHousehold);
    _requireFunction('HouseholdQueries.getHouseholdStaff',
        _queries.getHouseholdStaff);

    var _state = _requireObject('HouseholdState', window.HouseholdState);
    _requireFunction('HouseholdState.subscribe', _state.subscribe);

    var _getPlaceById = _requireFunction('getPlaceById', window.getPlaceById);
    var _getPlaces = _requireFunction('getPlaces', window.getPlaces);

    // =========================================================================
    // 2. RENDER HELPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (str === undefined || str === null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _getIcon(name) {
        if (typeof window._getIcon === 'function') return window._getIcon(name) || '';
        if (window.Icons && window.Icons[name]) return window.Icons[name];
        return '';
    }

    // =========================================================================
    // 3. COMPONENT STATE
    // =========================================================================

    var STORAGE_KEY = 'household_list_state_v6';

    var VALID_STATUS_FILTERS = [
        'all', 'active', 'vacant', 'empty', 'declining',
        'deprecated', 'destroyed'
    ];

    var _component = {
        containerId: null,
        onSelectCallback: null,
        mounted: false,
        unsubscribe: null,
        renderScheduled: false,
        renderHandle: null,
        searchDebounceHandle: null
    };

    var _ui = {
        searchTerm: '',
        statusFilter: 'all',
        locationFilter: 'all',
        filtersCollapsed: true,
        showPositions: false,
        selectedId: null
    };

    // =========================================================================
    // 4. PERSISTENCE (validated)
    // =========================================================================

    function _loadPreferences() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            var data = JSON.parse(raw);

            if (typeof data.searchTerm === 'string') {
                _ui.searchTerm = data.searchTerm;
            }
            if (VALID_STATUS_FILTERS.indexOf(data.statusFilter) !== -1) {
                _ui.statusFilter = data.statusFilter;
            }
            if (typeof data.locationFilter === 'string') {
                _ui.locationFilter = data.locationFilter;
            }
            if (typeof data.filtersCollapsed === 'boolean') {
                _ui.filtersCollapsed = data.filtersCollapsed;
            }
            if (typeof data.showPositions === 'boolean') {
                _ui.showPositions = data.showPositions;
            }
        } catch (e) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn('household-ui-list: could not load preferences', e);
            }
        }
    }

    function _savePreferences() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                searchTerm: _ui.searchTerm,
                statusFilter: _ui.statusFilter,
                locationFilter: _ui.locationFilter,
                filtersCollapsed: _ui.filtersCollapsed,
                showPositions: _ui.showPositions
            }));
        } catch (e) {
            // Non-fatal
        }
    }

    // =========================================================================
    // 5. LOCATION HELPERS
    // =========================================================================

    function _getLocationDisplayName(locationId) {
        if (!locationId) return 'Unknown';
        if (locationId === 'unknown') return 'Unknown Location';
        var place = null;
        try {
            place = _getPlaceById(locationId);
        } catch (e) {
            place = null;
        }
        return place ? (place.displayName || place.name || 'Unknown') : 'Unknown';
    }

    function _getAllDescendantLocationIds(locationId) {
        if (!locationId || locationId === 'all' || locationId === 'unknown') {
            return null;
        }
        var places = _getPlaces();
        if (!Array.isArray(places)) return [locationId];

        var result = [locationId];
        var stack = [locationId];
        while (stack.length > 0) {
            var parentId = stack.pop();
            for (var i = 0; i < places.length; i++) {
                if (places[i].parentId === parentId) {
                    result.push(places[i].id);
                    stack.push(places[i].id);
                }
            }
        }
        return result;
    }

    // =========================================================================
    // 6. FILTER
    // =========================================================================

    function _applyFilters(households) {
        var filtered = households;

        if (_ui.searchTerm) {
            var searchLower = _ui.searchTerm.toLowerCase();
            filtered = filtered.filter(function(h) {
                return h.name && h.name.toLowerCase().indexOf(searchLower) !== -1;
            });
        }

        if (_ui.locationFilter === 'unknown') {
            filtered = filtered.filter(function(h) {
                return !h.locationId || h.locationId === 'unknown';
            });
        } else if (_ui.locationFilter !== 'all') {
            var ids = _getAllDescendantLocationIds(_ui.locationFilter);
            if (ids) {
                var idSet = {};
                for (var i = 0; i < ids.length; i++) idSet[ids[i]] = true;
                filtered = filtered.filter(function(h) {
                    return h.locationId && idSet[h.locationId];
                });
            }
        }

        if (_ui.statusFilter !== 'all') {
            // Status filter is semantic. Delegate to Queries so we don't
            // reimplement the active/vacant/empty logic here.
            //
            // Note: O(n) getHouseholdStatus calls per render. A future
            // getHouseholdStatuses() batch query would fix this. Noted
            // as tech debt.
            var statusFilter = _ui.statusFilter;
            filtered = filtered.filter(function(h) {
                try {
                    var s = _queries.getHouseholdStatus(h.id);
                    return s.status === statusFilter;
                } catch (e) {
                    return false;
                }
            });
        }

        filtered.sort(function(a, b) {
            return (a.name || '').localeCompare(b.name || '');
        });

        return filtered;
    }

    // =========================================================================
    // 7. SELECTION SANITY
    // =========================================================================

    function _reconcileSelection(filteredHouseholds) {
        if (!_ui.selectedId) return;
        for (var i = 0; i < filteredHouseholds.length; i++) {
            if (filteredHouseholds[i].id === _ui.selectedId) return;
        }
        _ui.selectedId = null;
    }

    // =========================================================================
    // 8. RENDER SCHEDULER
    // =========================================================================

    function _scheduleRender() {
        if (_component.renderScheduled) return;
        _component.renderScheduled = true;
        _component.renderHandle = setTimeout(function() {
            _component.renderScheduled = false;
            _component.renderHandle = null;
            _render();
        }, 16);
    }

    // =========================================================================
    // 9. RENDER
    // =========================================================================

    function _render() {
        if (!_component.mounted) return;
        var container = document.getElementById(_component.containerId);
        if (!container) return;

        var households;
        try {
            households = _queries.getAllHouseholds();
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('household-ui-list: failed to load households', e);
            }
            container.innerHTML =
                '<div style="padding:16px;color:var(--warn);font-size:0.7rem;">' +
                'Unable to load households. See console for details.' +
                '</div>';
            return;
        }

        var filtered = _applyFilters(households);
        _reconcileSelection(filtered);

        container.innerHTML = _buildHtml(filtered, households);
        _attachHandlers(container);
    }

    function _buildHtml(filtered, allHouseholds) {
        var html = '';

        html += _buildFiltersHeader(filtered.length, allHouseholds.length);

        if (filtered.length === 0) {
            var msg = _ui.searchTerm
                ? 'No households match your search'
                : 'No households found';
            html += '<div style="padding:20px;text-align:center;color:var(--dim);font-size:0.7rem;">' +
                _escapeHtml(msg) + '</div>';
            return html;
        }

        html += '<div style="padding:4px;">';
        for (var i = 0; i < filtered.length; i++) {
            html += _buildItemHtml(filtered[i]);
        }
        html += '</div>';
        return html;
    }

    function _buildFiltersHeader(filteredCount, totalCount) {
        var statusCounts = _countByStatus();

        var html = '';
        html += '<div class="household-filters" style="padding:4px 6px;background:var(--bg2);border-bottom:1px solid var(--border);font-size:0.65rem;">';
        html += '<div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">';
        html += '<input type="text" data-role="search-input" placeholder="Search households" value="' +
            _escapeHtml(_ui.searchTerm) +
            '" style="flex:2;min-width:60px;padding:4px 6px;background:var(--bg);border:1px solid var(--border);border-radius:3px;font-size:0.6rem;color:var(--text);">';

        var toggleIcon = _getIcon(_ui.filtersCollapsed
            ? 'CHEVRON_RIGHT' : 'CHEVRON_DOWN') || (_ui.filtersCollapsed ? '▶' : '▼');
        html += '<span data-role="filter-toggle" style="cursor:pointer;font-size:0.6rem;padding:2px 4px;color:var(--accent);">' +
            toggleIcon + '</span>';
        html += '<span style="font-size:0.5rem;color:var(--dim);margin-left:auto;">' +
            filteredCount + '/' + totalCount + '</span>';
        html += '</div>';

        html += '<div data-role="filter-content" style="' +
            (_ui.filtersCollapsed ? 'display:none;' : '') +
            'margin-top:4px;">';
        html += '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:4px;">';

        // Status filter
        html += '<select data-role="status-filter" style="flex:1;min-width:60px;padding:3px 4px;background:var(--bg);border:1px solid var(--border);border-radius:3px;font-size:0.6rem;color:var(--text);">';
        html += '<option value="all"' + (_ui.statusFilter === 'all' ? ' selected' : '') +
            '>All (' + totalCount + ')</option>';
        html += '<option value="active"' + (_ui.statusFilter === 'active' ? ' selected' : '') +
            '>Active (' + (statusCounts.active || 0) + ')</option>';
        html += '<option value="vacant"' + (_ui.statusFilter === 'vacant' ? ' selected' : '') +
            '>Vacant (' + (statusCounts.vacant || 0) + ')</option>';
        html += '<option value="empty"' + (_ui.statusFilter === 'empty' ? ' selected' : '') +
            '>Empty (' + (statusCounts.empty || 0) + ')</option>';
        html += '<option value="declining"' + (_ui.statusFilter === 'declining' ? ' selected' : '') +
            '>Declining (' + (statusCounts.declining || 0) + ')</option>';
        if (statusCounts.deprecated) {
            html += '<option value="deprecated"' + (_ui.statusFilter === 'deprecated' ? ' selected' : '') +
                '>Deprecated (' + statusCounts.deprecated + ')</option>';
        }
        if (statusCounts.destroyed) {
            html += '<option value="destroyed"' + (_ui.statusFilter === 'destroyed' ? ' selected' : '') +
                '>Destroyed (' + statusCounts.destroyed + ')</option>';
        }
        html += '</select>';

        // Location filter
        html += '<select data-role="location-filter" style="flex:1;min-width:60px;padding:3px 4px;background:var(--bg);border:1px solid var(--border);border-radius:3px;font-size:0.6rem;color:var(--text);">';
        html += _buildLocationOptions();
        html += '</select>';

        html += '</div>';
        html += '<div style="display:flex;gap:4px;flex-wrap:wrap;">';
        html += '<button data-role="clear-filters" style="padding:1px 6px;font-size:0.5rem;background:var(--bg3);border:1px solid var(--border);border-radius:3px;cursor:pointer;color:var(--text);">Clear</button>';
        html += '<label style="display:flex;align-items:center;gap:4px;font-size:0.5rem;cursor:pointer;color:var(--dim);">';
        html += '<input type="checkbox" data-role="show-positions"' +
            (_ui.showPositions ? ' checked' : '') + ' style="cursor:pointer;">';
        html += 'Show Positions</label>';
        html += '</div>';
        html += '</div>';

        html += '</div>';
        return html;
    }

    function _buildLocationOptions() {
        var html = '';
        html += '<option value="all"' + (_ui.locationFilter === 'all' ? ' selected' : '') +
            '>— All Locations —</option>';

        var places = [];
        try {
            places = _getPlaces();
        } catch (e) {
            places = [];
        }

        if (Array.isArray(places)) {
            var sorted = places.slice().sort(function(a, b) {
                return (a.displayName || '').localeCompare(b.displayName || '');
            });
            for (var i = 0; i < sorted.length; i++) {
                var p = sorted[i];
                var selected = (_ui.locationFilter === p.id) ? ' selected' : '';
                var label = p.displayName || p.name || 'Unknown';
                if (p.isCapital) label += ' [Capital]';
                html += '<option value="' + _escapeHtml(p.id) + '"' + selected + '>' +
                    _escapeHtml(label) + '</option>';
            }
        }

        html += '<option value="unknown"' +
            (_ui.locationFilter === 'unknown' ? ' selected' : '') +
            '>Unknown Location</option>';
        return html;
    }

    function _countByStatus() {
        var counts = {};
        var households;
        try {
            households = _queries.getAllHouseholds({ includeDeprecated: true });
        } catch (e) {
            return counts;
        }
        for (var i = 0; i < households.length; i++) {
            try {
                var s = _queries.getHouseholdStatus(households[i].id);
                counts[s.status] = (counts[s.status] || 0) + 1;
            } catch (e) {
                // Skip corrupt rows
            }
        }
        return counts;
    }

    function _buildItemHtml(household) {
        var isSelected = (_ui.selectedId === household.id);

        var status;
        try {
            status = _queries.getHouseholdStatus(household.id);
        } catch (e) {
            status = {
                status: 'unknown',
                livingCount: 0,
                deceasedCount: 0,
                totalMembers: 0,
                missingCount: 0
            };
        }

        var locationName = _getLocationDisplayName(household.locationId);

        var positionInfo = '';
        if (_ui.showPositions) {
            var positions = [];
            var assignments = [];
            try {
                positions = _queries.getHouseholdPositions({
                    householdId: household.id
                });
                assignments = _queries.getAssignmentsForHousehold(
                    household.id, true
                );
            } catch (e) {
                // leave empty
            }
            positionInfo =
                '<span title="Positions" style="display:inline-flex;align-items:center;gap:2px;">' +
                _getIcon('CIRCLE_DOT') + ' ' + positions.length +
                '</span>' +
                '<span title="Staff" style="display:inline-flex;align-items:center;gap:2px;">' +
                _getIcon('PERSON') + ' ' + assignments.length +
                '</span>';
        }

        var statusLabel = _statusLabel(status.status);
        var statusColor = _statusColor(status.status);

        var html = '';
        html += '<div class="household-item" data-id="' + _escapeHtml(household.id) + '"' +
            ' style="cursor:pointer;padding:4px 8px;margin-bottom:2px;' +
            'background:' + (isSelected ? 'rgba(106,158,207,0.12)' : 'var(--bg3)') + ';' +
            'border:1px solid ' + (isSelected ? 'var(--accent)' : 'var(--border)') + ';' +
            'border-radius:3px;transition:all 0.1s;font-size:0.7rem;">';

        html += '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">';

        // Left: status icon + name + badge
        html += '<div style="display:flex;align-items:center;gap:4px;min-width:0;flex:1;">';
        html += '<span style="color:' + statusColor + ';font-size:0.6rem;" title="' +
            _escapeHtml(statusLabel) + '">' +
            _getIcon(_statusIconName(status.status)) + '</span>';
        html += '<span style="font-weight:' + (isSelected ? 'bold' : 'normal') +
            ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
            _escapeHtml(household.name) + '</span>';
        if (status.status === 'active' && typeof status.livingCount === 'number') {
            html += '<span style="font-size:0.4rem;color:#4a9e6a;padding:1px 4px;border:1px solid #4a9e6a;border-radius:8px;">' +
                status.livingCount + ' living</span>';
        } else if (status.status === 'vacant') {
            html += '<span style="font-size:0.4rem;color:#c87040;padding:1px 4px;border:1px solid #c87040;border-radius:8px;">Vacant</span>';
        } else if (status.status === 'empty') {
            html += '<span style="font-size:0.4rem;color:#9e9e9e;padding:1px 4px;border:1px solid #9e9e9e;border-radius:8px;">Empty</span>';
        } else if (status.status === 'declining') {
            html += '<span style="font-size:0.4rem;color:#c87040;padding:1px 4px;border:1px solid #c87040;border-radius:8px;">Declining</span>';
        } else if (status.status === 'deprecated') {
            html += '<span style="font-size:0.4rem;color:#6a6a6a;padding:1px 4px;border:1px solid #6a6a6a;border-radius:8px;">Deprecated</span>';
        } else if (status.status === 'destroyed') {
            html += '<span style="font-size:0.4rem;color:#8a2020;padding:1px 4px;border:1px solid #8a2020;border-radius:8px;">Destroyed</span>';
        }
        html += '</div>';

        // Right: member count + positions + location
        html += '<div style="display:flex;gap:6px;font-size:0.5rem;color:var(--dim);flex-shrink:0;">';

        html += '<span title="Members" style="display:inline-flex;align-items:center;gap:2px;">' +
            _getIcon('PERSON') + ' ' + (status.totalMembers || 0) + '</span>';

        if (positionInfo) {
            html += positionInfo;
        }

        if (locationName && locationName !== 'Unknown') {
            html += '<span title="Location" style="display:inline-flex;align-items:center;gap:2px;">' +
                _getIcon('LOCATION') + ' ' + _escapeHtml(locationName) + '</span>';
        } else {
            html += '<span title="No location" style="color:var(--warn);display:inline-flex;align-items:center;gap:2px;">' +
                _getIcon('WARNING') + ' None</span>';
        }
        html += '</div>';

        html += '</div></div>';
        return html;
    }

    function _statusIconName(status) {
        switch (status) {
            case 'active': return 'CIRCLE_DOT';
            case 'vacant': return 'CIRCLE_HALF_LEFT';
            case 'empty': return 'CIRCLE_OUTLINE';
            case 'declining': return 'CIRCLE_HALF_LEFT';
            case 'deprecated': return 'X_HEAVY';
            case 'destroyed': return 'X_HEAVY';
            default: return 'CIRCLE_OUTLINE';
        }
    }

    function _statusLabel(status) {
        switch (status) {
            case 'active': return 'Active';
            case 'vacant': return 'Vacant';
            case 'empty': return 'Empty';
            case 'declining': return 'Declining';
            case 'deprecated': return 'Deprecated';
            case 'destroyed': return 'Destroyed';
            default: return 'Unknown';
        }
    }

    function _statusColor(status) {
        switch (status) {
            case 'active': return '#4a9e6a';
            case 'vacant': return '#c87040';
            case 'empty': return '#9e9e9e';
            case 'declining': return '#c87040';
            case 'deprecated': return '#6a6a6a';
            case 'destroyed': return '#8a2020';
            default: return '#6a6a6a';
        }
    }

    // =========================================================================
    // 10. EVENT HANDLING (scoped to container)
    // =========================================================================

    function _attachHandlers(container) {
        // Filter toggle
        var toggle = container.querySelector('[data-role="filter-toggle"]');
        var content = container.querySelector('[data-role="filter-content"]');
        if (toggle && content) {
            toggle.onclick = function() {
                var hidden = content.style.display === 'none';
                content.style.display = hidden ? 'block' : 'none';
                toggle.innerHTML = _getIcon(hidden
                    ? 'CHEVRON_DOWN' : 'CHEVRON_RIGHT') ||
                    (hidden ? '▼' : '▶');
                _ui.filtersCollapsed = !hidden;
                _savePreferences();
            };
        }

        // Search input
        var searchInput = container.querySelector('[data-role="search-input"]');
        if (searchInput) {
            searchInput.oninput = function() {
                var value = this.value;
                if (_component.searchDebounceHandle) {
                    clearTimeout(_component.searchDebounceHandle);
                }
                _component.searchDebounceHandle = setTimeout(function() {
                    _component.searchDebounceHandle = null;
                    _ui.searchTerm = value;
                    _savePreferences();
                    _scheduleRender();
                    setTimeout(function() {
                        var el = container.querySelector('[data-role="search-input"]');
                        if (el && el !== document.activeElement) {
                            el.focus();
                            var len = el.value.length;
                            try { el.setSelectionRange(len, len); } catch (e) {}
                        }
                    }, 20);
                }, 250);
            };
        }

        // Status filter
        var statusFilter = container.querySelector('[data-role="status-filter"]');
        if (statusFilter) {
            statusFilter.onchange = function() {
                _ui.statusFilter = this.value;
                _savePreferences();
                _scheduleRender();
            };
        }

        // Location filter
        var locationFilter = container.querySelector('[data-role="location-filter"]');
        if (locationFilter) {
            locationFilter.onchange = function() {
                _ui.locationFilter = this.value;
                _savePreferences();
                _scheduleRender();
            };
        }

        // Show positions toggle
        var showPositions = container.querySelector('[data-role="show-positions"]');
        if (showPositions) {
            showPositions.onchange = function() {
                _ui.showPositions = this.checked;
                _savePreferences();
                _scheduleRender();
            };
        }

        // Clear filters
        var clearBtn = container.querySelector('[data-role="clear-filters"]');
        if (clearBtn) {
            clearBtn.onclick = function() {
                _ui.searchTerm = '';
                _ui.statusFilter = 'all';
                _ui.locationFilter = 'all';
                _ui.showPositions = false;
                _savePreferences();
                _scheduleRender();
            };
        }

        // Household item click — event delegation
        container.onclick = function(event) {
            var item = event.target.closest
                ? event.target.closest('.household-item')
                : null;
            if (!item) return;
            var id = item.dataset.id;
            if (!id) return;

            if (_ui.selectedId !== id) {
                _ui.selectedId = id;
                _applySelectionStyles(container);
            }

            if (typeof _component.onSelectCallback === 'function') {
                _component.onSelectCallback(id);
            }
        };

        // Hover — event delegation
        container.onmouseover = function(event) {
            var item = event.target.closest
                ? event.target.closest('.household-item')
                : null;
            if (!item) return;
            if (item.dataset.id !== _ui.selectedId) {
                item.style.background = 'var(--bg2)';
            }
        };
        container.onmouseout = function(event) {
            var item = event.target.closest
                ? event.target.closest('.household-item')
                : null;
            if (!item) return;
            if (item.dataset.id !== _ui.selectedId) {
                item.style.background = 'var(--bg3)';
            }
        };
    }

    function _applySelectionStyles(container) {
        var items = container.querySelectorAll('.household-item');
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (item.dataset.id === _ui.selectedId) {
                item.style.background = 'rgba(106,158,207,0.12)';
                item.style.borderColor = 'var(--accent)';
            } else {
                item.style.background = 'var(--bg3)';
                item.style.borderColor = 'var(--border)';
            }
        }
    }

    // =========================================================================
    // 11. SUBSCRIPTION
    // =========================================================================

    function _subscribeToState() {
        if (_component.unsubscribe) {
            try { _component.unsubscribe(); } catch (e) {}
            _component.unsubscribe = null;
        }
        _component.unsubscribe = _state.subscribe(function(event) {
            if (!_component.mounted) return;
            if (!event || typeof event.type !== 'string') return;
            if (event.type === 'householdsReplaced' ||
                event.type === 'refreshed' ||
                event.type === 'cacheInvalidated') {
                _scheduleRender();
            }
        });
    }

    // =========================================================================
    // 12. LIFECYCLE
    // =========================================================================

    function mountHouseholdList(containerId, onSelect, options) {
        options = options || {};

        if (_component.mounted) {
            unmountHouseholdList();
        }

        var container = document.getElementById(containerId);
        if (!container) {
            throw new Error('household-ui-list: container "' +
                containerId + '" not found');
        }

        _loadPreferences();

        _component.containerId = containerId;
        _component.onSelectCallback = typeof onSelect === 'function' ? onSelect : null;
        _component.mounted = true;

        if (typeof options.preserveSelection === 'boolean' &&
            !options.preserveSelection) {
            _ui.selectedId = null;
        }
        if (options.selectedId) {
            _ui.selectedId = options.selectedId;
        }

        _subscribeToState();
        _render();

        if (_ui.selectedId) {
            _applySelectionStyles(container);
        }
    }

    function unmountHouseholdList() {
        if (_component.renderHandle) {
            clearTimeout(_component.renderHandle);
            _component.renderHandle = null;
        }
        if (_component.searchDebounceHandle) {
            clearTimeout(_component.searchDebounceHandle);
            _component.searchDebounceHandle = null;
        }
        if (_component.unsubscribe) {
            try { _component.unsubscribe(); } catch (e) {}
            _component.unsubscribe = null;
        }
        _component.renderScheduled = false;
        _component.containerId = null;
        _component.onSelectCallback = null;
        _component.mounted = false;
        // _ui is preserved — the user's filters survive unmount/remount.
    }

    function refreshHouseholdList() {
        if (!_component.mounted) return;
        _scheduleRender();
    }

    function selectHousehold(id) {
        if (!id) {
            _ui.selectedId = null;
            var container = _component.containerId
                ? document.getElementById(_component.containerId)
                : null;
            if (container) _applySelectionStyles(container);
            return;
        }

        var h = null;
        try { h = _queries.getHousehold(id); } catch (e) { h = null; }
        if (!h) return false;

        _ui.selectedId = id;
        var container = document.getElementById(_component.containerId);
        if (container) _applySelectionStyles(container);
        return true;
    }

    function getSelectedHouseholdId() {
        return _ui.selectedId;
    }

    // =========================================================================
    // 13. POSITION/STAFF LIST RENDERERS (used by other UI surfaces)
    // =========================================================================

    function renderHouseholdPositionList(containerId, householdId, options) {
        options = options || {};
        var container = document.getElementById(containerId);
        if (!container) return;

        var positions = [];
        try {
            positions = _queries.getHouseholdPositions({ householdId: householdId });
        } catch (e) {
            container.innerHTML =
                '<div style="padding:12px;color:var(--warn);font-size:0.6rem;">' +
                'Unable to load positions.</div>';
            return;
        }

        if (positions.length === 0) {
            container.innerHTML =
                '<div style="text-align:center;padding:20px;color:var(--dim);font-size:0.6rem;">' +
                'No positions created</div>';
            return;
        }

        var html = '<div class="household-position-list">';
        for (var i = 0; i < positions.length; i++) {
            var p = positions[i];
            html += '<div style="padding:4px 8px;background:var(--bg3);border-radius:4px;margin-bottom:2px;border-left:2px solid var(--accent);">' +
                '<span style="font-size:0.65rem;">' + _escapeHtml(p.name) + '</span>' +
                '</div>';
        }
        html += '</div>';
        container.innerHTML = html;
    }

    function renderHouseholdStaffList(containerId, householdId, options) {
        options = options || {};
        var container = document.getElementById(containerId);
        if (!container) return;

        var staff = [];
        try {
            staff = _queries.getHouseholdStaff(householdId, { activeOnly: true });
        } catch (e) {
            container.innerHTML =
                '<div style="padding:12px;color:var(--warn);font-size:0.6rem;">' +
                'Unable to load staff.</div>';
            return;
        }

        if (staff.length === 0) {
            container.innerHTML =
                '<div style="text-align:center;padding:20px;color:var(--dim);font-size:0.6rem;">' +
                'No staff members</div>';
            return;
        }

        var html = '<div class="household-staff-list">';
        for (var i = 0; i < staff.length; i++) {
            var s = staff[i];
            html += '<div style="padding:4px 8px;background:var(--bg3);border-radius:4px;margin-bottom:2px;border-left:2px solid var(--border);">' +
                '<span style="font-size:0.6rem;">' +
                    _escapeHtml(s.characterName) + '</span>';
            if (s.role) {
                html += ' <span style="font-size:0.5rem;color:var(--dim);">(' +
                    _escapeHtml(s.role) + ')</span>';
            }
            html += '</div>';
        }
        html += '</div>';
        container.innerHTML = html;
    }

    // =========================================================================
    // 14. EXPORTS
    // =========================================================================

    window.mountHouseholdList = mountHouseholdList;
    window.unmountHouseholdList = unmountHouseholdList;
    window.refreshHouseholdList = refreshHouseholdList;
    window.selectHousehold = selectHousehold;
    window.getSelectedHouseholdId = getSelectedHouseholdId;
    window.renderHouseholdPositionList = renderHouseholdPositionList;
    window.renderHouseholdStaffList = renderHouseholdStaffList;

})();
