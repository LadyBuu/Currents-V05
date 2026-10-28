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
 * modals-residence-rental.js, modals-residence-staff.js) imports from
 * here.
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
 * `persistOrFail` is the shared "call HouseholdCommands.persist, warn on
 * failure, return {ok, reason}" wrapper. The household/economy modals use
 * it to close a batch.
 *
 * `persistResidenceOrFail` is the equivalent for ResidenceSystem.persist.
 * ResidenceSystem.persist returns `{ success, data }` / `{ success:
 * false, code, reason }` — a different shape from
 * HouseholdCommands.persist, which returns `{ success, data }` /
 * `{ success: false, code, reason }` too but is called by different
 * modals for different domains. Both are exposed here so residence
 * modals do not each carry their own local `_persistOrFail` copy.
 *
 * SHARED UI HELPERS
 * -----------------
 * `currentYear`, `closeThen`, and `confirmDialog` are the three patterns
 * every modal file re-implemented identically:
 *
 *   - currentYear(): every modal defined the same
 *     `typeof window.getCurrentYearSafe === 'function' ?
 *      window.getCurrentYearSafe() : null` two-liner.
 *   - closeThen(fn): every modal defined the same
 *     `_closeTopModal(); setTimeout(fn, 0)` pattern for "close this modal
 *     then open the next one".
 *   - confirmDialog(message, title, onConfirm, onCancel): the modals-core
 *     `confirmDialog` with a `window.confirm` fallback when modals-core
 *     is not loaded. Five copies of this fallback existed across the
 *     household modals.
 *
 * Each of these is now one canonical implementation, callable from any
 * household modal via `HouseholdModals.currentYear()` etc.
 *
 * SHARED STAFF / ROLE HELPERS
 * ---------------------------
 * `getRoleById` and `getAllRoles` are the "look up the role through
 * whichever role module is loaded" pattern (RoleState, RoleQueries, or
 * the flat window.getRoleById / window.getAllRoles). Both
 * modals-household-staff.js and modals-residence-staff.js defined
 * identical copies of these two helpers.
 *
 * `buildRoleOptions(selectedId, emptyLabel)` renders the `<option>` inner
 * HTML for a role select. Same two consumers, same shape.
 *
 * CANDIDATE LIST HELPERS
 * ----------------------
 * `renderStaffCandidates` and `wireStaffCandidateSelection` are the
 * shared implementation of the "staff member candidate list" that both
 * modals-household-staff.js and modals-residence-staff.js render. The
 * domain-specific parts (member source, position requirements) are
 * computed by the caller and passed in as a normalized candidate array.
 *
 * The candidate object shape is:
 *
 *     {
 *         characterId:  string,
 *         displayName:  string,
 *         age:          number|null,
 *         hasRole:      boolean,
 *         skillLevel:   number
 *     }
 *
 * DEPENDENCIES (REQUIRED):
 *   - HouseholdCommands (persist) — required for persistOrFail
 *   - formatting.js (escapeHtml) — required for escape
 *   - ui.js (showToast) — required for reportFailure
 *
 * DEPENDENCIES (OPTIONAL, checked at call time):
 *   - ResidenceSystem (persist) — required for persistResidenceOrFail
 *   - modals-core.js (confirmDialog, closeTopModal) — the fallbacks are
 *     local if absent, but the canonical implementation prefers them
 *   - RoleState / RoleQueries — for role lookups, falling back to flat
 *     window.getRoleById / window.getAllRoles
 *   - time.js (getCurrentYearSafe) — for currentYear()
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Added persistResidenceOrFail. The four residence modals
 *       (modals-residence.js, modals-residence-owner.js,
 *       modals-residence-rental.js, modals-residence-staff.js) each
 *       carried an identical local `_persistOrFail(messagePrefix)`
 *       wrapper that adapted ResidenceSystem.persist's
 *       { success, data } shape. That duplication is now this one
 *       function.
 *     - Added currentYear() and closeThen(fn) helpers. Every household
 *       modal file defined these inline.
 *     - Added confirmDialog helper. Five household modal files each
 *       carried the "window.confirmDialog if present, else
 *       window.confirm" fallback.
 *     - Added getRoleById, getAllRoles, buildRoleOptions. Two staff
 *       modals defined identical copies.
 *     - Added renderStaffCandidates and wireStaffCandidateSelection.
 *       Two staff modals defined ~150 lines of identical candidate
 *       rendering and selection wiring.
 *     - All additions are pure and depend only on the same required
 *       dependencies the module already needed. No behavioural change
 *       to any existing function.
 *   Previous revision:
 *     - rootFrom(handle) replaced _resolveModalRoot() to fix the
 *       cross-modal field collision documented above.
 *     - persistOrFail, reportFailure, and the toast wrappers added.
 *     - readValue / readInt / readIntOrNull / readChecked added.
 *     - onOpen added.
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
     * Calls ResidenceSystem.persist(), warns on failure, returns
     * { ok, reason }.
     *
     * ResidenceSystem.persist returns { success: true, data } |
     * { success: false, code, reason } — NOT a boolean. This wrapper
     * adapts that shape to { ok, reason } for the modal flows.
     *
     * Every residence modal previously carried an identical local copy
     * of this wrapper. That duplication is now this one function.
     *
     * If ResidenceSystem is not loaded, returns { ok: false, reason }
     * and shows an error toast — same fail-loud behaviour as
     * persistOrFail for a missing HouseholdCommands.
     *
     * @param {string} [messagePrefix]
     * @returns {{ok: boolean, reason?: string}}
     */
    function persistResidenceOrFail(messagePrefix) {
        var RS = window.ResidenceSystem;
        if (!RS || typeof RS.persist !== 'function') {
            _showToast(
                'Cannot persist: ResidenceSystem.persist is not available',
                'error'
            );
            return {
                ok: false,
                reason: 'ResidenceSystem.persist is not available'
            };
        }

        var result;
        try {
            result = RS.persist();
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
    // 6. YEAR / CLOSE / CONFIRM HELPERS
    // =========================================================================
    //
    // These three were copied verbatim into every household modal file.
    // They are now one canonical implementation each.

    /**
     * Returns the current simulation year, or null if time.js is not
     * loaded or does not expose getCurrentYearSafe.
     *
     * Delegates to window.getCurrentYearSafe. The household modals all
     * use getCurrentYearSafe (the deprecated alias in time.js) rather
     * than getCurrentYear because the household subsystem was written
     * against the alias. That reliance is documented in the household
     * audit; this helper centralizes it so a future migration to
     * getCurrentYear is a one-line change here.
     *
     * @returns {number|null}
     */
    function currentYear() {
        return (typeof window.getCurrentYearSafe === 'function')
            ? window.getCurrentYearSafe()
            : null;
    }

    /**
     * Closes the top modal, then defers `fn` to the next tick.
     *
     * This is the standard "open the next modal after this one closes"
     * pattern used throughout the household modals. The setTimeout(0)
     * lets the current modal's teardown (focus restore, listener
     * removal) complete before the next modal's openModal runs.
     *
     * If `fn` is not a function, this closes the modal and does nothing
     * else — safe to call as a plain close.
     *
     * @param {Function} [fn]
     */
    function closeThen(fn) {
        if (typeof window.closeTopModal === 'function') {
            window.closeTopModal();
        }
        if (typeof fn === 'function') {
            setTimeout(fn, 0);
        }
    }

    /**
     * Shows a confirm dialog. Prefers modals-core.js's confirmDialog;
     * falls back to window.confirm when modals-core is not loaded.
     *
     * The fallback semantics match modals-core: onConfirm fires only
     * when the user confirms; onCancel fires only when the user
     * cancels. Both callbacks are optional.
     *
     * @param {string} message
     * @param {string} title
     * @param {Function} [onConfirm]
     * @param {Function} [onCancel]
     */
    function confirmDialog(message, title, onConfirm, onCancel) {
        if (typeof window.confirmDialog === 'function') {
            return window.confirmDialog(message, title, onConfirm, onCancel);
        }
        if (typeof window._confirmDialog === 'function') {
            return window._confirmDialog(message, title, onConfirm, onCancel);
        }
        // Fallback: native window.confirm when modals-core.js is not
        // loaded (e.g., a bare test harness).
        if (window.confirm(message)) {
            if (typeof onConfirm === 'function') onConfirm();
        } else {
            if (typeof onCancel === 'function') onCancel();
        }
    }

    // =========================================================================
    // 7. ROLE LOOKUPS AND OPTIONS
    // =========================================================================
    //
    // Two staff modals (modals-household-staff.js and
    // modals-residence-staff.js) defined identical getRoleById /
    // getAllRoles / buildRoleOptions helpers. They are now here.

    /**
     * Resolves a role record by id, through whichever role module is
     * loaded:
     *
     *   1. window.getRoleById            (flat alias)
     *   2. window.RoleQueries.getRoleById
     *
     * Returns null when neither is present, or when the id does not
     * resolve to a role.
     *
     * @param {string} id
     * @returns {Object|null}
     */
    function getRoleById(id) {
        if (!id) return null;
        if (typeof window.getRoleById === 'function') {
            return window.getRoleById(id);
        }
        if (typeof window.RoleQueries !== 'undefined'
            && typeof window.RoleQueries.getRoleById === 'function') {
            return window.RoleQueries.getRoleById(id);
        }
        return null;
    }

    /**
     * Returns every role, through whichever role module is loaded:
     *
     *   1. window.RoleState.getAllRoles       (state owns the collection)
     *   2. window.RoleQueries.getAllRoles     (queries alias it)
     *
     * Returns [] when neither is present.
     *
     * @returns {Array}
     */
    function getAllRoles() {
        if (typeof window.RoleState !== 'undefined'
            && typeof window.RoleState.getAllRoles === 'function') {
            return window.RoleState.getAllRoles();
        }
        if (typeof window.RoleQueries !== 'undefined'
            && typeof window.RoleQueries.getAllRoles === 'function') {
            return window.RoleQueries.getAllRoles();
        }
        return [];
    }

    /**
     * Renders the `<option>` inner HTML for a role select.
     *
     * The empty option is prepended with the caller-supplied label (or
     * "No role required"). Each role's label carries its icon (if any),
     * name, and category.
     *
     * @param {string|null} selectedId - role id to preselect
     * @param {string} [emptyLabel]    - default "No role required"
     * @returns {string}
     */
    function buildRoleOptions(selectedId, emptyLabel) {
        emptyLabel = emptyLabel || 'No role required';
        var html = '<option value="">' + esc(emptyLabel) + '</option>';
        var roles = getAllRoles();
        if (!Array.isArray(roles)) return html;

        for (var i = 0; i < roles.length; i++) {
            var r = roles[i];
            if (!r || !r.id) continue;
            var selected = (r.id === selectedId) ? ' selected' : '';
            var icon = '';
            if (window.Icons) {
                var iconKey = r.iconKey || r.icon;
                if (iconKey && window.Icons[iconKey]) {
                    icon = window.Icons[iconKey];
                }
            }
            var category = r.category || 'Uncategorized';
            var label = (icon ? icon + ' ' : '') + (r.name || 'Unnamed') +
                ' (' + category + ')';
            html += '<option value="' + esc(r.id) + '"' + selected + '>' +
                esc(label) + '</option>';
        }
        return html;
    }

    // =========================================================================
    // 8. STAFF CANDIDATE LIST
    // =========================================================================
    //
    // Two staff modals (modals-household-staff.js and
    // modals-residence-staff.js) rendered structurally identical
    // candidate lists and wired identical selection handlers. The
    // domain-specific parts (member source, position requirements) are
    // the caller's job — they compute a normalized candidate array and
    // pass it in.
    //
    // Candidate shape (normalized):
    //
    //   {
    //       characterId:  string,
    //       displayName:  string,
    //       age:          number|null,
    //       hasRole:      boolean,
    //       skillLevel:   number
    //   }
    //
    // `position` carries `requiredRoleId` (string|null) so the renderer
    // knows whether to show the role indicator.

    /**
     * Renders the candidate list. Returns inner HTML for the container.
     *
     * @param {Array} candidates
     * @param {{requiredRoleId?: string|null}} [position]
     * @returns {string}
     */
    function renderStaffCandidates(candidates, position) {
        if (!Array.isArray(candidates) || candidates.length === 0) {
            return '<div style="color:var(--dim);text-align:center;padding:20px;font-size:0.6rem;">' +
                'No available characters' +
                '</div>';
        }

        var requiredRoleId = position && position.requiredRoleId
            ? position.requiredRoleId
            : null;

        var html = '<div style="max-height:250px;overflow-y:auto;">';
        for (var i = 0; i < candidates.length; i++) {
            var c = candidates[i];
            if (!c || !c.characterId) continue;

            var roleIndicator = requiredRoleId
                ? (c.hasRole
                    ? '<span style="font-size:0.45rem;color:var(--success);">has role</span>'
                    : '<span style="font-size:0.45rem;color:var(--warn);">missing role</span>')
                : '';
            var skillText = (typeof c.skillLevel === 'number' && c.skillLevel > 0)
                ? '<span style="font-size:0.45rem;color:var(--accent);">(Skill: ' +
                    c.skillLevel + ')</span>'
                : '';
            var ageText = (c.age !== null && c.age !== undefined)
                ? ' <span style="font-size:0.5rem;color:var(--dim);">' +
                    c.age + 'y</span>'
                : '';

            var borderColor = (requiredRoleId && !c.hasRole)
                ? 'var(--warn)'
                : 'var(--success)';

            html += '<div class="staff-candidate" data-character-id="' +
                esc(c.characterId) +
                '" style="padding:8px 10px;margin-bottom:4px;background:var(--bg2);' +
                'border:1px solid var(--border);border-left:3px solid ' +
                borderColor + ';border-radius:4px;cursor:pointer;' +
                'transition:background 0.1s;">' +
                '<div>' +
                    '<strong>' + esc(c.displayName || '') + '</strong>' +
                    ageText +
                    ' ' + roleIndicator + ' ' + skillText +
                '</div>' +
                '</div>';
        }
        html += '</div>';
        return html;
    }

    /**
     * Wires click handlers on the candidate list rendered by
     * renderStaffCandidates, plus (optionally) the "Select Other
     * Character" button.
     *
     * `root` must be the modal root element. `onSelectOther` is an
     * optional callback invoked when the "select other" button is
     * clicked. It is the caller's responsibility to open the character
     * selector and re-open this modal or pre-fill the field.
     *
     * @param {HTMLElement} root
     * @param {Object} [options]
     * @param {Function} [options.onSelectOther]
     */
    function wireStaffCandidateSelection(root, options) {
        if (!root) return;
        options = options || {};

        var candidates = root.querySelectorAll('.staff-candidate');
        for (var i = 0; i < candidates.length; i++) {
            (function(el) {
                el.onclick = function() {
                    var all = root.querySelectorAll('.staff-candidate');
                    for (var j = 0; j < all.length; j++) {
                        all[j].classList.remove('selected');
                        all[j].style.background = 'var(--bg2)';
                        all[j].style.borderColor = 'var(--border)';
                    }
                    el.classList.add('selected');
                    el.style.background = 'rgba(var(--accent-rgb), 0.15)';
                    el.style.borderColor = 'var(--accent)';
                };
                el.onmouseenter = function() {
                    if (!el.classList.contains('selected')) {
                        el.style.background = 'var(--bg3)';
                    }
                };
                el.onmouseleave = function() {
                    if (!el.classList.contains('selected')) {
                        el.style.background = 'var(--bg2)';
                    }
                };
            })(candidates[i]);
        }

        var otherBtn = root.querySelector('[data-action="select-other"]');
        if (otherBtn && typeof options.onSelectOther === 'function') {
            otherBtn.onclick = function() { options.onSelectOther(); };
        }
    }

    /**
     * Builds the "recent history" HTML block used in both staff modals.
     * Each entry is the last N assignments for a position, sorted newest
     * first.
     *
     * @param {Array} history
     * @param {number} [limit] - default 5
     * @param {Function} [resolveRoleName] - (roleId) -> string|null.
     *   Defaults to using getRoleById.
     * @param {Function} [resolveName] - (entry) -> string. Defaults to
     *   entry.characterName / entry.title.
     * @returns {string} inner HTML or '' when history is empty
     */
    function buildRecentAssignmentHistory(history, limit, resolveRoleName, resolveName) {
        if (!history || history.length === 0) return '';
        limit = typeof limit === 'number' ? limit : 5;

        var sorted = history.slice().sort(function(a, b) {
            return (b.startYear || 0) - (a.startYear || 0);
        });
        var recent = sorted.slice(0, limit);

        var html = '<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border);">';
        html += '<div style="font-size:0.65rem;color:var(--accent);margin-bottom:8px;">Recent History</div>';
        html += '<div style="max-height:120px;overflow-y:auto;background:var(--bg3);border-radius:6px;padding:8px;">';

        for (var i = 0; i < recent.length; i++) {
            var h = recent[i];
            var endDisplay = (h.endYear !== null && h.endYear !== undefined)
                ? h.endYear : 'Present';
            var color = !h.endYear ? 'var(--success)' : 'var(--dim)';
            var roleName = null;
            if (h.roleIdAtAssignment) {
                if (typeof resolveRoleName === 'function') {
                    roleName = resolveRoleName(h.roleIdAtAssignment);
                } else {
                    var roleRecord = getRoleById(h.roleIdAtAssignment);
                    roleName = roleRecord ? roleRecord.name : null;
                }
            }
            var nameText = typeof resolveName === 'function'
                ? resolveName(h)
                : (h.characterName || h.title || 'Unknown');

            html += '<div style="display:flex;justify-content:space-between;' +
                'padding:4px 0;border-bottom:1px solid var(--border-light);' +
                'font-size:0.6rem;">' +
                '<span>' + esc(nameText) +
                    (roleName
                        ? ' <span style="color:var(--accent);">(' +
                            esc(roleName) + ')</span>'
                        : '') +
                '</span>' +
                '<span style="color:' + color + ';">' +
                    h.startYear + ' - ' + endDisplay +
                '</span>' +
            '</div>';
        }

        html += '</div></div>';
        return html;
    }

    // =========================================================================
    // 9. VALIDATION HELPERS
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
    // 10. EXPORTS
    // =========================================================================

    window.HouseholdModals = {
        // DOM scope
        rootFrom: rootFrom,

        // Persist / toast
        persistOrFail: persistOrFail,
        persistResidenceOrFail: persistResidenceOrFail,
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

        // Year / close / confirm
        currentYear: currentYear,
        closeThen: closeThen,
        confirmDialog: confirmDialog,

        // Roles
        getRoleById: getRoleById,
        getAllRoles: getAllRoles,
        buildRoleOptions: buildRoleOptions,

        // Staff candidate list
        renderStaffCandidates: renderStaffCandidates,
        wireStaffCandidateSelection: wireStaffCandidateSelection,
        buildRecentAssignmentHistory: buildRecentAssignmentHistory,

        // Validation
        hasId: hasId,
        isFiniteNumber: isFiniteNumber,

        // Diagnostics
        version: 2
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.HouseholdModals;
    }

})();
