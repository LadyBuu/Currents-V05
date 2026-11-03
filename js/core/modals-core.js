/**
 * =============================================================================
 * STILL WATERS - MODAL CORE (js/core/modals-core.js)
 * =============================================================================
 *
 * LOCATION: js/core/modals-core.js
 *
 * SCOPE:
 *   - openModal / closeTopModal / closeAllModals
 *   - alertDialog / confirmDialog / successDialog / errorDialog
 *   - openPreviewModal (consequence-aware confirm dialog)
 *
 * OUT OF SCOPE:
 *   - Domain-specific modals     -> modals-*.js in each domain
 *   - Icons                      -> icons.js
 *   - HTML escaping              -> formatting.js (escapeHtml)
 *   - Presentation CSS           -> stylesheet
 *
 * CALLBACK CONTRACT:
 *   onMount(root)
 *     Called after DOM insertion. Exceptions are logged and swallowed;
 *     the modal stays open. Prefer onMount over onOpen; the latter is a
 *     compatibility alias that only fires if onMount is not supplied.
 *
 *   onOpen(root)
 *     Alias for onMount. If both supplied, onMount wins.
 *
 *   onConfirm(root)
 *     Called when the confirm button is clicked. Return false to keep
 *     the modal open. Any other return (including undefined) closes the
 *     modal with a "confirmed" outcome. Exceptions propagate; the modal
 *     stays open.
 *
 *   onCancel(root)
 *     Called when the modal closes WITHOUT a confirmed outcome.
 *
 * DEPENDENCIES (REQUIRED):
 *   - formatting.js (escapeHtml)
 *   - icons.js      (Icons)
 *
 * ICON POLICY: Uses SVG from icons.js. No emojis.
 * =============================================================================
 */

