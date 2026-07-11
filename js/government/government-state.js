/**
 * =============================================================================
 * GOVERNMENT STATE - Single source of truth for government data
 * =============================================================================
 * 
 * Responsibilities:
 * - Store all government departments, positions, assignments
 * - Cache for performance
 * - Change notifications
 * - UI state management
 * - INDUSTRY DATA CACHE (industry tax revenue, enterprise stats)
 * 
 * DEPENDENCIES:
 *   - accessors.js (getPlaces, getPlaceById, getCharacters, getCharacterById)
 *   - storage.js (saveMasterData)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _initializingState = false;
    var _notifyingSubscribers = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getPlaces() {
        return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
    }

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getCharacters() {
        return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') return window.getCurrentYearSafe();
        if (typeof window.getCurrentYear === 'function') return window.getCurrentYear();
        return 1250;
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') window.saveMasterData();
    }

    function _generateId(prefix) {
        if (typeof window.generateId === 'function') return window.generateId(prefix);
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }

    function _getIcon(name) {
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    function _getIndustryQueries() {
        return typeof window.IndustryQueries !== 'undefined' ? window.IndustryQueries : null;
    }

    // =========================================================================
    // 3. STATE DEFINITION
    // =========================================================================

    var _state = {
        // Raw data from masterData
        governmentDepartments: [],
        governmentTypes: [],
        governmentHistory: [],
        
        // Caches
        cache: {
            departmentsByLocation: new Map(),
            departmentsByParent: new Map(),
            departmentsByCharacter: new Map(),
            positionsByDepartment: new Map(),
            assignmentsByDepartment: new Map(),
            assignmentsByPosition: new Map(),
            assignmentsByCharacter: new Map(),
            positionHierarchy: new Map(),
            // Industry data cache
            industryTaxRevenue: new Map(),
            industryEnterpriseStats: new Map()
        },
        
        // Change listeners
        subscribers: [],
        
        // UI State
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
        
        // Initialization flag
        initialized: false,
        version: 1
    };

    // =========================================================================
    // 4. INITIALIZATION
    // =========================================================================

    function _initializeState() {
        if (_initializingState) {
            return;
        }
        _initializingState = true;

        try {
            if (_state.initialized) return;

            // Load from masterData
            if (window.masterData && window.masterData.data) {
                _state.governmentDepartments = window.masterData.data.governmentDepartments || [];
                _state.governmentTypes = window.masterData.data.governmentTypes || [];
                _state.governmentHistory = window.masterData.data.governmentHistory || [];
            }

            // Ensure all departments have required fields
            for (var i = 0; i < _state.governmentDepartments.length; i++) {
                var dept = _state.governmentDepartments[i];
                if (!dept.positions) dept.positions = [];
                if (!dept.assignments) dept.assignments = [];
                if (!dept.createdAt) dept.createdAt = _getCurrentYear();
                if (!dept.updatedAt) dept.updatedAt = _getCurrentYear();
            }

            // Build caches
            _rebuildCaches();

            _state.initialized = true;
            _notifySubscribers('initialized', null);

        } catch(e) {
            // Silent fail
        } finally {
            _initializingState = false;
        }
    }

    // =========================================================================
    // 5. CACHE MANAGEMENT
    // =========================================================================

    function _rebuildCaches() {
        var departments = _state.governmentDepartments;

        // Clear all caches
        _state.cache.departmentsByLocation.clear();
        _state.cache.departmentsByParent.clear();
        _state.cache.departmentsByCharacter.clear();
        _state.cache.positionsByDepartment.clear();
        _state.cache.assignmentsByDepartment.clear();
        _state.cache.assignmentsByPosition.clear();
        _state.cache.assignmentsByCharacter.clear();
        _state.cache.positionHierarchy.clear();
        _state.cache.industryTaxRevenue.clear();
        _state.cache.industryEnterpriseStats.clear();

        // Build department caches
        for (var i = 0; i < departments.length; i++) {
            var dept = departments[i];

            // By location
            if (dept.locationId) {
                if (!_state.cache.departmentsByLocation.has(dept.locationId)) {
                    _state.cache.departmentsByLocation.set(dept.locationId, []);
                }
                _state.cache.departmentsByLocation.get(dept.locationId).push(dept);
            }

            // By parent
            if (dept.parentDepartmentId) {
                if (!_state.cache.departmentsByParent.has(dept.parentDepartmentId)) {
                    _state.cache.departmentsByParent.set(dept.parentDepartmentId, []);
                }
                _state.cache.departmentsByParent.get(dept.parentDepartmentId).push(dept);
            }

            // Positions by department
            if (dept.positions) {
                _state.cache.positionsByDepartment.set(dept.id, dept.positions);
            }

            // Assignments by department
            if (dept.assignments) {
                _state.cache.assignmentsByDepartment.set(dept.id, dept.assignments);

                // Assignments by position and character
                for (var j = 0; j < dept.assignments.length; j++) {
                    var assign = dept.assignments[j];

                    // By position
                    if (assign.positionId) {
                        var key = dept.id + '_' + assign.positionId;
                        if (!_state.cache.assignmentsByPosition.has(key)) {
                            _state.cache.assignmentsByPosition.set(key, []);
                        }
                        _state.cache.assignmentsByPosition.get(key).push(assign);
                    }

                    // By character
                    if (assign.characterId) {
                        if (!_state.cache.assignmentsByCharacter.has(assign.characterId)) {
                            _state.cache.assignmentsByCharacter.set(assign.characterId, []);
                        }
                        _state.cache.assignmentsByCharacter.get(assign.characterId).push(assign);
                    }
                }
            }
        }
    }

    function invalidateCache() {
        _rebuildCaches();
        _state.cache.industryTaxRevenue.clear();
        _state.cache.industryEnterpriseStats.clear();
        _notifySubscribers('cacheInvalidated', null);
    }

    function refreshFromMasterData() {
        _state.initialized = false;
        _initializeState();
        invalidateCache();
    }

    // =========================================================================
    // 6. STATE ACCESSORS
    // =========================================================================

    function getState(options) {
        options = options || {};
        var result = {
            departments: _state.governmentDepartments,
            types: _state.governmentTypes,
            history: _state.governmentHistory,
            version: _state.version || 1,
            timestamp: Date.now()
        };

        if (options.includeUI) {
            result.ui = {
                selectedDepartmentId: _state.uiState.selectedDepartmentId,
                selectedPositionId: _state.uiState.selectedPositionId,
                selectedLocationId: _state.uiState.selectedLocationId,
                viewMode: _state.uiState.viewMode,
                filters: _state.uiState.filters
            };
        }

        return result;
    }

    function getDepartment(departmentId) {
        if (!departmentId) return null;
        for (var i = 0; i < _state.governmentDepartments.length; i++) {
            if (_state.governmentDepartments[i].id === departmentId) {
                return _state.governmentDepartments[i];
            }
        }
        return null;
    }

    function getAllDepartments(options) {
        options = options || {};
        var result = _state.governmentDepartments.slice();

        if (options.includeDeprecated !== true) {
            result = result.filter(function(d) { return !d.isDeprecated; });
        }

        if (options.locationId) {
            result = result.filter(function(d) { return d.locationId === options.locationId; });
        }

        return result;
    }

    function getDepartmentsByLocation(locationId, options) {
        options = options || {};
        if (!locationId) return [];

        var cached = _state.cache.departmentsByLocation.get(locationId);
        if (!cached) return [];

        var result = cached.slice();
        if (options.includeDeprecated !== true) {
            result = result.filter(function(d) { return !d.isDeprecated; });
        }

        return result;
    }

    function getDepartmentsByParent(parentId, options) {
        options = options || {};
        if (!parentId) return [];

        var cached = _state.cache.departmentsByParent.get(parentId);
        if (!cached) return [];

        var result = cached.slice();
        if (options.includeDeprecated !== true) {
            result = result.filter(function(d) { return !d.isDeprecated; });
        }

        return result;
    }

    function getDepartmentsByCharacter(characterId, options) {
        options = options || {};
        if (!characterId) return [];

        var cached = _state.cache.departmentsByCharacter.get(characterId);
        if (!cached) return [];

        var result = cached.slice();
        if (options.includeDeprecated !== true) {
            result = result.filter(function(d) { return !d.isDeprecated; });
        }

        return result;
    }

    function getDepartmentTree(locationId) {
        var allDepts = getDepartmentsByLocation(locationId, { includeDeprecated: false });
        var topLevel = allDepts.filter(function(d) { return !d.parentDepartmentId; });

        var result = [];
        for (var i = 0; i < topLevel.length; i++) {
            result.push(_buildDepartmentTree(topLevel[i], allDepts));
        }
        return result;
    }

    function _buildDepartmentTree(dept, allDepts) {
        var children = allDepts.filter(function(d) { return d.parentDepartmentId === dept.id; });
        var tree = {
            id: dept.id,
            name: dept.name,
            description: dept.description,
            locationId: dept.locationId,
            positions: dept.positions || [],
            assignments: dept.assignments || [],
            children: children.map(function(c) { return _buildDepartmentTree(c, allDepts); })
        };
        return tree;
    }

    function getPositionHierarchy(departmentId, positionId) {
        if (!departmentId || !positionId) return null;

        var cacheKey = departmentId + '_' + positionId;
        if (_state.cache.positionHierarchy.has(cacheKey)) {
            return _state.cache.positionHierarchy.get(cacheKey);
        }

        var position = getPositionById(departmentId, positionId);
        if (!position) return null;

        var hierarchy = [position];
        var current = position;
        var safety = 0;

        while (current.parentPositionId && safety < 20) {
            var parent = getPositionById(departmentId, current.parentPositionId);
            if (!parent) break;
            hierarchy.unshift(parent);
            current = parent;
            safety++;
        }

        _state.cache.positionHierarchy.set(cacheKey, hierarchy);
        return hierarchy;
    }

    function getPositionsForDepartment(departmentId) {
        if (!departmentId) return [];
        var cached = _state.cache.positionsByDepartment.get(departmentId);
        return cached || [];
    }

    function getPositionById(departmentId, positionId) {
        if (!departmentId || !positionId) return null;
        var positions = getPositionsForDepartment(departmentId);
        for (var i = 0; i < positions.length; i++) {
            if (positions[i].id === positionId) {
                return positions[i];
            }
        }
        return null;
    }

    function getAssignmentsForDepartment(departmentId, activeOnly) {
        if (!departmentId) return [];
        var cached = _state.cache.assignmentsByDepartment.get(departmentId);
        if (!cached) return [];

        if (activeOnly) {
            return cached.filter(function(a) { return !a.endYear; });
        }
        return cached.slice();
    }

    function getAssignmentsForPosition(departmentId, positionId, activeOnly) {
        if (!departmentId || !positionId) return [];
        var key = departmentId + '_' + positionId;
        var cached = _state.cache.assignmentsByPosition.get(key);
        if (!cached) return [];

        if (activeOnly) {
            return cached.filter(function(a) { return !a.endYear; });
        }
        return cached.slice();
    }

    function getAssignmentsForCharacter(characterId, activeOnly) {
        if (!characterId) return [];
        var cached = _state.cache.assignmentsByCharacter.get(characterId);
        if (!cached) return [];

        if (activeOnly) {
            return cached.filter(function(a) { return !a.endYear; });
        }
        return cached.slice();
    }

    function getAssignmentById(departmentId, assignmentId) {
        if (!departmentId || !assignmentId) return null;
        var assignments = getAssignmentsForDepartment(departmentId, false);
        for (var i = 0; i < assignments.length; i++) {
            if (assignments[i].id === assignmentId) {
                return assignments[i];
            }
        }
        return null;
    }

    function getGovernmentTypes() {
        return _state.governmentTypes.slice();
    }

    function getGovernmentTypeById(typeId) {
        if (!typeId) return null;
        for (var i = 0; i < _state.governmentTypes.length; i++) {
            if (_state.governmentTypes[i].id === typeId) {
                return _state.governmentTypes[i];
            }
        }
        return null;
    }

    function getGovernmentHistory(locationId) {
        if (!locationId) return _state.governmentHistory.slice();
        return _state.governmentHistory.filter(function(h) { return h.locationId === locationId; });
    }

    // =========================================================================
    // 7. INDUSTRY INTEGRATION - NEW
    // =========================================================================

    function getIndustryTaxRevenue(locationId, year) {
        if (!locationId) return 0;

        var cacheKey = locationId + '_' + (year || _getCurrentYear());
        if (_state.cache.industryTaxRevenue.has(cacheKey)) {
            return _state.cache.industryTaxRevenue.get(cacheKey);
        }

        var queries = _getIndustryQueries();
        if (!queries) return 0;

        var enterprises = queries.getLocationEnterprisesSummary(locationId);
        if (!enterprises || enterprises.length === 0) return 0;

        var totalTax = 0;
        var taxRate = 0.05; // Default 5% industry tax

        // Get settlement tax rate if available
        if (typeof window.getSettlementData === 'function') {
            var settlement = window.getSettlementData(locationId);
            if (settlement && settlement.industryTaxRate) {
                taxRate = settlement.industryTaxRate / 100;
            }
        }

        for (var i = 0; i < enterprises.length; i++) {
            var e = enterprises[i];
            // Only tax profitable enterprises
            if (e.annualProfit > 0) {
                totalTax += Math.floor(e.annualProfit * taxRate);
            }
        }

        _state.cache.industryTaxRevenue.set(cacheKey, totalTax);
        return totalTax;
    }

    function getIndustryEnterpriseStats(locationId) {
        if (!locationId) return null;

        if (_state.cache.industryEnterpriseStats.has(locationId)) {
            return _state.cache.industryEnterpriseStats.get(locationId);
        }

        var queries = _getIndustryQueries();
        if (!queries) return null;

        var enterprises = queries.getLocationEnterprisesSummary(locationId);
        if (!enterprises) return null;

        var stats = {
            totalEnterprises: enterprises.length,
            byCategory: {},
            byStatus: {},
            byOwnerType: {},
            totalWealth: 0,
            totalDebt: 0,
            totalWorkers: 0,
            totalAnnualProfit: 0,
            profitable: 0,
            unprofitable: 0,
            totalTaxRevenue: 0
        };

        var taxRate = 0.05;
        if (typeof window.getSettlementData === 'function') {
            var settlement = window.getSettlementData(locationId);
            if (settlement && settlement.industryTaxRate) {
                taxRate = settlement.industryTaxRate / 100;
            }
        }

        for (var i = 0; i < enterprises.length; i++) {
            var e = enterprises[i];
            stats.totalWealth += e.wealth || 0;
            stats.totalDebt += e.debt || 0;
            stats.totalWorkers += e.workerCount || 0;

            if (e.annualProfit > 0) {
                stats.profitable++;
                stats.totalTaxRevenue += Math.floor(e.annualProfit * taxRate);
            } else if (e.annualProfit < 0) {
                stats.unprofitable++;
            }

            stats.totalAnnualProfit += e.annualProfit || 0;

            stats.byCategory[e.category || 'other'] = (stats.byCategory[e.category || 'other'] || 0) + 1;
            stats.byStatus[e.status || 'active'] = (stats.byStatus[e.status || 'active'] || 0) + 1;
            stats.byOwnerType[e.ownerType || 'character'] = (stats.byOwnerType[e.ownerType || 'character'] || 0) + 1;
        }

        stats.averageProfit = enterprises.length > 0 ? Math.round(stats.totalAnnualProfit / enterprises.length) : 0;
        stats.healthScore = enterprises.length > 0 ? Math.round((stats.profitable / enterprises.length) * 100) : 0;
        stats.totalTaxRevenue = Math.round(stats.totalTaxRevenue);

        _state.cache.industryEnterpriseStats.set(locationId, stats);
        return stats;
    }

    function getIndustryTaxRate(locationId) {
        if (!locationId) return 0.05;

        if (typeof window.getSettlementData === 'function') {
            var settlement = window.getSettlementData(locationId);
            if (settlement && settlement.industryTaxRate) {
                return settlement.industryTaxRate / 100;
            }
        }
        return 0.05;
    }

    function getIndustryIncomeForLocation(locationId) {
        if (!locationId) return 0;
        return getIndustryTaxRevenue(locationId);
    }

    // =========================================================================
    // 8. UI STATE MANAGEMENT
    // =========================================================================

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
        if (options.notify !== false) {
            _notifySubscribers('uiStateChanged', { key: key, value: value });
        }
    }

    function updateUIState(updates, options) {
        options = options || {};
        for (var key in updates) {
            if (updates.hasOwnProperty(key)) {
                _state.uiState[key] = updates[key];
            }
        }
        if (options.notify !== false) {
            _notifySubscribers('uiStateChanged', updates);
        }
    }

    // =========================================================================
    // 9. MUTATION HELPERS (Internal - used by commands)
    // =========================================================================

    function _addDepartment(department) {
        _state.governmentDepartments.push(department);
        _saveMasterData();
        invalidateCache();
        _notifySubscribers('departmentAdded', department);
        return department;
    }

    function _updateDepartment(departmentId, updates) {
        var dept = getDepartment(departmentId);
        if (!dept) return null;

        var allowed = ['name', 'description', 'locationId', 'parentDepartmentId', 'isDeprecated'];
        for (var i = 0; i < allowed.length; i++) {
            var key = allowed[i];
            if (updates[key] !== undefined) {
                dept[key] = updates[key];
            }
        }

        dept.updatedAt = _getCurrentYear();
        _saveMasterData();
        invalidateCache();
        _notifySubscribers('departmentUpdated', { id: departmentId, updates: updates });
        return dept;
    }

    function _deleteDepartment(departmentId) {
        var index = -1;
        for (var i = 0; i < _state.governmentDepartments.length; i++) {
            if (_state.governmentDepartments[i].id === departmentId) {
                index = i;
                break;
            }
        }
        if (index === -1) return false;

        _state.governmentDepartments.splice(index, 1);
        _saveMasterData();
        invalidateCache();
        _notifySubscribers('departmentDeleted', departmentId);
        return true;
    }

    function _addPosition(departmentId, position) {
        var dept = getDepartment(departmentId);
        if (!dept) return null;

        if (!dept.positions) dept.positions = [];
        dept.positions.push(position);
        _saveMasterData();
        invalidateCache();
        _notifySubscribers('positionAdded', { departmentId: departmentId, position: position });
        return position;
    }

    function _updatePosition(departmentId, positionId, updates) {
        var dept = getDepartment(departmentId);
        if (!dept || !dept.positions) return false;

        var index = -1;
        for (var i = 0; i < dept.positions.length; i++) {
            if (dept.positions[i].id === positionId) {
                index = i;
                break;
            }
        }
        if (index === -1) return false;

        var allowed = ['name', 'description', 'priority', 'parentPositionId'];
        for (var i = 0; i < allowed.length; i++) {
            var key = allowed[i];
            if (updates[key] !== undefined) {
                dept.positions[index][key] = updates[key];
            }
        }

        _saveMasterData();
        invalidateCache();
        _notifySubscribers('positionUpdated', { departmentId: departmentId, positionId: positionId, updates: updates });
        return true;
    }

    function _deletePosition(departmentId, positionId) {
        var dept = getDepartment(departmentId);
        if (!dept || !dept.positions) return false;

        dept.positions = dept.positions.filter(function(p) { return p.id !== positionId; });

        if (dept.assignments) {
            dept.assignments = dept.assignments.filter(function(a) { return a.positionId !== positionId; });
        }

        _saveMasterData();
        invalidateCache();
        _notifySubscribers('positionDeleted', { departmentId: departmentId, positionId: positionId });
        return true;
    }

    function _addAssignment(departmentId, assignment) {
        var dept = getDepartment(departmentId);
        if (!dept) return null;

        if (!dept.assignments) dept.assignments = [];
        dept.assignments.push(assignment);
        _saveMasterData();
        invalidateCache();
        _notifySubscribers('assignmentAdded', { departmentId: departmentId, assignment: assignment });
        return assignment;
    }

    function _updateAssignment(departmentId, assignmentId, updates) {
        var dept = getDepartment(departmentId);
        if (!dept || !dept.assignments) return false;

        var index = -1;
        for (var i = 0; i < dept.assignments.length; i++) {
            if (dept.assignments[i].id === assignmentId) {
                index = i;
                break;
            }
        }
        if (index === -1) return false;

        var allowed = ['endYear', 'endReason', 'notes', 'title'];
        for (var i = 0; i < allowed.length; i++) {
            var key = allowed[i];
            if (updates[key] !== undefined) {
                dept.assignments[index][key] = updates[key];
            }
        }

        _saveMasterData();
        invalidateCache();
        _notifySubscribers('assignmentUpdated', { departmentId: departmentId, assignmentId: assignmentId, updates: updates });
        return true;
    }

    function _deleteAssignment(departmentId, assignmentId) {
        var dept = getDepartment(departmentId);
        if (!dept || !dept.assignments) return false;

        dept.assignments = dept.assignments.filter(function(a) { return a.id !== assignmentId; });
        _saveMasterData();
        invalidateCache();
        _notifySubscribers('assignmentDeleted', { departmentId: departmentId, assignmentId: assignmentId });
        return true;
    }

    function _addGovernmentType(type) {
        _state.governmentTypes.push(type);
        _saveMasterData();
        invalidateCache();
        _notifySubscribers('governmentTypeAdded', type);
        return type;
    }

    function _updateGovernmentType(typeId, updates) {
        var type = getGovernmentTypeById(typeId);
        if (!type) return null;

        if (updates.name !== undefined) type.name = updates.name;
        if (updates.description !== undefined) type.description = updates.description;
        if (updates.allowedRankIds !== undefined) type.allowedRankIds = updates.allowedRankIds;

        _saveMasterData();
        invalidateCache();
        _notifySubscribers('governmentTypeUpdated', { id: typeId, updates: updates });
        return type;
    }

    function _deleteGovernmentType(typeId) {
        var index = -1;
        for (var i = 0; i < _state.governmentTypes.length; i++) {
            if (_state.governmentTypes[i].id === typeId) {
                index = i;
                break;
            }
        }
        if (index === -1) return false;

        _state.governmentTypes.splice(index, 1);
        _saveMasterData();
        invalidateCache();
        _notifySubscribers('governmentTypeDeleted', typeId);
        return true;
    }

    // =========================================================================
    // 10. CHANGE NOTIFICATIONS (Observer Pattern)
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

    function _notifySubscribers(event, data) {
        if (_notifyingSubscribers) {
            return;
        }
        _notifyingSubscribers = true;

        try {
            var subscribers = _state.subscribers.slice();
            for (var i = 0; i < subscribers.length; i++) {
                try {
                    subscribers[i]({ type: event, data: data });
                } catch(e) {
                    // Don't let one subscriber break others
                }
            }
        } finally {
            _notifyingSubscribers = false;
        }
    }

    // =========================================================================
    // 11. EXPORTS (UPDATED with Industry Integration)
    // =========================================================================

    window.GovernmentState = {
        // Core access
        getState: getState,
        getDepartment: getDepartment,
        getAllDepartments: getAllDepartments,
        getDepartmentsByLocation: getDepartmentsByLocation,
        getDepartmentsByParent: getDepartmentsByParent,
        getDepartmentsByCharacter: getDepartmentsByCharacter,
        getDepartmentTree: getDepartmentTree,

        // Positions
        getPositionsForDepartment: getPositionsForDepartment,
        getPositionById: getPositionById,
        getPositionHierarchy: getPositionHierarchy,

        // Assignments
        getAssignmentsForDepartment: getAssignmentsForDepartment,
        getAssignmentsForPosition: getAssignmentsForPosition,
        getAssignmentsForCharacter: getAssignmentsForCharacter,
        getAssignmentById: getAssignmentById,

        // Government types
        getGovernmentTypes: getGovernmentTypes,
        getGovernmentTypeById: getGovernmentTypeById,
        getGovernmentHistory: getGovernmentHistory,

        // INDUSTRY INTEGRATION - NEW
        getIndustryTaxRevenue: getIndustryTaxRevenue,
        getIndustryEnterpriseStats: getIndustryEnterpriseStats,
        getIndustryTaxRate: getIndustryTaxRate,
        getIndustryIncomeForLocation: getIndustryIncomeForLocation,

        // UI State
        getUIState: getUIState,
        setUIState: setUIState,
        updateUIState: updateUIState,

        // Cache management
        invalidateCache: invalidateCache,
        refreshFromMasterData: refreshFromMasterData,

        // Subscription
        subscribe: subscribe,

        // Internal (for commands)
        _addDepartment: _addDepartment,
        _updateDepartment: _updateDepartment,
        _deleteDepartment: _deleteDepartment,
        _addPosition: _addPosition,
        _updatePosition: _updatePosition,
        _deletePosition: _deletePosition,
        _addAssignment: _addAssignment,
        _updateAssignment: _updateAssignment,
        _deleteAssignment: _deleteAssignment,
        _addGovernmentType: _addGovernmentType,
        _updateGovernmentType: _updateGovernmentType,
        _deleteGovernmentType: _deleteGovernmentType,

        // Initialize
        _initialize: _initializeState
    };

    // Auto-initialize
    if (typeof window !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                _initializeState();
            });
        } else {
            setTimeout(function() {
                _initializeState();
            }, 0);
        }
    }

})();