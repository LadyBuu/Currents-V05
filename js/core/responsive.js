/**
 * =============================================================================
 * STILL WATERS - RESPONSIVE UI (responsive.js)
 * =============================================================================
 *
 * LOCATION: js/core/responsive.js
 *
 * SINGLE SOURCE OF TRUTH for viewport detection, responsive body classes,
 * responsive layout state, mobile menu handling, and swipe gestures.
 *
 * SCOPE:
 *   - Viewport detection (mobile / tablet / desktop)
 *   - Responsive body state (as application state, not a substitute for
 *     CSS media queries)
 *   - Responsive layout state (columns count communicated via data
 *     attribute; presentation is owned by CSS)
 *   - Mobile menu lifecycle
 *   - Swipe gesture handling
 *
 * OUT OF SCOPE:
 *   - Touch sizing / pointer hints → CSS `@media (pointer: coarse)`
 *   - Presentation (grid-template-columns, gap, max-width, margins) → CSS
 *   - Domain-specific responsive logic → the domain module
 *   - Body-scroll-lock implementation → ui.js
 *
 * DEPENDENCIES (REQUIRED):
 *   - collections.js: debounce
 *   - ui.js:          UI.lockBodyScroll, UI.unlockBodyScroll
 *
 * INVALID-INPUT POLICY:
 *   - Missing optional arguments → documented default.
 *   - Invalid explicit arguments → throw. No silent clamping of
 *     breakpoints, column counts, or distances.
 *
 * RESPONSIVE BODY CLASSES:
 *   `mobile-view`, `tablet-view`, and `desktop-view` are application
 *   state derived from the viewport. They exist so application code and
 *   selectors can key off explicit state. They are NOT a substitute for
 *   CSS media queries, which remain the canonical mechanism for
 *   viewport-driven presentation.
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY GUARDS
    // =========================================================================

    if (typeof window.debounce !== 'function') {
        throw new Error('responsive.js: collections.js must load first (debounce missing).');
    }
    if (typeof window.UI === 'undefined'
        || typeof window.UI.lockBodyScroll !== 'function'
        || typeof window.UI.unlockBodyScroll !== 'function') {
        throw new Error(
            'responsive.js: ui.js must load first ' +
            '(UI.lockBodyScroll / UI.unlockBodyScroll missing).'
        );
    }

    var debounce = window.debounce;

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _isValidBreakpoint(value) {
        return typeof value === 'number' && Number.isFinite(value) && value >= 0;
    }

    function _requireValidBreakpoint(value, name) {
        if (!_isValidBreakpoint(value)) {
            throw new Error('responsive.js: ' + name + ' must be a finite non-negative number');
        }
    }

    function _requireValidBreakpointPair(mobile, tablet) {
        _requireValidBreakpoint(mobile, 'mobileBreakpoint');
        _requireValidBreakpoint(tablet, 'tabletBreakpoint');
        if (mobile >= tablet) {
            throw new Error(
                'responsive.js: mobileBreakpoint must be < tabletBreakpoint'
            );
        }
    }

    function _requireNonEmptyString(value, name) {
        if (typeof value !== 'string' || value.length === 0) {
            throw new Error('responsive.js: ' + name + ' must be a non-empty string');
        }
    }

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
     * Custom breakpoint arguments are NOT part of the canonical
     * configuration used by getViewportCategory(); they are per-call
     * overrides only.
     */
    function isMobileViewport(breakpoint) {
        breakpoint = _isMissing(breakpoint) ? RESPONSIVE_BREAKPOINTS.MOBILE : breakpoint;
        _requireValidBreakpoint(breakpoint, 'breakpoint');
        return window.innerWidth <= breakpoint;
    }

    /**
     * True if current width is between mobile and tablet breakpoints.
     */
    function isTabletViewport(mobileBreakpoint, tabletBreakpoint) {
        mobileBreakpoint = _isMissing(mobileBreakpoint)
            ? RESPONSIVE_BREAKPOINTS.MOBILE
            : mobileBreakpoint;
        tabletBreakpoint = _isMissing(tabletBreakpoint)
            ? RESPONSIVE_BREAKPOINTS.TABLET
            : tabletBreakpoint;
        _requireValidBreakpointPair(mobileBreakpoint, tabletBreakpoint);
        var w = window.innerWidth;
        return w > mobileBreakpoint && w <= tabletBreakpoint;
    }

    /**
     * True if current width is above the tablet breakpoint.
     */
    function isDesktopViewport(tabletBreakpoint) {
        tabletBreakpoint = _isMissing(tabletBreakpoint)
            ? RESPONSIVE_BREAKPOINTS.TABLET
            : tabletBreakpoint;
        _requireValidBreakpoint(tabletBreakpoint, 'tabletBreakpoint');
        return window.innerWidth > tabletBreakpoint;
    }

    /**
     * Returns 'mobile', 'tablet', or 'desktop'.
     * Always uses the canonical breakpoints; does not accept overrides.
     */
    function getViewportCategory() {
        if (isMobileViewport()) return 'mobile';
        if (isTabletViewport()) return 'tablet';
        return 'desktop';
    }

    // =========================================================================
    // 3. BODY CLASS MANAGEMENT
    // =========================================================================

    var _bodyClassState = {
        handler: null,
        breakpoint: RESPONSIVE_BREAKPOINTS.MOBILE,
        tabletBreakpoint: RESPONSIVE_BREAKPOINTS.TABLET
    };

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
     *
     * DESTROY SEMANTICS: destroy() removes the resize listener and stops
     * managing the body classes. It does NOT remove the classes that were
     * last applied. If callers need the body restored to a classless
     * state, they should do that themselves after destroy(); destroying
     * the controller means "stop tracking", not "restore previous state."
     *
     * @returns {{ refresh: Function, destroy: Function }}
     */
    function initResponsiveBody(breakpoint, tabletBreakpoint) {
        breakpoint = _isMissing(breakpoint) ? RESPONSIVE_BREAKPOINTS.MOBILE : breakpoint;
        tabletBreakpoint = _isMissing(tabletBreakpoint)
            ? RESPONSIVE_BREAKPOINTS.TABLET
            : tabletBreakpoint;
        _requireValidBreakpointPair(breakpoint, tabletBreakpoint);

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
    // 4. RESPONSIVE GRID (STATE ONLY; PRESENTATION OWNED BY CSS)
    // =========================================================================

    /**
     * Initializes a responsive grid.
     *
     * This function computes the CURRENT COLUMN COUNT and writes it to a
     * `data-responsive-columns` attribute on the container. Presentation
     * (grid-template-columns, gap, max-width, margins) is owned by CSS,
     * which is expected to define rules such as:
     *
     *   [data-responsive-columns="1"] { grid-template-columns: repeat(1, minmax(0, 1fr)); }
     *   [data-responsive-columns="2"] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
     *   [data-responsive-columns="3"] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
     *
     * The `minItemWidth` option, if provided, caps the column count so
     * that each column is at least minItemWidth pixels wide (based on the
     * container's parent width). It never increases the count beyond what
     * the breakpoint specifies.
     *
     * @param {string} containerId
     * @param {number} desktopCols
     * @param {number} tabletCols
     * @param {number} mobileCols
     * @param {Object} [options] - { minItemWidth }
     * @returns {{ refresh: Function, destroy: Function }|null}
     */
    function initResponsiveGrid(containerId, desktopCols, tabletCols, mobileCols, options) {
        _requireNonEmptyString(containerId, 'containerId');
        var container = document.getElementById(containerId);
        if (!container) return null;

        if (!Number.isInteger(desktopCols) || desktopCols < 1) {
            throw new Error('initResponsiveGrid: desktopCols must be a positive integer');
        }
        if (!Number.isInteger(tabletCols) || tabletCols < 1) {
            throw new Error('initResponsiveGrid: tabletCols must be a positive integer');
        }
        if (!Number.isInteger(mobileCols) || mobileCols < 1) {
            throw new Error('initResponsiveGrid: mobileCols must be a positive integer');
        }

        options = _isMissing(options) ? {} : options;
        if (typeof options !== 'object' || Array.isArray(options)) {
            throw new Error('initResponsiveGrid: options must be an object');
        }

        var minItemWidth = null;
        if (!_isMissing(options.minItemWidth)) {
            if (typeof options.minItemWidth !== 'number'
                || !Number.isFinite(options.minItemWidth)
                || options.minItemWidth <= 0) {
                throw new Error('initResponsiveGrid: minItemWidth must be a positive finite number');
            }
            minItemWidth = options.minItemWidth;
        }

        function update() {
            var w = window.innerWidth;
            var cols;
            if (w <= RESPONSIVE_BREAKPOINTS.MOBILE) cols = mobileCols;
            else if (w <= RESPONSIVE_BREAKPOINTS.TABLET) cols = tabletCols;
            else cols = desktopCols;

            if (minItemWidth !== null && container.parentElement) {
                var parentWidth = container.parentElement.clientWidth;
                var computedMax = Math.floor(parentWidth / minItemWidth);
                if (computedMax > 0 && computedMax < cols) cols = computedMax;
            }

            cols = Math.max(1, cols);
            container.setAttribute('data-responsive-columns', String(cols));
        }

        update();
        var handler = debounce(update, 150);
        window.addEventListener('resize', handler);

        return {
            refresh: update,
            destroy: function() {
                window.removeEventListener('resize', handler);
                container.removeAttribute('data-responsive-columns');
            }
        };
    }

    // =========================================================================
    // 5. MOBILE MENU
    // =========================================================================

    // Tracks which menu containers have an active controller, so duplicate
    // initialization does not install two controllers on the same DOM.
    var _activeMenuControllers = new Set();

    /**
     * Initializes a mobile menu with hamburger button.
     *
     * OPEN OUTSIDE MOBILE BREAKPOINT: controller.open() will open the menu
     * at any viewport width. This is intentional: programmatic open is
     * useful for testing and for UI flows that want to preview the drawer.
     * Automatic (click/resize) behaviour respects the breakpoint.
     *
     * DUPLICATE INITIALIZATION: initializing a menu twice on the same
     * containerId returns null instead of installing a second controller.
     *
     * @param {string} menuBtnId
     * @param {string} menuContainerId
     * @param {string} [storageKey]
     * @param {number} [breakpoint]
     * @returns {{ open, close, toggle, isOpen, destroy }|null}
     */
    function initMobileMenu(menuBtnId, menuContainerId, storageKey, breakpoint) {
        _requireNonEmptyString(menuBtnId, 'menuBtnId');
        _requireNonEmptyString(menuContainerId, 'menuContainerId');
        if (!_isMissing(storageKey)) _requireNonEmptyString(storageKey, 'storageKey');

        breakpoint = _isMissing(breakpoint) ? RESPONSIVE_BREAKPOINTS.MOBILE : breakpoint;
        _requireValidBreakpoint(breakpoint, 'breakpoint');

        if (_activeMenuControllers.has(menuContainerId)) {
            console.warn(
                'responsive.js: initMobileMenu already active for container "' +
                menuContainerId + '"; returning null.'
            );
            return null;
        }

        var menuBtn = document.getElementById(menuBtnId);
        var menuContainer = document.getElementById(menuContainerId);
        if (!menuBtn || !menuContainer) return null;

        var isMenuOpen = false;

        var overlay = document.querySelector(
            '.mobile-menu-overlay[data-menu="' + menuContainerId + '"]'
        );
        var overlayCreated = false;
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'mobile-menu-overlay';
            overlay.setAttribute('data-menu', menuContainerId);
            overlay.setAttribute('aria-hidden', 'true');
            document.body.appendChild(overlay);
            overlayCreated = true;
        }

        function _readStorage(key) {
            try { return localStorage.getItem(key); } catch (e) { return null; }
        }
        function _writeStorage(key, value) {
            try { localStorage.setItem(key, value); } catch (e) { /* unavailable */ }
        }

        function open() {
            menuContainer.classList.add('mobile-visible');
            overlay.classList.add('visible');
            overlay.setAttribute('aria-hidden', 'false');
            document.body.classList.add('mobile-menu-open');
            isMenuOpen = true;
            menuBtn.setAttribute('aria-expanded', 'true');
            window.UI.lockBodyScroll('mobile-menu:' + menuContainerId);
            if (!_isMissing(storageKey)) _writeStorage(storageKey, 'open');
        }

        function close() {
            menuContainer.classList.remove('mobile-visible');
            overlay.classList.remove('visible');
            overlay.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('mobile-menu-open');
            isMenuOpen = false;
            menuBtn.setAttribute('aria-expanded', 'false');
            window.UI.unlockBodyScroll('mobile-menu:' + menuContainerId);
            if (!_isMissing(storageKey)) _writeStorage(storageKey, 'closed');
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

        // Restore state only if we're in mobile viewport; otherwise leave
        // the menu closed and do not touch the container's classes.
        if (!_isMissing(storageKey)
            && _readStorage(storageKey) === 'open'
            && window.innerWidth <= breakpoint) {
            open();
        }

        _activeMenuControllers.add(menuContainerId);

        return {
            open: open,
            close: close,
            toggle: toggle,
            isOpen: function() { return isMenuOpen; },
            destroy: function() {
                // Close first so we cannot leave the DOM in an open state.
                if (isMenuOpen) close();
                menuBtn.removeEventListener('click', handleBtnClick);
                overlay.removeEventListener('click', handleOverlayClick);
                document.removeEventListener('keydown', handleKeydown);
                window.removeEventListener('resize', handleResize);
                menuBtn.removeAttribute('aria-controls');
                menuBtn.setAttribute('aria-expanded', 'false');
                if (overlayCreated && overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
                _activeMenuControllers.delete(menuContainerId);
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
     * @param {Object} [options]
     * @param {Function} [options.onSwipeLeft]
     * @param {Function} [options.onSwipeRight]
     * @param {Function} [options.onSwipeUp]
     * @param {Function} [options.onSwipeDown]
     * @param {number} [options.minDistance] - default 50
     * @returns {{ destroy: Function }|null}
     */
    function initSwipeable(elementId, options) {
        _requireNonEmptyString(elementId, 'elementId');

        var el = document.getElementById(elementId);
        if (!el) return null;

        options = _isMissing(options) ? {} : options;
        if (typeof options !== 'object' || Array.isArray(options)) {
            throw new Error('initSwipeable: options must be an object');
        }

        var minDistance = _isMissing(options.minDistance) ? 50 : options.minDistance;
        if (typeof minDistance !== 'number'
            || !Number.isFinite(minDistance)
            || minDistance < 0) {
            throw new Error('initSwipeable: minDistance must be a non-negative finite number');
        }

        var startX = 0;
        var startY = 0;
        var hasTouchStart = false;

        function handleTouchStart(e) {
            if (!e.changedTouches || e.changedTouches.length === 0) return;
            startX = e.changedTouches[0].clientX;
            startY = e.changedTouches[0].clientY;
            hasTouchStart = true;
        }

        function handleTouchEnd(e) {
            if (!hasTouchStart) return;
            hasTouchStart = false;
            if (!e.changedTouches || e.changedTouches.length === 0) return;

            var endX = e.changedTouches[0].clientX;
            var endY = e.changedTouches[0].clientY;
            var deltaX = endX - startX;
            var deltaY = endY - startY;

            // Dominant axis determines the gesture. The threshold applies
            // to the detected axis, not "either axis."
            if (Math.abs(deltaX) > Math.abs(deltaY)) {
                if (Math.abs(deltaX) < minDistance) return;
                if (deltaX > 0 && typeof options.onSwipeRight === 'function') options.onSwipeRight();
                else if (deltaX < 0 && typeof options.onSwipeLeft === 'function') options.onSwipeLeft();
            } else {
                if (Math.abs(deltaY) < minDistance) return;
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

    window.initResponsiveBody = initResponsiveBody;
    window.initResponsiveGrid = initResponsiveGrid;
    window.initMobileMenu = initMobileMenu;
    window.initSwipeable = initSwipeable;

    // =========================================================================
    // 8. DEPRECATED ALIASES
    // =========================================================================

    /**
     * @deprecated Use isTabletViewport instead. The previous name was a
     * typo. Remove this alias once existing callers have migrated.
     */
    window.isTableViewport = isTabletViewport;

})();