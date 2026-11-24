/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD STATE (js/households/household-state.js)
 * =============================================================================
 *
 * LOCATION: js/households/household-state.js
 *
 * PURPOSE
 * -------
 * Canonical runtime storage for household data. This module owns:
 *
 *   - The in-memory household / position / assignment arrays
 *   - Indexes (byId, byLocation, byStatus, byMember)
 *   - Cache rebuild
 *   - Hydration from masterData (schema-shape only)
 *   - Ephemeral UI state (selection, filters, view mode)
 *   - Subscription broadcast (in-process)
 *   - Dirty flag (does NOT save; see HouseholdCommands.persist)
 *
 * EXPLICITLY NOT OWNED BY THIS MODULE
 * -----------------------------------
 *   - Semantic reads           → HouseholdQueries
 *   - Domain mutations         → HouseholdCommands
 *   - Domain policy/rules      → household-rules.js
 *   - Persistence              → HouseholdCommands.persist()
 *   - Presentation/toasts      → UI layer
 *   - Enterprise ownership     → IndustryCommands (canonical)
 *   - Residence association    → ResidenceSystem + HouseholdCommands
 *
 * CONVERGED PATTERN NOTES
 * -----------------------
 *   - State does NOT call saveMasterData(). Ever.
 *   - _replace* primitives call markDirty() and publish() but not save.
 *   - Commands call _commit() → hydrateFromMasterData → markDirty →
 *     publish → dispatch. persist() is the only save call site.
 *   - hydrateFromMasterData() is idempotent and safe to call after every
 *     mutation. It re-reads masterData, ensures structural shape, rebuilds
 *     indexes, and validates for duplicate IDs.
 *   - Duplicate IDs in the canonical array are an integrity failure.
 *     hydrateFromMasterData() throws by default. Callers that need to
 *     inspect without throwing can use _diagnostics.getIntegrityReport().
 *
 * REVERSE-INDEX INTEGRITY
 * -----------------------
 *   The household record carries two reverse-index fields into other
 *   domains:
 *
 *     household.residenceId       ← residence side: unit.householdId
 *     household.enterprises[]     ← enterprise side: enterprise.ownerId
 *
 *   Both are maintained by HouseholdCommands and both can drift if a
 *   mutation fails to reconcile the other side. The diagnostics below
 *   cross-check both directions of both associations.
 *
 *   RESIDENCE:
 *     residenceId is maintained by
 *     HouseholdCommands.associateWithResidence /
 *     disassociateFromResidence, which ResidenceSystem calls when
 *     occupancy changes. If the residence side is deleted or demolished
 *     without the reverse index being cleared, household.residenceId
 *     points at a missing residence.
 *
 *     Reports:
 *       - householdsWithMissingResidence
 *       - householdsWithMissingResidenceUnit
 *       - householdsWithMismatchedResidenceUnit
 *       - householdsOccupyingMultipleUnits
 *       - residencesWithOrphanHouseholdOccupancy
 *       - residenceUnitsWithStaleHouseholdReference
 *       - residenceUnitsWithMissingHousehold
 *
 *   ENTERPRISE (secondary item #2):
 *     enterprises[] is maintained by
 *     HouseholdCommands.addEnterpriseToHousehold /
 *     removeEnterpriseFromHousehold, which IndustryCommands calls on
 *     create / delete / rebuild and on owner change (via the C2
 *     reconciliation path). If either side is mutated without the other
 *     being reconciled, the reverse index drifts.
 *
 *     Reports:
 *       - householdsWithOrphanEnterpriseRef
 *       - enterprisesOrphanedFromHousehold
 *       - enterpriseReverseIndexAvailable
 *
 *     The household-side check walks household.enterprises[] and
 *     verifies each entry resolves to an enterprise whose ownerType /
 *     ownerId point back at the household. It catches:
 *       - malformed entries (not a non-empty string)
 *       - entries pointing at a deleted enterprise
 *       - entries whose enterprise is owned by someone else
 *       - entries whose enterprise is owned by a different household
 *
 *     The enterprise-side check walks masterData.data.enterprises and
 *     verifies each household-owned enterprise's ownerId resolves to an
 *     existing household. It catches:
 *       - enterprises whose owner household was deleted without
 *         reconciling the reverse index
 *
 *   The enterprise-side check reads masterData.data.enterprises directly,
 *   NOT through IndustryState. It therefore works even when the industry
 *   module has not been loaded (a household-only page, a reduced test
 *   harness). IndustryState is not a dependency of this module.
 *
 *   The symmetric check on the industry side lives in
 *   industry-state.js::validateIntegrity (see the M3 revision there). The
 *   two checks are intentionally redundant: each domain's bootstrap
 *   reports on the collection it owns, and neither waits for the other to
 *   be loaded.
 *
 * PUBLIC API SURFACE (intentionally tiny)
 * ---------------------------------------
 *   HouseholdState.subscribe(cb)
 *   HouseholdState.invalidateCache()
 *   HouseholdState.refresh()
 *   HouseholdState.hydrateFromMasterData()
 *   HouseholdState.markDirty()
 *   HouseholdState.hasDirty()
 *   HouseholdState.clearDirty()
 *   HouseholdState.publish(eventType, payload)
 *   HouseholdState.getUIState()
 *   HouseholdState.setUIState(key, value)
 *   HouseholdState.updateUIState(updates)
 *
 *   Facade compatibility surface (reads/writes core/state.js):
 *   HouseholdState.selectedHouseholdId  (get/set)
 *   HouseholdState.setSelectedHousehold(id)
 *   HouseholdState.hasSelectedHousehold()
 *   HouseholdState.reset()
 *
 * INTERNAL API (HouseholdState._internal)
 * ---------------------------------------
 *   Only HouseholdCommands and HouseholdQueries should call these.
 *
 *   getHouseholdRecord(id)        — live canonical record
 *   getAllHouseholdRecords(opts)  — live array (or filtered slice)
 *   getPositionRecord(id)
 *   getAllPositionRecords()
 *   getAssignmentRecord(id)
 *   getAllAssignmentRecords()
 *   replaceHouseholds(arr)        — shape, rebuild, publish, mark dirty
 *   replaceHouseholdPositions(arr)
 *   replaceHouseholdAssignments(arr)
 *
 * DEPRECATED ALIASES (kept for one cycle)
 * ---------------------------------------
 *   HouseholdState._internal.getXCanonical(id)  → getXRecord(id)
 *   HouseholdState._internal.loadData()         → hydrateFromMasterData()
 *
 * NAMESPACE OWNERSHIP
 * -------------------
 *   This file is the SINGLE owner of window.HouseholdState. The historical
 *   js/core/household-state.js UI shim has been deleted. The shim's
 *   surface (selectedHouseholdId, setSelectedHousehold,
 *   hasSelectedHousehold, reset) is provided here as a compatibility block
 *   that delegates to the module's own UI-state store.
 *
 *   A collision guard at the bottom of this file throws if
 *   window.HouseholdState was already defined by another module when this
 *   file loads. That makes any future accidental duplication loud instead
 *   of silent.
 *
 * DEPENDENCIES (REQUIRED at load):
 *   - storage.js (window.masterData)
 *
 * DEPENDENCIES (OPTIONAL, checked at diagnostics time only):
 *   - None for Residence integrity. The check reads canonical
 *     masterData.data.households and masterData.data.residences directly.
 *
 *   The enterprise diagnostics do not require any module. They read
 *   masterData.data.enterprises and masterData.data.households directly.
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (secondary item #2):
 *     - _diagnostics.getIntegrityReport() now cross-checks the household
 *       <-> enterprise reverse index, symmetric to the existing household
 *       <-> residence cross-check. New report fields:
 *
 *         householdsWithOrphanEnterpriseRef
 *         enterprisesOrphanedFromHousehold
 *         enterpriseReverseIndexAvailable
 *
 *       The household-side check walks household.enterprises[] and
 *       verifies each entry resolves to an enterprise whose ownerType /
 *       ownerId point back. The enterprise-side check walks
 *       masterData.data.enterprises and verifies each household-owned
 *       enterprise's ownerId resolves to an existing household.
 *
 *       Prior revisions relied on industry-state.validateIntegrity (M3)
 *       to surface these desyncs, which required the industry domain to
 *       be loaded and its bootstrap to run. The household bootstrap's
 *       integrity log said nothing about enterprises. A household-only
 *       page (or a test harness that omits the industry domain) had no
 *       way to see a corrupted enterprise reverse index.
 *
 *     - Header REVERSE-INDEX INTEGRITY section expanded to cover both
 *       associations (residence, enterprise) with their report field
 *       names and the rationale for reading masterData.data.enterprises
 *       directly rather than via IndustryState.
 *
 *     - No behavioural change to any public read, mutation primitive,
 *       hydration path, subscription, or UI-state accessor. The
 *       diagnostics pass is additive; existing report consumers that
 *       read householdsWithMissingResidence / residencesWithOrphanHouseholdOccupancy /
 *       residenceReverseIndexAvailable continue to work unchanged.
 *   Previous revisions:
 *     - Initial implementation with subscription, hydration, and
 *       duplicate-id detection.
 *     - Household <-> residence reverse-index cross-check added.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. COLLISION GUARD
    // =========================================================================
    //
    // If another module has already claimed window.HouseholdState, refuse to
    // load. Silent clobbering is how the location/role/rank/household
    // namespace collisions happened. The core UI shim has been removed;
    // there must be exactly one HouseholdState in the tree.

    if (typeof window.HouseholdState !== 'undefined'
        && window.HouseholdState.__owner !== 'households/household-state.js') {
        throw new Error(
            'households/household-state.js: window.HouseholdState is already ' +
            'defined by another module. The historical core UI shim must be ' +
            'deleted, not loaded alongside this file.'
        );
    }

    // =========================================================================
    // 1. DEPENDENCY VERIFICATION (load time)
    // =========================================================================

    function _getMasterData() {
        if (typeof window.masterData === 'undefined' || !window.masterData) {
            throw new Error(
                'HouseholdState: storage.js must load first (masterData missing).'
            );
        }
        if (!window.masterData.data) {
            throw new Error(
                'HouseholdState: masterData.data is required.'
            );
        }
        return window.masterData;
    }

    // =========================================================================
    // 2. STATE DEFINITION
    // =========================================================================

    var _state = {
        households: [],
        householdPositions: [],
        householdAssignments: [],

        cache: {
            byId: new Map(),
            byLocation: new Map(),
            byStatus: new Map(),
            byMember: new Map()
        },

        uiState: {
            selectedHouseholdId: null,
            selectedCharacterId: null,
            selectedPositionId: null,
            filters: {
                searchTerm: '',
                statusFilter: 'all',
                locationFilter: 'all'
            },
            viewMode: 'list',
            expandedHouseholds: {}
        },

        subscribers: [],

        // Internal reentrancy guard for hydrate/rebuild only.
        // Not a domain-operation lock. Domain operations never consult it.
        _processingState: false,

        // Dirty flag — set by _replace* and by markDirty(). Cleared by
        // clearDirty() (typically after persist() succeeds). State does
        // not save; the flag is advisory.
        _dirty: false,

        // Last hydrate error, if any.
        _lastError: null,

        version: 6,
        timestamp: Date.now()
    };

    // =========================================================================
    // 3. HYDRATION (schema shape only, plus integrity)
    // =========================================================================

    function _ensureHouseholdShape(h) {
        if (!h || typeof h !== 'object') return;

        // Arrays — empty is a legitimate value.
        if (!Array.isArray(h.members))               h.members = [];
        if (!Array.isArray(h.departments))           h.departments = [];
        if (!Array.isArray(h.enterprises))           h.enterprises = [];
        if (!Array.isArray(h.enterpriseHistory))     h.enterpriseHistory = [];
        if (!Array.isArray(h.eventLog))              h.eventLog = [];
        if (!Array.isArray(h.nameHistory))           h.nameHistory = [];
        if (!Array.isArray(h.residenceHistory))      h.residenceHistory = [];
        if (!Array.isArray(h.vacancyHistory))        h.vacancyHistory = [];
        if (!Array.isArray(h.damageHistory))         h.damageHistory = [];
        if (!Array.isArray(h.activityLog))           h.activityLog = [];
        if (!Array.isArray(h.crimeHistory))          h.crimeHistory = [];
        if (!Array.isArray(h.vendettas))             h.vendettas = [];
        if (!Array.isArray(h.alliances))             h.alliances = [];

        // Objects — empty object is a legitimate value.
        if (!h.economy || typeof h.economy !== 'object')     h.economy = {};
        if (!h.resources || typeof h.resources !== 'object') h.resources = {};

        // Domain facts (status, reputation, wealth, debt, powerScore,
        // foundedYear, createdAt, updatedAt, notes) are NOT defaulted.
        // Missing means the persisted data is incomplete, which is a
        // migration problem, not a runtime problem.
    }

    function _ensurePositionShape(p) {
        if (!p || typeof p !== 'object') return;
        // Positions have no array fields in the current schema. No-op.
    }

    function _ensureAssignmentShape(a) {
        if (!a || typeof a !== 'object') return;
        // Assignments have no array fields in the current schema. No-op.
    }

    function _detectDuplicates(records, idField) {
        var seen = new Set();
        var duplicates = [];
        for (var i = 0; i < records.length; i++) {
            var r = records[i];
            if (!r || typeof r !== 'object') {
                duplicates.push({ index: i, id: null, reason: 'non-object' });
                continue;
            }
            var id = r[idField];
            if (!id) {
                duplicates.push({ index: i, id: null, reason: 'missing id' });
                continue;
            }
            if (seen.has(id)) {
                duplicates.push({ index: i, id: id, reason: 'duplicate id' });
            } else {
                seen.add(id);
            }
        }
        return duplicates;
    }

    function _loadHouseholds() {
        var master = _getMasterData();
        if (!Array.isArray(master.data.households)) {
            master.data.households = [];
        }
        var households = master.data.households;
        for (var i = 0; i < households.length; i++) {
            _ensureHouseholdShape(households[i]);
        }
        return households;
    }

    function _loadHouseholdPositions() {
        var master = _getMasterData();
        if (!Array.isArray(master.data.householdPositions)) {
            master.data.householdPositions = [];
        }
        var positions = master.data.householdPositions;
        for (var i = 0; i < positions.length; i++) {
            _ensurePositionShape(positions[i]);
        }
        return positions;
    }

    function _loadHouseholdAssignments() {
        var master = _getMasterData();
        if (!Array.isArray(master.data.householdAssignments)) {
            master.data.householdAssignments = [];
        }
        var assignments = master.data.householdAssignments;
        for (var i = 0; i < assignments.length; i++) {
            _ensureAssignmentShape(assignments[i]);
        }
        return assignments;
    }

    /**
     * Re-reads masterData, ensures shape, rebuilds indexes, validates.
     *
     * Idempotent. Safe to call after every mutation.
     *
     * Throws on duplicate IDs in the canonical arrays (integrity failure).
     * Use _diagnostics.getIntegrityReport() to inspect without throwing.
     */
    function hydrateFromMasterData() {
        if (_state._processingState) return;
        _state._processingState = true;
        _state._lastError = null;
        try {
            var households = _loadHouseholds();
            var positions = _loadHouseholdPositions();
            var assignments = _loadHouseholdAssignments();

            var hDup = _detectDuplicates(households, 'id');
            if (hDup.length > 0) {
                throw new Error(
                    'HouseholdState.hydrateFromMasterData: duplicate household ids: ' +
                    JSON.stringify(hDup.slice(0, 5))
                );
            }
            var pDup = _detectDuplicates(positions, 'id');
            if (pDup.length > 0) {
                throw new Error(
                    'HouseholdState.hydrateFromMasterData: duplicate position ids: ' +
                    JSON.stringify(pDup.slice(0, 5))
                );
            }
            var aDup = _detectDuplicates(assignments, 'id');
            if (aDup.length > 0) {
                throw new Error(
                    'HouseholdState.hydrateFromMasterData: duplicate assignment ids: ' +
                    JSON.stringify(aDup.slice(0, 5))
                );
            }

            _state.households = households;
            _state.householdPositions = positions;
            _state.householdAssignments = assignments;
            _rebuildCaches();
            _state.timestamp = Date.now();
        } catch (e) {
            _state._lastError = e;
            throw e;
        } finally {
            _state._processingState = false;
        }
    }

    // Deprecated alias — kept for one cycle.
    function _loadData() {
        hydrateFromMasterData();
    }

    // =========================================================================
    // 4. CACHE MANAGEMENT
    // =========================================================================

    function _rebuildCaches() {
        var cache = _state.cache;
        cache.byId.clear();
        cache.byLocation.clear();
        cache.byStatus.clear();
        cache.byMember.clear();

        var households = _state.households;
        for (var i = 0; i < households.length; i++) {
            var h = households[i];
            if (!h || !h.id) continue;

            cache.byId.set(h.id, h);

            var locationKey = h.locationId || 'none';
            if (!cache.byLocation.has(locationKey)) {
                cache.byLocation.set(locationKey, []);
            }
            cache.byLocation.get(locationKey).push(h);

            var statusKey = h.status || 'none';
            if (!cache.byStatus.has(statusKey)) {
                cache.byStatus.set(statusKey, []);
            }
            cache.byStatus.get(statusKey).push(h);

            if (Array.isArray(h.members)) {
                for (var j = 0; j < h.members.length; j++) {
                    var member = h.members[j];
                    if (!member || !member.characterId) continue;

                    if (!cache.byMember.has(member.characterId)) {
                        cache.byMember.set(member.characterId, []);
                    }
                    cache.byMember.get(member.characterId).push(h.id);
                }
            }
        }
    }

    function invalidateCache() {
        if (_state._processingState) {
            return { success: false, reason: 'hydrate in progress' };
        }
        _state._processingState = true;
        try {
            _rebuildCaches();
            publish('cacheInvalidated', {});
            return { success: true };
        } finally {
            _state._processingState = false;
        }
    }

    // =========================================================================
    // 5. DIRTY FLAG
    // =========================================================================

    function markDirty() {
        _state._dirty = true;
        if (typeof window.markDataDirty === 'function') {
            try {
                window.markDataDirty();
            } catch (e) {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn(
                        'HouseholdState.markDirty: window.markDataDirty threw', e
                    );
                }
            }
        }
        return true;
    }

    function hasDirty() {
        return _state._dirty === true;
    }

    function clearDirty() {
        _state._dirty = false;
        return true;
    }

    // =========================================================================
    // 6. PUBLISH / SUBSCRIBE
    // =========================================================================

    function subscribe(callback) {
        if (typeof callback !== 'function') return null;
        _state.subscribers.push(callback);
        return function unsubscribe() {
            var index = _state.subscribers.indexOf(callback);
            if (index !== -1) {
                _state.subscribers.splice(index, 1);
            }
        };
    }

    function _notifySubscribers(event) {
        var subscribers = _state.subscribers.slice();
        for (var i = 0; i < subscribers.length; i++) {
            try {
                subscribers[i](event);
            } catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('HouseholdState: subscriber error', e);
                }
            }
        }
    }

    function publish(eventType, payload) {
        if (typeof eventType !== 'string' || eventType === '') return false;
        _notifySubscribers({
            type: eventType,
            detail: payload === undefined ? {} : payload,
            timestamp: Date.now()
        });
        return true;
    }

    // =========================================================================
    // 7. UI STATE (ephemeral, defensive on read)
    // =========================================================================

    function getUIState() {
        var filters = _state.uiState.filters;
        var expanded = _state.uiState.expandedHouseholds;

        var expandedCopy = {};
        for (var k in expanded) {
            if (Object.prototype.hasOwnProperty.call(expanded, k)) {
                expandedCopy[k] = expanded[k];
            }
        }

        return {
            selectedHouseholdId: _state.uiState.selectedHouseholdId,
            selectedCharacterId: _state.uiState.selectedCharacterId,
            selectedPositionId: _state.uiState.selectedPositionId,
            filters: {
                searchTerm: filters.searchTerm,
                statusFilter: filters.statusFilter,
                locationFilter: filters.locationFilter
            },
            viewMode: _state.uiState.viewMode,
            expandedHouseholds: expandedCopy
        };
    }

    function setUIState(key, value, options) {
        options = options || {};
        if (_state.uiState[key] === undefined) return false;

        _state.uiState[key] = value;

        if (options.notify !== false) {
            publish('uiStateChange', { key: key, value: value });
        }
        return true;
    }

    function updateUIState(updates, options) {
        options = options || {};
        var changed = false;

        for (var key in updates) {
            if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;
            if (_state.uiState[key] === undefined) continue;

            if (key === 'filters'
                && typeof updates[key] === 'object'
                && updates[key] !== null) {
                for (var filterKey in updates[key]) {
                    if (!Object.prototype.hasOwnProperty.call(
                        updates[key], filterKey
                    )) continue;
                    _state.uiState.filters[filterKey] = updates[key][filterKey];
                    changed = true;
                }
            } else {
                _state.uiState[key] = updates[key];
                changed = true;
            }
        }

        if (changed && options.notify !== false) {
            publish('uiStateChange', { updates: updates });
        }
        return changed;
    }

    // =========================================================================
    // 7b. FACADE COMPATIBILITY SURFACE
    // =========================================================================
    //
    // The historical js/core/household-state.js exposed selectedHouseholdId,
    // setSelectedHousehold, hasSelectedHousehold, and reset as top-level
    // properties/methods. That file has been deleted; the surface is
    // provided here so core/state.js continues to work unchanged.
    //
    // These delegates read/write _state.uiState.selectedHouseholdId.
    // They are the ONLY reason this module exposes a UI-shaped surface
    // beyond getUIState()/setUIState()/updateUIState(); the canonical
    // storage remains the UI-state store.

    function _getSelectedHouseholdId() {
        return _state.uiState.selectedHouseholdId;
    }

    function _setSelectedHouseholdId(value) {
        _state.uiState.selectedHouseholdId = value;
        publish('uiStateChange', {
            key: 'selectedHouseholdId',
            value: value
        });
    }

    function setSelectedHousehold(id) {
        _setSelectedHouseholdId(id);
    }

    function hasSelectedHousehold() {
        return _state.uiState.selectedHouseholdId !== null;
    }

    function reset() {
        updateUIState({
            selectedHouseholdId: null,
            selectedCharacterId: null,
            selectedPositionId: null,
            filters: {
                searchTerm: '',
                statusFilter: 'all',
                locationFilter: 'all'
            },
            viewMode: 'list',
            expandedHouseholds: {}
        });
    }

    // =========================================================================
    // 8. INTERNAL MUTATION SEAM
    // =========================================================================

    function _replaceHouseholds(households) {
        _state.households = households;
        var master = _getMasterData();
        if (master.data) {
            master.data.households = households;
        }
        _rebuildCaches();
        markDirty();
        publish('householdsReplaced', { count: households.length });
    }

    function _replaceHouseholdPositions(positions) {
        _state.householdPositions = positions;
        var master = _getMasterData();
        if (master.data) {
            master.data.householdPositions = positions;
        }
        markDirty();
        publish('positionsReplaced', { count: positions.length });
    }

    function _replaceHouseholdAssignments(assignments) {
        _state.householdAssignments = assignments;
        var master = _getMasterData();
        if (master.data) {
            master.data.householdAssignments = assignments;
        }
        markDirty();
        publish('assignmentsReplaced', { count: assignments.length });
    }

    // =========================================================================
    // 9. INTERNAL RECORD ACCESS
    // =========================================================================

    function _getHouseholdRecord(householdId) {
        if (!householdId) return null;
        return _state.cache.byId.get(householdId) || null;
    }

    // Transaction support for coordinated cross-domain operations.
    // Snapshots are detached copies because household commands mutate records
    // in place. Restoration replaces the canonical record without publishing;
    // the transaction coordinator owns commit notifications.
    function _cloneTransactionValue(value) {
        if (value === null || typeof value !== 'object') return value;
        if (Array.isArray(value)) {
            return value.map(_cloneTransactionValue);
        }
        var copy = {};
        Object.keys(value).forEach(function(key) {
            copy[key] = _cloneTransactionValue(value[key]);
        });
        return copy;
    }

    function _transactionSnapshotHousehold(householdId) {
        var record = _getHouseholdRecord(householdId);
        if (!record) return null;
        return {
            householdId: householdId,
            record: _cloneTransactionValue(record)
        };
    }

    function _transactionRestoreHousehold(snapshot) {
        if (!snapshot || !snapshot.record ||
            typeof snapshot.householdId !== 'string') {
            throw new Error('HouseholdState transaction snapshot is invalid.');
        }
        var records = _state.households.slice();
        var index = -1;
        for (var i = 0; i < records.length; i++) {
            if (records[i] && records[i].id === snapshot.householdId) {
                if (index !== -1) {
                    throw new Error('Cannot restore household with duplicate id: ' +
                        snapshot.householdId);
                }
                index = i;
            }
        }
        if (index === -1) {
            throw new Error('Household disappeared during transaction: ' +
                snapshot.householdId);
        }
        records[index] = _cloneTransactionValue(snapshot.record);
        _state.households = records;
        _getMasterData().data.households = records;
        _rebuildCaches();
        markDirty();
        return true;
    }

    function _getAllHouseholdRecords(options) {
        options = options || {};
        var households = _state.households;
        if (options.includeDeprecated) return households.slice();
        var result = [];
        for (var i = 0; i < households.length; i++) {
            var s = households[i].status;
            if (s !== 'deprecated' && s !== 'destroyed') {
                result.push(households[i]);
            }
        }
        return result;
    }

    function _getPositionRecord(positionId) {
        if (!positionId) return null;
        var positions = _state.householdPositions;
        for (var i = 0; i < positions.length; i++) {
            if (positions[i].id === positionId) return positions[i];
        }
        return null;
    }

    function _getAllPositionRecords() {
        return _state.householdPositions.slice();
    }

    function _getAssignmentRecord(assignmentId) {
        if (!assignmentId) return null;
        var assignments = _state.householdAssignments;
        for (var i = 0; i < assignments.length; i++) {
            if (assignments[i].id === assignmentId) return assignments[i];
        }
        return null;
    }

    function _getAllAssignmentRecords() {
        return _state.householdAssignments.slice();
    }

    // Deprecated aliases — _getXCanonical naming, kept for one cycle.
    function _getHouseholdCanonical(householdId) {
        return _getHouseholdRecord(householdId);
    }
    function _getPositionCanonical(positionId) {
        return _getPositionRecord(positionId);
    }
    function _getAssignmentCanonical(assignmentId) {
        return _getAssignmentRecord(assignmentId);
    }

    // =========================================================================
    // 10. LIFECYCLE
    // =========================================================================

    function refresh() {
        try {
            hydrateFromMasterData();
            publish('refreshed', {});
            return { success: true };
        } catch (e) {
            _state._lastError = e;
            publish('refreshFailed', {
                message: e && e.message ? e.message : 'Unknown error'
            });
            return {
                success: false,
                reason: e && e.message ? e.message : 'refresh failed'
            };
        }
    }

    // =========================================================================
    // 11. DIAGNOSTICS
    // =========================================================================
    //
    // getIntegrityReport() is the canonical integrity inspection path.
    // It is non-throwing, idempotent, and safe to call at any time —
    // including during startup when the canonical arrays may still be
    // corrupted.
    //
    // REVERSE-INDEX CROSS-CHECKS
    // --------------------------
    // Two reverse-index associations are audited, each in both directions.
    //
    // RESIDENCE:
    //   - household.residenceId       (reverse index)
    //   - residence.units[].householdId (canonical occupancy)
    //
    //   householdsWithMissingResidence:
    //       household.residenceId points at a residence that no longer
    //       exists in masterData.data.residences.
    //   residencesWithOrphanHouseholdOccupancy:
    //       a residence unit has householdId pointing at a household that
    //       no longer exists in masterData.data.households.
    //   residenceReverseIndexAvailable:
    //       false if the check couldn't run (neither ResidenceSystem nor
    //       the canonical residences array was present).
    //
    // ENTERPRISE:
    //   - household.enterprises[]     (reverse index)
    //   - enterprise.ownerType / ownerId (canonical ownership)
    //
    //   householdsWithOrphanEnterpriseRef:
    //       household.enterprises[] contains an entry that (a) is not a
    //       non-empty string, (b) does not resolve to an enterprise in
    //       masterData.data.enterprises, (c) resolves to an enterprise
    //       whose ownerType is not 'household', or (d) resolves to an
    //       enterprise whose ownerId is a different household.
    //   enterprisesOrphanedFromHousehold:
    //       an enterprise in masterData.data.enterprises has
    //       ownerType === 'household' but its ownerId does not resolve
    //       to any household in masterData.data.households.
    //   enterpriseReverseIndexAvailable:
    //       false if the check couldn't run (masterData.data.enterprises
    //       or masterData.data.households was not an array).
    //
    //   The enterprise check reads masterData.data.enterprises directly,
    //   not through IndustryState. It works even when the industry module
    //   has not been loaded. The symmetric check on the industry side
    //   lives in industry-state.js::validateIntegrity (M3).
    //
    // Neither check throws. Missing records / malformed shapes are
    // silently skipped (a shape problem is validation.js's concern, not
    // the diagnostics').

    function _checkResidenceReverseIndex() {
        var result = {
            available: false,
            householdsWithMissingResidence: [],
            householdsWithMissingResidenceUnit: [],
            householdsWithMismatchedResidenceUnit: [],
            householdsOccupyingMultipleUnits: [],
            residencesWithOrphanHouseholdOccupancy: [],
            residenceUnitsWithStaleHouseholdReference: [],
            residenceUnitsWithMissingHousehold: []
        };

        var master;
        try {
            master = _getMasterData();
        } catch (e) {
            return result;
        }

        var canonicalHouseholds = Array.isArray(master.data.households)
            ? master.data.households : null;
        var canonicalResidences = Array.isArray(master.data.residences)
            ? master.data.residences : null;
        if (!canonicalHouseholds || !canonicalResidences) return result;
        result.available = true;

        var householdById = new Map();
        var residenceById = new Map();
        var unitRefsByHousehold = new Map();

        for (var hi = 0; hi < canonicalHouseholds.length; hi++) {
            var household = canonicalHouseholds[hi];
            if (household && typeof household.id === 'string' &&
                household.id !== '' && !householdById.has(household.id)) {
                householdById.set(household.id, household);
            }
        }
        for (var ri = 0; ri < canonicalResidences.length; ri++) {
            var residence = canonicalResidences[ri];
            if (residence && typeof residence.id === 'string' &&
                residence.id !== '' && !residenceById.has(residence.id)) {
                residenceById.set(residence.id, residence);
            }
            if (!residence || !Array.isArray(residence.units)) continue;
            for (var ui = 0; ui < residence.units.length; ui++) {
                var unit = residence.units[ui];
                if (!unit || typeof unit.householdId !== 'string' ||
                    unit.householdId === '') continue;

                var ref = {
                    residenceId: residence.id || null,
                    residenceName: residence.name || null,
                    unitNumber: unit.unitNumber,
                    unitId: unit.id || null,
                    isVacant: unit.isVacant === true,
                    isDemolished: unit.isDemolished === true
                };
                if (!unitRefsByHousehold.has(unit.householdId)) {
                    unitRefsByHousehold.set(unit.householdId, []);
                }
                unitRefsByHousehold.get(unit.householdId).push(ref);

                if (unit.isVacant === true || unit.isDemolished === true) {
                    result.residenceUnitsWithStaleHouseholdReference.push({
                        householdId: unit.householdId,
                        residenceId: residence.id || null,
                        residenceName: residence.name || null,
                        unitNumber: unit.unitNumber,
                        isVacant: unit.isVacant === true,
                        isDemolished: unit.isDemolished === true
                    });
                    continue;
                }

                if (!householdById.has(unit.householdId)) {
                    result.residencesWithOrphanHouseholdOccupancy.push({
                        residenceId: residence.id || null,
                        residenceName: residence.name || null,
                        unitNumber: unit.unitNumber,
                        householdId: unit.householdId
                    });
                }
            }
        }

        // Household → Residence and exact unit reverse reference.
        for (var h = 0; h < canonicalHouseholds.length; h++) {
            var householdRecord = canonicalHouseholds[h];
            if (!householdRecord || typeof householdRecord.id !== 'string') continue;
            var residenceId = typeof householdRecord.residenceId === 'string'
                ? householdRecord.residenceId : '';
            var unitNumber = householdRecord.residenceUnitNumber;
            var refs = unitRefsByHousehold.get(householdRecord.id) || [];

            if (residenceId) {
                var targetResidence = residenceById.get(residenceId);
                if (!targetResidence) {
                    result.householdsWithMissingResidence.push({
                        householdId: householdRecord.id,
                        householdName: householdRecord.name || null,
                        residenceId: residenceId
                    });
                } else {
                    var matchingRefs = refs.filter(function(ref) {
                        return ref.residenceId === residenceId &&
                            ref.isVacant !== true && ref.isDemolished !== true;
                    });
                    if (matchingRefs.length === 0) {
                        result.householdsWithMissingResidenceUnit.push({
                            householdId: householdRecord.id,
                            residenceId: residenceId,
                            unitNumber: unitNumber === undefined ? null : unitNumber,
                            reason: 'no active unit points back to this household'
                        });
                    } else if (matchingRefs.length > 1) {
                        result.householdsOccupyingMultipleUnits.push({
                            householdId: householdRecord.id,
                            units: matchingRefs
                        });
                    } else if (unitNumber === undefined || unitNumber === null ||
                        matchingRefs[0].unitNumber !== unitNumber) {
                        result.householdsWithMismatchedResidenceUnit.push({
                            householdId: householdRecord.id,
                            residenceId: residenceId,
                            householdUnitNumber: unitNumber === undefined ? null : unitNumber,
                            actualUnitNumber: matchingRefs[0].unitNumber
                        });
                    }
                }
            } else if (refs.some(function(ref) {
                return ref.isVacant !== true && ref.isDemolished !== true;
            })) {
                result.householdsWithMissingResidenceUnit.push({
                    householdId: householdRecord.id,
                    residenceId: null,
                    unitNumber: unitNumber === undefined ? null : unitNumber,
                    reason: 'unit occupancy exists but household reverse reference is missing'
                });
            }

            if (refs.length > 1) {
                var activeRefs = refs.filter(function(ref) {
                    return ref.isVacant !== true && ref.isDemolished !== true;
                });
                if (activeRefs.length > 1 &&
                    !result.householdsOccupyingMultipleUnits.some(function(item) {
                        return item.householdId === householdRecord.id;
                    })) {
                    result.householdsOccupyingMultipleUnits.push({
                        householdId: householdRecord.id,
                        units: activeRefs
                    });
                }
            }
        }

        // A unit marked occupied without a householdId is also inconsistent.
        for (var r2 = 0; r2 < canonicalResidences.length; r2++) {
            var residence2 = canonicalResidences[r2];
            if (!residence2 || !Array.isArray(residence2.units)) continue;
            for (var u2 = 0; u2 < residence2.units.length; u2++) {
                var unit2 = residence2.units[u2];
                if (!unit2 || unit2.isDemolished === true ||
                    unit2.isVacant !== false) continue;
                if (typeof unit2.householdId !== 'string' ||
                    unit2.householdId === '') {
                    result.residenceUnitsWithMissingHousehold.push({
                        residenceId: residence2.id || null,
                        residenceName: residence2.name || null,
                        unitNumber: unit2.unitNumber
                    });
                }
            }
        }

        return result;
    }

    /**
     * Cross-checks the household <-> enterprise reverse index.
     *
     * Reads masterData.data.enterprises and masterData.data.households
     * directly. Does NOT go through IndustryState; works even when the
     * industry module is not loaded.
     *
     * @private
     * @returns {{
     *   available: boolean,
     *   householdsWithOrphanEnterpriseRef: Array,
     *   enterprisesOrphanedFromHousehold: Array
     * }}
     */
    function _checkEnterpriseReverseIndex() {
        var result = {
            available: false,
            householdsWithOrphanEnterpriseRef: [],
            enterprisesOrphanedFromHousehold: []
        };

        var master;
        try {
            master = _getMasterData();
        } catch (e) {
            return result;
        }

        var canonicalEnterprises = Array.isArray(master.data.enterprises)
            ? master.data.enterprises
            : null;
        var canonicalHouseholds = Array.isArray(master.data.households)
            ? master.data.households
            : null;

        if (!canonicalEnterprises || !canonicalHouseholds) {
            return result;
        }

        result.available = true;

        // Index both sides up front so both directions of the check are
        // O(1) lookups per entry.
        var enterpriseById = new Map();
        for (var e = 0; e < canonicalEnterprises.length; e++) {
            var ent = canonicalEnterprises[e];
            if (!ent || typeof ent.id !== 'string' || ent.id.length === 0) {
                continue;
            }
            enterpriseById.set(ent.id, ent);
        }

        var householdById = new Map();
        for (var h = 0; h < canonicalHouseholds.length; h++) {
            var hh = canonicalHouseholds[h];
            if (!hh || typeof hh.id !== 'string' || hh.id.length === 0) {
                continue;
            }
            householdById.set(hh.id, hh);
        }

        // Direction 1: household.enterprises[] → enterprise.
        for (var hi = 0; hi < canonicalHouseholds.length; hi++) {
            var household = canonicalHouseholds[hi];
            if (!household || typeof household.id !== 'string') continue;
            if (!Array.isArray(household.enterprises)) continue;

            for (var ei = 0; ei < household.enterprises.length; ei++) {
                var entryId = household.enterprises[ei];

                if (typeof entryId !== 'string' || entryId.length === 0) {
                    result.householdsWithOrphanEnterpriseRef.push({
                        householdId: household.id,
                        householdName: household.name || null,
                        enterpriseId: null,
                        index: ei,
                        reason: 'malformed entry'
                    });
                    continue;
                }

                var enterprise = enterpriseById.get(entryId);
                if (!enterprise) {
                    result.householdsWithOrphanEnterpriseRef.push({
                        householdId: household.id,
                        householdName: household.name || null,
                        enterpriseId: entryId,
                        index: ei,
                        reason: 'missing enterprise'
                    });
                    continue;
                }

                if (enterprise.ownerType !== 'household') {
                    result.householdsWithOrphanEnterpriseRef.push({
                        householdId: household.id,
                        householdName: household.name || null,
                        enterpriseId: entryId,
                        index: ei,
                        reason: 'not household-owned'
                    });
                    continue;
                }

                if (enterprise.ownerId !== household.id) {
                    result.householdsWithOrphanEnterpriseRef.push({
                        householdId: household.id,
                        householdName: household.name || null,
                        enterpriseId: entryId,
                        index: ei,
                        reason: 'owned by different household',
                        actualOwnerId: enterprise.ownerId || null
                    });
                }
            }
        }

        // Direction 2: enterprise.ownerId → household.
        for (var ei2 = 0; ei2 < canonicalEnterprises.length; ei2++) {
            var ent2 = canonicalEnterprises[ei2];
            if (!ent2 || typeof ent2.id !== 'string') continue;
            if (ent2.ownerType !== 'household') continue;

            var ownerId = ent2.ownerId;
            if (typeof ownerId !== 'string' || ownerId.length === 0) {
                // A household-owned enterprise with no ownerId is a
                // validation problem (industry-rules.validateEnterprise
                // rejects it). We do not report it here; that is
                // validation.js's concern, not the reverse-index
                // diagnostics'.
                continue;
            }

            if (!householdById.has(ownerId)) {
                result.enterprisesOrphanedFromHousehold.push({
                    enterpriseId: ent2.id,
                    enterpriseName: ent2.name || null,
                    ownerId: ownerId
                });
            }
        }

        return result;
    }

    /**
     * Cross-checks Household.members[] against Character household fields.
     * Both directions are inspected from canonical masterData arrays.
     * This is read-only: ambiguous legacy records are reported, never fixed.
     */
    function _checkHouseholdMemberReverseIndex(canonicalHouseholds,
                                               canonicalCharacters) {
        var result = {
            available: false,
            householdMembersWithMissingCharacter: [],
            duplicateHouseholdMemberReferences: [],
            charactersAssignedToMultipleHouseholds: [],
            householdMembersWithMismatchedCharacterReference: [],
            charactersWithOrphanHouseholdReference: [],
            charactersWithMissingHouseholdMember: [],
            charactersWithConflictingHouseholdFields: []
        };
        if (!Array.isArray(canonicalHouseholds) ||
            !Array.isArray(canonicalCharacters)) return result;

        result.available = true;
        var characterById = new Map();
        var householdById = new Map();
        var memberHouseholdsByCharacter = new Map();

        for (var hi = 0; hi < canonicalHouseholds.length; hi++) {
            var h = canonicalHouseholds[hi];
            if (h && typeof h.id === 'string' && h.id !== '' &&
                !householdById.has(h.id)) householdById.set(h.id, h);
        }
        for (var ci = 0; ci < canonicalCharacters.length; ci++) {
            var c = canonicalCharacters[ci];
            if (c && typeof c.id === 'string' && c.id !== '' &&
                !characterById.has(c.id)) characterById.set(c.id, c);
        }

        // Household → Character.
        for (var hi2 = 0; hi2 < canonicalHouseholds.length; hi2++) {
            var household = canonicalHouseholds[hi2];
            if (!household || typeof household.id !== 'string') continue;
            if (!Array.isArray(household.members)) continue;
            var seenMembers = new Map();

            for (var mi = 0; mi < household.members.length; mi++) {
                var member = household.members[mi];
                var characterId = member && member.characterId;
                if (typeof characterId !== 'string' || characterId === '') {
                    result.householdMembersWithMissingCharacter.push({
                        householdId: household.id, index: mi,
                        reason: 'missing or invalid characterId'
                    });
                    continue;
                }
                if (!seenMembers.has(characterId)) seenMembers.set(characterId, []);
                seenMembers.get(characterId).push(mi);
                // Duplicate list entries have their own diagnostic; avoid
                // repeating the same reverse-reference mismatch for each copy.
                if (seenMembers.get(characterId).length > 1) continue;

                if (!memberHouseholdsByCharacter.has(characterId)) {
                    memberHouseholdsByCharacter.set(characterId, []);
                }
                var householdRefs = memberHouseholdsByCharacter.get(characterId);
                if (householdRefs.indexOf(household.id) === -1) {
                    householdRefs.push(household.id);
                }

                var character = characterById.get(characterId);
                if (!character) {
                    result.householdMembersWithMissingCharacter.push({
                        householdId: household.id, characterId: characterId,
                        index: mi, reason: 'character not found'
                    });
                    continue;
                }
                var charHousehold = typeof character.household === 'string'
                    ? character.household : '';
                var charHouseholdId = typeof character.householdId === 'string'
                    ? character.householdId : '';
                var reverseId = charHouseholdId || charHousehold;
                if (reverseId !== household.id) {
                    result.householdMembersWithMismatchedCharacterReference.push({
                        householdId: household.id, characterId: characterId,
                        characterHousehold: charHousehold || null,
                        characterHouseholdId: charHouseholdId || null
                    });
                }
            }
            seenMembers.forEach(function(indices, characterId) {
                if (indices.length > 1) {
                    result.duplicateHouseholdMemberReferences.push({
                        householdId: household.id, characterId: characterId,
                        indices: indices.slice()
                    });
                }
            });
        }

        memberHouseholdsByCharacter.forEach(function(householdIds, characterId) {
            if (householdIds.length > 1) {
                result.charactersAssignedToMultipleHouseholds.push({
                    characterId: characterId, householdIds: householdIds.slice()
                });
            }
        });

        // Character → Household.
        for (var ci2 = 0; ci2 < canonicalCharacters.length; ci2++) {
            var characterRecord = canonicalCharacters[ci2];
            if (!characterRecord || typeof characterRecord.id !== 'string') continue;
            var householdField = typeof characterRecord.household === 'string'
                ? characterRecord.household : '';
            var householdIdField = typeof characterRecord.householdId === 'string'
                ? characterRecord.householdId : '';
            if (householdField && householdIdField &&
                householdField !== householdIdField) {
                result.charactersWithConflictingHouseholdFields.push({
                    characterId: characterRecord.id,
                    household: householdField,
                    householdId: householdIdField
                });
                continue;
            }
            var currentHouseholdId = householdIdField || householdField;
            if (!currentHouseholdId) continue;

            if (!householdById.has(currentHouseholdId)) {
                result.charactersWithOrphanHouseholdReference.push({
                    characterId: characterRecord.id,
                    householdId: currentHouseholdId
                });
                continue;
            }
            var expectedHousehold = householdById.get(currentHouseholdId);
            var matches = 0;
            if (Array.isArray(expectedHousehold.members)) {
                for (var em = 0; em < expectedHousehold.members.length; em++) {
                    if (expectedHousehold.members[em] &&
                        expectedHousehold.members[em].characterId === characterRecord.id) {
                        matches++;
                    }
                }
            }
            if (matches !== 1) {
                result.charactersWithMissingHouseholdMember.push({
                    characterId: characterRecord.id,
                    householdId: currentHouseholdId,
                    matchingMemberCount: matches
                });
            }
        }
        return result;
    }

    var _diagnostics = {
        getHouseholdCount: function() { return _state.households.length; },
        getPositionCount: function() { return _state.householdPositions.length; },
        getAssignmentCount: function() { return _state.householdAssignments.length; },
        getSubscriberCount: function() { return _state.subscribers.length; },
        getVersion: function() { return _state.version; },
        isDirty: function() { return _state._dirty === true; },
        getLastError: function() { return _state._lastError; },

        /**
         * Non-throwing integrity report.
         *
         * Returns:
         * {
         *   ok: boolean,
         *   duplicates: {
         *     households: [],
         *     positions: [],
         *     assignments: []
         *   },
         *   duplicateHouseholdHeads: [],
         *   householdsWithMissingResidence: [],
         *   residencesWithOrphanHouseholdOccupancy: [],
         *   householdsWithMissingResidenceUnit: [],
         *   householdsWithMismatchedResidenceUnit: [],
         *   householdsOccupyingMultipleUnits: [],
         *   residenceUnitsWithStaleHouseholdReference: [],
         *   residenceUnitsWithMissingHousehold: [],
         *   residenceReverseIndexAvailable: boolean,
         *   householdsWithOrphanEnterpriseRef: [],
         *   enterprisesOrphanedFromHousehold: [],
         *   enterpriseReverseIndexAvailable: boolean,
         *   householdMembersWithMissingCharacter: [],
         *   duplicateHouseholdMemberReferences: [],
         *   charactersAssignedToMultipleHouseholds: [],
         *   householdMembersWithMismatchedCharacterReference: [],
         *   charactersWithOrphanHouseholdReference: [],
         *   charactersWithMissingHouseholdMember: [],
         *   charactersWithConflictingHouseholdFields: [],
         *   householdMemberReverseIndexAvailable: boolean,
         *   counts: {
         *     households, positions, assignments
         *   },
         *   reason?: string  (only on catastrophic failure)
         * }
         *
         * `ok` is true only if every list is empty AND both reverse-index
         * checks ran (`available === true` on both). A caller that needs
         * to distinguish "no issues" from "no issues I could check" must
         * inspect the two `available` flags.
         */
        getIntegrityReport: function() {
            var households = [];
            var positions = [];
            var assignments = [];
            try {
                var master = _getMasterData();
                households = Array.isArray(master.data.households)
                    ? master.data.households : [];
                positions = Array.isArray(master.data.householdPositions)
                    ? master.data.householdPositions : [];
                assignments = Array.isArray(master.data.householdAssignments)
                    ? master.data.householdAssignments : [];
            } catch (e) {
                return { ok: false, reason: e.message };
            }

            var hDup = _detectDuplicates(households, 'id');
            var pDup = _detectDuplicates(positions, 'id');
            var aDup = _detectDuplicates(assignments, 'id');

            var duplicateHouseholdHeads = [];
            for (var i = 0; i < households.length; i++) {
                var h = households[i];
                if (!h || !Array.isArray(h.members)) continue;
                var headCount = 0;
                for (var j = 0; j < h.members.length; j++) {
                    if (h.members[j] && h.members[j].isHead) headCount++;
                }
                if (headCount > 1) {
                    duplicateHouseholdHeads.push({
                        id: h.id,
                        name: h.name || null,
                        headCount: headCount
                    });
                }
            }

            var residenceIndex = _checkResidenceReverseIndex();
            var enterpriseIndex = _checkEnterpriseReverseIndex();
            var memberIndex = _checkHouseholdMemberReverseIndex(
                Array.isArray(master.data.households) ? master.data.households : null,
                Array.isArray(master.data.characters) ? master.data.characters : null
            );

            var ok =
                hDup.length === 0 &&
                pDup.length === 0 &&
                aDup.length === 0 &&
                duplicateHouseholdHeads.length === 0 &&
                residenceIndex.available === true &&
                enterpriseIndex.available === true &&
                residenceIndex.householdsWithMissingResidence.length === 0 &&
                residenceIndex.residencesWithOrphanHouseholdOccupancy.length === 0 &&
                residenceIndex.householdsWithMissingResidenceUnit.length === 0 &&
                residenceIndex.householdsWithMismatchedResidenceUnit.length === 0 &&
                residenceIndex.householdsOccupyingMultipleUnits.length === 0 &&
                residenceIndex.residenceUnitsWithStaleHouseholdReference.length === 0 &&
                residenceIndex.residenceUnitsWithMissingHousehold.length === 0 &&
                enterpriseIndex.householdsWithOrphanEnterpriseRef.length === 0 &&
                enterpriseIndex.enterprisesOrphanedFromHousehold.length === 0 &&
                memberIndex.available === true &&
                memberIndex.householdMembersWithMissingCharacter.length === 0 &&
                memberIndex.duplicateHouseholdMemberReferences.length === 0 &&
                memberIndex.charactersAssignedToMultipleHouseholds.length === 0 &&
                memberIndex.householdMembersWithMismatchedCharacterReference.length === 0 &&
                memberIndex.charactersWithOrphanHouseholdReference.length === 0 &&
                memberIndex.charactersWithMissingHouseholdMember.length === 0 &&
                memberIndex.charactersWithConflictingHouseholdFields.length === 0;

            return {
                ok: ok,
                duplicates: {
                    households: hDup,
                    positions: pDup,
                    assignments: aDup
                },
                duplicateHouseholdHeads: duplicateHouseholdHeads,
                householdsWithMissingResidence:
                    residenceIndex.householdsWithMissingResidence,
                residencesWithOrphanHouseholdOccupancy:
                    residenceIndex.residencesWithOrphanHouseholdOccupancy,
                householdsWithMissingResidenceUnit:
                    residenceIndex.householdsWithMissingResidenceUnit,
                householdsWithMismatchedResidenceUnit:
                    residenceIndex.householdsWithMismatchedResidenceUnit,
                householdsOccupyingMultipleUnits:
                    residenceIndex.householdsOccupyingMultipleUnits,
                residenceUnitsWithStaleHouseholdReference:
                    residenceIndex.residenceUnitsWithStaleHouseholdReference,
                residenceUnitsWithMissingHousehold:
                    residenceIndex.residenceUnitsWithMissingHousehold,
                residenceReverseIndexAvailable: residenceIndex.available,
                householdsWithOrphanEnterpriseRef:
                    enterpriseIndex.householdsWithOrphanEnterpriseRef,
                enterprisesOrphanedFromHousehold:
                    enterpriseIndex.enterprisesOrphanedFromHousehold,
                enterpriseReverseIndexAvailable: enterpriseIndex.available,
                householdMembersWithMissingCharacter: memberIndex.householdMembersWithMissingCharacter,
                duplicateHouseholdMemberReferences: memberIndex.duplicateHouseholdMemberReferences,
                charactersAssignedToMultipleHouseholds: memberIndex.charactersAssignedToMultipleHouseholds,
                householdMembersWithMismatchedCharacterReference: memberIndex.householdMembersWithMismatchedCharacterReference,
                charactersWithOrphanHouseholdReference: memberIndex.charactersWithOrphanHouseholdReference,
                charactersWithMissingHouseholdMember: memberIndex.charactersWithMissingHouseholdMember,
                charactersWithConflictingHouseholdFields: memberIndex.charactersWithConflictingHouseholdFields,
                householdMemberReverseIndexAvailable: memberIndex.available,
                counts: {
                    households: households.length,
                    positions: positions.length,
                    assignments: assignments.length
                }
            };
        }
    };

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    var HouseholdState = {
        // Namespace ownership marker — see collision guard at top.
        __owner: 'households/household-state.js',

        // Public: lifecycle
        subscribe: subscribe,
        invalidateCache: invalidateCache,
        refresh: refresh,
        hydrateFromMasterData: hydrateFromMasterData,

        // Public: dirty flag
        markDirty: markDirty,
        hasDirty: hasDirty,
        clearDirty: clearDirty,

        // Public: in-process event channel
        publish: publish,

        // Public: UI ephemeral state
        getUIState: getUIState,
        setUIState: setUIState,
        updateUIState: updateUIState,

        // Facade compatibility surface (core/state.js reads these).
        get selectedHouseholdId() { return _getSelectedHouseholdId(); },
        set selectedHouseholdId(v) { _setSelectedHouseholdId(v); },
        setSelectedHousehold: setSelectedHousehold,
        hasSelectedHousehold: hasSelectedHousehold,
        reset: reset,

        // Internal: mutation boundary (Commands only)
        _internal: {
            replaceHouseholds: _replaceHouseholds,
            replaceHouseholdPositions: _replaceHouseholdPositions,
            replaceHouseholdAssignments: _replaceHouseholdAssignments,

            getHouseholdRecord: _getHouseholdRecord,
            transactionSnapshotHousehold: _transactionSnapshotHousehold,
            transactionRestoreHousehold: _transactionRestoreHousehold,
            getAllHouseholdRecords: _getAllHouseholdRecords,
            getPositionRecord: _getPositionRecord,
            getAllPositionRecords: _getAllPositionRecords,
            getAssignmentRecord: _getAssignmentRecord,
            getAllAssignmentRecords: _getAllAssignmentRecords,

            // Deprecated aliases — _getXCanonical naming
            getHouseholdCanonical: _getHouseholdCanonical,
            getPositionCanonical: _getPositionCanonical,
            getAssignmentCanonical: _getAssignmentCanonical,

            // Deprecated alias — _loadData naming
            loadData: _loadData
        },

        // Internal: introspection for repair/diagnostics
        _diagnostics: _diagnostics
    };

    window.HouseholdState = HouseholdState;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = HouseholdState;
    }

    // =========================================================================
    // 13. AUTO-HYDRATE
    // =========================================================================

    (function _autoHydrate() {
        try {
            hydrateFromMasterData();
        } catch (e) {
            if (typeof console !== 'undefined' && console.error) {
                console.error(
                    'HouseholdState: initial hydrate failed. ' +
                    'Canonical data may be corrupted. ' +
                    'Use HouseholdState._diagnostics.getIntegrityReport() ' +
                    'to inspect without throwing.', e
                );
            }
        }
    })();

    if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('masterDataUpdated', function() {
            try {
                hydrateFromMasterData();
            } catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error(
                        'HouseholdState: hydrate on masterDataUpdated failed', e
                    );
                }
            }
        });
    }

})();
