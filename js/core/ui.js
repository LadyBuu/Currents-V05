/**
 * =============================================================================
 * STILL WATERS - UI SYSTEM (ui.js)
 * =============================================================================
 *
 * LOCATION: js/core/ui.js
 *
 * SINGLE SOURCE OF TRUTH for:
 *   - Toast notifications
 *   - Loading overlays (with nested counter)
 *   - Inline loading indicators
 *   - Button loading states
 *   - Progress bars
 *   - Skeleton loaders
 *   - Body scroll locking (UI.lockBodyScroll / UI.unlockBodyScroll)
 *
 * OUT OF SCOPE:
 *   - Presentation CSS → see ui.css (or the application stylesheet)
 *   - Tabs / settlement controller → js/modules/settlement/settlement-tabs.js
 *   - Location dropdowns → js/selectors/location-dropdown.js
 *   - Modal system → js/core/modals-core.js
 *   - Column/card rendering → domain modules
 *
 * SEMANTIC RULES:
 *   - Missing optional arguments → documented default.
 *     Invalid explicit arguments → throw or return null (never silently
 *     converted to the default).
 *   - Presentation is owned by CSS. This module toggles classes and sets
 *     dynamic values (width percentages, counts) but does not embed
 *     style strings.
 *   - Temporary UI overrides (button loading, inline loading) capture
 *     and restore the original DOM and disabled state.
 *   - A progress bar has one instance per container. showProgressBar on
 *     an already-active container updates rather than appends.
 *
 * DEPENDENCIES:
 *   - Application dependencies:
 *       formatting.js (escapeHtml)
 *       icons.js (Icons)
 *   - Browser globals used: window, document, setTimeout.
 *   - Stylesheet: ui.css (or the application's canonical stylesheet) must
 *     define the classes this module emits: .toast, .loading-overlay,
 *     .inline-loader, .progress-container, .skeleton-*, etc.
 *
 * ICON POLICY: Uses icons.js for icons. No emojis.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY GUARDS
    // =========================================================================

    function _requireFormatting() {
        if (typeof window.escapeHtml !== 'function') {
            throw new Error('ui.js: formatting.js must load first (escapeHtml missing).');
        }
    }

    function _requireIcons() {
        if (typeof window.Icons === 'undefined') {
            throw new Error('ui.js: icons.js must load first.');
        }
    }

    _requireFormatting();
    _requireIcons();

    function _getIcon(name) {
        return window.Icons[name] || window.Icons.CIRCLE || '';
    }

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    // =========================================================================
    // 1. TOAST NOTIFICATIONS
    // =========================================================================

    var TOAST_TYPES = Object.freeze({
        SUCCESS: 'success',
        ERROR: 'error',
        WARNING: 'warning',
        INFO: 'info'
    });

    var _VALID_TOAST_TYPES = [
        TOAST_TYPES.SUCCESS,
        TOAST_TYPES.ERROR,
        TOAST_TYPES.WARNING,
        TOAST_TYPES.INFO
    ];

    var _TOAST_ICON_FOR_TYPE = {
        success: 'CHECK_SIMPLE',
        error: 'X_HEAVY',
        warning: 'WARNING',
        info: 'CIRCLE_DOT'
    };

    function getToastContainer() {
        var container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            container.setAttribute('role', 'region');
            container.setAttribute('aria-live', 'polite');
            container.setAttribute('aria-label', 'Notifications');
            document.body.appendChild(container);
        }
        return container;
    }

    /**
     * Creates a toast element. Only sets classes and dynamic content;
     * presentation lives in the stylesheet.
     * @private
     */
    function _createToastElement(message, type) {
        var icon = _getIcon(_TOAST_ICON_FOR_TYPE[type] || _TOAST_ICON_FOR_TYPE.info);

        // message is a plain string; escape it. Icons from icons.js are
        // the only trusted HTML the toast contains.
        var safeContent = window.escapeHtml(message);

        var toast = document.createElement('div');
        toast.className = 'toast toast-' + type;
        // error toasts warrant assertive announcement; others are polite.
        toast.setAttribute('role', type === TOAST_TYPES.ERROR ? 'alert' : 'status');
        toast.innerHTML =
            '<span class="toast-icon" aria-hidden="true">' + icon + '</span>' +
            '<span class="toast-message">' + safeContent + '</span>' +
            '<button type="button" class="toast-close" aria-label="Dismiss">' +
                _getIcon('X') +
            '</button>';
        return toast;
    }

    function _dismissToast(toast, animated) {
        if (!toast || !toast.parentNode) return;
        if (animated) {
            toast.classList.add('toast-leaving');
            setTimeout(function() {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300);
        } else {
            toast.parentNode.removeChild(toast);
        }
    }

    /**
     * Shows a toast notification.
     *
     * @param {string} message
     * @param {string} [type] - 'success' | 'error' | 'warning' | 'info'
     *   Missing → 'info'. Explicit invalid → throws.
     * @param {number} [duration] - ms; missing → 3000; 0 → persistent;
     *   negative or non-numeric → throws.
     * @returns {HTMLElement}
     */
    function showToast(message, type, duration) {
        if (typeof message !== 'string') {
            throw new Error('showToast: message must be a string');
        }

        if (_isMissing(type)) {
            type = TOAST_TYPES.INFO;
        } else if (_VALID_TOAST_TYPES.indexOf(type) === -1) {
            throw new Error(
                'showToast: unknown type "' + type + '". ' +
                'Expected one of: ' + _VALID_TOAST_TYPES.join(', ')
            );
        }

        if (_isMissing(duration)) {
            duration = 3000;
        } else if (typeof duration !== 'number'
            || !Number.isFinite(duration)
            || duration < 0) {
            throw new Error(
                'showToast: duration must be a non-negative finite number'
            );
        }

        var container = getToastContainer();
        var toast = _createToastElement(message, type);
        toast.classList.add('toast-entering');
        container.appendChild(toast);

        var closeBtn = toast.querySelector('.toast-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                _dismissToast(toast, true);
            });
        }

        if (duration > 0) {
            var timer = setTimeout(function() {
                _dismissToast(toast, true);
            }, duration);
            toast._dismissTimer = timer;
        }

        return toast;
    }

    function showSuccessToast(message, duration) {
        return showToast(message, TOAST_TYPES.SUCCESS, duration);
    }

    function showErrorToast(message, duration) {
        return showToast(message, TOAST_TYPES.ERROR, duration);
    }

    function showWarningToast(message, duration) {
        return showToast(message, TOAST_TYPES.WARNING, duration);
    }

    function showInfoToast(message, duration) {
        return showToast(message, TOAST_TYPES.INFO, duration);
    }

    /**
     * Shows a persistent toast (no auto-dismiss).
     */
    function showPersistentToast(message, type) {
        return showToast(message, type, 0);
    }

    /**
     * Shows a sequence of toasts.
     * @param {Array<{message: string, type?: string}>} messages
     * @param {number} [delayBetween] - ms; default 500
     * @throws {Error} for malformed input
     */
    function showToastSequence(messages, delayBetween) {
        if (!Array.isArray(messages)) {
            throw new Error('showToastSequence: messages must be an array');
        }
        if (_isMissing(delayBetween)) {
            delayBetween = 500;
        } else if (typeof delayBetween !== 'number'
            || !Number.isFinite(delayBetween)
            || delayBetween < 0) {
            throw new Error('showToastSequence: delayBetween must be a non-negative finite number');
        }
        for (var i = 0; i < messages.length; i++) {
            var m = messages[i];
            if (!m || typeof m.message !== 'string') {
                throw new Error(
                    'showToastSequence: messages[' + i + '].message must be a string'
                );
            }
        }
        for (var j = 0; j < messages.length; j++) {
            (function(idx) {
                setTimeout(function() {
                    var m = messages[idx];
                    showToast(m.message, m.type);
                }, idx * delayBetween);
            })(j);
        }
    }

    function clearAllToasts() {
        var container = document.getElementById('toast-container');
        if (container) container.innerHTML = '';
    }

    // =========================================================================
    // 2. LOADING OVERLAY (with nested counter)
    // =========================================================================

    var _loadingOverlay = null;
    var _loadingOverlayCount = 0;

    /**
     * Shows the loading overlay. Nested calls increment a counter; the
     * overlay hides only when the counter returns to zero.
     *
     * MESSAGE OWNERSHIP: the displayed message belongs to the most recent
     * active caller. There is no per-caller message stack. If you need
     * distinct messages per operation, use named loading tokens (future
     * extension) rather than calling showLoading() repeatedly.
     *
     * @param {string} [message] - missing → 'Loading...'; empty string is
     *   preserved as an explicit empty message.
     * @returns {HTMLElement}
     */
    function showLoading(message) {
        if (_isMissing(message)) message = 'Loading...';
        if (typeof message !== 'string') {
            throw new Error('showLoading: message must be a string');
        }
        _loadingOverlayCount++;

        if (_loadingOverlay) {
            var msgEl = _loadingOverlay.querySelector('.loading-message');
            if (msgEl) msgEl.textContent = message;
            return _loadingOverlay;
        }

        _loadingOverlay = document.createElement('div');
        _loadingOverlay.className = 'loading-overlay';
        _loadingOverlay.setAttribute('role', 'status');
        _loadingOverlay.setAttribute('aria-live', 'polite');
        _loadingOverlay.innerHTML =
            '<div class="loading-spinner" aria-hidden="true"></div>' +
            '<div class="loading-message"></div>';
        _loadingOverlay.querySelector('.loading-message').textContent = message;

        document.body.appendChild(_loadingOverlay);
        return _loadingOverlay;
    }

    /**
     * Hides the loading overlay. Counter-decremented.
     * Guards against decrementing below zero.
     */
    function hideLoading() {
        if (_loadingOverlayCount <= 0) {
            _loadingOverlayCount = 0;
            return;
        }
        _loadingOverlayCount--;
        if (_loadingOverlayCount === 0 && _loadingOverlay) {
            if (_loadingOverlay.parentNode) _loadingOverlay.parentNode.removeChild(_loadingOverlay);
            _loadingOverlay = null;
        }
    }

    /**
     * Force-hides the loading overlay, regardless of counter.
     * Emergency teardown for error recovery.
     */
    function forceHideLoading() {
        if (_loadingOverlay && _loadingOverlay.parentNode) {
            _loadingOverlay.parentNode.removeChild(_loadingOverlay);
        }
        _loadingOverlay = null;
        _loadingOverlayCount = 0;
    }

    // =========================================================================
    // 3. INLINE LOADING
    // =========================================================================
    //
    // Preserves the container's existing child nodes in a DocumentFragment
    // while loading, and restores them on hide.
    //
    // CONTRACT: hideInlineLoading() replaces the container's current
    // contents with the fragment captured at show time. Any content added
    // to the container by other code while the loader is active will be
    // removed. This is a "temporarily replace the entire contents"
    // contract, not "insert a loader alongside existing content."

    var _inlineLoaderState = new WeakMap();

    function showInlineLoading(containerId, message) {
        if (_isMissing(message)) message = 'Loading...';
        if (typeof message !== 'string') {
            throw new Error('showInlineLoading: message must be a string');
        }
        var container = document.getElementById(containerId);
        if (!container) return null;

        var existing = container.querySelector('.inline-loader');
        if (existing) {
            var msgEl = existing.querySelector('.inline-loader-message');
            if (msgEl) msgEl.textContent = message;
            return existing;
        }

        var fragment = document.createDocumentFragment();
        while (container.firstChild) {
            fragment.appendChild(container.firstChild);
        }
        _inlineLoaderState.set(container, fragment);

        var loader = document.createElement('div');
        loader.className = 'inline-loader';
        loader.setAttribute('role', 'status');
        loader.setAttribute('aria-live', 'polite');
        loader.innerHTML =
            '<div class="inline-loader-spinner" aria-hidden="true"></div>' +
            '<span class="inline-loader-message"></span>';
        loader.querySelector('.inline-loader-message').textContent = message;
        container.appendChild(loader);
        return loader;
    }

    function hideInlineLoading(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;

        var loader = container.querySelector('.inline-loader');
        if (loader && loader.parentNode) loader.parentNode.removeChild(loader);

        var fragment = _inlineLoaderState.get(container);
        if (fragment) {
            container.appendChild(fragment);
            _inlineLoaderState.delete(container);
        }
    }

    // =========================================================================
    // 4. BUTTON LOADING
    // =========================================================================
    //
    // Preserves the button's child nodes (not innerHTML) and its disabled
    // state. On hide, both are restored.

    var _buttonLoaderState = new WeakMap();

    function showButtonLoading(buttonId, text) {
        var button = document.getElementById(buttonId);
        if (!button) return null;

        if (!_buttonLoaderState.has(button)) {
            var fragment = document.createDocumentFragment();
            while (button.firstChild) {
                fragment.appendChild(button.firstChild);
            }
            _buttonLoaderState.set(button, {
                content: fragment,
                disabled: button.disabled
            });
        }

        var loadingText = _isMissing(text)
            ? (button.textContent || 'Loading...')
            : text;
        if (typeof loadingText !== 'string') {
            throw new Error('showButtonLoading: text must be a string');
        }

        button.disabled = true;
        button.classList.add('button-loading');
        button.innerHTML =
            '<span class="button-spinner" aria-hidden="true"></span>' +
            '<span class="button-loading-text"></span>';
        button.querySelector('.button-loading-text').textContent = loadingText;
        return button;
    }

    function hideButtonLoading(buttonId) {
        var button = document.getElementById(buttonId);
        if (!button) return;
        button.classList.remove('button-loading');

        var state = _buttonLoaderState.get(button);
        if (state) {
            while (button.firstChild) button.removeChild(button.firstChild);
            button.appendChild(state.content);
            button.disabled = state.disabled;
            _buttonLoaderState.delete(button);
        } else {
            button.disabled = false;
        }
    }

    // =========================================================================
    // 5. PROGRESS BAR
    // =========================================================================
    //
    // One progress instance per container. Calling showProgressBar again on
    // the same container updates the existing instance rather than appending
    // a second one.

    var _progressState = new WeakMap();

    /**
     * Validates numeric progress inputs. Missing current/total are invalid;
     * negative numbers are clamped for presentation.
     * @private
     */
    function _calculateProgressPercentage(current, total) {
        if (typeof current !== 'number' || !Number.isFinite(current)) return null;
        if (typeof total !== 'number' || !Number.isFinite(total)) return null;
        if (total <= 0) return 0;
        var pct = (current / total) * 100;
        if (pct < 0) return 0;
        if (pct > 100) return 100;
        return pct;
    }

    function showProgressBar(containerId, current, total, label) {
        if (_isMissing(label)) label = '';
        if (typeof label !== 'string') {
            throw new Error('showProgressBar: label must be a string');
        }
        var container = document.getElementById(containerId);
        if (!container) return null;

        // If an instance already exists in this container, update it.
        var existing = container.querySelector('.progress-container');
        if (existing) {
            updateProgressBar(containerId, current, total);
            if (label) {
                var labelEl = existing.querySelector('.progress-label');
                if (labelEl) labelEl.textContent = label;
            }
            return existing;
        }

        // Preserve original children the first time.
        if (!_progressState.has(container)) {
            var fragment = document.createDocumentFragment();
            while (container.firstChild) {
                fragment.appendChild(container.firstChild);
            }
            _progressState.set(container, fragment);
        }

        var pct = _calculateProgressPercentage(current, total);
        var percentageText = (pct === null) ? '' : Math.round(pct) + '%';
        var countText = (typeof current === 'number' && typeof total === 'number')
            ? current + ' / ' + total
            : '';

        var wrapper = document.createElement('div');
        wrapper.className = 'progress-container';
        wrapper.setAttribute('role', 'progressbar');
        wrapper.setAttribute('aria-valuemin', '0');
        wrapper.setAttribute('aria-valuemax', '100');
        if (pct !== null) wrapper.setAttribute('aria-valuenow', String(Math.round(pct)));
        wrapper.innerHTML =
            '<div class="progress-label"></div>' +
            '<div class="progress-track">' +
                '<div class="progress-fill"></div>' +
            '</div>' +
            '<div class="progress-count"></div>';
        wrapper.querySelector('.progress-label').textContent = label;
        wrapper.querySelector('.progress-count').textContent = countText;
        var fill = wrapper.querySelector('.progress-fill');
        fill.style.width = (pct === null ? '0' : pct) + '%';
        fill.textContent = percentageText;
        container.appendChild(wrapper);
        return wrapper;
    }

    function hideProgressBar(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;
        var wrapper = container.querySelector('.progress-container');
        if (wrapper && wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);

        var fragment = _progressState.get(container);
        if (fragment) {
            container.appendChild(fragment);
            _progressState.delete(container);
        }
    }

    /**
     * Updates a progress bar in place.
     *
     * total:
     *   null → indeterminate mode; current is treated as a 0-100 percent
     *   number → current/total mode
     *
     * @param {string} containerId
     * @param {number} current
     * @param {number|null} [total]
     */
    function updateProgressBar(containerId, current, total) {
        var container = document.getElementById(containerId);
        if (!container) return;
        var fill = container.querySelector('.progress-fill');
        var count = container.querySelector('.progress-count');
        var wrapper = container.querySelector('.progress-container');
        if (!fill) return;

        var pct;
        if (total === null) {
            // Indeterminate / percentage mode. Validate current as 0-100.
            if (typeof current !== 'number' || !Number.isFinite(current)) {
                throw new Error('updateProgressBar: current must be a finite number');
            }
            pct = current < 0 ? 0 : (current > 100 ? 100 : current);
            if (count) count.textContent = Math.round(pct) + '%';
        } else {
            pct = _calculateProgressPercentage(current, total);
            if (pct === null) {
                throw new Error(
                    'updateProgressBar: current and total must be finite numbers ' +
                    '(or total === null for percentage mode)'
                );
            }
            if (count) count.textContent = current + ' / ' + total;
        }

        fill.style.width = pct + '%';
        fill.textContent = Math.round(pct) + '%';
        if (wrapper) wrapper.setAttribute('aria-valuenow', String(Math.round(pct)));
    }

    // =========================================================================
    // 6. SKELETON LOADERS
    // =========================================================================

    var _SKELETON_TYPES = ['card', 'list', 'table', 'text'];
    var _SKELETON_MAX_COUNT = 100;

    var _skeletonState = new WeakMap();

    function _renderSkeletonHtml(type, count) {
        if (type === 'card') {
            var cards = '<div class="skeleton-grid">';
            for (var i = 0; i < count; i++) {
                cards += '<div class="skeleton-card">' +
                    '<div class="skeleton-line skeleton-line-title"></div>' +
                    '<div class="skeleton-line skeleton-line-body"></div>' +
                    '<div class="skeleton-line skeleton-line-short"></div>' +
                '</div>';
            }
            return cards + '</div>';
        }
        if (type === 'list') {
            var list = '<div class="skeleton-list">';
            for (var j = 0; j < count; j++) {
                list += '<div class="skeleton-list-item">' +
                    '<div class="skeleton-avatar"></div>' +
                    '<div class="skeleton-list-body">' +
                        '<div class="skeleton-line skeleton-line-body"></div>' +
                        '<div class="skeleton-line skeleton-line-short"></div>' +
                    '</div>' +
                '</div>';
            }
            return list + '</div>';
        }
        if (type === 'table') {
            var rows = '';
            for (var k = 0; k < count; k++) {
                rows += '<tr class="skeleton-row">' +
                    '<td><div class="skeleton-line"></div></td>' +
                    '<td><div class="skeleton-line"></div></td>' +
                    '<td><div class="skeleton-line"></div></td>' +
                '</tr>';
            }
            return '<table class="skeleton-table"><thead><tr>' +
                '<th></th><th></th><th></th>' +
                '</tr></thead><tbody>' + rows + '</tbody></table>';
        }
        // text
        var lines = '<div class="skeleton-text">';
        for (var p = 0; p < count; p++) {
            lines += '<div class="skeleton-line skeleton-line-text"></div>';
        }
        return lines + '</div>';
    }

    function showSkeletonLoader(containerId, type, count) {
        if (_isMissing(type)) type = 'card';
        if (_SKELETON_TYPES.indexOf(type) === -1) {
            throw new Error(
                'showSkeletonLoader: unknown type "' + type + '". ' +
                'Expected one of: ' + _SKELETON_TYPES.join(', ')
            );
        }

        if (_isMissing(count)) {
            count = 3;
        } else if (!Number.isInteger(count) || count < 0 || count > _SKELETON_MAX_COUNT) {
            throw new Error(
                'showSkeletonLoader: count must be an integer in [0, ' +
                _SKELETON_MAX_COUNT + ']'
            );
        }

        var container = document.getElementById(containerId);
        if (!container) return;

        if (!_skeletonState.has(container)) {
            var fragment = document.createDocumentFragment();
            while (container.firstChild) {
                fragment.appendChild(container.firstChild);
            }
            _skeletonState.set(container, fragment);
        }

        var wrapper = document.createElement('div');
        wrapper.className = 'skeleton-wrapper';
        wrapper.setAttribute('aria-busy', 'true');
        wrapper.innerHTML = _renderSkeletonHtml(type, count);
        container.appendChild(wrapper);
    }

    function hideSkeletonLoader(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;

        var skels = container.querySelectorAll('.skeleton-wrapper');
        for (var i = 0; i < skels.length; i++) {
            if (skels[i].parentNode) skels[i].parentNode.removeChild(skels[i]);
        }

        var fragment = _skeletonState.get(container);
        if (fragment) {
            container.appendChild(fragment);
            _skeletonState.delete(container);
        }
    }

    // =========================================================================
    // 7. BODY SCROLL LOCK
    // =========================================================================
    //
    // SEMANTICS: named ownership set, not a counter.
    //   - Each key represents one lock owner.
    //   - Re-acquiring an existing key does not increase the lock count.
    //   - Releasing a key that was not acquired is a no-op.
    //   - The body remains locked until every key has been released.

    var _scrollLocks = new Set();

    /**
     * Acquires a named scroll lock.
     * @param {string} key - non-empty unique identifier for the lock holder
     */
    function lockBodyScroll(key) {
        if (typeof key !== 'string' || key.length === 0) {
            throw new Error('lockBodyScroll: key must be a non-empty string');
        }
        _scrollLocks.add(key);
        document.body.classList.add('body-scroll-locked');
    }

    /**
     * Releases a named scroll lock.
     */
    function unlockBodyScroll(key) {
        if (typeof key !== 'string' || key.length === 0) {
            throw new Error('unlockBodyScroll: key must be a non-empty string');
        }
        _scrollLocks.delete(key);
        if (_scrollLocks.size === 0) {
            document.body.classList.remove('body-scroll-locked');
        }
    }

    /**
     * Releases all scroll locks. Escape hatch for teardown/reset.
     */
    function clearAllScrollLocks() {
        _scrollLocks.clear();
        document.body.classList.remove('body-scroll-locked');
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    // Scroll lock
    window.UI = window.UI || {};
    window.UI.lockBodyScroll = lockBodyScroll;
    window.UI.unlockBodyScroll = unlockBodyScroll;
    window.UI.clearAllScrollLocks = clearAllScrollLocks;

    // Toasts
    window.showToast = showToast;
    window.showSuccessToast = showSuccessToast;
    window.showErrorToast = showErrorToast;
    window.showWarningToast = showWarningToast;
    window.showInfoToast = showInfoToast;
    window.showPersistentToast = showPersistentToast;
    window.showToastSequence = showToastSequence;
    window.clearAllToasts = clearAllToasts;

    // Loading overlay
    window.showLoading = showLoading;
    window.hideLoading = hideLoading;
    window.forceHideLoading = forceHideLoading;

    // Inline loading
    window.showInlineLoading = showInlineLoading;
    window.hideInlineLoading = hideInlineLoading;

    // Button loading
    window.showButtonLoading = showButtonLoading;
    window.hideButtonLoading = hideButtonLoading;

    // Progress bar
    window.showProgressBar = showProgressBar;
    window.hideProgressBar = hideProgressBar;
    window.updateProgressBar = updateProgressBar;

    // Skeleton loaders
    window.showSkeletonLoader = showSkeletonLoader;
    window.hideSkeletonLoader = hideSkeletonLoader;

    // =========================================================================
    // 9. DEPRECATED ALIASES
    // =========================================================================

    /**
     * @deprecated Use window.showToast directly.
     * This alias exists only for callers that predated the rename; it
     * should be removed once those callers migrate.
     */
    window._showToast = showToast;

})();