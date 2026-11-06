// js/tabs/household-manager-bootstrap.js
/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD MANAGER BOOTSTRAP
 * =============================================================================
 *
 * LOCATION: js/tabs/household-manager-bootstrap.js
 *
 * The ONLY orchestrator for HouseholdManager.html. Configures
 * TabManager, hydrates HouseholdState, wires the sidebar + topbar, and
 * renders the initial tab.
 *
 * Loaded LAST, after every household-*-tab.js file has self-registered.
 *
 * TAB ROSTER
 *   details      overview
 *   members      members
 *   positions    departments
 *   economy      economy
 *   holdings     holdings
 *   activity     activity
 *
 * TABMANAGER CONTRACT HIGHLIGHTS
 *   1. containerRoot MUST contain both the tab strip and the pane
 *      container. We use strip.parentNode (the .main-panel).
 *   2. TabManager does NOT toggle .active on panes. setActiveTabId
 *      must call _syncTabStrip.
 *   3. Hydrate domain state before TabManager.configure.
 *   4. init() is idempotent.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    var SCOPE = 'households';

    var KNOWN_TAB_IDS = [
        'details', 'members', 'positions',
        'economy', 'holdings', 'activity'
    ];
    var DEFAULT_ACTIVE_TAB_ID = 'details';

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
                'Load js/tabs/household-tab-runtime.js.');
        }
        return window.HouseholdTabRuntime;
    }

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

    function _syncTabStrip(tabId) {
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

    function _resolveContainerRoot() {
        var strip = document.getElementById(SCOPE + 'TabStrip');
        if (strip && strip.parentNode) return strip.parentNode;
        var layout = document.querySelector('.app-layout');
        if (layout) return layout;
        return document.body;
    }

    function _setupSidebar() {
        var listEl = document.getElementById('householdListContainer');
        if (!listEl) return;

        _renderSidebarList();

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
            listEl.innerHTML =
                '<div class="hh-failure" style="padding:8px;font-size:0.65rem;">' +
                'HouseholdQueries is not loaded.' +
                '</div>';
            return;
        }

        var all;
        try { all = Q.getAllHouseholds() || []; }
        catch (e) { all = []; }

        if (all.length === 0) {
            listEl.innerHTML =
                '<div class="hh-empty" style="padding:16px;">' +
                'No households yet.' +
                '</div>';
            return;
        }

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

    function _setupTopBar() {
        _wireTopBarButton('refreshBtn', function () { _refreshAll(); });
        _wireTopBarButton('importBtn', function () {
            var fileInput = document.getElementById('fileInput');
            if (fileInput) fileInput.click();
        });
        _wireTopBarButton('exportBtn', function () { _exportMasterData(); });
        var fileInput = document.getElementById('fileInput');
        if (fileInput) {
            fileInput.addEventListener('change', _handleImportFile);
        }
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
            var errEl = document.getElementById('bootstrapError')
                || document.getElementById('emptyStateText');
            if (errEl) {
                errEl.classList.add('show');
                errEl.innerHTML =
                    '<strong>Household Manager cannot start.</strong><br>' +
                    _escSafe(depErr && depErr.message ? depErr.message : 'Missing dependency');
            }
            if (typeof console !== 'undefined' && console.error) {
                console.error('household-manager-bootstrap.init:', depErr);
            }
            return;
        }

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
            var errEl2 = document.getElementById('bootstrapError')
                || document.getElementById('emptyStateText');
            if (errEl2) {
                errEl2.classList.add('show');
                errEl2.innerHTML =
                    '<strong>Household state failed to hydrate.</strong><br>' +
                    _escSafe(hydrateErr && hydrateErr.message ? hydrateErr.message : 'Unknown');
            }
            return;
        }

        TabManager.configure(SCOPE, {
            containerRoot: _resolveContainerRoot(),
            resolveContainer: function (tabId) {
                return document.getElementById(SCOPE + '-pane-' + tabId);
            },
            buildContext: _buildContext,
            getActiveTabId: function () {
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

        var initialId = _getSelectedHouseholdId() || _pickInitialHouseholdId();
        if (initialId) _setSelectedHouseholdId(initialId);

        _syncTabStrip(DEFAULT_ACTIVE_TAB_ID);
        TabManager.renderActive(SCOPE);
        _renderSidebarList();

        if (typeof console !== 'undefined' && console.log) {
            console.log('[HouseholdManagerBootstrap] initialized');
        }
    }

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
