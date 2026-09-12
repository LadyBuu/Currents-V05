/**
 * =============================================================================
 * GOVERNMENT POSITION MODALS (js/government/modals-government-positions.js)
 * =============================================================================
 * 
 * PURPOSE: UI modals for government position management.
 * 
 * DEPENDS ON:
 *   - modals-core.js (openModal, closeTopModal, _escapeHtml, _showToast, _getIcon)
 *   - government-state.js (GovernmentState)
 *   - government-commands.js (GovernmentCommands)
 *   - government-queries.js (GovernmentQueries)
 *   - modals-char-select.js (openCharacterSelector)
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
        var plainMessage = message;
        if (typeof message === 'string') {
            plainMessage = message.replace(/<[^>]*>/g, '');
        }
        if (typeof window._showToast === 'function') {
            window._showToast(plainMessage, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(plainMessage, type);
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(plainMessage, type);
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
    // 2. STATE AND COMMANDS REFERENCE
    // =========================================================================

    var _state = window.GovernmentState;
    var _commands = window.GovernmentCommands;
    var _queries = window.GovernmentQueries;
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

    function _getDepartment(departmentId) {
        return _state ? _state.getDepartment(departmentId) : null;
    }

    function _getPositionById(departmentId, positionId) {
        return _state ? _state.getPositionById(departmentId, positionId) : null;
    }

    function _getPositionsForDepartment(departmentId) {
        return _state ? _state.getPositionsForDepartment(departmentId) : [];
    }

    function _getAssignmentsForPosition(departmentId, positionId, activeOnly) {
        return _state ? _state.getAssignmentsForPosition(departmentId, positionId, activeOnly) : [];
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

    // =========================================================================
    // 5. ADD POSITION MODAL
    // =========================================================================

    function openAddPositionModal(deptId, onSuccess) {
        if (_processingModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingModal = true;

        try {
            var dept = _getDepartment(deptId);
            if (!dept) {
                _showToast('Department not found', 'error');
                _processingModal = false;
                return;
            }

            var positions = _getPositionsForDepartment(deptId);
            var parentOptions = '<option value="">None (Top-level)</option>' + 
                positions.map(function(p) {
                    return '<option value="' + p.id + '">' + _escapeHtml(p.name) + ' (priority ' + p.priority + ')</option>';
                }).join('');

            var allRoles = _getAllRoles();
            var roleOptions = '<option value="">No role required</option>';
            for (var i = 0; i < allRoles.length; i++) {
                var r = allRoles[i];
                var icon = r.icon || '◉';
                var catName = r.category || 'Uncategorized';
                roleOptions += '<option value="' + r.id + '">' + icon + ' ' + _escapeHtml(r.name) + ' (' + _escapeHtml(catName) + ')</option>';
            }

            var infoIcon = _getIcon('CIRCLE_DOT');
            var personIcon = _getIcon('PERSON');

            var modalContent =
                '<div style="margin-bottom: 12px; padding: 8px; background: var(--bg2); border-radius: 6px;">' +
                '<strong>Department:</strong> ' + _escapeHtml(dept.name) +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Position Name *</label>' +
                '<input type="text" id="newPosName" placeholder="e.g., Minister of Education" autofocus style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Description</label>' +
                '<input type="text" id="newPosDescription" placeholder="e.g., Head of the department" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Priority (lower = higher rank)</label>' +
                '<input type="number" id="newPosPriority" value="10" min="1" max="100" style="width:80px; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '<small style="font-size:0.55rem; color:var(--dim);">1 = highest, 100 = lowest</small>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Parent Position</label>' +
                '<select id="newPosParent" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                parentOptions +
                '</select>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Required Role</label>' +
                '<select id="newPosRequiredRole" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                roleOptions +
                '</select>' +
                '<small style="font-size:0.55rem; color:var(--dim);">Optional: Link this position to a role (e.g., "Government Worker")</small>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Minimum Skill Level</label>' +
                '<input type="number" id="newPosMinSkill" value="0" min="0" max="100" style="width:80px; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '<small style="font-size:0.55rem; color:var(--dim);">Only applies if a role is selected</small>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Gender Restriction</label>' +
                '<select id="newPosGender" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '<option value="either">Either Gender</option>' +
                '<option value="male">Male Only</option>' +
                '<option value="female">Female Only</option>' +
                '</select>' +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">' +
                infoIcon + ' Positions define specific roles within a department. They can require a role and minimum skill level.' +
                '</div>';

            _openModal({
                title: 'Add Position to ' + dept.name,
                content: modalContent,
                confirmText: 'Add Position',
                cancelText: 'Cancel',
                onOpen: function() {
                    var nameInput = document.getElementById('newPosName');
                    if (nameInput) {
                        setTimeout(function() { nameInput.focus(); }, 100);
                    }
                },
                onConfirm: function() {
                    var name = document.getElementById('newPosName').value.trim();
                    if (!name) {
                        _showToast('Position name is required', 'error');
                        return false;
                    }

                    var result = _commands.addPosition(deptId, {
                        name: name,
                        description: document.getElementById('newPosDescription').value || '',
                        priority: parseInt(document.getElementById('newPosPriority').value) || 10,
                        parentPositionId: document.getElementById('newPosParent').value || null,
                        requiredRoleId: document.getElementById('newPosRequiredRole').value || null,
                        minSkillLevel: parseInt(document.getElementById('newPosMinSkill').value) || 0,
                        genderRestriction: document.getElementById('newPosGender').value || 'either'
                    });

                    if (result) {
                        if (typeof window.saveMasterData === 'function') {
                            window.saveMasterData(true);
                        }
                        if (typeof window.invalidateAccessorCaches === 'function') {
                            window.invalidateAccessorCaches();
                        }
                        if (typeof window.GovernmentState !== 'undefined' && 
                            typeof window.GovernmentState.invalidateCache === 'function') {
                            window.GovernmentState.invalidateCache();
                        }
                        _showToast('Position "' + name + '" added', 'success');
                        _closeTopModal();
                        _processingModal = false;
                        if (onSuccess) {
                            onSuccess(result.id);
                        }
                        return true;
                    }
                    return false;
                },
                onCancel: function() {
                    _processingModal = false;
                }
            });

        } catch (e) {
            _processingModal = false;
            _showToast('Error opening add position modal', 'error');
        }
    }

    // =========================================================================
    // 6. EDIT POSITION MODAL
    // =========================================================================

    function openEditPositionModal(deptId, positionId, onSuccess) {
        if (_processingModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingModal = true;

        try {
            var dept = _getDepartment(deptId);
            if (!dept) {
                _showToast('Department not found', 'error');
                _processingModal = false;
                return;
            }

            var position = _getPositionById(deptId, positionId);
            if (!position) {
                _showToast('Position not found', 'error');
                _processingModal = false;
                return;
            }

            var positions = _getPositionsForDepartment(deptId);
            var parentOptions = '<option value="">None (Top-level)</option>' + 
                positions.filter(function(p) { return p.id !== positionId; }).map(function(p) {
                    var selected = p.id === position.parentPositionId ? 'selected' : '';
                    return '<option value="' + p.id + '" ' + selected + '>' + _escapeHtml(p.name) + ' (priority ' + p.priority + ')</option>';
                }).join('');

            var allRoles = _getAllRoles();
            var roleOptions = '<option value="">No role required</option>';
            for (var i = 0; i < allRoles.length; i++) {
                var r = allRoles[i];
                var selected = (r.id === position.requiredRoleId) ? 'selected' : '';
                var icon = r.icon || '◉';
                var catName = r.category || 'Uncategorized';
                roleOptions += '<option value="' + r.id + '" ' + selected + '>' + icon + ' ' + _escapeHtml(r.name) + ' (' + _escapeHtml(catName) + ')</option>';
            }

            var infoIcon = _getIcon('CIRCLE_DOT');

            var modalContent =
                '<div style="margin-bottom: 12px; padding: 8px; background: var(--bg2); border-radius: 6px;">' +
                '<strong>Department:</strong> ' + _escapeHtml(dept.name) +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Position Name *</label>' +
                '<input type="text" id="editPosName" value="' + _escapeHtml(position.name) + '" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Description</label>' +
                '<input type="text" id="editPosDescription" value="' + _escapeHtml(position.description || '') + '" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Priority</label>' +
                '<input type="number" id="editPosPriority" value="' + (position.priority || 10) + '" min="1" max="100" style="width:80px; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Parent Position</label>' +
                '<select id="editPosParent" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                parentOptions +
                '</select>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Required Role</label>' +
                '<select id="editPosRequiredRole" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                roleOptions +
                '</select>' +
                '<small style="font-size:0.55rem; color:var(--dim);">Link this position to a role</small>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Minimum Skill Level</label>' +
                '<input type="number" id="editPosMinSkill" value="' + (position.minSkillLevel || 0) + '" min="0" max="100" style="width:80px; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Gender Restriction</label>' +
                '<select id="editPosGender" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '<option value="either" ' + (position.genderRestriction === 'either' || !position.genderRestriction ? 'selected' : '') + '>Either Gender</option>' +
                '<option value="male" ' + (position.genderRestriction === 'male' ? 'selected' : '') + '>Male Only</option>' +
                '<option value="female" ' + (position.genderRestriction === 'female' ? 'selected' : '') + '>Female Only</option>' +
                '</select>' +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">' +
                infoIcon + ' Updating the required role will affect future assignments.' +
                '</div>';

            _openModal({
                title: 'Edit Position: ' + position.name,
                content: modalContent,
                confirmText: 'Save Changes',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var name = document.getElementById('editPosName').value.trim();
                    if (!name) {
                        _showToast('Position name is required', 'error');
                        return false;
                    }

                    var result = _commands.updatePosition(deptId, positionId, {
                        name: name,
                        description: document.getElementById('editPosDescription').value || '',
                        priority: parseInt(document.getElementById('editPosPriority').value) || 10,
                        parentPositionId: document.getElementById('editPosParent').value || null,
                        requiredRoleId: document.getElementById('editPosRequiredRole').value || null,
                        minSkillLevel: parseInt(document.getElementById('editPosMinSkill').value) || 0,
                        genderRestriction: document.getElementById('editPosGender').value || 'either'
                    });

                    if (result) {
                        if (typeof window.saveMasterData === 'function') {
                            window.saveMasterData(true);
                        }
                        if (typeof window.invalidateAccessorCaches === 'function') {
                            window.invalidateAccessorCaches();
                        }
                        if (typeof window.GovernmentState !== 'undefined' && 
                            typeof window.GovernmentState.invalidateCache === 'function') {
                            window.GovernmentState.invalidateCache();
                        }
                        _showToast('Position updated', 'success');
                        _closeTopModal();
                        _processingModal = false;
                        if (onSuccess) {
                            onSuccess();
                        }
                        return true;
                    }
                    return false;
                },
                onCancel: function() {
                    _processingModal = false;
                }
            });

        } catch (e) {
            _processingModal = false;
            _showToast('Error opening edit position modal', 'error');
        }
    }

    // =========================================================================
    // 7. DELETE POSITION MODAL
    // =========================================================================

    function openDeletePositionModal(deptId, positionId, onSuccess) {
        if (_processingModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingModal = true;

        try {
            var dept = _getDepartment(deptId);
            if (!dept) {
                _showToast('Department not found', 'error');
                _processingModal = false;
                return;
            }

            var position = _getPositionById(deptId, positionId);
            if (!position) {
                _showToast('Position not found', 'error');
                _processingModal = false;
                return;
            }

            var assignments = _getAssignmentsForPosition(deptId, positionId, true);
            var hasAssignments = assignments.length > 0;

            var message = 'Delete position "' + position.name + '"?';
            if (hasAssignments) {
                message = 'This position has ' + assignments.length + ' active assignment(s).\n\nDeleting it will also remove all assignments. Continue?';
            }

            _confirmDialog(message, 'Delete Position', function() {
                var result = _commands.deletePosition(deptId, positionId);
                if (result) {
                    if (typeof window.saveMasterData === 'function') {
                        window.saveMasterData(true);
                    }
                    if (typeof window.invalidateAccessorCaches === 'function') {
                        window.invalidateAccessorCaches();
                    }
                    if (typeof window.GovernmentState !== 'undefined' && 
                        typeof window.GovernmentState.invalidateCache === 'function') {
                        window.GovernmentState.invalidateCache();
                    }
                    _showToast('Position deleted', 'info');
                    if (onSuccess) {
                        onSuccess();
                    }
                    _closeTopModal();
                    _processingModal = false;
                }
            }, function() {
                _processingModal = false;
            });

        } catch (e) {
            _processingModal = false;
            _showToast('Error opening delete position modal', 'error');
        }
    }

    // =========================================================================
    // 8. VIEW POSITION DETAILS MODAL
    // =========================================================================

    function openViewPositionDetailsModal(deptId, positionId) {
        if (_processingModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingModal = true;

        try {
            var dept = _getDepartment(deptId);
            if (!dept) {
                _showToast('Department not found', 'error');
                _processingModal = false;
                return;
            }

            var position = _getPositionById(deptId, positionId);
            if (!position) {
                _showToast('Position not found', 'error');
                _processingModal = false;
                return;
            }

            var assignments = _getAssignmentsForPosition(deptId, positionId, false);
            var activeAssignments = _getAssignmentsForPosition(deptId, positionId, true);
            var parentPos = position.parentPositionId ? _getPositionById(deptId, position.parentPositionId) : null;
            var roleName = position.requiredRoleId ? (_getRoleById(position.requiredRoleId)?.name || 'Unknown') : 'None';
            var genderText = position.genderRestriction === 'either' ? 'Either' : (position.genderRestriction === 'male' ? 'Male Only' : 'Female Only');

            var assignmentHtml = '';
            if (assignments.length === 0) {
                assignmentHtml = '<div style="color: var(--dim); font-size: 0.55rem; text-align: center; padding: 8px;">No assignments</div>';
            } else {
                assignmentHtml = '<div style="display: flex; flex-direction: column; gap: 4px;">';
                for (var i = 0; i < Math.min(assignments.length, 10); i++) {
                    var a = assignments[i];
                    var isActive = !a.endYear;
                    var char = _getCharacterById(a.characterId);
                    var roleAtAssign = a.roleIdAtAssignment ? (_getRoleById(a.roleIdAtAssignment)?.name || 'Unknown') : 'None';
                    assignmentHtml +=
                        '<div style="display: flex; justify-content: space-between; padding: 4px 8px; background: var(--bg2); border-radius: 4px; font-size: 0.55rem; border-left: 3px solid ' + (isActive ? 'var(--success)' : 'var(--dim)') + ';">' +
                        '<div>' +
                        '<span>' + _escapeHtml(a.characterName || (char ? char.name : 'Unknown')) + '</span>' +
                        (a.title && a.title !== position.name ? ' <span style="font-size:0.5rem; color:var(--dim);">(' + _escapeHtml(a.title) + ')</span>' : '') +
                        (a.roleIdAtAssignment ? ' <span style="font-size:0.45rem; color:var(--accent);">Role: ' + _escapeHtml(roleAtAssign) + '</span>' : '') +
                        (a.skillLevelAtAssignment ? ' <span style="font-size:0.45rem; color:var(--dim);">(Skill: ' + a.skillLevelAtAssignment + ')</span>' : '') +
                        '</div>' +
                        '<span style="color: ' + (isActive ? 'var(--success)' : 'var(--dim)') + '; font-size:0.5rem;">' + a.startYear + (a.endYear ? ' - ' + a.endYear : ' - Present') + '</span>' +
                        '</div>';
                }
                if (assignments.length > 10) {
                    assignmentHtml += '<div style="font-size: 0.5rem; color: var(--dim); text-align: center;">... and ' + (assignments.length - 10) + ' more</div>';
                }
                assignmentHtml += '</div>';
            }

            var modalContent =
                '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px; border-left: 3px solid ' + (position.requiredRoleId ? 'var(--accent)' : 'var(--border)') + ';">' +
                '<div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px;">' +
                '<div>' +
                '<div style="font-size: 0.9rem; font-weight: bold;">' + _escapeHtml(position.name) + '</div>' +
                '<div style="font-size: 0.6rem; color: var(--dim);">' +
                'Department: ' + _escapeHtml(dept.name) +
                (parentPos ? ' · Parent: ' + _escapeHtml(parentPos.name) : '') +
                '</div>' +
                '<div style="font-size: 0.6rem; color: var(--accent);">' +
                'Required Role: ' + _escapeHtml(roleName) +
                (position.minSkillLevel > 0 ? ' · Min Skill: ' + position.minSkillLevel : '') +
                ' · Gender: ' + genderText +
                '</div>' +
                '</div>' +
                '<div style="font-size: 0.55rem; color: var(--accent); text-align: right;">' +
                '<div>Priority: ' + (position.priority || 10) + '</div>' +
                '<div>' + activeAssignments.length + ' active · ' + assignments.length + ' total</div>' +
                '</div>' +
                '</div>' +
                (position.description ? '<div style="font-size: 0.6rem; color: var(--dim); margin-top: 8px;">' + _escapeHtml(position.description) + '</div>' : '') +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<div style="font-size: 0.65rem; color: var(--accent); margin-bottom: 6px;">Assignments (' + assignments.length + ')</div>' +
                assignmentHtml +
                '</div>' +
                '<div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; border-top: 1px solid var(--border); padding-top: 12px;">' +
                '<button id="posDetailsEditBtn" class="btn small" style="padding: 4px 12px; font-size: 0.55rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 4px; cursor: pointer;">Edit</button>' +
                '<button id="posDetailsAssignBtn" class="btn small" style="padding: 4px 12px; font-size: 0.55rem; background: var(--accent); border: none; color: white; border-radius: 4px; cursor: pointer;">Assign Character</button>' +
                '<button id="posDetailsDeleteBtn" class="btn small danger" style="padding: 4px 12px; font-size: 0.55rem; background: #8a3020; border: none; color: white; border-radius: 4px; cursor: pointer;">Delete</button>' +
                '<button id="posDetailsCloseBtn" class="btn small" style="padding: 4px 12px; font-size: 0.55rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Close</button>' +
                '</div>';

            _openModal({
                title: 'Position Details: ' + position.name,
                content: modalContent,
                confirmText: '',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingModal = false;
                }
            });

            setTimeout(function() {
                var editBtn = document.getElementById('posDetailsEditBtn');
                if (editBtn) {
                    editBtn.onclick = function() {
                        _closeTopModal();
                        _processingModal = false;
                        openEditPositionModal(deptId, positionId, function() {
                            setTimeout(function() {
                                openViewPositionDetailsModal(deptId, positionId);
                            }, 100);
                        });
                    };
                }

                var assignBtn = document.getElementById('posDetailsAssignBtn');
                if (assignBtn) {
                    assignBtn.onclick = function() {
                        _closeTopModal();
                        _processingModal = false;
                        openAssignCharacterToPositionModal(deptId, positionId, function() {
                            setTimeout(function() {
                                openViewPositionDetailsModal(deptId, positionId);
                            }, 100);
                        });
                    };
                }

                var deleteBtn = document.getElementById('posDetailsDeleteBtn');
                if (deleteBtn) {
                    deleteBtn.onclick = function() {
                        _closeTopModal();
                        _processingModal = false;
                        openDeletePositionModal(deptId, positionId, function() {
                            _processingModal = false;
                        });
                    };
                }

                var closeBtn = document.getElementById('posDetailsCloseBtn');
                if (closeBtn) {
                    closeBtn.onclick = function() {
                        _closeTopModal();
                        _processingModal = false;
                    };
                }
            }, 100);

        } catch (e) {
            _processingModal = false;
            _showToast('Error opening position details', 'error');
        }
    }

    // =========================================================================
    // 9. ASSIGN CHARACTER TO POSITION MODAL (NEW - FIXED)
    // =========================================================================

    function openAssignCharacterToPositionModal(departmentId, positionId, onSuccess) {
        if (_processingModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingModal = true;

        try {
            var dept = _getDepartment(departmentId);
            if (!dept) {
                _showToast('Department not found', 'error');
                _processingModal = false;
                return;
            }

            var position = _getPositionById(departmentId, positionId);
            if (!position) {
                _showToast('Position not found', 'error');
                _processingModal = false;
                return;
            }

            // Open character selector
            if (typeof window.openCharacterSelector === 'function' || 
                typeof window.openUnifiedCharacterSelector === 'function') {
                _openCharacterSelector({
                    title: 'Assign to: ' + position.name,
                    filters: {
                        status: 'all',
                        showDeceased: false
                    },
                    onSelect: function(character) {
                        // Check if character already assigned to this position
                        var existing = _state.getAssignmentsForPosition(departmentId, positionId, true);
                        var alreadyAssigned = false;
                        for (var i = 0; i < existing.length; i++) {
                            if (existing[i].characterId === character.id) {
                                alreadyAssigned = true;
                                break;
                            }
                        }
                        
                        if (alreadyAssigned) {
                            _showToast('Character already assigned to this position', 'warning');
                            _processingModal = false;
                            return;
                        }

                        // Check qualification
                        var isQualified = true;
                        if (window.GovernmentAssignment && 
                            typeof window.GovernmentAssignment.isCharacterQualifiedForPosition === 'function') {
                            isQualified = window.GovernmentAssignment.isCharacterQualifiedForPosition(
                                character.id, departmentId, positionId
                            );
                        }

                        if (!isQualified) {
                            _showToast('Character is not qualified for this position', 'warning');
                            _processingModal = false;
                            return;
                        }

                        var startYear = _getCurrentYear();
                        var result = _commands.assignCharacterToPosition(
                            departmentId,
                            positionId,
                            character.id,
                            {
                                startYear: startYear,
                                title: position.name,
                                addRoleIfMissing: true
                            }
                        );

                        if (result) {
                            if (typeof window.saveMasterData === 'function') {
                                window.saveMasterData(true);
                            }
                            if (typeof window.invalidateAccessorCaches === 'function') {
                                window.invalidateAccessorCaches();
                            }
                            if (typeof window.GovernmentState !== 'undefined' && 
                                typeof window.GovernmentState.invalidateCache === 'function') {
                                window.GovernmentState.invalidateCache();
                            }
                            _closeTopModal();
                            _showToast(character.name + ' assigned to ' + position.name, 'success');
                            _processingModal = false;
                            if (onSuccess) onSuccess();
                        } else {
                            _showToast('Failed to assign character', 'error');
                            _processingModal = false;
                        }
                    },
                    onCancel: function() {
                        _processingModal = false;
                    }
                });
            } else {
                _showToast('Character selector not available', 'error');
                _processingModal = false;
            }

        } catch (e) {
            _processingModal = false;
            _showToast('Error opening assign modal', 'error');
        }
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.openAddPositionModal = openAddPositionModal;
    window.openEditPositionModal = openEditPositionModal;
    window.openDeletePositionModal = openDeletePositionModal;
    window.openViewPositionDetailsModal = openViewPositionDetailsModal;
    window.openAssignCharacterToPositionModal = openAssignCharacterToPositionModal;

    // Legacy aliases
    window._openAddPositionModal = openAddPositionModal;
    window._openEditPositionModal = openEditPositionModal;
    window._openDeletePositionModal = openDeletePositionModal;
    window._openViewPositionDetailsModal = openViewPositionDetailsModal;
    window._openAssignCharacterToPositionModal = openAssignCharacterToPositionModal;

})();