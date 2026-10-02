/**
 * modals-government-positions.js
 * Position CRUD and assignment modals.
 * Reads via GovernmentQueries. Writes via GovernmentCommands.
 */
(function() {
    'use strict';

    var Queries = window.GovernmentQueries;
    var Commands = window.GovernmentCommands;
    var _RoleQueries = window.RoleQueries;

    if (!Queries) throw new Error('modals-government-positions.js requires GovernmentQueries');
    if (!Commands) throw new Error('modals-government-positions.js requires GovernmentCommands');
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
        return i ? '<span style="display:inline-flex;align-items:center;vertical-align:middle;">' + i + '</span>' : '';
    }

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

    function _parseIntStrict(value) {
        var n = Number(value);
        return Number.isInteger(n) ? n : null;
    }

    // ---- Add position --------------------------------------------------------

    function openAddPositionModal(deptId, onSuccess) {
        var dept = Queries.getDepartment(deptId);
        if (!dept) { _toast('Department not found', 'error'); return; }

        var infoIcon = _iconSpan('CIRCLE_DOT');

        var html =
            '<div style="margin-bottom:12px;padding:8px;background:var(--bg2);border-radius:6px;">' +
            '<strong>Department:</strong> ' + _escapeHtml(dept.name) +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Position Name *</label>' +
            '<input type="text" id="newPosName" placeholder="e.g., Minister of Education" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Description</label>' +
            '<input type="text" id="newPosDescription" placeholder="e.g., Head of the department" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Priority (lower = higher rank)</label>' +
            '<input type="number" id="newPosPriority" value="10" min="1" max="100" style="width:80px;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '<small style="font-size:0.55rem;color:var(--dim);">1 = highest, 100 = lowest</small>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Parent Position</label>' +
            '<select id="newPosParent" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            _buildParentPositionOptions(deptId, null, null) + '</select>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Required Role</label>' +
            '<select id="newPosRequiredRole" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            _buildRoleOptions(null, true) + '</select>' +
            '<small style="font-size:0.55rem;color:var(--dim);">Optional: link this position to a role</small>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Minimum Skill Level</label>' +
            '<input type="number" id="newPosMinSkill" value="0" min="0" max="100" style="width:80px;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '<small style="font-size:0.55rem;color:var(--dim);">Only applies if a role is selected</small>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Gender Restriction</label>' +
            '<select id="newPosGender" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '<option value="either">Either Gender</option>' +
            '<option value="male">Male Only</option>' +
            '<option value="female">Female Only</option>' +
            '</select>' +
            '</div>' +
            '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--dim);">' +
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
                    genderRestriction: root.querySelector('#newPosGender').value || 'either'
                });
                if (!result.success) {
                    _toast(result.reason || 'Failed to add position', 'error');
                    return false;
                }
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
            '<div style="margin-bottom:12px;padding:8px;background:var(--bg2);border-radius:6px;">' +
            '<strong>Department:</strong> ' + _escapeHtml(dept.name) +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Position Name *</label>' +
            '<input type="text" id="editPosName" value="' + _attr(position.name) + '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Description</label>' +
            '<input type="text" id="editPosDescription" value="' + _attr(position.description) + '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Priority</label>' +
            '<input type="number" id="editPosPriority" value="' + position.priority + '" min="1" max="100" style="width:80px;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Parent Position</label>' +
            '<select id="editPosParent" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            _buildParentPositionOptions(deptId, positionId, position.parentPositionId) + '</select>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Required Role</label>' +
            '<select id="editPosRequiredRole" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            _buildRoleOptions(position.requiredRoleId, true) + '</select>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Minimum Skill Level</label>' +
            '<input type="number" id="editPosMinSkill" value="' + (position.minSkillLevel != null ? position.minSkillLevel : 0) + '" min="0" max="100" style="width:80px;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Gender Restriction</label>' +
            '<select id="editPosGender" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '<option value="either"' + (position.genderRestriction === 'either' || !position.genderRestriction ? ' selected' : '') + '>Either Gender</option>' +
            '<option value="male"' + (position.genderRestriction === 'male' ? ' selected' : '') + '>Male Only</option>' +
            '<option value="female"' + (position.genderRestriction === 'female' ? ' selected' : '') + '>Female Only</option>' +
            '</select>' +
            '</div>' +
            '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--dim);">' +
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
                    genderRestriction: root.querySelector('#editPosGender').value || 'either'
                });
                if (!result.success) {
                    _toast(result.reason || 'Failed to update position', 'error');
                    return false;
                }
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

        var activeAssignments = position.activeAssignmentCount;

        var message = 'Delete position "' + position.name + '"?';
        if (activeAssignments > 0) {
            message = 'This position has ' + activeAssignments + ' active assignment(s).\n\n' +
                'Deleting it will also remove all assignments. Continue?';
        }

        _confirmDialog(message, 'Delete Position', function() {
            var result = Commands.deletePosition(deptId, positionId);
            if (!result.success) {
                _toast(result.reason || 'Failed to delete position', 'error');
                return;
            }
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

        var assignmentHtml = '';
        if (assignments.length === 0) {
            assignmentHtml = '<div style="color:var(--dim);font-size:0.55rem;text-align:center;padding:8px;">No assignments</div>';
        } else {
            assignmentHtml = '<div style="display:flex;flex-direction:column;gap:4px;">';
            for (var i = 0; i < Math.min(assignments.length, 10); i++) {
                var a = assignments[i];
                var isActive = a.isActive;
                var endLabel = a.endYear != null ? ' - ' + a.endYear : ' - Present';
                assignmentHtml +=
                    '<div style="display:flex;justify-content:space-between;padding:4px 8px;background:var(--bg2);border-radius:4px;font-size:0.55rem;border-left:3px solid ' + (isActive ? 'var(--success)' : 'var(--dim)') + ';">' +
                    '<div>' +
                    '<span>' + _escapeHtml(a.characterName || 'Unknown') + '</span>' +
                    (a.title && a.title !== position.name ? ' <span style="font-size:0.5rem;color:var(--dim);">(' + _escapeHtml(a.title) + ')</span>' : '') +
                    (a.roleIdAtAssignment ? ' <span style="font-size:0.45rem;color:var(--accent);">Role: ' + _escapeHtml(a.roleNameAtAssignment || 'Unknown') + '</span>' : '') +
                    (a.skillLevelAtAssignment != null ? ' <span style="font-size:0.45rem;color:var(--dim);">(Skill: ' + a.skillLevelAtAssignment + ')</span>' : '') +
                    '</div>' +
                    '<span style="color:' + (isActive ? 'var(--success)' : 'var(--dim)') + ';font-size:0.5rem;">' + a.startYear + endLabel + '</span>' +
                    '</div>';
            }
            if (assignments.length > 10) {
                assignmentHtml += '<div style="font-size:0.5rem;color:var(--dim);text-align:center;">... and ' + (assignments.length - 10) + ' more</div>';
            }
            assignmentHtml += '</div>';
        }

        var genderText = position.genderRestriction === 'either' ? 'Either' :
                         position.genderRestriction === 'male' ? 'Male Only' :
                         position.genderRestriction === 'female' ? 'Female Only' : position.genderRestriction;

        var html =
            '<div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;border-left:3px solid ' + (position.requiredRoleId ? 'var(--accent)' : 'var(--border)') + ';">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">' +
            '<div>' +
            '<div style="font-size:0.9rem;font-weight:bold;">' + _escapeHtml(position.name) + '</div>' +
            '<div style="font-size:0.6rem;color:var(--dim);">' +
            'Department: ' + _escapeHtml(dept.name) +
            (position.parentPositionName ? ' · Parent: ' + _escapeHtml(position.parentPositionName) : '') +
            '</div>' +
            '<div style="font-size:0.6rem;color:var(--accent);">' +
            'Required Role: ' + _escapeHtml(position.requiredRoleName || 'None') +
            (position.minSkillLevel != null && position.minSkillLevel > 0 ? ' · Min Skill: ' + position.minSkillLevel : '') +
            ' · Gender: ' + _escapeHtml(genderText) +
            '</div>' +
            '</div>' +
            '<div style="font-size:0.55rem;color:var(--accent);text-align:right;">' +
            '<div>Priority: ' + position.priority + '</div>' +
            '<div>' + position.activeAssignmentCount + ' active · ' + position.assignmentCount + ' total</div>' +
            '</div>' +
            '</div>' +
            (position.description ? '<div style="font-size:0.6rem;color:var(--dim);margin-top:8px;">' + _escapeHtml(position.description) + '</div>' : '') +
            '</div>' +
            '<div style="margin-bottom:12px;">' +
            '<div style="font-size:0.65rem;color:var(--accent);margin-bottom:6px;">Assignments (' + assignments.length + ')</div>' +
            assignmentHtml +
            '</div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;border-top:1px solid var(--border);padding-top:12px;">' +
            '<button type="button" id="posDetailsEditBtn" class="btn small" style="padding:4px 12px;font-size:0.55rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:4px;cursor:pointer;">Edit</button>' +
            '<button type="button" id="posDetailsAssignBtn" class="btn small" style="padding:4px 12px;font-size:0.55rem;background:var(--accent);border:none;color:white;border-radius:4px;cursor:pointer;">Assign Character</button>' +
            '<button type="button" id="posDetailsDeleteBtn" class="btn small danger" style="padding:4px 12px;font-size:0.55rem;background:#8a3020;border:none;color:white;border-radius:4px;cursor:pointer;">Delete</button>' +
            '<button type="button" id="posDetailsCloseBtn" class="btn small" style="padding:4px 12px;font-size:0.55rem;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">Close</button>' +
            '</div>';

        _openModal({
            title: 'Position Details: ' + position.name,
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
                // The Command is authoritative. UI does not pre-check
                // qualification, existing assignments, or age.
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
