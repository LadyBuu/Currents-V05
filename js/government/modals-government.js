/**
 * =============================================================================
 * STILL WATERS - GOVERNMENT MODALS (modals-government.js)
 * =============================================================================
 * 
 * This file contains ALL government-related UI modals:
 * - Government type CRUD
 * - Government assignment
 * - Department CRUD
 * - Position management
 * - Assignment management
 * 
 * REFACTORED: Uses GovernmentState, GovernmentCommands, GovernmentQueries
 * REFACTORED: Uses unified character selector from modals-core.js
 * REFACTORED: Uses unified location dropdown from modals-core.js
 * FIXED: All confirm buttons use plain text (no SVG icons)
 * FIXED: Recursion guards on all modal functions
 * FIXED: Icons from icons.js only (no emojis)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _openingModal = false;

    // =========================================================================
    // 2. ICON HELPERS (using icons.js)
    // =========================================================================

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        if (window.Icons && window.Icons.CIRCLE) {
            return window.Icons.CIRCLE;
        }
        return '';
    }

    // =========================================================================
    // 3. DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

    function _getCurrentYear() {
        if (typeof window._getCurrentYear === 'function') return window._getCurrentYear();
        if (typeof window.getCurrentYearSafe === 'function') return window.getCurrentYearSafe();
        if (typeof window.getCurrentYear === 'function') return window.getCurrentYear();
        return 1250;
    }

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getCharacters() {
        return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
    }

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getPlaces() {
        return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
    }

    function _getLocationTypeById(id) {
        return typeof window.getLocationTypeById === 'function' ? window.getLocationTypeById(id) : null;
    }

    function _buildLocationDropdown(selectedId, placeholderText, includeAll) {
        if (typeof window.buildLocationDropdown === 'function') {
            return window.buildLocationDropdown(selectedId, placeholderText, includeAll);
        }
        var places = _getPlaces();
        var html = '';
        if (placeholderText) {
            html += '<option value="">' + _escapeHtml(placeholderText) + '</option>';
        }
        if (includeAll) {
            html += '<option value="all">All Locations</option>';
        }
        for (var i = 0; i < places.length; i++) {
            var selected = (selectedId === places[i].id) ? 'selected' : '';
            var type = _getLocationTypeById(places[i].typeId);
            var icon = (type && type.icon) ? type.icon : '⌂';
            html += '<option value="' + places[i].id + '" ' + selected + '>' +
                icon + ' ' + _escapeHtml(places[i].displayName) +
                (type ? ' (' + _escapeHtml(type.displayName) + ')' : '') +
                '</option>';
        }
        html += '<option value="unknown" ' + (selectedId === 'unknown' ? 'selected' : '') + '>Unknown Location</option>';
        return html;
    }

    function _openCharacterSelector(options) {
        var onSelect = options.onSelect;
        var title = options.title || 'Select Character';
        var excludeId = options.excludeId || null;
        var filters = options.filters || {};

        if (typeof window.openUnifiedCharacterSelector === 'function') {
            window.openUnifiedCharacterSelector({
                title: title,
                targetId: excludeId || null,
                onSelect: onSelect,
                filters: {
                    gender: filters.gender || 'all',
                    status: filters.status || 'all',
                    showDeceased: filters.showDeceased || false,
                    location: filters.locationFilter || 'all',
                    ageMin: filters.ageMin || null,
                    ageMax: filters.ageMax || null
                },
                preset: filters.preset || null
            });
            return;
        }

        if (typeof window.openCharacterSelector === 'function') {
            window.openCharacterSelector({
                title: title,
                targetId: excludeId || null,
                onSelect: onSelect,
                filters: {
                    gender: filters.gender || 'all',
                    status: filters.status || 'all',
                    showDeceased: filters.showDeceased || false,
                    location: filters.locationFilter || 'all'
                },
                preset: filters.preset || null
            });
            return;
        }

        if (typeof window.openCharacterSelectModal === 'function') {
            window.openCharacterSelectModal({
                title: title,
                targetCharacterId: excludeId || null,
                onSelect: onSelect,
                includeDeceased: filters.showDeceased || false
            });
            return;
        }

        _showToast('Character selector not available', 'error');
    }

    function _buildRankOptions() {
        var ranks = typeof window.getRanks === 'function' ? window.getRanks() : [];
        var html = '';
        for (var i = 0; i < ranks.length; i++) {
            var r = ranks[i];
            html += '<option value="' + r.id + '">' + (r.symbol || '✦') + ' ' + _escapeHtml(r.name) + '</option>';
        }
        return html;
    }

    function _buildRankOptionsWithSelection(selectedIds) {
        var ranks = typeof window.getRanks === 'function' ? window.getRanks() : [];
        var html = '';
        var selectedSet = {};
        for (var i = 0; i < selectedIds.length; i++) {
            selectedSet[selectedIds[i]] = true;
        }
        for (var i = 0; i < ranks.length; i++) {
            var r = ranks[i];
            var selected = selectedSet[r.id] ? 'selected' : '';
            html += '<option value="' + r.id + '" ' + selected + '>' + (r.symbol || '✦') + ' ' + _escapeHtml(r.name) + '</option>';
        }
        return html;
    }

    // =========================================================================
    // 4. GOVERNMENT TYPE MODALS
    // =========================================================================

    function openAddGovernmentTypeModal(onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var infoIcon = _getIcon('CIRCLE_DOT');

            var modalContent =
                '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Government Type Name</label>' +
                '<input type="text" id="newGovTypeName" placeholder="e.g., Monarchy, Republic, Theocracy" autofocus style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Description</label>' +
                '<textarea id="newGovTypeDesc" rows="2" placeholder="Description of this government type..." style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);"></textarea>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Allowed Ranks</label>' +
                '<select id="newGovTypeRanks" multiple size="5" style="width:100%; height:120px; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                _buildRankOptions() +
                '</select>' +
                '<small style="font-size:0.55rem; color:var(--dim);">Hold Ctrl/Cmd to select multiple ranks. Leave empty to allow all ranks.</small>' +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                infoIcon + ' Government types define the structure of governance for locations.' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Add Government Type',
                content: modalContent,
                confirmText: 'Create Type',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var name = document.getElementById('newGovTypeName').value.trim();
                    if (!name) {
                        _showToast('Government type name is required', 'error');
                        return false;
                    }

                    var description = document.getElementById('newGovTypeDesc').value || '';
                    var rankSelect = document.getElementById('newGovTypeRanks');
                    var allowedRankIds = rankSelect ? Array.from(rankSelect.selectedOptions).map(function(opt) { return opt.value; }) : [];

                    var result = GovernmentCommands.createGovernmentType({
                        name: name,
                        description: description,
                        allowedRankIds: allowedRankIds
                    });

                    if (result) {
                        _closeTopModal();
                        if (onSuccess) onSuccess(result);
                        return true;
                    }
                    return false;
                }
            });

        } finally {
            _openingModal = false;
        }
    }

    function openEditGovernmentTypeModal(typeId, onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var type = GovernmentState.getGovernmentTypeById(typeId);
            if (!type) {
                _showToast('Government type not found', 'error');
                return;
            }

            var infoIcon = _getIcon('CIRCLE_DOT');

            var modalContent =
                '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Government Type Name</label>' +
                '<input type="text" id="editGovTypeName" value="' + _escapeHtml(type.name) + '" autofocus style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Description</label>' +
                '<textarea id="editGovTypeDesc" rows="3" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' + _escapeHtml(type.description || '') + '</textarea>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Allowed Ranks</label>' +
                '<select id="editGovTypeRanks" multiple size="5" style="width:100%; height:120px; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                _buildRankOptionsWithSelection(type.allowedRankIds || []) +
                '</select>' +
                '<small style="font-size:0.55rem; color:var(--dim);">Hold Ctrl/Cmd to select multiple ranks. Leave empty to allow all ranks.</small>' +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                infoIcon + ' Changing allowed ranks affects which characters can hold positions in this government type.' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Edit Government Type: ' + type.name,
                content: modalContent,
                confirmText: 'Save Changes',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var name = document.getElementById('editGovTypeName').value.trim();
                    if (!name) {
                        _showToast('Government type name is required', 'error');
                        return false;
                    }

                    var description = document.getElementById('editGovTypeDesc').value || '';
                    var rankSelect = document.getElementById('editGovTypeRanks');
                    var allowedRankIds = rankSelect ? Array.from(rankSelect.selectedOptions).map(function(opt) { return opt.value; }) : [];

                    var result = GovernmentCommands.updateGovernmentType(typeId, {
                        name: name,
                        description: description,
                        allowedRankIds: allowedRankIds
                    });

                    if (result) {
                        _closeTopModal();
                        if (onSuccess) onSuccess(result);
                        return true;
                    }
                    return false;
                }
            });

        } finally {
            _openingModal = false;
        }
    }

    function openDeleteGovernmentTypeModal(typeId, onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var type = GovernmentState.getGovernmentTypeById(typeId);
            if (!type) {
                _showToast('Government type not found', 'error');
                return;
            }

            var places = _getPlaces();
            var usedBy = places.filter(function(p) { return p.governmentTypeId === typeId; });

            var message = 'Delete government type "' + type.name + '" permanently?';
            if (usedBy.length > 0) {
                message = 'This government type is used by ' + usedBy.length + ' location(s). Deleting it will remove the government type from those locations. Continue?';
            }

            _confirmDialog(message, 'Delete Government Type', function() {
                var result = GovernmentCommands.deleteGovernmentType(typeId);
                if (result) {
                    _showToast('Deleted "' + type.name + '"', 'info');
                    if (onSuccess) onSuccess();
                    _closeTopModal();
                }
            });

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 5. GOVERNMENT ASSIGNMENT MODAL
    // =========================================================================

    function openAssignGovernmentModal(placeId, onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var place = _getPlaceById(placeId);
            if (!place) {
                _showToast('Place not found', 'error');
                return;
            }

            var governmentTypes = GovernmentState.getGovernmentTypes();
            var currentGovType = place.governmentTypeId ? GovernmentState.getGovernmentTypeById(place.governmentTypeId) : null;
            var locationIcon = _getIcon('LOCATION');

            var modalContent =
                '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg3); border-radius: 8px;">' +
                '<strong>' + locationIcon + ' ' + _escapeHtml(place.displayName) + '</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">Current government: ' + (currentGovType ? _escapeHtml(currentGovType.name) : (place.governmentTypeId || 'None')) + '</div>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Government Type</label>' +
                '<select id="govTypeId" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">' +
                '<option value="">None</option>' +
                governmentTypes.map(function(g) {
                    var selected = place.governmentTypeId === g.id ? 'selected' : '';
                    return '<option value="' + g.id + '" ' + selected + '>' + _escapeHtml(g.name) + '</option>';
                }).join('') +
                '</select>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Government Style</label>' +
                '<input type="text" id="govStyle" value="' + _escapeHtml(place.governmentStyle || '') + '" placeholder="e.g., Absolute, Constitutional, Feudal" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text);">' +
                '</div>';

            _openModal({
                title: 'Assign Government: ' + place.displayName,
                content: modalContent,
                confirmText: 'Assign',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var govTypeId = document.getElementById('govTypeId').value || null;
                    var govStyle = document.getElementById('govStyle').value.trim() || null;

                    if (typeof window.assignGovernment === 'function') {
                        window.assignGovernment(placeId, govTypeId, govStyle);
                        _showToast('Government assigned to ' + place.displayName, 'success');
                        _closeTopModal();
                        if (onSuccess) onSuccess();
                    } else {
                        _showToast('assignGovernment not available', 'error');
                    }
                    return true;
                }
            });

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 6. DEPARTMENT MODALS
    // =========================================================================

    function openCreateGovernmentDepartmentModal(locationId, onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var locationOptionsHtml = _buildLocationDropdown(locationId, 'Select a location', true);

            var departments = GovernmentState.getAllDepartments({ includeDeprecated: false });
            var deptOptions = '<option value="">None (Top-level)</option>' +
                departments.map(function(d) {
                    return '<option value="' + d.id + '">' + _escapeHtml(d.name) + '</option>';
                }).join('');

            var infoIcon = _getIcon('CIRCLE_DOT');

            var modalContent =
                '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Department Name</label>' +
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

                    var result = GovernmentCommands.createDepartment({
                        name: name,
                        description: document.getElementById('newDeptDescription').value || '',
                        locationId: locationId,
                        parentDepartmentId: document.getElementById('newDeptParent').value || null
                    });

                    if (result) {
                        _closeTopModal();
                        if (onSuccess) onSuccess(result.id);
                        return true;
                    }
                    return false;
                }
            });

        } finally {
            _openingModal = false;
        }
    }

    function openEditGovernmentDepartmentModal(deptId, onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var dept = GovernmentState.getDepartment(deptId);
            if (!dept) {
                _showToast('Department not found', 'error');
                return;
            }

            var locationOptionsHtml = _buildLocationDropdown(dept.locationId, 'Select a location', true);

            var departments = GovernmentState.getAllDepartments({ includeDeprecated: false });
            var deptOptions = '<option value="">None (Top-level)</option>' +
                departments.filter(function(d) { return d.id !== deptId; }).map(function(d) {
                    var selected = d.id === dept.parentDepartmentId ? 'selected' : '';
                    return '<option value="' + d.id + '" ' + selected + '>' + _escapeHtml(d.name) + '</option>';
                }).join('');

            var infoIcon = _getIcon('CIRCLE_DOT');

            var modalContent =
                '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Department Name</label>' +
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

                    var result = GovernmentCommands.updateDepartment(deptId, {
                        name: name,
                        description: document.getElementById('editDeptDescription').value || '',
                        locationId: document.getElementById('editDeptLocation').value,
                        parentDepartmentId: document.getElementById('editDeptParent').value || null
                    });

                    if (result) {
                        _closeTopModal();
                        if (onSuccess) onSuccess();
                        return true;
                    }
                    return false;
                }
            });

        } finally {
            _openingModal = false;
        }
    }

    function openDeleteGovernmentDepartmentModal(deptId, onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var dept = GovernmentState.getDepartment(deptId);
            if (!dept) {
                _showToast('Department not found', 'error');
                return;
            }

            var children = GovernmentState.getDepartmentsByParent(deptId);
            var hasChildren = children.length > 0;
            var assignments = GovernmentState.getAssignmentsForDepartment(deptId, true);
            var hasAssignments = assignments.length > 0;

            var message = 'Delete department "' + dept.name + '"?';
            if (hasChildren || hasAssignments) {
                var details = [];
                if (hasChildren) details.push(children.length + ' child departments');
                if (hasAssignments) details.push(assignments.length + ' active assignments');
                message = 'This department has ' + details.join(' and ') + '.\n\nDelete them as well?';
            }

            _confirmDialog(message, 'Delete Department', function() {
                var result = GovernmentCommands.deleteDepartment(deptId, { cascade: true });
                if (result) {
                    _showToast('Department deleted', 'info');
                    if (onSuccess) onSuccess();
                    _closeTopModal();
                }
            });

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 7. POSITION MODALS
    // =========================================================================

    function openAddPositionModal(deptId, onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var dept = GovernmentState.getDepartment(deptId);
            if (!dept) {
                _showToast('Department not found', 'error');
                return;
            }

            var positions = dept.positions || [];
            var parentOptions = '<option value="">None (Top-level)</option>' +
                positions.map(function(p) {
                    return '<option value="' + p.id + '">' + _escapeHtml(p.name) + ' (priority ' + p.priority + ')</option>';
                }).join('');

            var infoIcon = _getIcon('CIRCLE_DOT');
            var personIcon = _getIcon('PERSON');

            var modalContent =
                '<div style="margin-bottom: 12px; padding: 8px; background: var(--bg2); border-radius: 6px;">' +
                '<strong>Department:</strong> ' + _escapeHtml(dept.name) +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Position Name</label>' +
                '<input type="text" id="newPosName" placeholder="e.g., Minister of Education" autofocus style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Description</label>' +
                '<input type="text" id="newPosDescription" placeholder="e.g., Head of the department" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Priority</label>' +
                '<input type="number" id="newPosPriority" value="10" min="1" max="100" style="width:80px; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '<small style="font-size:0.55rem; color:var(--dim);">1 = highest, 100 = lowest</small>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Parent Position</label>' +
                '<select id="newPosParent" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                parentOptions +
                '</select>' +
                '</div>';

            _openModal({
                title: 'Add Position to ' + dept.name,
                content: modalContent,
                confirmText: 'Add Position',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var name = document.getElementById('newPosName').value.trim();
                    if (!name) {
                        _showToast('Position name is required', 'error');
                        return false;
                    }

                    var result = GovernmentCommands.addPosition(deptId, {
                        name: name,
                        description: document.getElementById('newPosDescription').value || '',
                        priority: parseInt(document.getElementById('newPosPriority').value) || 10,
                        parentPositionId: document.getElementById('newPosParent').value || null
                    });

                    if (result) {
                        _closeTopModal();
                        if (onSuccess) onSuccess(result.id);
                        return true;
                    }
                    return false;
                }
            });

        } finally {
            _openingModal = false;
        }
    }

    function openEditPositionModal(deptId, positionId, onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var dept = GovernmentState.getDepartment(deptId);
            if (!dept) {
                _showToast('Department not found', 'error');
                return;
            }

            var position = GovernmentState.getPositionById(deptId, positionId);
            if (!position) {
                _showToast('Position not found', 'error');
                return;
            }

            var positions = dept.positions || [];
            var parentOptions = '<option value="">None (Top-level)</option>' +
                positions.filter(function(p) { return p.id !== positionId; }).map(function(p) {
                    var selected = p.id === position.parentPositionId ? 'selected' : '';
                    return '<option value="' + p.id + '" ' + selected + '>' + _escapeHtml(p.name) + ' (priority ' + p.priority + ')</option>';
                }).join('');

            var infoIcon = _getIcon('CIRCLE_DOT');

            var modalContent =
                '<div style="margin-bottom: 12px; padding: 8px; background: var(--bg2); border-radius: 6px;">' +
                '<strong>Department:</strong> ' + _escapeHtml(dept.name) +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Position Name</label>' +
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

                    var result = GovernmentCommands.updatePosition(deptId, positionId, {
                        name: name,
                        description: document.getElementById('editPosDescription').value || '',
                        priority: parseInt(document.getElementById('editPosPriority').value) || 10,
                        parentPositionId: document.getElementById('editPosParent').value || null
                    });

                    if (result) {
                        _closeTopModal();
                        if (onSuccess) onSuccess();
                        return true;
                    }
                    return false;
                }
            });

        } finally {
            _openingModal = false;
        }
    }

    function openDeletePositionModal(deptId, positionId, onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var dept = GovernmentState.getDepartment(deptId);
            if (!dept) {
                _showToast('Department not found', 'error');
                return;
            }

            var position = GovernmentState.getPositionById(deptId, positionId);
            if (!position) {
                _showToast('Position not found', 'error');
                return;
            }

            var assignments = GovernmentState.getAssignmentsForPosition(deptId, positionId, true);
            var hasAssignments = assignments.length > 0;

            var message = 'Delete position "' + position.name + '"?';
            if (hasAssignments) {
                message = 'This position has ' + assignments.length + ' active assignment(s).\n\nDeleting it will also remove all assignments. Continue?';
            }

            _confirmDialog(message, 'Delete Position', function() {
                var result = GovernmentCommands.deletePosition(deptId, positionId);
                if (result) {
                    _showToast('Position deleted', 'info');
                    if (onSuccess) onSuccess();
                    _closeTopModal();
                }
            });

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 8. ASSIGNMENT MODALS
    // =========================================================================

    function openAssignCharacterToPositionModal(deptId, positionId, onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var dept = GovernmentState.getDepartment(deptId);
            if (!dept) {
                _showToast('Department not found', 'error');
                return;
            }

            var position = GovernmentState.getPositionById(deptId, positionId);
            if (!position) {
                _showToast('Position not found', 'error');
                return;
            }

            var currentAssignments = GovernmentState.getAssignmentsForPosition(deptId, positionId, true);
            var personIcon = _getIcon('PERSON');
            var infoIcon = _getIcon('CIRCLE_DOT');

            var currentHtml = '';
            if (currentAssignments.length > 0) {
                currentHtml = '<div style="margin-bottom: 12px; padding: 8px; background: rgba(200, 112, 64, 0.1); border-radius: 6px;">' +
                    '<div style="font-size: 0.6rem; color: var(--dim);">Currently assigned:</div>';
                for (var i = 0; i < currentAssignments.length; i++) {
                    var a = currentAssignments[i];
                    var char = _getCharacterById(a.characterId);
                    currentHtml += '<div style="font-size: 0.7rem;">• ' + _escapeHtml(a.characterName || (char ? char.name : 'Unknown')) +
                        ' (since ' + a.startYear + ')' +
                        (a.title && a.title !== position.name ? ' - ' + _escapeHtml(a.title) : '') +
                        '</div>';
                }
                currentHtml += '</div>';
            }

            var history = GovernmentQueries.getAssignmentHistory(deptId, positionId, null, 5);
            var historyHtml = '';
            if (history && history.length > 0) {
                historyHtml = '<div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border);">' +
                    '<div style="font-size: 0.65rem; color: var(--accent); margin-bottom: 8px;">Recent History</div>' +
                    '<div style="max-height: 150px; overflow-y: auto; background: var(--bg3); border-radius: 6px; padding: 8px;">';

                for (var i = 0; i < history.length; i++) {
                    var h = history[i];
                    var isActive = h.isActive;
                    var endDisplay = h.endYear || 'Present';
                    var color = isActive ? 'var(--success)' : 'var(--dim)';

                    historyHtml += '<div style="display:flex; justify-content:space-between; padding: 4px 0; border-bottom: 1px solid var(--border-light); font-size: 0.6rem;">' +
                        '<span>' + _escapeHtml(h.characterName) +
                        (h.title && h.title !== position.name ? ' (' + _escapeHtml(h.title) + ')' : '') +
                        '</span>' +
                        '<span style="color:' + color + ';">' + h.startYear + ' - ' + endDisplay + '</span>' +
                        '</div>';
                }

                historyHtml += '</div></div>';
            }

            var modalContent =
                '<div style="margin-bottom: 12px; padding: 8px; background: var(--bg2); border-radius: 6px;">' +
                '<strong>Department:</strong> ' + _escapeHtml(dept.name) + '<br>' +
                '<strong>Position:</strong> ' + _escapeHtml(position.name) +
                '</div>' +
                currentHtml +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Select Character</label>' +
                '<button id="selectCharForPosition" class="btn" style="width:100%; padding:8px; background:var(--bg3); border:1px solid var(--border); border-radius:6px; cursor:pointer; text-align:left; color:var(--text);">' +
                personIcon + ' Click to select a character...' +
                '</button>' +
                '<div id="selectedCharDisplay" style="font-size: 0.6rem; color: var(--dim); margin-top: 4px;"></div>' +
                '<input type="hidden" id="selectedCharId">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Custom Title</label>' +
                '<input type="text" id="assignTitle" placeholder="e.g., Minister of Education" value="' + _escapeHtml(position.name) + '" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '</div>' +
                '<div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">' +
                '<div class="form-group">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Start Year</label>' +
                '<input type="number" id="assignStartYear" value="' + _getCurrentYear() + '" min="1" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
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
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim); margin-top: 12px;">' +
                infoIcon + ' Assignments track who holds this position over time. Setting an end year records it as historical.' +
                '</div>';

            _openModal({
                title: 'Assign Character to ' + position.name,
                content: modalContent,
                confirmText: 'Assign Character',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var characterId = document.getElementById('selectedCharId').value;
                    if (!characterId) {
                        _showToast('Please select a character', 'error');
                        return false;
                    }

                    var startYear = parseInt(document.getElementById('assignStartYear').value) || _getCurrentYear();
                    var endYear = document.getElementById('assignEndYear').value;
                    var endYearValue = endYear ? parseInt(endYear) : null;
                    var notes = document.getElementById('assignNotes').value || '';
                    var title = document.getElementById('assignTitle').value || position.name;

                    if (endYearValue && endYearValue <= startYear) {
                        _showToast('End year must be after start year', 'error');
                        return false;
                    }

                    var result = GovernmentCommands.assignCharacterToPosition(deptId, positionId, characterId, {
                        startYear: startYear,
                        endYear: endYearValue,
                        title: title,
                        notes: notes
                    });

                    if (result) {
                        _closeTopModal();
                        if (onSuccess) onSuccess();
                        return true;
                    }
                    return false;
                }
            });

            setTimeout(function() {
                var selectBtn = document.getElementById('selectCharForPosition');
                var displayDiv = document.getElementById('selectedCharDisplay');
                var hiddenInput = document.getElementById('selectedCharId');

                if (selectBtn) {
                    selectBtn.onclick = function() {
                        _openCharacterSelector({
                            title: 'Select Character for ' + position.name,
                            excludeId: null,
                            filters: {
                                showDeceased: false,
                                status: 'all'
                            },
                            onSelect: function(character) {
                                if (character) {
                                    hiddenInput.value = character.id;
                                    var age = typeof window.calculateAge === 'function' ?
                                        window.calculateAge(character.birthYear, false, null) :
                                        '?';
                                    displayDiv.textContent = character.name + ' ' + (character.surname || '') +
                                        ' (' + (character.gender === 'male' ? '♂' : '♀') + ' ' + age + 'y)';
                                    selectBtn.textContent = character.name + ' ' + (character.surname || '');
                                    _showToast('Selected: ' + character.name, 'info');
                                }
                            }
                        });
                    };
                }
            }, 100);

        } finally {
            _openingModal = false;
        }
    }

    function openRemoveAssignmentModal(deptId, assignmentId, onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var dept = GovernmentState.getDepartment(deptId);
            if (!dept) {
                _showToast('Department not found', 'error');
                return;
            }

            var assignment = GovernmentState.getAssignmentById(deptId, assignmentId);
            if (!assignment) {
                _showToast('Assignment not found', 'error');
                return;
            }

            var character = _getCharacterById(assignment.characterId);
            var charName = assignment.characterName || (character ? character.name : 'Unknown');
            var infoIcon = _getIcon('CIRCLE_DOT');

            var modalContent =
                '<div style="margin-bottom: 12px; padding: 8px; background: var(--bg2); border-radius: 6px;">' +
                '<strong>Character:</strong> ' + _escapeHtml(charName) + '<br>' +
                '<strong>Position:</strong> ' + _escapeHtml(assignment.title || assignment.positionId) +
                (assignment.startYear ? '<br><strong>Started:</strong> ' + assignment.startYear : '') +
                (assignment.endYear ? '<br><strong>Ended:</strong> ' + assignment.endYear : '') +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">End Year</label>' +
                '<input type="number" id="removeEndYear" value="' + (assignment.endYear || _getCurrentYear()) + '" min="' + (assignment.startYear || 1) + '" style="width:100px; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '<small style="font-size:0.55rem; color:var(--dim);">This will mark the assignment as ended. Leave as current year.</small>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Reason</label>' +
                '<input type="text" id="removeReason" placeholder="e.g., Resignation, Term ended, Dismissed..." style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                infoIcon + ' This will mark the assignment as ended and keep it in the position history.' +
                '</div>';

            _openModal({
                title: 'End Assignment',
                content: modalContent,
                confirmText: 'End Assignment',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var endYear = parseInt(document.getElementById('removeEndYear').value);
                    var reason = document.getElementById('removeReason').value || 'Term ended';

                    if (isNaN(endYear) || endYear < (assignment.startYear || 1)) {
                        _showToast('End year must be after start year', 'error');
                        return false;
                    }

                    var result = GovernmentCommands.endAssignment(deptId, assignmentId, endYear, reason);
                    if (result) {
                        _closeTopModal();
                        if (onSuccess) onSuccess();
                        return true;
                    }
                    return false;
                }
            });

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 9. VIEW MODALS
    // =========================================================================

    function openViewGovernmentDepartmentsModal(locationId, onSelect) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var place = _getPlaceById(locationId);
            var departments = GovernmentState.getDepartmentsByLocation(locationId);
            var locationIcon = _getIcon('LOCATION');
            var infoIcon = _getIcon('CIRCLE_DOT');

            var deptHtml = '';
            if (departments.length === 0) {
                deptHtml = '<div style="text-align: center; padding: 20px; color: var(--dim);">No departments found at this location</div>';
            } else {
                for (var i = 0; i < departments.length; i++) {
                    var d = departments[i];
                    var posCount = (d.positions || []).length;
                    var assignCount = (d.assignments || []).length;
                    var activeCount = (d.assignments || []).filter(function(a) { return !a.endYear; }).length;

                    deptHtml +=
                        '<div class="dept-item" data-dept-id="' + d.id + '" style="' +
                        'background: var(--bg3);' +
                        'border: 1px solid var(--border);' +
                        'border-radius: 6px;' +
                        'padding: 10px;' +
                        'margin-bottom: 8px;' +
                        'cursor: pointer;' +
                        'transition: all 0.1s;' +
                        '">' +
                        '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">' +
                        '<div>' +
                        '<strong>' + _escapeHtml(d.name) + '</strong>' +
                        (d.parentDepartmentId ? ' <span style="font-size: 0.55rem; color: var(--dim);">(Child)</span>' : '') +
                        '</div>' +
                        '<div style="font-size: 0.6rem; color: var(--dim);">' +
                        posCount + ' positions · ' + assignCount + ' assignments (' + activeCount + ' active)' +
                        '</div>' +
                        '</div>' +
                        (d.description ? '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">' + _escapeHtml(d.description) + '</div>' : '') +
                        '</div>';
                }
            }

            var modalContent =
                '<div style="margin-bottom: 16px; padding: 12px; background: var(--bg2); border-radius: 8px;">' +
                '<strong>' + locationIcon + ' ' + (place ? _escapeHtml(place.displayName) : 'Unknown') + '</strong>' +
                '<div style="font-size: 0.65rem; color: var(--dim);">' + departments.length + ' government department(s)</div>' +
                '</div>' +
                '<div id="deptList" style="max-height: 400px; overflow-y: auto;">' +
                deptHtml +
                '</div>' +
                '<div style="margin-top: 12px; padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                infoIcon + ' Click on a department to view its details' +
                '</div>';

            _openModal({
                title: 'Government Departments: ' + (place ? place.displayName : 'Unknown'),
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {}
            });

            setTimeout(function() {
                var items = document.querySelectorAll('.dept-item');
                for (var i = 0; i < items.length; i++) {
                    (function(item) {
                        item.addEventListener('click', function() {
                            var deptId = this.dataset.deptId;
                            _closeTopModal();
                            if (onSelect) {
                                var dept = GovernmentState.getDepartment(deptId);
                                if (dept) onSelect(dept);
                            }
                        });
                        item.addEventListener('mouseenter', function() {
                            this.style.background = 'var(--bg2)';
                            this.style.borderColor = 'var(--accent)';
                        });
                        item.addEventListener('mouseleave', function() {
                            this.style.background = 'var(--bg3)';
                            this.style.borderColor = 'var(--border)';
                        });
                    })(items[i]);
                }
            }, 100);

        } finally {
            _openingModal = false;
        }
    }

    function openViewGovernmentStatisticsModal(locationId) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var stats = GovernmentQueries.getStatistics({ includeDeprecated: false });
            var locationStats = locationId ? GovernmentQueries.getLocationGovernmentSummary(locationId) : null;
            var infoIcon = _getIcon('CIRCLE_DOT');

            var modalContent =
                '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 16px;">' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Total Departments</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold;">' + (locationStats ? locationStats.totalDepartments : stats.totalDepartments) + '</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Total Positions</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold;">' + (locationStats ? locationStats.totalPositions : stats.totalPositions) + '</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 0.55rem; color: var(--dim);">Active Assignments</div>' +
                '<div style="font-size: 1.2rem; font-weight: bold;">' + (locationStats ? locationStats.activeAssignments : stats.activeAssignments) + '</div>' +
                '</div>' +
                '</div>' +
                '<div style="background: var(--bg3); padding: 12px; border-radius: 8px; margin-bottom: 12px;">' +
                '<div style="font-size: 0.65rem; color: var(--accent); margin-bottom: 8px;">Averages</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.6rem;">' +
                '<div><span style="color: var(--dim);">Avg positions per dept:</span> ' + (stats.averagePositionsPerDepartment || 0) + '</div>' +
                '<div><span style="color: var(--dim);">Avg assignments per dept:</span> ' + (stats.averageAssignmentsPerDepartment || 0) + '</div>' +
                '</div>' +
                '</div>' +
                (locationStats && locationStats.departments ? '<div style="font-size: 0.6rem; color: var(--dim); margin-top: 12px;">Departments at this location: ' + locationStats.departments.length + '</div>' : '') +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim); margin-top: 12px;">' +
                infoIcon + ' Statistics reflect active (non-deprecated) departments only.' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Government Statistics' + (locationId ? ' for ' + (locationStats ? locationStats.locationName : 'Unknown') : ''),
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {}
            });

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.openAddGovernmentTypeModal = openAddGovernmentTypeModal;
    window.openEditGovernmentTypeModal = openEditGovernmentTypeModal;
    window.openDeleteGovernmentTypeModal = openDeleteGovernmentTypeModal;

    window.openAssignGovernmentModal = openAssignGovernmentModal;

    window.openCreateGovernmentDepartmentModal = openCreateGovernmentDepartmentModal;
    window.openEditGovernmentDepartmentModal = openEditGovernmentDepartmentModal;
    window.openDeleteGovernmentDepartmentModal = openDeleteGovernmentDepartmentModal;

    window.openAddPositionModal = openAddPositionModal;
    window.openEditPositionModal = openEditPositionModal;
    window.openDeletePositionModal = openDeletePositionModal;

    window.openAssignCharacterToPositionModal = openAssignCharacterToPositionModal;
    window.openRemoveAssignmentModal = openRemoveAssignmentModal;

    window.openViewGovernmentDepartmentsModal = openViewGovernmentDepartmentsModal;
    window.openViewGovernmentStatisticsModal = openViewGovernmentStatisticsModal;

})();