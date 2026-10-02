/**
 * romance-queries.js
 *
 * Semantic reads for romantic relationships.
 * Returns defensive projections. Never live entities.
 * No policy, no mutation, no persistence.
 */

(function() {
    'use strict';

    var RQ = window.RelationshipQueries;
    var A  = window.RELATIONSHIP_ARCHETYPES;
    var ATTR = window.RELATIONSHIP_ATTRIBUTES;
    var STATUS = window.RELATIONSHIP_STATUS;

    if (!RQ || !A || !ATTR || !STATUS) {
        throw new Error('romance-queries.js: relationship-queries.js and relationship-types.js must load first');
    }

    var ROMANTIC_TYPES = {};
    ROMANTIC_TYPES[A.CASUAL_DATING] = true;
    ROMANTIC_TYPES[A.ONE_NIGHT_STAND] = true;
    ROMANTIC_TYPES[A.COMMITTED] = true;

    // -------------------------------------------------------------------------
    // INTERNAL HELPERS
    // -------------------------------------------------------------------------

    function _isRomantic(rel) {
        return rel && !!ROMANTIC_TYPES[rel.type];
    }

    function _isActive(rel) {
        return rel && rel.status === STATUS.ONGOING;
    }

    function _hasAttr(rel, attr) {
        return !!(rel && rel.attributes && rel.attributes.indexOf(attr) !== -1);
    }

    function _projectPartnerId(rel, characterId) {
        if (rel.participantA === characterId) return rel.participantB;
        if (rel.participantB === characterId) return rel.participantA;
        return null;
    }

    // -------------------------------------------------------------------------
    // ROMANTIC RELATIONSHIPS FOR A CHARACTER
    // -------------------------------------------------------------------------

    function getRomanticRelationships(characterId, options) {
        var all = RQ.getForCharacter(characterId, options);
        return all.filter(_isRomantic);
    }

    function getActiveRomanticRelationships(characterId) {
        var all = RQ.getActiveForCharacter(characterId);
        return all.filter(_isRomantic);
    }

    function hasActiveRomanticRelationship(characterId) {
        return getActiveRomanticRelationships(characterId).length > 0;
    }

    function hasActiveCommittedRelationship(characterId) {
        return getActiveRomanticRelationships(characterId).some(function(r) {
            return r.type === A.COMMITTED;
        });
    }

    // -------------------------------------------------------------------------
    // BETWEEN TWO CHARACTERS
    // -------------------------------------------------------------------------

    function getRomanticRelationshipsBetween(a, b, options) {
        var all = RQ.getBetween(a, b, options);
        return all.filter(_isRomantic);
    }

    function getActiveRomanticRelationshipsBetween(a, b) {
        var all = RQ.getBetween(a, b, { status: STATUS.ONGOING });
        return all.filter(_isRomantic);
    }

    function getCommittedRelationshipsBetween(a, b) {
        return RQ.getBetweenOfType(a, b, A.COMMITTED);
    }

    function getActiveCommittedBetween(a, b) {
        return RQ.getActiveBetweenOfType(a, b, A.COMMITTED);
    }

    function hasActiveRomanticBetween(a, b) {
        return getActiveRomanticRelationshipsBetween(a, b).length > 0;
    }

    function hasActiveCommittedBetween(a, b) {
        return getActiveCommittedBetween(a, b).length > 0;
    }

    // -------------------------------------------------------------------------
    // PARTNERS
    // -------------------------------------------------------------------------

    /**
     * Returns active committed relationships' projections, each annotated
     * with the partner character id.
     */
    function getActiveCommittedPartners(characterId) {
        var rels = getActiveRomanticRelationships(characterId).filter(function(r) {
            return r.type === A.COMMITTED;
        });
        return rels.map(function(r) {
            return {
                relationship: r,
                partnerId: _projectPartnerId(r, characterId)
            };
        });
    }

    /**
     * Returns all active romantic partners (any romantic archetype),
     * each annotated with the partner character id.
     */
    function getActiveRomanticPartners(characterId) {
        var rels = getActiveRomanticRelationships(characterId);
        return rels.map(function(r) {
            return {
                relationship: r,
                partnerId: _projectPartnerId(r, characterId)
            };
        });
    }

    /**
     * Counts active committed relationships.
     */
    function countActiveCommittedPartners(characterId) {
        return getActiveCommittedPartners(characterId).length;
    }

    // -------------------------------------------------------------------------
    // AFFAIRS
    //
    // An affair is a committed relationship with the SECRET attribute.
    // Nothing more. Classification is not stored.
    // -------------------------------------------------------------------------

    function getAffairsForCharacter(characterId, options) {
        options = options || {};
        var rels = options.activeOnly
            ? getActiveRomanticRelationships(characterId)
            : getRomanticRelationships(characterId);
        return rels.filter(function(r) {
            return r.type === A.COMMITTED && _hasAttr(r, ATTR.SECRET);
        });
    }

    function getActiveAffairsForCharacter(characterId) {
        return getAffairsForCharacter(characterId, { activeOnly: true });
    }

    function getAffairBetween(a, b) {
        var rels = getCommittedRelationshipsBetween(a, b);
        for (var i = 0; i < rels.length; i++) {
            if (_hasAttr(rels[i], ATTR.SECRET) && _isActive(rels[i])) {
                return rels[i];
            }
        }
        return null;
    }

    function isAffair(relationshipId) {
        var rel = RQ.getById(relationshipId);
        if (!rel) return false;
        if (rel.type !== A.COMMITTED) return false;
        return _hasAttr(rel, ATTR.SECRET);
    }

    function isSecretRelationship(a, b) {
        var rels = getCommittedRelationshipsBetween(a, b);
        for (var i = 0; i < rels.length; i++) {
            if (_hasAttr(rels[i], ATTR.SECRET) && _isActive(rels[i])) return true;
        }
        return false;
    }

    // -------------------------------------------------------------------------
    // ATTRIBUTE LOOKUPS
    // -------------------------------------------------------------------------

    function hasRelationshipAttribute(a, b, attribute) {
        var rels = RQ.getBetween(a, b, { status: STATUS.ONGOING });
        for (var i = 0; i < rels.length; i++) {
            if (rels[i].type !== A.COMMITTED) continue;
            if (_hasAttr(rels[i], attribute)) return true;
        }
        return false;
    }

    /**
     * Returns the attribute list of the first active committed
     * relationship between a and b, or an empty array.
     */
    function getCommittedAttributesBetween(a, b) {
        var rels = getActiveCommittedBetween(a, b);
        if (rels.length === 0) return [];
        return rels[0].attributes.slice();
    }

    // -------------------------------------------------------------------------
    // MARRIAGE STATUS (derived, not stored)
    // -------------------------------------------------------------------------

    var LEGAL_ATTRS_ORDER = [
        ATTR.MARRIED,
        ATTR.HANDFASTED,
        ATTR.CIVIL_UNION,
        ATTR.ENGAGED,
        ATTR.COHABITING
    ];

    function getMarriageStatus(relationshipId) {
        var rel = RQ.getById(relationshipId);
        if (!rel || rel.type !== A.COMMITTED) return null;
        for (var i = 0; i < LEGAL_ATTRS_ORDER.length; i++) {
            if (_hasAttr(rel, LEGAL_ATTRS_ORDER[i])) return LEGAL_ATTRS_ORDER[i];
        }
        return null;
    }

    function getMarriageStatusBetween(a, b) {
        var rels = getActiveCommittedBetween(a, b);
        for (var i = 0; i < rels.length; i++) {
            for (var j = 0; j < LEGAL_ATTRS_ORDER.length; j++) {
                if (_hasAttr(rels[i], LEGAL_ATTRS_ORDER[j])) {
                    return LEGAL_ATTRS_ORDER[j];
                }
            }
        }
        return null;
    }

    // -------------------------------------------------------------------------
    // METRICS FOR RULES
    //
    // These helpers package facts consumed by RomanceRules. They perform
    // only reads and projections; they do not decide anything.
    // -------------------------------------------------------------------------

    /**
     * Returns the set of facts RomanceRules.canHaveMultiplePartners()
     * needs for a character.
     *
     * The caller supplies rank/trait facts (which live outside Romance).
     */
    function getMultiPartnerFacts(characterId, externalFacts) {
        externalFacts = externalFacts || {};
        var committed = getActiveCommittedPartners(characterId);

        var anyPolyamorous = false;
        for (var i = 0; i < committed.length; i++) {
            if (_hasAttr(committed[i].relationship, ATTR.POLYAMOROUS)) {
                anyPolyamorous = true;
                break;
            }
        }

        return {
            existingCommittedCount: committed.length,
            anyPolyamorous: anyPolyamorous,
            allowsMultipleByRank: !!externalFacts.allowsMultipleByRank,
            allowsMultipleByTrait: !!externalFacts.allowsMultipleByTrait
        };
    }

    // -------------------------------------------------------------------------
    // EXPORTS
    // -------------------------------------------------------------------------

    window.RomanceQueries = {
        getRomanticRelationships: getRomanticRelationships,
        getActiveRomanticRelationships: getActiveRomanticRelationships,
        hasActiveRomanticRelationship: hasActiveRomanticRelationship,
        hasActiveCommittedRelationship: hasActiveCommittedRelationship,

        getRomanticRelationshipsBetween: getRomanticRelationshipsBetween,
        getActiveRomanticRelationshipsBetween: getActiveRomanticRelationshipsBetween,
        getCommittedRelationshipsBetween: getCommittedRelationshipsBetween,
        getActiveCommittedBetween: getActiveCommittedBetween,
        hasActiveRomanticBetween: hasActiveRomanticBetween,
        hasActiveCommittedBetween: hasActiveCommittedBetween,

        getActiveCommittedPartners: getActiveCommittedPartners,
        getActiveRomanticPartners: getActiveRomanticPartners,
        countActiveCommittedPartners: countActiveCommittedPartners,

        getAffairsForCharacter: getAffairsForCharacter,
        getActiveAffairsForCharacter: getActiveAffairsForCharacter,
        getAffairBetween: getAffairBetween,
        isAffair: isAffair,
        isSecretRelationship: isSecretRelationship,

        hasRelationshipAttribute: hasRelationshipAttribute,
        getCommittedAttributesBetween: getCommittedAttributesBetween,

        getMarriageStatus: getMarriageStatus,
        getMarriageStatusBetween: getMarriageStatusBetween,

        getMultiPartnerFacts: getMultiPartnerFacts
    };

})();
