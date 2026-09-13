/**
 * =============================================================================
 * COLLAPSIBLE UI COMPONENTS (collapsible.js)
 * =============================================================================
 * 
 * LOCATION: js/core/ui/collapsible.js
 * 
 * SINGLE SOURCE OF TRUTH for all collapsible UI components.
 * 
 * DEPENDENCIES: 
 *   - js/core/tree/shared.js (UI.escapeHtml - optional)
 * 
 * UPDATED: Uses UI.escapeHtml from shared.js/**
 * =============================================================================
 * STILL WATERS - COLLAPSIBLE UI COMPONENTS (collapsible.js)
 * =============================================================================
 * 
 * LOCATION: js/core/collapsible.js
 * 
 * SINGLE SOURCE OF TRUTH for all collapsible UI behavior.
 * 
 * SCOPE:
 *   - Collapsible sidebar (mobile + desktop collapse)
 *   - Collapsible filter section (header + content)
 *   - Collapsible age groups (character list)
 *   - Collapsible tree nodes (location tree)
 *   - Simple collapsible (manual control)
 * 
 * DESIGN PRINCIPLES:
 *   - Logical state lives on the DOM as `.collapsed` class.
 *   - CSS owns presentation (height, padding, display, transitions).
 *   - JS toggles classes and attributes.
 *   - Every initializer that installs listeners returns a destroy() method.
 *   - Collapsed state derived from classList, never inline styles.
 *   - No silent dependency fallbacks; formatting/ui must be loaded.
 * 
 * OUT OF SCOPE:
 *   - Scroll locking → ui.js (UI.lockBodyScroll)
 *   - Responsive breakpoints → responsive.js
 *   - Icons → icons.js
 *   - Persistence mechanics → each caller's storageKey handles it
 * 
 * DEPENDENCIES:
 *   - formatting.js (escapeHtml — canonical source)
 *   - ui.js (UI.lockBodyScroll / UI.unlockBodyScroll — optional)
 *   - responsive.js (RESPONSIVE_BREAKPOINTS — optional)
 * 
 * ICON POLICY: No emojis. No Unicode arrows. Use CSS or icons.js.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY HELPERS
    // =========================================================================

    /**
     * Gets the responsive mobile breakpoint, or a sane default.
     * @private
     */
    function _getMobileBreakpoint() {
        if (typeof window.RESPONSIVE_BREAKPOINTS !== 'undefined'
            && window.RESPONSIVE_BREAKPOINTS.MOBILE) {
            return window.RESPONSIVE_BREAKPOINTS.MOBILE;
        }
        return 768;
    }

    /**
     * Locks body scroll via ui.js if available; otherwise records prior value.
     * Returns a restore function.
     * @private
     */
    function _lockBodyScroll(key) {
        if (typeof window.UI !== 'undefined' && typeof window.UI.lockBodyScroll === 'function') {
            window.UI.lockBodyScroll(key);
            return function() {
                if (typeof window.UI.unlockBodyScroll === 'function') {
                    window.UI.unlockBodyScroll(key);
                }
            };
        }
        // Fallback: preserve and restore previous inline value
        var prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return function() {
            document.body.style.overflow = prev;
        };
    }

    /**
     * Safe localStorage helpers.
     * @private
     */
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

    /**
     * Toggles `.collapsed` on a content element and syncs an optional icon.
     * Presentation (height, padding, display) is owned by CSS.
     * 
     * @private
     * @param {HTMLElement} content
     * @param {HTMLElement|null} icon
     * @param {boolean} collapsed
     */
    function _applyCollapsedState(content, icon, collapsed) {
        if (!content) return;
        content.classList.toggle('collapsed', collapsed);
        // aria-hidden reflects visibility
        content.setAttribute('aria-hidden', collapsed ? 'true' : 'false');
        if (icon) {
            icon.classList.toggle('collapsed', collapsed);
        }
    }

    /**
     * Returns whether an element is currently collapsed.
     * Uses classList as the canonical source of truth.
     * @private
     */
    function _isCollapsed(content) {
        return !!content && content.classList.contains('collapsed');
    }

    /**
     * Installs an ARIA linkage between a header (control) and a content region.
     * @private
     */
    function _linkAria(header, content) {
        if (!header || !content) return;
        if (!content.id) {
            content.id = 'collapsible-content-' + Math.random().toString(36).substring(2, 10);
        }
        header.setAttribute('role', 'button');
        header.setAttribute('tabindex', '0');
        header.setAttribute('aria-controls', content.id);
        header.setAttribute('aria-expanded', _isCollapsed(content) ? 'false' : 'true');
    }

    /**
     * Syncs the aria-expanded state to reflect current collapsed state.
     * @private
     */
    function _syncAria(header, content) {
        if (!header) return;
        header.setAttribute('aria-expanded', _isCollapsed(content) ? 'false' : 'true');
    }

    /**
     * Returns true if the click originated from an interactive child that
     * should not toggle the parent. Domain-agnostic: any element with
     * data-collapse-ignore, or standard interactive tags.
     * @private
     */
    function _shouldIgnoreHeaderClick(target) {
        if (!target || !target.closest) return false;
        return !!target.closest('button, input, select, textarea, a, [data-collapse-ignore]');
    }

    // =========================================================================
    // 1. COLLAPSIBLE SIDEBAR
    // =========================================================================

    /**
     * Initializes a collapsible sidebar with toggle button.
     * 
     * Mobile: uses `.visible` class (overlay panel).
     * Desktop: uses `.collapsed` class (slim sidebar).
     * 
     * @param {string} sidebarId
     * @param {string} toggleBtnId
     * @param {string} storageKey
     * @param {number} [mobileBreakpoint] - defaults to RESPONSIVE_BREAKPOINTS.MOBILE
     * @returns {Object|null} { openSidebar, closeSidebar, toggleSidebar, destroy }
     */
    function initCollapsibleSidebar(sidebarId, toggleBtnId, storageKey, mobileBreakpoint) {
        mobileBreakpoint = mobileBreakpoint === undefined ? _getMobileBreakpoint() : mobileBreakpoint;

        var sidebar = document.getElementById(sidebarId);
        if (!sidebar) return null;
        var toggleBtn = document.getElementById(toggleBtnId);

        // Overlay — get or create
        var overlay = document.querySelector('.sidebar-overlay[data-sidebar="' + sidebarId + '"]');
        var overlayCreated = false;
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'sidebar-overlay';
            overlay.setAttribute('data-sidebar', sidebarId);
            document.body.appendChild(overlay);
            overlayCreated = true;
        }

        // Restore desktop collapsed state
        var saved = _readStorage(storageKey);
        if (saved === 'collapsed' && window.innerWidth > mobileBreakpoint) {
            sidebar.classList.add('collapsed');
        }

        // Lock bookkeeping
        var unlockScroll = null;

        function openSidebar() {
            sidebar.classList.add('visible');
            overlay.classList.add('visible');
            if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
            if (!unlockScroll) unlockScroll = _lockBodyScroll('sidebar:' + sidebarId);
        }

        function closeSidebar() {
            sidebar.classList.remove('visible');
            overlay.classList.remove('visible');
            if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
            if (unlockScroll) {
                unlockScroll();
                unlockScroll = null;
            }
        }

        function toggleSidebar() {
            if (sidebar.classList.contains('visible')) closeSidebar();
            else openSidebar();
        }

        // Handlers
        function handleToggleClick(e) {
            e.stopPropagation();
            if (window.innerWidth <= mobileBreakpoint) {
                toggleSidebar();
            } else {
                sidebar.classList.toggle('collapsed');
                var isCollapsed = sidebar.classList.contains('collapsed');
                _writeStorage(storageKey, isCollapsed ? 'collapsed' : 'expanded');
            }
        }

        function handleOverlayClick() {
            closeSidebar();
        }

        function handleKeydown(e) {
            if (e.key === 'Escape' && sidebar.classList.contains('visible')) {
                closeSidebar();
            }
        }

        function handleResize() {
            if (window.innerWidth > mobileBreakpoint) {
                closeSidebar();
            }
        }

        if (toggleBtn) toggleBtn.addEventListener('click', handleToggleClick);
        overlay.addEventListener('click', handleOverlayClick);
        document.addEventListener('keydown', handleKeydown);
        window.addEventListener('resize', handleResize);

        // Initial ARIA state
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');

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
                if (overlayCreated && overlay.parentNode) overlay.parentNode.removeChild(overlay);
            }
        };
    }

    // =========================================================================
    // 2. COLLAPSIBLE FILTER SECTION
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

        var isCollapsed = _readStorage(storageKey) === 'true';
        _applyCollapsedState(content, icon, isCollapsed);
        _syncAria(header, content);

        function handleClick(e) {
            if (_shouldIgnoreHeaderClick(e.target)) return;
            var nowCollapsed = !_isCollapsed(content);
            _applyCollapsedState(content, icon, nowCollapsed);
            _syncAria(header, content);
            _writeStorage(storageKey, nowCollapsed ? 'true' : 'false');
        }

        function handleKeydown(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleClick(e);
            }
        }

        header.addEventListener('click', handleClick);
        header.addEventListener('keydown', handleKeydown);

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
            toggle: function() { handleClick({ target: header, preventDefault: function() {} }); },
            isCollapsed: function() { return _isCollapsed(content); },
            destroy: function() {
                header.removeEventListener('click', handleClick);
                header.removeEventListener('keydown', handleKeydown);
            }
        };
    }

    // =========================================================================
    // 3. COLLAPSIBLE AGE GROUPS
    // =========================================================================

    /**
     * Initializes collapsible age group sections.
     * 
     * The caller passes collapsedState (an object), which this module mutates
     * and persists. The class list on each content element is the runtime
     * source of truth; the object is the persistence mirror.
     * 
     * @param {string} containerId
     * @param {Object} collapsedState - mutated and persisted
     * @param {string} storageKey
     * @returns {Object|null} { refresh, destroy }
     */
    function initCollapsibleAgeGroups(containerId, collapsedState, storageKey) {
        var container = document.getElementById(containerId);
        if (!container) return null;

        // Load persisted state once
        var saved = _readJsonStorage(storageKey);
        if (saved && typeof saved === 'object') {
            Object.assign(collapsedState, saved);
        }

        // Track listeners for destroy()
        var listeners = [];

        function attach() {
            var headers = container.querySelectorAll('.age-group-header');
            for (var i = 0; i < headers.length; i++) {
                (function(header) {
                    var groupKey = header.dataset.key || header.dataset.group;
                    var content = header.nextElementSibling;
                    var icon = header.querySelector('.toggle-icon');
                    if (!content) return;

                    _linkAria(header, content);

                    var isCollapsed = collapsedState[groupKey] === true;
                    _applyCollapsedState(content, icon, isCollapsed);
                    _syncAria(header, content);

                    function handleClick(e) {
                        if (_shouldIgnoreHeaderClick(e.target)) return;
                        var nowCollapsed = !_isCollapsed(content);
                        _applyCollapsedState(content, icon, nowCollapsed);
                        _syncAria(header, content);
                        collapsedState[groupKey] = nowCollapsed;
                        _writeJsonStorage(storageKey, collapsedState);
                    }

                    function handleKeydown(e) {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleClick(e);
                        }
                    }

                    header.addEventListener('click', handleClick);
                    header.addEventListener('keydown', handleKeydown);
                    listeners.push({ header: header, click: handleClick, keydown: handleKeydown });
                })(headers[i]);
            }
        }

        attach();

        return {
            refresh: function() {
                // Detach then re-attach to reflect new DOM
                for (var i = 0; i < listeners.length; i++) {
                    listeners[i].header.removeEventListener('click', listeners[i].click);
                    listeners[i].header.removeEventListener('keydown', listeners[i].keydown);
                }
                listeners = [];
                attach();
            },
            destroy: function() {
                for (var i = 0; i < listeners.length; i++) {
                    listeners[i].header.removeEventListener('click', listeners[i].click);
                    listeners[i].header.removeEventListener('keydown', listeners[i].keydown);
                }
                listeners = [];
            }
        };
    }

    // =========================================================================
    // 4. COLLAPSIBLE TREE NODES
    // =========================================================================

    // WeakMap avoids storing handler references on DOM nodes
    var _treeNodeHandlers = new WeakMap();

    /**
     * Initializes collapsible tree nodes.
     * 
     * @param {string} containerId
     * @param {Object} collapsedState - mutated and persisted
     * @param {string} storageKey
     * @returns {Object|null} { refresh, destroy }
     */
    function initCollapsibleTreeNodes(containerId, collapsedState, storageKey) {
        var container = document.getElementById(containerId);
        if (!container) return null;

        var saved = _readJsonStorage(storageKey);
        if (saved && typeof saved === 'object') {
            Object.assign(collapsedState, saved);
        }

        function attach() {
            var toggles = container.querySelectorAll('.tree-toggle, .collapse-icon');
            for (var i = 0; i < toggles.length; i++) {
                (function(toggle) {
                    var nodeId = toggle.dataset.toggle || toggle.dataset.node;
                    if (!nodeId) return;

                    var parentNode = toggle.closest('.tree-node, .location-card');
                    if (!parentNode) return;
                    var childrenDiv = parentNode.querySelector('.tree-children, .location-content');
                    if (!childrenDiv) return;

                    // Initial visual state
                    var isCollapsed = collapsedState[nodeId] === true;
                    _applyCollapsedState(childrenDiv, toggle, isCollapsed);

                    // Skip if handler already installed on this toggle
                    if (_treeNodeHandlers.has(toggle)) return;

                    function handleClick(e) {
                        e.stopPropagation();
                        var nowCollapsed = !_isCollapsed(childrenDiv);
                        _applyCollapsedState(childrenDiv, toggle, nowCollapsed);
                        collapsedState[nodeId] = nowCollapsed;
                        _writeJsonStorage(storageKey, collapsedState);
                    }

                    _treeNodeHandlers.set(toggle, handleClick);
                    toggle.addEventListener('click', handleClick);
                })(toggles[i]);
            }
        }

        attach();

        return {
            refresh: attach,
            destroy: function() {
                // WeakMap entries can't be iterated; listeners die with their nodes.
                // Callers replacing the DOM entirely should call refresh() on the new content.
            }
        };
    }

    /**
     * Backward-compatible alias for initCollapsibleTreeNodes.
     */
    function refreshCollapsibleTreeNodes(containerId, collapsedState, storageKey) {
        return initCollapsibleTreeNodes(containerId, collapsedState, storageKey);
    }

    // =========================================================================
    // 5. SIMPLE COLLAPSIBLE (manual control, no persistence)
    // =========================================================================

    /**
     * Creates a simple collapsible section with imperative control.
     * 
     * State is stored on the DOM (class list) so external DOM manipulation
     * cannot desync the API from what the user sees.
     * 
     * @param {string} headerId
     * @param {string} contentId
     * @param {boolean} [startCollapsed]
     * @returns {Object|null} { toggle, expand, collapse, isCollapsed, destroy }
     */
    function createSimpleCollapsible(headerId, contentId, startCollapsed) {
        var header = document.getElementById(headerId);
        var content = document.getElementById(contentId);
        if (!header || !content) return null;

        startCollapsed = startCollapsed === true;
        var icon = header.querySelector('.collapse-icon, .toggle-icon');

        _linkAria(header, content);
        _applyCollapsedState(content, icon, startCollapsed);
        _syncAria(header, content);

        function toggle() {
            var nowCollapsed = !_isCollapsed(content);
            _applyCollapsedState(content, icon, nowCollapsed);
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

        function isCollapsed() {
            return _isCollapsed(content);
        }

        function handleClick(e) {
            if (_shouldIgnoreHeaderClick(e.target)) return;
            toggle();
        }

        function handleKeydown(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggle();
            }
        }

        header.addEventListener('click', handleClick);
        header.addEventListener('keydown', handleKeydown);

        return {
            toggle: toggle,
            expand: expand,
            collapse: collapse,
            isCollapsed: isCollapsed,
            destroy: function() {
                header.removeEventListener('click', handleClick);
                header.removeEventListener('keydown', handleKeydown);
            }
        };
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.initCollapsibleSidebar = initCollapsibleSidebar;
    window.initCollapsibleFilter = initCollapsibleFilter;
    window.initCollapsibleAgeGroups = initCollapsibleAgeGroups;
    window.initCollapsibleTreeNodes = initCollapsibleTreeNodes;
    window.refreshCollapsibleTreeNodes = refreshCollapsibleTreeNodes;
    window.createSimpleCollapsible = createSimpleCollapsible;

    // Legacy: expanded/collapsed helpers were removed because presentation
    // is CSS-owned. If any caller still needs explicit control, use the
    // return objects from the initializers.

    // Alias namespace for callers migrating to the "UI" convention
    if (typeof window.UI === 'undefined') window.UI = {};
    window.UI.Collapsible = {
        initSidebar: initCollapsibleSidebar,
        initFilter: initCollapsibleFilter,
        initAgeGroups: initCollapsibleAgeGroups,
        initTreeNodes: initCollapsibleTreeNodes,
        refreshTreeNodes: refreshCollapsibleTreeNodes,
        createSimple: createSimpleCollapsible
    };

})(); when available
 * =============================================================================
 */

