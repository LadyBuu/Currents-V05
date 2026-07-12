/**
 * =============================================================================
 * GOVERNMENT DEPARTMENT MODALS (modals-government-departments.js)
 * =============================================================================
 * 
 * PURPOSE: UI modals for government department management.
 * 
 * DEPENDS ON:
 *   - modals-core.js (openModal, closeTopModal, _escapeHtml, _showToast, _getIcon)
 *   - government-state.js (GovernmentState)
 *   - government-commands.js (GovernmentCommands)
 *   - government-queries.js (GovernmentQueries)
 *   - modals-char-select.js (openCharacterSelector)
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

    // =========================================================================
    // 2. STATE AND COMMANDS REFERENCE
    // =========================================================================

    var _state = window.GovernmentState;
    var _commands = window.GovernmentCommands;
    var _queries = window.GovernmentQueries;

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

    function _getAllDepartments() {
        return _state ? _state.getAllDepartments({ includeDeprecated: false }) : [];
    }

    function _getPositionsForDepartment(departmentId) {
        return _state ? _state.getPositionsForDepartment(departmentId) : [];
    }

    function _getPositionById(departmentId, positionId) {
        return _state ? _state.getPositionById(departmentId, positionId) : null;
    }

    function _getAssignmentsForDepartment(departmentId, activeOnly) {
        return _state ? _state.getAssignmentsForDepartment(departmentId, activeOnly) : [];
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

    function _getPlaceById(placeId) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(placeId);
        }
        return null;
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
    // 5. CREATE DEPARTMENT MODAL
    // =========================================================================

    function openCreateGovernmentDepartmentModal(locationId, onSuccess) {
        if (_processingModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _processingModal = true;

        try {
            var locationOptionsHtml = _buildLocationDropdown(locationId, 'Select a location', true);

            var departments = _getAllDepartments();
            var deptOptions = '<option value="">None (Top-level)</option>' + 
                departments.map(function(d) {
                    return '<option value="' + d.id + '">' + _escapeHtml(d.name) + '</option>';
                }).join('');

            var infoIcon = _getIcon('CIRCLE_DOT');

            var modalContent =
                '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Department Name *</label>' +
                '<input type="text" id="newDeptName" placeholder="e.g., Ministry of Education" autofocus style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Description</label>' +
                '<textarea id="newDeptDescription" rows="2" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);"></textarea>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Location</label>' +
                '<select id="newDeptLocation" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                locationOptionsHtml +
                '</select>' +
                '<small style="font-size:0.55rem; color:var(--dim);">Selecting a parent location affects all sub-locations</small>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Parent Department</label>' +
                '<select id="newDeptParent" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                deptOptions +
                '</select>' +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                infoIcon + ' Departments can be organized hierarchically. Child departments report to parent departments.' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Create Government Department',
                content: modalContent,
                confirmText: 'Create Department',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var name = document.getElementById('newDeptName').value.trim();
                    if (!name) {
                        _showToast('Department name is required', 'error');
                        return false;
                    }

                    var locationId = document.getElementById('newDeptLocation').value;
                    if (!locationId) {
                        _showToast('Location is required', 'error');
                        return false;
                    }

                    var result = _commands.createDepartment({
                        name: name,
                        description: document.getElementById('newDeptDescription').value || '',
                        locationId: locationId,
                        parentDepartmentId: document.getElementById('newDeptParent').value || null
                    });

                    if (result) {
                        _showToast('Department "' + name + '" created', 'success');
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

            setTimeout(function() {
                var nameInput = document.getElementById('newDeptName');
                if (nameInput) {
                    nameInput.focus();
                }
            }, 100);

        } catch (e) {
            _processingModal = false;
            _showToast('Error opening create department modal', 'error');
        }
    }

    // =========================================================================
    // 6. EDIT DEPARTMENT MODAL
    // =========================================================================

    function openEditGovernmentDepartmentModal(deptId, onSuccess) {
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

            var locationOptionsHtml = _buildLocationDropdown(dept.locationId, 'Select a location', true);

            var departments = _getAllDepartments();
            var deptOptions = '<option value="">None (Top-level)</option>' +
                departments.filter(function(d) { return d.id !== deptId; }).map(function(d) {
                    var selected = d.id === dept.parentDepartmentId ? 'selected' : '';
                    return '<option value="' + d.id + '" ' + selected + '>' + _escapeHtml(d.name) + '</option>';
                }).join('');

            var infoIcon = _getIcon('CIRCLE_DOT');

            var modalContent =
                '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Department Name *</label>' +
                '<input type="text" id="editDeptName" value="' + _escapeHtml(dept.name) + '" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Description</label>' +
                '<textarea id="editDeptDescription" rows="2" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' + _escapeHtml(dept.description || '') + '</textarea>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Location</label>' +
                '<select id="editDeptLocation" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                locationOptionsHtml +
                '</select>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Parent Department</label>' +
                '<select id="editDeptParent" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                deptOptions +
                '</select>' +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                infoIcon + ' Changing the parent department will move this department in the hierarchy.' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Edit Department: ' + dept.name,
                content: modalContent,
                confirmText: 'Save Changes',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var name = document.getElementById('editDeptName').value.trim();
                    if (!name) {
                        _showToast('Department name is required', 'error');
                        return false;
                    }

                    var result = _commands.updateDepartment(deptId, {
                        name: name,
                        description: document.getElementById('editDeptDescription').value || '',
                        locationId: document.getElementById('editDeptLocation').value,
                        parentDepartmentId: document.getElementById('editDeptParent').value || null
                    });

                    if (result) {
                        _showToast('Department updated', 'success');
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
            _showToast('Error opening edit department modal', 'error');
        }
    }

    // =========================================================================
    // 7. DELETE DEPARTMENT MODAL
    // =========================================================================

    function openDeleteGovernmentDepartmentModal(deptId, onSuccess) {
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

            var children = _state.getDepartmentsByParent(deptId);
            var hasChildren = children.length > 0;
            var assignments = _state.getAssignmentsForDepartment(deptId, true);
            var hasAssignments = assignments.length > 0;

            var message = 'Delete department "' + dept.name + '"?';
            if (hasChildren || hasAssignments) {
                var details = [];
                if (hasChildren) details.push(children.length + ' child departments');
                if (hasAssignments) details.push(assignments.length + ' active assignments');
                message = 'This department has ' + details.join(' and ') + '.\n\nDelete them as well?';
            }

            _confirmDialog(message, 'Delete Department', function() {
                var result = _commands.deleteDepartment(deptId, { cascade: true });
                if (result) {
                    _showToast('Department deleted', 'info');
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
            _showToast('Error opening delete department modal', 'error');
        }
    }

    // =========================================================================
    // 8. VIEW DEPARTMENT DETAILS MODAL
    // =========================================================================

    function openViewDepartmentDetailsModal(departmentId) {
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

            var positions = _getPositionsForDepartment(departmentId);
            var assignments = _getAssignmentsForDepartment(departmentId, false);
            var activeAssignments = _getAssignmentsForDepartment(departmentId, true);
            var locationName = dept.locationId ? (_getPlaceById(dept.locationId)?.displayName || 'Unknown') : 'None';
            var parentName = dept.parentDepartmentId ? (_getDepartment(dept.parentDepartmentId)?.name || 'None') : 'None';

            var rolePositions = positions.filter(function(p) { return p.requiredRoleId; }).length;

            var positionHtml = '';
            if (positions.length === 0) {
                positionHtml = '<div style="color: var(--dim); font-size: 0.55rem; text-align: center; padding: 8px;">No positions</div>';
            } else {
                positionHtml = '<div style="display: flex; flex-direction: column; gap: 4px;">';
                for (var i = 0; i < Math.min(positions.length, 10); i++) {
                    var p = positions[i];
                    var posAssignments = _getAssignmentsForPosition(departmentId, p.id, true);
                    var roleName = p.requiredRoleId ? (_getRoleById(p.requiredRoleId)?.name || 'Unknown') : 'None';
                    positionHtml +=
                        '<div style="display: flex; justify-content: space-between; padding: 4px 8px; background: var(--bg2); border-radius: 4px; font-size: 0.55rem; border-left: 3px solid ' + (p.requiredRoleId ? 'var(--accent)' : 'var(--border)') + ';">' +
                        '<span>' + _escapeHtml(p.name) + (p.requiredRoleId ? ' <span style="color: var(--accent);">(Role: ' + _escapeHtml(roleName) + ')</span>' : '') + '</span>' +
                        '<span style="color: var(--dim);">' + posAssignments.length + ' assigned · Priority: ' + (p.priority || 10) + '</span>' +
                        '</div>';
                }
                if (positions.length > 10) {
                    positionHtml += '<div style="font-size: 0.5rem; color: var(--dim); text-align: center;">... and ' + (positions.length - 10) + ' more</div>';
                }
                positionHtml += '</div>';
            }

            var assignmentHtml = '';
            if (assignments.length === 0) {
                assignmentHtml = '<div style="color: var(--dim); font-size: 0.55rem; text-align: center; padding: 8px;">No assignments</div>';
            } else {
                assignmentHtml = '<div style="display: flex; flex-direction: column; gap: 4px;">';
                var displayAssignments = assignments.slice(0, 10);
                for (var i = 0; i < displayAssignments.length; i++) {
                    var a = displayAssignments[i];
                    var isActive = !a.endYear;
                    var char = _getCharacterById(a.characterId);
                    var roleName = a.roleIdAtAssignment ? (_getRoleById(a.roleIdAtAssignment)?.name || 'Unknown') : 'None';
                    assignmentHtml +=
                        '<div style="display: flex; justify-content: space-between; padding: 4px 8px; background: var(--bg2); border-radius: 4px; font-size: 0.55rem; border-left: 3px solid ' + (isActive ? 'var(--success)' : 'var(--dim)') + ';">' +
                        '<span>' + _escapeHtml(a.characterName || (char ? char.name : 'Unknown')) + 
                        (a.title ? ' (' + _escapeHtml(a.title) + ')' : '') +
                        (a.roleIdAtAssignment ? ' <span style="color: var(--accent);">(Role: ' + _escapeHtml(roleName) + ')</span>' : '') +
                        '</span>' +
                        '<span style="color: ' + (isActive ? 'var(--success)' : 'var(--dim)') + ';">' + a.startYear + (a.endYear ? ' - ' + a.endYear : ' - Present') + '</span>' +
                        '</div>';
                }
                if (assignments.length > 10) {
                    assignmentHtml += '<div style="font-size: 0.5rem; color: var(--dim); text-align: center;">... and ' + (assignments.length - 10) + ' more</div>';
                }
                assignmentHtml += '</div>';
            }

            var modalContent =
                '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px;">' +
                '<div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px;">' +
                '<div>' +
                '<div style="font-size: 0.9rem; font-weight: bold;">' + _escapeHtml(dept.name) + '</div>' +
                '<div style="font-size: 0.6rem; color: var(--dim);">' +
                'Location: ' + _escapeHtml(locationName) +
                ' · Parent: ' + _escapeHtml(parentName) +
                '</div>' +
                '</div>' +
                '<div style="font-size: 0.55rem; color: var(--accent); text-align: right;">' +
                '<div>' + positions.length + ' positions (' + rolePositions + ' with role)</div>' +
                '<div>' + activeAssignments.length + ' active · ' + assignments.length + ' total assignments</div>' +
                '</div>' +
                '</div>' +
                (dept.description ? '<div style="font-size: 0.6rem; color: var(--dim); margin-top: 8px;">' + _escapeHtml(dept.description) + '</div>' : '') +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<div style="font-size: 0.65rem; color: var(--accent); margin-bottom: 6px;">Positions</div>' +
                positionHtml +
                '</div>' +
                '<div style="margin-bottom: 12px;">' +
                '<div style="font-size: 0.65rem; color: var(--accent); margin-bottom: 6px;">Assignments</div>' +
                assignmentHtml +
                '</div>' +
                '<div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; border-top: 1px solid var(--border); padding-top: 12px;">' +
                '<button id="deptDetailsEditBtn" class="btn small" style="padding: 4px 12px; font-size: 0.55rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 4px; cursor: pointer;">Edit</button>' +
                '<button id="deptDetailsAddPosBtn" class="btn small" style="padding: 4px 12px; font-size: 0.55rem; background: var(--accent); border: none; color: white; border-radius: 4px; cursor: pointer;">Add Position</button>' +
                '<button id="deptDetailsDeleteBtn" class="btn small danger" style="padding: 4px 12px; font-size: 0.55rem; background: #8a3020; border: none; color: white; border-radius: 4px; cursor: pointer;">Delete</button>' +
                '<button id="deptDetailsCloseBtn" class="btn small" style="padding: 4px 12px; font-size: 0.55rem; background: var(--bg3); border: 1px solid var(--border); border-radius: 4px; cursor: pointer;">Close</button>' +
                '</div>';

            _openModal({
                title: 'Department Details: ' + dept.name,
                content: modalContent,
                confirmText: '',
                cancelText: '',
                onConfirm: function() {
                    _closeTopModal();
                    _processingModal = false;
                }
            });

            setTimeout(function() {
                var editBtn = document.getElementById('deptDetailsEditBtn');
                if (editBtn) {
                    editBtn.onclick = function() {
                        _closeTopModal();
                        _processingModal = false;
                        openEditGovernmentDepartmentModal(deptId, function() {
                            setTimeout(function() {
                                openViewDepartmentDetailsModal(deptId);
                            }, 100);
                        });
                    };
                }

                var addPosBtn = document.getElementById('deptDetailsAddPosBtn');
                if (addPosBtn) {
                    addPosBtn.onclick = function() {
                        _closeTopModal();
                        _processingModal = false;
                        if (typeof window.openAddPositionModal === 'function') {
                            window.openAddPositionModal(deptId, function() {
                                setTimeout(function() {
                                    openViewDepartmentDetailsModal(deptId);
                                }, 100);
                            });
                        } else {
                            _showToast('Add position modal not available', 'error');
                        }
                    };
                }

                var deleteBtn = document.getElementById('deptDetailsDeleteBtn');
                if (deleteBtn) {
                    deleteBtn.onclick = function() {
                        _closeTopModal();
                        _processingModal = false;
                        openDeleteGovernmentDepartmentModal(deptId, function() {
                            _processingModal = false;
                        });
                    };
                }

                var closeBtn = document.getElementById('deptDetailsCloseBtn');
                if (closeBtn) {
                    closeBtn.onclick = function() {
                        _closeTopModal();
                        _processingModal = false;
                    };
                }
            }, 100);

        } catch (e) {
            _processingModal = false;
            _showToast('Error opening department details', 'error');
        }
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.openCreateGovernmentDepartmentModal = openCreateGovernmentDepartmentModal;
    window.openEditGovernmentDepartmentModal = openEditGovernmentDepartmentModal;
    window.openDeleteGovernmentDepartmentModal = openDeleteGovernmentDepartmentModal;
    window.openViewDepartmentDetailsModal = openViewDepartmentDetailsModal;

    // Legacy aliases
    window._openCreateGovernmentDepartmentModal = openCreateGovernmentDepartmentModal;
    window._openEditGovernmentDepartmentModal = openEditGovernmentDepartmentModal;
    window._openDeleteGovernmentDepartmentModal = openDeleteGovernmentDepartmentModal;
    window._openViewDepartmentDetailsModal = openViewDepartmentDetailsModal;

})();