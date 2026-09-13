/**
 * =============================================================================
 * STILL WATERS - MODALS CORE (modals-core.js)
 * =============================================================================
 * 
 * LOCATION: js/core/modals-core.js
 * 
 * SCOPE:
 *   - Modal manager (open, close, stack)
 *   - Simple dialogs (alert, confirm, success, error)
 *   - Preview modal with consequences list
 * 
 * OUT OF SCOPE (belongs elsewhere):
 *   - Location dropdowns → js/selectors/location-dropdown.js
 *   - Icon dropdown → js/selectors/icon-dropdown.js
 *   - Undo/redo → js/core/history.js
 *   - Character selector bridge → js/selectors/modals-char-select.js
 *   - Data accessors → call window.getCharacterById etc. directly
 * 
 * DEPENDENCIES:
 *   - formatting.js (escapeHtml, escapeHtmlWithBreaks)
 *   - ui.js (showToast)
 *   - icons.js (Icons)
 * 
 * =============================================================================
 */

// =============================================================================
// 0. DEPENDENCY GUARDS
// =============================================================================

if (typeof window.escapeHtml !== 'function') {
    throw new Error('modals-core.js: formatting.js must load first (escapeHtml missing).');
}

function _requireIcons() {
    if (typeof window.Icons === 'undefined') {
        throw new Error('modals-core.js: icons.js must load first.');
    }
}

function _getIcon(name) {
    _requireIcons();
    return window.Icons[name] || window.Icons.CIRCLE || '';
}

function _getToast() {
    if (typeof window.showToast === 'function') return window.showToast;
    return function() {};
}

// =============================================================================
// 1. MODAL MANAGER
// =============================================================================

var _modalStack = [];
var _currentModalId = 0;

/**
 * Opens a modal dialog.
 * 
 * @param {Object} options
 * @param {string} options.title - Modal title (may contain trusted SVG)
 * @param {string} options.content - HTML content (caller is responsible for escaping)
 * @param {Function} options.onConfirm - Called on confirm button click
 * @param {Function} options.onCancel - Called on cancel button click
 * @param {Function} options.onOpen - Called after DOM insertion; receives modal element
 * @param {string} options.confirmText - default 'Confirm'
 * @param {string} options.cancelText - default 'Cancel'
 * @param {boolean} options.closeOnOverlay - default true
 * @param {boolean} options.showCloseButton - default true
 * @param {string} options.size - 'small' | 'medium' | 'large'; default 'medium'
 * @returns {HTMLElement} The modal element
 */
