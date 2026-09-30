/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT FEATURE COMMANDS
 * js/settlement/settlement-feature-commands.js
 * =============================================================================
 *
 * FEATURE MUTATION COMMANDS.
 *
 * This file contains the three feature commands:
 *   - buildFeature    : add a feature to a settlement, apply cost/debt
 *   - removeFeature   : remove a feature with full refund
 *   - demolishFeature : remove a feature with no refund, record history
 *
 * Each command is one logical transaction:
 *
 *   read canonical
 *     ↓
 *   resolve inputs
 *     ↓
 *   build candidate
 *     ↓
 *   validate (via rules)
 *     ↓
 *   apply domain consequences
 *     ↓
 *   commit candidate        (SettlementCommandCommit.commit)
 *     ↓
 *   return structured result
 *
 * The commit helper owns the write / rebuild / persist / publish
 * sequence. This module does not reimplement any part of it.
 *
 * Contract reference: Settlement Architecture Contracts §5 (Missing-Value
 * Semantics), §9 (Rules Contract), §12 (Command Contract), §13
 * (Persistence Contract), §14 (Notification Contract), §18 (Debt
 * Contract), §29 (Command Transaction Example), §32 (Completion
 * Standard).
 *
 * Domain decisions applied:
 *   - Feature build may create debt. Cost is deducted from wealth; the
 *     shortfall, if any, is added to totalDebt. Under §18, wealth and
 *     debt are independent balances; this command updates both
 *     atomically in one candidate.
 *   - Removal refunds the full build cost. This is a rule of the removal
 *     command, not a property of the feature definition.
 *   - Demolition refunds nothing and appends a demolition history
 *     record. The history record and the feature removal happen in the
 *     same candidate; they cannot diverge.
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

    function _getFeatureQueries() {
        return window.SettlementFeatureQueries;
    }

    function _getFeatureRules() {
        return window.SettlementFeatureRules;
    }

    function _getCommit() {
        return window.SettlementCommandCommit;
    }

    function _getTime() {
        // Time is a required dependency. There is no fallback year.
        return window.Time;
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

    /**
     * Returns a shallow copy of `source` with `overrides` applied.
     * Nested objects are shared by reference until a caller replaces
     * them; this keeps the commit path cheap and defers deep copying to
     * the commands that actually need to modify nested structures.
     */
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

    // =========================================================================
    // 3. BUILD FEATURE
    // =========================================================================
    //
    // Debt rule:
    //   - cost is deducted from wealth
    //   - if resulting wealth is negative, the shortfall is added to debt
    //   - the shortfall added to debt is exactly the amount by which
    //     wealth would go below zero
    //
    // Cases:
    //   wealth = 300, cost = 500  →  wealth = -200, debt += 200
    //   wealth = 800, cost = 500  →  wealth =  300, debt unchanged
    //   wealth = -100, cost = 500 →  wealth = -600, debt += 500
    //

    /**
     * @param {string} locationId
     * @param {string} featureId
     * @returns {Object} structured result
     */
    function buildFeature(locationId, featureId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) {
            return _failure('SETTLEMENT_NOT_FOUND', { locationId: locationId });
        }

        var feature = _getFeatureQueries().getFeatureById(featureId);
        if (!feature) {
            return _failure('UNKNOWN_FEATURE', { featureId: featureId });
        }

        var currentFeatureIds = settlement.featureIds || [];

        var evaluation = _getFeatureRules().evaluatePurchase({
            featureId: featureId,
            currentFeatureIds: currentFeatureIds,
            wealth: settlement.wealth,
            allowFinancing: true
        });

        if (!evaluation.allowed) {
            return _failure('PURCHASE_REJECTED', {
                featureId: featureId,
                reasons: evaluation.reasons
            });
        }

        // --- Build candidate ---
        var cost = feature.cost;
        var wealthBefore = settlement.wealth;
        var wealthAfter = wealthBefore - cost;
        var debtDelta = 0;
        var debtBefore = settlement.totalDebt;
        var debtAfter = debtBefore;

        if (wealthAfter < 0 && wealthBefore >= 0) {
            // Wealth crossed from non-negative to negative. The shortfall
            // becomes debt; wealth keeps the negative residual.
            debtDelta = -wealthAfter;
            debtAfter = debtBefore + debtDelta;
        } else if (wealthAfter < 0 && wealthBefore < 0) {
            // Wealth was already negative. The whole cost becomes debt.
            debtDelta = cost;
            debtAfter = debtBefore + cost;
        }
        // else: wealth remained non-negative; no debt change.

        var candidateFeatureIds = currentFeatureIds.slice();
        candidateFeatureIds.push(feature.id);

        var candidate = _copyWith(settlement, {
            featureIds: candidateFeatureIds,
            wealth: wealthAfter,
            totalDebt: debtAfter
        });

        var publishedEvent = _getCommit().commit(locationId, candidate, {
            type: 'featureBuilt',
            featureId: feature.id,
            cost: cost,
            wealthAfter: wealthAfter,
            debtDelta: debtDelta
        });

        return {
            success: true,
            locationId: locationId,
            featureId: feature.id,
            featureName: feature.name,
            cost: cost,
            wealthBefore: wealthBefore,
            wealthAfter: wealthAfter,
            debtBefore: debtBefore,
            debtAfter: debtAfter,
            debtDelta: debtDelta,
            event: publishedEvent
        };
    }

    // =========================================================================
    // 4. REMOVE FEATURE (full refund)
    // =========================================================================

    /**
     * @param {string} locationId
     * @param {string} featureId
     * @returns {Object} structured result
     */
    function removeFeature(locationId, featureId) {
        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) {
            return _failure('SETTLEMENT_NOT_FOUND', { locationId: locationId });
        }

        var currentFeatureIds = settlement.featureIds || [];

        var evaluation = _getFeatureRules().evaluateRemoval({
            featureId: featureId,
            currentFeatureIds: currentFeatureIds
        });

        if (!evaluation.allowed) {
            return _failure('REMOVAL_REJECTED', {
                featureId: featureId,
                reasons: evaluation.reasons
            });
        }

        var feature = evaluation.feature;
        var refund = feature.cost;

        var candidateFeatureIds = [];
        for (var i = 0; i < currentFeatureIds.length; i++) {
            if (currentFeatureIds[i] !== feature.id) {
                candidateFeatureIds.push(currentFeatureIds[i]);
            }
        }

        var wealthBefore = settlement.wealth;
        var wealthAfter = wealthBefore + refund;

        var candidate = _copyWith(settlement, {
            featureIds: candidateFeatureIds,
            wealth: wealthAfter
        });

        var publishedEvent = _getCommit().commit(locationId, candidate, {
            type: 'featureRemoved',
            featureId: feature.id,
            refund: refund,
            wealthAfter: wealthAfter
        });

        return {
            success: true,
            locationId: locationId,
            featureId: feature.id,
            featureName: feature.name,
            refund: refund,
            wealthBefore: wealthBefore,
            wealthAfter: wealthAfter,
            event: publishedEvent
        };
    }

    // =========================================================================
    // 5. DEMOLISH FEATURE (no refund, record history)
    // =========================================================================
    //
    // History record shape:
    //   {
    //     featureId,
    //     featureName,
    //     category,
    //     demolishedYear,   // world year
    //     demolishedReason, // string
    //     recordedAt        // technical timestamp (Date.now())
    //   }
    //
    // The feature removal and the history append are in the same
    // candidate. They cannot diverge.
    //

    /**
     * @param {string} locationId
     * @param {string} featureId
     * @param {Object} [options]
     * @param {string} [options.reason]
     * @returns {Object} structured result
     */
    function demolishFeature(locationId, featureId, options) {
        options = options || {};

        var settlement = _getSettlementQueries().getSettlementData(locationId);
        if (!settlement) {
            return _failure('SETTLEMENT_NOT_FOUND', { locationId: locationId });
        }

        var currentFeatureIds = settlement.featureIds || [];

        var evaluation = _getFeatureRules().evaluateRemoval({
            featureId: featureId,
            currentFeatureIds: currentFeatureIds
        });

        if (!evaluation.allowed) {
            return _failure('DEMOLITION_REJECTED', {
                featureId: featureId,
                reasons: evaluation.reasons
            });
        }

        var feature = evaluation.feature;

        var candidateFeatureIds = [];
        for (var i = 0; i < currentFeatureIds.length; i++) {
            if (currentFeatureIds[i] !== feature.id) {
                candidateFeatureIds.push(currentFeatureIds[i]);
            }
        }

        var worldYear = _getTime().getCurrentYear();

        var historyRecord = {
            featureId: feature.id,
            featureName: feature.name,
            category: feature.category,
            demolishedYear: worldYear,
            demolishedReason: typeof options.reason === 'string' && options.reason.length > 0
                ? options.reason
                : 'Demolished',
            recordedAt: Date.now()
        };

        var currentHistory = settlement.demolitionHistory || [];
        var candidateHistory = currentHistory.slice();
        candidateHistory.push(historyRecord);

        var candidate = _copyWith(settlement, {
            featureIds: candidateFeatureIds,
            demolitionHistory: candidateHistory
        });

        var publishedEvent = _getCommit().commit(locationId, candidate, {
            type: 'featureDemolished',
            featureId: feature.id,
            featureName: feature.name,
            demolishedYear: worldYear
        });

        return {
            success: true,
            locationId: locationId,
            featureId: feature.id,
            featureName: feature.name,
            demolishedYear: worldYear,
            event: publishedEvent
        };
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.SettlementFeatureCommands = Object.freeze({
        buildFeature: buildFeature,
        removeFeature: removeFeature,
        demolishFeature: demolishFeature
    });

})();
