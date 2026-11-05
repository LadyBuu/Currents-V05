// js/tabs/government-manager-bootstrap.js
/**
 * =============================================================================
 * GOVERNMENT MANAGER BOOTSTRAP
 * js/tabs/government-manager-bootstrap.js
 * =============================================================================
 *
 * LOCATION: js/tabs/government-manager-bootstrap.js
 *
 * PURPOSE:
 *   The single orchestrator for GovernmentManager.html. Owns:
 *     - dependency checks (loud, not silent)
 *     - storage init + master data load
 *     - GovernmentBootstrap.init (hydrates GovernmentState)
 *     - TabManager.configure for the 'government' scope
 *     - TabManager.init (document-level click router)
 *     - tab strip + pane visual sync
 *     - sidebar (location tree) wiring
 *     - topbar (import / export / refresh / year / theme) wiring
 *     - initial tab render
 *
 * NON-OBVIOUS DECISIONS:
 *
 *   containerRoot is the .main-panel element (the parent of BOTH the
 *   tab strip and the pane container). TabManager's click router walks
 *   up from a [data-tab] click and asks each configured scope whether
 *   containerRoot.contains(button). If containerRoot were only
 *   #panelContent (the pane container), clicks on the strip would fail
 *   to route because the strip is a sibling of the pane container,
 *   not a descendant. Using .main-panel makes both the strip and the
 *   panes descendants, so routing works.
 *
 *   TabManager does NOT toggle .active on panes. Its renderer contract
 *   is fn(container, context) — the container is filled but not shown.
 *   setActiveTabId in the config MUST call _syncTabStrip, which toggles
 *   .active on the pane whose data-tab-content matches. Without this,
 *   the strip highlights the right tab but the pane below stays
 *   display:none.
 *
 *   The active tab id lives in GovernmentUIState (not in this file).
 *   This lets other modules (e.g. a future "open this tab" deep link)
 *   read/write it without importing this bootstrap.
 *
 * DEPENDENCIES (hard — init() throws visibly if missing):
 *   - js/core/tab-manager.js
 *   - js/government/government-ui-state.js
 *   - js/government/government-bootstrap.js
 *   - js/government/government-queries.js
 *   - js/location/location-queries.js
 *   - js/core/storage.js (loadMasterData)
 *
 * DEPENDENCIES (soft — toast if missing at click time):
 *   - openModal / confirmDialog (modals-core.js)
 *   - importData / exportData (exportUtils.js)
 *   - ThemeSwitcher (theme-boot.js)
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Initial revision. Replaces the inline <script> blocks in
 *   GovernmentManager.html that previously:
 *     - hardcoded the SUBTABS array
 *     - kept activeSubtabId in a module-scoped var
 *     - re-rendered the whole strip on every click
 *     - wired sidebar, topbar, year, theme inline
 *   All of that now lives here (or in government-ui-state.js).
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var SCOPE = 'government';

    var KNOWN_TAB_IDS = [
        'details',
        'departments',
        'history',
        'laws',
        'economy'
    ];

    var DEFAULT_ACTIVE_TAB_ID = 'details';

    // Icon name per tab id. The strip is built by this file (not by the
    // HTML) so the icon map lives here.
    var TAB_META = {
        details:     { label: 'Details',     icon: 'CROWN' },
        departments: { label: 'Departments', icon: 'HOUSEHOLD' },
        history:     { label: 'History',     icon: 'TIMELINE' },
        laws:        { label: 'Civil Laws',  icon: 'SHIELD' },
        economy:     { label: 'Economy',     icon: 'COIN' }
    };

    // =========================================================================
    // 2. DEPENDENCY HELPERS
    // =========================================================================

    function _esc(s) {
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(s);
        }
        if (s === null || s === undefined) return '';
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
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

    function _toast(msg, type) {
        if (typeof window.showToast === 'function') window.showToast(msg, type);
    }

    function _requireTabManager() {
        if (!window.TabManager
            || typeof window.TabManager.configure !== 'function'
            || typeof window.TabManager.register !== 'function'
            || typeof window.TabManager.init !== 'function') {
            throw new Error(
                'government-manager-bootstrap: TabManager is missing. ' +
                'Load js/core/tab-manager.js first.'
            );
        }
        return window.TabManager;
    }

    function _requireUIState() {
        if (!window.GovernmentUIState
            || typeof window.GovernmentUIState.getActiveTabId !== 'function'
            || typeof window.GovernmentUIState.setActiveTabId !== 'function') {
            throw new Error(
                'government-manager-bootstrap: GovernmentUIState is missing. ' +
                'Load js/government/government-ui-state.js first.'
            );
        }
        return window.GovernmentUIState;
    }

    function _requireQueries() {
        if (!window.GovernmentQueries) {
            throw new Error(
                'government-manager-bootstrap: GovernmentQueries is missing. ' +
                'Load js/government/government-queries.js first.'
            );
        }
        return window.GovernmentQueries;
    }

    function _requireLocationQueries() {
        if (!window.LocationQueries) {
            throw new Error(
                'government-manager-bootstrap: LocationQueries is missing. ' +
                'Load js/location/location-queries.js first.'
            );
        }
        return window.LocationQueries;
    }

    // =========================================================================
    // 3. TAB STRIP + PANE SYNC
    // =========================================================================

    /**
     * Sets the visual active state on the strip buttons and the panes.
     * The strip and panes are NOT re-rendered — only classList / aria
     * attributes are toggled. This is what makes rapid tab switching
     * cheap and what keeps focus on the clicked button.
     */
    function _syncTabStrip(activeTabId) {
        var strip = document.getElementById('governmentTabStrip');
        if (strip) {
            var buttons = strip.querySelectorAll('[data-tab]');
            for (var i = 0; i < buttons.length; i++) {
                var btn = buttons[i];
                var isActive = btn.getAttribute('data-tab') === activeTabId;
                btn.classList.toggle('active', isActive);
                btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
                btn.setAttribute('tabindex', isActive ? '0' : '-1');
            }
        }

        var panes = document.querySelectorAll('[data-tab-content]');
        for (var p = 0; p < panes.length; p++) {
            var pane = panes[p];
            var isPaneActive = pane.getAttribute('data-tab-content') === activeTabId;
            pane.classList.toggle('active', isPaneActive);
            pane.hidden = !isPaneActive;
        }
    }

    /**
     * Builds the tab strip markup. Called once at init. The strip is
     * static; the panes are static (empty divs); the TabManager
     * renderer fills each pane on activation.
     */
    function _buildTabStrip() {
        var strip = document.getElementById('governmentTabStrip');
        if (!strip) return;

        var html = '';
        for (var i = 0; i < KNOWN_TAB_IDS.length; i++) {
            var tabId = KNOWN_TAB_IDS[i];
            var meta = TAB_META[tabId];
            if (!meta) continue;
            var iconSvg = _icon(meta.icon);
            html +=
                '<button type="button" class="manager-subtab" ' +
                    'data-tab="' + _esc(tabId) + '" ' +
                    'role="tab" ' +
                    'aria-selected="false" ' +
                    'tabindex="-1">' +
                    (iconSvg
                        ? '<span class="manager-subtab-icon">' + iconSvg + '</span>'
                        : '') +
                    '<span>' + _esc(meta.label) + '</span>' +
                '</button>';
        }
        strip.innerHTML = html;
    }

    /**
     * Builds the pane containers. One empty div per tab, each with
     * id="government-pane-<tabId>" and data-tab-content="<tabId>".
     * TabManager.resolveContainer looks these up by id.
     */
    function _buildPanes() {
        var wrapper = document.getElementById('panelContent');
        if (!wrapper) return;

        var html = '';
        for (var i = 0; i < KNOWN_TAB_IDS.length; i++) {
            var tabId = KNOWN_TAB_IDS[i];
            html +=
                '<div class="tab-pane" ' +
                    'id="government-pane-' + _esc(tabId) + '" ' +
                    'data-tab-content="' + _esc(tabId) + '" ' +
                    'role="tabpanel" ' +
                    'hidden></div>';
        }
        wrapper.innerHTML = html;
    }

    // =========================================================================
    // 4. CONTEXT BUILDER
    // =========================================================================

    /**
     * Builds the render context passed to every tab renderer.
     *
     * Shape:
     *   {
     *     locationId:     string,
     *     locationName:   string,
     *     governmentState: { locationId, place }   // place projection
     *   }
     *
     * Returns null when no location is selected — TabManager writes the
     * 'no-context' empty state.
     *
     * The place projection is fetched fresh each render via
     * LocationQueries.getPlaceSummary — it is a projection, not the
     * canonical record. Tabs may read it freely.
     */
    function _buildContext() {
        var ui = _requireUIState();
        var LQ = _requireLocationQueries();

        var locationId = ui.getSelectedLocationId();
        if (!locationId) return null;

        var place = null;
        try {
            place = LQ.getPlaceSummary(locationId);
        } catch (e) {
            place = null;
        }

        return {
            locationId: locationId,
            locationName: place
                ? (place.displayName || place.name || '')
                : '',
            governmentState: {
                locationId: locationId,
                place: place
            }
        };
    }

    // =========================================================================
    // 5. EMPTY-STATE BUILDER
    // =========================================================================

    function _buildEmptyState(tabId, reason) {
        if (reason === 'no-context') {
            return '<div class="empty-state">' +
                'Select a government from the sidebar to view this tab.' +
                '</div>';
        }
        if (reason === 'no-renderer') {
            return '<div class="empty-state">' +
                'The "' + _esc(tabId) + '" tab is not loaded. ' +
                'Load js/tabs/government-' + _esc(tabId) + '-tab.js.' +
                '</div>';
        }
        if (reason === 'no-container') {
            return '<div class="empty-state" style="color:var(--danger-lt);">' +
                'Missing pane for tab "' + _esc(tabId) + '". ' +
                'The tab strip and pane container are out of sync.' +
                '</div>';
        }
        return '';
    }

    // =========================================================================
    // 6. SIDEBAR
    // =========================================================================

    function _setupSidebar() {
        var container = document.getElementById('placeList');
        if (!container) return;

        var ui = _requireUIState();

        if (window.LocationUI && typeof window.LocationUI.renderLocationList === 'function') {
            try {
                window.LocationUI.renderLocationList('placeList', {
                    selectedId: ui.getSelectedLocationId(),
                    onSelect: function (placeOrId) {
                        var id = (typeof placeOrId === 'string')
                            ? placeOrId
                            : (placeOrId && placeOrId.id ? placeOrId.id : null);
                        if (!id) return;
                        ui.setSelectedLocationId(id);
                        _syncTabStrip(ui.getActiveTabId());
                        _renderActiveTab();
                        if (window.innerWidth <= 768) _closeSidebar();
                    }
                });
                return;
            } catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('government-manager-bootstrap: LocationUI.renderLocationList threw', e);
                }
            }
        }

        // Fallback: flat list.
        var places = (typeof window.getPlaces === 'function') ? window.getPlaces() : [];
        if (!places || places.length === 0) {
            container.innerHTML = '<div class="empty-state">No governments found</div>';
            return;
        }

        var html = '<div class="place-tree">';
        for (var i = 0; i < places.length; i++) {
            var p = places[i];
            var sel = (p.id === ui.getSelectedLocationId());
            html += '<div class="place-item' + (sel ? ' selected' : '') + '" ' +
                'data-place-id="' + _esc(p.id) + '">' +
                _esc(p.displayName || p.name || 'Unknown') +
                '</div>';
        }
        html += '</div>';
        container.innerHTML = html;

        container.addEventListener('click', function (e) {
            var item = e.target.closest('[data-place-id]');
            if (!item) return;
            var id = item.getAttribute('data-place-id');
            if (!id) return;
            ui.setSelectedLocationId(id);
            _syncTabStrip(ui.getActiveTabId());
            _renderActiveTab();
            if (window.innerWidth <= 768) _closeSidebar();
        });
    }

    function _openSidebar() {
        var s = document.getElementById('locationsSidebar');
        var o = document.getElementById('sidebarOverlay');
        if (s) s.classList.add('visible');
        if (o) o.classList.add('active');
    }

    function _closeSidebar() {
        var s = document.getElementById('locationsSidebar');
        var o = document.getElementById('sidebarOverlay');
        if (s) s.classList.remove('visible');
        if (o) o.classList.remove('active');
    }

    function _toggleSidebar() {
        var s = document.getElementById('locationsSidebar');
        if (!s) return;
        if (s.classList.contains('visible')) _closeSidebar();
        else _openSidebar();
    }

    // =========================================================================
    // 7. TOPBAR
    // =========================================================================

    function _setupUIText() {
        var title = document.getElementById('govManagerTitle');
        if (title) {
            title.innerHTML =
                _icon('CROWN') + ' <span>GOVERNMENT MANAGER</span>';
        }
        var sidebarTitle = document.getElementById('sidebarTitle');
        if (sidebarTitle) {
            sidebarTitle.innerHTML =
                _icon('LOCATION') + ' <span>GOVERNMENTS</span>';
        }
        var importBtn = document.getElementById('importBtn');
        if (importBtn) importBtn.innerHTML = _icon('ARROW_RIGHT') + ' Import';
        var exportBtn = document.getElementById('exportBtn');
        if (exportBtn) exportBtn.innerHTML = _icon('ARROW_RIGHT') + ' Export';
        var refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) refreshBtn.innerHTML = _icon('REFRESH') + ' Refresh';
        var loadingText = document.getElementById('loadingText');
        if (loadingText) loadingText.textContent = 'Loading governments...';
    }

    function _setupTopBar() {
        var importBtn = document.getElementById('importBtn');
        if (importBtn) {
            importBtn.addEventListener('click', function () {
                if (typeof window.importData !== 'function') {
                    _toast('Import not available', 'error');
                    return;
                }
                window.importData().then(function () {
                    _reinitAll();
                    _toast('Import successful', 'success');
                }).catch(function (err) {
                    _toast('Import failed: ' + (err && err.message ? err.message : 'unknown'), 'error');
                });
            });
        }

        var exportBtn = document.getElementById('exportBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', function () {
                if (typeof window.exportData !== 'function') {
                    _toast('Export not available', 'error');
                    return;
                }
                try {
                    window.exportData();
                    _toast('Export started', 'success');
                } catch (e) {
                    _toast('Export failed: ' + (e.message || 'unknown'), 'error');
                }
            });
        }

        var refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function () {
                if (typeof window.loadMasterData === 'function') {
                    window.loadMasterData();
                }
                _reinitAll();
                _toast('Refreshed', 'success');
            });
        }

        _setupYearControl();
        _setupThemeSwitcher();
        _setupMobileToggle();
    }

    function _setupYearControl() {
        var input = document.getElementById('yearInput');
        var btn = document.getElementById('setYearBtn');
        if (!input || !btn) return;

        function _syncFromCanonical() {
            try {
                var y = (typeof window.getCurrentYear === 'function')
                    ? window.getCurrentYear()
                    : (window.masterData && window.masterData.data
                        ? window.masterData.data.currentYear
                        : null);
                if (typeof y === 'number' && isFinite(y)) {
                    input.value = String(y);
                }
            } catch (e) { /* ignore */ }
        }
        _syncFromCanonical();

        function _applyYear() {
            var y = parseInt(input.value, 10);
            if (!isFinite(y)) {
                _toast('Enter a valid year', 'error');
                return;
            }
            if (typeof window.isValidYear === 'function' && window.isValidYear(y) !== true) {
                _toast('Year out of range', 'error');
                return;
            }

            var applied = false;
            if (typeof window.setCurrentYear === 'function') {
                try {
                    var r = window.setCurrentYear(y);
                    if (r === false) {
                        _toast('Could not set year', 'error');
                        return;
                    }
                    applied = true;
                } catch (e) {
                    _toast('Set year failed: ' + (e.message || 'unknown'), 'error');
                    return;
                }
            }

            if (!applied) {
                if (!window.masterData || !window.masterData.data) {
                    _toast('Storage not initialized', 'error');
                    return;
                }
                window.masterData.data.currentYear = y;
                if (typeof window.markDataDirty === 'function') {
                    try { window.markDataDirty(); } catch (e) { /* ignore */ }
                }
                if (typeof window.saveMasterData === 'function') {
                    try { window.saveMasterData(); } catch (e) { /* ignore */ }
                }
                applied = true;
            }

            if (applied) {
                _toast('Year set to ' + y, 'success');
                _syncFromCanonical();
                _renderActiveTab();
                _setupSidebar();
            }
        }

        btn.addEventListener('click', _applyYear);
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                _applyYear();
            }
        });
    }

    function _setupThemeSwitcher() {
        var themeBtn = document.getElementById('themeBtn');
        var themeMenu = document.getElementById('themeMenu');
        var themeName = document.getElementById('themeName');
        var switcher = window.ThemeSwitcher;
        if (!themeBtn || !themeMenu || !switcher) return;

        function _updateLabel(id) {
            var label = id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, ' ');
            if (themeName) themeName.textContent = label;
        }
        function _buildMenu() {
            var html = '';
            for (var i = 0; i < switcher.themes.length; i++) {
                var id = switcher.themes[i];
                var label = id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, ' ');
                html += '<li role="none"><button role="menuitem" type="button" ' +
                    'data-theme-id="' + _esc(id) + '">' + _esc(label) + '</button></li>';
            }
            themeMenu.innerHTML = html;
        }
        function _openMenu() {
            themeMenu.hidden = false;
            themeBtn.setAttribute('aria-expanded', 'true');
        }
        function _closeMenu() {
            themeMenu.hidden = true;
            themeBtn.setAttribute('aria-expanded', 'false');
        }

        themeBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (themeMenu.hidden) _openMenu(); else _closeMenu();
        });
        themeMenu.addEventListener('click', function (e) {
            var b = e.target.closest('[data-theme-id]');
            if (!b) return;
            var id = b.getAttribute('data-theme-id');
            switcher.apply(id);
            _updateLabel(id);
            _closeMenu();
        });
        document.addEventListener('click', function (e) {
            if (!themeMenu.hidden) {
                if (themeMenu.contains(e.target)) return;
                if (e.target === themeBtn) return;
                _closeMenu();
            }
        });

        _buildMenu();
        var saved = switcher.getSaved();
        if (saved) _updateLabel(saved);
    }

    function _setupMobileToggle() {
        var menuToggle = document.getElementById('menuToggle');
        if (menuToggle) menuToggle.addEventListener('click', _toggleSidebar);
        var overlay = document.getElementById('sidebarOverlay');
        if (overlay) overlay.addEventListener('click', _closeSidebar);
    }

    // =========================================================================
    // 8. RENDER DRIVER
    // =========================================================================

    function _renderActiveTab() {
        var TM = window.TabManager;
        if (!TM) return;
        try {
            TM.renderActive(SCOPE);
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('government-manager-bootstrap: renderActive threw', e);
            }
        }
    }

    function _pickInitialLocation() {
        var places = (typeof window.getPlaces === 'function') ? window.getPlaces() : [];
        if (!places || places.length === 0) return null;
        // Prefer a non-root location with a variableKey (the same
        // heuristic the old inline script used).
        for (var i = 0; i < places.length; i++) {
            if (places[i].variableKey && places[i].variableKey !== 'world_root') {
                return places[i].id;
            }
        }
        return places[0].id;
    }

    function _reinitAll() {
        if (window.GovernmentBootstrap && typeof window.GovernmentBootstrap.reinit === 'function') {
            try { window.GovernmentBootstrap.reinit(); }
            catch (e) { /* ignore */ }
        }
        _setupSidebar();
        _renderActiveTab();
    }

    // =========================================================================
    // 9. INIT
    // =========================================================================

    var _initialized = false;

    function init() {
        if (_initialized) return;
        _initialized = true;

        // --- Dependency check: loud failure, visible to the user ---
        var TabManager, uiState;
        try {
            TabManager = _requireTabManager();
            uiState = _requireUIState();
            _requireQueries();
            _requireLocationQueries();
        } catch (depErr) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('government-manager-bootstrap: dependency check failed', depErr);
            }
            var panel = document.getElementById('panelContent');
            if (panel) {
                panel.innerHTML =
                    '<div class="empty-state" style="color:var(--danger-lt);">' +
                        'Government Manager failed to start: ' +
                        _esc(depErr.message || 'missing dependency') +
                    '</div>';
            }
            return;
        }

        // --- Storage + data ---
        try {
            if (typeof window.initializeStorage === 'function') window.initializeStorage();
        } catch (e) { /* ignore */ }
        try {
            if (typeof window.loadMasterData === 'function') window.loadMasterData();
        } catch (e) { /* ignore */ }

        // --- Domain bootstrap: hydrate GovernmentState ---
        if (window.GovernmentBootstrap && typeof window.GovernmentBootstrap.init === 'function') {
            try { window.GovernmentBootstrap.init(); }
            catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('government-manager-bootstrap: GovernmentBootstrap.init threw', e);
                }
            }
        }

        // --- Static shell: strip + panes + text ---
        _setupUIText();
        _buildTabStrip();
        _buildPanes();

        // --- TabManager config ---
        uiState.setKnownTabIds(KNOWN_TAB_IDS);

        TabManager.configure(SCOPE, {
            containerRoot: document.querySelector('.main-panel'),
            resolveContainer: function (tabId) {
                return document.getElementById('government-pane-' + tabId);
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

        // --- Wire the document-level click router ---
        TabManager.init();

        // --- Topbar + sidebar ---
        _setupTopBar();

        // --- Initial location ---
        var initialId = uiState.getSelectedLocationId() || _pickInitialLocation();
        if (initialId) uiState.setSelectedLocationId(initialId);

        _setupSidebar();

        // --- Initial active tab + render ---
        var initialTab = uiState.getActiveTabId() || DEFAULT_ACTIVE_TAB_ID;
        _syncTabStrip(initialTab);
        TabManager.setActive(SCOPE, initialTab);
        TabManager.renderActive(SCOPE);
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.GovernmentManagerBootstrap = {
        init: init,
        SCOPE: SCOPE,
        KNOWN_TAB_IDS: KNOWN_TAB_IDS.slice()
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