function openModal(options) {
    options = options || {};
    var title = options.title || 'Modal';
    var content = options.content || '';
    var onConfirm = options.onConfirm || null;
    var onCancel = options.onCancel || null;
    var onOpen = options.onOpen || null;
    var confirmText = options.confirmText || 'Confirm';
    var cancelText = options.cancelText || 'Cancel';
    var closeOnOverlay = options.closeOnOverlay !== false;
    var showCloseButton = options.showCloseButton !== false;
    var size = options.size || 'medium';

    var modalId = 'modal_' + (++_currentModalId);

    var maxWidth = size === 'small' ? '400px' : (size === 'large' ? '700px' : '550px');

    var modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal';
    modal.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; display:flex; align-items:center; justify-content:center;';
    modal.style.zIndex = String(10000 + _modalStack.length);

    var closeIcon = _getIcon('X_HEAVY');

    // Title and content are the CALLER's responsibility to escape.
    // Trusted SVG icons are permitted.
    modal.innerHTML =
        '<div class="modal-overlay" data-close="true" style="position:absolute; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.8);"></div>' +
        '<div class="modal-container" style="position:relative; background:var(--bg2); border-radius:12px; max-width:' + maxWidth + '; width:90%; max-height:85vh; overflow-y:auto; border:1px solid var(--border);">' +
            '<div class="modal-header" style="padding:16px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">' +
                '<h3 style="margin:0; font-family:Cinzel,serif; font-size:0.9rem; display:flex; align-items:center; gap:8px;">' + title + '</h3>' +
                (showCloseButton ? '<button class="modal-close-btn" style="background:none; border:none; color:var(--dim); font-size:1.2rem; cursor:pointer; padding:4px 8px;">' + closeIcon + '</button>' : '') +
            '</div>' +
            '<div class="modal-body" style="padding:16px;">' + content + '</div>' +
            ((onConfirm || cancelText) ?
                '<div class="modal-footer" style="padding:16px; border-top:1px solid var(--border); display:flex; justify-content:flex-end; gap:8px;">' +
                    (cancelText ? '<button class="btn cancel-btn" style="background:var(--bg3); border:1px solid var(--border); color:var(--text); padding:6px 14px; border-radius:6px; cursor:pointer;">' + window.escapeHtml(cancelText) + '</button>' : '') +
                    (onConfirm ? '<button class="btn primary confirm-btn" style="background:var(--accent); border:1px solid var(--accent); color:white; padding:6px 14px; border-radius:6px; cursor:pointer;">' + window.escapeHtml(confirmText) + '</button>' : '') +
                '</div>' : '') +
        '</div>';

    document.body.appendChild(modal);

    var stackEntry = { id: modalId, element: modal, escapeHandler: null };
    _modalStack.push(stackEntry);

    // ---- Single canonical close routine ----
    function closeModal() {
        // Remove escape listener
        if (stackEntry.escapeHandler) {
            document.removeEventListener('keydown', stackEntry.escapeHandler);
            stackEntry.escapeHandler = null;
        }
        // Remove from stack
        var idx = _modalStack.indexOf(stackEntry);
        if (idx !== -1) _modalStack.splice(idx, 1);
        // Remove DOM
        if (modal.parentNode) modal.parentNode.removeChild(modal);
    }

    // ---- Close button ----
    var closeBtn = modal.querySelector('.modal-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }

    // ---- Overlay click ----
    if (closeOnOverlay) {
        var overlay = modal.querySelector('.modal-overlay');
        if (overlay) {
            overlay.addEventListener('click', function(e) {
                if (e.target.dataset.close === 'true') closeModal();
            });
        }
    }

    // ---- Cancel button ----
    var cancelBtn = modal.querySelector('.cancel-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', function() {
            if (onCancel) {
                try { onCancel(); } catch (err) { console.error('onCancel threw:', err); }
            }
            closeModal();
        });
    }

    // ---- Confirm button ----
    var confirmBtn = modal.querySelector('.confirm-btn');
    if (confirmBtn && onConfirm) {
        confirmBtn.addEventListener('click', function() {
            try { onConfirm(); } catch (err) { console.error('onConfirm threw:', err); }
            closeModal();
        });
    }

    // ---- Escape key ----
    var escapeHandler = function(e) {
        if (e.key !== 'Escape') return;
        var top = _modalStack[_modalStack.length - 1];
        if (top && top.id === modalId) {
            closeModal();
        }
    };
    stackEntry.escapeHandler = escapeHandler;
    document.addEventListener('keydown', escapeHandler);

    // ---- onOpen ----
    if (onOpen) {
        try { onOpen(modal); } catch (err) { console.error('onOpen threw:', err); }
    }

    return modal;
}

/**
 * Closes the top-most modal.
 */
function closeTopModal() {
    var top = _modalStack[_modalStack.length - 1];
    if (top && top.element && top.element.parentNode) {
        // Trigger the close button so all cleanup runs consistently
        var closeBtn = top.element.querySelector('.modal-close-btn');
        if (closeBtn) {
            closeBtn.click();
        } else {
            // No close button (rare) — remove manually
            if (top.escapeHandler) document.removeEventListener('keydown', top.escapeHandler);
            top.element.parentNode.removeChild(top.element);
            _modalStack.pop();
        }
    }
}

/**
 * Closes all open modals.
 */
function closeAllModals() {
    while (_modalStack.length > 0) {
        closeTopModal();
    }
}

// =============================================================================
// 2. SIMPLE DIALOGS
// =============================================================================

function alertDialog(message, title) {
    title = title || 'Notice';
    openModal({
        title: title,
        content: '<div>' + window.escapeHtml(message) + '</div>',
        confirmText: 'OK',
        cancelText: ''
    });
}

function confirmDialog(message, title, onConfirm) {
    title = title || 'Confirm';
    openModal({
        title: title,
        content: '<div>' + window.escapeHtml(message) + '</div>',
        confirmText: 'Yes',
        cancelText: 'No',
        onConfirm: onConfirm
    });
}

function successDialog(message, title) {
    title = title || 'Success';
    var icon = _getIcon('CHECK_SIMPLE');
    openModal({
        title: title,
        content: '<div style="color:#4a9060;">' + icon + ' ' + window.escapeHtml(message) + '</div>',
        confirmText: 'OK',
        cancelText: ''
    });
}

