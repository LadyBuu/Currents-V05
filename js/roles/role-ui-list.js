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
 *   - skill-utils.js (SkillUtils)
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
    // 3. ICON DROPDOWN HELPER - Custom icon grid selector with SVG icons
    // =========================================================================

    function _getIconDisplayChar(iconName) {
        if (window.Icons && window.Icons[iconName]) {
            var svg = window.Icons[iconName];
            return svg.replace(/width="[^"]*"/, 'width="16"').replace(/height="[^"]*"/, 'height="16"');
        }
        if (iconName && iconName.indexOf('<svg') === 0) {
            return iconName.replace(/width="[^"]*"/, 'width="16"').replace(/height="[^"]*"/, 'height="16"');
        }
        return '<svg viewBox="0 0 20 20" width="16" height="16" style="display:inline-block;fill:currentColor;vertical-align:middle;"><circle cx="10" cy="10" r="5.71" fill="currentColor"/></svg>';
    }

    function _getAllIconNames() {
        var iconNames = [];
        if (window.Icons) {
            for (var key in window.Icons) {
                if (window.Icons.hasOwnProperty(key) && typeof window.Icons[key] === 'string') {
                    iconNames.push(key);
                }
            }
        }
        return iconNames.sort();
    }

    function _renderIconSelector(selectedIcon) {
        var iconNames = _getAllIconNames();
        var commonIcons = ['CIRCLE', 'STAR_4', 'STAR', 'CROWN', 'PERSON', 'LOCATION', 'BOOK', 'GEAR', 'HEART', 'FLAG', 'HOME', 'SWORD', 'SHIELD'];
        var commonSet = {};
        for (var i = 0; i < commonIcons.length; i++) {
            commonSet[commonIcons[i]] = true;
        }

        var html = '<div class="icon-selector" style="display:flex;flex-wrap:wrap;gap:4px;padding:4px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;max-height:120px;overflow-y:auto;">';

        for (var i = 0; i < commonIcons.length; i++) {
            var name = commonIcons[i];
            if (window.Icons[name]) {
                var selected = (selectedIcon === name) ? 'selected' : '';
                var iconSvg = _getIconDisplayChar(name);
                html += '<div class="icon-option" data-icon="' + name + '" style="' +
                    'width:36px;height:36px;display:flex;align-items:center;justify-content:center;' +
                    'border-radius:4px;cursor:pointer;border:2px solid ' + (selected ? 'var(--accent)' : 'transparent') + ';' +
                    'background:' + (selected ? 'rgba(var(--accent-rgb),0.15)' : 'var(--bg)') + ';' +
                    'transition:all 0.1s;' +
                    '" title="' + name + '">' +
                    iconSvg +
                    '</div>';
            }
        }

        html += '<div style="width:100%;height:1px;background:var(--border);margin:4px 0;"></div>';

        for (var i = 0; i < iconNames.length; i++) {
            var name = iconNames[i];
            if (commonSet[name]) continue;
            if (window.Icons[name]) {
                var selected = (selectedIcon === name) ? 'selected' : '';
                var iconSvg = _getIconDisplayChar(name);
                html += '<div class="icon-option" data-icon="' + name + '" style="' +
                    'width:36px;height:36px;display:flex;align-items:center;justify-content:center;' +
                    'border-radius:4px;cursor:pointer;border:2px solid ' + (selected ? 'var(--accent)' : 'transparent') + ';' +
                    'background:' + (selected ? 'rgba(var(--accent-rgb),0.15)' : 'var(--bg)') + ';' +
                    'transition:all 0.1s;' +
                    '" title="' + name + '">' +
                    iconSvg +
                    '</div>';
            }
        }

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 4. SKILL UTILITIES
    // =========================================================================

    function _getSkillLevelName(level) {
        if (typeof window.SkillUtils !== 'undefined') {
            return window.SkillUtils.getSkillLevelName(level);
        }
        if (typeof window._getSkillLevelName === 'function') {
            return window._getSkillLevelName(level);
        }
        if (typeof window.getSkillLevelName === 'function') {
            return window.getSkillLevelName(level);
        }
        if (typeof window.ApprenticeshipQueries !== 'undefined' && window.ApprenticeshipQueries.getSkillLevelName) {
            return window.ApprenticeshipQueries.getSkillLevelName(level);
        }
        if (level >= 91) return 'Master';
        if (level >= 76) return 'Expert';
        if (level >= 51) return 'Journeyman';
        if (level >= 26) return 'Apprentice';
        if (level >= 1) return 'Novice';
        return 'Untrained';
    }

    function _getTeachingThresholds() {
        if (typeof window.SkillUtils !== 'undefined') {
            return window.SkillUtils.getThresholds();
        }
        if (typeof window._getThresholds === 'function') {
            return window._getThresholds();
        }
        return window.TEACHING_THRESHOLDS || {
            NOVICE: 0,
            APPRENTICE: 26,
            JOURNEYMAN: 51,
            EXPERT: 76,
            MASTER: 91
        };
    }

    // =========================================================================
    // 5. DEPENDENCY WRAPPERS
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

    function _getAllRoles() {
        if (typeof window.RoleQueries !== 'undefined') {
            return window.RoleQueries.getRoles({});
        }
        if (typeof window.getRoles === 'function') {
            return window.getRoles();
        }
        if (typeof window._getRoles === 'function') {
            return window._getRoles();
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
        if (typeof window._getRoleById === 'function') {
            return window._getRoleById(id);
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
        if (typeof window._getRoleStatistics === 'function') {
            return window._getRoleStatistics(roleId);
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
        if (typeof window._getCharactersWithRoleDetails === 'function') {
            return window._getCharactersWithRoleDetails(roleId, mastersOnly);
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
        if (typeof window._getRoleCategories === 'function') {
            return window._getRoleCategories();
        }
        return {};
    }

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        if (typeof window._getCharacters === 'function') {
            return window._getCharacters();
        }
        return [];
    }

    function _getCurrentLocation(character) {
        if (typeof window.getCurrentLocation === 'function') {
            return window.getCurrentLocation(character);
        }
        if (typeof window._getCurrentLocation === 'function') {
            return window._getCurrentLocation(character);
        }
        return 'Unknown';
    }

    function _updateRole(roleId, updates) {
        if (typeof window.RoleCommands !== 'undefined') {
            return window.RoleCommands.updateRole(roleId, updates);
        }
        if (typeof window.updateRole === 'function') {
            return window.updateRole(roleId, updates);
        }
        if (typeof window._updateRole === 'function') {
            return window._updateRole(roleId, updates);
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
        if (typeof window._deleteRole === 'function') {
            return window._deleteRole(roleId, removeFromCharacters);
        }
        return false;
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
        if (typeof window._saveMasterData === 'function') {
            window._saveMasterData();
        }
    }

    function _openDeleteRoleModal(roleId, onSuccess) {
        if (typeof window.openDeleteRoleModal === 'function') {
            window.openDeleteRoleModal(roleId, onSuccess);
            return true;
        }
        if (typeof window._openDeleteRoleModal === 'function') {
            window._openDeleteRoleModal(roleId, onSuccess);
            return true;
        }
        return false;
    }

    function _openEditRoleSkillModal(roleId, characterId, onSuccess) {
        if (typeof window.openEditRoleSkillModal === 'function') {
            window.openEditRoleSkillModal(roleId, characterId, onSuccess);
            return true;
        }
        if (typeof window._openEditRoleSkillModal === 'function') {
            window._openEditRoleSkillModal(roleId, characterId, onSuccess);
            return true;
        }
        return false;
    }

    // =========================================================================
    // 6. PRIVATE RENDER HELPERS
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
            var location = _getCurrentLocation(char);

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
    // 7. ROLE DETAIL PANEL RENDERING - FIXED with SVG icons and role-level specializations
    // =========================================================================

    function renderRoleDetailPanel(containerId, roleId, onBack, onRefresh, options) {
        if (_processingRender) {
            return false;
        }
        _processingRender = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) {
                _processingRender = false;
                return false;
            }

            var role = _getRole(roleId);
            if (!role) {
                container.innerHTML = '<div class="placeholder" style="text-align:center;padding:40px;color:var(--dim);">Role not found</div>';
                if (onBack) onBack();
                _processingRender = false;
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
            if (categories && typeof categories === 'object') {
                for (var catKey in categories) {
                    if (categories.hasOwnProperty(catKey)) {
                        var cat = categories[catKey];
                        if (cat && cat.id) {
                            var selected = (role.category === catKey) ? 'selected' : '';
                            var catIcon = cat.icon || '⌇';
                            var catName = cat.name || catKey;
                            categoryOptions += '<option value="' + catKey + '" ' + selected + '>' + catIcon + ' ' + _escapeHtml(catName) + '</option>';
                        }
                    }
                }
            }
            if (!categoryOptions) {
                categoryOptions = '<option value="uncategorized">⌇ Uncategorized</option>';
            }

            // Get the display icon for the header
            var displayIcon = _getIcon(role.icon || 'CIRCLE');
            
            // Get the custom icon selector HTML
            var iconSelectorHtml = _renderIconSelector(role.icon || 'CIRCLE');

            var html = 
                '<div class="role-detail-panel">' +
                    '<div class="detail-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px;">' +
                        '<button id="backToRolesBtn" class="btn small" style="background: var(--bg3); border: 1px solid var(--border); border-radius: 6px; padding: 4px 12px; cursor: pointer; font-size: 0.6rem;">← Back to Roles</button>' +
                        '<h2 style="margin: 0; font-size: 1rem; display: flex; align-items: center; gap: 6px;"><span style="font-size:1.2rem; display:inline-flex; align-items:center;">' + displayIcon + '</span> Edit Role: ' + _escapeHtml(role.name) + '</h2>' +
                        '<button id="deleteRoleBtn" class="btn danger" style="background: #8a2020; color: white; border: none; border-radius: 6px; padding: 4px 12px; cursor: pointer; font-size: 0.6rem;">' + crossIcon + ' Delete</button>' +
                    '</div>' +

                    '<form id="roleDetailForm">' +
                        '<div class="form-group" style="margin-bottom: 12px;">' +
                            '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Role Name</label>' +
                            '<input type="text" id="roleName" value="' + _escapeHtml(role.name) + '" required autofocus style="width: 100%; padding: 8px; background: var(--bg2); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                        '</div>' +

                        '<div class="form-group" style="margin-bottom: 12px;">' +
                            '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Category</label>' +
                            '<select id="roleCategory" style="width: 100%; padding: 8px; background: var(--bg2); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                                categoryOptions +
                            '</select>' +
                        '</div>' +

                        '<div class="form-group" style="margin-bottom: 12px;">' +
                            '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Gender Restriction</label>' +
                            '<select id="roleGender" style="width: 100%; padding: 8px; background: var(--bg2); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                                '<option value="both"' + (role.genderRestriction === 'both' ? ' selected' : '') + '>⚥ Both Genders</option>' +
                                '<option value="male"' + (role.genderRestriction === 'male' ? ' selected' : '') + '>♂ Male Only</option>' +
                                '<option value="female"' + (role.genderRestriction === 'female' ? ' selected' : '') + '>♀ Female Only</option>' +
                            '</select>' +
                        '</div>' +

                        // CUSTOM ICON SELECTOR - with SVG icons
                        '<div class="form-group" style="margin-bottom: 12px;">' +
                            '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Icon</label>' +
                            '<div id="roleIconSelector">' + iconSelectorHtml + '</div>' +
                            '<input type="hidden" id="roleIconValue" value="' + (role.icon || 'CIRCLE') + '">' +
                            '<small style="font-size: 0.55rem; color: var(--dim); display: block; margin-top: 4px;">Click an icon to select it</small>' +
                        '</div>' +

                        // SPECIALIZATIONS - using role-level specializations
                        '<div class="form-group" style="margin-bottom: 12px;">' +
                            '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Specializations</label>' +
                            '<div id="specsList" class="specs-list" style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;">' +
                                _renderSpecializations(role.specializations || []) +
                            '</div>' +
                            '<div class="add-spec-row" style="display: flex; gap: 8px; margin-top: 4px;">' +
                                '<input type="text" id="newSpec" placeholder="New specialization..." style="flex: 1; padding: 6px 10px; background: var(--bg2); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' +
                                '<button type="button" id="addSpecBtn" class="btn small" style="background: var(--bg3); border: 1px solid var(--border); border-radius: 6px; padding: 4px 12px; cursor: pointer; font-size: 0.6rem;">' + plusIcon + ' Add</button>' +
                            '</div>' +
                            '<small style="font-size: 0.55rem; color: var(--dim);">Add specializations that can be taught to apprentices</small>' +
                        '</div>' +

                        '<div class="form-group" style="margin-bottom: 12px;">' +
                            '<label style="display: block; font-size: 0.7rem; color: var(--accent); margin-bottom: 4px;">Notes</label>' +
                            '<textarea id="roleNotes" rows="2" style="width: 100%; padding: 8px; background: var(--bg2); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">' + _escapeHtml(role.notes || '') + '</textarea>' +
                        '</div>' +

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

                        _renderCharactersWithRole(charDetails, roleId, stats.totalCharacters) +

                        '<div class="action-buttons" style="display: flex; gap: 8px; margin-top: 16px;">' +
                            '<button type="submit" class="btn primary" style="background: var(--accent); color: var(--bg); border: none; border-radius: 6px; padding: 6px 16px; cursor: pointer; font-size: 0.7rem;">✓ Save Changes</button>' +
                            '<button type="button" id="cancelEditBtn" class="btn" style="background: var(--bg3); border: 1px solid var(--border); border-radius: 6px; padding: 6px 16px; cursor: pointer; font-size: 0.7rem;">Cancel</button>' +
                        '</div>' +
                    '</form>' +
                '</div>';

            container.innerHTML = html;
            _attachDetailPanelHandlers(role, containerId, onBack, onRefresh, options);

            return true;

        } finally {
            _processingRender = false;
        }
    }

    // =========================================================================
    // 8. DETAIL PANEL EVENT HANDLERS - FIXED for role-level specializations
    // =========================================================================

    function _attachDetailPanelHandlers(role, containerId, onBack, onRefresh, options) {
        var form = document.getElementById('roleDetailForm');
        var backBtn = document.getElementById('backToRolesBtn');
        var cancelBtn = document.getElementById('cancelEditBtn');
        var deleteBtn = document.getElementById('deleteRoleBtn');
        var addSpecBtn = document.getElementById('addSpecBtn');

        var _roleData = role;

        // Custom icon selector handlers
        function attachIconSelectorHandlers() {
            var iconOptions = document.querySelectorAll('.icon-option');
            var hiddenInput = document.getElementById('roleIconValue');
            for (var i = 0; i < iconOptions.length; i++) {
                var opt = iconOptions[i];
                if (opt._clickAttached) continue;
                opt.addEventListener('click', function() {
                    var iconName = this.dataset.icon;
                    if (hiddenInput) hiddenInput.value = iconName;
                    document.querySelectorAll('.icon-option').forEach(function(el) {
                        el.style.border = '2px solid transparent';
                        el.style.background = 'var(--bg)';
                    });
                    this.style.border = '2px solid var(--accent)';
                    this.style.background = 'rgba(var(--accent-rgb), 0.15)';
                });
                opt._clickAttached = true;
            }
        }

        function attachRemoveSpecHandlers() {
            var removeBtns = document.querySelectorAll('.remove-spec');
            for (var i = 0; i < removeBtns.length; i++) {
                var btn = removeBtns[i];
                if (btn._clickAttached) continue;
                btn.addEventListener('click', function() {
                    var idx = parseInt(this.dataset.index);
                    if (!isNaN(idx)) {
                        var specs = _roleData.specializations || [];
                        var specToRemove = specs[idx];
                        if (specToRemove) {
                            // Use RoleCommands.removeRoleSpecialization if available
                            if (typeof window.RoleCommands !== 'undefined' && 
                                typeof window.RoleCommands.removeRoleSpecialization === 'function') {
                                var result = window.RoleCommands.removeRoleSpecialization(_roleData.id, specToRemove);
                                if (result && result.success) {
                                    _roleData = result.role;
                                    renderRoleDetailPanel(containerId, _roleData.id, onBack, onRefresh, options);
                                    _showToast('Specialization "' + specToRemove + '" removed from role', 'info');
                                } else {
                                    _showToast(result?.reason || 'Failed to remove specialization', 'error');
                                }
                            } else {
                                // Fallback: direct manipulation
                                specs.splice(idx, 1);
                                _roleData.specializations = specs;
                                _updateRole(_roleData.id, { specializations: specs });
                                _saveMasterData();
                                renderRoleDetailPanel(containerId, _roleData.id, onBack, onRefresh, options);
                                _showToast('Specialization "' + specToRemove + '" removed from role', 'info');
                            }
                        }
                    }
                });
                btn._clickAttached = true;
            }
        }

        attachRemoveSpecHandlers();

        if (backBtn && !backBtn._clickAttached) {
            backBtn.addEventListener('click', function() {
                if (onBack) onBack();
            });
            backBtn._clickAttached = true;
        }

        if (cancelBtn && !cancelBtn._clickAttached) {
            cancelBtn.addEventListener('click', function() {
                if (onBack) onBack();
            });
            cancelBtn._clickAttached = true;
        }

        if (form && !form._submitAttached) {
            form.addEventListener('submit', function(e) {
                e.preventDefault();

                var newName = document.getElementById('roleName').value.trim();
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

                // Get icon from hidden input
                var hiddenIcon = document.getElementById('roleIconValue');
                var icon = hiddenIcon ? hiddenIcon.value : 'CIRCLE';

                var updates = {
                    name: newName,
                    category: document.getElementById('roleCategory').value,
                    genderRestriction: document.getElementById('roleGender').value,
                    icon: icon,
                    specializations: specializations,
                    notes: document.getElementById('roleNotes').value
                };

                var result = _updateRole(_roleData.id, updates);
                if (result) {
                    _roleData = result;
                    _showToast('Role "' + newName + '" saved', 'success');
                    if (onRefresh) onRefresh();
                }
            });
            form._submitAttached = true;
        }

        // FIXED: Add Spec button - uses RoleCommands.addRoleSpecialization
        if (addSpecBtn && !addSpecBtn._clickAttached) {
            addSpecBtn.addEventListener('click', function() {
                var newSpec = document.getElementById('newSpec')?.value.trim();
                if (newSpec) {
                    // Use RoleCommands.addRoleSpecialization
                    if (typeof window.RoleCommands !== 'undefined' && 
                        typeof window.RoleCommands.addRoleSpecialization === 'function') {
                        var result = window.RoleCommands.addRoleSpecialization(_roleData.id, newSpec);
                        if (result && result.success) {
                            _roleData = result.role;
                            document.getElementById('newSpec').value = '';
                            renderRoleDetailPanel(containerId, _roleData.id, onBack, onRefresh, options);
                            _showToast('Specialization "' + newSpec + '" added to role', 'success');
                        } else {
                            _showToast(result?.reason || 'Failed to add specialization', 'error');
                        }
                    } else {
                        // Fallback: direct manipulation
                        var specs = _roleData.specializations || [];
                        if (!specs.includes(newSpec)) {
                            specs.push(newSpec);
                            _roleData.specializations = specs;
                            _updateRole(_roleData.id, { specializations: specs });
                            _saveMasterData();
                            document.getElementById('newSpec').value = '';
                            renderRoleDetailPanel(containerId, _roleData.id, onBack, onRefresh, options);
                            _showToast('Specialization "' + newSpec + '" added to role', 'success');
                        } else {
                            _showToast('Specialization already exists on this role', 'error');
                        }
                    }
                }
            });
            addSpecBtn._clickAttached = true;
        }

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

        if (deleteBtn && !deleteBtn._clickAttached) {
            deleteBtn.addEventListener('click', function() {
                var opened = _openDeleteRoleModal(_roleData.id, function() {
                    if (onRefresh) onRefresh();
                    if (onBack) onBack();
                });
                if (!opened) {
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

        // Attach icon selector handlers after DOM update
        setTimeout(attachIconSelectorHandlers, 50);
    }

    // =========================================================================
    // 9. ROLE LIST RENDERING - FIXED with SVG icons
    // =========================================================================

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

                var charCount = 0;
                var characters = _getCharacters();
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
                var roleIcon = _getIcon(role.icon || 'CIRCLE');

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
                                '<span style="font-size: 1.1rem; display: inline-flex; align-items: center;">' + roleIcon + '</span>' +
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

            var rows = container.querySelectorAll('.' + rowClass);
            for (var i = 0; i < rows.length; i++) {
                var row = rows[i];
                if (row._clickAttached) continue;

                row.addEventListener('click', function(e) {
                    if (e.target.closest('button')) return;
                    var roleId = this.dataset.roleId;
                    if (options.onSelect) options.onSelect(roleId);
                });
                row._clickAttached = true;
            }

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
    // 10. ROLE CARD RENDERING - FIXED with SVG icons
    // =========================================================================

    function renderRoleCard(role, options) {
        if (!role) return '';

        options = options || {};
        var showStats = options.showStats || false;
        var showActions = options.showActions !== undefined ? options.showActions : true;

        var personIcon = _getIcon('PERSON');
        var editIcon = _getIcon('EDIT');
        var crossIcon = _getIcon('X_HEAVY');
        var roleIcon = _getIcon(role.icon || 'CIRCLE');

        var charCount = 0;
        var characters = _getCharacters();
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
                            '<span style="font-size: 1.2rem; display: inline-flex; align-items: center;">' + roleIcon + '</span>' +
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
    // 11. MASTER CHARACTERS FILTER TOGGLE
    // =========================================================================

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
    // 12. EXPORTS
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