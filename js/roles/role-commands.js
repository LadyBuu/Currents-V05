/**
 * =============================================================================
 * STILL WATERS - ROLE COMMANDS (role-commands.js)
 * =============================================================================
 * 
 * This file contains ALL write operations for roles:
 * - Role CRUD
 * - Category management
 * - Role assignment to characters
 * - Skill management
 * 
 * UPDATED: Added salary management functions
 * UPDATED: Added literacy requirement management functions
 * 
 * DEPENDENCIES:
 *   - role-state.js (RoleState)
 *   - role-constants.js (UNCATEGORIZED_ID, BASE_SALARY_BY_CATEGORY, DEFAULT_SALARY)
 *   - accessors.js (getCharacterById, getCharacters, getRoleById)
 *   - ids.js (generateId)
 *   - storage.js (saveMasterData)
 * 
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. RECURSION GUARDS
    // =========================================================================

    var _processingCommand = false;

    // =========================================================================
    // 2. DEPENDENCY WRAPPERS
    // =========================================================================

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
        return [];
    }

    function _getRoleById(id) {
        if (typeof window.getRoleById === 'function') {
            return window.getRoleById(id);
        }
        return null;
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYearSafe === 'function') {
            return window.getCurrentYearSafe();
        }
        if (typeof window.getCurrentYear === 'function') {
            return window.getCurrentYear();
        }
        return 1250;
    }

    function _generateId(prefix) {
        if (typeof window.generateId === 'function') {
            return window.generateId(prefix);
        }
        return prefix + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
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

    function _addProfession(characterId, roleId, options) {
        if (typeof window.addProfession === 'function') {
            return window.addProfession(characterId, roleId, options);
        }
        return { success: false };
    }

    function _updateProfessionSkill(characterId, roleId, skillLevel) {
        if (typeof window.updateProfessionSkill === 'function') {
            return window.updateProfessionSkill(characterId, roleId, skillLevel);
        }
        return false;
    }

    function _saveMasterData() {
        if (typeof window.saveMasterData === 'function') {
            window.saveMasterData();
        }
    }

    function _getBaseSalaryByCategory(category) {
        return window.BASE_SALARY_BY_CATEGORY?.[category] || window.DEFAULT_SALARY || 10;
    }

    // =========================================================================
    // 3. ROLE CRUD
    // =========================================================================

    function createRole(data) {
        if (_processingCommand) {
            return null;
        }
        _processingCommand = true;

        try {
            data = data || {};

            if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
                _showToast('Role name is required', 'error');
                return null;
            }

            var categories = RoleState.getCategories();
            var category = data.category || window.UNCATEGORIZED_ID || 'uncategorized';
            if (category !== 'uncategorized' && !categories[category]) {
                _showToast('Invalid category', 'error');
                return null;
            }

            var baseSalary = data.baseSalary;
            if (baseSalary === undefined || baseSalary === null) {
                baseSalary = _getBaseSalaryByCategory(category);
            }

            var requiresLiteracy = data.requiresLiteracy || false;
            var literacyLevel = data.literacyLevel || null;

            if (requiresLiteracy && literacyLevel) {
                var validLevels = ['basic', 'literate', 'educated', 'scholar'];
                if (validLevels.indexOf(literacyLevel) === -1) {
                    _showToast('Invalid literacy level', 'error');
                    return null;
                }
            }

            var newRole = {
                id: _generateId('role'),
                name: data.name.trim(),
                category: category,
                icon: data.icon || '◉',
                specializations: data.specializations || [],
                notes: data.notes || '',
                genderRestriction: data.genderRestriction || 'both',
                baseSalary: Math.max(0, baseSalary),
                requiresLiteracy: requiresLiteracy,
                literacyLevel: requiresLiteracy ? literacyLevel : null
            };

            var result = RoleState._addRole(newRole);

            _logEvent('role', 'Role Created', 'Created role: ' + newRole.name, []);

            var salaryMsg = newRole.baseSalary > 0 ? ' (Salary: ' + newRole.baseSalary + ' gold)' : '';
            _showToast('Role "' + newRole.name + '" created' + salaryMsg, 'success');

            if (typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(new CustomEvent('rolesUpdated', {}));
            }

            return result;

        } finally {
            _processingCommand = false;
        }
    }

    function updateRole(roleId, updates) {
        if (_processingCommand) {
            return null;
        }
        _processingCommand = true;

        try {
            var role = RoleState.getRole(roleId);
            if (!role) {
                _showToast('Role not found', 'error');
                return null;
            }

            if (updates.category !== undefined && updates.category !== role.category) {
                var categories = RoleState.getCategories();
                if (updates.category !== 'uncategorized' && !categories[updates.category]) {
                    _showToast('Invalid category', 'error');
                    return null;
                }
            }

            if (updates.name !== undefined && updates.name.trim() === '') {
                _showToast('Role name cannot be empty', 'error');
                return null;
            }

            if (updates.requiresLiteracy !== undefined) {
                updates.requiresLiteracy = !!updates.requiresLiteracy;
                if (!updates.requiresLiteracy) {
                    updates.literacyLevel = null;
                }
            }

            if (updates.literacyLevel !== undefined && updates.literacyLevel !== null) {
                var validLevels = ['basic', 'literate', 'educated', 'scholar'];
                if (validLevels.indexOf(updates.literacyLevel) === -1) {
                    _showToast('Invalid literacy level', 'error');
                    return null;
                }
            }

            if (updates.baseSalary !== undefined) {
                updates.baseSalary = Math.max(0, updates.baseSalary);
                if (updates.baseSalary > window.MAX_SALARY || 200) {
                    _showToast('Salary too high (max: 200)', 'error');
                    return null;
                }
            }

            var result = RoleState._updateRole(roleId, updates);

            if (result) {
                _logEvent('role', 'Role Updated', 'Updated role: ' + result.name, []);
                _showToast('Role "' + result.name + '" updated', 'success');

                if (typeof window.dispatchEvent === 'function') {
                    window.dispatchEvent(new CustomEvent('rolesUpdated', {}));
                }

                return result;
            }

            return null;

        } finally {
            _processingCommand = false;
        }
    }

    function deleteRole(roleId, removeFromCharacters) {
        if (_processingCommand) {
            return false;
        }
        _processingCommand = true;

        try {
            var role = RoleState.getRole(roleId);
            if (!role) {
                _showToast('Role not found', 'error');
                return false;
            }

            removeFromCharacters = removeFromCharacters !== undefined ? removeFromCharacters : true;

            if (removeFromCharacters) {
                var characters = _getCharacters();
                for (var i = 0; i < characters.length; i++) {
                    var char = characters[i];
                    if (char.professions) {
                        char.professions = char.professions.filter(function(p) {
                            return p.id !== roleId;
                        });
                    }
                }
            }

            var result = RoleState._deleteRole(roleId);

            if (result) {
                _logEvent('role', 'Role Deleted', 'Deleted role: ' + role.name, []);
                _showToast('Role "' + role.name + '" deleted', 'info');

                if (typeof window.dispatchEvent === 'function') {
                    window.dispatchEvent(new CustomEvent('rolesUpdated', {}));
                }

                return true;
            }

            return false;

        } finally {
            _processingCommand = false;
        }
    }

    function setRoles(roles) {
        if (_processingCommand) {
            return false;
        }
        _processingCommand = true;

        try {
            if (!Array.isArray(roles)) {
                _showToast('Invalid roles array', 'error');
                return false;
            }

            var result = RoleState._setRoles(roles);

            if (result) {
                _showToast('Roles updated', 'success');

                if (typeof window.dispatchEvent === 'function') {
                    window.dispatchEvent(new CustomEvent('rolesUpdated', {}));
                }

                return true;
            }

            return false;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 4. CATEGORY MANAGEMENT
    // =========================================================================

    function addCategory(id, name, icon) {
        if (_processingCommand) {
            return false;
        }
        _processingCommand = true;

        try {
            if (!id || typeof id !== 'string' || id.trim() === '') {
                _showToast('Category ID is required', 'error');
                return false;
            }

            if (!name || typeof name !== 'string' || name.trim() === '') {
                _showToast('Category name is required', 'error');
                return false;
            }

            var categories = RoleState.getCategories();
            if (categories[id]) {
                _showToast('Category already exists', 'error');
                return false;
            }

            categories[id] = {
                id: id,
                name: name.trim(),
                icon: icon || '⌇'
            };

            RoleState._persistState();

            _showToast('Category "' + name + '" created', 'success');

            if (typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(new CustomEvent('rolesUpdated', {}));
            }

            return true;

        } finally {
            _processingCommand = false;
        }
    }

    function updateCategory(id, updates) {
        if (_processingCommand) {
            return false;
        }
        _processingCommand = true;

        try {
            var categories = RoleState.getCategories();
            if (!categories[id]) {
                _showToast('Category not found', 'error');
                return false;
            }

            if (updates.name !== undefined && updates.name.trim() === '') {
                _showToast('Category name cannot be empty', 'error');
                return false;
            }

            if (updates.name !== undefined) {
                categories[id].name = updates.name.trim();
            }

            if (updates.icon !== undefined) {
                categories[id].icon = updates.icon;
            }

            RoleState._persistState();

            _showToast('Category "' + categories[id].name + '" updated', 'success');

            if (typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(new CustomEvent('rolesUpdated', {}));
            }

            return true;

        } finally {
            _processingCommand = false;
        }
    }

    function deleteCategory(id, reassignTo) {
        if (_processingCommand) {
            return false;
        }
        _processingCommand = true;

        try {
            var categories = RoleState.getCategories();
            if (!categories[id]) {
                _showToast('Category not found', 'error');
                return false;
            }

            if (id === 'uncategorized') {
                _showToast('Cannot delete uncategorized category', 'error');
                return false;
            }

            reassignTo = reassignTo || 'uncategorized';
            if (!categories[reassignTo]) {
                _showToast('Reassignment category not found', 'error');
                return false;
            }

            var roles = RoleState.getAllRoles();
            for (var i = 0; i < roles.length; i++) {
                if (roles[i].category === id) {
                    roles[i].category = reassignTo;
                }
            }

            delete categories[id];

            RoleState._persistState();

            _showToast('Category deleted', 'info');

            if (typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(new CustomEvent('rolesUpdated', {}));
            }

            return true;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 5. SALARY MANAGEMENT (NEW)
    // =========================================================================

    function updateRoleSalary(roleId, newSalary, reason) {
        if (_processingCommand) {
            return null;
        }
        _processingCommand = true;

        try {
            var role = RoleState.getRole(roleId);
            if (!role) {
                _showToast('Role not found', 'error');
                return null;
            }

            var boundedSalary = Math.max(0, Math.min(200, newSalary));
            if (role.baseSalary === boundedSalary) {
                _showToast('Salary is already ' + boundedSalary, 'info');
                return role;
            }

            var oldSalary = role.baseSalary;
            var result = RoleState._updateRole(roleId, { baseSalary: boundedSalary });

            if (result) {
                var reasonMsg = reason ? ' (' + reason + ')' : '';
                _logEvent('role', 'Salary Updated',
                    'Salary for ' + role.name + ' changed from ' + oldSalary + ' to ' + boundedSalary + reasonMsg,
                    []);
                _showToast('Salary for "' + role.name + '" updated to ' + boundedSalary + ' gold', 'success');

                if (typeof window.dispatchEvent === 'function') {
                    window.dispatchEvent(new CustomEvent('rolesUpdated', {}));
                }

                return result;
            }

            return null;

        } finally {
            _processingCommand = false;
        }
    }

    function updateRoleLiteracyRequirement(roleId, requiresLiteracy, literacyLevel, reason) {
        if (_processingCommand) {
            return null;
        }
        _processingCommand = true;

        try {
            var role = RoleState.getRole(roleId);
            if (!role) {
                _showToast('Role not found', 'error');
                return null;
            }

            requiresLiteracy = !!requiresLiteracy;
            var finalLevel = requiresLiteracy ? literacyLevel : null;

            if (requiresLiteracy && finalLevel) {
                var validLevels = ['basic', 'literate', 'educated', 'scholar'];
                if (validLevels.indexOf(finalLevel) === -1) {
                    _showToast('Invalid literacy level', 'error');
                    return null;
                }
            }

            if (role.requiresLiteracy === requiresLiteracy && role.literacyLevel === finalLevel) {
                _showToast('Literacy requirement is already set to this', 'info');
                return role;
            }

            var result = RoleState._updateRole(roleId, {
                requiresLiteracy: requiresLiteracy,
                literacyLevel: finalLevel
            });

            if (result) {
                var levelName = finalLevel ? window.LITERACY_LEVEL_NAMES?.[finalLevel] || finalLevel : 'None';
                var reasonMsg = reason ? ' (' + reason + ')' : '';
                _logEvent('role', 'Literacy Requirement Updated',
                    'Literacy requirement for ' + role.name + ' changed to ' +
                    (requiresLiteracy ? levelName : 'None') + reasonMsg,
                    []);
                _showToast('Literacy requirement for "' + role.name + '" updated to ' +
                    (requiresLiteracy ? levelName : 'None'), 'success');

                if (typeof window.dispatchEvent === 'function') {
                    window.dispatchEvent(new CustomEvent('rolesUpdated', {}));
                }

                return result;
            }

            return null;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 6. ROLE ASSIGNMENT
    // =========================================================================

    function assignRoleToCharacter(characterId, roleId, options) {
        if (_processingCommand) {
            return { success: false, reason: 'Already processing' };
        }
        _processingCommand = true;

        try {
            options = options || {};

            var character = _getCharacterById(characterId);
            var role = RoleState.getRole(roleId);

            if (!character) {
                return { success: false, reason: 'Character not found' };
            }

            if (!role) {
                return { success: false, reason: 'Role not found' };
            }

            if (character.isDeceased) {
                return { success: false, reason: 'Character is deceased' };
            }

            if (role.genderRestriction === 'male' && character.gender !== 'male') {
                return { success: false, reason: 'Role is restricted to males' };
            }

            if (role.genderRestriction === 'female' && character.gender !== 'female') {
                return { success: false, reason: 'Role is restricted to females' };
            }

            if (character.professions) {
                for (var i = 0; i < character.professions.length; i++) {
                    if (character.professions[i].id === roleId) {
                        return { success: false, reason: 'Character already has this role' };
                    }
                }
            }

            var skillLevel = options.skillLevel !== undefined ? options.skillLevel : 10;
            var startYear = options.startYear || _getCurrentYear();
            var notes = options.notes || 'Assigned ' + role.name;

            var result = _addProfession(characterId, roleId, {
                skillLevel: Math.min(100, Math.max(0, skillLevel)),
                startYear: startYear,
                primary: options.primary || false,
                notes: notes
            });

            if (result && result.success) {
                var updatedCharacter = _getCharacterById(characterId);
                if (updatedCharacter && updatedCharacter.professions) {
                    for (var j = 0; j < updatedCharacter.professions.length; j++) {
                        var prof = updatedCharacter.professions[j];
                        if (prof.id === roleId) {
                            if (prof.baseSalary === undefined || prof.baseSalary === null) {
                                prof.baseSalary = role.baseSalary || 10;
                            }
                            if (prof.customSalary === undefined) {
                                prof.customSalary = null;
                            }
                            if (!prof.salaryHistory) {
                                prof.salaryHistory = [];
                            }
                            if (prof.salaryLastCalculated === undefined) {
                                prof.salaryLastCalculated = null;
                            }
                            if (prof.paysSalary === undefined) {
                                prof.paysSalary = true;
                            }
                            break;
                        }
                    }
                    _saveMasterData();
                }

                _logEvent('role', 'Role Assigned',
                    character.name + ' assigned role: ' + role.name,
                    [character]);

                var salaryMsg = role.baseSalary > 0 ? ' (Base salary: ' + role.baseSalary + ' gold)' : '';
                _showToast(character.name + ' now has ' + role.name + salaryMsg, 'success');

                if (typeof window.dispatchEvent === 'function') {
                    window.dispatchEvent(new CustomEvent('rolesUpdated', {}));
                }

                return { success: true, character: character, role: role };
            }

            return { success: false, reason: result?.reason || 'Failed to assign role' };

        } finally {
            _processingCommand = false;
        }
    }

    function removeRoleFromCharacter(characterId, roleId) {
        if (_processingCommand) {
            return { success: false, reason: 'Already processing' };
        }
        _processingCommand = true;

        try {
            var character = _getCharacterById(characterId);
            var role = RoleState.getRole(roleId);

            if (!character) {
                return { success: false, reason: 'Character not found' };
            }

            if (!role) {
                return { success: false, reason: 'Role not found' };
            }

            if (!character.professions) {
                return { success: false, reason: 'Character has no roles' };
            }

            var index = -1;
            for (var i = 0; i < character.professions.length; i++) {
                if (character.professions[i].id === roleId) {
                    index = i;
                    break;
                }
            }

            if (index === -1) {
                return { success: false, reason: 'Character does not have this role' };
            }

            character.professions.splice(index, 1);

            _saveMasterData();

            _logEvent('role', 'Role Removed',
                character.name + ' removed role: ' + role.name,
                [character]);

            _showToast(character.name + ' no longer has ' + role.name, 'info');

            if (typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(new CustomEvent('rolesUpdated', {}));
            }

            return { success: true, character: character, role: role };

        } finally {
            _processingCommand = false;
        }
    }

    function updateCharacterSkill(characterId, roleId, skillLevel) {
        if (_processingCommand) {
            return { success: false, reason: 'Already processing' };
        }
        _processingCommand = true;

        try {
            var character = _getCharacterById(characterId);
            var role = RoleState.getRole(roleId);

            if (!character) {
                return { success: false, reason: 'Character not found' };
            }

            if (!role) {
                return { success: false, reason: 'Role not found' };
            }

            var boundedLevel = Math.min(100, Math.max(0, skillLevel));

            var result = _updateProfessionSkill(characterId, roleId, boundedLevel);

            if (result) {
                _showToast(character.name + '\'s ' + role.name + ' skill updated to ' + boundedLevel, 'success');

                if (typeof window.dispatchEvent === 'function') {
                    window.dispatchEvent(new CustomEvent('rolesUpdated', {}));
                }

                return { success: true, character: character, role: role, newLevel: boundedLevel };
            }

            return { success: false, reason: 'Failed to update skill' };

        } finally {
            _processingCommand = false;
        }
    }

    function bulkAssignRole(characterIds, roleId, options) {
        if (_processingCommand) {
            return { success: 0, failed: 0, errors: [] };
        }
        _processingCommand = true;

        try {
            options = options || {};
            var results = { success: 0, failed: 0, errors: [] };

            for (var i = 0; i < characterIds.length; i++) {
                var charId = characterIds[i];
                var result = assignRoleToCharacter(charId, roleId, options);

                if (result.success) {
                    results.success++;
                } else {
                    results.failed++;
                    results.errors.push({
                        characterId: charId,
                        reason: result.reason
                    });
                }
            }

            if (results.success > 0) {
                _showToast('Assigned role to ' + results.success + ' characters', 'success');
            }

            if (results.failed > 0) {
                _showToast(results.failed + ' assignments failed', 'warning');
            }

            return results;

        } finally {
            _processingCommand = false;
        }
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.RoleCommands = {
        createRole: createRole,
        updateRole: updateRole,
        deleteRole: deleteRole,
        setRoles: setRoles,

        addCategory: addCategory,
        updateCategory: updateCategory,
        deleteCategory: deleteCategory,

        assignRoleToCharacter: assignRoleToCharacter,
        removeRoleFromCharacter: removeRoleFromCharacter,
        updateCharacterSkill: updateCharacterSkill,
        bulkAssignRole: bulkAssignRole,

        updateRoleSalary: updateRoleSalary,
        updateRoleLiteracyRequirement: updateRoleLiteracyRequirement
    };

    // Legacy aliases
    window._createRole = createRole;
    window._updateRole = updateRole;
    window._deleteRole = deleteRole;
    window._setRoles = setRoles;
    window._addCategory = addCategory;
    window._updateCategory = updateCategory;
    window._deleteCategory = deleteCategory;
    window._assignRoleToCharacter = assignRoleToCharacter;
    window._removeRoleFromCharacter = removeRoleFromCharacter;
    window._updateCharacterSkill = updateCharacterSkill;
    window._bulkAssignRole = bulkAssignRole;
    window._updateRoleSalary = updateRoleSalary;
    window._updateRoleLiteracyRequirement = updateRoleLiteracyRequirement;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            createRole: createRole,
            updateRole: updateRole,
            deleteRole: deleteRole,
            setRoles: setRoles,
            addCategory: addCategory,
            updateCategory: updateCategory,
            deleteCategory: deleteCategory,
            assignRoleToCharacter: assignRoleToCharacter,
            removeRoleFromCharacter: removeRoleFromCharacter,
            updateCharacterSkill: updateCharacterSkill,
            bulkAssignRole: bulkAssignRole,
            updateRoleSalary: updateRoleSalary,
            updateRoleLiteracyRequirement: updateRoleLiteracyRequirement
        };
    }

})();