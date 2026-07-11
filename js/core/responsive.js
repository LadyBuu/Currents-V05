/**
 * =============================================================================
 * RESPONSIVE UI UTILITIES (responsive.js)
 * =============================================================================
 * 
 * LOCATION: js/core/ui/responsive.js
 * 
 * This file contains ALL responsive/mobile utility functions including:
 * - Viewport detection (mobile vs desktop)
 * - Responsive body class management
 * - Responsive grid initialization
 * - Mobile menu handling
 * - Touch-friendly adjustments
 * 
 * DEPENDENCIES: 
 *   - js/core/collections.js (debounce function)
 * 
 * =============================================================================
 * EXPORTED FUNCTIONS (on window):
 * =============================================================================
 * 
 * Constants:
 *   - RESPONSIVE_BREAKPOINTS - Object { MOBILE: 768, TABLET: 1024, DESKTOP: 1200 }
 * 
 * Viewport Detection:
 *   - isMobileViewport(breakpoint) - Checks if viewport is mobile (≤ breakpoint, default 768)
 *   - isTableViewport(mobileBreakpoint, tabletBreakpoint) - Checks if viewport is tablet (768-1024)
 *   - isDesktopViewport(tabletBreakpoint) - Checks if viewport is desktop (>1024)
 *   - getViewportCategory() - Returns 'mobile', 'tablet', or 'desktop'
 * 
 * Body Class Management:
 *   - initResponsiveBody(breakpoint, tabletBreakpoint) - Adds responsive classes to body
 *     Classes: 'mobile-view', 'tablet-view', 'desktop-view'
 * 
 * Responsive Grid:
 *   - initResponsiveGrid(containerId, desktopCols, tabletCols, mobileCols, options)
 *     Creates grid that changes columns based on screen size
 *     Options: { gap, minItemWidth, maxWidth }
 *     Returns { refresh } method
 * 
 * Mobile Menu:
 *   - initMobileMenu(menuBtnId, menuContainerId, storageKey, breakpoint)
 *     Initializes hamburger menu with overlay and escape key support
 *     Returns { open, close, toggle, isOpen } methods
 * 
 * Touch-Friendly Adjustments:
 *   - initTouchFriendly() - Adds 'touch-friendly' class to body on mobile
 *   - initSwipeable(elementId, callbacks) - Makes element swipeable
 *     Callbacks: { onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown }
 * 
 * Utility:
 *   - refreshResponsiveComponents() - Manually refreshes all responsive components
 * 
 * =============================================================================
 * BREAKPOINT REFERENCE:
 * =============================================================================
 * 
 * Category  | Breakpoint | Range
 * ----------|------------|----------------
 * Mobile    | 768px      | ≤ 768px
 * Tablet    | 1024px     | 769px - 1024px
 * Desktop   | >1024px    | >1024px
 * 
 * =============================================================================
 * CSS CLASSES (for styling):
 * =============================================================================
 * 
 * Body Classes:
 *   .mobile-view - When viewport is mobile
 *   .tablet-view - When viewport is tablet
 *   .desktop-view - When viewport is desktop
 *   .touch-friendly - When on mobile (increases touch target sizes)
 * 
 * Menu Classes:
 *   .mobile-visible - Added to menu container when open
 *   .mobile-menu-overlay - Overlay behind mobile menu
 * 
 * =============================================================================
 * USAGE EXAMPLES:
 * =============================================================================
 * 
 * // Initialize all responsive features
 * initResponsiveBody();
 * initTouchFriendly();
 * 
 * // Responsive grid
 * const grid = initResponsiveGrid('charactersGrid', 3, 2, 1, {
 *   gap: '16px',
 *   minItemWidth: 250
 * });
 * 
 * // Mobile menu
 * const menu = initMobileMenu('hamburgerBtn', 'mainNav', 'menu_state');
 * menu.open();
 * 
 * // Swipeable panel
 * initSwipeable('carousel', {
 *   onSwipeLeft: () => nextSlide(),
 *   onSwipeRight: () => prevSlide()
 * });
 * 
 * // Viewport detection
 * if (isMobileViewport()) {
 *   console.log('Mobile layout');
 * }
 * const category = getViewportCategory(); // 'mobile', 'tablet', 'desktop'
 * 
 * =============================================================================
 */

// =============================================================================
// 1. DEPENDENCY WRAPPERS
// =============================================================================

/**
 * Safe wrapper for debounce - uses collections.js version
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in ms
 * @returns {Function} Debounced function
 */
