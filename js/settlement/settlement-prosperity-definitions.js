/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT PROSPERITY DEFINITIONS
 * js/settlement/settlement-prosperity-definitions.js
 * =============================================================================
 *
 * AUTHORITATIVE OWNER OF PROSPERITY CLASSIFICATION AND BASE VALUE.
 *
 * This file contains the canonical prosperity bands used to classify a
 * settlement's prosperity for display and for any domain rule that needs
 * to reason about prosperity tier. It also declares the neutral base
 * value used as a starting point when no baseline exists.
 *
 * It is pure data. It has no dependencies. It does not read state. It does
 * not mutate anything. It does not calculate prosperity. It does not
 * classify a value itself.
 *
 * Contract reference: Settlement Architecture Contracts §8 (Definitions),
 * §22 (Prosperity Contract), §32 (Completion Standard).
 *
 * Naming note: `BASE_PROSPERITY` is a starting input, not a persisted
 * canonical value. It represents the neutral baseline a settlement is
 * assumed to have before modifiers are applied. It is used by the
 * prosperity calculation, not stored on the settlement record.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // BASE PROSPERITY
    // =========================================================================
    //
    // Neutral starting value when a settlement has no explicit baseline.
    // The prosperity calculation consumes this as an input. It is not
    // written back to canonical state.
    //

    var BASE_PROSPERITY = 50;

    // =========================================================================
    // PROSPERITY BANDS
    // =========================================================================
    //
    // Ordered from highest to lowest. Classification rules walk bands in
    // order and return the first whose `min` is satisfied.
    //
    // color: fixed palette per band. Consumers reference the color as data.
    //        They do not maintain their own prosperity-to-color map.
    //

    var PROSPERITY_BANDS = Object.freeze([
        Object.freeze({
            id: 'thriving',
            name: 'Thriving',
            min: 70,
            color: 'var(--success)'
        }),
        Object.freeze({
            id: 'stable',
            name: 'Stable',
            min: 40,
            color: 'var(--accent)'
        }),
        Object.freeze({
            id: 'struggling',
            name: 'Struggling',
            min: 0,
            color: 'var(--danger)'
        })
    ]);

    // =========================================================================
    // EXPORTS
    // =========================================================================

    window.SettlementProsperityDefinitions = Object.freeze({
        BASE_PROSPERITY: BASE_PROSPERITY,
        PROSPERITY_BANDS: PROSPERITY_BANDS
    });

})();
