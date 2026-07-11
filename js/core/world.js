/**
 * =============================================================================
 * STILL WATERS - WORLD SYSTEM (js/core/world.js)
 * =============================================================================
 * 
 * LOCATION: js/core/world.js
 * 
 * This file contains WORLD-LEVEL operations including:
 * - Place/World CRUD operations
 * - Location hierarchy management
 * - Population counts with caching
 * - Move recording
 * - Settlement data operations (delegated to settlementSystem.js)
 * - FIX: Unknown location resolution
 * - FIX: No birth move record created
 * - FIX: getCurrentLocationId properly reads from moves
 * - Location grouping functions (moved from accessors.js)
 * - Grouped character dropdown generation (moved from accessors.js)
 * 
 * DEPENDENCIES:
 *   - accessors.js (getPlaces, getPlaceById, getCharacters, getLocationTypes)
 *   - storage.js (saveMasterData)
 *   - time.js (getCurrentYearSafe)
 * 
 * FIXED:
 *   - Added recursion guard to invalidateWorldCache()
 *   - Added cache invalidation on all data mutations
 *   - Added safe event dispatching
 *   - getCurrentLocation now resolves "Unknown" locations
 *   - getCurrentLocationId properly reads from moves
 *   - recordMove no longer creates birth move records (skipBirthRecord option)
 *   - Added fixUnknownLocations() helper
 * 
 * =============================================================================
 */

// =============================================================================
// 1. DEPENDENCY WRAPPERS
// =============================================================================

function _getPlaces() {
    return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
}

function _getPlaceById(id) {
    return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
}

function _getCharacters() {
    return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
}

function _getCharacterById(id) {
    return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
}

function _getLocationTypes() {
    return typeof window.getLocationTypes === 'function' ? window.getLocationTypes() : [];
}

function _getLocationTypeById(id) {
    return typeof window.getLocationTypeById === 'function' ? window.getLocationTypeById(id) : null;
}

function _getLocationTypePriority(typeId) {
    if (typeof window.getLocationTypePriority === 'function') {
        return window.getLocationTypePriority(typeId);
    }
    var type = _getLocationTypeById(typeId);
    return type ? type.priority : 5;
}

function _getCurrentYear() {
    if (typeof window.getCurrentYearSafe === 'function') {
        return window.getCurrentYearSafe();
    }
    if (typeof window.getCurrentYear === 'function') {
        return window.getCurrentYear();
    }
    return 1250;
}

function _saveMasterData() {
    if (typeof window.saveMasterData === 'function') {
        window.saveMasterData();
    }
}

function _generateId(prefix) {
    if (typeof window.generateId === 'function') {
        return window.generateId(prefix);
    }
    return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

function _showToast(message, type) {
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
    } else if (typeof window.showToastMessage === 'function') {
        window.showToastMessage(message, type);
    }
}

function _getRanks() {
    if (typeof window.getRanks === 'function') {
        return window.getRanks();
    }
    return [];
}

function _getRankById(id) {
    if (typeof window.getRankById === 'function') {
        return window.getRankById(id);
    }
    return null;
}

// =============================================================================
// 2. RECURSION GUARD
// =============================================================================

let _invalidatingWorld = false;

// =============================================================================
// 3. CACHE MANAGEMENT
// =============================================================================

let _worldCache = new Map();
let _populationCache = new Map();
let _hierarchyCache = new Map();
let _locationGroupCache = null;

function invalidateWorldCache() {
    // PREVENT INFINITE RECURSION
    if (_invalidatingWorld) {
        console.warn('invalidateWorldCache: already running, skipping');
        return;
    }
    _invalidatingWorld = true;
    
    try {
        _worldCache.clear();
        _populationCache.clear();
        _hierarchyCache.clear();
        _locationGroupCache = null;

        
        // Dispatch events safely - DON'T call invalidateAccessorCaches directly
        try {
            if (typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(new CustomEvent('worldCacheInvalidated'));
            }
        } catch(e) {
            // Silent fail
        }
    } catch(e) {
        console.warn('Error in invalidateWorldCache:', e);
    } finally {
        _invalidatingWorld = false;
    }
}

function invalidatePopulationCache() {
    _populationCache.clear();
    _hierarchyCache.clear();
}

// Listen for master data updates
if (typeof window !== 'undefined') {
    window.addEventListener('masterDataUpdated', function() {
        invalidateWorldCache();
    });
}

// =============================================================================
// 4. PLACE CRUD
// =============================================================================

