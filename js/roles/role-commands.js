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
 * DEPENDENCIES:
 *   - role-state.js (RoleState)
 *   - role-constants.js (UNCATEGORIZED_ID)
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

    // =========================================================================
    // 3. ROLE CRUD
    // =========================================================================

    /**
     * Creates a new role
     * @param {Object} data - Role data
     * @param {string} data.name - Role name (required)
     * @param {string} data.category - Category ID
     * @param {string} data.icon - Icon (monochrome)
     * @param {Array} data.specializations - Specializations
     * @param {string} data.notes - Notes
     * @param {string} data.genderRestriction - 'both', 'male', 'female'
     * @returns {Object|null} Created role or null
     */
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

            var newRole = {
                id: _generateId('role'),
                name: data.name.trim(),
                category: category,
                icon: data.icon || '◉',
                specializations: data.specializations || [],
                notes: data.notes || '',
                genderRestriction: data.genderRestriction || 'both'
            };

            var result = RoleState._addRole(newRole);

            _logEvent('role', 'Role Created', 'Created role: ' + newRole.name, []);

            _showToast('Role "' + newRole.name + '" created', 'success');

            if (typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(new CustomEvent('rolesUpdated', {}));
            }

            return result;

        } finally {
            _processingCommand = false;
        }
    }

    /**
     * Updates an existing role
     * @param {string} roleId - Role ID
     * @param {Object} updates - Updates to apply
     * @returns {Object|null} Updated role or null
     */
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

    /**
     * Deletes a role
     * @param {string} roleId - Role ID
     * @param {boolean} removeFromCharacters - Whether to remove from characters (default: true)
     * @returns {boolean} True if deleted
     */
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

    /**
     * Sets all roles (replaces the entire roles array)
     * @param {Array} roles - New roles array
     * @returns {boolean} True if set
     */
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

    /**
     * Adds a new category
     * @param {string} id - Category ID
     * @param {string} name - Category name
     * @param {string} icon - Category icon (monochrome)
     * @returns {boolean} True if added
     */
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

    /**
     * Updates an existing category
     * @param {string} id - Category ID
     * @param {Object} updates - Updates to apply
     * @param {string} updates.name - New name
     * @param {string} updates.icon - New icon
     * @returns {boolean} True if updated
     */
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

    /**
     * Deletes a category
     * @param {string} id - Category ID
     * @param {string} reassignTo - Category to reassign roles to (default: uncategorized)
     * @returns {boolean} True if deleted
     */
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

            // Reassign roles
            var roles = RoleState.getAllRoles();
            for (var i = 0; i < roles.length; i++) {
                if (roles[i].category === id) {
                    roles[i].category = reassignTo;
                }
            }

            // Delete category
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
    // 5. ROLE ASSIGNMENT
    // =========================================================================

    /**
     * Assigns a role to a character
     * @param {string} characterId - Character ID
     * @param {string} roleId - Role ID
     * @param {Object} options - Options
     * @param {number} options.skillLevel - Skill level (default: 10)
     * @param {number} options.startYear - Start year (default: current)
     * @param {string} options.notes - Notes
     * @param {boolean} options.primary - Whether this is the primary profession
     * @returns {Object} Result object
     */
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

            // Check gender restriction
            if (role.genderRestriction === 'male' && character.gender !== 'male') {
                return { success: false, reason: 'Role is restricted to males' };
            }

            if (role.genderRestriction === 'female' && character.gender !== 'female') {
                return { success: false, reason: 'Role is restricted to females' };
            }

            // Check if already has this role
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
                _logEvent('role', 'Role Assigned',
                    character.name + ' assigned role: ' + role.name,
                    [character]);

                _showToast(character.name + ' now has ' + role.name, 'success');

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

    /**
     * Removes a role from a character
     * @param {string} characterId - Character ID
     * @param {string} roleId - Role ID
     * @returns {Object} Result object
     */
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

    /**
     * Updates a character's skill level in a role
     * @param {string} characterId - Character ID
     * @param {string} roleId - Role ID
     * @param {number} skillLevel - New skill level (0-100)
     * @returns {Object} Result object
     */
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

    /**
     * Bulk assigns a role to multiple characters
     * @param {Array} characterIds - Array of character IDs
     * @param {string} roleId - Role ID
     * @param {Object} options - Options
     * @param {number} options.skillLevel - Skill level (default: 10)
     * @param {number} options.startYear - Start year (default: current)
     * @param {string} options.notes - Notes
     * @returns {Object} Result object with success and failure counts
     */
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
    // 6. EXPORTS
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
        bulkAssignRole: bulkAssignRole
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
            bulkAssignRole: bulkAssignRole
        };
    }

})();