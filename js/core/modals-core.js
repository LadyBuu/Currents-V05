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
 *   - Modal visual presentation → CSS (.modal, .modal--small, etc.)
 *
 * SEMANTIC RULES:
 *   - Missing (undefined/null) options use defaults. Invalid explicit
 *     options (wrong type, unknown enum value) throw.
 *   - openModal's titleHtml / contentHtml are TRUSTED HTML. Callers must
 *     escape user-supplied strings. Simple dialogs escape their message
 *     arguments; the raw openModal does not.
 *   - onConfirm / onCancel exceptions propagate to the caller. The modal
 *     does NOT auto-close after a callback throws, and does NOT swallow
 *     the error. Callers are responsible for handling failures.
 *   - onOpen exceptions are logged and contained. The modal is not
 *     rethrown out of openModal. Rationale: onOpen is a setup hook, not
 *     the user's action; a failure there should not prevent the modal
 *     from having been created.
 *   - Missing dependencies throw. No silent fallbacks.
 *   - openModal returns { element, close }.
 *
 * CALLBACK CONTRACT:
 *   onConfirm is invoked when the user confirms. If it throws, the modal
 *   stays open and the exception propagates out of the click handler
 *   (the browser will log it). A future revision may support an async
 *   onConfirm that resolves to "close" or "keep open"; for now, callers
 *   who need that behaviour should not use the built-in confirm button.
 *
 *   onCancel follows the same rule: it propagates on throw.
 *
 *   onOpen is called after DOM insertion. If it throws, the error is
 *   logged and the modal remains open.
 *
 * FOCUS:
 *   The modal container is focused on open, and focus is restored to
 *   the previously focused element on close. A full focus trap (tab
 *   cycling) is not implemented; the modal container being focused
 *   means tabbing into the underlying page is possible, which is a
 *   known limitation of this module. Callers requiring strict focus
 *   containment should build it on top.
 *
 * UNDO:
 *   modals-core does NOT know about the undo system. Callers who want
 *   to offer an undo prompt after confirmation pass an onUndo callback
 *   to openPreviewModal. The undo machinery (history.js) is the
 *   caller's concern.
 *
 * DEPENDENCIES (REQUIRED):
 *   - formatting.js: escapeHtml
 *   - icons.js:      Icons
 *
 * ICON POLICY: Uses icons.js. No emojis.
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
            throw new Error(
                'modals-core.js: formatting.js must load first ' +
                '(escapeHtml missing).'
            );
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
    // 1. MODAL MANAGER
    // =========================================================================

    var _modalStack = [];
    var _currentModalId = 0;

    var _VALID_SIZES = ['small', 'medium', 'large'];

    /**
     * Opens a modal dialog.
     *
     * TRUST: `titleHtml` and `contentHtml` are inserted as innerHTML.
     * Callers are responsible for escaping any user-supplied content.
     *
     * @param {Object} [options]
     * @param {string} [options.titleHtml] - trusted HTML
     * @param {string} [options.contentHtml] - trusted HTML
     * @param {Function} [options.onConfirm] - called on confirm; exceptions
     *                                          propagate and keep the modal open
     * @param {Function} [options.onCancel]  - called on cancel; exceptions
     *                                          propagate
     * @param {Function} [options.onOpen]    - called after DOM insertion;
     *                                          receives the modal element;
     *                                          exceptions are logged
     * @param {string} [options.confirmText] - default 'Confirm'
     * @param {string} [options.cancelText]  - default 'Cancel'
     * @param {boolean} [options.closeOnOverlay] - default true
     * @param {boolean} [options.showCloseButton] - default true
     * @param {string} [options.size] - 'small' | 'medium' | 'large'
     * @returns {{ element: HTMLElement, close: Function }}
     * @throws {Error} for invalid options, size, or missing dependencies
     */
    function openModal(options) {
        if (_isMissing(options)) {
            options = {};
        } else if (typeof options !== 'object' || Array.isArray(options)) {
            throw new Error('openModal: options must be an object');
        }

        var titleHtml = _isMissing(options.titleHtml) ? 'Modal' : options.titleHtml;
        var contentHtml = _isMissing(options.contentHtml) ? '' : options.contentHtml;
        var onConfirm = _isMissing(options.onConfirm) ? null : options.onConfirm;
        var onCancel = _isMissing(options.onCancel) ? null : options.onCancel;
        var onOpen = _isMissing(options.onOpen) ? null : options.onOpen;
        var confirmText = _isMissing(options.confirmText) ? 'Confirm' : options.confirmText;
        var cancelText = _isMissing(options.cancelText) ? 'Cancel' : options.cancelText;
        var closeOnOverlay = options.closeOnOverlay !== false;
        var showCloseButton = options.showCloseButton !== false;
        var size = _isMissing(options.size) ? 'medium' : options.size;

        if (_VALID_SIZES.indexOf(size) === -1) {
            throw new Error(
                'openModal: unknown size "' + size + '". ' +
                'Expected one of: ' + _VALID_SIZES.join(', ')
            );
        }

        if (onConfirm !== null && typeof onConfirm !== 'function') {
            throw new Error('openModal: onConfirm must be a function');
        }
        if (onCancel !== null && typeof onCancel !== 'function') {
            throw new Error('openModal: onCancel must be a function');
        }
        if (onOpen !== null && typeof onOpen !== 'function') {
            throw new Error('openModal: onOpen must be a function');
        }

        var modalId = 'modal_' + (++_currentModalId);

        // Capture the currently focused element for restoration on close.
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

        // titleHtml / contentHtml are the caller's responsibility to
        // escape. Trusted SVG icons are permitted via _getIcon().
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

        // Focus the modal container so keyboard users are inside it.
        var container = modal.querySelector('.modal-container');
        container.setAttribute('tabindex', '-1');
        container.focus();

        var stackEntry = { id: modalId, element: modal, escapeHandler: null, close: null };
        _modalStack.push(stackEntry);

        // ---- Single canonical close routine ----
        function closeModal() {
            if (stackEntry.escapeHandler) {
                document.removeEventListener('keydown', stackEntry.escapeHandler);
                stackEntry.escapeHandler = null;
            }
            var idx = _modalStack.indexOf(stackEntry);
            if (idx !== -1) _modalStack.splice(idx, 1);
            if (modal.parentNode) modal.parentNode.removeChild(modal);

            // Restore focus to whatever held it before this modal opened.
            if (previouslyFocused
                && typeof previouslyFocused.focus === 'function'
                && previouslyFocused !== document.body) {
                try { previouslyFocused.focus(); } catch (e) { /* ignore */ }
            }
        }

        stackEntry.close = closeModal;

        // ---- Close button ----
        var closeBtn = modal.querySelector('.modal-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', closeModal);
        }

        // ---- Overlay click ----
        if (closeOnOverlay) {
            var overlay = modal.querySelector('.modal-overlay');
            if (overlay) {
                overlay.addEventListener('click', closeModal);
            }
        }

        // ---- Cancel button ----
        // Exceptions propagate; the modal stays open on failure.
        var cancelBtn = modal.querySelector('.cancel-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', function() {
                if (onCancel) onCancel();
                closeModal();
            });
        }

        // ---- Confirm button ----
        // Exceptions propagate; the modal stays open on failure.
        var confirmBtn = modal.querySelector('.confirm-btn');
        if (confirmBtn && onConfirm) {
            confirmBtn.addEventListener('click', function() {
                onConfirm();
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
        // Exceptions are logged and contained; the modal is already
        // created and should remain usable.
        if (onOpen) {
            try {
                onOpen(modal);
            } catch (err) {
                console.error('modals-core.js: onOpen threw:', err);
            }
        }

        return {
            element: modal,
            close: closeModal
        };
    }

    /**
     * Closes the top-most modal, if any.
     * Internal stack corruption throws rather than being silently repaired.
     */
    function closeTopModal() {
        if (_modalStack.length === 0) return;
        var top = _modalStack[_modalStack.length - 1];
        if (typeof top.close !== 'function') {
            throw new Error('modals-core.js: modal stack contains an invalid entry');
        }
        top.close();
    }

    /**
     * Closes all open modals.
     */
    function closeAllModals() {
        while (_modalStack.length > 0) {
            closeTopModal();
        }
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

    /**
     * Validates the consequences array shape.
     * @private
     */
    function _validateConsequences(consequences) {
        if (!Array.isArray(consequences)) {
            throw new Error('openPreviewModal: consequences must be an array');
        }
        for (var i = 0; i < consequences.length; i++) {
            var c = consequences[i];
            if (!c || typeof c !== 'object' || Array.isArray(c)) {
                throw new Error(
                    'openPreviewModal: consequences[' + i + '] must be an object'
                );
            }
            if (typeof c.message !== 'string') {
                throw new Error(
                    'openPreviewModal: consequences[' + i + '].message must be a string'
                );
            }
            if (!_isMissing(c.severity)
                && _VALID_SEVERITIES.indexOf(c.severity) === -1) {
                throw new Error(
                    'openPreviewModal: consequences[' + i + '].severity must be ' +
                    'one of: ' + _VALID_SEVERITIES.join(', ')
                );
            }
        }
    }

    /**
     * Opens a confirmation modal with a consequences list.
     *
     * @param {Object} [options]
     * @param {string} [options.title]
     * @param {Array<{ message: string, severity?: 'info'|'warning'|'error' }>} [options.consequences]
     * @param {string} [options.actionDescription] - shown in the info note
     * @param {Function} [options.onConfirm] - called on confirm; exceptions
     *                                          propagate and keep modal open
     * @param {Function} [options.onUndo]    - called after successful confirm
     *                                          if the caller wants to offer undo.
     *                                          modals-core does NOT know about
     *                                          the undo system.
     * @param {Function} [options.onRedo]    - passed through to onUndo when
     *                                          supported by the caller
     * @returns {{ element: HTMLElement, close: Function }}
     */
    function openPreviewModal(options) {
        if (_isMissing(options)) {
            options = {};
        } else if (typeof options !== 'object' || Array.isArray(options)) {
            throw new Error('openPreviewModal: options must be an object');
        }

        if (!_isMissing(options.consequences)) {
            _validateConsequences(options.consequences);
        }
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

        // The checkbox lives only inside this modal, so no global ID is
        // required. We use a class-based query and rely on the modal
        // container being scoped. No random ID generation.
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
            onOpen: function(modal) {
                var checkbox = modal.querySelector('.preview-confirm-checkbox');
                var confirmBtn = modal.querySelector('.modal-footer .confirm-btn');
                if (checkbox && confirmBtn) {
                    var update = function() {
                        confirmBtn.disabled = !checkbox.checked;
                    };
                    checkbox.addEventListener('change', update);
                    update();
                }
            },
            onConfirm: function() {
                // onConfirm exceptions propagate out of openModal's click
                // handler and keep the modal open. Undo is only offered
                // after a successful confirm.
                if (options.onConfirm) options.onConfirm();
                if (options.onUndo) {
                    options.onUndo(options.actionDescription, options.onRedo);
                }
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