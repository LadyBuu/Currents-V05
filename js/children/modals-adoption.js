/**
 * =============================================================================
 * STILL WATERS - ADOPTION MODALS (js/core/modals/modals-adoption.js)
 * =============================================================================
 * 
 * UPDATED: 
 * - Replaced all emojis and text symbols with SVG icons from icons.js
 * - Kept gender symbols (♂ ♀) throughout
 * - Added household history recording via window.recordHouseholdChange
 * - FIXED: All confirm buttons use simple text (no SVG leaks)
 * - FIXED: Adoption search search input uses text placeholder
 * - FIXED: Adoption search confirm button logic
 * - UPDATED: Uses unified character selector from modals-core.js
 * - UPDATED: Uses unified location dropdown from modals-core.js
 * - UPDATED: Uses ChildrenCommands, ChildrenQueries, AdoptionService
 * - UPDATED: Uses FamilyAccessors for family relationship queries
 * 
 * =============================================================================
 */

// =============================================================================
// 1. ICON HELPERS (using icons.js)
// =============================================================================

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
// 2. CONSTANTS
// =============================================================================

var ADOPTION_CONSTANTS = {
    ADOPTION_TYPES: {
        LEGAL: 'legal',
        GUARDIANSHIP: 'guardianship',
        FOSTER: 'foster'
    },
    ADOPTION_STATUS: {
        ACTIVE: 'active',
        ENDED: 'ended',
        DISSOLVED: 'dissolved'
    }
};

// =============================================================================
// 3. DEPENDENCY WRAPPERS
// =============================================================================

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

function _showToast(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type);
    else if (typeof window.showToastMessage === 'function') window.showToastMessage(msg, type);
}

function _getCurrentYear() {
    if (typeof window.getCurrentYearSafe === 'function') return window.getCurrentYearSafe();
    if (typeof window.getCurrentYear === 'function') return window.getCurrentYear();
    return 1250;
}

function _getCharacterById(id) {
    return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
}

function _getCharacters() {
    return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
}

function _getPlaces() {
    return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
}

function _getPlaceById(id) {
    return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
}

function _getCurrentLocation(character) {
    return typeof window.getCurrentLocation === 'function' ? window.getCurrentLocation(character) : 'Unknown';
}

function _getCharacterHousehold(characterId) {
    if (typeof window.getCharacterHousehold === 'function') {
        return window.getCharacterHousehold(characterId);
    }
    return null;
}

