/**
 * =============================================================================
 * ROLES TAB (js/tabs/roles-tab.js)
 * =============================================================================
 * 
 * A thin view layer for the Roles tab.
 * Shows the detail panel for the selected role.
 * 
 * FEATURES:
 *   - Shows role detail panel for selected role
 *   - Edit role properties
 *   - View characters with the role
 *   - Manage specializations
 *   - Delete role
 * 
 * DEPENDENCIES:
 *   - role-ui-list.js (renderRoleDetailPanel)
 *   - modals-roles.js (all role modals)
 *   - role-queries.js (getRoles, getRoleStatistics)
 *   - ui.js (registerTabRenderer, showToast)
 *   - accessors.js (getRoles, getRoleById)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    var _initialized = false;
    var _rendering = false;
    var _registered = false;
    var _selectedRoleId = null;
    var _registrationAttempts = 0;
    var _maxRegistrationAttempts = 10;

    // =========================================================================
    // DEPENDENCY HELPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _getIcon(name) {
        if (typeof window._getIcon === 'function') return window._getIcon(name);
        if (window.Icons && window.Icons[name]) return window.Icons[name];
        return '';
    }

    function _showToast(msg, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(msg, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(msg, type);
        }
    }

    function _getRoleById(id) {
        if (typeof window.getRoleById === 'function') {
            return window.getRoleById(id);
        }
        if (typeof RoleState !== 'undefined' && RoleState.getRole) {
            return RoleState.getRole(id);
        }
        return null;
    }

    function _getAllRoles() {
        if (typeof RoleState !== 'undefined' && RoleState.getAllRoles) {
            return RoleState.getAllRoles();
        }
        if (typeof window.getAllRoles === 'function') {
            return window.getAllRoles();
        }
        if (typeof window.getRoles === 'function') {
            return window.getRoles();
        }
        return [];
    }

    // =========================================================================
    // SET SELECTED ROLE (called from sidebar)
    // =========================================================================

    function setSelectedRole(roleId) {
        _selectedRoleId = roleId;
        window._selectedRoleId = roleId;
        renderRoleDetail('tab-details');
    }

    function getSelectedRole() {
        return _selectedRoleId || window._selectedRoleId || null;
    }

    // =========================================================================
    // RENDER ROLE DETAIL - FIXED to stay on same role after save
    // =========================================================================

    function renderRoleDetail(containerId) {
        if (_rendering) return;
        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) {
                console.warn('renderRoleDetail: Container not found:', containerId);
                _rendering = false;
                return;
            }

            // Get the selected role ID from multiple sources
            var roleId = _selectedRoleId || window._selectedRoleId || null;
            
            // If we have a roleId but it's not set in _selectedRoleId, sync it
            if (roleId && !_selectedRoleId) {
                _selectedRoleId = roleId;
            }

            if (!roleId) {
                container.innerHTML = 
                    '<div class="placeholder" style="text-align:center;padding:40px;color:var(--dim);font-size:0.9rem;">' +
                    '<div style="font-size:2rem;margin-bottom:12px;">' + _getIcon('CIRCLE') + '</div>' +
                    'Select a role from the sidebar' +
                    '</div>';
                _rendering = false;
                return;
            }

            var role = _getRoleById(roleId);
            if (!role) {
                container.innerHTML = 
                    '<div class="placeholder" style="text-align:center;padding:40px;color:var(--dim);font-size:0.9rem;">' +
                    '<div style="font-size:2rem;margin-bottom:12px;">' + _getIcon('WARNING') + '</div>' +
                    'Role not found' +
                    '</div>';
                _rendering = false;
                return;
            }

            // Use RoleUI.renderRoleDetailPanel if available
            var RUI = window.RoleUI;
            if (RUI && typeof RUI.renderRoleDetailPanel === 'function') {
                try {
                    RUI.renderRoleDetailPanel(
                        containerId,
                        roleId,
                        // onBack - clear selection and go to placeholder
                        function() {
                            _selectedRoleId = null;
                            window._selectedRoleId = null;
                            renderRoleDetail(containerId);
                            // Refresh sidebar
                            if (typeof window.renderRoleList === 'function') {
                                window.renderRoleList();
                            }
                        },
                        // onRefresh - RE-RENDER THE SAME ROLE (don't navigate away!)
                        function() {
                            // Keep the same roleId, just re-render
                            renderRoleDetail(containerId);
                            // Refresh sidebar to update selection
                            if (typeof window.renderRoleList === 'function') {
                                window.renderRoleList();
                            }
                        },
                        { mastersOnly: false }
                    );
                    _rendering = false;
                    return;
                } catch(e) {
                    console.error('RoleUI.renderRoleDetailPanel error:', e);
                    // Fall through to manual render
                }
            }

            // Fallback: Manual render with full details
            var stats = window.RoleQueries ? window.RoleQueries.getRoleStatistics(roleId) : {};
            var categories = window.RoleState ? window.RoleState.getCategories() : {};
            var catName = categories[role.category] ? categories[role.category].name : 'Uncategorized';
            var icon = role.icon || 'CIRCLE';
            var iconDisplay = _getIcon(icon) || '◉';
            var genderIcon = role.genderRestriction === 'male' ? '♂' : (role.genderRestriction === 'female' ? '♀' : '⚥');
            var charCount = 0;
            if (window.RoleQueries && window.RoleQueries.getCharactersWithRole) {
                charCount = window.RoleQueries.getCharactersWithRole(roleId).length;
            }

            var editIcon = _getIcon('EDIT');
            var personIcon = _getIcon('PERSON');
            var crossIcon = _getIcon('X_HEAVY');
            var plusIcon = _getIcon('PLUS');

            var specializationsHtml = '';
            if (role.specializations && role.specializations.length > 0) {
                specializationsHtml = role.specializations.map(function(s) {
                    return '<span style="display:inline-block;font-size:0.55rem;background:var(--bg3);padding:2px 10px;border-radius:12px;border:1px solid var(--border-light);margin:2px;">' + _escapeHtml(s) + '</span>';
                }).join('');
            } else {
                specializationsHtml = '<span style="font-size:0.55rem;color:var(--dim);">No specializations</span>';
            }

            container.innerHTML = 
                '<div class="role-detail-panel" style="padding:8px;">' +
                // Header
                '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:16px;padding:12px 16px;background:var(--bg2);border-radius:8px;border:1px solid var(--border);">' +
                '<div>' +
                '<span style="font-size:1.4rem;">' + iconDisplay + '</span> ' +
                '<strong style="font-size:1.1rem;">' + _escapeHtml(role.name) + '</strong>' +
                '<span style="font-size:0.6rem;color:var(--dim);margin-left:8px;">' + genderIcon + ' ' + _escapeHtml(catName) + '</span>' +
                '</div>' +
                '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
                '<button id="detailEditBtn" style="padding:4px 12px;font-size:0.55rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:4px;cursor:pointer;">' + editIcon + ' Edit</button>' +
                '<button id="detailDeleteBtn" style="padding:4px 12px;font-size:0.55rem;background:#8a2020;border:none;border-radius:4px;color:white;cursor:pointer;">' + crossIcon + ' Delete</button>' +
                '<button id="detailViewCharsBtn" style="padding:4px 12px;font-size:0.55rem;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">' + personIcon + ' View Characters</button>' +
                '</div>' +
                '</div>' +

                // Stats grid
                '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px;">' +
                '<div style="background:var(--bg2);padding:10px;border-radius:6px;text-align:center;border:1px solid var(--border);"><div style="font-size:0.45rem;color:var(--dim);">Characters</div><div style="font-size:1rem;font-weight:bold;">' + charCount + '</div></div>' +
                '<div style="background:var(--bg2);padding:10px;border-radius:6px;text-align:center;border:1px solid var(--border);"><div style="font-size:0.45rem;color:var(--dim);">Avg Skill</div><div style="font-size:1rem;font-weight:bold;color:var(--accent);">' + (stats.averageSkill || 0) + '</div></div>' +
                '<div style="background:var(--bg2);padding:10px;border-radius:6px;text-align:center;border:1px solid var(--border);"><div style="font-size:0.45rem;color:var(--dim);">Masters (91+)</div><div style="font-size:1rem;font-weight:bold;color:var(--success);">' + (stats.masterCount || 0) + '</div></div>' +
                '<div style="background:var(--bg2);padding:10px;border-radius:6px;text-align:center;border:1px solid var(--border);"><div style="font-size:0.45rem;color:var(--dim);">Can Teach</div><div style="font-size:1rem;font-weight:bold;color:var(--accent-light);">' + (stats.canTeachCount || 0) + '</div></div>' +
                '</div>' +

                // Details
                '<div style="background:var(--bg2);padding:12px 16px;border-radius:6px;border:1px solid var(--border);margin-bottom:12px;">' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:0.6rem;color:var(--dim);">' +
                '<div><strong>Gender Restriction:</strong> ' + (role.genderRestriction || 'both') + '</div>' +
                '<div><strong>Requires Literacy:</strong> ' + (role.requiresLiteracy ? 'Yes (' + (role.literacyLevel || 'literate') + ')' : 'No') + '</div>' +
                '<div><strong>Base Salary:</strong> ' + (role.baseSalary || 0) + ' gold/year</div>' +
                '<div><strong>Category:</strong> ' + _escapeHtml(catName) + '</div>' +
                '</div>' +
                '</div>' +

                // Specializations
                '<div style="background:var(--bg2);padding:12px 16px;border-radius:6px;border:1px solid var(--border);margin-bottom:12px;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:6px;">' +
                '<strong style="font-size:0.65rem;color:var(--accent);">Specializations</strong>' +
                '<button id="detailAddSpecBtn" style="padding:2px 10px;font-size:0.5rem;background:var(--accent);border:none;border-radius:4px;color:white;cursor:pointer;">' + plusIcon + ' Add</button>' +
                '</div>' +
                '<div style="display:flex;flex-wrap:wrap;gap:4px;">' + specializationsHtml + '</div>' +
                '</div>' +

                // Notes
                (role.notes ? '<div style="background:var(--bg2);padding:12px 16px;border-radius:6px;border:1px solid var(--border);margin-bottom:12px;font-size:0.6rem;color:var(--dim);"><strong>Notes:</strong> ' + _escapeHtml(role.notes) + '</div>' : '') +

                // Action buttons
                '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">' +
                '<button id="detailAssignBtn" style="padding:4px 12px;font-size:0.55rem;background:var(--accent);border:none;border-radius:4px;color:white;cursor:pointer;">Assign to Character</button>' +
                '<button id="detailBulkAssignBtn" style="padding:4px 12px;font-size:0.55rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:4px;cursor:pointer;">Bulk Assign</button>' +
                '</div>' +
                '</div>';

            // Attach event listeners
            _attachDetailEventListeners(roleId, containerId);

        } catch (e) {
            console.error('renderRoleDetail error:', e);
            var container = document.getElementById(containerId);
            if (container) {
                container.innerHTML = '<div class="placeholder" style="text-align:center;padding:40px;color:var(--danger);">Error loading role details</div>';
            }
        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // ATTACH DETAIL EVENT LISTENERS
    // =========================================================================

    function _attachDetailEventListeners(roleId, containerId) {
        var editBtn = document.getElementById('detailEditBtn');
        if (editBtn) {
            editBtn.removeEventListener('click', _editHandler);
            editBtn.addEventListener('click', _editHandler);
        }

        var deleteBtn = document.getElementById('detailDeleteBtn');
        if (deleteBtn) {
            deleteBtn.removeEventListener('click', _deleteHandler);
            deleteBtn.addEventListener('click', _deleteHandler);
        }

        var viewCharsBtn = document.getElementById('detailViewCharsBtn');
        if (viewCharsBtn) {
            viewCharsBtn.removeEventListener('click', _viewCharsHandler);
            viewCharsBtn.addEventListener('click', _viewCharsHandler);
        }

        var assignBtn = document.getElementById('detailAssignBtn');
        if (assignBtn) {
            assignBtn.removeEventListener('click', _assignHandler);
            assignBtn.addEventListener('click', _assignHandler);
        }

        var bulkAssignBtn = document.getElementById('detailBulkAssignBtn');
        if (bulkAssignBtn) {
            bulkAssignBtn.removeEventListener('click', _bulkAssignHandler);
            bulkAssignBtn.addEventListener('click', _bulkAssignHandler);
        }

        var addSpecBtn = document.getElementById('detailAddSpecBtn');
        if (addSpecBtn) {
            addSpecBtn.removeEventListener('click', _addSpecHandler);
            addSpecBtn.addEventListener('click', _addSpecHandler);
        }

        function _editHandler() {
            if (typeof window.openEditRoleModal === 'function') {
                window.openEditRoleModal(roleId, function() {
                    // Re-render the SAME role after edit
                    renderRoleDetail(containerId);
                    if (typeof window.renderRoleList === 'function') {
                        window.renderRoleList();
                    }
                });
            } else {
                _showToast('Edit role modal not available', 'error');
            }
        }

        function _deleteHandler() {
            if (typeof window.openDeleteRoleModal === 'function') {
                window.openDeleteRoleModal(roleId, function() {
                    _selectedRoleId = null;
                    window._selectedRoleId = null;
                    renderRoleDetail(containerId);
                    if (typeof window.renderRoleList === 'function') {
                        window.renderRoleList();
                    }
                });
            } else {
                _showToast('Delete role modal not available', 'error');
            }
        }

        function _viewCharsHandler() {
            if (typeof window.openViewCharactersWithRoleModal === 'function') {
                window.openViewCharactersWithRoleModal(roleId);
            } else {
                _showToast('View characters modal not available', 'error');
            }
        }

        function _assignHandler() {
            if (typeof window.openAssignRoleModal === 'function') {
                window.openAssignRoleModal(roleId, function() {
                    renderRoleDetail(containerId);
                });
            } else {
                _showToast('Assign role modal not available', 'error');
            }
        }

        function _bulkAssignHandler() {
            if (typeof window.openBulkAssignRoleModal === 'function') {
                window.openBulkAssignRoleModal(roleId, function() {
                    renderRoleDetail(containerId);
                });
            } else {
                _showToast('Bulk assign modal not available', 'error');
            }
        }

        function _addSpecHandler() {
            var spec = prompt('Enter new specialization:');
            if (spec && spec.trim()) {
                var role = _getRoleById(roleId);
                if (role) {
                    if (!role.specializations) role.specializations = [];
                    if (role.specializations.indexOf(spec.trim()) === -1) {
                        role.specializations.push(spec.trim());
                        if (typeof window.saveMasterData === 'function') {
                            window.saveMasterData();
                        }
                        if (typeof window.RoleState !== 'undefined' && 
                            typeof window.RoleState._updateRole === 'function') {
                            window.RoleState._updateRole(roleId, { specializations: role.specializations });
                        }
                        _showToast('Specialization added', 'success');
                        // Re-render the SAME role
                        renderRoleDetail(containerId);
                        if (typeof window.renderRoleList === 'function') {
                            window.renderRoleList();
                        }
                    } else {
                        _showToast('Specialization already exists', 'warning');
                    }
                }
            }
        }
    }

    // =========================================================================
    // TAB RENDERER - Registers as 'details'
    // =========================================================================

    function tabRenderer(containerId, locationId, summary) {
        renderRoleDetail(containerId);
    }

    // =========================================================================
    // REGISTER WITH TAB SYSTEM
    // =========================================================================

    function registerWithTabSystem() {
        if (_registered) return;
        
        if (typeof window.registerTabRenderer === 'function') {
            window.registerTabRenderer('details', tabRenderer, false);
            _registered = true;
            console.log('✅ RolesTab registered as renderer for "details" tab');
            return true;
        }
        
        return false;
    }

    // =========================================================================
    // INITIALIZATION
    // =========================================================================

    function init(containerId) {
        if (_initialized) return;
        _initialized = true;

        containerId = containerId || 'tab-details';

        // Register immediately
        var registered = registerWithTabSystem();

        // Also expose the render function directly
        window._renderRoleDetail = function(roleId) {
            _selectedRoleId = roleId;
            window._selectedRoleId = roleId;
            renderRoleDetail(containerId);
        };

        // If not registered, retry
        if (!registered) {
            var checkInterval = setInterval(function() {
                _registrationAttempts++;
                if (registerWithTabSystem()) {
                    clearInterval(checkInterval);
                    if (document.getElementById(containerId)) {
                        renderRoleDetail(containerId);
                    }
                } else if (_registrationAttempts >= _maxRegistrationAttempts) {
                    clearInterval(checkInterval);
                    console.warn('⚠️ Could not register RolesTab after ' + _maxRegistrationAttempts + ' attempts');
                    // Force render anyway
                    if (document.getElementById(containerId)) {
                        renderRoleDetail(containerId);
                    }
                }
            }, 200);
            return;
        }

        // Render when container is ready
        var checkContainer = function() {
            var container = document.getElementById(containerId);
            if (container) {
                renderRoleDetail(containerId);
                return;
            }
            setTimeout(checkContainer, 100);
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', checkContainer);
        } else {
            setTimeout(checkContainer, 50);
        }
    }

    // =========================================================================
    // EXPORTS
    // =========================================================================

    window.RolesTab = {
        init: init,
        renderRoleDetail: renderRoleDetail,
        tabRenderer: tabRenderer,
        registerWithTabSystem: registerWithTabSystem,
        setSelectedRole: setSelectedRole,
        getSelectedRole: getSelectedRole,
        _selectedRoleId: _selectedRoleId
    };

    function autoInit() {
        if (document.getElementById('tab-details')) {
            init('tab-details');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoInit);
    } else {
        setTimeout(autoInit, 100);
    }

})();