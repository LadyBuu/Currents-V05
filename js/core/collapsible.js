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
 * UPDATED: Uses UI.escapeHtml from shared.js when available
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