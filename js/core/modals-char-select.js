/**
 * =============================================================================
 * CHARACTER SELECTOR MODAL (modals-char-select.js)
 * =============================================================================
 * 
 * LOCATION: js/core/modals/modals-char-select.js
 * 
 * This is the SINGLE SOURCE OF TRUTH for character selection modals.
 * 
 * DEPENDENCIES:
 *   - modals-core.js: openModal, closeTopModal, _escapeHtml, _showToast, _getIcon
 *   - accessors.js: getCharacterById, getCharacters, getPlaceById, getPlaces
 *   - time.js: getCurrentYearSafe, calculateAge
 *   - family.js: getChildren, getSpouses, getParents, getConsanguinityDegree
 *   - formatting.js: escapeHtml
 * 
 * ICON POLICY: Minimal icons from icons.js only.
 * 
 * =============================================================================
 */

// =============================================================================
// 0. RECURSION GUARD
// =============================================================================

var _openingSelector = false;

// =============================================================================
// 1. DEPENDENCY WRAPPERS - ALIASES TO CANONICAL SOURCES
// =============================================================================

function _openModal(options) {
    if (typeof window.openModal === 'function') {
        return window.openModal(options);
    }
    return null;
}

function _closeTopModal() {
    if (typeof window.closeTopModal === 'function') {
        window.closeTopModal();
    }
}

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

function _getCharacterById(id) {
    if (typeof window.getCharacterById === 'function') {
        return window.getCharacterById(id);
    }
    return null;
}

