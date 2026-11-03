// js/tabs/government-departments-tab.js
/**
 * =============================================================================
 * GOVERNMENT DEPARTMENTS TAB
 * =============================================================================
 *
 * LOCATION: js/tabs/government-departments-tab.js
 *
 * PURPOSE:
 *   Renders the Government Departments view for a location and delegates
 *   every CRUD action to the canonical Government modals.
 *
 * ARCHITECTURE:
 *   This tab is a THIN SHELL. It does not own domain logic. It does not
 *   reimplement department cards, position cards, budget math, role
 *   lookup, character lookup, or any modal. Every one of those already
 *   exists in the canonical modules and is imported below.
 *
 *   - Reads       → GovernmentQueries (departments, positions)
 *                 → SettlementQueries (salary budget allocation)
 *   - Calculation → GovernmentEconomy (salary requirement per department)
 *   - Shaping     → GovernmentViewModels (list item view models)
 *   - Painting    → GovernmentUI (list renderer)
 *   - Writes      → modals-government-*.js (which call GovernmentCommands
 *                   and Commands.persist internally)
 *
 *   The tab never writes canonical data. The tab never calls saveMasterData.
 *   The tab never calls State.hydrateFromMasterData (Commands' commit tail
 *   does that).
 *
 * SALARY BUDGET:
 *   allocated  = SettlementQueries.getGovernmentSalaryBudget(locationId)
 *                (null when no settlement record exists or the field
 *                 has never been set — distinct from 0)
 *   required   = sum over departments of
 *                GovernmentEconomy.calculateDepartmentSalaryRequirements(deptId)
 *                .totalSalaryRequirement
 *
 *   The strip renders both plus a surplus/shortfall badge. When
 *   `allocated` is null, the strip shows "settlement data unavailable"
 *   in place of the surplus/shortfall — not a fabricated 0.
 *
 * MODALS:
 *   Every action delegates to a function exported by:
 *     modals-government-departments.js
 *     modals-government-positions.js
 *
 *   Each modal calls GovernmentCommands.* and Commands.persist() once.
 *   This tab does not duplicate any of that logic.
 *
 * LOAD ORDER (must be satisfied when this file loads):
 *   - government-queries.js
 *   - government-commands.js
 *   - government-economy.js
 *   - government-view-models.js
 *   - government-ui-list.js
 *   - modals-government-departments.js
 *   - modals-government-positions.js
 *   - settlement-queries.js        (salary budget allocation)
 *   - location-queries.js          (getPlaceSummary)
 *   - modals-core.js               (openModal, closeTopModal, confirmDialog)
 *   - ui.js                        (showToast)
 *   - formatting.js                (escapeHtml)
 *   - icons.js                     (Icons)
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. LOAD-TIME DEPENDENCY CHECKS
    // =========================================================================

    if (!window.GovernmentQueries) {
        throw new Error(
            'government-departments-tab.js: government-queries.js must load first.'
        );
    }
    if (!window.GovernmentCommands) {
        throw new Error(
            'government-departments-tab.js: government-commands.js must load first.'
        );
    }
    if (!window.GovernmentEconomy) {
        throw new Error(
            'government-departments-tab.js: government-economy.js must load first.'
        );
    }
    if (!window.GovernmentViewModels) {
        throw new Error(
            'government-departments-tab.js: government-view-models.js must load first.'
        );
    }
    if (!window.GovernmentUI) {
        throw new Error(
            'government-departments-tab.js: government-ui-list.js must load first.'
        );
    }
    if (!window.SettlementQueries) {
        throw new Error(
            'government-departments-tab.js: settlement-queries.js must load first.'
        );
    }
    if (!window.LocationQueries) {
        throw new Error(
            'government-departments-tab.js: location-queries.js must load first.'
        );
    }

    // Modal functions — guarded at call time, not load time.
    // Each is exported by one of the modals-government-*.js files.
    // A missing function at click time shows a toast; the tab still renders.

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    var GQ = window.GovernmentQueries;
    var GVM = window.GovernmentViewModels;
    var GUI = window.GovernmentUI;
    var GE = window.GovernmentEconomy;
    var SQ = window.SettlementQueries;
    var LQ = window.LocationQueries;

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(str);
        }
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _getIcon(name) {
        if (typeof window._getIcon === 'function') return window._getIcon(name);
        return window.Icons && typeof window.Icons[name] === 'string'
            ? window.Icons[name]
            : '';
    }

    function _iconSpan(name) {
        var i = _getIcon(name);
        return i
            ? '<span style="display:inline-flex;align-items:center;vertical-align:middle;">' + i + '</span>'
            : '';
    }

    function _toast(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type || 'info');
        } else if (typeof window._showToast === 'function') {
            window._showToast(message, type || 'info');
        }
    }

    function _placeSummary(locationId) {
        if (!locationId) return null;
        return LQ.getPlaceSummary(locationId);
    }

    // =========================================================================
    // 3. DATA LOADERS
    // =========================================================================

    /**
     * Loads the department list for a location as view models.
     *
     * GovernmentQueries.getDepartmentsByLocation returns projections
     * (already carries locationName, positionCount, activeAssignmentCount,
     * rolePositionCount). GovernmentViewModels.toDepartmentListItems
     * shapes them into the list-item view model that GovernmentUI renders.
     *
     * Returns an empty array when the location has no departments.
     */
    function _loadDepartmentViewModels(locationId) {
        var departments = GQ.getDepartmentsByLocation(locationId, {});
        return GVM.toDepartmentListItems(departments, null);
    }

    /**
     * Loads the salary budget strip data for a location.
     *
     * Returns:
     *   {
     *     hasSettlement:  boolean,
     *     allocated:      number|null,
     *     required:       number,
     *     remaining:      number,
     *     shortfall:      number,
     *     departmentCount: number
     *   }
     *
     * `hasSettlement` is false when SettlementQueries has no record for
     * the location (or the location has never had a budget allocated).
     * In that case the strip renders a "settlement data unavailable"
     * message instead of a fabricated surplus/shortfall.
     *
     * The required total is computed by delegating per-department salary
     * math to GovernmentEconomy — the tab does not calculate salary
     * itself.
     */
    function _loadBudget(locationId) {
        var allocated = SQ.getGovernmentSalaryBudget(locationId);
        var departments = GQ.getDepartmentsByLocation(locationId, {});

        var required = 0;
        for (var i = 0; i < departments.length; i++) {
            var req = GE.calculateDepartmentSalaryRequirements(departments[i].id);
            if (req && typeof req.totalSalaryRequirement === 'number') {
                required += req.totalSalaryRequirement;
            }
        }

        var hasSettlement = allocated !== null && allocated !== undefined;

        if (!hasSettlement) {
            return {
                hasSettlement: false,
                allocated: null,
                required: required,
                remaining: 0,
                shortfall: 0,
                departmentCount: departments.length
            };
        }

        return {
            hasSettlement: true,
            allocated: allocated,
            required: required,
            remaining: Math.max(0, allocated - required),
            shortfall: Math.max(0, required - allocated),
            departmentCount: departments.length
        };
    }

    // =========================================================================
    // 4. HTML BUILDERS
    // =========================================================================

    function _buildHeader(place) {
        var name = place ? (place.displayName || place.name || '') : '';
        var addIcon = _iconSpan('PLUS');
        var refreshIcon = _iconSpan('REFRESH');

        return (
            '<div class="dept-tab-header">' +
                '<h3>Government Departments - ' + _escapeHtml(name) + '</h3>' +
                '<div class="dept-tab-actions">' +
                    '<button type="button" class="dept-btn dept-btn-add" ' +
                        'data-action="add-department">' +
                        addIcon + ' Add Department' +
                    '</button>' +
                    '<button type="button" class="dept-btn dept-btn-refresh" ' +
                        'data-action="refresh-depts">' +
                        refreshIcon + ' Refresh' +
                    '</button>' +
                '</div>' +
            '</div>'
        );
    }

    function _buildBudgetStrip(budget) {
        if (!budget) return '';

        var classes = 'dept-budget-summary';
        var allocatedLabel = '—';
        var surplusLabel = '—';
        var surplusClass = '';

        if (budget.hasSettlement) {
            allocatedLabel = budget.allocated.toLocaleString() + 'g';
            if (budget.shortfall > 0) {
                surplusLabel = budget.shortfall.toLocaleString() + 'g shortfall';
                surplusClass = 'dept-budget-shortfall';
            } else {
                surplusLabel = budget.remaining.toLocaleString() + 'g surplus';
                surplusClass = 'dept-budget-surplus';
            }
        } else {
            surplusLabel = 'settlement data unavailable';
            surplusClass = 'dept-budget-unavailable';
        }

        return (
            '<div class="' + classes + '">' +
                '<div class="dept-budget-item">' +
                    '<span class="dept-budget-label">Salary Budget</span>' +
                    '<span class="dept-budget-value">' + _escapeHtml(allocatedLabel) + '</span>' +
                '</div>' +
                '<div class="dept-budget-item">' +
                    '<span class="dept-budget-label">Required</span>' +
                    '<span class="dept-budget-value">' + budget.required.toLocaleString() + 'g</span>' +
                '</div>' +
                '<div class="dept-budget-item ' + surplusClass + '">' +
                    '<span class="dept-budget-label">' +
                        (budget.hasSettlement ? (budget.shortfall > 0 ? 'Shortfall' : 'Surplus') : 'Status') +
                    '</span>' +
                    '<span class="dept-budget-value">' + _escapeHtml(surplusLabel) + '</span>' +
                '</div>' +
                '<div class="dept-budget-item">' +
                    '<span class="dept-budget-label">Departments</span>' +
                    '<span class="dept-budget-value">' + budget.departmentCount + '</span>' +
                '</div>' +
            '</div>'
        );
    }

    function _buildEmptyState() {
        var addIcon = _iconSpan('PLUS');
        return (
            '<div class="dept-empty">' +
                '<p>No government departments found for this location.</p>' +
                '<button type="button" class="dept-btn dept-btn-add" ' +
                    'data-action="add-department">' +
                    addIcon + ' Create First Department' +
                '</button>' +
            '</div>'
        );
    }

    function _buildShell(place, departmentVms, budget) {
        if (!place) {
            return '<div class="dept-details-empty">Select a location to view government departments.</div>';
        }

        var hasDepartments = departmentVms && departmentVms.length > 0;

        return (
            '<div class="dept-tab-container">' +
                _buildHeader(place) +
                _buildBudgetStrip(budget) +
                (hasDepartments
                    ? '<div id="govDeptListMount"></div>'
                    : _buildEmptyState()) +
            '</div>'
        );
    }

    // =========================================================================
    // 5. RENDER
    // =========================================================================

    /**
     * Renders the departments tab for a location.
     *
     * @param {string} containerId  id of the container element
     * @param {string} locationId   location to render
     */
    function renderDepartmentsTab(containerId, locationId) {
        var container = document.getElementById(containerId);
        if (!container) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn('Departments tab container not found:', containerId);
            }
            return;
        }

        var place = locationId ? _placeSummary(locationId) : null;

        if (!place) {
            container.innerHTML = _buildShell(null, [], null);
            container.dataset.locationId = locationId || '';
            return;
        }

        var departmentVms = _loadDepartmentViewModels(place.id);
        var budget = _loadBudget(place.id);

        container.innerHTML = _buildShell(place, departmentVms, budget);
        container.dataset.locationId = locationId;

        // Mount the department list through GovernmentUI, if we have one.
        var listMount = container.querySelector('#govDeptListMount');
        if (listMount && departmentVms.length > 0) {
            GUI.renderDepartmentList(listMount, departmentVms, {
                showStats: true,
                showActions: true,
                onSelect: function (deptVm) {
                    if (!deptVm || !deptVm.id) return;
                    _openViewDepartment(deptVm.id, containerId, locationId);
                }
            });
        }

        _bindActions(container, containerId, locationId);
    }

    // =========================================================================
    // 6. ACTION BINDING
    // =========================================================================

    function _bindActions(container, containerId, locationId) {
        if (container._govDeptBound) return;
        container._govDeptBound = true;

        // Re-render closure used by every CRUD callback. Wrapped in
        // try/catch so a transient error during re-render does not
        // bubble out of the modal callback.
        function refresh() {
            try {
                renderDepartmentsTab(containerId, locationId);
            } catch (err) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('government-departments-tab: refresh failed', err);
                }
                _toast('Departments refresh failed; see console.', 'error');
            }
        }

        container.addEventListener('click', function (event) {
            var target = event.target.closest('[data-action]');
            if (!target) return;
            if (!container.contains(target)) return;

            var action = target.getAttribute('data-action');
            if (!action) return;

            // The list itself handles clicks inside department cards
            // (via GovernmentUI's delegated handler). We only intercept
            // the tab-level actions: add-department, refresh-depts.
            if (action === 'add-department') {
                event.preventDefault();
                _openAddDepartment(locationId, refresh);
                return;
            }

            if (action === 'refresh-depts') {
                event.preventDefault();
                refresh();
                _toast('Departments refreshed', 'info');
                return;
            }
        });
    }

    // =========================================================================
    // 7. MODAL DELEGATION
    // =========================================================================
    //
    // Every function below delegates to a modal that already exists in
    // modals-government-departments.js or modals-government-positions.js.
    // The tab does not open its own modals.

    function _openAddDepartment(locationId, refresh) {
        if (!locationId) {
            _toast('No location selected', 'warning');
            return;
        }
        if (typeof window.openCreateGovernmentDepartmentModal !== 'function') {
            _toast('Create-department modal unavailable', 'error');
            return;
        }
        window.openCreateGovernmentDepartmentModal(locationId, refresh);
    }

    function _openEditDepartment(deptId, refresh) {
        if (typeof window.openEditGovernmentDepartmentModal !== 'function') {
            _toast('Edit-department modal unavailable', 'error');
            return;
        }
        window.openEditGovernmentDepartmentModal(deptId, refresh);
    }

    function _openDeleteDepartment(deptId, refresh) {
        if (typeof window.openDeleteGovernmentDepartmentModal !== 'function') {
            _toast('Delete-department modal unavailable', 'error');
            return;
        }
        window.openDeleteGovernmentDepartmentModal(deptId, refresh);
    }

    function _openViewDepartment(deptId, containerId, locationId) {
        if (typeof window.openViewDepartmentDetailsModal !== 'function') {
            _toast('Department-details modal unavailable', 'error');
            return;
        }
        // The details modal opens its own Add Position / Edit / Delete
        // actions that route back through modals-government-*.js. When
        // it closes, refresh the tab.
        var refresh = function () {
            try {
                renderDepartmentsTab(containerId, locationId);
            } catch (err) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('government-departments-tab: refresh after details failed', err);
                }
            }
        };
        window.openViewDepartmentDetailsModal(deptId, refresh);
    }

    function _openAddPosition(deptId, refresh) {
        if (typeof window.openAddPositionModal !== 'function') {
            _toast('Add-position modal unavailable', 'error');
            return;
        }
        window.openAddPositionModal(deptId, refresh);
    }

    function _openEditPosition(deptId, positionId, refresh) {
        if (typeof window.openEditPositionModal !== 'function') {
            _toast('Edit-position modal unavailable', 'error');
            return;
        }
        window.openEditPositionModal(deptId, positionId, refresh);
    }

    function _openDeletePosition(deptId, positionId, refresh) {
        if (typeof window.openDeletePositionModal !== 'function') {
            _toast('Delete-position modal unavailable', 'error');
            return;
        }
        window.openDeletePositionModal(deptId, positionId, refresh);
    }

    function _openAssignStaff(deptId, positionId, refresh) {
        if (typeof window.openAssignCharacterToPositionModal !== 'function') {
            _toast('Assign-staff modal unavailable', 'error');
            return;
        }
        window.openAssignCharacterToPositionModal(deptId, positionId, refresh);
    }

    function _openRemoveAssignment(deptId, assignmentId, refresh) {
        if (typeof window.openRemoveAssignmentModal !== 'function') {
            _toast('Remove-assignment modal unavailable', 'error');
            return;
        }
        window.openRemoveAssignmentModal(deptId, assignmentId, refresh);
    }

    // =========================================================================
    // 8. REFRESH HELPER (public)
    // =========================================================================
    //
    // Callers (e.g. the GovernmentManager sub-tab host) can call this to
    // force a re-render without re-selecting a location.

    function refreshDepartmentsTab(locationId) {
        var container = document.querySelector('.dept-tab-container');
        if (container && container.parentElement) {
            renderDepartmentsTab(container.parentElement.id || 'panelContent', locationId);
            return;
        }
        // Fallback: search for the nearest container with an id.
        var candidates = document.querySelectorAll('.dept-tab-container, [data-tab-content]');
        for (var i = 0; i < candidates.length; i++) {
            var c = candidates[i];
            if (c.id) {
                renderDepartmentsTab(c.id, locationId);
                return;
            }
            var parent = c.parentElement;
            if (parent && parent.id) {
                renderDepartmentsTab(parent.id, locationId);
                return;
            }
        }
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.DepartmentsTab = {
        render: renderDepartmentsTab,
        refresh: refreshDepartmentsTab,
        // Exposed for tests / external callers that want to reuse the
        // budget computation without re-implementing it.
        _loadBudget: _loadBudget,
        _loadDepartmentViewModels: _loadDepartmentViewModels,
        // Modal delegations (exposed so any future tab that needs them
        // can call through a single point).
        _openAddDepartment: _openAddDepartment,
        _openEditDepartment: _openEditDepartment,
        _openDeleteDepartment: _openDeleteDepartment,
        _openViewDepartment: _openViewDepartment,
        _openAddPosition: _openAddPosition,
        _openEditPosition: _openEditPosition,
        _openDeletePosition: _openDeletePosition,
        _openAssignStaff: _openAssignStaff,
        _openRemoveAssignment: _openRemoveAssignment
    };

    window.renderDepartmentsTab = renderDepartmentsTab;
    window.refreshDepartmentsTab = refreshDepartmentsTab;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.DepartmentsTab;
    }
})();
