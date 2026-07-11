/**
 * =============================================================================
 * STILL WATERS - CHARACTER MODALS (js/core/modals/modals-character.js)
 * =============================================================================
 * 
 * UPDATED: Uses CharacterState, CharacterCommands, CharacterQueries
 * UPDATED: Uses CharacterLifecycle for death operations
 * UPDATED: Uses openCharacterSelector from modals-charSelect.js
 * UPDATED: Uses icons from icons.js (no emojis)
 * UPDATED: No icons in confirm/cancel buttons
 * UPDATED: No console logs
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

function _showToast(msg, type) {
    if (typeof window._showToast === 'function') {
        window._showToast(msg, type);
    } else if (typeof window.showToast === 'function') {
        window.showToast(msg, type);
    } else if (typeof window.showToastMessage === 'function') {
        window.showToastMessage(msg, type);
    }
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
            preset: options.preset || null
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
            preset: options.preset || null
        });
        return true;
    }

    _showToast('Character selector not available', 'warning');
    return false;
}

// =============================================================================
// 2. CREATE CHARACTER MODAL
// =============================================================================

function openCreateCharacterModal(onSuccess) {
    var commands = _getCommands();
    if (!commands) {
        _showToast('Character system not available', 'error');
        return;
    }

    var currentYear = _getCurrentYear();
    var defaultBirthYear = currentYear - 25;

    var modalContent = `
        <div style="max-height: 500px; overflow-y: auto; padding: 4px;">
            <div style="margin-bottom: 12px; padding: 8px; background: var(--bg2); border-radius: 6px; font-size: 0.65rem; color: var(--dim);">
                Create a new character for the world of Still Waters.
            </div>

            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">First Name *</label>
                <input type="text" id="charFirstName" placeholder="Enter first name" autofocus style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">
            </div>

            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Surname</label>
                <input type="text" id="charSurname" placeholder="Enter surname (optional)" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">
                <small style="font-size: 0.55rem; color: var(--dim);">Leave blank to generate from cultural data (if available)</small>
            </div>

            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Gender</label>
                <select id="charGender" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="unknown">Unknown</option>
                </select>
            </div>

            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Birth Year</label>
                <input type="number" id="charBirthYear" value="' + defaultBirthYear + '" min="1" max="' + currentYear + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">
            </div>

            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Birthplace</label>
                <select id="charBirthplace" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">
                    <option value="">-- Select birthplace --</option>
                </select>
                <small style="font-size: 0.55rem; color: var(--dim);">Cultural names will be based on this location's country.</small>
            </div>

            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes (optional)</label>
                <textarea id="charNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;" placeholder="Additional notes..."></textarea>
            </div>
        </div>
    `;

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

    // Populate birthplace dropdown
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
// 3. EDIT CHARACTER MODAL
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

    var modalContent = `
        <div style="max-height: 500px; overflow-y: auto; padding: 4px;">
            <div style="margin-bottom: 12px; padding: 8px; background: var(--bg2); border-radius: 6px; font-size: 0.65rem;">
                <div><strong>' + _escapeHtml(character.name) + ' ' + _escapeHtml(character.surname || '') + '</strong></div>
                <div style="color: var(--dim); font-size: 0.6rem;">' + age + ' years · ' + _escapeHtml(location) + (rank ? ' · ' + _escapeHtml(rank.display) : '') + '</div>
            </div>

            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">First Name</label>
                <input type="text" id="editCharFirstName" value="' + _escapeHtml(character.name) + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">
            </div>

            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Surname</label>
                <input type="text" id="editCharSurname" value="' + _escapeHtml(character.surname || '') + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">
            </div>

            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Gender</label>
                <select id="editCharGender" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">
                    <option value="male" ' + (character.gender === 'male' ? 'selected' : '') + '>Male</option>
                    <option value="female" ' + (character.gender === 'female' ? 'selected' : '') + '>Female</option>
                    <option value="unknown" ' + (character.gender === 'unknown' ? 'selected' : '') + '>Unknown</option>
                </select>
            </div>

            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Birth Year</label>
                <input type="number" id="editCharBirthYear" value="' + (character.birthYear || '') + '" min="1" max="' + _getCurrentYear() + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">
            </div>

            <div class="form-group" style="margin-bottom: 12px;">
                <label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes</label>
                <textarea id="editCharNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' + _escapeHtml(character.notes || '') + '</textarea>
            </div>
        </div>
    `;

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
            var notes = document.getElementById('editCharNotes').value;

            if (!name) {
                _showToast('Name is required', 'error');
                return false;
            }

            var result = commands.updateCharacter(characterId, {
                name: name,
                surname: surname,
                gender: gender,
                birthYear: birthYear,
                notes: notes
            });

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
// 4. DELETE CHARACTER MODAL
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

    _confirmDialog(
        'Delete "' + character.name + (character.surname ? ' ' + character.surname : '') + '" permanently?',
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
// 5. CHARACTER DETAILS MODAL
// =============================================================================

function openCharacterDetailsModal(characterId, onSuccess) {
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

    var age = _calculateAge(character.birthYear, character.isDeceased, character.deathYear);
    var location = _getCurrentLocation(character);
    var rank = _getActiveRankDisplay(character);

    var modalContent = `
        <div style="max-height: 500px; overflow-y: auto; padding: 4px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                <div style="background: var(--bg2); padding: 12px; border-radius: 8px;">
                    <div style="font-size: 0.6rem; color: var(--dim);">Name</div>
                    <div style="font-size: 0.9rem; font-weight: bold;">' + _escapeHtml(character.name) + ' ' + _escapeHtml(character.surname || '') + '</div>
                    <div style="font-size: 0.65rem; color: var(--dim);">' + (rank ? _escapeHtml(rank.display) : '') + '</div>
                </div>
                <div style="background: var(--bg2); padding: 12px; border-radius: 8px;">
                    <div style="font-size: 0.6rem; color: var(--dim);">Status</div>
                    <div style="font-size: 0.9rem; font-weight: bold; color: ' + (character.isDeceased ? 'var(--dim)' : 'var(--success)') + ';">' + (character.isDeceased ? 'Deceased' : 'Living') + '</div>
                    <div style="font-size: 0.65rem; color: var(--dim);">' + age + ' years</div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                <div style="background: var(--bg2); padding: 12px; border-radius: 8px;">
                    <div style="font-size: 0.6rem; color: var(--dim);">Gender</div>
                    <div style="font-size: 0.85rem;">' + _escapeHtml(character.gender || 'Unknown') + '</div>
                </div>
                <div style="background: var(--bg2); padding: 12px; border-radius: 8px;">
                    <div style="font-size: 0.6rem; color: var(--dim);">Location</div>
                    <div style="font-size: 0.85rem;">' + _escapeHtml(location) + '</div>
                </div>
            </div>

            <div style="margin-bottom: 12px;">
                <div style="background: var(--bg2); padding: 12px; border-radius: 8px;">
                    <div style="font-size: 0.6rem; color: var(--dim);">Birth Year</div>
                    <div style="font-size: 0.85rem;">' + (character.birthYear || 'Unknown') + '</div>
                    ' + (character.isDeceased && character.deathYear ? '<div style="font-size: 0.6rem; color: var(--dim); margin-top: 4px;">Death Year: ' + character.deathYear + (character.deathCause ? ' · ' + _escapeHtml(character.deathCause) : '') + '</div>' : '') + '
                </div>
            </div>

            ' + (character.notes ? '<div style="font-size: 0.55rem; color: var(--dim); padding: 8px; background: var(--bg3); border-radius: 6px; margin-bottom: 12px;">' + _escapeHtml(character.notes) + '</div>' : '') + '

            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <button id="editCharBtn" class="btn primary" style="font-size: 0.7rem; padding: 4px 12px;">Edit</button>
                ' + (!character.isDeceased ? '<button id="killCharBtn" class="btn danger" style="font-size: 0.7rem; padding: 4px 12px;">Kill</button>' : '') + '
                <button id="deleteCharBtn" class="btn danger" style="font-size: 0.7rem; padding: 4px 12px;">Delete</button>
            </div>
        </div>
    `;

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
// 6. EXPORTS
// =============================================================================

window.openCreateCharacterModal = openCreateCharacterModal;
window.openEditCharacterModal = openEditCharacterModal;
window.openDeleteCharacterModal = openDeleteCharacterModal;
window.openCharacterDetailsModal = openCharacterDetailsModal;

window._openCharacterSelectorForCharacter = _openCharacterSelectorForCharacter;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        openCreateCharacterModal: openCreateCharacterModal,
        openEditCharacterModal: openEditCharacterModal,
        openDeleteCharacterModal: openDeleteCharacterModal,
        openCharacterDetailsModal: openCharacterDetailsModal
    };
}