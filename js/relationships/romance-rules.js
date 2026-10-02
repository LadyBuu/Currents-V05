/**
 * romance-rules.js
 *
 * Pure policy for romantic relationships.
 * No I/O, no state access, no mutation, no randomness.
 * Every function takes explicit facts and returns a decision.
 */

(function() {
    'use strict';

    var A = window.RELATIONSHIP_ARCHETYPES;
    var ATTR = window.RELATIONSHIP_ATTRIBUTES;
    var STATUS = window.RELATIONSHIP_STATUS;

    if (!A || !ATTR || !STATUS) {
        throw new Error('romance-rules.js: relationship-types.js must load first');
    }

    var ROMANTIC_TYPES = {};
    ROMANTIC_TYPES[A.CASUAL_DATING] = true;
    ROMANTIC_TYPES[A.ONE_NIGHT_STAND] = true;
    ROMANTIC_TYPES[A.COMMITTED] = true;

    var MIN_AGE = {};
    MIN_AGE[A.CASUAL_DATING] = 12;
    MIN_AGE[A.ONE_NIGHT_STAND] = 12;
    MIN_AGE[A.COMMITTED] = 14;

    // Attributes valid on committed relationships
    var COMMITTED_ATTRS = {};
    COMMITTED_ATTRS[ATTR.MARRIED] = true;
    COMMITTED_ATTRS[ATTR.ENGAGED] = true;
    COMMITTED_ATTRS[ATTR.COHABITING] = true;
    COMMITTED_ATTRS[ATTR.CIVIL_UNION] = true;
    COMMITTED_ATTRS[ATTR.HANDFASTED] = true;
    COMMITTED_ATTRS[ATTR.POLYAMOROUS] = true;
    COMMITTED_ATTRS[ATTR.MONOGAMOUS] = true;
    COMMITTED_ATTRS[ATTR.ARRANGED] = true;
    COMMITTED_ATTRS[ATTR.LOVE_MATCH] = true;
    COMMITTED_ATTRS[ATTR.DUTY_MATCH] = true;
    COMMITTED_ATTRS[ATTR.SECRET] = true;
    COMMITTED_ATTRS[ATTR.PUBLIC] = true;
    COMMITTED_ATTRS[ATTR.SCANDALOUS] = true;
    COMMITTED_ATTRS[ATTR.MORGANATIC] = true;
    COMMITTED_ATTRS[ATTR.LEVITIC] = true;
    COMMITTED_ATTRS[ATTR.POSTHUMOUS] = true;

    // Attributes that must not coexist
    var EXCLUSIVE_GROUPS = [
        [ATTR.MARRIED, ATTR.HANDFASTED, ATTR.ENGAGED, ATTR.COHABITING, ATTR.CIVIL_UNION],
        [ATTR.SECRET, ATTR.PUBLIC, ATTR.SCANDALOUS],
        [ATTR.POLYAMOROUS, ATTR.MONOGAMOUS]
    ];

    // Requires an existing attribute
    var REQUIRES = {};
    REQUIRES[ATTR.MORGANATIC] = ATTR.MARRIED;
    REQUIRES[ATTR.LEVITIC] = ATTR.MARRIED;

    // -------------------------------------------------------------------------

    function isRomanticArchetype(type) {
        return !!ROMANTIC_TYPES[type];
    }

    function minimumAge(type) {
        var m = MIN_AGE[type];
        return m !== undefined ? m : 0;
    }

    function isValidAttributeFor(archetype, attribute) {
        if (archetype !== A.COMMITTED) return false;
        return !!COMMITTED_ATTRS[attribute];
    }

    /**
     * Validates a set of attributes against an archetype.
     * attributes: string[]
     * Returns { valid, conflicts: string[] }
     */
    function validateAttributes(archetype, attributes) {
        var conflicts = [];
        if (!attributes || attributes.length === 0) {
            return { valid: true, conflicts: conflicts };
        }
        if (archetype !== A.COMMITTED) {
            conflicts.push('Attributes are only valid on committed relationships');
            return { valid: false, conflicts: conflicts };
        }

        var seen = {};
        for (var i = 0; i < attributes.length; i++) {
            var a = attributes[i];
            if (seen[a]) {
                conflicts.push('Duplicate attribute: ' + a);
                continue;
            }
            seen[a] = true;
            if (!COMMITTED_ATTRS[a]) {
                conflicts.push('Unknown attribute: ' + a);
            }
        }

        for (var g = 0; g < EXCLUSIVE_GROUPS.length; g++) {
            var group = EXCLUSIVE_GROUPS[g];
            var present = [];
            for (var j = 0; j < group.length; j++) {
                if (seen[group[j]]) present.push(group[j]);
            }
            if (present.length > 1) {
                conflicts.push(
                    'Mutually exclusive attributes present: ' + present.join(', ')
                );
            }
        }

        for (var attr in REQUIRES) {
            if (!REQUIRES.hasOwnProperty(attr)) continue;
            if (seen[attr] && !seen[REQUIRES[attr]]) {
                conflicts.push(attr + ' requires ' + REQUIRES[attr]);
            }
        }

        return { valid: conflicts.length === 0, conflicts: conflicts };
    }

    /**
     * Is the character age valid for the archetype?
     */
    function isAgeValid(archetype, age) {
        return age >= minimumAge(archetype);
    }

    /**
     * Given a person's committed relationships and their attributes,
     * can they take on another committed partner?
     *
     * Facts required (no lookups):
     *   existingCommittedCount: number of active committed relationships
     *   anyPolyamorous: true if at least one active committed
     *                   relationship has the POLYAMOROUS attribute
     *   allowsMultipleByRank: true if the person's rank allows it
     *   allowsMultipleByTrait: true if the person has the polygamous trait
     */
    function canHaveMultiplePartners(facts) {
        if (!facts) return false;
        if (facts.existingCommittedCount === 0) return true;
        if (facts.allowsMultipleByRank) return true;
        if (facts.allowsMultipleByTrait) return true;
        if (facts.anyPolyamorous) return true;
        return false;
    }

    /**
     * Determines whether starting a new relationship between two
     * characters would be classified as an affair.
     *
     * Facts:
     *   archetype
     *   participantAFacts: {
     *     existingCommittedCount,
     *     anyPolyamorous,
     *     allowsMultipleByRank,
     *     allowsMultipleByTrait,
     *     ageAtStart
     *   }
     *   participantBFacts: same shape
     *   startYear
     *   forceAffair: boolean
     *   explicitSecret: boolean
     */
    function classifyNewRelationship(facts) {
        if (!facts || !facts.archetype) {
            return { classification: null, reason: 'missing_facts' };
        }

        if (!isRomanticArchetype(facts.archetype)) {
            return { classification: null, reason: 'not_romantic' };
        }

        var aFacts = facts.participantAFacts || {};
        var bFacts = facts.participantBFacts || {};

        if (facts.archetype === A.COMMITTED) {
            if (!isAgeValid(A.COMMITTED, aFacts.ageAtStart || 0)) {
                return { classification: 'blocked', reason: 'participant_a_underage' };
            }
            if (!isAgeValid(A.COMMITTED, bFacts.ageAtStart || 0)) {
                return { classification: 'blocked', reason: 'participant_b_underage' };
            }
        }

        if (facts.forceAffair) {
            return { classification: 'affair', reason: 'forced' };
        }

        if (facts.archetype !== A.COMMITTED) {
            return { classification: 'legitimate', reason: 'non_committed_archetype' };
        }

        var aHasPartners = (aFacts.existingCommittedCount || 0) > 0;
        var bHasPartners = (bFacts.existingCommittedCount || 0) > 0;

        if (!aHasPartners && !bHasPartners) {
            return { classification: 'legitimate', reason: 'no_existing_partners' };
        }

        var aAllows = canHaveMultiplePartners(aFacts);
        var bAllows = canHaveMultiplePartners(bFacts);

        if (aHasPartners && !aAllows) {
            return { classification: 'affair', reason: 'participant_a_monogamous_with_partner' };
        }
        if (bHasPartners && !bAllows) {
            return { classification: 'affair', reason: 'participant_b_monogamous_with_partner' };
        }

        return { classification: 'polyamorous', reason: 'both_allow_multiple' };
    }

    /**
     * Computes the attributes to attach to a new committed relationship
     * given its classification.
     *
     * Inputs:
     *   classification (from classifyNewRelationship)
     *   userAttributes: string[] — attributes explicitly requested by user
     *   isScandalous: boolean
     */
    function resolveAttributes(input) {
        var attributes = [];
        var user = input.userAttributes ? input.userAttributes.slice() : [];

        // Deduplicate
        var seen = {};
        var cleaned = [];
        for (var i = 0; i < user.length; i++) {
            if (!seen[user[i]]) {
                seen[user[i]] = true;
                cleaned.push(user[i]);
            }
        }

        if (input.classification === 'affair') {
            if (!seen[ATTR.SECRET]) {
                cleaned.push(ATTR.SECRET);
                seen[ATTR.SECRET] = true;
            }
            if (input.isScandalous && !seen[ATTR.SCANDALOUS]) {
                cleaned.push(ATTR.SCANDALOUS);
                seen[ATTR.SCANDALOUS] = true;
            }
        }

        // Remove SECRET if a non-secret visibility attribute is present
        var visibilityAttrs = [ATTR.SECRET, ATTR.PUBLIC, ATTR.SCANDALOUS];
        var presentVisibility = visibilityAttrs.filter(function(v) {
            return seen[v];
        });
        if (presentVisibility.length > 1) {
            cleaned = cleaned.filter(function(a) {
                return a !== ATTR.SECRET || input.classification === 'affair';
            });
        }

        return cleaned;
    }

    /**
     * Determines whether a relationship can be broken up.
     * Facts:
     *   status
     */
    function canBreakUp(facts) {
        if (!facts) return { valid: false, reason: 'missing_facts' };
        if (facts.status !== STATUS.ONGOING) {
            return { valid: false, reason: 'not_ongoing' };
        }
        return { valid: true };
    }

    /**
     * Determines whether death should widowed the relationship.
     * Facts:
     *   status
     */
    function canBeWidowed(facts) {
        if (!facts) return { valid: false, reason: 'missing_facts' };
        if (facts.status !== STATUS.ONGOING) {
            return { valid: false, reason: 'not_ongoing' };
        }
        return { valid: true };
    }

    /**
     * Does a relationship have the SECRET attribute?
     * (This is the sole definition of affair classification.)
     */
    function isAffair(attributes) {
        if (!attributes) return false;
        return attributes.indexOf(ATTR.SECRET) !== -1;
    }

    /**
     * Does a relationship have any of the given attributes?
     */
    function hasAttribute(attributes, attribute) {
        if (!attributes) return false;
        return attributes.indexOf(attribute) !== -1;
    }

    /**
     * Can this attribute be added to a relationship?
     * Facts:
     *   archetype
     *   currentAttributes
     *   attribute (the one to add)
     */
    function canAddAttribute(facts) {
        if (!facts) return { valid: false, reason: 'missing_facts' };
        if (facts.archetype !== A.COMMITTED) {
            return { valid: false, reason: 'not_committed' };
        }
        if (!COMMITTED_ATTRS[facts.attribute]) {
            return { valid: false, reason: 'unknown_attribute' };
        }

        var current = facts.currentAttributes || [];
        if (current.indexOf(facts.attribute) !== -1) {
            return { valid: false, reason: 'already_present' };
        }

        var proposed = current.slice();
        proposed.push(facts.attribute);
        var check = validateAttributes(facts.archetype, proposed);
        if (!check.valid) {
            return { valid: false, reason: 'conflict', conflicts: check.conflicts };
        }

        return { valid: true };
    }

    /**
     * Can this attribute be removed from a relationship?
     * Facts:
     *   archetype
     *   currentAttributes
     *   attribute (the one to remove)
     */
    function canRemoveAttribute(facts) {
        if (!facts) return { valid: false, reason: 'missing_facts' };
        if (facts.archetype !== A.COMMITTED) {
            return { valid: false, reason: 'not_committed' };
        }
        var current = facts.currentAttributes || [];
        if (current.indexOf(facts.attribute) === -1) {
            return { valid: false, reason: 'not_present' };
        }
        return { valid: true };
    }

    // -------------------------------------------------------------------------

    window.RomanceRules = {
        isRomanticArchetype: isRomanticArchetype,
        minimumAge: minimumAge,
        isValidAttributeFor: isValidAttributeFor,
        validateAttributes: validateAttributes,
        isAgeValid: isAgeValid,
        canHaveMultiplePartners: canHaveMultiplePartners,
        classifyNewRelationship: classifyNewRelationship,
        resolveAttributes: resolveAttributes,
        canBreakUp: canBreakUp,
        canBeWidowed: canBeWidowed,
        isAffair: isAffair,
        hasAttribute: hasAttribute,
        canAddAttribute: canAddAttribute,
        canRemoveAttribute: canRemoveAttribute
    };

})();
