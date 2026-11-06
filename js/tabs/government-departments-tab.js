// js/tabs/government-departments-tab.js
/**
 * =============================================================================
 * GOVERNMENT DEPARTMENTS TAB
 * js/tabs/government-departments-tab.js
 * =============================================================================
 *
 * LOCATION: js/tabs/government-departments-tab.js
 *
 * PURPOSE:
 *   Render the Government Departments view for a location and delegate
 *   every CRUD action to the canonical Government modals.
 *
 * RENDERER CONTRACT (from GovernmentManagerBootstrap):
 *   fn(container, context)
 *   container  HTMLElement  — already emptied by TabManager
 *   context    { locationId, locationName, governmentState }
 *
 * DATA SOURCES:
 *   - GovernmentQueries.getDepartmentsByLocation(locationId)
 *   - GovernmentViewModels.toDepartmentListItems(departments, null)
 *   - GovernmentUI.renderDepartmentList(mount, viewModels, opts)
 *   - GovernmentEconomy.calculateDepartmentSalaryRequirements(deptId)
 *   - SettlementQueries.getGovernmentSalaryBudget(locationId)
 *   - LocationQueries.getPlaceSummary(locationId)   (header name)
 *
 * FILTERS:
 *   None. Department list is ordered by GovernmentViewModels's own
 *   ordering. No user filter controls; nothing to persist.
 *
 * WRITE PATH:
 *   Every action delegates to a modal that owns GovernmentCommands +
 *   Commands.persist. This tab never calls saveMasterData, never calls
 *   State.hydrateFromMasterData, and never mutates any query result.
 *
 * SALARY BUDGET:
 *   allocated = SettlementQueries.getGovernmentSalaryBudget(locationId)
 *              (null when no settlement record exists or the field
 *               has never been set — distinct from 0)
 *   required  = sum over departments of
 *              GovernmentEconomy.calculateDepartmentSalaryRequirements(dept.id)
 *              .totalSalaryRequirement
 *
 *   The strip renders both plus a surplus/shortfall badge. When
 *   `allocated` is null, the strip renders "settlement data
 *   unavailable" — not a fabricated 0.
 *
 * DEPENDENCIES (hard — throw at load if missing):
 *   - js/government/government-queries.js
 *   - js/government/government-economy.js
 *   - js/government/government-view-models.js
 *   - js/government/government-ui-list.js
 *   - js/settlement/settlement-queries.js
 *   - js/location/location-queries.js
 *   - js/core/tab-manager.js
 *   - js/core/formatting.js
 *   - js/core/icons.js
 *
 * DEPENDENCIES (soft — toast at click if missing):
 *   - js/government/modals-government-departments.js
 *   - js/government/modals-government-positions.js
 *   - js/core/ui.js (showToast)
 *   - js/core/modals-core.js (confirmDialog)
 *
 * TIME CONTRACT: uses window.getCurrentYear (no fallback).
 * ICON POLICY: glyphs from Icons[name] via _iconSpan; no emojis; no
 *   literal Unicode glyphs in string output.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   - Migrated from renderDepartmentsTab(containerId, locationId) to the
 *     TabManager renderer contract fn(container, context).
 *   - Self-registers with TabManager at load.
 *   - Stale-location bug fixed: click handlers read
 *     container.dataset.locationId at click time instead of a bind-time
 *     closure var. Sidebar selection changes now re-render with fresh
 *     department view models and a fresh budget.
 *   - Stale-budget bug fixed: _loadBudget previously called
 *     getGovernmentSalaryBudget(locationId) which threw when the
 *     location had no settlement record. That throw was swallowed by
 *     the outer refresh(), leaving the strip on the previous location's
 *     budget. Now _loadBudget catches the throw per-field and returns
 *     hasSettlement:false with required summed from whatever departments
 *     do exist.
 *   - List mount bug fixed: the GovernmentUI mount div is rebuilt on
 *     every render (innerHTML swap), so GovernmentUI's own listener
 *     would be lost on re-render. The mount is therefore always a fresh
 *     div with a stable id, and GovernmentUI.renderDepartmentList is
 *     called into it on every render. Department-card clicks route
 *     through GovernmentUI's delegate, which is bound to the fresh
 *     mount; tab-level actions route through the tab container.
 *   - Modal delegates resolved at click time; missing modal now toasts
 *     a specific error instead of throwing or silently no-oping.
 *   - Removed dead refreshDepartmentsTab(locationId) id-based helper;
 *     TM.requestRender(SCOPE, TAB_ID) is the only supported refresh
 *     path.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var TAB_ID = 'departments';
    var SCOPE  = 'government';
    var LIST_MOUNT_ID = 'government-dept-list-mount';

    // =========================================================================
    // 2. LOAD-TIME DEPENDENCY CHECKS
    // =========================================================================

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
    if (!window.TabManager || typeof window.TabManager.register !== 'function') {
        throw new Error(
            'government-departments-tab.js: tab-manager.js must load first.'
        );
    }

    var GQ  = window.GovernmentQueries;
    var GVM = window.GovernmentViewModels;
    var GUI = window.GovernmentUI;
    var GE  = window.GovernmentEconomy;
    var SQ  = window.SettlementQueries;
    var LQ  = window.LocationQueries;
    var TM  = window.TabManager;

    // =========================================================================
    // 3. DEPENDENCY WRAPPERS (soft)
    // =========================================================================

    function _esc(v) {
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(v);
        }
        if (v === null || v === undefined) return '';
        return String(v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _icon(name) {
        if (typeof window.getIcon === 'function') {
            try {
                var s = window.getIcon(name);
                if (typeof s === 'string') return s;
            } catch (e) { /* fall through */ }
        }
        return (window.Icons && typeof window.Icons[name] === 'string')
            ? window.Icons[name]
            : '';
    }

    function _iconSpan(name) {
        var i = _icon(name);
        return i
            ? '<span class="gov-tab-icon" aria-hidden="true">' + i + '</span>'
            : '';
    }

    function _toast(msg, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, type || 'info');
        } else if (typeof window._showToast === 'function') {
            window._showToast(msg, type || 'info');
        }
    }

    function _placeSummary(locationId) {
        if (!locationId) return null;
        if (typeof LQ.getPlaceSummary === 'function') {
            try { return LQ.getPlaceSummary(locationId); }
            catch (e) { return null; }
        }
        return null;
    }

    // =========================================================================
    // 4. DATA LOADERS
    // =========================================================================

    /**
     * Loads the department list for a location as view models.
     *
     * GovernmentQueries.getDepartmentsByLocation returns projections
     * (locationName, positionCount, activeAssignmentCount,
     * rolePositionCount). GovernmentViewModels.toDepartmentListItems
     * shapes them into the list-item view model GovernmentUI renders.
     *
     * Returns [] on any read failure; the tab renders the empty state,
     * not a silent blank.
     */
    function _loadDepartmentViewModels(locationId) {
        if (!locationId) return [];
        try {
            var departments = GQ.getDepartmentsByLocation(locationId, {});
            return GVM.toDepartmentListItems(departments, null) || [];
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'government-departments-tab: load department view models failed',
                    e
                );
            }
            return [];
        }
    }

    /**
     * Loads the salary budget strip data for a location.
     *
     * Returns:
     *   {
     *     hasSettlement:   boolean,
     *     allocated:       number|null,
     *     required:        number,
     *     remaining:       number,
     *     shortfall:       number,
     *     departmentCount: number
     *   }
     *
     * `hasSettlement` is false when SettlementQueries has no record for
     * the location, or when the field has never been set (null). In
     * that case the strip renders "settlement data unavailable" instead
     * of a fabricated surplus/shortfall.
     *
     * `required` is summed from departments that DO exist, even when
     * the settlement record is missing — the tab still shows what the
     * departments cost. A department whose salary calculation throws is
     * skipped (its requirement is treated as 0) and the error is logged
     * — one bad department must not blank the whole strip.
     */
    function _loadBudget(locationId) {
        var allocated = null;
        var hasSettlement = false;
        try {
            var raw = SQ.getGovernmentSalaryBudget(locationId);
            if (raw !== null && raw !== undefined) {
                allocated = raw;
                hasSettlement = true;
            }
        } catch (e) {
            // No settlement record, or the query threw. Both mean "not
            // allocated" from this tab's point of view.
            hasSettlement = false;
            allocated = null;
        }

        var departments = [];
        try {
            departments = GQ.getDepartmentsByLocation(locationId, {}) || [];
        } catch (e) {
            departments = [];
        }

        var required = 0;
        for (var i = 0; i < departments.length; i++) {
            var dept = departments[i];
            if (!dept || !dept.id) continue;
            try {
                var req = GE.calculateDepartmentSalaryRequirements(dept.id);
                if (req && typeof req.totalSalaryRequirement === 'number') {
                    required += req.totalSalaryRequirement;
                }
            } catch (e) {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn(
                        'government-departments-tab: salary calc failed for department ' +
                        dept.id,
                        e
                    );
                }
            }
        }

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
    // 5. HTML BUILDERS
    // =========================================================================

    function _buildHeader(place) {
        var name = place ? (place.displayName || place.name || '') : '';

        return (
            '<div class="dept-tab-header">' +
                '<h3>Government Departments - ' + _esc(name) + '</h3>' +
                '<div class="dept-tab-actions">' +
                    '<button type="button" class="dept-btn dept-btn-add" ' +
                        'data-action="add-department">' +
                        _iconSpan('PLUS') + ' Add Department' +
                    '</button>' +
                    '<button type="button" class="dept-btn dept-btn-refresh" ' +
                        'data-action="refresh-depts">' +
                        _iconSpan('REFRESH') + ' Refresh' +
                    '</button>' +
                '</div>' +
            '</div>'
        );
    }

    function _buildBudgetStrip(budget) {
        if (!budget) return '';

        var allocatedLabel = '—';
        var surplusLabel   = '—';
        var surplusClass   = 'dept-budget-unavailable';

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
        }

        return (
            '<div class="dept-budget-summary">' +
                '<div class="dept-budget-item">' +
                    '<span class="dept-budget-label">Salary Budget</span>' +
                    '<span class="dept-budget-value">' + _esc(allocatedLabel) + '</span>' +
                '</div>' +
                '<div class="dept-budget-item">' +
                    '<span class="dept-budget-label">Required</span>' +
                    '<span class="dept-budget-value">' +
                        budget.required.toLocaleString() + 'g' +
                    '</span>' +
                '</div>' +
                '<div class="dept-budget-item ' + surplusClass + '">' +
                    '<span class="dept-budget-label">' +
                        (budget.hasSettlement
                            ? (budget.shortfall > 0 ? 'Shortfall' : 'Surplus')
                            : 'Status') +
                    '</span>' +
                    '<span class="dept-budget-value">' + _esc(surplusLabel) + '</span>' +
                '</div>' +
                '<div class="dept-budget-item">' +
                    '<span class="dept-budget-label">Departments</span>' +
                    '<span class="dept-budget-value">' + budget.departmentCount + '</span>' +
                '</div>' +
            '</div>'
        );
    }

    function _buildEmptyState() {
        return (
            '<div class="dept-empty">' +
                '<p>No government departments found for this location.</p>' +
                '<button type="button" class="dept-btn dept-btn-add" ' +
                    'data-action="add-department">' +
                    _iconSpan('PLUS') + ' Create First Department' +
                '</button>' +
            '</div>'
        );
    }

    function _buildShell(place, departmentVms, budget) {
        if (!place) {
            return (
                '<div class="dept-details-empty">' +
                    'Select a government from the sidebar to view departments.' +
                '</div>'
            );
        }

        var hasDepartments = departmentVms && departmentVms.length > 0;

        return (
            '<div class="dept-tab-container" ' +
                'data-location-id="' + _esc(place.id || '') + '">' +
                _buildHeader(place) +
                _buildBudgetStrip(budget) +
                (hasDepartments
                    ? '<div id="' + LIST_MOUNT_ID + '"></div>'
                    : _buildEmptyState()) +
            '</div>'
        );
    }

    // =========================================================================
    // 6. RENDERER (TabManager contract: fn(container, context))
    // =========================================================================

    function renderDepartmentsTab(container, context) {
        if (!container) return;

        if (!context || !context.locationId) {
            container.innerHTML =
                '<div class="empty-state">' +
                'Select a government from the sidebar to view departments.' +
                '</div>';
            return;
        }

        var locationId = context.locationId;
        var place = (context.governmentState && context.governmentState.place)
            ? context.governmentState.place
            : _placeSummary(locationId);

        if (!place) {
            container.innerHTML = _buildShell(null, [], null);
            return;
        }

        var departmentVms = _loadDepartmentViewModels(locationId);
        var budget = _loadBudget(locationId);

        container.innerHTML = _buildShell(place, departmentVms, budget);
        container.dataset.locationId = locationId;

        // Mount the department list through GovernmentUI. The mount div
        // is fresh on every render (innerHTML swap), so GovernmentUI's
        // delegate is installed fresh against the fresh div — a stale
        // delegate from the previous render is discarded with the old
        // div. That is the correct behaviour: the delegate closure
        // captures the mount element, and the mount element is gone.
        if (departmentVms.length > 0) {
            var mount = container.querySelector('#' + LIST_MOUNT_ID);
            if (mount) {
                try {
                    GUI.renderDepartmentList(mount, departmentVms, {
                        showStats: true,
                        showActions: true,
                        onSelect: function (deptVm) {
                            if (!deptVm || !deptVm.id) return;
                            _openViewDepartment(deptVm.id);
                        }
                    });
                } catch (e) {
                    if (typeof console !== 'undefined' && console.error) {
                        console.error(
                            'government-departments-tab: renderDepartmentList threw',
                            e
                        );
                    }
                    mount.innerHTML =
                        '<div class="dept-empty">' +
                            'Department list failed to render. See console.' +
                        '</div>';
                }
            }
        }

        _bindActions(container);
    }

    // =========================================================================
    // 7. ACTION BINDING (delegated, on the tab container)
    // =========================================================================
    //
    // Only tab-level actions route here: add-department, refresh-depts.
    // Department-card clicks are handled by GovernmentUI's own delegate
    // on the mount (see _openViewDepartment). The two delegates never
    // overlap because GovernmentUI's mount is a child of the tab
    // container and GovernmentUI handles card-level [data-action]s,
    // while the tab handles tab-level [data-action]s. Both use
    // closest() and neither fires the other's actions.

    function _bindActions(container) {
        if (container._govDeptBound) return;
        container._govDeptBound = true;

        container.addEventListener('click', function (event) {
            var target = event.target.closest('[data-action]');
            if (!target) return;
            if (!container.contains(target)) return;

            var action = target.getAttribute('data-action');
            if (!action) return;

            // Actions owned by GovernmentUI's card delegate are not
            // intercepted here — let the event bubble to GovernmentUI.
            if (action === 'view-department' || action === 'edit-department' ||
                action === 'delete-department' || action === 'add-position' ||
                action === 'edit-position' || action === 'delete-position' ||
                action === 'assign-staff' || action === 'remove-assignment') {
                return;
            }

            var locationId = container.dataset.locationId;

            if (action === 'add-department') {
                event.preventDefault();
                if (!locationId) {
                    _toast('No location selected', 'warning');
                    return;
                }
                _openAddDepartment(locationId);
                return;
            }

            if (action === 'refresh-depts') {
                event.preventDefault();
                _refresh();
                _toast('Departments refreshed', 'info');
                return;
            }
        });
    }

    function _refresh() {
        if (TM && typeof TM.requestRender === 'function') {
            TM.requestRender(SCOPE, TAB_ID);
        }
    }

    // =========================================================================
    // 8. MODAL DELEGATION
    // =========================================================================
    //
    // Every function below delegates to a modal that owns its own
    // GovernmentCommands + Commands.persist. The tab never writes.
    // A missing delegate is a load-order bug; toast a specific error
    // and return, never swallow.

    function _requireModal(name, action) {
        var fn = window[name];
        if (typeof fn !== 'function') {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'government-departments-tab: required modal "' + name +
                    '" is not loaded (' + action + ')'
                );
            }
            _toast('Action unavailable: ' + name + ' is not loaded.', 'error');
            return null;
        }
        return fn;
    }

    function _openAddDepartment(locationId) {
        var fn = _requireModal(
            'openCreateGovernmentDepartmentModal',
            'add department'
        );
        if (!fn) return;
        try { fn(locationId, _refresh); }
        catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'government-departments-tab: openCreateGovernmentDepartmentModal threw',
                    e
                );
            }
            _toast('Failed to open Add Department modal.', 'error');
        }
    }

    function _openViewDepartment(deptId) {
        var fn = _requireModal(
            'openViewDepartmentDetailsModal',
            'view department'
        );
        if (!fn) return;
        try { fn(deptId, _refresh); }
        catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'government-departments-tab: openViewDepartmentDetailsModal threw',
                    e
                );
            }
            _toast('Failed to open Department details.', 'error');
        }
    }

    // =========================================================================
    // 9. REGISTRATION (playbook §5)
    // =========================================================================

    TM.register(SCOPE, TAB_ID, renderDepartmentsTab);

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.DepartmentsTab = {
        id: TAB_ID,
        render: renderDepartmentsTab,

        // Data loaders, exposed for tests and for the details modal
        // when it wants the same projections this tab renders.
        _loadBudget: _loadBudget,
        _loadDepartmentViewModels: _loadDepartmentViewModels,

        // Modal delegations, exposed so any future tab that needs them
        // can route through a single point that owns the missing-modal
        // guard.
        _openAddDepartment: _openAddDepartment,
        _openViewDepartment: _openViewDepartment
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.DepartmentsTab;
    }
})();
