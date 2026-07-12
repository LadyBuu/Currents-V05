/**
 * =============================================================================
 * HOUSEHOLD STATE (household-state.js)
 * =============================================================================
 * 
 * FIXED: Added residence fields, crime fields, economy fields, and name period management
 * UPDATED: Added household positions (like government positions)
 * UPDATED: Added position assignments with role tracking
 * UPDATED: Added salary and tuition tracking to economy schema
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. RECURSION GUARDS
    // =========================================================================

    var _loading = false;
    var _saving = false;
    var _invalidating = false;
    var _processingUpdate = false;

    // =========================================================================
    // 1. STATE
    // =========================================================================

    var _state = {
        // Data
        households: [],
        characters: [],
        places: [],
        
        // NEW: Household positions (like government positions)
        householdPositions: [],
        
        // NEW: Household position assignments
        householdAssignments: [],
        
        // UI State
        ui: {
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
        
        // Caches
        cache: {
            householdMap: null,
            characterHouseholdMap: null,
            positionMap: null,
            positionsByHousehold: null,
            positionsByDepartment: null,
            assignmentsByHousehold: null,
            assignmentsByCharacter: null,
            assignmentsByPosition: null,
            lastUpdated: 0
        },
        
        // Subscribers
        subscribers: [],
        
        // Version
        version: 0
    };

    var _pendingUpdates = [];
    var _updateTimeout = null;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        if (typeof window.getCurrentYear === 'function') {
            return window.getCurrentYear();
        }
        return 1250;
    }

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        return window.masterData?.data?.characters || [];
    }

    function _getPlaces() {
        if (typeof window.getPlaces === 'function') {
            return window.getPlaces();
        }
        return window.masterData?.data?.places || [];
    }

    function _getHouseholdsFromMaster() {
        if (typeof window.getAllHouseholds === 'function') {
            return window.getAllHouseholds();
        }
        return window.masterData?.data?.households || [];
    }

    function _getMasterData() {
        return window.masterData?.data || {};
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    function _invalidateAccessorCaches() {
        if (typeof window.invalidateAccessorCaches === 'function') {
            window.invalidateAccessorCaches();
        }
    }

    function _generateId(prefix) {
        if (typeof window.generateId === 'function') {
            return window.generateId(prefix);
        }
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }

    function _getRoleById(id) {
        if (typeof window.getRoleById === 'function') {
            return window.getRoleById(id);
        }
        return null;
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
        }
        return null;
    }

    // =========================================================================
    // 3. CACHE MANAGEMENT
    // =========================================================================

    function _buildIdMap(items) {
        var map = new Map();
        for (var i = 0; i < items.length; i++) {
            if (items[i] && items[i].id) {
                map.set(items[i].id, items[i]);
            }
        }
        return map;
    }

    function _buildCharacterHouseholdMap(households) {
        var map = new Map();
        for (var i = 0; i < households.length; i++) {
            var h = households[i];
            if (h.members) {
                for (var j = 0; j < h.members.length; j++) {
                    if (h.members[j].characterId) {
                        map.set(h.members[j].characterId, h);
                    }
                }
            }
        }
        return map;
    }

    function _rebuildCaches() {
        var households = _state.households;
        var positions = _state.householdPositions || [];
        var assignments = _state.householdAssignments || [];
        
        // Household caches
        _state.cache.householdMap = _buildIdMap(households);
        _state.cache.characterHouseholdMap = _buildCharacterHouseholdMap(households);
        
        // Position caches
        _state.cache.positionMap = _buildIdMap(positions);
        _state.cache.positionsByHousehold = new Map();
        _state.cache.positionsByDepartment = new Map();
        
        for (var i = 0; i < positions.length; i++) {
            var pos = positions[i];
            
            // By household
            if (pos.householdId) {
                if (!_state.cache.positionsByHousehold.has(pos.householdId)) {
                    _state.cache.positionsByHousehold.set(pos.householdId, []);
                }
                _state.cache.positionsByHousehold.get(pos.householdId).push(pos);
            }
            
            // By department
            if (pos.departmentId) {
                if (!_state.cache.positionsByDepartment.has(pos.departmentId)) {
                    _state.cache.positionsByDepartment.set(pos.departmentId, []);
                }
                _state.cache.positionsByDepartment.get(pos.departmentId).push(pos);
            }
        }
        
        // Assignment caches
        _state.cache.assignmentsByHousehold = new Map();
        _state.cache.assignmentsByCharacter = new Map();
        _state.cache.assignmentsByPosition = new Map();
        
        for (var i = 0; i < assignments.length; i++) {
            var a = assignments[i];
            
            // By household
            if (a.householdId) {
                if (!_state.cache.assignmentsByHousehold.has(a.householdId)) {
                    _state.cache.assignmentsByHousehold.set(a.householdId, []);
                }
                _state.cache.assignmentsByHousehold.get(a.householdId).push(a);
            }
            
            // By character
            if (a.characterId) {
                if (!_state.cache.assignmentsByCharacter.has(a.characterId)) {
                    _state.cache.assignmentsByCharacter.set(a.characterId, []);
                }
                _state.cache.assignmentsByCharacter.get(a.characterId).push(a);
            }
            
            // By position
            if (a.positionId) {
                if (!_state.cache.assignmentsByPosition.has(a.positionId)) {
                    _state.cache.assignmentsByPosition.set(a.positionId, []);
                }
                _state.cache.assignmentsByPosition.get(a.positionId).push(a);
            }
        }
        
        _state.cache.lastUpdated = Date.now();
        _state.version++;
    }

    function _invalidateCaches() {
        if (_invalidating) return;
        _invalidating = true;
        try {
            _state.cache.householdMap = null;
            _state.cache.characterHouseholdMap = null;
            _state.cache.positionMap = null;
            _state.cache.positionsByHousehold = null;
            _state.cache.positionsByDepartment = null;
            _state.cache.assignmentsByHousehold = null;
            _state.cache.assignmentsByCharacter = null;
            _state.cache.assignmentsByPosition = null;
            _state.cache.lastUpdated = 0;
            _state.version++;
        } finally {
            _invalidating = false;
        }
    }

    function _ensureCaches() {
        if (!_state.cache.householdMap) {
            _rebuildCaches();
        }
    }

    // =========================================================================
    // 4. NOTIFICATION SYSTEM
    // =========================================================================

    function _notifySubscribers(event, data) {
        var subscribers = _state.subscribers.slice();
        var eventObj = {
            type: event,
            data: data,
            version: _state.version,
            timestamp: Date.now()
        };
        for (var i = 0; i < subscribers.length; i++) {
            try {
                subscribers[i](eventObj);
            } catch (e) {
                // Silent fail
            }
        }
    }

    function _processPendingUpdates() {
        if (_updateTimeout) {
            clearTimeout(_updateTimeout);
            _updateTimeout = null;
        }
        if (_pendingUpdates.length === 0) return;

        var updates = _pendingUpdates.slice();
        _pendingUpdates = [];

        for (var i = 0; i < updates.length; i++) {
            var update = updates[i];
            switch (update.type) {
                case 'add_household':
                    _state.households.push(update.data);
                    break;
                case 'update_household':
                    var index = _state.households.findIndex(function(h) { return h.id === update.data.id; });
                    if (index !== -1) {
                        _state.households[index] = update.data;
                    }
                    break;
                case 'delete_household':
                    var idx = _state.households.findIndex(function(h) { return h.id === update.data; });
                    if (idx !== -1) {
                        _state.households.splice(idx, 1);
                    }
                    break;
                case 'add_position':
                    _state.householdPositions.push(update.data);
                    break;
                case 'update_position':
                    var posIdx = _state.householdPositions.findIndex(function(p) { return p.id === update.data.id; });
                    if (posIdx !== -1) {
                        _state.householdPositions[posIdx] = update.data;
                    }
                    break;
                case 'delete_position':
                    var pIdx = _state.householdPositions.findIndex(function(p) { return p.id === update.data; });
                    if (pIdx !== -1) {
                        _state.householdPositions.splice(pIdx, 1);
                    }
                    break;
                case 'add_assignment':
                    _state.householdAssignments.push(update.data);
                    break;
                case 'update_assignment':
                    var aIdx = _state.householdAssignments.findIndex(function(a) { return a.id === update.data.id; });
                    if (aIdx !== -1) {
                        _state.householdAssignments[aIdx] = update.data;
                    }
                    break;
                case 'delete_assignment':
                    var dIdx = _state.householdAssignments.findIndex(function(a) { return a.id === update.data; });
                    if (dIdx !== -1) {
                        _state.householdAssignments.splice(dIdx, 1);
                    }
                    break;
            }
        }

        _rebuildCaches();
        _state.version++;
        _saveToMaster();
        _notifySubscribers('change', {
            updates: updates,
            householdCount: _state.households.length
        });
        _invalidateAccessorCaches();
    }

    function _queueUpdate(type, data) {
        _pendingUpdates.push({ type: type, data: data });
        if (_updateTimeout) {
            clearTimeout(_updateTimeout);
        }
        _updateTimeout = setTimeout(_processPendingUpdates, 10);
    }

    function _saveToMaster() {
        if (_saving) return;
        _saving = true;
        try {
            if (window.masterData && window.masterData.data) {
                window.masterData.data.households = _state.households.slice();
                window.masterData.data.householdPositions = _state.householdPositions.slice();
                window.masterData.data.householdAssignments = _state.householdAssignments.slice();
                _saveMasterData();
            }
        } finally {
            _saving = false;
        }
    }

    // =========================================================================
    // 5. INITIALIZATION
    // =========================================================================

    function _initialize() {
        if (_loading) return;
        _loading = true;
        try {
            var households = _getHouseholdsFromMaster();
            var characters = _getCharacters();
            var places = _getPlaces();
            
            // Load positions and assignments from masterData
            var positions = window.masterData?.data?.householdPositions || [];
            var assignments = window.masterData?.data?.householdAssignments || [];

            for (var i = 0; i < households.length; i++) {
                _ensureHouseholdInitialized(households[i]);
            }

            _state.households = households.slice();
            _state.characters = characters.slice();
            _state.places = places.slice();
            _state.householdPositions = positions.slice();
            _state.householdAssignments = assignments.slice();
            
            _rebuildCaches();
            _state.version++;
        } finally {
            _loading = false;
        }
    }

    function _ensureHouseholdInitialized(household) {
        if (!household) return;

        if (!household.members) household.members = [];
        if (!household.departments) household.departments = [];
        if (!household.nameHistory) household.nameHistory = [];
        if (!household.activityLog) household.activityLog = [];

        // Residence fields
        if (household.residenceId === undefined) household.residenceId = null;
        if (household.residenceName === undefined) household.residenceName = null;
        if (household.residenceType === undefined) household.residenceType = null;
        if (household.associatedYear === undefined) household.associatedYear = null;
        if (household.residenceUnitNumber === undefined) household.residenceUnitNumber = null;
        if (household.residenceNotes === undefined) household.residenceNotes = null;

        // ================================================================
        // ECONOMY FIELDS (UPDATED with salary/tuition tracking)
        // ================================================================
        if (!household.economy) {
            household.economy = {
                wealth: household.wealth || 0,
                debt: 0,
                resources: { food: 0, livestock: 0, goods: 0 },
                incomeSources: [],
                expenses: [],
                economicTierId: 'moderate',
                lastProcessedYear: _getCurrentYear(),
                // NEW salary tracking
                salaryIncome: 0,
                salaryIncomeHistory: [],
                totalSalaries: 0,
                salaryIncomeThisYear: 0,
                // NEW tuition tracking
                tuitionExpenses: 0,
                tuitionExpensesHistory: [],
                tuitionExpensesThisYear: 0
            };
        }
        if (household.economy.wealth === undefined) household.economy.wealth = household.wealth || 0;
        if (household.economy.debt === undefined) household.economy.debt = 0;
        if (!household.economy.resources) household.economy.resources = { food: 0, livestock: 0, goods: 0 };
        if (!household.economy.incomeSources) household.economy.incomeSources = [];
        if (!household.economy.expenses) household.economy.expenses = [];
        if (!household.economy.economicTierId) household.economy.economicTierId = 'moderate';
        if (household.economy.lastProcessedYear === undefined) household.economy.lastProcessedYear = _getCurrentYear();

        // NEW salary tracking fields
        if (household.economy.salaryIncome === undefined) household.economy.salaryIncome = 0;
        if (!household.economy.salaryIncomeHistory) household.economy.salaryIncomeHistory = [];
        if (household.economy.totalSalaries === undefined) household.economy.totalSalaries = 0;
        if (household.economy.salaryIncomeThisYear === undefined) household.economy.salaryIncomeThisYear = 0;

        // NEW tuition tracking fields
        if (household.economy.tuitionExpenses === undefined) household.economy.tuitionExpenses = 0;
        if (!household.economy.tuitionExpensesHistory) household.economy.tuitionExpensesHistory = [];
        if (household.economy.tuitionExpensesThisYear === undefined) household.economy.tuitionExpensesThisYear = 0;

        // Crime fields
        if (household.prestige === undefined) household.prestige = 50;
        if (household.criminalCount === undefined) household.criminalCount = 0;
        if (household.victimCount === undefined) household.victimCount = 0;
        if (household.executedCount === undefined) household.executedCount = 0;
        if (household.criminalMembers === undefined) household.criminalMembers = [];
        if (household.victimMembers === undefined) household.victimMembers = [];
        if (household.crimeHistory === undefined) household.crimeHistory = [];
        if (household.vendettaCount === undefined) household.vendettaCount = 0;
        if (household.activeVendettaCount === undefined) household.activeVendettaCount = 0;

        // Name period management
        if (household.nameHistory && household.nameHistory.length > 0) {
            var sorted = household.nameHistory.slice().sort(function(a, b) { return a.year - b.year; });
            for (var i = 0; i < sorted.length; i++) {
                if (i < sorted.length - 1) {
                    sorted[i].periodEnd = sorted[i + 1].year - 1;
                } else {
                    sorted[i].periodEnd = null;
                }
                sorted[i].isCurrent = (i === sorted.length - 1);
            }
            household.nameHistory = sorted;
        }

        // Other fields
        if (household.reputation === undefined) household.reputation = 50;
        if (household.wealth === undefined) household.wealth = household.economy ? household.economy.wealth : 0;
        if (household.powerScore === undefined) household.powerScore = 0;
        if (household.foundedYear === undefined) household.foundedYear = _getCurrentYear();
        if (household.status === undefined) household.status = 'active';
        if (household.currentNameSince === undefined) household.currentNameSince = household.foundedYear;
        if (household.vendettas === undefined) household.vendettas = [];
        if (household.alliances === undefined) household.alliances = [];
        if (household.vacancyHistory === undefined) household.vacancyHistory = [];
        if (household.previousHouseholdId === undefined) household.previousHouseholdId = null;
        if (household.previousHouseholdName === undefined) household.previousHouseholdName = null;
        if (household.vacantYear === undefined) household.vacantYear = null;
        if (household.vacantReason === undefined) household.vacantReason = null;
        if (household.isVacant === undefined) household.isVacant = false;
        if (household.isDemolished === undefined) household.isDemolished = false;

        // Initialize name history if empty
        var hasCurrentName = household.nameHistory.some(function(h) {
            return h.newName === household.name && h.isCurrent !== false;
        });
        if (!hasCurrentName && household.name) {
            household.nameHistory.push({
                oldName: null,
                newName: household.name,
                year: household.currentNameSince || household.foundedYear || _getCurrentYear(),
                isCurrent: true,
                periodEnd: null,
                reason: 'Household founded'
            });
        }

        if (household.nameHistory.length === 0 && household.name) {
            household.nameHistory.push({
                oldName: null,
                newName: household.name,
                year: household.foundedYear || _getCurrentYear(),
                isCurrent: true,
                periodEnd: null,
                reason: 'Household founded'
            });
        }
    }

    // =========================================================================
    // 6. NAME PERIOD MANAGEMENT
    // =========================================================================

    function getHouseholdNamePeriods(householdId) {
        var household = getHousehold(householdId);
        if (!household || !household.nameHistory) return [];
        
        var history = household.nameHistory.slice().sort(function(a, b) { return a.year - b.year; });
        var currentYear = _getCurrentYear();
        
        if (history.length === 0) {
            return [{
                oldName: null,
                newName: household.name,
                year: household.foundedYear || currentYear,
                periodEnd: null,
                isCurrent: true,
                reason: 'Household founded',
                changedBy: null
            }];
        }
        
        for (var i = 0; i < history.length; i++) {
            if (i < history.length - 1) {
                history[i].periodEnd = history[i + 1].year - 1;
            } else {
                history[i].periodEnd = null;
            }
            history[i].isCurrent = (i === history.length - 1);
        }
        
        return history;
    }

    function getHouseholdNamePeriodForYear(householdId, year) {
        var periods = getHouseholdNamePeriods(householdId);
        var currentYear = _getCurrentYear();
        
        for (var i = 0; i < periods.length; i++) {
            var p = periods[i];
            var periodStart = p.year;
            var periodEnd = p.periodEnd || currentYear;
            
            if (year >= periodStart && year <= periodEnd) {
                return p;
            }
        }
        
        return periods.length > 0 ? periods[periods.length - 1] : null;
    }

    function editHouseholdNamePeriod(householdId, periodIndex, updates) {
        var household = getHousehold(householdId);
        if (!household || !household.nameHistory) return false;
        
        var history = household.nameHistory.slice().sort(function(a, b) { return a.year - b.year; });
        
        if (periodIndex < 0 || periodIndex >= history.length) return false;
        
        var period = history[periodIndex];
        var oldName = period.newName;
        var oldYear = period.year;
        
        if (updates.name !== undefined && updates.name.trim()) {
            period.newName = updates.name.trim();
        }
        if (updates.year !== undefined && !isNaN(updates.year) && updates.year > 0) {
            period.year = updates.year;
        }
        if (updates.reason !== undefined) {
            period.reason = updates.reason;
        }
        if (updates.changedBy !== undefined) {
            period.changedBy = updates.changedBy;
        }
        
        var isCurrent = periodIndex === history.length - 1;
        if (isCurrent && updates.name !== undefined && updates.name.trim()) {
            household.name = updates.name.trim();
            household.currentNameSince = period.year;
        }
        
        history.sort(function(a, b) { return a.year - b.year; });
        for (var i = 0; i < history.length; i++) {
            if (i < history.length - 1) {
                history[i].periodEnd = history[i + 1].year - 1;
            } else {
                history[i].periodEnd = null;
            }
            history[i].isCurrent = (i === history.length - 1);
        }
        
        household.nameHistory = history;
        household.updatedAt = Date.now();
        
        _queueUpdate('update_household', household);
        return true;
    }

    function deleteHouseholdNamePeriod(householdId, periodIndex) {
        var household = getHousehold(householdId);
        if (!household || !household.nameHistory) return false;
        
        var history = household.nameHistory.slice().sort(function(a, b) { return a.year - b.year; });
        
        if (periodIndex < 0 || periodIndex >= history.length) return false;
        if (history.length <= 1) return false;
        
        var isCurrent = periodIndex === history.length - 1;
        history.splice(periodIndex, 1);
        
        if (isCurrent && history.length > 0) {
            var lastPeriod = history[history.length - 1];
            household.name = lastPeriod.newName;
            household.currentNameSince = lastPeriod.year;
        }
        
        history.sort(function(a, b) { return a.year - b.year; });
        for (var i = 0; i < history.length; i++) {
            if (i < history.length - 1) {
                history[i].periodEnd = history[i + 1].year - 1;
            } else {
                history[i].periodEnd = null;
            }
            history[i].isCurrent = (i === history.length - 1);
        }
        
        household.nameHistory = history;
        household.updatedAt = Date.now();
        
        _queueUpdate('update_household', household);
        return true;
    }

    // =========================================================================
    // 7. RESIDENCE ASSOCIATION FUNCTIONS
    // =========================================================================

    function associateHouseholdWithResidence(householdId, residenceId, options) {
        options = options || {};
        var household = getHousehold(householdId);
        if (!household) return false;
        
        if (!residenceId || residenceId.trim() === '') return false;
        
        var year = options.year || _getCurrentYear();
        
        household.residenceId = residenceId.trim();
        household.residenceName = options.residenceName || residenceId.trim();
        household.residenceType = options.residenceType || 'estate';
        household.associatedYear = year;
        household.residenceUnitNumber = options.unitNumber || null;
        household.residenceNotes = options.notes || null;
        household.updatedAt = Date.now();
        
        _queueUpdate('update_household', household);
        return true;
    }

    function disassociateHouseholdFromResidence(householdId, residenceId, reason, year) {
        reason = reason || 'household_moved';
        year = year || _getCurrentYear();
        var household = getHousehold(householdId);
        if (!household) return false;
        
        var oldResidenceId = residenceId || household.residenceId;
        if (!oldResidenceId) return false;
        
        household.residenceId = null;
        household.residenceName = null;
        household.residenceType = null;
        household.associatedYear = null;
        household.residenceUnitNumber = null;
        household.residenceNotes = null;
        household.updatedAt = Date.now();
        
        _queueUpdate('update_household', household);
        return true;
    }

    function getHouseholdResidence(householdId) {
        var household = getHousehold(householdId);
        if (!household || !household.residenceId) return null;
        
        return {
            residenceId: household.residenceId,
            residenceName: household.residenceName,
            residenceType: household.residenceType,
            associatedYear: household.associatedYear,
            unitNumber: household.residenceUnitNumber,
            notes: household.residenceNotes
        };
    }

    function getHouseholdsByResidence(residenceId) {
        if (!residenceId) return [];
        return _state.households.filter(function(h) {
            return h.residenceId === residenceId;
        });
    }

    // =========================================================================
    // 8. PUBLIC API - DATA ACCESS
    // =========================================================================

    function getState(options) {
        options = options || {};
        var includeUI = options.includeUI !== undefined ? options.includeUI : false;
        var snapshot = {
            households: _state.households.slice(),
            householdPositions: _state.householdPositions.slice(),
            householdAssignments: _state.householdAssignments.slice(),
            version: _state.version,
            timestamp: Date.now()
        };
        if (includeUI) {
            snapshot.ui = {
                selectedHouseholdId: _state.ui.selectedHouseholdId,
                selectedCharacterId: _state.ui.selectedCharacterId,
                selectedPositionId: _state.ui.selectedPositionId,
                filters: { ..._state.ui.filters },
                viewMode: _state.ui.viewMode,
                expandedHouseholds: { ..._state.ui.expandedHouseholds }
            };
        }
        return snapshot;
    }

    function getHousehold(householdId) {
        if (!householdId) return null;
        _ensureCaches();
        return _state.cache.householdMap.get(householdId) || null;
    }

    function getAllHouseholds(options) {
        options = options || {};
        var includeDeprecated = options.includeDeprecated || false;
        if (includeDeprecated) {
            return _state.households.slice();
        }
        return _state.households.filter(function(h) {
            return h.status !== 'deprecated';
        });
    }

    function getCharacterHousehold(characterId) {
        if (!characterId) return null;
        _ensureCaches();
        return _state.cache.characterHouseholdMap.get(characterId) || null;
    }

    function getHouseholdsByLocation(locationId, options) {
        options = options || {};
        var includeDeprecated = options.includeDeprecated || false;
        var households = getAllHouseholds({ includeDeprecated: includeDeprecated });
        return households.filter(function(h) {
            return h.locationId === locationId;
        });
    }

    function getHouseholdsByStatus(status, options) {
        options = options || {};
        var includeDeprecated = options.includeDeprecated || false;
        var households = getAllHouseholds({ includeDeprecated: includeDeprecated });
        return households.filter(function(h) {
            return h.status === status;
        });
    }

    function getHouseholdMembersWithCharacters(householdId) {
        var household = getHousehold(householdId);
        if (!household || !household.members) return [];

        var characters = _state.characters;
        var charMap = {};
        for (var i = 0; i < characters.length; i++) {
            charMap[characters[i].id] = characters[i];
        }

        var result = [];
        for (var i = 0; i < household.members.length; i++) {
            var member = household.members[i];
            var character = charMap[member.characterId];
            if (character) {
                result.push({
                    characterId: member.characterId,
                    character: character,
                    characterName: (character.name || '') + (character.surname ? ' ' + character.surname : ''),
                    type: member.type,
                    departmentId: member.departmentId,
                    role: member.role,
                    isHead: member.isHead,
                    joinedYear: member.joinedYear,
                    notes: member.notes,
                    headSince: member.headSince
                });
            }
        }
        return result;
    }

    function getHouseholdHead(householdId) {
        var household = getHousehold(householdId);
        if (!household || !household.members) return null;

        var characters = _state.characters;
        var charMap = {};
        for (var i = 0; i < characters.length; i++) {
            charMap[characters[i].id] = characters[i];
        }

        for (var i = 0; i < household.members.length; i++) {
            if (household.members[i].isHead) {
                var char = charMap[household.members[i].characterId];
                if (char) return char;
            }
        }

        var livingMembers = [];
        for (var i = 0; i < household.members.length; i++) {
            var char = charMap[household.members[i].characterId];
            if (char && !char.isDeceased) {
                livingMembers.push(char);
            }
        }
        if (livingMembers.length === 0) return null;

        livingMembers.sort(function(a, b) {
            var ageA = a.birthYear ? _getCurrentYear() - a.birthYear : 0;
            var ageB = b.birthYear ? _getCurrentYear() - b.birthYear : 0;
            return ageB - ageA;
        });
        return livingMembers[0];
    }

    function getHouseholdStatus(householdId) {
        var household = getHousehold(householdId);
        if (!household) {
            return {
                exists: false,
                isEmpty: true,
                isVacant: true,
                livingCount: 0,
                deceasedCount: 0,
                totalMembers: 0,
                status: 'nonexistent',
                statusIcon: '✗',
                statusMessage: 'Household does not exist'
            };
        }

        var livingCount = 0;
        var deceasedCount = 0;
        var characters = _state.characters;
        var charMap = {};
        for (var i = 0; i < characters.length; i++) {
            charMap[characters[i].id] = characters[i];
        }

        if (household.members) {
            for (var i = 0; i < household.members.length; i++) {
                var char = charMap[household.members[i].characterId];
                if (char) {
                    if (char.isDeceased) {
                        deceasedCount++;
                    } else {
                        livingCount++;
                    }
                } else {
                    deceasedCount++;
                }
            }
        }

        var totalMembers = household.members ? household.members.length : 0;
        var isEmpty = livingCount === 0;
        var isVacant = totalMembers === 0;

        var status = 'active';
        var statusIcon = '';
        var statusMessage = 'Occupied and active';
        var statusColor = '#4a9e6a';

        if (isVacant) {
            status = 'vacant';
            statusIcon = '⌇';
            statusMessage = 'Vacant - no members';
            statusColor = '#8a8a8a';
        } else if (isEmpty && totalMembers > 0) {
            status = 'abandoned';
            statusIcon = '✗';
            statusMessage = 'Abandoned - only deceased remain';
            statusColor = '#c87040';
        } else if (livingCount < totalMembers / 2) {
            status = 'declining';
            statusIcon = '⚠';
            statusMessage = 'Declining - few living members';
            statusColor = '#c8a844';
        }

        if (household.status && household.status !== 'active') {
            status = household.status;
            if (status === 'abandoned') {
                statusIcon = '✗';
                statusMessage = 'Marked as abandoned';
                statusColor = '#c87040';
            } else if (status === 'vacant') {
                statusIcon = '⌇';
                statusMessage = 'Marked as vacant';
                statusColor = '#8a8a8a';
            } else if (status === 'deprecated') {
                statusIcon = '⌇';
                statusMessage = 'Deprecated';
                statusColor = '#6a6a6a';
            }
        }

        return {
            exists: true,
            isEmpty: isEmpty,
            isVacant: isVacant,
            livingCount: livingCount,
            deceasedCount: deceasedCount,
            totalMembers: totalMembers,
            status: status,
            statusIcon: statusIcon,
            statusMessage: statusMessage,
            statusColor: statusColor,
            householdName: household.name
        };
    }

    // =========================================================================
    // 9. PUBLIC API - UI STATE
    // =========================================================================

    function getUIState() {
        return {
            selectedHouseholdId: _state.ui.selectedHouseholdId,
            selectedCharacterId: _state.ui.selectedCharacterId,
            selectedPositionId: _state.ui.selectedPositionId,
            filters: { ..._state.ui.filters },
            viewMode: _state.ui.viewMode,
            expandedHouseholds: { ..._state.ui.expandedHouseholds }
        };
    }

    function setUIState(key, value, options) {
        options = options || {};
        var notify = options.notify !== false;
        var oldValue = _state.ui[key];
        if (oldValue === value) return;
        _state.ui[key] = value;
        if (notify) {
            _notifySubscribers('uiChange', {
                key: key,
                value: value,
                oldValue: oldValue
            });
        }
    }

    function updateUIState(updates, options) {
        options = options || {};
        var notify = options.notify !== false;
        var changed = false;
        for (var key in updates) {
            if (updates.hasOwnProperty(key)) {
                var oldValue = _state.ui[key];
                if (oldValue !== updates[key]) {
                    _state.ui[key] = updates[key];
                    changed = true;
                }
            }
        }
        if (changed && notify) {
            _notifySubscribers('uiChange', {
                updates: updates,
                type: 'batch'
            });
        }
    }

    // =========================================================================
    // 10. PUBLIC API - HOUSEHOLD CRUD
    // =========================================================================

    function createHousehold(name, locationId, options) {
        options = options || {};
        if (!name || name.trim() === '') {
            return null;
        }

        var currentYear = _getCurrentYear();
        var trimmedName = name.trim();

        var existing = _state.households.some(function(h) {
            return h.name && h.name.toLowerCase() === trimmedName.toLowerCase();
        });
        if (existing) {
            return null;
        }

        var newHousehold = {
            id: _generateId('house'),
            name: trimmedName,
            locationId: locationId || null,
            locationName: null,
            departments: [],
            members: [],
            reputation: options.reputation !== undefined ? options.reputation : 50,
            wealth: options.wealth !== undefined ? options.wealth : 0,
            powerScore: 0,
            foundedYear: options.foundedYear !== undefined ? options.foundedYear : currentYear,
            status: 'active',
            nameHistory: [],
            currentNameSince: options.foundedYear !== undefined ? options.foundedYear : currentYear,
            activityLog: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            notes: options.notes || '',
            previousName: null,
            isHistorical: options.isHistorical || false,

            // Residence fields
            residenceId: null,
            residenceName: null,
            residenceType: null,
            associatedYear: null,
            residenceUnitNumber: null,
            residenceNotes: null,

            // ================================================================
            // Economy (UPDATED with salary/tuition tracking)
            // ================================================================
            economy: {
                wealth: options.wealth !== undefined ? options.wealth : 0,
                debt: 0,
                resources: { food: 0, livestock: 0, goods: 0 },
                incomeSources: [],
                expenses: [],
                economicTierId: 'moderate',
                lastProcessedYear: currentYear,
                // NEW salary tracking
                salaryIncome: 0,
                salaryIncomeHistory: [],
                totalSalaries: 0,
                salaryIncomeThisYear: 0,
                // NEW tuition tracking
                tuitionExpenses: 0,
                tuitionExpensesHistory: [],
                tuitionExpensesThisYear: 0
            },

            // Crime fields
            prestige: options.prestige !== undefined ? options.prestige : 50,
            criminalCount: 0,
            victimCount: 0,
            executedCount: 0,
            criminalMembers: [],
            victimMembers: [],
            crimeHistory: [],
            vendettaCount: 0,
            activeVendettaCount: 0,
            vendettas: [],
            alliances: [],
            vacancyHistory: [],
            previousHouseholdId: null,
            previousHouseholdName: null,
            vacantYear: null,
            vacantReason: null,
            isVacant: false,
            isDemolished: false
        };

        newHousehold.nameHistory.push({
            oldName: null,
            newName: trimmedName,
            year: newHousehold.foundedYear,
            isCurrent: true,
            periodEnd: null,
            reason: 'Household founded',
            changedBy: options.founderId || null
        });

        if (options.founderId) {
            var founder = _state.characters.find(function(c) { return c.id === options.founderId; });
            if (founder) {
                newHousehold.members.push({
                    characterId: founder.id,
                    characterName: (founder.name || '') + (founder.surname ? ' ' + founder.surname : ''),
                    type: 'family',
                    role: 'Head of Household',
                    isHead: true,
                    joinedYear: newHousehold.foundedYear,
                    headSince: newHousehold.foundedYear,
                    notes: 'Founder and head of household'
                });
            }
        }

        if (options.initialMembers && Array.isArray(options.initialMembers)) {
            for (var i = 0; i < options.initialMembers.length; i++) {
                var member = options.initialMembers[i];
                if (member.characterId) {
                    var char = _state.characters.find(function(c) { return c.id === member.characterId; });
                    if (char) {
                        newHousehold.members.push({
                            characterId: member.characterId,
                            characterName: (char.name || '') + (char.surname ? ' ' + char.surname : ''),
                            type: member.type || 'family',
                            role: member.role || 'Family Member',
                            isHead: member.isHead || false,
                            joinedYear: member.joinedYear || newHousehold.foundedYear,
                            headSince: member.isHead ? (member.joinedYear || newHousehold.foundedYear) : null,
                            notes: member.notes || ''
                        });
                    }
                }
            }
        }

        if (locationId) {
            var place = _state.places.find(function(p) { return p.id === locationId; });
            if (place) {
                newHousehold.locationName = place.displayName;
            }
        }

        _queueUpdate('add_household', newHousehold);
        return newHousehold;
    }

    function updateHousehold(householdId, updates, options) {
        options = options || {};
        var household = getHousehold(householdId);
        if (!household) return null;

        var recordHistory = options.recordHistory !== false;
        var changeYear = options.changeYear || _getCurrentYear();
        var changeReason = options.changeReason || 'Edited';
        var changedBy = options.changedBy || null;

        var updated = { ...household };
        var changed = false;
        var nameChanged = false;
        var oldName = household.name;

        var allowedFields = ['name', 'locationId', 'notes', 'status', 'foundedYear', 
            'prestige', 'criminalCount', 'victimCount', 'executedCount', 
            'criminalMembers', 'victimMembers', 'crimeHistory', 'vendettaCount', 
            'activeVendettaCount', 'residenceId', 'residenceName', 'residenceType', 
            'associatedYear', 'residenceUnitNumber', 'residenceNotes',
            'wealth', 'reputation', 'powerScore', 'isVacant', 'isDemolished',
            'vacantYear', 'vacantReason', 'previousHouseholdId', 'previousHouseholdName'];

        for (var i = 0; i < allowedFields.length; i++) {
            var field = allowedFields[i];
            if (updates[field] !== undefined && updates[field] !== null) {
                if (field === 'name') {
                    var trimmedName = updates[field].trim();
                    if (trimmedName && trimmedName !== household.name) {
                        updated.name = trimmedName;
                        nameChanged = true;
                        changed = true;
                    }
                } else if (field === 'locationId') {
                    updated.locationId = updates[field];
                    var place = _state.places.find(function(p) { return p.id === updates[field]; });
                    updated.locationName = place ? place.displayName : null;
                    changed = true;
                } else {
                    updated[field] = updates[field];
                    changed = true;
                }
            }
        }

        // Handle economy updates
        if (updates.economy) {
            if (!updated.economy) updated.economy = {};
            for (var key in updates.economy) {
                if (updates.economy.hasOwnProperty(key)) {
                    updated.economy[key] = updates.economy[key];
                }
            }
            changed = true;
        }

        if (nameChanged && recordHistory) {
            if (!updated.nameHistory) {
                updated.nameHistory = [];
            }
            for (var i = 0; i < updated.nameHistory.length; i++) {
                if (updated.nameHistory[i].isCurrent) {
                    updated.nameHistory[i].isCurrent = false;
                    updated.nameHistory[i].periodEnd = changeYear - 1;
                }
            }
            updated.nameHistory.push({
                oldName: oldName,
                newName: updated.name,
                year: changeYear,
                isCurrent: true,
                periodEnd: null,
                reason: changeReason,
                changedBy: changedBy,
                timestamp: Date.now()
            });
            updated.currentNameSince = changeYear;
            updated.previousName = oldName;
        } else if (nameChanged && !recordHistory) {
            updated.previousName = oldName;
        }

        updated.updatedAt = Date.now();

        if (changed) {
            _queueUpdate('update_household', updated);
        }

        return updated;
    }

    function deleteHousehold(householdId, options) {
        options = options || {};
        var force = options.force || false;
        var household = getHousehold(householdId);
        if (!household) return false;

        if (!force && household.members && household.members.length > 0) {
            return false;
        }

        _queueUpdate('delete_household', householdId);
        return true;
    }

    function refresh() {
        _initialize();
        _rebuildCaches();
        _notifySubscribers('refresh', {
            householdCount: _state.households.length
        });
    }

    function invalidateCache() {
        _invalidateCaches();
        _notifySubscribers('cacheInvalidated', {
            timestamp: Date.now()
        });
    }

    // =========================================================================
    // 11. HOUSEHOLD POSITION FUNCTIONS
    // =========================================================================

    function createHouseholdPosition(data) {
        if (_processingUpdate) return null;
        _processingUpdate = true;
        
        try {
            if (!data.name || data.name.trim() === '') {
                return null;
            }
            
            var household = getHousehold(data.householdId);
            if (!household) return null;
            
            if (data.requiredRoleId) {
                var role = _getRoleById(data.requiredRoleId);
                if (!role) return null;
            }
            
            var position = {
                id: _generateId('hpos'),
                name: data.name.trim(),
                householdId: data.householdId,
                departmentId: data.departmentId || null,
                requiredRoleId: data.requiredRoleId || null,
                minSkillLevel: data.minSkillLevel || 0,
                description: data.description || '',
                priority: data.priority || 10,
                createdAt: _getCurrentYear(),
                updatedAt: _getCurrentYear()
            };
            
            _queueUpdate('add_position', position);
            _notifySubscribers('positionAdded', position);
            
            return position;
            
        } finally {
            _processingUpdate = false;
        }
    }

    function updateHouseholdPosition(positionId, updates) {
        if (_processingUpdate) return null;
        _processingUpdate = true;
        
        try {
            var pos = getHouseholdPosition(positionId);
            if (!pos) return null;
            
            var allowed = ['name', 'departmentId', 'requiredRoleId', 'minSkillLevel', 'description', 'priority'];
            for (var i = 0; i < allowed.length; i++) {
                var key = allowed[i];
                if (updates[key] !== undefined) {
                    if (key === 'requiredRoleId' && updates[key] !== null) {
                        var role = _getRoleById(updates[key]);
                        if (!role) return null;
                    }
                    pos[key] = updates[key];
                }
            }
            
            pos.updatedAt = _getCurrentYear();
            _queueUpdate('update_position', pos);
            _notifySubscribers('positionUpdated', pos);
            
            return pos;
            
        } finally {
            _processingUpdate = false;
        }
    }

    function deleteHouseholdPosition(positionId, options) {
        if (_processingUpdate) return false;
        _processingUpdate = true;
        
        try {
            options = options || {};
            var pos = getHouseholdPosition(positionId);
            if (!pos) return false;
            
            if (options.removeAssignments !== false) {
                var assignments = getAssignmentsForPosition(positionId);
                for (var i = 0; i < assignments.length; i++) {
                    deleteHouseholdAssignment(assignments[i].id);
                }
            }
            
            _queueUpdate('delete_position', positionId);
            _notifySubscribers('positionDeleted', pos);
            
            return true;
            
        } finally {
            _processingUpdate = false;
        }
    }

    function getHouseholdPosition(positionId) {
        _ensureCaches();
        return _state.cache.positionMap ? _state.cache.positionMap.get(positionId) || null : null;
    }

    function getHouseholdPositions(options) {
        _ensureCaches();
        options = options || {};
        
        var positions = _state.householdPositions.slice();
        
        if (options.householdId) {
            positions = positions.filter(function(p) { return p.householdId === options.householdId; });
        }
        
        if (options.departmentId) {
            positions = positions.filter(function(p) { return p.departmentId === options.departmentId; });
        }
        
        if (options.includeUnassigned === false) {
            var assignedIds = {};
            for (var i = 0; i < _state.householdAssignments.length; i++) {
                if (!_state.householdAssignments[i].endYear) {
                    assignedIds[_state.householdAssignments[i].positionId] = true;
                }
            }
            positions = positions.filter(function(p) { return assignedIds[p.id]; });
        }
        
        positions.sort(function(a, b) {
            return (a.priority || 10) - (b.priority || 10);
        });
        
        return positions;
    }

    function getHouseholdPositionsByHousehold(householdId) {
        _ensureCaches();
        return _state.cache.positionsByHousehold ? 
            (_state.cache.positionsByHousehold.get(householdId) || []) : [];
    }

    function getHouseholdPositionsByDepartment(departmentId) {
        _ensureCaches();
        return _state.cache.positionsByDepartment ? 
            (_state.cache.positionsByDepartment.get(departmentId) || []) : [];
    }

    // =========================================================================
    // 12. HOUSEHOLD ASSIGNMENT FUNCTIONS
    // =========================================================================

    function assignCharacterToHouseholdPosition(positionId, characterId, options) {
        if (_processingUpdate) return null;
        _processingUpdate = true;
        
        try {
            options = options || {};
            
            var position = getHouseholdPosition(positionId);
            if (!position) return null;
            
            var character = _getCharacterById(characterId);
            if (!character) return null;
            if (character.isDeceased) return null;
            
            var household = getHousehold(position.householdId);
            if (!household) return null;
            
            var existing = getAssignmentsForPosition(positionId);
            for (var i = 0; i < existing.length; i++) {
                if (existing[i].characterId === characterId && !existing[i].endYear) {
                    return null;
                }
            }
            
            var roleId = position.requiredRoleId;
            var skillLevel = 0;
            
            if (roleId) {
                var profession = null;
                if (character.professions) {
                    for (var i = 0; i < character.professions.length; i++) {
                        if (character.professions[i].id === roleId) {
                            profession = character.professions[i];
                            break;
                        }
                    }
                }
                
                if (!profession) {
                    if (options.addRoleIfMissing !== false) {
                        var defaultSkill = options.defaultSkillLevel || 10;
                        if (!character.professions) character.professions = [];
                        character.professions.push({
                            id: roleId,
                            name: _getRoleById(roleId)?.name || 'Role',
                            skillLevel: defaultSkill,
                            primary: false,
                            startYear: options.startYear || _getCurrentYear()
                        });
                        skillLevel = defaultSkill;
                    } else {
                        return null;
                    }
                } else {
                    skillLevel = profession.skillLevel || 0;
                }
            }
            
            if (position.minSkillLevel && skillLevel < position.minSkillLevel) {
                return null;
            }
            
            var startYear = options.startYear || _getCurrentYear();
            
            var assignment = {
                id: _generateId('hassign'),
                positionId: positionId,
                characterId: characterId,
                householdId: position.householdId,
                startYear: startYear,
                endYear: options.endYear || null,
                title: options.title || position.name,
                notes: options.notes || '',
                roleIdAtAssignment: roleId,
                skillLevelAtAssignment: skillLevel,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            
            _queueUpdate('add_assignment', assignment);
            _notifySubscribers('assignmentAdded', assignment);
            
            return assignment;
            
        } finally {
            _processingUpdate = false;
        }
    }

    function endHouseholdAssignment(assignmentId, endYear, reason) {
        if (_processingUpdate) return null;
        _processingUpdate = true;
        
        try {
            var assignment = getHouseholdAssignment(assignmentId);
            if (!assignment) return null;
            
            if (assignment.endYear) return null;
            
            var year = endYear || _getCurrentYear();
            assignment.endYear = year;
            assignment.endReason = reason || 'Ended';
            assignment.updatedAt = Date.now();
            
            _queueUpdate('update_assignment', assignment);
            _notifySubscribers('assignmentEnded', assignment);
            
            return assignment;
            
        } finally {
            _processingUpdate = false;
        }
    }

    function deleteHouseholdAssignment(assignmentId) {
        if (_processingUpdate) return false;
        _processingUpdate = true;
        
        try {
            var assignment = getHouseholdAssignment(assignmentId);
            if (!assignment) return false;
            
            _queueUpdate('delete_assignment', assignmentId);
            _notifySubscribers('assignmentDeleted', assignment);
            
            return true;
            
        } finally {
            _processingUpdate = false;
        }
    }

    function getHouseholdAssignment(assignmentId) {
        _ensureCaches();
        for (var i = 0; i < _state.householdAssignments.length; i++) {
            if (_state.householdAssignments[i].id === assignmentId) {
                return _state.householdAssignments[i];
            }
        }
        return null;
    }

    function getAssignmentsForPosition(positionId, activeOnly) {
        _ensureCaches();
        activeOnly = activeOnly !== false;
        
        var assignments = _state.cache.assignmentsByPosition ? 
            (_state.cache.assignmentsByPosition.get(positionId) || []) : [];
        
        if (activeOnly) {
            assignments = assignments.filter(function(a) { return !a.endYear; });
        }
        
        return assignments;
    }

    function getAssignmentsForCharacter(characterId, activeOnly) {
        _ensureCaches();
        activeOnly = activeOnly !== false;
        
        var assignments = _state.cache.assignmentsByCharacter ? 
            (_state.cache.assignmentsByCharacter.get(characterId) || []) : [];
        
        if (activeOnly) {
            assignments = assignments.filter(function(a) { return !a.endYear; });
        }
        
        return assignments;
    }

    function getAssignmentsForHousehold(householdId, activeOnly) {
        _ensureCaches();
        activeOnly = activeOnly !== false;
        
        var assignments = _state.cache.assignmentsByHousehold ? 
            (_state.cache.assignmentsByHousehold.get(householdId) || []) : [];
        
        if (activeOnly) {
            assignments = assignments.filter(function(a) { return !a.endYear; });
        }
        
        return assignments;
    }

    function getHouseholdAssignments(options) {
        _ensureCaches();
        options = options || {};
        var activeOnly = options.activeOnly !== false;
        
        var assignments = _state.householdAssignments.slice();
        
        if (options.householdId) {
            assignments = assignments.filter(function(a) { return a.householdId === options.householdId; });
        }
        
        if (options.characterId) {
            assignments = assignments.filter(function(a) { return a.characterId === options.characterId; });
        }
        
        if (options.positionId) {
            assignments = assignments.filter(function(a) { return a.positionId === options.positionId; });
        }
        
        if (activeOnly) {
            assignments = assignments.filter(function(a) { return !a.endYear; });
        }
        
        assignments.sort(function(a, b) {
            return (a.startYear || 0) - (b.startYear || 0);
        });
        
        return assignments;
    }

    // =========================================================================
    // 13. HOUSEHOLD POSITION STATISTICS
    // =========================================================================

    function getHouseholdPositionStats(householdId) {
        _ensureCaches();
        
        var positions = getHouseholdPositions({ householdId: householdId });
        var assignments = getAssignmentsForHousehold(householdId, false);
        var activeAssignments = getAssignmentsForHousehold(householdId, true);
        
        var stats = {
            totalPositions: positions.length,
            totalAssignments: assignments.length,
            activeAssignments: activeAssignments.length,
            positionsWithRole: 0,
            positionsWithSkillRequirement: 0,
            byDepartment: {},
            byRole: {}
        };
        
        for (var i = 0; i < positions.length; i++) {
            var p = positions[i];
            if (p.requiredRoleId) {
                stats.positionsWithRole++;
                stats.byRole[p.requiredRoleId] = (stats.byRole[p.requiredRoleId] || 0) + 1;
            }
            if (p.minSkillLevel > 0) {
                stats.positionsWithSkillRequirement++;
            }
            if (p.departmentId) {
                stats.byDepartment[p.departmentId] = (stats.byDepartment[p.departmentId] || 0) + 1;
            }
        }
        
        return stats;
    }

    // =========================================================================
    // 14. PUBLIC API - SUBSCRIPTIONS
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

    function unsubscribe(callback) {
        var index = _state.subscribers.indexOf(callback);
        if (index === -1) return false;
        _state.subscribers.splice(index, 1);
        return true;
    }

    // =========================================================================
    // 15. EXPORTS
    // =========================================================================

    _initialize();

    window.HouseholdState = {
        // Data access
        getState: getState,
        getHousehold: getHousehold,
        getAllHouseholds: getAllHouseholds,
        getCharacterHousehold: getCharacterHousehold,
        getHouseholdsByLocation: getHouseholdsByLocation,
        getHouseholdsByStatus: getHouseholdsByStatus,
        getHouseholdMembersWithCharacters: getHouseholdMembersWithCharacters,
        getHouseholdHead: getHouseholdHead,
        getHouseholdStatus: getHouseholdStatus,

        // Residence association
        associateHouseholdWithResidence: associateHouseholdWithResidence,
        disassociateHouseholdFromResidence: disassociateHouseholdFromResidence,
        getHouseholdResidence: getHouseholdResidence,
        getHouseholdsByResidence: getHouseholdsByResidence,

        // Name period management
        getHouseholdNamePeriods: getHouseholdNamePeriods,
        getHouseholdNamePeriodForYear: getHouseholdNamePeriodForYear,
        editHouseholdNamePeriod: editHouseholdNamePeriod,
        deleteHouseholdNamePeriod: deleteHouseholdNamePeriod,

        // UI State
        getUIState: getUIState,
        setUIState: setUIState,
        updateUIState: updateUIState,

        // CRUD
        createHousehold: createHousehold,
        updateHousehold: updateHousehold,
        deleteHousehold: deleteHousehold,

        // Household positions
        createHouseholdPosition: createHouseholdPosition,
        updateHouseholdPosition: updateHouseholdPosition,
        deleteHouseholdPosition: deleteHouseholdPosition,
        getHouseholdPosition: getHouseholdPosition,
        getHouseholdPositions: getHouseholdPositions,
        getHouseholdPositionsByHousehold: getHouseholdPositionsByHousehold,
        getHouseholdPositionsByDepartment: getHouseholdPositionsByDepartment,
        getHouseholdPositionStats: getHouseholdPositionStats,

        // Household assignments
        assignCharacterToHouseholdPosition: assignCharacterToHouseholdPosition,
        endHouseholdAssignment: endHouseholdAssignment,
        deleteHouseholdAssignment: deleteHouseholdAssignment,
        getHouseholdAssignment: getHouseholdAssignment,
        getAssignmentsForPosition: getAssignmentsForPosition,
        getAssignmentsForCharacter: getAssignmentsForCharacter,
        getAssignmentsForHousehold: getAssignmentsForHousehold,
        getHouseholdAssignments: getHouseholdAssignments,

        // Maintenance
        refresh: refresh,
        invalidateCache: invalidateCache,

        // Subscriptions
        subscribe: subscribe,
        unsubscribe: unsubscribe
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            getState: getState,
            getHousehold: getHousehold,
            getAllHouseholds: getAllHouseholds,
            getCharacterHousehold: getCharacterHousehold,
            getHouseholdsByLocation: getHouseholdsByLocation,
            getHouseholdsByStatus: getHouseholdsByStatus,
            getHouseholdMembersWithCharacters: getHouseholdMembersWithCharacters,
            getHouseholdHead: getHouseholdHead,
            getHouseholdStatus: getHouseholdStatus,
            associateHouseholdWithResidence: associateHouseholdWithResidence,
            disassociateHouseholdFromResidence: disassociateHouseholdFromResidence,
            getHouseholdResidence: getHouseholdResidence,
            getHouseholdsByResidence: getHouseholdsByResidence,
            getHouseholdNamePeriods: getHouseholdNamePeriods,
            getHouseholdNamePeriodForYear: getHouseholdNamePeriodForYear,
            editHouseholdNamePeriod: editHouseholdNamePeriod,
            deleteHouseholdNamePeriod: deleteHouseholdNamePeriod,
            getUIState: getUIState,
            setUIState: setUIState,
            updateUIState: updateUIState,
            createHousehold: createHousehold,
            updateHousehold: updateHousehold,
            deleteHousehold: deleteHousehold,
            createHouseholdPosition: createHouseholdPosition,
            updateHouseholdPosition: updateHouseholdPosition,
            deleteHouseholdPosition: deleteHouseholdPosition,
            getHouseholdPosition: getHouseholdPosition,
            getHouseholdPositions: getHouseholdPositions,
            getHouseholdPositionsByHousehold: getHouseholdPositionsByHousehold,
            getHouseholdPositionsByDepartment: getHouseholdPositionsByDepartment,
            getHouseholdPositionStats: getHouseholdPositionStats,
            assignCharacterToHouseholdPosition: assignCharacterToHouseholdPosition,
            endHouseholdAssignment: endHouseholdAssignment,
            deleteHouseholdAssignment: deleteHouseholdAssignment,
            getHouseholdAssignment: getHouseholdAssignment,
            getAssignmentsForPosition: getAssignmentsForPosition,
            getAssignmentsForCharacter: getAssignmentsForCharacter,
            getAssignmentsForHousehold: getAssignmentsForHousehold,
            getHouseholdAssignments: getHouseholdAssignments,
            refresh: refresh,
            invalidateCache: invalidateCache,
            subscribe: subscribe,
            unsubscribe: unsubscribe
        };
    }

})();