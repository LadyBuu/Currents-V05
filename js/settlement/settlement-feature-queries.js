/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT FEATURE QUERIES
 * js/settlement/settlement-feature-queries.js
 * =============================================================================
 *
 * FEATURE QUERIES.
 *
 * This file provides read-only queries over the feature catalog and over
 * a settlement's current feature set. It answers:
 *   - what features exist?
 *   - what is a given feature's definition?
 *   - what features are in a given category?
 *   - what features does a settlement currently have?
 *   - what public features are available but not yet built?
 *   - what is the aggregate effect of a settlement's built features?
 *
 * It is a query module. It:
 *   - reads definitions from SettlementFeatureDefinitions
 *   - reads settlement feature ids from SettlementQueries
 *   - does not mutate anything
 *   - does not persist
 *   - does not display UI
 *   - does not fabricate missing values
 *   - does not use recursion guards
 *
 * Contract reference: Settlement Architecture Contracts §8 (Definitions),
 * §10 (Query Contract), §11 (Query Results and Missing Data), §32
 * (Completion Standard).
 *
 * Scope discipline:
 *
 *   This module owns reading the feature catalog and deriving feature-based
 *   views. It does NOT own:
 *     - feature eligibility      -> SettlementFeatureRules
 *     - feature mutation         -> SettlementFeatureCommands
 *     - feature cost calculation -> read from definition directly
 *     - presentation labels      -> UI layer
 *
 *   Aggregate effect computation (sum of prosperityBonus, max of
 *   tradeBonus, etc.) is provided here as a read-only convenience because
 *   the aggregation rule is definition-derived and stable, not a policy
 *   decision. If it later becomes a policy, it moves to a rules module.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY ACCESS
    // =========================================================================

    function _getFeatureDefinitions() {
        return window.SettlementFeatureDefinitions.FEATURES;
    }

    function _getFeatureCategories() {
        return window.SettlementFeatureDefinitions.FEATURE_CATEGORIES;
    }

    // =========================================================================
    // 2. CATALOG QUERIES
    // =========================================================================

    /**
     * Returns all feature definitions in their declared order.
     * @returns {Array<Object>}
     */
    function getAllFeatures() {
        return _getFeatureDefinitions();
    }

    /**
     * Returns a feature definition by id, or null if no such feature
     * exists.
     * @param {string} featureId
     * @returns {Object|null}
     */
    function getFeatureById(featureId) {
        if (featureId === null || featureId === undefined) return null;
        var features = _getFeatureDefinitions();
        for (var i = 0; i < features.length; i++) {
            if (features[i].id === featureId) return features[i];
        }
        return null;
    }

    /**
     * Returns all feature definitions in a given category, in their
     * declared order. Returns an empty array if the category is unknown
     * or has no features.
     * @param {string} categoryId
     * @returns {Array<Object>}
     */
    function getFeaturesByCategory(categoryId) {
        if (categoryId === null || categoryId === undefined) return [];
        var features = _getFeatureDefinitions();
        var result = [];
        for (var i = 0; i < features.length; i++) {
            if (features[i].category === categoryId) {
                result.push(features[i]);
            }
        }
        return result;
    }

    /**
     * Returns all feature definitions where `isPublic === true`, in their
     * declared order.
     * @returns {Array<Object>}
     */
    function getPublicFeatures() {
        var features = _getFeatureDefinitions();
        var result = [];
        for (var i = 0; i < features.length; i++) {
            if (features[i].isPublic === true) {
                result.push(features[i]);
            }
        }
        return result;
    }

    /**
     * Returns all category definitions in their declared order.
     * @returns {Array<Object>}
     */
    function getAllCategories() {
        return _getFeatureCategories();
    }

    /**
     * Returns a category definition by id, or null.
     * @param {string} categoryId
     * @returns {Object|null}
     */
    function getCategoryById(categoryId) {
        if (categoryId === null || categoryId === undefined) return null;
        var categories = _getFeatureCategories();
        for (var i = 0; i < categories.length; i++) {
            if (categories[i].id === categoryId) return categories[i];
        }
        return null;
    }

    // =========================================================================
    // 3. SETTLEMENT FEATURE QUERIES
    // =========================================================================

    /**
     * Returns the resolved feature definitions currently built in the
     * given settlement, in the order their ids appear in the settlement
     * record.
     *
     * Ids that do not resolve to a known feature definition are skipped.
     * This can happen during a migration or if a feature definition was
     * removed; the caller is not expected to receive null entries.
     *
     * Returns null if the settlement does not exist. Returns an empty
     * array if the settlement exists but has no features.
     *
     * @param {string} locationId
     * @returns {Array<Object>|null}
     */
    function getSettlementFeatures(locationId) {
        var ids = window.SettlementQueries.getFeatureIds(locationId);
        if (ids === null) return null;
        if (ids.length === 0) return [];

        var features = _getFeatureDefinitions();
        var byId = {};
        for (var i = 0; i < features.length; i++) {
            byId[features[i].id] = features[i];
        }

        var result = [];
        for (var j = 0; j < ids.length; j++) {
            var feature = byId[ids[j]];
            if (feature) result.push(feature);
        }
        return result;
    }

    /**
     * Returns true if the settlement currently has the given feature
     * built. Returns null if the settlement does not exist.
     *
     * @param {string} locationId
     * @param {string} featureId
     * @returns {boolean|null}
     */
    function hasFeature(locationId, featureId) {
        var ids = window.SettlementQueries.getFeatureIds(locationId);
        if (ids === null) return null;
        if (featureId === null || featureId === undefined) return false;
        for (var i = 0; i < ids.length; i++) {
            if (ids[i] === featureId) return true;
        }
        return false;
    }

    /**
     * Returns the public features that a settlement has not yet built,
     * in their declared order. Returns null if the settlement does not
     * exist.
     *
     * @param {string} locationId
     * @returns {Array<Object>|null}
     */
    function getAvailablePublicFeatures(locationId) {
        var ids = window.SettlementQueries.getFeatureIds(locationId);
        if (ids === null) return null;

        var built = {};
        for (var i = 0; i < ids.length; i++) {
            built[ids[i]] = true;
        }

        var features = _getFeatureDefinitions();
        var result = [];
        for (var j = 0; j < features.length; j++) {
            if (features[j].isPublic === true && !built[features[j].id]) {
                result.push(features[j]);
            }
        }
        return result;
    }

    // =========================================================================
    // 4. AGGREGATE EFFECT QUERIES
    // =========================================================================
    //
    // These compute aggregate effects over a settlement's built features.
    // They are read-only and definition-derived. They do not apply policy
    // beyond simple aggregation.
    //
    // Aggregation rules:
    //   - Additive fields (prosperityBonus, crimeReduction, defense,
    //     literacyBonus, maintenance): sum.
    //   - Multiplicative fields (tradeBonus, educationBonus): product.
    //
    // Returns null if the settlement does not exist. Returns a result
    // object with all aggregate fields present (zero or 1.0 for empty).
    //

    /**
     * @param {string} locationId
     * @returns {Object|null}
     *   {
     *     totalCost: number,
     *     totalMaintenance: number,
     *     prosperityBonus: number,
     *     crimeReduction: number,
     *     defense: number,
     *     tradeBonus: number,       // product, base 1.0
     *     educationBonus: number,   // product, base 1.0
     *     literacyBonus: number,
     *     featureCount: number
     *   }
     */
    function getSettlementFeatureEffects(locationId) {
        var features = getSettlementFeatures(locationId);
        if (features === null) return null;

        var effects = {
            totalCost: 0,
            totalMaintenance: 0,
            prosperityBonus: 0,
            crimeReduction: 0,
            defense: 0,
            tradeBonus: 1.0,
            educationBonus: 1.0,
            literacyBonus: 0,
            featureCount: features.length
        };

        for (var i = 0; i < features.length; i++) {
            var f = features[i];
            effects.totalCost += f.cost;
            effects.totalMaintenance += f.maintenance;
            effects.prosperityBonus += f.prosperityBonus;
            effects.crimeReduction += f.crimeReduction;
            effects.defense += f.defense;
            effects.tradeBonus *= f.tradeBonus;
            effects.educationBonus *= f.educationBonus;
            effects.literacyBonus += f.literacyBonus;
        }

        return effects;
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.SettlementFeatureQueries = Object.freeze({
        // Catalog
        getAllFeatures: getAllFeatures,
        getFeatureById: getFeatureById,
        getFeaturesByCategory: getFeaturesByCategory,
        getPublicFeatures: getPublicFeatures,
        getAllCategories: getAllCategories,
        getCategoryById: getCategoryById,

        // Settlement feature set
        getSettlementFeatures: getSettlementFeatures,
        hasFeature: hasFeature,
        getAvailablePublicFeatures: getAvailablePublicFeatures,

        // Aggregate effects
        getSettlementFeatureEffects: getSettlementFeatureEffects
    });

})();
