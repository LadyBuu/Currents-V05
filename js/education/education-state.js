/**
 * STILL WATERS - EDUCATION STATE
 * Canonical institution records, indexes, subscription, UI state.
 * No policy, no persistence, no cross-domain vocabulary, no tuition math.
 * Mutation primitives are internal; callers use EducationCommands.
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
 */

(function() {
    'use strict';

    // --- Private state ---

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

    // --- Known UI keys ---

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

    // --- Container fields that get a shallow per-element copy on read ---

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

    // --- Deep-enough clone of a canonical institution for public reads ---

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

    // --- Index rebuilding ---

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

    // --- Notifications ---

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
                        // Surface subscriber failures. Do not silently swallow.
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

    // --- Public: subscription ---

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

    // --- Public: canonical reads (deep-enough clones for external callers) ---

    function getAllInstitutions() {
        var out = [];
        for (var i = 0; i < _institutions.length; i++) {
            out.push(_cloneInstitution(_institutions[i]));
        }
        return out;
    }

    function getInstitution(id) {
        if (!id) return null;
        var inst = _indexes.byId.get(id);
        return inst ? _cloneInstitution(inst) : null;
    }

    function getInstitutionsByLocation(locationId) {
        if (!locationId) return [];
        var arr = _indexes.byLocation.get(locationId) || [];
        return arr.map(_cloneInstitution);
    }

    function getInstitutionsByType(typeId) {
        if (!typeId) return [];
        var arr = _indexes.byType.get(typeId) || [];
        return arr.map(_cloneInstitution);
    }

    function getInstitutionsByOwnershipType(ownershipType) {
        if (!ownershipType) return [];
        var arr = _indexes.byOwnershipType.get(ownershipType) || [];
        return arr.map(_cloneInstitution);
    }

    function getInstitutionsByReligion(religionId) {
        if (!religionId) return [];
        var arr = _indexes.byReligion.get(religionId) || [];
        return arr.map(_cloneInstitution);
    }

    // --- Internal: canonical access for Commands only ---
    // Documented as internal. Not for Query or UI use.

    function _getInstitutionCanonical(id) {
        if (!id) return null;
        return _indexes.byId.get(id) || null;
    }

    function _getAllInstitutionsCanonical() {
        return _institutions;
    }

    // --- Internal: mutation primitives (no persistence) ---

    function _addInstitution(institution) {
        if (!institution || !institution.id) {
            throw new Error('_addInstitution: institution with id is required');
        }
        if (_indexes.byId.has(institution.id)) {
            throw new Error('_addInstitution: id already exists: ' + institution.id);
        }
        _institutions.push(institution);
        _indexesRebuild();
        _lastUpdated = Date.now();
        _notify('institutionAdded', _cloneInstitution(institution));
        return institution;
    }

    function _updateInstitution(id, updates) {
        var inst = _indexes.byId.get(id);
        if (!inst) return null;

        for (var k in updates) {
            if (Object.prototype.hasOwnProperty.call(updates, k)) {
                inst[k] = updates[k];
            }
        }

        _indexesRebuild();
        _lastUpdated = Date.now();
        _notify('institutionUpdated', { id: id, updates: updates });
        return inst;
    }

    function _removeInstitution(id) {
        var idx = -1;
        for (var i = 0; i < _institutions.length; i++) {
            if (_institutions[i].id === id) { idx = i; break; }
        }
        if (idx === -1) return false;

        var removed = _institutions[idx];
        _institutions.splice(idx, 1);
        _indexesRebuild();
        _lastUpdated = Date.now();
        _notify('institutionRemoved', _cloneInstitution(removed));
        return true;
    }

    // --- Hydration and migration ---

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

        // Arrays: coerce to [] if not already an array.
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

        // Objects: null out if not a plain object.
        if (inst.headmaster !== null &&
            (typeof inst.headmaster !== 'object' || Array.isArray(inst.headmaster))) {
            inst.headmaster = null;
        }
        if (inst.demolishedRecord !== null &&
            (typeof inst.demolishedRecord !== 'object' ||
             Array.isArray(inst.demolishedRecord))) {
            inst.demolishedRecord = null;
        }

        // Scalar defaults.
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
        _notify('hydrated', { count: _institutions.length });
    }

    function isHydrated() {
        return _hydrated;
    }

    // --- UI state ---

    function getUIState() {
        // Snapshot: clone + freeze the returned object. Callers cannot mutate
        // UI state through the return value.
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

    // --- Module load: nothing is initialized. Bootstrap must call hydrate. ---

    _indexesRebuild();

    // --- Exports ---

    window.EducationState = {
        // Subscription
        subscribe: subscribe,

        // Public canonical reads (deep-enough clones)
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

        // Internal: mutation primitives (no persistence)
        _addInstitution: _addInstitution,
        _updateInstitution: _updateInstitution,
        _removeInstitution: _removeInstitution,
        _indexesRebuild: _indexesRebuild
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.EducationState;
    }
})();