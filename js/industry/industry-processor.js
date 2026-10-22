/**
 * =============================================================================
 * STILL WATERS - INDUSTRY PROCESSOR (industry-processor.js)
 * =============================================================================
 *
 * LOCATION: js/core/industry/industry-processor.js
 *
 * Annual processing orchestration.
 *
 * This file:
 *   - decides which enterprises are eligible for processing
 *   - delegates economic calculation to IndustryEconomics
 *   - delegates commit to IndustryCommands.applyAnnualProcessing
 *   - persists once per batch, per the batch caller's instruction
 *
 * This file does NOT:
 *   - compute economic transitions (IndustryEconomics does)
 *   - mutate enterprise records (IndustryCommands does)
 *   - write to storage except through IndustryCommands.persist
 *   - toast, render, or touch the DOM
 *   - fabricate defaults for missing economic values
 *
 * PERSISTENCE MODEL:
 *   The processor does not save. It delegates to IndustryCommands which
 *   also does not save. The caller decides when to persist.
 *
 *   Two entry points, two semantics:
 *
 *     processAnnualEnterprise(id)
 *       Single-enterprise entry. Persists once at the end. This is the
 *       shape a details-modal "Process Year" button wants.
 *
 *     processAnnualEnterprise(id, { persist: false })
 *       Same computation, no persist. Used by processAllEnterprises to
 *       coalesce one save across the batch.
 *
 *     processAllEnterprises()
 *       Batch entry. Calls processAnnualEnterprise(id, { persist: false })
 *       for each eligible enterprise, then persists once at the end. One
 *       save, one flush, one write.
 *
 *   If you want to suppress persistence entirely, call
 *   processAnnualEnterprise(id, { persist: false }) directly and persist
 *   yourself when you're ready. The processor honours the flag.
 *
 * CONTRACT:
 *   Every entry point returns a structured result. It never throws for a
 *   domain error. Programming errors (missing dependency, invalid argument
 *   type where the caller is expected to have validated) throw at load or
 *   at call, matching the rest of the domain.
 *
 * DEPENDENCIES (REQUIRED at load):
 *   - industry-queries.js   (IndustryQueries)
 *   - industry-commands.js  (IndustryCommands)
 *   - industry-economics.js (IndustryEconomics)
 *   - time.js               (getCurrentYear)
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. LOAD-TIME DEPENDENCY VERIFICATION
    // =========================================================================

    if (typeof window.IndustryQueries === 'undefined') {
        throw new Error(
            'industry-processor.js requires industry-queries.js to load first.'
        );
    }
    if (typeof window.IndustryCommands === 'undefined') {
        throw new Error(
            'industry-processor.js requires industry-commands.js to load first.'
        );
    }
    if (typeof window.IndustryEconomics === 'undefined') {
        throw new Error(
            'industry-processor.js requires industry-economics.js to load first.'
        );
    }
    if (typeof window.getCurrentYear !== 'function') {
        throw new Error(
            'industry-processor.js requires time.js (getCurrentYear).'
        );
    }

    var IQ = window.IndustryQueries;
    var IC = window.IndustryCommands;
    var IE = window.IndustryEconomics;

    // =========================================================================
    // 2. ELIGIBILITY
    // =========================================================================

    /**
     * True if the enterprise is eligible for annual processing.
     *
     * Only active enterprises process. Bankrupt, closed, inactive, and
     * demolished enterprises are skipped.
     */
    function _isEligibleForProcessing(enterprise) {
        if (!enterprise) return false;
        if (enterprise.status !== 'active') return false;
        return true;
    }

    // =========================================================================
    // 3. SINGLE ENTERPRISE PROCESSING
    // =========================================================================

    /**
     * Processes one enterprise's annual economics.
     *
     * Flow:
     *   read → calculate → commit → (optionally) persist
     *
     * @param {string} enterpriseId
     * @param {Object} [options]
     * @param {boolean} [options.persist=true] — call IndustryCommands.persist()
     *                                            at the end of a successful run
     * @returns {Object}
     *   { success: true, skipped?: boolean, ... }
     *   { success: false, reason }
     */
    function processAnnualEnterprise(enterpriseId, options) {
        options = options || {};
        var shouldPersist = options.persist !== false;

        if (typeof enterpriseId !== 'string' || enterpriseId.length === 0) {
            return { success: false, reason: 'Enterprise id is required' };
        }

        var enterprise = IQ.getEnterprise(enterpriseId);
        if (!enterprise) {
            return { success: false, reason: 'Enterprise not found' };
        }

        if (!_isEligibleForProcessing(enterprise)) {
            return {
                success: false,
                reason: 'Enterprise is not eligible for processing (status: ' +
                    enterprise.status + ')'
            };
        }

        var currentYear = window.getCurrentYear();

        var transition = IE.calculateAnnualTransition(enterprise, currentYear);
        if (!transition.ok) {
            return { success: false, reason: transition.reason };
        }

        // Nothing to process. Short-circuit. No command, no persist.
        if (transition.yearsProcessed === 0) {
            return {
                success: true,
                skipped: true,
                enterpriseId: enterprise.id,
                enterpriseName: enterprise.name,
                year: currentYear,
                yearsProcessed: 0,
                reason: 'Already processed for year ' + currentYear
            };
        }

        // Household transfer routing. When the enterprise is household-owned,
        // the profit/loss flows to the household via the command layer.
        var householdTransfer = null;
        var householdId = null;
        var householdReason = null;

        if (enterprise.ownerType === 'household' && enterprise.ownerId) {
            householdTransfer = transition.totalProfit;
            householdId = enterprise.ownerId;
            householdReason = 'Enterprise profit/loss: ' + enterprise.name;
        }

        var applyResult = IC.applyAnnualProcessing(enterpriseId, {
            currentYear: currentYear,
            yearsProcessed: transition.yearsProcessed,
            newWealth: transition.newWealth,
            newDebt: transition.newDebt,
            nextStatus: transition.nextStatus,
            historyEntries: transition.historyEntries,
            householdTransfer: householdTransfer,
            householdId: householdId,
            householdReason: householdReason
        });

        if (!applyResult || applyResult.success !== true) {
            return {
                success: false,
                reason: applyResult && applyResult.reason
                    ? applyResult.reason
                    : 'Annual processing command failed'
            };
        }

        // Persist once per single-enterprise call, unless suppressed.
        var persistResult = null;
        if (shouldPersist) {
            persistResult = IC.persist();
            if (!persistResult || persistResult.success !== true) {
                return {
                    success: false,
                    reason: persistResult && persistResult.reason
                        ? 'Processing succeeded but persist failed: ' +
                            persistResult.reason
                        : 'Processing succeeded but persist failed',
                    applied: true,
                    enterpriseId: enterprise.id,
                    currentYear: currentYear
                };
            }
        }

        return {
            success: true,
            enterpriseId: enterprise.id,
            enterpriseName: enterprise.name,
            year: currentYear,
            yearsProcessed: transition.yearsProcessed,
            annualIncome: transition.annualIncome,
            annualExpenses: transition.annualExpenses,
            totalWages: transition.totalWages,
            netProfit: transition.netProfit,
            totalProfit: transition.totalProfit,
            interest: transition.interest,
            newWealth: transition.newWealth,
            newDebt: transition.newDebt,
            status: transition.nextStatus
        };
    }

    // =========================================================================
    // 4. BATCH PROCESSING
    // =========================================================================

    /**
     * Processes all eligible enterprises.
     *
     * Each enterprise is processed individually through
     * processAnnualEnterprise with { persist: false }. After every eligible
     * enterprise has been attempted, one IC.persist() is called.
     *
     * Failure is per-enterprise and non-fatal: one failed enterprise does
     * not prevent the rest of the batch from running. A failure in the
     * final persist, however, is reported at the batch level.
     *
     * @param {Object} [options]
     * @param {boolean} [options.persist=true]
     * @returns {Object}
     *   {
     *     success: boolean,
     *     processed: number,
     *     skipped: number,
     *     failed: number,
     *     results: Object[],
     *     failures: Object[],
     *     persist: { success: boolean, reason?: string } | null
     *   }
     */
    function processAllEnterprises(options) {
        options = options || {};
        var shouldPersist = options.persist !== false;

        var all = IQ.getAllEnterprises();

        var results = [];
        var failures = [];
        var skipped = 0;
        var attempted = 0;

        for (var i = 0; i < all.length; i++) {
            if (!_isEligibleForProcessing(all[i])) {
                continue;
            }

            attempted++;

            var result = processAnnualEnterprise(all[i].id, { persist: false });

            if (result.success === true) {
                if (result.skipped === true) {
                    skipped++;
                } else {
                    results.push(result);
                }
            } else {
                // A persist failure inside a single-enterprise call with
                // persist:false cannot occur (we suppress it), so any
                // failure here is a domain failure — missing enterprise,
                // calculation error, command rejection.
                failures.push({
                    enterpriseId: all[i].id,
                    enterpriseName: all[i].name,
                    reason: result.reason
                });
            }
        }

        // Persist once at the end. Only if something was actually mutated —
        // a batch that produced no state changes has nothing to save. In
        // practice results.length > 0 is the signal.
        var persistResult = null;
        if (shouldPersist && results.length > 0) {
            persistResult = IC.persist();
            if (!persistResult || persistResult.success !== true) {
                return {
                    success: false,
                    attempted: attempted,
                    processed: results.length,
                    skipped: skipped,
                    failed: failures.length,
                    results: results,
                    failures: failures,
                    persist: {
                        success: false,
                        reason: persistResult && persistResult.reason
                            ? persistResult.reason
                            : 'persist failed'
                    }
                };
            }
        }

        return {
            success: failures.length === 0,
            attempted: attempted,
            processed: results.length,
            skipped: skipped,
            failed: failures.length,
            results: results,
            failures: failures,
            persist: persistResult
        };
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.IndustryProcessor = Object.freeze({
        processAnnualEnterprise: processAnnualEnterprise,
        processAllEnterprises: processAllEnterprises
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.IndustryProcessor;
    }
})();
