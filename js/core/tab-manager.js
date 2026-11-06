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
 *     containerRoot:  HTMLElement | fn() → HTMLElement,
 *                                     // contains the strip AND the panes.
 *                                     // May be passed as an element (eager
 *                                     // value, resolved when configure()
 *                                     // runs) or as a zero-arg function
 *                                     // that returns the element (lazy
 *                                     // resolve at use time). Use the
 *                                     // function form when the configure()
 *                                     // call may run before the DOM is
 *                                     // parsed (e.g. from an inline
 *                                     // <script> at the end of <body>, or
 *                                     // from a DOMContentLoaded listener
 *                                     // that fires before the strip is
 *                                     // mounted).
 *     resolveContainer: fn(tabId),   // returns the pane element for a tab
 *     buildContext:   fn(),          // returns { locationId, ... } or null
 *     getActiveTabId: fn(),          // returns the current tab id
 *     setActiveTabId: fn(tabId),     // persists the active tab id
 *     buildEmptyState: fn(tabId, reason) → html string
 *   }
 *
 * CONTAINER-ROOT NORMALIZATION
 * ----------------------------
 *   The click router needs an Element to call .contains(btn) on. Prior
 *   revisions assumed config.containerRoot was always an element; a
 *   manager that passed a resolver function (a natural choice, since a
 *   manager page may configure its scope in a <script> that runs before
 *   the strip is mounted) crashed on the first click with
 *   "TypeError: _configs[scope].containerRoot.contains is not a function".
 *
 *   configure() still accepts both shapes, but the click router now
 *   normalizes via _resolveContainerRoot(): if containerRoot is a
 *   function it is called once per click to obtain the element (cheap —
 *   querySelector on an already-parsed document; also correct if the DOM
 *   was replaced between clicks, e.g. after an import reload). If it is
 *   an element, it is used directly. Either way the router operates on
 *   an element.
 *
 *   Rationale for keeping both shapes: eager element passing is the
 *   natural fit for a config block that runs after the strip exists
 *   (Education-style bootstrap); lazy function is the natural fit for a
 *   config block that runs at parse time in the page shell
 *   (ReligionManager.html's inline <script>). Neither is "wrong"; the
 *   fix is to stop forcing one to behave like the other.
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
 *      containerRoot MUST (after normalization) be an element that contains
 *      both the strip and the panes — a sibling strip (common mistake) makes
 *      clicks fail to route.
 *   2. TabManager does NOT toggle .active on panes. The scope's
 *      setActiveTabId hook is responsible for that visual sync. See
 *      ReligionManager.html's scope config for the reference implementation
 *      (_syncTabStrip) or location-manager-bootstrap.js::_syncTabStrip for
 *      the Education-side equivalent.
 *   3. register() is idempotent per (scope, tabId). A later register() with
 *      the same key overwrites the earlier one — this lets a page re-register
 *      after a hot-reload without accumulating stale renderers.
 *   4. renderActive() and requestRender() both empty the pane before calling
 *      the renderer, so renderers never see stale DOM from a prior render.
 *   5. The click router sets _activeTabIdByScope BEFORE calling
 *      renderActive(). This ordering is deliberate: renderActive() reads
 *      _activeTabIdByScope via getActiveTabId(), so setting it afterward
 *      would render the wrong (previous) tab. Do not reorder.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - containerRoot now accepts EITHER an element OR a zero-arg
 *       resolver function. The click router normalizes via
 *       _resolveContainerRoot(config) before calling .contains().
 *       Fixes the "TypeError: _configs[scope].containerRoot.contains
 *       is not a function" crash when a manager passes a lazy resolver
 *       (ReligionManager.html does). Backwards-compatible: element
 *       configs unchanged, function configs now work.
 *     - configure() validation relaxed to accept both shapes (was:
 *       "config.containerRoot is required" — still true, but the
 *       shape is no longer implicitly assumed to be an element).
 *       A mis-shaped containerRoot (e.g. a string, or a plain object
 *       without .contains) now throws a clear configure-time error
 *       instead of a cryptic .contains failure at the first click.
 *     - _renderTab's 'no-container' fallback also uses
 *       _resolveContainerRoot so it can't throw on a function-shaped
 *       config.
 *     - Header CONFIG SHAPE updated to document both shapes and when
 *       to use each. Added CONTAINER-ROOT NORMALIZATION section
 *       explaining the bug and the fix.
 *     - No other behavior changes: registration, activation ordering,
 *       render, empty states, and the requestRender/activate public
 *       surface are all identical to the previous revision.
 *   Previous revisions:
 *     - Initial Education-aligned revision. Replaces the settlement-era
 *       TabManager whose pane convention used .settlement-tab-message.
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
    // Container-root normalization
    // -------------------------------------------------------------------------
    //
    // config.containerRoot may be either:
    //   - an Element (configure() ran after the DOM was mounted), or
    //   - a zero-arg function returning an Element (configure() ran before
    //     the DOM was mounted, or the caller wants to re-resolve on each
    //     use — e.g. after an import replaced the DOM).
    //
    // The click router needs an Element. _resolveContainerRoot() returns
    // one or null. A function that throws or returns non-element is
    // treated as null (the router skips that scope for this click, which
    // is the correct behavior — a broken config should not route clicks
    // to the wrong scope).

    function _resolveContainerRoot(config) {
        if (!config) return null;
        var root = config.containerRoot;
        if (typeof root === 'function') {
            try { root = root(); }
            catch (e) { root = null; }
        }
        if (root && typeof root.contains === 'function') return root;
        return null;
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
                // Both shapes are valid: element or function.
                if (typeof config[key] !== 'function'
                    && typeof config[key].contains !== 'function') {
                    throw new Error(
                        'TabManager.configure: config.containerRoot must be an ' +
                        'Element or a zero-arg function returning an Element'
                    );
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

            // Find the scope whose (normalized) containerRoot contains
            // this button. _resolveContainerRoot() accepts both the
            // element and the function shape of config.containerRoot.
            var matchedScope = null;
            for (var scope in _configs) {
                var root = _resolveContainerRoot(_configs[scope]);
                if (root && root.contains(btn)) {
                    matchedScope = scope;
                    break;
                }
            }
            if (!matchedScope) return;

            var cfg = _configs[matchedScope];

            // setActiveTabId is the scope's UI-sync hook (strip + pane
            // visual sync). It is best-effort: a broken hook must not
            // prevent the render. Order matters: _activeTabIdByScope
            // must be set BEFORE renderActive() because renderActive()
            // reads it via getActiveTabId().
            try { cfg.setActiveTabId(tabId); }
            catch (err) { /* ignore */ }
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
            // Use the normalized root so a function-shaped containerRoot
            // can't throw here.
            var root = _resolveContainerRoot(cfg);
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
