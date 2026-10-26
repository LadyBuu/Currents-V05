/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD ORCHESTRATION (household-orchestration.js)
 * =============================================================================
 *
 * LOCATION: js/households/household-orchestration.js
 *
 * PURPOSE
 * -------
 * Shared helpers for household-domain ORCHESTRATORS — the modules that
 * coordinate household commands with cross-domain systems (family,
 * relationship, industry, residence) and produce a single save at the
 * end of a batch.
 *
 * This is NOT a domain module. It owns no state, no policy, no catalogs.
 * It provides:
 *
 *   - Result helpers:      ok, fail
 *   - Year resolution:     resolveYear
 *   - Event dispatch:      dispatch
 *   - Batch close:         finish
 *
 * WHAT THIS SOLVES
 * ----------------
 * household-assignment.js and household-servant.js each carried their
 * own copies of these helpers. The copies were small but they had drifted:
 *
 *   - household-assignment's _finish dispatched BEFORE persisting
 *     (which meant a subscriber could trigger another write before the
 *     first save), while household-servant's _finish dispatched BEFORE
 *     persisting too but with relationship-system persistence folded in.
 *
 *   - household-assignment's _resolveYear treated any non-number as
 *     null; household-servant's did the same.
 *
 *   - The result helpers were byte-identical.
 *
 * Centralising them removes the drift and gives us one place to change
 * the dispatch/persist ordering if we ever need to.
 *
 * ORDERING CONTRACT
 * -----------------
 *   _finish dispatches the event FIRST, then persists.
 *
 *   Rationale:
 *     Subscribers are allowed to read state during the event. Reading
 *     state during the event sees the post-mutation in-memory state
 *     (which is what the command produced). Persistence happens after
 *     the event so subscribers that trigger further writes get those
 *     writes included in the same save.
 *
 *   This was already the effective behavior for household-servant.
 *   household-assignment previously did the same (dispatch then persist)
 *   despite its header claiming otherwise. The canonical contract is
 *   now dispatch-then-persist, documented here once.
 *
 *   If a future subscriber must NOT observe pre-save state, they should
 *   subscribe to masterDataUpdated instead of the domain event.
 *
 * RELATIONSHIP-SYSTEM PERSISTENCE
 * -------------------------------
 *   This module's `finish` persists the household system only. It does
 *   NOT attempt to persist the relationship system.
 *
 *   household-servant.js wraps `finish` in its own
 *   `_finishWithRelationship` helper that calls this `finish` and then
 *   additionally persists the relationship system. That wrapper is
 *   servant-specific because only servant orchestrates into the
 *   relationship domain.
 *
 *   See household-servant.js's `_finish` for the merged shape.
 *
 * NOT FOR USE BY
 * --------------
 *   - household-commands.js  — commands own their own _commit; they
 *                              should NOT call this module.
 *   - household-queries.js   — queries do not mutate.
 *   - residence-system.js    — has its own _commit/persist pattern.
 *   - household-economy.js   — has its own _applyMutation for
 *                              patch-then-commit semantics.
 *
 *   This module is for ORCHESTRATORS that call multiple commands and
 *   then close the batch.
 *
 * DEPENDENCIES (REQUIRED at load):
 *   - time.js   (getCurrentYearSafe)
 *
 * DEPENDENCIES (OPTIONAL, checked at call time):
 *   - HouseholdCommands   (persist) — required for `finish`. If absent,
 *     `finish` returns a structured failure rather than throwing.
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

    function _requireFunction(name, fn) {
        if (typeof fn !== 'function') {
            throw new Error(
                'household-orchestration.js: ' + name + ' is required'
            );
        }
        return fn;
    }

    var _getCurrentYearSafe = _requireFunction(
        'getCurrentYearSafe (time.js)', window.getCurrentYearSafe
    );

    // =========================================================================
    // 1. RESULT HELPERS
    // =========================================================================

    /**
     * Builds a success result. If `data` is provided, it is attached
     * under the `data` key. If `data` is omitted or undefined, `data`
     * is `null`.
     *
     * @param {*} [data]
     * @returns {{success: true, data: *}}
     */
    function ok(data) {
        return { success: true, data: data === undefined ? null : data };
    }

    /**
     * Builds a failure result.
     *
     * @param {string} code       Short error code (INVALID_INPUT, NOT_FOUND).
     * @param {string} [reason]   Human-readable message. Defaults to `code`.
     * @param {Object} [extra]    Additional fields merged into the result
     *                            (partial, transferred, failures, ...).
     * @returns {{success: false, code: string, reason: string}}
     */
    function fail(code, reason, extra) {
        var result = { success: false, code: code, reason: reason || code };
        if (extra && typeof extra === 'object') {
            for (var k in extra) {
                if (Object.prototype.hasOwnProperty.call(extra, k)) {
                    result[k] = extra[k];
                }
            }
        }
        return result;
    }

    // =========================================================================
    // 2. YEAR RESOLUTION
    // =========================================================================

    /**
     * Resolves a year argument.
     *
     *   - undefined / null:     returns getCurrentYearSafe().
     *   - finite number:        returned as-is.
     *   - anything else:        returns null (caller must abort).
     *
     * The prior copies returned null for non-number input but did not
     * distinguish "caller forgot to pass" from "caller passed garbage".
     * This helper preserves that: only undefined/null trigger the
     * fallback, everything else must be a finite number.
     *
     * @param {*} value
     * @returns {number|null}
     */
    function resolveYear(value) {
        if (value === undefined || value === null) return _getCurrentYearSafe();
        if (typeof value !== 'number' || !isFinite(value)) return null;
        return value;
    }

    // =========================================================================
    // 3. EVENT DISPATCH
    // =========================================================================

    /**
     * Dispatches a CustomEvent on `window`. Never throws — if the event
     * system is unavailable (no CustomEvent constructor, no dispatchEvent
     * function, or a listener throws synchronously), the failure is
     * logged and the caller continues.
     *
     * @param {string} eventName
     * @param {Object} [payload]
     */
    function dispatch(eventName, payload) {
        if (typeof eventName !== 'string' || eventName.length === 0) return;
        if (typeof window === 'undefined') return;
        if (typeof window.dispatchEvent !== 'function') return;
        if (typeof window.CustomEvent !== 'function') return;

        try {
            window.dispatchEvent(new window.CustomEvent(eventName, {
                detail: payload || {}
            }));
        } catch (e) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    'household-orchestration: failed to dispatch ' +
                    eventName, e
                );
            }
        }
    }

    // =========================================================================
    // 4. BATCH FINISHER
    // =========================================================================

    /**
     * Closes an orchestration:
     *
     *   1. Dispatches the domain event so subscribers observe the change.
     *   2. Persists the household system.
     *   3. Returns a structured result.
     *
     * The event fires BEFORE the persist (see ORDERING CONTRACT in the
     * module header). This means a subscriber that reads state sees the
     * post-mutation in-memory state; a subscriber that writes state gets
     * its writes included in the same save.
     *
     * @param {string} eventName
     * @param {Object} [payload]
     * @returns {{success: true, data: {householdPersisted: boolean, reason: string|null}}
     *          | {success: false, code: string, reason: string, householdPersisted: boolean}}
     */
    function finish(eventName, payload) {
        dispatch(eventName, payload || {});

        var HC = window.HouseholdCommands;
        if (!HC || typeof HC.persist !== 'function') {
            return fail(
                'HOUSEHOLD_COMMANDS_UNAVAILABLE',
                'HouseholdCommands.persist is not available; batch not saved',
                { householdPersisted: false }
            );
        }

        var persistResult;
        try {
            persistResult = HC.persist();
        } catch (e) {
            return fail(
                'PERSIST_THREW',
                (e && e.message) ? e.message : 'persist threw',
                { householdPersisted: false }
            );
        }

        if (!persistResult || persistResult.success === false) {
            return fail(
                (persistResult && persistResult.code) || 'PERSIST_FAILED',
                (persistResult && persistResult.reason) || 'Failed to persist household state',
                { householdPersisted: false }
            );
        }

        return ok({
            householdPersisted: true,
            reason: null
        });
    }

    // =========================================================================
    // 5. HELPERS FOR COMMON VALIDATION
    // =========================================================================
    //
    // Small validators that orchestrators routinely inline. Extracted so
    // every orchestrator produces the same error code for the same
    // condition.

    /**
     * True if `v` is a non-empty string.
     */
    function hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    /**
     * True if `v` is a plain object (prototype is Object.prototype or
     * null). Arrays, Dates, Maps, Sets, and class instances are not
     * plain objects.
     */
    function isPlainObject(v) {
        if (v === null || typeof v !== 'object') return false;
        var proto = Object.getPrototypeOf(v);
        return proto === Object.prototype || proto === null;
    }

    /**
     * True if `v` is a finite number.
     */
    function isFiniteNumber(v) {
        return typeof v === 'number' && isFinite(v);
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.HouseholdOrchestration = {
        // Result helpers
        ok: ok,
        fail: fail,

        // Year resolution
        resolveYear: resolveYear,

        // Event dispatch
        dispatch: dispatch,

        // Batch close
        finish: finish,

        // Small validators
        hasId: hasId,
        isPlainObject: isPlainObject,
        isFiniteNumber: isFiniteNumber,

        // Diagnostics
        version: 1
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.HouseholdOrchestration;
    }

})();
