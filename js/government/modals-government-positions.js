/**
 * modals-government-positions.js
 * Position CRUD and assign-character modals.
 * Reads via GovernmentQueries + GovernmentViewModels.
 * Writes via GovernmentCommands. Persist once per successful batch.
 *
 * Salary payment after assignment is a separate command and lives in the
 * economy modal / assignment flow that needs it. This module does not pay.
 */
(function() {
    'use strict';

    var C = window.GovernmentConstants;
    var Queries = window.GovernmentQueries;
    var Commands = window.GovernmentCommands;
    var VM = window.GovernmentViewModels;
    var _RoleQueries = window.RoleQueries;

    if (!C) throw new Error('modals-government-positions.js requires GovernmentConstants');
    if (!Queries) throw new Error('modals-government-positions.js requires GovernmentQueries');
    if (!Commands) throw new Error('modals-government-positions.js requires GovernmentCommands');
    if (!VM) throw new Error('modals-government-positions.js requires GovernmentViewModels');
    if (!_RoleQueries) throw new Error('modals-government-positions.js requires RoleQueries');

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (!str && str !== 0) return '';
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function _attr(s) { return _escapeHtml(s); }

    function _toast(msg, type) {
        var plain = typeof msg === 'string' ? msg.replace(/<[^>]*>/g, '') : msg;
        if (typeof window._showToast === 'function') window._showToast(plain, type);
        else if (typeof window.showToast === 'function') window.showToast(plain, type);
        else if (typeof window.showToastMessage === 'function') window.showToastMessage(plain, type);
    }
    function _openModal(opts) {
        if (typeof window.openModal !== 'function') throw new Error('openModal not available');
        return window.openModal(opts);
    }
    function _closeTopModal() {
        if (typeof window.closeTopModal === 'function') window.closeTopModal();
    }
    function _confirmDialog(message, title, onConfirm, onCancel) {
        if (typeof window.confirmDialog === 'function') {
            return window.confirmDialog(message, title, onConfirm, onCancel);
        }
        throw new Error('modals-government-positions.js requires confirmDialog');
    }
    function _openCharacterSelector(options) {
        if (typeof window.openCharacterSelector === 'function') {
            return window.openCharacterSelector(options);
        }
        if (typeof window.openUnifiedCharacterSelector === 'function') {
            return window.openUnifiedCharacterSelector(options);
        }
        throw new Error('modals-government-positions.js requires a character selector');
    }
    function _getIcon(name) {
        if (typeof window._getIcon === 'function') return window._getIcon(name);
        return window.Icons && window.Icons[name] ? window.Icons[name] : '';
    }
    function _iconSpan(name) {
        var i = _getIcon(name);
        return i ? '<span class="gov-inline-1">' + i + '</span>' : '';
    }

    function _commitAndPersist() {
        var p = Commands.persist();
        if (!p.success) {
            _toast('Saved in memory, but persisting failed: ' + (p.reason || 'unknown'), 'warning');
        }
    }

    function _parseIntStrict(value) {
        var n = Number(value);
        return Number.isInteger(n) ? n : null;
    }

    // ---- Option builders (UI-only, not domain data) --------------------------

    function _buildRoleOptions(selectedRoleId, includeNone) {
        var roles = _RoleQueries.getAllRoleSummaries ? _RoleQueries.getAllRoleSummaries() : [];
        var html = includeNone ? '<option value="">No role required</option>' : '';
        for (var i = 0; i < roles.length; i++) {
            var r = roles[i];
            var sel = r.id === selectedRoleId ? 'selected' : '';
            var icon = r.icon || '';
            html += '<option value="' + _attr(r.id) + '" ' + sel + '>' +
                (icon ? _escapeHtml(icon) + ' ' : '') + _escapeHtml(r.name) +
                (r.category ? ' (' + _escapeHtml(r.category) + ')' : '') +
                '</option>';
        }
        return html;
    }

    function _buildParentPositionOptions(departmentId, excludePositionId, selectedParentId) {
        var positions = Queries.getPositionsForDepartment(departmentId, {});
        var html = '<option value="">None (Top-level)</option>';
        for (var i = 0; i < positions.length; i++) {
            if (positions[i].id === excludePositionId) continue;
            var sel = positions[i].id === selectedParentId ? 'selected' : '';
            html += '<option value="' + _attr(positions[i].id) + '" ' + sel + '>' +
                _escapeHtml(positions[i].name) + ' (priority ' + positions[i].priority + ')</option>';
        }
        return html;
    }

    // ---- Add position --------------------------------------------------------

    function openAddPositionModal(deptId, onSuccess) {
        var dept = Queries.getDepartment(deptId);
        if (!dept) { _toast('Department not found', 'error'); return; }

        var infoIcon = _iconSpan('CIRCLE_DOT');

        var html =
            '<div class="gov-inline-11">' +
            '<strong>Department:</strong> ' + _escapeHtml(dept.name) +
            '</div>' +
            '<div class="form-group" class="gov-inline-3">' +
            '<label class="gov-inline-4">Position Name *</label>' +
            '<input type="text" id="newPosName" placeholder="e.g., Minister of Education" class="gov-inline-5">' +
            '</div>' +
            '<div class="form-group" class="gov-inline-3">' +
            '<label class="gov-inline-4">Description</label>' +
            '<input type="text" id="newPosDescription" placeholder="e.g., Head of the department" class="gov-inline-5">' +
            '</div>' +
            '<div class="form-group" class="gov-inline-3">' +
            '<label class="gov-inline-4">Priority (lower = higher rank)</label>' +
            '<input type="number" id="newPosPriority" value="' + C.DEFAULT_POSITION_PRIORITY + '" min="' + C.MIN_POSITION_PRIORITY + '" max="' + C.MAX_POSITION_PRIORITY + '" class="gov-inline-78">' +
            '<small class="gov-inline-6">' + C.MIN_POSITION_PRIORITY + ' = highest, ' + C.MAX_POSITION_PRIORITY + ' = lowest</small>' +
            '</div>' +
            '<div class="form-group" class="gov-inline-3">' +
            '<label class="gov-inline-4">Parent Position</label>' +
            '<select id="newPosParent" class="gov-inline-5">' +
            _buildParentPositionOptions(deptId, null, null) + '</select>' +
            '</div>' +
            '<div class="form-group" class="gov-inline-3">' +
            '<label class="gov-inline-4">Required Role</label>' +
            '<select id="newPosRequiredRole" class="gov-inline-5">' +
            _buildRoleOptions(null, true) + '</select>' +
            '<small class="gov-inline-6">Optional: link this position to a role</small>' +
            '</div>' +
            '<div class="form-group" class="gov-inline-3">' +
            '<label class="gov-inline-4">Minimum Skill Level</label>' +
            '<input type="number" id="newPosMinSkill" value="' + C.DEFAULT_MIN_SKILL_LEVEL + '" min="' + C.MIN_SKILL_LEVEL + '" max="' + C.MAX_SKILL_LEVEL + '" class="gov-inline-78">' +
            '<small class="gov-inline-6">Only applies if a role is selected</small>' +
            '</div>' +
            '<div class="form-group" class="gov-inline-3">' +
            '<label class="gov-inline-4">Gender Restriction</label>' +
            '<select id="newPosGender" class="gov-inline-5">' +
            '<option value="' + C.GENDER_EITHER + '">Either Gender</option>' +
            '<option value="' + C.GENDER_MALE + '">Male Only</option>' +
            '<option value="' + C.GENDER_FEMALE + '">Female Only</option>' +
            '</select>' +
            '</div>' +
            '<div class="gov-inline-8">' +
            infoIcon + ' Positions define specific roles within a department.' +
            '</div>';

        _openModal({
            title: 'Add Position to ' + dept.name,
            content: html,
            confirmText: 'Add Position',
            cancelText: 'Cancel',
            onMount: function(root) {
                var el = root.querySelector('#newPosName');
                if (el) el.focus();
            },
            onConfirm: function(root) {
                var name = root.querySelector('#newPosName').value.trim();
                if (!name) { _toast('Position name is required', 'error'); return false; }

                var priority = _parseIntStrict(root.querySelector('#newPosPriority').value);
                if (priority == null) { _toast('Priority must be an integer', 'error'); return false; }

                var minSkill = _parseIntStrict(root.querySelector('#newPosMinSkill').value);
                if (minSkill == null) { _toast('Minimum skill level must be an integer', 'error'); return false; }

                var result = Commands.addPosition(deptId, {
                    name: name,
                    description: root.querySelector('#newPosDescription').value || '',
                    priority: priority,
                    parentPositionId: root.querySelector('#newPosParent').value || null,
                    requiredRoleId: root.querySelector('#newPosRequiredRole').value || null,
                    minSkillLevel: minSkill,
                    genderRestriction: root.querySelector('#newPosGender').value || C.GENDER_EITHER
                });
                if (!result.success) {
                    _toast(result.reason || 'Failed to add position', 'error');
                    return false;
                }
                _commitAndPersist();
                _closeTopModal();
                _toast('Position "' + name + '" added', 'success');
                if (onSuccess) onSuccess(result.data);
                return true;
            }
        });
    }

    // ---- Edit position -------------------------------------------------------

    function openEditPositionModal(deptId, positionId, onSuccess) {
        var dept = Queries.getDepartment(deptId);
        if (!dept) { _toast('Department not found', 'error'); return; }

        var position = Queries.getPosition(deptId, positionId);
        if (!position) { _toast('Position not found', 'error'); return; }

        var infoIcon = _iconSpan('CIRCLE_DOT');

        var html =
            '<div class="gov-inline-11">' +
            '<strong>Department:</strong> ' + _escapeHtml(dept.name) +
            '</div>' +
            '<div class="form-group" class="gov-inline-3">' +
            '<label class="gov-inline-4">Position Name *</label>' +
            '<input type="text" id="editPosName" value="' + _attr(position.name) + '" class="gov-inline-5">' +
            '</div>' +
            '<div class="form-group" class="gov-inline-3">' +
            '<label class="gov-inline-4">Description</label>' +
            '<input type="text" id="editPosDescription" value="' + _attr(position.description) + '" class="gov-inline-5">' +
            '</div>' +
            '<div class="form-group" class="gov-inline-3">' +
            '<label class="gov-inline-4">Priority</label>' +
            '<input type="number" id="editPosPriority" value="' + position.priority + '" min="' + C.MIN_POSITION_PRIORITY + '" max="' + C.MAX_POSITION_PRIORITY + '" class="gov-inline-78">' +
            '</div>' +
            '<div class="form-group" class="gov-inline-3">' +
            '<label class="gov-inline-4">Parent Position</label>' +
            '<select id="editPosParent" class="gov-inline-5">' +
            _buildParentPositionOptions(deptId, positionId, position.parentPositionId) + '</select>' +
            '</div>' +
            '<div class="form-group" class="gov-inline-3">' +
            '<label class="gov-inline-4">Required Role</label>' +
            '<select id="editPosRequiredRole" class="gov-inline-5">' +
            _buildRoleOptions(position.requiredRoleId, true) + '</select>' +
            '</div>' +
            '<div class="form-group" class="gov-inline-3">' +
            '<label class="gov-inline-4">Minimum Skill Level</label>' +
            '<input type="number" id="editPosMinSkill" value="' + (position.minSkillLevel != null ? position.minSkillLevel : C.DEFAULT_MIN_SKILL_LEVEL) + '" min="' + C.MIN_SKILL_LEVEL + '" max="' + C.MAX_SKILL_LEVEL + '" class="gov-inline-78">' +
            '</div>' +
            '<div class="form-group" class="gov-inline-3">' +
            '<label class="gov-inline-4">Gender Restriction</label>' +
            '<select id="editPosGender" class="gov-inline-5">' +
            '<option value="' + C.GENDER_EITHER + '"' + (position.genderRestriction === C.GENDER_EITHER || !position.genderRestriction ? ' selected' : '') + '>Either Gender</option>' +
            '<option value="' + C.GENDER_MALE + '"' + (position.genderRestriction === C.GENDER_MALE ? ' selected' : '') + '>Male Only</option>' +
            '<option value="' + C.GENDER_FEMALE + '"' + (position.genderRestriction === C.GENDER_FEMALE ? ' selected' : '') + '>Female Only</option>' +
            '</select>' +
            '</div>' +
            '<div class="gov-inline-8">' +
            infoIcon + ' Updating the required role affects future assignments.' +
            '</div>';

        _openModal({
            title: 'Edit Position: ' + position.name,
            content: html,
            confirmText: 'Save Changes',
            cancelText: 'Cancel',
            onConfirm: function(root) {
                var name = root.querySelector('#editPosName').value.trim();
                if (!name) { _toast('Position name is required', 'error'); return false; }

                var priority = _parseIntStrict(root.querySelector('#editPosPriority').value);
                if (priority == null) { _toast('Priority must be an integer', 'error'); return false; }

                var minSkill = _parseIntStrict(root.querySelector('#editPosMinSkill').value);
                if (minSkill == null) { _toast('Minimum skill level must be an integer', 'error'); return false; }

                var result = Commands.updatePosition(deptId, positionId, {
                    name: name,
                    description: root.querySelector('#editPosDescription').value || '',
                    priority: priority,
                    parentPositionId: root.querySelector('#editPosParent').value || null,
                    requiredRoleId: root.querySelector('#editPosRequiredRole').value || null,
                    minSkillLevel: minSkill,
                    genderRestriction: root.querySelector('#editPosGender').value || C.GENDER_EITHER
                });
                if (!result.success) {
                    _toast(result.reason || 'Failed to update position', 'error');
                    return false;
                }
                _commitAndPersist();
                _closeTopModal();
                _toast('Position updated', 'success');
                if (onSuccess) onSuccess(result.data);
                return true;
            }
        });
    }

    // ---- Delete position -----------------------------------------------------

    function openDeletePositionModal(deptId, positionId, onSuccess) {
        var dept = Queries.getDepartment(deptId);
        if (!dept) { _toast('Department not found', 'error'); return; }

        var position = Queries.getPosition(deptId, positionId);
        if (!position) { _toast('Position not found', 'error'); return; }

        if (position.assignmentCount > 0) {
            _toast(
                'This position has ' + position.assignmentCount +
                ' assignment record(s). It cannot be deleted because assignment history must be preserved.',
                'error'
            );
            return;
        }

        var message = 'Delete position "' + position.name + '"?';

        _confirmDialog(message, 'Delete Position', function() {
            var result = Commands.deletePosition(deptId, positionId);
            if (!result.success) {
                _toast(result.reason || 'Failed to delete position', 'error');
                return;
            }
            _commitAndPersist();
            _toast('Position deleted', 'info');
            if (onSuccess) onSuccess(result.data);
        });
    }

    // ---- View details --------------------------------------------------------

    function openViewPositionDetailsModal(deptId, positionId) {
        var dept = Queries.getDepartment(deptId);
        if (!dept) { _toast('Department not found', 'error'); return; }

        var position = Queries.getPosition(deptId, positionId);
        if (!position) { _toast('Position not found', 'error'); return; }

        var assignments = Queries.getAssignmentsForPosition(deptId, positionId, {});
        var vm = VM.toPositionDetailsViewModel(
            Object.assign({}, position, { departmentName: dept.name }),
            assignments,
            10
        );
        if (!vm) { _toast('Position details unavailable', 'error'); return; }

        var assignmentHtml;
        if (vm.assignments.length === 0) {
            assignmentHtml = '<div class="gov-inline-40">No assignments</div>';
        } else {
            assignmentHtml = '<div class="gov-inline-41">';
            for (var i = 0; i < vm.assignments.length; i++) {
                var a = vm.assignments[i];
                assignmentHtml +=
                    '<div class="gov-history-row ' + (a.isActive ? 'gov-border-success' : 'gov-border-muted') + '">' +
                    '<div>' +
                    '<span>' + _escapeHtml(a.characterName) + '</span>' +
                    (a.title ? ' <span class="gov-inline-20">(' + _escapeHtml(a.title) + ')</span>' : '') +
                    (a.roleLabel ? ' <span class="gov-inline-79">Role: ' + _escapeHtml(a.roleLabel) + '</span>' : '') +
                    (a.skillLevel != null ? ' <span class="gov-inline-80">(Skill: ' + a.skillLevel + ')</span>' : '') +
                    '</div>' +
                    '<span class="gov-status-text gov-status-small ' + (a.isActive ? 'gov-status-active' : 'gov-status-inactive') + '">' + a.startYear + ' - ' + a.endLabel + '</span>' +
                    '</div>';
            }
            if (vm.assignmentsOverflow > 0) {
                assignmentHtml += '<div class="gov-inline-43">... and ' + vm.assignmentsOverflow + ' more</div>';
            }
            assignmentHtml += '</div>';
        }

        var html =
            '<div class="gov-position-summary ' + (vm.requiredRoleLabel !== 'None' ? 'gov-border-accent' : 'gov-border-neutral') + '">' +
            '<div class="gov-inline-45">' +
            '<div>' +
            '<div class="gov-inline-46">' + _escapeHtml(vm.name) + '</div>' +
            '<div class="gov-inline-47">' +
            'Department: ' + _escapeHtml(vm.departmentName || '') +
            (vm.parentLabel ? ' · Parent: ' + _escapeHtml(vm.parentLabel) : '') +
            '</div>' +
            '<div class="gov-inline-81">' +
            'Required Role: ' + _escapeHtml(vm.requiredRoleLabel) +
            (vm.minSkillLevel != null && vm.minSkillLevel > 0 ? ' · Min Skill: ' + vm.minSkillLevel : '') +
            ' · Gender: ' + _escapeHtml(vm.genderLabel) +
            '</div>' +
            '</div>' +
            '<div class="gov-inline-48">' +
            '<div>Priority: ' + vm.priority + '</div>' +
            '<div>' + vm.activeAssignmentCount + ' active · ' + vm.assignmentCount + ' total</div>' +
            '</div>' +
            '</div>' +
            (vm.description ? '<div class="gov-inline-49">' + _escapeHtml(vm.description) + '</div>' : '') +
            '</div>' +
            '<div class="gov-inline-3">' +
            '<div class="gov-inline-50">Assignments (' + vm.totalAssignments + ')</div>' +
            assignmentHtml +
            '</div>' +
            '<div class="gov-inline-51">' +
            '<button type="button" id="posDetailsEditBtn" class="btn small" class="gov-inline-52">Edit</button>' +
            '<button type="button" id="posDetailsAssignBtn" class="btn small" class="gov-inline-53">Assign Character</button>' +
            '<button type="button" id="posDetailsDeleteBtn" class="btn small danger" class="gov-inline-54">Delete</button>' +
            '<button type="button" id="posDetailsCloseBtn" class="btn small" class="gov-inline-15">Close</button>' +
            '</div>';

        _openModal({
            title: 'Position Details: ' + vm.name,
            content: html,
            confirmText: '',
            cancelText: '',
            onMount: function(root) {
                var editBtn = root.querySelector('#posDetailsEditBtn');
                if (editBtn) editBtn.addEventListener('click', function() {
                    _closeTopModal();
                    openEditPositionModal(deptId, positionId, function() {
                        openViewPositionDetailsModal(deptId, positionId);
                    });
                });

                var assignBtn = root.querySelector('#posDetailsAssignBtn');
                if (assignBtn) assignBtn.addEventListener('click', function() {
                    _closeTopModal();
                    openAssignCharacterToPositionModal(deptId, positionId, function() {
                        openViewPositionDetailsModal(deptId, positionId);
                    });
                });

                var deleteBtn = root.querySelector('#posDetailsDeleteBtn');
                if (deleteBtn) deleteBtn.addEventListener('click', function() {
                    _closeTopModal();
                    openDeletePositionModal(deptId, positionId, function() {
                        // Modal already closed.
                    });
                });

                var closeBtn = root.querySelector('#posDetailsCloseBtn');
                if (closeBtn) closeBtn.addEventListener('click', function() {
                    _closeTopModal();
                });
            },
            onConfirm: function() {
                _closeTopModal();
            }
        });
    }

    // ---- Assign character ----------------------------------------------------

    function openAssignCharacterToPositionModal(departmentId, positionId, onSuccess) {
        var dept = Queries.getDepartment(departmentId);
        if (!dept) { _toast('Department not found', 'error'); return; }

        var position = Queries.getPosition(departmentId, positionId);
        if (!position) { _toast('Position not found', 'error'); return; }

        _openCharacterSelector({
            title: 'Assign to: ' + position.name,
            filters: {
                status: 'all',
                showDeceased: false
            },
            onSelect: function(character) {
                var result = Commands.assignCharacterToPosition(
                    departmentId,
                    positionId,
                    character.id,
                    { title: position.name, addRoleIfMissing: true }
                );

                if (!result.success) {
                    _toast(result.reason || 'Failed to assign character', 'error');
                    return;
                }

                _commitAndPersist();
                _toast(character.name + ' assigned to ' + position.name, 'success');
                if (onSuccess) onSuccess(result.data);
            }
        });
    }

    // ---- Export --------------------------------------------------------------

    window.openAddPositionModal = openAddPositionModal;
    window.openEditPositionModal = openEditPositionModal;
    window.openDeletePositionModal = openDeletePositionModal;
    window.openViewPositionDetailsModal = openViewPositionDetailsModal;
    window.openAssignCharacterToPositionModal = openAssignCharacterToPositionModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openAddPositionModal: openAddPositionModal,
            openEditPositionModal: openEditPositionModal,
            openDeletePositionModal: openDeletePositionModal,
            openViewPositionDetailsModal: openViewPositionDetailsModal,
            openAssignCharacterToPositionModal: openAssignCharacterToPositionModal
        };
    }
})();
