/**
 * =============================================================================
 * RESIDENCE SYSTEM (residence-system.js)
 * =============================================================================
 * 
 * PURPOSE: Business logic for residence management. Handles CRUD operations,
 *          units, vacancy management, name history, timeline, association
 *          history, rehabilitation, recommendations, AND RENTAL MANAGEMENT.
 * 
 * UPDATED: Added rental system - owner/renter fields, rent amount, rent income/expenses
 *          Added setResidenceOwner(), setResidenceRenter(), endResidenceRental()
 *          Added updateResidenceRent(), getResidenceRentalHistory()
 *          Added getResidencesByOwner(), getResidencesByRenter()
 *          Added getTotalRentIncome(), getTotalRentExpenses()
 *          Added recordRentPayment(), getRentPayments()
 * 
 * DEPENDS ON:
 *   - household-state.js (HouseholdState)
 *   - household-commands.js (HouseholdCommands)
 *   - household-queries.js (HouseholdQueries)
 *   - role-state.js (RoleState) - for role integration
 *   - accessors.js (getCharacterById, getPlaceById, getPlaces, getCurrentYear)
 * 
 * SECTIONS:
 *   0. RECURSION GUARD
 *   1. CONSTANTS
 *   2. DEPENDENCY WRAPPERS
 *   3. STATE REFERENCE
 *   4. ICON HELPERS
 *   5. RESIDENCE CRUD
 *   6. RESIDENCE HISTORY
 *   7. RESIDENCE TIMELINE
 *   8. RESIDENCE ASSOCIATION
 *   9. RESIDENCE NAME HISTORY
 *   10. UNIT MANAGEMENT
 *   11. VACANCY MANAGEMENT
 *   12. REHABILITATION
 *   13. RECOMMENDATIONS
 *   14. HOUSEHOLD RESIDENCE QUERIES
 *   15. CAPACITY AND AVAILABILITY
 *   16. RESIDENCE STATISTICS
 *   17. BULK OPERATIONS
 *   18. INTEGRATION FUNCTIONS
 *   19. TYPE HELPERS
 *   20. CONDITION HELPERS
 *   21. UNIT STATS HELPERS
 *   22. STAFF POSITION FUNCTIONS
 *   23. DEMOLISH FUNCTIONS
 *   24. RENTAL FUNCTIONS (NEW)
 *   25. CACHE MANAGEMENT
 *   26. EXPORTS
 * 
 * ICON POLICY:
 *   - All icons from icons.js via _getIcon()
 *   - NO emojis
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. RECURSION GUARD
    // =========================================================================

    var _processingResidence = false;
    var _processingAssignment = false;

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var RESIDENCE_TYPES = {
        ESTATE: { id: 'estate', name: 'Estate', icon: '⌂', capacity: 20, isMultiUnit: false, description: 'Large estate with grounds' },
        MANOR: { id: 'manor', name: 'Manor House', icon: '⌂', capacity: 15, isMultiUnit: false, description: 'Grand manor house' },
        HOUSE: { id: 'house', name: 'House', icon: '⌂', capacity: 8, isMultiUnit: false, description: 'Single-family house' },
        COTTAGE: { id: 'cottage', name: 'Cottage', icon: '⌂', capacity: 4, isMultiUnit: false, description: 'Small cottage' },
        APARTMENT: { id: 'apartment', name: 'Apartment Building', icon: '◉', capacity: 30, isMultiUnit: true, description: 'Multi-unit apartment building' },
        TENEMENT: { id: 'tenement', name: 'Tenement', icon: '◉', capacity: 25, isMultiUnit: true, description: 'Dense multi-unit housing' },
        SUITE: { id: 'suite', name: 'Suite', icon: '◉', capacity: 6, isMultiUnit: false, description: 'Luxury suite within a building' },
        ROOM: { id: 'room', name: 'Room', icon: '◉', capacity: 2, isMultiUnit: false, description: 'Single room' },
        TOWER: { id: 'tower', name: 'Tower', icon: '⌂', capacity: 10, isMultiUnit: false, description: 'Defensive tower residence' },
        PALACE: { id: 'palace', name: 'Palace', icon: '⌂', capacity: 50, isMultiUnit: false, description: 'Royal or noble palace' },
        CASTLE: { id: 'castle', name: 'Castle', icon: '⌂', capacity: 40, isMultiUnit: false, description: 'Fortified castle residence' },
        BARRACKS: { id: 'barracks', name: 'Barracks', icon: '◉', capacity: 30, isMultiUnit: true, description: 'Military housing' }
    };

    var RESIDENCE_STATUS = {
        ACTIVE: 'active',
        ABANDONED: 'abandoned',
        DEMOLISHED: 'demolished',
        UNDER_CONSTRUCTION: 'under_construction',
        RENOVATING: 'renovating'
    };

    // =========================================================================
    // 1a. RENTAL CONSTANTS (NEW)
    // =========================================================================

    var RENTAL_STATUS = {
        OWNER_OCCUPIED: 'owner_occupied',
        RENTED: 'rented',
        VACANT: 'vacant'
    };

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCurrentYear() {
    // Delegates to time.js — do not add fallback logic here.
    return typeof window.getCurrentYearSafe === 'function'
        ? window.getCurrentYearSafe()
        : 1250;
}

    function _getCharacterById(id) {
        if (typeof window.getCharacterById === 'function') {
            return window.getCharacterById(id);
        }
        return null;
    }

    function _getCharacters() {
        if (typeof window.getCharacters === 'function') {
            return window.getCharacters();
        }
        return window.masterData?.data?.characters || [];
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById === 'function') {
            return window.getPlaceById(id);
        }
        return null;
    }

    function _getPlaces() {
        if (typeof window.getPlaces === 'function') {
            return window.getPlaces();
        }
        return window.masterData?.data?.places || [];
    }

    function _getLocationTypeById(id) {
        if (typeof window.getLocationTypeById === 'function') {
            return window.getLocationTypeById(id);
        }
        return null;
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    function _showToast(message, type) {
        if (typeof window._showToast === 'function') {
            window._showToast(message, type);
        } else if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(message, type);
        }
    }

    function _getIcon(name) {
        if (typeof window._getIcon === 'function') {
            return window._getIcon(name);
        }
        if (window.Icons && window.Icons[name]) {
            return window.Icons[name];
        }
        return '';
    }

    function _generateId(prefix) {
        if (typeof window.generateId === 'function') {
            return window.generateId(prefix);
        }
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }

    function _escapeHtml(str) {
        if (typeof window._escapeHtml === 'function') {
            return window._escapeHtml(str);
        }
        if (typeof window.escapeHtml === 'function') {
            return window.escapeHtml(str);
        }
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function _getRoleById(id) {
        if (typeof window.getRoleById === 'function') {
            return window.getRoleById(id);
        }
        return null;
    }

    function _getAllRoles() {
        if (typeof window.RoleState !== 'undefined' && window.RoleState.getAllRoles) {
            return window.RoleState.getAllRoles();
        }
        if (typeof window.getRoles === 'function') {
            return window.getRoles();
        }
        return [];
    }

    function _addProfession(characterId, roleId, options) {
        if (typeof window.addProfession === 'function') {
            return window.addProfession(characterId, roleId, options);
        }
        return { success: false };
    }

    function _addHouseholdActivityLog(householdId, action, details, actorId) {
        if (typeof window.addHouseholdActivityLog === 'function') {
            return window.addHouseholdActivityLog(householdId, action, details, actorId);
        }
        return false;
    }

    function _invalidateAccessorCaches() {
        if (typeof window.invalidateAccessorCaches === 'function') {
            window.invalidateAccessorCaches();
        }
        if (typeof window.refreshCaches === 'function') {
            window.refreshCaches();
        }
    }

    function _chance(probability) {
        if (typeof window.chance === 'function') {
            return window.chance(probability);
        }
        return Math.random() < probability;
    }

    function _randomInt(min, max) {
        if (typeof window.randomInt === 'function') {
            return window.randomInt(min, max);
        }
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function _getHousehold(householdId) {
        if (window.HouseholdState && typeof window.HouseholdState.getHousehold === 'function') {
            return window.HouseholdState.getHousehold(householdId);
        }
        return null;
    }

    function _getHouseholdCommands() {
        return window.HouseholdCommands;
    }

    function _getHouseholdState() {
        return window.HouseholdState;
    }

    // =========================================================================
    // 3. STATE REFERENCE
    // =========================================================================

    var _state = window.HouseholdState;
    var _commands = window.HouseholdCommands;
    var _queries = window.HouseholdQueries;

    // =========================================================================
    // 4. ICON HELPERS
    // =========================================================================

    function _getIconSafe(name) {
        var icon = _getIcon(name);
        return icon || '';
    }

    function _iconSpan(icon, title) {
        if (!icon) return '';
        var titleAttr = title ? ' title="' + _escapeHtml(title) + '"' : '';
        return '<span style="display:inline-flex;align-items:center;vertical-align:middle;' + (title ? 'cursor:help;' : '') + '"' + titleAttr + '>' + icon + '</span>';
    }

    // =========================================================================
    // 5. RESIDENCE DATA STORAGE
    // =========================================================================

    if (typeof window._residencesData === 'undefined') {
        window._residencesData = [];
    }

    function _getResidencesData() {
        if (window._residencesData && window._residencesData.length > 0) {
            return window._residencesData;
        }

        if (typeof window.masterData !== 'undefined' && window.masterData.data && window.masterData.data.residences) {
            window._residencesData = window.masterData.data.residences;
            return window._residencesData;
        }

        return window._residencesData;
    }

    function _setResidencesData(data) {
        window._residencesData = data;
        if (typeof window.masterData !== 'undefined' && window.masterData.data) {
            window.masterData.data.residences = data;
        }
    }

    function _initResidence(residence) {
        if (!residence) return;
        if (!residence.units) residence.units = [];
        if (!residence.unitCount) residence.unitCount = 0;
        if (!residence.occupiedUnits) residence.occupiedUnits = 0;
        if (!residence.vacantUnits) residence.vacantUnits = 0;
        if (!residence.status) residence.status = RESIDENCE_STATUS.ACTIVE;
        if (!residence.history) residence.history = [];
        if (!residence.notes) residence.notes = '';
        if (!residence.nameHistory) residence.nameHistory = [];
        if (!residence.timeline) residence.timeline = [];
        if (!residence.associationHistory) residence.associationHistory = [];
        if (!residence.vacancyHistory) residence.vacancyHistory = [];
        if (!residence.features) residence.features = [];
        if (!residence.staffPositions) residence.staffPositions = [];
        if (!residence.staffAssignments) residence.staffAssignments = [];
        if (residence.foundedYear === undefined) residence.foundedYear = _getCurrentYear();
        if (residence.lastUpdated === undefined) residence.lastUpdated = _getCurrentYear();

        // DEMOLITION FIELDS
        if (residence.isDemolished === undefined) residence.isDemolished = false;
        if (residence.demolishedAt === undefined) residence.demolishedAt = null;
        if (residence.demolishedReason === undefined) residence.demolishedReason = null;
        if (residence.destroyedBy === undefined) residence.destroyedBy = null;
        if (residence.disasterId === undefined) residence.disasterId = null;
        if (residence.demolishedRecord === undefined) residence.demolishedRecord = null;
        if (residence.damageHistory === undefined) residence.damageHistory = [];

        // ================================================================
        // RENTAL FIELDS (NEW)
        // ================================================================
        if (residence.ownerType === undefined) residence.ownerType = null;
        if (residence.ownerId === undefined) residence.ownerId = null;
        if (residence.ownerName === undefined) residence.ownerName = null;
        if (residence.ownerSince === undefined) residence.ownerSince = null;

        if (residence.renterType === undefined) residence.renterType = null;
        if (residence.renterId === undefined) residence.renterId = null;
        if (residence.renterName === undefined) residence.renterName = null;
        if (residence.rentAmount === undefined) residence.rentAmount = 0;
        if (residence.rentStartYear === undefined) residence.rentStartYear = null;
        if (residence.rentEffectiveYear === undefined) residence.rentEffectiveYear = null;
        if (residence.rentalStatus === undefined) residence.rentalStatus = RENTAL_STATUS.VACANT;

        if (residence.ownershipHistory === undefined) residence.ownershipHistory = [];
        if (residence.rentalHistory === undefined) residence.rentalHistory = [];
        if (residence.rentPayments === undefined) residence.rentPayments = [];
    }

    // =========================================================================
    // 6. RESIDENCE CRUD OPERATIONS
    // =========================================================================

    function createResidence(name, locationId, typeId, options) {
        if (_processingResidence) {
            _showToast('Already processing a residence operation', 'warning');
            return null;
        }
        _processingResidence = true;

        try {
            options = options || {};

            if (!name || typeof name !== 'string' || name.trim() === '') {
                _showToast('Residence name is required', 'error');
                return null;
            }

            var location = _getPlaceById(locationId);
            if (!location) {
                _showToast('Location not found', 'error');
                return null;
            }

            var type = RESIDENCE_TYPES[typeId.toUpperCase()];
            if (!type) {
                _showToast('Invalid residence type', 'error');
                return null;
            }

            var currentYear = _getCurrentYear();
            var residences = _getResidencesData();

            var newResidence = {
                id: _generateId('res'),
                name: name.trim(),
                locationId: locationId,
                locationName: location.displayName || location.name || 'Unknown',
                typeId: type.id,
                typeName: type.name,
                typeIcon: type.icon,
                isMultiUnit: type.isMultiUnit || false,
                capacity: type.capacity || 10,
                units: [],
                unitCount: 0,
                occupiedUnits: 0,
                vacantUnits: 0,
                foundedYear: options.foundedYear || currentYear,
                builtYear: options.builtYear || currentYear,
                status: RESIDENCE_STATUS.ACTIVE,
                notes: options.notes || '',
                description: options.description || '',
                history: [],
                timeline: [],
                nameHistory: [],
                associationHistory: [],
                vacancyHistory: [],
                features: options.features || [],
                lastUpdated: currentYear,
                createdAt: Date.now(),
                householdId: options.householdId || null,
                householdName: options.householdName || null,
                assignedYear: options.assignedYear || null,
                isVacant: !options.householdId,
                isDemolished: false,
                demolishedAt: null,
                demolishedReason: null,
                destroyedBy: null,
                disasterId: null,
                demolishedRecord: null,
                damageHistory: [],
                condition: options.condition || 'good',
                estimatedValue: options.estimatedValue || Math.round(100 + Math.random() * 900),
                previousHouseholdId: null,
                previousHouseholdName: null,
                maxUnits: options.maxUnits || 20,
                suppressVacancyAlerts: false,
                staffPositions: options.staffPositions || [],
                staffAssignments: options.staffAssignments || [],

                // ============================================================
                // RENTAL FIELDS (NEW)
                // ============================================================
                ownerType: options.ownerType || null,
                ownerId: options.ownerId || null,
                ownerName: options.ownerName || null,
                ownerSince: options.ownerSince || null,

                renterType: null,
                renterId: null,
                renterName: null,
                rentAmount: 0,
                rentStartYear: null,
                rentEffectiveYear: null,
                rentalStatus: RENTAL_STATUS.VACANT,

                ownershipHistory: [],
                rentalHistory: [],
                rentPayments: []
            };

            if (type.isMultiUnit) {
                var unitCount = options.unitCount || Math.min(10, Math.floor(type.capacity / 3));
                for (var i = 1; i <= unitCount; i++) {
                    newResidence.units.push({
                        id: _generateId('unit'),
                        unitNumber: i,
                        householdId: null,
                        householdName: null,
                        isVacant: true,
                        isDemolished: false,
                        assignedYear: null,
                        vacantYear: null,
                        notes: '',
                        associationHistory: [],
                        staffAssignments: []
                    });
                }
                newResidence.unitCount = unitCount;
                newResidence.vacantUnits = unitCount;
                newResidence.occupiedUnits = 0;
            } else {
                newResidence.units.push({
                    id: _generateId('unit'),
                    unitNumber: 1,
                    householdId: newResidence.householdId || null,
                    householdName: newResidence.householdName || null,
                    isVacant: !newResidence.householdId,
                    isDemolished: false,
                    assignedYear: newResidence.assignedYear || null,
                    vacantYear: null,
                    notes: '',
                    associationHistory: [],
                    staffAssignments: []
                });
                newResidence.unitCount = 1;
                newResidence.vacantUnits = newResidence.householdId ? 0 : 1;
                newResidence.occupiedUnits = newResidence.householdId ? 1 : 0;
            }

            newResidence.timeline.push({
                year: currentYear,
                type: 'built',
                details: 'Residence "' + newResidence.name + '" was built',
                timestamp: Date.now()
            });

            newResidence.nameHistory.push({
                oldName: null,
                newName: newResidence.name,
                year: currentYear,
                reason: 'Built',
                changedBy: options.founderId || 'System',
                timestamp: Date.now()
            });

            residences.push(newResidence);
            _setResidencesData(residences);
            _saveMasterData();
            _invalidateAccessorCaches();

            _logEvent('residence', 'Residence Created',
                'Created residence: ' + newResidence.name + ' (' + type.name + ')',
                []);
            _showToast('Created residence: ' + newResidence.name, 'success');

            return newResidence;

        } finally {
            _processingResidence = false;
        }
    }

    function getResidenceById(residenceId) {
        if (!residenceId) return null;
        var residences = _getResidencesData();
        for (var i = 0; i < residences.length; i++) {
            if (residences[i].id === residenceId) {
                _initResidence(residences[i]);
                return residences[i];
            }
        }
        return null;
    }

    function getResidences() {
        var residences = _getResidencesData();
        for (var i = 0; i < residences.length; i++) {
            _initResidence(residences[i]);
        }
        return residences;
    }

    function getResidencesByLocation(locationId) {
        if (!locationId) return getResidences();
        var residences = _getResidencesData();
        var result = [];
        for (var i = 0; i < residences.length; i++) {
            if (residences[i].locationId === locationId) {
                _initResidence(residences[i]);
                result.push(residences[i]);
            }
        }
        return result;
    }

    function getResidencesByType(typeId) {
        var residences = _getResidencesData();
        var result = [];
        for (var i = 0; i < residences.length; i++) {
            if (residences[i].typeId === typeId) {
                _initResidence(residences[i]);
                result.push(residences[i]);
            }
        }
        return result;
    }

    function getResidencesByStatus(status) {
        var residences = _getResidencesData();
        var result = [];
        for (var i = 0; i < residences.length; i++) {
            if (residences[i].status === status) {
                _initResidence(residences[i]);
                result.push(residences[i]);
            }
        }
        return result;
    }

    function getResidencesByHousehold(householdId) {
        if (!householdId) return [];
        var residences = _getResidencesData();
        var result = [];
        for (var i = 0; i < residences.length; i++) {
            var r = residences[i];
            _initResidence(r);
            if (r.householdId === householdId) {
                result.push(r);
                continue;
            }
            if (r.units) {
                for (var j = 0; j < r.units.length; j++) {
                    if (r.units[j].householdId === householdId) {
                        result.push(r);
                        break;
                    }
                }
            }
        }
        return result;
    }

    function updateResidence(residenceId, updates) {
        if (_processingResidence) {
            _showToast('Already processing a residence operation', 'warning');
            return null;
        }
        _processingResidence = true;

        try {
            var residence = getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                return null;
            }

            var allowedUpdates = ['name', 'locationId', 'notes', 'status', 'foundedYear', 'builtYear', 'condition', 'description', 'features', 'estimatedValue', 'isDemolished', 'demolishedAt', 'demolishedReason', 'destroyedBy', 'disasterId', 'demolishedRecord', 'damageHistory', 'ownerType', 'ownerId', 'ownerName', 'ownerSince', 'renterType', 'renterId', 'renterName', 'rentAmount', 'rentStartYear', 'rentEffectiveYear', 'rentalStatus'];
            for (var i = 0; i < allowedUpdates.length; i++) {
                var key = allowedUpdates[i];
                if (updates[key] !== undefined && updates[key] !== null) {
                    if (key === 'locationId') {
                        var location = _getPlaceById(updates[key]);
                        if (location) {
                            residence[key] = updates[key];
                            residence.locationName = location.displayName || location.name || 'Unknown';
                        }
                    } else if (key === 'name') {
                        var oldName = residence.name;
                        residence[key] = updates[key].trim();
                        if (oldName !== residence.name) {
                            addResidenceHistory(residenceId, 'renamed', 'Renamed from "' + oldName + '" to "' + residence.name + '"');
                            addResidenceTimelineEvent(residenceId, {
                                year: _getCurrentYear(),
                                type: 'renamed',
                                details: 'Renamed from "' + oldName + '" to "' + residence.name + '"'
                            });
                        }
                    } else if (key === 'status') {
                        var oldStatus = residence.status;
                        residence[key] = updates[key];
                        if (oldStatus !== residence.status) {
                            addResidenceHistory(residenceId, 'status_changed', 'Status changed from ' + oldStatus + ' to ' + residence.status);
                            addResidenceTimelineEvent(residenceId, {
                                year: _getCurrentYear(),
                                type: 'status_changed',
                                details: 'Status changed to ' + residence.status
                            });
                        }
                    } else if (key === 'condition') {
                        var oldCondition = residence.condition;
                        residence[key] = updates[key];
                        if (oldCondition !== residence.condition) {
                            addResidenceTimelineEvent(residenceId, {
                                year: _getCurrentYear(),
                                type: 'condition_changed',
                                details: 'Condition changed from ' + oldCondition + ' to ' + residence.condition
                            });
                        }
                    } else if (key === 'features') {
                        residence[key] = updates[key] || [];
                    } else {
                        residence[key] = updates[key];
                    }
                }
            }

            residence.lastUpdated = _getCurrentYear();
            _setResidencesData(_getResidencesData());
            _saveMasterData();
            _invalidateAccessorCaches();

            _showToast('Updated residence: ' + residence.name, 'success');
            return residence;

        } finally {
            _processingResidence = false;
        }
    }

    function deleteResidence(residenceId, options) {
        if (_processingResidence) {
            _showToast('Already processing a residence operation', 'warning');
            return false;
        }
        _processingResidence = true;

        try {
            options = options || {};
            var residences = _getResidencesData();
            var index = -1;
            for (var i = 0; i < residences.length; i++) {
                if (residences[i].id === residenceId) {
                    index = i;
                    break;
                }
            }

            if (index === -1) {
                _showToast('Residence not found', 'error');
                return false;
            }

            var residence = residences[index];

            if (!options.force) {
                for (var i = 0; i < residence.units.length; i++) {
                    if (!residence.units[i].isVacant) {
                        _showToast('Cannot delete residence with occupied units', 'error');
                        return false;
                    }
                }
            }

            residences.splice(index, 1);
            _setResidencesData(residences);
            _saveMasterData();
            _invalidateAccessorCaches();

            _logEvent('residence', 'Residence Deleted',
                'Deleted residence: ' + residence.name,
                []);
            _showToast('Deleted residence: ' + residence.name, 'info');
            return true;

        } finally {
            _processingResidence = false;
        }
    }

    // =========================================================================
    // 7. RESIDENCE HISTORY
    // =========================================================================

    function addResidenceHistory(residenceId, action, details, actorId) {
        var residence = getResidenceById(residenceId);
        if (!residence) return false;

        if (!residence.history) residence.history = [];

        residence.history.push({
            year: _getCurrentYear(),
            action: action,
            details: details,
            actorId: actorId || null,
            timestamp: Date.now()
        });

        if (residence.history.length > 50) {
            residence.history = residence.history.slice(-50);
        }

        residence.lastUpdated = _getCurrentYear();
        _saveMasterData();
        return true;
    }

    function getResidenceHistory(residenceId, limit) {
        var residence = getResidenceById(residenceId);
        if (!residence || !residence.history) return [];

        limit = limit || 20;
        var history = residence.history.slice(-limit);
        history.reverse();
        return history;
    }

    // =========================================================================
    // 8. RESIDENCE TIMELINE
    // =========================================================================

    function getResidenceTimeline(residenceId, limit) {
        var residence = getResidenceById(residenceId);
        if (!residence || !residence.timeline) return [];

        limit = limit || 50;
        var timeline = residence.timeline.slice(-limit);
        timeline.reverse();
        return timeline;
    }

    function addResidenceTimelineEvent(residenceId, event) {
        var residence = getResidenceById(residenceId);
        if (!residence) return false;

        if (!residence.timeline) residence.timeline = [];

        residence.timeline.push({
            year: event.year || _getCurrentYear(),
            type: event.type || 'event',
            details: event.details || '',
            householdName: event.householdName || null,
            unitNumber: event.unitNumber || null,
            timestamp: Date.now()
        });

        if (residence.timeline.length > 100) {
            residence.timeline = residence.timeline.slice(-100);
        }

        residence.lastUpdated = _getCurrentYear();
        _saveMasterData();
        return true;
    }

    // =========================================================================
    // 9. RESIDENCE ASSOCIATION
    // =========================================================================

    function getResidenceAssociationHistory(residenceId) {
        var residence = getResidenceById(residenceId);
        if (!residence || !residence.associationHistory) return [];
        return residence.associationHistory;
    }

    function endResidenceAssociation(residenceId, householdId, endedYear, reason) {
        if (_processingResidence) {
            return false;
        }
        _processingResidence = true;

        try {
            var residence = getResidenceById(residenceId);
            if (!residence) return false;

            if (!residence.associationHistory) residence.associationHistory = [];

            for (var i = 0; i < residence.associationHistory.length; i++) {
                if (residence.associationHistory[i].householdId === householdId && !residence.associationHistory[i].endedYear) {
                    residence.associationHistory[i].endedYear = endedYear || _getCurrentYear();
                    residence.associationHistory[i].reason = reason || 'Ended';
                    residence.associationHistory[i].endedAt = Date.now();

                    residence.householdId = null;
                    residence.householdName = null;
                    residence.assignedYear = null;
                    residence.isVacant = true;
                    residence.vacantYear = endedYear || _getCurrentYear();
                    residence.vacantReason = 'Association ended: ' + (reason || 'Ended');
                    residence.previousHouseholdId = householdId;
                    residence.previousHouseholdName = residence.associationHistory[i].householdName;

                    if (!residence.vacancyHistory) residence.vacancyHistory = [];
                    residence.vacancyHistory.push({
                        startedVacantYear: endedYear || _getCurrentYear(),
                        previousHouseholdId: householdId,
                        previousHouseholdName: residence.associationHistory[i].householdName,
                        reason: reason || 'Ended',
                        endedVacantYear: null,
                        endedByHouseholdId: null,
                        endedByHouseholdName: null
                    });

                    addResidenceTimelineEvent(residenceId, {
                        year: endedYear || _getCurrentYear(),
                        type: 'association_ended',
                        details: 'Association ended with ' + residence.associationHistory[i].householdName + (reason ? ' (' + reason + ')' : ''),
                        householdName: residence.associationHistory[i].householdName
                    });

                    _saveMasterData();
                    _invalidateAccessorCaches();
                    return true;
                }
            }
            return false;

        } finally {
            _processingResidence = false;
        }
    }

    // =========================================================================
    // 10. RESIDENCE NAME HISTORY
    // =========================================================================

    function getResidenceNameHistory(residenceId) {
        var residence = getResidenceById(residenceId);
        if (!residence || !residence.nameHistory) return [];
        return residence.nameHistory;
    }

    function getResidenceCurrentNameInfo(residenceId) {
        var residence = getResidenceById(residenceId);
        if (!residence) return null;

        var history = residence.nameHistory || [];
        if (history.length === 0) {
            return {
                since: residence.builtYear || residence.foundedYear || 'Unknown',
                original: residence.name
            };
        }

        var lastChange = history[history.length - 1];
        return {
            since: lastChange.year || 'Unknown',
            original: history[0] ? history[0].oldName : residence.name,
            lastChange: lastChange
        };
    }

    function getResidenceOriginalName(residenceId) {
        var residence = getResidenceById(residenceId);
        if (!residence) return 'Unknown';

        var history = residence.nameHistory || [];
        if (history.length === 0) return residence.name;
        return history[0].oldName || residence.name;
    }

    function getResidenceNameChangeCount(residenceId) {
        var residence = getResidenceById(residenceId);
        if (!residence || !residence.nameHistory) return 0;
        return residence.nameHistory.length;
    }

    function updateResidenceNameWithHistory(residenceId, newName, options) {
        if (_processingResidence) {
            return { success: false, reason: 'Already processing a residence operation' };
        }
        _processingResidence = true;

        try {
            options = options || {};
            var residence = getResidenceById(residenceId);
            if (!residence) {
                return { success: false, reason: 'Residence not found' };
            }

            var oldName = residence.name;
            if (oldName === newName) {
                return { success: false, reason: 'New name is the same as current name' };
            }

            var year = options.year || _getCurrentYear();
            var reason = options.reason || 'Renamed';
            var changedBy = options.changedBy || 'System';
            var addToHistory = options.addToHistory !== false;

            if (addToHistory) {
                if (!residence.nameHistory) residence.nameHistory = [];
                residence.nameHistory.push({
                    oldName: oldName,
                    newName: newName,
                    year: year,
                    reason: reason,
                    changedBy: changedBy,
                    timestamp: Date.now()
                });
            }

            residence.name = newName;
            residence.lastUpdated = _getCurrentYear();

            addResidenceTimelineEvent(residenceId, {
                year: year,
                type: 'renamed',
                details: 'Renamed from "' + oldName + '" to "' + newName + '"' + (reason ? ' (' + reason + ')' : '')
            });

            _saveMasterData();
            _invalidateAccessorCaches();

            return {
                success: true,
                oldName: oldName,
                newName: newName,
                year: year,
                reason: reason
            };

        } finally {
            _processingResidence = false;
        }
    }

    function getFormattedResidenceNameHistory(residenceId, limit) {
        var history = getResidenceNameHistory(residenceId);
        if (history.length === 0) return [];

        limit = limit || history.length;
        var sorted = history.slice().sort(function(a, b) { return a.year - b.year; });
        var result = [];
        var currentName = null;

        for (var i = 0; i < sorted.length && i < limit; i++) {
            var entry = sorted[i];
            result.push({
                year: entry.year,
                from: entry.oldName,
                to: entry.newName,
                reason: entry.reason || null,
                changedBy: entry.changedBy || null
            });
            currentName = entry.newName;
        }

        return result;
    }

    // =========================================================================
    // 11. UNIT MANAGEMENT
    // =========================================================================

    function addResidenceUnit(residenceId, options) {
        if (_processingResidence) {
            return { success: false, reason: 'Already processing a residence operation' };
        }
        _processingResidence = true;

        try {
            options = options || {};
            var residence = getResidenceById(residenceId);
            if (!residence) {
                return { success: false, reason: 'Residence not found' };
            }

            if (!residence.isMultiUnit) {
                return { success: false, reason: 'Cannot add units to a non-multi-unit residence' };
            }

            var maxUnits = residence.maxUnits || 20;
            if (residence.units.length >= maxUnits) {
                return { success: false, reason: 'Maximum units reached (' + maxUnits + ')' };
            }

            var unitNumber = options.unitNumber || residence.units.length + 1;

            for (var i = 0; i < residence.units.length; i++) {
                if (residence.units[i].unitNumber === unitNumber) {
                    return { success: false, reason: 'Unit number ' + unitNumber + ' already exists' };
                }
            }

            var newUnit = {
                id: _generateId('unit'),
                unitNumber: unitNumber,
                householdId: options.householdId || null,
                householdName: options.householdName || null,
                isVacant: !options.householdId,
                isDemolished: false,
                assignedYear: options.assignedYear || null,
                vacantYear: null,
                notes: options.notes || '',
                associationHistory: [],
                staffAssignments: []
            };

            residence.units.push(newUnit);
            residence.unitCount = residence.units.length;
            if (newUnit.isVacant) {
                residence.vacantUnits++;
            } else {
                residence.occupiedUnits++;
            }
            residence.lastUpdated = _getCurrentYear();

            addResidenceHistory(residenceId, 'unit_added', 'Added Unit ' + unitNumber);
            addResidenceTimelineEvent(residenceId, {
                year: _getCurrentYear(),
                type: 'unit_added',
                details: 'Unit ' + unitNumber + ' was added',
                unitNumber: unitNumber
            });

            _saveMasterData();
            _invalidateAccessorCaches();

            _showToast('Added Unit ' + unitNumber + ' to ' + residence.name, 'success');
            return { success: true, unitNumber: unitNumber, unit: newUnit };

        } finally {
            _processingResidence = false;
        }
    }

    function removeResidenceUnit(residenceId, unitNumber, options) {
        if (_processingResidence) {
            return { success: false, reason: 'Already processing a residence operation' };
        }
        _processingResidence = true;

        try {
            options = options || {};
            var residence = getResidenceById(residenceId);
            if (!residence) {
                return { success: false, reason: 'Residence not found' };
            }

            var unit = getResidenceUnit(residenceId, unitNumber);
            if (!unit) {
                return { success: false, reason: 'Unit not found' };
            }

            if (!unit.isVacant && !options.force) {
                return { success: false, reason: 'Unit is occupied' };
            }

            if (unit.isDemolished) {
                return { success: false, reason: 'Unit already demolished' };
            }

            var index = -1;
            for (var i = 0; i < residence.units.length; i++) {
                if (residence.units[i].unitNumber === unitNumber) {
                    index = i;
                    break;
                }
            }

            if (index === -1) {
                return { success: false, reason: 'Unit not found' };
            }

            if (!unit.isVacant) {
                var householdName = unit.householdName || 'Unknown';
                unit.isVacant = true;
                unit.householdId = null;
                unit.householdName = null;
                unit.vacantYear = _getCurrentYear();
                residence.occupiedUnits--;
                residence.vacantUnits++;

                addResidenceTimelineEvent(residenceId, {
                    year: _getCurrentYear(),
                    type: 'unit_vacated',
                    details: 'Unit ' + unitNumber + ' vacated by ' + householdName,
                    unitNumber: unitNumber,
                    householdName: householdName
                });
            }

            residence.units.splice(index, 1);
            residence.unitCount = residence.units.length;
            residence.vacantUnits--;
            residence.lastUpdated = _getCurrentYear();

            addResidenceHistory(residenceId, 'unit_removed', 'Removed Unit ' + unitNumber + (options.reason ? ' (' + options.reason + ')' : ''));
            addResidenceTimelineEvent(residenceId, {
                year: _getCurrentYear(),
                type: 'unit_removed',
                details: 'Unit ' + unitNumber + ' was removed' + (options.reason ? ' (' + options.reason + ')' : ''),
                unitNumber: unitNumber
            });

            _saveMasterData();
            _invalidateAccessorCaches();

            _showToast('Unit ' + unitNumber + ' removed from ' + residence.name, 'success');
            return { success: true, unitNumber: unitNumber };

        } finally {
            _processingResidence = false;
        }
    }

    function getResidenceUnits(residenceId) {
        var residence = getResidenceById(residenceId);
        return residence ? (residence.units || []) : [];
    }

    function getResidenceUnit(residenceId, unitNumber) {
        var units = getResidenceUnits(residenceId);
        for (var i = 0; i < units.length; i++) {
            if (units[i].unitNumber === unitNumber) {
                return units[i];
            }
        }
        return null;
    }

    function getVacantUnits(residenceId) {
        var units = getResidenceUnits(residenceId);
        var result = [];
        for (var i = 0; i < units.length; i++) {
            if (units[i].isVacant && !units[i].isDemolished) {
                result.push(units[i]);
            }
        }
        return result;
    }

    function getOccupiedUnits(residenceId) {
        var units = getResidenceUnits(residenceId);
        var result = [];
        for (var i = 0; i < units.length; i++) {
            if (!units[i].isVacant && !units[i].isDemolished) {
                result.push(units[i]);
            }
        }
        return result;
    }

    function assignHouseholdToUnit(residenceId, unitNumber, householdId, householdName, year, options) {
        if (_processingAssignment) {
            return { success: false, reason: 'Already processing an assignment' };
        }
        _processingAssignment = true;

        try {
            options = options || {};
            var residence = getResidenceById(residenceId);
            if (!residence) {
                return { success: false, reason: 'Residence not found' };
            }

            var unit = getResidenceUnit(residenceId, unitNumber);
            if (!unit) {
                return { success: false, reason: 'Unit not found' };
            }

            if (!unit.isVacant) {
                return { success: false, reason: 'Unit is already occupied' };
            }

            if (unit.isDemolished) {
                return { success: false, reason: 'Unit has been demolished' };
            }

            var household = _getHousehold(householdId);
            if (!household) {
                return { success: false, reason: 'Household not found' };
            }

            var assignmentYear = year || _getCurrentYear();

            for (var i = 0; i < residence.units.length; i++) {
                if (residence.units[i].householdId === householdId && residence.units[i].unitNumber !== unitNumber) {
                    residence.units[i].isVacant = true;
                    residence.units[i].householdId = null;
                    residence.units[i].householdName = null;
                    residence.units[i].assignedYear = null;
                    residence.units[i].vacantYear = assignmentYear;
                    residence.occupiedUnits--;
                    residence.vacantUnits++;
                }
            }

            if (!unit.associationHistory) unit.associationHistory = [];
            if (unit.householdId) {
                unit.associationHistory.push({
                    householdId: unit.householdId,
                    householdName: unit.householdName,
                    year: unit.assignedYear || assignmentYear,
                    endedYear: assignmentYear,
                    reason: 'Moved to different unit'
                });
            }

            unit.householdId = householdId;
            unit.householdName = householdName || household.name;
            unit.isVacant = false;
            unit.assignedYear = assignmentYear;
            unit.vacantYear = null;
            unit.notes = options.notes || '';

            residence.occupiedUnits = (residence.occupiedUnits || 0) + 1;
            residence.vacantUnits = Math.max(0, (residence.vacantUnits || 0) - 1);
            residence.householdId = householdId;
            residence.householdName = householdName || household.name;
            residence.assignedYear = assignmentYear;
            residence.lastUpdated = _getCurrentYear();
            residence.isVacant = false;

            if (!residence.associationHistory) residence.associationHistory = [];
            residence.associationHistory.push({
                householdId: householdId,
                householdName: householdName || household.name,
                year: assignmentYear,
                endedYear: null,
                reason: 'Assigned to Unit ' + unitNumber,
                unitNumber: unitNumber,
                endedAt: null
            });

            if (_state && typeof _state.updateHousehold === 'function') {
                _state.updateHousehold(householdId, {
                    residenceId: residenceId,
                    residenceName: residence.name,
                    residenceType: residence.typeId,
                    associatedYear: assignmentYear,
                    residenceUnitNumber: unitNumber,
                    residenceNotes: options.notes || ''
                }, { recordHistory: false });
            }

            addResidenceHistory(residenceId, 'unit_assigned', 'Assigned ' + householdName + ' to Unit ' + unitNumber);
            addResidenceTimelineEvent(residenceId, {
                year: assignmentYear,
                type: 'unit_assigned',
                details: householdName + ' assigned to Unit ' + unitNumber,
                householdName: householdName,
                unitNumber: unitNumber
            });

            if (typeof _addHouseholdActivityLog === 'function') {
                _addHouseholdActivityLog(householdId, 'unit_assigned',
                    householdName + ' assigned to Unit ' + unitNumber + ' of ' + residence.name);
            }

            _saveMasterData();
            _invalidateAccessorCaches();

            _logEvent('residence', 'Unit Assigned',
                householdName + ' assigned to Unit ' + unitNumber + ' of ' + residence.name,
                []);
            _showToast(householdName + ' assigned to Unit ' + unitNumber + ' of ' + residence.name, 'success');

            return {
                success: true,
                unit: unit,
                unitNumber: unitNumber,
                residence: residence,
                year: assignmentYear,
                renamed: false
            };

        } finally {
            _processingAssignment = false;
        }
    }

    function markUnitVacant(residenceId, unitNumber, reason, year) {
        if (_processingResidence) {
            return { success: false, reason: 'Already processing a residence operation' };
        }
        _processingResidence = true;

        try {
            var residence = getResidenceById(residenceId);
            if (!residence) {
                return { success: false, reason: 'Residence not found' };
            }

            var unit = getResidenceUnit(residenceId, unitNumber);
            if (!unit) {
                return { success: false, reason: 'Unit not found' };
            }

            if (unit.isVacant) {
                return { success: false, reason: 'Unit is already vacant' };
            }

            if (unit.isDemolished) {
                return { success: false, reason: 'Unit has been demolished' };
            }

            var vacatedYear = year || _getCurrentYear();
            var householdId = unit.householdId;
            var householdName = unit.householdName || 'Unknown Household';

            if (!unit.associationHistory) unit.associationHistory = [];
            unit.associationHistory.push({
                householdId: householdId,
                householdName: householdName,
                year: unit.assignedYear || vacatedYear,
                endedYear: vacatedYear,
                reason: reason || 'Vacated'
            });

            unit.householdId = null;
            unit.householdName = null;
            unit.isVacant = true;
            unit.assignedYear = null;
            unit.vacantYear = vacatedYear;
            unit.notes = (unit.notes ? unit.notes + '; ' : '') + 'Vacated in ' + vacatedYear + ': ' + (reason || 'Vacated');

            residence.occupiedUnits = Math.max(0, (residence.occupiedUnits || 0) - 1);
            residence.vacantUnits = (residence.vacantUnits || 0) + 1;
            residence.lastUpdated = _getCurrentYear();

            var anyOccupied = false;
            for (var i = 0; i < residence.units.length; i++) {
                if (!residence.units[i].isVacant) {
                    anyOccupied = true;
                    break;
                }
            }
            if (!anyOccupied) {
                residence.householdId = null;
                residence.householdName = null;
                residence.assignedYear = null;
                residence.isVacant = true;
                residence.vacantYear = vacatedYear;
                residence.vacantReason = reason || 'All units vacated';
                residence.previousHouseholdId = householdId;
                residence.previousHouseholdName = householdName;
            }

            if (_state && typeof _state.updateHousehold === 'function' && householdId) {
                _state.updateHousehold(householdId, {
                    residenceId: null,
                    residenceName: null,
                    residenceType: null,
                    associatedYear: null,
                    residenceUnitNumber: null,
                    residenceNotes: null
                }, { recordHistory: false });
            }

            addResidenceHistory(residenceId, 'unit_vacated', 'Vacated Unit ' + unitNumber + ' (' + householdName + '): ' + (reason || 'Vacated'));
            addResidenceTimelineEvent(residenceId, {
                year: vacatedYear,
                type: 'unit_vacated',
                details: 'Unit ' + unitNumber + ' vacated by ' + householdName + (reason ? ' (' + reason + ')' : ''),
                householdName: householdName,
                unitNumber: unitNumber
            });

            if (typeof _addHouseholdActivityLog === 'function' && householdId) {
                _addHouseholdActivityLog(householdId, 'unit_vacated',
                    householdName + ' vacated Unit ' + unitNumber + ' of ' + residence.name + ': ' + (reason || 'Vacated'));
            }

            _saveMasterData();
            _invalidateAccessorCaches();

            _logEvent('residence', 'Unit Vacated',
                'Unit ' + unitNumber + ' of ' + residence.name + ' vacated by ' + householdName,
                []);
            _showToast('Unit ' + unitNumber + ' of ' + residence.name + ' vacated', 'info');

            return {
                success: true,
                unit: unit,
                unitNumber: unitNumber,
                residence: residence,
                year: vacatedYear,
                householdId: householdId,
                householdName: householdName
            };

        } finally {
            _processingResidence = false;
        }
    }

    function demolishUnit(residenceId, unitNumber, reason, year) {
        if (_processingResidence) {
            return { success: false, reason: 'Already processing a residence operation' };
        }
        _processingResidence = true;

        try {
            var residence = getResidenceById(residenceId);
            if (!residence) {
                return { success: false, reason: 'Residence not found' };
            }

            var unit = getResidenceUnit(residenceId, unitNumber);
            if (!unit) {
                return { success: false, reason: 'Unit not found' };
            }

            if (unit.isDemolished) {
                return { success: false, reason: 'Unit is already demolished' };
            }

            if (!unit.isVacant) {
                return { success: false, reason: 'Cannot demolish occupied unit' };
            }

            var demolishedYear = year || _getCurrentYear();

            unit.isDemolished = true;
            unit.notes = (unit.notes ? unit.notes + '; ' : '') + 'Demolished in ' + demolishedYear + ': ' + (reason || 'Demolished');

            residence.vacantUnits = Math.max(0, (residence.vacantUnits || 0) - 1);
            residence.lastUpdated = _getCurrentYear();

            addResidenceHistory(residenceId, 'unit_demolished', 'Demolished Unit ' + unitNumber + ': ' + (reason || 'Demolished'));
            addResidenceTimelineEvent(residenceId, {
                year: demolishedYear,
                type: 'unit_demolished',
                details: 'Unit ' + unitNumber + ' demolished' + (reason ? ' (' + reason + ')' : ''),
                unitNumber: unitNumber
            });

            _saveMasterData();
            _invalidateAccessorCaches();

            _logEvent('residence', 'Unit Demolished',
                'Unit ' + unitNumber + ' of ' + residence.name + ' demolished',
                []);
            _showToast('Unit ' + unitNumber + ' of ' + residence.name + ' demolished', 'info');

            return {
                success: true,
                unit: unit,
                unitNumber: unitNumber,
                residence: residence,
                year: demolishedYear
            };

        } finally {
            _processingResidence = false;
        }
    }

    // =========================================================================
    // 12. VACANCY MANAGEMENT
    // =========================================================================

    function getVacantResidences(locationId) {
        var residences = locationId ? getResidencesByLocation(locationId) : getResidences();
        var vacant = [];
        for (var i = 0; i < residences.length; i++) {
            if (residences[i].isVacant && !residences[i].isDemolished) {
                vacant.push(residences[i]);
            }
        }
        return vacant;
    }

    function markResidenceVacant(residenceId, reason, year) {
        if (_processingResidence) {
            return { success: false, reason: 'Already processing a residence operation' };
        }
        _processingResidence = true;

        try {
            var residence = getResidenceById(residenceId);
            if (!residence) {
                return { success: false, reason: 'Residence not found' };
            }

            if (residence.isVacant) {
                return { success: false, reason: 'Residence is already vacant' };
            }

            if (residence.isDemolished) {
                return { success: false, reason: 'Residence has been demolished' };
            }

            var vacantYear = year || _getCurrentYear();
            var oldHouseholdId = residence.householdId;
            var oldHouseholdName = residence.householdName || 'Unknown';

            if (!residence.vacancyHistory) residence.vacancyHistory = [];
            residence.vacancyHistory.push({
                startedVacantYear: vacantYear,
                previousHouseholdId: oldHouseholdId,
                previousHouseholdName: oldHouseholdName,
                reason: reason || 'Manual',
                endedVacantYear: null,
                endedByHouseholdId: null,
                endedByHouseholdName: null
            });

            residence.isVacant = true;
            residence.vacantYear = vacantYear;
            residence.vacantReason = reason || 'Manual';
            residence.previousHouseholdId = oldHouseholdId;
            residence.previousHouseholdName = oldHouseholdName;
            residence.householdId = null;
            residence.householdName = null;
            residence.assignedYear = null;

            for (var i = 0; i < residence.units.length; i++) {
                var unit = residence.units[i];
                if (!unit.isVacant && !unit.isDemolished) {
                    if (!unit.associationHistory) unit.associationHistory = [];
                    unit.associationHistory.push({
                        householdId: unit.householdId,
                        householdName: unit.householdName || 'Unknown',
                        year: unit.assignedYear || vacantYear,
                        endedYear: vacantYear,
                        reason: 'Residence vacated: ' + (reason || 'Manual')
                    });
                    unit.isVacant = true;
                    unit.householdId = null;
                    unit.householdName = null;
                    unit.assignedYear = null;
                    unit.vacantYear = vacantYear;
                    residence.occupiedUnits--;
                    residence.vacantUnits++;
                }
            }

            residence.lastUpdated = _getCurrentYear();

            addResidenceHistory(residenceId, 'marked_vacant', 'Marked vacant: ' + (reason || 'Manual') + ' (Previous: ' + oldHouseholdName + ')');
            addResidenceTimelineEvent(residenceId, {
                year: vacantYear,
                type: 'vacant',
                details: 'Residence became vacant' + (reason ? ' (' + reason + ')' : ''),
                householdName: oldHouseholdName
            });

            if (oldHouseholdId && _state && typeof _state.updateHousehold === 'function') {
                _state.updateHousehold(oldHouseholdId, {
                    residenceId: null,
                    residenceName: null,
                    residenceType: null,
                    associatedYear: null,
                    residenceUnitNumber: null,
                    residenceNotes: null
                }, { recordHistory: false });
            }

            _saveMasterData();
            _invalidateAccessorCaches();

            _logEvent('residence', 'Residence Vacant',
                residence.name + ' marked vacant' + (reason ? ' (' + reason + ')' : ''),
                []);
            _showToast('Residence "' + residence.name + '" marked vacant', 'info');

            return {
                success: true,
                residence: residence,
                year: vacantYear,
                previousHousehold: oldHouseholdName
            };

        } finally {
            _processingResidence = false;
        }
    }

    function getResidenceVacancyDetails(residenceId) {
        var residence = getResidenceById(residenceId);
        if (!residence) return null;

        var currentYear = _getCurrentYear();
        var vacantDuration = residence.vacantYear ? currentYear - residence.vacantYear : 0;

        return {
            isVacant: residence.isVacant,
            vacantYear: residence.vacantYear,
            vacantDuration: vacantDuration,
            vacantReason: residence.vacantReason,
            previousHousehold: residence.previousHouseholdName || null,
            previousHouseholdId: residence.previousHouseholdId || null,
            vacancyHistory: residence.vacancyHistory || []
        };
    }

    function assignHouseholdToVacantResidence(residenceId, householdId, householdName, year, options) {
        if (_processingAssignment) {
            return { success: false, reason: 'Already processing an assignment' };
        }
        _processingAssignment = true;

        try {
            options = options || {};
            var residence = getResidenceById(residenceId);
            if (!residence) {
                return { success: false, reason: 'Residence not found' };
            }

            if (!residence.isVacant) {
                return { success: false, reason: 'Residence is not vacant' };
            }

            if (residence.isDemolished) {
                return { success: false, reason: 'Residence has been demolished' };
            }

            var household = _getHousehold(householdId);
            if (!household) {
                return { success: false, reason: 'Household not found' };
            }

            var assignmentYear = year || _getCurrentYear();
            var renameOnAssign = options.renameOnAssign || false;
            var newName = residence.name;

            if (renameOnAssign) {
                var pattern = options.namePattern || '{household} Manor';
                var suffix = options.suffix || 'Manor';
                var typeName = residence.typeName || 'Residence';
                newName = pattern.replace('{household}', household.name).replace('{suffix}', suffix).replace('{type}', typeName);
            }

            if (residence.vacancyHistory && residence.vacancyHistory.length > 0) {
                var lastVacancy = residence.vacancyHistory[residence.vacancyHistory.length - 1];
                if (!lastVacancy.endedVacantYear) {
                    lastVacancy.endedVacantYear = assignmentYear;
                    lastVacancy.endedByHouseholdId = householdId;
                    lastVacancy.endedByHouseholdName = household.name;
                }
            }

            residence.householdId = householdId;
            residence.householdName = householdName || household.name;
            residence.assignedYear = assignmentYear;
            residence.isVacant = false;
            residence.vacantYear = null;
            residence.vacantReason = null;
            residence.previousHouseholdId = null;
            residence.previousHouseholdName = null;

            if (!residence.associationHistory) residence.associationHistory = [];
            residence.associationHistory.push({
                householdId: householdId,
                householdName: householdName || household.name,
                year: assignmentYear,
                endedYear: null,
                reason: options.reason || 'Assigned',
                endedAt: null
            });

            var assignedUnit = null;
            for (var i = 0; i < residence.units.length; i++) {
                if (residence.units[i].isVacant && !residence.units[i].isDemolished) {
                    residence.units[i].householdId = householdId;
                    residence.units[i].householdName = householdName || household.name;
                    residence.units[i].isVacant = false;
                    residence.units[i].assignedYear = assignmentYear;
                    residence.units[i].vacantYear = null;
                    residence.occupiedUnits = (residence.occupiedUnits || 0) + 1;
                    residence.vacantUnits = Math.max(0, (residence.vacantUnits || 0) - 1);
                    assignedUnit = residence.units[i];
                    break;
                }
            }

            var renamed = false;
            if (renameOnAssign && newName !== residence.name) {
                var oldName = residence.name;
                var renameResult = updateResidenceNameWithHistory(residenceId, newName, {
                    year: assignmentYear,
                    reason: 'Assigned to ' + household.name,
                    changedBy: 'System',
                    addToHistory: true
                });
                if (renameResult && renameResult.success) {
                    renamed = true;
                    _showToast('Residence renamed to "' + newName + '"', 'success');
                }
            }

            residence.lastUpdated = _getCurrentYear();

            if (_state && typeof _state.updateHousehold === 'function') {
                _state.updateHousehold(householdId, {
                    residenceId: residenceId,
                    residenceName: residence.name,
                    residenceType: residence.typeId,
                    associatedYear: assignmentYear,
                    residenceUnitNumber: assignedUnit ? assignedUnit.unitNumber : null,
                    residenceNotes: options.notes || ''
                }, { recordHistory: false });
            }

            addResidenceHistory(residenceId, 'assigned',
                'Assigned to ' + household.name + (options.reason ? ' (' + options.reason + ')' : '') +
                (assignedUnit ? ' (Unit ' + assignedUnit.unitNumber + ')' : ''));

            addResidenceTimelineEvent(residenceId, {
                year: assignmentYear,
                type: 'assigned',
                details: 'Assigned to ' + household.name + (options.reason ? ' (' + options.reason + ')' : ''),
                householdName: household.name
            });

            if (typeof _addHouseholdActivityLog === 'function') {
                _addHouseholdActivityLog(householdId, 'residence_assigned',
                    household.name + ' assigned to ' + residence.name + (assignedUnit ? ' (Unit ' + assignedUnit.unitNumber + ')' : ''));
            }

            _saveMasterData();
            _invalidateAccessorCaches();

            _logEvent('residence', 'Residence Assigned',
                residence.name + ' assigned to ' + household.name,
                []);
            _showToast(household.name + ' assigned to "' + residence.name + '"' + (assignedUnit ? ' (Unit ' + assignedUnit.unitNumber + ')' : ''), 'success');

            return {
                success: true,
                residence: residence,
                household: household,
                unit: assignedUnit,
                unitNumber: assignedUnit ? assignedUnit.unitNumber : null,
                year: assignmentYear,
                renamed: renamed,
                newName: renamed ? newName : null
            };

        } finally {
            _processingAssignment = false;
        }
    }

    // =========================================================================
    // 13. REHABILITATION
    // =========================================================================

    function calculateRepairCost(residence, targetCondition) {
        if (!residence) return 0;

        var currentCondition = residence.condition || 'good';
        var baseValue = residence.estimatedValue || 1000;

        var conditionMultipliers = {
            'pristine': 1.0,
            'good': 0.8,
            'fair': 0.6,
            'poor': 0.4,
            'ruined': 0.2
        };

        var currentMultiplier = conditionMultipliers[currentCondition] || 0.5;
        var targetMultiplier = conditionMultipliers[targetCondition] || 0.8;

        var repairFactor = targetMultiplier - currentMultiplier;
        if (repairFactor <= 0) return 0;

        var baseCost = baseValue * repairFactor * 0.5;
        var randomFactor = 0.8 + (Math.random() * 0.4);
        return Math.round(baseCost * randomFactor);
    }

    function rehabilitateResidence(residenceId, targetCondition, year) {
        if (_processingResidence) {
            return { success: false, reason: 'Already processing a residence operation' };
        }
        _processingResidence = true;

        try {
            var residence = getResidenceById(residenceId);
            if (!residence) {
                return { success: false, reason: 'Residence not found' };
            }

            if (residence.isDemolished) {
                return { success: false, reason: 'Residence has been demolished' };
            }

            var oldCondition = residence.condition || 'good';
            if (oldCondition === targetCondition) {
                return { success: false, reason: 'Already at target condition' };
            }

            var cost = calculateRepairCost(residence, targetCondition);
            if (cost <= 0) {
                return { success: false, reason: 'No repair needed' };
            }

            var renovationYear = year || _getCurrentYear();
            var oldValue = residence.estimatedValue || 1000;

            residence.condition = targetCondition;
            residence.lastRenovated = renovationYear;
            residence.estimatedValue = Math.round(oldValue * (1 + (0.05 + Math.random() * 0.1)));
            residence.lastUpdated = _getCurrentYear();

            addResidenceHistory(residenceId, 'rehabilitated',
                'Rehabilitated from ' + oldCondition + ' to ' + targetCondition + ' (Cost: ' + cost + ' gold)');

            addResidenceTimelineEvent(residenceId, {
                year: renovationYear,
                type: 'rehabilitated',
                details: 'Rehabilitated from ' + oldCondition + ' to ' + targetCondition + ' (Cost: ' + cost + ' gold)'
            });

            _saveMasterData();
            _invalidateAccessorCaches();

            _logEvent('residence', 'Residence Rehabilitated',
                residence.name + ' rehabilitated from ' + oldCondition + ' to ' + targetCondition,
                []);
            _showToast('Residence rehabilitated from "' + oldCondition + '" to "' + targetCondition + '"', 'success');

            return {
                success: true,
                residence: residence,
                oldCondition: oldCondition,
                newCondition: targetCondition,
                cost: cost,
                year: renovationYear
            };

        } finally {
            _processingResidence = false;
        }
    }

    // =========================================================================
    // 14. RECOMMENDATIONS
    // =========================================================================

    function getResidenceRecommendations(residenceId) {
        var residence = getResidenceById(residenceId);
        if (!residence) return [];

        var recommendations = [];
        var currentCondition = residence.condition || 'good';
        var isVacant = residence.isVacant === true;
        var isDemolished = residence.isDemolished === true;
        var currentYear = _getCurrentYear();

        if (isDemolished) {
            recommendations.push({
                priority: 'low',
                message: 'This residence has been demolished and cannot be rehabilitated.',
                estimatedCost: 0
            });
            return recommendations;
        }

        if (isVacant) {
            var vacantDuration = residence.vacantYear ? currentYear - residence.vacantYear : 0;
            recommendations.push({
                priority: 'high',
                message: 'Residence has been vacant for ' + vacantDuration + ' years. Consider assigning a household.',
                estimatedCost: 0
            });
        }

        if (currentCondition === 'ruined' || currentCondition === 'poor') {
            var repairCost = calculateRepairCost(residence, 'good');
            recommendations.push({
                priority: 'high',
                message: 'Residence is in ' + currentCondition + ' condition. Rehabilitation recommended.',
                estimatedCost: repairCost
            });
        } else if (currentCondition === 'fair') {
            var repairCostFair = calculateRepairCost(residence, 'good');
            recommendations.push({
                priority: 'medium',
                message: 'Residence is in fair condition. Consider rehabilitation to good condition.',
                estimatedCost: repairCostFair
            });
        }

        if (residence.isMultiUnit && residence.units) {
            var vacantUnits = 0;
            for (var i = 0; i < residence.units.length; i++) {
                if (residence.units[i].isVacant && !residence.units[i].isDemolished) {
                    vacantUnits++;
                }
            }
            if (vacantUnits > 0) {
                var occupancyRate = ((residence.units.length - vacantUnits) / residence.units.length * 100);
                recommendations.push({
                    priority: occupancyRate < 50 ? 'high' : 'medium',
                    message: vacantUnits + ' vacant units (' + Math.round(occupancyRate) + '% occupied). Consider assigning households.',
                    estimatedCost: 0
                });
            }
        }

        if (residence.estimatedValue && residence.estimatedValue < 500) {
            recommendations.push({
                priority: 'low',
                message: 'Residence value is low (' + residence.estimatedValue + ' gold). Consider improvements.',
                estimatedCost: calculateRepairCost(residence, 'good')
            });
        }

        if (recommendations.length > 5) {
            recommendations = recommendations.slice(0, 5);
        }

        var priorityOrder = { 'high': 0, 'medium': 1, 'low': 2 };
        recommendations.sort(function(a, b) {
            return (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3);
        });

        return recommendations;
    }

    // =========================================================================
    // 15. HOUSEHOLD RESIDENCE QUERIES
    // =========================================================================

    function getHouseholdUnits(householdId) {
        if (!householdId) return [];
        var residences = _getResidencesData();
        var result = [];

        for (var i = 0; i < residences.length; i++) {
            var r = residences[i];
            _initResidence(r);
            if (r.units) {
                for (var j = 0; j < r.units.length; j++) {
                    if (r.units[j].householdId === householdId && !r.units[j].isDemolished) {
                        result.push({
                            residence: r,
                            unit: r.units[j],
                            residenceId: r.id,
                            residenceName: r.name
                        });
                    }
                }
            }
        }
        return result;
    }

    function getHouseholdPrimaryResidence(householdId) {
        var units = getHouseholdUnits(householdId);
        if (units.length === 0) return null;
        units.sort(function(a, b) {
            return (a.unit.assignedYear || 0) - (b.unit.assignedYear || 0);
        });
        return units[0];
    }

    function getHouseholdUnitCount(householdId) {
        return getHouseholdUnits(householdId).length;
    }

    function getResidenceHouseholds(residenceId) {
        var units = getResidenceUnits(residenceId);
        var result = [];
        var seen = {};

        for (var i = 0; i < units.length; i++) {
            if (!units[i].isVacant && units[i].householdId) {
                if (!seen[units[i].householdId]) {
                    seen[units[i].householdId] = true;
                    result.push({
                        householdId: units[i].householdId,
                        householdName: units[i].householdName || 'Unknown',
                        unitNumber: units[i].unitNumber,
                        assignedYear: units[i].assignedYear
                    });
                }
            }
        }
        return result;
    }

    // =========================================================================
    // 16. CAPACITY AND AVAILABILITY
    // =========================================================================

    function getResidenceCapacity(residenceId) {
        var residence = getResidenceById(residenceId);
        if (!residence) return 0;
        return residence.capacity || 0;
    }

    function getAvailableCapacity(residenceId) {
        var residence = getResidenceById(residenceId);
        if (!residence) return 0;

        var occupied = 0;
        if (residence.units) {
            for (var i = 0; i < residence.units.length; i++) {
                if (!residence.units[i].isVacant && !residence.units[i].isDemolished) {
                    occupied++;
                }
            }
        }
        return Math.max(0, (residence.capacity || 0) - occupied);
    }

    function hasAvailableUnits(residenceId) {
        return getVacantUnits(residenceId).length > 0;
    }

    function getRandomAvailableUnit(residenceId) {
        var vacant = getVacantUnits(residenceId);
        if (vacant.length === 0) return null;
        var index = Math.floor(Math.random() * vacant.length);
        return vacant[index];
    }

    // =========================================================================
    // 17. RESIDENCE STATISTICS
    // =========================================================================

    function getResidenceStatistics(locationId) {
        var residences = locationId ? getResidencesByLocation(locationId) : getResidences();

        var stats = {
            total: residences.length,
            byType: {},
            byStatus: {},
            byLocation: {},
            byCondition: {},
            totalUnits: 0,
            occupiedUnits: 0,
            vacantUnits: 0,
            demolishedUnits: 0,
            totalHouseholds: 0,
            averageOccupancy: 0,
            totalValue: 0,
            averageValue: 0
        };

        var households = {};
        var totalValue = 0;

        for (var i = 0; i < residences.length; i++) {
            var r = residences[i];
            _initResidence(r);

            if (!stats.byType[r.typeId]) stats.byType[r.typeId] = 0;
            stats.byType[r.typeId]++;

            if (!stats.byStatus[r.status]) stats.byStatus[r.status] = 0;
            stats.byStatus[r.status]++;

            var locKey = r.locationId || 'unknown';
            if (!stats.byLocation[locKey]) stats.byLocation[locKey] = 0;
            stats.byLocation[locKey]++;

            var conditionKey = r.condition || 'good';
            if (!stats.byCondition[conditionKey]) stats.byCondition[conditionKey] = 0;
            stats.byCondition[conditionKey]++;

            if (r.units) {
                stats.totalUnits += r.units.length;
                for (var j = 0; j < r.units.length; j++) {
                    if (r.units[j].isDemolished) {
                        stats.demolishedUnits++;
                    } else if (r.units[j].isVacant) {
                        stats.vacantUnits++;
                    } else {
                        stats.occupiedUnits++;
                        if (r.units[j].householdId) {
                            households[r.units[j].householdId] = true;
                        }
                    }
                }
            }

            if (r.estimatedValue) {
                totalValue += r.estimatedValue;
            }
        }

        stats.totalHouseholds = Object.keys(households).length;
        stats.totalValue = totalValue;
        stats.averageValue = stats.total > 0 ? Math.round(totalValue / stats.total) : 0;
        stats.averageOccupancy = stats.totalUnits > 0 ?
            (stats.occupiedUnits / stats.totalUnits) * 100 : 0;

        return stats;
    }

    // =========================================================================
    // 18. BULK OPERATIONS
    // =========================================================================

    function bulkAssignUnits(residenceId, assignments, year) {
        if (_processingAssignment) {
            return { success: false, reason: 'Already processing an assignment' };
        }
        _processingAssignment = true;

        try {
            var results = {
                success: [],
                failed: [],
                total: assignments.length
            };

            var assignYear = year || _getCurrentYear();

            for (var i = 0; i < assignments.length; i++) {
                var assignment = assignments[i];
                var household = _getHousehold(assignment.householdId);
                if (!household) {
                    results.failed.push({
                        householdId: assignment.householdId,
                        unitNumber: assignment.unitNumber,
                        reason: 'Household not found'
                    });
                    continue;
                }

                var result = assignHouseholdToUnit(
                    residenceId,
                    assignment.unitNumber,
                    household.id,
                    household.name,
                    assignYear,
                    { notes: assignment.notes || '' }
                );

                if (result.success) {
                    results.success.push({
                        householdId: household.id,
                        householdName: household.name,
                        unitNumber: assignment.unitNumber
                    });
                } else {
                    results.failed.push({
                        householdId: household.id,
                        householdName: household.name,
                        unitNumber: assignment.unitNumber,
                        reason: result.reason
                    });
                }
            }

            _showToast('Assigned ' + results.success.length + ' households to units', 'success');
            return results;

        } finally {
            _processingAssignment = false;
        }
    }

    // =========================================================================
    // 19. INTEGRATION FUNCTIONS
    // =========================================================================

    function householdHasResidence(householdId) {
        return getHouseholdUnits(householdId).length > 0;
    }

    function getResidenceLocation(residenceId) {
        var residence = getResidenceById(residenceId);
        if (!residence) return null;
        return _getPlaceById(residence.locationId);
    }

    function getHouseholdResidencesByLocation(householdId, locationId) {
        var residences = getResidencesByHousehold(householdId);
        var result = [];
        for (var i = 0; i < residences.length; i++) {
            if (residences[i].locationId === locationId) {
                result.push(residences[i]);
            }
        }
        return result;
    }

    // =========================================================================
    // 20. TYPE HELPERS
    // =========================================================================

    function isMultiUnitResidence(residenceId) {
        var residence = getResidenceById(residenceId);
        return residence ? residence.isMultiUnit === true : false;
    }

    function getAllResidenceTypes() {
        return RESIDENCE_TYPES;
    }

    function getResidenceType(typeId) {
        return RESIDENCE_TYPES[typeId.toUpperCase()] || null;
    }

    // =========================================================================
    // 21. CONDITION HELPERS
    // =========================================================================

    function getAllResidenceConditions() {
        return [
            { id: 'pristine', name: 'Pristine', modifier: 1.2 },
            { id: 'good', name: 'Good', modifier: 1.0 },
            { id: 'fair', name: 'Fair', modifier: 0.8 },
            { id: 'poor', name: 'Poor', modifier: 0.6 },
            { id: 'ruined', name: 'Ruined', modifier: 0.3 }
        ];
    }

    function getResidenceCondition(id) {
        var conditions = getAllResidenceConditions();
        for (var i = 0; i < conditions.length; i++) {
            if (conditions[i].id === id) return conditions[i];
        }
        return null;
    }

    // =========================================================================
    // 22. UNIT STATS HELPERS
    // =========================================================================

    function getUnitStats(residenceId) {
        var units = getResidenceUnits(residenceId);
        var stats = {
            total: units.length,
            occupied: 0,
            vacant: 0,
            demolished: 0,
            occupancyRate: 0
        };

        for (var i = 0; i < units.length; i++) {
            if (units[i].isDemolished) {
                stats.demolished++;
            } else if (units[i].isVacant) {
                stats.vacant++;
            } else {
                stats.occupied++;
            }
        }

        var availableUnits = stats.total - stats.demolished;
        stats.occupancyRate = availableUnits > 0 ? Math.round((stats.occupied / availableUnits) * 100) : 0;

        return stats;
    }

    function getLocationUnitStats(locationId) {
        var residences = getResidencesByLocation(locationId);
        var stats = {
            totalResidences: 0,
            totalUnits: 0,
            occupiedUnits: 0,
            vacantUnits: 0,
            demolishedUnits: 0,
            multiUnitResidences: 0,
            unitsPerResidence: 0,
            occupancyRate: 0
        };

        for (var i = 0; i < residences.length; i++) {
            var r = residences[i];
            if (!r.units || r.units.length === 0) continue;

            stats.totalResidences++;
            stats.totalUnits += r.units.length;

            if (r.units.length > 1) {
                stats.multiUnitResidences++;
            }

            for (var j = 0; j < r.units.length; j++) {
                if (r.units[j].isDemolished) {
                    stats.demolishedUnits++;
                } else if (r.units[j].isVacant) {
                    stats.vacantUnits++;
                } else {
                    stats.occupiedUnits++;
                }
            }
        }

        stats.unitsPerResidence = stats.totalResidences > 0 ? Math.round(stats.totalUnits / stats.totalResidences) : 0;

        var availableUnits = stats.totalUnits - stats.demolishedUnits;
        stats.occupancyRate = availableUnits > 0 ? Math.round((stats.occupiedUnits / availableUnits) * 100) : 0;

        return stats;
    }

    // =========================================================================
    // 23. STAFF POSITION FUNCTIONS
    // =========================================================================

    function addResidenceStaffPosition(residenceId, data) {
        if (_processingResidence) {
            _showToast('Already processing a residence operation', 'warning');
            return null;
        }
        _processingResidence = true;

        try {
            var residence = getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                return null;
            }

            if (!data.name || data.name.trim() === '') {
                _showToast('Position name is required', 'error');
                return null;
            }

            if (data.requiredRoleId) {
                var role = _getRoleById(data.requiredRoleId);
                if (!role) {
                    _showToast('Required role not found', 'error');
                    return null;
                }
            }

            if (data.unitNumber) {
                var unit = getResidenceUnit(residenceId, data.unitNumber);
                if (!unit) {
                    _showToast('Unit ' + data.unitNumber + ' not found', 'error');
                    return null;
                }
            }

            if (!residence.staffPositions) residence.staffPositions = [];

            var position = {
                id: _generateId('rspos'),
                name: data.name.trim(),
                unitNumber: data.unitNumber || null,
                requiredRoleId: data.requiredRoleId || null,
                minSkillLevel: data.minSkillLevel || 0,
                notes: data.notes || '',
                createdAt: _getCurrentYear(),
                updatedAt: _getCurrentYear()
            };

            residence.staffPositions.push(position);
            residence.lastUpdated = _getCurrentYear();

            addResidenceHistory(residenceId, 'staff_position_added', 'Added staff position: ' + position.name);
            addResidenceTimelineEvent(residenceId, {
                year: _getCurrentYear(),
                type: 'staff_position_added',
                details: 'Staff position "' + position.name + '" added' + (position.unitNumber ? ' (Unit ' + position.unitNumber + ')' : '')
            });

            _saveMasterData();
            _invalidateAccessorCaches();

            _showToast('Staff position "' + position.name + '" added to residence', 'success');
            return position;

        } finally {
            _processingResidence = false;
        }
    }

    function removeResidenceStaffPosition(residenceId, positionId, options) {
        if (_processingResidence) {
            _showToast('Already processing a residence operation', 'warning');
            return false;
        }
        _processingResidence = true;

        try {
            options = options || {};
            var residence = getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                return false;
            }

            if (!residence.staffPositions) return false;

            var index = -1;
            var position = null;
            for (var i = 0; i < residence.staffPositions.length; i++) {
                if (residence.staffPositions[i].id === positionId) {
                    index = i;
                    position = residence.staffPositions[i];
                    break;
                }
            }

            if (index === -1) {
                _showToast('Position not found', 'error');
                return false;
            }

            if (options.removeAssignments !== false) {
                if (!residence.staffAssignments) residence.staffAssignments = [];
                residence.staffAssignments = residence.staffAssignments.filter(function(a) {
                    return a.positionId !== positionId;
                });
            }

            residence.staffPositions.splice(index, 1);
            residence.lastUpdated = _getCurrentYear();

            addResidenceHistory(residenceId, 'staff_position_removed', 'Removed staff position: ' + position.name);
            addResidenceTimelineEvent(residenceId, {
                year: _getCurrentYear(),
                type: 'staff_position_removed',
                details: 'Staff position "' + position.name + '" removed'
            });

            _saveMasterData();
            _invalidateAccessorCaches();

            _showToast('Staff position "' + position.name + '" removed', 'info');
            return true;

        } finally {
            _processingResidence = false;
        }
    }

    function getResidenceStaffPositions(residenceId, options) {
        options = options || {};
        var residence = getResidenceById(residenceId);
        if (!residence || !residence.staffPositions) return [];

        var positions = residence.staffPositions.slice();

        if (options.unitNumber !== undefined) {
            positions = positions.filter(function(p) { return p.unitNumber === options.unitNumber; });
        }

        if (options.requiredRoleId) {
            positions = positions.filter(function(p) { return p.requiredRoleId === options.requiredRoleId; });
        }

        return positions;
    }

    function assignCharacterToResidenceStaffPosition(residenceId, positionId, characterId, options) {
        if (_processingAssignment) {
            _showToast('Already processing an assignment', 'warning');
            return null;
        }
        _processingAssignment = true;

        try {
            options = options || {};
            var residence = getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                return null;
            }

            var position = null;
            if (residence.staffPositions) {
                for (var i = 0; i < residence.staffPositions.length; i++) {
                    if (residence.staffPositions[i].id === positionId) {
                        position = residence.staffPositions[i];
                        break;
                    }
                }
            }

            if (!position) {
                _showToast('Staff position not found', 'error');
                return null;
            }

            var character = _getCharacterById(characterId);
            if (!character) {
                _showToast('Character not found', 'error');
                return null;
            }

            if (character.isDeceased) {
                _showToast('Character is deceased', 'error');
                return null;
            }

            if (!residence.staffAssignments) residence.staffAssignments = [];
            for (var i = 0; i < residence.staffAssignments.length; i++) {
                if (residence.staffAssignments[i].positionId === positionId &&
                    residence.staffAssignments[i].characterId === characterId &&
                    !residence.staffAssignments[i].endYear) {
                    _showToast('Character already assigned to this position', 'error');
                    return null;
                }
            }

            var roleId = position.requiredRoleId;
            var skillLevel = 0;
            var hasRole = false;

            if (roleId) {
                if (character.professions) {
                    for (var i = 0; i < character.professions.length; i++) {
                        if (character.professions[i].id === roleId) {
                            hasRole = true;
                            skillLevel = character.professions[i].skillLevel || 0;
                            break;
                        }
                    }
                }

                if (!hasRole) {
                    if (options.addRoleIfMissing !== false) {
                        var defaultSkill = options.defaultSkillLevel || 10;
                        var result = _addProfession(characterId, roleId, {
                            skillLevel: defaultSkill,
                            startYear: options.startYear || _getCurrentYear()
                        });
                        if (result && result.success) {
                            hasRole = true;
                            skillLevel = defaultSkill;
                        } else {
                            _showToast('Failed to add required role to character', 'error');
                            return null;
                        }
                    } else {
                        _showToast('Character does not have required role: ' + (_getRoleById(roleId)?.name || roleId), 'error');
                        return null;
                    }
                }

                if (position.minSkillLevel && skillLevel < position.minSkillLevel) {
                    _showToast('Character skill level (' + skillLevel + ') is below requirement (' + position.minSkillLevel + ')', 'error');
                    return null;
                }
            }

            var startYear = options.startYear || _getCurrentYear();

            var assignment = {
                id: _generateId('rsassign'),
                positionId: positionId,
                characterId: characterId,
                characterName: character.name + (character.surname ? ' ' + character.surname : ''),
                startYear: startYear,
                endYear: options.endYear || null,
                endReason: null,
                title: options.title || position.name,
                notes: options.notes || '',
                roleIdAtAssignment: roleId,
                skillLevelAtAssignment: skillLevel,
                unitNumber: position.unitNumber || null
            };

            residence.staffAssignments.push(assignment);
            residence.lastUpdated = _getCurrentYear();

            addResidenceHistory(residenceId, 'staff_assigned',
                character.name + ' assigned as ' + assignment.title + (position.unitNumber ? ' (Unit ' + position.unitNumber + ')' : ''));
            addResidenceTimelineEvent(residenceId, {
                year: startYear,
                type: 'staff_assigned',
                details: character.name + ' assigned as ' + assignment.title,
                householdName: character.name,
                unitNumber: position.unitNumber || null
            });

            _saveMasterData();
            _invalidateAccessorCaches();

            var roleName = roleId ? (_getRoleById(roleId)?.name || 'None') : 'None';
            _logEvent('residence', 'Staff Assigned',
                character.name + ' assigned to staff position "' + position.name + '" at ' + residence.name + ' (Role: ' + roleName + ')',
                [character]);

            _showToast(character.name + ' assigned to "' + position.name + '" at ' + residence.name, 'success');
            return assignment;

        } finally {
            _processingAssignment = false;
        }
    }

    function endResidenceStaffAssignment(residenceId, assignmentId, endYear, reason) {
        if (_processingResidence) {
            _showToast('Already processing a residence operation', 'warning');
            return null;
        }
        _processingResidence = true;

        try {
            var residence = getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                return null;
            }

            if (!residence.staffAssignments) return null;

            var index = -1;
            var assignment = null;
            for (var i = 0; i < residence.staffAssignments.length; i++) {
                if (residence.staffAssignments[i].id === assignmentId) {
                    index = i;
                    assignment = residence.staffAssignments[i];
                    break;
                }
            }

            if (index === -1) {
                _showToast('Assignment not found', 'error');
                return null;
            }

            if (assignment.endYear) {
                _showToast('Assignment already ended', 'info');
                return null;
            }

            var year = endYear || _getCurrentYear();
            if (year <= assignment.startYear) {
                _showToast('End year must be after start year (' + assignment.startYear + ')', 'error');
                return null;
            }

            assignment.endYear = year;
            assignment.endReason = reason || 'Term ended';
            residence.lastUpdated = _getCurrentYear();

            addResidenceHistory(residenceId, 'staff_assignment_ended',
                assignment.characterName + ' ended assignment as ' + assignment.title + ' (' + reason + ')');
            addResidenceTimelineEvent(residenceId, {
                year: year,
                type: 'staff_assignment_ended',
                details: assignment.characterName + ' ended assignment as ' + assignment.title,
                householdName: assignment.characterName,
                unitNumber: assignment.unitNumber || null
            });

            _saveMasterData();
            _invalidateAccessorCaches();

            _showToast(assignment.characterName + ' ended assignment as ' + assignment.title, 'info');
            return assignment;

        } finally {
            _processingResidence = false;
        }
    }

    function getResidenceStaffAssignments(residenceId, options) {
        options = options || {};
        var residence = getResidenceById(residenceId);
        if (!residence || !residence.staffAssignments) return [];

        var assignments = residence.staffAssignments.slice();

        if (options.activeOnly !== false) {
            assignments = assignments.filter(function(a) { return !a.endYear; });
        }

        if (options.unitNumber !== undefined) {
            assignments = assignments.filter(function(a) { return a.unitNumber === options.unitNumber; });
        }

        if (options.positionId) {
            assignments = assignments.filter(function(a) { return a.positionId === options.positionId; });
        }

        if (options.characterId) {
            assignments = assignments.filter(function(a) { return a.characterId === options.characterId; });
        }

        return assignments;
    }

    // =========================================================================
    // 24. DEMOLISH RESIDENCE
    // =========================================================================

    function demolishResidence(residenceId, reason, year, options) {
        if (_processingResidence) {
            return { success: false, error: 'Operation already in progress' };
        }
        _processingResidence = true;

        try {
            var residence = getResidenceById(residenceId);
            if (!residence) {
                return { success: false, error: 'Residence not found' };
            }

            if (residence.isDemolished) {
                return { success: false, error: 'Residence already demolished' };
            }

            options = options || {};
            var demolishYear = year || _getCurrentYear();
            var demolishReason = reason || 'Demolished';

            var demolitionRecord = {
                residenceId: residence.id,
                residenceName: residence.name,
                locationId: residence.locationId,
                locationName: residence.locationName || 'Unknown',
                typeId: residence.typeId,
                typeName: residence.typeName || 'Unknown',
                demolishedYear: demolishYear,
                demolishedReason: demolishReason,
                destroyedBy: options.destroyedBy || 'manual',
                disasterId: options.disasterId || null,
                previousHouseholdId: residence.householdId,
                previousHouseholdName: residence.householdName,
                unitCount: (residence.units || []).length,
                occupiedUnits: residence.occupiedUnits || 0,
                previousCondition: residence.condition || 'good',
                previousStatus: residence.status || 'active',
                timestamp: Date.now()
            };

            var units = (residence.units || []).slice();
            var unitsDemolished = 0;

            for (var i = 0; i < units.length; i++) {
                var unit = units[i];
                try {
                    var result = demolishUnit(
                        residenceId,
                        unit.unitNumber,
                        'Part of residence demolition: ' + demolishReason,
                        demolishYear
                    );
                    if (result && result.success) {
                        unitsDemolished++;
                    }
                } catch (e) {
                    // Continue with other units
                }
            }

            var updates = {
                status: RESIDENCE_STATUS.DEMOLISHED,
                isDemolished: true,
                demolishedAt: demolishYear,
                demolishedReason: demolishReason,
                destroyedBy: options.destroyedBy || 'manual',
                disasterId: options.disasterId || null,
                demolishedRecord: demolitionRecord,
                householdId: null,
                householdName: null,
                isVacant: true,
                occupiedUnits: 0,
                vacantUnits: 0,
                condition: 'ruined',
                lastUpdated: Date.now()
            };

            if (!residence.damageHistory) residence.damageHistory = [];
            residence.damageHistory.push({
                year: demolishYear,
                type: 'demolished',
                reason: demolishReason,
                destroyedBy: options.destroyedBy || 'manual',
                disasterId: options.disasterId || null,
                record: demolitionRecord,
                timestamp: Date.now()
            });

            updateResidence(residenceId, updates);

            addResidenceHistory(residenceId, 'demolished', demolishReason, null);
            addResidenceTimelineEvent(residenceId, {
                year: demolishYear,
                type: 'demolished',
                details: 'Residence demolished: ' + demolishReason + (options.destroyedBy ? ' (Cause: ' + options.destroyedBy + ')' : ''),
                householdName: residence.householdName || null
            });

            _saveMasterData();
            _invalidateAccessorCaches();

            if (!options.silent) {
                _showToast('Residence "' + residence.name + '" demolished', 'info');
            }

            return {
                success: true,
                demolitionRecord: demolitionRecord,
                unitsDemolished: unitsDemolished,
                demolishedAt: demolishYear,
                reason: demolishReason
            };

        } finally {
            _processingResidence = false;
        }
    }

    function getDemolishedResidences(options) {
        try {
            var residences = getResidences();

            options = options || {};
            var filtered = residences.filter(function(r) {
                return r.isDemolished === true;
            });

            if (options.locationId) {
                filtered = filtered.filter(function(r) {
                    return r.locationId === options.locationId;
                });
            }

            if (options.destroyedBy) {
                filtered = filtered.filter(function(r) {
                    return r.destroyedBy === options.destroyedBy;
                });
            }

            if (!options.includeRecords) {
                filtered = filtered.map(function(r) {
                    var result = { ...r };
                    delete result.demolishedRecord;
                    return result;
                });
            }

            return filtered;
        } catch (e) {
            return [];
        }
    }

    function getResidenceDamageHistory(residenceId, limit) {
        try {
            var residence = getResidenceById(residenceId);
            if (!residence) return [];

            var history = residence.damageHistory || [];
            if (limit) {
                history = history.slice(-limit);
            }
            return history;
        } catch (e) {
            return [];
        }
    }

    function getResidenceDemolitionStats(locationId) {
        var stats = {
            totalDemolished: 0,
            byDestroyedBy: {},
            byType: {},
            totalUnitsLost: 0,
            recentDemolitions: []
        };

        try {
            var demolished = getDemolishedResidences({
                locationId: locationId,
                includeRecords: true
            });

            stats.totalDemolished = demolished.length;

            for (var i = 0; i < demolished.length; i++) {
                var r = demolished[i];
                var record = r.demolishedRecord;

                var destroyedBy = r.destroyedBy || 'unknown';
                if (!stats.byDestroyedBy[destroyedBy]) {
                    stats.byDestroyedBy[destroyedBy] = 0;
                }
                stats.byDestroyedBy[destroyedBy]++;

                var type = r.typeName || r.typeId || 'unknown';
                if (!stats.byType[type]) {
                    stats.byType[type] = 0;
                }
                stats.byType[type]++;

                if (record && record.unitCount) {
                    stats.totalUnitsLost += record.unitCount;
                }

                if (stats.recentDemolitions.length < 5) {
                    stats.recentDemolitions.push({
                        name: r.name,
                        type: r.typeName || r.typeId,
                        destroyedAt: r.demolishedAt,
                        destroyedBy: r.destroyedBy,
                        reason: r.demolishedReason,
                        unitsLost: record ? record.unitCount : 0
                    });
                }
            }

            stats.recentDemolitions.sort(function(a, b) {
                return (b.destroyedAt || 0) - (a.destroyedAt || 0);
            });

        } catch (e) {
            // Error getting stats
        }

        return stats;
    }

    // =========================================================================
    // 25. RENTAL FUNCTIONS (NEW)
    // =========================================================================

    /**
     * Helper: Gets owner/renter name from type and ID
     */
    function _getOwnerName(type, id) {
        if (type === 'household') {
            var household = _getHousehold(id);
            return household ? household.name : 'Unknown Household';
        } else if (type === 'character') {
            var character = _getCharacterById(id);
            return character ? (character.name + (character.surname ? ' ' + character.surname : '')) : 'Unknown Character';
        }
        return 'Unknown';
    }

    /**
     * Sets the owner of a residence
     */
    function setResidenceOwner(residenceId, ownerType, ownerId, options) {
        if (_processingResidence) {
            _showToast('Already processing a residence operation', 'warning');
            return null;
        }
        _processingResidence = true;

        try {
            options = options || {};
            var residence = getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                return null;
            }

            // Validate owner exists
            if (ownerType === 'household') {
                var household = _getHousehold(ownerId);
                if (!household) {
                    _showToast('Household not found', 'error');
                    return null;
                }
            } else if (ownerType === 'character') {
                var character = _getCharacterById(ownerId);
                if (!character) {
                    _showToast('Character not found', 'error');
                    return null;
                }
            } else {
                _showToast('Invalid owner type. Must be "household" or "character"', 'error');
                return null;
            }

            var oldOwnerId = residence.ownerId;
            var oldOwnerType = residence.ownerType;
            var oldOwnerName = residence.ownerName;

            residence.ownerType = ownerType;
            residence.ownerId = ownerId;
            residence.ownerName = options.ownerName || _getOwnerName(ownerType, ownerId);
            residence.ownerSince = options.ownerSince || _getCurrentYear();

            // Update rental status if no renter and owner is the occupant
            if (!residence.renterId && !residence.isVacant) {
                residence.rentalStatus = RENTAL_STATUS.OWNER_OCCUPIED;
            }

            if (!residence.ownershipHistory) residence.ownershipHistory = [];
            residence.ownershipHistory.push({
                ownerType: ownerType,
                ownerId: ownerId,
                ownerName: residence.ownerName,
                year: residence.ownerSince,
                action: 'set_owner',
                previousOwnerId: oldOwnerId,
                previousOwnerType: oldOwnerType,
                previousOwnerName: oldOwnerName,
                timestamp: Date.now()
            });

            residence.lastUpdated = _getCurrentYear();

            addResidenceHistory(residenceId, 'owner_set',
                'Owner set to ' + residence.ownerName + ' (' + ownerType + ')');

            addResidenceTimelineEvent(residenceId, {
                year: _getCurrentYear(),
                type: 'ownership_changed',
                details: 'Owner set to ' + residence.ownerName,
                householdName: residence.ownerName
            });

            _saveMasterData();
            _invalidateAccessorCaches();

            _showToast('Owner set to ' + residence.ownerName, 'success');
            return residence;

        } finally {
            _processingResidence = false;
        }
    }

    /**
     * Gets the owner of a residence
     */
    function getResidenceOwner(residenceId) {
        var residence = getResidenceById(residenceId);
        if (!residence) return null;

        return {
            ownerType: residence.ownerType || null,
            ownerId: residence.ownerId || null,
            ownerName: residence.ownerName || 'None',
            ownerSince: residence.ownerSince || null
        };
    }

    /**
     * Sets the renter of a residence with annual rent amount
     */
    function setResidenceRenter(residenceId, renterType, renterId, rentAmount, options) {
        if (_processingResidence) {
            _showToast('Already processing a residence operation', 'warning');
            return null;
        }
        _processingResidence = true;

        try {
            options = options || {};
            var residence = getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                return null;
            }

            // Validate renter exists
            if (renterType === 'household') {
                var household = _getHousehold(renterId);
                if (!household) {
                    _showToast('Household not found', 'error');
                    return null;
                }
            } else if (renterType === 'character') {
                var character = _getCharacterById(renterId);
                if (!character) {
                    _showToast('Character not found', 'error');
                    return null;
                }
            } else {
                _showToast('Invalid renter type. Must be "household" or "character"', 'error');
                return null;
            }

            if (!residence.ownerId) {
                _showToast('Residence must have an owner before it can be rented', 'error');
                return null;
            }

            if (rentAmount < 0) {
                _showToast('Rent amount cannot be negative', 'error');
                return null;
            }

            // Check if renter can afford rent (if household)
            if (renterType === 'household') {
                var renterHousehold = _getHousehold(renterId);
                if (renterHousehold && (renterHousehold.wealth || 0) < rentAmount) {
                    if (!confirm(renterHousehold.name + ' has only ' + (renterHousehold.wealth || 0) + 
                        ' gold but annual rent is ' + rentAmount + ' gold. Continue?')) {
                        return null;
                    }
                }
            }

            var oldRenterId = residence.renterId;
            var oldRenterType = residence.renterType;
            var oldRenterName = residence.renterName;
            var oldRentAmount = residence.rentAmount;

            residence.renterType = renterType;
            residence.renterId = renterId;
            residence.renterName = options.renterName || _getOwnerName(renterType, renterId);
            residence.rentAmount = rentAmount;
            residence.rentalStatus = RENTAL_STATUS.RENTED;
            residence.rentStartYear = options.rentStartYear || _getCurrentYear();
            residence.isVacant = false;

            // Update household assignment if renter is a household
            if (renterType === 'household' && _state && typeof _state.associateHouseholdWithResidence === 'function') {
                _state.associateHouseholdWithResidence(renterId, residenceId, {
                    residenceName: residence.name,
                    residenceType: residence.typeId,
                    year: residence.rentStartYear,
                    unitNumber: options.unitNumber || null,
                    notes: 'Rented from ' + (residence.ownerName || 'Unknown owner') + ' for ' + rentAmount + 'g/year'
                });
            }

            if (!residence.rentalHistory) residence.rentalHistory = [];
            residence.rentalHistory.push({
                renterType: renterType,
                renterId: renterId,
                renterName: residence.renterName,
                rentAmount: rentAmount,
                startYear: residence.rentStartYear,
                endYear: null,
                action: 'rent_started',
                previousRenterId: oldRenterId,
                previousRenterName: oldRenterName,
                timestamp: Date.now()
            });

            residence.lastUpdated = _getCurrentYear();

            addResidenceHistory(residenceId, 'renter_set',
                'Renter set to ' + residence.renterName + ' (' + renterType + ') with annual rent ' + rentAmount + ' gold');

            addResidenceTimelineEvent(residenceId, {
                year: _getCurrentYear(),
                type: 'rental_started',
                details: residence.renterName + ' rented for ' + rentAmount + ' gold/year',
                householdName: residence.renterName
            });

            // Record in household activity log
            if (renterType === 'household' && typeof _addHouseholdActivityLog === 'function') {
                _addHouseholdActivityLog(renterId, 'residence_rented',
                    'Rented "' + residence.name + '" for ' + rentAmount + 'g/year from ' + (residence.ownerName || 'Unknown owner'));
            }

            _saveMasterData();
            _invalidateAccessorCaches();

            _showToast('Renter set to ' + residence.renterName + ' (Rent: ' + rentAmount + 'g/year)', 'success');
            return residence;

        } finally {
            _processingResidence = false;
        }
    }

    /**
     * Gets the renter of a residence
     */
    function getResidenceRenter(residenceId) {
        var residence = getResidenceById(residenceId);
        if (!residence) return null;

        return {
            renterType: residence.renterType || null,
            renterId: residence.renterId || null,
            renterName: residence.renterName || 'None',
            rentAmount: residence.rentAmount || 0,
            rentStartYear: residence.rentStartYear || null,
            rentalStatus: residence.rentalStatus || RENTAL_STATUS.VACANT
        };
    }

    /**
     * Ends a rental agreement
     */
    function endResidenceRental(residenceId, endYear, reason) {
        if (_processingResidence) {
            _showToast('Already processing a residence operation', 'warning');
            return null;
        }
        _processingResidence = true;

        try {
            var residence = getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                return null;
            }

            if (!residence.renterId) {
                _showToast('Residence has no renter', 'warning');
                return null;
            }

            var endYearValue = endYear || _getCurrentYear();
            var reasonValue = reason || 'Rental ended';

            var oldRenterId = residence.renterId;
            var oldRenterName = residence.renterName;

            // Record in rental history
            if (residence.rentalHistory) {
                for (var i = residence.rentalHistory.length - 1; i >= 0; i--) {
                    if (residence.rentalHistory[i].renterId === oldRenterId && 
                        !residence.rentalHistory[i].endYear) {
                        residence.rentalHistory[i].endYear = endYearValue;
                        residence.rentalHistory[i].reason = reasonValue;
                        break;
                    }
                }
            }

            // Disassociate from renter household
            if (residence.renterType === 'household' && residence.renterId) {
                if (_state && typeof _state.disassociateHouseholdFromResidence === 'function') {
                    _state.disassociateHouseholdFromResidence(residence.renterId, residenceId, reasonValue, endYearValue);
                }
                if (typeof _addHouseholdActivityLog === 'function') {
                    _addHouseholdActivityLog(residence.renterId, 'residence_rental_ended',
                        'Rental ended for "' + residence.name + '": ' + reasonValue);
                }
            }

            residence.renterType = null;
            residence.renterId = null;
            residence.renterName = null;
            residence.rentAmount = 0;
            residence.rentalStatus = RENTAL_STATUS.VACANT;
            residence.isVacant = true;
            residence.vacantYear = endYearValue;
            residence.vacantReason = 'Rental ended: ' + reasonValue;

            residence.lastUpdated = _getCurrentYear();

            addResidenceHistory(residenceId, 'rental_ended',
                'Rental ended for ' + oldRenterName + ': ' + reasonValue);

            addResidenceTimelineEvent(residenceId, {
                year: endYearValue,
                type: 'rental_ended',
                details: oldRenterName + ' rental ended: ' + reasonValue,
                householdName: oldRenterName
            });

            _saveMasterData();
            _invalidateAccessorCaches();

            _showToast('Rental ended for ' + oldRenterName, 'info');
            return residence;

        } finally {
            _processingResidence = false;
        }
    }

    /**
     * Updates annual rent amount for a residence
     */
    function updateResidenceRent(residenceId, newRentAmount, effectiveYear, reason) {
        if (_processingResidence) {
            _showToast('Already processing a residence operation', 'warning');
            return null;
        }
        _processingResidence = true;

        try {
            var residence = getResidenceById(residenceId);
            if (!residence) {
                _showToast('Residence not found', 'error');
                return null;
            }

            if (!residence.renterId) {
                _showToast('Residence has no renter', 'error');
                return null;
            }

            if (newRentAmount < 0) {
                _showToast('Rent amount cannot be negative', 'error');
                return null;
            }

            var oldRent = residence.rentAmount;
            var effectiveYearValue = effectiveYear || _getCurrentYear();

            residence.rentAmount = newRentAmount;
            residence.rentEffectiveYear = effectiveYearValue;
            residence.lastUpdated = _getCurrentYear();

            if (!residence.rentalHistory) residence.rentalHistory = [];
            residence.rentalHistory.push({
                renterId: residence.renterId,
                renterName: residence.renterName,
                oldRentAmount: oldRent,
                newRentAmount: newRentAmount,
                year: effectiveYearValue,
                reason: reason || 'Rent adjustment',
                action: 'rent_adjusted',
                timestamp: Date.now()
            });

            addResidenceHistory(residenceId, 'rent_adjusted',
                'Rent adjusted from ' + oldRent + ' to ' + newRentAmount + ' gold');

            addResidenceTimelineEvent(residenceId, {
                year: effectiveYearValue,
                type: 'rent_adjusted',
                details: 'Rent adjusted from ' + oldRent + ' to ' + newRentAmount + ' gold',
                householdName: residence.renterName
            });

            // Record in household activity log
            if (residence.renterType === 'household' && typeof _addHouseholdActivityLog === 'function') {
                _addHouseholdActivityLog(residence.renterId, 'rent_adjusted',
                    'Rent for "' + residence.name + '" changed from ' + oldRent + ' to ' + newRentAmount + 'g/year');
            }

            _saveMasterData();
            _invalidateAccessorCaches();

            _showToast('Rent updated to ' + newRentAmount + 'g/year', 'success');
            return residence;

        } finally {
            _processingResidence = false;
        }
    }

    /**
     * Gets rental history for a residence
     */
    function getResidenceRentalHistory(residenceId, limit) {
        var residence = getResidenceById(residenceId);
        if (!residence || !residence.rentalHistory) return [];

        limit = limit || 20;
        var history = residence.rentalHistory.slice();
        history.sort(function(a, b) { return (b.year || 0) - (a.year || 0); });
        return history.slice(0, limit);
    }

    /**
     * Gets residences owned by a household/character
     */
    function getResidencesByOwner(ownerId, ownerType) {
        if (!ownerId) return [];
        var residences = getResidences();
        var result = [];

        for (var i = 0; i < residences.length; i++) {
            var r = residences[i];
            if (r.ownerId === ownerId && r.ownerType === ownerType) {
                if (!r.isDemolished) {
                    result.push(r);
                }
            }
        }

        return result;
    }

    /**
     * Gets residences rented by a household/character
     */
    function getResidencesByRenter(renterId, renterType) {
        if (!renterId) return [];
        var residences = getResidences();
        var result = [];

        for (var i = 0; i < residences.length; i++) {
            var r = residences[i];
            if (r.renterId === renterId && r.renterType === renterType) {
                if (!r.isDemolished) {
                    result.push(r);
                }
            }
        }

        return result;
    }

    /**
     * Gets total annual rent income for an owner
     */
    function getTotalRentIncome(ownerId, ownerType) {
        var residences = getResidencesByOwner(ownerId, ownerType);
        var total = 0;

        for (var i = 0; i < residences.length; i++) {
            if (residences[i].renterId && residences[i].rentAmount) {
                total += residences[i].rentAmount;
            }
        }

        return total;
    }

    /**
     * Gets total annual rent expenses for a renter
     */
    function getTotalRentExpenses(renterId, renterType) {
        var residences = getResidencesByRenter(renterId, renterType);
        var total = 0;

        for (var i = 0; i < residences.length; i++) {
            if (residences[i].rentAmount) {
                total += residences[i].rentAmount;
            }
        }

        return total;
    }

    /**
     * Records a rent payment
     */
    function recordRentPayment(residenceId, renterId, amount, year) {
        var residence = getResidenceById(residenceId);
        if (!residence) return false;

        if (!residence.rentPayments) residence.rentPayments = [];

        residence.rentPayments.push({
            renterId: renterId,
            renterName: residence.renterName,
            amount: amount,
            year: year || _getCurrentYear(),
            paid: true,
            timestamp: Date.now()
        });

        residence.lastUpdated = _getCurrentYear();
        _saveMasterData();
        return true;
    }

    /**
     * Gets rent payment history for a residence
     */
    function getRentPayments(residenceId, limit) {
        var residence = getResidenceById(residenceId);
        if (!residence || !residence.rentPayments) return [];

        limit = limit || 20;
        var payments = residence.rentPayments.slice();
        payments.sort(function(a, b) { return (b.year || 0) - (a.year || 0); });
        return payments.slice(0, limit);
    }

    // =========================================================================
    // 26. CACHE MANAGEMENT
    // =========================================================================

    function clearCache() {
        if (typeof window._residencesData !== 'undefined') {
            if (typeof window.masterData !== 'undefined' && window.masterData.data && window.masterData.data.residences) {
                window._residencesData = window.masterData.data.residences;
            }
        }
        _invalidateAccessorCaches();
    }

    // =========================================================================
    // 27. EXPORTS
    // =========================================================================

    window.RESIDENCE_TYPES = RESIDENCE_TYPES;
    window.RESIDENCE_STATUS = RESIDENCE_STATUS;
    window.RENTAL_STATUS = RENTAL_STATUS;

    window.ResidenceSystem = {
        // Constants
        RESIDENCE_TYPES: RESIDENCE_TYPES,
        RESIDENCE_STATUS: RESIDENCE_STATUS,
        RENTAL_STATUS: RENTAL_STATUS,

        // CRUD
        createResidence: createResidence,
        getResidenceById: getResidenceById,
        getResidences: getResidences,
        getResidencesByLocation: getResidencesByLocation,
        getResidencesByType: getResidencesByType,
        getResidencesByStatus: getResidencesByStatus,
        getResidencesByHousehold: getResidencesByHousehold,
        updateResidence: updateResidence,
        deleteResidence: deleteResidence,

        // History
        addResidenceHistory: addResidenceHistory,
        getResidenceHistory: getResidenceHistory,

        // Timeline
        getResidenceTimeline: getResidenceTimeline,
        addResidenceTimelineEvent: addResidenceTimelineEvent,

        // Association
        getResidenceAssociationHistory: getResidenceAssociationHistory,
        endResidenceAssociation: endResidenceAssociation,

        // Name History
        getResidenceNameHistory: getResidenceNameHistory,
        getResidenceCurrentNameInfo: getResidenceCurrentNameInfo,
        getResidenceOriginalName: getResidenceOriginalName,
        getResidenceNameChangeCount: getResidenceNameChangeCount,
        updateResidenceNameWithHistory: updateResidenceNameWithHistory,
        getFormattedResidenceNameHistory: getFormattedResidenceNameHistory,

        // Units
        addResidenceUnit: addResidenceUnit,
        removeResidenceUnit: removeResidenceUnit,
        getResidenceUnits: getResidenceUnits,
        getResidenceUnit: getResidenceUnit,
        getVacantUnits: getVacantUnits,
        getOccupiedUnits: getOccupiedUnits,
        assignHouseholdToUnit: assignHouseholdToUnit,
        markUnitVacant: markUnitVacant,
        demolishUnit: demolishUnit,

        // Vacancy
        getVacantResidences: getVacantResidences,
        markResidenceVacant: markResidenceVacant,
        getResidenceVacancyDetails: getResidenceVacancyDetails,
        assignHouseholdToVacantResidence: assignHouseholdToVacantResidence,

        // Rehabilitation
        calculateRepairCost: calculateRepairCost,
        rehabilitateResidence: rehabilitateResidence,
        getResidenceRecommendations: getResidenceRecommendations,

        // Household Queries
        getHouseholdUnits: getHouseholdUnits,
        getHouseholdPrimaryResidence: getHouseholdPrimaryResidence,
        getHouseholdUnitCount: getHouseholdUnitCount,
        getResidenceHouseholds: getResidenceHouseholds,

        // Capacity
        getResidenceCapacity: getResidenceCapacity,
        getAvailableCapacity: getAvailableCapacity,
        hasAvailableUnits: hasAvailableUnits,
        getRandomAvailableUnit: getRandomAvailableUnit,

        // Statistics
        getResidenceStatistics: getResidenceStatistics,
        bulkAssignUnits: bulkAssignUnits,

        // Integration
        householdHasResidence: householdHasResidence,
        getResidenceLocation: getResidenceLocation,
        getHouseholdResidencesByLocation: getHouseholdResidencesByLocation,

        // Type Helpers
        isMultiUnitResidence: isMultiUnitResidence,
        getAllResidenceTypes: getAllResidenceTypes,
        getResidenceType: getResidenceType,

        // Conditions
        getAllResidenceConditions: getAllResidenceConditions,
        getResidenceCondition: getResidenceCondition,

        // Unit Stats
        getUnitStats: getUnitStats,
        getLocationUnitStats: getLocationUnitStats,

        // Staff Positions
        addResidenceStaffPosition: addResidenceStaffPosition,
        removeResidenceStaffPosition: removeResidenceStaffPosition,
        getResidenceStaffPositions: getResidenceStaffPositions,
        assignCharacterToResidenceStaffPosition: assignCharacterToResidenceStaffPosition,
        endResidenceStaffAssignment: endResidenceStaffAssignment,
        getResidenceStaffAssignments: getResidenceStaffAssignments,

        // Demolish
        demolishResidence: demolishResidence,
        getDemolishedResidences: getDemolishedResidences,
        getResidenceDamageHistory: getResidenceDamageHistory,
        getResidenceDemolitionStats: getResidenceDemolitionStats,

        // ================================================================
        // RENTAL FUNCTIONS (NEW)
        // ================================================================
        setResidenceOwner: setResidenceOwner,
        getResidenceOwner: getResidenceOwner,
        setResidenceRenter: setResidenceRenter,
        getResidenceRenter: getResidenceRenter,
        endResidenceRental: endResidenceRental,
        updateResidenceRent: updateResidenceRent,
        getResidenceRentalHistory: getResidenceRentalHistory,
        getResidencesByOwner: getResidencesByOwner,
        getResidencesByRenter: getResidencesByRenter,
        getTotalRentIncome: getTotalRentIncome,
        getTotalRentExpenses: getTotalRentExpenses,
        recordRentPayment: recordRentPayment,
        getRentPayments: getRentPayments,

        // Cache
        clearCache: clearCache
    };

})();