/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT TABS
 * js/settlement/settlement-tabs.js
 * =============================================================================
 *
 * TAB REGISTRY AND DISPATCH.
 *
 * This file owns the settlement tab system:
 *   - a registry of tab renderers
 *   - activation of a tab
 *   - rendering of a tab's content for the currently selected settlement
 *
 * It is a UI module. It:
 *   - reads the selected location from SettlementUIState
 *   - reads the active tab from SettlementUIState
 *   - reads settlement data through SettlementQueries and ViewModels
 *   - does not create settlement records
 *   - does not mutate canonical settlement data
 *   - does not persist
 *   - does not display domain values it did not receive from a query or
 *     ViewModel
 *
 * Contract reference: Settlement Architecture Contracts §15 (ViewModel
 * Contract), §16 (UI Contract), §32 (Completion Standard).
 *
 * Critical rule (§16):
 *
 *   Opening a tab is observational. It may query the world and render
 *   what exists. It must not create or mutate the world. Under the new
 *   architecture, there is no `_ensureSettlementData()` and no
 *   hidden creation of a settlement record because a user clicked a
 *   tab. If a settlement does not exist for the selected location, the
 *   tab renders an explicit empty state.
 *
 * Renderer contract:
 *
 *   A renderer is a function(container, context) where:
 *     container : HTMLElement       the DOM element to fill
 *     context   : {
 *         locationId : string|null   the selected settlement id
 *         data       : Object|null   canonical settlement record
 *         viewModel  : Object|null   settlement summary ViewModel
 *     }
 *
 *   The renderer is responsible for its own DOM. It may use any
 *   query or ViewModel API. It must not mutate domain state.
 *
 * Registration timing:
 *
 *   Tab renderers must register before their tab is first activated.
 *   Callers that load asynchronously should call `requestRender()` once
 *   registration is complete. The tab system does not guess at timing
 *   with setTimeout.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCIES
    // =========================================================================

    function _getUIState() {
        return window.SettlementUIState;
    }

    function _getSettlementQueries() {
        return window.SettlementQueries;
    }

    function _getViewModels() {
        return window.SettlementViewModels;
    }

    // =========================================================================
    // 2. REGISTRY
    // =========================================================================

    var _tabRenderers = {};
    var _initialized = false;
    var _clickHandlerAttached = false;

    /**
     * Registers a renderer for a tab id.
     *
     * @param {string} tabId
     * @param {Function} renderFn   function(container, context)
     */
    function registerTabRenderer(tabId, renderFn) {
        if (typeof tabId !== 'string' || tabId.length === 0) {
            throw new TypeError('SettlementTabs.registerTabRenderer: tabId must be a non-empty string');
        }
        if (typeof renderFn !== 'function') {
            throw new TypeError('SettlementTabs.registerTabRenderer: renderFn must be a function');
        }
        _tabRenderers[tabId] = renderFn;
    }

    /**
     * Returns true if a renderer is registered for the tab id.
     * @param {string} tabId
     * @returns {boolean}
     */
    function hasTabRenderer(tabId) {
        return Object.prototype.hasOwnProperty.call(_tabRenderers, tabId);
    }

    // =========================================================================
    // 3. DOM HELPERS
    // =========================================================================

    function _getContentContainer(tabId) {
        // Primary selector: element with id `tab-<tabId>`.
        var byId = document.getElementById('tab-' + tabId);
        if (byId) return byId;

        // Fallback: element with data-tab-content equal to tabId.
        var byData = document.querySelector('[data-tab-content="' + tabId + '"]');
        if (byData) return byData;

        return null;
    }

    function _getTabButtons() {
        return document.querySelectorAll('[data-tab]');
    }

    function _getContentContainers() {
        return document.querySelectorAll('[data-tab-content], .tab-content');
    }

    function _setEmptyState(container, message) {
        while (container.firstChild) container.removeChild(container.firstChild);
        var div = document.createElement('div');
        div.className = 'settlement-tab-message settlement-tab-message--empty';
        div.textContent = message;
        container.appendChild(div);
    }

    function _setErrorState(container, message) {
        while (container.firstChild) container.removeChild(container.firstChild);
        var div = document.createElement('div');
        div.className = 'settlement-tab-message settlement-tab-message--error';
        div.textContent = message;
        container.appendChild(div);
    }

    // =========================================================================
    // 4. RENDERING
    // =========================================================================

    /**
     * Renders a tab's content into the DOM. Reads the selected location
     * from SettlementUIState. Does not create settlement records.
     *
     * @param {string} tabId
     * @returns {boolean} true if a renderer ran, false otherwise
     */
    function renderTab(tabId) {
        if (typeof tabId !== 'string' || tabId.length === 0) return false;

        var container = _getContentContainer(tabId);
        if (!container) return false;

        var renderer = _tabRenderers[tabId];
        if (!renderer) {
            _setEmptyState(container, 'This tab is not available.');
            return false;
        }

        var locationId = _getUIState().getSelectedLocationId();
        if (!locationId) {
            _setEmptyState(container, 'Select a location first.');
            return false;
        }

        var data = _getSettlementQueries().getSettlementData(locationId);
        if (!data) {
            _setEmptyState(container, 'No settlement data for this location.');
            return false;
        }

        var viewModel = null;
        try {
            viewModel = _getViewModels().buildSettlementSummary(locationId);
        } catch (err) {
            // If the ViewModel throws, treat it as an error state. We do
            // not silently substitute a fabricated summary.
            if (typeof console !== 'undefined' && console.error) {
                console.error('SettlementTabs: ViewModel failed for', locationId, err);
            }
            _setErrorState(container, 'Could not load settlement summary.');
            return false;
        }

        var context = {
            locationId: locationId,
            data: data,
            viewModel: viewModel
        };

        try {
            renderer(container, context);
        } catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('SettlementTabs: renderer failed for tab', tabId, err);
            }
            _setErrorState(container, 'Could not render this tab.');
            return false;
        }

        return true;
    }

    /**
     * Renders the currently active tab. Called on selection change, on
     * registration of a new renderer, or by callers that want to force
     * a refresh.
     *
     * @returns {boolean}
     */
    function renderActiveTab() {
        var activeTabId = _getUIState().getActiveTabId();
        if (!activeTabId) return false;
        return renderTab(activeTabId);
    }

    // =========================================================================
    // 5. TAB ACTIVATION
    // =========================================================================

    function _updateTabButtonStates(activeTabId) {
        var buttons = _getTabButtons();
        for (var i = 0; i < buttons.length; i++) {
            var button = buttons[i];
            if (button.dataset.tab === activeTabId) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        }
    }

    function _updateContentVisibility(activeTabId) {
        var containers = _getContentContainers();
        for (var i = 0; i < containers.length; i++) {
            var container = containers[i];
            var isTarget = container.id === 'tab-' + activeTabId
                || container.dataset.tab === activeTabId
                || container.dataset.tabContent === activeTabId;
            if (isTarget) {
                container.classList.add('active');
            } else {
                container.classList.remove('active');
            }
        }
    }

    /**
     * Activates a tab: updates UI state, applies DOM classes, and
     * renders the tab content.
     *
     * @param {string} tabId
     */
    function activateTab(tabId) {
        if (typeof tabId !== 'string' || tabId.length === 0) return;

        _getUIState().setActiveTabId(tabId);

        _updateTabButtonStates(tabId);
        _updateContentVisibility(tabId);
        renderTab(tabId);
    }

    // =========================================================================
    // 6. EVENT WIRING
    // =========================================================================

    function _handleTabClick(event) {
        var button = event.target.closest('[data-tab]');
        if (!button) return;

        // Ignore clicks inside tab content areas.
        if (event.target.closest('[data-tab-content], .tab-content')) return;

        var tabId = button.dataset.tab;
        if (!tabId) return;

        event.preventDefault();
        activateTab(tabId);
    }

    function _attachClickHandler() {
        if (_clickHandlerAttached) return;
        _clickHandlerAttached = true;
        document.addEventListener('click', _handleTabClick);
    }

    function _subscribeToUIState() {
        _getUIState().subscribe(function (event) {
            if (!event || typeof event !== 'object') return;
            if (event.type === 'selectedLocationChanged') {
                renderActiveTab();
            }
        });
    }

    // =========================================================================
    // 7. INITIALIZATION
    // =========================================================================

    /**
     * Initializes the tab system. Idempotent.
     *
     * Call this once after:
     *   - SettlementUIState is available
     *   - the tab renderers have been registered
     *   - the DOM contains the tab buttons and content containers
     */
    function init() {
        if (_initialized) return;
        _initialized = true;

        _attachClickHandler();
        _subscribeToUIState();

        var activeTabId = _getUIState().getActiveTabId();

        // If no active tab has been chosen, prefer the first declared
        // tab button in the DOM.
        if (!activeTabId) {
            var buttons = _getTabButtons();
            if (buttons.length > 0) {
                var firstTabId = buttons[0].dataset.tab;
                if (firstTabId) {
                    activateTab(firstTabId);
                    return;
                }
            }
            return;
        }

        _updateTabButtonStates(activeTabId);
        _updateContentVisibility(activeTabId);
        renderTab(activeTabId);
    }

    /**
     * Signals that a tab renderer has been (re)registered and the active
     * tab should be re-rendered. Use this instead of a setTimeout to
     * ensure deterministic behavior when renderers register after init.
     *
     * @param {string} [tabId]   if omitted, re-renders the active tab
     */
    function requestRender(tabId) {
        if (tabId) {
            renderTab(tabId);
            return;
        }
        renderActiveTab();
    }

    // =========================================================================
    // 8. AUTO-INIT HOOK
    // =========================================================================
    //
    // When the DOM is ready and dependencies exist, initialize. This is
    // a convenience for the common case. Callers that need explicit
    // control call init() themselves; calling it twice is safe.
    //

    function _tryAutoInit() {
        if (typeof window.SettlementUIState === 'undefined') return;
        if (typeof window.SettlementQueries === 'undefined') return;
        if (typeof window.SettlementViewModels === 'undefined') return;
        try {
            init();
        } catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error('SettlementTabs auto-init failed:', err);
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            // Defer until after other DOMContentLoaded handlers run.
            setTimeout(_tryAutoInit, 0);
        });
    } else {
        setTimeout(_tryAutoInit, 0);
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.SettlementTabs = Object.freeze({
        registerTabRenderer: registerTabRenderer,
        hasTabRenderer: hasTabRenderer,
        activateTab: activateTab,
        renderTab: renderTab,
        renderActiveTab: renderActiveTab,
        requestRender: requestRender,
        init: init
    });

})();
