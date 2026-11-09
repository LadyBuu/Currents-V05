// js/households/household-commands.js
/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD COMMANDS (js/households/household-commands.js)
 * =============================================================================
 *
 * LOCATION: js/households/household-commands.js
 *
 * PURPOSE
 * -------
 * Canonical mutation API for household data. This module is the SINGLE
 * WRITE BOUNDARY for the household domain.
 *
 * CONVERGED PATTERN
 * -----------------
 *   - Commands mutate canonical records via HouseholdState primitives.
 *   - Every command ends with _commit(eventName, payload).
 *   - _commit does NOT save. It:
 *       hydrateFromMasterData()
 *       markDirty()
 *       invalidateAccessorCaches()      <-- added (C1)
 *       publish(eventName, payload)
 *       dispatch CustomEvent(eventName, payload)
 *   - persist() is the ONLY place that calls saveMasterData().
 *   - Callers (modals, bootstraps, cross-domain orchestrators) call
 *     persist() once per batch.
 *
 * YEAR RESOLUTION
 * ---------------
 *   Every "current year" read in this module goes through
 *   window.getCurrentYear (the canonical function in time.js), NOT
 *   window.getCurrentYearSafe (the deprecated alias). This matches
 *   the household-orchestration.js P3-1 migration: the household
 *   subsystem's eventual removal of getCurrentYearSafe is a one-line
 *   change in household-orchestration.js, and this file never
 *   depended on the alias.
 *
 * RESULT SHAPE
 * ------------
 *   { success: true,  data: ... }
 *   { success: false, code: 'SOME_CODE', reason: 'human message' }
 *
 * DOMAIN OWNERSHIP
 * ----------------
 *   Household-owned fields (writable by this module):
 *     name, locationId, locationName, reputation, wealth, debt,
 *     powerScore, foundedYear, notes, nameHistory, currentNameSince,
 *     eventLog, status, members, departments, enterprises,
 *     enterpriseHistory, residenceId, residenceUnitNumber,
 *     residenceHistory, vacancyHistory, damageHistory, activityLog,
 *     crimeHistory, vendettas, alliances, economy, resources,
 *     staffPositions, staffAssignments
 *
 *   Character-owned fields (NOT writable by this module; this module
 *   reaches them only through CharacterCommands.updateCharacterFields):
 *     character.household      — reverse index
 *     character.householdId    — reverse index
 *     character.householdHistory — membership history
 *
 *   Enterprise ownership   → IndustryCommands (canonical)
 *   Residence occupancy    → ResidenceSystem  (canonical)
 *
 * CROSS-DOMAIN RULES
 * ------------------
 *   - Character reverse index  → CharacterCommands.updateCharacterFields
 *   - Enterprise ownership     → IndustryCommands.updateEnterprise
 *   - Residence occupancy      → ResidenceSystem.assignHouseholdToUnit
 *
 * CHARCOMMANDS INTERACTION
 * ------------------------
 *   Every membership change (add, remove, transfer, update role) makes
 *   two mutations:
 *     1. Update the household record (members array).
 *     2. Update the character's reverse-index fields via
 *        CharacterCommands.updateCharacterFields.
 *   Both are part of one logical operation. Both call _commit (which
 *   notifies subscribers and dispatches CustomEvents). persist() is called
 *   once at the end of the batch.
 *
 * CROSS-DOMAIN PRESENCE CHECKS
 * ----------------------------
 *   ResidenceSystem and IndustryCommands are OPTIONAL dependencies of
 *   this module. They are resolved at CALL time, not load time. Prior
 *   revisions froze presence flags at load:
 *
 *     var _residenceSystemPresent = typeof window.ResidenceSystem !== 'undefined' && ...
 *
 *   That worked only when the module was loaded BEFORE its optional
 *   dependency. The documented load order places residence-system.js
 *   AFTER household-commands.js, so the flag froze to false and every
 *   deleteHousehold call that touched a residence returned
 *   RESIDENCE_SYSTEM_UNAVAILABLE — even though ResidenceSystem was
 *   loaded by the time the command ran. The same fragility applied to
 *   IndustryCommands (currently unused, but the same flag pattern would
 *   break the first time an industry-touching command ships).
 *
 *   The fix: _residenceSystemAvailable() and _industryCommandsAvailable()
 *   are call-time checks. A load-order change (either direction) no
 *   longer affects behavior; only the state of window.ResidenceSystem /
 *   window.IndustryCommands AT THE MOMENT THE COMMAND RUNS matters,
 *   which is the correct semantic for an optional dependency.
 *
 * ACCESSOR CACHE CONTRACT
 * -----------------------
 *   accessors.js maintains an id -> record cache used by getHouseholdById
 *   and family-of accessors. Every mutation of the household collection
 *   must invalidate that cache via window.invalidateAccessorCaches().
 *   Without this, getHouseholdById returns stale records after a household
 *   write, and downstream consumers (industry, settlement, modals) read
 *   the pre-mutation shape.
 *
 *   The invalidation happens at the memory-write boundary (_commit), not
 *   at persistence time, because the cache mirrors canonical memory, not
 *   storage.
 *
 *   This mirrors the identical contract in character-state.js::_emitChange.
 *   Prior to this revision, the household domain did not invalidate the
 *   accessor cache at all — which is why industry-queries._resolveOwnerName
 *   could return a stale household name after a rename.
 *
 * SET HEAD CONTRACT (REVISED)
 * ---------------------------
 *   setHead(householdId, characterId, options):
 *     - If characterId is null: clears the head.
 *     - If characterId is not a member: creates the member record directly
 *       (via _addMemberRecord, which does NOT commit) and then commits
 *       once. This makes setHead a single-commit command regardless of
 *       whether the character was already a member.
 *     - If characterId is already a member: applies the head change and
 *       commits once.
 *
 *   Prior revisions called addMember() from setHead() when the character
 *   wasn't a member, which committed twice (once for addMember's commit,
 *   once for the head change). This produced two events and two state
 *   notifications for what is one logical operation. The current version
 *   makes setHead always one commit.
 *
 * ASSIGN ROLE IF MISSING
 * ----------------------
 *   assignCharacterToPosition and bulkAssign accept
 *   options.addRoleIfMissing. When true and the position requires a role
 *   the character lacks, the command adds the profession to the character
 *   via CharacterCommands.addProfession before assignment.
 *
 *   If the character already has the role, no profession change is made.
 *   The assignment record stores roleIdAtAssignment from the position.
 *
 *   If options.addRoleIfMissing is false or absent, the assignment
 *   proceeds without adding the role. The result indicates the missing
 *   role via a warning field, but the assignment is not refused — the
 *   role-adding is best-effort and the caller decides whether to accept.
 *
 * DELETE HOUSEHOLD CONTRACT
 * -------------------------
 *   deleteHousehold(householdId, options):
 *     - Disassociates any residence occupancy via ResidenceSystem.
 *     - If options.removeFromCharacters !== false (default true), clears
 *       the household reverse index on every member character.
 *     - Removes the household record.
 *     - One commit, one persist (by caller).
 *
 *   This command is used by HouseholdAssignment.createCadetBranch and
 *   splitHousehold rollback paths. It must remain safe to call from
 *   inside an orchestration — it does not call persist(), so the caller
 *   controls the batch boundary.
 *
 * REMOVE CHARACTER REFERENCES
 * ---------------------------
 *   removeCharacterReferences(characterId) is the cross-domain cleanup
 *   hook that character-deletion-commands.js dispatches on hard delete.
 *   It walks every household that contains the character as a member,
 *   removes the member entry, applies head-succession rules if the
 *   character was the head, and writes the character-side reverse index
 *   only if the character still exists (it will not, in the hard-delete
 *   path).
 *
 *   This command does NOT persist. It runs inside the delete-character
 *   orchestration, which persists once. It does NOT commit an event per
 *   household — it accumulates affected household ids and commits a
 *   single 'householdReferencesRemoved' event at the end. That keeps the
 *   event stream coherent and matches the "one logical operation, one
 *   commit" contract.
 *
 *   The command is idempotent: re-running it against a character that
 *   has already been fully cleaned up returns success with
 *   removedCount: 0 and does not commit.
 *
 * CLEAR LOCATION REFERENCES
 * -------------------------
 *   clearLocationReferences(locationId) is the cross-domain cleanup
 *   hook that LocationCommands.deletePlace dispatches when a place is
 *   removed. It walks every household whose locationId points at the
 *   deleted place, sets locationId/locationName to null, and records a
 *   location_history entry on the household so the deletion is
 *   auditable.
 *
 *   This command does NOT persist. It runs inside the delete-place
 *   orchestration, which persists once. It does NOT commit an event per
 *   household — it accumulates affected household ids and commits a
 *   single 'householdsLocationCleared' event at the end. Same pattern as
 *   removeCharacterReferences.
 *
 *   The command is idempotent: re-running it against a location that no
 *   household references returns success with clearedCount: 0 and does
 *   not commit.
 *
 *   Preconditions:
 *     - locationId must be a non-empty string.
 *     - The location may or may not still exist in masterData. This
 *       command does NOT look up the location; it operates on the
 *       households that reference it. That allows deletePlace to call
 *       it AFTER removing the place from canonical data, which is the
 *       natural order (the place is gone, now reconcile references).
 *
 * SILENT VARIANTS (NEW)
 * ---------------------
 *   Two "silent" variants exist for the "correct a mistake" UI path in
 *   modals-household.js. They perform the same in-memory mutation as
 *   their non-silent counterparts, but they skip the corresponding
 *   history write:
 *
 *     updateHouseholdNameSilent(householdId, newName, options)
 *         Same field change as updateHousehold's rename branch, but
 *         does NOT append to household.nameHistory. The household name
 *         IS changed; currentNameSince IS updated. Only the audit trail
 *         entry is skipped.
 *
 *         Use case: user fixes a typo in a name that was just entered.
 *         Recording a "rename from X to Y" entry for a correction the
 *         user immediately caught pollutes the history.
 *
 *     removeMemberSilent(householdId, characterId, options)
 *         Splices the member out of the household. Does NOT:
 *           - close the character's householdHistory entry
 *             (via _clearCharacterMembership), or
 *           - trigger head succession (pickSuccessor + applyHeadChange).
 *
 *         Use case: user adds the wrong character to a household and
 *         immediately removes them. Closing a householdHistory entry
 *         for a membership that was never acknowledged, or discovering
 *         a "successor" for a headship that was never real, would
 *         corrupt the record.
 *
 *   Both silent variants COMMIT (mark dirty, invalidate accessor cache,
 *   publish, dispatch) with a distinct event name so subscribers can
 *   distinguish them from the recording variants:
 *
 *     'householdNameChangedSilently'
 *     'householdMemberRemovedSilently'
 *
 *   Neither is idempotent-safe in a way the recording variants are not —
 *   both refuse when there is nothing to do (SAME_NAME / NOT_MEMBER).
 *
 * DEPENDENCIES (REQUIRED):
 *   - household-state.js: HouseholdState
 *   - household-rules.js: HouseholdRules
 *   - character-commands.js: CharacterCommands.updateCharacterFields
 *   - character-state.js: CharacterState (for live-record reads only)
 *   - ids.js: generateId
 *   - time.js: getCurrentYear
 *   - storage.js: saveMasterData, markDataDirty
 *
 * DEPENDENCIES (OPTIONAL, called only when the feature is used):
 *   - industry-commands.js: IndustryCommands
 *   - residence-system.js: ResidenceSystem
 *   - character-commands.js: CharacterCommands.addProfession
 *     (required for addRoleIfMissing)
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (silent variants):
 *     - Added updateHouseholdNameSilent(householdId, newName, options).
 *       Same in-memory rename as updateHousehold, but skips the
 *       nameHistory push. Commits with event name
 *       'householdNameChangedSilently'.
 *     - Added removeMemberSilent(householdId, characterId, options).
 *       Splices the member without closing the character's
 *       householdHistory entry and without head succession. Commits
 *       with event name 'householdMemberRemovedSilently'.
 *     - Both new commands are exported on window.HouseholdCommands.
 *     - No behavioural change to any existing command.
 *     - Required by modals-household.js (openRenameHouseholdModal and
 *       openRemoveHouseholdMemberModal with withHistory unchecked).
 *   Previous revision (P1 + household C1):
 *     - _commit now calls _invalidateAccessorCaches(), matching the
 *       identical contract in character-state.js::_emitChange. Prior to
 *       this revision the household domain never invalidated the
 *       accessor cache, which meant industry-queries._resolveOwnerName
 *       (and any other consumer reaching for getHouseholdById after a
 *       household write) could return a stale household name. See
 *       ACCESSOR CACHE CONTRACT in the header.
 *     - Header ACCESSOR CACHE CONTRACT section added.
 *     - No behavioural change to any command. Only the commit tail
 *       gained one more step.
 *   Previous revision (P0-3):
 *     - Replaced the load-time _residenceSystemPresent and
 *       _industryCommandsPresent flags with call-time helpers
 *       _residenceSystemAvailable() and _industryCommandsAvailable().
 *       The load-time flags froze to false under the documented load
 *       order (residence-system.js loads AFTER this file), which made
 *       every deleteHousehold call that touched a residence return
 *       RESIDENCE_SYSTEM_UNAVAILABLE even though ResidenceSystem was
 *       loaded by the time the command ran. Call-time resolution fixes
 *       this regardless of load order, and preserves the same behavior
 *       when ResidenceSystem is genuinely absent.
 *     - Header CROSS-DOMAIN PRESENCE CHECKS section added documenting
 *       the policy and the historical bug.
 *     - No behavioural change to any other command.
 *   Previous revisions:
 *     - Added clearLocationReferences(locationId). This is the cross-
 *       domain cleanup hook that LocationCommands.deletePlace dispatches
 *       when a place is removed.
 *     - Added removeCharacterReferences(characterId). The cross-domain
 *       cleanup hook that character-deletion-commands.js's
 *       _CLEANUP_TARGETS entry for 'households' dispatches on hard
 *       delete.
 *     - setHead became a single-commit command.
 *     - assignCharacterToPosition and bulkAssign gained
 *       addRoleIfMissing support.
 *     - Deletion-routed residence cleanup uses ResidenceSystem's
 *       markUnitVacant / markResidenceVacant and reports failures in
 *       eventLog.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. LOAD-TIME DEPENDENCY VERIFICATION
    // =========================================================================

    function _requireFunction(name, fn) {
        if (typeof fn !== 'function') {
            throw new Error('HouseholdCommands: ' + name + ' is required');
        }
        return fn;
    }

    function _requireObject(name, obj) {
        if (typeof obj === 'undefined' || obj === null) {
            throw new Error('HouseholdCommands: ' + name + ' is required');
        }
        return obj;
    }

    // Hard dependencies — throw at load.
    var _state = _requireObject('HouseholdState', window.HouseholdState);
    var _rules = _requireObject('HouseholdRules', window.HouseholdRules);
    _requireFunction('HouseholdRules.pickSuccessor', _rules.pickSuccessor);
    _requireFunction('HouseholdRules.applyHeadChange', _rules.applyHeadChange);
    _requireFunction('HouseholdRules.isHouseholdVacant', _rules.isHouseholdVacant);

    var _cc = _requireObject('CharacterCommands', window.CharacterCommands);
    _requireFunction('CharacterCommands.updateCharacterFields',
        _cc.updateCharacterFields);

    var _generateId = _requireFunction('generateId', window.generateId);
    var _getCurrentYear = _requireFunction('getCurrentYear',
        window.getCurrentYear);
    var _saveMasterData = _requireFunction('saveMasterData',
        window.saveMasterData);

    // State internal API — verify the shape we depend on.
    if (!_state._internal || typeof _state._internal !== 'object') {
        throw new Error('HouseholdCommands: HouseholdState._internal is required');
    }
    var _internal = _state._internal;
    _requireFunction('HouseholdState._internal.getHouseholdRecord',
        _internal.getHouseholdRecord);
    _requireFunction('HouseholdState._internal.getAllHouseholdRecords',
        _internal.getAllHouseholdRecords);
    _requireFunction('HouseholdState._internal.replaceHouseholds',
        _internal.replaceHouseholds);
    _requireFunction('HouseholdState._internal.getPositionRecord',
        _internal.getPositionRecord);
    _requireFunction('HouseholdState._internal.getAllPositionRecords',
        _internal.getAllPositionRecords);
    _requireFunction('HouseholdState._internal.replaceHouseholdPositions',
        _internal.replaceHouseholdPositions);
    _requireFunction('HouseholdState._internal.getAssignmentRecord',
        _internal.getAssignmentRecord);
    _requireFunction('HouseholdState._internal.getAllAssignmentRecords',
        _internal.getAllAssignmentRecords);
    _requireFunction('HouseholdState._internal.replaceHouseholdAssignments',
        _internal.replaceHouseholdAssignments);

    if (typeof window.markDataDirty !== 'function') {
        if (typeof console !== 'undefined' && console.warn) {
            console.warn(
                'HouseholdCommands: window.markDataDirty is not defined. ' +
                'Dirty tracking will be a no-op for this domain.'
            );
        }
    }

    // =========================================================================
    // 1b. CROSS-DOMAIN PRESENCE CHECKS (call time)
    // =========================================================================
    //
    // ResidenceSystem and IndustryCommands are OPTIONAL dependencies.
    // Resolve them at CALL time, not load time. See CROSS-DOMAIN PRESENCE
    // CHECKS in the module header for the historical bug this fixes.
    //
    // Why this matters:
    //   The documented HTML load order places household-commands.js
    //   BEFORE residence-system.js. A load-time flag would freeze to
    //   false and every deleteHousehold call that touched a residence
    //   would fail with RESIDENCE_SYSTEM_UNAVAILABLE, even though the
    //   command ran after ResidenceSystem finished loading. Call-time
    //   resolution means the command's behavior depends only on whether
    //   the optional module is present AT COMMAND TIME, which is the
    //   correct semantic for an optional dependency.

    function _residenceSystemAvailable() {
        return typeof window.ResidenceSystem !== 'undefined'
            && window.ResidenceSystem !== null;
    }

    function _industryCommandsAvailable() {
        return typeof window.IndustryCommands !== 'undefined'
            && window.IndustryCommands !== null;
    }

    // =========================================================================
    // 2. RESULT HELPERS
    // =========================================================================

    function _ok(data) {
        return { success: true, data: data === undefined ? null : data };
    }
    function _fail(code, reason, extra) {
        var result = { success: false, code: code, reason: reason || code };
        if (extra) {
            for (var k in extra) {
                if (Object.prototype.hasOwnProperty.call(extra, k)) {
                    result[k] = extra[k];
                }
            }
        }
        return result;
    }

    // =========================================================================
    // 3. YEAR / NUMBER VALIDATION
    // =========================================================================

    function _resolveYear(value) {
        if (value === undefined || value === null) return _getCurrentYear();
        if (typeof value !== 'number' || !isFinite(value)) return null;
        return value;
    }
    function _resolveInt(value, fallback) {
        if (value === undefined || value === null) return fallback;
        if (typeof value !== 'number' || !isFinite(value)) return null;
        return Math.floor(value);
    }

    // =========================================================================
    // 4. COMMIT TAIL
    // =========================================================================
    //
    // _commit is NOT a persistence boundary. It hydrates the state index,
    // marks data dirty, invalidates the accessor cache, publishes an
    // in-process event, and dispatches a cross-domain CustomEvent. The
    // caller decides when to call persist().
    //
    // IMPORTANT: _commit is called by every command, including no-op
    // updates. See updateHousehold() below — a call with an empty updates
    // object still fires _commit. That is the intended behaviour: an
    // empty update is a valid "touch" operation that some callers
    // (notably household-economy.js) use to signal "the record changed
    // out-of-band, notify subscribers."
    //
    // ACCESSOR CACHE INVALIDATION:
    //   getHouseholdById (accessors.js) caches household records by id.
    //   Any mutation of the household collection must invalidate that
    //   cache, or the accessor returns stale records. This mirrors
    //   character-state.js::_emitChange, which invalidates the accessor
    //   cache at the same memory-write boundary. See ACCESSOR CACHE
    //   CONTRACT in the header.

    function _hydrateState() {
        if (typeof _state.hydrateFromMasterData === 'function') {
            _state.hydrateFromMasterData();
        } else if (typeof _state.refresh === 'function') {
            _state.refresh();
        }
    }

    function _markDirty() {
        if (typeof window.markDataDirty === 'function') {
            try { window.markDataDirty(); } catch (e) { /* non-fatal */ }
        }
        if (typeof _state.markDirty === 'function') {
            try { _state.markDirty(); } catch (e) { /* non-fatal */ }
        }
    }

    /**
     * Invalidates the accessor cache (accessors.js), if present.
     *
     * Called at every mutation boundary, matching
     * character-state.js::_emitChange. Without this, getHouseholdById
     * returns stale records after a household write.
     *
     * Defensive: if accessors.js is not loaded, the call is a no-op.
     * In that case there is no cache to invalidate.
     *
     * @private
     */
    function _invalidateAccessorCaches() {
        if (typeof window.invalidateAccessorCaches === 'function') {
            try {
                window.invalidateAccessorCaches();
            } catch (e) {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn(
                        'HouseholdCommands: invalidateAccessorCaches threw',
                        e
                    );
                }
            }
        }
    }

    function _publish(eventName, payload) {
        if (typeof _state.publish === 'function') {
            try { _state.publish(eventName, payload); } catch (e) { /* non-fatal */ }
        }
    }

    function _dispatch(eventName, payload) {
        if (typeof window.dispatchEvent !== 'function') return;
        if (typeof window.CustomEvent !== 'function') return;
        try {
            window.dispatchEvent(new window.CustomEvent(eventName, {
                detail: payload || {}
            }));
        } catch (e) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn('HouseholdCommands: failed to dispatch ' + eventName, e);
            }
        }
    }

    function _commit(eventName, payload) {
        _hydrateState();
        _markDirty();
        _invalidateAccessorCaches();
        _publish(eventName, payload);
        _dispatch(eventName, payload);
    }

    // =========================================================================
    // 5. PERSIST BOUNDARY
    // =========================================================================
    //
    // The ONLY place in this module that writes to disk. UI/batch callers
    // call this once after a sequence of commands.

    function persist() {
        try {
            var ok = _saveMasterData();
            if (ok === false) {
                return _fail('SAVE_FAILED', 'saveMasterData returned false');
            }
            return _ok(null);
        } catch (e) {
            return _fail('SAVE_FAILED',
                e && e.message ? e.message : 'Unknown save error');
        }
    }

    // =========================================================================
    // 6. MUTATION PRIMITIVES
    // =========================================================================
    //
    // Primitives are the only place that touch the live canonical arrays.
    // They do not call _commit. The calling command does.

    function _addHouseholdRecord(record) {
        var all = _internal.getAllHouseholdRecords({ includeDeprecated: true });
        all.push(record);
        _internal.replaceHouseholds(all);
    }

    function _removeHouseholdRecord(householdId) {
        var all = _internal.getAllHouseholdRecords({ includeDeprecated: true });
        var next = [];
        for (var i = 0; i < all.length; i++) {
            if (all[i].id !== householdId) next.push(all[i]);
        }
        _internal.replaceHouseholds(next);
    }

    function _addPositionRecord(record) {
        var all = _internal.getAllPositionRecords();
        all.push(record);
        _internal.replaceHouseholdPositions(all);
    }

    function _removePositionRecord(positionId) {
        var all = _internal.getAllPositionRecords();
        var next = [];
        for (var i = 0; i < all.length; i++) {
            if (all[i].id !== positionId) next.push(all[i]);
        }
        _internal.replaceHouseholdPositions(next);
    }

    function _addAssignmentRecord(record) {
        var all = _internal.getAllAssignmentRecords();
        all.push(record);
        _internal.replaceHouseholdAssignments(all);
    }

    function _removeAssignmentRecord(assignmentId) {
        var all = _internal.getAllAssignmentRecords();
        var next = [];
        for (var i = 0; i < all.length; i++) {
            if (all[i].id !== assignmentId) next.push(all[i]);
        }
        _internal.replaceHouseholdAssignments(next);
    }

    // =========================================================================
    // 7. CHARACTER REVERSE-INDEX HELPERS
    // =========================================================================
    //
    // The character's `household`, `householdId`, and `householdHistory`
    // fields are CHARACTER-OWNED. This module never writes them directly.
    // It calls CharacterCommands.updateCharacterFields, which:
    //   - is the sole write boundary for character-owned fields
    //   - fires characterChanged
    //   - refuses fields that are domain-owned elsewhere

    function _getCharacterHistory(id) {
        if (typeof window.CharacterState === 'undefined'
            || typeof window.CharacterState.getCharacter !== 'function') {
            return [];
        }
        if (typeof window.CharacterState._getLiveCharacterForMutation
            !== 'function') {
            return [];
        }
        var live = window.CharacterState._getLiveCharacterForMutation(id);
        if (!live) return [];
        return Array.isArray(live.householdHistory)
            ? live.householdHistory.slice()
            : [];
    }

    /**
     * Writes the character reverse index for a member addition.
     */
    function _writeCharacterMembership(characterId, householdId, householdName,
                                        year, role, isHead) {
        var history = _getCharacterHistory(characterId);
        history.push({
            householdId: householdId,
            householdName: householdName,
            joinedYear: year,
            leftYear: null,
            leftReason: null,
            role: role,
            isHead: isHead,
            timestamp: Date.now()
        });

        var update = _cc.updateCharacterFields(characterId, {
            household: householdId,
            householdId: householdId,
            householdHistory: history
        });
        if (!update || update.success !== true) {
            return _fail(
                update && update.code ? update.code : 'CHARACTER_UPDATE_FAILED',
                update && update.reason
                    ? update.reason
                    : 'CharacterCommands.updateCharacterFields refused the write.'
            );
        }
        return _ok(null);
    }

    /**
     * Writes the character reverse index for a member departure.
     * Closes the open householdHistory entry for this household.
     */
    function _clearCharacterMembership(characterId, householdId, year, reason) {
        var history = _getCharacterHistory(characterId);
        for (var i = history.length - 1; i >= 0; i--) {
            var entry = history[i];
            if (entry.householdId === householdId && !entry.leftYear) {
                entry.leftYear = year;
                entry.leftReason = reason;
                break;
            }
        }

        var update = _cc.updateCharacterFields(characterId, {
            household: '',
            householdId: '',
            householdHistory: history
        });
        if (!update || update.success !== true) {
            return _fail(
                update && update.code ? update.code : 'CHARACTER_UPDATE_FAILED',
                update && update.reason
                    ? update.reason
                    : 'CharacterCommands.updateCharacterFields refused the write.'
            );
        }
        return _ok(null);
    }

    /**
     * Updates only the role of the open householdHistory entry.
     */
    function _updateCharacterMembershipRole(characterId, householdId, role) {
        var history = _getCharacterHistory(characterId);
        for (var i = history.length - 1; i >= 0; i--) {
            var entry = history[i];
            if (entry.householdId === householdId && !entry.leftYear) {
                entry.role = role;
                break;
            }
        }
        var update = _cc.updateCharacterFields(characterId, {
            householdHistory: history
        });
        if (!update || update.success !== true) {
            return _fail(
                update && update.code ? update.code : 'CHARACTER_UPDATE_FAILED',
                update && update.reason
                    ? update.reason
                    : 'CharacterCommands.updateCharacterFields refused the write.'
            );
        }
        return _ok(null);
    }

    // =========================================================================
    // 8. FIELD ALLOWLISTS
    // =========================================================================

    var _ALLOWED_HOUSEHOLD_UPDATE_FIELDS = {
        name: true,
        locationId: true,
        locationName: true,
        reputation: true,
        wealth: true,
        debt: true,
        powerScore: true,
        foundedYear: true,
        notes: true,
        renameYear: true,
        renameReason: true,
        changedBy: true
    };

    var _DOMAIN_OWNED_HOUSEHOLD_FIELDS = {
        members: 'Use HouseholdCommands.addMember / removeMember / transferMember.',
        departments: 'Use HouseholdCommands.addDepartment / removeDepartment.',
        enterprises: 'Use HouseholdCommands.setHouseholdEnterprises / addEnterpriseToHousehold / removeEnterpriseFromHousehold.',
        enterpriseHistory: 'Use HouseholdCommands.setHouseholdEnterprises.',
        residenceId: 'Use HouseholdCommands.associateWithResidence / disassociateFromResidence, or ResidenceSystem.assignHouseholdToUnit.',
        residenceUnitNumber: 'Use ResidenceSystem.assignHouseholdToUnit.',
        status: 'Use HouseholdCommands.setStatus.',
        nameHistory: 'Use HouseholdCommands.editNamePeriod / deleteNamePeriod.'
    };

    var _ALLOWED_POSITION_UPDATE_FIELDS = {
        name: true,
        departmentId: true,
        requiredRoleId: true,
        minSkillLevel: true,
        description: true,
        priority: true
    };

    // =========================================================================
    // 9. HOUSEHOLD LIFECYCLE
    // =========================================================================

    function createHousehold(data) {
        if (!data || typeof data !== 'object') {
            return _fail('INVALID_INPUT', 'Household data is required');
        }
        if (!data.name || typeof data.name !== 'string'
            || data.name.trim() === '') {
            return _fail('INVALID_NAME', 'Household name is required');
        }

        var year = _resolveYear(data.foundedYear);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid founded year');

        var householdId = _generateId('house');
        var household = {
            id: householdId,
            name: data.name.trim(),
            locationId: data.locationId || null,
            locationName: data.locationName || null,
            departments: [],
            members: [],
            reputation: data.reputation !== undefined ? data.reputation : 10,
            wealth: data.wealth !== undefined ? data.wealth : 0,
            debt: data.debt !== undefined ? data.debt : 0,
            powerScore: data.powerScore !== undefined ? data.powerScore : 0,
            foundedYear: year,
            status: 'active',
            nameHistory: [{
                oldName: null,
                newName: data.name.trim(),
                year: year,
                reason: 'Founded',
                changedBy: data.founderId || null,
                timestamp: Date.now()
            }],
            currentNameSince: year,
            eventLog: [],
            notes: data.notes || '',
            enterprises: [],
            enterpriseHistory: [],
            economy: {},
            resources: { food: 0, livestock: 0, goods: 0 },
            residenceHistory: [],
            vacancyHistory: [],
            damageHistory: [],
            activityLog: [],
            crimeHistory: [],
            vendettas: [],
            alliances: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        _addHouseholdRecord(household);

        if (data.headId) {
            var addResult = _addMemberRecord(household, data.headId, 'family', {
                role: 'Head of Household',
                joinedYear: year,
                isHead: true,
                notes: 'Founding head of household',
                recordHistory: true
            });
            if (!addResult.success) {
                _removeHouseholdRecord(householdId);
                return _fail(addResult.code, addResult.reason);
            }
        }

        _commit('householdCreated', {
            householdId: householdId,
            name: household.name,
            year: year
        });

        if (typeof window.logEvent === 'function') {
            window.logEvent('household', 'Household Created',
                'Created household: ' + household.name, []);
        }

        return _ok({ householdId: householdId });
    }

    function deleteHousehold(householdId, options) {
        options = options || {};
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        var year = _resolveYear(options.year);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid year');

        // Step 1: disassociate residence occupancy via ResidenceSystem.
        //
        // The residence cleanup requires ResidenceSystem. Resolved at
        // CALL time via _residenceSystemAvailable(). Under the documented
        // load order, ResidenceSystem is present by the time this runs.
        // If it is genuinely absent, the household still gets deleted;
        // the reverse index is left dangling and reported below.
        var residenceId = household.residenceId || null;
        var unitNumber = household.residenceUnitNumber;
        if (residenceId) {
            if (!_residenceSystemAvailable()) {
                return _fail('RESIDENCE_SYSTEM_UNAVAILABLE',
                    'Household occupies a residence but ResidenceSystem ' +
                    'is not loaded');
            }
            var rs = window.ResidenceSystem;
            var vacateResult = null;
            try {
                if (unitNumber !== null && unitNumber !== undefined
                    && typeof rs.markUnitVacant === 'function') {
                    vacateResult = rs.markUnitVacant(
                        residenceId, unitNumber, 'Household deleted', year
                    );
                } else if (typeof rs.markResidenceVacant === 'function') {
                    vacateResult = rs.markResidenceVacant(
                        residenceId, 'Household deleted', year
                    );
                }
            } catch (e) { vacateResult = null; }
            if (!vacateResult || vacateResult.success === false) {
                if (typeof window.logEvent === 'function') {
                    window.logEvent('household', 'Delete Residence Cleanup Failed',
                        'Could not clear residence occupancy for ' +
                        household.name + ' (' + residenceId + ')', []);
                }
            }
        }

        // Step 2: clear character reverse index via CharacterCommands.
        if (options.removeFromCharacters !== false
            && Array.isArray(household.members)) {
            for (var i = 0; i < household.members.length; i++) {
                var memberId = household.members[i].characterId;
                var clearResult = _clearCharacterMembership(
                    memberId, householdId, year, 'Household deleted'
                );
                if (!clearResult.success) {
                    if (typeof console !== 'undefined' && console.warn) {
                        console.warn(
                            'HouseholdCommands.deleteHousehold: could not ' +
                            'clear reverse index for ' + memberId + ': ' +
                            clearResult.reason
                        );
                    }
                }
            }
        }

        // Step 3: remove the household record.
        _removeHouseholdRecord(householdId);

        _commit('householdDeleted', {
            householdId: householdId,
            name: household.name,
            year: year
        });

        if (typeof window.logEvent === 'function') {
            window.logEvent('household', 'Household Deleted',
                'Deleted household: ' + household.name, []);
        }

        return _ok({ householdId: householdId });
    }

    // =========================================================================
    // 10. HOUSEHOLD FIELD MUTATIONS
    // =========================================================================

    function _validateHouseholdUpdates(updates) {
        if (!updates || typeof updates !== 'object') {
            return _fail('INVALID_INPUT', 'Updates object is required');
        }
        for (var key in updates) {
            if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;
            if (_ALLOWED_HOUSEHOLD_UPDATE_FIELDS[key]) continue;
            if (_DOMAIN_OWNED_HOUSEHOLD_FIELDS[key]) {
                return _fail('DOMAIN_OWNED_FIELD',
                    'Field "' + key + '" is owned by another command. ' +
                    _DOMAIN_OWNED_HOUSEHOLD_FIELDS[key]);
            }
            return _fail('UNKNOWN_FIELD',
                'Field "' + key + '" is not an allowed household field');
        }
        return _ok(null);
    }

    /**
     * Applies a partial update to a household.
     *
     * IMPORTANT: an empty `updates` object is a valid "touch" operation.
     * It commits (which fires the event and marks dirty) but does not
     * change any field. This is used by household-economy.js to signal
     * that the record was mutated out-of-band and subscribers should
     * re-read.
     */
    function updateHousehold(householdId, updates, options) {
        options = options || {};
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        var allowlist = _validateHouseholdUpdates(updates);
        if (allowlist.success === false) return allowlist;

        var year = _getCurrentYear();
        var changed = [];

        if (updates.name !== undefined && updates.name !== null) {
            var newName = String(updates.name).trim();
            if (newName === '') {
                return _fail('INVALID_NAME', 'Household name cannot be empty');
            }
            if (newName !== household.name) {
                if (!Array.isArray(household.nameHistory)) {
                    household.nameHistory = [];
                }
                var renameYear = updates.renameYear !== undefined
                    ? updates.renameYear : year;
                household.nameHistory.push({
                    oldName: household.name,
                    newName: newName,
                    year: renameYear,
                    reason: updates.renameReason || 'Renamed',
                    changedBy: updates.changedBy || null,
                    timestamp: Date.now()
                });
                household.name = newName;
                household.currentNameSince = renameYear;
                changed.push('name');
            }
        }

        if (updates.locationId !== undefined) {
            household.locationId = updates.locationId || null;
            if (updates.locationName !== undefined) {
                household.locationName = updates.locationName || null;
            }
            changed.push('locationId');
        }

        var scalarFields = ['reputation', 'wealth', 'debt', 'powerScore',
            'foundedYear', 'notes'];
        for (var i = 0; i < scalarFields.length; i++) {
            var key = scalarFields[i];
            if (updates[key] !== undefined) {
                household[key] = updates[key];
                changed.push(key);
            }
        }

        household.updatedAt = Date.now();

        // ALWAYS commit, even when changed is empty.
        _commit('householdUpdated', {
            householdId: householdId,
            changed: changed,
            year: year
        });

        return _ok({ householdId: householdId, changed: changed });
    }

    /**
     * Silent variant of updateHousehold's rename branch.
     *
     * Changes household.name (and currentNameSince) WITHOUT appending a
     * nameHistory entry. The name change is real; only the audit trail
     * entry is skipped. Used by modals-household.js's
     * openRenameHouseholdModal when the "record in name history"
     * checkbox is unchecked — the user is correcting a typo, not
     * recording a historical rename.
     *
     * Commits with event name 'householdNameChangedSilently' so
     * subscribers can distinguish it from the recording rename.
     *
     * @param {string} householdId
     * @param {string} newName
     * @param {{year?: number}} [options]
     * @returns {{success, data?, code?, reason?}}
     */
    function updateHouseholdNameSilent(householdId, newName, options) {
        options = options || {};
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        if (newName === undefined || newName === null) {
            return _fail('INVALID_NAME', 'Household name is required');
        }
        var trimmed = String(newName).trim();
        if (trimmed === '') {
            return _fail('INVALID_NAME', 'Household name cannot be empty');
        }

        if (trimmed === household.name) {
            return _fail('SAME_NAME', 'New name equals current name');
        }

        var year = _resolveYear(options.year);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid year');

        var oldName = household.name;

        // Field change — same as the non-silent rename branch.
        household.name = trimmed;
        household.currentNameSince = year;
        household.updatedAt = Date.now();

        // NOTE: no nameHistory.push(...) here. That's the "silent"
        // difference.

        _commit('householdNameChangedSilently', {
            householdId: householdId,
            oldName: oldName,
            newName: trimmed,
            year: year
        });

        return _ok({
            householdId: householdId,
            oldName: oldName,
            newName: trimmed,
            year: year
        });
    }

    function setStatus(householdId, status, options) {
        options = options || {};
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');
        if (typeof status !== 'string' || status === '') {
            return _fail('INVALID_STATUS', 'Status must be a non-empty string');
        }
        if (household.status === status) {
            return _ok({
                householdId: householdId,
                status: status,
                changed: false
            });
        }

        var oldStatus = household.status;
        household.status = status;
        household.updatedAt = Date.now();

        if (options.recordEvent === true) {
            if (!Array.isArray(household.eventLog)) household.eventLog = [];
            household.eventLog.push({
                year: options.year !== undefined
                    ? options.year : _getCurrentYear(),
                type: 'status_changed',
                from: oldStatus,
                to: status,
                reason: options.reason || null,
                timestamp: Date.now()
            });
        }

        _commit('householdStatusChanged', {
            householdId: householdId,
            from: oldStatus,
            to: status,
            reason: options.reason || null
        });

        return _ok({
            householdId: householdId,
            status: status,
            previousStatus: oldStatus
        });
    }

    function recordEvent(householdId, event) {
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');
        if (!event || typeof event !== 'object') {
            return _fail('INVALID_INPUT', 'Event must be an object');
        }

        if (!Array.isArray(household.eventLog)) household.eventLog = [];
        household.eventLog.push({
            year: event.year !== undefined ? event.year : _getCurrentYear(),
            type: event.type || 'event',
            message: event.message || null,
            details: event.details || null,
            amount: event.amount !== undefined ? event.amount : null,
            timestamp: Date.now()
        });
        if (household.eventLog.length > 200) {
            household.eventLog = household.eventLog.slice(-200);
        }

        household.updatedAt = Date.now();

        _commit('householdEventRecorded', {
            householdId: householdId,
            eventType: event.type || 'event'
        });

        return _ok({ householdId: householdId });
    }

    // =========================================================================
    // 11. MEMBER MUTATIONS
    // =========================================================================

    function _findMember(household, characterId) {
        if (!Array.isArray(household.members)) return -1;
        for (var i = 0; i < household.members.length; i++) {
            if (household.members[i].characterId === characterId) return i;
        }
        return -1;
    }

    function _clearOtherHeads(household) {
        if (!Array.isArray(household.members)) return;
        for (var i = 0; i < household.members.length; i++) {
            if (household.members[i].isHead) {
                household.members[i].isHead = false;
                household.members[i].headSince = null;
            }
        }
    }

    /**
     * Adds a member record to the household AND writes the character
     * reverse index. Does NOT call _commit; the caller does.
     */
    function _addMemberRecord(household, characterId, type, options) {
        options = options || {};
        var character = null;
        try {
            character = window.getCharacterById
                ? window.getCharacterById(characterId) : null;
        } catch (e) { character = null; }
        if (!character) {
            return _fail('CHARACTER_NOT_FOUND', 'Character not found');
        }

        if (type !== 'family' && type !== 'staff') {
            return _fail('INVALID_TYPE',
                'Member type must be "family" or "staff"');
        }
        if (_findMember(household, characterId) !== -1) {
            return _fail('ALREADY_MEMBER', 'Character is already a member');
        }

        var year = _resolveYear(options.joinedYear);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid joined year');

        var role = options.role || (type === 'family' ? 'Family Member' : 'Staff');
        var isHead = options.isHead === true;

        if (isHead) _clearOtherHeads(household);

        if (!Array.isArray(household.members)) household.members = [];
        var memberRecord = {
            characterId: characterId,
            characterName: (character.name || '') +
                (character.surname ? ' ' + character.surname : ''),
            type: type,
            departmentId: options.departmentId || null,
            role: role,
            isHead: isHead,
            joinedYear: year,
            headSince: isHead ? year : null,
            notes: options.notes || ''
        };
        household.members.push(memberRecord);
        household.updatedAt = Date.now();

        if (options.recordHistory !== false) {
            var indexResult = _writeCharacterMembership(
                characterId,
                household.id,
                household.name,
                year,
                role,
                isHead
            );
            if (!indexResult.success) {
                // Roll back the household-side mutation.
                var idx = _findMember(household, characterId);
                if (idx !== -1) household.members.splice(idx, 1);
                return _fail(indexResult.code, indexResult.reason);
            }
        }

        return _ok({ memberRecord: memberRecord, year: year });
    }

    function addMember(householdId, characterId, type, options) {
        options = options || {};
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        var addResult = _addMemberRecord(household, characterId, type, options);
        if (!addResult.success) return addResult;

        _commit('householdMemberAdded', {
            householdId: householdId,
            characterId: characterId,
            type: type,
            role: addResult.data.memberRecord.role,
            isHead: addResult.data.memberRecord.isHead,
            year: addResult.data.year
        });

        return _ok({
            householdId: householdId,
            characterId: characterId,
            role: addResult.data.memberRecord.role,
            isHead: addResult.data.memberRecord.isHead
        });
    }

    function removeMember(householdId, characterId, options) {
        options = options || {};
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        var idx = _findMember(household, characterId);
        if (idx === -1) return _fail('NOT_MEMBER', 'Character is not a member');

        var member = household.members[idx];
        var wasHead = member.isHead === true;

        var year = _resolveYear(options.leftYear);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid left year');
        var reason = options.reason || 'Removed';

        household.members.splice(idx, 1);
        household.updatedAt = Date.now();

        var clearResult = null;
        if (options.recordHistory !== false) {
            clearResult = _clearCharacterMembership(
                characterId, householdId, year, reason
            );
            if (!clearResult.success) {
                // Roll back: re-insert the member at the same index.
                household.members.splice(idx, 0, member);
                return _fail(clearResult.code, clearResult.reason);
            }
        }

        var successorId = null;
        if (wasHead) {
            successorId = _rules.pickSuccessor(household, _getCharacterById);
            if (successorId) {
                _rules.applyHeadChange(
                    household, successorId, year,
                    'Succession after removal'
                );
            }
        }

        _commit('householdMemberRemoved', {
            householdId: householdId,
            characterId: characterId,
            wasHead: wasHead,
            successorId: successorId,
            year: year
        });

        return _ok({
            householdId: householdId,
            characterId: characterId,
            wasHead: wasHead,
            successorId: successorId
        });
    }

    /**
     * Silent variant of removeMember.
     *
     * Splices the member out of the household. Does NOT:
     *   - close the character's householdHistory entry
     *     (via _clearCharacterMembership), or
     *   - trigger head succession.
     *
     * Used by modals-household.js's openRemoveHouseholdMemberModal when
     * the "record this removal in the character's history" checkbox is
     * unchecked — the user added the wrong character and is undoing
     * that. Closing a householdHistory entry for a membership that was
     * never acknowledged, or discovering a "successor" for a headship
     * that was never real, would corrupt the record.
     *
     * Commits with event name 'householdMemberRemovedSilently' so
     * subscribers can distinguish it from the recording removal.
     *
     * @param {string} householdId
     * @param {string} characterId
     * @param {{leftYear?: number, reason?: string}} [options]
     * @returns {{success, data?, code?, reason?}}
     */
    function removeMemberSilent(householdId, characterId, options) {
        options = options || {};
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        var idx = _findMember(household, characterId);
        if (idx === -1) return _fail('NOT_MEMBER', 'Character is not a member');

        var member = household.members[idx];
        var wasHead = member.isHead === true;

        household.members.splice(idx, 1);
        household.updatedAt = Date.now();

        // NOTE: no _clearCharacterMembership call here, and no
        // pickSuccessor / applyHeadChange. That's the "silent" difference.
        // The character's householdHistory is left untouched, and the
        // household is left without a head if the removed member was the
        // head — that's the intent when correcting a mistaken add.

        _commit('householdMemberRemovedSilently', {
            householdId: householdId,
            characterId: characterId,
            wasHead: wasHead,
            leftYear: options.leftYear !== undefined ? options.leftYear : null,
            reason: options.reason || 'removed_silently'
        });

        return _ok({
            householdId: householdId,
            characterId: characterId,
            wasHead: wasHead
        });
    }

    function updateMember(householdId, characterId, updates, options) {
        options = options || {};
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        var idx = _findMember(household, characterId);
        if (idx === -1) return _fail('NOT_MEMBER', 'Character is not a member');

        var member = household.members[idx];
        var changed = [];

        if (updates.role !== undefined && updates.role !== member.role) {
            member.role = updates.role;
            changed.push('role');
        }
        if (updates.type !== undefined && updates.type !== member.type) {
            if (updates.type !== 'family' && updates.type !== 'staff') {
                return _fail('INVALID_TYPE',
                    'Member type must be "family" or "staff"');
            }
            member.type = updates.type;
            changed.push('type');
        }
        if (updates.departmentId !== undefined) {
            member.departmentId = updates.departmentId;
            changed.push('departmentId');
        }
        if (updates.notes !== undefined) {
            member.notes = updates.notes;
            changed.push('notes');
        }
        if (updates.isHead === true && !member.isHead) {
            _rules.applyHeadChange(
                household, characterId,
                options.year !== undefined ? options.year : _getCurrentYear(),
                options.reason || 'Appointed'
            );
            changed.push('isHead');
        }

        if (changed.length === 0) {
            return _ok({ householdId: householdId, changed: false });
        }

        household.updatedAt = Date.now();

        // If role changed, update the character's householdHistory entry.
        if (updates.role !== undefined) {
            var roleResult = _updateCharacterMembershipRole(
                characterId, householdId, updates.role
            );
            if (!roleResult.success) {
                return _fail(roleResult.code, roleResult.reason);
            }
        }

        _commit('householdMemberUpdated', {
            householdId: householdId,
            characterId: characterId,
            changes: changed
        });

        return _ok({
            householdId: householdId,
            characterId: characterId,
            changes: changed
        });
    }

    function transferMember(characterId, targetHouseholdId, options) {
        options = options || {};
        var target = _internal.getHouseholdRecord(targetHouseholdId);
        if (!target) return _fail('TARGET_NOT_FOUND', 'Target household not found');

        var character = null;
        try {
            character = window.getCharacterById
                ? window.getCharacterById(characterId) : null;
        } catch (e) { character = null; }
        if (!character) {
            return _fail('CHARACTER_NOT_FOUND', 'Character not found');
        }
        if (character.isDeceased) {
            return _fail('CHARACTER_DECEASED',
                'Cannot transfer deceased character');
        }

        // Find current household.
        var all = _internal.getAllHouseholdRecords({ includeDeprecated: true });
        var current = null;
        var currentIdx = -1;
        for (var i = 0; i < all.length; i++) {
            var idx = _findMember(all[i], characterId);
            if (idx !== -1) {
                current = all[i];
                currentIdx = idx;
                break;
            }
        }

        if (current && current.id === targetHouseholdId) {
            return _fail('ALREADY_MEMBER',
                'Character is already in the target household');
        }
        if (_findMember(target, characterId) !== -1) {
            return _fail('ALREADY_MEMBER',
                'Character is already in the target household');
        }

        var year = _resolveYear(options.year);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid transfer year');
        var reason = options.reason || 'Transferred';

        var carriedRole = options.role || null;
        var carriedType = options.type || null;
        var carriedDepartmentId = options.departmentId || null;
        var carriedIsHead = options.isHead === true;

        if (current) {
            var member = current.members[currentIdx];
            if (!carriedRole) carriedRole = member.role;
            if (!carriedType) carriedType = member.type;
        }
        if (!carriedType) carriedType = 'family';
        if (!carriedRole) {
            carriedRole = carriedType === 'family' ? 'Family Member' : 'Staff';
        }

        var fromHouseholdId = null;
        var oldHeadSuccessor = null;

        if (current) {
            fromHouseholdId = current.id;
            var wasHead = current.members[currentIdx].isHead === true;
            current.members.splice(currentIdx, 1);
            current.updatedAt = Date.now();

            if (wasHead) {
                oldHeadSuccessor = _rules.pickSuccessor(
                    current, _getCharacterById
                );
                if (oldHeadSuccessor) {
                    _rules.applyHeadChange(
                        current, oldHeadSuccessor, year,
                        'Succession after transfer'
                    );
                }
            }
        }

        if (carriedIsHead) _clearOtherHeads(target);

        if (!Array.isArray(target.members)) target.members = [];
        target.members.push({
            characterId: characterId,
            characterName: (character.name || '') +
                (character.surname ? ' ' + character.surname : ''),
            type: carriedType,
            departmentId: carriedDepartmentId,
            role: carriedRole,
            isHead: carriedIsHead,
            joinedYear: year,
            headSince: carriedIsHead ? year : null,
            notes: options.notes || 'Transferred'
        });
        target.updatedAt = Date.now();

        // Write the character reverse index. If this fails, roll back both
        // the removal from the source and the addition to the target.
        var clearResult = _clearCharacterMembership(
            characterId,
            fromHouseholdId || '',
            year,
            reason
        );
        if (!clearResult.success) {
            // Roll back.
            if (current && fromHouseholdId) {
                current.members.splice(currentIdx, 0, {
                    characterId: characterId,
                    characterName: (character.name || '') +
                        (character.surname ? ' ' + character.surname : ''),
                    type: carriedType,
                    departmentId: carriedDepartmentId,
                    role: carriedRole,
                    isHead: false,
                    joinedYear: year,
                    headSince: null,
                    notes: ''
                });
            }
            var tIdx = _findMember(target, characterId);
            if (tIdx !== -1) target.members.splice(tIdx, 1);
            return _fail(clearResult.code, clearResult.reason);
        }

        var writeResult = _writeCharacterMembership(
            characterId,
            targetHouseholdId,
            target.name,
            year,
            carriedRole,
            carriedIsHead
        );
        if (!writeResult.success) {
            return _fail(writeResult.code, writeResult.reason, {
                partial: true,
                fromHouseholdId: fromHouseholdId,
                toHouseholdId: targetHouseholdId
            });
        }

        _commit('householdMemberTransferred', {
            characterId: characterId,
            fromHouseholdId: fromHouseholdId,
            toHouseholdId: targetHouseholdId,
            role: carriedRole,
            isHead: carriedIsHead,
            year: year
        });

        return _ok({
            characterId: characterId,
            fromHouseholdId: fromHouseholdId,
            toHouseholdId: targetHouseholdId,
            role: carriedRole,
            isHead: carriedIsHead,
            year: year
        });
    }

    // =========================================================================
    // 12. HEAD MANAGEMENT (SINGLE-COMMIT CONTRACT)
    // =========================================================================

    /**
     * Sets or clears the head of a household.
     *
     * CONTRACT: one commit, one event, regardless of whether the new head
     * was already a member.
     *
     *   - characterId null: clears the head. One commit.
     *   - characterId not a member: creates the member record inline
     *     (via _addMemberRecord, no commit), applies the head, commits
     *     once with event 'householdHeadSet'.
     *   - characterId already a member: applies the head, commits once
     *     with event 'householdHeadSet'.
     *
     * If the character not being a member previously triggered a separate
     * addMember command, that produced TWO commits (one from addMember,
     * one from the head change) for one logical operation. That is fixed.
     *
     * @param {string} householdId
     * @param {string|null} characterId
     * @param {Object} [options] - { year, reason, recordHistory }
     * @returns {{success, data?, code?, reason?}}
     */
    function setHead(householdId, characterId, options) {
        options = options || {};
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        var year = _resolveYear(options.year);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid year');
        var reason = options.reason || 'Succession';

        // ---- Clear head path ----
        if (characterId === null) {
            var oldHeadId = null;
            if (Array.isArray(household.members)) {
                for (var i = 0; i < household.members.length; i++) {
                    if (household.members[i].isHead) {
                        oldHeadId = household.members[i].characterId;
                        household.members[i].isHead = false;
                        household.members[i].headSince = null;
                        household.members[i].role = 'Family Member';
                    }
                }
            }
            household.updatedAt = Date.now();

            _commit('householdHeadCleared', {
                householdId: householdId,
                previousHeadId: oldHeadId,
                year: year
            });

            return _ok({
                householdId: householdId,
                previousHeadId: oldHeadId
            });
        }

        // ---- Set head path ----
        if (!_hasId(characterId)) {
            return _fail('INVALID_INPUT', 'characterId must be a non-empty string or null');
        }

        var memberIdx = _findMember(household, characterId);
        var addedInline = false;

        if (memberIdx === -1) {
            // Not a member: add the member record inline (no commit).
            var addResult = _addMemberRecord(household, characterId, 'family', {
                role: 'Head of Household',
                joinedYear: year,
                isHead: false,      // set below via applyHeadChange
                notes: 'Appointed as head of household',
                recordHistory: options.recordHistory !== false
            });
            if (!addResult.success) {
                return _fail(addResult.code, addResult.reason);
            }
            addedInline = true;
        }

        // Apply the head change (clears previous heads, sets the new one,
        // appends eventLog).
        var applied = _rules.applyHeadChange(household, characterId, year, reason);
        if (!applied) {
            // Should be unreachable after the add or the pre-existing
            // member lookup. If we added inline and applyHeadChange still
            // failed, that's a bug — fail loudly.
            return _fail('HEAD_APPLY_FAILED',
                'Head change could not be applied to the household record');
        }

        household.updatedAt = Date.now();

        _commit('householdHeadSet', {
            householdId: householdId,
            characterId: characterId,
            reason: reason,
            year: year,
            addedInline: addedInline
        });

        return _ok({
            householdId: householdId,
            characterId: characterId,
            year: year,
            addedInline: addedInline
        });
    }

    function autoAssignHead(householdId, options) {
        options = options || {};
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        var year = _resolveYear(options.year);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid year');

        var successorId = _rules.pickSuccessor(household, _getCharacterById);
        if (!successorId) {
            household.status = 'vacant';
            household.updatedAt = Date.now();

            _commit('householdHeadAutoAssignFailed', {
                householdId: householdId,
                reason: 'No eligible successor',
                year: year
            });

            return _ok({
                householdId: householdId,
                successorId: null,
                vacant: true
            });
        }

        _rules.applyHeadChange(
            household, successorId, year,
            options.reason || 'Auto-succession'
        );
        household.updatedAt = Date.now();

        _commit('householdHeadAutoAssigned', {
            householdId: householdId,
            successorId: successorId,
            year: year
        });

        return _ok({
            householdId: householdId,
            successorId: successorId,
            vacant: false
        });
    }

    // =========================================================================
    // 13. DEPARTMENT MANAGEMENT
    // =========================================================================

    function addDepartment(householdId, name, options) {
        options = options || {};
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        if (!name || typeof name !== 'string' || name.trim() === '') {
            return _fail('INVALID_NAME', 'Department name is required');
        }

        var trimmed = name.trim();
        var departments = Array.isArray(household.departments)
            ? household.departments : [];

        for (var i = 0; i < departments.length; i++) {
            if ((departments[i].name || '').toLowerCase()
                === trimmed.toLowerCase()) {
                return _fail('DUPLICATE_NAME', 'Department already exists');
            }
        }

        var dept = {
            id: _generateId('dept'),
            name: trimmed,
            headId: null,
            headName: null,
            createdAt: Date.now()
        };

        if (options.headId) {
            var head = null;
            try { head = window.getCharacterById(options.headId); } catch (e) {}
            if (head && _findMember(household, options.headId) !== -1) {
                dept.headId = head.id;
                dept.headName = (head.name || '') +
                    (head.surname ? ' ' + head.surname : '');
            }
        }

        departments.push(dept);
        household.departments = departments;
        household.updatedAt = Date.now();

        _commit('householdDepartmentAdded', {
            householdId: householdId,
            departmentId: dept.id,
            name: trimmed
        });

        return _ok({ departmentId: dept.id, householdId: householdId });
    }

    function removeDepartment(householdId, departmentId, options) {
        options = options || {};
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        var departments = Array.isArray(household.departments)
            ? household.departments : [];
        var idx = -1;
        for (var i = 0; i < departments.length; i++) {
            if (departments[i].id === departmentId) { idx = i; break; }
        }
        if (idx === -1) return _fail('NOT_FOUND', 'Department not found');

        if (options.transferMembers !== false
            && Array.isArray(household.members)) {
            for (var j = 0; j < household.members.length; j++) {
                if (household.members[j].departmentId === departmentId) {
                    household.members[j].departmentId = null;
                }
            }
        }

        departments.splice(idx, 1);
        household.updatedAt = Date.now();

        _commit('householdDepartmentRemoved', {
            householdId: householdId,
            departmentId: departmentId
        });

        return _ok({ householdId: householdId, departmentId: departmentId });
    }

    function updateDepartment(householdId, departmentId, updates) {
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        var departments = Array.isArray(household.departments)
            ? household.departments : [];
        var dept = null;
        for (var i = 0; i < departments.length; i++) {
            if (departments[i].id === departmentId) {
                dept = departments[i];
                break;
            }
        }
        if (!dept) return _fail('NOT_FOUND', 'Department not found');

        if (updates.name !== undefined && updates.name !== null) {
            var trimmed = String(updates.name).trim();
            if (trimmed === '') {
                return _fail('INVALID_NAME', 'Department name cannot be empty');
            }
            dept.name = trimmed;
        }

        if (updates.headId !== undefined) {
            if (updates.headId === null) {
                dept.headId = null;
                dept.headName = null;
            } else {
                var head = null;
                try { head = window.getCharacterById(updates.headId); }
                catch (e) {}
                if (!head) return _fail('CHARACTER_NOT_FOUND', 'Character not found');
                if (_findMember(household, updates.headId) === -1) {
                    return _fail('NOT_MEMBER', 'Character is not a member');
                }
                dept.headId = head.id;
                dept.headName = (head.name || '') +
                    (head.surname ? ' ' + head.surname : '');
            }
        }

        household.updatedAt = Date.now();

        _commit('householdDepartmentUpdated', {
            householdId: householdId,
            departmentId: departmentId
        });

        return _ok({ householdId: householdId, departmentId: departmentId });
    }

    // =========================================================================
    // 14. NAME-PERIOD MUTATIONS
    // =========================================================================

    function editNamePeriod(householdId, periodIndex, updates) {
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        var history = Array.isArray(household.nameHistory)
            ? household.nameHistory : [];
        if (periodIndex < 0 || periodIndex >= history.length) {
            return _fail('INDEX_OUT_OF_RANGE', 'Name period index out of range');
        }

        var period = history[periodIndex];
        var allowed = ['oldName', 'newName', 'year', 'periodEnd', 'reason',
            'changedBy'];
        for (var i = 0; i < allowed.length; i++) {
            var key = allowed[i];
            if (updates[key] !== undefined) period[key] = updates[key];
        }

        var isCurrent = (periodIndex === history.length - 1);
        if (isCurrent && updates.newName) {
            household.name = updates.newName;
            if (updates.year !== undefined) {
                household.currentNameSince = updates.year;
            }
        }

        household.updatedAt = Date.now();

        _commit('householdNamePeriodEdited', {
            householdId: householdId,
            periodIndex: periodIndex
        });

        return _ok({ householdId: householdId, periodIndex: periodIndex });
    }

    function deleteNamePeriod(householdId, periodIndex) {
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        var history = Array.isArray(household.nameHistory)
            ? household.nameHistory : [];
        if (history.length <= 1) {
            return _fail('CANNOT_DELETE_LAST',
                'Cannot delete the only name period');
        }
        if (periodIndex < 0 || periodIndex >= history.length) {
            return _fail('INDEX_OUT_OF_RANGE',
                'Name period index out of range');
        }

        var isCurrent = (periodIndex === history.length - 1);
        history.splice(periodIndex, 1);

        if (isCurrent && history.length > 0) {
            var last = history[history.length - 1];
            household.name = last.newName;
            household.currentNameSince = last.year;
        }

        household.updatedAt = Date.now();

        _commit('householdNamePeriodDeleted', {
            householdId: householdId,
            periodIndex: periodIndex
        });

        return _ok({ householdId: householdId, periodIndex: periodIndex });
    }

    // =========================================================================
    // 15. RESIDENCE ASSOCIATION (REVERSE INDEX)
    // =========================================================================
    //
    // Residence occupancy is canonical on units. These commands only update
    // the household-side reverse index. ResidenceSystem drives these calls
    // when it mutates unit occupancy.

    function associateWithResidence(householdId, residenceId, options) {
        options = options || {};
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        household.residenceId = residenceId;
        household.residenceName = options.residenceName || null;
        household.residenceType = options.residenceType || null;
        household.associatedYear = options.year !== undefined
            ? options.year : _getCurrentYear();
        household.residenceUnitNumber = options.unitNumber !== undefined
            ? options.unitNumber : null;
        household.residenceNotes = options.notes || '';

        household.updatedAt = Date.now();

        _commit('householdResidenceAssociated', {
            householdId: householdId,
            residenceId: residenceId,
            unitNumber: household.residenceUnitNumber
        });

        return _ok({ householdId: householdId, residenceId: residenceId });
    }

    function disassociateFromResidence(householdId, residenceId, reason, year) {
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        var y = _resolveYear(year);
        if (y === null) return _fail('INVALID_YEAR', 'Invalid year');

        if (!Array.isArray(household.residenceHistory)) {
            household.residenceHistory = [];
        }
        household.residenceHistory.push({
            residenceId: residenceId || household.residenceId,
            residenceName: household.residenceName,
            action: 'disassociated',
            year: y,
            reason: reason || 'Disassociated',
            timestamp: Date.now()
        });

        household.residenceId = null;
        household.residenceName = null;
        household.residenceType = null;
        household.associatedYear = null;
        household.residenceUnitNumber = null;
        household.residenceNotes = null;

        household.updatedAt = Date.now();

        _commit('householdResidenceDisassociated', {
            householdId: householdId,
            residenceId: residenceId || null,
            year: y,
            reason: reason || 'Disassociated'
        });

        return _ok({
            householdId: householdId,
            residenceId: residenceId || null
        });
    }

    // =========================================================================
    // 16. ENTERPRISE INDEX PRIMITIVES
    // =========================================================================
    //
    // Canonical enterprise ownership lives in Industry. The household's
    // enterprises[] array is a REVERSE INDEX. These commands own the
    // index mutation only; they do not call IndustryCommands.

    function setHouseholdEnterprises(householdId, enterpriseIds, options) {
        options = options || {};
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');

        if (!Array.isArray(enterpriseIds)) {
            return _fail('INVALID_INPUT', 'enterpriseIds must be an array');
        }

        var year = _resolveYear(options.year);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid year');

        var oldEnterprises = Array.isArray(household.enterprises)
            ? household.enterprises.slice() : [];

        household.enterprises = enterpriseIds.slice();

        if (!Array.isArray(household.enterpriseHistory)) {
            household.enterpriseHistory = [];
        }
        household.enterpriseHistory.push({
            year: year,
            action: options.reason || 'set_enterprises',
            oldEnterprises: oldEnterprises,
            newEnterprises: enterpriseIds.slice()
        });
        if (household.enterpriseHistory.length > 200) {
            household.enterpriseHistory =
                household.enterpriseHistory.slice(-200);
        }

        household.updatedAt = Date.now();

        _commit('householdEnterprisesSet', {
            householdId: householdId,
            year: year,
            enterpriseIds: enterpriseIds.slice()
        });

        return _ok({
            householdId: householdId,
            enterpriseIds: enterpriseIds.slice()
        });
    }

    function addEnterpriseToHousehold(householdId, enterpriseId, options) {
        options = options || {};
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');
        if (!enterpriseId) return _fail('INVALID_INPUT',
            'enterpriseId is required');

        var year = _resolveYear(options.year);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid year');

        if (!Array.isArray(household.enterprises)) household.enterprises = [];
        if (household.enterprises.indexOf(enterpriseId) !== -1) {
            return _ok({
                householdId: householdId,
                enterpriseId: enterpriseId,
                changed: false
            });
        }

        household.enterprises.push(enterpriseId);

        if (!Array.isArray(household.enterpriseHistory)) {
            household.enterpriseHistory = [];
        }
        household.enterpriseHistory.push({
            year: year,
            action: 'enterprise_added',
            enterpriseId: enterpriseId
        });

        household.updatedAt = Date.now();

        _commit('householdEnterpriseAdded', {
            householdId: householdId,
            enterpriseId: enterpriseId,
            year: year
        });

        return _ok({
            householdId: householdId,
            enterpriseId: enterpriseId,
            changed: true
        });
    }

    function removeEnterpriseFromHousehold(householdId, enterpriseId, options) {
        options = options || {};
        var household = _internal.getHouseholdRecord(householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');
        if (!enterpriseId) return _fail('INVALID_INPUT',
            'enterpriseId is required');

        var year = _resolveYear(options.year);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid year');

        if (!Array.isArray(household.enterprises)) {
            return _ok({
                householdId: householdId,
                enterpriseId: enterpriseId,
                changed: false
            });
        }

        var idx = household.enterprises.indexOf(enterpriseId);
        if (idx === -1) {
            return _ok({
                householdId: householdId,
                enterpriseId: enterpriseId,
                changed: false
            });
        }

        household.enterprises.splice(idx, 1);

        if (!Array.isArray(household.enterpriseHistory)) {
            household.enterpriseHistory = [];
        }
        household.enterpriseHistory.push({
            year: year,
            action: 'enterprise_removed',
            enterpriseId: enterpriseId
        });

        household.updatedAt = Date.now();

        _commit('householdEnterpriseRemoved', {
            householdId: householdId,
            enterpriseId: enterpriseId,
            year: year
        });

        return _ok({
            householdId: householdId,
            enterpriseId: enterpriseId,
            changed: true
        });
    }

    // =========================================================================
    // 17. POSITION CRUD
    // =========================================================================

    function createPosition(data) {
        if (!data || !data.householdId) {
            return _fail('INVALID_INPUT',
                'Position data with householdId is required');
        }
        var household = _internal.getHouseholdRecord(data.householdId);
        if (!household) return _fail('NOT_FOUND', 'Household not found');
        if (!data.name || String(data.name).trim() === '') {
            return _fail('INVALID_NAME', 'Position name is required');
        }

        var position = {
            id: _generateId('hpos'),
            name: String(data.name).trim(),
            householdId: data.householdId,
            departmentId: data.departmentId || null,
            requiredRoleId: data.requiredRoleId || null,
            minSkillLevel: data.minSkillLevel !== undefined
                ? data.minSkillLevel : 0,
            description: data.description || '',
            priority: data.priority !== undefined ? data.priority : 10,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        _addPositionRecord(position);

        _commit('householdPositionCreated', {
            positionId: position.id,
            householdId: data.householdId,
            name: position.name
        });

        return _ok({ positionId: position.id });
    }

    function updatePosition(positionId, updates) {
        var position = _internal.getPositionRecord(positionId);
        if (!position) return _fail('NOT_FOUND', 'Position not found');

        for (var key in updates) {
            if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;
            if (!_ALLOWED_POSITION_UPDATE_FIELDS[key]) {
                return _fail('UNKNOWN_FIELD',
                    'Field "' + key + '" is not an allowed position field');
            }
        }

        var allowed = ['name', 'departmentId', 'requiredRoleId',
            'minSkillLevel', 'description', 'priority'];
        for (var i = 0; i < allowed.length; i++) {
            var k = allowed[i];
            if (updates[k] !== undefined) position[k] = updates[k];
        }
        position.updatedAt = Date.now();

        var all = _internal.getAllPositionRecords();
        _internal.replaceHouseholdPositions(all);

        _commit('householdPositionUpdated', {
            positionId: positionId
        });

        return _ok({ positionId: positionId });
    }

    function deletePosition(positionId, options) {
        options = options || {};
        var position = _internal.getPositionRecord(positionId);
        if (!position) return _fail('NOT_FOUND', 'Position not found');

        _removePositionRecord(positionId);

        var removedAssignments = [];
        if (options.removeAssignments !== false) {
            var assignments = _internal.getAllAssignmentRecords();
            var filtered = [];
            for (var i = 0; i < assignments.length; i++) {
                if (assignments[i].positionId === positionId) {
                    removedAssignments.push(assignments[i].id);
                } else {
                    filtered.push(assignments[i]);
                }
            }
            _internal.replaceHouseholdAssignments(filtered);
        }

        _commit('householdPositionDeleted', {
            positionId: positionId,
            removedAssignments: removedAssignments
        });

        return _ok({
            positionId: positionId,
            removedAssignments: removedAssignments
        });
    }

    // =========================================================================
    // 18. ASSIGNMENT CRUD
    // =========================================================================
    //
    // ADD-ROLE-IF-MISSING CONTRACT
    // ----------------------------
    // When options.addRoleIfMissing is true and the position requires a
    // role the character lacks, the profession is added via
    // CharacterCommands.addProfession before assignment. If the profession
    // can't be added, the assignment is REFUSED — the caller asked for the
    // role to be added, so silently skipping it would produce an
    // assignment whose precondition was not met.
    //
    // If options.addRoleIfMissing is false or absent, the assignment
    // proceeds. The result carries `roleWarning` when a required role is
    // missing but the caller opted out of auto-adding.

    var _DEFAULT_SKILL_LEVEL = 10;

    function _characterHasRole(character, roleId) {
        if (!character || !Array.isArray(character.professions)) return false;
        if (!_hasId(roleId)) return false;
        for (var i = 0; i < character.professions.length; i++) {
            if (character.professions[i]
                && character.professions[i].id === roleId) return true;
        }
        return false;
    }

    /**
     * Attempts to add a missing role to the character via
     * CharacterCommands.addProfession. Returns { ok, reason }.
     *
     * If CharacterCommands.addProfession is not available, returns
     * { ok: false, reason: 'addProfession unavailable' }.
     */
    function _addMissingRole(characterId, roleId, skillLevel, year) {
        if (typeof _cc.addProfession !== 'function') {
            return {
                ok: false,
                reason: 'CharacterCommands.addProfession is not available'
            };
        }

        // Resolve the role's display name if RoleQueries is loaded.
        var roleName = 'Role';
        if (typeof window.getRoleById === 'function') {
            var role = null;
            try { role = window.getRoleById(roleId); } catch (e) { role = null; }
            if (role && typeof role.name === 'string' && role.name.length > 0) {
                roleName = role.name;
            }
        }

        var result = _cc.addProfession(characterId, {
            id: roleId,
            name: roleName,
            skillLevel: skillLevel !== undefined ? skillLevel : _DEFAULT_SKILL_LEVEL,
            startYear: year,
            primary: false,
            notes: 'Granted for household position',
            specs: [],
            baseSalary: 0,
            customSalary: null,
            salaryHistory: [],
            salaryLastCalculated: null,
            paysSalary: false
        });

        if (!result || result.success !== true) {
            return {
                ok: false,
                reason: (result && result.reason) || 'addProfession failed'
            };
        }
        return { ok: true };
    }

    function assignCharacterToPosition(positionId, characterId, options) {
        options = options || {};
        var position = _internal.getPositionRecord(positionId);
        if (!position) return _fail('POSITION_NOT_FOUND', 'Position not found');

        var character = null;
        try { character = window.getCharacterById(characterId); }
        catch (e) { character = null; }
        if (!character) return _fail('CHARACTER_NOT_FOUND', 'Character not found');
        if (character.isDeceased) {
            return _fail('CHARACTER_DECEASED', 'Character is deceased');
        }

        var assignments = _internal.getAllAssignmentRecords();
        for (var j = 0; j < assignments.length; j++) {
            var a = assignments[j];
            if (a.positionId === positionId &&
                a.characterId === characterId &&
                (a.endYear === null || a.endYear === undefined)) {
                return _fail('ALREADY_ASSIGNED',
                    'Character already assigned to this position');
            }
        }

        var year = _resolveYear(options.startYear);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid start year');

        var endYear = options.endYear !== undefined ? options.endYear : null;
        if (endYear !== null && endYear <= year) {
            return _fail('INVALID_YEAR_RANGE',
                'End year must be after start year');
        }

        // ---- Role check + optional add ----
        var roleWarning = null;
        if (_hasId(position.requiredRoleId)
            && !_characterHasRole(character, position.requiredRoleId)) {

            if (options.addRoleIfMissing === true) {
                var addResult = _addMissingRole(
                    characterId,
                    position.requiredRoleId,
                    options.defaultSkillLevel !== undefined
                        ? options.defaultSkillLevel
                        : _DEFAULT_SKILL_LEVEL,
                    year
                );
                if (!addResult.ok) {
                    return _fail('ROLE_ADD_FAILED',
                        'Position requires role "' + position.requiredRoleId +
                        '" and addRoleIfMissing was requested but failed: ' +
                        addResult.reason);
                }
            } else {
                roleWarning = {
                    code: 'MISSING_REQUIRED_ROLE',
                    roleId: position.requiredRoleId,
                    message: 'Character lacks required role; assignment ' +
                        'proceeds without it (addRoleIfMissing was not set)'
                };
            }
        }

        var assignment = {
            id: _generateId('hass'),
            positionId: positionId,
            characterId: characterId,
            householdId: position.householdId,
            startYear: year,
            endYear: endYear,
            title: options.title || position.name,
            notes: options.notes || '',
            roleIdAtAssignment: position.requiredRoleId || null,
            skillLevelAtAssignment: options.skillLevelAtAssignment !== undefined
                ? options.skillLevelAtAssignment : 0,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        _addAssignmentRecord(assignment);

        _commit('householdAssignmentCreated', {
            assignmentId: assignment.id,
            positionId: positionId,
            characterId: characterId,
            householdId: position.householdId
        });

        return _ok({
            assignmentId: assignment.id,
            roleWarning: roleWarning
        });
    }

    function endAssignment(assignmentId, endYear, reason) {
        var assignment = _internal.getAssignmentRecord(assignmentId);
        if (!assignment) return _fail('NOT_FOUND', 'Assignment not found');
        if (assignment.endYear !== null && assignment.endYear !== undefined) {
            return _fail('ALREADY_ENDED', 'Assignment already ended');
        }

        var y = _resolveYear(endYear);
        if (y === null) return _fail('INVALID_YEAR', 'Invalid end year');
        if (assignment.startYear !== undefined &&
            assignment.startYear !== null &&
            y < assignment.startYear) {
            return _fail('INVALID_YEAR_RANGE',
                'End year must not precede start year');
        }

        assignment.endYear = y;
        assignment.endReason = reason || 'Term ended';
        assignment.updatedAt = Date.now();

        var all = _internal.getAllAssignmentRecords();
        _internal.replaceHouseholdAssignments(all);

        _commit('householdAssignmentEnded', {
            assignmentId: assignmentId,
            endYear: y,
            reason: assignment.endReason
        });

        return _ok({ assignmentId: assignmentId, endYear: y });
    }

    function deleteAssignment(assignmentId) {
        var assignment = _internal.getAssignmentRecord(assignmentId);
        if (!assignment) return _fail('NOT_FOUND', 'Assignment not found');

        _removeAssignmentRecord(assignmentId);

        _commit('householdAssignmentDeleted', {
            assignmentId: assignmentId
        });

        return _ok({ assignmentId: assignmentId });
    }

    // =========================================================================
    // 19. BULK OPERATIONS
    // =========================================================================

    function bulkAssign(assignments, options) {
        options = options || {};
        if (!Array.isArray(assignments)) {
            return _fail('INVALID_INPUT', 'assignments must be an array');
        }

        var succeeded = [];
        var failed = [];
        var warnings = [];

        var prepared = [];
        for (var i = 0; i < assignments.length; i++) {
            var a = assignments[i];
            var position = _internal.getPositionRecord(a.positionId);
            if (!position) {
                failed.push({ index: i, code: 'POSITION_NOT_FOUND',
                    reason: 'Position not found' });
                continue;
            }
            var character = null;
            try { character = window.getCharacterById(a.characterId); }
            catch (e) { character = null; }
            if (!character) {
                failed.push({ index: i, code: 'CHARACTER_NOT_FOUND',
                    reason: 'Character not found' });
                continue;
            }
            if (character.isDeceased) {
                failed.push({ index: i, code: 'CHARACTER_DECEASED',
                    reason: 'Character is deceased' });
                continue;
            }

            var year = _resolveYear(a.startYear);
            if (year === null) {
                failed.push({ index: i, code: 'INVALID_YEAR',
                    reason: 'Invalid start year' });
                continue;
            }
            var endYear = a.endYear !== undefined ? a.endYear : null;
            if (endYear !== null && endYear <= year) {
                failed.push({ index: i, code: 'INVALID_YEAR_RANGE',
                    reason: 'End year must be after start year' });
                continue;
            }

            prepared.push({
                index: i,
                position: position,
                character: character,
                characterId: a.characterId,
                startYear: year,
                endYear: endYear,
                title: a.title || position.name,
                notes: a.notes || '',
                roleIdAtAssignment: position.requiredRoleId || null,
                skillLevelAtAssignment: a.skillLevelAtAssignment !== undefined
                    ? a.skillLevelAtAssignment : 0,
                roleNeedsAdd: _hasId(position.requiredRoleId)
                    && !_characterHasRole(character, position.requiredRoleId)
            });
        }

        // Apply addRoleIfMissing BEFORE checking duplicates — the role
        // addition is a prerequisite for the assignment, and doing it per
        // entry keeps the failure attribution local.
        var preparedAfterRoles = [];
        for (var p2 = 0; p2 < prepared.length; p2++) {
            var prep2 = prepared[p2];
            if (prep2.roleNeedsAdd) {
                if (options.addRoleIfMissing === true) {
                    var addResult = _addMissingRole(
                        prep2.characterId,
                        prep2.position.requiredRoleId,
                        options.defaultSkillLevel !== undefined
                            ? options.defaultSkillLevel
                            : _DEFAULT_SKILL_LEVEL,
                        prep2.startYear
                    );
                    if (!addResult.ok) {
                        failed.push({
                            index: prep2.index,
                            code: 'ROLE_ADD_FAILED',
                            reason: 'addRoleIfMissing failed: ' + addResult.reason
                        });
                        continue;
                    }
                } else {
                    warnings.push({
                        index: prep2.index,
                        code: 'MISSING_REQUIRED_ROLE',
                        roleId: prep2.position.requiredRoleId
                    });
                }
            }
            preparedAfterRoles.push(prep2);
        }

        var allAssignments = _internal.getAllAssignmentRecords();
        var added = [];
        for (var p = 0; p < preparedAfterRoles.length; p++) {
            var prep = preparedAfterRoles[p];
            var dup = false;
            for (var q = 0; q < allAssignments.length; q++) {
                var existing = allAssignments[q];
                if (existing.positionId === prep.position.id &&
                    existing.characterId === prep.characterId &&
                    (existing.endYear === null
                        || existing.endYear === undefined)) {
                    dup = true;
                    break;
                }
            }
            if (dup) {
                failed.push({ index: prep.index, code: 'ALREADY_ASSIGNED',
                    reason: 'Character already assigned to this position' });
                continue;
            }

            var assignment = {
                id: _generateId('hass'),
                positionId: prep.position.id,
                characterId: prep.characterId,
                householdId: prep.position.householdId,
                startYear: prep.startYear,
                endYear: prep.endYear,
                title: prep.title,
                notes: prep.notes,
                roleIdAtAssignment: prep.roleIdAtAssignment,
                skillLevelAtAssignment: prep.skillLevelAtAssignment,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            allAssignments.push(assignment);
            added.push(assignment.id);
            succeeded.push({ index: prep.index, assignmentId: assignment.id });
        }

        if (added.length > 0) {
            _internal.replaceHouseholdAssignments(allAssignments);
            _commit('householdAssignmentsBulkCreated', {
                count: added.length,
                assignmentIds: added
            });
        }

        return _ok({
            succeeded: succeeded,
            failed: failed,
            warnings: warnings
        });
    }

    // =========================================================================
    // 20. REPAIR
    // =========================================================================

    function repairMemberships(options) {
        options = options || {};
        var all = _internal.getAllHouseholdRecords({ includeDeprecated: true });
        var result = {
            householdsScanned: all.length,
            membersRemoved: 0,
            duplicateHeadsResolved: 0,
            successorsAssigned: 0
        };

        var year = _getCurrentYear();
        var changed = false;

        for (var i = 0; i < all.length; i++) {
            var household = all[i];
            if (!Array.isArray(household.members)) continue;

            var kept = [];
            for (var j = 0; j < household.members.length; j++) {
                var m = household.members[j];
                var character = null;
                try { character = window.getCharacterById(m.characterId); }
                catch (e) { character = null; }
                if (character) {
                    kept.push(m);
                } else {
                    result.membersRemoved++;
                    changed = true;
                }
            }
            household.members = kept;

            var heads = [];
            for (var k = 0; k < household.members.length; k++) {
                if (household.members[k].isHead) heads.push(household.members[k]);
            }
            if (heads.length > 1) {
                heads.sort(function(a, b) {
                    return (a.headSince || 0) - (b.headSince || 0);
                });
                for (var h = 1; h < heads.length; h++) {
                    heads[h].isHead = false;
                    heads[h].headSince = null;
                    heads[h].role = 'Family Member';
                    result.duplicateHeadsResolved++;
                    changed = true;
                }
            }

            var hasHead = false;
            for (var p = 0; p < household.members.length; p++) {
                if (household.members[p].isHead) { hasHead = true; break; }
            }
            if (!hasHead) {
                var successorId = _rules.pickSuccessor(
                    household, _getCharacterById
                );
                if (successorId) {
                    _rules.applyHeadChange(
                        household, successorId, year,
                        'Repair: auto-succession'
                    );
                    result.successorsAssigned++;
                    changed = true;
                }
            }
        }

        if (changed) {
            _commit('householdRepaired', result);
        }

        return _ok(result);
    }

    // =========================================================================
    // 21. CROSS-DOMAIN REFERENCE CLEANUP
    // =========================================================================
    //
    // removeCharacterReferences is the cleanup hook that
    // character-deletion-commands.js dispatches on hard delete. It is
    // distinct from removeMember: removeMember is a user-facing command
    // that operates on ONE household with the character's reverse index
    // intact, while removeCharacterReferences is a cross-domain sweep
    // that must succeed regardless of whether the character still exists.
    //
    // The character does NOT exist at the time this runs (it has just
    // been removed from the canonical collection). Every reverse-index
    // write is therefore skipped. The household-side cleanup is the
    // entire job.
    //
    // COMMIT CONTRACT:
    //   - Does NOT persist (the delete-character orchestration persists
    //     once at the end).
    //   - Emits ONE commit for the whole sweep (event
    //     'householdReferencesRemoved'), not one per household. This
    //     keeps the event stream coherent with the "one logical
    //     operation, one commit" contract.
    //   - Returns { success: true, data: { removedCount, households } }
    //     so the caller's cleanup report can attribute the domain
    //     correctly. Note the shape: the counts and household list are
    //     nested under `data`, matching the _ok convention used by the
    //     rest of this module.
    //   - Idempotent: re-running against an already-cleaned character
    //     returns success with removedCount: 0 and does not commit.

    function removeCharacterReferences(characterId) {
        if (!_hasId(characterId)) {
            return _fail('INVALID_INPUT', 'characterId is required');
        }

        var year = _getCurrentYear();
        var all = _internal.getAllHouseholdRecords({ includeDeprecated: true });
        var affectedHouseholds = [];
        var removedCount = 0;

        for (var i = 0; i < all.length; i++) {
            var household = all[i];
            if (!Array.isArray(household.members)) continue;

            var idx = _findMember(household, characterId);
            if (idx === -1) continue;

            var wasHead = household.members[idx].isHead === true;
            household.members.splice(idx, 1);
            household.updatedAt = Date.now();
            removedCount++;

            // Head succession — if the removed member was head, pick a
            // new successor from the remaining members. This mirrors
            // removeMember's succession behaviour and keeps the
            // household from being left headless.
            var successorId = null;
            if (wasHead) {
                successorId = _rules.pickSuccessor(
                    household, _getCharacterById
                );
                if (successorId) {
                    _rules.applyHeadChange(
                        household, successorId, year,
                        'Succession after character deletion'
                    );
                }
            }

            affectedHouseholds.push({
                householdId: household.id,
                householdName: household.name,
                wasHead: wasHead,
                successorId: successorId
            });
        }

        if (removedCount === 0) {
            // Idempotent: nothing to remove, nothing to commit.
            return _ok({
                removedCount: 0,
                households: []
            });
        }

        _commit('householdReferencesRemoved', {
            characterId: characterId,
            removedCount: removedCount,
            households: affectedHouseholds,
            year: year
        });

        return _ok({
            removedCount: removedCount,
            households: affectedHouseholds
        });
    }

    // =========================================================================
    // 22. CROSS-DOMAIN LOCATION CLEANUP
    // =========================================================================
    //
    // clearLocationReferences is the cleanup hook that
    // LocationCommands.deletePlace dispatches when a place is removed.
    // It walks every household whose locationId points at the deleted
    // place, sets locationId/locationName to null, and records a
    // location_history entry on the household so the deletion is
    // auditable.
    //
    // WHY NOT updateHousehold()? updateHousehold() accepts a single
    // household id and a single patch. This command needs to sweep every
    // household. Doing it via N updateHousehold() calls would:
    //   - emit N 'householdUpdated' commits (one per household),
    //   - trigger N hydrateFromMasterData() rebuilds (via each _commit),
    //   - produce an event stream that is not the "one logical
    //     operation, one commit" contract.
    //
    // WHAT THIS DOES INSTEAD:
    //   - Iterates the canonical household array once.
    //   - Mutates locationId/locationName directly on each match
    //     (in-memory only; the record is canonical, so this is the
    //     mutation).
    //   - Appends a location_history entry per household to preserve the
    //     audit trail.
    //   - Accumulates affected household ids.
    //   - Emits ONE 'householdsLocationCleared' commit at the end.
    //
    // PRECONDITIONS:
    //   - locationId must be a non-empty string.
    //   - The location need not still exist in masterData. This command
    //     operates on households, not on the location. deletePlace calls
    //     this AFTER removing the place from canonical data; that is the
    //     natural order (the place is gone, now reconcile references).
    //
    // COMMIT CONTRACT:
    //   - Does NOT persist (the delete-place orchestration persists once
    //     at the end).
    //   - ONE commit for the whole sweep, not one per household.
    //   - Returns { success: true, data: { clearedCount, households } }
    //     so the caller's reconciliation report can attribute the
    //     domain correctly. Note the shape: the counts and household
    //     list are nested under `data`, matching the _ok convention used
    //     by the rest of this module.
    //   - Idempotent: re-running against a location that no household
    //     references returns success with clearedCount: 0 and does not
    //     commit.

    function clearLocationReferences(locationId) {
        if (!_hasId(locationId)) {
            return _fail('INVALID_INPUT', 'locationId is required');
        }

        var year = _getCurrentYear();
        var all = _internal.getAllHouseholdRecords({ includeDeprecated: true });
        var affectedHouseholds = [];
        var clearedCount = 0;

        for (var i = 0; i < all.length; i++) {
            var household = all[i];
            if (household.locationId !== locationId) continue;

            var previousLocationName = household.locationName || null;

            household.locationId = null;
            household.locationName = null;

            if (!Array.isArray(household.residenceHistory)) {
                // residenceHistory is the closest existing "location
                // history" container on the household record. Reusing it
                // here keeps the schema stable; the entry's action field
                // disambiguates residence-from-location events.
                household.residenceHistory = [];
            }
            household.residenceHistory.push({
                action: 'location_cleared',
                year: year,
                previousLocationId: locationId,
                previousLocationName: previousLocationName,
                reason: 'Location deleted',
                timestamp: Date.now()
            });

            household.updatedAt = Date.now();
            clearedCount++;

            affectedHouseholds.push({
                householdId: household.id,
                householdName: household.name,
                previousLocationName: previousLocationName
            });
        }

        if (clearedCount === 0) {
            // Idempotent: nothing to clear, nothing to commit.
            return _ok({
                clearedCount: 0,
                households: []
            });
        }

        _commit('householdsLocationCleared', {
            locationId: locationId,
            clearedCount: clearedCount,
            households: affectedHouseholds,
            year: year
        });

        return _ok({
            clearedCount: clearedCount,
            households: affectedHouseholds
        });
    }

    // =========================================================================
    // 23. INTERNAL CHARACTER LOOKUP
    // =========================================================================

    function _getCharacterById(id) {
        if (typeof window.CharacterState !== 'undefined'
            && typeof window.CharacterState.getCharacter === 'function') {
            return window.CharacterState.getCharacter(id);
        }
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    // =========================================================================
    // 24. EXPORTS
    // =========================================================================

    window.HouseholdCommands = {
        // Persistence boundary — the ONLY save call site
        persist: persist,

        // Household lifecycle
        createHousehold: createHousehold,
        deleteHousehold: deleteHousehold,

        // Household fields
        updateHousehold: updateHousehold,
        updateHouseholdNameSilent: updateHouseholdNameSilent,
        setStatus: setStatus,
        recordEvent: recordEvent,

        // Members
        addMember: addMember,
        removeMember: removeMember,
        removeMemberSilent: removeMemberSilent,
        updateMember: updateMember,
        transferMember: transferMember,

        // Head (single-commit contract)
        setHead: setHead,
        autoAssignHead: autoAssignHead,

        // Departments
        addDepartment: addDepartment,
        removeDepartment: removeDepartment,
        updateDepartment: updateDepartment,

        // Name periods
        editNamePeriod: editNamePeriod,
        deleteNamePeriod: deleteNamePeriod,

        // Residence association (reverse index only)
        associateWithResidence: associateWithResidence,
        disassociateFromResidence: disassociateFromResidence,

        // Enterprise index (reverse index only)
        setHouseholdEnterprises: setHouseholdEnterprises,
        addEnterpriseToHousehold: addEnterpriseToHousehold,
        removeEnterpriseFromHousehold: removeEnterpriseFromHousehold,

        // Positions
        createPosition: createPosition,
        updatePosition: updatePosition,
        deletePosition: deletePosition,

        // Assignments (support addRoleIfMissing)
        assignCharacterToPosition: assignCharacterToPosition,
        endAssignment: endAssignment,
        deleteAssignment: deleteAssignment,
        bulkAssign: bulkAssign,

        // Repair
        repairMemberships: repairMemberships,

        // Cross-domain reference cleanup
        removeCharacterReferences: removeCharacterReferences,
        clearLocationReferences: clearLocationReferences
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.HouseholdCommands;
    }

})();
