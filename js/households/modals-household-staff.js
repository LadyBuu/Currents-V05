/**
 * =============================================================================
 * HOUSEHOLD STAFF POSITION MODALS (modals-household-staff.js)
 * =============================================================================
 * 
 * PURPOSE: UI modals for managing household staff positions.
 * 
 * DEPENDS ON:
 *   - modals-core.js (openModal, closeTopModal, _escapeHtml, _showToast, _getIcon)
 *   - household-state.js (HouseholdState)
 *   - household-commands.js (HouseholdCommands)
 *   - role-state.js (RoleState) - for role selection
 *   - role-queries.js (RoleQueries) - for role queries
 *   - modals-role-select.js (openRoleSelector, openRolePickerForPosition)
 * 
 * ICON POLICY:
 *   - All icons from icons.js via _getIcon()
 *   - NO emojis
 *   - NO icons in confirm/cancel buttons (plain text only)
 * 
 * UPDATED: Removed "Create Role" button - users must select from existing roles only
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

    function _openRoleSelector(options) {
        if (typeof window.openRoleSelector === 'function') {
            return window.openRoleSelector(options);
        }
        if (typeof window.openRolePickerForPosition === 'function') {
            return window.openRolePickerForPosition(options);
        }
        if (typeof window._openRoleSelector === 'function') {
            return window._openRoleSelector(options);
        }
        _showToast('Role selector not available', 'error');
        return null;
    }

    // =========================================================================
    // 2. STATE AND COMMANDS REFERENCE
    // =========================================================================

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

    function _getHousehold(householdId) {
        return _state ? _state.getHousehold(householdId) : null;
    }

    function _getCharacterById(characterId) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(characterId);
        }
        return null;
    }

    function _getHouseholdPositions(householdId) {
        return _state ? _state.getHouseholdPositions({ householdId: householdId }) : [];
    }

    function _getHouseholdPosition(positionId) {
        return _state ? _state.getHouseholdPosition(positionId) : null;
    }

    function _getHouseholdAssignments(householdId) {
        return _state ? _state.getAssignmentsForHousehold(householdId, true) : [];
    }

    function _getAllRoles() {
        return _roleState ? _roleState.getAllRoles() : [];
    }

    function _getRoleById(id) {
        if (typeof window.getRoleById === 'function') {
            return window.getRoleById(id);
        }
        return null;
    }

    // =========================================================================
    // 5. CREATE HOUSEHOLD POSITION MODAL
    // =========================================================================

    function openCreateHouseholdPositionModal(householdId, onSuccess) {
        if (_processingStaffModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingStaffModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingStaffModal = false;
                return;
            }

            var allRoles = _getAllRoles();
            var currentYear = _getCurrentYear();

            var roleOptions = '<option value="">No role required</option>';
            for (var i = 0; i < allRoles.length; i++) {
                var r = allRoles[i];
                var icon = r.icon || '◉';
                var catName = r.category || 'Uncategorized';
                roleOptions += '<option value="' + r.id + '">' + icon + ' ' + _escapeHtml(r.name) + ' (' + _escapeHtml(catName) + ')</option>';
            }

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: var(--bg3); border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; font-size: 0.6rem; color: var(--dim);">' +
                'Creating a position for <strong>' + _escapeHtml(household.name) + '</strong>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Position Name *</label>' +
                '<input type="text" id="newPosName" placeholder="e.g., Cook, Maid, Butler, Gardener" autofocus style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Department</label>' +
                '<select id="newPosDepartment" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                '<option value="">None</option>' +
                (household.departments || []).map(function(d) {
                    return '<option value="' + d.id + '">' + _escapeHtml(d.name) + '</option>';
                }).join('') +
                '</select>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Required Role</label>' +
                '<div style="display: flex; gap: 4px;">' +
                '<input type="text" id="newPosRequiredRoleDisplay" placeholder="Select a role..." readonly style="flex: 1; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem; cursor: pointer;">' +
                '<input type="hidden" id="newPosRequiredRoleId">' +
                '<button id="newPosSelectRoleBtn" class="btn small" style="padding: 4px 8px; font-size: 0.6rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 4px; cursor: pointer;">Select</button>' +
                '<button id="newPosClearRoleBtn" class="btn small" style="padding: 4px 8px; font-size: 0.6rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Clear</button>' +
                '</div>' +
                '<small style="font-size: 0.55rem; color: var(--dim);">Optional: Link this position to a role. Characters must have this role to be assigned.</small>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Minimum Skill Level</label>' +
                '<input type="number" id="newPosMinSkill" value="0" min="0" max="100" style="width: 80px; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '<small style="font-size: 0.55rem; color: var(--dim);">Only applies if a role is selected</small>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Priority (lower = higher rank)</label>' +
                '<input type="number" id="newPosPriority" value="10" min="1" max="100" style="width: 80px; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Description (optional)</label>' +
                '<input type="text" id="newPosDescription" placeholder="e.g., Responsible for meal preparation" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">' +
                'Positions define specific roles within a household. Staff can be assigned to positions, and positions can require a specific role.' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Create Household Position',
                content: modalContent,
                confirmText: 'Create Position',
                cancelText: 'Cancel',
                onOpen: function() {
                    var nameInput = document.getElementById('newPosName');
                    if (nameInput) {
                        setTimeout(function() { nameInput.focus(); }, 100);
                    }

                    // Select role button
                    var selectBtn = document.getElementById('newPosSelectRoleBtn');
                    var displayInput = document.getElementById('newPosRequiredRoleDisplay');
                    var hiddenInput = document.getElementById('newPosRequiredRoleId');
                    var clearBtn = document.getElementById('newPosClearRoleBtn');

                    if (selectBtn) {
                        selectBtn.onclick = function() {
                            _openRoleSelector({
                                title: 'Select Required Role',
                                context: 'household',
                                onSelect: function(role) {
                                    if (role) {
                                        displayInput.value = role.name;
                                        hiddenInput.value = role.id;
                                        _showToast('Selected role: ' + role.name, 'success');
                                    }
                                },
                                onCancel: function() {
                                    // Do nothing
                                }
                            });
                        };
                    }

                    if (clearBtn) {
                        clearBtn.onclick = function() {
                            displayInput.value = '';
                            hiddenInput.value = '';
                        };
                    }
                },
                onConfirm: function() {
                    var name = document.getElementById('newPosName').value.trim();
                    var departmentId = document.getElementById('newPosDepartment').value || null;
                    var requiredRoleId = document.getElementById('newPosRequiredRoleId').value || null;
                    var minSkillLevel = parseInt(document.getElementById('newPosMinSkill').value) || 0;
                    var priority = parseInt(document.getElementById('newPosPriority').value) || 10;
                    var description = document.getElementById('newPosDescription').value.trim();

                    if (!name) {
                        _showToast('Position name is required', 'error');
                        return false;
                    }

                    var result = _commands.createHouseholdPosition({
                        name: name,
                        householdId: householdId,
                        departmentId: departmentId,
                        requiredRoleId: requiredRoleId,
                        minSkillLevel: minSkillLevel,
                        priority: priority,
                        description: description
                    });

                    if (result && result.success) {
                        var roleMsg = requiredRoleId ? ' (Role: ' + _getRoleById(requiredRoleId)?.name + ')' : '';
                        _showToast('Position "' + name + '" created' + roleMsg, 'success');
                        _closeTopModal();
                        _processingStaffModal = false;
                        if (onSuccess) {
                            onSuccess(result.position);
                        }
                    } else {
                        _showToast(result ? result.reason : 'Failed to create position', 'error');
                    }
                    return true;
                },
                onCancel: function() {
                    _processingStaffModal = false;
                }
            });

        } catch (e) {
            _processingStaffModal = false;
            _showToast('Error opening create position modal', 'error');
        }
    }

    // =========================================================================
    // 6. EDIT HOUSEHOLD POSITION MODAL
    // =========================================================================

    function openEditHouseholdPositionModal(householdId, positionId, onSuccess) {
        if (_processingStaffModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingStaffModal = true;

        try {
            var household = _getHousehold(householdId);
            var position = _getHouseholdPosition(positionId);

            if (!household || !position) {
                _showToast('Household or position not found', 'error');
                _processingStaffModal = false;
                return;
            }

            var allRoles = _getAllRoles();

            var roleOptions = '<option value="">No role required</option>';
            for (var i = 0; i < allRoles.length; i++) {
                var r = allRoles[i];
                var selected = (r.id === position.requiredRoleId) ? 'selected' : '';
                var icon = r.icon || '◉';
                var catName = r.category || 'Uncategorized';
                roleOptions += '<option value="' + r.id + '" ' + selected + '>' + icon + ' ' + _escapeHtml(r.name) + ' (' + _escapeHtml(catName) + ')</option>';
            }

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: var(--bg3); border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; font-size: 0.6rem; color: var(--dim);">' +
                'Editing position in <strong>' + _escapeHtml(household.name) + '</strong>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Position Name *</label>' +
                '<input type="text" id="editPosName" value="' + _escapeHtml(position.name) + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Department</label>' +
                '<select id="editPosDepartment" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                '<option value="">None</option>' +
                (household.departments || []).map(function(d) {
                    var selected = (d.id === position.departmentId) ? 'selected' : '';
                    return '<option value="' + d.id + '" ' + selected + '>' + _escapeHtml(d.name) + '</option>';
                }).join('') +
                '</select>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Required Role</label>' +
                '<div style="display: flex; gap: 4px;">' +
                '<input type="text" id="editPosRequiredRoleDisplay" value="' + (position.requiredRoleId ? _getRoleById(position.requiredRoleId)?.name || '' : '') + '" placeholder="Select a role..." readonly style="flex: 1; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem; cursor: pointer;">' +
                '<input type="hidden" id="editPosRequiredRoleId" value="' + (position.requiredRoleId || '') + '">' +
                '<button id="editPosSelectRoleBtn" class="btn small" style="padding: 4px 8px; font-size: 0.6rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 4px; cursor: pointer;">Select</button>' +
                '<button id="editPosClearRoleBtn" class="btn small" style="padding: 4px 8px; font-size: 0.6rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Clear</button>' +
                '</div>' +
                '<small style="font-size: 0.55rem; color: var(--dim);">Optional: Link this position to a role</small>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Minimum Skill Level</label>' +
                '<input type="number" id="editPosMinSkill" value="' + (position.minSkillLevel || 0) + '" min="0" max="100" style="width: 80px; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Priority</label>' +
                '<input type="number" id="editPosPriority" value="' + (position.priority || 10) + '" min="1" max="100" style="width: 80px; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Description</label>' +
                '<input type="text" id="editPosDescription" value="' + _escapeHtml(position.description || '') + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Edit Position: ' + position.name,
                content: modalContent,
                confirmText: 'Save Changes',
                cancelText: 'Cancel',
                onOpen: function() {
                    // Select role button
                    var selectBtn = document.getElementById('editPosSelectRoleBtn');
                    var displayInput = document.getElementById('editPosRequiredRoleDisplay');
                    var hiddenInput = document.getElementById('editPosRequiredRoleId');
                    var clearBtn = document.getElementById('editPosClearRoleBtn');

                    if (selectBtn) {
                        selectBtn.onclick = function() {
                            var currentId = hiddenInput.value || null;
                            _openRoleSelector({
                                title: 'Select Required Role',
                                context: 'household',
                                preselectedId: currentId,
                                onSelect: function(role) {
                                    if (role) {
                                        displayInput.value = role.name;
                                        hiddenInput.value = role.id;
                                        _showToast('Selected role: ' + role.name, 'success');
                                    }
                                },
                                onCancel: function() {
                                    // Do nothing
                                }
                            });
                        };
                    }

                    if (clearBtn) {
                        clearBtn.onclick = function() {
                            displayInput.value = '';
                            hiddenInput.value = '';
                        };
                    }
                },
                onConfirm: function() {
                    var name = document.getElementById('editPosName').value.trim();
                    var departmentId = document.getElementById('editPosDepartment').value || null;
                    var requiredRoleId = document.getElementById('editPosRequiredRoleId').value || null;
                    var minSkillLevel = parseInt(document.getElementById('editPosMinSkill').value) || 0;
                    var priority = parseInt(document.getElementById('editPosPriority').value) || 10;
                    var description = document.getElementById('editPosDescription').value.trim();

                    if (!name) {
                        _showToast('Position name is required', 'error');
                        return false;
                    }

                    var result = _commands.updateHouseholdPosition(positionId, {
                        name: name,
                        departmentId: departmentId,
                        requiredRoleId: requiredRoleId,
                        minSkillLevel: minSkillLevel,
                        priority: priority,
                        description: description
                    });

                    if (result && result.success) {
                        _showToast('Position updated', 'success');
                        _closeTopModal();
                        _processingStaffModal = false;
                        if (onSuccess) {
                            onSuccess();
                        }
                    } else {
                        _showToast(result ? result.reason : 'Failed to update position', 'error');
                    }
                    return true;
                },
                onCancel: function() {
                    _processingStaffModal = false;
                }
            });

        } catch (e) {
            _processingStaffModal = false;
            _showToast('Error opening edit position modal', 'error');
        }
    }

    // =========================================================================
    // 7. DELETE HOUSEHOLD POSITION MODAL
    // =========================================================================

    function openDeleteHouseholdPositionModal(householdId, positionId, onSuccess) {
        if (_processingStaffModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingStaffModal = true;

        try {
            var household = _getHousehold(householdId);
            var position = _getHouseholdPosition(positionId);

            if (!household || !position) {
                _showToast('Household or position not found', 'error');
                _processingStaffModal = false;
                return;
            }

            var assignments = _state.getAssignmentsForPosition(positionId, true);

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: rgba(200, 68, 68, 0.15); border: 1px solid var(--warn); border-radius: 8px; padding: 12px; margin-bottom: 16px;">' +
                '<strong>Delete Position: ' + _escapeHtml(position.name) + '</strong>' +
                '<div style="margin-top: 8px; font-size: 0.65rem;">' +
                'This will permanently remove the position from the household.' +
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
                (position.requiredRoleId ? '<div style="display: flex; justify-content: space-between; font-size: 0.6rem; margin-top: 4px;"><span>Required Role:</span><span>' + _escapeHtml(_getRoleById(position.requiredRoleId)?.name || 'Unknown') + '</span></div>' : '') +
                '<div style="display: flex; justify-content: space-between; font-size: 0.6rem; margin-top: 4px;"><span>Current Assignments:</span><span>' + assignments.length + '</span></div>' +
                '</div>' +
                '<div style="margin-top: 12px;">' +
                '<label style="display: flex; align-items: center; gap: 8px; font-size: 0.65rem; cursor: pointer;">' +
                '<input type="checkbox" id="deleteRemoveAssignments" ' + (assignments.length > 0 ? 'checked' : '') + '>' +
                '<span>Remove all assignments from this position</span>' +
                '</label>' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Delete Position: ' + position.name,
                content: modalContent,
                confirmText: 'Delete Position',
                cancelText: 'Cancel',
                confirmStyle: 'danger',
                onConfirm: function() {
                    var removeAssignments = document.getElementById('deleteRemoveAssignments')?.checked !== false;

                    var result = _commands.deleteHouseholdPosition(positionId, {
                        removeAssignments: removeAssignments
                    });

                    if (result && result.success) {
                        _showToast('Position "' + position.name + '" deleted', 'info');
                        _closeTopModal();
                        _processingStaffModal = false;
                        if (onSuccess) {
                            onSuccess();
                        }
                    } else {
                        _showToast(result ? result.reason : 'Failed to delete position', 'error');
                    }
                    return true;
                },
                onCancel: function() {
                    _processingStaffModal = false;
                }
            });

        } catch (e) {
            _processingStaffModal = false;
            _showToast('Error opening delete position modal', 'error');
        }
    }

    // =========================================================================
    // 8. ASSIGN STAFF TO HOUSEHOLD POSITION MODAL (ENHANCED)
    // =========================================================================

    function openAssignStaffToHouseholdPositionModal(householdId, positionId, onSuccess) {
        if (_processingStaffModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingStaffModal = true;

        try {
            var household = _getHousehold(householdId);
            var position = _getHouseholdPosition(positionId);

            if (!household || !position) {
                _showToast('Household or position not found', 'error');
                _processingStaffModal = false;
                return;
            }

            var currentYear = _getCurrentYear();
            var allChars = typeof window.getCharacters === 'function' ? window.getCharacters() : [];

            // Filter: exclude already assigned to this position
            var existingAssignments = _state.getAssignmentsForPosition(positionId, true);
            var assignedIds = {};
            for (var i = 0; i < existingAssignments.length; i++) {
                assignedIds[existingAssignments[i].characterId] = true;
            }

            var availableChars = allChars.filter(function(c) {
                if (c.isDeceased) return false;
                if (assignedIds[c.id]) return false;
                return true;
            });

            // Build character list HTML
            var charsHtml = '';
            if (availableChars.length === 0) {
                charsHtml = '<div style="color: var(--dim); text-align: center; padding: 20px; font-size: 0.6rem;">No available characters</div>';
            } else {
                charsHtml = '<div style="max-height: 250px; overflow-y: auto;">';
                for (var i = 0; i < availableChars.length; i++) {
                    var c = availableChars[i];
                    var age = typeof window.calculateAge === 'function' ?
                        window.calculateAge(c.birthYear, c.isDeceased, c.deathYear) : '?';
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

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="background: var(--bg3); border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; font-size: 0.6rem;">' +
                '<strong>Position:</strong> ' + _escapeHtml(position.name) +
                '<br><strong>Household:</strong> ' + _escapeHtml(household.name) +
                '<br><strong>Required Role:</strong> ' + roleDisplay +
                (position.minSkillLevel > 0 ? ' · <strong>Min Skill:</strong> ' + position.minSkillLevel : '') +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Select Character</label>' +
                charsHtml +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: flex; align-items: center; gap: 8px; font-size: 0.65rem; cursor: pointer;">' +
                '<input type="checkbox" id="assignAddRoleIfMissing" checked>' +
                '<span>Add required role to character if missing</span>' +
                '</label>' +
                '<small style="font-size: 0.5rem; color: var(--dim);">If unchecked, character must already have the required role</small>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Custom Title (optional)</label>' +
                '<input type="text" id="assignTitle" value="' + _escapeHtml(position.name) + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Start Year</label>' +
                '<input type="number" id="assignStartYear" value="' + currentYear + '" min="1" style="width: 100px; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem;">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes (optional)</label>' +
                '<textarea id="assignNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;"></textarea>' +
                '</div>' +
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

                    var title = document.getElementById('assignTitle').value.trim() || position.name;
                    var startYear = parseInt(document.getElementById('assignStartYear').value) || currentYear;
                    var notes = document.getElementById('assignNotes').value.trim();
                    var addRoleIfMissing = document.getElementById('assignAddRoleIfMissing')?.checked !== false;

                    var result = _commands.assignCharacterToHouseholdPosition(positionId, selectedCharId, {
                        title: title,
                        startYear: startYear,
                        notes: notes,
                        addRoleIfMissing: addRoleIfMissing,
                        defaultSkillLevel: 10
                    });

                    if (result && result.success) {
                        var char = _getCharacterById(selectedCharId);
                        var roleMsg = position.requiredRoleId ? ' (Role: ' + _getRoleById(position.requiredRoleId)?.name + ')' : '';
                        _showToast((char ? char.name : 'Character') + ' assigned as ' + title + roleMsg, 'success');
                        _closeTopModal();
                        _processingStaffModal = false;
                        if (onSuccess) {
                            onSuccess(result.assignment);
                        }
                    } else {
                        _showToast(result ? result.reason : 'Failed to assign staff', 'error');
                    }
                    return true;
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
                        // Deselect all
                        document.querySelectorAll('.staff-select-item').forEach(function(el) {
                            el.classList.remove('selected');
                            el.style.background = 'var(--bg2)';
                            el.style.borderColor = 'var(--border)';
                        });
                        // Select this one
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
            }, 100);

        } catch (e) {
            _processingStaffModal = false;
            _showToast('Error opening assign staff modal', 'error');
        }
    }

    // =========================================================================
    // 9. VIEW HOUSEHOLD POSITIONS MODAL
    // =========================================================================

    function openViewHouseholdPositionsModal(householdId, onSelect) {
        if (_processingStaffModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingStaffModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingStaffModal = false;
                return;
            }

            var positions = _getHouseholdPositions(householdId);
            var assignments = _state.getAssignmentsForHousehold(householdId, true);

            // Build assignment map
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
                positionsHtml = '<div style="color: var(--dim); text-align: center; padding: 40px; font-size: 0.6rem;">No positions created yet</div>';
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
                        '<div class="position-item" data-pos-id="' + p.id + '" style="' +
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
                        '<span style="font-size: 0.55rem; color: var(--accent); margin-left: 8px;">Role: ' + _escapeHtml(roleName) + '</span>' +
                        (p.minSkillLevel > 0 ? '<span style="font-size: 0.55rem; color: var(--dim); margin-left: 4px;">(Min: ' + p.minSkillLevel + ')</span>' : '') +
                        '</div>' +
                        '<div style="font-size: 0.55rem; color: var(--accent);">' +
                        activeAssignments.length + ' assigned' +
                        '</div>' +
                        '</div>' +
                        (assignedChars ? '<div style="font-size: 0.5rem; color: var(--dim); margin-top: 4px;">' + _escapeHtml(assignedChars) + '</div>' : '') +
                        (p.description ? '<div style="font-size: 0.5rem; color: var(--dim); margin-top: 2px;">' + _escapeHtml(p.description) + '</div>' : '') +
                        '</div>';
                }
                positionsHtml += '</div>';
            }

            var modalContent =
                '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px;">' +
                '<strong>Household:</strong> ' + _escapeHtml(household.name) +
                '<div style="font-size: 0.6rem; color: var(--dim); margin-top: 4px;">' + positions.length + ' positions · ' + assignments.length + ' total assignments</div>' +
                '</div>' +
                positionsHtml +
                '<div style="margin-top: 12px; padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">' +
                'Click on a position to manage it, or use the buttons above to create/assign.' +
                '</div>';

            _openModal({
                title: 'Household Positions: ' + household.name,
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingStaffModal = false;
                }
            });

            // Click handlers for position items
            setTimeout(function() {
                var items = document.querySelectorAll('.position-item');
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
            _showToast('Error opening view positions modal', 'error');
        }
    }

    // =========================================================================
    // 10. VIEW STAFF ASSIGNMENTS MODAL
    // =========================================================================

    function openViewStaffAssignmentsModal(householdId) {
        if (_processingStaffModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingStaffModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingStaffModal = false;
                return;
            }

            var assignments = _state.getAssignmentsForHousehold(householdId, true);

            var positionsMap = {};
            var positions = _state.getHouseholdPositions({ householdId: householdId });
            for (var i = 0; i < positions.length; i++) {
                positionsMap[positions[i].id] = positions[i];
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
                        '<span style="font-size: 0.5rem; color: var(--accent); margin-left: 6px;">Role: ' + _escapeHtml(roleName) + '</span>' +
                        (a.skillLevelAtAssignment ? '<span style="font-size: 0.5rem; color: var(--dim); margin-left: 4px;">(Skill: ' + a.skillLevelAtAssignment + ')</span>' : '') +
                        '</div>' +
                        '<div style="font-size: 0.5rem; color: var(--dim);">' +
                        'Since ' + a.startYear +
                        '<button class="end-assignment-btn small" data-assign-id="' + a.id + '" style="margin-left: 8px; padding: 2px 6px; font-size: 0.45rem; background: #8a5a20; border: none; color: white; border-radius: 3px; cursor: pointer;">End</button>' +
                        '</div>' +
                        '</div>';
                }
                assignmentsHtml += '</div>';
            }

            var modalContent =
                '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px;">' +
                '<strong>Staff Assignments: ' + _escapeHtml(household.name) + '</strong>' +
                '<div style="font-size: 0.6rem; color: var(--dim); margin-top: 4px;">' + assignments.length + ' active staff members</div>' +
                '</div>' +
                assignmentsHtml +
                '<div style="margin-top: 12px; padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">' +
                'Click "End" to terminate a staff assignment.' +
                '</div>';

            _openModal({
                title: 'Staff Assignments',
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingStaffModal = false;
                }
            });

            // End assignment handlers
            setTimeout(function() {
                var endBtns = document.querySelectorAll('.end-assignment-btn');
                endBtns.forEach(function(btn) {
                    var newBtn = btn.cloneNode(true);
                    if (btn.parentNode) {
                        btn.parentNode.replaceChild(newBtn, btn);
                    }

                    newBtn.onclick = function(e) {
                        e.stopPropagation();
                        var assignId = this.dataset.assignId;
                        var currentYear = _getCurrentYear();

                        _confirmDialog(
                            'End this staff assignment?',
                            'End Assignment',
                            function() {
                                var result = _commands.endHouseholdAssignment(assignId, currentYear, 'Ended by user');
                                if (result && result.success) {
                                    _showToast('Assignment ended', 'success');
                                    _closeTopModal();
                                    _processingStaffModal = false;
                                    setTimeout(function() {
                                        openViewStaffAssignmentsModal(householdId);
                                    }, 100);
                                } else {
                                    _showToast(result ? result.reason : 'Failed to end assignment', 'error');
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
    // 11. OPEN STAFF MANAGEMENT MODAL (Combined - Convenience)
    // =========================================================================

    function openStaffManagementModal(householdId, onSuccess) {
        if (_processingStaffModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingStaffModal = true;

        try {
            var household = _getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingStaffModal = false;
                return;
            }

            var positions = _getHouseholdPositions(householdId);
            var assignments = _state.getAssignmentsForHousehold(householdId, true);

            // Build assignment map
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
                positionsHtml = '<div style="color: var(--dim); text-align: center; padding: 20px; font-size: 0.6rem;">No positions created yet</div>';
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
                        '<span style="font-size: 0.5rem; color: var(--accent); margin-left: 6px;">Role: ' + _escapeHtml(roleName) + '</span>' +
                        (p.minSkillLevel > 0 ? '<span style="font-size: 0.5rem; color: var(--dim); margin-left: 4px;">(Min: ' + p.minSkillLevel + ')</span>' : '') +
                        (assignedChars ? '<div style="font-size: 0.45rem; color: var(--dim);">' + _escapeHtml(assignedChars) + '</div>' : '') +
                        '</div>' +
                        '<div style="display: flex; gap: 4px; align-items: center;">' +
                        '<span style="font-size: 0.5rem; color: var(--accent);">' + activeAssignments.length + ' assigned</span>' +
                        '<button class="pos-assign-btn btn small" data-pos-id="' + p.id + '" style="padding: 2px 6px; font-size: 0.45rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 3px; cursor: pointer;">Assign</button>' +
                        '<button class="pos-edit-btn btn small" data-pos-id="' + p.id + '" style="padding: 2px 6px; font-size: 0.45rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 3px; cursor: pointer;">Edit</button>' +
                        '<button class="pos-delete-btn btn small danger" data-pos-id="' + p.id + '" style="padding: 2px 6px; font-size: 0.45rem; background: #8a3020; border: none; color: white; border-radius: 3px; cursor: pointer;">Del</button>' +
                        '</div>' +
                        '</div>';
                }
                positionsHtml += '</div>';
            }

            var modalContent =
                '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px;">' +
                '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">' +
                '<div><strong>Staff Management: ' + _escapeHtml(household.name) + '</strong></div>' +
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
                title: 'Staff Management',
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
                        openCreateHouseholdPositionModal(householdId, function() {
                            setTimeout(function() {
                                openStaffManagementModal(householdId, onSuccess);
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
                        openViewStaffAssignmentsModal(householdId);
                    };
                }

                // Assign buttons
                var assignBtns = document.querySelectorAll('.pos-assign-btn');
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
                        openAssignStaffToHouseholdPositionModal(householdId, posId, function() {
                            setTimeout(function() {
                                openStaffManagementModal(householdId, onSuccess);
                            }, 100);
                        });
                    };
                });

                // Edit buttons
                var editBtns = document.querySelectorAll('.pos-edit-btn');
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
                        openEditHouseholdPositionModal(householdId, posId, function() {
                            setTimeout(function() {
                                openStaffManagementModal(householdId, onSuccess);
                            }, 100);
                        });
                    };
                });

                // Delete buttons
                var deleteBtns = document.querySelectorAll('.pos-delete-btn');
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
                        openDeleteHouseholdPositionModal(householdId, posId, function() {
                            setTimeout(function() {
                                openStaffManagementModal(householdId, onSuccess);
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

    window.openCreateHouseholdPositionModal = openCreateHouseholdPositionModal;
    window.openEditHouseholdPositionModal = openEditHouseholdPositionModal;
    window.openDeleteHouseholdPositionModal = openDeleteHouseholdPositionModal;
    window.openAssignStaffToHouseholdPositionModal = openAssignStaffToHouseholdPositionModal;
    window.openViewHouseholdPositionsModal = openViewHouseholdPositionsModal;
    window.openViewStaffAssignmentsModal = openViewStaffAssignmentsModal;
    window.openStaffManagementModal = openStaffManagementModal;

    // Legacy aliases
    window._openCreateHouseholdPositionModal = openCreateHouseholdPositionModal;
    window._openEditHouseholdPositionModal = openEditHouseholdPositionModal;
    window._openDeleteHouseholdPositionModal = openDeleteHouseholdPositionModal;
    window._openAssignStaffToHouseholdPositionModal = openAssignStaffToHouseholdPositionModal;
    window._openViewHouseholdPositionsModal = openViewHouseholdPositionsModal;
    window._openViewStaffAssignmentsModal = openViewStaffAssignmentsModal;
    window._openStaffManagementModal = openStaffManagementModal;

})();