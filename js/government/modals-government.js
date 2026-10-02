/**
 * modals-government.js
 * Government type + department CRUD, government assignment, and placement modals.
 * Reads via GovernmentQueries. Writes via GovernmentCommands. UI owns presentation.
 */
(function() {
    'use strict';

    var Queries = window.GovernmentQueries;
    var Commands = window.GovernmentCommands;
    var _LocationQueries = window.LocationQueries;
    var _RoleQueries = window.RoleQueries;

    if (!Queries) throw new Error('modals-government.js requires GovernmentQueries');
    if (!Commands) throw new Error('modals-government.js requires GovernmentCommands');
    if (!_LocationQueries) throw new Error('modals-government.js requires LocationQueries');

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
        if (typeof window.openModal !== 'function') {
            throw new Error('modals-government.js: openModal not available');
        }
        return window.openModal(opts);
    }
    function _closeTopModal() {
        if (typeof window.closeTopModal === 'function') window.closeTopModal();
    }
    function _getIcon(name) {
        if (typeof window._getIcon === 'function') return window._getIcon(name);
        return window.Icons && window.Icons[name] ? window.Icons[name] : '';
    }
    function _iconSpan(name) {
        var i = _getIcon(name);
        return i ? '<span style="display:inline-flex;align-items:center;vertical-align:middle;">' + i + '</span>' : '';
    }

    function _buildIconOptions(selectedIcon) {
        if (typeof window.buildIconOptions === 'function') {
            return window.buildIconOptions(selectedIcon);
        }
        // Minimal fallback: the icon catalogue is Icons keys, if available.
        var icons = window.Icons || {};
        var keys = Object.keys(icons);
        if (keys.length === 0) return '<option value="">None</option>';
        var html = '<option value="">None</option>';
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            var sel = k === selectedIcon ? 'selected' : '';
            html += '<option value="' + _attr(k) + '" ' + sel + '>' + _escapeHtml(k) + '</option>';
        }
        return html;
    }

    function _buildRankOptions(selectedIds) {
        var ranks = (_RoleQueries && _RoleQueries.getAllRankSummaries)
            ? _RoleQueries.getAllRankSummaries()
            : [];
        var selected = {};
        if (selectedIds) for (var s = 0; s < selectedIds.length; s++) selected[selectedIds[s]] = true;
        var html = '';
        for (var i = 0; i < ranks.length; i++) {
            var r = ranks[i];
            var sel = selected[r.id] ? 'selected' : '';
            html += '<option value="' + _attr(r.id) + '" ' + sel + '>' +
                (r.symbol ? _escapeHtml(r.symbol) + ' ' : '') + _escapeHtml(r.name) + '</option>';
        }
        return html;
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

    function _bind(root, selector, event, handler) {
        var el = root.querySelector(selector);
        if (el) el.addEventListener(event, handler);
    }
    function _setConfirmHandlers(root, onConfirm) {
        // modals-core typically provides confirm/cancel via its own buttons; we
        // only need this if it exposes the modal root for post-mount hookup.
        return onConfirm;
    }

    // ---- Government type: add -------------------------------------------------

    function openAddGovernmentTypeModal(onSuccess) {
        var infoIcon = _iconSpan('CIRCLE_DOT');

        var html =
            '<div style="max-height:500px;overflow-y:auto;padding:4px;">' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Government Type Name</label>' +
            '<input type="text" id="newGovTypeName" placeholder="e.g., Monarchy, Republic, Theocracy" autofocus style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Description</label>' +
            '<textarea id="newGovTypeDesc" rows="2" placeholder="Description of this government type..." style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);"></textarea>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Icon</label>' +
            '<select id="newGovTypeIcon" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            _buildIconOptions('SHIELD') +
            '</select>' +
            '<small style="font-size:0.55rem;color:var(--dim);">Optional</small>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Allowed Ranks</label>' +
            '<select id="newGovTypeRanks" multiple size="5" style="width:100%;height:120px;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            _buildRankOptions([]) +
            '</select>' +
            '<small style="font-size:0.55rem;color:var(--dim);">Hold Ctrl/Cmd to select multiple. Empty = all ranks.</small>' +
            '</div>' +
            '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--dim);">' +
            infoIcon + ' Government types define the structure of governance for locations.' +
            '</div>' +
            '</div>';

        _openModal({
            title: 'Add Government Type',
            content: html,
            confirmText: 'Create Type',
            cancelText: 'Cancel',
            onConfirm: function(root) {
                var name = root.querySelector('#newGovTypeName').value.trim();
                if (!name) { _toast('Government type name is required', 'error'); return false; }
                var desc = root.querySelector('#newGovTypeDesc').value || '';
                var rankSel = root.querySelector('#newGovTypeRanks');
                var allowedRanks = rankSel ? Array.prototype.slice.call(rankSel.selectedOptions).map(function(o) { return o.value; }) : [];
                var icon = root.querySelector('#newGovTypeIcon').value || '';

                var result = Commands.createGovernmentType({
                    name: name, description: desc, allowedRankIds: allowedRanks, icon: icon
                });
                if (!result.success) {
                    _toast(result.reason || 'Failed to create government type', 'error');
                    return false;
                }
                _closeTopModal();
                _toast('Government type "' + name + '" created', 'success');
                if (onSuccess) onSuccess(result.data);
                return true;
            }
        });
    }

    // ---- Government type: edit -----------------------------------------------

    function openEditGovernmentTypeModal(typeId, onSuccess) {
        var type = Queries.getGovernmentType(typeId);
        if (!type) { _toast('Government type not found', 'error'); return; }

        var infoIcon = _iconSpan('CIRCLE_DOT');

        var html =
            '<div style="max-height:500px;overflow-y:auto;padding:4px;">' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Government Type Name</label>' +
            '<input type="text" id="editGovTypeName" value="' + _attr(type.name) + '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Description</label>' +
            '<textarea id="editGovTypeDesc" rows="2" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' + _escapeHtml(type.description) + '</textarea>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Icon</label>' +
            '<select id="editGovTypeIcon" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            _buildIconOptions(type.icon) +
            '</select>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Allowed Ranks</label>' +
            '<select id="editGovTypeRanks" multiple size="5" style="width:100%;height:120px;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            _buildRankOptions(type.allowedRankIds) +
            '</select>' +
            '</div>' +
            '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--dim);">' +
            infoIcon + ' Edit government type details.' +
            '</div>' +
            '</div>';

        _openModal({
            title: 'Edit Government Type: ' + type.name,
            content: html,
            confirmText: 'Save Changes',
            cancelText: 'Cancel',
            onConfirm: function(root) {
                var name = root.querySelector('#editGovTypeName').value.trim();
                if (!name) { _toast('Government type name is required', 'error'); return false; }
                var desc = root.querySelector('#editGovTypeDesc').value || '';
                var rankSel = root.querySelector('#editGovTypeRanks');
                var allowedRanks = rankSel ? Array.prototype.slice.call(rankSel.selectedOptions).map(function(o) { return o.value; }) : [];
                var icon = root.querySelector('#editGovTypeIcon').value || '';

                var result = Commands.updateGovernmentType(typeId, {
                    name: name, description: desc, allowedRankIds: allowedRanks, icon: icon
                });
                if (!result.success) {
                    _toast(result.reason || 'Failed to update government type', 'error');
                    return false;
                }
                _closeTopModal();
                _toast('Government type updated', 'success');
                if (onSuccess) onSuccess(result.data);
                return true;
            }
        });
    }

    // ---- Government type: delete ---------------------------------------------

    function openDeleteGovernmentTypeModal(typeId, onSuccess) {
        var type = Queries.getGovernmentType(typeId);
        if (!type) { _toast('Government type not found', 'error'); return; }

        var usage = (_LocationQueries.getPlacesUsingGovernmentType)
            ? _LocationQueries.getPlacesUsingGovernmentType(typeId)
            : [];

        if (usage && usage.length > 0) {
            var names = usage.map(function(p) { return p.displayName || p.name || 'Unknown'; }).join(', ');
            _toast('Cannot delete: used by ' + usage.length + ' location(s): ' + names, 'warning');
            return;
        }

        if (typeof window.confirmDialog === 'function') {
            window.confirmDialog('Delete government type "' + type.name + '"?', 'Delete Government Type', function() {
                var result = Commands.deleteGovernmentType(typeId);
                if (!result.success) {
                    _toast(result.reason || 'Failed to delete government type', 'error');
                    return;
                }
                _closeTopModal();
                _toast('Government type deleted', 'info');
                if (onSuccess) onSuccess(result.data);
            });
        } else {
            _toast('confirmDialog unavailable', 'error');
        }
    }

    // ---- Assign government to place ------------------------------------------

    function openAssignGovernmentModal(placeId, onSuccess) {
        var place = _LocationQueries.getPlaceSummary(placeId);
        if (!place) { _toast('Place not found', 'error'); return; }

        var types = Queries.getGovernmentTypes();
        var current = place.governmentTypeId ? Queries.getGovernmentType(place.governmentTypeId) : null;
        var locationIcon = _iconSpan('LOCATION');

        var optionsHtml = '<option value="">None</option>';
        for (var i = 0; i < types.length; i++) {
            var g = types[i];
            var sel = place.governmentTypeId === g.id ? 'selected' : '';
            optionsHtml += '<option value="' + _attr(g.id) + '" ' + sel + '>' + _escapeHtml(g.name) + '</option>';
        }

        var html =
            '<div style="margin-bottom:16px;padding:12px;background:var(--bg3);border-radius:8px;">' +
            '<strong>' + locationIcon + ' ' + _escapeHtml(place.displayName) + '</strong>' +
            '<div style="font-size:0.65rem;color:var(--dim);">Current: ' + _escapeHtml(current ? current.name : 'None') + '</div>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Government Type</label>' +
            '<select id="govTypeId" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            optionsHtml + '</select>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Government Style</label>' +
            '<input type="text" id="govStyle" value="' + _attr(place.governmentStyle || '') + '" placeholder="e.g., Absolute, Constitutional, Feudal" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '</div>';

        _openModal({
            title: 'Assign Government: ' + place.displayName,
            content: html,
            confirmText: 'Assign',
            cancelText: 'Cancel',
            onConfirm: function(root) {
                var govTypeId = root.querySelector('#govTypeId').value || null;
                var govStyle = root.querySelector('#govStyle').value.trim() || null;

                var result = Commands.assignGovernmentToPlace(placeId, govTypeId, govStyle);
                if (!result.success) {
                    _toast(result.reason || 'Failed to assign government', 'error');
                    return false;
                }
                _closeTopModal();
                _toast('Government assigned to ' + place.displayName, 'success');
                if (onSuccess) onSuccess(result.data);
                return true;
            }
        });
    }

    // ---- Department: create ---------------------------------------------------

    function openCreateGovernmentDepartmentModal(locationId, onSuccess) {
        var locationOptions = _buildLocationOptions(locationId, 'Select a location', true);

        var depts = Queries.getDepartments({});
        var deptOptions = '<option value="">None (Top-level)</option>';
        for (var i = 0; i < depts.length; i++) {
            deptOptions += '<option value="' + _attr(depts[i].id) + '">' + _escapeHtml(depts[i].name) + '</option>';
        }

        var infoIcon = _iconSpan('CIRCLE_DOT');

        var html =
            '<div style="max-height:500px;overflow-y:auto;padding:4px;">' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Department Name</label>' +
            '<input type="text" id="newDeptName" placeholder="e.g., Ministry of Education" autofocus style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Description</label>' +
            '<textarea id="newDeptDescription" rows="2" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);"></textarea>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Location</label>' +
            '<select id="newDeptLocation" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            locationOptions + '</select>' +
            '</div>' +
            '<div class="form-group" style="margin-bottom:12px;">' +
            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Parent Department</label>' +
            '<select id="newDeptParent" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);">' +
            deptOptions + '</select>' +
            '</div>' +
            '<div style="padding:8px;background:var(--bg3);border-radius:6px;font-size:0.55rem;color:var(--dim);">' +
            infoIcon + ' Departments can be organized hierarchically.' +
            '</div>' +
            '</div>';

        _openModal({
            title: 'Create Government Department',
            content: html,
            confirmText: 'Create Department',
            cancelText: 'Cancel',
            onConfirm: function(root) {
                var name = root.querySelector('#newDeptName').value.trim();
                if (!name) { _toast('Department name is required', 'error'); return false; }
                var locId = root.querySelector('#newDeptLocation').value;
                if (!locId) { _toast('Location is required', 'error'); return false; }

                var result = Commands.createDepartment({
                    name: name,
                    description: root.querySelector('#newDeptDescription').value || '',
                    locationId: locId,
                    parentDepartmentId: root.querySelector('#newDeptParent').value || null
                });
                if (!result.success) {
                    _toast(result.reason || 'Failed to create department', 'error');
                    return false;
                }
                _closeTopModal();
                _toast('Department "' + name + '" created', 'success');
                if (onSuccess) onSuccess(result.data);
                return true;
            }
        });
    }

    // ---- Export --------------------------------------------------------------

    window.openAddGovernmentTypeModal = openAddGovernmentTypeModal;
    window.openEditGovernmentTypeModal = openEditGovernmentTypeModal;
    window.openDeleteGovernmentTypeModal = openDeleteGovernmentTypeModal;
    window.openAssignGovernmentModal = openAssignGovernmentModal;
    window.openCreateGovernmentDepartmentModal = openCreateGovernmentDepartmentModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openAddGovernmentTypeModal: openAddGovernmentTypeModal,
            openEditGovernmentTypeModal: openEditGovernmentTypeModal,
            openDeleteGovernmentTypeModal: openDeleteGovernmentTypeModal,
            openAssignGovernmentModal: openAssignGovernmentModal,
            openCreateGovernmentDepartmentModal: openCreateGovernmentDepartmentModal
        };
    }
})();
