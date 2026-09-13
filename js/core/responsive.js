/**
 * =============================================================================
 * STILL WATERS - RESPONSIVE UI (responsive.js)
 * =============================================================================
 * 
 * LOCATION: js/core/responsive.js
 * 
 * SINGLE SOURCE OF TRUTH for viewport detection, responsive body classes,
 * responsive grid helpers, and mobile menu handling.
 * 
 * SCOPE:
 *   - Viewport detection (mobile / tablet / desktop)
 *   - Responsive body classes
 *   - Responsive grid helper
 *   - Mobile menu (with overlay, escape, resize cleanup)
 *   - Swipe gesture handling
 * 
 * OUT OF SCOPE:
 *   - Touch sizing → CSS `@media (pointer: coarse)`
 *   - Presentation → CSS
 *   - Domain-specific responsive logic → the domain module
 * 
 * DEPENDENCIES:
 *   - collections.js (debounce) — REQUIRED, not optional
 * 
 * ICON POLICY: No emojis. No icons.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY GUARD
    // =========================================================================

    if (typeof window.debounce !== 'function') {
        throw new Error('responsive.js: collections.js must load first (debounce missing).');
    }

    var debounce = window.debounce;

    // =========================================================================
    // 1. BREAKPOINTS
    // =========================================================================

    /**
     * Canonical breakpoints. Any responsive logic anywhere must read from here.
     * 
     * Category | Width
     * ---------|--------------
     * Mobile   | <= MOBILE
     * Tablet   | MOBILE < w <= TABLET
     * Desktop  | > TABLET
     */
    var RESPONSIVE_BREAKPOINTS = Object.freeze({
        MOBILE: 768,
        TABLET: 1024
    });

    // =========================================================================
    // 2. VIEWPORT DETECTION
    // =========================================================================

    /**
     * True if current width is at or below the mobile breakpoint.
     */
    function isMobileViewport(breakpoint) {
        breakpoint = breakpoint === undefined ? RESPONSIVE_BREAKPOINTS.MOBILE : breakpoint;
        return window.innerWidth <= breakpoint;
    }

    /**
     * True if current width is between mobile and tablet breakpoints.
     */
    function isTabletViewport(mobileBreakpoint, tabletBreakpoint) {
        mobileBreakpoint = mobileBreakpoint === undefined ? RESPONSIVE_BREAKPOINTS.MOBILE : mobileBreakpoint;
        tabletBreakpoint = tabletBreakpoint === undefined ? RESPONSIVE_BREAKPOINTS.TABLET : tabletBreakpoint;
        var w = window.innerWidth;
        return w > mobileBreakpoint && w <= tabletBreakpoint;
    }

    /**
     * True if current width is above the tablet breakpoint.
     */
    function isDesktopViewport(tabletBreakpoint) {
        tabletBreakpoint = tabletBreakpoint === undefined ? RESPONSIVE_BREAKPOINTS.TABLET : tabletBreakpoint;
        return window.innerWidth > tabletBreakpoint;
    }

    /**
     * Returns 'mobile', 'tablet', or 'desktop'.
     */
    function getViewportCategory() {
        if (isMobileViewport()) return 'mobile';
        if (isTabletViewport()) return 'tablet';
        return 'desktop';
    }

    // =========================================================================
    // 3. BODY CLASS MANAGEMENT
    // =========================================================================

    // Track handlers across calls so destroy() works
    var _bodyClassState = {
        handler: null,
        breakpoint: RESPONSIVE_BREAKPOINTS.MOBILE,
        tabletBreakpoint: RESPONSIVE_BREAKPOINTS.TABLET
    };

    /**
     * Applies responsive body classes based on current viewport.
     * @private
     */
    function _updateResponsiveBodyClass(breakpoint, tabletBreakpoint) {
        var w = window.innerWidth;
        var body = document.body;
        body.classList.remove('mobile-view', 'tablet-view', 'desktop-view');
        if (w <= breakpoint) body.classList.add('mobile-view');
        else if (w <= tabletBreakpoint) body.classList.add('tablet-view');
        else body.classList.add('desktop-view');
    }

    /**
     * Initializes responsive body classes.
     * Returns { refresh, destroy }.
     */
    function initResponsiveBody(breakpoint, tabletBreakpoint) {
        breakpoint = breakpoint === undefined ? RESPONSIVE_BREAKPOINTS.MOBILE : breakpoint;
        tabletBreakpoint = tabletBreakpoint === undefined ? RESPONSIVE_BREAKPOINTS.TABLET : tabletBreakpoint;

        // If already initialized, tear down first
        if (_bodyClassState.handler) {
            window.removeEventListener('resize', _bodyClassState.handler);
            _bodyClassState.handler = null;
        }

        _bodyClassState.breakpoint = breakpoint;
        _bodyClassState.tabletBreakpoint = tabletBreakpoint;

        _updateResponsiveBodyClass(breakpoint, tabletBreakpoint);

        var handler = debounce(function() {
            _updateResponsiveBodyClass(breakpoint, tabletBreakpoint);
        }, 150);
        _bodyClassState.handler = handler;
        window.addEventListener('resize', handler);

        return {
            refresh: function() {
                _updateResponsiveBodyClass(breakpoint, tabletBreakpoint);
            },
            destroy: function() {
                if (_bodyClassState.handler === handler) {
                    window.removeEventListener('resize', handler);
                    _bodyClassState.handler = null;
                }
            }
        };
    }

    // =========================================================================
    // 4. RESPONSIVE GRID
    // =========================================================================

    /**
     * Creates a responsive grid.
     * 
     * The `minItemWidth` option, if provided, acts as a CAP on the number of
     * columns. It never increases the count beyond what the breakpoint
     * specifies — that prevents the "tablet suddenly has 4 columns" problem.
     * 
     * @param {string} containerId
     * @param {number} desktopCols
     * @param {number} tabletCols
     * @param {number} mobileCols
     * @param {Object} [options] - { gap, minItemWidth, maxWidth }
     * @returns {Object|null} { refresh, destroy }
     */
    function initResponsiveGrid(containerId, desktopCols, tabletCols, mobileCols, options) {
        var container = document.getElementById(containerId);
        if (!container) return null;

        options = options || {};
        var gap = options.gap === undefined ? '16px' : options.gap;
        var minItemWidth = options.minItemWidth === undefined ? null : options.minItemWidth;
        var maxWidth = options.maxWidth === undefined ? null : options.maxWidth;

        desktopCols = desktopCols === undefined ? 3 : desktopCols;
        tabletCols = tabletCols === undefined ? 2 : tabletCols;
        mobileCols = mobileCols === undefined ? 1 : mobileCols;

        function update() {
            var w = window.innerWidth;
            var cols;
            if (w <= RESPONSIVE_BREAKPOINTS.MOBILE) cols = mobileCols;
            else if (w <= RESPONSIVE_BREAKPOINTS.TABLET) cols = tabletCols;
            else cols = desktopCols;

            if (minItemWidth && container.parentElement) {
                var parentWidth = container.parentElement.clientWidth;
                var computedMax = Math.floor(parentWidth / minItemWidth);
                if (computedMax > 0 && computedMax < cols) cols = computedMax;
            }

            cols = Math.max(1, cols);

            container.style.display = 'grid';
            container.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
            container.style.gap = gap;
            if (maxWidth) {
                container.style.maxWidth = maxWidth;
                container.style.margin = '0 auto';
            }
        }

        update();
        var handler = debounce(update, 150);
        window.addEventListener('resize', handler);

        return {
            refresh: update,
            destroy: function() {
                window.removeEventListener('resize', handler);
            }
        };
    }

    // =========================================================================
    // 5. MOBILE MENU
    // =========================================================================

    /**
     * Initializes a mobile menu with hamburger button.
     * 
     * @param {string} menuBtnId
     * @param {string} menuContainerId
     * @param {string} [storageKey]
     * @param {number} [breakpoint]
     * @returns {Object|null} { open, close, toggle, isOpen, destroy }
     */
    function initMobileMenu(menuBtnId, menuContainerId, storageKey, breakpoint) {
        breakpoint = breakpoint === undefined ? RESPONSIVE_BREAKPOINTS.MOBILE : breakpoint;

        var menuBtn = document.getElementById(menuBtnId);
        var menuContainer = document.getElementById(menuContainerId);
        if (!menuBtn || !menuContainer) return null;

        var isMenuOpen = false;
        var unlockScroll = null;

        // Overlay — get or create
        var overlay = document.querySelector('.mobile-menu-overlay[data-menu="' + menuContainerId + '"]');
        var overlayCreated = false;
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'mobile-menu-overlay';
            overlay.setAttribute('data-menu', menuContainerId);
            document.body.appendChild(overlay);
            overlayCreated = true;
        }

        // Restore state — but only if we're actually in mobile viewport
        if (storageKey) {
            var saved = null;
            try { saved = localStorage.getItem(storageKey); } catch (e) { /* unavailable */ }
            if (saved === 'open' && window.innerWidth <= breakpoint) {
                open();
            }
        }

        function lockScroll() {
            if (unlockScroll) return;
            if (typeof window.UI !== 'undefined' && typeof window.UI.lockBodyScroll === 'function') {
                window.UI.lockBodyScroll('mobile-menu:' + menuContainerId);
                unlockScroll = function() {
                    if (typeof window.UI.unlockBodyScroll === 'function') {
                        window.UI.unlockBodyScroll('mobile-menu:' + menuContainerId);
                    }
                };
            } else {
                var prev = document.body.style.overflow;
                document.body.style.overflow = 'hidden';
                unlockScroll = function() { document.body.style.overflow = prev; };
            }
        }

        function unlock() {
            if (unlockScroll) { unlockScroll(); unlockScroll = null; }
        }

        function open() {
            menuContainer.classList.add('mobile-visible');
            overlay.classList.add('visible');
            document.body.classList.add('mobile-menu-open');
            isMenuOpen = true;
            menuBtn.setAttribute('aria-expanded', 'true');
            lockScroll();
            if (storageKey) {
                try { localStorage.setItem(storageKey, 'open'); } catch (e) { /* unavailable */ }
            }
        }

        function close() {
            menuContainer.classList.remove('mobile-visible');
            overlay.classList.remove('visible');
            document.body.classList.remove('mobile-menu-open');
            isMenuOpen = false;
            menuBtn.setAttribute('aria-expanded', 'false');
            unlock();
            if (storageKey) {
                try { localStorage.setItem(storageKey, 'closed'); } catch (e) { /* unavailable */ }
            }
        }

        function toggle() {
            if (isMenuOpen) close();
            else open();
        }

        function handleBtnClick(e) {
            e.stopPropagation();
            if (window.innerWidth <= breakpoint) toggle();
        }

        function handleOverlayClick() { close(); }

        function handleKeydown(e) {
            if (e.key === 'Escape' && isMenuOpen) close();
        }

        function handleResize() {
            if (window.innerWidth > breakpoint && isMenuOpen) close();
        }

        menuBtn.setAttribute('aria-expanded', 'false');
        menuBtn.setAttribute('aria-controls', menuContainerId);

        menuBtn.addEventListener('click', handleBtnClick);
        overlay.addEventListener('click', handleOverlayClick);
        document.addEventListener('keydown', handleKeydown);
        window.addEventListener('resize', handleResize);

        return {
            open: open,
            close: close,
            toggle: toggle,
            isOpen: function() { return isMenuOpen; },
            destroy: function() {
                menuBtn.removeEventListener('click', handleBtnClick);
                overlay.removeEventListener('click', handleOverlayClick);
                document.removeEventListener('keydown', handleKeydown);
                window.removeEventListener('resize', handleResize);
                unlock();
                if (overlayCreated && overlay.parentNode) overlay.parentNode.removeChild(overlay);
            }
        };
    }

    // =========================================================================
    // 6. SWIPE GESTURES
    // =========================================================================

    /**
     * Makes an element respond to touch swipe gestures.
     * 
     * @param {string} elementId
     * @param {Object} [options] - { onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, minDistance }
     * @returns {Object|null} { destroy }
     */
    function initSwipeable(elementId, options) {
        var el = document.getElementById(elementId);
        if (!el) return null;

        options = options || {};
        var minDistance = options.minDistance === undefined ? 50 : options.minDistance;

        var startX = 0, startY = 0, endX = 0, endY = 0;

        function handleTouchStart(e) {
            if (!e.changedTouches || e.changedTouches.length === 0) return;
            startX = e.changedTouches[0].clientX;
            startY = e.changedTouches[0].clientY;
        }

        function handleTouchEnd(e) {
            if (!e.changedTouches || e.changedTouches.length === 0) return;
            endX = e.changedTouches[0].clientX;
            endY = e.changedTouches[0].clientY;
            var deltaX = endX - startX;
            var deltaY = endY - startY;
            if (Math.abs(deltaX) < minDistance && Math.abs(deltaY) < minDistance) return;
            if (Math.abs(deltaX) > Math.abs(deltaY)) {
                if (deltaX > 0 && typeof options.onSwipeRight === 'function') options.onSwipeRight();
                else if (deltaX < 0 && typeof options.onSwipeLeft === 'function') options.onSwipeLeft();
            } else {
                if (deltaY > 0 && typeof options.onSwipeDown === 'function') options.onSwipeDown();
                else if (deltaY < 0 && typeof options.onSwipeUp === 'function') options.onSwipeUp();
            }
        }

        el.addEventListener('touchstart', handleTouchStart, { passive: true });
        el.addEventListener('touchend', handleTouchEnd, { passive: true });

        return {
            destroy: function() {
                el.removeEventListener('touchstart', handleTouchStart);
                el.removeEventListener('touchend', handleTouchEnd);
            }
        };
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.RESPONSIVE_BREAKPOINTS = RESPONSIVE_BREAKPOINTS;

    window.isMobileViewport = isMobileViewport;
    window.isTabletViewport = isTabletViewport;
    window.isDesktopViewport = isDesktopViewport;
    window.getViewportCategory = getViewportCategory;

    // Deprecated alias — typo'd name. Kept temporarily for backward compat.
    window.isTableViewport = isTabletViewport;

    window.initResponsiveBody = initResponsiveBody;
    window.initResponsiveGrid = initResponsiveGrid;
    window.initMobileMenu = initMobileMenu;
    window.initSwipeable = initSwipeable;

})();