function _getCharacters() {
    if (typeof window.getCharacters === 'function') {
        return window.getCharacters();
    }
    return window.masterData?.data?.characters || [];
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

function _getLocationTypeById(id) {
    if (typeof window.getLocationTypeById === 'function') {
        return window.getLocationTypeById(id);
    }
    return null;
}

function _calculateAge(birthYear, isDeceased, deathYear) {
    if (typeof window.calculateAge === 'function') {
        return window.calculateAge(birthYear, isDeceased, deathYear);
    }
    var currentYear = _getCurrentYear();
    if (!birthYear) return 0;
    if (isDeceased && deathYear) return Math.max(0, deathYear - birthYear);
    return Math.max(0, currentYear - birthYear);
}

function _getChildren(characterId) {
    if (typeof window.getChildren === 'function') {
        return window.getChildren(characterId);
    }
    return [];
}

function _getSpouses(characterId) {
    if (typeof window.getSpouses === 'function') {
        return window.getSpouses(characterId);
    }
    return [];
}

function _getParents(characterId) {
    if (typeof window.getParents === 'function') {
        return window.getParents(characterId);
    }
    return [];
}

function _getConsanguinityDegree(charId1, charId2) {
    if (typeof window.getConsanguinityDegree === 'function') {
        return window.getConsanguinityDegree(charId1, charId2);
    }
    return null;
}

function _debounce(fn, delay) {
    var timeoutId;
    return function() {
        var args = arguments;
        var context = this;
        clearTimeout(timeoutId);
        timeoutId = setTimeout(function() { fn.apply(context, args); }, delay);
    };
}

// =============================================================================
// 2. CONSTANTS - AGE GROUPS
// =============================================================================

function _getAgeGroups() {
    if (window.AGE_GROUPS && Array.isArray(window.AGE_GROUPS)) {
        return window.AGE_GROUPS;
    }
    return ['0-10', '11-20', '21-30', '31-40', '41-50', '51-60', '61-70', '71-80', '81-90', '91+'];
}

function _getAgeGroupLabel(group) {
    if (window.AGE_GROUPS_MAP && window.AGE_GROUPS_MAP[group]) {
        return window.AGE_GROUPS_MAP[group].label;
    }
    return group + ' years';
}

function _getAgeGroupForAge(age) {
    var groups = _getAgeGroups();
    for (var i = 0; i < groups.length; i++) {
        var parts = groups[i].split('-');
        var min = parseInt(parts[0]);
        var max = parts[1] === '+' ? Infinity : parseInt(parts[1]);
        if (age >= min && age <= max) {
            return groups[i];
        }
    }
    return groups[groups.length - 1];
}

// =============================================================================
// 3. ICON HELPERS
// =============================================================================

function _getIconSafe(name) {
    var icon = _getIcon(name);
    return icon || '';
}

// =============================================================================
// 4. RELATIONSHIP DETECTION
// =============================================================================

function _isRelativeOfTarget(charId, targetId) {
    if (!targetId || !charId) return false;
    if (charId === targetId) return false;

    if (typeof window.getConsanguinityDegree === 'function') {
        var degree = window.getConsanguinityDegree(charId, targetId);
        if (degree && typeof degree === 'string' && degree.length > 0) {
            return true;
        }
    }

    if (typeof window.getRelationshipBetween === 'function') {
        var rel = window.getRelationshipBetween(charId, targetId);
        if (rel && rel.type === 'family') return true;
    }

    var char = _getCharacterById(charId);
    var target = _getCharacterById(targetId);
    if (!char || !target) return false;

    if (char.motherId === targetId || char.fatherId === targetId) return true;
    if (target.motherId === charId || target.fatherId === charId) return true;
    if (char.motherId && target.motherId && char.motherId === target.motherId) return true;
    if (char.fatherId && target.fatherId && char.fatherId === target.fatherId) return true;

    return false;
}

// =============================================================================
// 5. CHARACTER STATUS DETECTION
// =============================================================================

function _getCharStatus(char) {
    if (!char) return 'single';

    if (char.isDeceased) return 'deceased';

    var spouses = _getSpouses(char.id);
    if (spouses && spouses.length > 0) {
        for (var i = 0; i < spouses.length; i++) {
            if (!spouses[i].isDeceased) {
                return 'partnered';
            }
        }
        return 'widowed';
    }

    return 'single';
}

function _getCharRoles(char) {
    if (!char || !char.professions) return [];
    var roles = [];
    for (var i = 0; i < char.professions.length; i++) {
        var prof = char.professions[i];
        if (typeof prof === 'string') {
            roles.push(prof);
        } else if (prof && typeof prof === 'object') {
            roles.push(prof.name || prof.id || '');
        }
    }
    return roles;
}

function _getCharLocationId(char) {
    if (!char) return null;
    if (char.currentLocationId) return char.currentLocationId;
    if (char.currentLocation) return char.currentLocation;
    return null;
}

function _getCharLocationName(char) {
    var locId = _getCharLocationId(char);
    if (!locId) return 'Unknown';
    var place = _getPlaceById(locId);
    return place ? place.displayName : 'Unknown';
}

// =============================================================================
// 6. LOCATION HELPERS
// =============================================================================

function _getAllLocations() {
    var places = _getPlaces();
    var result = [];
    var locationMap = {};

    for (var i = 0; i < places.length; i++) {
        var place = places[i];
        if (place.variableKey !== undefined && place.variableKey !== '') {
            locationMap[place.id] = {
                id: place.id,
                name: place.displayName || place.name || 'Unknown',
                parentId: place.parentId || null,
                children: [],
                typeId: place.typeId
            };
        }
    }

    var roots = [];
    for (var id in locationMap) {
        if (locationMap.hasOwnProperty(id)) {
            var node = locationMap[id];
            if (node.parentId && locationMap[node.parentId]) {
                locationMap[node.parentId].children.push(node);
            } else {
                roots.push(node);
            }
        }
    }

    function sortNodes(nodes) {
        nodes.sort(function(a, b) {
            var typeA = _getLocationTypeById(a.typeId);
            var typeB = _getLocationTypeById(b.typeId);
            var priA = typeA ? typeA.priority : 5;
            var priB = typeB ? typeB.priority : 5;
            if (priA !== priB) return priA - priB;
            return a.name.localeCompare(b.name);
        });
        for (var id in nodes) {
            if (nodes.hasOwnProperty(id) && nodes[id].children && nodes[id].children.length > 0) {
                sortNodes(nodes[id].children);
            }
        }
    }
    sortNodes(roots);

    function flattenNodes(nodes, depth) {
        depth = depth || 0;
        var flat = [];
        var indent = '';
        for (var j = 0; j < depth; j++) {
            indent += '  ';
        }
        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            var type = _getLocationTypeById(node.typeId);
            var icon = (type && type.icon) ? type.icon : '⌇';
            flat.push({
                id: node.id,
                name: node.name,
                displayName: indent + icon + ' ' + node.name,
                depth: depth,
                typeId: node.typeId
            });
            if (node.children && node.children.length > 0) {
                var childFlat = flattenNodes(node.children, depth + 1);
                flat = flat.concat(childFlat);
            }
        }
        return flat;
    }

    return flattenNodes(roots);
}

// =============================================================================
// 7. FILTER PRESETS
// =============================================================================

var FILTER_PRESETS = {
    'partner': {
        status: 'single',
        ageGroup: '21-30',
        peers: true,
        showDeceased: false
    },
    'father': {
        gender: 'male',
        ageGroup: '31-40',
        hasChildren: true,
        showDeceased: false
    },
    'mother': {
        gender: 'female',
        ageGroup: '31-40',
        hasChildren: true,
        showDeceased: false
    },
    'child': {
        ageGroup: '0-10',
        showDeceased: false
    },
    'master': {
        ageGroup: '31-40',
        showDeceased: false
    },
    'apprentice': {
        ageGroup: '11-20',
        showDeceased: false
    },
    'elder': {
        ageGroup: '61-70',
        showDeceased: false
    },
    'available': {
        status: 'single',
        ageGroup: '21-30',
        showDeceased: false
    },
    'all': {}
};

