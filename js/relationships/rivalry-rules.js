/**
 * =============================================================================
 * STILL WATERS - RIVALRY RULES (rivalry-rules.js)
 * =============================================================================
 *
 * LOCATION: js/social/rivalry-rules.js
 *
 * Pure policy for rivalry and enmity relationships.
 *
 * Owns:
 *   - the rivalry transition table
 *   - the enmity transition table
 *   - the rivalry attribute set (empty)
 *   - the enmity attribute set (empty)
 *   - minimum ages
 *   - creation validation
 *   - transition validation
 *
 * Does NOT own:
 *   - state access
 *   - mutation
 *   - persistence
 *   - randomness
 *   - queries (see rivalry-queries.js)
 *
 * Rivalry and enmity are structurally identical: symmetric social edges
 * with two participants and no attributes. They differ only in intent,
 * which is expressed by which archetype the record carries. There is no
 * policy that differs between them in v1.
 *
 * Every function is deterministic and takes explicit facts. Every
 * validator returns { valid, errors } or { valid, reason }.
 *
 * Load order: after relationship-types.js and relationship-utils.js.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. HARD DEPENDENCY CHECK
    // =========================================================================

    var STATUS = window.RELATIONSHIP_STATUS;
    var Utils = window.RelationshipUtils;

    if (!STATUS || !Utils) {
        throw new Error(
            'rivalry-rules.js: relationship-types.js and ' +
            'relationship-utils.js must load first'
        );
    }

    // =========================================================================
    // 2. TRANSITION TABLES
    //
    // Both rivalry and enmity are ongoing / ended. Once ended, no
    // transitions. A new rivalry or enmity is a new record.
    // =========================================================================

    var RIVALRY_TRANSITIONS = Utils.freezeTable({
        'ongoing': { 'ended': true },
        'ended':   {}
    });

    var ENMITY_TRANSITIONS = Utils.freezeTable({
        'ongoing': { 'ended': true },
        'ended':   {}
    });

    // =========================================================================
    // 3. ATTRIBUTE SETS
    //
    // Neither rivalry nor enmity has attributes. Empty tables so that
    // generic validation callers behave correctly.
    // =========================================================================

    var RIVALRY_ALLOWED_ATTRIBUTES = Object.freeze({});
    var ENMITY_ALLOWED_ATTRIBUTES  = Object.freeze({});

    // =========================================================================
    // 4. MINIMUM AGES
    //
    // Rivalry and enmity are social relationships. The floor is the age
    // at which a character is treated as a social actor.
    // =========================================================================

    var MIN_AGE_RIVALRY = 10;
    var MIN_AGE_ENMITY  = 10;

    // =========================================================================
    // 5. VALIDATORS
    // =========================================================================

    /**
     * facts: {
     *   participantA, participantB,
     *   ageA?, ageB?,
     *   startYear?
     * }
     */
    function canCreateRivalry(facts) {
        return _canCreateSocialEdge(facts, MIN_AGE_RIVALRY);
    }

    function canCreateEnmity(facts) {
        return _canCreateSocialEdge(facts, MIN_AGE_ENMITY);
    }

    function _canCreateSocialEdge(facts, minAge) {
        var errors = [];
        if (!facts || typeof facts !== 'object') {
            return { valid: false, errors: ['missing_facts'] };
        }

        if (typeof facts.participantA !== 'string' || facts.participantA.length === 0) {
            errors.push('missing_participantA');
        }
        if (typeof facts.participantB !== 'string' || facts.participantB.length === 0) {
            errors.push('missing_participantB');
        }
        if (facts.participantA && facts.participantB &&
            facts.participantA === facts.participantB) {
            errors.push('same_participant');
        }

        if (facts.ageA !== undefined && facts.ageA !== null) {
            if (typeof facts.ageA !== 'number' || isNaN(facts.ageA)) {
                errors.push('invalid_ageA');
            } else if (facts.ageA < minAge) {
                errors.push('participantA_too_young');
            }
        }

        if (facts.ageB !== undefined && facts.ageB !== null) {
            if (typeof facts.ageB !== 'number' || isNaN(facts.ageB)) {
                errors.push('invalid_ageB');
            } else if (facts.ageB < minAge) {
                errors.push('participantB_too_young');
            }
        }

        if (facts.startYear !== undefined && facts.startYear !== null &&
            typeof facts.startYear !== 'number') {
            errors.push('invalid_startYear');
        }

        return { valid: errors.length === 0, errors: errors };
    }

    /**
     * facts: { archetype, from, to }
     *
     * archetype must be either 'rivalry' or 'enmity'; the two tables
     * are kept distinct so that future divergence does not require a
     * rewrite of this validator.
     */
    function canTransition(facts) {
        if (!facts || typeof facts !== 'object') {
            return { valid: false, errors: ['missing_facts'] };
        }

        var table = null;
        if (facts.archetype === 'rivalry') {
            table = RIVALRY_TRANSITIONS;
        } else if (facts.archetype === 'enmity') {
            table = ENMITY_TRANSITIONS;
        } else {
            return {
                valid: false,
                errors: ['unknown_archetype:' + facts.archetype]
            };
        }

        return Utils.validateStatusTransition(facts.from, facts.to, table);
    }

    /**
     * Validate the attribute set for rivalry or enmity. Both reject any
     * non-empty array.
     */
    function validateRivalryAttributes(attributes) {
        return _validateEmptyAttributes(attributes);
    }

    function validateEnmityAttributes(attributes) {
        return _validateEmptyAttributes(attributes);
    }

    function _validateEmptyAttributes(attributes) {
        if (attributes === undefined || attributes === null) {
            return { valid: true, errors: [], unknown: [] };
        }
        if (!Array.isArray(attributes)) {
            return { valid: false, errors: ['attributes_not_array'], unknown: [] };
        }
        if (attributes.length === 0) {
            return { valid: true, errors: [], unknown: [] };
        }
        return {
            valid: false,
            errors: ['no_attributes_permitted'],
            unknown: attributes.slice()
        };
    }

    // =========================================================================
    // 6. EXPORTS
    // =========================================================================

    window.RivalryRules = {
        // Transition tables (read-only)
        RIVALRY_TRANSITIONS: RIVALRY_TRANSITIONS,
        ENMITY_TRANSITIONS: ENMITY_TRANSITIONS,

        // Attribute sets (read-only)
        RIVALRY_ALLOWED_ATTRIBUTES: RIVALRY_ALLOWED_ATTRIBUTES,
        ENMITY_ALLOWED_ATTRIBUTES: ENMITY_ALLOWED_ATTRIBUTES,

        // Age floors
        MIN_AGE_RIVALRY: MIN_AGE_RIVALRY,
        MIN_AGE_ENMITY: MIN_AGE_ENMITY,

        // Validators
        canCreateRivalry: canCreateRivalry,
        canCreateEnmity: canCreateEnmity,
        canTransition: canTransition,
        validateRivalryAttributes: validateRivalryAttributes,
        validateEnmityAttributes: validateEnmityAttributes
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.RivalryRules;
    }

})();
