/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT FEATURE DEFINITIONS
 * js/settlement/settlement-feature-definitions.js
 * =============================================================================
 *
 * AUTHORITATIVE OWNER OF FEATURE DEFINITIONS AND FEATURE CATEGORIES.
 *
 * This file contains the canonical catalog of settlement features and the
 * canonical list of feature categories. Every feature definition declares
 * every effect field explicitly. Missing fields are not permitted.
 *
 * It is pure data. It has no dependencies. It does not read state. It does
 * not mutate anything. It does not validate. It does not check
 * prerequisites. It does not calculate cost or effects. It does not decide
 * whether a settlement can build a feature.
 *
 * Contract reference: Settlement Architecture Contracts §4 (Field
 * Classification), §8 (Definitions), §32 (Completion Standard).
 *
 * Field conventions for every feature:
 *   id             string   canonical identifier
 *   name           string   display name
 *   category       string   must match a FEATURE_CATEGORY id
 *   description    string   short human-readable description
 *   cost           number   one-time build cost in gold (>= 0)
 *   maintenance    number   annual maintenance cost in gold (>= 0)
 *   prosperityBonus number  additive prosperity contribution (>= 0)
 *   crimeReduction  number  additive crime-rate reduction (>= 0)
 *   defense         number  additive defense contribution (>= 0)
 *   tradeBonus      number  multiplicative trade factor (>= 1.0)
 *   educationBonus  number  multiplicative education factor (>= 1.0)
 *   literacyBonus   number  additive literacy contribution (>= 0)
 *   isPublic        boolean whether the feature is settlement-owned
 *
 * Every numeric field has an explicit value. If a feature has no trade
 * bonus, it declares tradeBonus: 1.0, not omission. If a feature has no
 * prosperity effect, it declares prosperityBonus: 0. This makes the
 * definition table a complete record rather than a sparse one.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // FEATURE CATEGORIES
    // =========================================================================

    var FEATURE_CATEGORIES = Object.freeze([
        Object.freeze({ id: 'defensive',      name: 'Defensive' }),
        Object.freeze({ id: 'civic',          name: 'Civic' }),
        Object.freeze({ id: 'military',       name: 'Military' }),
        Object.freeze({ id: 'aesthetic',      name: 'Aesthetic' }),
        Object.freeze({ id: 'infrastructure', name: 'Infrastructure' })
    ]);

    // =========================================================================
    // FEATURES
    // =========================================================================

    var FEATURES = Object.freeze([
        // ----------------------------------------------------------------
        // DEFENSIVE
        // ----------------------------------------------------------------
        Object.freeze({
            id: 'walls',
            name: 'Defensive Walls',
            category: 'defensive',
            description: 'Stone walls for protection',
            cost: 500,
            maintenance: 10,
            prosperityBonus: 5,
            crimeReduction: 0.10,
            defense: 5,
            tradeBonus: 1.0,
            educationBonus: 1.0,
            literacyBonus: 0,
            isPublic: true
        }),
        Object.freeze({
            id: 'fort',
            name: 'Fortification',
            category: 'defensive',
            description: 'Military stronghold',
            cost: 600,
            maintenance: 15,
            prosperityBonus: 3,
            crimeReduction: 0.15,
            defense: 8,
            tradeBonus: 1.0,
            educationBonus: 1.0,
            literacyBonus: 0,
            isPublic: true
        }),
        Object.freeze({
            id: 'watchtower',
            name: 'Watchtower',
            category: 'defensive',
            description: 'Lookout post',
            cost: 150,
            maintenance: 4,
            prosperityBonus: 0,
            crimeReduction: 0.10,
            defense: 3,
            tradeBonus: 1.0,
            educationBonus: 1.0,
            literacyBonus: 0,
            isPublic: true
        }),
        Object.freeze({
            id: 'moat',
            name: 'Moat',
            category: 'defensive',
            description: 'Water-filled defensive ditch',
            cost: 350,
            maintenance: 8,
            prosperityBonus: 2,
            crimeReduction: 0.08,
            defense: 6,
            tradeBonus: 1.0,
            educationBonus: 1.0,
            literacyBonus: 0,
            isPublic: true
        }),

        // ----------------------------------------------------------------
        // CIVIC
        // ----------------------------------------------------------------
        Object.freeze({
            id: 'town_hall',
            name: 'Town Hall',
            category: 'civic',
            description: 'Government and administration center',
            cost: 300,
            maintenance: 8,
            prosperityBonus: 6,
            crimeReduction: 0.05,
            defense: 0,
            tradeBonus: 1.0,
            educationBonus: 1.0,
            literacyBonus: 0,
            isPublic: true
        }),
        Object.freeze({
            id: 'courthouse',
            name: 'Courthouse',
            category: 'civic',
            description: 'Center of justice',
            cost: 300,
            maintenance: 8,
            prosperityBonus: 5,
            crimeReduction: 0.25,
            defense: 0,
            tradeBonus: 1.0,
            educationBonus: 1.0,
            literacyBonus: 0,
            isPublic: true
        }),
        Object.freeze({
            id: 'school',
            name: 'School',
            category: 'civic',
            description: 'Center of learning',
            cost: 200,
            maintenance: 5,
            prosperityBonus: 12,
            crimeReduction: 0,
            defense: 0,
            tradeBonus: 1.0,
            educationBonus: 1.2,
            literacyBonus: 5,
            isPublic: true
        }),
        Object.freeze({
            id: 'library',
            name: 'Library',
            category: 'civic',
            description: 'Center of knowledge',
            cost: 250,
            maintenance: 8,
            prosperityBonus: 10,
            crimeReduction: 0,
            defense: 0,
            tradeBonus: 1.0,
            educationBonus: 1.3,
            literacyBonus: 8,
            isPublic: true
        }),
        Object.freeze({
            id: 'market_square',
            name: 'Market Square',
            category: 'civic',
            description: 'Center of commerce',
            cost: 200,
            maintenance: 5,
            prosperityBonus: 10,
            crimeReduction: 0,
            defense: 0,
            tradeBonus: 1.3,
            educationBonus: 1.0,
            literacyBonus: 0,
            isPublic: true
        }),
        Object.freeze({
            id: 'guildhall',
            name: 'Guildhall',
            category: 'civic',
            description: 'Guild headquarters',
            cost: 250,
            maintenance: 4,
            prosperityBonus: 7,
            crimeReduction: 0,
            defense: 0,
            tradeBonus: 1.2,
            educationBonus: 1.0,
            literacyBonus: 0,
            isPublic: true
        }),

        // ----------------------------------------------------------------
        // MILITARY
        // ----------------------------------------------------------------
        Object.freeze({
            id: 'barracks',
            name: 'Barracks',
            category: 'military',
            description: 'Soldier housing',
            cost: 350,
            maintenance: 10,
            prosperityBonus: 2,
            crimeReduction: 0.20,
            defense: 0,
            tradeBonus: 1.0,
            educationBonus: 1.0,
            literacyBonus: 0,
            isPublic: true
        }),
        Object.freeze({
            id: 'garrison',
            name: 'Garrison',
            category: 'military',
            description: 'Permanent military base',
            cost: 500,
            maintenance: 15,
            prosperityBonus: 3,
            crimeReduction: 0.25,
            defense: 0,
            tradeBonus: 1.0,
            educationBonus: 1.0,
            literacyBonus: 0,
            isPublic: true
        }),

        // ----------------------------------------------------------------
        // AESTHETIC
        // ----------------------------------------------------------------
        Object.freeze({
            id: 'park',
            name: 'Public Park',
            category: 'aesthetic',
            description: 'Public green space',
            cost: 100,
            maintenance: 3,
            prosperityBonus: 4,
            crimeReduction: 0,
            defense: 0,
            tradeBonus: 1.0,
            educationBonus: 1.0,
            literacyBonus: 0,
            isPublic: true
        }),
        Object.freeze({
            id: 'gardens',
            name: 'Public Gardens',
            category: 'aesthetic',
            description: 'Ornamental gardens',
            cost: 150,
            maintenance: 4,
            prosperityBonus: 5,
            crimeReduction: 0,
            defense: 0,
            tradeBonus: 1.0,
            educationBonus: 1.0,
            literacyBonus: 0,
            isPublic: true
        }),

        // ----------------------------------------------------------------
        // INFRASTRUCTURE
        // ----------------------------------------------------------------
        Object.freeze({
            id: 'paved_roads',
            name: 'Paved Roads',
            category: 'infrastructure',
            description: 'Stone-paved streets',
            cost: 250,
            maintenance: 8,
            prosperityBonus: 7,
            crimeReduction: 0,
            defense: 0,
            tradeBonus: 1.0,
            educationBonus: 1.0,
            literacyBonus: 0,
            isPublic: true
        }),
        Object.freeze({
            id: 'sewer_system',
            name: 'Sewer System',
            category: 'infrastructure',
            description: 'Underground drainage',
            cost: 300,
            maintenance: 6,
            prosperityBonus: 8,
            crimeReduction: 0.08,
            defense: 0,
            tradeBonus: 1.0,
            educationBonus: 1.0,
            literacyBonus: 0,
            isPublic: true
        }),
        Object.freeze({
            id: 'water_system',
            name: 'Water System',
            category: 'infrastructure',
            description: 'Aqueducts and public fountains',
            cost: 250,
            maintenance: 5,
            prosperityBonus: 6,
            crimeReduction: 0,
            defense: 0,
            tradeBonus: 1.0,
            educationBonus: 1.0,
            literacyBonus: 0,
            isPublic: true
        }),
        Object.freeze({
            id: 'bridge',
            name: 'Bridge',
            category: 'infrastructure',
            description: 'Public crossing over water',
            cost: 200,
            maintenance: 4,
            prosperityBonus: 5,
            crimeReduction: 0,
            defense: 0,
            tradeBonus: 1.0,
            educationBonus: 1.0,
            literacyBonus: 0,
            isPublic: true
        })
    ]);

    // =========================================================================
    // EXPORTS
    // =========================================================================

    window.SettlementFeatureDefinitions = Object.freeze({
        FEATURES: FEATURES,
        FEATURE_CATEGORIES: FEATURE_CATEGORIES
    });

})();
