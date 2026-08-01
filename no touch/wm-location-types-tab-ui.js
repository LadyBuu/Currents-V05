/**
 * =============================================================================
 * STILL WATERS - LOCATION TYPES UI (js/ui/wm-location-types-tab-ui.js)
 * =============================================================================
 * 
 * UPDATED: Uses new Location System (v3.0) for type management
 * 
 * This file contains ALL location types management UI rendering and event handling
 * 
 * Location types define the hierarchy of places (Country, Region, County, Town, Locality)
 * Each type has a priority (1-5) that determines its position in the hierarchy.
 * 
 * DEPENDENCIES:
 *   - accessors.js (getLocationTypes, getLocationTypeById, getPlaces, getPlaceById)
 *   - world.js (getLevelName, getPlacesByPriority, getChildPlaces)
 *   - ids.js (generateId)
 *   - storage.js (saveMasterData)
 *   - core/modals/modals-location.js (openAddLocationTypeModal, openEditLocationTypeModal, openDeleteLocationTypeModal)
 *   - core/ui/ui.js (escapeHtml, showToast)
 *   - location-state.js (LocationState - for enhanced queries)
 * 
 * =============================================================================
 */

// =============================================================================
// 1. SVG ICON HELPERS
// =============================================================================

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

// =============================================================================
// 2. LOCATION TYPES STATE
// =============================================================================

var locationTypesState = {
    searchTerm: '',
    expandedTypeId: null,
    sortBy: 'priority',
    viewMode: 'cards'
};

// =============================================================================
// 3. DEPENDENCY WRAPPERS - Location System (v3.0)
// =============================================================================

function _getLocationTypes() {
    return typeof window.getLocationTypes === 'function' ? window.getLocationTypes() : [];
}

function _getLocationTypeById(id) {
    return typeof window.getLocationTypeById === 'function' ? window.getLocationTypeById(id) : null;
}

function _getPlaces() {
    return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
}

function _getPlaceById(id) {
    return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
}

// =============================================================================
// 3.1 NEW Location System Wrappers (v3.0)
// =============================================================================

function _getLocationTypePriority(typeId) {
    if (typeof window.LocationState !== 'undefined' && 
        typeof window.LocationState.getLocationTypePriority === 'function') {
        return window.LocationState.getLocationTypePriority(typeId);
    }
    var type = _getLocationTypeById(typeId);
    return type ? type.priority || 5 : 5;
}

function _getPlaceTypePriority(place) {
    if (!place) return 999;
    return _getLocationTypePriority(place.typeId);
}

function _getChildPlaces(parentId, recursive) {
    if (typeof window.LocationState !== 'undefined' && 
        typeof window.LocationState.getPlaceChildren === 'function') {
        return window.LocationState.getPlaceChildren(parentId, recursive || false);
    }
    // Fallback
    var places = _getPlaces();
    var result = [];
    for (var i = 0; i < places.length; i++) {
        if (places[i].parentId === parentId) {
            result.push(places[i]);
            if (recursive) {
                var children = _getChildPlaces(places[i].id, true);
                result = result.concat(children);
            }
        }
    }
    return result;
}

function _getPlacesByPriority(priority) {
    if (typeof window.getPlacesByPriority === 'function') {
        return window.getPlacesByPriority(priority);
    }
    var places = _getPlaces();
    var result = [];
    for (var i = 0; i < places.length; i++) {
        if (_getLocationTypePriority(places[i].typeId) === priority) {
            result.push(places[i]);
        }
    }
    return result;
}

function _getLocationHierarchyDisplay(place) {
    if (typeof window.getLocationHierarchyDisplay === 'function') {
        return window.getLocationHierarchyDisplay(place);
    }
    if (!place) return '';
    var hierarchy = [];
    var current = place;
    var safety = 0;
    while (current && safety < 20) {
        hierarchy.unshift(current.displayName);
        if (!current.parentId) break;
        current = _getPlaceById(current.parentId);
        safety++;
    }
    return hierarchy.join(' → ');
}

function _escapeHtml(str) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
    if (!str) return '';
    return String(str).replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function _showToast(msg, type) {
    if (typeof window.showToast === 'function') {
        window.showToast(msg, type);
    } else if (typeof window.showToastMessage === 'function') {
        window.showToastMessage(msg, type);
    } else {
        console.log('[' + (type || 'info') + '] ' + msg);
    }
}

