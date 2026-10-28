// js/location/location-commands.js
/**
 * =============================================================================
 * LOCATION COMMANDS
 * =============================================================================
 *
 * LOCATION: js/location/location-commands.js
 *
 * Single transaction owner for location-domain mutations.
 *
 * Responsibilities per command:
 *   1. Validate
 *   2. Mutate canonical data via LocationState primitives
 *   3. Hydrate State indexes
 *   4. Publish on State + dispatch CustomEvent for cross-domain
 *   5. Persist once via persist() (caller-owned batch boundary)
 *
 * Depends on (checked at load time):
 *   - LocationState       (hydrate, primitives, canonical accessors, publish)
 *   - LocationHierarchy   (hierarchy validation only)
 *   - CharacterCommands   (updateCharacterFields, for deletePlace cleanup)
 *   - CharacterQueries    (getAllCharacters, getCurrentLocationId,
 *                          getCharacterById)
 *   - CultureQueries      (getCulture, lazy — only required when cultureId used)
 *   - Storage             (markDataDirty, saveMasterData, getLastSaveError)
 *   - ids                 (generateId)
 *   - time                (getCurrentYear)
 *
 * Note on LocationQueries:
 *   This module does NOT depend on LocationQueries. Commands only needs
 *   primitive reads available directly on LocationState.
 *
 * Note on time helpers:
 *   Uses the canonical window.getCurrentYear from js/core/time.js. The
 *   deprecated window.getCurrentYearSafe alias is NOT used here.
 *
 * Cross-domain mutations go through the owning domain's commands:
 *   - Character movement → CharacterCommands (via LocationCommands orchestration)
 *   - Culture lookup     → CultureQueries (read only)
 *   - Household cleanup  → HouseholdCommands.clearLocationReferences
 *
 * Persistence boundary:
 *   Commands do NOT call saveMasterData except inside persist(). Every command
 *   mutates in memory, hydrates, marks dirty, and publishes. The caller
 *   (modal, batch, annual pipeline) calls LocationCommands.persist() exactly
 *   once per batch, after every command in the batch has succeeded.
 *
 * PERSIST CONTRACT (Pattern A from storage.js):
 *   LocationCommands.persist() uses the boolean-inspection pattern documented
 *   in storage.js's DOMAIN PERSIST CONTRACT section:
 *
 *     var ok = window.saveMasterData();
 *     if (ok === true) return { success: true };
 *     var lastError = window.getLastSaveError();
 *     return {
 *         success: false,
 *         reason: lastError && lastError.message
 *             ? lastError.message
 *             : 'saveMasterData returned false'
 *     };
 *
 *   saveMasterData() returns a boolean and does NOT throw on write
 *   failure. The boolean must be inspected. On false, getLastSaveError()
 *   provides the underlying Error so the caller can surface the actual
 *   failure reason (quota exceeded, JSON serialization failure, storage
 *   disabled) rather than a generic message.
 *
 *   Pattern C (the historical broken pattern that silently reported
 *   success on every failed save) must not be reintroduced.
 *
 * HOUSEHOLD RECONCILIATION ON PLACE DELETE:
 *   deletePlace performs THREE cleanups in sequence:
 *
 *     1. Character cleanup — nulls character.currentLocationId for every
 *        character whose current location is being removed. Delegated to
 *        CharacterCommands.updateCharacterFields (per character).
 *
 *     2. Household cleanup — clears household.locationId for every
 *        household whose location points at the removed place. Delegated
 *        to HouseholdCommands.clearLocationReferences (one batch commit).
 *        This is the revision that closes the householdReconciliation
 *        deferral: prior revisions returned 'deferred' here.
 *
 *     3. Residence cleanup — NOT performed by this command. Households at
 *        a deleted place keep their residence associations until the
 *        residence is separately removed or vacated. ResidenceSystem owns
 *        the canonical unit occupancy and handles residence lifecycle;
 *        deleting a place does not delete its residences. If a caller
 *        wants residences removed too, that is a separate orchestration
 *        above this command.
 *
 *   All three cleanups are best-effort from the command's point of view.
 *   The place is removed regardless; the cleanup report is returned in the
 *   result envelope so the caller can surface failures. A failed cleanup
 *   means the domain's own data still references a now-deleted place id;
 *   that is a bug in the domain, not a reason to refuse the delete.
 *
 *   HouseholdCommands is OPTIONAL for this module. If it is not loaded,
 *   the household cleanup step is skipped and reported as
 *   householdReconciliation: 'unavailable'. Character cleanup requires
 *   CharacterCommands, which is a load-time dependency of this module
 *   and cannot be missing.
 *
 * RESULT ENVELOPE `success` FIELD:
 *   _ok() always returns { success: true, ...payload }, and it REFUSES
 *   to let the payload shadow the `success` guard. This is not
 *   cosmetic: prior revisions of bulkRecordMoves returned
 *   { success: succeeded } where `succeeded` is an ARRAY of successful
 *   move records. The _ok copy loop let the array overwrite the
 *   boolean, so every downstream `result.success === true` check
 *   failed. Every successful bulk move was reported as a failure.
 *
 *   The guard is now structural: _ok skips any payload key named
 *   "success". Callers who want to convey "the list of successful
 *   items" must use a non-colliding name (succeededList, succeededItems,
 *   okList). See bulkRecordMoves below, which uses `succeededList`.
 *
 *   If you are adding a new command and reaching for `_ok({ success: ... })`,
 *   stop. Use a distinct key. The whole reason _ok has a guard is to
 *   make that mistake impossible to ship.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (P0-1 + P1-5):
 *     - _ok() now skips any payload key named 'success'. Prior revision
 *       copied the payload verbatim, so a payload key 'success' would
 *       silently overwrite the { success: true } guard. This was the
 *       actual bug in bulkRecordMoves (below).
 *     - bulkRecordMoves payload key renamed from `success` to
 *       `succeededList`. The previous shape returned
 *       { success: <array>, ... } which the _runCommand guard in
 *       modals-moves.js treated as a failure. Every successful bulk
 *       move reported an error toast, did not close the modal, and
 *       invited duplicate submissions. The move records themselves
 *       were written correctly; the failure was in the result
 *       envelope, not the mutation.
 *     - Header RESULT ENVELOPE `success` FIELD section added explaining
 *       the guard and the historical bug it prevents.
 *     - No other behavioural change.
 *   Previous revision:
 *     - deletePlace now dispatches HouseholdCommands.clearLocationReferences
 *       after character cleanup. Prior revisions returned
 *       householdReconciliation: 'deferred' and left every
 *       household.locationId pointing at the deleted place. This is the
 *       change that closes that deferral.
 *     - deletePlace result envelope now includes:
 *         householdReconciliation: { status, clearedCount, households,
 *                                    reason? }
 *       Status is 'applied' (cleanup ran and succeeded),
 *       'unavailable' (HouseholdCommands not loaded),
 *       'failed' (cleanup ran but reported failure),
 *       or 'skipped' (nothing to clean up).
 *     - persist() unchanged: reads getLastSaveError() on failure
 *       (Pattern A from storage.js DOMAIN PERSIST CONTRACT).
 *   Prior revisions:
 *     - persist() now reads getLastSaveError() when saveMasterData()
 *       returns false.
 *     - Header PERSIST CONTRACT section added.
 *     - Initial implementation.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HARD DEPENDENCY CHECKS (load time)
    // =========================================================================

    if (!window.LocationState) {
        throw new Error('location-commands.js requires location-state.js first.');
    }
    if (!window.LocationHierarchy) {
        throw new Error('location-commands.js requires location-hierarchy.js first.');
    }
    if (!window.CharacterCommands) {
        throw new Error(
            'location-commands.js requires character-commands.js ' +
            '(CharacterCommands) first.'
        );
    }
    if (!window.CharacterQueries) {
        throw new Error(
            'location-commands.js requires character-queries.js ' +
            '(CharacterQueries) first.'
        );
    }
    if (typeof window.getCurrentYear !== 'function') {
        throw new Error(
            'location-commands.js requires time.js (getCurrentYear).'
        );
    }
    if (typeof window.generateId !== 'function') {
        throw new Error('location-commands.js requires ids.js (generateId).');
    }
    if (typeof window.markDataDirty !== 'function') {
        throw new Error(
            'location-commands.js requires storage.js (markDataDirty).'
        );
    }
    if (typeof window.saveMasterData !== 'function') {
        throw new Error(
            'location-commands.js requires storage.js (saveMasterData).'
        );
    }
    if (typeof window.getLastSaveError !== 'function') {
        throw new Error(
            'location-commands.js requires storage.js (getLastSaveError). ' +
            'This is the canonical failure-reason accessor documented in ' +
            'storage.js\'s DOMAIN PERSIST CONTRACT.'
        );
    }

    var _requiredCharacterCommandMethods = [
        'updateCharacterFields'
    ];
    for (var _i = 0; _i < _requiredCharacterCommandMethods.length; _i++) {
        var _m = _requiredCharacterCommandMethods[_i];
        if (typeof window.CharacterCommands[_m] !== 'function') {
            throw new Error(
                'location-commands.js: CharacterCommands.' + _m +
                ' is required for deletePlace cleanup.'
            );
        }
    }

    var _requiredCharacterQueryMethods = [
        'getAllCharacters',
        'getCharacterById',
        'getCurrentLocationId'
    ];
    for (var _j = 0; _j < _requiredCharacterQueryMethods.length; _j++) {
        var _q = _requiredCharacterQueryMethods[_j];
        if (typeof window.CharacterQueries[_q] !== 'function') {
            throw new Error(
                'location-commands.js: CharacterQueries.' + _q +
                ' is required.'
            );
        }
    }

    var LS = window.LocationState;
    var LH = window.LocationHierarchy;
    var CC = window.CharacterCommands;
    var CQ = window.CharacterQueries;

    // HouseholdCommands is OPTIONAL. If loaded, deletePlace dispatches
    // clearLocationReferences. If not, the household cleanup step is
    // skipped and reported as 'unavailable' in the result envelope.
    //
    // Resolved at CALL time, not load time. Under the documented HTML
    // order household-commands.js loads before this file, so the
    // dependency is available. But call-time resolution means this
    // module is loadable in a reduced environment (e.g. a location-only
    // test harness) where HouseholdCommands is absent, without
    // precluding the character cleanup path (which does not need it).
    function _householdCommands() {
        return (typeof window.HouseholdCommands !== 'undefined'
                && window.HouseholdCommands !== null)
            ? window.HouseholdCommands
            : null;
    }

    // =========================================================================
    // 2. RESULT HELPERS
    // =========================================================================

    /**
     * Builds a success envelope.
     *
     * The `success: true` guard is ALWAYS present and ALWAYS a boolean.
     * Payload keys are copied onto the result except the key `success`,
     * which is skipped to prevent shadowing.
     *
     * Why the skip:
     *   Prior revisions let payload keys overwrite the guard. bulkRecordMoves
     *   returned { success: <array of moved records> }, the copy loop
     *   overwrote the boolean true, and every downstream
     *   `result.success === true` check failed. The bulk-move modal
     *   therefore reported every successful batch as a failure, left the
     *   modal open, and invited duplicate submissions.
     *
     *   This guard makes that class of bug structurally impossible: any
     *   caller passing { success: ... } gets its key silently dropped,
     *   keeping the guard intact. Callers that need a "list of successful
     *   items" key must name it something else (succeededList,
     *   succeededItems, okList, etc.).
     *
     * @param {Object} [data] - optional payload; keys spread onto result
     * @returns {{success: true, [key: string]: *}}
     */
    function _ok(data) {
        var result = { success: true };
        if (data) {
            for (var key in data) {
                if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
                if (key === 'success') continue;   // guard: never shadow
                result[key] = data[key];
            }
        }
        return result;
    }

    function _fail(reason) {
        return { success: false, reason: reason };
    }

    // =========================================================================
    // 3. NOTIFICATION (cross-domain)
    // =========================================================================

    function _dispatch(eventName, detail) {
        if (typeof window.dispatchEvent !== 'function') return;
        if (typeof window.CustomEvent !== 'function') return;
        try {
            window.dispatchEvent(new CustomEvent(eventName, {
                detail: detail || {}
            }));
        } catch (err) {
            if (window.console && typeof window.console.error === 'function') {
                window.console.error(
                    'location-commands: event "' + eventName +
                    '" dispatch failed:', err
                );
            }
        }
    }

    // =========================================================================
    // 4. COMMIT TAIL
    // =========================================================================

    function _commit(eventType, data) {
        LS.hydrateFromMasterData();
        LS.publish(eventType, data);
        _dispatch(eventType, data);
    }

    // =========================================================================
    // 5. PERSISTENCE BOUNDARY
    // =========================================================================

    /**
     * Persists the current canonical state.
     *
     * The ONLY place in this module that calls saveMasterData. Every
     * command leaves canonical data dirty; the caller decides when to
     * save.
     *
     * Uses Pattern A from storage.js's DOMAIN PERSIST CONTRACT:
     * saveMasterData() returns a boolean and does NOT throw on write
     * failure. On false, getLastSaveError() provides the underlying
     * failure message (quota exceeded, serialization failure, storage
     * disabled).
     *
     * Returns { success, reason? }. Does not throw.
     */
    function persist() {
        try {
            var ok = window.saveMasterData();
            if (ok === true) return _ok();

            var lastError = window.getLastSaveError();
            return _fail(
                (lastError && lastError.message)
                    ? lastError.message
                    : 'saveMasterData returned false'
            );
        } catch (e) {
            return _fail(e && e.message ? e.message : 'saveMasterData threw');
        }
    }

    // =========================================================================
    // 6. VALIDATION HELPERS
    // =========================================================================

    function _validString(v) {
        return typeof v === 'string' && v.trim() !== '';
    }

    function _validId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _plainObject(v) {
        if (v === null || typeof v !== 'object') return false;
        var proto = Object.getPrototypeOf(v);
        return proto === Object.prototype || proto === null;
    }

    // =========================================================================
    // 7. LOCAL PRIMITIVE READS (from State)
    // =========================================================================

    function _childrenCanonical(placeId) {
        if (!placeId) return [];
        return LS._getPlacesByParentIdCanonical(placeId);
    }

    function _descendantsCanonical(placeId) {
        var out = [];
        var seen = {};
        var stack = _childrenCanonical(placeId);
        while (stack.length > 0) {
            var next = stack.shift();
            if (!next || !next.id) continue;
            if (seen[next.id]) continue;
            seen[next.id] = true;
            out.push(next);
            var kids = _childrenCanonical(next.id);
            for (var i = 0; i < kids.length; i++) stack.push(kids[i]);
        }
        return out;
    }

    function _allSubLocationIds(placeId) {
        var ids = [placeId];
        var descendants = _descendantsCanonical(placeId);
        for (var i = 0; i < descendants.length; i++) {
            ids.push(descendants[i].id);
        }
        return ids;
    }

    // =========================================================================
    // 8. FIELD ALLOWLISTS
    // =========================================================================

    var _PLACE_UPDATABLE_FIELDS = {
        displayName: true,
        typeId: true,
        parentId: true,
        variableKey: true,
        status: true,
        isCapital: true,
        notes: true
    };

    var _PLACE_DOMAIN_OWNED_FIELDS = {
        cultureId: 'LocationCommands.updatePlaceCulture',
        governmentTypeId: 'LocationCommands.assignGovernment',
        governmentStyle: 'LocationCommands.assignGovernment',
        leaderId: 'LocationCommands.assignLeader',
        leaderAssignments: 'LocationCommands.assignLeader / endLeaderTerm',
        createdAt: '(read-only; set at create time)',
        updatedAt: '(managed by commands)',
        id: '(read-only)'
    };

    var _LOCATION_TYPE_UPDATABLE_FIELDS = {
        displayName: true,
        priority: true,
        icon: true,
        description: true
    };

    function _collectRefusedFields(updates, allowlist, domainOwned) {
        var refused = [];
        for (var key in updates) {
            if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;
            if (allowlist[key] === true) continue;
            if (domainOwned && domainOwned[key]) {
                refused.push({
                    field: key,
                    reason: 'owned by ' + domainOwned[key]
                });
            } else {
                refused.push({
                    field: key,
                    reason: 'not in the updatable allowlist'
                });
            }
        }
        return refused;
    }

    function _formatRefused(refused) {
        return refused.map(function (r) {
            return r.field + ' (' + r.reason + ')';
        }).join(', ');
    }

    // =========================================================================
    // 9. PLACE COMMANDS
    // =========================================================================

    function createPlace(input) {
        if (!_plainObject(input)) {
            return _fail('createPlace: input object is required');
        }
        if (!_validString(input.displayName)) {
            return _fail('createPlace: displayName is required');
        }
        if (!_validId(input.typeId)) {
            return _fail('createPlace: typeId is required');
        }
        if (!LS.getLocationTypeById(input.typeId)) {
            return _fail('createPlace: location type not found: ' + input.typeId);
        }
        if (input.parentId && !LS.getPlaceById(input.parentId)) {
            return _fail('createPlace: parent place not found: ' + input.parentId);
        }

        if (input.cultureId) {
            if (!window.CultureQueries ||
                typeof window.CultureQueries.getCulture !== 'function') {
                return _fail(
                    'createPlace: CultureQueries required to assign a culture'
                );
            }
            var culture = window.CultureQueries.getCulture(input.cultureId);
            if (!culture) {
                return _fail(
                    'createPlace: culture not found: ' + input.cultureId
                );
            }
        }

        var now = Date.now();
        var place = {
            id: window.generateId('place'),
            displayName: input.displayName.trim(),
            typeId: input.typeId,
            parentId: input.parentId || null,
            variableKey: input.variableKey || null,
            status: input.status || null,
            isCapital: input.isCapital === true,
            cultureId: input.cultureId || null,
            notes: input.notes || null,
            createdAt: now,
            updatedAt: now
        };

        LS._addPlace(place);
        _commit('placeCreated', { placeId: place.id });

        return _ok({ placeId: place.id, place: place });
    }

    function updatePlace(placeId, updates) {
        if (!_validId(placeId)) {
            return _fail('updatePlace: placeId is required');
        }
        if (!_plainObject(updates)) {
            return _fail('updatePlace: updates object is required');
        }

        var place = LS._getPlaceCanonical(placeId);
        if (!place) {
            return _fail('updatePlace: place not found: ' + placeId);
        }

        var refused = _collectRefusedFields(
            updates, _PLACE_UPDATABLE_FIELDS, _PLACE_DOMAIN_OWNED_FIELDS
        );
        if (refused.length > 0) {
            return _fail(
                'updatePlace: refused field(s): ' + _formatRefused(refused)
            );
        }

        if (updates.parentId !== undefined &&
            updates.parentId !== place.parentId) {
            var check = LH.validateHierarchy(placeId, updates.parentId);
            if (!check.valid) {
                return _fail('updatePlace: ' + check.reason);
            }
        }
        if (updates.typeId !== undefined) {
            if (!LS.getLocationTypeById(updates.typeId)) {
                return _fail(
                    'updatePlace: location type not found: ' + updates.typeId
                );
            }
        }
        if (updates.displayName !== undefined) {
            if (!_validString(updates.displayName)) {
                return _fail('updatePlace: displayName cannot be empty');
            }
        }

        for (var key in updates) {
            if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;
            if (key === 'displayName') {
                place[key] = updates[key].trim();
            } else if (key === 'parentId') {
                place[key] = updates[key] || null;
            } else {
                place[key] = updates[key];
            }
        }
        place.updatedAt = Date.now();

        window.markDataDirty();
        _commit('placeUpdated', { placeId: placeId });

        return _ok({ placeId: placeId });
    }

    function deletePlace(placeId, options) {
        if (!_validId(placeId)) {
            return _fail('deletePlace: placeId is required');
        }
        options = options || {};
        var mode = options.mode;
        if (mode !== 'simple' && mode !== 'cascade') {
            return _fail(
                "deletePlace: options.mode must be 'simple' or 'cascade'"
            );
        }

        var place = LS._getPlaceCanonical(placeId);
        if (!place) {
            return _fail('deletePlace: place not found: ' + placeId);
        }

        var children = _childrenCanonical(placeId);
        if (children.length > 0 && mode === 'simple') {
            return _fail(
                'deletePlace: place has ' + children.length +
                ' children; use mode "cascade"'
            );
        }

        var toRemove = {};
        if (mode === 'cascade') {
            var ids = _allSubLocationIds(placeId);
            for (var i = 0; i < ids.length; i++) toRemove[ids[i]] = true;
        } else {
            toRemove[placeId] = true;
        }

        var characterCleanup = _cleanupCharactersAtPlaces(toRemove);
        var householdCleanup = _cleanupHouseholdsAtPlaces(toRemove);

        var removed = [];
        for (var rid in toRemove) {
            if (!Object.prototype.hasOwnProperty.call(toRemove, rid)) continue;
            if (LS._removePlace(rid)) removed.push(rid);
        }

        window.markDataDirty();
        _commit('placeDeleted', {
            placeId: placeId,
            mode: mode,
            removedCount: removed.length,
            characterReconciled: characterCleanup.reconciled,
            characterFailed: characterCleanup.failed,
            householdCleared: householdCleanup.clearedCount,
            householdStatus: householdCleanup.status
        });

        return _ok({
            placeId: placeId,
            mode: mode,
            removedCount: removed.length,
            charactersReconciled: characterCleanup.reconciled,
            charactersFailed: characterCleanup.failed,
            charactersFailedIds: characterCleanup.failedIds,
            householdReconciliation: householdCleanup
        });
    }

    /**
     * Character cleanup on place delete.
     *
     * For every character whose CURRENT location is in `removeSet`, nulls
     * the currentLocationId via CharacterCommands.updateCharacterFields
     * (which owns the write boundary for character-owned fields).
     *
     * Returns { reconciled, failed, failedIds }. Does not throw: a per-
     * character failure is recorded and the sweep continues. A missing
     * CharacterCommands module would be a load-order bug (it is a load-
     * time dependency of this module), so it is not defensively handled.
     *
     * @private
     * @param {Object} removeSet - id -> true
     * @returns {{ reconciled: number, failed: number, failedIds: string[] }}
     */
    function _cleanupCharactersAtPlaces(removeSet) {
        var reconciled = 0;
        var failed = 0;
        var failedIds = [];

        var allCharacters;
        try {
            allCharacters = CQ.getAllCharacters();
        } catch (e) {
            return { reconciled: 0, failed: 0, failedIds: [] };
        }
        if (!Array.isArray(allCharacters)) {
            return { reconciled: 0, failed: 0, failedIds: [] };
        }

        for (var i = 0; i < allCharacters.length; i++) {
            var c = allCharacters[i];
            if (!c || !c.id) continue;

            var locId;
            try {
                locId = CQ.getCurrentLocationId(c.id);
            } catch (e) {
                continue;
            }
            if (!locId) continue;
            if (!removeSet[locId]) continue;

            var res = CC.updateCharacterFields(c.id, {
                currentLocationId: null
            });
            if (res && res.success === true) {
                reconciled++;
            } else {
                failed++;
                failedIds.push(c.id);
            }
        }

        return {
            reconciled: reconciled,
            failed: failed,
            failedIds: failedIds
        };
    }

    /**
     * Household cleanup on place delete.
     *
     * For every place being removed, dispatches
     * HouseholdCommands.clearLocationReferences(placeId). The household
     * command is a batch sweep across every household whose locationId
     * matches; it emits one commit and returns { clearedCount, households }.
     *
     * Returns:
     *   {
     *     status: 'applied' | 'unavailable' | 'failed' | 'skipped',
     *     clearedCount: number,
     *     households: Array,
     *     reason?: string,
     *     perPlace: Array<{ placeId, status, clearedCount, reason? }>
     *   }
     *
     * Status semantics:
     *   'skipped'     — nothing was removed from toRemove (unreachable in
     *                   practice, but defensive; deletePlace always has at
     *                   least one id).
     *   'unavailable' — HouseholdCommands is not loaded. The place is
     *                   still removed; household.locationId may dangle.
     *                   See HOUSEHOLD RECONCILIATION ON PLACE DELETE in
     *                   the module header.
     *   'failed'      — at least one per-place dispatch returned failure
     *                   or threw. perPlace carries the per-place outcome.
     *   'applied'     — every per-place dispatch succeeded.
     *
     * Design notes:
     *   - Iterates toRemove, not the child chain. For cascade, this means
     *     every descendant place is cleared from households independently.
     *     Because a household can only have ONE locationId at a time,
     *     clearing the ancestor covers the descendant case (a household
     *     at a descendant is at a place in the same cascade; the specific
     *     descendant's id is what the household.locationId points at, so
     *     we dispatch per-id, not per-ancestor).
     *   - The household-side clearLocationReferences commits once per
     *     call (per placeId). For a cascade of N places, this fires N
     *     household commits. That is consistent with deletePlace emitting
     *     N place removals inside one command — each place removal is
     *     its own reconciliation action.
     *   - Idempotent by construction: clearLocationReferences returns
     *     { clearedCount: 0 } without committing for places no household
     *     references.
     *
     * @private
     * @param {Object} removeSet - id -> true
     * @returns {{ status: string, clearedCount: number, households: Array,
     *             reason?: string, perPlace: Array }}
     */
    function _cleanupHouseholdsAtPlaces(removeSet) {
        var HC = _householdCommands();
        var perPlace = [];

        if (!HC || typeof HC.clearLocationReferences !== 'function') {
            return {
                status: 'unavailable',
                clearedCount: 0,
                households: [],
                reason: 'HouseholdCommands.clearLocationReferences is not available',
                perPlace: perPlace
            };
        }

        var removedIds = Object.keys(removeSet);
        if (removedIds.length === 0) {
            return {
                status: 'skipped',
                clearedCount: 0,
                households: [],
                perPlace: perPlace
            };
        }

        var totalCleared = 0;
        var allHouseholds = [];
        var anyFailed = false;
        var firstFailureReason = null;

        for (var i = 0; i < removedIds.length; i++) {
            var placeId = removedIds[i];
            var result = null;
            try {
                result = HC.clearLocationReferences(placeId);
            } catch (e) {
                result = {
                    success: false,
                    reason: e && e.message ? e.message : 'clearLocationReferences threw'
                };
            }

            if (!result || result.success !== true) {
                anyFailed = true;
                if (!firstFailureReason) {
                    firstFailureReason = (result && result.reason)
                        ? result.reason
                        : 'clearLocationReferences returned failure';
                }
                perPlace.push({
                    placeId: placeId,
                    status: 'failed',
                    clearedCount: 0,
                    reason: (result && result.reason) ? result.reason : null
                });
                continue;
            }

            // clearLocationReferences returns { success: true, data: { clearedCount, households } }
            // per household-commands.js's _ok shape. Read from data.
            var data = result.data || {};
            var cleared = typeof data.clearedCount === 'number'
                ? data.clearedCount
                : 0;
            var households = Array.isArray(data.households)
                ? data.households
                : [];

            totalCleared += cleared;
            for (var h = 0; h < households.length; h++) {
                allHouseholds.push(households[h]);
            }
            perPlace.push({
                placeId: placeId,
                status: 'applied',
                clearedCount: cleared
            });
        }

        if (anyFailed) {
            return {
                status: 'failed',
                clearedCount: totalCleared,
                households: allHouseholds,
                reason: firstFailureReason,
                perPlace: perPlace
            };
        }

        return {
            status: 'applied',
            clearedCount: totalCleared,
            households: allHouseholds,
            perPlace: perPlace
        };
    }

    // =========================================================================
    // 10. LOCATION TYPE COMMANDS
    // =========================================================================

    function createLocationType(input) {
        if (!_plainObject(input)) {
            return _fail('createLocationType: input object is required');
        }
        if (!_validString(input.displayName)) {
            return _fail('createLocationType: displayName is required');
        }
        if (input.priority === undefined || input.priority === null ||
            typeof input.priority !== 'number' ||
            input.priority < 1 || input.priority > 5) {
            return _fail('createLocationType: priority must be 1..5');
        }

        var type = {
            id: window.generateId('loctype'),
            displayName: input.displayName.trim(),
            priority: input.priority,
            icon: input.icon || null,
            description: input.description || null
        };

        LS._addLocationType(type);
        _commit('locationTypeCreated', { typeId: type.id });

        return _ok({ typeId: type.id, type: type });
    }

    function updateLocationType(typeId, updates) {
        if (!_validId(typeId)) {
            return _fail('updateLocationType: typeId is required');
        }
        if (!_plainObject(updates)) {
            return _fail('updateLocationType: updates object is required');
        }

        var type = LS._getLocationTypeCanonical(typeId);
        if (!type) {
            return _fail('updateLocationType: type not found: ' + typeId);
        }

        var refused = _collectRefusedFields(
            updates, _LOCATION_TYPE_UPDATABLE_FIELDS, null
        );
        if (refused.length > 0) {
            return _fail(
                'updateLocationType: refused field(s): ' +
                _formatRefused(refused)
            );
        }

        if (updates.priority !== undefined) {
            if (typeof updates.priority !== 'number' ||
                updates.priority < 1 || updates.priority > 5) {
                return _fail('updateLocationType: priority must be 1..5');
            }
        }
        if (updates.displayName !== undefined) {
            if (!_validString(updates.displayName)) {
                return _fail(
                    'updateLocationType: displayName cannot be empty'
                );
            }
        }

        for (var key in updates) {
            if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;
            if (key === 'displayName') {
                type[key] = updates[key].trim();
            } else {
                type[key] = updates[key];
            }
        }

        window.markDataDirty();
        _commit('locationTypeUpdated', { typeId: typeId });

        return _ok({ typeId: typeId });
    }

    function deleteLocationType(typeId) {
        if (!_validId(typeId)) {
            return _fail('deleteLocationType: typeId is required');
        }
        var type = LS._getLocationTypeCanonical(typeId);
        if (!type) {
            return _fail('deleteLocationType: type not found: ' + typeId);
        }

        var inUse = LS._getPlacesByTypeIdCanonical(typeId);
        if (inUse.length > 0) {
            return _fail(
                'deleteLocationType: ' + inUse.length +
                ' place(s) still use this type'
            );
        }

        LS._removeLocationType(typeId);
        _commit('locationTypeDeleted', { typeId: typeId });

        return _ok({ typeId: typeId });
    }

    // =========================================================================
    // 11. MOVEMENT COMMANDS
    // =========================================================================

    function recordMove(characterId, locationId, options) {
        options = options || {};

        var prep = _prepareMove(characterId, locationId, options);
        if (!prep.success) return prep;

        var charResult = CC.updateCharacterFields(prep.data.characterId, {
            moves: prep.data.nextMoves
        });
        if (!charResult || charResult.success !== true) {
            return _fail('recordMove: ' +
                (charResult && charResult.reason
                    ? charResult.reason
                    : 'character move write failed'));
        }

        window.markDataDirty();
        _commit('moveRecorded', {
            characterId: prep.data.characterId,
            locationId: prep.data.locationId
        });

        return _ok({
            characterId: prep.data.characterId,
            locationId: prep.data.locationId,
            year: prep.data.year
        });
    }

    function _prepareMove(characterId, locationId, options) {
        if (!_validId(characterId)) {
            return _fail('characterId is required');
        }
        if (!_validId(locationId)) {
            return _fail('locationId is required');
        }

        var character = CQ.getCharacterById(characterId);
        if (!character) {
            return _fail('character not found: ' + characterId);
        }

        var place = LS._getPlaceCanonical(locationId);
        if (!place) {
            return _fail('location not found: ' + locationId);
        }

        var year = (options.year === undefined || options.year === null)
            ? window.getCurrentYear()
            : options.year;

        var moveData = {
            year: year,
            locationId: locationId,
            locationName: place.displayName,
            note: options.note || null,
            fromLocationId: options.fromLocationId || null,
            fromLocationName: null,
            isBirthMove: options.isBirthMove === true,
            timestamp: Date.now()
        };
        if (moveData.fromLocationId) {
            var fromPlace = LS._getPlaceCanonical(moveData.fromLocationId);
            moveData.fromLocationName = fromPlace
                ? fromPlace.displayName
                : null;
        }

        var existingMoves = Array.isArray(character.moves)
            ? character.moves
            : [];

        return _ok({
            characterId: characterId,
            locationId: locationId,
            year: year,
            nextMoves: existingMoves.concat([moveData])
        });
    }

    /**
     * Records multiple moves in one batch.
     *
     * Each move is applied via CharacterCommands.updateCharacterFields.
     * The final result envelope contains:
     *
     *   succeededList: Array<{ characterId, locationId, year }>
     *                  Successfully written move records, in input order.
     *                  (Previously named `success`, which collided with
     *                  the _ok guard and broke every downstream check.)
     *   failed:        Array<{ index, error }>
     *                  Failed entries, with the input index and reason.
     *   total:         number
     *                  Total input entries.
     *   succeeded:     number
     *                  Count of succeededList (kept for callers that only
     *                  need the count).
     *   failedCount:   number
     *                  Count of failed.
     *
     * Calls _commit once if at least one move succeeded. Persistence is
     * the caller's responsibility via LocationCommands.persist() — this
     * function does NOT call saveMasterData.
     *
     * @param {Array<{characterId, locationId, year?, note?, fromLocationId?, isBirthMove?}>} moves
     * @returns {Object} result envelope
     */
    function bulkRecordMoves(moves) {
        if (!Array.isArray(moves)) {
            return _fail('bulkRecordMoves: moves must be an array');
        }

        var succeededList = [];
        var failed = [];
        var touchedCharacters = {};

        for (var i = 0; i < moves.length; i++) {
            var m = moves[i];
            if (!_plainObject(m)) {
                failed.push({ index: i, error: 'move entry must be an object' });
                continue;
            }

            var prep = _prepareMove(m.characterId, m.locationId, {
                year: m.year,
                note: m.note,
                fromLocationId: m.fromLocationId || null,
                isBirthMove: m.isBirthMove === true
            });
            if (!prep.success) {
                failed.push({ index: i, error: prep.reason });
                continue;
            }

            var charResult = CC.updateCharacterFields(prep.data.characterId, {
                moves: prep.data.nextMoves
            });
            if (!charResult || charResult.success !== true) {
                failed.push({
                    index: i,
                    error: charResult && charResult.reason
                        ? charResult.reason
                        : 'character move write failed'
                });
                continue;
            }

            touchedCharacters[prep.data.characterId] = true;
            succeededList.push({
                characterId: prep.data.characterId,
                locationId: prep.data.locationId,
                year: prep.data.year
            });
        }

        if (succeededList.length > 0) {
            window.markDataDirty();
            _commit('movesRecordedBulk', {
                count: succeededList.length,
                failedCount: failed.length,
                characterCount: Object.keys(touchedCharacters).length
            });
        }

        // Guard: _ok skips a payload key named 'success', but use a
        // non-colliding key anyway. `succeededList` is the array; the
        // result's `success` stays true.
        return _ok({
            succeededList: succeededList,
            failed: failed,
            total: moves.length,
            succeeded: succeededList.length,
            failedCount: failed.length
        });
    }

    // =========================================================================
    // 12. GOVERNMENT / LEADER / CULTURE
    // =========================================================================

    function assignGovernment(placeId, governmentTypeId, governmentStyle) {
        if (!_validId(placeId)) {
            return _fail('assignGovernment: placeId is required');
        }
        var place = LS._getPlaceCanonical(placeId);
        if (!place) {
            return _fail('assignGovernment: place not found: ' + placeId);
        }

        place.governmentTypeId = governmentTypeId || null;
        place.governmentStyle = governmentStyle || null;
        place.updatedAt = Date.now();

        window.markDataDirty();
        _commit('governmentAssigned', { placeId: placeId });

        return _ok({ placeId: placeId });
    }

    function assignLeader(placeId, characterId, startYear, title) {
        if (!_validId(placeId)) {
            return _fail('assignLeader: placeId is required');
        }
        if (!_validId(characterId)) {
            return _fail('assignLeader: characterId is required');
        }

        var place = LS._getPlaceCanonical(placeId);
        if (!place) {
            return _fail('assignLeader: place not found: ' + placeId);
        }

        var character = CQ.getCharacterById(characterId);
        if (!character) {
            return _fail('assignLeader: character not found: ' + characterId);
        }
        if (character.isDeceased) {
            return _fail('assignLeader: character is deceased');
        }

        if (!Array.isArray(place.leaderAssignments)) {
            place.leaderAssignments = [];
        }

        var year = (startYear === undefined || startYear === null)
            ? window.getCurrentYear()
            : startYear;

        for (var i = 0; i < place.leaderAssignments.length; i++) {
            var a = place.leaderAssignments[i];
            if (a.isActive &&
                (a.endYear === null || a.endYear === undefined)) {
                a.isActive = false;
                a.endYear = year - 1;
            }
        }

        var assignment = {
            id: window.generateId('lead'),
            characterId: characterId,
            startYear: year,
            endYear: null,
            title: title || 'Leader',
            isActive: true,
            notes: null,
            timestamp: Date.now()
        };

        place.leaderAssignments.push(assignment);
        place.leaderId = characterId;
        place.updatedAt = Date.now();

        window.markDataDirty();
        _commit('leaderAssigned', {
            placeId: placeId,
            characterId: characterId
        });

        return _ok({ placeId: placeId, assignment: assignment });
    }

    function endLeaderTerm(placeId, characterId, endYear) {
        if (!_validId(placeId)) {
            return _fail('endLeaderTerm: placeId is required');
        }
        if (!_validId(characterId)) {
            return _fail('endLeaderTerm: characterId is required');
        }

        var place = LS._getPlaceCanonical(placeId);
        if (!place) {
            return _fail('endLeaderTerm: place not found: ' + placeId);
        }
        if (!Array.isArray(place.leaderAssignments) ||
            place.leaderAssignments.length === 0) {
            return _fail('endLeaderTerm: no leader assignments');
        }

        var year = (endYear === undefined || endYear === null)
            ? window.getCurrentYear()
            : endYear;

        var found = false;
        for (var i = 0; i < place.leaderAssignments.length; i++) {
            var a = place.leaderAssignments[i];
            if (a.characterId === characterId && a.isActive &&
                (a.endYear === null || a.endYear === undefined)) {
                a.isActive = false;
                a.endYear = year;
                found = true;
                break;
            }
        }
        if (!found) {
            return _fail('endLeaderTerm: active assignment not found');
        }

        place.updatedAt = Date.now();
        window.markDataDirty();
        _commit('leaderTermEnded', {
            placeId: placeId,
            characterId: characterId
        });

        return _ok({
            placeId: placeId,
            characterId: characterId,
            endYear: year
        });
    }

    function updatePlaceCulture(placeId, cultureId) {
        if (!_validId(placeId)) {
            return _fail('updatePlaceCulture: placeId is required');
        }
        var place = LS._getPlaceCanonical(placeId);
        if (!place) {
            return _fail('updatePlaceCulture: place not found: ' + placeId);
        }

        if (cultureId) {
            if (!window.CultureQueries ||
                typeof window.CultureQueries.getCulture !== 'function') {
                return _fail(
                    'updatePlaceCulture: CultureQueries required to assign a culture'
                );
            }
            var culture = window.CultureQueries.getCulture(cultureId);
            if (!culture) {
                return _fail(
                    'updatePlaceCulture: culture not found: ' + cultureId
                );
            }
        }

        place.cultureId = cultureId || null;
        place.updatedAt = Date.now();

        window.markDataDirty();
        _commit('cultureAssigned', {
            placeId: placeId,
            cultureId: cultureId || null
        });

        return _ok({
            placeId: placeId,
            cultureId: cultureId || null
        });
    }

    // =========================================================================
    // 13. EXPORTS
    // =========================================================================

    window.LocationCommands = {
        persist: persist,

        createPlace: createPlace,
        updatePlace: updatePlace,
        deletePlace: deletePlace,

        createLocationType: createLocationType,
        updateLocationType: updateLocationType,
        deleteLocationType: deleteLocationType,

        recordMove: recordMove,
        bulkRecordMoves: bulkRecordMoves,

        assignGovernment: assignGovernment,
        assignLeader: assignLeader,
        endLeaderTerm: endLeaderTerm,
        updatePlaceCulture: updatePlaceCulture
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.LocationCommands;
    }

})();
