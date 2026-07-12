/**
 * =============================================================================
 * GOVERNMENT UI LIST (government-ui-list.js)
 * =============================================================================
 * 
 * PURPOSE: UI list rendering for government departments, positions, and assignments.
 * 
 * DEPENDENCIES:
 *   - government-state.js (GovernmentState)
 *   - government-queries.js (GovernmentQueries)
 *   - role-queries.js (RoleQueries) - for role display
 *   - modals-core.js (_escapeHtml, _getIcon, _showToast)
 * 
 * ICON POLICY:
 *   - All icons from icons.js via _getIcon()
 *   - NO emojis
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _rendering = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getRoleById(id) {
        if (typeof window.getRoleById === 'function') {
            return window.getRoleById(id);
        }
        return null;
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
    // 4. RENDER DEPARTMENT LIST
    // =========================================================================

    function renderDepartmentList(containerId, options) {
        if (_rendering) {
            return;
        }
        _rendering = true;

        try {
            options = options || {};
            var container = document.getElementById(containerId);
            if (!container) return;

            var locationId = options.locationId || null;
            var searchTerm = options.searchTerm || '';
            var onSelect = options.onSelect || null;
            var selectedId = options.selectedId || null;
            var sortBy = options.sortBy || 'name';
            var sortOrder = options.sortOrder || 'asc';
            var showStats = options.showStats !== undefined ? options.showStats : false;
            var showActions = options.showActions !== undefined ? options.showActions : true;

            var departments = [];
            if (locationId) {
                departments = GovernmentState.getDepartmentsByLocation(locationId);
            } else {
                departments = GovernmentState.getAllDepartments({ includeDeprecated: false });
            }

            if (searchTerm) {
                var lower = searchTerm.toLowerCase();
                departments = departments.filter(function(d) {
                    return d.name.toLowerCase().indexOf(lower) !== -1 ||
                        (d.description && d.description.toLowerCase().indexOf(lower) !== -1);
                });
            }

            departments.sort(function(a, b) {
                var compare = 0;
                switch (sortBy) {
                    case 'name':
                        compare = (a.name || '').localeCompare(b.name || '');
                        break;
                    case 'positions':
                        compare = ((a.positions || []).length) - ((b.positions || []).length);
                        break;
                    case 'assignments':
                        compare = ((a.assignments || []).length) - ((b.assignments || []).length);
                        break;
                    case 'createdAt':
                        compare = (a.createdAt || 0) - (b.createdAt || 0);
                        break;
                    default:
                        compare = (a.name || '').localeCompare(b.name || '');
                }
                return sortOrder === 'desc' ? -compare : compare;
            });

            var departmentIcon = _getIconSafe('HOME');
            var personIcon = _getIconSafe('PERSON');
            var locationIcon = _getIconSafe('LOCATION');
            var editIcon = _getIconSafe('EDIT');
            var deleteIcon = _getIconSafe('X_HEAVY');

            var html = '<div class="government-department-list">';

            if (departments.length === 0) {
                html += '<div style="text-align: center; padding: 40px; color: var(--dim); font-size: 0.65rem;">No departments found</div>';
            } else {
                for (var i = 0; i < departments.length; i++) {
                    var d = departments[i];
                    var positions = d.positions || [];
                    var assignments = d.assignments || [];
                    var activeAssignments = assignments.filter(function(a) { return !a.endYear; });
                    var isSelected = (selectedId === d.id);
                    var rolePositions = positions.filter(function(p) { return p.requiredRoleId; }).length;

                    var locationName = d.locationId ? (_getPlaceById(d.locationId)?.displayName || 'Unknown') : 'No location';
                    var parentName = d.parentDepartmentId ? (GovernmentState.getDepartment(d.parentDepartmentId)?.name || 'Unknown') : null;

                    var statsHtml = '';
                    if (showStats) {
                        statsHtml = '<div style="font-size:0.5rem; color:var(--dim); margin-top:4px; display:flex; gap:12px; flex-wrap:wrap;">' +
                            '<span>Role positions: ' + rolePositions + '</span>' +
                            '<span>Active assignments: ' + activeAssignments.length + '</span>' +
                            '<span>Total assignments: ' + assignments.length + '</span>' +
                            '</div>';
                    }

                    var actionsHtml = '';
                    if (showActions) {
                        actionsHtml = 
                            '<div style="display:flex; gap:4px; flex-shrink:0;">' +
                            '<button class="dept-edit-btn" data-dept-id="' + d.id + '" style="background:none; border:none; cursor:pointer; color:var(--accent); padding:2px 4px; font-size:0.6rem;">' + editIcon + '</button>' +
                            '<button class="dept-delete-btn" data-dept-id="' + d.id + '" style="background:none; border:none; cursor:pointer; color:var(--dim); padding:2px 4px; font-size:0.6rem;">' + deleteIcon + '</button>' +
                            '</div>';
                    }

                    html +=
                        '<div class="department-item" data-dept-id="' + d.id + '" style="' +
                        'background: ' + (isSelected ? 'rgba(var(--accent-rgb), 0.12)' : 'var(--bg3)') + ';' +
                        'border: 1px solid ' + (isSelected ? 'var(--accent)' : 'var(--border)') + ';' +
                        'border-radius: 6px;' +
                        'padding: 10px 14px;' +
                        'margin-bottom: 6px;' +
                        'cursor: pointer;' +
                        'transition: all 0.1s;' +
                        '">' +
                        '<div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 6px;">' +
                        '<div style="flex: 1; min-width: 0;">' +
                        '<div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">' +
                        '<strong style="font-size: 0.85rem;">' + departmentIcon + ' ' + _escapeHtml(d.name) + '</strong>' +
                        (parentName ? '<span style="font-size: 0.55rem; color: var(--dim);">(Child of ' + _escapeHtml(parentName) + ')</span>' : '') +
                        (isSelected ? '<span style="font-size: 0.55rem; background: var(--accent); padding: 2px 8px; border-radius: 12px; color: white;">Selected</span>' : '') +
                        '</div>' +
                        (d.description ? '<div style="font-size: 0.6rem; color: var(--dim); margin-top: 4px;">' + _escapeHtml(d.description) + '</div>' : '') +
                        '<div style="font-size: 0.55rem; color: var(--dim); margin-top: 4px; display: flex; gap: 12px; flex-wrap: wrap;">' +
                        '<span>' + locationIcon + ' ' + _escapeHtml(locationName) + '</span>' +
                        '<span>' + personIcon + ' ' + positions.length + ' positions (' + rolePositions + ' with role)</span>' +
                        '<span>' + activeAssignments.length + ' active / ' + assignments.length + ' total assignments</span>' +
                        '</div>' +
                        statsHtml +
                        '</div>' +
                        '<div style="text-align: right; flex-shrink: 0; display: flex; align-items: center; gap: 8px;">' +
                        '<span style="font-size: 0.55rem; color: var(--accent);">View</span>' +
                        actionsHtml +
                        '</div>' +
                        '</div>' +
                        '</div>';
                }
            }

            html += '</div>';
            container.innerHTML = html;

            // Click handlers
            if (onSelect) {
                var items = container.querySelectorAll('.department-item');
                for (var i = 0; i < items.length; i++) {
                    (function(item) {
                        item.addEventListener('click', function(e) {
                            if (e.target.closest('button')) return;
                            var deptId = this.dataset.deptId;
                            var dept = GovernmentState.getDepartment(deptId);
                            if (dept) {
                                onSelect(dept);
                            }
                        });
                        item.addEventListener('mouseenter', function() {
                            if (this.dataset.deptId !== selectedId) {
                                this.style.background = 'var(--bg2)';
                            }
                        });
                        item.addEventListener('mouseleave', function() {
                            if (this.dataset.deptId !== selectedId) {
                                this.style.background = 'var(--bg3)';
                            }
                        });
                    })(items[i]);
                }
            }

            // Edit handlers
            var editBtns = container.querySelectorAll('.dept-edit-btn');
            for (var i = 0; i < editBtns.length; i++) {
                (function(btn) {
                    btn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        var deptId = this.dataset.deptId;
                        if (typeof window.openEditGovernmentDepartmentModal === 'function') {
                            window.openEditGovernmentDepartmentModal(deptId);
                        } else {
                            _showToast('Edit modal not available', 'error');
                        }
                    });
                })(editBtns[i]);
            }

            // Delete handlers
            var deleteBtns = container.querySelectorAll('.dept-delete-btn');
            for (var i = 0; i < deleteBtns.length; i++) {
                (function(btn) {
                    btn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        var deptId = this.dataset.deptId;
                        if (typeof window.openDeleteGovernmentDepartmentModal === 'function') {
                            window.openDeleteGovernmentDepartmentModal(deptId);
                        } else {
                            _showToast('Delete modal not available', 'error');
                        }
                    });
                })(deleteBtns[i]);
            }

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 5. RENDER POSITION LIST
    // =========================================================================

    function renderPositionList(containerId, departmentId, options) {
        if (_rendering) {
            return;
        }
        _rendering = true;

        try {
            options = options || {};
            var container = document.getElementById(containerId);
            if (!container) return;

            var positions = GovernmentState.getPositionsForDepartment(departmentId);
            var onSelect = options.onSelect || null;
            var selectedId = options.selectedId || null;
            var showRoleInfo = options.showRoleInfo !== undefined ? options.showRoleInfo : true;
            var showActions = options.showActions !== undefined ? options.showActions : true;

            // Get assignments for each position
            var assignmentMap = {};
            for (var i = 0; i < positions.length; i++) {
                var pos = positions[i];
                assignmentMap[pos.id] = GovernmentState.getAssignmentsForPosition(departmentId, pos.id, true);
            }

            var personIcon = _getIconSafe('PERSON');
            var checkIcon = _getIconSafe('CHECK_SIMPLE');
            var editIcon = _getIconSafe('EDIT');
            var deleteIcon = _getIconSafe('X_HEAVY');

            var html = '<div class="government-position-list">';

            if (positions.length === 0) {
                html += '<div style="text-align: center; padding: 20px; color: var(--dim); font-size: 0.6rem;">No positions found</div>';
            } else {
                positions.sort(function(a, b) {
                    return (a.priority || 10) - (b.priority || 10);
                });

                for (var i = 0; i < positions.length; i++) {
                    var p = positions[i];
                    var assignments = assignmentMap[p.id] || [];
                    var isSelected = (selectedId === p.id);
                    var roleName = p.requiredRoleId ? (_getRoleById(p.requiredRoleId)?.name || 'Unknown') : 'None';
                    var hasRoleReq = !!p.requiredRoleId;
                    var skillReq = p.minSkillLevel || 0;

                    var assignedChars = assignments.map(function(a) {
                        var c = _getCharacterById(a.characterId);
                        return c ? c.name : 'Unknown';
                    }).join(', ');

                    var roleInfoHtml = '';
                    if (showRoleInfo && hasRoleReq) {
                        roleInfoHtml = '<span style="font-size:0.5rem; color:var(--accent); margin-left:6px;">Role: ' + _escapeHtml(roleName) + 
                            (skillReq > 0 ? ' (Min: ' + skillReq + ')' : '') + '</span>';
                    }

                    var actionsHtml = '';
                    if (showActions) {
                        actionsHtml = 
                            '<div style="display:flex; gap:4px;">' +
                            '<button class="pos-edit-btn" data-pos-id="' + p.id + '" style="background:none; border:none; cursor:pointer; color:var(--accent); padding:2px 4px; font-size:0.5rem;">' + editIcon + '</button>' +
                            '<button class="pos-delete-btn" data-pos-id="' + p.id + '" style="background:none; border:none; cursor:pointer; color:var(--dim); padding:2px 4px; font-size:0.5rem;">' + deleteIcon + '</button>' +
                            '</div>';
                    }

                    html +=
                        '<div class="position-item" data-pos-id="' + p.id + '" style="' +
                        'background: ' + (isSelected ? 'rgba(var(--accent-rgb), 0.12)' : 'var(--bg3)') + ';' +
                        'border: 1px solid ' + (isSelected ? 'var(--accent)' : 'var(--border)') + ';' +
                        'border-left: 3px solid ' + (hasRoleReq ? 'var(--accent)' : 'var(--border)') + ';' +
                        'border-radius: 4px;' +
                        'padding: 8px 12px;' +
                        'margin-bottom: 4px;' +
                        'cursor: pointer;' +
                        'transition: all 0.1s;' +
                        '">' +
                        '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">' +
                        '<div>' +
                        '<span style="font-size: 0.7rem;">' + personIcon + ' ' + _escapeHtml(p.name) + '</span>' +
                        roleInfoHtml +
                        (p.parentPositionId ? ' <span style="font-size: 0.5rem; color: var(--dim);">(Child)</span>' : '') +
                        '</div>' +
                        '<div style="font-size: 0.55rem; color: var(--dim); display: flex; gap: 8px; align-items: center;">' +
                        '<span>Priority: ' + (p.priority || 10) + '</span>' +
                        '<span>' + assignments.length + ' assigned</span>' +
                        (isSelected ? '<span style="color: var(--success);">' + checkIcon + ' Selected</span>' : '') +
                        actionsHtml +
                        '</div>' +
                        '</div>' +
                        (assignedChars ? '<div style="font-size: 0.5rem; color: var(--dim); margin-top: 4px;">' + _escapeHtml(assignedChars) + '</div>' : '') +
                        (p.description ? '<div style="font-size: 0.5rem; color: var(--dim); margin-top: 2px;">' + _escapeHtml(p.description) + '</div>' : '') +
                        '</div>';
                }
            }

            html += '</div>';
            container.innerHTML = html;

            // Click handlers
            if (onSelect) {
                var items = container.querySelectorAll('.position-item');
                for (var i = 0; i < items.length; i++) {
                    (function(item) {
                        item.addEventListener('click', function(e) {
                            if (e.target.closest('button')) return;
                            var posId = this.dataset.posId;
                            var position = GovernmentState.getPositionById(departmentId, posId);
                            if (position) {
                                onSelect(position);
                            }
                        });
                        item.addEventListener('mouseenter', function() {
                            this.style.background = 'var(--bg2)';
                        });
                        item.addEventListener('mouseleave', function() {
                            this.style.background = 'var(--bg3)';
                        });
                    })(items[i]);
                }
            }

            // Edit handlers
            var editBtns = container.querySelectorAll('.pos-edit-btn');
            for (var i = 0; i < editBtns.length; i++) {
                (function(btn) {
                    btn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        var posId = this.dataset.posId;
                        if (typeof window.openEditPositionModal === 'function') {
                            window.openEditPositionModal(departmentId, posId);
                        } else {
                            _showToast('Edit modal not available', 'error');
                        }
                    });
                })(editBtns[i]);
            }

            // Delete handlers
            var deleteBtns = container.querySelectorAll('.pos-delete-btn');
            for (var i = 0; i < deleteBtns.length; i++) {
                (function(btn) {
                    btn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        var posId = this.dataset.posId;
                        if (typeof window.openDeletePositionModal === 'function') {
                            window.openDeletePositionModal(departmentId, posId);
                        } else {
                            _showToast('Delete modal not available', 'error');
                        }
                    });
                })(deleteBtns[i]);
            }

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 6. RENDER ASSIGNMENT LIST
    // =========================================================================

    function renderAssignmentList(containerId, departmentId, positionId, options) {
        if (_rendering) {
            return;
        }
        _rendering = true;

        try {
            options = options || {};
            var container = document.getElementById(containerId);
            if (!container) return;

            var assignments = GovernmentState.getAssignmentsForPosition(departmentId, positionId, false);
            var onSelect = options.onSelect || null;
            var selectedId = options.selectedId || null;
            var showRoleInfo = options.showRoleInfo !== undefined ? options.showRoleInfo : true;

            var personIcon = _getIconSafe('PERSON');
            var checkIcon = _getIconSafe('CHECK_SIMPLE');
            var editIcon = _getIconSafe('EDIT');

            var html = '<div class="government-assignment-list">';

            if (assignments.length === 0) {
                html += '<div style="text-align: center; padding: 20px; color: var(--dim); font-size: 0.6rem;">No assignments found</div>';
            } else {
                assignments.sort(function(a, b) {
                    return (b.startYear || 0) - (a.startYear || 0);
                });

                for (var i = 0; i < assignments.length; i++) {
                    var a = assignments[i];
                    var isActive = !a.endYear;
                    var character = _getCharacterById(a.characterId);
                    var isSelected = (selectedId === a.id);
                    var roleName = a.roleIdAtAssignment ? (_getRoleById(a.roleIdAtAssignment)?.name || 'Unknown') : 'None';
                    var skillLevel = a.skillLevelAtAssignment || 0;

                    var roleInfoHtml = '';
                    if (showRoleInfo && a.roleIdAtAssignment) {
                        roleInfoHtml = '<span style="font-size:0.45rem; color:var(--accent); margin-left:6px;">Role: ' + _escapeHtml(roleName) + 
                            (skillLevel > 0 ? ' (Skill: ' + skillLevel + ')' : '') + '</span>';
                    }

                    html +=
                        '<div class="assignment-item" data-assign-id="' + a.id + '" style="' +
                        'background: ' + (isSelected ? 'rgba(var(--accent-rgb), 0.12)' : (isActive ? 'rgba(74, 158, 106, 0.08)' : 'var(--bg3)')) + ';' +
                        'border-left: 3px solid ' + (isActive ? 'var(--success)' : 'var(--dim)') + ';' +
                        'padding: 6px 12px;' +
                        'margin-bottom: 4px;' +
                        'cursor: pointer;' +
                        'transition: all 0.1s;' +
                        '">' +
                        '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">' +
                        '<div>' +
                        '<span style="font-size: 0.65rem;">' + personIcon + ' ' + _escapeHtml(a.characterName || (character ? character.name : 'Unknown')) + '</span>' +
                        (a.title ? ' <span style="font-size: 0.5rem; color: var(--dim);">(' + _escapeHtml(a.title) + ')</span>' : '') +
                        roleInfoHtml +
                        '</div>' +
                        '<div style="font-size: 0.5rem; color: var(--dim); display: flex; gap: 8px; align-items: center;">' +
                        '<span>' + a.startYear + (a.endYear ? ' - ' + a.endYear : ' - Present') + '</span>' +
                        (isActive ? '<span style="color: var(--success);">Active</span>' : '<span style="color: var(--dim);">Ended</span>') +
                        (isSelected ? '<span style="color: var(--success);">' + checkIcon + ' Selected</span>' : '') +
                        '<button class="assign-end-btn" data-assign-id="' + a.id + '" style="background:none; border:none; cursor:pointer; color:var(--warn); padding:2px 4px; font-size:0.45rem;">End</button>' +
                        '</div>' +
                        '</div>' +
                        (a.notes ? '<div style="font-size: 0.5rem; color: var(--dim); margin-top: 2px;">' + _escapeHtml(a.notes) + '</div>' : '') +
                        '</div>';
                }
            }

            html += '</div>';
            container.innerHTML = html;

            // Click handlers
            if (onSelect) {
                var items = container.querySelectorAll('.assignment-item');
                for (var i = 0; i < items.length; i++) {
                    (function(item) {
                        item.addEventListener('click', function(e) {
                            if (e.target.closest('button')) return;
                            var assignId = this.dataset.assignId;
                            var assignment = GovernmentState.getAssignmentById(departmentId, assignId);
                            if (assignment) {
                                onSelect(assignment);
                            }
                        });
                        item.addEventListener('mouseenter', function() {
                            this.style.background = 'var(--bg2)';
                        });
                        item.addEventListener('mouseleave', function() {
                            var isActive = !this.dataset.endYear;
                            this.style.background = isActive ? 'rgba(74, 158, 106, 0.08)' : 'var(--bg3)';
                        });
                    })(items[i]);
                }
            }

            // End handlers
            var endBtns = container.querySelectorAll('.assign-end-btn');
            for (var i = 0; i < endBtns.length; i++) {
                (function(btn) {
                    btn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        var assignId = this.dataset.assignId;
                        if (typeof window.openRemoveAssignmentModal === 'function') {
                            window.openRemoveAssignmentModal(departmentId, assignId);
                        } else {
                            _showToast('End assignment modal not available', 'error');
                        }
                    });
                })(endBtns[i]);
            }

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 7. RENDER POSITION SUMMARY CARD
    // =========================================================================

    function renderPositionSummaryCard(containerId, position) {
        if (_rendering) {
            return;
        }
        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) return;

            if (!position) {
                container.innerHTML = '<div style="color: var(--dim); text-align: center; padding: 20px; font-size: 0.6rem;">No position data</div>';
                return;
            }

            var roleName = position.requiredRoleId ? (_getRoleById(position.requiredRoleId)?.name || 'Unknown') : 'None';
            var hasRoleReq = !!position.requiredRoleId;
            var personIcon = _getIconSafe('PERSON');
            var checkIcon = _getIconSafe('CHECK_SIMPLE');

            var html = 
                '<div style="background: var(--bg2); border-radius: 8px; padding: 12px; border-left: 3px solid ' + (hasRoleReq ? 'var(--accent)' : 'var(--border)') + ';">' +
                '<div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px;">' +
                '<div>' +
                '<div style="font-size: 0.9rem; font-weight: bold;">' + personIcon + ' ' + _escapeHtml(position.name) + '</div>' +
                '<div style="font-size: 0.6rem; color: var(--dim); margin-top: 4px;">' +
                'Priority: ' + (position.priority || 10) +
                (position.parentPositionId ? ' · Parent: ' + _escapeHtml(position.parentPositionId) : '') +
                '</div>' +
                '</div>' +
                '<div style="text-align: right; font-size: 0.55rem; color: var(--accent);">' +
                '<div>Required Role: ' + _escapeHtml(roleName) + '</div>' +
                (position.minSkillLevel > 0 ? '<div>Min Skill: ' + position.minSkillLevel + '</div>' : '') +
                (position.genderRestriction && position.genderRestriction !== 'either' ? '<div>Gender: ' + _escapeHtml(position.genderRestriction) + '</div>' : '') +
                '</div>' +
                '</div>' +
                (position.description ? '<div style="font-size: 0.6rem; color: var(--dim); margin-top: 8px;">' + _escapeHtml(position.description) + '</div>' : '') +
                '</div>';

            container.innerHTML = html;

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 8. RENDER DEPARTMENT SUMMARY CARD
    // =========================================================================

    function renderDepartmentSummaryCard(containerId, department) {
        if (_rendering) {
            return;
        }
        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) return;

            if (!department) {
                container.innerHTML = '<div style="color: var(--dim); text-align: center; padding: 20px; font-size: 0.6rem;">No department data</div>';
                return;
            }

            var positions = department.positions || [];
            var assignments = department.assignments || [];
            var activeAssignments = assignments.filter(function(a) { return !a.endYear; });
            var rolePositions = positions.filter(function(p) { return p.requiredRoleId; }).length;
            var locationName = department.locationId ? (_getPlaceById(department.locationId)?.displayName || 'Unknown') : 'None';

            var locationIcon = _getIconSafe('LOCATION');
            var personIcon = _getIconSafe('PERSON');

            var html = 
                '<div style="background: var(--bg2); border-radius: 8px; padding: 12px; border-left: 3px solid var(--accent);">' +
                '<div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px;">' +
                '<div>' +
                '<div style="font-size: 0.9rem; font-weight: bold;">' + _escapeHtml(department.name) + '</div>' +
                '<div style="font-size: 0.6rem; color: var(--dim); margin-top: 4px;">' +
                locationIcon + ' ' + _escapeHtml(locationName) +
                (department.parentDepartmentId ? ' · Parent: ' + _escapeHtml(GovernmentState.getDepartment(department.parentDepartmentId)?.name || 'Unknown') : '') +
                '</div>' +
                '</div>' +
                '<div style="text-align: right; font-size: 0.55rem; color: var(--accent);">' +
                '<div>' + personIcon + ' ' + positions.length + ' positions</div>' +
                '<div>Role positions: ' + rolePositions + '</div>' +
                '<div>Active: ' + activeAssignments.length + ' / ' + assignments.length + '</div>' +
                '</div>' +
                '</div>' +
                (department.description ? '<div style="font-size: 0.6rem; color: var(--dim); margin-top: 8px;">' + _escapeHtml(department.description) + '</div>' : '') +
                '</div>';

            container.innerHTML = html;

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 9. RENDER ASSIGNMENT SUMMARY CARD
    // =========================================================================

    function renderAssignmentSummaryCard(containerId, assignment) {
        if (_rendering) {
            return;
        }
        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) return;

            if (!assignment) {
                container.innerHTML = '<div style="color: var(--dim); text-align: center; padding: 20px; font-size: 0.6rem;">No assignment data</div>';
                return;
            }

            var character = _getCharacterById(assignment.characterId);
            var isActive = !assignment.endYear;
            var roleName = assignment.roleIdAtAssignment ? (_getRoleById(assignment.roleIdAtAssignment)?.name || 'Unknown') : 'None';

            var personIcon = _getIconSafe('PERSON');

            var html = 
                '<div style="background: var(--bg2); border-radius: 8px; padding: 12px; border-left: 3px solid ' + (isActive ? 'var(--success)' : 'var(--dim)') + ';">' +
                '<div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px;">' +
                '<div>' +
                '<div style="font-size: 0.9rem; font-weight: bold;">' + personIcon + ' ' + _escapeHtml(assignment.characterName || (character ? character.name : 'Unknown')) + '</div>' +
                '<div style="font-size: 0.6rem; color: var(--dim); margin-top: 4px;">' +
                'Title: ' + _escapeHtml(assignment.title || 'Unknown') +
                (assignment.roleIdAtAssignment ? ' · Role: ' + _escapeHtml(roleName) : '') +
                (assignment.skillLevelAtAssignment ? ' · Skill: ' + assignment.skillLevelAtAssignment : '') +
                '</div>' +
                '</div>' +
                '<div style="text-align: right; font-size: 0.55rem; color: ' + (isActive ? 'var(--success)' : 'var(--dim)') + ';">' +
                '<div>' + assignment.startYear + (assignment.endYear ? ' - ' + assignment.endYear : ' - Present') + '</div>' +
                '<div>' + (isActive ? 'Active' : 'Ended') + '</div>' +
                (assignment.endReason ? '<div style="font-size: 0.5rem;">' + _escapeHtml(assignment.endReason) + '</div>' : '') +
                '</div>' +
                '</div>' +
                (assignment.notes ? '<div style="font-size: 0.6rem; color: var(--dim); margin-top: 8px;">' + _escapeHtml(assignment.notes) + '</div>' : '') +
                '</div>';

            container.innerHTML = html;

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.GovernmentUI = {
        renderDepartmentList: renderDepartmentList,
        renderPositionList: renderPositionList,
        renderAssignmentList: renderAssignmentList,
        renderPositionSummaryCard: renderPositionSummaryCard,
        renderDepartmentSummaryCard: renderDepartmentSummaryCard,
        renderAssignmentSummaryCard: renderAssignmentSummaryCard
    };

    // Legacy aliases
    window._renderDepartmentList = renderDepartmentList;
    window._renderPositionList = renderPositionList;
    window._renderAssignmentList = renderAssignmentList;
    window._renderPositionSummaryCard = renderPositionSummaryCard;
    window._renderDepartmentSummaryCard = renderDepartmentSummaryCard;
    window._renderAssignmentSummaryCard = renderAssignmentSummaryCard;

})();