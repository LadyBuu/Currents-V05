/**
 * =============================================================================
 * STILL WATERS - EDUCATION STATE
 * =============================================================================
 *
 * Canonical institution records, indexes, subscription, UI state.
 * No policy, no persistence format, no cross-domain vocabulary, no tuition
 * math. Mutation primitives are internal; callers use EducationCommands.
 *
 * PERSISTENCE CONTRACT (READ THIS FIRST)
 *
 *   State owns the in-memory canonical record. State ALSO writes the
 *   canonical record into masterData.data.educationalInstitutions and
 *   marks the data dirty on every mutation. This matches the pattern
 *   established by character-state.js, family-state.js, children-state.js
 *   and role-state.js.
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
 *   store that reads like "no institutions exist". The previous revision
 *   returned null / [] from un-hydrated reads, which is exactly the
 *   class of silent failure role-state.js's header warns against.
 *
 *   isHydrated() is exported for bootstrap code that wants to check
 *   without triggering. It is NOT a substitute for the assert.
 *
 * CROSS-TAB RELOAD CONTRACT
 *
 *   storage.js dispatches `masterDataUpdated` when a cross-tab write
 *   replaces window.masterData. EducationState subscribes to that event
 *   and re-hydrates from masterData. Without this, an institution
 *   created in tab B is invisible in tab A until tab A refreshes.
 *
 *   The listener does NOT mark data dirty. The inbound data IS the
 *   canonical truth; marking dirty would schedule a redundant save.
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
 *   Container fields (students, graduates, teachers, curriculum, taughtRoles,
 *   history, headmasterHistory, tuitionHistory, governmentFundingHistory,
 *   profitHistory, demolishedRecord) are copied so that mutating a clone
 *   cannot affect canonical state. Scalar fields are copied by value.
 *
 *   This does not protect against a caller mutating a nested object inside a
 *   container (e.g. inst.students[0].notes = 'x'). Canonical records are
 *   shared by reference inside their container elements. Commands are the
 *   only legitimate mutators and they use _getInstitutionCanonical, so the
 *   nested case is a caller bug, not a boundary the state layer can defend.
 *
 * HYDRATION THROWS ON CORRUPTED INPUT
 *
 *   hydrateFromMasterData validates structural shape and throws on duplicate
 *   ids. It coerces container fields to the right type (array/object) or
 *   nulls them out. This is the boundary between untrusted saved data and
 *   the in-memory store; shape errors do not spread past it.
 *
 * DEPENDENCIES
 *
 *   - storage.js  (masterData, markDataDirty) — required
 *   - accessors.js (invalidateAccessorCaches) — optional
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

    // Notification queue. Prevents nested notification dispatch from
    // re-entering and dropping events.
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
    //
    // Every public read and every mutation primitive begins with
    // _assertHydrated. A forgotten hydrate call surfaces here, not as a
    // silent empty store.

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
    // invalidates the accessor cache, and marks the data dirty.
    //
    // This is the ONLY place education state touches masterData. Every
    // mutation primitive funnels through here.
    //
    // EducationCommands.persist() flushes the debounced save by calling
    // saveMasterData(); it does NOT re-copy state into masterData
    // because this function already did.

    function _syncToMasterData() {
        if (!window.masterData || !window.masterData.data) {
            throw new Error(
                'education-state.js: masterData is not available. ' +
                'Cannot sync education state.'
            );
        }

        window.masterData.data.educationalInstitutions = _institutions.slice();
        _invalidateAccessorCaches();
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
    // 13. MUTATION PRIMITIVES (no persistence)
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
        // Kept for demolishInstitution / rebuildInstitution callers that
        // mutate status and then want to force a reindex without going
        // through _updateInstitution again. This does NOT sync to
        // masterData; the caller is inside an _updateInstitution flow
        // which already did. This exists only to preserve the existing
        // call sites in education-commands.js.
        _assertHydrated();
        _indexesRebuild();
    }

    // =========================================================================
    // 14. HYDRATION AND MIGRATION
    // =========================================================================

    /**
     * Normalize a raw institution record into the canonical shape.
     * Defensive: fills missing fields with defaults and coerces container
     * fields to the right type. Does not infer policy (no
     * religionId → isReligiousSchool inference; no specializationCategory
     * → isSpecialized inference). Those are handled by Rules/Commands at
     * creation time.
     *
     * Returns null if raw is not an object or has no id.
     */
    function migrateInstitution(raw) {
        if (!raw || typeof raw !== 'object') return null;
        if (!raw.id) return null;

        var inst = Object.assign({}, raw);

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
        if (inst.isReligiousSchool === undefined) inst.isReligiousSchool = false;
        if (inst.isSpecialized === undefined) inst.isSpecialized = false;
        if (inst.specializationCategory === undefined) {
            inst.specializationCategory = null;
        }
        if (inst.religionId === undefined) inst.religionId = null;
        if (inst.religionName === undefined) inst.religionName = null;

        return inst;
    }

    /**
     * Replace the entire canonical state with hydrated institutions.
     *
     * Throws if:
     *   - rawInstitutions is not an array
     *   - two records share an id
     *
     * Caller is responsible for having run migrateInstitution on each record
     * (or relying on this function to call it) and for having arranged
     * persistence.
     *
     * After hydrate, _hydrated is true and every read / mutation primitive
     * works. syncToMasterData is called once so masterData reflects the
     * hydrated set, and markDataDirty schedules a save (which is correct:
     * the freshly hydrated state IS the canonical set and should be
     * persisted if it was loaded from defaults).
     */
    function hydrateFromMasterData(rawInstitutions) {
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
        _syncToMasterData();
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
    // We re-hydrate from masterData. This is NOT a local mutation, so we
    // do NOT call _syncToMasterData (which would mark dirty); the inbound
    // data IS the canonical truth.
    //
    // If masterData is missing at reload time, we keep the pre-reload
    // state and log. Wiping the store on a missing masterData would be
    // worse than keeping stale data.
    //
    // The notify is dispatched with a 'reloaded' type so subscribers can
    // distinguish an inbound refresh from a local mutation.

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

        var next = [];
        var seenIds = {};

        for (var i = 0; i < raw.length; i++) {
            var migrated = migrateInstitution(raw[i]);
            if (!migrated) continue;

            if (seenIds[migrated.id] === true) {
                if (window.console && typeof window.console.error === 'function') {
                    window.console.error(
                        'education-state.js: duplicate institution id "' +
                        migrated.id + '" on reload; dropping the later copy.'
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
        _notify('reloaded', { count: _institutions.length });
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
    //
    // Nothing is initialised. Bootstrap must call hydrateFromMasterData.
    // _assertHydrated fires on every read and every mutation primitive
    // until that happens.

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
        // NOT sync to masterData (callers are always inside an
        // _updateInstitution flow which already synced).
        _indexesRebuild: _indexesRebuildExport
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.EducationState;
    }
})();
