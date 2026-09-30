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
 *   - The function does not swallow errors. If persist throws, the error
 *     propagates to the caller. A command that wants to handle persistence
 *     failure does so explicitly at its call site, not by hiding the
 *     failure inside the commit helper.
 *
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

    function _saveMasterData() {
        if (typeof window.saveMasterData !== 'function') {
            throw new Error(
                'SettlementCommandCommit: saveMasterData is not available. ' +
                'Cannot persist settlement state.'
            );
        }
        window.saveMasterData();
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

    /**
     * @param {string} locationId
     * @param {Object} candidate
     * @param {Object} event
     * @returns {Object} the published event
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
        var store = _getCanonicalStore();
        store[locationId] = candidate;

        // --- 2. Rebuild indexes ---
        _getState().rebuildIndexes();

        // --- 3. Persist once ---
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
