/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD SELECTOR MODAL (js/selectors/modals-household-selector.js)
 * =============================================================================
 * 
 * SINGLE SOURCE OF TRUTH for household selection modals.
 * 
 * UPDATED:
 *   - Uses FamilyAccessors for household member relationships
 *   - Uses icons.js for SVG icons (no emojis)
 *   - Uses unified character selector from modals-core.js
 *   - Improved household member display with family relationship info
 *   - Shows household head and member count with family relationships
 * 
 * DEPENDENCIES:
 *   - modals-core.js (openModal, closeTopModal, _escapeHtml, _showToast, _getIcon)
 *   - accessors.js (getCharacterById, getCharacters, getPlaceById, getPlaces)
 *   - family-accessors.js (FamilyAccessors) - NEW
 * 
 * ICON POLICY: Uses icons.js for icons - NO EMOJIS
 * 
 * =============================================================================
 */

// =============================================================================
// 1. DEPENDENCY WRAPPERS
// =============================================================================

function _getCharacterById(id) {
    return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
}

function _getCharacters() {
    return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
}

function _getPlaceById(id) {
    return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
}

function _getPlaces() {
    return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
}

function _getAllHouseholds() {
    if (typeof window.getAllHouseholds === 'function') {
        return window.getAllHouseholds();
    }
    return [];
}

function _getHousehold(id) {
    if (typeof window.getHousehold === 'function') {
        return window.getHousehold(id);
    }
    var households = _getAllHouseholds();
    for (var i = 0; i < households.length; i++) {
        if (households[i].id === id) return households[i];
    }
    return null;
}

function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

function _calculateAge(birthYear, isDeceased, deathYear) {
    // Delegates to time.js — do not reimplement age logic here.
    if (typeof window.calculateAge === 'function') {
        return window.calculateAge(birthYear, isDeceased, deathYear);
    }
    return null;
}

function _escapeHtml(str) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
    if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _showToast(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type);
    else if (typeof window.showToastMessage === 'function') window.showToastMessage(msg, type);
}

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

function _getIcon(name) {
    if (window.Icons && window.Icons[name]) {
        return window.Icons[name];
    }
    if (window.Icons && window.Icons.CIRCLE) {
        return window.Icons.CIRCLE;
    }
    return '<svg viewBox="0 0 20 20" width="1em" height="1em" style="display:inline-block;fill:currentColor;stroke:currentColor;vertical-align:middle;"><circle cx="10" cy="10" r="5.71" fill="currentColor"/></svg>';
}

// =============================================================================
// 2. FAMILY ACCESSORS WRAPPER (NEW)
// =============================================================================

function _getFamilyAccessors() {
    return typeof window.FamilyAccessors !== 'undefined' ? window.FamilyAccessors : null;
}

function _getCharacterHouseholdViaFamilyAccessors(characterId) {
    var fa = _getFamilyAccessors();
    if (fa && typeof fa.getCharacterHousehold === 'function') {
        return fa.getCharacterHousehold(characterId);
    }
    return null;
}

function _getHouseholdFamilyMembersViaFamilyAccessors(householdId) {
    var fa = _getFamilyAccessors();
    if (fa && typeof fa.getHouseholdFamilyMembers === 'function') {
        return fa.getHouseholdFamilyMembers(householdId);
    }
    return null;
}

function _getHouseholdHeadViaFamilyAccessors(householdId) {
    var fa = _getFamilyAccessors();
    if (fa && typeof fa.getHouseholdHead === 'function') {
        return fa.getHouseholdHead(householdId);
    }
    return null;
}

function _getSpousesViaFamilyAccessors(characterId, activeOnly) {
    var fa = _getFamilyAccessors();
    if (fa && typeof fa.getSpouses === 'function') {
        var result = fa.getSpouses(characterId, activeOnly !== false);
        if (result) {
            return result.map(function(item) { return item.character; });
        }
    }
    return null;
}

