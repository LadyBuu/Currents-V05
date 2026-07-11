/**
 * =============================================================================
 * STILL WATERS - BIRTH MODALS (js/core/modals/modals-birth.js)
 * =============================================================================
 * 
 * UPDATED: 
 * - Uses ChildrenCommands, ChildrenQueries, ChildrenLifecycle, PregnancyService
 * - No duplicate code - delegates to services
 * - Consolidated: All child-related modals now in one file
 * - Add Child (Retroactive) uses generateChildrenForCouple
 * 
 * CONTAINS:
 * - openBirthModal - Record a new birth (active)
 * - openSurpriseBirthModal - Random surprise birth
 * - openAddChildrenModal - Add multiple children (active)
 * - openAddChildForCoupleModal - Add existing children retroactively
 * 
 * FIXED: All confirm buttons use simple text (no SVG leaks)
 * UPDATED: Uses unified character selector from modals-core.js
 * UPDATED: Uses unified location dropdown from modals-core.js
 * UPDATED: Uses AGE_GROUPS from constants.js
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
// 2. AGE GROUPS FROM CONSTANTS.JS
// =============================================================================

function _getAgeGroups() {
    if (window.AGE_GROUPS && Array.isArray(window.AGE_GROUPS)) {
        return window.AGE_GROUPS;
    }
    return ['0-10', '11-20', '21-30', '31-40', '41-50', '51-60', '61-70', '71-80', '81-90', '91+'];
}

function _getAgeGroupEmoji(group) {
    if (window.AGE_GROUPS_MAP && window.AGE_GROUPS_MAP[group]) {
        return window.AGE_GROUPS_MAP[group].emoji;
    }
    var emojis = {
        '0-10': '👶', '11-20': '🧑', '21-30': '👨', '31-40': '👨',
        '41-50': '👩', '51-60': '👩', '61-70': '👵', '71-80': '👵',
        '81-90': '🧓', '91+': '👴'
    };
    return emojis[group] || '👤';
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
    return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
}

function _getCharacters() {
    return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
}

function _getCharacterHousehold(characterId) {
    if (typeof window.getCharacterHousehold === 'function') {
        return window.getCharacterHousehold(characterId);
    }
    return null;
}

function _getCurrentLocation(character) {
    return typeof window.getCurrentLocation === 'function' ? window.getCurrentLocation(character) : 'Unknown';
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

function _calculateAge(birthYear, isDeceased, deathYear) {
    if (typeof window.calculateAge === 'function') return window.calculateAge(birthYear, isDeceased, deathYear);
    var currentYear = _getCurrentYear();
    if (!birthYear) return 0;
    if (isDeceased && deathYear) return Math.max(0, deathYear - birthYear);
    return Math.max(0, currentYear - birthYear);
}

function _addChildToHousehold(householdId, childId, year, relationship) {
    if (typeof window.addHouseholdMember === 'function') {
        return window.addHouseholdMember(householdId, childId, 'family', {
            role: 'Child',
            joinedYear: year,
            notes: 'Added via ' + relationship
        });
    }
    return false;
}

function _recordHouseholdChange(characterId, householdId, year, action, reason, options) {
    if (typeof window.recordHouseholdChange === 'function') {
        return window.recordHouseholdChange(characterId, householdId, year, action, reason, options || {});
    }
    return false;
}

function _getPlaces() {
    if (typeof window.getPlaces === 'function') return window.getPlaces();
    return [];
}

function _getPlaceById(id) {
    if (typeof window.getPlaceById === 'function') return window.getPlaceById(id);
    return null;
}

function _createHousehold(name, location, options) {
    if (typeof window.createHousehold === 'function') {
        return window.createHousehold(name, location, options);
    }
    return null;
}

// =============================================================================
// 4. CHILDREN SYSTEM WRAPPERS
// =============================================================================

function _recordBirth(mother, father, birthYear, options) {
    if (typeof window.ChildrenCommands !== 'undefined') {
        return window.ChildrenCommands.recordBirth(mother, father, birthYear, options);
    }
    return null;
}

function _generateChildrenForCouple(mother, father, count, baseYear, options) {
    if (typeof window.ChildrenLifecycle !== 'undefined') {
        return window.ChildrenLifecycle.generateChildrenForCouple(mother, father, count, baseYear, options);
    }
    return [];
}

function _canConceive(mother, father) {
    if (typeof window.ChildrenLifecycle !== 'undefined') {
        return window.ChildrenLifecycle.canConceive(mother, father);
    }
    if (typeof window.canConceive === 'function') {
        return window.canConceive(mother, father);
    }
    return { canConceive: true, reason: 'Can conceive' };
}

function _calculateValidBirthYearRange(mother, father) {
    if (typeof window.PregnancyService !== 'undefined') {
        // Use the service to calculate birth years
        var childCount = 1;
        var years = window.PregnancyService.calculateBirthYears(mother, father, childCount);
        if (years && years.length > 0) {
            var minYear = years[0];
            var maxYear = years[years.length - 1];
            return {
                minYear: minYear,
                maxYear: maxYear,
                defaultYear: Math.floor((minYear + maxYear) / 2),
                relationshipStartYear: null
            };
        }
    }
    // Fallback: use the old method
    if (!mother || !mother.birthYear) return null;
    var currentYear = _getCurrentYear();
    var motherBirthYear = mother.birthYear;
    var relationshipStartYear = null;
    if (father && mother.relationships) {
        for (var i = 0; i < mother.relationships.length; i++) {
            var rel = mother.relationships[i];
            var partnerId = rel.participantB || rel.partnerId;
            if (partnerId === father.id && (rel.status === 'ongoing' || rel.status === 'active')) {
                relationshipStartYear = rel.details?.startYear || rel.startYear || null;
                break;
            }
        }
    }
    if (!relationshipStartYear) {
        relationshipStartYear = motherBirthYear + 18;
    }
    var minFertileYear = Math.max(1, motherBirthYear + 14);
    var maxFertileYear = Math.min(currentYear, motherBirthYear + 47);
    var minYear = Math.max(minFertileYear, relationshipStartYear);
    var maxYear = maxFertileYear;
    if (minYear > maxYear) return null;
    return {
        minYear: minYear,
        maxYear: maxYear,
        defaultYear: Math.floor((minYear + maxYear) / 2),
        relationshipStartYear: relationshipStartYear
    };
}

function _getRelationshipStartYear(mother, father) {
    if (!father || !mother) return null;
    if (mother.relationships) {
        for (var i = 0; i < mother.relationships.length; i++) {
            var rel = mother.relationships[i];
            var partnerId = rel.participantB || rel.partnerId;
            if (partnerId === father.id && (rel.status === 'ongoing' || rel.status === 'active')) {
                return rel.details?.startYear || rel.startYear || null;
            }
        }
    }
    if (father.relationships) {
        for (var i = 0; i < father.relationships.length; i++) {
            var rel = father.relationships[i];
            var partnerId = rel.participantB || rel.partnerId;
            if (partnerId === mother.id && (rel.status === 'ongoing' || rel.status === 'active')) {
                return rel.details?.startYear || rel.startYear || null;
            }
        }
    }
    return null;
}

// =============================================================================
// 5. CHARACTER SELECTOR - Uses unified selector
// =============================================================================

function _openCharacterSelectorForBirth(title, onSelect, options) {
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
// 6. LOCATION DROPDOWN - Uses unified dropdown
// =============================================================================

function _getLocationOptions(selectedId, placeholderText, includeAll) {
    placeholderText = placeholderText || '-- Select location --';
    includeAll = includeAll !== undefined ? includeAll : false;
    
    if (typeof window.buildLocationDropdown === 'function') {
        return window.buildLocationDropdown(selectedId, placeholderText, includeAll);
    }
    
    // Fallback
    var places = _getPlaces();
    var html = '';
    if (placeholderText) {
        html += '<option value="">' + _escapeHtml(placeholderText) + '</option>';
    }
    if (includeAll) {
        html += '<option value="all">All Locations</option>';
    }
    for (var i = 0; i < places.length; i++) {
        var selected = (selectedId === places[i].id) ? 'selected' : '';
        var type = typeof window.getLocationTypeById === 'function' ? window.getLocationTypeById(places[i].typeId) : null;
        var icon = (type && type.icon) ? type.icon : '⌂';
        html += '<option value="' + places[i].id + '" ' + selected + '>' + 
            icon + ' ' + _escapeHtml(places[i].displayName) + 
            (type ? ' (' + _escapeHtml(type.displayName) + ')' : '') +
            '</option>';
    }
    html += '<option value="unknown" ' + (selectedId === 'unknown' ? 'selected' : '') + '>❓ Unknown Location</option>';
    return html;
}

// =============================================================================
// 7. BIRTH MODAL - Record a new birth (active)
// =============================================================================

function openBirthModal(motherId, fatherId, onSuccess) {
    var mother = _getCharacterById(motherId);
    var father = fatherId ? _getCharacterById(fatherId) : null;
    
    if (!mother) {
        _showToast('Mother not found', 'error');
        return;
    }
    
    var currentYear = _getCurrentYear();
    var motherAge = _calculateAge(mother.birthYear, false, null);
    
    var yearRange = _calculateValidBirthYearRange(mother, father);
    if (!yearRange) {
        _showToast('Mother is outside fertile window (14-47) or relationship invalid', 'error');
        return;
    }
    
    var minBirthYear = yearRange.minYear;
    var maxBirthYear = yearRange.maxYear;
    var defaultBirthYear = yearRange.defaultYear;
    
    var infoIcon = _getIcon('CIRCLE_DOT');
    var checkIcon = _getIcon('CHECK_SIMPLE');
    var householdIcon = _getIcon('HOUSEHOLD');
    
    var modalContent = `
        <div class="info-box" style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px;">
            <div><strong>◉ ${_escapeHtml(mother.name)} ${_escapeHtml(mother.surname || '')}</strong> (${motherAge}y)</div>
            ${father ? '<div><strong>◉ ' + _escapeHtml(father.name) + ' ' + _escapeHtml(father.surname || '') + '</strong></div>' : ''}
            <div style="font-size: 0.6rem; color: var(--dim); margin-top: 4px;">
                ${infoIcon} Fertile window: ${minBirthYear} - ${maxBirthYear}
            </div>
        </div>
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">${infoIcon} Birth Year</label>
            <input type="number" id="birthYear" value="${defaultBirthYear}" min="${minBirthYear}" max="${maxBirthYear}" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">
        </div>
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">${infoIcon} Gender</label>
            <select id="childGender" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">
                <option value="random">${infoIcon} Random</option>
                <option value="male">♂ Male</option>
                <option value="female">♀ Female</option>
            </select>
        </div>
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: flex; align-items: center; gap: 8px;">
                <input type="checkbox" id="isStillborn">
                <span>✗ Stillborn</span>
            </label>
        </div>
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: flex; align-items: center; gap: 8px;">
                <input type="checkbox" id="autoAssignHousehold" checked>
                <span style="font-size: 0.65rem;">${householdIcon} Auto-assign child to parent's household</span>
            </label>
        </div>
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">${infoIcon} Notes (optional)</label>
            <textarea id="birthNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);"></textarea>
        </div>
    `;
    
    _openModal({
        title: householdIcon + ' Record Birth: ' + mother.name,
        content: modalContent,
        confirmText: 'Record Birth',
        cancelText: infoIcon + ' Cancel',
        onConfirm: function() {
            var birthYear = parseInt(document.getElementById('birthYear').value);
            var gender = document.getElementById('childGender').value;
            var isStillborn = document.getElementById('isStillborn') ? document.getElementById('isStillborn').checked : false;
            var notes = document.getElementById('birthNotes') ? document.getElementById('birthNotes').value || '' : '';
            var autoAssignHousehold = document.getElementById('autoAssignHousehold') ? document.getElementById('autoAssignHousehold').checked !== false : true;
            
            if (isNaN(birthYear) || birthYear < minBirthYear || birthYear > maxBirthYear) {
                _showToast('Birth year must be within mother\'s fertile window (' + minBirthYear + '-' + maxBirthYear + ')', 'error');
                return false;
            }
            
            var finalGender = gender === 'random' ? (Math.random() < 0.5 ? 'male' : 'female') : gender;
            
            var result = _recordBirth(mother, father, birthYear, {
                gender: finalGender,
                isStillborn: isStillborn,
                notes: notes,
                autoAssignHousehold: autoAssignHousehold
            });
            
            if (result && result.success) {
                var child = result.child;
                _showToast(child.name + (child.surname ? ' ' + child.surname : '') + ' born', 'success');
                _closeTopModal();
                if (onSuccess) onSuccess(child);
                return true;
            } else {
                _showToast('Failed to record birth', 'error');
                return false;
            }
        }
    });
}

// =============================================================================
// 8. SURPRISE BIRTH MODAL
// =============================================================================

var _surpriseBirthInProgress = false;

function openSurpriseBirthModal(mother, father, onSuccess) {
    if (_surpriseBirthInProgress) {
        _showToast('Surprise birth already in progress...', 'warning');
        return;
    }
    
    if (!mother || !father) {
        _showToast('Mother and father are required', 'error');
        return;
    }
    
    _surpriseBirthInProgress = true;
    
    try {
        var yearRange = _calculateValidBirthYearRange(mother, father);
        if (!yearRange) {
            _showToast('Mother is outside fertile window (14-47) or relationship invalid', 'error');
            _surpriseBirthInProgress = false;
            return;
        }
        
        var fertileStart = yearRange.minYear;
        var fertileEnd = yearRange.maxYear;
        
        var roll = Math.random();
        var childCount = 1;
        if (roll < 0.05) childCount = 4;
        else if (roll < 0.15) childCount = 3;
        else if (roll < 0.35) childCount = 2;
        
        var birthYears = [];
        if (childCount === 1) {
            var yearOffset = Math.floor(Math.random() * (fertileEnd - fertileStart + 1));
            birthYears.push(fertileStart + yearOffset);
        } else {
            var spacing = (fertileEnd - fertileStart) / (childCount + 1);
            for (var i = 0; i < childCount; i++) {
                var offset = spacing * (i + 1) * (0.7 + Math.random() * 0.6);
                var year = fertileStart + Math.floor(offset);
                year = Math.min(year, fertileEnd);
                year = Math.max(year, fertileStart);
                birthYears.push(year);
            }
        }
        
        var newborns = [];
        var stillbornCount = 0;
        
        for (var i = 0; i < birthYears.length; i++) {
            var year = birthYears[i];
            var isStillborn = Math.random() < 0.05;
            if (isStillborn) stillbornCount++;
            
            var gender = Math.random() < 0.5 ? 'male' : 'female';
            
            var result = _recordBirth(mother, father, year, {
                gender: gender,
                isStillborn: isStillborn,
                notes: 'Surprise birth!',
                autoAssignHousehold: true
            });
            
            if (result && result.success) {
                newborns.push(result.child);
            }
        }
        
        var livingCount = newborns.filter(function(c) { return !c.isDeceased; }).length;
        var surpriseIcon = _getIcon('STAR_4');
        
        if (newborns.length > 0) {
            var message = surpriseIcon + ' SURPRISE! ' + livingCount + ' baby' + (livingCount > 1 ? 'ies' : '') + '!';
            if (stillbornCount > 0) message += ' (' + stillbornCount + ' stillborn)';
            _showToast(message, 'success');
            if (onSuccess) onSuccess(newborns);
        } else {
            _showToast('No children born', 'info');
            if (onSuccess) onSuccess([]);
        }
    } finally {
        _surpriseBirthInProgress = false;
    }
    
    _closeTopModal();
}

// =============================================================================
// 9. ADD CHILDREN MODAL - Add multiple children (active)
// =============================================================================

function openAddChildrenModal(mother, father, onSuccess) {
    if (!mother || !father) {
        _showToast('Mother and father are required', 'error');
        return;
    }
    
    var yearRange = _calculateValidBirthYearRange(mother, father);
    if (!yearRange) {
        _showToast('Mother is outside fertile window (14-47) or relationship invalid', 'error');
        return;
    }
    
    var minBirthYear = yearRange.minYear;
    var maxBirthYear = yearRange.maxYear;
    
    var infoIcon = _getIcon('CIRCLE_DOT');
    var checkIcon = _getIcon('CHECK_SIMPLE');
    var householdIcon = _getIcon('HOUSEHOLD');
    
    var modalContent = `
        <div class="info-box" style="background: var(--bg3); padding: 12px; border-radius: 8px; margin-bottom: 16px;">
            <div><strong>◉ ${_escapeHtml(mother.name)} ${_escapeHtml(mother.surname || '')}</strong></div>
            <div><strong>◉ ${_escapeHtml(father.name)} ${_escapeHtml(father.surname || '')}</strong></div>
            <div style="font-size: 0.6rem; color: var(--dim); margin-top: 4px;">
                ${infoIcon} Fertile window: ${minBirthYear} - ${maxBirthYear}
            </div>
        </div>
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">${infoIcon} Number of Children</label>
            <select id="childCountSelect" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">
                <option value="1">${infoIcon} 1 Child</option>
                <option value="2">${infoIcon} 2 Children</option>
                <option value="3">${infoIcon} 3 Children</option>
                <option value="4">${infoIcon} 4 Children</option>
                <option value="5">${infoIcon} 5 Children</option>
            </select>
        </div>
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">${infoIcon} Birth Year Range</label>
            <div style="display: flex; gap: 8px;">
                <input type="number" id="startYear" value="${minBirthYear}" min="${minBirthYear}" max="${maxBirthYear}" style="flex:1; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">
                <input type="number" id="endYear" value="${maxBirthYear}" min="${minBirthYear}" max="${maxBirthYear}" style="flex:1; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">
            </div>
        </div>
        
        <div class="form-group" style="margin-bottom: 12px;">
            <label style="display: flex; align-items: center; gap: 8px;">
                <input type="checkbox" id="autoAssignHousehold" checked>
                <span style="font-size: 0.65rem;">${householdIcon} Auto-assign children to parent's household</span>
            </label>
        </div>
    `;
    
    _openModal({
        title: householdIcon + ' Add Children',
        content: modalContent,
        confirmText: 'Generate Children',
        cancelText: infoIcon + ' Cancel',
        onConfirm: function() {
            var childCount = parseInt(document.getElementById('childCountSelect').value);
            var startYear = parseInt(document.getElementById('startYear').value);
            var endYear = parseInt(document.getElementById('endYear').value);
            
            if (isNaN(childCount) || childCount < 1) {
                _showToast('Invalid number', 'error');
                return false;
            }
            if (isNaN(startYear)) startYear = minBirthYear;
            if (isNaN(endYear)) endYear = maxBirthYear;
            if (startYear > endYear) { var temp = startYear; startYear = endYear; endYear = temp; }
            
            if (startYear < minBirthYear || endYear > maxBirthYear) {
                _showToast('Birth years must be within mother\'s fertile window', 'error');
                return false;
            }
            
            var children = _generateChildrenForCouple(mother, father, childCount, startYear, {
                gender: null,
                notes: '',
                autoAssignHousehold: document.getElementById('autoAssignHousehold')?.checked !== false
            });
            
            if (children && children.length > 0) {
                var livingCount = children.filter(function(c) { return !c.isDeceased; }).length;
                _showToast('✓ ' + livingCount + ' children born', 'success');
                _closeTopModal();
                if (onSuccess) onSuccess(children);
                return true;
            } else {
                _showToast('Failed to generate children', 'error');
                return false;
            }
        }
    });
}

// =============================================================================
// 10. ADD CHILD (RETROACTIVE) MODAL - Add existing children (historical)
// =============================================================================

function openAddChildForCoupleModal(motherId, fatherId, onSuccess) {
    var mother = typeof window.getCharacterById === 'function' 
        ? window.getCharacterById(motherId) 
        : null;
    var father = fatherId ? (typeof window.getCharacterById === 'function' 
        ? window.getCharacterById(fatherId) 
        : null) : null;
    
    if (!mother) {
        if (typeof window._showToast === 'function') window._showToast('Mother not found', 'error');
        return;
    }
    
    var currentYear = typeof window.getCurrentYearSafe === 'function' 
        ? window.getCurrentYearSafe() 
        : 1250;
    var motherAge = typeof window.calculateAge === 'function'
        ? window.calculateAge(mother.birthYear, false, null)
        : 0;
    
    if (motherAge < 14) {
        if (typeof window._showToast === 'function') window._showToast(mother.name + ' is only ' + motherAge + ' years old. Minimum age is 14.', 'error');
        return;
    }
    
    var check = _canConceive(mother, father);
    if (!check.canConceive) {
        if (typeof window._showToast === 'function') window._showToast(check.reason, 'error');
        return;
    }
    
    var infoIcon = _getIcon('CIRCLE_DOT');
    var checkIcon = _getIcon('CHECK_SIMPLE');
    var householdIcon = _getIcon('HOUSEHOLD');
    
    var modalContent = `
        <div class="info-box" style="margin-bottom: 16px; background: var(--bg2); padding: 12px; border-radius: 8px;">
            <strong>◉ ${_escapeHtml(mother.name)}</strong> (${motherAge}y)
            ${father ? '& <strong>◉ ' + _escapeHtml(father.name) + '</strong>' : ''}
        </div>
        <div class="form-group" style="margin-bottom:12px;">
            <label style="display:block; margin-bottom:5px; font-size:0.7rem; color:var(--accent);">Number of Children</label>
            <input type="number" id="childCount" min="1" max="10" value="1" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">
        </div>
        <div class="form-group" style="margin-bottom:12px;">
            <label style="display:block; margin-bottom:5px; font-size:0.7rem; color:var(--accent);">Birth Year (if single child)</label>
            <input type="number" id="birthYear" value="${currentYear}" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">
            <small style="font-size:0.55rem;">For multiple children, they will be spaced 2-3 years apart</small>
        </div>
        <div class="form-group" style="margin-bottom:12px;">
            <label style="display:block; margin-bottom:5px; font-size:0.7rem; color:var(--accent);">Gender (if single child)</label>
            <select id="childGender" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">
                <option value="random">⌇ Random</option>
                <option value="male">♂ Male</option>
                <option value="female">♀ Female</option>
            </select>
        </div>
        <div class="form-group" style="margin-bottom:12px;">
            <label style="display:block; margin-bottom:5px; font-size:0.7rem; color:var(--accent);">Notes (optional)</label>
            <textarea id="childNotes" rows="2" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);" placeholder="e.g., Heir, Twin, Stillborn..."></textarea>
        </div>
        <div class="form-group" style="margin-bottom:12px;">
            <label style="display: flex; align-items: center; gap: 8px;">
                <input type="checkbox" id="autoAssignHousehold" checked>
                <span style="font-size: 0.65rem;">${householdIcon} Auto-assign children to parent's household</span>
            </label>
            <small style="font-size: 0.55rem; color: var(--dim);">Children will be added to the mother's household (or father's if mother has none)</small>
        </div>
        <div class="info-note" style="margin-top: 12px; padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">
            ⌇ This adds existing children retroactively. For active births, use the Birth modal.
        </div>
    `;
    
    _openModal({
        title: '⌇ Add Child to Couple (Retroactive)',
        content: modalContent,
        confirmText: 'Add Child',
        cancelText: 'Cancel',
        onConfirm: function() {
            var childCount = parseInt(document.getElementById('childCount').value, 10);
            var birthYear = parseInt(document.getElementById('birthYear').value, 10);
            var gender = document.getElementById('childGender').value;
            var notes = document.getElementById('childNotes').value;
            var autoAssignHousehold = document.getElementById('autoAssignHousehold')?.checked !== false;
            
            if (isNaN(childCount) || childCount < 1) {
                _showToast('Invalid number of children', 'error');
                return;
            }
            if (isNaN(birthYear)) {
                _showToast('Invalid birth year', 'error');
                return;
            }
            
            var children = _generateChildrenForCouple(mother, father, childCount, birthYear, {
                gender: gender !== 'random' ? gender : null,
                notes: notes,
                autoAssignHousehold: autoAssignHousehold
            });
            
            if (children && children.length > 0) {
                var livingCount = children.filter(function(c) { return !c.isDeceased; }).length;
                _showToast('✓ ' + livingCount + ' child' + (livingCount !== 1 ? 'ren' : '') + ' added to ' + mother.name + (father ? ' and ' + father.name : ''), 'success');
                _closeTopModal();
                if (onSuccess) onSuccess(children);
                return true;
            } else {
                _showToast('Failed to generate children', 'error');
                return false;
            }
        }
    });
}

// =============================================================================
// 11. EXPORTS
// =============================================================================

window.openBirthModal = openBirthModal;
window.openSurpriseBirthModal = openSurpriseBirthModal;
window.openAddChildrenModal = openAddChildrenModal;
window.openAddChildForCoupleModal = openAddChildForCoupleModal;

window._getRelationshipStartYear = _getRelationshipStartYear;
window._calculateValidBirthYearRange = _calculateValidBirthYearRange;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        openBirthModal: openBirthModal,
        openSurpriseBirthModal: openSurpriseBirthModal,
        openAddChildrenModal: openAddChildrenModal,
        openAddChildForCoupleModal: openAddChildForCoupleModal,
        _getRelationshipStartYear: _getRelationshipStartYear,
        _calculateValidBirthYearRange: _calculateValidBirthYearRange
    };
}