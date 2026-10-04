/**
 * friendship-commands.js
 *
 * Mutation boundary for friendship relationships.
 *
 * Owns:
 *   - creating friendships (single and mutual)
 *   - changing strength (increase / decrease)
 *   - recording friendship events (append + apply impact)
 *   - ending friendships
 *   - one commit per logical operation
 *
 * Depends on:
 *   - FriendshipRules for policy
 *   - FriendshipQueries for existence checks
 *   - RelationshipCommands for the actual state write
 *   - CharacterQueries / getCharacterById for name resolution on log
 *
 * Does NOT own:
 *   - direct state access (goes through RelationshipCommands)
 *   - persistence (markDataDirty happens in RelationshipState)
 *   - randomness (no rolls here; strength changes are explicit)
 *
 * Every command returns { success: true, ... } or
 * { success: false, code, message }. Never throws for domain errors.
 *
 * Load order: after relationship-commands.js, friendship-rules.js,
 * friendship-queries.js.
 */

(function() {
    'use strict';

    var RC = window.RelationshipCommands;
    var FR = window.FriendshipRules;
    var FQ = window.FriendshipQueries;

    var A = window.RELATIONSHIP_ARCHETYPES;
    var STATUS = window.RELATIONSHIP_STATUS;

    if (!RC || !FR || !FQ || !A || !STATUS) {
        throw new Error('friendship-commands.js: relationship-commands.js, friendship-rules.js, friendship-queries.js must load first');
    }

    var FRIENDSHIP = A.FRIENDSHIP;

    // -------------------------------------------------------------------------
    // DEPENDENCY WRAPPERS (fail loud, no fallbacks)
    // -------------------------------------------------------------------------

    function _getCharacter(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('friendship-commands.js: getCharacterById required');
        }
        return window.getCharacterById(id);
    }

    function _characterExists(id) {
        return !!_getCharacter(id);
    }

    function _getCharacterName(id) {
        var c = _getCharacter(id);
        return c && typeof c.name === 'string' ? c.name : id;
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

    // -------------------------------------------------------------------------
    // RESULT HELPERS
    // -------------------------------------------------------------------------

    function _fail(code, message) {
        return { success: false, code: code, message: message };
    }

    function _ok(data) {
        return Object.assign({ success: true }, data || {});
    }

    // -------------------------------------------------------------------------
    // INTERNAL: CREATE WITHOUT COMMIT
    //
    // Used by createFriendship and createMutualFriendships. Does not
    // call markDataDirty or logEvent; the public callers do.
    //
    // Returns { success, relationship?, created, reason? }.
    // -------------------------------------------------------------------------

    function _createFriendshipInternal(idA, idB, options) {
        var validation = FR.canCreate({
            participantA: idA,
            participantB: idB,
            strength: options.strength,
            startYear: options.startYear
        });
        if (!validation.valid) {
            return _fail('VALIDATION_FAILED', validation.errors.join('; '));
        }

        // Already friends (active)? Return the existing record; idempotent.
        var existing = FQ.getActiveFriendshipBetween(idA, idB);
        if (existing) {
            return _ok({
                relationship: existing,
                created: false,
                reason: 'already_friends'
            });
        }

        var startYear = options.startYear !== undefined
            ? options.startYear
            : _getCurrentYear();

        var metadata = FR.buildInitialMetadata({
            startYear: startYear,
            strength: options.strength,
            notes: options.notes
        });

        var result = RC.create({
            participantA: idA,
            participantB: idB,
            type: FRIENDSHIP,
            status: STATUS.ONGOING,
            startYear: startYear,
            attributes: [],
            metadata: metadata
        });

        if (!result.success) return result;

        return _ok({
            relationship: FQ.getActiveFriendshipBetween(idA, idB),
            created: true
        });
    }

    // -------------------------------------------------------------------------
    // CREATE FRIENDSHIP
    // -------------------------------------------------------------------------

    /**
     * options: { startYear?, strength?, notes? }
     */
    function createFriendship(idA, idB, options) {
        options = options || {};

        if (typeof idA !== 'string' || typeof idB !== 'string') {
            return _fail('MISSING_ID', 'both character ids required');
        }
        if (idA === idB) {
            return _fail('SAME_CHARACTER', 'cannot befriend oneself');
        }
        if (!_characterExists(idA) || !_characterExists(idB)) {
            return _fail('MISSING_CHARACTER', 'character not found');
        }

        var result = _createFriendshipInternal(idA, idB, options);
        if (!result.success) return result;

        if (result.created) {
            _logEvent('friendship', 'Friendship Formed',
                _getCharacterName(idA) + ' and ' + _getCharacterName(idB) +
                ' became friends',
                [_getCharacter(idA), _getCharacter(idB)]);
        }

        return result;
    }

    // -------------------------------------------------------------------------
    // CREATE MUTUAL FRIENDSHIPS
    //
    // Creates a friendship between every unordered pair in characterIds.
    // Skips existing pairs. Validates all ids before writing.
    // One logical operation; underlying RC.create commits per record
    // through the state batch mechanism.
    // -------------------------------------------------------------------------

    /**
     * options: { startYear?, strength?, notes? }
     */
    function createMutualFriendships(characterIds, options) {
        options = options || {};

        if (!Array.isArray(characterIds) || characterIds.length < 2) {
            return _fail('INVALID_INPUT', 'at least two character ids required');
        }

        for (var v = 0; v < characterIds.length; v++) {
            if (typeof characterIds[v] !== 'string' || characterIds[v].length === 0) {
                return _fail('INVALID_INPUT', 'character id at index ' + v + ' is invalid');
            }
            if (!_characterExists(characterIds[v])) {
                return _fail('MISSING_CHARACTER', 'unknown character: ' + characterIds[v]);
            }
        }

        var created = [];
        var skipped = [];
        var failed = [];

        for (var i = 0; i < characterIds.length; i++) {
            for (var j = i + 1; j < characterIds.length; j++) {
                var r = _createFriendshipInternal(characterIds[i], characterIds[j], options);
                if (!r.success) {
                    failed.push({
                        a: characterIds[i],
                        b: characterIds[j],
                        code: r.code,
                        message: r.message
                    });
                } else if (r.created) {
                    created.push({
                        relationshipId: r.relationship.relationshipId,
                        a: characterIds[i],
                        b: characterIds[j]
                    });
                } else {
                    skipped.push({
                        a: characterIds[i],
                        b: characterIds[j],
                        reason: r.reason || 'already_friends'
                    });
                }
            }
        }

        if (created.length > 0) {
            _logEvent('friendship', 'Friendships Formed',
                created.length + ' friendship pair(s) created',
                characterIds.map(_getCharacter));
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
    //
    // Internal helper. Applies a signed delta. If the new strength reaches
    // the end threshold, ends the friendship with reason 'drifted_apart'.
    // -------------------------------------------------------------------------

    function _changeStrength(idA, idB, delta) {
        var rel = FQ.getActiveFriendshipBetween(idA, idB);
        if (!rel) return _fail('NOT_FRIENDS', 'no active friendship');

        var current = rel.strength;
        if (typeof current !== 'number') {
            current = FR.STRENGTH_DEFAULT;
        }

        var check = FR.canChangeStrength({
            currentStrength: current,
            delta: delta
        });
        if (!check.valid) {
            return _fail('INVALID_CHANGE', check.errors.join('; '));
        }

        var applied = FR.applyStrengthChange({
            currentStrength: current,
            delta: delta
        });

        if (applied.ended) {
            // Record final strength, then end. Two state updates in one
            // logical operation; the second is the terminal one.
            RC.update(rel.relationshipId, {
                metadata: { strength: FR.STRENGTH_MIN }
            });
            var endResult = RC.end(
                rel.relationshipId,
                _getCurrentYear(),
                FR.END_REASONS.DRIFTED_APART
            );
            if (!endResult.success) return endResult;

            return _ok({
                relationship: FQ.getLatestFriendshipBetween(idA, idB),
                previousStrength: current,
                newStrength: FR.STRENGTH_MIN,
                ended: true
            });
        }

        var updateResult = RC.update(rel.relationshipId, {
            metadata: { strength: applied.newStrength }
        });
        if (!updateResult.success) return updateResult;

        return _ok({
            relationship: FQ.getActiveFriendshipBetween(idA, idB),
            previousStrength: current,
            newStrength: applied.newStrength,
            ended: false
        });
    }

    function increaseFriendshipStrength(idA, idB, amount) {
        if (typeof idA !== 'string' || typeof idB !== 'string') {
            return _fail('MISSING_ID', 'both character ids required');
        }
        var delta = (typeof amount === 'number' && !isNaN(amount))
            ? Math.abs(amount)
            : FR.INCREASE_DEFAULT;
        return _changeStrength(idA, idB, delta);
    }

    function decreaseFriendshipStrength(idA, idB, amount) {
        if (typeof idA !== 'string' || typeof idB !== 'string') {
            return _fail('MISSING_ID', 'both character ids required');
        }
        var delta = (typeof amount === 'number' && !isNaN(amount))
            ? -Math.abs(amount)
            : -FR.DECREASE_DEFAULT;
        return _changeStrength(idA, idB, delta);
    }

    // -------------------------------------------------------------------------
    // RECORD EVENT
    //
    // Appends the event to the friendship's bounded event array and
    // applies its impact to strength, in one metadata update. If the
    // resulting strength reaches the end threshold, ends the friendship
    // in the same operation.
    // -------------------------------------------------------------------------

    /**
     * event: { type, year?, impact?, description? }
     */
    function recordFriendshipEvent(idA, idB, event) {
        if (typeof idA !== 'string' || typeof idB !== 'string') {
            return _fail('MISSING_ID', 'both character ids required');
        }
        if (!event || typeof event !== 'object') {
            return _fail('MISSING_EVENT', 'event object required');
        }

        var rel = FQ.getActiveFriendshipBetween(idA, idB);
        if (!rel) return _fail('NOT_FRIENDS', 'no active friendship');

        var check = FR.canRecordEvent({
            type: event.type,
            impact: event.impact,
            year: event.year
        });
        if (!check.valid) {
            return _fail('INVALID_EVENT', check.errors.join('; '));
        }

        var year = event.year !== undefined ? event.year : _getCurrentYear();
        var impact = (typeof event.impact === 'number' && !isNaN(event.impact))
            ? event.impact
            : 0;

        var currentEvents = FQ.getFriendshipEvents(rel.relationshipId);
        currentEvents.push({
            type: event.type,
            year: year,
            impact: impact,
            description: typeof event.description === 'string' ? event.description : null
        });
        currentEvents = FR.boundEventHistory(currentEvents);

        var currentStrength = typeof rel.strength === 'number'
            ? rel.strength
            : FR.STRENGTH_DEFAULT;

        var applied = FR.applyEventImpact({
            currentStrength: currentStrength,
            impact: impact
        });

        if (applied.ended) {
            RC.update(rel.relationshipId, {
                metadata: {
                    events: currentEvents,
                    strength: FR.STRENGTH_MIN
                }
            });
            var endResult = RC.end(
                rel.relationshipId,
                year,
                FR.END_REASONS.DRIFTED_APART
            );
            if (!endResult.success) return endResult;

            return _ok({
                relationship: FQ.getLatestFriendshipBetween(idA, idB),
                eventRecorded: true,
                previousStrength: currentStrength,
                strength: FR.STRENGTH_MIN,
                ended: true
            });
        }

        var updateResult = RC.update(rel.relationshipId, {
            metadata: {
                events: currentEvents,
                strength: applied.newStrength
            }
        });
        if (!updateResult.success) return updateResult;

        return _ok({
            relationship: FQ.getActiveFriendshipBetween(idA, idB),
            eventRecorded: true,
            previousStrength: currentStrength,
            strength: applied.newStrength,
            ended: false
        });
    }

    // -------------------------------------------------------------------------
    // REMOVE FRIENDSHIP
    //
    // Ends the active friendship. Uses the standard end path with the
    // caller's endYear and reason. Once ended, the record is historical;
    // a new friendship is a new record.
    // -------------------------------------------------------------------------

    /**
     * options: { endYear?, reason? }
     */
    function removeFriendship(idA, idB, options) {
        options = options || {};

        if (typeof idA !== 'string' || typeof idB !== 'string') {
            return _fail('MISSING_ID', 'both character ids required');
        }

        var rel = FQ.getActiveFriendshipBetween(idA, idB);
        if (!rel) return _fail('NOT_FRIENDS', 'no active friendship');

        var endYear = options.endYear !== undefined
            ? options.endYear
            : _getCurrentYear();

        var reason = options.reason !== undefined && options.reason !== null
            ? options.reason
            : FR.END_REASONS.UNKNOWN;

        var check = FR.canRemove({
            status: rel.status,
            startYear: rel.startYear,
            endYear: endYear
        });
        if (!check.valid) {
            return _fail('INVALID_REMOVE', check.errors.join('; '));
        }

        var result = RC.end(rel.relationshipId, endYear, reason);
        if (!result.success) return result;

        _logEvent('friendship', 'Friendship Ended',
            _getCharacterName(idA) + ' and ' + _getCharacterName(idB) +
            ' are no longer friends (' + reason + ')',
            [_getCharacter(idA), _getCharacter(idB)]);

        return _ok({
            relationship: FQ.getLatestFriendshipBetween(idA, idB)
        });
    }

    // -------------------------------------------------------------------------
    // EXPORTS
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
