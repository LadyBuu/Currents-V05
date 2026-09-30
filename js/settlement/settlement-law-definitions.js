/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT LAW DEFINITIONS
 * js/settlement/settlement-law-definitions.js
 * =============================================================================
 *
 * AUTHORITATIVE OWNER OF CIVIL LAW DEFINITIONS.
 *
 * This file contains the canonical enumeration of civil law types,
 * domains, and severities. These are the values used by settlement civil
 * law records and by any module that interprets, validates, or renders a
 * civil law.
 *
 * It is pure data. It has no dependencies. It does not read state. It does
 * not mutate anything. It does not validate law records. It does not
 * decide applicability. It does not render.
 *
 * Contract reference: Settlement Architecture Contracts §4 (Field
 * Classification), §8 (Definitions), §20 (Place of Worship analog for
 * centralized enumeration), §32 (Completion Standard).
 *
 * Naming note: `color` fields are provided here as data because the law
 * severity palette is a fixed domain enumeration, not a free presentation
 * choice. Every UI that renders severity uses the same color. If the
 * palette changes, it changes here. UI code does not maintain its own
 * severity-to-color map.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // LAW TYPES
    // =========================================================================
    //
    // type:      canonical id stored on civil law records
    // icon:      single-character glyph used where the no-emoji policy allows
    //            a text glyph; may be omitted entirely if a UI chooses not
    //            to render a glyph. It is a hint, not a contract.
    //

    var LAW_TYPES = Object.freeze([
        Object.freeze({
            id: 'law',
            name: 'Law',
            icon: '◉',
            description: 'A formally enacted rule'
        }),
        Object.freeze({
            id: 'taboo',
            name: 'Taboo',
            icon: '✕',
            description: 'A prohibited practice enforced by custom'
        }),
        Object.freeze({
            id: 'guideline',
            name: 'Guideline',
            icon: '○',
            description: 'A recommended practice without formal penalty'
        })
    ]);

    // =========================================================================
    // LAW DOMAINS
    // =========================================================================

    var LAW_DOMAINS = Object.freeze([
        Object.freeze({ id: 'marriage', name: 'Marriage' }),
        Object.freeze({ id: 'behavior', name: 'Behavior' }),
        Object.freeze({ id: 'worship', name: 'Worship' }),
        Object.freeze({ id: 'food', name: 'Food' }),
        Object.freeze({ id: 'social', name: 'Social' }),
        Object.freeze({ id: 'economic', name: 'Economic' }),
        Object.freeze({ id: 'political', name: 'Political' }),
        Object.freeze({ id: 'sexual', name: 'Sexual' }),
        Object.freeze({ id: 'violence', name: 'Violence' }),
        Object.freeze({ id: 'death', name: 'Death' })
    ]);

    // =========================================================================
    // LAW SEVERITIES
    // =========================================================================
    //
    // color: fixed palette per severity. Consumers reference the color as
    //        data. They do not hardcode their own.
    //

    var LAW_SEVERITIES = Object.freeze([
        Object.freeze({
            id: 'minor',
            name: 'Minor',
            color: 'var(--text-dim)'
        }),
        Object.freeze({
            id: 'major',
            name: 'Major',
            color: 'var(--warning)'
        }),
        Object.freeze({
            id: 'mortal',
            name: 'Mortal',
            color: 'var(--error)'
        })
    ]);

    // =========================================================================
    // EXPORTS
    // =========================================================================

    window.SettlementLawDefinitions = Object.freeze({
        LAW_TYPES: LAW_TYPES,
        LAW_DOMAINS: LAW_DOMAINS,
        LAW_SEVERITIES: LAW_SEVERITIES
    });

})();
