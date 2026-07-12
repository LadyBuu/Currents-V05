/**
 * =============================================================================
 * ROLE SELECTOR MODALS (modals-role-select.js)
 * =============================================================================
 * 
 * PURPOSE: Reusable UI modals for selecting roles across all systems.
 *          Provides consistent role selection for:
 *          - Government positions
 *          - Household positions
 *          - Residence staff positions
 *          - Character role assignment
 * 
 * DEPENDS ON:
 *   - modals-core.js (openModal, closeTopModal, _escapeHtml, _showToast, _getIcon)
 *   - role-state.js (RoleState)
 *   - role-queries.js (RoleQueries)
 *   - role-commands.js (RoleCommands)
 * 
 * EXPORTS:
 *   - openRoleSelector() - Select an existing role
 *   - openRolePickerForPosition() - Pick role for a position with filtering
 *   - openRoleManagementModal() - Full role management (view only, no create)
 * 
 * ICON POLICY:
 *   - All icons from icons.js via _getIcon()
 *   - NO emojis
 *   - NO icons in confirm/cancel buttons (plain text only)
 * 
 * UPDATED: Removed "Create Role" functionality - users must select from existing roles only
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. RECURSION GUARD
    // =========================================================================

    var _processingModal = false;
    var _roleSelectorOpen = false;

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

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

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(message, type);
        }
    }

    function _getIcon(name) {
        if (typeof window._getIcon === 'function') {
            return window._getIcon(name);
        }
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
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

    // =========================================================================
    // 2. STATE AND COMMANDS REFERENCE
    // =========================================================================

    var _roleState = window.RoleState;
    var _roleQueries = window.RoleQueries;
    var _roleCommands = window.RoleCommands;

    // =========================================================================
    // 3. ICON HELPERS
    // =========================================================================

    function _getIconSafe(name) {
        var icon = _getIcon(name);
        return icon || '';
    }

    function _iconSpan(icon, title) {
        if (!icon) return '';
        var titleAttr = title ? ' title="' + _escapeHtml(title) + '"' : '';
        return '<span style="display:inline-flex;align-items:center;vertical-align:middle;' + (title ? 'cursor:help;' : '') + '"' + titleAttr + '>' + icon + '</span>';
    }

    // =========================================================================
    // 4. BUSINESS LOGIC WRAPPERS
    // =========================================================================

    function _getAllRoles() {
        if (_roleState && typeof _roleState.getAllRoles === 'function') {
            return _roleState.getAllRoles();
        }
        if (typeof window.getAllRoles === 'function') {
            return window.getAllRoles();
        }
        if (typeof window.getRoles === 'function') {
            return window.getRoles();
        }
        return [];
    }

    function _getRoleById(id) {
        if (typeof window.getRoleById === 'function') {
            return window.getRoleById(id);
        }
        return null;
    }

    function _getRoleCategories() {
        if (_roleState && typeof _roleState.getCategories === 'function') {
            return _roleState.getCategories();
        }
        if (typeof window.getRoleCategories === 'function') {
            return window.getRoleCategories();
        }
        return {};
    }

    // =========================================================================
    // 5. ROLE SELECTOR MODAL
    // =========================================================================

    /**
     * Opens a role selector modal
     * @param {Object} options - Options
     * @param {string} options.title - Modal title (default: 'Select Role')
     * @param {string} options.preselectedId - Pre-selected role ID
     * @param {string} options.categoryFilter - Filter by category
     * @param {string} options.searchPlaceholder - Search placeholder
     * @param {Function} options.onSelect - Callback when role is selected
     * @param {Function} options.onCancel - Callback when cancelled
     * @param {boolean} options.showStats - Show role statistics (default: false)
     * @param {string} options.emptyMessage - Message when no roles found
     * @param {Array} options.excludeIds - Role IDs to exclude
     * @param {string} options.context - Context name for logging
     * @returns {Object|null} Modal reference or null
     */
    function openRoleSelector(options) {
        if (_processingModal) {
            _showToast('Already processing a modal action', 'warning');
            return null;
        }
        if (_roleSelectorOpen) {
            _showToast('Role selector already open', 'warning');
            return null;
        }

        _processingModal = true;
        _roleSelectorOpen = true;

        try {
            options = options || {};
            var title = options.title || 'Select Role';
            var preselectedId = options.preselectedId || null;
            var categoryFilter = options.categoryFilter || 'all';
            var searchPlaceholder = options.searchPlaceholder || 'Search roles...';
            var onSelect = options.onSelect || function() {};
            var onCancel = options.onCancel || function() {};
            var showStats = options.showStats || false;
            var emptyMessage = options.emptyMessage || 'No roles found';
            var excludeIds = options.excludeIds || [];
            var context = options.context || '';

            var allRoles = _getAllRoles();
            var categories = _getRoleCategories();

            // Apply filters
            var filteredRoles = allRoles.slice();

            if (categoryFilter !== 'all') {
                filteredRoles = filteredRoles.filter(function(r) {
                    return r.category === categoryFilter;
                });
            }

            if (excludeIds.length > 0) {
                var excludeSet = {};
                for (var i = 0; i < excludeIds.length; i++) {
                    excludeSet[excludeIds[i]] = true;
                }
                filteredRoles = filteredRoles.filter(function(r) {
                    return !excludeSet[r.id];
                });
            }

            // Sort by name
            filteredRoles.sort(function(a, b) {
                return (a.name || '').localeCompare(b.name || '');
            });

            // Build category options
            var categoryOptions = '<option value="all">All Categories</option>';
            for (var catId in categories) {
                if (categories.hasOwnProperty(catId)) {
                    var cat = categories[catId];
                    var selected = (categoryFilter === catId) ? 'selected' : '';
                    var icon = cat.icon || '⌇';
                    categoryOptions += '<option value="' + catId + '" ' + selected + '>' + icon + ' ' + _escapeHtml(cat.name) + '</option>';
                }
            }

            // Build role list HTML
            var roleListHtml = '';
            if (filteredRoles.length === 0) {
                roleListHtml = '<div style="color: var(--dim); text-align: center; padding: 30px; font-size: 0.6rem;">' + _escapeHtml(emptyMessage) + '</div>';
            } else {
                roleListHtml = '<div style="display: flex; flex-direction: column; gap: 4px;">';
                for (var i = 0; i < filteredRoles.length; i++) {
                    var r = filteredRoles[i];
                    var isSelected = (preselectedId === r.id);
                    var icon = r.icon || '◉';
                    var catName = categories[r.category] ? categories[r.category].name : 'Uncategorized';

                    var statsHtml = '';
                    if (showStats) {
                        var stats = _roleQueries ? _roleQueries.getRoleStatistics(r.id) : null;
                        if (stats) {
                            statsHtml = '<div style="font-size: 0.45rem; color: var(--dim); margin-top: 2px;">' +
                                'Characters: ' + stats.totalCharacters +
                                ' · Avg Skill: ' + stats.averageSkill +
                                ' · Masters: ' + stats.masterCount +
                                '</div>';
                        }
                    }

                    roleListHtml +=
                        '<div class="role-select-item" data-role-id="' + r.id + '" style="' +
                        'background: ' + (isSelected ? 'rgba(var(--accent-rgb), 0.12)' : 'var(--bg2)') + ';' +
                        'border: 1px solid ' + (isSelected ? 'var(--accent)' : 'var(--border)') + ';' +
                        'border-radius: 6px;' +
                        'padding: 10px 12px;' +
                        'cursor: pointer;' +
                        'transition: all 0.1s;' +
                        '">' +
                        '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">' +
                        '<div>' +
                        '<span style="font-size: 0.85rem;">' + icon + ' <strong>' + _escapeHtml(r.name) + '</strong></span>' +
                        '<span style="font-size: 0.55rem; color: var(--dim); margin-left: 8px;">' + _escapeHtml(catName) + '</span>' +
                        (isSelected ? '<span style="font-size: 0.55rem; background: var(--accent); padding: 2px 8px; border-radius: 12px; color: white; margin-left: 8px;">Selected</span>' : '') +
                        '</div>' +
                        '<div style="font-size: 0.5rem; color: var(--accent);">' +
                        (r.specializations && r.specializations.length > 0 ? r.specializations.length + ' specs' : '') +
                        '</div>' +
                        '</div>' +
                        statsHtml +
                        (r.notes ? '<div style="font-size: 0.5rem; color: var(--dim); margin-top: 4px;">' + _escapeHtml(r.notes) + '</div>' : '') +
                        '</div>';
                }
                roleListHtml += '</div>';
            }

            // NOTE: Create button has been removed - users must select from existing roles only

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px;">' +
                '<input type="text" id="roleSelectSearch" placeholder="' + _escapeHtml(searchPlaceholder) + '" style="flex: 1; min-width: 80px; padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.65rem; color: var(--text);">' +
                '<select id="roleSelectCategory" style="padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.65rem; color: var(--text);">' +
                categoryOptions +
                '</select>' +
                '</div>' +
                '</div>' +
                '<div id="roleSelectList" style="max-height: 350px; overflow-y: auto;">' +
                roleListHtml +
                '</div>';

            var modal = _openModal({
                title: title,
                content: modalContent,
                confirmText: 'Close',
                cancelText: 'Cancel',
                onConfirm: function() {
                    _roleSelectorOpen = false;
                    _processingModal = false;
                    onCancel();
                },
                onCancel: function() {
                    _roleSelectorOpen = false;
                    _processingModal = false;
                    onCancel();
                }
            });

            // Event handlers
            setTimeout(function() {
                var searchInput = document.getElementById('roleSelectSearch');
                var categorySelect = document.getElementById('roleSelectCategory');
                var roleList = document.getElementById('roleSelectList');

                function filterRoles() {
                    var searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
                    var category = categorySelect ? categorySelect.value : 'all';

                    var items = roleList ? roleList.querySelectorAll('.role-select-item') : [];
                    var visibleCount = 0;

                    for (var i = 0; i < items.length; i++) {
                        var item = items[i];
                        var roleId = item.dataset.roleId;
                        var role = _getRoleById(roleId);
                        var show = true;

                        if (!role) show = false;

                        if (show && category !== 'all' && role.category !== category) {
                            show = false;
                        }

                        if (show && searchTerm) {
                            var nameMatch = role.name.toLowerCase().indexOf(searchTerm) !== -1;
                            var notesMatch = role.notes && role.notes.toLowerCase().indexOf(searchTerm) !== -1;
                            if (!nameMatch && !notesMatch) {
                                show = false;
                            }
                        }

                        item.style.display = show ? 'block' : 'none';
                        if (show) visibleCount++;
                    }

                    // Show empty message if needed
                    if (visibleCount === 0 && roleList) {
                        var emptyMsg = roleList.querySelector('.empty-message');
                        if (!emptyMsg) {
                            var msg = document.createElement('div');
                            msg.className = 'empty-message';
                            msg.style.cssText = 'color: var(--dim); text-align: center; padding: 30px; font-size: 0.6rem;';
                            msg.textContent = 'No roles match your filters';
                            roleList.appendChild(msg);
                        } else {
                            emptyMsg.style.display = 'block';
                        }
                    } else if (roleList) {
                        var emptyMsg = roleList.querySelector('.empty-message');
                        if (emptyMsg) {
                            emptyMsg.style.display = 'none';
                        }
                    }
                }

                if (searchInput) {
                    searchInput.addEventListener('input', filterRoles);
                }

                if (categorySelect) {
                    categorySelect.addEventListener('change', filterRoles);
                }

                // Role item click handlers
                var items = roleList ? roleList.querySelectorAll('.role-select-item') : [];
                for (var i = 0; i < items.length; i++) {
                    (function(item) {
                        item.addEventListener('click', function(e) {
                            if (e.target.closest('button')) return;
                            var roleId = this.dataset.roleId;
                            var role = _getRoleById(roleId);
                            if (role) {
                                _closeTopModal();
                                _roleSelectorOpen = false;
                                _processingModal = false;
                                onSelect(role);
                            }
                        });
                        item.addEventListener('mouseenter', function() {
                            if (!this.dataset.selected) {
                                this.style.background = 'var(--bg3)';
                            }
                        });
                        item.addEventListener('mouseleave', function() {
                            if (!this.dataset.selected) {
                                this.style.background = 'var(--bg2)';
                            }
                        });
                    })(items[i]);
                }

                // Filter roles with initial values
                filterRoles();

            }, 100);

            return modal;

        } catch (e) {
            _roleSelectorOpen = false;
            _processingModal = false;
            _showToast('Error opening role selector', 'error');
            return null;
        }
    }

    // =========================================================================
    // 6. ROLE PICKER FOR POSITION
    // =========================================================================

    /**
     * Opens a role picker specifically for position creation
     * @param {Object} options - Options
     * @param {string} options.title - Modal title (default: 'Select Required Role')
     * @param {string} options.context - Context for logging (e.g., 'government', 'household', 'residence')
     * @param {string} options.categoryFilter - Filter by category
     * @param {Function} options.onSelect - Callback when role is selected
     * @param {Function} options.onCancel - Callback when cancelled
     * @param {boolean} options.allowNone - Allow "No role" option (default: true)
     * @param {string} options.preselectedId - Pre-selected role ID
     * @returns {Object|null} Modal reference or null
     */
    function openRolePickerForPosition(options) {
        if (_processingModal) {
            _showToast('Already processing a modal action', 'warning');
            return null;
        }

        _processingModal = true;

        try {
            options = options || {};
            var title = options.title || 'Select Required Role';
            var context = options.context || '';
            var categoryFilter = options.categoryFilter || 'all';
            var onSelect = options.onSelect || function() {};
            var onCancel = options.onCancel || function() {};
            var allowNone = options.allowNone !== false;
            var preselectedId = options.preselectedId || null;

            var allRoles = _getAllRoles();
            var categories = _getRoleCategories();

            // Apply category filter
            var filteredRoles = allRoles.slice();
            if (categoryFilter !== 'all') {
                filteredRoles = filteredRoles.filter(function(r) {
                    return r.category === categoryFilter;
                });
            }

            filteredRoles.sort(function(a, b) {
                return (a.name || '').localeCompare(b.name || '');
            });

            // Build category options
            var categoryOptions = '<option value="all">All Categories</option>';
            for (var catId in categories) {
                if (categories.hasOwnProperty(catId)) {
                    var cat = categories[catId];
                    var selected = (categoryFilter === catId) ? 'selected' : '';
                    var icon = cat.icon || '⌇';
                    categoryOptions += '<option value="' + catId + '" ' + selected + '>' + icon + ' ' + _escapeHtml(cat.name) + '</option>';
                }
            }

            // Build role list HTML
            var roleListHtml = '';
            if (allowNone) {
                roleListHtml +=
                    '<div class="role-select-item" data-role-id="none" style="' +
                    'background: ' + (preselectedId === 'none' ? 'rgba(var(--accent-rgb), 0.12)' : 'var(--bg2)') + ';' +
                    'border: 1px solid ' + (preselectedId === 'none' ? 'var(--accent)' : 'var(--border)') + ';' +
                    'border-radius: 6px;' +
                    'padding: 10px 12px;' +
                    'cursor: pointer;' +
                    'transition: all 0.1s;' +
                    'margin-bottom: 4px;' +
                    '">' +
                    '<div style="display: flex; justify-content: space-between; align-items: center;">' +
                    '<span style="font-size: 0.85rem;">⌇ <strong>No role required</strong></span>' +
                    '<span style="font-size: 0.55rem; color: var(--dim);">Clear any role requirement</span>' +
                    '</div>' +
                    '</div>';
            }

            if (filteredRoles.length === 0 && !allowNone) {
                roleListHtml += '<div style="color: var(--dim); text-align: center; padding: 30px; font-size: 0.6rem;">No roles found in this category</div>';
            } else {
                for (var i = 0; i < filteredRoles.length; i++) {
                    var r = filteredRoles[i];
                    var isSelected = (preselectedId === r.id);
                    var icon = r.icon || '◉';
                    var catName = categories[r.category] ? categories[r.category].name : 'Uncategorized';

                    roleListHtml +=
                        '<div class="role-select-item" data-role-id="' + r.id + '" style="' +
                        'background: ' + (isSelected ? 'rgba(var(--accent-rgb), 0.12)' : 'var(--bg2)') + ';' +
                        'border: 1px solid ' + (isSelected ? 'var(--accent)' : 'var(--border)') + ';' +
                        'border-radius: 6px;' +
                        'padding: 8px 12px;' +
                        'cursor: pointer;' +
                        'transition: all 0.1s;' +
                        'margin-bottom: 4px;' +
                        '">' +
                        '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">' +
                        '<div>' +
                        '<span style="font-size: 0.85rem;">' + icon + ' <strong>' + _escapeHtml(r.name) + '</strong></span>' +
                        '<span style="font-size: 0.55rem; color: var(--dim); margin-left: 8px;">' + _escapeHtml(catName) + '</span>' +
                        (isSelected ? '<span style="font-size: 0.55rem; background: var(--accent); padding: 2px 8px; border-radius: 12px; color: white; margin-left: 8px;">Selected</span>' : '') +
                        '</div>' +
                        '<div style="font-size: 0.5rem; color: var(--accent);">' +
                        (r.specializations && r.specializations.length > 0 ? r.specializations.length + ' specs' : '') +
                        '</div>' +
                        '</div>' +
                        (r.notes ? '<div style="font-size: 0.5rem; color: var(--dim); margin-top: 4px;">' + _escapeHtml(r.notes) + '</div>' : '') +
                        '</div>';
                }
            }

            // NOTE: Create button has been removed - users must select from existing roles only

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px;">' +
                '<input type="text" id="rolePickerSearch" placeholder="Search roles..." style="flex: 1; min-width: 80px; padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.65rem; color: var(--text);">' +
                '<select id="rolePickerCategory" style="padding: 6px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; font-size: 0.65rem; color: var(--text);">' +
                categoryOptions +
                '</select>' +
                '</div>' +
                '</div>' +
                '<div id="rolePickerList" style="max-height: 300px; overflow-y: auto;">' +
                roleListHtml +
                '</div>';

            var modal = _openModal({
                title: title,
                content: modalContent,
                confirmText: 'Cancel',
                cancelText: '',
                onConfirm: function() {
                    _processingModal = false;
                    onCancel();
                },
                onCancel: function() {
                    _processingModal = false;
                    onCancel();
                }
            });

            // Event handlers
            setTimeout(function() {
                var searchInput = document.getElementById('rolePickerSearch');
                var categorySelect = document.getElementById('rolePickerCategory');
                var roleList = document.getElementById('rolePickerList');

                function filterRoles() {
                    var searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
                    var category = categorySelect ? categorySelect.value : 'all';

                    var items = roleList ? roleList.querySelectorAll('.role-select-item') : [];
                    var visibleCount = 0;

                    for (var i = 0; i < items.length; i++) {
                        var item = items[i];
                        var roleId = item.dataset.roleId;
                        var show = true;

                        if (roleId === 'none') {
                            // Always show "None" option
                            item.style.display = 'block';
                            visibleCount++;
                            continue;
                        }

                        var role = _getRoleById(roleId);
                        if (!role) show = false;

                        if (show && category !== 'all' && role.category !== category) {
                            show = false;
                        }

                        if (show && searchTerm) {
                            var nameMatch = role.name.toLowerCase().indexOf(searchTerm) !== -1;
                            var notesMatch = role.notes && role.notes.toLowerCase().indexOf(searchTerm) !== -1;
                            if (!nameMatch && !notesMatch) {
                                show = false;
                            }
                        }

                        item.style.display = show ? 'block' : 'none';
                        if (show) visibleCount++;
                    }

                    // Show empty message if needed
                    if (visibleCount === 0 && roleList) {
                        var emptyMsg = roleList.querySelector('.empty-message');
                        if (!emptyMsg) {
                            var msg = document.createElement('div');
                            msg.className = 'empty-message';
                            msg.style.cssText = 'color: var(--dim); text-align: center; padding: 30px; font-size: 0.6rem;';
                            msg.textContent = 'No roles match your filters';
                            roleList.appendChild(msg);
                        } else {
                            emptyMsg.style.display = 'block';
                        }
                    } else if (roleList) {
                        var emptyMsg = roleList.querySelector('.empty-message');
                        if (emptyMsg) {
                            emptyMsg.style.display = 'none';
                        }
                    }
                }

                if (searchInput) {
                    searchInput.addEventListener('input', filterRoles);
                }

                if (categorySelect) {
                    categorySelect.addEventListener('change', filterRoles);
                }

                // Role item click handlers
                var items = roleList ? roleList.querySelectorAll('.role-select-item') : [];
                for (var i = 0; i < items.length; i++) {
                    (function(item) {
                        item.addEventListener('click', function(e) {
                            if (e.target.closest('button')) return;
                            var roleId = this.dataset.roleId;

                            if (roleId === 'none') {
                                _closeTopModal();
                                _processingModal = false;
                                onSelect(null);
                                return;
                            }

                            var role = _getRoleById(roleId);
                            if (role) {
                                _closeTopModal();
                                _processingModal = false;
                                onSelect(role);
                            }
                        });
                        item.addEventListener('mouseenter', function() {
                            if (!this.dataset.selected) {
                                this.style.background = 'var(--bg3)';
                            }
                        });
                        item.addEventListener('mouseleave', function() {
                            if (!this.dataset.selected) {
                                this.style.background = 'var(--bg2)';
                            }
                        });
                    })(items[i]);
                }

                // Filter roles with initial values
                filterRoles();

            }, 100);

            return modal;

        } catch (e) {
            _processingModal = false;
            _showToast('Error opening role picker', 'error');
            return null;
        }
    }

    // =========================================================================
    // 7. ROLE MANAGEMENT MODAL
    // =========================================================================

    /**
     * Opens a full role management modal (view only, no create)
     * @param {Object} options - Options
     * @param {Function} options.onSelect - Callback when a role is selected
     * @param {Function} options.onComplete - Callback when modal is closed
     * @param {string} options.context - Context for logging
     * @returns {Object|null} Modal reference or null
     */
    function openRoleManagementModal(options) {
        if (typeof window.openListRolesModal === 'function') {
            return window.openListRolesModal(options ? options.onSelect : null);
        }

        if (_processingModal) {
            _showToast('Already processing a modal action', 'warning');
            return null;
        }

        _processingModal = true;

        try {
            options = options || {};
            var onSelect = options.onSelect || function() {};
            var onComplete = options.onComplete || function() {};
            var context = options.context || '';

            var allRoles = _getAllRoles();
            var categories = _getRoleCategories();

            // Sort roles by category then name
            var sortedRoles = allRoles.slice().sort(function(a, b) {
                var catCompare = (a.category || '').localeCompare(b.category || '');
                if (catCompare !== 0) return catCompare;
                return (a.name || '').localeCompare(b.name || '');
            });

            // Group by category
            var grouped = {};
            for (var i = 0; i < sortedRoles.length; i++) {
                var r = sortedRoles[i];
                var cat = r.category || 'uncategorized';
                if (!grouped[cat]) grouped[cat] = [];
                grouped[cat].push(r);
            }

            // Build role list HTML
            var roleListHtml = '';
            var catKeys = Object.keys(grouped).sort();

            if (catKeys.length === 0) {
                roleListHtml = '<div style="color: var(--dim); text-align: center; padding: 40px; font-size: 0.6rem;">No roles found</div>';
            } else {
                for (var c = 0; c < catKeys.length; c++) {
                    var catId = catKeys[c];
                    var cat = categories[catId] || { name: 'Uncategorized', icon: '⌇' };
                    var roles = grouped[catId];

                    roleListHtml +=
                        '<div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--border-light);">' +
                        '<div style="font-size: 0.6rem; color: var(--accent); margin-bottom: 6px;">' + (cat.icon || '⌇') + ' ' + _escapeHtml(cat.name) + ' (' + roles.length + ')</div>';

                    for (var i = 0; i < roles.length; i++) {
                        var r = roles[i];
                        var icon = r.icon || '◉';

                        roleListHtml +=
                            '<div class="role-mgmt-item" data-role-id="' + r.id + '" style="' +
                            'display: flex; justify-content: space-between; align-items: center; ' +
                            'padding: 6px 10px; ' +
                            'background: var(--bg2); ' +
                            'border-radius: 4px; ' +
                            'margin-bottom: 2px; ' +
                            'cursor: pointer; ' +
                            'transition: all 0.1s;' +
                            '">' +
                            '<div>' +
                            '<span style="font-size: 0.65rem;">' + icon + ' ' + _escapeHtml(r.name) + '</span>' +
                            (r.specializations && r.specializations.length > 0 ? ' <span style="font-size: 0.45rem; color: var(--dim);">(' + r.specializations.length + ' specs)</span>' : '') +
                            '</div>' +
                            '<div style="display: flex; gap: 4px;">' +
                            '<button class="role-mgmt-select-btn" data-role-id="' + r.id + '" style="padding: 2px 8px; font-size: 0.45rem; background: var(--accent-dim); border: 1px solid var(--accent); border-radius: 3px; cursor: pointer;">Select</button>' +
                            '</div>' +
                            '</div>';
                    }

                    roleListHtml += '</div>';
                }
            }

            // NOTE: Create button has been removed - users must select from existing roles only

            var modalContent =
                '<div style="margin-bottom: 16px;">' +
                '<div style="font-size: 0.65rem; color: var(--dim); padding: 4px 0;">Select a role from the list below</div>' +
                '</div>' +
                '<div id="roleMgmtList" style="max-height: 400px; overflow-y: auto;">' +
                roleListHtml +
                '</div>' +
                '<div style="margin-top: 12px; padding: 8px; background: var(--bg3); border-radius: 6px; font-size: 0.55rem;">' +
                'Click "Select" to choose a role. Roles can be created and managed in the Role Manager.' +
                '</div>';

            var modal = _openModal({
                title: 'Select Role',
                content: modalContent,
                confirmText: 'Close',
                cancelText: '',
                onConfirm: function() {
                    _processingModal = false;
                    onComplete();
                },
                onCancel: function() {
                    _processingModal = false;
                    onComplete();
                }
            });

            // Event handlers
            setTimeout(function() {
                // Select buttons
                var selectBtns = document.querySelectorAll('.role-mgmt-select-btn');
                for (var i = 0; i < selectBtns.length; i++) {
                    (function(btn) {
                        btn.addEventListener('click', function(e) {
                            e.stopPropagation();
                            var roleId = this.dataset.roleId;
                            var role = _getRoleById(roleId);
                            if (role) {
                                _closeTopModal();
                                _processingModal = false;
                                onSelect(role);
                            }
                        });
                    })(selectBtns[i]);
                }

                // Click on role item to select
                var items = document.querySelectorAll('.role-mgmt-item');
                for (var i = 0; i < items.length; i++) {
                    (function(item) {
                        item.addEventListener('click', function(e) {
                            if (e.target.closest('button')) return;
                            var roleId = this.dataset.roleId;
                            var role = _getRoleById(roleId);
                            if (role) {
                                _closeTopModal();
                                _processingModal = false;
                                onSelect(role);
                            }
                        });
                        item.addEventListener('mouseenter', function() {
                            this.style.background = 'var(--bg3)';
                        });
                        item.addEventListener('mouseleave', function() {
                            this.style.background = 'var(--bg2)';
                        });
                    })(items[i]);
                }
            }, 100);

            return modal;

        } catch (e) {
            _processingModal = false;
            _showToast('Error opening role management modal', 'error');
            return null;
        }
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.openRoleSelector = openRoleSelector;
    window.openRolePickerForPosition = openRolePickerForPosition;
    window.openRoleManagementModal = openRoleManagementModal;

    // Legacy aliases
    window._openRoleSelector = openRoleSelector;
    window._openRolePickerForPosition = openRolePickerForPosition;
    window._openRoleManagementModal = openRoleManagementModal;

    // ES Module exports
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            openRoleSelector: openRoleSelector,
            openRolePickerForPosition: openRolePickerForPosition,
            openRoleManagementModal: openRoleManagementModal
        };
    }

})();