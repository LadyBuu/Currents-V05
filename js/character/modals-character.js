/**
 * =============================================================================
 * STILL WATERS - CHARACTER MODALS js/character/modals-character.js
 * =============================================================================
 * 
 * UPDATED: Uses CharacterState, CharacterCommands, CharacterQueries
 * UPDATED: Uses CharacterLifecycle for death operations
 * UPDATED: Uses openCharacterSelector from selectors/modals-char-selector.js
 * UPDATED: Uses icons from icons.js (no emojis)
 * UPDATED: No icons in confirm/cancel buttons - plain text only
 * UPDATED: Fixed line break issues in string literals
 * UPDATED: Fixed _showToast recursion - uses window.showToast directly
 * UPDATED: Uses FamilyAccessors for family information display
 * 
 * =============================================================================
 */

// =============================================================================
// 1. DEPENDENCY WRAPPERS
// =============================================================================

function _getState() {
    return typeof window.CharacterState !== 'undefined' ? window.CharacterState : null;
}

function _getCommands() {
    return typeof window.CharacterCommands !== 'undefined' ? window.CharacterCommands : null;
}

function _getQueries() {
    return typeof window.CharacterQueries !== 'undefined' ? window.CharacterQueries : null;
}

function _getLifecycle() {
    return typeof window.CharacterLifecycle !== 'undefined' ? window.CharacterLifecycle : null;
}

function _getFamilyAccessors() {
    return typeof window.FamilyAccessors !== 'undefined' ? window.FamilyAccessors : null;
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
    return [];
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

function _escapeHtml(str) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
    if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * FIXED: No recursion - uses window.showToast directly
 */
function _showToast(msg, type) {
    if (typeof window.showToast === 'function') {
        window.showToast(msg, type);
        return;
    }
    if (typeof window.showToastMessage === 'function') {
        window.showToastMessage(msg, type);
        return;
    }
    console.log('[' + (type || 'info') + '] ' + msg);
}

function _openModal(options) {
    if (typeof window.openModal === 'function') {
        return window.openModal(options);
    }
    _showToast('Modal system not available', 'error');
    return null;
}

function _closeTopModal() {
    if (typeof window.closeTopModal === 'function') {
        window.closeTopModal();
    }
}

function _confirmDialog(message, title, onConfirm) {
    if (typeof window.confirmDialog === 'function') {
        return window.confirmDialog(message, title, onConfirm);
    }
    if (confirm(message)) {
        onConfirm();
    }
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

function _getCurrentLocation(character) {
    if (typeof window.getCurrentLocation === 'function') {
        return window.getCurrentLocation(character);
    }
    return 'Unknown';
}

function _getActiveRankDisplay(character) {
    if (typeof window.getActiveRankDisplay === 'function') {
        return window.getActiveRankDisplay(character);
    }
    return null;
}

function _openCharacterSelectorForCharacter(title, onSelect, options) {
    options = options || {};

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
            preset: options.preset || null,
            excludeIds: options.excludeIds || []
        });
        return true;
    }

    if (typeof window.openUnifiedCharacterSelector === 'function') {
        window.openUnifiedCharacterSelector({
            title: title || 'Select Character',
            targetId: options.targetId || null,
            onSelect: onSelect,
            filters: {
                gender: options.gender || 'all',
                status: options.status || 'all',
                showDeceased: options.showDeceased || false,
                location: options.locationFilter || 'all'
            },
            preset: options.preset || null,
            excludeIds: options.excludeIds || []
        });
        return true;
    }

    _showToast('Character selector not available', 'warning');
    return false;
}

// =============================================================================
// 2. ICON HELPERS (using icons.js)
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
// 3. FAMILY ACCESSORS WRAPPERS (NEW)
// =============================================================================

