/**
 * friendship-queries.js
 *
 * Semantic reads for friendship relationships.
 *
 * Owns:
 *   - friendship-specific projections
 *   - friend lists, sorted lists, best friend
 *   - mutual friends
 *   - friendship statistics
 *   - friendship-specific existence checks
 *
 * Depends on RelationshipQueries for the raw edge reads and on
 * FriendshipRules for tier/strength bounds.
 *
 * Does NOT own:
 *   - state access (goes through RelationshipQueries)
 *   - mutation
 *   - persistence
 *   - randomness
 *   - any interpretation of romance, professional, or rivalry edges
 *
 * Every returned value is a defensive projection. Never a live record.
 * Unknown inputs return null or []. No fabrication.
 *
 * Load order: after relationship-queries.js and friendship-rules.js.
 */

(function() {
    'use strict';

    var RQ = window.RelationshipQueries;
    var FR = window.FriendshipRules;
    var A  = window.RELATIONSHIP_ARCHETYPES;
    var STATUS = window.RELATIONSHIP_STATUS;

    if (!RQ || !FR || !A || !STATUS) {
        throw new Error('friendship-queries.js: relationship-queries.js and friendship-rules.js must load first');
    }

    var FRIENDSHIP = A.FRIENDSHIP;

    // -------------------------------------------------------------------------
    // INTERNAL HELPERS
    // -------------------------------------------------------------------------

    function _partnerId(record, characterId) {
        if (record.participantA === characterId) return record.participantB;
        if (record.participantB === characterId) return record.participantA;
        return null;
    }

    function _strengthOf(record) {
        if (!record || !record.metadata) return null;
        var s = record.metadata.strength;
        return typeof s === 'number' && !isNaN(s) ? s : null;
    }

    function _notesOf(record) {
        if (!record || !record.metadata) return '';
        var n = record.metadata.notes;
        return typeof n === 'string' ? n : '';
    }

    /**
     * Projects a friendship record into the friendship domain's shape.
     * The `friendId` is the other participant relative to the given
     * character. Pass null to omit a perspective.
     */
    function _project(record, perspectiveId) {
        if (!record) return null;
        var strength = _strengthOf(record);
        var tier = strength !== null ? FR.strengthTier(strength) : FR.TIER_UNKNOWN;
        return {
            relationshipId: record.id,
            participantA: record.participantA,
            participantB: record.participantB,
            friendId: perspectiveId ? _partnerId(record, perspectiveId) : null,
            startYear: record.startYear,
            endYear: record.endYear,
            status: record.status,
            strength: strength,
            tier: tier,
            notes: _notesOf(record),
            eventCount: (record.metadata && Array.isArray(record.metadata.events))
                ? record.metadata.events.length
                : 0
        };
    }

    // -------------------------------------------------------------------------
    // EXISTENCE
    // -------------------------------------------------------------------------

    function areFriends(aId, bId) {
        if (typeof aId !== 'string' || typeof bId !== 'string') return false;
        if (aId === bId) return false;
        return RQ.hasActiveBetweenOfType(aId, bId, FRIENDSHIP);
    }

    /**
     * Returns the projection of the active friendship between two
     * characters, or null if none. Uses the perspective of aId.
     */
    function getActiveFriendshipBetween(aId, bId) {
        if (typeof aId !== 'string' || typeof bId !== 'string') return null;
        if (aId === bId) return null;
        var records = RQ.getActiveBetweenOfType(aId, bId, FRIENDSHIP);
        if (records.length === 0) return null;
        return _project(records[0], aId);
    }

    /**
     * Returns the projection of the most recent friendship record
     * between two characters, active or not. Uses the perspective of aId.
     */
    function getLatestFriendshipBetween(aId, bId) {
        if (typeof aId !== 'string' || typeof bId !== 'string') return null;
        if (aId === bId) return null;
        var records = RQ.getBetweenOfType(aId, bId, FRIENDSHIP);
        if (records.length === 0) return null;

        var latest = records[0];
        for (var i = 1; i < records.length; i++) {
            var a = records[i].startYear;
            var b = latest.startYear;
            if (a === null && b === null) continue;
            if (a === null) continue;
            if (b === null) { latest = records[i]; continue; }
            if (a > b) latest = records[i];
        }
        return _project(latest, aId);
    }

    /**
     * Returns every friendship record between two characters, active and
     * historical, projected with aId as the perspective.
     */
    function getAllFriendshipsBetween(aId, bId) {
        if (typeof aId !== 'string' || typeof bId !== 'string') return [];
        if (aId === bId) return [];
        var records = RQ.getBetweenOfType(aId, bId, FRIENDSHIP);
        var out = [];
        for (var i = 0; i < records.length; i++) {
            out.push(_project(records[i], aId));
        }
        return out;
    }

    // -------------------------------------------------------------------------
    // FRIEND LISTS
    // -------------------------------------------------------------------------

    /**
     * Returns projections of every active friendship for a character.
     * options: { includeEnded: boolean }
     */
    function getFriendshipsForCharacter(characterId, options) {
        options = options || {};
        var records = options.includeEnded
            ? RQ.getForCharacter(characterId, { type: FRIENDSHIP })
            : RQ.getForCharacter(characterId, { type: FRIENDSHIP, activeOnly: true });

        var out = [];
        for (var i = 0; i < records.length; i++) {
            out.push(_project(records[i], characterId));
        }
        return out;
    }

    /**
     * Alias with a clearer name for the common case.
     */
    function getFriends(characterId) {
        return getFriendshipsForCharacter(characterId);
    }

    /**
     * Returns friends sorted by strength descending. Friends with an
     * unknown strength are placed at the end.
     */
    function getFriendsSortedByStrength(characterId) {
        var friends = getFriends(characterId);
        friends.sort(function(x, y) {
            var sx = x.strength === null ? -1 : x.strength;
            var sy = y.strength === null ? -1 : y.strength;
            if (sx !== sy) return sy - sx;
            // Tie-break by start year, oldest first
            var yx = x.startYear === null ? Infinity : x.startYear;
            var yy = y.startYear === null ? Infinity : y.startYear;
            return yx - yy;
        });
        return friends;
    }

    function getFriendCount(characterId) {
        if (typeof characterId !== 'string' || characterId.length === 0) return 0;
        return RQ.countByTypeForCharacter(characterId, FRIENDSHIP);
    }

    function getBestFriend(characterId) {
        var sorted = getFriendsSortedByStrength(characterId);
        if (sorted.length === 0) return null;
        return sorted[0];
    }

    // -------------------------------------------------------------------------
    // STRENGTH LOOKUP
    // -------------------------------------------------------------------------

    function getFriendshipStrength(aId, bId) {
        var rel = getActiveFriendshipBetween(aId, bId);
        return rel ? rel.strength : null;
    }

    function getFriendshipStrengthById(relationshipId) {
        var rec = RQ.getById(relationshipId);
        if (!rec || rec.type !== FRIENDSHIP) return null;
        return _strengthOf(rec);
    }

    function getFriendshipTier(aId, bId) {
        var rel = getActiveFriendshipBetween(aId, bId);
        return rel ? rel.tier : null;
    }

    // -------------------------------------------------------------------------
    // MUTUAL FRIENDS
    // -------------------------------------------------------------------------

    /**
     * Returns the distinct set of characters who are simultaneously
     * friends with both aId and bId. Excludes aId and bId.
     */
    function getMutualFriends(aId, bId) {
        if (typeof aId !== 'string' || typeof bId !== 'string') return [];
        if (aId === bId) return [];

        var aFriends = getFriends(aId);
        var bFriendIds = {};
        var bFriends = getFriends(bId);
        for (var i = 0; i < bFriends.length; i++) {
            if (bFriends[i].friendId) bFriendIds[bFriends[i].friendId] = true;
        }

        var seen = {};
        var out = [];
        for (var j = 0; j < aFriends.length; j++) {
            var other = aFriends[j].friendId;
            if (!other) continue;
            if (other === bId) continue;
            if (!bFriendIds[other]) continue;
            if (seen[other]) continue;
            seen[other] = true;
            out.push(other);
        }
        return out;
    }

    // -------------------------------------------------------------------------
    // STATISTICS
    // -------------------------------------------------------------------------

    function getFriendshipStats(characterId) {
        var friends = getFriends(characterId);
        if (friends.length === 0) {
            return {
                totalFriends: 0,
                averageStrength: null,
                earliestStartYear: null,
                strongestFriendId: null,
                strongestStrength: null,
                tierBreakdown: {
                    acquaintance: 0,
                    friend: 0,
                    close_friend: 0,
                    best_friend: 0,
                    unknown: 0
                }
            };
        }

        var totalStrength = 0;
        var strengthCount = 0;
        var earliestStartYear = null;
        var strongest = null;
        var tiers = {
            acquaintance: 0,
            friend: 0,
            close_friend: 0,
            best_friend: 0,
            unknown: 0
        };

        for (var i = 0; i < friends.length; i++) {
            var f = friends[i];

            if (typeof f.strength === 'number') {
                totalStrength += f.strength;
                strengthCount++;
                if (!strongest || f.strength > strongest.strength) {
                    strongest = f;
                }
            }

            if (typeof f.tier === 'string') {
                if (tiers[f.tier] === undefined) tiers[f.tier] = 0;
                tiers[f.tier]++;
            }

            if (typeof f.startYear === 'number') {
                if (earliestStartYear === null || f.startYear < earliestStartYear) {
                    earliestStartYear = f.startYear;
                }
            }
        }

        return {
            totalFriends: friends.length,
            averageStrength: strengthCount > 0
                ? Math.round(totalStrength / strengthCount)
                : null,
            earliestStartYear: earliestStartYear,
            strongestFriendId: strongest ? strongest.friendId : null,
            strongestStrength: strongest ? strongest.strength : null,
            tierBreakdown: tiers
        };
    }

    // -------------------------------------------------------------------------
    // EVENT HISTORY
    //
    // Returns a defensive copy of the friendship's event array. Not a
    // live reference. Events are documented as bounded (see
    // FriendshipRules.EVENT_HISTORY_MAX).
    // -------------------------------------------------------------------------

    function getFriendshipEvents(relationshipId) {
        var rec = RQ.getById(relationshipId);
        if (!rec || rec.type !== FRIENDSHIP) return [];
        if (!rec.metadata || !Array.isArray(rec.metadata.events)) return [];

        var out = [];
        for (var i = 0; i < rec.metadata.events.length; i++) {
            var e = rec.metadata.events[i];
            if (!e || typeof e !== 'object') continue;
            out.push({
                type: typeof e.type === 'string' ? e.type : null,
                year: typeof e.year === 'number' ? e.year : null,
                impact: typeof e.impact === 'number' ? e.impact : 0,
                description: typeof e.description === 'string' ? e.description : null
            });
        }
        return out;
    }

    // -------------------------------------------------------------------------
    // EXPORTS
    // -------------------------------------------------------------------------

    window.FriendshipQueries = {
        // Existence
        areFriends: areFriends,
        getActiveFriendshipBetween: getActiveFriendshipBetween,
        getLatestFriendshipBetween: getLatestFriendshipBetween,
        getAllFriendshipsBetween: getAllFriendshipsBetween,

        // Lists
        getFriendshipsForCharacter: getFriendshipsForCharacter,
        getFriends: getFriends,
        getFriendsSortedByStrength: getFriendsSortedByStrength,
        getFriendCount: getFriendCount,
        getBestFriend: getBestFriend,

        // Strength
        getFriendshipStrength: getFriendshipStrength,
        getFriendshipStrengthById: getFriendshipStrengthById,
        getFriendshipTier: getFriendshipTier,

        // Mutual
        getMutualFriends: getMutualFriends,

        // Statistics
        getFriendshipStats: getFriendshipStats,

        // Events
        getFriendshipEvents: getFriendshipEvents
    };

})();
