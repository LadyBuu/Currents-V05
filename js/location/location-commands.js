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
 *   - CharacterCommands   (updateCharacterFields for per-record writes,
 *                          updateCharacters for batch writes — the latter
 *                          is required by deletePlace's batch cleanup)
 *   - CharacterQueries    (getAllCharacters, getCurrentLocationId,
 *                          getCharacterById)
 *   - CultureQueries      (getCulture, lazy — only required when cultureId used)
 *   - Storage             (markDataDirty, saveMasterData, getLastSaveError)
 *   - ids                 (generateId)
 *   - time                (getCurrentYear)
 *
 * Depends on (checked at call time):
 *   - LocationQueries     (transitively, via LocationHierarchy.validateHierarchy,
 *                          which resolves LocationQueries at call time per
 *                          location-hierarchy.js's documented load order)
 *   - World               (getCurrentLocationId, semantic resolution for
 *                          character cleanup — see CHARACTER CLEANUP below)
 *
 * Note on LocationQueries:
 *   This module does not call LocationQueries directly. LocationHierarchy's
 *   validateHierarchy (called from updatePlace) resolves LocationQueries at
 *   call time. See B3 in the refactor history.
 *
 * Note on time helpers:
 *   Uses the canonical window.getCurrentYear from js/core/time.js. The
 *   deprecated window.getCurrentYearSafe alias is NOT used here.
 *
 * Cross-domain mutations go through the owning domain's commands:
 *   - Character movement → CharacterCommands (via LocationCommands orchestration)
 *   - Culture lookup     → CultureQueries (read only)
 *   - Culture associations → CultureCommands.reconcileDeletedLocations
 *     (removes deleted Location IDs from Culture-owned association lists)
 *   - Household cleanup  → HouseholdCommands.clearLocationReferencesMany
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
 * CHARACTER CLEANUP ON PLACE DELETE:
 *   deletePlace dispatches four cleanups, in order:
 *
 *     1. Character cleanup — resolves each character's CURRENT location
 *        (via World.getCurrentLocationId, semantic resolution through
 *        explicit field / moves / birthplace), and for characters whose
 *        resolved current location is being removed, clears
 *        currentLocationId. Additionally, clears any move record whose
 *        locationId points at a place being removed — otherwise
 *        World.getCurrentLocationId would return a dangling id after the
 *        delete, and downstream consumers (religion, culture, population)
 *        would read stale references.
 *
 *        Batched through CharacterCommands.updateCharacters (the character
 *        subsystem's batch API). One commit for the whole sweep.
 *        See CHARACTER CLEANUP BATCH SEMANTICS below.
 *
 *     2. Household cleanup — clears household.locationId for every
 *        household whose location points at the removed place. Delegated
 *        to HouseholdCommands.clearLocationReferences (one batch commit
 *        per place id).
 *
 *     3. Residence cleanup — NOT performed by this command. Households at
 *        a deleted place keep their residence associations until the
 *        residence is separately removed or vacated. ResidenceSystem owns
 *        the canonical unit occupancy and handles residence lifecycle;
 *        deleting a place does not delete its residences. If a caller
 *        wants residences removed too, that is a separate orchestration
 *        above this command.
 *
 *   Character, Household, Government, Religion, Culture (when loaded),
 *   Settlement, and Location mutations are applied inside one synchronous
 *   CrossDomainTransaction. All snapshots are captured before mutation;
 *   apply failures trigger reverse-order restoration. Notifications are
 *   deferred until every domain has applied successfully. Persistence remains
 *   caller-owned through LocationCommands.persist(); this is not crash-safe
 *   and has no durable journal or cross-tab lock.
 *
 * CHARACTER CLEANUP SEMANTIC RESOLUTION:
 *   Prior revisions of _cleanupCharactersAtPlaces read the raw
 *   currentLocationId field via CharacterQueries.getCurrentLocationId(c.id).
 *   Two consequences:
 *
 *     - A character placed only by a move record (currentLocationId
 *       null, latest move at the removed place) was not detected. The
 *       character's currentLocationId stayed null, and the character's
 *       moves array still contained a dangling reference to the
 *       removed place. Every consumer that resolves through
 *       World.getCurrentLocationId then returned the dangling id.
 *
 *     - A character whose currentLocationId pointed elsewhere but
 *       whose moves array had entries pointing at the removed place
 *       kept those entries. Same dangling-reference problem, different
 *       field.
 *
 *   The current implementation resolves through World.getCurrentLocationId
 *   (semantic) with CharacterQueries.getCurrentLocationId (raw field) as
 *   a fallback, and cleans BOTH currentLocationId (when the resolved
 *   location is being removed) AND any move entries pointing at removed
 *   places. See CHARACTER CLEANUP below for the implementation.
 *
 * CHARACTER CLEANUP BATCH SEMANTICS (P3-2):
 *   Prior revisions cleaned up characters one by one, calling
 *   CharacterCommands.updateCharacterFields per matching character. For
 *   a cascade delete of N places with M characters at those places, that
 *   fired M commits — each one triggering CharacterState._emitChange,
 *   markDataDirty, invalidateAccessorCaches, and a characterChanged
 *   CustomEvent. Under a large cascade, this produced thousands of
 *   commits for what is one logical operation.
 *
 *   The current revision batches the whole sweep through
 *   CharacterCommands.updateCharacters, which is the character
 *   subsystem's batch API. One call, one commit, one event, one cache
 *   invalidation.
 *
 *   Failure semantics: CharacterState.updateCharacters is all-or-nothing
 *   at the batch level. If the batch is refused (e.g. a character was
 *   hard-deleted mid-cascade between enumeration and commit), the whole
 *   batch fails. In that case, _cleanupCharactersAtPlaces reports
 *   `failed: changes.length, reconciled: 0, failedIds: <all ids>`, so
 *   the caller sees a nonzero failure count and aborts Location deletion.
 *   The alternative — per-character retry after batch failure — would
 *   weaken the batch's all-or-nothing guarantee.
 *
 * CROSS-DOMAIN LEADER CLEANUP (NEW):
 *   When a character dies, the character-lifecycle death dispatch
 *   (family, relationship, rank) does NOT naturally reach into the
 *   location domain. Prior to this revision, a deceased leader
 *   remained isActive: true in place.leaderAssignments until a
 *   subsequent assignLeader (which ends the old active assignment) or
 *   endLeaderTerm (which ends it explicitly) was called by another
 *   flow. Every consumer that reads LocationQueries.getCurrentLeader
 *   saw the dead character as the current leader.
 *
 *   This module now:
 *     1. Exposes LocationCommands.handleCharacterDeath(characterId, year)
 *        that ends every active leader assignment held by the
 *        character, across every place, in one commit.
 *     2. Registers itself at load via window.registerDeathHandler (the
 *        hook exposed by character-lifecycle.js) so the death dispatch
 *        calls handleCharacterDeath automatically.
 *
 *   The registration is additive: if the caller ALSO wires the dispatch
 *   explicitly (e.g. by calling LocationCommands.handleCharacterDeath
 *   from their own death handler), the second call is idempotent — a
 *   leader assignment that is already isActive: false is skipped.
 *
 *   Under the documented load order, character-lifecycle.js loads
 *   before this file, so window.registerDeathHandler is present. If a
 *   future load order changes, the registration is skipped with a
 *   debug log and the caller must wire handleCharacterDeath manually.
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
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (household-tab P2):
 *     - Added updateMove(characterId, moveIndex, patch) and
 *       deleteMove(characterId, moveIndex). Both are used by the
 *       Location tab's move-edit modal (openEditMoveModal in
 *       modals-moves.js) and its delete-move confirm flow.
 *
 *       updateMove's patch whitelist is DERIVED-AWARE: only
 *       year, locationId, note, fromLocationId, and isBirthMove are
 *       accepted. locationName and fromLocationName are derived from
 *       locationId and fromLocationId (recomputed from LocationState
 *       canonical) after the patch is applied. A caller that supplies
 *       locationName directly gets it silently overwritten by the
 *       resolution, which is intentional: the display name must match
 *       the id.
 *
 *       deleteMove removes one entry. Neither command touches
 *       character.currentLocationId — that is a separate fact from
 *       move history. Callers who want to also clear currentLocationId
 *       use CharacterCommands.updateCharacterFields.
 *
 *     - Both commands call CharacterCommands.updateCharacterFields
 *       once, then commit via the module's standard _commit tail.
 *       Persist is the caller's responsibility (matches recordMove /
 *       bulkRecordMoves).
 *
 *     - No behavioural change to any existing command.
 *   Previous revision:
 *     - Added LocationCommands.handleCharacterDeath(characterId, year).
 *       Ends every active leader assignment held by the character,
 *       across every place, in one commit. Returns the list of
 *       affected place ids.
 *     - Added load-time registration via window.registerDeathHandler
 *       (from character-lifecycle.js) so the death dispatch calls
 *       handleCharacterDeath automatically. See CROSS-DOMAIN LEADER
 *       CLEANUP in the module header.
 *     - Header CROSS-DOMAIN LEADER CLEANUP section added.
 *     - No behavioural change to any existing command. No public
 *       signature change.
 *   Previous revision (B1):
 *     - _cleanupCharactersAtPlaces now resolves each character's
 *       current location via World.getCurrentLocationId (semantic),
 *       with CharacterQueries.getCurrentLocationId as a raw-field
 *       fallback. Prior revisions read the raw field only, missing
 *       characters placed exclusively via moves.
 *     - _cleanupCharactersAtPlaces now also clears character.moves
 *       entries whose locationId points at any place being removed.
 *       Prior revisions cleared only currentLocationId, leaving
 *       dangling move references that World.getCurrentLocationId would
 *       return after the delete. Downstream consumers (religion,
 *       culture, population) then read stale ids.
 *     - Batch update path (CharacterCommands.updateCharacters) now
 *       includes both currentLocationId and moves updates per
 *       character where applicable. Same single-commit semantics as
 *       P3-2; only the number of updates per character grew.
 *     - _hasBatchCharacterUpdate, the per-character fallback path,
 *       and the failure reporting shape are unchanged.
 *     - Header CHARACTER CLEANUP, CHARACTER CLEANUP SEMANTIC
 *       RESOLUTION, and expanded CHARACTER CLEANUP BATCH SEMANTICS
 *       sections added.
 *     - No behavioural change to any other command. No public API
 *       change, no return-shape change.
 *   Previous revision (B3):
 *     - Header note added: updatePlace transitively requires
 *       LocationQueries at runtime through
 *       LocationHierarchy.validateHierarchy. Safe in the documented
 *       load order because user flows run after full page load. Not a
 *       load-time dependency of this module; document the constraint
 *       rather than tightening the load-time check.
 *   Previous revision (P3-2):
 *     - _cleanupCharactersAtPlaces now batches the whole sweep through
 *       CharacterCommands.updateCharacters instead of calling
 *       updateCharacterFields per character. For a cascade delete of N
 *       places with M characters at those places, this reduces M
 *       commits to 1.
 *   Previous revision (P0-1):
 *     - _ok() now skips any payload key named 'success'.
 *     - bulkRecordMoves payload key renamed from `success` to
 *       `succeededList`.
 *   Earlier revisions:
 *     - deletePlace dispatches HouseholdCommands.clearLocationReferences
 *       after character cleanup.
 *     - persist() reads getLastSaveError() on failure.
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

    // updateCharacterFields is used by every single-record command.
    // updateCharacters is used by deletePlace's character-cleanup sweep.
    // Both are required by this module. If an out-of-date character-commands.js
    // is loaded, _cleanupCharactersAtPlaces falls back to per-character
    // updates (documented in the header, one warning per session).
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

    var _hasBatchCharacterUpdate = (
        typeof window.CharacterCommands.updateCharacters === 'function'
    );
    if (!_hasBatchCharacterUpdate
        && typeof console !== 'undefined'
        && typeof console.warn === 'function') {
        console.warn(
            'location-commands.js: CharacterCommands.updateCharacters is ' +
            'not available. deletePlace will fall back to per-character ' +
            'updates (one commit per character). Update character-commands.js ' +
            'to get the batched cleanup.'
        );
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
    // test harness) where HouseholdCommands is absent.
    function _householdCommands() {
        return (typeof window.HouseholdCommands !== 'undefined'
                && window.HouseholdCommands !== null)
            ? window.HouseholdCommands
            : null;
    }

    // =========================================================================
    // 2. RESULT HELPERS
    // =========================================================================

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

    // Settlements may be attached only to inhabited location levels:
    // priority 4 (town/village) and priority 5 (locality/compound).
    // The settlement store is read directly because LocationCommands
    // loads before the Settlement domain; no reverse module dependency
    // or load-order coupling is introduced.
    var _SETTLEMENT_LOCATION_PRIORITIES = { 4: true, 5: true };

    function _getSettlementStoreForLocationGuard() {
        var data = window.masterData && window.masterData.data;
        var store = data && data.settlementData;
        return store && typeof store === 'object' ? store : null;
    }

    function _hasSettlementAtLocation(locationId, store) {
        return Object.prototype.hasOwnProperty.call(store, locationId) &&
            !!store[locationId];
    }

    function _hasSettlementUsingLocationType(places, store) {
        for (var i = 0; i < places.length; i++) {
            var place = places[i];
            if (place && place.id &&
                Object.prototype.hasOwnProperty.call(store, place.id) &&
                store[place.id]) return true;
        }
        return false;
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
        var hierarchyCheck = LH.validateNewPlace(
            input.typeId,
            input.parentId || null
        );
        if (!hierarchyCheck.valid) {
            return _fail('createPlace: ' + hierarchyCheck.reason);
        }

        if (input.parentId !== undefined && input.parentId !== null &&
            input.parentId !== '' && !_validId(input.parentId)) {
            return _fail('createPlace: parentId must be a non-empty string or null');
        }
        if (input.variableKey !== undefined && input.variableKey !== null &&
            typeof input.variableKey !== 'string') {
            return _fail('createPlace: variableKey must be a string or null');
        }
        if (input.status !== undefined && input.status !== null &&
            typeof input.status !== 'string') {
            return _fail('createPlace: status must be a string or null');
        }
        if (input.isCapital !== undefined && typeof input.isCapital !== 'boolean') {
            return _fail('createPlace: isCapital must be a boolean');
        }
        if (input.notes !== undefined && input.notes !== null &&
            typeof input.notes !== 'string') {
            return _fail('createPlace: notes must be a string or null');
        }
        if (input.cultureId) {
            if (!_validId(input.cultureId)) {
                return _fail('createPlace: cultureId must be a non-empty string');
            }
            if (!window.CultureQueries ||
                typeof window.CultureQueries.getCultureById !== 'function') {
                return _fail(
                    'createPlace: CultureQueries required to assign a culture'
                );
            }
            var culture = window.CultureQueries.getCultureById(input.cultureId);
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

        if (updates.typeId !== undefined &&
            !LS.getLocationTypeById(updates.typeId)) {
            return _fail(
                'updatePlace: location type not found: ' + updates.typeId
            );
        }

        if (updates.typeId !== undefined) {
            var settlementStoreForPlace = _getSettlementStoreForLocationGuard();
            if (!settlementStoreForPlace) {
                return _fail(
                    'updatePlace: cannot verify settlement compatibility; ' +
                    'settlementData is unavailable'
                );
            }
            if (_hasSettlementAtLocation(placeId, settlementStoreForPlace)) {
                var settlementLocationType = LS.getLocationTypeById(updates.typeId);
                if (!settlementLocationType ||
                    !_SETTLEMENT_LOCATION_PRIORITIES[settlementLocationType.priority]) {
                    return _fail(
                        'updatePlace: a location with a settlement must remain ' +
                        'at priority 4 or 5 (town/village or locality/compound)'
                    );
                }
            }
        }

        if (updates.parentId !== undefined || updates.typeId !== undefined) {
            var proposedParentId = updates.parentId !== undefined
                ? (updates.parentId || null)
                : place.parentId;
            var proposedTypeId = updates.typeId !== undefined
                ? updates.typeId
                : place.typeId;
            var structureCheck = LH.validatePlaceStructure(
                placeId,
                proposedParentId,
                proposedTypeId
            );
            if (!structureCheck.valid) {
                return _fail('updatePlace: ' + structureCheck.reason);
            }
        }
        if (updates.displayName !== undefined && !_validString(updates.displayName)) {
            return _fail('updatePlace: displayName cannot be empty');
        }
        if (updates.parentId !== undefined && updates.parentId !== null &&
            updates.parentId !== '' && !_validId(updates.parentId)) {
            return _fail('updatePlace: parentId must be a non-empty string or null');
        }
        if (updates.variableKey !== undefined && updates.variableKey !== null &&
            typeof updates.variableKey !== 'string') {
            return _fail('updatePlace: variableKey must be a string or null');
        }
        if (updates.status !== undefined && updates.status !== null &&
            typeof updates.status !== 'string') {
            return _fail('updatePlace: status must be a string or null');
        }
        if (updates.isCapital !== undefined && typeof updates.isCapital !== 'boolean') {
            return _fail('updatePlace: isCapital must be a boolean');
        }
        if (updates.notes !== undefined && updates.notes !== null &&
            typeof updates.notes !== 'string') {
            return _fail('updatePlace: notes must be a string or null');
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

        // Education institutions are independent records, not disposable
        // Location children. Require relocation or explicit institution deletion
        // before removing a Location they reference.
        var educationStore = window.masterData && window.masterData.data
            ? window.masterData.data.educationalInstitutions
            : [];
        if (educationStore === undefined || educationStore === null) educationStore = [];
        if (!Array.isArray(educationStore)) {
            return _fail(
                'deletePlace: cannot verify Education references because educationalInstitutions is malformed'
            );
        }
        var educationBlockers = [];
        for (var educationIndex = 0; educationIndex < educationStore.length; educationIndex++) {
            var educationInstitution = educationStore[educationIndex];
            if (!educationInstitution || typeof educationInstitution !== 'object') {
                return _fail(
                    'deletePlace: cannot verify Education references because an institution is malformed at index ' +
                    educationIndex
                );
            }
            if (educationInstitution.locationId &&
                Object.prototype.hasOwnProperty.call(toRemove, educationInstitution.locationId)) {
                educationBlockers.push({
                    id: educationInstitution.id || null,
                    name: educationInstitution.name || educationInstitution.id || 'Unnamed institution',
                    locationId: educationInstitution.locationId
                });
            }
        }
        if (educationBlockers.length > 0) {
            return _fail(
                'deletePlace: Education institutions still reference this Location. Relocate or delete them first: ' +
                educationBlockers.map(function (entry) { return entry.name; }).join(', '),
                { educationInstitutions: educationBlockers }
            );
        }

        // Enterprises are active Industry entities with a direct locationId
        // foreign key. They are not disposable Location children; require
        // relocation before deleting their current place.
        var enterpriseStore = window.masterData && window.masterData.data
            ? window.masterData.data.enterprises
            : [];
        if (enterpriseStore != null && !Array.isArray(enterpriseStore)) {
            return _fail('deletePlace: cannot verify Industry references because enterprises is malformed');
        }
        var industryBlockers = [];
        for (var industryIndex = 0; industryIndex < (enterpriseStore || []).length; industryIndex++) {
            var enterprise = enterpriseStore[industryIndex];
            if (!enterprise || typeof enterprise !== 'object') {
                return _fail(
                    'deletePlace: cannot verify Industry references because an enterprise is malformed at index ' +
                    industryIndex
                );
            }
            if (enterprise.locationId &&
                Object.prototype.hasOwnProperty.call(toRemove, enterprise.locationId)) {
                industryBlockers.push({
                    id: enterprise.id || null,
                    name: enterprise.name || enterprise.id || 'Unnamed enterprise',
                    locationId: enterprise.locationId
                });
            }
        }
        if (industryBlockers.length > 0) {
            return _fail(
                'deletePlace: Industry enterprises still reference this Location. Relocate them first: ' +
                industryBlockers.map(function (entry) { return entry.name; }).join(', '),
                { enterprises: industryBlockers }
            );
        }

        // Culture location associations are owned by Culture. Remove every
        // deleted Location ID through the Culture command boundary before
        // mutating the location graph. Refuse deletion if the data or command
        // dependency cannot be verified safely.
        var cultureStore = window.masterData && window.masterData.data
            ? window.masterData.data.cultures
            : [];
        if (cultureStore !== undefined && cultureStore !== null &&
            !Array.isArray(cultureStore)) {
            return _fail(
                'deletePlace: cannot verify Culture associations because masterData.data.cultures is malformed'
            );
        }
        var hasCultureLocationReferences = false;
        if (Array.isArray(cultureStore)) {
            for (var ci = 0; ci < cultureStore.length; ci++) {
                var cultureRecord = cultureStore[ci];
                if (!cultureRecord || typeof cultureRecord !== 'object') {
                    return _fail(
                        'deletePlace: cannot verify Culture associations because a Culture record is malformed at index ' + ci
                    );
                }
                if (cultureRecord.locations !== undefined &&
                    cultureRecord.locations !== null &&
                    !Array.isArray(cultureRecord.locations)) {
                    return _fail(
                        'deletePlace: cannot verify Culture associations because Culture "' +
                        (cultureRecord.id || ci) + '" has a malformed locations field'
                    );
                }
                if (Array.isArray(cultureRecord.locations) &&
                    cultureRecord.locations.some(function(locationId) {
                        return Object.prototype.hasOwnProperty.call(toRemove, locationId);
                    })) {
                    hasCultureLocationReferences = true;
                }
            }
        }
        if (hasCultureLocationReferences &&
            (!window.CultureCommands ||
             typeof window.CultureCommands.reconcileDeletedLocations !== 'function')) {
            return _fail(
                'deletePlace: CultureCommands.reconcileDeletedLocations is required ' +
                'to safely delete locations with Culture associations'
            );
        }
        var culturePreflight = { success: true, data: { updatedCultureIds: [], removedAssociations: 0 } };
        if (window.CultureCommands &&
            typeof window.CultureCommands.reconcileDeletedLocations === 'function') {
            culturePreflight = window.CultureCommands.reconcileDeletedLocations(
                Object.keys(toRemove),
                { dryRun: true }
            );
            if (!culturePreflight || culturePreflight.success !== true) {
                return _fail(
                    'deletePlace: Culture cleanup preflight failed: ' +
                    ((culturePreflight && culturePreflight.reason) || 'unknown error')
                );
            }
        }

        // Government and Religion expose read-only reconciliation plans. Run
        // them alongside Culture's dry-run before Character or Household
        // cleanup can publish any changes. This catches malformed hierarchy,
        // unavailable canonical stores, and reconciliation validation errors
        // before the first cross-domain mutation.
        var governmentStoreForPreflight = window.masterData && window.masterData.data
            ? window.masterData.data.governmentDepartments
            : [];
        if (governmentStoreForPreflight != null && !Array.isArray(governmentStoreForPreflight)) {
            return _fail('deletePlace: cannot verify Government departments because the store is malformed');
        }
        var hasGovernmentReferencesForPreflight = Array.isArray(governmentStoreForPreflight) &&
            governmentStoreForPreflight.length > 0;
        var governmentPreflight = { success: true, data: { removedDepartmentIds: [] } };
        if (window.GovernmentCommands &&
            typeof window.GovernmentCommands.reconcileDeletedLocations === 'function') {
            governmentPreflight = window.GovernmentCommands.reconcileDeletedLocations(
                Object.keys(toRemove),
                { dryRun: true }
            );
            if (!governmentPreflight || governmentPreflight.success !== true) {
                return _fail(
                    'deletePlace: Government cleanup preflight failed: ' +
                    ((governmentPreflight && governmentPreflight.reason) || 'unknown error')
                );
            }
        } else if (hasGovernmentReferencesForPreflight) {
            return _fail(
                'deletePlace: GovernmentCommands.reconcileDeletedLocations is required ' +
                'to safely delete locations with government departments'
            );
        }

        var religionStoreForPreflight = window.masterData && window.masterData.data
            ? window.masterData.data.religions
            : [];
        var worshipStoreForPreflight = window.masterData && window.masterData.data
            ? window.masterData.data.placesOfWorship
            : [];
        if (religionStoreForPreflight != null && !Array.isArray(religionStoreForPreflight)) {
            return _fail('deletePlace: cannot verify Religion associations because the Religion store is malformed');
        }
        if (worshipStoreForPreflight != null && !Array.isArray(worshipStoreForPreflight)) {
            return _fail('deletePlace: cannot verify worship-place associations because the store is malformed');
        }
        var religionReferencesForPreflight = false;
        try {
        [religionStoreForPreflight || [], worshipStoreForPreflight || []].forEach(function(records, groupIndex) {
            for (var ri = 0; ri < records.length; ri++) {
                var record = records[ri];
                if (!record || typeof record !== 'object') {
                    throw new Error('Malformed Religion or worship-place record at index ' + ri);
                }
                if (groupIndex === 0) {
                    if (record.locations !== undefined && record.locations !== null &&
                        !Array.isArray(record.locations)) {
                        throw new Error('Religion "' + (record.id || ri) + '" has malformed locations');
                    }
                    if (Array.isArray(record.locations) && record.locations.some(function(id) {
                        return Object.prototype.hasOwnProperty.call(toRemove, id);
                    })) religionReferencesForPreflight = true;
                } else if (Object.prototype.hasOwnProperty.call(toRemove, record.locationId)) {
                    religionReferencesForPreflight = true;
                }
            }
        });
        } catch (religionDataError) {
            return _fail('deletePlace: ' + (religionDataError.message || String(religionDataError)));
        }
        var religionPreflight = {
            success: true,
            data: { updatedReligionIds: [], removedAssociations: 0, worshipPlacesUnassigned: 0 }
        };
        if (window.ReligionCommands &&
            typeof window.ReligionCommands.reconcileDeletedLocations === 'function') {
            religionPreflight = window.ReligionCommands.reconcileDeletedLocations(
                Object.keys(toRemove),
                { dryRun: true }
            );
            if (!religionPreflight || religionPreflight.success !== true) {
                return _fail(
                    'deletePlace: Religion cleanup preflight failed: ' +
                    ((religionPreflight && religionPreflight.reason) || 'unknown error')
                );
            }
        } else if (religionReferencesForPreflight) {
            return _fail(
                'deletePlace: ReligionCommands.reconcileDeletedLocations is required ' +
                'to safely delete locations with religion associations'
            );
        }

        // Validate the Location graph before any other domain is mutated.
        // _removePlaces hydrates this same graph after cleanup; running the
        // read-only rebuild now moves malformed/corrupt Location failures to
        // the preflight phase instead of discovering them after other domains
        // have already reconciled their references.
        try {
            if (!LS || typeof LS.refresh !== 'function') {
                throw new Error('LocationState.refresh is required for deletion preflight');
            }
            LS.refresh();
        } catch (locationPreflightError) {
            return _fail(
                'deletePlace: Location state failed preflight: ' +
                (locationPreflightError && locationPreflightError.message
                    ? locationPreflightError.message
                    : String(locationPreflightError))
            );
        }

        // Character cleanup is planned without writes before any domain
        // mutation. The actual write is deferred until Government, Religion
        // and Culture have all accepted and applied their own reconciliation.
        var characterPreflight = _cleanupCharactersAtPlaces(toRemove, { dryRun: true });
        if (characterPreflight.failed > 0 || characterPreflight.status === 'unavailable') {
            return _fail(
                'deletePlace: character cleanup preflight failed: ' +
                (characterPreflight.reason || characterPreflight.failedIds.join(', ') || 'character data unavailable')
            );
        }

        // All seven owning domains participate in one synchronous transaction.
        // Every snapshot is captured before the first write; notifications are
        // withheld until all canonical stores have been updated successfully.
        if (!window.CrossDomainTransaction ||
            typeof window.CrossDomainTransaction.execute !== 'function') {
            return _fail('deletePlace: CrossDomainTransaction is required for atomic deletion');
        }

        var locationIds = Object.keys(toRemove);
        var transactionContext = {
            placeId: placeId,
            mode: mode,
            locationIds: locationIds,
            removeSet: toRemove
        };
        var snapshots = null;
        var cultureTransactionEnabled = !!(window.CultureCommands &&
            typeof window.CultureCommands.reconcileDeletedLocations === 'function');
        var outcomes = {
            government: { removedDepartmentIds: [] },
            religion: { updatedReligionIds: [], removedAssociations: 0, worshipPlacesUnassigned: 0 },
            culture: { updatedCultureIds: [], removedAssociations: 0 },
            character: { reconciled: 0, failed: 0, failedIds: [] },
            household: { status: 'skipped', clearedCount: 0, households: [], perPlace: [] },
            settlement: { removedLocationIds: [], event: null },
            removed: []
        };
        var participant = {
            name: 'location-deletion-cascade',
            prepare: function () {
                var required = [
                    [window.GovernmentState, '_transactionSnapshotDeletedLocations', '_transactionRestoreDeletedLocations'],
                    [window.ReligionState, '_transactionSnapshotDeletedLocations', '_transactionRestoreDeletedLocations'],
                    [window.CharacterState, '_transactionSnapshotDeletedLocations', '_transactionRestoreDeletedLocations'],
                    [window.HouseholdState, '_transactionSnapshotDeletedLocations', '_transactionRestoreDeletedLocations'],
                    [window.SettlementState, '_transactionSnapshotDeletedLocations', '_transactionRestoreDeletedLocations'],
                    [LS, '_transactionSnapshotDeletedLocations', '_transactionRestoreDeletedLocations']
                ];
                for (var ri = 0; ri < required.length; ri++) {
                    if (!required[ri][0] ||
                        typeof required[ri][0][required[ri][1]] !== 'function' ||
                        typeof required[ri][0][required[ri][2]] !== 'function') {
                        return { success: false, reason: 'A required domain transaction adapter is unavailable at index ' + ri };
                    }
                }
                if (cultureTransactionEnabled &&
                    (!window.CultureState ||
                     typeof window.CultureState._transactionSnapshotDeletedLocations !== 'function' ||
                     typeof window.CultureState._transactionRestoreDeletedLocations !== 'function')) {
                    return { success: false, reason: 'Culture transaction adapters are unavailable.' };
                }
                if (!window.GovernmentCommands ||
                    typeof window.GovernmentCommands.reconcileDeletedLocations !== 'function' ||
                    !window.ReligionCommands ||
                    typeof window.ReligionCommands.reconcileDeletedLocations !== 'function' ||
                    !window.HouseholdCommands ||
                    typeof window.HouseholdCommands.clearLocationReferencesMany !== 'function' ||
                    !window.SettlementCommandCommit ||
                    typeof window.SettlementCommandCommit.removeMany !== 'function') {
                    return { success: false, reason: 'A required domain cleanup command is unavailable.' };
                }
                return true;
            },
            snapshot: function () {
                snapshots = {
                    government: window.GovernmentState._transactionSnapshotDeletedLocations(),
                    religion: window.ReligionState._transactionSnapshotDeletedLocations(),
                    culture: cultureTransactionEnabled
                        ? window.CultureState._transactionSnapshotDeletedLocations()
                        : null,
                    character: window.CharacterState._transactionSnapshotDeletedLocations(),
                    household: window.HouseholdState._transactionSnapshotDeletedLocations(),
                    settlement: window.SettlementState._transactionSnapshotDeletedLocations(),
                    location: LS._transactionSnapshotDeletedLocations()
                };
                return snapshots;
            },
            apply: function () {
                var result = window.GovernmentCommands.reconcileDeletedLocations(
                    locationIds, { deferCommit: true }
                );
                if (!result || result.success !== true) throw new Error('Government cleanup failed: ' + ((result && result.reason) || 'unknown error'));
                outcomes.government = result.data || outcomes.government;

                result = window.ReligionCommands.reconcileDeletedLocations(
                    locationIds, { deferCommit: true }
                );
                if (!result || result.success !== true) throw new Error('Religion cleanup failed: ' + ((result && result.reason) || 'unknown error'));
                outcomes.religion = result.data || outcomes.religion;

                if (cultureTransactionEnabled) {
                    result = window.CultureCommands.reconcileDeletedLocations(
                        locationIds, { deferCommit: true }
                    );
                    if (!result || result.success !== true) throw new Error('Culture cleanup failed: ' + ((result && result.reason) || 'unknown error'));
                    outcomes.culture = result.data || outcomes.culture;
                }

                outcomes.character = _cleanupCharactersAtPlaces(toRemove, { deferCommit: true });
                if (outcomes.character.failed > 0 || outcomes.character.status === 'unavailable') {
                    throw new Error('Character cleanup failed: ' + (outcomes.character.reason || outcomes.character.failedIds.join(', ') || 'unknown error'));
                }

                outcomes.household = _cleanupHouseholdsAtPlaces(toRemove, { deferCommit: true });
                if (outcomes.household.status === 'failed' || outcomes.household.status === 'unavailable') {
                    throw new Error('Household cleanup failed: ' + (outcomes.household.reason || 'unknown error'));
                }

                var settlementStore = window.masterData.data.settlementData;
                var settlementIds = locationIds.filter(function (id) {
                    return settlementStore &&
                        Object.prototype.hasOwnProperty.call(settlementStore, id) &&
                        !!settlementStore[id];
                });
                if (settlementIds.length > 0) {
                    outcomes.settlement = window.SettlementCommandCommit.removeMany(
                        settlementIds,
                        {
                            type: 'settlementsRemovedWithLocations',
                            cause: 'locationDeleted',
                            placeId: placeId,
                            mode: mode
                        },
                        { persist: false, publish: false }
                    );
                }

                outcomes.removed = LS._removePlaces(locationIds);
                return true;
            },
            rollback: function () {
                if (!snapshots) return { success: false, reason: 'Transaction snapshots are unavailable.' };
                var failures = [];
                var restoreOrder = [
                    [LS, snapshots.location],
                    [window.SettlementState, snapshots.settlement],
                    [window.HouseholdState, snapshots.household],
                    [window.CharacterState, snapshots.character]
                ];
                if (cultureTransactionEnabled) {
                    restoreOrder.push([window.CultureState, snapshots.culture]);
                }
                restoreOrder.push(
                    [window.ReligionState, snapshots.religion],
                    [window.GovernmentState, snapshots.government]
                );
                restoreOrder.forEach(function (entry) {
                    try {
                        var restored = entry[0]._transactionRestoreDeletedLocations(entry[1]);
                        if (!restored || restored.success !== true) failures.push(restored && restored.reason ? restored.reason : 'Domain restore failed');
                    } catch (error) {
                        failures.push(error && error.message ? error.message : String(error));
                    }
                });
                // Deferred change/event queues are outside the canonical snapshots.
                // Discard them explicitly so a failed deletion cannot publish stale
                // notifications during a later, unrelated transaction.
                if (window.CharacterState && window.CharacterState._transactionDiscardChanges) {
                    window.CharacterState._transactionDiscardChanges();
                }
                if (window.HouseholdCommands && window.HouseholdCommands._transactionDiscardSideEffects) {
                    window.HouseholdCommands._transactionDiscardSideEffects();
                }
                if (window.ReligionCommands && window.ReligionCommands._transactionDiscardEvents) {
                    window.ReligionCommands._transactionDiscardEvents();
                }
                return failures.length
                    ? { success: false, reason: failures.join('; ') }
                    : { success: true };
            },
            afterCommit: function () {
                if (outcomes.government.removedDepartmentIds.length && window.GovernmentState) {
                    window.GovernmentState.publish('governmentDepartmentsReconciled', {
                        departmentIds: outcomes.government.removedDepartmentIds,
                        reason: 'location_deleted'
                    });
                }
                if ((outcomes.religion.updatedReligionIds.length || outcomes.religion.worshipPlacesUnassigned) && window.ReligionState) {
                    window.ReligionState.publish('religionLocationsReconciled', {
                        locationIds: locationIds.slice(),
                        religionIds: outcomes.religion.updatedReligionIds,
                        removedAssociations: outcomes.religion.removedAssociations,
                        worshipPlacesUnassigned: outcomes.religion.worshipPlacesUnassigned
                    });
                }
                if (cultureTransactionEnabled && outcomes.culture.updatedCultureIds.length && window.CultureState) {
                    window.CultureState.publish('cultureLocationsReconciled', {
                        locationIds: locationIds.slice(),
                        updatedCultureIds: outcomes.culture.updatedCultureIds,
                        removedAssociations: outcomes.culture.removedAssociations
                    });
                }
                if (window.CharacterState &&
                    typeof window.CharacterState._transactionFlushChanges === 'function') {
                    window.CharacterState._transactionFlushChanges();
                }
                if (outcomes.household.status === 'applied' && window.HouseholdCommands) {
                    if (typeof window.HouseholdCommands._transactionFlushSideEffects === 'function') {
                        window.HouseholdCommands._transactionFlushSideEffects();
                    }
                    var householdCommit = window.HouseholdCommands.commitTransactionLocationCleanup(
                        locationIds, outcomes.household
                    );
                    if (!householdCommit || householdCommit.success !== true) {
                        throw new Error(householdCommit && householdCommit.reason
                            ? householdCommit.reason
                            : 'Household location cleanup notification failed.');
                    }
                }
                if (outcomes.settlement.event && window.SettlementState) {
                    window.SettlementState.publish(outcomes.settlement.event);
                }
                window.markDataDirty();
                _commit('placeDeleted', {
                    placeId: placeId,
                    mode: mode,
                    removedCount: outcomes.removed.length,
                    settlementsRemoved: outcomes.settlement.removedLocationIds.length,
                    governmentDepartmentsRemoved: outcomes.government.removedDepartmentIds.length,
                    religionAssociationsRemoved: outcomes.religion.removedAssociations,
                    cultureAssociationsRemoved: outcomes.culture.removedAssociations,
                    characterReconciled: outcomes.character.reconciled,
                    characterFailed: outcomes.character.failed,
                    householdCleared: outcomes.household.clearedCount,
                    householdStatus: outcomes.household.status
                });
            }
        };

        var transactionResult = window.CrossDomainTransaction.execute({
            context: transactionContext,
            // Persistence is part of the transaction boundary. If this fails,
            // the coordinator must restore every domain snapshot before any
            // afterCommit notification is published.
            persist: function () {
                return persist();
            },
            participants: [participant]
        });
        if (!transactionResult || transactionResult.success !== true) {
            return _fail(
                'deletePlace: cross-domain transaction failed (' +
                ((transactionResult && transactionResult.code) || 'UNKNOWN') + '): ' +
                ((transactionResult && transactionResult.reason) || 'unknown error') +
                (transactionResult && transactionResult.rollbackErrors && transactionResult.rollbackErrors.length
                    ? '; rollback errors: ' + transactionResult.rollbackErrors.map(function (item) { return item.reason; }).join('; ')
                    : '')
            );
        }

        return _ok({
            placeId: placeId,
            mode: mode,
            removedCount: outcomes.removed.length,
            settlementsRemoved: outcomes.settlement.removedLocationIds.length,
            governmentDepartmentsRemoved: outcomes.government.removedDepartmentIds.length,
            religionAssociationsRemoved: outcomes.religion.removedAssociations,
            cultureAssociationsRemoved: outcomes.culture.removedAssociations,
            charactersReconciled: outcomes.character.reconciled,
            charactersFailed: outcomes.character.failed,
            charactersFailedIds: outcomes.character.failedIds,
            householdReconciliation: outcomes.household,
            transactionId: transactionResult.transactionId,
            notificationErrors: transactionResult.notificationErrors || []
        });
    }

    // =========================================================================
    // 9a. CHARACTER CLEANUP ON PLACE DELETE
    // =========================================================================
    //
    // See CHARACTER CLEANUP and CHARACTER CLEANUP SEMANTIC RESOLUTION in
    // the module header. Two passes per character:
    //
    //   1. currentLocationId: cleared when the character's RESOLVED
    //      current location is being removed. Resolution goes through
    //      World.getCurrentLocationId (semantic) with
    //      CharacterQueries.getCurrentLocationId (raw field) as the
    //      fallback. Prior revisions read only the raw field, missing
    //      characters placed only by a move record.
    //
    //   2. moves: any entry whose locationId points at a place being
    //      removed is dropped. Prior revisions left these in place,
    //      causing World.getCurrentLocationId to return a dangling id
    //      after the delete, and downstream consumers (religion,
    //      culture, population) to read stale references.
    //
    // Both updates are batched through CharacterCommands.updateCharacters
    // when available. See CHARACTER CLEANUP BATCH SEMANTICS in the header.

    /**
     * Resolve a character's current location. Precedence:
     *   1. World.getCurrentLocationId(character) — semantic
     *   2. CharacterQueries.getCurrentLocationId(character.id) — raw field
     *   3. null
     *
     * Matches the resolution pattern used by religion-queries.js and
     * culture-queries.js (see their LOCATION-RESOLUTION CONTRACT sections).
     * Do NOT use window.getCurrentLocationId directly: the name is
     * overloaded (character-queries.js takes an id, world.js takes a
     * character object), and the winner depends on load order.
     *
     * @private
     * @param {Object} character
     * @returns {string|null}
     */
    function _resolveCurrentLocationId(character) {
        if (!character || !character.id) return null;

        if (typeof window.getCurrentLocationId === 'function') {
            try {
                var resolved = window.getCurrentLocationId(character);
                // World.getCurrentLocationId returns string|null. A null
                // result is a legitimate "no location resolved" — do not
                // fall through to the weaker resolver, which would
                // silently substitute the raw field for a character
                // whose only location signal was a stale move pointing
                // at a deleted place.
                if (resolved === null) return null;
                if (typeof resolved === 'string' && resolved.length > 0) {
                    return resolved;
                }
            } catch (e) {
                // fall through to CharacterQueries
            }
        }

        if (typeof CQ.getCurrentLocationId === 'function') {
            try {
                return CQ.getCurrentLocationId(character.id);
            } catch (e) {
                return null;
            }
        }

        return null;
    }

    /**
     * Character cleanup on place delete.
     *
     * For every character:
     *   - whose RESOLVED current location is in `removeSet` → clears
     *     currentLocationId.
     *   - whose moves array contains any entry pointing at a place in
     *     `removeSet` → drops the stale move entries.
     *
     * The two updates are independent: a character may need only one,
     * or both. When both apply, they are combined into a single updates
     * object so the batch sends one update per character.
     *
     * Returns { reconciled, failed, failedIds, status?, reason? }. Does not throw.
     * Query failure is explicit and fail-closed; it is never treated as an
     * empty Character collection.
     *
     * @private
     * @param {Object} removeSet - id -> true
     * @returns {{ reconciled: number, failed: number, failedIds: string[] }}
     */
    function _cleanupCharactersAtPlaces(removeSet, options) {
        options = options || {};
        var reconciled = 0;
        var failed = 0;
        var failedIds = [];

        var allCharacters;
        try {
            allCharacters = CQ.getAllCharacters();
        } catch (e) {
            return {
                reconciled: 0,
                failed: 1,
                failedIds: [],
                status: 'unavailable',
                reason: e && e.message ? e.message : 'Character query failed'
            };
        }
        if (!Array.isArray(allCharacters)) {
            return {
                reconciled: 0,
                failed: 1,
                failedIds: [],
                status: 'unavailable',
                reason: 'CharacterQueries.getAllCharacters did not return an array'
            };
        }

        // Collect the characters that need cleanup. Pure read pass —
        // no mutation, no commits, no invalidations.
        var changes = [];
        try {
        for (var i = 0; i < allCharacters.length; i++) {
            var c = allCharacters[i];
            if (!c || !c.id) continue;

            var updates = null;

            // Clear both live residence and birthplace references before
            // deleting the Location records. Birthplace is a character-owned
            // foreign key just like currentLocationId.
            var locId = _resolveCurrentLocationId(c);
            if (locId && removeSet[locId]) {
                updates = updates || {};
                updates.currentLocationId = null;
            }
            if (c.birthplaceId && removeSet[c.birthplaceId]) {
                updates = updates || {};
                updates.birthplaceId = null;
            }

            // Drop moves whose destination is deleted. If only the origin is
            // deleted, preserve the historical move and its captured name,
            // but remove the now-dangling origin ID.
            var moves = Array.isArray(c.moves) ? c.moves : [];
            var hasStaleMoves = false;
            for (var m = 0; m < moves.length; m++) {
                if (!moves[m] || typeof moves[m] !== 'object') continue;
                if ((_validId(moves[m].locationId) && removeSet[moves[m].locationId]) ||
                    (_validId(moves[m].fromLocationId) && removeSet[moves[m].fromLocationId])) {
                    hasStaleMoves = true;
                    break;
                }
            }
            if (hasStaleMoves) {
                var cleanedMoves = [];
                for (var n = 0; n < moves.length; n++) {
                    if (!moves[n] || typeof moves[n] !== 'object') continue;
                    if (_validId(moves[n].locationId) && removeSet[moves[n].locationId]) {
                        continue;
                    }
                    if (_validId(moves[n].fromLocationId) && removeSet[moves[n].fromLocationId]) {
                        var preservedMove = Object.assign({}, moves[n]);
                        preservedMove.fromLocationId = null;
                        cleanedMoves.push(preservedMove);
                    } else {
                        cleanedMoves.push(moves[n]);
                    }
                }
                updates = updates || {};
                updates.moves = cleanedMoves;
            }

            if (updates) {
                changes.push({
                    id: c.id,
                    updates: updates
                });
            }
        }
        } catch (planningError) {
            return {
                reconciled: 0,
                failed: 1,
                failedIds: [],
                status: 'unavailable',
                reason: planningError && planningError.message
                    ? planningError.message
                    : 'Character cleanup planning failed'
            };
        }

        if (changes.length === 0) {
            return { reconciled: 0, failed: 0, failedIds: [], status: 'planned' };
        }

        if (options.dryRun === true) {
            return {
                reconciled: 0,
                failed: 0,
                failedIds: [],
                status: 'planned',
                plannedCount: changes.length
            };
        }

        // A per-record fallback can partially commit before a later record
        // fails. Location deletion requires the atomic Character batch API.
        if (!_hasBatchCharacterUpdate) {
            return {
                reconciled: 0,
                failed: changes.length,
                failedIds: changes.map(function(change) { return change.id; }),
                status: 'unavailable',
                reason: 'CharacterCommands.updateCharacters is required for atomic Location cleanup'
            };
        }

        // Batched path: one all-or-nothing write for the whole sweep.
        if (_hasBatchCharacterUpdate) {
            var batchResult;
            try {
                batchResult = CC.updateCharacters(changes, { deferCommit: options.deferCommit === true });
            } catch (e) {
                batchResult = {
                    success: false,
                    reason: e && e.message ? e.message : 'updateCharacters threw'
                };
            }

            if (batchResult && batchResult.success === true) {
                return {
                    reconciled: changes.length,
                    failed: 0,
                    failedIds: [],
                    characterIds: changes.map(function(change) { return change.id; })
                };
            }

            // Batch refused. Report the whole batch as failed. The caller
            // already treats failed > 0 as "surface the failure, don't
            // refuse the delete," so the outcome is unchanged.
            failed = changes.length;
            for (var f = 0; f < changes.length; f++) {
                failedIds.push(changes[f].id);
            }
            return { reconciled: 0, failed: failed, failedIds: failedIds };
        }

    }

    /**
     * Household cleanup on place delete. See HOUSEHOLD RECONCILIATION
     * in the module header for the full design.
     *
     * @private
     * @param {Object} removeSet - id -> true
     * @returns {{ status: string, clearedCount: number, households: Array,
     *             reason?: string, perPlace: Array }}
     */
    function _cleanupHouseholdsAtPlaces(removeSet, options) {
        options = options || {};
        var HC = _householdCommands();
        var removedIds = Object.keys(removeSet);

        if (removedIds.length === 0) {
            return {
                status: 'skipped',
                clearedCount: 0,
                households: [],
                perPlace: []
            };
        }

        if (!HC || typeof HC.clearLocationReferencesMany !== 'function') {
            return {
                status: 'unavailable',
                clearedCount: 0,
                households: [],
                reason: 'HouseholdCommands.clearLocationReferencesMany is not available',
                perPlace: []
            };
        }

        var result;
        try {
            result = HC.clearLocationReferencesMany(removedIds, { deferCommit: options.deferCommit === true });
        } catch (e) {
            result = {
                success: false,
                reason: e && e.message ? e.message : 'clearLocationReferencesMany threw'
            };
        }

        if (!result || result.success !== true) {
            return {
                status: 'failed',
                clearedCount: 0,
                households: [],
                reason: result && result.reason
                    ? result.reason
                    : 'clearLocationReferencesMany returned failure',
                perPlace: removedIds.map(function(placeId) {
                    return { placeId: placeId, status: 'not-applied' };
                })
            };
        }

        var data = result.data || {};
        return {
            status: 'applied',
            clearedCount: typeof data.clearedCount === 'number' ? data.clearedCount : 0,
            households: Array.isArray(data.households) ? data.households : [],
            perPlace: removedIds.map(function(placeId) {
                return { placeId: placeId, status: 'included-in-batch' };
            })
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
            !Number.isInteger(input.priority) ||
            input.priority < 1 || input.priority > 5) {
            return _fail('createLocationType: priority must be 1..5');
        }

        if (input.icon !== undefined && input.icon !== null &&
            typeof input.icon !== 'string') {
            return _fail('createLocationType: icon must be a string or null');
        }
        if (input.description !== undefined && input.description !== null &&
            typeof input.description !== 'string') {
            return _fail('createLocationType: description must be a string or null');
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
                !Number.isInteger(updates.priority) ||
                updates.priority < 1 || updates.priority > 5) {
                return _fail('updateLocationType: priority must be 1..5');
            }
            if (!_SETTLEMENT_LOCATION_PRIORITIES[updates.priority]) {
                var settlementStoreForType = _getSettlementStoreForLocationGuard();
                if (!settlementStoreForType) {
                    return _fail(
                        'updateLocationType: cannot verify settlement ' +
                        'compatibility; settlementData is unavailable'
                    );
                }
                if (_hasSettlementUsingLocationType(
                    LS._getPlacesByTypeIdCanonical(typeId),
                    settlementStoreForType
                )) {
                    return _fail(
                        'updateLocationType: this type is used by one or more ' +
                        'settlements; its priority must remain 4 or 5'
                    );
                }
            }
            if (updates.priority !== type.priority) {
                var priorityCheck = LH.validateLocationTypePriority(
                    typeId,
                    updates.priority
                );
                if (!priorityCheck.valid) {
                    return _fail(
                        'updateLocationType: ' + priorityCheck.reason
                    );
                }
            }
        }
        if (updates.displayName !== undefined && !_validString(updates.displayName)) {
            return _fail('updateLocationType: displayName cannot be empty');
        }
        if (updates.icon !== undefined && updates.icon !== null &&
            typeof updates.icon !== 'string') {
            return _fail('updateLocationType: icon must be a string or null');
        }
        if (updates.description !== undefined && updates.description !== null &&
            typeof updates.description !== 'string') {
            return _fail('updateLocationType: description must be a string or null');
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

        // Ranks may restrict eligibility to a Location Type. Removing the
        // type while a rank references it would silently invalidate rank policy.
        var rankStore = window.masterData && window.masterData.data
            ? window.masterData.data.ranks
            : [];
        if (rankStore != null && !Array.isArray(rankStore)) {
            return _fail('deleteLocationType: cannot verify Rank references because the rank store is malformed');
        }
        var rankReferences = [];
        for (var rankIndex = 0; rankIndex < (rankStore || []).length; rankIndex++) {
            var rankRecord = rankStore[rankIndex];
            if (!rankRecord || typeof rankRecord !== 'object') {
                return _fail('deleteLocationType: cannot verify Rank references because a rank record is malformed at index ' + rankIndex);
            }
            if (rankRecord.locationTypeId === typeId) {
                rankReferences.push(rankRecord.id || ('index ' + rankIndex));
            }
        }
        if (rankReferences.length > 0) {
            return _fail(
                'deleteLocationType: ' + rankReferences.length +
                ' rank(s) still restrict eligibility to this type: ' +
                rankReferences.join(', ')
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

        var charResult = CC.updateCharacterFields(prep.characterId, {
            moves: prep.nextMoves,
            currentLocationId: prep.locationId
        });
        if (!charResult || charResult.success !== true) {
            return _fail('recordMove: ' +
                (charResult && charResult.reason
                    ? charResult.reason
                    : 'character move write failed'));
        }

        window.markDataDirty();
        _commit('moveRecorded', {
            characterId: prep.characterId,
            locationId: prep.locationId
        });

        return _ok({
            characterId: prep.characterId,
            locationId: prep.locationId,
            year: prep.year
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
        if (typeof window.isValidYear !== 'function' ||
            window.isValidYear(year) !== true) {
            return _fail('year must be a valid world year');
        }
        if (options.note !== undefined && options.note !== null &&
            typeof options.note !== 'string') {
            return _fail('note must be a string or null');
        }
        if (options.fromLocationId !== undefined && options.fromLocationId !== null &&
            options.fromLocationId !== '' && !_validId(options.fromLocationId)) {
            return _fail('fromLocationId must be a non-empty string or null');
        }

        var isBirthMove = options.isBirthMove === true;
        var fromLocationId = options.fromLocationId || null;
        if (!isBirthMove && options.fromLocationId === undefined) {
            fromLocationId = _resolveCurrentLocationId(character);
        }
        if (fromLocationId && !LS._getPlaceCanonical(fromLocationId)) {
            return _fail('fromLocationId not found: ' + fromLocationId);
        }
        var moveData = {
            year: year,
            locationId: locationId,
            locationName: place.displayName,
            note: options.note || null,
            fromLocationId: fromLocationId,
            fromLocationName: null,
            isBirthMove: isBirthMove,
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

            var charResult = CC.updateCharacterFields(prep.characterId, {
                moves: prep.nextMoves,
                currentLocationId: prep.locationId
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

            touchedCharacters[prep.characterId] = true;
            succeededList.push({
                characterId: prep.characterId,
                locationId: prep.locationId,
                year: prep.year
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

        return _ok({
            succeededList: succeededList,
            failed: failed,
            total: moves.length,
            succeeded: succeededList.length,
            failedCount: failed.length
        });
    }

    // =========================================================================
    // 11a. MOVE EDIT AND DELETE (Location tab)
    // =========================================================================
    //
    // updateMove / deleteMove operate on character.moves, which is
    // character-owned. Writes route through CharacterCommands.
    // updateCharacterFields (the character-owned write boundary), same
    // as recordMove and bulkRecordMoves.
    //
    // Derived-field policy:
    //   locationName / fromLocationName are ALWAYS recomputed from
    //   locationId / fromLocationId after the patch is applied. A
    //   caller-supplied locationName in the patch is overwritten,
    //   because the display name must match the id.
    //
    // Move shape (matches _prepareMove):
    //   { year, locationId, locationName, note,
    //     fromLocationId, fromLocationName, isBirthMove, timestamp }

    function _latestMoveIndex(moves) {
        var bestIndex = -1;
        var bestYear = -Infinity;
        if (!Array.isArray(moves)) return -1;
        for (var i = 0; i < moves.length; i++) {
            var move = moves[i];
            if (!move || typeof move !== 'object' ||
                !_validId(move.locationId) ||
                typeof window.isValidYear !== 'function' ||
                window.isValidYear(move.year) !== true) continue;
            if (move.year > bestYear) {
                bestYear = move.year;
                bestIndex = i;
            }
        }
        return bestIndex;
    }

    function updateMove(characterId, moveIndex, patch) {
        if (!_validId(characterId)) {
            return _fail('updateMove: characterId is required');
        }
        if (typeof moveIndex !== 'number'
            || !Number.isInteger(moveIndex)
            || moveIndex < 0) {
            return _fail('updateMove: moveIndex must be a non-negative integer');
        }
        if (!_plainObject(patch)) {
            return _fail('updateMove: patch must be a plain object');
        }

        var character = CQ.getCharacterById(characterId);
        if (!character) {
            return _fail('updateMove: character not found');
        }

        var moves = Array.isArray(character.moves) ? character.moves : [];
        if (moveIndex >= moves.length) {
            return _fail('updateMove: move index out of range (' +
                moveIndex + ' of ' + moves.length + ')');
        }

        var current = moves[moveIndex];
        if (!current || typeof current !== 'object') {
            return _fail('updateMove: move at index ' + moveIndex + ' is malformed');
        }

        // Start from a defensive copy of the current move.
        var next = {
            year: current.year !== undefined ? current.year : null,
            locationId: current.locationId !== undefined ? current.locationId : null,
            locationName: current.locationName !== undefined ? current.locationName : null,
            note: current.note !== undefined ? current.note : null,
            fromLocationId: current.fromLocationId !== undefined ? current.fromLocationId : null,
            fromLocationName: current.fromLocationName !== undefined ? current.fromLocationName : null,
            isBirthMove: current.isBirthMove === true,
            timestamp: current.timestamp !== undefined ? current.timestamp : null
        };

        // Apply patch — whitelist only the fields that are not derived.
        var locationIdChanged = false;
        var fromLocationIdChanged = false;

        if (Object.prototype.hasOwnProperty.call(patch, 'year')) {
            if (patch.year !== null
                && (typeof patch.year !== 'number'
                    || !window.isValidYear(patch.year))) {
                return _fail('updateMove: year must be a valid world year or null');
            }
            next.year = patch.year;
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'locationId')) {
            if (!_validId(patch.locationId)) {
                return _fail('updateMove: locationId must be a non-empty string');
            }
            if (!LS._getPlaceCanonical(patch.locationId)) {
                return _fail('updateMove: location not found: ' + patch.locationId);
            }
            if (patch.locationId !== next.locationId) {
                next.locationId = patch.locationId;
                locationIdChanged = true;
            }
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'fromLocationId')) {
            if (patch.fromLocationId !== null && !_validId(patch.fromLocationId)) {
                return _fail('updateMove: fromLocationId must be a non-empty string or null');
            }
            if (patch.fromLocationId !== null
                && !LS._getPlaceCanonical(patch.fromLocationId)) {
                return _fail('updateMove: fromLocationId not found: ' + patch.fromLocationId);
            }
            if (patch.fromLocationId !== next.fromLocationId) {
                next.fromLocationId = patch.fromLocationId;
                fromLocationIdChanged = true;
            }
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'note')) {
            next.note = patch.note === null ? null : String(patch.note);
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'isBirthMove')) {
            next.isBirthMove = patch.isBirthMove === true;
        }

        // Derived-field resolution. locationName follows locationId;
        // fromLocationName follows fromLocationId. Only re-resolve when
        // the id changed — preserve the existing display name otherwise
        // (protects historical entries whose place was later renamed).
        if (locationIdChanged) {
            var place = LS._getPlaceCanonical(next.locationId);
            next.locationName = place ? place.displayName : null;
        }
        if (fromLocationIdChanged) {
            if (next.fromLocationId === null) {
                next.fromLocationName = null;
            } else {
                var fromPlace = LS._getPlaceCanonical(next.fromLocationId);
                next.fromLocationName = fromPlace ? fromPlace.displayName : null;
            }
        }

        var nextMoves = moves.slice();
        nextMoves[moveIndex] = next;

        var characterPatch = { moves: nextMoves };
        // currentLocationId takes precedence over move history. Keep it in
        // sync only when it still represents this latest recorded move.
        if (_latestMoveIndex(moves) === moveIndex &&
            character.currentLocationId === current.locationId) {
            var latestAfterEdit = _latestMoveIndex(nextMoves);
            characterPatch.currentLocationId = latestAfterEdit >= 0
                ? nextMoves[latestAfterEdit].locationId
                : (character.birthplaceId || null);
        }

        var charResult = CC.updateCharacterFields(characterId, characterPatch);
        if (!charResult || charResult.success !== true) {
            return _fail('updateMove: ' +
                (charResult && charResult.reason
                    ? charResult.reason
                    : 'character move write failed'));
        }

        window.markDataDirty();
        _commit('moveUpdated', {
            characterId: characterId,
            moveIndex: moveIndex,
            year: next.year,
            locationId: next.locationId
        });

        return _ok({
            characterId: characterId,
            moveIndex: moveIndex,
            year: next.year,
            locationId: next.locationId,
            move: next
        });
    }

    function deleteMove(characterId, moveIndex) {
        if (!_validId(characterId)) {
            return _fail('deleteMove: characterId is required');
        }
        if (typeof moveIndex !== 'number'
            || !Number.isInteger(moveIndex)
            || moveIndex < 0) {
            return _fail('deleteMove: moveIndex must be a non-negative integer');
        }

        var character = CQ.getCharacterById(characterId);
        if (!character) {
            return _fail('deleteMove: character not found');
        }

        var moves = Array.isArray(character.moves) ? character.moves : [];
        if (moveIndex >= moves.length) {
            return _fail('deleteMove: move index out of range (' +
                moveIndex + ' of ' + moves.length + ')');
        }

        var removed = moves[moveIndex];

        var nextMoves = moves.slice();
        nextMoves.splice(moveIndex, 1);

        var characterPatch = { moves: nextMoves };
        // Deleting the latest move must not leave an explicit current-location
        // override pointing at its former destination.
        if (_latestMoveIndex(moves) === moveIndex &&
            character.currentLocationId === (removed && removed.locationId)) {
            var latestAfterDelete = _latestMoveIndex(nextMoves);
            characterPatch.currentLocationId = latestAfterDelete >= 0
                ? nextMoves[latestAfterDelete].locationId
                : (character.birthplaceId || null);
        }

        var charResult = CC.updateCharacterFields(characterId, characterPatch);
        if (!charResult || charResult.success !== true) {
            return _fail('deleteMove: ' +
                (charResult && charResult.reason
                    ? charResult.reason
                    : 'character move write failed'));
        }

        window.markDataDirty();
        _commit('moveDeleted', {
            characterId: characterId,
            moveIndex: moveIndex,
            year: removed && removed.year !== undefined ? removed.year : null
        });

        return _ok({
            characterId: characterId,
            moveIndex: moveIndex,
            removed: removed
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
        if (governmentTypeId) {
            var governmentState = window.GovernmentState;
            if (!governmentState ||
                typeof governmentState.getGovernmentTypeById !== 'function') {
                return _fail(
                    'assignGovernment: GovernmentState is required to validate a government type'
                );
            }
            if (!governmentState.getGovernmentTypeById(governmentTypeId)) {
                return _fail('assignGovernment: government type not found: ' + governmentTypeId);
            }
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
        if (character.isDeceased === true) {
            return _fail('assignLeader: character is deceased');
        }
        if (character.isDeleted === true || character.deletedAt != null ||
            character.softDeleted === true) {
            return _fail('assignLeader: character is soft-deleted');
        }

        if (!Array.isArray(place.leaderAssignments)) {
            place.leaderAssignments = [];
        }

        var year = (startYear === undefined || startYear === null)
            ? window.getCurrentYear()
            : startYear;
        if (typeof window.isValidYear !== 'function' ||
            window.isValidYear(year) !== true) {
            return _fail('assignLeader: startYear must be a valid world year');
        }
        for (var validationIndex = 0; validationIndex < place.leaderAssignments.length; validationIndex++) {
            var existingLeader = place.leaderAssignments[validationIndex];
            if (existingLeader && existingLeader.isActive === true &&
                (existingLeader.endYear === null || existingLeader.endYear === undefined) &&
                year <= existingLeader.startYear) {
                return _fail('assignLeader: new leader term must start after the current term begins');
            }
        }
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
        if (typeof window.isValidYear !== 'function' ||
            window.isValidYear(year) !== true) {
            return _fail('endLeaderTerm: endYear must be a valid world year');
        }

        var found = false;
        var activeAssignment = null;
        for (var i = 0; i < place.leaderAssignments.length; i++) {
            var a = place.leaderAssignments[i];
            if (a.characterId === characterId && a.isActive &&
                (a.endYear === null || a.endYear === undefined)) {
                if (year <= a.startYear) {
                    return _fail('endLeaderTerm: endYear must be after the term start year');
                }
                activeAssignment = a;
                found = true;
                break;
            }
        }
        if (found) {
            activeAssignment.isActive = false;
            activeAssignment.endYear = year;
            if (place.leaderId === characterId) place.leaderId = null;
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

    /**
     * Ends every active leader assignment held by the character, across
     * every place, in one commit.
     *
     * This is the death-dispatch hook. See CROSS-DOMAIN LEADER CLEANUP
     * in the module header.
     *
     * @param {string} characterId
     * @param {number} year  The end year for every ended assignment.
     *                       Missing/invalid uses getCurrentYear().
     * @returns { success, affectedPlaceIds, unchanged? }
     */
    function handleCharacterDeath(characterId, year) {
        if (!_validId(characterId)) {
            return _fail('handleCharacterDeath: characterId is required.');
        }

        var endYear = (year === undefined || year === null)
            ? window.getCurrentYear()
            : year;
        if (typeof window.isValidYear !== 'function' ||
            window.isValidYear(endYear) !== true) {
            return _fail('handleCharacterDeath: year must be a valid world year.');
        }

        var placeIds = LS.getAllPlaceIds();
        var affectedPlaceIds = [];

        for (var i = 0; i < placeIds.length; i++) {
            var place = LS._getPlaceCanonical(placeIds[i]);
            if (!place) continue;
            if (!Array.isArray(place.leaderAssignments)) continue;

            var changed = false;
            for (var j = 0; j < place.leaderAssignments.length; j++) {
                var a = place.leaderAssignments[j];
                if (!a) continue;
                if (a.characterId !== characterId) continue;
                if (a.isActive !== true) continue;
                if (a.endYear !== null && a.endYear !== undefined) continue;

                a.isActive = false;
                a.endYear = endYear;
                changed = true;
            }

            if (changed) {
                // If the place's leaderId pointer references this
                // character, clear it so getCurrentLeader's fast-path
                // (via place.leaderId, if any consumer reads it) does
                // not return a stale pointer.
                if (place.leaderId === characterId) {
                    place.leaderId = null;
                }
                place.updatedAt = Date.now();
                affectedPlaceIds.push(place.id);
            }
        }

        if (affectedPlaceIds.length === 0) {
            return _ok({
                affectedPlaceIds: [],
                unchanged: true
            });
        }

        window.markDataDirty();
        _commit('leaderTermEndedByDeath', {
            characterId: characterId,
            endYear: endYear,
            placeIds: affectedPlaceIds
        });

        return _ok({
            affectedPlaceIds: affectedPlaceIds,
            unchanged: false
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
                typeof window.CultureQueries.getCultureById !== 'function') {
                return _fail(
                    'updatePlaceCulture: CultureQueries required to assign a culture'
                );
            }
            var culture = window.CultureQueries.getCultureById(cultureId);
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
        updateMove: updateMove,
        deleteMove: deleteMove,

        assignGovernment: assignGovernment,
        assignLeader: assignLeader,
        endLeaderTerm: endLeaderTerm,
        updatePlaceCulture: updatePlaceCulture,

        // Cross-domain death hook. Registered via registerDeathHandler
        // below. See CROSS-DOMAIN LEADER CLEANUP in the module header.
        handleCharacterDeath: handleCharacterDeath
    };

    // =========================================================================
    // 14. DEATH HANDLER REGISTRATION
    // =========================================================================
    //
    // Register handleCharacterDeath with character-lifecycle.js's death
    // dispatch. Under the documented load order, character-lifecycle.js
    // loads before this file, so registerDeathHandler is available.
    //
    // If a future load order changes, the registration is skipped with
    // a debug log and callers must wire handleCharacterDeath manually.
    //
    // Idempotent: if a caller also wires handleCharacterDeath from its
    // own death handler, the second call is a no-op (see the
    // "if (a.isActive !== true) continue" guard inside the function).

    if (typeof window.registerDeathHandler === 'function') {
        try {
            window.registerDeathHandler(function (characterId, info) {
                var year = info && typeof info.deathYear === 'number'
                    ? info.deathYear
                    : null;
                return handleCharacterDeath(characterId, year);
            });
        } catch (e) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    'location-commands: failed to register death handler:', e
                );
            }
        }
    } else if (typeof console !== 'undefined' && console.debug) {
        console.debug(
            'location-commands: window.registerDeathHandler not available; ' +
            'LocationCommands.handleCharacterDeath must be wired by the caller.'
        );
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.LocationCommands;
    }

})();