// =============================================================================
// 0. HELPER - Safe escape HTML
// =============================================================================

function _escapeHtml(str) {
    if (typeof UI !== 'undefined' && UI.escapeHtml) {
        return UI.escapeHtml(str);
    }
    if (typeof window.escapeHtml === 'function') {
        return window.escapeHtml(str);
    }
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// =============================================================================
// 1. COLLAPSIBLE SIDEBAR
// =============================================================================

/**
 * Initializes a collapsible sidebar with toggle button
 * 
 * @param {string} sidebarId - Sidebar element ID
 * @param {string} toggleBtnId - Toggle button ID
 * @param {string} storageKey - localStorage key for state
 * @param {number} mobileBreakpoint - Breakpoint in pixels (default 768)
 * @returns {Object} { openSidebar, closeSidebar, toggleSidebar } methods
 */
function initCollapsibleSidebar(sidebarId, toggleBtnId, storageKey, mobileBreakpoint = 768) {
    const sidebar = document.getElementById(sidebarId);
    const toggleBtn = document.getElementById(toggleBtnId);
    
    if (!sidebar) return null;
    
    let overlay = document.querySelector(`.sidebar-overlay[data-sidebar="${sidebarId}"]`);
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        overlay.setAttribute('data-sidebar', sidebarId);
        overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:998; display:none;';
        document.body.appendChild(overlay);
    }
    
    function openSidebar() {
        sidebar.classList.add('visible');
        overlay.style.display = 'block';
        document.body.style.overflow = 'hidden';
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
    }
    
    function closeSidebar() {
        sidebar.classList.remove('visible');
        overlay.style.display = 'none';
        document.body.style.overflow = '';
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
    }
    
    function toggleSidebar() {
        if (sidebar.classList.contains('visible')) {
            closeSidebar();
        } else {
            openSidebar();
        }
    }
    
    // Load saved collapsed state for desktop
    const savedState = localStorage.getItem(storageKey);
    if (savedState === 'collapsed' && window.innerWidth > mobileBreakpoint) {
        sidebar.classList.add('collapsed');
    }
    
    // Toggle button click handler
    if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.innerWidth <= mobileBreakpoint) {
                toggleSidebar();
            } else {
                sidebar.classList.toggle('collapsed');
                const isCollapsed = sidebar.classList.contains('collapsed');
                localStorage.setItem(storageKey, isCollapsed ? 'collapsed' : 'expanded');
            }
        });
    }
    
    overlay.addEventListener('click', closeSidebar);
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebar.classList.contains('visible')) {
            closeSidebar();
        }
    });
    
    window.addEventListener('resize', () => {
        if (window.innerWidth > mobileBreakpoint) {
            closeSidebar();
        }
    });
    
    return { openSidebar, closeSidebar, toggleSidebar };
}