(function() {
    'use strict';

    function _requireFormatting() {
        if (typeof window.escapeHtml !== 'function') {
            throw new Error('modals-core.js: formatting.js must load first (escapeHtml missing).');
        }
    }

    function _requireIcons() {
        if (typeof window.Icons === 'undefined') {
            throw new Error('modals-core.js: icons.js must load first.');
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
    // 1. MODAL STACK
    // =========================================================================

    var _modalStack = [];
    var _currentModalId = 0;
    var _VALID_SIZES = ['small', 'medium', 'large'];

    function openModal(options) {
        if (_isMissing(options)) options = {};
        else if (typeof options !== 'object' || Array.isArray(options)) {
            throw new Error('openModal: options must be an object');
        }

        // FIX: accept title/content as aliases for titleHtml/contentHtml.
        // Every modals-government-*.js calls with `title` and `content`.
        // Without this alias, the body is always empty and the modal
        // renders as a shell with only the header and footer.
        var titleHtml = !_isMissing(options.titleHtml)
            ? options.titleHtml
            : (!_isMissing(options.title) ? options.title : 'Modal');
        var contentHtml = !_isMissing(options.contentHtml)
            ? options.contentHtml
            : (!_isMissing(options.content) ? options.content : '');

        var onMount = _isMissing(options.onMount) ? null : options.onMount;
        var onOpen = _isMissing(options.onOpen) ? null : options.onOpen;
        var onConfirm = _isMissing(options.onConfirm) ? null : options.onConfirm;
        var onCancel = _isMissing(options.onCancel) ? null : options.onCancel;
        var confirmText = _isMissing(options.confirmText) ? 'Confirm' : options.confirmText;
        var cancelText = _isMissing(options.cancelText) ? 'Cancel' : options.cancelText;
        var closeOnOverlay = options.closeOnOverlay !== false;
        var showCloseButton = options.showCloseButton !== false;
        var size = _isMissing(options.size) ? 'medium' : options.size;

        if (_VALID_SIZES.indexOf(size) === -1) {
            throw new Error('openModal: unknown size "' + size + '". Expected one of: ' + _VALID_SIZES.join(', '));
        }
        if (onMount !== null && typeof onMount !== 'function') {
            throw new Error('openModal: onMount must be a function');
        }
        if (onOpen !== null && typeof onOpen !== 'function') {
            throw new Error('openModal: onOpen must be a function');
        }
        if (onConfirm !== null && typeof onConfirm !== 'function') {
            throw new Error('openModal: onConfirm must be a function');
        }
        if (onCancel !== null && typeof onCancel !== 'function') {
            throw new Error('openModal: onCancel must be a function');
        }

        var mountHook = onMount || onOpen;

        var modalId = 'modal_' + (++_currentModalId);
        var previouslyFocused = document.activeElement;

        var modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal modal--' + size;
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.style.zIndex = String(10000 + _modalStack.length);

        var closeIcon = _getIcon('X_HEAVY');
        var titleId = modalId + '-title';
        modal.setAttribute('aria-labelledby', titleId);

        modal.innerHTML =
            '<div class="modal-overlay"></div>' +
            '<div class="modal-container">' +
                '<div class="modal-header">' +
                    '<h3 id="' + titleId + '" class="modal-title">' + titleHtml + '</h3>' +
                    (showCloseButton
                        ? '<button type="button" class="modal-close-btn" aria-label="Close">' + closeIcon + '</button>'
                        : '') +
                '</div>' +
                '<div class="modal-body">' + contentHtml + '</div>' +
                ((onConfirm || cancelText) ?
                    '<div class="modal-footer">' +
                        (cancelText
                            ? '<button type="button" class="btn cancel-btn">' + window.escapeHtml(cancelText) + '</button>'
                            : '') +
                        (onConfirm
                            ? '<button type="button" class="btn primary confirm-btn">' + window.escapeHtml(confirmText) + '</button>'
                            : '') +
                    '</div>'
                    : '') +
            '</div>';

        document.body.appendChild(modal);

        var container = modal.querySelector('.modal-container');
        container.setAttribute('tabindex', '-1');
        container.focus();

        var stackEntry = { id: modalId, element: modal, escapeHandler: null, close: null };
        _modalStack.push(stackEntry);

        function _teardownStackEntry() {
            if (stackEntry.escapeHandler) {
                document.removeEventListener('keydown', stackEntry.escapeHandler);
                stackEntry.escapeHandler = null;
            }
            var idx = _modalStack.indexOf(stackEntry);
            if (idx !== -1) _modalStack.splice(idx, 1);
            if (modal.parentNode) modal.parentNode.removeChild(modal);
            if (previouslyFocused
                && typeof previouslyFocused.focus === 'function'
                && previouslyFocused !== document.body) {
                try { previouslyFocused.focus(); } catch (e) { /* ignore */ }
            }
        }

        function _fireCancel() {
            if (typeof onCancel !== 'function') return;
            try {
                onCancel(modal);
            } catch (err) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('modals-core.js: onCancel threw:', err);
                }
            }
        }

        function _finishClose(kind) {
            _teardownStackEntry();
            if (kind === 'cancelled') _fireCancel();
        }

        function _closeAsConfirmed() { _finishClose('confirmed'); }
        function _closeAsCancelled() { _finishClose('cancelled'); }
        function _closeProgrammatically() { _finishClose('programmatic'); }

        stackEntry.close = _closeProgrammatically;

        var closeBtn = modal.querySelector('.modal-close-btn');
        if (closeBtn) closeBtn.addEventListener('click', _closeAsCancelled);

        if (closeOnOverlay) {
            var overlay = modal.querySelector('.modal-overlay');
            if (overlay) overlay.addEventListener('click', _closeAsCancelled);
        }

        var cancelBtn = modal.querySelector('.cancel-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', _closeAsCancelled);
        }

        var confirmBtn = modal.querySelector('.confirm-btn');
        if (confirmBtn && onConfirm) {
            confirmBtn.addEventListener('click', function() {
                var result = onConfirm(modal);
                if (result === false) return;
                _closeAsConfirmed();
            });
        }

        var escapeHandler = function(e) {
            if (e.key !== 'Escape') return;
            var top = _modalStack[_modalStack.length - 1];
            if (top && top.id === modalId) _closeAsCancelled();
        };
        stackEntry.escapeHandler = escapeHandler;
        document.addEventListener('keydown', escapeHandler);

        if (mountHook) {
            try { mountHook(modal); }
            catch (err) { console.error('modals-core.js: mount hook threw:', err); }
        }

        return { element: modal, close: _closeProgrammatically };
    }

    function closeTopModal() {
        if (_modalStack.length === 0) return;
        var top = _modalStack[_modalStack.length - 1];
        if (typeof top.close !== 'function') {
            throw new Error('modals-core.js: modal stack contains an invalid entry');
        }
        top.close();
    }

    function closeAllModals() {
        while (_modalStack.length > 0) closeTopModal();
    }

    // =========================================================================
    // 2. SIMPLE DIALOGS
    // =========================================================================

    function alertDialog(message, title) {
        var resolvedTitle = _isMissing(title) ? 'Notice' : title;
        openModal({
            titleHtml: window.escapeHtml(resolvedTitle),
            contentHtml: '<div>' + window.escapeHtml(message) + '</div>',
            confirmText: 'OK',
            cancelText: ''
        });
    }

    function confirmDialog(message, title, onConfirm) {
        var resolvedTitle = _isMissing(title) ? 'Confirm' : title;
        openModal({
            titleHtml: window.escapeHtml(resolvedTitle),
            contentHtml: '<div>' + window.escapeHtml(message) + '</div>',
            confirmText: 'Yes',
            cancelText: 'No',
            onConfirm: onConfirm
        });
    }

    function successDialog(message, title) {
        var resolvedTitle = _isMissing(title) ? 'Success' : title;
        var icon = _getIcon('CHECK_SIMPLE');
        openModal({
            titleHtml: window.escapeHtml(resolvedTitle),
            contentHtml: '<div class="modal-message modal-message--success">' + icon + ' ' + window.escapeHtml(message) + '</div>',
            confirmText: 'OK',
            cancelText: ''
        });
    }

    function errorDialog(message, title) {
        var resolvedTitle = _isMissing(title) ? 'Error' : title;
        var icon = _getIcon('X_HEAVY');
        openModal({
            titleHtml: window.escapeHtml(resolvedTitle),
            contentHtml: '<div class="modal-message modal-message--error">' + icon + ' ' + window.escapeHtml(message) + '</div>',
            confirmText: 'OK',
            cancelText: ''
        });
    }

    // =========================================================================
    // 3. PREVIEW MODAL
    // =========================================================================

    var _VALID_SEVERITIES = ['info', 'warning', 'error'];

    function _validateConsequences(consequences) {
        if (!Array.isArray(consequences)) {
            throw new Error('openPreviewModal: consequences must be an array');
        }
        for (var i = 0; i < consequences.length; i++) {
            var c = consequences[i];
            if (!c || typeof c !== 'object' || Array.isArray(c)) {
                throw new Error('openPreviewModal: consequences[' + i + '] must be an object');
            }
            if (typeof c.message !== 'string') {
                throw new Error('openPreviewModal: consequences[' + i + '].message must be a string');
            }
            if (!_isMissing(c.severity) && _VALID_SEVERITIES.indexOf(c.severity) === -1) {
                throw new Error('openPreviewModal: consequences[' + i + '].severity must be one of: ' + _VALID_SEVERITIES.join(', '));
            }
        }
    }

    function openPreviewModal(options) {
        if (_isMissing(options)) options = {};
        else if (typeof options !== 'object' || Array.isArray(options)) {
            throw new Error('openPreviewModal: options must be an object');
        }

        if (!_isMissing(options.consequences)) _validateConsequences(options.consequences);
        if (!_isMissing(options.onConfirm) && typeof options.onConfirm !== 'function') {
            throw new Error('openPreviewModal: onConfirm must be a function');
        }
        if (!_isMissing(options.onUndo) && typeof options.onUndo !== 'function') {
            throw new Error('openPreviewModal: onUndo must be a function');
        }
        if (!_isMissing(options.onRedo) && typeof options.onRedo !== 'function') {
            throw new Error('openPreviewModal: onRedo must be a function');
        }

        var warningIcon = _getIcon('WARNING');
        var infoIcon = _getIcon('CIRCLE_DOT');
        var xIcon = _getIcon('X_HEAVY');

        var consequences = options.consequences || [];
        var consequencesHtml = consequences.map(function(c) {
            var severity = _isMissing(c.severity) ? 'info' : c.severity;
            var icon = severity === 'error' ? xIcon
                     : severity === 'warning' ? warningIcon
                     : infoIcon;
            return '<div class="preview-consequence preview-consequence--' + severity + '">' +
                '<span class="preview-consequence-icon">' + icon + '</span>' +
                '<span class="preview-consequence-message">' + window.escapeHtml(c.message) + '</span>' +
            '</div>';
        }).join('');

        var modalContent =
            '<div class="preview-modal">' +
                (consequencesHtml ?
                    '<div class="preview-consequences">' +
                        '<div class="preview-consequences-title">Consequences:</div>' +
                        consequencesHtml +
                    '</div>' : '') +
                '<div class="preview-confirm-group">' +
                    '<label class="preview-confirm-label">' +
                        '<input type="checkbox" class="preview-confirm-checkbox">' +
                        '<span class="preview-confirm-text">I understand the consequences and wish to proceed</span>' +
                    '</label>' +
                '</div>' +
                (!_isMissing(options.actionDescription) ?
                    '<div class="preview-undo-note">' +
                        'This action can be undone: "' + window.escapeHtml(options.actionDescription) + '"' +
                    '</div>' : '') +
            '</div>';

        return openModal({
            titleHtml: window.escapeHtml(_isMissing(options.title) ? 'Confirm Action' : options.title),
            contentHtml: modalContent,
            confirmText: 'Confirm',
            cancelText: 'Cancel',
            onMount: function(modal) {
                var checkbox = modal.querySelector('.preview-confirm-checkbox');
                var confirmBtn = modal.querySelector('.modal-footer .confirm-btn');
                if (checkbox && confirmBtn) {
                    var update = function() { confirmBtn.disabled = !checkbox.checked; };
                    checkbox.addEventListener('change', update);
                    update();
                }
            },
            onConfirm: function() {
                if (options.onConfirm) options.onConfirm();
                if (options.onUndo) options.onUndo(options.actionDescription, options.onRedo);
            }
        });
    }

    // =========================================================================
    // 4. EXPORTS
    // =========================================================================

    window.openModal = openModal;
    window.closeTopModal = closeTopModal;
    window.closeAllModals = closeAllModals;
    window.alertDialog = alertDialog;
    window.confirmDialog = confirmDialog;
    window.successDialog = successDialog;
    window.errorDialog = errorDialog;
    window.openPreviewModal = openPreviewModal;

})();