function createPlace(data) {
    if (!data || !data.displayName) return null;
    
    var places = _getPlaces();
    var newPlace = {
        id: data.id || _generateId('loc'),
        displayName: data.displayName.trim(),
        typeId: data.typeId || null,
        parentId: data.parentId || null,
        variableKey: data.variableKey || data.displayName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        status: data.status || 'active',
        isCapital: data.isCapital || false,
        leaderId: data.leaderId || null,
        leaderHistory: data.leaderHistory || [],
        subtype: data.subtype || '',
        economy: data.economy || '',
        export: data.export || '',
        notes: data.notes || '',
        governmentTypeId: data.governmentTypeId || null,
        governmentStyle: data.governmentStyle || null,
        leaderAssignments: data.leaderAssignments || [],
        settlementData: data.settlementData || null,
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
    
    places.push(newPlace);
    _saveMasterData();
    invalidateWorldCache();
    
    return newPlace;
}

function updatePlace(placeId, updates) {
    var place = _getPlaceById(placeId);
    if (!place) return null;
    
    var allowedFields = ['displayName', 'typeId', 'parentId', 'variableKey', 'status', 'isCapital', 'leaderId', 'subtype', 'economy', 'export', 'notes', 'governmentTypeId', 'governmentStyle'];
    for (var i = 0; i < allowedFields.length; i++) {
        var key = allowedFields[i];
        if (updates[key] !== undefined) {
            place[key] = updates[key];
        }
    }
    
    if (updates.displayName) {
        place.displayName = updates.displayName.trim();
    }
    
    place.updatedAt = Date.now();
    _saveMasterData();
    invalidateWorldCache();
    
    return place;
}

function deletePlace(placeId, cascade) {
    cascade = cascade || false;
    var place = _getPlaceById(placeId);
    if (!place) return false;
    
    var places = _getPlaces();
    var index = -1;
    for (var i = 0; i < places.length; i++) {
        if (places[i].id === placeId) {
            index = i;
            break;
        }
    }
    if (index === -1) return false;
    
    if (cascade) {
        // Find all child places recursively
        var childIds = [];
        var queue = [placeId];
        var visited = new Set();
        
        while (queue.length > 0) {
            var currentId = queue.shift();
            if (visited.has(currentId)) continue;
            visited.add(currentId);
            
            for (var i = 0; i < places.length; i++) {
                if (places[i].parentId === currentId && !visited.has(places[i].id)) {
                    childIds.push(places[i].id);
                    queue.push(places[i].id);
                }
            }
        }
        
        // Remove children (in reverse order)
        for (var i = childIds.length - 1; i >= 0; i--) {
            deletePlace(childIds[i], false);
        }
    } else {
        // Re-parent children to the deleted place's parent
        for (var i = 0; i < places.length; i++) {
            if (places[i].parentId === placeId) {
                places[i].parentId = place.parentId;
                places[i].updatedAt = Date.now();
            }
        }
    }
    
    places.splice(index, 1);
    _saveMasterData();
    invalidateWorldCache();
    
    return true;
}

function setPlaceCapital(placeId, isCapital) {
    var place = _getPlaceById(placeId);
    if (!place) return false;
    
    place.isCapital = !!isCapital;
    place.updatedAt = Date.now();
    _saveMasterData();
    invalidateWorldCache();
    
    return true;
}

// =============================================================================
// 5. LOCATION HIERARCHY
// =============================================================================

function getChildPlaces(parentId, recursive) {
    recursive = recursive || false;
    var places = _getPlaces();
    var result = [];
    
    if (recursive) {
        var queue = [parentId];
        var visited = new Set();
        
        while (queue.length > 0) {
            var currentId = queue.shift();
            if (visited.has(currentId)) continue;
            visited.add(currentId);
            
            for (var i = 0; i < places.length; i++) {
                if (places[i].parentId === currentId && !visited.has(places[i].id)) {
                    result.push(places[i]);
                    queue.push(places[i].id);
                }
            }
        }
    } else {
        for (var i = 0; i < places.length; i++) {
            if (places[i].parentId === parentId) {
                result.push(places[i]);
            }
        }
    }
    
    return result;
}

function getPlacesByPriority(priority) {
    var places = _getPlaces();
    var result = [];
    for (var i = 0; i < places.length; i++) {
        var type = _getLocationTypeById(places[i].typeId);
        if (type && type.priority === priority) {
            result.push(places[i]);
        }
    }
    return result;
}

function getTopLevelPlaces() {
    var places = _getPlaces();
    var result = [];
    for (var i = 0; i < places.length; i++) {
        if (!places[i].parentId) {
            result.push(places[i]);
        }
    }
    return result;
}

function getAllSubLocationIds(locationId) {
    // Check cache first
    if (_hierarchyCache.has(locationId)) {
        return _hierarchyCache.get(locationId);
    }
    
    var places = _getPlaces();
    var result = [locationId];
    var queue = [locationId];
    var visited = new Set();
    
    while (queue.length > 0) {
        var currentId = queue.shift();
        if (visited.has(currentId)) continue;
        visited.add(currentId);
        
        for (var i = 0; i < places.length; i++) {
            if (places[i].parentId === currentId && !visited.has(places[i].id)) {
                result.push(places[i].id);
                queue.push(places[i].id);
            }
        }
    }
    
    _hierarchyCache.set(locationId, result);
    return result;
}

function getLocationHierarchy(placeId) {
    var place = _getPlaceById(placeId);
    if (!place) return [];
    
    var hierarchy = [];
    var current = place;
    var visited = new Set();
    
    while (current && !visited.has(current.id)) {
        visited.add(current.id);
        hierarchy.unshift(current);
        current = current.parentId ? _getPlaceById(current.parentId) : null;
    }
    
    return hierarchy;
}

function getLocationHierarchyDisplay(place) {
    if (!place) return '';
    var hierarchy = getLocationHierarchy(place);
    var names = [];
    for (var i = 0; i < hierarchy.length; i++) {
        names.push(hierarchy[i].displayName);
    }
    return names.join(' > ');
}

function getLocationTypePriority(typeId) {
    var type = _getLocationTypeById(typeId);
    return type ? type.priority : 5;
}

function getPlacePriority(place) {
    if (!place) return 999;
    return getLocationTypePriority(place.typeId);
}

function getCountryId(place) {
    if (!place) return null;
    
    var current = place;
    var visited = new Set();
    var highestPriority = 5;
    var countryId = null;
    
    while (current && !visited.has(current.id)) {
        visited.add(current.id);
        var priority = getLocationTypePriority(current.typeId);
        if (priority < highestPriority) {
            highestPriority = priority;
            countryId = current.id;
        }
        if (!current.parentId) break;
        current = _getPlaceById(current.parentId);
    }
    
    return countryId;
}

function getParentChain(place) {
    if (!place) return [];
    var chain = [];
    var current = place;
    var visited = new Set();
    
    while (current && !visited.has(current.id)) {
        visited.add(current.id);
        if (current.id !== place.id) {
            chain.unshift(current);
        }
        if (!current.parentId) break;
        current = _getPlaceById(current.parentId);
    }
    
    return chain;
}

function getLocationAtPriority(place, targetPriority) {
    if (!place) return null;
    var hierarchy = getLocationHierarchy(place);
    for (var i = 0; i < hierarchy.length; i++) {
        var p = hierarchy[i];
        var priority = getLocationTypePriority(p.typeId);
        if (priority === targetPriority) {
            return p;
        }
    }
    return null;
}

// =============================================================================
// 6. LOCATION GROUPING FUNCTIONS (moved from accessors.js)
// =============================================================================

/**
 * Gets the hierarchical location path for a character
 * Returns an array of location objects from highest (Type 1) to lowest
 * @param {Object} character - Character object
 * @returns {Array} Array of location objects in hierarchy
 */
function getCharacterLocationPath(character) {
    if (!character) return [];
    
    // Check cache
    if (_locationGroupCache && _locationGroupCache.has(character.id)) {
        return _locationGroupCache.get(character.id);
    }
    
    if (!_locationGroupCache) {
        _locationGroupCache = new Map();
    }
    
    var locationId = getCurrentLocationId(character);
    
    if (!locationId) {
        _locationGroupCache.set(character.id, []);
        return [];
    }
    
    var place = _getPlaceById(locationId);
    if (!place) {
        _locationGroupCache.set(character.id, []);
        return [];
    }
    
    // Get the hierarchy path by walking up parents
    var path = [];
    var current = place;
    var visited = new Set();
    
    while (current && !visited.has(current.id)) {
        visited.add(current.id);
        var priority = getLocationTypePriority(current.typeId);
        path.push({
            id: current.id,
            name: current.displayName,
            priority: priority,
            typeId: current.typeId
        });
        if (!current.parentId) break;
        current = _getPlaceById(current.parentId);
    }
    
    // Reverse so highest priority (Type 1) is first
    path.reverse();
    
    // Cache the result
    _locationGroupCache.set(character.id, path);
    return path;
}

function getCharacterLocationGroup(character, withIcons) {
    withIcons = withIcons || false;
    var path = getCharacterLocationPath(character);
    if (path.length === 0) return 'Ungrouped';
    
    var groups = [];
    for (var i = 0; i < path.length; i++) {
        var p = path[i];
        var name = p.name;
        if (withIcons) {
            var prefix = '';
            if (p.priority === 1) prefix = '🌍 ';
            else if (p.priority === 2) prefix = '🏛️ ';
            else if (p.priority === 3) prefix = '🏰 ';
            else if (p.priority === 4) prefix = '🏘️ ';
            else if (p.priority === 5) prefix = '🏠 ';
            name = prefix + name;
        }
        groups.push(name);
    }
    
    return groups.join(' › ');
}

function getCharacterCountry(character) {
    var path = getCharacterLocationPath(character);
    for (var i = 0; i < path.length; i++) {
        if (path[i].priority === 1) {
            return _getPlaceById(path[i].id);
        }
    }
    return null;
}

function getCharacterMostSpecificLocation(character) {
    var path = getCharacterLocationPath(character);
    if (path.length === 0) return null;
    // Return the last item in the path (most specific)
    var last = path[path.length - 1];
    return _getPlaceById(last.id);
}

function getCharactersGroupedByLocation(includeDeceased) {
    includeDeceased = includeDeceased || false;
    
    var characters = _getCharacters();
    var groups = {};
    var ungrouped = [];
    
    for (var i = 0; i < characters.length; i++) {
        var char = characters[i];
        if (!includeDeceased && char.isDeceased) continue;
        
        var groupName = getCharacterLocationGroup(char, false);
        if (groupName === 'Ungrouped') {
            ungrouped.push(char);
            continue;
        }
        if (!groups[groupName]) {
            groups[groupName] = [];
        }
        groups[groupName].push(char);
    }
    
    // Sort each group by name
    for (var key in groups) {
        groups[key].sort(function(a, b) {
            var nameA = (a.name + ' ' + (a.surname || '')).trim();
            var nameB = (b.name + ' ' + (b.surname || '')).trim();
            return nameA.localeCompare(nameB);
        });
    }
    
    // Add ungrouped at the end
    if (ungrouped.length > 0) {
        groups['Ungrouped'] = ungrouped;
    }
    
    // Sort group keys by hierarchy order (prioritize Type 1 groups)
    var sortedKeys = Object.keys(groups).sort(function(a, b) {
        if (a === 'Ungrouped') return 1;
        if (b === 'Ungrouped') return -1;
        // Check if group names start with country indicators
        var aHasCountry = a.indexOf('🌍') !== -1;
        var bHasCountry = b.indexOf('🌍') !== -1;
        if (aHasCountry && !bHasCountry) return -1;
        if (!aHasCountry && bHasCountry) return 1;
        return a.localeCompare(b);
    });
    
    var result = {};
    for (var i = 0; i < sortedKeys.length; i++) {
        result[sortedKeys[i]] = groups[sortedKeys[i]];
    }
    
    return result;
}

function getCharacterGroupCounts(includeDeceased) {
    includeDeceased = includeDeceased || false;
    var groups = getCharactersGroupedByLocation(includeDeceased);
    var counts = {};
    for (var key in groups) {
        counts[key] = groups[key].length;
    }
    return counts;
}

function generateGroupedCharacterDropdown(selectedId, includeDeceased, placeholderText) {
    placeholderText = placeholderText || '— Select a character —';
    includeDeceased = includeDeceased || false;
    var groups = getCharactersGroupedByLocation(includeDeceased);
    var ranks = _getRanks();
    
    var html = '<select id="groupedCharacterSelect" class="grouped-character-select" style="width:100%;padding:10px 12px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:0.8rem;font-family:\'Courier New\',monospace;appearance:auto;max-height:500px;">';
    html += '<option value="">' + placeholderText + '</option>';
    
    // Build location hierarchy for display
    var groupKeys = Object.keys(groups);
    
    for (var g = 0; g < groupKeys.length; g++) {
        var groupName = groupKeys[g];
        var chars = groups[groupName];
        
        // Determine indent level based on group name depth
        var pathParts = groupName.split(' › ');
        var indentLevel = Math.min(pathParts.length - 1, 4);
        
        // Create optgroup with indent
        var displayLabel = groupName;
        if (indentLevel > 0) {
            displayLabel = '    '.repeat(indentLevel) + '└─ ' + pathParts[pathParts.length - 1];
        }
        
        html += '<optgroup label="' + displayLabel + ' (' + chars.length + ')" style="font-weight:bold;color:var(--accent);background:var(--bg2);padding:4px 0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;">';
        
        // Sort characters by name
        chars.sort(function(a, b) {
            return (a.name || '').localeCompare(b.name || '');
        });
        
        for (var c = 0; c < chars.length; c++) {
            var char = chars[c];
            html += _buildCharacterOption(char, ranks, selectedId, indentLevel + 1);
        }
        
        html += '</optgroup>';
    }
    
    html += '</select>';
    return html;
}

function _buildCharacterOption(char, ranks, selectedId, indentLevel) {
    // Get rank symbol
    var rankSymbol = '';
    if (char.activeRankId) {
        for (var i = 0; i < ranks.length; i++) {
            if (ranks[i].id === char.activeRankId) {
                rankSymbol = ranks[i].symbol || '';
                break;
            }
        }
    }
    // Check rankAssignments if activeRankId not set
    if (!rankSymbol && char.rankAssignments && char.rankAssignments.length > 0) {
        for (var ra = 0; ra < char.rankAssignments.length; ra++) {
            if (char.rankAssignments[ra].isDeprecated) continue;
            for (var j = 0; j < ranks.length; j++) {
                if (ranks[j].id === char.rankAssignments[ra].rankId) {
                    rankSymbol = ranks[j].symbol || '';
                    break;
                }
            }
            if (rankSymbol) break;
        }
    }
    
    var genderSymbol = char.gender === 'male' ? '♂' : (char.gender === 'female' ? '♀' : '⚥');
    var age = _calculateAge(char.birthYear, char.isDeceased, char.deathYear);
    var deceasedMark = char.isDeceased ? ' †' : '';
    var fullName = (char.name || '?') + (char.surname ? ' ' + char.surname : '');
    
    var paddingLeft = indentLevel * 16 + 4;
    var selected = (selectedId === char.id) ? 'selected' : '';
    
    var displayText = (rankSymbol ? rankSymbol + ' ' : '') + 
                      genderSymbol + ' ' + 
                      fullName + 
                      deceasedMark + 
                      ' (' + age + 'y)';
    
    return '<option value="' + char.id + '" ' + selected + ' style="padding-left: ' + paddingLeft + 'px; white-space: pre; font-family:\'Courier New\',monospace; font-size:0.78rem;">' + 
        '    '.repeat(indentLevel) + displayText + 
        '</option>';
}

function attachGroupedCharacterDropdownListener(containerId, onSelect) {
    var select = null;
    
    if (typeof containerId === 'string') {
        var container = document.getElementById(containerId);
        if (!container) return false;
        select = container.querySelector('.grouped-character-select');
        if (!select) {
            select = document.getElementById(containerId);
        }
    } else if (containerId && containerId.tagName === 'SELECT') {
        select = containerId;
    }
    
    if (!select) return false;
    
    // Remove any existing listeners
    if (select._listenerAttached) {
        select.removeEventListener('change', select._changeHandler);
    }
    
    var handler = function(e) {
        var charId = this.value;
        if (charId && onSelect) {
            var char = _getCharacterById(charId);
            if (char) {
                onSelect(char);
            }
        }
    };
    
    select.addEventListener('change', handler);
    select._changeHandler = handler;
    select._listenerAttached = true;
    
    return true;
}

function getLocationHierarchyTree(countryId) {
    var places = _getPlaces();
    var tree = {};
    
    // Find root (Type 1) locations
    var roots = places.filter(function(p) {
        if (countryId && p.id !== countryId) return false;
        var priority = getLocationTypePriority(p.typeId);
        return priority === 1;
    });
    
    function buildNode(place) {
        var priority = getLocationTypePriority(place.typeId);
        var children = places.filter(function(p) { return p.parentId === place.id; });
        return {
            id: place.id,
            name: place.displayName,
            priority: priority,
            children: children.map(function(c) { return buildNode(c); })
        };
    }
    
    for (var i = 0; i < roots.length; i++) {
        tree[roots[i].id] = buildNode(roots[i]);
    }
    
    return tree;
}

function getFormattedLocationHierarchy(countryId, maxDepth) {
    maxDepth = maxDepth || 5;
    var tree = getLocationHierarchyTree(countryId);
    var output = '';
    
    function traverse(node, depth) {
        if (depth > maxDepth) return;
        var indent = '  '.repeat(depth);
        var prefix = depth === 0 ? '' : (depth === 1 ? '├─ ' : '│  ');
        output += indent + prefix + node.name + '\n';
        for (var i = 0; i < node.children.length; i++) {
            traverse(node.children[i], depth + 1);
        }
    }
    
    for (var key in tree) {
        traverse(tree[key], 0);
    }
    
    return output;
}

// =============================================================================
// 7. POPULATION COUNTING
// =============================================================================

function _resolveCharacterLocationId(character) {
    if (!character) return null;
    
    // Use getCurrentLocationId which reads from moves
    return getCurrentLocationId(character);
}

function _calculateAge(birthYear, isDeceased, deathYear) {
    if (typeof window.calculateAge === 'function') {
        return window.calculateAge(birthYear, isDeceased, deathYear);
    }
    if (!birthYear || typeof birthYear !== 'number') return 0;
    var currentYear = _getCurrentYear();
    if (isDeceased && deathYear && typeof deathYear === 'number') {
        return Math.max(0, deathYear - birthYear);
    }
    return Math.max(0, currentYear - birthYear);
}

function _getPlaceByDisplayName(displayName) {
    if (typeof window.getPlaceByDisplayName === 'function') {
        return window.getPlaceByDisplayName(displayName);
    }
    if (!displayName) return null;
    var places = _getPlaces();
    for (var i = 0; i < places.length; i++) {
        if (places[i].displayName === displayName) return places[i];
    }
    return null;
}

function getLocationOwnPopulation(locationId) {
    if (!locationId) return 0;
    
    var cacheKey = 'own_' + locationId;
    if (_populationCache.has(cacheKey)) {
        return _populationCache.get(cacheKey);
    }
    
    var characters = _getCharacters();
    var count = 0;
    
    for (var i = 0; i < characters.length; i++) {
        if (characters[i].isDeceased) continue;
        var charLocationId = _resolveCharacterLocationId(characters[i]);
        if (charLocationId === locationId) {
            count++;
        }
    }
    
    _populationCache.set(cacheKey, count);
    return count;
}

function getLocationPopulationCount(locationId) {
    if (!locationId) return 0;
    
    var cacheKey = 'total_' + locationId;
    if (_populationCache.has(cacheKey)) {
        return _populationCache.get(cacheKey);
    }
    
    var locationIds = getAllSubLocationIds(locationId);
    var locationIdSet = new Set(locationIds);
    var characters = _getCharacters();
    var count = 0;
    
    for (var i = 0; i < characters.length; i++) {
        if (characters[i].isDeceased) continue;
        var charLocationId = _resolveCharacterLocationId(characters[i]);
        if (charLocationId && locationIdSet.has(charLocationId)) {
            count++;
        }
    }
    
    _populationCache.set(cacheKey, count);
    return count;
}

function getLocationPopulationWithBreakdown(locationId) {
    if (!locationId) return { total: 0, byAgeGroup: {}, byGender: {} };
    
    var locationIds = getAllSubLocationIds(locationId);
    var locationIdSet = new Set(locationIds);
    var characters = _getCharacters();
    var currentYear = _getCurrentYear();
    
    var total = 0;
    var byAgeGroup = {
        '0-10': 0,
        '11-20': 0,
        '21-30': 0,
        '31-40': 0,
        '41-50': 0,
        '51-60': 0,
        '61-70': 0,
        '71-80': 0,
        '81-90': 0,
        '91+': 0
    };
    var byGender = {
        male: 0,
        female: 0,
        unknown: 0
    };
    
    for (var i = 0; i < characters.length; i++) {
        var char = characters[i];
        if (char.isDeceased) continue;
        var charLocationId = _resolveCharacterLocationId(char);
        if (charLocationId && locationIdSet.has(charLocationId)) {
            total++;
            
            if (char.gender === 'male') byGender.male++;
            else if (char.gender === 'female') byGender.female++;
            else byGender.unknown++;
            
            var age = currentYear - (char.birthYear || currentYear);
            if (age <= 10) byAgeGroup['0-10']++;
            else if (age <= 20) byAgeGroup['11-20']++;
            else if (age <= 30) byAgeGroup['21-30']++;
            else if (age <= 40) byAgeGroup['31-40']++;
            else if (age <= 50) byAgeGroup['41-50']++;
            else if (age <= 60) byAgeGroup['51-60']++;
            else if (age <= 70) byAgeGroup['61-70']++;
            else if (age <= 80) byAgeGroup['71-80']++;
            else if (age <= 90) byAgeGroup['81-90']++;
            else byAgeGroup['91+']++;
        }
    }
    
    return { total: total, byAgeGroup: byAgeGroup, byGender: byGender };
}

// =============================================================================
// 8. MOVE RECORDING - FIXED: No birth record, proper location resolution
// =============================================================================

/**
 * Records a move for a character
 * @param {Object} character - Character object
 * @param {number} year - Year of the move
 * @param {string} locationId - Target location ID
 * @param {string} note - Optional note about the move
 * @param {boolean} skipUndo - Skip undo recording
 * @param {boolean} skipBirthRecord - If true, don't record as a birth move (used for newborn creation)
 * @returns {boolean} True if successful
 */
function recordMove(character, year, locationId, note, skipUndo, skipBirthRecord) {
    skipUndo = skipUndo || false;
    skipBirthRecord = skipBirthRecord || false;
    if (!character || !locationId) return false;
    
    var location = _getPlaceById(locationId);
    if (!location) return false;
    
    if (!character.moves) character.moves = [];
    
    // Store the current location before moving (fallback to birthplace)
    var fromLocationId = character.currentLocationId || character.birthplaceId || null;
    var fromLocationName = character.currentLocation || 
                          (fromLocationId ? (_getPlaceById(fromLocationId) ? _getPlaceById(fromLocationId).displayName : null) : null) ||
                          'Unknown';
    
    var moveRecord = {
        year: year || _getCurrentYear(),
        locationId: locationId,
        locationName: location.displayName,
        note: note || '',
        fromLocationId: fromLocationId,
        fromLocationName: fromLocationName,
        isBirthMove: false,
        timestamp: Date.now()
    };
    
    // Only add the move if it's not a birth record
    if (!skipBirthRecord) {
        character.moves.push(moveRecord);
    }
    
    // Update current location with the display name
    character.currentLocation = location.displayName;
    character.currentLocationId = locationId;
    
    _saveMasterData();
    invalidateWorldCache();
    invalidatePopulationCache();
    
    return true;
}

function getCharacterLocationHistory(characterId) {
    var character = _getCharacterById(characterId);
    if (!character) return [];
    return character.moves || [];
}

/**
 * FIXED: Gets current location from moves first, then falls back
 */
function getCurrentLocation(character) {
    if (!character) return 'Unknown';
    
    // 1. Check moves - use the most recent move
    if (character.moves && character.moves.length > 0) {
        var sortedMoves = character.moves.slice().sort(function(a, b) {
            return (b.year || 0) - (a.year || 0);
        });
        var lastMove = sortedMoves[0];
        if (lastMove) {
            if (lastMove.locationName && lastMove.locationName !== 'Unknown') {
                if (character.currentLocation === 'Unknown' || !character.currentLocation) {
                    character.currentLocation = lastMove.locationName;
                    character.currentLocationId = lastMove.locationId;
                    _saveMasterData();
                }
                return lastMove.locationName;
            }
            if (lastMove.locationId) {
                var place = _getPlaceById(lastMove.locationId);
                if (place) {
                    if (character.currentLocation === 'Unknown' || !character.currentLocation) {
                        character.currentLocation = place.displayName;
                        character.currentLocationId = lastMove.locationId;
                        _saveMasterData();
                    }
                    return place.displayName;
                }
            }
        }
    }
    
    // 2. Check currentLocation
    if (character.currentLocation && character.currentLocation !== 'Unknown') {
        return character.currentLocation;
    }
    
    // 3. Check currentLocationId
    if (character.currentLocationId) {
        var place = _getPlaceById(character.currentLocationId);
        if (place) {
            if (character.currentLocation === 'Unknown' || !character.currentLocation) {
                character.currentLocation = place.displayName;
                _saveMasterData();
            }
            return place.displayName;
        }
    }
    
    // 4. FALLBACK: If no moves and no current location, use birthplace
    if (character.birthplaceId) {
        var place = _getPlaceById(character.birthplaceId);
        if (place) {
            if (character.currentLocation === 'Unknown' || !character.currentLocation) {
                character.currentLocation = place.displayName;
                character.currentLocationId = character.birthplaceId;
                _saveMasterData();
            }
            return place.displayName;
        }
    }
    
    return 'Unknown';
}

/**
 * FIXED: Gets current location ID from moves first, then falls back
 */
function getCurrentLocationId(character) {
    if (!character) return null;
    
    // 1. Check moves - use the most recent move
    if (character.moves && character.moves.length > 0) {
        var sortedMoves = character.moves.slice().sort(function(a, b) {
            return (b.year || 0) - (a.year || 0);
        });
        var lastMove = sortedMoves[0];
        if (lastMove && lastMove.locationId) {
            if (!character.currentLocationId) {
                character.currentLocationId = lastMove.locationId;
                _saveMasterData();
            }
            return lastMove.locationId;
        }
    }
    
    // 2. Check currentLocationId
    if (character.currentLocationId) return character.currentLocationId;
    
    // 3. FALLBACK: If no moves and no current location, use birthplace
    if (character.birthplaceId) {
        if (!character.currentLocationId) {
            character.currentLocationId = character.birthplaceId;
            _saveMasterData();
        }
        return character.birthplaceId;
    }
    
    return null;
}

// =============================================================================
// 9. FIX CHARACTER LOCATIONS
// =============================================================================

/**
 * Fixes characters that have "Unknown" as currentLocation but have a valid currentLocationId or birthplaceId
 * @param {boolean} saveAfter - Whether to save after fixing
 * @returns {number} Number of characters fixed
 */
function fixUnknownLocations(saveAfter) {
    saveAfter = saveAfter !== false;
    var characters = _getCharacters();
    var fixed = 0;
    var places = _getPlaces();
    var placeMap = {};
    
    // Build a map of place IDs to display names for quick lookup
    for (var i = 0; i < places.length; i++) {
        placeMap[places[i].id] = places[i].displayName;
    }
    
    for (var i = 0; i < characters.length; i++) {
        var char = characters[i];
        // Skip if currentLocation is not "Unknown" or empty
        if (char.currentLocation && char.currentLocation !== 'Unknown') continue;
        
        var resolvedName = null;
        var resolvedId = null;
        
        // Try to resolve from moves
        if (char.moves && char.moves.length > 0) {
            var sortedMoves = char.moves.slice().sort(function(a, b) {
                return (b.year || 0) - (a.year || 0);
            });
            var lastMove = sortedMoves[0];
            if (lastMove) {
                if (lastMove.locationName && lastMove.locationName !== 'Unknown') {
                    resolvedName = lastMove.locationName;
                    resolvedId = lastMove.locationId;
                } else if (lastMove.locationId && placeMap[lastMove.locationId]) {
                    resolvedName = placeMap[lastMove.locationId];
                    resolvedId = lastMove.locationId;
                }
            }
        }
        
        // If not resolved from moves, try currentLocationId
        if (!resolvedName && char.currentLocationId && placeMap[char.currentLocationId]) {
            resolvedName = placeMap[char.currentLocationId];
            resolvedId = char.currentLocationId;
        }
        
        // If still not resolved, try birthplaceId
        if (!resolvedName && char.birthplaceId && placeMap[char.birthplaceId]) {
            resolvedName = placeMap[char.birthplaceId];
            resolvedId = char.birthplaceId;
        }
        
        if (resolvedName && resolvedName !== 'Unknown') {
            char.currentLocation = resolvedName;
            char.currentLocationId = resolvedId || char.currentLocationId;
            fixed++;
        }
    }
    
    if (saveAfter && fixed > 0) {
        _saveMasterData();
        invalidateWorldCache();
        invalidatePopulationCache();
        _showToast('✓ Fixed ' + fixed + ' characters with unknown locations', 'success');
    }
    
    return fixed;
}

// =============================================================================
// 10. GOVERNMENT FUNCTIONS
// =============================================================================

function assignGovernment(placeId, governmentTypeId, governmentStyle) {
    var place = _getPlaceById(placeId);
    if (!place) return false;
    
    place.governmentTypeId = governmentTypeId || null;
    place.governmentStyle = governmentStyle || null;
    place.updatedAt = Date.now();
    _saveMasterData();
    invalidateWorldCache();
    
    return true;
}

// =============================================================================
// 11. LEADER FUNCTIONS
// =============================================================================

function assignLeader(placeId, characterId, startYear, title) {
    var place = _getPlaceById(placeId);
    var character = _getCharacterById(characterId);
    
    if (!place || !character) return null;
    if (character.isDeceased) return null;
    
    if (!place.leaderAssignments) place.leaderAssignments = [];
    
    // End current active term
    for (var i = 0; i < place.leaderAssignments.length; i++) {
        if (place.leaderAssignments[i].isActive && !place.leaderAssignments[i].endYear) {
            place.leaderAssignments[i].isActive = false;
            place.leaderAssignments[i].endYear = startYear - 1;
        }
    }
    
    var assignment = {
        characterId: characterId,
        characterName: character.name,
        startYear: startYear || _getCurrentYear(),
        endYear: null,
        title: title || 'Leader',
        isActive: true,
        notes: '',
        timestamp: Date.now()
    };
    
    place.leaderAssignments.push(assignment);
    place.leaderId = characterId;
    place.updatedAt = Date.now();
    _saveMasterData();
    invalidateWorldCache();
    
    return assignment;
}

function endLeaderTerm(placeId, characterId, endYear) {
    var place = _getPlaceById(placeId);
    if (!place) return false;
    
    if (!place.leaderAssignments) return false;
    
    for (var i = 0; i < place.leaderAssignments.length; i++) {
        var assignment = place.leaderAssignments[i];
        if (assignment.characterId === characterId && assignment.isActive && !assignment.endYear) {
            assignment.isActive = false;
            assignment.endYear = endYear || _getCurrentYear();
            place.updatedAt = Date.now();
            _saveMasterData();
            invalidateWorldCache();
            return true;
        }
    }
    
    return false;
}

function getCurrentLeader(placeId) {
    var place = _getPlaceById(placeId);
    if (!place || !place.leaderAssignments) return null;
    
    for (var i = 0; i < place.leaderAssignments.length; i++) {
        if (place.leaderAssignments[i].isActive && !place.leaderAssignments[i].endYear) {
            var assignment = place.leaderAssignments[i];
            var character = _getCharacterById(assignment.characterId);
            return {
                characterId: assignment.characterId,
                character: character,
                startYear: assignment.startYear,
                title: assignment.title,
                notes: assignment.notes
            };
        }
    }
    return null;
}

function getLeaderHistory(placeId) {
    var place = _getPlaceById(placeId);
    if (!place || !place.leaderAssignments) return [];
    return place.leaderAssignments.slice().sort(function(a, b) {
        return (a.startYear || 0) - (b.startYear || 0);
    });
}

// =============================================================================
// 12. SETTLEMENT DATA (delegated to settlementSystem.js)
// =============================================================================

function getSettlementData(locationId) {
    if (typeof window.getOrCreateSettlementData === 'function') {
        return window.getOrCreateSettlementData(locationId);
    }
    var place = _getPlaceById(locationId);
    if (!place) return null;
    if (!place.settlementData) {
        place.settlementData = {
            rankId: 'hamlet',
            specializationRoleId: null,
            featureIds: [],
            prosperity: 50,
            foundedYear: _getCurrentYear(),
            lastUpgraded: _getCurrentYear(),
            wealth: 0,
            tradeRoutes: [],
            taxRate: 10,
            tradeTariff: 5,
            militarySpending: 0,
            infrastructureSpending: 0,
            educationSpending: 0,
            justiceSeverity: 'medium',
            crimeRate: 0.05,
            hasWatch: false,
            watchSize: 0,
            literacyTarget: 50,
            schoolAttendanceRate: 60,
            notes: ''
        };
        _saveMasterData();
        invalidateWorldCache();
    }
    return place.settlementData;
}

// =============================================================================
// 13. EXPORTS
// =============================================================================

// Cache management
window.invalidateWorldCache = invalidateWorldCache;
window.invalidatePopulationCache = invalidatePopulationCache;

// Place CRUD
window.createPlace = createPlace;
window.updatePlace = updatePlace;
window.deletePlace = deletePlace;
window.setPlaceCapital = setPlaceCapital;

// Location hierarchy
window.getChildPlaces = getChildPlaces;
window.getPlacesByPriority = getPlacesByPriority;
window.getTopLevelPlaces = getTopLevelPlaces;
window.getAllSubLocationIds = getAllSubLocationIds;
window.getLocationHierarchy = getLocationHierarchy;
window.getLocationHierarchyDisplay = getLocationHierarchyDisplay;
window.getLocationTypePriority = getLocationTypePriority;
window.getPlacePriority = getPlacePriority;
window.getCountryId = getCountryId;
window.getParentChain = getParentChain;
window.getLocationAtPriority = getLocationAtPriority;

// Location grouping
window.getCharacterLocationPath = getCharacterLocationPath;
window.getCharacterLocationGroup = getCharacterLocationGroup;
window.getCharacterCountry = getCharacterCountry;
window.getCharacterMostSpecificLocation = getCharacterMostSpecificLocation;
window.getCharactersGroupedByLocation = getCharactersGroupedByLocation;
window.getCharacterGroupCounts = getCharacterGroupCounts;
window.generateGroupedCharacterDropdown = generateGroupedCharacterDropdown;
window.attachGroupedCharacterDropdownListener = attachGroupedCharacterDropdownListener;
window.getLocationHierarchyTree = getLocationHierarchyTree;
window.getFormattedLocationHierarchy = getFormattedLocationHierarchy;

// Population
window.getLocationOwnPopulation = getLocationOwnPopulation;
window.getLocationPopulationCount = getLocationPopulationCount;
window.getLocationPopulationWithBreakdown = getLocationPopulationWithBreakdown;
window._resolveCharacterLocationId = _resolveCharacterLocationId;

// Moves - updated with skipBirthRecord parameter
window.recordMove = recordMove;
window.getCharacterLocationHistory = getCharacterLocationHistory;
window.getCurrentLocation = getCurrentLocation;
window.getCurrentLocationId = getCurrentLocationId;

// Fix locations
window.fixUnknownLocations = fixUnknownLocations;

// Government
window.assignGovernment = assignGovernment;

// Leaders
window.assignLeader = assignLeader;
window.endLeaderTerm = endLeaderTerm;
window.getCurrentLeader = getCurrentLeader;
window.getLeaderHistory = getLeaderHistory;

// Settlement data
window.getSettlementData = getSettlementData;

