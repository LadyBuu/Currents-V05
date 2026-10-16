/**
 * government-state.js
 * Canonical government storage. Indexes, hydration, subscriptions, UI state.
 *
 * Contract:
 *   - Canonical arrays live on masterData.data.*. State does not own them.
 *   - hydrateFromMasterData() rebuilds indexes from canonical.
 *   - Public reads return clones. _getXCanonical returns live records and is
 *     reserved for GovernmentCommands (and Rules operating during a command).
 *   - Mutation primitives call window.markDataDirty. They never save, never
 *     invalidate, never dispatch CustomEvents. Commands own the commit tail.
 *   - No fabricated fallbacks. No inline numbers. No domain logic.
 */
(function() {
    'use strict';

    var C = window.GovernmentConstants;

    if (!C) throw new Error('government-state.js requires GovernmentConstants');
    if (typeof window.generateId !== 'function') throw new Error('government-state.js requires generateId');
    if (typeof window.getCurrentYearSafe !== 'function') throw new Error('government-state.js requires getCurrentYearSafe');
    if (typeof window.markDataDirty !== 'function') throw new Error('government-state.js requires markDataDirty');

    // ---- Internal state ------------------------------------------------------

    var _initializing = false;
    var _notifying = false;

    var _state = {
        initialized: false,
        version: 1,

        // Indexes
        departmentsById: new Map(),
        departmentsByLocation: new Map(),
        departmentsByParent: new Map(),
        positionsByDepartment: new Map(),
        positionsById: new Map(),           // global position index
        assignmentsByDepartment: new Map(),
        assignmentsByPosition: new Map(),
        assignmentsByCharacter: new Map(),
        assignmentsById: new Map(),          // global assignment index
        governmentTypesById: new Map(),

        // UI state (ephemeral; not persisted)
        uiState: {
            selectedDepartmentId: null,
            selectedPositionId: null,
            selectedLocationId: null,
            viewMode: 'list',
            expandedDepartments: new Set(),
            filters: {
                searchTerm: '',
                locationFilter: 'all',
                statusFilter: 'all'
            }
        },

        subscribers: []
    };

    // ---- Helpers -------------------------------------------------------------

    function _clone(obj) {
        if (obj == null) return obj;
        if (Array.isArray(obj)) {
            var arr = new Array(obj.length);
            for (var i = 0; i < obj.length; i++) arr[i] = _clone(obj[i]);
            return arr;
        }
        if (typeof obj === 'object') {
            var out = {};
            for (var k in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = _clone(obj[k]);
            }
            return out;
        }
        return obj;
    }

    function _now() { return window.getCurrentYearSafe(); }

    function _isActiveAssignment(a) {
        return a.endYear === null || a.endYear === undefined;
    }

    function _assertCanonical() {
        if (!window.masterData || !window.masterData.data) {
            throw new Error('government-state.js: masterData.data not available');
        }
        var d = window.masterData.data;
        if (d.governmentDepartments && !Array.isArray(d.governmentDepartments)) {
            throw new Error('government-state.js: governmentDepartments must be an array');
        }
        if (d.governmentTypes && !Array.isArray(d.governmentTypes)) {
            throw new Error('government-state.js: governmentTypes must be an array');
        }
        if (d.governmentHistory && !Array.isArray(d.governmentHistory)) {
            throw new Error('government-state.js: governmentHistory must be an array');
        }
    }

    function _ensureCanonicalArrays() {
        var d = window.masterData.data;
        if (!Array.isArray(d.governmentDepartments)) d.governmentDepartments = [];
        if (!Array.isArray(d.governmentTypes)) d.governmentTypes = [];
        if (!Array.isArray(d.governmentHistory)) d.governmentHistory = [];
    }

    function _hydrateDepartment(dept, seenDeptIds) {
        if (!dept) return;
        if (!dept.id) {
            throw new Error('government-state.js: department record missing id');
        }
        if (seenDeptIds.has(dept.id)) {
            throw new Error('government-state.js: duplicate department id: ' + dept.id);
        }
        seenDeptIds.add(dept.id);

        if (!Array.isArray(dept.positions)) dept.positions = [];
        if (!Array.isArray(dept.assignments)) dept.assignments = [];

        for (var p = 0; p < dept.positions.length; p++) {
            var pos = dept.positions[p];
            if (!pos.id) throw new Error('government-state.js: position missing id in dept ' + dept.id);
            if (pos.salaryOverrides === undefined) pos.salaryOverrides = [];
        }
        for (var a = 0; a < dept.assignments.length; a++) {
            var asg = dept.assignments[a];
            if (!asg.id) throw new Error('government-state.js: assignment missing id in dept ' + dept.id);
        }
    }

    // ---- Hydration -----------------------------------------------------------

    function hydrateFromMasterData() {
        if (_initializing) return;
        _initializing = true;
        try {
            _assertCanonical();
            _ensureCanonicalArrays();

            var d = window.masterData.data;
            var departments = d.governmentDepartments;
            var types = d.governmentTypes;

            // Reset indexes
            _state.departmentsById.clear();
            _state.departmentsByLocation.clear();
            _state.departmentsByParent.clear();
            _state.positionsByDepartment.clear();
            _state.positionsById.clear();
            _state.assignmentsByDepartment.clear();
            _state.assignmentsByPosition.clear();
            _state.assignmentsByCharacter.clear();
            _state.assignmentsById.clear();
            _state.governmentTypesById.clear();

            var seenDeptIds = new Set();

            for (var i = 0; i < departments.length; i++) {
                var dept = departments[i];
                _hydrateDepartment(dept, seenDeptIds);

                _state.departmentsById.set(dept.id, dept);

                if (dept.locationId) {
                    if (!_state.departmentsByLocation.has(dept.locationId)) {
                        _state.departmentsByLocation.set(dept.locationId, []);
                    }
                    _state.departmentsByLocation.get(dept.locationId).push(dept);
                }
                if (dept.parentDepartmentId) {
                    if (!_state.departmentsByParent.has(dept.parentDepartmentId)) {
                        _state.departmentsByParent.set(dept.parentDepartmentId, []);
                    }
                    _state.departmentsByParent.get(dept.parentDepartmentId).push(dept);
                }

                _state.positionsByDepartment.set(dept.id, dept.positions);
                _state.assignmentsByDepartment.set(dept.id, dept.assignments);

                for (var p = 0; p < dept.positions.length; p++) {
                    var pos = dept.positions[p];
                    if (_state.positionsById.has(pos.id)) {
                        throw new Error('government-state.js: duplicate position id: ' + pos.id);
                    }
                    _state.positionsById.set(pos.id, { deptId: dept.id, position: pos });
                }

                for (var a = 0; a < dept.assignments.length; a++) {
                    var asg = dept.assignments[a];
                    if (_state.assignmentsById.has(asg.id)) {
                        throw new Error('government-state.js: duplicate assignment id: ' + asg.id);
                    }
                    _state.assignmentsById.set(asg.id, { deptId: dept.id, assignment: asg });

                    if (asg.positionId) {
                        var pk = dept.id + '_' + asg.positionId;
                        if (!_state.assignmentsByPosition.has(pk)) {
                            _state.assignmentsByPosition.set(pk, []);
                        }
                        _state.assignmentsByPosition.get(pk).push(asg);
                    }
                    if (asg.characterId) {
                        if (!_state.assignmentsByCharacter.has(asg.characterId)) {
                            _state.assignmentsByCharacter.set(asg.characterId, []);
                        }
                        _state.assignmentsByCharacter.get(asg.characterId).push({
                            deptId: dept.id,
                            assignment: asg
                        });
                    }
                }
            }

            for (var t = 0; t < types.length; t++) {
                var type = types[t];
                if (!type.id) throw new Error('government-state.js: government type missing id');
                if (_state.governmentTypesById.has(type.id)) {
                    throw new Error('government-state.js: duplicate government type id: ' + type.id);
                }
                _state.governmentTypesById.set(type.id, type);
            }

            _state.initialized = true;
            _publish(C.STATE_EVENTS.HYDRATED, null);
        } finally {
            _initializing = false;
        }
    }

    // ---- Public reads (clones) ----------------------------------------------

    function getDepartmentById(id) {
        if (!id) return null;
        var rec = _state.departmentsById.get(id);
        return rec ? _clone(rec) : null;
    }

    function getAllDepartments() {
        var out = [];
        _state.departmentsById.forEach(function(d) { out.push(_clone(d)); });
        return out;
    }

    function getDepartmentsByLocationId(locationId) {
        var arr = _state.departmentsByLocation.get(locationId) || [];
        var out = new Array(arr.length);
        for (var i = 0; i < arr.length; i++) out[i] = _clone(arr[i]);
        return out;
    }

    function getDepartmentsByParentId(parentId) {
        var arr = _state.departmentsByParent.get(parentId) || [];
        var out = new Array(arr.length);
        for (var i = 0; i < arr.length; i++) out[i] = _clone(arr[i]);
        return out;
    }

    function getPositionById(departmentId, positionId) {
        if (!departmentId || !positionId) return null;
        var positions = _state.positionsByDepartment.get(departmentId);
        if (!positions) return null;
        for (var i = 0; i < positions.length; i++) {
            if (positions[i].id === positionId) return _clone(positions[i]);
        }
        return null;
    }

    function getPositionsByDepartmentId(departmentId) {
        var arr = _state.positionsByDepartment.get(departmentId) || [];
        var out = new Array(arr.length);
        for (var i = 0; i < arr.length; i++) out[i] = _clone(arr[i]);
        return out;
    }

    function getAssignmentById(departmentId, assignmentId) {
        if (!departmentId || !assignmentId) return null;
        var arr = _state.assignmentsByDepartment.get(departmentId);
        if (!arr) return null;
        for (var i = 0; i < arr.length; i++) {
            if (arr[i].id === assignmentId) return _clone(arr[i]);
        }
        return null;
    }

    function getAssignmentsByDepartmentId(departmentId, activeOnly) {
        var arr = _state.assignmentsByDepartment.get(departmentId) || [];
        var out = [];
        for (var i = 0; i < arr.length; i++) {
            if (activeOnly && !_isActiveAssignment(arr[i])) continue;
            out.push(_clone(arr[i]));
        }
        return out;
    }

    function getAssignmentsByPositionId(departmentId, positionId, activeOnly) {
        var arr = _state.assignmentsByPosition.get(departmentId + '_' + positionId) || [];
        var out = [];
        for (var i = 0; i < arr.length; i++) {
            if (activeOnly && !_isActiveAssignment(arr[i])) continue;
            out.push(_clone(arr[i]));
        }
        return out;
    }

    function getAssignmentsByCharacterId(characterId, activeOnly) {
        var arr = _state.assignmentsByCharacter.get(characterId) || [];
        var out = [];
        for (var i = 0; i < arr.length; i++) {
            var entry = arr[i];
            if (activeOnly && !_isActiveAssignment(entry.assignment)) continue;
            out.push({
                departmentId: entry.deptId,
                assignment: _clone(entry.assignment)
            });
        }
        return out;
    }

    function getGovernmentTypeById(typeId) {
        if (!typeId) return null;
        var t = _state.governmentTypesById.get(typeId);
        return t ? _clone(t) : null;
    }

    function getAllGovernmentTypes() {
        var out = [];
        _state.governmentTypesById.forEach(function(t) { out.push(_clone(t)); });
        return out;
    }

    function getGovernmentHistory(locationId) {
        if (!window.masterData || !window.masterData.data) return [];
        var hist = window.masterData.data.governmentHistory || [];
        if (!locationId) return _clone(hist);
        var filtered = [];
        for (var i = 0; i < hist.length; i++) {
            if (hist[i].locationId === locationId) filtered.push(hist[i]);
        }
        return _clone(filtered);
    }

    // ---- Canonical accessors (Commands + Rules during transaction) ----------
    // These return live records. Anything outside GovernmentCommands (and
    // GovernmentRules operating inside a command's call stack) must not use
    // them, and must never mutate what they return.

    function _getDepartmentCanonical(id) {
        if (!id) return null;
        return _state.departmentsById.get(id) || null;
    }

    function _getAllDepartmentsCanonical() {
        return window.masterData.data.governmentDepartments;
    }

    function _getDepartmentsByLocationCanonical(locationId) {
        return _state.departmentsByLocation.get(locationId) || [];
    }

    function _getDepartmentsByParentCanonical(parentId) {
        return _state.departmentsByParent.get(parentId) || [];
    }

    function _getPositionCanonical(departmentId, positionId) {
        var positions = _state.positionsByDepartment.get(departmentId);
        if (!positions) return null;
        for (var i = 0; i < positions.length; i++) {
            if (positions[i].id === positionId) return positions[i];
        }
        return null;
    }

    function _getPositionsCanonical(departmentId) {
        return _state.positionsByDepartment.get(departmentId) || [];
    }

    function _getAssignmentCanonical(departmentId, assignmentId) {
        var arr = _state.assignmentsByDepartment.get(departmentId);
        if (!arr) return null;
        for (var i = 0; i < arr.length; i++) {
            if (arr[i].id === assignmentId) return arr[i];
        }
        return null;
    }

    function _getAssignmentsCanonical(departmentId, activeOnly) {
        var arr = _state.assignmentsByDepartment.get(departmentId) || [];
        if (!activeOnly) return arr;
        var out = [];
        for (var i = 0; i < arr.length; i++) {
            if (_isActiveAssignment(arr[i])) out.push(arr[i]);
        }
        return out;
    }

    function _getAssignmentsForPositionCanonical(departmentId, positionId, activeOnly) {
        var arr = _state.assignmentsByPosition.get(departmentId + '_' + positionId) || [];
        if (!activeOnly) return arr;
        var out = [];
        for (var i = 0; i < arr.length; i++) {
            if (_isActiveAssignment(arr[i])) out.push(arr[i]);
        }
        return out;
    }

    function _getAssignmentsForCharacterCanonical(characterId, activeOnly) {
        var arr = _state.assignmentsByCharacter.get(characterId) || [];
        if (!activeOnly) {
            var all = new Array(arr.length);
            for (var i = 0; i < arr.length; i++) all[i] = arr[i].assignment;
            return all;
        }
        var out = [];
        for (var j = 0; j < arr.length; j++) {
            if (_isActiveAssignment(arr[j].assignment)) out.push(arr[j].assignment);
        }
        return out;
    }

    function _getGovernmentTypeCanonical(typeId) {
        if (!typeId) return null;
        return _state.governmentTypesById.get(typeId) || null;
    }

    function _getAllGovernmentTypesCanonical() {
        return window.masterData.data.governmentTypes;
    }

    function _getGovernmentHistoryCanonical() {
        return window.masterData.data.governmentHistory;
    }

    // ---- Mutation primitives -------------------------------------------------
    // Transaction-neutral. Call window.markDataDirty. Never save, never publish.

    function _markDirty() {
        window.markDataDirty();
    }

    // Departments

    function _addDepartment(dept) {
        if (!dept || !dept.id) throw new Error('government-state.js: _addDepartment requires id');
        if (!Array.isArray(dept.positions)) dept.positions = [];
        if (!Array.isArray(dept.assignments)) dept.assignments = [];

        window.masterData.data.governmentDepartments.push(dept);
        _state.departmentsById.set(dept.id, dept);
        if (dept.locationId) {
            if (!_state.departmentsByLocation.has(dept.locationId)) {
                _state.departmentsByLocation.set(dept.locationId, []);
            }
            _state.departmentsByLocation.get(dept.locationId).push(dept);
        }
        if (dept.parentDepartmentId) {
            if (!_state.departmentsByParent.has(dept.parentDepartmentId)) {
                _state.departmentsByParent.set(dept.parentDepartmentId, []);
            }
            _state.departmentsByParent.get(dept.parentDepartmentId).push(dept);
        }
        _state.positionsByDepartment.set(dept.id, dept.positions);
        _state.assignmentsByDepartment.set(dept.id, dept.assignments);

        _markDirty();
        return dept;
    }

    function _updateDepartment(id, updates, allowedFields) {
        var dept = _getDepartmentCanonical(id);
        if (!dept) return null;
        for (var i = 0; i < allowedFields.length; i++) {
            var k = allowedFields[i];
            if (updates[k] !== undefined) {
                var prev = dept[k];
                dept[k] = updates[k];
                // Keep location index consistent.
                if (k === 'locationId' && prev !== updates[k]) {
                    _reindexDepartmentLocation(dept, prev, updates[k]);
                }
                if (k === 'parentDepartmentId' && prev !== updates[k]) {
                    _reindexDepartmentParent(dept, prev, updates[k]);
                }
            }
        }
        dept.updatedAt = _now();
        _markDirty();
        return dept;
    }

    function _reindexDepartmentLocation(dept, prevLocationId, newLocationId) {
        if (prevLocationId) {
            var prevArr = _state.departmentsByLocation.get(prevLocationId);
            if (prevArr) {
                var idx = prevArr.indexOf(dept);
                if (idx !== -1) prevArr.splice(idx, 1);
                if (prevArr.length === 0) _state.departmentsByLocation.delete(prevLocationId);
            }
        }
        if (newLocationId) {
            if (!_state.departmentsByLocation.has(newLocationId)) {
                _state.departmentsByLocation.set(newLocationId, []);
            }
            _state.departmentsByLocation.get(newLocationId).push(dept);
        }
    }

    function _reindexDepartmentParent(dept, prevParentId, newParentId) {
        if (prevParentId) {
            var prevArr = _state.departmentsByParent.get(prevParentId);
            if (prevArr) {
                var idx = prevArr.indexOf(dept);
                if (idx !== -1) prevArr.splice(idx, 1);
                if (prevArr.length === 0) _state.departmentsByParent.delete(prevParentId);
            }
        }
        if (newParentId) {
            if (!_state.departmentsByParent.has(newParentId)) {
                _state.departmentsByParent.set(newParentId, []);
            }
            _state.departmentsByParent.get(newParentId).push(dept);
        }
    }

    function _removeDepartment(id) {
        var dept = _getDepartmentCanonical(id);
        if (!dept) return false;

        // Remove children indexes
        var positions = dept.positions || [];
        for (var p = 0; p < positions.length; p++) {
            _state.positionsById.delete(positions[p].id);
        }
        var assignments = dept.assignments || [];
        for (var a = 0; a < assignments.length; a++) {
            _state.assignmentsById.delete(assignments[a].id);
        }

        // Remove from top-level index
        _state.departmentsById.delete(id);

        // Remove from location index
        if (dept.locationId) {
            var locArr = _state.departmentsByLocation.get(dept.locationId);
            if (locArr) {
                var li = locArr.indexOf(dept);
                if (li !== -1) locArr.splice(li, 1);
                if (locArr.length === 0) _state.departmentsByLocation.delete(dept.locationId);
            }
        }
        // Remove from parent index
        if (dept.parentDepartmentId) {
            var parentArr = _state.departmentsByParent.get(dept.parentDepartmentId);
            if (parentArr) {
                var pi = parentArr.indexOf(dept);
                if (pi !== -1) parentArr.splice(pi, 1);
                if (parentArr.length === 0) _state.departmentsByParent.delete(dept.parentDepartmentId);
            }
        }

        _state.positionsByDepartment.delete(id);
        _state.assignmentsByDepartment.delete(id);

        // Remove from canonical array
        var arr = window.masterData.data.governmentDepartments;
        for (var i = 0; i < arr.length; i++) {
            if (arr[i].id === id) { arr.splice(i, 1); break; }
        }

        _markDirty();
        return true;
    }

    // Positions

    function _addPosition(departmentId, position) {
        var dept = _getDepartmentCanonical(departmentId);
        if (!dept) return null;
        if (!Array.isArray(dept.positions)) dept.positions = [];
        dept.positions.push(position);
        _state.positionsById.set(position.id, { deptId: departmentId, position: position });
        _markDirty();
        return position;
    }

    function _updatePosition(departmentId, positionId, updates, allowedFields) {
        var pos = _getPositionCanonical(departmentId, positionId);
        if (!pos) return null;
        for (var i = 0; i < allowedFields.length; i++) {
            var k = allowedFields[i];
            if (updates[k] !== undefined) pos[k] = updates[k];
        }
        _markDirty();
        return pos;
    }

    function _removePosition(departmentId, positionId) {
        var dept = _getDepartmentCanonical(departmentId);
        if (!dept || !Array.isArray(dept.positions)) return false;
        for (var i = 0; i < dept.positions.length; i++) {
            if (dept.positions[i].id === positionId) {
                dept.positions.splice(i, 1);
                _state.positionsById.delete(positionId);
                _markDirty();
                return true;
            }
        }
        return false;
    }

    function _appendSalaryOverride(departmentId, positionId, override) {
        var pos = _getPositionCanonical(departmentId, positionId);
        if (!pos) return null;
        if (!Array.isArray(pos.salaryOverrides)) pos.salaryOverrides = [];
        pos.salaryOverrides.push(override);
        _markDirty();
        return pos;
    }

    // Assignments

    function _addAssignment(departmentId, assignment) {
        var dept = _getDepartmentCanonical(departmentId);
        if (!dept) return null;
        if (!Array.isArray(dept.assignments)) dept.assignments = [];
        dept.assignments.push(assignment);

        _state.assignmentsById.set(assignment.id, { deptId: departmentId, assignment: assignment });

        if (assignment.positionId) {
            var pk = departmentId + '_' + assignment.positionId;
            if (!_state.assignmentsByPosition.has(pk)) {
                _state.assignmentsByPosition.set(pk, []);
            }
            _state.assignmentsByPosition.get(pk).push(assignment);
        }
        if (assignment.characterId) {
            if (!_state.assignmentsByCharacter.has(assignment.characterId)) {
                _state.assignmentsByCharacter.set(assignment.characterId, []);
            }
            _state.assignmentsByCharacter.get(assignment.characterId).push({
                deptId: departmentId,
                assignment: assignment
            });
        }

        _markDirty();
        return assignment;
    }

    function _updateAssignment(departmentId, assignmentId, updates, allowedFields) {
        var asg = _getAssignmentCanonical(departmentId, assignmentId);
        if (!asg) return null;
        for (var i = 0; i < allowedFields.length; i++) {
            var k = allowedFields[i];
            if (updates[k] !== undefined) asg[k] = updates[k];
        }
        _markDirty();
        return asg;
    }

    function _removeAssignment(departmentId, assignmentId) {
        var dept = _getDepartmentCanonical(departmentId);
        if (!dept || !Array.isArray(dept.assignments)) return false;

        var removed = null;
        for (var i = 0; i < dept.assignments.length; i++) {
            if (dept.assignments[i].id === assignmentId) {
                removed = dept.assignments[i];
                dept.assignments.splice(i, 1);
                break;
            }
        }
        if (!removed) return false;

        _state.assignmentsById.delete(assignmentId);

        if (removed.positionId) {
            var pk = departmentId + '_' + removed.positionId;
            var posArr = _state.assignmentsByPosition.get(pk);
            if (posArr) {
                var pi = posArr.indexOf(removed);
                if (pi !== -1) posArr.splice(pi, 1);
                if (posArr.length === 0) _state.assignmentsByPosition.delete(pk);
            }
        }
        if (removed.characterId) {
            var charArr = _state.assignmentsByCharacter.get(removed.characterId);
            if (charArr) {
                for (var c = 0; c < charArr.length; c++) {
                    if (charArr[c].assignment === removed) {
                        charArr.splice(c, 1);
                        break;
                    }
                }
                if (charArr.length === 0) _state.assignmentsByCharacter.delete(removed.characterId);
            }
        }

        _markDirty();
        return true;
    }

    // Government types

    function _addGovernmentType(type) {
        window.masterData.data.governmentTypes.push(type);
        _state.governmentTypesById.set(type.id, type);
        _markDirty();
        return type;
    }

    function _updateGovernmentType(typeId, updates, allowedFields) {
        var t = _getGovernmentTypeCanonical(typeId);
        if (!t) return null;
        for (var i = 0; i < allowedFields.length; i++) {
            var k = allowedFields[i];
            if (updates[k] !== undefined) t[k] = updates[k];
        }
        _markDirty();
        return t;
    }

    function _removeGovernmentType(typeId) {
        var t = _getGovernmentTypeCanonical(typeId);
        if (!t) return false;

        _state.governmentTypesById.delete(typeId);

        var arr = window.masterData.data.governmentTypes;
        for (var i = 0; i < arr.length; i++) {
            if (arr[i].id === typeId) { arr.splice(i, 1); break; }
        }

        _markDirty();
        return true;
    }

    // Government history

    function _addGovernmentHistory(record) {
        var arr = window.masterData.data.governmentHistory;
        if (!Array.isArray(arr)) {
            arr = [];
            window.masterData.data.governmentHistory = arr;
        }
        arr.push(record);
        _markDirty();
        return record;
    }

    // ---- Integrity validation (warn only) -----------------------------------

    function validateIntegrity() {
        var warnings = [];
        var d = window.masterData && window.masterData.data;
        if (!d) {
            warnings.push('masterData.data unavailable');
            return warnings;
        }

        var departments = d.governmentDepartments || [];
        var deptIds = new Set();
        for (var i = 0; i < departments.length; i++) {
            var dept = departments[i];
            if (!dept.id) { warnings.push('department missing id at index ' + i); continue; }
            if (deptIds.has(dept.id)) warnings.push('duplicate department id: ' + dept.id);
            deptIds.add(dept.id);

            if (!dept.locationId) warnings.push('department ' + dept.id + ' has no locationId');
            if (dept.parentDepartmentId && !_state.departmentsById.has(dept.parentDepartmentId)) {
                warnings.push('department ' + dept.id + ' references missing parent ' + dept.parentDepartmentId);
            }

            var positions = dept.positions || [];
            var positionIds = new Set();
            for (var p = 0; p < positions.length; p++) {
                var pos = positions[p];
                if (!pos.id) { warnings.push('position in dept ' + dept.id + ' missing id'); continue; }
                if (positionIds.has(pos.id)) warnings.push('duplicate position id in dept ' + dept.id + ': ' + pos.id);
                positionIds.add(pos.id);
                if (pos.parentPositionId && !positionIds.has(pos.parentPositionId)) {
                    // parent may be defined later; only flag dangling on final pass
                }
            }

            var assignments = dept.assignments || [];
            var assignmentIds = new Set();
            for (var a = 0; a < assignments.length; a++) {
                var asg = assignments[a];
                if (!asg.id) { warnings.push('assignment in dept ' + dept.id + ' missing id'); continue; }
                if (assignmentIds.has(asg.id)) warnings.push('duplicate assignment id in dept ' + dept.id + ': ' + asg.id);
                assignmentIds.add(asg.id);
                if (asg.positionId && !positionIds.has(asg.positionId)) {
                    warnings.push('assignment ' + asg.id + ' references missing position ' + asg.positionId);
                }
                if (asg.endYear != null && asg.startYear != null && asg.endYear < asg.startYear) {
                    warnings.push('assignment ' + asg.id + ' ends before it starts');
                }
            }
        }

        var types = d.governmentTypes || [];
        var typeIds = new Set();
        for (var t = 0; t < types.length; t++) {
            if (!types[t].id) { warnings.push('government type missing id at index ' + t); continue; }
            if (typeIds.has(types[t].id)) warnings.push('duplicate government type id: ' + types[t].id);
            typeIds.add(types[t].id);
        }

        if (typeof console !== 'undefined' && console.warn && warnings.length > 0) {
            console.warn('government-state.js: integrity warnings', warnings);
        }
        return warnings;
    }

    // ---- UI state ------------------------------------------------------------

    function getUIState() {
        var s = _state.uiState;
        return {
            selectedDepartmentId: s.selectedDepartmentId,
            selectedPositionId: s.selectedPositionId,
            selectedLocationId: s.selectedLocationId,
            viewMode: s.viewMode,
            expandedDepartments: new Set(s.expandedDepartments),
            filters: {
                searchTerm: s.filters.searchTerm,
                locationFilter: s.filters.locationFilter,
                statusFilter: s.filters.statusFilter
            }
        };
    }

    function setUIState(key, value, options) {
        options = options || {};
        _state.uiState[key] = value;
        if (options.notify !== false) _publish(C.STATE_EVENTS.UI_STATE_CHANGED, { key: key, value: value });
    }

    function updateUIState(updates, options) {
        options = options || {};
        for (var k in updates) {
            if (Object.prototype.hasOwnProperty.call(updates, k)) _state.uiState[k] = updates[k];
        }
        if (options.notify !== false) _publish(C.STATE_EVENTS.UI_STATE_CHANGED, updates);
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

    function _publish(eventType, data) {
        if (_notifying) {
            if (typeof console !== 'undefined' && console.warn) {
                console.warn('government-state.js: nested publish suppressed', eventType);
            }
            return;
        }
        _notifying = true;
        try {
            var subs = _state.subscribers.slice();
            for (var i = 0; i < subs.length; i++) {
                try { subs[i]({ type: eventType, data: data }); }
                catch (e) {
                    if (typeof console !== 'undefined' && console.error) {
                        console.error('government-state.js subscriber error', eventType, e);
                    }
                }
            }
        } finally {
            _notifying = false;
        }
    }

    // ---- Export --------------------------------------------------------------

    window.GovernmentState = {
        // Lifecycle
        hydrateFromMasterData: hydrateFromMasterData,
        validateIntegrity: validateIntegrity,

        // Public reads (clones)
        getDepartmentById: getDepartmentById,
        getAllDepartments: getAllDepartments,
        getDepartmentsByLocationId: getDepartmentsByLocationId,
        getDepartmentsByParentId: getDepartmentsByParentId,
        getPositionById: getPositionById,
        getPositionsByDepartmentId: getPositionsByDepartmentId,
        getAssignmentById: getAssignmentById,
        getAssignmentsByDepartmentId: getAssignmentsByDepartmentId,
        getAssignmentsByPositionId: getAssignmentsByPositionId,
        getAssignmentsByCharacterId: getAssignmentsByCharacterId,
        getGovernmentTypeById: getGovernmentTypeById,
        getAllGovernmentTypes: getAllGovernmentTypes,
        getGovernmentHistory: getGovernmentHistory,

        // Canonical accessors (Commands and Rules only)
        _getDepartmentCanonical: _getDepartmentCanonical,
        _getAllDepartmentsCanonical: _getAllDepartmentsCanonical,
        _getDepartmentsByLocationCanonical: _getDepartmentsByLocationCanonical,
        _getDepartmentsByParentCanonical: _getDepartmentsByParentCanonical,
        _getPositionCanonical: _getPositionCanonical,
        _getPositionsCanonical: _getPositionsCanonical,
        _getAssignmentCanonical: _getAssignmentCanonical,
        _getAssignmentsCanonical: _getAssignmentsCanonical,
        _getAssignmentsForPositionCanonical: _getAssignmentsForPositionCanonical,
        _getAssignmentsForCharacterCanonical: _getAssignmentsForCharacterCanonical,
        _getGovernmentTypeCanonical: _getGovernmentTypeCanonical,
        _getAllGovernmentTypesCanonical: _getAllGovernmentTypesCanonical,
        _getGovernmentHistoryCanonical: _getGovernmentHistoryCanonical,

        // Mutation primitives (transaction-neutral)
        _addDepartment: _addDepartment,
        _updateDepartment: _updateDepartment,
        _removeDepartment: _removeDepartment,
        _addPosition: _addPosition,
        _updatePosition: _updatePosition,
        _removePosition: _removePosition,
        _appendSalaryOverride: _appendSalaryOverride,
        _addAssignment: _addAssignment,
        _updateAssignment: _updateAssignment,
        _removeAssignment: _removeAssignment,
        _addGovernmentType: _addGovernmentType,
        _updateGovernmentType: _updateGovernmentType,
        _removeGovernmentType: _removeGovernmentType,
        _addGovernmentHistory: _addGovernmentHistory,

        // UI state
        getUIState: getUIState,
        setUIState: setUIState,
        updateUIState: updateUIState,

        // Subscriptions
        subscribe: subscribe,
        publish: _publish
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.GovernmentState;
    }
})();
