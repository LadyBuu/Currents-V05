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
 *   - Loading and hydration from masterData (schema-shape only)
 *   - Ephemeral UI state (selection, filters, view mode)
 *   - Subscription broadcast
 * 
 * EXPLICITLY NOT OWNED BY THIS MODULE
 * -----------------------------------
 *   - Semantic reads           → HouseholdQueries
 *   - Domain mutations         → HouseholdCommands
 *   - Domain policy/rules      → HouseholdRules
 *   - Presentation/toasts      → UI layer
 *   - Enterprise ownership     → IndustryCommands (canonical)
 *   - Residence association    → ResidenceCommands + HouseholdCommands
 * 
 * PUBLIC API SURFACE
 * ------------------
 * The public surface of this module is intentionally tiny:
 * 
 *   HouseholdState.subscribe(cb)
 *   HouseholdState.invalidateCache()
 *   HouseholdState.refresh()
 *   HouseholdState.getUIState()
 *   HouseholdState.setUIState(key, value)
 *   HouseholdState.updateUIState(updates)
 * 
 * All canonical record access is exposed under HouseholdState._internal and is
 * only intended for HouseholdCommands and HouseholdQueries. UI and other
 * consumers must go through HouseholdQueries / HouseholdCommands.
 * 
 * HYDRATION POLICY
 * ----------------
 * _loadHouseholds() ensures structural shape (arrays/objects exist).
 * It does NOT invent domain facts. It does NOT default:
 * 
 *   status        (missing status is a bug, not 'active')
 *   reputation    (missing reputation is a bug, not 10)
 *   wealth        (missing wealth is a bug, not 0)
 *   foundedYear   (missing foundedYear is a bug, not currentYear)
 *   nameHistory   (empty is fine, but do not synthesize entries)
 * 
 * If persisted data is missing required domain fields, that is a migration
 * problem, not a runtime problem this module should silently paper over.
 * 
 * RECURSION GUARD
 * ---------------
 * _state._processingState protects internal load/rebuild reentrancy only.
 * It is NOT a domain-operation lock. It is NOT exposed publicly.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. STATE DEFINITION
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

        // Internal reentrancy guard for load/rebuild only.
        // Not a domain-operation lock.
        _processingState: false,

        version: 3,
        timestamp: Date.now()
    };

    // =========================================================================
    // 2. DEPENDENCY ACCESS
    // =========================================================================

    function _getMasterData() {
        if (typeof window.masterData === 'undefined') {
            throw new Error('HouseholdState: masterData is required');
        }
        return window.masterData;
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData !== 'function') {
            throw new Error('HouseholdState: saveMasterData() is required');
        }
        window.saveMasterData();
    }

    // =========================================================================
    // 3. DATA LOADING (schema shape only)
    // =========================================================================

    /**
     * Ensures structural shape only.
     * Does NOT default domain facts.
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

    function _loadHouseholds() {
        var master = _getMasterData();
        if (!master.data) {
            throw new Error('HouseholdState: masterData.data is required');
        }
        if (!Array.isArray(master.data.households)) {
            master.data.households = [];
        }
        for (var i = 0; i < master.data.households.length; i++) {
            _ensureHouseholdShape(master.data.households[i]);
        }
        return master.data.households;
    }

    function _loadHouseholdPositions() {
        var master = _getMasterData();
        if (!master.data) {
            throw new Error('HouseholdState: masterData.data is required');
        }
        if (!Array.isArray(master.data.householdPositions)) {
            master.data.householdPositions = [];
        }
        return master.data.householdPositions;
    }

    function _loadHouseholdAssignments() {
        var master = _getMasterData();
        if (!master.data) {
            throw new Error('HouseholdState: masterData.data is required');
        }
        if (!Array.isArray(master.data.householdAssignments)) {
            master.data.householdAssignments = [];
        }
        return master.data.householdAssignments;
    }

    function _loadData() {
        if (_state._processingState) return;
        _state._processingState = true;
        try {
            _state.households = _loadHouseholds();
            _state.householdPositions = _loadHouseholdPositions();
            _state.householdAssignments = _loadHouseholdAssignments();
            _rebuildCaches();
        } finally {
            _state._processingState = false;
        }
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
                // If data violates this, keep the last (matching legacy
                // behavior) but do not crash. Callers of getHead() should
                // tolerate a household with zero heads.
                if (headsSeen > 1) {
                    // Intentionally silent here — this is a data integrity
                    // signal for HouseholdRules / repair tooling, not for
                    // the cache layer to resolve.
                }
            }
        }
    }

    function invalidateCache() {
        if (_state._processingState) return;
        _state._processingState = true;
        try {
            _rebuildCaches();
            _notifySubscribers({ type: 'cacheInvalidated' });
        } finally {
            _state._processingState = false;
        }
    }

    // =========================================================================
    // 5. SUBSCRIPTION MANAGEMENT
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

    // =========================================================================
    // 6. UI STATE (ephemeral, defensive on read)
    // =========================================================================

    function getUIState() {
        var filters = _state.uiState.filters;
        var expanded = _state.uiState.expandedHouseholds;

        // Defensive snapshot so callers cannot mutate internal UI state
        // without going through setUIState / updateUIState.
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
            _notifySubscribers({ type: 'uiStateChange', key: key, value: value });
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
            _notifySubscribers({ type: 'uiStateChange', updates: updates });
        }
        return changed;
    }

    // =========================================================================
    // 7. INTERNAL MUTATION BOUNDARY
    // =========================================================================
    //
    // Only HouseholdCommands should call these.
    // Only HouseholdCommands / HouseholdQueries should call the accessors
    // in section 8.
    //
    // These are the single seam where canonical data is replaced.
    // Persistence and notification happen here once per replacement.
    // =========================================================================

    function _replaceHouseholds(households) {
        _state.households = households;
        var master = _getMasterData();
        if (master.data) {
            master.data.households = households;
        }
        _rebuildCaches();
        _saveMasterData();
        _notifySubscribers({ type: 'householdsReplaced' });
    }

    function _replaceHouseholdPositions(positions) {
        _state.householdPositions = positions;
        var master = _getMasterData();
        if (master.data) {
            master.data.householdPositions = positions;
        }
        _saveMasterData();
        _notifySubscribers({ type: 'positionsReplaced' });
    }

    function _replaceHouseholdAssignments(assignments) {
        _state.householdAssignments = assignments;
        var master = _getMasterData();
        if (master.data) {
            master.data.householdAssignments = assignments;
        }
        _saveMasterData();
        _notifySubscribers({ type: 'assignmentsReplaced' });
    }

    // =========================================================================
    // 8. INTERNAL RECORD ACCESS
    // =========================================================================
    //
    // WARNING: These return LIVE canonical objects.
    //
    // Only HouseholdCommands should MUTATE results.
    // Only HouseholdCommands / HouseholdQueries should CALL these.
    // Everything else (UI, other domains) must use HouseholdQueries.
    //
    // HouseholdQueries is responsible for returning defensive snapshots
    // to public consumers.
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

    // =========================================================================
    // 9. LIFECYCLE
    // =========================================================================

    function refresh() {
        _loadData();
        _notifySubscribers({ type: 'refreshed' });
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    var HouseholdState = {
        // ---- Public: lifecycle ----
        subscribe: subscribe,
        invalidateCache: invalidateCache,
        refresh: refresh,

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
            getAllAssignmentRecords: _getAllAssignmentRecords
        },

        // ---- Internal: introspection for repair/diagnostics ----
        _diagnostics: {
            getHouseholdCount: function() { return _state.households.length; },
            getPositionCount: function() { return _state.householdPositions.length; },
            getAssignmentCount: function() { return _state.householdAssignments.length; },
            getSubscriberCount: function() { return _state.subscribers.length; },
            getVersion: function() { return _state.version; }
        }
    };

    window.HouseholdState = HouseholdState;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = HouseholdState;
    }

    // =========================================================================
    // 11. AUTO-LOAD
    // =========================================================================

    _loadData();

    if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('masterDataUpdated', function() {
            _loadData();
        });
    }

})();
