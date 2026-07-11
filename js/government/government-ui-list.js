/**
 * =============================================================================
 * GOVERNMENT UI LIST - UI list rendering for government departments
 * =============================================================================
 * 
 * Responsibilities:
 * - Render department lists with filters
 * - Render position lists
 * - Render assignment lists
 * - Handle selection and sorting
 * 
 * DEPENDENCIES:
 *   - government-state.js (GovernmentState)
 *   - government-queries.js (GovernmentQueries)
 *   - modals-core.js (_escapeHtml, _getIcon, _showToast)
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
    // 3. RENDER DEPARTMENT LIST
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
                    default:
                        compare = (a.name || '').localeCompare(b.name || '');
                }
                return sortOrder === 'desc' ? -compare : compare;
            });

            var departmentIcon = _getIcon('HOME');
            var personIcon = _getIcon('PERSON');
            var locationIcon = _getIcon('LOCATION');

            var html = '<div class="government-department-list">';

            if (departments.length === 0) {
                html += '<div style="text-align: center; padding: 40px; color: var(--dim);">No departments found</div>';
            } else {
                for (var i = 0; i < departments.length; i++) {
                    var d = departments[i];
                    var positions = d.positions || [];
                    var assignments = d.assignments || [];
                    var activeAssignments = assignments.filter(function(a) { return !a.endYear; });
                    var isSelected = (selectedId === d.id);

                    var locationName = d.locationId ? (_getPlaceById(d.locationId)?.displayName || 'Unknown') : 'No location';
                    var parentName = d.parentDepartmentId ? (GovernmentState.getDepartment(d.parentDepartmentId)?.name || 'Unknown') : null;

                    html +=
                        '<div class="department-item" data-dept-id="' + d.id + '" style="' +
                        'background: ' + (isSelected ? 'var(--accent-dim)' : 'var(--bg3)') + ';' +
                        'border: 1px solid ' + (isSelected ? 'var(--accent)' : 'var(--border)') + ';' +
                        'border-radius: 6px;' +
                        'padding: 12px 16px;' +
                        'margin-bottom: 8px;' +
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
                        '<span>' + personIcon + ' ' + positions.length + ' positions</span>' +
                        '<span>' + activeAssignments.length + ' active / ' + assignments.length + ' total assignments</span>' +
                        '</div>' +
                        '</div>' +
                        '<div style="text-align: right; flex-shrink: 0;">' +
                        '<span style="font-size: 0.55rem; color: var(--accent);">View</span>' +
                        '</div>' +
                        '</div>' +
                        '</div>';
                }
            }

            html += '</div>';
            container.innerHTML = html;

            if (onSelect) {
                var items = container.querySelectorAll('.department-item');
                for (var i = 0; i < items.length; i++) {
                    (function(item) {
                        item.addEventListener('click', function() {
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

            var uiState = GovernmentState.getUIState();
            uiState.filters.searchTerm = searchTerm || '';
            uiState.selectedDepartmentId = selectedId || null;

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 4. RENDER POSITION LIST
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

            var personIcon = _getIcon('PERSON');
            var checkIcon = _getIcon('CHECK_SIMPLE');

            var html = '<div class="government-position-list">';

            if (positions.length === 0) {
                html += '<div style="text-align: center; padding: 20px; color: var(--dim);">No positions found</div>';
            } else {
                for (var i = 0; i < positions.length; i++) {
                    var p = positions[i];
                    var assignments = GovernmentState.getAssignmentsForPosition(departmentId, p.id, true);
                    var isSelected = (selectedId === p.id);

                    html +=
                        '<div class="position-item" data-pos-id="' + p.id + '" style="' +
                        'background: ' + (isSelected ? 'var(--accent-dim)' : 'var(--bg3)') + ';' +
                        'border: 1px solid ' + (isSelected ? 'var(--accent)' : 'var(--border)') + ';' +
                        'border-radius: 4px;' +
                        'padding: 8px 12px;' +
                        'margin-bottom: 4px;' +
                        'cursor: pointer;' +
                        'transition: all 0.1s;' +
                        '">' +
                        '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">' +
                        '<div>' +
                        '<span style="font-size: 0.7rem;">' + personIcon + ' ' + _escapeHtml(p.name) + '</span>' +
                        (p.parentPositionId ? ' <span style="font-size: 0.5rem; color: var(--dim);">(Child)</span>' : '') +
                        '</div>' +
                        '<div style="font-size: 0.55rem; color: var(--dim); display: flex; gap: 8px; align-items: center;">' +
                        '<span>Priority: ' + (p.priority || 10) + '</span>' +
                        '<span>' + assignments.length + ' assigned</span>' +
                        (isSelected ? '<span style="color: var(--success);">' + checkIcon + ' Selected</span>' : '') +
                        '</div>' +
                        '</div>' +
                        '</div>';
                }
            }

            html += '</div>';
            container.innerHTML = html;

            if (onSelect) {
                var items = container.querySelectorAll('.position-item');
                for (var i = 0; i < items.length; i++) {
                    (function(item) {
                        item.addEventListener('click', function() {
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

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 5. RENDER ASSIGNMENT LIST
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

            var personIcon = _getIcon('PERSON');
            var checkIcon = _getIcon('CHECK_SIMPLE');

            var html = '<div class="government-assignment-list">';

            if (assignments.length === 0) {
                html += '<div style="text-align: center; padding: 20px; color: var(--dim);">No assignments found</div>';
            } else {
                assignments.sort(function(a, b) {
                    return (b.startYear || 0) - (a.startYear || 0);
                });

                for (var i = 0; i < assignments.length; i++) {
                    var a = assignments[i];
                    var isActive = !a.endYear;
                    var character = _getCharacterById(a.characterId);
                    var isSelected = (selectedId === a.id);

                    html +=
                        '<div class="assignment-item" data-assign-id="' + a.id + '" style="' +
                        'background: ' + (isSelected ? 'var(--accent-dim)' : (isActive ? 'rgba(74, 158, 106, 0.08)' : 'var(--bg3)')) + ';' +
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
                        '</div>' +
                        '<div style="font-size: 0.5rem; color: var(--dim); display: flex; gap: 8px; align-items: center;">' +
                        '<span>' + a.startYear + (a.endYear ? ' - ' + a.endYear : ' - Present') + '</span>' +
                        (isActive ? '<span style="color: var(--success);">Active</span>' : '<span style="color: var(--dim);">Ended</span>') +
                        (isSelected ? '<span style="color: var(--success);">' + checkIcon + ' Selected</span>' : '') +
                        '</div>' +
                        '</div>' +
                        (a.notes ? '<div style="font-size: 0.5rem; color: var(--dim); margin-top: 2px;">' + _escapeHtml(a.notes) + '</div>' : '') +
                        '</div>';
                }
            }

            html += '</div>';
            container.innerHTML = html;

            if (onSelect) {
                var items = container.querySelectorAll('.assignment-item');
                for (var i = 0; i < items.length; i++) {
                    (function(item) {
                        item.addEventListener('click', function() {
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

        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.GovernmentUI = {
        renderDepartmentList: renderDepartmentList,
        renderPositionList: renderPositionList,
        renderAssignmentList: renderAssignmentList
    };

})();