// =============================================================================
// 8. SELECTOR STATE
// =============================================================================

var selectorState = {
    isOpen: false,
    modalId: null,
    onSelect: null,
    onCancel: null,
    targetId: null,
    excludeIds: [],
    filters: {
        search: '',
        gender: 'all',
        status: 'all',
        ageGroup: 'all',
        location: 'all',
        role: 'all',
        showDeceased: false,
        peers: false,
        sameLocation: false,
        hasChildren: false,
        noChildren: false,
        isHead: false,
        isNotHead: false,
        hasParents: false,
        orphan: false,
        sortBy: 'age_desc'
    },
    availableChars: [],
    filteredChars: []
};

// =============================================================================
// 9. MAIN SELECTOR FUNCTION
// =============================================================================

function openCharacterSelector(options) {
    if (_openingSelector) {
        _showToast('Character selector is already open', 'warning');
        return null;
    }
    _openingSelector = true;

    try {
        options = options || {};

        var title = options.title || 'Select Character';
        var targetId = options.targetId || null;
        var onSelect = options.onSelect || function() {};
        var onCancel = options.onCancel || function() {};
        var preset = options.preset || null;
        var excludeIds = options.excludeIds || [];
        var filters = options.filters || {};

        selectorState.isOpen = true;
        selectorState.onSelect = onSelect;
        selectorState.onCancel = onCancel;
        selectorState.targetId = targetId;
        selectorState.excludeIds = excludeIds;

        if (preset && FILTER_PRESETS[preset]) {
            var presetFilters = FILTER_PRESETS[preset];
            for (var key in presetFilters) {
                if (presetFilters.hasOwnProperty(key) && filters[key] === undefined) {
                    filters[key] = presetFilters[key];
                }
            }
        }

        var defaultFilters = {
            search: '',
            gender: 'all',
            status: 'all',
            ageGroup: 'all',
            location: 'all',
            role: 'all',
            showDeceased: false,
            peers: false,
            sameLocation: false,
            hasChildren: false,
            noChildren: false,
            isHead: false,
            isNotHead: false,
            hasParents: false,
            orphan: false,
            sortBy: 'age_desc'
        };

        var mergedFilters = {};
        for (var key in defaultFilters) {
            if (defaultFilters.hasOwnProperty(key)) {
                mergedFilters[key] = filters[key] !== undefined ? filters[key] : defaultFilters[key];
            }
        }
        selectorState.filters = mergedFilters;

        var allChars = _getCharacters();
        var currentChar = targetId ? _getCharacterById(targetId) : null;
        var targetBirthYear = currentChar ? currentChar.birthYear : null;
        var targetLocationId = currentChar ? _getCharLocationId(currentChar) : null;

        var availableChars = [];
        var excludeSet = {};
        for (var i = 0; i < excludeIds.length; i++) {
            excludeSet[excludeIds[i]] = true;
        }
        if (targetId) {
            excludeSet[targetId] = true;
        }

        for (var i = 0; i < allChars.length; i++) {
            var c = allChars[i];
            if (!c || !c.id) continue;
            if (excludeSet[c.id]) continue;
            availableChars.push(c);
        }

        selectorState.availableChars = availableChars;

        var roleSet = {};
        for (var i = 0; i < allChars.length; i++) {
            var c = allChars[i];
            var roles = _getCharRoles(c);
            for (var r = 0; r < roles.length; r++) {
                if (roles[r]) roleSet[roles[r]] = true;
            }
        }

        var modal = _buildSelectorModal(title, availableChars, roleSet, targetBirthYear, targetLocationId);
        if (modal) {
            selectorState.modalId = modal.id || null;
        }

        return modal;

    } finally {
        _openingSelector = false;
    }
}

// =============================================================================
// 10. BUILD MODAL
// =============================================================================

function _buildSelectorModal(title, availableChars, roleSet, targetBirthYear, targetLocationId) {
    var filters = selectorState.filters;
    var targetId = selectorState.targetId;

    var filterHtml = _buildFilterHtml(roleSet, filters);

    var filteredChars = _applyFilters(availableChars, filters, targetBirthYear, targetLocationId);
    selectorState.filteredChars = filteredChars;

    var modalContent = 
        '<div style="margin-bottom: 12px;">' +
        filterHtml +
        '<div id="charSelectorList" style="' +
        'max-height: 350px; ' +
        'overflow-y: auto; ' +
        'border: 1px solid var(--border); ' +
        'border-radius: 6px; ' +
        'background: var(--bg2); ' +
        'min-height: 100px;' +
        '">' +
        _renderCharList(filteredChars, targetId) +
        '</div>' +
        '</div>';

    var modal = _openModal({
        title: title,
        content: modalContent,
        confirmText: 'Cancel',
        cancelText: '',
        showConfirm: true,
        onConfirm: function() {
            selectorState.isOpen = false;
            if (selectorState.onCancel) {
                selectorState.onCancel();
            }
        }
    });

    setTimeout(function() {
        _attachEventHandlers(modal, availableChars, roleSet, targetBirthYear, targetLocationId);
    }, 100);

    return modal;
}

