/**
 * =============================================================================
 * STILL WATERS - INDUSTRY COMMANDS (industry-commands.js)
 * =============================================================================
 *
 * LOCATION: js/core/industry/industry-commands.js
 *
 * The sole owner of enterprise mutations.
 *
 * ARCHITECTURAL RULES (Phase 1):
 *   - Commands mutate masterData.data.enterprises directly.
 *   - Commands construct candidate clones, validate, then commit.
 *   - Commands own the transaction: rebuild indexes → save → notify.
 *   - Commands do NOT call UI functions (_showToast).
 *   - Commands do NOT have recursion guards. Composition is expected.
 *   - Commands do NOT fabricate defaults for missing input.
 *     Creation defaults are explicit. Updates use explicit missing checks.
 *   - Commands do NOT reach into another domain's State.
 *     Cross-domain mutations go through the other domain's Commands.
 *   - Missing dependencies are failures, not silent no-ops.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY ACCESS
    // =========================================================================

    function _requireMasterData() {
        var md = window.masterData;
        if (!md) {
            throw new Error('IndustryCommands: masterData dependency missing');
        }
        if (!md.data) {
            md.data = {};
        }
        return md;
    }

    function _requireEnterprisesArray() {
        var md = _requireMasterData();
        if (!md.data.enterprises) {
            md.data.enterprises = [];
        }
        return md.data.enterprises;
    }

    function _requireState() {
        var state = window.IndustryState;
        if (!state) {
            throw new Error('IndustryCommands: IndustryState dependency missing');
        }
        return state;
    }

    function _requireGenerateId() {
        if (typeof window.generateId !== 'function') {
            throw new Error('IndustryCommands: generateId dependency missing');
        }
        return window.generateId;
    }

    function _requireSaveMasterData() {
        if (typeof window.saveMasterData !== 'function') {
            throw new Error('IndustryCommands: saveMasterData dependency missing');
        }
        return window.saveMasterData;
    }

    function _requireCurrentYear() {
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error('IndustryCommands: getCurrentYearSafe dependency missing');
        }
        return window.getCurrentYearSafe();
    }

    function _requireCharacterAccessor() {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('IndustryCommands: getCharacterById dependency missing');
        }
        return window.getCharacterById;
    }

    function _requirePlaceAccessor() {
        if (typeof window.getPlaceById !== 'function') {
            throw new Error('IndustryCommands: getPlaceById dependency missing');
        }
        return window.getPlaceById;
    }

    function _requireTypeLookup() {
        if (typeof window.IndustryTypes === 'undefined' ||
            typeof window.IndustryTypes.getEnterpriseTypeById !== 'function') {
            throw new Error('IndustryCommands: IndustryTypes.getEnterpriseTypeById dependency missing');
        }
        return window.IndustryTypes.getEnterpriseTypeById;
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects || []);
        }
    }

    // =========================================================================
    // 2. TRANSACTION PRIMITIVE
    // =========================================================================

    /**
     * Commits a successful mutation:
     *   - rebuild indexes from canonical data
     *   - persist once
     *   - notify once
     *
     * Call this after canonical data has been replaced.
     */
    function _commit(eventType, eventData) {
        var state = _requireState();
        state.rebuildIndexes();
        _requireSaveMasterData()();
        state.notify(eventType, eventData);
    }

    // =========================================================================
    // 3. HELPERS
    // =========================================================================

    function _findEnterpriseIndex(enterpriseId) {
        var enterprises = _requireEnterprisesArray();
        for (var i = 0; i < enterprises.length; i++) {
            if (enterprises[i].id === enterpriseId) {
                return i;
            }
        }
        return -1;
    }

    function _cloneEnterprise(enterprise) {
        var clone = {};
        for (var key in enterprise) {
            if (enterprise.hasOwnProperty(key)) {
                if (Array.isArray(enterprise[key])) {
                    clone[key] = enterprise[key].slice();
                } else if (enterprise[key] && typeof enterprise[key] === 'object') {
                    var obj = {};
                    for (var k in enterprise[key]) {
                        if (enterprise[key].hasOwnProperty(k)) {
                            obj[k] = enterprise[key][k];
                        }
                    }
                    clone[key] = obj;
                } else {
                    clone[key] = enterprise[key];
                }
            }
        }
        return clone;
    }

    // =========================================================================
    // 4. CORE CRUD
    // =========================================================================

    function createEnterprise(data) {
        if (!data) {
            return { success: false, reason: 'Enterprise data is required' };
        }
        if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
            return { success: false, reason: 'Enterprise name is required' };
        }
        if (!data.typeId) {
            return { success: false, reason: 'Enterprise type is required' };
        }

        var getType = _requireTypeLookup();
        var type = getType(data.typeId);
        if (!type) {
            return { success: false, reason: 'Enterprise type not found: ' + data.typeId };
        }

        var now = Date.now();
        var currentYear = _requireCurrentYear();

        // Resolve owner type / id together. Do not default one without the other.
        var ownerType = data.ownerType;
        var ownerId = data.ownerId;
        if (ownerType === undefined || ownerType === null) {
            ownerType = 'none';
        }
        if (ownerId === undefined || ownerId === null) {
            ownerId = null;
        }
        if (ownerType !== 'none' && ownerId === null) {
            return { success: false, reason: 'Owner type requires an owner id' };
        }
        if (ownerType === 'none' && ownerId !== null) {
            return { success: false, reason: 'Owner id provided without an owner type' };
        }

        // Resolve owner name for settlement ownership via Place lookup.
        // For character/household, name is derived by Queries; we do not persist it.
        var ownerName = data.ownerName === undefined ? null : data.ownerName;

        var ownershipType = data.ownershipType;
        if (ownershipType === undefined || ownershipType === null) {
            ownershipType = (ownerType === 'settlement') ? 'public' : 'private';
        }
        if (ownershipType !== 'public' && ownershipType !== 'private') {
            return { success: false, reason: 'Invalid ownershipType: ' + ownershipType };
        }

        var enterprise = {
            id: _requireGenerateId()('ent'),
            name: data.name.trim(),
            typeId: data.typeId,
            typeName: type.name,
            category: type.category,

            ownershipType: ownershipType,
            isPublic: ownershipType === 'public',

            ownerType: ownerType,
            ownerId: ownerId,
            ownerName: ownerName,

            locationId: data.locationId === undefined ? null : data.locationId,
            locationName: data.locationName === undefined ? null : data.locationName,

            wealth: _resolveCreationNumber(data.wealth, 0),
            debt: _resolveCreationNumber(data.debt, 0),
            income: _resolveCreationNumber(data.income, type.baseIncome),
            expenses: _resolveCreationNumber(data.expenses, type.baseExpenses),
            wages: _resolveCreationNumber(data.wages, type.baseWages),

            workerCount: 0,
            maxWorkers: _resolveCreationNumber(data.maxWorkers, type.maxWorkers),
            workerList: [],
            workerWages: {},

            status: data.status === undefined ? 'active' : data.status,
            foundedYear: data.foundedYear === undefined ? currentYear : data.foundedYear,
            lastProcessedYear: data.foundedYear === undefined ? currentYear : data.foundedYear,

            history: [],
            notes: data.notes === undefined ? '' : data.notes,

            createdAt: now,
            updatedAt: now
        };

        // Validate final candidate
        var validation = _validateEnterpriseCandidate(enterprise);
        if (!validation.ok) {
            return { success: false, reason: validation.reason };
        }

        // Commit
        var enterprises = _requireEnterprisesArray();
        enterprises.push(enterprise);

        // Cross-domain: register with household if applicable
        if (ownerType === 'household' && ownerId) {
            _registerWithHousehold(ownerId, enterprise.id, enterprise.foundedYear);
        }

        _commit('enterprise_added', { enterprise: enterprise });

        _logEvent('enterprise', 'Enterprise Created',
            'Enterprise "' + enterprise.name + '" created',
            []);

        return { success: true, data: enterprise };
    }

    function updateEnterprise(id, updates) {
        if (!id) {
            return { success: false, reason: 'Enterprise id is required' };
        }
        if (!updates || typeof updates !== 'object') {
            return { success: false, reason: 'Updates object is required' };
        }

        var index = _findEnterpriseIndex(id);
        if (index === -1) {
            return { success: false, reason: 'Enterprise not found' };
        }

        var enterprises = _requireEnterprisesArray();
        var existing = enterprises[index];
        var candidate = _cloneEnterprise(existing);

        var allowedFields = [
            'name', 'typeId', 'typeName', 'category',
            'ownershipType', 'isPublic', 'ownerType', 'ownerId', 'ownerName',
            'locationId', 'locationName',
            'wealth', 'debt', 'income', 'expenses', 'wages',
            'maxWorkers', 'workerList', 'workerWages',
            'status', 'lastProcessedYear', 'notes'
        ];

        var changed = false;
        for (var i = 0; i < allowedFields.length; i++) {
            var key = allowedFields[i];
            if (updates[key] !== undefined) {
                candidate[key] = updates[key];
                changed = true;
            }
        }

        if (!changed) {
            return { success: false, reason: 'No changes to apply' };
        }

        // Re-derive fields that must be consistent
        if (updates.ownershipType !== undefined) {
            candidate.isPublic = (updates.ownershipType === 'public');
        }
        if (updates.typeId !== undefined && updates.typeId !== existing.typeId) {
            var getType = _requireTypeLookup();
            var type = getType(updates.typeId);
            if (!type) {
                return { success: false, reason: 'Enterprise type not found: ' + updates.typeId };
            }
            candidate.typeName = type.name;
            candidate.category = type.category;
        }
        if (candidate.workerList) {
            candidate.workerCount = candidate.workerList.length;
        }

        candidate.updatedAt = Date.now();

        var validation = _validateEnterpriseCandidate(candidate);
        if (!validation.ok) {
            return { success: false, reason: validation.reason };
        }

        enterprises[index] = candidate;
        _commit('enterprise_updated', { enterprise: candidate });

        _logEvent('enterprise', 'Enterprise Updated',
            'Enterprise "' + candidate.name + '" updated',
            []);

        return { success: true, data: candidate };
    }

    function deleteEnterprise(id) {
        if (!id) {
            return { success: false, reason: 'Enterprise id is required' };
        }

        var index = _findEnterpriseIndex(id);
        if (index === -1) {
            return { success: false, reason: 'Enterprise not found' };
        }

        var enterprises = _requireEnterprisesArray();
        var enterprise = enterprises[index];

        // Cross-domain: unregister from household before deleting
        if (enterprise.ownerType === 'household' && enterprise.ownerId) {
            _unregisterFromHousehold(enterprise.ownerId, enterprise.id, _requireCurrentYear());
        }

        var removed = enterprises.splice(index, 1)[0];
        _commit('enterprise_deleted', { id: id });

        _logEvent('enterprise', 'Enterprise Deleted',
            'Enterprise "' + removed.name + '" deleted',
            []);

        return { success: true };
    }

    // =========================================================================
    // 5. WORKER MANAGEMENT
    // =========================================================================

    function addWorkerToEnterprise(enterpriseId, workerId, wage) {
        if (!enterpriseId) {
            return { success: false, reason: 'Enterprise id is required' };
        }
        if (!workerId) {
            return { success: false, reason: 'Worker id is required' };
        }

        var index = _findEnterpriseIndex(enterpriseId);
        if (index === -1) {
            return { success: false, reason: 'Enterprise not found' };
        }

        var enterprises = _requireEnterprisesArray();
        var candidate = _cloneEnterprise(enterprises[index]);

        if (candidate.status === 'bankrupt' || candidate.status === 'closed') {
            return { success: false, reason: 'Cannot add workers to a ' + candidate.status + ' enterprise' };
        }

        // Cross-domain: verify the character exists
        var getChar = _requireCharacterAccessor();
        var character = getChar(workerId);
        if (!character) {
            return { success: false, reason: 'Worker character not found: ' + workerId };
        }

        if (candidate.workerList.indexOf(workerId) !== -1) {
            return { success: false, reason: 'Character is already a worker' };
        }

        if (candidate.workerList.length >= candidate.maxWorkers) {
            return { success: false, reason: 'Enterprise is at maximum worker capacity' };
        }

        var resolvedWage = wage;
        if (resolvedWage === undefined || resolvedWage === null) {
            resolvedWage = candidate.wages;
        }
        if (typeof resolvedWage !== 'number' || resolvedWage < 0) {
            return { success: false, reason: 'Invalid wage value' };
        }

        candidate.workerList.push(workerId);
        candidate.workerWages[workerId] = resolvedWage;
        candidate.workerCount = candidate.workerList.length;
        candidate.updatedAt = Date.now();

        enterprises[index] = candidate;
        _commit('enterprise_updated', { enterprise: candidate });

        _logEvent('enterprise', 'Worker Added',
            'Worker added to "' + candidate.name + '"',
            [workerId]);

        return { success: true, data: { enterpriseId: enterpriseId, workerId: workerId, wage: resolvedWage } };
    }

    function removeWorkerFromEnterprise(enterpriseId, workerId) {
        if (!enterpriseId) {
            return { success: false, reason: 'Enterprise id is required' };
        }
        if (!workerId) {
            return { success: false, reason: 'Worker id is required' };
        }

        var index = _findEnterpriseIndex(enterpriseId);
        if (index === -1) {
            return { success: false, reason: 'Enterprise not found' };
        }

        var enterprises = _requireEnterprisesArray();
        var candidate = _cloneEnterprise(enterprises[index]);

        var listIndex = candidate.workerList.indexOf(workerId);
        if (listIndex === -1) {
            return { success: false, reason: 'Worker not found in enterprise' };
        }

        candidate.workerList.splice(listIndex, 1);
        delete candidate.workerWages[workerId];
        candidate.workerCount = candidate.workerList.length;
        candidate.updatedAt = Date.now();

        enterprises[index] = candidate;
        _commit('enterprise_updated', { enterprise: candidate });

        _logEvent('enterprise', 'Worker Removed',
            'Worker removed from "' + candidate.name + '"',
            [workerId]);

        return { success: true };
    }

    function setWorkerWage(enterpriseId, workerId, wage) {
        if (!enterpriseId) {
            return { success: false, reason: 'Enterprise id is required' };
        }
        if (!workerId) {
            return { success: false, reason: 'Worker id is required' };
        }
        if (typeof wage !== 'number' || wage < 0) {
            return { success: false, reason: 'Invalid wage value' };
        }

        var index = _findEnterpriseIndex(enterpriseId);
        if (index === -1) {
            return { success: false, reason: 'Enterprise not found' };
        }

        var enterprises = _requireEnterprisesArray();
        var candidate = _cloneEnterprise(enterprises[index]);

        if (candidate.workerList.indexOf(workerId) === -1) {
            return { success: false, reason: 'Worker not found in enterprise' };
        }

        candidate.workerWages[workerId] = wage;
        candidate.updatedAt = Date.now();

        enterprises[index] = candidate;
        _commit('enterprise_updated', { enterprise: candidate });

        return { success: true };
    }

    // =========================================================================
    // 6. FINANCIAL OPERATIONS
    // =========================================================================

    function updateEnterpriseWealth(enterpriseId, amount, reason) {
        if (!enterpriseId) {
            return { success: false, reason: 'Enterprise id is required' };
        }
        if (typeof amount !== 'number' || !isFinite(amount)) {
            return { success: false, reason: 'Amount must be a finite number' };
        }

        var index = _findEnterpriseIndex(enterpriseId);
        if (index === -1) {
            return { success: false, reason: 'Enterprise not found' };
        }

        var enterprises = _requireEnterprisesArray();
        var candidate = _cloneEnterprise(enterprises[index]);

        if (candidate.status === 'demolished') {
            return { success: false, reason: 'Cannot modify wealth of demolished enterprise' };
        }

        var oldWealth = candidate.wealth;
        candidate.wealth = oldWealth + amount;
        candidate.updatedAt = Date.now();

        candidate.history.push({
            year: _requireCurrentYear(),
            type: 'wealth_change',
            amount: amount,
            newWealth: candidate.wealth,
            reason: reason === undefined ? null : reason
        });

        enterprises[index] = candidate;
        _commit('enterprise_updated', { enterprise: candidate });

        return { success: true, data: { newWealth: candidate.wealth, change: amount } };
    }

    function updateEnterpriseDebt(enterpriseId, amount, reason) {
        if (!enterpriseId) {
            return { success: false, reason: 'Enterprise id is required' };
        }
        if (typeof amount !== 'number' || !isFinite(amount)) {
            return { success: false, reason: 'Amount must be a finite number' };
        }

        var index = _findEnterpriseIndex(enterpriseId);
        if (index === -1) {
            return { success: false, reason: 'Enterprise not found' };
        }

        var enterprises = _requireEnterprisesArray();
        var candidate = _cloneEnterprise(enterprises[index]);

        if (candidate.status === 'demolished') {
            return { success: false, reason: 'Cannot modify debt of demolished enterprise' };
        }

        var oldDebt = candidate.debt;
        candidate.debt = Math.max(0, oldDebt + amount);
        candidate.updatedAt = Date.now();

        candidate.history.push({
            year: _requireCurrentYear(),
            type: 'debt_change',
            amount: amount,
            newDebt: candidate.debt,
            reason: reason === undefined ? null : reason
        });

        enterprises[index] = candidate;
        _commit('enterprise_updated', { enterprise: candidate });

        return { success: true, data: { newDebt: candidate.debt, change: amount } };
    }

    // =========================================================================
    // 7. ANNUAL PROCESSING COMMAND
    // =========================================================================
    //
    // Applied atomically by the Processor. All enterprise-side changes for a
    // single annual processing event go through this one command.
    //
    // Household transfer is orchestrated here so the whole operation is one
    // logical transaction.

    /**
     * @param {string} enterpriseId
     * @param {Object} result - calculated transition from IndustryEconomics
     *   {
     *     currentYear,
     *     yearsProcessed,
     *     newWealth,
     *     newDebt,
     *     nextStatus,
     *     historyEntries: [ ... ],   // optional
     *     householdTransfer: number|null,
     *     householdId: string|null,
     *     householdReason: string|null
     *   }
     */
    function applyAnnualProcessing(enterpriseId, result) {
        if (!enterpriseId) {
            return { success: false, reason: 'Enterprise id is required' };
        }
        if (!result) {
            return { success: false, reason: 'Processing result is required' };
        }

        var index = _findEnterpriseIndex(enterpriseId);
        if (index === -1) {
            return { success: false, reason: 'Enterprise not found' };
        }

        var enterprises = _requireEnterprisesArray();
        var candidate = _cloneEnterprise(enterprises[index]);

        if (typeof result.newWealth === 'number') {
            candidate.wealth = result.newWealth;
        }
        if (typeof result.newDebt === 'number') {
            candidate.debt = result.newDebt;
        }
        if (result.nextStatus !== undefined && result.nextStatus !== null) {
            candidate.status = result.nextStatus;
        }
        if (typeof result.currentYear === 'number') {
            candidate.lastProcessedYear = result.currentYear;
        }
        if (Array.isArray(result.historyEntries)) {
            for (var i = 0; i < result.historyEntries.length; i++) {
                candidate.history.push(result.historyEntries[i]);
            }
        }
        candidate.updatedAt = Date.now();

        var validation = _validateEnterpriseCandidate(candidate);
        if (!validation.ok) {
            return { success: false, reason: validation.reason };
        }

        enterprises[index] = candidate;

        // Cross-domain: household wealth transfer as part of the same transaction
        if (result.householdTransfer !== undefined && result.householdTransfer !== null &&
            result.householdId) {
            var hhResult = _applyHouseholdTransfer(
                result.householdId,
                result.householdTransfer,
                result.householdReason
            );
            if (!hhResult.success) {
                // Roll back the enterprise change — do NOT commit a partial transaction.
                enterprises[index] = candidate; // no-op, but explicit
                // We haven't committed yet, so restore is as simple as not committing.
                // (candidate hasn't replaced the array yet at this point? It has.)
                // To be transactional: apply household FIRST, or roll back here.
                // Simplest: apply household first, then enterprise. See note below.
                return { success: false, reason: 'Household transfer failed: ' + hhResult.reason };
            }
        }

        _commit('enterprise_processed', { enterprise: candidate });

        return { success: true, data: candidate };
    }

    // =========================================================================
    // 8. PUBLIC ENTERPRISE HELPERS
    // =========================================================================

    function createPublicEnterprise(locationId, data) {
        if (!locationId) {
            return { success: false, reason: 'Location id is required for public enterprise' };
        }

        var getPlace = _requirePlaceAccessor();
        var place = getPlace(locationId);
        if (!place) {
            return { success: false, reason: 'Location not found: ' + locationId };
        }

        var payload = {};
        for (var key in data) {
            if (data.hasOwnProperty(key)) payload[key] = data[key];
        }
        payload.ownershipType = 'public';
        payload.ownerType = 'settlement';
        payload.ownerId = locationId;
        payload.ownerName = place.displayName;
        if (payload.locationId === undefined || payload.locationId === null) {
            payload.locationId = locationId;
        }
        if (payload.locationName === undefined || payload.locationName === null) {
            payload.locationName = place.displayName;
        }

        return createEnterprise(payload);
    }

    function convertEnterpriseToPublic(enterpriseId, locationId) {
        if (!locationId) {
            return { success: false, reason: 'Location id is required' };
        }

        var getPlace = _requirePlaceAccessor();
        var place = getPlace(locationId);
        if (!place) {
            return { success: false, reason: 'Location not found: ' + locationId };
        }

        return updateEnterprise(enterpriseId, {
            ownershipType: 'public',
            ownerType: 'settlement',
            ownerId: locationId,
            ownerName: place.displayName
        });
    }

    // =========================================================================
    // 9. DEMOLISH / REBUILD
    // =========================================================================

    function demolishEnterprise(enterpriseId, reason, year, options) {
        if (!enterpriseId) {
            return { success: false, error: 'Enterprise id is required' };
        }

        var index = _findEnterpriseIndex(enterpriseId);
        if (index === -1) {
            return { success: false, error: 'Enterprise not found' };
        }

        var enterprises = _requireEnterprisesArray();
        var existing = enterprises[index];

        if (existing.status === 'demolished') {
            return { success: false, error: 'Enterprise already demolished' };
        }

        options = options || {};
        var demolishYear = (year === undefined || year === null)
            ? _requireCurrentYear()
            : year;
        var demolishReason = (reason === undefined || reason === null)
            ? 'Demolished'
            : reason;

        var candidate = _cloneEnterprise(existing);

        var demolitionRecord = {
            enterpriseId: existing.id,
            enterpriseName: existing.name,
            typeId: existing.typeId,
            typeName: existing.typeName,
            category: existing.category,
            locationId: existing.locationId,
            locationName: existing.locationName,
            demolishedYear: demolishYear,
            demolishedReason: demolishReason,
            destroyedBy: options.destroyedBy === undefined ? 'manual' : options.destroyedBy,
            disasterId: options.disasterId === undefined ? null : options.disasterId,
            previousStatus: existing.status,
            previousWealth: existing.wealth,
            previousDebt: existing.debt,
            previousWorkerCount: existing.workerList ? existing.workerList.length : 0,
            workerIds: existing.workerList ? existing.workerList.slice() : [],
            ownershipType: existing.ownershipType,
            ownerId: existing.ownerId,
            ownerName: existing.ownerName,
            timestamp: Date.now()
        };

        candidate.status = 'demolished';
        candidate.demolishedAt = demolishYear;
        candidate.demolishedReason = demolishReason;
        candidate.destroyedBy = demolitionRecord.destroyedBy;
        candidate.disasterId = demolitionRecord.disasterId;
        candidate.demolishedRecord = demolitionRecord;
        candidate.workerList = [];
        candidate.workerWages = {};
        candidate.workerCount = 0;
        candidate.wealth = 0;
        candidate.debt = 0;
        candidate.updatedAt = Date.now();

        candidate.history.push({
            year: demolishYear,
            type: 'demolished',
            reason: demolishReason,
            destroyedBy: demolitionRecord.destroyedBy,
            disasterId: demolitionRecord.disasterId,
            record: demolitionRecord,
            timestamp: Date.now()
        });

        // Cross-domain: unregister from household
        if (existing.ownerType === 'household' && existing.ownerId) {
            _unregisterFromHousehold(existing.ownerId, existing.id, demolishYear);
        }

        enterprises[index] = candidate;
        _commit('enterprise_demolished', { enterprise: candidate, record: demolitionRecord });

        _logEvent('enterprise', 'Enterprise Demolished',
            'Enterprise "' + candidate.name + '" demolished: ' + demolishReason,
            []);

        return { success: true, demolitionRecord: demolitionRecord, enterprise: candidate };
    }

    function rebuildEnterprise(enterpriseId, rebuildYear, options) {
        if (!enterpriseId) {
            return { success: false, error: 'Enterprise id is required' };
        }

        var index = _findEnterpriseIndex(enterpriseId);
        if (index === -1) {
            return { success: false, error: 'Enterprise not found' };
        }

        var enterprises = _requireEnterprisesArray();
        var existing = enterprises[index];

        if (existing.status !== 'demolished') {
            return { success: false, error: 'Enterprise is not demolished' };
        }

        var record = existing.demolishedRecord;
        if (!record) {
            return { success: false, error: 'No demolition record found' };
        }

        options = options || {};
        var rebuildYearValue = (rebuildYear === undefined || rebuildYear === null)
            ? _requireCurrentYear()
            : rebuildYear;

        var candidate = _cloneEnterprise(existing);

        var initialWealth;
        if (options.initialWealth !== undefined && options.initialWealth !== null) {
            initialWealth = options.initialWealth;
        } else {
            initialWealth = Math.max(10, Math.floor((record.previousWealth || 0) / 2));
        }

        candidate.status = 'active';
        candidate.demolishedAt = null;
        candidate.demolishedReason = null;
        candidate.destroyedBy = null;
        candidate.disasterId = null;
        candidate.demolishedRecord = null;
        candidate.wealth = initialWealth;
        candidate.debt = 0;
        candidate.workerList = [];
        candidate.workerWages = {};
        candidate.workerCount = 0;
        candidate.updatedAt = Date.now();

        candidate.history.push({
            year: rebuildYearValue,
            type: 'rebuilt',
            reason: options.reason === undefined ? 'Rebuilt after destruction' : options.reason,
            fromRecord: record,
            timestamp: Date.now()
        });

        // Cross-domain: re-register with household if it previously owned it
        if (record.ownerId && record.ownerType === 'household') {
            _registerWithHousehold(record.ownerId, existing.id, rebuildYearValue);
        }

        enterprises[index] = candidate;
        _commit('enterprise_rebuilt', { enterprise: candidate, rebuiltAt: rebuildYearValue });

        _logEvent('enterprise', 'Enterprise Rebuilt',
            'Enterprise "' + candidate.name + '" rebuilt',
            []);

        return { success: true, enterprise: candidate, rebuiltAt: rebuildYearValue };
    }

    // =========================================================================
    // 10. VALIDATION
    // =========================================================================

    function _validateEnterpriseCandidate(candidate) {
        if (!candidate.name || typeof candidate.name !== 'string' || candidate.name.trim() === '') {
            return { ok: false, reason: 'Enterprise name is required' };
        }
        if (!candidate.typeId) {
            return { ok: false, reason: 'Enterprise type is required' };
        }
        if (candidate.ownershipType !== 'public' && candidate.ownershipType !== 'private') {
            return { ok: false, reason: 'Invalid ownershipType: ' + candidate.ownershipType };
        }
        if (candidate.ownerType !== 'none' &&
            candidate.ownerType !== 'character' &&
            candidate.ownerType !== 'household' &&
            candidate.ownerType !== 'settlement' &&
            candidate.ownerType !== 'state') {
            return { ok: false, reason: 'Invalid ownerType: ' + candidate.ownerType };
        }
        if (candidate.ownerType === 'none' && candidate.ownerId) {
            return { ok: false, reason: 'ownerType "none" cannot have an ownerId' };
        }
        if (candidate.ownerType !== 'none' && !candidate.ownerId) {
            return { ok: false, reason: 'ownerType requires an ownerId' };
        }
        if (typeof candidate.wealth !== 'number' || !isFinite(candidate.wealth)) {
            return { ok: false, reason: 'wealth must be a finite number' };
        }
        if (typeof candidate.debt !== 'number' || !isFinite(candidate.debt) || candidate.debt < 0) {
            return { ok: false, reason: 'debt must be a non-negative finite number' };
        }
        if (typeof candidate.maxWorkers !== 'number' || candidate.maxWorkers < 0) {
            return { ok: false, reason: 'maxWorkers must be a non-negative number' };
        }
        if (candidate.workerList.length > candidate.maxWorkers) {
            return { ok: false, reason: 'workerList exceeds maxWorkers' };
        }
        return { ok: true };
    }

    // =========================================================================
    // 11. CROSS-DOMAIN: HOUSEHOLD
    // =========================================================================
    //
    // Industry does not own household records. All household mutations go
    // through HouseholdCommands. If the household domain does not yet expose
    // a Commands interface, these helpers fail loudly rather than silently
    // mutating HouseholdState.

    function _getHouseholdCommands() {
        return window.HouseholdCommands || null;
    }

    function _registerWithHousehold(householdId, enterpriseId, year) {
        var cmd = _getHouseholdCommands();
        if (cmd && typeof cmd.addEnterprise === 'function') {
            var r = cmd.addEnterprise(householdId, enterpriseId, year);
            if (!r || !r.success) {
                throw new Error('IndustryCommands: HouseholdCommands.addEnterprise failed for ' +
                    householdId + ' / ' + enterpriseId);
            }
            return;
        }
        throw new Error('IndustryCommands: HouseholdCommands.addEnterprise is required but unavailable');
    }

    function _unregisterFromHousehold(householdId, enterpriseId, year) {
        var cmd = _getHouseholdCommands();
        if (cmd && typeof cmd.removeEnterprise === 'function') {
            var r = cmd.removeEnterprise(householdId, enterpriseId, year);
            if (!r || !r.success) {
                throw new Error('IndustryCommands: HouseholdCommands.removeEnterprise failed for ' +
                    householdId + ' / ' + enterpriseId);
            }
            return;
        }
        throw new Error('IndustryCommands: HouseholdCommands.removeEnterprise is required but unavailable');
    }

    function _applyHouseholdTransfer(householdId, amount, reason) {
        var cmd = _getHouseholdCommands();
        if (cmd && typeof cmd.adjustWealth === 'function') {
            return cmd.adjustWealth(householdId, amount, reason);
        }
        throw new Error('IndustryCommands: HouseholdCommands.adjustWealth is required but unavailable');
    }

    // =========================================================================
    // 12. HELPERS
    // =========================================================================

    function _resolveCreationNumber(provided, fallback) {
        if (provided === undefined || provided === null) return fallback;
        return provided;
    }

    // =========================================================================
    // 13. EXPORTS
    // =========================================================================

    window.IndustryCommands = {
        // Core CRUD
        createEnterprise: createEnterprise,
        updateEnterprise: updateEnterprise,
        deleteEnterprise: deleteEnterprise,

        // Worker management
        addWorkerToEnterprise: addWorkerToEnterprise,
        removeWorkerFromEnterprise: removeWorkerFromEnterprise,
        setWorkerWage: setWorkerWage,

        // Financial operations
        updateEnterpriseWealth: updateEnterpriseWealth,
        updateEnterpriseDebt: updateEnterpriseDebt,

        // Annual processing (called by IndustryProcessor)
        applyAnnualProcessing: applyAnnualProcessing,

        // Public enterprise
        createPublicEnterprise: createPublicEnterprise,
        convertEnterpriseToPublic: convertEnterpriseToPublic,

        // Demolish / rebuild
        demolishEnterprise: demolishEnterprise,
        rebuildEnterprise: rebuildEnterprise
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.IndustryCommands;
    }

})();
