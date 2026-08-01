/**
 * =============================================================================
 * STILL WATERS - SURROGACY MODALS (js/core/modals/modals-surrogacy.js)
 * =============================================================================
 * 
 * UPDATED:
 * - Uses SurrogacyService for all surrogacy operations
 * - Uses ChildrenCommands for child creation
 * - Uses ChildrenQueries for queries
 * - Uses unified character selector from modals-core.js
 * - Uses AGE_GROUPS from constants.js (NO EMOJIS)
 * - SVG icons from icons.js
 * - No trust/loyalty references
 * - Simple text confirm buttons (no SVG leaks)
 * - UPDATED: Uses FamilyAccessors for family relationship queries
 * - UPDATED: Better relationship detection for surrogacy arrangements
 * 
 * CONTAINS:
 * - openDonorSelectionModal - Select sperm donor
 * - openSurrogateSelectionModal - Select surrogate
 * - openIntendedParentSelectModal - Select intended parent
 * - openSurrogacyAgreementModal - Legacy surrogacy agreement
 * - openCompleteSurrogacyModal - Complete surrogacy arrangement
 * - openSwapConfirmationModal - Confirm swap arrangement
 * 
 * =============================================================================
 */

// =============================================================================
// 1. ICON HELPERS (using icons.js - NO EMOJIS)
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
// 2. AGE GROUPS FROM CONSTANTS.JS
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

// =============================================================================
// 3. DEPENDENCY WRAPPERS
// =============================================================================

function _escapeHtml(str) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
    if (typeof window.getCharacterById === 'function') return window.getCharacterById(id);
    return null;
}

function _getCharacters() {
    if (typeof window.getCharacters === 'function') return window.getCharacters();
    return [];
}

function _calculateAge(birthYear, isDeceased, deathYear) {
    if (typeof window.calculateAge === 'function') return window.calculateAge(birthYear, isDeceased, deathYear);
    var currentYear = _getCurrentYear();
    if (!birthYear) return 0;
    if (isDeceased && deathYear) return Math.max(0, deathYear - birthYear);
    return Math.max(0, currentYear - birthYear);
}

function _getCurrentLocation(character) {
    if (typeof window.getCurrentLocation === 'function') return window.getCurrentLocation(character);
    return 'Unknown';
}

