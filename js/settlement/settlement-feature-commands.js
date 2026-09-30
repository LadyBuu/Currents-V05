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
 * Each command is one logical transaction. It:
 *   1. reads canonical settlement state
 *   2. resolves required inputs
 *   3. builds a candidate settlement object
 *   4. validates the operation via SettlementFeatureRules
 *   5. applies domain consequences (cost, refund, debt, history)
 *   6. commits the candidate to canonical storage
 *   7. rebuilds SettlementState indexes
 *   8. persists once
 *   9. publishes one event
 *  10. returns a structured result
 *
 * It does not:
 *   - display UI
 *   - log events via a UI-facing logger
 *   - show toasts
 *   - clamp or coerce inputs
 *   - fabricate missing values
 *   - use recursion guards
 *   - delegate mutation to SettlementState private methods
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
 *     atomically.
 *   - Removal refunds the full build cost. This is a rule of the removal
 *     command, not a property of the feature definition.
 *   - Demolition refunds nothing and appends a demolition history
 *     record. The history record and the feature removal happen in the
 *     same commit; they cannot diverge.
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

    function _getState() {
        return window.SettlementState;
    }

    function _getTime() {
        // Time is a required dependency. If it is unavailable, the
        // application is not in a valid state, and the call will throw.
        // There is no fallback year.
        return window.Time;
    }

    // =========================================================================
    // 2. CANONICAL STORE WRITE
    // =========================================================================
    //
    // The canonical store is masterData.data.settlementData. Commands are
    // the only modules allowed to replace the canonical record for a
    // location. State rebuilds its derived indexes after a successful
    // commit; it does not own the write itself.
    //

    function _getCanonicalStore() {
        if (!window.masterData || !window.masterData.data) {
            throw new Error('SettlementFeatureCommands: masterData not available');
        }
        if (!window.masterData.data.settlementData) {
            window.masterData.data.settlementData = {};
        }
        return window.masterData.data.settlementData;
    }

    // =========================================================================
    // 3. HELPERS
    // =========================================================================

    function _isFiniteNumber(value) {
        return typeof value === 'number' && isFinite(value);
    }

    function _failure(code, details) {
        return {
            success: false,
            code: code,
            details: details || {}
        };
    }

    // =========================================================================
    // 4. BUILD FEATURE
    // =========================================================================
    //
    // Transaction:
    //   read → candidate → validate → apply cost/debt → commit → rebuild
    //   → persist → publish → return
    //
    // Debt rule (per §18 and the domain decision above):
    //   - cost is deducted from wealth
    //   - if resulting wealth is negative, the shortfall is added to debt
    //     and wealth is left as the negative residual
    //   - the shortfall added to debt equals the amount by which wealth
    //     would go below zero
    //
    // Example:
    //   wealth = 300, cost = 500  →  wealth = -200, debt += 200
    //   wealth = 800, cost = 500  →  wealth = 300,  debt unchanged
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
        var debtAfter = settlement.totalDebt;

        if (wealthAfter < 0 && wealthBefore >= 0) {
            // Wealth crossed from non-negative to negative. Shortfall is
            // added to debt; wealth keeps the negative residual.
            debtDelta = -wealthAfter;
            debtAfter = settlement.totalDebt + debtDelta;
        } else if (wealthAfter < 0 && wealthBefore < 0) {
            // Wealth was already negative. The entire cost adds to debt.
            debtDelta = cost;
            debtAfter = settlement.totalDebt + cost;
        }
        // else: wealth stayed non-negative; no debt change.

        var candidateFeatureIds = currentFeatureIds.slice();
        candidateFeatureIds.push(feature.id);

        var candidate = _copySettlementWith(settlement, {
            featureIds: candidateFeatureIds,
            wealth: wealthAfter,
            totalDebt: debtAfter
        });

        // --- Commit ---
        _commit(locationId, candidate);

        // --- Result ---
        return {
            success: true,
            locationId: locationId,
            featureId: feature.id,
            cost: cost,
            wealthBefore: wealthBefore,
            wealthAfter: wealthAfter,
            debtDelta: debtDelta,
            debtAfter: debtAfter
        };
    }

    // =========================================================================
    // 5. REMOVE FEATURE (full refund)
    // =========================================================================
    //
    // Transaction:
    //   read → candidate → validate → apply refund → commit → rebuild
    //   → persist → publish → return
    //
    // Refund rule:
    //   - the feature's full cost is added to wealth
    //   - debt is unchanged
    //

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

        var candidate = _copySettlementWith(settlement, {
            featureIds: candidateFeatureIds,
            wealth: wealthAfter
        });

        // --- Commit ---
        _commit(locationId, candidate);

        return {
            success: true,
            locationId: locationId,
            featureId: feature.id,
            refund: refund,
            wealthBefore: wealthBefore,
            wealthAfter: wealthAfter
        };
    }

    // =========================================================================
    // 6. DEMOLISH FEATURE (no refund, record history)
    // =========================================================================
    //
    // Transaction:
    //   read → candidate → validate → remove feature → append history
    //   → commit → rebuild → persist → publish → return
    //
    // The feature removal and the history append happen in the same
    // candidate. They cannot diverge. There is no window in which the
    // feature is gone but the demolition record is missing, or vice
    // versa.
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

        var candidate = _copySettlementWith(settlement, {
            featureIds: candidateFeatureIds,
            demolitionHistory: candidateHistory
        });

        // --- Commit ---
        _commit(locationId, candidate);

        return {
            success: true,
            locationId: locationId,
            featureId: feature.id,
            featureName: feature.name,
            demolishedYear: worldYear
        };
    }

    // =========================================================================
    // 7. COMMIT
    // =========================================================================
    //
    // The commit sequence is fixed by the contract:
    //   commit candidate → rebuild indexes → persist once → publish once
    //
    // The command does not perform these steps individually at each call
    // site; they are bundled here so the ordering is enforced in one
    // place.
    //

    function _commit(locationId, candidate) {
        var store = _getCanonicalStore();
        store[locationId] = candidate;

        _getState().rebuildIndexes();

        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }

        _getState().publish({
            type: 'settlementCommitted',
            locationId: locationId
        });
    }

    // =========================================================================
    // 8. CANDIDATE CONSTRUCTION
    // =========================================================================
    //
    // A shallow copy with overridden fields. The candidate is a fresh
    // object. Nested objects (budget, employment) are shared by reference
    // until a command needs to modify them; a command that modifies a
    // nested object is responsible for replacing that object with a fresh
    // copy before committing. This keeps the commit path cheap while
    // preventing accidental shared-reference mutation across the commit
    // boundary.
    //

    function _copySettlementWith(source, overrides) {
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
    // 9. EXPORTS
    // =========================================================================

    window.SettlementFeatureCommands = Object.freeze({
        buildFeature: buildFeature,
        removeFeature: removeFeature,
        demolishFeature: demolishFeature
    });

})();
