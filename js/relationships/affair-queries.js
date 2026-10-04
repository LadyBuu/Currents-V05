/**
 * affair-queries.js
 *
 * Semantic reads for affairs.
 *
 * Owns:
 *   - affair projections for a character and between two characters
 *   - discovery-risk projections for a given affair record
 *   - affair statistics
 *   - named accessors for common affair fields
 *
 * Depends on RelationshipQueries, RomanceQueries, RomanceRules,
 * AffairRules.
 *
 * Load order: after relationship-queries.js, romance-queries.js,
 * romance-rules.js, affair-rules.js.
 */

(function() {
    'use strict';

    var RQ = window.RelationshipQueries;
    var RoQ = window.RomanceQueries;
    var RR = window.RomanceRules;
    var AR = window.AffairRules;

    var A = window.RELATIONSHIP_ARCHETYPES;
    var ATTR = window.RELATIONSHIP_ATTRIBUTES;
    var STATUS = window.RELATIONSHIP_STATUS;

    if (!RQ || !RoQ || !RR || !AR || !A || !ATTR || !STATUS) {
        throw new Error('affair-queries.js: relationship-queries.js, romance-queries.js, romance-rules.js, affair-rules.js must load first');
    }

    var COMMITTED = A.COMMITTED;

    // -------------------------------------------------------------------------
    // DEPENDENCIES
    // -------------------------------------------------------------------------

    function _getCharacter(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('affair-queries.js: getCharacterById required');
        }
        return window.getCharacterById(id);
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error('affair-queries.js: getCurrentYearSafe required');
        }
        return window.getCurrentYearSafe();
    }

    function _rankPriority(character) {
        if (!character || !character.activeRankId) return 5;
        if (typeof window.getRankById !== 'function') return 5;
        var rank = window.getRankById(character.activeRankId);
        return (rank && typeof rank.priority === 'number') ? rank.priority : 5;
    }

    function _isSecretive(character) {
        return !!(character && Array.isArray(character.traits) &&
                  character.traits.indexOf('secretive') !== -1);
    }

    function _durationYears(record, referenceYear) {
        if (!record || typeof record.startYear !== 'number') return 0;
        var end = (record.endYear !== null && record.endYear !== undefined)
            ? record.endYear
            : referenceYear;
        return Math.max(0, end - record.startYear);
    }

    function _sameLocation(charA, charB) {
        if (typeof window.getCurrentLocation !== 'function') return false;
        var a = window.getCurrentLocation(charA);
        var b = window.getCurrentLocation(charB);
        if (a === null || b === null || a === undefined || b === undefined) return false;
        return a === b;
    }

    function _otherActiveAffairsCount(characterId, excludeRelId) {
        var list = RoQ.getActiveAffairs(characterId);
        var count = 0;
        for (var i = 0; i < list.length; i++) {
            if (list[i].relationshipId !== excludeRelId) count++;
        }
        return count;
    }

    // -------------------------------------------------------------------------
    // PROJECTION
    // -------------------------------------------------------------------------

    function _projectAffair(romanceProjection) {
        if (!romanceProjection) return null;
        if (!romanceProjection.isAffair) return null;

        var record = RQ.getById(romanceProjection.relationshipId);
        if (!record) return null;

        var meta = record.metadata || {};
        return {
            relationshipId: record.id,
            participantA: record.participantA,
            participantB: record.participantB,
            startYear: record.startYear,
            endYear: record.endYear,
            status: record.status,
            attributes: record.attributes.slice(),
            affairType: typeof meta.affairType === 'string'
                ? meta.affairType
                : AR.AFFAIR_TYPE.SECRET,
            discovered: !!meta.discovered,
            discoveryYear: typeof meta.discoveryYear === 'number'
                ? meta.discoveryYear
                : null,
            discoveryCircumstances: typeof meta.discoveryCircumstances === 'string'
                ? meta.discoveryCircumstances
                : null,
            discovererId: typeof meta.discovererId === 'string'
                ? meta.discovererId
                : null,
            consequencesTriggered: !!meta.consequencesTriggered,
            consequences: Array.isArray(meta.consequences)
                ? meta.consequences.slice()
                : [],
            legitimizedFromAffair: !!meta.legitimizedFromAffair,
            legitimizationYear: typeof meta.legitimizationYear === 'number'
                ? meta.legitimizationYear
                : null,
            notes: typeof meta.notes === 'string' ? meta.notes : ''
        };
    }

    // -------------------------------------------------------------------------
    // AFFAIR LOOKUPS
    // -------------------------------------------------------------------------

    function getAffairs(characterId, options) {
        options = options || {};
        var active = RoQ.getRomanticRelationships(characterId, {
            activeOnly: !!options.activeOnly
        });
        var out = [];
        for (var i = 0; i < active.length; i++) {
            if (!active[i].isCommitted) continue;
            if (!active[i].isAffair) continue;
            var projection = _projectAffair(active[i]);
            if (projection) out.push(projection);
        }
        return out;
    }

    function getActiveAffairs(characterId) {
        return getAffairs(characterId, { activeOnly: true });
    }

    function getDiscoveredAffairs(characterId) {
        var all = getAffairs(characterId);
        var out = [];
        for (var i = 0; i < all.length; i++) {
            if (all[i].discovered) out.push(all[i]);
        }
        return out;
    }

    function isHavingAffair(characterId) {
        return getActiveAffairs(characterId).length > 0;
    }

    function getAffairBetween(aId, bId) {
        var list = RoQ.getActiveCommittedBetween(aId, bId);
        for (var i = 0; i < list.length; i++) {
            if (list[i].isAffair) return _projectAffair(list[i]);
        }
        return null;
    }

    function getAffairById(relationshipId) {
        var rec = RQ.getById(relationshipId);
        if (!rec) return null;
        if (rec.type !== COMMITTED) return null;
        if (!RR.isAffair(rec.attributes)) return null;
        var romanceProjection = {
            relationshipId: rec.id,
            type: rec.type,
            status: rec.status,
            participantA: rec.participantA,
            participantB: rec.participantB,
            startYear: rec.startYear,
            endYear: rec.endYear,
            attributes: rec.attributes.slice(),
            isCommitted: true,
            isAffair: true
        };
        return _projectAffair(romanceProjection);
    }

    // -------------------------------------------------------------------------
    // NAMED ACCESSORS
    // -------------------------------------------------------------------------

    function getAffairDuration(relationshipId, referenceYear) {
        var rec = RQ.getById(relationshipId);
        if (!rec) return null;
        if (rec.type !== COMMITTED) return null;
        if (!RR.isAffair(rec.attributes)) return null;
        var ref = (typeof referenceYear === 'number') ? referenceYear : _getCurrentYear();
        return _durationYears(rec, ref);
    }

    function getAffairDiscoverer(relationshipId) {
        var rec = RQ.getById(relationshipId);
        if (!rec || rec.type !== COMMITTED) return null;
        if (!rec.metadata || !rec.metadata.discovered) return null;
        return typeof rec.metadata.discovererId === 'string'
            ? rec.metadata.discovererId
            : null;
    }

    function getAffairDiscoveryCircumstances(relationshipId) {
        var rec = RQ.getById(relationshipId);
        if (!rec || rec.type !== COMMITTED) return null;
        if (!rec.metadata || !rec.metadata.discovered) return null;
        return typeof rec.metadata.discoveryCircumstances === 'string'
            ? rec.metadata.discoveryCircumstances
            : null;
    }

    function getAffairDiscoveryYear(relationshipId) {
        var rec = RQ.getById(relationshipId);
        if (!rec || rec.type !== COMMITTED) return null;
        if (!rec.metadata || !rec.metadata.discovered) return null;
        return typeof rec.metadata.discoveryYear === 'number'
            ? rec.metadata.discoveryYear
            : null;
    }

    // -------------------------------------------------------------------------
    // DISCOVERY RISK
    // -------------------------------------------------------------------------

    function getDiscoveryRisk(relationshipId, options) {
        options = options || {};

        var rec = RQ.getById(relationshipId);
        if (!rec) return null;
        if (rec.type !== COMMITTED) return null;
        if (!RR.isAffair(rec.attributes)) return null;

        var charA = _getCharacter(rec.participantA);
        var charB = _getCharacter(rec.participantB);
        if (!charA || !charB) return null;

        var referenceYear = options.referenceYear !== undefined
            ? options.referenceYear
            : _getCurrentYear();

        var meta = rec.metadata || {};

        var facts = {
            affairType: typeof meta.affairType === 'string'
                ? meta.affairType
                : AR.AFFAIR_TYPE.SECRET,
            participantARankPriority: _rankPriority(charA),
            participantBRankPriority: _rankPriority(charB),
            participantASecretive: _isSecretive(charA),
            participantBSecretive: _isSecretive(charB),
            participantAOtherActiveAffairs: _otherActiveAffairsCount(rec.participantA, rec.id),
            participantBOtherActiveAffairs: _otherActiveAffairsCount(rec.participantB, rec.id),
            durationYears: _durationYears(rec, referenceYear),
            sameLocation: _sameLocation(charA, charB),
            publicBehavior: !!meta.publicBehavior,
            previousDiscovery: !!meta.discovered
        };

        var risk = AR.calculateDiscoveryRisk(facts);
        return {
            risk: risk,
            annualChance: AR.annualDiscoveryChance(risk),
            facts: facts
        };
    }

    // -------------------------------------------------------------------------
    // STATISTICS
    // -------------------------------------------------------------------------

    function getAffairStatistics(characterId, options) {
        options = options || {};
        var referenceYear = options.referenceYear !== undefined
            ? options.referenceYear
            : _getCurrentYear();

        var all = getAffairs(characterId);
        var active = 0;
        var discovered = 0;
        var ended = 0;
        var totalDuration = 0;
        var typeBreakdown = {};
        var earliestStartYear = null;

        for (var i = 0; i < all.length; i++) {
            var a = all[i];
            if (a.status === STATUS.ONGOING) active++;
            if (a.status === STATUS.ENDED) ended++;
            if (a.discovered) discovered++;

            var type = a.affairType;
            typeBreakdown[type] = (typeBreakdown[type] || 0) + 1;

            var rec = RQ.getById(a.relationshipId);
            totalDuration += _durationYears(rec, referenceYear);

            if (typeof a.startYear === 'number') {
                if (earliestStartYear === null || a.startYear < earliestStartYear) {
                    earliestStartYear = a.startYear;
                }
            }
        }

        return {
            totalAffairs: all.length,
            activeAffairs: active,
            discoveredAffairs: discovered,
            endedAffairs: ended,
            averageDuration: all.length > 0 ? totalDuration / all.length : 0,
            typeBreakdown: typeBreakdown,
            earliestStartYear: earliestStartYear,
            hasActiveAffair: active > 0
        };
    }

    // -------------------------------------------------------------------------
    // AGGREGATE DISCOVERY RISK
    // -------------------------------------------------------------------------

    function getHighestRiskAffair(characterId, options) {
        options = options || {};
        var active = getActiveAffairs(characterId);
        if (active.length === 0) return null;

        var best = null;
        var bestRisk = -1;

        for (var i = 0; i < active.length; i++) {
            var projection = getDiscoveryRisk(active[i].relationshipId, options);
            if (!projection) continue;
            if (projection.risk > bestRisk) {
                bestRisk = projection.risk;
                best = {
                    affair: active[i],
                    risk: projection.risk,
                    annualChance: projection.annualChance,
                    facts: projection.facts
                };
            }
        }

        return best;
    }

    // -------------------------------------------------------------------------
    // EXPORTS
    // -------------------------------------------------------------------------

    window.AffairQueries = {
        getAffairs: getAffairs,
        getActiveAffairs: getActiveAffairs,
        getDiscoveredAffairs: getDiscoveredAffairs,
        isHavingAffair: isHavingAffair,
        getAffairBetween: getAffairBetween,
        getAffairById: getAffairById,

        getAffairDuration: getAffairDuration,
        getAffairDiscoverer: getAffairDiscoverer,
        getAffairDiscoveryCircumstances: getAffairDiscoveryCircumstances,
        getAffairDiscoveryYear: getAffairDiscoveryYear,

        getDiscoveryRisk: getDiscoveryRisk,
        getHighestRiskAffair: getHighestRiskAffair,

        getAffairStatistics: getAffairStatistics
    };

})();