// =============================================================================
// 2. COLLAPSIBLE FILTER SECTION
// =============================================================================

/**
 * Initializes a collapsible filter section with header toggle
 * 
 * @param {string} headerId - Header element ID
 * @param {string} contentId - Content element ID
 * @param {string} storageKey - localStorage key for state
 * @param {string} iconId - Optional icon element ID (will show ▶/▼)
 */
function initCollapsibleFilter(headerId, contentId, storageKey, iconId = null) {
    const header = document.getElementById(headerId);
    const content = document.getElementById(contentId);
    const icon = iconId ? document.getElementById(iconId) : null;
    
    if (!header || !content) return;
    
    const isCollapsed = localStorage.getItem(storageKey) === 'true';
    
    if (isCollapsed) {
        collapseContent(content, icon);
    } else {
        expandContent(content, icon);
    }
    
    header.addEventListener('click', (e) => {
        if (e.target.closest('button, input, select, a')) return;
        
        const nowCollapsed = content.style.maxHeight === '0px' || content.classList.contains('collapsed');
        
        if (nowCollapsed) {
            expandContent(content, icon);
            localStorage.setItem(storageKey, 'false');
        } else {
            collapseContent(content, icon);
            localStorage.setItem(storageKey, 'true');
        }
    });
}

/**
 * Expands a collapsible content element
 * @param {HTMLElement} content - Content element
 * @param {HTMLElement|null} icon - Icon element (optional)
 */
