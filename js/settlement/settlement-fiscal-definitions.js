/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT FISCAL DEFINITIONS
 * js/settlement/settlement-fiscal-definitions.js
 * =============================================================================
 *
 * AUTHORITATIVE OWNER OF FISCAL LIMITS.
 *
 * This file contains the canonical numeric bounds for settlement fiscal
 * policy. It is pure data. It has no dependencies. It does not read state.
 * It does not mutate anything. It does not validate. It does not clamp.
 *
 * Any module that needs to know the legal range for a fiscal rate reads it
 * from here. No module invents its own bounds. No module duplicates these
 * numbers. No UI hardcodes them in an input's min/max attribute without
 * referencing these values.
 *
 * Contract reference: Settlement Architecture Contracts §8 (Definitions),
 * §21 (Fiscal Contract).
 *
 * Rules: A rate outside [min, max] is invalid and must be rejected by the
 * rules layer. It must not be silently clamped. Clamping is a presentation
 * concern, not a domain concern, and even then should be avoided in favor
 * of surfacing the invalid input.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // FISCAL LIMITS
    // =========================================================================

    var TAX_RATE = Object.freeze({
        min: 0,
        max: 50,
        unit: 'percent',
        label: 'Tax Rate'
    });

    var TRADE_TARIFF = Object.freeze({
        min: 0,
        max: 30,
        unit: 'percent',
        label: 'Trade Tariff'
    });

    var INDUSTRY_TAX_RATE = Object.freeze({
        min: 0,
        max: 30,
        unit: 'percent',
        label: 'Industry Tax Rate'
    });

    // =========================================================================
    // EXPORTS
    // =========================================================================

    window.SettlementFiscalDefinitions = Object.freeze({
        TAX_RATE: TAX_RATE,
        TRADE_TARIFF: TRADE_TARIFF,
        INDUSTRY_TAX_RATE: INDUSTRY_TAX_RATE
    });

})();
