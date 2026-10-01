/**
 * =============================================================================
 * STILL WATERS - ROLE COMMANDS (role-commands.js)
 * =============================================================================
 *
 * All write operations for the role domain.
 *
 * Contract:
 *   - Validates its inputs and returns structured results.
 *   - Delegates role-record mutation to RoleState.
 *   - Delegates character profession mutation to CharacterCommands.
 *   - Emits domain events via RoleEvents (see below), never directly.
 *   - Contains NO UI concerns: no toasts, no DOM, no browser events.
 *
 * Reentrancy:
 *   There is no module-wide guard. Commands may call other commands freely
 *   because every operation is synchronous and side-effect explicit. A guard
 *   that suppressed composition is what broke bulkAssignRole in the old code.
 *
 * Ownership:
 *   Roles belong to RoleState.
 *   Professions belong to CharacterCommands.
 *   Categories belong to RoleState.
 *   This module orchestrates those three domains; it never mutates another
 *   domain's state directly.
 *
 * DEPENDENCIES (must be loaded first):
 *   - role-constants.js
 *   - role-state.js
 *   - role-queries.js
 *   - character-commands.js  (CharacterCommands) — profession API only
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HARD DEPENDENCY CHECK
    // =========================================================================

    if (!window.RoleConstants) {
        throw new Error('role-commands.js requires role-constants.js first.');
    }
    if (!window.RoleState) {
        throw new Error('role-commands.js requires role-state.js first.');
    }
    if (!window.RoleQueries) {
        throw new Error('role-commands.js requires role-queries.js first.');
    }
    if (!window.CharacterCommands) {
        throw new Error(
            'role-commands.js requires character-commands.js (CharacterCommands) first.'
        );
    }

    var requiredCharacterMethods = [
        'addProfession',
        'updateProfession',
        'removeProfession',
        'removeProfessionFromAll',
        'getProfession'
    ];
    for (var _m = 0; _m < requiredCharacterMethods.length; _m++) {
        var _name = requiredCharacterMethods[_m];
        if (typeof window.CharacterCommands[_name] !== 'function') {
            throw new Error(
                'role-commands.js: CharacterCommands.' + _name +
                ' is required. Extend character-commands.js to expose the ' +
                'profession API before loading this module.'
            );
        }
    }

    var RC = window.RoleConstants;
    var RS = window.RoleState;
    var RQ = window.RoleQueries;
    var CC = window.CharacterCommands;

    // =========================================================================
    // 2. RESULT HELPERS
    // =========================================================================

    function _ok(data) {
        var result = { success: true };
        if (data) {
            for (var key in data) {
                if (Object.prototype.hasOwnProperty.call(data, key)) {
                    result[key] = data[key];
                }
            }
        }
        return result;
    }

    function _fail(reason) {
        return { success: false, reason: reason };
    }

    // =========================================================================
    // 3. INPUT VALIDATION
    // =========================================================================

    function _validString(v) {
        return typeof v === 'string' && v.trim() !== '';
    }

    function _validSalary(v) {
        if (typeof v !== 'number' || !Number.isFinite(v)) return false;
        if (v < RC.MIN_SALARY) return false;
        if (v > RC.MAX_SALARY) return false;
        return true;
    }

    function _validSkillLevel(v) {
        if (typeof v !== 'number' || !Number.isFinite(v)) return false;
        if (v < 0 || v > 100) return false;
        return true;
    }

    function _validLiteracyLevel(v) {
        return RC.REQUIRABLE_LITERACY_LEVELS.indexOf(v) !== -1;
    }

    function _validGenderRestriction(v) {
        return v === 'both' || v === 'male' || v === 'female';
    }

    function _validCategory(v) {
        if (v === RC.UNCATEGORIZED_ID) return true;
        return Object.prototype.hasOwnProperty.call(RC.DEFAULT_ROLE_CATEGORIES, v);
    }

    // =========================================================================
    // 4. ROLE CRUD
    // =========================================================================

    function createRole(data) {
        if (!data || typeof data !== 'object') {
            return _fail('Role data is required.');
        }

        if (!_validString(data.name)) {
            return _fail('Role name is required.');
        }

        var category = data.category || RC.UNCATEGORIZED_ID;
        if (!_validCategory(category)) {
            return _fail('Invalid category: ' + category);
        }

        var gender = data.genderRestriction || 'both';
        if (!_validGenderRestriction(gender)) {
            return _fail('Invalid gender restriction.');
        }

        var baseSalary = data.baseSalary;
        if (baseSalary === undefined || baseSalary === null) {
            baseSalary = RC.BASE_SALARY_BY_CATEGORY[category];
            if (typeof baseSalary !== 'number') baseSalary = RC.DEFAULT_SALARY;
        }
        if (!_validSalary(baseSalary)) {
            return _fail('Base salary must be a number between ' +
                RC.MIN_SALARY + ' and ' + RC.MAX_SALARY + '.');
        }

        var requiresLiteracy = data.requiresLiteracy === true;
        var literacyLevel = null;
        if (requiresLiteracy) {
            if (!_validLiteracyLevel(data.literacyLevel)) {
                return _fail('A valid literacy level is required when literacy is required.');
            }
            literacyLevel = data.literacyLevel;
        }

        var specializations = [];
        if (Array.isArray(data.specializations)) {
            for (var i = 0; i < data.specializations.length; i++) {
                var spec = data.specializations[i];
                if (_validString(spec) && specializations.indexOf(spec.trim()) === -1) {
                    specializations.push(spec.trim());
                }
            }
        }

        var icon = _validString(data.icon) ? data.icon : 'CIRCLE';

        var role = RS.addRole({
            id: window.generateId ? window.generateId('role')
                : 'role_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            name: data.name.trim(),
            category: category,
            icon: icon,
            specializations: specializations,
            notes: _validString(data.notes) ? data.notes : '',
            genderRestriction: gender,
            baseSalary: baseSalary,
            requiresLiteracy: requiresLiteracy,
            literacyLevel: literacyLevel
        });

        return _ok({ role: role });
    }

    function updateRole(roleId, updates) {
        if (!_validString(roleId)) {
            return _fail('Role id is required.');
        }

        var current = RS.getRole(roleId);
        if (!current) {
            return _fail('Role not found.');
        }

        if (!updates || typeof updates !== 'object') {
            return _fail('Updates object is required.');
        }

        var patch = {};

        if (updates.name !== undefined) {
            if (!_validString(updates.name)) {
                return _fail('Role name cannot be empty.');
            }
            patch.name = updates.name.trim();
        }

        if (updates.category !== undefined) {
            if (!_validCategory(updates.category)) {
                return _fail('Invalid category: ' + updates.category);
            }
            patch.category = updates.category;
        }

        if (updates.genderRestriction !== undefined) {
            if (!_validGenderRestriction(updates.genderRestriction)) {
                return _fail('Invalid gender restriction.');
            }
            patch.genderRestriction = updates.genderRestriction;
        }

        if (updates.icon !== undefined) {
            if (!_validString(updates.icon)) {
                return _fail('Icon must be a non-empty string.');
            }
            patch.icon = updates.icon;
        }

        if (updates.baseSalary !== undefined) {
            if (!_validSalary(updates.baseSalary)) {
                return _fail('Base salary must be a number between ' +
                    RC.MIN_SALARY + ' and ' + RC.MAX_SALARY + '.');
            }
            patch.baseSalary = updates.baseSalary;
        }

        if (updates.notes !== undefined) {
            patch.notes = typeof updates.notes === 'string' ? updates.notes : '';
        }

        if (updates.specializations !== undefined) {
            if (!Array.isArray(updates.specializations)) {
                return _fail('Specializations must be an array.');
            }
            var cleaned = [];
            for (var i = 0; i < updates.specializations.length; i++) {
                var s = updates.specializations[i];
                if (_validString(s) && cleaned.indexOf(s.trim()) === -1) {
                    cleaned.push(s.trim());
                }
            }
            patch.specializations = cleaned;
        }

        // Literacy invariant: requiresLiteracy === false → literacyLevel === null
        var requiresLiteracy = updates.requiresLiteracy !== undefined
            ? updates.requiresLiteracy === true
            : current.requiresLiteracy;

        if (updates.requiresLiteracy !== undefined || updates.literacyLevel !== undefined) {
            if (requiresLiteracy) {
                var level = updates.literacyLevel !== undefined
                    ? updates.literacyLevel
                    : current.literacyLevel;
                if (!_validLiteracyLevel(level)) {
                    return _fail('A valid literacy level is required when literacy is required.');
                }
                patch.requiresLiteracy = true;
                patch.literacyLevel = level;
            } else {
                patch.requiresLiteracy = false;
                patch.literacyLevel = null;
            }
        }

        var updated = RS.updateRole(roleId, patch);
        if (!updated) {
            return _fail('Failed to update role.');
        }
        return _ok({ role: updated });
    }

    function deleteRole(roleId, options) {
        options = options || {};
        var removeFromCharacters = options.removeAssignments !== false;

        if (!_validString(roleId)) {
            return _fail('Role id is required.');
        }

        var role = RS.getRole(roleId);
        if (!role) {
            return _fail('Role not found.');
        }

        var reassignedCount = 0;
        if (removeFromCharacters) {
            var result = CC.removeProfessionFromAll(roleId);
            if (!result || result.success !== true) {
                return _fail('Failed to remove role from characters: ' +
                    (result && result.reason ? result.reason : 'unknown error'));
            }
            reassignedCount = result.removedCount || 0;
        }

        var deleted = RS.deleteRole(roleId);
        if (!deleted) {
            return _fail('Failed to delete role from state.');
        }

        return _ok({ roleName: role.name, removedFromCharacters: reassignedCount });
    }

    // =========================================================================
    // 5. CATEGORY MANAGEMENT
    // =========================================================================

    function addCategory(id, name) {
        if (!_validString(id)) return _fail('Category id is required.');
        if (!_validString(name)) return _fail('Category name is required.');

        if (RS.getCategories()[id]) {
            return _fail('Category already exists.');
        }

        try {
            RS.addCategory(id, name.trim());
        } catch (err) {
            return _fail(err.message);
        }
        return _ok({ id: id, name: name.trim() });
    }

    function updateCategory(id, updates) {
        if (!_validString(id)) return _fail('Category id is required.');
        if (!updates || typeof updates !== 'object') {
            return _fail('Updates object is required.');
        }
        if (updates.name !== undefined && !_validString(updates.name)) {
            return _fail('Category name cannot be empty.');
        }

        var patch = {};
        if (updates.name !== undefined) patch.name = updates.name.trim();

        var ok = RS.updateCategory(id, patch);
        if (!ok) return _fail('Category not found.');
        return _ok({ id: id });
    }

    function deleteCategory(id) {
        if (!_validString(id)) return _fail('Category id is required.');
        if (id === RC.UNCATEGORIZED_ID) {
            return _fail('Cannot delete the uncategorized category.');
        }

        try {
            RS.deleteCategory(id);
        } catch (err) {
            return _fail(err.message);
        }
        return _ok({ id: id });
    }

    // =========================================================================
    // 6. SPECIALIZATION MANAGEMENT
    // =========================================================================
    //
    // Specializations are role-level metadata. They live on the role record in
    // RoleState. Character professions carry their own per-character `specs`
    // array and are managed by the character domain.

    function addRoleSpecialization(roleId, specialization) {
        if (!_validString(roleId)) return _fail('Role id is required.');
        if (!_validString(specialization)) return _fail('Specialization is required.');

        var role = RS.getRole(roleId);
        if (!role) return _fail('Role not found.');

        var spec = specialization.trim();
        var existing = Array.isArray(role.specializations)
            ? role.specializations.slice()
            : [];

        if (existing.indexOf(spec) !== -1) {
            return _fail('Specialization already exists on this role.');
        }

        existing.push(spec);
        var updated = RS.updateRole(roleId, { specializations: existing });
        if (!updated) return _fail('Failed to add specialization.');

        return _ok({ role: updated, specialization: spec });
    }

    function removeRoleSpecialization(roleId, specialization) {
        if (!_validString(roleId)) return _fail('Role id is required.');
        if (!_validString(specialization)) return _fail('Specialization is required.');

        var role = RS.getRole(roleId);
        if (!role) return _fail('Role not found.');

        var existing = Array.isArray(role.specializations)
            ? role.specializations.slice()
            : [];

        var idx = existing.indexOf(specialization);
        if (idx === -1) return _fail('Specialization not found on this role.');

        existing.splice(idx, 1);
        var updated = RS.updateRole(roleId, { specializations: existing });
        if (!updated) return _fail('Failed to remove specialization.');

        return _ok({ role: updated });
    }

    // =========================================================================
    // 7. ROLE ASSIGNMENT
    // =========================================================================

    /**
     * Internal, unguarded assignment. Safe to call from any command that
     * already holds the role/character references.
     */
    function _assignRoleInternal(characterId, role, options) {
        options = options || {};

        var character = window.getCharacterById(characterId);
        if (!character) return _fail('Character not found.');
        if (character.isDeceased) return _fail('Character is deceased.');

        if (role.genderRestriction === 'male' && character.gender !== 'male') {
            return _fail('Role is restricted to males.');
        }
        if (role.genderRestriction === 'female' && character.gender !== 'female') {
            return _fail('Role is restricted to females.');
        }

        var skillLevel = options.skillLevel !== undefined ? options.skillLevel : 10;
        if (!_validSkillLevel(skillLevel)) {
            return _fail('Skill level must be a number between 0 and 100.');
        }

        var startYear = options.startYear !== undefined ? options.startYear : null;
        if (startYear !== null && (typeof startYear !== 'number' || !Number.isFinite(startYear))) {
            return _fail('startYear must be a number or omitted.');
        }
        if (startYear === null && typeof window.getCurrentYearSafe === 'function') {
            startYear = window.getCurrentYearSafe();
        }

        var existing = CC.getProfession(characterId, role.id);

        if (existing) {
            // Update the existing profession rather than duplicating.
            var updateResult = CC.updateProfession(characterId, role.id, {
                skillLevel: skillLevel,
                startYear: startYear !== null ? startYear : existing.startYear,
                notes: options.notes !== undefined ? options.notes : existing.notes,
                primary: options.primary !== undefined ? options.primary : existing.primary
            });
            if (!updateResult || updateResult.success !== true) {
                return _fail(updateResult && updateResult.reason
                    ? updateResult.reason
                    : 'Failed to update existing profession.');
            }
            return _ok({
                character: character,
                role: role,
                wasUpdate: true
            });
        }

        var addResult = CC.addProfession(characterId, {
            id: role.id,
            name: role.name,
            skillLevel: skillLevel,
            startYear: startYear,
            primary: options.primary === true,
            notes: options.notes !== undefined
                ? options.notes
                : 'Assigned ' + role.name,
            specs: [],
            baseSalary: role.baseSalary,
            customSalary: null,
            salaryHistory: [],
            salaryLastCalculated: null,
            paysSalary: true
        });

        if (!addResult || addResult.success !== true) {
            return _fail(addResult && addResult.reason
                ? addResult.reason
                : 'Failed to add profession.');
        }

        return _ok({
            character: character,
            role: role,
            wasUpdate: false
        });
    }

    function assignRoleToCharacter(characterId, roleId, options) {
        if (!_validString(characterId)) return _fail('Character id is required.');
        if (!_validString(roleId)) return _fail('Role id is required.');

        var role = RS.getRole(roleId);
        if (!role) return _fail('Role not found.');

        return _assignRoleInternal(characterId, role, options);
    }

    function removeRoleFromCharacter(characterId, roleId) {
        if (!_validString(characterId)) return _fail('Character id is required.');
        if (!_validString(roleId)) return _fail('Role id is required.');

        var role = RS.getRole(roleId);
        if (!role) return _fail('Role not found.');

        var result = CC.removeProfession(characterId, roleId);
        if (!result || result.success !== true) {
            return _fail(result && result.reason ? result.reason : 'Failed to remove role.');
        }
        return _ok({ characterId: characterId, roleId: roleId });
    }

    function updateCharacterSkill(characterId, roleId, skillLevel) {
        if (!_validString(characterId)) return _fail('Character id is required.');
        if (!_validString(roleId)) return _fail('Role id is required.');
        if (!_validSkillLevel(skillLevel)) {
            return _fail('Skill level must be a number between 0 and 100.');
        }

        var role = RS.getRole(roleId);
        if (!role) return _fail('Role not found.');

        var result = CC.updateProfession(characterId, roleId, { skillLevel: skillLevel });
        if (!result || result.success !== true) {
            return _fail(result && result.reason ? result.reason : 'Failed to update skill.');
        }
        return _ok({ characterId: characterId, roleId: roleId, skillLevel: skillLevel });
    }

    /**
     * Assigns a role to many characters.
     *
     * This is the exact call that broke in the old implementation because a
     * module-wide reentrancy guard blocked the nested calls. Here the loop
     * calls _assignRoleInternal directly, so composition works.
     */
    function bulkAssignRole(characterIds, roleId, options) {
        if (!Array.isArray(characterIds)) {
            return { success: 0, failed: 0, errors: [{ reason: 'characterIds must be an array' }] };
        }
        if (!_validString(roleId)) {
            return { success: 0, failed: 0, errors: [{ reason: 'Role id is required' }] };
        }

        var role = RS.getRole(roleId);
        if (!role) {
            return { success: 0, failed: 0, errors: [{ reason: 'Role not found' }] };
        }

        var successCount = 0;
        var failedCount = 0;
        var errors = [];

        for (var i = 0; i < characterIds.length; i++) {
            var characterId = characterIds[i];
            var result = _assignRoleInternal(characterId, role, options);
            if (result.success) {
                successCount++;
            } else {
                failedCount++;
                errors.push({ characterId: characterId, reason: result.reason });
            }
        }

        return { success: successCount, failed: failedCount, errors: errors };
    }

    // =========================================================================
    // 8. SALARY MANAGEMENT
    // =========================================================================

    function updateRoleSalary(roleId, newSalary, reason) {
        if (!_validString(roleId)) return _fail('Role id is required.');
        if (!_validSalary(newSalary)) {
            return _fail('Salary must be a number between ' +
                RC.MIN_SALARY + ' and ' + RC.MAX_SALARY + '.');
        }

        var role = RS.getRole(roleId);
        if (!role) return _fail('Role not found.');

        if (role.baseSalary === newSalary) {
            return _ok({ role: role, unchanged: true });
        }

        var updated = RS.updateRole(roleId, { baseSalary: newSalary });
        if (!updated) return _fail('Failed to update salary.');

        return _ok({
            role: updated,
            previousSalary: role.baseSalary,
            reason: reason || null
        });
    }

    function updateRoleLiteracyRequirement(roleId, requiresLiteracy, literacyLevel, reason) {
        if (!_validString(roleId)) return _fail('Role id is required.');

        var role = RS.getRole(roleId);
        if (!role) return _fail('Role not found.');

        var requires = requiresLiteracy === true;
        var level = null;
        if (requires) {
            if (!_validLiteracyLevel(literacyLevel)) {
                return _fail('A valid literacy level is required when literacy is required.');
            }
            level = literacyLevel;
        }

        if (role.requiresLiteracy === requires && role.literacyLevel === level) {
            return _ok({ role: role, unchanged: true });
        }

        var updated = RS.updateRole(roleId, {
            requiresLiteracy: requires,
            literacyLevel: level
        });
        if (!updated) return _fail('Failed to update literacy requirement.');

        return _ok({
            role: updated,
            previousRequiresLiteracy: role.requiresLiteracy,
            previousLiteracyLevel: role.literacyLevel,
            reason: reason || null
        });
    }

    // =========================================================================
    // 9. BULK / SET ROLES
    // =========================================================================

    function setRoles(roles) {
        if (!Array.isArray(roles)) {
            return _fail('Roles must be an array.');
        }

        // Validate every entry first; commit only if all are valid.
        var validated = [];
        for (var i = 0; i < roles.length; i++) {
            var r = roles[i];
            if (!r || typeof r !== 'object') {
                return _fail('Role at index ' + i + ' is not an object.');
            }
            if (!_validString(r.id)) {
                return _fail('Role at index ' + i + ' is missing an id.');
            }
            if (!_validString(r.name)) {
                return _fail('Role at index ' + i + ' is missing a name.');
            }
            if (r.category !== undefined && !_validCategory(r.category)) {
                return _fail('Role at index ' + i + ' has invalid category: ' + r.category);
            }
            validated.push(r);
        }

        try {
            RS.setRoles(validated);
        } catch (err) {
            return _fail(err.message);
        }
        return _ok({ count: validated.length });
    }

    // =========================================================================
    // 10. EXPORTS
    // =========================================================================

    window.RoleCommands = {
        // Role CRUD
        createRole: createRole,
        updateRole: updateRole,
        deleteRole: deleteRole,
        setRoles: setRoles,

        // Categories
        addCategory: addCategory,
        updateCategory: updateCategory,
        deleteCategory: deleteCategory,

        // Specializations
        addRoleSpecialization: addRoleSpecialization,
        removeRoleSpecialization: removeRoleSpecialization,

        // Assignment
        assignRoleToCharacter: assignRoleToCharacter,
        removeRoleFromCharacter: removeRoleFromCharacter,
        updateCharacterSkill: updateCharacterSkill,
        bulkAssignRole: bulkAssignRole,

        // Salary / literacy
        updateRoleSalary: updateRoleSalary,
        updateRoleLiteracyRequirement: updateRoleLiteracyRequirement
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.RoleCommands;
    }
})();
