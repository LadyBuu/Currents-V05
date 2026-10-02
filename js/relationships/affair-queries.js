/**
 * affair-queries.js
 *
 * Semantic reads for affairs.
 * Affair classification lives in RomanceQueries (SECRET attribute on
 * a committed relationship). This module adds discovery-risk and
 * consequence projections for a given affair.
 *
 * No policy, no mutation, no persistence.
 */

(function() {
    'use strict';

    var RQ = window.RelationshipQueries;
    var RoQ = window.RomanceQueries;
    var AR = window.AffairRules;
    var A  = window.RELATIONSHIP_ARCHETYPES;
    var ATTR = window.RELATIONSHIP_ATTRIBUTES;
    var STATUS = window.RELATIONSHIP_STATUS;

    if (!RQ || !RoQ || !AR || !A || !ATTR || !STATUS) {
        throw new Error('affair-queries.js: relationship-queries.js, romance-queries.js, affair-rules.js must load first');
    }

    // -------------------------------------------------------------------------
    // DEPENDENCIES (fail loud)
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
        return !!(character && character.traits &&
                  character.traits.indexOf('secretive') !== -1);
    }

    function _otherActiveAffairsCount(characterId, excludeRelId) {
        var affairs = RoQ.getActiveAffairsForCharacter(characterId);
        var count = 0;
        for (var i = 0; i < affairs.length; i++) {
            if (affairs[i].id !== excludeRelId) count++;
        }
        return count;
    }

    function _durationYears(rel, referenceYear) {
        if (!rel || typeof rel.startYear !== 'number') return 0;
        var end = rel.endYear !== null && rel.endYear !== undefined
            ? rel.endYear
            : referenceYear;
        return Math.max(0, end - rel.startYear);
    }

    // -------------------------------------------------------------------------
    // AFFAIR LOOKUPS
    // -------------------------------------------------------------------------

    /**
     * Returns projections of a character's affairs (active + ended).
     * Affair = committed + SECRET attribute.
     */
    function getAffairs(characterId, options) {
        options = options || {};
        var rels = options.activeOnly
            ? RoQ.getActiveAffairsForCharacter(characterId)
            : RoQ.getAffairsForCharacter(characterId);

        return rels.map(function(rel) {
            var partnerId = rel.participantA === characterId
                ? rel.participantB
                : rel.participantA;
            return {
                relationshipId: rel.id,
                participantA: rel.participantA,
                participantB: rel.participantB,
                partnerId: partnerId,
                startYear: rel.startYear,
                endYear: rel.endYear,
                status: rel.status,
                attributes: rel.attributes.slice(),
                affairType: (rel.metadata && rel.metadata.affairType) || AR.AFFAIR_TYPE.SECRET,
                discovered: !!(rel.metadata && rel.metadata.discovered),
                discoveryYear: (rel.metadata && rel.metadata.discoveryYear) || null,
                discoveryCircumstances: (rel.metadata && rel.metadata.discoveryCircumstances) || null,
                notes: (rel.metadata && rel.metadata.notes) || null
            };
        });
    }

    function getActiveAffairs(characterId) {
        return getAffairs(characterId, { activeOnly: true });
    }

    function getDiscoveredAffairs(characterId) {
        var all = getAffairs(characterId);
        return all.filter(function(a) { return a.discovered; });
    }

    function isHavingAffair(characterId) {
        return getActiveAffairs(characterId).length > 0;
    }

    function getAffairBetween(a, b) {
        var rel = RoQ.getAffairBetween(a, b);
        if (!rel) return null;
        return {
            relationshipId: rel.id,
            participantA: rel.participantA,
            participantB: rel.participantB,
            startYear: rel.startYear,
            endYear: rel.endYear,
            status: rel.status,
            attributes: rel.attributes.slice(),
            affairType: (rel.metadata && rel.metadata.affairType) || AR.AFFAIR_TYPE.SECRET,
            discovered: !!(rel.metadata && rel.metadata.discovered),
            discoveryYear: (rel.metadata && rel.metadata.discoveryYear) || null
        };
    }

    // -------------------------------------------------------------------------
    // DISCOVERY RISK PROJECTION
    // -------------------------------------------------------------------------

    /**
     * Gathers the facts AffairRules.calculateDiscoveryRisk needs for a
     * relationship id, then delegates.
     */
    function getDiscoveryRisk(relationshipId, options) {
        options = options || {};
        var rel = RQ.getById(relationshipId);
        if (!rel) return null;
        if (rel.type !== A.COMMITTED) return null;
        if (!rel.attributes || rel.attributes.indexOf(ATTR.SECRET) === -1) return null;

        var charA = _getCharacter(rel.participantA);
        var charB = _getCharacter(rel.participantB);
        if (!charA || !charB) return null;

        var referenceYear = options.referenceYear !== undefined
            ? options.referenceYear
            : _getCurrentYear();

        var sameLocation = false;
        if (typeof window.getCurrentLocation === 'function') {
            sameLocation = window.getCurrentLocation(charA) ===
                           window.getCurrentLocation(charB);
        }

        var facts = {
            affairType: (rel.metadata && rel.metadata.affairType) || AR.AFFAIR_TYPE.SECRET,
            participantARankPriority: _rankPriority(charA),
            participantBRankPriority: _rankPriority(charB),
            participantASecretive: _isSecretive(charA),
            participantBSecretive: _isSecretive(charB),
            participantAOtherActiveAffairs: _otherActiveAffairsCount(rel.participantA, rel.id),
            participantBOtherActiveAffairs: _otherActiveAffairsCount(rel.participantB, rel.id),
            durationYears: _durationYears(rel, referenceYear),
            sameLocation: sameLocation,
            publicBehavior: !!(rel.metadata && rel.metadata.publicBehavior),
            previousDiscovery: !!(rel.metadata && rel.metadata.discovered)
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
        var active = all.filter(function(a) { return a.status === STATUS.ONGOING; });
        var discovered = all.filter(function(a) { return a.discovered; });
        var ended = all.filter(function(a) { return a.status === STATUS.ENDED; });

        var totalDuration = 0;
        for (var i = 0; i < all.length; i++) {
            var rel = RQ.getById(all[i].relationshipId);
            totalDuration += _durationYears(rel, referenceYear);
        }

        var typeBreakdown = {};
        for (var j = 0; j < all.length; j++) {
            var t = all[j].affairType;
            typeBreakdown[t] = (typeBreakdown[t] || 0) + 1;
        }

        return {
            totalAffairs: all.length,
            activeAffairs: active.length,
            discoveredAffairs: discovered.length,
            endedAffairs: ended.length,
            averageDuration: all.length > 0 ? totalDuration / all.length : 0,
            typeBreakdown: typeBreakdown,
            hasActiveAffair: active.length > 0
        };
    }

    // -------------------------------------------------------------------------

    window.AffairQueries = {
        getAffairs: getAffairs,
        getActiveAffairs: getActiveAffairs,
        getDiscoveredAffairs: getDiscoveredAffairs,
        isHavingAffair: isHavingAffair,
        getAffairBetween: getAffairBetween,

        getDiscoveryRisk: getDiscoveryRisk,
        getAffairStatistics: getAffairStatistics
    };

})();