function _getChildrenViaFamilyAccessors(characterId, includeDeceased) {
    var fa = _getFamilyAccessors();
    if (fa && typeof fa.getAllChildren === 'function') {
        var result = fa.getAllChildren(characterId, includeDeceased || false);
        if (result) {
            return result.map(function(item) { return item.character; });
        }
    }
    return null;
}

// =============================================================================
// 3. HOUSEHOLD MEMBER RENDERER (UPDATED with FamilyAccessors)
// =============================================================================

function _renderHouseholdMembers(household, options) {
    options = options || {};
    
    var personIcon = _getIcon('PERSON');
    var infoIcon = _getIcon('CIRCLE_DOT');
    var locationIcon = _getIcon('LOCATION');
    var householdIcon = _getIcon('HOUSEHOLD');
    var crownIcon = _getIcon('CROWN');
    var warningIcon = _getIcon('WARNING');
    var checkIcon = _getIcon('CHECK_SIMPLE');
    var heartIcon = _getIcon('HEART');

    if (!household || !household.members || household.members.length === 0) {
        return '<div style="text-align:center;padding:20px;color:var(--dim);font-size:0.65rem;">' + 
            infoIcon + ' No members in this household</div>';
    }

    // Get household head
    var headId = null;
    for (var i = 0; i < household.members.length; i++) {
        if (household.members[i].isHead) {
            headId = household.members[i].characterId;
            break;
        }
    }

    var html = '<div style="display:flex;flex-direction:column;gap:4px;">';

    for (var i = 0; i < household.members.length; i++) {
        var member = household.members[i];
        var character = _getCharacterById(member.characterId);
        if (!character) continue;

        var isHead = member.isHead === true;
        var age = _calculateAge(character.birthYear, character.isDeceased, character.deathYear);
        var genderIcon = character.gender === 'male' ? '♂' : (character.gender === 'female' ? '♀' : '⚥');
        var statusText = character.isDeceased ? ' (Deceased)' : '';
        var statusColor = character.isDeceased ? 'var(--dim)' : 'var(--success)';

        // ================================================================
        // NEW: Get family relationships using FamilyAccessors
        // ================================================================
        var relationshipLabels = [];
        var fa = _getFamilyAccessors();

        if (fa) {
            // Check spouse relationship
            var spouses = _getSpousesViaFamilyAccessors(character.id, true);
            if (spouses) {
                for (var s = 0; s < spouses.length; s++) {
                    var spouseInHousehold = false;
                    for (var j = 0; j < household.members.length; j++) {
                        if (household.members[j].characterId === spouses[s].id) {
                            spouseInHousehold = true;
                            break;
                        }
                    }
                    if (spouseInHousehold) {
                        var spouseGender = spouses[s].gender === 'male' ? 'Husband' : 'Wife';
                        relationshipLabels.push(spouseGender);
                    }
                }
            }

            // Check children relationship
            var children = _getChildrenViaFamilyAccessors(character.id, false);
            if (children) {
                var childCount = 0;
                for (var c = 0; c < children.length; c++) {
                    for (var j = 0; j < household.members.length; j++) {
                        if (household.members[j].characterId === children[c].id) {
                            childCount++;
                            break;
                        }
                    }
                }
                if (childCount > 0) {
                    relationshipLabels.push(childCount + ' child' + (childCount > 1 ? 'ren' : ''));
                }
            }

            // Check parent relationship
            var parents = fa.getParents(character.id);
            if (parents) {
                var parentCount = 0;
                if (parents.father) {
                    for (var j = 0; j < household.members.length; j++) {
                        if (household.members[j].characterId === parents.father.id) {
                            parentCount++;
                            break;
                        }
                    }
                }
                if (parents.mother) {
                    for (var j = 0; j < household.members.length; j++) {
                        if (household.members[j].characterId === parents.mother.id) {
                            parentCount++;
                            break;
                        }
                    }
                }
                if (parentCount > 0) {
                    relationshipLabels.push(parentCount + ' parent' + (parentCount > 1 ? 's' : ''));
                }
            }
        }

        // Fallback: check direct relationships if FamilyAccessors not available
        if (relationshipLabels.length === 0) {
            // Check spouse via relationships array
            if (character.relationships) {
                for (var j = 0; j < character.relationships.length; j++) {
                    var rel = character.relationships[j];
                    if (rel.status === 'ongoing' || rel.status === 'active') {
                        var spouseId = rel.participantB || rel.partnerId;
                        if (spouseId === character.id) spouseId = rel.participantA;
                        for (var k = 0; k < household.members.length; k++) {
                            if (household.members[k].characterId === spouseId) {
                                var spouse = _getCharacterById(spouseId);
                                if (spouse) {
                                    relationshipLabels.push(spouse.gender === 'male' ? 'Husband' : 'Wife');
                                }
                                break;
                            }
                        }
                    }
                }
            }

            // Check children via children array
            if (character.children) {
                var childCount = 0;
                for (var c = 0; c < character.children.length; c++) {
                    for (var j = 0; j < household.members.length; j++) {
                        if (household.members[j].characterId === character.children[c]) {
                            childCount++;
                            break;
                        }
                    }
                }
                if (childCount > 0) {
                    relationshipLabels.push(childCount + ' child' + (childCount > 1 ? 'ren' : ''));
                }
            }

            // Check parents
            if (character.fatherId) {
                for (var j = 0; j < household.members.length; j++) {
                    if (household.members[j].characterId === character.fatherId) {
                        relationshipLabels.push('Parent');
                        break;
                    }
                }
            }
            if (character.motherId) {
                for (var j = 0; j < household.members.length; j++) {
                    if (household.members[j].characterId === character.motherId) {
                        if (relationshipLabels.indexOf('Parent') === -1) {
                            relationshipLabels.push('Parent');
                        }
                        break;
                    }
                }
            }
        }

        var roleDisplay = member.role ? ' (' + _escapeHtml(member.role) + ')' : '';
        var headBadge = isHead ? ' <span style="background:var(--accent-dim);padding:1px 6px;border-radius:10px;font-size:0.45rem;color:var(--accent);">' + crownIcon + ' Head</span>' : '';
        var relationshipBadge = relationshipLabels.length > 0 ? 
            ' <span style="background:var(--bg2);padding:1px 6px;border-radius:10px;font-size:0.45rem;color:var(--dim);">' + 
            relationshipLabels.join(', ') + 
            '</span>' : '';

        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;background:var(--bg3);border-radius:4px;' + 
            (character.isDeceased ? 'opacity:0.6;' : '') + 
            '">' +
            '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">' +
            genderIcon +
            '<span style="font-size:0.7rem;">' + _escapeHtml(character.name) + ' ' + _escapeHtml(character.surname || '') + '</span>' +
            '<span style="font-size:0.55rem;color:var(--dim);">(' + age + 'y' + statusText + ')</span>' +
            roleDisplay +
            headBadge +
            relationshipBadge +
            '</div>' +
            '</div>';
    }

    html += '</div>';
    return html;
}

