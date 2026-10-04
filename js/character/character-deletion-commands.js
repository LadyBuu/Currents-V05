/**
 * =============================================================================
 * STILL WATERS - CHARACTER DELETION COMMANDS
 * (js/character/character-deletion-commands.js)
 * =============================================================================
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
 *
 * OUT OF SCOPE:
 *   - Creation            -> character-creation-commands.js
 *   - Field updates       -> character-commands.js
 *   - Family graph cleanup details      -> family-commands.js (called here)
 *   - Children domain cleanup details   -> children-commands.js (called here)
 *   - Relationship cleanup              -> future relationship-commands.js
 *   - Household cleanup                 -> household-commands.js (if loaded)
 *   - World leader cleanup              -> world-commands.js (if loaded)
 *   - Rank cleanup                      -> rank-commands.js (if loaded)
 *   - Apprenticeship cleanup            -> future apprenticeship-commands.js
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
 *   domains participated.
 *
 * CLEANUP CONTRACT:
 *   Each cross-domain module may expose a cleanup function with a
 *   documented name. This command calls the following if present:
 *
 *     FamilyCommands.removeAllReferencesTo(id)
 *     ChildrenCommands.removeAllReferencesTo(id)
 *     RelationshipCommands.removeAllReferencesTo(id)
 *     HouseholdCommands.removeCharacterReferences(id)
 *     WorldCommands.removeLeaderReferences(id)
 *     RankCommands.removeCharacterReferences(id)
 *     ApprenticeshipCommands.removeAllReferencesTo(id)
 *
 *   Each is called only if the module and the method exist. The return
 *   value records which calls were made and which were skipped.
 *
 * CONTRACT:
 *   - Every public command returns { success: boolean, reason?, ... }.
 *   - Input is validated before any mutation.
 *   - No mutation lock. Commands are synchronous.
 *   - No fallbacks. If CharacterState is missing at load, this module throws.
 *
 * DEPENDENCIES (REQUIRED):
 *   - character-state.js  (CharacterState.removeCharacter,
 *                          CharacterState.removeCharacters,
 *                          CharacterState.updateCharacter,
 *                          CharacterState.getAllCharacters,
 *                          CharacterState._getLiveCharacterForMutation)
 *
 * DEPENDENCIES (OPTIONAL, called only if present):
 *   - family-commands.js
 *   - children-commands.js
 *   - relationship-commands.js
 *   - household-commands.js
 *   - world-commands.js
 *   - rank-commands.js
 *   - apprenticeship-commands.js
 *
 * ICON POLICY: No emojis. No icons.
 *
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
        'updateCharacter',
        'getAllCharacters',
        '_getLiveCharacterForMutation'
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
        return CS._getLiveCharacterForMutation(id);
    }

    // =========================================================================
    // 3. CROSS-DOMAIN CLEANUP
    // =========================================================================

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
            moduleName: 'RelationshipCommands',
            methodName: 'removeAllReferencesTo'
        },
        {
            label: 'households',
            moduleName: 'HouseholdCommands',
            methodName: 'removeCharacterReferences'
        },
        {
            label: 'world',
            moduleName: 'WorldCommands',
            methodName: 'removeLeaderReferences'
        },
        {
            label: 'rank',
            moduleName: 'RankCommands',
            methodName: 'removeCharacterReferences'
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

        return _ok({
            deletedId: characterId,
            deletedCharacter: removed.character,
            cleanup: cleanup
        });
    }

    function _softDeleteInternal(characterId) {
        var now = Date.now();
        var update = CS.updateCharacter(characterId, {
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
        var update = CS.updateCharacter(characterId, {
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

        getSoftDeletedCharacters: getSoftDeletedCharacters
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterDeletionCommands;
    }
})();
