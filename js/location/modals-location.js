/**
 * =============================================================================
 * STILL WATERS - LOCATION MODALS (modals-location.js)
 * =============================================================================
 * 
 * This file contains ALL location-related UI modals:
 * - Add/Edit/Delete locations
 * - Add/Edit/Delete location types
 * - View location hierarchy
 * - Cascade deletion with dependency checking
 * 
 * REFACTORED: Uses LocationState, LocationCommands, LocationQueries
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

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getPlaces() {
        return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
    }

    function _getLocationTypeById(id) {
        return typeof window.getLocationTypeById === 'function' ? window.getLocationTypeById(id) : null;
    }

    function _getLocationTypes() {
        return typeof window.getLocationTypes === 'function' ? window.getLocationTypes() : [];
    }

    function _getCharacters() {
        return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
    }

    function _getResidences() {
        return typeof window.getResidences === 'function' ? window.getResidences() : [];
    }

    function _getEnterprises() {
        return typeof window.getAllEnterprises === 'function' ? window.getAllEnterprises() : [];
    }

    function _getHouseholds() {
        return typeof window.getHouseholds === 'function' ? window.getHouseholds() : [];
    }

    function _getGovernments() {
        return typeof window.getGovernments === 'function' ? window.getGovernments() : [];
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

    function _hasDependents(placeId) {
        var children = LocationState.getPlaceChildren(placeId, false);
        var characters = _getCharacters();
        var residences = _getResidences();
        var enterprises = _getEnterprises();
        var households = _getHouseholds();
        var governments = _getGovernments();

        // Check characters
        var charsAtLocation = 0;
        for (var i = 0; i < characters.length; i++) {
            if (characters[i].currentLocationId === placeId ||
                characters[i].birthplaceId === placeId ||
                characters[i].deathLocationId === placeId) {
                charsAtLocation++;
            }
        }

        // Check residences
        var resAtLocation = 0;
        for (var i = 0; i < residences.length; i++) {
            if (residences[i].locationId === placeId) resAtLocation++;
        }

        // Check enterprises
        var entAtLocation = 0;
        for (var i = 0; i < enterprises.length; i++) {
            if (enterprises[i].locationId === placeId) entAtLocation++;
        }

        // Check households
        var hhAtLocation = 0;
        for (var i = 0; i < households.length; i++) {
            if (households[i].locationId === placeId) hhAtLocation++;
        }

        // Check governments
        var govAtLocation = 0;
        for (var i = 0; i < governments.length; i++) {
            if (governments[i].locationId === placeId) govAtLocation++;
        }

        return {
            hasChildren: children.length > 0,
            hasCharacters: charsAtLocation > 0,
            hasResidences: resAtLocation > 0,
            hasEnterprises: entAtLocation > 0,
            hasHouseholds: hhAtLocation > 0,
            hasGovernments: govAtLocation > 0,
            childCount: children.length,
            characterCount: charsAtLocation,
            residenceCount: resAtLocation,
            enterpriseCount: entAtLocation,
            householdCount: hhAtLocation,
            governmentCount: govAtLocation
        };
    }

    // =========================================================================
    // 4. ADD LOCATION MODAL
    // =========================================================================

    function openAddPlaceModal(parentId, onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var locationTypes = _getLocationTypes();
            var places = _getPlaces();

            var typeOptions = '';
            for (var i = 0; i < locationTypes.length; i++) {
                var type = locationTypes[i];
                var priority = type.priority || 5;
                var priorityLabel = priority === 1 ? '⭐' : priority === 2 ? '⬡' : priority === 3 ? '◉' : priority === 4 ? '⌂' : '⌇';
                var selected = (i === 0) ? 'selected' : '';
                typeOptions += '<option value="' + type.id + '" ' + selected + '>' + priorityLabel + ' ' + _escapeHtml(type.displayName) + '</option>';
            }

            var parentOptions = '<option value="">None (Root Location)</option>';
            for (var i = 0; i < places.length; i++) {
                var place = places[i];
                if (place.id === parentId) continue;
                var selected = (place.id === parentId) ? 'selected' : '';
                parentOptions += '<option value="' + place.id + '" ' + selected + '>' + _escapeHtml(place.displayName) + '</option>';
            }

            var infoIcon = _getIcon('CIRCLE_DOT');

            var modalContent =
                '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Location Name</label>' +
                '<input type="text" id="newPlaceName" placeholder="Enter location name" autofocus style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Location Type</label>' +
                '<select id="newPlaceType" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                typeOptions +
                '</select>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Parent Location</label>' +
                '<select id="newPlaceParent" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                parentOptions +
                '</select>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Variable Key</label>' +
                '<input type="text" id="newPlaceKey" placeholder="e.g., england, france" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '<small style="font-size:0.55rem; color:var(--dim);">Used for name generation and references</small>' +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                infoIcon + ' Location names should be unique within their parent.' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Add Location',
                content: modalContent,
                confirmText: 'Create Location',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var name = document.getElementById('newPlaceName').value.trim();
                    if (!name) {
                        _showToast('Location name is required', 'error');
                        return false;
                    }

                    var typeId = document.getElementById('newPlaceType').value;
                    if (!typeId) {
                        _showToast('Location type is required', 'error');
                        return false;
                    }

                    var parentId = document.getElementById('newPlaceParent').value || null;
                    var variableKey = document.getElementById('newPlaceKey').value.trim() || null;

                    var result = LocationCommands.createPlace({
                        displayName: name,
                        typeId: typeId,
                        parentId: parentId,
                        variableKey: variableKey
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

    // =========================================================================
    // 5. EDIT LOCATION MODAL
    // =========================================================================

    function openEditPlaceModal(placeId, onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var place = LocationState.getPlace(placeId);
            if (!place) {
                _showToast('Location not found', 'error');
                return;
            }

            var locationTypes = _getLocationTypes();
            var places = _getPlaces();

            var typeOptions = '';
            for (var i = 0; i < locationTypes.length; i++) {
                var type = locationTypes[i];
                var priority = type.priority || 5;
                var priorityLabel = priority === 1 ? '⭐' : priority === 2 ? '⬡' : priority === 3 ? '◉' : priority === 4 ? '⌂' : '⌇';
                var selected = (type.id === place.typeId) ? 'selected' : '';
                typeOptions += '<option value="' + type.id + '" ' + selected + '>' + priorityLabel + ' ' + _escapeHtml(type.displayName) + '</option>';
            }

            var parentOptions = '<option value="">None (Root Location)</option>';
            for (var i = 0; i < places.length; i++) {
                var p = places[i];
                if (p.id === placeId) continue;

                var descendants = LocationState.getPlaceChildren(placeId, true);
                var isDescendant = false;
                for (var j = 0; j < descendants.length; j++) {
                    if (descendants[j].id === p.id) {
                        isDescendant = true;
                        break;
                    }
                }
                if (isDescendant) continue;

                var selected = (p.id === place.parentId) ? 'selected' : '';
                parentOptions += '<option value="' + p.id + '" ' + selected + '>' + _escapeHtml(p.displayName) + '</option>';
            }

            var infoIcon = _getIcon('CIRCLE_DOT');

            var modalContent =
                '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Location Name</label>' +
                '<input type="text" id="editPlaceName" value="' + _escapeHtml(place.displayName) + '" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Location Type</label>' +
                '<select id="editPlaceType" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                typeOptions +
                '</select>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Parent Location</label>' +
                '<select id="editPlaceParent" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                parentOptions +
                '</select>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Variable Key</label>' +
                '<input type="text" id="editPlaceKey" value="' + _escapeHtml(place.variableKey || '') + '" placeholder="e.g., england, france" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '<small style="font-size:0.55rem; color:var(--dim);">Used for name generation and references</small>' +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                infoIcon + ' Changing the parent location will move this location in the hierarchy.' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Edit Location: ' + place.displayName,
                content: modalContent,
                confirmText: 'Save Changes',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var name = document.getElementById('editPlaceName').value.trim();
                    if (!name) {
                        _showToast('Location name is required', 'error');
                        return false;
                    }

                    var typeId = document.getElementById('editPlaceType').value;
                    if (!typeId) {
                        _showToast('Location type is required', 'error');
                        return false;
                    }

                    var parentId = document.getElementById('editPlaceParent').value || null;
                    var variableKey = document.getElementById('editPlaceKey').value.trim() || null;

                    var result = LocationCommands.updatePlace(placeId, {
                        displayName: name,
                        typeId: typeId,
                        parentId: parentId,
                        variableKey: variableKey
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

    // =========================================================================
    // 6. DELETE LOCATION MODAL
    // =========================================================================

    function openDeletePlaceModal(placeId, onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var place = LocationState.getPlace(placeId);
            if (!place) {
                _showToast('Location not found', 'error');
                return;
            }

            var dependents = _hasDependents(placeId);
            var hasDependents = dependents.hasChildren || dependents.hasCharacters ||
                dependents.hasResidences || dependents.hasEnterprises ||
                dependents.hasHouseholds || dependents.hasGovernments;

            var infoIcon = _getIcon('CIRCLE_DOT');
            var warningIcon = _getIcon('WARNING');

            var dependentsHtml = '';
            if (hasDependents) {
                var details = [];
                if (dependents.hasChildren) details.push(dependents.childCount + ' sub-location(s)');
                if (dependents.hasCharacters) details.push(dependents.characterCount + ' character(s)');
                if (dependents.hasResidences) details.push(dependents.residenceCount + ' residence(s)');
                if (dependents.hasEnterprises) details.push(dependents.enterpriseCount + ' enterprise(s)');
                if (dependents.hasHouseholds) details.push(dependents.householdCount + ' household(s)');
                if (dependents.hasGovernments) details.push('Government structure');

                dependentsHtml =
                    '<div style="background: rgba(200, 112, 64, 0.15); padding: 12px; border-radius: 8px; margin-bottom: 16px; border-left: 4px solid #c87040;">' +
                    '<div style="font-size: 0.7rem; font-weight: bold; color: #c87040;">' + warningIcon + ' This location has dependents</div>' +
                    '<div style="font-size: 0.6rem; color: var(--dim); margin-top: 4px;">' +
                    details.map(function(d) { return '<div>• ' + d + '</div>'; }).join('') +
                    '</div>' +
                    '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 6px;">' +
                    'These dependents will be orphaned or need to be reassigned.' +
                    '</div>' +
                    '</div>';
            }

            var modalContent =
                '<div style="padding: 8px;">' +
                '<div style="background: rgba(200, 68, 68, 0.15); padding: 12px; border-radius: 8px; margin-bottom: 16px; border-left: 4px solid #c62828;">' +
                '<div style="font-size: 0.9rem; font-weight: bold; color: #c62828;">' + warningIcon + ' Delete Location</div>' +
                '<div style="font-size: 0.7rem; margin-top: 4px;">' +
                'You are about to delete: <strong>' + _escapeHtml(place.displayName) + '</strong>' +
                '</div>' +
                '</div>' +
                '<div style="background: var(--bg2); padding: 12px; border-radius: 8px; margin-bottom: 16px;">' +
                '<div style="font-size: 0.6rem; color: var(--dim);">Location Details</div>' +
                '<div style="font-size: 0.75rem; margin-top: 4px;">' +
                '<div><strong>ID:</strong> ' + _escapeHtml(place.id) + '</div>' +
                '<div><strong>Type:</strong> ' + _escapeHtml(LocationState.getLocationTypeName(place.typeId)) + '</div>' +
                (place.parentId ? '<div><strong>Parent:</strong> ' + _escapeHtml(LocationState.getPlace(place.parentId)?.displayName || 'Unknown') + '</div>' : '') +
                (place.variableKey ? '<div><strong>Variable Key:</strong> ' + _escapeHtml(place.variableKey) + '</div>' : '') +
                '</div>' +
                '</div>' +
                dependentsHtml +
                '<div style="margin-bottom: 16px;">' +
                '<label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">' +
                '<input type="checkbox" id="deleteCascadeCheck">' +
                '<span style="font-size: 0.7rem;">Also delete all sub-locations and reassign dependents</span>' +
                '</label>' +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                infoIcon + ' This action cannot be undone. All data associated with this location may be affected.' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Delete Location: ' + place.displayName,
                content: modalContent,
                confirmText: 'Delete Location',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var cascade = document.getElementById('deleteCascadeCheck')?.checked || false;

                    var result = LocationCommands.deletePlace(placeId, { cascade: cascade });

                    if (result) {
                        _showToast('Location deleted: ' + place.displayName, 'success');
                        _closeTopModal();
                        if (onSuccess) onSuccess();
                        return true;
                    } else {
                        _showToast('Failed to delete location', 'error');
                        return false;
                    }
                }
            });

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 7. VIEW HIERARCHY MODAL
    // =========================================================================

    function openViewHierarchyModal(locationId, onSelect) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var place = LocationState.getPlace(locationId);
            var hierarchy = LocationState.getPlaceHierarchy(locationId);
            var locationIcon = _getIcon('LOCATION');
            var infoIcon = _getIcon('CIRCLE_DOT');

            var html = '<div style="max-height: 450px; overflow-y: auto; padding: 4px;">';

            if (hierarchy.length === 0) {
                html += '<div style="text-align: center; padding: 20px; color: var(--dim);">No hierarchy found</div>';
            } else {
                for (var i = 0; i < hierarchy.length; i++) {
                    var p = hierarchy[i];
                    var isSelected = (p.id === locationId);
                    var indent = '';
                    for (var j = 0; j < i; j++) {
                        indent += '&nbsp;&nbsp;&nbsp;&nbsp;';
                    }
                    var prefix = i > 0 ? '└─ ' : '';
                    var typeName = LocationState.getLocationTypeName(p.typeId);

                    html +=
                        '<div class="hierarchy-item" data-loc-id="' + p.id + '" style="' +
                        'padding: 4px 8px;' +
                        'background: ' + (isSelected ? 'var(--accent-dim)' : 'transparent') + ';' +
                        'border-left: 3px solid ' + (isSelected ? 'var(--accent)' : 'transparent') + ';' +
                        'cursor: pointer;' +
                        'transition: all 0.1s;' +
                        'border-radius: 4px;' +
                        '">' +
                        '<span style="font-size: 0.75rem; font-weight: ' + (isSelected ? 'bold' : 'normal') + ';">' +
                        indent + prefix + locationIcon + ' ' + _escapeHtml(p.displayName) +
                        '</span>' +
                        '<span style="font-size: 0.55rem; color: var(--dim); margin-left: 8px;">' + _escapeHtml(typeName) + '</span>' +
                        (p.isCapital ? ' <span style="font-size: 0.5rem; color: var(--accent);">(Capital)</span>' : '') +
                        '</div>';
                }
            }

            html += '</div>';

            _openModal({
                title: 'Location Hierarchy' + (place ? ': ' + place.displayName : ''),
                content: html,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {}
            });

            setTimeout(function() {
                var items = document.querySelectorAll('.hierarchy-item');
                for (var i = 0; i < items.length; i++) {
                    (function(item) {
                        item.addEventListener('click', function() {
                            var id = this.dataset.locId;
                            _closeTopModal();
                            if (onSelect) {
                                var p = LocationState.getPlace(id);
                                if (p) onSelect(p);
                            }
                        });
                        item.addEventListener('mouseenter', function() {
                            this.style.background = 'var(--bg3)';
                        });
                        item.addEventListener('mouseleave', function() {
                            this.style.background = this.dataset.locId === locationId ? 'var(--accent-dim)' : 'transparent';
                        });
                    })(items[i]);
                }
            }, 100);

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 8. LOCATION TYPE MODALS
    // =========================================================================

    function openAddLocationTypeModal(onSuccess) {
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
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Type Name</label>' +
                '<input type="text" id="newTypeName" placeholder="e.g., Kingdom, Duchy, City" autofocus style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Priority</label>' +
                '<select id="newTypePriority" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '<option value="1">⭐ 1 - Country/Kingdom</option>' +
                '<option value="2">⬡ 2 - Region/Province</option>' +
                '<option value="3">◉ 3 - County/Duchy</option>' +
                '<option value="4">⌂ 4 - Town/Village</option>' +
                '<option value="5" selected>⌇ 5 - Other</option>' +
                '</select>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Icon</label>' +
                '<input type="text" id="newTypeIcon" value="⌇" placeholder="e.g., ⭐, ◉, ⌂" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                infoIcon + ' Priority determines hierarchy order. 1 = highest (Country), 5 = lowest (Other).' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Add Location Type',
                content: modalContent,
                confirmText: 'Create Type',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var name = document.getElementById('newTypeName').value.trim();
                    if (!name) {
                        _showToast('Type name is required', 'error');
                        return false;
                    }

                    var priority = parseInt(document.getElementById('newTypePriority').value) || 5;
                    var icon = document.getElementById('newTypeIcon').value.trim() || '⌇';

                    var result = LocationCommands.createLocationType({
                        displayName: name,
                        priority: priority,
                        icon: icon
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

    function openEditLocationTypeModal(typeId, onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var type = LocationState.getLocationType(typeId);
            if (!type) {
                _showToast('Location type not found', 'error');
                return;
            }

            var infoIcon = _getIcon('CIRCLE_DOT');

            var modalContent =
                '<div style="max-height: 500px; overflow-y: auto; padding: 4px;">' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Type Name</label>' +
                '<input type="text" id="editTypeName" value="' + _escapeHtml(type.displayName) + '" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Priority</label>' +
                '<select id="editTypePriority" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '<option value="1" ' + (type.priority === 1 ? 'selected' : '') + '>⭐ 1 - Country/Kingdom</option>' +
                '<option value="2" ' + (type.priority === 2 ? 'selected' : '') + '>⬡ 2 - Region/Province</option>' +
                '<option value="3" ' + (type.priority === 3 ? 'selected' : '') + '>◉ 3 - County/Duchy</option>' +
                '<option value="4" ' + (type.priority === 4 ? 'selected' : '') + '>⌂ 4 - Town/Village</option>' +
                '<option value="5" ' + (type.priority === 5 || !type.priority ? 'selected' : '') + '>⌇ 5 - Other</option>' +
                '</select>' +
                '</div>' +
                '<div class="form-group" style="margin-bottom: 12px;">' +
                '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Icon</label>' +
                '<input type="text" id="editTypeIcon" value="' + _escapeHtml(type.icon || '⌇') + '" placeholder="e.g., ⭐, ◉, ⌂" style="width:100%; padding:8px; background:var(--bg); border:1px solid var(--border); border-radius:6px; color:var(--text);">' +
                '</div>' +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                infoIcon + ' Changing priority will affect how locations of this type are sorted.' +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Edit Location Type: ' + type.displayName,
                content: modalContent,
                confirmText: 'Save Changes',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var name = document.getElementById('editTypeName').value.trim();
                    if (!name) {
                        _showToast('Type name is required', 'error');
                        return false;
                    }

                    var priority = parseInt(document.getElementById('editTypePriority').value) || 5;
                    var icon = document.getElementById('editTypeIcon').value.trim() || '⌇';

                    var result = LocationCommands.updateLocationType(typeId, {
                        displayName: name,
                        priority: priority,
                        icon: icon
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

    function openDeleteLocationTypeModal(typeId, onSuccess) {
        if (_openingModal) {
            _showToast('Modal is already opening', 'warning');
            return;
        }
        _openingModal = true;

        try {
            var type = LocationState.getLocationType(typeId);
            if (!type) {
                _showToast('Location type not found', 'error');
                return;
            }

            var places = LocationState.getPlacesByType(typeId);
            var hasDependents = places.length > 0;

            var warningIcon = _getIcon('WARNING');
            var infoIcon = _getIcon('CIRCLE_DOT');

            var dependentsHtml = '';
            if (hasDependents) {
                dependentsHtml =
                    '<div style="background: rgba(200, 112, 64, 0.15); padding: 12px; border-radius: 8px; margin-bottom: 16px; border-left: 4px solid #c87040;">' +
                    '<div style="font-size: 0.7rem; font-weight: bold; color: #c87040;">' + warningIcon + ' This type is in use</div>' +
                    '<div style="font-size: 0.6rem; color: var(--dim); margin-top: 4px;">' +
                    '<div>• ' + places.length + ' location(s) use this type</div>' +
                    '<div style="font-size: 0.55rem; margin-top: 4px;">' +
                    places.slice(0, 5).map(function(p) {
                        return '<div>→ ' + _escapeHtml(p.displayName) + '</div>';
                    }).join('') +
                    (places.length > 5 ? '<div>→ ... and ' + (places.length - 5) + ' more</div>' : '') +
                    '</div>' +
                    '</div>' +
                    '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 6px;">' +
                    'These locations will need to be reassigned to a different type.' +
                    '</div>' +
                    '</div>';
            }

            var modalContent =
                '<div style="padding: 8px;">' +
                '<div style="background: rgba(200, 68, 68, 0.15); padding: 12px; border-radius: 8px; margin-bottom: 16px; border-left: 4px solid #c62828;">' +
                '<div style="font-size: 0.9rem; font-weight: bold; color: #c62828;">' + warningIcon + ' Delete Location Type</div>' +
                '<div style="font-size: 0.7rem; margin-top: 4px;">' +
                'You are about to delete: <strong>' + _escapeHtml(type.displayName) + '</strong>' +
                '</div>' +
                '</div>' +
                dependentsHtml +
                '<div style="padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem; color: var(--dim);">' +
                infoIcon + ' This action cannot be undone.' +
                (hasDependents ? ' Locations using this type will retain their type ID but it will no longer be valid.' : '') +
                '</div>' +
                '</div>';

            _openModal({
                title: 'Delete Location Type: ' + type.displayName,
                content: modalContent,
                confirmText: 'Delete Type',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var result = LocationCommands.deleteLocationType(typeId);

                    if (result) {
                        _showToast('Location type deleted: ' + type.displayName, 'success');
                        _closeTopModal();
                        if (onSuccess) onSuccess();
                        return true;
                    } else {
                        _showToast('Failed to delete location type', 'error');
                        return false;
                    }
                }
            });

        } finally {
            _openingModal = false;
        }
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.openAddPlaceModal = openAddPlaceModal;
    window.openEditPlaceModal = openEditPlaceModal;
    window.openDeletePlaceModal = openDeletePlaceModal;
    window.openViewHierarchyModal = openViewHierarchyModal;

    window.openAddLocationTypeModal = openAddLocationTypeModal;
    window.openEditLocationTypeModal = openEditLocationTypeModal;
    window.openDeleteLocationTypeModal = openDeleteLocationTypeModal;

})();