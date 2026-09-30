/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT RANK DEFINITIONS
 * js/settlement/settlement-rank-definitions.js
 * =============================================================================
 *
 * AUTHORITATIVE OWNER OF RANK DEFINITIONS.
 *
 * This file contains the canonical rank catalog for settlements: the
 * ordered tiers of settlement size and status, their population bounds,
 * their base tax rate, and their effect multipliers.
 *
 * It is pure data. It has no dependencies. It does not read state. It does
 * not mutate anything. It does not calculate eligibility. It does not
 * determine the current rank of any settlement.
 *
 * Rank eligibility rules live in settlement-rank-rules.js.
 * Current rank is canonical settlement state (`settlement.rankId`).
 * This file only declares what ranks exist and what each one means.
 *
 * Contract reference: Settlement Architecture Contracts §4 (Field
 * Classification), §8 (Definitions), §17 (Rank Contract).
 *
 * Naming note: `prosperityMultiplier` and `populationMultiplier` are
 * multipliers, not additive modifiers. They are applied as factors, not
 * added to a value. The name reflects that.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // RANK DEFINITIONS
    // =========================================================================
    //
    // order:        ascending tier index; must be unique and contiguous
    // minPopulation: inclusive lower bound for eligibility
    // maxPopulation: inclusive upper bound for eligibility
    // baseTax:      base tax rate (percent) applied before tax policy multiplier
    // prosperityMultiplier: factor applied to prosperity calculation for this rank
    // populationMultiplier: factor applied to rank-based population effects
    //
    // Every field is explicit. No field is left undefined for a rank. A rank
    // with no meaningful modifier uses 1.0, not a missing field.
    //

    var RANKS = Object.freeze([
        Object.freeze({
            id: 'hamlet',
            name: 'Hamlet',
            order: 1,
            minPopulation: 0,
            maxPopulation: 99,
            baseTax: 5,
            prosperityMultiplier: 0.8,
            populationMultiplier: 1.0,
            description: 'A small cluster of dwellings'
        }),
        Object.freeze({
            id: 'village',
            name: 'Village',
            order: 2,
            minPopulation: 100,
            maxPopulation: 999,
            baseTax: 15,
            prosperityMultiplier: 0.9,
            populationMultiplier: 1.1,
            description: 'A small rural community'
        }),
        Object.freeze({
            id: 'town',
            name: 'Town',
            order: 3,
            minPopulation: 1000,
            maxPopulation: 4999,
            baseTax: 50,
            prosperityMultiplier: 1.0,
            populationMultiplier: 1.2,
            description: 'A market town with trade'
        }),
        Object.freeze({
            id: 'city',
            name: 'City',
            order: 4,
            minPopulation: 5000,
            maxPopulation: 19999,
            baseTax: 150,
            prosperityMultiplier: 1.1,
            populationMultiplier: 1.3,
            description: 'A major urban center'
        }),
        Object.freeze({
            id: 'metropolis',
            name: 'Metropolis',
            order: 5,
            minPopulation: 20000,
            maxPopulation: 999999,
            baseTax: 400,
            prosperityMultiplier: 1.2,
            populationMultiplier: 1.4,
            description: 'A sprawling capital'
        })
    ]);

    // =========================================================================
    // EXPORTS
    // =========================================================================

    window.SettlementRankDefinitions = Object.freeze({
        RANKS: RANKS
    });

})();
