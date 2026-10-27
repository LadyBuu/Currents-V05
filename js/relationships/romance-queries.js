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
 *     based)
 *   - multi-partner facts feeding RomanceRules
 *   - pre-submit conflict reporting
 *
 * Depends on RelationshipQueries for raw edge reads and on RomanceRules
 * for the affair predicate and multi-partner policy.
 *
 * Does NOT own:
 *   - state access (goes through RelationshipQueries)
 *   - mutation
 *   - persistence
 *   - randomness
 *   - cultural gating (callers consult CultureRules)
 *
 * MULTI-PARTNER FACTS (DECISION RECORD)
 *
 *   Multi-spouse permission is rank-only. The canonical source is
 *   rank.allowsMultipleSpouses, surfaced through
 *   RomanceCommands._getExternalMultiPartnerFacts as
 *   externalFacts.allowsMultipleByRank.
 *
 *   `allowsMultipleByTrait` is preserved in the returned facts shape
 *   for one revision as a pass-through of the caller-supplied
 *   externalFacts field, which romance-commands supplies as a
 *   hardcoded `false`. It carries no behavioural weight: the
 *   RomanceRules.canHaveMultiplePartners condition that reads it will
 *   always see `false`. It and its consumers are removed together in
 *   the follow-up, alongside the corresponding initializer in
 *   romance-commands.js and the condition in romance-rules.js.
 *
 *   When the field is supplied as `undefined` (a direct caller that
 *   did not go through romance-commands), the `!!` coercion yields
 *   `false`. That is intentional: there is no code path in the current
 *   tree that can legitimately produce `true`, so a caller that
 *   supplies the field is doing so as a legacy exercise, not as a
 *   policy decision.
 *
 * Load order: after relationship-queries.js and romance-rules.js.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - getMultiPartnerFacts docstring updated to document the
 *       rank-only multi-partner policy and the interim
 *       allowsMultipleByTrait behaviour.
 *     - No behavioural change to any function. The field is still
 *       returned with the same coercion; callers that went through
 *       romance-commands observe `false` for it because that module
 *       now supplies `false`.
 * =============================================================================
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

    function getActiveCommittedPartners(characterId) {
        var list = getActiveRomanticRelationships(characterId);
        var out = [];
        for (var i = 0; i < list.length; i++) {
            if (list[i].isCommitted) out.push(list[i]);
        }
        return out;
    }

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
    // INSTITUTION PROJECTIONS
    // -------------------------------------------------------------------------

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

    function hasActiveInstitution(characterId, institution) {
        var list = getActiveCommittedPartners(characterId);
        for (var i = 0; i < list.length; i++) {
            if (list[i].institution === institution) return true;
        }
        return false;
    }

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
    // The caller supplies `externalFacts` — facts that only the caller
    // can know: rank-based multi-spouse permission, trait-based
    // permission, etc. See MULTI-PARTNER FACTS in the module header for
    // the rank-only decision and the interim allowsMultipleByTrait
    // behaviour.
    //
    // Shape returned:
    //   {
    //     existingCommittedCount,
    //     anyPolyamorous,
    //     allowsMultipleByRank,     boolean, from externalFacts
    //     allowsMultipleByTrait     boolean, from externalFacts
    //                               (interim — always false in practice)
    //   }
    // -------------------------------------------------------------------------

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
    // PRE-SUBMIT CONFLICT REPORT
    //
    // Structured list of reasons a proposed romance would be blocked or
    // classified as an affair. Does not decide; reports.
    //
    // options: {
    //   archetype:        'committed' | 'casual_dating' | 'one_night_stand'
    //   forceAffair?:     boolean
    //   explicitSecret?:  boolean
    //   ageA?:            number
    //   ageB?:            number
    //   externalFactsA?:  object
    //   externalFactsB?:  object
    // }
    //
    // Returns {
    //   blocked:              boolean
    //   classification:       'legitimate' | 'affair' | 'polyamorous' | 'blocked'
    //   classificationReason: string
    //   conflicts:            string[]
    // }
    // -------------------------------------------------------------------------

    function getRelationshipConflicts(aId, bId, options) {
        options = options || {};

        var result = {
            blocked: false,
            classification: null,
            classificationReason: null,
            conflicts: []
        };

        if (typeof aId !== 'string' || typeof bId !== 'string') {
            result.blocked = true;
            result.conflicts.push('missing_participant');
            return result;
        }
        if (aId === bId) {
            result.blocked = true;
            result.conflicts.push('same_participant');
            return result;
        }

        var archetype = options.archetype || COMMITTED;
        if (!RR.isRomanticArchetype(archetype)) {
            result.blocked = true;
            result.conflicts.push('not_romantic_archetype');
            return result;
        }

        if (archetype === COMMITTED) {
            if (hasActiveCommittedBetween(aId, bId)) {
                result.blocked = true;
                result.conflicts.push('already_committed');
            }
        } else if (hasActiveRomanticBetween(aId, bId)) {
            result.blocked = true;
            result.conflicts.push('already_romantically_involved');
        }

        if (typeof options.ageA === 'number' && !RR.isAgeValid(archetype, options.ageA)) {
            result.blocked = true;
            result.conflicts.push('participant_a_underage');
        }
        if (typeof options.ageB === 'number' && !RR.isAgeValid(archetype, options.ageB)) {
            result.blocked = true;
            result.conflicts.push('participant_b_underage');
        }

        var aFacts = getMultiPartnerFacts(aId, options.externalFactsA || {});
        if (typeof options.ageA === 'number') aFacts.ageAtStart = options.ageA;

        var bFacts = getMultiPartnerFacts(bId, options.externalFactsB || {});
        if (typeof options.ageB === 'number') bFacts.ageAtStart = options.ageB;

        var classification = RR.classifyNewRelationship({
            archetype: archetype,
            participantAFacts: aFacts,
            participantBFacts: bFacts,
            startYear: options.startYear,
            forceAffair: !!options.forceAffair,
            explicitSecret: !!options.explicitSecret
        });

        result.classification = classification.classification;
        result.classificationReason = classification.reason;

        if (classification.classification === 'blocked') {
            result.blocked = true;
            result.conflicts.push(classification.reason);
        }

        return result;
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
        getRomanticRelationships: getRomanticRelationships,
        getActiveRomanticRelationships: getActiveRomanticRelationships,
        hasActiveRomanticRelationship: hasActiveRomanticRelationship,
        hasActiveCommittedRelationship: hasActiveCommittedRelationship,
        countActiveRomanticPartners: countActiveRomanticPartners,

        getRomanticRelationshipsBetween: getRomanticRelationshipsBetween,
        getActiveRomanticRelationshipsBetween: getActiveRomanticRelationshipsBetween,
        getActiveCommittedBetween: getActiveCommittedBetween,
        getAllCommittedBetween: getAllCommittedBetween,
        hasActiveRomanticBetween: hasActiveRomanticBetween,
        hasActiveCommittedBetween: hasActiveCommittedBetween,

        getActiveCommittedPartners: getActiveCommittedPartners,
        getActiveRomanticPartners: getActiveRomanticPartners,
        countActiveCommittedPartners: countActiveCommittedPartners,
        getCommittedPartnerIds: getCommittedPartnerIds,

        getAffairs: getAffairs,
        getActiveAffairs: getActiveAffairs,
        getAffairBetween: getAffairBetween,
        isAffair: isAffair,
        isSecretRelationship: isSecretRelationship,

        hasCommittedAttribute: hasCommittedAttribute,
        hasActiveCommittedAttributeBetween: hasActiveCommittedAttributeBetween,
        getCommittedAttributesBetween: getCommittedAttributesBetween,

        getInstitution: getInstitution,
        getInstitutionBetween: getInstitutionBetween,
        hasActiveInstitution: hasActiveInstitution,
        getPrimaryInstitution: getPrimaryInstitution,

        getMultiPartnerFacts: getMultiPartnerFacts,

        getRelationshipConflicts: getRelationshipConflicts,

        getRomanceStats: getRomanceStats
    };

})();