function _invalidateWorldCache() {
    if (typeof window.invalidateWorldCache === 'function') {
        window.invalidateWorldCache();
    }
    if (typeof window.LocationState !== 'undefined' && 
        typeof window.LocationState.invalidateCache === 'function') {
        window.LocationState.invalidateCache();
    }
}

function _saveMasterData() {
    if (typeof window.saveMasterData === 'function') window.saveMasterData();
}

// =============================================================================
// 4. HELPER FUNCTIONS
// =============================================================================

function _getLevelDisplay(priority) {
    var levels = {
        1: { name: 'Sovereign', icon: _getCrownIcon(), description: 'Highest level - Countries, Empires' },
        2: { name: 'High Noble', icon: _getStarIcon(), description: 'Second level - Regions, Kingdoms' },
        3: { name: 'Noble', icon: _getShieldIcon(), description: 'Third level - Counties, Duchies' },
        4: { name: 'Gentry', icon: _getHomeIcon(), description: 'Fourth level - Towns, Villages' },
        5: { name: 'Commoner', icon: _getCircleIcon(), description: 'Lowest level - Hamlets, Localities' }
    };
    return levels[priority] || { name: 'Level ' + priority, icon: _getCircleIcon(), description: 'Custom level' };
}

function applyLocationTypesFilters(types) {
    var filtered = types.slice();
    
    if (locationTypesState.searchTerm) {
        var searchLower = locationTypesState.searchTerm.toLowerCase();
        filtered = filtered.filter(function(t) {
            return t.displayName.toLowerCase().indexOf(searchLower) !== -1 ||
                (t.description || '').toLowerCase().indexOf(searchLower) !== -1;
        });
    }
    
    if (locationTypesState.sortBy === 'priority') {
        filtered.sort(function(a, b) { return a.priority - b.priority; });
    } else if (locationTypesState.sortBy === 'name') {
        filtered.sort(function(a, b) { return a.displayName.localeCompare(b.displayName); });
    } else if (locationTypesState.sortBy === 'usage') {
        filtered.sort(function(a, b) {
            var usageA = getPlacesByTypeCount(a.id);
            var usageB = getPlacesByTypeCount(b.id);
            return usageB - usageA;
        });
    }
    
    return filtered;
}

function getPlacesByTypeCount(typeId) {
    var places = _getPlaces();
    var count = 0;
    for (var i = 0; i < places.length; i++) {
        if (places[i].typeId === typeId) count++;
    }
    return count;
}

function getPlacesByType(typeId) {
    var places = _getPlaces();
    var result = [];
    for (var i = 0; i < places.length; i++) {
        if (places[i].typeId === typeId) result.push(places[i]);
    }
    return result;
}

// =============================================================================
// 5. MODAL DELEGATION
// =============================================================================

function _openAddLocationTypeModal(onSuccess) {
    if (typeof window.openAddLocationTypeModal === 'function') {
        window.openAddLocationTypeModal(onSuccess);
    } else {
        _showToast(_getCrossIcon() + ' Location type modal not available', 'error');
    }
}

function _openEditLocationTypeModal(typeId, onSuccess) {
    if (typeof window.openEditLocationTypeModal === 'function') {
        window.openEditLocationTypeModal(typeId, onSuccess);
    } else {
        _showToast(_getCrossIcon() + ' Location type modal not available', 'error');
    }
}

function _openDeleteLocationTypeModal(typeId, onSuccess) {
    if (typeof window.openDeleteLocationTypeModal === 'function') {
        window.openDeleteLocationTypeModal(typeId, onSuccess);
    } else {
        _showToast(_getCrossIcon() + ' Location type modal not available', 'error');
    }
}

// =============================================================================
// 6. LOCATION TYPES RENDERING
// =============================================================================

