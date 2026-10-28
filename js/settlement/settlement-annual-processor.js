/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT ANNUAL PROCESSOR
 * js/settlement/settlement-annual-processor.js
 * =============================================================================
 *
 * ANNUAL SIMULATION STEP FOR SETTLEMENTS.
 *
 * This module owns the per-year financial effects that a settlement
 * experiences during a simulation clock advance. Currently that is debt
 * interest only; the shape of the module is deliberately extensible so
 * that additional annual effects (income / expense settlement, budget
 * expenditure, population-driven tax collection) can be added as new
 * steps in the same commit boundary without changing the caller contract.
 *
 * SCOPE:
 *   - Applying annual debt interest to a settlement
 *   - Recording the year's financial transition in annualHistory
 *   - Committing each settlement's year as one transaction
 *   - Processing all settlements as a batch, with per-settlement error
 *     isolation
 *
 * OUT OF SCOPE:
 *   - Debt policy (rate, formula) → SettlementFinanceDefinitions /
 *     SettlementDebtCommands
 *   - Income / expense calculation → SettlementEconomyQueries (read-only)
 *   - Command dispatch → SettlementCommandCommit.commit
 *   - Persistence mechanics → storage.js (via commit)
 *   - Clock advancement → the caller
 *
 * CLOCK CONTRACT:
 *   This module does NOT advance the simulation clock. It evaluates
 *   financial effects against an explicit year. Two entry points take a
 *   year:
 *
 *     processSettlementAnnual(locationId, options)
 *       options.year    the world year to process for this settlement.
 *                       When omitted, defaults to window.getCurrentYear().
 *                       When supplied, MUST be a valid world year.
 *
 *     processAllSettlementsAnnual(options)
 *       options.year    the world year to process for every settlement.
 *                       When omitted, defaults to window.getCurrentYear().
 *                       When supplied, MUST be a valid world year.
 *
 *   After processAllSettlementsAnnual returns, if the caller wants the
 *   clock to reflect the passage of time, the caller sets
 *   masterData.data.currentYear and persists. This module deliberately
 *   does not touch masterData.data.currentYear. The prior character-
 *   subsystem fix (CharacterLifecycle.advanceMortality) established this
 *   contract for the character domain; the settlement domain mirrors it.
 *
 *   Rationale: a multi-year advance loop calls processSettlementAnnual
 *   once per (settlement, year). Reading window.getCurrentYear() inside
 *   the processor would tag every year's annualHistory entry with the
 *   wall-clock year, which is not the year the entry describes. The
 *   result would be N identical history records for an N-year advance.
 *
 * PER-SETTLEMENT FAILURE ISOLATION:
 *   SettlementCommandCommit.commit throws on persist failure (see its
 *   PERSIST FAILURE CONTRACT). A per-settlement commit can also fail for
 *   per-settlement reasons: a corrupt settlement record, an unexpected
 *   interest-rate definition, or a persist failure that affects one
 *   record but not the batch.
 *
 *   processAllSettlementsAnnual catches per-settlement failures and
 *   records them in result.failures, then CONTINUES to the next
 *   settlement. This matches the per-character death failure pattern in
 *   CharacterLifecycle.advanceMortality (result.skipped).
 *
 *   processSettlementAnnual itself does NOT catch. It is a single-
 *   settlement operation; a caller asking it to process one settlement
 *   wants to know if that settlement could not be processed. The
 *   batch processor converts a thrown error into a structured failure
 *   entry.
 *
 * ANNUAL HISTORY RECORD:
 *   Each successful processing appends one entry to settlement.annualHistory:
 *
 *     {
 *       year:          number    the world year this entry describes
 *       debtBefore:    number
 *       debtAfter:     number
 *       interest:      number
 *       wealthBefore:  number
 *       wealthAfter:   number
 *     }
 *
 *   The record is a snapshot of the transition. It does not include
 *   income or expenses because this processor does not currently
 *   compute them. If income / expense settlement is added, extend the
 *   record rather than replacing it; existing entries must remain
 *   readable.
 *
 * FUTURE WORK:
 *   Income and expense settlement are read-only calculations in
 *   SettlementEconomyQueries today. A future revision may add a
 *   SettlementEconomyCommands.applyAnnualNetChange(locationId, year)
 *   command that mutates wealth by the net surplus and records the
 *   surplus in annualHistory. That command, not this processor, would
 *   own the field ownership question (income taxes the wealth of
 *   residents, expenses debit the settlement treasury, etc.). This
 *   processor would call it as one more step before commit, still
 *   inside a single transaction per settlement.
 *
 * DEPENDENCIES (REQUIRED, checked at call time):
 *   - SettlementQueries            read the canonical settlement record
 *   - SettlementFinanceDefinitions annual interest rate
 *   - SettlementCommandCommit      write / rebuild / persist / publish
 *   - time.js (getCurrentYear)     fallback when options.year is omitted
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - processSettlementAnnual(locationId, options) now accepts an
 *       explicit options.year. When supplied, that year is used for the
 *       history record and for any internal year-dependent calculation.
 *       When omitted, window.getCurrentYear() is used as before. This
 *       is the same contract as CharacterLifecycle.advanceMortality's
 *       explicit startYear: the caller owns the clock.
 *     - processAllSettlementsAnnual(options) now accepts an explicit
 *       options.year and forwards it to every per-settlement call.
 *     - Per-settlement failures are now caught inside
 *       processAllSettlementsAnnual and recorded in result.failures.
 *       The prior revision let a thrown error from a single settlement
 *       abort the batch. With SettlementCommandCommit.commit now
 *       throwing on persist failure, that behavior would have been
 *       catastrophic for a multi-settlement advance: one quota-exceeded
 *       failure would abort the entire year.
 *     - processSettlementAnnual still does NOT catch. Its throw-through
 *       contract is preserved for explicit single-settlement callers.
 *     - Header CLOCK CONTRACT and PER-SETTLEMENT FAILURE ISOLATION
 *       sections added.
 *     - Header time-dependency note updated: window.getCurrentYear is
 *       the canonical accessor; window.getCurrentYearSafe is NOT used
 *       here.
 *   Previous revision:
 *     - Initial implementation.
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

    /**
     * Resolves the year to process for this call.
     *
     *   options.year missing        → window.getCurrentYear()
     *   options.year valid world    → used verbatim
     *   options.year invalid        → throws (caller bug, not a runtime
     *                                 condition this module can repair)
     *
     * @private
     * @param {Object} options
     * @returns {number}
     * @throws {Error} if options.year is supplied but not a valid world year
     */
    function _resolveProcessYear(options) {
        if (!options || options.year === undefined || options.year === null) {
            return _currentYear();
        }
        if (typeof window.isValidYear === 'function') {
            if (window.isValidYear(options.year) !== true) {
                throw new Error(
                    'settlement-annual-processor.js: options.year must be a ' +
                    'valid world year (got ' + options.year + ').'
                );
            }
            return options.year;
        }
        // time.js is a hard dependency of this module. If isValidYear is
        // not exposed, that is a load-order bug; the caller of this
        // function will see a throw when getCurrentYear is next called,
        // but the explicit-year path would silently accept a bad value.
        // Guard against that by throwing here.
        throw new Error(
            'settlement-annual-processor.js: time.js (isValidYear) is not ' +
            'available; cannot validate options.year. Load time.js before ' +
            'this module.'
        );
    }

    // =========================================================================
    // 3. PROCESS ONE SETTLEMENT
    // =========================================================================

    /**
     * Processes one world year for a settlement. Applies debt interest,
     * records the transition in annualHistory, and commits.
     *
     * Throws if the settlement does not exist, if the interest rate is
     * invalid, or if the commit fails (including persist failure —
     * SettlementCommandCommit.commit now throws on save failure).
     *
     * @param {string} locationId
     * @param {Object} [options]
     * @param {number} [options.year]
     *   The world year to process. Defaults to window.getCurrentYear().
     *   Supply this when running multi-year simulation so each year's
     *   history entry is tagged with the simulated year, not wall-clock.
     * @returns {{
     *   success: true,
     *   locationId: string,
     *   year: number,
     *   interest: number,
     *   debtBefore: number,
     *   debtAfter: number,
     *   wealthBefore: number,
     *   wealthAfter: number,
     *   event: Object
     * }}
     * @throws {Error} on settlement-not-found, invalid interest rate,
     *   or commit failure
     */
    function processSettlementAnnual(locationId, options) {
        if (typeof locationId !== 'string' || locationId.length === 0) {
            throw new Error(
                'processSettlementAnnual: locationId must be a non-empty string.'
            );
        }

        var year = _resolveProcessYear(options);

        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) {
            throw new Error(
                'processSettlementAnnual: settlement not found for locationId "' +
                locationId + '".'
            );
        }

        var debtBefore = _isFiniteNumber(settlement.totalDebt) ? settlement.totalDebt : 0;
        var wealthBefore = _isFiniteNumber(settlement.wealth) ? settlement.wealth : 0;

        var interest = 0;
        if (debtBefore > 0) {
            var rate = _getFinanceDefinitions().DEBT_INTEREST_RATE.annualFraction;
            if (!_isFiniteNumber(rate)) {
                throw new Error(
                    'processSettlementAnnual: invalid debt interest rate ' +
                    'definition (annualFraction is not a finite number).'
                );
            }
            interest = Math.floor(debtBefore * rate);
        }

        var debtAfter = debtBefore + interest;
        var wealthAfter = wealthBefore - interest;

        // Build the candidate. annualHistory is cloned so the caller
        // (SettlementCommandCommit) receives a fresh array; the previous
        // reference inside `settlement` is untouched by this function.
        var history = Array.isArray(settlement.annualHistory)
            ? settlement.annualHistory
            : [];
        var historyRecord = {
            year: year,
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

        // SettlementCommandCommit.commit throws on persist failure. See
        // PER-SETTLEMENT FAILURE ISOLATION in the module header. A
        // single-settlement caller wants to know; a batch caller wraps
        // this call and records the failure without aborting.
        var publishedEvent = _getCommit().commit(locationId, candidate, {
            type: 'settlementAnnualProcessed',
            year: year,
            interest: interest,
            debtAfter: debtAfter,
            wealthAfter: wealthAfter
        });

        return {
            success: true,
            locationId: locationId,
            year: year,
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

    /**
     * Processes one world year for every settlement. Each settlement is
     * its own transaction; a failure on one settlement does not prevent
     * the others from being processed.
     *
     * @param {Object} [options]
     * @param {number} [options.year]
     *   The world year to process. Defaults to window.getCurrentYear().
     * @returns {{
     *   success: boolean,
     *   year: number,
     *   processed: number,
     *   failed: number,
     *   results: Array<Object>,
     *   failures: Array<{ locationId: string, code: string, message: string }>
     * }}
     */
    function processAllSettlementsAnnual(options) {
        var year = _resolveProcessYear(options);

        var settlements = _getSettlementQueries().getAllSettlements();

        var results = [];
        var failures = [];

        for (var i = 0; i < settlements.length; i++) {
            var entry = settlements[i];
            var locationId = entry.locationId;

            try {
                var result = processSettlementAnnual(locationId, { year: year });
                results.push(result);
            } catch (err) {
                failures.push({
                    locationId: locationId,
                    code: 'PROCESS_FAILED',
                    message: (err && err.message) ? err.message : String(err)
                });
            }
        }

        return {
            success: failures.length === 0,
            year: year,
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