function _getChildrenViaFamilyAccessors(parentId, includeDeceased) {
    var fa = _getFamilyAccessors();
    if (fa && typeof fa.getAllChildren === 'function') {
        var result = fa.getAllChildren(parentId, includeDeceased || false);
        if (result) {
            return result;
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

function _getSpousesViaFamilyAccessors(characterId, activeOnly) {
    var fa = _getFamilyAccessors();
    if (fa && typeof fa.getSpouses === 'function') {
        var result = fa.getSpouses(characterId, activeOnly !== false);
        if (result) {
            return result;
        }
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

function _getRelationshipDescriptionViaFamilyAccessors(id1, id2) {
    var fa = _getFamilyAccessors();
    if (fa && typeof fa.getRelationshipDescription === 'function') {
        return fa.getRelationshipDescription(id1, id2);
    }
    return null;
}

// =============================================================================
// 4. CHARACTER DETAILS MODAL (UPDATED with Family Info)
// =============================================================================

function openCharacterDetailsModal(characterId, onSuccess) {
    var queries = _getQueries();
    var lifecycle = _getLifecycle();
    if (!queries) {
        _showToast('Character system not available', 'error');
        return;
    }

    var character = queries.getCharacter(characterId);
    if (!character) {
        _showToast('Character not found', 'error');
        return;
    }

    var age = _calculateAge(character.birthYear, character.isDeceased, character.deathYear);
    var location = _getCurrentLocation(character);
    var rank = _getActiveRankDisplay(character);

    // ================================================================
    // NEW: Get family statistics using FamilyAccessors
    // ================================================================
    var familyInfo = null;
    var fa = _getFamilyAccessors();
    if (fa && typeof fa.getFamilyStatistics === 'function') {
        familyInfo = fa.getFamilyStatistics(characterId);
    }

    // Fallback: use CharacterQueries
    if (!familyInfo && typeof queries.getCharacterFamilyStatistics === 'function') {
        familyInfo = queries.getCharacterFamilyStatistics(characterId);
    }

    // Fallback: direct data access
    if (!familyInfo) {
        var parents = { father: null, mother: null };
        if (character.fatherId) parents.father = _getCharacterById(character.fatherId);
        if (character.motherId) parents.mother = _getCharacterById(character.motherId);

        var children = [];
        if (character.children) {
            for (var i = 0; i < character.children.length; i++) {
                var child = _getCharacterById(character.children[i]);
                if (child) children.push(child);
            }
        }

        familyInfo = {
            parents: parents,
            children: { total: children.length, living: children.filter(function(c) { return !c.isDeceased; }).length },
            hasChildren: children.length > 0,
            spouse: null,
            siblings: { total: 0 },
            isOrphan: !parents.father && !parents.mother
        };

        // Try to get spouses
        var spouses = [];
        if (character.relationships) {
            for (var i = 0; i < character.relationships.length; i++) {
                var rel = character.relationships[i];
                if (rel.status === 'ongoing' || rel.status === 'active') {
                    var spouseId = rel.participantB || rel.partnerId;
                    if (spouseId === characterId) spouseId = rel.participantA;
                    var spouse = _getCharacterById(spouseId);
                    if (spouse) spouses.push(spouse);
                }
            }
        }
        if (spouses.length > 0) {
            familyInfo.spouse = { character: spouses[0] };
        }
    }

    // Build family info HTML
    var familyHtml = '';
    var familyIcon = _getIcon('PERSON');
    var infoIcon = _getIcon('CIRCLE_DOT');
    var locationIcon = _getIcon('LOCATION');
    var householdIcon = _getIcon('HOUSEHOLD');

    if (familyInfo) {
        var hasParents = familyInfo.parents?.father || familyInfo.parents?.mother;
        var parentNames = [];
        if (familyInfo.parents?.father) parentNames.push(_escapeHtml(familyInfo.parents.father.name));
        if (familyInfo.parents?.mother) parentNames.push(_escapeHtml(familyInfo.parents.mother.name));

        var spouseName = familyInfo.spouse?.character ? _escapeHtml(familyInfo.spouse.character.name) : null;

        familyHtml = '<div style="background: var(--bg3); padding: 10px; border-radius: 8px; margin: 10px 0;">' +
            '<div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 4px; font-weight: bold;">' + familyIcon + ' Family</div>' +
            '<div style="font-size: 0.65rem; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px;">';

        if (hasParents) {
            familyHtml += '<div><span style="color: var(--dim);">Parents:</span> ' + parentNames.join(' & ') + '</div>';
        } else if (familyInfo.isOrphan) {
            familyHtml += '<div><span style="color: var(--dim);">Parents:</span> <span style="color: var(--warn);">Orphan</span></div>';
        }

        if (spouseName) {
            familyHtml += '<div><span style="color: var(--dim);">Spouse:</span> ' + spouseName + '</div>';
        }

        var childCount = familyInfo.children?.total || 0;
        var livingChildren = familyInfo.children?.living || 0;
        if (childCount > 0) {
            familyHtml += '<div><span style="color: var(--dim);">Children:</span> ' + childCount + 
                (livingChildren < childCount ? ' (' + livingChildren + ' living)' : '') + '</div>';
        }

        var siblingCount = familyInfo.siblings?.total || 0;
        if (siblingCount > 0) {
            familyHtml += '<div><span style="color: var(--dim);">Siblings:</span> ' + siblingCount + '</div>';
        }

        if (familyInfo.grandchildren?.total > 0) {
            familyHtml += '<div><span style="color: var(--dim);">Grandchildren:</span> ' + familyInfo.grandchildren.total + '</div>';
        }

        familyHtml += '</div></div>';
    }

    var modalContent = '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">' +
        '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">' +
        '<div style="background: var(--bg2); padding: 12px; border-radius: 8px;">' +
        '<div style="font-size: 0.6rem; color: var(--dim);">Name</div>' +
        '<div style="font-size: 0.9rem; font-weight: bold;">' + _escapeHtml(character.name) + ' ' + _escapeHtml(character.surname || '') + '</div>' +
        '<div style="font-size: 0.65rem; color: var(--dim);">' + (rank ? _escapeHtml(rank.display) : '') + '</div>' +
        '</div>' +
        '<div style="background: var(--bg2); padding: 12px; border-radius: 8px;">' +
        '<div style="font-size: 0.6rem; color: var(--dim);">Status</div>' +
        '<div style="font-size: 0.9rem; font-weight: bold; color: ' + (character.isDeceased ? 'var(--dim)' : 'var(--success)') + ';">' + (character.isDeceased ? 'Deceased' : 'Living') + '</div>' +
        '<div style="font-size: 0.65rem; color: var(--dim);">' + age + ' years</div>' +
        '</div>' +
        '</div>' +

        '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">' +
        '<div style="background: var(--bg2); padding: 12px; border-radius: 8px;">' +
        '<div style="font-size: 0.6rem; color: var(--dim);">Gender</div>' +
        '<div style="font-size: 0.85rem;">' + _escapeHtml(character.gender || 'Unknown') + '</div>' +
        '</div>' +
        '<div style="background: var(--bg2); padding: 12px; border-radius: 8px;">' +
        '<div style="font-size: 0.6rem; color: var(--dim);">Location</div>' +
        '<div style="font-size: 0.85rem;">' + _escapeHtml(location) + '</div>' +
        '</div>' +
        '</div>' +

        // NEW: Family Info Section
        familyHtml +

        '<div style="margin-bottom: 12px;">' +
        '<div style="background: var(--bg2); padding: 12px; border-radius: 8px;">' +
        '<div style="font-size: 0.6rem; color: var(--dim);">Birth Year</div>' +
        '<div style="font-size: 0.85rem;">' + (character.birthYear || 'Unknown') + '</div>' +
        (character.isDeceased && character.deathYear ? '<div style="font-size: 0.6rem; color: var(--dim); margin-top: 4px;">Death Year: ' + character.deathYear + (character.deathCause ? ' · ' + _escapeHtml(character.deathCause) : '') + '</div>' : '') +
        '</div>' +
        '</div>' +

        (character.notes ? '<div style="font-size: 0.55rem; color: var(--dim); padding: 8px; background: var(--bg3); border-radius: 6px; margin-bottom: 12px;">' + _escapeHtml(character.notes) + '</div>' : '') +

        '<div style="display: flex; gap: 8px; flex-wrap: wrap;">' +
        '<button id="editCharBtn" class="btn primary" style="font-size: 0.7rem; padding: 4px 12px;">Edit</button>' +
        (!character.isDeceased ? '<button id="killCharBtn" class="btn danger" style="font-size: 0.7rem; padding: 4px 12px;">Kill</button>' : '') +
        '<button id="deleteCharBtn" class="btn danger" style="font-size: 0.7rem; padding: 4px 12px;">Delete</button>' +
        '</div>' +
        '</div>';

    _openModal({
        title: 'Character Details',
        content: modalContent,
        confirmText: 'Close',
        cancelText: '',
        onConfirm: function() {}
    });

    setTimeout(function() {
        var editBtn = document.getElementById('editCharBtn');
        if (editBtn) {
            editBtn.addEventListener('click', function() {
                _closeTopModal();
                openEditCharacterModal(characterId, onSuccess);
            });
        }

        var killBtn = document.getElementById('killCharBtn');
        if (killBtn) {
            killBtn.addEventListener('click', function() {
                _closeTopModal();
                if (typeof window.openDeathModal === 'function') {
                    window.openDeathModal(character, function() {
                        if (onSuccess) onSuccess();
                    });
                } else {
                    _showToast('Death modal not available', 'error');
                }
            });
        }

        var deleteBtn = document.getElementById('deleteCharBtn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', function() {
                _closeTopModal();
                openDeleteCharacterModal(characterId, onSuccess);
            });
        }
    }, 100);
}

// =============================================================================
// 5. CREATE CHARACTER MODAL
// =============================================================================

function openCreateCharacterModal(onSuccess) {
    var commands = _getCommands();
    if (!commands) {
        _showToast('Character system not available', 'error');
        return;
    }

    var currentYear = _getCurrentYear();
    var defaultBirthYear = currentYear - 25;

    // Build content as separate string to avoid line break issues
    var modalContent = '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">' +
        '<div style="margin-bottom: 12px; padding: 8px; background: var(--bg2); border-radius: 6px; font-size: 0.65rem; color: var(--dim);">' +
        'Create a new character for the world of Still Waters.' +
        '</div>' +

        '<div class="form-group" style="margin-bottom: 12px;">' +
        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">First Name *</label>' +
        '<input type="text" id="charFirstName" placeholder="Enter first name" autofocus style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
        '</div>' +

        '<div class="form-group" style="margin-bottom: 12px;">' +
        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Surname</label>' +
        '<input type="text" id="charSurname" placeholder="Enter surname (optional)" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
        '<small style="font-size: 0.55rem; color: var(--dim);">Leave blank to generate from cultural data (if available)</small>' +
        '</div>' +

        '<div class="form-group" style="margin-bottom: 12px;">' +
        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Gender</label>' +
        '<select id="charGender" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
        '<option value="male">Male</option>' +
        '<option value="female">Female</option>' +
        '<option value="unknown">Unknown</option>' +
        '</select>' +
        '</div>' +

        '<div class="form-group" style="margin-bottom: 12px;">' +
        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Birth Year</label>' +
        '<input type="number" id="charBirthYear" value="' + defaultBirthYear + '" min="1" max="' + currentYear + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
        '</div>' +

        '<div class="form-group" style="margin-bottom: 12px;">' +
        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Birthplace</label>' +
        '<select id="charBirthplace" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
        '<option value="">-- Select birthplace --</option>' +
        '</select>' +
        '<small style="font-size: 0.55rem; color: var(--dim);">Cultural names will be based on this location\'s country.</small>' +
        '</div>' +

        // NEW: Optional parent assignment
        '<div style="margin-bottom: 12px; padding: 8px; background: var(--bg3); border-radius: 6px;">' +
        '<div style="font-size: 0.65rem; color: var(--accent); margin-bottom: 6px; font-weight: bold;">Optional: Assign Parents</div>' +
        '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">' +
        '<div class="form-group" style="margin-bottom: 0;">' +
        '<label style="display: block; font-size: 0.55rem; color: var(--dim); margin-bottom: 2px;">Father ID</label>' +
        '<input type="text" id="charFatherId" placeholder="Optional" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px;">' +
        '</div>' +
        '<div class="form-group" style="margin-bottom: 0;">' +
        '<label style="display: block; font-size: 0.55rem; color: var(--dim); margin-bottom: 2px;">Mother ID</label>' +
        '<input type="text" id="charMotherId" placeholder="Optional" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px;">' +
        '</div>' +
        '</div>' +
        '<small style="font-size: 0.5rem; color: var(--dim);">Enter character IDs to automatically link family relationships</small>' +
        '</div>' +

        '<div class="form-group" style="margin-bottom: 12px;">' +
        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes (optional)</label>' +
        '<textarea id="charNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;" placeholder="Additional notes..."></textarea>' +
        '</div>' +
        '</div>';

    _openModal({
        title: 'Create Character',
        content: modalContent,
        confirmText: 'Create',
        cancelText: 'Cancel',
        onConfirm: function() {
            var name = document.getElementById('charFirstName').value.trim();
            var surname = document.getElementById('charSurname').value.trim();
            var gender = document.getElementById('charGender').value;
            var birthYear = parseInt(document.getElementById('charBirthYear').value);
            var birthplaceId = document.getElementById('charBirthplace').value || null;
            var fatherId = document.getElementById('charFatherId').value.trim() || null;
            var motherId = document.getElementById('charMotherId').value.trim() || null;
            var notes = document.getElementById('charNotes').value;

            if (!name) {
                _showToast('Please enter a first name', 'error');
                return false;
            }

            if (isNaN(birthYear) || birthYear < 1 || birthYear > currentYear) {
                _showToast('Please enter a valid birth year (1-' + currentYear + ')', 'error');
                return false;
            }

            var result = commands.createCharacter({
                name: name,
                surname: surname,
                gender: gender,
                birthYear: birthYear,
                birthplaceId: birthplaceId,
                fatherId: fatherId,
                motherId: motherId,
                notes: notes || 'Character created manually'
            });

            if (result && result.success) {
                _showToast('Created ' + name + (surname ? ' ' + surname : ''), 'success');
                _closeTopModal();
                if (onSuccess) onSuccess(result.data);
                return true;
            } else {
                _showToast('Failed to create character: ' + (result ? result.reason : 'Unknown error'), 'error');
                return false;
            }
        }
    });

    setTimeout(function() {
        var birthplaceSelect = document.getElementById('charBirthplace');
        if (birthplaceSelect) {
            var places = typeof window.getPlaces === 'function' ? window.getPlaces() : [];
            var html = '<option value="">-- Select birthplace --</option>';
            for (var i = 0; i < places.length; i++) {
                if (places[i].variableKey && places[i].variableKey !== '') {
                    html += '<option value="' + places[i].id + '">' + _escapeHtml(places[i].displayName) + '</option>';
                }
            }
            birthplaceSelect.innerHTML = html;
        }
    }, 100);
}

// =============================================================================
// 6. EDIT CHARACTER MODAL
// =============================================================================

function openEditCharacterModal(characterId, onSuccess) {
    var queries = _getQueries();
    var commands = _getCommands();

    if (!queries || !commands) {
        _showToast('Character system not available', 'error');
        return;
    }

    var character = queries.getCharacter(characterId);
    if (!character) {
        _showToast('Character not found', 'error');
        return;
    }

    var age = _calculateAge(character.birthYear, character.isDeceased, character.deathYear);
    var location = _getCurrentLocation(character);
    var rank = _getActiveRankDisplay(character);

    // ================================================================
    // NEW: Get family info for display
    // ================================================================
    var familyInfo = null;
    var fa = _getFamilyAccessors();
    if (fa && typeof fa.getFamilyStatistics === 'function') {
        familyInfo = fa.getFamilyStatistics(characterId);
    }

    var parentDisplay = '';
    if (familyInfo && (familyInfo.parents?.father || familyInfo.parents?.mother)) {
        var parentNames = [];
        if (familyInfo.parents.father) parentNames.push(familyInfo.parents.father.name);
        if (familyInfo.parents.mother) parentNames.push(familyInfo.parents.mother.name);
        parentDisplay = ' · Parents: ' + parentNames.join(' & ');
    }

    var modalContent = '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">' +
        '<div style="margin-bottom: 12px; padding: 8px; background: var(--bg2); border-radius: 6px; font-size: 0.65rem;">' +
        '<div><strong>' + _escapeHtml(character.name) + ' ' + _escapeHtml(character.surname || '') + '</strong></div>' +
        '<div style="color: var(--dim); font-size: 0.6rem;">' + age + ' years · ' + _escapeHtml(location) + (rank ? ' · ' + _escapeHtml(rank.display) : '') + parentDisplay + '</div>' +
        '</div>' +

        '<div class="form-group" style="margin-bottom: 12px;">' +
        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">First Name</label>' +
        '<input type="text" id="editCharFirstName" value="' + _escapeHtml(character.name) + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
        '</div>' +

        '<div class="form-group" style="margin-bottom: 12px;">' +
        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Surname</label>' +
        '<input type="text" id="editCharSurname" value="' + _escapeHtml(character.surname || '') + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
        '</div>' +

        '<div class="form-group" style="margin-bottom: 12px;">' +
        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Gender</label>' +
        '<select id="editCharGender" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
        '<option value="male" ' + (character.gender === 'male' ? 'selected' : '') + '>Male</option>' +
        '<option value="female" ' + (character.gender === 'female' ? 'selected' : '') + '>Female</option>' +
        '<option value="unknown" ' + (character.gender === 'unknown' ? 'selected' : '') + '>Unknown</option>' +
        '</select>' +
        '</div>' +

        '<div class="form-group" style="margin-bottom: 12px;">' +
        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Birth Year</label>' +
        '<input type="number" id="editCharBirthYear" value="' + (character.birthYear || '') + '" min="1" max="' + _getCurrentYear() + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
        '</div>' +

        // NEW: Parent editing section
        '<div style="margin-bottom: 12px; padding: 8px; background: var(--bg3); border-radius: 6px;">' +
        '<div style="font-size: 0.65rem; color: var(--accent); margin-bottom: 6px; font-weight: bold;">Family: Parents</div>' +
        '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">' +
        '<div class="form-group" style="margin-bottom: 0;">' +
        '<label style="display: block; font-size: 0.55rem; color: var(--dim); margin-bottom: 2px;">Father ID</label>' +
        '<input type="text" id="editCharFatherId" value="' + (character.fatherId || '') + '" placeholder="Current: ' + (character.fatherId ? 'Set' : 'None') + '" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px;">' +
        '</div>' +
        '<div class="form-group" style="margin-bottom: 0;">' +
        '<label style="display: block; font-size: 0.55rem; color: var(--dim); margin-bottom: 2px;">Mother ID</label>' +
        '<input type="text" id="editCharMotherId" value="' + (character.motherId || '') + '" placeholder="Current: ' + (character.motherId ? 'Set' : 'None') + '" style="width: 100%; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px;">' +
        '</div>' +
        '</div>' +
        '<small style="font-size: 0.5rem; color: var(--dim);">Leave empty to remove parent relationship</small>' +
        '</div>' +

        '<div class="form-group" style="margin-bottom: 12px;">' +
        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes</label>' +
        '<textarea id="editCharNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' + _escapeHtml(character.notes || '') + '</textarea>' +
        '</div>' +
        '</div>';

    _openModal({
        title: 'Edit Character: ' + character.name,
        content: modalContent,
        confirmText: 'Save',
        cancelText: 'Cancel',
        onConfirm: function() {
            var name = document.getElementById('editCharFirstName').value.trim();
            var surname = document.getElementById('editCharSurname').value.trim();
            var gender = document.getElementById('editCharGender').value;
            var birthYear = parseInt(document.getElementById('editCharBirthYear').value);
            var fatherId = document.getElementById('editCharFatherId').value.trim() || null;
            var motherId = document.getElementById('editCharMotherId').value.trim() || null;
            var notes = document.getElementById('editCharNotes').value;

            if (!name) {
                _showToast('Name is required', 'error');
                return false;
            }

            var updates = {
                name: name,
                surname: surname,
                gender: gender,
                birthYear: birthYear,
                notes: notes
            };

            // Only update parent IDs if they've changed
            if (fatherId !== character.fatherId) updates.fatherId = fatherId;
            if (motherId !== character.motherId) updates.motherId = motherId;

            var result = commands.updateCharacter(characterId, updates);

            if (result && result.success) {
                _showToast('Character updated', 'success');
                _closeTopModal();
                if (onSuccess) onSuccess();
                return true;
            } else {
                _showToast('Failed to update character: ' + (result ? result.reason : 'Unknown error'), 'error');
                return false;
            }
        }
    });
}

// =============================================================================
// 7. DELETE CHARACTER MODAL
// =============================================================================

function openDeleteCharacterModal(characterId, onSuccess) {
    var queries = _getQueries();
    var commands = _getCommands();

    if (!queries || !commands) {
        _showToast('Character system not available', 'error');
        return;
    }

    var character = queries.getCharacter(characterId);
    if (!character) {
        _showToast('Character not found', 'error');
        return;
    }

    // Check if character has children (warn user)
    var hasChildren = false;
    var childCount = 0;
    var fa = _getFamilyAccessors();
    if (fa && typeof fa.hasChildren === 'function') {
        hasChildren = fa.hasChildren(characterId, true, false);
        if (hasChildren) {
            var children = fa.getAllChildren(characterId, false);
            if (children) childCount = children.length;
        }
    } else if (character.children && character.children.length > 0) {
        hasChildren = true;
        childCount = character.children.length;
    }

    var warningMsg = '';
    if (hasChildren) {
        warningMsg = ' Warning: This character has ' + childCount + ' child' + (childCount > 1 ? 'ren' : '') + '. Deleting them may orphan their children.';
    }

    _confirmDialog(
        'Delete "' + character.name + (character.surname ? ' ' + character.surname : '') + '" permanently?' + warningMsg,
        'Delete Character',
        function() {
            var result = commands.deleteCharacter(characterId);
            if (result && result.success) {
                _showToast('Deleted: ' + character.name, 'info');
                if (onSuccess) onSuccess();
            } else {
                _showToast('Failed to delete character: ' + (result ? result.reason : 'Unknown error'), 'error');
            }
        }
    );
}

// =============================================================================
// 8. VIEW FAMILY MODAL (NEW)
// =============================================================================

function openFamilyViewModal(characterId) {
    var queries = _getQueries();
    if (!queries) {
        _showToast('Character system not available', 'error');
        return;
    }

    var character = queries.getCharacter(characterId);
    if (!character) {
        _showToast('Character not found', 'error');
        return;
    }

    var fa = _getFamilyAccessors();
    if (!fa) {
        _showToast('Family accessors not available', 'error');
        return;
    }

    var familyInfo = fa.getFamilyStatistics(characterId);
    if (!familyInfo) {
        _showToast('Family data not available', 'error');
        return;
    }

    var personIcon = _getIcon('PERSON');
    var infoIcon = _getIcon('CIRCLE_DOT');
    var locationIcon = _getIcon('LOCATION');
    var householdIcon = _getIcon('HOUSEHOLD');

    // Build family members list
    function renderFamilyList(title, members, emptyMessage) {
        if (!members || members.length === 0) {
            return '<div style="color: var(--dim); font-size: 0.6rem; padding: 4px 0;">' + (emptyMessage || 'None') + '</div>';
        }
        var html = '<div style="margin: 4px 0;">';
        for (var i = 0; i < members.length; i++) {
            var m = members[i];
            var char = m.character || m;
            if (!char || !char.id) continue;
            var age = _calculateAge(char.birthYear, char.isDeceased, char.deathYear);
            var status = char.isDeceased ? '†' : '';
            var relationship = m.relationship || m.type || '';
            html += '<div style="font-size: 0.6rem; padding: 2px 0; border-bottom: 1px solid var(--border-light);">' +
                (char.gender === 'male' ? '♂' : (char.gender === 'female' ? '♀' : '⚥')) + ' ' +
                _escapeHtml(char.name) + ' ' + _escapeHtml(char.surname || '') +
                (status ? ' <span style="color: var(--dim);">' + status + '</span>' : '') +
                (relationship ? ' <span style="color: var(--dim); font-size: 0.5rem;">(' + _escapeHtml(relationship) + ')</span>' : '') +
                ' <span style="color: var(--dim); font-size: 0.5rem;">' + age + 'y</span>' +
                '</div>';
        }
        html += '</div>';
        return html;
    }

    // Get children with relationship info
    var children = fa.getAllChildren(characterId, false);
    var childrenList = children ? children.map(function(c) {
        return { character: c.character, relationship: c.type };
    }) : [];

    // Get parents
    var parents = fa.getParents(characterId);
    var parentList = [];
    if (parents.father) parentList.push({ character: parents.father, relationship: 'Father' });
    if (parents.mother) parentList.push({ character: parents.mother, relationship: 'Mother' });

    // Get siblings
    var siblings = fa.getSiblings(characterId, true, false);
    var siblingList = siblings ? siblings.map(function(s) {
        return { character: s.character, relationship: s.type === 'half' ? 'Half-Sibling' : 'Sibling' };
    }) : [];

    // Get spouses
    var spouses = fa.getSpouses(characterId, true);
    var spouseList = spouses ? spouses.map(function(s) {
        return { character: s, relationship: 'Spouse' };
    }) : [];

    // Get grandchildren
    var grandchildren = fa.getGrandchildren(characterId, false);
    var grandchildList = grandchildren ? grandchildren.map(function(g) {
        return { character: g, relationship: 'Grandchild' };
    }) : [];

    var modalContent = '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">' +

        '<div style="margin-bottom: 12px; padding: 8px; background: var(--bg2); border-radius: 6px;">' +
        '<div style="font-size: 0.8rem; font-weight: bold;">' + _escapeHtml(character.name) + ' ' + _escapeHtml(character.surname || '') + '</div>' +
        '<div style="font-size: 0.6rem; color: var(--dim);">' + (character.gender || 'Unknown') + ' · ' + (_calculateAge(character.birthYear, character.isDeceased, character.deathYear) || '?') + ' years</div>' +
        '</div>' +

        '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">' +

        // Parents
        '<div style="background: var(--bg3); padding: 8px; border-radius: 6px;">' +
        '<div style="font-size: 0.6rem; color: var(--accent); font-weight: bold; margin-bottom: 4px;">Parents</div>' +
        renderFamilyList('Parents', parentList, 'Unknown') +
        '</div>' +

        // Spouse
        '<div style="background: var(--bg3); padding: 8px; border-radius: 6px;">' +
        '<div style="font-size: 0.6rem; color: var(--accent); font-weight: bold; margin-bottom: 4px;">Spouse</div>' +
        renderFamilyList('Spouse', spouseList, 'Single') +
        '</div>' +

        // Children
        '<div style="background: var(--bg3); padding: 8px; border-radius: 6px;">' +
        '<div style="font-size: 0.6rem; color: var(--accent); font-weight: bold; margin-bottom: 4px;">Children (' + childrenList.length + ')</div>' +
        renderFamilyList('Children', childrenList, 'None') +
        '</div>' +

        // Siblings
        '<div style="background: var(--bg3); padding: 8px; border-radius: 6px;">' +
        '<div style="font-size: 0.6rem; color: var(--accent); font-weight: bold; margin-bottom: 4px;">Siblings (' + siblingList.length + ')</div>' +
        renderFamilyList('Siblings', siblingList, 'None') +
        '</div>' +

        // Grandchildren (full width)
        '<div style="background: var(--bg3); padding: 8px; border-radius: 6px; grid-column: 1 / -1;">' +
        '<div style="font-size: 0.6rem; color: var(--accent); font-weight: bold; margin-bottom: 4px;">Grandchildren (' + grandchildList.length + ')</div>' +
        renderFamilyList('Grandchildren', grandchildList, 'None') +
        '</div>' +

        '</div>' +

        '<div style="margin-top: 10px; padding: 6px; background: var(--bg2); border-radius: 4px; font-size: 0.5rem; color: var(--dim);">' +
        infoIcon + ' Total family members: ' + familyInfo.totalFamilyMembers +
        ' · ' + (familyInfo.isOrphan ? 'Orphan' : 'Has parents') +
        ' · ' + (familyInfo.hasChildren ? 'Has children' : 'No children') +
        '</div>' +
        '</div>';

    _openModal({
        title: personIcon + ' Family Tree: ' + character.name,
        content: modalContent,
        confirmText: 'Close',
        cancelText: '',
        onConfirm: function() {}
    });
}

// =============================================================================
// 9. EXPORTS
// =============================================================================

window.openCreateCharacterModal = openCreateCharacterModal;
window.openEditCharacterModal = openEditCharacterModal;
window.openDeleteCharacterModal = openDeleteCharacterModal;
window.openCharacterDetailsModal = openCharacterDetailsModal;
window.openFamilyViewModal = openFamilyViewModal; // NEW

window._openCharacterSelectorForCharacter = _openCharacterSelectorForCharacter;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        openCreateCharacterModal: openCreateCharacterModal,
        openEditCharacterModal: openEditCharacterModal,
        openDeleteCharacterModal: openDeleteCharacterModal,
        openCharacterDetailsModal: openCharacterDetailsModal,
        openFamilyViewModal: openFamilyViewModal
    };
}