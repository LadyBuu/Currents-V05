/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT MANAGER BOOTSTRAP
 * js/settlement/settlement-manager-bootstrap.js
 * =============================================================================
 *
 * Single orchestrator for SettlementManager.html.
 *
 * Owns: TabManager configure/init, sidebar wiring, topbar wiring,
 * initial load sequence.
 *
 * RENDERER CONTRACT (every settlement-*-tab.js):
 *   fn(container, context)
 *   context = { locationId, data, viewModel }
 *
 * containerRoot is the tab-strip parent (contains both the strip and
 * the pane container). TabManager's click router walks up from the
 * click target and asks containerRoot.contains(button). A containerRoot
 * that only holds panes fails to route strip clicks.
 *
 * _syncTabStrip toggles .active on the pane whose data-tab-content
 * matches the active tab. TabManager does NOT do this itself.
 *
 * TIME CONTRACT: uses window.getCurrentYear (no getCurrentYearSafe).
 * ICON POLICY: no emojis, no inline SVG. Icons from getIcon, '' fallback.
 * NO CSS: emits class names only. Classes are defined in
 * SettlementManager.html's <style> block.
 * =============================================================================
 */

(function () {
    'use strict';

    var SCOPE = 'settlement';

    var KNOWN_TAB_IDS = [
        'overview', 'economy', 'features', 'roles', 'industry',
        'residence', 'education', 'religion', 'crime', 'history'
    ];

    var DEFAULT_ACTIVE_TAB_ID = 'overview';

    // =========================================================================
    // 1. REQUIREMENT HELPERS (throw; init catches)
    // =========================================================================

    function _requireTabManager() {
        if (!window.TabManager
            || typeof window.TabManager.configure !== 'function'
            || typeof window.TabManager.register !== 'function'
            || typeof window.TabManager.init !== 'function'
            || typeof window.TabManager.renderActive !== 'function') {
            throw new Error(
                'settlement-manager-bootstrap: TabManager is missing. ' +
                'Load js/core/tab-manager.js before this bootstrap.'
            );
        }
        return window.TabManager;
    }

    function _requireUIState() {
        if (!window.SettlementUIState
            || typeof window.SettlementUIState.getSelectedLocationId !== 'function'
            || typeof window.SettlementUIState.setSelectedLocationId !== 'function') {
            throw new Error(
                'settlement-manager-bootstrap: SettlementUIState is missing. ' +
                'Load js/settlement/settlement-ui-state.js first.'
            );
        }
        return window.SettlementUIState;
    }

    function _requireQueries() {
        if (!window.SettlementQueries
            || typeof window.SettlementQueries.getSettlementData !== 'function') {
            throw new Error(
                'settlement-manager-bootstrap: SettlementQueries is missing. ' +
                'Load js/settlement/settlement-queries.js first.'
            );
        }
        return window.SettlementQueries;
    }

    function _requireViewModels() {
        if (!window.SettlementViewModels
            || typeof window.SettlementViewModels.buildSettlementSummary !== 'function') {
            throw new Error(
                'settlement-manager-bootstrap: SettlementViewModels is missing. ' +
                'Load js/settlement/settlement-view-models.js first.'
            );
        }
        return window.SettlementViewModels;
    }

    // =========================================================================
    // 2. SMALL HELPERS
    // =========================================================================

    function _esc(value) {
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(value);
        }
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _icon(name) {
        if (!name) return '';
        if (typeof window.getIcon === 'function') {
            try {
                var s = window.getIcon(name);
                if (typeof s === 'string') return s;
            } catch (e) { /* fall through */ }
        }
        if (window.Icons && typeof window.Icons[name] === 'string') {
            return window.Icons[name];
        }
        return '';
    }

    function _placeName(locationId) {
        if (!locationId) return null;
        if (window.PlaceQueries
            && typeof window.PlaceQueries.getPlaceById === 'function') {
            var place = window.PlaceQueries.getPlaceById(locationId);
            if (place) return place.displayName || place.name || null;
        }
        return null;
    }

    // =========================================================================
    // 3. CONTEXT BUILDER
    // =========================================================================

    function _buildContext() {
        var ui = _requireUIState();
        var queries = _requireQueries();
        var viewModels = _requireViewModels();

        var locationId = ui.getSelectedLocationId();
        if (!locationId) return null;

        var data = queries.getSettlementData(locationId);
        if (!data) return null;

        var viewModel = null;
        try {
            viewModel = viewModels.buildSettlementSummary(locationId);
        } catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-manager-bootstrap: buildSettlementSummary ' +
                    'threw for ' + locationId + ':', err
                );
            }
            viewModel = null;
        }

        return { locationId: locationId, data: data, viewModel: viewModel };
    }

    // =========================================================================
    // 4. EMPTY-STATE BUILDER
    // =========================================================================

    function _buildEmptyState(tabId, reason) {
        if (reason === 'no-context') {
            return '<div class="st-empty">Select a settlement from the sidebar.</div>';
        }
        if (reason === 'no-renderer') {
            return '<div class="st-empty">The "' + _esc(tabId) +
                '" tab is not loaded.</div>';
        }
        if (reason === 'no-container') {
            return '<div class="st-error">Missing pane for "' +
                _esc(tabId) + '". Check SettlementManager.html.</div>';
        }
        return '';
    }

    // =========================================================================
    // 5. STRIP + PANE SYNC
    // =========================================================================

    function _syncTabStrip(tabId) {
        var strip = document.getElementById('settlementTabStrip');
        if (strip) {
            var buttons = strip.querySelectorAll('[data-tab]');
            for (var i = 0; i < buttons.length; i++) {
                var b = buttons[i];
                if (b.dataset.tab === tabId) {
                    b.classList.add('active');
                    b.setAttribute('aria-selected', 'true');
                    b.setAttribute('tabindex', '0');
                } else {
                    b.classList.remove('active');
                    b.setAttribute('aria-selected', 'false');
                    b.setAttribute('tabindex', '-1');
                }
            }
        }
        var panes = document.querySelectorAll('[data-tab-content]');
        for (var j = 0; j < panes.length; j++) {
            var p = panes[j];
            if (p.dataset.tabContent === tabId) {
                p.classList.add('active');
            } else {
                p.classList.remove('active');
            }
        }
    }

    // =========================================================================
    // 6. SIDEBAR
    // =========================================================================

    function _renderSidebar() {
        var list = document.getElementById('settlementList');
        if (!list) return;

        var queries = _requireQueries();
        var all = [];
        try { all = queries.getAllSettlements() || []; }
        catch (e) { all = []; }

        if (all.length === 0) {
            list.innerHTML = '<div class="st-empty">No settlements yet.</div>';
            return;
        }

        var selectedId = _requireUIState().getSelectedLocationId();
        var html = '<div class="st-rows">';
        for (var i = 0; i < all.length; i++) {
            var entry = all[i];
            var locId = entry.locationId;
            var name = _placeName(locId) || locId;
            var isSel = (locId === selectedId);
            html += '<button type="button" class="st-btn' +
                (isSel ? ' st-btn--accent' : '') +
                '" data-location-id="' + _esc(locId) + '">' +
                _icon('LOCATION') + ' ' + _esc(name) + '</button>';
        }
        html += '</div>';
        list.innerHTML = html;

        if (!list.__wired) {
            list.__wired = true;
            list.addEventListener('click', function (event) {
                var btn = event.target.closest('[data-location-id]');
                if (!btn || !list.contains(btn)) return;
                event.preventDefault();
                _requireUIState().setSelectedLocationId(btn.dataset.locationId);
                _renderSidebar();
                _requireTabManager().renderActive(SCOPE);
            });
        }
    }

    // =========================================================================
    // 7. TOPBAR
    // =========================================================================

    function _wireTopbar() {
        var yearInput = document.getElementById('yearInput');
        var setYearBtn = document.getElementById('setYearBtn');
        if (yearInput && typeof window.getCurrentYear === 'function') {
            var y = window.getCurrentYear();
            if (typeof y === 'number') yearInput.value = String(y);
        }
        if (setYearBtn && yearInput) {
            setYearBtn.addEventListener('click', function () {
                var n = parseInt(yearInput.value, 10);
                if (!isFinite(n) || n < 1) {
                    if (typeof window.showToast === 'function') {
                        window.showToast('Enter a valid year.', 'error');
                    }
                    return;
                }
                if (typeof window.isValidYear === 'function'
                    && !window.isValidYear(n)) {
                    if (typeof window.showToast === 'function') {
                        window.showToast('Year is out of range.', 'error');
                    }
                    return;
                }
                if (window.masterData && window.masterData.data) {
                    window.masterData.data.currentYear = n;
                }
                if (typeof window.saveMasterData === 'function') {
                    window.saveMasterData();
                }
                if (typeof window.showToast === 'function') {
                    window.showToast('Year set to ' + n + '.', 'success');
                }
                _requireTabManager().renderActive(SCOPE);
            });
        }

        var refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function () {
                if (window.SettlementState
                    && typeof window.SettlementState.rebuildIndexes === 'function') {
                    try { window.SettlementState.rebuildIndexes(); } catch (e) {}
                }
                _renderSidebar();
                _requireTabManager().renderActive(SCOPE);
            });
        }

        var exportBtn = document.getElementById('exportBtn');
        if (exportBtn && typeof window.exportMasterData === 'function') {
            exportBtn.addEventListener('click', function () {
                window.exportMasterData();
            });
        }

        var importBtn = document.getElementById('importBtn');
        var fileInput = document.getElementById('fileInput');
        if (importBtn && fileInput) {
            importBtn.addEventListener('click', function () { fileInput.click(); });
            fileInput.addEventListener('change', function () {
                if (typeof window.importMasterData === 'function') {
                    window.importMasterData(fileInput.files[0], function () {
                        _renderSidebar();
                        _requireTabManager().renderActive(SCOPE);
                    });
                }
            });
        }
    }

    // =========================================================================
    // 8. INIT
    // =========================================================================

    function _pickInitialLocation() {
        var all = _requireQueries().getAllSettlements() || [];
        return all.length > 0 ? all[0].locationId : null;
    }

    var _initialized = false;

    function init() {
        if (_initialized) return;
        _initialized = true;

        var TabManager, uiState;
        try {
            TabManager = _requireTabManager();
            uiState    = _requireUIState();
            _requireQueries();
            _requireViewModels();
        } catch (depErr) {
            var panel = document.getElementById('panelContent');
            if (panel) {
                panel.innerHTML = '<div class="st-error">' +
                    'Settlement Manager could not start: ' +
                    _esc(depErr.message) + '</div>';
            }
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'settlement-manager-bootstrap init failed:', depErr
                );
            }
            return;
        }

        // Rebuild canonical indexes against current data.
        if (window.SettlementState
            && typeof window.SettlementState.rebuildIndexes === 'function') {
            try { window.SettlementState.rebuildIndexes(); } catch (e) {}
        }

        var strip = document.getElementById('settlementTabStrip');
        var containerRoot = strip ? strip.parentNode : document.body;

        TabManager.configure(SCOPE, {
            containerRoot: containerRoot,
            resolveContainer: function (tabId) {
                return document.getElementById(SCOPE + '-pane-' + tabId);
            },
            buildContext: _buildContext,
            getActiveTabId: function () {
                return uiState.getActiveTabId() || DEFAULT_ACTIVE_TAB_ID;
            },
            setActiveTabId: function (tabId) {
                uiState.setActiveTabId(tabId);
                _syncTabStrip(tabId);
            },
            buildEmptyState: _buildEmptyState
        });

        TabManager.init();

        if (strip) {
            strip.addEventListener('click', function (event) {
                var btn = event.target.closest('[data-tab]');
                if (!btn || !strip.contains(btn)) return;
                event.preventDefault();
                var tabId = btn.dataset.tab;
                if (tabId) {
                    uiState.setActiveTabId(tabId);
                    _syncTabStrip(tabId);
                    TabManager.renderActive(SCOPE);
                }
            });
        }

        _wireTopbar();

        var initial = uiState.getSelectedLocationId() || _pickInitialLocation();
        if (initial) uiState.setSelectedLocationId(initial);

        _renderSidebar();

        var activeTab = uiState.getActiveTabId() || DEFAULT_ACTIVE_TAB_ID;
        _syncTabStrip(activeTab);
        TabManager.renderActive(SCOPE);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.SettlementManagerBootstrap = Object.freeze({ init: init });

})();
