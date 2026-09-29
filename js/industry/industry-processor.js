/**
 * =============================================================================
 * STILL WATERS - INDUSTRY PROCESSOR (industry-processor.js)
 * =============================================================================
 *
 * LOCATION: js/core/industry/industry-processor.js
 *
 * Annual processing orchestration.
 *
 * ARCHITECTURAL RULES (Phase 1):
 *   - No recursion guards. Composition is expected.
 *   - No fabricated dependency fallbacks.
 *   - No defaults for missing economic values.
 *   - No direct mutation. All mutations go through IndustryCommands.
 *   - No State dependency.
 *   - No UI notifications.
 *
 * RESPONSIBILITIES:
 *   - Decide which enterprises are eligible for processing.
 *   - Delegate economic calculation to IndustryEconomics.
 *   - Delegate commit to IndustryCommands.applyAnnualProcessing().
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY ACCESS
    // =========================================================================

    function _requireQueries() {
        var q = window.IndustryQueries;
        if (!q) {
            throw new Error('IndustryProcessor: IndustryQueries dependency missing');
        }
        return q;
    }

    function _requireCommands() {
        var c = window.IndustryCommands;
        if (!c) {
            throw new Error('IndustryProcessor: IndustryCommands dependency missing');
        }
        return c;
    }

    function _requireEconomics() {
        var e = window.IndustryEconomics;
        if (!e) {
            throw new Error('IndustryProcessor: IndustryEconomics dependency missing');
        }
        return e;
    }

    function _requireCurrentYear() {
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error('IndustryProcessor: getCurrentYearSafe dependency missing');
        }
        return window.getCurrentYearSafe();
    }

    // =========================================================================
    // 2. ELIGIBILITY
    // =========================================================================

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
     *   read → calculate → commit
     *
     * @param {string} enterpriseId
     * @returns {Object} — success or failure with reason
     */
    function processAnnualEnterprise(enterpriseId) {
        if (!enterpriseId) {
            return { success: false, reason: 'Enterprise id is required' };
        }

        var queries = _requireQueries();
        var commands = _requireCommands();
        var economics = _requireEconomics();

        var enterprise = queries.getEnterprise(enterpriseId);
        if (!enterprise) {
            return { success: false, reason: 'Enterprise not found' };
        }

        if (!_isEligibleForProcessing(enterprise)) {
            return {
                success: false,
                reason: 'Enterprise is not eligible for processing (status: ' + enterprise.status + ')'
            };
        }

        var currentYear = _requireCurrentYear();

        var transition = economics.calculateAnnualTransition(enterprise, currentYear);
        if (!transition.ok) {
            return { success: false, reason: transition.reason };
        }

        // If nothing to process, short-circuit. No command, no commit.
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

        // Determine household transfer, if applicable.
        // Transfer amount is the enterprise's totalProfit when the owner is a household.
        var householdTransfer = null;
        var householdId = null;
        var householdReason = null;

        if (enterprise.ownerType === 'household' && enterprise.ownerId) {
            householdTransfer = transition.totalProfit;
            householdId = enterprise.ownerId;
            householdReason = 'Enterprise profit/loss: ' + enterprise.name;
        }

        var applyResult = commands.applyAnnualProcessing(enterpriseId, {
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

        if (!applyResult || !applyResult.success) {
            return {
                success: false,
                reason: applyResult ? applyResult.reason : 'Annual processing command failed'
            };
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
     * NOTE: This is a thin orchestrator. Each enterprise is processed
     * individually through processAnnualEnterprise(), which commits its own
     * transaction. Persistence is coalesced by the save queue.
     *
     * A future world-tick transaction could batch this further, but for
     * Phase 1, per-enterprise transactions match the existing save model.
     *
     * @returns {Object}
     */
    function processAllEnterprises() {
        var queries = _requireQueries();
        var all = queries.getAllEnterprises();

        var results = [];
        var failures = [];
        var skipped = 0;

        for (var i = 0; i < all.length; i++) {
            if (!_isEligibleForProcessing(all[i])) {
                continue;
            }

            var result = processAnnualEnterprise(all[i].id);
            if (result.success) {
                if (result.skipped) {
                    skipped++;
                } else {
                    results.push(result);
                }
            } else {
                failures.push({
                    enterpriseId: all[i].id,
                    enterpriseName: all[i].name,
                    reason: result.reason
                });
            }
        }

        return {
            success: failures.length === 0,
            processed: results.length,
            skipped: skipped,
            failed: failures.length,
            results: results,
            failures: failures
        };
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.IndustryProcessor = {
        processAnnualEnterprise: processAnnualEnterprise,
        processAllEnterprises: processAllEnterprises
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.IndustryProcessor;
    }

})();
