/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT ANNUAL PROCESSOR
 * js/settlement/settlement-annual-processor.js
 * =============================================================================
 *
 * ANNUAL SETTLEMENT PROCESSING.
 *
 * This file owns the annual simulation step for a settlement. It runs
 * once per world year and applies the temporal effects that are not
 * appropriate in ordinary commands or queries:
 *
 *   - apply debt interest
 *   - update the persisted baseline prosperity (if any)
 *   - record the annual summary in the settlement's history
 *   - publish an annual-processed event
 *
 * It is an orchestration module. It composes commands and queries. It
 * does not own canonical mutation directly; it calls the appropriate
 * commands. When multiple commands must run in a single logical
 * operation, it uses the settlement commit helper through a
 * transaction wrapper so that subscribers see one consistent commit.
 *
 * Contract reference: Settlement Architecture Contracts §10 (Query
 * Contract), §12 (Command Contract), §13 (Persistence Contract), §14
 * (Notification Contract), §22 (Prosperity Contract), §24 (Time
 * Contract), §32 (Completion Standard).
 *
 * Scope discipline:
 *
 *   - Annual processing is the ONLY place where randomness and temporal
 *     variation enter the settlement. Queries remain deterministic.
 *   - Annual processing is the ONLY place where a derived value (such
 *     as a persisted prosperity cache) is updated as a consequence of
 *     time passing.
 *   - Annual processing does NOT apply policy decisions. It does not
 *     change tax rates, government, features, or civil laws. Those are
 *     user-initiated through commands.
 *   - Annual processing is deterministic in its structural steps. If a
 *     randomness step exists (for example, an annual variation on
 *     prosperity), it is isolated and documented. Randomness is applied
 *     last and only to fields that have been explicitly declared as
 *     simulation state.
 *
 * Current randomness policy:
 *
 *   The current model does not apply random variation to persisted
 *   values. If a variation step is added later, it is added here as an
 *   explicit step with its own name, not folded into a calculation
 *   query.
 *
 * Ordering within one settlement's annual step:
 *
 *   1. Read canonical settlement record
 *   2. Apply debt interest (SettlementDebtCommands.applyInterest)
 *   3. Record annual summary in history
 *   4. Publish annual-processed event
 *
 *   Steps 2 and 3 are performed on the same candidate, so they either
 *   both commit or neither does. Step 4 is emitted by the commit helper
 *   as the event for the transaction.
 *
 * Time dependency:
 *   window.getCurrentYearSafe, defined in js/core/time.js, aliased to
 *   window.getCurrentYear. The previous version of this file wrapped
 *   time behind window.Time, which does not exist.
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

    function _getDebtCommands() {
        return window.SettlementDebtCommands;
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

    function _isFiniteNumber(value) {
        return typeof value === 'number' && isFinite(value);
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

    function _currentYear() {
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error(
                'settlement-annual-processor.js requires time.js (getCurrentYearSafe).'
            );
        }
        return window.getCurrentYearSafe();
    }

    // =========================================================================
    // 3. PROCESS ONE SETTLEMENT
    // =========================================================================
    //
    // The annual step for a single settlement. It is one logical
    // transaction:
    //
    //   - read
    //   - compute interest (as a value, without committing)
    //   - apply interest and history to the candidate
    //   - commit once
    //

    /**
     * @param {string} locationId
     * @returns {Object} structured result
     */
    function processSettlementAnnual(locationId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) {
            return {
                success: false,
                code: 'SETTLEMENT_NOT_FOUND',
                details: { locationId: locationId }
            };
        }

        var currentYear = _currentYear();

        // --- Debt interest calculation (pure) ---
        var debtBefore = _isFiniteNumber(settlement.totalDebt) ? settlement.totalDebt : 0;
        var wealthBefore = _isFiniteNumber(settlement.wealth) ? settlement.wealth : 0;

        var interest = 0;
        if (debtBefore > 0) {
            var rate = _getFinanceDefinitions().DEBT_INTEREST_RATE.annualFraction;
            if (_isFiniteNumber(rate)) {
                interest = Math.floor(debtBefore * rate);
            }
        }

        var debtAfter = debtBefore + interest;
        var wealthAfter = wealthBefore - interest;

        // --- History record ---
        var history = settlement.annualHistory || [];
        var historyRecord = {
            year: currentYear,
            debtBefore: debtBefore,
            debtAfter: debtAfter,
            interest: interest,
            wealthBefore: wealthBefore,
            wealthAfter: wealthAfter
        };
        var candidateHistory = history.slice();
        candidateHistory.push(historyRecord);

        // --- Build candidate ---
        var candidate = _copyWith(settlement, {
            totalDebt: debtAfter,
            wealth: wealthAfter,
            annualHistory: candidateHistory
        });

        // --- Commit ---
        var publishedEvent = _getCommit().commit(locationId, candidate, {
            type: 'settlementAnnualProcessed',
            year: currentYear,
            interest: interest,
            debtAfter: debtAfter,
            wealthAfter: wealthAfter
        });

        return {
            success: true,
            locationId: locationId,
            year: currentYear,
            interest: interest,
            debtBefore: debtBefore,
            debtAfter: debtAfter,
            wealthBefore: wealthBefore,
            wealthAfter: wealthAfter,
            event: publishedEvent
        };
    }

    // =========================================================================
    // 4. PROCESS ALL SETTLEMENTS
    // =========================================================================
    //
    // Iterates every settlement in the canonical store and runs the
    // annual step for each. Each settlement is processed as its own
    // transaction. A failure on one settlement does not prevent others
    // from being processed; the failure is recorded in the result.
    //
    // This is deliberate: annual processing is a batch operation, and a
    // single settlement's failure should not halt the world year for
    // everyone else.
    //

    /**
     * @returns {Object} structured result:
     *   {
     *     success: boolean,
     *     year: number,
     *     processed: number,
     *     failed: number,
     *     results: Array<Object>,   // per-settlement results
     *     failures: Array<Object>   // per-settlement failures
     *   }
     */
    function processAllSettlementsAnnual() {
        var currentYear = _currentYear();
        var settlements = _getSettlementQueries().getAllSettlements();

        var results = [];
        var failures = [];

        for (var i = 0; i < settlements.length; i++) {
            var entry = settlements[i];
            var result = processSettlementAnnual(entry.locationId);
            if (result.success) {
                results.push(result);
            } else {
                failures.push(result);
            }
        }

        return {
            success: failures.length === 0,
            year: currentYear,
            processed: results.length,
            failed: failures.length,
            results: results,
            failures: failures
        };
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.SettlementAnnualProcessor = Object.freeze({
        processSettlementAnnual: processSettlementAnnual,
        processAllSettlementsAnnual: processAllSettlementsAnnual
    });

})();
