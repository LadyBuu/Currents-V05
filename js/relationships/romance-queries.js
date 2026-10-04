/**
 * romance-queries.js
 *
 * Semantic reads for romantic relationships.
 *
 * Owns:
 *   - romantic relationship projections for a character
 *   - committed-relationship and marriage projections
 *   - affair projections (committed + secret attribute)
 *   - attribute interpretation (the only place in the codebase
 *     permitted to read romance attributes by name)
 *   - marriage status projections (attribute-based, not legal-status-
 *     based; legal consequences read a separate semantic layer)
 *   - multi-partner facts feeding RomanceRules
 *
 * Depends on RelationshipQueries for raw edge reads and on RomanceRules
 * for the affair predicate and multi-partner policy.
 *
 * Does NOT own:
 *   - state access (goes through RelationshipQueries)
 *   - mutation
 *   - persistence
 *   - randomness
 *   - cultural gating (callers consult CultureRules; this module
 *     never asserts that a marriage is culturally valid)
 *
 * Every returned value is a defensive projection. Never a live record.
 * Unknown inputs return null or []. No fabrication.
 *
 * Load order: after relationship-queries.js and romance-rules.js.
 */

(function() {
    'use strict';

    var RQ = window.RelationshipQueries;
    var RR = window.RomanceRules;
    var ATTR = window.RELATIONSHIP_ATTRIBUTES;
    var A = window.RELATIONSHIP_ARCHETYPES;
    var STATUS = window.RELATIONSHIP_STATUS;

    if (!RQ || !RR || !ATTR || !A || !STATUS) {
        throw new Error('romance-queries.js: relationship-queries.js and romance-rules.js must load first');
    }

    var CASUAL       = A.CASUAL_DATING;
    var ONE_NIGHT    = A.ONE_NIGHT_STAND;
    var COMMITTED    = A.COMMITTED;

    // Order of precedence for legal-institution projections. The first
    // attribute present in this list is the relationship's "institution"
    // for display purposes. This is presentation only, not legal policy.
    var INSTITUTION_PRECEDENCE = [
        ATTR.MARRIED,
        ATTR.HANDFASTED,
        ATTR.CIVIL_UNION,
        ATTR.ENGAGED,
        ATTR.COHABITING
    ];

    // -------------------------------------------------------------------------
    // INTERNAL HELPERS
    // -------------------------------------------------------------------------

    function _partnerId(record, characterId) {
        if (record.participantA === characterId) return record.participantB;
        if (record.participantB === characterId) return record.participantA;
        return null;
    }

    function _hasAttr(record, attr) {
        return !!(record && Array.isArray(record.attributes) &&
                  record.attributes.indexOf(attr) !== -1);
    }

    function _isRomantic(record) {
        return record &&
               (record.type === CASUAL ||
                record.type === ONE_NIGHT ||
                record.type === COMMITTED);
    }

    /**
     * Projects a romantic relationship record. The projection carries
     * interpreted semantic fields (institution, isAffair, isCommitted)
     * alongside the raw attributes array. Callers outside the romance
     * domain must not interpret `attributes` by name; they should read
     * `institution` or `isAffair` from this projection.
     */
    function _project(record, perspectiveId) {
        if (!record) return null;

        var institution = null;
        for (var i = 0; i < INSTITUTION_PRECEDENCE.length; i++) {
            if (_hasAttr(record, INSTITUTION_PRECEDENCE[i])) {
                institution = INSTITUTION_PRECEDENCE[i];
                break;
            }
        }

        var isCommitted = record.type === COMMITTED;
        var isAffair = isCommitted && _hasAttr(record, ATTR.SECRET);
        var isPolyamorous = _hasAttr(record, ATTR.POLYAMOROUS);
        var isSecret = _hasAttr(record, ATTR.SECRET);
        var isScandalous = _hasAttr(record, ATTR.SCANDALOUS);

        return {
            relationshipId: record.id,
            type: record.type,
            status: record.status,
            participantA: record.participantA,
            participantB: record.participantB,
            partnerId: perspectiveId ? _partnerId(record, perspectiveId) : null,
            startYear: record.startYear,
            endYear: record.endYear,
            attributes: record.attributes.slice(),
            institution: institution,
            isCommitted: isCommitted,
            isAffair: isAffair,
            isPolyamorous: isPolyamorous,
            isSecret: isSecret,
            isScandalous: isScandalous,
            notes: (record.metadata && typeof record.metadata.notes === 'string')
                ? record.metadata.notes
                : ''
        };
    }

    // -------------------------------------------------------------------------
    // ROMANTIC RELATIONSHIPS FOR A CHARACTER
    // -------------------------------------------------------------------------

    /**
     * Returns all romantic relationship projections for a character,
     * active and historical, unless options.activeOnly is set.
     *
     * options: { activeOnly?: boolean }
     */
    function getRomanticRelationships(characterId, options) {
        options = options || {};
        var records = options.activeOnly
            ? RQ.getActiveForCharacter(characterId)
            : RQ.getForCharacter(characterId);

        var out = [];
        for (var i = 0; i < records.length; i++) {
            if (!_isRomantic(records[i])) continue;
            out.push(_project(records[i], characterId));
        }
        return out;
    }

    function getActiveRomanticRelationships(characterId) {
        return getRomanticRelationships(characterId, { activeOnly: true });
    }

    function hasActiveRomanticRelationship(characterId) {
        return getActiveRomanticRelationships(characterId).length > 0;
    }

    function hasActiveCommittedRelationship(characterId) {
        var list = getActiveRomanticRelationships(characterId);
        for (var i = 0; i < list.length; i++) {
            if (list[i].isCommitted) return true;
        }
        return false;
    }

    function countActiveRomanticPartners(characterId) {
        return getActiveRomanticRelationships(characterId).length;
    }

    // -------------------------------------------------------------------------
    // BETWEEN TWO CHARACTERS
    // -------------------------------------------------------------------------

    function getRomanticRelationshipsBetween(aId, bId, options) {
        if (typeof aId !== 'string' || typeof bId !== 'string') return [];
        if (aId === bId) return [];
        var records = RQ.getBetween(aId, bId, options);
        var out = [];
        for (var i = 0; i < records.length; i++) {
            if (!_isRomantic(records[i])) continue;
            out.push(_project(records[i], aId));
        }
        return out;
    }

    function getActiveRomanticRelationshipsBetween(aId, bId) {
        return getRomanticRelationshipsBetween(aId, bId, { activeOnly: true });
    }

    function getActiveCommittedBetween(aId, bId) {
        if (typeof aId !== 'string' || typeof bId !== 'string') return [];
        if (aId === bId) return [];
        var records = RQ.getActiveBetweenOfType(aId, bId, COMMITTED);
        var out = [];
        for (var i = 0; i < records.length; i++) {
            out.push(_project(records[i], aId));
        }
        return out;
    }

    function getAllCommittedBetween(aId, bId) {
        if (typeof aId !== 'string' || typeof bId !== 'string') return [];
        if (aId === bId) return [];
        var records = RQ.getBetweenOfType(aId, bId, COMMITTED);
        var out = [];
        for (var i = 0; i < records.length; i++) {
            out.push(_project(records[i], aId));
        }
        return out;
    }

    function hasActiveRomanticBetween(aId, bId) {
        return getActiveRomanticRelationshipsBetween(aId, bId).length > 0;
    }

    function hasActiveCommittedBetween(aId, bId) {
        return getActiveCommittedBetween(aId, bId).length > 0;
    }

    // -------------------------------------------------------------------------
    // PARTNERS
    // -------------------------------------------------------------------------

    /**
     * Active committed partners for a character. Returns an array of
     * projections, each with `partnerId` populated.
     */
    function getActiveCommittedPartners(characterId) {
        var list = getActiveRomanticRelationships(characterId);
        var out = [];
        for (var i = 0; i < list.length; i++) {
            if (list[i].isCommitted) out.push(list[i]);
        }
        return out;
    }

    /**
     * All active romantic partners regardless of archetype.
     */
    function getActiveRomanticPartners(characterId) {
        return getActiveRomanticRelationships(characterId);
    }

    function countActiveCommittedPartners(characterId) {
        return getActiveCommittedPartners(characterId).length;
    }

    function getCommittedPartnerIds(characterId) {
        var list = getActiveCommittedPartners(characterId);
        var out = [];
        for (var i = 0; i < list.length; i++) {
            if (list[i].partnerId) out.push(list[i].partnerId);
        }
        return out;
    }

    // -------------------------------------------------------------------------
    // AFFAIRS
    //
    // An affair is a committed relationship carrying the SECRET
    // attribute. Nothing else defines an affair. Classification is
    // never stored; it is derived here.
    // -------------------------------------------------------------------------

    function getAffairs(characterId, options) {
        options = options || {};
        var committed = getRomanticRelationships(characterId, {
            activeOnly: !!options.activeOnly
        });
        var out = [];
        for (var i = 0; i < committed.length; i++) {
            if (!committed[i].isCommitted) continue;
            if (!committed[i].isAffair) continue;
            out.push(committed[i]);
        }
        return out;
    }

    function getActiveAffairs(characterId) {
        return getAffairs(characterId, { activeOnly: true });
    }

    function getAffairBetween(aId, bId) {
        var list = getActiveCommittedBetween(aId, bId);
        for (var i = 0; i < list.length; i++) {
            if (list[i].isAffair) return list[i];
        }
        return null;
    }

    function isAffair(relationshipId) {
        var record = RQ.getById(relationshipId);
        if (!record) return false;
        if (record.type !== COMMITTED) return false;
        return RR.isAffair(record.attributes);
    }

    function isSecretRelationship(aId, bId) {
        var list = getActiveCommittedBetween(aId, bId);
        for (var i = 0; i < list.length; i++) {
            if (list[i].isSecret) return true;
        }
        return false;
    }

    // -------------------------------------------------------------------------
    // ATTRIBUTE INTERPRETATION
    //
    // The only functions in the codebase that read romance attributes by
    // name. External domains must call these rather than inspecting
    // `attributes` directly.
    // -------------------------------------------------------------------------

    function hasCommittedAttribute(relationshipId, attribute) {
        var record = RQ.getById(relationshipId);
        if (!record || record.type !== COMMITTED) return false;
        return _hasAttr(record, attribute);
    }

    function hasActiveCommittedAttributeBetween(aId, bId, attribute) {
        var list = getActiveCommittedBetween(aId, bId);
        for (var i = 0; i < list.length; i++) {
            if (list[i].attributes.indexOf(attribute) !== -1) return true;
        }
        return false;
    }

    function getCommittedAttributesBetween(aId, bId) {
        var list = getActiveCommittedBetween(aId, bId);
        if (list.length === 0) return [];
        return list[0].attributes.slice();
    }

    // -------------------------------------------------------------------------
    // MARRIAGE / INSTITUTION PROJECTIONS
    //
    // These are attribute-based projections for display and for callers
    // that need a semantic answer. Legal consequences (succession,
    // inheritance, custody) MUST NOT consult these directly; they
    // consult CultureRules.getPartnershipLegalEffects. This module
    // answers "what institutional marker does this relationship carry",
    // not "what legal rights does it grant."
    // -------------------------------------------------------------------------

    /**
     * The institutional marker on a single committed relationship, or
     * null if none. Precedence: married > handfasted > civil_union >
     * engaged > cohabiting.
     */
    function getInstitution(relationshipId) {
        var record = RQ.getById(relationshipId);
        if (!record || record.type !== COMMITTED) return null;
        for (var i = 0; i < INSTITUTION_PRECEDENCE.length; i++) {
            if (_hasAttr(record, INSTITUTION_PRECEDENCE[i])) {
                return INSTITUTION_PRECEDENCE[i];
            }
        }
        return null;
    }

    function getInstitutionBetween(aId, bId) {
        var list = getActiveCommittedBetween(aId, bId);
        for (var i = 0; i < list.length; i++) {
            if (list[i].institution !== null) return list[i].institution;
        }
        return null;
    }

    /**
     * Whether a character has any active committed relationship whose
     * institution is the given attribute. This is a *semantic*
     * projection, not a legal-status assertion. A culture without
     * marriage can still have characters whose attributes contain
     * `married`, but such a state is only reachable if
     * RomanceRules.validateAttributesForCulture permitted it.
     */
    function hasActiveInstitution(characterId, institution) {
        var list = getActiveCommittedPartners(characterId);
        for (var i = 0; i < list.length; i++) {
            if (list[i].institution === institution) return true;
        }
        return false;
    }

    /**
     * Returns the primary institution for a character, or null.
     */
    function getPrimaryInstitution(characterId) {
        var list = getActiveCommittedPartners(characterId);
        for (var i = 0; i < list.length; i++) {
            if (list[i].institution !== null) return list[i].institution;
        }
        return null;
    }

    // -------------------------------------------------------------------------
    // MULTI-PARTNER FACTS
    //
    // Feeds RomanceRules.canHaveMultiplePartners. The rank and trait
    // facts come from outside romance; callers supply them.
    // -------------------------------------------------------------------------

    /**
     * externalFacts: {
     *   allowsMultipleByRank?: boolean,
     *   allowsMultipleByTrait?: boolean
     * }
     */
    function getMultiPartnerFacts(characterId, externalFacts) {
        externalFacts = externalFacts || {};
        var committed = getActiveCommittedPartners(characterId);

        var anyPolyamorous = false;
        for (var i = 0; i < committed.length; i++) {
            if (committed[i].isPolyamorous) {
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
    // STATISTICS
    // -------------------------------------------------------------------------

    function getRomanceStats(characterId) {
        var all = getRomanticRelationships(characterId);
        var active = getActiveRomanticRelationships(characterId);

        var activeCommitted = 0;
        var activeCasual = 0;
        var activeOneNight = 0;
        var activeAffairs = 0;
        var earliestStartYear = null;

        for (var i = 0; i < active.length; i++) {
            var r = active[i];
            if (r.type === COMMITTED) activeCommitted++;
            else if (r.type === CASUAL) activeCasual++;
            else if (r.type === ONE_NIGHT) activeOneNight++;
            if (r.isAffair) activeAffairs++;
        }

        for (var j = 0; j < all.length; j++) {
            var y = all[j].startYear;
            if (typeof y !== 'number') continue;
            if (earliestStartYear === null || y < earliestStartYear) {
                earliestStartYear = y;
            }
        }

        return {
            totalRelationships: all.length,
            activeRelationships: active.length,
            activeCommitted: activeCommitted,
            activeCasual: activeCasual,
            activeOneNight: activeOneNight,
            activeAffairs: activeAffairs,
            earliestStartYear: earliestStartYear
        };
    }

    // -------------------------------------------------------------------------
    // EXPORTS
    // -------------------------------------------------------------------------

    window.RomanceQueries = {
        // For a character
        getRomanticRelationships: getRomanticRelationships,
        getActiveRomanticRelationships: getActiveRomanticRelationships,
        hasActiveRomanticRelationship: hasActiveRomanticRelationship,
        hasActiveCommittedRelationship: hasActiveCommittedRelationship,
        countActiveRomanticPartners: countActiveRomanticPartners,

        // Between
        getRomanticRelationshipsBetween: getRomanticRelationshipsBetween,
        getActiveRomanticRelationshipsBetween: getActiveRomanticRelationshipsBetween,
        getActiveCommittedBetween: getActiveCommittedBetween,
        getAllCommittedBetween: getAllCommittedBetween,
        hasActiveRomanticBetween: hasActiveRomanticBetween,
        hasActiveCommittedBetween: hasActiveCommittedBetween,

        // Partners
        getActiveCommittedPartners: getActiveCommittedPartners,
        getActiveRomanticPartners: getActiveRomanticPartners,
        countActiveCommittedPartners: countActiveCommittedPartners,
        getCommittedPartnerIds: getCommittedPartnerIds,

        // Affairs
        getAffairs: getAffairs,
        getActiveAffairs: getActiveAffairs,
        getAffairBetween: getAffairBetween,
        isAffair: isAffair,
        isSecretRelationship: isSecretRelationship,

        // Attribute interpretation
        hasCommittedAttribute: hasCommittedAttribute,
        hasActiveCommittedAttributeBetween: hasActiveCommittedAttributeBetween,
        getCommittedAttributesBetween: getCommittedAttributesBetween,

        // Institution projections
        getInstitution: getInstitution,
        getInstitutionBetween: getInstitutionBetween,
        hasActiveInstitution: hasActiveInstitution,
        getPrimaryInstitution: getPrimaryInstitution,

        // Multi-partner facts
        getMultiPartnerFacts: getMultiPartnerFacts,

        // Statistics
        getRomanceStats: getRomanceStats
    };

})();
