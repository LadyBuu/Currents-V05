/**
 * =============================================================================
 * STILL WATERS - SETTLEMENT COMMAND COMMIT
 * js/settlement/settlement-command-commit.js
 * =============================================================================
 *
 * SHARED COMMIT SEQUENCE FOR SETTLEMENT COMMANDS.
 *
 * Every settlement command that mutates canonical settlement data follows
 * the same commit sequence, fixed by the contract:
 *
 *     1. write candidate to canonical store
 *     2. rebuild SettlementState indexes
 *     3. persist once (saveMasterData)
 *     4. publish once (SettlementState.publish)
 *
 * This module provides that sequence as a single function so that each
 * command does not re-implement it, and so that the order cannot drift
 * between command modules.
 *
 * It is a helper module, not a command. It does not validate. It does not
 * build candidates. It does not define commands. It does not implement
 * domain rules. It does not display UI. It does not fabricate values. It
 * does not use recursion guards.
 *
 * Contract reference: Settlement Architecture Contracts §12 (Command
 * Contract), §13 (Persistence Contract), §14 (Notification Contract),
 * §32 (Completion Standard).
 *
 * Design notes:
 *
 *   - The commit is synchronous. Settlement state is small, indexes rebuild
 *     quickly, saveMasterData is already the application's persistence
 *     primitive, and publish dispatches to subscribers synchronously.
 *
 *   - The canonical store is masterData.data.settlementData. Commands are
 *     the only writers. This module is the single place where that write
 *     actually happens, so the store key is defined once.
 *
 *   - saveMasterData is called exactly once per commit. Commands that
 *     change multiple canonical records in one logical transaction must
 *     still call commit once; the commit is the transaction boundary, not
 *     the individual write.
 *
 *   - rebuildIndexes is called before persist. If rebuild fails (it should
 *     not, but it could throw during a programming error), we want the
 *     failure to surface before the persisted state is written, so the
 *     persisted state remains consistent with the last successfully
 *     indexed state.
 *
 *   - publish is called after persist. Subscribers see an event that is
 *     already durable. This is deliberate: a subscriber that reacts by
 *     reloading a ViewModel reads the same canonical data that was just
 *     persisted.
 *
 *   - The function does not swallow errors. If persist throws, or if
 *     persist returns false, the error propagates to the caller. A
 *     command that wants to handle persistence failure does so explicitly
 *     at its call site, not by hiding the failure inside the commit
 *     helper.
 *
 * CANDIDATE-WRITE ORDERING:
 *   The candidate is written to the in-memory canonical store BEFORE
 *   persist runs. Sequence, step by step:
 *
 *     Step 1  store[locationId] = candidate   (in-memory write)
 *     Step 2  state.rebuildIndexes()          (in-memory index update)
 *     Step 3  saveMasterData()                (durable write)
 *     Step 4  state.publish(event)            (subscriber notification)
 *
 *   If step 3 fails, steps 1 and 2 have already happened. The in-memory
 *   canonical store holds the new candidate. SettlementState indexes
 *   point at it. But storage still holds the OLD record. Storage and
 *   memory are now out of sync.
 *
 *   Step 4 does NOT run: subscribers are not told the world changed.
 *
 *   This ordering is deliberate:
 *
 *   - Writing the candidate before persist lets rebuildIndexes run
 *     against the new state, which is the state the caller asked for.
 *     Rebuild-after-persist would require running rebuild twice on
 *     success (once to make the caller's in-flight reads coherent,
 *     once to make subscribers coherent) or would leave a window in
 *     which a read between write and rebuild saw an inconsistent
 *     index.
 *
 *   - Throwing on persist failure (rather than rolling back step 1)
 *     means the caller knows the write was not durable and is
 *     responsible for recovery. Rolling back would require cloning the
 *     previous record before every commit — expensive and error-prone,
 *     and the failure case is rare.
 *
 *   CONSEQUENCES FOR CALLERS:
 *
 *     On a persist throw, the caller MUST NOT treat the operation as
 *     failed-if-it-returned. The command reports an exception, but the
 *     in-memory state has moved. Correct recovery is one of:
 *
 *       - Reload from storage (reloadMasterData / forceReloadData).
 *         This re-installs the pre-failure record and rebuilds indexes.
 *
 *       - Retry the persist (via a subsequent commit or a direct
 *         saveMasterData call). This makes the in-memory state durable.
 *
 *       - Explicitly re-commit the previous candidate (via another
 *         commit call with the pre-failure record). This is the caller
 *         choosing to roll back.
 *
 *     A caller that catches the exception, logs it, and continues
 *     without doing one of these three will leave the tab in a state
 *     where its in-memory record and its storage record disagree. A
 *     subsequent cross-tab reload would silently revert the in-memory
 *     record to the pre-failure state — an unexpected outcome that
 *     looks like data loss.
 *
 *     Most callers (the annual processor, the modal command wrappers)
 *     let the throw propagate to a boundary that reports a toast and
 *     stops. That is acceptable for interactive flows because the tab
 *     is not advanced past the failure. Batch callers (the annual
 *     processor's processAllSettlementsAnnual) catch per-settlement
 *     failures and continue; the divengence applies to that specific
 *     settlement only, and the next successful save (from another
 *     settlement, or from a retry) rewrites the full store including
 *     the failed settlement's in-memory candidate — so the "ahead of
 *     storage" state heals on the next successful commit.
 *
 *   This is documented here because it is a design consequence, not an
 *   accident. A reader who sees "candidate is written, then persist is
 *   attempted" is right to ask what happens on failure, and the answer
 *   is above.
 *
 * PERSIST FAILURE CONTRACT:
 *
 *   saveMasterData() returns a boolean. It does NOT throw on write
 *   failure. The boolean MUST be inspected. On false, getLastSaveError()
 *   provides the underlying Error so the caller can surface the actual
 *   failure reason (quota exceeded, JSON serialization failure, storage
 *   disabled) rather than a generic message.
 *
 *   This matches Pattern A in storage.js's DOMAIN PERSIST CONTRACT:
 *
 *     var ok = window.saveMasterData();
 *     if (ok === true) { ... }
 *     var lastError = window.getLastSaveError();
 *     ...
 *
 *   Pattern C (the historical broken pattern that silently reported
 *   success on every failed save) MUST NOT be reintroduced. The current
 *   implementation of this module previously called saveMasterData()
 *   without inspecting the return — every settlement command reported
 *   success even when persistence failed. That is now fixed.
 *
 *   The failure is propagated as a thrown Error, not as a structured
 *   return value. Rationale:
 *
 *     - commit() is a low-level primitive. Its callers are commands, and
 *       every command already wraps its commit call in the command's own
 *       try/catch when it needs to convert an exception into a structured
 *       failure. Commands that do not wrap will propagate the exception
 *       to their own callers, which is the correct behavior for a
 *       persistence failure.
 *
 *     - Returning a structured result from commit() would tempt commands
 *       to treat "commit returned an object" as "commit succeeded."
 *       Throwing makes the failure impossible to miss.
 *
 *     - The published event is NOT dispatched when persistence fails.
 *       Subscribers must not be told the world changed when it was not
 *       durably written. The candidate was already written to the
 *       in-memory canonical store, so the in-memory state is
 *       inconsistent with storage until the next successful commit. See
 *       CANDIDATE-WRITE ORDERING above for the recovery contract.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Header CANDIDATE-WRITE ORDERING section added. Documents that
 *       the candidate is written to the in-memory store BEFORE persist
 *       runs, so on persist failure the in-memory state is ahead of
 *       storage until the caller reloads, retries, or re-commits the
 *       prior record. Correct-by-design; previously undocumented.
 *     - No behavioural change. The commit sequence, the persist
 *       inspection, and the throw-on-failure semantics are unchanged.
 *   Previous revision:
 *     - _saveMasterData() now inspects the boolean return from
 *       window.saveMasterData() and throws on false, using
 *       getLastSaveError() to surface the underlying failure reason.
 *       Prior revisions called saveMasterData() and ignored the return,
 *       which reintroduced the Pattern C bug documented in storage.js's
 *       DOMAIN PERSIST CONTRACT. Every settlement command silently
 *       reported success on every failed save; the annual processor's
 *       per-settlement history records were lost on quota failure with
 *       no signal.
 *     - Header PERSIST FAILURE CONTRACT section added, documenting the
 *       boolean-inspection pattern, the throw-on-failure decision, and
 *       the reason the published event is NOT dispatched after a failed
 *       persist.
 *     - The commit() function itself is unchanged in signature and
 *       return shape. The only observable difference is that it now
 *       throws when persist fails, instead of returning the published
 *       event as if everything succeeded.
 *   Previous revision:
 *     - Initial implementation.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCIES
    // =========================================================================

    function _getState() {
        return window.SettlementState;
    }

    function _getCanonicalStore() {
        if (!window.masterData || !window.masterData.data) {
            throw new Error(
                'SettlementCommandCommit: masterData not available. ' +
                'Cannot commit settlement state.'
            );
        }
        if (!window.masterData.data.settlementData) {
            window.masterData.data.settlementData = {};
        }
        return window.masterData.data.settlementData;
    }

    /**
     * Persists the current canonical state via window.saveMasterData().
     *
     * Inspects the boolean return value per Pattern A in storage.js's
     * DOMAIN PERSIST CONTRACT. On failure, reads getLastSaveError() to
     * surface the underlying reason and throws an Error.
     *
     * Does NOT return a boolean. Either the save succeeded (returns
     * normally) or it failed (throws).
     *
     * @private
     * @throws {Error} if saveMasterData is missing or returns false
     */
    function _saveMasterData() {
        if (typeof window.saveMasterData !== 'function') {
            throw new Error(
                'SettlementCommandCommit: saveMasterData is not available. ' +
                'Cannot persist settlement state.'
            );
        }

        var ok = window.saveMasterData();
        if (ok === true) return;

        var lastError = (typeof window.getLastSaveError === 'function')
            ? window.getLastSaveError()
            : null;

        var reason = (lastError && lastError.message)
            ? lastError.message
            : 'saveMasterData returned false';

        throw new Error(
            'SettlementCommandCommit: persist failed: ' + reason
        );
    }

    // =========================================================================
    // 2. COMMIT
    // =========================================================================
    //
    // commit(locationId, candidate, event)
    //
    //   locationId : string             the settlement being committed
    //   candidate  : Object             the new canonical record
    //   event      : Object             the event to publish
    //
    // The event must include at least { type }. It is augmented with
    // { locationId } before publication so subscribers can always route
    // by settlement without inspecting the payload type.
    //
    // Returns the event that was published, so callers can use the same
    // object shape for their own return value if they want.
    //
    // Throws if persistence fails. See PERSIST FAILURE CONTRACT and
    // CANDIDATE-WRITE ORDERING in the module header.
    //

    /**
     * @param {string} locationId
     * @param {Object} candidate
     * @param {Object} event
     * @returns {Object} the published event
     * @throws {Error} if saveMasterData is missing or returns false
     */
    function commit(locationId, candidate, event) {
        if (typeof locationId !== 'string' || locationId.length === 0) {
            throw new TypeError(
                'SettlementCommandCommit.commit: locationId must be a non-empty string'
            );
        }
        if (!candidate || typeof candidate !== 'object') {
            throw new TypeError(
                'SettlementCommandCommit.commit: candidate must be an object'
            );
        }
        if (!event || typeof event !== 'object' || typeof event.type !== 'string') {
            throw new TypeError(
                'SettlementCommandCommit.commit: event must be an object with a string type'
            );
        }

        // --- 1. Write candidate to canonical store ---
        // In-memory write happens BEFORE persist. See CANDIDATE-WRITE
        // ORDERING in the module header for the failure semantics.
        var store = _getCanonicalStore();
        store[locationId] = candidate;

        // --- 2. Rebuild indexes ---
        _getState().rebuildIndexes();

        // --- 3. Persist once ---
        // Throws on failure. The published event is NOT dispatched after a
        // failed persist; subscribers must not see a change that was not
        // durably written. The candidate has already been written to the
        // in-memory canonical store at this point, so the caller is
        // responsible for reloading or retrying after a thrown persist
        // error. See CANDIDATE-WRITE ORDERING in the module header.
        _saveMasterData();

        // --- 4. Publish once ---
        var publishedEvent = {
            type: event.type,
            locationId: locationId
        };

        // Copy additional event fields without overwriting the fixed ones.
        for (var key in event) {
            if (!Object.prototype.hasOwnProperty.call(event, key)) continue;
            if (key === 'type' || key === 'locationId') continue;
            publishedEvent[key] = event[key];
        }

        _getState().publish(publishedEvent);

        return publishedEvent;
    }

    // =========================================================================
    // 3. EXPORTS
    // =========================================================================

    window.SettlementCommandCommit = Object.freeze({
        commit: commit
    });

})();
