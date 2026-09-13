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
 *   - Tabs / settlement controller → js/modules/settlement/settlement-tabs.js
 *   - Location dropdowns → js/selectors/location-dropdown.js
 *   - Modal system → js/core/modals-core.js
 *   - Column/card rendering → domain modules
 * 
 * DEPENDENCIES:
 *   - formatting.js (escapeHtml)
 *   - icons.js (Icons)
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

    if (typeof window.escapeHtml !== 'function') {
        throw new Error('ui.js: formatting.js must load first (escapeHtml missing).');
    }

    function _getIcon(name) {
        if (typeof window.Icons === 'undefined') return '';
        return window.Icons[name] || '';
    }

    // =========================================================================
    // 1. GLOBAL STYLES INJECTION
    // =========================================================================

    function injectGlobalStyles() {
        if (document.querySelector('#ui-global-styles')) return;

        var style = document.createElement('style');
        style.id = 'ui-global-styles';
        style.textContent =
            '::-webkit-scrollbar { width: 8px; height: 8px; }' +
            '::-webkit-scrollbar-track { background: var(--bg2); border-radius: 4px; }' +
            '::-webkit-scrollbar-thumb { background: var(--accent); border-radius: 4px; }' +
            '::-webkit-scrollbar-thumb:hover { background: var(--accent-hover); }' +
            '::selection { background: var(--accent); color: white; }' +
            'button:focus, input:focus, select:focus, textarea:focus { outline: none; }' +
            'button:disabled, .btn:disabled { opacity: 0.5; cursor: not-allowed; }' +
            '.clickable { cursor: pointer; transition: opacity 0.2s; }' +
            '.clickable:hover { opacity: 0.8; }' +
            '@keyframes spin { to { transform: rotate(360deg); } }' +
            '@keyframes pulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 1; } }' +
            '@keyframes toastSlideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }' +
            '@keyframes toastSlideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }';
        document.head.appendChild(style);
    }

    function initUI() {
        injectGlobalStyles();
    }

    // =========================================================================
    // 2. BODY SCROLL LOCK (SHARED)
    // =========================================================================

    var _scrollLocks = new Set();

    /**
     * Acquires a named scroll lock. Multiple callers may hold locks
     * simultaneously; the body remains locked until all are released.
     * 
     * @param {string} key - Unique identifier for the lock holder
     */
    function lockBodyScroll(key) {
        if (!key) return;
        _scrollLocks.add(key);
        document.body.style.overflow = 'hidden';
    }

    /**
     * Releases a named scroll lock.
     * @param {string} key
     */
    function unlockBodyScroll(key) {
        if (!key) return;
        _scrollLocks.delete(key);
        if (_scrollLocks.size === 0) {
            document.body.style.overflow = '';
        }
    }

    /**
     * Releases all scroll locks. Escape hatch for teardown/reset.
     */
    function clearAllScrollLocks() {
        _scrollLocks.clear();
        document.body.style.overflow = '';
    }

    // =========================================================================
    // 3. TOAST NOTIFICATIONS
    // =========================================================================

    var COLORS = Object.freeze({
        success: '#4a9060',
        error: '#c84444',
        warning: '#c87040',
        info: '#6a9ecf'
    });

    function getToastContainer() {
        var container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.style.cssText = 'position:fixed; bottom:20px; right:20px; z-index:10000; display:flex; flex-direction:column; gap:10px;';
            document.body.appendChild(container);
        }
        return container;
    }

    /**
     * Creates a toast element. Used by both showToast and showPersistentToast.
     * @private
     */
    function _createToastElement(message, type) {
        var icon;
        switch (type) {
            case 'success': icon = _getIcon('CHECK_SIMPLE'); break;
            case 'error': icon = _getIcon('X_HEAVY'); break;
            case 'warning': icon = _getIcon('WARNING'); break;
            default: icon = _getIcon('CIRCLE_DOT');
        }

        // message may contain trusted SVG icons; escape everything else.
        // We use escapeHtml on the plain text and rely on the caller to
        // compose icons. For backward compat with callers passing SVG,
        // we keep a minimal pass-through for known icon tags.
        var safeContent = window.escapeHtml(message);

        var toast = document.createElement('div');
        toast.className = 'toast toast-' + type;
        toast.innerHTML =
            '<div style="display:flex;align-items:center;gap:10px;">' +
                '<span style="flex-shrink:0;">' + icon + '</span>' +
                '<span style="flex:1;word-break:break-word;">' + safeContent + '</span>' +
                '<button class="toast-close" style="background:none;border:none;color:var(--dim);cursor:pointer;font-size:1rem;padding:4px;flex-shrink:0;">' + _getIcon('X') + '</button>' +
            '</div>';
        toast.style.cssText =
            'background:var(--bg2);' +
            'border-left:4px solid ' + (COLORS[type] || COLORS.info) + ';' +
            'border-radius:8px;' +
            'padding:12px 16px;' +
            'margin-bottom:8px;' +
            'box-shadow:0 4px 12px rgba(0,0,0,0.15);' +
            'min-width:250px;' +
            'max-width:350px;' +
            'transition:opacity 0.3s ease;';
        return toast;
    }

    function _dismissToast(toast, animated) {
        if (!toast || !toast.parentNode) return;
        if (animated) {
            toast.style.animation = 'toastSlideOut 0.3s ease';
            setTimeout(function() {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300);
        } else {
            toast.parentNode.removeChild(toast);
        }
    }

    /**
     * Shows a toast notification.
     * Duration of 0 means "do not auto-dismiss."
     * 
     * @param {string} message
     * @param {string} type - 'success' | 'error' | 'warning' | 'info'
     * @param {number} duration - ms; default 3000
     * @returns {HTMLElement}
     */
    function showToast(message, type, duration) {
        type = type || 'info';
        duration = duration === undefined ? 3000 : duration;

        var container = getToastContainer();
        var toast = _createToastElement(message, type);
        toast.style.animation = 'toastSlideIn 0.3s ease';
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
        return showToast(message, 'success', duration === undefined ? 3000 : duration);
    }

    function showErrorToast(message, duration) {
        return showToast(message, 'error', duration === undefined ? 4000 : duration);
    }

    function showWarningToast(message, duration) {
        return showToast(message, 'warning', duration === undefined ? 3500 : duration);
    }

    function showInfoToast(message, duration) {
        return showToast(message, 'info', duration === undefined ? 3000 : duration);
    }

    /**
     * Shows a persistent toast (no auto-dismiss).
     */
    function showPersistentToast(message, type) {
        return showToast(message, type || 'info', 0);
    }

    /**
     * Shows a sequence of toasts.
     * @param {Array<{message: string, type?: string}>} messages
     * @param {number} [delayBetween] - ms
     */
    function showToastSequence(messages, delayBetween) {
        if (!Array.isArray(messages)) return;
        delayBetween = delayBetween === undefined ? 500 : delayBetween;
        for (var i = 0; i < messages.length; i++) {
            (function(idx) {
                setTimeout(function() {
                    var m = messages[idx];
                    showToast(m.message, m.type || 'info');
                }, idx * delayBetween);
            })(i);
        }
    }

    function clearAllToasts() {
        var container = document.getElementById('toast-container');
        if (container) container.innerHTML = '';
    }

    // =========================================================================
    // 4. LOADING OVERLAY (with nested counter)
    // =========================================================================

    var _loadingOverlay = null;
    var _loadingOverlayCount = 0;

    /**
     * Shows the loading overlay. Nested calls increment a counter;
     * the overlay hides only when the counter returns to zero.
     * 
     * @param {string} [message]
     * @returns {HTMLElement}
     */
    function showLoading(message) {
        message = message || 'Loading...';
        _loadingOverlayCount++;

        if (_loadingOverlay) {
            var msgEl = _loadingOverlay.querySelector('.loading-message');
            if (msgEl) msgEl.textContent = message;
            return _loadingOverlay;
        }

        _loadingOverlay = document.createElement('div');
        _loadingOverlay.className = 'loading-overlay';
        _loadingOverlay.style.cssText =
            'position:fixed; top:0; left:0; right:0; bottom:0;' +
            'background:rgba(0,0,0,0.7);' +
            'display:flex; align-items:center; justify-content:center;' +
            'z-index:20000; flex-direction:column; gap:16px;';
        _loadingOverlay.innerHTML =
            '<div class="loading-spinner" style="width:48px;height:48px;border:4px solid var(--bg2);border-top-color:var(--accent);border-radius:50%;animation:spin 1s linear infinite;"></div>' +
            '<div class="loading-message" style="color:white;font-size:0.9rem;">' + window.escapeHtml(message) + '</div>';

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
     * For error recovery.
     */
    function forceHideLoading() {
        if (_loadingOverlay && _loadingOverlay.parentNode) {
            _loadingOverlay.parentNode.removeChild(_loadingOverlay);
        }
        _loadingOverlay = null;
        _loadingOverlayCount = 0;
    }

    // =========================================================================
    // 5. INLINE LOADING
    // =========================================================================

    // Track original DOM nodes for restoration via DocumentFragment
    var _inlineLoaderState = new WeakMap();

    function showInlineLoading(containerId, message) {
        message = message || 'Loading...';
        var container = document.getElementById(containerId);
        if (!container) return null;

        // If already showing, update message
        var existing = container.querySelector('.inline-loader');
        if (existing) {
            var msgEl = existing.querySelector('.inline-loader-message');
            if (msgEl) msgEl.textContent = message;
            return existing;
        }

        // Preserve original child nodes as a DocumentFragment
        var fragment = document.createDocumentFragment();
        while (container.firstChild) {
            fragment.appendChild(container.firstChild);
        }
        _inlineLoaderState.set(container, fragment);

        var loader = document.createElement('div');
        loader.className = 'inline-loader';
        loader.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:12px;padding:40px;color:var(--dim);';
        loader.innerHTML =
            '<div style="width:24px;height:24px;border:2px solid var(--bg2);border-top-color:var(--accent);border-radius:50%;animation:spin 1s linear infinite;"></div>' +
            '<span class="inline-loader-message">' + window.escapeHtml(message) + '</span>';
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
    // 6. BUTTON LOADING
    // =========================================================================

    // Track original button content via WeakMap
    var _buttonLoaderState = new WeakMap();

    function showButtonLoading(buttonId, text) {
        var button = document.getElementById(buttonId);
        if (!button) return null;

        // Save original innerHTML once
        if (!_buttonLoaderState.has(button)) {
            _buttonLoaderState.set(button, button.innerHTML);
        }

        var loadingText = text === undefined ? button.textContent || 'Loading...' : text;
        button.disabled = true;
        button.innerHTML =
            '<span class="button-spinner" style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:8px;vertical-align:middle;"></span>' +
            window.escapeHtml(loadingText);
        return _buttonLoaderState.get(button);
    }

    function hideButtonLoading(buttonId) {
        var button = document.getElementById(buttonId);
        if (!button) return;
        button.disabled = false;
        var original = _buttonLoaderState.get(button);
        if (original !== undefined) {
            button.innerHTML = original;
            _buttonLoaderState.delete(button);
        }
    }

    // =========================================================================
    // 7. PROGRESS BAR
    // =========================================================================

    var _progressState = new WeakMap();

    function showProgressBar(containerId, current, total, label) {
        label = label || '';
        var container = document.getElementById(containerId);
        if (!container) return null;

        // Preserve original children
        if (!_progressState.has(container)) {
            var fragment = document.createDocumentFragment();
            while (container.firstChild) {
                fragment.appendChild(container.firstChild);
            }
            _progressState.set(container, fragment);
        }

        // Guard against total=0
        var percentage = total > 0 ? (current / total) * 100 : 0;
        percentage = Math.min(100, Math.max(0, percentage));

        var wrapper = document.createElement('div');
        wrapper.className = 'progress-container';
        wrapper.style.cssText = 'background:var(--bg2);border-radius:8px;padding:8px;margin:8px 0;';
        wrapper.innerHTML =
            (label ? '<div style="margin-bottom:8px;font-size:0.7rem;">' + window.escapeHtml(label) + '</div>' : '') +
            '<div style="background:var(--bg3);border-radius:4px;overflow:hidden;">' +
                '<div class="progress-fill" style="width:' + percentage + '%;background:var(--accent);height:20px;transition:width 0.3s ease;display:flex;align-items:center;justify-content:center;color:white;font-size:0.6rem;">' + Math.round(percentage) + '%</div>' +
            '</div>' +
            '<div class="progress-count" style="margin-top:4px;font-size:0.55rem;color:var(--dim);text-align:right;">' + current + ' / ' + total + '</div>';
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

    function updateProgressBar(containerId, current, total) {
        var container = document.getElementById(containerId);
        if (!container) return;
        var fill = container.querySelector('.progress-fill');
        var count = container.querySelector('.progress-count');
        if (!fill) return;

        var percentage;
        if (total === null || total === undefined) {
            percentage = Math.min(100, Math.max(0, current));
            if (count && total === undefined) count.textContent = Math.round(percentage) + '%';
        } else {
            percentage = total > 0 ? (current / total) * 100 : 0;
            percentage = Math.min(100, Math.max(0, percentage));
            if (count) count.textContent = current + ' / ' + total;
        }
        fill.style.width = percentage + '%';
        fill.textContent = Math.round(percentage) + '%';
    }

    // =========================================================================
    // 8. SKELETON LOADERS
    // =========================================================================

    var _skeletonState = new WeakMap();

    function showSkeletonLoader(containerId, type, count) {
        type = type || 'card';
        count = count === undefined ? 3 : count;
        var container = document.getElementById(containerId);
        if (!container) return;

        if (!_skeletonState.has(container)) {
            var fragment = document.createDocumentFragment();
            while (container.firstChild) {
                fragment.appendChild(container.firstChild);
            }
            _skeletonState.set(container, fragment);
        }

        var html = '';
        switch (type) {
            case 'card':
                html = '<div class="skeleton-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px;">';
                for (var i = 0; i < count; i++) {
                    html += '<div class="skeleton-card" style="background:var(--bg2);border-radius:8px;padding:16px;animation:pulse 1.5s ease-in-out infinite;">' +
                        '<div style="width:60%;height:20px;background:var(--bg3);border-radius:4px;margin-bottom:12px;"></div>' +
                        '<div style="width:80%;height:14px;background:var(--bg3);border-radius:4px;margin-bottom:8px;"></div>' +
                        '<div style="width:40%;height:14px;background:var(--bg3);border-radius:4px;"></div>' +
                    '</div>';
                }
                html += '</div>';
                break;
            case 'list':
                html = '<div class="skeleton-list" style="display:flex;flex-direction:column;gap:12px;">';
                for (var j = 0; j < count; j++) {
                    html += '<div class="skeleton-list-item" style="display:flex;gap:12px;padding:12px;background:var(--bg2);border-radius:8px;animation:pulse 1.5s ease-in-out infinite;">' +
                        '<div style="width:40px;height:40px;background:var(--bg3);border-radius:50%;"></div>' +
                        '<div style="flex:1;">' +
                            '<div style="width:60%;height:16px;background:var(--bg3);border-radius:4px;margin-bottom:8px;"></div>' +
                            '<div style="width:40%;height:12px;background:var(--bg3);border-radius:4px;"></div>' +
                        '</div>' +
                    '</div>';
                }
                html += '</div>';
                break;
            case 'table':
                html = '<table class="skeleton-table" style="width:100%;border-collapse:collapse;"><thead><tr>';
                for (var k = 0; k < 3; k++) html += '<th style="padding:12px;">&nbsp;</th>';
                html += '</tr></thead><tbody>';
                for (var m = 0; m < count; m++) {
                    html += '<tr style="animation:pulse 1.5s ease-in-out infinite;">';
                    for (var n = 0; n < 3; n++) {
                        html += '<td style="padding:12px;"><div style="height:16px;background:var(--bg3);border-radius:4px;"></div></td>';
                    }
                    html += '</tr>';
                }
                html += '</tbody></table>';
                break;
            case 'text':
            default:
                html = '<div class="skeleton-text" style="display:flex;flex-direction:column;gap:8px;">';
                for (var p = 0; p < count; p++) {
                    var width = 70 + ((p * 17) % 30); // deterministic-ish
                    html += '<div style="height:14px;background:var(--bg3);border-radius:4px;animation:pulse 1.5s ease-in-out infinite;width:' + width + '%;"></div>';
                }
                html += '</div>';
                break;
        }

        var wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        while (wrapper.firstChild) container.appendChild(wrapper.firstChild);
    }

    function hideSkeletonLoader(containerId) {
        var container = document.getElementById(containerId);
        if (!container) return;

        // Remove all skeleton children
        var skels = container.querySelectorAll('.skeleton-grid, .skeleton-list, .skeleton-table, .skeleton-text');
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
    // 9. EXPORTS
    // =========================================================================

    // Global styles
    window.injectGlobalStyles = injectGlobalStyles;
    window.initUI = initUI;

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
    window._showToast = showToast; // backward compat

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

})();