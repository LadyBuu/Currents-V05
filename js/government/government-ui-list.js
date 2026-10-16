/**
 * government-ui-list.js
 * UI renderer. Consumes GovernmentViewModels only. No queries. No state.
 *
 * Contract:
 *   - Every public renderer takes a container id (or element) and a view model
 *     produced by GovernmentViewModels.
 *   - Icons via window._getIcon. No inline domain numbers. No fabricated values.
 *   - No direct query calls. The caller fetches and shapes; this module paints.
 *   - Structural inline styles only (flex, gap, borders). No domain data inline.
 */
(function() {
    'use strict';

    var VM = window.GovernmentViewModels;
    if (!VM) throw new Error('government-ui-list.js requires GovernmentViewModels');

    // ---- Presentation helpers ------------------------------------------------

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
        return i
            ? '<span style="display:inline-flex;align-items:center;vertical-align:middle;">' + i + '</span>'
            : '';
    }

    function _resolveContainer(containerIdOrEl) {
        if (!containerIdOrEl) return null;
        if (typeof containerIdOrEl === 'string') {
            return document.getElementById(containerIdOrEl);
        }
        return containerIdOrEl;
    }

    // ---- Department list -----------------------------------------------------

    function renderDepartmentList(container, viewModels, options) {
        var el = _resolveContainer(container);
        if (!el) return;
        options = options || {};

        var items = Array.isArray(viewModels) ? viewModels : [];
        var onSelect = options.onSelect || null;
        var showStats = options.showStats !== false;
        var showActions = options.showActions !== false;

        var homeIcon = _iconSpan('HOME');
        var personIcon = _iconSpan('PERSON');
        var locationIcon = _iconSpan('LOCATION');
        var editIcon = _iconSpan('EDIT');
        var deleteIcon = _iconSpan('X_HEAVY');

        var html = '<div class="government-department-list">';

        if (items.length === 0) {
            html += '<div style="text-align:center;padding:40px;color:var(--dim);font-size:0.65rem;">No departments found</div>';
        } else {
            for (var i = 0; i < items.length; i++) {
                var d = items[i];
                if (!d) continue;

                var statsHtml = '';
                if (showStats) {
                    statsHtml = '<div style="font-size:0.5rem;color:var(--dim);margin-top:4px;display:flex;gap:12px;flex-wrap:wrap;">' +
                        '<span>Role positions: ' + d.stats.rolePositionCount + '</span>' +
                        '<span>Active: ' + d.stats.activeAssignmentCount + '</span>' +
                        '<span>Total: ' + d.stats.assignmentCount + '</span>' +
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
                    'background:' + (d.isSelected ? 'rgba(var(--accent-rgb),0.12)' : 'var(--bg3)') + ';' +
                    'border:1px solid ' + (d.isSelected ? 'var(--accent)' : 'var(--border)') + ';' +
                    'border-radius:6px;padding:10px 14px;margin-bottom:6px;cursor:pointer;transition:all 0.1s;">' +
                    '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:6px;">' +
                    '<div style="flex:1;min-width:0;">' +
                    '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
                    '<strong style="font-size:0.85rem;">' + homeIcon + ' ' + _escapeHtml(d.name) + '</strong>' +
                    (d.parentDepartmentLabel ? '<span style="font-size:0.55rem;color:var(--dim);">(Child of ' + _escapeHtml(d.parentDepartmentLabel) + ')</span>' : '') +
                    (d.isSelected ? '<span style="font-size:0.55rem;background:var(--accent);padding:2px 8px;border-radius:12px;color:white;">Selected</span>' : '') +
                    '</div>' +
                    (d.description ? '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">' + _escapeHtml(d.description) + '</div>' : '') +
                    '<div style="font-size:0.55rem;color:var(--dim);margin-top:4px;display:flex;gap:12px;flex-wrap:wrap;">' +
                    '<span>' + locationIcon + ' ' + _escapeHtml(d.locationLabel) + '</span>' +
                    '<span>' + personIcon + ' ' + d.stats.positionCount + ' positions (' + d.stats.rolePositionCount + ' with role)</span>' +
                    '<span>' + d.stats.activeAssignmentCount + ' active / ' + d.stats.assignmentCount + ' total</span>' +
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
        el.innerHTML = html;

        if (onSelect) {
            el.addEventListener('click', function(e) {
                var item = e.target.closest('.department-item');
                if (!item || !el.contains(item)) return;
                if (e.target.closest('button')) return;
                var id = item.dataset.deptId;
                var found = null;
                for (var k = 0; k < items.length; k++) {
                    if (items[k] && items[k].id === id) { found = items[k]; break; }
                }
                if (found) onSelect(found);
            });
        }

        el.addEventListener('click', function(e) {
            var editBtn = e.target.closest('.dept-edit-btn');
            if (editBtn && el.contains(editBtn)) {
                e.stopPropagation();
                if (typeof window.openEditGovernmentDepartmentModal === 'function') {
                    window.openEditGovernmentDepartmentModal(editBtn.dataset.deptId);
                }
                return;
            }
            var delBtn = e.target.closest('.dept-delete-btn');
            if (delBtn && el.contains(delBtn)) {
                e.stopPropagation();
                if (typeof window.openDeleteGovernmentDepartmentModal === 'function') {
                    window.openDeleteGovernmentDepartmentModal(delBtn.dataset.deptId);
                }
            }
        });
    }

    // ---- Position list -------------------------------------------------------

    function renderPositionList(container, viewModels, options) {
        var el = _resolveContainer(container);
        if (!el) return;
        options = options || {};

        var items = Array.isArray(viewModels) ? viewModels : [];
        var onSelect = options.onSelect || null;
        var showRoleInfo = options.showRoleInfo !== false;
        var showActions = options.showActions !== false;

        var personIcon = _iconSpan('PERSON');
        var editIcon = _iconSpan('EDIT');
        var deleteIcon = _iconSpan('X_HEAVY');

        var html = '<div class="government-position-list">';

        if (items.length === 0) {
            html += '<div style="text-align:center;padding:20px;color:var(--dim);font-size:0.6rem;">No positions found</div>';
        } else {
            for (var i = 0; i < items.length; i++) {
                var p = items[i];
                if (!p) continue;

                var roleInfoHtml = '';
                if (showRoleInfo && p.hasRoleRequirement) {
                    roleInfoHtml = '<span style="font-size:0.5rem;color:var(--accent);margin-left:6px;">Role: ' + _escapeHtml(p.requiredRoleLabel || 'Unknown') +
                        (p.minSkillLevel != null && p.minSkillLevel > 0 ? ' (Min: ' + p.minSkillLevel + ')' : '') + '</span>';
                }

                var actionsHtml = '';
                if (showActions) {
                    actionsHtml =
                        '<div style="display:flex;gap:4px;">' +
                        '<button type="button" class="pos-edit-btn" data-pos-id="' + _attr(p.id) + '" data-dept-id="' + _attr(p.departmentId) + '" style="background:none;border:none;cursor:pointer;color:var(--accent);padding:2px 4px;font-size:0.5rem;">' + editIcon + '</button>' +
                        '<button type="button" class="pos-delete-btn" data-pos-id="' + _attr(p.id) + '" data-dept-id="' + _attr(p.departmentId) + '" style="background:none;border:none;cursor:pointer;color:var(--dim);padding:2px 4px;font-size:0.5rem;">' + deleteIcon + '</button>' +
                        '</div>';
                }

                html +=
                    '<div class="position-item" data-pos-id="' + _attr(p.id) + '" data-dept-id="' + _attr(p.departmentId) + '" data-selected="' + (p.isSelected ? 'true' : 'false') + '" style="' +
                    'background:' + (p.isSelected ? 'rgba(var(--accent-rgb),0.12)' : 'var(--bg3)') + ';' +
                    'border:1px solid ' + (p.isSelected ? 'var(--accent)' : 'var(--border)') + ';' +
                    'border-left:3px solid ' + (p.hasRoleRequirement ? 'var(--accent)' : 'var(--border)') + ';' +
                    'border-radius:4px;padding:8px 12px;margin-bottom:4px;cursor:pointer;transition:all 0.1s;">' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">' +
                    '<div>' +
                    '<span style="font-size:0.7rem;">' + personIcon + ' ' + _escapeHtml(p.name) + '</span>' +
                    roleInfoHtml +
                    (p.hasParent ? ' <span style="font-size:0.5rem;color:var(--dim);">(Child)</span>' : '') +
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
        el.innerHTML = html;

        if (onSelect) {
            el.addEventListener('click', function(e) {
                var item = e.target.closest('.position-item');
                if (!item || !el.contains(item)) return;
                if (e.target.closest('button')) return;
                var id = item.dataset.posId;
                var found = null;
                for (var k = 0; k < items.length; k++) {
                    if (items[k] && items[k].id === id) { found = items[k]; break; }
                }
                if (found) onSelect(found);
            });
        }

        el.addEventListener('click', function(e) {
            var editBtn = e.target.closest('.pos-edit-btn');
            if (editBtn && el.contains(editBtn)) {
                e.stopPropagation();
                if (typeof window.openEditPositionModal === 'function') {
                    window.openEditPositionModal(editBtn.dataset.deptId, editBtn.dataset.posId);
                }
                return;
            }
            var delBtn = e.target.closest('.pos-delete-btn');
            if (delBtn && el.contains(delBtn)) {
                e.stopPropagation();
                if (typeof window.openDeletePositionModal === 'function') {
                    window.openDeletePositionModal(delBtn.dataset.deptId, delBtn.dataset.posId);
                }
            }
        });
    }

    // ---- Assignment list -----------------------------------------------------

    function renderAssignmentList(container, viewModels, options) {
        var el = _resolveContainer(container);
        if (!el) return;
        options = options || {};

        var items = Array.isArray(viewModels) ? viewModels : [];
        var onSelect = options.onSelect || null;
        var showRoleInfo = options.showRoleInfo !== false;
        var showEndButton = options.showEndButton !== false;
        var departmentId = options.departmentId || null;

        var personIcon = _iconSpan('PERSON');

        var html = '<div class="government-assignment-list">';

        if (items.length === 0) {
            html += '<div style="text-align:center;padding:20px;color:var(--dim);font-size:0.6rem;">No assignments found</div>';
        } else {
            for (var i = 0; i < items.length; i++) {
                var a = items[i];
                if (!a) continue;

                var roleInfoHtml = '';
                if (showRoleInfo && a.roleLabel) {
                    roleInfoHtml = '<span style="font-size:0.45rem;color:var(--accent);margin-left:6px;">Role: ' + _escapeHtml(a.roleLabel) +
                        (a.skillLevel != null && a.skillLevel > 0 ? ' (Skill: ' + a.skillLevel + ')' : '') + '</span>';
                }

                var endBtnHtml = '';
                if (showEndButton && a.isActive) {
                    endBtnHtml = '<button type="button" class="assign-end-btn" data-assign-id="' + _attr(a.id) + '" style="background:none;border:none;cursor:pointer;color:var(--warn);padding:2px 4px;font-size:0.45rem;">End</button>';
                }

                html +=
                    '<div class="assignment-item" data-assign-id="' + _attr(a.id) + '" data-active="' + (a.isActive ? 'true' : 'false') + '" data-selected="' + (a.isSelected ? 'true' : 'false') + '" style="' +
                    'background:' + (a.isSelected ? 'rgba(var(--accent-rgb),0.12)' : (a.isActive ? 'rgba(74,158,106,0.08)' : 'var(--bg3)')) + ';' +
                    'border-left:3px solid ' + (a.isActive ? 'var(--success)' : 'var(--dim)') + ';' +
                    'padding:6px 12px;margin-bottom:4px;cursor:pointer;transition:all 0.1s;">' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">' +
                    '<div>' +
                    '<span style="font-size:0.65rem;">' + personIcon + ' ' + _escapeHtml(a.characterName) + '</span>' +
                    (a.title ? ' <span style="font-size:0.5rem;color:var(--dim);">(' + _escapeHtml(a.title) + ')</span>' : '') +
                    roleInfoHtml +
                    '</div>' +
                    '<div style="font-size:0.5rem;color:var(--dim);display:flex;gap:8px;align-items:center;">' +
                    '<span>' + a.startYear + ' - ' + a.endLabel + '</span>' +
                    (a.isActive ? '<span style="color:var(--success);">Active</span>' : '<span style="color:var(--dim);">Ended</span>') +
                    endBtnHtml +
                    '</div>' +
                    '</div>' +
                    (a.notes ? '<div style="font-size:0.5rem;color:var(--dim);margin-top:2px;">' + _escapeHtml(a.notes) + '</div>' : '') +
                    '</div>';
            }
        }

        html += '</div>';
        el.innerHTML = html;

        if (onSelect) {
            el.addEventListener('click', function(e) {
                var item = e.target.closest('.assignment-item');
                if (!item || !el.contains(item)) return;
                if (e.target.closest('button')) return;
                var id = item.dataset.assignId;
                var found = null;
                for (var k = 0; k < items.length; k++) {
                    if (items[k] && items[k].id === id) { found = items[k]; break; }
                }
                if (found) onSelect(found);
            });
        }

        el.addEventListener('click', function(e) {
            var endBtn = e.target.closest('.assign-end-btn');
            if (endBtn && el.contains(endBtn)) {
                e.stopPropagation();
                if (typeof window.openRemoveAssignmentModal === 'function' && departmentId) {
                    window.openRemoveAssignmentModal(departmentId, endBtn.dataset.assignId);
                }
            }
        });
    }

    // ---- Summary cards -------------------------------------------------------

    function renderPositionSummaryCard(container, vm) {
        var el = _resolveContainer(container);
        if (!el) return;
        if (!vm) {
            el.innerHTML = '<div style="color:var(--dim);text-align:center;padding:20px;font-size:0.6rem;">No position data</div>';
            return;
        }
        var personIcon = _iconSpan('PERSON');
        var html =
            '<div style="background:var(--bg2);border-radius:8px;padding:12px;border-left:3px solid ' + (vm.hasRoleRequirement ? 'var(--accent)' : 'var(--border)') + ';">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">' +
            '<div>' +
            '<div style="font-size:0.9rem;font-weight:bold;">' + personIcon + ' ' + _escapeHtml(vm.name) + '</div>' +
            '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">' +
            'Priority: ' + vm.priority +
            (vm.parentLabel ? ' · Parent: ' + _escapeHtml(vm.parentLabel) : '') +
            '</div>' +
            '</div>' +
            '<div style="text-align:right;font-size:0.55rem;color:var(--accent);">' +
            '<div>Required Role: ' + _escapeHtml(vm.requiredRoleLabel || 'None') + '</div>' +
            (vm.minSkillLevel != null && vm.minSkillLevel > 0 ? '<div>Min Skill: ' + vm.minSkillLevel + '</div>' : '') +
            (vm.genderRestriction && vm.genderRestriction !== 'either' ? '<div>Gender: ' + _escapeHtml(vm.genderLabel) + '</div>' : '') +
            '</div>' +
            '</div>' +
            (vm.description ? '<div style="font-size:0.6rem;color:var(--dim);margin-top:8px;">' + _escapeHtml(vm.description) + '</div>' : '') +
            '</div>';
        el.innerHTML = html;
    }

    function renderDepartmentSummaryCard(container, vm) {
        var el = _resolveContainer(container);
        if (!el) return;
        if (!vm) {
            el.innerHTML = '<div style="color:var(--dim);text-align:center;padding:20px;font-size:0.6rem;">No department data</div>';
            return;
        }
        var locationIcon = _iconSpan('LOCATION');
        var personIcon = _iconSpan('PERSON');
        var html =
            '<div style="background:var(--bg2);border-radius:8px;padding:12px;border-left:3px solid var(--accent);">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">' +
            '<div>' +
            '<div style="font-size:0.9rem;font-weight:bold;">' + _escapeHtml(vm.name) + '</div>' +
            '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">' +
            locationIcon + ' ' + _escapeHtml(vm.locationLabel) +
            (vm.parentLabel ? ' · Parent: ' + _escapeHtml(vm.parentLabel) : '') +
            '</div>' +
            '</div>' +
            '<div style="text-align:right;font-size:0.55rem;color:var(--accent);">' +
            '<div>' + personIcon + ' ' + vm.positionCount + ' positions</div>' +
            '<div>Role positions: ' + vm.rolePositionCount + '</div>' +
            '<div>Active: ' + vm.activeAssignmentCount + ' / ' + vm.assignmentCount + '</div>' +
            '</div>' +
            '</div>' +
            (vm.description ? '<div style="font-size:0.6rem;color:var(--dim);margin-top:8px;">' + _escapeHtml(vm.description) + '</div>' : '') +
            '</div>';
        el.innerHTML = html;
    }

    function renderAssignmentSummaryCard(container, vm) {
        var el = _resolveContainer(container);
        if (!el) return;
        if (!vm) {
            el.innerHTML = '<div style="color:var(--dim);text-align:center;padding:20px;font-size:0.6rem;">No assignment data</div>';
            return;
        }
        var personIcon = _iconSpan('PERSON');
        var html =
            '<div style="background:var(--bg2);border-radius:8px;padding:12px;border-left:3px solid ' + (vm.isActive ? 'var(--success)' : 'var(--dim)') + ';">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">' +
            '<div>' +
            '<div style="font-size:0.9rem;font-weight:bold;">' + personIcon + ' ' + _escapeHtml(vm.characterName) + '</div>' +
            '<div style="font-size:0.6rem;color:var(--dim);margin-top:4px;">' +
            'Title: ' + _escapeHtml(vm.title) +
            (vm.roleLabel ? ' · Role: ' + _escapeHtml(vm.roleLabel) : '') +
            (vm.skillLevel != null ? ' · Skill: ' + vm.skillLevel : '') +
            '</div>' +
            '</div>' +
            '<div style="text-align:right;font-size:0.55rem;color:' + (vm.isActive ? 'var(--success)' : 'var(--dim)') + ';">' +
            '<div>' + vm.startYear + ' - ' + vm.endLabel + '</div>' +
            '<div>' + (vm.isActive ? 'Active' : 'Ended') + '</div>' +
            (vm.endReason ? '<div style="font-size:0.5rem;">' + _escapeHtml(vm.endReason) + '</div>' : '') +
            '</div>' +
            '</div>' +
            (vm.notes ? '<div style="font-size:0.6rem;color:var(--dim);margin-top:8px;">' + _escapeHtml(vm.notes) + '</div>' : '') +
            '</div>';
        el.innerHTML = html;
    }

    // ---- Candidate list (bulk assign) ----------------------------------------

    function renderCandidateList(container, candidateVms) {
        var el = _resolveContainer(container);
        if (!el) return;
        var items = Array.isArray(candidateVms) ? candidateVms : [];

        var personIcon = _iconSpan('PERSON');

        if (items.length === 0) {
            el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--dim);">No qualified candidates found</div>';
            return;
        }

        var html = '';
        for (var i = 0; i < items.length; i++) {
            var c = items[i];
            html +=
                '<label class="candidate-item" data-char-id="' + _attr(c.characterId) + '" style="' +
                'display:flex;align-items:center;gap:8px;' +
                'background:var(--bg3);border:1px solid var(--border);border-radius:4px;' +
                'padding:6px 10px;margin-bottom:4px;cursor:pointer;transition:all 0.1s;">' +
                '<input type="checkbox" class="candidate-checkbox" value="' + _attr(c.characterId) + '" style="cursor:pointer;">' +
                '<div style="flex:1;min-width:0;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">' +
                '<span style="font-size:0.7rem;">' + personIcon + ' ' + _escapeHtml(c.characterName) + '</span>' +
                '<div style="font-size:0.55rem;color:var(--dim);display:flex;gap:8px;">' +
                '<span>Age: ' + c.age + '</span>' +
                '<span>Exp: ' + c.experience + 'y</span>' +
                (c.rankLabel ? '<span style="color:var(--accent);">' + _escapeHtml(c.rankLabel) + '</span>' : '') +
                '</div>' +
                '</div>' +
                '</div>' +
                '</label>';
        }
        el.innerHTML = html;
    }

    // ---- Export --------------------------------------------------------------

    window.GovernmentUI = {
        renderDepartmentList: renderDepartmentList,
        renderPositionList: renderPositionList,
        renderAssignmentList: renderAssignmentList,
        renderPositionSummaryCard: renderPositionSummaryCard,
        renderDepartmentSummaryCard: renderDepartmentSummaryCard,
        renderAssignmentSummaryCard: renderAssignmentSummaryCard,
        renderCandidateList: renderCandidateList
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.GovernmentUI;
    }
})();