function errorDialog(message, title) {
    title = title || 'Error';
    var icon = _getIcon('X_HEAVY');
    openModal({
        title: title,
        content: '<div style="color:#c84444;">' + icon + ' ' + window.escapeHtml(message) + '</div>',
        confirmText: 'OK',
        cancelText: ''
    });
}

// =============================================================================
// 3. PREVIEW MODAL
// =============================================================================

/**
 * Opens a confirmation modal with a consequences list.
 * 
 * @param {Object} options
 * @param {string} options.title
 * @param {Array<{message: string, severity?: 'info'|'warning'|'error'}>} options.consequences
 * @param {string} options.actionDescription - shown in "can be undone" note
 * @param {Function} options.onConfirm
 * @param {Function} options.actionUndo
 * @param {Function} options.actionRedo
 */
function openPreviewModal(options) {
    options = options || {};

    var warningIcon = _getIcon('WARNING');
    var infoIcon = _getIcon('CIRCLE_DOT');
    var xIcon = _getIcon('X_HEAVY');

    var consequencesHtml = (options.consequences || []).map(function(c) {
        var icon = c.severity === 'error' ? xIcon : (c.severity === 'warning' ? warningIcon : infoIcon);
        var color = c.severity === 'error' ? '#c62828'
                  : (c.severity === 'warning' ? '#c87040' : 'var(--dim)');
        return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border-light);">' +
            '<span style="width:24px;">' + icon + '</span>' +
            '<span style="color:' + color + ';">' + window.escapeHtml(c.message) + '</span>' +
        '</div>';
    }).join('');

    // Scoped to a unique checkbox ID per modal to avoid collisions
    var checkboxId = 'preview-confirm-checkbox-' + Date.now() + '-' + Math.floor(Math.random() * 1000);

    var modalContent =
        '<div class="preview-modal">' +
            (consequencesHtml ?
                '<div style="margin-bottom:16px;">' +
                    '<div style="font-weight:bold;margin-bottom:8px;">Consequences:</div>' +
                    consequencesHtml +
                '</div>' : '') +
            '<div class="form-group" style="margin-bottom:12px;">' +
                '<label style="display:flex;align-items:center;gap:8px;">' +
                    '<input type="checkbox" id="' + checkboxId + '">' +
                    '<span style="font-size:0.7rem;">I understand the consequences and wish to proceed</span>' +
                '</label>' +
            '</div>' +
            (options.actionDescription ?
                '<div class="info-note" style="margin-top:12px;padding:8px;background:var(--bg3);border-radius:6px;font-size:0.6rem;">' +
                    'This action can be undone: "' + window.escapeHtml(options.actionDescription) + '"' +
                '</div>' : '') +
        '</div>';

    openModal({
        title: options.title || 'Confirm Action',
        content: modalContent,
        confirmText: 'Confirm',
        cancelText: 'Cancel',
        onOpen: function(modal) {
            // Scoped queries — no global document.getElementById
            var checkbox = modal.querySelector('#' + checkboxId);
            var confirmBtn = modal.querySelector('.modal-footer .confirm-btn');
            if (checkbox && confirmBtn) {
                var update = function() {
                    confirmBtn.disabled = !checkbox.checked;
                    confirmBtn.style.opacity = checkbox.checked ? '1' : '0.5';
                    confirmBtn.style.cursor = checkbox.checked ? 'pointer' : 'not-allowed';
                };
                checkbox.addEventListener('change', update);
                update();
            }
        },
        onConfirm: function() {
            if (options.onConfirm) options.onConfirm();
            if (options.actionUndo && typeof window.showUndoPrompt === 'function') {
                window.showUndoPrompt(
                    options.actionDescription || 'Action',
                    options.actionUndo,
                    options.actionRedo
                );
            }
        }
    });
}

// =============================================================================
// 4. EXPORTS
// =============================================================================

// Modal manager
window.openModal = openModal;
window.closeTopModal = closeTopModal;
window.closeAllModals = closeAllModals;

// Simple dialogs
window.alertDialog = alertDialog;
window.confirmDialog = confirmDialog;
window.successDialog = successDialog;
window.errorDialog = errorDialog;

// Preview
window.openPreviewModal = openPreviewModal;