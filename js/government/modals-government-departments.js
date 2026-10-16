/**
 * modals-government-departments.js
 * Department create/edit/delete/details modals.
 * Reads via GovernmentQueries + GovernmentViewModels.
 * Writes via GovernmentCommands. Persist once per successful batch.
 */
(function() {
    'use strict';

    var Queries = window.GovernmentQueries;
    var Commands = window.GovernmentCommands;
    var VM = window.GovernmentViewModels;
    var _LocationQueries = window.LocationQueries;

    if (!Queries) throw new Error('modals-government-departments.js requires GovernmentQueries');
    if (!Commands) throw new Error('modals-government-departments.js requires GovernmentCommands');
    if (!VM) throw new Error('modals-government-departments.js requires GovernmentViewModels');
    if (!_LocationQueries) throw new Error('modals-government-departments.js requires LocationQueries');

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
        throw new Error('modals-government-departments.js requires confirmDialog');
    }
    function _getIcon(name) {
        if (typeof window._getIcon === 'function') return window._getIcon(name);
        return window.Icons && window.Icons[name] ? window.Icons[name] : '';
    }
    function _iconSpan(name) {
        var i = _getIcon(name);
        return i ? '<span style="display:inline-flex;align-items:center;vertical-align:middle;">' + i + '</span>' : '';
    }

    function _commitAndPersist() {
        var p = Commands.persist();
        if (!p.success) {
            _toast('Saved in memory, but persisting failed: ' + (p.reason || 'unknown'), 'warning');
        }
    }

    function _buildLocationOptions(selectedId, placeholder, includeAll) {
        if (typeof window.buildLocationDropdown === 'function') {
            return window.buildLocationDropdown(selectedId, placeholder, includeAll);
        }
        var places = _LocationQueries.getPlaceSummaries ? _LocationQueries.getPlaceSummaries() : [];
        var html = '';
        if (placeholder) html += '<option value="">' + _escapeHtml(placeholder) + '</option>';
        if (includeAll) html += '<option value="all">All Locations</option>';
        for (var i = 0; i < places.length; i++) {
            var p = places[i];
            var sel = selectedId === p.id ? 'selected' : '';
            html += '<option value="' + _attr(p.id) + '" ' + sel + '>' + _escapeHtml(p.displayName) + '</option>';
        }
        html += '<option value="unknown"' + (selectedId === 'unknown' ? ' selected' : '') + '>Unknown Location</option>';
        return html;
    }

    function _buildParentDeptOptions(departments, selectedId, excludeId) {
        var html = '<option value="">None (Top-level)</option>';
        for (var i = 0; i < departments.length; i++) {
            var d = departments[i];
            if (excludeId && d.id === excludeId) continue;
            var sel = d.id === selectedId ? 'selected' : '';
            html += '<option value="' + _attr(d.id) + '" ' + sel + '>' + _escapeHtml(d.name) + '</option>';
        }
        return html;
    }

    // ---- Create --------------------------------------------------------------

    function openCreateGovernmentDepartmentModal(locationId, onSuccess) {
        var locationOptions = _buildLocationOptions(locationId, 'Select a location', true);
        var depts = Queries.getDepartments({});
        var deptOptions = _buildParentDeptOptions(depts, null, null);

        var infoIcon = _iconSpan('CIRCLE_DOT');

        var html =
            '<div style="max-height:500px;overflow-y:auto;padding:4px;">' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Department Name *</label>' +
            '<input type="text" id="newDeptName" placeholder="e.g., Ministry of Education" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Description</label>' +
            '<textarea id="newDeptDescription" rows="2" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);"></textarea>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Location</label>' +
            '<select id="newDeptLocation" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            locationOptions + '</select>' +
            '<small style="font-size:0.55rem;color:var(--dim);">Selecting a parent location affects all sub-locations</small>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Parent Department</label>' +
            '<select id="newDeptParent" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            deptOptions + '</select>' +
            '</div>' +
            '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--dim);">' +
            infoIcon + ' Departments can be organized hierarchically. Child departments report to parent departments.' +
            '</div>' +
            '</div>';

        _openModal({
            title: 'Create Government Department',
            content: html,
            confirmText: 'Create Department',
            cancelText: 'Cancel',
            onMount: function(root) {
                var el = root.querySelector('#newDeptName');
                if (el) el.focus();
            },
            onConfirm: function(root) {
                var name = root.querySelector('#newDeptName').value.trim();
                if (!name) { _toast('Department name is required', 'error'); return false; }

                var locId = root.querySelector('#newDeptLocation').value;
                if (!locId) { _toast('Location is required', 'error'); return false; }

                var parentId = root.querySelector('#newDeptParent').value || null;

                var result = Commands.createDepartment({
                    name: name,
                    description: root.querySelector('#newDeptDescription').value || '',
                    locationId: locId,
                    parentDepartmentId: parentId
                });
                if (!result.success) {
                    _toast(result.reason || 'Failed to create department', 'error');
                    return false;
                }
                _commitAndPersist();
                _closeTopModal();
                _toast('Department "' + name + '" created', 'success');
                if (onSuccess) onSuccess(result.data);
                return true;
            }
        });
    }

    // ---- Edit ----------------------------------------------------------------

    function openEditGovernmentDepartmentModal(deptId, onSuccess) {
        var dept = Queries.getDepartment(deptId);
        if (!dept) { _toast('Department not found', 'error'); return; }

        var locationOptions = _buildLocationOptions(dept.locationId, 'Select a location', true);
        var allDepts = Queries.getDepartments({});
        var deptOptions = _buildParentDeptOptions(allDepts, dept.parentDepartmentId, deptId);

        var infoIcon = _iconSpan('CIRCLE_DOT');

        var html =
            '<div style="max-height:500px;overflow-y:auto;padding:4px;">' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Department Name *</label>' +
            '<input type="text" id="editDeptName" value="' + _attr(dept.name) + '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Description</label>' +
            '<textarea id="editDeptDescription" rows="2" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' + _escapeHtml(dept.description) + '</textarea>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Location</label>' +
            '<select id="editDeptLocation" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            locationOptions + '</select>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Parent Department</label>' +
            '<select id="editDeptParent" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            deptOptions + '</select>' +
            '</div>' +
            '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--dim);">' +
            infoIcon + ' Changing the parent department will move this department in the hierarchy.' +
            '</div>' +
            '</div>';

        _openModal({
            title: 'Edit Department: ' + dept.name,
            content: html,
            confirmText: 'Save Changes',
            cancelText: 'Cancel',
            onConfirm: function(root) {
                var name = root.querySelector('#editDeptName').value.trim();
                if (!name) { _toast('Department name is required', 'error'); return false; }

                var result = Commands.updateDepartment(deptId, {
                    name: name,
                    description: root.querySelector('#editDeptDescription').value || '',
                    locationId: root.querySelector('#editDeptLocation').value,
                    parentDepartmentId: root.querySelector('#editDeptParent').value || null
                });
                if (!result.success) {
                    _toast(result.reason || 'Failed to update department', 'error');
                    return false;
                }
                _commitAndPersist();
                _closeTopModal();
                _toast('Department updated', 'success');
                if (onSuccess) onSuccess(result.data);
                return true;
            }
        });
    }

    // ---- Delete --------------------------------------------------------------

    function openDeleteGovernmentDepartmentModal(deptId, onSuccess) {
        var dept = Queries.getDepartment(deptId);
        if (!dept) { _toast('Department not found', 'error'); return; }

        var impact = Queries.getDepartmentDeletionImpact(deptId);
        if (!impact) { _toast('Department not found', 'error'); return; }

        var vm = VM.toDeleteImpactViewModel(impact, dept.name);
        var message;
        if (vm.requiresCascade) {
            message = 'This department has ' + vm.detailLines.join(' and ') + '. Delete them as well?';
        } else {
            message = 'Delete department "' + dept.name + '"?';
        }

        _confirmDialog(message, 'Delete Department', function() {
            var result = Commands.deleteDepartment(deptId, { cascade: true });
            if (!result.success) {
                _toast(result.reason || 'Failed to delete department', 'error');
                return;
            }
            _commitAndPersist();
            _toast('Department deleted', 'info');
            if (onSuccess) onSuccess(result.data);
        });
    }

    // ---- Details -------------------------------------------------------------

    function openViewDepartmentDetailsModal(departmentId) {
        var details = Queries.getDepartmentDetails(departmentId);
        if (!details) { _toast('Department not found', 'error'); return; }

        var vm = VM.toDepartmentDetailsViewModel(details, 10);
        if (!vm) { _toast('Department details unavailable', 'error'); return; }

        var infoIcon = _iconSpan('CIRCLE_DOT');

        var positionsHtml;
        if (vm.positions.length === 0) {
            positionsHtml = '<div style="color:var(--dim);font-size:0.55rem;text-align:center;padding:8px;">No positions</div>';
        } else {
            positionsHtml = '<div style="display:flex;flex-direction:column;gap:4px;">';
            for (var i = 0; i < vm.positions.length; i++) {
                var p = vm.positions[i];
                positionsHtml +=
                    '<div style="display:flex;justify-content:space-between;padding:4px 8px;background:var(--bg2);border-radius:4px;font-size:0.55rem;border-left:3px solid ' + (p.isRoleBound ? 'var(--accent)' : 'var(--border)') + ';">' +
                    '<span>' + _escapeHtml(p.name) +
                    (p.isRoleBound ? ' <span style="color:var(--accent);">(Role: ' + _escapeHtml(p.requiredRoleLabel || '') + ')</span>' : '') +
                    '</span>' +
                    '<span style="color:var(--dim);">' + p.activeAssignmentCount + ' assigned · Priority: ' + p.priority + '</span>' +
                    '</div>';
            }
            if (vm.positionsOverflow > 0) {
                positionsHtml += '<div style="font-size:0.5rem;color:var(--dim);text-align:center;">... and ' + vm.positionsOverflow + ' more</div>';
            }
            positionsHtml += '</div>';
        }

        var assignmentsHtml;
        if (vm.assignments.length === 0) {
            assignmentsHtml = '<div style="color:var(--dim);font-size:0.55rem;text-align:center;padding:8px;">No assignments</div>';
        } else {
            assignmentsHtml = '<div style="display:flex;flex-direction:column;gap:4px;">';
            for (var j = 0; j < vm.assignments.length; j++) {
                var a = vm.assignments[j];
                assignmentsHtml +=
                    '<div style="display:flex;justify-content:space-between;padding:4px 8px;background:var(--bg2);border-radius:4px;font-size:0.55rem;border-left:3px solid ' + (a.isActive ? 'var(--success)' : 'var(--dim)') + ';">' +
                    '<span>' + _escapeHtml(a.characterName) +
                    (a.title ? ' (' + _escapeHtml(a.title) + ')' : '') +
                    (a.roleLabel ? ' <span style="color:var(--accent);">(Role: ' + _escapeHtml(a.roleLabel) + ')</span>' : '') +
                    '</span>' +
                    '<span style="color:' + (a.isActive ? 'var(--success)' : 'var(--dim)') + ';">' + a.startYear + ' - ' + a.endLabel + '</span>' +
                    '</div>';
            }
            if (vm.assignmentsOverflow > 0) {
                assignmentsHtml += '<div style="font-size:0.5rem;color:var(--dim);text-align:center;">... and ' + vm.assignmentsOverflow + ' more</div>';
            }
            assignmentsHtml += '</div>';
        }

        var html =
            '<div style="margin-bottom:16px;padding:12px;background:var(--bg2);border-radius:8px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">' +
            '<div>' +
            '<div style="font-size:0.9rem;font-weight:bold;">' + _escapeHtml(vm.name) + '</div>' +
            '<div style="font-size:0.6rem;color:var(--dim);">' +
            'Location: ' + _escapeHtml(vm.locationLabel) +
            ' · Parent: ' + _escapeHtml(vm.parentLabel) +
            '</div>' +
            '</div>' +
            '<div style="font-size:0.55rem;color:var(--accent);text-align:right;">' +
            '<div>' + vm.stats.positionCount + ' positions (' + vm.stats.rolePositionCount + ' with role)</div>' +
            '<div>' + vm.stats.activeAssignmentCount + ' active · ' + vm.stats.assignmentCount + ' total</div>' +
            '</div>' +
            '</div>' +
            (vm.description ? '<div style="font-size:0.6rem;color:var(--dim);margin-top:8px;">' + _escapeHtml(vm.description) + '</div>' : '') +
            '</div>' +
            '<div style="margin-bottom:12px;">' +
            '<div style="font-size:0.65rem;color:var(--accent);margin-bottom:6px;">Positions</div>' +
            positionsHtml +
            '</div>' +
            '<div style="margin-bottom:12px;">' +
            '<div style="font-size:0.65rem;color:var(--accent);margin-bottom:6px;">Assignments</div>' +
            assignmentsHtml +
            '</div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;border-top:1px solid var(--border);padding-top:12px;">' +
            '<button type="button" id="deptDetailsEditBtn" class="btn small" style="padding:4px 12px;font-size:0.55rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:4px;cursor:pointer;">Edit</button>' +
            '<button type="button" id="deptDetailsAddPosBtn" class="btn small" style="padding:4px 12px;font-size:0.55rem;background:var(--accent);border:none;color:white;border-radius:4px;cursor:pointer;">Add Position</button>' +
            '<button type="button" id="deptDetailsDeleteBtn" class="btn small danger" style="padding:4px 12px;font-size:0.55rem;background:#8a3020;border:none;color:white;border-radius:4px;cursor:pointer;">Delete</button>' +
            '<button type="button" id="deptDetailsCloseBtn" class="btn small" style="padding:4px 12px;font-size:0.55rem;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">Close</button>' +
            '</div>' +
            '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--dim);margin-top:8px;">' +
            infoIcon + ' Department details' +
            '</div>';

        _openModal({
            title: 'Department Details: ' + vm.name,
            content: html,
            confirmText: '',
            cancelText: '',
            onMount: function(root) {
                var editBtn = root.querySelector('#deptDetailsEditBtn');
                if (editBtn) editBtn.addEventListener('click', function() {
                    _closeTopModal();
                    openEditGovernmentDepartmentModal(departmentId, function() {
                        openViewDepartmentDetailsModal(departmentId);
                    });
                });

                var addPosBtn = root.querySelector('#deptDetailsAddPosBtn');
                if (addPosBtn) addPosBtn.addEventListener('click', function() {
                    _closeTopModal();
                    if (typeof window.openAddPositionModal === 'function') {
                        window.openAddPositionModal(departmentId, function() {
                            openViewDepartmentDetailsModal(departmentId);
                        });
                    } else {
                        _toast('Add position modal unavailable', 'error');
                    }
                });

                var deleteBtn = root.querySelector('#deptDetailsDeleteBtn');
                if (deleteBtn) deleteBtn.addEventListener('click', function() {
                    _closeTopModal();
                    openDeleteGovernmentDepartmentModal(departmentId, function() {
                        // Modal already closed by delete flow.
                    });
                });

                var closeBtn = root.querySelector('#deptDetailsCloseBtn');
                if (closeBtn) closeBtn.addEventListener('click', function() {
                    _closeTopModal();
                });
            },
            onConfirm: function() {
                _closeTopModal();
            }
        });
    }

    // ---- Export --------------------------------------------------------------

    window.openCreateGovernmentDepartmentModal = openCreateGovernmentDepartmentModal;
    window.openEditGovernmentDepartmentModal = openEditGovernmentDepartmentModal;
    window.openDeleteGovernmentDepartmentModal = openDeleteGovernmentDepartmentModal;
    window.openViewDepartmentDetailsModal = openViewDepartmentDetailsModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openCreateGovernmentDepartmentModal: openCreateGovernmentDepartmentModal,
            openEditGovernmentDepartmentModal: openEditGovernmentDepartmentModal,
            openDeleteGovernmentDepartmentModal: openDeleteGovernmentDepartmentModal,
            openViewDepartmentDetailsModal: openViewDepartmentDetailsModal
        };
    }
})();
