/**
 * =============================================================================
 * STILL WATERS - HOUSEHOLD STATE (household-state.js)
 * =============================================================================
 *
 * LOCATION: js/systems/household/household-state.js
 *
 * PURPOSE
 * -------
 * Canonical runtime storage for household data. This module owns:
 *
 *   - The in-memory household / position / assignment arrays
 *   - Indexes (byId, byLocation, byStatus, byMember, byHead)
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
 *   - Domain policy/rules      → household-rules.js (future)
 *   - Persistence              → HouseholdCommands.persist()
 *   - Presentation/toasts      → UI layer
 *   - Enterprise ownership     → IndustryCommands (canonical)
 *   - Residence association    → ResidenceCommands + HouseholdCommands
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
 * DEPRECATED ALIASES (removed in next cycle)
 * ------------------------------------------
 *   HouseholdState._internal.getXCanonical(id)  → getXRecord(id)
 *   HouseholdState._internal.replaceX(...)      → same
 *   HouseholdState._loadData()                  → hydrateFromMasterData()
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
            throw new Error('HouseholdState: masterData is required');
        }
        if (!window.masterData.data) {
            throw new Error('HouseholdState: masterData.data is required');
        }
        return window.masterData;
    }

    // saveMasterData is no longer required by this module. persist() lives
    // in HouseholdCommands. We do not verify it here. If a caller wants to
    // ensure persistence is wired, HouseholdBootstrap verifies it.

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
            byMember: new Map(),
            byHead: new Map()
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
        // Not a domain-operation lock.
        _processingState: false,

        // Dirty flag — set by _replace* and by markDirty(). Cleared by
        // clearDirty() (typically after persist() succeeds). State does
        // not save; the flag is advisory.
        _dirty: false,

        // Last hydrate error, if any. Preserved so diagnostics can see
        // what broke without re-running hydrate.
        _lastError: null,

        version: 4,
        timestamp: Date.now()
    };

    // =========================================================================
    // 3. HYDRATION (schema shape only, plus integrity)
    // =========================================================================

    /**
     * Ensures structural shape only.
     * Does NOT default domain facts.
     *
     * Missing domain fields are a migration problem, not a runtime problem
     * this module should silently paper over. Arrays/objects are created
     * empty because empty is a legitimate value for those shapes.
     */
    function _ensureHouseholdShape(h) {
        if (!h || typeof h !== 'object') return;

        // Arrays — empty is a legitimate value
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

        // Objects — empty object is a legitimate value
        if (!h.economy || typeof h.economy !== 'object')     h.economy = {};
        if (!h.resources || typeof h.resources !== 'object') h.resources = {};

        // NOTE: We do NOT default:
        //   h.status, h.reputation, h.wealth, h.debt, h.powerScore,
        //   h.foundedYear, h.createdAt, h.updatedAt, h.notes
        //
        // Those are domain facts. Missing means the persisted data is
        // incomplete, which is a migration problem, not a runtime problem.
    }

    function _ensurePositionShape(p) {
        if (!p || typeof p !== 'object') return;
        // Positions have no array fields in the current schema. No-op.
    }

    function _ensureAssignmentShape(a) {
        if (!a || typeof a !== 'object') return;
        // Assignments have no array fields in the current schema. No-op.
    }

    function _detectDuplicates(records, idField, label) {
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
        return { label: label, duplicates: duplicates, count: records.length };
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

            // Integrity: duplicate IDs are an unrecoverable state.
            var hCheck = _detectDuplicates(households, 'id', 'households');
            if (hCheck.duplicates.length > 0) {
                throw new Error(
                    'HouseholdState.hydrateFromMasterData: duplicate household ids: ' +
                    JSON.stringify(hCheck.duplicates.slice(0, 5))
                );
            }
            var pCheck = _detectDuplicates(positions, 'id', 'householdPositions');
            if (pCheck.duplicates.length > 0) {
                throw new Error(
                    'HouseholdState.hydrateFromMasterData: duplicate position ids: ' +
                    JSON.stringify(pCheck.duplicates.slice(0, 5))
                );
            }
            var aCheck = _detectDuplicates(assignments, 'id', 'householdAssignments');
            if (aCheck.duplicates.length > 0) {
                throw new Error(
                    'HouseholdState.hydrateFromMasterData: duplicate assignment ids: ' +
                    JSON.stringify(aCheck.duplicates.slice(0, 5))
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

    // Deprecated alias — kept for one cycle so existing callers do not break.
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
        cache.byHead.clear();

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
                var headsSeen = 0;
                for (var j = 0; j < h.members.length; j++) {
                    var member = h.members[j];
                    if (!member || !member.characterId) continue;

                    if (!cache.byMember.has(member.characterId)) {
                        cache.byMember.set(member.characterId, []);
                    }
                    cache.byMember.get(member.characterId).push(h.id);

                    if (member.isHead) {
                        headsSeen++;
                        cache.byHead.set(h.id, member.characterId);
                    }
                }

                // Invariant: at most one head per household.
                // If data violates this, repairMemberships() will resolve it.
                // The cache layer does not throw on this — it is a data
                // integrity signal for HouseholdRules / repair tooling.
                if (headsSeen > 1) {
                    // Intentionally silent.
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
                    console.warn('HouseholdState.markDirty: window.markDataDirty threw', e);
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

    /**
     * In-process event channel. Every mutation primitive and every command
     * commit calls this. Subscribers receive:
     *   { type: eventType, detail: payload, timestamp: ms }
     *
     * Existing subscribers that switch on `event.type` continue to work.
     */
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

            if (key === 'filters' && typeof updates[key] === 'object' && updates[key] !== null) {
                for (var filterKey in updates[key]) {
                    if (!Object.prototype.hasOwnProperty.call(updates[key], filterKey)) continue;
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
    //
    // Only HouseholdCommands should call the replace* primitives.
    //
    // These primitives do NOT save. They:
    //   - assign the new array
    //   - mirror into masterData.data (so subsequent hydrates see it)
    //   - rebuild caches (households only)
    //   - markDirty
    //   - publish
    //
    // The caller is responsible for calling HouseholdCommands.persist()
    // when the batch is complete.
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
    //
    // WARNING: These return LIVE canonical objects.
    //
    // Only HouseholdCommands should MUTATE results.
    // Only HouseholdCommands / HouseholdQueries should CALL these.
    // Everything else (UI, other domains) must use HouseholdQueries.
    // =============================================================================

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
            return { success: false, reason: e && e.message ? e.message : 'refresh failed' };
        }
    }

    // =========================================================================
    // 11. DIAGNOSTICS
    // =========================================================================

    var _diagnostics = {
        getHouseholdCount: function() { return _state.households.length; },
        getPositionCount: function() { return _state.householdPositions.length; },
        getAssignmentCount: function() { return _state.householdAssignments.length; },
        getSubscriberCount: function() { return _state.subscribers.length; },
        getVersion: function() { return _state.version; },
        isDirty: function() { return _state._dirty === true; },
        getLastError: function() { return _state._lastError; },

        /**
         * Non-throwing integrity report. Safe to call at any time, including
         * during startup when the canonical array may still be corrupted.
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

            var hCheck = _detectDuplicates(households, 'id', 'households');
            var pCheck = _detectDuplicates(positions, 'id', 'householdPositions');
            var aCheck = _detectDuplicates(assignments, 'id', 'householdAssignments');

            var duplicateHouseholdHeads = [];
            for (var i = 0; i < households.length; i++) {
                var h = households[i];
                if (!Array.isArray(h.members)) continue;
                var headCount = 0;
                for (var j = 0; j < h.members.length; j++) {
                    if (h.members[j].isHead) headCount++;
                }
                if (headCount > 1) {
                    duplicateHouseholdHeads.push({ id: h.id, headCount: headCount });
                }
            }

            return {
                ok: hCheck.duplicates.length === 0 &&
                    pCheck.duplicates.length === 0 &&
                    aCheck.duplicates.length === 0,
                duplicates: {
                    households: hCheck.duplicates,
                    positions: pCheck.duplicates,
                    assignments: aCheck.duplicates
                },
                duplicateHouseholdHeads: duplicateHouseholdHeads,
                counts: {
                    households: hCheck.count,
                    positions: pCheck.count,
                    assignments: aCheck.count
                }
            };
        }
    };

    // =========================================================================
    // 12. EXPORTS
    // =========================================================================

    var HouseholdState = {
        // ---- Public: lifecycle ----
        subscribe: subscribe,
        invalidateCache: invalidateCache,
        refresh: refresh,
        hydrateFromMasterData: hydrateFromMasterData,

        // ---- Public: dirty flag ----
        markDirty: markDirty,
        hasDirty: hasDirty,
        clearDirty: clearDirty,

        // ---- Public: in-process event channel ----
        publish: publish,

        // ---- Public: UI ephemeral state ----
        getUIState: getUIState,
        setUIState: setUIState,
        updateUIState: updateUIState,

        // ---- Internal: mutation boundary (Commands only) ----
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

        // ---- Internal: introspection for repair/diagnostics ----
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
                    console.error('HouseholdState: hydrate on masterDataUpdated failed', e);
                }
            }
        });
    }

})();