// =============================================================================
// 4. HOUSEHOLD SELECTOR MODAL (UPDATED)
// =============================================================================

function openHouseholdSelector(options) {
    options = options || {};

    var title = options.title || 'Select Household';
    var targetCharacterId = options.targetCharacterId || null;
    var onSelect = options.onSelect || function() {};
    var onCancel = options.onCancel || function() {};
    var preselectedId = options.preselectedId || null;
    var filterConfig = options.filterConfig || {};

    var personIcon = _getIcon('PERSON');
    var infoIcon = _getIcon('CIRCLE_DOT');
    var locationIcon = _getIcon('LOCATION');
    var householdIcon = _getIcon('HOUSEHOLD');
    var checkIcon = _getIcon('CHECK_SIMPLE');
    var searchIcon = _getIcon('SEARCH');
    var crossIcon = _getIcon('X_HEAVY');

    var households = _getAllHouseholds();
    var selectedHouseholdId = preselectedId || null;

    // ================================================================
    // NEW: Get target character info using FamilyAccessors
    // ================================================================
    var targetCharacter = targetCharacterId ? _getCharacterById(targetCharacterId) : null;
    var targetHousehold = targetCharacter ? _getCharacterHouseholdViaFamilyAccessors(targetCharacter.id) : null;
    var targetHouseholdId = targetHousehold ? targetHousehold.id : null;

    // Build location filter options
    var allLocations = new Set();
    for (var i = 0; i < households.length; i++) {
        if (households[i].location) {
            allLocations.add(households[i].location);
        }
    }
    var locationOptions = Array.from(allLocations).sort();

    // Default filter state
    var filters = {
        search: '',
        location: filterConfig.locationFilter || 'all',
        showActive: filterConfig.showActive !== false,
        showVacant: filterConfig.showVacant || false,
        showEmpty: filterConfig.showEmpty || false,
        showOnlyCompatible: filterConfig.showOnlyCompatible || false
    };

    function isHouseholdCompatible(household) {
        if (!targetCharacter) return true;

        // Check if target character is already in this household
        if (household.members) {
            for (var i = 0; i < household.members.length; i++) {
                if (household.members[i].characterId === targetCharacter.id) {
                    return false; // Already in this household
                }
            }
        }

        // Check if household is full (if max capacity is set)
        if (household.maxCapacity && household.members && household.members.length >= household.maxCapacity) {
            return false;
        }

        return true;
    }

    function filterHouseholds() {
        var filtered = [];

        for (var i = 0; i < households.length; i++) {
            var h = households[i];
            var match = true;

            // Search filter
            if (filters.search) {
                var searchLower = filters.search.toLowerCase();
                var nameMatch = h.name && h.name.toLowerCase().indexOf(searchLower) !== -1;
                var locationMatch = h.location && h.location.toLowerCase().indexOf(searchLower) !== -1;
                if (!nameMatch && !locationMatch) match = false;
            }

            // Location filter
            if (filters.location !== 'all' && h.location !== filters.location) {
                match = false;
            }

            // Status filters
            if (match && filters.showActive !== undefined) {
                var hasLivingMembers = false;
                var hasDeceasedMembers = false;
                var hasMembers = h.members && h.members.length > 0;

                if (hasMembers) {
                    for (var j = 0; j < h.members.length; j++) {
                        var char = _getCharacterById(h.members[j].characterId);
                        if (char) {
                            if (char.isDeceased) hasDeceasedMembers = true;
                            else hasLivingMembers = true;
                        }
                    }
                }

                var isActive = hasLivingMembers;
                var isVacant = hasDeceasedMembers && !hasLivingMembers;
                var isEmpty = !hasMembers;

                if (filters.showActive && !isActive && !filters.showVacant && !filters.showEmpty) {
                    match = false;
                }
                if (filters.showVacant && !isVacant && !filters.showActive && !filters.showEmpty) {
                    match = false;
                }
                if (filters.showEmpty && !isEmpty && !filters.showActive && !filters.showVacant) {
                    match = false;
                }
                if (!filters.showActive && !filters.showVacant && !filters.showEmpty) {
                    // Show all
                } else if (!filters.showActive && isActive && !filters.showVacant && !filters.showEmpty) {
                    match = false;
                }
            }

            // Compatibility filter
            if (match && filters.showOnlyCompatible) {
                if (!isHouseholdCompatible(h)) {
                    match = false;
                }
            }

            if (match) {
                filtered.push(h);
            }
        }

        // Sort households by name
        filtered.sort(function(a, b) {
            return (a.name || '').localeCompare(b.name || '');
        });

        return filtered;
    }

    function renderHouseholdList() {
        var filtered = filterHouseholds();

        if (filtered.length === 0) {
            return '<div style="text-align:center;padding:20px;color:var(--dim);font-size:0.65rem;">' + 
                infoIcon + ' No households found matching your criteria</div>';
        }

        var html = '<div style="display:flex;flex-direction:column;gap:6px;">';

        for (var i = 0; i < filtered.length; i++) {
            var h = filtered[i];
            var isSelected = selectedHouseholdId === h.id;

            // Count members
            var memberCount = h.members ? h.members.length : 0;
            var livingCount = 0;
            var deceasedCount = 0;
            var headName = 'Unknown';

            if (h.members) {
                for (var j = 0; j < h.members.length; j++) {
                    var char = _getCharacterById(h.members[j].characterId);
                    if (char) {
                        if (char.isDeceased) deceasedCount++;
                        else livingCount++;
                        if (h.members[j].isHead) {
                            headName = char.name + ' ' + (char.surname || '');
                        }
                    }
                }
            }

            // ================================================================
            // NEW: Get household head using FamilyAccessors
            // ================================================================
            var fa = _getFamilyAccessors();
            if (fa && typeof fa.getHouseholdHead === 'function') {
                var head = fa.getHouseholdHead(h.id);
                if (head) {
                    headName = head.name + ' ' + (head.surname || '');
                }
            }

            var statusBadge = '';
            if (livingCount > 0) {
                statusBadge = '<span style="color:var(--success);font-size:0.5rem;">● ' + livingCount + ' living</span>';
            } else if (deceasedCount > 0) {
                statusBadge = '<span style="color:var(--dim);font-size:0.5rem;">● ' + deceasedCount + ' deceased</span>';
            } else {
                statusBadge = '<span style="color:var(--dim);font-size:0.5rem;">● Empty</span>';
            }

            var compatibilityBadge = '';
            if (filters.showOnlyCompatible) {
                var compatible = isHouseholdCompatible(h);
                if (!compatible) {
                    compatibilityBadge = ' <span style="color:var(--warn);font-size:0.45rem;">' + 
                        crossIcon + ' Incompatible</span>';
                } else {
                    compatibilityBadge = ' <span style="color:var(--success);font-size:0.45rem;">' + 
                        checkIcon + ' Compatible</span>';
                }
            }

            // Check if this is the target character's current household
            var isCurrentHousehold = targetHouseholdId === h.id;
            var currentBadge = isCurrentHousehold ? 
                ' <span style="background:var(--accent-dim);padding:1px 6px;border-radius:10px;font-size:0.45rem;">Current</span>' : '';

            html += '<div class="household-selector-item" data-household-id="' + h.id + '" style="' +
                'background:' + (isSelected ? 'var(--accent-dim)' : 'var(--bg2)') + ';' +
                'border:1px solid ' + (isSelected ? 'var(--accent)' : 'var(--border)') + ';' +
                'border-radius:6px;' +
                'padding:10px 12px;' +
                'cursor:pointer;' +
                'transition:all 0.1s;' +
                '">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">' +
                '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">' +
                '<strong style="font-size:0.75rem;">' + _escapeHtml(h.name) + '</strong>' +
                currentBadge +
                compatibilityBadge +
                '</div>' +
                '<div style="display:flex;align-items:center;gap:6px;">' +
                statusBadge +
                '</div>' +
                '</div>' +
                '<div style="display:flex;justify-content:space-between;font-size:0.55rem;color:var(--dim);margin-top:4px;">' +
                '<span>' + locationIcon + ' ' + _escapeHtml(h.location || 'Unknown') + '</span>' +
                '<span>' + personIcon + ' Head: ' + _escapeHtml(headName) + '</span>' +
                '<span>' + householdIcon + ' ' + memberCount + ' member' + (memberCount !== 1 ? 's' : '') + '</span>' +
                '</div>' +
                (isSelected ? '<div style="margin-top:6px;color:var(--accent);font-size:0.55rem;">' + checkIcon + ' Selected</div>' : '') +
                '</div>';
        }

        html += '</div>';
        return html;
    }

    function renderFilterSection() {
        var locationHtml = '<option value="all">All Locations</option>';
        for (var i = 0; i < locationOptions.length; i++) {
            var loc = locationOptions[i];
            locationHtml += '<option value="' + loc + '" ' + (filters.location === loc ? 'selected' : '') + '>' + 
                _escapeHtml(loc) + '</option>';
        }

        return '<div style="background:var(--bg3);padding:10px;border-radius:6px;margin-bottom:12px;">' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">' +
            '<div class="form-group" style="margin-bottom:0;">' +
            '<input type="text" id="hhSearchInput" placeholder="Search households..." value="' + _escapeHtml(filters.search) + '" style="width:100%;padding:6px 8px;font-size:0.6rem;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);">' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:0;">' +
            '<select id="hhLocationFilter" style="width:100%;padding:6px 8px;font-size:0.6rem;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);">' +
            locationHtml +
            '</select>' +
            '</div>' +
            '</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">' +
            '<label style="font-size:0.55rem;display:flex;align-items:center;gap:4px;">' +
            '<input type="checkbox" id="hhShowActive" ' + (filters.showActive ? 'checked' : '') + '> Active' +
            '</label>' +
            '<label style="font-size:0.55rem;display:flex;align-items:center;gap:4px;">' +
            '<input type="checkbox" id="hhShowVacant" ' + (filters.showVacant ? 'checked' : '') + '> Vacant' +
            '</label>' +
            '<label style="font-size:0.55rem;display:flex;align-items:center;gap:4px;">' +
            '<input type="checkbox" id="hhShowEmpty" ' + (filters.showEmpty ? 'checked' : '') + '> Empty' +
            '</label>' +
            (targetCharacter ? 
                '<label style="font-size:0.55rem;display:flex;align-items:center;gap:4px;">' +
                '<input type="checkbox" id="hhShowCompatible" ' + (filters.showOnlyCompatible ? 'checked' : '') + '> Compatible only' +
                '</label>' : '') +
            '<button id="hhApplyFilters" class="btn small" style="font-size:0.55rem;padding:2px 10px;background:var(--accent-dim);border:1px solid var(--accent);border-radius:4px;cursor:pointer;">Apply</button>' +
            '<button id="hhResetFilters" class="btn small" style="font-size:0.55rem;padding:2px 10px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;cursor:pointer;">Reset</button>' +
            '</div>' +
            '</div>';
    }

    var modalContent = 
        '<div style="max-height:500px;overflow-y:auto;padding:4px;">' +
        (targetCharacter ? 
            '<div style="margin-bottom:12px;padding:8px;background:var(--bg2);border-radius:6px;font-size:0.65rem;">' +
            personIcon + ' Target: <strong>' + _escapeHtml(targetCharacter.name) + ' ' + _escapeHtml(targetCharacter.surname || '') + '</strong>' +
            (targetHousehold ? ' · Current household: <strong>' + _escapeHtml(targetHousehold.name) + '</strong>' : ' · No current household') +
            '</div>' : '') +
        renderFilterSection() +
        '<div id="householdListContainer">' +
        renderHouseholdList() +
        '</div>' +
        '<div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;">' +
        '<button id="hhCancelBtn" class="btn" style="padding:6px 16px;font-size:0.65rem;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">Cancel</button>' +
        '<button id="hhConfirmBtn" class="btn primary" style="padding:6px 16px;font-size:0.65rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:4px;cursor:pointer;" ' + 
        (selectedHouseholdId ? '' : 'disabled') + '>' + 
        (selectedHouseholdId ? 'Select Household' : 'Select a household') +
        '</button>' +
        '</div>' +
        '</div>';

    _openModal({
        title: title,
        content: modalContent,
        confirmText: '',
        cancelText: '',
        size: 'large'
    });

    setTimeout(function() {
        var listContainer = document.getElementById('householdListContainer');
        var searchInput = document.getElementById('hhSearchInput');
        var locationFilter = document.getElementById('hhLocationFilter');
        var showActive = document.getElementById('hhShowActive');
        var showVacant = document.getElementById('hhShowVacant');
        var showEmpty = document.getElementById('hhShowEmpty');
        var showCompatible = document.getElementById('hhShowCompatible');
        var applyBtn = document.getElementById('hhApplyFilters');
        var resetBtn = document.getElementById('hhResetFilters');
        var confirmBtn = document.getElementById('hhConfirmBtn');
        var cancelBtn = document.getElementById('hhCancelBtn');

        function refreshHouseholdList() {
            // Update filters from UI
            filters.search = searchInput ? searchInput.value : '';
            filters.location = locationFilter ? locationFilter.value : 'all';
            filters.showActive = showActive ? showActive.checked : true;
            filters.showVacant = showVacant ? showVacant.checked : false;
            filters.showEmpty = showEmpty ? showEmpty.checked : false;
            filters.showOnlyCompatible = showCompatible ? showCompatible.checked : false;

            if (listContainer) {
                listContainer.innerHTML = renderHouseholdList();

                // Attach click events to items
                var items = listContainer.querySelectorAll('.household-selector-item');
                for (var i = 0; i < items.length; i++) {
                    var item = items[i];
                    item.onclick = function() {
                        var householdId = this.dataset.householdId;
                        selectedHouseholdId = householdId;

                        // Update selection highlighting
                        var allItems = listContainer.querySelectorAll('.household-selector-item');
                        for (var j = 0; j < allItems.length; j++) {
                            allItems[j].style.background = 'var(--bg2)';
                            allItems[j].style.borderColor = 'var(--border)';
                        }
                        this.style.background = 'var(--accent-dim)';
                        this.style.borderColor = 'var(--accent)';

                        // Update confirm button
                        if (confirmBtn) {
                            confirmBtn.disabled = false;
                            confirmBtn.textContent = 'Select Household';
                        }

                        // Show selected indicator
                        var selectedDiv = this.querySelector('div:last-child');
                        if (selectedDiv && selectedDiv.style) {
                            selectedDiv.innerHTML = '<div style="margin-top:6px;color:var(--accent);font-size:0.55rem;">' + 
                                _getIcon('CHECK_SIMPLE') + ' Selected</div>';
                        }
                    };
                }
            }
        }

        // Event listeners
        if (applyBtn) {
            applyBtn.onclick = refreshHouseholdList;
        }

        if (resetBtn) {
            resetBtn.onclick = function() {
                if (searchInput) searchInput.value = '';
                if (locationFilter) locationFilter.value = 'all';
                if (showActive) showActive.checked = true;
                if (showVacant) showVacant.checked = false;
                if (showEmpty) showEmpty.checked = false;
                if (showCompatible) showCompatible.checked = false;
                refreshHouseholdList();
            };
        }

        // Allow Enter key to apply filters
        if (searchInput) {
            searchInput.onkeydown = function(e) {
                if (e.key === 'Enter') {
                    refreshHouseholdList();
                }
            };
        }

        if (confirmBtn) {
            confirmBtn.onclick = function() {
                if (selectedHouseholdId) {
                    var selected = _getHousehold(selectedHouseholdId);
                    if (selected) {
                        _closeTopModal();
                        onSelect(selected);
                    } else {
                        _showToast('Selected household not found', 'error');
                    }
                } else {
                    _showToast('Please select a household', 'warning');
                }
            };
        }

        if (cancelBtn) {
            cancelBtn.onclick = function() {
                _closeTopModal();
                onCancel();
            };
        }

        // Initial render
        refreshHouseholdList();

    }, 100);
}

// =============================================================================
// 5. EXPORTS
// =============================================================================

window.openHouseholdSelector = openHouseholdSelector;
window.closeHouseholdSelector = _closeTopModal;

// Legacy alias
window.openHouseholdSelectModal = openHouseholdSelector;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        openHouseholdSelector: openHouseholdSelector,
        closeHouseholdSelector: _closeTopModal
    };
}