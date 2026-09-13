/**
 * =============================================================================
 * STILL WATERS - MAINTENANCE SCHEDULER (maintenance.js)
 * =============================================================================
 *
 * LOCATION: js/core/maintenance.js
 *
 * SCOPE:
 *   - Periodic integrity audit scheduling
 *   - Deciding whether an audit is due
 *   - Orchestrating audit-then-repair for the whole canonical dataset
 *   - Recording when the last successful audit cycle ran
 *
 * OUT OF SCOPE:
 *   - Integrity detection and repair logic → integrity.js
 *   - Persistence → storage.js
 *   - Cache invalidation → mutation boundary
 *   - UI feedback and human-readable time strings → presentation layer
 *   - User-triggered audits → caller decides when to invoke
 *
 * CONTRACT:
 *   - autoAudit() returns a result describing what happened. It does not
 *     show UI or prompt the user.
 *   - autoAudit() distinguishes "scheduler ran" (ran: true) from "audit
 *     cycle completed successfully" (success: true). An audit that runs
 *     and fails is { ran: true, success: false }.
 *   - When repairs occur, the module marks the data dirty so the
 *     persistence boundary saves. If markDataDirty is not available AND
 *     repairs occurred, the module throws — silent loss of repairs is
 *     not an acceptable failure mode.
 *   - The last-audit timestamp is only updated after a successful cycle,
 *     including handing changed data to the persistence boundary.
 *   - The persistence boundary is responsible for cache invalidation.
 *     repairAllData() must participate in that boundary so downstream
 *     reads do not observe stale caches. Maintenance does NOT invalidate
 *     caches itself.
 *   - markDataDirty() is a mutation-boundary notification, not a
 *     durability guarantee. autoAudit() returns before the save is
 *     necessarily durable. This is intentional.
 *   - Timestamps are local scheduler metadata, not canonical application
 *     data. They live in localStorage under their own key, not in
 *     masterData. Cross-tab audits are not synchronized; each tab tracks
 *     its own scheduling state.
 *
 * SEMANTIC RULES:
 *   - Missing dependencies throw when the operation actually needs them.
 *   - The due check runs before dependency guards so a harmless
 *     "not due" query does not explode because integrity.js hasn't loaded.
 *   - Corrupt or future-dated scheduler timestamps are treated as
 *     "never audited."
 *
 * DEPENDENCIES (REQUIRED when an audit is actually due):
 *   - integrity.js: auditDataIntegrity, repairAllData
 *   - storage.js:   markDataDirty (only when repairs occurred)
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. CONSTANTS
    // =========================================================================

    var LAST_AUDIT_KEY = 'stillwaters_last_audit';
    var AUDIT_INTERVAL = 24 * 60 * 60 * 1000; // 24h

    // =========================================================================
    // 1. MODULE STATE
    // =========================================================================

    var _lastAuditTime = 0;

    /**
     * Loads the persisted last-audit timestamp.
     *
     * Accepts only a finite positive number. Rejects:
     *   - non-numeric strings
     *   - strings with numeric prefixes ("123abc")
     *   - zero, negative, NaN, Infinity
     *   - timestamps more than AUDIT_INTERVAL in the future
     *
     * Future timestamps are treated as corrupt and reset to "never
     * audited" so a bad clock or tampered storage cannot indefinitely
     * suppress auditing.
     *
     * @private
     * @returns {number} timestamp in ms, or 0 if invalid / absent
     */
    function _loadLastAuditTime() {
        var stored;
        try {
            stored = localStorage.getItem(LAST_AUDIT_KEY);
        } catch (e) {
            return 0;
        }
        if (stored === null) return 0;

        var parsed = Number(stored);
        if (!Number.isFinite(parsed) || parsed <= 0) return 0;

        var now = Date.now();
        // A future-dated timestamp beyond the current interval is corrupt.
        if (parsed > now + AUDIT_INTERVAL) return 0;

        return parsed;
    }

    _lastAuditTime = _loadLastAuditTime();

    // =========================================================================
    // 2. DEPENDENCY GUARDS
    // =========================================================================

    function _requireIntegrity() {
        if (typeof window.auditDataIntegrity !== 'function') {
            throw new Error(
                'maintenance.js: integrity.js must load first ' +
                '(auditDataIntegrity missing).'
            );
        }
        if (typeof window.repairAllData !== 'function') {
            throw new Error(
                'maintenance.js: integrity.js must load first ' +
                '(repairAllData missing).'
            );
        }
    }

    function _requirePersistence() {
        if (typeof window.markDataDirty !== 'function') {
            throw new Error(
                'maintenance.js: storage.js must load first ' +
                '(markDataDirty missing). Required when repairs occur.'
            );
        }
    }

    // =========================================================================
    // 3. SCHEDULING
    // =========================================================================

    /**
     * True if the audit is due. Pure with respect to module state aside
     * from reading _lastAuditTime.
     *
     * @param {number} [now] - ms since epoch; defaults to Date.now()
     * @returns {boolean}
     */
    function isAuditDue(now) {
        if (now === undefined || now === null) now = Date.now();
        if (!Number.isFinite(now)) return false;

        if (_lastAuditTime === 0) return true;
        return now - _lastAuditTime >= AUDIT_INTERVAL;
    }

    // =========================================================================
    // 4. AUDIT CYCLE
    // =========================================================================

    /**
     * Runs an automatic audit if enough time has passed.
     *
     * Result shape:
     *
     *   Not due:
     *     { ran: false, reason: 'not due' }
     *
     *   Ran, audit failed to produce a report:
     *     { ran: true, success: false, error: <string> }
     *
     *   Ran, audit succeeded, no repairs needed:
     *     { ran: true, success: true, before: <report>,
     *       after: <report>, repairResult: null }
     *
     *   Ran, audit succeeded, repairs applied:
     *     { ran: true, success: true, before: <report>,
     *       after: <report>, repairResult: <result> }
     *
     * If repairs occurred and markDataDirty is unavailable, this throws
     * before recording a successful cycle — silent loss of repairs is
     * not an acceptable failure mode.
     *
     * The timestamp is only advanced on { ran: true, success: true }.
     *
     * @returns {{ ran: boolean, success?: boolean, reason?: string,
     *             error?: string, before?: Object, after?: Object,
     *             repairResult?: Object|null }}
     */
    function autoAudit() {
        var now = Date.now();

        if (!isAuditDue(now)) {
            return { ran: false, reason: 'not due' };
        }

        // Only now do we actually need integrity.js.
        _requireIntegrity();

        var before = window.auditDataIntegrity();
        if (!before.ok) {
            return { ran: true, success: false, error: before.error };
        }

        var repairResult = null;
        var after = before;

        if (before.totalIssues > 0) {
            repairResult = window.repairAllData();

            if (repairResult.changed) {
                // Persistence is required if we actually changed data.
                _requirePersistence();
                window.markDataDirty();
            }

            after = repairResult.after;
        }

        // Only advance the timestamp after a full successful cycle.
        _lastAuditTime = now;
        try {
            localStorage.setItem(LAST_AUDIT_KEY, String(now));
        } catch (e) {
            // Best-effort scheduling metadata. A failed write means the
            // next call will re-audit; that's acceptable.
        }

        return {
            ran: true,
            success: true,
            before: before,
            after: after,
            repairResult: repairResult
        };
    }

    // =========================================================================
    // 5. STRUCTURED DIAGNOSTICS
    // =========================================================================

    /**
     * Returns the raw last-audit timestamp in ms, or 0 if never.
     * @returns {number}
     */
    function getLastAuditTime() {
        return _lastAuditTime;
    }

    /**
     * Returns structured audit scheduling status. Presentation layers
     * decide how to render this (e.g. "Yesterday", "24 hours ago").
     *
     * @returns {{
     *   lastAuditTime: number,
     *   elapsedMs: number|null,
     *   due: boolean
     * }}
     */
    function getAuditStatus() {
        var now = Date.now();
        var hasAudited = _lastAuditTime > 0;
        return {
            lastAuditTime: _lastAuditTime,
            elapsedMs: hasAudited ? (now - _lastAuditTime) : null,
            due: isAuditDue(now)
        };
    }

    // =========================================================================
    // 6. DEBUG / TEST TOOLING
    // =========================================================================
    //
    // Not intended for production code paths. Kept under a distinct
    // namespace so accidental invocation is obvious in diffs.

    var _debug = {
        /**
         * Clears the persisted last-audit timestamp, forcing the next
         * autoAudit() call to run.
         */
        clearAuditTimestamp: function() {
            _lastAuditTime = 0;
            try {
                localStorage.removeItem(LAST_AUDIT_KEY);
            } catch (e) {
                // ignore
            }
        },

        /**
         * Overrides the last-audit timestamp directly. For tests that
         * need to simulate elapsed time without waiting.
         */
        setAuditTimestamp: function(ms) {
            if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) {
                throw new Error('maintenance.js: setAuditTimestamp requires a non-negative finite number');
            }
            _lastAuditTime = ms;
            try {
                if (ms === 0) {
                    localStorage.removeItem(LAST_AUDIT_KEY);
                } else {
                    localStorage.setItem(LAST_AUDIT_KEY, String(ms));
                }
            } catch (e) {
                // ignore
            }
        }
    };

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    // Production API
    window.autoAudit = autoAudit;
    window.isAuditDue = isAuditDue;
    window.getLastAuditTime = getLastAuditTime;
    window.getAuditStatus = getAuditStatus;

    // Debug / test namespace
    window.MaintenanceDebug = _debug;

    // REMOVED: window.getTimeSinceLastAudit
    //   Was presentation, not scheduling. Use getAuditStatus() and let the
    //   presentation layer format elapsedMs.
    //
    // REMOVED: window.clearAuditTimestamp (moved to MaintenanceDebug)
    //   Was documented as "intended for tests and debug tooling" yet
    //   exposed on the production API.

})();