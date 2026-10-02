/**
 * friendship-queries.js
 *
 * Semantic reads for friendship relationships.
 * Returns defensive projections. Never live entities.
 * No policy, no mutation, no persistence.
 */

(function() {
    'use strict';

    var RQ = window.RelationshipQueries;
    var A  = window.RELATIONSHIP_ARCHETYPES;
    var STATUS = window.RELATIONSHIP_STATUS;

    if (!RQ || !A || !STATUS) {
        throw new Error('friendship-queries.js: relationship-queries.js and relationship-types.js must load first');
    }

    var FRIENDSHIP = A.FRIENDSHIP;

    // -------------------------------------------------------------------------
    // INTERNAL
    // -------------------------------------------------------------------------

    function _partnerId(rel, characterId) {
        if (rel.participantA === characterId) return rel.participantB;
        if (rel.participantB === characterId) return rel.participantA;
        return null;
    }

    function _strengthOf(rel) {
        if (!rel || !rel.metadata) return null;
        var s = rel.metadata.strength;
        return typeof s === 'number' ? s : null;
    }

    // -------------------------------------------------------------------------
    // EXISTENCE
    // -------------------------------------------------------------------------

    function areFriends(a, b) {
        var rels = RQ.getBetweenOfType(a, b, FRIENDSHIP, { status: STATUS.ONGOING });
        return rels.length > 0;
    }

    function getFriendshipBetween(a, b) {
        var rels = RQ.getBetweenOfType(a, b, FRIENDSHIP);
        return rels.length > 0 ? rels[0] : null;
    }

    function getActiveFriendshipBetween(a, b) {
        var rels = RQ.getBetweenOfType(a, b, FRIENDSHIP, { status: STATUS.ONGOING });
        return rels.length > 0 ? rels[0] : null;
    }

    // -------------------------------------------------------------------------
    // FRIEND LISTS
    // -------------------------------------------------------------------------

    function getFriendshipsForCharacter(characterId, options) {
        options = options || {};
        var opts = { type: FRIENDSHIP };
        if (options.activeOnly !== false) opts.status = STATUS.ONGOING;
        return RQ.getForCharacter(characterId, opts);
    }

    /**
     * Returns array of { relationship, friendId }.
     */
    function getFriends(characterId) {
        var rels = getFriendshipsForCharacter(characterId);
        return rels.map(function(rel) {
            return {
                relationshipId: rel.id,
                friendId: _partnerId(rel, characterId),
                startYear: rel.startYear,
                endYear: rel.endYear,
                status: rel.status,
                strength: _strengthOf(rel),
                notes: rel.metadata ? rel.metadata.notes : null
            };
        });
    }

    function getFriendsOfCharacterSortedByStrength(characterId) {
        var friends = getFriends(characterId);
        friends.sort(function(x, y) {
            var sx = x.strength === null ? -1 : x.strength;
            var sy = y.strength === null ? -1 : y.strength;
            return sy - sx;
        });
        return friends;
    }

    function getFriendCount(characterId) {
        return getFriendshipsForCharacter(characterId).length;
    }

    function getBestFriend(characterId) {
        var sorted = getFriendsOfCharacterSortedByStrength(characterId);
        return sorted.length > 0 ? sorted[0] : null;
    }

    // -------------------------------------------------------------------------
    // STRENGTH
    // -------------------------------------------------------------------------

    function getFriendshipStrength(a, b) {
        var rel = getActiveFriendshipBetween(a, b);
        if (!rel) return null;
        return _strengthOf(rel);
    }

    function getFriendshipStrengthById(relationshipId) {
        var rel = RQ.getById(relationshipId);
        if (!rel || rel.type !== FRIENDSHIP) return null;
        return _strengthOf(rel);
    }

    // -------------------------------------------------------------------------
    // MUTUAL / SHARED
    // -------------------------------------------------------------------------

    function getMutualFriends(a, b) {
        var aFriends = getFriendshipsForCharacter(a);
        var bFriendIds = {};
        var bList = getFriendshipsForCharacter(b);
        for (var i = 0; i < bList.length; i++) {
            bFriendIds[_partnerId(bList[i], b)] = bList[i];
        }

        var result = [];
        for (var j = 0; j < aFriends.length; j++) {
            var otherId = _partnerId(aFriends[j], a);
            if (!otherId) continue;
            if (otherId === b) continue;
            if (bFriendIds[otherId]) {
                result.push({
                    characterId: otherId,
                    withA: aFriends[j].id,
                    withB: bFriendIds[otherId].id
                });
            }
        }
        return result;
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
                strongestStrength: null
            };
        }

        var totalStrength = 0;
        var strengthCount = 0;
        var earliestStart = null;
        var strongest = null;

        for (var i = 0; i < friends.length; i++) {
            var f = friends[i];
            if (typeof f.strength === 'number') {
                totalStrength += f.strength;
                strengthCount++;
                if (strongest === null || f.strength > strongest.strength) {
                    strongest = f;
                }
            }
            if (typeof f.startYear === 'number') {
                if (earliestStart === null || f.startYear < earliestStart) {
                    earliestStart = f.startYear;
                }
            }
        }

        return {
            totalFriends: friends.length,
            averageStrength: strengthCount > 0
                ? Math.round(totalStrength / strengthCount)
                : null,
            earliestStartYear: earliestStart,
            strongestFriendId: strongest ? strongest.friendId : null,
            strongestStrength: strongest ? strongest.strength : null
        };
    }

    // -------------------------------------------------------------------------
    // EXPORTS
    // -------------------------------------------------------------------------

    window.FriendshipQueries = {
        areFriends: areFriends,
        getFriendshipBetween: getFriendshipBetween,
        getActiveFriendshipBetween: getActiveFriendshipBetween,

        getFriendshipsForCharacter: getFriendshipsForCharacter,
        getFriends: getFriends,
        getFriendsOfCharacterSortedByStrength: getFriendsOfCharacterSortedByStrength,
        getFriendCount: getFriendCount,
        getBestFriend: getBestFriend,

        getFriendshipStrength: getFriendshipStrength,
        getFriendshipStrengthById: getFriendshipStrengthById,

        getMutualFriends: getMutualFriends,

        getFriendshipStats: getFriendshipStats
    };

})();