function renderLocationTypesTab(containerId, onRefresh) {
    var container = document.getElementById(containerId);
    if (!container) return;
    
    var types = _getLocationTypes();
    types = applyLocationTypesFilters(types);
    
    var html = 
        '<div class="location-types-tab">' +
        '<!-- Actions Bar -->' +
        '<div class="actions-bar" style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:24px; padding:16px; background:rgba(13,17,25,0.6); border-radius:12px;">' +
        '<button id="addLocTypeBtn" class="btn primary" style="background:var(--accent);border:none;color:white;padding:6px 14px;border-radius:4px;cursor:pointer;">' + _getCheckIcon() + ' Add Location Type</button>' +
        '<div class="filter-group" style="flex:1; min-width:150px;">' +
        '<input type="text" id="locTypeSearch" placeholder="' + _getSearchIcon() + ' Search types..." value="' + _escapeHtml(locationTypesState.searchTerm) + '" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px;">' +
        '</div>' +
        '<div class="filter-group">' +
        '<select id="locTypeSort" style="padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px;">' +
        '<option value="priority" ' + (locationTypesState.sortBy === 'priority' ? 'selected' : '') + '>Sort by: Priority</option>' +
        '<option value="name" ' + (locationTypesState.sortBy === 'name' ? 'selected' : '') + '>Sort by: Name</option>' +
        '<option value="usage" ' + (locationTypesState.sortBy === 'usage' ? 'selected' : '') + '>Sort by: Usage</option>' +
        '</select>' +
        '</div>' +
        '<div class="filter-group">' +
        '<select id="locTypeView" style="padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px;">' +
        '<option value="cards" ' + (locationTypesState.viewMode === 'cards' ? 'selected' : '') + '>View: Cards</option>' +
        '<option value="list" ' + (locationTypesState.viewMode === 'list' ? 'selected' : '') + '>View: List</option>' +
        '</select>' +
        '</div>' +
        '<button id="clearLocTypeFiltersBtn" class="btn small" style="padding:4px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">' + _getCrossIcon() + ' Clear</button>' +
        '<button id="refreshLocTypesBtn" class="btn small" style="padding:4px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">' + _getRefreshIcon() + ' Refresh</button>' +
        '</div>' +
        
        '<!-- Priority Legend -->' +
        '<div class="priority-legend" style="display:flex; flex-wrap:wrap; gap:16px; margin-bottom:24px; padding:12px; background:rgba(9,12,18,0.5); border-radius:8px;">' +
        '<div style="font-size:0.6rem; color:var(--accent);">' + _getStarIcon() + ' Priority Legend:</div>' +
        [1, 2, 3, 4, 5].map(function(p) {
            var level = _getLevelDisplay(p);
            return '<div style="display:flex; align-items:center; gap:4px; font-size:0.6rem;">' +
                '<span>' + level.icon + '</span>' +
                '<span>' + level.name + ' (Lvl ' + p + ')</span>' +
                '</div>';
        }).join('') +
        '</div>' +
        
        '<!-- Types List -->' +
        '<div class="location-types-list">' +
        (types.length === 0 ? '<div class="empty-state" style="text-align:center;padding:60px;color:var(--dim);">' + _getHomeIcon() + ' No location types defined. Click "+ Add Location Type" to create one.</div>' : 
            (locationTypesState.viewMode === 'cards' ? 
                types.map(function(type) { return renderLocationTypeCard(type); }).join('') :
                types.map(function(type) { return renderLocationTypeListItem(type); }).join(''))) +
        '</div>' +
        '</div>';
    
    container.innerHTML = html;
    
    attachLocationTypeActionHandlers(onRefresh);
    attachLocationTypeFilterHandlers(onRefresh);
    attachLocationTypeCardHandlersDelegated(onRefresh);
}

