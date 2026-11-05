// js/households/household-manager-bootstrap.js
/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD MANAGER BOOTSTRAP (household-manager-bootstrap.js)
 * =============================================================================
 *
 * LOCATION: js/households/household-manager-bootstrap.js
 *
 * PURPOSE
 * -------
 * The ONLY orchestrator for HouseholdManager.html. Configures TabManager,
 * hydrates HouseholdState, wires the sidebar + topbar, and renders the
 * initial tab.
 *
 * Loaded LAST, after every household-*-tab.js file has self-registered.
 *
 * TAB ROSTER
 * ----------
 *   details      overview      Household header, head, residence, actions
 *   members      members       Current + former members, transfer, edit
 *   positions    departments   Departments, positions, assignments
 *   economy      economy       Wealth, debt, resources, income, expenses
 *   holdings     holdings      Enterprises, private schools, residences
 *   activity     activity      Chronological filterable event timeline
 *
 * TABMANAGER CONTRACT HIGHLIGHTS
 * ------------------------------
 *   1. containerRoot MUST contain both the tab strip and the pane
 *      container. TabManager's click router walks up from the click
 *      target asking each configured scope's containerRoot.contains(btn).
 *      If containerRoot is only #panelContent, clicks on the strip are
 *      not routed. We use strip.parentNode (the .main-panel), which is
 *      the .app-layout child containing both the strip and the panes.
 *
 *   2. TabManager does NOT toggle .active on panes. Its renderer contract
 *      is fn(container, context) — it fills the container but does not
 *      show it. setActiveTabId must call _syncTabStrip(), which toggles
 *      .active on the pane whose data-tab-content matches.
 *
 *   3. Hydrate the domain state BEFORE TabManager.configure. buildContext
 *      reads through queries that read through state. If state isn't
 *      hydrated, every tab renders empty.
 *
 *   4. init() is idempotent. Import/refresh topbar actions call init()
 *      again; the _initialized guard prevents double-configuration.
 *
 * DEPENDENCIES (verified at init time; init() catches its own throws
 * and writes a visible failure, per playbook §4 point 3):
 *   - tab-manager.js
 *   - storage.js, storage-schema.js
 *   - accessors.js
 *   - household-state.js, household-queries.js
 *   - household-tab-runtime.js
 *
 * =============================================================================
 */