function _getDebounce() {
    if (typeof window.debounce === 'function') {
        return window.debounce;
    }
    // Minimal fallback if collections.js not loaded
    return function(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func.apply(this, args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    };
}

// =============================================================================
// 2. VIEWPORT DETECTION
// =============================================================================

/**
 * Default breakpoint constants
 */
const RESPONSIVE_BREAKPOINTS = {
    MOBILE: 768,      // Mobile devices (phones)
    TABLET: 1024,     // Tablet devices
    DESKTOP: 1200     // Desktop screens
};

/**
 * Checks if the current viewport is mobile (width <= breakpoint)
 * @param {number} breakpoint - Breakpoint in pixels (default 768)
 * @returns {boolean} True if mobile
 */
function isMobileViewport(breakpoint = RESPONSIVE_BREAKPOINTS.MOBILE) {
    return window.innerWidth <= breakpoint;
}

/**
 * Checks if the current viewport is tablet (between mobile and tablet breakpoint)
 * @param {number} mobileBreakpoint - Mobile breakpoint (default 768)
 * @param {number} tabletBreakpoint - Tablet breakpoint (default 1024)
 * @returns {boolean} True if tablet
 */
function isTableViewport(mobileBreakpoint = RESPONSIVE_BREAKPOINTS.MOBILE, tabletBreakpoint = RESPONSIVE_BREAKPOINTS.TABLET) {
    const width = window.innerWidth;
    return width > mobileBreakpoint && width <= tabletBreakpoint;
}

/**
 * Checks if the current viewport is desktop (width > tablet breakpoint)
 * @param {number} tabletBreakpoint - Tablet breakpoint (default 1024)
 * @returns {boolean} True if desktop
 */
function isDesktopViewport(tabletBreakpoint = RESPONSIVE_BREAKPOINTS.TABLET) {
    return window.innerWidth > tabletBreakpoint;
}

/**
 * Gets the current viewport category
 * @returns {string} 'mobile', 'tablet', or 'desktop'
 */
function getViewportCategory() {
    if (isMobileViewport()) return 'mobile';
    if (isTableViewport()) return 'tablet';
    return 'desktop';
}

// =============================================================================
// 3. RESPONSIVE BODY CLASS MANAGEMENT
// =============================================================================

/**
 * Adds responsive classes to body based on viewport
 * body classes: 'mobile-view', 'tablet-view', 'desktop-view'
 * 
 * @param {number} breakpoint - Breakpoint in pixels (default 768)
 * @param {number} tabletBreakpoint - Tablet breakpoint (default 1024)
 */
function initResponsiveBody(breakpoint = RESPONSIVE_BREAKPOINTS.MOBILE, tabletBreakpoint = RESPONSIVE_BREAKPOINTS.TABLET) {
    const debounce = _getDebounce();
    
    function updateBodyClass() {
        const width = window.innerWidth;
        
        document.body.classList.remove('mobile-view', 'tablet-view', 'desktop-view');
        
        if (width <= breakpoint) {
            document.body.classList.add('mobile-view');
        } else if (width <= tabletBreakpoint) {
            document.body.classList.add('tablet-view');
        } else {
            document.body.classList.add('desktop-view');
        }
    }
    
    updateBodyClass();
    window.addEventListener('resize', debounce(updateBodyClass, 150));
}

// =============================================================================
// 4. RESPONSIVE GRID
// =============================================================================

/**
 * Creates a responsive grid that changes columns based on screen size
 * 
 * @param {string} containerId - Container element ID
 * @param {number} desktopCols - Number of columns on desktop
 * @param {number} tabletCols - Number of columns on tablet
 * @param {number} mobileCols - Number of columns on mobile
 * @param {Object} options - Additional grid options
 * @returns {Object} { refresh } method
 */
function initResponsiveGrid(containerId, desktopCols = 3, tabletCols = 2, mobileCols = 1, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return null;
    
    const debounce = _getDebounce();
    
    const {
        gap = '16px',
        minItemWidth = null,
        maxWidth = null
    } = options;
    
    function updateGrid() {
        const width = window.innerWidth;
        let cols = desktopCols;
        
        if (width <= RESPONSIVE_BREAKPOINTS.MOBILE) {
            cols = mobileCols;
        } else if (width <= RESPONSIVE_BREAKPOINTS.TABLET) {
            cols = tabletCols;
        }
        
        if (minItemWidth && container.parentElement) {
            const containerWidth = container.parentElement.clientWidth;
            const calculatedCols = Math.floor(containerWidth / minItemWidth);
            cols = Math.max(mobileCols, Math.min(desktopCols, calculatedCols));
        }
        
        container.style.display = 'grid';
        container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        container.style.gap = gap;
        
        if (maxWidth) {
            container.style.maxWidth = maxWidth;
            container.style.margin = '0 auto';
        }
    }
    
    updateGrid();
    window.addEventListener('resize', debounce(updateGrid, 150));
    
    return { refresh: updateGrid };
}

// =============================================================================
// 5. MOBILE MENU HANDLING
// =============================================================================

/**
 * Initializes a mobile menu with hamburger button
 * 
 * @param {string} menuBtnId - Menu button ID (hamburger)
 * @param {string} menuContainerId - Menu container ID (the nav/sidebar)
 * @param {string} storageKey - localStorage key for state (optional)
 * @param {number} breakpoint - Breakpoint where menu becomes mobile (default 768)
 * @returns {Object} { open, close, toggle, isOpen } methods
 */
function initMobileMenu(menuBtnId, menuContainerId, storageKey = null, breakpoint = RESPONSIVE_BREAKPOINTS.MOBILE) {
    const menuBtn = document.getElementById(menuBtnId);
    const menuContainer = document.getElementById(menuContainerId);
    
    if (!menuBtn || !menuContainer) return null;
    
    let isMenuOpen = false;
    
    let overlay = document.querySelector(`.mobile-menu-overlay[data-menu="${menuContainerId}"]`);
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'mobile-menu-overlay';
        overlay.setAttribute('data-menu', menuContainerId);
        overlay.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:997; display:none;';
        document.body.appendChild(overlay);
    }
    
    function open() {
        menuContainer.classList.add('mobile-visible');
        overlay.style.display = 'block';
        document.body.style.overflow = 'hidden';
        isMenuOpen = true;
        menuBtn.setAttribute('aria-expanded', 'true');
        if (storageKey) localStorage.setItem(storageKey, 'open');
    }
    
    function close() {
        menuContainer.classList.remove('mobile-visible');
        overlay.style.display = 'none';
        document.body.style.overflow = '';
        isMenuOpen = false;
        menuBtn.setAttribute('aria-expanded', 'false');
        if (storageKey) localStorage.setItem(storageKey, 'closed');
    }
    
    function toggle() {
        if (isMenuOpen) {
            close();
        } else {
            open();
        }
    }
    
    if (storageKey) {
        const saved = localStorage.getItem(storageKey);
        if (saved === 'open') open();
    }
    
    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.innerWidth <= breakpoint) {
            toggle();
        }
    });
    
    overlay.addEventListener('click', close);
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isMenuOpen) close();
    });
    
    window.addEventListener('resize', () => {
        if (window.innerWidth > breakpoint) {
            close();
        }
    });
    
    return { open, close, toggle, isOpen: () => isMenuOpen };
}