// =============================================================================
// 11. BUILD FILTER HTML
// =============================================================================

function _buildFilterHtml(roleSet, filters) {
    var ageGroups = _getAgeGroups();

    var roleOptions = '<option value="all">All Roles</option>';
    var roleNames = Object.keys(roleSet).sort();
    for (var i = 0; i < roleNames.length; i++) {
        var selected = (filters.role === roleNames[i]) ? 'selected' : '';
        roleOptions += '<option value="' + _escapeHtml(roleNames[i]) + '" ' + selected + '>' + _escapeHtml(roleNames[i]) + '</option>';
    }

    var ageGroupOptions = '<option value="all">All Ages</option>';
    for (var i = 0; i < ageGroups.length; i++) {
        var group = ageGroups[i];
        var label = _getAgeGroupLabel(group);
        var selected = (filters.ageGroup === group) ? 'selected' : '';
        ageGroupOptions += '<option value="' + group + '" ' + selected + '>' + label + '</option>';
    }

    var allLocations = _getAllLocations();
    var locationOptions = '<option value="all">All Locations</option>';
    for (var i = 0; i < allLocations.length; i++) {
        var loc = allLocations[i];
        var selected = (filters.location === loc.id) ? 'selected' : '';
        locationOptions += '<option value="' + _escapeHtml(loc.id) + '" ' + selected + '>' + _escapeHtml(loc.displayName) + '</option>';
    }

    var searchIcon = _getIconSafe('SEARCH');

    var html = '';

    // Row 1: Search + Gender + Status
    html += '<div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 4px;">';
    html += '<div style="flex: 2; min-width: 120px;">' +
        '<input type="text" id="charSelectorSearch" value="' + _escapeHtml(filters.search) + '" placeholder="search by name..." style="' +
        'width: 100%;' +
        'padding: 4px 8px;' +
        'background: var(--bg3);' +
        'border: 1px solid var(--border);' +
        'border-radius: 4px;' +
        'font-size: 0.7rem;' +
        'color: var(--text);' +
        '">' +
        '</div>';
    html += '<div style="flex: 1; min-width: 80px;">' +
        '<select id="charGenderFilter" style="' +
        'width: 100%;' +
        'padding: 4px 8px;' +
        'background: var(--bg3);' +
        'border: 1px solid var(--border);' +
        'border-radius: 4px;' +
        'font-size: 0.7rem;' +
        'color: var(--text);' +
        '">' +
        '<option value="all" ' + (filters.gender === 'all' ? 'selected' : '') + '>All Genders</option>' +
        '<option value="male" ' + (filters.gender === 'male' ? 'selected' : '') + '>Male</option>' +
        '<option value="female" ' + (filters.gender === 'female' ? 'selected' : '') + '>Female</option>' +
        '</select>' +
        '</div>';
    html += '<div style="flex: 1; min-width: 80px;">' +
        '<select id="charStatusFilter" style="' +
        'width: 100%;' +
        'padding: 4px 8px;' +
        'background: var(--bg3);' +
        'border: 1px solid var(--border);' +
        'border-radius: 4px;' +
        'font-size: 0.7rem;' +
        'color: var(--text);' +
        '">' +
        '<option value="all" ' + (filters.status === 'all' ? 'selected' : '') + '>All Statuses</option>' +
        '<option value="single" ' + (filters.status === 'single' ? 'selected' : '') + '>Single</option>' +
        '<option value="partnered" ' + (filters.status === 'partnered' ? 'selected' : '') + '>Partnered</option>' +
        '<option value="widowed" ' + (filters.status === 'widowed' ? 'selected' : '') + '>Widowed</option>' +
        '</select>' +
        '</div>';
    html += '</div>';

    // Row 2: Location + Role + Age Group
    html += '<div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 4px;">';
    html += '<div style="flex: 2; min-width: 140px;">' +
        '<select id="charLocationFilter" style="' +
        'width: 100%;' +
        'padding: 4px 8px;' +
        'background: var(--bg3);' +
        'border: 1px solid var(--border);' +
        'border-radius: 4px;' +
        'font-size: 0.65rem;' +
        'color: var(--text);' +
        '">' +
        locationOptions +
        '</select>' +
        '</div>';
    html += '<div style="flex: 1; min-width: 80px;">' +
        '<select id="charRoleFilter" style="' +
        'width: 100%;' +
        'padding: 4px 8px;' +
        'background: var(--bg3);' +
        'border: 1px solid var(--border);' +
        'border-radius: 4px;' +
        'font-size: 0.65rem;' +
        'color: var(--text);' +
        '">' +
        roleOptions +
        '</select>' +
        '</div>';
    html += '<div style="flex: 1; min-width: 80px;">' +
        '<select id="charAgeGroupFilter" style="' +
        'width: 100%;' +
        'padding: 4px 8px;' +
        'background: var(--bg3);' +
        'border: 1px solid var(--border);' +
        'border-radius: 4px;' +
        'font-size: 0.65rem;' +
        'color: var(--text);' +
        '">' +
        ageGroupOptions +
        '</select>' +
        '</div>';
    html += '</div>';

    // Row 3: Checkboxes
    html += '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2px 8px; margin-bottom: 4px; font-size: 0.6rem;">';
    html += '<div style="display: flex; flex-wrap: wrap; gap: 4px 8px;">';
    html += '<label style="display: flex; align-items: center; gap: 3px; cursor: pointer;"><input type="checkbox" id="charDeceasedFilter" ' + (filters.showDeceased ? 'checked' : '') + '> Show Deceased</label>';
    html += '<label style="display: flex; align-items: center; gap: 3px; cursor: pointer;"><input type="checkbox" id="charPeerFilter" ' + (filters.peers ? 'checked' : '') + '> Peers (±10y)</label>';
    html += '<label style="display: flex; align-items: center; gap: 3px; cursor: pointer;"><input type="checkbox" id="charSameLocationFilter" ' + (filters.sameLocation ? 'checked' : '') + '> Same Location</label>';
    html += '</div>';
    html += '<div style="display: flex; flex-wrap: wrap; gap: 4px 8px;">';
    html += '<label style="display: flex; align-items: center; gap: 3px; cursor: pointer;"><input type="checkbox" id="charHasChildrenFilter" ' + (filters.hasChildren ? 'checked' : '') + '> Has Children</label>';
    html += '<label style="display: flex; align-items: center; gap: 3px; cursor: pointer;"><input type="checkbox" id="charNoChildrenFilter" ' + (filters.noChildren ? 'checked' : '') + '> No Children</label>';
    html += '<label style="display: flex; align-items: center; gap: 3px; cursor: pointer;"><input type="checkbox" id="charIsHeadFilter" ' + (filters.isHead ? 'checked' : '') + '> Is Head</label>';
    html += '<label style="display: flex; align-items: center; gap: 3px; cursor: pointer;"><input type="checkbox" id="charIsNotHeadFilter" ' + (filters.isNotHead ? 'checked' : '') + '> Not Head</label>';
    html += '</div>';
    html += '<div style="display: flex; flex-wrap: wrap; gap: 4px 8px; grid-column: span 2;">';
    html += '<label style="display: flex; align-items: center; gap: 3px; cursor: pointer;"><input type="checkbox" id="charHasParentsFilter" ' + (filters.hasParents ? 'checked' : '') + '> Has Parents</label>';
    html += '<label style="display: flex; align-items: center; gap: 3px; cursor: pointer;"><input type="checkbox" id="charOrphanFilter" ' + (filters.orphan ? 'checked' : '') + '> Orphan</label>';
    html += '</div>';
    html += '</div>';

    // Row 4: Sort + Clear
    html += '<div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 4px; align-items: center;">';
    html += '<select id="charSortFilter" style="' +
        'padding: 3px 6px;' +
        'background: var(--bg3);' +
        'border: 1px solid var(--border);' +
        'border-radius: 4px;' +
        'font-size: 0.55rem;' +
        'color: var(--text);' +
        '">' +
        '<option value="age_desc" ' + (filters.sortBy === 'age_desc' ? 'selected' : '') + '>Sort: Age ↓</option>' +
        '<option value="age_asc" ' + (filters.sortBy === 'age_asc' ? 'selected' : '') + '>Sort: Age ↑</option>' +
        '<option value="name" ' + (filters.sortBy === 'name' ? 'selected' : '') + '>Sort: Name</option>' +
        '<option value="birth_year" ' + (filters.sortBy === 'birth_year' ? 'selected' : '') + '>Sort: Birth Year</option>' +
        '</select>';
    html += '<button id="clearCharFiltersBtn" class="btn small" style="padding: 2px 8px; font-size: 0.5rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 3px; cursor: pointer;">Clear</button>';
    html += '<span style="font-size: 0.5rem; color: var(--dim); margin-left: auto;"><span id="charCountDisplay">0</span> characters</span>';
    html += '</div>';

    return html;
}

