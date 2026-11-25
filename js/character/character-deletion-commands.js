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
 *   - Relationship cleanup              -> relationships/relationship-integrations.js
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
 *   Hard delete dispatches cleanup before removing the canonical character
 *   record. The record is removed only after every required cleanup handler
 *   reports success. Readiness validation blocks hard deletion when a required
 *   cleanup module is unavailable; unavailable cleanup is not treated as safe
 *   to skip. The response records participating, skipped, and failed domains.
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
 *   CharacterState removes the record only after cleanup succeeds. A cleanup
 *   failure retains the character record and reports incomplete deletion,
 *   allowing retry. This flow is NOT atomic across domains: earlier handlers
 *   may already have mutated state when a later handler fails, and those
 *   mutations are not rolled back. Retry safety therefore depends on cleanup
 *   handlers being idempotent. Do not describe this as a coordinated
 *   transaction until every participating domain has exact snapshot/restore
 *   support and notifications are deferred until commit.
 *
 * DELETE HANDLER HOOK (Phase 3.13b):
 *   The named cleanup table handles FamilyCommands, ChildrenCommands,
 *   HouseholdCommands, RankIssues, and ApprenticeshipCommands when present.
 *   RelationshipIntegrations is reached only through the registration hook,
 *   avoiding duplicate invocation.
 *
 *   To close that gap, this module exposes registerDeleteHandler(fn).
 *   Any module that loads after this file may register a handler.
 *   Every hard delete invokes every registered handler exactly once,
 *   after the named cleanup table has run and before the character record
 *   is removed.
 *
 *   RelationshipIntegrations registers itself at load time (see
 *   relationship-integrations.js's REGISTRATION HOOKS section).
 *
 *   Handler contract:
 *     fn(characterId) -> { success: true, ... } | { success: false, reason }
 *   Missing or malformed results and exceptions are recorded as failures.
 *   A failing handler blocks subsequent handlers for that character to limit partial cleanup.
 *
 *   RelationshipIntegrations is intentionally omitted from the named
 *   cleanup table because it registers through this hook.
 *
 *   Registration returns an unregister function. Callers who need to
 *   tear down (test harnesses, hot reload) should call it. In a
 *   normal browser session nothing calls unregister; the handler
 *   lives for the lifetime of the page.
 *
 * NAMING NOTE:
 *   The relationship domain's cross-domain hook is exported by
 *   js/relationships/relationship-integrations.js under the namespace
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
 *   - Hard deletion uses CrossDomainTransaction: every participating domain
 *     is snapshotted before mutation, all cleanup and character removal run
 *     inside one transaction, and one save is attempted after all mutations.
 *   - Failed apply or persistence restores every captured domain in reverse
 *     transaction rollback. Rollback failures are reported explicitly.
 *   - Notifications are buffered during the transaction and published only
 *     after the durable save succeeds.
 *   - Soft deletion remains a CharacterState-only operation.
 *   - Commands are synchronous. If CharacterState is missing at load, this
 *     module throws.
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
 *   - relationships/relationship-integrations.js
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
 *   Current revision (Phase 4 hard-delete audit):
 *     - Cleanup handlers must return an explicit { success: true } result.
 *       Missing, malformed, failed, and throwing handlers are recorded.
 *     - Hard delete distinguishes deletionComplete from cleanup success;
 *       a removed character can have incomplete cross-domain cleanup.
 *     - Purge and bulk delete aggregate per-character cleanup failures.
 *     - RelationshipIntegrations is no longer dispatched twice (named
 *       target plus registered handler).
 *   Previous revision (Phase 3.13b):
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
        'getLiveCharacterForMutation',
        'validateCharacterRemoval'
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
     * Handler exceptions are caught and logged. A failed or throwing
     * handler blocks all later handlers to limit partial cleanup.
     *
     * @private
     */
    function _invokeDeleteHandlers(characterId) {
        var report = { applied: 0, failed: [] };
        var snapshot = _deleteHandlers.slice();
        if (snapshot.length === 0) {
            report.failed.push({
                handler: 'registry',
                reason: 'No cross-domain delete handlers are registered.'
            });
        }
        for (var i = 0; i < snapshot.length; i++) {
            try {
                var result = snapshot[i](characterId);
                if (!result || result.success !== true) {
                    report.failed.push({
                        handlerIndex: i,
                        reason: result && result.reason
                            ? result.reason
                            : 'Delete handler returned an invalid result.'
                    });
                } else {
                    report.applied++;
                    continue;
                }
                // A failed handler may have partially mutated its domain.
                // Do not run later handlers and expand the partial cleanup.
                for (var j = i + 1; j < snapshot.length; j++) {
                    report.failed.push({
                        handlerIndex: j,
                        reason: 'blocked because an earlier delete handler failed'
                    });
                }
                break;
            } catch (e) {
                report.failed.push({
                    handlerIndex: i,
                    reason: e && e.message ? e.message : 'Delete handler threw.'
                });
                if (typeof console !== 'undefined' && console.error) {
                    console.error('character-deletion-commands.js: delete handler threw:', e);
                }
                for (var k = i + 1; k < snapshot.length; k++) {
                    report.failed.push({
                        handlerIndex: k,
                        reason: 'blocked because an earlier delete handler threw'
                    });
                }
                break;
            }
        }
        report.success = report.failed.length === 0;
        return report;
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
    // hooks in relationship-integrations.js, not in relationship-commands.js.
    // The module name exported by that file is RelationshipIntegrations
    // (PLURAL) — verified in that module's export.
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

    function _validateCleanupReady() {
        var missing = [];
        for (var i = 0; i < _CLEANUP_TARGETS.length; i++) {
            var target = _CLEANUP_TARGETS[i];
            var mod = window[target.moduleName];
            if (!mod || typeof mod[target.methodName] !== 'function') {
                missing.push({
                    domain: target.label,
                    reason: target.moduleName + '.' + target.methodName + ' is unavailable.'
                });
            }
        }
        if (_deleteHandlers.length === 0) {
            missing.push({
                domain: 'registeredHandlers',
                reason: 'No cross-domain delete handlers are registered.'
            });
        }
        return { success: missing.length === 0, missing: missing };
    }

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

            var cleanupFailed = false;
            try {
                var result = mod[target.methodName](characterId);
                if (!result || result.success !== true) {
                    report.failed.push({
                        domain: target.label,
                        reason: result && result.reason
                            ? result.reason
                            : 'cleanup returned an invalid result'
                    });
                    cleanupFailed = true;
                } else {
                    report.applied.push({ domain: target.label });
                }
            } catch (err) {
                report.failed.push({
                    domain: target.label,
                    reason: err && err.message ? err.message : 'cleanup threw'
                });
                cleanupFailed = true;
            }

            // Cleanup domains can mutate before returning failure. Stop here:
            // invoking later domains would expand a known partial cleanup.
            if (cleanupFailed) {
                for (var j = i + 1; j < _CLEANUP_TARGETS.length; j++) {
                    report.skipped.push({
                        domain: _CLEANUP_TARGETS[j].label,
                        reason: 'blocked because an earlier cleanup domain failed'
                    });
                }
                break;
            }
        }

        return report;
    }

    // =========================================================================
    // 4. COORDINATED HARD-DELETE TRANSACTION
    // =========================================================================
    function _captureHardDeleteSnapshot() {
        var checks = [
            [CS, '_transactionSnapshotDeletedLocations'], [CS, '_transactionRestoreDeletedLocations'],
            [window.FamilyState, 'snapshot'], [window.FamilyState, 'replaceAll'],
            [window.ChildrenState, 'snapshotPregnancies'], [window.ChildrenState, 'snapshotSurrogacy'],
            [window.ChildrenState, 'snapshotAdoptions'], [window.ChildrenState, 'replaceAllPregnancies'],
            [window.ChildrenState, 'replaceAllSurrogacy'], [window.ChildrenState, 'replaceAllAdoptions'],
            [window.HouseholdState, '_transactionSnapshotDeletedLocations'],
            [window.HouseholdState, '_transactionRestoreDeletedLocations'],
            [window.RelationshipState, 'snapshot'], [window.RelationshipState, 'replaceAll']
        ];
        checks.forEach(function (entry) {
            if (!entry[0] || typeof entry[0][entry[1]] !== 'function') throw new Error('Missing transaction dependency: ' + entry[1]);
        });
        return {
            characters: CS._transactionSnapshotDeletedLocations(),
            family: window.FamilyState.snapshot(),
            pregnancies: window.ChildrenState.snapshotPregnancies(),
            surrogacy: window.ChildrenState.snapshotSurrogacy(),
            adoptions: window.ChildrenState.snapshotAdoptions(),
            households: window.HouseholdState._transactionSnapshotDeletedLocations(),
            relationships: window.RelationshipState.snapshot(),
            enterprises: window.masterData && window.masterData.data
                && Array.isArray(window.masterData.data.enterprises)
                ? JSON.parse(JSON.stringify(window.masterData.data.enterprises))
                : null
        };
    }

    function _restoreHardDeleteSnapshot(s) {
        var errors = [];
        function restore(name, fn) {
            try { var r = fn(); if (r === false || (r && r.success === false)) errors.push(name + ': ' + (r.reason || 'restore rejected')); }
            catch (e) { errors.push(name + ': ' + (e.message || String(e))); }
        }
        restore('characters', function () { return CS._transactionRestoreDeletedLocations(s.characters, { suppressDirty: true }); });
        restore('family', function () {
            if (window.FamilyState.replaceAll(s.family) !== true) throw new Error('FamilyState rejected snapshot');
            window.masterData.data.parentChildEdges = window.FamilyState.snapshot(); return true;
        });
        restore('children/pregnancies', function () {
            var st = window.ChildrenState;
            if (st.replaceAllPregnancies(s.pregnancies) !== true) throw new Error('ChildrenState rejected pregnancy snapshot');
            window.masterData.data.pregnancyRecords = st.snapshotPregnancies(); return true;
        });
        restore('children/surrogacy', function () {
            var st = window.ChildrenState;
            if (st.replaceAllSurrogacy(s.surrogacy) !== true) throw new Error('ChildrenState rejected surrogacy snapshot');
            window.masterData.data.surrogacyArrangements = st.snapshotSurrogacy(); return true;
        });
        restore('children/adoptions', function () {
            var st = window.ChildrenState;
            if (st.replaceAllAdoptions(s.adoptions) !== true) throw new Error('ChildrenState rejected adoption snapshot');
            window.masterData.data.adoptionRecords = st.snapshotAdoptions(); return true;
        });
        restore('households', function () { return window.HouseholdState._transactionRestoreDeletedLocations(s.households); });
        restore('relationships', function () {
            window.RelationshipState.replaceAll(s.relationships);
            window.masterData.data.relationships = window.RelationshipState.snapshot();
            return true;
        });
        restore('industry enterprises', function () {
            if (s.enterprises !== null) {
                window.masterData.data.enterprises = JSON.parse(JSON.stringify(s.enterprises));
            }
            return true;
        });
        if (CS._transactionDiscardChanges) CS._transactionDiscardChanges();
        if (window.FamilyState && window.FamilyState._transactionDiscardNotifications) window.FamilyState._transactionDiscardNotifications();
        if (window.RelationshipState && window.RelationshipState._transactionDiscardNotifications) window.RelationshipState._transactionDiscardNotifications();
        if (window.ApprenticeshipCommands && window.ApprenticeshipCommands._transactionDiscardNotifications) window.ApprenticeshipCommands._transactionDiscardNotifications();
        if (window.HouseholdCommands && window.HouseholdCommands._transactionDiscardSideEffects) window.HouseholdCommands._transactionDiscardSideEffects();
        if (window.FamilyCommands && window.FamilyCommands._transactionDiscardSideEffects) window.FamilyCommands._transactionDiscardSideEffects();
        if (window.ChildrenCommands && window.ChildrenCommands._transactionDiscardSideEffects) window.ChildrenCommands._transactionDiscardSideEffects();
        return errors.length ? { success: false, reason: errors.join('; '), errors: errors } : { success: true };
    }

    function _executeHardDeleteBatch(ids) {
        var preflight = CS.validateCharacterRemoval(ids);
        if (!preflight || preflight.success !== true) return { success: false, code: 'PREPARATION_FAILED', reason: preflight && preflight.reason || 'Character removal preflight failed.', rolledBack: true, cleanup: [] };
        var readiness = _validateCleanupReady();
        if (!readiness.success) return { success: false, code: 'PREPARATION_FAILED', reason: 'Cross-domain cleanup is not fully available.', cleanupReadiness: readiness, rolledBack: true, cleanup: [] };
        if (!window.CrossDomainTransaction || typeof window.CrossDomainTransaction.execute !== 'function') return { success: false, code: 'TRANSACTION_UNAVAILABLE', reason: 'CrossDomainTransaction is required.', rolledBack: true, cleanup: [] };

        var reports = [];
        var tx = window.CrossDomainTransaction.execute({
            id: 'hard-delete-' + ids.join(','),
            context: { ids: ids.slice(), reports: reports },
            persist: function () {
                if (typeof window.saveMasterData !== 'function') {
                    return { success: false, reason: 'saveMasterData is unavailable.' };
                }
                try {
                    return window.saveMasterData() === true
                        ? { success: true }
                        : { success: false, reason: typeof window.getLastSaveError === 'function' && window.getLastSaveError()
                            ? window.getLastSaveError().message : 'saveMasterData returned false.' };
                } catch (error) {
                    return { success: false, reason: error && error.message ? error.message : 'saveMasterData threw.' };
                }
            },
            participants: [{
                name: 'hard-delete-all-domains',
                snapshot: _captureHardDeleteSnapshot,
                apply: function (ctx) {
                    for (var i = 0; i < ctx.ids.length; i++) {
                        var id = ctx.ids[i], report = _dispatchCleanup(id);
                        report.handlers = report.failed.length === 0 && report.skipped.length === 0
                            ? _invokeDeleteHandlers(id)
                            : { applied: 0, failed: [{ handler: 'registry', reason: 'Named cleanup failed.' }], success: false, skipped: true };
                        report.success = report.failed.length === 0 && report.skipped.length === 0 && report.handlers.success;
                        report.partial = !report.success;
                        ctx.reports.push({ characterId: id, report: report });
                        if (!report.success) return { success: false, reason: 'Cross-domain cleanup failed for ' + id };
                    }
                    // RelationshipState owns cloned indexed records. Mirror its committed
                    // snapshot into the serialised masterData store before the one save.
                    window.masterData.data.relationships = window.RelationshipState.snapshot();

                    // Enterprises can be owned by characters or list characters as
                    // workers. Character Manager does not load the Industry runtime,
                    // so clean the canonical persisted records here rather than
                    // requiring IndustryState/IndustryCommands to be present.
                    // The batch snapshot above makes this part of the same rollback.
                    var enterpriseRecords = window.masterData.data.enterprises;
                    if (Array.isArray(enterpriseRecords)) {
                        for (var ei = 0; ei < enterpriseRecords.length; ei++) {
                            var enterprise = enterpriseRecords[ei];
                            if (!enterprise || typeof enterprise !== 'object') continue;
                            var enterpriseChanged = false;
                            if (enterprise.ownerType === 'character'
                                && ctx.ids.indexOf(enterprise.ownerId) !== -1) {
                                enterprise.ownerType = 'none';
                                enterprise.ownerId = null;
                                enterpriseChanged = true;
                            }
                            if (Array.isArray(enterprise.workerList)) {
                                var remainingWorkers = enterprise.workerList.filter(function(workerId) {
                                    return ctx.ids.indexOf(workerId) === -1;
                                });
                                if (remainingWorkers.length !== enterprise.workerList.length) {
                                    enterprise.workerList = remainingWorkers;
                                    enterpriseChanged = true;
                                }
                            }
                            if (enterprise.workerWages && typeof enterprise.workerWages === 'object') {
                                ctx.ids.forEach(function(id) {
                                    if (Object.prototype.hasOwnProperty.call(enterprise.workerWages, id)) {
                                        delete enterprise.workerWages[id];
                                        enterpriseChanged = true;
                                    }
                                });
                            }
                        }
                    }

                    var removed = CS.removeCharacters(ctx.ids);
                    if (!removed || removed.success !== true) return { success: false, reason: removed && removed.reason || 'CharacterState refused batch removal.' };
                    return { success: true };
                },
                rollback: _restoreHardDeleteSnapshot,
                afterCommit: function () {
                    // One broken listener must not strand the remaining domains'
                    // committed notifications. Attempt every queue, then let the
                    // coordinator report the aggregate post-commit failure.
                    var failures = [];
                    function flush(name, owner, method) {
                        try {
                            if (owner && typeof owner[method] === 'function') owner[method]();
                        } catch (error) {
                            failures.push(name + ': ' + (error && error.message ? error.message : String(error)));
                        }
                    }
                    flush('characters', CS, '_transactionFlushChanges');
                    flush('family commands', window.FamilyCommands, '_transactionFlushSideEffects');
                    flush('children commands', window.ChildrenCommands, '_transactionFlushSideEffects');
                    flush('family state', window.FamilyState, '_transactionFlushNotifications');
                    flush('relationships', window.RelationshipState, '_transactionFlushNotifications');
                    flush('apprenticeships', window.ApprenticeshipCommands, '_transactionFlushNotifications');
                    flush('households', window.HouseholdCommands, '_transactionFlushSideEffects');
                    if (failures.length) throw new Error(failures.join('; '));
                }
            }]
        });
        return { success: tx.success === true, code: tx.code, reason: tx.reason || null,
            rolledBack: tx.rolledBack === true || tx.code === 'TRANSACTION_SETUP_FAILED' || tx.code === 'PREPARATION_FAILED' || tx.code === 'INVALID_TRANSACTION', rollbackErrors: tx.rollbackErrors || [],
            deletedIds: tx.success ? ids.slice() : [], cleanup: reports, transaction: tx };
    }

    // =========================================================================
    // 4. INTERNAL DELETION PRIMITIVE
    // =========================================================================

    function _hardDeleteInternal(characterId) {
        var result = _executeHardDeleteBatch([characterId]);
        if (!result.success) return { success: false, reason: result.reason || 'Hard-delete transaction failed.',
            code: result.code, deletedId: characterId, deletionComplete: false,
            partial: result.rolledBack !== true, cleanupFailed: true, cleanup: result.cleanup,
            transaction: result.transaction, rollbackErrors: result.rollbackErrors };
        return { success: true, deletedId: characterId, deletionComplete: true, partial: false,
            cleanupFailed: false, cleanup: result.cleanup, transaction: result.transaction };
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

        var result = _executeHardDeleteBatch(toPurge);
        if (!result.success) return { success: false, reason: result.reason || 'Purge transaction failed.',
            code: result.code, partial: result.rolledBack !== true, deletionComplete: false,
            cleanupFailed: true, count: 0, purgedIds: [], cleanup: result.cleanup,
            rollbackErrors: result.rollbackErrors, transaction: result.transaction };
        return { success: true, partial: false, deletionComplete: true, cleanupFailed: false,
            count: result.deletedIds.length, purgedIds: result.deletedIds,
            cleanup: result.cleanup, transaction: result.transaction };
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

        // A repeated id must represent one deletion, not multiple cleanup
        // passes against the same character. Keep first-seen order for reports.
        ids = ids.filter(function (id, index) {
            return ids.indexOf(id) === index;
        });

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
        var existing = [], errors = [];
        ids.forEach(function (id) { if (_getLive(id)) existing.push(id); else errors.push({ id: id, reason: 'Character not found.' }); });
        if (!existing.length) return { success: errors.length === 0, partial: false, count: 0, deletedIds: [], errors: errors, cleanup: [] };
        var result = _executeHardDeleteBatch(existing);
        if (!result.success) return { success: false, reason: result.reason || 'Bulk hard-delete transaction failed.',
            code: result.code, partial: result.rolledBack !== true, deletionComplete: false,
            cleanupFailed: true, count: 0, deletedIds: [], errors: errors, cleanup: result.cleanup,
            rollbackErrors: result.rollbackErrors, transaction: result.transaction };
        return { success: errors.length === 0, partial: errors.length > 0, deletionComplete: true,
            cleanupFailed: false, count: result.deletedIds.length, deletedIds: result.deletedIds,
            errors: errors, cleanup: result.cleanup, transaction: result.transaction };
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
