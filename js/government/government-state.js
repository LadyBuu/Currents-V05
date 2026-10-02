/**
 * government-state.js
 * Canonical government storage. No save, no invalidate, no notify inside primitives.
 * No industry calculations. No fabricated fallbacks.
 */
(function() {
    'use strict';

    var _initializingState = false;
    var _notifyingSubscribers = false;

    function _getCurrentYear() {
        return window.getCurrentYearSafe();
    }

    function _generateId(prefix) {
        return window.generateId(prefix);
    }

    // ---- State ---------------------------------------------------------------

    var _state = {
        governmentDepartments: [],
        governmentTypes: [],
        governmentHistory: [],
        cache: {
            departmentsByLocation: new Map(),
            departmentsByParent: new Map(),
            positionsByDepartment: new Map(),
            assignmentsByDepartment: new Map(),
            assignmentsByPosition: new Map(),
            assignmentsByCharacter: new Map()
        },
        subscribers: [],
        uiState: {
            selectedDepartmentId: null,
            selectedPositionId: null,
            selectedLocationId: null,
            viewMode: 'list',
            expandedDepartments: new Set(),
            filters: { searchTerm: '', locationFilter: 'all', statusFilter: 'all' }
        },
        initialized: false,
        version: 1
    };

    // ---- Hydration -----------------------------------------------------------

    function _hydrateRecord(dept) {
        if (!dept.positions) dept.positions = [];
        if (!dept.assignments) dept.assignments = [];
        for (var i = 0; i < dept.positions.length; i++) {
            var p = dept.positions[i];
            if (p.salaryOverrides === undefined) p.salaryOverrides = [];
        }
    }

    function _initializeState() {
        if (_initializingState) return;
        _initializingState = true;
        try {
            if (_state.initialized) return;

            if (!window.masterData || !window.masterData.data) {
                throw new Error('government-state.js: masterData not available');
            }
            var d = window.masterData.data;
            _state.governmentDepartments = d.governmentDepartments || [];
            _state.governmentTypes = d.governmentTypes || [];
            _state.governmentHistory = d.governmentHistory || [];

            for (var i = 0; i < _state.governmentDepartments.length; i++) {
                _hydrateRecord(_state.governmentDepartments[i]);
            }

            _rebuildCaches();
            _state.initialized = true;
            _notifySubscribers('initialized', null);
        } finally {
            _initializingState = false;
        }
    }

    // ---- Cache ---------------------------------------------------------------

    function _rebuildCaches() {
        var departments = _state.governmentDepartments;
        var c = _state.cache;
        c.departmentsByLocation.clear();
        c.departmentsByParent.clear();
        c.positionsByDepartment.clear();
        c.assignmentsByDepartment.clear();
        c.assignmentsByPosition.clear();
        c.assignmentsByCharacter.clear();

        for (var i = 0; i < departments.length; i++) {
            var dept = departments[i];
            if (dept.locationId) {
                if (!c.departmentsByLocation.has(dept.locationId)) c.departmentsByLocation.set(dept.locationId, []);
                c.departmentsByLocation.get(dept.locationId).push(dept);
            }
            if (dept.parentDepartmentId) {
                if (!c.departmentsByParent.has(dept.parentDepartmentId)) c.departmentsByParent.set(dept.parentDepartmentId, []);
                c.departmentsByParent.get(dept.parentDepartmentId).push(dept);
            }
            c.positionsByDepartment.set(dept.id, dept.positions || []);
            c.assignmentsByDepartment.set(dept.id, dept.assignments || []);

            var assigns = dept.assignments || [];
            for (var j = 0; j < assigns.length; j++) {
                var a = assigns[j];
                if (a.positionId) {
                    var pk = dept.id + '_' + a.positionId;
                    if (!c.assignmentsByPosition.has(pk)) c.assignmentsByPosition.set(pk, []);
                    c.assignmentsByPosition.get(pk).push(a);
                }
                if (a.characterId) {
                    if (!c.assignmentsByCharacter.has(a.characterId)) c.assignmentsByCharacter.set(a.characterId, []);
                    c.assignmentsByCharacter.get(a.characterId).push(a);
                }
            }
        }
    }

    function invalidateCache() {
        _rebuildCaches();
        _notifySubscribers('cacheInvalidated', null);
    }

    function refreshFromMasterData() {
        _state.initialized = false;
        _initializeState();
        invalidateCache();
    }

    // ---- Internal record accessors (for Commands/Queries) -------------------

    function _getDepartmentRecord(id) {
        if (!id) return null;
        for (var i = 0; i < _state.governmentDepartments.length; i++) {
            if (_state.governmentDepartments[i].id === id) return _state.governmentDepartments[i];
        }
        return null;
    }

    function _getAllDepartmentRecords() {
        return _state.governmentDepartments;
    }

    function _getDepartmentRecordsByLocation(locationId) {
        return _state.cache.departmentsByLocation.get(locationId) || [];
    }

    function _getDepartmentRecordsByParent(parentId) {
        return _state.cache.departmentsByParent.get(parentId) || [];
    }

    function _getPositionRecord(departmentId, positionId) {
        var positions = _state.cache.positionsByDepartment.get(departmentId) || [];
        for (var i = 0; i < positions.length; i++) {
            if (positions[i].id === positionId) return positions[i];
        }
        return null;
    }

    function _getPositionRecords(departmentId) {
        return _state.cache.positionsByDepartment.get(departmentId) || [];
    }

    function _getAssignmentRecords(departmentId, activeOnly) {
        var all = _state.cache.assignmentsByDepartment.get(departmentId) || [];
        if (!activeOnly) return all;
        return all.filter(function(a) { return a.endYear === null || a.endYear === undefined; });
    }

    function _getAssignmentRecordsForPosition(departmentId, positionId, activeOnly) {
        var all = _state.cache.assignmentsByPosition.get(departmentId + '_' + positionId) || [];
        if (!activeOnly) return all;
        return all.filter(function(a) { return a.endYear === null || a.endYear === undefined; });
    }

    function _getAssignmentRecordsForCharacter(characterId, activeOnly) {
        var all = _state.cache.assignmentsByCharacter.get(characterId) || [];
        if (!activeOnly) return all;
        return all.filter(function(a) { return a.endYear === null || a.endYear === undefined; });
    }

    function _getAssignmentRecord(departmentId, assignmentId) {
        var all = _state.cache.assignmentsByDepartment.get(departmentId) || [];
        for (var i = 0; i < all.length; i++) {
            if (all[i].id === assignmentId) return all[i];
        }
        return null;
    }

    function _getGovernmentTypeRecord(typeId) {
        for (var i = 0; i < _state.governmentTypes.length; i++) {
            if (_state.governmentTypes[i].id === typeId) return _state.governmentTypes[i];
        }
        return null;
    }

    function _getAllGovernmentTypeRecords() {
        return _state.governmentTypes;
    }

    function _getGovernmentHistoryRecords(locationId) {
        if (!locationId) return _state.governmentHistory;
        return _state.governmentHistory.filter(function(h) { return h.locationId === locationId; });
    }

    // ---- Mutation primitives (transaction-neutral) --------------------------

    function _addDepartmentRecord(department) {
        if (!department.positions) department.positions = [];
        if (!department.assignments) department.assignments = [];
        _state.governmentDepartments.push(department);
        return department;
    }

    function _updateDepartmentRecord(departmentId, updates) {
        var dept = _getDepartmentRecord(departmentId);
        if (!dept) return null;
        var allowed = ['name', 'description', 'locationId', 'parentDepartmentId', 'isDeprecated'];
        for (var i = 0; i < allowed.length; i++) {
            var k = allowed[i];
            if (updates[k] !== undefined) dept[k] = updates[k];
        }
        dept.updatedAt = _getCurrentYear();
        return dept;
    }

    function _deleteDepartmentRecord(departmentId) {
        for (var i = 0; i < _state.governmentDepartments.length; i++) {
            if (_state.governmentDepartments[i].id === departmentId) {
                _state.governmentDepartments.splice(i, 1);
                return true;
            }
        }
        return false;
    }

    function _addPositionRecord(departmentId, position) {
        var dept = _getDepartmentRecord(departmentId);
        if (!dept) return null;
        if (!dept.positions) dept.positions = [];
        dept.positions.push(position);
        return position;
    }

    function _updatePositionRecord(departmentId, positionId, updates) {
        var pos = _getPositionRecord(departmentId, positionId);
        if (!pos) return null;
        var allowed = ['name', 'description', 'priority', 'parentPositionId',
                       'requiredRoleId', 'minSkillLevel', 'genderRestriction',
                       'requiredRankId', 'minExperience'];
        for (var i = 0; i < allowed.length; i++) {
            var k = allowed[i];
            if (updates[k] !== undefined) pos[k] = updates[k];
        }
        return pos;
    }

    function _deletePositionRecord(departmentId, positionId) {
        var dept = _getDepartmentRecord(departmentId);
        if (!dept || !dept.positions) return false;
        dept.positions = dept.positions.filter(function(p) { return p.id !== positionId; });
        return true;
    }

    function _appendSalaryOverrideRecord(departmentId, positionId, override) {
        var pos = _getPositionRecord(departmentId, positionId);
        if (!pos) return null;
        if (!pos.salaryOverrides) pos.salaryOverrides = [];
        pos.salaryOverrides.push(override);
        return pos;
    }

    function _addAssignmentRecord(departmentId, assignment) {
        var dept = _getDepartmentRecord(departmentId);
        if (!dept) return null;
        if (!dept.assignments) dept.assignments = [];
        dept.assignments.push(assignment);
        return assignment;
    }

    function _updateAssignmentRecord(departmentId, assignmentId, updates) {
        var a = _getAssignmentRecord(departmentId, assignmentId);
        if (!a) return null;
        var allowed = ['endYear', 'endReason', 'notes', 'title',
                       'roleIdAtAssignment', 'skillLevelAtAssignment'];
        for (var i = 0; i < allowed.length; i++) {
            var k = allowed[i];
            if (updates[k] !== undefined) a[k] = updates[k];
        }
        return a;
    }

    function _deleteAssignmentRecord(departmentId, assignmentId) {
        var dept = _getDepartmentRecord(departmentId);
        if (!dept || !dept.assignments) return false;
        dept.assignments = dept.assignments.filter(function(a) { return a.id !== assignmentId; });
        return true;
    }

    function _addGovernmentTypeRecord(type) {
        _state.governmentTypes.push(type);
        if (window.masterData && window.masterData.data) {
            if (!window.masterData.data.governmentTypes) window.masterData.data.governmentTypes = [];
            window.masterData.data.governmentTypes.push(type);
        }
        return type;
    }

    function _updateGovernmentTypeRecord(typeId, updates) {
        var t = _getGovernmentTypeRecord(typeId);
        if (!t) return null;
        if (updates.name !== undefined) t.name = updates.name;
        if (updates.description !== undefined) t.description = updates.description;
        if (updates.allowedRankIds !== undefined) t.allowedRankIds = updates.allowedRankIds;
        if (updates.icon !== undefined) t.icon = updates.icon;
        return t;
    }

    function _deleteGovernmentTypeRecord(typeId) {
        for (var i = 0; i < _state.governmentTypes.length; i++) {
            if (_state.governmentTypes[i].id === typeId) {
                _state.governmentTypes.splice(i, 1);
                if (window.masterData && window.masterData.data && window.masterData.data.governmentTypes) {
                    window.masterData.data.governmentTypes =
                        window.masterData.data.governmentTypes.filter(function(t) { return t.id !== typeId; });
                }
                return true;
            }
        }
        return false;
    }

    // ---- UI state ------------------------------------------------------------

    function getUIState() {
        return {
            selectedDepartmentId: _state.uiState.selectedDepartmentId,
            selectedPositionId: _state.uiState.selectedPositionId,
            selectedLocationId: _state.uiState.selectedLocationId,
            viewMode: _state.uiState.viewMode,
            expandedDepartments: new Set(_state.uiState.expandedDepartments),
            filters: {
                searchTerm: _state.uiState.filters.searchTerm,
                locationFilter: _state.uiState.filters.locationFilter,
                statusFilter: _state.uiState.filters.statusFilter
            }
        };
    }

    function setUIState(key, value, options) {
        options = options || {};
        _state.uiState[key] = value;
        if (options.notify !== false) _notifySubscribers('uiStateChanged', { key: key, value: value });
    }

    function updateUIState(updates, options) {
        options = options || {};
        for (var k in updates) {
            if (Object.prototype.hasOwnProperty.call(updates, k)) _state.uiState[k] = updates[k];
        }
        if (options.notify !== false) _notifySubscribers('uiStateChanged', updates);
    }

    // ---- Subscriptions -------------------------------------------------------

    function subscribe(callback) {
        if (typeof callback !== 'function') return null;
        _state.subscribers.push(callback);
        return function() {
            var i = _state.subscribers.indexOf(callback);
            if (i !== -1) _state.subscribers.splice(i, 1);
        };
    }

    function _notifySubscribers(event, data) {
        if (_notifyingSubscribers) {
            console.warn('government-state: nested notify suppressed', event);
            return;
        }
        _notifyingSubscribers = true;
        try {
            var subs = _state.subscribers.slice();
            for (var i = 0; i < subs.length; i++) {
                try { subs[i]({ type: event, data: data }); }
                catch (e) { console.error('government-state subscriber error', event, e); }
            }
        } finally {
            _notifyingSubscribers = false;
        }
    }

    // ---- Export --------------------------------------------------------------

    _initializeState();

    window.GovernmentState = {
        // Record access (internal use by Queries/Commands)
        _getDepartmentRecord: _getDepartmentRecord,
        _getAllDepartmentRecords: _getAllDepartmentRecords,
        _getDepartmentRecordsByLocation: _getDepartmentRecordsByLocation,
        _getDepartmentRecordsByParent: _getDepartmentRecordsByParent,
        _getPositionRecord: _getPositionRecord,
        _getPositionRecords: _getPositionRecords,
        _getAssignmentRecords: _getAssignmentRecords,
        _getAssignmentRecordsForPosition: _getAssignmentRecordsForPosition,
        _getAssignmentRecordsForCharacter: _getAssignmentRecordsForCharacter,
        _getAssignmentRecord: _getAssignmentRecord,
        _getGovernmentTypeRecord: _getGovernmentTypeRecord,
        _getAllGovernmentTypeRecords: _getAllGovernmentTypeRecords,
        _getGovernmentHistoryRecords: _getGovernmentHistoryRecords,

        // Mutation primitives (transaction-neutral; Commands own save/invalidate/notify)
        _addDepartmentRecord: _addDepartmentRecord,
        _updateDepartmentRecord: _updateDepartmentRecord,
        _deleteDepartmentRecord: _deleteDepartmentRecord,
        _addPositionRecord: _addPositionRecord,
        _updatePositionRecord: _updatePositionRecord,
        _deletePositionRecord: _deletePositionRecord,
        _appendSalaryOverrideRecord: _appendSalaryOverrideRecord,
        _addAssignmentRecord: _addAssignmentRecord,
        _updateAssignmentRecord: _updateAssignmentRecord,
        _deleteAssignmentRecord: _deleteAssignmentRecord,
        _addGovernmentTypeRecord: _addGovernmentTypeRecord,
        _updateGovernmentTypeRecord: _updateGovernmentTypeRecord,
        _deleteGovernmentTypeRecord: _deleteGovernmentTypeRecord,

        // UI state
        getUIState: getUIState,
        setUIState: setUIState,
        updateUIState: updateUIState,

        // Lifecycle
        invalidateCache: invalidateCache,
        refreshFromMasterData: refreshFromMasterData,
        subscribe: subscribe,
        _initialize: _initializeState
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.GovernmentState;
    }
})();
