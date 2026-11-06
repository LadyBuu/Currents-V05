// js/tabs/location-manager-bootstrap.js
/**
 * =============================================================================
 * LOCATION MANAGER BOOTSTRAP
 * js/tabs/location-manager-bootstrap.js
 * =============================================================================
 *
 * LOCATION: js/tabs/location-manager-bootstrap.js
 *
 * Single orchestrator for LocationManager.html. Owns:
 *   - TabManager.configure / TabManager.init
 *   - The tab strip (#locationTabStrip) and pane (#panelContent) visual sync
 *   - The active-tab id (module-local; NOT stored on LocationUIState)
 *   - Sidebar rendering + selection wiring
 *   - Topbar wiring (Add / Edit / Delete / Import / Export / Refresh / Year)
 *   - Initial selected location pick (first non-world-root place)
 *
 * RENDERER CONTRACT (per tab):
 *   fn(container, context) where context = { locationId, locationName }
 *
 * NON-OBVIOUS DECISIONS:
 *   1. containerRoot must contain both the tab strip and the pane container.
 *      TabManager's click router walks up from the click target and asks
 *      each scope's containerRoot.contains(button). If containerRoot were
 *      only #panelContent (a sibling of the strip), clicks on the strip
 *      would fail to route. We use strip.parentNode (.main-panel).
 *   2. TabManager does NOT toggle .active on panes. _syncTabStrip must.
 *   3. init() is idempotent.
 *   4. Hydrate LocationState before TabManager.configure.
 *   5. TabManager.requestRender REQUIRES (scope, tabId).
 *   6. Active-tab state is LOCAL to this bootstrap. It is NOT stored on
 *      LocationUIState — that object owns sidebar selection / expansion /
 *      filter state, and coupling tab state to it caused a silent failure
 *      when the UI state surface didn't include the tab methods.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   - Extracted from the inline MANAGER INIT + SUBTAB HOST scripts.
 *   - Fix: every requestRender() call now passes (SCOPE, _activeTabId).
 *   - Fix: active-tab state is module-local. The bootstrap no longer calls
 *     LocationUIState.getActiveTabId / setActiveTabId / setKnownTabIds.
 *     It keeps its own `_activeTabId` and routes it through TabManager's
 *     configure() hooks.
 *   - Fix: _ensureStripAndPanes and _syncTabStrip are called unconditionally
 *     at init, so the strip and panes exist even when the UI state surface
 *     is incomplete.
 * =============================================================================
 */

