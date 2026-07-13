/**
 * =============================================================================
 * STILL WATERS - GOVERNMENT STRUCTURE TAB UI
 * =============================================================================
 * 
 * UPDATED: Full integration with GovernmentState, GovernmentCommands,
 *          GovernmentQueries, GovernmentEconomy, GovernmentAssignment
 * 
 * FEATURES:
 * - Department list with expandable details
 * - Position management within departments
 * - Assignment management with character selection
 * - Role requirements display
 * - Salary information display
 * - Succession planning integration
 * - Visual hierarchy display
 * - Bulk operations support
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _rendering = false;
    var _processingAction = false;

    // =========================================================================
    // 2. SVG ICON HELPERS
    // =========================================================================

    function _getIcon(name, fallback) {
        if (typeof window.Icons !== 'undefined' && window.Icons[name]) {
            return window.Icons[name];
        }
        return fallback || '●';
    }

    function _getCheckIcon() { return _getIcon('CHECK', '✓'); }
    function _getCrossIcon() { return _getIcon('X', '✗'); }
    function _getCircleIcon() { return _getIcon('CIRCLE', '●'); }
    function _getHomeIcon() { return _getIcon('HOME', '⌂'); }
    function _getWarningIcon() { return _getIcon('WARNING', '⚠'); }
    function _getRefreshIcon() { return _getIcon('REFRESH', '⟳'); }
    function _getSearchIcon() { return _getIcon('SEARCH', '⌕'); }
    function _getStarIcon() { return _getIcon('STAR', '★'); }
    function _getGearIcon() { return _getIcon('GEAR', '⚙'); }
    function _getShieldIcon() { return _getIcon('SHIELD', '🛡'); }
    function _getPersonIcon() { return _getIcon('PERSON', '👤'); }
    function _getFlagIcon() { return _getIcon('FLAG', '🏴'); }
    function _getCrownIcon() { return _getIcon('CROWN', '👑'); }
    function _getSwordIcon() { return _getIcon('SWORD', '⚔'); }
    function _getBookIcon() { return _getIcon('BOOK', '📚'); }
    function _getCoinIcon() { return _getIcon('COIN', '♢'); }

    // =========================================================================
    // 3. DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _showToast(msg, type) {
        if (typeof window._showToast === 'function') return window._showToast(msg, type);
        if (typeof window.showToast === 'function') return window.showToast(msg, type);
        console.log('[' + (type || 'info') + '] ' + msg);
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

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getCharacters() {
        return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
    }

    function _getRoleById(id) {
        return typeof window.getRoleById === 'function' ? window.getRoleById(id) : null;
    }

    function _getAllRoles() {
        if (typeof window.RoleState !== 'undefined' && window.RoleState.getAllRoles) {
            return window.RoleState.getAllRoles();
        }
        if (typeof window.getRoles === 'function') return window.getRoles();
        return [];
    }

    function _calculateAge(birthYear, isDeceased, deathYear) {
        if (typeof window.calculateAge === 'function') return window.calculateAge(birthYear, isDeceased, deathYear);
        var currentYear = _getCurrentYear();
        if (!birthYear) return 0;
        if (isDeceased && deathYear) return Math.max(0, deathYear - birthYear);
        return Math.max(0, currentYear - birthYear);
    }

    // =========================================================================
    // 4. GOVERNMENT SYSTEM WRAPPERS
    // =========================================================================

    var _state = window.GovernmentState;
    var _commands = window.GovernmentCommands;
    var _queries = window.GovernmentQueries;
    var _economy = window.GovernmentEconomy;
    var _assignment = window.GovernmentAssignment;

    function _getGovernmentDepartmentTree(locationId) {
        return _state ? _state.getDepartmentTree(locationId) : [];
    }

    function _getDepartment(departmentId) {
        return _state ? _state.getDepartment(departmentId) : null;
    }

    function _getPositionById(departmentId, positionId) {
        return _state ? _state.getPositionById(departmentId, positionId) : null;
    }

    function _getAssignmentsForPosition(departmentId, positionId, activeOnly) {
        return _state ? _state.getAssignmentsForPosition(departmentId, positionId, activeOnly) : [];
    }

    function _getAssignmentsForDepartment(departmentId, activeOnly) {
        return _state ? _state.getAssignmentsForDepartment(departmentId, activeOnly) : [];
    }

    function _calculatePositionSalary(positionId, department) {
        return _economy ? _economy.calculatePositionSalary(positionId, department) : 0;
    }

    function _getSuccessionPlan(departmentId, positionId) {
        return _assignment ? _assignment.getSuccessionPlan(departmentId, positionId) : null;
    }

    function _getQualifiedCandidates(departmentId, positionId, options) {
        return _assignment ? _assignment.getQualifiedCandidates(departmentId, positionId, options) : [];
    }

    function _isCharacterQualifiedForPosition(characterId, departmentId, positionId) {
        return _assignment ? _assignment.isCharacterQualifiedForPosition(characterId, departmentId, positionId) : false;
    }

    function _getPositionSalaryHistory(departmentId, positionId) {
        return _economy ? _economy.getPositionSalaryHistory(departmentId, positionId) : [];
    }

    function _updatePositionSalary(departmentId, positionId, newSalary) {
        return _economy ? _economy.updatePositionSalary(departmentId, positionId, newSalary) : false;
    }

    // =========================================================================
    // 5. STATE
    // =========================================================================

    var structureState = {
        expandedDepartments: new Set(),
        expandedPositions: new Set(),
        viewMode: 'hierarchy', // 'hierarchy' | 'list'
        searchTerm: '',
        filterByStatus: 'all'
    };

    // =========================================================================
    // 6. MODAL WRAPPERS
    // =========================================================================

    function _openModal(options) {
        if (typeof window.openModal === 'function') return window.openModal(options);
        if (typeof window._openModal === 'function') return window._openModal(options);
        return null;
    }

    function _closeTopModal() {
        if (typeof window.closeTopModal === 'function') window.closeTopModal();
        if (typeof window._closeTopModal === 'function') window._closeTopModal();
    }

    function _openCreateDepartmentModal(locationId, onSuccess) {
        if (typeof window.openCreateGovernmentDepartmentModal === 'function') {
            return window.openCreateGovernmentDepartmentModal(locationId, onSuccess);
        }
        if (typeof window._openCreateGovernmentDepartmentModal === 'function') {
            return window._openCreateGovernmentDepartmentModal(locationId, onSuccess);
        }
        _showToast('Create department modal not available', 'error');
        return null;
    }

    function _openEditDepartmentModal(deptId, onSuccess) {
        if (typeof window.openEditGovernmentDepartmentModal === 'function') {
            return window.openEditGovernmentDepartmentModal(deptId, onSuccess);
        }
        if (typeof window._openEditGovernmentDepartmentModal === 'function') {
            return window._openEditGovernmentDepartmentModal(deptId, onSuccess);
        }
        _showToast('Edit department modal not available', 'error');
        return null;
    }

    function _openDeleteDepartmentModal(deptId, onSuccess) {
        if (typeof window.openDeleteGovernmentDepartmentModal === 'function') {
            return window.openDeleteGovernmentDepartmentModal(deptId, onSuccess);
        }
        if (typeof window._openDeleteGovernmentDepartmentModal === 'function') {
            return window._openDeleteGovernmentDepartmentModal(deptId, onSuccess);
        }
        _showToast('Delete department modal not available', 'error');
        return null;
    }

    function _openAddPositionModal(deptId, onSuccess) {
        if (typeof window.openAddPositionModal === 'function') {
            return window.openAddPositionModal(deptId, onSuccess);
        }
        if (typeof window._openAddPositionModal === 'function') {
            return window._openAddPositionModal(deptId, onSuccess);
        }
        _showToast('Add position modal not available', 'error');
        return null;
    }

    function _openEditPositionModal(deptId, positionId, onSuccess) {
        if (typeof window.openEditPositionModal === 'function') {
            return window.openEditPositionModal(deptId, positionId, onSuccess);
        }
        if (typeof window._openEditPositionModal === 'function') {
            return window._openEditPositionModal(deptId, positionId, onSuccess);
        }
        _showToast('Edit position modal not available', 'error');
        return null;
    }

    function _openDeletePositionModal(deptId, positionId, onSuccess) {
        if (typeof window.openDeletePositionModal === 'function') {
            return window.openDeletePositionModal(deptId, positionId, onSuccess);
        }
        if (typeof window._openDeletePositionModal === 'function') {
            return window._openDeletePositionModal(deptId, positionId, onSuccess);
        }
        _showToast('Delete position modal not available', 'error');
        return null;
    }

    function _openAssignCharacterModal(deptId, positionId, onSuccess) {
        if (typeof window.openAssignCharacterToPositionModal === 'function') {
            return window.openAssignCharacterToPositionModal(deptId, positionId, onSuccess);
        }
        if (typeof window._openAssignCharacterToPositionModal === 'function') {
            return window._openAssignCharacterToPositionModal(deptId, positionId, onSuccess);
        }
        _showToast('Assign character modal not available', 'error');
        return null;
    }

    function _openRemoveAssignmentModal(deptId, assignmentId, onSuccess) {
        if (typeof window.openRemoveAssignmentModal === 'function') {
            return window.openRemoveAssignmentModal(deptId, assignmentId, onSuccess);
        }
        if (typeof window._openRemoveAssignmentModal === 'function') {
            return window._openRemoveAssignmentModal(deptId, assignmentId, onSuccess);
        }
        _showToast('Remove assignment modal not available', 'error');
        return null;
    }

    function _openBulkAssignModal(deptId, positionId, onSuccess) {
        if (typeof window.openBulkAssignModal === 'function') {
            return window.openBulkAssignModal(deptId, positionId, onSuccess);
        }
        if (typeof window._openBulkAssignModal === 'function') {
            return window._openBulkAssignModal(deptId, positionId, onSuccess);
        }
        _showToast('Bulk assign modal not available', 'error');
        return null;
    }

    function _openSuccessionPlanningModal(deptId, positionId) {
        if (typeof window.openSuccessionPlanningModal === 'function') {
            return window.openSuccessionPlanningModal(deptId, positionId);
        }
        if (typeof window._openSuccessionPlanningModal === 'function') {
            return window._openSuccessionPlanningModal(deptId, positionId);
        }
        _showToast('Succession planning modal not available', 'error');
        return null;
    }

    function _openSalaryManagementModal(deptId, positionId, onSuccess) {
        if (typeof window.openSalaryManagementModal === 'function') {
            return window.openSalaryManagementModal(deptId, positionId, onSuccess);
        }
        if (typeof window._openSalaryManagementModal === 'function') {
            return window._openSalaryManagementModal(deptId, positionId, onSuccess);
        }
        _showToast('Salary management modal not available', 'error');
        return null;
    }

    // =========================================================================
    // 7. MAIN RENDER FUNCTION
    // =========================================================================

    function renderGovernmentStructureTab(containerId, locationId, onRefresh) {
        if (_rendering) return;
        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) return;

            if (!locationId) {
                container.innerHTML = '<div class="empty-state">' + _getHomeIcon() + ' Select a location to manage government structure</div>';
                return;
            }

            var place = _getPlaceById(locationId);
            var tree = _getGovernmentDepartmentTree(locationId);
            var placeName = place ? place.displayName : 'Unknown';

            // Get statistics
            var stats = _queries ? _queries.getStatistics({ includeDeprecated: false }) : null;
            var locationStats = _queries ? _queries.getLocationGovernmentSummary(locationId) : null;

            var html = 
                '<div class="government-structure-tab" style="padding:16px;">' +
                // Header
                '<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">' +
                '<div>' +
                '<h3 style="margin:0;">' + _getGearIcon() + ' Government Structure</h3>' +
                '<div style="font-size:0.6rem; color:var(--dim);">' + _getHomeIcon() + ' ' + _escapeHtml(placeName) + ' · ' + tree.length + ' department(s)' +
                (locationStats ? ' · ' + locationStats.totalPositions + ' positions · ' + locationStats.activeAssignments + ' active' : '') +
                '</div>' +
                '</div>' +
                '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
                '<button id="addDeptBtn" class="btn primary" style="padding:6px 12px; font-size:0.65rem;background:var(--accent);border:none;color:white;border-radius:4px;cursor:pointer;">' + _getCheckIcon() + ' Add Department</button>' +
                '<button id="bulkAssignBtn" class="btn" style="padding:6px 12px; font-size:0.65rem;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">' + _getPersonIcon() + ' Bulk Assign</button>' +
                '<button id="refreshStructureBtn" class="btn small" style="padding:6px 12px; font-size:0.65rem;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">' + _getRefreshIcon() + ' Refresh</button>' +
                '</div></div>';

            // Stats bar
            html +=
                '<div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:8px; margin-bottom:16px;">' +
                '<div style="background:var(--bg2); padding:8px; border-radius:6px; text-align:center;">' +
                '<div style="font-size:0.5rem; color:var(--dim);">' + _getHomeIcon() + ' Departments</div>' +
                '<div style="font-size:0.9rem; font-weight:bold;">' + (locationStats ? locationStats.totalDepartments : tree.length) + '</div></div>' +
                '<div style="background:var(--bg2); padding:8px; border-radius:6px; text-align:center;">' +
                '<div style="font-size:0.5rem; color:var(--dim);">' + _getGearIcon() + ' Positions</div>' +
                '<div style="font-size:0.9rem; font-weight:bold;">' + (locationStats ? locationStats.totalPositions : 0) + '</div></div>' +
                '<div style="background:var(--bg2); padding:8px; border-radius:6px; text-align:center;">' +
                '<div style="font-size:0.5rem; color:var(--dim);">' + _getPersonIcon() + ' Active Assignments</div>' +
                '<div style="font-size:0.9rem; font-weight:bold;">' + (locationStats ? locationStats.activeAssignments : 0) + '</div></div>' +
                '<div style="background:var(--bg2); padding:8px; border-radius:6px; text-align:center;">' +
                '<div style="font-size:0.5rem; color:var(--dim);">' + _getShieldIcon() + ' Role Positions</div>' +
                '<div style="font-size:0.9rem; font-weight:bold;">' + (locationStats ? locationStats.totalRolePositions : 0) + '</div></div>' +
                '</div>';

            if (tree.length === 0) {
                html += 
                    '<div class="empty-state" style="text-align:center; padding:60px; color:var(--dim); background:var(--bg2); border-radius:8px;">' +
                    '<div style="font-size:2rem; margin-bottom:12px;">' + _getHomeIcon() + '</div>' +
                    '<div>No government departments in this location</div>' +
                    '<div style="font-size:0.6rem; margin-top:8px;">' + _getCheckIcon() + ' Click "Add Department" to create the first one</div>' +
                    '</div>';
            } else {
                html += '<div class="department-tree">' +
                    tree.map(function(d) { return renderDepartmentNode(d, 0, locationId); }).join('') +
                    '</div>';
            }

            html += '</div>';
            container.innerHTML = html;

            // Attach event handlers
            attachStructureEventHandlers(containerId, locationId, onRefresh);

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 8. DEPARTMENT NODE RENDERER
    // =========================================================================

    function renderDepartmentNode(node, level, locationId) {
        var isExpanded = structureState.expandedDepartments.has(node.id);
        var positions = node.positions || [];
        var assignments = node.assignments || [];
        var activeAssignments = assignments.filter(function(a) { return !a.endYear; });
        var indent = level * 16;

        // Get department from state for more details
        var dept = _getDepartment(node.id);
        var rolePositions = positions.filter(function(p) { return p.requiredRoleId; }).length;

        // Calculate salary requirements if economy available
        var salaryReq = 0;
        if (_economy && dept) {
            var req = _economy.calculateDepartmentSalaryRequirements(dept.id);
            if (req) salaryReq = req.totalSalaryRequirement || 0;
        }

        var html = 
            '<div class="dept-node" data-dept-id="' + node.id + '" style="margin-left:' + indent + 'px; margin-bottom:8px; border-left:2px solid var(--border); padding-left:12px;">' +
            '<div class="dept-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; padding:8px 12px; background:var(--bg2); border-radius:6px; cursor:pointer;">' +
            '<div style="display:flex; align-items:center; gap:8px;">' +
            '<span class="dept-toggle" style="font-size:0.6rem;">' + (node.children && node.children.length > 0 ? (isExpanded ? '▼' : '▶') : '•') + '</span>' +
            '<strong>' + _getHomeIcon() + ' ' + _escapeHtml(node.name) + '</strong>' +
            '<span style="font-size:0.5rem; color:var(--accent);">' + (rolePositions > 0 ? _getShieldIcon() + ' ' + rolePositions + ' role positions' : '') + '</span>' +
            '<span style="font-size:0.5rem; color:var(--dim);">(' + positions.length + ' positions · ' + activeAssignments.length + ' assigned)</span>' +
            (salaryReq > 0 ? '<span style="font-size:0.5rem; color:var(--accent);">' + _getCoinIcon() + ' ' + salaryReq + 'g/yr</span>' : '') +
            '</div>' +
            '<div style="display:flex; gap:4px;">' +
            '<button class="add-position-btn btn small" data-dept-id="' + node.id + '" style="padding:2px 8px; font-size:0.5rem;background:var(--bg3);border:1px solid var(--border);border-radius:3px;cursor:pointer;">' + _getCheckIcon() + ' Position</button>' +
            '<button class="edit-dept-btn btn small" data-dept-id="' + node.id + '" style="padding:2px 8px; font-size:0.5rem;background:var(--bg3);border:1px solid var(--border);border-radius:3px;cursor:pointer;">' + _getGearIcon() + '</button>' +
            '<button class="delete-dept-btn btn small danger" data-dept-id="' + node.id + '" style="padding:2px 8px; font-size:0.5rem;background:#8a3020;border:none;color:white;border-radius:3px;cursor:pointer;">' + _getCrossIcon() + '</button>' +
            '</div></div>';

        if (node.description) {
            html += '<div style="font-size:0.55rem; color:var(--dim); padding:4px 12px;">' + _getBookIcon() + ' ' + _escapeHtml(node.description) + '</div>';
        }

        // Show location if different from parent
        if (node.locationId && node.locationId !== locationId) {
            var loc = _getPlaceById(node.locationId);
            if (loc) {
                html += '<div style="font-size:0.5rem; color:var(--dim); padding:2px 12px;">' + _getFlagIcon() + ' Location: ' + _escapeHtml(loc.displayName) + '</div>';
            }
        }

        if (node.children && node.children.length > 0 && isExpanded) {
            html += '<div class="dept-children" style="margin-top:4px;">' +
                node.children.map(function(c) { return renderDepartmentNode(c, level + 1, locationId); }).join('') +
                '</div>';
        }

        if (positions.length > 0) {
            html += '<div class="positions-list" style="margin-top:4px; padding-left:8px;">' +
                positions.sort(function(a, b) { return (a.priority || 10) - (b.priority || 10); })
                    .map(function(p) { return renderPositionItem(node.id, p, assignments, dept); }).join('') +
                '</div>';
        }

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 9. POSITION ITEM RENDERER
    // =========================================================================

    function renderPositionItem(deptId, position, allAssignments, dept) {
        var isExpanded = structureState.expandedPositions.has(position.id);
        var posAssignments = allAssignments.filter(function(a) { return a.positionId === position.id; });
        var activeAssignments = posAssignments.filter(function(a) { return !a.endYear; });

        var priorityLabel = position.priority || 10;
        var priorityText = priorityLabel <= 3 ? 'High' : (priorityLabel <= 7 ? 'Medium' : 'Low');
        var priorityIcon = priorityLabel <= 3 ? _getStarIcon() : (priorityLabel <= 7 ? _getCircleIcon() : _getCircleIcon());

        var roleName = position.requiredRoleId ? (_getRoleById(position.requiredRoleId)?.name || 'Unknown') : 'None';
        var hasRoleReq = !!position.requiredRoleId;

        // Get salary
        var salary = 0;
        if (dept && _economy) {
            salary = _economy.calculatePositionSalary(position.id, dept);
        }

        // Get succession plan
        var succession = null;
        if (_assignment && isExpanded) {
            succession = _assignment.getSuccessionPlan(deptId, position.id);
        }

        var html = 
            '<div class="position-item" data-position-id="' + position.id + '" style="margin-bottom:4px; padding:4px 8px; background:var(--bg3); border-radius:4px; border-left:3px solid ' + (hasRoleReq ? 'var(--accent)' : 'var(--border)') + ';">' +
            '<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">' +
            '<div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">' +
            '<span class="pos-toggle" style="font-size:0.5rem; cursor:pointer;">' + (activeAssignments.length > 0 ? '▼' : '•') + '</span>' +
            '<span style="font-size:0.7rem; ' + (activeAssignments.length > 0 ? 'font-weight:bold;' : 'normal;') + '">' + _getGearIcon() + ' ' + _escapeHtml(position.name) + '</span>' +
            '<span style="font-size:0.45rem; color:var(--dim);">[' + priorityIcon + ' ' + priorityText + ' · prio ' + priorityLabel + ']</span>' +
            (hasRoleReq ? '<span style="font-size:0.45rem; color:var(--accent);">' + _getShieldIcon() + ' Role: ' + _escapeHtml(roleName) + (position.minSkillLevel > 0 ? ' (Min: ' + position.minSkillLevel + ')' : '') + '</span>' : '') +
            (salary > 0 ? '<span style="font-size:0.45rem; color:var(--accent);">' + _getCoinIcon() + ' ' + salary + 'g/yr</span>' : '') +
            '<span style="font-size:0.45rem; color:var(--accent);">' + _getPersonIcon() + ' ' + activeAssignments.length + ' assigned</span>' +
            (position.genderRestriction && position.genderRestriction !== 'either' ? '<span style="font-size:0.4rem; color:var(--dim);">(' + position.genderRestriction + ')</span>' : '') +
            '</div>' +
            '<div style="display:flex; gap:4px; flex-wrap:wrap;">' +
            '<button class="assign-char-btn btn small" data-dept-id="' + deptId + '" data-position-id="' + position.id + '" style="padding:1px 6px; font-size:0.4rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:3px;cursor:pointer;">' + _getPersonIcon() + ' Assign</button>' +
            '<button class="bulk-assign-btn btn small" data-dept-id="' + deptId + '" data-position-id="' + position.id + '" style="padding:1px 6px; font-size:0.4rem;background:var(--bg3);border:1px solid var(--border);border-radius:3px;cursor:pointer;">' + _getPersonIcon() + ' Bulk</button>' +
            '<button class="succession-btn btn small" data-dept-id="' + deptId + '" data-position-id="' + position.id + '" style="padding:1px 6px; font-size:0.4rem;background:var(--bg3);border:1px solid var(--border);border-radius:3px;cursor:pointer;">' + _getCrownIcon() + '</button>' +
            '<button class="salary-btn btn small" data-dept-id="' + deptId + '" data-position-id="' + position.id + '" style="padding:1px 6px; font-size:0.4rem;background:var(--bg3);border:1px solid var(--border);border-radius:3px;cursor:pointer;">' + _getCoinIcon() + '</button>' +
            '<button class="edit-position-btn btn small" data-dept-id="' + deptId + '" data-position-id="' + position.id + '" style="padding:1px 6px; font-size:0.4rem;background:var(--bg3);border:1px solid var(--border);border-radius:3px;cursor:pointer;">' + _getGearIcon() + '</button>' +
            '<button class="delete-position-btn btn small danger" data-dept-id="' + deptId + '" data-position-id="' + position.id + '" style="padding:1px 6px; font-size:0.4rem;background:#8a3020;border:none;color:white;border-radius:3px;cursor:pointer;">' + _getCrossIcon() + '</button>' +
            '</div></div>';

        if (position.description) {
            html += '<div style="font-size:0.45rem; color:var(--dim); padding-left:12px;">' + _getBookIcon() + ' ' + _escapeHtml(position.description) + '</div>';
        }

        // Show assignments
        if (activeAssignments.length > 0) {
            html += '<div class="assignments-list" style="padding-left:12px; margin-top:4px;">' +
                activeAssignments.map(function(a) { return renderAssignmentItem(deptId, a); }).join('') +
                '</div>';
        }

        // Show succession plan
        if (isExpanded && succession && succession.candidates && succession.candidates.length > 0) {
            html += '<div style="padding-left:12px; margin-top:4px; font-size:0.45rem; color:var(--dim);">' +
                _getCrownIcon() + ' Succession: ' + succession.candidates.length + ' candidates' +
                (succession.topCandidate ? ' · Top: ' + _escapeHtml(succession.topCandidate.characterName) : '') +
                '</div>';
        }

        html += '</div>';
        return html;
    }

    // =========================================================================
    // 10. ASSIGNMENT ITEM RENDERER
    // =========================================================================

    function renderAssignmentItem(deptId, assignment) {
        var character = _getCharacterById(assignment.characterId);
        var charName = assignment.characterName || (character ? character.name : 'Unknown');
        var charSurname = character ? (character.surname || '') : '';
        var isDeceased = character ? character.isDeceased : false;
        var age = character ? _calculateAge(character.birthYear, false, null) : '?';
        var gender = character ? (character.gender === 'male' ? '♂' : character.gender === 'female' ? '♀' : '⚥') : '';

        var fullName = charName + (charSurname ? ' ' + charSurname : '');
        var title = assignment.title || assignment.positionId;
        var roleName = assignment.roleIdAtAssignment ? (_getRoleById(assignment.roleIdAtAssignment)?.name || 'Unknown') : null;

        var statusIcon = isDeceased ? _getCrossIcon() : _getCheckIcon();
        var statusColor = isDeceased ? 'var(--dim)' : 'var(--success)';

        return '<div class="assignment-item" data-assignment-id="' + assignment.id + '" style="display:flex; justify-content:space-between; align-items:center; padding:2px 8px; background:rgba(13,17,25,0.4); border-radius:4px; margin-bottom:2px;">' +
            '<div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">' +
            '<span style="font-size:0.5rem; color:' + statusColor + ';">' + statusIcon + '</span>' +
            '<span style="font-size:0.55rem; ' + (isDeceased ? 'text-decoration:line-through; color:var(--dim);' : '') + '">' + _escapeHtml(fullName) + '</span>' +
            (gender ? '<span style="font-size:0.4rem; color:var(--dim);">' + gender + '</span>' : '') +
            '<span style="font-size:0.45rem; color:var(--accent);">' + _getCrownIcon() + ' ' + _escapeHtml(title) + '</span>' +
            (roleName ? '<span style="font-size:0.4rem; color:var(--accent);">(Role: ' + _escapeHtml(roleName) + (assignment.skillLevelAtAssignment ? ' - ' + assignment.skillLevelAtAssignment : '') + ')</span>' : '') +
            '<span style="font-size:0.4rem; color:var(--dim);">since ' + assignment.startYear + '</span>' +
            (isDeceased ? '<span style="font-size:0.4rem; color:var(--dim);">' + _getCrossIcon() + ' deceased</span>' : '') +
            '</div>' +
            '<button class="remove-assignment-btn btn small danger" data-dept-id="' + deptId + '" data-assignment-id="' + assignment.id + '" style="padding:1px 6px; font-size:0.4rem;background:#8a3020;border:none;color:white;border-radius:3px;cursor:pointer;">' + _getCrossIcon() + '</button>' +
            '</div>';
    }

    // =========================================================================
    // 11. EVENT HANDLERS
    // =========================================================================

    function attachStructureEventHandlers(containerId, locationId, onRefresh) {
        var container = document.getElementById(containerId);
        if (!container) return;

        var addDeptBtn = document.getElementById('addDeptBtn');
        if (addDeptBtn) {
            addDeptBtn.onclick = function() {
                _openCreateDepartmentModal(locationId, function() {
                    if (onRefresh) onRefresh();
                });
            };
        }

        var bulkAssignBtn = document.getElementById('bulkAssignBtn');
        if (bulkAssignBtn) {
            bulkAssignBtn.onclick = function() {
                // Find first position with active assignments to use for bulk
                var tree = _getGovernmentDepartmentTree(locationId);
                var firstPosition = findFirstPosition(tree);
                if (firstPosition) {
                    _openBulkAssignModal(firstPosition.deptId, firstPosition.positionId, function() {
                        if (onRefresh) onRefresh();
                    });
                } else {
                    _showToast('No positions found to bulk assign', 'warning');
                }
            };
        }

        function findFirstPosition(nodes) {
            for (var i = 0; i < nodes.length; i++) {
                var node = nodes[i];
                if (node.positions && node.positions.length > 0) {
                    return { deptId: node.id, positionId: node.positions[0].id };
                }
                if (node.children) {
                    var result = findFirstPosition(node.children);
                    if (result) return result;
                }
            }
            return null;
        }

        var refreshBtn = document.getElementById('refreshStructureBtn');
        if (refreshBtn) {
            refreshBtn.onclick = function() {
                if (onRefresh) onRefresh();
                _showToast(_getRefreshIcon() + ' Refreshed', 'success');
            };
        }

        // Delegate event handlers using container
        if (container._delegateAttached) return;
        container._delegateAttached = true;

        container.addEventListener('click', function(e) {
            // Department header toggle
            var deptHeader = e.target.closest('.dept-header');
            if (deptHeader && !e.target.closest('button')) {
                var deptNode = deptHeader.closest('.dept-node');
                if (deptNode) {
                    var deptId = deptNode.dataset.deptId;
                    var toggle = deptHeader.querySelector('.dept-toggle');
                    var children = deptNode.querySelector('.dept-children');
                    if (children && toggle) {
                        var isExpanded = structureState.expandedDepartments.has(deptId);
                        if (isExpanded) {
                            structureState.expandedDepartments.delete(deptId);
                            children.style.display = 'none';
                            toggle.textContent = '▶';
                        } else {
                            structureState.expandedDepartments.add(deptId);
                            children.style.display = 'block';
                            toggle.textContent = '▼';
                        }
                    }
                }
                return;
            }

            // Position toggle
            var posToggle = e.target.closest('.pos-toggle');
            if (posToggle) {
                var posItem = posToggle.closest('.position-item');
                if (posItem) {
                    var posId = posItem.dataset.positionId;
                    var isExpanded = structureState.expandedPositions.has(posId);
                    if (isExpanded) {
                        structureState.expandedPositions.delete(posId);
                    } else {
                        structureState.expandedPositions.add(posId);
                    }
                    if (onRefresh) onRefresh();
                }
                return;
            }

            // Edit department
            var editDeptBtn = e.target.closest('.edit-dept-btn');
            if (editDeptBtn) {
                var deptId = editDeptBtn.dataset.deptId;
                _openEditDepartmentModal(deptId, function() { if (onRefresh) onRefresh(); });
                return;
            }

            // Delete department
            var deleteDeptBtn = e.target.closest('.delete-dept-btn');
            if (deleteDeptBtn) {
                var deptId = deleteDeptBtn.dataset.deptId;
                _openDeleteDepartmentModal(deptId, function() { if (onRefresh) onRefresh(); });
                return;
            }

            // Add position
            var addPosBtn = e.target.closest('.add-position-btn');
            if (addPosBtn) {
                var deptId = addPosBtn.dataset.deptId;
                _openAddPositionModal(deptId, function() { if (onRefresh) onRefresh(); });
                return;
            }

            // Edit position
            var editPosBtn = e.target.closest('.edit-position-btn');
            if (editPosBtn) {
                var deptId = editPosBtn.dataset.deptId;
                var positionId = editPosBtn.dataset.positionId;
                _openEditPositionModal(deptId, positionId, function() { if (onRefresh) onRefresh(); });
                return;
            }

            // Delete position
            var deletePosBtn = e.target.closest('.delete-position-btn');
            if (deletePosBtn) {
                var deptId = deletePosBtn.dataset.deptId;
                var positionId = deletePosBtn.dataset.positionId;
                _openDeletePositionModal(deptId, positionId, function() { if (onRefresh) onRefresh(); });
                return;
            }

            // Assign character
            var assignBtn = e.target.closest('.assign-char-btn');
            if (assignBtn) {
                var deptId = assignBtn.dataset.deptId;
                var positionId = assignBtn.dataset.positionId;
                _openAssignCharacterModal(deptId, positionId, function() { if (onRefresh) onRefresh(); });
                return;
            }

            // Bulk assign
            var bulkAssignBtn = e.target.closest('.bulk-assign-btn');
            if (bulkAssignBtn) {
                var deptId = bulkAssignBtn.dataset.deptId;
                var positionId = bulkAssignBtn.dataset.positionId;
                _openBulkAssignModal(deptId, positionId, function() { if (onRefresh) onRefresh(); });
                return;
            }

            // Succession planning
            var successionBtn = e.target.closest('.succession-btn');
            if (successionBtn) {
                var deptId = successionBtn.dataset.deptId;
                var positionId = successionBtn.dataset.positionId;
                _openSuccessionPlanningModal(deptId, positionId);
                return;
            }

            // Salary management
            var salaryBtn = e.target.closest('.salary-btn');
            if (salaryBtn) {
                var deptId = salaryBtn.dataset.deptId;
                var positionId = salaryBtn.dataset.positionId;
                _openSalaryManagementModal(deptId, positionId, function() { if (onRefresh) onRefresh(); });
                return;
            }

            // Remove assignment
            var removeAssignmentBtn = e.target.closest('.remove-assignment-btn');
            if (removeAssignmentBtn) {
                var deptId = removeAssignmentBtn.dataset.deptId;
                var assignmentId = removeAssignmentBtn.dataset.assignmentId;
                _openRemoveAssignmentModal(deptId, assignmentId, function() { if (onRefresh) onRefresh(); });
                return;
            }
        });
    }

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    window.renderGovernmentStructureTab = renderGovernmentStructureTab;
    window.structureState = structureState;



})();