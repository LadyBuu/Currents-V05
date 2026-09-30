/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT GOVERNMENT DEFINITIONS
 * js/settlement/settlement-government-definitions.js
 * =============================================================================
 *
 * AUTHORITATIVE OWNER OF GOVERNMENT AND JUSTICE DEFINITIONS.
 *
 * This file contains the canonical enumeration of government types and
 * justice severities, plus the crime-rate factor associated with each
 * justice severity.
 *
 * It is pure data. It has no dependencies. It does not read state. It does
 * not mutate anything. It does not validate. It does not clamp.
 *
 * Contract reference: Settlement Architecture Contracts §8 (Definitions),
 * §21 (Fiscal Contract analog), §32 (Completion Standard).
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // GOVERNMENT TYPES
    // =========================================================================
    //
    // 'none' is a legitimate government type: it represents a settlement
    // with no formal government. It is not a stand-in for missing data.
    //

    var GOVERNMENT_TYPES = Object.freeze([
        Object.freeze({
            id: 'none',
            name: 'None',
            description: 'No formal government'
        }),
        Object.freeze({
            id: 'monarchy',
            name: 'Monarchy',
            description: 'Rule by a single hereditary sovereign'
        }),
        Object.freeze({
            id: 'republic',
            name: 'Republic',
            description: 'Rule by elected representatives'
        }),
        Object.freeze({
            id: 'theocracy',
            name: 'Theocracy',
            description: 'Rule by religious authority'
        }),
        Object.freeze({
            id: 'tribal',
            name: 'Tribal',
            description: 'Rule by tribal council or chieftain'
        }),
        Object.freeze({
            id: 'feudal',
            name: 'Feudal',
            description: 'Rule by landed nobility under obligation'
        })
    ]);

    // =========================================================================
    // JUSTICE SEVERITIES
    // =========================================================================
    //
    // crimeFactor is the multiplier applied to crime rate by justice severity.
    // Higher factor = harsher justice = more crime deterrence.
    //
    // The values here mirror the previous inline table in
    // settlement-economy-core.js. They are now the single source of truth.
    //

    var JUSTICE_SEVERITIES = Object.freeze([
        Object.freeze({
            id: 'lenient',
            name: 'Lenient',
            crimeFactor: 0.3
        }),
        Object.freeze({
            id: 'medium',
            name: 'Medium',
            crimeFactor: 0.5
        }),
        Object.freeze({
            id: 'harsh',
            name: 'Harsh',
            crimeFactor: 0.7
        }),
        Object.freeze({
            id: 'extreme',
            name: 'Extreme',
            crimeFactor: 0.9
        })
    ]);

    // =========================================================================
    // EXPORTS
    // =========================================================================

    window.SettlementGovernmentDefinitions = Object.freeze({
        GOVERNMENT_TYPES: GOVERNMENT_TYPES,
        JUSTICE_SEVERITIES: JUSTICE_SEVERITIES
    });

})();
