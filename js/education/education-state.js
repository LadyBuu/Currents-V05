/**
 * =============================================================================
 * STILL WATERS - EDUCATION STATE
 * =============================================================================
 *
 * LOCATION: js/systems/education/education-state.js
 *
 * Canonical institution records, indexes, subscription, UI state.
 * No policy, no persistence format, no cross-domain vocabulary, no tuition
 * math. Mutation primitives are internal; callers use EducationCommands.
 *
 * PERSISTENCE CONTRACT
 *
 *   State owns the in-memory canonical record. State ALSO writes the
 *   canonical record into masterData.data.educationalInstitutions and
 *   marks the data dirty on every LOCAL mutation. This matches the
 *   pattern established by character-state.js, family-state.js,
 *   children-state.js and role-state.js.
 *
 *   EducationCommands.persist() is the flush boundary. It calls
 *   saveMasterData(), which writes masterData to localStorage. It does
 *   NOT copy state into masterData; state already did that.
 *
 *   Why this ordering matters: if state did not write to masterData,
 *   then persist() would serialize masterData WITHOUT the education
 *   institutions, silently losing every education write on reload. The
 *   prior revision had exactly that bug.
 *
 * HYDRATION CONTRACT
 *
 *   Bootstrap calls EducationState.hydrateFromMasterData([...]) once
 *   after masterData loads. There is no implicit hydration on module
 *   load.
 *
 *   After hydrate, every public read and every internal mutation
 *   primitive throws if !isHydrated(). This is deliberate: a forgotten
 *   hydrate call must surface as an explicit error, not as an empty
 *   store that reads like "no institutions exist".
 *
 *   hydrateFromMasterData has two modes:
 *
 *     options.syncToMasterData === true (default):
 *       Writes masterData.data.educationalInstitutions and calls
 *       markDataDirty(). Use this when the hydrated set IS the
 *       canonical set and should be persisted (typically the first
 *       boot, or an explicit reset).
 *
 *     options.syncToMasterData === false:
 *       Writes masterData.data.educationalInstitutions but does NOT
 *       call markDataDirty(). Use this when the hydrated set came
 *       from existing storage and no local change occurred. The
 *       cross-tab reload path uses this mode.
 *
 *   In both modes, the accessor cache is invalidated because the
 *   in-memory records changed. Cache state is not persisted, so
 *   invalidation is not a "local mutation".
 *
 *   Prior revisions always called markDataDirty, so every boot (and
 *   every cross-tab reload) scheduled a save. That was harmless but
 *   noisy, and it put _isDirty into a state the caller did not cause.
 *   See CROSS-TAB RELOAD CONTRACT.
 *
 * CROSS-TAB RELOAD CONTRACT
 *
 *   storage.js dispatches `masterDataUpdated` when a cross-tab write
 *   replaces window.masterData. EducationState subscribes to that
 *   event and re-hydrates from masterData. Without this, an institution
 *   created in tab B is invisible in tab A until tab A refreshes.
 *
 *   The reload path does NOT mark data dirty. The inbound data IS the
 *   canonical truth; scheduling a save would be a redundant write.
 *
 *   DUPLICATE IDS ON RELOAD: the reload path drops the later copy of
 *   a duplicate id and logs it, rather than throwing. A cross-tab
 *   reload is inbound data; a corrupt write in another tab must not
 *   break the current tab. The first-boot hydrate path (via
 *   hydrateFromMasterData) is strict — a first boot with duplicate ids
 *   is a load-order or corruption bug.
 *
 * ACCESSOR CACHE CONTRACT
 *
 *   Every mutation calls window.invalidateAccessorCaches() if present,
 *   alongside markDataDirty(). The accessor cache does not read
 *   education institutions today, but it will the moment someone adds
 *   getInstitutionById to accessors.js. Doing the invalidate now keeps
 *   this file aligned with the family / children / character / role
 *   modules and closes that latent divergence.
 *
 * PUBLIC READS RETURN DEEP-ENOUGH CLONES
 *
 *   Container fields (students, graduates, teachers, curriculum,
 *   taughtRoles, history, headmasterHistory, tuitionHistory,
 *   governmentFundingHistory, profitHistory, demolishedRecord) are
 *   copied so that mutating a clone cannot affect canonical state.
 *   Scalar fields are copied by value.
 *
 *   This does not protect against a caller mutating a nested object
 *   inside a container (e.g. inst.students[0].notes = 'x'). Canonical
 *   records are shared by reference inside their container elements.
 *   Commands are the only legitimate mutators and they use
 *   _getInstitutionCanonical, so the nested case is a caller bug, not
 *   a boundary the state layer can defend.
 *
 * HYDRATION THROWS ON CORRUPTED INPUT
 *
 *   hydrateFromMasterData validates structural shape and throws on
 *   duplicate ids. It coerces container fields to the right type
 *   (array/object) or nulls them out. This is the boundary between
 *   untrusted saved data and the in-memory store; shape errors do not
 *   spread past it.
 *
 * MIGRATION
 *
 *   migrateInstitution normalizes raw records into the canonical
 *   shape. It fills missing fields with defaults and coerces container
 *   fields to the right type. It does NOT infer policy from other
 *   fields in the general case — with two exceptions:
 *
 *     isSpecialized  If the field is undefined (a save predating it),
 *                    derive it from `!!(specializationCategory &&
 *                    taughtRoles.length > 0)`. This matches what
 *                    createInstitution produces, so an old save
 *                    reaches the same state a new save would.
 *
 *     isReligiousSchool
 *                    If the field is undefined AND
 *                    `ownershipType === 'religious'`, set it to
 *                    `true`. A save predating the field that was
 *                    created as a religious school clearly is one.
 *                    The two fields remain independent in the steady
 *                    state (createInstitution sets both; commands can
 *                    set either without touching the other).
 *
 *   In both cases, inference ONLY runs when the field is undefined.
 *   A stored `false` is preserved as `false`, even if the derivation
 *   would have said `true`. The migration trusts the stored value
 *   when it exists.
 *
 * DEPENDENCIES
 *
 *   - storage.js  (masterData, markDataDirty) — required
 *   - accessors.js (invalidateAccessorCaches) — optional
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - migrateInstitution now derives isSpecialized (when undefined)
 *       from specializationCategory + taughtRoles.length, and derives
 *       isReligiousSchool (when undefined) from ownershipType ===
 *       'religious'. Prior revisions set both to their falsy defaults
 *       unconditionally, which lost the derivation for old saves that
 *       predated the fields. See MIGRATION.
 *     - hydrateFromMasterData now accepts
 *       { syncToMasterData: boolean } (default true). When false, the
 *       function still writes masterData.data.educationalInstitutions
 *       (the caller asked for the hydrated set to become canonical)
 *       but does NOT call markDataDirty. This closes the "cross-tab
 *       reload marks dirty" bug without breaking the first-boot path.
 *       See HYDRATION CONTRACT.
 *     - _handleMasterDataUpdated now uses a separate internal
 *       hydration path that:
 *         - drops duplicate ids with a console.error
 *         - does not call markDataDirty
 *         - still invalidates the accessor cache
 *       Prior revisions went through hydrateFromMasterData (via the
 *       generic load path), which threw on duplicates and always
 *       marked dirty. See CROSS-TAB RELOAD CONTRACT (DUPLICATE IDS ON
 *       RELOAD).
 *     - No other behavioural change. Clone semantics, mutation
 *       primitives, and UI state are unchanged.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _markDirty() {
        if (typeof window.markDataDirty !== 'function') {
            throw new Error(
                'education-state.js: markDataDirty is not available. ' +
                'storage.js must load before education mutations occur.'
            );
        }
        window.markDataDirty();
    }

    function _invalidateAccessorCaches() {
        if (typeof window.invalidateAccessorCaches === 'function') {
            window.invalidateAccessorCaches();
        }
    }

    // =========================================================================
    // 2. PRIVATE STATE
    // =========================================================================

    var _institutions = [];
    var _indexes = {
        byId: new Map(),
        byLocation: new Map(),
        byType: new Map(),
        byOwnershipType: new Map(),
        byReligion: new Map()
    };

    var _uiState = {
        selectedInstitutionId: null,
        filters: {
            type: null,
            location: null,
            minReputation: null,
            ownershipType: null,
            roleCategory: null,
            taughtRole: null,
            religionId: null
        },
        viewMode: 'list'
    };

    var _subscribers = [];
    var _hydrated = false;
    var _lastUpdated = null;

    var _notifyQueue = [];
    var _notifying = false;

    // =========================================================================
    // 3. KNOWN KEYS
    // =========================================================================

    var _UI_TOP_LEVEL_KEYS = {
        selectedInstitutionId: true,
        viewMode: true,
        filters: true
    };

    var _UI_FILTER_KEYS = {
        type: true,
        location: true,
        minReputation: true,
        ownershipType: true,
        roleCategory: true,
        taughtRole: true,
        religionId: true
    };

    // =========================================================================
    // 4. HYDRATION ASSERT
    // =========================================================================

    function _assertHydrated() {
        if (!_hydrated) {
            throw new Error(
                'education-state.js: EducationState.hydrateFromMasterData() ' +
                'must be called before any read or mutation. ' +
                'Bootstrap should call it once after masterData loads.'
            );
        }
    }

    // =========================================================================
    // 5. CONTAINER FIELDS
    // =========================================================================

    var _CONTAINER_ARRAY_FIELDS = [
        'students',
        'graduates',
        'teachers',
        'curriculum',
        'taughtRoles',
        'history',
        'headmasterHistory',
        'tuitionHistory',
        'governmentFundingHistory',
        'profitHistory'
    ];

    var _CONTAINER_OBJECT_FIELDS = [
        'headmaster',
        'demolishedRecord'
    ];

    // =========================================================================
    // 6. CLONE HELPER
    // =========================================================================

    function _cloneInstitution(inst) {
        if (!inst) return null;

        var clone = {};
        for (var k in inst) {
            if (!Object.prototype.hasOwnProperty.call(inst, k)) continue;
            clone[k] = inst[k];
        }

        for (var a = 0; a < _CONTAINER_ARRAY_FIELDS.length; a++) {
            var arrField = _CONTAINER_ARRAY_FIELDS[a];
            var arr = inst[arrField];
            if (Array.isArray(arr)) {
                clone[arrField] = arr.slice();
            }
        }

        for (var o = 0; o < _CONTAINER_OBJECT_FIELDS.length; o++) {
            var objField = _CONTAINER_OBJECT_FIELDS[o];
            var obj = inst[objField];
            if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
                var objCopy = {};
                for (var ok in obj) {
                    if (!Object.prototype.hasOwnProperty.call(obj, ok)) continue;
                    objCopy[ok] = obj[ok];
                }
                clone[objField] = objCopy;
            }
        }

        return clone;
    }

    // =========================================================================
    // 7. INDEX MANAGEMENT
    // =========================================================================

    function _indexesClear() {
        _indexes.byId.clear();
        _indexes.byLocation.clear();
        _indexes.byType.clear();
        _indexes.byOwnershipType.clear();
        _indexes.byReligion.clear();
    }

    function _indexesRebuild() {
        _indexesClear();

        for (var i = 0; i < _institutions.length; i++) {
            var inst = _institutions[i];
            if (!inst || !inst.id) continue;

            _indexes.byId.set(inst.id, inst);

            if (inst.locationId) {
                if (!_indexes.byLocation.has(inst.locationId)) {
                    _indexes.byLocation.set(inst.locationId, []);
                }
                _indexes.byLocation.get(inst.locationId).push(inst);
            }

            if (inst.type) {
                if (!_indexes.byType.has(inst.type)) {
                    _indexes.byType.set(inst.type, []);
                }
                _indexes.byType.get(inst.type).push(inst);
            }

            var ownership = inst.ownershipType || 'public';
            if (!_indexes.byOwnershipType.has(ownership)) {
                _indexes.byOwnershipType.set(ownership, []);
            }
            _indexes.byOwnershipType.get(ownership).push(inst);

            if (inst.religionId) {
                if (!_indexes.byReligion.has(inst.religionId)) {
                    _indexes.byReligion.set(inst.religionId, []);
                }
                _indexes.byReligion.get(inst.religionId).push(inst);
            }
        }
    }

    // =========================================================================
    // 8. NOTIFICATIONS
    // =========================================================================

    function _notify(eventType, data) {
        _notifyQueue.push({ type: eventType, data: data, timestamp: Date.now() });

        if (_notifying) return;
        _notifying = true;

        try {
            while (_notifyQueue.length > 0) {
                var evt = _notifyQueue.shift();
                var subscribers = _subscribers.slice();
                for (var i = 0; i < subscribers.length; i++) {
                    try {
                        subscribers[i](evt);
                    } catch (err) {
                        if (typeof window.onError === 'function') {
                            try { window.onError(err); } catch (ignored) {}
                        }
                        if (typeof console !== 'undefined' && console.error) {
                            console.error('EducationState subscriber error:', err);
                        }
                    }
                }
            }
        } finally {
            _notifying = false;
        }
    }

    // =========================================================================
    // 9. PERSISTENCE SYNC
    // =========================================================================
    //
    // Writes _institutions into masterData.data.educationalInstitutions,
    // invalidates the accessor cache, and (conditionally) marks the data
    // dirty.
    //
    // The "conditionally" is the syncToMasterData option from
    // hydrateFromMasterData. Local mutations (add/update/remove) always
    // mark dirty. Hydration from existing storage does not. See
    // HYDRATION CONTRACT.

    function _writeToMasterData() {
        if (!window.masterData || !window.masterData.data) {
            throw new Error(
                'education-state.js: masterData is not available. ' +
                'Cannot sync education state.'
            );
        }
        window.masterData.data.educationalInstitutions = _institutions.slice();
        _invalidateAccessorCaches();
    }

    function _syncToMasterData() {
        _writeToMasterData();
        _markDirty();
    }

    // =========================================================================
    // 10. SUBSCRIPTION
    // =========================================================================

    function subscribe(callback) {
        if (typeof callback !== 'function') {
            throw new Error('EducationState.subscribe requires a function');
        }
        _subscribers.push(callback);
        return function unsubscribe() {
            var idx = _subscribers.indexOf(callback);
            if (idx !== -1) _subscribers.splice(idx, 1);
        };
    }

    // =========================================================================
    // 11. PUBLIC READS (deep-enough clones)
    // =========================================================================

    function getAllInstitutions() {
        _assertHydrated();
        var out = [];
        for (var i = 0; i < _institutions.length; i++) {
            out.push(_cloneInstitution(_institutions[i]));
        }
        return out;
    }

    function getInstitution(id) {
        _assertHydrated();
        if (!id) return null;
        var inst = _indexes.byId.get(id);
        return inst ? _cloneInstitution(inst) : null;
    }

    function getInstitutionsByLocation(locationId) {
        _assertHydrated();
        if (!locationId) return [];
        var arr = _indexes.byLocation.get(locationId) || [];
        return arr.map(_cloneInstitution);
    }

    function getInstitutionsByType(typeId) {
        _assertHydrated();
        if (!typeId) return [];
        var arr = _indexes.byType.get(typeId) || [];
        return arr.map(_cloneInstitution);
    }

    function getInstitutionsByOwnershipType(ownershipType) {
        _assertHydrated();
        if (!ownershipType) return [];
        var arr = _indexes.byOwnershipType.get(ownershipType) || [];
        return arr.map(_cloneInstitution);
    }

    function getInstitutionsByReligion(religionId) {
        _assertHydrated();
        if (!religionId) return [];
        var arr = _indexes.byReligion.get(religionId) || [];
        return arr.map(_cloneInstitution);
    }

    // =========================================================================
    // 12. INTERNAL CANONICAL ACCESS (Commands only)
    // =========================================================================

    function _getInstitutionCanonical(id) {
        _assertHydrated();
        if (!id) return null;
        return _indexes.byId.get(id) || null;
    }

    function _getAllInstitutionsCanonical() {
        _assertHydrated();
        return _institutions;
    }

    // =========================================================================
    // 13. MUTATION PRIMITIVES
    // =========================================================================
    //
    // Each primitive:
    //   1. asserts hydrated
    //   2. mutates _institutions
    //   3. rebuilds indexes
    //   4. syncs to masterData (write + invalidate + dirty)
    //   5. notifies subscribers
    //
    // No primitive flushes. EducationCommands.persist() is the flush.

    function _addInstitution(institution) {
        _assertHydrated();

        if (!institution || !institution.id) {
            throw new Error('_addInstitution: institution with id is required');
        }
        if (_indexes.byId.has(institution.id)) {
            throw new Error('_addInstitution: id already exists: ' + institution.id);
        }
        _institutions.push(institution);
        _indexesRebuild();
        _syncToMasterData();
        _lastUpdated = Date.now();
        _notify('institutionAdded', _cloneInstitution(institution));
        return institution;
    }

    function _updateInstitution(id, updates) {
        _assertHydrated();

        var inst = _indexes.byId.get(id);
        if (!inst) return null;

        for (var k in updates) {
            if (Object.prototype.hasOwnProperty.call(updates, k)) {
                inst[k] = updates[k];
            }
        }

        _indexesRebuild();
        _syncToMasterData();
        _lastUpdated = Date.now();
        _notify('institutionUpdated', { id: id, updates: updates });
        return inst;
    }

    function _removeInstitution(id) {
        _assertHydrated();

        var idx = -1;
        for (var i = 0; i < _institutions.length; i++) {
            if (_institutions[i].id === id) { idx = i; break; }
        }
        if (idx === -1) return false;

        var removed = _institutions[idx];
        _institutions.splice(idx, 1);
        _indexesRebuild();
        _syncToMasterData();
        _lastUpdated = Date.now();
        _notify('institutionRemoved', _cloneInstitution(removed));
        return true;
    }

    function _indexesRebuildExport() {
        _assertHydrated();
        _indexesRebuild();
    }

    // =========================================================================
    // 14. HYDRATION AND MIGRATION
    // =========================================================================

    /**
     * Normalize a raw institution record into the canonical shape.
     * Defensive: fills missing fields with defaults and coerces container
     * fields to the right type.
     *
     * Infers isSpecialized (when undefined) from specializationCategory +
     * taughtRoles.length, and infers isReligiousSchool (when undefined)
     * from ownershipType === 'religious'. See MIGRATION in the header.
     *
     * Returns null if raw is not an object or has no id.
     */
    function migrateInstitution(raw) {
        if (!raw || typeof raw !== 'object') return null;
        if (!raw.id) return null;

        var inst = Object.assign({}, raw);

        // Container normalization FIRST so the derivation below reads
        // normalized arrays.
        if (!Array.isArray(inst.students)) inst.students = [];
        if (!Array.isArray(inst.graduates)) inst.graduates = [];
        if (!Array.isArray(inst.teachers)) inst.teachers = [];
        if (!Array.isArray(inst.curriculum)) inst.curriculum = [];
        if (!Array.isArray(inst.taughtRoles)) inst.taughtRoles = [];
        if (!Array.isArray(inst.history)) inst.history = [];
        if (!Array.isArray(inst.headmasterHistory)) inst.headmasterHistory = [];
        if (!Array.isArray(inst.tuitionHistory)) inst.tuitionHistory = [];
        if (!Array.isArray(inst.governmentFundingHistory)) {
            inst.governmentFundingHistory = [];
        }
        if (!Array.isArray(inst.profitHistory)) inst.profitHistory = [];

        if (inst.headmaster !== null &&
            (typeof inst.headmaster !== 'object' || Array.isArray(inst.headmaster))) {
            inst.headmaster = null;
        }
        if (inst.demolishedRecord !== null &&
            (typeof inst.demolishedRecord !== 'object' ||
             Array.isArray(inst.demolishedRecord))) {
            inst.demolishedRecord = null;
        }

        if (inst.status === undefined) inst.status = 'active';
        if (inst.ownershipType === undefined) inst.ownershipType = 'public';

        // Derive isReligiousSchool when undefined. A save predating the
        // field that was created as religious should reach the same
        // state a new save would. See MIGRATION.
        if (inst.isReligiousSchool === undefined) {
            inst.isReligiousSchool = (inst.ownershipType === 'religious');
        }

        if (inst.specializationCategory === undefined) {
            inst.specializationCategory = null;
        }

        // Derive isSpecialized when undefined. Same rationale. See
        // MIGRATION.
        if (inst.isSpecialized === undefined) {
            inst.isSpecialized = !!(
                inst.specializationCategory &&
                inst.taughtRoles.length > 0
            );
        }

        if (inst.religionId === undefined) inst.religionId = null;
        if (inst.religionName === undefined) inst.religionName = null;

        return inst;
    }

    /**
     * Replace the entire canonical state with hydrated institutions.
     *
     * Options:
     *   syncToMasterData  (default true)
     *     When true, writes masterData.data.educationalInstitutions and
     *     calls markDataDirty. Use this when the hydrated set IS the
     *     canonical set and should be persisted (first boot, reset).
     *
     *     When false, writes masterData.data.educationalInstitutions
     *     but does NOT call markDataDirty. Use this when the hydrated
     *     set came from existing storage and no local change occurred
     *     (cross-tab reload).
     *
     *     In both modes, the accessor cache is invalidated because the
     *     in-memory records changed.
     *
     * See HYDRATION CONTRACT in the header.
     *
     * Throws if rawInstitutions is not an array, or if two records share
     * an id. The cross-tab reload path uses an internal variant that
     * drops duplicates instead of throwing (see
     * _rehydrateFromMasterData).
     */
    function hydrateFromMasterData(rawInstitutions, options) {
        options = options || {};
        var syncToMasterData = options.syncToMasterData !== false;

        if (!Array.isArray(rawInstitutions)) {
            throw new Error('hydrateFromMasterData requires an array');
        }

        var next = [];
        var seenIds = {};

        for (var i = 0; i < rawInstitutions.length; i++) {
            var migrated = migrateInstitution(rawInstitutions[i]);
            if (!migrated) continue;

            if (seenIds[migrated.id] === true) {
                throw new Error(
                    'hydrateFromMasterData: duplicate institution id "' +
                    migrated.id + '"'
                );
            }
            seenIds[migrated.id] = true;
            next.push(migrated);
        }

        _institutions = next;
        _indexesRebuild();
        _hydrated = true;
        _lastUpdated = Date.now();

        if (syncToMasterData) {
            _syncToMasterData();
        } else {
            _writeToMasterData();
        }

        _notify('hydrated', { count: _institutions.length });
    }

    function isHydrated() {
        return _hydrated;
    }

    // =========================================================================
    // 15. CROSS-TAB RELOAD
    // =========================================================================
    //
    // storage.js dispatches masterDataUpdated when another tab writes.
    // We re-hydrate from masterData.
    //
    // Reload path:
    //   - drops duplicate ids and logs
    //   - writes masterData.data.educationalInstitutions (the inbound data
    //     is already canonical, so the write is a no-op for content but
    //     ensures the in-memory array matches the masterData reference)
    //   - does NOT call markDataDirty (nothing changed locally)
    //   - invalidates the accessor cache
    //
    // If masterData is missing at reload time, we keep the pre-reload
    // state and log. Wiping the store on a missing masterData would be
    // worse than keeping stale data.

    function _rehydrateFromMasterData(rawInstitutions) {
        var next = [];
        var seenIds = {};

        for (var i = 0; i < rawInstitutions.length; i++) {
            var migrated = migrateInstitution(rawInstitutions[i]);
            if (!migrated) continue;

            if (seenIds[migrated.id] === true) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error(
                        'education-state.js: duplicate institution id "' +
                        migrated.id + '" on cross-tab reload; dropping the ' +
                        'later copy.'
                    );
                }
                continue;
            }
            seenIds[migrated.id] = true;
            next.push(migrated);
        }

        _institutions = next;
        _indexesRebuild();
        _hydrated = true;
        _lastUpdated = Date.now();
        // Cross-tab reload does not mark dirty. See CROSS-TAB RELOAD
        // CONTRACT.
        _writeToMasterData();
        _notify('reloaded', { count: _institutions.length, source: 'cross-tab' });
    }

    function _handleMasterDataUpdated() {
        if (!window.masterData || !window.masterData.data) {
            if (window.console && typeof window.console.warn === 'function') {
                window.console.warn(
                    'education-state.js: masterDataUpdated fired without ' +
                    'masterData. Skipping education state reload.'
                );
            }
            return;
        }

        var raw = window.masterData.data.educationalInstitutions;
        if (!Array.isArray(raw)) {
            // Absence is legitimate: pre-education save, or a fresh install.
            raw = [];
        }

        try {
            _rehydrateFromMasterData(raw);
        } catch (err) {
            if (window.console && typeof window.console.error === 'function') {
                window.console.error(
                    'education-state.js: reload after masterDataUpdated failed:',
                    err
                );
            }
        }
    }

    window.addEventListener('masterDataUpdated', _handleMasterDataUpdated);

    // =========================================================================
    // 16. UI STATE
    // =========================================================================

    function getUIState() {
        _assertHydrated();
        var filtersSnapshot = {};
        for (var fk in _uiState.filters) {
            if (Object.prototype.hasOwnProperty.call(_uiState.filters, fk)) {
                filtersSnapshot[fk] = _uiState.filters[fk];
            }
        }

        return Object.freeze({
            selectedInstitutionId: _uiState.selectedInstitutionId,
            filters: Object.freeze(filtersSnapshot),
            viewMode: _uiState.viewMode
        });
    }

    function updateUIState(updates) {
        _assertHydrated();
        if (!updates || typeof updates !== 'object') return;

        for (var k in updates) {
            if (!Object.prototype.hasOwnProperty.call(updates, k)) continue;

            if (!_UI_TOP_LEVEL_KEYS[k]) {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn(
                        'EducationState.updateUIState: unknown key "' + k +
                        '" ignored'
                    );
                }
                continue;
            }

            if (k === 'filters') {
                var f = updates.filters;
                if (!f || typeof f !== 'object') continue;

                for (var fk in f) {
                    if (!Object.prototype.hasOwnProperty.call(f, fk)) continue;
                    if (!_UI_FILTER_KEYS[fk]) {
                        if (typeof console !== 'undefined' && console.warn) {
                            console.warn(
                                'EducationState.updateUIState: unknown filter "' +
                                fk + '" ignored'
                            );
                        }
                        continue;
                    }
                    _uiState.filters[fk] = f[fk];
                }
            } else {
                _uiState[k] = updates[k];
            }
        }

        _notify('uiStateChanged', getUIState());
    }

    // =========================================================================
    // 17. MODULE LOAD
    // =========================================================================

    _indexesRebuild();

    // =========================================================================
    // 18. EXPORTS
    // =========================================================================

    window.EducationState = {
        // Subscription
        subscribe: subscribe,

        // Public canonical reads (deep-enough clones; throw if !hydrated)
        getAllInstitutions: getAllInstitutions,
        getInstitution: getInstitution,
        getInstitutionsByLocation: getInstitutionsByLocation,
        getInstitutionsByType: getInstitutionsByType,
        getInstitutionsByOwnershipType: getInstitutionsByOwnershipType,
        getInstitutionsByReligion: getInstitutionsByReligion,

        // UI state
        getUIState: getUIState,
        updateUIState: updateUIState,

        // Hydration and migration
        hydrateFromMasterData: hydrateFromMasterData,
        migrateInstitution: migrateInstitution,
        isHydrated: isHydrated,

        // Internal: canonical access for Commands
        _getInstitutionCanonical: _getInstitutionCanonical,
        _getAllInstitutionsCanonical: _getAllInstitutionsCanonical,

        // Internal: mutation primitives (no flush; syncs to masterData)
        _addInstitution: _addInstitution,
        _updateInstitution: _updateInstitution,
        _removeInstitution: _removeInstitution,

        // Kept for education-commands.js callers. Forces a reindex. Does
        // NOT sync to masterData.
        _indexesRebuild: _indexesRebuildExport
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.EducationState;
    }
})();