// =============================================================================
// 12. RENDER CHARACTER LIST
// =============================================================================

function _renderCharList(characters, targetId) {
    if (!characters || characters.length === 0) {
        return '<div style="text-align: center; padding: 40px; color: var(--dim);">No characters match the filters</div>';
    }

    var html = '';
    for (var i = 0; i < characters.length; i++) {
        var char = characters[i];
        var age = _calculateAge(char.birthYear, char.isDeceased, char.deathYear);
        var genderSymbol = char.gender === 'male' ? '♂' : (char.gender === 'female' ? '♀' : '?');
        var location = _getCharLocationName(char);
        var isDeceased = char.isDeceased === true;
        var status = _getCharStatus(char);
        var roles = _getCharRoles(char);
        var ageGroup = _getAgeGroupForAge(age);

        var isRelative = targetId ? _isRelativeOfTarget(char.id, targetId) : false;
        var relativeBadge = isRelative ? ' <span style="font-size: 0.5rem; background: rgba(200, 112, 64, 0.15); color: var(--warn); padding: 1px 6px; border-radius: 10px; border: 1px solid var(--warn);">Relative</span>' : '';

        var statusText = '';
        if (status === 'partnered') {
            statusText = 'Partnered';
        } else if (status === 'widowed') {
            statusText = 'Widowed';
        }

        var roleBadges = '';
        for (var r = 0; r < Math.min(roles.length, 2); r++) {
            roleBadges += '<span style="font-size: 0.5rem; background: var(--bg3); padding: 1px 6px; border-radius: 10px; margin-right: 2px;">' + _escapeHtml(roles[r]) + '</span>';
        }
        if (roles.length > 2) {
            roleBadges += '<span style="font-size: 0.5rem; color: var(--dim);">+' + (roles.length - 2) + '</span>';
        }

        var rightParts = [];
        rightParts.push(age + 'y');
        if (statusText) rightParts.push(statusText);
        if (isDeceased) rightParts.push('†');
        rightParts.push(location);
        var rightText = rightParts.join(' · ');

        var nameStyle = isDeceased ? 'text-decoration: line-through; opacity: 0.6;' : '';
        var relativeStyle = isRelative ? 'border-left: 3px solid var(--warn); padding-left: 8px;' : '';

        html += '<div class="char-option" data-id="' + char.id + '" style="' +
            'display: flex;' +
            'justify-content: space-between;' +
            'align-items: center;' +
            'padding: 6px 10px;' +
            'margin: 2px 0;' +
            'border-bottom: 1px solid var(--border2);' +
            'cursor: pointer;' +
            'border-radius: 4px;' +
            'transition: background 0.1s;' +
            (isDeceased ? 'opacity: 0.7;' : '') +
            relativeStyle +
            '">' +
            '<div style="font-size: 0.8rem; ' + nameStyle + '">' +
            genderSymbol + ' ' +
            _escapeHtml(char.name) + ' ' + _escapeHtml(char.surname || '') +
            (isDeceased ? ' <span style="font-size: 0.55rem; color: var(--dim);">(deceased)</span>' : '') +
            relativeBadge +
            (roleBadges ? ' <span style="font-size: 0.55rem;">' + roleBadges + '</span>' : '') +
            '</div>' +
            '<div style="font-size: 0.6rem; color: var(--dim); text-align: right;">' + rightText + '</div>' +
            '</div>';
    }

    return html;
}

