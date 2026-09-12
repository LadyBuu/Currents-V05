/**
 * =============================================================================
 * RESIDENCE STAFF MODALS (modals-residence-staff.js)
 * =============================================================================
 * 
 * PURPOSE: UI modals for residence staff position management.
 * 
 * DEPENDS ON:
 *   - modals-core.js (openModal, closeTopModal, _escapeHtml, _showToast, _getIcon)
 *   - residence-system.js (ResidenceSystem)
 *   - household-state.js (HouseholdState)
 *   - household-commands.js (HouseholdCommands)
 *   - role-state.js (RoleState) - for role selection
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

    var _processingStaffModal = false;

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
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
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

    // =========================================================================
    // 2. STATE AND SYSTEM REFERENCE
    // =========================================================================

    var _residence = window.ResidenceSystem;
    var _state = window.HouseholdState;
    var _commands = window.HouseholdCommands;
    var _roleState = window.RoleState;

    // =========================================================================
    // 3. ICON HELPERS
    // =========================================================================

    function _getIconSafe(name) {
        var icon = _getIcon(name);
        return icon || '';
    }

    function _iconSpan(icon, title) {
        if (!icon) return '';
        var titleAttr = title ? ' title="' + _escapeHtml(title) + '"' : '';
        return '<span style="display:inline-flex;align-items:center;vertical-align:middle;' + (title ? 'cursor:help;' : '') + '"' + titleAttr + '>' + icon + '</span>';
    }

    // =========================================================================
    // 4. BUSINESS LOGIC WRAPPERS
    // =========================================================================

    function _getResidenceById(residenceId) {
        return _residence ? _residence.getResidenceById(residenceId) : null;
    }

    function _getResidenceStaffPositions(residenceId) {
        return _residence ? _residence.getResidenceStaffPositions(residenceId) : [];
    }

    function _getResidenceStaffAssignments(residenceId, options) {
        return _residence ? _residence.getResidenceStaffAssignments(residenceId, options) : [];
    }

    function _getResidenceUnits(residenceId) {
        return _residence ? _residence.getResidenceUnits(residenceId) : [];
    }

    function _getResidenceUnit(residenceId, unitNumber) {
        return _residence ? _residence.getResidenceUnit(residenceId, unitNumber) : null;
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

    function _getRoleById(id) {
        if (typeof window.getRoleById === 'function') {
            return window.getRoleById(id);
        }
        return null;
    }

    function _getAllRoles() {
        if (typeof window.RoleState !== 'undefined' && window.RoleState.getAllRoles) {
            return window.RoleState.getAllRoles();
        }
        if (typeof window.getRoles === 'function') {
            return window.getRoles();
        }
        return [];
    }

    function _calculateAge(birthYear, isDeceased, deathYear) {
    // Delegates to time.js — do not reimplement age logic here.
    if (typeof window.calculateAge === 'function') {
        return window.calculateAge(birthYear, isDeceased, deathYear);
    }
    return null;
}

    // =========================================================================
    // 5. CREATE RESIDENCE STAFF POSITION MODAL
    // =========================================================================

    function openCreateResidenceStaffPositionModal(residenceId, onSuccess) {
        if (_processingStaffModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingStaffModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingStaffModal = false;
                return;
            }

            var units = _getResidenceUnits(residenceId);
            var allRoles = _getAllRoles();

            var roleOptions = '<option value="">No role required</option>';
            for (var i = 0; i < allRoles.length; i++) {
                var r = allRoles[i];
                var icon = r.icon || '◉';
                var catName = r.category || 'Uncategorized';
                roleOptions += '<option value="' + r.id + '">' + icon + ' ' + _escapeHtml(r.name) + ' (' + _escapeHtml(catName) + ')</option>';
            }

            var unitOptions = '<option value="">Whole Residence</option>';
            for (var i = 0; i < units.length; i++) {
                unitOptions += '<option value="' + units[i].unitNumber + '">Unit ' + units[i].unitNumber + '</option>';
            }

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: var(--bg3); border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; font-size: 0.6rem; color: var(--dim);">' +
                'Creating a staff position for <strong>' + _escapeHtml(residence.name) + '</strong>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Position Name *</label>' +
                '<input type="text" id="newStaffPosName" placeholder="e.g., Maid, Cook, Butler, Gardener" autofocus style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Unit (optional)</label>' +
                '<select id="newStaffPosUnit" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                unitOptions +
                '</select>' +
                '<small style="font-size: 0.55rem; color: var(--dim);">If assigned to a unit, this position only applies to that unit</small>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Required Role</label>' +
                '<select id="newStaffPosRole" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                roleOptions +
                '</select>' +
                '<small style="font-size: 0.55rem; color: var(--dim);">Optional: Link this position to a role (e.g., "Servant")</small>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Minimum Skill Level</label>' +
                '<input type="number" id="newStaffPosMinSkill" value="0" min="0" max="100" style="width: 80px; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '<small style="font-size: 0.55rem; color: var(--dim);">Only applies if a role is selected</small>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes (optional)</label>' +
                '<textarea id="newStaffPosNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;" placeholder="e.g., Responsible for meal preparation"></textarea>' +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">' +
                'Staff positions define specific roles within a residence. Staff can be assigned to positions, and positions can require a specific role (e.g., "Servant").' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Create Residence Staff Position',
                content: modalContent,
                confirmText: 'Create Position',
                cancelText: 'Cancel',
                onOpen: function() {
                    var nameInput = document.getElementById('newStaffPosName');
                    if (nameInput) {
                        setTimeout(function() { nameInput.focus(); }, 100);
                    }
                },
                onConfirm: function() {
                    var name = document.getElementById('newStaffPosName').value.trim();
                    var unitNumber = document.getElementById('newStaffPosUnit').value;
                    var requiredRoleId = document.getElementById('newStaffPosRole').value || null;
                    var minSkillLevel = parseInt(document.getElementById('newStaffPosMinSkill').value) || 0;
                    var notes = document.getElementById('newStaffPosNotes').value.trim();

                    if (!name) {
                        _showToast('Position name is required', 'error');
                        return false;
                    }

                    var result = _residence.addResidenceStaffPosition(residenceId, {
                        name: name,
                        unitNumber: unitNumber || null,
                        requiredRoleId: requiredRoleId,
                        minSkillLevel: minSkillLevel,
                        notes: notes
                    });

                    if (result) {
                        _showToast('Staff position "' + name + '" created', 'success');
                        _closeTopModal();
                        _processingStaffModal = false;
                        if (onSuccess) {
                            onSuccess(result);
                        }
                        return true;
                    } else {
                        _showToast('Failed to create staff position', 'error');
                        return false;
                    }
                },
                onCancel: function() {
                    _processingStaffModal = false;
                }
            });

        } catch (e) {
            _processingStaffModal = false;
            _showToast('Error opening create staff position modal', 'error');
        }
    }

    // =========================================================================
    // 6. EDIT RESIDENCE STAFF POSITION MODAL
    // =========================================================================

    function openEditResidenceStaffPositionModal(residenceId, positionId, onSuccess) {
        if (_processingStaffModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingStaffModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingStaffModal = false;
                return;
            }

            var position = null;
            if (residence.staffPositions) {
                for (var i = 0; i < residence.staffPositions.length; i++) {
                    if (residence.staffPositions[i].id === positionId) {
                        position = residence.staffPositions[i];
                        break;
                    }
                }
            }

            if (!position) {
                _showToast('Staff position not found', 'error');
                _processingStaffModal = false;
                return;
            }

            var units = _getResidenceUnits(residenceId);
            var allRoles = _getAllRoles();

            var roleOptions = '<option value="">No role required</option>';
            for (var i = 0; i < allRoles.length; i++) {
                var r = allRoles[i];
                var selected = (r.id === position.requiredRoleId) ? 'selected' : '';
                var icon = r.icon || '◉';
                var catName = r.category || 'Uncategorized';
                roleOptions += '<option value="' + r.id + '" ' + selected + '>' + icon + ' ' + _escapeHtml(r.name) + ' (' + _escapeHtml(catName) + ')</option>';
            }

            var unitOptions = '<option value="">Whole Residence</option>';
            for (var i = 0; i < units.length; i++) {
                var selected = (units[i].unitNumber === position.unitNumber) ? 'selected' : '';
                unitOptions += '<option value="' + units[i].unitNumber + '" ' + selected + '>Unit ' + units[i].unitNumber + '</option>';
            }

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: var(--bg3); border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; font-size: 0.6rem; color: var(--dim);">' +
                'Editing staff position for <strong>' + _escapeHtml(residence.name) + '</strong>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Position Name *</label>' +
                '<input type="text" id="editStaffPosName" value="' + _escapeHtml(position.name) + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Unit</label>' +
                '<select id="editStaffPosUnit" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                unitOptions +
                '</select>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Required Role</label>' +
                '<select id="editStaffPosRole" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                roleOptions +
                '</select>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Minimum Skill Level</label>' +
                '<input type="number" id="editStaffPosMinSkill" value="' + (position.minSkillLevel || 0) + '" min="0" max="100" style="width: 80px; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes</label>' +
                '<textarea id="editStaffPosNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' + _escapeHtml(position.notes || '') + '</textarea>' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Edit Staff Position: ' + position.name,
                content: modalContent,
                confirmText: 'Save Changes',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var name = document.getElementById('editStaffPosName').value.trim();
                    if (!name) {
                        _showToast('Position name is required', 'error');
                        return false;
                    }

                    // Remove old position and add updated one
                    var updatedPosition = {
                        name: name,
                        unitNumber: document.getElementById('editStaffPosUnit').value || null,
                        requiredRoleId: document.getElementById('editStaffPosRole').value || null,
                        minSkillLevel: parseInt(document.getElementById('editStaffPosMinSkill').value) || 0,
                        notes: document.getElementById('editStaffPosNotes').value.trim()
                    };

                    // Update by removing old and creating new with same ID
                    var oldPosIndex = -1;
                    for (var i = 0; i < residence.staffPositions.length; i++) {
                        if (residence.staffPositions[i].id === positionId) {
                            oldPosIndex = i;
                            break;
                        }
                    }

                    if (oldPosIndex !== -1) {
                        residence.staffPositions[oldPosIndex] = {
                            id: positionId,
                            name: updatedPosition.name,
                            unitNumber: updatedPosition.unitNumber,
                            requiredRoleId: updatedPosition.requiredRoleId,
                            minSkillLevel: updatedPosition.minSkillLevel,
                            notes: updatedPosition.notes,
                            createdAt: position.createdAt || _getCurrentYear(),
                            updatedAt: _getCurrentYear()
                        };
                        _saveMasterData();
                        _showToast('Staff position updated', 'success');
                        _closeTopModal();
                        _processingStaffModal = false;
                        if (onSuccess) {
                            onSuccess();
                        }
                        return true;
                    } else {
                        _showToast('Failed to update staff position', 'error');
                        return false;
                    }
                },
                onCancel: function() {
                    _processingStaffModal = false;
                }
            });

        } catch (e) {
            _processingStaffModal = false;
            _showToast('Error opening edit staff position modal', 'error');
        }
    }

    // =========================================================================
    // 7. DELETE RESIDENCE STAFF POSITION MODAL
    // =========================================================================

    function openDeleteResidenceStaffPositionModal(residenceId, positionId, onSuccess) {
        if (_processingStaffModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingStaffModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingStaffModal = false;
                return;
            }

            var position = null;
            if (residence.staffPositions) {
                for (var i = 0; i < residence.staffPositions.length; i++) {
                    if (residence.staffPositions[i].id === positionId) {
                        position = residence.staffPositions[i];
                        break;
                    }
                }
            }

            if (!position) {
                _showToast('Staff position not found', 'error');
                _processingStaffModal = false;
                return;
            }

            var assignments = _getResidenceStaffAssignments(residenceId, { positionId: positionId, activeOnly: true });

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: rgba(200, 68, 68, 0.15); border: 1px solid var(--warn); border-radius: 8px; padding: 12px; margin-bottom: 16px;">' +
                '<strong>Delete Staff Position: ' + _escapeHtml(position.name) + '</strong>' +
                '<div style="margin-top: 8px; font-size: 0.65rem;">' +
                'This will permanently remove the staff position from the residence.' +
                (assignments.length > 0 ? ' ' + assignments.length + ' staff members are currently assigned to this position.' : '') +
                '</div>' +
                '<div style="margin-top: 8px; font-size: 0.6rem; color: var(--warn);">' +
                'Warning: This action cannot be undone.' +
                '</div>' +
                '</div>' +
                '<div style="background: var(--bg3); border-radius: 6px; padding: 12px;">' +
                '<div style="display: flex; justify-content: space-between; font-size: 0.7rem;">' +
                '<span>Position:</span>' +
                '<span><strong>' + _escapeHtml(position.name) + '</strong></span>' +
                '</div>' +
                (position.unitNumber ? '<div style="display: flex; justify-content: space-between; font-size: 0.6rem; margin-top: 4px;"><span>Unit:</span><span>' + position.unitNumber + '</span></div>' : '') +
                (position.requiredRoleId ? '<div style="display: flex; justify-content: space-between; font-size: 0.6rem; margin-top: 4px;"><span>Required Role:</span><span>' + _escapeHtml(_getRoleById(position.requiredRoleId)?.name || 'Unknown') + '</span></div>' : '') +
                '<div style="display: flex; justify-content: space-between; font-size: 0.6rem; margin-top: 4px;"><span>Current Assignments:</span><span>' + assignments.length + '</span></div>' +
                '</div>' +
                '<div style="margin-top: 12px;">' +
                '<label style="display: flex; align-items: center; gap: 8px; font-size: 0.65rem; cursor: pointer;">' +
                '<input type="checkbox" id="deleteRemoveStaffAssignments" ' + (assignments.length > 0 ? 'checked' : '') + '>' +
                '<span>Remove all assignments from this position</span>' +
                '</label>' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Delete Staff Position: ' + position.name,
                content: modalContent,
                confirmText: 'Delete Position',
                cancelText: 'Cancel',
                confirmStyle: 'danger',
                onConfirm: function() {
                    var removeAssignments = document.getElementById('deleteRemoveStaffAssignments')?.checked !== false;

                    var result = _residence.removeResidenceStaffPosition(residenceId, positionId, {
                        removeAssignments: removeAssignments
                    });

                    if (result) {
                        _showToast('Staff position "' + position.name + '" deleted', 'info');
                        _closeTopModal();
                        _processingStaffModal = false;
                        if (onSuccess) {
                            onSuccess();
                        }
                        return true;
                    } else {
                        _showToast('Failed to delete staff position', 'error');
                        return false;
                    }
                },
                onCancel: function() {
                    _processingStaffModal = false;
                }
            });

        } catch (e) {
            _processingStaffModal = false;
            _showToast('Error opening delete staff position modal', 'error');
        }
    }

    // =========================================================================
    // 8. ASSIGN STAFF TO RESIDENCE POSITION MODAL
    // =========================================================================

    function openAssignResidenceStaffModal(residenceId, positionId, onSuccess) {
        if (_processingStaffModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingStaffModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingStaffModal = false;
                return;
            }

            var position = null;
            if (residence.staffPositions) {
                for (var i = 0; i < residence.staffPositions.length; i++) {
                    if (residence.staffPositions[i].id === positionId) {
                        position = residence.staffPositions[i];
                        break;
                    }
                }
            }

            if (!position) {
                _showToast('Staff position not found', 'error');
                _processingStaffModal = false;
                return;
            }

            var currentYear = _getCurrentYear();
            var allChars = _getCharacters();

            // Filter: exclude already assigned to this position
            var existingAssignments = _getResidenceStaffAssignments(residenceId, { positionId: positionId, activeOnly: true });
            var assignedIds = {};
            for (var i = 0; i < existingAssignments.length; i++) {
                assignedIds[existingAssignments[i].characterId] = true;
            }

            var availableChars = allChars.filter(function(c) {
                if (c.isDeceased) return false;
                if (assignedIds[c.id]) return false;
                return true;
            });

            var charsHtml = '';
            if (availableChars.length === 0) {
                charsHtml = '<div style="color: var(--dim); text-align: center; padding: 20px; font-size: 0.6rem;">No available characters</div>';
            } else {
                charsHtml = '<div style="max-height: 250px; overflow-y: auto;">';
                for (var i = 0; i < availableChars.length; i++) {
                    var c = availableChars[i];
                    var age = _calculateAge(c.birthYear, c.isDeceased, c.deathYear);
                    var genderSymbol = c.gender === 'male' ? '♂' : (c.gender === 'female' ? '♀' : '⚥');
                    var hasRole = false;
                    var skillLevel = 0;
                    if (position.requiredRoleId && c.professions) {
                        for (var j = 0; j < c.professions.length; j++) {
                            if (c.professions[j].id === position.requiredRoleId) {
                                hasRole = true;
                                skillLevel = c.professions[j].skillLevel || 0;
                                break;
                            }
                        }
                    }
                    var roleStatus = position.requiredRoleId ? (hasRole ? '✓ Has role' : '⚠️ Missing role') : '';

                    charsHtml +=
                        '<div class="staff-select-item" data-char-id="' + c.id + '" style="' +
                        'padding: 8px 10px; ' +
                        'margin-bottom: 4px; ' +
                        'background: var(--bg2); ' +
                        'border: 1px solid var(--border); ' +
                        'border-radius: 4px; ' +
                        'cursor: pointer; ' +
                        'transition: all 0.1s; ' +
                        '">' +
                        '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">' +
                        '<div>' +
                        '<strong>' + _escapeHtml(c.name) + ' ' + _escapeHtml(c.surname || '') + '</strong>' +
                        '<span style="font-size: 0.5rem; color: var(--dim); margin-left: 6px;">' + genderSymbol + ' ' + age + 'y</span>' +
                        (position.requiredRoleId ? '<span style="font-size: 0.45rem; margin-left: 6px; color: ' + (hasRole ? 'var(--success)' : 'var(--warn)') + ';">' + roleStatus + '</span>' : '') +
                        (skillLevel > 0 ? '<span style="font-size:0.45rem; color:var(--accent); margin-left:4px;">(Skill: ' + skillLevel + ')</span>' : '') +
                        '</div>' +
                        '<div style="font-size: 0.5rem; color: var(--dim);">' +
                        (c.professions && c.professions.length > 0 ? c.professions.map(function(p) { return p.name; }).join(', ') : 'No roles') +
                        '</div>' +
                        '</div>' +
                        '</div>';
                }
                charsHtml += '</div>';
            }

            var roleDisplay = position.requiredRoleId ?
                '<span style="color: var(--accent);">' + _escapeHtml(_getRoleById(position.requiredRoleId)?.name || 'Unknown') + '</span>' :
                '<span style="color: var(--dim);">None</span>';

            // Get staff assignments history
            var history = _getResidenceStaffAssignments(residenceId, { positionId: positionId, activeOnly: false });
            var historyHtml = '';
            if (history && history.length > 0) {
                var sortedHistory = history.slice().sort(function(a, b) { return (b.startYear || 0) - (a.startYear || 0); });
                var recentHistory = sortedHistory.slice(0, 5);

                historyHtml =
                    '<div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border);">' +
                    '<div style="font-size: 0.65rem; color: var(--accent); margin-bottom: 8px;">Recent History</div>' +
                    '<div style="max-height: 120px; overflow-y: auto; background: var(--bg3); border-radius: 6px; padding: 8px;">';

                for (var i = 0; i < recentHistory.length; i++) {
                    var h = recentHistory[i];
                    var isActive = !h.endYear;
                    var endDisplay = h.endYear || 'Present';
                    var color = isActive ? 'var(--success)' : 'var(--dim)';
                    var roleName = h.roleIdAtAssignment ? (_getRoleById(h.roleIdAtAssignment)?.name || 'Unknown') : null;

                    historyHtml +=
                        '<div style="display:flex; justify-content:space-between; padding: 4px 0; border-bottom: 1px solid var(--border-light); font-size: 0.6rem;">' +
                        '<span>' + _escapeHtml(h.characterName) +
                        (h.title && h.title !== position.name ? ' (' + _escapeHtml(h.title) + ')' : '') +
                        (roleName ? ' <span style="color:var(--accent);">(Role: ' + _escapeHtml(roleName) + ')</span>' : '') +
                        (h.skillLevelAtAssignment ? ' <span style="color:var(--accent);">(Skill: ' + h.skillLevelAtAssignment + ')</span>' : '') +
                        '</span>' +
                        '<span style="color:' + color + ';">' + h.startYear + ' - ' + endDisplay + '</span>' +
                        '</div>';
                }

                historyHtml += '</div></div>';
            }

            var modalContent =
                '<div style="margin-bottom: 12px; padding: 8px; background: var(--bg2); border-radius: 6px;">' +
                '<strong>Residence:</strong> ' + _escapeHtml(residence.name) + '<br>' +
                '<strong>Position:</strong> ' + _escapeHtml(position.name) +
                (position.unitNumber ? ' (Unit ' + position.unitNumber + ')' : '') +
                '<br><strong>Required Role:</strong> ' + roleDisplay +
                (position.minSkillLevel > 0 ? ' · <strong>Min Skill:</strong> ' + position.minSkillLevel : '') +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Select Character</label>' +
                charsHtml +
                '</div>' +
                '<div style="display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;">' +
                '<button id="selectOtherCharBtn" class="btn small" style="padding: 3px 10px; font-size: 0.55rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 4px; cursor: pointer;">Select Other Character</button>' +
                '<label style="display: flex; align-items: center; gap: 6px; font-size: 0.55rem; cursor: pointer;">' +
                '<input type="checkbox" id="assignAddRoleIfMissing" checked>' +
                '<span>Add role if missing</span>' +
                '</label>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Custom Title</label>' +
                '<input type="text" id="assignTitle" value="' + _escapeHtml(position.name) + '" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '</div>' +
                '<div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">' +
                '<div class="form-group">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Start Year</label>' +
                '<input type="number" id="assignStartYear" value="' + currentYear + '" min="1" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '</div>' +
                '<div class="form-group">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">End Year</label>' +
                '<input type="number" id="assignEndYear" placeholder="Leave empty for ongoing" min="1" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '<small style="font-size:0.5rem; color:var(--dim);">If set, this assignment will be marked as historical</small>' +
                '</div>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes</label>' +
                '<textarea id="assignNotes" rows="2" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);"></textarea>' +
                '</div>' +
                historyHtml +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; margin-top: 12px;">' +
                'Assignments track who holds this position over time. Setting an end year records it as historical.' +
                '</div>';

            _openModal({
                title: 'Assign Staff to ' + position.name,
                content: modalContent,
                confirmText: 'Assign Staff',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var selectedCharId = document.querySelector('.staff-select-item.selected')?.dataset.charId;
                    if (!selectedCharId) {
                        _showToast('Please select a character', 'error');
                        return false;
                    }

                    var startYear = parseInt(document.getElementById('assignStartYear').value) || currentYear;
                    var endYear = document.getElementById('assignEndYear').value;
                    var endYearValue = endYear ? parseInt(endYear) : null;
                    var notes = document.getElementById('assignNotes').value || '';
                    var title = document.getElementById('assignTitle').value || position.name;
                    var addRoleIfMissing = document.getElementById('assignAddRoleIfMissing')?.checked !== false;

                    if (endYearValue && endYearValue <= startYear) {
                        _showToast('End year must be after start year', 'error');
                        return false;
                    }

                    var result = _residence.assignCharacterToResidenceStaffPosition(
                        residenceId,
                        positionId,
                        selectedCharId,
                        {
                            startYear: startYear,
                            endYear: endYearValue,
                            title: title,
                            notes: notes,
                            addRoleIfMissing: addRoleIfMissing,
                            defaultSkillLevel: 10
                        }
                    );

                    if (result) {
                        var char = _getCharacterById(selectedCharId);
                        var endMsg = endYearValue ? ' until ' + endYearValue : '';
                        _showToast((char ? char.name : 'Character') + ' assigned as ' + title + endMsg, 'success');
                        _closeTopModal();
                        _processingStaffModal = false;
                        if (onSuccess) {
                            onSuccess(result);
                        }
                        return true;
                    } else {
                        _showToast('Failed to assign staff', 'error');
                        return false;
                    }
                },
                onCancel: function() {
                    _processingStaffModal = false;
                }
            });

            // Click handlers for character selection
            setTimeout(function() {
                var items = document.querySelectorAll('.staff-select-item');
                items.forEach(function(item) {
                    var newItem = item.cloneNode(true);
                    if (item.parentNode) {
                        item.parentNode.replaceChild(newItem, item);
                    }

                    newItem.onclick = function() {
                        document.querySelectorAll('.staff-select-item').forEach(function(el) {
                            el.classList.remove('selected');
                            el.style.background = 'var(--bg2)';
                            el.style.borderColor = 'var(--border)';
                        });
                        this.classList.add('selected');
                        this.style.background = 'rgba(var(--accent-rgb), 0.15)';
                        this.style.borderColor = 'var(--accent)';
                    };

                    newItem.onmouseenter = function() {
                        if (!this.classList.contains('selected')) {
                            this.style.background = 'var(--bg3)';
                        }
                    };
                    newItem.onmouseleave = function() {
                        if (!this.classList.contains('selected')) {
                            this.style.background = 'var(--bg2)';
                        }
                    };
                });

                var selectOtherBtn = document.getElementById('selectOtherCharBtn');
                if (selectOtherBtn) {
                    selectOtherBtn.onclick = function() {
                        var existingIds = {};
                        var items = document.querySelectorAll('.staff-select-item');
                        items.forEach(function(item) {
                            existingIds[item.dataset.charId] = true;
                        });

                        _openCharacterSelector({
                            title: 'Select Character for ' + position.name,
                            excludeIds: Object.keys(existingIds),
                            filters: {
                                showDeceased: false,
                                gender: 'all'
                            },
                            onSelect: function(character) {
                                if (character) {
                                    _closeTopModal();
                                    _processingStaffModal = false;
                                    // Reopen with the selected character pre-selected
                                    openAssignResidenceStaffModal(residenceId, positionId, onSuccess);
                                }
                            }
                        });
                    };
                }
            }, 100);

        } catch (e) {
            _processingStaffModal = false;
            _showToast('Error opening assign staff modal', 'error');
        }
    }

    // =========================================================================
    // 9. VIEW RESIDENCE STAFF POSITIONS MODAL
    // =========================================================================

    function openViewResidenceStaffPositionsModal(residenceId, onSelect) {
        if (_processingStaffModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingStaffModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingStaffModal = false;
                return;
            }

            var positions = _getResidenceStaffPositions(residenceId);
            var assignments = _getResidenceStaffAssignments(residenceId, { activeOnly: true });

            var assignmentMap = {};
            for (var i = 0; i < assignments.length; i++) {
                var a = assignments[i];
                if (!assignmentMap[a.positionId]) {
                    assignmentMap[a.positionId] = [];
                }
                assignmentMap[a.positionId].push(a);
            }

            var positionsHtml = '';
            if (positions.length === 0) {
                positionsHtml = '<div style="color: var(--dim); text-align: center; padding: 40px; font-size: 0.6rem;">No staff positions created</div>';
            } else {
                positionsHtml = '<div style="display: flex; flex-direction: column; gap: 6px;">';
                for (var i = 0; i < positions.length; i++) {
                    var p = positions[i];
                    var posAssignments = assignmentMap[p.id] || [];
                    var activeAssignments = posAssignments.filter(function(a) { return !a.endYear; });
                    var roleName = p.requiredRoleId ? (_getRoleById(p.requiredRoleId)?.name || 'Unknown') : 'None';

                    var assignedChars = activeAssignments.map(function(a) {
                        var c = _getCharacterById(a.characterId);
                        return c ? c.name + (a.title && a.title !== p.name ? ' (' + a.title + ')' : '') : 'Unknown';
                    }).join(', ');

                    positionsHtml +=
                        '<div class="staff-pos-item" data-pos-id="' + p.id + '" style="' +
                        'background: var(--bg3); ' +
                        'border: 1px solid var(--border); ' +
                        'border-radius: 6px; ' +
                        'padding: 10px 12px; ' +
                        'cursor: pointer; ' +
                        'transition: all 0.1s;' +
                        '">' +
                        '<div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 6px;">' +
                        '<div>' +
                        '<strong>' + _escapeHtml(p.name) + '</strong>' +
                        (p.unitNumber ? '<span style="font-size: 0.55rem; color: var(--dim); margin-left: 8px;">Unit ' + p.unitNumber + '</span>' : '') +
                        '<span style="font-size: 0.55rem; color: var(--accent); margin-left: 8px;">Role: ' + _escapeHtml(roleName) + '</span>' +
                        (p.minSkillLevel > 0 ? '<span style="font-size: 0.55rem; color: var(--dim); margin-left: 4px;">(Min: ' + p.minSkillLevel + ')</span>' : '') +
                        '</div>' +
                        '<div style="font-size: 0.55rem; color: var(--accent);">' +
                        activeAssignments.length + ' assigned' +
                        '</div>' +
                        '</div>' +
                        (assignedChars ? '<div style="font-size: 0.5rem; color: var(--dim); margin-top: 4px;">' + _escapeHtml(assignedChars) + '</div>' : '') +
                        (p.notes ? '<div style="font-size: 0.5rem; color: var(--dim); margin-top: 2px;">' + _escapeHtml(p.notes) + '</div>' : '') +
                        '</div>';
                }
                positionsHtml += '</div>';
            }

            var modalContent =
                '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px;">' +
                '<strong>Residence:</strong> ' + _escapeHtml(residence.name) +
                '<div style="font-size: 0.6rem; color: var(--dim); margin-top: 4px;">' + positions.length + ' staff positions · ' + assignments.length + ' total assignments</div>' +
                '</div>' +
                positionsHtml +
                '<div style="margin-top: 12px; padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">' +
                'Click on a position to manage it, or use the buttons above to create/assign.' +
                '</div>';

            _openModal({
                title: 'Staff Positions: ' + residence.name,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingStaffModal = false;
                }
            });

            // Click handlers
            setTimeout(function() {
                var items = document.querySelectorAll('.staff-pos-item');
                items.forEach(function(item) {
                    var newItem = item.cloneNode(true);
                    if (item.parentNode) {
                        item.parentNode.replaceChild(newItem, item);
                    }

                    newItem.onclick = function() {
                        var posId = this.dataset.posId;
                        _closeTopModal();
                        _processingStaffModal = false;
                        if (onSelect) {
                            onSelect(posId);
                        }
                    };

                    newItem.onmouseenter = function() {
                        this.style.background = 'var(--bg2)';
                        this.style.borderColor = 'var(--accent)';
                    };
                    newItem.onmouseleave = function() {
                        this.style.background = 'var(--bg3)';
                        this.style.borderColor = 'var(--border)';
                    };
                });
            }, 100);

        } catch (e) {
            _processingStaffModal = false;
            _showToast('Error opening view staff positions modal', 'error');
        }
    }

    // =========================================================================
    // 10. VIEW RESIDENCE STAFF ASSIGNMENTS MODAL
    // =========================================================================

    function openViewResidenceStaffAssignmentsModal(residenceId) {
        if (_processingStaffModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingStaffModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingStaffModal = false;
                return;
            }

            var assignments = _getResidenceStaffAssignments(residenceId, { activeOnly: true });

            var positionsMap = {};
            if (residence.staffPositions) {
                for (var i = 0; i < residence.staffPositions.length; i++) {
                    positionsMap[residence.staffPositions[i].id] = residence.staffPositions[i];
                }
            }

            var assignmentsHtml = '';
            if (assignments.length === 0) {
                assignmentsHtml = '<div style="color: var(--dim); text-align: center; padding: 40px; font-size: 0.6rem;">No staff assignments</div>';
            } else {
                assignmentsHtml = '<div style="display: flex; flex-direction: column; gap: 4px;">';
                for (var i = 0; i < assignments.length; i++) {
                    var a = assignments[i];
                    var char = _getCharacterById(a.characterId);
                    var pos = positionsMap[a.positionId];

                    var roleName = a.roleIdAtAssignment ? (_getRoleById(a.roleIdAtAssignment)?.name || 'Unknown') : 'None';

                    assignmentsHtml +=
                        '<div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; background: var(--bg2); border-radius: 4px; border-left: 3px solid var(--accent);">' +
                        '<div>' +
                        '<strong>' + _escapeHtml(char ? char.name : 'Unknown') + '</strong>' +
                        '<span style="font-size: 0.55rem; color: var(--dim); margin-left: 6px;">' + _escapeHtml(a.title || (pos ? pos.name : 'Unknown')) + '</span>' +
                        (a.unitNumber ? '<span style="font-size: 0.5rem; color: var(--dim); margin-left: 6px;">Unit ' + a.unitNumber + '</span>' : '') +
                        (roleName !== 'None' ? '<span style="font-size: 0.45rem; color: var(--accent); margin-left: 6px;">Role: ' + _escapeHtml(roleName) + (a.skillLevelAtAssignment ? ' - ' + a.skillLevelAtAssignment : '') + '</span>' : '') +
                        '</div>' +
                        '<div style="font-size: 0.5rem; color: var(--dim); display: flex; align-items: center; gap: 8px;">' +
                        'Since ' + a.startYear +
                        (a.endYear ? ' · Ended ' + a.endYear : '') +
                        '<button class="end-staff-assign-btn" data-assign-id="' + a.id + '" style="padding: 2px 6px; font-size: 0.45rem; background: #8a5a20; border: none; color: white; border-radius: 3px; cursor: pointer;">' + (a.endYear ? 'Delete' : 'End') + '</button>' +
                        '</div>' +
                        '</div>';
                }
                assignmentsHtml += '</div>';
            }

            var modalContent =
                '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px;">' +
                '<strong>Staff Assignments: ' + _escapeHtml(residence.name) + '</strong>' +
                '<div style="font-size: 0.6rem; color: var(--dim); margin-top: 4px;">' + assignments.length + ' active staff members</div>' +
                '</div>' +
                assignmentsHtml +
                '<div style="margin-top: 12px; padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">' +
                'Click "End" to terminate a staff assignment, or "Delete" to remove an ended assignment.' +
                '</div>';

            _openModal({
                title: 'Staff Assignments: ' + residence.name,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingStaffModal = false;
                }
            });

            // End/Delete handlers
            setTimeout(function() {
                var endBtns = document.querySelectorAll('.end-staff-assign-btn');
                endBtns.forEach(function(btn) {
                    var newBtn = btn.cloneNode(true);
                    if (btn.parentNode) {
                        btn.parentNode.replaceChild(newBtn, btn);
                    }

                    newBtn.onclick = function(e) {
                        e.stopPropagation();
                        var assignId = this.dataset.assignId;
                        var currentYear = _getCurrentYear();

                        var assignment = null;
                        if (residence.staffAssignments) {
                            for (var i = 0; i < residence.staffAssignments.length; i++) {
                                if (residence.staffAssignments[i].id === assignId) {
                                    assignment = residence.staffAssignments[i];
                                    break;
                                }
                            }
                        }

                        var isEnded = assignment && assignment.endYear;

                        var actionText = isEnded ? 'delete' : 'end';
                        var confirmMsg = isEnded ?
                            'Delete this staff assignment?' :
                            'End this staff assignment?';

                        _confirmDialog(
                            confirmMsg,
                            isEnded ? 'Delete Assignment' : 'End Assignment',
                            function() {
                                if (isEnded) {
                                    // Delete the assignment
                                    if (residence.staffAssignments) {
                                        var idx = -1;
                                        for (var i = 0; i < residence.staffAssignments.length; i++) {
                                            if (residence.staffAssignments[i].id === assignId) {
                                                idx = i;
                                                break;
                                            }
                                        }
                                        if (idx !== -1) {
                                            residence.staffAssignments.splice(idx, 1);
                                            _saveMasterData();
                                            _showToast('Assignment deleted', 'info');
                                            _closeTopModal();
                                            _processingStaffModal = false;
                                            setTimeout(function() {
                                                openViewResidenceStaffAssignmentsModal(residenceId);
                                            }, 100);
                                        }
                                    }
                                } else {
                                    var result = _residence.endResidenceStaffAssignment(
                                        residenceId,
                                        assignId,
                                        currentYear,
                                        'Ended by user'
                                    );
                                    if (result) {
                                        _showToast('Assignment ended', 'success');
                                        _closeTopModal();
                                        _processingStaffModal = false;
                                        setTimeout(function() {
                                            openViewResidenceStaffAssignmentsModal(residenceId);
                                        }, 100);
                                    } else {
                                        _showToast('Failed to end assignment', 'error');
                                    }
                                }
                            },
                            function() {
                                _processingStaffModal = false;
                            }
                        );
                    };
                });
            }, 100);

        } catch (e) {
            _processingStaffModal = false;
            _showToast('Error opening staff assignments', 'error');
        }
    }

    // =========================================================================
    // 11. STAFF MANAGEMENT COMBINED MODAL
    // =========================================================================

    function openResidenceStaffManagementModal(residenceId, onSuccess) {
        if (_processingStaffModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingStaffModal = true;

        try {
            var residence = _getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                _processingStaffModal = false;
                return;
            }

            var positions = _getResidenceStaffPositions(residenceId);
            var assignments = _getResidenceStaffAssignments(residenceId, { activeOnly: true });

            var assignmentMap = {};
            for (var i = 0; i < assignments.length; i++) {
                var a = assignments[i];
                if (!assignmentMap[a.positionId]) {
                    assignmentMap[a.positionId] = [];
                }
                assignmentMap[a.positionId].push(a);
            }

            var positionsHtml = '';
            if (positions.length === 0) {
                positionsHtml = '<div style="color: var(--dim); text-align: center; padding: 20px; font-size: 0.6rem;">No staff positions created</div>';
            } else {
                positionsHtml = '<div style="display: flex; flex-direction: column; gap: 4px;">';
                for (var i = 0; i < positions.length; i++) {
                    var p = positions[i];
                    var posAssignments = assignmentMap[p.id] || [];
                    var activeAssignments = posAssignments.filter(function(a) { return !a.endYear; });
                    var roleName = p.requiredRoleId ? (_getRoleById(p.requiredRoleId)?.name || 'Unknown') : 'None';

                    var assignedChars = activeAssignments.map(function(a) {
                        var c = _getCharacterById(a.characterId);
                        return c ? c.name : 'Unknown';
                    }).join(', ');

                    positionsHtml +=
                        '<div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; background: var(--bg2); border-radius: 4px; border-left: 3px solid ' + (activeAssignments.length > 0 ? 'var(--accent)' : 'var(--border)') + ';">' +
                        '<div>' +
                        '<strong>' + _escapeHtml(p.name) + '</strong>' +
                        (p.unitNumber ? '<span style="font-size: 0.45rem; color: var(--dim); margin-left: 4px;">Unit ' + p.unitNumber + '</span>' : '') +
                        '<span style="font-size: 0.45rem; color: var(--accent); margin-left: 4px;">Role: ' + _escapeHtml(roleName) + '</span>' +
                        (p.minSkillLevel > 0 ? '<span style="font-size: 0.45rem; color: var(--dim); margin-left: 4px;">(Min: ' + p.minSkillLevel + ')</span>' : '') +
                        (assignedChars ? '<div style="font-size: 0.4rem; color: var(--dim);">' + _escapeHtml(assignedChars) + '</div>' : '') +
                        '</div>' +
                        '<div style="display: flex; gap: 4px; align-items: center;">' +
                        '<span style="font-size: 0.5rem; color: var(--accent);">' + activeAssignments.length + ' assigned</span>' +
                        '<button class="staff-pos-assign-btn" data-pos-id="' + p.id + '" style="padding: 2px 6px; font-size: 0.4rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 3px; cursor: pointer;">Assign</button>' +
                        '<button class="staff-pos-edit-btn" data-pos-id="' + p.id + '" style="padding: 2px 6px; font-size: 0.4rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 3px; cursor: pointer;">Edit</button>' +
                        '<button class="staff-pos-delete-btn" data-pos-id="' + p.id + '" style="padding: 2px 6px; font-size: 0.4rem; background: #8a3020; border: none; color: white; border-radius: 3px; cursor: pointer;">Del</button>' +
                        '</div>' +
                        '</div>';
                }
                positionsHtml += '</div>';
            }

            var modalContent =
                '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px;">' +
                '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">' +
                '<div><strong>Staff Management: ' + _escapeHtml(residence.name) + '</strong></div>' +
                '<div style="font-size: 0.6rem; color: var(--dim);">' + positions.length + ' positions · ' + assignments.length + ' assigned</div>' +
                '</div>' +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<button id="staffMgrCreateBtn" class="btn primary" style="background: var(--accent); border: none; color: white; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 0.65rem;">Create Position</button>' +
                '<button id="staffMgrViewAssignmentsBtn" class="btn" style="background: var(--bg3); border: 1px solid var(--border); padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 0.65rem; margin-left: 4px;">View Assignments</button>' +
                '</div>' +
                positionsHtml +
                '<div style="margin-top: 12px; padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">' +
                'Manage staff positions and assignments. Click "Assign" to add staff, "Edit" to modify a position, "Del" to remove it.' +
                '</div>';

            _openModal({
                title: 'Staff Management: ' + residence.name,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingStaffModal = false;
                    if (onSuccess) {
                        onSuccess();
                    }
                }
            });

            // Event handlers
            setTimeout(function() {
                // Create position button
                var createBtn = document.getElementById('staffMgrCreateBtn');
                if (createBtn) {
                    createBtn.onclick = function() {
                        _closeTopModal();
                        _processingStaffModal = false;
                        openCreateResidenceStaffPositionModal(residenceId, function() {
                            setTimeout(function() {
                                openResidenceStaffManagementModal(residenceId, onSuccess);
                            }, 100);
                        });
                    };
                }

                // View assignments button
                var viewAssignBtn = document.getElementById('staffMgrViewAssignmentsBtn');
                if (viewAssignBtn) {
                    viewAssignBtn.onclick = function() {
                        _closeTopModal();
                        _processingStaffModal = false;
                        openViewResidenceStaffAssignmentsModal(residenceId);
                    };
                }

                // Assign buttons
                var assignBtns = document.querySelectorAll('.staff-pos-assign-btn');
                assignBtns.forEach(function(btn) {
                    var newBtn = btn.cloneNode(true);
                    if (btn.parentNode) {
                        btn.parentNode.replaceChild(newBtn, btn);
                    }

                    newBtn.onclick = function(e) {
                        e.stopPropagation();
                        var posId = this.dataset.posId;
                        _closeTopModal();
                        _processingStaffModal = false;
                        openAssignResidenceStaffModal(residenceId, posId, function() {
                            setTimeout(function() {
                                openResidenceStaffManagementModal(residenceId, onSuccess);
                            }, 100);
                        });
                    };
                });

                // Edit buttons
                var editBtns = document.querySelectorAll('.staff-pos-edit-btn');
                editBtns.forEach(function(btn) {
                    var newBtn = btn.cloneNode(true);
                    if (btn.parentNode) {
                        btn.parentNode.replaceChild(newBtn, btn);
                    }

                    newBtn.onclick = function(e) {
                        e.stopPropagation();
                        var posId = this.dataset.posId;
                        _closeTopModal();
                        _processingStaffModal = false;
                        openEditResidenceStaffPositionModal(residenceId, posId, function() {
                            setTimeout(function() {
                                openResidenceStaffManagementModal(residenceId, onSuccess);
                            }, 100);
                        });
                    };
                });

                // Delete buttons
                var deleteBtns = document.querySelectorAll('.staff-pos-delete-btn');
                deleteBtns.forEach(function(btn) {
                    var newBtn = btn.cloneNode(true);
                    if (btn.parentNode) {
                        btn.parentNode.replaceChild(newBtn, btn);
                    }

                    newBtn.onclick = function(e) {
                        e.stopPropagation();
                        var posId = this.dataset.posId;
                        _closeTopModal();
                        _processingStaffModal = false;
                        openDeleteResidenceStaffPositionModal(residenceId, posId, function() {
                            setTimeout(function() {
                                openResidenceStaffManagementModal(residenceId, onSuccess);
                            }, 100);
                        });
                    };
                });

            }, 100);

        } catch (e) {
            _processingStaffModal = false;
            _showToast('Error opening staff management modal', 'error');
        }
    }

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    window.openCreateResidenceStaffPositionModal = openCreateResidenceStaffPositionModal;
    window.openEditResidenceStaffPositionModal = openEditResidenceStaffPositionModal;
    window.openDeleteResidenceStaffPositionModal = openDeleteResidenceStaffPositionModal;
    window.openAssignResidenceStaffModal = openAssignResidenceStaffModal;
    window.openViewResidenceStaffPositionsModal = openViewResidenceStaffPositionsModal;
    window.openViewResidenceStaffAssignmentsModal = openViewResidenceStaffAssignmentsModal;
    window.openResidenceStaffManagementModal = openResidenceStaffManagementModal;

    // Legacy aliases
    window._openCreateResidenceStaffPositionModal = openCreateResidenceStaffPositionModal;
    window._openEditResidenceStaffPositionModal = openEditResidenceStaffPositionModal;
    window._openDeleteResidenceStaffPositionModal = openDeleteResidenceStaffPositionModal;
    window._openAssignResidenceStaffModal = openAssignResidenceStaffModal;
    window._openViewResidenceStaffPositionsModal = openViewResidenceStaffPositionsModal;
    window._openViewResidenceStaffAssignmentsModal = openViewResidenceStaffAssignmentsModal;
    window._openResidenceStaffManagementModal = openResidenceStaffManagementModal;

})();