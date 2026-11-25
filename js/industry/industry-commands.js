/**
 * =============================================================================
 * STILL WATERS - INDUSTRY COMMANDS (industry-commands.js)
 * =============================================================================
 *
 * LOCATION: js/industry/industry-commands.js
 *
 * The single write boundary for the enterprise domain.
 *
 * This file:
 *   - creates, updates, and deletes enterprise records
 *   - manages workers, wages, wealth, debt
 *   - commits annual processing results
 *   - demolishes and rebuilds enterprises
 *   - routes household ownership writes through HouseholdCommands
 *   - owns persist(), the only call site of saveMasterData in this domain
 *
 * This file does NOT:
 *   - mutate enterprise types (IndustryTypeCommands does)
 *   - seed the type registry (IndustryTypeInit does)
 *   - compute economic transitions (IndustryEconomics does)
 *   - resolve owner/location/worker names (IndustryQueries does)
 *   - toast, render, or touch the DOM
 *
 * PERSISTENCE:
 *   Ordinary commands do not save. The caller calls IndustryCommands.persist()
 *   once per batch after the commands succeed.
 *
 *   Annual processing is the exception: applyAnnualProcessing coordinates
 *   Enterprise + optional Household mutations through CrossDomainTransaction
 *   and persists once by default. Batch processors pass { persist: false } to
 *   each annual transaction and perform one save after the batch.
 *
 * CONTRACT:
 *   Every public command returns { success: true, ... } or
 *   { success: false, reason: string }.
 *
 * DEPENDENCIES (REQUIRED at load):
 *   - industry-state.js    (IndustryState)
 *   - industry-rules.js    (IndustryRules)
 *   - industry-constants.js (IndustryConstants)
 *   - ids.js               (generateId)
 *   - storage.js           (saveMasterData)
 *   - time.js              (getCurrentYear)
 *   - accessors.js         (getCharacterById, getPlaceById, getHouseholdById)
 *   - household-commands.js (HouseholdCommands) — for household ownership
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (shared cross-domain ownership transaction):
 *     - updateEnterprise routes every ownership transition involving a
 *       Household through CrossDomainTransaction. The source Household,
 *       target Household and Enterprise are snapshotted before mutation.
 *       Reverse-index changes and the Enterprise owner patch are applied
 *       silently; notifications are published only after all participants
 *       succeed. Any apply failure restores all attempted participants.
 *       A failed restoration is reported as ROLLBACK_FAILED. This replaces
 *       the former best-effort source-side repair.
 *     - workerList and workerWages removed from _ALLOWED_UPDATE_FIELDS.
 *       Callers must go through addWorkerToEnterprise /
 *       removeWorkerFromEnterprise / setWorkerWage. This eliminates the
 *       validation-error back door where a generic update could bypass the
 *       dedicated worker commands and produce an inconsistent
 *       workerList / workerWages pair.
 *     - updateEnterprise now rejects wealth / debt changes while status is
 *       in FINANCIALS_FROZEN_STATUSES, and rejects the single-call
 *       combination { status: 'demolished', wealth } / { status:
 *       'demolished', debt }. Prior revisions allowed this combination to
 *       bypass updateEnterpriseWealth's / updateEnterpriseDebt's
 *       frozen-status guard.
 *     - _applyHouseholdTransfer now writes only wealth, not notes. Prior
 *       revisions wrote notes based on a potentially stale read, which
 *       overwrote concurrent household note edits. The reason goes into
 *       the industry event payload and the household eventLog entry
 *       written by HouseholdCommands.updateHousehold.
 *     - createEnterprise rollback (IS._removeEnterprise after a failed
 *       _registerWithHousehold) is now wrapped in try/catch. Prior
 *       revisions allowed a rollback failure to mask the original error.
 *     - getHouseholdById added to _requireHouseholdCommands' required
 *       globals. DEPENDENCIES header updated.
 *     - Header REVERSE-INDEX RECONCILIATION section added.
 *     - No other behavioural change.
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. LOAD-TIME DEPENDENCY VERIFICATION
    // =========================================================================

    if (typeof window.IndustryState === 'undefined') {
        throw new Error(
            'industry-commands.js requires industry-state.js to load first.'
        );
    }
    if (typeof window.IndustryRules === 'undefined') {
        throw new Error(
            'industry-commands.js requires industry-rules.js to load first.'
        );
    }
    if (typeof window.IndustryConstants === 'undefined') {
        throw new Error(
            'industry-commands.js requires industry-constants.js to load first.'
        );
    }
    if (typeof window.generateId !== 'function') {
        throw new Error('industry-commands.js requires ids.js (generateId).');
    }
    if (typeof window.saveMasterData !== 'function') {
        throw new Error('industry-commands.js requires storage.js (saveMasterData).');
    }
    if (typeof window.getCurrentYear !== 'function') {
        throw new Error('industry-commands.js requires time.js (getCurrentYear).');
    }
    if (typeof window.getCharacterById !== 'function') {
        throw new Error(
            'industry-commands.js requires accessors.js (getCharacterById).'
        );
    }
    if (typeof window.getPlaceById !== 'function') {
        throw new Error('industry-commands.js requires accessors.js (getPlaceById).');
    }

    var IS = window.IndustryState;
    var RULES = window.IndustryRules;
    var C = window.IndustryConstants;

    // HouseholdCommands is required only when a command actually crosses the
    // household boundary. Verified at call time so that domains that never
    // touch households do not need it loaded. IndustryCommands' own
    // createEnterprise, updateEnterprise, deleteEnterprise, and
    // _applyHouseholdTransfer DO touch households when ownerType ===
    // 'household', so a bootstrap will verify it as a hard dependency.
    function _requireHouseholdCommands() {
        if (typeof window.HouseholdCommands === 'undefined') {
            throw new Error(
                'industry-commands.js: HouseholdCommands is required for ' +
                'household ownership operations but is not loaded.'
            );
        }
        var hc = window.HouseholdCommands;
        var required = [
            'addEnterpriseToHousehold',
            'removeEnterpriseFromHousehold',
            'updateHousehold',
            'commitTransactionEnterpriseOwnership'
        ];
        for (var i = 0; i < required.length; i++) {
            if (typeof hc[required[i]] !== 'function') {
                throw new Error(
                    'industry-commands.js: HouseholdCommands.' +
                    required[i] + ' is required.'
                );
            }
        }
        if (typeof window.getHouseholdById !== 'function') {
            throw new Error(
                'industry-commands.js: getHouseholdById is required for ' +
                'household ownership operations but is not loaded.'
            );
        }
        return hc;
    }

    // =========================================================================
    // 2. RESULT HELPERS
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

    function _failWith(errors) {
        var list = Array.isArray(errors) ? errors : [String(errors)];
        return { success: false, reason: list.join('; ') };
    }

    // =========================================================================
    // 3. VALIDATION HELPERS
    // =========================================================================

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _isPlainObject(v) {
        if (v === null || typeof v !== 'object') return false;
        var proto = Object.getPrototypeOf(v);
        return proto === Object.prototype || proto === null;
    }

    function _isNonNegativeFinite(v) {
        return typeof v === 'number' && Number.isFinite(v) && v >= 0;
    }

    function _resolveYear(value) {
        if (_isMissing(value)) return window.getCurrentYear();
        return value;
    }

    // =========================================================================
    // 4. COMMIT TAIL
    // =========================================================================
    //
    // _commit is NOT a persistence boundary. It publishes an in-process
    // event and dispatches a cross-domain CustomEvent. The mutation
    // primitives on IndustryState have already synced masterData and called
    // markDataDirty. persist() is the caller's explicit save signal.

    function _publish(eventName, payload) {
        if (typeof window.dispatchEvent !== 'function') return;
        if (typeof window.CustomEvent !== 'function') return;
        try {
            window.dispatchEvent(new window.CustomEvent(eventName, {
                detail: payload || {}
            }));
        } catch (e) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn(
                    'industry-commands.js: failed to dispatch ' + eventName, e
                );
            }
        }
    }

    function _commit(eventName, payload) {
        _publish(eventName, payload);
    }

    // =========================================================================
    // 5. PERSIST BOUNDARY
    // =========================================================================

    /**
     * Forces a synchronous flush of masterData to storage.
     *
     * The only call site of saveMasterData in this domain. Batch callers
     * call persist() exactly once at the end.
     */
    function persist() {
        try {
            var ok = window.saveMasterData();
            if (ok === true) return _ok();
            return _fail('saveMasterData returned false');
        } catch (e) {
            return _fail(e && e.message ? e.message : 'saveMasterData threw');
        }
    }

    // =========================================================================
    // 6. CROSS-DOMAIN: HOUSEHOLD
    // =========================================================================
    //
    // Three concerns live here:
    //   1. Reverse-index registration / unregistration (enterprises[]).
    //   2. Wealth transfer (annual processing).
    //   3. Reverse-index reconciliation on owner change (updateEnterprise).
    //
    // Annual wealth transfers and ownership changes use the shared
    // CrossDomainTransaction service. Ownership changes snapshot the source
    // Household, target Household and Enterprise before applying any write.

    function _registerWithHousehold(householdId, enterpriseId, year) {
        var hc = _requireHouseholdCommands();
        var r = hc.addEnterpriseToHousehold(householdId, enterpriseId, {
            year: year
        });
        if (!r || r.success !== true) {
            throw new Error(
                'industry-commands.js: HouseholdCommands.addEnterpriseToHousehold ' +
                'failed for ' + householdId + ' / ' + enterpriseId +
                ': ' + (r && r.reason ? r.reason : 'unknown')
            );
        }
    }

    function _unregisterFromHousehold(householdId, enterpriseId, year) {
        var hc = _requireHouseholdCommands();
        var r = hc.removeEnterpriseFromHousehold(householdId, enterpriseId, {
            year: year
        });
        if (!r || r.success !== true) {
            throw new Error(
                'industry-commands.js: HouseholdCommands.removeEnterpriseFromHousehold ' +
                'failed for ' + householdId + ' / ' + enterpriseId +
                ': ' + (r && r.reason ? r.reason : 'unknown')
            );
        }
    }

    /**
     * Applies a wealth transfer to a household.
     *
     * HouseholdCommands.updateHousehold is the sanctioned path for household
     * wealth writes; there is no adjustWealth primitive. This reads the
     * current wealth via the household record and writes the new total.
     *
     * The getHouseholdById accessor is required to read the current wealth.
     * Verified via _requireHouseholdCommands at call time.
     *
     * M5: writes only `wealth`. Prior revisions also wrote `notes`,
     * overwriting concurrent household note edits based on a stale read.
     * The reason goes into the industry event payload and the household
     * eventLog entry written by HouseholdCommands.updateHousehold.
     */
    function _applyHouseholdTransfer(householdId, amount, reason) {
        _requireHouseholdCommands();
        var household = window.getHouseholdById(householdId);
        if (!household) {
            throw new Error(
                'industry-commands.js: household "' + householdId +
                '" not found while applying transfer.'
            );
        }

        var currentWealth = typeof household.wealth === 'number'
            && Number.isFinite(household.wealth)
            ? household.wealth
            : 0;
        var newWealth = currentWealth + amount;

        var hc = window.HouseholdCommands;
        var r = hc.updateHousehold(householdId, {
            wealth: newWealth
        });
        if (!r || r.success !== true) {
            throw new Error(
                'industry-commands.js: HouseholdCommands.updateHousehold ' +
                'failed for ' + householdId +
                ': ' + (r && r.reason ? r.reason : 'unknown')
            );
        }
    }

    /**
     * Reconciles the household reverse index when an enterprise's owner
     * changes.
     *
     * Called by updateEnterprise after IS._updateEnterprise succeeds and
     * before _commit. Steps:
     *   1. If the enterprise was previously household-owned (and the owner
     *      fields actually changed), remove it from the previous household.
     *   2. If the enterprise is now household-owned (and the owner fields
     *      actually changed), add it to the new household.
     *
     * Rollback semantics: on any failure in step 1 or 2, the industry record
     * is restored to its prior owner shape. If step 2 fails after step 1
     * succeeded, the source-side removal is also rolled back (best effort).
     * The caller sees a structured failure and nothing is committed.
     *
     * Idempotency: if the previous and next (ownerType, ownerId) are
     * identical, this function is a no-op. That is the common case for
     * updates that do not touch ownership.
     *
     * @param {Object} current  the pre-update enterprise record
     * @param {string} nextOwnerType
     * @param {string|null} nextOwnerId
     * @param {number} year
     * @returns {{success: boolean, reason?: string}}
     */
    function _runHouseholdOwnershipTransaction(
        enterpriseId, current, patch, nextOwnerType, nextOwnerId, year, changedFields
    ) {
        var wasHouseholdOwned =
            current.ownerType === C.OWNER_TYPE.HOUSEHOLD && _hasId(current.ownerId);
        var isHouseholdOwned =
            nextOwnerType === C.OWNER_TYPE.HOUSEHOLD && _hasId(nextOwnerId);
        var householdChanges = [];

        if (wasHouseholdOwned) {
            householdChanges.push({
                householdId: current.ownerId,
                enterpriseId: enterpriseId,
                action: 'removed',
                year: year
            });
        }
        if (isHouseholdOwned) {
            householdChanges.push({
                householdId: nextOwnerId,
                enterpriseId: enterpriseId,
                action: 'added',
                year: year
            });
        }

        var householdCommands = _requireHouseholdCommands();
        var householdState = window.HouseholdState;
        var householdInternal = householdState && householdState._internal;
        if (!householdInternal ||
            typeof householdInternal.getHouseholdRecord !== 'function' ||
            typeof householdInternal.transactionSnapshotHousehold !== 'function' ||
            typeof householdInternal.transactionRestoreHousehold !== 'function' ||
            typeof householdCommands.commitTransactionEnterpriseOwnership !== 'function' ||
            typeof IS._transactionSnapshotEnterprise !== 'function' ||
            typeof IS._transactionRestoreEnterprise !== 'function' ||
            typeof IS._notifyTransactionEnterpriseUpdated !== 'function' ||
            !window.CrossDomainTransaction ||
            typeof window.CrossDomainTransaction.execute !== 'function') {
            return {
                success: false,
                code: 'TRANSACTION_UNAVAILABLE',
                reason: 'Required cross-domain ownership transaction support is unavailable.'
            };
        }

        var uniqueHouseholdIds = [];
        householdChanges.forEach(function(change) {
            if (uniqueHouseholdIds.indexOf(change.householdId) === -1) {
                uniqueHouseholdIds.push(change.householdId);
            }
        });

        var participants = [{
            name: 'households',
            prepare: function() {
                for (var i = 0; i < uniqueHouseholdIds.length; i++) {
                    var householdId = uniqueHouseholdIds[i];
                    var household = householdInternal.getHouseholdRecord(householdId);
                    if (!household) {
                        return {
                            success: false,
                            reason: 'Household not found: ' + householdId
                        };
                    }
                    if (!Array.isArray(household.enterprises) &&
                        wasHouseholdOwned && householdId === current.ownerId) {
                        return {
                            success: false,
                            reason: 'Source Household has no valid enterprises reverse index: ' +
                                householdId
                        };
                    }
                    var count = Array.isArray(household.enterprises)
                        ? household.enterprises.filter(function(id) {
                            return id === enterpriseId;
                        }).length
                        : 0;
                    if (wasHouseholdOwned && householdId === current.ownerId && count !== 1) {
                        return {
                            success: false,
                            reason: 'Source Household must contain exactly one reference to Enterprise ' +
                                enterpriseId + '.'
                        };
                    }
                    if (isHouseholdOwned && householdId === nextOwnerId &&
                        householdId !== current.ownerId && count !== 0) {
                        return {
                            success: false,
                            reason: 'Target Household already contains Enterprise ' +
                                enterpriseId + ' or has duplicate references.'
                        };
                    }
                }
                return { success: true };
            },
            snapshot: function() {
                return uniqueHouseholdIds.map(function(householdId) {
                    var snapshot = householdInternal.transactionSnapshotHousehold(
                        householdId
                    );
                    if (!snapshot) {
                        throw new Error('Could not snapshot Household: ' + householdId);
                    }
                    return snapshot;
                });
            },
            apply: function() {
                for (var i = 0; i < householdChanges.length; i++) {
                    var change = householdChanges[i];
                    var result = change.action === 'removed'
                        ? householdCommands.removeEnterpriseFromHousehold(
                            change.householdId,
                            enterpriseId,
                            { year: year, deferCommit: true }
                        )
                        : householdCommands.addEnterpriseToHousehold(
                            change.householdId,
                            enterpriseId,
                            { year: year, deferCommit: true }
                        );
                    if (!result || result.success !== true) {
                        return {
                            success: false,
                            reason: result && result.reason
                                ? result.reason
                                : 'Household reverse-index update failed.'
                        };
                    }
                }
                return { success: true };
            },
            rollback: function(snapshots) {
                var rollbackErrors = [];
                for (var i = snapshots.length - 1; i >= 0; i--) {
                    try {
                        var restored = householdInternal.transactionRestoreHousehold(snapshots[i]);
                        if (restored === false ||
                            (restored && restored.success === false)) {
                            rollbackErrors.push(
                                restored && restored.reason
                                    ? restored.reason : 'Household restore was rejected.'
                            );
                        }
                    } catch (rollbackError) {
                        rollbackErrors.push(
                            rollbackError && rollbackError.message
                                ? rollbackError.message : 'Household restore failed.'
                        );
                    }
                }
                if (rollbackErrors.length) {
                    throw new Error(rollbackErrors.join('; '));
                }
                return true;
            },
            afterCommit: function() {
                var committed = householdCommands.commitTransactionEnterpriseOwnership(
                    householdChanges
                );
                if (!committed || committed.success !== true) {
                    throw new Error(
                        committed && committed.reason
                            ? committed.reason
                            : 'Household ownership notifications failed.'
                    );
                }
            }
        }];

        participants.push({
            name: 'industry',
            prepare: function() {
                return IS.getEnterprise(enterpriseId)
                    ? { success: true }
                    : { success: false, reason: 'Enterprise disappeared before ownership update.' };
            },
            snapshot: function() {
                var snapshot = IS._transactionSnapshotEnterprise(enterpriseId);
                if (!snapshot) {
                    throw new Error('Could not snapshot Enterprise: ' + enterpriseId);
                }
                return snapshot;
            },
            apply: function() {
                var updated = IS._updateEnterprise(enterpriseId, patch, {
                    silent: true
                });
                return updated
                    ? { success: true }
                    : { success: false, reason: 'IndustryState refused the ownership update.' };
            },
            rollback: function(snapshot) {
                return IS._transactionRestoreEnterprise(snapshot);
            },
            afterCommit: function() {
                IS._notifyTransactionEnterpriseUpdated(enterpriseId);
                _commit(C.EVENT.ENTERPRISE_UPDATED, {
                    enterpriseId: enterpriseId,
                    changedFields: changedFields.slice(),
                    transaction: true
                });
            }
        });

        var transaction = window.CrossDomainTransaction.execute({
            id: 'industry-ownership-' + enterpriseId + '-' + year,
            context: {
                enterpriseId: enterpriseId,
                sourceHouseholdId: wasHouseholdOwned ? current.ownerId : null,
                targetHouseholdId: isHouseholdOwned ? nextOwnerId : null,
                year: year
            },
            participants: participants
        });

        if (!transaction || transaction.success !== true) {
            return {
                success: false,
                code: transaction && transaction.code
                    ? transaction.code : 'TRANSACTION_FAILED',
                reason: transaction && transaction.reason
                    ? transaction.reason : 'Enterprise ownership transaction failed.',
                transaction: transaction || null
            };
        }

        return {
            success: true,
            transactionId: transaction.transactionId,
            notificationErrors: transaction.notificationErrors || []
        };
    }

    // =========================================================================
    // 7. ENTERPRISE LIFECYCLE — CREATE
    // =========================================================================

    /**
     * Creates a new enterprise.
     *
     * Input data:
     *   {
     *     name,                    required
     *     typeId,                  required
     *     ownerType,               optional; defaults to 'none'
     *     ownerId,                 optional; required when ownerType != 'none'
     *     ownershipType,           optional; derived from ownerType if omitted
     *     locationId,              optional; defaults to null
     *     wealth, debt, income, expenses, wages,
     *     maxWorkers,              optional; default to type defaults
     *     status,                  optional; defaults to 'active'
     *     foundedYear,             optional; defaults to currentYear
     *     notes                    optional; defaults to ''
     *   }
     */
    function createEnterprise(data) {
        if (!_isPlainObject(data)) {
            return _fail('Enterprise data must be a plain object.');
        }

        var inputValidation = RULES.validateCreateInput(data);
        if (!inputValidation.valid) {
            return _failWith(inputValidation.errors);
        }

        var type = IS.getEnterpriseType(data.typeId);
        if (!type) {
            return _fail('Enterprise type not found: ' + data.typeId);
        }

        var currentYear = window.getCurrentYear();
        var now = Date.now();

        // Resolve owner defaults.
        var ownerType = _isMissing(data.ownerType)
            ? C.OWNER_TYPE.NONE
            : data.ownerType;
        var ownerId = _isMissing(data.ownerId) ? null : data.ownerId;

        // Resolve ownership type from ownerType if omitted.
        var ownershipType;
        if (!_isMissing(data.ownershipType)) {
            ownershipType = data.ownershipType;
        } else {
            ownershipType = C.PLACE_OWNER_TYPES.indexOf(ownerType) !== -1
                ? C.OWNERSHIP_TYPE.PUBLIC
                : C.OWNERSHIP_TYPE.PRIVATE;
        }

        // Ownership coherence: public must be owned by settlement or state.
        var ownershipCheck = RULES.canApplyOwnershipChange(
            { ownershipType: ownershipType, ownerType: ownerType, ownerId: ownerId },
            { ownershipType: ownershipType, ownerType: ownerType, ownerId: ownerId }
        );
        if (!ownershipCheck.valid) {
            return _fail(ownershipCheck.reason);
        }

        // Ownership references must resolve. Character, household, place.
        if (ownerType === C.OWNER_TYPE.CHARACTER && ownerId) {
            if (!window.getCharacterById(ownerId)) {
                return _fail('Owner character not found: ' + ownerId);
            }
        }
        if (ownerType === C.OWNER_TYPE.HOUSEHOLD && ownerId) {
            if (typeof window.getHouseholdById !== 'function') {
                return _fail(
                    'getHouseholdById is not loaded; cannot assign household owner.'
                );
            }
            if (!window.getHouseholdById(ownerId)) {
                return _fail('Owner household not found: ' + ownerId);
            }
        }
        if (C.PLACE_OWNER_TYPES.indexOf(ownerType) !== -1 && ownerId) {
            if (!window.getPlaceById(ownerId)) {
                return _fail('Owner place not found: ' + ownerId);
            }
        }

        if (!_isMissing(data.locationId)) {
            if (!window.getPlaceById(data.locationId)) {
                return _fail('Location not found: ' + data.locationId);
            }
        }

        var foundedYear = _isMissing(data.foundedYear)
            ? currentYear
            : data.foundedYear;

        // Resolve shape with type defaults for missing financials.
        var shaped = RULES.applyEnterpriseDefaults({
            name: data.name,
            typeId: data.typeId,
            ownershipType: ownershipType,
            ownerType: ownerType,
            ownerId: ownerId,
            locationId: _isMissing(data.locationId) ? null : data.locationId,
            wealth: data.wealth,
            debt: data.debt,
            income: data.income,
            expenses: data.expenses,
            wages: data.wages,
            maxWorkers: data.maxWorkers,
            status: _isMissing(data.status) ? C.STATUS.ACTIVE : data.status,
            foundedYear: foundedYear,
            lastProcessedYear: foundedYear,
            notes: _isMissing(data.notes) ? '' : data.notes
        }, type);

        // Stamp identity and timestamps.
        var candidate = Object.assign({}, shaped, {
            id: window.generateId('ent'),
            createdAt: now,
            updatedAt: now
        });

        // Initial history: type assignment.
        candidate.history.push({
            year: foundedYear,
            type: 'type_assigned',
            typeId: type.id,
            typeName: type.name,
            category: type.category,
            timestamp: now
        });

        // Initial history: owner assignment, if the caller supplied a name.
        if (ownerType !== C.OWNER_TYPE.NONE && _hasId(data.ownerName)) {
            candidate.history.push({
                year: foundedYear,
                type: 'owner_assigned',
                ownerType: ownerType,
                ownerId: ownerId,
                ownerName: data.ownerName,
                timestamp: now
            });
        }

        var validation = RULES.validateEnterprise(candidate);
        if (!validation.valid) {
            return _failWith(validation.errors);
        }

        var transaction = window.CrossDomainTransaction;
        if (!transaction || typeof transaction.execute !== 'function' ||
            typeof transaction.isActive !== 'function' ||
            typeof IS._addEnterprise !== 'function' ||
            typeof IS._removeEnterprise !== 'function' ||
            typeof IS._notifyTransactionEnterpriseAdded !== 'function') {
            return _fail('Cross-domain transaction support is unavailable.');
        }

        var householdOwned = ownerType === C.OWNER_TYPE.HOUSEHOLD && !!ownerId;
        var householdState = window.HouseholdState;
        var householdInternal = householdState && householdState._internal;
        var householdCommands = householdOwned ? _requireHouseholdCommands() : null;
        if (householdOwned && (!householdInternal ||
            typeof householdInternal.transactionSnapshotHousehold !== 'function' ||
            typeof householdInternal.transactionRestoreHousehold !== 'function')) {
            return _fail('Household transaction support is unavailable.');
        }

        var participants = [];
        if (householdOwned) {
            participants.push({
                name: 'household',
                prepare: function() {
                    var household = householdInternal.getHouseholdRecord(ownerId);
                    if (!household) return { success: false, reason: 'Owner household not found.' };
                    if (Array.isArray(household.enterprises) &&
                        household.enterprises.indexOf(candidate.id) !== -1) {
                        return { success: false, reason: 'Household already references the new Enterprise ID.' };
                    }
                    return true;
                },
                snapshot: function() {
                    return householdInternal.transactionSnapshotHousehold(ownerId);
                },
                apply: function() {
                    var result = householdCommands.addEnterpriseToHousehold(
                        ownerId, candidate.id, { year: foundedYear, deferCommit: true }
                    );
                    return result && result.success === true
                        ? true
                        : { success: false, reason: result && result.reason || 'Household registration failed.' };
                },
                rollback: function(snapshot) {
                    return householdInternal.transactionRestoreHousehold(snapshot);
                },
                afterCommit: function() {
                    var result = householdCommands.commitTransactionEnterpriseOwnership([{
                        householdId: ownerId, enterpriseId: candidate.id,
                        action: 'added', year: foundedYear
                    }]);
                    if (!result || result.success !== true) throw new Error(result && result.reason || 'Household notification failed.');
                }
            });
        }

        participants.push({
            name: 'industry',
            prepare: function() {
                if (IS.getEnterprise(candidate.id)) {
                    return { success: false, reason: 'Generated Enterprise ID already exists.' };
                }
                return true;
            },
            snapshot: function() { return null; },
            apply: function() {
                IS._addEnterprise(candidate, { silent: true });
                return true;
            },
            rollback: function() {
                if (!IS.getEnterprise(candidate.id)) return true;
                return IS._removeEnterprise(candidate.id, { silent: true });
            },
            afterCommit: function() {
                IS._notifyTransactionEnterpriseAdded(candidate.id);
            }
        });

        var result = transaction.execute({ participants: participants });
        if (!result || result.success !== true) {
            return {
                success: false,
                code: result && result.code || 'TRANSACTION_FAILED',
                reason: result && result.reason || 'Enterprise creation transaction failed.',
                rollbackErrors: result && result.rollbackErrors || []
            };
        }

        _commit(C.EVENT.ENTERPRISE_ADDED, {
            enterpriseId: candidate.id,
            name: candidate.name,
            ownerType: ownerType,
            ownerId: ownerId
        });

        return _ok({ enterprise: IS.getEnterprise(candidate.id) });
    }

    // =========================================================================
    // 8. ENTERPRISE LIFECYCLE — UPDATE
    // =========================================================================

    /**
     * Updates an enterprise.
     *
     * Writable fields:
     *   name, typeId, ownershipType, ownerType, ownerId, locationId,
     *   wealth, debt, income, expenses, wages, maxWorkers, status,
     *   lastProcessedYear, notes
     *
     * NOTE: workerList and workerWages are NOT in the allowlist. Callers
     * must use addWorkerToEnterprise / removeWorkerFromEnterprise /
     * setWorkerWage. Prior revisions accepted them, which invited a
     * generic update to produce a workerList / workerWages pair that
     * validateEnterprise would then reject with an opaque error.
     *
     * NOTE: wealth and debt are rejected while status is in
     * FINANCIALS_FROZEN_STATUSES, and the combination
     * { status: 'demolished', wealth } / { status: 'demolished', debt }
     * is rejected in a single call. Callers use updateEnterpriseWealth /
     * updateEnterpriseDebt, which enforce the same rule.
     *
     * OWNER CHANGE RECONCILIATION: if ownerType / ownerId change, the
     * household reverse index is reconciled after the industry record is
     * updated. Household-owned transitions use
     * _runHouseholdOwnershipTransaction so both reverse-index sides and the
     * Enterprise record share one rollback boundary.
     */
    var _ALLOWED_UPDATE_FIELDS = {
        name: true,
        typeId: true,
        ownershipType: true,
        ownerType: true,
        ownerId: true,
        locationId: true,
        wealth: true,
        debt: true,
        income: true,
        expenses: true,
        wages: true,
        maxWorkers: true,
        status: true,
        lastProcessedYear: true,
        notes: true
    };

    function updateEnterprise(enterpriseId, updates) {
        if (!_hasId(enterpriseId)) return _fail('Enterprise id is required.');
        if (!_isPlainObject(updates)) return _fail('Updates must be a plain object.');

        var current = IS.getEnterprise(enterpriseId);
        if (!current) return _fail('Enterprise not found.');

        var shapeValidation = RULES.validateUpdateInput(updates);
        if (!shapeValidation.valid) {
            return _failWith(shapeValidation.errors);
        }

        // Command-layer allowlist. RULES already rejected derived and
        // domain-owned fields; this catches the remaining case (a field name
        // that is simply not writable).
        for (var key in updates) {
            if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;
            if (!_ALLOWED_UPDATE_FIELDS[key]) {
                return _fail(
                    'Field "' + key + '" is not a writable enterprise field. ' +
                    'Use the dedicated command for workers ' +
                    '(addWorkerToEnterprise / removeWorkerFromEnterprise / ' +
                    'setWorkerWage) or financial mutations ' +
                    '(updateEnterpriseWealth / updateEnterpriseDebt).'
                );
            }
        }

        // Frozen-status financial guard. Reject wealth / debt writes when
        // the current status is in FINANCIALS_FROZEN_STATUSES, and reject
        // the single-call combination { status: 'demolished', wealth/debt }.
        var touchesWealth = Object.prototype.hasOwnProperty.call(updates, 'wealth');
        var touchesDebt = Object.prototype.hasOwnProperty.call(updates, 'debt');
        var touchesStatus = Object.prototype.hasOwnProperty.call(updates, 'status');

        if (touchesWealth || touchesDebt) {
            var currentFrozen =
                C.FINANCIALS_FROZEN_STATUSES.indexOf(current.status) !== -1;
            if (currentFrozen) {
                return _fail(
                    'Cannot modify wealth/debt of a ' + current.status +
                    ' enterprise.'
                );
            }
            if (touchesStatus
                && C.FINANCIALS_FROZEN_STATUSES.indexOf(updates.status) !== -1) {
                return _fail(
                    'Cannot modify wealth/debt in the same update that sets ' +
                    'status to "' + updates.status + '".'
                );
            }
        }

        var currentYear = window.getCurrentYear();
        var now = Date.now();

        var patch = { updatedAt: now };

        // --- Ownership change coherence ---
        var ownerChanged =
            (Object.prototype.hasOwnProperty.call(updates, 'ownerType')
                && updates.ownerType !== current.ownerType) ||
            (Object.prototype.hasOwnProperty.call(updates, 'ownerId')
                && updates.ownerId !== current.ownerId);

        var nextOwnershipType = Object.prototype.hasOwnProperty.call(
            updates, 'ownershipType'
        ) ? updates.ownershipType : current.ownershipType;
        var nextOwnerType = Object.prototype.hasOwnProperty.call(
            updates, 'ownerType'
        ) ? updates.ownerType : current.ownerType;
        var nextOwnerId = Object.prototype.hasOwnProperty.call(
            updates, 'ownerId'
        ) ? updates.ownerId : current.ownerId;

        if (ownerChanged || Object.prototype.hasOwnProperty.call(updates, 'ownershipType')) {
            var coherence = RULES.canApplyOwnershipChange(current, {
                ownershipType: nextOwnershipType,
                ownerType: nextOwnerType,
                ownerId: nextOwnerId
            });
            if (!coherence.valid) {
                return _fail(coherence.reason);
            }

            // Verify owner references resolve.
            if (nextOwnerType === C.OWNER_TYPE.CHARACTER && nextOwnerId) {
                if (!window.getCharacterById(nextOwnerId)) {
                    return _fail('Owner character not found: ' + nextOwnerId);
                }
            }
            if (nextOwnerType === C.OWNER_TYPE.HOUSEHOLD && nextOwnerId) {
                if (typeof window.getHouseholdById !== 'function'
                    || !window.getHouseholdById(nextOwnerId)) {
                    return _fail('Owner household not found: ' + nextOwnerId);
                }
            }
            if (C.PLACE_OWNER_TYPES.indexOf(nextOwnerType) !== -1 && nextOwnerId) {
                if (!window.getPlaceById(nextOwnerId)) {
                    return _fail('Owner place not found: ' + nextOwnerId);
                }
            }
        }

        // --- Type change history ---
        if (Object.prototype.hasOwnProperty.call(updates, 'typeId')
            && updates.typeId !== current.typeId) {
            var newType = IS.getEnterpriseType(updates.typeId);
            if (!newType) {
                return _fail('Enterprise type not found: ' + updates.typeId);
            }
            if (!Array.isArray(patch.history)) patch.history = current.history.slice();
            patch.history.push({
                year: currentYear,
                type: 'type_changed',
                previousTypeId: current.typeId,
                newTypeId: newType.id,
                newTypeName: newType.name,
                newCategory: newType.category,
                timestamp: now
            });
        }

        // --- Owner change history ---
        if (ownerChanged && _hasId(updates.ownerName)) {
            if (!Array.isArray(patch.history)) patch.history = current.history.slice();
            patch.history.push({
                year: currentYear,
                type: 'owner_changed',
                previousOwnerType: current.ownerType,
                previousOwnerId: current.ownerId,
                newOwnerType: nextOwnerType,
                newOwnerId: nextOwnerId,
                newOwnerName: updates.ownerName,
                timestamp: now
            });
        }

        // --- Copy writable fields ---
        for (var f in updates) {
            if (!Object.prototype.hasOwnProperty.call(updates, f)) continue;
            if (f === 'history' || f === 'updatedAt') continue;
            if (f === 'ownerName') continue;   // history only
            if (f === 'id' || f === 'createdAt') continue; // not writable
            if (f === 'maxWorkers' && !_isNonNegativeFinite(updates.maxWorkers)) {
                return _fail('maxWorkers must be a non-negative finite number.');
            }
            if ((f === 'wealth' || f === 'income'
                || f === 'expenses' || f === 'wages'
                || f === 'debt') && !_isNonNegativeFinite(updates[f])
                && f !== 'wealth') {
                return _fail(f + ' must be a non-negative finite number.');
            }
            if (f === 'wealth'
                && !(typeof updates.wealth === 'number' && Number.isFinite(updates.wealth))) {
                return _fail('wealth must be a finite number.');
            }
            patch[f] = updates[f];
        }

        var candidate = Object.assign({}, current, patch);
        var validation = RULES.validateEnterprise(candidate);
        if (!validation.valid) {
            return _failWith(validation.errors);
        }

        var changedFields = Object.keys(updates);
        var householdOwnershipChanged = ownerChanged &&
            (current.ownerType === C.OWNER_TYPE.HOUSEHOLD ||
                nextOwnerType === C.OWNER_TYPE.HOUSEHOLD);

        if (householdOwnershipChanged) {
            var transactionResult = _runHouseholdOwnershipTransaction(
                enterpriseId,
                current,
                patch,
                nextOwnerType,
                nextOwnerId,
                currentYear,
                changedFields
            );
            if (!transactionResult.success) {
                return {
                    success: false,
                    code: transactionResult.code || 'TRANSACTION_FAILED',
                    reason: transactionResult.reason ||
                        'Household ownership transaction failed.',
                    transaction: transactionResult.transaction || null
                };
            }
            return _ok({
                enterprise: IS.getEnterprise(enterpriseId),
                transactionId: transactionResult.transactionId,
                notificationErrors: transactionResult.notificationErrors || []
            });
        }

        try {
            IS._updateEnterprise(enterpriseId, patch);
        } catch (e) {
            return _fail(e && e.message
                ? e.message
                : 'IndustryState refused the write.');
        }

        _commit(C.EVENT.ENTERPRISE_UPDATED, {
            enterpriseId: enterpriseId,
            changedFields: changedFields
        });

        return _ok({ enterprise: IS.getEnterprise(enterpriseId) });
    }

    // =========================================================================
    // 9. ENTERPRISE LIFECYCLE — DELETE
    // =========================================================================

    function deleteEnterprise(enterpriseId) {
        if (!_hasId(enterpriseId)) return _fail('Enterprise id is required.');

        var enterprise = IS.getEnterprise(enterpriseId);
        if (!enterprise) return _fail('Enterprise not found.');

        var currentYear = window.getCurrentYear();
        var householdOwned = enterprise.ownerType === C.OWNER_TYPE.HOUSEHOLD &&
            _hasId(enterprise.ownerId);
        var transaction = window.CrossDomainTransaction;
        if (!transaction || typeof transaction.execute !== 'function' ||
            typeof IS._transactionSnapshotEnterprise !== 'function' ||
            typeof IS._transactionRestoreDeletedEnterprise !== 'function' ||
            typeof IS._notifyTransactionEnterpriseDeleted !== 'function') {
            return _fail('Cross-domain transaction support is unavailable.');
        }

        var householdState = window.HouseholdState;
        var householdInternal = householdState && householdState._internal;
        var householdCommands = householdOwned ? _requireHouseholdCommands() : null;
        if (householdOwned && (!householdInternal ||
            typeof householdInternal.transactionSnapshotHousehold !== 'function' ||
            typeof householdInternal.transactionRestoreHousehold !== 'function')) {
            return _fail('Household transaction support is unavailable.');
        }

        var participants = [];
        if (householdOwned) {
            participants.push({
                name: 'household',
                prepare: function() {
                    var household = householdInternal.getHouseholdRecord(enterprise.ownerId);
                    if (!household || !Array.isArray(household.enterprises)) {
                        return { success: false, reason: 'Source Household has no valid Enterprise reverse index.' };
                    }
                    var count = household.enterprises.filter(function(id) {
                        return id === enterpriseId;
                    }).length;
                    return count === 1
                        ? true
                        : { success: false, reason: 'Source Household must contain exactly one reference to this Enterprise.' };
                },
                snapshot: function() {
                    return householdInternal.transactionSnapshotHousehold(enterprise.ownerId);
                },
                apply: function() {
                    var result = householdCommands.removeEnterpriseFromHousehold(
                        enterprise.ownerId, enterpriseId,
                        { year: currentYear, deferCommit: true }
                    );
                    return result && result.success === true
                        ? true
                        : { success: false, reason: result && result.reason || 'Household unregistration failed.' };
                },
                rollback: function(snapshot) {
                    return householdInternal.transactionRestoreHousehold(snapshot);
                },
                afterCommit: function() {
                    var result = householdCommands.commitTransactionEnterpriseOwnership([{
                        householdId: enterprise.ownerId, enterpriseId: enterpriseId,
                        action: 'removed', year: currentYear
                    }]);
                    if (!result || result.success !== true) throw new Error(result && result.reason || 'Household notification failed.');
                }
            });
        }

        participants.push({
            name: 'industry',
            prepare: function() {
                return IS.getEnterprise(enterpriseId)
                    ? true
                    : { success: false, reason: 'Enterprise no longer exists.' };
            },
            snapshot: function() {
                return IS._transactionSnapshotEnterprise(enterpriseId);
            },
            apply: function() {
                return IS._removeEnterprise(enterpriseId, { silent: true });
            },
            rollback: function(snapshot) {
                if (IS.getEnterprise(enterpriseId)) return true;
                return IS._transactionRestoreDeletedEnterprise(snapshot);
            },
            afterCommit: function() {
                IS._notifyTransactionEnterpriseDeleted(enterpriseId);
            }
        });

        var result = transaction.execute({ participants: participants });
        if (!result || result.success !== true) {
            return {
                success: false,
                code: result && result.code || 'TRANSACTION_FAILED',
                reason: result && result.reason || 'Enterprise deletion transaction failed.',
                rollbackErrors: result && result.rollbackErrors || []
            };
        }

        _commit(C.EVENT.ENTERPRISE_DELETED, {
            enterpriseId: enterpriseId,
            name: enterprise.name
        });

        return _ok({ enterpriseId: enterpriseId });
    }

    // =========================================================================
    // 10. WORKER MANAGEMENT
    // =========================================================================

    function addWorkerToEnterprise(enterpriseId, workerId, wage) {
        if (!_hasId(enterpriseId)) return _fail('Enterprise id is required.');
        if (!_hasId(workerId)) return _fail('Worker id is required.');

        var enterprise = IS.getEnterprise(enterpriseId);
        if (!enterprise) return _fail('Enterprise not found.');

        if (C.WORKER_BLOCKED_STATUSES.indexOf(enterprise.status) !== -1) {
            return _fail(
                'Cannot add workers to a ' + enterprise.status + ' enterprise.'
            );
        }

        if (!window.getCharacterById(workerId)) {
            return _fail('Worker character not found: ' + workerId);
        }

        if (enterprise.workerList.indexOf(workerId) !== -1) {
            return _fail('Character is already a worker.');
        }

        if (enterprise.workerList.length >= enterprise.maxWorkers) {
            return _fail('Enterprise is at maximum worker capacity.');
        }

        var resolvedWage = wage;
        if (_isMissing(resolvedWage)) {
            resolvedWage = enterprise.wages;
        }
        if (!_isNonNegativeFinite(resolvedWage)) {
            return _fail('Wage must be a non-negative finite number.');
        }

        var newWorkerList = enterprise.workerList.slice();
        newWorkerList.push(workerId);
        var newWorkerWages = Object.assign({}, enterprise.workerWages);
        newWorkerWages[workerId] = resolvedWage;

        var patch = {
            workerList: newWorkerList,
            workerWages: newWorkerWages,
            updatedAt: Date.now()
        };

        var candidate = Object.assign({}, enterprise, patch);
        var validation = RULES.validateEnterprise(candidate);
        if (!validation.valid) {
            return _failWith(validation.errors);
        }

        try {
            IS._updateEnterprise(enterpriseId, patch);
        } catch (e) {
            return _fail(e && e.message
                ? e.message
                : 'IndustryState refused the write.');
        }

        _commit(C.EVENT.ENTERPRISE_UPDATED, {
            enterpriseId: enterpriseId,
            workerId: workerId,
            action: 'worker_added'
        });

        return _ok({
            enterpriseId: enterpriseId,
            workerId: workerId,
            wage: resolvedWage
        });
    }

    function removeWorkerFromEnterprise(enterpriseId, workerId) {
        if (!_hasId(enterpriseId)) return _fail('Enterprise id is required.');
        if (!_hasId(workerId)) return _fail('Worker id is required.');

        var enterprise = IS.getEnterprise(enterpriseId);
        if (!enterprise) return _fail('Enterprise not found.');

        var idx = enterprise.workerList.indexOf(workerId);
        if (idx === -1) return _fail('Worker not found in enterprise.');

        var newWorkerList = enterprise.workerList.slice();
        newWorkerList.splice(idx, 1);
        var newWorkerWages = Object.assign({}, enterprise.workerWages);
        delete newWorkerWages[workerId];

        var patch = {
            workerList: newWorkerList,
            workerWages: newWorkerWages,
            updatedAt: Date.now()
        };

        try {
            IS._updateEnterprise(enterpriseId, patch);
        } catch (e) {
            return _fail(e && e.message
                ? e.message
                : 'IndustryState refused the write.');
        }

        _commit(C.EVENT.ENTERPRISE_UPDATED, {
            enterpriseId: enterpriseId,
            workerId: workerId,
            action: 'worker_removed'
        });

        return _ok({ enterpriseId: enterpriseId, workerId: workerId });
    }

    function setWorkerWage(enterpriseId, workerId, wage) {
        if (!_hasId(enterpriseId)) return _fail('Enterprise id is required.');
        if (!_hasId(workerId)) return _fail('Worker id is required.');
        if (!_isNonNegativeFinite(wage)) {
            return _fail('Wage must be a non-negative finite number.');
        }

        var enterprise = IS.getEnterprise(enterpriseId);
        if (!enterprise) return _fail('Enterprise not found.');

        if (enterprise.workerList.indexOf(workerId) === -1) {
            return _fail('Worker not found in enterprise.');
        }

        var newWorkerWages = Object.assign({}, enterprise.workerWages);
        newWorkerWages[workerId] = wage;

        var patch = {
            workerWages: newWorkerWages,
            updatedAt: Date.now()
        };

        try {
            IS._updateEnterprise(enterpriseId, patch);
        } catch (e) {
            return _fail(e && e.message
                ? e.message
                : 'IndustryState refused the write.');
        }

        _commit(C.EVENT.ENTERPRISE_UPDATED, {
            enterpriseId: enterpriseId,
            workerId: workerId,
            action: 'wage_updated'
        });

        return _ok({ enterpriseId: enterpriseId, workerId: workerId, wage: wage });
    }

    // =========================================================================
    // 11. FINANCIAL OPERATIONS
    // =========================================================================

    function updateEnterpriseWealth(enterpriseId, amount, reason) {
        if (!_hasId(enterpriseId)) return _fail('Enterprise id is required.');
        if (typeof amount !== 'number' || !Number.isFinite(amount)) {
            return _fail('Amount must be a finite number.');
        }

        var enterprise = IS.getEnterprise(enterpriseId);
        if (!enterprise) return _fail('Enterprise not found.');

        if (C.FINANCIALS_FROZEN_STATUSES.indexOf(enterprise.status) !== -1) {
            return _fail(
                'Cannot modify wealth of a ' + enterprise.status + ' enterprise.'
            );
        }

        var newWealth = enterprise.wealth + amount;
        var currentYear = window.getCurrentYear();

        var newHistory = enterprise.history.slice();
        newHistory.push({
            year: currentYear,
            type: 'wealth_change',
            amount: amount,
            newWealth: newWealth,
            reason: _isMissing(reason) ? null : reason,
            timestamp: Date.now()
        });

        var patch = {
            wealth: newWealth,
            history: newHistory,
            updatedAt: Date.now()
        };

        try {
            IS._updateEnterprise(enterpriseId, patch);
        } catch (e) {
            return _fail(e && e.message
                ? e.message
                : 'IndustryState refused the write.');
        }

        _commit(C.EVENT.ENTERPRISE_UPDATED, {
            enterpriseId: enterpriseId,
            action: 'wealth_updated',
            amount: amount
        });

        return _ok({ newWealth: newWealth, change: amount });
    }

    function updateEnterpriseDebt(enterpriseId, amount, reason) {
        if (!_hasId(enterpriseId)) return _fail('Enterprise id is required.');
        if (typeof amount !== 'number' || !Number.isFinite(amount)) {
            return _fail('Amount must be a finite number.');
        }

        var enterprise = IS.getEnterprise(enterpriseId);
        if (!enterprise) return _fail('Enterprise not found.');

        if (C.FINANCIALS_FROZEN_STATUSES.indexOf(enterprise.status) !== -1) {
            return _fail(
                'Cannot modify debt of a ' + enterprise.status + ' enterprise.'
            );
        }

        var newDebt = Math.max(0, enterprise.debt + amount);
        var currentYear = window.getCurrentYear();

        var newHistory = enterprise.history.slice();
        newHistory.push({
            year: currentYear,
            type: 'debt_change',
            amount: amount,
            newDebt: newDebt,
            reason: _isMissing(reason) ? null : reason,
            timestamp: Date.now()
        });

        var patch = {
            debt: newDebt,
            history: newHistory,
            updatedAt: Date.now()
        };

        try {
            IS._updateEnterprise(enterpriseId, patch);
        } catch (e) {
            return _fail(e && e.message
                ? e.message
                : 'IndustryState refused the write.');
        }

        _commit(C.EVENT.ENTERPRISE_UPDATED, {
            enterpriseId: enterpriseId,
            action: 'debt_updated',
            amount: amount
        });

        return _ok({ newDebt: newDebt, change: amount });
    }

    // =========================================================================
    // 12. ANNUAL PROCESSING
    // =========================================================================

    /**
     * Commits the result of IndustryEconomics.calculateAnnualTransition.
     *
     * The result must pass validateAnnualTransitionResult. Household
     * wealth and the Enterprise annual result are coordinated as separate
     * transaction participants. Both are snapshotted before mutation,
     * notifications are deferred until persistence succeeds, and either
     * participant is restored if an apply or persistence step fails.
     */
    function applyAnnualProcessing(enterpriseId, result, options) {
        options = options || {};
        if (!_hasId(enterpriseId)) return _fail('Enterprise id is required.');
        if (!window.CrossDomainTransaction ||
            typeof window.CrossDomainTransaction.execute !== 'function') {
            return _fail('CrossDomainTransaction is required for annual processing.');
        }

        var validation = RULES.validateAnnualTransitionResult(result);
        if (!validation.valid) return _failWith(validation.errors);

        var enterprise = IS.getEnterprise(enterpriseId);
        if (!enterprise) return _fail('Enterprise not found.');

        var patch = { updatedAt: Date.now() };
        if (typeof result.newWealth === 'number') patch.wealth = result.newWealth;
        if (typeof result.newDebt === 'number') patch.debt = result.newDebt;
        if (!_isMissing(result.nextStatus)) patch.status = result.nextStatus;
        if (typeof result.currentYear === 'number') {
            patch.lastProcessedYear = result.currentYear;
        }

        var newHistory = enterprise.history.slice();
        if (Array.isArray(result.historyEntries)) {
            for (var i = 0; i < result.historyEntries.length; i++) {
                newHistory.push(result.historyEntries[i]);
            }
        }
        patch.history = newHistory;

        var candidate = Object.assign({}, enterprise, patch);
        var enterpriseValidation = RULES.validateEnterprise(candidate);
        if (!enterpriseValidation.valid) return _failWith(enterpriseValidation.errors);

        var householdId = _hasId(result.householdId) ? result.householdId : null;
        var householdTransfer = householdId ? result.householdTransfer : null;
        if (householdId && (typeof householdTransfer !== 'number' ||
            !Number.isFinite(householdTransfer))) {
            return _fail('Household transfer must be a finite number.');
        }

        var participants = [];

        if (householdId) {
            var householdCommands = window.HouseholdCommands;
            var householdState = window.HouseholdState;
            var householdInternal = householdState && householdState._internal;
            if (!householdCommands ||
                typeof householdCommands.updateHousehold !== 'function' ||
                typeof householdCommands.commitTransactionUpdate !== 'function' ||
                !householdInternal ||
                typeof householdInternal.getHouseholdRecord !== 'function' ||
                typeof householdInternal.transactionSnapshotHousehold !== 'function' ||
                typeof householdInternal.transactionRestoreHousehold !== 'function') {
                return _fail(
                    'Household transaction support is unavailable; annual processing was not applied.'
                );
            }

            participants.push({
                name: 'household',
                prepare: function () {
                    var household = householdInternal.getHouseholdRecord(householdId);
                    return household
                        ? { success: true }
                        : { success: false, reason: 'Household not found: ' + householdId };
                },
                snapshot: function () {
                    var snapshot = householdInternal.transactionSnapshotHousehold(
                        householdId
                    );
                    if (!snapshot) {
                        throw new Error('Could not snapshot household: ' + householdId);
                    }
                    return snapshot;
                },
                apply: function () {
                    var household = householdInternal.getHouseholdRecord(householdId);
                    if (!household) {
                        return { success: false, reason: 'Household disappeared before transfer.' };
                    }
                    var currentWealth = typeof household.wealth === 'number' &&
                        Number.isFinite(household.wealth) ? household.wealth : 0;
                    var update = householdCommands.updateHousehold(householdId, {
                        wealth: currentWealth + householdTransfer
                    }, { deferCommit: true });
                    return update && update.success === true
                        ? { success: true }
                        : {
                            success: false,
                            reason: update && update.reason
                                ? update.reason
                                : 'Household wealth update failed.'
                        };
                },
                rollback: function (snapshot) {
                    return householdInternal.transactionRestoreHousehold(snapshot);
                },
                afterCommit: function () {
                    var publishHouseholdCommit = function () {
                        var committed = householdCommands.commitTransactionUpdate(
                            householdId,
                            ['wealth']
                        );
                        if (!committed || committed.success !== true) {
                            throw new Error(
                                committed && committed.reason
                                    ? committed.reason
                                    : 'Household transaction notification failed.'
                            );
                        }
                    };
                    if (Array.isArray(options.notificationQueue)) {
                        options.notificationQueue.push(publishHouseholdCommit);
                    } else {
                        publishHouseholdCommit();
                    }
                }
            });
        }

        participants.push({
            name: 'industry',
            prepare: function () {
                return IS.getEnterprise(enterpriseId)
                    ? { success: true }
                    : { success: false, reason: 'Enterprise disappeared before processing.' };
            },
            snapshot: function () {
                var snapshot = IS._transactionSnapshotEnterprise(enterpriseId);
                if (!snapshot) throw new Error('Could not snapshot enterprise: ' + enterpriseId);
                return snapshot;
            },
            apply: function () {
                var updated = IS._updateEnterprise(enterpriseId, patch, {
                    silent: true
                });
                return updated
                    ? { success: true }
                    : { success: false, reason: 'IndustryState refused the annual update.' };
            },
            rollback: function (snapshot) {
                return IS._transactionRestoreEnterprise(snapshot);
            },
            afterCommit: function () {
                var publishEnterpriseCommit = function () {
                    _commit(C.EVENT.ENTERPRISE_PROCESSED, {
                        enterpriseId: enterpriseId,
                        currentYear: result.currentYear,
                        newWealth: result.newWealth,
                        newDebt: result.newDebt,
                        nextStatus: result.nextStatus,
                        transaction: true
                    });
                };
                if (Array.isArray(options.notificationQueue)) {
                    options.notificationQueue.push(publishEnterpriseCommit);
                } else {
                    publishEnterpriseCommit();
                }
            }
        });

        var transaction = window.CrossDomainTransaction.execute({
            id: 'industry-annual-' + enterpriseId + '-' + result.currentYear,
            context: {
                enterpriseId: enterpriseId,
                householdId: householdId,
                currentYear: result.currentYear
            },
            participants: participants,
            persist: options.persist === false ? undefined : persist
        });

        if (!transaction || transaction.success !== true) {
            return {
                success: false,
                code: transaction && transaction.code
                    ? transaction.code : 'TRANSACTION_FAILED',
                reason: transaction && transaction.reason
                    ? transaction.reason : 'Annual processing transaction failed.',
                transaction: transaction || null
            };
        }

        return _ok({
            enterprise: IS.getEnterprise(enterpriseId),
            transactionId: transaction.transactionId,
            householdId: householdId,
            notificationErrors: transaction.notificationErrors || []
        });
    }

    // =========================================================================
    // 13. PUBLIC ENTERPRISE HELPERS
    // =========================================================================

    function createPublicEnterprise(locationId, data) {
        if (!_hasId(locationId)) {
            return _fail('Location id is required for public enterprise.');
        }

        if (!window.getPlaceById(locationId)) {
            return _fail('Location not found: ' + locationId);
        }

        var payload = {};
        for (var key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                payload[key] = data[key];
            }
        }
        payload.ownershipType = C.OWNERSHIP_TYPE.PUBLIC;
        payload.ownerType = C.OWNER_TYPE.SETTLEMENT;
        payload.ownerId = locationId;
        if (_isMissing(payload.locationId)) {
            payload.locationId = locationId;
        }

        return createEnterprise(payload);
    }

    function convertEnterpriseToPublic(enterpriseId, locationId) {
        if (!_hasId(locationId)) {
            return _fail('Location id is required.');
        }

        if (!window.getPlaceById(locationId)) {
            return _fail('Location not found: ' + locationId);
        }

        return updateEnterprise(enterpriseId, {
            ownershipType: C.OWNERSHIP_TYPE.PUBLIC,
            ownerType: C.OWNER_TYPE.SETTLEMENT,
            ownerId: locationId
        });
    }

    /**
     * Rebuilds Household.enterprises reverse indexes from canonical
     * Enterprise.ownerType/ownerId fields. Dry-run is the default-safe path.
     */
    function reconcileHouseholdEnterpriseIndexes(options) {
        options = options || {};
        if (!IS || typeof IS.getOwnershipIntegrityReport !== 'function') {
            return {
                success: false,
                code: 'DIAGNOSTICS_UNAVAILABLE',
                reason: 'Industry ownership diagnostics are unavailable.'
            };
        }
        var report = IS.getOwnershipIntegrityReport();
        if (options.dryRun === true) {
            return {
                success: report.valid || report.repairable,
                dryRun: true,
                repairable: report.repairable,
                report: report
            };
        }
        if (report.valid) {
            return { success: true, changed: false, report: report };
        }
        if (!report.repairable) {
            return {
                success: false,
                code: 'REPAIR_BLOCKED',
                reason: 'Ownership data contains unresolved canonical references; repair was not attempted.',
                report: report
            };
        }

        var householdState = window.HouseholdState;
        var internal = householdState && householdState._internal;
        var householdCommands;
        try {
            householdCommands = _requireHouseholdCommands();
        } catch (dependencyError) {
            return {
                success: false,
                code: 'TRANSACTION_UNAVAILABLE',
                reason: dependencyError && dependencyError.message
                    ? dependencyError.message : 'Household command dependencies are unavailable.'
            };
        }
        var transaction = window.CrossDomainTransaction;
        if (!internal ||
            typeof internal.getAllHouseholdRecords !== 'function' ||
            typeof internal.transactionSnapshotEnterpriseIndexes !== 'function' ||
            typeof internal.transactionRebuildEnterpriseIndexes !== 'function' ||
            typeof internal.transactionRestoreEnterpriseIndexes !== 'function' ||
            typeof householdCommands.commitTransactionEnterpriseIndexRepair !== 'function' ||
            !transaction || typeof transaction.execute !== 'function') {
            return {
                success: false,
                code: 'TRANSACTION_UNAVAILABLE',
                reason: 'Household Enterprise index repair transaction support is unavailable.'
            };
        }

        var householdIds = Object.keys(report.expectedByHousehold);
        var enterpriseCount = 0;
        householdIds.forEach(function(id) {
            enterpriseCount += report.expectedByHousehold[id].length;
        });

        var result = transaction.execute({
            participants: [{
                name: 'household-enterprise-indexes',
                prepare: function() {
                    var records = internal.getAllHouseholdRecords({
                        includeDeprecated: true
                    });
                    if (records.length !== householdIds.length) {
                        return {
                            success: false,
                            reason: 'Household collection changed after diagnostics.'
                        };
                    }
                    var seen = Object.create(null);
                    for (var i = 0; i < records.length; i++) {
                        var id = records[i] && records[i].id;
                        if (!_hasId(id) || seen[id] ||
                            !Object.prototype.hasOwnProperty.call(
                                report.expectedByHousehold, id
                            )) {
                            return {
                                success: false,
                                reason: 'Household state and canonical Household ids do not match.'
                            };
                        }
                        seen[id] = true;
                    }
                    return true;
                },
                snapshot: function() {
                    return internal.transactionSnapshotEnterpriseIndexes();
                },
                apply: function() {
                    return internal.transactionRebuildEnterpriseIndexes(
                        report.expectedByHousehold
                    );
                },
                rollback: function(snapshot) {
                    return internal.transactionRestoreEnterpriseIndexes(snapshot);
                },
                afterCommit: function() {
                    var committed = householdCommands.commitTransactionEnterpriseIndexRepair(
                        householdIds,
                        enterpriseCount
                    );
                    if (!committed || committed.success !== true) {
                        throw new Error(committed && committed.reason
                            ? committed.reason
                            : 'Household index repair notification failed.');
                    }
                }
            }],
            persist: function() {
                return persist();
            }
        });

        if (!result || result.success !== true) {
            return {
                success: false,
                code: result && result.code || 'REPAIR_FAILED',
                reason: result && result.reason || 'Household Enterprise index repair failed.',
                rollbackErrors: result && result.rollbackErrors || [],
                report: IS.getOwnershipIntegrityReport()
            };
        }

        return {
            success: true,
            changed: true,
            repairedHouseholdCount: householdIds.length,
            enterpriseReferenceCount: enterpriseCount,
            transactionId: result.transactionId || null,
            notificationErrors: result.notificationErrors || [],
            report: IS.getOwnershipIntegrityReport()
        };
    }

    // =========================================================================
    // 14. DEMOLISH / REBUILD
    // =========================================================================

    function _applyEnterpriseLifecycleTransaction(
        enterpriseId, patch, householdId, householdAction, year
    ) {
        var transaction = window.CrossDomainTransaction;
        if (!transaction || typeof transaction.execute !== 'function') {
            return _fail('Cross-domain transaction support is unavailable.');
        }
        var householdOwned = _hasId(householdId);
        var householdState = window.HouseholdState;
        var householdInternal = householdState && householdState._internal;
        var householdCommands = null;
        if (householdOwned) {
            try {
                householdCommands = _requireHouseholdCommands();
            } catch (e) {
                return _fail(e && e.message ? e.message : 'Household commands unavailable.');
            }
            if (!householdInternal ||
                typeof householdInternal.transactionSnapshotHousehold !== 'function' ||
                typeof householdInternal.transactionRestoreHousehold !== 'function') {
                return _fail('Household transaction support is unavailable.');
            }
        }

        var participants = [];
        if (householdOwned) {
            participants.push({
                name: 'household',
                prepare: function() {
                    var household = householdInternal.getHouseholdRecord(householdId);
                    if (!household) {
                        return { success: false, reason: 'Owner Household not found.' };
                    }
                    var refs = Array.isArray(household.enterprises)
                        ? household.enterprises : [];
                    var count = refs.filter(function(id) {
                        return id === enterpriseId;
                    }).length;
                    if (householdAction === 'remove' && count !== 1) {
                        return { success: false, reason: 'Household must contain exactly one Enterprise reference before removal.' };
                    }
                    if (householdAction === 'add' && count !== 0) {
                        return { success: false, reason: 'Household already references this Enterprise before rebuilding.' };
                    }
                    return true;
                },
                snapshot: function() {
                    return householdInternal.transactionSnapshotHousehold(householdId);
                },
                apply: function() {
                    var method = householdAction === 'add'
                        ? householdCommands.addEnterpriseToHousehold
                        : householdCommands.removeEnterpriseFromHousehold;
                    var result = method.call(
                        householdCommands, householdId, enterpriseId,
                        { year: year, deferCommit: true }
                    );
                    return result && result.success === true
                        ? true
                        : { success: false, reason: result && result.reason || 'Household ownership update failed.' };
                },
                rollback: function(snapshot) {
                    return householdInternal.transactionRestoreHousehold(snapshot);
                },
                afterCommit: function() {
                    var result = householdCommands.commitTransactionEnterpriseOwnership([{
                        householdId: householdId,
                        enterpriseId: enterpriseId,
                        action: householdAction === 'add' ? 'added' : 'removed',
                        year: year
                    }]);
                    if (!result || result.success !== true) {
                        throw new Error(result && result.reason || 'Household ownership notification failed.');
                    }
                }
            });
        }

        participants.push({
            name: 'industry',
            prepare: function() {
                return IS.getEnterprise(enterpriseId)
                    ? true
                    : { success: false, reason: 'Enterprise no longer exists.' };
            },
            snapshot: function() {
                return IS._transactionSnapshotEnterprise(enterpriseId);
            },
            apply: function() {
                var updated = IS._updateEnterprise(enterpriseId, patch, { silent: true });
                return updated
                    ? true
                    : { success: false, reason: 'IndustryState refused the lifecycle update.' };
            },
            rollback: function(snapshot) {
                return IS._transactionRestoreEnterprise(snapshot);
            },
            afterCommit: function() {
                IS._notifyTransactionEnterpriseUpdated(enterpriseId);
            }
        });

        var result = transaction.execute({ participants: participants });
        if (!result || result.success !== true) {
            return {
                success: false,
                code: result && result.code || 'TRANSACTION_FAILED',
                reason: result && result.reason || 'Enterprise lifecycle transaction failed.',
                rollbackErrors: result && result.rollbackErrors || []
            };
        }
        return _ok({
            transactionId: result.transactionId || null,
            notificationErrors: result.notificationErrors || []
        });
    }

    function demolishEnterprise(enterpriseId, reason, year, options) {
        if (!_hasId(enterpriseId)) return _fail('Enterprise id is required.');

        var enterprise = IS.getEnterprise(enterpriseId);
        if (!enterprise) return _fail('Enterprise not found.');

        if (enterprise.status === C.STATUS.DEMOLISHED) {
            return _fail('Enterprise is already demolished.');
        }

        options = options || {};
        var demolishYear = _isMissing(year) ? window.getCurrentYear() : year;
        var demolishReason = _isMissing(reason) ? 'Demolished' : reason;
        var destroyedBy = _isMissing(options.destroyedBy)
            ? 'manual' : options.destroyedBy;
        var disasterId = _isMissing(options.disasterId)
            ? null : options.disasterId;

        var demolitionRecord = {
            enterpriseId: enterprise.id,
            enterpriseName: enterprise.name,
            typeId: enterprise.typeId,
            locationId: enterprise.locationId,
            demolishedYear: demolishYear,
            demolishedReason: demolishReason,
            destroyedBy: destroyedBy,
            disasterId: disasterId,
            previousStatus: enterprise.status,
            previousWealth: enterprise.wealth,
            previousDebt: enterprise.debt,
            previousWorkerCount: enterprise.workerList.length,
            workerIds: enterprise.workerList.slice(),
            ownershipType: enterprise.ownershipType,
            ownerId: enterprise.ownerId,
            timestamp: Date.now()
        };

        var newHistory = enterprise.history.slice();
        newHistory.push({
            year: demolishYear,
            type: 'demolished',
            reason: demolishReason,
            destroyedBy: destroyedBy,
            disasterId: disasterId,
            record: demolitionRecord,
            timestamp: Date.now()
        });

        var patch = {
            status: C.STATUS.DEMOLISHED,
            demolishedAt: demolishYear,
            demolishedReason: demolishReason,
            destroyedBy: destroyedBy,
            disasterId: disasterId,
            demolishedRecord: demolitionRecord,
            workerList: [],
            workerWages: {},
            wealth: 0,
            debt: 0,
            history: newHistory,
            updatedAt: Date.now()
        };

        var householdId = enterprise.ownerType === C.OWNER_TYPE.HOUSEHOLD
            ? enterprise.ownerId : null;
        var txResult = _applyEnterpriseLifecycleTransaction(
            enterpriseId, patch, householdId, 'remove', demolishYear
        );
        if (!txResult.success) return txResult;

        _commit(C.EVENT.ENTERPRISE_DEMOLISHED, {
            enterpriseId: enterpriseId,
            reason: demolishReason,
            record: demolitionRecord
        });

        return _ok({
            demolitionRecord: demolitionRecord,
            enterprise: IS.getEnterprise(enterpriseId)
        });
    }

    function rebuildEnterprise(enterpriseId, rebuildYear, options) {
        if (!_hasId(enterpriseId)) return _fail('Enterprise id is required.');

        var enterprise = IS.getEnterprise(enterpriseId);
        if (!enterprise) return _fail('Enterprise not found.');

        if (enterprise.status !== C.STATUS.DEMOLISHED) {
            return _fail('Enterprise is not demolished.');
        }

        var record = enterprise.demolishedRecord;
        if (!record) {
            return _fail('No demolition record found.');
        }

        options = options || {};
        var rebuildYearValue = _isMissing(rebuildYear)
            ? window.getCurrentYear()
            : rebuildYear;

        var initialWealth;
        if (!_isMissing(options.initialWealth)) {
            initialWealth = options.initialWealth;
        } else {
            var prior = typeof record.previousWealth === 'number'
                ? record.previousWealth
                : 0;
            initialWealth = Math.max(
                C.REBUILD_WEALTH_MINIMUM,
                Math.floor(prior * C.REBUILD_WEALTH_FRACTION)
            );
        }

        var newHistory = enterprise.history.slice();
        newHistory.push({
            year: rebuildYearValue,
            type: 'rebuilt',
            reason: _isMissing(options.reason)
                ? 'Rebuilt after destruction'
                : options.reason,
            fromRecord: record,
            timestamp: Date.now()
        });

        var patch = {
            status: C.STATUS.ACTIVE,
            demolishedAt: null,
            demolishedReason: null,
            destroyedBy: null,
            disasterId: null,
            demolishedRecord: null,
            wealth: initialWealth,
            debt: 0,
            workerList: [],
            workerWages: {},
            history: newHistory,
            updatedAt: Date.now()
        };

        var householdId = record.ownerType === C.OWNER_TYPE.HOUSEHOLD
            ? record.ownerId : null;
        var txResult = _applyEnterpriseLifecycleTransaction(
            enterpriseId, patch, householdId, 'add', rebuildYearValue
        );
        if (!txResult.success) return txResult;

        _commit(C.EVENT.ENTERPRISE_REBUILT, {
            enterpriseId: enterpriseId,
            rebuiltAt: rebuildYearValue
        });

        return _ok({
            enterprise: IS.getEnterprise(enterpriseId),
            rebuiltAt: rebuildYearValue
        });
    }

    // Resolves a deceased character's privately owned enterprises.
    // The caller supplies the selected heir/buyer/employee and deceased household.
    function resolveOwnerDeath(characterId, action, targetId, householdId) {
        if (!_hasId(characterId)) return _fail('Deceased character id is required.');
        if (['inherit', 'sell', 'takeover', 'close'].indexOf(action) === -1) {
            return _fail('Unknown succession action.');
        }
        if (!window.CrossDomainTransaction
            || typeof window.CrossDomainTransaction.execute !== 'function') {
            return _fail('CrossDomainTransaction is required for owner succession.');
        }

        var owned = IS.getEnterprisesByOwner(characterId, C.OWNER_TYPE.CHARACTER).slice();
        var target = null;
        var household = null;
        if (action !== 'close') {
            target = _hasId(targetId) ? window.getCharacterById(targetId) : null;
            if (!target || target.isDeceased === true) {
                return _fail('A living successor must be selected.');
            }
        }
        if (action === 'sell') {
            household = _hasId(householdId) && typeof window.getHouseholdById === 'function'
                ? window.getHouseholdById(householdId) : null;
            if (!household || !window.HouseholdCommands
                || typeof window.HouseholdCommands.updateHousehold !== 'function') {
                return _fail('The deceased owner household is required for sale proceeds.');
            }
        }

        var snapshots = [];
        var plans = [];
        var totalPayment = 0;
        for (var i = 0; i < owned.length; i++) {
            var enterprise = IS.getEnterprise(owned[i].id);
            if (!enterprise || enterprise.ownerType !== C.OWNER_TYPE.CHARACTER
                || enterprise.ownerId !== characterId) {
                return _fail('Enterprise ownership changed during succession. Please retry.');
            }
            if (action === 'takeover' && (!Array.isArray(enterprise.workerList)
                || enterprise.workerList.indexOf(targetId) === -1)) {
                return _fail('Takeover must be assigned to an employee of every enterprise being transferred.');
            }
            if (action === 'sell') {
                var profit = window.IndustryEconomics.calculateAnnualProfit(enterprise);
                totalPayment += Math.max(0, Number.isFinite(profit) ? profit : 0);
            }
            snapshots.push(IS._transactionSnapshotEnterprise(enterprise.id));
            plans.push({
                id: enterprise.id,
                patch: action === 'close'
                    ? { ownerType: C.OWNER_TYPE.NONE, ownerId: null, status: C.STATUS.CLOSED,
                        workerList: [], workerWages: {}, updatedAt: Date.now() }
                    : { ownerType: C.OWNER_TYPE.CHARACTER, ownerId: targetId, updatedAt: Date.now() }
            });
        }

        var participants = [{
            name: 'industry-owner-succession',
            prepare: function () {
                for (var p = 0; p < plans.length; p++) {
                    var current = IS.getEnterprise(plans[p].id);
                    if (!current || current.ownerId !== characterId
                        || current.ownerType !== C.OWNER_TYPE.CHARACTER) {
                        return _fail('Enterprise ownership changed during succession. Please retry.');
                    }
                }
                return { success: true };
            },
            snapshot: function () { return snapshots; },
            apply: function () {
                for (var p = 0; p < plans.length; p++) {
                    IS._updateEnterprise(plans[p].id, plans[p].patch, { silent: true });
                }
                return { success: true };
            },
            rollback: function (saved) {
                for (var p = saved.length - 1; p >= 0; p--) {
                    IS._transactionRestoreEnterprise(saved[p]);
                }
                return { success: true };
            },
            afterCommit: function () {
                for (var p = 0; p < plans.length; p++) {
                    IS._notifyTransactionEnterpriseUpdated(plans[p].id);
                }
            }
        }];

        if (action === 'sell' && owned.length) {
            var originalWealth = typeof household.wealth === 'number' ? household.wealth : 0;
            participants.push({
                name: 'household-sale-proceeds',
                prepare: function () {
                    var current = window.getHouseholdById(householdId);
                    return current ? { success: true }
                        : _fail('Household no longer exists.');
                },
                snapshot: function () { return originalWealth; },
                apply: function () {
                    return window.HouseholdCommands.updateHousehold(householdId,
                        { wealth: originalWealth + totalPayment }, { deferCommit: true });
                },
                rollback: function (saved) {
                    var restored = window.HouseholdCommands.updateHousehold(householdId,
                        { wealth: saved }, { deferCommit: true });
                    if (!restored || restored.success !== true) {
                        throw new Error(restored && restored.reason
                            || 'Could not restore household sale proceeds.');
                    }
                    return { success: true };
                }
            });
        }

        var transaction = window.CrossDomainTransaction.execute({
            context: { characterId: characterId, action: action },
            participants: participants,
            persist: function () { return persist(); }
        });
        if (!transaction || transaction.success !== true) {
            return _fail(transaction && transaction.reason
                || 'Enterprise succession transaction failed.'
                + (transaction && transaction.code ? ' (' + transaction.code + ')' : ''));
        }
        return _ok({ enterpriseIds: plans.map(function (plan) { return plan.id; }), action: action });
    }
    // =========================================================================
    // 15. EXPORTS
    // =========================================================================

    window.IndustryCommands = Object.freeze({
        // Persistence boundary
        persist: persist,

        // Enterprise lifecycle
        resolveOwnerDeath: resolveOwnerDeath,
        createEnterprise: createEnterprise,
        updateEnterprise: updateEnterprise,
        deleteEnterprise: deleteEnterprise,

        // Workers
        addWorkerToEnterprise: addWorkerToEnterprise,
        removeWorkerFromEnterprise: removeWorkerFromEnterprise,
        setWorkerWage: setWorkerWage,

        // Financials
        updateEnterpriseWealth: updateEnterpriseWealth,
        updateEnterpriseDebt: updateEnterpriseDebt,

        // Annual processing
        applyAnnualProcessing: applyAnnualProcessing,

        // Public enterprises
        createPublicEnterprise: createPublicEnterprise,
        convertEnterpriseToPublic: convertEnterpriseToPublic,

        // Demolish / rebuild
        reconcileHouseholdEnterpriseIndexes: reconcileHouseholdEnterpriseIndexes,
        demolishEnterprise: demolishEnterprise,
        rebuildEnterprise: rebuildEnterprise
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.IndustryCommands;
    }
})();
