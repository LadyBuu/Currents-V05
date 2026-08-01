
 * =============================================================================
 * DEPARTMENTS TAB (js/tabs/government-departments-tab.js)
 * =============================================================================
 * 
 * PURPOSE: Provides a modular tab for viewing and managing government
 *          departments, positions, staff assignments, and salary budgets
 *          for a specific location.
 * 
 * DEPENDENCIES:
 *   - accessors.js (getPlaceById, getCharacters, getCharacterById)
 *   - government-state.js (GovernmentState)
 *   - government-commands.js (GovernmentCommands)
 *   - settlement-state.js (SettlementState)
 *   - formatting.js (escapeHtml)
 *   - icons.js (Icons)
 *   - ui.js (showToast)
 *   - modals-core.js (openModal, confirmDialog)
 *   - modals-char-select.js (openCharacterSelector)
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getCharacters() {
        return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
    }

    function _getGovernmentState() {
        return typeof window.GovernmentState !== 'undefined' ? window.GovernmentState : null;
    }

    function _getGovernmentCommands() {
        return typeof window.GovernmentCommands !== 'undefined' ? window.GovernmentCommands : null;
    }

    function _getSettlementData(locationId) {
        if (typeof window.getSettlementData === 'function') {
            return window.getSettlementData(locationId);
        }
        if (typeof window.getOrCreateSettlementData === 'function') {
            return window.getOrCreateSettlementData(locationId);
        }
        return null;
    }

    function _updateSettlementData(locationId, updates) {
        if (typeof window.SettlementState !== 'undefined' && 
            typeof window.SettlementState._updateSettlementData === 'function') {
            return window.SettlementState._updateSettlementData(locationId, updates);
        }
        return null;
    }

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (typeof str !== 'string') return String(str);
        return str.replace(/[&<>"']/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            if (m === '"') return '&quot;';
            if (m === "'") return '&#039;';
            return m;
        });
    }

    function _getIcon(name) {
        if (typeof window.getIcon === 'function') return window.getIcon(name);
        if (typeof window.Icons !== 'undefined' && window.Icons[name]) return window.Icons[name];
        return '';
    }

    function _showToast(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(message, type);
        }
    }

    function _openModal(options) {
        if (typeof window.openModal === 'function') return window.openModal(options);
        return null;
    }

    function _openCharacterSelector(options) {
        if (typeof window.openCharacterSelector === 'function') {
            return window.openCharacterSelector(options);
        }
        return null;
    }

    function _confirmDialog(message, title, onConfirm) {
        if (typeof window.confirmDialog === 'function') {
            window.confirmDialog(message, title, onConfirm);
            return true;
        }
        return false;
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') window.saveMasterData();
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') return window.getCurrentYearSafe();
        if (typeof window.getCurrentYear === 'function') return window.getCurrentYear();
        return 1250;
    }

    function _generateId(prefix) {
        if (typeof window.generateId === 'function') return window.generateId(prefix);
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }

    // =========================================================================
    // 2. HELPER FUNCTIONS
    // =========================================================================

    function _getDepartmentsForLocation(locationId) {
        var state = _getGovernmentState();
        if (!state) return [];
        var allDepts = state.getDepartments ? state.getDepartments() : [];
        var result = [];
        for (var i = 0; i < allDepts.length; i++) {
            if (allDepts[i].locationId === locationId && !allDepts[i].isDeprecated) {
                result.push(allDepts[i]);
            }
        }
        return result;
    }

    function _getActiveAssignments(department) {
        if (!department || !department.assignments) return [];
        return department.assignments.filter(function(a) { return !a.endYear; });
    }

    function _getPositionById(department, positionId) {
        if (!department || !department.positions) return null;
        for (var i = 0; i < department.positions.length; i++) {
            if (department.positions[i].id === positionId) {
                return department.positions[i];
            }
        }
        return null;
    }

    function _calculateTotalSalary(department) {
        var commands = _getGovernmentCommands();
        if (!commands) return 0;
        
        var total = 0;
        var assignments = _getActiveAssignments(department);
        for (var i = 0; i < assignments.length; i++) {
            var assignment = assignments[i];
            var position = _getPositionById(department, assignment.positionId);
            if (position && typeof commands._payGovernmentSalary === 'function') {
                // We need to calculate salary without actually paying
                // This is a placeholder - actual salary calculation would use economy system
                total += 50; // Placeholder: base salary
            }
        }
        return total;
    }

    function _getBudgetInfo(locationId) {
        var data = _getSettlementData(locationId);
        if (!data) return { allocated: 0, used: 0, remaining: 0 };
        
        var allocated = data.governmentSalaryBudget || 0;
        var used = data.salaryBudgetAllocated || 0;
        
        // Calculate actual salary requirements from departments
        var departments = _getDepartmentsForLocation(locationId);
        var required = 0;
        for (var i = 0; i < departments.length; i++) {
            required += _calculateTotalSalary(departments[i]);
        }
        
        return {
            allocated: allocated,
            used: used || required,
            required: required,
            remaining: Math.max(0, allocated - (used || required)),
            shortfall: Math.max(0, (used || required) - allocated)
        };
    }

    // =========================================================================
    // 3. RENDER FUNCTIONS
    // =========================================================================

    function _renderDepartmentCard(department, locationId) {
        var positions = department.positions || [];
        var assignments = _getActiveAssignments(department);
        var totalSalary = _calculateTotalSalary(department);
        var hasChildren = false;
        
        // Check if this department has children
        var state = _getGovernmentState();
        if (state && state.getDepartmentsByParent) {
            var children = state.getDepartmentsByParent(department.id);
            hasChildren = children && children.length > 0;
        }

        var html = '<div class="dept-card" data-dept-id="' + _escapeHtml(department.id) + '">';
        
        // Department header
        html += '<div class="dept-header">';
        html += '<div class="dept-title">';
        html += '<span class="dept-name">' + _escapeHtml(department.name) + '</span>';
        if (hasChildren) {
            html += '<span class="dept-badge dept-badge-children">Has Sub-departments</span>';
        }
        html += '</div>';
        html += '<div class="dept-actions">';
        html += '<button class="dept-btn dept-btn-add-position" data-action="add-position">' + _getIcon('PLUS') + ' Position</button>';
        html += '<button class="dept-btn dept-btn-edit" data-action="edit-dept">' + _getIcon('EDIT') + '</button>';
        html += '<button class="dept-btn dept-btn-delete" data-action="delete-dept">' + _getIcon('TRASH') + '</button>';
        html += '</div>';
        html += '</div>';

        // Department stats
        html += '<div class="dept-stats">';
        html += '<div class="dept-stat">';
        html += '<span class="dept-stat-label">Positions</span>';
        html += '<span class="dept-stat-value">' + positions.length + '</span>';
        html += '</div>';
        html += '<div class="dept-stat">';
        html += '<span class="dept-stat-label">Staff</span>';
        html += '<span class="dept-stat-value">' + assignments.length + '</span>';
        html += '</div>';
        html += '<div class="dept-stat">';
        html += '<span class="dept-stat-label">Salary Budget</span>';
        html += '<span class="dept-stat-value">' + totalSalary.toLocaleString() + 'g</span>';
        html += '</div>';
        html += '</div>';

        // Positions section
        if (positions.length > 0) {
            html += '<div class="dept-positions">';
            html += '<div class="dept-positions-header">';
            html += '<span>Positions</span>';
            html += '</div>';
            html += '<div class="dept-positions-list">';
            
            for (var i = 0; i < positions.length; i++) {
                var pos = positions[i];
                var posAssignments = assignments.filter(function(a) { return a.positionId === pos.id; });
                var isFilled = posAssignments.length > 0;
                
                html += '<div class="dept-position" data-position-id="' + _escapeHtml(pos.id) + '">';
                html += '<div class="dept-position-header">';
                html += '<span class="dept-position-name">' + _escapeHtml(pos.name) + '</span>';
                html += '<span class="dept-position-status ' + (isFilled ? 'filled' : 'vacant') + '">';
                html += isFilled ? 'Filled' : 'Vacant';
                html += '</span>';
                html += '</div>';
                
                if (pos.description) {
                    html += '<div class="dept-position-desc">' + _escapeHtml(pos.description) + '</div>';
                }
                
                if (pos.requiredRoleId) {
                    var role = typeof window.getRoleById === 'function' ? window.getRoleById(pos.requiredRoleId) : null;
                    html += '<div class="dept-position-requirement">';
                    html += 'Requires: ' + (role ? _escapeHtml(role.name) : _escapeHtml(pos.requiredRoleId));
                    if (pos.minSkillLevel) {
                        html += ' (Skill: ' + pos.minSkillLevel + '+ )';
                    }
                    html += '</div>';
                }
                
                // Assigned staff
                if (posAssignments.length > 0) {
                    html += '<div class="dept-position-staff">';
                    for (var a = 0; a < posAssignments.length; a++) {
                        var assign = posAssignments[a];
                        var char = _getCharacterById(assign.characterId);
                        html += '<div class="dept-staff-item">';
                        html += '<span class="dept-staff-name">' + (char ? _escapeHtml(char.name + (char.surname ? ' ' + char.surname : '')) : 'Unknown') + '</span>';
                        if (assign.title && assign.title !== pos.name) {
                            html += ' <span class="dept-staff-title">(' + _escapeHtml(assign.title) + ')</span>';
                        }
                        html += ' <span class="dept-staff-since">since ' + (assign.startYear || '?') + '</span>';
                        html += '<button class="dept-btn dept-btn-small dept-btn-remove-staff" data-assignment-id="' + _escapeHtml(assign.id) + '">' + _getIcon('X') + '</button>';
                        html += '</div>';
                    }
                    html += '</div>';
                }
                
                // Action buttons for position
                html += '<div class="dept-position-actions">';
                if (!isFilled) {
                    html += '<button class="dept-btn dept-btn-small dept-btn-assign" data-action="assign-staff" data-position-id="' + _escapeHtml(pos.id) + '">' + _getIcon('PLUS') + ' Assign</button>';
                }
                html += '<button class="dept-btn dept-btn-small dept-btn-edit-position" data-action="edit-position" data-position-id="' + _escapeHtml(pos.id) + '">' + _getIcon('EDIT') + '</button>';
                html += '<button class="dept-btn dept-btn-small dept-btn-delete-position" data-action="delete-position" data-position-id="' + _escapeHtml(pos.id) + '">' + _getIcon('TRASH') + '</button>';
                html += '</div>';
                html += '</div>';
            }
            
            html += '</div>';
            html += '</div>';
        } else {
            html += '<div class="dept-no-positions">';
            html += 'No positions defined. Add a position to start building this department.';
            html += '</div>';
        }

        // Description if any
        if (department.description) {
            html += '<div class="dept-description">' + _escapeHtml(department.description) + '</div>';
        }

        html += '</div>';
        return html;
    }

    function _renderDepartmentsTab(place) {
        if (!place) {
            return '<div class="dept-details-empty">Select a location to view government departments.</div>';
        }

        var departments = _getDepartmentsForLocation(place.id);
        var budgetInfo = _getBudgetInfo(place.id);

        var html = '<div class="dept-tab-container">';
        
        // Header
        html += '<div class="dept-tab-header">';
        html += '<h3>Government Departments - ' + _escapeHtml(place.displayName || place.name) + '</h3>';
        html += '<div class="dept-tab-actions">';
        html += '<button class="dept-btn dept-btn-add" data-action="add-department">' + _getIcon('PLUS') + ' Add Department</button>';
        html += '<button class="dept-btn dept-btn-refresh" data-action="refresh-depts">' + _getIcon('REFRESH') + ' Refresh</button>';
        html += '</div>';
        html += '</div>';

        // Budget summary
        html += '<div class="dept-budget-summary">';
        html += '<div class="dept-budget-item">';
        html += '<span class="dept-budget-label">Salary Budget</span>';
        html += '<span class="dept-budget-value">' + budgetInfo.allocated.toLocaleString() + 'g</span>';
        html += '</div>';
        html += '<div class="dept-budget-item">';
        html += '<span class="dept-budget-label">Required</span>';
        html += '<span class="dept-budget-value">' + budgetInfo.required.toLocaleString() + 'g</span>';
        html += '</div>';
        html += '<div class="dept-budget-item ' + (budgetInfo.shortfall > 0 ? 'dept-budget-shortfall' : 'dept-budget-surplus') + '">';
        html += '<span class="dept-budget-label">' + (budgetInfo.shortfall > 0 ? 'Shortfall' : 'Surplus') + '</span>';
        html += '<span class="dept-budget-value">' + (budgetInfo.shortfall > 0 ? budgetInfo.shortfall.toLocaleString() : budgetInfo.remaining.toLocaleString()) + 'g</span>';
        html += '</div>';
        html += '</div>';

        // Departments list
        if (departments.length === 0) {
            html += '<div class="dept-empty">';
            html += '<p>No government departments found for this location.</p>';
            html += '<button class="dept-btn dept-btn-add" data-action="add-department">' + _getIcon('PLUS') + ' Create First Department</button>';
            html += '</div>';
        } else {
            html += '<div class="dept-list">';
            for (var i = 0; i < departments.length; i++) {
                html += _renderDepartmentCard(departments[i], place.id);
            }
            html += '</div>';
        }

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 4. MODALS
    // =========================================================================

    function _openAddDepartmentModal(locationId) {
        var place = _getPlaceById(locationId);
        if (!place) {
            _showToast('Location not found', 'error');
            return;
        }

        var content = '<div class="dept-edit-form">';
        content += '<div class="form-group">';
        content += '<label for="dept-name-input">Department Name *</label>';
        content += '<input type="text" id="dept-name-input" class="form-control" placeholder="e.g., Royal Treasury">';
        content += '</div>';
        content += '<div class="form-group">';
        content += '<label for="dept-desc-input">Description</label>';
        content += '<textarea id="dept-desc-input" class="form-control" rows="2" placeholder="Brief description of this department"></textarea>';
        content += '</div>';
        content += '<div class="form-group">';
        content += '<label for="dept-parent-select">Parent Department (optional)</label>';
        content += '<select id="dept-parent-select" class="form-control">';
        content += '<option value="">None</option>';
        var existing = _getDepartmentsForLocation(locationId);
        for (var i = 0; i < existing.length; i++) {
            content += '<option value="' + _escapeHtml(existing[i].id) + '">' + _escapeHtml(existing[i].name) + '</option>';
        }
        content += '</select>';
        content += '</div>';
        content += '</div>';

        _openModal({
            title: 'Create New Department in ' + (place.displayName || place.name),
            content: content,
            confirmText: 'Create Department',
            cancelText: 'Cancel',
            onConfirm: function() {
                var nameInput = document.getElementById('dept-name-input');
                var descInput = document.getElementById('dept-desc-input');
                var parentSelect = document.getElementById('dept-parent-select');
                
                var name = nameInput ? nameInput.value.trim() : '';
                var description = descInput ? descInput.value.trim() : '';
                var parentId = parentSelect ? parentSelect.value : null;

                if (!name) {
                    _showToast('Department name is required', 'error');
                    return;
                }

                var commands = _getGovernmentCommands();
                if (!commands || !commands.createDepartment) {
                    _showToast('Government commands not available', 'error');
                    return;
                }

                var result = commands.createDepartment({
                    name: name,
                    description: description,
                    locationId: locationId,
                    parentDepartmentId: parentId || null
                });

                if (result) {
                    _showToast('Department "' + name + '" created', 'success');
                    refreshDepartmentsTab(locationId);
                }
            }
        });
    }

    function _openEditDepartmentModal(departmentId, locationId) {
        var state = _getGovernmentState();
        if (!state) return;
        
        var dept = state.getDepartment(departmentId);
        if (!dept) {
            _showToast('Department not found', 'error');
            return;
        }

        var content = '<div class="dept-edit-form">';
        content += '<div class="form-group">';
        content += '<label for="dept-name-input">Department Name *</label>';
        content += '<input type="text" id="dept-name-input" class="form-control" value="' + _escapeHtml(dept.name) + '">';
        content += '</div>';
        content += '<div class="form-group">';
        content += '<label for="dept-desc-input">Description</label>';
        content += '<textarea id="dept-desc-input" class="form-control" rows="2">' + _escapeHtml(dept.description || '') + '</textarea>';
        content += '</div>';
        content += '</div>';

        _openModal({
            title: 'Edit Department: ' + dept.name,
            content: content,
            confirmText: 'Save Changes',
            cancelText: 'Cancel',
            onConfirm: function() {
                var nameInput = document.getElementById('dept-name-input');
                var descInput = document.getElementById('dept-desc-input');
                
                var name = nameInput ? nameInput.value.trim() : '';
                var description = descInput ? descInput.value.trim() : '';

                if (!name) {
                    _showToast('Department name is required', 'error');
                    return;
                }

                var commands = _getGovernmentCommands();
                if (!commands || !commands.updateDepartment) {
                    _showToast('Government commands not available', 'error');
                    return;
                }

                var result = commands.updateDepartment(departmentId, {
                    name: name,
                    description: description
                });

                if (result) {
                    _showToast('Department updated', 'success');
                    refreshDepartmentsTab(locationId);
                }
            }
        });
    }

    function _openAddPositionModal(departmentId, locationId) {
        var state = _getGovernmentState();
        if (!state) return;
        
        var dept = state.getDepartment(departmentId);
        if (!dept) {
            _showToast('Department not found', 'error');
            return;
        }

        var content = '<div class="dept-edit-form">';
        content += '<div class="form-group">';
        content += '<label for="pos-name-input">Position Name *</label>';
        content += '<input type="text" id="pos-name-input" class="form-control" placeholder="e.g., Treasurer">';
        content += '</div>';
        content += '<div class="form-group">';
        content += '<label for="pos-desc-input">Description</label>';
        content += '<textarea id="pos-desc-input" class="form-control" rows="2" placeholder="Brief description of this position"></textarea>';
        content += '</div>';
        content += '<div class="form-group">';
        content += '<label for="pos-role-input">Required Role (optional)</label>';
        content += '<input type="text" id="pos-role-input" class="form-control" placeholder="Role ID or name">';
        content += '</div>';
        content += '<div class="form-group">';
        content += '<label for="pos-skill-input">Minimum Skill Level</label>';
        content += '<input type="number" id="pos-skill-input" class="form-control" min="0" max="100" value="10">';
        content += '</div>';
        content += '</div>';

        _openModal({
            title: 'Add Position to ' + dept.name,
            content: content,
            confirmText: 'Add Position',
            cancelText: 'Cancel',
            onConfirm: function() {
                var nameInput = document.getElementById('pos-name-input');
                var descInput = document.getElementById('pos-desc-input');
                var roleInput = document.getElementById('pos-role-input');
                var skillInput = document.getElementById('pos-skill-input');
                
                var name = nameInput ? nameInput.value.trim() : '';
                var description = descInput ? descInput.value.trim() : '';
                var roleId = roleInput ? roleInput.value.trim() : null;
                var minSkill = skillInput ? parseInt(skillInput.value) || 0 : 0;

                if (!name) {
                    _showToast('Position name is required', 'error');
                    return;
                }

                var commands = _getGovernmentCommands();
                if (!commands || !commands.addPosition) {
                    _showToast('Government commands not available', 'error');
                    return;
                }

                // If role ID was provided, try to find it
                if (roleId && typeof window.getRoleByName === 'function') {
                    var role = window.getRoleByName(roleId);
                    if (role) roleId = role.id;
                }

                var result = commands.addPosition(departmentId, {
                    name: name,
                    description: description,
                    requiredRoleId: roleId || null,
                    minSkillLevel: minSkill,
                    priority: 10
                });

                if (result) {
                    _showToast('Position "' + name + '" added', 'success');
                    refreshDepartmentsTab(locationId);
                }
            }
        });
    }

    function _openAssignStaffModal(departmentId, positionId, locationId) {
        var state = _getGovernmentState();
        if (!state) return;
        
        var dept = state.getDepartment(departmentId);
        if (!dept) return;
        
        var position = _getPositionById(dept, positionId);
        if (!position) {
            _showToast('Position not found', 'error');
            return;
        }

        _openCharacterSelector({
            title: 'Assign Character to ' + position.name,
            preset: 'available',
            filters: {
                location: locationId,
                showDeceased: false
            },
            onSelect: function(characterId) {
                var commands = _getGovernmentCommands();
                if (!commands || !commands.assignCharacterToPosition) {
                    _showToast('Government commands not available', 'error');
                    return;
                }

                var result = commands.assignCharacterToPosition(departmentId, positionId, characterId, {
                    startYear: _getCurrentYear(),
                    addRoleIfMissing: true
                });

                if (result) {
                    _showToast('Character assigned to ' + position.name, 'success');
                    refreshDepartmentsTab(locationId);
                }
            }
        });
    }

    // =========================================================================
    // 5. MAIN EXPORTED FUNCTIONS
    // =========================================================================

    /**
     * Renders the departments tab for a specific location
     * @param {string} containerId - The ID of the container element
     * @param {string} locationId - The ID of the location to display
     */
    function renderDepartmentsTab(containerId, locationId) {
        var container = document.getElementById(containerId);
        if (!container) {
            console.warn('Departments tab container not found:', containerId);
            return;
        }

        var place = locationId ? _getPlaceById(locationId) : null;
        container.innerHTML = _renderDepartmentsTab(place);
        container.dataset.locationId = locationId || '';

        // Set up event listeners
        var addDeptBtn = container.querySelector('[data-action="add-department"]');
        if (addDeptBtn) {
            addDeptBtn.addEventListener('click', function() {
                var currentLocationId = container.dataset.locationId;
                if (currentLocationId) {
                    _openAddDepartmentModal(currentLocationId);
                } else {
                    _showToast('No location selected', 'warning');
                }
            });
        }

        var refreshBtn = container.querySelector('[data-action="refresh-depts"]');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function() {
                var currentLocationId = container.dataset.locationId;
                if (currentLocationId) {
                    renderDepartmentsTab(containerId, currentLocationId);
                    _showToast('Departments refreshed', 'info');
                }
            });
        }

        // Department action buttons (delegated)
        container.addEventListener('click', function(e) {
            var target = e.target.closest('[data-action]');
            if (!target) return;

            var action = target.dataset.action;
            var currentLocationId = container.dataset.locationId;
            var deptCard = target.closest('.dept-card');
            var deptId = deptCard ? deptCard.dataset.deptId : null;

            switch (action) {
                case 'add-department':
                    if (currentLocationId) _openAddDepartmentModal(currentLocationId);
                    break;
                    
                case 'refresh-depts':
                    if (currentLocationId) {
                        renderDepartmentsTab(containerId, currentLocationId);
                        _showToast('Departments refreshed', 'info');
                    }
                    break;
                    
                case 'edit-dept':
                    if (deptId && currentLocationId) {
                        _openEditDepartmentModal(deptId, currentLocationId);
                    }
                    break;
                    
                case 'delete-dept':
                    if (deptId && currentLocationId) {
                        _confirmDialog(
                            'Are you sure you want to delete this department? All positions and assignments will be removed.',
                            'Delete Department',
                            function() {
                                var commands = _getGovernmentCommands();
                                if (commands && commands.deleteDepartment) {
                                    commands.deleteDepartment(deptId, { cascade: true });
                                    _showToast('Department deleted', 'info');
                                    renderDepartmentsTab(containerId, currentLocationId);
                                }
                            }
                        );
                    }
                    break;
                    
                case 'add-position':
                    if (deptId && currentLocationId) {
                        _openAddPositionModal(deptId, currentLocationId);
                    }
                    break;
                    
                case 'assign-staff':
                    if (deptId && currentLocationId) {
                        var positionId = target.dataset.positionId;
                        if (positionId) {
                            _openAssignStaffModal(deptId, positionId, currentLocationId);
                        }
                    }
                    break;
                    
                case 'edit-position':
                    if (deptId && currentLocationId) {
                        // TODO: Implement edit position modal
                        _showToast('Edit position functionality coming soon', 'info');
                    }
                    break;
                    
                case 'delete-position':
                    if (deptId && currentLocationId) {
                        var positionId = target.dataset.positionId;
                        if (positionId) {
                            _confirmDialog(
                                'Are you sure you want to delete this position?',
                                'Delete Position',
                                function() {
                                    var commands = _getGovernmentCommands();
                                    if (commands && commands.deletePosition) {
                                        commands.deletePosition(deptId, positionId);
                                        _showToast('Position deleted', 'info');
                                        renderDepartmentsTab(containerId, currentLocationId);
                                    }
                                }
                            );
                        }
                    }
                    break;
                    
                case 'remove-staff':
                    if (deptId && currentLocationId) {
                        var assignmentId = target.dataset.assignmentId;
                        if (assignmentId) {
                            _confirmDialog(
                                'Are you sure you want to remove this staff member?',
                                'Remove Staff',
                                function() {
                                    var commands = _getGovernmentCommands();
                                    if (commands && commands.endAssignment) {
                                        var result = commands.endAssignment(deptId, assignmentId, _getCurrentYear(), 'Removed');
                                        if (result) {
                                            _showToast('Staff member removed', 'info');
                                            renderDepartmentsTab(containerId, currentLocationId);
                                        }
                                    }
                                }
                            );
                        }
                    }
                    break;
            }
        });
    }

    /**
     * Refreshes the departments tab
     * @param {string} locationId - The ID of the location to display
     */
    function refreshDepartmentsTab(locationId) {
        var container = document.querySelector('.dept-tab-container');
        if (!container) {
            var containers = document.querySelectorAll('.dept-tab-container, #departments-tab');
            if (containers.length > 0) {
                container = containers[0];
            }
        }
        if (container) {
            renderDepartmentsTab(container.id || 'departments-tab', locationId);
        }
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.DepartmentsTab = {
        render: renderDepartmentsTab,
        refresh: refreshDepartmentsTab,
        getDepartments: _getDepartmentsForLocation,
        getBudgetInfo: _getBudgetInfo,
        _renderDepartmentCard: _renderDepartmentCard,
        _openAddDepartmentModal: _openAddDepartmentModal,
        _openAddPositionModal: _openAddPositionModal,
        _openAssignStaffModal: _openAssignStaffModal
    };

    // Legacy aliases
    window.renderDepartmentsTab = renderDepartmentsTab;
    window.refreshDepartmentsTab = refreshDepartmentsTab;

})();