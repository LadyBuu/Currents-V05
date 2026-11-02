/**
 * =============================================================================
 * STILL WATERS - UNIVERSAL TAB MANAGER (js/core/tab-manager.js)
 * =============================================================================
 *
 * LOCATION: js/core/tab-manager.js
 *
 * SCOPE:
 *   - A scope-keyed registry mapping (scope, tabId) -> renderer
 *   - A dispatcher that resolves the container, builds the context,
 *     calls the renderer, and handles empty states
 *   - A single document-level click handler that routes [data-tab]
 *     clicks to the correct scope's activate() based on DOM ancestry
 *   - Per-scope configuration (context provider, container resolver,
 *     active-tab resolver, empty-state builder, container root)
 *
 * OUT OF SCOPE:
 *   - Domain-specific context construction -> the domain's config block
 *   - Domain-specific state modules (SettlementUIState, HouseholdState)
 *     -> never referenced here
 *   - Modal lifecycle -> modals-core.js
 *   - Icons, formatting -> their own modules
 *
 * WHAT THIS REPLACES:
 *   The prior settlement-specific registry (settlement-tabs.js). It
 *   did everything this module does, but hardcoded to the settlement
 *   domain: one _tabRenderers map, one context builder reading
 *   SettlementUIState / SettlementQueries / SettlementViewModels,
 *   one pane resolver looking for #tab-<tabId>, one document click
 *   handler. That module is being retired. This one generalizes the
 *   same pattern to any number of independent tabbed surfaces.
 *
 * SCOPES:
 *   A scope is a string naming one tabbed surface ('household',
 *   'settlement', 'character', ...). Each scope is independent:
 *   its own renderers, its own context provider, its own container
 *   resolver, its own active-tab state, its own empty-state
 *   messages. Scopes never share state. A click on a [data-tab]
 *   button routes to the scope whose containerRoot contains that
 *   button, so two scopes on the same page never collide.
 *
 * REGISTRATION:
 *   A tab file registers itself at load:
 *
 *       TabManager.register('household', 'members', renderMembers);
 *
 *   Renderers have the signature:
 *
 *       render(container, context)
 *
 *   where:
 *     container  the DOM element to fill. Already emptied by the
 *                manager (via empty-state or container.clear).
 *     context    whatever the scope's buildContext() returned. Never
 *                null when the renderer is called; the manager
 *                handles the null case before calling the renderer.
 *
 *   A renderer that wants to signal "cannot render" should throw or
 *   return false; the manager does NOT catch renderer throws (a
 *   throw is a programmer error, and swallowing it hides bugs).
 *
 * CONFIGURATION:
 *   A domain configures its scope once, at bootstrap:
 *
 *       TabManager.configure('household', {
 *           containerRoot:   HTMLElement | () => HTMLElement,
 *           resolveContainer: (tabId) => HTMLElement | null,
 *           buildContext:     () => context | null,
 *           getActiveTabId:   () => tabId | null,
 *           setActiveTabId:   (tabId) => void,
 *           buildEmptyState:  (tabId, reason) => string,
 *           onActivate:       (tabId, context) => void  // optional
 *       });
 *
 *   The `containerRoot` field is what makes the click handler
 *   unambiguous: when the user clicks a [data-tab] button, the
 *   manager walks up from the button and checks whether any
 *   configured scope's containerRoot contains it. First match wins.
 *   If no scope claims the click, the click is ignored — safe.
 *
 *   The `resolveContainer` field defaults to
 *   `document.getElementById('tab-' + tabId)` if not supplied.
 *   Override it if your panes use a different id convention.
 *
 *   The `buildEmptyState` field defaults to a small generic
 *   builder. Override it for domain-specific messages.
 *
 *   The `getActiveTabId` / `setActiveTabId` fields default to a
 *   per-scope in-memory variable, so a scope with no active-tab
 *   persistence (e.g. a scope whose active tab lives elsewhere)
 *   works without providing them.
 *
 * LIFECYCLE:
 *   init() attaches the document-level click handler and is
 *   idempotent. It is safe to call from any bootstrap; it is also
 *   safe to never call it if a scope wires its own click handler
 *   and calls activate(scope, tabId) directly.
 *
 *   requestRender(scope, tabId) coalesces rapid renders of the
 *   same tab onto a single next-tick render. Useful when a data
 *   mutation fires several notifications in a row.
 *
 * EMPTY STATES:
 *   When render(scope, tabId) cannot produce a rendered tab, the
 *   manager writes buildEmptyState(scope, tabId, reason) into the
 *   container and returns false. Reasons:
 *
 *     'no-container'   resolveContainer returned null.
 *     'no-context'     buildContext returned null (e.g. no
 *                      selection yet).
 *     'no-renderer'    no renderer registered for this (scope, tabId).
 *
 *   The builder receives the reason so it can produce the right
 *   message per case ("Select a household first" vs. "This tab is
 *   not available").
 *
 * DEPENDENCIES:
 *   None. No domain modules, no UI state, no formatting, no icons.
 *   The manager is a pure registry + dispatcher. It does not
 *   reference window.HouseholdQueries, window.SettlementUIState,
 *   window.getCurrentYear, or anything else. Every domain-specific
 *   concern lives in the domain's config block.
 *
 * ICON POLICY: No emojis. No icons. The manager inserts no HTML of
 * its own beyond the empty-state string, which the domain's builder
 * supplies.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. INTERNAL STATE
    // =========================================================================

    // Per-scope configuration.
    //   _configs[scope] = {
    //       containerRoot:    HTMLElement | () => HTMLElement | null
    //       resolveContainer: (tabId) => HTMLElement | null
    //       buildContext:     () => context | null
    //       getActiveTabId:   () => tabId | null
    //       setActiveTabId:   (tabId) => void
    //       buildEmptyState:  (tabId, reason) => string
    //       onActivate:       ((tabId, context) => void) | null
    //   }
    var _configs = Object.create(null);

    // Per-scope renderer map.
    //   _renderers[scope] = { tabId: rendererFn, ... }
    var _renderers = Object.create(null);

    // Per-scope active-tab fallback, used when a scope does not
    // supply getActiveTabId / setActiveTabId. Scopes that DO supply
    // them never touch this map.
    var _fallbackActive = Object.create(null);

    // Per-scope pending next-tick render (for requestRender).
    //   _pendingRender[scope] = { tabId, handle }
    var _pendingRender = Object.create(null);

    // Idempotency flag for init().
    var _initialized = false;

    // =========================================================================
    // 2. VALIDATION HELPERS
    // =========================================================================

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _isNonEmptyString(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _assertScope(scope) {
        if (!_isNonEmptyString(scope)) {
            throw new Error(
                'TabManager: scope must be a non-empty string (got ' +
                typeof scope + ')'
            );
        }
    }

    function _assertTabId(tabId) {
        if (!_isNonEmptyString(tabId)) {
            throw new Error(
                'TabManager: tabId must be a non-empty string (got ' +
                typeof tabId + ')'
            );
        }
    }

    function _assertRenderer(fn) {
        if (typeof fn !== 'function') {
            throw new Error(
                'TabManager: renderer must be a function (got ' +
                typeof fn + ')'
            );
        }
    }

    // =========================================================================
    // 3. CONFIGURATION DEFAULTS
    // =========================================================================

    function _defaultResolveContainer(tabId) {
        return document.getElementById('tab-' + tabId);
    }

    function _defaultBuildContext() {
        return {};
    }

    function _defaultGetActiveTabId(scope) {
        return function() {
            var v = _fallbackActive[scope];
            return _isNonEmptyString(v) ? v : null;
        };
    }

    function _defaultSetActiveTabId(scope) {
        return function(tabId) {
            _fallbackActive[scope] = tabId;
        };
    }

    function _defaultBuildEmptyState(tabId, reason) {
        if (reason === 'no-renderer') return 'This tab is not available.';
        if (reason === 'no-container') return '';
        if (reason === 'no-context') return '';
        return '';
    }

    function _resolveContainerRoot(cfg) {
        if (!cfg) return null;
        var root = cfg.containerRoot;
        if (_isMissing(root)) return null;
        if (typeof root === 'function') {
            try { return root(); } catch (e) { return null; }
        }
        return root;
    }

    // =========================================================================
    // 4. CONFIGURE
    // =========================================================================

    /**
     * Registers a scope's configuration. Must be called before the
     * scope's tab files register with `register()`, and before
     * `render()` / `activate()` / `init()` are called for that scope.
     *
     * The whole config object is optional per field; missing fields
     * fall back to sensible defaults. `containerRoot` is the one
     * field that must be supplied for the click handler to route
     * correctly — but `render()` and `activate()` work without it.
     *
     * @param {string} scope
     * @param {Object} options
     */
    function configure(scope, options) {
        _assertScope(scope);
        options = options || {};
        if (typeof options !== 'object' || Array.isArray(options)) {
            throw new Error('TabManager.configure: options must be an object');
        }

        var cfg = {
            containerRoot: _isMissing(options.containerRoot)
                ? null : options.containerRoot,
            resolveContainer: typeof options.resolveContainer === 'function'
                ? options.resolveContainer : _defaultResolveContainer,
            buildContext: typeof options.buildContext === 'function'
                ? options.buildContext : _defaultBuildContext,
            getActiveTabId: typeof options.getActiveTabId === 'function'
                ? options.getActiveTabId : _defaultGetActiveTabId(scope),
            setActiveTabId: typeof options.setActiveTabId === 'function'
                ? options.setActiveTabId : _defaultSetActiveTabId(scope),
            buildEmptyState: typeof options.buildEmptyState === 'function'
                ? options.buildEmptyState : _defaultBuildEmptyState,
            onActivate: typeof options.onActivate === 'function'
                ? options.onActivate : null
        };

        _configs[scope] = cfg;
    }

    // =========================================================================
    // 5. REGISTRATION
    // =========================================================================

    function register(scope, tabId, renderer) {
        _assertScope(scope);
        _assertTabId(tabId);
        _assertRenderer(renderer);

        if (!_renderers[scope]) _renderers[scope] = Object.create(null);
        _renderers[scope][tabId] = renderer;
    }

    function unregister(scope, tabId) {
        _assertScope(scope);
        _assertTabId(tabId);
        if (!_renderers[scope]) return;
        delete _renderers[scope][tabId];
    }

    function has(scope, tabId) {
        if (!_isNonEmptyString(scope) || !_isNonEmptyString(tabId)) {
            return false;
        }
        var scopeMap = _renderers[scope];
        return !!scopeMap && typeof scopeMap[tabId] === 'function';
    }

    function getRenderer(scope, tabId) {
        if (!_isNonEmptyString(scope) || !_isNonEmptyString(tabId)) {
            return null;
        }
        var scopeMap = _renderers[scope];
        return scopeMap && typeof scopeMap[tabId] === 'function'
            ? scopeMap[tabId]
            : null;
    }

    function getRegistered(scope) {
        if (!_isNonEmptyString(scope)) return [];
        var scopeMap = _renderers[scope];
        if (!scopeMap) return [];
        return Object.keys(scopeMap).sort();
    }

    // =========================================================================
    // 6. DISPATCH
    // =========================================================================

    /**
     * Renders a single tab for a scope.
     *
     * Flow:
     *   1. resolve the container via cfg.resolveContainer(tabId)
     *   2. if null, write empty-state with reason 'no-container'
     *   3. build context via cfg.buildContext()
     *   4. if null, write empty-state with reason 'no-context'
     *   5. look up the renderer; if missing, empty-state 'no-renderer'
     *   6. clear the container, call renderer(container, context)
     *
     * Renderers that throw propagate. The manager does not swallow
     * renderer exceptions — a throwing renderer is a bug, and the
     * caller should see it.
     *
     * @returns {boolean} true if the renderer ran, false otherwise
     */
    function render(scope, tabId) {
        _assertScope(scope);
        _assertTabId(tabId);

        var cfg = _configs[scope];
        if (!cfg) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    'TabManager.render: scope "' + scope +
                    '" is not configured; call TabManager.configure first.'
                );
            }
            return false;
        }

        var container = null;
        try {
            container = cfg.resolveContainer(tabId);
        } catch (e) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    'TabManager.render: resolveContainer threw for scope "' +
                    scope + '" tab "' + tabId + '"', e
                );
            }
            return false;
        }

        if (!container) {
            _writeEmptyState(cfg, scope, tabId, 'no-container');
            return false;
        }

        var context = null;
        try {
            context = cfg.buildContext();
        } catch (e) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    'TabManager.render: buildContext threw for scope "' +
                    scope + '"', e
                );
            }
            context = null;
        }

        if (_isMissing(context)) {
            _writeEmptyState(cfg, scope, tabId, 'no-context');
            return false;
        }

        var renderer = getRenderer(scope, tabId);
        if (!renderer) {
            _writeEmptyState(cfg, scope, tabId, 'no-renderer');
            return false;
        }

        // Clear before the renderer runs. The renderer is allowed
        // to append; the manager guarantees an empty starting
        // container.
        container.innerHTML = '';

        // Renderer exceptions propagate. See render() docstring.
        renderer(container, context);

        if (cfg.onActivate) {
            try { cfg.onActivate(tabId, context); }
            catch (e) {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn(
                        'TabManager.render: onActivate threw for scope "' +
                        scope + '" tab "' + tabId + '"', e
                    );
                }
            }
        }

        return true;
    }

    function _writeEmptyState(cfg, scope, tabId, reason) {
        var container;
        try {
            container = cfg.resolveContainer(tabId);
        } catch (e) {
            return;
        }
        if (!container) return;

        var html;
        try {
            html = cfg.buildEmptyState(tabId, reason);
        } catch (e) {
            html = '';
        }
        if (typeof html !== 'string') html = '';
        container.innerHTML = html;
    }

    /**
     * Renders whichever tab is currently active for the scope.
     * Returns false if no active tab is set (or if render returns
     * false for the active tab).
     */
    function renderActive(scope) {
        _assertScope(scope);
        var cfg = _configs[scope];
        if (!cfg) return false;
        var tabId = null;
        try { tabId = cfg.getActiveTabId(); }
        catch (e) { tabId = null; }
        if (!_isNonEmptyString(tabId)) return false;
        return render(scope, tabId);
    }

    /**
     * Sets the active tab and renders it.
     */
    function activate(scope, tabId) {
        _assertScope(scope);
        _assertTabId(tabId);
        setActive(scope, tabId);
        return render(scope, tabId);
    }

    /**
     * Sets the active tab without rendering it.
     */
    function setActive(scope, tabId) {
        _assertScope(scope);
        _assertTabId(tabId);
        var cfg = _configs[scope];
        if (!cfg) return;
        try { cfg.setActiveTabId(tabId); }
        catch (e) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    'TabManager.setActive: setActiveTabId threw for scope "' +
                    scope + '"', e
                );
            }
        }
    }

    /**
     * Coalesces rapid renders of the same tab onto the next tick.
     * Useful when a data mutation fires several notifications in a
     * row. Does NOT coalesce across different tabs — rendering tab
     * A then tab B in the same tick produces two renders on the
     * next tick, which is correct (the user wanted B; if they
     * wanted A, they wouldn't have requested B).
     */
    function requestRender(scope, tabId) {
        _assertScope(scope);
        _assertTabId(tabId);

        if (!_pendingRender[scope]) {
            _pendingRender[scope] = Object.create(null);
        }
        var scopePending = _pendingRender[scope];

        // If this tab is already queued, keep the existing handle.
        if (scopePending[tabId]) return;

        scopePending[tabId] = setTimeout(function() {
            delete scopePending[tabId];
            try { render(scope, tabId); }
            catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error(
                        'TabManager.requestRender: deferred render threw ' +
                        'for scope "' + scope + '" tab "' + tabId + '"', e
                    );
                }
            }
        }, 0);
    }

    // =========================================================================
    // 7. CLICK HANDLER
    // =========================================================================
    //
    // A single document-level click handler routes [data-tab] clicks
    // to the correct scope. The routing rule: walk up from the
    // clicked button and find the first scope whose containerRoot
    // contains it. If no scope claims it, ignore the click.
    //
    // This is why containerRoot matters: it is the ONLY thing that
    // disambiguates one scope's [data-tab] buttons from another's.
    // Two scopes on the same page work correctly as long as their
    // containerRoots do not contain each other (they should be
    // sibling subtrees, not nested).

    function _findScopeForElement(el) {
        if (!el) return null;
        var scopes = Object.keys(_configs);
        for (var i = 0; i < scopes.length; i++) {
            var scope = scopes[i];
            var root = _resolveContainerRoot(_configs[scope]);
            if (!root) continue;
            if (typeof root.contains !== 'function') continue;
            if (root.contains(el)) return scope;
        }
        return null;
    }

    function _handleClick(event) {
        if (!event || !event.target) return;
        var target = event.target;
        if (typeof target.closest !== 'function') return;

        // Ignore clicks inside tab CONTENT areas. Tab content
        // sometimes contains nested buttons; a click on those
        // should not be interpreted as a tab switch.
        if (target.closest('[data-tab-content], .tab-content, [data-tab-pane]')) {
            return;
        }

        var button = target.closest('[data-tab]');
        if (!button) return;

        var scope = _findScopeForElement(button);
        if (!scope) return;

        var tabId = button.getAttribute('data-tab');
        if (!_isNonEmptyString(tabId)) return;

        event.preventDefault();
        activate(scope, tabId);
    }

    /**
     * Attaches the document-level click handler. Idempotent.
     * Scopes that wire their own click handler can skip this — the
     * manager's render / activate work without init() being called.
     */
    function init() {
        if (_initialized) return;
        _initialized = true;
        document.addEventListener('click', _handleClick);
    }

    // =========================================================================
    // 8. DIAGNOSTICS
    // =========================================================================

    function getScopes() {
        return Object.keys(_configs).sort();
    }

    function getStatus() {
        var out = {
            initialized: _initialized,
            scopes: {}
        };
        var scopes = Object.keys(_configs);
        for (var i = 0; i < scopes.length; i++) {
            var scope = scopes[i];
            out.scopes[scope] = {
                registered: getRegistered(scope),
                hasContainerRoot: !!_resolveContainerRoot(_configs[scope]),
                activeTabId: (function() {
                    try { return _configs[scope].getActiveTabId(); }
                    catch (e) { return null; }
                })()
            };
        }
        return out;
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.TabManager = {
        // Configuration
        configure: configure,

        // Registration
        register: register,
        unregister: unregister,
        has: has,
        getRenderer: getRenderer,
        getRegistered: getRegistered,

        // Dispatch
        render: render,
        renderActive: renderActive,
        activate: activate,
        setActive: setActive,
        requestRender: requestRender,

        // Lifecycle
        init: init,

        // Diagnostics
        getScopes: getScopes,
        getStatus: getStatus
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.TabManager;
    }

})();
