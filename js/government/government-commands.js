/**
 * =============================================================================
 * GOVERNMENT COMMANDS (government-commands.js)
 * =============================================================================
 * 
 * PURPOSE: All write operations for government system.
 * 
 * UPDATED: Added role integration (requiredRoleId, minSkillLevel)
 *          Added settlement integration for leader assignment
 *          Added justice commands with crime integration
 *          ADDED: Salary payment to household economy on assignment
 *          ADDED: Annual salary processing for all active assignments
 *          ADDED: Tax collection from households
 * 
 * DEPENDENCIES:
 *   - government-state.js (GovernmentState)
 *   - accessors.js (getCharacterById, getPlaceById, getCurrentYear)
 *   - eventLogger.js (logEvent)
 *   - storage.js (saveMasterData)
 *   - location-state.js (LocationState - for place data)
 *   - household-state.js (HouseholdState) - for salary/tax integration
 *   - household-economy.js (HouseholdEconomy) - for wealth updates
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

    // =========================================================================
    // 2.5 HOUSEHOLD ECONOMY WRAPPERS (for salary/tax integration)
    // =========================================================================

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
        // Fallback: try direct household update
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

    function _getHouseholdsByLocation(locationId) {
        if (typeof window.HouseholdState !== 'undefined' && 
            typeof window.HouseholdState.getHouseholdsByLocation === 'function') {
            return window.HouseholdState.getHouseholdsByLocation(locationId);
        }
        return [];
    }

    function _getHouseholdWealth(householdId) {
        if (typeof window.HouseholdEconomy !== 'undefined' && 
            typeof window.HouseholdEconomy.getHouseholdWealth === 'function') {
            return window.HouseholdEconomy.getHouseholdWealth(householdId);
        }
        var household = window.HouseholdState ? window.HouseholdState.getHousehold(householdId) : null;
        return household && household.economy ? household.economy.wealth || 0 : 0;
    }

    function _getHouseholdName(householdId) {
        var household = window.HouseholdState ? window.HouseholdState.getHousehold(householdId) : null;
        return household ? household.name : 'Unknown Household';
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

        // Check gender restriction
        if (position.genderRestriction && position.genderRestriction !== 'either') {
            if (character.gender !== position.genderRestriction) {
                return { valid: false, reason: 'Character gender does not meet position requirement' };
            }
        }

        // Check if already assigned to this position
        var existing = GovernmentState.getAssignmentsForPosition(data.departmentId, data.positionId, true);
        for (var i = 0; i < existing.length; i++) {
            if (existing[i].characterId === data.characterId) {
                return { valid: false, reason: 'Character already assigned to this position' };
            }
        }

        // Check role requirement
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
    // 3.5 SALARY PAYMENT HELPER
    // =========================================================================

    /**
     * Pays salary to a character's household
     * @param {string} characterId - Character ID
     * @param {number} salary - Salary amount
     * @param {string} positionName - Name of the position (for logging)
     * @param {string} departmentName - Name of the department (for logging)
     * @returns {Object} Result with payment details
     */
    function _payGovernmentSalary(characterId, salary, positionName, departmentName) {
        if (salary <= 0) {
            return { success: false, reason: 'Salary is zero or negative' };
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
                parentPositionId: data.parentPositionId || null,
                requiredRoleId: data.requiredRoleId || null,
                minSkillLevel: data.minSkillLevel || 0,
                genderRestriction: data.genderRestriction || 'either',
                requiredRankId: data.requiredRankId || null,
                minExperience: data.minExperience || 0
            };

            var result = GovernmentState._addPosition(departmentId, position);

            var roleName = data.requiredRoleId ? (_getRoleById(data.requiredRoleId)?.name || 'Unknown') : 'None';
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
    // 6. ASSIGNMENT COMMANDS (UPDATED with Salary Payment)
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

            // Handle role requirement - check before validation
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

            var roleName = roleId ? (_getRoleById(roleId)?.name || 'None') : 'None';
            _logEvent('government', 'character_assigned',
                character.name + ' assigned to "' + position.name + '" in department "' + dept.name + '" (Role: ' + roleName + ')',
                [character]);

            var endMsg = options.endYear ? ' until ' + options.endYear : '';

            // =====================================================================
            // INTEGRATION: Pay salary to character's household on assignment
            // =====================================================================
            var salaryResult = null;
            if (typeof window.GovernmentEconomy !== 'undefined' && 
                typeof window.GovernmentEconomy.calculatePositionSalary === 'function') {
                var salary = window.GovernmentEconomy.calculatePositionSalary(positionId, dept);
                if (salary > 0) {
                    salaryResult = _payGovernmentSalary(characterId, salary, position.name, dept.name);
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

            var character = _getCharacterById(assignment.characterId);

            // =====================================================================
            // INTEGRATION: Log salary ended (no further payments)
            // =====================================================================
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
    // 6.5 ANNUAL SALARY PROCESSING (NEW)
    // =========================================================================

    /**
     * Processes all active government salaries for a given year
     * Called during annual processing
     * @param {number} year - The year to process salaries for
     * @param {Object} options - Processing options
     * @param {boolean} options.showToast - Whether to show toast notifications
     * @param {number} options.dryRun - If true, only calculate without applying
     * @returns {Object} Results of salary processing
     */
    function processGovernmentSalaries(year, options) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already processing', paid: 0, failed: 0, total: 0 };
        }
        _processingCommand = true;

        try {
            options = options || {};
            var showToast = options.showToast !== false;
            var dryRun = options.dryRun || false;
            var processYear = year || _getCurrentYear();

            var departments = GovernmentState.getAllDepartments({ includeDeprecated: false });
            var results = {
                total: 0,
                paid: 0,
                failed: 0,
                totalSalaryPaid: 0,
                details: [],
                errors: [],
                year: processYear
            };

            for (var d = 0; d < departments.length; d++) {
                var dept = departments[d];
                var assignments = GovernmentState.getAssignmentsForDepartment(dept.id, true);

                for (var a = 0; a < assignments.length; a++) {
                    var assignment = assignments[a];
                    results.total++;

                    try {
                        var character = _getCharacterById(assignment.characterId);
                        if (!character) {
                            results.failed++;
                            results.errors.push({
                                assignmentId: assignment.id,
                                characterId: assignment.characterId,
                                reason: 'Character not found'
                            });
                            continue;
                        }

                        if (character.isDeceased) {
                            results.failed++;
                            results.errors.push({
                                assignmentId: assignment.id,
                                characterId: assignment.characterId,
                                reason: 'Character is deceased'
                            });
                            continue;
                        }

                        // Calculate salary for this position
                        var salary = 0;
                        if (typeof window.GovernmentEconomy !== 'undefined' && 
                            typeof window.GovernmentEconomy.calculatePositionSalary === 'function') {
                            salary = window.GovernmentEconomy.calculatePositionSalary(assignment.positionId, dept);
                        }

                        if (salary <= 0) {
                            results.failed++;
                            results.errors.push({
                                assignmentId: assignment.id,
                                characterId: assignment.characterId,
                                reason: 'Salary is zero or negative'
                            });
                            continue;
                        }

                        // Find or update the character's position name
                        var position = GovernmentState.getPositionById(dept.id, assignment.positionId);
                        var positionName = position ? position.name : assignment.positionId;

                        if (!dryRun) {
                            // Pay the salary
                            var salaryResult = _payGovernmentSalary(
                                assignment.characterId,
                                salary,
                                positionName,
                                dept.name
                            );

                            if (salaryResult && salaryResult.success) {
                                results.paid++;
                                results.totalSalaryPaid += salary;
                                results.details.push({
                                    assignmentId: assignment.id,
                                    characterId: assignment.characterId,
                                    characterName: character.name,
                                    householdId: salaryResult.householdId,
                                    householdName: salaryResult.householdName,
                                    salary: salary,
                                    positionName: positionName,
                                    departmentName: dept.name
                                });
                            } else {
                                results.failed++;
                                results.errors.push({
                                    assignmentId: assignment.id,
                                    characterId: assignment.characterId,
                                    reason: salaryResult ? salaryResult.reason : 'Failed to pay salary'
                                });
                            }
                        } else {
                            // Dry run - just record
                            results.paid++;
                            results.totalSalaryPaid += salary;
                            results.details.push({
                                assignmentId: assignment.id,
                                characterId: assignment.characterId,
                                characterName: character.name,
                                salary: salary,
                                positionName: positionName,
                                departmentName: dept.name,
                                dryRun: true
                            });
                        }

                    } catch (err) {
                        results.failed++;
                        results.errors.push({
                            assignmentId: assignment.id,
                            characterId: assignment.characterId,
                            reason: err.message || 'Unknown error'
                        });
                    }
                }
            }

            if (showToast && !dryRun) {
                var msg = 'Paid ' + results.paid + ' government salaries (' + results.totalSalaryPaid + ' gold total)';
                if (results.failed > 0) {
                    msg += '; ' + results.failed + ' failed';
                }
                _showToast(msg, results.failed > 0 ? 'warning' : 'success');
            }

            if (results.paid > 0) {
                _logEvent('economy', 'government_salaries_processed',
                    'Processed ' + results.paid + ' government salaries totaling ' + results.totalSalaryPaid + ' gold for year ' + processYear,
                    []);
            }

            return results;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 6.6 TAX COLLECTION (NEW)
    // =========================================================================

    /**
     * Collects taxes from all households in a location
     * @param {string} locationId - Location ID
     * @param {number} year - Tax year
     * @param {Object} options - Collection options
     * @param {number} options.taxRate - Override tax rate (default: from settlement)
     * @param {boolean} options.showToast - Show toast notifications
     * @param {boolean} options.dryRun - Calculate without applying
     * @returns {Object} Tax collection results
     */
    function collectHouseholdTaxes(locationId, year, options) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already processing', collected: 0, failed: 0, total: 0 };
        }
        _processingCommand = true;

        try {
            options = options || {};
            var showToast = options.showToast !== false;
            var dryRun = options.dryRun || false;
            var taxYear = year || _getCurrentYear();

            var place = _getPlaceById(locationId);
            if (!place) {
                return { success: false, reason: 'Location not found', collected: 0, failed: 0, total: 0 };
            }

            // Get tax rate from settlement or use default
            var taxRate = options.taxRate;
            if (taxRate === undefined) {
                var settlement = _getSettlementData(locationId);
                taxRate = settlement ? (settlement.taxRate || 10) / 100 : 0.05;
            } else {
                taxRate = taxRate / 100; // Convert percentage to decimal
            }

            var households = _getHouseholdsByLocation(locationId);
            var results = {
                total: households.length,
                collected: 0,
                failed: 0,
                totalTaxCollected: 0,
                details: [],
                errors: [],
                year: taxYear,
                locationId: locationId,
                locationName: place.displayName,
                taxRate: taxRate
            };

            for (var h = 0; h < households.length; h++) {
                var household = households[h];
                try {
                    var wealth = _getHouseholdWealth(household.id);
                    if (wealth <= 0) {
                        results.details.push({
                            householdId: household.id,
                            householdName: household.name,
                            wealth: wealth,
                            tax: 0,
                            reason: 'No wealth to tax'
                        });
                        continue;
                    }

                    // Calculate tax (minimum 1 gold if any wealth)
                    var tax = Math.max(1, Math.floor(wealth * taxRate));

                    if (!dryRun) {
                        var newWealth = _updateHouseholdWealth(household.id, -tax, 'Tax payment to ' + place.displayName);
                        results.collected++;
                        results.totalTaxCollected += tax;
                        results.details.push({
                            householdId: household.id,
                            householdName: household.name,
                            wealth: wealth,
                            tax: tax,
                            newWealth: newWealth,
                            status: 'collected'
                        });

                        _logEvent('economy', 'tax_collected',
                            household.name + ' paid ' + tax + ' gold in taxes to ' + place.displayName + ' (' + taxYear + ')',
                            []);
                    } else {
                        results.collected++;
                        results.totalTaxCollected += tax;
                        results.details.push({
                            householdId: household.id,
                            householdName: household.name,
                            wealth: wealth,
                            tax: tax,
                            dryRun: true,
                            status: 'dry_run'
                        });
                    }

                } catch (err) {
                    results.failed++;
                    results.errors.push({
                        householdId: household.id,
                        householdName: household.name,
                        reason: err.message || 'Unknown error'
                    });
                }
            }

            // Add to settlement treasury if not dry run
            if (!dryRun && results.totalTaxCollected > 0) {
                var settlement = _getSettlementData(locationId);
                if (settlement) {
                    settlement.treasury = (settlement.treasury || 0) + results.totalTaxCollected;
                    if (typeof SettlementState !== 'undefined' && 
                        typeof SettlementState._updateSettlementData === 'function') {
                        SettlementState._updateSettlementData(locationId, { 
                            treasury: settlement.treasury 
                        });
                    }
                    _logEvent('economy', 'tax_added_to_treasury',
                        'Added ' + results.totalTaxCollected + ' gold to ' + place.displayName + ' treasury',
                        []);
                }
            }

            if (showToast && !dryRun) {
                var msg = 'Collected ' + results.totalTaxCollected + ' gold in taxes from ' + 
                         results.collected + ' households';
                if (results.failed > 0) {
                    msg += '; ' + results.failed + ' failed';
                }
                _showToast(msg, results.failed > 0 ? 'warning' : 'success');
            }

            return results;

        } finally {
            _processingCommand = false;
        }
    }

    /**
     * Collects taxes from all households in all locations
     * @param {number} year - Tax year
     * @param {Object} options - Collection options
     * @returns {Object} Aggregated results
     */
    function collectAllHouseholdTaxes(year, options) {
        if (_processingCommand) {
            return { success: false, reason: 'Command already processing', totalCollected: 0, locations: [] };
        }
        _processingCommand = true;

        try {
            options = options || {};
            var taxYear = year || _getCurrentYear();

            var places = _getPlaces();
            var results = {
                totalCollected: 0,
                locations: [],
                totalHouseholds: 0,
                year: taxYear,
                errors: []
            };

            for (var i = 0; i < places.length; i++) {
                var place = places[i];
                try {
                    var locationResult = collectHouseholdTaxes(place.id, taxYear, {
                        showToast: false,
                        dryRun: options.dryRun || false
                    });

                    if (locationResult && locationResult.success !== false) {
                        results.locations.push({
                            locationId: place.id,
                            locationName: place.displayName,
                            collected: locationResult.collected || 0,
                            total: locationResult.total || 0,
                            totalTaxCollected: locationResult.totalTaxCollected || 0
                        });
                        results.totalCollected += locationResult.totalTaxCollected || 0;
                        results.totalHouseholds += locationResult.total || 0;
                    } else {
                        results.errors.push({
                            locationId: place.id,
                            locationName: place.displayName,
                            reason: locationResult ? locationResult.reason : 'Unknown error'
                        });
                    }
                } catch (err) {
                    results.errors.push({
                        locationId: place.id,
                        locationName: place.displayName,
                        reason: err.message || 'Unknown error'
                    });
                }
            }

            if (options.showToast !== false && !options.dryRun) {
                _showToast('Collected ' + results.totalCollected + ' gold in taxes from ' + 
                         results.totalHouseholds + ' households across ' + results.locations.length + ' locations', 
                         'success');
            }

            _logEvent('economy', 'all_taxes_collected',
                'Collected ' + results.totalCollected + ' gold in taxes from ' + results.totalHouseholds + ' households for year ' + taxYear,
                []);

            return results;

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

            var places = _getPlaces();
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

            var data = _getSettlementData(locationId);
            if (!data) {
                return { success: false, reason: 'Settlement data not found' };
            }

            data.justiceSeverity = severity;

            if (typeof SettlementState !== 'undefined' && SettlementState._updateSettlementData) {
                SettlementState._updateSettlementData(locationId, { justiceSeverity: severity });
            }

            // =====================================================================
            // INTEGRATION: Justice severity changed → Recalculate crime rate
            // =====================================================================
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

            // =====================================================================
            // INTEGRATION: Watch changed → Recalculate crime rate
            // =====================================================================
            if (typeof SettlementEconomy !== 'undefined') {
                try {
                    var newCrimeRate = SettlementEconomy.calculateCrimeRate(locationId);
                    if (typeof SettlementState !== 'undefined' && SettlementState._updateSettlementData) {
                        SettlementState._updateSettlementData(locationId, { 
                            crimeRate: newCrimeRate 
                        });
                    }
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
    // 11. EXPORTS (UPDATED with Salary and Tax functions)
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

        // Assignment commands (UPDATED with salary payment)
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

        // NEW: Salary processing
        processGovernmentSalaries: processGovernmentSalaries,
        _payGovernmentSalary: _payGovernmentSalary,

        // NEW: Tax collection
        collectHouseholdTaxes: collectHouseholdTaxes,
        collectAllHouseholdTaxes: collectAllHouseholdTaxes,

        // Validation (exposed for UI)
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

    // Legacy aliases for new functions
    window.processGovernmentSalaries = processGovernmentSalaries;
    window.collectHouseholdTaxes = collectHouseholdTaxes;
    window.collectAllHouseholdTaxes = collectAllHouseholdTaxes;

})();