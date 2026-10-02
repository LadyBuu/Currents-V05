/**
 * government-ui-list.js
 * UI renderer. Consumes GovernmentQueries projections only.
 * No State reads. No cross-domain lookups. No fabricated fallbacks.
 */
(function() {
    'use strict';

    var Queries = window.GovernmentQueries;
    if (!Queries) throw new Error('government-ui-list.js requires GovernmentQueries');

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (!str && str !== 0) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _attr(s) { return _escapeHtml(s); }

    function _icon(name) {
        if (typeof window._getIcon === 'function') return window._getIcon(name);
        return window.Icons && window.Icons[name] ? window.Icons[name] : '';
    }

    function _iconSpan(name) {
        var i = _icon(name);
        return i ? '<span style="display:inline-flex;align-items:center;vertical-align:middle;">' + i + '</span>' : '';
    }

    // ---- Department list -----------------------------------------------------

    function renderDepartmentList(containerId, options) {
        options = options || {};
        var container = document.getElementById(containerId);
        if (!container) return;

        var listOptions = {
            includeDeprecated: !!options.includeDeprecated,
            sortBy: options.sortBy || 'name',
            sortOrder: options.sortOrder || 'asc'
        };
        var departments;
        if (options.locationId) {
            departments = Queries.getDepartmentsByLocation(options.locationId, listOptions);
        } else {
            departments = Queries.getDepartments(listOptions);
        }

        if (options.searchTerm) {
            var lower = options.searchTerm.toLowerCase();
            departments = departments.filter(function(d) {
                return (d.name && d.name.toLowerCase().indexOf(lower) !== -1) ||
                       (d.description && d.description.toLowerCase().indexOf(lower) !== -1);
            });
        }

        if (typeof options.selectedId === 'string') {
            departments = departments.map(function(d) {
                d._selected = d.id === options.selectedId;
                return d;
            });
        }

        var showStats = options.showStats !== false;
        var showActions = options.showActions !== false;
        var onSelect = options.onSelect || null;
        var selectedId = options.selectedId || null;

        var homeIcon = _iconSpan('HOME');
        var personIcon = _iconSpan('PERSON');
        var locationIcon = _iconSpan('LOCATION');
        var editIcon = _iconSpan('EDIT');
        var deleteIcon = _iconSpan('X_HEAVY');

        var html = '<div class="government-department-list">';

        if (departments.length === 0) {
            html += '<div style="text-align:center;padding:40px;color:var(--dim);font-size:0.65rem;">No departments found</div>';
        } else {
            for (var i = 0; i < departments.length; i++) {
                var d = departments[i];
                var isSelected = selectedId === d.id;

                var locationName = d.locationName || 'No location';
                var parentName = d.parentDepartmentName;

                var statsHtml = '';
                if (showStats) {
                    statsHtml = '<div style="font-size:0.5rem;color:var(--dim);margin-top:4px;display:flex;gap:12px;flex-wrap:wrap;">' +
                        '<span>Role positions: ' + d.rolePositionCount + '</span>' +
                        '<span>Active: ' + d.activeAssignmentCount + '</span>' +
                        '<span>Total: ' + d.assignmentCount + '</span>' +
                        '</div>';
                }

                var actionsHtml = '';
                if (showActions) {
                    actionsHtml =
                        '<div style="display:flex;gap:4px;flex-shrink:0;">' +
                        '<button type="button" class="dept-edit-btn" data-dept-id="' + _attr(d.id) + '" style="background:none;border:none;cursor:pointer;color:var(--accent);padding:2px 4px;font-size:0.6rem;">' + editIcon + '</button>' +
                        '<button type="button" class="dept-delete-btn" data-dept-id="' + _attr(d.id) + '" style="background:none;border:none;cursor:pointer;color:var(--dim);padding:2px 4px;font-size:0.6rem;">' + deleteIcon + '</button>' +
                        '</div>';
                }

                html +=
                    '<div class="department-item" data-dept-id="' + _attr(d.id) + '" style="' +
                    'background:' + (isSelected ? 'rgba(var(--accent-rgb),0.12)' : 'var(--bg3)') + ';' +
                    'border:1px solid ' + (isSelected ? 'var(--accent)' : 'var(--border)') + ';' +
                    'border-radius:6px;padding:10px 14px;margin-bottom:6px;cursor:pointer;transition:all 0.1s;">' +
                    '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:6px;">' +
                    '<div style="flex:1;min-width:0;">' +
                    '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
                    '<strong style="font-size:0.85rem;">' + homeIcon + ' ' + _escapeHtml(d.name) + '</strong>' +
                    (parentName ? '<span style="font-size:0.55rem;color:var(--dim);">(Child of ' + _escapeHtml(parentName) + ')</span>' : '') +
                    (isSelected ? '<span style="font-size:0.55rem;background:var(--accent);padding:2px 8px;border-radius:12px;color:white;">Selected</span>' : '') +
                    '</div>' +
                    (d.description ? '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">' + _escapeHtml(d.description) + '</div>' : '') +
                    '<div style="font-size:0.55rem;color:var(--dim);margin-top:4px;display:flex;gap:12px;flex-wrap:wrap;">' +
                    '<span>' + locationIcon + ' ' + _escapeHtml(locationName) + '</span>' +
                    '<span>' + personIcon + ' ' + d.positionCount + ' positions (' + d.rolePositionCount + ' with role)</span>' +
                    '<span>' + d.activeAssignmentCount + ' active / ' + d.assignmentCount + ' total</span>' +
                    '</div>' +
                    statsHtml +
                    '</div>' +
                    '<div style="text-align:right;flex-shrink:0;display:flex;align-items:center;gap:8px;">' +
                    '<span style="font-size:0.55rem;color:var(--accent);">View</span>' +
                    actionsHtml +
                    '</div>' +
                    '</div>' +
                    '</div>';
            }
        }

        html += '</div>';
        container.innerHTML = html;

        // Container-scoped event delegation
        if (onSelect) {
            container.addEventListener('click', function(e) {
                var item = e.target.closest('.department-item');
                if (!item || !container.contains(item)) return;
                if (e.target.closest('button')) return;
                var id = item.dataset.deptId;
                var dept = Queries.getDepartment(id);
                if (dept) onSelect(dept);
            });
        }

        container.addEventListener('click', function(e) {
            var editBtn = e.target.closest('.dept-edit-btn');
            if (editBtn && container.contains(editBtn)) {
                e.stopPropagation();
                if (typeof window.openEditGovernmentDepartmentModal === 'function') {
                    window.openEditGovernmentDepartmentModal(editBtn.dataset.deptId);
                }
                return;
            }
            var delBtn = e.target.closest('.dept-delete-btn');
            if (delBtn && container.contains(delBtn)) {
                e.stopPropagation();
                if (typeof window.openDeleteGovernmentDepartmentModal === 'function') {
                    window.openDeleteGovernmentDepartmentModal(delBtn.dataset.deptId);
                }
            }
        });
    }

    // ---- Position list -------------------------------------------------------

    function renderPositionList(containerId, departmentId, options) {
        options = options || {};
        var container = document.getElementById(containerId);
        if (!container) return;

        var positions = Queries.getPositionsForDepartment(departmentId, {
            sortBy: options.sortBy || 'priority',
            sortOrder: options.sortOrder || 'asc'
        });
        var selectedId = options.selectedId || null;
        var onSelect = options.onSelect || null;
        var showRoleInfo = options.showRoleInfo !== false;
        var showActions = options.showActions !== false;

        var personIcon = _iconSpan('PERSON');
        var editIcon = _iconSpan('EDIT');
        var deleteIcon = _iconSpan('X_HEAVY');

        var html = '<div class="government-position-list">';

        if (positions.length === 0) {
            html += '<div style="text-align:center;padding:20px;color:var(--dim);font-size:0.6rem;">No positions found</div>';
        } else {
            for (var i = 0; i < positions.length; i++) {
                var p = positions[i];
                var isSelected = selectedId === p.id;
                var hasRoleReq = !!p.requiredRoleId;

                var roleInfoHtml = '';
                if (showRoleInfo && hasRoleReq) {
                    roleInfoHtml = '<span style="font-size:0.5rem;color:var(--accent);margin-left:6px;">Role: ' + _escapeHtml(p.requiredRoleName) +
                        (p.minSkillLevel != null && p.minSkillLevel > 0 ? ' (Min: ' + p.minSkillLevel + ')' : '') + '</span>';
                }

                var actionsHtml = '';
                if (showActions) {
                    actionsHtml =
                        '<div style="display:flex;gap:4px;">' +
                        '<button type="button" class="pos-edit-btn" data-pos-id="' + _attr(p.id) + '" style="background:none;border:none;cursor:pointer;color:var(--accent);padding:2px 4px;font-size:0.5rem;">' + editIcon + '</button>' +
                        '<button type="button" class="pos-delete-btn" data-pos-id="' + _attr(p.id) + '" style="background:none;border:none;cursor:pointer;color:var(--dim);padding:2px 4px;font-size:0.5rem;">' + deleteIcon + '</button>' +
                        '</div>';
                }

                html +=
                    '<div class="position-item" data-pos-id="' + _attr(p.id) + '" data-selected="' + (isSelected ? 'true' : 'false') + '" style="' +
                    'background:' + (isSelected ? 'rgba(var(--accent-rgb),0.12)' : 'var(--bg3)') + ';' +
                    'border:1px solid ' + (isSelected ? 'var(--accent)' : 'var(--border)') + ';' +
                    'border-left:3px solid ' + (hasRoleReq ? 'var(--accent)' : 'var(--border)') + ';' +
                    'border-radius:4px;padding:8px 12px;margin-bottom:4px;cursor:pointer;transition:all 0.1s;">' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">' +
                    '<div>' +
                    '<span style="font-size:0.7rem;">' + personIcon + ' ' + _escapeHtml(p.name) + '</span>' +
                    roleInfoHtml +
                    (p.parentPositionId ? ' <span style="font-size:0.5rem;color:var(--dim);">(Child)</span>' : '') +
                    '</div>' +
                    '<div style="font-size:0.55rem;color:var(--dim);display:flex;gap:8px;align-items:center;">' +
                    '<span>Priority: ' + p.priority + '</span>' +
                    '<span>' + p.assignmentCount + ' assigned</span>' +
                    actionsHtml +
                    '</div>' +
                    '</div>' +
                    (p.description ? '<div style="font-size:0.5rem;color:var(--dim);margin-top:2px;">' + _escapeHtml(p.description) + '</div>' : '') +
                    '</div>';
            }
        }

        html += '</div>';
        container.innerHTML = html;

        if (onSelect) {
            container.addEventListener('click', function(e) {
                var item = e.target.closest('.position-item');
                if (!item || !container.contains(item)) return;
                if (e.target.closest('button')) return;
                var pos = Queries.getPosition(departmentId, item.dataset.posId);
                if (pos) onSelect(pos);
            });
        }

        container.addEventListener('click', function(e) {
            var editBtn = e.target.closest('.pos-edit-btn');
            if (editBtn && container.contains(editBtn)) {
                e.stopPropagation();
                if (typeof window.openEditPositionModal === 'function') {
                    window.openEditPositionModal(departmentId, editBtn.dataset.posId);
                }
                return;
            }
            var delBtn = e.target.closest('.pos-delete-btn');
            if (delBtn && container.contains(delBtn)) {
                e.stopPropagation();
                if (typeof window.openDeletePositionModal === 'function') {
                    window.openDeletePositionModal(departmentId, delBtn.dataset.posId);
                }
            }
        });
    }

    // ---- Assignment list -----------------------------------------------------

    function renderAssignmentList(containerId, departmentId, positionId, options) {
        options = options || {};
        var container = document.getElementById(containerId);
        if (!container) return;

        var assignments = Queries.getAssignmentsForPosition(departmentId, positionId, {});
        assignments.sort(function(a, b) {
            return (b.startYear || 0) - (a.startYear || 0);
        });

        var selectedId = options.selectedId || null;
        var onSelect = options.onSelect || null;
        var showRoleInfo = options.showRoleInfo !== false;

        var personIcon = _iconSpan('PERSON');

        var html = '<div class="government-assignment-list">';

        if (assignments.length === 0) {
            html += '<div style="text-align:center;padding:20px;color:var(--dim);font-size:0.6rem;">No assignments found</div>';
        } else {
            for (var i = 0; i < assignments.length; i++) {
                var a = assignments[i];
                var isActive = a.isActive;
                var isSelected = selectedId === a.id;

                var roleInfoHtml = '';
                if (showRoleInfo && a.roleIdAtAssignment) {
                    roleInfoHtml = '<span style="font-size:0.45rem;color:var(--accent);margin-left:6px;">Role: ' + _escapeHtml(a.roleNameAtAssignment || 'Unknown') +
                        (a.skillLevelAtAssignment != null && a.skillLevelAtAssignment > 0 ? ' (Skill: ' + a.skillLevelAtAssignment + ')' : '') + '</span>';
                }

                var endLabel = a.endYear != null ? ' - ' + a.endYear : ' - Present';

                html +=
                    '<div class="assignment-item" data-assign-id="' + _attr(a.id) + '" data-active="' + (isActive ? 'true' : 'false') + '" data-selected="' + (isSelected ? 'true' : 'false') + '" style="' +
                    'background:' + (isSelected ? 'rgba(var(--accent-rgb),0.12)' : (isActive ? 'rgba(74,158,106,0.08)' : 'var(--bg3)')) + ';' +
                    'border-left:3px solid ' + (isActive ? 'var(--success)' : 'var(--dim)') + ';' +
                    'padding:6px 12px;margin-bottom:4px;cursor:pointer;transition:all 0.1s;">' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">' +
                    '<div>' +
                    '<span style="font-size:0.65rem;">' + personIcon + ' ' + _escapeHtml(a.characterName || 'Unknown') + '</span>' +
                    (a.title ? ' <span style="font-size:0.5rem;color:var(--dim);">(' + _escapeHtml(a.title) + ')</span>' : '') +
                    roleInfoHtml +
                    '</div>' +
                    '<div style="font-size:0.5rem;color:var(--dim);display:flex;gap:8px;align-items:center;">' +
                    '<span>' + a.startYear + endLabel + '</span>' +
                    (isActive ? '<span style="color:var(--success);">Active</span>' : '<span style="color:var(--dim);">Ended</span>') +
                    '<button type="button" class="assign-end-btn" data-assign-id="' + _attr(a.id) + '" style="background:none;border:none;cursor:pointer;color:var(--warn);padding:2px 4px;font-size:0.45rem;">End</button>' +
                    '</div>' +
                    '</div>' +
                    (a.notes ? '<div style="font-size:0.5rem;color:var(--dim);margin-top:2px;">' + _escapeHtml(a.notes) + '</div>' : '') +
                    '</div>';
            }
        }

        html += '</div>';
        container.innerHTML = html;

        if (onSelect) {
            container.addEventListener('click', function(e) {
                var item = e.target.closest('.assignment-item');
                if (!item || !container.contains(item)) return;
                if (e.target.closest('button')) return;
                var asg = Queries.getAssignment(departmentId, item.dataset.assignId);
                if (asg) onSelect(asg);
            });
        }

        container.addEventListener('click', function(e) {
            var endBtn = e.target.closest('.assign-end-btn');
            if (endBtn && container.contains(endBtn)) {
                e.stopPropagation();
                if (typeof window.openRemoveAssignmentModal === 'function') {
                    window.openRemoveAssignmentModal(departmentId, endBtn.dataset.assignId);
                }
            }
        });
    }

    // ---- Summary cards -------------------------------------------------------

    function renderPositionSummaryCard(containerId, position) {
        var container = document.getElementById(containerId);
        if (!container) return;
        if (!position) {
            container.innerHTML = '<div style="color:var(--dim);text-align:center;padding:20px;font-size:0.6rem;">No position data</div>';
            return;
        }
        var hasRoleReq = !!position.requiredRoleId;
        var personIcon = _iconSpan('PERSON');
        var html =
            '<div style="background:var(--bg2);border-radius:8px;padding:12px;border-left:3px solid ' + (hasRoleReq ? 'var(--accent)' : 'var(--border)') + ';">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">' +
            '<div>' +
            '<div style="font-size:0.9rem;font-weight:bold;">' + personIcon + ' ' + _escapeHtml(position.name) + '</div>' +
            '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">' +
            'Priority: ' + position.priority +
            (position.parentPositionName ? ' · Parent: ' + _escapeHtml(position.parentPositionName) : '') +
            '</div>' +
            '</div>' +
            '<div style="text-align:right;font-size:0.55rem;color:var(--accent);">' +
            '<div>Required Role: ' + _escapeHtml(position.requiredRoleName || 'None') + '</div>' +
            (position.minSkillLevel != null && position.minSkillLevel > 0 ? '<div>Min Skill: ' + position.minSkillLevel + '</div>' : '') +
            (position.genderRestriction && position.genderRestriction !== 'either' ? '<div>Gender: ' + _escapeHtml(position.genderRestriction) + '</div>' : '') +
            '</div>' +
            '</div>' +
            (position.description ? '<div style="font-size:0.6rem;color:var(--dim);margin-top:8px;">' + _escapeHtml(position.description) + '</div>' : '') +
            '</div>';
        container.innerHTML = html;
    }

    function renderDepartmentSummaryCard(containerId, department) {
        var container = document.getElementById(containerId);
        if (!container) return;
        if (!department) {
            container.innerHTML = '<div style="color:var(--dim);text-align:center;padding:20px;font-size:0.6rem;">No department data</div>';
            return;
        }
        var locationIcon = _iconSpan('LOCATION');
        var personIcon = _iconSpan('PERSON');
        var html =
            '<div style="background:var(--bg2);border-radius:8px;padding:12px;border-left:3px solid var(--accent);">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">' +
            '<div>' +
            '<div style="font-size:0.9rem;font-weight:bold;">' + _escapeHtml(department.name) + '</div>' +
            '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">' +
            locationIcon + ' ' + _escapeHtml(department.locationName || 'None') +
            (department.parentDepartmentName ? ' · Parent: ' + _escapeHtml(department.parentDepartmentName) : '') +
            '</div>' +
            '</div>' +
            '<div style="text-align:right;font-size:0.55rem;color:var(--accent);">' +
            '<div>' + personIcon + ' ' + department.positionCount + ' positions</div>' +
            '<div>Role positions: ' + department.rolePositionCount + '</div>' +
            '<div>Active: ' + department.activeAssignmentCount + ' / ' + department.assignmentCount + '</div>' +
            '</div>' +
            '</div>' +
            (department.description ? '<div style="font-size:0.6rem;color:var(--dim);margin-top:8px;">' + _escapeHtml(department.description) + '</div>' : '') +
            '</div>';
        container.innerHTML = html;
    }

    function renderAssignmentSummaryCard(containerId, assignment) {
        var container = document.getElementById(containerId);
        if (!container) return;
        if (!assignment) {
            container.innerHTML = '<div style="color:var(--dim);text-align:center;padding:20px;font-size:0.6rem;">No assignment data</div>';
            return;
        }
        var isActive = assignment.isActive;
        var personIcon = _iconSpan('PERSON');
        var html =
            '<div style="background:var(--bg2);border-radius:8px;padding:12px;border-left:3px solid ' + (isActive ? 'var(--success)' : 'var(--dim)') + ';">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">' +
            '<div>' +
            '<div style="font-size:0.9rem;font-weight:bold;">' + personIcon + ' ' + _escapeHtml(assignment.characterName || 'Unknown') + '</div>' +
            '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">' +
            'Title: ' + _escapeHtml(assignment.title || 'Unknown') +
            (assignment.roleNameAtAssignment ? ' · Role: ' + _escapeHtml(assignment.roleNameAtAssignment) : '') +
            (assignment.skillLevelAtAssignment != null ? ' · Skill: ' + assignment.skillLevelAtAssignment : '') +
            '</div>' +
            '</div>' +
            '<div style="text-align:right;font-size:0.55rem;color:' + (isActive ? 'var(--success)' : 'var(--dim)') + ';">' +
            '<div>' + assignment.startYear + (assignment.endYear != null ? ' - ' + assignment.endYear : ' - Present') + '</div>' +
            '<div>' + (isActive ? 'Active' : 'Ended') + '</div>' +
            (assignment.endReason ? '<div style="font-size:0.5rem;">' + _escapeHtml(assignment.endReason) + '</div>' : '') +
            '</div>' +
            '</div>' +
            (assignment.notes ? '<div style="font-size:0.6rem;color:var(--dim);margin-top:8px;">' + _escapeHtml(assignment.notes) + '</div>' : '') +
            '</div>';
        container.innerHTML = html;
    }

    // ---- Export --------------------------------------------------------------

    window.GovernmentUI = {
        renderDepartmentList: renderDepartmentList,
        renderPositionList: renderPositionList,
        renderAssignmentList: renderAssignmentList,
        renderPositionSummaryCard: renderPositionSummaryCard,
        renderDepartmentSummaryCard: renderDepartmentSummaryCard,
        renderAssignmentSummaryCard: renderAssignmentSummaryCard
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.GovernmentUI;
    }
})();