function expandContent(content, icon = null) {
    // Temporarily set to block to get scrollHeight
    const originalDisplay = content.style.display;
    content.style.display = 'block';
    content.style.maxHeight = content.scrollHeight + 'px';
    content.style.padding = '12px';
    content.style.overflow = 'hidden';
    content.classList.remove('collapsed');
    if (icon) icon.textContent = '▼';
    
    // Restore display if it was none
    if (originalDisplay === 'none' || originalDisplay === '') {
        // Keep as block
    }
}

/**
 * Collapses a collapsible content element
 * @param {HTMLElement} content - Content element
 * @param {HTMLElement|null} icon - Icon element (optional)
 */
function collapseContent(content, icon = null) {
    content.style.maxHeight = '0';
    content.style.padding = '0 12px';
    content.style.overflow = 'hidden';
    content.classList.add('collapsed');
    if (icon) icon.textContent = '▶';
}

// =============================================================================
// 3. COLLAPSIBLE AGE GROUP (For Character List)
// =============================================================================

/**
 * Initializes collapsible age group sections
 * 
 * @param {string} containerId - Container element ID (where age groups are)
 * @param {Object} collapsedState - Object to store collapsed state (will be mutated)
 * @param {string} storageKey - localStorage key for state persistence
 */
function initCollapsibleAgeGroups(containerId, collapsedState, storageKey) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const saved = localStorage.getItem(storageKey);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            Object.assign(collapsedState, parsed);
        } catch (e) {
            console.warn('Failed to load age group collapsed state:', e);
        }
    }
    
    const headers = container.querySelectorAll('.age-group-header');
    
    for (const header of headers) {
        const groupKey = header.dataset.key || header.dataset.group;
        const content = header.nextElementSibling;
        const icon = header.querySelector('.toggle-icon');
        
        if (!content) continue;
        
        const isCollapsed = collapsedState[groupKey] || false;
        if (isCollapsed) {
            content.classList.add('collapsed');
            if (icon) {
                icon.classList.add('collapsed');
                icon.textContent = '▶';
            }
        } else {
            content.classList.remove('collapsed');
            if (icon) {
                icon.classList.remove('collapsed');
                icon.textContent = '▼';
            }
        }
        
        header.addEventListener('click', (e) => {
            if (e.target.closest('button, .char-item')) return;
            
            const isNowCollapsed = content.classList.contains('collapsed');
            
            if (isNowCollapsed) {
                content.classList.remove('collapsed');
                if (icon) {
                    icon.classList.remove('collapsed');
                    icon.textContent = '▼';
                }
                collapsedState[groupKey] = false;
            } else {
                content.classList.add('collapsed');
                if (icon) {
                    icon.classList.add('collapsed');
                    icon.textContent = '▶';
                }
                collapsedState[groupKey] = true;
            }
            
            localStorage.setItem(storageKey, JSON.stringify(collapsedState));
        });
    }
}