(function () {
    'use strict';

    var SCOPE = 'location';
    var KNOWN_TAB_IDS = ['details', 'hierarchy', 'population', 'movement', 'leadership'];
    var DEFAULT_ACTIVE_TAB_ID = 'details';

    // Active-tab state — module-local, single source of truth for this scope.
    var _activeTabId = DEFAULT_ACTIVE_TAB_ID;

    // =========================================================================
    // 1. DEPENDENCY HELPERS (throw — init() catches and renders a failure)
    // =========================================================================

    function _requireTabManager() {
        if (!window.TabManager
            || typeof window.TabManager.configure !== 'function'
            || typeof window.TabManager.register !== 'function'
            || typeof window.TabManager.init !== 'function'
            || typeof window.TabManager.renderActive !== 'function'
            || typeof window.TabManager.requestRender !== 'function') {
            throw new Error(
                'location-manager-bootstrap: TabManager is missing. Load js/core/tab-manager.js first.'
            );
        }
        return window.TabManager;
    }
    function _requireQueries() {
        if (!window.LocationQueries
            || typeof window.LocationQueries.getPlace !== 'function'
            || typeof window.LocationQueries.getPlaceSummaries !== 'function') {
            throw new Error(
                'location-manager-bootstrap: LocationQueries is missing. Load location-queries.js first.'
            );
        }
        return window.LocationQueries;
    }
    function _requireUIState() {
        if (!window.LocationUIState) {
            throw new Error(
                'location-manager-bootstrap: LocationUIState is missing. Load location-ui-state.js first.'
            );
        }
        return window.LocationUIState;
    }
    function _requireState() {
        if (!window.LocationState || typeof window.LocationState.getPlaceById !== 'function') {
            throw new Error(
                'location-manager-bootstrap: LocationState is missing. Load location-state.js first.'
            );
        }
        return window.LocationState;
    }

    // =========================================================================
    // 2. PRESENTATION HELPERS
    // =========================================================================

    function _esc(v) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(v);
        if (v === null || v === undefined) return '';
        return String(v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function _icon(name) {
        if (typeof window.getIcon === 'function') {
            try {
                var s = window.getIcon(name);
                if (typeof s === 'string') return s;
            } catch (e) { /* fall through */ }
        }
        if (window.Icons && typeof window.Icons[name] === 'string') return window.Icons[name];
        return '';
    }
    function _toast(msg, type) {
        if (typeof window.showToast === 'function') window.showToast(msg, type);
    }
    function _iconWithText(iconName, text) {
        var icon = _icon(iconName);
        if (!icon) return text || '';
        return '<span class="tb-btn-glyph">' + icon + '</span><span>' + (text || '') + '</span>';
    }

    // =========================================================================
    // 3. TAB STRIP + PANE MIRROR
    // =========================================================================

    function _tabLabel(id) {
        switch (id) {
            case 'details':    return 'Details';
            case 'hierarchy':  return 'Hierarchy';
            case 'population': return 'Population';
            case 'movement':   return 'Movement';
            case 'leadership': return 'Leadership';
            default:           return id;
        }
    }

    function _ensureStripAndPanes() {
        var strip = document.getElementById('locationTabStrip');
        var panel = document.getElementById('panelContent');
        if (!strip || !panel) {
            throw new Error(
                'location-manager-bootstrap: #locationTabStrip or #panelContent is missing from the shell.'
            );
        }

        // Strip buttons. Idempotent: only write if the strip is empty or the
        // ids drifted from KNOWN_TAB_IDS.
        var needStrip = strip.children.length !== KNOWN_TAB_IDS.length;
        if (!needStrip) {
            for (var i = 0; i < KNOWN_TAB_IDS.length; i++) {
                var btn = strip.querySelector('[data-tab="' + KNOWN_TAB_IDS[i] + '"]');
                if (!btn) { needStrip = true; break; }
            }
        }
        if (needStrip) {
            var html = '';
            for (var j = 0; j < KNOWN_TAB_IDS.length; j++) {
                var id = KNOWN_TAB_IDS[j];
                html += '<button type="button" class="manager-subtab" ' +
                    'data-tab="' + _esc(id) + '" role="tab" ' +
                    'aria-selected="false" tabindex="-1">' +
                    '<span>' + _esc(_tabLabel(id)) + '</span>' +
                '</button>';
            }
            strip.innerHTML = html;
        }

        // Panes. Idempotent by id.
        var panes = '';
        for (var k = 0; k < KNOWN_TAB_IDS.length; k++) {
            var pid = KNOWN_TAB_IDS[k];
            if (!document.getElementById(SCOPE + '-pane-' + pid)) {
                panes += '<div class="manager-pane" id="' + SCOPE + '-pane-' + pid + '" ' +
                    'data-tab-content="' + _esc(pid) + '" role="tabpanel"></div>';
            }
        }
        if (panes) panel.insertAdjacentHTML('beforeend', panes);
    }

    function _syncTabStrip(tabId) {
        var strip = document.getElementById('locationTabStrip');
        if (strip) {
            var buttons = strip.querySelectorAll('[data-tab]');
            for (var i = 0; i < buttons.length; i++) {
                var b = buttons[i];
                var isActive = b.getAttribute('data-tab') === tabId;
                if (isActive) b.classList.add('active'); else b.classList.remove('active');
                b.setAttribute('aria-selected', isActive ? 'true' : 'false');
                b.setAttribute('tabindex', isActive ? '0' : '-1');
            }
        }
        var panel = document.getElementById('panelContent');
        if (panel) {
            var paneEls = panel.querySelectorAll('[data-tab-content]');
            for (var k = 0; k < paneEls.length; k++) {
                var p = paneEls[k];
                if (p.getAttribute('data-tab-content') === tabId) p.classList.add('active');
                else p.classList.remove('active');
            }
        }
    }

    function _setActiveTabId(tabId) {
        if (typeof tabId !== 'string' || tabId.length === 0) return;
        if (KNOWN_TAB_IDS.indexOf(tabId) === -1) return;
        _activeTabId = tabId;
        _syncTabStrip(tabId);
    }

    function _requestRender() {
        var TM = window.TabManager;
        if (!TM || typeof TM.requestRender !== 'function') return;
        try {
            TM.requestRender(SCOPE, _activeTabId);
        } catch (e) {
            console.error('[location-manager] requestRender failed:', e);
        }
    }

    // =========================================================================
    // 4. CONTEXT BUILDER
    // =========================================================================

    function _placeName(placeId) {
        if (!placeId) return '';
        var p = window.LocationQueries.getPlace(placeId);
        return (p && p.displayName) ? p.displayName : '';
    }

    function _buildContext() {
        var ui = _requireUIState();
        var locationId = ui.getSelectedLocationId();
        if (!locationId) return null;
        return {
            locationId: locationId,
            locationName: _placeName(locationId)
        };
    }

    // =========================================================================
    // 5. EMPTY STATES
    // =========================================================================

    function _buildEmptyState(tabId, reason) {
        if (reason === 'no-context') {
            return '<div class="empty-state">Select a location from the sidebar.</div>';
        }
        if (reason === 'no-renderer') {
            return '<div class="empty-state">The "' + _esc(tabId) + '" tab is not loaded. ' +
                   'Check that js/tabs/location-' + _esc(tabId) + '-tab.js is in the load order.</div>';
        }
        if (reason === 'no-container') {
            return '<div class="empty-state" style="color:var(--danger);">' +
                   'Missing pane for "' + _esc(tabId) + '".</div>';
        }
        return '';
    }

    // =========================================================================
    // 6. SIDEBAR
    // =========================================================================

    var _currentPlaceId = null;

    function _cssEscape(s) {
        if (typeof window.CSS !== 'undefined' && typeof window.CSS.escape === 'function') {
            return window.CSS.escape(s);
        }
        return String(s).replace(/([^A-Za-z0-9_-])/g, '\\$1');
    }

    function _setupSidebar() {
        var container = document.getElementById('placeList');
        if (!container) return;

        if (window.LocationUI && typeof window.LocationUI.renderLocationList === 'function') {
            try {
                window.LocationUI.renderLocationList('placeList', {
                    selectedId: _currentPlaceId,
                    onSelect: function (placeOrId) {
                        var id = (typeof placeOrId === 'string')
                            ? placeOrId
                            : (placeOrId && placeOrId.id ? placeOrId.id : null);
                        if (!id) return;
                        _selectLocation(id);
                    }
                });
                return;
            } catch (e) {
                console.error('[location-manager] renderLocationList failed:', e);
            }
        }

        var places = (typeof window.getPlaces === 'function') ? window.getPlaces() : [];
        if (places && places.length > 0) {
            var html = '';
            for (var i = 0; i < places.length; i++) {
                var p = places[i];
                var sel = (p.id === _currentPlaceId);
                html += '<div class="place-item' + (sel ? ' selected' : '') +
                        '" data-place-id="' + _esc(p.id) + '">' +
                        _esc(p.displayName || p.name || 'Unknown') +
                        '</div>';
            }
            container.innerHTML = html;
            var items = container.querySelectorAll('.place-item');
            for (var j = 0; j < items.length; j++) {
                (function (item) {
                    item.addEventListener('click', function () {
                        var placeId = this.dataset.placeId;
                        if (placeId) _selectLocation(placeId);
                    });
                })(items[j]);
            }
        } else {
            container.innerHTML = '<div class="empty-state">No locations found.</div>';
        }
    }

    function _applySidebarSelection(previousId, nextId) {
        var container = document.getElementById('placeList');
        if (!container) return;
        var newRow = container.querySelector(
            '.location-tree-item[data-node-id="' + _cssEscape(nextId) + '"]'
        );
        if (!newRow) { _setupSidebar(); return; }
        if (previousId) {
            var prevRow = container.querySelector(
                '.location-tree-item[data-node-id="' + _cssEscape(previousId) + '"]'
            );
            if (prevRow) prevRow.classList.remove('is-selected');
        }
        newRow.classList.add('is-selected');
    }

    function _selectLocation(id) {
        if (!id) return;

        if (id === _currentPlaceId) {
            _requestRender();
            return;
        }

        var previousId = _currentPlaceId;
        _currentPlaceId = id;

        var editBtn = document.getElementById('editPlaceBtn');
        var deleteBtn = document.getElementById('deletePlaceBtn');
        if (editBtn) editBtn.disabled = false;
        if (deleteBtn) deleteBtn.disabled = false;

        try {
            if (window.LocationUIState && typeof window.LocationUIState.setSelectedLocationId === 'function') {
                window.LocationUIState.setSelectedLocationId(id);
            }
        } catch (e) { /* ignore */ }

        _applySidebarSelection(previousId, id);
        _requestRender();

        if (window.innerWidth <= 768) _closeSidebar();
    }

    // =========================================================================
    // 7. TOPBAR
    // =========================================================================

    function _setupTopbarText() {
        var title = document.getElementById('locationManagerTitle');
        if (title) title.innerHTML = _iconWithText('LOCATION', ' LOCATION MANAGER');

        var sidebarTitle = document.getElementById('sidebarTitle');
        if (sidebarTitle) sidebarTitle.innerHTML = _iconWithText('LOCATION', ' LOCATIONS');

        var addBtn = document.getElementById('addPlaceBtn');
        if (addBtn) addBtn.innerHTML = _iconWithText('PLUS', ' Add Location');
        var editBtn = document.getElementById('editPlaceBtn');
        if (editBtn) editBtn.innerHTML = _iconWithText('EDIT', ' Edit');
        var deleteBtn = document.getElementById('deletePlaceBtn');
        if (deleteBtn) deleteBtn.innerHTML = _iconWithText('TRASH', ' Delete');
        var importBtn = document.getElementById('importBtn');
        if (importBtn) importBtn.innerHTML = _iconWithText('ARROW_RIGHT', ' Import');
        var exportBtn = document.getElementById('exportBtn');
        if (exportBtn) exportBtn.innerHTML = _iconWithText('ARROW_RIGHT', ' Export');
        var refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) refreshBtn.innerHTML = _iconWithText('REFRESH', ' Refresh');
    }

    function _setupYearControl() {
        var input = document.getElementById('yearInput');
        var btn = document.getElementById('setYearBtn');
        if (!input || !btn) return;

        function sync() {
            try {
                var y = (typeof window.getCurrentYear === 'function')
                    ? window.getCurrentYear()
                    : (window.masterData && window.masterData.data
                        ? window.masterData.data.currentYear : null);
                if (typeof y === 'number' && isFinite(y)) input.value = String(y);
            } catch (e) { /* ignore */ }
        }
        sync();

        function applyYear() {
            var y = parseInt(input.value, 10);
            if (!isFinite(y)) { _toast('Enter a valid year', 'error'); return; }
            if (typeof window.isValidYear === 'function' && window.isValidYear(y) !== true) {
                _toast('Year out of range', 'error'); return;
            }
            var applied = false;
            if (typeof window.setCurrentYear === 'function') {
                try {
                    if (window.setCurrentYear(y) === false) {
                        _toast('Could not set year', 'error'); return;
                    }
                    applied = true;
                } catch (e) {
                    _toast('Set year failed: ' + (e.message || 'unknown'), 'error'); return;
                }
            }
            if (!applied) {
                if (!window.masterData || !window.masterData.data) {
                    _toast('Storage not initialized', 'error'); return;
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
            sync();
            _setupSidebar();
            _requestRender();
        }

        btn.addEventListener('click', applyYear);
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); applyYear(); }
        });
    }

    function _setupTopbarActions() {
        var addBtn = document.getElementById('addPlaceBtn');
        if (addBtn) addBtn.onclick = function () {
            if (typeof window.openAddPlaceModal !== 'function') {
                _toast('Add modal unavailable', 'error'); return;
            }
            window.openAddPlaceModal(null, function (newId) {
                _setupSidebar();
                if (newId) _selectLocation(newId);
            });
        };

        var editBtn = document.getElementById('editPlaceBtn');
        if (editBtn) editBtn.onclick = function () {
            if (!_currentPlaceId) return;
            if (typeof window.openEditPlaceModal !== 'function') {
                _toast('Edit modal unavailable', 'error'); return;
            }
            window.openEditPlaceModal(_currentPlaceId, function () {
                _setupSidebar();
                _requestRender();
            });
        };

        var deleteBtn = document.getElementById('deletePlaceBtn');
        if (deleteBtn) deleteBtn.onclick = function () {
            if (!_currentPlaceId) return;
            if (typeof window.openDeletePlaceModal !== 'function') {
                _toast('Delete modal unavailable', 'error'); return;
            }
            window.openDeletePlaceModal(_currentPlaceId, function () {
                _currentPlaceId = null;
                var e = document.getElementById('editPlaceBtn');
                var d = document.getElementById('deletePlaceBtn');
                if (e) e.disabled = true;
                if (d) d.disabled = true;
                _setupSidebar();
                _pickInitialSelection();
            });
        };

        var importBtn = document.getElementById('importBtn');
        if (importBtn) importBtn.onclick = function () {
            if (typeof window.importData !== 'function') {
                _toast('Import not available', 'error'); return;
            }
            window.importData().then(function () {
                if (window.LocationBootstrap && typeof window.LocationBootstrap.init === 'function') {
                    try { window.LocationBootstrap.init(); } catch (e) { /* ignore */ }
                }
                _setupSidebar();
                _requestRender();
                _toast('Import successful', 'success');
            }).catch(function (err) {
                _toast('Import failed: ' + (err && err.message ? err.message : 'unknown'), 'error');
            });
        };

        var exportBtn = document.getElementById('exportBtn');
        if (exportBtn) exportBtn.onclick = function () {
            if (typeof window.exportData !== 'function') {
                _toast('Export not available', 'error'); return;
            }
            try { window.exportData(); _toast('Export started', 'success'); }
            catch (e) { _toast('Export failed: ' + (e.message || 'unknown'), 'error'); }
        };

        var refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) refreshBtn.onclick = function () {
            if (typeof window.loadMasterData === 'function') window.loadMasterData();
            window.setTimeout(function () {
                _setupSidebar();
                _requestRender();
                _toast('Refreshed', 'success');
            }, 100);
        };
    }

    // =========================================================================
    // 8. MOBILE SIDEBAR
    // =========================================================================

    function _closeSidebar() {
        var s = document.getElementById('locationsSidebar');
        var o = document.getElementById('sidebarOverlay');
        if (s) s.classList.remove('visible');
        if (o) o.classList.remove('active');
    }
    function _openSidebar() {
        var s = document.getElementById('locationsSidebar');
        var o = document.getElementById('sidebarOverlay');
        if (s) s.classList.add('visible');
        if (o) o.classList.add('active');
    }
    function _toggleSidebar() {
        var s = document.getElementById('locationsSidebar');
        if (!s) return;
        if (s.classList.contains('visible')) _closeSidebar();
        else _openSidebar();
    }

    // =========================================================================
    // 9. INITIAL SELECTION
    // =========================================================================

    function _pickInitialSelection() {
        if (_currentPlaceId) return;
        var places = (typeof window.getPlaces === 'function') ? window.getPlaces() : [];
        if (!places || places.length === 0) return;
        for (var i = 0; i < places.length; i++) {
            if (places[i].variableKey && places[i].variableKey !== 'world_root') {
                _selectLocation(places[i].id);
                return;
            }
        }
        _selectLocation(places[0].id);
    }

    // =========================================================================
    // 10. INIT
    // =========================================================================

    var _initialized = false;

    function init() {
        if (_initialized) return;
        _initialized = true;

        var TabManager, uiState;
        try {
            TabManager = _requireTabManager();
            uiState = _requireUIState();
            _requireQueries();
            _requireState();
        } catch (depErr) {
            var panel = document.getElementById('panelContent');
            if (panel) {
                panel.innerHTML =
                    '<div class="empty-state" style="color:var(--danger);">' +
                    _esc(depErr.message) + '</div>';
            }
            if (typeof console !== 'undefined' && console.error) {
                console.error('[location-manager-bootstrap] dependency check failed:', depErr);
            }
            return;
        }

        try { if (typeof window.loadMasterData === 'function') window.loadMasterData(); } catch (e) { /* ignore */ }
        if (window.LocationBootstrap) {
            try { window.LocationBootstrap.init(); }
            catch (e) { console.error('[location-manager-bootstrap] LocationBootstrap.init failed:', e); }
        }

        // Build the strip and panes before configuring TabManager. If this
        // throws, the failure is rendered visibly and init aborts.
        try { _ensureStripAndPanes(); }
        catch (e) {
            var p = document.getElementById('panelContent');
            if (p) p.innerHTML =
                '<div class="empty-state" style="color:var(--danger);">' +
                _esc(e.message) + '</div>';
            if (typeof console !== 'undefined' && console.error) {
                console.error('[location-manager-bootstrap] _ensureStripAndPanes failed:', e);
            }
            return;
        }

        // Establish the initial active tab (module-local, no UIState dependency).
        if (KNOWN_TAB_IDS.indexOf(_activeTabId) === -1) {
            _activeTabId = DEFAULT_ACTIVE_TAB_ID;
        }
        _syncTabStrip(_activeTabId);

        var strip = document.getElementById('locationTabStrip');
        var containerRoot = strip ? strip.parentNode : document.getElementById('panelContent');

        TabManager.configure(SCOPE, {
            containerRoot: containerRoot,
            resolveContainer: function (tabId) {
                return document.getElementById(SCOPE + '-pane-' + tabId);
            },
            buildContext: _buildContext,
            getActiveTabId: function () {
                return _activeTabId;
            },
            setActiveTabId: function (tabId) {
                _setActiveTabId(tabId);
            },
            buildEmptyState: _buildEmptyState
        });

        TabManager.init();

        // Route 'locationSelected' (emitted by the hierarchy tab's Go-to buttons).
        document.addEventListener('locationSelected', function (e) {
            var id = e && e.detail && e.detail.id;
            if (id) _selectLocation(id);
        });

        _setupTopbarText();
        _setupTopbarActions();
        _setupYearControl();
        _setupSidebar();

        var menuToggle = document.getElementById('menuToggle');
        if (menuToggle) menuToggle.addEventListener('click', _toggleSidebar);
        var overlay = document.getElementById('sidebarOverlay');
        if (overlay) overlay.addEventListener('click', _closeSidebar);

        // Pick the initial place, then render the active tab.
        _pickInitialSelection();
        if (!_currentPlaceId) {
            var p2 = document.getElementById('panelContent');
            if (p2) {
                p2.innerHTML = '<div class="empty-state">Select a location from the sidebar.</div>';
            }
        } else {
            TabManager.renderActive(SCOPE);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.LocationManagerBootstrap = { init: init };
})();
