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
 * REVERSE-INDEX INTEGRITY (added)
 * -------------------------------
 *   The household record carries a `residenceId` field that is a
 *   REVERSE INDEX into the residence system. The canonical occupancy is
 *   `unit.householdId` on the residence side. The reverse index is
 *   maintained by HouseholdCommands.associateWithResidence /
 *   disassociateFromResidence, which ResidenceSystem calls when
 *   occupancy changes.
 *
 *   If the residence side is deleted or demolished without the reverse
 *   index being cleared, `household.residenceId` points at a missing
 *   residence. `_diagnostics.getIntegrityReport()` now surfaces this as
 *   `householdsWithMissingResidence`.
 *
 *   Conversely, if a residence unit still names a householdId that no
 *   longer exists in the canonical household collection, the residence
 *   holds orphan occupancy. That is surfaced as
 *   `residencesWithOrphanHouseholdOccupancy`.
 *
 *   Both checks are O(N) per diagnostics call and are NOT run on every
 *   hydrate — they run only when someone calls getIntegrityReport()
 *   (bootstrap, repair tooling, debug UI). The hydrate path stays fast.
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
 * DEPENDENCIES (REQUIRED at load):
 *   - storage.js (window.masterData)
 *
 * DEPENDENCIES (OPTIONAL, checked at diagnostics time only):
 *   - residence-system.js   (window.ResidenceSystem) — if present, the
 *     diagnostics object cross-checks occupancy; if absent, the
 *     residence-related fields in the report are marked
 *     'residence_system_unavailable' and left empty.
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function() {
    'use strict';

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
    // REVERSE-INDEX CROSS-CHECK
    // -------------------------
    // The household ↔ residence relationship is:
    //   - household.residenceId (reverse index)
    //   - residence.units[].householdId (canonical occupancy)
    //
    // These two MUST agree. When they don't, the report surfaces:
    //   - householdsWithMissingResidence:
    //       household.residenceId points at a residence that no longer
    //       exists in masterData.data.residences.
    //   - residencesWithOrphanHouseholdOccupancy:
    //       a residence unit has householdId pointing at a household
    //       that no longer exists in masterData.data.households.
    //
    // Both checks require window.ResidenceSystem to be loaded (for the
    // residence side). If ResidenceSystem is not available, both lists
    // are empty and `residenceReverseIndexAvailable` is false.
    //
    // Neither check throws. Missing residence records / missing units /
    // malformed shapes are silently skipped (a shape problem is
    // validation.js's concern, not the diagnostics').

    function _checkResidenceReverseIndex() {
        var result = {
            available: false,
            householdsWithMissingResidence: [],
            residencesWithOrphanHouseholdOccupancy: []
        };

        // Household → residence check: does the residenceId resolve?
        var residenceExistsFn = null;
        var rs = window.ResidenceSystem;
        if (rs && typeof rs.getResidence === 'function') {
            residenceExistsFn = function(residenceId) {
                try {
                    return rs.getResidence(residenceId) !== null;
                } catch (e) {
                    return false;
                }
            };
        }

        // residenceExistsFn may still be null if ResidenceSystem is
        // absent. The household→residence check can still run if the
        // canonical residences array is present in masterData, since we
        // can look it up directly.
        var master;
        try {
            master = _getMasterData();
        } catch (e) {
            return result;
        }

        var canonicalResidences = Array.isArray(master.data.residences)
            ? master.data.residences
            : null;

        if (!residenceExistsFn && canonicalResidences) {
            var residenceIdSet = new Set();
            for (var r = 0; r < canonicalResidences.length; r++) {
                var rr = canonicalResidences[r];
                if (rr && typeof rr.id === 'string') {
                    residenceIdSet.add(rr.id);
                }
            }
            residenceExistsFn = function(residenceId) {
                return residenceIdSet.has(residenceId);
            };
        }

        if (residenceExistsFn) {
            result.available = true;

            // Check 1: household.residenceId → residence.
            for (var i = 0; i < _state.households.length; i++) {
                var h = _state.households[i];
                if (!h || typeof h.residenceId !== 'string') continue;
                if (h.residenceId.length === 0) continue;
                if (!residenceExistsFn(h.residenceId)) {
                    result.householdsWithMissingResidence.push({
                        householdId: h.id,
                        householdName: h.name || null,
                        residenceId: h.residenceId
                    });
                }
            }

            // Check 2: residence.units[].householdId → household.
            if (canonicalResidences) {
                var householdIdSet = new Set();
                for (var hh = 0; hh < _state.households.length; hh++) {
                    var hrec = _state.households[hh];
                    if (hrec && typeof hrec.id === 'string') {
                        householdIdSet.add(hrec.id);
                    }
                }

                for (var res = 0; res < canonicalResidences.length; res++) {
                    var residence = canonicalResidences[res];
                    if (!residence || !Array.isArray(residence.units)) continue;
                    for (var u = 0; u < residence.units.length; u++) {
                        var unit = residence.units[u];
                        if (!unit) continue;
                        if (unit.isDemolished === true) continue;
                        if (unit.isVacant === true) continue;
                        if (typeof unit.householdId !== 'string') continue;
                        if (unit.householdId.length === 0) continue;
                        if (!householdIdSet.has(unit.householdId)) {
                            result.residencesWithOrphanHouseholdOccupancy.push({
                                residenceId: residence.id,
                                residenceName: residence.name || null,
                                unitNumber: unit.unitNumber,
                                householdId: unit.householdId
                            });
                        }
                    }
                }
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
         *   residenceReverseIndexAvailable: boolean,
         *   counts: {
         *     households, positions, assignments
         *   },
         *   reason?: string  (only on catastrophic failure)
         * }
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

            var reverseIndex = _checkResidenceReverseIndex();

            var ok =
                hDup.length === 0 &&
                pDup.length === 0 &&
                aDup.length === 0 &&
                duplicateHouseholdHeads.length === 0 &&
                reverseIndex.householdsWithMissingResidence.length === 0 &&
                reverseIndex.residencesWithOrphanHouseholdOccupancy.length === 0;

            return {
                ok: ok,
                duplicates: {
                    households: hDup,
                    positions: pDup,
                    assignments: aDup
                },
                duplicateHouseholdHeads: duplicateHouseholdHeads,
                householdsWithMissingResidence:
                    reverseIndex.householdsWithMissingResidence,
                residencesWithOrphanHouseholdOccupancy:
                    reverseIndex.residencesWithOrphanHouseholdOccupancy,
                residenceReverseIndexAvailable: reverseIndex.available,
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

        // Internal: mutation boundary (Commands only)
        _internal: {
            replaceHouseholds: _replaceHouseholds,
            replaceHouseholdPositions: _replaceHouseholdPositions,
            replaceHouseholdAssignments: _replaceHouseholdAssignments,

            getHouseholdRecord: _getHouseholdRecord,
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