// =============================================================================
// 4. COLLAPSIBLE TREE NODES (For Location Tree)
// =============================================================================

// Store click handlers in a WeakMap to avoid modifying DOM elements directly
const _toggleHandlers = new WeakMap();

/**
 * Initializes collapsible tree nodes for hierarchical displays
 * 
 * @param {string} containerId - Container element ID
 * @param {Object} collapsedState - Object to store collapsed state (will be mutated)
 * @param {string} storageKey - localStorage key for state persistence
 */
function initCollapsibleTreeNodes(containerId, collapsedState, storageKey) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const saved = localStorage.getItem(storageKey);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            Object.assign(collapsedState, parsed);
        } catch (e) {
            console.warn('Failed to load tree node collapsed state:', e);
        }
    }
    
    const toggles = container.querySelectorAll('.tree-toggle, .collapse-icon');
    
    const createToggleHandler = (toggle, nodeId) => (e) => {
        e.stopPropagation();
        const parentNode = toggle.closest('.tree-node, .location-card');
        const childrenDiv = parentNode?.querySelector('.tree-children, .location-content');
        
        if (childrenDiv) {
            const isNowCollapsed = childrenDiv.style.display === 'none';
            childrenDiv.style.display = isNowCollapsed ? 'block' : 'none';
            toggle.textContent = isNowCollapsed ? '▼' : '▶';
            toggle.classList.toggle('collapsed', !isNowCollapsed);
            
            if (nodeId) {
                collapsedState[nodeId] = !isNowCollapsed;
                localStorage.setItem(storageKey, JSON.stringify(collapsedState));
            }
        }
    };
    
    for (const toggle of toggles) {
        const nodeId = toggle.dataset.toggle || toggle.dataset.node;
        if (!nodeId) continue;
        
        const parentNode = toggle.closest('.tree-node, .location-card');
        const childrenDiv = parentNode?.querySelector('.tree-children, .location-content');
        
        if (childrenDiv) {
            const isCollapsed = collapsedState[nodeId] === true;
            if (isCollapsed) {
                childrenDiv.style.display = 'none';
                toggle.textContent = '▶';
                toggle.classList.add('collapsed');
            } else {
                childrenDiv.style.display = 'block';
                toggle.textContent = '▼';
                toggle.classList.remove('collapsed');
            }
        }
        
        // Check if handler already exists for this toggle
        if (!_toggleHandlers.has(toggle)) {
            const handler = createToggleHandler(toggle, nodeId);
            _toggleHandlers.set(toggle, handler);
            toggle.addEventListener('click', handler);
        }
    }
}

