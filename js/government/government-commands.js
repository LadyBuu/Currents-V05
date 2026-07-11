/**
 * =============================================================================
 * GOVERNMENT COMMANDS - All write operations for government system
 * =============================================================================
 * 
 * This file contains ALL write operations for government management:
 * - Department CRUD (create, update, delete)
 * - Position CRUD (add, update, remove)
 * - Assignment CRUD (assign, update, remove)
 * - Government type CRUD
 * - Bulk operations
 * - Leader management (assign, end term)
 * 
 * All operations include validation, event logging, and change notifications.
 * 
 * DEPENDENCIES:
 *   - government-state.js (GovernmentState)
 *   - accessors.js (getCharacterById, getPlaceById, getCurrentYear)
 *   - eventLogger.js (logEvent)
 *   - storage.js (saveMasterData)
 *   - location-state.js (LocationState - for place data)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARD
    // =========================================================================

    var _processingCommand = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getCharacterById(id) {
        return typeof window.getCharacterById === 'function' ? window.getCharacterById(id) : null;
    }

    function _getCharacters() {
        return typeof window.getCharacters === 'function' ? window.getCharacters() : [];
    }

    function _getPlaceById(id) {
        return typeof window.getPlaceById === 'function' ? window.getPlaceById(id) : null;
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') return window.getCurrentYearSafe();
        if (typeof window.getCurrentYear === 'function') return window.getCurrentYear();
        return 1250;
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') window.saveMasterData();
    }

    function _logEvent(category, type, message, subjects) {
        if (typeof window.logEvent === 'function') {
            window.logEvent(category, type, message, subjects);
        }
    }

    function _showToast(message, type) {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(message, type);
        }
    }

    function _generateId(prefix) {
        if (typeof window.generateId === 'function') return window.generateId(prefix);
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }

    // =========================================================================
    // 3. VALIDATION HELPERS
    // =========================================================================

    function _validateDepartment(data, isUpdate) {
        isUpdate = isUpdate || false;

        if (!isUpdate) {
            if (!data.name || data.name.trim() === '') {
                return { valid: false, reason: 'Department name is required' };
            }
            if (!data.locationId) {
                return { valid: false, reason: 'Location is required' };
            }
        }

        if (data.name) {
            var trimmed = data.name.trim();
            if (trimmed.length < 2) {
                return { valid: false, reason: 'Department name must be at least 2 characters' };
            }
        }

        if (data.locationId) {
            var place = _getPlaceById(data.locationId);
            if (!place) {
                return { valid: false, reason: 'Location not found' };
            }
        }

        if (data.parentDepartmentId) {
            var parent = GovernmentState.getDepartment(data.parentDepartmentId);
            if (!parent) {
                return { valid: false, reason: 'Parent department not found' };
            }
            if (!isUpdate && data.parentDepartmentId === data.id) {
                return { valid: false, reason: 'Department cannot be its own parent' };
            }
        }

        return { valid: true };
    }

    function _validatePosition(data, isUpdate) {
        isUpdate = isUpdate || false;

        if (!isUpdate) {
            if (!data.name || data.name.trim() === '') {
                return { valid: false, reason: 'Position name is required' };
            }
        }

        if (data.name) {
            var trimmed = data.name.trim();
            if (trimmed.length < 2) {
                return { valid: false, reason: 'Position name must be at least 2 characters' };
            }
        }

        if (data.priority !== undefined) {
            if (typeof data.priority !== 'number' || data.priority < 1 || data.priority > 100) {
                return { valid: false, reason: 'Priority must be between 1 and 100' };
            }
        }

        return { valid: true };
    }

    function _validateAssignment(data) {
        if (!data.departmentId) {
            return { valid: false, reason: 'Department is required' };
        }
        if (!data.positionId) {
            return { valid: false, reason: 'Position is required' };
        }
        if (!data.characterId) {
            return { valid: false, reason: 'Character is required' };
        }

        var dept = GovernmentState.getDepartment(data.departmentId);
        if (!dept) {
            return { valid: false, reason: 'Department not found' };
        }

        var position = GovernmentState.getPositionById(data.departmentId, data.positionId);
        if (!position) {
            return { valid: false, reason: 'Position not found' };
        }

        var character = _getCharacterById(data.characterId);
        if (!character) {
            return { valid: false, reason: 'Character not found' };
        }
        if (character.isDeceased) {
            return { valid: false, reason: 'Character is deceased' };
        }

        var existing = GovernmentState.getAssignmentsForPosition(data.departmentId, data.positionId, true);
        for (var i = 0; i < existing.length; i++) {
            if (existing[i].characterId === data.characterId) {
                return { valid: false, reason: 'Character already assigned to this position' };
            }
        }

        if (data.startYear && data.endYear) {
            if (data.endYear <= data.startYear) {
                return { valid: false, reason: 'End year must be after start year' };
            }
        }

        return { valid: true };
    }

    function _validateGovernmentType(data, isUpdate) {
        isUpdate = isUpdate || false;

        if (!isUpdate) {
            if (!data.name || data.name.trim() === '') {
                return { valid: false, reason: 'Government type name is required' };
            }
        }

        if (data.name) {
            var trimmed = data.name.trim();
            if (trimmed.length < 2) {
                return { valid: false, reason: 'Government type name must be at least 2 characters' };
            }
        }

        return { valid: true };
    }

    function _validateLeaderAssignment(placeId, characterId, startYear) {
        var place = _getPlaceById(placeId);
        if (!place) {
            return { valid: false, reason: 'Place not found' };
        }

        var character = _getCharacterById(characterId);
        if (!character) {
            return { valid: false, reason: 'Character not found' };
        }

        if (character.isDeceased) {
            return { valid: false, reason: 'Character is deceased' };
        }

        if (!startYear || typeof startYear !== 'number') {
            return { valid: false, reason: 'Valid start year is required' };
        }

        var currentYear = _getCurrentYear();
        if (startYear > currentYear + 10) {
            return { valid: false, reason: 'Start year cannot be more than 10 years in the future' };
        }

        if (character.birthYear && startYear < character.birthYear) {
            return { valid: false, reason: 'Start year cannot be before character birth' };
        }

        return { valid: true };
    }

    // =========================================================================
    // 4. DEPARTMENT COMMANDS
    // =========================================================================

    function createDepartment(data) {
        if (_processingCommand) {
            return null;
        }
        _processingCommand = true;

        try {
            var validation = _validateDepartment(data, false);
            if (!validation.valid) {
                _showToast(validation.reason, 'error');
                return null;
            }

            var dept = {
                id: _generateId('govdept'),
                name: data.name.trim(),
                description: data.description || '',
                locationId: data.locationId,
                parentDepartmentId: data.parentDepartmentId || null,
                positions: [],
                assignments: [],
                isDeprecated: false,
                createdAt: _getCurrentYear(),
                updatedAt: _getCurrentYear()
            };

            GovernmentState._addDepartment(dept);

            _logEvent('government', 'department_created',
                'Department "' + dept.name + '" created at ' + (_getPlaceById(dept.locationId)?.displayName || 'Unknown'),
                []);

            _showToast('Department "' + dept.name + '" created', 'success');
            return dept;

        } finally {
            _processingCommand = false;
        }
    }

    function updateDepartment(departmentId, updates) {
        if (_processingCommand) {
            return null;
        }
        _processingCommand = true;

        try {
            var dept = GovernmentState.getDepartment(departmentId);
            if (!dept) {
                _showToast('Department not found', 'error');
                return null;
            }

            var validation = _validateDepartment(updates, true);
            if (!validation.valid) {
                _showToast(validation.reason, 'error');
                return null;
            }

            var result = GovernmentState._updateDepartment(departmentId, updates);

            _logEvent('government', 'department_updated',
                'Department "' + dept.name + '" updated',
                []);

            _showToast('Department updated', 'success');
            return result;

        } finally {
            _processingCommand = false;
        }
    }

    function deleteDepartment(departmentId, options) {
        if (_processingCommand) {
            return false;
        }
        _processingCommand = true;

        try {
            var dept = GovernmentState.getDepartment(departmentId);
            if (!dept) {
                _showToast('Department not found', 'error');
                return false;
            }

            options = options || {};
            var cascade = options.cascade || false;

            var children = GovernmentState.getDepartmentsByParent(departmentId);
            if (children.length > 0 && !cascade) {
                _showToast('Department has ' + children.length + ' child departments. Use cascade to delete them.', 'warning');
                return false;
            }

            var assignments = GovernmentState.getAssignmentsForDepartment(departmentId, true);
            if (assignments.length > 0 && !cascade) {
                _showToast('Department has ' + assignments.length + ' active assignments. Use cascade to remove them.', 'warning');
                return false;
            }

            if (cascade) {
                for (var i = 0; i < children.length; i++) {
                    deleteDepartment(children[i].id, { cascade: true });
                }
            }

            var result = GovernmentState._deleteDepartment(departmentId);

            _logEvent('government', 'department_deleted',
                'Department "' + dept.name + '" deleted' + (cascade ? ' (cascade)' : ''),
                []);

            _showToast('Department deleted', 'info');
            return result;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 5. POSITION COMMANDS
    // =========================================================================

    function addPosition(departmentId, data) {
        if (_processingCommand) {
            return null;
        }
        _processingCommand = true;

        try {
            var dept = GovernmentState.getDepartment(departmentId);
            if (!dept) {
                _showToast('Department not found', 'error');
                return null;
            }

            var validation = _validatePosition(data, false);
            if (!validation.valid) {
                _showToast(validation.reason, 'error');
                return null;
            }

            var position = {
                id: _generateId('govpos'),
                name: data.name.trim(),
                description: data.description || '',
                priority: data.priority || 10,
                parentPositionId: data.parentPositionId || null
            };

            var result = GovernmentState._addPosition(departmentId, position);

            _logEvent('government', 'position_added',
                'Position "' + position.name + '" added to department "' + dept.name + '"',
                []);

            _showToast('Position "' + position.name + '" added', 'success');
            return position;

        } finally {
            _processingCommand = false;
        }
    }

    function updatePosition(departmentId, positionId, updates) {
        if (_processingCommand) {
            return false;
        }
        _processingCommand = true;

        try {
            var dept = GovernmentState.getDepartment(departmentId);
            if (!dept) {
                _showToast('Department not found', 'error');
                return false;
            }

            var position = GovernmentState.getPositionById(departmentId, positionId);
            if (!position) {
                _showToast('Position not found', 'error');
                return false;
            }

            var validation = _validatePosition(updates, true);
            if (!validation.valid) {
                _showToast(validation.reason, 'error');
                return false;
            }

            var result = GovernmentState._updatePosition(departmentId, positionId, updates);

            _logEvent('government', 'position_updated',
                'Position "' + position.name + '" updated in department "' + dept.name + '"',
                []);

            _showToast('Position updated', 'success');
            return result;

        } finally {
            _processingCommand = false;
        }
    }

    function deletePosition(departmentId, positionId) {
        if (_processingCommand) {
            return false;
        }
        _processingCommand = true;

        try {
            var dept = GovernmentState.getDepartment(departmentId);
            if (!dept) {
                _showToast('Department not found', 'error');
                return false;
            }

            var position = GovernmentState.getPositionById(departmentId, positionId);
            if (!position) {
                _showToast('Position not found', 'error');
                return false;
            }

            var assignments = GovernmentState.getAssignmentsForPosition(departmentId, positionId, true);
            if (assignments.length > 0) {
                _showToast('Position has ' + assignments.length + ' active assignments. Remove them first.', 'warning');
                return false;
            }

            var result = GovernmentState._deletePosition(departmentId, positionId);

            _logEvent('government', 'position_deleted',
                'Position "' + position.name + '" deleted from department "' + dept.name + '"',
                []);

            _showToast('Position deleted', 'info');
            return result;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 6. ASSIGNMENT COMMANDS
    // =========================================================================

    function assignCharacterToPosition(departmentId, positionId, characterId, options) {
        if (_processingCommand) {
            return null;
        }
        _processingCommand = true;

        try {
            options = options || {};

            var dept = GovernmentState.getDepartment(departmentId);
            if (!dept) {
                _showToast('Department not found', 'error');
                return null;
            }

            var position = GovernmentState.getPositionById(departmentId, positionId);
            if (!position) {
                _showToast('Position not found', 'error');
                return null;
            }

            var character = _getCharacterById(characterId);
            if (!character) {
                _showToast('Character not found', 'error');
                return null;
            }

            var validation = _validateAssignment({
                departmentId: departmentId,
                positionId: positionId,
                characterId: characterId,
                startYear: options.startYear,
                endYear: options.endYear
            });

            if (!validation.valid) {
                _showToast(validation.reason, 'error');
                return null;
            }

            var startYear = options.startYear || _getCurrentYear();

            var assignment = {
                id: _generateId('govassign'),
                positionId: positionId,
                characterId: characterId,
                characterName: character.name + (character.surname ? ' ' + character.surname : ''),
                startYear: startYear,
                endYear: options.endYear || null,
                endReason: null,
                title: options.title || position.name,
                notes: options.notes || ''
            };

            var result = GovernmentState._addAssignment(departmentId, assignment);

            _logEvent('government', 'character_assigned',
                character.name + ' assigned to "' + position.name + '" in department "' + dept.name + '"',
                [character]);

            var endMsg = options.endYear ? ' until ' + options.endYear : '';
            _showToast(character.name + ' assigned to ' + position.name + endMsg, 'success');
            return assignment;

        } finally {
            _processingCommand = false;
        }
    }

    function endAssignment(departmentId, assignmentId, endYear, reason) {
        if (_processingCommand) {
            return false;
        }
        _processingCommand = true;

        try {
            var dept = GovernmentState.getDepartment(departmentId);
            if (!dept) {
                _showToast('Department not found', 'error');
                return false;
            }

            var assignment = GovernmentState.getAssignmentById(departmentId, assignmentId);
            if (!assignment) {
                _showToast('Assignment not found', 'error');
                return false;
            }

            if (assignment.endYear) {
                _showToast('Assignment already ended', 'info');
                return false;
            }

            var endYearValue = endYear || _getCurrentYear();
            if (endYearValue <= assignment.startYear) {
                _showToast('End year must be after start year (' + assignment.startYear + ')', 'error');
                return false;
            }

            var result = GovernmentState._updateAssignment(departmentId, assignmentId, {
                endYear: endYearValue,
                endReason: reason || 'Term ended'
            });

            var character = _getCharacterById(assignment.characterId);

            _logEvent('government', 'assignment_ended',
                (character ? character.name : 'Character') + ' ended assignment at "' + dept.name + '"' +
                (reason ? ' (' + reason + ')' : ''),
                character ? [character] : []);

            _showToast('Assignment ended in ' + endYearValue, 'info');
            return result;

        } finally {
            _processingCommand = false;
        }
    }

    function removeAssignment(departmentId, assignmentId) {
        if (_processingCommand) {
            return false;
        }
        _processingCommand = true;

        try {
            var dept = GovernmentState.getDepartment(departmentId);
            if (!dept) {
                _showToast('Department not found', 'error');
                return false;
            }

            var assignment = GovernmentState.getAssignmentById(departmentId, assignmentId);
            if (!assignment) {
                _showToast('Assignment not found', 'error');
                return false;
            }

            var result = GovernmentState._deleteAssignment(departmentId, assignmentId);

            var character = _getCharacterById(assignment.characterId);

            _logEvent('government', 'assignment_removed',
                (character ? character.name : 'Character') + ' removed from assignment at "' + dept.name + '"',
                character ? [character] : []);

            _showToast('Assignment removed', 'info');
            return result;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 7. GOVERNMENT TYPE COMMANDS
    // =========================================================================

    function createGovernmentType(data) {
        if (_processingCommand) {
            return null;
        }
        _processingCommand = true;

        try {
            var validation = _validateGovernmentType(data, false);
            if (!validation.valid) {
                _showToast(validation.reason, 'error');
                return null;
            }

            var type = {
                id: _generateId('govtype'),
                name: data.name.trim(),
                description: data.description || '',
                allowedRankIds: data.allowedRankIds || []
            };

            GovernmentState._addGovernmentType(type);

            _logEvent('government', 'type_created',
                'Government type "' + type.name + '" created',
                []);

            _showToast('Government type "' + type.name + '" created', 'success');
            return type;

        } finally {
            _processingCommand = false;
        }
    }

    function updateGovernmentType(typeId, updates) {
        if (_processingCommand) {
            return null;
        }
        _processingCommand = true;

        try {
            var type = GovernmentState.getGovernmentTypeById(typeId);
            if (!type) {
                _showToast('Government type not found', 'error');
                return null;
            }

            var validation = _validateGovernmentType(updates, true);
            if (!validation.valid) {
                _showToast(validation.reason, 'error');
                return null;
            }

            var result = GovernmentState._updateGovernmentType(typeId, updates);

            _logEvent('government', 'type_updated',
                'Government type "' + type.name + '" updated',
                []);

            _showToast('Government type updated', 'success');
            return result;

        } finally {
            _processingCommand = false;
        }
    }

    function deleteGovernmentType(typeId) {
        if (_processingCommand) {
            return false;
        }
        _processingCommand = true;

        try {
            var type = GovernmentState.getGovernmentTypeById(typeId);
            if (!type) {
                _showToast('Government type not found', 'error');
                return false;
            }

            var places = typeof window.getPlaces === 'function' ? window.getPlaces() : [];
            var usedBy = places.filter(function(p) { return p.governmentTypeId === typeId; });
            if (usedBy.length > 0) {
                _showToast('Cannot delete: Used by ' + usedBy.length + ' location(s)', 'warning');
                return false;
            }

            var result = GovernmentState._deleteGovernmentType(typeId);

            _logEvent('government', 'type_deleted',
                'Government type "' + type.name + '" deleted',
                []);

            _showToast('Government type deleted', 'info');
            return result;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 8. BULK OPERATIONS
    // =========================================================================

    function bulkAssignCharacters(departmentId, positionId, assignments) {
        if (_processingCommand) {
            return null;
        }
        _processingCommand = true;

        try {
            var results = {
                success: [],
                failed: [],
                total: assignments.length
            };

            for (var i = 0; i < assignments.length; i++) {
                var data = assignments[i];
                var result = assignCharacterToPosition(
                    departmentId,
                    positionId,
                    data.characterId,
                    {
                        startYear: data.startYear,
                        endYear: data.endYear,
                        title: data.title,
                        notes: data.notes
                    }
                );

                if (result) {
                    results.success.push(result);
                } else {
                    results.failed.push(data);
                }
            }

            _showToast('Assigned ' + results.success.length + ' of ' + results.total + ' characters', 'success');
            return results;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 9. LEADER COMMANDS (UPDATED with Settlement Integration)
    // =========================================================================

    function assignLeader(placeId, characterId, startYear, title) {
        if (_processingCommand) {
            return null;
        }
        _processingCommand = true;

        try {
            var validation = _validateLeaderAssignment(placeId, characterId, startYear);
            if (!validation.valid) {
                _showToast(validation.reason, 'error');
                return null;
            }

            var place = _getPlaceById(placeId);
            var character = _getCharacterById(characterId);

            if (!place.leaderAssignments) place.leaderAssignments = [];

            for (var i = 0; i < place.leaderAssignments.length; i++) {
                if (place.leaderAssignments[i].isActive && !place.leaderAssignments[i].endYear) {
                    place.leaderAssignments[i].isActive = false;
                    place.leaderAssignments[i].endYear = startYear - 1;
                }
            }

            var assignment = {
                id: _generateId('leader'),
                characterId: characterId,
                characterName: character.name + (character.surname ? ' ' + character.surname : ''),
                startYear: startYear || _getCurrentYear(),
                endYear: null,
                title: title || 'Leader',
                isActive: true,
                notes: '',
                timestamp: Date.now()
            };

            place.leaderAssignments.push(assignment);
            place.leaderId = characterId;
            place.updatedAt = Date.now();

            _saveMasterData();
            if (typeof LocationState !== 'undefined' && LocationState.invalidateCache) {
                LocationState.invalidateCache();
            }

            // =====================================================================
            // INTEGRATION: Leader assigned → Update settlement prosperity
            // =====================================================================
            if (typeof SettlementEconomy !== 'undefined' && typeof SettlementState !== 'undefined') {
                try {
                    // Recalculate prosperity with new leader
                    var newProsperity = SettlementEconomy.calculateProsperity(placeId);
                    SettlementState._updateSettlementData(placeId, { 
                        prosperity: newProsperity,
                        lastUpgraded: _getCurrentYear()
                    });

                    _logEvent('government', 'leader_prosperity_updated',
                        'Prosperity updated to ' + newProsperity + '% for ' + place.displayName + ' after leader assignment',
                        [character]);
                } catch(e) {
                    // Silent fail - prosperity will update on next cycle
                }
            }
            // =====================================================================

            _logEvent('leadership', 'assigned',
                character.name + ' assigned as leader of ' + place.displayName,
                [character]);

            _showToast(character.name + ' assigned as leader of ' + place.displayName, 'success');
            return assignment;

        } finally {
            _processingCommand = false;
        }
    }

    function endLeaderTerm(placeId, characterId, endYear) {
        if (_processingCommand) {
            return false;
        }
        _processingCommand = true;

        try {
            var place = _getPlaceById(placeId);
            if (!place) {
                _showToast('Place not found', 'error');
                return false;
            }

            if (!place.leaderAssignments) {
                _showToast('No leader assignments found', 'error');
                return false;
            }

            var found = false;
            var endYearValue = endYear || _getCurrentYear();

            for (var i = 0; i < place.leaderAssignments.length; i++) {
                var assignment = place.leaderAssignments[i];
                if (assignment.characterId === characterId && assignment.isActive && !assignment.endYear) {
                    assignment.isActive = false;
                    assignment.endYear = endYearValue;
                    assignment.endReason = 'Term ended';
                    found = true;
                    break;
                }
            }

            if (!found) {
                _showToast('Active leader assignment not found for character', 'error');
                return false;
            }

            place.updatedAt = Date.now();
            _saveMasterData();
            if (typeof LocationState !== 'undefined' && LocationState.invalidateCache) {
                LocationState.invalidateCache();
            }

            var character = _getCharacterById(characterId);

            // =====================================================================
            // INTEGRATION: Leader term ended → Update settlement prosperity
            // =====================================================================
            if (typeof SettlementEconomy !== 'undefined' && typeof SettlementState !== 'undefined') {
                try {
                    var newProsperity = SettlementEconomy.calculateProsperity(placeId);
                    SettlementState._updateSettlementData(placeId, { 
                        prosperity: newProsperity 
                    });
                } catch(e) {
                    // Silent fail
                }
            }
            // =====================================================================

            _logEvent('leadership', 'term_ended',
                (character ? character.name : 'Character') + ' ended leadership term at ' + place.displayName,
                character ? [character] : []);

            _showToast('Leader term ended', 'info');
            return true;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 10. JUSTICE COMMANDS (UPDATED with Crime Integration)
    // =========================================================================

    function updateJusticeSeverity(locationId, severity) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already processing' };
        }
        _processingCommand = true;

        try {
            var validSeverities = ['lenient', 'medium', 'harsh', 'extreme'];
            if (validSeverities.indexOf(severity) === -1) {
                _showToast('Invalid severity. Options: lenient, medium, harsh, extreme', 'error');
                return { success: false, reason: 'Invalid severity' };
            }

            var data = SettlementState.getSettlementData(locationId);
            if (!data) {
                return { success: false, reason: 'Settlement data not found' };
            }

            data.justiceSeverity = severity;

            SettlementState._updateSettlementData(locationId, { justiceSeverity: severity });

            // =====================================================================
            // INTEGRATION: Justice severity changed → Recalculate crime rate
            // =====================================================================
            if (typeof SettlementEconomy !== 'undefined') {
                try {
                    var newCrimeRate = SettlementEconomy.calculateCrimeRate(locationId);
                    SettlementState._updateSettlementData(locationId, { 
                        crimeRate: newCrimeRate 
                    });
                    
                    _logEvent('justice', 'crime_rate_updated',
                        'Crime rate updated to ' + Math.round(newCrimeRate * 100) + '% after justice severity change at ' + 
                        (_getPlaceById(locationId)?.displayName || 'Unknown'),
                        []);
                } catch(e) {
                    // Silent fail
                }
            }
            // =====================================================================

            _showToast('Justice severity updated to ' + severity, 'success');
            return { success: true, data: { justiceSeverity: severity } };

        } finally {
            _processingCommand = false;
        }
    }

    function updateWatch(locationId, hasWatch, size) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already processing' };
        }
        _processingCommand = true;

        try {
            if (hasWatch && (!size || size < 1)) {
                _showToast('Watch size must be at least 1', 'error');
                return { success: false, reason: 'Invalid watch size' };
            }

            var data = SettlementState.getSettlementData(locationId);
            if (!data) {
                return { success: false, reason: 'Settlement data not found' };
            }

            data.hasWatch = !!hasWatch;
            data.watchSize = hasWatch ? (size || 0) : 0;

            SettlementState._updateSettlementData(locationId, {
                hasWatch: data.hasWatch,
                watchSize: data.watchSize
            });

            // =====================================================================
            // INTEGRATION: Watch changed → Recalculate crime rate
            // =====================================================================
            if (typeof SettlementEconomy !== 'undefined') {
                try {
                    var newCrimeRate = SettlementEconomy.calculateCrimeRate(locationId);
                    SettlementState._updateSettlementData(locationId, { 
                        crimeRate: newCrimeRate 
                    });
                } catch(e) {
                    // Silent fail
                }
            }
            // =====================================================================

            _showToast(hasWatch ? 'Watch established with ' + size + ' members' : 'Watch disbanded', 'success');
            return { success: true, data: { hasWatch: data.hasWatch, watchSize: data.watchSize } };

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.GovernmentCommands = {
        // Department commands
        createDepartment: createDepartment,
        updateDepartment: updateDepartment,
        deleteDepartment: deleteDepartment,

        // Position commands
        addPosition: addPosition,
        updatePosition: updatePosition,
        deletePosition: deletePosition,

        // Assignment commands
        assignCharacterToPosition: assignCharacterToPosition,
        endAssignment: endAssignment,
        removeAssignment: removeAssignment,

        // Government type commands
        createGovernmentType: createGovernmentType,
        updateGovernmentType: updateGovernmentType,
        deleteGovernmentType: deleteGovernmentType,

        // Bulk operations
        bulkAssignCharacters: bulkAssignCharacters,

        // Leader commands (INTEGRATED)
        assignLeader: assignLeader,
        endLeaderTerm: endLeaderTerm,

        // Justice commands (INTEGRATED)
        updateJusticeSeverity: updateJusticeSeverity,
        updateWatch: updateWatch,

        // Validation (exposed for UI)
        validateDepartment: _validateDepartment,
        validatePosition: _validatePosition,
        validateAssignment: _validateAssignment,
        validateGovernmentType: _validateGovernmentType,
        validateLeaderAssignment: _validateLeaderAssignment
    };

})();