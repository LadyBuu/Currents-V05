/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT EDUCATION DEFINITIONS
 * js/settlement/settlement-education-definitions.js
 * =============================================================================
 *
 * AUTHORITATIVE OWNER OF EDUCATION LEVEL DEFINITIONS.
 *
 * This file contains the canonical enumeration of education levels used
 * across literacy statistics, education stats aggregation, and any UI or
 * domain rule that classifies a character's education level.
 *
 * It is pure data. It has no dependencies. It does not read state. It does
 * not mutate anything. It does not classify characters. It does not
 * calculate literacy rates.
 *
 * Contract reference: Settlement Architecture Contracts §4 (Field
 * Classification), §8 (Definitions), §32 (Completion Standard).
 *
 * Naming note: `order` ascends from least to most educated. Classification
 * rules that need "at least literate" compare `order` values. UI code that
 * renders a progression reads levels in ascending order.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // EDUCATION LEVELS
    // =========================================================================
    //
    // id:    canonical identifier
    // name:  display name
    // order: ascending index; higher means more educated
    // color: fixed palette per level for consistent rendering
    //

    var EDUCATION_LEVELS = Object.freeze([
        Object.freeze({
            id: 'illiterate',
            name: 'Illiterate',
            order: 0,
            color: 'var(--danger)'
        }),
        Object.freeze({
            id: 'basic',
            name: 'Basic',
            order: 1,
            color: 'var(--warning)'
        }),
        Object.freeze({
            id: 'literate',
            name: 'Literate',
            order: 2,
            color: 'var(--accent)'
        }),
        Object.freeze({
            id: 'educated',
            name: 'Educated',
            order: 3,
            color: 'var(--success)'
        }),
        Object.freeze({
            id: 'scholar',
            name: 'Scholar',
            order: 4,
            color: 'var(--success-dark)'
        })
    ]);

    // =========================================================================
    // EXPORTS
    // =========================================================================

    window.SettlementEducationDefinitions = Object.freeze({
        EDUCATION_LEVELS: EDUCATION_LEVELS
    });

})();