/**
 * Refreshes tree node collapsible states (call after dynamic content update)
 * @param {string} containerId - Container element ID
 * @param {Object} collapsedState - Collapsed state object
 * @param {string} storageKey - localStorage key
 */
function refreshCollapsibleTreeNodes(containerId, collapsedState, storageKey) {
    initCollapsibleTreeNodes(containerId, collapsedState, storageKey);
}

// =============================================================================
// 5. SIMPLE COLLAPSIBLE (No localStorage, manual control)
// =============================================================================

/**
 * Creates a simple collapsible section (no localStorage, manual)
 * 
 * @param {string} headerId - Header element ID
 * @param {string} contentId - Content element ID
 * @param {boolean} startCollapsed - Whether to start collapsed (default false)
 * @returns {Object} { toggle, expand, collapse, isCollapsed } methods
 */
function createSimpleCollapsible(headerId, contentId, startCollapsed = false) {
    const header = document.getElementById(headerId);
    const content = document.getElementById(contentId);
    
    if (!header || !content) return null;
    
    let collapsed = startCollapsed;
    const icon = header.querySelector('.collapse-icon, .toggle-icon');
    
    function updateUI() {
        if (collapsed) {
            content.style.display = 'none';
            if (icon) icon.textContent = '▶';
            header.classList.add('collapsed');
        } else {
            content.style.display = 'block';
            if (icon) icon.textContent = '▼';
            header.classList.remove('collapsed');
        }
    }
    
    function toggle() {
        collapsed = !collapsed;
        updateUI();
    }
    
    function expand() {
        collapsed = false;
        updateUI();
    }
    
    function collapse() {
        collapsed = true;
        updateUI();
    }
    
    function isCollapsed() {
        return collapsed;
    }
    
    header.addEventListener('click', (e) => {
        if (e.target.closest('button, input, select, a')) return;
        toggle();
    });
    
    updateUI();
    
    return { toggle, expand, collapse, isCollapsed };
}

// =============================================================================
// 6. EXPORTS
// =============================================================================

// Sidebar
window.initCollapsibleSidebar = initCollapsibleSidebar;

// Filter sections
window.initCollapsibleFilter = initCollapsibleFilter;
window.expandContent = expandContent;
window.collapseContent = collapseContent;

// Age groups
window.initCollapsibleAgeGroups = initCollapsibleAgeGroups;

// Tree nodes
window.initCollapsibleTreeNodes = initCollapsibleTreeNodes;
window.refreshCollapsibleTreeNodes = refreshCollapsibleTreeNodes;

// Simple collapsible
window.createSimpleCollapsible = createSimpleCollapsible;