// =============================================================================
// 13. APPLY FILTERS
// =============================================================================

function _applyFilters(characters, filters, targetBirthYear, targetLocationId) {
    var result = [];
    var searchLower = filters.search ? filters.search.toLowerCase() : '';
    var targetId = selectorState.targetId;

    for (var i = 0; i < characters.length; i++) {
        var char = characters[i];
        var isDeceased = char.isDeceased === true;
        var charBirthYear = char.birthYear;
        var age = _calculateAge(charBirthYear, isDeceased, char.deathYear);
        var charLocationId = _getCharLocationId(char);
        var status = _getCharStatus(char);
        var hasChildren = _getChildren(char.id).length > 0;
        var hasParents = _getParents(char.id).length > 0;
        var roles = _getCharRoles(char);

        if (!filters.showDeceased && isDeceased) continue;

        if (filters.peers && targetBirthYear && charBirthYear) {
            var ageDiff = Math.abs(targetBirthYear - charBirthYear);
            if (ageDiff > 10) continue;
        }

        if (filters.gender !== 'all') {
            if (char.gender !== filters.gender) continue;
        }

        if (filters.status !== 'all') {
            if (status !== filters.status) continue;
        }

        if (filters.ageGroup !== 'all') {
            var parts = filters.ageGroup.split('-');
            var minAge = parseInt(parts[0]);
            var maxAge = parts[1] === '+' ? Infinity : parseInt(parts[1]);
            if (age < minAge || age > maxAge) continue;
        }

        if (filters.location !== 'all') {
            if (charLocationId !== filters.location) continue;
        }

        if (filters.sameLocation && targetLocationId) {
            if (charLocationId !== targetLocationId) continue;
        }

        if (filters.hasChildren && !hasChildren) continue;
        if (filters.noChildren && hasChildren) continue;

        if (filters.hasParents && !hasParents) continue;
        if (filters.orphan && hasParents) continue;

        if (filters.role !== 'all') {
            var hasRole = false;
            for (var r = 0; r < roles.length; r++) {
                if (roles[r] === filters.role) {
                    hasRole = true;
                    break;
                }
            }
            if (!hasRole) continue;
        }

        if (searchLower) {
            var fullName = (char.name + ' ' + (char.surname || '')).toLowerCase();
            if (fullName.indexOf(searchLower) === -1) continue;
        }

        result.push(char);
    }

    if (filters.sortBy === 'age_desc') {
        result.sort(function(a, b) {
            var aAge = a.birthYear ? _getCurrentYear() - a.birthYear : 0;
            var bAge = b.birthYear ? _getCurrentYear() - b.birthYear : 0;
            return bAge - aAge;
        });
    } else if (filters.sortBy === 'age_asc') {
        result.sort(function(a, b) {
            var aAge = a.birthYear ? _getCurrentYear() - a.birthYear : 0;
            var bAge = b.birthYear ? _getCurrentYear() - b.birthYear : 0;
            return aAge - bAge;
        });
    } else if (filters.sortBy === 'birth_year') {
        result.sort(function(a, b) {
            return (a.birthYear || 0) - (b.birthYear || 0);
        });
    } else {
        result.sort(function(a, b) {
            return (a.name || '').localeCompare(b.name || '');
        });
    }

    return result;
}

