/**
 * =============================================================================
 * GOVERNMENT STATE (js/government/government-state.js)
 * =============================================================================
 * 
 * PURPOSE: Single source of truth for government data.
 * 
 * UPDATED: Added industry tax revenue, enterprise stats, and settlement integration
 * UPDATED: Added icon field support for government types
 * FIXED: _getCachedTypes() now properly reads from masterData.data.governmentTypes
 * FIXED: _addGovernmentType now properly persists to masterData
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
    var _processingUpdate = false;

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
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
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

    function _invalidateAccessorCaches() {
        if (typeof window.invalidateAccessorCaches === 'function') {
            window.invalidateAccessorCaches();
        }
        if (typeof window.refreshCaches === 'function') {
            window.refreshCaches();
        }
    }

    function _getSettlementData(locationId) {
        if (typeof window.getSettlementData === 'function') {
            return window.getSettlementData(locationId);
        }
        if (typeof window.getOrCreateSettlementData === 'function') {
            return window.getOrCreateSettlementData(locationId);
        }
        return null;
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

            // Load from masterData - FIXED: Properly read governmentTypes
            if (window.masterData && window.masterData.data) {
                _state.governmentDepartments = window.masterData.data.governmentDepartments || [];
                _state.governmentTypes = window.masterData.data.governmentTypes || [];
                _state.governmentHistory = window.masterData.data.governmentHistory || [];
            }

            // Ensure all departments have required fields
            for (var i = 0; i < _state.governmentDepartments.length; i++) {
                var dept = _state.governmentDepartments[i];
                _ensureDepartmentInitialized(dept);
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

    function _ensureDepartmentInitialized(dept) {
        if (!dept) return;
        if (!dept.positions) dept.positions = [];
        if (!dept.assignments) dept.assignments = [];
        if (!dept.createdAt) dept.createdAt = _getCurrentYear();
        if (!dept.updatedAt) dept.updatedAt = _getCurrentYear();
        if (dept.isDeprecated === undefined) dept.isDeprecated = false;
        
        // Ensure positions have required fields
        for (var i = 0; i < dept.positions.length; i++) {
            var pos = dept.positions[i];
            if (pos.priority === undefined) pos.priority = 10;
            if (pos.parentPositionId === undefined) pos.parentPositionId = null;
            if (pos.requiredRoleId === undefined) pos.requiredRoleId = null;
            if (pos.minSkillLevel === undefined) pos.minSkillLevel = 0;
            if (pos.genderRestriction === undefined) pos.genderRestriction = 'either';
            if (pos.requiredRankId === undefined) pos.requiredRankId = null;
            if (pos.minExperience === undefined) pos.minExperience = 0;
        }
        
        // Ensure assignments have required fields
        for (var i = 0; i < dept.assignments.length; i++) {
            var a = dept.assignments[i];
            if (a.characterName === undefined) a.characterName = 'Unknown';
            if (a.endYear === undefined) a.endYear = null;
            if (a.endReason === undefined) a.endReason = null;
            if (a.notes === undefined) a.notes = '';
            if (a.roleIdAtAssignment === undefined) a.roleIdAtAssignment = null;
            if (a.skillLevelAtAssignment === undefined) a.skillLevelAtAssignment = 0;
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
            _ensureDepartmentInitialized(dept);

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
                _ensureDepartmentInitialized(_state.governmentDepartments[i]);
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

        // First get assignments for character
        var assignments = getAssignmentsForCharacter(characterId, true);
        var deptIds = {};
        for (var i = 0; i < assignments.length; i++) {
            if (assignments[i].departmentId) {
                deptIds[assignments[i].departmentId] = true;
            }
        }

        var result = [];
        for (var id in deptIds) {
            var dept = getDepartment(id);
            if (dept && (options.includeDeprecated !== false || !dept.isDeprecated)) {
                result.push(dept);
            }
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

    // =========================================================================
    // 7. GOVERNMENT TYPES - FIXED: Proper reading from masterData
    // =========================================================================

    function getGovernmentTypes() {
        // Always read fresh from masterData
        if (window.masterData && window.masterData.data && window.masterData.data.governmentTypes) {
            return window.masterData.data.governmentTypes.slice();
        }
        return [];
    }

    function getGovernmentTypeById(typeId) {
        if (!typeId) return null;
        var types = getGovernmentTypes();
        for (var i = 0; i < types.length; i++) {
            if (types[i].id === typeId) {
                return types[i];
            }
        }
        return null;
    }

    function getGovernmentHistory(locationId) {
        if (!locationId) return _state.governmentHistory.slice();
        return _state.governmentHistory.filter(function(h) { return h.locationId === locationId; });
    }

    // =========================================================================
    // 8. INDUSTRY INTEGRATION
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
        var settlement = _getSettlementData(locationId);
        if (settlement && settlement.industryTaxRate !== undefined) {
            taxRate = settlement.industryTaxRate / 100;
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
        var settlement = _getSettlementData(locationId);
        if (settlement && settlement.industryTaxRate !== undefined) {
            taxRate = settlement.industryTaxRate / 100;
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

        var settlement = _getSettlementData(locationId);
        if (settlement && settlement.industryTaxRate !== undefined) {
            return settlement.industryTaxRate / 100;
        }
        return 0.05;
    }

    function getIndustryIncomeForLocation(locationId) {
        if (!locationId) return 0;
        return getIndustryTaxRevenue(locationId);
    }

    // =========================================================================
    // 9. UI STATE MANAGEMENT
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
    // 10. MUTATION HELPERS (Internal - used by commands)
    // =========================================================================

    function _addDepartment(department) {
        _ensureDepartmentInitialized(department);
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

        // Ensure position has all required fields
        if (position.priority === undefined) position.priority = 10;
        if (position.parentPositionId === undefined) position.parentPositionId = null;
        if (position.requiredRoleId === undefined) position.requiredRoleId = null;
        if (position.minSkillLevel === undefined) position.minSkillLevel = 0;
        if (position.genderRestriction === undefined) position.genderRestriction = 'either';
        if (position.requiredRankId === undefined) position.requiredRankId = null;
        if (position.minExperience === undefined) position.minExperience = 0;

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

        var allowed = ['name', 'description', 'priority', 'parentPositionId', 'requiredRoleId', 'minSkillLevel', 'genderRestriction', 'requiredRankId', 'minExperience'];
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

        // Ensure assignment has all required fields
        if (assignment.characterName === undefined) assignment.characterName = 'Unknown';
        if (assignment.endYear === undefined) assignment.endYear = null;
        if (assignment.endReason === undefined) assignment.endReason = null;
        if (assignment.notes === undefined) assignment.notes = '';
        if (assignment.roleIdAtAssignment === undefined) assignment.roleIdAtAssignment = null;
        if (assignment.skillLevelAtAssignment === undefined) assignment.skillLevelAtAssignment = 0;

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

        var allowed = ['endYear', 'endReason', 'notes', 'title', 'roleIdAtAssignment', 'skillLevelAtAssignment'];
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

    // =========================================================================
    // 11. GOVERNMENT TYPE MUTATIONS - FIXED: Proper persistence
    // =========================================================================

    function _addGovernmentType(type) {
        // Ensure icon exists
        if (!type.icon) type.icon = '';
        
        // Push to masterData directly
        if (!window.masterData) {
            window.masterData = { data: {} };
        }
        if (!window.masterData.data) {
            window.masterData.data = {};
        }
        if (!window.masterData.data.governmentTypes) {
            window.masterData.data.governmentTypes = [];
        }
        
        window.masterData.data.governmentTypes.push(type);
        
        // Also update state cache
        _state.governmentTypes = window.masterData.data.governmentTypes.slice();
        
        // Save and invalidate
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
        if (updates.icon !== undefined) type.icon = updates.icon;

        // Update in masterData
        if (window.masterData && window.masterData.data && window.masterData.data.governmentTypes) {
            var types = window.masterData.data.governmentTypes;
            for (var i = 0; i < types.length; i++) {
                if (types[i].id === typeId) {
                    types[i] = type;
                    break;
                }
            }
        }

        _saveMasterData();
        invalidateCache();
        _notifySubscribers('governmentTypeUpdated', { id: typeId, updates: updates });
        return type;
    }

    function _deleteGovernmentType(typeId) {
        if (!window.masterData || !window.masterData.data || !window.masterData.data.governmentTypes) {
            return false;
        }

        var types = window.masterData.data.governmentTypes;
        var index = -1;
        for (var i = 0; i < types.length; i++) {
            if (types[i].id === typeId) {
                index = i;
                break;
            }
        }
        if (index === -1) return false;

        types.splice(index, 1);
        _state.governmentTypes = types.slice();

        _saveMasterData();
        invalidateCache();
        _notifySubscribers('governmentTypeDeleted', typeId);
        return true;
    }

    // =========================================================================
    // 12. CHANGE NOTIFICATIONS (Observer Pattern)
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
    // 13. EXPORTS
    // =========================================================================

    _initializeState();

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

        // Industry integration
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

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            getState: getState,
            getDepartment: getDepartment,
            getAllDepartments: getAllDepartments,
            getDepartmentsByLocation: getDepartmentsByLocation,
            getDepartmentsByParent: getDepartmentsByParent,
            getDepartmentsByCharacter: getDepartmentsByCharacter,
            getDepartmentTree: getDepartmentTree,
            getPositionsForDepartment: getPositionsForDepartment,
            getPositionById: getPositionById,
            getPositionHierarchy: getPositionHierarchy,
            getAssignmentsForDepartment: getAssignmentsForDepartment,
            getAssignmentsForPosition: getAssignmentsForPosition,
            getAssignmentsForCharacter: getAssignmentsForCharacter,
            getAssignmentById: getAssignmentById,
            getGovernmentTypes: getGovernmentTypes,
            getGovernmentTypeById: getGovernmentTypeById,
            getGovernmentHistory: getGovernmentHistory,
            getIndustryTaxRevenue: getIndustryTaxRevenue,
            getIndustryEnterpriseStats: getIndustryEnterpriseStats,
            getIndustryTaxRate: getIndustryTaxRate,
            getIndustryIncomeForLocation: getIndustryIncomeForLocation,
            getUIState: getUIState,
            setUIState: setUIState,
            updateUIState: updateUIState,
            invalidateCache: invalidateCache,
            refreshFromMasterData: refreshFromMasterData,
            subscribe: subscribe,
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
            _initialize: _initializeState
        };
    }

})();