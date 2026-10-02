/**
 * friendship-commands.js
 *
 * Mutation and transaction boundary for friendship relationships.
 * Orchestrates queries, rules, and RelationshipCommands.
 */

(function() {
    'use strict';

    var RC = window.RelationshipCommands;
    var RQ = window.RelationshipQueries;
    var FR = window.FriendshipRules;
    var FQ = window.FriendshipQueries;

    var A = window.RELATIONSHIP_ARCHETYPES;
    var STATUS = window.RELATIONSHIP_STATUS;

    if (!RC || !RQ || !FR || !FQ || !A || !STATUS) {
        throw new Error('friendship-commands.js: relationship-* and friendship-rules/queries must load first');
    }

    // -------------------------------------------------------------------------
    // DEPENDENCY WRAPPERS (fail loud)
    // -------------------------------------------------------------------------

    function _characterExists(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('friendship-commands.js: getCharacterById required');
        }
        return !!window.getCharacterById(id);
    }

    function _getCharacterName(id) {
        var c = window.getCharacterById(id);
        return c ? c.name : id;
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error('friendship-commands.js: getCurrentYearSafe required');
        }
        return window.getCurrentYearSafe();
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    function _commit() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    function _fail(code, message) {
        return { success: false, code: code, message: message };
    }

    function _ok(data) {
        return Object.assign({ success: true }, data || {});
    }

    // -------------------------------------------------------------------------
    // INTERNAL: create one friendship without committing
    // Used by public commands and bulk operations.
    // -------------------------------------------------------------------------

    function _createFriendshipInternal(idA, idB, options) {
        var validation = FR.canCreate({
            participantA: idA,
            participantB: idB,
            strength: options.strength
        });
        if (!validation.valid) {
            return _fail('VALIDATION_FAILED', validation.errors.join('; '));
        }

        // Existing active friendship is not an error — return existing.
        var existing = FQ.getActiveFriendshipBetween(idA, idB);
        if (existing) {
            return _ok({
                relationship: existing,
                created: false,
                reason: 'already_friends'
            });
        }

        var strength = options.strength !== undefined
            ? FR.clampStrength(options.strength)
            : FR.STRENGTH_DEFAULT;

        var startYear = options.startYear !== undefined
            ? options.startYear
            : _getCurrentYear();

        var result = RC.create({
            participantA: idA,
            participantB: idB,
            type: A.FRIENDSHIP,
            status: STATUS.ONGOING,
            startYear: startYear,
            metadata: {
                strength: strength,
                events: [{
                    type: FR.EVENT_TYPES.BECAME_FRIENDS,
                    year: startYear,
                    impact: 0,
                    description: null
                }],
                notes: options.notes || ''
            }
        });

        if (!result.success) return result;

        return _ok({ relationship: result.relationship, created: true });
    }

    // -------------------------------------------------------------------------
    // CREATE
    // -------------------------------------------------------------------------

    function createFriendship(idA, idB, options) {
        options = options || {};
        if (!_characterExists(idA) || !_characterExists(idB)) {
            return _fail('MISSING_CHARACTER', 'Character not found');
        }
        if (idA === idB) {
            return _fail('SAME_CHARACTER', 'Cannot befriend oneself');
        }

        var result = _createFriendshipInternal(idA, idB, options);
        if (!result.success) return result;

        if (result.created) {
            _logEvent('friendship', 'Friendship Formed',
                _getCharacterName(idA) + ' and ' + _getCharacterName(idB) +
                ' became friends',
                [window.getCharacterById(idA), window.getCharacterById(idB)]);
            _commit();
        }

        return result;
    }

    /**
     * Creates friendship between every pair in the list.
     * One commit at the end.
     */
    function createMutualFriendships(characterIds, options) {
        options = options || {};
        if (!Array.isArray(characterIds) || characterIds.length < 2) {
            return _fail('INVALID_INPUT', 'At least two characters required');
        }

        // Validate all IDs exist before touching state
        for (var v = 0; v < characterIds.length; v++) {
            if (!_characterExists(characterIds[v])) {
                return _fail('MISSING_CHARACTER', 'Unknown character: ' + characterIds[v]);
            }
        }

        var created = [];
        var skipped = [];
        var failed = [];

        for (var i = 0; i < characterIds.length; i++) {
            for (var j = i + 1; j < characterIds.length; j++) {
                var r = _createFriendshipInternal(characterIds[i], characterIds[j], options);
                if (!r.success) {
                    failed.push({ a: characterIds[i], b: characterIds[j], code: r.code });
                } else if (r.created) {
                    created.push({
                        relationshipId: r.relationship.id,
                        a: characterIds[i],
                        b: characterIds[j]
                    });
                } else {
                    skipped.push({ a: characterIds[i], b: characterIds[j] });
                }
            }
        }

        if (created.length > 0) {
            _logEvent('friendship', 'Friendships Formed',
                created.length + ' friendship pair(s) created',
                characterIds.map(function(id) { return window.getCharacterById(id); }));
            _commit();
        }

        return _ok({
            created: created,
            skipped: skipped,
            failed: failed,
            createdCount: created.length,
            skippedCount: skipped.length,
            failedCount: failed.length
        });
    }

    // -------------------------------------------------------------------------
    // STRENGTH CHANGE
    // -------------------------------------------------------------------------

    function _changeStrength(idA, idB, delta) {
        var rel = FQ.getActiveFriendshipBetween(idA, idB);
        if (!rel) return _fail('NOT_FRIENDS', 'No active friendship');

        var current = (rel.metadata && typeof rel.metadata.strength === 'number')
            ? rel.metadata.strength
            : FR.STRENGTH_DEFAULT;

        var check = FR.canChangeStrength({ currentStrength: current, delta: delta });
        if (!check.valid) {
            return _fail('INVALID_CHANGE', check.errors.join('; '));
        }

        var applied = FR.applyStrengthChange({
            currentStrength: current,
            delta: delta
        });

        if (applied.ended) {
            // Strength reached zero — end the friendship
            var endResult = RC.end(rel.id, _getCurrentYear(), FR.END_REASONS.DRIFTED_APART);
            if (!endResult.success) return endResult;
            return _ok({
                relationship: endResult.relationship,
                previousStrength: current,
                newStrength: FR.STRENGTH_MIN,
                ended: true
            });
        }

        var update = RC.update(rel.id, {
            metadata: { strength: applied.newStrength }
        });
        if (!update.success) return update;

        return _ok({
            relationship: update.relationship,
            previousStrength: current,
            newStrength: applied.newStrength,
            ended: false
        });
    }

    function increaseFriendshipStrength(idA, idB, amount) {
        var delta = amount !== undefined ? amount : FR.INCREASE_DEFAULT;
        var result = _changeStrength(idA, idB, Math.abs(delta));
        if (result.success) _commit();
        return result;
    }

    function decreaseFriendshipStrength(idA, idB, amount) {
        var delta = amount !== undefined ? amount : FR.DECREASE_DEFAULT;
        var result = _changeStrength(idA, idB, -Math.abs(delta));
        if (result.success) _commit();
        return result;
    }

    // -------------------------------------------------------------------------
    // EVENTS
    // -------------------------------------------------------------------------

    function recordFriendshipEvent(idA, idB, event) {
        event = event || {};
        var rel = FQ.getActiveFriendshipBetween(idA, idB);
        if (!rel) return _fail('NOT_FRIENDS', 'No active friendship');

        var check = FR.canRecordEvent({
            type: event.type,
            impact: event.impact,
            year: event.year
        });
        if (!check.valid) return _fail('INVALID_EVENT', check.errors.join('; '));

        var currentEvents = (rel.metadata && Array.isArray(rel.metadata.events))
            ? rel.metadata.events.slice()
            : [];

        var year = event.year !== undefined ? event.year : _getCurrentYear();
        var impact = (typeof event.impact === 'number' && !isNaN(event.impact))
            ? event.impact
            : 0;

        currentEvents.push({
            type: event.type,
            year: year,
            impact: impact,
            description: event.description || null
        });

        // Single atomic mutation: append event AND apply impact together
        var currentStrength = (rel.metadata && typeof rel.metadata.strength === 'number')
            ? rel.metadata.strength
            : FR.STRENGTH_DEFAULT;

        var applied = FR.applyEventImpact({
            currentStrength: currentStrength,
            impact: impact
        });

        if (applied.ended) {
            // Record event first, then end
            RC.update(rel.id, {
                metadata: { events: currentEvents, strength: FR.STRENGTH_MIN }
            });
            var endResult = RC.end(rel.id, year, FR.END_REASONS.DRIFTED_APART);
            if (!endResult.success) return endResult;
            _commit();
            return _ok({
                relationship: endResult.relationship,
                eventRecorded: true,
                strength: FR.STRENGTH_MIN,
                ended: true
            });
        }

        var update = RC.update(rel.id, {
            metadata: { events: currentEvents, strength: applied.newStrength }
        });
        if (!update.success) return update;

        _commit();
        return _ok({
            relationship: update.relationship,
            eventRecorded: true,
            strength: applied.newStrength,
            ended: false
        });
    }

    // -------------------------------------------------------------------------
    // REMOVE
    // -------------------------------------------------------------------------

    function removeFriendship(idA, idB, options) {
        options = options || {};
        var rel = FQ.getActiveFriendshipBetween(idA, idB);
        if (!rel) return _fail('NOT_FRIENDS', 'No active friendship');

        var endYear = options.endYear !== undefined
            ? options.endYear
            : _getCurrentYear();
        var reason = options.reason || FR.END_REASONS.UNKNOWN;

        var check = FR.canRemove({
            status: rel.status,
            startYear: rel.startYear,
            endYear: endYear
        });
        if (!check.valid) return _fail('INVALID_REMOVE', check.errors.join('; '));

        var result = RC.end(rel.id, endYear, reason);
        if (!result.success) return result;

        _logEvent('friendship', 'Friendship Ended',
            _getCharacterName(idA) + ' and ' + _getCharacterName(idB) +
            ' are no longer friends (' + reason + ')',
            [window.getCharacterById(idA), window.getCharacterById(idB)]);

        _commit();
        return _ok({ relationship: result.relationship });
    }

    // -------------------------------------------------------------------------

    window.FriendshipCommands = {
        createFriendship: createFriendship,
        createMutualFriendships: createMutualFriendships,
        increaseFriendshipStrength: increaseFriendshipStrength,
        decreaseFriendshipStrength: decreaseFriendshipStrength,
        recordFriendshipEvent: recordFriendshipEvent,
        removeFriendship: removeFriendship
    };

})();