(function () {
    'use strict';

    var SCOPE = 'households';

    // =========================================================================
    // 1. TAB ROSTER
    // =========================================================================

    var KNOWN_TAB_IDS = [
        'details',     // overview
        'members',     // members
        'positions',   // departments
        'economy',     // economy
        'holdings',    // holdings
        'activity'     // activity
    ];
    var DEFAULT_ACTIVE_TAB_ID = 'details';

    // =========================================================================
    // 2. DEPENDENCY HELPERS
    // =========================================================================

    function _requireTabManager() {
        var TM = window.TabManager;
        if (!TM
            || typeof TM.configure !== 'function'
            || typeof TM.register !== 'function'
            || typeof TM.init !== 'function'
            || typeof TM.renderActive !== 'function'
            || typeof TM.requestRender !== 'function') {
            throw new Error(
                'household-manager-bootstrap: TabManager is missing or ' +
                'incomplete. Load js/core/tab-manager.js first.');
        }
        return TM;
    }

    function _requireState() {
        if (!window.HouseholdState
            || typeof window.HouseholdState.hydrateFromMasterData !== 'function') {
            throw new Error(
                'household-manager-bootstrap: HouseholdState is missing. ' +
                'Load js/households/household-state.js.');
        }
        return window.HouseholdState;
    }

    function _requireQueries() {
        if (!window.HouseholdQueries
            || typeof window.HouseholdQueries.getHousehold !== 'function') {
            throw new Error(
                'household-manager-bootstrap: HouseholdQueries is missing. ' +
                'Load js/households/household-queries.js.');
        }
        return window.HouseholdQueries;
    }

    function _requireRuntime() {
        if (!window.HouseholdTabRuntime) {
            throw new Error(
                'household-manager-bootstrap: HouseholdTabRuntime is missing. ' +
                'Load js/households/household-tab-runtime.js.');
        }
        return window.HouseholdTabRuntime;
    }

    // =========================================================================
    // 3. SELECTION (bootstrap-local; not via runtime to avoid a dependency
    //    cycle during the very first render)
    // =========================================================================

    function _getSelectedHouseholdId() {
        var HS = window.HouseholdState;
        if (HS && typeof HS.getUIState === 'function') {
            try {
                var s = HS.getUIState();
                if (s && typeof s.selectedHouseholdId === 'string'
                    && s.selectedHouseholdId.length > 0) {
                    return s.selectedHouseholdId;
                }
            } catch (e) { /* fall through */ }
        }
        return null;
    }

    function _setSelectedHouseholdId(id) {
        var HS = window.HouseholdState;
        if (HS && typeof HS.setSelectedHousehold === 'function') {
            try {
                HS.setSelectedHousehold(id);
                return;
            } catch (e) { /* fall through */ }
        }
        // Fallback to the facade setter.
        if (HS) {
            try { HS.selectedHouseholdId = id; }
            catch (e) { /* no-op */ }
        }
    }

    function _pickInitialHouseholdId() {
        var Q = window.HouseholdQueries;
        if (!Q || typeof Q.getAllHouseholds !== 'function') return null;
        var all;
        try { all = Q.getAllHouseholds() || []; }
        catch (e) { all = []; }
        if (all.length === 0) return null;
        return all[0].id;
    }

    // =========================================================================
    // 4. CONTEXT BUILDER
    // =========================================================================

    function _buildContext() {
        var runtime = _requireRuntime();
        var householdId = _getSelectedHouseholdId();
        if (!householdId) return null;

        var summary = runtime.getHousehold(householdId);
        if (!summary) return null;

        return {
            householdId: householdId,
            householdName: summary.name || 'Unnamed Household',
            householdState: {
                summary: summary,
                currentYear: runtime.requireCurrentYear()
            }
        };
    }

    // =========================================================================
    // 5. EMPTY-STATE BUILDER (called by TabManager before renderer)
    // =========================================================================

    function _buildEmptyState(tabId, reason) {
        if (reason === 'no-context') {
            return '<div class="empty-state">' +
                'Select a household from the sidebar.' +
            '</div>';
        }
        if (reason === 'no-renderer') {
            return '<div class="empty-state">' +
                'The "' + _escSafe(tabId) + '" tab is not loaded. ' +
                'Check script order.' +
            '</div>';
        }
        if (reason === 'no-container') {
            return '<div class="empty-state" style="color:var(--danger);">' +
                'Missing pane element for tab "' + _escSafe(tabId) + '". ' +
                'Check the HTML shell.' +
            '</div>';
        }
        return '';
    }

    function _escSafe(v) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(v);
        if (v === null || v === undefined) return '';
        return String(v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // =========================================================================
    // 6. TAB STRIP + PANE SYNC (the load-bearing fix)
    // =========================================================================
    //
    // TabManager does NOT toggle .active on panes. Its renderer contract
    // is fn(container, context) — the container is filled but not shown.
    // Without this sync, the strip highlights the correct tab but the
    // pane below stays display:none.

    function _syncTabStrip(tabId) {
        // Strip buttons
        var strip = document.getElementById(SCOPE + 'TabStrip');
        if (strip) {
            var buttons = strip.querySelectorAll('[data-tab]');
            for (var i = 0; i < buttons.length; i++) {
                var btn = buttons[i];
                var isActive = btn.getAttribute('data-tab') === tabId;
                if (isActive) btn.classList.add('active');
                else btn.classList.remove('active');
                btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
                btn.setAttribute('tabindex', isActive ? '0' : '-1');
            }
        }
        // Panes
        var wrapper = document.getElementById('panelContent');
        if (wrapper) {
            var panes = wrapper.querySelectorAll('[data-tab-content]');
            for (var p = 0; p < panes.length; p++) {
                var pane = panes[p];
                var match = pane.getAttribute('data-tab-content') === tabId;
                if (match) pane.classList.add('active');
                else pane.classList.remove('active');
            }
        }
    }

    // =========================================================================
    // 7. CONTAINER ROOT RESOLVER
    // =========================================================================
    //
    // MUST contain both the strip and the panes. See §4 point 1.
    // The strip's parentNode (the .main-panel) contains both.

    function _resolveContainerRoot() {
        var strip = document.getElementById(SCOPE + 'TabStrip');
        if (strip && strip.parentNode) return strip.parentNode;
        // Fallback: the layout root. This is a last resort — the strip
        // is the natural anchor.
        var layout = document.querySelector('.app-layout');
        if (layout) return layout;
        return document.body;
    }

    // =========================================================================
    // 8. SIDEBAR
    // =========================================================================
    //
    // The sidebar is the household list. It reads through
    // HouseholdQueries, not HouseholdState. Selection is persisted via
    // HouseholdState.setSelectedHousehold, which triggers
    // requestRender for the active tab.

    function _setupSidebar() {
        var listEl = document.getElementById('householdListContainer');
        if (!listEl) return;

        // Initial render.
        _renderSidebarList();

        // Re-render on selection change (selection writes to the state
        // store, which fires uiStateChange). This is the household
        // subsystem's existing event channel — the list panel uses the
        // same channel to re-render.
        var HS = window.HouseholdState;
        if (HS && typeof HS.subscribe === 'function') {
            HS.subscribe(function (event) {
                if (!event || typeof event.type !== 'string') return;
                if (event.type === 'uiStateChange'
                    && event.detail && event.detail.key === 'selectedHouseholdId') {
                    _renderSidebarList();
                    _requestRenderActive();
                } else if (event.type === 'householdsReplaced'
                    || event.type === 'refreshed'
                    || event.type === 'cacheInvalidated') {
                    _renderSidebarList();
                    _requestRenderActive();
                }
            });
        }

        // Delegated click on the list.
        listEl.addEventListener('click', function (e) {
            var item = e.target && e.target.closest
                ? e.target.closest('.hh-sidebar-item') : null;
            if (!item) return;
            var id = item.getAttribute('data-household-id');
            if (!id) return;
            _setSelectedHouseholdId(id);
            _renderSidebarList();
            _requestRenderActive();
        });
    }

    function _requestRenderActive() {
        var TM = window.TabManager;
        if (!TM || typeof TM.renderActive !== 'function') return;
        try { TM.renderActive(SCOPE); }
        catch (e) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn('household-manager-bootstrap: renderActive failed', e);
            }
        }
    }

    function _renderSidebarList() {
        var listEl = document.getElementById('householdListContainer');
        if (!listEl) return;

        var Q = window.HouseholdQueries;
        if (!Q) {
            listEl.innerHTML = '<div class="hh-failure" style="padding:8px;font-size:0.65rem;">' +
                'HouseholdQueries is not loaded.' +
            '</div>';
            return;
        }

        var all;
        try { all = Q.getAllHouseholds() || []; }
        catch (e) { all = []; }

        if (all.length === 0) {
            listEl.innerHTML = '<div class="hh-empty" style="padding:16px;">' +
                'No households yet.' +
            '</div>';
            return;
        }

        // Sort by name.
        all.sort(function (a, b) {
            return String(a.name || '').localeCompare(String(b.name || ''));
        });

        var selectedId = _getSelectedHouseholdId();
        var html = '<div class="hh-sidebar-list">';
        for (var i = 0; i < all.length; i++) {
            var h = all[i];
            var status = _safeStatus(h.id);
            var isActive = h.id === selectedId;
            html += _renderSidebarItem(h, status, isActive);
        }
        html += '</div>';
        listEl.innerHTML = html;
    }

    function _safeStatus(householdId) {
        var Q = window.HouseholdQueries;
        if (!Q || typeof Q.getHouseholdStatus !== 'function') {
            return { status: 'active', livingCount: 0, totalMembers: 0 };
        }
        try { return Q.getHouseholdStatus(householdId) || { status: 'active' }; }
        catch (e) { return { status: 'active' }; }
    }

    function _renderSidebarItem(h, status, isActive) {
        var e = _escSafe;
        var statusClass = 'hh-sidebar-status-' + (status.status || 'active');
        return '' +
            '<div class="hh-sidebar-item' + (isActive ? ' active' : '') + '"' +
                ' data-household-id="' + e(h.id) + '">' +
                '<div class="hh-sidebar-item-name">' + e(h.name) + '</div>' +
                '<div class="hh-sidebar-item-meta">' +
                    '<span class="' + statusClass + '">' +
                        e(_statusLabel(status.status)) +
                    '</span>' +
                    '<span class="hh-sidebar-item-count">' +
                        (status.livingCount || 0) + ' living' +
                    '</span>' +
                '</div>' +
            '</div>';
    }

    function _statusLabel(status) {
        switch (status) {
            case 'active': return 'Active';
            case 'vacant': return 'Vacant';
            case 'empty': return 'Empty';
            case 'declining': return 'Declining';
            case 'deprecated': return 'Deprecated';
            case 'destroyed': return 'Destroyed';
            case 'bankrupt': return 'Bankrupt';
            default: return 'Unknown';
        }
    }

    // =========================================================================
    // 9. TOPBAR
    // =========================================================================

    function _setupTopBar() {
        _wireTopBarButton('refreshBtn', function () {
            _refreshAll();
        });
        _wireTopBarButton('importBtn', function () {
            var fileInput = document.getElementById('fileInput');
            if (fileInput) fileInput.click();
        });
        _wireTopBarButton('exportBtn', function () {
            _exportMasterData();
        });
        var fileInput = document.getElementById('fileInput');
        if (fileInput) {
            fileInput.addEventListener('change', _handleImportFile);
        }
        // Year input.
        var yearInput = document.getElementById('yearInput');
        if (yearInput && typeof window.getCurrentYear === 'function') {
            try { yearInput.value = window.getCurrentYear(); }
            catch (e) { /* no-op */ }
        }
        _wireTopBarButton('setYearBtn', function () {
            var yi = document.getElementById('yearInput');
            if (!yi) return;
            var y = parseInt(yi.value, 10);
            if (!isFinite(y)) return;
            if (window.masterData && window.masterData.data) {
                window.masterData.data.currentYear = y;
                if (typeof window.saveMasterData === 'function') {
                    window.saveMasterData();
                }
                _requestRenderActive();
                _renderSidebarList();
            }
        });
    }

    function _wireTopBarButton(id, fn) {
        var btn = document.getElementById(id);
        if (!btn) return;
        btn.addEventListener('click', fn);
    }

    function _refreshAll() {
        var HS = window.HouseholdState;
        if (HS && typeof HS.refresh === 'function') {
            try { HS.refresh(); } catch (e) { /* no-op */ }
        }
        _renderSidebarList();
        _requestRenderActive();
    }

    function _exportMasterData() {
        if (!window.masterData) return;
        try {
            var json = JSON.stringify(window.masterData, null, 2);
            var blob = new Blob([json], { type: 'application/json' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'stillwaters-households-' + Date.now() + '.json';
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('household-manager-bootstrap: export failed', e);
            }
        }
    }

    function _handleImportFile(event) {
        var file = event.target.files && event.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (e) {
            try {
                var parsed = JSON.parse(e.target.result);
                if (parsed && parsed.data) {
                    window.masterData = parsed;
                    if (typeof window.saveMasterData === 'function') {
                        window.saveMasterData();
                    }
                    if (window.HouseholdState
                        && typeof window.HouseholdState.refresh === 'function') {
                        window.HouseholdState.refresh();
                    }
                    _refreshAll();
                }
            } catch (err) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('household-manager-bootstrap: import failed', err);
                }
            }
        };
        reader.readAsText(file);
    }

    // =========================================================================
    // 10. TAB STRIP WIRING (delegated, on the strip container)
    // =========================================================================

    function _wireTabStrip() {
        var strip = document.getElementById(SCOPE + 'TabStrip');
        if (!strip) return;
        strip.addEventListener('click', function (e) {
            var btn = e.target && e.target.closest
                ? e.target.closest('[data-tab]') : null;
            if (!btn || !strip.contains(btn)) return;
            var tabId = btn.getAttribute('data-tab');
            if (!tabId) return;
            var TM = window.TabManager;
            if (TM && typeof TM.render === 'function') {
                try {
                    TM.render(SCOPE, tabId);
                    _syncTabStrip(tabId);
                } catch (err) {
                    if (typeof console !== 'undefined' && console.warn) {
                        console.warn('household-manager-bootstrap: tab click failed', err);
                    }
                }
            }
        });
    }

    // =========================================================================
    // 11. INIT
    // =========================================================================

    var _initialized = false;

    function init() {
        if (_initialized) return;
        _initialized = true;

        var TabManager, HS, Q, runtime;
        try {
            TabManager = _requireTabManager();
            HS = _requireState();
            Q = _requireQueries();
            runtime = _requireRuntime();
        } catch (depErr) {
            var errEl = document.getElementById('emptyStateText');
            if (errEl) {
                errEl.innerHTML =
                    '<div class="hh-failure" style="padding:16px;">' +
                    '<strong>Household Manager cannot start.</strong><br>' +
                    _escSafe(depErr && depErr.message ? depErr.message : 'Missing dependency') +
                    '</div>';
            }
            if (typeof console !== 'undefined' && console.error) {
                console.error('household-manager-bootstrap.init:', depErr);
            }
            return;
        }

        // Hydrate the domain state BEFORE configuring TabManager.
        try {
            if (typeof window.initializeStorage === 'function') window.initializeStorage();
            if (typeof window.loadMasterData === 'function') window.loadMasterData();
        } catch (storageErr) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn('household-manager-bootstrap: storage init failed', storageErr);
            }
        }

        try {
            HS.hydrateFromMasterData();
        } catch (hydrateErr) {
            var errEl2 = document.getElementById('emptyStateText');
            if (errEl2) {
                errEl2.innerHTML =
                    '<div class="hh-failure" style="padding:16px;">' +
                    '<strong>Household state failed to hydrate.</strong><br>' +
                    _escSafe(hydrateErr && hydrateErr.message ? hydrateErr.message : 'Unknown') +
                    '</div>';
            }
            return;
        }

        // Configure TabManager.
        TabManager.configure(SCOPE, {
            containerRoot: _resolveContainerRoot(),
            resolveContainer: function (tabId) {
                return document.getElementById(SCOPE + '-pane-' + tabId);
            },
            buildContext: _buildContext,
            getActiveTabId: function () {
                // TabManager owns active-tab state; we mirror it back.
                var TM = window.TabManager;
                if (TM && typeof TM.getActiveTab === 'function') {
                    return TM.getActiveTab(SCOPE);
                }
                return DEFAULT_ACTIVE_TAB_ID;
            },
            setActiveTabId: function (tabId) {
                _syncTabStrip(tabId);
            },
            buildEmptyState: _buildEmptyState
        });

        TabManager.init();
        _setupSidebar();
        _setupTopBar();
        _wireTabStrip();

        // Pick an initial household if none is selected.
        var initialId = _getSelectedHouseholdId() || _pickInitialHouseholdId();
        if (initialId) _setSelectedHouseholdId(initialId);

        // Render.
        _syncTabStrip(DEFAULT_ACTIVE_TAB_ID);
        TabManager.renderActive(SCOPE);
        _renderSidebarList();

        if (typeof console !== 'undefined' && console.log) {
            console.log('[HouseholdManagerBootstrap] initialized');
        }
    }

    // =========================================================================
    // 12. EXPORTS + AUTO-INIT
    // =========================================================================

    window.HouseholdManagerBootstrap = { init: init };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.HouseholdManagerBootstrap;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