function renderLocationTypeCard(type) {
    var isExpanded = locationTypesState.expandedTypeId === type.id;
    var level = _getLevelDisplay(type.priority);
    var placeCount = getPlacesByTypeCount(type.id);
    var places = getPlacesByType(type.id).slice(0, 5);
    var hasMorePlaces = getPlacesByTypeCount(type.id) > 5;
    
    // Get enhanced type info
    var priority = type.priority;
    var canBeCapital = priority <= 2;
    var typeIcon = level.icon;
    
    return '<div class="location-type-card" data-type-id="' + type.id + '" style="background:rgba(13,17,25,0.8); border:1px solid ' + (priority === 1 ? 'var(--accent)' : 'var(--border)') + '; border-radius:12px; margin-bottom:12px; overflow:hidden;">' +
        '<div class="location-type-header" data-type-id="' + type.id + '" style="padding:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; cursor:pointer; ' + (priority === 1 ? 'background:rgba(106,158,207,0.1);' : '') + '">' +
        '<div class="type-info" style="display:flex; flex-wrap:wrap; align-items:center; gap:12px; flex:1;">' +
        '<span class="type-priority-badge" style="font-size:1.2rem;">' + typeIcon + '</span>' +
        '<span class="type-name" style="font-size:0.85rem; color:var(--accent);"><strong>' + _escapeHtml(type.displayName) + '</strong></span>' +
        '<span class="type-priority" style="font-size:0.55rem; padding:2px 8px; background:rgba(106,158,207,0.15); border-radius:12px;">' + _getStarIcon() + ' Priority ' + priority + '</span>' +
        '<span class="type-level" style="font-size:0.55rem; padding:2px 8px; background:rgba(106,158,207,0.15); border-radius:12px;">' + level.icon + ' ' + level.name + '</span>' +
        '<span class="type-place-count" style="font-size:0.55rem; padding:2px 8px; background:rgba(106,158,207,0.15); border-radius:12px;">' + _getHomeIcon() + ' ' + placeCount + ' locations</span>' +
        (canBeCapital ? '<span class="type-capital" style="font-size:0.55rem; padding:2px 8px; background:rgba(200,168,68,0.2); border-radius:12px;color:var(--gold);">' + _getStarIcon() + ' Can be Capital</span>' : '') +
        '</div>' +
        '<div class="type-actions" style="display:flex; gap:8px;">' +
        '<button class="btn small edit-loc-type-btn" data-type-id="' + type.id + '" title="Edit Type" style="padding:3px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">' + _getGearIcon() + ' Edit</button>' +
        '<button class="btn small danger delete-loc-type-btn" data-type-id="' + type.id + '" title="Delete Type" style="padding:3px 10px;background:#8a3020;border:none;color:white;border-radius:4px;cursor:pointer;">' + _getCrossIcon() + ' Delete</button>' +
        '<button class="btn small expand-type-btn" data-type-id="' + type.id + '" title="Show/Hide Details" style="padding:3px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">' + (isExpanded ? '▲' : '▼') + '</button>' +
        '</div>' +
        '</div>' +
        (isExpanded ? renderLocationTypeDetails(type, places, hasMorePlaces) : '') +
        '</div>';
}

function renderLocationTypeListItem(type) {
    var level = _getLevelDisplay(type.priority);
    var placeCount = getPlacesByTypeCount(type.id);
    
    return '<div class="location-type-list-item" data-type-id="' + type.id + '" style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:rgba(13,17,25,0.6); border:1px solid var(--border); border-radius:8px; margin-bottom:8px;">' +
        '<div class="type-info" style="display:flex; align-items:center; gap:12px;">' +
        '<span>' + level.icon + '</span>' +
        '<strong>' + _escapeHtml(type.displayName) + '</strong>' +
        '<span class="badge" style="font-size:0.55rem; background:rgba(106,158,207,0.15); padding:2px 6px; border-radius:10px;">' + _getStarIcon() + ' Priority ' + type.priority + '</span>' +
        '<span class="badge" style="font-size:0.55rem; background:rgba(106,158,207,0.15); padding:2px 6px; border-radius:10px;">' + _getHomeIcon() + ' ' + placeCount + '</span>' +
        (type.priority <= 2 ? '<span class="badge" style="font-size:0.55rem; background:rgba(200,168,68,0.2); padding:2px 6px; border-radius:10px;color:var(--gold);">' + _getStarIcon() + ' Capital</span>' : '') +
        '</div>' +
        '<div class="type-actions" style="display:flex; gap:8px;">' +
        '<button class="btn small edit-loc-type-btn" data-type-id="' + type.id + '" title="Edit" style="padding:3px 8px;background:var(--bg3);border:1px solid var(--border);border-radius:3px;cursor:pointer;">' + _getGearIcon() + '</button>' +
        '<button class="btn small danger delete-loc-type-btn" data-type-id="' + type.id + '" title="Delete" style="padding:3px 8px;background:#8a3020;border:none;color:white;border-radius:3px;cursor:pointer;">' + _getCrossIcon() + '</button>' +
        '</div>' +
        '</div>';
}

