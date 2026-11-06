// js/core/tab-manager.js
/**
 * =============================================================================
 * TAB MANAGER — universal tab registry
 * js/core/tab-manager.js
 * =============================================================================
 *
 * LOCATION: js/core/tab-manager.js
 *
 * The single tab registry and router for every manager page that wants
 * per-domain sub-tabs. See "The Best-in-Class Manager and the Tab/Manager
 * Development Playbook" §4/§5 for the contract.
 *
 * PUBLIC API:
 *   configure(scope, config)        Register a manager's tab scope + hooks.
 *   register(scope, tabId, fn)      Register a tab renderer for a scope.
 *   has(scope, tabId)               Boolean: is the tab registered?
 *   listTabs(scope)                 Array of tab ids in insertion order.
 *   getRegisteredTabs(scope)        Alias for listTabs (back-compat).
 *   init()                          Wire the delegated click handler.
 *   renderActive(scope)             Render the scope's active tab.
 *   requestRender(scope, tabId)     Force a specific tab to re-render.
 *   getActiveTabId(scope)           The scope's active tab id (or default).
 *
 * CONFIG SHAPE (per scope):
 *   {
 *     containerRoot:  HTMLElement,   // contains the strip AND the panes
 *     resolveContainer: fn(tabId),   // returns the pane element for a tab
 *     buildContext:   fn(),          // returns { locationId, ... } or null
 *     getActiveTabId: fn(),          // returns the current tab id
 *     setActiveTabId: fn(tabId),     // persists the active tab id
 *     buildEmptyState: fn(tabId, reason) → html string
 *   }
 *
 * RENDERER CONTRACT:
 *   fn(container, context) — writes into `container` (which TabManager has
 *   already emptied). `context` is whatever `buildContext()` returned.
 *
 * EMPTY-STATE REASONS:
 *   'no-context'   — buildContext() returned null
 *   'no-renderer'  — no renderer registered for this tab id
 *   'no-container' — resolveContainer(tabId) returned null
 *
 * NON-OBVIOUS DECISIONS:
 *   1. The click router walks up from the click target to find a [data-tab]
 *      button, then asks each configured scope's containerRoot.contains(btn).
 *      containerRoot MUST contain both the strip and the panes — a sibling
 *      strip (common mistake) makes clicks fail to route.
 *   2. TabManager does NOT toggle .active on panes. The scope's
 *      setActiveTabId hook is responsible for that visual sync. See
 *      location-manager-bootstrap.js::_syncTabStrip for the reference
 *      implementation.
 *   3. register() is idempotent per (scope, tabId). A later register() with
 *      the same key overwrites the earlier one — this lets a page re-register
 *      after a hot-reload without accumulating stale renderers.
 *   4. renderActive() and requestRender() both empty the pane before calling
 *      the renderer, so renderers never see stale DOM from a prior render.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Initial Education-aligned revision. Replaces the settlement-era
 *   TabManager whose pane convention used .settlement-tab-message.
 * =============================================================================
 */