function _getAllHouseholds() {
    if (typeof window.getAllHouseholds === 'function') {
        return window.getAllHouseholds();
    }
    return window.masterData?.data?.households || [];
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

function _calculateAge(birthYear, isDeceased, deathYear) {
    if (typeof window.calculateAge === 'function') return window.calculateAge(birthYear, isDeceased, deathYear);
    var currentYear = _getCurrentYear();
    if (!birthYear) return 0;
    if (isDeceased && deathYear) return Math.max(0, deathYear - birthYear);
    return Math.max(0, currentYear - birthYear);
}

function _getAge(char) {
    return _calculateAge(char.birthYear, char.isDeceased, char.deathYear);
}

function _saveMasterData() {
    if (typeof window.saveMasterData === 'function') window.saveMasterData();
}

function _openModal(options) {
    if (typeof window.openModal === 'function') return window.openModal(options);
    return null;
}

function _closeTopModal() {
    if (typeof window.closeTopModal === 'function') window.closeTopModal();
}

function _confirmDialog(message, title, onConfirm) {
    if (typeof window.confirmDialog === 'function') {
        window.confirmDialog(message, title, onConfirm);
    } else if (confirm(message)) {
        onConfirm();
    }
}

function _recordMove(character, year, locationId, note) {
    if (typeof window.recordMove === 'function') {
        return window.recordMove(character, year, locationId, note);
    }
    return false;
}

function _recordHouseholdChange(characterId, householdId, year, action, reason, options) {
    if (typeof window.recordHouseholdChange === 'function') {
        return window.recordHouseholdChange(characterId, householdId, year, action, reason, options || {});
    }
    return false;
}

function _addHouseholdMember(householdId, characterId, type, options) {
    if (typeof window.addHouseholdMember === 'function') {
        return window.addHouseholdMember(householdId, characterId, type, options);
    }
    return false;
}

function _removeHouseholdMember(householdId, characterId) {
    if (typeof window.removeHouseholdMember === 'function') {
        return window.removeHouseholdMember(householdId, characterId);
    }
    return false;
}

function _createHousehold(name, location, options) {
    if (typeof window.createHousehold === 'function') {
        return window.createHousehold(name, location, options);
    }
    return null;
}

// =============================================================================
// 4. FAMILY ACCESSORS WRAPPER (NEW)
// =============================================================================

function _getFamilyAccessors() {
    return typeof window.FamilyAccessors !== 'undefined' ? window.FamilyAccessors : null;
}

function _getParentsViaFamilyAccessors(childId) {
    var fa = _getFamilyAccessors();
    if (fa && typeof fa.getParents === 'function') {
        return fa.getParents(childId);
    }
    return null;
}

function _getChildrenViaFamilyAccessors(parentId, includeDeceased) {
    var fa = _getFamilyAccessors();
    if (fa && typeof fa.getAllChildren === 'function') {
        var result = fa.getAllChildren(parentId, includeDeceased || false);
        if (result) {
            return result.map(function(item) { return item.character; });
        }
    }
    return null;
}

function _getSiblingsViaFamilyAccessors(childId, includeHalfSiblings, includeDeceased) {
    var fa = _getFamilyAccessors();
    if (fa && typeof fa.getSiblings === 'function') {
        var result = fa.getSiblings(childId, includeHalfSiblings !== false, includeDeceased || false);
        if (result) {
            return result.map(function(item) { return item.character; });
        }
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

function _getRelationshipDescriptionViaFamilyAccessors(id1, id2) {
    var fa = _getFamilyAccessors();
    if (fa && typeof fa.getRelationshipDescription === 'function') {
        return fa.getRelationshipDescription(id1, id2);
    }
    return null;
}

function _getConsanguinityDegreeViaFamilyAccessors(id1, id2) {
    var fa = _getFamilyAccessors();
    if (fa && typeof fa.getConsanguinityDegree === 'function') {
        return fa.getConsanguinityDegree(id1, id2);
    }
    return null;
}

function _hasChildrenViaFamilyAccessors(parentId, includeAdopted, includeDeceased) {
    var fa = _getFamilyAccessors();
    if (fa && typeof fa.hasChildren === 'function') {
        return fa.hasChildren(parentId, includeAdopted !== false, includeDeceased || false);
    }
    return false;
}

function _getCharacterHouseholdViaFamilyAccessors(characterId) {
    var fa = _getFamilyAccessors();
    if (fa && typeof fa.getCharacterHousehold === 'function') {
        return fa.getCharacterHousehold(characterId);
    }
    return null;
}

// =============================================================================
// 5. CHILDREN SYSTEM WRAPPERS
// =============================================================================

function _recordAdoption(parent, child, options) {
    if (typeof window.ChildrenCommands !== 'undefined') {
        return window.ChildrenCommands.recordAdoption(parent, child, options);
    }
    if (typeof window.createAdoption === 'function') {
        return window.createAdoption(parent.id, child.id, options);
    }
    return null;
}

function _removeAdoption(parent, child, options) {
    if (typeof window.ChildrenCommands !== 'undefined') {
        return window.ChildrenCommands.removeAdoption(parent, child, options);
    }
    if (typeof window.removeAdoption === 'function') {
        return window.removeAdoption(parent.id, child.id, options);
    }
    return null;
}

function _isAdoptiveParent(parentId, childId) {
    if (typeof window.ChildrenQueries !== 'undefined') {
        return window.ChildrenQueries.isAdoptiveParent(parentId, childId);
    }
    if (typeof window.isAdoptiveParent === 'function') {
        return window.isAdoptiveParent(parentId, childId);
    }
    return false;
}

function _getAdoptionRecord(parentId, childId) {
    if (typeof window.AdoptionService !== 'undefined') {
        return window.AdoptionService.getAdoptionRecord(parentId, childId);
    }
    if (typeof window.getAdoptionRecord === 'function') {
        return window.getAdoptionRecord(parentId, childId);
    }
    return null;
}

function _getFullRelationshipDescription(id1, id2) {
    // Prefer FamilyAccessors
    var faResult = _getRelationshipDescriptionViaFamilyAccessors(id1, id2);
    if (faResult !== null) {
        return faResult;
    }
    if (typeof window.getFullRelationshipDescription === 'function') {
        return window.getFullRelationshipDescription(id1, id2);
    }
    return null;
}

function _getRelationshipBetween(id1, id2) {
    if (typeof window.getRelationshipBetween === 'function') {
        return window.getRelationshipBetween(id1, id2);
    }
    return null;
}

// =============================================================================
// 6. CHARACTER SELECTOR - Uses unified selector
// =============================================================================

function _openCharacterSelectorForAdoption(title, onSelect, options) {
    options = options || {};
    
    if (typeof window.openUnifiedCharacterSelector === 'function') {
        window.openUnifiedCharacterSelector({
            title: title || 'Select Character',
            targetId: options.targetId || null,
            onSelect: onSelect,
            filters: {
                gender: options.gender || 'all',
                status: options.status || 'all',
                showDeceased: options.showDeceased || false,
                location: options.locationFilter || 'all',
                ageMin: options.ageMin || null,
                ageMax: options.ageMax || null
            },
            preset: options.preset || null
        });
        return true;
    }
    
    if (typeof window.openCharacterSelector === 'function') {
        window.openCharacterSelector({
            title: title || 'Select Character',
            targetId: options.targetId || null,
            onSelect: onSelect,
            filters: {
                gender: options.gender || 'all',
                status: options.status || 'all',
                showDeceased: options.showDeceased || false,
                location: options.locationFilter || 'all'
            },
            preset: options.preset || null
        });
        return true;
    }
    
    if (typeof window.openCharacterSelectModal === 'function') {
        window.openCharacterSelectModal({
            title: title || 'Select Character',
            targetCharacterId: options.targetId || null,
            onSelect: onSelect,
            includeDeceased: options.showDeceased || false
        });
        return true;
    }
    
    _showToast('Character selector not available', 'error');
    return false;
}

// =============================================================================
// 7. SET BIRTH PARENTS MODAL (UPDATED with FamilyAccessors)
// =============================================================================

function openSetBirthParentsModal(child, father, mother, onSuccess) {
    if (!child) {
        _showToast('Child not found', 'error');
        return;
    }
    
    var childAge = _getAge(child);
    var parentLocation = father ? _getCurrentLocation(father) : (mother ? _getCurrentLocation(mother) : null);
    var childLocation = _getCurrentLocation(child);
    var currentYear = _getCurrentYear();
    
    // ================================================================
    // UPDATED: Get existing parents using FamilyAccessors
    // ================================================================
    var existingParents = _getParentsViaFamilyAccessors(child.id);
    var existingFather = existingParents ? existingParents.father : null;
    var existingMother = existingParents ? existingParents.mother : null;
    
    // Fallback: direct data access
    if (!existingFather && child.fatherId) {
        existingFather = _getCharacterById(child.fatherId);
    }
    if (!existingMother && child.motherId) {
        existingMother = _getCharacterById(child.motherId);
    }
    
    var warningIcon = _getIcon('WARNING');
    var infoIcon = _getIcon('CIRCLE_DOT');
    var personIcon = _getIcon('PERSON');
    var locationIcon = _getIcon('LOCATION');
    var checkIcon = _getIcon('CHECK_SIMPLE');
    
    var warningHtml = '';
    if (existingFather && father && existingFather.id !== father.id) {
        warningHtml += '<div style="background: rgba(200, 68, 68, 0.15); padding: 6px; border-radius: 6px; margin-bottom: 8px; color: var(--warn);">' +
            warningIcon + ' Warning: ' + child.name + ' already has a father (' + existingFather.name + '). This will replace them.</div>';
    }
    if (existingMother && mother && existingMother.id !== mother.id) {
        warningHtml += '<div style="background: rgba(200, 68, 68, 0.15); padding: 6px; border-radius: 6px; margin-bottom: 8px; color: var(--warn);">' +
            warningIcon + ' Warning: ' + child.name + ' already has a mother (' + existingMother.name + '). This will replace them.</div>';
    }
    
    var modalContent = '<div class="info-box" style="background: var(--bg3); padding: 12px; border-radius: 8px; margin-bottom: 16px;">' +
        '<div style="margin-bottom: 8px;">' +
            '<strong>' + personIcon + ' Child: ' + _escapeHtml(child.name) + ' ' + _escapeHtml(child.surname || '') + '</strong><br>' +
            locationIcon + ' Current location: ' + _escapeHtml(childLocation) + ' · ' + childAge + ' years old' +
            (child.birthYear ? '<br>' + infoIcon + ' Current birth year: ' + child.birthYear : '') +
        '</div>' +
        '<div style="margin-bottom: 8px;">' +
            '<strong>Father: ' + (father ? _escapeHtml(father.name) + ' ' + (father.surname || '') : 'Unknown') + '</strong><br>' +
            (father ? locationIcon + ' Location: ' + _escapeHtml(_getCurrentLocation(father)) + ' · ' + _getAge(father) + ' years' : '') +
        '</div>' +
        '<div style="margin-bottom: 8px;">' +
            '<strong>Mother: ' + (mother ? _escapeHtml(mother.name) + ' ' + (mother.surname || '') : 'Unknown') + '</strong><br>' +
            (mother ? locationIcon + ' Location: ' + _escapeHtml(_getCurrentLocation(mother)) + ' · ' + _getAge(mother) + ' years' : '') +
        '</div>' +
        warningHtml +
        '<div style="margin-top: 8px; padding: 6px; background: var(--bg2); border-radius: 6px; font-size: 0.65rem;">' +
            infoIcon + ' ' + child.name + ' will be recorded as born in ' + (parentLocation || 'the parent\'s location') + '.' +
        '</div>' +
    '</div>' +
    
    '<div class="form-group" style="margin-bottom: 12px;">' +
        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Birth Year (if not already set)</label>' +
        '<input type="number" id="birthYear" value="' + (child.birthYear || currentYear) + '" min="1" max="' + currentYear + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">' +
        '<small style="font-size: 0.55rem;">Leave as is if already correct</small>' +
    '</div>' +
    
    '<div class="form-group" style="margin-bottom: 12px;">' +
        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes (optional)</label>' +
        '<textarea id="birthNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);" placeholder="e.g., Legitimized, Birth record found..."></textarea>' +
    '</div>';
    
    _openModal({
        title: 'Set Birth Parents: ' + child.name,
        content: modalContent,
        confirmText: 'Set Birth Parents',
        cancelText: 'Cancel',
        onConfirm: function() {
            var notes = document.getElementById('birthNotes') ? document.getElementById('birthNotes').value : '';
            var birthYear = parseInt(document.getElementById('birthYear') ? document.getElementById('birthYear').value : 0);
            
            // Use FamilyAccessors to set parents if available
            var fa = _getFamilyAccessors();
            if (fa && typeof fa.setParent === 'function') {
                if (father) {
                    fa.setParent(child.id, father.id, 'father', {
                        biological: true,
                        startYear: child.birthYear || birthYear || currentYear,
                        notes: notes || 'Set as birth father'
                    });
                }
                if (mother) {
                    fa.setParent(child.id, mother.id, 'mother', {
                        biological: true,
                        startYear: child.birthYear || birthYear || currentYear,
                        notes: notes || 'Set as birth mother'
                    });
                }
            } else {
                // Fallback: direct data access
                if (father) child.fatherId = father.id;
                if (mother) child.motherId = mother.id;
            }
            
            if (!child.birthYear && !isNaN(birthYear) && birthYear > 0 && birthYear <= currentYear) {
                child.birthYear = birthYear;
            }
            
            if (notes) {
                child.notes = child.notes ? child.notes + '\n' + notes : notes;
            }
            
            if (parentLocation && childLocation !== parentLocation && child.birthYear) {
                var places = _getPlaces();
                var targetPlace = null;
                for (var i = 0; i < places.length; i++) {
                    if (places[i].displayName === parentLocation) {
                        targetPlace = places[i];
                        break;
                    }
                }
                if (targetPlace) {
                    _recordMove(child, child.birthYear, targetPlace.id, 'Born in ' + parentLocation + ' to ' + (father ? father.name : '') + (mother ? ' and ' + mother.name : ''));
                    _showToast(child.name + ' recorded as born in ' + parentLocation, 'info');
                }
            }
            
            _saveMasterData();
            _showToast(child.name + '\'s birth parents have been set!', 'success');
            if (onSuccess) onSuccess();
        }
    });
}

// =============================================================================
// 8. CREATE ADOPTION/GUARDIANSHIP MODAL (UPDATED with FamilyAccessors)
// =============================================================================

function openCreateAdoptionModal(child, guardian, partner, onSuccess) {
    if (!child || !guardian) {
        _showToast('Child and guardian are required', 'error');
        return;
    }
    
    // ================================================================
    // UPDATED: Check if already adoptive parent using FamilyAccessors
    // ================================================================
    var fa = _getFamilyAccessors();
    var isAdoptive = false;
    
    if (fa && typeof fa.getAllParents === 'function') {
        var allParents = fa.getAllParents(child.id, true);
        if (allParents) {
            for (var i = 0; i < allParents.length; i++) {
                if (!allParents[i].biological && allParents[i].character.id === guardian.id) {
                    isAdoptive = true;
                    break;
                }
            }
        }
    }
    
    if (!isAdoptive) {
        isAdoptive = _isAdoptiveParent(guardian.id, child.id);
    }
    
    if (isAdoptive) {
        _showToast(child.name + ' is already adopted by ' + guardian.name, 'error');
        return;
    }
    
    if (partner) {
        var isPartnerAdoptive = false;
        if (fa && typeof fa.getAllParents === 'function') {
            var allParents = fa.getAllParents(child.id, true);
            if (allParents) {
                for (var i = 0; i < allParents.length; i++) {
                    if (!allParents[i].biological && allParents[i].character.id === partner.id) {
                        isPartnerAdoptive = true;
                        break;
                    }
                }
            }
        }
        if (!isPartnerAdoptive) {
            isPartnerAdoptive = _isAdoptiveParent(partner.id, child.id);
        }
        if (isPartnerAdoptive) {
            _showToast(child.name + ' is already adopted by ' + partner.name, 'error');
            return;
        }
    }
    
    var childAge = _getAge(child);
    var guardianAge = _getAge(guardian);
    var partnerAge = partner ? _getAge(partner) : null;
    var currentYear = _getCurrentYear();
    var childLocation = _getCurrentLocation(child);
    var guardianLocation = _getCurrentLocation(guardian);
    var isCouple = !!partner;
    
    // ================================================================
    // UPDATED: Check if related using FamilyAccessors
    // ================================================================
    var isRelative = false;
    var relation = null;
    
    if (fa && typeof fa.getRelationshipDescription === 'function') {
        relation = fa.getRelationshipDescription(child.id, guardian.id);
        if (relation && relation !== 'Unrelated' && relation !== 'Unknown') {
            isRelative = true;
        }
    }
    
    if (!isRelative) {
        relation = _getFullRelationshipDescription(child.id, guardian.id);
        if (relation) isRelative = true;
    }
    
    var suggestedYear = currentYear;
    
    var personIcon = _getIcon('PERSON');
    var infoIcon = _getIcon('CIRCLE_DOT');
    var warningIcon = _getIcon('WARNING');
    var locationIcon = _getIcon('LOCATION');
    var householdIcon = _getIcon('HOUSEHOLD');
    var checkIcon = _getIcon('CHECK_SIMPLE');
    var crossIcon = _getIcon('X_HEAVY');
    
    var modalContent = '<div class="info-box" style="background: var(--bg3); padding: 12px; border-radius: 8px; margin-bottom: 16px;">' +
        '<div style="margin-bottom: 8px;">' +
            '<strong>' + personIcon + ' Child: ' + _escapeHtml(child.name) + ' ' + _escapeHtml(child.surname || '') + '</strong><br>' +
            locationIcon + ' Current location: ' + _escapeHtml(childLocation) + ' · ' + childAge + ' years old' +
        '</div>' +
        '<div style="margin-bottom: 8px;">' +
            '<strong>' + (isCouple ? personIcon + ' Parents:' : 'Guardian:') + ' ' + _escapeHtml(guardian.name) + ' ' + _escapeHtml(guardian.surname || '') + '</strong>' + (isCouple ? ' & ' + _escapeHtml(partner.name) + ' ' + _escapeHtml(partner.surname || '') : '') + '<br>' +
            locationIcon + ' Location: ' + _escapeHtml(guardianLocation) + ' · ' + guardianAge + ' years old' + (partnerAge ? ' & ' + partnerAge + ' years' : '') +
        '</div>' +
        (isRelative ? '<div class="warning-text" style="background: rgba(200, 70, 70, 0.2); padding: 8px; border-radius: 6px; margin-top: 8px;">' + warningIcon + ' WARNING: ' + _escapeHtml(relation) + '!</div>' : '') +
        '<div style="margin-top: 8px; font-size: 0.65rem; color: var(--dim);">' +
            infoIcon + ' ' + child.name + ' will move to ' + guardian.name + '\'s location at the time of ' + (isCouple ? 'adoption' : 'guardianship') +
        '</div>' +
        '<div style="margin-top: 8px; font-size: 0.65rem; color: var(--accent);">' +
            infoIcon + ' No age restrictions - anyone can adopt or be adopted at any age' +
        '</div>' +
    '</div>' +
    
    '<div class="form-group" style="margin-bottom: 12px;">' +
        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Type of Arrangement</label>' +
        '<select id="adoptionTypeSelect" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">' +
            '<option value="legal">Legal Adoption (full parental rights)</option>' +
            '<option value="guardianship">Guardianship (caregiver, not legal parent)</option>' +
            '<option value="foster">Foster Care (temporary placement)</option>' +
        '</select>' +
    '</div>' +
    
    '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">' +
        '<div class="form-group">' +
            '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Child\'s Age at ' + (isCouple ? 'Adoption' : 'Guardianship') + '</label>' +
            '<input type="number" id="adoptionAge" value="' + childAge + '" min="0" max="200" step="1" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">' +
            '<small style="font-size: 0.55rem;">Any age allowed (including adults)</small>' +
        '</div>' +
        '<div class="form-group">' +
            '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Year</label>' +
            '<input type="number" id="adoptionYear" value="' + suggestedYear + '" min="0" max="' + (currentYear + 10) + '" step="1" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">' +
            '<small style="font-size: 0.55rem;">Can be in the past (retroactive) or future</small>' +
        '</div>' +
    '</div>' +
    
    '<div class="form-group" style="margin-bottom: 12px;">' +
        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Household Assignment</label>' +
        '<select id="adoptionHouseholdChoice" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
            '<option value="guardian">Add child to guardian\'s household</option>' +
            '<option value="separate">Child starts independent household</option>' +
            '<option value="none">No household assignment</option>' +
        '</select>' +
        '<small style="font-size: 0.55rem;">Where will the child live after adoption/guardianship?</small>' +
    '</div>' +
    
    '<div class="form-group" style="margin-bottom: 12px;">' +
        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes (optional)</label>' +
        '<textarea id="adoptionNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);" placeholder="e.g., For inheritance purposes, Adult adoption..."></textarea>' +
    '</div>';
    
    _openModal({
        title: (isCouple ? 'Adoption' : 'Guardianship') + ': ' + child.name,
        content: modalContent,
        confirmText: 'Confirm',
        cancelText: 'Cancel',
        onConfirm: function() {
            var adoptionAge = parseInt(document.getElementById('adoptionAge') ? document.getElementById('adoptionAge').value : 0);
            var adoptionYear = parseInt(document.getElementById('adoptionYear') ? document.getElementById('adoptionYear').value : 0);
            var adoptionTypeChoice = document.getElementById('adoptionTypeSelect') ? document.getElementById('adoptionTypeSelect').value : 'legal';
            var householdChoice = document.getElementById('adoptionHouseholdChoice') ? document.getElementById('adoptionHouseholdChoice').value : 'guardian';
            var notes = document.getElementById('adoptionNotes') ? document.getElementById('adoptionNotes').value : '';
            
            if (isNaN(adoptionAge)) adoptionAge = childAge;
            if (isNaN(adoptionYear)) adoptionYear = currentYear;
            
            if (child.birthYear && adoptionAge >= 0) {
                adoptionYear = child.birthYear + adoptionAge;
            }
            
            var places = _getPlaces();
            var targetPlace = null;
            for (var i = 0; i < places.length; i++) {
                if (places[i].displayName === guardianLocation) {
                    targetPlace = places[i];
                    break;
                }
            }
            if (targetPlace && childLocation !== guardianLocation) {
                _recordMove(child, adoptionYear, targetPlace.id, 'Moved to ' + guardian.name + (isCouple ? ' and ' + partner.name : '') + '\'s location for ' + (adoptionTypeChoice === 'legal' ? 'adoption' : 'guardianship'));
                _showToast(child.name + ' moved to ' + guardianLocation, 'info');
            }
            
            var result = _recordAdoption(guardian, child, {
                year: adoptionYear,
                type: adoptionTypeChoice,
                notes: notes || (adoptionTypeChoice === 'legal' ? 'Adoption' : (adoptionTypeChoice === 'guardianship' ? 'Guardianship' : 'Foster care')) + ' at age ' + adoptionAge,
                parentType: guardian.gender === 'male' ? 'father' : 'mother',
                partner: isCouple ? partner : null
            });
            
            if (result && result.success) {
                var typeName = adoptionTypeChoice === 'legal' ? 'adopted by' : (adoptionTypeChoice === 'guardianship' ? 'under guardianship of' : 'in foster care with');
                _showToast(child.name + ' is now ' + typeName + ' ' + guardian.name + (isCouple ? ' and ' + partner.name : ''), 'success');
                
                // ================================================================
                // UPDATED: Household assignment using FamilyAccessors
                // ================================================================
                if (householdChoice === 'guardian') {
                    var guardianHousehold = _getCharacterHouseholdViaFamilyAccessors(guardian.id);
                    if (!guardianHousehold) {
                        guardianHousehold = _getCharacterHousehold(guardian.id);
                    }
                    if (guardianHousehold) {
                        var previousHousehold = _getCharacterHouseholdViaFamilyAccessors(child.id);
                        if (!previousHousehold) {
                            previousHousehold = _getCharacterHousehold(child.id);
                        }
                        if (previousHousehold && previousHousehold.id !== guardianHousehold.id) {
                            _recordHouseholdChange(child.id, null, adoptionYear, 'left',
                                'Left previous household due to ' + adoptionTypeChoice,
                                { previousHouseholdId: previousHousehold.id, previousHouseholdName: previousHousehold.name });
                        }
                        
                        _addHouseholdMember(guardianHousehold.id, child.id, 'family', {
                            role: 'Child',
                            joinedYear: adoptionYear,
                            notes: 'Added via ' + adoptionTypeChoice
                        });
                        
                        _recordHouseholdChange(child.id, guardianHousehold.id, adoptionYear, 'joined',
                            adoptionTypeChoice + ' by ' + guardian.name + (isCouple ? ' and ' + partner.name : ''),
                            { newRole: 'Child' });
                    }
                    
                    if (isCouple && partner) {
                        var partnerHousehold = _getCharacterHouseholdViaFamilyAccessors(partner.id);
                        if (!partnerHousehold) {
                            partnerHousehold = _getCharacterHousehold(partner.id);
                        }
                        if (partnerHousehold && (!guardianHousehold || partnerHousehold.id !== guardianHousehold.id)) {
                            _addHouseholdMember(partnerHousehold.id, child.id, 'family', {
                                role: 'Child',
                                joinedYear: adoptionYear,
                                notes: 'Added via ' + adoptionTypeChoice + ' (co-parent)'
                            });
                            _recordHouseholdChange(child.id, partnerHousehold.id, adoptionYear, 'joined',
                                adoptionTypeChoice + ' by ' + partner.name,
                                { newRole: 'Child' });
                        }
                    }
                } else if (householdChoice === 'separate') {
                    var location = _getCurrentLocation(guardian) || _getCurrentLocation(child);
                    var childHousehold = _createHousehold(child.name + '\'s Household', location, {
                        foundedYear: adoptionYear,
                        notes: 'Created via ' + adoptionTypeChoice
                    });
                    if (childHousehold) {
                        _addHouseholdMember(childHousehold.id, child.id, 'family', {
                            role: 'Head of Household',
                            joinedYear: adoptionYear,
                            isHead: true,
                            notes: 'Created via ' + adoptionTypeChoice
                        });
                        _recordHouseholdChange(child.id, childHousehold.id, adoptionYear, 'created',
                            'Created independent household due to ' + adoptionTypeChoice,
                            { newRole: 'Head of Household' });
                    }
                }
                
                _saveMasterData();
                if (onSuccess) onSuccess();
                _closeTopModal();
                return true;
            } else {
                _showToast('Failed to create adoption/guardianship', 'error');
                return false;
            }
        }
    });
    
    setTimeout(function() {
        var ageInput = document.getElementById('adoptionAge');
        var yearInput = document.getElementById('adoptionYear');
        
        if (ageInput && yearInput && child.birthYear) {
            var isUserChanging = false;
            
            var updateFromAge = function() {
                if (isUserChanging) return;
                isUserChanging = true;
                var age = parseInt(ageInput.value);
                if (!isNaN(age) && age >= 0) {
                    yearInput.value = child.birthYear + age;
                }
                isUserChanging = false;
            };
            
            var updateFromYear = function() {
                if (isUserChanging) return;
                isUserChanging = true;
                var year = parseInt(yearInput.value);
                if (!isNaN(year)) {
                    var newAge = year - child.birthYear;
                    if (newAge >= 0) {
                        ageInput.value = newAge;
                    }
                }
                isUserChanging = false;
            };
            
            ageInput.addEventListener('input', updateFromAge);
            yearInput.addEventListener('input', updateFromYear);
        }
    }, 50);
}

// =============================================================================
// 9. EDIT ADOPTION MODAL (UPDATED with FamilyAccessors)
// =============================================================================

function openEditAdoptionModal(child, parent, adoptionRecord, onSuccess) {
    if (!child || !parent) {
        _showToast('Child and parent are required', 'error');
        return;
    }
    
    var currentYear = _getCurrentYear();
    var record = adoptionRecord || _getAdoptionRecord(parent.id, child.id);
    
    if (!record) {
        _showToast('Adoption record not found', 'error');
        return;
    }
    
    var originalValues = {
        year: record.year,
        type: record.type,
        notes: record.notes || '',
        status: record.status || ADOPTION_CONSTANTS.ADOPTION_STATUS.ACTIVE
    };
    
    var typeNames = {
        legal: 'Legal Adoption',
        guardianship: 'Guardianship',
        foster: 'Foster Care'
    };
    
    var personIcon = _getIcon('PERSON');
    var infoIcon = _getIcon('CIRCLE_DOT');
    var editIcon = _getIcon('EDIT');
    var checkIcon = _getIcon('CHECK_SIMPLE');
    var crossIcon = _getIcon('X_HEAVY');
    
    var modalContent = '<div class="info-box" style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px;">' +
        '<div><strong>' + personIcon + ' Child:</strong> ' + _escapeHtml(child.name) + ' ' + _escapeHtml(child.surname || '') + '</div>' +
        '<div><strong>' + personIcon + ' Parent:</strong> ' + _escapeHtml(parent.name) + ' ' + _escapeHtml(parent.surname || '') + '</div>' +
        '<div style="font-size: 0.65rem; color: var(--dim); margin-top: 4px;">Current: ' + (typeNames[record.type] || record.type) + ' since ' + (record.year || '?') + '</div>' +
    '</div>' +
    
    '<div class="form-group" style="margin-bottom: 12px;">' +
        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Type of Arrangement</label>' +
        '<select id="editAdoptionType" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
            '<option value="legal" ' + (record.type === 'legal' ? 'selected' : '') + '>Legal Adoption (full parental rights)</option>' +
            '<option value="guardianship" ' + (record.type === 'guardianship' ? 'selected' : '') + '>Guardianship (caregiver, not legal parent)</option>' +
            '<option value="foster" ' + (record.type === 'foster' ? 'selected' : '') + '>Foster Care (temporary placement)</option>' +
        '</select>' +
    '</div>' +
    
    '<div class="form-group" style="margin-bottom: 12px;">' +
        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Year of ' + (typeNames[record.type] ? typeNames[record.type].split(' ')[0] : 'Arrangement') + '</label>' +
        '<input type="number" id="editAdoptionYear" value="' + (record.year || currentYear) + '" min="1" max="' + (currentYear + 10) + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">' +
    '</div>' +
    
    '<div class="form-group" style="margin-bottom: 12px;">' +
        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Status</label>' +
        '<select id="editAdoptionStatus" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
            '<option value="active" ' + (record.status !== ADOPTION_CONSTANTS.ADOPTION_STATUS.ENDED && record.status !== ADOPTION_CONSTANTS.ADOPTION_STATUS.DISSOLVED ? 'selected' : '') + '>Active</option>' +
            '<option value="ended" ' + (record.status === ADOPTION_CONSTANTS.ADOPTION_STATUS.ENDED ? 'selected' : '') + '>Ended</option>' +
            '<option value="dissolved" ' + (record.status === ADOPTION_CONSTANTS.ADOPTION_STATUS.DISSOLVED ? 'selected' : '') + '>Dissolved</option>' +
        '</select>' +
    '</div>' +
    
    '<div class="form-group" style="margin-bottom: 12px;">' +
        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes</label>' +
        '<textarea id="editAdoptionNotes" rows="3" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">' + _escapeHtml(record.notes || '') + '</textarea>' +
    '</div>' +
    
    '<div class="action-buttons" style="margin-top: 12px; display: flex; gap: 8px;">' +
        '<button id="terminateAdoptionBtn" class="btn danger" style="background: #8a3020; border: none; color: white; padding: 6px 12px; border-radius: 6px; cursor: pointer;">' + crossIcon + ' Terminate ' + (typeNames[record.type] ? typeNames[record.type].split(' ')[0] : 'Arrangement') + '</button>' +
    '</div>';
    
    _openModal({
        title: 'Edit ' + (typeNames[record.type] || 'Adoption') + ': ' + child.name,
        content: modalContent,
        confirmText: 'Save Changes',
        cancelText: 'Cancel',
        onConfirm: function() {
            var newType = document.getElementById('editAdoptionType').value;
            var newYear = parseInt(document.getElementById('editAdoptionYear').value);
            var newStatus = document.getElementById('editAdoptionStatus').value;
            var newNotes = document.getElementById('editAdoptionNotes').value;
            
            if (isNaN(newYear)) {
                _showToast('Invalid year', 'error');
                return;
            }
            
            var updates = {
                year: newYear,
                type: newType,
                notes: newNotes,
                status: newStatus
            };
            
            var success = true;
            
            // Update using the adoption service if available
            if (typeof window.ChildrenCommands !== 'undefined') {
                var record = _getAdoptionRecord(parent.id, child.id);
                if (record) {
                    if (updates.year !== undefined) record.year = updates.year;
                    if (updates.type !== undefined) record.type = updates.type;
                    if (updates.notes !== undefined) record.notes = updates.notes;
                    if (updates.status !== undefined) record.status = updates.status;
                    success = true;
                } else {
                    success = false;
                }
            } else if (typeof window.updateAdoption === 'function') {
                success = window.updateAdoption(parent.id, child.id, updates);
            }
            
            if (success) {
                _saveMasterData();
                _showToast('Updated ' + (typeNames[record.type] || 'adoption') + ' for ' + child.name, 'success');
                _closeTopModal();
                if (onSuccess) onSuccess();
                return true;
            } else {
                _showToast('Failed to update adoption record', 'error');
                return false;
            }
        }
    });
    
    setTimeout(function() {
        var terminateBtn = document.getElementById('terminateAdoptionBtn');
        if (terminateBtn) {
            terminateBtn.addEventListener('click', function() {
                _closeTopModal();
                openRemoveAdoptionModal(child, parent, null, onSuccess);
            });
        }
    }, 100);
}

// =============================================================================
// 10. REMOVE ADOPTION MODAL (UPDATED with FamilyAccessors)
// =============================================================================

function openRemoveAdoptionModal(child, guardian, partner, onSuccess) {
    if (!child || !guardian) {
        _showToast('Child and guardian are required', 'error');
        return;
    }
    
    var childName = child.name;
    var guardianName = guardian.name;
    var partnerName = partner ? ' and ' + partner.name : '';
    var isCouple = !!partner;
    var currentYear = _getCurrentYear();
    var record = _getAdoptionRecord(guardian.id, child.id);
    var typeName = record && record.type === 'legal' ? 'Adoption' : (record && record.type === 'guardianship' ? 'Guardianship' : 'Foster Care');
    
    // ================================================================
    // NEW: Check if there are children in the household affected
    // ================================================================
    var affectedChildren = [];
    var fa = _getFamilyAccessors();
    if (fa && typeof fa.getChildren === 'function') {
        var children = fa.getChildren(guardian.id);
        if (children && children.length > 0) {
            for (var i = 0; i < children.length; i++) {
                if (children[i].id !== child.id) {
                    affectedChildren.push(children[i]);
                }
            }
        }
    }
    
    var warningIcon = _getIcon('WARNING');
    var infoIcon = _getIcon('CIRCLE_DOT');
    var xIcon = _getIcon('X_HEAVY');
    var checkIcon = _getIcon('CHECK_SIMPLE');
    
    var warningHtml = '';
    if (affectedChildren.length > 0) {
        warningHtml = '<div style="margin-top: 8px; padding: 6px; background: rgba(200, 112, 64, 0.15); border-radius: 6px; font-size: 0.6rem;">' +
            warningIcon + ' ' + guardian.name + ' has ' + affectedChildren.length + ' other child' + (affectedChildren.length > 1 ? 'ren' : '') + 
            ' in their care. This removal may affect them as well.</div>';
    }
    
    var modalContent = '<div class="info-box" style="background: rgba(200, 68, 68, 0.15); border: 1px solid var(--warn); padding: 12px; border-radius: 8px; margin-bottom: 16px;">' +
        '<strong>' + warningIcon + ' Warning: This will remove the ' + typeName + ' relationship</strong>' +
        '<div style="margin-top: 8px;">' +
            _escapeHtml(childName) + ' will no longer be ' + (record && record.type === 'legal' ? 'adopted by' : (record && record.type === 'guardianship' ? 'under guardianship of' : 'in foster care with')) + ' ' + _escapeHtml(guardianName) + partnerName + '.' +
        '</div>' +
        '<div style="margin-top: 8px; font-size: 0.65rem; color: var(--dim);">' +
            'Historical records will still show that this relationship existed.' +
        '</div>' +
        warningHtml +
    '</div>' +
    
    '<div class="form-group" style="margin-bottom: 12px;">' +
        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Year of Termination</label>' +
        '<input type="number" id="removalYear" value="' + currentYear + '" min="1" max="' + (currentYear + 10) + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">' +
    '</div>' +
    
    '<div class="form-group" style="margin-bottom: 12px;">' +
        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Reason for Removal (optional)</label>' +
        '<textarea id="removalReason" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);" placeholder="e.g., Adoption dissolved, Guardian stepped down..."></textarea>' +
    '</div>' +
    
    '<div class="form-group" style="margin-bottom: 12px;">' +
        '<label style="display: flex; align-items: center; gap: 8px;">' +
            '<input type="checkbox" id="keepHistory" checked>' +
            '<span style="font-size: 0.7rem;">' + infoIcon + ' Keep historical record (recommended)</span>' +
        '</label>' +
        '<small style="font-size: 0.55rem;">If unchecked, the record will be permanently deleted.</small>' +
    '</div>';
    
    _openModal({
        title: xIcon + ' Remove ' + typeName + ': ' + child.name,
        content: modalContent,
        confirmText: 'Confirm Removal',
        cancelText: 'Cancel',
        onConfirm: function() {
            var reason = document.getElementById('removalReason') ? document.getElementById('removalReason').value : 'Removed';
            var endYear = parseInt(document.getElementById('removalYear') ? document.getElementById('removalYear').value : 0) || currentYear;
            var keepHistory = document.getElementById('keepHistory') ? document.getElementById('keepHistory').checked !== false : true;
            
            var guardianHousehold = _getCharacterHouseholdViaFamilyAccessors(guardian.id);
            if (!guardianHousehold) {
                guardianHousehold = _getCharacterHousehold(guardian.id);
            }
            if (guardianHousehold) {
                _recordHouseholdChange(child.id, null, endYear, 'left',
                    typeName + ' relationship terminated: ' + reason,
                    { previousHouseholdId: guardianHousehold.id, previousHouseholdName: guardianHousehold.name });
            }
            
            var result1 = _removeAdoption(guardian, child, { 
                reason: reason,
                endYear: endYear,
                keepHistory: keepHistory
            });
            
            var result2 = true;
            if (partner) {
                var partnerHousehold = _getCharacterHouseholdViaFamilyAccessors(partner.id);
                if (!partnerHousehold) {
                    partnerHousehold = _getCharacterHousehold(partner.id);
                }
                if (partnerHousehold) {
                    _recordHouseholdChange(child.id, null, endYear, 'left',
                        typeName + ' relationship terminated: ' + reason,
                        { previousHouseholdId: partnerHousehold.id, previousHouseholdName: partnerHousehold.name });
                }
                result2 = _removeAdoption(partner, child, { 
                    reason: reason,
                    endYear: endYear,
                    keepHistory: keepHistory
                });
            }
            
            if (result1 && result2) {
                _saveMasterData();
                _showToast(typeName + ' relationship removed between ' + childName + ' and ' + guardianName + partnerName, 'info');
                _closeTopModal();
                if (onSuccess) onSuccess();
                return true;
            } else {
                _showToast('Failed to remove adoption relationship', 'error');
                return false;
            }
        }
    });
}

// =============================================================================
// 11. ADOPTION SEARCH MODAL (UPDATED with FamilyAccessors)
// =============================================================================

function openAdoptionSearchModal(onSelect, options) {
    options = options || {};
    var allChars = _getCharacters();
    var currentYear = _getCurrentYear();
    
    var searchTerm = '';
    var minAge = options.minAge !== undefined ? options.minAge : 0;
    var maxAge = options.maxAge !== undefined ? options.maxAge : 18;
    var locationFilter = options.location || 'all';
    var statusFilter = options.status || 'all';
    var genderFilter = options.gender || 'all';
    var selectedChildId = null;
    
    var allLocations = new Set();
    for (var i = 0; i < allChars.length; i++) {
        var char = allChars[i];
        if (!char.isDeceased) {
            var loc = _getCurrentLocation(char);
            if (loc && loc !== 'Unknown') allLocations.add(loc);
        }
    }
    var locationOptions = Array.from(allLocations).sort();
    
    var infoIcon = _getIcon('CIRCLE_DOT');
    var checkIcon = _getIcon('CHECK_SIMPLE');
    var warningIcon = _getIcon('WARNING');
    var locationIcon = _getIcon('LOCATION');
    var householdIcon = _getIcon('HOUSEHOLD');
    var personIcon = _getIcon('PERSON');
    var searchIcon = _getIcon('SEARCH');
    
    function isEligibleForAdoption(child) {
        if (child.isDeceased) return false;
        
        var age = _getAge(child);
        if (age < minAge || age > maxAge) return false;
        
        // ================================================================
        // UPDATED: Check if orphan using FamilyAccessors
        // ================================================================
        var fa = _getFamilyAccessors();
        var isOrphan = false;
        var hasLivingParent = true;
        
        if (fa && typeof fa.getParents === 'function') {
            var parents = fa.getParents(child.id);
            hasLivingParent = (parents.father && !parents.father.isDeceased) || 
                             (parents.mother && !parents.mother.isDeceased);
            isOrphan = !hasLivingParent;
        } else {
            var father = child.fatherId ? _getCharacterById(child.fatherId) : null;
            var mother = child.motherId ? _getCharacterById(child.motherId) : null;
            hasLivingParent = (father && !father.isDeceased) || (mother && !mother.isDeceased);
            isOrphan = !hasLivingParent;
        }
        
        if (statusFilter === 'orphan') {
            if (!isOrphan) return false;
        } else if (statusFilter === 'abandoned') {
            if (!child.abandoned && (child.fatherId || child.motherId)) return false;
        } else if (statusFilter === 'in_foster') {
            var hasActiveFoster = false;
            if (child.adoptedParents) {
                for (var j = 0; j < child.adoptedParents.length; j++) {
                    if (child.adoptedParents[j].type === 'foster' && child.adoptedParents[j].status !== 'ended') {
                        hasActiveFoster = true;
                        break;
                    }
                }
            }
            if (!hasActiveFoster) return false;
        }
        
        if (genderFilter !== 'all' && child.gender !== genderFilter) return false;
        
        if (locationFilter !== 'all') {
            var childLocation = _getCurrentLocation(child);
            if (childLocation !== locationFilter) return false;
        }
        
        if (searchTerm) {
            var searchLower = searchTerm.toLowerCase();
            var nameMatch = child.name.toLowerCase().indexOf(searchLower) !== -1 || 
                              (child.surname || '').toLowerCase().indexOf(searchLower) !== -1;
            if (!nameMatch) return false;
        }
        
        return true;
    }
    
    function getEligibleChildren() {
        var result = [];
        for (var i = 0; i < allChars.length; i++) {
            if (isEligibleForAdoption(allChars[i])) {
                result.push(allChars[i]);
            }
        }
        return result;
    }
    
    function renderChildList() {
        var eligible = getEligibleChildren();
        
        if (eligible.length === 0) {
            return '<div class="empty-state" style="text-align:center; padding:40px; color:var(--dim);">' + infoIcon + ' No adoptable children found matching your criteria</div>';
        }
        
        var html = '';
        for (var i = 0; i < eligible.length; i++) {
            var child = eligible[i];
            var age = _getAge(child);
            var location = _getCurrentLocation(child);
            var genderIcon = child.gender === 'male' ? '♂' : (child.gender === 'female' ? '♀' : '?');
            var isSelected = selectedChildId === child.id;
            
            // ================================================================
            // UPDATED: Get parent info using FamilyAccessors
            // ================================================================
            var fa = _getFamilyAccessors();
            var hasLivingParent = true;
            var parentNames = [];
            
            if (fa && typeof fa.getParents === 'function') {
                var parents = fa.getParents(child.id);
                if (parents.father) {
                    parentNames.push(parents.father.name);
                    if (!parents.father.isDeceased) hasLivingParent = false;
                }
                if (parents.mother) {
                    parentNames.push(parents.mother.name);
                    if (!parents.mother.isDeceased) hasLivingParent = false;
                }
            } else {
                if (child.fatherId) {
                    var father = _getCharacterById(child.fatherId);
                    if (father) {
                        parentNames.push(father.name);
                        if (!father.isDeceased) hasLivingParent = false;
                    }
                }
                if (child.motherId) {
                    var mother = _getCharacterById(child.motherId);
                    if (mother) {
                        parentNames.push(mother.name);
                        if (!mother.isDeceased) hasLivingParent = false;
                    }
                }
            }
            
            var isOrphan = parentNames.length === 0 || !hasLivingParent;
            
            var statusLabel = '';
            var statusColor = '';
            
            if (isOrphan) {
                statusLabel = infoIcon + ' Orphan';
                statusColor = '#c87040';
            } else if (child.abandoned) {
                statusLabel = householdIcon + ' Abandoned';
                statusColor = '#c84444';
            } else if (parentNames.length === 0) {
                statusLabel = infoIcon + ' No known parents';
                statusColor = '#c8a844';
            } else {
                statusLabel = checkIcon + ' Available';
                statusColor = '#4a9060';
            }
            
            var inFoster = false;
            if (child.adoptedParents) {
                for (var j = 0; j < child.adoptedParents.length; j++) {
                    if (child.adoptedParents[j].type === 'foster' && child.adoptedParents[j].status !== 'ended') {
                        inFoster = true;
                        break;
                    }
                }
            }
            var fosterBadge = inFoster ? '<span style="background: var(--accent-dim); padding: 2px 6px; border-radius: 10px; font-size: 0.5rem;">' + householdIcon + ' In Foster</span>' : '';
            
            var parentDisplay = parentNames.length > 0 ? ' · Parents: ' + parentNames.join(' & ') : ' · No known parents';
            
            html += '<div class="adoptable-child-card" data-child-id="' + child.id + '" style="' +
                'background: ' + (isSelected ? 'rgba(var(--accent-rgb), 0.2)' : 'var(--bg3)') + ';' +
                'border: 1px solid ' + (isSelected ? 'var(--accent)' : 'var(--border)') + ';' +
                'border-radius: 8px;' +
                'padding: 10px;' +
                'margin-bottom: 8px;' +
                'cursor: pointer;' +
                'transition: all 0.1s;' +
            '">' +
                '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px; margin-bottom: 6px;">' +
                    '<div>' +
                        '<strong>' + _escapeHtml(child.name) + ' ' + _escapeHtml(child.surname || '') + '</strong>' +
                        '<span style="font-size: 0.55rem; color: var(--dim); margin-left: 6px;">' + genderIcon + ' ' + age + 'y</span>' +
                        fosterBadge +
                    '</div>' +
                    '<div style="font-size: 0.55rem; color: ' + statusColor + ';">' + statusLabel + '</div>' +
                '</div>' +
                '<div style="display: flex; justify-content: space-between; font-size: 0.55rem; color: var(--dim);">' +
                    '<span>' + locationIcon + ' ' + _escapeHtml(location) + parentDisplay + '</span>' +
                    (child.notes ? '<span>' + infoIcon + ' ' + _escapeHtml(child.notes.substring(0, 50)) + (child.notes.length > 50 ? '...' : '') + '</span>' : '') +
                '</div>' +
                (isSelected ? '<div style="margin-top: 8px; color: var(--success); font-size: 0.55rem;">' + checkIcon + ' Selected</div>' : '') +
            '</div>';
        }
        return html;
    }
    
    function refreshChildList() {
        var container = document.getElementById('adoptableChildrenList');
        if (container) {
            container.innerHTML = renderChildList();
            
            var cards = document.querySelectorAll('.adoptable-child-card');
            for (var i = 0; i < cards.length; i++) {
                var card = cards[i];
                card.addEventListener('click', function() {
                    selectedChildId = this.dataset.childId;
                    refreshChildList();
                });
            }
        }
        
        var countSpan = document.getElementById('eligibleCount');
        if (countSpan) {
            countSpan.textContent = getEligibleChildren().length;
        }
    }
    
    var locationOptionsHtml = '<option value="all">All Locations</option>';
    for (var i = 0; i < locationOptions.length; i++) {
        var loc = locationOptions[i];
        locationOptionsHtml += '<option value="' + loc + '" ' + (locationFilter === loc ? 'selected' : '') + '>' + _escapeHtml(loc) + '</option>';
    }
    
    var modalContent = '<div class="info-box" style="margin-bottom: 16px; background: var(--bg2); padding: 12px; border-radius: 8px;">' +
        '<div style="font-weight: bold; margin-bottom: 8px;">Find Adoptable Children</div>' +
        '<div style="font-size: 0.65rem; color: var(--dim);">Search for children who need a loving home. <span id="eligibleCount">0</span> children match your criteria.</div>' +
    '</div>' +
    
    '<div class="filter-section" style="background: var(--bg3); padding: 12px; border-radius: 8px; margin-bottom: 16px;">' +
        '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 10px;">' +
            '<div class="form-group" style="margin-bottom: 0;">' +
                '<label style="display: block; font-size: 0.6rem; color: var(--accent); margin-bottom: 2px;">Min Age</label>' +
                '<input type="number" id="searchMinAge" value="' + minAge + '" min="0" max="100" style="width: 100%; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; color: var(--text);">' +
            '</div>' +
            '<div class="form-group" style="margin-bottom: 0;">' +
                '<label style="display: block; font-size: 0.6rem; color: var(--accent); margin-bottom: 2px;">Max Age</label>' +
                '<input type="number" id="searchMaxAge" value="' + maxAge + '" min="0" max="200" style="width: 100%; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; color: var(--text);">' +
            '</div>' +
            '<div class="form-group" style="margin-bottom: 0;">' +
                '<label style="display: block; font-size: 0.6rem; color: var(--accent); margin-bottom: 2px;">Gender</label>' +
                '<select id="searchGender" style="width: 100%; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; color: var(--text);">' +
                    '<option value="all" ' + (genderFilter === 'all' ? 'selected' : '') + '>All</option>' +
                    '<option value="male" ' + (genderFilter === 'male' ? 'selected' : '') + '>Male</option>' +
                    '<option value="female" ' + (genderFilter === 'female' ? 'selected' : '') + '>Female</option>' +
                '</select>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom: 0;">' +
                '<label style="display: block; font-size: 0.6rem; color: var(--accent); margin-bottom: 2px;">Status</label>' +
                '<select id="searchStatus" style="width: 100%; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; color: var(--text);">' +
                    '<option value="all" ' + (statusFilter === 'all' ? 'selected' : '') + '>All</option>' +
                    '<option value="orphan" ' + (statusFilter === 'orphan' ? 'selected' : '') + '>Orphan</option>' +
                    '<option value="abandoned" ' + (statusFilter === 'abandoned' ? 'selected' : '') + '>Abandoned</option>' +
                    '<option value="in_foster" ' + (statusFilter === 'in_foster' ? 'selected' : '') + '>In Foster Care</option>' +
                '</select>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom: 0;">' +
                '<label style="display: block; font-size: 0.6rem; color: var(--accent); margin-bottom: 2px;">Location</label>' +
                '<select id="searchLocation" style="width: 100%; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; color: var(--text);">' +
                    locationOptionsHtml +
                '</select>' +
            '</div>' +
        '</div>' +
        '<div class="form-group" style="margin-bottom: 0;">' +
            '<input type="text" id="searchName" placeholder="Search by name..." value="' + searchTerm + '" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; color: var(--text);">' +
        '</div>' +
        '<div class="action-buttons" style="margin-top: 10px; display: flex; gap: 8px;">' +
            '<button id="applyFiltersBtn" class="btn small" style="background: var(--accent-dim);">Apply Filters</button>' +
            '<button id="resetFiltersBtn" class="btn small">Clear</button>' +
        '</div>' +
    '</div>' +
    
    '<div id="adoptableChildrenList" style="max-height: 400px; overflow-y: auto;">' +
        renderChildList() +
    '</div>' +
    
    '<div class="info-note" style="margin-top: 12px; padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">' +
        infoIcon + ' Click on a child to select them, then choose an adoptive parent.' +
    '</div>';
    
    _openModal({
        title: 'Find Adoptable Children',
        content: modalContent,
        confirmText: selectedChildId ? 'Select Child' : 'Close',
        cancelText: 'Cancel',
        onConfirm: function() {
            if (selectedChildId && onSelect) {
                var child = _getCharacterById(selectedChildId);
                if (child) {
                    _closeTopModal();
                    onSelect(child);
                    return true;
                } else {
                    _showToast('Child not found', 'error');
                    return false;
                }
            } else if (!selectedChildId) {
                _showToast('Please select a child first', 'error');
                return false;
            } else {
                _closeTopModal();
                return true;
            }
        }
    });
    
    setTimeout(function() {
        var applyBtn = document.getElementById('applyFiltersBtn');
        var resetBtn = document.getElementById('resetFiltersBtn');
        var searchInput = document.getElementById('searchName');
        var minAgeInput = document.getElementById('searchMinAge');
        var maxAgeInput = document.getElementById('searchMaxAge');
        var genderSelect = document.getElementById('searchGender');
        var statusSelect = document.getElementById('searchStatus');
        var locationSelect = document.getElementById('searchLocation');
        
        var updateFiltersAndRender = function() {
            searchTerm = searchInput ? searchInput.value : '';
            minAge = parseInt(minAgeInput ? minAgeInput.value : 0) || 0;
            maxAge = parseInt(maxAgeInput ? maxAgeInput.value : 0) || 200;
            genderFilter = genderSelect ? genderSelect.value : 'all';
            statusFilter = statusSelect ? statusSelect.value : 'all';
            locationFilter = locationSelect ? locationSelect.value : 'all';
            refreshChildList();
        };
        
        if (applyBtn) {
            applyBtn.onclick = updateFiltersAndRender;
        }
        
        if (resetBtn) {
            resetBtn.onclick = function() {
                if (searchInput) searchInput.value = '';
                if (minAgeInput) minAgeInput.value = '0';
                if (maxAgeInput) maxAgeInput.value = '18';
                if (genderSelect) genderSelect.value = 'all';
                if (statusSelect) statusSelect.value = 'all';
                if (locationSelect) locationSelect.value = 'all';
                searchTerm = '';
                minAge = 0;
                maxAge = 18;
                genderFilter = 'all';
                statusFilter = 'all';
                locationFilter = 'all';
                refreshChildList();
            };
        }
        
        refreshChildList();
    }, 100);
}

// =============================================================================
// 12. LEGITIMIZE CHILD MODAL (UPDATED with FamilyAccessors)
// =============================================================================

function openLegitimizationModal(child, father, mother, onSuccess) {
    if (!child) {
        _showToast('Child not found', 'error');
        return;
    }
    
    if (!father && !mother) {
        _showToast('At least one parent is required for legitimization', 'error');
        return;
    }
    
    var currentYear = _getCurrentYear();
    var childAge = _getAge(child);
    var childName = (child.name + ' ' + (child.surname || '')).trim();
    
    var parentsMarried = false;
    var marriageYear = null;
    
    if (father && mother) {
        // ================================================================
        // UPDATED: Check if parents are married using FamilyAccessors
        // ================================================================
        var fa = _getFamilyAccessors();
        if (fa && typeof fa.getSpouses === 'function') {
            var spouses = fa.getSpouses(father.id, true);
            if (spouses) {
                for (var i = 0; i < spouses.length; i++) {
                    if (spouses[i].id === mother.id) {
                        parentsMarried = true;
                        // Try to get marriage year from relationship
                        var rel = _getRelationshipBetween(father.id, mother.id);
                        if (rel && rel.startYear) {
                            marriageYear = rel.startYear;
                        }
                        break;
                    }
                }
            }
        }
        
        if (!parentsMarried) {
            var relationship = _getFullRelationshipDescription(father.id, mother.id);
            if (relationship && relationship.indexOf('married') !== -1) {
                parentsMarried = true;
                var marriageRel = _getRelationshipBetween(father.id, mother.id);
                if (marriageRel && marriageRel.startYear) {
                    marriageYear = marriageRel.startYear;
                }
            }
        }
    }
    
    var birthYear = child.birthYear || (currentYear - childAge);
    var isBornBeforeMarriage = marriageYear && birthYear < marriageYear;
    
    var personIcon = _getIcon('PERSON');
    var infoIcon = _getIcon('CIRCLE_DOT');
    var warningIcon = _getIcon('WARNING');
    var locationIcon = _getIcon('LOCATION');
    var householdIcon = _getIcon('HOUSEHOLD');
    var checkIcon = _getIcon('CHECK_SIMPLE');
    var xIcon = _getIcon('X_HEAVY');
    var crownIcon = _getIcon('CROWN');
    
    var modalContent = '<div class="info-box" style="background: var(--bg3); padding: 12px; border-radius: 8px; margin-bottom: 16px;">' +
        '<div style="margin-bottom: 8px;">' +
            '<strong>' + personIcon + ' Child: ' + _escapeHtml(childName) + '</strong><br>' +
            (child.birthYear ? infoIcon + ' Born: ' + child.birthYear + ' (' + childAge + ' years old)' : infoIcon + ' Age: ' + childAge + ' years') +
        '</div>' +
        (father ? '<div><strong>Father:</strong> ' + _escapeHtml(father.name) + ' ' + _escapeHtml(father.surname || '') + '</div>' : '') +
        (mother ? '<div><strong>Mother:</strong> ' + _escapeHtml(mother.name) + ' ' + _escapeHtml(mother.surname || '') + '</div>' : '') +
        (father && mother ? '<div style="margin-top: 8px; padding: 6px; background: var(--bg2); border-radius: 6px;">' + 
            (parentsMarried ? 
                '<span style="color: var(--success);">' + checkIcon + ' Parents are married' + (marriageYear ? ' (since ' + marriageYear + ')' : '') + '</span>' : 
                '<span style="color: var(--warn);">' + warningIcon + ' Parents are not yet married</span>') + 
        '</div>' : '') +
        (isBornBeforeMarriage ? '<div style="margin-top: 8px; padding: 6px; background: rgba(200, 112, 64, 0.15); border-radius: 6px;">' + warningIcon + ' ' + childName + ' was born before parents married (' + birthYear + ' vs ' + marriageYear + ')</div>' : '') +
    '</div>' +
    
    '<div class="form-group" style="margin-bottom: 12px;">' +
        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Year of Legitimization</label>' +
        '<input type="number" id="legitimizationYear" value="' + currentYear + '" min="' + (child.birthYear || 1) + '" max="' + (currentYear + 5) + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">' +
        '<small style="font-size: 0.55rem;">When was the child declared legitimate?</small>' +
    '</div>' +
    
    '<div class="form-group" style="margin-bottom: 12px;">' +
        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Change Surname?</label>' +
        '<select id="changeSurname" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">' +
            '<option value="none">Keep current surname (' + _escapeHtml(child.surname || 'Unknown') + ')</option>' +
            (father ? '<option value="father">Change to father\'s surname (' + _escapeHtml(father.surname || 'Unknown') + ')</option>' : '') +
            (mother ? '<option value="mother">Change to mother\'s surname (' + _escapeHtml(mother.surname || 'Unknown') + ')</option>' : '') +
            (father && mother && father.surname !== mother.surname ? '<option value="hyphenated">Hyphenated (' + _escapeHtml(father.surname || '') + '-' + _escapeHtml(mother.surname || '') + ')</option>' : '') +
        '</select>' +
    '</div>' +
    
    '<div class="form-group" style="margin-bottom: 12px;">' +
        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Grant Inheritance Rights?</label>' +
        '<select id="inheritanceRights" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">' +
            '<option value="full">Full inheritance rights</option>' +
            '<option value="limited">Limited inheritance (after legitimate children)</option>' +
            '<option value="none">No inheritance rights</option>' +
        '</select>' +
    '</div>' +
    
    '<div class="form-group" style="margin-bottom: 12px;">' +
        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Household Assignment</label>' +
        '<select id="legitimizationHouseholdChoice" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">' +
            '<option value="parents">Add child to parent(s)\' household</option>' +
            '<option value="separate">Child starts independent household</option>' +
            '<option value="none">No household change</option>' +
        '</select>' +
        '<small style="font-size: 0.55rem;">Where will the child live after legitimization?</small>' +
    '</div>' +
    
    '<div class="form-group" style="margin-bottom: 12px;">' +
        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes (optional)</label>' +
        '<textarea id="legitimizationNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);" placeholder="e.g., Child born before marriage, now legitimized"></textarea>' +
    '</div>' +
    
    '<div class="info-note" style="margin-top: 12px; padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">' +
        'Legitimization declares a child as legitimate heir, often granting inheritance and succession rights.' +
        (!parentsMarried ? ' Parents should marry first for full legitimization.' : '') +
    '</div>';
    
    _openModal({
        title: crownIcon + ' Legitimize Child: ' + child.name,
        content: modalContent,
        confirmText: 'Legitimize Child',
        cancelText: 'Cancel',
        onConfirm: function() {
            var legitimizationYear = parseInt(document.getElementById('legitimizationYear') ? document.getElementById('legitimizationYear').value : 0);
            var changeSurname = document.getElementById('changeSurname') ? document.getElementById('changeSurname').value : 'none';
            var inheritanceRights = document.getElementById('inheritanceRights') ? document.getElementById('inheritanceRights').value : 'full';
            var householdChoice = document.getElementById('legitimizationHouseholdChoice') ? document.getElementById('legitimizationHouseholdChoice').value : 'parents';
            var notes = document.getElementById('legitimizationNotes') ? document.getElementById('legitimizationNotes').value : '';
            
            if (isNaN(legitimizationYear)) {
                _showToast('Invalid year', 'error');
                return false;
            }
            
            var oldSurname = child.surname;
            if (changeSurname === 'father' && father) {
                child.surname = father.surname;
            } else if (changeSurname === 'mother' && mother) {
                child.surname = mother.surname;
            } else if (changeSurname === 'hyphenated' && father && mother) {
                child.surname = (father.surname || '') + '-' + (mother.surname || '');
            }
            
            if (!child.legitimization) {
                child.legitimization = [];
            }
            
            var legitimizationRecord = {
                year: legitimizationYear,
                declaredBy: father ? father.name : (mother ? mother.name : 'Parents'),
                inheritanceRights: inheritanceRights,
                notes: notes || (changeSurname !== 'none' ? 'Surname changed from ' + oldSurname + ' to ' + child.surname : '')
            };
            
            if (father && mother) {
                legitimizationRecord.fatherId = father.id;
                legitimizationRecord.motherId = mother.id;
                legitimizationRecord.parentsMarried = parentsMarried;
            } else if (father) {
                legitimizationRecord.fatherId = father.id;
            } else if (mother) {
                legitimizationRecord.motherId = mother.id;
            }
            
            child.legitimization.push(legitimizationRecord);
            child.isLegitimate = true;
            child.legitimizedYear = legitimizationYear;
            child.inheritanceRights = inheritanceRights;
            
            // ================================================================
            // UPDATED: Set parents using FamilyAccessors if available
            // ================================================================
            var fa = _getFamilyAccessors();
            if (fa && typeof fa.setParent === 'function') {
                if (father && !child.fatherId) {
                    fa.setParent(child.id, father.id, 'father', {
                        biological: true,
                        startYear: legitimizationYear,
                        notes: 'Legitimized in ' + legitimizationYear
                    });
                }
                if (mother && !child.motherId) {
                    fa.setParent(child.id, mother.id, 'mother', {
                        biological: true,
                        startYear: legitimizationYear,
                        notes: 'Legitimized in ' + legitimizationYear
                    });
                }
            } else {
                // Fallback: direct data access
                if (father && !child.fatherId) {
                    child.fatherId = father.id;
                    if (!father.children) father.children = [];
                    if (father.children.indexOf(child.id) === -1) father.children.push(child.id);
                }
                if (mother && !child.motherId) {
                    child.motherId = mother.id;
                    if (!mother.children) mother.children = [];
                    if (mother.children.indexOf(child.id) === -1) mother.children.push(child.id);
                }
            }
            
            // ================================================================
            // UPDATED: Household assignment using FamilyAccessors
            // ================================================================
            if (householdChoice === 'parents') {
                var addedHouseholds = new Set();
                
                if (father) {
                    var fatherHousehold = _getCharacterHouseholdViaFamilyAccessors(father.id);
                    if (!fatherHousehold) {
                        fatherHousehold = _getCharacterHousehold(father.id);
                    }
                    if (fatherHousehold && !addedHouseholds.has(fatherHousehold.id)) {
                        var previousHousehold = _getCharacterHouseholdViaFamilyAccessors(child.id);
                        if (!previousHousehold) {
                            previousHousehold = _getCharacterHousehold(child.id);
                        }
                        if (previousHousehold && previousHousehold.id !== fatherHousehold.id) {
                            _recordHouseholdChange(child.id, null, legitimizationYear, 'left',
                                'Left previous household before legitimization',
                                { previousHouseholdId: previousHousehold.id, previousHouseholdName: previousHousehold.name });
                        }
                        
                        _addHouseholdMember(fatherHousehold.id, child.id, 'family', {
                            role: 'Child',
                            joinedYear: legitimizationYear,
                            notes: 'Legitimized child'
                        });
                        
                        _recordHouseholdChange(child.id, fatherHousehold.id, legitimizationYear, 'joined',
                            'Legitimized child moved to ' + father.name + '\'s household',
                            { newRole: 'Child' });
                        
                        addedHouseholds.add(fatherHousehold.id);
                    }
                }
                
                if (mother && (!father || mother.id !== father.id)) {
                    var motherHousehold = _getCharacterHouseholdViaFamilyAccessors(mother.id);
                    if (!motherHousehold) {
                        motherHousehold = _getCharacterHousehold(mother.id);
                    }
                    if (motherHousehold && !addedHouseholds.has(motherHousehold.id)) {
                        var previousHousehold = _getCharacterHouseholdViaFamilyAccessors(child.id);
                        if (!previousHousehold) {
                            previousHousehold = _getCharacterHousehold(child.id);
                        }
                        if (previousHousehold && previousHousehold.id !== motherHousehold.id && !addedHouseholds.has(previousHousehold.id)) {
                            _recordHouseholdChange(child.id, null, legitimizationYear, 'left',
                                'Left previous household before legitimization',
                                { previousHouseholdId: previousHousehold.id, previousHouseholdName: previousHousehold.name });
                        }
                        
                        _addHouseholdMember(motherHousehold.id, child.id, 'family', {
                            role: 'Child',
                            joinedYear: legitimizationYear,
                            notes: 'Legitimized child'
                        });
                        
                        _recordHouseholdChange(child.id, motherHousehold.id, legitimizationYear, 'joined',
                            'Legitimized child moved to ' + mother.name + '\'s household',
                            { newRole: 'Child' });
                        
                        addedHouseholds.add(motherHousehold.id);
                    }
                }
            } else if (householdChoice === 'separate') {
                if (typeof window.createHousehold === 'function') {
                    var location = (father && _getCurrentLocation(father)) || (mother && _getCurrentLocation(mother)) || _getCurrentLocation(child);
                    var childHousehold = window.createHousehold(child.name + '\'s Household', location, {
                        foundedYear: legitimizationYear,
                        notes: 'Created via legitimization'
                    });
                    if (childHousehold) {
                        var previousHousehold = _getCharacterHouseholdViaFamilyAccessors(child.id);
                        if (!previousHousehold) {
                            previousHousehold = _getCharacterHousehold(child.id);
                        }
                        if (previousHousehold) {
                            _recordHouseholdChange(child.id, null, legitimizationYear, 'left',
                                'Left previous household before legitimization',
                                { previousHouseholdId: previousHousehold.id, previousHouseholdName: previousHousehold.name });
                        }
                        
                        _addHouseholdMember(childHousehold.id, child.id, 'family', {
                            role: 'Head of Household',
                            joinedYear: legitimizationYear,
                            isHead: true,
                            notes: 'Created via legitimization'
                        });
                        
                        _recordHouseholdChange(child.id, childHousehold.id, legitimizationYear, 'created',
                            'Created independent household due to legitimization',
                            { newRole: 'Head of Household' });
                    }
                }
            }
            
            _saveMasterData();
            
            var successMsg = child.name + ' has been legitimized';
            if (changeSurname !== 'none') {
                successMsg += ' and now bears the surname ' + child.surname;
            }
            _showToast(successMsg, 'success');
            
            if (inheritanceRights === 'full') {
                _showToast(child.name + ' now has full inheritance rights', 'info');
            } else if (inheritanceRights === 'limited') {
                _showToast(child.name + ' has limited inheritance rights', 'info');
            }
            
            if (onSuccess) onSuccess();
            _closeTopModal();
            return true;
        }
    });
}

// =============================================================================
// 13. EXPORTS
// =============================================================================

window.openSetBirthParentsModal = openSetBirthParentsModal;
window.openCreateAdoptionModal = openCreateAdoptionModal;
window.openEditAdoptionModal = openEditAdoptionModal;
window.openRemoveAdoptionModal = openRemoveAdoptionModal;
window.openAdoptionSearchModal = openAdoptionSearchModal;
window.openLegitimizationModal = openLegitimizationModal;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ADOPTION_CONSTANTS: ADOPTION_CONSTANTS,
        openSetBirthParentsModal: openSetBirthParentsModal,
        openCreateAdoptionModal: openCreateAdoptionModal,
        openEditAdoptionModal: openEditAdoptionModal,
        openRemoveAdoptionModal: openRemoveAdoptionModal,
        openAdoptionSearchModal: openAdoptionSearchModal,
        openLegitimizationModal: openLegitimizationModal
    };
}