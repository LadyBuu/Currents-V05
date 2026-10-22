/**
 * =============================================================================
 * STILL WATERS - INDUSTRY STATE (industry-state.js)
 * =============================================================================
 *
 * LOCATION: js/core/industry/industry-state.js
 *
 * Authoritative in-memory store for enterprise records and enterprise types.
 *
 * SINGLE SOURCE OF TRUTH for the industry catalogue at runtime.
 *
 * EXPORTED FUNCTIONS:
 *   Lifecycle:
 *     - IndustryState.hydrateFromMasterData(enterprises, types)
 *     - IndustryState.isHydrated()
 *
 *   Subscriptions:
 *     - IndustryState.subscribe(callback) -> unsubscribe
 *
 *   Reads (clones):
 *     - IndustryState.getAllEnterprises()
 *     - IndustryState.getEnterprise(id)
 *     - IndustryState.getEnterprisesByOwner(ownerId, ownerType)
 *     - IndustryState.getEnterprisesByLocation(locationId)
 *     - IndustryState.getEnterprisesByType(typeId)
 *     - IndustryState.getEnterprisesByStatus(status)
 *     - IndustryState.getEnterprisesByOwnershipType(ownershipType)
 *     - IndustryState.getEnterpriseCount()
 *
 *     - IndustryState.getAllEnterpriseTypes()
 *     - IndustryState.getEnterpriseType(id)
 *     - IndustryState.getEnterpriseTypesByCategory(category)
 *     - IndustryState.getEnterpriseTypeCount()
 *
 *   Diagnostics:
 *     - IndustryState.validateIntegrity() -> { valid, errors }
 *
 *   Internal (commands + bootstrap only):
 *     - IndustryState._getEnterpriseCanonical(id)
 *     - IndustryState._getAllEnterprisesCanonical()
 *     - IndustryState._getEnterpriseTypeCanonical(id)
 *     - IndustryState._getAllEnterpriseTypesCanonical()
 *     - IndustryState._addEnterprise(record)
 *     - IndustryState._updateEnterprise(id, patch)
 *     - IndustryState._removeEnterprise(id)
 *     - IndustryState._addEnterpriseType(record)
 *     - IndustryState._updateEnterpriseType(id, patch)
 *     - IndustryState._removeEnterpriseType(id)
 *     - IndustryState._indexesRebuild()
 *
 * OWNERSHIP CONTRACT:
 *   IndustryState owns:
 *     - the in-memory enterprise array
 *     - the in-memory enterprise type array
 *     - derived indexes (byId, byOwner, byLocation, byStatus, byType,
 *       byOwnershipType, typesById, typesByCategory)
 *     - subscription notification
 *
 *   IndustryState does NOT own:
 *     - persistence format (storage.js owns bytes)
 *     - enterprise policy (industry-rules.js)
 *     - enterprise mutations (industry-commands.js)
 *     - type mutations (industry-type-commands.js)
 *     - economic arithmetic (industry-economics.js)
 *     - owner/location/worker name resolution (industry-queries.js)
 *
 * PERSISTENCE CONTRACT:
 *   State does not persist. Every mutation writes the in-memory arrays back
 *   into masterData.data.enterprises / masterData.data.enterpriseTypes, then
 *   calls window.markDataDirty(). Storage decides when to flush.
 *
 *   IndustryCommands.persist() and IndustryTypeCommands.persist() call
 *   window.saveMasterData() once per batch.
 *
 * INITIALISATION CONTRACT:
 *   Hydration is explicit. IndustryBootstrap calls:
 *       IndustryState.hydrateFromMasterData(
 *           window.masterData.data.enterprises || [],
 *           window.masterData.data.enterpriseTypes || []
 *       )
 *   once, before any query or command runs. Public readers throw if state
 *   has not been hydrated.
 *
 *   Rehydration is allowed via the masterDataUpdated listener.
 *
 * READ CONTRACT:
 *   Public reads return clones. Container array and object fields on each
 *   record are copied. No public read returns a live canonical record.
 *
 *   Authorized mutation code calls _getEnterpriseCanonical(id) /
 *   _getEnterpriseTypeCanonical(id) for a live reference. Reserved for
 *   IndustryCommands, IndustryTypeCommands, and IndustryBootstrap. Must not
 *   be called by queries, UI, or cross-domain consumers.
 *
 * SEMANTIC RULES:
 *   - Missing enterprise -> null. Missing type -> null. Missing collection -> [].
 *   - Year 0 is preserved. Zero wealth is preserved. Empty string name is
 *     rejected at hydrate time.
 *   - Duplicate enterprise ids fail hydration loudly. Duplicate type ids do too.
 *   - Unknown fields on a record are preserved (forward compatibility).
 *
 * DEPENDENCIES (REQUIRED at load):
 *   - storage.js:  window.masterData, window.markDataDirty
 *   - industry-constants.js: window.IndustryConstants
 *
 * DEPENDENCIES (NONE at load):
 *   industry-rules.js is NOT required here — state does not validate
 *   policy. Records are normalised for shape only.
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

    if (typeof window.IndustryConstants === 'undefined'
        || window.IndustryConstants === null) {
        throw new Error(
            'industry-state.js requires industry-constants.js to load first.'
        );
    }

    var C = window.IndustryConstants;

    // =========================================================================
    // 2. PRIVATE STATE
    // =========================================================================

    var _enterprises = [];
    var _enterpriseTypes = [];

    var _cache = {
        byId: new Map(),
        byOwner: new Map(),
        byLocation: new Map(),
        byStatus: new Map(),
        byType: new Map(),
        byOwnershipType: new Map(),

        typesById: new Map(),
        typesByCategory: new Map()
    };

    var _subscribers = [];
    var _hydrated = false;

    // =========================================================================
    // 3. DEPENDENCY WRAPPERS (call-time)
    // =========================================================================

    function _requireMasterData() {
        if (typeof window.masterData === 'undefined'
            || !window.masterData
            || !window.masterData.data
            || typeof window.masterData.data !== 'object') {
            throw new Error(
                'industry-state.js: window.masterData is not initialised. ' +
                'storage.js must load and run before ' +
                'IndustryState.hydrateFromMasterData.'
            );
        }
    }

    function _markDataDirty() {
        if (typeof window.markDataDirty !== 'function') {
            throw new Error(
                'industry-state.js: window.markDataDirty is not available. ' +
                'storage.js must load before any industry mutation runs.'
            );
        }
        window.markDataDirty();
    }

    // =========================================================================
    // 4. HELPERS
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

    function _cloneRecord(record) {
        if (!record) return null;
        var out = {};
        for (var key in record) {
            if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
            var v = record[key];
            if (Array.isArray(v)) {
                out[key] = v.slice();
            } else if (_isPlainObject(v)) {
                out[key] = Object.assign({}, v);
            } else {
                out[key] = v;
            }
        }
        return out;
    }

    function _cloneArray(list) {
        var out = [];
        for (var i = 0; i < list.length; i++) {
            out.push(_cloneRecord(list[i]));
        }
        return out;
    }

    // =========================================================================
    // 5. NORMALISATION
    // =========================================================================
    //
    // Runs on every record at hydrate time and again on every record written
    // through a mutation primitive. Guarantees every record in memory has the
    // shape the rest of the domain expects. Unknown extra fields on an
    // incoming record are preserved. Known fields are coerced to the correct
    // shape. Policy validation (name non-empty, ownership coherence) is NOT
    // performed here — that belongs to industry-rules.js and is the command
    // layer's job to invoke before calling a primitive.

    function _normaliseEnterprise(raw) {
        var r = _isPlainObject(raw) ? raw : {};

        var out = {};
        for (var key in r) {
            if (Object.prototype.hasOwnProperty.call(r, key)) {
                out[key] = r[key];
            }
        }

        out.id = _hasId(r.id) ? r.id : out.id;
        out.name = typeof r.name === 'string' ? r.name : '';
        out.typeId = _hasId(r.typeId) ? r.typeId : null;

        out.ownershipType =
            r.ownershipType === C.OWNERSHIP_TYPE.PUBLIC
                || r.ownershipType === C.OWNERSHIP_TYPE.PRIVATE
                ? r.ownershipType
                : null;

        out.ownerType =
            C.VALID_OWNER_TYPES.indexOf(r.ownerType) !== -1
                ? r.ownerType
                : C.OWNER_TYPE.NONE;

        out.ownerId = _hasId(r.ownerId) ? r.ownerId : null;

        out.locationId = _hasId(r.locationId) ? r.locationId : null;

        out.wealth = typeof r.wealth === 'number' && Number.isFinite(r.wealth)
            ? r.wealth : 0;
        out.debt = typeof r.debt === 'number' && Number.isFinite(r.debt) && r.debt >= 0
            ? r.debt : 0;
        out.income = typeof r.income === 'number' && Number.isFinite(r.income)
            ? r.income : 0;
        out.expenses = typeof r.expenses === 'number' && Number.isFinite(r.expenses)
            ? r.expenses : 0;
        out.wages = typeof r.wages === 'number' && Number.isFinite(r.wages)
            ? r.wages : 0;

        out.maxWorkers = typeof r.maxWorkers === 'number'
            && Number.isFinite(r.maxWorkers)
            && r.maxWorkers >= 0
            ? r.maxWorkers : 0;

        out.workerList = Array.isArray(r.workerList) ? r.workerList.slice() : [];

        out.workerWages = _isPlainObject(r.workerWages)
            ? Object.assign({}, r.workerWages)
            : {};

        var validStatuses = [
            C.STATUS.ACTIVE, C.STATUS.INACTIVE, C.STATUS.BANKRUPT,
            C.STATUS.CLOSED, C.STATUS.DEMOLISHED
        ];
        out.status = validStatuses.indexOf(r.status) !== -1
            ? r.status : C.STATUS.ACTIVE;

        out.foundedYear = _isMissing(r.foundedYear) ? null : r.foundedYear;
        out.lastProcessedYear = _isMissing(r.lastProcessedYear)
            ? null : r.lastProcessedYear;

        out.history = Array.isArray(r.history) ? r.history.slice() : [];
        out.notes = typeof r.notes === 'string' ? r.notes : '';

        out.createdAt = _isMissing(r.createdAt) ? null : r.createdAt;
        out.updatedAt = _isMissing(r.updatedAt) ? null : r.updatedAt;

        // Tombstone fields are preserved as-is when present. Their coherence
        // (demolishedAt set only when status === 'demolished') is a rules
        // concern, not a shape concern.
        if (!_isMissing(r.demolishedAt)) out.demolishedAt = r.demolishedAt;
        if (!_isMissing(r.demolishedReason)) out.demolishedReason = r.demolishedReason;
        if (!_isMissing(r.destroyedBy)) out.destroyedBy = r.destroyedBy;
        if (!_isMissing(r.disasterId)) out.disasterId = r.disasterId;
        if (!_isMissing(r.demolishedRecord)) out.demolishedRecord = r.demolishedRecord;

        return out;
    }

    function _normaliseEnterpriseType(raw) {
        var r = _isPlainObject(raw) ? raw : {};

        var out = {};
        for (var key in r) {
            if (Object.prototype.hasOwnProperty.call(r, key)) {
                out[key] = r[key];
            }
        }

        out.id = _hasId(r.id) ? r.id : out.id;
        out.name = typeof r.name === 'string' ? r.name : '';
        out.category = typeof r.category === 'string' ? r.category : 'other';

        out.baseIncome = typeof r.baseIncome === 'number'
            && Number.isFinite(r.baseIncome) && r.baseIncome >= 0
            ? r.baseIncome : 0;
        out.baseExpenses = typeof r.baseExpenses === 'number'
            && Number.isFinite(r.baseExpenses) && r.baseExpenses >= 0
            ? r.baseExpenses : 0;
        out.baseWages = typeof r.baseWages === 'number'
            && Number.isFinite(r.baseWages) && r.baseWages >= 0
            ? r.baseWages : 0;
        out.baseWorkers = typeof r.baseWorkers === 'number'
            && Number.isFinite(r.baseWorkers) && r.baseWorkers >= 0
            ? r.baseWorkers : 0;
        out.baseCost = typeof r.baseCost === 'number'
            && Number.isFinite(r.baseCost) && r.baseCost >= 0
            ? r.baseCost : 0;
        out.maxWorkers = typeof r.maxWorkers === 'number'
            && Number.isFinite(r.maxWorkers) && r.maxWorkers >= 1
            ? r.maxWorkers : 1;

        out.description = typeof r.description === 'string' ? r.description : '';

        return out;
    }

    // =========================================================================
    // 6. CACHE REBUILD
    // =========================================================================

    function _pushToIndex(map, key, value) {
        var list = map.get(key);
        if (!list) {
            list = [];
            map.set(key, list);
        }
        list.push(value);
    }

    function _indexesRebuild() {
        _cache.byId.clear();
        _cache.byOwner.clear();
        _cache.byLocation.clear();
        _cache.byStatus.clear();
        _cache.byType.clear();
        _cache.byOwnershipType.clear();
        _cache.typesById.clear();
        _cache.typesByCategory.clear();

        for (var i = 0; i < _enterprises.length; i++) {
            var e = _enterprises[i];
            if (!e || !_hasId(e.id)) continue;

            _cache.byId.set(e.id, e);

            if (e.ownerType && e.ownerType !== C.OWNER_TYPE.NONE && e.ownerId) {
                _pushToIndex(_cache.byOwner, e.ownerId + '|' + e.ownerType, e);
            }
            if (e.locationId) {
                _pushToIndex(_cache.byLocation, e.locationId, e);
            }
            if (e.status) {
                _pushToIndex(_cache.byStatus, e.status, e);
            }
            if (e.typeId) {
                _pushToIndex(_cache.byType, e.typeId, e);
            }
            if (e.ownershipType) {
                _pushToIndex(_cache.byOwnershipType, e.ownershipType, e);
            }
        }

        for (var j = 0; j < _enterpriseTypes.length; j++) {
            var t = _enterpriseTypes[j];
            if (!t || !_hasId(t.id)) continue;
            _cache.typesById.set(t.id, t);
            if (t.category) {
                _pushToIndex(_cache.typesByCategory, t.category, t);
            }
        }
    }

    // =========================================================================
    // 7. PERSISTENCE SYNC (in-memory write only; no storage call)
    // =========================================================================
    //
    // After every mutation:
    //   - masterData.data.enterprises is reassigned to a shallow copy
    //   - masterData.data.enterpriseTypes is reassigned to a shallow copy
    //   - markDataDirty() is called
    //
    // Storage flushes on its own schedule. IndustryCommands.persist() forces
    // a synchronous flush when the caller wants one.

    function _syncToMasterData() {
        _requireMasterData();
        window.masterData.data.enterprises = _enterprises.slice();
        window.masterData.data.enterpriseTypes = _enterpriseTypes.slice();
        _markDataDirty();
    }

    // =========================================================================
    // 8. NOTIFICATION
    // =========================================================================
    //
    // Synchronous and compositional. A subscriber may mutate state in
    // response; that mutation emits its own event. No blanket suppression
    // guard. Cycles are solved at the command/event boundary, not here.

    function _notify(type, data) {
        var subscribers = _subscribers.slice();
        for (var i = 0; i < subscribers.length; i++) {
            try {
                subscribers[i]({ type: type, data: data });
            } catch (err) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('industry-state.js: subscriber threw:', err);
                }
            }
        }
    }

    // =========================================================================
    // 9. HYDRATION
    // =========================================================================

    /**
     * Replaces the in-memory catalogues with the supplied records.
     *
     * Called by IndustryBootstrap once, before any query or command runs.
     * May be called again to rebuild state (masterDataUpdated, reset, tests).
     *
     * Throws on:
     *   - missing masterData
     *   - non-array enterprises argument
     *   - non-array types argument
     *   - duplicate enterprise ids
     *   - duplicate type ids
     *
     * @param {Array} enterprises
     * @param {Array} enterpriseTypes
     */
    function hydrateFromMasterData(enterprises, enterpriseTypes) {
        _requireMasterData();

        if (enterprises === undefined || enterprises === null) enterprises = [];
        if (!Array.isArray(enterprises)) {
            throw new Error(
                'industry-state.js: hydrateFromMasterData expected an array of enterprises.'
            );
        }

        if (enterpriseTypes === undefined || enterpriseTypes === null) {
            enterpriseTypes = [];
        }
        if (!Array.isArray(enterpriseTypes)) {
            throw new Error(
                'industry-state.js: hydrateFromMasterData expected an array of enterprise types.'
            );
        }

        var seenEnterpriseIds = {};
        var nextEnterprises = [];
        for (var i = 0; i < enterprises.length; i++) {
            var rawE = enterprises[i];
            if (!rawE || !_hasId(rawE.id)) {
                throw new Error(
                    'industry-state.js: enterprise at index ' + i + ' has no id.'
                );
            }
            if (seenEnterpriseIds[rawE.id]) {
                throw new Error(
                    'industry-state.js: duplicate enterprise id "' + rawE.id + '".'
                );
            }
            seenEnterpriseIds[rawE.id] = true;
            nextEnterprises.push(_normaliseEnterprise(rawE));
        }

        var seenTypeIds = {};
        var nextTypes = [];
        for (var j = 0; j < enterpriseTypes.length; j++) {
            var rawT = enterpriseTypes[j];
            if (!rawT || !_hasId(rawT.id)) {
                throw new Error(
                    'industry-state.js: enterprise type at index ' + j + ' has no id.'
                );
            }
            if (seenTypeIds[rawT.id]) {
                throw new Error(
                    'industry-state.js: duplicate enterprise type id "' + rawT.id + '".'
                );
            }
            seenTypeIds[rawT.id] = true;
            nextTypes.push(_normaliseEnterpriseType(rawT));
        }

        _enterprises = nextEnterprises;
        _enterpriseTypes = nextTypes;
        _indexesRebuild();
        _hydrated = true;

        // Reflect the normalised catalogues back into masterData. No
        // markDataDirty: hydration is a read from storage, not a mutation.
        window.masterData.data.enterprises = _enterprises.slice();
        window.masterData.data.enterpriseTypes = _enterpriseTypes.slice();
    }

    function isHydrated() {
        return _hydrated === true;
    }

    function _assertHydrated() {
        if (!_hydrated) {
            throw new Error(
                'industry-state.js: IndustryState.hydrateFromMasterData must ' +
                'be called before any read or write.'
            );
        }
    }

    // =========================================================================
    // 10. SUBSCRIPTIONS
    // =========================================================================

    function subscribe(callback) {
        if (typeof callback !== 'function') {
            throw new Error('industry-state.js: subscribe expects a function.');
        }
        _subscribers.push(callback);
        return function unsubscribe() {
            var idx = _subscribers.indexOf(callback);
            if (idx !== -1) _subscribers.splice(idx, 1);
        };
    }

    // =========================================================================
    // 11. PUBLIC READS (clones)
    // =========================================================================

    function getAllEnterprises() {
        _assertHydrated();
        return _cloneArray(_enterprises);
    }

    function getEnterprise(enterpriseId) {
        _assertHydrated();
        if (!_hasId(enterpriseId)) return null;
        return _cloneRecord(_cache.byId.get(enterpriseId) || null);
    }

    function getEnterprisesByOwner(ownerId, ownerType) {
        _assertHydrated();
        if (!_hasId(ownerId)) return [];
        if (_isMissing(ownerType)) return [];
        var list = _cache.byOwner.get(ownerId + '|' + ownerType);
        return list ? _cloneArray(list) : [];
    }

    function getEnterprisesByLocation(locationId) {
        _assertHydrated();
        if (!_hasId(locationId)) return [];
        var list = _cache.byLocation.get(locationId);
        return list ? _cloneArray(list) : [];
    }

    function getEnterprisesByType(typeId) {
        _assertHydrated();
        if (!_hasId(typeId)) return [];
        var list = _cache.byType.get(typeId);
        return list ? _cloneArray(list) : [];
    }

    function getEnterprisesByStatus(status) {
        _assertHydrated();
        if (_isMissing(status)) return [];
        var list = _cache.byStatus.get(status);
        return list ? _cloneArray(list) : [];
    }

    function getEnterprisesByOwnershipType(ownershipType) {
        _assertHydrated();
        if (_isMissing(ownershipType)) return [];
        var list = _cache.byOwnershipType.get(ownershipType);
        return list ? _cloneArray(list) : [];
    }

    function getEnterpriseCount() {
        _assertHydrated();
        return _enterprises.length;
    }

    function getAllEnterpriseTypes() {
        _assertHydrated();
        return _cloneArray(_enterpriseTypes);
    }

    function getEnterpriseType(typeId) {
        _assertHydrated();
        if (!_hasId(typeId)) return null;
        return _cloneRecord(_cache.typesById.get(typeId) || null);
    }

    function getEnterpriseTypesByCategory(category) {
        _assertHydrated();
        if (_isMissing(category)) return [];
        var list = _cache.typesByCategory.get(category);
        return list ? _cloneArray(list) : [];
    }

    function getEnterpriseTypeCount() {
        _assertHydrated();
        return _enterpriseTypes.length;
    }

    // =========================================================================
    // 12. INTEGRITY DIAGNOSTIC
    // =========================================================================

    /**
     * Validates the in-memory catalogues.
     *
     * Checks:
     *   - every enterprise has a valid id, non-empty name, typeId
     *   - no duplicate enterprise ids
     *   - ownershipType is public|private
     *   - ownerType/ownerId coherence
     *   - typeId points at an existing type (broken reference reported)
     *   - locationId, when set, points at an existing place (only if
     *     getPlaceById is available; skipped otherwise)
     *   - ownerId, when set with ownerType household, points at an existing
     *     household (only if getHouseholdById is available; skipped otherwise)
     *   - ownerId, when set with ownerType character, points at an existing
     *     character (only if getCharacterById is available; skipped otherwise)
     *   - ownerId, when set with ownerType settlement|state, points at an
     *     existing place (only if getPlaceById is available; skipped otherwise)
     *   - every workerList entry resolves to an existing character (only if
     *     getCharacterById is available; skipped otherwise)
     *   - every enterprise type has a valid id, name, category
     *   - no duplicate type ids
     *   - maxWorkers >= 1; baseWorkers <= maxWorkers
     *
     * Returns { valid: boolean, errors: string[] }. Never throws.
     */
    function validateIntegrity() {
        if (!_hydrated) {
            return { valid: false, errors: ['state not hydrated'] };
        }

        var errors = [];

        var typeIds = {};
        for (var t = 0; t < _enterpriseTypes.length; t++) {
            typeIds[_enterpriseTypes[t].id] = true;
        }

        var seenEnterpriseIds = {};
        for (var i = 0; i < _enterprises.length; i++) {
            var e = _enterprises[i];
            if (!e || !_hasId(e.id)) {
                errors.push('enterprise at index ' + i + ' has no id');
                continue;
            }
            if (seenEnterpriseIds[e.id]) {
                errors.push('duplicate enterprise id "' + e.id + '"');
            }
            seenEnterpriseIds[e.id] = true;

            if (typeof e.name !== 'string' || e.name.trim() === '') {
                errors.push('enterprise "' + e.id + '" has no name');
            }
            if (!_hasId(e.typeId)) {
                errors.push('enterprise "' + e.id + '" has no typeId');
            } else if (!typeIds[e.typeId]) {
                errors.push('enterprise "' + e.id + '" references non-existent type "' +
                    e.typeId + '"');
            }

            if (C.VALID_OWNERSHIP_TYPES.indexOf(e.ownershipType) === -1) {
                errors.push('enterprise "' + e.id + '" has invalid ownershipType: ' +
                    e.ownershipType);
            }
            if (C.VALID_OWNER_TYPES.indexOf(e.ownerType) === -1) {
                errors.push('enterprise "' + e.id + '" has invalid ownerType: ' +
                    e.ownerType);
            }
            if (e.ownerType === C.OWNER_TYPE.NONE && e.ownerId) {
                errors.push('enterprise "' + e.id +
                    '" has ownerType "none" with an ownerId');
            }
            if (e.ownerType !== C.OWNER_TYPE.NONE && !e.ownerId) {
                errors.push('enterprise "' + e.id +
                    '" has ownerType "' + e.ownerType + '" without an ownerId');
            }
        }

        // Cross-domain reference checks are best-effort. Skip cleanly when
        // the accessor is not loaded; the bootstrap reports their absence.
        var getPlaceById = typeof window.getPlaceById === 'function'
            ? window.getPlaceById : null;
        var getCharacterById = typeof window.getCharacterById === 'function'
            ? window.getCharacterById : null;
        var getHouseholdById = typeof window.getHouseholdById === 'function'
            ? window.getHouseholdById : null;

        for (var k = 0; k < _enterprises.length; k++) {
            var ee = _enterprises[k];
            if (!ee || !_hasId(ee.id)) continue;

            if (ee.locationId && getPlaceById) {
                if (!getPlaceById(ee.locationId)) {
                    errors.push('enterprise "' + ee.id +
                        '" references non-existent location "' +
                        ee.locationId + '"');
                }
            }

            if (ee.ownerType === C.OWNER_TYPE.CHARACTER && ee.ownerId && getCharacterById) {
                if (!getCharacterById(ee.ownerId)) {
                    errors.push('enterprise "' + ee.id +
                        '" references non-existent owner character "' +
                        ee.ownerId + '"');
                }
            }
            if (ee.ownerType === C.OWNER_TYPE.HOUSEHOLD && ee.ownerId && getHouseholdById) {
                if (!getHouseholdById(ee.ownerId)) {
                    errors.push('enterprise "' + ee.id +
                        '" references non-existent owner household "' +
                        ee.ownerId + '"');
                }
            }
            if ((ee.ownerType === C.OWNER_TYPE.SETTLEMENT
                || ee.ownerType === C.OWNER_TYPE.STATE)
                && ee.ownerId && getPlaceById) {
                if (!getPlaceById(ee.ownerId)) {
                    errors.push('enterprise "' + ee.id +
                        '" references non-existent owner place "' +
                        ee.ownerId + '"');
                }
            }

            if (getCharacterById) {
                for (var wi = 0; wi < ee.workerList.length; wi++) {
                    var workerId = ee.workerList[wi];
                    if (!getCharacterById(workerId)) {
                        errors.push('enterprise "' + ee.id +
                            '" references non-existent worker "' +
                            workerId + '"');
                    }
                }
            }
        }

        var seenTypeIds = {};
        for (var ti = 0; ti < _enterpriseTypes.length; ti++) {
            var tt = _enterpriseTypes[ti];
            if (!tt || !_hasId(tt.id)) {
                errors.push('enterprise type at index ' + ti + ' has no id');
                continue;
            }
            if (seenTypeIds[tt.id]) {
                errors.push('duplicate enterprise type id "' + tt.id + '"');
            }
            seenTypeIds[tt.id] = true;

            if (typeof tt.name !== 'string' || tt.name.trim() === '') {
                errors.push('enterprise type "' + tt.id + '" has no name');
            }
            if (typeof tt.category !== 'string' || tt.category.trim() === '') {
                errors.push('enterprise type "' + tt.id + '" has no category');
            }
            if (typeof tt.maxWorkers !== 'number' || tt.maxWorkers < 1) {
                errors.push('enterprise type "' + tt.id +
                    '" has invalid maxWorkers: ' + tt.maxWorkers);
            }
            if (typeof tt.baseWorkers === 'number'
                && typeof tt.maxWorkers === 'number'
                && tt.baseWorkers > tt.maxWorkers) {
                errors.push('enterprise type "' + tt.id +
                    '" has baseWorkers > maxWorkers');
            }
        }

        return { valid: errors.length === 0, errors: errors };
    }

    // =========================================================================
    // 13. INTERNAL CANONICAL ACCESS (commands + bootstrap only)
    // =========================================================================

    function _getEnterpriseCanonical(enterpriseId) {
        _assertHydrated();
        if (!_hasId(enterpriseId)) return null;
        return _cache.byId.get(enterpriseId) || null;
    }

    function _getAllEnterprisesCanonical() {
        _assertHydrated();
        return _enterprises;
    }

    function _getEnterpriseTypeCanonical(typeId) {
        _assertHydrated();
        if (!_hasId(typeId)) return null;
        return _cache.typesById.get(typeId) || null;
    }

    function _getAllEnterpriseTypesCanonical() {
        _assertHydrated();
        return _enterpriseTypes;
    }

    // =========================================================================
    // 14. INTERNAL MUTATIONS — ENTERPRISES
    // =========================================================================
    //
    // These write directly into the in-memory catalogue, sync masterData,
    // and call markDataDirty. They do NOT call saveMasterData.
    //
    // Every mutation runs a full index rebuild. Enterprise counts are small
    // enough that an incremental index is unwarranted complexity.

    function _addEnterprise(record) {
        _assertHydrated();

        if (!_isPlainObject(record)) {
            throw new Error('industry-state.js: _addEnterprise expects a plain object.');
        }
        if (!_hasId(record.id)) {
            throw new Error('industry-state.js: _addEnterprise requires an id.');
        }
        if (_cache.byId.has(record.id)) {
            throw new Error('industry-state.js: enterprise id "' + record.id +
                '" already exists.');
        }

        var normalised = _normaliseEnterprise(record);
        _enterprises.push(normalised);
        _indexesRebuild();
        _syncToMasterData();
        _notify('enterpriseAdded', _cloneRecord(normalised));
        return normalised;
    }

    function _updateEnterprise(enterpriseId, patch) {
        _assertHydrated();

        if (!_hasId(enterpriseId)) {
            throw new Error('industry-state.js: _updateEnterprise requires an id.');
        }
        if (!_isPlainObject(patch)) {
            throw new Error(
                'industry-state.js: _updateEnterprise expects a plain object patch.'
            );
        }

        var record = _cache.byId.get(enterpriseId);
        if (!record) return null;

        var candidate = {};
        for (var key in record) {
            if (Object.prototype.hasOwnProperty.call(record, key)) {
                candidate[key] = record[key];
            }
        }
        for (var pKey in patch) {
            if (Object.prototype.hasOwnProperty.call(patch, pKey)) {
                candidate[pKey] = patch[pKey];
            }
        }

        var normalised = _normaliseEnterprise(candidate);

        var idx = _enterprises.indexOf(record);
        if (idx === -1) return null;
        _enterprises[idx] = normalised;

        _indexesRebuild();
        _syncToMasterData();
        _notify('enterpriseUpdated', _cloneRecord(normalised));
        return normalised;
    }

    function _removeEnterprise(enterpriseId) {
        _assertHydrated();

        if (!_hasId(enterpriseId)) {
            throw new Error('industry-state.js: _removeEnterprise requires an id.');
        }

        var record = _cache.byId.get(enterpriseId);
        if (!record) return false;

        var idx = _enterprises.indexOf(record);
        if (idx === -1) return false;
        _enterprises.splice(idx, 1);

        _indexesRebuild();
        _syncToMasterData();
        _notify('enterpriseDeleted', { enterpriseId: enterpriseId });
        return true;
    }

    // =========================================================================
    // 15. INTERNAL MUTATIONS — ENTERPRISE TYPES
    // =========================================================================

    function _addEnterpriseType(record) {
        _assertHydrated();

        if (!_isPlainObject(record)) {
            throw new Error(
                'industry-state.js: _addEnterpriseType expects a plain object.'
            );
        }
        if (!_hasId(record.id)) {
            throw new Error('industry-state.js: _addEnterpriseType requires an id.');
        }
        if (_cache.typesById.has(record.id)) {
            throw new Error('industry-state.js: enterprise type id "' + record.id +
                '" already exists.');
        }

        var normalised = _normaliseEnterpriseType(record);
        _enterpriseTypes.push(normalised);
        _indexesRebuild();
        _syncToMasterData();
        _notify('enterpriseTypeAdded', _cloneRecord(normalised));
        return normalised;
    }

    function _updateEnterpriseType(typeId, patch) {
        _assertHydrated();

        if (!_hasId(typeId)) {
            throw new Error('industry-state.js: _updateEnterpriseType requires an id.');
        }
        if (!_isPlainObject(patch)) {
            throw new Error(
                'industry-state.js: _updateEnterpriseType expects a plain object patch.'
            );
        }

        var record = _cache.typesById.get(typeId);
        if (!record) return null;

        var candidate = {};
        for (var key in record) {
            if (Object.prototype.hasOwnProperty.call(record, key)) {
                candidate[key] = record[key];
            }
        }
        for (var pKey in patch) {
            if (Object.prototype.hasOwnProperty.call(patch, pKey)) {
                candidate[pKey] = patch[pKey];
            }
        }

        var normalised = _normaliseEnterpriseType(candidate);

        var idx = _enterpriseTypes.indexOf(record);
        if (idx === -1) return null;
        _enterpriseTypes[idx] = normalised;

        _indexesRebuild();
        _syncToMasterData();
        _notify('enterpriseTypeUpdated', _cloneRecord(normalised));
        return normalised;
    }

    function _removeEnterpriseType(typeId) {
        _assertHydrated();

        if (!_hasId(typeId)) {
            throw new Error('industry-state.js: _removeEnterpriseType requires an id.');
        }

        var record = _cache.typesById.get(typeId);
        if (!record) return false;

        var idx = _enterpriseTypes.indexOf(record);
        if (idx === -1) return false;
        _enterpriseTypes.splice(idx, 1);

        _indexesRebuild();
        _syncToMasterData();
        _notify('enterpriseTypeDeleted', { typeId: typeId });
        return true;
    }

    // =========================================================================
    // 16. MASTER DATA RELOAD
    // =========================================================================

    window.addEventListener('masterDataUpdated', function () {
        if (!window.masterData || !window.masterData.data) return;
        var enterprises = Array.isArray(window.masterData.data.enterprises)
            ? window.masterData.data.enterprises
            : [];
        var types = Array.isArray(window.masterData.data.enterpriseTypes)
            ? window.masterData.data.enterpriseTypes
            : [];
        try {
            hydrateFromMasterData(enterprises, types);
            _notify('stateReloaded', {});
        } catch (err) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'industry-state.js: reload from masterDataUpdated failed:', err
                );
            }
        }
    });

    // =========================================================================
    // 17. EXPORTS
    // =========================================================================

    window.IndustryState = Object.freeze({
        // Lifecycle
        hydrateFromMasterData: hydrateFromMasterData,
        isHydrated: isHydrated,

        // Subscriptions
        subscribe: subscribe,

        // Enterprise reads (clones)
        getAllEnterprises: getAllEnterprises,
        getEnterprise: getEnterprise,
        getEnterprisesByOwner: getEnterprisesByOwner,
        getEnterprisesByLocation: getEnterprisesByLocation,
        getEnterprisesByType: getEnterprisesByType,
        getEnterprisesByStatus: getEnterprisesByStatus,
        getEnterprisesByOwnershipType: getEnterprisesByOwnershipType,
        getEnterpriseCount: getEnterpriseCount,

        // Enterprise type reads (clones)
        getAllEnterpriseTypes: getAllEnterpriseTypes,
        getEnterpriseType: getEnterpriseType,
        getEnterpriseTypesByCategory: getEnterpriseTypesByCategory,
        getEnterpriseTypeCount: getEnterpriseTypeCount,

        // Diagnostics
        validateIntegrity: validateIntegrity,

        // Internal — reserved for commands + bootstrap
        _getEnterpriseCanonical: _getEnterpriseCanonical,
        _getAllEnterprisesCanonical: _getAllEnterprisesCanonical,
        _getEnterpriseTypeCanonical: _getEnterpriseTypeCanonical,
        _getAllEnterpriseTypesCanonical: _getAllEnterpriseTypesCanonical,
        _addEnterprise: _addEnterprise,
        _updateEnterprise: _updateEnterprise,
        _removeEnterprise: _removeEnterprise,
        _addEnterpriseType: _addEnterpriseType,
        _updateEnterpriseType: _updateEnterpriseType,
        _removeEnterpriseType: _removeEnterpriseType,
        _indexesRebuild: _indexesRebuild
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.IndustryState;
    }
})();
