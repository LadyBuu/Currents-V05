/**
 * =============================================================================
 * STILL WATERS - FRIENDSHIP LOGIC
 * =============================================================================
 * 
 * Friendship-specific business logic built on top of the relationship registry.
 * 
 * DEPENDENCIES:
 *   - relationship-registry.js (createRelationship, getRelationshipBetween)
 *   - relationship-types.js (RELATIONSHIP_ARCHETYPES, RELATIONSHIP_STATUS)
 *   - accessors.js (getCharacterById, getCharacters)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getCharacters() {
        return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        if (typeof window.getCurrentYear === 'function') {
            return window.getCurrentYear();
        }
        return 1250;
    }

    function _calculateAge(birthYear, isDeceased, deathYear) {
        if (typeof window.calculateAge === 'function') {
            return window.calculateAge(birthYear, isDeceased, deathYear);
        }
        var currentYear = _getCurrentYear();
        if (!birthYear) return 0;
        if (isDeceased && deathYear) return Math.max(0, deathYear - birthYear);
        return Math.max(0, currentYear - birthYear);
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    function _getMutualConnections(idA, idB, options) {
        if (typeof window.getMutualConnections === 'function') {
            return window.getMutualConnections(idA, idB, options);
        }
        return [];
    }

    // =========================================================================
    // 2. RELATIONSHIP REGISTRY WRAPPERS
    // =========================================================================

    function _createRelationship(idA, idB, options) {
        if (typeof window.createRelationship === 'function') {
            return window.createRelationship(idA, idB, options);
        }
        return null;
    }

    function _getRelationshipBetween(idA, idB) {
        if (typeof window.getRelationshipBetween === 'function') {
            return window.getRelationshipBetween(idA, idB);
        }
        return null;
    }

    function _getRelationshipsForCharacter(id, options) {
        if (typeof window.getRelationshipsForCharacter === 'function') {
            return window.getRelationshipsForCharacter(id, options);
        }
        return [];
    }

    function _updateRelationship(relId, updates) {
        if (typeof window.updateRelationship === 'function') {
            return window.updateRelationship(relId, updates);
        }
        return null;
    }

    function _endRelationship(relId, endYear, reason) {
        if (typeof window.endRelationship === 'function') {
            return window.endRelationship(relId, endYear, reason);
        }
        return false;
    }

    // =========================================================================
    // 3. CONSTANTS
    // =========================================================================

    var ARCHETYPES = window.RELATIONSHIP_ARCHETYPES || {};
    var STATUS = window.RELATIONSHIP_STATUS || { ONGOING: 'ongoing' };

    // =========================================================================
    // 4. FRIENDSHIP CREATION
    // =========================================================================

    function createFriendship(charAId, charBId, options) {
        options = options || {};
        var startYear = options.startYear || _getCurrentYear();
        var strength = options.strength !== undefined ? Math.min(100, Math.max(0, options.strength)) : 50;

        var existing = _getRelationshipBetween(charAId, charBId);
        if (existing && existing.type === ARCHETYPES.FRIENDSHIP) {
            return existing;
        }

        var relationship = _createRelationship(charAId, charBId, {
            type: ARCHETYPES.FRIENDSHIP,
            status: STATUS.ONGOING,
            startYear: startYear,
            metadata: {
                strength: strength,
                events: [{ type: 'became_friends', year: startYear }],
                notes: options.notes || ''
            }
        });

        if (relationship) {
            _logEvent('friendship', 'Friendship Formed',
                (_getCharacterById(charAId)?.name || 'Character') + ' and ' +
                (_getCharacterById(charBId)?.name || 'Character') + ' became friends',
                [_getCharacterById(charAId), _getCharacterById(charBId)]);
        }

        return relationship;
    }

    function createMutualFriendships(characterIds, options) {
        options = options || {};
        var created = 0;

        for (var i = 0; i < characterIds.length; i++) {
            for (var j = i + 1; j < characterIds.length; j++) {
                var result = createFriendship(characterIds[i], characterIds[j], options);
                if (result) created++;
            }
        }

        return created;
    }

    // =========================================================================
    // 5. FRIENDSHIP QUERIES
    // =========================================================================

    function areFriends(charAId, charBId) {
        var relationship = _getRelationshipBetween(charAId, charBId);
        return relationship && relationship.type === ARCHETYPES.FRIENDSHIP &&
               relationship.status === STATUS.ONGOING;
    }

    function getFriends(characterId) {
        var relationships = _getRelationshipsForCharacter(characterId, {
            type: ARCHETYPES.FRIENDSHIP,
            activeOnly: true
        });

        var friends = [];
        for (var i = 0; i < relationships.length; i++) {
            var rel = relationships[i];
            var friendId = rel.participantA === characterId ? rel.participantB : rel.participantA;
            var friend = _getCharacterById(friendId);
            if (friend) {
                friends.push(friend);
            }
        }

        return friends;
    }

    function getFriendsWithDetails(characterId) {
        var relationships = _getRelationshipsForCharacter(characterId, {
            type: ARCHETYPES.FRIENDSHIP,
            activeOnly: true
        });

        var friends = [];
        for (var i = 0; i < relationships.length; i++) {
            var rel = relationships[i];
            var friendId = rel.participantA === characterId ? rel.participantB : rel.participantA;
            var friend = _getCharacterById(friendId);
            if (!friend) continue;

            var metadata = rel.metadata || {};

            friends.push({
                character: friend,
                startYear: rel.startYear,
                strength: metadata.strength || 50,
                events: metadata.events || [],
                notes: metadata.notes || '',
                relationshipId: rel.id
            });
        }

        friends.sort(function(a, b) {
            return (b.strength || 0) - (a.strength || 0);
        });

        return friends;
    }

    function getMutualFriends(charAId, charBId) {
        var mutual = _getMutualConnections(charAId, charBId, { type: ARCHETYPES.FRIENDSHIP });
        var result = [];

        for (var i = 0; i < mutual.length; i++) {
            var item = mutual[i];
            var character = item.character || item;
            if (character && character.id) {
                result.push(character);
            }
        }

        return result;
    }

    function getFriendshipStrength(charAId, charBId) {
        var relationship = _getRelationshipBetween(charAId, charBId);
        if (!relationship || relationship.type !== ARCHETYPES.FRIENDSHIP) {
            return 0;
        }

        var metadata = relationship.metadata || {};
        return metadata.strength || 50;
    }

    // =========================================================================
    // 6. FRIENDSHIP MANAGEMENT
    // =========================================================================

    function increaseFriendshipStrength(charAId, charBId, increase) {
        increase = increase || 5;

        var relationship = _getRelationshipBetween(charAId, charBId);
        if (!relationship || relationship.type !== ARCHETYPES.FRIENDSHIP) {
            return 0;
        }

        var metadata = relationship.metadata || {};
        var currentStrength = metadata.strength || 50;
        var newStrength = Math.min(100, currentStrength + increase);

        _updateRelationship(relationship.id, {
            metadata: {
                ...metadata,
                strength: newStrength
            }
        });

        return newStrength;
    }

    function decreaseFriendshipStrength(charAId, charBId, decrease) {
        decrease = decrease || 10;

        var relationship = _getRelationshipBetween(charAId, charBId);
        if (!relationship || relationship.type !== ARCHETYPES.FRIENDSHIP) {
            return 0;
        }

        var metadata = relationship.metadata || {};
        var currentStrength = metadata.strength || 50;
        var newStrength = Math.max(0, currentStrength - decrease);

        if (newStrength === 0) {
            _endRelationship(relationship.id, _getCurrentYear(), 'Friendship ended');
            return 0;
        }

        _updateRelationship(relationship.id, {
            metadata: {
                ...metadata,
                strength: newStrength
            }
        });

        return newStrength;
    }

    function recordFriendshipEvent(charAId, charBId, event) {
        var relationship = _getRelationshipBetween(charAId, charBId);
        if (!relationship || relationship.type !== ARCHETYPES.FRIENDSHIP) {
            return;
        }

        var metadata = relationship.metadata || {};
        var events = metadata.events || [];

        events.push({
            type: event.type || 'event',
            year: event.year || _getCurrentYear(),
            description: event.description || '',
            impact: event.impact || 0
        });

        _updateRelationship(relationship.id, {
            metadata: {
                ...metadata,
                events: events
            }
        });

        if (event.impact) {
            if (event.impact > 0) {
                increaseFriendshipStrength(charAId, charBId, event.impact);
            } else {
                decreaseFriendshipStrength(charAId, charBId, -event.impact);
            }
        }
    }

    function removeFriendship(charAId, charBId, options) {
        options = options || {};
        var relationship = _getRelationshipBetween(charAId, charBId);

        if (!relationship || relationship.type !== ARCHETYPES.FRIENDSHIP) {
            return false;
        }

        var endYear = options.endYear || _getCurrentYear();
        var reason = options.reason || 'unknown';

        var result = _endRelationship(relationship.id, endYear, reason);

        if (result) {
            _logEvent('friendship', 'Friendship Ended',
                (_getCharacterById(charAId)?.name || 'Character') + ' and ' +
                (_getCharacterById(charBId)?.name || 'Character') + ' are no longer friends',
                [_getCharacterById(charAId), _getCharacterById(charBId)]);
        }

        return result;
    }

    // =========================================================================
    // 7. FRIENDSHIP STATISTICS
    // =========================================================================

    function getFriendshipStats(characterId) {
        var friends = getFriendsWithDetails(characterId);

        var totalStrength = 0;
        var earliestStart = _getCurrentYear();

        for (var i = 0; i < friends.length; i++) {
            var f = friends[i];
            totalStrength += f.strength || 0;
            if (f.startYear && f.startYear < earliestStart) {
                earliestStart = f.startYear;
            }
        }

        return {
            totalFriends: friends.length,
            averageStrength: friends.length > 0 ? Math.round(totalStrength / friends.length) : 0,
            longestFriendship: friends.length > 0 ? earliestStart : null,
            totalStrength: totalStrength
        };
    }

    function getBestFriend(characterId) {
        var friends = getFriendsWithDetails(characterId);

        if (friends.length === 0) return null;

        var best = friends[0];
        for (var i = 1; i < friends.length; i++) {
            if ((friends[i].strength || 0) > (best.strength || 0)) {
                best = friends[i];
            }
        }

        return best.character;
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.FriendshipLogic = {
        createFriendship: createFriendship,
        createMutualFriendships: createMutualFriendships,
        areFriends: areFriends,
        getFriends: getFriends,
        getFriendsWithDetails: getFriendsWithDetails,
        getMutualFriends: getMutualFriends,
        getFriendshipStrength: getFriendshipStrength,
        increaseFriendshipStrength: increaseFriendshipStrength,
        decreaseFriendshipStrength: decreaseFriendshipStrength,
        recordFriendshipEvent: recordFriendshipEvent,
        removeFriendship: removeFriendship,
        getFriendshipStats: getFriendshipStats,
        getBestFriend: getBestFriend
    };

    // Legacy aliases
    window.createFriendship = createFriendship;
    window.createMutualFriendships = createMutualFriendships;
    window.areFriends = areFriends;
    window.getFriends = getFriends;
    window.getFriendsWithDetails = getFriendsWithDetails;
    window.getMutualFriends = getMutualFriends;
    window.getFriendshipStrength = getFriendshipStrength;
    window.increaseFriendshipStrength = increaseFriendshipStrength;
    window.decreaseFriendshipStrength = decreaseFriendshipStrength;
    window.recordFriendshipEvent = recordFriendshipEvent;
    window.removeFriendship = removeFriendship;
    window.getFriendshipStats = getFriendshipStats;
    window.getBestFriend = getBestFriend;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.FriendshipLogic;
    }

})();