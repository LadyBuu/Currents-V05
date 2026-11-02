// js/tabs/government-departments-tab.js
/**
 * =============================================================================
 * DEPARTMENTS TAB (js/tabs/government-departments-tab.js)
 * =============================================================================
 *
 * PURPOSE: Provides a modular tab for viewing and managing government
 *          departments, positions, staff assignments, and salary budgets
 *          for a specific location.
 *
 * DEPENDENCIES (checked at load time):
 *   - GovernmentState, GovernmentCommands, GovernmentQueries,
 *     GovernmentEconomy  (js/government/*)
 *   - RoleQueries (optional; used for the role picker when present)
 *   - formatting.js (escapeHtml)
 *   - icons.js (Icons)
 *   - ui.js (showToast)
 *   - modals-core.js (openModal, confirmDialog)
 *   - modals-char-selector.js (openCharacterSelector)
 *   - time.js (getCurrentYear)
 *
 * WRITE PATH:
 *   Every department, position, and assignment mutation goes through
 *   GovernmentCommands.<command>() followed by exactly one
 *   GovernmentCommands.persist() per successful action. The persist
 *   boundary is the command layer's; this tab calls it explicitly
 *   because a tab is an interactive write path, not a batch.
 *
 * MODAL KEY TRANSLATION:
 *   modals-core.js reads titleHtml / contentHtml. The call sites in
 *   this file pass title / content. The local _openModal helper
 *   translates before delegating to window.openModal.
 *
 * MODAL INPUT SCOPING:
 *   Every onConfirm reads its inputs via root.querySelector, where
 *   root is the modal DOM element passed by modals-core.js. Two open
 *   add-department modals no longer cross-read each other's fields.
 *
 * SALARY CALCULATION:
 *   _calculateTotalSalary delegates to
 *   GovernmentEconomy.calculateDepartmentSalaryRequirements(deptId),
 *   which returns { totalSalaryRequirement, filledPositions,
 *   totalPositions, ... }. The previous revision used a hardcoded
 *   "total += 50" placeholder.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. LOAD-TIME DEPENDENCY CHECKS
    // =========================================================================

    if (!window.GovernmentState) {
        throw new Error(
            'government-departments-tab.js: government-state.js must load first.'
        );
    }
    if (!window.GovernmentCommands) {
        throw new Error(
            'government-departments-tab.js: government-commands.js must load first.'
        );
    }
    if (!window.GovernmentQueries) {
        throw new Error(
            'government-departments-tab.js: government-queries.js must load first.'
        );
    }
    if (!window.GovernmentEconomy) {
        throw new Error(
            'government-departments-tab.js: government-economy.js must load first.'
        );
    }
    if (typeof window.openModal !== 'function') {
        throw new Error(
            'government-departments-tab.js: modals-core.js must load first ' +
            '(openModal missing).'
        );
    }
    if (typeof window.escapeHtml !== 'function') {
        throw new Error(
            'government-departments-tab.js: formatting.js (escapeHtml) must ' +
            'load first.'
        );
    }
    if (!window.Icons || typeof window.Icons !== 'object') {
        throw new Error(
            'government-departments-tab.js: icons.js must load first.'
        );
    }
    if (typeof window.getCurrentYear !== 'function') {
        throw new Error(
            'government-departments-tab.js: time.js (getCurrentYear) must ' +
            'load first.'
        );
    }

    var GS = window.GovernmentState;
    var GC = window.GovernmentCommands;
    var GQ = window.GovernmentQueries;
    var GE = window.GovernmentEconomy;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function'
            ? window.getPlaceById(id)
            : null;
    }

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function'
            ? window.getCharacterById(id)
            : null;
    }

    function _escapeHtml(str) {
        return window.escapeHtml(str);
    }

    function _getIcon(name) {
        var svg = window.Icons[name];
        return typeof svg === 'string' ? svg : '';
    }

    function _showToast(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type || 'info');
        }
    }

    function _confirmDialog(message, title, onConfirm) {
        if (typeof window.confirmDialog === 'function') {
            window.confirmDialog(message, title, onConfirm);
        }
    }

    function _openCharacterSelector(options) {
        if (typeof window.openCharacterSelector === 'function') {
            return window.openCharacterSelector(options);
        }
        _showToast('Character selector unavailable', 'error');
        return null;
    }

    /**
     * Opens a modal with key translation for modals-core.js.
     */
    function _openModal(opts) {
        var forwarded = {};
        for (var k in opts) {
            if (Object.prototype.hasOwnProperty.call(opts, k)) {
                forwarded[k] = opts[k];
            }
        }
        if (forwarded.titleHtml === undefined && forwarded.title !== undefined) {
            forwarded.titleHtml = forwarded.title;
        }
        if (forwarded.contentHtml === undefined && forwarded.content !== undefined) {
            forwarded.contentHtml = forwarded.content;
        }
        return window.openModal(forwarded);
    }

    function _getCurrentYear() {
        return window.getCurrentYear();
    }

    /**
     * Resolves a role by id via RoleQueries when present. Returns null
     * otherwise. Used only for display of "Requires: <role name>".
     */
    function _getRoleById(roleId) {
        if (!roleId) return null;
        var RQ = window.RoleQueries;
        if (!RQ || typeof RQ.getRoleSummary !== 'function') return null;
        return RQ.getRoleSummary(roleId);
    }

    /**
     * Lists role summaries for the role picker. Returns [] when
     * RoleQueries is not loaded — the picker falls back to a free-text
     * input in that case.
     */
    function _getRoleOptions() {
        var RQ = window.RoleQueries;
        if (!RQ || typeof RQ.getAllRoleSummaries !== 'function') return [];
        return RQ.getAllRoleSummaries() || [];
    }

    // =========================================================================
    // 3. HELPERS
    // =========================================================================

    function _getDepartmentsForLocation(locationId) {
        return GQ.getDepartments({ locationId: locationId }) || [];
    }

    function _getActiveAssignments(department) {
        if (!department || !Array.isArray(department.assignments)) return [];
        return department.assignments.filter(function(a) {
            return !a.endYear;
        });
    }

    function _getPositionById(department, positionId) {
        if (!department || !Array.isArray(department.positions)) return null;
        for (var i = 0; i < department.positions.length; i++) {
            if (department.positions[i].id === positionId) {
                return department.positions[i];
            }
        }
        return null;
    }

    /**
     * Sum of active assignment salaries in this department. Delegates to
     * GovernmentEconomy.calculateDepartmentSalaryRequirements(deptId),
     * which returns the canonical total for the department.
     *
     * Returns 0 when the department cannot be resolved or the economy
     * layer returns null for it.
     */
    function _calculateTotalSalary(department) {
        if (!department || !department.id) return 0;
        var req = GE.calculateDepartmentSalaryRequirements(department.id);
        if (!req || typeof req.totalSalaryRequirement !== 'number') return 0;
        return req.totalSalaryRequirement;
    }

    /**
     * Budget summary for the location. Allocated budget comes from the
     * settlement record (data.governmentSalaryBudget). Required budget
     * is derived from the current department / position / assignment
     * state.
     *
     * Returns { allocated, required, remaining, shortfall } or null when
     * the settlement record is not available.
     */
    function _getBudgetInfo(locationId) {
        var data = null;
        if (typeof window.getSettlementData === 'function') {
            data = window.getSettlementData(locationId);
        } else if (typeof window.getOrCreateSettlementData === 'function') {
            data = window.getOrCreateSettlementData(locationId);
        }
        if (!data) return null;

        var allocated = typeof data.governmentSalaryBudget === 'number'
            ? data.governmentSalaryBudget
            : 0;

        var departments = _getDepartmentsForLocation(locationId);
        var required = 0;
        for (var i = 0; i < departments.length; i++) {
            required += _calculateTotalSalary(departments[i]);
        }

        return {
            allocated: allocated,
            required: required,
            remaining: Math.max(0, allocated - required),
            shortfall: Math.max(0, required - allocated)
        };
    }

    // =========================================================================
    // 4. RENDER FUNCTIONS
    // =========================================================================

    function _renderDepartmentCard(department, locationId) {
        var positions = Array.isArray(department.positions)
            ? department.positions
            : [];
        var assignments = _getActiveAssignments(department);
        var totalSalary = _calculateTotalSalary(department);

        var hasChildren = false;
        if (GS && typeof GS.getDepartmentsByParentId === 'function') {
            var children = GS.getDepartmentsByParentId(department.id);
            hasChildren = Array.isArray(children) && children.length > 0;
        }

        var html = '<div class="dept-card" data-dept-id="' +
            _escapeHtml(department.id) + '">';

        // Header
        html += '<div class="dept-header">';
        html += '<div class="dept-title">';
        html += '<span class="dept-name">' +
            _escapeHtml(department.name) + '</span>';
        if (hasChildren) {
            html += ' <span class="dept-badge dept-badge-children">' +
                'Has Sub-departments</span>';
        }
        html += '</div>';
        html += '<div class="dept-actions">';
        html += '<button class="dept-btn dept-btn-add-position" ' +
            'data-action="add-position">' +
            _getIcon('PLUS') + ' Position' +
            '</button>';
        html += '<button class="dept-btn dept-btn-edit" ' +
            'data-action="edit-dept">' +
            _getIcon('EDIT') +
            '</button>';
        html += '<button class="dept-btn dept-btn-delete" ' +
            'data-action="delete-dept">' +
            _getIcon('TRASH') +
            '</button>';
        html += '</div>';
        html += '</div>';

        // Stats
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
        html += '<span class="dept-stat-value">' +
            totalSalary.toLocaleString() + 'g</span>';
        html += '</div>';
        html += '</div>';

        // Positions
        if (positions.length > 0) {
            html += '<div class="dept-positions">';
            html += '<div class="dept-positions-header">';
            html += '<span>Positions</span>';
            html += '</div>';
            html += '<div class="dept-positions-list">';

            for (var i = 0; i < positions.length; i++) {
                var pos = positions[i];
                var posAssignments = assignments.filter(function(a) {
                    return a.positionId === pos.id;
                });
                var isFilled = posAssignments.length > 0;

                html += '<div class="dept-position" ' +
                    'data-position-id="' + _escapeHtml(pos.id) + '">';

                html += '<div class="dept-position-header">';
                html += '<span class="dept-position-name">' +
                    _escapeHtml(pos.name) + '</span>';
                html += '<span class="dept-position-status ' +
                    (isFilled ? 'filled' : 'vacant') + '">' +
                    (isFilled ? 'Filled' : 'Vacant') +
                    '</span>';
                html += '</div>';

                if (pos.description) {
                    html += '<div class="dept-position-desc">' +
                        _escapeHtml(pos.description) + '</div>';
                }

                if (pos.requiredRoleId) {
                    var role = _getRoleById(pos.requiredRoleId);
                    html += '<div class="dept-position-requirement">';
                    html += 'Requires: ' +
                        (role
                            ? _escapeHtml(role.name)
                            : _escapeHtml(pos.requiredRoleId));
                    if (pos.minSkillLevel) {
                        html += ' (Skill: ' + pos.minSkillLevel + '+)';
                    }
                    html += '</div>';
                }

                if (posAssignments.length > 0) {
                    html += '<div class="dept-position-staff">';
                    for (var a = 0; a < posAssignments.length; a++) {
                        var assign = posAssignments[a];
                        var char = _getCharacterById(assign.characterId);
                        html += '<div class="dept-staff-item">';
                        html += '<span class="dept-staff-name">' +
                            (char
                                ? _escapeHtml(
                                    char.name +
                                    (char.surname ? ' ' + char.surname : '')
                                )
                                : 'Unknown') +
                            '</span>';
                        if (assign.title && assign.title !== pos.name) {
                            html += ' <span class="dept-staff-title">(' +
                                _escapeHtml(assign.title) + ')</span>';
                        }
                        html += ' <span class="dept-staff-since">since ' +
                            (assign.startYear || '?') + '</span>';
                        html += '<button class="dept-btn dept-btn-small ' +
                            'dept-btn-remove-staff" ' +
                            'data-action="remove-staff" ' +
                            'data-assignment-id="' +
                            _escapeHtml(assign.id) + '">' +
                            _getIcon('X') +
                            '</button>';
                        html += '</div>';
                    }
                    html += '</div>';
                }

                html += '<div class="dept-position-actions">';
                if (!isFilled) {
                    html += '<button class="dept-btn dept-btn-small ' +
                        'dept-btn-assign" ' +
                        'data-action="assign-staff" ' +
                        'data-position-id="' + _escapeHtml(pos.id) + '">' +
                        _getIcon('PLUS') + ' Assign' +
                        '</button>';
                }
                html += '<button class="dept-btn dept-btn-small ' +
                    'dept-btn-edit-position" ' +
                    'data-action="edit-position" ' +
                    'data-position-id="' + _escapeHtml(pos.id) + '">' +
                    _getIcon('EDIT') +
                    '</button>';
                html += '<button class="dept-btn dept-btn-small ' +
                    'dept-btn-delete-position" ' +
                    'data-action="delete-position" ' +
                    'data-position-id="' + _escapeHtml(pos.id) + '">' +
                    _getIcon('TRASH') +
                    '</button>';
                html += '</div>';

                html += '</div>'; // end dept-position
            }

            html += '</div>';
            html += '</div>';
        } else {
            html += '<div class="dept-no-positions">' +
                'No positions defined. Add a position to start building ' +
                'this department.</div>';
        }

        if (department.description) {
            html += '<div class="dept-description">' +
                _escapeHtml(department.description) + '</div>';
        }

        html += '</div>';
        return html;
    }

    function _renderDepartmentsTab(place) {
        if (!place) {
            return '<div class="dept-details-empty">' +
                'Select a location to view government departments.</div>';
        }

        var departments = _getDepartmentsForLocation(place.id);
        var budgetInfo = _getBudgetInfo(place.id);

        var html = '<div class="dept-tab-container">';

        // Header
        html += '<div class="dept-tab-header">';
        html += '<h3>Government Departments - ' +
            _escapeHtml(place.displayName || place.name) + '</h3>';
        html += '<div class="dept-tab-actions">';
        html += '<button class="dept-btn dept-btn-add" ' +
            'data-action="add-department">' +
            _getIcon('PLUS') + ' Add Department' +
            '</button>';
        html += '<button class="dept-btn dept-btn-refresh" ' +
            'data-action="refresh-depts">' +
            _getIcon('REFRESH') + ' Refresh' +
            '</button>';
        html += '</div>';
        html += '</div>';

        // Budget summary
        if (budgetInfo) {
            html += '<div class="dept-budget-summary">';
            html += '<div class="dept-budget-item">';
            html += '<span class="dept-budget-label">Salary Budget</span>';
            html += '<span class="dept-budget-value">' +
                budgetInfo.allocated.toLocaleString() + 'g</span>';
            html += '</div>';
            html += '<div class="dept-budget-item">';
            html += '<span class="dept-budget-label">Required</span>';
            html += '<span class="dept-budget-value">' +
                budgetInfo.required.toLocaleString() + 'g</span>';
            html += '</div>';
            html += '<div class="dept-budget-item ' +
                (budgetInfo.shortfall > 0
                    ? 'dept-budget-shortfall'
                    : 'dept-budget-surplus') + '">';
            html += '<span class="dept-budget-label">' +
                (budgetInfo.shortfall > 0 ? 'Shortfall' : 'Surplus') +
                '</span>';
            html += '<span class="dept-budget-value">' +
                (budgetInfo.shortfall > 0
                    ? budgetInfo.shortfall.toLocaleString()
                    : budgetInfo.remaining.toLocaleString()) + 'g</span>';
            html += '</div>';
            html += '</div>';
        } else {
            html += '<div class="dept-budget-summary dept-budget-unavailable">';
            html += '<span class="dept-budget-label">Salary Budget</span> ';
            html += '<span class="dept-budget-value">— (settlement data ' +
                'unavailable)</span>';
            html += '</div>';
        }

        // Departments list
        if (departments.length === 0) {
            html += '<div class="dept-empty">';
            html += '<p>No government departments found for this location.</p>';
            html += '<button class="dept-btn dept-btn-add" ' +
                'data-action="add-department">' +
                _getIcon('PLUS') + ' Create First Department' +
                '</button>';
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
    // 5. MODALS
    // =========================================================================

    function _openAddDepartmentModal(locationId, onComplete) {
        var place = _getPlaceById(locationId);
        if (!place) {
            _showToast('Location not found', 'error');
            return;
        }

        var existing = _getDepartmentsForLocation(locationId);
        var parentOptions = '<option value="">None</option>';
        for (var i = 0; i < existing.length; i++) {
            parentOptions += '<option value="' +
                _escapeHtml(existing[i].id) + '">' +
                _escapeHtml(existing[i].name) +
                '</option>';
        }

        var content = '<div class="dept-edit-form">';
        content += '<div class="form-group">';
        content += '<label for="dept-name-input">Department Name *</label>';
        content += '<input type="text" id="dept-name-input" ' +
            'class="form-control" placeholder="e.g., Royal Treasury">';
        content += '</div>';
        content += '<div class="form-group">';
        content += '<label for="dept-desc-input">Description</label>';
        content += '<textarea id="dept-desc-input" class="form-control" ' +
            'rows="2" ' +
            'placeholder="Brief description of this department"></textarea>';
        content += '</div>';
        content += '<div class="form-group">';
        content += '<label for="dept-parent-select">Parent Department (optional)</label>';
        content += '<select id="dept-parent-select" class="form-control">' +
            parentOptions + '</select>';
        content += '</div>';
        content += '</div>';

        _openModal({
            title: 'Create New Department in ' + (place.displayName || place.name),
            content: content,
            confirmText: 'Create Department',
            cancelText: 'Cancel',
            onConfirm: function(root) {
                var nameEl = root.querySelector('#dept-name-input');
                var descEl = root.querySelector('#dept-desc-input');
                var parentEl = root.querySelector('#dept-parent-select');
                if (!nameEl) {
                    _showToast('Form not found in modal', 'error');
                    return false;
                }

                var name = nameEl.value.trim();
                if (!name) {
                    _showToast('Department name is required', 'error');
                    return false;
                }
                var description = descEl ? descEl.value.trim() : '';
                var parentId = parentEl ? (parentEl.value || null) : null;

                var result = GC.createDepartment({
                    name: name,
                    description: description,
                    locationId: locationId,
                    parentDepartmentId: parentId
                });
                if (!result || result.success !== true) {
                    _showToast(
                        (result && result.reason)
                            ? result.reason
                            : 'Failed to create department',
                        'error'
                    );
                    return false;
                }

                var persistResult = GC.persist();
                if (persistResult && persistResult.success !== true) {
                    _showToast(
                        'Department created, but save failed: ' +
                        (persistResult.reason || 'unknown'),
                        'warning'
                    );
                } else {
                    _showToast('Department "' + name + '" created', 'success');
                }

                if (typeof onComplete === 'function') onComplete();
                return true;
            }
        });
    }

    function _openEditDepartmentModal(departmentId, locationId, onComplete) {
        var dept = GQ.getDepartment(departmentId);
        if (!dept) {
            _showToast('Department not found', 'error');
            return;
        }

        var content = '<div class="dept-edit-form">';
        content += '<div class="form-group">';
        content += '<label for="dept-name-input">Department Name *</label>';
        content += '<input type="text" id="dept-name-input" ' +
            'class="form-control" value="' + _escapeHtml(dept.name) + '">';
        content += '</div>';
        content += '<div class="form-group">';
        content += '<label for="dept-desc-input">Description</label>';
        content += '<textarea id="dept-desc-input" class="form-control" ' +
            'rows="2">' + _escapeHtml(dept.description || '') + '</textarea>';
        content += '</div>';
        content += '</div>';

        _openModal({
            title: 'Edit Department: ' + dept.name,
            content: content,
            confirmText: 'Save Changes',
            cancelText: 'Cancel',
            onConfirm: function(root) {
                var nameEl = root.querySelector('#dept-name-input');
                var descEl = root.querySelector('#dept-desc-input');
                if (!nameEl) {
                    _showToast('Form not found in modal', 'error');
                    return false;
                }

                var name = nameEl.value.trim();
                if (!name) {
                    _showToast('Department name is required', 'error');
                    return false;
                }
                var description = descEl ? descEl.value.trim() : '';

                var result = GC.updateDepartment(departmentId, {
                    name: name,
                    description: description
                });
                if (!result || result.success !== true) {
                    _showToast(
                        (result && result.reason)
                            ? result.reason
                            : 'Failed to update department',
                        'error'
                    );
                    return false;
                }

                var persistResult = GC.persist();
                if (persistResult && persistResult.success !== true) {
                    _showToast(
                        'Department updated, but save failed: ' +
                        (persistResult.reason || 'unknown'),
                        'warning'
                    );
                } else {
                    _showToast('Department updated', 'success');
                }

                if (typeof onComplete === 'function') onComplete();
                return true;
            }
        });
    }

    function _openAddPositionModal(departmentId, locationId, onComplete) {
        var dept = GQ.getDepartment(departmentId);
        if (!dept) {
            _showToast('Department not found', 'error');
            return;
        }

        var roles = _getRoleOptions();
        var roleField;
        if (roles.length > 0) {
            var roleOptions = '<option value="">None</option>';
            for (var r = 0; r < roles.length; r++) {
                roleOptions += '<option value="' +
                    _escapeHtml(roles[r].id) + '">' +
                    _escapeHtml(roles[r].name) +
                    '</option>';
            }
            roleField = '<select id="pos-role-input" class="form-control">' +
                roleOptions + '</select>';
        } else {
            roleField = '<input type="text" id="pos-role-input" ' +
                'class="form-control" ' +
                'placeholder="Role ID (role picker unavailable)">';
        }

        var content = '<div class="dept-edit-form">';
        content += '<div class="form-group">';
        content += '<label for="pos-name-input">Position Name *</label>';
        content += '<input type="text" id="pos-name-input" ' +
            'class="form-control" placeholder="e.g., Treasurer">';
        content += '</div>';
        content += '<div class="form-group">';
        content += '<label for="pos-desc-input">Description</label>';
        content += '<textarea id="pos-desc-input" class="form-control" ' +
            'rows="2" ' +
            'placeholder="Brief description of this position"></textarea>';
        content += '</div>';
        content += '<div class="form-group">';
        content += '<label for="pos-role-input">Required Role (optional)</label>';
        content += roleField;
        content += '</div>';
        content += '<div class="form-group">';
        content += '<label for="pos-skill-input">Minimum Skill Level</label>';
        content += '<input type="number" id="pos-skill-input" ' +
            'class="form-control" min="0" max="100" value="10">';
        content += '</div>';
        content += '</div>';

        _openModal({
            title: 'Add Position to ' + dept.name,
            content: content,
            confirmText: 'Add Position',
            cancelText: 'Cancel',
            onConfirm: function(root) {
                var nameEl = root.querySelector('#pos-name-input');
                var descEl = root.querySelector('#pos-desc-input');
                var roleEl = root.querySelector('#pos-role-input');
                var skillEl = root.querySelector('#pos-skill-input');
                if (!nameEl) {
                    _showToast('Form not found in modal', 'error');
                    return false;
                }

                var name = nameEl.value.trim();
                if (!name) {
                    _showToast('Position name is required', 'error');
                    return false;
                }
                var description = descEl ? descEl.value.trim() : '';
                var requiredRoleId = roleEl
                    ? (roleEl.value.trim() || null)
                    : null;
                var minSkill = skillEl
                    ? (parseInt(skillEl.value, 10) || 0)
                    : 0;

                var result = GC.addPosition(departmentId, {
                    name: name,
                    description: description,
                    requiredRoleId: requiredRoleId,
                    minSkillLevel: minSkill,
                    priority: 10
                });
                if (!result || result.success !== true) {
                    _showToast(
                        (result && result.reason)
                            ? result.reason
                            : 'Failed to add position',
                        'error'
                    );
                    return false;
                }

                var persistResult = GC.persist();
                if (persistResult && persistResult.success !== true) {
                    _showToast(
                        'Position added, but save failed: ' +
                        (persistResult.reason || 'unknown'),
                        'warning'
                    );
                } else {
                    _showToast('Position "' + name + '" added', 'success');
                }

                if (typeof onComplete === 'function') onComplete();
                return true;
            }
        });
    }

    function _openEditPositionModal(departmentId, positionId, locationId, onComplete) {
        var dept = GQ.getDepartment(departmentId);
        if (!dept) {
            _showToast('Department not found', 'error');
            return;
        }
        var pos = _getPositionById(dept, positionId);
        if (!pos) {
            _showToast('Position not found', 'error');
            return;
        }

        var roles = _getRoleOptions();
        var roleField;
        if (roles.length > 0) {
            var roleOptions = '<option value="">None</option>';
            for (var r = 0; r < roles.length; r++) {
                var sel = roles[r].id === pos.requiredRoleId ? ' selected' : '';
                roleOptions += '<option value="' +
                    _escapeHtml(roles[r].id) + '"' + sel + '>' +
                    _escapeHtml(roles[r].name) +
                    '</option>';
            }
            roleField = '<select id="pos-edit-role-input" class="form-control">' +
                roleOptions + '</select>';
        } else {
            roleField = '<input type="text" id="pos-edit-role-input" ' +
                'class="form-control" ' +
                'value="' + _escapeHtml(pos.requiredRoleId || '') + '" ' +
                'placeholder="Role ID (role picker unavailable)">';
        }

        var content = '<div class="dept-edit-form">';
        content += '<div class="form-group">';
        content += '<label for="pos-edit-name-input">Position Name *</label>';
        content += '<input type="text" id="pos-edit-name-input" ' +
            'class="form-control" value="' + _escapeHtml(pos.name) + '">';
        content += '</div>';
        content += '<div class="form-group">';
        content += '<label for="pos-edit-desc-input">Description</label>';
        content += '<textarea id="pos-edit-desc-input" class="form-control" ' +
            'rows="2">' + _escapeHtml(pos.description || '') + '</textarea>';
        content += '</div>';
        content += '<div class="form-group">';
        content += '<label for="pos-edit-role-input">Required Role (optional)</label>';
        content += roleField;
        content += '</div>';
        content += '<div class="form-group">';
        content += '<label for="pos-edit-skill-input">Minimum Skill Level</label>';
        content += '<input type="number" id="pos-edit-skill-input" ' +
            'class="form-control" min="0" max="100" value="' +
            (pos.minSkillLevel || 0) + '">';
        content += '</div>';
        content += '</div>';

        _openModal({
            title: 'Edit Position: ' + pos.name,
            content: content,
            confirmText: 'Save Changes',
            cancelText: 'Cancel',
            onConfirm: function(root) {
                var nameEl = root.querySelector('#pos-edit-name-input');
                var descEl = root.querySelector('#pos-edit-desc-input');
                var roleEl = root.querySelector('#pos-edit-role-input');
                var skillEl = root.querySelector('#pos-edit-skill-input');
                if (!nameEl) {
                    _showToast('Form not found in modal', 'error');
                    return false;
                }

                var name = nameEl.value.trim();
                if (!name) {
                    _showToast('Position name is required', 'error');
                    return false;
                }

                var result = GC.updatePosition(departmentId, positionId, {
                    name: name,
                    description: descEl ? descEl.value.trim() : '',
                    requiredRoleId: roleEl ? (roleEl.value.trim() || null) : null,
                    minSkillLevel: skillEl
                        ? (parseInt(skillEl.value, 10) || 0)
                        : 0
                });
                if (!result || result.success !== true) {
                    _showToast(
                        (result && result.reason)
                            ? result.reason
                            : 'Failed to update position',
                        'error'
                    );
                    return false;
                }

                var persistResult = GC.persist();
                if (persistResult && persistResult.success !== true) {
                    _showToast(
                        'Position updated, but save failed: ' +
                        (persistResult.reason || 'unknown'),
                        'warning'
                    );
                } else {
                    _showToast('Position updated', 'success');
                }

                if (typeof onComplete === 'function') onComplete();
                return true;
            }
        });
    }

    function _openAssignStaffModal(departmentId, positionId, locationId, onComplete) {
        var dept = GQ.getDepartment(departmentId);
        if (!dept) {
            _showToast('Department not found', 'error');
            return;
        }
        var pos = _getPositionById(dept, positionId);
        if (!pos) {
            _showToast('Position not found', 'error');
            return;
        }

        _openCharacterSelector({
            title: 'Assign Character to ' + pos.name,
            preset: 'available',
            filters: {
                location: locationId,
                showDeceased: false
            },
            onSelect: function(characterId) {
                var result = GC.assignCharacterToPosition(
                    departmentId,
                    positionId,
                    characterId,
                    {
                        startYear: _getCurrentYear(),
                        addRoleIfMissing: true
                    }
                );
                if (!result || result.success !== true) {
                    _showToast(
                        (result && result.reason)
                            ? result.reason
                            : 'Failed to assign character',
                        'error'
                    );
                    return;
                }

                var persistResult = GC.persist();
                if (persistResult && persistResult.success !== true) {
                    _showToast(
                        'Assigned, but save failed: ' +
                        (persistResult.reason || 'unknown'),
                        'warning'
                    );
                } else {
                    _showToast('Character assigned to ' + pos.name, 'success');
                }

                if (typeof onComplete === 'function') onComplete();
            }
        });
    }

    // =========================================================================
    // 6. MAIN RENDER
    // =========================================================================

    function renderDepartmentsTab(containerId, locationId) {
        var container = document.getElementById(containerId);
        if (!container) {
            console.warn('Departments tab container not found:', containerId);
            return;
        }

        var place = locationId ? _getPlaceById(locationId) : null;
        container.innerHTML = _renderDepartmentsTab(place);
        container.dataset.locationId = locationId || '';

        // Actions (delegated, bound once)
        if (!container._govDeptsBound) {
            container._govDeptsBound = true;

            container.addEventListener('click', function(e) {
                var target = e.target.closest('[data-action]');
                if (!target) return;

                var action = target.dataset.action;
                var currentLocationId = container.dataset.locationId;
                var deptCard = target.closest('.dept-card');
                var deptId = deptCard ? deptCard.dataset.deptId : null;
                var positionId = target.dataset.positionId || null;
                var refresh = function() {
                    renderDepartmentsTab(containerId, currentLocationId);
                };

                switch (action) {
                    case 'add-department':
                        if (currentLocationId) {
                            _openAddDepartmentModal(currentLocationId, refresh);
                        } else {
                            _showToast('No location selected', 'warning');
                        }
                        break;

                    case 'refresh-depts':
                        if (currentLocationId) {
                            renderDepartmentsTab(containerId, currentLocationId);
                            _showToast('Departments refreshed', 'info');
                        }
                        break;

                    case 'edit-dept':
                        if (deptId && currentLocationId) {
                            _openEditDepartmentModal(deptId, currentLocationId, refresh);
                        }
                        break;

                    case 'delete-dept':
                        if (deptId && currentLocationId) {
                            _confirmDialog(
                                'Are you sure you want to delete this ' +
                                'department? All positions and assignments ' +
                                'will be removed.',
                                'Delete Department',
                                function() {
                                    var result = GC.deleteDepartment(
                                        deptId,
                                        { cascade: true }
                                    );
                                    if (!result || result.success !== true) {
                                        _showToast(
                                            (result && result.reason)
                                                ? result.reason
                                                : 'Failed to delete department',
                                            'error'
                                        );
                                        return;
                                    }
                                    var persistResult = GC.persist();
                                    if (persistResult &&
                                        persistResult.success !== true) {
                                        _showToast(
                                            'Deleted, but save failed: ' +
                                            (persistResult.reason || 'unknown'),
                                            'warning'
                                        );
                                    } else {
                                        _showToast('Department deleted', 'info');
                                    }
                                    refresh();
                                }
                            );
                        }
                        break;

                    case 'add-position':
                        if (deptId && currentLocationId) {
                            _openAddPositionModal(deptId, currentLocationId, refresh);
                        }
                        break;

                    case 'assign-staff':
                        if (deptId && currentLocationId && positionId) {
                            _openAssignStaffModal(
                                deptId, positionId, currentLocationId, refresh
                            );
                        }
                        break;

                    case 'edit-position':
                        if (deptId && currentLocationId && positionId) {
                            _openEditPositionModal(
                                deptId, positionId, currentLocationId, refresh
                            );
                        }
                        break;

                    case 'delete-position':
                        if (deptId && currentLocationId && positionId) {
                            _confirmDialog(
                                'Are you sure you want to delete this ' +
                                'position?',
                                'Delete Position',
                                function() {
                                    var result = GC.deletePosition(
                                        deptId, positionId
                                    );
                                    if (!result || result.success !== true) {
                                        _showToast(
                                            (result && result.reason)
                                                ? result.reason
                                                : 'Failed to delete position',
                                            'error'
                                        );
                                        return;
                                    }
                                    var persistResult = GC.persist();
                                    if (persistResult &&
                                        persistResult.success !== true) {
                                        _showToast(
                                            'Deleted, but save failed: ' +
                                            (persistResult.reason || 'unknown'),
                                            'warning'
                                        );
                                    } else {
                                        _showToast('Position deleted', 'info');
                                    }
                                    refresh();
                                }
                            );
                        }
                        break;

                    case 'remove-staff':
                        if (deptId && currentLocationId) {
                            var assignmentId = target.dataset.assignmentId;
                            if (!assignmentId) break;
                            _confirmDialog(
                                'Are you sure you want to remove this ' +
                                'staff member?',
                                'Remove Staff',
                                function() {
                                    var result = GC.endAssignment(
                                        deptId,
                                        assignmentId,
                                        _getCurrentYear(),
                                        'Removed'
                                    );
                                    if (!result || result.success !== true) {
                                        _showToast(
                                            (result && result.reason)
                                                ? result.reason
                                                : 'Failed to remove staff',
                                            'error'
                                        );
                                        return;
                                    }
                                    var persistResult = GC.persist();
                                    if (persistResult &&
                                        persistResult.success !== true) {
                                        _showToast(
                                            'Removed, but save failed: ' +
                                            (persistResult.reason || 'unknown'),
                                            'warning'
                                        );
                                    } else {
                                        _showToast('Staff member removed', 'info');
                                    }
                                    refresh();
                                }
                            );
                        }
                        break;
                }
            });
        }
    }

    function refreshDepartmentsTab(locationId) {
        var container = document.querySelector('.dept-tab-container');
        if (!container) {
            var candidates = document.querySelectorAll(
                '.dept-tab-container, #departments-tab'
            );
            if (candidates.length > 0) container = candidates[0];
        }
        if (container) {
            renderDepartmentsTab(
                container.id || 'departments-tab',
                locationId
            );
        }
    }

    // =========================================================================
    // 7. EXPORTS
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

    window.renderDepartmentsTab = renderDepartmentsTab;
    window.refreshDepartmentsTab = refreshDepartmentsTab;

})();
