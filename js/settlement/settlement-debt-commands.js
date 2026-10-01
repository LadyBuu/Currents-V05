/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT DEBT COMMANDS
 * js/settlement/settlement-debt-commands.js
 * =============================================================================
 *
 * DEBT MUTATION COMMANDS.
 *
 * This file contains commands that change a settlement's canonical
 * debt balance or apply debt-related financial effects:
 *   - borrow        : increase totalDebt and credit wealth
 *   - repayDebt     : decrease totalDebt and debit wealth atomically
 *   - adjustDebt    : apply a signed delta to totalDebt without
 *                     affecting wealth (for corrections and
 *                     externally-driven debt changes)
 *   - applyInterest : apply one year of debt interest
 *
 * Under the frozen Debt Contract (§18), wealth and totalDebt are
 * independent canonical balances. Commands that change both do so in
 * one candidate, in one transaction. Commands that change only debt
 * change only debt.
 *
 * Each command is one logical transaction:
 *
 *   read canonical
 *     ↓
 *   validate
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
 * Interest rate:
 *   The annual interest rate is owned by SettlementFinanceDefinitions.
 *   The applyInterest command reads it from there. It does not hardcode
 *   a rate.
 *
 * Interest application:
 *   Interest is a simulation effect. It is applied by the annual
 *   processor, not by any ordinary command or query. applyInterest is
 *   exposed here so that the annual processor has a single canonical
 *   place to apply it, but it is not intended to be called ad-hoc by
 *   UI code.
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

    function _getFinanceDefinitions() {
        return window.SettlementFinanceDefinitions;
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
    // 3. BORROW
    // =========================================================================
    //
    // Borrowing increases totalDebt and credits wealth by the same
    // amount. Both fields change in one candidate, so they cannot
    // diverge.
    //

    /**
     * @param {string} locationId
     * @param {number} amount      must be positive
     * @param {Object} [options]
     * @param {string} [options.reason]
     * @returns {Object} structured result
     */
    function borrow(locationId, amount, options) {
        options = options || {};

        if (!_isFiniteNumber(amount) || amount <= 0) {
            return _failure('INVALID_AMOUNT', {
                expected: 'positive finite number',
                actual: amount
            });
        }

        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) {
            return _failure('SETTLEMENT_NOT_FOUND', { locationId: locationId });
        }

        var debtBefore = _isFiniteNumber(settlement.totalDebt) ? settlement.totalDebt : 0;
        var wealthBefore = _isFiniteNumber(settlement.wealth) ? settlement.wealth : 0;

        var debtAfter = debtBefore + amount;
        var wealthAfter = wealthBefore + amount;

        var candidate = _copyWith(settlement, {
            totalDebt: debtAfter,
            wealth: wealthAfter
        });

        var eventPayload = {
            type: 'debtBorrowed',
            amount: amount,
            debtBefore: debtBefore,
            debtAfter: debtAfter,
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
            amount: amount,
            debtBefore: debtBefore,
            debtAfter: debtAfter,
            wealthBefore: wealthBefore,
            wealthAfter: wealthAfter,
            event: publishedEvent
        };
    }

    // =========================================================================
    // 4. REPAY DEBT
    // =========================================================================
    //
    // Repayment decreases totalDebt and debits wealth by the same
    // amount. Both fields change in one candidate, so they cannot
    // diverge.
    //
    // If the requested amount exceeds the current debt, the amount is
    // reduced to the current debt. Repayment does not create negative
    // debt. This is a domain rule.
    //
    // If the requested amount exceeds the available wealth, the command
    // still succeeds as long as wealth remains valid. Wealth is allowed
    // to go negative under §18, and using wealth to repay debt is
    // permitted even if wealth becomes negative in the process.
    //

    /**
     * @param {string} locationId
     * @param {number} amount      must be positive
     * @param {Object} [options]
     * @param {string} [options.reason]
     * @returns {Object} structured result
     */
    function repayDebt(locationId, amount, options) {
        options = options || {};

        if (!_isFiniteNumber(amount) || amount <= 0) {
            return _failure('INVALID_AMOUNT', {
                expected: 'positive finite number',
                actual: amount
            });
        }

        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) {
            return _failure('SETTLEMENT_NOT_FOUND', { locationId: locationId });
        }

        var debtBefore = _isFiniteNumber(settlement.totalDebt) ? settlement.totalDebt : 0;
        var wealthBefore = _isFiniteNumber(settlement.wealth) ? settlement.wealth : 0;

        if (debtBefore <= 0) {
            return _failure('NO_DEBT_TO_REPAY', {
                totalDebt: debtBefore
            });
        }

        // Cap repayment at the current debt.
        var actualRepayment = amount > debtBefore ? debtBefore : amount;

        var debtAfter = debtBefore - actualRepayment;
        var wealthAfter = wealthBefore - actualRepayment;

        var candidate = _copyWith(settlement, {
            totalDebt: debtAfter,
            wealth: wealthAfter
        });

        var eventPayload = {
            type: 'debtRepaid',
            requestedAmount: amount,
            appliedAmount: actualRepayment,
            debtBefore: debtBefore,
            debtAfter: debtAfter,
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
            requestedAmount: amount,
            appliedAmount: actualRepayment,
            cappedToDebt: actualRepayment < amount,
            debtBefore: debtBefore,
            debtAfter: debtAfter,
            wealthBefore: wealthBefore,
            wealthAfter: wealthAfter,
            event: publishedEvent
        };
    }

    // =========================================================================
    // 5. ADJUST DEBT
    // =========================================================================
    //
    // Applies a signed delta to totalDebt without changing wealth.
    // Used for corrections and for externally-driven debt changes that
    // do not involve a treasury transfer.
    //
    // The result is clamped at zero: totalDebt never becomes negative.
    // This is a domain rule. Debt is a liability; it does not become an
    // asset when it is over-corrected.
    //

    /**
     * @param {string} locationId
     * @param {number} delta
     * @param {Object} [options]
     * @param {string} [options.reason]
     * @returns {Object} structured result
     */
    function adjustDebt(locationId, delta, options) {
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

        var debtBefore = _isFiniteNumber(settlement.totalDebt) ? settlement.totalDebt : 0;
        var debtAfterRaw = debtBefore + delta;
        var debtAfter = debtAfterRaw < 0 ? 0 : debtAfterRaw;

        var candidate = _copyWith(settlement, { totalDebt: debtAfter });

        var eventPayload = {
            type: 'debtAdjusted',
            requestedDelta: delta,
            appliedDelta: debtAfter - debtBefore,
            debtBefore: debtBefore,
            debtAfter: debtAfter
        };

        if (typeof options.reason === 'string' && options.reason.length > 0) {
            eventPayload.reason = options.reason;
        }

        var publishedEvent = _getCommit().commit(locationId, candidate, eventPayload);

        return {
            success: true,
            locationId: locationId,
            requestedDelta: delta,
            appliedDelta: debtAfter - debtBefore,
            debtBefore: debtBefore,
            debtAfter: debtAfter,
            event: publishedEvent
        };
    }

    // =========================================================================
    // 6. APPLY INTEREST
    // =========================================================================
    //
    // Applies one period of interest on the settlement's debt. Interest
    // accrues to totalDebt and is charged against wealth. Both fields
    // change in one candidate.
    //
    // If totalDebt is 0, interest is 0 and no commit occurs. The command
    // returns a structured success with noop: true.
    //
    // The interest rate is read from SettlementFinanceDefinitions. The
    // annual processor is the expected caller.
    //

    /**
     * @param {string} locationId
     * @returns {Object} structured result
     */
    function applyInterest(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) {
            return _failure('SETTLEMENT_NOT_FOUND', { locationId: locationId });
        }

        var debtBefore = _isFiniteNumber(settlement.totalDebt) ? settlement.totalDebt : 0;

        if (debtBefore <= 0) {
            return {
                success: true,
                locationId: locationId,
                interest: 0,
                debtBefore: debtBefore,
                debtAfter: debtBefore,
                wealthBefore: _isFiniteNumber(settlement.wealth) ? settlement.wealth : 0,
                wealthAfter: _isFiniteNumber(settlement.wealth) ? settlement.wealth : 0,
                noop: true
            };
        }

        var wealthBefore = _isFiniteNumber(settlement.wealth) ? settlement.wealth : 0;

        var rate = _getFinanceDefinitions().DEBT_INTEREST_RATE.annualFraction;
        if (!_isFiniteNumber(rate)) {
            return _failure('INVALID_INTEREST_RATE', { rate: rate });
        }

        var interest = Math.floor(debtBefore * rate);

        if (interest <= 0) {
            return {
                success: true,
                locationId: locationId,
                interest: 0,
                debtBefore: debtBefore,
                debtAfter: debtBefore,
                wealthBefore: wealthBefore,
                wealthAfter: wealthBefore,
                noop: true
            };
        }

        var debtAfter = debtBefore + interest;
        var wealthAfter = wealthBefore - interest;

        var candidate = _copyWith(settlement, {
            totalDebt: debtAfter,
            wealth: wealthAfter
        });

        var publishedEvent = _getCommit().commit(locationId, candidate, {
            type: 'debtInterestApplied',
            interest: interest,
            debtBefore: debtBefore,
            debtAfter: debtAfter,
            wealthBefore: wealthBefore,
            wealthAfter: wealthAfter
        });

        return {
            success: true,
            locationId: locationId,
            interest: interest,
            debtBefore: debtBefore,
            debtAfter: debtAfter,
            wealthBefore: wealthBefore,
            wealthAfter: wealthAfter,
            noop: false,
            event: publishedEvent
        };
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.SettlementDebtCommands = Object.freeze({
        borrow: borrow,
        repayDebt: repayDebt,
        adjustDebt: adjustDebt,
        applyInterest: applyInterest
    });

})();
