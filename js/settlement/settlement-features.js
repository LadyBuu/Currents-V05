/**
 * =============================================================================
 * SETTLEMENT FEATURES - Business logic for settlement features
 * =============================================================================
 * 
 * This file contains business logic for:
 * - Feature definitions
 * - Feature validation (can afford, would create debt)
 * - Feature effects (prosperity, defense, crime reduction)
 * - Feature prerequisites
 * 
 * DEPENDENCIES:
 *   - settlement-state.js (SettlementState)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _processingFeatures = false;

    // =========================================================================
    // 2. FEATURE DEFINITIONS
    // =========================================================================

    function getAllFeatures() {
        if (_processingFeatures) {
            return [];
        }
        _processingFeatures = true;

        try {
            return SettlementState._getAllFeatures();

        } finally {
            _processingFeatures = false;
        }
    }

    function getFeatureById(featureId) {
        if (_processingFeatures) {
            return null;
        }
        _processingFeatures = true;

        try {
            var features = getAllFeatures();
            return features.find(function(f) { return f.id === featureId; }) || null;

        } finally {
            _processingFeatures = false;
        }
    }

    function getFeaturesByCategory(category) {
        if (_processingFeatures) {
            return [];
        }
        _processingFeatures = true;

        try {
            var features = getAllFeatures();
            return features.filter(function(f) { return f.category === category; });

        } finally {
            _processingFeatures = false;
        }
    }

    function getPublicFeatures() {
        if (_processingFeatures) {
            return [];
        }
        _processingFeatures = true;

        try {
            var features = getAllFeatures();
            return features.filter(function(f) { return f.isPublic !== false; });

        } finally {
            _processingFeatures = false;
        }
    }

    function getFeatureCategories() {
        if (_processingFeatures) {
            return {};
        }
        _processingFeatures = true;

        try {
            var features = getAllFeatures();
            var categories = {};
            for (var i = 0; i < features.length; i++) {
                var cat = features[i].category || 'uncategorized';
                if (!categories[cat]) categories[cat] = [];
                categories[cat].push(features[i]);
            }
            return categories;

        } finally {
            _processingFeatures = false;
        }
    }

    // =========================================================================
    // 3. FEATURE VALIDATION
    // =========================================================================

    function canAffordFeature(locationId, featureId) {
        if (_processingFeatures) {
            return false;
        }
        _processingFeatures = true;

        try {
            var data = SettlementState.getSettlementData(locationId);
            if (!data) return false;

            var feature = getFeatureById(featureId);
            if (!feature) return false;

            return (data.wealth || 0) >= feature.cost;

        } finally {
            _processingFeatures = false;
        }
    }

    function wouldCreateDebt(locationId, featureId) {
        if (_processingFeatures) {
            return false;
        }
        _processingFeatures = true;

        try {
            var data = SettlementState.getSettlementData(locationId);
            if (!data) return false;

            var feature = getFeatureById(featureId);
            if (!feature) return false;

            return (data.wealth || 0) < feature.cost;

        } finally {
            _processingFeatures = false;
        }
    }

    function hasPrerequisites(locationId, featureId) {
        if (_processingFeatures) {
            return false;
        }
        _processingFeatures = true;

        try {
            var feature = getFeatureById(featureId);
            if (!feature || !feature.prerequisites) return true;

            var existingFeatures = SettlementState.getSettlementFeatures(locationId);
            var existingIds = {};
            for (var i = 0; i < existingFeatures.length; i++) {
                existingIds[existingFeatures[i].id] = true;
            }

            for (var i = 0; i < feature.prerequisites.length; i++) {
                if (!existingIds[feature.prerequisites[i]]) {
                    return false;
                }
            }

            return true;

        } finally {
            _processingFeatures = false;
        }
    }

    function getFeatureCost(featureId) {
        if (_processingFeatures) {
            return 0;
        }
        _processingFeatures = true;

        try {
            var feature = getFeatureById(featureId);
            return feature ? feature.cost || 0 : 0;

        } finally {
            _processingFeatures = false;
        }
    }

    function getFeatureMaintenance(featureId) {
        if (_processingFeatures) {
            return 0;
        }
        _processingFeatures = true;

        try {
            var feature = getFeatureById(featureId);
            return feature ? feature.maintenance || 0 : 0;

        } finally {
            _processingFeatures = false;
        }
    }

    // =========================================================================
    // 4. FEATURE EFFECTS
    // =========================================================================

    function getFeatureProsperityBonus(featureId) {
        if (_processingFeatures) {
            return 0;
        }
        _processingFeatures = true;

        try {
            var feature = getFeatureById(featureId);
            return feature ? feature.prosperityBonus || 0 : 0;

        } finally {
            _processingFeatures = false;
        }
    }

    function getFeatureCrimeReduction(featureId) {
        if (_processingFeatures) {
            return 0;
        }
        _processingFeatures = true;

        try {
            var feature = getFeatureById(featureId);
            return feature ? feature.crimeReduction || 0 : 0;

        } finally {
            _processingFeatures = false;
        }
    }

    function getFeatureDefenseBonus(featureId) {
        if (_processingFeatures) {
            return 0;
        }
        _processingFeatures = true;

        try {
            var feature = getFeatureById(featureId);
            return feature ? feature.defense || 0 : 0;

        } finally {
            _processingFeatures = false;
        }
    }

    function getFeatureTradeBonus(featureId) {
        if (_processingFeatures) {
            return 0;
        }
        _processingFeatures = true;

        try {
            var feature = getFeatureById(featureId);
            return feature ? feature.tradeBonus || 0 : 0;

        } finally {
            _processingFeatures = false;
        }
    }

    function getFeatureEducationBonus(featureId) {
        if (_processingFeatures) {
            return 0;
        }
        _processingFeatures = true;

        try {
            var feature = getFeatureById(featureId);
            return feature ? feature.educationBonus || 0 : 0;

        } finally {
            _processingFeatures = false;
        }
    }

    function getFeatureLiteracyBonus(featureId) {
        if (_processingFeatures) {
            return 0;
        }
        _processingFeatures = true;

        try {
            var feature = getFeatureById(featureId);
            return feature ? feature.literacyBonus || 0 : 0;

        } finally {
            _processingFeatures = false;
        }
    }

    function getFeatureEffects(featureId) {
        if (_processingFeatures) {
            return null;
        }
        _processingFeatures = true;

        try {
            var feature = getFeatureById(featureId);
            if (!feature) return null;

            return {
                prosperityBonus: feature.prosperityBonus || 0,
                crimeReduction: feature.crimeReduction || 0,
                defenseBonus: feature.defense || 0,
                tradeBonus: feature.tradeBonus || 0,
                educationBonus: feature.educationBonus || 0,
                literacyBonus: feature.literacyBonus || 0,
                maintenance: feature.maintenance || 0,
                cost: feature.cost || 0
            };

        } finally {
            _processingFeatures = false;
        }
    }

    // =========================================================================
    // 5. EXPORTS
    // =========================================================================

    window.SettlementFeatures = {
        getAllFeatures: getAllFeatures,
        getFeatureById: getFeatureById,
        getFeaturesByCategory: getFeaturesByCategory,
        getPublicFeatures: getPublicFeatures,
        getFeatureCategories: getFeatureCategories,
        canAffordFeature: canAffordFeature,
        wouldCreateDebt: wouldCreateDebt,
        hasPrerequisites: hasPrerequisites,
        getFeatureCost: getFeatureCost,
        getFeatureMaintenance: getFeatureMaintenance,
        getFeatureProsperityBonus: getFeatureProsperityBonus,
        getFeatureCrimeReduction: getFeatureCrimeReduction,
        getFeatureDefenseBonus: getFeatureDefenseBonus,
        getFeatureTradeBonus: getFeatureTradeBonus,
        getFeatureEducationBonus: getFeatureEducationBonus,
        getFeatureLiteracyBonus: getFeatureLiteracyBonus,
        getFeatureEffects: getFeatureEffects
    };

})();