(function () {
    'use strict';

    var _configs = Object.create(null);          // scope -> config
    var _renderers = Object.create(null);        // scope -> { tabId -> fn }
    var _activeTabIdByScope = Object.create(null); // scope -> tabId
    var _initialized = false;

    // -------------------------------------------------------------------------
    // Assertions
    // -------------------------------------------------------------------------

    function _assertScope(scope) {
        if (typeof scope !== 'string' || scope.length === 0) {
            throw new Error('TabManager: scope must be a non-empty string (got ' + scope + ')');
        }
    }
    function _assertTabId(tabId) {
        if (typeof tabId !== 'string' || tabId.length === 0) {
            throw new Error('TabManager: tabId must be a non-empty string (got ' + tabId + ')');
        }
    }
    function _assertRenderer(renderer) {
        if (typeof renderer !== 'function') {
            throw new Error('TabManager: renderer must be a function (got ' + typeof renderer + ')');
        }
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Register a manager's tab scope + hooks. Must be called before
     * renderActive(scope). Tabs may be registered before or after this
     * call; the registry is per-scope and independent of config.
     */
    function configure(scope, config) {
        _assertScope(scope);
        if (!config || typeof config !== 'object') {
            throw new Error('TabManager.configure: config must be an object');
        }
        var required = [
            'containerRoot', 'resolveContainer', 'buildContext',
            'getActiveTabId', 'setActiveTabId', 'buildEmptyState'
        ];
        for (var i = 0; i < required.length; i++) {
            var key = required[i];
            if (key === 'containerRoot') {
                if (!config[key]) {
                    throw new Error('TabManager.configure: config.containerRoot is required');
                }
            } else if (typeof config[key] !== 'function') {
                throw new Error('TabManager.configure: config.' + key + ' must be a function');
            }
        }
        _configs[scope] = config;
    }

    /**
     * Register a tab renderer. Signature: register(scope, tabId, renderFn).
     * Idempotent per (scope, tabId): re-registering overwrites.
     */
    function register(scope, tabId, renderer) {
        _assertScope(scope);
        _assertTabId(tabId);
        _assertRenderer(renderer);
        if (!_renderers[scope]) _renderers[scope] = Object.create(null);
        _renderers[scope][tabId] = renderer;
    }

    /**
     * Boolean: is a renderer registered for (scope, tabId)?
     */
    function has(scope, tabId) {
        if (typeof scope !== 'string' || !_renderers[scope]) return false;
        if (typeof tabId !== 'string') return false;
        return !!_renderers[scope][tabId];
    }

    /**
     * Array of tab ids registered for a scope, in insertion order.
     */
    function listTabs(scope) {
        if (typeof scope !== 'string' || !_renderers[scope]) return [];
        return Object.keys(_renderers[scope]);
    }

    /**
     * Wire the delegated click handler. Safe to call multiple times; the
     * listener is attached exactly once (guarded by _initialized).
     */
    function init() {
        if (_initialized) return;
        _initialized = true;

        document.addEventListener('click', function (e) {
            var btn = e.target && e.target.closest
                ? e.target.closest('[data-tab]')
                : null;
            if (!btn) return;
            var tabId = btn.getAttribute('data-tab');
            if (!tabId) return;

            // Find the scope whose containerRoot contains this button.
            var matchedScope = null;
            for (var scope in _configs) {
                if (_configs[scope].containerRoot &&
                    _configs[scope].containerRoot.contains(btn)) {
                    matchedScope = scope;
                    break;
                }
            }
            if (!matchedScope) return;

            var cfg = _configs[matchedScope];
            try { cfg.setActiveTabId(tabId); }
            catch (err) { /* ignore — setActiveTabId is best-effort */ }
            _activeTabIdByScope[matchedScope] = tabId;
            renderActive(matchedScope);
        });
    }

    /**
     * Resolve the active tab id for a scope. Prefers the in-memory value
     * set by the click router; falls back to the config hook.
     */
    function getActiveTabId(scope) {
        if (typeof scope !== 'string') return null;
        if (_activeTabIdByScope[scope]) return _activeTabIdByScope[scope];
        var cfg = _configs[scope];
        if (cfg && typeof cfg.getActiveTabId === 'function') {
            try { return cfg.getActiveTabId(); }
            catch (err) { /* ignore */ }
        }
        return null;
    }

    /**
     * Render the scope's active tab into its configured container.
     */
    function renderActive(scope) {
        var cfg = _configs[scope];
        if (!cfg) {
            console.warn('TabManager.renderActive: no config for scope "' + scope + '"');
            return;
        }
        var tabId = getActiveTabId(scope);
        if (!tabId) {
            console.warn('TabManager.renderActive: no active tab for scope "' + scope + '"');
            return;
        }
        _renderTab(scope, tabId);
    }

    /**
     * Force a specific tab to re-render. Use after a write (save, delete,
     * import) to refresh the visible tab without a full page reload.
     */
    function requestRender(scope, tabId) {
        _assertScope(scope);
        _assertTabId(tabId);
        _renderTab(scope, tabId);
    }

    // -------------------------------------------------------------------------
    // Internal: render one tab
    // -------------------------------------------------------------------------

    function _renderTab(scope, tabId) {
        var cfg = _configs[scope];
        if (!cfg) return;

        // 1. Resolve the container (the pane element for this tab id).
        var container = null;
        try { container = cfg.resolveContainer(tabId); }
        catch (err) { container = null; }

        if (!container) {
            // No pane. Write the empty state into the first pane we can
            // find, so the user sees something rather than a blank strip.
            var root = cfg.containerRoot;
            if (root) {
                var html = cfg.buildEmptyState(tabId, 'no-container');
                var firstPane = root.querySelector('[data-tab-content]');
                if (firstPane) firstPane.innerHTML = html;
            }
            return;
        }

        // 2. Build context (may be null — e.g. no selection yet).
        var context = null;
        try { context = cfg.buildContext(); }
        catch (err) {
            container.innerHTML =
                '<div class="empty-state" style="color:var(--danger);">' +
                'Context build failed: ' +
                (err && err.message ? err.message : 'unknown') +
                '</div>';
            return;
        }
        if (!context) {
            container.innerHTML = cfg.buildEmptyState(tabId, 'no-context');
            return;
        }

        // 3. Find the renderer.
        var renderer = _renderers[scope] && _renderers[scope][tabId];
        if (!renderer) {
            container.innerHTML = cfg.buildEmptyState(tabId, 'no-renderer');
            return;
        }

        // 4. Render. Empty the pane first so renderers never see stale DOM.
        container.innerHTML = '';
        try {
            renderer(container, context);
        } catch (err) {
            container.innerHTML =
                '<div class="empty-state" style="color:var(--danger);">' +
                'Render failed: ' +
                (err && err.message ? err.message : 'unknown') +
                '</div>';
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    '[TabManager] render error for ' + scope + '/' + tabId + ':',
                    err
                );
            }
        }
    }

    // -------------------------------------------------------------------------
    // Exports
    // -------------------------------------------------------------------------

    window.TabManager = {
        // Lifecycle
        configure: configure,
        init: init,
        // Registration
        register: register,
        has: has,
        listTabs: listTabs,
        getRegisteredTabs: listTabs, // back-compat alias
        // Rendering
        renderActive: renderActive,
        requestRender: requestRender,
        getActiveTabId: getActiveTabId
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.TabManager;
    }
})();
