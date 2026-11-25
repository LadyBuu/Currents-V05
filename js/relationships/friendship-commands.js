/**
 * =============================================================================
 * STILL WATERS - FRIENDSHIP COMMANDS (friendship-commands.js)
 * =============================================================================
 *
 * LOCATION: js/relationships/friendship-commands.js
 *
 * Mutation boundary for friendship relationships.
 *
 * Owns:
 *   - creating friendships (single and mutual)
 *   - changing strength (increase / decrease)
 *   - recording friendship events (append + apply impact)
 *   - ending friendships
 *   - updating an existing friendship's strength, notes, and start year
 *     (updateFriendship — added in this revision; see below)
 *
 * COMMIT SEMANTICS
 *
 *   createFriendship                 one commit (single RC.create)
 *   createMutualFriendships          one commit (single RC.createBatch)
 *   increaseFriendshipStrength       one commit (single RC.update)
   decreaseFriendshipStrength       one commit (single RC.update)
   recordFriendshipEvent            one commit (single RC.update)
   updateFriendship                 one commit (single RC.update)
 *   removeFriendship                 one commit (single RC.end)
 *
 *   When a strength change or event ends a friendship, the command
   writes final metadata, endYear, end status, and endReason in one
   RelationshipCommands.update call. This avoids an intermediate
   strength-zero but still-active record and ensures event history
   cannot be lost independently of the ending transition.
 *
 * UPDATEFRIENDSHIP
 *
 *   Added in this revision. UI callers (modals-friendship.js) dispatch
 *   through this method instead of calling RelationshipCommands.update
 *   directly. The command validates strength against
 *   FriendshipRules.isValidStrength, clamps via clampStrength, merges
 *   the strength and notes into metadata (shallow, matching the rest
 *   of the domain), and delegates to RelationshipCommands.update.
 *
 *   The method is not in relationships-bootstrap.js's
 *   REQUIRED_METHODS.FriendshipCommands, so its absence was never a
 *   load-time failure. Its presence is now the canonical dispatch path
 *   for edits.
 *
 * Depends on:
 *   - FriendshipRules for policy
 *   - FriendshipQueries for existence checks
 *   - RelationshipCommands for the actual state write(s),
 *     including RelationshipCommands.createBatch for atomic
 *     multi-record insertion
 *   - CharacterQueries / getCharacterById for name resolution on log
 *   - ids.js (generateId) for record ids when batching
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
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - _getCurrentYear: replaced getCurrentYearSafe (stale alias) with
 *       getCurrentYear. Same fix as relationship-finder-queries.js and
 *       romance-commands.js; the deprecated alias is not present on
 *       every build and would have thrown on the first call to any
 *       command that needs a year.
 *     - updateFriendship added. Validates strength against
 *       FriendshipRules.isValidStrength, clamps via clampStrength,
 *       shallow-merges metadata, delegates to RC.update. One commit.
 *       Callers (modals-friendship.js) can now dispatch edits through
 *       this method instead of calling RelationshipCommands.update
 *       directly, restoring the mutation boundary the rest of the file
 *       already follows.
 *     - Header gained UPDATEFRIENDSHIP section.
 *   Earlier revisions: see the COMMIT SEMANTICS table and the
 *   two-commit rationale above.
 * =============================================================================
 */

