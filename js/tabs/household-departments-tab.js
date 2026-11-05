// js/households/household-departments-tab.js
/**
 * =============================================================================
 * HOUSEHOLD DEPARTMENTS TAB
 * js/households/household-departments-tab.js
 * =============================================================================
 *
 * LOCATION: js/households/household-departments-tab.js
 *
 * WHAT THIS TAB SHOWS
 * -------------------
 * Departments, positions, and staff assignments for one household:
 *
 *   - header stat strip (departments / staff / positions / assignments)
 *   - one card per department: name, head, staff count, position count,
 *     active assignment count; a staff sub-list; a positions sub-list
 *     with per-position assign/edit/delete; the "Unassigned Positions"
 *     section on the first card for any positions whose departmentId
 *     is null
 *   - header actions: Create Department, Create Position
 *   - per-department actions: Add Staff, Add Position, Edit, Delete
 *   - per-staff-row actions: Edit, Remove from department
 *   - per-position-row actions: Assign, Edit, Delete
 *
 * READS
 * -----
 *   HouseholdQueries.getHousehold             — flat projection
 *   HouseholdQueries.getHouseholdDepartments  — department list
 *   HouseholdQueries.getHouseholdMembers      — staff lookup + member
 *   HouseholdQueries.getHouseholdPositions    — positions
 *   HouseholdQueries.getAssignmentsForHousehold
 *
 * WRITES
 * ------
 *   Every mutation is an inline modal routing through HouseholdCommands:
 *     Create Department  → addDepartment + persist
 *     Edit Department    → updateDepartment + persist
 *     Delete Department  → removeDepartment + persist
 *     Create Position    → createPosition + persist
 *     Edit Position      → updatePosition + persist
 *     Delete Position    → deletePosition + persist
 *     Edit Staff         → updateMember + persist
 *     Remove Staff       → updateMember({departmentId: null}) + persist
 *     Add Staff          → addMember or updateMember + persist
 *     Assign Position    → delegates to openAssignStaffToHouseholdPositionModal
 *
 *   Each inline modal persists ONCE. The tab never calls persist().
 *
 * RENDERER CONTRACT (from HouseholdManagerBootstrap)
 *   fn(container, context)
 *   container  HTMLElement  — already emptied by TabManager
 *   context    { householdId, householdName, householdState }
 *
 * FILTERS
 * -------
 *   None. Departments are a small, structured list; search / sort
 *   would be noise. The whole tab is one scroll.
 *
 * DEPENDENCIES (all resolved via HouseholdTabRuntime)
 *   REQUIRED at render:
 *     - HouseholdQueries
 *     - formatting.js (escapeHtml — strict via TabRuntime.esc)
 *     - time.js (getCurrentYear — via TabRuntime.requireCurrentYear)
 *     - TabManager (for registration; warn if absent)
 *   OPTIONAL at render:
 *     - HouseholdCommands (each mutation reports if it is absent)
 *     - modals-char-selector.js (Add Staff)
 *     - modals-household-staff.js
 *         openAssignStaffToHouseholdPositionModal (Assign Position)
 *
 * TIME CONTRACT: uses TabRuntime.requireCurrentYear(). No fallback.
 * ICON POLICY: icons via TabRuntime.icon().
 * THEME CONTRACT: no hardcoded hex/rgba. Classes from household-tabs.css.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   v2 (this revision):
 *     - Rewritten to the Tab/Manager Development Playbook, using
 *       Education Manager as the reference.
 *     - All shared helpers come from HouseholdTabRuntime.
 *     - Reads go through HouseholdQueries (via TabRuntime sugar).
 *       The prior revision called non-existent HouseholdState methods
 *       (HS.getHousehold, HS.getHouseholdMembersWithCharacters,
 *       HS.getHouseholdPositions, HS.getAssignmentsForHousehold,
 *       HS.getHouseholdPosition) and threw at render.
 *     - THE CLONE-BASED LISTENER RESET IS GONE. The prior revision
 *       reattached handlers by cloneNode(true)-ing the container on
 *       every render. That pattern had three failure modes:
 *         (1) cloneNode(true) drops scroll position and focus, so a
 *             re-render after a mutation snapped the user back to
 *             the top.
 *         (2) The `_handlersAttached` marker lived on the container
 *             element. The clone-replace installed the listener on
 *             the CLONE, but the caller still held the ORIGINAL
 *             container reference. On the next mutation re-render,
 *             the caller targeted the detached original; the
 *             listener lived on the clone.
 *         (3) On the third mutation re-render, the original
 *             container's parentNode was null, so replaceChild threw
 *             NotFoundError.
 *       This revision uses TabRuntime.attachDelegated, which attaches
 *       ONE click listener to the container on first render and
 *       reuses it across every re-render. Handlers dispatch on
 *       data-action / data-dept-id / data-pos-id / data-char-id
 *       attributes, all of which survive innerHTML replacement.
 *     - Registration via TabRuntime.register('positions', render).
 *       The prior revision called the non-existent
 *       window.registerTabRenderer three-arg form; the tab never
 *       rendered.
 *     - Zero document.* calls. Zero hardcoded colors. Zero
 *       setTimeout. Zero 1250 fallback.
 * =============================================================================
 */

