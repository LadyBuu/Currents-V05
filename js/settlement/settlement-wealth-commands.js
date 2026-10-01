/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT WEALTH COMMANDS
 * js/settlement/settlement-wealth-commands.js
 * =============================================================================
 *
 * WEALTH MUTATION COMMANDS.
 *
 * This file contains commands that change a settlement's canonical
 * wealth balance:
 *   - adjustWealth : apply a signed delta to wealth
 *
 * Under the frozen Debt Contract (§18), wealth and totalDebt are
 * independent canonical balances. This module changes only wealth. It
 * does NOT touch totalDebt, and it does NOT derive debt from negative
 * wealth. A caller that needs to change both must do so through a
 * command that owns both fields (e.g. SettlementDebtCommands.repayDebt).
 *
 * The command is one logical transaction:
 *
 *   read canonical
 *     ↓
 *   validate delta
 *     ↓
 *   build candidate
 *     ↓
 *   commit candidate        (SettlementCommandCommit.commit)
 *     ↓
 *   return structured result
 *
 * The commit helper owns the write / rebuild / persist / publish
 * sequence. This module does not reimplement any part of it.
 *
 * Contract reference: Settlement Architecture Contracts §5 (Missing-Value
 * Semantics), §12 (Command Contract), §13 (Persistence Contract), §14
 * (Notification Contract), §18 (Debt Contract), §32 (Completion
 * Standard).
 *
 * Notes:
 *   - The delta may be any finite number: positive to add, negative to
 *     subtract.
 *   - The command does NOT clamp wealth at zero. Negative wealth is
 *     legitimate under §18.
 *   - The `reason` field is optional and is used only for the published
 *     event payload. It is not stored on the settlement record. If a
 *     persistent audit trail of wealth changes is required, that is a
 *     separate command and a separate storage decision.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCIES
    // =========================================================================

    function _getSettlementQueries() {
        return window.SettlementQueries;
    }

    function _getCommit() {
        return window.SettlementCommandCommit;
    }

    // =========================================================================
    // 2. HELPERS
    // =========================================================================

    function _failure(code, details) {
        return {
            success: false,
            code: code,
            details: details || {}
        };
    }

    function _copyWith(source, overrides) {
        var copy = {};
        for (var key in source) {
            if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
            copy[key] = source[key];
        }
        for (var overrideKey in overrides) {
            if (!Object.prototype.hasOwnProperty.call(overrides, overrideKey)) continue;
            copy[overrideKey] = overrides[overrideKey];
        }
        return copy;
    }

    function _isFiniteNumber(value) {
        return typeof value === 'number' && isFinite(value);
    }

    // =========================================================================
    // 3. ADJUST WEALTH
    // =========================================================================

    /**
     * Applies a signed delta to the settlement's wealth.
     *
     * @param {string} locationId
     * @param {number} delta
     * @param {Object} [options]
     * @param {string} [options.reason]   descriptive label for the event
     * @returns {Object} structured result
     */
    function adjustWealth(locationId, delta, options) {
        options = options || {};

        if (!_isFiniteNumber(delta)) {
            return _failure('INVALID_DELTA', {
                expected: 'finite number',
                actual: typeof delta
            });
        }

        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) {
            return _failure('SETTLEMENT_NOT_FOUND', { locationId: locationId });
        }

        if (!_isFiniteNumber(settlement.wealth)) {
            return _failure('INVALID_CURRENT_WEALTH', {
                actual: settlement.wealth
            });
        }

        var wealthBefore = settlement.wealth;
        var wealthAfter = wealthBefore + delta;

        var candidate = _copyWith(settlement, { wealth: wealthAfter });

        var eventPayload = {
            type: 'wealthAdjusted',
            delta: delta,
            wealthBefore: wealthBefore,
            wealthAfter: wealthAfter
        };

        if (typeof options.reason === 'string' && options.reason.length > 0) {
            eventPayload.reason = options.reason;
        }

        var publishedEvent = _getCommit().commit(locationId, candidate, eventPayload);

        return {
            success: true,
            locationId: locationId,
            wealthBefore: wealthBefore,
            wealthAfter: wealthAfter,
            delta: delta,
            event: publishedEvent
        };
    }

    // =========================================================================
    // 4. EXPORTS
    // =========================================================================

    window.SettlementWealthCommands = Object.freeze({
        adjustWealth: adjustWealth
    });

})();
