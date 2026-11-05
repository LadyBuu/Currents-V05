/**
 * =============================================================================
 * STILL WATERS - EDUCATION MANAGER BOOTSTRAP
 * js/tabs/education-manager-bootstrap.js
 * =============================================================================
 *
 * LOCATION: js/tabs/education-manager-bootstrap.js
 *
 * The Education Manager page's bootstrap. It is the ONLY module that
 * knows about the TabManager scope named 'education'. It owns:
 *
 *   - TabManager.configure('education', ...) — the scope config
 *   - TabManager.init() — the document-level click handler
 *   - The tab strip DOM helpers (button + pane active-class sync)
 *   - The sidebar wiring (LocationUI.renderLocationList → activate)
 *   - The topbar (import / export / refresh / year control)
 *   - The initial load sequence: storage hydrate → masterData →
 *     EducationState.hydrateFromMasterData → TabManager.configure →
 *     initial tab render
 *
 * It does NOT own the seven education tabs. Each tab file self-registers
 * with TabManager.register('education', '<tabId>', renderFn) at its
 * own load. This file does not reference any specific tab id except
 * DEFAULT_ACTIVE_TAB_ID ('overview'), which it also pushes to
 * EducationUIState via setKnownTabIds() at init time.
 *
 * CONTAINER ROOT (IMPORTANT)
 *
 *   TabManager's click router finds [data-tab] buttons by walking up
 *   from the click target to see which configured scope's
 *   containerRoot contains it. The containerRoot must therefore
 *   contain BOTH the tab strip AND the pane container.
 *
 *   In EducationManager.html, #educationTabStrip and #panelContent are
 *   siblings inside .main-panel. containerRoot is set to the strip's
 *   parentNode (.main-panel).
 *
 * PANE VISIBILITY (IMPORTANT)
 *
 *   TabManager's renderer contract does NOT toggle .active on the
 *   panes. It calls the renderer with the pane element, and the
 *   renderer fills the pane. That means TabManager writes content
 *   into a pane that may still be display:none.
 *
 *   This bootstrap is therefore responsible for toggling .active on
 *   the panes whenever the active tab changes. _syncTabStrip does
 *   both — it updates the strip buttons AND the panes, so the CSS
 *   .tab-pane { display:none } / .tab-pane.active { display:block }
 *   rules switch the correct pane into view.
 *
 *   Prior revisions only updated the strip buttons. The strip showed
 *   the correct tab as active, but the corresponding pane stayed
 *   display:none, so visually nothing changed. Overview kept showing
 *   because Overview's pane was the only one with .active (from the
 *   HTML markup). Verified by inspecting the pane after a tab click:
 *   innerHTML was populated (1815 chars of Institutions content) but
 *   .active was missing.
 *
 * RENDERER CONTRACT
 * -----------------
 *   Every education tab is:
 *
 *     function render<Something>(container, context) {
 *         // container  HTMLElement  — already cleared by TabManager
 *         // context    { locationId, locationName, educationState }
 *     }
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - _syncTabStrip now toggles .active on the panes (via
 *       [data-tab-content] attribute inside #panelContent) as well as
 *       on the strip buttons. Prior revision only updated the strip
 *       buttons; the pane stayed display:none, so switching tabs had
 *       no visual effect. See PANE VISIBILITY in the header.
 *     - No other behavioural change.
 *   Previous revision:
 *     - containerRoot changed from #panelContent to the tab strip's
 *       parentNode (.main-panel). The click router requires
 *       containerRoot to CONTAIN the [data-tab] buttons it routes.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var KNOWN_TAB_IDS = [
        'overview',
        'institutions',
        'students',
        'finances',
        'analytics',
        'apprenticeships',
        'history'
    ];

    var DEFAULT_ACTIVE_TAB_ID = 'overview';

    var SCOPE = 'education';

    var ID_TAB_STRIP   = 'educationTabStrip';
    var ID_PANEL       = 'panelContent';
    var ID_SIDEBAR     = 'placeList';
    var ID_EMPTY_STATE = 'emptyStateText';
    var ID_YEAR_INPUT  = 'yearInput';
    var ID_YEAR_BTN    = 'setYearBtn';
    var ID_IMPORT_BTN  = 'importBtn';
    var ID_EXPORT_BTN  = 'exportBtn';
    var ID_REFRESH_BTN = 'refreshBtn';
    var ID_MENU_TOGGLE = 'menuToggle';
    var ID_SIDEBAR_BTN = 'locationsSidebar';
    var ID_OVERLAY     = 'sidebarOverlay';

    // =========================================================================
    // 2. DEPENDENCY HELPERS
    // =========================================================================

    function _requireTabManager() {
        if (!window.TabManager ||
            typeof window.TabManager.configure !== 'function' ||
            typeof window.TabManager.register !== 'function' ||
            typeof window.TabManager.init !== 'function') {
            throw new Error(
                'education-manager-bootstrap: TabManager is missing. ' +
                'Load js/core/tab-manager.js before this file.'
            );
        }
        return window.TabManager;
    }

    function _requireUIState() {
        if (!window.EducationUIState ||
            typeof window.EducationUIState.getActiveTabId !== 'function' ||
            typeof window.EducationUIState.setActiveTabId !== 'function' ||
            typeof window.EducationUIState.getSelectedLocationId !== 'function' ||
            typeof window.EducationUIState.setSelectedLocationId !== 'function' ||
            typeof window.EducationUIState.setKnownTabIds !== 'function') {
            throw new Error(
                'education-manager-bootstrap: EducationUIState is missing ' +
                'or incomplete. Load js/education/education-ui-state.js ' +
                'before this file.'
            );
        }
        return window.EducationUIState;
    }

    function _requireQueries() {
        if (!window.EducationQueries ||
            typeof window.EducationQueries.getLocationEducationSummary !== 'function' ||
            typeof window.EducationQueries.getEducationHealthScore !== 'function') {
            throw new Error(
                'education-manager-bootstrap: EducationQueries is missing ' +
                'or incomplete. Load js/education/education-queries.js ' +
                'before this file.'
            );
        }
        return window.EducationQueries;
    }

    function _requireState() {
        if (!window.EducationState ||
            typeof window.EducationState.hydrateFromMasterData !== 'function') {
            throw new Error(
                'education-manager-bootstrap: EducationState is missing. ' +
                'Load js/education/education-state.js before this file.'
            );
        }
        return window.EducationState;
    }

    function _escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
        if (typeof window._escapeHtml === 'function') return window._escapeHtml(str);
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function _icon(name) {
        if (typeof window.getIcon === 'function') {
            try {
                var i = window.getIcon(name);
                if (typeof i === 'string') return i;
            } catch (e) { /* fall through */ }
        }
        if (window.Icons && typeof window.Icons[name] === 'string') {
            return window.Icons[name];
        }
        return '';
    }

    function _toast(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    }

    function _placeName(locationId) {
        if (!locationId) return '';
        if (typeof window.getPlaceById !== 'function') return '';
        try {
            var place = window.getPlaceById(locationId);
            return place ? (place.displayName || place.name || '') : '';
        } catch (e) {
            return '';
        }
    }

    // =========================================================================
    // 3. CONTAINER ROOT RESOLUTION
    // =========================================================================

    function _resolveContainerRoot() {
        var strip = document.getElementById(ID_TAB_STRIP);
        if (strip && strip.parentNode && typeof strip.parentNode.contains === 'function') {
            return strip.parentNode;
        }
        var panel = document.getElementById(ID_PANEL);
        if (panel) return panel;
        return null;
    }

    // =========================================================================
    // 4. BUILD CONTEXT
    // =========================================================================

    function _buildContext() {
        var ui = _requireUIState();
        var queries = _requireQueries();

        var locationId = ui.getSelectedLocationId();
        if (!locationId) return null;

        var summary = null;
        var health = null;
        var summaryError = null;
        var healthError = null;

        try { summary = queries.getLocationEducationSummary(locationId, false); }
        catch (e) {
            summaryError = e && e.message ? e.message : 'unknown error';
        }

        try { health = queries.getEducationHealthScore(locationId); }
        catch (e) {
            healthError = e && e.message ? e.message : 'unknown error';
        }

        return {
            locationId: locationId,
            locationName: _placeName(locationId),
            educationState: {
                summary: summary,
                health: health,
                summaryError: summaryError,
                healthError: healthError
            }
        };
    }

    // =========================================================================
    // 5. EMPTY STATE BUILDER
    // =========================================================================

    function _buildEmptyState(tabId, reason) {
        if (reason === 'no-context') {
            return '<div class="empty-state">' +
                _icon('BOOK') + ' ' +
                'Select a settlement from the sidebar to manage its education.' +
                '</div>';
        }
        if (reason === 'no-renderer') {
            return '<div class="empty-state">' +
                'The "' + _escapeHtml(tabId) + '" tab is not available. ' +
                'The tab module may not be loaded.' +
                '</div>';
        }
        if (reason === 'no-container') {
            return '<div class="empty-state" style="color:var(--danger);">' +
                'Missing tab pane element for "' + _escapeHtml(tabId) + '". ' +
                'Check EducationManager.html.' +
                '</div>';
        }
        return '';
    }

    // =========================================================================
    // 6. TAB STRIP + PANE VISUAL SYNC
    // =========================================================================
    //
    // Called whenever the active tab changes. Updates:
    //   - the tab strip buttons (.active class, aria-selected, tabindex)
    //   - the tab panes (.active class — REQUIRED so the CSS
    //     .tab-pane { display: none } / .tab-pane.active { display: block }
    //     rules switch the correct pane into view)
    //
    // TabManager does NOT toggle .active on the panes. Its renderer
    // contract says "you get a container, fill it". If the container
    // stays display:none, the content is written but invisible.
    //
    // Prior revisions only updated the strip; the pane stayed hidden
    // and switching had no visual effect.

    function _syncTabStrip(tabId) {
        // --- Strip buttons ---
        var strip = document.getElementById(ID_TAB_STRIP);
        if (strip) {
            var buttons = strip.querySelectorAll('[data-tab]');
            for (var i = 0; i < buttons.length; i++) {
                var isActive = buttons[i].getAttribute('data-tab') === tabId;
                buttons[i].classList.toggle('active', isActive);
                buttons[i].setAttribute('aria-selected', isActive ? 'true' : 'false');
                buttons[i].setAttribute('tabindex', isActive ? '0' : '-1');
            }
        }

        // --- Panes ---
        // Panes carry data-tab-content="<id>" and live inside #panelContent.
        // Only the pane whose data-tab-content matches tabId gets .active;
        // every other pane loses it. That drives the CSS display rule.
        var panel = document.getElementById(ID_PANEL);
        if (panel) {
            var panes = panel.querySelectorAll('[data-tab-content]');
            for (var j = 0; j < panes.length; j++) {
                var paneIsActive = panes[j].getAttribute('data-tab-content') === tabId;
                panes[j].classList.toggle('active', paneIsActive);
            }
        }
    }

    // =========================================================================
    // 7. SIDEBAR
    // =========================================================================

    function _selectLocation(locationId) {
        if (!locationId) return;
        var ui = _requireUIState();

        var previous = ui.getSelectedLocationId();
        if (previous === locationId) {
            window.TabManager.renderActive(SCOPE);
            return;
        }

        ui.setSelectedLocationId(locationId);
        window.TabManager.renderActive(SCOPE);

        if (window.innerWidth <= 768) _closeSidebar();
    }

    function _setupSidebar() {
        var container = document.getElementById(ID_SIDEBAR);
        if (!container) return;

        if (window.LocationUI && typeof window.LocationUI.renderLocationList === 'function') {
            try {
                window.LocationUI.renderLocationList(ID_SIDEBAR, {
                    selectedId: _requireUIState().getSelectedLocationId(),
                    onSelect: function (placeOrId) {
                        var id = (typeof placeOrId === 'string')
                            ? placeOrId
                            : (placeOrId && placeOrId.id ? placeOrId.id : null);
                        if (id) _selectLocation(id);
                    }
                });
                return;
            } catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error(
                        'education-manager-bootstrap: renderLocationList threw:', e
                    );
                }
            }
        }

        var places = (typeof window.getPlaces === 'function') ? window.getPlaces() : [];
        if (!Array.isArray(places) || places.length === 0) {
            container.innerHTML = '<div class="empty-state">No locations found</div>';
            return;
        }

        var sorted = places.slice().sort(function (a, b) {
            return String(a.displayName || a.name || '')
                .localeCompare(String(b.displayName || b.name || ''));
        });

        var currentId = _requireUIState().getSelectedLocationId();
        var html = '';
        for (var i = 0; i < sorted.length; i++) {
            var p = sorted[i];
            if (!p || !p.id) continue;
            var isSelected = p.id === currentId;
            html += '<div class="place-item' + (isSelected ? ' selected' : '') +
                '" data-place-id="' + _escapeHtml(p.id) + '">' +
                _escapeHtml(p.displayName || p.name || 'Unknown') +
                '</div>';
        }
        container.innerHTML = html;

        var rows = container.querySelectorAll('.place-item');
        for (var j = 0; j < rows.length; j++) {
            (function (row) {
                row.addEventListener('click', function () {
                    var id = row.getAttribute('data-place-id');
                    if (id) _selectLocation(id);
                });
            })(rows[j]);
        }
    }

    // =========================================================================
    // 8. INITIAL LOCATION
    // =========================================================================

    function _pickInitialLocation() {
        if (typeof window.getPlaces !== 'function') return null;
        var places = window.getPlaces();
        if (!Array.isArray(places) || places.length === 0) return null;

        for (var i = 0; i < places.length; i++) {
            var p = places[i];
            if (p && p.variableKey && p.variableKey !== 'world_root') {
                return p.id;
            }
        }
        return places[0] && places[0].id ? places[0].id : null;
    }

    // =========================================================================
    // 9. TOPBAR ACTIONS
    // =========================================================================

    function _setupTopBar() {
        var importBtn = document.getElementById(ID_IMPORT_BTN);
        if (importBtn) {
            importBtn.addEventListener('click', function () {
                if (typeof window.importData !== 'function') {
                    _toast('Import is not available.', 'error');
                    return;
                }
                window.importData().then(function () {
                    _hydrateEducationState();
                    _setupSidebar();
                    _requireUIState().setSelectedLocationId(
                        _requireUIState().getSelectedLocationId() || _pickInitialLocation()
                    );
                    window.TabManager.renderActive(SCOPE);
                    _toast('Import successful', 'success');
                }).catch(function (err) {
                    _toast(
                        'Import failed: ' +
                        (err && err.message ? err.message : 'unknown'),
                        'error'
                    );
                });
            });
        }

        var exportBtn = document.getElementById(ID_EXPORT_BTN);
        if (exportBtn) {
            exportBtn.addEventListener('click', function () {
                if (typeof window.exportData !== 'function') {
                    _toast('Export is not available.', 'error');
                    return;
                }
                try {
                    window.exportData();
                    _toast('Export started', 'success');
                } catch (e) {
                    _toast(
                        'Export failed: ' + (e && e.message ? e.message : 'unknown'),
                        'error'
                    );
                }
            });
        }

        var refreshBtn = document.getElementById(ID_REFRESH_BTN);
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function () {
                if (typeof window.loadMasterData === 'function') {
                    window.loadMasterData();
                }
                _hydrateEducationState();
                _setupSidebar();
                window.TabManager.renderActive(SCOPE);
                _toast('Refreshed', 'success');
            });
        }

        var yearInput = document.getElementById(ID_YEAR_INPUT);
        var yearBtn   = document.getElementById(ID_YEAR_BTN);
        if (yearInput && yearBtn) {
            _syncYearInput();
            yearBtn.addEventListener('click', _applyYear);
            yearInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { e.preventDefault(); _applyYear(); }
            });
        }

        var menuToggle = document.getElementById(ID_MENU_TOGGLE);
        if (menuToggle) {
            menuToggle.addEventListener('click', function () {
                var s = document.getElementById(ID_SIDEBAR_BTN);
                if (!s) return;
                if (s.classList.contains('visible')) _closeSidebar();
                else _openSidebar();
            });
        }
        var overlay = document.getElementById(ID_OVERLAY);
        if (overlay) overlay.addEventListener('click', _closeSidebar);
    }

    function _syncYearInput() {
        try {
            var y = (typeof window.getCurrentYear === 'function')
                ? window.getCurrentYear()
                : (window.masterData && window.masterData.data
                    ? window.masterData.data.currentYear
                    : null);
            var input = document.getElementById(ID_YEAR_INPUT);
            if (input && typeof y === 'number' && isFinite(y)) {
                input.value = String(y);
            }
        } catch (e) { /* ignore */ }
    }

    function _applyYear() {
        var input = document.getElementById(ID_YEAR_INPUT);
        if (!input) return;
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
                if (window.setCurrentYear(y) === false) {
                    _toast('Could not set year', 'error');
                    return;
                }
                applied = true;
            } catch (e) {
                _toast(
                    'Set year failed: ' + (e.message || 'unknown'),
                    'error'
                );
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
        }

        _toast('Year set to ' + y, 'success');
        _syncYearInput();
        window.TabManager.renderActive(SCOPE);
    }

    function _closeSidebar() {
        var s = document.getElementById(ID_SIDEBAR_BTN);
        var o = document.getElementById(ID_OVERLAY);
        if (s) s.classList.remove('visible');
        if (o) o.classList.remove('active');
    }

    function _openSidebar() {
        var s = document.getElementById(ID_SIDEBAR_BTN);
        var o = document.getElementById(ID_OVERLAY);
        if (s) s.classList.add('visible');
        if (o) o.classList.add('active');
    }

    // =========================================================================
    // 10. HYDRATION
    // =========================================================================

    function _hydrateEducationState() {
        var state = _requireState();
        var raw = [];
        try {
            raw = (window.masterData && window.masterData.data &&
                   window.masterData.data.educationalInstitutions) || [];
        } catch (e) {
            raw = [];
        }
        try {
            state.hydrateFromMasterData(raw);
            return true;
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'education-manager-bootstrap: EducationState hydrate failed:', e
                );
            }
            return false;
        }
    }

    // =========================================================================
    // 11. INIT
    // =========================================================================

    var _initialized = false;

    function init() {
        if (_initialized) return;
        _initialized = true;

        var TabManager;
        var uiState;
        try {
            TabManager = _requireTabManager();
            uiState    = _requireUIState();
            _requireQueries();
            _requireState();
        } catch (depErr) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('education-manager-bootstrap:', depErr);
            }
            var empty = document.getElementById(ID_EMPTY_STATE);
            if (empty) {
                empty.textContent =
                    'Education Manager cannot initialize: ' + depErr.message;
                empty.style.color = 'var(--danger)';
            }
            return;
        }

        try {
            if (typeof window.initializeStorage === 'function') {
                window.initializeStorage();
            }
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'education-manager-bootstrap: initializeStorage threw:', e
                );
            }
        }

        try {
            if (typeof window.loadMasterData === 'function') {
                window.loadMasterData();
            }
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'education-manager-bootstrap: loadMasterData threw:', e
                );
            }
        }

        var hydratedOk = _hydrateEducationState();
        if (!hydratedOk) {
            var emptyEl = document.getElementById(ID_EMPTY_STATE);
            if (emptyEl) {
                emptyEl.textContent =
                    'Education state could not hydrate. See console for details.';
                emptyEl.style.color = 'var(--danger)';
            }
            return;
        }

        uiState.setKnownTabIds(KNOWN_TAB_IDS);

        TabManager.configure(SCOPE, {
            // containerRoot must contain BOTH the tab strip and the
            // panes. #educationTabStrip and #panelContent are siblings
            // inside .main-panel; the strip's parentNode is .main-panel.
            containerRoot: _resolveContainerRoot(),

            resolveContainer: function (tabId) {
                return document.getElementById('education-pane-' + tabId);
            },

            buildContext: _buildContext,

            getActiveTabId: function () {
                return uiState.getActiveTabId();
            },

            setActiveTabId: function (tabId) {
                uiState.setActiveTabId(tabId);
                // Visual sync: strip buttons AND panes. TabManager does
                // not toggle .active on the panes, so this is the only
                // place that drives the CSS .tab-pane display rule.
                _syncTabStrip(tabId);
            },

            buildEmptyState: _buildEmptyState
        });

        TabManager.init();

        _setupSidebar();
        _setupTopBar();

        var initialLocationId = uiState.getSelectedLocationId() || _pickInitialLocation();
        if (initialLocationId) {
            uiState.setSelectedLocationId(initialLocationId);
        }

        _syncTabStrip(uiState.getActiveTabId());

        TabManager.renderActive(SCOPE);
    }

    // =========================================================================
    // 12. AUTO-INIT
    // =========================================================================

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // =========================================================================
    // 13. EXPORTS
    // =========================================================================

    window.EducationManagerBootstrap = {
        init: init,

        navigate: function (locationId, tabId) {
            var ui = _requireUIState();
            if (locationId) {
                ui.setSelectedLocationId(locationId);
                _setupSidebar();
            }
            if (tabId) {
                window.TabManager.activate(SCOPE, tabId);
            } else {
                window.TabManager.renderActive(SCOPE);
            }
        }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.EducationManagerBootstrap;
    }
})();