function renderLocationTypeDetails(type, places, hasMorePlaces) {
    var priority = type.priority;
    var level = _getLevelDisplay(priority);
    var canBeCapital = priority <= 2;
    
    // Get descendant counts
    var totalDescendants = 0;
    for (var i = 0; i < places.length; i++) {
        var descendants = _getChildPlaces(places[i].id, true);
        totalDescendants += descendants.length;
    }
    
    return '<div class="location-type-details" style="padding:16px; border-top:1px solid var(--border); background:rgba(9,12,18,0.4);">' +
        '<!-- Description Section -->' +
        '<div class="details-section" style="margin-bottom:20px;">' +
        '<div class="section-title" style="font-size:0.65rem; color:var(--accent); margin-bottom:8px;">' + _getBookIcon() + ' Description</div>' +
        '<div class="section-content" style="font-size:0.65rem; color:var(--text);">' +
        _escapeHtml(type.description || 'No description provided.') +
        '</div>' +
        '</div>' +
        
        '<!-- Priority Info -->' +
        '<div class="details-section" style="margin-bottom:20px;">' +
        '<div class="section-title" style="font-size:0.65rem; color:var(--accent); margin-bottom:8px;">' + _getStarIcon() + ' Priority Information</div>' +
        '<div class="section-content" style="background:rgba(9,12,18,0.5); border-radius:8px; padding:12px;">' +
        '<div style="display:grid; grid-template-columns:repeat(2,1fr); gap:8px; font-size:0.65rem;">' +
        '<div><span style="color:var(--accent);">Priority Level:</span> ' + priority + '</div>' +
        '<div><span style="color:var(--accent);">Hierarchy Rank:</span> ' + level.name + '</div>' +
        '<div><span style="color:var(--accent);">' + _getHomeIcon() + ' Locations Count:</span> ' + places.length + '</div>' +
        '<div><span style="color:var(--accent);">' + _getCircleIcon() + ' Descendants:</span> ' + totalDescendants + '</div>' +
        '<div><span style="color:var(--accent);">Can be Capital:</span> ' + (canBeCapital ? _getCheckIcon() + ' Yes' : 'Typically no') + '</div>' +
        '<div><span style="color:var(--accent);">' + _getPersonIcon() + ' Population:</span> ' + getTotalPopulationForType(type.id) + '</div>' +
        '</div>' +
        '</div>' +
        '</div>' +
        
        '<!-- Places Using This Type -->' +
        '<div class="details-section" style="margin-bottom:20px;">' +
        '<div class="section-title" style="font-size:0.65rem; color:var(--accent); margin-bottom:8px;">' + _getHomeIcon() + ' Locations Using This Type (' + places.length + ')</div>' +
        '<div class="section-content">' +
        (places.length === 0 ? 
        '<div class="info-note" style="font-size:0.6rem; color:var(--dim);">' + _getCircleIcon() + ' No locations currently use this type.</div>' : 
        '<div class="places-list" style="display:flex; flex-wrap:wrap; gap:8px;">' +
        places.map(function(place) {
            var hierarchy = _getLocationHierarchyDisplay(place);
            return '<span class="place-item clickable" data-place-id="' + place.id + '" style="display:inline-flex; align-items:center; gap:6px; padding:4px 10px; background:rgba(9,12,18,0.6); border:1px solid var(--border2); border-radius:6px; font-size:0.65rem; cursor:pointer;" title="' + _escapeHtml(hierarchy) + '">' +
                (place.isCapital ? _getStarIcon() : _getHomeIcon()) + ' ' + _escapeHtml(place.displayName) +
                '</span>';
        }).join('') +
        (hasMorePlaces ? '<span class="more-places" style="font-size:0.6rem; color:var(--dim);">+' + (getPlacesByTypeCount(type.id) - 5) + ' more...</span>' : '') +
        '</div>') +
        '</div>' +
        '</div>' +
        '</div>';
}

// =============================================================================
// 6.1 Helper: Get total population for type
// =============================================================================

function getTotalPopulationForType(typeId) {
    var places = getPlacesByType(typeId);
    var total = 0;
    var popFn = typeof window.getLocationPopulationCount === 'function' ? 
        window.getLocationPopulationCount : 
        function(id) { return 0; };
    
    for (var i = 0; i < places.length; i++) {
        total += popFn(places[i].id) || 0;
    }
    return total;
}

// =============================================================================
// 7. EVENT HANDLERS
// =============================================================================

