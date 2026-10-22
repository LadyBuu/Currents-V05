/**
 * =============================================================================
 * STILL WATERS - INDUSTRY COMMANDS (industry-commands.js)
 * =============================================================================
 *
 * LOCATION: js/core/industry/industry-commands.js
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
 *   Commands do not save. Every command mutates in-memory state and returns.
 *   The caller calls IndustryCommands.persist() once per batch, after every
 *   command in the batch has succeeded. IndustryState.markDataDirty has
 *   already been called by the mutation primitives. persist() forces a
 *   synchronous flush.
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
 *   - accessors.js         (getCharacterById, getPlaceById)
 *   - household-commands.js (HouseholdCommands) — for household ownership
 *
 * ICON POLICY: No emojis. No icons.
 *
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
    // createEnterprise, updateEnterprise, and deleteEnterprise DO touch
    // households when ownerType === 'household', so a bootstrap will verify
    // it as a hard dependency.
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
            'updateHousehold'
        ];
        for (var i = 0; i < required.length; i++) {
            if (typeof hc[required[i]] !== 'function') {
                throw new Error(
                    'industry-commands.js: HouseholdCommands.' +
                    required[i] + ' is required.'
                );
            }
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
        if (typeof IS.subscribe === 'function') {
            // IndustryState has no public publish — the state primitives
            // already notify their own subscribers with their own event
            // names. _commit's job is only the cross-domain channel.
            // No-op here to avoid double-notify.
        }
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
     * If it is not loaded, this throws — the caller has already committed to
     * a cross-domain write and cannot proceed safely without it.
     */
    function _applyHouseholdTransfer(householdId, amount, reason) {
        if (typeof window.getHouseholdById !== 'function') {
            throw new Error(
                'industry-commands.js: getHouseholdById is required to apply ' +
                'a household wealth transfer.'
            );
        }
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

        var hc = _requireHouseholdCommands();
        var r = hc.updateHousehold(householdId, {
            wealth: newWealth,
            notes: reason ? 'Industry transfer: ' + reason : household.notes
        });
        if (!r || r.success !== true) {
            throw new Error(
                'industry-commands.js: HouseholdCommands.updateHousehold ' +
                'failed for ' + householdId +
                ': ' + (r && r.reason ? r.reason : 'unknown')
            );
        }
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
                    'HouseholdCommands is not loaded; cannot assign household owner.'
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

        try {
            IS._addEnterprise(candidate);
        } catch (e) {
            return _fail(e && e.message
                ? e.message
                : 'IndustryState refused the write.');
        }

        if (ownerType === C.OWNER_TYPE.HOUSEHOLD && ownerId) {
            try {
                _registerWithHousehold(ownerId, candidate.id, foundedYear);
            } catch (e) {
                // Roll back the enterprise add. This is the only
                // compensating path in this file; household registration is
                // a cross-domain invariant that must be all-or-nothing.
                IS._removeEnterprise(candidate.id);
                return _fail(e && e.message
                    ? e.message
                    : 'Household registration failed.');
            }
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
     *   wealth, debt, income, expenses, wages, maxWorkers, workerList,
     *   workerWages, status, lastProcessedYear, notes
     *
     * Derived fields are rejected by RULES.validateUpdateInput.
     * Domain-owned fields are rejected by the same.
     * Unknown fields are rejected by the command layer's own allowlist
     * below — if a caller adds a field the domain does not recognize, this
     * returns a structured rejection rather than silently ignoring it.
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
        workerList: true,
        workerWages: true,
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
                    'Field "' + key + '" is not a writable enterprise field.'
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

        if (ownerChanged || Object.prototype.hasOwnProperty.call(updates, 'ownershipType')) {
            var nextOwnershipType = Object.prototype.hasOwnProperty.call(
                updates, 'ownershipType'
            )
                ? updates.ownershipType
                : current.ownershipType;
            var nextOwnerType = Object.prototype.hasOwnProperty.call(
                updates, 'ownerType'
            )
                ? updates.ownerType
                : current.ownerType;
            var nextOwnerId = Object.prototype.hasOwnProperty.call(
                updates, 'ownerId'
            )
                ? updates.ownerId
                : current.ownerId;

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
                newOwnerType: Object.prototype.hasOwnProperty.call(
                    updates, 'ownerType'
                ) ? updates.ownerType : current.ownerType,
                newOwnerId: Object.prototype.hasOwnProperty.call(
                    updates, 'ownerId'
                ) ? updates.ownerId : current.ownerId,
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
            if (f === 'workerList' && !Array.isArray(updates.workerList)) {
                return _fail('workerList must be an array.');
            }
            if (f === 'workerWages' && !_isPlainObject(updates.workerWages)) {
                return _fail('workerWages must be a plain object.');
            }
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

        try {
            IS._updateEnterprise(enterpriseId, patch);
        } catch (e) {
            return _fail(e && e.message
                ? e.message
                : 'IndustryState refused the write.');
        }

        _commit(C.EVENT.ENTERPRISE_UPDATED, {
            enterpriseId: enterpriseId,
            changedFields: Object.keys(updates)
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

        if (enterprise.ownerType === C.OWNER_TYPE.HOUSEHOLD && enterprise.ownerId) {
            try {
                _unregisterFromHousehold(
                    enterprise.ownerId, enterprise.id, currentYear
                );
            } catch (e) {
                return _fail(e && e.message
                    ? e.message
                    : 'Household unregistration failed.');
            }
        }

        try {
            IS._removeEnterprise(enterpriseId);
        } catch (e) {
            return _fail(e && e.message
                ? e.message
                : 'IndustryState refused the delete.');
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
     * transfer (when present) is applied before the enterprise record is
     * updated. If the household write fails, the enterprise is untouched.
     */
    function applyAnnualProcessing(enterpriseId, result) {
        if (!_hasId(enterpriseId)) return _fail('Enterprise id is required.');

        var validation = RULES.validateAnnualTransitionResult(result);
        if (!validation.valid) {
            return _failWith(validation.errors);
        }

        var enterprise = IS.getEnterprise(enterpriseId);
        if (!enterprise) return _fail('Enterprise not found.');

        var patch = { updatedAt: Date.now() };

        if (typeof result.newWealth === 'number') {
            patch.wealth = result.newWealth;
        }
        if (typeof result.newDebt === 'number') {
            patch.debt = result.newDebt;
        }
        if (!_isMissing(result.nextStatus)) {
            patch.status = result.nextStatus;
        }
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
        if (!enterpriseValidation.valid) {
            return _failWith(enterpriseValidation.errors);
        }

        // Household transfer first — if it fails, enterprise is untouched.
        if (!_isMissing(result.householdId) && _hasId(result.householdId)) {
            try {
                _applyHouseholdTransfer(
                    result.householdId,
                    result.householdTransfer,
                    _isMissing(result.householdReason)
                        ? 'Enterprise annual processing'
                        : result.householdReason
                );
            } catch (e) {
                return _fail(e && e.message
                    ? e.message
                    : 'Household transfer failed.');
            }
        }

        try {
            IS._updateEnterprise(enterpriseId, patch);
        } catch (e) {
            return _fail(e && e.message
                ? e.message
                : 'IndustryState refused the write.');
        }

        _commit(C.EVENT.ENTERPRISE_PROCESSED, {
            enterpriseId: enterpriseId,
            currentYear: result.currentYear,
            newWealth: result.newWealth,
            newDebt: result.newDebt,
            nextStatus: result.nextStatus
        });

        return _ok({ enterprise: IS.getEnterprise(enterpriseId) });
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

    // =========================================================================
    // 14. DEMOLISH / REBUILD
    // =========================================================================

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

        if (enterprise.ownerType === C.OWNER_TYPE.HOUSEHOLD && enterprise.ownerId) {
            try {
                _unregisterFromHousehold(
                    enterprise.ownerId, enterprise.id, demolishYear
                );
            } catch (e) {
                return _fail(e && e.message
                    ? e.message
                    : 'Household unregistration failed.');
            }
        }

        try {
            IS._updateEnterprise(enterpriseId, patch);
        } catch (e) {
            return _fail(e && e.message
                ? e.message
                : 'IndustryState refused the write.');
        }

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

        if (record.ownerType === C.OWNER_TYPE.HOUSEHOLD && record.ownerId) {
            try {
                _registerWithHousehold(record.ownerId, enterpriseId, rebuildYearValue);
            } catch (e) {
                return _fail(e && e.message
                    ? e.message
                    : 'Household registration failed.');
            }
        }

        try {
            IS._updateEnterprise(enterpriseId, patch);
        } catch (e) {
            return _fail(e && e.message
                ? e.message
                : 'IndustryState refused the write.');
        }

        _commit(C.EVENT.ENTERPRISE_REBUILT, {
            enterpriseId: enterpriseId,
            rebuiltAt: rebuildYearValue
        });

        return _ok({
            enterprise: IS.getEnterprise(enterpriseId),
            rebuiltAt: rebuildYearValue
        });
    }

    // =========================================================================
    // 15. EXPORTS
    // =========================================================================

    window.IndustryCommands = Object.freeze({
        // Persistence boundary
        persist: persist,

        // Enterprise lifecycle
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
        demolishEnterprise: demolishEnterprise,
        rebuildEnterprise: rebuildEnterprise
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.IndustryCommands;
    }
})();
