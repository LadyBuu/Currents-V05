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
 *   - exposes a location-scoped batch entry point for settlement tabs
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
 *   Three entry points, three scopes:
 *
 *     processAnnualEnterprise(id)
 *       Single-enterprise entry. Persists once at the end. This is the
 *       shape a details-modal "Process Year" button wants.
 *
 *     processAnnualEnterprise(id, { persist: false })
 *       Same computation, no persist. Used by the batch entries to
 *       coalesce one save across the batch.
 *
 *     processAllEnterprises()
 *       World-wide batch entry. Calls processAnnualEnterprise(id,
 *       { persist: false }) for each eligible enterprise in the whole
 *       catalogue, then persists once at the end.
 *
 *     processEnterprisesForLocation(locationId)
 *       Location-scoped batch entry. Same semantics as
 *       processAllEnterprises but restricted to enterprises whose
 *       locationId matches the argument. Persists once at the end.
 *
 *   If you want to suppress persistence entirely, call
 *   processAnnualEnterprise(id, { persist: false }) directly and persist
 *   yourself when you're ready. Both batch entries honour the
 *   { persist: false } option.
 *
 * CONTRACT:
 *   Every entry point returns a structured result. It never throws for a
 *   domain error. Programming errors (missing dependency, invalid argument
 *   type where the caller is expected to have validated) throw at load or
 *   at call, matching the rest of the domain.
 *
 * LOCATION-SCOPED SCOPE:
 *   processEnterprisesForLocation(locationId) selects enterprises whose
 *   locationId === locationId. It does NOT walk the location subtree.
 *   A settlement tab that wants subtree-wide processing must resolve the
 *   subtree itself and call processAnnualEnterprise per enterprise, or a
 *   future revision must add processEnterprisesForLocationSubtree.
 *   This matches the scope the settlement industry tab documented: "the
 *   tab processes only the enterprises at context.locationId."
 *
 *   The eligibility gate is the same one processAllEnterprises uses
 *   (_isEligibleForProcessing). Ineligible enterprises at the location
 *   are SKIPPED (not counted as failures). This is why the settlement tab
 *   no longer needs to pre-filter by status before calling this method —
 *   the processor's own gate handles it, and the tab's previous
 *   pre-filter (which produced spurious failures because the single-
 *   enterprise entry returns { success: false } for ineligible records)
 *   is now redundant.
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
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Added processEnterprisesForLocation(locationId, options). The
 *       settlement industry tab's "Process All" button previously
 *       composed this loop itself (query summaries, filter to active,
 *       call processAnnualEnterprise per enterprise with persist:false,
 *       persist once at the end). The composition drifted: the tab's
 *       pre-filter produced spurious failures for ineligible
 *       enterprises because processAnnualEnterprise returns
 *       { success: false } for them, not { success: true, skipped }.
 *       Moving the loop into the processor puts the eligibility gate
 *       and the batch composition in one place, so the tab can drop
 *       its pre-filter and delegate cleanly.
 *     - processAllEnterprises now shares its loop body with the new
 *       location-scoped entry via a private _processBatch(enterprises,
 *       options) helper. Behaviour is identical to the prior
 *       processAllEnterprises.
 *     - No other behavioural change. processAnnualEnterprise is
 *       byte-identical. The persistence model is unchanged: each batch
 *       entry persists once at the end, only if something was actually
 *       mutated.
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
    // 4. BATCH PROCESSING — SHARED CORE
    // =========================================================================

    /**
     * Processes a list of enterprises.
     *
     * Each enterprise is processed individually through
     * processAnnualEnterprise with { persist: false }. After every eligible
     * enterprise has been attempted, one IC.persist() is called (unless the
     * caller suppresses it).
     *
     * Failure is per-enterprise and non-fatal: one failed enterprise does
     * not prevent the rest of the batch from running. A failure in the
     * final persist, however, is reported at the batch level.
     *
     * Eligibility is enforced here, not by the caller. Enterprises that are
     * not active are silently skipped and NOT counted as failures. This is
     * why the settlement industry tab no longer pre-filters by status.
     *
     * The returned `attempted` count is the number of enterprises that
     * passed the eligibility gate (i.e. the number of processAnnualEnterprise
     * calls actually made). `skipped` counts only the enterprises that
     * were eligible but reported skipped:true (already processed this year).
     * Ineligible enterprises are neither attempted nor skipped — they are
     * simply not processed, matching processAllEnterprises' historical
     * behaviour.
     *
     * @param {Array} enterprises
     * @param {Object} [options]
     * @param {boolean} [options.persist=true]
     * @returns {Object}
     *   {
     *     success: boolean,
     *     attempted: number,
     *     processed: number,
     *     skipped: number,
     *     failed: number,
     *     results: Object[],
     *     failures: Object[],
     *     persist: { success: boolean, reason?: string } | null
     *   }
     */
    function _processBatch(enterprises, options) {
        options = options || {};
        var shouldPersist = options.persist !== false;

        var list = Array.isArray(enterprises) ? enterprises : [];

        var results = [];
        var failures = [];
        var skipped = 0;
        var attempted = 0;

        for (var i = 0; i < list.length; i++) {
            if (!_isEligibleForProcessing(list[i])) {
                continue;
            }

            attempted++;

            var result = processAnnualEnterprise(list[i].id, { persist: false });

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
                    enterpriseId: list[i].id,
                    enterpriseName: list[i].name,
                    reason: result.reason
                });
            }
        }

        // Persist once at the end. Only if something was actually mutated —
        // a batch that produced no state changes has nothing to save.
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
    // 5. BATCH PROCESSING — WORLD-WIDE
    // =========================================================================

    /**
     * Processes all eligible enterprises in the whole catalogue.
     *
     * See _processBatch for the semantics. processAllEnterprises is the
     * historical entry point; its result shape and behaviour are
     * unchanged from the prior revision.
     *
     * @param {Object} [options]
     * @param {boolean} [options.persist=true]
     * @returns {Object}  see _processBatch
     */
    function processAllEnterprises(options) {
        return _processBatch(IQ.getAllEnterprises(), options);
    }

    // =========================================================================
    // 6. BATCH PROCESSING — LOCATION-SCOPED
    // =========================================================================

    /**
     * Processes all eligible enterprises at a single location.
     *
     * Same semantics as processAllEnterprises, but restricted to
     * enterprises whose locationId === locationId. Ineligible enterprises
     * at the location are skipped by the eligibility gate in
     * _processBatch, not by a pre-filter here. The caller does NOT need to
     * filter by status.
     *
     * Scope: this method matches the settlement's OWN location. It does
     * NOT walk the location subtree. A caller that wants subtree-wide
     * processing must resolve the subtree itself and either call this
     * method per location or call processAnnualEnterprise per enterprise.
     * See LOCATION-SCOPED SCOPE in the module header.
     *
     * Returns the same result shape as processAllEnterprises. The
     * locationId is included in the result for the caller's convenience;
     * it is not part of the shared _processBatch shape.
     *
     * @param {string} locationId
     * @param {Object} [options]
     * @param {boolean} [options.persist=true]
     * @returns {Object}  _processBatch result plus { locationId }
     */
    function processEnterprisesForLocation(locationId, options) {
        if (typeof locationId !== 'string' || locationId.length === 0) {
            return {
                success: false,
                attempted: 0,
                processed: 0,
                skipped: 0,
                failed: 0,
                results: [],
                failures: [{
                    reason: 'locationId is required'
                }],
                persist: null,
                locationId: null
            };
        }

        var enterprises = IQ.getEnterprisesByLocation(locationId);
        var result = _processBatch(enterprises, options);
        result.locationId = locationId;
        return result;
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.IndustryProcessor = Object.freeze({
        processAnnualEnterprise: processAnnualEnterprise,
        processAllEnterprises: processAllEnterprises,
        processEnterprisesForLocation: processEnterprisesForLocation
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.IndustryProcessor;
    }
})();
