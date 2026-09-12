/**
 * =============================================================================
 * STILL WATERS - GOVERNMENT MODALS (js/government/modals-government.js)
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
 * REFACTORED: Uses icon dropdown from modals-core.js
 * FIXED: Double toast issue - removed internal toasts
 * FIXED: All confirm buttons use plain text (no SVG icons)
 * FIXED: Recursion guards on all modal functions
 * FIXED: Icons from icons.js only (no emojis)
 * FIXED: Government type creation saves properly
 * FIXED: No duplicate event handlers
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
        var plainMessage = msg;
        if (typeof msg === 'string') {
            plainMessage = msg.replace(/<[^>]*>/g, '');
        }
        if (typeof window._showToast === 'function') {
            window._showToast(plainMessage, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(plainMessage, type);
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(plainMessage, type);
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
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
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

    function _getIconDropdown(selectedIcon, placeholder) {
        if (typeof window.getIconDropdown === 'function') {
            return window.getIconDropdown(selectedIcon, placeholder);
        }
        return '<input type="text" id="editGovTypeIcon" value="' + _escapeHtml(selectedIcon || '') + '" placeholder="' + _escapeHtml(placeholder || 'Icon') + '" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">';
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
    // 4. GOVERNMENT TYPE MODALS - FIXED: No double toasts
    // =========================================================================

    function openAddGovernmentTypeModal(onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var infoIcon = _getIcon('CIRCLE_DOT');
            var iconDropdown = _getIconDropdown('SHIELD', 'Select an icon');

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
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Icon</label>' +
                '<select id="newGovTypeIcon" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                iconDropdown +
                '</select>' +
                '<small style="font-size:0.55rem; color:var(--dim);">Optional: Icon for this government type</small>' +
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
                    var icon = document.getElementById('newGovTypeIcon').value || '';

                    var result = window.GovernmentCommands.createGovernmentType({
                        name: name,
                        description: description,
                        allowedRankIds: allowedRankIds,
                        icon: icon
                    });

                    if (result) {
                        // Force save - GovernmentCommands does this too, but double-check
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
                        // Toast is shown by GovernmentCommands.createGovernmentType
                        if (onSuccess) onSuccess(result);
                        _openingModal = false;
                        return true;
                    }
                    // Only show error if command failed
                    _showToast('Failed to create government type', 'error');
                    return false;
                },
                onCancel: function() {
                    _openingModal = false;
                }
            });

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 5. EDIT GOVERNMENT TYPE MODAL - FIXED: No double toasts
    // =========================================================================

    function openEditGovernmentTypeModal(typeId, onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var type = window.GovernmentState.getGovernmentTypeById(typeId);
            if (!type) {
                _showToast('Government type not found', 'error');
                _openingModal = false;
                return;
            }

            var ranks = typeof window.getRanks === 'function' ? window.getRanks() : [];
            var selectedRankIds = type.allowedRankIds || [];
            var rankOptions = ranks.map(function(r) {
                var selected = selectedRankIds.indexOf(r.id) !== -1 ? 'selected' : '';
                return '<option value="' + r.id + '" ' + selected + '>' + (r.symbol || '✦') + ' ' + _escapeHtml(r.name) + '</option>';
            }).join('');

            var infoIcon = _getIcon('CIRCLE_DOT');
            var iconDropdown = _getIconDropdown(type.icon || 'SHIELD', 'Select an icon');

            var modalContent =
                '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Government Type Name</label>' +
                '<input type="text" id="editGovTypeName" value="' + _escapeHtml(type.name) + '" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Description</label>' +
                '<textarea id="editGovTypeDesc" rows="2" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' + _escapeHtml(type.description || '') + '</textarea>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Icon</label>' +
                '<select id="editGovTypeIcon" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                iconDropdown +
                '</select>' +
                '<small style="font-size:0.55rem; color:var(--dim);">Optional: Icon for this government type</small>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Allowed Ranks</label>' +
                '<select id="editGovTypeRanks" multiple size="5" style="width:100%; height:120px; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                rankOptions +
                '</select>' +
                '<small style="font-size:0.55rem; color:var(--dim);">Hold Ctrl/Cmd to select multiple ranks.</small>' +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                infoIcon + ' Edit government type details.' +
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
                    var icon = document.getElementById('editGovTypeIcon').value || '';

                    var result = window.GovernmentCommands.updateGovernmentType(typeId, {
                        name: name,
                        description: description,
                        allowedRankIds: allowedRankIds,
                        icon: icon
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
                        _closeTopModal();
                        // Toast is shown by GovernmentCommands.updateGovernmentType
                        if (onSuccess) onSuccess(result);
                        _openingModal = false;
                        return true;
                    }
                    _showToast('Failed to update government type', 'error');
                    return false;
                },
                onCancel: function() {
                    _openingModal = false;
                }
            });

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 6. DELETE GOVERNMENT TYPE MODAL
    // =========================================================================

    function openDeleteGovernmentTypeModal(typeId, onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var type = window.GovernmentState.getGovernmentTypeById(typeId);
            if (!type) {
                _showToast('Government type not found', 'error');
                _openingModal = false;
                return;
            }

            var places = typeof window.getPlaces === 'function' ? window.getPlaces() : [];
            var usedBy = places.filter(function(p) { return p.governmentTypeId === typeId; });
            if (usedBy.length > 0) {
                var placeNames = usedBy.map(function(p) { return p.displayName || p.name || 'Unknown'; }).join(', ');
                _showToast('Cannot delete: Used by ' + usedBy.length + ' location(s): ' + placeNames, 'warning');
                _openingModal = false;
                return;
            }

            _confirmDialog('Delete government type "' + type.name + '"?', 'Delete Government Type', function() {
                var result = window.GovernmentCommands.deleteGovernmentType(typeId);
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
                    // Toast is shown by GovernmentCommands.deleteGovernmentType
                    if (onSuccess) onSuccess();
                    _openingModal = false;
                } else {
                    _showToast('Failed to delete government type', 'error');
                    _openingModal = false;
                }
            });

        } catch (e) {
            _openingModal = false;
            _showToast('Error opening delete modal', 'error');
        }
    }

    // =========================================================================
    // 7. GOVERNMENT ASSIGNMENT MODAL
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

            var governmentTypes = window.GovernmentState.getGovernmentTypes();
            var currentGovType = place.governmentTypeId ? window.GovernmentState.getGovernmentTypeById(place.governmentTypeId) : null;
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
                        if (typeof window.saveMasterData === 'function') {
                            window.saveMasterData(true);
                        }
                        if (typeof window.invalidateAccessorCaches === 'function') {
                            window.invalidateAccessorCaches();
                        }
                        _showToast('Government assigned to ' + place.displayName, 'success');
                        _closeTopModal();
                        if (onSuccess) onSuccess();
                    } else {
                        _showToast('assignGovernment not available', 'error');
                    }
                    return true;
                },
                onCancel: function() {
                    _openingModal = false;
                }
            });

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 8. DEPARTMENT MODALS
    // =========================================================================

    function openCreateGovernmentDepartmentModal(locationId, onSuccess) {
        if (_openingModal) {
            _showToast('Already processing a modal action', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var locationOptionsHtml = _buildLocationDropdown(locationId, 'Select a location', true);

            var departments = window.GovernmentState.getAllDepartments({ includeDeprecated: false });
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

                    var locationIdValue = document.getElementById('newDeptLocation').value;
                    if (!locationIdValue) {
                        _showToast('Location is required', 'error');
                        return false;
                    }

                    var result = window.GovernmentCommands.createDepartment({
                        name: name,
                        description: document.getElementById('newDeptDescription').value || '',
                        locationId: locationIdValue,
                        parentDepartmentId: document.getElementById('newDeptParent').value || null
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
                        _showToast('Department "' + name + '" created', 'success');
                        _closeTopModal();
                        if (onSuccess) onSuccess(result.id);
                        _openingModal = false;
                        return true;
                    }
                    return false;
                },
                onCancel: function() {
                    _openingModal = false;
                }
            });

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.openAddGovernmentTypeModal = openAddGovernmentTypeModal;
    window.openEditGovernmentTypeModal = openEditGovernmentTypeModal;
    window.openDeleteGovernmentTypeModal = openDeleteGovernmentTypeModal;
    window.openAssignGovernmentModal = openAssignGovernmentModal;
    window.openCreateGovernmentDepartmentModal = openCreateGovernmentDepartmentModal;

    // Keep legacy aliases but don't create duplicates
    if (typeof window._openAddGovernmentTypeModal === 'undefined') {
        window._openAddGovernmentTypeModal = openAddGovernmentTypeModal;
    }
    if (typeof window._openEditGovernmentTypeModal === 'undefined') {
        window._openEditGovernmentTypeModal = openEditGovernmentTypeModal;
    }
    if (typeof window._openDeleteGovernmentTypeModal === 'undefined') {
        window._openDeleteGovernmentTypeModal = openDeleteGovernmentTypeModal;
    }
    if (typeof window._openAssignGovernmentModal === 'undefined') {
        window._openAssignGovernmentModal = openAssignGovernmentModal;
    }
    if (typeof window._openCreateGovernmentDepartmentModal === 'undefined') {
        window._openCreateGovernmentDepartmentModal = openCreateGovernmentDepartmentModal;
    }

})();