// =============================================================================
// 14. REFRESH LIST
// =============================================================================

function _refreshList(availableChars, roleSet, targetBirthYear, targetLocationId) {
    var listContainer = document.getElementById('charSelectorList');
    if (!listContainer) return;

    var filters = selectorState.filters;
    var targetId = selectorState.targetId;

    var filtered = _applyFilters(availableChars, filters, targetBirthYear, targetLocationId);
    selectorState.filteredChars = filtered;

    listContainer.innerHTML = _renderCharList(filtered, targetId);

    var countEl = document.getElementById('charCountDisplay');
    if (countEl) {
        countEl.textContent = filtered.length;
    }

    _attachCharClickHandlers();
}

// =============================================================================
// 15. ATTACH EVENT HANDLERS
// =============================================================================

function _attachEventHandlers(modal, availableChars, roleSet, targetBirthYear, targetLocationId) {
    _attachCharClickHandlers();

    var searchInput = document.getElementById('charSelectorSearch');
    var genderFilter = document.getElementById('charGenderFilter');
    var statusFilter = document.getElementById('charStatusFilter');
    var locationFilter = document.getElementById('charLocationFilter');
    var roleFilter = document.getElementById('charRoleFilter');
    var ageGroupFilter = document.getElementById('charAgeGroupFilter');
    var sortFilter = document.getElementById('charSortFilter');
    var clearBtn = document.getElementById('clearCharFiltersBtn');

    var deceasedCheckbox = document.getElementById('charDeceasedFilter');
    var peerCheckbox = document.getElementById('charPeerFilter');
    var sameLocationCheckbox = document.getElementById('charSameLocationFilter');
    var hasChildrenCheckbox = document.getElementById('charHasChildrenFilter');
    var noChildrenCheckbox = document.getElementById('charNoChildrenFilter');
    var isHeadCheckbox = document.getElementById('charIsHeadFilter');
    var isNotHeadCheckbox = document.getElementById('charIsNotHeadFilter');
    var hasParentsCheckbox = document.getElementById('charHasParentsFilter');
    var orphanCheckbox = document.getElementById('charOrphanFilter');

    function applyFilters() {
        var filters = selectorState.filters;
        filters.search = searchInput ? searchInput.value : '';
        filters.gender = genderFilter ? genderFilter.value : 'all';
        filters.status = statusFilter ? statusFilter.value : 'all';
        filters.location = locationFilter ? locationFilter.value : 'all';
        filters.role = roleFilter ? roleFilter.value : 'all';
        filters.ageGroup = ageGroupFilter ? ageGroupFilter.value : 'all';
        filters.sortBy = sortFilter ? sortFilter.value : 'age_desc';
        filters.showDeceased = deceasedCheckbox ? deceasedCheckbox.checked : false;
        filters.peers = peerCheckbox ? peerCheckbox.checked : false;
        filters.sameLocation = sameLocationCheckbox ? sameLocationCheckbox.checked : false;
        filters.hasChildren = hasChildrenCheckbox ? hasChildrenCheckbox.checked : false;
        filters.noChildren = noChildrenCheckbox ? noChildrenCheckbox.checked : false;
        filters.isHead = isHeadCheckbox ? isHeadCheckbox.checked : false;
        filters.isNotHead = isNotHeadCheckbox ? isNotHeadCheckbox.checked : false;
        filters.hasParents = hasParentsCheckbox ? hasParentsCheckbox.checked : false;
        filters.orphan = orphanCheckbox ? orphanCheckbox.checked : false;

        _refreshList(availableChars, roleSet, targetBirthYear, targetLocationId);
    }

    var debouncedApply = _debounce(applyFilters, 300);

    if (searchInput) {
        searchInput.addEventListener('input', debouncedApply);
    }

    if (genderFilter) genderFilter.onchange = applyFilters;
    if (statusFilter) statusFilter.onchange = applyFilters;
    if (locationFilter) locationFilter.onchange = applyFilters;
    if (roleFilter) roleFilter.onchange = applyFilters;
    if (ageGroupFilter) ageGroupFilter.onchange = applyFilters;
    if (sortFilter) sortFilter.onchange = applyFilters;

    var checkboxIds = [
        'charDeceasedFilter', 'charPeerFilter', 'charSameLocationFilter',
        'charHasChildrenFilter', 'charNoChildrenFilter', 'charIsHeadFilter',
        'charIsNotHeadFilter', 'charHasParentsFilter', 'charOrphanFilter'
    ];

    for (var i = 0; i < checkboxIds.length; i++) {
        var el = document.getElementById(checkboxIds[i]);
        if (el) {
            el.onchange = applyFilters;
        }
    }

    if (clearBtn) {
        clearBtn.onclick = function() {
            if (searchInput) searchInput.value = '';
            if (genderFilter) genderFilter.value = 'all';
            if (statusFilter) statusFilter.value = 'all';
            if (locationFilter) locationFilter.value = 'all';
            if (roleFilter) roleFilter.value = 'all';
            if (ageGroupFilter) ageGroupFilter.value = 'all';
            if (sortFilter) sortFilter.value = 'age_desc';

            var checkboxIds = [
                'charDeceasedFilter', 'charPeerFilter', 'charSameLocationFilter',
                'charHasChildrenFilter', 'charNoChildrenFilter', 'charIsHeadFilter',
                'charIsNotHeadFilter', 'charHasParentsFilter', 'charOrphanFilter'
            ];

            for (var i = 0; i < checkboxIds.length; i++) {
                var el = document.getElementById(checkboxIds[i]);
                if (el) el.checked = false;
            }

            var filters = selectorState.filters;
            filters.search = '';
            filters.gender = 'all';
            filters.status = 'all';
            filters.location = 'all';
            filters.role = 'all';
            filters.ageGroup = 'all';
            filters.sortBy = 'age_desc';
            filters.showDeceased = false;
            filters.peers = false;
            filters.sameLocation = false;
            filters.hasChildren = false;
            filters.noChildren = false;
            filters.isHead = false;
            filters.isNotHead = false;
            filters.hasParents = false;
            filters.orphan = false;

            _refreshList(availableChars, roleSet, targetBirthYear, targetLocationId);
            _showToast('Filters cleared', 'info');
        };
    }
}

