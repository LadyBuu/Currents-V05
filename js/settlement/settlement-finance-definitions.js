/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT FINANCE DEFINITIONS
 * js/settlement/settlement-finance-definitions.js
 * =============================================================================
 *
 * AUTHORITATIVE OWNER OF FINANCIAL CONSTANTS.
 *
 * This file contains the canonical numeric constants used by settlement
 * finance: debt interest, and any other financial rates or thresholds that
 * are currently duplicated across economy, debt management, and annual
 * processing modules.
 *
 * It is pure data. It has no dependencies. It does not read state. It does
 * not mutate anything. It does not calculate interest. It does not compute
 * a debt ratio. It does not clamp.
 *
 * Contract reference: Settlement Architecture Contracts §8 (Definitions),
 * §18 (Debt Contract), §22 (Prosperity Contract analog for centralized
 * constants), §32 (Completion Standard).
 *
 * Naming note: `DEBT_INTEREST_RATE` is a fraction, not a percentage. 0.05
 * means five percent per year. Consumers that display it as a percentage
 * are responsible for formatting. Consumers that compute with it use the
 * fraction directly.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // DEBT
    // =========================================================================

    var DEBT_INTEREST_RATE = Object.freeze({
        annualFraction: 0.05,
        label: 'Debt Interest',
        unit: 'fraction-per-year'
    });

    // =========================================================================
    // EFFICIENCY SCORING
    // =========================================================================
    //
    // The economy efficiency score is currently computed as
    //   round((income / max(1, expenses)) * 50)
    // and then banded for display. The banding thresholds are domain
    // constants, not presentation choices, because they classify the
    // settlement's administrative efficiency as a domain fact.
    //
    // If these are later deemed pure presentation, they can be moved. For
    // now they are frozen here to remove duplication across the economy
    // core and the efficiency modal.
    //

    var EFFICIENCY_BANDS = Object.freeze([
        Object.freeze({ id: 'excellent', name: 'Excellent', min: 80 }),
        Object.freeze({ id: 'good',      name: 'Good',      min: 60 }),
        Object.freeze({ id: 'average',   name: 'Average',   min: 40 }),
        Object.freeze({ id: 'poor',      name: 'Poor',      min: 20 }),
        Object.freeze({ id: 'critical',  name: 'Critical',  min: 0  })
    ]);

    // =========================================================================
    // DEBT RATIO BANDS
    // =========================================================================
    //
    // Used by debt management UI and by any domain rule that classifies
    // debt burden. Thresholds are percentages of debt relative to wealth.
    //

    var DEBT_RATIO_BANDS = Object.freeze([
        Object.freeze({ id: 'low',      name: 'Low',      min: 0,  max: 25 }),
        Object.freeze({ id: 'moderate', name: 'Moderate', min: 25, max: 50 }),
        Object.freeze({ id: 'high',     name: 'High',     min: 50, max: 100 }),
        Object.freeze({ id: 'severe',   name: 'Severe',   min: 100 })
    ]);

    // =========================================================================
    // EXPORTS
    // =========================================================================

    window.SettlementFinanceDefinitions = Object.freeze({
        DEBT_INTEREST_RATE: DEBT_INTEREST_RATE,
        EFFICIENCY_BANDS: EFFICIENCY_BANDS,
        DEBT_RATIO_BANDS: DEBT_RATIO_BANDS
    });

})();