function attachLocationTypeActionHandlers(onRefresh) {
    var addBtn = document.getElementById('addLocTypeBtn');
    var refreshBtn = document.getElementById('refreshLocTypesBtn');
    var clearFiltersBtn = document.getElementById('clearLocTypeFiltersBtn');
    
    if (addBtn && !addBtn._clickAttached) {
        addBtn.addEventListener('click', function() {
            _openAddLocationTypeModal(function() {
                if (onRefresh) onRefresh();
            });
        });
        addBtn._clickAttached = true;
    }
    
    if (refreshBtn && !refreshBtn._clickAttached) {
        refreshBtn.addEventListener('click', function() {
            if (onRefresh) onRefresh();
            _showToast(_getRefreshIcon() + ' Location types refreshed', 'success');
        });
        refreshBtn._clickAttached = true;
    }
    
    if (clearFiltersBtn && !clearFiltersBtn._clickAttached) {
        clearFiltersBtn.addEventListener('click', function() {
            locationTypesState.searchTerm = '';
            locationTypesState.sortBy = 'priority';
            locationTypesState.viewMode = 'cards';
            var searchInput = document.getElementById('locTypeSearch');
            var sortSelect = document.getElementById('locTypeSort');
            var viewSelect = document.getElementById('locTypeView');
            if (searchInput) searchInput.value = '';
            if (sortSelect) sortSelect.value = 'priority';
            if (viewSelect) viewSelect.value = 'cards';
            if (onRefresh) onRefresh();
            _showToast(_getRefreshIcon() + ' Filters cleared', 'info');
        });
        clearFiltersBtn._clickAttached = true;
    }
}

function attachLocationTypeFilterHandlers(onRefresh) {
    var searchInput = document.getElementById('locTypeSearch');
    var sortSelect = document.getElementById('locTypeSort');
    var viewSelect = document.getElementById('locTypeView');
    
    var updateFilters = function() {
        locationTypesState.searchTerm = searchInput ? searchInput.value : '';
        locationTypesState.sortBy = sortSelect ? sortSelect.value : 'priority';
        locationTypesState.viewMode = viewSelect ? viewSelect.value : 'cards';
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
    
    if (viewSelect && !viewSelect._changeAttached) {
        viewSelect.addEventListener('change', updateFilters);
        viewSelect._changeAttached = true;
    }
}

function attachLocationTypeCardHandlersDelegated(onRefresh) {
    var container = document.getElementById('locTypesContainer');
    if (!container) {
        container = document;
    }
    
    if (container._delegateAttached) return;
    container._delegateAttached = true;
    
    container.addEventListener('click', function(e) {
        // Edit button
        var editBtn = e.target.closest('.edit-loc-type-btn');
        if (editBtn) {
            e.stopPropagation();
            var typeId = editBtn.dataset.typeId;
            _openEditLocationTypeModal(typeId, function() {
                if (onRefresh) onRefresh();
            });
            return;
        }
        
        // Delete button
        var deleteBtn = e.target.closest('.delete-loc-type-btn');
        if (deleteBtn) {
            e.stopPropagation();
            var typeId = deleteBtn.dataset.typeId;
            _openDeleteLocationTypeModal(typeId, function() {
                if (onRefresh) onRefresh();
            });
            return;
        }
        
        // Expand button
        var expandBtn = e.target.closest('.expand-type-btn');
        if (expandBtn) {
            e.stopPropagation();
            var typeId = expandBtn.dataset.typeId;
            if (locationTypesState.expandedTypeId === typeId) {
                locationTypesState.expandedTypeId = null;
            } else {
                locationTypesState.expandedTypeId = typeId;
            }
            if (onRefresh) onRefresh();
            return;
        }
        
        // Header click (expand/collapse)
        var header = e.target.closest('.location-type-header');
        if (header && !e.target.closest('.edit-loc-type-btn') && 
            !e.target.closest('.delete-loc-type-btn') && 
            !e.target.closest('.expand-type-btn')) {
            var typeId = header.dataset.typeId;
            if (locationTypesState.expandedTypeId === typeId) {
                locationTypesState.expandedTypeId = null;
            } else {
                locationTypesState.expandedTypeId = typeId;
            }
            if (onRefresh) onRefresh();
            return;
        }
        
        // Place item click (select place in tree)
        var placeItem = e.target.closest('.place-item');
        if (placeItem) {
            e.stopPropagation();
            var placeId = placeItem.dataset.placeId;
            if (placeId && typeof window.selectPlaceInTree === 'function') {
                window.selectPlaceInTree(placeId, function() {
                    if (onRefresh) onRefresh();
                });
            } else if (placeId && typeof window.selectPlace === 'function') {
                window.selectPlace(placeId);
            }
            return;
        }
    });
}

// =============================================================================
// 8. EXPORTS
// =============================================================================

window.renderLocationTypesTab = renderLocationTypesTab;
window.locationTypesState = locationTypesState;

// ES Module exports
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        renderLocationTypesTab: renderLocationTypesTab,
        locationTypesState: locationTypesState
    };
}