/**
 * =============================================================================
 * STILL WATERS - ROLES MODALS (modals-roles.js)
 * =============================================================================
 * 
 * LOCATION: js/core/modals/modals-roles.js
 * 
 * This file contains ALL role-specific UI modals.
 * This is the UI LAYER - it only handles rendering and user interaction.
 * All business logic is delegated to RoleCommands and RoleQueries.
 * 
 * ICON POLICY: NO EMOJIS - Use SVG icons from icons.js via _getIcon()
 * 
 * UPDATED:
 * - Uses RoleCommands and RoleQueries for all operations
 * - NO emojis - uses SVG icons from icons.js
 * - Uses unified character selector from modals-char-select.js
 * - Uses AGE_GROUPS from constants.js
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARDS
    // =========================================================================

    var _processingModal = false;

    // =========================================================================
    // 2. ICON HELPERS (using icons.js - NO EMOJIS)
    // =========================================================================

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        if (window.Icons && window.Icons.CIRCLE) {
            return window.Icons.CIRCLE;
        }
        return '<svg viewBox="0 0 20 20" width="1em" height="1em" style="display:inline-block;fill:currentColor;stroke:currentColor;vertical-align:middle;"><circle cx="10" cy="10" r="5.71" fill="currentColor"/></svg>';
    }

    function _getIconHTML(name, size) {
        var icon = _getIcon(name);
        if (!size) size = '1em';
        if (icon) {
            return icon.replace(/width="[^"]*"/, 'width="' + size + '"').replace(/height="[^"]*"/, 'height="' + size + '"');
        }
        return '';
    }

    // =========================================================================
    // 3. AGE GROUPS FROM CONSTANTS.JS
    // =========================================================================

    function _getAgeGroups() {
        if (window.AGE_GROUPS && Array.isArray(window.AGE_GROUPS)) {
            return window.AGE_GROUPS;
        }
        return ['0-10', '11-20', '21-30', '31-40', '41-50', '51-60', '61-70', '71-80', '81-90', '91+'];
    }

    function _getAgeGroupLabel(group) {
        if (window.AGE_GROUPS_MAP && window.AGE_GROUPS_MAP[group]) {
            return window.AGE_GROUPS_MAP[group].label;
        }
        return group + ' years';
    }

    // =========================================================================
    // 4. DEPENDENCY WRAPPERS
    // =========================================================================

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

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        return [];
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

    function _calculateAge(birthYear, isDeceased, deathYear) {
        if (typeof window.calculateAge === 'function') {
            return window.calculateAge(birthYear, isDeceased, deathYear);
        }
        var currentYear = _getCurrentYear();
        if (!birthYear) return 0;
        if (isDeceased && deathYear) return Math.max(0, deathYear - birthYear);
        return Math.max(0, currentYear - birthYear);
    }

    function _getCurrentLocation(character) {
        if (typeof window.getCurrentLocation === 'function') {
            return window.getCurrentLocation(character);
        }
        return 'Unknown';
    }

    function _getLocationTypeById(id) {
        if (typeof window.getLocationTypeById === 'function') {
            return window.getLocationTypeById(id);
        }
        return null;
    }

    function _getPlaces() {
        if (typeof window.getPlaces === 'function') {
            return window.getPlaces();
        }
        return [];
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
        }
        return null;
    }

    // =========================================================================
    // 5. CHARACTER SELECTOR
    // =========================================================================

    function _openCharacterSelectorForRoles(title, onSelect, options) {
        options = options || {};

        if (typeof window.openCharacterSelector === 'function') {
            window.openCharacterSelector({
                title: title || 'Select Character',
                targetId: options.targetId || null,
                onSelect: onSelect,
                filters: {
                    gender: options.gender || 'all',
                    status: options.status || 'all',
                    showDeceased: options.showDeceased || false,
                    location: options.locationFilter || 'all',
                    ageMin: options.ageMin || null,
                    ageMax: options.ageMax || null
                },
                preset: options.preset || null
            });
            return;
        }

        if (typeof window.openUnifiedCharacterSelector === 'function') {
            window.openUnifiedCharacterSelector({
                title: title || 'Select Character',
                targetId: options.targetId || null,
                onSelect: onSelect,
                filters: {
                    gender: options.gender || 'all',
                    status: options.status || 'all',
                    showDeceased: options.showDeceased || false,
                    location: options.locationFilter || 'all',
                    ageMin: options.ageMin || null,
                    ageMax: options.ageMax || null
                },
                preset: options.preset || null
            });
            return;
        }

        _showToast('Character selector not available', 'error');
    }

    // =========================================================================
    // 6. LOCATION DROPDOWN
    // =========================================================================

    function _getLocationOptions(selectedId, placeholderText, includeAll) {
        placeholderText = placeholderText || '-- Select a location --';
        includeAll = includeAll !== undefined ? includeAll : true;

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

    // =========================================================================
    // 7. ROLE COMMAND WRAPPERS
    // =========================================================================

    function _createRole(data) {
        if (typeof window.RoleCommands !== 'undefined') {
            return window.RoleCommands.createRole(data);
        }
        if (typeof window.createRole === 'function') {
            return window.createRole(data);
        }
        _showToast('Create role not available', 'error');
        return null;
    }

    function _updateRole(roleId, updates) {
        if (typeof window.RoleCommands !== 'undefined') {
            return window.RoleCommands.updateRole(roleId, updates);
        }
        if (typeof window.updateRole === 'function') {
            return window.updateRole(roleId, updates);
        }
        _showToast('Update role not available', 'error');
        return null;
    }

    function _deleteRole(roleId, removeFromCharacters) {
        if (typeof window.RoleCommands !== 'undefined') {
            return window.RoleCommands.deleteRole(roleId, removeFromCharacters);
        }
        if (typeof window.deleteRole === 'function') {
            return window.deleteRole(roleId, removeFromCharacters);
        }
        _showToast('Delete role not available', 'error');
        return false;
    }

    function _assignRoleToCharacter(characterId, roleId, options) {
        if (typeof window.RoleCommands !== 'undefined') {
            return window.RoleCommands.assignRoleToCharacter(characterId, roleId, options);
        }
        if (typeof window.assignRoleToCharacter === 'function') {
            return window.assignRoleToCharacter(characterId, roleId, options);
        }
        _showToast('Assign role not available', 'error');
        return { success: false };
    }

    function _updateCharacterSkill(characterId, roleId, skillLevel) {
        if (typeof window.RoleCommands !== 'undefined') {
            return window.RoleCommands.updateCharacterSkill(characterId, roleId, skillLevel);
        }
        if (typeof window.updateCharacterSkill === 'function') {
            return window.updateCharacterSkill(characterId, roleId, skillLevel);
        }
        _showToast('Update skill not available', 'error');
        return { success: false };
    }

    function _bulkAssignRole(characterIds, roleId, options) {
        if (typeof window.RoleCommands !== 'undefined') {
            return window.RoleCommands.bulkAssignRole(characterIds, roleId, options);
        }
        if (typeof window.bulkAssignRole === 'function') {
            return window.bulkAssignRole(characterIds, roleId, options);
        }
        _showToast('Bulk assign not available', 'error');
        return { success: 0, failed: 0, errors: [] };
    }

    // =========================================================================
    // 8. ROLE QUERY WRAPPERS
    // =========================================================================

    function _getAllRoles() {
        if (typeof window.RoleQueries !== 'undefined') {
            return window.RoleQueries.getRoles({});
        }
        if (typeof window.getRoles === 'function') {
            return window.getRoles();
        }
        return [];
    }

    function _getRole(id) {
        if (typeof window.RoleState !== 'undefined') {
            return window.RoleState.getRole(id);
        }
        if (typeof window.getRole === 'function') {
            return window.getRole(id);
        }
        return null;
    }

    function _getRoleStatistics(roleId) {
        if (typeof window.RoleQueries !== 'undefined') {
            return window.RoleQueries.getRoleStatistics(roleId);
        }
        if (typeof window.getRoleStatistics === 'function') {
            return window.getRoleStatistics(roleId);
        }
        return {};
    }

    function _getCharactersWithRoleDetails(roleId, mastersOnly) {
        if (typeof window.RoleQueries !== 'undefined') {
            return window.RoleQueries.getCharactersWithRoleDetails(roleId, mastersOnly);
        }
        if (typeof window.getCharactersWithRoleDetails === 'function') {
            return window.getCharactersWithRoleDetails(roleId, mastersOnly);
        }
        return [];
    }

    function _getCharactersWithRole(roleId, mastersOnly) {
        if (typeof window.RoleQueries !== 'undefined') {
            return window.RoleQueries.getCharactersWithRole(roleId, mastersOnly);
        }
        if (typeof window.getCharactersWithRole === 'function') {
            return window.getCharactersWithRole(roleId, mastersOnly);
        }
        return [];
    }

    function _getRoleCategories() {
        if (typeof window.RoleState !== 'undefined') {
            return window.RoleState.getCategories();
        }
        if (typeof window.getRoleCategories === 'function') {
            return window.getRoleCategories();
        }
        return {};
    }

    function _getRoleCategoryList() {
        if (typeof window.RoleQueries !== 'undefined') {
            return window.RoleQueries.getRoleCategoryList();
        }
        if (typeof window.getRoleCategoryList === 'function') {
            return window.getRoleCategoryList();
        }
        return [];
    }

    function _getSkillLevel(characterId, roleId) {
        if (typeof window.ApprenticeshipQueries !== 'undefined') {
            return window.ApprenticeshipQueries.getSkillLevel(characterId, roleId);
        }
        if (typeof window.getSkillLevel === 'function') {
            return window.getSkillLevel(characterId, roleId);
        }
        return 0;
    }

    function _getSkillLevelName(level) {
        if (typeof window.ApprenticeshipQueries !== 'undefined') {
            return window.ApprenticeshipQueries.getSkillLevelName(level);
        }
        if (typeof window.getSkillLevelName === 'function') {
            return window.getSkillLevelName(level);
        }
        if (level >= 91) return 'Master';
        if (level >= 76) return 'Expert';
        if (level >= 51) return 'Journeyman';
        if (level >= 26) return 'Apprentice';
        if (level >= 1) return 'Novice';
        return 'Untrained';
    }

    // =========================================================================
    // 9. CREATE ROLE MODAL
    // =========================================================================

    function openCreateRoleModal(onSuccess) {
        if (_processingModal) {
            return;
        }
        _processingModal = true;

        try {
            var categories = _getRoleCategories();
            var plusIcon = _getIcon('PLUS');
            var infoIcon = _getIcon('CIRCLE_DOT');

            var modalContent =
                '<div class="form-group" style="margin-bottom: 12px;">' +
                    '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Role Name *</label>' +
                    '<input type="text" id="newRoleName" placeholder="e.g., Blacksmith, Scribe, Alchemist" autofocus style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                    '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Category</label>' +
                    '<select id="newRoleCategory" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
                        Object.keys(categories).map(function(key) {
                            var cat = categories[key];
                            return '<option value="' + key + '">' + (cat.icon || '⌇') + ' ' + cat.name + '</option>';
                        }).join('') +
                    '</select>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                    '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Gender Restriction</label>' +
                    '<select id="newRoleGender" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
                        '<option value="both">Both Genders</option>' +
                        '<option value="male">Male Only</option>' +
                        '<option value="female">Female Only</option>' +
                    '</select>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                    '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Icon (monochrome)</label>' +
                    '<input type="text" id="newRoleIcon" value="◉" maxlength="2" style="width: 60px; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
                    '<small style="font-size: 0.55rem; color: var(--dim);">Single character (◉, ⌇, ⚔, ⌆)</small>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                    '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Specializations (comma-separated)</label>' +
                    '<input type="text" id="newRoleSpecs" placeholder="e.g., Surgery, Herbalism, Midwifery" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
                    '<small style="font-size: 0.55rem; color: var(--dim);">These can be taught/learned during apprenticeship</small>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                    '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Description (optional)</label>' +
                    '<textarea id="newRoleNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;"></textarea>' +
                '</div>' +

                '<div class="info-note" style="margin-top: 12px; padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.6rem;">' +
                    infoIcon + ' Roles can be taught at educational institutions. Characters can have multiple roles.' +
                '</div>';

            _openModal({
                title: plusIcon + ' Create New Role',
                content: modalContent,
                confirmText: 'Create Role',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var name = document.getElementById('newRoleName').value.trim();
                    if (!name) {
                        _showToast('Role name is required', 'error');
                        return;
                    }

                    var specsText = document.getElementById('newRoleSpecs').value;
                    var specializations = specsText ? specsText.split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s; }) : [];

                    var result = _createRole({
                        name: name,
                        category: document.getElementById('newRoleCategory').value,
                        icon: document.getElementById('newRoleIcon').value || '◉',
                        specializations: specializations,
                        notes: document.getElementById('newRoleNotes').value || '',
                        genderRestriction: document.getElementById('newRoleGender').value
                    });

                    if (result) {
                        _showToast('Role "' + name + '" created', 'success');
                        if (onSuccess) onSuccess(result.id);
                        _closeTopModal();
                    }
                }
            });

            setTimeout(function() {
                var nameInput = document.getElementById('newRoleName');
                if (nameInput) nameInput.focus();
            }, 100);

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 10. EDIT ROLE MODAL
    // =========================================================================

    function openEditRoleModal(roleId, onSuccess) {
        if (_processingModal) {
            return;
        }
        _processingModal = true;

        try {
            var role = _getRole(roleId);
            if (!role) {
                _showToast('Role not found', 'error');
                return;
            }

            var categories = _getRoleCategories();
            var editIcon = _getIcon('EDIT');
            var infoIcon = _getIcon('CIRCLE_DOT');
            var plusIcon = _getIcon('PLUS');
            var crossIcon = _getIcon('X_HEAVY');

            var modalContent =
                '<div class="form-group" style="margin-bottom: 12px;">' +
                    '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Role Name</label>' +
                    '<input type="text" id="editRoleName" value="' + _escapeHtml(role.name) + '" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                    '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Category</label>' +
                    '<select id="editRoleCategory" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
                        Object.keys(categories).map(function(key) {
                            var cat = categories[key];
                            var selected = (role.category === key) ? 'selected' : '';
                            return '<option value="' + key + '" ' + selected + '>' + (cat.icon || '⌇') + ' ' + cat.name + '</option>';
                        }).join('') +
                    '</select>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                    '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Gender Restriction</label>' +
                    '<select id="editRoleGender" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
                        '<option value="both" ' + (role.genderRestriction === 'both' ? 'selected' : '') + '>Both Genders</option>' +
                        '<option value="male" ' + (role.genderRestriction === 'male' ? 'selected' : '') + '>Male Only</option>' +
                        '<option value="female" ' + (role.genderRestriction === 'female' ? 'selected' : '') + '>Female Only</option>' +
                    '</select>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                    '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Icon</label>' +
                    '<input type="text" id="editRoleIcon" value="' + (role.icon || '◉') + '" maxlength="2" style="width: 60px; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                    '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Specializations</label>' +
                    '<div id="specsList" class="specs-list" style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;">' +
                        (role.specializations || []).map(function(spec, i) {
                            return '<span class="spec-item" style="display: inline-flex; align-items: center; gap: 4px; background: var(--bg3); padding: 4px 8px; border-radius: 16px;">' +
                                _escapeHtml(spec) +
                                '<button type="button" class="remove-spec" data-index="' + i + '" style="background: none; border: none; cursor: pointer; color: var(--dim);">' + crossIcon + '</button>' +
                            '</span>';
                        }).join('') || '<span class="no-specs" style="font-size: 0.7rem; color: var(--dim);">No specializations</span>' +
                    '</div>' +
                    '<div class="add-spec-row" style="display: flex; gap: 8px; margin-top: 4px;">' +
                        '<input type="text" id="newSpec" placeholder="New specialization..." style="flex: 1; padding: 6px 10px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
                        '<button type="button" id="addSpecBtn" class="btn small">' + plusIcon + ' Add</button>' +
                    '</div>' +
                    '<small style="font-size: 0.55rem; color: var(--dim);">Specializations can be taught during apprenticeship</small>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                    '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Description</label>' +
                    '<textarea id="editRoleNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' + _escapeHtml(role.notes || '') + '</textarea>' +
                '</div>';

            _openModal({
                title: editIcon + ' Edit Role: ' + role.name,
                content: modalContent,
                confirmText: 'Save Changes',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var newName = document.getElementById('editRoleName').value.trim();
                    if (!newName) {
                        _showToast('Role name is required', 'error');
                        return;
                    }

                    var specItems = document.querySelectorAll('.spec-item');
                    var specializations = [];
                    for (var i = 0; i < specItems.length; i++) {
                        var text = specItems[i].childNodes[0]?.textContent?.trim();
                        if (text) specializations.push(text);
                    }

                    var result = _updateRole(roleId, {
                        name: newName,
                        category: document.getElementById('editRoleCategory').value,
                        genderRestriction: document.getElementById('editRoleGender').value,
                        icon: document.getElementById('editRoleIcon').value || '◉',
                        specializations: specializations,
                        notes: document.getElementById('editRoleNotes').value
                    });

                    if (result) {
                        _showToast('Updated role: ' + newName, 'success');
                        if (onSuccess) onSuccess();
                        _closeTopModal();
                    }
                }
            });

            setTimeout(function() {
                var removeBtns = document.querySelectorAll('.remove-spec');
                for (var i = 0; i < removeBtns.length; i++) {
                    var btn = removeBtns[i];
                    btn.addEventListener('click', function() {
                        var idx = parseInt(this.dataset.index);
                        if (!isNaN(idx)) {
                            var specItem = this.closest('.spec-item');
                            if (specItem) specItem.remove();
                        }
                    });
                }

                var addSpecBtn = document.getElementById('addSpecBtn');
                if (addSpecBtn) {
                    addSpecBtn.addEventListener('click', function() {
                        var newSpec = document.getElementById('newSpec')?.value.trim();
                        if (newSpec) {
                            var specsList = document.getElementById('specsList');
                            var noSpecsSpan = specsList?.querySelector('.no-specs');
                            if (noSpecsSpan) noSpecsSpan.remove();

                            var specSpan = document.createElement('span');
                            specSpan.className = 'spec-item';
                            specSpan.style.cssText = 'display: inline-flex; align-items: center; gap: 4px; background: var(--bg3); padding: 4px 8px; border-radius: 16px;';
                            specSpan.innerHTML = _escapeHtml(newSpec) + ' <button type="button" class="remove-spec" style="background: none; border: none; cursor: pointer; color: var(--dim);">' + crossIcon + '</button>';

                            var removeBtn = specSpan.querySelector('.remove-spec');
                            removeBtn.addEventListener('click', function() { specSpan.remove(); });

                            specsList?.appendChild(specSpan);
                            document.getElementById('newSpec').value = '';
                        }
                    });
                }
            }, 50);

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 11. DELETE ROLE MODAL
    // =========================================================================

    function openDeleteRoleModal(roleId, onSuccess) {
        if (_processingModal) {
            return;
        }
        _processingModal = true;

        try {
            var role = _getRole(roleId);
            if (!role) {
                _showToast('Role not found', 'error');
                return;
            }

            var charactersWithRole = _getCharactersWithRole(roleId);
            var charCount = charactersWithRole.length;

            var warningIcon = _getIcon('WARNING');

            var warningMsg = charCount > 0 ?
                charCount + ' character(s) have this role.\n\nDeleting it will remove the role from those characters.\n\nThis action cannot be undone!' :
                'This action cannot be undone!';

            var modalContent =
                '<div style="background:rgba(200,68,68,0.15);border:1px solid var(--warn);border-radius:8px;padding:12px;margin-bottom:16px;">' +
                    '<strong>' + warningIcon + ' Warning: This action cannot be undone!</strong>' +
                    '<div style="margin-top:8px;">You are about to delete the role "<strong>' + _escapeHtml(role.name) + '</strong>".</div>' +
                    (charCount > 0 ? '<div style="margin-top:8px;">' + charCount + ' character(s) have this role</div>' : '') +
                '</div>' +

                '<div class="form-group" style="margin-bottom:12px;">' +
                    '<label style="display:flex;align-items:center;gap:8px;">' +
                        '<input type="checkbox" id="deleteRemoveFromCharacters" ' + (charCount > 0 ? 'checked' : '') + '>' +
                        '<span style="font-size:0.65rem;">Remove role from all characters</span>' +
                    '</label>' +
                    '<small style="font-size:0.5rem;color:var(--dim);">If unchecked, characters will keep the role in their data</small>' +
                '</div>' +

                '<div style="margin-top:12px;padding:8px;background:rgba(200,68,68,0.1);border-radius:6px;font-size:0.55rem;color:#8a3020;">' +
                    'This action cannot be undone. The role will be permanently removed.' +
                '</div>';

            _openModal({
                title: 'Delete Role: ' + role.name,
                content: modalContent,
                confirmText: 'Delete Permanently',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var removeFromCharacters = document.getElementById('deleteRemoveFromCharacters')?.checked !== false;

                    var success = _deleteRole(roleId, removeFromCharacters);

                    if (success) {
                        _showToast('Deleted "' + role.name + '"', 'info');
                        if (onSuccess) onSuccess();
                        _closeTopModal();
                    } else {
                        _showToast('Failed to delete role', 'error');
                    }
                }
            });

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 12. ASSIGN ROLE MODAL
    // =========================================================================

    function openAssignRoleModal(roleId, onSuccess) {
        if (_processingModal) {
            return;
        }
        _processingModal = true;

        try {
            var role = _getRole(roleId);
            if (!role) {
                _showToast('Role not found', 'error');
                return;
            }

            var allChars = _getCharacters();
            var selectedCharacterId = null;
            var selectedCharacterData = null;
            var searchTerm = '';
            var genderFilter = 'all';
            var locationFilter = 'all';

            var personIcon = _getIcon('PERSON');
            var locationIcon = _getIcon('LOCATION');
            var infoIcon = _getIcon('CIRCLE_DOT');

            var allLocations = new Set();
            for (var i = 0; i < allChars.length; i++) {
                var char = allChars[i];
                if (!char.isDeceased) {
                    var loc = _getCurrentLocation(char);
                    if (loc && loc !== 'Unknown') allLocations.add(loc);
                }
            }
            var locationOptions = Array.from(allLocations).sort();

            function getEligibleCharacters() {
                var eligible = allChars.filter(function(c) {
                    if (c.isDeceased) return false;

                    if (role.genderRestriction === 'male' && c.gender !== 'male') return false;
                    if (role.genderRestriction === 'female' && c.gender !== 'female') return false;

                    var hasRole = c.professions && c.professions.some(function(p) { return p.id === roleId; });
                    return !hasRole;
                });

                if (searchTerm) {
                    var searchLower = searchTerm.toLowerCase();
                    eligible = eligible.filter(function(c) {
                        return c.name.toLowerCase().indexOf(searchLower) !== -1 ||
                            (c.surname && c.surname.toLowerCase().indexOf(searchLower) !== -1);
                    });
                }

                if (genderFilter !== 'all') {
                    eligible = eligible.filter(function(c) { return c.gender === genderFilter; });
                }

                if (locationFilter !== 'all') {
                    eligible = eligible.filter(function(c) { return _getCurrentLocation(c) === locationFilter; });
                }

                eligible.sort(function(a, b) { return (a.birthYear || 9999) - (b.birthYear || 9999); });

                return eligible;
            }

            function renderCharacterList() {
                var eligible = getEligibleCharacters();

                if (eligible.length === 0) {
                    return '<div class="empty-state" style="text-align:center; padding:20px; color:var(--dim);">No characters match your filters</div>';
                }

                return eligible.map(function(c) {
                    var age = _calculateAge(c.birthYear, false, null);
                    var isSelected = selectedCharacterId === c.id;
                    var genderIcon = c.gender === 'male' ? '♂' : (c.gender === 'female' ? '♀' : '⚥');
                    var location = _getCurrentLocation(c);
                    var currentSkills = c.professions?.length || 0;

                    var professionsStr = '';
                    if (c.professions && c.professions.length > 0) {
                        var profNames = c.professions.slice(0, 2).map(function(p) { return p.name; });
                        if (c.professions.length > 2) profNames.push('...');
                        professionsStr = '<span style="font-size: 0.55rem; color: var(--accent-dim); margin-left: 6px;">⌇ ' + profNames.join(', ') + '</span>';
                    }

                    return '<div class="character-card" data-character-id="' + c.id + '" style="' +
                        'padding: 10px; ' +
                        'margin-bottom: 8px; ' +
                        'background: ' + (isSelected ? 'rgba(var(--accent-rgb), 0.2)' : 'var(--bg3)') + '; ' +
                        'border: 1px solid ' + (isSelected ? 'var(--accent)' : 'var(--border)') + '; ' +
                        'border-radius: 6px; ' +
                        'cursor: pointer;' +
                    '">' +
                        '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;">' +
                            '<div>' +
                                '<strong>' + _escapeHtml(c.name) + ' ' + _escapeHtml(c.surname || '') + '</strong>' +
                                '<span style="font-size: 0.6rem; color: var(--dim); margin-left: 6px;">' + genderIcon + ' ' + age + ' years</span>' +
                                professionsStr +
                            '</div>' +
                            '<div style="font-size: 0.55rem; color: var(--accent);">' +
                                locationIcon + ' ' + _escapeHtml(location) + ' · ' + currentSkills + ' role(s)' +
                            '</div>' +
                        '</div>' +
                    '</div>';
                }).join('');
            }

            function refreshCharacterList() {
                var container = document.getElementById('characterListContainer');
                if (container) container.innerHTML = renderCharacterList();

                document.querySelectorAll('.character-card').forEach(function(card) {
                    card.addEventListener('click', function() {
                        selectedCharacterId = this.dataset.characterId;
                        selectedCharacterData = _getCharacterById(selectedCharacterId);
                        refreshCharacterList();
                    });
                });
            }

            var modalContent =
                '<div style="margin-bottom: 16px; background: var(--bg2); padding: 12px; border-radius: 8px;">' +
                    '<strong>Assign Role: ' + _escapeHtml(role.name) + '</strong>' +
                    '<div style="font-size: 0.65rem; color: var(--dim); margin-top: 4px;">' +
                        'Select a character to receive this profession.' +
                        (role.genderRestriction !== 'both' ? ' (Restricted to: ' + role.genderRestriction + ')' : '') +
                    '</div>' +
                '</div>' +

                '<div style="display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;">' +
                    '<select id="genderFilter" style="flex:1; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.65rem;">' +
                        '<option value="all">All Genders</option>' +
                        '<option value="male">Male</option>' +
                        '<option value="female">Female</option>' +
                    '</select>' +

                    '<select id="locationFilter" style="flex:1; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 0.65rem;">' +
                        '<option value="all">' + locationIcon + ' All Locations</option>' +
                        locationOptions.map(function(loc) { return '<option value="' + _escapeHtml(loc) + '">' + locationIcon + ' ' + _escapeHtml(loc) + '</option>'; }).join('') +
                    '</select>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                    '<input type="text" id="characterSearch" placeholder="' + _getIcon('SEARCH') + ' Search characters..." style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
                '</div>' +

                '<div id="characterListContainer" style="max-height: 300px; overflow-y: auto;">' +
                    renderCharacterList() +
                '</div>' +

                '<div class="form-group" style="margin-top: 12px;">' +
                    '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Skill Level (0-100)</label>' +
                    '<input type="range" id="skillLevelSlider" min="0" max="100" value="10" step="1" style="width: 100%;">' +
                    '<div style="display: flex; justify-content: space-between; margin-top: 4px;">' +
                        '<span>0</span>' +
                        '<span id="skillLevelDisplay">10 (Novice)</span>' +
                        '<span>100</span>' +
                    '</div>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                    '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes (optional)</label>' +
                    '<textarea id="assignNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;" placeholder="How did they learn this role?"></textarea>' +
                '</div>';

            _openModal({
                title: 'Assign ' + role.name,
                content: modalContent,
                confirmText: 'Assign',
                cancelText: 'Cancel',
                onConfirm: function() {
                    if (!selectedCharacterId) {
                        _showToast('Please select a character', 'error');
                        return;
                    }

                    var skill = parseInt(document.getElementById('skillLevelSlider').value);
                    var notes = document.getElementById('assignNotes')?.value || '';
                    var character = _getCharacterById(selectedCharacterId);

                    var result = _assignRoleToCharacter(selectedCharacterId, roleId, {
                        skillLevel: skill,
                        startYear: _getCurrentYear(),
                        notes: notes || 'Assigned ' + role.name
                    });

                    if (result && result.success) {
                        _showToast((character?.name || 'Character') + ' now has ' + role.name + ' (' + skill + ')', 'success');
                        if (onSuccess) onSuccess();
                        _closeTopModal();
                    } else {
                        _showToast('Failed to assign role: ' + (result?.reason || 'Unknown error'), 'error');
                    }
                }
            });

            setTimeout(function() {
                var searchInput = document.getElementById('characterSearch');
                if (searchInput) {
                    searchInput.addEventListener('input', function(e) {
                        searchTerm = e.target.value;
                        refreshCharacterList();
                    });
                }

                var genderSelect = document.getElementById('genderFilter');
                if (genderSelect) {
                    genderSelect.addEventListener('change', function(e) {
                        genderFilter = e.target.value;
                        refreshCharacterList();
                    });
                }

                var locationSelect = document.getElementById('locationFilter');
                if (locationSelect) {
                    locationSelect.addEventListener('change', function(e) {
                        locationFilter = e.target.value;
                        refreshCharacterList();
                    });
                }

                var skillSlider = document.getElementById('skillLevelSlider');
                var skillDisplay = document.getElementById('skillLevelDisplay');
                if (skillSlider && skillDisplay) {
                    skillSlider.addEventListener('input', function() {
                        var val = parseInt(skillSlider.value);
                        skillDisplay.textContent = val + ' (' + _getSkillLevelName(val) + ')';
                    });
                }

                refreshCharacterList();
            }, 50);

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 13. BULK ASSIGN ROLE MODAL
    // =========================================================================

    function openBulkAssignRoleModal(roleId, onSuccess) {
        if (_processingModal) {
            return;
        }
        _processingModal = true;

        try {
            var role = _getRole(roleId);
            if (!role) {
                _showToast('Role not found', 'error');
                return;
            }

            var allChars = _getCharacters();
            var selectedCharacterIds = new Set();
            var searchTerm = '';
            var locationFilter = 'all';

            var infoIcon = _getIcon('CIRCLE_DOT');
            var checkIcon = _getIcon('CHECK_SIMPLE');
            var crossIcon = _getIcon('X_HEAVY');
            var locationIcon = _getIcon('LOCATION');

            var eligibleChars = allChars.filter(function(c) {
                if (c.isDeceased) return false;

                if (role.genderRestriction === 'male' && c.gender !== 'male') return false;
                if (role.genderRestriction === 'female' && c.gender !== 'female') return false;

                return !(c.professions && c.professions.some(function(p) { return p.id === roleId; }));
            });

            function renderCharacterList() {
                var filtered = eligibleChars.slice();

                if (searchTerm) {
                    var searchLower = searchTerm.toLowerCase();
                    filtered = filtered.filter(function(c) {
                        return c.name.toLowerCase().indexOf(searchLower) !== -1 ||
                            (c.surname && c.surname.toLowerCase().indexOf(searchLower) !== -1);
                    });
                }

                if (locationFilter !== 'all') {
                    filtered = filtered.filter(function(c) { return _getCurrentLocation(c) === locationFilter; });
                }

                filtered.sort(function(a, b) { return (a.birthYear || 9999) - (b.birthYear || 9999); });

                if (filtered.length === 0) {
                    return '<div style="text-align:center; padding:40px; color:var(--dim);">No eligible characters</div>';
                }

                return filtered.map(function(c) {
                    var isSelected = selectedCharacterIds.has(c.id);
                    var location = _getCurrentLocation(c);

                    return '<div class="bulk-character-item" data-char-id="' + c.id + '" style="' +
                        'background: ' + (isSelected ? 'rgba(var(--accent-rgb), 0.2)' : 'var(--bg3)') + ';' +
                        'border: 1px solid ' + (isSelected ? 'var(--accent)' : 'var(--border)') + ';' +
                        'border-radius: 6px;' +
                        'padding: 8px 12px;' +
                        'margin-bottom: 6px;' +
                        'cursor: pointer;' +
                        'display: flex;' +
                        'align-items: center;' +
                        'gap: 12px;' +
                    '">' +
                        '<input type="checkbox" class="bulk-checkbox" data-char-id="' + c.id + '" ' + (isSelected ? 'checked' : '') + ' style="width: 16px; height: 16px; cursor: pointer;">' +
                        '<div style="flex: 1;">' +
                            '<strong>' + _escapeHtml(c.name) + ' ' + _escapeHtml(c.surname || '') + '</strong>' +
                            '<span style="font-size: 0.55rem; color: var(--dim); margin-left: 8px;">' + locationIcon + ' ' + _escapeHtml(location) + '</span>' +
                        '</div>' +
                    '</div>';
                }).join('');
            }

            function refreshCharacterList() {
                var container = document.getElementById('bulkCharacterList');
                if (container) container.innerHTML = renderCharacterList();

                document.querySelectorAll('.bulk-character-item').forEach(function(item) {
                    var checkbox = item.querySelector('.bulk-checkbox');
                    var charId = item.dataset.charId;

                    item.addEventListener('click', function(e) {
                        if (e.target.type !== 'checkbox') {
                            checkbox.checked = !checkbox.checked;
                        }
                        if (checkbox.checked) {
                            selectedCharacterIds.add(charId);
                        } else {
                            selectedCharacterIds.delete(charId);
                        }
                        refreshCharacterList();
                        var infoNote = document.querySelector('.selected-count');
                        if (infoNote) infoNote.textContent = '⌇ ' + selectedCharacterIds.size + ' character(s) selected';
                    });

                    if (checkbox) {
                        checkbox.addEventListener('change', function() {
                            if (checkbox.checked) {
                                selectedCharacterIds.add(charId);
                            } else {
                                selectedCharacterIds.delete(charId);
                            }
                            refreshCharacterList();
                            var infoNote = document.querySelector('.selected-count');
                            if (infoNote) infoNote.textContent = '⌇ ' + selectedCharacterIds.size + ' character(s) selected';
                        });
                    }
                });
            }

            var locationOptions = ['all'];
            for (var i = 0; i < eligibleChars.length; i++) {
                var loc = _getCurrentLocation(eligibleChars[i]);
                if (loc && loc !== 'Unknown' && locationOptions.indexOf(loc) === -1) {
                    locationOptions.push(loc);
                }
            }

            var modalContent =
                '<div style="margin-bottom: 16px; background: var(--bg2); padding: 12px; border-radius: 8px;">' +
                    '<strong>Bulk Assign: ' + _escapeHtml(role.name) + '</strong>' +
                    '<div style="font-size: 0.65rem; color: var(--dim); margin-top: 4px;">' +
                        'Select multiple characters to assign this role. ' + eligibleChars.length + ' characters eligible.' +
                    '</div>' +
                '</div>' +

                '<div style="display: flex; gap: 8px; margin-bottom: 12px;">' +
                    '<input type="text" id="bulkSearch" placeholder="' + _getIcon('SEARCH') + ' Search..." style="flex: 2; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
                    '<select id="bulkLocationFilter" style="flex: 1; padding: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
                        locationOptions.map(function(loc) { return '<option value="' + loc + '">' + locationIcon + ' ' + (loc === 'all' ? 'All Locations' : _escapeHtml(loc)) + '</option>'; }).join('') +
                    '</select>' +
                '</div>' +

                '<div class="action-buttons" style="margin-bottom: 12px; display: flex; gap: 8px;">' +
                    '<button id="selectAllBtn" class="btn small">' + checkIcon + ' Select All</button>' +
                    '<button id="selectNoneBtn" class="btn small">' + crossIcon + ' Select None</button>' +
                '</div>' +

                '<div id="bulkCharacterList" style="max-height: 350px; overflow-y: auto;">' +
                    renderCharacterList() +
                '</div>' +

                '<div class="form-group" style="margin-top: 12px;">' +
                    '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Skill Level (0-100)</label>' +
                    '<input type="range" id="bulkSkillLevel" min="0" max="100" value="10" step="1" style="width: 100%;">' +
                    '<div id="bulkSkillDisplay" style="text-align: center; font-size: 0.6rem; margin-top: 4px;">10 (Novice)</div>' +
                '</div>' +

                '<div class="info-note selected-count" style="margin-top: 12px; padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.6rem;">' +
                    infoIcon + ' 0 character(s) selected' +
                '</div>';

            _openModal({
                title: 'Bulk Assign ' + role.name,
                content: modalContent,
                confirmText: 'Assign to Selected',
                cancelText: 'Cancel',
                onConfirm: function() {
                    if (selectedCharacterIds.size === 0) {
                        _showToast('No characters selected', 'error');
                        return;
                    }

                    var skill = parseInt(document.getElementById('bulkSkillLevel').value);
                    var currentYear = _getCurrentYear();

                    var charIds = Array.from(selectedCharacterIds);
                    var result = _bulkAssignRole(charIds, roleId, {
                        skillLevel: skill,
                        startYear: currentYear,
                        notes: 'Bulk assigned ' + role.name
                    });

                    if (result.success > 0) {
                        _showToast('Assigned ' + role.name + ' to ' + result.success + ' character(s)', 'success');
                        if (onSuccess) onSuccess();
                        _closeTopModal();
                    } else {
                        _showToast('Failed to assign roles', 'error');
                    }
                }
            });

            setTimeout(function() {
                var searchInput = document.getElementById('bulkSearch');
                if (searchInput) {
                    searchInput.addEventListener('input', function(e) {
                        searchTerm = e.target.value;
                        refreshCharacterList();
                    });
                }

                var locationSelect = document.getElementById('bulkLocationFilter');
                if (locationSelect) {
                    locationSelect.addEventListener('change', function(e) {
                        locationFilter = e.target.value;
                        refreshCharacterList();
                    });
                }

                var selectAllBtn = document.getElementById('selectAllBtn');
                if (selectAllBtn) {
                    selectAllBtn.onclick = function() {
                        eligibleChars.forEach(function(c) { selectedCharacterIds.add(c.id); });
                        refreshCharacterList();
                        var infoNote = document.querySelector('.selected-count');
                        if (infoNote) infoNote.textContent = '⌇ ' + selectedCharacterIds.size + ' character(s) selected';
                    };
                }

                var selectNoneBtn = document.getElementById('selectNoneBtn');
                if (selectNoneBtn) {
                    selectNoneBtn.onclick = function() {
                        selectedCharacterIds.clear();
                        refreshCharacterList();
                        var infoNote = document.querySelector('.selected-count');
                        if (infoNote) infoNote.textContent = '⌇ 0 character(s) selected';
                    };
                }

                var skillSlider = document.getElementById('bulkSkillLevel');
                var skillDisplay = document.getElementById('bulkSkillDisplay');
                if (skillSlider && skillDisplay) {
                    skillSlider.oninput = function() {
                        var val = parseInt(skillSlider.value);
                        skillDisplay.textContent = val + ' (' + _getSkillLevelName(val) + ')';
                    };
                }

                refreshCharacterList();
            }, 50);

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 14. VIEW CHARACTERS WITH ROLE MODAL
    // =========================================================================

    function openViewCharactersWithRoleModal(roleId, onRefresh) {
        if (_processingModal) {
            return;
        }
        _processingModal = true;

        try {
            var role = _getRole(roleId);
            if (!role) {
                _showToast('Role not found', 'error');
                return;
            }

            var charDetails = _getCharactersWithRoleDetails(roleId);

            var personIcon = _getIcon('PERSON');
            var locationIcon = _getIcon('LOCATION');
            var editIcon = _getIcon('EDIT');

            if (charDetails.length === 0) {
                _showToast('No characters have the role "' + role.name + '"', 'info');
                return;
            }

            var charsHtml =
                '<div style="max-height: 500px; overflow-y: auto;">' +
                    '<div style="margin-bottom: 12px; background: var(--bg2); padding: 10px; border-radius: 8px;">' +
                        '<strong>' + (role.icon || '◉') + ' ' + _escapeHtml(role.name) + '</strong>' +
                        '<span style="font-size: 0.6rem; color: var(--dim); margin-left: 8px;">' + charDetails.length + ' character(s)</span>' +
                        '<div style="font-size: 0.55rem; color: var(--accent); margin-top: 4px;">Click Edit Skill to modify skill level</div>' +
                    '</div>';

            for (var i = 0; i < charDetails.length; i++) {
                var cd = charDetails[i];
                var location = _getCurrentLocation(cd.character);
                charsHtml +=
                    '<div style="background: var(--bg3); border: 1px solid var(--border); border-radius: 6px; margin-bottom: 6px; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">' +
                        '<div>' +
                            '<strong>' + personIcon + ' ' + _escapeHtml(cd.character.name) + ' ' + _escapeHtml(cd.character.surname || '') + '</strong>' +
                            '<span style="font-size: 0.55rem; color: var(--dim); margin-left: 8px;">' + (cd.character.gender === 'male' ? '♂' : '♀') + '</span>' +
                            '<span style="font-size: 0.55rem; color: var(--dim); margin-left: 8px;">' + locationIcon + ' ' + _escapeHtml(location) + '</span>' +
                        '</div>' +
                        '<div>' +
                            '<span style="background: var(--bg2); padding: 2px 8px; border-radius: 12px; font-size: 0.6rem;">' +
                                cd.skillLevel + ' (' + cd.skillTier + ')' +
                            '</span>' +
                        '</div>' +
                        '<div>' +
                            '<button class="edit-skill-btn" data-char-id="' + cd.character.id + '" data-role-id="' + roleId + '" style="' +
                                'background: var(--accent-dim);' +
                                'border: none;' +
                                'padding: 4px 12px;' +
                                'border-radius: 6px;' +
                                'cursor: pointer;' +
                                'font-size: 0.6rem;' +
                            '">' + editIcon + ' Edit Skill</button>' +
                        '</div>' +
                    '</div>';
            }

            charsHtml += '</div>';

            _openModal({
                title: 'Characters with ' + role.name,
                content: charsHtml,
                confirmText: 'Close',
                cancelText: ''
            });

            setTimeout(function() {
                document.querySelectorAll('.edit-skill-btn').forEach(function(btn) {
                    btn.onclick = function() {
                        var charId = this.dataset.charId;
                        var roleIdParam = this.dataset.roleId;
                        _closeTopModal();
                        setTimeout(function() {
                            openEditRoleSkillModal(roleIdParam, charId, function() {
                                if (onRefresh) onRefresh();
                                openViewCharactersWithRoleModal(roleIdParam, onRefresh);
                            });
                        }, 100);
                    };
                });
            }, 100);

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 15. EDIT ROLE SKILL MODAL
    // =========================================================================

    function openEditRoleSkillModal(roleId, characterId, onSuccess) {
        if (_processingModal) {
            return;
        }
        _processingModal = true;

        try {
            var role = _getRole(roleId);
            var character = _getCharacterById(characterId);

            if (!role || !character) {
                _showToast('Role or character not found', 'error');
                return;
            }

            var currentSkill = _getSkillLevel(characterId, roleId);
            var infoIcon = _getIcon('CIRCLE_DOT');
            var editIcon = _getIcon('EDIT');

            var modalContent =
                '<div style="margin-bottom: 16px; background: var(--bg2); padding: 12px; border-radius: 8px;">' +
                    '<div><strong>' + _escapeHtml(character.name) + ' ' + _escapeHtml(character.surname || '') + '</strong></div>' +
                    '<div>Role: ' + _escapeHtml(role.name) + '</div>' +
                    '<div>Current Skill: ' + currentSkill + ' (' + _getSkillLevelName(currentSkill) + ')</div>' +
                '</div>' +

                '<div class="form-group" style="margin-bottom: 12px;">' +
                    '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Skill Level (0-100)</label>' +
                    '<input type="range" id="skillLevelSlider" min="0" max="100" value="' + currentSkill + '" step="1" style="width: 100%;">' +
                    '<div style="display: flex; justify-content: space-between; margin-top: 4px;">' +
                        '<span>0</span>' +
                        '<span id="skillLevelDisplay">' + currentSkill + ' (' + _getSkillLevelName(currentSkill) + ')</span>' +
                        '<span>100</span>' +
                    '</div>' +
                '</div>' +

                '<div class="action-buttons" style="display: flex; gap: 8px; margin-top: 16px;">' +
                    '<button id="setMasterBtn" class="btn" style="background: #c8a844; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer;">Set Master (91+)</button>' +
                    '<button id="setExpertBtn" class="btn" style="background: #4a9060; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer;">Set Expert (76)</button>' +
                    '<button id="setJourneymanBtn" class="btn" style="background: #c87040; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer;">Set Journeyman (51)</button>' +
                '</div>';

            _openModal({
                title: editIcon + ' Edit ' + role.name + ' Skill',
                content: modalContent,
                confirmText: 'Save',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var newSkill = parseInt(document.getElementById('skillLevelSlider').value);
                    var result = _updateCharacterSkill(characterId, roleId, newSkill);

                    if (result && result.success) {
                        _showToast(character.name + '\'s ' + role.name + ' → ' + newSkill + ' (' + _getSkillLevelName(newSkill) + ')', 'success');
                        if (onSuccess) onSuccess();
                        _closeTopModal();
                    } else {
                        _showToast('Failed to update skill', 'error');
                    }
                }
            });

            setTimeout(function() {
                var slider = document.getElementById('skillLevelSlider');
                var display = document.getElementById('skillLevelDisplay');
                if (slider && display) {
                    slider.oninput = function() {
                        var val = parseInt(slider.value);
                        display.textContent = val + ' (' + _getSkillLevelName(val) + ')';
                    };
                }

                var masterBtn = document.getElementById('setMasterBtn');
                if (masterBtn) {
                    masterBtn.onclick = function() {
                        slider.value = 91;
                        display.textContent = '91 (' + _getSkillLevelName(91) + ')';
                    };
                }

                var expertBtn = document.getElementById('setExpertBtn');
                if (expertBtn) {
                    expertBtn.onclick = function() {
                        slider.value = 76;
                        display.textContent = '76 (' + _getSkillLevelName(76) + ')';
                    };
                }

                var journeymanBtn = document.getElementById('setJourneymanBtn');
                if (journeymanBtn) {
                    journeymanBtn.onclick = function() {
                        slider.value = 51;
                        display.textContent = '51 (' + _getSkillLevelName(51) + ')';
                    };
                }
            }, 50);

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 16. LIST ROLES MODAL
    // =========================================================================

    function openListRolesModal(onSelectRole) {
        if (_processingModal) {
            return;
        }
        _processingModal = true;

        try {
            var allRoles = _getAllRoles();
            var searchTerm = '';
            var categoryFilter = 'all';

            var searchIcon = _getIcon('SEARCH');
            var infoIcon = _getIcon('CIRCLE_DOT');
            var personIcon = _getIcon('PERSON');
            var plusIcon = _getIcon('PLUS');

            var categories = _getRoleCategoryList();

            function getFilteredRoles() {
                var filtered = allRoles.slice();

                if (searchTerm) {
                    var searchLower = searchTerm.toLowerCase();
                    filtered = filtered.filter(function(r) {
                        return r.name.toLowerCase().indexOf(searchLower) !== -1;
                    });
                }

                if (categoryFilter !== 'all') {
                    filtered = filtered.filter(function(r) { return r.category === categoryFilter; });
                }

                filtered.sort(function(a, b) { return a.name.localeCompare(b.name); });
                return filtered;
            }

            function renderRoleList() {
                var filtered = getFilteredRoles();

                if (filtered.length === 0) {
                    return '<div style="text-align:center; padding:40px; color:var(--dim);">No roles found</div>';
                }

                return filtered.map(function(role) {
                    var charCount = 0;
                    var characters = _getCharacters();
                    for (var i = 0; i < characters.length; i++) {
                        var char = characters[i];
                        if (char.professions && char.professions.some(function(p) { return p.id === role.id; })) {
                            charCount++;
                        }
                    }

                    return '<div class="role-item" data-role-id="' + role.id + '" style="' +
                        'background: var(--bg3);' +
                        'border: 1px solid var(--border);' +
                        'border-radius: 8px;' +
                        'padding: 10px 12px;' +
                        'margin-bottom: 8px;' +
                        'cursor: pointer;' +
                        'transition: all 0.2s;' +
                    '">' +
                        '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">' +
                            '<div>' +
                                '<strong>' + (role.icon || '◉') + ' ' + _escapeHtml(role.name) + '</strong>' +
                                '<span style="font-size: 0.55rem; color: var(--dim); margin-left: 8px;">' + (role.category || 'uncategorized') + '</span>' +
                            '</div>' +
                            '<div style="font-size: 0.6rem; color: var(--accent);">' +
                                personIcon + ' ' + charCount + ' character(s)' +
                            '</div>' +
                        '</div>' +
                        (role.notes ? '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 6px;">⌇ ' + _escapeHtml(role.notes) + '</div>' : '') +
                    '</div>';
                }).join('');
            }

            function refreshRoleList() {
                var container = document.getElementById('roleListContainer');
                if (container) container.innerHTML = renderRoleList();

                document.querySelectorAll('.role-item').forEach(function(item) {
                    item.addEventListener('click', function() {
                        var roleId = this.dataset.roleId;
                        if (onSelectRole) {
                            onSelectRole(roleId);
                            _closeTopModal();
                        }
                    });
                });
            }

            var categoryOptions = '<option value="all">All Categories</option>' +
                categories.map(function(cat) {
                    return '<option value="' + cat.id + '" ' + (categoryFilter === cat.id ? 'selected' : '') + '>' + (cat.icon || '⌇') + ' ' + cat.name + '</option>';
                }).join('');

            var modalContent =
                '<div style="margin-bottom: 12px;">' +
                    '<input type="text" id="roleSearch" placeholder="' + searchIcon + ' Search roles..." style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
                '</div>' +

                '<div style="margin-bottom: 12px;">' +
                    '<select id="categoryFilter" style="width: 100%; padding: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;">' +
                        categoryOptions +
                    '</select>' +
                '</div>' +

                '<div id="roleListContainer" style="max-height: 400px; overflow-y: auto;">' +
                    renderRoleList() +
                '</div>' +

                '<div class="action-buttons" style="margin-top: 16px; display: flex; gap: 8px;">' +
                    '<button id="createNewRoleBtn" class="btn primary" style="flex: 1;">' + plusIcon + ' Create New Role</button>' +
                '</div>';

            _openModal({
                title: 'Browse Roles',
                content: modalContent,
                confirmText: 'Close',
                cancelText: ''
            });

            setTimeout(function() {
                var searchInput = document.getElementById('roleSearch');
                if (searchInput) {
                    searchInput.addEventListener('input', function(e) {
                        searchTerm = e.target.value;
                        refreshRoleList();
                    });
                }

                var categorySelect = document.getElementById('categoryFilter');
                if (categorySelect) {
                    categorySelect.addEventListener('change', function(e) {
                        categoryFilter = e.target.value;
                        refreshRoleList();
                    });
                }

                var createBtn = document.getElementById('createNewRoleBtn');
                if (createBtn) {
                    createBtn.onclick = function() {
                        _closeTopModal();
                        setTimeout(function() {
                            openCreateRoleModal(function(newRoleId) {
                                if (onSelectRole) onSelectRole(newRoleId);
                            });
                        }, 100);
                    };
                }

                refreshRoleList();
            }, 50);

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 17. CATEGORY MANAGER MODAL
    // =========================================================================

    function openCategoryManagerModal(onComplete) {
        if (_processingModal) {
            return;
        }
        _processingModal = true;

        try {
            var categories = _getRoleCategories();
            var infoIcon = _getIcon('CIRCLE_DOT');
            var editIcon = _getIcon('EDIT');
            var crossIcon = _getIcon('X_HEAVY');
            var plusIcon = _getIcon('PLUS');

            var modalContent =
                '<div class="category-manager">' +
                    '<div style="margin-bottom: 16px;">' +
                        '<button id="addCategoryBtn" class="btn small">' + plusIcon + ' Add Category</button>' +
                    '</div>' +
                    '<div id="categoriesList" style="max-height: 400px; overflow-y: auto;">' +
                        Object.keys(categories).filter(function(key) { return key !== 'uncategorized'; }).map(function(key) {
                            var cat = categories[key];
                            return '<div class="category-item" style="display: flex; justify-content: space-between; align-items: center; padding: 8px; border-bottom: 1px solid var(--border);">' +
                                '<div>' +
                                    '<span style="font-size: 1.2rem;">' + (cat.icon || '⌇') + '</span>' +
                                    '<strong>' + _escapeHtml(cat.name) + '</strong>' +
                                    '<span style="font-size: 0.7rem; color: var(--dim);">(' + key + ')</span>' +
                                '</div>' +
                                '<div>' +
                                    '<button class="btn small edit-category-btn" data-category-id="' + key + '">' + editIcon + '</button>' +
                                    '<button class="btn small danger delete-category-btn" data-category-id="' + key + '">' + crossIcon + '</button>' +
                                '</div>' +
                            '</div>';
                        }).join('') +
                    '</div>' +
                    '<div class="info-note" style="margin-top: 16px; font-size: 0.6rem; color: var(--dim);">' +
                        infoIcon + ' Categories help organize roles. Deleting a category moves roles to "Uncategorized".' +
                    '</div>' +
                '</div>';

            _openModal({
                title: 'Manage Role Categories',
                content: modalContent,
                confirmText: 'Close',
                onConfirm: function() {
                    if (onComplete) onComplete();
                }
            });

            setTimeout(function() {
                var addBtn = document.getElementById('addCategoryBtn');
                if (addBtn) {
                    addBtn.addEventListener('click', function() {
                        var newId = prompt('Category ID (e.g., "agriculture"):');
                        if (!newId) return;
                        var newName = prompt('Category Display Name:');
                        if (!newName) return;
                        var newIcon = prompt('Category Icon (monochrome):', '⌇');

                        if (typeof window.addCategory === 'function') {
                            window.addCategory(newId, newName, newIcon || '⌇');
                        } else if (typeof window.RoleCommands !== 'undefined') {
                            window.RoleCommands.addCategory(newId, newName, newIcon || '⌇');
                        }
                        _closeTopModal();
                        setTimeout(function() { openCategoryManagerModal(onComplete); }, 100);
                    });
                }

                var editBtns = document.querySelectorAll('.edit-category-btn');
                for (var i = 0; i < editBtns.length; i++) {
                    var btn = editBtns[i];
                    btn.addEventListener('click', function() {
                        var catId = this.dataset.categoryId;
                        var cat = categories[catId];
                        if (!cat) return;
                        var newName = prompt('New category name:', cat.name);
                        if (newName && typeof window.updateCategory === 'function') {
                            window.updateCategory(catId, { name: newName });
                        } else if (newName && typeof window.RoleCommands !== 'undefined') {
                            window.RoleCommands.updateCategory(catId, { name: newName });
                        }
                        var newIcon = prompt('New icon (monochrome):', cat.icon || '⌇');
                        if (newIcon && typeof window.updateCategory === 'function') {
                            window.updateCategory(catId, { icon: newIcon });
                        } else if (newIcon && typeof window.RoleCommands !== 'undefined') {
                            window.RoleCommands.updateCategory(catId, { icon: newIcon });
                        }
                        _closeTopModal();
                        setTimeout(function() { openCategoryManagerModal(onComplete); }, 100);
                    });
                }

                var deleteBtns = document.querySelectorAll('.delete-category-btn');
                for (var i = 0; i < deleteBtns.length; i++) {
                    var btn = deleteBtns[i];
                    btn.addEventListener('click', function() {
                        var catId = this.dataset.categoryId;
                        if (catId && confirm('Delete category "' + categories[catId]?.name + '"? Roles will become "Uncategorized".')) {
                            if (typeof window.deleteCategory === 'function') {
                                window.deleteCategory(catId);
                            } else if (typeof window.RoleCommands !== 'undefined') {
                                window.RoleCommands.deleteCategory(catId);
                            }
                            _closeTopModal();
                            setTimeout(function() { openCategoryManagerModal(onComplete); }, 100);
                        }
                    });
                }
            }, 100);

        } finally {
            _processingModal = false;
        }
    }

    // =========================================================================
    // 18. EXPORTS
    // =========================================================================

    window.openCreateRoleModal = openCreateRoleModal;
    window.openEditRoleModal = openEditRoleModal;
    window.openDeleteRoleModal = openDeleteRoleModal;
    window.openAssignRoleModal = openAssignRoleModal;
    window.openBulkAssignRoleModal = openBulkAssignRoleModal;
    window.openViewCharactersWithRoleModal = openViewCharactersWithRoleModal;
    window.openEditRoleSkillModal = openEditRoleSkillModal;
    window.openListRolesModal = openListRolesModal;
    window.openCategoryManagerModal = openCategoryManagerModal;

    // Legacy aliases
    window._openCreateRoleModal = openCreateRoleModal;
    window._openEditRoleModal = openEditRoleModal;
    window._openDeleteRoleModal = openDeleteRoleModal;
    window._openAssignRoleModal = openAssignRoleModal;
    window._openBulkAssignRoleModal = openBulkAssignRoleModal;
    window._openViewCharactersWithRoleModal = openViewCharactersWithRoleModal;
    window._openEditRoleSkillModal = openEditRoleSkillModal;
    window._openListRolesModal = openListRolesModal;
    window._openCategoryManagerModal = openCategoryManagerModal;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openCreateRoleModal: openCreateRoleModal,
            openEditRoleModal: openEditRoleModal,
            openDeleteRoleModal: openDeleteRoleModal,
            openAssignRoleModal: openAssignRoleModal,
            openBulkAssignRoleModal: openBulkAssignRoleModal,
            openViewCharactersWithRoleModal: openViewCharactersWithRoleModal,
            openEditRoleSkillModal: openEditRoleSkillModal,
            openListRolesModal: openListRolesModal,
            openCategoryManagerModal: openCategoryManagerModal
        };
    }

})();