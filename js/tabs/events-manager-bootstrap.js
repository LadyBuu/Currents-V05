/**
 * =============================================================================
 * STILL WATERS - EVENTS MANAGER BOOTSTRAP
 * js/tabs/events-manager-bootstrap.js
 * =============================================================================
 *
 * LOCATION: js/tabs/events-manager-bootstrap.js
 *
 * Orchestrator for the Events Manager page. Configures TabManager for
 * the 'events' scope, wires the sidebar and topbar, calls
 * EventsBootstrap.init() before configuring TabManager, and renders
 * the initial tab.
 *
 * SCOPE:
 *   - TabManager.configure('events', ...)   -- the scope config
 *   - TabManager.init()                     -- the click router
 *   - Sidebar: location list + "All Locations" default
 *   - Topbar: year / import / export / refresh / theme
 *   - Initial LOCATION selection (default is "all locations"; the
 *     user picks a specific one)
 *   - Initial tab render
 *
 * OUT OF SCOPE:
 *   - Any facet's tab body               -> events-*-tab.js
 *   - Any domain read or write           -> EventsQueries / owning domain
 *   - Any modal                          -> modals-*.js
 *   - Any styling                        -> per-tab injected stylesheet
 *   - Topbar theme switcher internals    -> css/themes.css + ThemeSwitcher
 *
 * CONTAINER ROOT (IMPORTANT):
 *   TabManager's click router finds [data-tab] buttons by walking up
 *   from the click target and asking each configured scope's
 *   containerRoot.contains(button). The containerRoot MUST contain
 *   BOTH the tab strip AND the pane container.
 *
 *   In EventsManager.html, #eventsTabStrip and #panelContent are
 *   siblings inside .main-panel. containerRoot is set to the strip's
 *   parentNode (.main-panel).
 *
 * PANE VISIBILITY (IMPORTANT):
 *   TabManager does NOT toggle .active on the panes; it calls the
 *   renderer with the pane element, which then fills the pane. The
 *   bootstrap's setActiveTabId hook is what toggles .active on the
 *   correct pane so the CSS .tab-pane { display: none } /
 *   .tab-pane.active { display: block } rules switch it into view.
 *
 *   This is the SAME fix education-manager-bootstrap.js applied; the
 *   playbook §4 calls it out as the single most common TabManager
 *   wiring mistake.
 *
 * SIDEBAR DEFAULT:
 *   The sidebar defaults to "All locations" -- the user is not
 *   forced to pick a location to see anything. Selecting a specific
 *   location seeds the tab's location filter; the tab's own "Show
 *   all locations" checkbox in the filter bar can additionally
 *   override it. That two-layer mechanism (sidebar + tab filter)
 *   matches the "either see ALL chars or just chars from the
 *   location i select" requirement.
 *
 * INIT IDEMPOTENCE:
 *   init() is idempotent. The topbar's Refresh action calls
 *   EventsBootstrap.reinit() (which is NOT the same as init();
 *   reinit() forces a fresh pass) rather than calling init() twice.
 *
 * DEPENDENCIES (required at load):
 *   - tab-manager.js       (TabManager)
 *   - events-bootstrap.js  (EventsBootstrap)
 *   - events-constants.js  (EventsConstants)
 *   - ui.js                (showToast; optional at load, used via
 *                          typeof guard)
 *   - world.js             (getPlaces, getCurrentYear; both optional
 *                          at load, guarded at call)
 *
 * DEPENDENCIES (optional, checked at call time):
 *   - LocationUI.renderLocationList   -- preferred sidebar renderer
 *   - window.getPlaces                -- fallback sidebar source
 *   - window.getCurrentYear           -- topbar year display
 *   - window.importData / exportData  -- topbar actions
 *   - window.ThemeSwitcher            -- topbar theme menu
 *
 * ICON POLICY: Uses SVG from icons.js. No emojis.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (Phase 3B):
 *     - KNOWN_TAB_IDS gains 'adoption'. The events-adoption-tab.js
 *       file self-registers at load; adding the id here makes the
 *       bootstrap's setActiveTabId and _syncTabStrip accept clicks
 *       on the adoption strip button. Without this entry, a click
 *       on 'adoption' falls through to DEFAULT_ACTIVE_TAB_ID and
 *       re-renders the deaths tab instead.
 *     - No other behavioural change. Every existing facet keeps its
 *       exact id and default.
 *   Previous revision (Phase 3A):
 *     - KNOWN_TAB_IDS gains 'stork'. Events-stork-tab.js
 *       self-registers at load; this entry makes its strip button
 *       clickable.
 *   Initial revision:
 *     - Follows the education-manager-bootstrap.js pattern: one file
 *       owns TabManager.configure, TabManager.init, sidebar,
 *       topbar, initial render.
 *     - Sidebar default is null (all locations) rather than "first
 *       place". The Deaths tab is meaningful at the "all locations"
 *       scale, so the tab must work in that state, and the sidebar
 *       should start there.
 *     - setActiveTabId calls _syncTabStrip, which toggles .active
 *       on both the strip buttons AND the panes.
 *     - _buildContext returns a non-null object even when no
 *       location is selected.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var SCOPE = 'events';

    // The full set of facet tabs. The tab strip renders one button
    // per id; TabManager renders one pane per id. Only the ids with
    // a registered renderer produce content; the rest go through
    // _buildEmptyState's 'no-renderer' branch.
    //
    // Registered in this revision:
    //   deaths      events-deaths-tab.js
    //   stork       events-stork-tab.js
    //   adoption    events-adoption-tab.js
    //   disasters   events-disasters-tab.js
    //
    // Declared but not yet registered:
    //   surrogacy, social, educational  -> empty-state "not loaded"
    var KNOWN_TAB_IDS = [
        'deaths',
        'stork',
        'adoption',
        'surrogacy',
        'disasters',
        'social',
        'educational'
    ];

    var DEFAULT_ACTIVE_TAB_ID = 'deaths';

    var ID_TAB_STRIP     = 'eventsTabStrip';
    var ID_PANEL         = 'panelContent';
    var ID_SIDEBAR_LIST  = 'placeList';
    var ID_SIDEBAR_ROOT  = 'locationsSidebar';
    var ID_SIDEBAR_OVERLAY = 'sidebarOverlay';
    var ID_MENU_TOGGLE   = 'menuToggle';
    var ID_EMPTY_STATE   = 'emptyStateText';
    var ID_YEAR_INPUT    = 'yearInput';
    var ID_YEAR_BTN      = 'setYearBtn';
    var ID_IMPORT_BTN    = 'importBtn';
    var ID_EXPORT_BTN    = 'exportBtn';
    var ID_REFRESH_BTN   = 'refreshBtn';

    // =========================================================================
    // 2. DEPENDENCY HELPERS
    // =========================================================================
    //
    // Each helper THROWS a specific, actionable error when its
    // dependency is missing. init() catches the throw and writes a
    // visible error to #emptyStateText. A missing dependency is a
    // load-order bug and must be loud.

    function _requireTabManager() {
        if (!window.TabManager
            || typeof window.TabManager.configure !== 'function'
            || typeof window.TabManager.register !== 'function'
            || typeof window.TabManager.init !== 'function'
            || typeof window.TabManager.renderActive !== 'function'
            || typeof window.TabManager.requestRender !== 'function') {
            throw new Error(
                'events-manager-bootstrap: TabManager is missing or ' +
                'incomplete. Load js/core/tab-manager.js before this file.'
            );
        }
        return window.TabManager;
    }

    function _requireEventsBootstrap() {
        if (!window.EventsBootstrap
            || typeof window.EventsBootstrap.init !== 'function'
            || typeof window.EventsBootstrap.reinit !== 'function') {
            throw new Error(
                'events-manager-bootstrap: EventsBootstrap is missing or ' +
                'incomplete. Load js/events/events-bootstrap.js before ' +
                'this file.'
            );
        }
        return window.EventsBootstrap;
    }

    function _requireEventsConstants() {
        if (!window.EventsConstants
            || typeof window.EventsConstants.getFacet !== 'function'
            || typeof window.EventsConstants.panelIdFor !== 'function') {
            throw new Error(
                'events-manager-bootstrap: EventsConstants is missing or ' +
                'incomplete. Load js/events/events-constants.js before ' +
                'this file.'
            );
        }
        return window.EventsConstants;
    }

    // =========================================================================
    // 3. SMALL HELPERS
    // =========================================================================

    function _esc(v) {
        if (typeof window.escapeHtml === 'function') return window.escapeHtml(v);
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
                var s = window.getIcon(name, 'CIRCLE');
                if (typeof s === 'string') return s;
            } catch (e) { /* fall through */ }
        }
        if (window.Icons && typeof window.Icons[name] === 'string') {
            return window.Icons[name];
        }
        if (window.Icons && typeof window.Icons.CIRCLE === 'string') {
            return window.Icons.CIRCLE;
        }
        return '';
    }

    function _toast(msg, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, type);
        }
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYear === 'function') {
            try {
                var y = window.getCurrentYear();
                if (typeof y === 'number' && Number.isFinite(y)) return y;
            } catch (e) { /* fall through */ }
        }
        return null;
    }

    function _byId(id) {
        return document.getElementById(id);
    }

    // =========================================================================
    // 4. UI STATE FOR THE MANAGER ITSELF
    // =========================================================================
    //
    // The manager's own UI state -- active tab, selected location --
    // lives in module scope. It does NOT persist across page reloads
    // (a fresh page starts on the default tab with "all locations");
    // per-tab filter state DOES persist via UIState (see the tab
    // files). This split is deliberate: the manager shell's
    // "which tab / which location is open" is ephemeral session
    // state, while "which filters did the user set" is durable.

    var _managerState = {
        activeTabId: DEFAULT_ACTIVE_TAB_ID,
        selectedLocationId: null   // null == "All Locations"
    };

    // =========================================================================
    // 5. CONTEXT BUILDER
    // =========================================================================
    //
    // Called by TabManager once per render, per tab. Returns the
    // context object every facet tab consumes. Unlike education (which
    // returns null when there's no selection), the Events Manager
    // returns a context even when no location is selected, because
    // the Deaths tab is meaningful at the "all locations" scale.
    //
    // eventsState carries the pre-computed stats bar (built once per
    // context) so the tab can reuse it. The tab itself can re-derive
    // if eventsState is missing.
    //
    // The context is intentionally read-only: no live references, no
    // mutable canonical state. Every field is either a primitive or
    // a fresh projection.

    function _buildContext() {
        var locationId = _managerState.selectedLocationId;
        var locationName = '';

        if (locationId && typeof window.getPlaceById === 'function') {
            try {
                var place = window.getPlaceById(locationId);
                if (place && typeof place.displayName === 'string') {
                    locationName = place.displayName;
                }
            } catch (e) { /* leave locationName '' */ }
        }

        // Pre-compute the stats bar once per context. The Deaths tab
        // and Stork tab will reuse it; the adoption tab computes its
        // own adoption-specific stats bar and ignores this one. Safe:
        // eventsState is present but optional.
        var statsBar = null;
        if (window.EventsQueries && window.EventsViewModels
            && typeof window.EventsQueries.getCharacterPopulationStats === 'function'
            && typeof window.EventsViewModels.toDeathsStatsBarViewModel === 'function') {
            try {
                var popStats = window.EventsQueries.getCharacterPopulationStats(locationId);
                statsBar = window.EventsViewModels.toDeathsStatsBarViewModel(
                    popStats,
                    { showInLocation: !!locationId }
                );
            } catch (e) {
                statsBar = {
                    available: false,
                    reason: 'Stats bar failed: ' + (e && e.message ? e.message : 'unknown')
                };
            }
        }

        return {
            locationId: locationId,          // null == "all locations"
            locationName: locationName,      // '' when null
            eventsState: {
                statsBar: statsBar
            }
        };
    }

    // =========================================================================
    // 6. EMPTY STATE BUILDER
    // =========================================================================
    //
    // Called by TabManager before invoking a renderer, when the
    // preconditions for rendering are not met. The Events Manager
    // only produces 'no-renderer' and 'no-container' empty states;
    // 'no-context' is unreachable because _buildContext always
    // returns an object.

    function _buildEmptyState(tabId, reason) {
        var C = window.EventsConstants;
        var facet = C ? C.getFacet(tabId) : null;
        var label = (facet && facet.label) ? facet.label : tabId;

        if (reason === 'no-renderer') {
            return '<div class="events-empty">' +
                '<div class="events-empty__icon" style="color:var(--dim);">' +
                _icon('EVENTS') +
                '</div>' +
                '<div class="events-empty__message">' +
                'The ' + _esc(label) + ' tab is not loaded in this build.' +
                '</div>' +
                '<div class="events-empty__sub">' +
                'The tab module may not be loaded yet.' +
                '</div>' +
                '</div>';
        }
        if (reason === 'no-container') {
            return '<div class="events-empty events-empty--error">' +
                '<div class="events-empty__icon" style="color:var(--danger);">' +
                _icon('WARNING') +
                '</div>' +
                '<div class="events-empty__message">' +
                'Missing pane for the ' + _esc(label) + ' tab.' +
                '</div>' +
                '<div class="events-empty__sub">' +
                'This is a bug in EventsManager.html -- check that the pane ' +
                'exists with id="events-pane-' + _esc(tabId) + '" ' +
                'and data-tab-content="' + _esc(tabId) + '".' +
                '</div>' +
                '</div>';
        }
        return '<div class="events-empty">' + _esc(label) + '</div>';
    }

    // =========================================================================
    // 7. TAB STRIP SYNC
    // =========================================================================
    //
    // TabManager calls setActiveTabId when a tab button is clicked,
    // but does NOT toggle .active on the panes. This hook does both:
    //   - strip buttons: .active, aria-selected, tabindex
    //   - panes:         .active
    //
    // Without the pane toggle, the strip highlights the right tab
    // but the pane below stays display:none. That is the playbook
    // §4 bug this function exists to prevent.

    function _syncTabStrip(activeTabId) {
        var strip = _byId(ID_TAB_STRIP);
        var panel = _byId(ID_PANEL);
        if (!strip || !panel) return;

        var buttons = strip.querySelectorAll('[data-tab]');
        for (var i = 0; i < buttons.length; i++) {
            var btn = buttons[i];
            var tabId = btn.getAttribute('data-tab');
            var isActive = (tabId === activeTabId);
            if (isActive) {
                btn.classList.add('active');
                btn.setAttribute('aria-selected', 'true');
                btn.setAttribute('tabindex', '0');
            } else {
                btn.classList.remove('active');
                btn.setAttribute('aria-selected', 'false');
                btn.setAttribute('tabindex', '-1');
            }
        }

        var panes = panel.querySelectorAll('[data-tab-content]');
        for (var j = 0; j < panes.length; j++) {
            var pane = panes[j];
            var paneTabId = pane.getAttribute('data-tab-content');
            if (paneTabId === activeTabId) {
                pane.classList.add('active');
            } else {
                pane.classList.remove('active');
            }
        }
    }

    // =========================================================================
    // 8. CONTAINER ROOT RESOLUTION
    // =========================================================================
    //
    // See CONTAINER ROOT in the module header. containerRoot must
    // contain BOTH the tab strip and the pane container.

    function _resolveContainerRoot() {
        var strip = _byId(ID_TAB_STRIP);
        if (strip && strip.parentNode && typeof strip.parentNode.contains === 'function') {
            return strip.parentNode;
        }
        var panel = _byId(ID_PANEL);
        if (panel) return panel;
        return null;
    }

    function _resolveContainer(tabId) {
        return _byId('events-pane-' + tabId);
    }

    // =========================================================================
    // 9. SIDEBAR
    // =========================================================================
    //
    // The sidebar is a location list. The default selection is null
    // (All Locations). When the user picks a location, the
    // _managerState.selectedLocationId updates, and the tab re-renders
    // with the new context.
    //
    // The sidebar itself re-renders on selection so the highlighted
    // row matches the current state.

    function _renderSidebar() {
        var container = _byId(ID_SIDEBAR_LIST);
        if (!container) return;

        var selectedId = _managerState.selectedLocationId;

        // Preferred: delegate to LocationUI.renderLocationList.
        if (window.LocationUI
            && typeof window.LocationUI.renderLocationList === 'function') {
            try {
                window.LocationUI.renderLocationList(ID_SIDEBAR_LIST, {
                    selectedId: selectedId,
                    // "All Locations" is a synthetic row. LocationUI
                    // supports a firstItem option in some builds; if
                    // not, we fall through to the manual renderer.
                    firstItem: {
                        id: null,
                        label: 'All Locations',
                        icon: 'CIRCLE_DOT'
                    },
                    onSelect: function(placeOrId) {
                        var id = (typeof placeOrId === 'string')
                            ? placeOrId
                            : (placeOrId && placeOrId.id ? placeOrId.id : null);
                        _selectLocation(id);
                    }
                });
                // If LocationUI ignored firstItem (older builds), the
                // "All Locations" row is missing. Detect and fall back.
                if (!container.querySelector('[data-place-id=""], [data-all-locations]')) {
                    // Older LocationUI: append our "All Locations" row
                    // ourselves and wire it.
                    _prependAllLocationsRow(container);
                }
                return;
            } catch (e) {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn(
                        'events-manager-bootstrap: renderLocationList threw; ' +
                        'falling back to manual sidebar', e
                    );
                }
                // Fall through to manual render.
            }
        }

        // Fallback: manual render from getPlaces.
        _renderSidebarManual(container, selectedId);
    }

    function _renderSidebarManual(container, selectedId) {
        var places = (typeof window.getPlaces === 'function')
            ? window.getPlaces()
            : [];
        if (!Array.isArray(places)) places = [];

        var sorted = places.slice().sort(function(a, b) {
            return String(a.displayName || '').localeCompare(String(b.displayName || ''));
        });

        var html = '';
        // "All Locations" is always first.
        html += '<div class="place-item' +
            (selectedId === null ? ' selected' : '') +
            '" data-place-id="">' +
            _icon('CIRCLE_DOT') + ' ' +
            'All Locations' +
            '</div>';
        for (var i = 0; i < sorted.length; i++) {
            var p = sorted[i];
            if (!p || !p.id) continue;
            var isSelected = p.id === selectedId;
            html += '<div class="place-item' + (isSelected ? ' selected' : '') +
                '" data-place-id="' + _esc(p.id) + '">' +
                _esc(p.displayName || 'Unknown') +
                '</div>';
        }
        container.innerHTML = html;

        var rows = container.querySelectorAll('.place-item');
        for (var j = 0; j < rows.length; j++) {
            (function(row) {
                row.addEventListener('click', function() {
                    var id = row.getAttribute('data-place-id') || null;
                    _selectLocation(id);
                });
            })(rows[j]);
        }
    }

    function _prependAllLocationsRow(container) {
        var first = container.firstChild;
        var div = document.createElement('div');
        div.className = 'place-item' +
            (_managerState.selectedLocationId === null ? ' selected' : '');
        div.setAttribute('data-place-id', '');
        div.innerHTML = _icon('CIRCLE_DOT') + ' All Locations';
        div.addEventListener('click', function() {
            _selectLocation(null);
        });
        if (first) container.insertBefore(div, first);
        else container.appendChild(div);
    }

    function _selectLocation(locationId) {
        if (_managerState.selectedLocationId === locationId) return;
        _managerState.selectedLocationId = locationId;

        // Re-render the sidebar to update the selected highlight.
        _renderSidebar();

        // Re-render the active tab with the new context.
        var TM = window.TabManager;
        if (TM && typeof TM.renderActive === 'function') {
            try { TM.renderActive(SCOPE); }
            catch (e) {
                _renderError('Failed to render tab: ' +
                    (e && e.message ? e.message : 'unknown'));
            }
        }

        // Close the mobile sidebar.
        if (window.innerWidth <= 768) _closeSidebar();
    }

    function _selectTab(tabId) {
        if (!tabId || KNOWN_TAB_IDS.indexOf(tabId) === -1) return;
        if (_managerState.activeTabId === tabId) return;
        _managerState.activeTabId = tabId;
        _syncTabStrip(tabId);
        var TM = window.TabManager;
        if (TM && typeof TM.renderActive === 'function') {
            try { TM.renderActive(SCOPE); }
            catch (e) {
                _renderError('Failed to render tab: ' +
                    (e && e.message ? e.message : 'unknown'));
            }
        }
    }

    // =========================================================================
    // 10. TOPBAR
    // =========================================================================

    function _syncYearInput() {
        var input = _byId(ID_YEAR_INPUT);
        if (!input) return;
        var y = _getCurrentYear();
        if (typeof y === 'number') {
            input.value = String(y);
        }
    }

    function _applyYear() {
        var input = _byId(ID_YEAR_INPUT);
        if (!input) return;
        var y = parseInt(input.value, 10);
        if (!isFinite(y)) {
            _toast('Enter a valid year.', 'error');
            return;
        }
        if (typeof window.isValidYear === 'function'
            && window.isValidYear(y) !== true) {
            _toast('Year is out of range.', 'error');
            return;
        }

        if (typeof window.setCurrentYear === 'function') {
            try {
                if (window.setCurrentYear(y) === false) {
                    _toast('Could not set year.', 'error');
                    return;
                }
                _toast('Year set to ' + y + '.', 'success');
                _syncYearInput();
                _reloadAfterMutation();
                return;
            } catch (e) {
                _toast('Set year failed: ' + (e.message || 'unknown'), 'error');
                return;
            }
        }

        // Fallback path (time.js does not export setCurrentYear).
        if (!window.masterData || !window.masterData.data) {
            _toast('Storage is not initialized.', 'error');
            return;
        }
        window.masterData.data.currentYear = y;
        if (typeof window.markDataDirty === 'function') {
            try { window.markDataDirty(); } catch (e) { /* ignore */ }
        }
        if (typeof window.saveMasterData === 'function') {
            try { window.saveMasterData(); } catch (e) { /* ignore */ }
        }
        _toast('Year set to ' + y + '.', 'success');
        _syncYearInput();
        _reloadAfterMutation();
    }

    function _wireTopbar() {
        _syncYearInput();

        var yearBtn = _byId(ID_YEAR_BTN);
        if (yearBtn) yearBtn.addEventListener('click', _applyYear);

        var yearInput = _byId(ID_YEAR_INPUT);
        if (yearInput) {
            yearInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') { e.preventDefault(); _applyYear(); }
            });
        }

        var importBtn = _byId(ID_IMPORT_BTN);
        if (importBtn) {
            importBtn.addEventListener('click', function() {
                if (typeof window.importData !== 'function') {
                    _toast('Import is not available.', 'error');
                    return;
                }
                var p = window.importData();
                if (p && typeof p.then === 'function') {
                    p.then(function() {
                        _reloadAfterMutation();
                        _toast('Import successful.', 'success');
                    }).catch(function(err) {
                        _toast('Import failed: ' +
                            (err && err.message ? err.message : 'unknown'),
                            'error');
                    });
                } else {
                    _reloadAfterMutation();
                }
            });
        }

        var exportBtn = _byId(ID_EXPORT_BTN);
        if (exportBtn) {
            exportBtn.addEventListener('click', function() {
                if (typeof window.exportData !== 'function') {
                    _toast('Export is not available.', 'error');
                    return;
                }
                try {
                    window.exportData();
                    _toast('Export started.', 'success');
                } catch (e) {
                    _toast('Export failed: ' +
                        (e && e.message ? e.message : 'unknown'), 'error');
                }
            });
        }

        var refreshBtn = _byId(ID_REFRESH_BTN);
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function() {
                _reloadAfterMutation();
                _toast('Refreshed.', 'success');
            });
        }

        var menuToggle = _byId(ID_MENU_TOGGLE);
        if (menuToggle) {
            menuToggle.addEventListener('click', function() {
                var s = _byId(ID_SIDEBAR_ROOT);
                if (!s) return;
                if (s.classList.contains('visible')) _closeSidebar();
                else _openSidebar();
            });
        }
        var overlay = _byId(ID_SIDEBAR_OVERLAY);
        if (overlay) overlay.addEventListener('click', _closeSidebar);
    }

    function _openSidebar() {
        var s = _byId(ID_SIDEBAR_ROOT);
        var o = _byId(ID_SIDEBAR_OVERLAY);
        if (s) s.classList.add('visible');
        if (o) o.classList.add('active');
    }

    function _closeSidebar() {
        var s = _byId(ID_SIDEBAR_ROOT);
        var o = _byId(ID_SIDEBAR_OVERLAY);
        if (s) s.classList.remove('visible');
        if (o) o.classList.remove('active');
    }

    // =========================================================================
    // 11. RELOAD SEQUENCE
    // =========================================================================
    //
    // The sequence shared by Refresh, Import completion, and Year
    // change:
    //   1. loadMasterData (if available) -- pulls fresh data from
    //      storage into window.masterData.
    //   2. EventsBootstrap.reinit -- re-verifies + re-hydrates states.
    //   3. Sidebar re-render.
    //   4. Tab re-render.

    function _reloadAfterMutation() {
        if (typeof window.loadMasterData === 'function') {
            try { window.loadMasterData(); }
            catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('events-manager-bootstrap: loadMasterData threw', e);
                }
            }
        }

        if (window.EventsBootstrap && typeof window.EventsBootstrap.reinit === 'function') {
            try { window.EventsBootstrap.reinit(); }
            catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('events-manager-bootstrap: EventsBootstrap.reinit threw', e);
                }
            }
        }

        _renderSidebar();

        var TM = window.TabManager;
        if (TM && typeof TM.renderActive === 'function') {
            try { TM.renderActive(SCOPE); }
            catch (e) {
                _renderError('Failed to render tab: ' +
                    (e && e.message ? e.message : 'unknown'));
            }
        }
    }

    // =========================================================================
    // 12. ERROR RENDERING
    // =========================================================================

    function _renderError(message) {
        var panel = _byId(ID_PANEL);
        if (!panel) return;
        panel.innerHTML =
            '<div class="events-empty events-empty--error">' +
            '<div class="events-empty__icon" style="color:var(--danger);">' +
            _icon('WARNING') +
            '</div>' +
            '<div class="events-empty__message">' + _esc(message) + '</div>' +
            '</div>';
    }

    // =========================================================================
    // 13. INIT
    // =========================================================================

    var _initialized = false;

    function init() {
        if (_initialized) return;
        _initialized = true;

        // -- Dependency check -------------------------------------------
        var TM, EventsBootstrap, EventsConstants;
        try {
            TM = _requireTabManager();
            EventsBootstrap = _requireEventsBootstrap();
            EventsConstants = _requireEventsConstants();
        } catch (depErr) {
            var emptyState = _byId(ID_EMPTY_STATE);
            if (emptyState) {
                emptyState.textContent =
                    'Events Manager failed to initialize: ' +
                    (depErr && depErr.message ? depErr.message : 'unknown error');
                emptyState.style.color = 'var(--danger)';
            }
            if (typeof console !== 'undefined' && console.error) {
                console.error('events-manager-bootstrap: init failed:', depErr);
            }
            return;
        }

        // -- Storage / masterData boot ------------------------------
        if (typeof window.initializeStorage === 'function') {
            try { window.initializeStorage(); }
            catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('events-manager-bootstrap: initializeStorage threw', e);
                }
            }
        }
        if (typeof window.loadMasterData === 'function') {
            try { window.loadMasterData(); }
            catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('events-manager-bootstrap: loadMasterData threw', e);
                }
            }
        }

        // -- Warm up the Events module ---------------------------------
        try { EventsBootstrap.init(); }
        catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('events-manager-bootstrap: EventsBootstrap.init threw', e);
            }
            _renderError('Events module failed to initialize: ' +
                (e && e.message ? e.message : 'unknown'));
            return;
        }

        // -- Container root --------------------------------------------
        var containerRoot = _resolveContainerRoot();
        if (!containerRoot) {
            var emptyEl = _byId(ID_EMPTY_STATE);
            if (emptyEl) {
                emptyEl.textContent =
                    'Events Manager: #' + ID_TAB_STRIP + ' is missing from ' +
                    'EventsManager.html. Cannot configure TabManager.';
                emptyEl.style.color = 'var(--danger)';
            }
            return;
        }

        // -- Configure TabManager --------------------------------------
        try {
            TM.configure(SCOPE, {
                containerRoot: containerRoot,
                resolveContainer: _resolveContainer,
                buildContext: _buildContext,
                buildEmptyState: _buildEmptyState,
                getActiveTabId: function() {
                    return _managerState.activeTabId;
                },
                setActiveTabId: function(tabId) {
                    if (!tabId || KNOWN_TAB_IDS.indexOf(tabId) === -1) {
                        tabId = DEFAULT_ACTIVE_TAB_ID;
                    }
                    _managerState.activeTabId = tabId;
                    _syncTabStrip(tabId);
                }
            });
        } catch (cfgErr) {
            _renderError('TabManager.configure failed: ' +
                (cfgErr && cfgErr.message ? cfgErr.message : 'unknown'));
            return;
        }

        // -- Initialize TabManager -------------------------------------
        try { TM.init(); }
        catch (initErr) {
            _renderError('TabManager.init failed: ' +
                (initErr && initErr.message ? initErr.message : 'unknown'));
            return;
        }

        // -- Sidebar + topbar ------------------------------------------
        _renderSidebar();
        _wireTopbar();

        // -- Initial visual sync ---------------------------------------
        _syncTabStrip(_managerState.activeTabId);

        // -- Initial render --------------------------------------------
        try { TM.renderActive(SCOPE); }
        catch (renderErr) {
            _renderError('Failed to render initial tab: ' +
                (renderErr && renderErr.message ? renderErr.message : 'unknown'));
        }

        // -- Subscriptions ---------------------------------------------
        // Re-render when masterData is replaced out-of-band (import,
        // cross-tab reload). This complements the explicit
        // _reloadAfterMutation call on the topbar actions.
        window.addEventListener('masterDataUpdated', function() {
            _reloadAfterMutation();
        });

        // Re-render when the tab strip is clicked. TabManager's own
        // click router handles this via setActiveTabId (above), but
        // the router relies on the containerRoot containing the
        // click target. If a future HTML change moves the strip
        // outside .main-panel, the router silently stops working;
        // this explicit handler catches that regression.
        var strip = _byId(ID_TAB_STRIP);
        if (strip) {
            strip.addEventListener('click', function(e) {
                var btn = e.target && e.target.closest
                    ? e.target.closest('[data-tab]')
                    : null;
                if (!btn || !strip.contains(btn)) return;
                var tabId = btn.getAttribute('data-tab');
                if (!tabId) return;
                // TabManager's router will also fire for this click;
                // its setActiveTabId path calls renderActive. This
                // handler is a belt-and-braces safety net -- if
                // TabManager's router somehow fails to fire, the tab
                // still activates. Duplicate renderActive calls are
                // idempotent (TabManager empties the pane before
                // rendering).
                _selectTab(tabId);
            });
        }
    }

    // =========================================================================
    // 14. AUTOINIT
    // =========================================================================

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // =========================================================================
    // 15. EXPORTS
    // =========================================================================

    window.EventsManagerBootstrap = {
        init: init,

        // Exposed for tests and for the tab files that need to trigger
        // a re-render (e.g. after a modal closes).
        renderActive: function() {
            if (window.TabManager && typeof window.TabManager.renderActive === 'function') {
                try { window.TabManager.renderActive(SCOPE); }
                catch (e) {
                    if (typeof console !== 'undefined' && console.error) {
                        console.error(
                            'events-manager-bootstrap.renderActive failed:', e
                        );
                    }
                }
            }
        },

        // Exposed so a caller can force a full reload from storage.
        reload: _reloadAfterMutation,

        // Exposed for tests.
        KNOWN_TAB_IDS: KNOWN_TAB_IDS.slice(),
        DEFAULT_ACTIVE_TAB_ID: DEFAULT_ACTIVE_TAB_ID,

        // Test-only introspection.
        _getManagerState: function() {
            return {
                activeTabId: _managerState.activeTabId,
                selectedLocationId: _managerState.selectedLocationId
            };
        }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.EventsManagerBootstrap;
    }
})();
