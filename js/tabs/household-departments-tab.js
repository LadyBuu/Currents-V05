/**
 * =============================================================================
 * HOUSEHOLD DEPARTMENTS TAB (household-departments-tab.js)
 * =============================================================================
 *
 * PURPOSE: Modular departments tab for the Household Manager tool.
 *          Manages departments, staff positions, and staff assignments.
 *
 * DEPENDS ON:
 *   - HouseholdState (household-state.js)
 *   - HouseholdCommands (household-commands.js)
 *   - HouseholdQueries (household-queries.js)
 *   - modals-core.js (for modal wrappers)
 *   - ui.js (for toast notifications)
 *   - icons.js (for icons)
 *   - modals-char-selector.js (for character selection)
 *
 * ICON POLICY: Uses icons.js - NO emojis
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - _getCurrentYear now uses getCurrentYear (canonical accessor in
 *       time.js) instead of the deprecated getCurrentYearSafe alias,
 *       and throws on missing time.js instead of falling back to 1250.
 *     - _getCurrentHouseholdId now prefers
 *       HouseholdState.getUIState().selectedHouseholdId (the canonical
 *       selection store) instead of the flat globals that no module
 *       writes.
 *     - Replaced window.renderHouseholdList() with
 *       window.refreshHouseholdList() in the two mutation success
 *       paths.
 *     - Refactored _attachEventHandlers from the clone-based listener
 *       reset to a delegated click listener. The clone path had three
 *       failure modes:
 *         1. cloneNode(true) drops scroll position and focus, so a
 *            re-render after a mutation snapped the user back to the
 *            top of the department list.
 *         2. The `_handlersAttached` marker lived on the container
 *            element, which survived innerHTML assignment. The clone
 *            branch replaced the container in the DOM, but the caller
 *            (renderHouseholdDepartmentsTab) still held the ORIGINAL
 *            container reference. On the second mutation re-render the
 *            caller targeted the detached original; the attached
 *            listener lived on the clone.
 *         3. On the third mutation re-render, container.parentNode was
 *            null (the original had been detached), so replaceChild
 *            threw NotFoundError.
 *       The delegated listener has none of these problems: it is
 *       attached once to the container and reads e.target.closest()
 *       on each click, dispatching on data-action / data-dept-id /
 *       data-pos-id attributes that re-renders preserve.
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
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getState() {
        return typeof window.HouseholdState !== 'undefined' ? window.HouseholdState : null;
    }

    function _getCommands() {
        return typeof window.HouseholdCommands !== 'undefined' ? window.HouseholdCommands : null;
    }

    function _getQueries() {
        return typeof window.HouseholdQueries !== 'undefined' ? window.HouseholdQueries : null;
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        return [];
    }

    /**
     * Returns the current simulation year.
     *
     * Delegates to the canonical accessor in time.js. The deprecated
     * getCurrentYearSafe alias is NOT used, and there is NO 1250
     * fallback. A missing time.js is a load-order bug; the caller
     * should surface it, not silently substitute a wrong year.
     *
     * @throws {Error} if time.js is not loaded
     */
    function _getCurrentYear() {
        if (typeof window.getCurrentYear !== 'function') {
            throw new Error(
                '[HouseholdDepartmentsTab] requires time.js (getCurrentYear). ' +
                'Load js/core/time.js before this tab.'
            );
        }
        return window.getCurrentYear();
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
        }
    }

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    function _getIconSafe(name) {
        var icon = _getIcon(name);
        return icon || '';
    }

    function _openCharacterSelector(options) {
        if (typeof window.openCharacterSelector === 'function') {
            return window.openCharacterSelector(options);
        }
        if (typeof window._openCharacterSelector === 'function') {
            return window._openCharacterSelector(options);
        }
        _showToast('Character selector not available', 'error');
        return null;
    }

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

    function _confirmDialog(message, title, onConfirm) {
        if (typeof window.confirmDialog === 'function') {
            return window.confirmDialog(message, title, onConfirm);
        }
        if (typeof window._confirmDialog === 'function') {
            return window._confirmDialog(message, title, onConfirm);
        }
        if (confirm(message)) {
            onConfirm();
        }
    }

    // =========================================================================
    // 3. GET CURRENT HOUSEHOLD ID
    // =========================================================================
    //
    // Canonical selection lives in HouseholdState.getUIState()
    // .selectedHouseholdId, set via HouseholdState.setSelectedHousehold
    // (which household-ui-list.js::selectHousehold calls when the user
    // picks a household from the sidebar).

    function _getCurrentHouseholdId() {
        var HS = _getState();
        if (HS && typeof HS.getUIState === 'function') {
            try {
                var s = HS.getUIState();
                if (s && typeof s.selectedHouseholdId === 'string'
                    && s.selectedHouseholdId.length > 0) {
                    return s.selectedHouseholdId;
                }
            } catch (e) { /* fall through */ }
        }
        if (window._currentHouseholdId) return window._currentHouseholdId;
        if (window.currentHouseholdId) return window.currentHouseholdId;
        if (window.selectedHouseholdId) return window.selectedHouseholdId;
        return null;
    }

    // =========================================================================
    // 4. DATA FETCHER
    // =========================================================================

    function _getDepartmentsData(householdId) {
        var HS = _getState();
        var HQ = _getQueries();

        if (!HS) {
            return { error: 'Household system not available' };
        }

        var household = HS.getHousehold(householdId);
        if (!household) {
            return { error: 'Household not found' };
        }

        var departments = household.departments || [];
        var members = HS.getHouseholdMembersWithCharacters(householdId);
        var positions = HS.getHouseholdPositions({ householdId: householdId });
        var assignments = HS.getAssignmentsForHousehold(householdId, true);

        var staffByDepartment = {};
        for (var i = 0; i < members.length; i++) {
            var m = members[i];
            if (m.type === 'staff' && m.departmentId) {
                if (!staffByDepartment[m.departmentId]) {
                    staffByDepartment[m.departmentId] = [];
                }
                staffByDepartment[m.departmentId].push(m);
            }
        }

        var positionsByDepartment = {};
        for (var i = 0; i < positions.length; i++) {
            var p = positions[i];
            var deptId = p.departmentId || 'unassigned';
            if (!positionsByDepartment[deptId]) {
                positionsByDepartment[deptId] = [];
            }
            positionsByDepartment[deptId].push(p);
        }

        var assignmentsByPosition = {};
        for (var i = 0; i < assignments.length; i++) {
            var a = assignments[i];
            if (!assignmentsByPosition[a.positionId]) {
                assignmentsByPosition[a.positionId] = [];
            }
            assignmentsByPosition[a.positionId].push(a);
        }

        return {
            household: household,
            departments: departments,
            members: members,
            positions: positions,
            assignments: assignments,
            staffByDepartment: staffByDepartment,
            positionsByDepartment: positionsByDepartment,
            assignmentsByPosition: assignmentsByPosition,
            currentYear: _getCurrentYear()
        };
    }

    // =========================================================================
    // 5. RENDER FUNCTIONS
    // =========================================================================

    function _renderDepartmentCard(dept, data, index) {
        var HS = _getState();
        var deptIcon = _getIconSafe('CIRCLE_DOT');
        var personIcon = _getIconSafe('PERSON');
        var editIcon = _getIconSafe('EDIT');
        var trashIcon = _getIconSafe('X_HEAVY');
        var plusIcon = _getIconSafe('PLUS');

        var staff = data.staffByDepartment[dept.id] || [];
        var positions = data.positionsByDepartment[dept.id] || [];
        var unassignedPositions = data.positionsByDepartment['unassigned'] || [];

        var head = null;
        if (dept.headId) {
            head = _getCharacterById(dept.headId);
        }
        var headName = head ? (head.name + (head.surname ? ' ' + head.surname : '')) : 'None';

        var totalAssignments = 0;
        for (var i = 0; i < positions.length; i++) {
            var posAssignments = data.assignmentsByPosition[positions[i].id] || [];
            totalAssignments += posAssignments.filter(function(a) { return !a.endYear; }).length;
        }

        var staffHtml = '';
        if (staff.length > 0) {
            staffHtml = '<div style="margin-top:4px;padding-left:12px;">';
            for (var i = 0; i < staff.length; i++) {
                var s = staff[i];
                var char = s.character;
                var charName = char ? (char.name + (char.surname ? ' ' + char.surname : '')) : 'Unknown';
                var isDeceased = char ? char.isDeceased : false;
                var isHead = s.isHead || false;

                staffHtml +=
                    '<div style="display:flex;justify-content:space-between;align-items:center;padding:2px 6px;font-size:0.55rem;' +
                        (isDeceased ? 'opacity:0.5;' : '') +
                    '">' +
                        '<span>' + personIcon + ' ' + _escapeHtml(charName) +
                            (isHead ? ' <span style="color:var(--accent);font-size:0.45rem;">(Head)</span>' : '') +
                            (s.role ? ' <span style="color:var(--dim);font-size:0.45rem;">' + _escapeHtml(s.role) + '</span>' : '') +
                        '</span>' +
                        '<div style="display:flex;gap:4px;">' +
                            '<button type="button" class="staff-edit-btn" data-char-id="' + (char ? char.id : '') + '" data-dept-id="' + dept.id + '" style="padding:0px 4px;font-size:0.4rem;background:none;border:none;color:var(--accent);cursor:pointer;" title="Edit staff member">' + editIcon + '</button>' +
                            '<button type="button" class="staff-remove-btn" data-char-id="' + (char ? char.id : '') + '" data-dept-id="' + dept.id + '" style="padding:0px 4px;font-size:0.4rem;background:none;border:none;color:var(--dim);cursor:pointer;" title="Remove from department">' + trashIcon + '</button>' +
                        '</div>' +
                    '</div>';
            }
            staffHtml += '</div>';
        } else {
            staffHtml = '<div style="font-size:0.5rem;color:var(--dim);padding:4px 12px;">No staff assigned</div>';
        }

        var positionsHtml = '';
        if (positions.length > 0) {
            positionsHtml = '<div style="margin-top:4px;padding-left:12px;border-top:1px solid var(--border-light);padding-top:4px;">';
            for (var i = 0; i < positions.length; i++) {
                var p = positions[i];
                var posAssignments = data.assignmentsByPosition[p.id] || [];
                var activeAssignments = posAssignments.filter(function(a) { return !a.endYear; });
                var assignedNames = activeAssignments.map(function(a) {
                    var c = _getCharacterById(a.characterId);
                    return c ? c.name : 'Unknown';
                }).join(', ');

                positionsHtml +=
                    '<div style="display:flex;justify-content:space-between;align-items:center;padding:2px 6px;font-size:0.5rem;border-left:2px solid var(--accent-dim);margin-bottom:2px;">' +
                        '<span>' + _escapeHtml(p.name) +
                            (p.requiredRoleId ? ' <span style="color:var(--accent);font-size:0.4rem;">(Role: ' + _escapeHtml(p.requiredRoleId) + ')</span>' : '') +
                            (assignedNames ? ' <span style="color:var(--dim);font-size:0.4rem;">→ ' + _escapeHtml(assignedNames) + '</span>' : '') +
                        '</span>' +
                        '<div style="display:flex;gap:4px;">' +
                            '<button type="button" class="pos-assign-btn" data-pos-id="' + p.id + '" style="padding:0px 4px;font-size:0.4rem;background:none;border:none;color:var(--success);cursor:pointer;" title="Assign staff">' + plusIcon + '</button>' +
                            '<button type="button" class="pos-edit-btn" data-pos-id="' + p.id + '" style="padding:0px 4px;font-size:0.4rem;background:none;border:none;color:var(--accent);cursor:pointer;" title="Edit position">' + editIcon + '</button>' +
                            '<button type="button" class="pos-delete-btn" data-pos-id="' + p.id + '" style="padding:0px 4px;font-size:0.4rem;background:none;border:none;color:var(--dim);cursor:pointer;" title="Delete position">' + trashIcon + '</button>' +
                        '</div>' +
                    '</div>';
            }
            positionsHtml += '</div>';
        }

        var unassignedHtml = '';
        if (index === 0 && unassignedPositions.length > 0) {
            unassignedHtml = '<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border-light);">' +
                '<div style="font-size:0.55rem;color:var(--warn);margin-bottom:4px;">Unassigned Positions</div>';
            for (var i = 0; i < unassignedPositions.length; i++) {
                var p = unassignedPositions[i];
                var posAssignments = data.assignmentsByPosition[p.id] || [];
                var activeAssignments = posAssignments.filter(function(a) { return !a.endYear; });
                var assignedNames = activeAssignments.map(function(a) {
                    var c = _getCharacterById(a.characterId);
                    return c ? c.name : 'Unknown';
                }).join(', ');

                unassignedHtml +=
                    '<div style="display:flex;justify-content:space-between;align-items:center;padding:2px 6px;font-size:0.5rem;border-left:2px solid var(--warn);margin-bottom:2px;">' +
                        '<span>' + _escapeHtml(p.name) +
                            (assignedNames ? ' <span style="color:var(--dim);font-size:0.4rem;">→ ' + _escapeHtml(assignedNames) + '</span>' : '') +
                        '</span>' +
                        '<div style="display:flex;gap:4px;">' +
                            '<button type="button" class="pos-assign-btn" data-pos-id="' + p.id + '" style="padding:0px 4px;font-size:0.4rem;background:none;border:none;color:var(--success);cursor:pointer;" title="Assign staff">' + plusIcon + '</button>' +
                            '<button type="button" class="pos-edit-btn" data-pos-id="' + p.id + '" style="padding:0px 4px;font-size:0.4rem;background:none;border:none;color:var(--accent);cursor:pointer;" title="Edit position">' + editIcon + '</button>' +
                            '<button type="button" class="pos-delete-btn" data-pos-id="' + p.id + '" style="padding:0px 4px;font-size:0.4rem;background:none;border:none;color:var(--dim);cursor:pointer;" title="Delete position">' + trashIcon + '</button>' +
                        '</div>' +
                    '</div>';
            }
            unassignedHtml += '</div>';
        }

        return '' +
            '<div class="department-card" data-dept-id="' + dept.id + '" style="' +
                'background:var(--bg3);' +
                'border:1px solid var(--border);' +
                'border-radius:6px;' +
                'padding:10px 12px;' +
                'margin-bottom:8px;' +
            '">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:4px;">' +
                    '<div style="display:flex;align-items:center;gap:6px;">' +
                        '<span style="font-size:0.7rem;font-weight:bold;">' + deptIcon + ' ' + _escapeHtml(dept.name) + '</span>' +
                        '<span style="font-size:0.5rem;color:var(--dim);">' + staff.length + ' staff</span>' +
                        '<span style="font-size:0.5rem;color:var(--dim);">' + positions.length + ' positions</span>' +
                        '<span style="font-size:0.5rem;color:var(--dim);">' + totalAssignments + ' assigned</span>' +
                        (dept.headId ? '<span style="font-size:0.45rem;color:var(--accent);">Head: ' + _escapeHtml(headName) + '</span>' : '') +
                    '</div>' +
                    '<div style="display:flex;gap:4px;">' +
                        '<button type="button" class="dept-add-staff-btn" data-dept-id="' + dept.id + '" style="padding:2px 8px;font-size:0.45rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:3px;cursor:pointer;" title="Add staff to department">' + plusIcon + ' Add Staff</button>' +
                        '<button type="button" class="dept-add-pos-btn" data-dept-id="' + dept.id + '" style="padding:2px 8px;font-size:0.45rem;background:var(--bg3);border:1px solid var(--border);border-radius:3px;cursor:pointer;" title="Create position in department">+ Position</button>' +
                        '<button type="button" class="dept-edit-btn" data-dept-id="' + dept.id + '" style="padding:2px 4px;font-size:0.45rem;background:none;border:none;color:var(--accent);cursor:pointer;" title="Edit department">' + editIcon + '</button>' +
                        '<button type="button" class="dept-delete-btn" data-dept-id="' + dept.id + '" style="padding:2px 4px;font-size:0.45rem;background:none;border:none;color:var(--dim);cursor:pointer;" title="Delete department">' + trashIcon + '</button>' +
                    '</div>' +
                '</div>' +
                staffHtml +
                positionsHtml +
                unassignedHtml +
            '</div>';
    }

    function _renderStats(data) {
        var departments = data.departments || [];
        var totalStaff = 0;
        var totalPositions = 0;
        var totalAssignments = 0;

        for (var i = 0; i < departments.length; i++) {
            var dept = departments[i];
            var staff = data.staffByDepartment[dept.id] || [];
            totalStaff += staff.length;
            var positions = data.positionsByDepartment[dept.id] || [];
            totalPositions += positions.length;
            for (var j = 0; j < positions.length; j++) {
                var posAssignments = data.assignmentsByPosition[positions[j].id] || [];
                totalAssignments += posAssignments.filter(function(a) { return !a.endYear; }).length;
            }
        }

        var unassignedPositions = data.positionsByDepartment['unassigned'] || [];
        totalPositions += unassignedPositions.length;

        var deptIcon = _getIconSafe('CIRCLE_DOT');
        var personIcon = _getIconSafe('PERSON');

        return '' +
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:12px;">' +
                '<div style="background:var(--bg3);padding:6px;border-radius:4px;text-align:center;">' +
                    '<div style="font-size:0.5rem;color:var(--dim);">' + deptIcon + ' Departments</div>' +
                    '<div style="font-size:0.85rem;font-weight:bold;">' + departments.length + '</div>' +
                '</div>' +
                '<div style="background:var(--bg3);padding:6px;border-radius:4px;text-align:center;">' +
                    '<div style="font-size:0.5rem;color:var(--dim);">' + personIcon + ' Staff</div>' +
                    '<div style="font-size:0.85rem;font-weight:bold;">' + totalStaff + '</div>' +
                '</div>' +
                '<div style="background:var(--bg3);padding:6px;border-radius:4px;text-align:center;">' +
                    '<div style="font-size:0.5rem;color:var(--dim);">Positions</div>' +
                    '<div style="font-size:0.85rem;font-weight:bold;">' + totalPositions + '</div>' +
                '</div>' +
                '<div style="background:var(--bg3);padding:6px;border-radius:4px;text-align:center;">' +
                    '<div style="font-size:0.5rem;color:var(--dim);">Assignments</div>' +
                    '<div style="font-size:0.85rem;font-weight:bold;">' + totalAssignments + '</div>' +
                '</div>' +
            '</div>';
    }

    // =========================================================================
    // 6. MAIN RENDER FUNCTION
    // =========================================================================

    function renderHouseholdDepartmentsTab(containerId, householdId) {
        if (_rendering) {
            return;
        }
        _rendering = true;

        try {
            var container = document.getElementById(containerId);
            if (!container) {
                console.warn('[DepartmentsTab] Container not found: ' + containerId);
                return;
            }

            if (!householdId) {
                householdId = _getCurrentHouseholdId();
            }

            if (!householdId) {
                container.innerHTML = '<div class="placeholder">No household selected</div>';
                return;
            }

            console.log('[DepartmentsTab] Rendering for household:', householdId);

            var data = _getDepartmentsData(householdId);

            if (data.error) {
                container.innerHTML = '<div class="placeholder" style="color:var(--danger);">' + _escapeHtml(data.error) + '</div>';
                return;
            }

            var plusIcon = _getIconSafe('PLUS');
            var departments = data.departments || [];

            var html = '' +
                '<div style="max-width:750px;margin:0 auto;">' +
                    '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:12px;">' +
                        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px;">' +
                            '<h3 style="font-size:0.7rem;color:var(--accent);margin:0;">Departments & Staff</h3>' +
                            '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
                                '<button type="button" id="deptCreateBtn" class="btn" style="padding:3px 10px;font-size:0.55rem;background:var(--accent-dim);border:1px solid var(--accent);border-radius:4px;cursor:pointer;">' + plusIcon + ' Create Department</button>' +
                                '<button type="button" id="deptCreatePosBtn" class="btn" style="padding:3px 10px;font-size:0.55rem;background:var(--bg3);border:1px solid var(--border);border-radius:4px;cursor:pointer;">+ Create Position</button>' +
                            '</div>' +
                        '</div>' +

                        _renderStats(data) +

                        '<div style="margin-bottom:12px;">' +
                            (departments.length === 0 ?
                                '<div style="text-align:center;padding:20px;color:var(--dim);font-size:0.65rem;">No departments created yet</div>' :
                                departments.map(function(dept, index) {
                                    return _renderDepartmentCard(dept, data, index);
                                }).join('')
                            ) +
                        '</div>' +
                    '</div>' +
                    '<div style="font-size:0.5rem;color:var(--dim);text-align:center;">' +
                        departments.length + ' departments · ' +
                        Object.keys(data.staffByDepartment).reduce(function(sum, key) {
                            return sum + data.staffByDepartment[key].length;
                        }, 0) + ' staff members' +
                    '</div>' +
                '</div>';

            container.innerHTML = html;

            // Attach the delegated click listener once. Subsequent
            // renders reuse it; re-attaching would stack listeners.
            _attachEventHandlers(container, householdId);

        } catch (e) {
            console.error('[DepartmentsTab] Error:', e);
            var container = document.getElementById(containerId);
            if (container) {
                container.innerHTML = '<div class="placeholder" style="color:var(--danger);">Error loading departments</div>';
            }
        } finally {
            _rendering = false;
        }
    }

    // =========================================================================
    // 7. EVENT HANDLERS — DELEGATED
    // =========================================================================
    //
    // One click listener per container, attached once and reused across
    // re-renders. The listener reads data-* attributes that re-renders
    // preserve, so a re-rendered button dispatches to the correct
    // handler without re-attaching anything.
    //
    // The `__deptHandlersAttached` marker is set on the container the
    // FIRST time. On subsequent calls the function returns early —
    // the listener is already in place and will catch new buttons.
    //
    // This replaces the prior cloneNode-based reset, which (a) dropped
    // scroll position, (b) held a stale container reference in the
    // caller after the clone-and-replace, and (c) threw
    // `NotFoundError: replaceChild` on the third re-render because the
    // original container had been detached.

    function _attachEventHandlers(container, householdId) {
        if (!container) return;
        if (container.__deptHandlersAttached) return;
        container.__deptHandlersAttached = true;

        container.addEventListener('click', function (e) {
            var target = e.target.closest ? e.target.closest('button') : null;
            if (!target) return;

            // Create Department / Create Position header buttons.
            if (target.id === 'deptCreateBtn') {
                e.preventDefault();
                e.stopPropagation();
                _openCreateDepartmentModal(householdId);
                return;
            }
            if (target.id === 'deptCreatePosBtn') {
                e.preventDefault();
                e.stopPropagation();
                _openCreatePositionModal(householdId);
                return;
            }

            // Per-department header actions.
            if (target.classList.contains('dept-add-staff-btn')) {
                e.preventDefault();
                e.stopPropagation();
                var deptId = target.getAttribute('data-dept-id');
                if (deptId) _openAddStaffToDepartmentModal(householdId, deptId);
                return;
            }
            if (target.classList.contains('dept-add-pos-btn')) {
                e.preventDefault();
                e.stopPropagation();
                var deptId = target.getAttribute('data-dept-id');
                if (deptId) _openCreatePositionModal(householdId, deptId);
                return;
            }
            if (target.classList.contains('dept-edit-btn')) {
                e.preventDefault();
                e.stopPropagation();
                var deptId = target.getAttribute('data-dept-id');
                if (deptId) _openEditDepartmentModal(householdId, deptId);
                return;
            }
            if (target.classList.contains('dept-delete-btn')) {
                e.preventDefault();
                e.stopPropagation();
                var deptId = target.getAttribute('data-dept-id');
                if (deptId) _confirmDeleteDepartment(householdId, deptId);
                return;
            }

            // Per-staff-member actions.
            if (target.classList.contains('staff-edit-btn')) {
                e.preventDefault();
                e.stopPropagation();
                var charId = target.getAttribute('data-char-id');
                var deptId = target.getAttribute('data-dept-id');
                if (charId) _openEditStaffMemberModal(householdId, charId, deptId);
                return;
            }
            if (target.classList.contains('staff-remove-btn')) {
                e.preventDefault();
                e.stopPropagation();
                var charId = target.getAttribute('data-char-id');
                var deptId = target.getAttribute('data-dept-id');
                if (charId) _confirmRemoveStaffFromDepartment(householdId, charId, deptId);
                return;
            }

            // Per-position actions.
            if (target.classList.contains('pos-assign-btn')) {
                e.preventDefault();
                e.stopPropagation();
                var posId = target.getAttribute('data-pos-id');
                if (posId) _openAssignPositionModal(householdId, posId);
                return;
            }
            if (target.classList.contains('pos-edit-btn')) {
                e.preventDefault();
                e.stopPropagation();
                var posId = target.getAttribute('data-pos-id');
                if (posId) _openEditPositionModal(householdId, posId);
                return;
            }
            if (target.classList.contains('pos-delete-btn')) {
                e.preventDefault();
                e.stopPropagation();
                var posId = target.getAttribute('data-pos-id');
                if (posId) _confirmDeletePosition(householdId, posId);
                return;
            }
        });
    }

    // =========================================================================
    // 8. DEPARTMENT MODALS
    // =========================================================================

    function _openCreateDepartmentModal(householdId) {
        if (_processingAction) return;
        _processingAction = true;

        try {
            var HC = _getCommands();
            if (!HC) {
                _showToast('Household commands not available', 'error');
                _processingAction = false;
                return;
            }

            var content = '' +
                '<div style="margin-bottom:12px;">' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Department Name *</label>' +
                        '<input type="text" id="deptName" placeholder="e.g., Household Staff, Kitchen, Gardens" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Department Head (optional)</label>' +
                        '<div style="display:flex;gap:6px;">' +
                            '<input type="text" id="deptHeadDisplay" placeholder="Select head..." readonly style="flex:1;padding:6px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;font-size:0.7rem;cursor:pointer;">' +
                            '<input type="hidden" id="deptHeadId">' +
                            '<button id="deptHeadSelectBtn" class="btn" style="font-size:0.55rem;padding:4px 10px;">Select</button>' +
                            '<button id="deptHeadClearBtn" class="btn" style="font-size:0.55rem;padding:4px 8px;">Clear</button>' +
                        '</div>' +
                    '</div>' +
                '</div>';

            _openModal({
                title: 'Create Department',
                content: content,
                confirmText: 'Create Department',
                cancelText: 'Cancel',
                onOpen: function() {
                    var nameInput = document.getElementById('deptName');
                    if (nameInput) {
                        setTimeout(function() { nameInput.focus(); }, 100);
                    }

                    var selectBtn = document.getElementById('deptHeadSelectBtn');
                    var clearBtn = document.getElementById('deptHeadClearBtn');
                    var displayInput = document.getElementById('deptHeadDisplay');
                    var hiddenInput = document.getElementById('deptHeadId');

                    if (selectBtn) {
                        selectBtn.onclick = function(e) {
                            e.stopPropagation();
                            _openCharacterSelector({
                                title: 'Select Department Head',
                                filters: { showDeceased: false },
                                onSelect: function(character) {
                                    if (character) {
                                        displayInput.value = character.name + (character.surname ? ' ' + character.surname : '');
                                        hiddenInput.value = character.id;
                                        _showToast('Selected: ' + character.name, 'success');
                                    }
                                }
                            });
                        };
                    }

                    if (clearBtn) {
                        clearBtn.onclick = function(e) {
                            e.stopPropagation();
                            displayInput.value = '';
                            hiddenInput.value = '';
                        };
                    }
                },
                onConfirm: function() {
                    var name = document.getElementById('deptName').value.trim();
                    var headId = document.getElementById('deptHeadId').value || null;

                    if (!name) {
                        _showToast('Department name is required', 'error');
                        _processingAction = false;
                        return false;
                    }

                    var result = HC.addDepartment(householdId, name, { headId: headId });

                    if (result && result.success) {
                        _showToast('Department "' + name + '" created', 'success');
                        _closeTopModal();
                        _processingAction = false;
                        renderHouseholdDepartmentsTab('tab-positions', householdId);
                        if (typeof window.refreshHouseholdList === 'function') {
                            window.refreshHouseholdList();
                        }
                        return true;
                    } else {
                        _showToast(result ? result.reason : 'Failed to create department', 'error');
                        _processingAction = false;
                        return false;
                    }
                },
                onCancel: function() {
                    _processingAction = false;
                }
            });

        } catch (e) {
            _processingAction = false;
            _showToast('Error creating department', 'error');
        }
    }

    // =========================================================================
    // 9. STAFF MODALS
    // =========================================================================

    function _openEditStaffMemberModal(householdId, characterId, deptId) {
        if (_processingAction) return;
        _processingAction = true;

        try {
            var HS = _getState();
            var HC = _getCommands();
            if (!HS || !HC) {
                _showToast('Household system not available', 'error');
                _processingAction = false;
                return;
            }

            var char = _getCharacterById(characterId);
            if (!char) {
                _showToast('Character not found', 'error');
                _processingAction = false;
                return;
            }

            var household = HS.getHousehold(householdId);
            var member = null;
            for (var i = 0; i < household.members.length; i++) {
                if (household.members[i].characterId === characterId) {
                    member = household.members[i];
                    break;
                }
            }

            if (!member) {
                _showToast('Member not found', 'error');
                _processingAction = false;
                return;
            }

            var departments = household.departments || [];
            var deptOptions = departments.map(function(d) {
                var selected = (d.id === member.departmentId) ? 'selected' : '';
                return '<option value="' + d.id + '" ' + selected + '>' + _escapeHtml(d.name) + '</option>';
            }).join('');

            var content = '' +
                '<div style="margin-bottom:12px;">' +
                    '<div style="background:var(--bg3);padding:8px;border-radius:6px;margin-bottom:12px;font-size:0.6rem;">' +
                        'Editing: <strong>' + _escapeHtml(char.name + (char.surname ? ' ' + char.surname : '')) + '</strong>' +
                        (member.isHead ? ' · <span style="color:var(--accent);">Head</span>' : '') +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Role</label>' +
                        '<input type="text" id="editStaffRole" value="' + _escapeHtml(member.role || '') + '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Department</label>' +
                        '<select id="editStaffDepartment" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                            '<option value="">None</option>' +
                            deptOptions +
                        '</select>' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Make Department Head</label>' +
                        '<select id="editStaffHead" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                            '<option value="false" ' + (member.isHead ? '' : 'selected') + '>No</option>' +
                            '<option value="true" ' + (member.isHead ? 'selected' : '') + '>Yes</option>' +
                        '</select>' +
                    '</div>' +
                '</div>';

            _openModal({
                title: 'Edit Staff Member: ' + char.name,
                content: content,
                confirmText: 'Save Changes',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var role = document.getElementById('editStaffRole').value.trim() || 'Staff';
                    var departmentId = document.getElementById('editStaffDepartment').value || null;
                    var isHead = document.getElementById('editStaffHead').value === 'true';

                    var updates = {
                        role: role,
                        departmentId: departmentId,
                        isHead: isHead,
                        type: 'staff'
                    };

                    var result = HC.updateMember(householdId, characterId, updates);

                    if (result && result.success) {
                        _showToast('Staff member updated', 'success');
                        _closeTopModal();
                        _processingAction = false;
                        renderHouseholdDepartmentsTab('tab-positions', householdId);
                        return true;
                    } else {
                        _showToast(result ? result.reason : 'Failed to update staff', 'error');
                        _processingAction = false;
                        return false;
                    }
                },
                onCancel: function() {
                    _processingAction = false;
                }
            });

        } catch (e) {
            _processingAction = false;
            _showToast('Error editing staff', 'error');
        }
    }

    function _confirmRemoveStaffFromDepartment(householdId, characterId, deptId) {
        var char = _getCharacterById(characterId);
        var charName = char ? (char.name + (char.surname ? ' ' + char.surname : '')) : 'Unknown';

        _confirmDialog('Remove ' + charName + ' from this department?', 'Remove from Department', function() {
            _doRemoveStaffFromDepartment(householdId, characterId);
        });
    }

    function _doRemoveStaffFromDepartment(householdId, characterId) {
        if (_processingAction) return;
        _processingAction = true;

        try {
            var HC = _getCommands();
            if (!HC) {
                _showToast('Household commands not available', 'error');
                _processingAction = false;
                return;
            }

            var result = HC.updateMember(householdId, characterId, {
                departmentId: null,
                isHead: false
            });

            if (result && result.success) {
                _showToast('Staff removed from department', 'info');
                _processingAction = false;
                renderHouseholdDepartmentsTab('tab-positions', householdId);
            } else {
                _showToast(result ? result.reason : 'Failed to remove staff', 'error');
                _processingAction = false;
            }

        } catch (e) {
            _processingAction = false;
            _showToast('Error removing staff', 'error');
        }
    }

    // =========================================================================
    // 10. POSITION MODALS
    // =========================================================================

    function _openCreatePositionModal(householdId, deptId) {
        if (_processingAction) return;
        _processingAction = true;

        try {
            var HC = _getCommands();
            if (!HC) {
                _showToast('Household commands not available', 'error');
                _processingAction = false;
                return;
            }

            var HS = _getState();
            var household = HS ? HS.getHousehold(householdId) : null;

            var deptOptions = '';
            if (household && household.departments) {
                deptOptions = household.departments.map(function(d) {
                    var selected = (d.id === deptId) ? 'selected' : '';
                    return '<option value="' + d.id + '" ' + selected + '>' + _escapeHtml(d.name) + '</option>';
                }).join('');
            }

            var content = '' +
                '<div style="margin-bottom:12px;">' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Position Name *</label>' +
                        '<input type="text" id="posName" placeholder="e.g., Butler, Cook, Maid" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Department</label>' +
                        '<select id="posDepartment" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                            '<option value="">None</option>' +
                            deptOptions +
                        '</select>' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Required Role (optional)</label>' +
                        '<input type="text" id="posRole" placeholder="e.g., Servant, Cook" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Minimum Skill Level</label>' +
                        '<input type="number" id="posMinSkill" value="0" min="0" max="100" style="width:80px;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Priority (lower = higher rank)</label>' +
                        '<input type="number" id="posPriority" value="10" min="1" max="100" style="width:80px;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Description</label>' +
                        '<input type="text" id="posDescription" placeholder="e.g., Responsible for meal preparation" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                    '</div>' +
                '</div>';

            _openModal({
                title: 'Create Position',
                content: content,
                confirmText: 'Create Position',
                cancelText: 'Cancel',
                onOpen: function() {
                    var nameInput = document.getElementById('posName');
                    if (nameInput) {
                        setTimeout(function() { nameInput.focus(); }, 100);
                    }
                },
                onConfirm: function() {
                    var name = document.getElementById('posName').value.trim();
                    var departmentId = document.getElementById('posDepartment').value || null;
                    var requiredRoleId = document.getElementById('posRole').value.trim() || null;
                    var minSkillLevel = parseInt(document.getElementById('posMinSkill').value) || 0;
                    var priority = parseInt(document.getElementById('posPriority').value) || 10;
                    var description = document.getElementById('posDescription').value.trim();

                    if (!name) {
                        _showToast('Position name is required', 'error');
                        _processingAction = false;
                        return false;
                    }

                    var result = HC.createPosition({
                        name: name,
                        householdId: householdId,
                        departmentId: departmentId,
                        requiredRoleId: requiredRoleId,
                        minSkillLevel: minSkillLevel,
                        priority: priority,
                        description: description
                    });

                    if (result && result.success) {
                        _showToast('Position "' + name + '" created', 'success');
                        _closeTopModal();
                        _processingAction = false;
                        renderHouseholdDepartmentsTab('tab-positions', householdId);
                        return true;
                    } else {
                        _showToast(result ? result.reason : 'Failed to create position', 'error');
                        _processingAction = false;
                        return false;
                    }
                },
                onCancel: function() {
                    _processingAction = false;
                }
            });

        } catch (e) {
            _processingAction = false;
            _showToast('Error creating position', 'error');
        }
    }

    function _openEditDepartmentModal(householdId, deptId) {
        if (_processingAction) return;
        _processingAction = true;

        try {
            var HS = _getState();
            var HC = _getCommands();
            if (!HS || !HC) {
                _showToast('Household system not available', 'error');
                _processingAction = false;
                return;
            }

            var household = HS.getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingAction = false;
                return;
            }

            var dept = null;
            for (var i = 0; i < household.departments.length; i++) {
                if (household.departments[i].id === deptId) {
                    dept = household.departments[i];
                    break;
                }
            }

            if (!dept) {
                _showToast('Department not found', 'error');
                _processingAction = false;
                return;
            }

            var headChar = dept.headId ? _getCharacterById(dept.headId) : null;
            var headName = headChar ? (headChar.name + (headChar.surname ? ' ' + headChar.surname : '')) : '';

            var content = '' +
                '<div style="margin-bottom:12px;">' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Department Name *</label>' +
                        '<input type="text" id="editDeptName" value="' + _escapeHtml(dept.name) + '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Department Head</label>' +
                        '<div style="display:flex;gap:6px;">' +
                            '<input type="text" id="editDeptHeadDisplay" value="' + _escapeHtml(headName) + '" placeholder="Select head..." readonly style="flex:1;padding:6px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;font-size:0.7rem;cursor:pointer;">' +
                            '<input type="hidden" id="editDeptHeadId" value="' + (dept.headId || '') + '">' +
                            '<button id="editDeptHeadSelectBtn" class="btn" style="font-size:0.55rem;padding:4px 10px;">Select</button>' +
                            '<button id="editDeptHeadClearBtn" class="btn" style="font-size:0.55rem;padding:4px 8px;">Clear</button>' +
                        '</div>' +
                    '</div>' +
                '</div>';

            _openModal({
                title: 'Edit Department: ' + dept.name,
                content: content,
                confirmText: 'Save Changes',
                cancelText: 'Cancel',
                onOpen: function() {
                    var selectBtn = document.getElementById('editDeptHeadSelectBtn');
                    var clearBtn = document.getElementById('editDeptHeadClearBtn');
                    var displayInput = document.getElementById('editDeptHeadDisplay');
                    var hiddenInput = document.getElementById('editDeptHeadId');

                    if (selectBtn) {
                        selectBtn.onclick = function(e) {
                            e.stopPropagation();
                            _openCharacterSelector({
                                title: 'Select Department Head',
                                filters: { showDeceased: false },
                                onSelect: function(character) {
                                    if (character) {
                                        displayInput.value = character.name + (character.surname ? ' ' + character.surname : '');
                                        hiddenInput.value = character.id;
                                        _showToast('Selected: ' + character.name, 'success');
                                    }
                                }
                            });
                        };
                    }

                    if (clearBtn) {
                        clearBtn.onclick = function(e) {
                            e.stopPropagation();
                            displayInput.value = '';
                            hiddenInput.value = '';
                        };
                    }
                },
                onConfirm: function() {
                    var name = document.getElementById('editDeptName').value.trim();
                    var headId = document.getElementById('editDeptHeadId').value || null;

                    if (!name) {
                        _showToast('Department name is required', 'error');
                        _processingAction = false;
                        return false;
                    }

                    var result = HC.updateDepartment(householdId, deptId, {
                        name: name,
                        headId: headId
                    });

                    if (result && result.success) {
                        _showToast('Department updated', 'success');
                        _closeTopModal();
                        _processingAction = false;
                        renderHouseholdDepartmentsTab('tab-positions', householdId);
                        return true;
                    } else {
                        _showToast(result ? result.reason : 'Failed to update department', 'error');
                        _processingAction = false;
                        return false;
                    }
                },
                onCancel: function() {
                    _processingAction = false;
                }
            });

        } catch (e) {
            _processingAction = false;
            _showToast('Error editing department', 'error');
        }
    }

    function _confirmDeleteDepartment(householdId, deptId) {
        var HS = _getState();
        var household = HS ? HS.getHousehold(householdId) : null;
        if (!household) return;

        var dept = null;
        for (var i = 0; i < household.departments.length; i++) {
            if (household.departments[i].id === deptId) {
                dept = household.departments[i];
                break;
            }
        }

        if (!dept) {
            _showToast('Department not found', 'error');
            return;
        }

        _confirmDialog('Delete department "' + dept.name + '"?\n\nThis will remove the department. Staff members will be unassigned from this department.', 'Delete Department', function() {
            _doDeleteDepartment(householdId, deptId);
        });
    }

    function _doDeleteDepartment(householdId, deptId) {
        if (_processingAction) return;
        _processingAction = true;

        try {
            var HC = _getCommands();
            if (!HC) {
                _showToast('Household commands not available', 'error');
                _processingAction = false;
                return;
            }

            var result = HC.removeDepartment(householdId, deptId, { transferMembers: true });

            if (result && result.success) {
                _showToast('Department deleted', 'info');
                _processingAction = false;
                renderHouseholdDepartmentsTab('tab-positions', householdId);
                if (typeof window.refreshHouseholdList === 'function') {
                    window.refreshHouseholdList();
                }
            } else {
                _showToast(result ? result.reason : 'Failed to delete department', 'error');
                _processingAction = false;
            }

        } catch (e) {
            _processingAction = false;
            _showToast('Error deleting department', 'error');
        }
    }

    function _openAddStaffToDepartmentModal(householdId, deptId) {
        if (_processingAction) return;
        _processingAction = true;

        try {
            var HS = _getState();
            var HC = _getCommands();
            if (!HS || !HC) {
                _showToast('Household system not available', 'error');
                _processingAction = false;
                return;
            }

            var household = HS.getHousehold(householdId);
            if (!household) {
                _showToast('Household not found', 'error');
                _processingAction = false;
                return;
            }

            var members = HS.getHouseholdMembersWithCharacters(householdId);
            var existingStaffIds = {};
            for (var i = 0; i < members.length; i++) {
                if (members[i].type === 'staff' && members[i].departmentId === deptId) {
                    existingStaffIds[members[i].characterId] = true;
                }
            }

            _openCharacterSelector({
                title: 'Add Staff to Department',
                filters: { showDeceased: false },
                excludeIds: Object.keys(existingStaffIds),
                onSelect: function(character) {
                    if (character) {
                        _doAddStaffToDepartment(householdId, deptId, character.id);
                    }
                }
            });

        } catch (e) {
            _processingAction = false;
            _showToast('Error opening staff selector', 'error');
        }
    }

    function _doAddStaffToDepartment(householdId, deptId, characterId) {
        if (_processingAction) return;
        _processingAction = true;

        try {
            var HS = _getState();
            var HC = _getCommands();
            if (!HS || !HC) {
                _showToast('Household commands not available', 'error');
                _processingAction = false;
                return;
            }

            var char = _getCharacterById(characterId);
            if (!char) {
                _showToast('Character not found', 'error');
                _processingAction = false;
                return;
            }

            var household = HS.getHousehold(householdId);
            var isMember = false;
            for (var i = 0; i < household.members.length; i++) {
                if (household.members[i].characterId === characterId) {
                    isMember = true;
                    break;
                }
            }

            if (isMember) {
                var result = HC.updateMember(householdId, characterId, {
                    departmentId: deptId,
                    type: 'staff'
                });

                if (result && result.success) {
                    _showToast(char.name + ' assigned to department', 'success');
                    _processingAction = false;
                    renderHouseholdDepartmentsTab('tab-positions', householdId);
                } else {
                    _showToast(result ? result.reason : 'Failed to assign to department', 'error');
                    _processingAction = false;
                }
            } else {
                var content = '' +
                    '<div style="margin-bottom:12px;">' +
                        '<div style="background:var(--bg3);padding:8px;border-radius:6px;margin-bottom:12px;font-size:0.6rem;">' +
                            'Adding: <strong>' + _escapeHtml(char.name + (char.surname ? ' ' + char.surname : '')) + '</strong> to department' +
                        '</div>' +
                        '<div class="form-group" style="margin-bottom:12px;">' +
                            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Role</label>' +
                            '<input type="text" id="addStaffRole" placeholder="e.g., Butler, Cook, Maid" value="Staff" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        '</div>' +
                        '<div class="form-group" style="margin-bottom:12px;">' +
                            '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Joined Year</label>' +
                            '<input type="number" id="addStaffYear" value="' + _getCurrentYear() + '" min="1" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                        '</div>' +
                    '</div>';

                _openModal({
                    title: 'Add Staff Member',
                    content: content,
                    confirmText: 'Add Staff',
                    cancelText: 'Cancel',
                    onConfirm: function() {
                        var role = document.getElementById('addStaffRole').value.trim() || 'Staff';
                        var year = parseInt(document.getElementById('addStaffYear').value) || _getCurrentYear();

                        var result = HC.addMember(householdId, characterId, 'staff', {
                            role: role,
                            joinedYear: year,
                            departmentId: deptId
                        });

                        if (result && result.success) {
                            _showToast(char.name + ' added as staff', 'success');
                            _closeTopModal();
                            _processingAction = false;
                            renderHouseholdDepartmentsTab('tab-positions', householdId);
                            if (typeof window.refreshHouseholdList === 'function') {
                                window.refreshHouseholdList();
                            }
                            return true;
                        } else {
                            _showToast(result ? result.reason : 'Failed to add staff', 'error');
                            _processingAction = false;
                            return false;
                        }
                    },
                    onCancel: function() {
                        _processingAction = false;
                    }
                });
            }

        } catch (e) {
            _processingAction = false;
            _showToast('Error adding staff', 'error');
        }
    }

    function _openAssignPositionModal(householdId, posId) {
        if (_processingAction) return;
        _processingAction = true;

        try {
            var HS = _getState();
            if (!HS) {
                _showToast('Household system not available', 'error');
                _processingAction = false;
                return;
            }

            var position = HS.getHouseholdPosition(posId);
            if (!position) {
                _showToast('Position not found', 'error');
                _processingAction = false;
                return;
            }

            if (typeof window.openAssignStaffToHouseholdPositionModal === 'function') {
                window.openAssignStaffToHouseholdPositionModal(householdId, posId, function() {
                    _processingAction = false;
                    renderHouseholdDepartmentsTab('tab-positions', householdId);
                });
            } else if (typeof window._openAssignStaffToHouseholdPositionModal === 'function') {
                window._openAssignStaffToHouseholdPositionModal(householdId, posId, function() {
                    _processingAction = false;
                    renderHouseholdDepartmentsTab('tab-positions', householdId);
                });
            } else {
                _showToast('Assignment modal not available', 'error');
                _processingAction = false;
            }

        } catch (e) {
            _processingAction = false;
            _showToast('Error opening assignment', 'error');
        }
    }

    function _openEditPositionModal(householdId, posId) {
        if (_processingAction) return;
        _processingAction = true;

        try {
            var HS = _getState();
            var HC = _getCommands();
            if (!HS || !HC) {
                _showToast('Household system not available', 'error');
                _processingAction = false;
                return;
            }

            var position = HS.getHouseholdPosition(posId);
            if (!position) {
                _showToast('Position not found', 'error');
                _processingAction = false;
                return;
            }

            var household = HS.getHousehold(householdId);
            var deptOptions = '';
            if (household && household.departments) {
                deptOptions = household.departments.map(function(d) {
                    var selected = (d.id === position.departmentId) ? 'selected' : '';
                    return '<option value="' + d.id + '" ' + selected + '>' + _escapeHtml(d.name) + '</option>';
                }).join('');
            }

            var content = '' +
                '<div style="margin-bottom:12px;">' +
                    '<div style="background:var(--bg3);padding:8px;border-radius:6px;margin-bottom:12px;font-size:0.6rem;">' +
                        'Editing: <strong>' + _escapeHtml(position.name) + '</strong>' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Position Name *</label>' +
                        '<input type="text" id="editPosName" value="' + _escapeHtml(position.name) + '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Department</label>' +
                        '<select id="editPosDepartment" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                            '<option value="">None</option>' +
                            deptOptions +
                        '</select>' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Required Role</label>' +
                        '<input type="text" id="editPosRole" value="' + _escapeHtml(position.requiredRoleId || '') + '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Minimum Skill Level</label>' +
                        '<input type="number" id="editPosMinSkill" value="' + (position.minSkillLevel || 0) + '" min="0" max="100" style="width:80px;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Priority</label>' +
                        '<input type="number" id="editPosPriority" value="' + (position.priority || 10) + '" min="1" max="100" style="width:80px;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                    '</div>' +
                    '<div class="form-group" style="margin-bottom:12px;">' +
                        '<label style="display:block;font-size:0.7rem;color:var(--accent);margin-bottom:4px;">Description</label>' +
                        '<input type="text" id="editPosDescription" value="' + _escapeHtml(position.description || '') + '" style="width:100%;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">' +
                    '</div>' +
                '</div>';

            _openModal({
                title: 'Edit Position: ' + position.name,
                content: content,
                confirmText: 'Save Changes',
                cancelText: 'Cancel',
                onConfirm: function() {
                    var name = document.getElementById('editPosName').value.trim();
                    var departmentId = document.getElementById('editPosDepartment').value || null;
                    var requiredRoleId = document.getElementById('editPosRole').value.trim() || null;
                    var minSkillLevel = parseInt(document.getElementById('editPosMinSkill').value) || 0;
                    var priority = parseInt(document.getElementById('editPosPriority').value) || 10;
                    var description = document.getElementById('editPosDescription').value.trim();

                    if (!name) {
                        _showToast('Position name is required', 'error');
                        _processingAction = false;
                        return false;
                    }

                    var result = HC.updatePosition(posId, {
                        name: name,
                        departmentId: departmentId,
                        requiredRoleId: requiredRoleId,
                        minSkillLevel: minSkillLevel,
                        priority: priority,
                        description: description
                    });

                    if (result && result.success) {
                        _showToast('Position updated', 'success');
                        _closeTopModal();
                        _processingAction = false;
                        renderHouseholdDepartmentsTab('tab-positions', householdId);
                        return true;
                    } else {
                        _showToast(result ? result.reason : 'Failed to update position', 'error');
                        _processingAction = false;
                        return false;
                    }
                },
                onCancel: function() {
                    _processingAction = false;
                }
            });

        } catch (e) {
            _processingAction = false;
            _showToast('Error editing position', 'error');
        }
    }

    function _confirmDeletePosition(householdId, posId) {
        var HS = _getState();
        var position = HS ? HS.getHouseholdPosition(posId) : null;
        if (!position) {
            _showToast('Position not found', 'error');
            return;
        }

        _confirmDialog('Delete position "' + position.name + '"?\n\nThis will permanently remove the position and all assignments.', 'Delete Position', function() {
            _doDeletePosition(householdId, posId);
        });
    }

    function _doDeletePosition(householdId, posId) {
        if (_processingAction) return;
        _processingAction = true;

        try {
            var HC = _getCommands();
            if (!HC) {
                _showToast('Household commands not available', 'error');
                _processingAction = false;
                return;
            }

            var result = HC.deletePosition(posId, { removeAssignments: true });

            if (result && result.success) {
                _showToast('Position deleted', 'info');
                _processingAction = false;
                renderHouseholdDepartmentsTab('tab-positions', householdId);
            } else {
                _showToast(result ? result.reason : 'Failed to delete position', 'error');
                _processingAction = false;
            }

        } catch (e) {
            _processingAction = false;
            _showToast('Error deleting position', 'error');
        }
    }

    // =========================================================================
    // 11. REFRESH FUNCTION
    // =========================================================================

    function refreshHouseholdDepartmentsTab(householdId) {
        var containerId = 'tab-positions';
        var container = document.getElementById(containerId);
        if (!container) {
            var containers = document.querySelectorAll('.tab-pane[id*="position"], .tab-pane[id*="department"]');
            for (var i = 0; i < containers.length; i++) {
                if (containers[i].id) {
                    containerId = containers[i].id;
                    container = containers[i];
                    break;
                }
            }
        }

        if (!container) {
            console.warn('[DepartmentsTab] Container not found');
            return;
        }

        renderHouseholdDepartmentsTab(containerId, householdId);
    }

    // =========================================================================
    // 12. TAB SYSTEM REGISTRATION
    // =========================================================================
    //
    // The tab id is 'positions' (not 'departments'), matching the tab
    // file's own registerTabRenderer call and the container ID
    // `tab-positions` that the host HTML provides. Do not rename one
    // without renaming the other.

    function registerDepartmentsTabRenderer() {
        if (typeof window.registerTabRenderer === 'function') {
            window.registerTabRenderer('positions', function(containerId, locationId, summary) {
                var householdId = _getCurrentHouseholdId();
                if (!householdId) {
                    var container = document.getElementById(containerId);
                    if (container) {
                        container.innerHTML = '<div class="placeholder">No household selected</div>';
                    }
                    return;
                }
                renderHouseholdDepartmentsTab(containerId, householdId);
            }, true);
            console.log('[HouseholdDepartmentsTab] Registered with tab system');
        }
    }

    // =========================================================================
    // 13. EXPORTS
    // =========================================================================

    window.renderHouseholdDepartmentsTab = renderHouseholdDepartmentsTab;
    window.refreshHouseholdDepartmentsTab = refreshHouseholdDepartmentsTab;
    window.registerDepartmentsTabRenderer = registerDepartmentsTabRenderer;

    // Auto-register if tab system is available
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(registerDepartmentsTabRenderer, 100);
        });
    } else {
        setTimeout(registerDepartmentsTabRenderer, 100);
    }

})();
