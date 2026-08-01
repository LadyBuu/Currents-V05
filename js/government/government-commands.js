/**
 * =============================================================================
 * GOVERNMENT COMMANDS (js/government/government-commands.js)
 * =============================================================================
 * 
 * PURPOSE: All write operations for government system.
 * 
 * UPDATED: Removed self-budget calculation (now uses settlement allocation)
 *          Salary payment now checks settlement allocation
 *          Added checkSalaryBudgetSufficiency()
 *          Kept assignment, position, department, leader, and justice management
 * 
 * FIXED: createGovernmentType now forces immediate save
 * FIXED: updateGovernmentType now forces immediate save
 * FIXED: deleteGovernmentType now forces immediate save
 * FIXED: Removed double toasts (toasts now only shown by commands)
 * 
 * DEPENDENCIES:
 *   - government-state.js (GovernmentState)
 *   - accessors.js (getCharacterById, getPlaceById, getCurrentYear)
 *   - eventLogger.js (logEvent)
 *   - storage.js (saveMasterData)
 *   - location-state.js (LocationState - for place data)
 *   - settlement-state.js (SettlementState) - for salary allocation
 *   - settlement-commands.js (SettlementCommands) - for allocation queries
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

    function _getPlaces() {
        return typeof window.getPlaces === 'function' ? window.getPlaces() : [];
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
        var plainMessage = message;
        if (typeof message === 'string') {
            plainMessage = message.replace(/<[^>]*>/g, '');
        }
        if (typeof window.showToast === 'function') {
            window.showToast(plainMessage, type);
        } else if (typeof window.showToastMessage === 'function') {
            window.showToastMessage(plainMessage, type);
        } else if (typeof window._showToast === 'function') {
            window._showToast(plainMessage, type);
        }
    }

    function _generateId(prefix) {
        if (typeof window.generateId === 'function') return window.generateId(prefix);
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }

    function _getRoleById(id) {
        if (typeof window.getRoleById === 'function') {
            return window.getRoleById(id);
        }
        return null;
    }

    function _addProfession(characterId, roleId, options) {
        if (typeof window.addProfession === 'function') {
            return window.addProfession(characterId, roleId, options);
        }
        return { success: false };
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

    function _getHouseholdForCharacter(characterId) {
        if (typeof window.HouseholdState !== 'undefined' && 
            typeof window.HouseholdState.getCharacterHousehold === 'function') {
            return window.HouseholdState.getCharacterHousehold(characterId);
        }
        return null;
    }

    function _updateHouseholdWealth(householdId, delta, reason) {
        if (typeof window.HouseholdEconomy !== 'undefined' && 
            typeof window.HouseholdEconomy.updateHouseholdWealth === 'function') {
            return window.HouseholdEconomy.updateHouseholdWealth(householdId, delta, reason);
        }
        if (typeof window.HouseholdState !== 'undefined' && 
            typeof window.HouseholdState.updateHousehold === 'function') {
            var household = window.HouseholdState.getHousehold(householdId);
            if (household && household.economy) {
                household.economy.wealth = Math.max(0, (household.economy.wealth || 0) + delta);
                window.HouseholdState.updateHousehold(householdId, { 
                    economy: household.economy 
                }, { recordHistory: false });
                return household.economy.wealth;
            }
        }
        return 0;
    }

    function _getHouseholdWealth(householdId) {
        if (typeof window.HouseholdEconomy !== 'undefined' && 
            typeof window.HouseholdEconomy.getHouseholdWealth === 'function') {
            return window.HouseholdEconomy.getHouseholdWealth(householdId);
        }
        var household = window.HouseholdState ? window.HouseholdState.getHousehold(householdId) : null;
        return household && household.economy ? household.economy.wealth || 0 : 0;
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

        if (data.requiredRoleId !== undefined && data.requiredRoleId !== null) {
            var role = _getRoleById(data.requiredRoleId);
            if (!role) {
                return { valid: false, reason: 'Required role not found' };
            }
        }

        if (data.minSkillLevel !== undefined && data.minSkillLevel < 0) {
            return { valid: false, reason: 'Minimum skill level cannot be negative' };
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

        if (position.genderRestriction && position.genderRestriction !== 'either') {
            if (character.gender !== position.genderRestriction) {
                return { valid: false, reason: 'Character gender does not meet position requirement' };
            }
        }

        var existing = GovernmentState.getAssignmentsForPosition(data.departmentId, data.positionId, true);
        for (var i = 0; i < existing.length; i++) {
            if (existing[i].characterId === data.characterId) {
                return { valid: false, reason: 'Character already assigned to this position' };
            }
        }

        if (position.requiredRoleId) {
            var hasRole = false;
            var skillLevel = 0;
            if (character.professions) {
                for (var i = 0; i < character.professions.length; i++) {
                    if (character.professions[i].id === position.requiredRoleId) {
                        hasRole = true;
                        skillLevel = character.professions[i].skillLevel || 0;
                        break;
                    }
                }
            }

            if (!hasRole && !data.addRoleIfMissing) {
                return { valid: false, reason: 'Character does not have the required role' };
            }

            if (hasRole && position.minSkillLevel && skillLevel < position.minSkillLevel) {
                return { valid: false, reason: 'Character skill level (' + skillLevel + ') is below requirement (' + position.minSkillLevel + ')' };
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
    // 4. SALARY PAYMENT HELPER
    // =========================================================================

    function _payGovernmentSalary(characterId, salary, positionName, departmentName, locationId) {
        if (salary <= 0) {
            return { success: false, reason: 'Salary is zero or negative' };
        }

        if (locationId && typeof window.SettlementState !== 'undefined') {
            var allocated = window.SettlementState.getGovernmentSalaryBudget(locationId) || 0;
            if (allocated < salary) {
                _logEvent('budget', 'salary_budget_shortfall',
                    'Insufficient settlement allocation for salary: ' + salary + ' gold (allocated: ' + allocated + ') for ' + positionName,
                    []);
                return { success: false, reason: 'Insufficient settlement salary budget' };
            }
        }

        var household = _getHouseholdForCharacter(characterId);
        if (!household) {
            return { success: false, reason: 'Character has no household' };
        }

        var character = _getCharacterById(characterId);
        var oldWealth = _getHouseholdWealth(household.id);
        var reason = 'Government salary: ' + positionName + ' (' + (departmentName || 'Unknown Department') + ')';
        var newWealth = _updateHouseholdWealth(household.id, salary, reason);

        _logEvent('economy', 'government_salary_paid',
            (character ? character.name : 'Unknown') + ' received ' + salary + ' gold as ' + positionName + ' (household: ' + household.name + ')',
            character ? [character] : []);

        return {
            success: true,
            characterId: characterId,
            characterName: character ? character.name : 'Unknown',
            householdId: household.id,
            householdName: household.name,
            salary: salary,
            oldWealth: oldWealth,
            newWealth: newWealth,
            positionName: positionName,
            departmentName: departmentName
        };
    }

    // =========================================================================
    // 5. DEPARTMENT COMMANDS
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
            _saveMasterData();

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
            _saveMasterData();

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
            _saveMasterData();

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
    // 6. POSITION COMMANDS
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
                parentPositionId: data.parentPositionId || null,
                requiredRoleId: data.requiredRoleId || null,
                minSkillLevel: data.minSkillLevel || 0,
                genderRestriction: data.genderRestriction || 'either',
                requiredRankId: data.requiredRankId || null,
                minExperience: data.minExperience || 0
            };

            var result = GovernmentState._addPosition(departmentId, position);
            _saveMasterData();

            var roleName = data.requiredRoleId ? (_getRoleById(data.requiredRoleId)?.name || 'None') : 'None';
            _logEvent('government', 'position_added',
                'Position "' + position.name + '" added to department "' + dept.name + '" (Role: ' + roleName + ')',
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
            _saveMasterData();

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
            _saveMasterData();

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
    // 7. ASSIGNMENT COMMANDS
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
                        var role = _getRoleById(roleId);
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

            var validation = _validateAssignment({
                departmentId: departmentId,
                positionId: positionId,
                characterId: characterId,
                startYear: options.startYear,
                endYear: options.endYear,
                addRoleIfMissing: options.addRoleIfMissing !== false
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
                notes: options.notes || '',
                roleIdAtAssignment: roleId,
                skillLevelAtAssignment: skillLevel
            };

            var result = GovernmentState._addAssignment(departmentId, assignment);
            _saveMasterData();

            var roleName = roleId ? (_getRoleById(roleId)?.name || 'None') : 'None';
            _logEvent('government', 'character_assigned',
                character.name + ' assigned to "' + position.name + '" in department "' + dept.name + '" (Role: ' + roleName + ')',
                [character]);

            var endMsg = options.endYear ? ' until ' + options.endYear : '';

            var salaryResult = null;
            if (typeof window.GovernmentEconomy !== 'undefined' && 
                typeof window.GovernmentEconomy.calculatePositionSalary === 'function') {
                var salary = window.GovernmentEconomy.calculatePositionSalary(positionId, dept);
                if (salary > 0) {
                    var allocationCheck = checkSalaryBudgetSufficiency(departmentId, _getCurrentYear());
                    if (allocationCheck && !allocationCheck.sufficient) {
                        _showToast('Warning: Insufficient settlement salary budget for this position', 'warning');
                    }
                    salaryResult = _payGovernmentSalary(characterId, salary, position.name, dept.name, dept.locationId);
                    if (salaryResult && salaryResult.success) {
                        _showToast(character.name + ' assigned to ' + position.name + endMsg + ' (Salary: ' + salary + ' gold/year)', 'success');
                    } else {
                        _showToast(character.name + ' assigned to ' + position.name + endMsg, 'success');
                    }
                } else {
                    _showToast(character.name + ' assigned to ' + position.name + endMsg, 'success');
                }
            } else {
                _showToast(character.name + ' assigned to ' + position.name + endMsg, 'success');
            }

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
            _saveMasterData();

            var character = _getCharacterById(assignment.characterId);

            var position = GovernmentState.getPositionById(departmentId, assignment.positionId);
            if (position && character) {
                _logEvent('economy', 'government_salary_ended',
                    character.name + ' ended ' + position.name + ' salary (ended ' + endYearValue + ')',
                    [character]);
            }

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
            _saveMasterData();

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
    // 8. SALARY BUDGET SUFFICIENCY CHECK
    // =========================================================================

    function checkSalaryBudgetSufficiency(departmentId, year) {
        if (_processingCommand) {
            return { sufficient: false, reason: 'Command already processing' };
        }
        _processingCommand = true;

        try {
            var dept = GovernmentState.getDepartment(departmentId);
            if (!dept) {
                return { sufficient: false, reason: 'Department not found' };
            }

            var requirements = 0;
            if (typeof window.SettlementCommands !== 'undefined' &&
                typeof window.SettlementCommands.getGovernmentSalaryRequirements === 'function') {
                var req = window.SettlementCommands.getGovernmentSalaryRequirements(dept.locationId);
                requirements = req.total || 0;
            }

            var allocated = 0;
            if (typeof window.SettlementState !== 'undefined') {
                allocated = window.SettlementState.getGovernmentSalaryBudget(dept.locationId) || 0;
            }

            return {
                sufficient: allocated >= requirements,
                allocated: allocated,
                required: requirements,
                shortfall: Math.max(0, requirements - allocated),
                surplus: Math.max(0, allocated - requirements),
                locationId: dept.locationId,
                departmentId: departmentId,
                departmentName: dept.name
            };

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 9. GOVERNMENT TYPE COMMANDS - FIXED: Force save, NO double toast
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
                allowedRankIds: data.allowedRankIds || [],
                icon: data.icon || ''
            };

            GovernmentState._addGovernmentType(type);
            
            // FORCE SAVE IMMEDIATELY
            if (typeof window.saveMasterData === 'function') {
                window.saveMasterData(true);
            }
            if (typeof window.invalidateAccessorCaches === 'function') {
                window.invalidateAccessorCaches();
            }
            if (typeof window.GovernmentState !== 'undefined' && 
                typeof window.GovernmentState.invalidateCache === 'function') {
                window.GovernmentState.invalidateCache();
            }

            _logEvent('government', 'type_created',
                'Government type "' + type.name + '" created',
                []);

            // SHOW TOAST HERE (single source)
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

            var result = GovernmentState._updateGovernmentType(typeId, {
                name: updates.name,
                description: updates.description,
                allowedRankIds: updates.allowedRankIds,
                icon: updates.icon
            });
            
            // FORCE SAVE IMMEDIATELY
            if (typeof window.saveMasterData === 'function') {
                window.saveMasterData(true);
            }
            if (typeof window.invalidateAccessorCaches === 'function') {
                window.invalidateAccessorCaches();
            }
            if (typeof window.GovernmentState !== 'undefined' && 
                typeof window.GovernmentState.invalidateCache === 'function') {
                window.GovernmentState.invalidateCache();
            }

            _logEvent('government', 'type_updated',
                'Government type "' + type.name + '" updated',
                []);

            // SHOW TOAST HERE (single source)
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

            var places = _getPlaces();
            var usedBy = places.filter(function(p) { return p.governmentTypeId === typeId; });
            if (usedBy.length > 0) {
                _showToast('Cannot delete: Used by ' + usedBy.length + ' location(s)', 'warning');
                return false;
            }

            var result = GovernmentState._deleteGovernmentType(typeId);
            
            // FORCE SAVE IMMEDIATELY
            if (typeof window.saveMasterData === 'function') {
                window.saveMasterData(true);
            }
            if (typeof window.invalidateAccessorCaches === 'function') {
                window.invalidateAccessorCaches();
            }
            if (typeof window.GovernmentState !== 'undefined' && 
                typeof window.GovernmentState.invalidateCache === 'function') {
                window.GovernmentState.invalidateCache();
            }

            _logEvent('government', 'type_deleted',
                'Government type "' + type.name + '" deleted',
                []);

            // SHOW TOAST HERE (single source)
            _showToast('Government type deleted', 'info');
            return result;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 10. BULK OPERATIONS
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
                        notes: data.notes,
                        addRoleIfMissing: data.addRoleIfMissing !== false,
                        defaultSkillLevel: data.defaultSkillLevel || 10
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
    // 11. LEADER COMMANDS
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

            if (typeof SettlementEconomy !== 'undefined' && typeof SettlementState !== 'undefined') {
                try {
                    var newProsperity = SettlementEconomy.calculateProsperity(placeId);
                    SettlementState._updateSettlementData(placeId, { 
                        prosperity: newProsperity,
                        lastUpgraded: _getCurrentYear()
                    });
                } catch(e) {}
            }

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

            if (typeof SettlementEconomy !== 'undefined' && typeof SettlementState !== 'undefined') {
                try {
                    var newProsperity = SettlementEconomy.calculateProsperity(placeId);
                    SettlementState._updateSettlementData(placeId, { 
                        prosperity: newProsperity 
                    });
                } catch(e) {}
            }

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
    // 12. JUSTICE COMMANDS
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

            var data = _getSettlementData(locationId);
            if (!data) {
                return { success: false, reason: 'Settlement data not found' };
            }

            data.justiceSeverity = severity;

            if (typeof SettlementState !== 'undefined' && SettlementState._updateSettlementData) {
                SettlementState._updateSettlementData(locationId, { justiceSeverity: severity });
            }

            if (typeof SettlementEconomy !== 'undefined') {
                try {
                    var newCrimeRate = SettlementEconomy.calculateCrimeRate(locationId);
                    if (typeof SettlementState !== 'undefined' && SettlementState._updateSettlementData) {
                        SettlementState._updateSettlementData(locationId, { 
                            crimeRate: newCrimeRate 
                        });
                    }
                    
                    _logEvent('justice', 'crime_rate_updated',
                        'Crime rate updated to ' + Math.round(newCrimeRate * 100) + '% after justice severity change at ' + 
                        (_getPlaceById(locationId)?.displayName || 'Unknown'),
                        []);
                } catch(e) {}
            }

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

            var data = _getSettlementData(locationId);
            if (!data) {
                return { success: false, reason: 'Settlement data not found' };
            }

            data.hasWatch = !!hasWatch;
            data.watchSize = hasWatch ? (size || 0) : 0;

            if (typeof SettlementState !== 'undefined' && SettlementState._updateSettlementData) {
                SettlementState._updateSettlementData(locationId, {
                    hasWatch: data.hasWatch,
                    watchSize: data.watchSize
                });
            }

            if (typeof SettlementEconomy !== 'undefined') {
                try {
                    var newCrimeRate = SettlementEconomy.calculateCrimeRate(locationId);
                    if (typeof SettlementState !== 'undefined' && SettlementState._updateSettlementData) {
                        SettlementState._updateSettlementData(locationId, { 
                            crimeRate: newCrimeRate 
                        });
                    }
                } catch(e) {}
            }

            _showToast(hasWatch ? 'Watch established with ' + size + ' members' : 'Watch disbanded', 'success');
            return { success: true, data: { hasWatch: data.hasWatch, watchSize: data.watchSize } };

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 13. EXPORTS
    // =========================================================================

    window.GovernmentCommands = {
        createDepartment: createDepartment,
        updateDepartment: updateDepartment,
        deleteDepartment: deleteDepartment,

        addPosition: addPosition,
        updatePosition: updatePosition,
        deletePosition: deletePosition,

        assignCharacterToPosition: assignCharacterToPosition,
        endAssignment: endAssignment,
        removeAssignment: removeAssignment,

        createGovernmentType: createGovernmentType,
        updateGovernmentType: updateGovernmentType,
        deleteGovernmentType: deleteGovernmentType,

        bulkAssignCharacters: bulkAssignCharacters,

        assignLeader: assignLeader,
        endLeaderTerm: endLeaderTerm,

        updateJusticeSeverity: updateJusticeSeverity,
        updateWatch: updateWatch,

        checkSalaryBudgetSufficiency: checkSalaryBudgetSufficiency,

        _payGovernmentSalary: _payGovernmentSalary,

        validateDepartment: _validateDepartment,
        validatePosition: _validatePosition,
        validateAssignment: _validateAssignment,
        validateGovernmentType: _validateGovernmentType,
        validateLeaderAssignment: _validateLeaderAssignment
    };

    // Legacy aliases
    window.assignGovernment = function(placeId, govTypeId, govStyle) {
        var place = _getPlaceById(placeId);
        if (!place) {
            _showToast('Place not found', 'error');
            return false;
        }
        place.governmentTypeId = govTypeId || null;
        place.governmentStyle = govStyle || null;
        place.updatedAt = Date.now();
        _saveMasterData();
        if (typeof LocationState !== 'undefined' && LocationState.invalidateCache) {
            LocationState.invalidateCache();
        }
        _showToast('Government updated for ' + place.displayName, 'success');
        return true;
    };

    window.createGovernmentDepartment = createDepartment;
    window.updateGovernmentDepartment = updateDepartment;
    window.deleteGovernmentDepartment = deleteDepartment;
    window.addPositionToDepartment = addPosition;
    window.updatePosition = updatePosition;
    window.removePositionFromDepartment = deletePosition;
    window.assignCharacterToPosition = assignCharacterToPosition;
    window.removeCharacterFromPosition = function(departmentId, assignmentId, endYear) {
        if (endYear) {
            return endAssignment(departmentId, assignmentId, endYear);
        }
        return removeAssignment(departmentId, assignmentId);
    };
    window.bulkAssignCharacters = bulkAssignCharacters;
    window.assignLeader = assignLeader;
    window.endLeaderTerm = endLeaderTerm;

})();