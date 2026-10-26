/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD MODALS HELPER (modals-helper.js)
 * =============================================================================
 *
 * LOCATION: js/households/modals-helper.js
 *
 * PURPOSE
 * -------
 * Shared helpers for the household / residence modal files. This module
 * exists so the nine modal files that consume it don't each carry their
 * own copy of "how do I find the modal's DOM root", "how do I persist
 * or warn", "how do I escape a string", "how do I read an integer out of
 * an <input>", and "how do I wire on-open wiring".
 *
 * Every modal file in the household subsystem (modals-household.js,
 * modals-household-economy.js, modals-household-snapshot.js,
 * modals-household-staff.js, modals-residence.js, modals-residence-owner.js,
 * modals-residence-rental.js, modals-residence-staff.js) imports from here.
 *
 * THE DOM-SCOPE FIX
 * -----------------
 * The previous modals relied on `_resolveModalRoot()` which did:
 *
 *     return document.querySelector('[data-modal-root="top"]') ||
 *            document.querySelector('.modal-root:last-of-type') ||
 *            document.body;
 *
 * `modals-core.js` (the canonical openModal) does not emit either of the
 * first two selectors. It uses `.modal` and `.modal-container` inside a
 * newly-created `<div class="modal">` appended to `document.body`. So
 * `_resolveModalRoot()` always fell through to `document.body`.
 *
 * The consequence: `document.body.querySelector('[data-field="name"]')`
 * searches the ENTIRE DOCUMENT, not the modal. With two modals open at
 * once (e.g., household details → edit household), the second modal's
 * `[data-field="name"]` and the first modal's `[data-field="name"]` both
 * exist in the DOM. `querySelector` returns the FIRST match — the wrong
 * one. Edits went to the wrong modal.
 *
 * This module's `rootFrom(handle)` resolves the correct root:
 *
 *     handle.element     — the <div class="modal"> that openModal
 *                          created and returned. ALWAYS scope to this.
 *
 * openModal returns `{ element, close }`. Every household modal captures
 * that handle. `rootFrom(handle)` returns `handle.element` and
 * `rootFrom(null)` returns `null` (never `document.body`).
 *
 * WHY THE null RETURN IS CORRECT
 * ------------------------------
 * A caller that passes null handle has a bug — they didn't capture the
 * return value of openModal. Returning `document.body` would hide the bug
 * by making the modal appear to work (while scanning the whole document);
 * returning `null` makes the bug visible (the modal's onConfirm crashes
 * with a clear null error). Fail loud.
 *
 * PERSIST CONTRACT
 * ----------------
 * `persistOrFail` is the shared "call persist, warn on failure, return
 * {ok, reason}" wrapper. The household/economy modals use it to close a
 * batch. The residence modals use the equivalent on ResidenceSystem —
 * which the current file does NOT cover (ResidenceSystem.persist has
 * different semantics: it returns `{success, data}` not a boolean, and
 * the residence modals call it directly). A future Prompt 43 pass could
 * unify those; for now persistOrFail covers the HouseholdCommands case
 * only and the residence modals keep their local wrappers.
 *
 * DEPENDENCIES (REQUIRED):
 *   - HouseholdCommands (persist) — required for persistOrFail
 *   - formatting.js (escapeHtml) — required for escape
 *   - ui.js (showToast) — required for reportFailure
 *
 * DEPENDENCIES (OPTIONAL):
 *   - HouseholdViewModels — no hard dependency here. Modals that need
 *     badge / color / status-label helpers import HouseholdViewModels
 *     directly.
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

    function _requireFunction(name, fn) {
        if (typeof fn !== 'function') {
            throw new Error(
                'modals-helper.js: ' + name + ' is required'
            );
        }
        return fn;
    }

    var _escapeHtml = _requireFunction(
        'escapeHtml (formatting.js)', window.escapeHtml
    );
    var _showToast = _requireFunction(
        'showToast (ui.js)',
        typeof window.showToast === 'function'
            ? window.showToast
            : window._showToast
    );

    // =========================================================================
    // 1. DOM SCOPE
    // =========================================================================

    /**
     * Returns the modal root element for a handle returned by openModal.
     *
     *   handle:  { element: HTMLElement, close: Function }
     *
     *   Returns handle.element. Returns null if handle is missing or
     *   malformed.
     *
     * This REPLACES every call to _resolveModalRoot() in the previous
     * modal files. The prior helper scanned document.body when the
     * specific selector was absent, which caused cross-modal field
     * collisions when two modals were open at once.
     *
     * @param {{element?: HTMLElement}|null} handle
     * @returns {HTMLElement|null}
     */
    function rootFrom(handle) {
        if (!handle) return null;
        if (!handle.element) return null;
        if (typeof handle.element.querySelector !== 'function') return null;
        return handle.element;
    }

    // =========================================================================
    // 2. PERSIST / TOAST HELPERS
    // =========================================================================

    /**
     * Calls HouseholdCommands.persist(), warns on failure, returns
     * { ok, reason }.
     *
     * On success: { ok: true }
     * On failure: { ok: false, reason } and shows an error toast.
     *
     * @param {string} [messagePrefix] - prepended to the error toast
     * @returns {{ok: boolean, reason?: string}}
     */
    function persistOrFail(messagePrefix) {
        var HC = window.HouseholdCommands;
        if (!HC || typeof HC.persist !== 'function') {
            _showToast(
                'Cannot persist: HouseholdCommands.persist is not available',
                'error'
            );
            return {
                ok: false,
                reason: 'HouseholdCommands.persist is not available'
            };
        }

        var result;
        try {
            result = HC.persist();
        } catch (e) {
            var threwReason = (e && e.message) ? e.message : 'persist threw';
            _showToast(
                (messagePrefix || 'Changes made') +
                ' but could not save: ' + threwReason,
                'error'
            );
            return { ok: false, reason: threwReason };
        }

        if (!result || result.success === false) {
            var reason = (result && result.reason) || 'Unknown persist error';
            _showToast(
                (messagePrefix || 'Changes made') +
                ' but could not save: ' + reason,
                'error'
            );
            return { ok: false, reason: reason };
        }

        return { ok: true };
    }

    /**
     * Reports a command failure as an error toast.
     *
     * @param {{success: boolean, reason?: string}|null} result
     * @param {string} [fallbackPrefix] - used when result has no reason
     */
    function reportFailure(result, fallbackPrefix) {
        var reason = (result && result.reason) || 'Unknown error';
        _showToast(
            (fallbackPrefix || 'Operation failed') + ': ' + reason,
            'error'
        );
    }

    /**
     * Shows a success toast.
     *
     * @param {string} message
     */
    function showSuccess(message) {
        _showToast(message, 'success');
    }

    /**
     * Shows a warning toast.
     *
     * @param {string} message
     */
    function showWarning(message) {
        _showToast(message, 'warning');
    }

    /**
     * Shows an informational toast.
     *
     * @param {string} message
     */
    function showInfo(message) {
        _showToast(message, 'info');
    }

    /**
     * Shows an error toast.
     *
     * @param {string} message
     */
    function showError(message) {
        _showToast(message, 'error');
    }

    // =========================================================================
    // 3. ESCAPE
    // =========================================================================

    /**
     * HTML-escapes a value. Delegates to formatting.js.
     *
     * @param {*} value
     * @returns {string}
     */
    function esc(value) {
        return _escapeHtml(value);
    }

    // =========================================================================
    // 4. INPUT PARSING
    // =========================================================================

    /**
     * Reads the trimmed string value of the first element matching
     * `selector` within `root`. Returns '' when root is null, the element
     * is missing, or the value is not a string.
     *
     * @param {HTMLElement|null} root
     * @param {string} selector
     * @returns {string}
     */
    function readValue(root, selector) {
        if (!root) return '';
        var el = root.querySelector(selector);
        if (!el) return '';
        if (typeof el.value !== 'string') return '';
        return el.value;
    }

    /**
     * Reads an integer out of the first element matching `selector`.
     * Returns `fallback` when the value is empty, non-numeric, or the
     * element is missing.
     *
     * Note: returns fallback on `''` (empty string). For callers that
     * need to distinguish "empty" from "invalid", use readIntOrNull.
     *
     * @param {HTMLElement|null} root
     * @param {string} selector
     * @param {number|null} [fallback] - default null
     * @returns {number|null}
     */
    function readInt(root, selector, fallback) {
        var el = root ? root.querySelector(selector) : null;
        if (!el) return fallback !== undefined ? fallback : null;
        var raw = String(el.value).trim();
        if (raw === '') return fallback !== undefined ? fallback : null;
        var n = Number(raw);
        if (!isFinite(n)) return fallback !== undefined ? fallback : null;
        return Math.floor(n);
    }

    /**
     * Reads an integer or returns null. Distinguishes "empty input" (null)
     * from "invalid input" (also null — callers that need strictness must
     * validate separately).
     *
     * The point of this helper vs readInt: readInt fills a fallback when
     * empty. readIntOrNull lets the caller treat "" as explicitly missing.
     *
     * @param {HTMLElement|null} root
     * @param {string} selector
     * @returns {number|null}
     */
    function readIntOrNull(root, selector) {
        var el = root ? root.querySelector(selector) : null;
        if (!el) return null;
        var raw = String(el.value).trim();
        if (raw === '') return null;
        var n = Number(raw);
        if (!isFinite(n)) return null;
        return Math.floor(n);
    }

    /**
     * Reads a checkbox's checked state. Returns false when the element is
     * missing.
     *
     * @param {HTMLElement|null} root
     * @param {string} selector
     * @returns {boolean}
     */
    function readChecked(root, selector) {
        var el = root ? root.querySelector(selector) : null;
        if (!el) return false;
        return el.checked === true;
    }

    // =========================================================================
    // 5. ON-OPEN WIRING
    // =========================================================================
    //
    // The household modals do a second wiring step after the modal is
    // attached to the DOM — attaching click handlers, populating selects
    // from data, hooking onchange listeners. The previous pattern was:
    //
    //     setTimeout(_attachOnOpen(function(root) { ... }), 0);
    //
    // ...which deferred the wiring by one tick. That was a workaround for
    // `modals-core.js` returning the handle before the DOM was appended.
    //
    // In the current modals-core, `openModal` returns AFTER appending the
    // modal to the DOM. So the setTimeout is no longer necessary — the
    // caller can wire synchronously against `handle.element`.
    //
    // `onOpen(handle, fn)` supports both patterns:
    //   - If `fn` is synchronous and `handle.element` is available, calls
    //     it immediately.
    //   - If `handle.element` is null (missing handle), skips silently.
    //
    // Callers that still need a deferred hook (e.g., waiting for a
    // subsynchronous UI to settle) can pass `{ defer: true }`.

    /**
     * Runs `fn(root)` against the modal root.
     *
     * @param {{element?: HTMLElement}|null} handle
     * @param {Function} fn - receives the modal root element
     * @param {Object} [options]
     * @param {boolean} [options.defer] - if true, defers to a 0ms timeout
     * @returns {*} the return value of fn if synchronous, or undefined if deferred
     */
    function onOpen(handle, fn, options) {
        if (typeof fn !== 'function') return undefined;
        options = options || {};
        var root = rootFrom(handle);
        if (!root) return undefined;

        if (options.defer === true) {
            setTimeout(function() {
                var deferredRoot = rootFrom(handle);
                if (deferredRoot) fn(deferredRoot);
            }, 0);
            return undefined;
        }

        return fn(root);
    }

    // =========================================================================
    // 6. VALIDATION HELPERS
    // =========================================================================

    /**
     * True if `v` is a non-empty string.
     */
    function hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    /**
     * True if `v` is a finite number.
     */
    function isFiniteNumber(v) {
        return typeof v === 'number' && isFinite(v);
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.HouseholdModals = {
        // DOM scope
        rootFrom: rootFrom,

        // Persist / toast
        persistOrFail: persistOrFail,
        reportFailure: reportFailure,
        showSuccess: showSuccess,
        showWarning: showWarning,
        showInfo: showInfo,
        showError: showError,

        // Escape
        esc: esc,

        // Input parsing
        readValue: readValue,
        readInt: readInt,
        readIntOrNull: readIntOrNull,
        readChecked: readChecked,

        // On-open wiring
        onOpen: onOpen,

        // Validation
        hasId: hasId,
        isFiniteNumber: isFiniteNumber,

        // Diagnostics
        version: 1
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.HouseholdModals;
    }

})();
