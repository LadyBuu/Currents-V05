/**
 * =============================================================================
 * STILL WATERS - LOCATION TAB UI (js/ui/wm-location-tab-ui.js)
 * =============================================================================
 * 
 * LOCATION: js/systems/world/ui/locationTab.js
 * 
 * UPDATED: Uses new Location System (v3.0) with improved queries
 * 
 * Renders the Location tab in the World Manager.
 * Provides:
 * - Location details display
 * - Edit Location button (opens edit modal)
 * - Add Location button (opens add modal)
 * - Delete Location button (opens delete modal)
 * - Location hierarchy display
 * - Government info display
 * - Leader info display
 * - Culture display (NEW)
 * 
 * DEPENDENCIES:
 *   - modals-location.js (openAddPlaceModal, openEditPlaceModal, openDeletePlaceModal)
 *   - accessors.js (getPlaceById, getPlaces, getLocationTypeById)
 *   - world.js (getParentChain, getLocationHierarchyDisplay, getLocationPopulationCount)
 *   - location-state.js (LocationState - for enhanced queries)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. SVG ICON HELPERS
    // =========================================================================

    function _getIcon(name, fallback) {
        if (typeof window.Icons !== 'undefined' && window.Icons[name]) {
            return window.Icons[name];
        }
        return fallback || '●';
    }

    function _getCheckIcon() {
        return _getIcon('CHECK', '✓');
    }

    function _getCrossIcon() {
        return _getIcon('X', '✗');
    }

    function _getCircleIcon() {
        return _getIcon('CIRCLE', '●');
    }

    function _getHomeIcon() {
        return _getIcon('HOME', '⌂');
    }

    function _getWarningIcon() {
        return _getIcon('WARNING', '⚠');
    }

    function _getRefreshIcon() {
        return _getIcon('REFRESH', '⟳');
    }

    function _getSearchIcon() {
        return _getIcon('SEARCH', '⌕');
    }

    function _getStarIcon() {
        return _getIcon('STAR', '★');
    }

    function _getGearIcon() {
        return _getIcon('GEAR', '⚙');
    }

    function _getShieldIcon() {
        return _getIcon('SHIELD', '🛡');
    }

    function _getPersonIcon() {
        return _getIcon('PERSON', '👤');
    }

    function _getFlagIcon() {
        return _getIcon('FLAG', '🏴');
    }

    function _getCrownIcon() {
        return _getIcon('CROWN', '👑');
    }

    function _getSwordIcon() {
        return _getIcon('SWORD', '⚔');
    }

    function _getBookIcon() {
        return _getIcon('BOOK', '📚');
    }

    function _getEyeIcon() {
        return _getIcon('EYE', '👁');
    }

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS - Location System (v3.0)
    // =========================================================================

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getPlaces() {
        return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
    }

    function _getLocationTypeById(id) {
        return typeof window.getLocationTypeById === 'function' ? window.getLocationTypeById(id) : null;
    }

    function _getLocationTypes() {
        return typeof window.getLocationTypes === 'function' ? window.getLocationTypes() : [];
    }

    function _getParentChain(place) {
        return typeof window.getParentChain === 'function' ? window.getParentChain(place) : [];
    }

    function _getLocationHierarchyDisplay(place) {
        return typeof window.getLocationHierarchyDisplay === 'function' ? window.getLocationHierarchyDisplay(place) : '';
    }

    function _getLocationPopulationCount(locationId) {
        return typeof window.getLocationPopulationCount === 'function' ? window.getLocationPopulationCount(locationId) : 0;
    }

    function _getCurrentLeader(placeId) {
        return typeof window.getCurrentLeader === 'function' ? window.getCurrentLeader(placeId) : null;
    }

    function _getGovernmentTypeById(id) {
        return typeof window.getGovernmentTypeById === 'function' ? window.getGovernmentTypeById(id) : null;
    }

    function _getChildPlaces(placeId, recursive) {
        return typeof window.getChildPlaces === 'function' ? window.getChildPlaces(placeId, recursive) : [];
    }

    // =========================================================================
    // 2.1 NEW Location System Wrappers (v3.0)
    // =========================================================================

    function _getLocationStatistics(placeId) {
        if (typeof window.LocationQueries !== 'undefined' && 
            typeof window.LocationQueries.getLocationStatistics === 'function') {
            return window.LocationQueries.getLocationStatistics(placeId);
        }
        return null;
    }

    function _getGlobalLocationStatistics() {
        if (typeof window.LocationQueries !== 'undefined' && 
            typeof window.LocationQueries.getGlobalLocationStatistics === 'function') {
            return window.LocationQueries.getGlobalLocationStatistics();
        }
        return null;
    }

    function _getLocationDepth(placeId) {
        if (typeof window.LocationHierarchy !== 'undefined' && 
            typeof window.LocationHierarchy.getLocationDepth === 'function') {
            return window.LocationHierarchy.getLocationDepth(placeId);
        }
        return 0;
    }

    function _isRootPlace(placeId) {
        if (typeof window.LocationHierarchy !== 'undefined' && 
            typeof window.LocationHierarchy.isRootPlace === 'function') {
            return window.LocationHierarchy.isRootPlace(placeId);
        }
        var place = _getPlaceById(placeId);
        return place ? !place.parentId : false;
    }

    function _getCountryId(placeId) {
        if (typeof window.LocationState !== 'undefined' && 
            typeof window.LocationState.getCountryId === 'function') {
            return window.LocationState.getCountryId(placeId);
        }
        return null;
    }

    function _getLocationCountry(placeId) {
        if (typeof window.LocationState !== 'undefined' && 
            typeof window.LocationState.getLocationCountry === 'function') {
            return window.LocationState.getLocationCountry(placeId);
        }
        return 'Unknown';
    }

    function _getLocationDistrict(placeId) {
        if (typeof window.LocationState !== 'undefined' && 
            typeof window.LocationState.getLocationDistrict === 'function') {
            return window.LocationState.getLocationDistrict(placeId);
        }
        return null;
    }

    function _getLocationTypePriority(typeId) {
        if (typeof window.LocationState !== 'undefined' && 
            typeof window.LocationState.getLocationTypePriority === 'function') {
            return window.LocationState.getLocationTypePriority(typeId);
        }
        var type = _getLocationTypeById(typeId);
        return type ? type.priority : 5;
    }

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _showToast(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(message, type);
        } else {
            console.log('[' + (type || 'info') + '] ' + message);
        }
    }

    // =========================================================================
    // 3. MODAL WRAPPERS
    // =========================================================================

    function _openAddPlaceModal(parentId, onSuccess) {
        if (typeof window.openAddPlaceModal === 'function') {
            window.openAddPlaceModal(parentId, onSuccess);
        } else {
            _showToast(_getCrossIcon() + ' Add location modal not available', 'error');
        }
    }

    function _openEditPlaceModal(placeId, onSuccess) {
        if (typeof window.openEditPlaceModal === 'function') {
            window.openEditPlaceModal(placeId, onSuccess);
        } else {
            _showToast(_getCrossIcon() + ' Edit location modal not available', 'error');
        }
    }

    function _openDeletePlaceModal(placeId, onSuccess) {
        if (typeof window.openDeletePlaceModal === 'function') {
            window.openDeletePlaceModal(placeId, onSuccess);
        } else {
            _showToast(_getCrossIcon() + ' Delete location modal not available', 'error');
        }
    }

    function _openAssignGovernmentModal(placeId, onSuccess) {
        if (typeof window.openAssignGovernmentModal === 'function') {
            window.openAssignGovernmentModal(placeId, onSuccess);
        } else {
            _showToast(_getCrossIcon() + ' Assign government modal not available', 'error');
        }
    }

    function _openAssignLeaderModal(placeId, onSuccess) {
        if (typeof window.openAssignLeaderModal === 'function') {
            window.openAssignLeaderModal(placeId, onSuccess);
        } else {
            _showToast(_getCrossIcon() + ' Assign leader modal not available', 'error');
        }
    }

    function _openViewLocationHierarchyModal(placeId) {
        if (typeof window.openViewHierarchyModal === 'function') {
            window.openViewHierarchyModal(placeId);
        } else {
            _showToast(_getCrossIcon() + ' View hierarchy modal not available', 'error');
        }
    }

    function _openViewLocationTimelineModal(placeId) {
        if (typeof window.openViewLocationTimelineModal === 'function') {
            window.openViewLocationTimelineModal(placeId);
        } else {
            _showToast(_getCrossIcon() + ' View timeline modal not available', 'error');
        }
    }

    // =========================================================================
    // 4. MAIN RENDER FUNCTION
    // =========================================================================

    function renderLocationTab(container, placeId) {
        if (!container) return;
        if (!placeId) {
            container.innerHTML = '<div class="empty-state">' + _getHomeIcon() + ' Select a location to edit its properties.</div>';
            return;
        }

        var place = _getPlaceById(placeId);
        if (!place) {
            container.innerHTML = '<div class="empty-state">' + _getCrossIcon() + ' Location not found.</div>';
            return;
        }

        var type = _getLocationTypeById(place.typeId);
        var parentChain = _getParentChain(place);
        var population = _getLocationPopulationCount(placeId);
        var leader = _getCurrentLeader(placeId);
        var govType = place.governmentTypeId ? _getGovernmentTypeById(place.governmentTypeId) : null;
        var children = _getChildPlaces(placeId, false);
        var hierarchyDisplay = _getLocationHierarchyDisplay(place);
        
        // NEW: Enhanced location data
        var depth = _getLocationDepth(placeId);
        var isRoot = _isRootPlace(placeId);
        var countryName = _getLocationCountry(placeId);
        var districtName = _getLocationDistrict(placeId);
        var typePriority = _getLocationTypePriority(place.typeId);
        var stats = _getLocationStatistics(placeId);
        
        var totalDescendants = stats ? stats.totalDescendants : 0;
        var ownPopulation = stats ? stats.ownPopulation : 0;

        // Build parent chain display
        var parentChainHtml = '';
        if (parentChain.length > 0) {
            parentChainHtml = parentChain.map(function(p) {
                return '<span class="hierarchy-item">' + _getHomeIcon() + ' ' + _escapeHtml(p.displayName) + '</span>';
            }).join(' → ');
            parentChainHtml += ' → <span class="hierarchy-item current">' + _getHomeIcon() + ' ' + _escapeHtml(place.displayName) + '</span>';
        } else {
            parentChainHtml = '<span class="hierarchy-item current">' + _getHomeIcon() + ' ' + _escapeHtml(place.displayName) + '</span> <span style="font-size:0.5rem;color:var(--dim);">(Root)</span>';
        }

        // Status color
        var statusColors = {
            'active': '#4a9060',
            'disputed': '#c87040',
            'abandoned': '#8a8a8a',
            'ruined': '#8a3020'
        };
        var statusColor = statusColors[place.status] || '#6a9ecf';
        var statusDisplay = place.status.charAt(0).toUpperCase() + place.status.slice(1);
        var statusIcon = place.status === 'active' ? _getCheckIcon() : 
                         place.status === 'disputed' ? _getWarningIcon() : 
                         place.status === 'abandoned' ? _getCircleIcon() : _getCrossIcon();

        // Priority level name
        var levelNames = {
            1: 'Sovereign (Country)',
            2: 'High Noble (Region)',
            3: 'Noble (County)',
            4: 'Gentry (Town)',
            5: 'Commoner (Locality)'
        };
        var levelName = levelNames[typePriority] || 'Level ' + typePriority;

        var html = 
            '<div class="location-details" style="max-width: 800px; margin: 0 auto;">' +
            '<!-- Header -->' +
            '<div class="info-box" style="background:var(--bg2);padding:16px;border-radius:8px;border:1px solid var(--accent);margin-bottom:16px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">' +
            '<div>' +
            '<h2 style="font-size:1rem;color:var(--accent);margin:0;">' + _getHomeIcon() + ' ' + _escapeHtml(place.displayName) + '</h2>' +
            '<div style="font-size:0.65rem;color:var(--dim);margin-top:4px;">' +
            '<span>' + _getGearIcon() + ' Type: ' + (type ? _escapeHtml(type.displayName) : 'Unknown') + '</span>' +
            '<span style="margin-left:12px;">' + _getStarIcon() + ' Priority: ' + typePriority + ' (' + _escapeHtml(levelName) + ')</span>' +
            '<span style="margin-left:12px;">' + _getCircleIcon() + ' ID: ' + _escapeHtml(place.id.slice(-8)) + '</span>' +
            '</div>' +
            '</div>' +
            '<div>' +
            '<span style="background:' + statusColor + ';padding:4px 12px;border-radius:12px;font-size:0.6rem;color:white;">' + statusIcon + ' ' + statusDisplay + '</span>' +
            (place.isCapital ? '<span style="background:#c8a844;padding:4px 12px;border-radius:12px;font-size:0.6rem;color:white;margin-left:6px;">' + _getStarIcon() + ' Capital</span>' : '') +
            (isRoot ? '<span style="background:var(--accent);padding:4px 12px;border-radius:12px;font-size:0.6rem;color:white;margin-left:6px;">' + _getCrownIcon() + ' Root</span>' : '') +
            '</div>' +
            '</div>' +
            '<div style="margin-top:8px;font-size:0.6rem;color:var(--dim);display:flex;flex-wrap:wrap;gap:12px;">' +
            '<span>' + _getGearIcon() + ' Variable Key: <code style="background:var(--bg);padding:2px 6px;border-radius:4px;">' + _escapeHtml(place.variableKey || '') + '</code></span>' +
            (countryName !== 'Unknown' ? '<span>' + _getFlagIcon() + ' Country: ' + _escapeHtml(countryName) + '</span>' : '') +
            (districtName ? '<span>' + _getShieldIcon() + ' District: ' + _escapeHtml(districtName) + '</span>' : '') +
            (place.cultureId ? '<span>' + _getBookIcon() + ' Culture: ' + _escapeHtml(place.cultureId) + '</span>' : '') +
            '</div>' +
            '</div>' +

            '<!-- Action Buttons -->' +
            '<div class="action-bar" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">' +
            '<button class="btn primary" id="editLocationBtn" style="background:var(--accent-dim);border:1px solid var(--accent);padding:6px 12px;border-radius:4px;cursor:pointer;">' + _getGearIcon() + ' Edit Location</button>' +
            '<button class="btn" id="addChildBtn" style="background:var(--bg3);border:1px solid var(--border);padding:6px 12px;border-radius:4px;cursor:pointer;">' + _getCheckIcon() + ' Add Child Location</button>' +
            '<button class="btn" id="viewHierarchyBtn" style="background:var(--bg3);border:1px solid var(--border);padding:6px 12px;border-radius:4px;cursor:pointer;">' + _getHomeIcon() + ' View Hierarchy</button>' +
            '<button class="btn" id="viewTimelineBtn" style="background:var(--bg3);border:1px solid var(--border);padding:6px 12px;border-radius:4px;cursor:pointer;">' + _getEyeIcon() + ' View Timeline</button>' +
            '<button class="btn danger" id="deleteLocationBtn" style="background:#8a3020;border:none;color:white;padding:6px 12px;border-radius:4px;cursor:pointer;">' + _getCrossIcon() + ' Delete</button>' +
            '</div>' +

            '<!-- Info Grid -->' +
            '<div class="info-grid" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px;">' +
            '<div class="info-card" style="background:var(--bg3);padding:12px;border-radius:6px;">' +
            '<div style="font-size:0.55rem;color:var(--dim);">' + _getPersonIcon() + ' Population</div>' +
            '<div style="font-size:1rem;color:var(--accent);">' + population.toLocaleString() + '</div>' +
            '<div style="font-size:0.5rem;color:var(--dim);">Own: ' + ownPopulation.toLocaleString() + '</div>' +
            '</div>' +
            '<div class="info-card" style="background:var(--bg3);padding:12px;border-radius:6px;">' +
            '<div style="font-size:0.55rem;color:var(--dim);">' + _getFlagIcon() + ' Child Locations</div>' +
            '<div style="font-size:1rem;color:var(--accent);">' + children.length + '</div>' +
            '<div style="font-size:0.5rem;color:var(--dim);">Total descendants: ' + totalDescendants + '</div>' +
            '</div>' +
            '<div class="info-card" style="background:var(--bg3);padding:12px;border-radius:6px;">' +
            '<div style="font-size:0.55rem;color:var(--dim);">' + _getCircleIcon() + ' Hierarchy Depth</div>' +
            '<div style="font-size:1rem;color:var(--accent);">' + depth + '</div>' +
            '<div style="font-size:0.5rem;color:var(--dim);">' + (isRoot ? 'Root location' : 'Has parent') + '</div>' +
            '</div>' +
            '</div>' +

            '<div class="info-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">' +
            '<div class="info-card" style="background:var(--bg3);padding:12px;border-radius:6px;">' +
            '<div style="font-size:0.55rem;color:var(--dim);">' + _getShieldIcon() + ' Government</div>' +
            '<div style="font-size:0.8rem;color:var(--text);">' + (govType ? _escapeHtml(govType.name) : 'None') + '</div>' +
            (place.governmentStyle ? '<div style="font-size:0.55rem;color:var(--dim);">' + _escapeHtml(place.governmentStyle) + '</div>' : '') +
            '</div>' +
            '<div class="info-card" style="background:var(--bg3);padding:12px;border-radius:6px;">' +
            '<div style="font-size:0.55rem;color:var(--dim);">' + _getCrownIcon() + ' Leader</div>' +
            '<div style="font-size:0.8rem;color:var(--text);">' + (leader ? _escapeHtml(leader.character ? leader.character.name : 'Unknown') + ' (' + _escapeHtml(leader.title || 'Leader') + ')' : 'None') + '</div>' +
            (leader ? '<div style="font-size:0.55rem;color:var(--dim);">Since ' + leader.startYear + '</div>' : '') +
            '</div>' +
            '</div>' +

            '<!-- Hierarchy -->' +
            '<div class="hierarchy-section" style="background:var(--bg3);padding:12px;border-radius:6px;margin-bottom:16px;">' +
            '<div style="font-size:0.55rem;color:var(--dim);margin-bottom:4px;">' + _getHomeIcon() + ' Hierarchy</div>' +
            '<div style="font-size:0.7rem;color:var(--text);word-break:break-all;">' + parentChainHtml + '</div>' +
            '</div>' +

            (place.notes ? 
            '<div class="notes-section" style="background:var(--bg3);padding:12px;border-radius:6px;margin-bottom:16px;">' +
            '<div style="font-size:0.55rem;color:var(--dim);margin-bottom:4px;">' + _getBookIcon() + ' Notes</div>' +
            '<div style="font-size:0.65rem;color:var(--text);">' + _escapeHtml(place.notes) + '</div>' +
            '</div>' : '') +

            '<!-- Government Action -->' +
            '<div class="gov-actions" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;padding-top:12px;border-top:1px solid var(--border);">' +
            '<button class="btn small" id="assignGovBtn" style="background:var(--bg3);border:1px solid var(--border);padding:4px 10px;border-radius:4px;cursor:pointer;">' + _getShieldIcon() + ' Assign Government</button>' +
            '<button class="btn small" id="assignLeaderBtn" style="background:var(--bg3);border:1px solid var(--border);padding:4px 10px;border-radius:4px;cursor:pointer;">' + _getCrownIcon() + ' Assign Leader</button>' +
            '</div>' +

            '<div style="margin-top:12px;font-size:0.55rem;color:var(--dim);text-align:center;">' +
            _getCircleIcon() + ' Location ID: ' + _escapeHtml(place.id) + ' · Created: ' + (place.createdAt ? new Date(place.createdAt).toLocaleDateString() : 'Unknown') +
            '</div>' +
            '</div>';

        container.innerHTML = html;

        // =========================================================================
        // 5. ATTACH EVENT HANDLERS
        // =========================================================================

        // Edit Location
        var editBtn = document.getElementById('editLocationBtn');
        if (editBtn) {
            editBtn.addEventListener('click', function() {
                _openEditPlaceModal(placeId, function() {
                    renderLocationTab(container, placeId);
                    if (typeof window.refreshLocationTree === 'function') {
                        window.refreshLocationTree();
                    }
                    _showToast(_getCheckIcon() + ' Location updated', 'success');
                });
            });
        }

        // Add Child
        var addChildBtn = document.getElementById('addChildBtn');
        if (addChildBtn) {
            addChildBtn.addEventListener('click', function() {
                _openAddPlaceModal(placeId, function(newPlaceId) {
                    renderLocationTab(container, placeId);
                    if (typeof window.refreshLocationTree === 'function') {
                        window.refreshLocationTree();
                    }
                    if (newPlaceId) {
                        if (typeof window.selectPlaceInTree === 'function') {
                            window.selectPlaceInTree(newPlaceId);
                        }
                    }
                    _showToast(_getCheckIcon() + ' Child location added', 'success');
                });
            });
        }

        // Delete Location
        var deleteBtn = document.getElementById('deleteLocationBtn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', function() {
                _openDeletePlaceModal(placeId, function() {
                    if (typeof window.refreshLocationTree === 'function') {
                        window.refreshLocationTree();
                    }
                    container.innerHTML = '<div class="empty-state">' + _getHomeIcon() + ' Location deleted. Select another location.</div>';
                    if (typeof window.clearPlaceSelection === 'function') {
                        window.clearPlaceSelection();
                    }
                    _showToast(_getCrossIcon() + ' Location deleted', 'info');
                });
            });
        }

        // View Hierarchy
        var hierarchyBtn = document.getElementById('viewHierarchyBtn');
        if (hierarchyBtn) {
            hierarchyBtn.addEventListener('click', function() {
                _openViewLocationHierarchyModal(placeId);
            });
        }

        // View Timeline
        var timelineBtn = document.getElementById('viewTimelineBtn');
        if (timelineBtn) {
            timelineBtn.addEventListener('click', function() {
                _openViewLocationTimelineModal(placeId);
            });
        }

        // Assign Government
        var govBtn = document.getElementById('assignGovBtn');
        if (govBtn) {
            govBtn.addEventListener('click', function() {
                _openAssignGovernmentModal(placeId, function() {
                    renderLocationTab(container, placeId);
                    _showToast(_getCheckIcon() + ' Government assigned', 'success');
                });
            });
        }

        // Assign Leader
        var leaderBtn = document.getElementById('assignLeaderBtn');
        if (leaderBtn) {
            leaderBtn.addEventListener('click', function() {
                _openAssignLeaderModal(placeId, function() {
                    renderLocationTab(container, placeId);
                    _showToast(_getCheckIcon() + ' Leader assigned', 'success');
                });
            });
        }
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.renderLocationTab = renderLocationTab;

    window._locationTabModals = {
        openAddPlaceModal: _openAddPlaceModal,
        openEditPlaceModal: _openEditPlaceModal,
        openDeletePlaceModal: _openDeletePlaceModal,
        openAssignGovernmentModal: _openAssignGovernmentModal,
        openAssignLeaderModal: _openAssignLeaderModal
    };


})();