(function () {
    'use strict';

    var T = window.HouseholdTabRuntime;
    if (!T) {
        throw new Error(
            'household-departments-tab: HouseholdTabRuntime must load first. ' +
            'Load js/households/household-tab-runtime.js before this tab.'
        );
    }

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var TAB_ID = 'positions';   // The tab id in HouseholdManager.html
    var SCOPE  = T.SCOPE;       // 'households'

    var _renderGuard = { busy: false };

    // =========================================================================
    // 2. DATA
    // =========================================================================
    //
    // One collect. Every downstream renderer reads from this shape.
    // Per-field try/catch so a missing optional collection degrades
    // that section to an empty list rather than failing the whole tab.

    function _collect(householdId) {
        var summary = T.getHousehold(householdId);
        if (!summary) return { error: 'Household not found.' };

        var year;
        try { year = T.requireCurrentYear(); }
        catch (e) {
            return {
                error: 'Current year unavailable: ' +
                    (e && e.message ? e.message : 'time.js missing')
            };
        }

        var departments;
        var members;
        var positions;
        var assignments;
        try {
            departments = T.getHouseholdDepartments(householdId) || [];
            members = T.getHouseholdMembers(householdId) || [];
            positions = T.getHouseholdPositions({ householdId: householdId }) || [];
            assignments = T.getAssignmentsForHousehold(householdId, true) || [];
        } catch (e) {
            return {
                error: 'Could not read departments: ' +
                    (e && e.message ? e.message : 'unknown error')
            };
        }

        // Group: staff by department, positions by department,
        // assignments by position. These groupings are used many times
        // in the renderer; pre-computing them once keeps the render
        // helpers simple and O(1) per lookup.

        var staffByDept = {};
        for (var i = 0; i < members.length; i++) {
            var m = members[i];
            if (m.type === 'staff' && m.departmentId) {
                (staffByDept[m.departmentId] = staffByDept[m.departmentId] || []).push(m);
            }
        }

        var positionsByDept = {};
        for (var p = 0; p < positions.length; p++) {
            var pos = positions[p];
            var deptKey = pos.departmentId || 'unassigned';
            (positionsByDept[deptKey] = positionsByDept[deptKey] || []).push(pos);
        }

        var assignmentsByPos = {};
        for (var a = 0; a < assignments.length; a++) {
            var asg = assignments[a];
            if (!asg.positionId) continue;
            (assignmentsByPos[asg.positionId] = assignmentsByPos[asg.positionId] || []).push(asg);
        }

        return {
            household: summary,
            departments: departments,
            members: members,
            positions: positions,
            assignments: assignments,
            staffByDept: staffByDept,
            positionsByDept: positionsByDept,
            assignmentsByPos: assignmentsByPos,
            year: year
        };
    }

    function _activeCount(assignmentsForPosition) {
        if (!Array.isArray(assignmentsForPosition)) return 0;
        var n = 0;
        for (var i = 0; i < assignmentsForPosition.length; i++) {
            if (!assignmentsForPosition[i].endYear) n++;
        }
        return n;
    }

    function _assignmentNames(assignmentsForPosition) {
        if (!Array.isArray(assignmentsForPosition)) return '';
        var names = [];
        for (var i = 0; i < assignmentsForPosition.length; i++) {
            var a = assignmentsForPosition[i];
            if (a.endYear) continue;
            var ch = T.character(a.characterId);
            names.push(ch ? (ch.name || 'Unknown') : 'Unknown');
        }
        return names.join(', ');
    }

    // =========================================================================
    // 3. RENDER
    // =========================================================================

    function _renderBody(d) {
        return '' +
            '<div class="hh-tab">' +
                _renderHeader() +
                _renderStats(d) +
                (d.departments.length === 0
                    ? T.emptyState('No departments created yet.')
                    : '<div class="hh-dept-list">' +
                        d.departments.map(function (dept, index) {
                            return _renderDepartmentCard(dept, d, index);
                        }).join('') +
                      '</div>') +
            '</div>';
    }

    function _renderHeader() {
        return '' +
            '<div class="hh-tab-header">' +
                '<h3 class="hh-tab-title">' +
                    T.iconSpan('CIRCLE_DOT', 'Departments') + ' Departments & Staff' +
                '</h3>' +
                '<div class="hh-tab-actions">' +
                    '<button type="button" class="hh-btn hh-btn-primary" ' +
                        'data-action="create-department">' +
                        T.iconSpan('PLUS', 'Create') + ' Create Department' +
                    '</button>' +
                    '<button type="button" class="hh-btn" ' +
                        'data-action="create-position">' +
                        '+ Create Position' +
                    '</button>' +
                '</div>' +
            '</div>';
    }

    function _renderStats(d) {
        var totalStaff = 0;
        var totalPositions = d.positions.length;
        var totalAssignments = 0;

        for (var i = 0; i < d.departments.length; i++) {
            var deptId = d.departments[i].id;
            totalStaff += (d.staffByDept[deptId] || []).length;
            var deptPositions = d.positionsByDept[deptId] || [];
            for (var j = 0; j < deptPositions.length; j++) {
                totalAssignments += _activeCount(d.assignmentsByPos[deptPositions[j].id] || []);
            }
        }

        return '' +
            '<div class="hh-econ-grid hh-econ-grid-4">' +
                T.statCell('Departments', d.departments.length) +
                T.statCell('Staff', totalStaff) +
                T.statCell('Positions', totalPositions) +
                T.statCell('Assignments', totalAssignments) +
            '</div>';
    }

    function _renderDepartmentCard(dept, d, index) {
        var staff = d.staffByDept[dept.id] || [];
        var positions = d.positionsByDept[dept.id] || [];

        var totalAssignments = 0;
        for (var i = 0; i < positions.length; i++) {
            totalAssignments += _activeCount(d.assignmentsByPos[positions[i].id] || []);
        }

        var headChar = dept.headId ? T.character(dept.headId) : null;
        var headName = headChar ? T.characterName(headChar) : 'None';

        var deptId = T.esc(dept.id);

        return '' +
            '<div class="hh-dept-card" data-dept-id="' + deptId + '">' +
                '<div class="hh-dept-header">' +
                    '<div class="hh-dept-title-group">' +
                        '<span class="hh-dept-title">' +
                            T.iconSpan('CIRCLE_DOT', 'Department') + ' ' +
                            T.esc(dept.name) +
                        '</span>' +
                        '<span class="hh-dept-stat">' + staff.length + ' staff</span>' +
                        '<span class="hh-dept-stat">' + positions.length + ' positions</span>' +
                        '<span class="hh-dept-stat">' + totalAssignments + ' assigned</span>' +
                        (dept.headId
                            ? '<span class="hh-dept-head">Head: ' + T.esc(headName) + '</span>'
                            : '') +
                    '</div>' +
                    '<div class="hh-dept-actions">' +
                        '<button type="button" class="hh-btn hh-btn-subtle" ' +
                            'data-action="add-staff" data-dept-id="' + deptId + '">' +
                            T.iconSpan('PLUS', 'Add Staff') + ' Add Staff' +
                        '</button>' +
                        '<button type="button" class="hh-btn hh-btn-subtle" ' +
                            'data-action="add-position" data-dept-id="' + deptId + '">' +
                            '+ Position' +
                        '</button>' +
                        '<button type="button" class="hh-icon-btn" ' +
                            'data-action="edit-department" data-dept-id="' + deptId + '" ' +
                            'title="Edit department">' + T.icon('EDIT') + '</button>' +
                        '<button type="button" class="hh-icon-btn hh-icon-btn-danger" ' +
                            'data-action="delete-department" data-dept-id="' + deptId + '" ' +
                            'title="Delete department">' + T.icon('X_HEAVY') + '</button>' +
                    '</div>' +
                '</div>' +
                _renderStaffList(staff, dept.id) +
                _renderPositionList(positions, d, dept.id) +
                (index === 0 ? _renderUnassignedPositions(d) : '') +
            '</div>';
    }

    function _renderStaffList(staff, deptId) {
        if (!staff || staff.length === 0) {
            return '<div class="hh-dept-staff-empty">No staff assigned.</div>';
        }
        var rows = staff.map(function (s) {
            var ch = s.character;
            var name = ch ? T.characterName(ch) : 'Unknown';
            var isDeceased = ch ? ch.isDeceased === true : false;
            var charId = ch ? ch.id : '';
            return '' +
                '<div class="hh-dept-staff-row' + (isDeceased ? ' deceased' : '') + '">' +
                    '<div class="hh-dept-staff-info">' +
                        T.iconSpan('PERSON', 'Staff member') + ' ' +
                        T.esc(name) +
                        (s.isHead
                            ? ' <span class="hh-dept-staff-head">(Head)</span>'
                            : '') +
                        (s.role
                            ? ' <span class="hh-dept-staff-role">' +
                                T.esc(s.role) + '</span>'
                            : '') +
                    '</div>' +
                    '<div class="hh-dept-staff-actions">' +
                        '<button type="button" class="hh-icon-btn" ' +
                            'data-action="edit-staff" ' +
                            'data-char-id="' + T.esc(charId) + '" ' +
                            'data-dept-id="' + T.esc(deptId) + '" ' +
                            'title="Edit staff member">' + T.icon('EDIT') + '</button>' +
                        '<button type="button" class="hh-icon-btn hh-icon-btn-danger" ' +
                            'data-action="remove-staff" ' +
                            'data-char-id="' + T.esc(charId) + '" ' +
                            'data-dept-id="' + T.esc(deptId) + '" ' +
                            'title="Remove from department">' + T.icon('X_HEAVY') + '</button>' +
                    '</div>' +
                '</div>';
        }).join('');
        return '<div class="hh-dept-staff-list">' + rows + '</div>';
    }

    function _renderPositionList(positions, d, deptId) {
        if (!positions || positions.length === 0) return '';
        var rows = positions.map(function (p) {
            var asgs = d.assignmentsByPos[p.id] || [];
            var active = _activeCount(asgs);
            var names = _assignmentNames(asgs);
            var posId = T.esc(p.id);

            return '' +
                '<div class="hh-dept-pos-row" data-pos-id="' + posId + '">' +
                    '<div class="hh-dept-pos-info">' +
                        '<span class="hh-dept-pos-name">' + T.esc(p.name) + '</span>' +
                        (p.requiredRoleId
                            ? '<span class="hh-dept-pos-role">Role: ' +
                                T.esc(p.requiredRoleId) + '</span>'
                            : '') +
                        (names
                            ? '<span class="hh-dept-pos-assigned">→ ' +
                                T.esc(names) + '</span>'
                            : '') +
                        (active === 0
                            ? '<span class="hh-dept-pos-unassigned">no active assignment</span>'
                            : '') +
                    '</div>' +
                    '<div class="hh-dept-pos-actions">' +
                        '<button type="button" class="hh-icon-btn hh-icon-btn-success" ' +
                            'data-action="assign-position" ' +
                            'data-pos-id="' + posId + '" ' +
                            'title="Assign staff">' + T.icon('PLUS') + '</button>' +
                        '<button type="button" class="hh-icon-btn" ' +
                            'data-action="edit-position" ' +
                            'data-pos-id="' + posId + '" ' +
                            'title="Edit position">' + T.icon('EDIT') + '</button>' +
                        '<button type="button" class="hh-icon-btn hh-icon-btn-danger" ' +
                            'data-action="delete-position" ' +
                            'data-pos-id="' + posId + '" ' +
                            'title="Delete position">' + T.icon('X_HEAVY') + '</button>' +
                    '</div>' +
                '</div>';
        }).join('');
        return '<div class="hh-dept-pos-list">' + rows + '</div>';
    }

    function _renderUnassignedPositions(d) {
        var unassigned = d.positionsByDept['unassigned'] || [];
        if (unassigned.length === 0) return '';

        var rows = unassigned.map(function (p) {
            var asgs = d.assignmentsByPos[p.id] || [];
            var names = _assignmentNames(asgs);
            var posId = T.esc(p.id);

            return '' +
                '<div class="hh-dept-pos-row hh-dept-pos-row-unassigned" ' +
                    'data-pos-id="' + posId + '">' +
                    '<div class="hh-dept-pos-info">' +
                        '<span class="hh-dept-pos-name">' + T.esc(p.name) + '</span>' +
                        (names
                            ? '<span class="hh-dept-pos-assigned">→ ' +
                                T.esc(names) + '</span>'
                            : '') +
                    '</div>' +
                    '<div class="hh-dept-pos-actions">' +
                        '<button type="button" class="hh-icon-btn hh-icon-btn-success" ' +
                            'data-action="assign-position" ' +
                            'data-pos-id="' + posId + '" ' +
                            'title="Assign staff">' + T.icon('PLUS') + '</button>' +
                        '<button type="button" class="hh-icon-btn" ' +
                            'data-action="edit-position" ' +
                            'data-pos-id="' + posId + '" ' +
                            'title="Edit position">' + T.icon('EDIT') + '</button>' +
                        '<button type="button" class="hh-icon-btn hh-icon-btn-danger" ' +
                            'data-action="delete-position" ' +
                            'data-pos-id="' + posId + '" ' +
                            'title="Delete position">' + T.icon('X_HEAVY') + '</button>' +
                    '</div>' +
                '</div>';
        }).join('');

        return '' +
            '<div class="hh-dept-unassigned">' +
                '<div class="hh-dept-unassigned-title">Unassigned Positions</div>' +
                rows +
            '</div>';
    }

    // =========================================================================
    // 4. ENTRY POINT
    // =========================================================================

    function renderHouseholdDepartmentsTab(container, context) {
        if (!container) return;

        T.runExclusive(_renderGuard, function () {
            if (!context || !context.householdId) {
                container.innerHTML = T.emptyState('Select a household from the sidebar.');
                return;
            }

            if (!T.queries()) {
                container.innerHTML = T.failureState(
                    'HouseholdQueries is not loaded. ' +
                    'Load js/households/household-queries.js.'
                );
                return;
            }

            var data;
            try {
                data = _collect(context.householdId);
            } catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('[HouseholdDepartmentsTab] collect failed', e);
                }
                container.innerHTML = T.failureState(
                    'Could not load departments: ' +
                    (e && e.message ? e.message : 'unknown error')
                );
                return;
            }

            if (data.error) {
                container.innerHTML = T.failureState(data.error);
                return;
            }

            container.innerHTML = _renderBody(data);
            _wire(container, context.householdId);
        }, { onBusy: function () { /* skip re-entrant render */ } });
    }

    // =========================================================================
    // 5. WIRING
    // =========================================================================
    //
    // THE CONTAINER-LEVEL DELEGATION THAT CLOSES THE CLONE BUG.
    //
    // One click listener on the container. Attached once (via the
    // runtime's __hhTabDelegatedAttached marker). Every re-render
    // replaces the container's children via container.innerHTML = html,
    // but the listener lives on the container itself, so it survives.
    //
    // Every button that participates carries a data-action="..." and
    // its required IDs in data-* attributes. The handler map keys on
    // '[data-action="..."]'. The runtime's attachDelegated checks
    // container.contains(button) before invoking, so a detached
    // button (from an older render) can never fire.
    //
    // The three failure modes of the prior cloneNode approach are all
    // impossible:
    //   (1) No clone, so no scroll/focus loss.
    //   (2) The listener lives on the container, which the caller holds.
    //   (3) No replaceChild on the container itself, so no NotFoundError.

    function _wire(container, householdId) {
        T.attachDelegated(container, {
            '[data-action="create-department"]': function () {
                _openCreateDepartment(householdId);
            },
            '[data-action="create-position"]': function () {
                _openCreatePosition(householdId, null);
            },
            '[data-action="add-staff"]': function (e, btn) {
                _openAddStaffToDepartment(householdId, btn.getAttribute('data-dept-id'));
            },
            '[data-action="add-position"]': function (e, btn) {
                _openCreatePosition(householdId, btn.getAttribute('data-dept-id'));
            },
            '[data-action="edit-department"]': function (e, btn) {
                _openEditDepartment(householdId, btn.getAttribute('data-dept-id'));
            },
            '[data-action="delete-department"]': function (e, btn) {
                _confirmDeleteDepartment(householdId, btn.getAttribute('data-dept-id'));
            },
            '[data-action="edit-staff"]': function (e, btn) {
                _openEditStaff(householdId, btn.getAttribute('data-char-id'));
            },
            '[data-action="remove-staff"]': function (e, btn) {
                _confirmRemoveStaff(householdId, btn.getAttribute('data-char-id'));
            },
            '[data-action="assign-position"]': function (e, btn) {
                _openAssignPosition(householdId, btn.getAttribute('data-pos-id'));
            },
            '[data-action="edit-position"]': function (e, btn) {
                _openEditPosition(householdId, btn.getAttribute('data-pos-id'));
            },
            '[data-action="delete-position"]': function (e, btn) {
                _confirmDeletePosition(householdId, btn.getAttribute('data-pos-id'));
            }
        });
    }

    // =========================================================================
    // 6. MODALS — DEPARTMENT
    // =========================================================================

    function _rerender(householdId) {
        T.requestRender(TAB_ID);
    }

    function _openCreateDepartment(householdId) {
        var content =
            '<div class="hh-modal-form">' +
                '<div class="hh-form-group">' +
                    '<label>Department Name *</label>' +
                    '<input type="text" data-field="name" ' +
                        'placeholder="e.g., Household Staff, Kitchen, Gardens">' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Department Head (optional)</label>' +
                    '<div class="hh-inline-actions">' +
                        '<input type="text" data-field="headDisplay" readonly ' +
                            'placeholder="Select head…">' +
                        '<input type="hidden" data-field="headId">' +
                        '<button type="button" data-action="select-head" class="hh-btn">Select</button>' +
                        '<button type="button" data-action="clear-head" class="hh-btn">Clear</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        var modal = T.openModal({
            title: 'Create Department',
            content: content,
            confirmText: 'Create Department',
            cancelText: 'Cancel',
            onOpen: function () {
                var root = modal && modal.element;
                if (!root) return;
                var display = root.querySelector('[data-field="headDisplay"]');
                var hidden = root.querySelector('[data-field="headId"]');
                var selBtn = root.querySelector('[data-action="select-head"]');
                var clrBtn = root.querySelector('[data-action="clear-head"]');

                if (selBtn) selBtn.addEventListener('click', function (e) {
                    e.preventDefault();
                    if (typeof window.openCharacterSelector !== 'function') {
                        T.toastWarning('Character selector not loaded.');
                        return;
                    }
                    window.openCharacterSelector({
                        title: 'Select Department Head',
                        filters: { showDeceased: false },
                        onSelect: function (ch) {
                            if (!ch) return;
                            display.value = T.characterName(ch);
                            hidden.value = ch.id;
                        }
                    });
                });
                if (clrBtn) clrBtn.addEventListener('click', function (e) {
                    e.preventDefault();
                    display.value = '';
                    hidden.value = '';
                });
            },
            onConfirm: function () {
                var root = modal && modal.element;
                if (!root) { T.toastError('Modal root unavailable.'); return false; }

                var name = (root.querySelector('[data-field="name"]').value || '').trim();
                if (!name) { T.toastError('Department name is required.'); return false; }
                var headId = (root.querySelector('[data-field="headId"]').value || '').trim() || null;

                var HC = T.commands();
                if (!HC) { T.toastError('HouseholdCommands is not loaded.'); return false; }

                var result = HC.addDepartment(householdId, name, { headId: headId });
                if (!result || result.success !== true) {
                    T.toastError('Failed to create: ' + (result ? result.reason : 'unknown'));
                    return false;
                }

                var persisted = HC.persist();
                if (persisted && persisted.success === false) {
                    T.toastWarning('Created in memory; storage write failed.');
                } else {
                    T.toastSuccess('Department "' + name + '" created.');
                }
                T.closeTopModal();
                _rerender(householdId);
                if (typeof window.refreshHouseholdList === 'function') {
                    window.refreshHouseholdList();
                }
                return true;
            }
        });
    }

    function _openEditDepartment(householdId, deptId) {
        if (!deptId) return;
        var depts = T.getHouseholdDepartments(householdId) || [];
        var dept = null;
        for (var i = 0; i < depts.length; i++) {
            if (depts[i].id === deptId) { dept = depts[i]; break; }
        }
        if (!dept) { T.toastError('Department not found.'); return; }

        var headChar = dept.headId ? T.character(dept.headId) : null;
        var headName = headChar ? T.characterName(headChar) : '';

        var content =
            '<div class="hh-modal-form">' +
                '<div class="hh-form-group">' +
                    '<label>Department Name *</label>' +
                    '<input type="text" data-field="name" value="' + T.esc(dept.name) + '">' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Department Head</label>' +
                    '<div class="hh-inline-actions">' +
                        '<input type="text" data-field="headDisplay" readonly ' +
                            'value="' + T.esc(headName) + '" ' +
                            'placeholder="Select head…">' +
                        '<input type="hidden" data-field="headId" ' +
                            'value="' + T.esc(dept.headId || '') + '">' +
                        '<button type="button" data-action="select-head" class="hh-btn">Select</button>' +
                        '<button type="button" data-action="clear-head" class="hh-btn">Clear</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        var modal = T.openModal({
            title: 'Edit Department: ' + dept.name,
            content: content,
            confirmText: 'Save Changes',
            cancelText: 'Cancel',
            onOpen: function () {
                var root = modal && modal.element;
                if (!root) return;
                var display = root.querySelector('[data-field="headDisplay"]');
                var hidden = root.querySelector('[data-field="headId"]');
                var selBtn = root.querySelector('[data-action="select-head"]');
                var clrBtn = root.querySelector('[data-action="clear-head"]');

                if (selBtn) selBtn.addEventListener('click', function (e) {
                    e.preventDefault();
                    if (typeof window.openCharacterSelector !== 'function') {
                        T.toastWarning('Character selector not loaded.');
                        return;
                    }
                    window.openCharacterSelector({
                        title: 'Select Department Head',
                        filters: { showDeceased: false },
                        onSelect: function (ch) {
                            if (!ch) return;
                            display.value = T.characterName(ch);
                            hidden.value = ch.id;
                        }
                    });
                });
                if (clrBtn) clrBtn.addEventListener('click', function (e) {
                    e.preventDefault();
                    display.value = '';
                    hidden.value = '';
                });
            },
            onConfirm: function () {
                var root = modal && modal.element;
                if (!root) { T.toastError('Modal root unavailable.'); return false; }

                var name = (root.querySelector('[data-field="name"]').value || '').trim();
                if (!name) { T.toastError('Department name is required.'); return false; }
                var headId = (root.querySelector('[data-field="headId"]').value || '').trim() || null;

                var HC = T.commands();
                if (!HC) { T.toastError('HouseholdCommands is not loaded.'); return false; }

                var result = HC.updateDepartment(householdId, deptId, {
                    name: name, headId: headId
                });
                if (!result || result.success !== true) {
                    T.toastError('Failed to update: ' + (result ? result.reason : 'unknown'));
                    return false;
                }

                var persisted = HC.persist();
                if (persisted && persisted.success === false) {
                    T.toastWarning('Updated in memory; storage write failed.');
                } else {
                    T.toastSuccess('Department updated.');
                }
                T.closeTopModal();
                _rerender(householdId);
                if (typeof window.refreshHouseholdList === 'function') {
                    window.refreshHouseholdList();
                }
                return true;
            }
        });
    }

    function _confirmDeleteDepartment(householdId, deptId) {
        if (!deptId) return;
        var depts = T.getHouseholdDepartments(householdId) || [];
        var dept = null;
        for (var i = 0; i < depts.length; i++) {
            if (depts[i].id === deptId) { dept = depts[i]; break; }
        }
        if (!dept) { T.toastError('Department not found.'); return; }

        T.confirmDialog(
            'Delete department "' + dept.name + '"?\n\n' +
            'Staff will be unassigned from this department. ' +
            'Positions in this department will become unassigned.',
            'Delete Department',
            function () {
                var HC = T.commands();
                if (!HC) { T.toastError('HouseholdCommands is not loaded.'); return; }

                // transferMembers: true → members assigned to this
                // department are unassigned (departmentId set to null)
                // but NOT removed from the household.
                var result = HC.removeDepartment(householdId, deptId, {
                    transferMembers: true
                });
                if (!result || result.success !== true) {
                    T.toastError('Failed to delete: ' + (result ? result.reason : 'unknown'));
                    return;
                }

                var persisted = HC.persist();
                if (persisted && persisted.success === false) {
                    T.toastWarning('Deleted in memory; storage write failed.');
                } else {
                    T.toastInfo('Department "' + dept.name + '" deleted.');
                }
                _rerender(householdId);
                if (typeof window.refreshHouseholdList === 'function') {
                    window.refreshHouseholdList();
                }
            }
        );
    }

    // =========================================================================
    // 7. MODALS — STAFF
    // =========================================================================

    function _openAddStaffToDepartment(householdId, deptId) {
        if (!deptId) return;
        var summary = T.getHousehold(householdId);
        if (!summary) { T.toastError('Household not found.'); return; }

        var dept = null;
        var depts = T.getHouseholdDepartments(householdId) || [];
        for (var i = 0; i < depts.length; i++) {
            if (depts[i].id === deptId) { dept = depts[i]; break; }
        }
        if (!dept) { T.toastError('Department not found.'); return; }

        if (typeof window.openCharacterSelector !== 'function') {
            T.toastError(
                'Add Staff unavailable: openCharacterSelector is not loaded. ' +
                'Load js/selectors/modals-char-selector.js.'
            );
            return;
        }

        window.openCharacterSelector({
            title: 'Add Staff to ' + dept.name,
            filters: { showDeceased: false },
            onSelect: function (ch) {
                if (!ch) return;
                _presentAddStaffForm(householdId, deptId, ch);
            }
        });
    }

    function _presentAddStaffForm(householdId, deptId, ch) {
        var members = T.getHouseholdMembers(householdId) || [];
        var isMember = false;
        for (var i = 0; i < members.length; i++) {
            if (members[i].characterId === ch.id) { isMember = true; break; }
        }

        var year;
        try { year = T.requireCurrentYear(); }
        catch (e) { T.toastError('Current year unavailable: ' + (e && e.message)); return; }

        // Existing member → just update the department. New member →
        // add as staff.
        if (isMember) {
            var HC0 = T.commands();
            if (!HC0) { T.toastError('HouseholdCommands is not loaded.'); return; }

            var result0 = HC0.updateMember(householdId, ch.id, {
                departmentId: deptId,
                type: 'staff'
            });
            if (!result0 || result0.success !== true) {
                T.toastError('Failed to assign: ' + (result0 ? result0.reason : 'unknown'));
                return;
            }
            var p0 = HC0.persist();
            if (p0 && p0.success === false) {
                T.toastWarning('Assigned in memory; storage write failed.');
            } else {
                T.toastSuccess(T.characterName(ch) + ' assigned to department.');
            }
            _rerender(householdId);
            if (typeof window.refreshHouseholdList === 'function') {
                window.refreshHouseholdList();
            }
            return;
        }

        var content =
            '<div class="hh-modal-form">' +
                '<div class="hh-modal-current">' +
                    'Adding <strong>' + T.esc(T.characterName(ch)) + '</strong> as staff.' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Role</label>' +
                    '<input type="text" data-field="role" value="Staff">' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Joined Year</label>' +
                    '<input type="number" data-field="year" value="' + year + '" min="1">' +
                '</div>' +
            '</div>';

        var modal = T.openModal({
            title: 'Add Staff Member',
            content: content,
            confirmText: 'Add Staff',
            cancelText: 'Cancel',
            onConfirm: function () {
                var root = modal && modal.element;
                if (!root) { T.toastError('Modal root unavailable.'); return false; }

                var role = (root.querySelector('[data-field="role"]').value || '').trim() || 'Staff';
                var y = parseInt(root.querySelector('[data-field="year"]').value, 10);
                if (!isFinite(y) || y < 1) { T.toastError('Invalid year.'); return false; }

                var HC = T.commands();
                if (!HC) { T.toastError('HouseholdCommands is not loaded.'); return false; }

                var result = HC.addMember(householdId, ch.id, 'staff', {
                    role: role,
                    joinedYear: y,
                    departmentId: deptId
                });
                if (!result || result.success !== true) {
                    T.toastError('Failed to add: ' + (result ? result.reason : 'unknown'));
                    return false;
                }

                var persisted = HC.persist();
                if (persisted && persisted.success === false) {
                    T.toastWarning('Added in memory; storage write failed.');
                } else {
                    T.toastSuccess(T.characterName(ch) + ' added as staff.');
                }
                T.closeTopModal();
                _rerender(householdId);
                if (typeof window.refreshHouseholdList === 'function') {
                    window.refreshHouseholdList();
                }
                return true;
            }
        });
    }

    function _openEditStaff(householdId, characterId) {
        if (!characterId) return;
        var members = T.getHouseholdMembers(householdId) || [];
        var m = null;
        for (var i = 0; i < members.length; i++) {
            if (members[i].characterId === characterId) { m = members[i]; break; }
        }
        if (!m) { T.toastError('Member not found.'); return; }

        var departments = T.getHouseholdDepartments(householdId) || [];
        var deptOptions = '<option value="">None</option>' + departments.map(function (d) {
            return '<option value="' + T.esc(d.id) + '"' +
                (d.id === m.departmentId ? ' selected' : '') + '>' +
                T.esc(d.name) + '</option>';
        }).join('');

        var content =
            '<div class="hh-modal-form">' +
                '<div class="hh-modal-current">' +
                    'Editing: <strong>' + T.esc(m.characterName) + '</strong>' +
                    (m.isHead ? ' · Head' : '') +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Role</label>' +
                    '<input type="text" data-field="role" value="' +
                        T.esc(m.role || '') + '">' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Department</label>' +
                    '<select data-field="dept">' + deptOptions + '</select>' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Make Department Head</label>' +
                    '<select data-field="head">' +
                        '<option value="false"' + (m.isHead ? '' : ' selected') + '>No</option>' +
                        '<option value="true"' + (m.isHead ? ' selected' : '') + '>Yes</option>' +
                    '</select>' +
                '</div>' +
            '</div>';

        var modal = T.openModal({
            title: 'Edit Staff Member',
            content: content,
            confirmText: 'Save Changes',
            cancelText: 'Cancel',
            onConfirm: function () {
                var root = modal && modal.element;
                if (!root) { T.toastError('Modal root unavailable.'); return false; }

                var role = (root.querySelector('[data-field="role"]').value || '').trim() || 'Staff';
                var deptId = root.querySelector('[data-field="dept"]').value || null;
                var isHead = root.querySelector('[data-field="head"]').value === 'true';

                var HC = T.commands();
                if (!HC) { T.toastError('HouseholdCommands is not loaded.'); return false; }

                var result = HC.updateMember(householdId, characterId, {
                    role: role,
                    departmentId: deptId,
                    isHead: isHead,
                    type: 'staff'
                });
                if (!result || result.success !== true) {
                    T.toastError('Failed to update: ' + (result ? result.reason : 'unknown'));
                    return false;
                }

                var persisted = HC.persist();
                if (persisted && persisted.success === false) {
                    T.toastWarning('Updated in memory; storage write failed.');
                } else {
                    T.toastSuccess('Staff member updated.');
                }
                T.closeTopModal();
                _rerender(householdId);
                if (typeof window.refreshHouseholdList === 'function') {
                    window.refreshHouseholdList();
                }
                return true;
            }
        });
    }

    function _confirmRemoveStaff(householdId, characterId) {
        if (!characterId) return;
        var ch = T.character(characterId);
        var name = ch ? T.characterName(ch) : 'this staff member';

        T.confirmDialog(
            'Remove ' + name + ' from this department?',
            'Remove from Department',
            function () {
                var HC = T.commands();
                if (!HC) { T.toastError('HouseholdCommands is not loaded.'); return; }

                var result = HC.updateMember(householdId, characterId, {
                    departmentId: null,
                    isHead: false
                });
                if (!result || result.success !== true) {
                    T.toastError('Failed to remove: ' + (result ? result.reason : 'unknown'));
                    return;
                }

                var persisted = HC.persist();
                if (persisted && persisted.success === false) {
                    T.toastWarning('Removed in memory; storage write failed.');
                } else {
                    T.toastInfo(name + ' removed from department.');
                }
                _rerender(householdId);
            }
        );
    }

    // =========================================================================
    // 8. MODALS — POSITION
    // =========================================================================

    function _openCreatePosition(householdId, presetDeptId) {
        var departments = T.getHouseholdDepartments(householdId) || [];
        var deptOptions = '<option value="">None</option>' + departments.map(function (d) {
            return '<option value="' + T.esc(d.id) + '"' +
                (d.id === presetDeptId ? ' selected' : '') + '>' +
                T.esc(d.name) + '</option>';
        }).join('');

        var content =
            '<div class="hh-modal-form">' +
                '<div class="hh-form-group">' +
                    '<label>Position Name *</label>' +
                    '<input type="text" data-field="name" ' +
                        'placeholder="e.g., Butler, Cook, Maid, Gardener">' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Department</label>' +
                    '<select data-field="dept">' + deptOptions + '</select>' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Required Role (optional)</label>' +
                    '<input type="text" data-field="role" ' +
                        'placeholder="e.g., Servant, Cook">' +
                '</div>' +
                '<div class="hh-form-row">' +
                    '<div class="hh-form-group">' +
                        '<label>Min Skill</label>' +
                        '<input type="number" data-field="minSkill" value="0" min="0" max="100">' +
                    '</div>' +
                    '<div class="hh-form-group">' +
                        '<label>Priority</label>' +
                        '<input type="number" data-field="priority" value="10" min="1" max="100">' +
                    '</div>' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Description</label>' +
                    '<input type="text" data-field="desc" ' +
                        'placeholder="e.g., Responsible for meal preparation">' +
                '</div>' +
            '</div>';

        var modal = T.openModal({
            title: 'Create Position',
            content: content,
            confirmText: 'Create Position',
            cancelText: 'Cancel',
            onConfirm: function () {
                var root = modal && modal.element;
                if (!root) { T.toastError('Modal root unavailable.'); return false; }

                var name = (root.querySelector('[data-field="name"]').value || '').trim();
                if (!name) { T.toastError('Position name is required.'); return false; }

                var deptId = root.querySelector('[data-field="dept"]').value || null;
                var requiredRoleId = (root.querySelector('[data-field="role"]').value || '').trim() || null;
                var minSkill = parseInt(root.querySelector('[data-field="minSkill"]').value, 10);
                if (!isFinite(minSkill)) minSkill = 0;
                var priority = parseInt(root.querySelector('[data-field="priority"]').value, 10);
                if (!isFinite(priority)) priority = 10;
                var description = (root.querySelector('[data-field="desc"]').value || '').trim();

                var HC = T.commands();
                if (!HC) { T.toastError('HouseholdCommands is not loaded.'); return false; }

                var result = HC.createPosition({
                    name: name,
                    householdId: householdId,
                    departmentId: deptId,
                    requiredRoleId: requiredRoleId,
                    minSkillLevel: minSkill,
                    priority: priority,
                    description: description
                });
                if (!result || result.success !== true) {
                    T.toastError('Failed to create: ' + (result ? result.reason : 'unknown'));
                    return false;
                }

                var persisted = HC.persist();
                if (persisted && persisted.success === false) {
                    T.toastWarning('Created in memory; storage write failed.');
                } else {
                    T.toastSuccess('Position "' + name + '" created.');
                }
                T.closeTopModal();
                _rerender(householdId);
                return true;
            }
        });
    }

    function _openEditPosition(householdId, posId) {
        if (!posId) return;
        var pos = T.getHouseholdPosition(posId);
        if (!pos) { T.toastError('Position not found.'); return; }

        var departments = T.getHouseholdDepartments(householdId) || [];
        var deptOptions = '<option value="">None</option>' + departments.map(function (d) {
            return '<option value="' + T.esc(d.id) + '"' +
                (d.id === pos.departmentId ? ' selected' : '') + '>' +
                T.esc(d.name) + '</option>';
        }).join('');

        var content =
            '<div class="hh-modal-form">' +
                '<div class="hh-form-group">' +
                    '<label>Position Name *</label>' +
                    '<input type="text" data-field="name" value="' + T.esc(pos.name) + '">' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Department</label>' +
                    '<select data-field="dept">' + deptOptions + '</select>' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Required Role</label>' +
                    '<input type="text" data-field="role" value="' +
                        T.esc(pos.requiredRoleId || '') + '">' +
                '</div>' +
                '<div class="hh-form-row">' +
                    '<div class="hh-form-group">' +
                        '<label>Min Skill</label>' +
                        '<input type="number" data-field="minSkill" value="' +
                            (pos.minSkillLevel || 0) + '" min="0" max="100">' +
                    '</div>' +
                    '<div class="hh-form-group">' +
                        '<label>Priority</label>' +
                        '<input type="number" data-field="priority" value="' +
                            (pos.priority || 10) + '" min="1" max="100">' +
                    '</div>' +
                '</div>' +
                '<div class="hh-form-group">' +
                    '<label>Description</label>' +
                    '<input type="text" data-field="desc" value="' +
                        T.esc(pos.description || '') + '">' +
                '</div>' +
            '</div>';

        var modal = T.openModal({
            title: 'Edit Position: ' + pos.name,
            content: content,
            confirmText: 'Save Changes',
            cancelText: 'Cancel',
            onConfirm: function () {
                var root = modal && modal.element;
                if (!root) { T.toastError('Modal root unavailable.'); return false; }

                var name = (root.querySelector('[data-field="name"]').value || '').trim();
                if (!name) { T.toastError('Position name is required.'); return false; }

                var deptId = root.querySelector('[data-field="dept"]').value || null;
                var requiredRoleId = (root.querySelector('[data-field="role"]').value || '').trim() || null;
                var minSkill = parseInt(root.querySelector('[data-field="minSkill"]').value, 10);
                if (!isFinite(minSkill)) minSkill = 0;
                var priority = parseInt(root.querySelector('[data-field="priority"]').value, 10);
                if (!isFinite(priority)) priority = 10;
                var description = (root.querySelector('[data-field="desc"]').value || '').trim();

                var HC = T.commands();
                if (!HC) { T.toastError('HouseholdCommands is not loaded.'); return false; }

                var result = HC.updatePosition(posId, {
                    name: name,
                    departmentId: deptId,
                    requiredRoleId: requiredRoleId,
                    minSkillLevel: minSkill,
                    priority: priority,
                    description: description
                });
                if (!result || result.success !== true) {
                    T.toastError('Failed to update: ' + (result ? result.reason : 'unknown'));
                    return false;
                }

                var persisted = HC.persist();
                if (persisted && persisted.success === false) {
                    T.toastWarning('Updated in memory; storage write failed.');
                } else {
                    T.toastSuccess('Position updated.');
                }
                T.closeTopModal();
                _rerender(householdId);
                return true;
            }
        });
    }

    function _confirmDeletePosition(householdId, posId) {
        if (!posId) return;
        var pos = T.getHouseholdPosition(posId);
        if (!pos) { T.toastError('Position not found.'); return; }

        T.confirmDialog(
            'Delete position "' + pos.name + '"?\n\n' +
            'This permanently removes the position and all its assignments.',
            'Delete Position',
            function () {
                var HC = T.commands();
                if (!HC) { T.toastError('HouseholdCommands is not loaded.'); return; }

                var result = HC.deletePosition(posId, { removeAssignments: true });
                if (!result || result.success !== true) {
                    T.toastError('Failed to delete: ' + (result ? result.reason : 'unknown'));
                    return;
                }

                var persisted = HC.persist();
                if (persisted && persisted.success === false) {
                    T.toastWarning('Deleted in memory; storage write failed.');
                } else {
                    T.toastInfo('Position "' + pos.name + '" deleted.');
                }
                _rerender(householdId);
            }
        );
    }

    // =========================================================================
    // 9. MODALS — ASSIGN POSITION (delegated)
    // =========================================================================
    //
    // The assignment modal is owned by modals-household-staff.js. This
    // tab does not duplicate it; it delegates and rerenders on success.
    // This mirrors the education tabs' delegation pattern (they never
    // open the education assignment modals from inside a tab body
    // either — they call the delegate).

    function _openAssignPosition(householdId, posId) {
        if (!posId) return;

        if (typeof window.openAssignStaffToHouseholdPositionModal === 'function') {
            window.openAssignStaffToHouseholdPositionModal(householdId, posId, function () {
                _rerender(householdId);
            });
            return;
        }

        T.toastError(
            'Assignment modal unavailable: openAssignStaffToHouseholdPositionModal ' +
            'is not loaded. Load js/households/modals-household-staff.js.'
        );
    }

    // =========================================================================
    // 10. REGISTRATION
    // =========================================================================

    T.register(TAB_ID, renderHouseholdDepartmentsTab);

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.HouseholdDepartmentsTab = {
        id: TAB_ID,
        render: renderHouseholdDepartmentsTab
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.HouseholdDepartmentsTab;
    }
})();
