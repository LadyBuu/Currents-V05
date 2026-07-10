/**
 * =============================================================================
 * HOUSEHOLD MODALS (modals-household.js)
 * =============================================================================
 * 
 * PURPOSE: UI modals for household management (CRUD, member management,
 *          department management, head management, transfers, and more).
 * 
 * DEPENDS ON:
 *   - modals-core.js (openModal, closeTopModal, _escapeHtml, _showToast, _getIcon)
 *   - modals-char-select.js (openCharacterSelector)
 *   - modals-household-selector.js (openHouseholdSelector)
 *   - household-state.js (HouseholdState)
 *   - household-commands.js (HouseholdCommands)
 *   - household-queries.js (HouseholdQueries)
 *   - household-assignment.js (HouseholdAssignment)
 * 
 * EXPORTS:
 *   - openNewHouseholdModal()
 *   - openEditHouseholdModal()
 *   - openDeleteHouseholdModal()
 *   - openHouseholdDetailsModal()
 *   - openRenameHouseholdModal()
 *   - openAddMemberModal()
 *   - openEditMemberModal()
 *   - openTransferMemberModal()
 *   - openSetHeadOfHouseholdModal()
 *   - openAddDepartmentModal()
 *   - openJoinHouseholdModal()
 *   - openViewHouseholdHistoryModal()
 *   - openLeaveHouseholdModal()
 *   - openLeaveHouseholdNoTraceModal()
 * 
 * ICON POLICY:
 *   - All icons from icons.js via _getIcon()
 *   - NO emojis
 *   - NO icons in confirm/cancel buttons (plain text only)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. RECURSION GUARD
    // =========================================================================

    var _processingModal = false;

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _openModal(options) {
        if (typeof window.openModal === 'function') {
            return window.openModal(options);
        }
        if (typeof window._openModal === 'function') {
            return window._openModal(options);
        }
        return null;
    }

    function _closeTopModal() {
        if (typeof window.closeTopModal === 'function') {
            window.closeTopModal();
        }
        if (typeof window._closeTopModal === 'function') {
            window._closeTopModal();
        }
    }

    function _confirmDialog(message, title, onConfirm, onCancel) {
        if (typeof window.confirmDialog === 'function') {
            return window.confirmDialog(message, title, onConfirm, onCancel);
        }
        if (typeof window._confirmDialog === 'function') {
            return window._confirmDialog(message, title, onConfirm, onCancel);
        }
        if (confirm(message)) {
            if (onConfirm) onConfirm();
        } else {
            if (onCancel) onCancel();
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
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(message, type);
        }
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

    function _getIcon(name) {
        if (typeof window._getIcon === 'function') {
            return window._getIcon(name);
        }
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    function _buildLocationDropdown(selectedId, placeholderText, includeAll) {
        if (typeof window.buildLocationDropdown === 'function') {
            return window.buildLocationDropdown(selectedId, placeholderText, includeAll, true);
        }
        if (typeof window._buildLocationDropdown === 'function') {
            return window._buildLocationDropdown(selectedId, placeholderText, includeAll, true);
        }
        return '';
    }

    function _openCharacterSelector(options) {
        if (typeof window.openCharacterSelector === 'function') {
            return window.openCharacterSelector(options);
        }
        if (typeof window.openUnifiedCharacterSelector === 'function') {
            return window.openUnifiedCharacterSelector(options);
        }
        if (typeof window._openCharacterSelector === 'function') {
            return window._openCharacterSelector(options);
        }
        _showToast('Character selector not available', 'error');
        return null;
    }

    function _openHouseholdSelector(options) {
        if (typeof window.openHouseholdSelector === 'function') {
            return window.openHouseholdSelector(options);
        }
        if (typeof window._openHouseholdSelector === 'function') {
            return window._openHouseholdSelector(options);
        }
        _showToast('Household selector not available', 'error');
        return null;
    }

    // =========================================================================
    // 2. STATE AND COMMANDS REFERENCE
    // =========================================================================

    var _state = window.HouseholdState;
    var _commands = window.HouseholdCommands;
    var _queries = window.HouseholdQueries;
    var _assignment = window.HouseholdAssignment;

    // =========================================================================
    // 3. ICON HELPERS
    // =========================================================================

    function _getIconSafe(name) {
        var icon = _getIcon(name);
        return icon || '';
    }

    // =========================================================================
    // 4. BUSINESS LOGIC WRAPPERS
    // =========================================================================

    function _getHousehold(householdId) {
        return _state ? _state.getHousehold(householdId) : null;
    }

    function _getAllHouseholds() {
        return _state ? _state.getAllHouseholds() : [];
    }

    function _getHouseholdHead(householdId) {
        return _state ? _state.getHouseholdHead(householdId) : null;
    }

    function _getCharacterHousehold(characterId) {
        return _state ? _state.getCharacterHousehold(characterId) : null;
    }

    function _getCharacterById(characterId) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(characterId);
        }
        return null;
    }

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        return [];
    }

    function _getPlaceById(placeId) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(placeId);
        }
        return null;
    }

    function _getHouseholdStatus(householdId) {
        return _state ? _state.getHouseholdStatus(householdId) : null;
    }

    function _getHouseholdMembers(householdId) {
        var household = _getHousehold(householdId);
        return household ? (household.members || []) : [];
    }

    function _getDepartments(householdId) {
        var household = _getHousehold(householdId);
        return household ? (household.departments || []) : [];
    }

    function _getHouseholdNameHistory(householdId) {
        var household = _getHousehold(householdId);
        return household ? (household.nameHistory || []) : [];
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

    // =========================================================================
    // 5. NEW HOUSEHOLD MODAL
    // =========================================================================

    function openNewHouseholdModal(onSuccess, options) {
        if (_processingModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingModal = true;

        try {
            options = options || {};
            var currentYear = _getCurrentYear();

            var suggestedName = options.suggestedName || '';
            var suggestedHeadId = options.suggestedHeadId || null;
            var suggestedLocationId = options.suggestedLocationId || null;
            var suggestedFoundedYear = options.suggestedFoundedYear || currentYear;

            var locationOptions = _buildLocationDropdown(suggestedLocationId, '— No location —', false);

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Household Name *</label>' +
                '<input type="text" id="newHouseholdName" value="' + _escapeHtml(suggestedName) + '" placeholder="e.g., House of Stark" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Location</label>' +
                '<select id="newHouseholdLocation" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                locationOptions +
                '</select>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Founded Year</label>' +
                '<input type="number" id="newHouseholdFoundedYear" value="' + suggestedFoundedYear + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Founder / Head</label>' +
                '<div style="display: flex; gap: 8px;">' +
                '<input type="text" id="newHouseholdHeadName" placeholder="Select a character..." readonly style="flex: 1; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem; cursor: pointer; color: var(--text);">' +
                '<input type="hidden" id="newHouseholdHeadId" value="">' +
                '<button id="newHouseholdSelectHeadBtn" class="btn small" style="padding: 4px 12px; font-size: 0.6rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 4px; cursor: pointer;">Select</button>' +
                '<button id="newHouseholdClearHeadBtn" class="btn small" style="padding: 4px 12px; font-size: 0.6rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Clear</button>' +
                '</div>' +
                '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">Selecting a head will add them to the household</div>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes (optional)</label>' +
                '<textarea id="newHouseholdNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;"></textarea>' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Create New Household',
                content: modalContent,
                confirmText: 'Create Household',
                cancelText: 'Cancel',
                onOpen: function() {
                    var headNameInput = document.getElementById('newHouseholdHeadName');
                    var headIdInput = document.getElementById('newHouseholdHeadId');
                    var selectHeadBtn = document.getElementById('newHouseholdSelectHeadBtn');
                    var clearHeadBtn = document.getElementById('newHouseholdClearHeadBtn');

                    if (selectHeadBtn) {
                        selectHeadBtn.onclick = function() {
                            _openCharacterSelector({
                                title: 'Select Household Head',
                                targetId: null,
                                filters: {
                                    showDeceased: false,
                                    gender: 'all',
                                    ageGroup: 'all',
                                    location: 'all',
                                    role: 'all'
                                },
                                onSelect: function(character) {
                                    if (character) {
                                        if (headNameInput) {
                                            headNameInput.value = character.name + ' ' + (character.surname || '');
                                        }
                                        if (headIdInput) {
                                            headIdInput.value = character.id;
                                        }
                                        _showToast('Selected: ' + character.name, 'success');
                                    }
                                }
                            });
                        };
                    }

                    if (clearHeadBtn) {
                        clearHeadBtn.onclick = function() {
                            if (headNameInput) headNameInput.value = '';
                            if (headIdInput) headIdInput.value = '';
                        };
                    }

                    var nameInput = document.getElementById('newHouseholdName');
                    if (nameInput) {
                        setTimeout(function() { nameInput.focus(); }, 100);
                    }
                },
                onConfirm: function() {
                    var name = document.getElementById('newHouseholdName').value.trim();
                    var locationId = document.getElementById('newHouseholdLocation').value;
                    var foundedYear = parseInt(document.getElementById('newHouseholdFoundedYear').value);
                    var headId = document.getElementById('newHouseholdHeadId').value;
                    var notes = document.getElementById('newHouseholdNotes').value.trim();

                    if (!name) {
                        _showToast('Please enter a household name', 'error');
                        return false;
                    }

                    if (isNaN(foundedYear) || foundedYear < 1) {
                        _showToast('Please enter a valid year', 'error');
                        return false;
                    }

                    var newHousehold = _state.createHousehold(name, locationId || null, {
                        foundedYear: foundedYear,
                        notes: notes,
                        founderId: headId || null
                    });

                    if (!newHousehold) {
                        _showToast('Failed to create household', 'error');
                        return false;
                    }

                    if (headId) {
                        var headChar = _getCharacterById(headId);
                        if (headChar) {
                            _commands.addMember(newHousehold.id, headId, 'family', {
                                role: 'Head of Household',
                                joinedYear: foundedYear,
                                isHead: true,
                                notes: 'Founder and head of household'
                            });
                            _showToast(headChar.name + ' added as head', 'success');
                        }
                    }

                    _closeTopModal();
                    _processingModal = false;
                    if (onSuccess) {
                        onSuccess(newHousehold.id);
                    }
                    return true;
                },
                onCancel: function() {
                    _processingModal = false;
                }
            });

        } catch (e) {
            _processingModal = false;
            _showToast('Error opening new household modal', 'error');
        }
    }

    // =========================================================================
    // 6. EDIT HOUSEHOLD MODAL
    // =========================================================================

    function openEditHouseholdModal(householdId, onSuccess) {
        if (_processingModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingModal = false;
                return;
            }

            var currentYear = _getCurrentYear();
            var locationOptions = _buildLocationDropdown(household.locationId, '— No location —', false);
            var nameHistory = _getHouseholdNameHistory(householdId);

            var historyHtml = '';
            if (nameHistory && nameHistory.length > 0) {
                var recent = nameHistory.slice(-5).reverse();
                historyHtml = '<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-light);">' +
                    '<div style="font-size: 0.55rem; color: var(--dim); margin-bottom: 4px;">Previous names:</div>';
                for (var i = 0; i < recent.length; i++) {
                    var h = recent[i];
                    historyHtml += '<div style="font-size: 0.5rem; color: var(--dim); padding: 2px 0;">' +
                        h.year + ': ' + _escapeHtml(h.oldName || '—') + ' → ' + _escapeHtml(h.newName) +
                        '</div>';
                }
                historyHtml += '</div>';
            }

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: var(--bg3); border-radius: 6px; padding: 10px 12px; margin-bottom: 12px; font-size: 0.6rem; color: var(--dim);">' +
                'Editing <strong>' + _escapeHtml(household.name) + '</strong>' +
                ' · Founded: ' + (household.foundedYear || 'Unknown') +
                ' · Location: ' + (household.locationName || 'None') +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Household Name *</label>' +
                '<input type="text" id="editHouseholdName" value="' + _escapeHtml(household.name) + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div style="margin-bottom: 12px; padding: 8px; background: var(--bg3); border-radius: 6px;">' +
                '<label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.65rem;">' +
                '<input type="checkbox" id="editRenameWithHistory" checked>' +
                '<span>Record this name change in history</span>' +
                '</label>' +
                '<div id="editRenameHistoryOptions" style="margin-top: 8px; padding-left: 24px;">' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">' +
                '<div><label style="font-size: 0.55rem; color: var(--dim);">Year of change</label>' +
                '<input type="number" id="editRenameYear" value="' + currentYear + '" min="1" max="' + (currentYear + 5) + '" style="width: 100%; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.55rem; color: var(--text);">' +
                '</div>' +
                '<div><label style="font-size: 0.55rem; color: var(--dim);">Reason (optional)</label>' +
                '<input type="text" id="editRenameReason" placeholder="e.g., Succession, Renovation..." style="width: 100%; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.55rem; color: var(--text);">' +
                '</div>' +
                '</div></div></div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Founding Year</label>' +
                '<input type="number" id="editHouseholdFoundedYear" value="' + (household.foundedYear || currentYear) + '" min="1" max="' + (currentYear + 5) + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Location</label>' +
                '<select id="editHouseholdLocation" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                locationOptions +
                '</select>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes</label>' +
                '<textarea id="editHouseholdNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' + _escapeHtml(household.notes || '') + '</textarea>' +
                '</div>' +
                historyHtml +
                '</div>';

            _openModal({
                title: 'Edit Household: ' + household.name,
                content: modalContent,
                confirmText: 'Save Changes',
                cancelText: 'Cancel',
                onOpen: function() {
                    var historyCheckbox = document.getElementById('editRenameWithHistory');
                    var historyOptions = document.getElementById('editRenameHistoryOptions');
                    if (historyCheckbox && historyOptions) {
                        historyCheckbox.onchange = function() {
                            historyOptions.style.display = this.checked ? 'block' : 'none';
                        };
                    }
                    var nameInput = document.getElementById('editHouseholdName');
                    if (nameInput) {
                        setTimeout(function() { nameInput.focus(); }, 100);
                    }
                },
                onConfirm: function() {
                    var name = document.getElementById('editHouseholdName').value.trim();
                    var locationId = document.getElementById('editHouseholdLocation').value;
                    var foundedYear = parseInt(document.getElementById('editHouseholdFoundedYear').value);
                    var notes = document.getElementById('editHouseholdNotes').value.trim();
                    var renameWithHistory = document.getElementById('editRenameWithHistory').checked;
                    var renameYear = parseInt(document.getElementById('editRenameYear').value);
                    var renameReason = document.getElementById('editRenameReason').value.trim();

                    if (!name) {
                        _showToast('Please enter a household name', 'error');
                        return false;
                    }

                    if (isNaN(foundedYear) || foundedYear < 1) {
                        _showToast('Please enter a valid founding year', 'error');
                        return false;
                    }

                    var updates = {
                        locationId: locationId || null,
                        foundedYear: foundedYear,
                        notes: notes
                    };

                    if (name !== household.name) {
                        var nameResult = _state.updateHousehold(householdId, { name: name }, {
                            recordHistory: renameWithHistory,
                            changeYear: renameYear || currentYear,
                            changeReason: renameReason || 'Edited'
                        });

                        if (!nameResult) {
                            _showToast('Failed to rename household', 'error');
                            return false;
                        }

                        if (renameWithHistory) {
                            _showToast('Household renamed to "' + name + '" (' + (renameYear || currentYear) + ')', 'success');
                        } else {
                            _showToast('Household name changed (no trace)', 'info');
                        }
                    }

                    var result = _state.updateHousehold(householdId, updates, { recordHistory: false });

                    if (result) {
                        _showToast('Household updated', 'success');
                        _closeTopModal();
                        _processingModal = false;
                        if (onSuccess) {
                            onSuccess();
                        }
                    } else {
                        _showToast('Failed to update household', 'error');
                    }
                    return true;
                },
                onCancel: function() {
                    _processingModal = false;
                }
            });

        } catch (e) {
            _processingModal = false;
            _showToast('Error opening edit household modal', 'error');
        }
    }

    // =========================================================================
    // 7. DELETE HOUSEHOLD MODAL
    // =========================================================================

    function openDeleteHouseholdModal(householdId, onSuccess) {
        if (_processingModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingModal = false;
                return;
            }

            var memberCount = household.members ? household.members.length : 0;

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: rgba(244, 67, 54, 0.1); border-radius: 8px; padding: 16px; border-left: 3px solid #f44336; margin-bottom: 16px;">' +
                '<div style="font-size: 0.9rem; color: #f44336;">Warning: This action cannot be undone</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim); margin-top: 4px;">' +
                'Deleting "' + _escapeHtml(household.name) + '" will remove it from the game world.' +
                (memberCount > 0 ? ' ' + memberCount + ' member(s) will be unassigned.' : '') +
                '</div>' +
                '</div>' +
                '<div style="background: var(--bg3); border-radius: 8px; padding: 12px; margin-bottom: 12px;">' +
                '<div style="display: flex; justify-content: space-between; font-size: 0.7rem;">' +
                '<span>Name:</span>' +
                '<span style="font-weight: bold;">' + _escapeHtml(household.name) + '</span>' +
                '</div>' +
                '<div style="display: flex; justify-content: space-between; font-size: 0.7rem; margin-top: 4px;">' +
                '<span>Members:</span>' +
                '<span>' + memberCount + '</span>' +
                '</div>' +
                '<div style="display: flex; justify-content: space-between; font-size: 0.7rem; margin-top: 4px;">' +
                '<span>Founded:</span>' +
                '<span>' + (household.foundedYear || 'Unknown') + '</span>' +
                '</div>' +
                '</div>' +
                '<div style="font-size: 0.6rem; color: var(--warn);">' +
                'Are you sure you want to delete this household?' +
                '</div>' +
                '<div class="form-group" style="margin-top: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Type "<strong>' + _escapeHtml(household.name) + '</strong>" to confirm</label>' +
                '<input type="text" id="confirmDeleteHouseholdName" placeholder="Enter household name" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Delete Household: ' + household.name,
                content: modalContent,
                confirmText: 'Delete Household',
                cancelText: 'Cancel',
                confirmStyle: 'danger',
                onConfirm: function() {
                    var confirmName = document.getElementById('confirmDeleteHouseholdName').value.trim();
                    if (confirmName !== household.name) {
                        _showToast('Household name does not match', 'error');
                        return false;
                    }

                    var result = _state.deleteHousehold(householdId, { force: true });
                    if (result) {
                        _showToast('Household "' + household.name + '" deleted', 'info');
                        _closeTopModal();
                        _processingModal = false;
                        if (onSuccess) {
                            onSuccess();
                        }
                    } else {
                        _showToast('Failed to delete household', 'error');
                    }
                    return true;
                },
                onCancel: function() {
                    _processingModal = false;
                }
            });

        } catch (e) {
            _processingModal = false;
            _showToast('Error opening delete household modal', 'error');
        }
    }

    // =========================================================================
    // 8. RENAME HOUSEHOLD MODAL
    // =========================================================================

    function openRenameHouseholdModal(householdId, onSuccess) {
        if (_processingModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingModal = false;
                return;
            }

            var currentYear = _getCurrentYear();
            var nameHistory = _getHouseholdNameHistory(householdId);

            var historyHtml = '';
            if (nameHistory && nameHistory.length > 0) {
                var recent = nameHistory.slice(-5).reverse();
                historyHtml = '<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-light);">' +
                    '<div style="font-size: 0.55rem; color: var(--dim); margin-bottom: 4px;">Previous names:</div>';
                for (var i = 0; i < recent.length; i++) {
                    var h = recent[i];
                    historyHtml += '<div style="font-size: 0.5rem; color: var(--dim); padding: 2px 0;">' +
                        h.year + ': ' + _escapeHtml(h.oldName || '—') + ' → ' + _escapeHtml(h.newName) +
                        '</div>';
                }
                historyHtml += '</div>';
            }

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: var(--bg3); border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; font-size: 0.6rem; color: var(--dim);">' +
                'Current name: <strong>' + _escapeHtml(household.name) + '</strong>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">New Name *</label>' +
                '<input type="text" id="renameHouseholdInput" value="' + _escapeHtml(household.name) + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div style="margin-bottom: 12px; padding: 8px; background: var(--bg3); border-radius: 6px;">' +
                '<label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.65rem;">' +
                '<input type="checkbox" id="renameWithHistory" checked>' +
                '<span>Record this name change in history</span>' +
                '</label>' +
                '<div id="renameHistoryOptions" style="margin-top: 8px; padding-left: 24px;">' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">' +
                '<div><label style="font-size: 0.55rem; color: var(--dim);">Year</label>' +
                '<input type="number" id="renameYear" value="' + currentYear + '" min="1" max="' + (currentYear + 5) + '" style="width: 100%; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.55rem; color: var(--text);">' +
                '</div>' +
                '<div><label style="font-size: 0.55rem; color: var(--dim);">Reason (optional)</label>' +
                '<input type="text" id="renameReason" placeholder="e.g., Succession" style="width: 100%; padding: 4px 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.55rem; color: var(--text);">' +
                '</div>' +
                '</div>' +
                '</div>' +
                '</div>' +
                historyHtml +
                '</div>';

            _openModal({
                title: 'Rename Household: ' + household.name,
                content: modalContent,
                confirmText: 'Rename',
                cancelText: 'Cancel',
                onOpen: function() {
                    var input = document.getElementById('renameHouseholdInput');
                    if (input) {
                        setTimeout(function() { input.focus(); input.select(); }, 100);
                    }

                    var historyCheckbox = document.getElementById('renameWithHistory');
                    var historyOptions = document.getElementById('renameHistoryOptions');
                    if (historyCheckbox && historyOptions) {
                        historyCheckbox.onchange = function() {
                            historyOptions.style.display = this.checked ? 'block' : 'none';
                        };
                    }
                },
                onConfirm: function() {
                    var newName = document.getElementById('renameHouseholdInput').value.trim();
                    var year = parseInt(document.getElementById('renameYear').value);
                    var reason = document.getElementById('renameReason').value.trim();
                    var addToHistory = document.getElementById('renameWithHistory').checked;

                    if (!newName) {
                        _showToast('Please enter a name', 'error');
                        return false;
                    }

                    if (newName === household.name) {
                        _showToast('Name is the same', 'info');
                        _closeTopModal();
                        _processingModal = false;
                        if (onSuccess) {
                            onSuccess();
                        }
                        return true;
                    }

                    if (isNaN(year) || year < 1) {
                        _showToast('Please enter a valid year', 'error');
                        return false;
                    }

                    var result = _state.updateHousehold(householdId, { name: newName }, {
                        recordHistory: addToHistory,
                        changeYear: year,
                        changeReason: reason || 'Renamed'
                    });

                    if (result) {
                        _showToast('Household renamed to "' + newName + '"' + (addToHistory ? ' (' + year + ')' : ' (no trace)'), 'success');
                        _closeTopModal();
                        _processingModal = false;
                        if (onSuccess) {
                            onSuccess();
                        }
                    } else {
                        _showToast('Failed to rename household', 'error');
                    }
                    return true;
                },
                onCancel: function() {
                    _processingModal = false;
                }
            });

        } catch (e) {
            _processingModal = false;
            _showToast('Error opening rename household modal', 'error');
        }
    }

    // =========================================================================
    // 9. ADD MEMBER MODAL
    // =========================================================================

    function openAddMemberModal(householdId, type, onSuccess) {
        if (_processingModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingModal = false;
                return;
            }

            var isFamily = (type === 'family');
            var title = isFamily ? 'Add Family Member' : 'Add Staff Member';
            var defaultRole = isFamily ? 'Family Member' : 'Staff';

            var existingMemberIds = [];
            if (household.members) {
                for (var i = 0; i < household.members.length; i++) {
                    existingMemberIds.push(household.members[i].characterId);
                }
            }

            _openCharacterSelector({
                title: title,
                targetId: null,
                filters: {
                    showDeceased: true,
                    gender: 'all',
                    ageGroup: 'all',
                    location: 'all',
                    role: 'all'
                },
                excludeIds: existingMemberIds,
                onSelect: function(character) {
                    if (!character) {
                        _processingModal = false;
                        return;
                    }

                    _closeTopModal();

                    setTimeout(function() {
                        _openAddMemberRoleModal(household, character, type, defaultRole, function() {
                            _processingModal = false;
                            if (onSuccess) {
                                onSuccess();
                            }
                        });
                    }, 200);
                },
                onCancel: function() {
                    _processingModal = false;
                }
            });

        } catch (e) {
            _processingModal = false;
            _showToast('Error opening add member modal', 'error');
        }
    }

    // =========================================================================
    // 9.5 ADD MEMBER ROLE MODAL (Helper)
    // =========================================================================

    function _openAddMemberRoleModal(household, character, type, defaultRole, onSuccess) {
        var isFamily = (type === 'family');
        var currentYear = _getCurrentYear();
        var isDeceased = character.isDeceased === true;

        var roleModalContent =
            '<div style="margin-bottom: 16px;">' +
            '<div style="background: var(--bg3); border-radius: 6px; padding: 12px; margin-bottom: 12px;">' +
            '<div style="font-size: 0.7rem;"><strong>' + _escapeHtml(character.name) + ' ' + _escapeHtml(character.surname || '') + '</strong></div>' +
            (isDeceased ? '<div style="font-size: 0.55rem; color: var(--warn); margin-top: 4px;">This character is DECEASED</div>' : '') +
            '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">→ ' + _escapeHtml(household.name) + '</div>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom: 12px;">' +
            '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Role / Title</label>' +
            '<input type="text" id="memberRoleInput" value="' + defaultRole + '" placeholder="Custom role" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
            '</div>' +
            '<div class="form-group" style="margin-bottom: 12px;">' +
            '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Year Joined</label>' +
            '<input type="number" id="memberJoinedYear" value="' + currentYear + '" min="1" max="' + (currentYear + 10) + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
            '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">When this character joined the household</div>' +
            '</div>' +
            (isFamily ? '<div class="form-group" style="margin-bottom: 12px;">' +
            '<label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">' +
            '<input type="checkbox" id="memberIsHead">' +
            '<span style="font-size: 0.65rem;">Set as Head of Household</span>' +
            '</label></div>' : '') +
            '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 8px;">This will add the character to the household members list</div>' +
            '</div>';

        _openModal({
            title: 'Add ' + (isFamily ? 'Family Member' : 'Staff Member'),
            content: roleModalContent,
            confirmText: 'Add to Household',
            cancelText: 'Cancel',
            onConfirm: function() {
                var role = document.getElementById('memberRoleInput').value.trim() || defaultRole;
                var joinedYear = parseInt(document.getElementById('memberJoinedYear').value);
                var isHead = isFamily && document.getElementById('memberIsHead')?.checked || false;

                if (isNaN(joinedYear) || joinedYear < 1) {
                    _showToast('Please enter a valid year', 'error');
                    return false;
                }

                var existingHousehold = _state.getCharacterHousehold(character.id);
                if (existingHousehold && existingHousehold.id === household.id) {
                    _showToast(character.name + ' is already in this household', 'warning');
                    _closeTopModal();
                    _processingModal = false;
                    if (onSuccess) {
                        onSuccess();
                    }
                    return true;
                }

                var result = _commands.addMember(household.id, character.id, type, {
                    role: role,
                    joinedYear: joinedYear,
                    isHead: isHead,
                    notes: character.isDeceased ? 'Deceased character added to household' : ''
                });

                if (result && result.success) {
                    _showToast(character.name + ' added to ' + household.name, 'success');
                    _closeTopModal();
                    _processingModal = false;
                    if (onSuccess) {
                        onSuccess();
                    }
                    return true;
                } else {
                    _showToast(result ? result.reason : 'Failed to add member', 'error');
                    return false;
                }
            },
            onCancel: function() {
                _processingModal = false;
            }
        });
    }

    // =========================================================================
    // 10. EDIT MEMBER MODAL
    // =========================================================================

    function openEditMemberModal(householdId, characterId, onSuccess) {
        if (_processingModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingModal = false;
                return;
            }

            var member = null;
            for (var i = 0; i < household.members.length; i++) {
                if (household.members[i].characterId === characterId) {
                    member = household.members[i];
                    break;
                }
            }

            if (!member) {
                _showToast('Member not found', 'error');
                _processingModal = false;
                return;
            }

            var character = _getCharacterById(characterId);
            if (!character) {
                _showToast('Character not found', 'error');
                _processingModal = false;
                return;
            }

            var departments = _getDepartments(householdId);
            var deptOptions = '<option value="">None</option>';
            for (var i = 0; i < departments.length; i++) {
                var selected = (member.departmentId === departments[i].id) ? 'selected' : '';
                deptOptions += '<option value="' + departments[i].id + '" ' + selected + '>' + _escapeHtml(departments[i].name) + '</option>';
            }

            var memberType = member.type || 'family';
            var headSince = member.headSince || 'Unknown';
            var isHead = member.isHead || false;

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: var(--bg3); border-radius: 6px; padding: 12px; margin-bottom: 12px;">' +
                '<div style="font-size: 0.7rem;">' + _escapeHtml(character.name) + ' ' + _escapeHtml(character.surname || '') + '</div>' +
                '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">' + (memberType === 'family' ? 'Family Member' : 'Staff Member') +
                (isHead ? ' · Head since: ' + headSince : '') + '</div>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Role / Title</label>' +
                '<input type="text" id="editMemberRole" value="' + _escapeHtml(member.role || '') + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Department</label>' +
                '<select id="editMemberDepartment" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                deptOptions +
                '</select>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Joined Year</label>' +
                '<input type="number" id="editMemberJoinedYear" value="' + (member.joinedYear || _getCurrentYear()) + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes</label>' +
                '<textarea id="editMemberNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' + _escapeHtml(member.notes || '') + '</textarea>' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Edit Member: ' + character.name,
                content: modalContent,
                confirmText: 'Save Changes',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var role = document.getElementById('editMemberRole').value.trim();
                    var departmentId = document.getElementById('editMemberDepartment').value;
                    var joinedYear = parseInt(document.getElementById('editMemberJoinedYear').value);
                    var notes = document.getElementById('editMemberNotes').value.trim();

                    var updates = {
                        role: role || (memberType === 'family' ? 'Family Member' : 'Staff'),
                        departmentId: departmentId || null,
                        joinedYear: joinedYear || _getCurrentYear(),
                        notes: notes
                    };

                    var result = _commands.updateMember(householdId, characterId, updates);

                    if (result && result.success) {
                        _showToast('Member updated', 'success');
                        _closeTopModal();
                        _processingModal = false;
                        if (onSuccess) {
                            onSuccess();
                        }
                    } else {
                        _showToast(result ? result.reason : 'Failed to update member', 'error');
                    }
                    return true;
                },
                onCancel: function() {
                    _processingModal = false;
                }
            });

        } catch (e) {
            _processingModal = false;
            _showToast('Error opening edit member modal', 'error');
        }
    }

    // =========================================================================
    // 11. TRANSFER MEMBER MODAL
    // =========================================================================

    function openTransferMemberModal(householdId, characterId, onSuccess) {
        if (_processingModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingModal = false;
                return;
            }

            var character = _getCharacterById(characterId);
            if (!character) {
                _showToast('Character not found', 'error');
                _processingModal = false;
                return;
            }

            var currentYear = _getCurrentYear();

            _openHouseholdSelector({
                title: 'Select Target Household for ' + character.name,
                targetCharacterId: characterId,
                filterConfig: {
                    showActive: true,
                    showVacant: false,
                    showEmpty: false,
                    showDeprecated: false
                },
                onSelect: function(targetHousehold) {
                    if (!targetHousehold) {
                        _showToast('Selection cancelled', 'info');
                        _processingModal = false;
                        return;
                    }

                    if (targetHousehold.id === householdId) {
                        _showToast(character.name + ' is already in this household', 'warning');
                        _processingModal = false;
                        return;
                    }

                    var transferContent =
                        '<div style="margin-bottom: 16px;">' +
                        '<div style="background: var(--bg3); border-radius: 6px; padding: 12px; margin-bottom: 12px;">' +
                        '<div style="font-size: 0.7rem;">' + _escapeHtml(character.name) + ' ' + _escapeHtml(character.surname || '') + '</div>' +
                        '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">Current: ' + _escapeHtml(household.name) + '</div>' +
                        '<div style="font-size: 0.55rem; color: var(--accent); margin-top: 4px;">→ Target: ' + _escapeHtml(targetHousehold.name) + '</div>' +
                        '</div>' +
                        '<div class="form-group" style="margin-bottom: 12px;">' +
                        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Transfer Year</label>' +
                        '<input type="number" id="transferYear" value="' + currentYear + '" min="1" max="' + (currentYear + 10) + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                        '</div>' +
                        '<div class="form-group" style="margin-bottom: 12px;">' +
                        '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Reason (optional)</label>' +
                        '<input type="text" id="transferReason" placeholder="e.g., Marriage, Employment" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                        '</div>' +
                        '<div style="font-size: 0.55rem; color: var(--warn);">This will remove the character from the current household</div>' +
                        '</div>';

                    _openModal({
                        title: 'Transfer: ' + character.name + ' → ' + targetHousehold.name,
                        content: transferContent,
                        confirmText: 'Transfer',
                        cancelText: 'Cancel',
                        onConfirm: function() {
                            var year = parseInt(document.getElementById('transferYear').value);
                            var reason = document.getElementById('transferReason').value.trim() || 'Transferred';

                            if (isNaN(year) || year < 1) {
                                _showToast('Please enter a valid year', 'error');
                                return false;
                            }

                            var result = _assignment.transferCharacterToHousehold(characterId, targetHousehold.id, {
                                year: year,
                                reason: reason,
                                role: 'Family Member'
                            });

                            if (result && result.success) {
                                _showToast(character.name + ' transferred to ' + result.toHousehold.name, 'success');
                                _closeTopModal();
                                _processingModal = false;
                                if (onSuccess) {
                                    onSuccess();
                                }
                            } else {
                                _showToast(result ? result.reason : 'Failed to transfer member', 'error');
                            }
                            return true;
                        },
                        onCancel: function() {
                            _processingModal = false;
                        }
                    });
                },
                onCancel: function() {
                    _showToast('Transfer cancelled', 'info');
                    _processingModal = false;
                }
            });

        } catch (e) {
            _processingModal = false;
            _showToast('Error opening transfer modal', 'error');
        }
    }

    // =========================================================================
    // 12. SET HEAD OF HOUSEHOLD MODAL
    // =========================================================================

    function openSetHeadOfHouseholdModal(householdId, onSuccess) {
        if (_processingModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingModal = false;
                return;
            }

            var currentHead = _getHouseholdHead(householdId);
            var currentYear = _getCurrentYear();

            var familyMembers = [];
            if (household.members) {
                for (var i = 0; i < household.members.length; i++) {
                    var m = household.members[i];
                    if (m.type === 'family') {
                        var char = _getCharacterById(m.characterId);
                        if (char && !char.isDeceased) {
                            familyMembers.push({
                                character: char,
                                member: m,
                                isCurrentHead: m.isHead || (currentHead && currentHead.id === char.id)
                            });
                        }
                    }
                }
            }

            var familyOptions = '';
            if (familyMembers.length > 0) {
                for (var i = 0; i < familyMembers.length; i++) {
                    var fm = familyMembers[i];
                    var selected = fm.isCurrentHead ? 'selected' : '';
                    var headSince = fm.member.headSince || 'Unknown';
                    var label = fm.character.name + ' ' + (fm.character.surname || '') +
                        (fm.isCurrentHead ? ' (Current Head' + (headSince !== 'Unknown' ? ' since ' + headSince : '') + ')' : '') +
                        (fm.member.role ? ' - ' + fm.member.role : '');
                    familyOptions += '<option value="' + fm.character.id + '" ' + selected + '>' + _escapeHtml(label) + '</option>';
                }
            }

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: var(--bg3); border-radius: 6px; padding: 12px; margin-bottom: 12px;">' +
                '<div style="font-size: 0.6rem; color: var(--dim);">Current Head: <strong>' + (currentHead ? _escapeHtml(currentHead.name) + ' ' + _escapeHtml(currentHead.surname || '') : 'None') + '</strong></div>' +
                '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">' + familyMembers.length + ' family members available</div>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Select Head</label>' +
                '<select id="headSelect" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                '<option value="">— Select a family member —</option>' +
                familyOptions +
                '</select>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Year of Succession</label>' +
                '<input type="number" id="headYear" value="' + currentYear + '" min="1" max="' + (currentYear + 5) + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">When the new head assumed leadership</div>' +
                '</div>' +
                '<div style="display: flex; gap: 8px; margin-top: 8px;">' +
                '<button id="selectOtherHeadBtn" class="btn small" style="padding: 4px 12px; font-size: 0.6rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 4px; cursor: pointer;">Select Other Character</button>' +
                '<button id="clearHeadBtn" class="btn small" style="padding: 4px 12px; font-size: 0.6rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Remove Head</button>' +
                '</div>' +
                '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 8px;">Setting a head will transfer leadership from the current head</div>' +
                '</div>';

            _openModal({
                title: 'Set Head of Household: ' + household.name,
                content: modalContent,
                confirmText: 'Set Head',
                cancelText: 'Cancel',
                onOpen: function() {
                    var selectOtherBtn = document.getElementById('selectOtherHeadBtn');
                    var clearHeadBtn = document.getElementById('clearHeadBtn');

                    if (selectOtherBtn) {
                        selectOtherBtn.onclick = function() {
                            var existingMemberIds = [];
                            if (household.members) {
                                for (var i = 0; i < household.members.length; i++) {
                                    existingMemberIds.push(household.members[i].characterId);
                                }
                            }

                            _openCharacterSelector({
                                title: 'Select New Head',
                                targetId: null,
                                filters: {
                                    showDeceased: false,
                                    gender: 'all',
                                    ageGroup: 'all',
                                    location: 'all',
                                    role: 'all'
                                },
                                excludeIds: existingMemberIds,
                                onSelect: function(character) {
                                    if (character) {
                                        var result = _commands.addMember(household.id, character.id, 'family', {
                                            role: 'Head of Household',
                                            joinedYear: currentYear,
                                            isHead: true,
                                            notes: 'Appointed as head of household'
                                        });

                                        if (result && result.success) {
                                            _showToast(character.name + ' appointed as head', 'success');
                                            _closeTopModal();
                                            _processingModal = false;
                                            if (onSuccess) {
                                                onSuccess();
                                            }
                                        } else {
                                            _showToast('Failed to appoint head', 'error');
                                        }
                                    }
                                }
                            });
                        };
                    }

                    if (clearHeadBtn) {
                        clearHeadBtn.onclick = function() {
                            _confirmDialog('Remove the current head of household?', 'Remove Head', function() {
                                var result = _commands.setHead(household.id, null, { year: currentYear });
                                if (result && result.success) {
                                    _showToast('Head removed', 'info');
                                    _closeTopModal();
                                    _processingModal = false;
                                    if (onSuccess) {
                                        onSuccess();
                                    }
                                } else {
                                    _showToast('Failed to remove head', 'error');
                                }
                            });
                        };
                    }
                },
                onConfirm: function() {
                    var selectedId = document.getElementById('headSelect').value;
                    var year = parseInt(document.getElementById('headYear').value);

                    if (!selectedId) {
                        _showToast('Please select a head', 'error');
                        return false;
                    }

                    if (isNaN(year) || year < 1) {
                        _showToast('Please enter a valid year', 'error');
                        return false;
                    }

                    var result = _commands.setHead(household.id, selectedId, { year: year });

                    if (result && result.success) {
                        var char = _getCharacterById(selectedId);
                        _showToast(char ? char.name + ' is now head (since ' + year + ')' : 'Head set', 'success');
                        _closeTopModal();
                        _processingModal = false;
                        if (onSuccess) {
                            onSuccess();
                        }
                    } else {
                        _showToast(result ? result.reason : 'Failed to set head', 'error');
                    }
                    return true;
                },
                onCancel: function() {
                    _processingModal = false;
                }
            });

        } catch (e) {
            _processingModal = false;
            _showToast('Error opening set head modal', 'error');
        }
    }

    // =========================================================================
    // 13. ADD DEPARTMENT MODAL
    // =========================================================================

    function openAddDepartmentModal(householdId, onSuccess) {
        if (_processingModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingModal = false;
                return;
            }

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: var(--bg3); border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; font-size: 0.6rem; color: var(--dim);">' +
                'Adding department to: <strong>' + _escapeHtml(household.name) + '</strong>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Department Name *</label>' +
                '<input type="text" id="newDepartmentName" placeholder="e.g., Kitchen, Guard, Treasury" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Add Department to ' + household.name,
                content: modalContent,
                confirmText: 'Create Department',
                cancelText: 'Cancel',
                onOpen: function() {
                    var input = document.getElementById('newDepartmentName');
                    if (input) {
                        setTimeout(function() { input.focus(); }, 100);
                    }
                },
                onConfirm: function() {
                    var name = document.getElementById('newDepartmentName').value.trim();

                    if (!name) {
                        _showToast('Please enter a department name', 'error');
                        return false;
                    }

                    var result = _commands.addDepartment(householdId, name);

                    if (result && result.success) {
                        _showToast('Department "' + name + '" created', 'success');
                        _closeTopModal();
                        _processingModal = false;
                        if (onSuccess) {
                            onSuccess();
                        }
                    } else {
                        _showToast(result ? result.reason : 'Failed to create department', 'error');
                    }
                    return true;
                },
                onCancel: function() {
                    _processingModal = false;
                }
            });

        } catch (e) {
            _processingModal = false;
            _showToast('Error opening add department modal', 'error');
        }
    }

    // =========================================================================
    // 14. JOIN HOUSEHOLD MODAL
    // =========================================================================

    function openJoinHouseholdModal(characterId, onSuccess, options) {
        if (_processingModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingModal = true;

        try {
            options = options || {};

            if (!characterId) {
                _openCharacterSelector({
                    title: 'Select Character to Join a Household',
                    targetId: null,
                    filters: {
                        showDeceased: false,
                        gender: 'all',
                        ageGroup: 'all',
                        location: 'all',
                        role: 'all'
                    },
                    onSelect: function(character) {
                        if (character) {
                            _proceedWithJoinHousehold(character, onSuccess, options);
                        } else {
                            _processingModal = false;
                        }
                    },
                    onCancel: function() {
                        _processingModal = false;
                    }
                });
                return;
            }

            var character = _getCharacterById(characterId);
            if (!character) {
                _showToast('Character not found', 'error');
                _processingModal = false;
                return;
            }

            _proceedWithJoinHousehold(character, onSuccess, options);

        } catch (e) {
            _processingModal = false;
            _showToast('Error opening join household modal', 'error');
        }
    }

    function _proceedWithJoinHousehold(character, onSuccess, options) {
        var type = options.type || 'family';
        var currentYear = _getCurrentYear();
        var currentHousehold = _state.getCharacterHousehold(character.id);

        _openHouseholdSelector({
            title: 'Select Household for ' + character.name + ' to Join',
            targetCharacterId: character.id,
            filterConfig: {
                showActive: true,
                showVacant: false,
                showEmpty: false,
                showDeprecated: false
            },
            onSelect: function(household) {
                if (!household) {
                    _showToast('Selection cancelled', 'info');
                    _processingModal = false;
                    return;
                }

                if (currentHousehold && currentHousehold.id === household.id) {
                    _showToast(character.name + ' is already in ' + household.name, 'warning');
                    _processingModal = false;
                    return;
                }

                _showJoinDetailsModal(character, household, type, currentYear, currentHousehold, onSuccess);
            },
            onCancel: function() {
                _showToast('Selection cancelled', 'info');
                _processingModal = false;
            }
        });
    }

    function _showJoinDetailsModal(character, household, type, currentYear, currentHousehold, onSuccess) {
        var defaultRole = (type === 'family') ? 'Family Member' : 'Staff';

        var joinContent =
            '<div style="margin-bottom: 16px;">' +
            '<div style="background: var(--bg3); border-radius: 6px; padding: 12px; margin-bottom: 12px;">' +
            '<div style="font-size: 0.7rem;"><strong>' + _escapeHtml(character.name) + ' ' + _escapeHtml(character.surname || '') + '</strong></div>' +
            '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">→ ' + _escapeHtml(household.name) + '</div>' +
            (currentHousehold ? '<div style="font-size: 0.55rem; color: var(--warn); margin-top: 4px;">Current: ' + _escapeHtml(currentHousehold.name) + '</div>' : '') +
            '</div>' +
            '<div class="form-group" style="margin-bottom: 12px;">' +
            '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Role / Title</label>' +
            '<input type="text" id="joinMemberRole" value="' + defaultRole + '" placeholder="Custom role" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
            '</div>' +
            '<div class="form-group" style="margin-bottom: 12px;">' +
            '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Year Joined</label>' +
            '<input type="number" id="joinYear" value="' + currentYear + '" min="1" max="' + (currentYear + 10) + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
            '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">When this character joined the household</div>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom: 12px;">' +
            '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes (optional)</label>' +
            '<textarea id="joinNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;" placeholder="Reason for joining..."></textarea>' +
            '</div>' +
            (type === 'family' ? '<div class="form-group" style="margin-bottom: 12px;">' +
            '<label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">' +
            '<input type="checkbox" id="joinIsHead">' +
            '<span style="font-size: 0.65rem;">Set as Head of Household</span>' +
            '</label></div>' : '') +
            '</div>';

        _openModal({
            title: 'Join Household: ' + household.name,
            content: joinContent,
            confirmText: 'Join Household',
            cancelText: 'Cancel',
            onConfirm: function() {
                var role = document.getElementById('joinMemberRole').value.trim() || defaultRole;
                var joinedYear = parseInt(document.getElementById('joinYear').value);
                var notes = document.getElementById('joinNotes').value.trim();
                var isHead = type === 'family' && document.getElementById('joinIsHead')?.checked || false;

                if (isNaN(joinedYear) || joinedYear < 1) {
                    _showToast('Please enter a valid year', 'error');
                    return false;
                }

                var result = _commands.addMember(household.id, character.id, type, {
                    role: role,
                    joinedYear: joinedYear,
                    isHead: isHead,
                    notes: notes || 'Joined ' + household.name + ' in ' + joinedYear
                });

                if (result && result.success) {
                    _showToast(character.name + ' joined ' + household.name + ' (' + joinedYear + ')' + (isHead ? ' as Head' : ''), 'success');
                    _closeTopModal();
                    _processingModal = false;
                    if (onSuccess) {
                        onSuccess();
                    }
                    return true;
                } else {
                    _showToast(result ? result.reason : 'Failed to join household', 'error');
                    return false;
                }
            },
            onCancel: function() {
                _processingModal = false;
            }
        });
    }

    // =========================================================================
    // 15. VIEW HOUSEHOLD HISTORY MODAL
    // =========================================================================

    function openViewHouseholdHistoryModal(householdId) {
        if (_processingModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingModal = false;
                return;
            }

            var nameHistory = _getHouseholdNameHistory(householdId);

            var historyHtml = '';
            if (nameHistory.length === 0) {
                historyHtml = '<div style="color: var(--dim); text-align: center; padding: 20px;">No name change history recorded</div>';
            } else {
                var sortedHistory = nameHistory.slice().sort(function(a, b) { return a.year - b.year; });
                historyHtml = '<div style="display: flex; flex-direction: column; gap: 8px;">';
                for (var i = 0; i < sortedHistory.length; i++) {
                    var h = sortedHistory[i];
                    var isCurrent = i === sortedHistory.length - 1;
                    var periodDisplay = '';
                    if (i < sortedHistory.length - 1) {
                        periodDisplay = ' (' + h.year + ' - ' + (sortedHistory[i + 1].year - 1) + ')';
                    } else {
                        periodDisplay = ' (' + h.year + ' - present)';
                    }

                    historyHtml +=
                        '<div style="background: var(--bg3); border-radius: 6px; padding: 10px; border-left: 3px solid ' + (isCurrent ? 'var(--accent)' : 'var(--border)') + ';">' +
                        '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">' +
                        '<div>' +
                        '<span style="font-weight: bold;">' + h.year + '</span>' +
                        '<span style="margin-left: 8px;">' + _escapeHtml(h.oldName || '—') + ' → <strong>' + _escapeHtml(h.newName) + '</strong></span>' +
                        '<span style="font-size: 0.55rem; color: var(--dim); margin-left: 8px;">' + periodDisplay + '</span>' +
                        '</div>' +
                        (isCurrent ? '<span style="font-size: 0.55rem; color: var(--accent);">Current</span>' : '') +
                        '</div>' +
                        (h.reason ? '<div style="font-size: 0.6rem; color: var(--dim); margin-top: 4px;">Reason: ' + _escapeHtml(h.reason) + '</div>' : '') +
                        (h.changedBy ? '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 2px;">By: ' + _escapeHtml(h.changedBy) + '</div>' : '') +
                        '</div>';
                }
                historyHtml += '</div>';
            }

            var modalContent =
                '<div style="margin-bottom: 16px; background: var(--bg2); padding: 12px; border-radius: 8px;">' +
                '<div><strong>' + _escapeHtml(household.name) + '</strong></div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">Founded: ' + (household.foundedYear || '?') + ' · Current name since: ' + (household.currentNameSince || household.foundedYear || '?') + '</div>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">Total name changes: ' + nameHistory.length + '</div>' +
                '</div>' +
                '<div style="margin-bottom: 16px;">' +
                '<div style="font-size: 0.7rem; color: var(--accent); margin-bottom: 8px;">Name Change History</div>' +
                historyHtml +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">' +
                'Name changes help track the evolution of a household through generations.' +
                '</div>';

            _openModal({
                title: 'Household History: ' + household.name,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingModal = false;
                }
            });

        } catch (e) {
            _processingModal = false;
            _showToast('Error opening household history', 'error');
        }
    }

    // =========================================================================
    // 16. HOUSEHOLD DETAILS MODAL
    // =========================================================================

    function openHouseholdDetailsModal(householdId, onRefresh) {
        if (_processingModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingModal = false;
                return;
            }

            var head = _getHouseholdHead(householdId);
            var members = _getHouseholdMembers(householdId);
            var departments = _getDepartments(householdId);
            var status = _getHouseholdStatus(householdId);
            var currentYear = _getCurrentYear();
            var isProcessing = false;

            // Build members HTML
            var membersHtml = '';
            if (members.length > 0) {
                var displayMembers = members.slice(0, 10);
                for (var i = 0; i < displayMembers.length; i++) {
                    var m = displayMembers[i];
                    var char = _getCharacterById(m.characterId);
                    if (!char) continue;
                    var isHead = m.isHead || (head && head.id === char.id);
                    var isDeceased = char.isDeceased === true;
                    var headSinceText = (isHead && m.headSince) ? ' since ' + m.headSince : '';
                    membersHtml +=
                        '<div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid var(--border-light); font-size: 0.65rem; ' + (isDeceased ? 'opacity: 0.5;' : '') + '">' +
                        '<span>' + (isHead ? '◆ ' : '') + _escapeHtml(char.name) + ' ' + _escapeHtml(char.surname || '') + (isDeceased ? ' †' : '') + '</span>' +
                        '<span style="color: var(--dim); font-size: 0.55rem;">' + (m.role || 'Member') + (isHead ? headSinceText : '') + '</span>' +
                        '</div>';
                }
                if (members.length > 10) {
                    membersHtml += '<div style="font-size: 0.55rem; color: var(--dim); text-align: center; padding-top: 4px;">... and ' + (members.length - 10) + ' more</div>';
                }
            } else {
                membersHtml = '<div style="color: var(--dim); text-align: center; padding: 12px; font-size: 0.65rem;">No members</div>';
            }

            // Build departments HTML
            var departmentsHtml = '';
            if (departments.length > 0) {
                for (var i = 0; i < departments.length; i++) {
                    var d = departments[i];
                    var deptHead = d.headId ? _getCharacterById(d.headId) : null;
                    departmentsHtml +=
                        '<div style="display: flex; justify-content: space-between; padding: 2px 0; border-bottom: 1px solid var(--border-light); font-size: 0.6rem;">' +
                        '<span>' + _escapeHtml(d.name) + '</span>' +
                        '<span style="color: var(--dim); font-size: 0.5rem;">' + (deptHead ? 'Head: ' + _escapeHtml(deptHead.name) : 'No head') + '</span>' +
                        '</div>';
                }
            } else {
                departmentsHtml = '<div style="color: var(--dim); text-align: center; padding: 8px; font-size: 0.55rem;">No departments</div>';
            }

            // Build name history
            var nameHistory = _getHouseholdNameHistory(householdId);
            var historyHtml = '';
            if (nameHistory && nameHistory.length > 0) {
                var recentHistory = nameHistory.slice(-3).reverse();
                historyHtml = '<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-light);">' +
                    '<div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 4px;">Name History (' + nameHistory.length + ' changes)</div>';
                for (var i = 0; i < recentHistory.length; i++) {
                    var h = recentHistory[i];
                    historyHtml += '<div style="font-size: 0.55rem; color: var(--dim); padding: 2px 0;">' +
                        h.year + ': ' + _escapeHtml(h.oldName || '—') + ' → ' + _escapeHtml(h.newName) +
                        (h.reason ? ' (' + _escapeHtml(h.reason) + ')' : '') +
                        '</div>';
                }
                if (nameHistory.length > 3) {
                    historyHtml += '<div style="font-size: 0.5rem; color: var(--dim);">... and ' + (nameHistory.length - 3) + ' more</div>';
                }
                historyHtml += '</div>';
            }

            var statusColor = '#4a9e6a';
            var statusText = status && status.statusMessage ? status.statusMessage : 'Active';
            if (status && status.status === 'vacant') statusColor = '#8a8a8a';
            else if (status && status.status === 'abandoned') statusColor = '#c87040';
            else if (status && status.status === 'declining') statusColor = '#c8a844';

            // Build action buttons - NO ICONS
            var actionButtonsHtml =
                '<div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border);">' +
                '<div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 4px;">' +
                '<button id="detailsEditBtn" class="btn small" style="padding: 3px 10px; font-size: 0.55rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 3px; cursor: pointer;">Edit</button>' +
                '<button id="detailsRenameBtn" class="btn small" style="padding: 3px 10px; font-size: 0.55rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 3px; cursor: pointer;">Rename</button>' +
                '<button id="detailsSetHeadBtn" class="btn small" style="padding: 3px 10px; font-size: 0.55rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 3px; cursor: pointer;">Set Head</button>' +
                '</div>' +
                '<div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 4px;">' +
                '<button id="detailsAddFamilyBtn" class="btn small" style="padding: 3px 10px; font-size: 0.55rem; background: var(--accent); border: none; color: white; border-radius: 3px; cursor: pointer;">Add Family</button>' +
                '<button id="detailsAddStaffBtn" class="btn small" style="padding: 3px 10px; font-size: 0.55rem; background: var(--accent); border: none; color: white; border-radius: 3px; cursor: pointer;">Add Staff</button>' +
                '<button id="detailsAddDeptBtn" class="btn small" style="padding: 3px 10px; font-size: 0.55rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 3px; cursor: pointer;">Add Dept</button>' +
                '</div>' +
                '<div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 4px;">' +
                '<button id="detailsViewHistoryBtn" class="btn small" style="padding: 3px 10px; font-size: 0.55rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 3px; cursor: pointer;">History</button>' +
                '</div>' +
                '<div style="display: flex; gap: 4px; flex-wrap: wrap;">' +
                '<button id="detailsDeleteBtn" class="btn danger small" style="padding: 3px 10px; font-size: 0.55rem; background: #8a3020; border: none; color: white; border-radius: 3px; cursor: pointer;">Delete</button>' +
                '</div></div>';

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; background: var(--bg3); border-radius: 8px; padding: 12px; margin-bottom: 12px;">' +
                '<div><div style="font-size: 0.55rem; color: var(--dim);">Location</div><div style="font-size: 0.7rem;">' + (household.locationName || 'None') + '</div></div>' +
                '<div><div style="font-size: 0.55rem; color: var(--dim);">Head</div><div style="font-size: 0.7rem;">' + (head ? _escapeHtml(head.name) + ' ' + _escapeHtml(head.surname || '') : 'None') + (head && head.headSince ? ' (since ' + head.headSince + ')' : '') + '</div></div>' +
                '<div><div style="font-size: 0.55rem; color: var(--dim);">Founded</div><div style="font-size: 0.7rem;">' + (household.foundedYear || 'Unknown') + '</div></div>' +
                '<div><div style="font-size: 0.55rem; color: var(--dim);">Members</div><div style="font-size: 0.7rem;">' + members.length + '</div></div>' +
                '<div><div style="font-size: 0.55rem; color: var(--dim);">Departments</div><div style="font-size: 0.7rem;">' + departments.length + '</div></div>' +
                '<div><div style="font-size: 0.55rem; color: var(--dim);">Status</div><div style="font-size: 0.7rem; color:' + statusColor + ';">' + statusText + '</div></div>' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 8px;">Members (' + members.length + ')</div>' +
                '<div style="max-height: 200px; overflow-y: auto; background: var(--bg3); border-radius: 6px; padding: 8px;">' +
                membersHtml +
                '</div></div>' +
                '<div style="margin-bottom: 12px;">' +
                '<div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 8px;">Departments (' + departments.length + ')</div>' +
                '<div style="max-height: 100px; overflow-y: auto; background: var(--bg3); border-radius: 6px; padding: 8px;">' +
                departmentsHtml +
                '</div></div>' +
                (household.notes ? '<div style="background: var(--bg3); border-radius: 6px; padding: 8px; margin-bottom: 12px; font-size: 0.65rem; color: var(--dim);">' + _escapeHtml(household.notes) + '</div>' : '') +
                historyHtml +
                actionButtonsHtml +
                '</div>';

            _openModal({
                title: 'Household Details: ' + household.name,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingModal = false;
                    if (onRefresh) {
                        onRefresh();
                    }
                }
            });

            // Attach event handlers
            setTimeout(function() {
                var isProcessing = false;

                function closeAndReopen(callback) {
                    if (isProcessing) return;
                    isProcessing = true;
                    _closeTopModal();
                    setTimeout(function() {
                        callback();
                        isProcessing = false;
                    }, 50);
                }

                var editBtn = document.getElementById('detailsEditBtn');
                if (editBtn) {
                    editBtn.onclick = function() {
                        closeAndReopen(function() {
                            openEditHouseholdModal(householdId, function() {
                                openHouseholdDetailsModal(householdId, onRefresh);
                            });
                        });
                    };
                }

                var renameBtn = document.getElementById('detailsRenameBtn');
                if (renameBtn) {
                    renameBtn.onclick = function() {
                        closeAndReopen(function() {
                            openRenameHouseholdModal(householdId, function() {
                                openHouseholdDetailsModal(householdId, onRefresh);
                            });
                        });
                    };
                }

                var setHeadBtn = document.getElementById('detailsSetHeadBtn');
                if (setHeadBtn) {
                    setHeadBtn.onclick = function() {
                        closeAndReopen(function() {
                            openSetHeadOfHouseholdModal(householdId, function() {
                                openHouseholdDetailsModal(householdId, onRefresh);
                            });
                        });
                    };
                }

                var addFamilyBtn = document.getElementById('detailsAddFamilyBtn');
                if (addFamilyBtn) {
                    addFamilyBtn.onclick = function() {
                        closeAndReopen(function() {
                            openAddMemberModal(householdId, 'family', function() {
                                openHouseholdDetailsModal(householdId, onRefresh);
                            });
                        });
                    };
                }

                var addStaffBtn = document.getElementById('detailsAddStaffBtn');
                if (addStaffBtn) {
                    addStaffBtn.onclick = function() {
                        closeAndReopen(function() {
                            openAddMemberModal(householdId, 'staff', function() {
                                openHouseholdDetailsModal(householdId, onRefresh);
                            });
                        });
                    };
                }

                var addDeptBtn = document.getElementById('detailsAddDeptBtn');
                if (addDeptBtn) {
                    addDeptBtn.onclick = function() {
                        closeAndReopen(function() {
                            openAddDepartmentModal(householdId, function() {
                                openHouseholdDetailsModal(householdId, onRefresh);
                            });
                        });
                    };
                }

                var viewHistoryBtn = document.getElementById('detailsViewHistoryBtn');
                if (viewHistoryBtn) {
                    viewHistoryBtn.onclick = function() {
                        if (isProcessing) return;
                        isProcessing = true;
                        _closeTopModal();
                        setTimeout(function() {
                            openViewHouseholdHistoryModal(householdId);
                            isProcessing = false;
                        }, 50);
                    };
                }

                var deleteBtn = document.getElementById('detailsDeleteBtn');
                if (deleteBtn) {
                    deleteBtn.onclick = function() {
                        closeAndReopen(function() {
                            openDeleteHouseholdModal(householdId, function() {
                                if (onRefresh) {
                                    onRefresh();
                                }
                                _processingModal = false;
                            });
                        });
                    };
                }

            }, 100);

        } catch (e) {
            _processingModal = false;
            _showToast('Error opening household details', 'error');
        }
    }

    // =========================================================================
    // 17. LEAVE HOUSEHOLD MODAL
    // =========================================================================

    function openLeaveHouseholdModal(householdId, characterId, onSuccess) {
        if (_processingModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingModal = false;
                return;
            }

            var character = _getCharacterById(characterId);
            if (!character) {
                _showToast('Character not found', 'error');
                _processingModal = false;
                return;
            }

            var currentYear = _getCurrentYear();

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: var(--bg3); border-radius: 6px; padding: 12px; margin-bottom: 12px;">' +
                '<div style="font-size: 0.7rem;"><strong>' + _escapeHtml(character.name) + ' ' + _escapeHtml(character.surname || '') + '</strong></div>' +
                '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">Current Household: ' + _escapeHtml(household.name) + '</div>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Year Left</label>' +
                '<input type="number" id="leaveYear" value="' + currentYear + '" min="1" max="' + (currentYear + 5) + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Reason</label>' +
                '<input type="text" id="leaveReason" placeholder="e.g., Moved away, Disagreement..." style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                '</div>' +
                '<div style="font-size: 0.55rem; color: var(--warn);">This will remove the character from the household</div>' +
                '</div>';

            _openModal({
                title: 'Leave Household: ' + household.name,
                content: modalContent,
                confirmText: 'Leave Household',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var year = parseInt(document.getElementById('leaveYear').value);
                    var reason = document.getElementById('leaveReason').value.trim() || 'Left household';

                    if (isNaN(year) || year < 1) {
                        _showToast('Please enter a valid year', 'error');
                        return false;
                    }

                    var result = _commands.removeMember(householdId, characterId, {
                        reason: reason,
                        leftYear: year
                    });

                    if (result && result.success) {
                        _showToast(character.name + ' left ' + household.name, 'info');
                        _closeTopModal();
                        _processingModal = false;
                        if (onSuccess) {
                            onSuccess();
                        }
                    } else {
                        _showToast(result ? result.reason : 'Failed to leave household', 'error');
                    }
                    return true;
                },
                onCancel: function() {
                    _processingModal = false;
                }
            });

        } catch (e) {
            _processingModal = false;
            _showToast('Error opening leave household modal', 'error');
        }
    }

    // =========================================================================
    // 18. LEAVE HOUSEHOLD (NO TRACE) MODAL
    // =========================================================================

    function openLeaveHouseholdNoTraceModal(householdId, characterId, onSuccess) {
        if (_processingModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingModal = false;
                return;
            }

            var character = _getCharacterById(characterId);
            if (!character) {
                _showToast('Character not found', 'error');
                _processingModal = false;
                return;
            }

            _confirmDialog(
                'Remove ' + character.name + ' from ' + household.name + ' without recording in history?',
                'Leave Household (No Trace)',
                function() {
                    var result = _commands.removeMember(householdId, characterId, {
                        reason: 'Removed (no trace)',
                        recordHistory: false
                    });

                    if (result && result.success) {
                        _showToast(character.name + ' removed from ' + household.name + ' (no trace)', 'info');
                        _processingModal = false;
                        if (onSuccess) {
                            onSuccess();
                        }
                    } else {
                        _showToast(result ? result.reason : 'Failed to remove member', 'error');
                        _processingModal = false;
                    }
                },
                function() {
                    _processingModal = false;
                }
            );

        } catch (e) {
            _processingModal = false;
            _showToast('Error opening leave household (no trace) modal', 'error');
        }
    }

    // =========================================================================
    // 19. EXPORTS
    // =========================================================================

    // Household CRUD
    window.openNewHouseholdModal = openNewHouseholdModal;
    window.openEditHouseholdModal = openEditHouseholdModal;
    window.openDeleteHouseholdModal = openDeleteHouseholdModal;
    window.openHouseholdDetailsModal = openHouseholdDetailsModal;
    window.openRenameHouseholdModal = openRenameHouseholdModal;

    // Member management
    window.openAddMemberModal = openAddMemberModal;
    window.openEditMemberModal = openEditMemberModal;
    window.openTransferMemberModal = openTransferMemberModal;
    window.openSetHeadOfHouseholdModal = openSetHeadOfHouseholdModal;

    // Department management
    window.openAddDepartmentModal = openAddDepartmentModal;

    // Join/Leave Household
    window.openJoinHouseholdModal = openJoinHouseholdModal;
    window.openLeaveHouseholdModal = openLeaveHouseholdModal;
    window.openLeaveHouseholdNoTraceModal = openLeaveHouseholdNoTraceModal;

    // Household history
    window.openViewHouseholdHistoryModal = openViewHouseholdHistoryModal;

    // ES Module exports
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openNewHouseholdModal: openNewHouseholdModal,
            openEditHouseholdModal: openEditHouseholdModal,
            openDeleteHouseholdModal: openDeleteHouseholdModal,
            openHouseholdDetailsModal: openHouseholdDetailsModal,
            openRenameHouseholdModal: openRenameHouseholdModal,
            openAddMemberModal: openAddMemberModal,
            openEditMemberModal: openEditMemberModal,
            openTransferMemberModal: openTransferMemberModal,
            openSetHeadOfHouseholdModal: openSetHeadOfHouseholdModal,
            openAddDepartmentModal: openAddDepartmentModal,
            openJoinHouseholdModal: openJoinHouseholdModal,
            openLeaveHouseholdModal: openLeaveHouseholdModal,
            openLeaveHouseholdNoTraceModal: openLeaveHouseholdNoTraceModal,
            openViewHouseholdHistoryModal: openViewHouseholdHistoryModal
        };
    }

})();