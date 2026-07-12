/**
 * =============================================================================
 * STILL WATERS - ROLE UI LIST (role-ui-list.js)
 * =============================================================================
 * 
 * LOCATION: js/core/ui/role-ui-list.js
 * 
 * This file contains UI rendering for roles:
 * - Role detail panel (editable)
 * - Role list rendering
 * - Role card rendering
 * 
 * This is the UI LAYER - it only handles rendering and user interaction.
 * All business logic is delegated to RoleCommands and RoleQueries.
 * 
 * ICON POLICY: NO EMOJIS - Use SVG icons from icons.js via _getIcon()
 * 
 * DEPENDENCIES:
 *   - role-queries.js (RoleQueries)
 *   - role-commands.js (RoleCommands)
 *   - role-state.js (RoleState)
 *   - role-constants.js (TEACHING_THRESHOLDS, UNCATEGORIZED_ID)
 *   - modals-roles.js (for modal dialogs)
 *   - formatting.js (escapeHtml)
 *   - icons.js (Icons)
 *   - ui.js (showToast)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARDS
    // =========================================================================

    var _processingRender = false;

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
    // 3. DEPENDENCY WRAPPERS
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

    function _getRoleCategories() {
        if (typeof window.RoleState !== 'undefined') {
            return window.RoleState.getCategories();
        }
        if (typeof window.getRoleCategories === 'function') {
            return window.getRoleCategories();
        }
        return {};
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

    function _getTeachingThresholds() {
        return window.TEACHING_THRESHOLDS || {
            NOVICE: 0,
            APPRENTICE: 26,
            JOURNEYMAN: 51,
            EXPERT: 76,
            MASTER: 91
        };
    }

    function _updateRole(roleId, updates) {
        if (typeof window.RoleCommands !== 'undefined') {
            return window.RoleCommands.updateRole(roleId, updates);
        }
        if (typeof window.updateRole === 'function') {
            return window.updateRole(roleId, updates);
        }
        return null;
    }

    function _deleteRole(roleId, removeFromCharacters) {
        if (typeof window.RoleCommands !== 'undefined') {
            return window.RoleCommands.deleteRole(roleId, removeFromCharacters);
        }
        if (typeof window.deleteRole === 'function') {
            return window.deleteRole(roleId, removeFromCharacters);
        }
        return false;
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    function _openDeleteRoleModal(roleId, onSuccess) {
        if (typeof window.openDeleteRoleModal === 'function') {
            window.openDeleteRoleModal(roleId, onSuccess);
            return true;
        }
        return false;
    }

    function _openEditRoleSkillModal(roleId, characterId, onSuccess) {
        if (typeof window.openEditRoleSkillModal === 'function') {
            window.openEditRoleSkillModal(roleId, characterId, onSuccess);
            return true;
        }
        return false;
    }

    // =========================================================================
    // 4. ROLE DETAIL PANEL RENDERING
    // =========================================================================

    /**
     * Renders a role detail edit panel in the specified container
     * @param {string} containerId - Container element ID
     * @param {string} roleId - Role ID
     * @param {Function} onBack - Callback when back button is clicked
     * @param {Function} onRefresh - Callback when data changes
     * @param {Object} options - Optional settings
     * @param {boolean} options.mastersOnly - Filter characters by master level
     * @returns {boolean} True if rendered
     */
    function renderRoleDetailPanel(containerId, roleId, onBack, onRefresh, options) {
        if (_processingRender) {
            return false;
        }
        _processingRender = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) return false;

            var role = _getRole(roleId);
            if (!role) {
                if (onBack) onBack();
                return false;
            }

            options = options || {};
            var mastersOnly = options.mastersOnly || false;

            var stats = _getRoleStatistics(roleId);
            var categories = _getRoleCategories();
            var charDetails = _getCharactersWithRoleDetails(roleId, mastersOnly);
            var thresholds = _getTeachingThresholds();
            var editIcon = _getIcon('EDIT');
            var personIcon = _getIcon('PERSON');
            var locationIcon = _getIcon('LOCATION');
            var warningIcon = _getIcon('WARNING');
            var crossIcon = _getIcon('X_HEAVY');
            var plusIcon = _getIcon('PLUS');
            var searchIcon = _getIcon('SEARCH');

            // Build category options
            var categoryOptions = '';
            for (var catKey in categories) {
                if (categories.hasOwnProperty(catKey)) {
                    var cat = categories[catKey];
                    var selected = (role.category === catKey) ? 'selected' : '';
                    categoryOptions += '<option value="' + catKey + '" ' + selected + '>' + (cat.icon || '⌇') + ' ' + _escapeHtml(cat.name) + '</option>';
                }
            }

            container.innerHTML = 
                '<div class="role-detail-panel">' +
                    // Header
                    '<div class="detail-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px;">' +
                        '<button id="backToRolesBtn" class="btn small" style="background: var(--bg3); border: 1px solid var(--border); border-radius: 6px; padding: 4px 12px; cursor: pointer;">← Back to Roles</button>' +
                        '<h2 style="margin: 0; font-size: 1rem;">' + editIcon + ' Edit Role: ' + _escapeHtml(role.name) + '</h2>' +
                        '<button id="deleteRoleBtn" class="btn danger" style="background: #8a2020; color: white; border: none; border-radius: 6px; padding: 4px 12px; cursor: pointer;">' + crossIcon + ' Delete</button>' +
                    '</div>' +

                    // Edit Form
                    '<form id="roleDetailForm">' +
                        // Name
                        '<div class="form-group" style="margin-bottom: 12px;">' +
                            '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Role Name</label>' +
                            '<input type="text" id="roleName" value="' + _escapeHtml(role.name) + '" required autofocus style="width: 100%; padding: 8px; background: var(--bg2); border: 1px solid var(--border); border-radius: 6px;">' +
                        '</div>' +

                        // Category
                        '<div class="form-group" style="margin-bottom: 12px;">' +
                            '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Category</label>' +
                            '<select id="roleCategory" style="width: 100%; padding: 8px; background: var(--bg2); border: 1px solid var(--border); border-radius: 6px;">' +
                                categoryOptions +
                            '</select>' +
                        '</div>' +

                        // Gender Restriction
                        '<div class="form-group" style="margin-bottom: 12px;">' +
                            '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Gender Restriction</label>' +
                            '<select id="roleGender" style="width: 100%; padding: 8px; background: var(--bg2); border: 1px solid var(--border); border-radius: 6px;">' +
                                '<option value="both"' + (role.genderRestriction === 'both' ? ' selected' : '') + '>⚥ Both Genders</option>' +
                                '<option value="male"' + (role.genderRestriction === 'male' ? ' selected' : '') + '>♂ Male Only</option>' +
                                '<option value="female"' + (role.genderRestriction === 'female' ? ' selected' : '') + '>♀ Female Only</option>' +
                            '</select>' +
                        '</div>' +

                        // Icon
                        '<div class="form-group" style="margin-bottom: 12px;">' +
                            '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Icon (monochrome)</label>' +
                            '<input type="text" id="roleIcon" value="' + (role.icon || '◉') + '" maxlength="2" style="width: 60px; padding: 8px; background: var(--bg2); border: 1px solid var(--border); border-radius: 6px;">' +
                            '<small style="font-size: 0.55rem; color: var(--dim); margin-left: 8px;">Single character (◉, ⌇, ⚔, ⌆)</small>' +
                        '</div>' +

                        // Specializations
                        '<div class="form-group" style="margin-bottom: 12px;">' +
                            '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Specializations</label>' +
                            '<div id="specsList" class="specs-list" style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;">' +
                                _renderSpecializations(role.specializations || []) +
                            '</div>' +
                            '<div class="add-spec-row" style="display: flex; gap: 8px; margin-top: 4px;">' +
                                '<input type="text" id="newSpec" placeholder="New specialization..." style="flex: 1; padding: 6px 10px; background: var(--bg2); border: 1px solid var(--border); border-radius: 6px;">' +
                                '<button type="button" id="addSpecBtn" class="btn small" style="background: var(--bg3); border: 1px solid var(--border); border-radius: 6px; padding: 4px 12px; cursor: pointer;">' + plusIcon + ' Add</button>' +
                            '</div>' +
                            '<small style="font-size: 0.55rem; color: var(--dim);">Specializations can be taught during apprenticeship</small>' +
                        '</div>' +

                        // Notes
                        '<div class="form-group" style="margin-bottom: 12px;">' +
                            '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes</label>' +
                            '<textarea id="roleNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg2); border: 1px solid var(--border); border-radius: 6px;">' + _escapeHtml(role.notes || '') + '</textarea>' +
                        '</div>' +

                        // Statistics
                        '<div class="stats-info" style="background: var(--bg3); padding: 12px; border-radius: 8px; margin: 16px 0;">' +
                            '<h4 style="margin: 0 0 8px 0; font-size: 0.75rem;">⌇ Role Statistics</h4>' +
                            '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 8px; font-size: 0.7rem;">' +
                                '<div>👥 Characters: ' + stats.totalCharacters + '</div>' +
                                '<div>⌇ Specializations: ' + stats.totalSpecializations + '</div>' +
                                '<div>◉ Average Skill: ' + stats.averageSkill + '</div>' +
                                '<div>◉ Masters (91+): ' + stats.masterCount + '</div>' +
                                '<div>◉ Experts (76-90): ' + stats.expertCount + '</div>' +
                                '<div>⌇ Journeymen (51-75): ' + stats.journeymanCount + '</div>' +
                                '<div>⌇ Apprentices (26-50): ' + stats.apprenticeCount + '</div>' +
                                '<div>⌇ Novices (1-25): ' + stats.noviceCount + '</div>' +
                                '<div>⌇ Can Teach (51+): ' + stats.canTeachCount + '</div>' +
                            '</div>' +
                        '</div>' +

                        // Characters with role
                        _renderCharactersWithRole(charDetails, roleId, stats.totalCharacters) +

                        // Action buttons
                        '<div class="action-buttons" style="display: flex; gap: 8px; margin-top: 16px;">' +
                            '<button type="submit" class="btn primary" style="background: var(--accent); color: var(--bg); border: none; border-radius: 6px; padding: 6px 16px; cursor: pointer;">✓ Save Changes</button>' +
                            '<button type="button" id="cancelEditBtn" class="btn" style="background: var(--bg3); border: 1px solid var(--border); border-radius: 6px; padding: 6px 16px; cursor: pointer;">Cancel</button>' +
                        '</div>' +
                    '</form>' +
                '</div>';

            // Attach handlers
            _attachDetailPanelHandlers(role, containerId, onBack, onRefresh, options);

            return true;

        } finally {
            _processingRender = false;
        }
    }

    // =========================================================================
    // 5. PRIVATE RENDER HELPERS
    // =========================================================================

    function _renderSpecializations(specializations) {
        if (!specializations || specializations.length === 0) {
            return '<span class="no-specs" style="font-size: 0.7rem; color: var(--dim);">No specializations</span>';
        }

        var html = '';
        for (var i = 0; i < specializations.length; i++) {
            html += 
                '<span class="spec-item" style="display: inline-flex; align-items: center; gap: 4px; background: var(--bg3); padding: 4px 8px; border-radius: 16px;">' +
                    _escapeHtml(specializations[i]) +
                    '<button type="button" class="remove-spec" data-index="' + i + '" style="background: none; border: none; cursor: pointer; color: var(--dim);">✖</button>' +
                '</span>';
        }
        return html;
    }

    function _renderCharactersWithRole(charDetails, roleId, totalCount) {
        if (!charDetails || charDetails.length === 0) {
            return '';
        }

        var personIcon = _getIcon('PERSON');
        var locationIcon = _getIcon('LOCATION');
        var editIcon = _getIcon('EDIT');

        var html = 
            '<div class="characters-with-role" style="margin: 16px 0;">' +
                '<h4 style="margin: 0 0 8px 0; font-size: 0.75rem;">' + personIcon + ' Characters with this role (' + totalCount + ')</h4>' +
                '<div style="max-height: 250px; overflow-y: auto; background: var(--bg3); border-radius: 8px;">' +
                    '<table style="width: 100%; font-size: 0.65rem; border-collapse: collapse;">' +
                        '<thead>' +
                            '<tr style="background: var(--bg2);">' +
                                '<th style="padding: 6px; text-align: left;">Name</th>' +
                                '<th style="padding: 6px; text-align: center;">Skill</th>' +
                                '<th style="padding: 6px; text-align: center;">Tier</th>' +
                                '<th style="padding: 6px; text-align: center;">Can Teach</th>' +
                                '<th style="padding: 6px; text-align: left;">Specializations</th>' +
                                '<th style="padding: 6px; text-align: center;">Primary</th>' +
                                '<th style="padding: 6px; text-align: center;">Action</th>' +
                            '</tr>' +
                        '</thead>' +
                        '<tbody>';

        var displayCount = Math.min(charDetails.length, 15);
        for (var i = 0; i < displayCount; i++) {
            var cd = charDetails[i];
            var char = cd.character;
            var location = (typeof window.getCurrentLocation === 'function') ? window.getCurrentLocation(char) : 'Unknown';

            html += 
                '<tr style="border-top: 1px solid var(--border-light);">' +
                    '<td style="padding: 4px 6px;">' + _escapeHtml(char.name) + ' ' + _escapeHtml(char.surname || '') + '</td>' +
                    '<td style="padding: 4px 6px; text-align: center;">' + cd.skillLevel + '</td>' +
                    '<td style="padding: 4px 6px; text-align: center;">' + cd.skillTier + '</td>' +
                    '<td style="padding: 4px 6px; text-align: center;">' + (cd.canTeach ? '✓' : '') + '</td>' +
                    '<td style="padding: 4px 6px;">' + (cd.specializations && cd.specializations.length > 0 ? cd.specializations.slice(0, 2).join(', ') + (cd.specializations.length > 2 ? '...' : '') : '') + '</td>' +
                    '<td style="padding: 4px 6px; text-align: center;">' + (cd.isPrimary ? '✓' : '') + '</td>' +
                    '<td style="padding: 4px 6px; text-align: center;">' +
                        '<button class="edit-skill-btn" data-char-id="' + char.id + '" data-role-id="' + roleId + '" style="background: var(--accent-dim); border: none; padding: 2px 8px; border-radius: 4px; cursor: pointer; font-size: 0.6rem;">' + editIcon + ' Skill</button>' +
                    '</td>' +
                '</tr>';
        }

        if (charDetails.length > 15) {
            html += '<tr><td colspan="7" style="padding: 6px; text-align: center; color: var(--dim);">... and ' + (charDetails.length - 15) + ' more</td></tr>';
        }

        html += 
                        '</tbody>' +
                    '</table>' +
                '</div>' +
                '<small style="font-size: 0.55rem; color: var(--dim); display: block; margin-top: 6px;">⌇ Characters with skill 51+ (Journeyman) can teach this role</small>' +
            '</div>';

        return html;
    }

    // =========================================================================
    // 6. DETAIL PANEL EVENT HANDLERS
    // =========================================================================

    function _attachDetailPanelHandlers(role, containerId, onBack, onRefresh, options) {
        var form = document.getElementById('roleDetailForm');
        var backBtn = document.getElementById('backToRolesBtn');
        var cancelBtn = document.getElementById('cancelEditBtn');
        var deleteBtn = document.getElementById('deleteRoleBtn');
        var addSpecBtn = document.getElementById('addSpecBtn');

        // Store role data for re-renders
        var _roleData = role;

        function attachRemoveSpecHandlers() {
            var removeBtns = document.querySelectorAll('.remove-spec');
            for (var i = 0; i < removeBtns.length; i++) {
                var btn = removeBtns[i];
                if (btn._clickAttached) continue;
                btn.addEventListener('click', function() {
                    var idx = parseInt(this.dataset.index);
                    if (!isNaN(idx)) {
                        var specs = _roleData.specializations || [];
                        specs.splice(idx, 1);
                        _roleData.specializations = specs;
                        _updateRole(_roleData.id, { specializations: specs });
                        _saveMasterData();
                        renderRoleDetailPanel(containerId, _roleData.id, onBack, onRefresh, options);
                        _showToast('Specialization removed', 'info');
                    }
                });
                btn._clickAttached = true;
            }
        }

        attachRemoveSpecHandlers();

        // Back button
        if (backBtn && !backBtn._clickAttached) {
            backBtn.addEventListener('click', function() {
                if (onBack) onBack();
            });
            backBtn._clickAttached = true;
        }

        // Cancel button
        if (cancelBtn && !cancelBtn._clickAttached) {
            cancelBtn.addEventListener('click', function() {
                if (onBack) onBack();
            });
            cancelBtn._clickAttached = true;
        }

        // Form submit (Save)
        if (form && !form._submitAttached) {
            form.addEventListener('submit', function(e) {
                e.preventDefault();

                var newName = document.getElementById('roleName').value.trim();
                if (!newName) {
                    _showToast('Role name is required', 'error');
                    return;
                }

                // Collect specializations from the DOM
                var specItems = document.querySelectorAll('.spec-item');
                var specializations = [];
                for (var i = 0; i < specItems.length; i++) {
                    var text = specItems[i].childNodes[0]?.textContent?.trim();
                    if (text) specializations.push(text);
                }

                var updates = {
                    name: newName,
                    category: document.getElementById('roleCategory').value,
                    genderRestriction: document.getElementById('roleGender').value,
                    icon: document.getElementById('roleIcon').value || '◉',
                    specializations: specializations,
                    notes: document.getElementById('roleNotes').value
                };

                var result = _updateRole(_roleData.id, updates);
                if (result) {
                    _roleData = result;
                    _showToast('Role "' + newName + '" saved', 'success');
                    if (onRefresh) onRefresh();
                    if (onBack) onBack();
                }
            });
            form._submitAttached = true;
        }

        // Delete button
        if (deleteBtn && !deleteBtn._clickAttached) {
            deleteBtn.addEventListener('click', function() {
                var opened = _openDeleteRoleModal(_roleData.id, function() {
                    if (onRefresh) onRefresh();
                    if (onBack) onBack();
                });
                if (!opened) {
                    // Fallback: direct delete with confirm
                    var charCount = _getCharactersWithRoleDetails(_roleData.id).length;
                    var warningMsg = 'Delete role "' + _roleData.name + '" permanently?';
                    if (charCount > 0) {
                        warningMsg = '⚠️ ' + charCount + ' character(s) have this role. Deleting it will remove the role from those characters. Continue?';
                    }
                    if (confirm(warningMsg)) {
                        var success = _deleteRole(_roleData.id, true);
                        if (success) {
                            _showToast('Deleted "' + _roleData.name + '"', 'info');
                            if (onRefresh) onRefresh();
                            if (onBack) onBack();
                        }
                    }
                }
            });
            deleteBtn._clickAttached = true;
        }

        // Add specialization button
        if (addSpecBtn && !addSpecBtn._clickAttached) {
            addSpecBtn.addEventListener('click', function() {
                var newSpec = document.getElementById('newSpec')?.value.trim();
                if (newSpec) {
                    var specs = _roleData.specializations || [];
                    if (!specs.includes(newSpec)) {
                        specs.push(newSpec);
                        _roleData.specializations = specs;
                        _updateRole(_roleData.id, { specializations: specs });
                        _saveMasterData();
                        renderRoleDetailPanel(containerId, _roleData.id, onBack, onRefresh, options);
                        _showToast('Specialization added', 'success');
                    } else {
                        _showToast('Specialization already exists', 'error');
                    }
                    document.getElementById('newSpec').value = '';
                }
            });
            addSpecBtn._clickAttached = true;
        }

        // Enter key for specialization input
        var newSpecInput = document.getElementById('newSpec');
        if (newSpecInput && !newSpecInput._enterAttached) {
            newSpecInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    var addBtn = document.getElementById('addSpecBtn');
                    if (addBtn) addBtn.click();
                }
            });
            newSpecInput._enterAttached = true;
        }

        // Edit skill buttons (dynamic)
        var skillBtns = document.querySelectorAll('.edit-skill-btn');
        for (var i = 0; i < skillBtns.length; i++) {
            var btn = skillBtns[i];
            if (btn._clickAttached) continue;
            btn.addEventListener('click', function() {
                var charId = this.dataset.charId;
                var roleId = this.dataset.roleId;
                var opened = _openEditRoleSkillModal(roleId, charId, function() {
                    if (onRefresh) onRefresh();
                    renderRoleDetailPanel(containerId, roleId, onBack, onRefresh, options);
                });
                if (!opened) {
                    _showToast('Skill editor not available', 'error');
                }
            });
            btn._clickAttached = true;
        }
    }

    // =========================================================================
    // 7. ROLE LIST RENDERING
    // =========================================================================

    /**
     * Renders a list of roles in the specified container
     * @param {string} containerId - Container element ID
     * @param {Object} options - Options
     * @param {Array} options.filteredRoles - Pre-filtered list
     * @param {Function} options.onSelect - Callback when a role is selected
     * @param {Function} options.onEdit - Callback when edit is requested
     * @param {Function} options.onDelete - Callback when delete is requested
     * @param {string} options.emptyMessage - Empty state message
     * @param {string} options.rowClass - CSS class for rows
     * @param {boolean} options.showStats - Show role statistics
     * @param {boolean} options.showActions - Show action buttons
     * @param {string} options.selectedId - Selected role ID
     * @returns {boolean} True if rendered
     */
    function renderRoleList(containerId, options) {
        if (_processingRender) {
            return false;
        }
        _processingRender = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) return false;

            options = options || {};

            var roles = options.filteredRoles || _getAllRoles();
            var emptyMessage = options.emptyMessage || 'No roles found';
            var showStats = options.showStats !== undefined ? options.showStats : false;
            var showActions = options.showActions !== undefined ? options.showActions : true;
            var selectedId = options.selectedId || null;
            var rowClass = options.rowClass || 'role-row';

            var personIcon = _getIcon('PERSON');
            var editIcon = _getIcon('EDIT');
            var crossIcon = _getIcon('X_HEAVY');
            var searchIcon = _getIcon('SEARCH');

            if (!roles || roles.length === 0) {
                container.innerHTML = 
                    '<div class="empty-state" style="text-align: center; padding: 40px; color: var(--dim);">' +
                        searchIcon + ' ' + emptyMessage +
                    '</div>';
                return true;
            }

            roles.sort(function(a, b) {
                return a.name.localeCompare(b.name);
            });

            var html = '<div class="role-list" style="display: flex; flex-direction: column; gap: 4px;">';

            for (var i = 0; i < roles.length; i++) {
                var role = roles[i];
                var isSelected = (selectedId === role.id);

                // Count characters with this role
                var charCount = 0;
                var characters = typeof window.getCharacters === 'function' ? window.getCharacters() : [];
                for (var j = 0; j < characters.length; j++) {
                    var char = characters[j];
                    if (char.professions && char.professions.some(function(p) { return p.id === role.id; })) {
                        charCount++;
                    }
                }

                var statsHtml = '';
                if (showStats) {
                    var stats = _getRoleStatistics(role.id);
                    statsHtml = 
                        '<div style="font-size: 0.55rem; color: var(--dim); display: flex; gap: 12px; margin-top: 4px;">' +
                            '<span>◉ Avg Skill: ' + stats.averageSkill + '</span>' +
                            '<span>⌇ Masters: ' + stats.masterCount + '</span>' +
                            '<span>⌇ Can Teach: ' + stats.canTeachCount + '</span>' +
                        '</div>';
                }

                var actionsHtml = '';
                if (showActions) {
                    actionsHtml = 
                        '<div style="display: flex; gap: 4px;">' +
                            '<button class="role-edit-btn" data-role-id="' + role.id + '" style="background: none; border: none; cursor: pointer; color: var(--accent); padding: 2px 6px;">' + editIcon + '</button>' +
                            '<button class="role-delete-btn" data-role-id="' + role.id + '" style="background: none; border: none; cursor: pointer; color: var(--dim); padding: 2px 6px;">' + crossIcon + '</button>' +
                        '</div>';
                }

                var genderIcon = role.genderRestriction === 'male' ? '♂' : (role.genderRestriction === 'female' ? '♀' : '⚥');

                html += 
                    '<div class="' + rowClass + '" data-role-id="' + role.id + '" style="' +
                        'background: ' + (isSelected ? 'rgba(var(--accent-rgb), 0.15)' : 'var(--bg2)') + ';' +
                        'border: 1px solid ' + (isSelected ? 'var(--accent)' : 'var(--border)') + ';' +
                        'border-radius: 6px;' +
                        'padding: 8px 12px;' +
                        'cursor: pointer;' +
                        'transition: all 0.15s;' +
                    '">' +
                        '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">' +
                            '<div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 150px;">' +
                                '<span style="font-size: 1.1rem;">' + (role.icon || '◉') + '</span>' +
                                '<div>' +
                                    '<strong>' + _escapeHtml(role.name) + '</strong>' +
                                    '<span style="font-size: 0.55rem; color: var(--dim); margin-left: 8px;">' + genderIcon + ' ' + (role.category || 'uncategorized') + '</span>' +
                                '</div>' +
                            '</div>' +
                            '<div style="display: flex; align-items: center; gap: 12px;">' +
                                '<span style="font-size: 0.6rem; color: var(--accent);">' + personIcon + ' ' + charCount + '</span>' +
                                actionsHtml +
                            '</div>' +
                        '</div>' +
                        statsHtml +
                        (role.notes ? '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">⌇ ' + _escapeHtml(role.notes) + '</div>' : '') +
                    '</div>';
            }

            html += '</div>';
            container.innerHTML = html;

            // Attach event handlers
            var rows = container.querySelectorAll('.' + rowClass);
            for (var i = 0; i < rows.length; i++) {
                var row = rows[i];
                if (row._clickAttached) continue;

                row.addEventListener('click', function(e) {
                    // Ignore clicks on buttons
                    if (e.target.closest('button')) return;
                    var roleId = this.dataset.roleId;
                    if (options.onSelect) options.onSelect(roleId);
                });
                row._clickAttached = true;
            }

            // Edit buttons
            var editBtns = container.querySelectorAll('.role-edit-btn');
            for (var i = 0; i < editBtns.length; i++) {
                var btn = editBtns[i];
                if (btn._clickAttached) continue;
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var roleId = this.dataset.roleId;
                    if (options.onEdit) options.onEdit(roleId);
                });
                btn._clickAttached = true;
            }

            // Delete buttons
            var deleteBtns = container.querySelectorAll('.role-delete-btn');
            for (var i = 0; i < deleteBtns.length; i++) {
                var btn = deleteBtns[i];
                if (btn._clickAttached) continue;
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var roleId = this.dataset.roleId;
                    if (options.onDelete) options.onDelete(roleId);
                });
                btn._clickAttached = true;
            }

            return true;

        } finally {
            _processingRender = false;
        }
    }

    // =========================================================================
    // 8. ROLE CARD RENDERING
    // =========================================================================

    /**
     * Renders a single role as a card
     * @param {Object} role - Role object
     * @param {Object} options - Options
     * @param {boolean} options.showStats - Show role statistics
     * @param {boolean} options.showActions - Show action buttons
     * @param {Function} options.onSelect - Callback when selected
     * @param {Function} options.onEdit - Callback when edit is requested
     * @param {Function} options.onDelete - Callback when delete is requested
     * @returns {string} HTML for the card
     */
    function renderRoleCard(role, options) {
        if (!role) return '';

        options = options || {};
        var showStats = options.showStats || false;
        var showActions = options.showActions !== undefined ? options.showActions : true;

        var personIcon = _getIcon('PERSON');
        var editIcon = _getIcon('EDIT');
        var crossIcon = _getIcon('X_HEAVY');

        var charCount = 0;
        var characters = typeof window.getCharacters === 'function' ? window.getCharacters() : [];
        for (var i = 0; i < characters.length; i++) {
            var char = characters[i];
            if (char.professions && char.professions.some(function(p) { return p.id === role.id; })) {
                charCount++;
            }
        }

        var statsHtml = '';
        if (showStats) {
            var stats = _getRoleStatistics(role.id);
            statsHtml = 
                '<div style="font-size: 0.55rem; color: var(--dim); display: flex; gap: 12px; margin-top: 8px;">' +
                    '<span>◉ Avg Skill: ' + stats.averageSkill + '</span>' +
                    '<span>⌇ Masters: ' + stats.masterCount + '</span>' +
                    '<span>⌇ Can Teach: ' + stats.canTeachCount + '</span>' +
                '</div>';
        }

        var genderIcon = role.genderRestriction === 'male' ? '♂' : (role.genderRestriction === 'female' ? '♀' : '⚥');

        var actionsHtml = '';
        if (showActions) {
            actionsHtml = 
                '<div style="display: flex; gap: 4px;">' +
                    '<button class="role-edit-btn" data-role-id="' + role.id + '" style="background: none; border: none; cursor: pointer; color: var(--accent); padding: 2px 6px;">' + editIcon + '</button>' +
                    '<button class="role-delete-btn" data-role-id="' + role.id + '" style="background: none; border: none; cursor: pointer; color: var(--dim); padding: 2px 6px;">' + crossIcon + '</button>' +
                '</div>';
        }

        return (
            '<div class="role-card" data-role-id="' + role.id + '" style="' +
                'background: var(--bg2);' +
                'border: 1px solid var(--border);' +
                'border-radius: 8px;' +
                'padding: 12px 16px;' +
                'cursor: pointer;' +
                'transition: all 0.15s;' +
                'margin-bottom: 8px;' +
            '">' +
                '<div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px;">' +
                    '<div>' +
                        '<div style="display: flex; align-items: center; gap: 8px;">' +
                            '<span style="font-size: 1.2rem;">' + (role.icon || '◉') + '</span>' +
                            '<div>' +
                                '<strong>' + _escapeHtml(role.name) + '</strong>' +
                                '<span style="font-size: 0.55rem; color: var(--dim); margin-left: 8px;">' + genderIcon + ' ' + (role.category || 'uncategorized') + '</span>' +
                            '</div>' +
                        '</div>' +
                        (role.notes ? '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px;">⌇ ' + _escapeHtml(role.notes) + '</div>' : '') +
                        statsHtml +
                    '</div>' +
                    '<div style="display: flex; align-items: center; gap: 12px; flex-shrink: 0;">' +
                        '<span style="font-size: 0.6rem; color: var(--accent);">' + personIcon + ' ' + charCount + '</span>' +
                        actionsHtml +
                    '</div>' +
                '</div>' +
            '</div>'
        );
    }

    // =========================================================================
    // 9. MASTER CHARACTERS FILTER TOGGLE
    // =========================================================================

    /**
     * Renders a filter toggle for master-only view
     * @param {string} containerId - Container element ID
     * @param {boolean} mastersOnly - Current filter state
     * @param {Function} onToggle - Callback when toggled
     * @param {Function} onRefresh - Callback to refresh the view
     * @param {string} roleId - Current role ID (for refresh)
     * @returns {boolean} True if rendered
     */
    function renderMasterFilterToggle(containerId, mastersOnly, onToggle, onRefresh, roleId) {
        var container = document.getElementById(containerId);
        if (!container) return false;

        container.innerHTML = 
            '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">' +
                '<label style="display: flex; align-items: center; gap: 6px; font-size: 0.65rem; cursor: pointer;">' +
                    '<input type="checkbox" id="mastersOnlyToggle" ' + (mastersOnly ? 'checked' : '') + ' style="cursor: pointer;">' +
                    '<span>Show Masters Only (76+)</span>' +
                '</label>' +
            '</div>';

        var toggle = document.getElementById('mastersOnlyToggle');
        if (toggle) {
            toggle.addEventListener('change', function() {
                var checked = this.checked;
                if (onToggle) onToggle(checked);
                if (onRefresh && roleId) {
                    onRefresh(roleId, checked);
                }
            });
        }

        return true;
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.RoleUI = {
        renderRoleDetailPanel: renderRoleDetailPanel,
        renderRoleList: renderRoleList,
        renderRoleCard: renderRoleCard,
        renderMasterFilterToggle: renderMasterFilterToggle
    };

    // Legacy aliases for backward compatibility
    window._renderRoleDetailTab = renderRoleDetailPanel;
    window._renderRoleList = renderRoleList;
    window._renderRoleCard = renderRoleCard;
    window._renderMasterFilterToggle = renderMasterFilterToggle;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            renderRoleDetailPanel: renderRoleDetailPanel,
            renderRoleList: renderRoleList,
            renderRoleCard: renderRoleCard,
            renderMasterFilterToggle: renderMasterFilterToggle
        };
    }


})();