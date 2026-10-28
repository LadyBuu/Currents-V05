/**
 * =============================================================================
 * STILL WATERS - LOCATION MODALS HELPER (modals-location-helper.js)
 * =============================================================================
 *
 * LOCATION: js/location/modals-location-helper.js
 *
 * PURPOSE
 * -------
 * Shared helpers for the location / moves modal files. This module
 * exists so modals-location.js and modals-moves.js (and any future
 * location-modal file) don't each carry their own copy of "how do I
 * escape a string", "how do I toast", "how do I close", and "how do I
 * run a command and persist once on success".
 *
 * Prior to this revision, both modals-location.js and modals-moves.js
 * defined four byte-identical helpers:
 *
 *   _escapeHtml(str)   — window.escapeHtml with a hand-rolled fallback
 *   _toast(msg, type)  — window.showToast, no-op if absent
 *   _close()           — window.closeTopModal
 *   _runCommand(fn, onSuccess, options)
 *                      — invoke, then persist on success, toast on
 *                        failure, close unless keepOpen
 *
 * That is ~60 lines duplicated across two files. Consolidating here
 * gives one canonical implementation. The household domain already
 * did this with modals-helper.js; the location domain mirrors the
 * same shape.
 *
 * WHY NOT REUSE HouseholdModals
 * -----------------------------
 * The household helper (js/households/modals-helper.js) is
 * household-specific: it wires persistOrFail to HouseholdCommands,
 * persistResidenceOrFail to ResidenceSystem, getRoleById to RoleQueries,
 * etc. The location modal helper needs none of that. Its only domain-
 * specific dependency is LocationCommands.persist, which it wraps in
 * its own runCommand. Sharing across domains would either pull
 * household concerns into the location domain or parameterize the
 * persist function, which is indirection without benefit — the two
 * helpers serve unrelated domains and their callers never overlap.
 *
 * The two helpers that ARE domain-agnostic (escapeHtml and toast) are
 * not worth extracting into core: they already delegate to
 * formatting.js and ui.js respectively, and the fallbacks exist for
 * bare test harnesses. Adding a third `modals-core-helper.js` for two
 * twelve-line functions would create more indirection than it removes.
 *
 * PERSIST CONTRACT
 * ----------------
 * runCommand invokes the supplied command function, then on success
 * calls LocationCommands.persist() exactly once. On any failure —
 * command throws, command returns { success: false }, persist throws,
 * or persist returns { success: false } — it shows an error toast and
 * returns false. No partial commit is reported as success.
 *
 * This matches the PERSIST CONTRACT documented in location-commands.js
 * (Pattern A from storage.js): saveMasterData returns a boolean and
 * does not throw; the boolean must be inspected. LocationCommands.
 * persist() encapsulates that inspection and returns { success,
 * reason? }. This helper inspects persist's result and surfaces the
 * reason as a toast on failure.
 *
 * CALLBACK CONTRACT
 * -----------------
 * runCommand(commandFn, onSuccess, options):
 *
 *   commandFn    () -> { success, reason?, ... }
 *                Invoked exactly once. If it throws, the exception is
 *                caught and toasted; onSuccess is not called.
 *
 *   onSuccess    (result) -> void
 *                Invoked with the command's result AFTER a successful
 *                persist, and BEFORE the modal is closed (if the
 *                command didn't ask to keep it open). Optional.
 *
 *   options      { keepOpen?: boolean }
 *                When keepOpen is true, the modal is not closed after
 *                a successful command. Default: false (close).
 *                Note: options.keepOpen does NOT suppress persist.
 *                persist always runs on success.
 *
 * All four callbacks are isolated: a throw in onSuccess is logged and
 * swallowed. The modal closes regardless. That matches the intent —
 * onSuccess is a notification, not a step in the close sequence.
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Initial extraction. Consolidates _escapeHtml, _toast, _close,
 *       and _runCommand from modals-location.js and modals-moves.js.
 *       Both files keep the same call sites (var _escapeHtml =
 *       _Modals.escapeHtml; etc.) so no behavioural change in either
 *       caller.
 *   Prior state:
 *     - Duplicate definitions existed in each modal file.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY GUARDS
    // =========================================================================

    function _requireFunction(name, fn) {
        if (typeof fn !== 'function') {
            throw new Error('modals-location-helper.js: ' + name + ' is required');
        }
        return fn;
    }

    // LocationCommands.persist is required at load time. It is the ONLY
    // domain-specific dependency of runCommand; without it, the modal
    // layer cannot persist anything.
    if (typeof window.LocationCommands === 'undefined'
        || window.LocationCommands === null) {
        throw new Error(
            'modals-location-helper.js: location-commands.js must load ' +
            'first (window.LocationCommands missing).'
        );
    }
    _requireFunction(
        'LocationCommands.persist',
        window.LocationCommands.persist
    );

    // =========================================================================
    // 1. HTML ESCAPE
    // =========================================================================

    /**
     * Escapes a value for HTML interpolation.
     *
     * Prefers window.escapeHtml (from formatting.js). Falls back to a
     * hand-rolled escape when formatting.js is not loaded (bare test
     * harness). The fallback produces the same output as formatting.js
     * for the five characters HTML treats specially.
     *
     * @param {*} str - coerced to string; null/undefined -> ''
     * @returns {string}
     */
    function escapeHtml(str) {
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(str);
        }
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // =========================================================================
    // 2. TOAST
    // =========================================================================

    /**
     * Shows a toast. No-op if ui.js is not loaded.
     *
     * The optional-dependency behaviour is deliberate: a bare test
     * harness can load the location modal files without ui.js, and the
     * commands still work. The toast is a notification, not a
     * correctness requirement.
     *
     * @param {string} msg
     * @param {string} [type] - 'info' | 'success' | 'warning' | 'error'
     */
    function toast(msg, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, type || 'info');
        }
    }

    // =========================================================================
    // 3. CLOSE
    // =========================================================================

    /**
     * Closes the top modal. No-op if modals-core.js is not loaded.
     *
     * Same optional-dependency reasoning as toast.
     */
    function close() {
        if (typeof window.closeTopModal === 'function') {
            window.closeTopModal();
        }
    }

    // =========================================================================
    // 4. RUN COMMAND + PERSIST
    // =========================================================================

    /**
     * Runs a command, then persists on success. Toasts on failure.
     * Closes the modal on success (unless options.keepOpen is true).
     *
     * Contract (see CALLBACK CONTRACT in the module header):
     *   - commandFn is invoked exactly once.
     *   - On command failure: toast, return false, no persist.
     *   - On command success: persist once.
     *       - persist failure: toast, return false, do NOT close.
     *       - persist success: close (unless keepOpen), call onSuccess,
     *         return true.
     *   - Exceptions anywhere are caught and toasted.
     *   - A throw in onSuccess is logged and swallowed; the modal has
     *     already closed.
     *
     * The two-step check (command then persist) is what makes the
     * pattern safe: a command that mutated memory but failed to persist
     * returns false, so the caller knows the change is not durable.
     * That matches location-commands.js's Pattern A persist contract.
     *
     * @param {Function} commandFn - () -> { success, reason?, ... }
     * @param {Function} [onSuccess] - (result) -> void
     * @param {Object} [options]
     * @param {boolean} [options.keepOpen] - default false
     * @returns {boolean} true iff both the command AND persist succeeded
     */
    function runCommand(commandFn, onSuccess, options) {
        options = options || {};

        if (typeof commandFn !== 'function') {
            toast('Internal error: command function is required', 'error');
            return false;
        }

        // ---- Step 1: command ----
        var result;
        try {
            result = commandFn();
        } catch (e) {
            toast(
                e && e.message ? e.message : 'Command failed',
                'error'
            );
            return false;
        }

        if (!result || result.success !== true) {
            toast(
                result && result.reason ? result.reason : 'Command failed',
                'error'
            );
            return false;
        }

        // ---- Step 2: persist ----
        var persistResult;
        try {
            persistResult = window.LocationCommands.persist();
        } catch (e) {
            toast(
                e && e.message ? e.message : 'Failed to persist changes',
                'error'
            );
            return false;
        }

        if (!persistResult || persistResult.success !== true) {
            toast(
                persistResult && persistResult.reason
                    ? persistResult.reason
                    : 'Failed to persist changes',
                'error'
            );
            return false;
        }

        // ---- Step 3: close (unless keepOpen) ----
        if (options.keepOpen !== true) {
            close();
        }

        // ---- Step 4: notify ----
        if (typeof onSuccess === 'function') {
            try {
                onSuccess(result);
            } catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error(
                        'modals-location-helper.js: onSuccess threw:', e
                    );
                }
            }
        }

        return true;
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.LocationModals = window.LocationModals || {};

    // Attach to the existing LocationModals namespace (modals-location.js
    // installs it with the modal entry points). This file adds the
    // shared helpers under the same namespace so callers can reach both
    // from one place:
    //
    //   window.LocationModals.openAddPlaceModal(...)
    //   window.LocationModals.escapeHtml(...)
    //   window.LocationModals.toast(...)
    //   window.LocationModals.close()
    //   window.LocationModals.runCommand(...)
    //
    // modals-moves.js uses the same namespace for its own entry points
    // (MovesModals) but reaches the helpers via LocationModals.
    window.LocationModals.escapeHtml = escapeHtml;
    window.LocationModals.toast = toast;
    window.LocationModals.close = close;
    window.LocationModals.runCommand = runCommand;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            escapeHtml: escapeHtml,
            toast: toast,
            close: close,
            runCommand: runCommand
        };
    }

})();
