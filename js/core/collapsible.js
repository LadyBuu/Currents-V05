/**
 * =============================================================================
 * STILL WATERS - COLLAPSIBLE UI COMPONENTS (collapsible.js)
 * =============================================================================
 *
 * LOCATION: js/core/ui/collapsible.js
 *
 * SINGLE SOURCE OF TRUTH for all collapsible UI behavior.
 *
 * SCOPE:
 *   - Collapsible sidebar (mobile drawer + desktop collapse)
 *   - Collapsible filter section (header + content)
 *   - Collapsible age groups (character list)
 *   - Collapsible tree nodes (location tree)
 *   - Simple collapsible (manual control, no persistence)
 *
 * DESIGN PRINCIPLES:
 *   - Logical state lives on the DOM as `.collapsed` class.
 *   - CSS owns presentation (height, padding, display, transitions).
 *   - JS toggles classes and attributes only.
 *   - Every initializer that installs listeners returns a destroy() method.
 *   - Collapsed state is derived from classList, never inline styles,
 *     never a cached JS variable.
 *   - Required dependencies fail loudly. Data absence returns legitimate
 *     empty values. Presentation layers may render "Unknown".
 *
 * OUT OF SCOPE:
 *   - Scroll locking mechanics → ui.js (UI.lockBodyScroll)
 *   - Responsive breakpoints → responsive.js
 *   - Icons → icons.js
 *   - Persistence of canonical application data.
 *     Optional UI preference persistence is handled locally here, keyed by
 *     the caller-supplied storageKey. The caller owns key semantics.
 *
 * DEPENDENCIES (REQUIRED):
 *   - ui.js:         UI.lockBodyScroll, UI.unlockBodyScroll
 *   - responsive.js: RESPONSIVE_BREAKPOINTS.MOBILE
 *
 * ICON POLICY: No emojis. No Unicode arrows. CSS or icons.js only.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY GUARDS
    // =========================================================================

    function _requireDependencies() {
        if (typeof window.UI === 'undefined'
            || typeof window.UI.lockBodyScroll !== 'function'
            || typeof window.UI.unlockBodyScroll !== 'function') {
            throw new Error(
                'collapsible.js: ui.js must load first ' +
                '(UI.lockBodyScroll / UI.unlockBodyScroll missing).'
            );
        }
        if (typeof window.RESPONSIVE_BREAKPOINTS === 'undefined'
            || typeof window.RESPONSIVE_BREAKPOINTS.MOBILE !== 'number') {
            throw new Error(
                'collapsible.js: responsive.js must load first ' +
                '(RESPONSIVE_BREAKPOINTS.MOBILE missing).'
            );
        }
    }

    _requireDependencies();

    // =========================================================================
    // 1. SHARED HELPERS
    // =========================================================================

    function _getMobileBreakpoint() {
        return window.RESPONSIVE_BREAKPOINTS.MOBILE;
    }

    function _lockBodyScroll(key) {
        window.UI.lockBodyScroll(key);
        return function() {
            window.UI.unlockBodyScroll(key);
        };
    }

    // Best-effort UI preference persistence. Failures are intentionally
    // swallowed: this is not canonical application data.
    function _readStorage(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }

    function _writeStorage(key, value) {
        try { localStorage.setItem(key, value); } catch (e) { /* unavailable */ }
    }

    function _readJsonStorage(key) {
        try {
            var raw = localStorage.getItem(key);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    }

    function _writeJsonStorage(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* unavailable */ }
    }

    // Deterministic DOM IDs — uniqueness, not entropy.
    var _nextContentId = 1;
    function _generateContentId() {
        return 'collapsible-content-' + (_nextContentId++);
    }

    /**
     * Applies collapsed state to a content element and optional icon.
     * Presentation (height, padding, display) is owned by CSS.
     */
    function _applyCollapsedState(content, icon, collapsed) {
        if (!content) return;
        content.classList.toggle('collapsed', collapsed);
        content.setAttribute('aria-hidden', collapsed ? 'true' : 'false');
        if (icon) {
            icon.classList.toggle('collapsed', collapsed);
        }
    }

    function _isCollapsed(content) {
        return !!content && content.classList.contains('collapsed');
    }

    /**
     * True if the element is a native disclosure-like control whose
     * accessibility semantics we can defer to.
     *
     * Deliberately excludes <a>: an anchor's native behaviour is navigation,
     * not disclosure. Using <a href> as a collapsible header requires an
     * explicit contract we do not currently support.
     */
    function _isNativeDisclosure(el) {
        if (!el || !el.tagName) return false;
        var tag = el.tagName.toLowerCase();
        return tag === 'button' || tag === 'summary';
    }

    /**
     * Links a header (control) to its content region for assistive tech.
     */
    function _linkAria(header, content) {
        if (!header || !content) return;
        if (!content.id) content.id = _generateContentId();
        if (!_isNativeDisclosure(header)) {
            header.setAttribute('role', 'button');
            header.setAttribute('tabindex', '0');
        }
        header.setAttribute('aria-controls', content.id);
        header.setAttribute('aria-expanded', _isCollapsed(content) ? 'false' : 'true');
    }

    function _syncAria(header, content) {
        if (!header) return;
        header.setAttribute('aria-expanded', _isCollapsed(content) ? 'false' : 'true');
    }

    /**
     * True if a click originated from an interactive descendant that should
     * NOT toggle the header.
     *
     * The header itself is always allowed to toggle, even when the header
     * is a <button>, <a>, or <input>.
     */
    function _shouldIgnoreHeaderClick(header, target) {
        if (!target || !target.closest) return false;
        var interactive = target.closest(
            'button, input, select, textarea, a, [data-collapse-ignore]'
        );
        if (!interactive) return false;
        return interactive !== header;
    }

    /**
     * Wires a click + keydown pair to a header. Native disclosure controls
     * get click only (the browser handles Enter/Space). Other elements get
     * keyboard support too.
     */
    function _bindHeaderToggle(header, onToggle) {
        function handleClick(e) {
            if (_shouldIgnoreHeaderClick(header, e.target)) return;
            onToggle();
        }

        header.addEventListener('click', handleClick);

        var keydownHandler = null;
        if (!_isNativeDisclosure(header)) {
            keydownHandler = function(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onToggle();
                }
            };
            header.addEventListener('keydown', keydownHandler);
        }

        return function unbind() {
            header.removeEventListener('click', handleClick);
            if (keydownHandler) header.removeEventListener('keydown', keydownHandler);
        };
    }

    function _assertPlainObject(value, name) {
        if (!value
            || typeof value !== 'object'
            || Array.isArray(value)) {
            throw new Error(
                'collapsible.js: ' + name + ' must be a plain object.'
            );
        }
    }

    function _loadPersistedState(storageKey, target) {
        var saved = _readJsonStorage(storageKey);
        if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
            Object.assign(target, saved);
        }
    }

    function _isMissingKey(key) {
        return key === undefined || key === null || key === '';
    }

    // =========================================================================
    // 2. COLLAPSIBLE SIDEBAR
    // =========================================================================

    /**
     * Initializes a collapsible sidebar with toggle button.
     *
     * Mobile viewport:  `.visible` class controls overlay drawer.
     * Desktop viewport: `.collapsed` class controls slim sidebar.
     *
     * Public methods are viewport-aware:
     *   - openSidebar()  → mobile: open drawer. Desktop: no-op (desktop
     *                      uses collapse/expand, not open/close).
     *   - closeSidebar() → mobile: close drawer. Desktop: no-op.
     *   - toggleSidebar() → mobile: toggle drawer. Desktop: toggle collapsed.
     *
     * @returns {Object|null} { openSidebar, closeSidebar, toggleSidebar, destroy }
     */
    function initCollapsibleSidebar(sidebarId, toggleBtnId, storageKey, mobileBreakpoint) {
        mobileBreakpoint = (mobileBreakpoint === undefined)
            ? _getMobileBreakpoint()
            : mobileBreakpoint;

        var sidebar = document.getElementById(sidebarId);
        if (!sidebar) return null;
        var toggleBtn = document.getElementById(toggleBtnId);

        var overlay = document.querySelector('.sidebar-overlay[data-sidebar="' + sidebarId + '"]');
        var overlayCreated = false;
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'sidebar-overlay';
            overlay.setAttribute('data-sidebar', sidebarId);
            document.body.appendChild(overlay);
            overlayCreated = true;
        }

        // Restore desktop collapsed state (only meaningful on desktop).
        if (_readStorage(storageKey) === 'collapsed'
            && window.innerWidth > mobileBreakpoint) {
            sidebar.classList.add('collapsed');
        }

        var unlockScroll = null;

        function isMobile() {
            return window.innerWidth <= mobileBreakpoint;
        }

        function syncToggleAria() {
            if (!toggleBtn) return;
            // On desktop, "expanded" means "not collapsed".
            // On mobile, "expanded" means "drawer is open".
            var expanded = isMobile()
                ? sidebar.classList.contains('visible')
                : !sidebar.classList.contains('collapsed');
            toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        }

        function openSidebar() {
            if (!isMobile()) return; // desktop uses collapse/expand
            sidebar.classList.add('visible');
            overlay.classList.add('visible');
            if (!unlockScroll) unlockScroll = _lockBodyScroll('sidebar:' + sidebarId);
            syncToggleAria();
        }

        function closeSidebar() {
            sidebar.classList.remove('visible');
            overlay.classList.remove('visible');
            if (unlockScroll) {
                unlockScroll();
                unlockScroll = null;
            }
            syncToggleAria();
        }

        function toggleSidebar() {
            if (isMobile()) {
                if (sidebar.classList.contains('visible')) closeSidebar();
                else openSidebar();
            } else {
                sidebar.classList.toggle('collapsed');
                var isCollapsed = sidebar.classList.contains('collapsed');
                _writeStorage(storageKey, isCollapsed ? 'collapsed' : 'expanded');
                syncToggleAria();
            }
        }

        function handleToggleClick(e) {
            e.stopPropagation();
            toggleSidebar();
        }

        function handleOverlayClick() { closeSidebar(); }

        function handleKeydown(e) {
            if (e.key === 'Escape' && sidebar.classList.contains('visible')) {
                closeSidebar();
            }
        }

        function handleResize() {
            if (window.innerWidth > mobileBreakpoint) {
                // Leaving mobile: close the drawer, keep desktop collapsed state.
                closeSidebar();
            }
            syncToggleAria();
        }

        if (toggleBtn) toggleBtn.addEventListener('click', handleToggleClick);
        overlay.addEventListener('click', handleOverlayClick);
        document.addEventListener('keydown', handleKeydown);
        window.addEventListener('resize', handleResize);

        // Sync ARIA to whatever state we actually restored.
        syncToggleAria();

        return {
            openSidebar: openSidebar,
            closeSidebar: closeSidebar,
            toggleSidebar: toggleSidebar,
            destroy: function() {
                if (toggleBtn) toggleBtn.removeEventListener('click', handleToggleClick);
                overlay.removeEventListener('click', handleOverlayClick);
                document.removeEventListener('keydown', handleKeydown);
                window.removeEventListener('resize', handleResize);
                if (unlockScroll) { unlockScroll(); unlockScroll = null; }
                if (overlayCreated && overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
            }
        };
    }

    // =========================================================================
    // 3. COLLAPSIBLE FILTER SECTION
    // =========================================================================

    /**
     * Initializes a collapsible filter section (header toggles content).
     *
     * @param {string} headerId
     * @param {string} contentId
     * @param {string} storageKey
     * @param {string} [iconId] - optional; visual state driven by .collapsed class
     */
    function initCollapsibleFilter(headerId, contentId, storageKey, iconId) {
        var header = document.getElementById(headerId);
        var content = document.getElementById(contentId);
        var icon = iconId ? document.getElementById(iconId) : null;
        if (!header || !content) return null;

        _linkAria(header, content);

        _applyCollapsedState(
            content,
            icon,
            _readStorage(storageKey) === 'true'
        );
        _syncAria(header, content);

        function toggle() {
            var nowCollapsed = !_isCollapsed(content);
            _applyCollapsedState(content, icon, nowCollapsed);
            _syncAria(header, content);
            _writeStorage(storageKey, nowCollapsed ? 'true' : 'false');
        }

        var unbind = _bindHeaderToggle(header, toggle);

        return {
            expand: function() {
                _applyCollapsedState(content, icon, false);
                _syncAria(header, content);
                _writeStorage(storageKey, 'false');
            },
            collapse: function() {
                _applyCollapsedState(content, icon, true);
                _syncAria(header, content);
                _writeStorage(storageKey, 'true');
            },
            toggle: toggle,
            isCollapsed: function() { return _isCollapsed(content); },
            destroy: unbind
        };
    }

    // =========================================================================
    // 4. COLLAPSIBLE AGE GROUPS
    // =========================================================================

    /**
     * Initializes collapsible age group sections.
     *
     * The caller passes `collapsedState` (an object), which this module
     * mutates and persists. The class list on each content element is the
     * runtime source of truth; the object is the persistence mirror.
     *
     * @returns {Object|null} { refresh, destroy }
     */
    function initCollapsibleAgeGroups(containerId, collapsedState, storageKey) {
        _assertPlainObject(collapsedState, 'collapsedState');

        var container = document.getElementById(containerId);
        if (!container) return null;

        _loadPersistedState(storageKey, collapsedState);

        var unbinds = [];

        function attach() {
            var headers = container.querySelectorAll('.age-group-header');
            for (var i = 0; i < headers.length; i++) {
                (function(header) {
                    var groupKey = header.dataset.key;
                    if (groupKey === undefined) groupKey = header.dataset.group;
                    if (_isMissingKey(groupKey)) return;

                    var content = header.nextElementSibling;
                    if (!content) return;
                    var icon = header.querySelector('.toggle-icon');

                    _linkAria(header, content);

                    _applyCollapsedState(
                        content,
                        icon,
                        collapsedState[groupKey] === true
                    );
                    _syncAria(header, content);

                    function toggle() {
                        var nowCollapsed = !_isCollapsed(content);
                        _applyCollapsedState(content, icon, nowCollapsed);
                        _syncAria(header, content);
                        collapsedState[groupKey] = nowCollapsed;
                        _writeJsonStorage(storageKey, collapsedState);
                    }

                    unbinds.push(_bindHeaderToggle(header, toggle));
                })(headers[i]);
            }
        }

        attach();

        return {
            refresh: function() {
                for (var i = 0; i < unbinds.length; i++) unbinds[i]();
                unbinds = [];
                attach();
            },
            destroy: function() {
                for (var i = 0; i < unbinds.length; i++) unbinds[i]();
                unbinds = [];
            }
        };
    }

    // =========================================================================
    // 5. COLLAPSIBLE TREE NODES
    // =========================================================================

    /**
     * Initializes collapsible tree nodes.
     *
     * Uses event delegation: one listener on the container. This means
     * dynamically replacing the tree contents does not require reattaching
     * listeners, and destroy() actually removes the container listener.
     *
     * @returns {Object|null} { refresh, destroy }
     */
    function initCollapsibleTreeNodes(containerId, collapsedState, storageKey) {
        _assertPlainObject(collapsedState, 'collapsedState');

        var container = document.getElementById(containerId);
        if (!container) return null;

        _loadPersistedState(storageKey, collapsedState);

        function resolveToggle(target) {
            if (!target || !target.closest) return null;
            return target.closest('.tree-toggle, .collapse-icon');
        }

        function resolveNodeContext(toggle) {
            var nodeId = toggle.dataset.toggle;
            if (nodeId === undefined) nodeId = toggle.dataset.node;
            if (_isMissingKey(nodeId)) return null;

            var parentNode = toggle.closest('.tree-node, .location-card');
            if (!parentNode) return null;
            var childrenDiv = parentNode.querySelector('.tree-children, .location-content');
            if (!childrenDiv) return null;

            return { nodeId: nodeId, childrenDiv: childrenDiv };
        }

        function handleClick(e) {
            var toggle = resolveToggle(e.target);
            if (!toggle || !container.contains(toggle)) return;
            e.stopPropagation();

            var ctx = resolveNodeContext(toggle);
            if (!ctx) return;

            var nowCollapsed = !_isCollapsed(ctx.childrenDiv);
            _applyCollapsedState(ctx.childrenDiv, toggle, nowCollapsed);
            collapsedState[ctx.nodeId] = nowCollapsed;
            _writeJsonStorage(storageKey, collapsedState);
        }

        container.addEventListener('click', handleClick);

        function applyState() {
            var toggles = container.querySelectorAll('.tree-toggle, .collapse-icon');
            for (var i = 0; i < toggles.length; i++) {
                var toggle = toggles[i];
                var ctx = resolveNodeContext(toggle);
                if (!ctx) continue;

                _applyCollapsedState(
                    ctx.childrenDiv,
                    toggle,
                    collapsedState[ctx.nodeId] === true
                );
            }
        }

        applyState();

        return {
            refresh: applyState,
            destroy: function() {
                container.removeEventListener('click', handleClick);
            }
        };
    }

    // =========================================================================
    // 6. SIMPLE COLLAPSIBLE
    // =========================================================================

    /**
     * Simple collapsible with imperative control. No persistence.
     * State is stored on the DOM (class list) so external manipulation
     * cannot desync the API from what the user sees.
     *
     * @returns {Object|null} { toggle, expand, collapse, isCollapsed, destroy }
     */
    function createSimpleCollapsible(headerId, contentId, startCollapsed) {
        var header = document.getElementById(headerId);
        var content = document.getElementById(contentId);
        if (!header || !content) return null;

        var icon = header.querySelector('.collapse-icon, .toggle-icon');

        _linkAria(header, content);
        _applyCollapsedState(content, icon, startCollapsed === true);
        _syncAria(header, content);

        function toggle() {
            var nextCollapsed = !_isCollapsed(content);
            _applyCollapsedState(content, icon, nextCollapsed);
            _syncAria(header, content);
        }

        function expand() {
            _applyCollapsedState(content, icon, false);
            _syncAria(header, content);
        }

        function collapse() {
            _applyCollapsedState(content, icon, true);
            _syncAria(header, content);
        }

        var unbind = _bindHeaderToggle(header, toggle);

        return {
            toggle: toggle,
            expand: expand,
            collapse: collapse,
            isCollapsed: function() { return _isCollapsed(content); },
            destroy: unbind
        };
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.initCollapsibleSidebar = initCollapsibleSidebar;
    window.initCollapsibleFilter = initCollapsibleFilter;
    window.initCollapsibleAgeGroups = initCollapsibleAgeGroups;
    window.initCollapsibleTreeNodes = initCollapsibleTreeNodes;
    window.createSimpleCollapsible = createSimpleCollapsible;

    // Namespace alias for callers migrating to the "UI" convention.
    if (typeof window.UI === 'undefined') window.UI = {};
    window.UI.Collapsible = {
        initSidebar: initCollapsibleSidebar,
        initFilter: initCollapsibleFilter,
        initAgeGroups: initCollapsibleAgeGroups,
        initTreeNodes: initCollapsibleTreeNodes,
        createSimple: createSimpleCollapsible
    };

    // NOTE: window.refreshCollapsibleTreeNodes was removed. It created a
    // new component instance (and a new listener) on every call, which
    // could silently stack handlers. Use the return value from
    // initCollapsibleTreeNodes(...).refresh() instead.

})();