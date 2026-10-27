/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT ANNUAL PROCESSOR
 * js/settlement/settlement-annual-processor.js
 * =============================================================================
 *
 * (Header preserved — see current file. Only the time-dependency block
 * below changed.)
 *
 * Time dependency:
 *   window.getCurrentYear, defined in js/core/time.js. The deprecated
 *   window.getCurrentYearSafe alias is NOT used here.
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
        if (typeof window.getCurrentYear !== 'function') {
            throw new Error(
                'settlement-annual-processor.js requires time.js (getCurrentYear).'
            );
        }
        return window.getCurrentYear();
    }

    // =========================================================================
    // 3. PROCESS ONE SETTLEMENT
    // =========================================================================

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

        var candidate = _copyWith(settlement, {
            totalDebt: debtAfter,
            wealth: wealthAfter,
            annualHistory: candidateHistory
        });

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
