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
 *   - UI feedback → caller
 *   - User-triggered audits → caller decides when to invoke
 *
 * CONTRACT:
 *   - autoAudit() returns a result describing what happened. It does not
 *     show UI or prompt the user.
 *   - When repairs occur, the module marks the data dirty so the mutation
 *     boundary persists. If markDataDirty is not available AND repairs
 *     occurred, the module throws — silent loss of repairs is not
 *     an acceptable failure mode.
 *   - The last-audit timestamp is only updated after a successful audit
 *     cycle, so a failure leaves the audit "due" for the next call.
 *
 * SEMANTIC RULES:
 *   - Missing dependencies throw when they are actually needed.
 *   - Timestamps are stored as strings in localStorage; invalid entries
 *     are treated as "never audited."
 *
 * DEPENDENCIES (REQUIRED when autoAudit runs):
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

    // Load persisted timestamp once at module init. Failures are
    // non-fatal — the module simply behaves as if no audit has run.
    try {
        var stored = localStorage.getItem(LAST_AUDIT_KEY);
        if (stored !== null) {
            var parsed = parseInt(stored, 10);
            if (!isNaN(parsed) && parsed > 0) _lastAuditTime = parsed;
        }
    } catch (e) {
        // localStorage unavailable
    }

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
    // 3. AUDIT CYCLE
    // =========================================================================

    /**
     * Runs an automatic audit if enough time has passed.
     *
     * If repairs occur, marks the data dirty so the mutation boundary
     * persists. Does NOT call saveMasterData directly — the mutation
     * boundary owns that.
     *
     * The last-audit timestamp is only recorded after a successful cycle.
     *
     * @returns {{
     *   ran: boolean,
     *   reason?: string,
     *   before?: Object,
     *   after?: Object,
     *   repairResult?: Object|null
     * }}
     */
    function autoAudit() {
        _requireIntegrity();

        var now = Date.now();
        if (now - _lastAuditTime <= AUDIT_INTERVAL) {
            return { ran: false, reason: 'not due' };
        }

        var before = window.auditDataIntegrity();
        if (!before.ok) {
            return { ran: false, reason: before.error };
        }

        var repairResult = null;
        var after = before;

        if (before.totalIssues > 0) {
            repairResult = window.repairAllData();

            if (repairResult.changed) {
                // Persistence is required if we actually changed data.
                // Losing repairs silently is worse than failing loudly.
                _requirePersistence();
                window.markDataDirty();
            }

            after = repairResult.after;
        }

        _lastAuditTime = now;
        try {
            localStorage.setItem(LAST_AUDIT_KEY, String(now));
        } catch (e) {
            // ignore — timestamp is best-effort scheduling metadata
        }

        return {
            ran: true,
            before: before,
            after: after,
            repairResult: repairResult
        };
    }

    // =========================================================================
    // 4. DIAGNOSTIC HELPERS
    // =========================================================================

    /**
     * Returns a human-readable string describing how long it has been
     * since the last audit. Presentation-agnostic; the string is plain
     * English intended for logs and simple UI display.
     *
     * @returns {string}
     */
    function getTimeSinceLastAudit() {
        if (_lastAuditTime === 0) return 'Never';
        var diff = Date.now() - _lastAuditTime;
        if (diff < 0) return 'Never'; // clock skew backwards
        var days = Math.floor(diff / (1000 * 60 * 60 * 24));
        if (days === 0) return 'Today';
        if (days === 1) return 'Yesterday';
        return days + ' days ago';
    }

    /**
     * Returns the raw last-audit timestamp in ms, or 0 if never.
     * @returns {number}
     */
    function getLastAuditTime() {
        return _lastAuditTime;
    }

    /**
     * Clears the persisted last-audit timestamp. Useful for forcing the
     * next autoAudit() call to run. Intended for tests and debug tooling.
     */
    function clearAuditTimestamp() {
        _lastAuditTime = 0;
        try {
            localStorage.removeItem(LAST_AUDIT_KEY);
        } catch (e) {
            // ignore
        }
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.autoAudit = autoAudit;
    window.getTimeSinceLastAudit = getTimeSinceLastAudit;
    window.getLastAuditTime = getLastAuditTime;
    window.clearAuditTimestamp = clearAuditTimestamp;

})();