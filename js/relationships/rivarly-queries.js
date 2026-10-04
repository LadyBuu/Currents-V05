/**
 * rivalry-queries.js
 *
 * Semantic reads for rivalry and enmity relationships.
 *
 * Owns:
 *   - rivalry-specific projections
 *   - enmity-specific projections
 *   - social conflict lists
 *   - existence checks
 *   - history (active + ended)
 *   - conflict statistics
 *
 * Depends on RelationshipQueries for raw edge reads.
 *
 * Does NOT own:
 *   - state access (goes through RelationshipQueries)
 *   - mutation
 *   - persistence
 *   - randomness
 *   - any interpretation of romance, friendship, or professional edges
 *
 * Every returned value is a defensive projection. Never a live record.
 * Unknown inputs return null or []. No fabrication.
 *
 * Load order: after relationship-queries.js and rivalry-rules.js.
 */

(function() {
    'use strict';

    var RQ = window.RelationshipQueries;
    var RR = window.RivalryRules;
    var A  = window.RELATIONSHIP_ARCHETYPES;
    var STATUS = window.RELATIONSHIP_STATUS;

    if (!RQ || !RR || !A || !STATUS) {
        throw new Error('rivalry-queries.js: relationship-queries.js and rivalry-rules.js must load first');
    }

    var RIVALRY = A.RIVALRY;
    var ENMITY  = A.ENMITY;

    // -------------------------------------------------------------------------
    // INTERNAL HELPERS
    // -------------------------------------------------------------------------

    function _partnerId(record, characterId) {
        if (record.participantA === characterId) return record.participantB;
        if (record.participantB === characterId) return record.participantA;
        return null;
    }

    function _project(record, perspectiveId) {
        if (!record) return null;
        return {
            relationshipId: record.id,
            type: record.type,
            status: record.status,
            participantA: record.participantA,
            participantB: record.participantB,
            otherId: perspectiveId ? _partnerId(record, perspectiveId) : null,
            startYear: record.startYear,
            endYear: record.endYear
        };
    }

    // -------------------------------------------------------------------------
    // EXISTENCE
    // -------------------------------------------------------------------------

    function areRivals(aId, bId) {
        if (typeof aId !== 'string' || typeof bId !== 'string') return false;
        if (aId === bId) return false;
        return RQ.hasActiveBetweenOfType(aId, bId, RIVALRY);
    }

    function areEnemies(aId, bId) {
        if (typeof aId !== 'string' || typeof bId !== 'string') return false;
        if (aId === bId) return false;
        return RQ.hasActiveBetweenOfType(aId, bId, ENMITY);
    }

    function areInConflict(aId, bId) {
        return areRivals(aId, bId) || areEnemies(aId, bId);
    }

    // -------------------------------------------------------------------------
    // BETWEEN TWO CHARACTERS
    // -------------------------------------------------------------------------

    function getActiveRivalryBetween(aId, bId) {
        if (typeof aId !== 'string' || typeof bId !== 'string') return null;
        if (aId === bId) return null;
        var records = RQ.getActiveBetweenOfType(aId, bId, RIVALRY);
        if (records.length === 0) return null;
        return _project(records[0], aId);
    }

    function getActiveEnmityBetween(aId, bId) {
        if (typeof aId !== 'string' || typeof bId !== 'string') return null;
        if (aId === bId) return null;
        var records = RQ.getActiveBetweenOfType(aId, bId, ENMITY);
        if (records.length === 0) return null;
        return _project(records[0], aId);
    }

    function getAllRivalriesBetween(aId, bId) {
        if (typeof aId !== 'string' || typeof bId !== 'string') return [];
        if (aId === bId) return [];
        var records = RQ.getBetweenOfType(aId, bId, RIVALRY);
        var out = [];
        for (var i = 0; i < records.length; i++) {
            out.push(_project(records[i], aId));
        }
        return out;
    }

    function getAllEnmitiesBetween(aId, bId) {
        if (typeof aId !== 'string' || typeof bId !== 'string') return [];
        if (aId === bId) return [];
        var records = RQ.getBetweenOfType(aId, bId, ENMITY);
        var out = [];
        for (var i = 0; i < records.length; i++) {
            out.push(_project(records[i], aId));
        }
        return out;
    }

    // -------------------------------------------------------------------------
    // LISTS FOR A CHARACTER
    // -------------------------------------------------------------------------

    /**
     * Active rivalries for a character. options: { includeEnded: boolean }
     */
    function getRivalries(characterId, options) {
        options = options || {};
        var records = options.includeEnded
            ? RQ.getForCharacter(characterId, { type: RIVALRY })
            : RQ.getForCharacter(characterId, { type: RIVALRY, activeOnly: true });
        var out = [];
        for (var i = 0; i < records.length; i++) {
            out.push(_project(records[i], characterId));
        }
        return out;
    }

    /**
     * Active enmities for a character. options: { includeEnded: boolean }
     */
    function getEnmities(characterId, options) {
        options = options || {};
        var records = options.includeEnded
            ? RQ.getForCharacter(characterId, { type: ENMITY })
            : RQ.getForCharacter(characterId, { type: ENMITY, activeOnly: true });
        var out = [];
        for (var i = 0; i < records.length; i++) {
            out.push(_project(records[i], characterId));
        }
        return out;
    }

    /**
     * All active conflict edges (rivalries and enmities) for a character,
     * interleaved. The projection carries `type` so callers can
     * distinguish.
     */
    function getConflicts(characterId, options) {
        options = options || {};
        var rivalries = getRivalries(characterId, options);
        var enmities = getEnmities(characterId, options);
        return rivalries.concat(enmities);
    }

    function getRivalIds(characterId, options) {
        var list = getRivalries(characterId, options);
        var out = [];
        for (var i = 0; i < list.length; i++) {
            if (list[i].otherId) out.push(list[i].otherId);
        }
        return out;
    }

    function getEnemyIds(characterId, options) {
        var list = getEnmities(characterId, options);
        var out = [];
        for (var i = 0; i < list.length; i++) {
            if (list[i].otherId) out.push(list[i].otherId);
        }
        return out;
    }

    function getRivalryCount(characterId) {
        if (typeof characterId !== 'string' || characterId.length === 0) return 0;
        return RQ.countByTypeForCharacter(characterId, RIVALRY);
    }

    function getEnmityCount(characterId) {
        if (typeof characterId !== 'string' || characterId.length === 0) return 0;
        return RQ.countByTypeForCharacter(characterId, ENMITY);
    }

    // -------------------------------------------------------------------------
    // SHARED CONFLICT
    //
    // Characters who are rivals or enemies of both aId and bId.
    // -------------------------------------------------------------------------

    function getSharedRivals(aId, bId) {
        return _getShared(aId, bId, getRivalIds);
    }

    function getSharedEnemies(aId, bId) {
        return _getShared(aId, bId, getEnemyIds);
    }

    function getSharedConflicts(aId, bId) {
        var seen = {};
        var out = [];
        var sources = [getSharedRivals(aId, bId), getSharedEnemies(aId, bId)];
        for (var i = 0; i < sources.length; i++) {
            for (var j = 0; j < sources[i].length; j++) {
                var id = sources[i][j];
                if (seen[id]) continue;
                seen[id] = true;
                out.push(id);
            }
        }
        return out;
    }

    function _getShared(aId, bId, getter) {
        if (typeof aId !== 'string' || typeof bId !== 'string') return [];
        if (aId === bId) return [];

        var aList = getter(aId);
        var bSet = {};
        var bList = getter(bId);
        for (var i = 0; i < bList.length; i++) {
            bSet[bList[i]] = true;
        }

        var seen = {};
        var out = [];
        for (var j = 0; j < aList.length; j++) {
            var other = aList[j];
            if (other === bId) continue;
            if (!bSet[other]) continue;
            if (seen[other]) continue;
            seen[other] = true;
            out.push(other);
        }
        return out;
    }

    // -------------------------------------------------------------------------
    // STATISTICS
    // -------------------------------------------------------------------------

    function getRivalryStats(characterId) {
        var active = getRivalries(characterId);
        var all = getRivalries(characterId, { includeEnded: true });

        var earliestStartYear = null;
        for (var i = 0; i < all.length; i++) {
            var y = all[i].startYear;
            if (typeof y !== 'number') continue;
            if (earliestStartYear === null || y < earliestStartYear) {
                earliestStartYear = y;
            }
        }

        return {
            activeCount: active.length,
            historicalCount: all.length,
            endedCount: all.length - active.length,
            earliestStartYear: earliestStartYear
        };
    }

    function getEnmityStats(characterId) {
        var active = getEnmities(characterId);
        var all = getEnmities(characterId, { includeEnded: true });

        var earliestStartYear = null;
        for (var i = 0; i < all.length; i++) {
            var y = all[i].startYear;
            if (typeof y !== 'number') continue;
            if (earliestStartYear === null || y < earliestStartYear) {
                earliestStartYear = y;
            }
        }

        return {
            activeCount: active.length,
            historicalCount: all.length,
            endedCount: all.length - active.length,
            earliestStartYear: earliestStartYear
        };
    }

    // -------------------------------------------------------------------------
    // EXPORTS
    // -------------------------------------------------------------------------

    window.RivalryQueries = {
        // Existence
        areRivals: areRivals,
        areEnemies: areEnemies,
        areInConflict: areInConflict,

        // Between
        getActiveRivalryBetween: getActiveRivalryBetween,
        getActiveEnmityBetween: getActiveEnmityBetween,
        getAllRivalriesBetween: getAllRivalriesBetween,
        getAllEnmitiesBetween: getAllEnmitiesBetween,

        // Lists
        getRivalries: getRivalries,
        getEnmities: getEnmities,
        getConflicts: getConflicts,
        getRivalIds: getRivalIds,
        getEnemyIds: getEnemyIds,
        getRivalryCount: getRivalryCount,
        getEnmityCount: getEnmityCount,

        // Shared
        getSharedRivals: getSharedRivals,
        getSharedEnemies: getSharedEnemies,
        getSharedConflicts: getSharedConflicts,

        // Statistics
        getRivalryStats: getRivalryStats,
        getEnmityStats: getEnmityStats
    };

})();
