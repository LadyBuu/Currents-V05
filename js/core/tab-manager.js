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
 *                                     // May be an element or a zero-arg
 *                                     // resolver function (lazy resolve).
 *     resolveContainer: fn(tabId),   // returns the pane element for a tab
 *     buildContext:   fn(),          // returns { locationId, ... } or null
 *     buildEmptyState: fn(tabId, reason) → html string
 *
 *     // OPTIONAL (state persistence only — TabManager owns the visual sync):
 *     getActiveTabId: fn(),          // returns the current tab id
 *     setActiveTabId: fn(tabId),     // persists the active tab id
 *   }
 *
 * VISUAL SYNC (the fix in this revision):
 *   TabManager owns the .active class toggling on BOTH the strip buttons
 *   and the pane elements. The click router calls _applyActiveClasses()
 *   before renderActive(); renderActive() and requestRender() also call
 *   it. The scope's setActiveTabId hook, if present, is called for state
 *   persistence only — a missing or throwing hook cannot prevent the
 *   visual change.
 *
 *   Prior revisions delegated visual sync to cfg.setActiveTabId inside a
 *   try/catch that swallowed errors. When the hook was missing or threw,
 *   _activeTabIdByScope still updated (so getActiveTabId returned the new
 *   id and the correct pane got rendered), but .active never moved off
 *   the previous pane — so the user saw the wrong pane, or an empty one.
 *
 * CONTAINER-ROOT NORMALIZATION:
 *   The click router needs an Element to call .contains(btn) on.
 *   config.containerRoot may be an Element or a zero-arg function
 *   returning an Element. _resolveContainerRoot() normalizes either
 *   shape to an Element (or null if the resolver throws / returns
 *   non-element, in which case the scope is skipped for that click).
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
 *   2. register() is idempotent per (scope, tabId). A later register() with
 *      the same key overwrites the earlier one — this lets a page re-register
 *      after a hot-reload without accumulating stale renderers.
 *   3. renderActive() and requestRender() both empty the pane before calling
 *      the renderer, so renderers never see stale DOM from a prior render.
 *   4. The click router sets _activeTabIdByScope BEFORE calling
 *      renderActive(). This ordering is deliberate: renderActive() reads
 *      _activeTabIdByScope via getActiveTabId(), so setting it afterward
 *      would render the wrong (previous) tab. Do not reorder.
 *   5. _applyActiveClasses runs BEFORE setActiveTabId. If setActiveTabId
 *      persists state to localStorage and also triggers a re-render, the
 *      visual state is already correct when the re-render happens.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - TabManager owns the .active class toggling. Added
 *       _applyActiveClasses(scope, tabId), called from init's click
 *       handler, renderActive, and requestRender. Fixed the "clicked tab
 *       highlights but the wrong pane shows" bug caused by delegating
 *       visual sync to a swallowed-throw config hook.
 *     - configure() no longer requires getActiveTabId / setActiveTabId.
 *       They are optional state-persistence hooks. Missing hooks are now
 *       a no-op rather than a configure-time throw.
 *     - containerRoot accepts element OR zero-arg resolver function.
 *       _resolveContainerRoot() normalizes before .contains().
 *     - renderActive() and requestRender() also apply active classes, so
 *       programmatic renders (e.g. after a save) update the strip too.
 *   Previous revisions:
 *     - Initial Education-aligned revision. Replaces the settlement-era
 *       TabManager whose pane convention used .settlement-tab-message.
 * =============================================================================
 */

(function () {
    'use strict';

    var _configs = Object.create(null);            // scope -> config
    var _renderers = Object.create(null);          // scope -> { tabId -> fn }
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
    //   - a zero-arg function returning an Element (lazy resolve).
    //
    // _resolveContainerRoot() returns an Element or null. A function that
    // throws or returns non-element is treated as null (the router skips
    // that scope for this click — a broken config should not route clicks
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
    // Visual sync (owned by TabManager)
    // -------------------------------------------------------------------------
    //
    // Toggle .active on both the [data-tab] buttons and the [data-tab-content]
    // panes inside the scope's containerRoot. Also maintain ARIA state on
    // the buttons. This is the single source of truth for the "which tab is
    // visible" question — the scope's setActiveTabId hook is optional and
    // only used for persistence.

    function _applyActiveClasses(scope, tabId) {
        var cfg = _configs[scope];
        if (!cfg) return;
        var root = _resolveContainerRoot(cfg);
        if (!root) return;

        var buttons = root.querySelectorAll('[data-tab]');
        for (var i = 0; i < buttons.length; i++) {
            var b = buttons[i];
            var isActiveBtn = b.getAttribute('data-tab') === tabId;
            if (isActiveBtn) b.classList.add('active');
            else b.classList.remove('active');
            b.setAttribute('aria-selected', isActiveBtn ? 'true' : 'false');
            b.setAttribute('tabindex', isActiveBtn ? '0' : '-1');
        }

        var panes = root.querySelectorAll('[data-tab-content]');
        for (var k = 0; k < panes.length; k++) {
            var p = panes[k];
            var isActivePane = p.getAttribute('data-tab-content') === tabId;
            if (isActivePane) p.classList.add('active');
            else p.classList.remove('active');
        }
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Register a manager's tab scope + hooks. Must be called before
     * renderActive(scope). Tabs may be registered before or after this
     * call; the registry is per-scope and independent of config.
     *
     * Required config keys: containerRoot, resolveContainer, buildContext,
     * buildEmptyState. Optional: getActiveTabId, setActiveTabId (state
     * persistence only — TabManager owns the visual sync).
     */
    function configure(scope, config) {
        _assertScope(scope);
        if (!config || typeof config !== 'object') {
            throw new Error('TabManager.configure: config must be an object');
        }
        var required = ['containerRoot', 'resolveContainer', 'buildContext', 'buildEmptyState'];
        for (var i = 0; i < required.length; i++) {
            var key = required[i];
            if (key === 'containerRoot') {
                if (!config[key]) {
                    throw new Error('TabManager.configure: config.containerRoot is required');
                }
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

            // Find the scope whose normalized containerRoot contains
            // this button.
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

            // Order matters: set the active tab id BEFORE any render path,
            // because renderActive() reads it via getActiveTabId().
            _activeTabIdByScope[matchedScope] = tabId;

            // Visual sync is owned by TabManager. This runs unconditionally,
            // so a broken/missing setActiveTabId hook cannot leave the UI
            // showing the wrong pane.
            _applyActiveClasses(matchedScope, tabId);

            // Optional state-persistence hook. Best-effort.
            if (typeof cfg.setActiveTabId === 'function') {
                try { cfg.setActiveTabId(tabId); }
                catch (err) {
                    if (typeof console !== 'undefined' && console.warn) {
                        console.warn(
                            '[TabManager] setActiveTabId threw for scope "' +
                            matchedScope + '", tab "' + tabId + '":',
                            err
                        );
                    }
                }
            }

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
        _applyActiveClasses(scope, tabId);
        _renderTab(scope, tabId);
    }

    /**
     * Force a specific tab to re-render. Use after a write (save, delete,
     * import) to refresh the visible tab without a full page reload.
     * Also applies active classes, so a programmatic re-render of a
     * non-active tab does not visually promote it — use renderActive()
     * for that. requestRender is for "re-run this renderer"; the active
     * tab id does not change.
     */
    function requestRender(scope, tabId) {
        _assertScope(scope);
        _assertTabId(tabId);
        // Do NOT change _activeTabIdByScope here — requestRender means
        // "re-render the pane for tabId", not "activate tabId".
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
