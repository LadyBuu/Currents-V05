/**
 * =============================================================================
 * STILL WATERS - CHARACTER DELETION COMMANDS
 * (js/character/character-deletion-commands.js)
 * =============================================================================
 *
 * LOCATION: js/character/character-deletion-commands.js
 *
 * Deletion boundary for the character domain.
 *
 * SCOPE:
 *   - deleteCharacter(id)                hard delete + reference cleanup
 *   - softDeleteCharacter(id)            mark deleted, keep the record
 *   - restoreSoftDeletedCharacter(id)    clear the soft-delete flags
 *   - purgeSoftDeletedCharacters()       hard delete every soft-deleted record
 *   - bulkDeleteCharacters(ids, soft)    batch delete
 *   - getSoftDeletedCharacters()         read helper (colocated)
 *   - registerDeleteHandler(fn)          register a cross-domain delete hook
 *                                        (Phase 3.13b)
 *
 * OUT OF SCOPE:
 *   - Creation            -> character-creation-commands.js
 *   - Field updates       -> character-commands.js
 *   - Family graph cleanup details      -> family-commands.js (called here)
 *   - Children domain cleanup details   -> children-commands.js (called here)
 *   - Relationship cleanup              -> relationships/relationship-integration.js
 *                                          (called here, when loaded)
 *   - Household cleanup                 -> households/household-commands.js
 *                                          (called here, when loaded)
 *   - World leader cleanup              -> no WorldCommands module exists in
 *                                          the current tree; the cleanup entry
 *                                          is retained for the future domain
 *   - Rank cleanup                      -> ranks/rank-issues.js (called here)
 *   - Apprenticeship cleanup            -> apprenticeship/apprenticeship-commands.js
 *                                          (called here, when loaded)
 *   - Persistence                       -> character-state.js
 *   - Events / toasts                   -> caller
 *
 * HARD DELETE vs SOFT DELETE:
 *   Soft delete is orthogonal to life/death. A soft-deleted character is
 *   hidden from normal queries but remains in the canonical collection.
 *   Nothing else about the record changes. The character can be restored
 *   with restoreSoftDeletedCharacter.
 *
 *   Hard delete removes the record from the collection and dispatches a
 *   cleanup to every domain that owns a reference to a character. The
 *   cleanup pass runs AFTER removal. Each domain's cleanup function is
 *   called if the module is loaded. Missing modules do not block deletion;
 *   their references are simply not cleaned. The response records which
 *   domains participated, which were skipped (module or method not
 *   present), and which failed.
 *
 * SOFT-DELETE FIELD OWNERSHIP:
 *   isDeleted and deletedAt are domain-owned fields (they are listed in
 *   CharacterCommands._DOMAIN_OWNED_FIELDS and are NOT in
 *   CharacterState._CHARACTER_OWNED_FIELDS). The generic
 *   CharacterState.updateCharacter path refuses them; this command writes
 *   them via CharacterState.applyDomainFieldPatch.
 *
 * CLEANUP CONTRACT:
 *   Each cross-domain module may expose a cleanup function with a
 *   documented name. This command calls the following if present:
 *
 *     FamilyCommands.removeAllReferencesTo(id)
 *     ChildrenCommands.removeAllReferencesTo(id)
 *     RelationshipIntegrations.removeAllReferencesTo(id)
 *     HouseholdCommands.removeCharacterReferences(id)
 *     RankIssues.removeAllReferencesTo(id)
 *     ApprenticeshipCommands.removeAllReferencesTo(id)
 *
 *   Each is called only if the module and the method exist. The
 *   returned `cleanup` report per character contains three arrays:
 *     applied  — domains whose cleanup ran without a reported failure
 *     skipped  — domains where the module or method was absent
 *     failed   — domains whose cleanup returned failure or threw
 *
 *   The report is informational. Deletion succeeds regardless of cleanup
 *   outcome. A failing cleanup means the domain's own data still
 *   references a now-deleted character id; that is a bug in the domain,
 *   not a reason to refuse the delete.
 *
 * DELETE HANDLER HOOK (Phase 3.13b):
 *   The named cleanup table above only reaches the domains whose
 *   modules load before this file. Under the documented load order,
 *   that means FamilyCommands, ChildrenCommands, RankIssues, and
 *   HouseholdCommands — but NOT RelationshipIntegrations and NOT
 *   ApprenticeshipCommands (both of which load after
 *   character-deletion-commands.js).
 *
 *   To close that gap, this module exposes registerDeleteHandler(fn).
 *   Any module that loads after this file may register a handler.
 *   Every hard delete invokes every registered handler exactly once,
 *   after the death of the record and after the named cleanup table
 *   has run.
 *
 *   RelationshipIntegrations registers itself at load time (see
 *   relationship-integrations.js's REGISTRATION HOOKS section).
 *
 *   Handler contract:
 *     fn(characterId) -> any
 *   The return value is ignored. Exceptions are caught and logged. A
 *   throwing handler does not prevent subsequent handlers from
 *   running, and does not propagate out of the deletion.
 *
 *   The handler registration is additive with the named cleanup
 *   table: a domain that registers via the hook AND is present in the
 *   named table will be called twice on the same delete. That is safe
 *   because the command layer is idempotent per character id —
 *   removeAllReferencesTo refuses nothing (it silently skips records
 *   that no longer reference the character) and the second call is a
 *   no-op.
 *
 *   Registration returns an unregister function. Callers who need to
 *   tear down (test harnesses, hot reload) should call it. In a
 *   normal browser session nothing calls unregister; the handler
 *   lives for the lifetime of the page.
 *
 * NAMING NOTE:
 *   The relationship domain's cross-domain hook is exported by
 *   js/relationships/relationship-integration.js under the namespace
 *   "RelationshipIntegrations" (PLURAL). This is verified at line 505 of
 *   that file: `window.RelationshipIntegrations = { ... }`.
 *
 *   Earlier revisions of this file referenced the singular form, which
 *   does not exist in the tree and silently skipped relationship cleanup
 *   on every deletion. The plural form is correct.
 *
 * WORLD CLEANUP:
 *   There is no WorldCommands module in the current tree. The table
 *   below deliberately omits the `world` entry. When the world domain
 *   returns, add:
 *
 *     { label: 'world', moduleName: 'WorldCommands',
 *       methodName: 'removeLeaderReferences' }
 *
 *   Until then, omitting it is honest: no spurious "skipped: world"
 *   noise on every deletion.
 *
 * CONTRACT:
 *   - Every public command returns { success: boolean, reason?, ... }.
 *   - Input is validated before any mutation.
 *   - No mutation lock. Commands are synchronous.
 *   - No fallbacks. If CharacterState is missing at load, this module
 *     throws.
 *
 * DEPENDENCIES (REQUIRED):
 *   - character-state.js  (CharacterState.removeCharacter,
 *                          CharacterState.removeCharacters,
 *                          CharacterState.applyDomainFieldPatch,
 *                          CharacterState.getAllCharacters,
 *                          CharacterState.getLiveCharacterForMutation)
 *
 * DEPENDENCIES (OPTIONAL, called only if present):
 *   - family-commands.js          (FamilyCommands.removeAllReferencesTo)
 *   - children-commands.js        (ChildrenCommands.removeAllReferencesTo)
 *   - relationships/relationship-integration.js
 *                                 (RelationshipIntegrations.removeAllReferencesTo)
 *   - households/household-commands.js
 *                                 (HouseholdCommands.removeCharacterReferences)
 *   - apprenticeship/apprenticeship-commands.js
 *                                 (ApprenticeshipCommands.removeAllReferencesTo)
 *   - ranks/rank-issues.js        (RankIssues.removeAllReferencesTo)
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (Phase 3.13b):
 *     - Added registerDeleteHandler(fn). A module that loads after this
 *       file can register a delete handler; every hard delete invokes
 *       every registered handler, after the death of the record and
 *       after the named cleanup table. This closes the load-order gap
 *       that made the RelationshipIntegrations entry of _CLEANUP_TARGETS
 *       a no-op under the documented load order.
 *     - _hardDeleteInternal and _bulkHardDelete now invoke
 *       _invokeDeleteHandlers(characterId) after _dispatchCleanup.
 *       _purgeSoftDeletedCharacters invokes it per purged id after the
 *       cleanup loop.
 *     - Header DELETE HANDLER HOOK section added.
 *     - No other behavioural change.
 *   Previous revisions:
 *     - Fixed the relationship cleanup target name (PLURAL
 *       "RelationshipIntegrations", not the singular form).
 *     - Soft-delete writes routed through applyDomainFieldPatch
 *       (isDeleted and deletedAt are domain-owned).
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 0. HARD DEPENDENCY CHECK
    // =========================================================================

    if (!window.CharacterState) {
        throw new Error(
            'character-deletion-commands.js requires character-state.js (CharacterState).'
        );
    }

    var CS = window.CharacterState;

    var _required = [
        'removeCharacter',
        'removeCharacters',
        'applyDomainFieldPatch',
        'getAllCharacters',
        'getLiveCharacterForMutation'
    ];
    for (var _m = 0; _m < _required.length; _m++) {
        if (typeof CS[_required[_m]] !== 'function') {
            throw new Error(
                'character-deletion-commands.js: CharacterState.' +
                _required[_m] + ' is required.'
            );
        }
    }

    // =========================================================================
    // 0b. DELETE HANDLER REGISTRY (Phase 3.13b)
    // =========================================================================
    //
    // See DELETE HANDLER HOOK in the module header. Handlers registered
    // here run after the named cross-domain cleanup table on every
    // hard delete.

    var _deleteHandlers = [];

    /**
     * Registers a function to be called on every hard delete.
     *
     * @param {Function} fn - called as fn(characterId)
     * @returns {Function} unregister function
     * @throws {Error} if fn is not a function
     */
    function registerDeleteHandler(fn) {
        if (typeof fn !== 'function') {
            throw new Error(
                'character-deletion-commands.js: registerDeleteHandler requires a function.'
            );
        }
        _deleteHandlers.push(fn);
        return function unregister() {
            var idx = _deleteHandlers.indexOf(fn);
            if (idx !== -1) _deleteHandlers.splice(idx, 1);
        };
    }

    /**
     * Invokes every registered delete handler with (characterId).
     * Handler exceptions are caught and logged. A throwing handler
     * does not prevent subsequent handlers from running.
     *
     * @private
     */
    function _invokeDeleteHandlers(characterId) {
        if (_deleteHandlers.length === 0) return;
        var snapshot = _deleteHandlers.slice();
        for (var i = 0; i < snapshot.length; i++) {
            try {
                snapshot[i](characterId);
            } catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error(
                        'character-deletion-commands.js: delete handler threw:', e
                    );
                }
            }
        }
    }

    // =========================================================================
    // 1. RESULT HELPERS
    // =========================================================================

    function _ok(data) {
        var result = { success: true };
        if (data && typeof data === 'object') {
            for (var key in data) {
                if (Object.prototype.hasOwnProperty.call(data, key)) {
                    result[key] = data[key];
                }
            }
        }
        return result;
    }

    function _fail(reason) {
        return { success: false, reason: reason };
    }

    // =========================================================================
    // 2. HELPERS
    // =========================================================================

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _getLive(id) {
        if (!_hasId(id)) return null;
        return CS.getLiveCharacterForMutation(id);
    }

    // =========================================================================
    // 3. CROSS-DOMAIN CLEANUP
    // =========================================================================
    //
    // The (moduleName, methodName) pairs here must reflect the actual
    // exported surface of each domain. If a module renames its cleanup
    // function, this table is the single place to update.
    //
    // Relationship cleanup: the relationship domain owns its cross-domain
    // hooks in relationship-integration.js, not in relationship-commands.js.
    // The module name exported by that file is RelationshipIntegrations
    // (PLURAL) — verified at line 505 of that file.
    //
    // Rank cleanup: the rank domain owns its cross-domain hooks in
    // rank-issues.js, not in rank-commands.js. RankCommands is the write
    // boundary for rank records; RankIssues exposes handleCharacterDeath
    // and removeAllReferencesTo.
    //
    // World cleanup: no WorldCommands module exists in the current tree.
    // The entry is deliberately absent so we do not emit a "skipped"
    // every deletion. When the world domain returns, add it back to
    // this table.

    var _CLEANUP_TARGETS = [
        {
            label: 'family',
            moduleName: 'FamilyCommands',
            methodName: 'removeAllReferencesTo'
        },
        {
            label: 'children',
            moduleName: 'ChildrenCommands',
            methodName: 'removeAllReferencesTo'
        },
        {
            label: 'relationships',
            moduleName: 'RelationshipIntegrations',
            methodName: 'removeAllReferencesTo'
        },
        {
            label: 'households',
            moduleName: 'HouseholdCommands',
            methodName: 'removeCharacterReferences'
        },
        {
            label: 'rank',
            moduleName: 'RankIssues',
            methodName: 'removeAllReferencesTo'
        },
        {
            label: 'apprenticeship',
            moduleName: 'ApprenticeshipCommands',
            methodName: 'removeAllReferencesTo'
        }
    ];

    function _dispatchCleanup(characterId) {
        var report = {
            applied: [],
            skipped: [],
            failed: []
        };

        for (var i = 0; i < _CLEANUP_TARGETS.length; i++) {
            var target = _CLEANUP_TARGETS[i];
            var mod = window[target.moduleName];

            if (!mod || typeof mod[target.methodName] !== 'function') {
                report.skipped.push({
                    domain: target.label,
                    reason: 'not loaded or method unavailable'
                });
                continue;
            }

            try {
                var result = mod[target.methodName](characterId);
                if (result && result.success === false) {
                    report.failed.push({
                        domain: target.label,
                        reason: result.reason || 'cleanup reported failure'
                    });
                } else {
                    report.applied.push({ domain: target.label });
                }
            } catch (err) {
                report.failed.push({
                    domain: target.label,
                    reason: err && err.message ? err.message : 'cleanup threw'
                });
            }
        }

        return report;
    }

    // =========================================================================
    // 4. INTERNAL DELETION PRIMITIVE
    // =========================================================================

    function _hardDeleteInternal(characterId) {
        var removed = CS.removeCharacter(characterId);
        if (!removed.success) {
            return _fail(removed.reason || 'CharacterState refused removal.');
        }

        var cleanup = _dispatchCleanup(characterId);

        // Phase 3.13b: invoke registered delete handlers after the
        // named cleanup table. This reaches the domains that load
        // after this file (notably the relationship domain).
        _invokeDeleteHandlers(characterId);

        return _ok({
            deletedId: characterId,
            deletedCharacter: removed.character,
            cleanup: cleanup
        });
    }

    function _softDeleteInternal(characterId) {
        var now = Date.now();
        var update = CS.applyDomainFieldPatch(characterId, {
            isDeleted: true,
            deletedAt: now,
            updatedAt: now
        });
        if (!update.success) {
            return _fail(update.reason || 'CharacterState refused soft delete.');
        }
        return _ok({ deletedId: characterId });
    }

    function _restoreInternal(characterId) {
        var now = Date.now();
        var update = CS.applyDomainFieldPatch(characterId, {
            isDeleted: false,
            deletedAt: null,
            updatedAt: now
        });
        if (!update.success) {
            return _fail(update.reason || 'CharacterState refused restore.');
        }
        return _ok({ restoredId: characterId });
    }

    // =========================================================================
    // 5. PUBLIC - HARD DELETE
    // =========================================================================

    function deleteCharacter(characterId) {
        if (!_hasId(characterId)) {
            return _fail('Character id is required.');
        }

        var character = _getLive(characterId);
        if (!character) return _fail('Character not found.');

        return _hardDeleteInternal(characterId);
    }

    // =========================================================================
    // 6. PUBLIC - SOFT DELETE
    // =========================================================================

    function softDeleteCharacter(characterId) {
        if (!_hasId(characterId)) {
            return _fail('Character id is required.');
        }

        var character = _getLive(characterId);
        if (!character) return _fail('Character not found.');
        if (character.isDeleted === true) {
            return _fail('Character is already soft-deleted.');
        }

        return _softDeleteInternal(characterId);
    }

    function restoreSoftDeletedCharacter(characterId) {
        if (!_hasId(characterId)) {
            return _fail('Character id is required.');
        }

        var character = _getLive(characterId);
        if (!character) return _fail('Character not found.');
        if (character.isDeleted !== true) {
            return _fail('Character is not soft-deleted.');
        }

        return _restoreInternal(characterId);
    }

    // =========================================================================
    // 7. PUBLIC - PURGE
    // =========================================================================

    function purgeSoftDeletedCharacters() {
        var all = CS.getAllCharacters();
        var toPurge = [];
        for (var i = 0; i < all.length; i++) {
            if (all[i].isDeleted === true) toPurge.push(all[i].id);
        }

        if (toPurge.length === 0) {
            return {
                success: true,
                count: 0,
                purgedIds: [],
                cleanup: []
            };
        }

        var removed = CS.removeCharacters(toPurge);
        if (!removed.success) {
            return {
                success: false,
                reason: removed.reason || 'CharacterState refused batch removal.',
                count: 0,
                purgedIds: [],
                cleanup: []
            };
        }

        var cleanupReports = [];
        for (var j = 0; j < toPurge.length; j++) {
            cleanupReports.push({
                characterId: toPurge[j],
                report: _dispatchCleanup(toPurge[j])
            });
            // Phase 3.13b: invoke registered delete handlers per purged
            // character, matching the per-character cleanup pattern.
            _invokeDeleteHandlers(toPurge[j]);
        }

        return {
            success: true,
            count: toPurge.length,
            purgedIds: toPurge,
            cleanup: cleanupReports
        };
    }

    // =========================================================================
    // 8. PUBLIC - BULK DELETE
    // =========================================================================

    function bulkDeleteCharacters(ids, soft) {
        if (!Array.isArray(ids)) {
            return {
                success: false,
                reason: 'Expected an array of character ids.',
                count: 0,
                errors: []
            };
        }
        if (ids.length === 0) {
            return { success: true, count: 0, errors: [] };
        }

        var useSoft = soft === true;

        for (var v = 0; v < ids.length; v++) {
            if (!_hasId(ids[v])) {
                return {
                    success: false,
                    reason: 'Invalid id at index ' + v + '.',
                    count: 0,
                    errors: []
                };
            }
        }

        if (useSoft) {
            return _bulkSoftDelete(ids);
        }
        return _bulkHardDelete(ids);
    }

    function _bulkSoftDelete(ids) {
        var deletedIds = [];
        var errors = [];

        for (var i = 0; i < ids.length; i++) {
            var id = ids[i];
            var character = _getLive(id);
            if (!character) {
                errors.push({ id: id, reason: 'Character not found.' });
                continue;
            }
            if (character.isDeleted === true) {
                errors.push({ id: id, reason: 'Already soft-deleted.' });
                continue;
            }

            var result = _softDeleteInternal(id);
            if (result.success) {
                deletedIds.push(id);
            } else {
                errors.push({ id: id, reason: result.reason });
            }
        }

        return {
            success: errors.length === 0,
            partial: errors.length > 0 && deletedIds.length > 0,
            count: deletedIds.length,
            deletedIds: deletedIds,
            errors: errors
        };
    }

    function _bulkHardDelete(ids) {
        var existingIds = [];
        var errors = [];
        for (var i = 0; i < ids.length; i++) {
            var id = ids[i];
            if (_getLive(id)) {
                existingIds.push(id);
            } else {
                errors.push({ id: id, reason: 'Character not found.' });
            }
        }

        if (existingIds.length === 0) {
            return {
                success: errors.length === 0,
                count: 0,
                deletedIds: [],
                errors: errors
            };
        }

        var removed = CS.removeCharacters(existingIds);
        if (!removed.success) {
            return {
                success: false,
                reason: removed.reason || 'CharacterState refused batch removal.',
                count: 0,
                errors: errors
            };
        }

        var cleanupReports = [];
        for (var j = 0; j < existingIds.length; j++) {
            cleanupReports.push({
                characterId: existingIds[j],
                report: _dispatchCleanup(existingIds[j])
            });
            // Phase 3.13b: invoke registered delete handlers per
            // removed character.
            _invokeDeleteHandlers(existingIds[j]);
        }

        return {
            success: errors.length === 0,
            partial: errors.length > 0 && existingIds.length > 0,
            count: existingIds.length,
            deletedIds: existingIds,
            errors: errors,
            cleanup: cleanupReports
        };
    }

    // =========================================================================
    // 9. PUBLIC - SOFT-DELETED READ
    // =========================================================================

    function getSoftDeletedCharacters() {
        var all = CS.getAllCharacters();
        var result = [];
        for (var i = 0; i < all.length; i++) {
            if (all[i].isDeleted === true) result.push(all[i]);
        }
        return result;
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.CharacterDeletionCommands = {
        deleteCharacter: deleteCharacter,

        softDeleteCharacter: softDeleteCharacter,
        restoreSoftDeletedCharacter: restoreSoftDeletedCharacter,
        purgeSoftDeletedCharacters: purgeSoftDeletedCharacters,

        bulkDeleteCharacters: bulkDeleteCharacters,

        getSoftDeletedCharacters: getSoftDeletedCharacters,

        // Phase 3.13b: register a delete handler. Exposed on the
        // CharacterDeletionCommands namespace AND on window (below) so
        // a caller can reach it either way.
        registerDeleteHandler: registerDeleteHandler
    };

    // Phase 3.13b: expose registerDeleteHandler on window so that
    // modules that load after this file (notably
    // relationship-integrations.js) can register without assuming the
    // CharacterDeletionCommands namespace is populated. Both paths are
    // equivalent; the window global is the one the relationship
    // integration's registration block checks for.
    window.registerDeleteHandler = registerDeleteHandler;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterDeletionCommands;
    }
})();
