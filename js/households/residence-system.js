/**
 * =============================================================================
 * STILL WATERS - RESIDENCE SYSTEM (residence-system.js)
 * =============================================================================
 * 
 * LOCATION: js/systems/household/residence-system.js
 * 
 * PURPOSE
 * -------
 * Residence domain: canonical storage, occupancy, units, history, name
 * history, timeline, staff positions, rental contracts, rehabilitation,
 * demolition, and household association.
 * 
 * OWNERSHIP MODEL (FROZEN)
 * ------------------------
 * The CANONICAL household↔residence association lives on units:
 * 
 *     unit.householdId           ← CANONICAL occupancy
 *     residence.units[]          ← CANONICAL collection
 *     residence.isVacant         ← DERIVED
 *     residence.occupiedUnits    ← DERIVED
 *     residence.vacantUnits      ← DERIVED
 *     residence.householdId      ← DERIVED convenience (single-unit only)
 * 
 *     household.residenceId          ← REVERSE INDEX, maintained via
 *                                       HouseholdCommands.associateWithResidence
 *     household.residenceUnitNumber  ← REVERSE INDEX, same path
 * 
 * ResidenceCommands is the SINGLE AUTHORITY that mutates unit occupancy.
 * Whenever it changes a unit's householdId, it also updates the household's
 * reverse index via HouseholdCommands. HouseholdCommands never mutates
 * occupancy; it only stores what ResidenceCommands tells it.
 * 
 * WHAT LIVES HERE
 * ---------------
 *   - Residence canonical storage
 *   - Residence CRUD
 *   - Unit CRUD and occupancy
 *   - Vacancy management
 *   - History / timeline / name history
 *   - Residence staff positions and assignments
 *   - Rental (owner / renter / rent / rent payments)
 *   - Rehabilitation and demolition
 *   - Household association orchestration (delegates to HouseholdCommands)
 * 
 * WHAT DOES NOT LIVE HERE
 * -----------------------
 *   - Toasts / icons / colours      → UI layer
 *   - Confirm dialogs               → UI layer
 *   - Household records             → HouseholdCommands / HouseholdQueries
 *   - Character records             → CharacterQueries
 *   - Role records                  → RoleQueries
 *   - Enterprise ownership          → IndustryCommands
 * 
 * CONTRACT
 * --------
 *   - No _processingResidence guard.
 *   - No _processingAssignment guard.
 *   - No 1250 fallback.
 *   - No UI toasts or confirm dialogs.
 *   - No nested save-per-helper.
 *   - Mutations return { success, data } / { success: false, code, reason }.
 *   - Reads return defensive snapshots.
 *   - Required dependencies fail loudly.
 *   - Compound operations perform ONE commit.
 * 
 * KNOWN LIMITATION
 * ----------------
 * This file is intentionally large because Residence is a large domain.
 * It is NOT split into ResidenceState / Queries / Rules / Commands yet,
 * because:
 *   1. Household side just got cleaned up
 *   2. Residence has no second consumer that would force the split
 *   3. The internal structure is already command/query separated by section
 * 
 * If it grows past ~1500 lines or a second consumer appears, split then.
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var RESIDENCE_TYPES = {
        estate:    { id: 'estate',    name: 'Estate',             capacity: 20, isMultiUnit: false },
        manor:     { id: 'manor',     name: 'Manor House',        capacity: 15, isMultiUnit: false },
        house:     { id: 'house',     name: 'House',              capacity: 8,  isMultiUnit: false },
        cottage:   { id: 'cottage',   name: 'Cottage',            capacity: 4,  isMultiUnit: false },
        apartment: { id: 'apartment', name: 'Apartment Building', capacity: 30, isMultiUnit: true  },
        tenement:  { id: 'tenement',  name: 'Tenement',           capacity: 25, isMultiUnit: true  },
        suite:     { id: 'suite',     name: 'Suite',              capacity: 6,  isMultiUnit: false },
        room:      { id: 'room',      name: 'Room',               capacity: 2,  isMultiUnit: false },
        tower:     { id: 'tower',     name: 'Tower',              capacity: 10, isMultiUnit: false },
        palace:    { id: 'palace',    name: 'Palace',             capacity: 50, isMultiUnit: false },
        castle:    { id: 'castle',    name: 'Castle',             capacity: 40, isMultiUnit: false },
        barracks:  { id: 'barracks',  name: 'Barracks',           capacity: 30, isMultiUnit: true  }
    };

    var RESIDENCE_STATUS = {
        ACTIVE:             'active',
        ABANDONED:          'abandoned',
        DEMOLISHED:         'demolished',
        UNDER_CONSTRUCTION: 'under_construction',
        RENOVATING:         'renovating'
    };

    var RENTAL_STATUS = {
        OWNER_OCCUPIED: 'owner_occupied',
        RENTED:         'rented',
        VACANT:         'vacant'
    };

    var RESIDENCE_CONDITIONS = [
        { id: 'pristine', name: 'Pristine', modifier: 1.2 },
        { id: 'good',     name: 'Good',     modifier: 1.0 },
        { id: 'fair',     name: 'Fair',     modifier: 0.8 },
        { id: 'poor',     name: 'Poor',     modifier: 0.6 },
        { id: 'ruined',   name: 'Ruined',   modifier: 0.3 }
    ];

    var CONDITION_MULTIPLIER = {};
    for (var _ci = 0; _ci < RESIDENCE_CONDITIONS.length; _ci++) {
        CONDITION_MULTIPLIER[RESIDENCE_CONDITIONS[_ci].id] = RESIDENCE_CONDITIONS[_ci].modifier;
    }

    var MAX_TIMELINE_ENTRIES = 200;
    var MAX_HISTORY_ENTRIES = 100;

    // =========================================================================
    // 2. DEPENDENCY ACCESS
    // =========================================================================

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe !== 'function') {
            throw new Error('ResidenceSystem: getCurrentYearSafe is required');
        }
        return window.getCurrentYearSafe();
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('ResidenceSystem: getCharacterById is required');
        }
        return window.getCharacterById(id);
    }

    function _getPlaceById(id) {
        if (typeof window.getPlaceById !== 'function') {
            throw new Error('ResidenceSystem: getPlaceById is required');
        }
        return window.getPlaceById(id);
    }

    function _generateId(prefix) {
        if (typeof window.generateId !== 'function') {
            throw new Error('ResidenceSystem: generateId is required');
        }
        return window.generateId(prefix);
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData !== 'function') {
            throw new Error('ResidenceSystem: saveMasterData is required');
        }
        window.saveMasterData();
    }

    // Household commands / queries — used for reverse-index updates only.
    function _householdCommands() {
        return typeof window.HouseholdCommands !== 'undefined'
            ? window.HouseholdCommands
            : null;
    }
    function _householdQueries() {
        return typeof window.HouseholdQueries !== 'undefined'
            ? window.HouseholdQueries
            : null;
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    // =========================================================================
    // 3. RESULT HELPERS
    // =========================================================================

    function _ok(data) {
        return { success: true, data: data === undefined ? null : data };
    }
    function _fail(code, reason) {
        return { success: false, code: code, reason: reason || code };
    }
    function _resolveYear(value) {
        if (value === undefined || value === null) return _getCurrentYear();
        if (typeof value !== 'number' || !isFinite(value)) return null;
        return value;
    }
    function _resolveInt(value, fallback) {
        if (value === undefined || value === null) return fallback;
        if (typeof value !== 'number' || !isFinite(value)) return null;
        return Math.floor(value);
    }

    // =========================================================================
    // 4. CANONICAL STORAGE
    // =========================================================================

    function _getResidencesArray() {
        if (typeof window.masterData === 'undefined' || !window.masterData.data) {
            throw new Error('ResidenceSystem: masterData.data is required');
        }
        if (!Array.isArray(window.masterData.data.residences)) {
            window.masterData.data.residences = [];
        }
        return window.masterData.data.residences;
    }

    /**
     * Ensures structural shape only. Does NOT default domain facts.
     */
    function _ensureResidenceShape(r) {
        if (!r || typeof r !== 'object') return;
        if (!Array.isArray(r.units))               r.units = [];
        if (!Array.isArray(r.history))             r.history = [];
        if (!Array.isArray(r.timeline))            r.timeline = [];
        if (!Array.isArray(r.nameHistory))         r.nameHistory = [];
        if (!Array.isArray(r.associationHistory))  r.associationHistory = [];
        if (!Array.isArray(r.vacancyHistory))      r.vacancyHistory = [];
        if (!Array.isArray(r.damageHistory))       r.damageHistory = [];
        if (!Array.isArray(r.ownershipHistory))    r.ownershipHistory = [];
        if (!Array.isArray(r.rentalHistory))       r.rentalHistory = [];
        if (!Array.isArray(r.rentPayments))        r.rentPayments = [];
        if (!Array.isArray(r.staffPositions))      r.staffPositions = [];
        if (!Array.isArray(r.staffAssignments))    r.staffAssignments = [];
        if (!Array.isArray(r.features))            r.features = [];
        // NOTE: we do NOT default status, condition, estimatedValue,
        // foundedYear, builtYear, capacity, etc. Missing means the record
        // is incomplete — that is a migration problem, not a runtime one.
    }

    function _commit() {
        _saveMasterData();
    }

    // =========================================================================
    // 5. RESIDENCE LOOKUPS (live internal record)
    // =========================================================================

    function _getResidenceRecord(residenceId) {
        if (!residenceId) return null;
        var all = _getResidencesArray();
        for (var i = 0; i < all.length; i++) {
            if (all[i].id === residenceId) {
                _ensureResidenceShape(all[i]);
                return all[i];
            }
        }
        return null;
    }

    function _getAllResidenceRecords(options) {
        options = options || {};
        var all = _getResidencesArray();
        for (var i = 0; i < all.length; i++) _ensureResidenceShape(all[i]);
        if (options.includeDemolished) return all.slice();
        var result = [];
        for (var j = 0; j < all.length; j++) {
            if (all[j].isDemolished !== true) result.push(all[j]);
        }
        return result;
    }

    // =========================================================================
    // 6. RESIDENCE PROJECTIONS (defensive snapshots)
    // =========================================================================

    function _snapshotResidence(r) {
        if (!r) return null;
        return {
            id: r.id,
            name: r.name,
            locationId: r.locationId || null,
            locationName: r.locationName || null,
            typeId: r.typeId || null,
            typeName: r.typeName || null,
            isMultiUnit: r.isMultiUnit === true,
            capacity: r.capacity !== undefined ? r.capacity : null,
            status: r.status || null,
            condition: r.condition || null,
            estimatedValue: r.estimatedValue !== undefined ? r.estimatedValue : null,
            builtYear: r.builtYear !== undefined ? r.builtYear : null,
            foundedYear: r.foundedYear !== undefined ? r.foundedYear : null,
            lastRenovated: r.lastRenovated !== undefined ? r.lastRenovated : null,
            notes: r.notes || '',
            description: r.description || '',
            features: Array.isArray(r.features) ? r.features.slice() : [],

            isDemolished: r.isDemolished === true,
            demolishedYear: r.demolishedYear !== undefined ? r.demolishedYear : null,
            demolishedReason: r.demolishedReason || null,

            // Derived occupancy
            unitCount: Array.isArray(r.units) ? r.units.length : 0,
            occupiedUnits: _countOccupiedUnits(r),
            vacantUnits: _countVacantUnits(r),
            isVacant: _isResidenceVacant(r),

            // Ownership / rental
            ownerType: r.ownerType || null,
            ownerId: r.ownerId || null,
            ownerName: r.ownerName || null,
            ownerSince: r.ownerSince !== undefined ? r.ownerSince : null,
            renterType: r.renterType || null,
            renterId: r.renterId || null,
            renterName: r.renterName || null,
            rentAmount: r.rentAmount !== undefined ? r.rentAmount : 0,
            rentStartYear: r.rentStartYear !== undefined ? r.rentStartYear : null,
            rentalStatus: r.rentalStatus || RENTAL_STATUS.VACANT
        };
    }

    function _snapshotUnit(u) {
        if (!u) return null;
        return {
            id: u.id,
            unitNumber: u.unitNumber,
            householdId: u.householdId || null,
            householdName: u.householdName || null,
            isVacant: u.isVacant === true,
            isDemolished: u.isDemolished === true,
            assignedYear: u.assignedYear !== undefined ? u.assignedYear : null,
            vacantYear: u.vacantYear !== undefined ? u.vacantYear : null,
            notes: u.notes || '',
            associationHistory: Array.isArray(u.associationHistory)
                ? JSON.parse(JSON.stringify(u.associationHistory))
                : []
        };
    }

    // =========================================================================
    // 7. DERIVED OCCUPANCY HELPERS (pure)
    // =========================================================================

    function _countOccupiedUnits(r) {
        if (!r || !Array.isArray(r.units)) return 0;
        var n = 0;
        for (var i = 0; i < r.units.length; i++) {
            var u = r.units[i];
            if (!u.isDemolished && !u.isVacant && u.householdId) n++;
        }
        return n;
    }

    function _countVacantUnits(r) {
        if (!r || !Array.isArray(r.units)) return 0;
        var n = 0;
        for (var i = 0; i < r.units.length; i++) {
            var u = r.units[i];
            if (!u.isDemolished && u.isVacant) n++;
        }
        return n;
    }

    function _countDemolishedUnits(r) {
        if (!r || !Array.isArray(r.units)) return 0;
        var n = 0;
        for (var i = 0; i < r.units.length; i++) {
            if (r.units[i].isDemolished) n++;
        }
        return n;
    }

    function _isResidenceVacant(r) {
        if (!r) return true;
        var units = Array.isArray(r.units) ? r.units : [];
        if (units.length === 0) return true;
        for (var i = 0; i < units.length; i++) {
            if (!units[i].isDemolished && !units[i].isVacant && units[i].householdId) {
                return false;
            }
        }
        return true;
    }

    function _getPrimaryOccupantHouseholdId(r) {
        // Convenience for single-occupant residences. Returns the householdId
        // of the first occupied unit. Returns null if vacant or multi-occupant.
        if (!r || !Array.isArray(r.units)) return null;
        var found = null;
        for (var i = 0; i < r.units.length; i++) {
            var u = r.units[i];
            if (!u.isDemolished && !u.isVacant && u.householdId) {
                if (found === null) found = u.householdId;
                else if (found !== u.householdId) return null;
            }
        }
        return found;
    }

    // =========================================================================
    // 8. RESIDENCE CRUD
    // =========================================================================

    function createResidence(name, locationId, typeId, options) {
        options = options || {};
        if (!name || typeof name !== 'string' || name.trim() === '') {
            return _fail('INVALID_NAME', 'Residence name is required');
        }
        var place = _getPlaceById(locationId);
        if (!place) return _fail('LOCATION_NOT_FOUND', 'Location not found');

        var type = RESIDENCE_TYPES[String(typeId || '').toLowerCase()];
        if (!type) return _fail('INVALID_TYPE', 'Unknown residence type');

        var year = _resolveYear(options.builtYear);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid built year');

        var id = _generateId('res');
        var residence = {
            id: id,
            name: name.trim(),
            locationId: locationId,
            locationName: place.displayName || place.name || 'Unknown',
            typeId: type.id,
            typeName: type.name,
            isMultiUnit: type.isMultiUnit,
            capacity: type.capacity,
            units: [],
            foundedYear: year,
            builtYear: year,
            status: RESIDENCE_STATUS.ACTIVE,
            condition: options.condition || 'good',
            estimatedValue: options.estimatedValue !== undefined
                ? options.estimatedValue
                : 500,
            notes: options.notes || '',
            description: options.description || '',
            features: Array.isArray(options.features) ? options.features.slice() : [],
            history: [],
            timeline: [{
                year: year,
                type: 'built',
                details: 'Residence "' + name.trim() + '" was built',
                timestamp: Date.now()
            }],
            nameHistory: [{
                oldName: null,
                newName: name.trim(),
                year: year,
                reason: 'Built',
                changedBy: options.founderId || null,
                timestamp: Date.now()
            }],
            associationHistory: [],
            vacancyHistory: [],
            damageHistory: [],
            isDemolished: false,
            demolishedYear: null,
            demolishedReason: null,

            // Ownership
            ownerType: options.ownerType || null,
            ownerId: options.ownerId || null,
            ownerName: options.ownerName || null,
            ownerSince: options.ownerSince || null,
            ownershipHistory: [],

            // Rental
            renterType: null,
            renterId: null,
            renterName: null,
            rentAmount: 0,
            rentStartYear: null,
            rentEffectiveYear: null,
            rentalStatus: RENTAL_STATUS.VACANT,
            rentalHistory: [],
            rentPayments: [],

            staffPositions: [],
            staffAssignments: [],

            maxUnits: options.maxUnits !== undefined ? options.maxUnits : 20,
            lastUpdated: year,
            createdAt: Date.now()
        };

        // Units
        if (type.isMultiUnit) {
            var unitCount = _resolveInt(options.unitCount, Math.min(10, Math.max(1,
                Math.floor(type.capacity / 3))));
            if (unitCount === null || unitCount < 1) unitCount = 1;
            for (var i = 1; i <= unitCount; i++) {
                residence.units.push(_makeUnit(i));
            }
        } else {
            residence.units.push(_makeUnit(1));
        }

        _getResidencesArray().push(residence);
        _commit();

        _logEvent('residence', 'Residence Created',
            'Created residence: ' + residence.name + ' (' + type.name + ')', []);

        return _ok({ residenceId: id });
    }

    function _makeUnit(unitNumber) {
        return {
            id: _generateId('unit'),
            unitNumber: unitNumber,
            householdId: null,
            householdName: null,
            isVacant: true,
            isDemolished: false,
            assignedYear: null,
            vacantYear: null,
            notes: '',
            associationHistory: []
        };
    }

    function updateResidence(residenceId, updates) {
        var r = _getResidenceRecord(residenceId);
        if (!r) return _fail('NOT_FOUND', 'Residence not found');

        var year = _getCurrentYear();

        if (updates.name !== undefined && updates.name !== null) {
            var newName = String(updates.name).trim();
            if (newName === '') return _fail('INVALID_NAME', 'Name cannot be empty');
            if (newName !== r.name) {
                var oldName = r.name;
                r.name = newName;
                if (updates.recordNameHistory !== false) {
                    r.nameHistory.push({
                        oldName: oldName,
                        newName: newName,
                        year: updates.renameYear !== undefined ? updates.renameYear : year,
                        reason: updates.renameReason || 'Renamed',
                        changedBy: updates.changedBy || null,
                        timestamp: Date.now()
                    });
                    _pushTimeline(r, {
                        year: updates.renameYear !== undefined ? updates.renameYear : year,
                        type: 'renamed',
                        details: 'Renamed from "' + oldName + '" to "' + newName + '"' +
                            (updates.renameReason ? ' (' + updates.renameReason + ')' : '')
                    });
                }
            }
        }

        if (updates.locationId !== undefined) {
            var place = _getPlaceById(updates.locationId);
            if (!place) return _fail('LOCATION_NOT_FOUND', 'Location not found');
            r.locationId = updates.locationId;
            r.locationName = place.displayName || place.name || 'Unknown';
        }

        var scalarFields = ['condition', 'notes', 'description', 'estimatedValue',
            'builtYear', 'foundedYear', 'features', 'maxUnits'];
        for (var i = 0; i < scalarFields.length; i++) {
            var key = scalarFields[i];
            if (updates[key] !== undefined) r[key] = updates[key];
        }

        if (updates.status !== undefined) {
            var oldStatus = r.status;
            r.status = updates.status;
            if (oldStatus !== r.status) {
                _pushTimeline(r, {
                    year: year,
                    type: 'status_changed',
                    details: 'Status: ' + oldStatus + ' -> ' + r.status
                });
            }
        }

        r.lastUpdated = year;
        _commit();
        return _ok({ residenceId: residenceId });
    }

    function deleteResidence(residenceId, options) {
        options = options || {};
        var all = _getResidencesArray();
        var idx = -1;
        for (var i = 0; i < all.length; i++) {
            if (all[i].id === residenceId) { idx = i; break; }
        }
        if (idx === -1) return _fail('NOT_FOUND', 'Residence not found');

        var r = all[idx];
        if (!options.force) {
            if (_countOccupiedUnits(r) > 0) {
                return _fail('OCCUPIED_UNITS',
                    'Cannot delete residence with occupied units');
            }
        }

        all.splice(idx, 1);
        _commit();
        _logEvent('residence', 'Residence Deleted',
            'Deleted residence: ' + r.name, []);
        return _ok({ residenceId: residenceId });
    }

    // =========================================================================
    // 9. TIMELINE / HISTORY (internal helpers)
    // =========================================================================

    function _pushTimeline(r, event) {
        if (!Array.isArray(r.timeline)) r.timeline = [];
        r.timeline.push({
            year: event.year !== undefined ? event.year : _getCurrentYear(),
            type: event.type || 'event',
            details: event.details || '',
            householdName: event.householdName || null,
            unitNumber: event.unitNumber !== undefined ? event.unitNumber : null,
            timestamp: Date.now()
        });
        if (r.timeline.length > MAX_TIMELINE_ENTRIES) {
            r.timeline = r.timeline.slice(-MAX_TIMELINE_ENTRIES);
        }
    }

    function _pushHistory(r, action, details, actorId) {
        if (!Array.isArray(r.history)) r.history = [];
        r.history.push({
            year: _getCurrentYear(),
            action: action,
            details: details,
            actorId: actorId || null,
            timestamp: Date.now()
        });
        if (r.history.length > MAX_HISTORY_ENTRIES) {
            r.history = r.history.slice(-MAX_HISTORY_ENTRIES);
        }
    }

    // =========================================================================
    // 10. UNIT OPERATIONS
    // =========================================================================

    function addUnit(residenceId, options) {
        options = options || {};
        var r = _getResidenceRecord(residenceId);
        if (!r) return _fail('NOT_FOUND', 'Residence not found');
        if (!r.isMultiUnit) return _fail('NOT_MULTI_UNIT', 'Cannot add units to a single-unit residence');

        var maxUnits = r.maxUnits !== undefined ? r.maxUnits : 20;
        if (r.units.length >= maxUnits) {
            return _fail('MAX_UNITS', 'Maximum units reached (' + maxUnits + ')');
        }

        var unitNumber = _resolveInt(options.unitNumber, r.units.length + 1);
        if (unitNumber === null || unitNumber < 1) {
            return _fail('INVALID_UNIT_NUMBER', 'Unit number must be a positive integer');
        }
        for (var i = 0; i < r.units.length; i++) {
            if (r.units[i].unitNumber === unitNumber) {
                return _fail('DUPLICATE_UNIT', 'Unit number already exists');
            }
        }

        var unit = _makeUnit(unitNumber);
        unit.notes = options.notes || '';
        r.units.push(unit);
        r.lastUpdated = _getCurrentYear();
        _commit();

        _pushHistory(r, 'unit_added', 'Added Unit ' + unitNumber);
        _pushTimeline(r, {
            year: _getCurrentYear(),
            type: 'unit_added',
            details: 'Unit ' + unitNumber + ' was added',
            unitNumber: unitNumber
        });
        _commit();

        return _ok({ residenceId: residenceId, unitNumber: unitNumber, unitId: unit.id });
    }

    function removeUnit(residenceId, unitNumber, options) {
        options = options || {};
        var r = _getResidenceRecord(residenceId);
        if (!r) return _fail('NOT_FOUND', 'Residence not found');

        var idx = -1;
        for (var i = 0; i < r.units.length; i++) {
            if (r.units[i].unitNumber === unitNumber) { idx = i; break; }
        }
        if (idx === -1) return _fail('UNIT_NOT_FOUND', 'Unit not found');

        var unit = r.units[idx];
        if (unit.isDemolished) return _fail('UNIT_DEMOLISHED', 'Unit already demolished');

        if (!unit.isVacant && options.force !== true) {
            return _fail('UNIT_OCCUPIED', 'Unit is occupied');
        }

        // If occupied and force, disassociate the household
        if (!unit.isVacant && unit.householdId) {
            _disassociateHouseholdFromUnit(r, unit, _getCurrentYear(),
                options.reason || 'Unit removed');
        }

        r.units.splice(idx, 1);
        r.lastUpdated = _getCurrentYear();
        _commit();

        _pushHistory(r, 'unit_removed',
            'Removed Unit ' + unitNumber +
            (options.reason ? ' (' + options.reason + ')' : ''));
        _pushTimeline(r, {
            year: _getCurrentYear(),
            type: 'unit_removed',
            details: 'Unit ' + unitNumber + ' was removed' +
                (options.reason ? ' (' + options.reason + ')' : ''),
            unitNumber: unitNumber
        });
        _commit();

        return _ok({ residenceId: residenceId, unitNumber: unitNumber });
    }

    function assignHouseholdToUnit(residenceId, unitNumber, householdId, householdName, year, options) {
        options = options || {};
        var r = _getResidenceRecord(residenceId);
        if (!r) return _fail('NOT_FOUND', 'Residence not found');

        var unit = null;
        for (var i = 0; i < r.units.length; i++) {
            if (r.units[i].unitNumber === unitNumber) { unit = r.units[i]; break; }
        }
        if (!unit) return _fail('UNIT_NOT_FOUND', 'Unit not found');
        if (unit.isDemolished) return _fail('UNIT_DEMOLISHED', 'Unit is demolished');
        if (!unit.isVacant) return _fail('UNIT_OCCUPIED', 'Unit is already occupied');

        var household = null;
        var hq = _householdQueries();
        if (hq) household = hq.getHousehold(householdId);
        if (!household) return _fail('HOUSEHOLD_NOT_FOUND', 'Household not found');

        var y = _resolveYear(year);
        if (y === null) return _fail('INVALID_YEAR', 'Invalid assignment year');

        // If the household is already occupying another unit in this residence,
        // vacate it first (a household occupies one unit per residence).
        for (var j = 0; j < r.units.length; j++) {
            var other = r.units[j];
            if (other.unitNumber === unitNumber) continue;
            if (other.householdId === householdId && !other.isVacant) {
                _disassociateHouseholdFromUnit(r, other, y,
                    'Moved to Unit ' + unitNumber);
            }
        }

        // Assign
        if (!Array.isArray(unit.associationHistory)) unit.associationHistory = [];
        unit.householdId = householdId;
        unit.householdName = householdName || household.name;
        unit.isVacant = false;
        unit.assignedYear = y;
        unit.vacantYear = null;
        unit.notes = options.notes || '';

        unit.associationHistory.push({
            householdId: householdId,
            householdName: unit.householdName,
            year: y,
            endedYear: null,
            reason: options.reason || 'Assigned',
            timestamp: Date.now()
        });

        // Residence-level association history
        if (!Array.isArray(r.associationHistory)) r.associationHistory = [];
        r.associationHistory.push({
            householdId: householdId,
            householdName: unit.householdName,
            unitNumber: unitNumber,
            year: y,
            endedYear: null,
            reason: options.reason || 'Assigned',
            timestamp: Date.now()
        });

        // Reverse index on household
        _associateHouseholdReverseIndex(householdId, r, unitNumber, y,
            options.notes || '');

        r.lastUpdated = y;
        _commit();

        _pushHistory(r, 'unit_assigned',
            (unit.householdName) + ' assigned to Unit ' + unitNumber);
        _pushTimeline(r, {
            year: y,
            type: 'unit_assigned',
            details: unit.householdName + ' assigned to Unit ' + unitNumber,
            householdName: unit.householdName,
            unitNumber: unitNumber
        });
        _commit();

        return _ok({
            residenceId: residenceId,
            unitNumber: unitNumber,
            householdId: householdId,
            year: y
        });
    }

    function markUnitVacant(residenceId, unitNumber, reason, year) {
        var r = _getResidenceRecord(residenceId);
        if (!r) return _fail('NOT_FOUND', 'Residence not found');

        var unit = null;
        for (var i = 0; i < r.units.length; i++) {
            if (r.units[i].unitNumber === unitNumber) { unit = r.units[i]; break; }
        }
        if (!unit) return _fail('UNIT_NOT_FOUND', 'Unit not found');
        if (unit.isDemolished) return _fail('UNIT_DEMOLISHED', 'Unit is demolished');
        if (unit.isVacant) return _fail('UNIT_VACANT', 'Unit is already vacant');

        var y = _resolveYear(year);
        if (y === null) return _fail('INVALID_YEAR', 'Invalid year');

        var householdId = unit.householdId;
        var householdName = unit.householdName || 'Unknown';
        var reasonText = reason || 'Vacated';

        _disassociateHouseholdFromUnit(r, unit, y, reasonText);

        r.lastUpdated = y;
        _commit();

        _pushHistory(r, 'unit_vacated',
            'Vacated Unit ' + unitNumber + ' (' + householdName + '): ' + reasonText);
        _pushTimeline(r, {
            year: y,
            type: 'unit_vacated',
            details: 'Unit ' + unitNumber + ' vacated by ' + householdName +
                ' (' + reasonText + ')',
            householdName: householdName,
            unitNumber: unitNumber
        });
        _commit();

        return _ok({
            residenceId: residenceId,
            unitNumber: unitNumber,
            householdId: householdId,
            year: y
        });
    }

    /**
     * Internal: clear unit occupancy and update reverse index.
     * Caller is responsible for _commit() and history.
     */
    function _disassociateHouseholdFromUnit(r, unit, year, reason) {
        var householdId = unit.householdId;
        var householdName = unit.householdName;

        if (!Array.isArray(unit.associationHistory)) unit.associationHistory = [];
        // Close the current open association
        for (var i = unit.associationHistory.length - 1; i >= 0; i--) {
            var a = unit.associationHistory[i];
            if (a.householdId === householdId && !a.endedYear) {
                a.endedYear = year;
                a.reason = reason;
                a.timestamp = Date.now();
                break;
            }
        }

        // Close residence-level association for this unit
        if (Array.isArray(r.associationHistory)) {
            for (var j = r.associationHistory.length - 1; j >= 0; j--) {
                var ra = r.associationHistory[j];
                if (ra.householdId === householdId &&
                    ra.unitNumber === unit.unitNumber &&
                    !ra.endedYear) {
                    ra.endedYear = year;
                    ra.reason = reason;
                    ra.timestamp = Date.now();
                    break;
                }
            }
        }

        unit.householdId = null;
        unit.householdName = null;
        unit.isVacant = true;
        unit.assignedYear = null;
        unit.vacantYear = year;

        // Reverse index — clear on household if it points at this unit
        _disassociateHouseholdReverseIndex(householdId, r, unit.unitNumber, year, reason);
    }

    function demolishUnit(residenceId, unitNumber, reason, year) {
        var r = _getResidenceRecord(residenceId);
        if (!r) return _fail('NOT_FOUND', 'Residence not found');

        var unit = null;
        for (var i = 0; i < r.units.length; i++) {
            if (r.units[i].unitNumber === unitNumber) { unit = r.units[i]; break; }
        }
        if (!unit) return _fail('UNIT_NOT_FOUND', 'Unit not found');
        if (unit.isDemolished) return _fail('UNIT_DEMOLISHED', 'Unit already demolished');
        if (!unit.isVacant) return _fail('UNIT_OCCUPIED', 'Cannot demolish occupied unit');

        var y = _resolveYear(year);
        if (y === null) return _fail('INVALID_YEAR', 'Invalid year');

        unit.isDemolished = true;
        unit.isVacant = true;
        unit.notes = (unit.notes ? unit.notes + '; ' : '') +
            'Demolished in ' + y + ': ' + (reason || 'Demolished');

        r.lastUpdated = y;
        _commit();

        _pushHistory(r, 'unit_demolished',
            'Demolished Unit ' + unitNumber + ': ' + (reason || 'Demolished'));
        _pushTimeline(r, {
            year: y,
            type: 'unit_demolished',
            details: 'Unit ' + unitNumber + ' demolished' +
                (reason ? ' (' + reason + ')' : ''),
            unitNumber: unitNumber
        });
        _commit();

        return _ok({ residenceId: residenceId, unitNumber: unitNumber, year: y });
    }

    // =========================================================================
    // 11. HOUSEHOLD REVERSE INDEX
    // =========================================================================

    function _associateHouseholdReverseIndex(householdId, r, unitNumber, year, notes) {
        var hc = _householdCommands();
        if (!hc) return;
        hc.associateWithResidence(householdId, r.id, {
            residenceName: r.name,
            residenceType: r.typeId,
            year: year,
            unitNumber: unitNumber,
            notes: notes || ''
        });
    }

    function _disassociateHouseholdReverseIndex(householdId, r, unitNumber, year, reason) {
        var hc = _householdCommands();
        if (!hc) return;
        hc.disassociateFromResidence(householdId, r.id, reason, year);
    }

    // =========================================================================
    // 12. RESIDENCE-LEVEL VACANCY
    // =========================================================================

    /**
     * Marks an entire residence vacant. Vacuates ALL occupied units.
     * Correctly disassociates EVERY affected household, not just one.
     */
    function markResidenceVacant(residenceId, reason, year) {
        var r = _getResidenceRecord(residenceId);
        if (!r) return _fail('NOT_FOUND', 'Residence not found');
        if (r.isDemolished) return _fail('DEMOLISHED', 'Residence is demolished');
        if (_isResidenceVacant(r)) return _fail('ALREADY_VACANT', 'Residence is already vacant');

        var y = _resolveYear(year);
        if (y === null) return _fail('INVALID_YEAR', 'Invalid year');
        var reasonText = reason || 'Marked vacant';

        var affectedHouseholds = [];

        // Vacate every occupied unit
        for (var i = 0; i < r.units.length; i++) {
            var unit = r.units[i];
            if (!unit.isDemolished && !unit.isVacant && unit.householdId) {
                affectedHouseholds.push({
                    householdId: unit.householdId,
                    householdName: unit.householdName,
                    unitNumber: unit.unitNumber
                });
                _disassociateHouseholdFromUnit(r, unit, y, reasonText);
            }
        }

        if (!Array.isArray(r.vacancyHistory)) r.vacancyHistory = [];
        r.vacancyHistory.push({
            startedVacantYear: y,
            reason: reasonText,
            endedVacantYear: null,
            endedByHouseholdId: null,
            endedByHouseholdName: null,
            affectedHouseholds: affectedHouseholds.slice()
        });

        r.lastUpdated = y;
        _commit();

        _pushHistory(r, 'marked_vacant',
            'Marked vacant: ' + reasonText +
            ' (' + affectedHouseholds.length + ' households affected)');
        _pushTimeline(r, {
            year: y,
            type: 'vacant',
            details: 'Residence became vacant (' + reasonText + ')'
        });
        _commit();

        return _ok({
            residenceId: residenceId,
            year: y,
            affectedHouseholds: affectedHouseholds
        });
    }

    /**
     * Assigns a household to a vacant residence. Picks the first vacant
     * unit. If no unit exists, fails — the caller must add units first.
     */
    function assignHouseholdToVacantResidence(residenceId, householdId, householdName, year, options) {
        options = options || {};
        var r = _getResidenceRecord(residenceId);
        if (!r) return _fail('NOT_FOUND', 'Residence not found');
        if (r.isDemolished) return _fail('DEMOLISHED', 'Residence is demolished');

        var hq = _householdQueries();
        if (!hq) return _fail('HOUSEHOLD_SYSTEM_UNAVAILABLE', 'HouseholdQueries not available');
        var household = hq.getHousehold(householdId);
        if (!household) return _fail('HOUSEHOLD_NOT_FOUND', 'Household not found');

        var y = _resolveYear(year);
        if (y === null) return _fail('INVALID_YEAR', 'Invalid year');

        // Find first usable vacant unit
        var assignedUnit = null;
        for (var i = 0; i < r.units.length; i++) {
            if (r.units[i].isVacant && !r.units[i].isDemolished) {
                assignedUnit = r.units[i];
                break;
            }
        }

        if (!assignedUnit) {
            return _fail('NO_VACANT_UNIT',
                'No vacant unit available in this residence');
        }

        // If the household already has another residence, that's the
        // caller's business to disassociate first. We log but proceed —
        // the reverse index will be overwritten.
        var result = assignHouseholdToUnit(
            residenceId,
            assignedUnit.unitNumber,
            householdId,
            householdName || household.name,
            y,
            options
        );

        return result;
    }

    // =========================================================================
    // 13. NAME HISTORY
    // =========================================================================

    function updateResidenceName(residenceId, newName, options) {
        options = options || {};
        if (!newName || String(newName).trim() === '') {
            return _fail('INVALID_NAME', 'Name cannot be empty');
        }
        var r = _getResidenceRecord(residenceId);
        if (!r) return _fail('NOT_FOUND', 'Residence not found');

        var year = _resolveYear(options.year);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid year');

        var oldName = r.name;
        if (oldName === String(newName).trim()) {
            return _fail('SAME_NAME', 'New name equals current name');
        }

        r.name = String(newName).trim();

        if (options.addToHistory !== false) {
            if (!Array.isArray(r.nameHistory)) r.nameHistory = [];
            r.nameHistory.push({
                oldName: oldName,
                newName: r.name,
                year: year,
                reason: options.reason || 'Renamed',
                changedBy: options.changedBy || null,
                timestamp: Date.now()
            });
        }

        r.lastUpdated = year;
        _commit();

        _pushTimeline(r, {
            year: year,
            type: 'renamed',
            details: 'Renamed from "' + oldName + '" to "' + r.name + '"' +
                (options.reason ? ' (' + options.reason + ')' : '')
        });
        _commit();

        return _ok({
            residenceId: residenceId,
            oldName: oldName,
            newName: r.name,
            year: year
        });
    }

    // =========================================================================
    // 14. RENTAL
    // =========================================================================

    function _lookupOwnerName(type, id) {
        if (type === 'household') {
            var hq = _householdQueries();
            if (hq) {
                var h = hq.getHousehold(id);
                if (h) return h.name;
            }
            return 'Unknown Household';
        }
        if (type === 'character') {
            var c = _getCharacterById(id);
            if (c) return (c.name || '') + (c.surname ? ' ' + c.surname : '');
            return 'Unknown Character';
        }
        return 'Unknown';
    }

    function setResidenceOwner(residenceId, ownerType, ownerId, options) {
        options = options || {};
        var r = _getResidenceRecord(residenceId);
        if (!r) return _fail('NOT_FOUND', 'Residence not found');

        if (ownerType !== 'household' && ownerType !== 'character') {
            return _fail('INVALID_OWNER_TYPE', 'Owner type must be household or character');
        }

        if (ownerType === 'household') {
            var hq = _householdQueries();
            if (!hq || !hq.getHousehold(ownerId)) {
                return _fail('OWNER_NOT_FOUND', 'Household not found');
            }
        } else {
            if (!_getCharacterById(ownerId)) {
                return _fail('OWNER_NOT_FOUND', 'Character not found');
            }
        }

        var year = _resolveYear(options.ownerSince);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid owner-since year');

        var oldOwnerId = r.ownerId;
        var oldOwnerType = r.ownerType;
        var oldOwnerName = r.ownerName;

        r.ownerType = ownerType;
        r.ownerId = ownerId;
        r.ownerName = options.ownerName || _lookupOwnerName(ownerType, ownerId);
        r.ownerSince = year;

        if (!Array.isArray(r.ownershipHistory)) r.ownershipHistory = [];
        r.ownershipHistory.push({
            ownerType: ownerType,
            ownerId: ownerId,
            ownerName: r.ownerName,
            year: year,
            action: 'set_owner',
            previousOwnerId: oldOwnerId,
            previousOwnerType: oldOwnerType,
            previousOwnerName: oldOwnerName,
            timestamp: Date.now()
        });

        // Update rental status if no active renter
        if (!r.renterId) {
            r.rentalStatus = RENTAL_STATUS.VACANT;
        }

        r.lastUpdated = year;
        _commit();

        return _ok({
            residenceId: residenceId,
            ownerType: ownerType,
            ownerId: ownerId,
            ownerName: r.ownerName
        });
    }

    function getResidenceOwner(residenceId) {
        var r = _getResidenceRecord(residenceId);
        if (!r) return null;
        return {
            ownerType: r.ownerType || null,
            ownerId: r.ownerId || null,
            ownerName: r.ownerName || 'None',
            ownerSince: r.ownerSince !== undefined ? r.ownerSince : null
        };
    }

    function setResidenceRenter(residenceId, renterType, renterId, rentAmount, options) {
        options = options || {};
        var r = _getResidenceRecord(residenceId);
        if (!r) return _fail('NOT_FOUND', 'Residence not found');
        if (!r.ownerId) return _fail('NO_OWNER', 'Residence must have an owner before it can be rented');

        if (renterType !== 'household' && renterType !== 'character') {
            return _fail('INVALID_RENTER_TYPE', 'Renter type must be household or character');
        }
        if (renterType === 'household') {
            var hq = _householdQueries();
            if (!hq || !hq.getHousehold(renterId)) {
                return _fail('RENTER_NOT_FOUND', 'Household not found');
            }
        } else {
            if (!_getCharacterById(renterId)) {
                return _fail('RENTER_NOT_FOUND', 'Character not found');
            }
        }

        if (typeof rentAmount !== 'number' || !isFinite(rentAmount) || rentAmount < 0) {
            return _fail('INVALID_RENT', 'Rent must be a non-negative number');
        }

        var year = _resolveYear(options.rentStartYear);
        if (year === null) return _fail('INVALID_YEAR', 'Invalid rent start year');

        var oldRenterId = r.renterId;
        var oldRenterName = r.renterName;
        var oldRent = r.rentAmount;

        // Close any open rental
        if (r.renterId && Array.isArray(r.rentalHistory)) {
            for (var i = r.rentalHistory.length - 1; i >= 0; i--) {
                if (!r.rentalHistory[i].endYear) {
                    r.rentalHistory[i].endYear = year;
                    r.rentalHistory[i].reason = 'Replaced by new renter';
                    break;
                }
            }
        }

        r.renterType = renterType;
        r.renterId = renterId;
        r.renterName = options.renterName || _lookupOwnerName(renterType, renterId);
        r.rentAmount = rentAmount;
        r.rentStartYear = year;
        r.rentEffectiveYear = year;
        r.rentalStatus = RENTAL_STATUS.RENTED;

        if (!Array.isArray(r.rentalHistory)) r.rentalHistory = [];
        r.rentalHistory.push({
            renterType: renterType,
            renterId: renterId,
            renterName: r.renterName,
            rentAmount: rentAmount,
            startYear: year,
            endYear: null,
            action: 'rent_started',
            previousRenterId: oldRenterId,
            previousRenterName: oldRenterName,
            previousRentAmount: oldRent,
            timestamp: Date.now()
        });

        r.lastUpdated = year;
        _commit();

        return _ok({
            residenceId: residenceId,
            renterType: renterType,
            renterId: renterId,
            rentAmount: rentAmount,
            year: year
        });
    }

    function getResidenceRenter(residenceId) {
        var r = _getResidenceRecord(residenceId);
        if (!r) return null;
        return {
            renterType: r.renterType || null,
            renterId: r.renterId || null,
            renterName: r.renterName || 'None',
            rentAmount: r.rentAmount !== undefined ? r.rentAmount : 0,
            rentStartYear: r.rentStartYear !== undefined ? r.rentStartYear : null,
            rentalStatus: r.rentalStatus || RENTAL_STATUS.VACANT
        };
    }

    function endResidenceRental(residenceId, endYear, reason) {
        var r = _getResidenceRecord(residenceId);
        if (!r) return _fail('NOT_FOUND', 'Residence not found');
        if (!r.renterId) return _fail('NO_RENTER', 'Residence has no renter');

        var y = _resolveYear(endYear);
        if (y === null) return _fail('INVALID_YEAR', 'Invalid year');

        var oldRenterId = r.renterId;
        var oldRenterName = r.renterName;

        if (Array.isArray(r.rentalHistory)) {
            for (var i = r.rentalHistory.length - 1; i >= 0; i--) {
                if (r.rentalHistory[i].renterId === oldRenterId &&
                    !r.rentalHistory[i].endYear) {
                    r.rentalHistory[i].endYear = y;
                    r.rentalHistory[i].reason = reason || 'Rental ended';
                    break;
                }
            }
        }

        r.renterType = null;
        r.renterId = null;
        r.renterName = null;
        r.rentAmount = 0;
        r.rentStartYear = null;
        r.rentEffectiveYear = null;
        r.rentalStatus = RENTAL_STATUS.VACANT;

        r.lastUpdated = y;
        _commit();

        _pushTimeline(r, {
            year: y,
            type: 'rental_ended',
            details: 'Rental ended for ' + (oldRenterName || 'Unknown') +
                (reason ? ': ' + reason : '')
        });
        _commit();

        return _ok({
            residenceId: residenceId,
            previousRenterId: oldRenterId,
            year: y
        });
    }

    function updateResidenceRent(residenceId, newRentAmount, effectiveYear, reason) {
        var r = _getResidenceRecord(residenceId);
        if (!r) return _fail('NOT_FOUND', 'Residence not found');
        if (!r.renterId) return _fail('NO_RENTER', 'Residence has no renter');

        if (typeof newRentAmount !== 'number' || !isFinite(newRentAmount) || newRentAmount < 0) {
            return _fail('INVALID_RENT', 'Rent must be a non-negative number');
        }

        var y = _resolveYear(effectiveYear);
        if (y === null) return _fail('INVALID_YEAR', 'Invalid year');

        var oldRent = r.rentAmount;
        if (oldRent === newRentAmount) {
            return _fail('SAME_RENT', 'New rent equals current rent');
        }

        r.rentAmount = newRentAmount;
        r.rentEffectiveYear = y;

        if (!Array.isArray(r.rentalHistory)) r.rentalHistory = [];
        r.rentalHistory.push({
            renterType: r.renterType,
            renterId: r.renterId,
            renterName: r.renterName,
            oldRentAmount: oldRent,
            newRentAmount: newRentAmount,
            year: y,
            action: 'rent_adjusted',
            reason: reason || 'Rent adjustment',
            timestamp: Date.now()
        });

        r.lastUpdated = y;
        _commit();
        return _ok({
            residenceId: residenceId,
            oldRent: oldRent,
            newRent: newRentAmount,
            year: y
        });
    }

    function recordRentPayment(residenceId, renterId, amount, year) {
        var r = _getResidenceRecord(residenceId);
        if (!r) return _fail('NOT_FOUND', 'Residence not found');
        if (!r.renterId) return _fail('NO_RENTER', 'Residence has no renter');
        if (renterId !== r.renterId) {
            return _fail('RENTER_MISMATCH', 'Provided renter does not match current renter');
        }
        if (typeof amount !== 'number' || !isFinite(amount) || amount <= 0) {
            return _fail('INVALID_AMOUNT', 'Amount must be a positive number');
        }
        var y = _resolveYear(year);
        if (y === null) return _fail('INVALID_YEAR', 'Invalid year');

        if (!Array.isArray(r.rentPayments)) r.rentPayments = [];
        r.rentPayments.push({
            renterId: renterId,
            renterName: r.renterName,
            amount: amount,
            year: y,
            paid: true,
            timestamp: Date.now()
        });
        r.lastUpdated = y;
        _commit();

        return _ok({ residenceId: residenceId, amount: amount, year: y });
    }

    // =========================================================================
    // 15. RESIDENCE-LEVEL STAFF
    // =========================================================================

    function addStaffPosition(residenceId, data) {
        data = data || {};
        var r = _getResidenceRecord(residenceId);
        if (!r) return _fail('NOT_FOUND', 'Residence not found');
        if (!data.name || String(data.name).trim() === '') {
            return _fail('INVALID_NAME', 'Staff position name is required');
        }
        if (!Array.isArray(r.staffPositions)) r.staffPositions = [];

        var position = {
            id: _generateId('rspos'),
            name: String(data.name).trim(),
            unitNumber: data.unitNumber !== undefined ? data.unitNumber : null,
            requiredRoleId: data.requiredRoleId || null,
            minSkillLevel: data.minSkillLevel !== undefined ? data.minSkillLevel : 0,
            notes: data.notes || '',
            createdAt: _getCurrentYear(),
            updatedAt: _getCurrentYear()
        };
        r.staffPositions.push(position);
        r.lastUpdated = _getCurrentYear();
        _commit();

        _pushHistory(r, 'staff_position_added', 'Added staff position: ' + position.name);
        _commit();

        return _ok({ residenceId: residenceId, positionId: position.id });
    }

    function updateStaffPosition(residenceId, positionId, updates) {
        var r = _getResidenceRecord(residenceId);
        if (!r) return _fail('NOT_FOUND', 'Residence not found');
        if (!Array.isArray(r.staffPositions)) return _fail('NO_POSITIONS', 'No staff positions');

        var pos = null;
        for (var i = 0; i < r.staffPositions.length; i++) {
            if (r.staffPositions[i].id === positionId) { pos = r.staffPositions[i]; break; }
        }
        if (!pos) return _fail('NOT_FOUND', 'Staff position not found');

        var allowed = ['name', 'unitNumber', 'requiredRoleId', 'minSkillLevel', 'notes'];
        for (var j = 0; j < allowed.length; j++) {
            var key = allowed[j];
            if (updates[key] !== undefined) pos[key] = updates[key];
        }
        pos.updatedAt = _getCurrentYear();
        r.lastUpdated = _getCurrentYear();
        _commit();

        _pushHistory(r, 'staff_position_updated', 'Updated staff position: ' + pos.name);
        _commit();

        return _ok({ residenceId: residenceId, positionId: positionId });
    }

    function removeStaffPosition(residenceId, positionId, options) {
        options = options || {};
        var r = _getResidenceRecord(residenceId);
        if (!r) return _fail('NOT_FOUND', 'Residence not found');
        if (!Array.isArray(r.staffPositions)) return _fail('NO_POSITIONS', 'No staff positions');

        var idx = -1;
        var pos = null;
        for (var i = 0; i < r.staffPositions.length; i++) {
            if (r.staffPositions[i].id === positionId) {
                idx = i;
                pos = r.staffPositions[i];
                break;
            }
        }
        if (idx === -1) return _fail('NOT_FOUND', 'Staff position not found');

        r.staffPositions.splice(idx, 1);

        if (options.removeAssignments !== false && Array.isArray(r.staffAssignments)) {
            var filtered = [];
            for (var j = 0; j < r.staffAssignments.length; j++) {
                if (r.staffAssignments[j].positionId !== positionId) {
                    filtered.push(r.staffAssignments[j]);
                }
            }
            r.staffAssignments = filtered;
        }

        r.lastUpdated = _getCurrentYear();
        _commit();

        _pushHistory(r, 'staff_position_removed', 'Removed staff position: ' + pos.name);
        _commit();

        return _ok({ residenceId: residenceId, positionId: positionId });
    }

    function assignCharacterToStaffPosition(residenceId, positionId, characterId, options) {
        options = options || {};
        var r = _getResidenceRecord(residenceId);
        if (!r) return _fail('NOT_FOUND', 'Residence not found');
        if (!Array.isArray(r.staffPositions)) return _fail('NO_POSITIONS', 'No staff positions');

        var pos = null;
        for (var i = 0; i < r.staffPositions.length; i++) {
            if (r.staffPositions[i].id === positionId) { pos = r.staffPositions[i]; break; }
        }
        if (!pos) return _fail('POSITION_NOT_FOUND', 'Staff position not found');

        var character = _getCharacterById(characterId);
        if (!character) return _fail('CHARACTER_NOT_FOUND', 'Character not found');
        if (character.isDeceased) return _fail('CHARACTER_DECEASED', 'Character is deceased');

        if (!Array.isArray(r.staffAssignments)) r.staffAssignments = [];
        for (var j = 0; j < r.staffAssignments.length; j++) {
            var a = r.staffAssignments[j];
            if (a.positionId === positionId &&
                a.characterId === characterId &&
                !a.endYear) {
                return _fail('ALREADY_ASSIGNED', 'Character already assigned to this position');
            }
        }

        var startYear = _resolveYear(options.startYear);
        if (startYear === null) return _fail('INVALID_YEAR', 'Invalid start year');
        var endYear = options.endYear !== undefined ? options.endYear : null;
        if (endYear !== null && endYear <= startYear) {
            return _fail('INVALID_YEAR_RANGE', 'End year must be after start year');
        }

        var assignment = {
            id: _generateId('rsassign'),
            positionId: positionId,
            characterId: characterId,
            characterName: (character.name || '') +
                (character.surname ? ' ' + character.surname : ''),
            startYear: startYear,
            endYear: endYear,
            endReason: null,
            title: options.title || pos.name,
            notes: options.notes || '',
            roleIdAtAssignment: pos.requiredRoleId || null,
            skillLevelAtAssignment: options.skillLevelAtAssignment !== undefined
                ? options.skillLevelAtAssignment : 0,
            unitNumber: pos.unitNumber || null
        };

        r.staffAssignments.push(assignment);
        r.lastUpdated = startYear;
        _commit();

        _pushHistory(r, 'staff_assigned',
            assignment.characterName + ' assigned as ' + assignment.title);
        _commit();

        return _ok({ residenceId: residenceId, assignmentId: assignment.id });
    }

    function endStaffAssignment(residenceId, assignmentId, endYear, reason) {
        var r = _getResidenceRecord(residenceId);
        if (!r) return _fail('NOT_FOUND', 'Residence not found');
        if (!Array.isArray(r.staffAssignments)) return _fail('NO_ASSIGNMENTS', 'No assignments');

        var a = null;
        for (var i = 0; i < r.staffAssignments.length; i++) {
            if (r.staffAssignments[i].id === assignmentId) {
                a = r.staffAssignments[i];
                break;
            }
        }
        if (!a) return _fail('NOT_FOUND', 'Assignment not found');
        if (a.endYear !== null && a.endYear !== undefined) {
            return _fail('ALREADY_ENDED', 'Assignment already ended');
        }

        var y = _resolveYear(endYear);
        if (y === null) return _fail('INVALID_YEAR', 'Invalid year');
        if (y < a.startYear) {
            return _fail('INVALID_YEAR_RANGE', 'End year must not precede start year');
        }

        a.endYear = y;
        a.endReason = reason || 'Term ended';
        r.lastUpdated = y;
        _commit();

        return _ok({ residenceId: residenceId, assignmentId: assignmentId });
    }

    function deleteStaffAssignment(residenceId, assignmentId) {
        var r = _getResidenceRecord(residenceId);
        if (!r) return _fail('NOT_FOUND', 'Residence not found');
        if (!Array.isArray(r.staffAssignments)) return _fail('NO_ASSIGNMENTS', 'No assignments');

        var idx = -1;
        for (var i = 0; i < r.staffAssignments.length; i++) {
            if (r.staffAssignments[i].id === assignmentId) { idx = i; break; }
        }
        if (idx === -1) return _fail('NOT_FOUND', 'Assignment not found');

        r.staffAssignments.splice(idx, 1);
        r.lastUpdated = _getCurrentYear();
        _commit();
        return _ok({ residenceId: residenceId, assignmentId: assignmentId });
    }

    // =========================================================================
    // 16. REHABILITATION & DEMOLITION
    // =========================================================================

    /**
     * Deterministic repair cost estimate.
     */
    function calculateRepairCost(residenceId, targetCondition) {
        var r = _getResidenceRecord(residenceId);
        if (!r) return 0;
        var currentCondition = r.condition || 'good';
        var currentM = CONDITION_MULTIPLIER[currentCondition];
        var targetM = CONDITION_MULTIPLIER[targetCondition];
        if (currentM === undefined || targetM === undefined) return 0;

        var baseValue = r.estimatedValue !== undefined ? r.estimatedValue : 500;
        var repairFactor = targetM - currentM;
        if (repairFactor <= 0) return 0;
        return Math.round(baseValue * repairFactor * 0.5);
    }

    function rehabilitateResidence(residenceId, targetCondition, year) {
        var r = _getResidenceRecord(residenceId);
        if (!r) return _fail('NOT_FOUND', 'Residence not found');
        if (r.isDemolished) return _fail('DEMOLISHED', 'Residence is demolished');
        if (CONDITION_MULTIPLIER[targetCondition] === undefined) {
            return _fail('INVALID_CONDITION', 'Unknown condition');
        }

        var currentCondition = r.condition || 'good';
        if (currentCondition === targetCondition) {
            return _fail('SAME_CONDITION', 'Already at target condition');
        }

        var cost = calculateRepairCost(residenceId, targetCondition);
        if (cost <= 0) return _fail('NO_REPAIR_NEEDED', 'No repair needed');

        var y = _resolveYear(year);
        if (y === null) return _fail('INVALID_YEAR', 'Invalid year');

        var oldValue = r.estimatedValue !== undefined ? r.estimatedValue : 500;
        var newValue = Math.round(oldValue * (1 + 0.05 * (CONDITION_MULTIPLIER[targetCondition] -
            CONDITION_MULTIPLIER[currentCondition])));

        r.condition = targetCondition;
        r.lastRenovated = y;
        r.estimatedValue = newValue;
        r.lastUpdated = y;
        _commit();

        _pushHistory(r, 'rehabilitated',
            'Rehabilitated from ' + currentCondition + ' to ' + targetCondition +
            ' (Cost: ' + cost + ')');
        _pushTimeline(r, {
            year: y,
            type: 'rehabilitated',
            details: 'Rehabilitated from ' + currentCondition + ' to ' + targetCondition +
                ' (Cost: ' + cost + ')'
        });
        _commit();

        return _ok({
            residenceId: residenceId,
            oldCondition: currentCondition,
            newCondition: targetCondition,
            cost: cost,
            year: y
        });
    }

    function demolishResidence(residenceId, reason, year, options) {
        options = options || {};
        var r = _getResidenceRecord(residenceId);
        if (!r) return _fail('NOT_FOUND', 'Residence not found');
        if (r.isDemolished) return _fail('ALREADY_DEMOLISHED', 'Residence already demolished');

        var y = _resolveYear(year);
        if (y === null) return _fail('INVALID_YEAR', 'Invalid year');

        var occupied = _countOccupiedUnits(r);
        if (occupied > 0 && options.force !== true) {
            return _fail('OCCUPIED_UNITS',
                'Cannot demolish residence with ' + occupied + ' occupied unit(s)');
        }

        // Vacate all occupied units, disassociating every affected household
        var affectedHouseholds = [];
        for (var i = 0; i < r.units.length; i++) {
            var unit = r.units[i];
            if (!unit.isDemolished && !unit.isVacant && unit.householdId) {
                affectedHouseholds.push({
                    householdId: unit.householdId,
                    householdName: unit.householdName,
                    unitNumber: unit.unitNumber
                });
                _disassociateHouseholdFromUnit(r, unit, y,
                    'Residence demolished: ' + (reason || 'Demolished'));
            }
        }

        // Mark all units demolished
        for (var j = 0; j < r.units.length; j++) {
            r.units[j].isDemolished = true;
            r.units[j].isVacant = true;
        }

        r.isDemolished = true;
        r.demolishedYear = y;
        r.demolishedReason = reason || 'Demolished';
        r.destroyedBy = options.destroyedBy || 'manual';
        r.disasterId = options.disasterId || null;
        r.status = RESIDENCE_STATUS.DEMOLISHED;
        r.lastUpdated = y;

        if (!Array.isArray(r.damageHistory)) r.damageHistory = [];
        r.damageHistory.push({
            year: y,
            type: 'demolished',
            reason: r.demolishedReason,
            destroyedBy: r.destroyedBy,
            disasterId: r.disasterId,
            affectedHouseholds: affectedHouseholds.slice(),
            timestamp: Date.now()
        });

        _commit();

        _pushHistory(r, 'demolished', r.demolishedReason);
        _pushTimeline(r, {
            year: y,
            type: 'demolished',
            details: 'Residence demolished: ' + r.demolishedReason
        });
        _commit();

        _logEvent('residence', 'Residence Demolished',
            r.name + ' demolished: ' + r.demolishedReason, []);

        return _ok({
            residenceId: residenceId,
            year: y,
            reason: r.demolishedReason,
            affectedHouseholds: affectedHouseholds
        });
    }

    // =========================================================================
    // 17. QUERIES
    // =========================================================================

    function getResidence(residenceId) {
        return _snapshotResidence(_getResidenceRecord(residenceId));
    }

    function getAllResidences(options) {
        options = options || {};
        var records = _getAllResidenceRecords({
            includeDemolished: options.includeDemolished === true
        });
        var result = [];
        for (var i = 0; i < records.length; i++) {
            result.push(_snapshotResidence(records[i]));
        }
        return result;
    }

    function getResidencesByLocation(locationId, options) {
        options = options || {};
        var records = _getAllResidenceRecords({
            includeDemolished: options.includeDemolished === true
        });
        var result = [];
        for (var i = 0; i < records.length; i++) {
            if (records[i].locationId === locationId) {
                result.push(_snapshotResidence(records[i]));
            }
        }
        return result;
    }

    function getResidencesByOwner(ownerId, ownerType, options) {
        options = options || {};
        var records = _getAllResidenceRecords({
            includeDemolished: options.includeDemolished === true
        });
        var result = [];
        for (var i = 0; i < records.length; i++) {
            if (records[i].ownerId === ownerId && records[i].ownerType === ownerType) {
                result.push(_snapshotResidence(records[i]));
            }
        }
        return result;
    }

    function getResidencesByRenter(renterId, renterType, options) {
        options = options || {};
        var records = _getAllResidenceRecords({
            includeDemolished: options.includeDemolished === true
        });
        var result = [];
        for (var i = 0; i < records.length; i++) {
            if (records[i].renterId === renterId && records[i].renterType === renterType) {
                result.push(_snapshotResidence(records[i]));
            }
        }
        return result;
    }

    function getResidencesByHousehold(householdId) {
        var records = _getAllResidenceRecords();
        var result = [];
        for (var i = 0; i < records.length; i++) {
            var r = records[i];
            if (!Array.isArray(r.units)) continue;
            for (var j = 0; j < r.units.length; j++) {
                if (r.units[j].householdId === householdId && !r.units[j].isDemolished) {
                    result.push(_snapshotResidence(r));
                    break;
                }
            }
        }
        return result;
    }

    function getUnits(residenceId) {
        var r = _getResidenceRecord(residenceId);
        if (!r) return [];
        var result = [];
        for (var i = 0; i < r.units.length; i++) {
            result.push(_snapshotUnit(r.units[i]));
        }
        return result;
    }

    function getUnit(residenceId, unitNumber) {
        var r = _getResidenceRecord(residenceId);
        if (!r) return null;
        for (var i = 0; i < r.units.length; i++) {
            if (r.units[i].unitNumber === unitNumber) {
                return _snapshotUnit(r.units[i]);
            }
        }
        return null;
    }

    function getVacantUnits(residenceId) {
        var r = _getResidenceRecord(residenceId);
        if (!r) return [];
        var result = [];
        for (var i = 0; i < r.units.length; i++) {
            var u = r.units[i];
            if (u.isVacant && !u.isDemolished) result.push(_snapshotUnit(u));
        }
        return result;
    }

    function getOccupiedUnits(residenceId) {
        var r = _getResidenceRecord(residenceId);
        if (!r) return [];
        var result = [];
        for (var i = 0; i < r.units.length; i++) {
            var u = r.units[i];
            if (!u.isVacant && !u.isDemolished) result.push(_snapshotUnit(u));
        }
        return result;
    }

    function getVacantResidences(locationId) {
        var records = locationId
            ? _getAllResidenceRecords().filter(function(r) {
                return r.locationId === locationId;
            })
            : _getAllResidenceRecords();
        var result = [];
        for (var i = 0; i < records.length; i++) {
            if (_isResidenceVacant(records[i])) {
                result.push(_snapshotResidence(records[i]));
            }
        }
        return result;
    }

    function getUnitStats(residenceId) {
        var r = _getResidenceRecord(residenceId);
        if (!r) return { total: 0, occupied: 0, vacant: 0, demolished: 0, occupancyRate: 0 };

        var total = r.units.length;
        var demolished = _countDemolishedUnits(r);
        var occupied = _countOccupiedUnits(r);
        var vacant = _countVacantUnits(r);
        var usable = total - demolished;

        return {
            total: total,
            usable: usable,
            occupied: occupied,
            vacant: vacant,
            demolished: demolished,
            occupancyRate: usable > 0 ? Math.round((occupied / usable) * 100) : 0
        };
    }

    function getResidenceHistory(residenceId, limit) {
        var r = _getResidenceRecord(residenceId);
        if (!r || !Array.isArray(r.history)) return [];
        var h = r.history.slice();
        h.sort(function(a, b) { return (b.year || 0) - (a.year || 0); });
        return typeof limit === 'number' ? h.slice(0, limit) : h;
    }

    function getResidenceTimeline(residenceId, limit) {
        var r = _getResidenceRecord(residenceId);
        if (!r || !Array.isArray(r.timeline)) return [];
        var t = JSON.parse(JSON.stringify(r.timeline));
        t.sort(function(a, b) { return (a.year || 0) - (b.year || 0); });
        return typeof limit === 'number' ? t.slice(-limit) : t;
    }

    function getResidenceNameHistory(residenceId) {
        var r = _getResidenceRecord(residenceId);
        if (!r || !Array.isArray(r.nameHistory)) return [];
        return JSON.parse(JSON.stringify(r.nameHistory));
    }

    function getResidenceAssociationHistory(residenceId) {
        var r = _getResidenceRecord(residenceId);
        if (!r || !Array.isArray(r.associationHistory)) return [];
        return JSON.parse(JSON.stringify(r.associationHistory));
    }

    function getResidenceRentalHistory(residenceId, limit) {
        var r = _getResidenceRecord(residenceId);
        if (!r || !Array.isArray(r.rentalHistory)) return [];
        var h = JSON.parse(JSON.stringify(r.rentalHistory));
        h.sort(function(a, b) { return (b.year || 0) - (a.year || 0); });
        return typeof limit === 'number' ? h.slice(0, limit) : h;
    }

    function getRentPayments(residenceId, limit) {
        var r = _getResidenceRecord(residenceId);
        if (!r || !Array.isArray(r.rentPayments)) return [];
        var p = JSON.parse(JSON.stringify(r.rentPayments));
        p.sort(function(a, b) { return (b.year || 0) - (a.year || 0); });
        return typeof limit === 'number' ? p.slice(0, limit) : p;
    }

    function getTotalRentIncome(ownerId, ownerType) {
        var residences = getResidencesByOwner(ownerId, ownerType);
        var total = 0;
        for (var i = 0; i < residences.length; i++) {
            if (residences[i].renterId && typeof residences[i].rentAmount === 'number') {
                total += residences[i].rentAmount;
            }
        }
        return total;
    }

    function getTotalRentExpenses(renterId, renterType) {
        var residences = getResidencesByRenter(renterId, renterType);
        var total = 0;
        for (var i = 0; i < residences.length; i++) {
            if (typeof residences[i].rentAmount === 'number') {
                total += residences[i].rentAmount;
            }
        }
        return total;
    }

    function getStaffPositions(residenceId, options) {
        options = options || {};
        var r = _getResidenceRecord(residenceId);
        if (!r || !Array.isArray(r.staffPositions)) return [];
        var positions = r.staffPositions.slice();
        if (options.unitNumber !== undefined) {
            positions = positions.filter(function(p) {
                return p.unitNumber === options.unitNumber;
            });
        }
        return JSON.parse(JSON.stringify(positions));
    }

    function getStaffAssignments(residenceId, options) {
        options = options || {};
        var r = _getResidenceRecord(residenceId);
        if (!r || !Array.isArray(r.staffAssignments)) return [];
        var list = r.staffAssignments.slice();
        if (options.activeOnly !== false) {
            list = list.filter(function(a) { return !a.endYear; });
        }
        if (options.positionId) {
            list = list.filter(function(a) { return a.positionId === options.positionId; });
        }
        if (options.unitNumber !== undefined) {
            list = list.filter(function(a) { return a.unitNumber === options.unitNumber; });
        }
        return JSON.parse(JSON.stringify(list));
    }

    function getResidenceRecommendations(residenceId) {
        var r = _getResidenceRecord(residenceId);
        if (!r) return [];
        var recs = [];
        var year = _getCurrentYear();

        if (r.isDemolished) {
            return [{ priority: 'low', code: 'DEMOLISHED',
                message: 'Residence has been demolished.', estimatedCost: 0 }];
        }

        var vacantDuration = r.vacantYear ? year - r.vacantYear : 0;
        if (_isResidenceVacant(r)) {
            recs.push({
                priority: 'high',
                code: 'VACANT',
                message: 'Residence has been vacant for ' + vacantDuration + ' years.',
                estimatedCost: 0
            });
        }

        var cond = r.condition || 'good';
        if (cond === 'poor' || cond === 'ruined') {
            recs.push({
                priority: 'high',
                code: 'POOR_CONDITION',
                message: 'Residence is in ' + cond + ' condition.',
                estimatedCost: calculateRepairCost(residenceId, 'good')
            });
        } else if (cond === 'fair') {
            recs.push({
                priority: 'medium',
                code: 'FAIR_CONDITION',
                message: 'Residence is in fair condition.',
                estimatedCost: calculateRepairCost(residenceId, 'good')
            });
        }

        var stats = getUnitStats(residenceId);
        if (r.isMultiUnit && stats.usable > 0) {
            var occupancy = stats.occupancyRate;
            if (occupancy < 50) {
                recs.push({
                    priority: occupancy < 25 ? 'high' : 'medium',
                    code: 'LOW_OCCUPANCY',
                    message: stats.vacant + ' vacant units (' + occupancy + '% occupied).',
                    estimatedCost: 0
                });
            }
        }

        var order = { high: 0, medium: 1, low: 2 };
        recs.sort(function(a, b) {
            return (order[a.priority] || 3) - (order[b.priority] || 3);
        });
        return recs;
    }

    function getResidenceStatistics(locationId) {
        var records = locationId
            ? _getAllResidenceRecords({ includeDemolished: true }).filter(function(r) {
                return r.locationId === locationId;
            })
            : _getAllResidenceRecords({ includeDemolished: true });

        var stats = {
            total: records.length,
            byType: {},
            byStatus: {},
            byCondition: {},
            totalUnits: 0,
            occupiedUnits: 0,
            vacantUnits: 0,
            demolishedUnits: 0,
            totalValue: 0
        };

        for (var i = 0; i < records.length; i++) {
            var r = records[i];
            stats.byType[r.typeId] = (stats.byType[r.typeId] || 0) + 1;
            stats.byStatus[r.status] = (stats.byStatus[r.status] || 0) + 1;
            var c = r.condition || 'unknown';
            stats.byCondition[c] = (stats.byCondition[c] || 0) + 1;
            stats.totalUnits += r.units.length;
            stats.occupiedUnits += _countOccupiedUnits(r);
            stats.vacantUnits += _countVacantUnits(r);
            stats.demolishedUnits += _countDemolishedUnits(r);
            stats.totalValue += r.estimatedValue || 0;
        }

        return stats;
    }

    function getResidenceTypes() {
        var result = {};
        for (var k in RESIDENCE_TYPES) {
            if (Object.prototype.hasOwnProperty.call(RESIDENCE_TYPES, k)) {
                result[k] = {
                    id: RESIDENCE_TYPES[k].id,
                    name: RESIDENCE_TYPES[k].name,
                    capacity: RESIDENCE_TYPES[k].capacity,
                    isMultiUnit: RESIDENCE_TYPES[k].isMultiUnit
                };
            }
        }
        return result;
    }

    function getResidenceConditions() {
        return RESIDENCE_CONDITIONS.slice();
    }

    // =========================================================================
    // 18. INTEGRATION
    // =========================================================================

    function getHouseholdUnits(householdId) {
        var hq = _householdQueries();
        if (hq) {
            var h = hq.getHousehold(householdId);
            // Reverse index reads are authoritative enough here
            // (updated by _associateHouseholdReverseIndex)
        }
        var records = _getAllResidenceRecords();
        var result = [];
        for (var i = 0; i < records.length; i++) {
            var r = records[i];
            if (!Array.isArray(r.units)) continue;
            for (var j = 0; j < r.units.length; j++) {
                var u = r.units[j];
                if (u.householdId === householdId && !u.isDemolished) {
                    result.push({
                        residenceId: r.id,
                        residenceName: r.name,
                        residenceTypeId: r.typeId,
                        unitId: u.id,
                        unitNumber: u.unitNumber,
                        assignedYear: u.assignedYear
                    });
                }
            }
        }
        return result;
    }

    // =========================================================================
    // 19. EXPORTS
    // =========================================================================

    var api = {
        // Constants
        RESIDENCE_TYPES: RESIDENCE_TYPES,
        RESIDENCE_STATUS: RESIDENCE_STATUS,
        RENTAL_STATUS: RENTAL_STATUS,
        getResidenceTypes: getResidenceTypes,
        getResidenceConditions: getResidenceConditions,

        // CRUD
        createResidence: createResidence,
        updateResidence: updateResidence,
        deleteResidence: deleteResidence,

        // Units
        addUnit: addUnit,
        removeUnit: removeUnit,
        assignHouseholdToUnit: assignHouseholdToUnit,
        markUnitVacant: markUnitVacant,
        demolishUnit: demolishUnit,

        // Residence-level vacancy
        markResidenceVacant: markResidenceVacant,
        assignHouseholdToVacantResidence: assignHouseholdToVacantResidence,

        // Name
        updateResidenceName: updateResidenceName,

        // Rental
        setResidenceOwner: setResidenceOwner,
        getResidenceOwner: getResidenceOwner,
        setResidenceRenter: setResidenceRenter,
        getResidenceRenter: getResidenceRenter,
        endResidenceRental: endResidenceRental,
        updateResidenceRent: updateResidenceRent,
        recordRentPayment: recordRentPayment,

        // Staff
        addStaffPosition: addStaffPosition,
        updateStaffPosition: updateStaffPosition,
        removeStaffPosition: removeStaffPosition,
        assignCharacterToStaffPosition: assignCharacterToStaffPosition,
        endStaffAssignment: endStaffAssignment,
        deleteStaffAssignment: deleteStaffAssignment,

        // Rehabilitation & demolition
        calculateRepairCost: calculateRepairCost,
        rehabilitateResidence: rehabilitateResidence,
        demolishResidence: demolishResidence,

        // Queries
        getResidence: getResidence,
        getAllResidences: getAllResidences,
        getResidencesByLocation: getResidencesByLocation,
        getResidencesByOwner: getResidencesByOwner,
        getResidencesByRenter: getResidencesByRenter,
        getResidencesByHousehold: getResidencesByHousehold,
        getUnits: getUnits,
        getUnit: getUnit,
        getVacantUnits: getVacantUnits,
        getOccupiedUnits: getOccupiedUnits,
        getVacantResidences: getVacantResidences,
        getUnitStats: getUnitStats,
        getResidenceHistory: getResidenceHistory,
        getResidenceTimeline: getResidenceTimeline,
        getResidenceNameHistory: getResidenceNameHistory,
        getResidenceAssociationHistory: getResidenceAssociationHistory,
        getResidenceRentalHistory: getResidenceRentalHistory,
        getRentPayments: getRentPayments,
        getTotalRentIncome: getTotalRentIncome,
        getTotalRentExpenses: getTotalRentExpenses,
        getStaffPositions: getStaffPositions,
        getStaffAssignments: getStaffAssignments,
        getResidenceRecommendations: getResidenceRecommendations,
        getResidenceStatistics: getResidenceStatistics,

        // Integration
        getHouseholdUnits: getHouseholdUnits
    };

    window.ResidenceSystem = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

})();