// =============================================================================
// 16. ATTACH CHARACTER CLICK HANDLERS
// =============================================================================

function _attachCharClickHandlers() {
    var items = document.querySelectorAll('.char-option');

    items.forEach(function(item) {
        var newItem = item.cloneNode(true);
        if (item.parentNode) {
            item.parentNode.replaceChild(newItem, item);
        }

        newItem.addEventListener('click', function() {
            var charId = this.dataset.id;
            var char = _getCharacterById(charId);
            if (char && selectorState.onSelect) {
                _closeTopModal();
                selectorState.isOpen = false;
                selectorState.onSelect(char);
            }
        });

        newItem.addEventListener('mouseenter', function() {
            this.style.background = 'var(--accent-dim)';
        });
        newItem.addEventListener('mouseleave', function() {
            this.style.background = '';
        });
    });
}

// =============================================================================
// 17. CLOSE SELECTOR
// =============================================================================

function closeCharacterSelector() {
    selectorState.isOpen = false;
    _closeTopModal();
}

// =============================================================================
// 18. EXPORTS - SINGLE SOURCE OF TRUTH
// =============================================================================

window.openCharacterSelector = openCharacterSelector;
window.closeCharacterSelector = closeCharacterSelector;
window.FILTER_PRESETS = FILTER_PRESETS;
window.CharacterSelectorState = selectorState;

// Legacy aliases for backward compatibility
window._openCharacterSelector = openCharacterSelector;
window.openUnifiedCharacterSelector = openCharacterSelector;