// =============================================================================
// 6. TOUCH-FRIENDLY ADJUSTMENTS
// =============================================================================

/**
 * Increases touch target sizes for mobile devices
 * Adds class 'touch-friendly' to body on mobile
 */
function initTouchFriendly() {
    const debounce = _getDebounce();
    
    function updateTouchClass() {
        if (isMobileViewport()) {
            document.body.classList.add('touch-friendly');
        } else {
            document.body.classList.remove('touch-friendly');
        }
    }
    
    updateTouchClass();
    window.addEventListener('resize', debounce(updateTouchClass, 150));
}

/**
 * Makes an element swipeable (for mobile carousels/panels)
 * 
 * @param {string} elementId - Element ID to make swipeable
 * @param {Object} callbacks - { onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown }
 */
function initSwipeable(elementId, callbacks = {}) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;
    
    const minSwipeDistance = 50;
    
    element.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, false);
    
    element.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        handleSwipe();
    }, false);
    
    function handleSwipe() {
        const deltaX = touchEndX - touchStartX;
        const deltaY = touchEndY - touchStartY;
        
        if (Math.abs(deltaX) < minSwipeDistance && Math.abs(deltaY) < minSwipeDistance) return;
        
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
            if (deltaX > 0 && callbacks.onSwipeRight) {
                callbacks.onSwipeRight();
            } else if (deltaX < 0 && callbacks.onSwipeLeft) {
                callbacks.onSwipeLeft();
            }
        } else {
            if (deltaY > 0 && callbacks.onSwipeDown) {
                callbacks.onSwipeDown();
            } else if (deltaY < 0 && callbacks.onSwipeUp) {
                callbacks.onSwipeUp();
            }
        }
    }
}

// =============================================================================
// 7. UTILITY FUNCTION (for manual refresh)
// =============================================================================

/**
 * Manually refresh all responsive components
 * Call this after dynamic content changes
 */
function refreshResponsiveComponents() {
    // Re-trigger body class update
    const width = window.innerWidth;
    document.body.classList.remove('mobile-view', 'tablet-view', 'desktop-view');
    
    if (width <= RESPONSIVE_BREAKPOINTS.MOBILE) {
        document.body.classList.add('mobile-view');
    } else if (width <= RESPONSIVE_BREAKPOINTS.TABLET) {
        document.body.classList.add('tablet-view');
    } else {
        document.body.classList.add('desktop-view');
    }
    
    // Re-trigger touch-friendly class
    if (isMobileViewport()) {
        document.body.classList.add('touch-friendly');
    } else {
        document.body.classList.remove('touch-friendly');
    }
}

// =============================================================================
// 8. EXPORTS
// =============================================================================

// Breakpoints
window.RESPONSIVE_BREAKPOINTS = RESPONSIVE_BREAKPOINTS;

// Viewport detection
window.isMobileViewport = isMobileViewport;
window.isTableViewport = isTableViewport;
window.isDesktopViewport = isDesktopViewport;
window.getViewportCategory = getViewportCategory;

// Body class management
window.initResponsiveBody = initResponsiveBody;

// Responsive grid
window.initResponsiveGrid = initResponsiveGrid;

// Mobile menu
window.initMobileMenu = initMobileMenu;

// Touch-friendly
window.initTouchFriendly = initTouchFriendly;
window.initSwipeable = initSwipeable;

// Utility
window.refreshResponsiveComponents = refreshResponsiveComponents;