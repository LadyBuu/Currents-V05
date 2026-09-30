/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT FEATURE RULES
 * js/settlement/settlement-feature-rules.js
 * =============================================================================
 *
 * PURE FEATURE RULES.
 *
 * This file contains pure rule functions for feature eligibility,
 * prerequisites, affordability, and feature purchase evaluation. It
 * answers questions like:
 *   - does this feature exist?
 *   - is the settlement already building it?
 *   - are the prerequisites satisfied?
 *   - can the settlement afford it from current wealth?
 *   - if not, how far short is it?
 *   - should the purchase proceed (allowed) or be rejected, and why?
 *
 * It is pure. It depends only on SettlementFeatureDefinitions. It does not
 * read canonical settlement state. It does not mutate anything. It does
 * not persist. It does not display UI. It does not clamp. It does not
 * coerce. It does not fabricate missing values. It does not use recursion
 * guards.
 *
 * Contract reference: Settlement Architecture Contracts §5 (Missing-Value
 * Semantics), §9 (Rules Contract), §32 (Completion Standard).
 *
 * Design notes:
 *   - `wealth` may be zero or negative. It is not treated as missing when
 *     it is zero. `null`/`undefined` are explicitly invalid.
 *   - `featureIds` is the settlement's current feature id list. It may be
 *     empty. It may not be null/undefined when the settlement exists.
 *   - A feature with `cost: 0` is valid. A feature with `cost` missing is
 *     not possible because definitions declare every field explicitly.
 *   - Purchase evaluation returns a structured result, not a bare boolean
 *     and not a human string.
 *   - Reasons are reported in a stable order and all applicable reasons
 *     are collected.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HELPERS
    // =========================================================================

    function _getFeatureDefinitions() {
        return window.SettlementFeatureDefinitions.FEATURES;
    }

    function _findFeatureById(featureId) {
        if (featureId === null || featureId === undefined) return null;
        var features = _getFeatureDefinitions();
        for (var i = 0; i < features.length; i++) {
            if (features[i].id === featureId) return features[i];
        }
        return null;
    }

    function _isFiniteNumber(value) {
        return typeof value === 'number' && isFinite(value);
    }

    function _isArray(value) {
        return Object.prototype.toString.call(value) === '[object Array]';
    }

    // =========================================================================
    // 2. PREREQUISITE CHECK
    // =========================================================================
    //
    // Feature definitions do not currently declare prerequisites. This
    // function is provided so that when prerequisites are added to the
    // definition schema, the rule is already in place and callers do not
    // need to change.
    //
    // A feature with no `prerequisites` field, or with an empty array, has
    // no prerequisites. All declared prerequisites must be present in the
    // current featureIds to satisfy the rule.
    //

    /**
     * @param {Object} feature        feature definition
     * @param {string[]} currentFeatureIds
     * @returns {Object} { satisfied: boolean, missing: string[] }
     */
    function checkPrerequisites(feature, currentFeatureIds) {
        var missing = [];

        if (!feature) {
            return { satisfied: false, missing: missing };
        }

        var prerequisites = feature.prerequisites;
        if (!prerequisites || prerequisites.length === 0) {
            return { satisfied: true, missing: missing };
        }

        if (!_isArray(currentFeatureIds)) {
            // Without current feature ids we cannot verify prerequisites.
            // Report every prerequisite as missing rather than silently
            // succeeding.
            for (var i = 0; i < prerequisites.length; i++) {
                missing.push(prerequisites[i]);
            }
            return { satisfied: false, missing: missing };
        }

        for (var i = 0; i < prerequisites.length; i++) {
            var required = prerequisites[i];
            var found = false;
            for (var j = 0; j < currentFeatureIds.length; j++) {
                if (currentFeatureIds[j] === required) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                missing.push(required);
            }
        }

        return { satisfied: missing.length === 0, missing: missing };
    }

    // =========================================================================
    // 3. AFFORDABILITY
    // =========================================================================
    //
    // A feature is affordable if the settlement's current wealth is at
    // least the feature's cost. Debt is permitted by the underlying build
    // mechanic, so "unaffordable" here means "would require financing",
    // not "cannot be built".
    //

    /**
     * @param {number} wealth   current settlement wealth (may be negative)
     * @param {number} cost     feature cost (>= 0)
     * @returns {Object} { affordable: boolean, shortfall: number }
     */
    function evaluateAffordability(wealth, cost) {
        if (!_isFiniteNumber(wealth)) {
            return { affordable: false, shortfall: null };
        }
        if (!_isFiniteNumber(cost) || cost < 0) {
            return { affordable: false, shortfall: null };
        }
        if (wealth >= cost) {
            return { affordable: true, shortfall: 0 };
        }
        return { affordable: false, shortfall: cost - wealth };
    }

    // =========================================================================
    // 4. PURCHASE EVALUATION
    // =========================================================================
    //
    // This is the primary rule function. It combines existence,
    // duplicate-check, prerequisite-check, and affordability-check into a
    // single structured evaluation.
    //
    // It does not decide whether debt is permitted. It reports whether the
    // purchase would require financing. The command layer decides whether
    // financing becomes debt, or whether the purchase is rejected.
    //
    // Reason codes:
    //   UNKNOWN_FEATURE
    //   ALREADY_BUILT
    //   MISSING_PREREQUISITE        (with `missing` array)
    //   INSUFFICIENT_WEALTH         (with required/available/shortfall)
    //
    // A purchase is "allowed" if none of the blocking reasons are present.
    // Insufficient wealth is reported but does not by itself block the
    // purchase when the domain permits financing. That decision belongs to
    // the caller via the `allowFinancing` input.
    //

    /**
     * @param {Object} input
     * @param {string} input.featureId
     * @param {string[]} input.currentFeatureIds
     * @param {number} input.wealth
     * @param {boolean} [input.allowFinancing]  default false
     * @returns {Object}
     *   {
     *     allowed: boolean,
     *     feature: Object|null,
     *     cost: number|null,
     *     requiresFinancing: boolean,
     *     shortfall: number,
     *     reasons: Array<Object>
     *   }
     */
    function evaluatePurchase(input) {
        input = input || {};

        var result = {
            allowed: false,
            feature: null,
            cost: null,
            requiresFinancing: false,
            shortfall: 0,
            reasons: []
        };

        // --- Feature existence ---
        var feature = _findFeatureById(input.featureId);
        if (!feature) {
            result.reasons.push({
                code: 'UNKNOWN_FEATURE',
                featureId: input.featureId
            });
            return result;
        }
        result.feature = feature;
        result.cost = feature.cost;

        // --- Duplicate check ---
        var currentFeatureIds = _isArray(input.currentFeatureIds)
            ? input.currentFeatureIds
            : null;

        if (currentFeatureIds) {
            for (var i = 0; i < currentFeatureIds.length; i++) {
                if (currentFeatureIds[i] === feature.id) {
                    result.reasons.push({
                        code: 'ALREADY_BUILT',
                        featureId: feature.id
                    });
                    break;
                }
            }
        }

        // --- Prerequisites ---
        var prereq = checkPrerequisites(feature, currentFeatureIds);
        if (!prereq.satisfied && prereq.missing.length > 0) {
            result.reasons.push({
                code: 'MISSING_PREREQUISITE',
                featureId: feature.id,
                missing: prereq.missing
            });
        }

        // --- Affordability ---
        var afford = evaluateAffordability(input.wealth, feature.cost);
        if (afford.shortfall === null) {
            // Wealth or cost could not be evaluated. Treat as blocking.
            result.reasons.push({
                code: 'INVALID_WEALTH_INPUT',
                wealth: input.wealth,
                cost: feature.cost
            });
        } else if (!afford.affordable) {
            result.requiresFinancing = true;
            result.shortfall = afford.shortfall;
            if (!input.allowFinancing) {
                result.reasons.push({
                    code: 'INSUFFICIENT_WEALTH',
                    required: feature.cost,
                    available: input.wealth,
                    shortfall: afford.shortfall
                });
            }
        }

        result.allowed = result.reasons.length === 0;
        return result;
    }

    // =========================================================================
    // 5. REMOVAL / DEMOLITION EVALUATION
    // =========================================================================
    //
    // Removal and demolition both require the feature to be present. They
    // differ in refund policy, which is applied by the command layer, not
    // by this rule. This rule only establishes whether the operation is
    // permitted against the current settlement feature set.
    //
    // Reason codes:
    //   UNKNOWN_FEATURE
    //   NOT_BUILT
    //

    /**
     * @param {Object} input
     * @param {string} input.featureId
     * @param {string[]} input.currentFeatureIds
     * @returns {Object}
     *   {
     *     allowed: boolean,
     *     feature: Object|null,
     *     reasons: Array<Object>
     *   }
     */
    function evaluateRemoval(input) {
        input = input || {};

        var result = {
            allowed: false,
            feature: null,
            reasons: []
        };

        var feature = _findFeatureById(input.featureId);
        if (!feature) {
            result.reasons.push({
                code: 'UNKNOWN_FEATURE',
                featureId: input.featureId
            });
            return result;
        }
        result.feature = feature;

        var currentFeatureIds = _isArray(input.currentFeatureIds)
            ? input.currentFeatureIds
            : null;

        if (!currentFeatureIds) {
            result.reasons.push({
                code: 'NOT_BUILT',
                featureId: feature.id
            });
            return result;
        }

        var found = false;
        for (var i = 0; i < currentFeatureIds.length; i++) {
            if (currentFeatureIds[i] === feature.id) {
                found = true;
                break;
            }
        }
        if (!found) {
            result.reasons.push({
                code: 'NOT_BUILT',
                featureId: feature.id
            });
            return result;
        }

        result.allowed = true;
        return result;
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.SettlementFeatureRules = Object.freeze({
        checkPrerequisites: checkPrerequisites,
        evaluateAffordability: evaluateAffordability,
        evaluatePurchase: evaluatePurchase,
        evaluateRemoval: evaluateRemoval
    });

})();