function _getActiveRankDisplay(character) {
    if (typeof window.getActiveRankDisplay === 'function') return window.getActiveRankDisplay(character);
    return null;
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

// =============================================================================
// 4. FAMILY ACCESSORS WRAPPER (NEW)
// =============================================================================

function _getFamilyAccessors() {
    return typeof window.FamilyAccessors !== 'undefined' ? window.FamilyAccessors : null;
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

function _getParentsViaFamilyAccessors(childId) {
    var fa = _getFamilyAccessors();
    if (fa && typeof fa.getParents === 'function') {
        return fa.getParents(childId);
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

function _getGrandparentsViaFamilyAccessors(childId, generation) {
    var fa = _getFamilyAccessors();
    if (fa && typeof fa.getGrandparents === 'function') {
        return fa.getGrandparents(childId, generation || 1);
    }
    return null;
}

function _getGrandchildrenViaFamilyAccessors(parentId, includeDeceased) {
    var fa = _getFamilyAccessors();
    if (fa && typeof fa.getGrandchildren === 'function') {
        return fa.getGrandchildren(parentId, includeDeceased || false);
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

function _getFamilyStatisticsViaFamilyAccessors(characterId) {
    var fa = _getFamilyAccessors();
    if (fa && typeof fa.getFamilyStatistics === 'function') {
        return fa.getFamilyStatistics(characterId);
    }
    return null;
}

// =============================================================================
// 5. CHILDREN SYSTEM WRAPPERS
// =============================================================================

function _createSurrogacyArrangement(intendedParent, surrogate, options) {
    if (typeof window.SurrogacyService !== 'undefined') {
        return window.SurrogacyService.createSurrogacyArrangement(intendedParent, surrogate, options);
    }
    if (typeof window.createSurrogacyArrangement === 'function') {
        return window.createSurrogacyArrangement(intendedParent, surrogate, options);
    }
    return null;
}

function _createSwapArrangements(femaleCouple, maleCouple, options) {
    if (typeof window.SurrogacyService !== 'undefined') {
        return window.SurrogacyService.createSwapArrangements(femaleCouple, maleCouple, options);
    }
    if (typeof window.createSwapArrangements === 'function') {
        return window.createSwapArrangements(femaleCouple, maleCouple, options);
    }
    return null;
}

function _getSurrogacyRecords() {
    if (typeof window.SurrogacyService !== 'undefined') {
        return window.SurrogacyService.getSurrogacyArrangements();
    }
    if (typeof window.getSurrogacyArrangements === 'function') {
        return window.getSurrogacyArrangements();
    }
    return [];
}

function _getSurrogacyRecordsForCharacter(characterId) {
    if (typeof window.SurrogacyService !== 'undefined') {
        return window.SurrogacyService.getSurrogacyArrangementsForCharacter(characterId);
    }
    if (typeof window.getSurrogacyArrangementsForCharacter === 'function') {
        return window.getSurrogacyArrangementsForCharacter(characterId);
    }
    return [];
}

function _recordBirth(mother, father, birthYear, options) {
    if (typeof window.ChildrenCommands !== 'undefined') {
        return window.ChildrenCommands.recordBirth(mother, father, birthYear, options);
    }
    return null;
}

function _getChildren(characterId) {
    if (typeof window.FamilyLogic !== 'undefined') {
        return window.FamilyLogic.getChildren(characterId);
    }
    if (typeof window.getChildren === 'function') {
        return window.getChildren(characterId);
    }
    return [];
}

// =============================================================================
// 6. CHARACTER SELECTOR - Uses unified selector
// =============================================================================

function _openCharacterSelectorForSurrogacy(title, onSelect, options) {
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
        return;
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
        return;
    }
    
    if (typeof window.openCharacterSelectModal === 'function') {
        window.openCharacterSelectModal({
            title: title || 'Select Character',
            targetCharacterId: options.targetId || null,
            onSelect: onSelect,
            includeDeceased: options.showDeceased || false
        });
        return;
    }
    
    _showToast('Character selector not available', 'error');
}

// =============================================================================
// 7. HELPER FUNCTIONS (UPDATED with FamilyAccessors)
// =============================================================================

function _areRelated(char1Id, char2Id) {
    // Prefer FamilyAccessors
    var faResult = _getRelationshipDescriptionViaFamilyAccessors(char1Id, char2Id);
    if (faResult !== null && faResult !== 'Unrelated' && faResult !== 'Unknown') {
        return true;
    }
    
    var consanguinity = _getConsanguinityDegreeViaFamilyAccessors(char1Id, char2Id);
    if (consanguinity !== null && consanguinity < 99) {
        return true;
    }
    
    // Fallback: manual check
    var char1 = _getCharacterById(char1Id);
    var char2 = _getCharacterById(char2Id);
    if (!char1 || !char2) return false;
    
    if (char1Id === char2Id) return true;
    if (char1.motherId === char2Id || char1.fatherId === char2Id) return true;
    if (char2.motherId === char1Id || char2.fatherId === char1Id) return true;
    if (char1.motherId && char1.motherId === char2.motherId) return true;
    if (char1.fatherId && char1.fatherId === char2.fatherId) return true;
    if (char1.children && char1.children.indexOf(char2Id) !== -1) return true;
    if (char2.children && char2.children.indexOf(char1Id) !== -1) return true;
    
    return false;
}

function _getRelationshipsForCharacter(characterId) {
    var character = _getCharacterById(characterId);
    if (!character) return [];
    return character.relationships || [];
}

function _getPotentialSpermDonors(coupleLocation, avgAge, filters) {
    var characters = _getCharacters();
    var fa = _getFamilyAccessors();
    
    var donors = [];
    for (var i = 0; i < characters.length; i++) {
        var c = characters[i];
        if (c.gender !== 'male') continue;
        if (!filters.showDeceased && c.isDeceased) continue;
        var age = _calculateAge(c.birthYear, false, null);
        if (age < 14) continue;
        if (age > 80) continue;
        donors.push(c);
    }
    
    var filteredDonors = [];
    for (var i = 0; i < donors.length; i++) {
        var d = donors[i];
        
        if (filters.sameLocationOnly) {
            var donorLocation = _getCurrentLocation(d);
            if (donorLocation !== coupleLocation) continue;
        }
        
        if (filters.peersOnly && avgAge > 0) {
            var donorAge = _calculateAge(d.birthYear, false, null);
            if (Math.abs(donorAge - avgAge) > 20) continue;
        }
        
        if (filters.showOnlySingle) {
            // ================================================================
            // UPDATED: Use FamilyAccessors for spouse detection
            // ================================================================
            var hasOngoingRomance = false;
            if (fa && typeof fa.getSpouses === 'function') {
                var spouses = fa.getSpouses(d.id, true);
                if (spouses && spouses.length > 0) {
                    hasOngoingRomance = true;
                }
            }
            
            if (!hasOngoingRomance) {
                var relationships = _getRelationshipsForCharacter(d.id);
                for (var j = 0; j < relationships.length; j++) {
                    var r = relationships[j];
                    if (r.status === 'ongoing' && (r.type === 'committed' || r.type === 'romance' || r.type === 'marriage')) {
                        hasOngoingRomance = true;
                        break;
                    }
                }
            }
            
            if (hasOngoingRomance) continue;
        }
        
        if (filters.searchTerm) {
            var searchLower = filters.searchTerm.toLowerCase();
            var nameMatch = d.name.toLowerCase().indexOf(searchLower) !== -1 || (d.surname || '').toLowerCase().indexOf(searchLower) !== -1;
            if (!nameMatch) continue;
        }
        
        filteredDonors.push(d);
    }
    
    if (filteredDonors.length === 0) {
        for (var i = 0; i < characters.length && filteredDonors.length < 20; i++) {
            var c = characters[i];
            if (c.gender !== 'male') continue;
            if (!filters.showDeceased && c.isDeceased) continue;
            var age = _calculateAge(c.birthYear, false, null);
            if (age < 14 || age > 80) continue;
            filteredDonors.push(c);
        }
    }
    
    filteredDonors.sort(function(a, b) { return (a.birthYear || 0) - (b.birthYear || 0); });
    return filteredDonors;
}

function _getPotentialSurrogates(coupleLocation, avgAge, filters) {
    var characters = _getCharacters();
    var fa = _getFamilyAccessors();
    
    var surrogates = [];
    for (var i = 0; i < characters.length; i++) {
        var c = characters[i];
        if (c.gender !== 'female') continue;
        if (!filters.showDeceased && c.isDeceased) continue;
        var age = _calculateAge(c.birthYear, false, null);
        if (age < 14) continue;
        if (age > 55) continue;
        surrogates.push(c);
    }
    
    var filteredSurrogates = [];
    for (var i = 0; i < surrogates.length; i++) {
        var s = surrogates[i];
        
        if (filters.sameLocationOnly) {
            var surrogateLocation = _getCurrentLocation(s);
            if (surrogateLocation !== coupleLocation) continue;
        }
        
        if (filters.peersOnly && avgAge > 0) {
            var surrogateAge = _calculateAge(s.birthYear, false, null);
            if (Math.abs(surrogateAge - avgAge) > 20) continue;
        }
        
        if (filters.showOnlySingle) {
            // ================================================================
            // UPDATED: Use FamilyAccessors for spouse detection
            // ================================================================
            var hasOngoingRomance = false;
            if (fa && typeof fa.getSpouses === 'function') {
                var spouses = fa.getSpouses(s.id, true);
                if (spouses && spouses.length > 0) {
                    hasOngoingRomance = true;
                }
            }
            
            if (!hasOngoingRomance) {
                var relationships = _getRelationshipsForCharacter(s.id);
                for (var j = 0; j < relationships.length; j++) {
                    var r = relationships[j];
                    if (r.status === 'ongoing' && (r.type === 'committed' || r.type === 'romance' || r.type === 'marriage')) {
                        hasOngoingRomance = true;
                        break;
                    }
                }
            }
            
            if (hasOngoingRomance) continue;
        }
        
        if (filters.searchTerm) {
            var searchLower = filters.searchTerm.toLowerCase();
            var nameMatch = s.name.toLowerCase().indexOf(searchLower) !== -1 || (s.surname || '').toLowerCase().indexOf(searchLower) !== -1;
            if (!nameMatch) continue;
        }
        
        // ================================================================
        // NEW: Check if surrogate has children (for experience info)
        // ================================================================
        var hasChildren = false;
        var childCount = 0;
        if (fa && typeof fa.hasChildren === 'function') {
            hasChildren = fa.hasChildren(s.id, true, false);
            if (hasChildren) {
                var children = fa.getAllChildren(s.id, false);
                if (children) childCount = children.length;
            }
        }
        
        filteredSurrogates.push({
            character: s,
            hasChildren: hasChildren,
            childCount: childCount
        });
    }
    
    if (filteredSurrogates.length === 0) {
        for (var i = 0; i < characters.length && filteredSurrogates.length < 20; i++) {
            var c = characters[i];
            if (c.gender !== 'female') continue;
            if (!filters.showDeceased && c.isDeceased) continue;
            var age = _calculateAge(c.birthYear, false, null);
            if (age < 14 || age > 55) continue;
            filteredSurrogates.push({
                character: c,
                hasChildren: false,
                childCount: 0
            });
        }
    }
    
    filteredSurrogates.sort(function(a, b) {
        return (a.character.birthYear || 0) - (b.character.birthYear || 0);
    });
    return filteredSurrogates;
}

// =============================================================================
// 8. DONOR SELECTION MODAL (UPDATED with FamilyAccessors)
// =============================================================================

function openDonorSelectionModal(couple, onSuccess) {
    var currentFilters = { 
        showDeceased: false,
        sameLocationOnly: false,
        peersOnly: false,
        showOnlySingle: true,
        searchTerm: ''
    };
    var selectedDonorId = null;
    
    var coupleLocation = couple.location || _getCurrentLocation(couple.person1 || couple.person);
    var avgAge = couple.person2 
        ? (_calculateAge(couple.person1.birthYear, false, null) + _calculateAge(couple.person2.birthYear, false, null)) / 2
        : _calculateAge(couple.person.birthYear, false, null);
    
    var personIcon = _getIcon('PERSON');
    var locationIcon = _getIcon('LOCATION');
    var infoIcon = _getIcon('CIRCLE_DOT');
    var checkIcon = _getIcon('CHECK_SIMPLE');
    var searchIcon = _getIcon('SEARCH');
    var warningIcon = _getIcon('WARNING');
    
    function renderDonorList() {
        var donors = _getPotentialSpermDonors(coupleLocation, avgAge, currentFilters);
        
        if (donors.length === 0) {
            return '<div class="empty-state" style="text-align:center; padding:20px; color:var(--dim);">No eligible donors found. Try adjusting filters.</div>';
        }
        
        var html = '';
        for (var i = 0; i < donors.length; i++) {
            var donor = donors[i];
            var age = _calculateAge(donor.birthYear, false, null);
            var location = _getCurrentLocation(donor);
            var rank = _getActiveRankDisplay(donor);
            
            // ================================================================
            // UPDATED: Check if related using FamilyAccessors
            // ================================================================
            var isRelated = false;
            var relation = null;
            var fa = _getFamilyAccessors();
            
            if (fa && typeof fa.getRelationshipDescription === 'function') {
                relation = fa.getRelationshipDescription(couple.person1?.id || couple.person?.id, donor.id);
                if (relation && relation !== 'Unrelated' && relation !== 'Unknown') {
                    isRelated = true;
                }
            }
            
            if (!isRelated && couple.person2) {
                if (fa && typeof fa.getRelationshipDescription === 'function') {
                    relation = fa.getRelationshipDescription(couple.person2.id, donor.id);
                    if (relation && relation !== 'Unrelated' && relation !== 'Unknown') {
                        isRelated = true;
                    }
                }
            }
            
            if (!isRelated) {
                isRelated = _areRelated(couple.person1?.id || couple.person?.id, donor.id) || 
                           (couple.person2 && _areRelated(couple.person2.id, donor.id));
            }
            
            var isSelected = selectedDonorId === donor.id;
            
            var rankText = rank ? '<span style="color: var(--accent); font-size: 0.6rem;">' + _escapeHtml(rank.display) + '</span> ' : '';
            var relatedBadge = isRelated ? '<span style="background: var(--warn); padding: 2px 5px; border-radius: 10px; font-size: 0.5rem; margin-left: 5px;">' + warningIcon + ' ' + _escapeHtml(relation || 'Relative') + '</span>' : '';
            
            html += '<div class="donor-card-item" data-donor-id="' + donor.id + '" style="' +
                'background: ' + (isSelected ? 'var(--accent-dim)' : 'var(--bg3)') + ';' +
                'border: 1px solid ' + (isSelected ? 'var(--accent)' : (isRelated ? 'var(--warn, #c87040)' : 'var(--border)')) + ';' +
                'border-radius: 4px;' +
                'padding: 8px 10px;' +
                'margin-bottom: 6px;' +
                'cursor: pointer;' +
            '">' +
                '<div style="display: flex; justify-content: space-between; align-items: center;">' +
                    '<div>' +
                        rankText +
                        '<strong style="font-size: 0.7rem;">' + _escapeHtml(donor.name) + ' ' + _escapeHtml(donor.surname || '') + '</strong>' +
                        '<span style="color: var(--dim); font-size: 0.55rem;">(' + age + 'y)</span>' +
                        relatedBadge +
                    '</div>' +
                    '<div style="font-size: 0.55rem; color: var(--dim);">' + _escapeHtml(location) + '</div>' +
                '</div>' +
            '</div>';
        }
        return html;
    }
    
    var modalContent = 
        '<div style="margin-bottom: 12px;">' +
            '<div class="info-box" style="background: var(--bg2); padding: 8px; border-radius: 6px; margin-bottom: 12px;">' +
                '<div style="font-size: 0.65rem;"><strong>Couple:</strong> ' + _escapeHtml(couple.person1?.name || couple.person?.name) + (couple.person2 ? ' & ' + _escapeHtml(couple.person2.name) : '') + '</div>' +
                '<div style="font-size: 0.6rem; color: var(--dim);">' + _escapeHtml(coupleLocation) + '</div>' +
            '</div>' +
            
            '<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; padding: 8px; background: var(--bg2); border-radius: 6px;">' +
                '<label style="font-size: 0.6rem; display: flex; align-items: center; gap: 4px;">' +
                    '<input type="checkbox" id="donorShowDeceased" ' + (currentFilters.showDeceased ? 'checked' : '') + '> Show Deceased' +
                '</label>' +
                '<label style="font-size: 0.6rem; display: flex; align-items: center; gap: 4px;">' +
                    '<input type="checkbox" id="donorSameLocation" ' + (currentFilters.sameLocationOnly ? 'checked' : '') + '> Same Location' +
                '</label>' +
                '<label style="font-size: 0.6rem; display: flex; align-items: center; gap: 4px;">' +
                    '<input type="checkbox" id="donorPeersOnly" ' + (currentFilters.peersOnly ? 'checked' : '') + '> Peers (plus/minus 20y)' +
                '</label>' +
                '<label style="font-size: 0.6rem; display: flex; align-items: center; gap: 4px;">' +
                    '<input type="checkbox" id="donorShowOnlySingle" ' + (currentFilters.showOnlySingle ? 'checked' : '') + '> Single Only' +
                '</label>' +
                '<input type="text" id="donorSearch" placeholder="Search..." value="' + _escapeHtml(currentFilters.searchTerm) + '" style="flex:1; min-width: 100px; padding: 4px 6px; font-size: 0.6rem; background: var(--bg); border: 1px solid var(--border); border-radius: 4px;">' +
            '</div>' +
            
            '<div id="donorListContainer" style="max-height: 400px; overflow-y: auto; margin-bottom: 12px;">' +
                renderDonorList() +
            '</div>' +
            
            '<div style="display: flex; gap: 10px;">' +
                '<button id="confirmDonorBtn" class="btn primary" style="flex:2; padding: 8px; font-size: 0.65rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 4px; cursor: pointer;" disabled>Confirm Donor</button>' +
                '<button id="cancelDonorBtn" class="btn" style="flex:1; padding: 8px; font-size: 0.65rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Cancel</button>' +
            '</div>' +
        '</div>';
    
    _openModal({
        title: 'Select Sperm Donor',
        content: modalContent,
        confirmText: '',
        cancelText: ''
    });
    
    setTimeout(function() {
        var listContainer = document.getElementById('donorListContainer');
        if (listContainer) {
            listContainer.onclick = function(e) {
                var donorCard = e.target.closest('.donor-card-item');
                if (donorCard) {
                    var donorId = donorCard.dataset.donorId;
                    selectedDonorId = donorId;
                    
                    document.querySelectorAll('.donor-card-item').forEach(function(card) {
                        card.style.background = 'var(--bg3)';
                        card.style.borderColor = 'var(--border)';
                    });
                    donorCard.style.background = 'var(--accent-dim)';
                    donorCard.style.borderColor = 'var(--accent)';
                    
                    var confirmBtn = document.getElementById('confirmDonorBtn');
                    if (confirmBtn) confirmBtn.disabled = false;
                }
            };
        }
        
        var showDeceased = document.getElementById('donorShowDeceased');
        var sameLocation = document.getElementById('donorSameLocation');
        var peersOnly = document.getElementById('donorPeersOnly');
        var showOnlySingle = document.getElementById('donorShowOnlySingle');
        var searchInput = document.getElementById('donorSearch');
        
        var refreshList = function() {
            currentFilters.showDeceased = showDeceased?.checked || false;
            currentFilters.sameLocationOnly = sameLocation?.checked || false;
            currentFilters.peersOnly = peersOnly?.checked || false;
            currentFilters.showOnlySingle = showOnlySingle?.checked || false;
            currentFilters.searchTerm = searchInput?.value || '';
            
            var container = document.getElementById('donorListContainer');
            if (container) {
                container.innerHTML = renderDonorList();
                setTimeout(function() {
                    if (listContainer) {
                        listContainer.onclick = function(e) {
                            var donorCard = e.target.closest('.donor-card-item');
                            if (donorCard) {
                                var donorId = donorCard.dataset.donorId;
                                selectedDonorId = donorId;
                                document.querySelectorAll('.donor-card-item').forEach(function(card) {
                                    card.style.background = 'var(--bg3)';
                                    card.style.borderColor = 'var(--border)';
                                });
                                donorCard.style.background = 'var(--accent-dim)';
                                donorCard.style.borderColor = 'var(--accent)';
                                var confirmBtn = document.getElementById('confirmDonorBtn');
                                if (confirmBtn) confirmBtn.disabled = false;
                            }
                        };
                    }
                }, 50);
            }
        };
        
        if (showDeceased) showDeceased.onchange = refreshList;
        if (sameLocation) sameLocation.onchange = refreshList;
        if (peersOnly) peersOnly.onchange = refreshList;
        if (showOnlySingle) showOnlySingle.onchange = refreshList;
        if (searchInput) searchInput.oninput = refreshList;
        
        var confirmBtn = document.getElementById('confirmDonorBtn');
        if (confirmBtn) {
            confirmBtn.onclick = function() {
                if (selectedDonorId) {
                    var donor = _getCharacterById(selectedDonorId);
                    if (donor) {
                        _closeTopModal();
                        if (onSuccess) onSuccess(donor);
                    } else {
                        _showToast('Donor not found', 'error');
                    }
                } else {
                    _showToast('Please select a donor first', 'error');
                }
            };
        }
        
        var cancelBtn = document.getElementById('cancelDonorBtn');
        if (cancelBtn) {
            cancelBtn.onclick = function() {
                _closeTopModal();
            };
        }
    }, 100);
}

// =============================================================================
// 9. SURROGATE SELECTION MODAL (UPDATED with FamilyAccessors)
// =============================================================================

function openSurrogateSelectionModal(couple, onSuccess) {
    var currentFilters = { 
        showDeceased: false,
        sameLocationOnly: false,
        peersOnly: false,
        showOnlySingle: true,
        searchTerm: ''
    };
    var selectedSurrogateId = null;
    
    var coupleLocation = couple.location || _getCurrentLocation(couple.person1 || couple.person);
    var avgAge = couple.person2 
        ? (_calculateAge(couple.person1.birthYear, false, null) + _calculateAge(couple.person2.birthYear, false, null)) / 2
        : _calculateAge(couple.person.birthYear, false, null);
    
    var personIcon = _getIcon('PERSON');
    var locationIcon = _getIcon('LOCATION');
    var infoIcon = _getIcon('CIRCLE_DOT');
    var checkIcon = _getIcon('CHECK_SIMPLE');
    var searchIcon = _getIcon('SEARCH');
    var warningIcon = _getIcon('WARNING');
    var childIcon = _getIcon('CHILD');
    
    function renderSurrogateList() {
        var surrogates = _getPotentialSurrogates(coupleLocation, avgAge, currentFilters);
        
        if (surrogates.length === 0) {
            return '<div class="empty-state" style="text-align:center; padding:20px; color:var(--dim);">No eligible surrogates found. Try adjusting filters.</div>';
        }
        
        var html = '';
        for (var i = 0; i < surrogates.length; i++) {
            var item = surrogates[i];
            var surrogate = item.character;
            var age = _calculateAge(surrogate.birthYear, false, null);
            var location = _getCurrentLocation(surrogate);
            var rank = _getActiveRankDisplay(surrogate);
            
            // ================================================================
            // UPDATED: Check if related using FamilyAccessors
            // ================================================================
            var isRelated = false;
            var relation = null;
            var fa = _getFamilyAccessors();
            
            if (fa && typeof fa.getRelationshipDescription === 'function') {
                relation = fa.getRelationshipDescription(couple.person1?.id || couple.person?.id, surrogate.id);
                if (relation && relation !== 'Unrelated' && relation !== 'Unknown') {
                    isRelated = true;
                }
            }
            
            if (!isRelated && couple.person2) {
                if (fa && typeof fa.getRelationshipDescription === 'function') {
                    relation = fa.getRelationshipDescription(couple.person2.id, surrogate.id);
                    if (relation && relation !== 'Unrelated' && relation !== 'Unknown') {
                        isRelated = true;
                    }
                }
            }
            
            if (!isRelated) {
                isRelated = _areRelated(couple.person1?.id || couple.person?.id, surrogate.id) || 
                           (couple.person2 && _areRelated(couple.person2.id, surrogate.id));
            }
            
            var isSelected = selectedSurrogateId === surrogate.id;
            
            var rankText = rank ? '<span style="color: var(--accent); font-size: 0.6rem;">' + _escapeHtml(rank.display) + '</span> ' : '';
            var relatedBadge = isRelated ? '<span style="background: var(--warn); padding: 2px 5px; border-radius: 10px; font-size: 0.5rem; margin-left: 5px;">' + warningIcon + ' ' + _escapeHtml(relation || 'Relative') + '</span>' : '';
            
            // ================================================================
            // NEW: Show surrogate's children info
            // ================================================================
            var childrenBadge = '';
            if (item.hasChildren) {
                childrenBadge = '<span style="background: var(--bg2); padding: 2px 5px; border-radius: 10px; font-size: 0.45rem; margin-left: 5px;">' + 
                    childIcon + ' ' + item.childCount + ' child' + (item.childCount > 1 ? 'ren' : '') + 
                    '</span>';
            }
            
            html += '<div class="surrogate-card-item" data-surrogate-id="' + surrogate.id + '" style="' +
                'background: ' + (isSelected ? 'var(--accent-dim)' : 'var(--bg3)') + ';' +
                'border: 1px solid ' + (isSelected ? 'var(--accent)' : (isRelated ? 'var(--warn, #c87040)' : 'var(--border)')) + ';' +
                'border-radius: 4px;' +
                'padding: 8px 10px;' +
                'margin-bottom: 6px;' +
                'cursor: pointer;' +
            '">' +
                '<div style="display: flex; justify-content: space-between; align-items: center;">' +
                    '<div>' +
                        rankText +
                        '<strong style="font-size: 0.7rem;">' + _escapeHtml(surrogate.name) + ' ' + _escapeHtml(surrogate.surname || '') + '</strong>' +
                        '<span style="color: var(--dim); font-size: 0.55rem;">(' + age + 'y)</span>' +
                        relatedBadge +
                        childrenBadge +
                    '</div>' +
                    '<div style="font-size: 0.55rem; color: var(--dim);">' + _escapeHtml(location) + '</div>' +
                '</div>' +
            '</div>';
        }
        return html;
    }
    
    var modalContent = 
        '<div style="margin-bottom: 12px;">' +
            '<div class="info-box" style="background: var(--bg2); padding: 8px; border-radius: 6px; margin-bottom: 12px;">' +
                '<div style="font-size: 0.65rem;"><strong>Couple:</strong> ' + _escapeHtml(couple.person1?.name || couple.person?.name) + (couple.person2 ? ' & ' + _escapeHtml(couple.person2.name) : '') + '</div>' +
                '<div style="font-size: 0.6rem; color: var(--dim);">' + _escapeHtml(coupleLocation) + '</div>' +
            '</div>' +
            
            '<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; padding: 8px; background: var(--bg2); border-radius: 6px;">' +
                '<label style="font-size: 0.6rem; display: flex; align-items: center; gap: 4px;">' +
                    '<input type="checkbox" id="surrogateShowDeceased" ' + (currentFilters.showDeceased ? 'checked' : '') + '> Show Deceased' +
                '</label>' +
                '<label style="font-size: 0.6rem; display: flex; align-items: center; gap: 4px;">' +
                    '<input type="checkbox" id="surrogateSameLocation" ' + (currentFilters.sameLocationOnly ? 'checked' : '') + '> Same Location' +
                '</label>' +
                '<label style="font-size: 0.6rem; display: flex; align-items: center; gap: 4px;">' +
                    '<input type="checkbox" id="surrogatePeersOnly" ' + (currentFilters.peersOnly ? 'checked' : '') + '> Peers (plus/minus 20y)' +
                '</label>' +
                '<label style="font-size: 0.6rem; display: flex; align-items: center; gap: 4px;">' +
                    '<input type="checkbox" id="surrogateShowOnlySingle" ' + (currentFilters.showOnlySingle ? 'checked' : '') + '> Single Only' +
                '</label>' +
                '<input type="text" id="surrogateSearch" placeholder="Search..." value="' + _escapeHtml(currentFilters.searchTerm) + '" style="flex:1; min-width: 100px; padding: 4px 6px; font-size: 0.6rem; background: var(--bg); border: 1px solid var(--border); border-radius: 4px;">' +
            '</div>' +
            
            '<div id="surrogateListContainer" style="max-height: 400px; overflow-y: auto; margin-bottom: 12px;">' +
                renderSurrogateList() +
            '</div>' +
            
            '<div style="display: flex; gap: 10px;">' +
                '<button id="confirmSurrogateBtn" class="btn primary" style="flex:2; padding: 8px; font-size: 0.65rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 4px; cursor: pointer;" disabled>Confirm Surrogate</button>' +
                '<button id="cancelSurrogateBtn" class="btn" style="flex:1; padding: 8px; font-size: 0.65rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Cancel</button>' +
            '</div>' +
        '</div>';
    
    _openModal({
        title: 'Select Surrogate',
        content: modalContent,
        confirmText: '',
        cancelText: ''
    });
    
    setTimeout(function() {
        var listContainer = document.getElementById('surrogateListContainer');
        if (listContainer) {
            listContainer.onclick = function(e) {
                var surrogateCard = e.target.closest('.surrogate-card-item');
                if (surrogateCard) {
                    var surrogateId = surrogateCard.dataset.surrogateId;
                    selectedSurrogateId = surrogateId;
                    
                    document.querySelectorAll('.surrogate-card-item').forEach(function(card) {
                        card.style.background = 'var(--bg3)';
                        card.style.borderColor = 'var(--border)';
                    });
                    surrogateCard.style.background = 'var(--accent-dim)';
                    surrogateCard.style.borderColor = 'var(--accent)';
                    
                    var confirmBtn = document.getElementById('confirmSurrogateBtn');
                    if (confirmBtn) confirmBtn.disabled = false;
                }
            };
        }
        
        var showDeceased = document.getElementById('surrogateShowDeceased');
        var sameLocation = document.getElementById('surrogateSameLocation');
        var peersOnly = document.getElementById('surrogatePeersOnly');
        var showOnlySingle = document.getElementById('surrogateShowOnlySingle');
        var searchInput = document.getElementById('surrogateSearch');
        
        var refreshList = function() {
            currentFilters.showDeceased = showDeceased?.checked || false;
            currentFilters.sameLocationOnly = sameLocation?.checked || false;
            currentFilters.peersOnly = peersOnly?.checked || false;
            currentFilters.showOnlySingle = showOnlySingle?.checked || false;
            currentFilters.searchTerm = searchInput?.value || '';
            
            var container = document.getElementById('surrogateListContainer');
            if (container) {
                container.innerHTML = renderSurrogateList();
                setTimeout(function() {
                    if (listContainer) {
                        listContainer.onclick = function(e) {
                            var surrogateCard = e.target.closest('.surrogate-card-item');
                            if (surrogateCard) {
                                var surrogateId = surrogateCard.dataset.surrogateId;
                                selectedSurrogateId = surrogateId;
                                document.querySelectorAll('.surrogate-card-item').forEach(function(card) {
                                    card.style.background = 'var(--bg3)';
                                    card.style.borderColor = 'var(--border)';
                                });
                                surrogateCard.style.background = 'var(--accent-dim)';
                                surrogateCard.style.borderColor = 'var(--accent)';
                                var confirmBtn = document.getElementById('confirmSurrogateBtn');
                                if (confirmBtn) confirmBtn.disabled = false;
                            }
                        };
                    }
                }, 50);
            }
        };
        
        if (showDeceased) showDeceased.onchange = refreshList;
        if (sameLocation) sameLocation.onchange = refreshList;
        if (peersOnly) peersOnly.onchange = refreshList;
        if (showOnlySingle) showOnlySingle.onchange = refreshList;
        if (searchInput) searchInput.oninput = refreshList;
        
        var confirmBtn = document.getElementById('confirmSurrogateBtn');
        if (confirmBtn) {
            confirmBtn.onclick = function() {
                if (selectedSurrogateId) {
                    var surrogate = _getCharacterById(selectedSurrogateId);
                    if (surrogate) {
                        _closeTopModal();
                        if (onSuccess) onSuccess(surrogate);
                    } else {
                        _showToast('Surrogate not found', 'error');
                    }
                } else {
                    _showToast('Please select a surrogate first', 'error');
                }
            };
        }
        
        var cancelBtn = document.getElementById('cancelSurrogateBtn');
        if (cancelBtn) {
            cancelBtn.onclick = function() {
                _closeTopModal();
            };
        }
    }, 100);
}

// =============================================================================
// 10. INTENDED PARENT SELECT MODAL
// =============================================================================

function openIntendedParentSelectModal(couple, donorOrSurrogate, type, onSuccess) {
    var options = [];
    
    if (couple.type === 'female_couple' || couple.type === 'male_couple') {
        options = [
            { id: couple.person1.id, name: couple.person1.name, surname: couple.person1.surname || '', label: "Parent 1" },
            { id: couple.person2.id, name: couple.person2.name, surname: couple.person2.surname || '', label: "Parent 2" }
        ];
    } else {
        options = [
            { id: couple.person.id, name: couple.person.name, surname: couple.person.surname || '', label: "Intended Parent" }
        ];
    }
    
    var typeLabel = type === 'donor' ? 'Sperm Donor' : 'Surrogate';
    var infoIcon = _getIcon('CIRCLE_DOT');
    var personIcon = _getIcon('PERSON');
    
    var modalContent = 
        '<div class="info-box" style="background: var(--bg3); padding: 12px; border-radius: 8px; margin-bottom: 16px;">' +
            '<div><strong>Couple:</strong> ' + _escapeHtml(couple.person1?.name || couple.person?.name) + (couple.person2 ? ' & ' + _escapeHtml(couple.person2.name) : '') + '</div>' +
            '<div><strong>' + typeLabel + ':</strong> ' + _escapeHtml(donorOrSurrogate.name) + ' ' + _escapeHtml(donorOrSurrogate.surname || '') + '</div>' +
        '</div>' +
        
        '<div class="form-group" style="margin-bottom: 12px;">' +
            '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Select Intended Parent</label>' +
            '<select id="intendedParentSelect" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
                options.map(function(opt) { 
                    return '<option value="' + opt.id + '">' + _escapeHtml(opt.name) + ' ' + _escapeHtml(opt.surname) + ' (' + opt.label + ')</option>'; 
                }).join('') +
            '</select>' +
        '</div>' +
        
        '<div class="info-note" style="margin-top: 12px; padding: 8px; background: var(--bg2); border-radius: 6px; font-size: 0.6rem;">' +
            infoIcon + ' This person will be the legal parent of the child born through this surrogacy arrangement.' +
        '</div>';
    
    _openModal({
        title: 'Select Intended Parent',
        content: modalContent,
        confirmText: 'Next Step',
        cancelText: 'Cancel',
        onConfirm: function() {
            var selectedParentId = document.getElementById('intendedParentSelect').value;
            var selectedParent = _getCharacterById(selectedParentId);
            
            if (selectedParent && onSuccess) {
                _closeTopModal();
                onSuccess(selectedParent);
            }
            return true;
        }
    });
}

// =============================================================================
// 11. COMPLETE SURROGACY MODAL
// =============================================================================

function openCompleteSurrogacyModal(couple, donor, surrogate, intendedParent, type, onSuccess) {
    var currentYear = _getCurrentYear();
    var infoIcon = _getIcon('CIRCLE_DOT');
    var personIcon = _getIcon('PERSON');
    var locationIcon = _getIcon('LOCATION');
    var checkIcon = _getIcon('CHECK_SIMPLE');
    
    var modalContent = 
        '<div class="info-box" style="background: var(--bg3); padding: 12px; border-radius: 8px; margin-bottom: 16px;">' +
            '<div><strong>Intended Parent:</strong> ' + _escapeHtml(intendedParent.name) + '</div>' +
            '<div><strong>Surrogate:</strong> ' + _escapeHtml(surrogate.name) + ' ' + _escapeHtml(surrogate.surname || '') + ' (' + _calculateAge(surrogate.birthYear, false, null) + 'y)</div>' +
            (donor ? '<div><strong>Donor:</strong> ' + _escapeHtml(donor.name) + ' ' + _escapeHtml(donor.surname || '') + '</div>' : '') +
        '</div>' +
        
        '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">' +
            '<div>' +
                '<label style="font-size: 0.65rem;">Number of Children</label>' +
                '<select id="completeChildCount" style="width:100%; padding: 6px;">' +
                    '<option value="1">1 Child</option>' +
                    '<option value="2">2 Children</option>' +
                    '<option value="3">3 Children</option>' +
                '</select>' +
            '</div>' +
            '<div>' +
                '<label style="font-size: 0.65rem;">Birth Year</label>' +
                '<input type="number" id="completeBirthYear" value="' + currentYear + '" style="width:100%; padding: 6px;">' +
            '</div>' +
        '</div>' +
        
        '<div style="margin-bottom: 12px;">' +
            '<label style="font-size: 0.65rem;">Notes</label>' +
            '<textarea id="completeNotes" rows="2" style="width:100%; padding: 6px; font-size:0.6rem;"></textarea>' +
        '</div>' +
        
        '<div class="warning-box" style="background: rgba(200, 68, 68, 0.15); padding: 8px; border-radius: 4px;">' +
            '<div style="font-size: 0.55rem;">This will create a permanent surrogacy record.</div>' +
        '</div>';
    
    _openModal({
        title: 'Complete Surrogacy Arrangement',
        content: modalContent,
        confirmText: 'Create Arrangement',
        cancelText: 'Cancel',
        onConfirm: function() {
            var childCount = parseInt(document.getElementById('completeChildCount').value);
            var birthYear = parseInt(document.getElementById('completeBirthYear').value);
            var notes = document.getElementById('completeNotes').value;
            
            if (isNaN(childCount) || isNaN(birthYear)) {
                _showToast('Invalid input', 'error');
                return false;
            }
            
            var intendedParentObj = {
                type: 'single',
                person: intendedParent,
                name: intendedParent.name
            };
            
            var result = _createSurrogacyArrangement(intendedParentObj, surrogate, {
                childCount: childCount,
                birthYear: birthYear,
                notes: notes
            });
            
            if (result && result.success) {
                _showToast('Surrogacy arrangement created', 'success');
                _closeTopModal();
                if (onSuccess) onSuccess();
                return true;
            } else {
                _showToast('Failed to create surrogacy arrangement', 'error');
                return false;
            }
        }
    });
}

// =============================================================================
// 12. SWAP CONFIRMATION MODAL
// =============================================================================

function openSwapConfirmationModal(femaleCouple, maleCouple, onSuccess) {
    var womanA = femaleCouple.person1;
    var womanB = femaleCouple.person2;
    var manA = maleCouple.person1;
    var manB = maleCouple.person2;
    var infoIcon = _getIcon('CIRCLE_DOT');
    var personIcon = _getIcon('PERSON');
    var checkIcon = _getIcon('CHECK_SIMPLE');
    
    var modalContent = 
        '<div class="info-box" style="background: var(--bg3); padding: 10px; border-radius: 6px; margin-bottom: 12px;">' +
            '<div style="font-weight: bold; margin-bottom: 6px;">Swap Arrangement</div>' +
            '<div style="font-size: 0.6rem;">' + _escapeHtml(womanA.name) + ' + ' + _escapeHtml(manA.name) + ' → Female Couple</div>' +
            '<div style="font-size: 0.6rem;">' + _escapeHtml(womanB.name) + ' + ' + _escapeHtml(manB.name) + ' → Male Couple</div>' +
        '</div>' +
        
        '<div class="form-group" style="margin-bottom: 10px;">' +
            '<label style="font-size: 0.65rem;">Birth Year</label>' +
            '<input type="number" id="swapBirthYear" value="' + _getCurrentYear() + '" style="width:100%; padding: 6px;">' +
        '</div>' +
        
        '<div class="warning-box" style="background: rgba(200, 68, 68, 0.15); padding: 6px; border-radius: 4px;">' +
            '<div style="font-size: 0.5rem;">Each woman carries one child. Each couple gets one child.</div>' +
        '</div>';
    
    _openModal({
        title: 'Confirm Swap',
        content: modalContent,
        confirmText: 'Confirm Swap',
        cancelText: 'Cancel',
        onConfirm: function() {
            var birthYear = parseInt(document.getElementById('swapBirthYear').value);
            if (isNaN(birthYear)) {
                _showToast('Invalid birth year', 'error');
                return false;
            }
            
            var result = _createSwapArrangements(femaleCouple, maleCouple, {
                birthYear: birthYear,
                notes: 'Swap arrangement'
            });
            
            if (result && result.success) {
                _showToast('Swap arrangement created', 'success');
                _closeTopModal();
                if (onSuccess) onSuccess(result);
                return true;
            } else {
                _showToast('Failed to create swap arrangement', 'error');
                return false;
            }
        }
    });
}

// =============================================================================
// 13. SURROGACY AGREEMENT MODAL (Legacy)
// =============================================================================

function openSurrogacyAgreementModal(intendedParent, intendedPartner, surrogate, onSuccess) {
    if (!intendedParent || !surrogate) {
        _showToast('Missing intended parent or surrogate', 'error');
        return;
    }
    
    var currentYear = _getCurrentYear();
    var infoIcon = _getIcon('CIRCLE_DOT');
    var personIcon = _getIcon('PERSON');
    var checkIcon = _getIcon('CHECK_SIMPLE');
    
    var modalContent = 
        '<div class="info-box" style="background: var(--bg3); padding: 10px; border-radius: 6px; margin-bottom: 12px;">' +
            '<div><strong>Parent:</strong> ' + _escapeHtml(intendedParent.name || intendedParent) + '</div>' +
            '<div><strong>Surrogate:</strong> ' + _escapeHtml(surrogate.name) + '</div>' +
        '</div>' +
        
        '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">' +
            '<div>' +
                '<label style="font-size: 0.6rem;">Children</label>' +
                '<select id="legacyChildCount" style="width:100%; padding: 4px;">' +
                    '<option value="1">1</option>' +
                    '<option value="2">2</option>' +
                    '<option value="3">3</option>' +
                '</select>' +
            '</div>' +
            '<div>' +
                '<label style="font-size: 0.6rem;">Birth Year</label>' +
                '<input type="number" id="legacyBirthYear" value="' + currentYear + '" style="width:100%; padding: 4px;">' +
            '</div>' +
        '</div>' +
        
        '<textarea id="legacyNotes" rows="2" placeholder="Notes..." style="width:100%; padding: 4px; font-size:0.55rem; margin-bottom:10px;"></textarea>';
    
    _openModal({
        title: 'Surrogacy Agreement',
        content: modalContent,
        confirmText: 'Create',
        cancelText: 'Cancel',
        onConfirm: function() {
            var childCount = parseInt(document.getElementById('legacyChildCount').value);
            var birthYear = parseInt(document.getElementById('legacyBirthYear').value);
            var notes = document.getElementById('legacyNotes').value;
            
            if (isNaN(childCount) || isNaN(birthYear)) {
                _showToast('Invalid input', 'error');
                return false;
            }
            
            var intendedParentObj = intendedParent;
            if (typeof intendedParent === 'object' && !intendedParent.type) {
                intendedParentObj = {
                    type: 'single',
                    person: intendedParent,
                    name: intendedParent.name
                };
            }
            
            var result = _createSurrogacyArrangement(intendedParentObj, surrogate, {
                childCount: childCount,
                birthYear: birthYear,
                notes: notes
            });
            
            if (result && result.success) {
                _showToast('Surrogacy arrangement created', 'success');
                _closeTopModal();
                if (onSuccess) onSuccess();
                return true;
            } else {
                _showToast('Failed to create surrogacy arrangement', 'error');
                return false;
            }
        }
    });
}

// =============================================================================
// 14. EXPORTS
// =============================================================================

window.openDonorSelectionModal = openDonorSelectionModal;
window.openSurrogateSelectionModal = openSurrogateSelectionModal;
window.openIntendedParentSelectModal = openIntendedParentSelectModal;
window.openSwapConfirmationModal = openSwapConfirmationModal;
window.openSurrogacyAgreementModal = openSurrogacyAgreementModal;
window.openCompleteSurrogacyModal = openCompleteSurrogacyModal;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        openDonorSelectionModal: openDonorSelectionModal,
        openSurrogateSelectionModal: openSurrogateSelectionModal,
        openIntendedParentSelectModal: openIntendedParentSelectModal,
        openSwapConfirmationModal: openSwapConfirmationModal,
        openSurrogacyAgreementModal: openSurrogacyAgreementModal,
        openCompleteSurrogacyModal: openCompleteSurrogacyModal
    };
}