(function() {
    'use strict';

    var RC = window.RelationshipCommands;
    var FR = window.FriendshipRules;
    var FQ = window.FriendshipQueries;

    var A = window.RELATIONSHIP_ARCHETYPES;
    var STATUS = window.RELATIONSHIP_STATUS;

    if (!RC || !FR || !FQ || !A || !STATUS) {
        throw new Error(
            'friendship-commands.js: relationship-commands.js, ' +
            'friendship-rules.js, friendship-queries.js must load first'
        );
    }

    if (typeof RC.createBatch !== 'function') {
        throw new Error(
            'friendship-commands.js: RelationshipCommands.createBatch ' +
            'is required (relationship-commands.js must expose the ' +
            'batch create primitive).'
        );
    }

    var FRIENDSHIP = A.FRIENDSHIP;

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS (fail loud, no fallbacks)
    // =========================================================================

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

    /**
     * Current year. time.js exports getCurrentYear (not the deprecated
     * getCurrentYearSafe alias, which is not present on every build).
     * Same fix as relationship-finder-queries.js and romance-commands.js.
     */
    function _getCurrentYear() {
        if (typeof window.getCurrentYear !== 'function') {
            throw new Error('friendship-commands.js: getCurrentYear required');
        }
        return window.getCurrentYear();
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    function _generateId() {
        if (typeof window.generateId !== 'function') {
            throw new Error('friendship-commands.js: generateId required');
        }
        return window.generateId('rel');
    }

    // =========================================================================
    // 2. RESULT HELPERS
    // =========================================================================

    function _fail(code, message) {
        return { success: false, code: code, message: message };
    }

    function _ok(data) {
        return Object.assign({ success: true }, data || {});
    }

    // =========================================================================
    // 3. INTERNAL: PREPARE ONE FRIENDSHIP RECORD
    //
    // Validates a pair and, if valid, returns the fully-formed record
    // (with id and timestamps) that would be passed to
    // RelationshipCommands.create or .createBatch. Does NOT commit.
    //
    // Returns one of:
    //   { kind: 'ok',      record: {...} }
    //   { kind: 'skipped', reason: 'already_friends' }
    //   { kind: 'failed',  code, message }
    // =========================================================================

    function _prepareFriendshipRecord(idA, idB, options) {
        var validation = FR.canCreate({
            participantA: idA,
            participantB: idB,
            strength: options.strength,
            startYear: options.startYear
        });
        if (!validation.valid) {
            return {
                kind: 'failed',
                code: 'VALIDATION_FAILED',
                message: validation.errors.join('; ')
            };
        }

        var existing = FQ.getActiveFriendshipBetween(idA, idB);
        if (existing) {
            return { kind: 'skipped', reason: 'already_friends' };
        }

        var startYear = options.startYear !== undefined
            ? options.startYear
            : _getCurrentYear();

        var metadata = FR.buildInitialMetadata({
            startYear: startYear,
            strength: options.strength,
            notes: options.notes
        });

        var now = Date.now();
        return {
            kind: 'ok',
            record: {
                id: _generateId(),
                type: FRIENDSHIP,
                status: STATUS.ONGOING,
                participantA: idA,
                participantB: idB,
                startYear: startYear,
                endYear: null,
                attributes: [],
                metadata: metadata,
                createdAt: now,
                updatedAt: now
            }
        };
    }

    // =========================================================================
    // 4. CREATE FRIENDSHIP (single)
    //
    // One commit (via RC.create).
    // =========================================================================

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

        var prepared = _prepareFriendshipRecord(idA, idB, options);
        if (prepared.kind === 'failed') {
            return _fail(prepared.code, prepared.message);
        }
        if (prepared.kind === 'skipped') {
            var existing = FQ.getActiveFriendshipBetween(idA, idB);
            return _ok({
                relationship: existing,
                created: false,
                reason: prepared.reason
            });
        }

        var createResult = RC.create(prepared.record);
        if (!createResult.success) return createResult;

        _logEvent('friendship', 'Friendship Formed',
            _getCharacterName(idA) + ' and ' + _getCharacterName(idB) +
            ' became friends',
            [_getCharacter(idA), _getCharacter(idB)]);

        return _ok({
            relationship: FQ.getActiveFriendshipBetween(idA, idB),
            created: true
        });
    }

    // =========================================================================
    // 5. CREATE MUTUAL FRIENDSHIPS (batch)
    //
    // Creates a friendship between every unordered pair in characterIds.
    // Skips existing pairs. Validates all ids before writing.
    //
    // COMMIT SEMANTICS: this is one commit. All new friendship records
    // are prepared first, then a single RC.createBatch commits them all
    // in one State batch (one markDataDirty, one notification).
    //
    // If any pair fails preparation (invalid pair, missing character,
    // bad options), NO records are inserted. Skipped pairs (already
    // friends) do not block the operation; they are reported separately.
    //
    // If State-level validation rejects the batch (structurally invalid
    // record, duplicate id), NO records are inserted — the batch is
    // all-or-nothing.
    //
    // The all-or-nothing failure path returns _ok with committed: false
    // and a populated failed[] array. Callers MUST check both `success`
    // and `committed` (or `failedCount > 0`) to surface failures to the
    // user; the modal does this — see modals-friendship.js's
    // openFriendshipModal onConfirm.
    //
    // options: { startYear?, strength?, notes? }
    // =========================================================================

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

        // Phase 1: prepare every record. No commits yet.
        var preparedRecords = [];
        var preparedPairs = [];
        var skipped = [];
        var failed = [];

        for (var i = 0; i < characterIds.length; i++) {
            for (var j = i + 1; j < characterIds.length; j++) {
                var prep = _prepareFriendshipRecord(
                    characterIds[i],
                    characterIds[j],
                    options
                );

                if (prep.kind === 'failed') {
                    failed.push({
                        a: characterIds[i],
                        b: characterIds[j],
                        code: prep.code,
                        message: prep.message
                    });
                    continue;
                }
                if (prep.kind === 'skipped') {
                    skipped.push({
                        a: characterIds[i],
                        b: characterIds[j],
                        reason: prep.reason
                    });
                    continue;
                }

                preparedRecords.push(prep.record);
                preparedPairs.push({ a: characterIds[i], b: characterIds[j] });
            }
        }

        // If any pair failed preparation, refuse the whole operation.
        // Nothing has been committed yet.
        if (failed.length > 0) {
            return _ok({
                created: [],
                skipped: skipped,
                failed: failed,
                createdCount: 0,
                skippedCount: skipped.length,
                failedCount: failed.length,
                committed: false
            });
        }

        // Nothing to create — all pairs were already friends (or the
        // input was a single character, which the guard above rejects).
        if (preparedRecords.length === 0) {
            return _ok({
                created: [],
                skipped: skipped,
                failed: [],
                createdCount: 0,
                skippedCount: skipped.length,
                failedCount: 0,
                committed: true
            });
        }

        // Phase 2: batch commit. All-or-nothing at the State level.
        var batchResult = RC.createBatch(preparedRecords);
        if (!batchResult.success) {
            return _fail(
                batchResult.code || 'BATCH_REJECTED',
                batchResult.message || 'batch insert rejected by state'
            );
        }

        // Reshape: report created pairs alongside their relationship ids.
        // The inserted ids come back in the same order as preparedRecords,
        // which is the same order as preparedPairs.
        var created = [];
        for (var k = 0; k < preparedPairs.length; k++) {
            created.push({
                relationshipId: batchResult.inserted[k],
                a: preparedPairs[k].a,
                b: preparedPairs[k].b
            });
        }

        if (created.length > 0) {
            _logEvent('friendship', 'Friendships Formed',
                created.length + ' friendship pair(s) created',
                characterIds.map(_getCharacter));
        }

        return _ok({
            created: created,
            skipped: skipped,
            failed: [],
            createdCount: created.length,
            skippedCount: skipped.length,
            failedCount: 0,
            committed: true
        });
    }

    // =========================================================================
    // 6. STRENGTH CHANGE
    //
    // Internal helper. Applies a signed delta. If the new strength reaches
    // the end threshold, ends the friendship with reason 'drifted_apart'.
    //
    // See COMMIT SEMANTICS in the module header for the two-commit
    // rationale when the strength change ends the friendship.
    // =========================================================================

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
            // Strength, end status, end year, and reason are one state update.
            var endYear = _getCurrentYear();
            var endResult = RC.update(rel.relationshipId, {
                status: STATUS.ENDED,
                endYear: endYear,
                metadata: {
                    strength: FR.STRENGTH_MIN,
                    endReason: FR.END_REASONS.DRIFTED_APART
                }
            });
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

    // =========================================================================
    // 7. RECORD EVENT
    //
    // Appends the event to the friendship's bounded event array and
    // applies its impact to strength, in one metadata update. If the
    // resulting strength reaches the end threshold, ends the friendship
    // in the same operation.
    //
    // See COMMIT SEMANTICS in the module header for the two-commit
    // rationale when the event ends the friendship.
    // =========================================================================

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
            description: typeof event.description === 'string'
                ? event.description
                : null
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
            // Event history, strength, end status, year, and reason are one state update.
            var endResult = RC.update(rel.relationshipId, {
                status: STATUS.ENDED,
                endYear: year,
                metadata: {
                    events: currentEvents,
                    strength: FR.STRENGTH_MIN,
                    endReason: FR.END_REASONS.DRIFTED_APART
                }
            });
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

    // =========================================================================
    // 8. UPDATE FRIENDSHIP
    //
    // Edits the strength, notes, and start year of an active friendship.
    // This is the canonical dispatch path for edits (modals-friendship.js
    // calls this instead of RelationshipCommands.update directly).
    //
    // Strength is validated against FriendshipRules.isValidStrength and
    // clamped via clampStrength. Metadata is a shallow merge, matching
    // the rest of the domain. startYear is passed through to RC.update
    // unchanged (RC.update applies the endYear >= startYear check).
    //
    // One commit (single RC.update).
    //
    // patch: {
    //   strength?,   number   — clamped via FR.clampStrength
    //   notes?,      string   — merged into metadata.notes
    //   startYear?   number   — passed to RC.update as startYear
    // }
    // =========================================================================

    /**
     * updateFriendship(idA, idB, patch)
     *
     * Returns { success: true, relationship } on success.
     * Returns { success: false, code, message } on any domain error.
     */
    function updateFriendship(idA, idB, patch) {
        if (typeof idA !== 'string' || typeof idB !== 'string') {
            return _fail('MISSING_ID', 'both character ids required');
        }
        if (!patch || typeof patch !== 'object') {
            return _fail('MISSING_PATCH', 'patch object required');
        }

        var rel = FQ.getActiveFriendshipBetween(idA, idB);
        if (!rel) return _fail('NOT_FRIENDS', 'no active friendship');

        var rcPatch = {};

        if (patch.strength !== undefined) {
            if (typeof patch.strength !== 'number' ||
                !FR.isValidStrength(patch.strength)) {
                return _fail(
                    'INVALID_STRENGTH',
                    'strength must be a number in [' +
                    FR.STRENGTH_MIN + ', ' + FR.STRENGTH_MAX + ']'
                );
            }
            // Shallow-merge strength into metadata, matching the rest
            // of the domain (metadata is authoritative for friendship
            // strength, not a top-level field).
            rcPatch.metadata = { strength: FR.clampStrength(patch.strength) };
        }

        if (patch.notes !== undefined) {
            if (typeof patch.notes !== 'string') {
                return _fail('INVALID_NOTES', 'notes must be a string');
            }
            rcPatch.metadata = Object.assign(
                {},
                rcPatch.metadata || {},
                { notes: patch.notes }
            );
        }

        if (patch.startYear !== undefined) {
            if (typeof patch.startYear !== 'number' ||
                isNaN(patch.startYear)) {
                return _fail('INVALID_START_YEAR', 'startYear must be a number');
            }
            rcPatch.startYear = patch.startYear;
        }

        var result = RC.update(rel.relationshipId, rcPatch);
        if (!result.success) return result;

        return _ok({
            relationship: FQ.getActiveFriendshipBetween(idA, idB)
        });
    }

    // =========================================================================
    // 9. REMOVE FRIENDSHIP
    //
    // Ends the active friendship. Uses the standard end path with the
    // caller's endYear and reason. Once ended, the record is historical;
    // a new friendship is a new record.
    //
    // One commit.
    // =========================================================================

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

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.FriendshipCommands = {
        createFriendship: createFriendship,
        createMutualFriendships: createMutualFriendships,
        increaseFriendshipStrength: increaseFriendshipStrength,
        decreaseFriendshipStrength: decreaseFriendshipStrength,
        recordFriendshipEvent: recordFriendshipEvent,
        updateFriendship: updateFriendship,
        removeFriendship: removeFriendship
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.FriendshipCommands;
    }

})();
