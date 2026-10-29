/**
 * =============================================================================
 * STILL WATERS - ROLE COMMANDS (role-commands.js)
 * =============================================================================
 *
 * LOCATION: js/systems/roles/role-commands.js
 *
 * All write operations for the role domain.
 *
 * Contract:
 *   - Validates its inputs and returns structured results.
 *   - Delegates role-record mutation to RoleState.
 *   - Delegates character profession mutation to CharacterCommands.
 *   - Dispatches domain events via window.dispatchEvent for cross-domain
 *     subscribers (e.g. the apprenticeship domain listens for roleDeleted).
 *   - Contains NO UI concerns: no toasts, no DOM, no browser-specific events
 *     beyond a single CustomEvent dispatch.
 *
 * PERSISTENCE
 *
 *   Every mutation writes to masterData in memory and marks the data
 *   dirty via RoleState. Commands do NOT flush to localStorage. The
 *   caller is responsible for calling RoleCommands.persist() once per
 *   batch, after every command in the batch has succeeded.
 *
 *   RoleState owns the sync from in-memory state into masterData.data
 *   (roles and roleCategories) and the accessor-cache invalidation.
 *   persist() is the FLUSH: it drives the debounced save to run
 *   synchronously. persist() returns boolean; on false the caller can
 *   read window.getLastSaveError() for the underlying reason.
 *
 *   Batch callers (modal onConfirm, education graduation, annual
 *   pipeline) call persist() exactly once at the end. Single-operation
 *   callers may call persist() immediately after a successful command.
 *
 * SKILL PROGRESSION vs SKILL OVERRIDE
 *
 *   Two commands exist for writing character role skill:
 *
 *     updateCharacterSkill(cid, rid, level)
 *         Administrative override. Can raise OR lower. Blind write.
 *         Used by the role edit-skill modal.
 *
 *     recordCharacterSkillProgress(cid, rid, level)
 *         Domain progression. Can raise. Never lowers.
 *         If level <= current, succeeds with { unchanged: true }.
 *         Used by process paths (education, future systems).
 *
 *   The invariant: no progression system may reduce a character's
 *   canonical role skill. An administrator can, deliberately.
 *
 * BULK ASSIGN RESULT SHAPE
 *
 *   bulkAssignRole returns { success, assignedCount, failedCount, errors }.
 *   success is a BOOLEAN: true iff every requested character was assigned
 *   without error, false otherwise. assignedCount is the number of
 *   successful assignments; failedCount is the number of failures. errors
 *   is an array of { characterId, reason } entries.
 *
 *   Prior revisions returned { success: number, failed: number }. That
 *   shape collided with the boolean `success` convention used by every
 *   other command in the codebase (character, family, children,
 *   education), and a caller that wrote `if (!result.success)` behaved
 *   differently from one that wrote `if (result.success === true)`.
 *   The boolean form is unambiguous and matches character-creation-commands'
 *   bulkCreateCharacters convention.
 *
 * ROLE ASSIGNMENT PROVENANCE
 *
 *   assignRoleToCharacter accepts and forwards two provenance fields
 *   through to the character's profession record:
 *
 *     learnedVia      string   (e.g. 'institution', 'apprenticeship',
 *                              'self', 'family')
 *     institutionId   string   (the education institution, when learnedVia
 *                              is 'institution')
 *
 *   These are educational provenance, not role-domain policy. The role
 *   domain does not interpret them; it forwards them so the profession
 *   record can answer "where did this skill come from." Education's
 *   graduation path (education-commands.graduateStudent) depends on this
 *   forwarding. Prior revisions silently dropped both fields.
 *
 *   CharacterCommands.addProfession / updateProfession are the writers.
 *   They must accept and persist these fields on the profession record
 *   for the forwarding here to survive a save cycle.
 *
 * Reentrancy:
 *   There is no module-wide guard. Commands may call other commands
 *   freely because every operation is synchronous and side-effect
 *   explicit.
 *
 * Ownership:
 *   Roles belong to RoleState.
 *   Professions belong to CharacterCommands.
 *   Categories belong to RoleState.
 *   This module orchestrates those three domains; it never mutates
 *   another domain's state directly.
 *
 * DEPENDENCIES (must be loaded first):
 *   - role-constants.js
 *   - role-state.js
 *   - role-queries.js
 *   - character-commands.js  (CharacterCommands) — profession API only
 *   - accessors.js           (getCharacterById)
 *   - ids.js                 (generateId)
 *   - time.js                (getCurrentYear — required, no fallback)
 *   - storage.js             (saveMasterData, getLastSaveError — persist boundary only)
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - _getCurrentYear no longer falls back to 1250. time.js is required
 *       and the command throws if getCurrentYear is unavailable. The
 *       hardcoded fallback violated the core's explicit invariant
 *       (state.js: "no magic year 1250"; storage-schema.js: "No silent
 *       fallbacks to magic constants (e.g. year 1250)"). This was the only
 *       module in the tree that broke the invariant.
 *     - _validCategory now consults RoleState.getCategories() (which
 *       includes persisted custom categories), not only the static
 *       DEFAULT_ROLE_CATEGORIES. Prior revisions made it impossible to
 *       create a role in a custom category the user had just added via
 *       the category manager. RC.DEFAULT_ROLE_CATEGORIES is kept as a
 *       fallback for the (impossible in normal load order) case where
 *       RoleState is not yet loaded.
 *     - _assignRoleInternal now forwards options.learnedVia and
 *       options.institutionId to CC.addProfession and CC.updateProfession.
 *       Prior revisions silently dropped both, which meant education's
 *       graduation role grant lost its provenance. See ROLE ASSIGNMENT
 *       PROVENANCE in the header.
 *     - No other behavioural change.
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
    if (typeof window.getCharacterById !== 'function') {
        throw new Error(
            'role-commands.js requires accessors.js (getCharacterById).'
        );
    }
    if (typeof window.generateId !== 'function') {
        throw new Error(
            'role-commands.js requires ids.js (generateId).'
        );
    }
    // time.js is required — no 1250 fallback. See REFACTOR HISTORY.
    if (typeof window.getCurrentYear !== 'function') {
        throw new Error(
            'role-commands.js requires time.js (getCurrentYear). ' +
            'There is no fallback year; the role domain does not guess ' +
            'the current year on time.js behalf.'
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
    // 3. PERSISTENCE
    // =========================================================================

    /**
     * Forces a synchronous flush of masterData to storage.
     *
     * The only call site of saveMasterData in this domain. Every command
     * has already mutated in-memory state and called markDataDirty via
     * RoleState. persist() is the caller's explicit "I am done; write it
     * out" signal.
     *
     * Returns { success: true } on success. Returns { success: false,
     * reason } on failure; the underlying error (if any) is also
     * available via window.getLastSaveError().
     */
    function persist() {
        if (typeof window.saveMasterData !== 'function') {
            return _fail('saveMasterData is not available.');
        }
        try {
            var ok = window.saveMasterData();
            if (ok === true) return _ok();
            var reason = 'saveMasterData returned false';
            if (typeof window.getLastSaveError === 'function') {
                var err = window.getLastSaveError();
                if (err && err.message) reason = err.message;
            }
            return _fail(reason);
        } catch (e) {
            return _fail(e && e.message ? e.message : 'saveMasterData threw');
        }
    }

    // =========================================================================
    // 4. NOTIFICATION
    // =========================================================================

    function _notify(eventName, detail) {
        if (typeof window.dispatchEvent !== 'function') return;
        if (typeof window.CustomEvent !== 'function') return;
        try {
            window.dispatchEvent(new CustomEvent(eventName, { detail: detail || {} }));
        } catch (err) {
            if (window.console && typeof window.console.error === 'function') {
                window.console.error(
                    'role-commands: event "' + eventName + '" dispatch failed:', err
                );
            }
        }
    }

    // =========================================================================
    // 5. INPUT VALIDATION
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

    /**
     * Validates a category id.
     *
     * Consults RoleState.getCategories() first — that is the authoritative
     * list, and it includes custom categories the user has added via the
     * category manager (persisted in masterData.data.roleCategories).
     * Prior revisions validated only against RC.DEFAULT_ROLE_CATEGORIES,
     * which made every custom category unusable for new roles.
     *
     * RC.DEFAULT_ROLE_CATEGORIES is kept as a fallback for the (impossible
     * under the documented load order) case where RoleState has not been
     * initialised. The uncategorized bucket is always valid.
     */
    function _validCategory(v) {
        if (!_validString(v)) return false;
        if (v === RC.UNCATEGORIZED_ID) return true;

        if (window.RoleState && typeof window.RoleState.getCategories === 'function') {
            try {
                var live = window.RoleState.getCategories();
                if (live && Object.prototype.hasOwnProperty.call(live, v)) {
                    return true;
                }
            } catch (e) {
                // RoleState.getCategories throws if init() hasn't run.
                // Fall through to the static defaults.
            }
        }

        return Object.prototype.hasOwnProperty.call(RC.DEFAULT_ROLE_CATEGORIES, v);
    }

    /**
     * Required. There is no fallback year. See REFACTOR HISTORY and the
     * dependency check at the top of the file.
     */
    function _getCurrentYear() {
        return window.getCurrentYear();
    }

    // =========================================================================
    // 6. ROLE CRUD
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
            id: window.generateId('role'),
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

        _notify('roleCreated', { roleId: role.id, roleName: role.name });
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

        _notify('roleUpdated', { roleId: roleId, roleName: updated.name });
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

        _notify('roleDeleted', { roleId: roleId, roleName: role.name });

        return _ok({ roleName: role.name, removedFromCharacters: reassignedCount });
    }

    function setRoles(roles) {
        if (!Array.isArray(roles)) {
            return _fail('Roles must be an array.');
        }

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

        _notify('rolesSet', { count: validated.length });
        return _ok({ count: validated.length });
    }

    // =========================================================================
    // 7. CATEGORY MANAGEMENT
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

        _notify('categoryAdded', { id: id, name: name.trim() });
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

        _notify('categoryUpdated', { id: id });
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

        _notify('categoryDeleted', { id: id });
        return _ok({ id: id });
    }

    // =========================================================================
    // 8. SPECIALIZATION MANAGEMENT (role-level catalogue)
    // =========================================================================

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

        _notify('roleSpecializationAdded', { roleId: roleId, specialization: spec });
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

        _notify('roleSpecializationRemoved', { roleId: roleId, specialization: specialization });
        return _ok({ role: updated });
    }

    // =========================================================================
    // 9. ROLE ASSIGNMENT
    // =========================================================================

    /**
     * Extracts the provenance fields that should be forwarded to the
     * character's profession record. Returns only the fields the caller
     * explicitly supplied; missing fields are omitted so the underlying
     * writer can use its own defaults.
     *
     * See ROLE ASSIGNMENT PROVENANCE in the header.
     */
    function _provenanceFields(options) {
        var out = {};
        if (!options || typeof options !== 'object') return out;
        if (typeof options.learnedVia === 'string' && options.learnedVia.length > 0) {
            out.learnedVia = options.learnedVia;
        }
        if (typeof options.institutionId === 'string' && options.institutionId.length > 0) {
            out.institutionId = options.institutionId;
        }
        return out;
    }

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
        if (startYear === null) {
            startYear = _getCurrentYear();
        }

        var provenance = _provenanceFields(options);
        var existing = CC.getProfession(characterId, role.id);

        if (existing) {
            var updatePayload = {
                skillLevel: skillLevel,
                startYear: startYear !== null ? startYear : existing.startYear,
                notes: options.notes !== undefined ? options.notes : existing.notes,
                primary: options.primary !== undefined ? options.primary : existing.primary
            };
            // Provenance forwarding. See ROLE ASSIGNMENT PROVENANCE.
            if (provenance.learnedVia !== undefined) {
                updatePayload.learnedVia = provenance.learnedVia;
            }
            if (provenance.institutionId !== undefined) {
                updatePayload.institutionId = provenance.institutionId;
            }

            var updateResult = CC.updateProfession(characterId, role.id, updatePayload);
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

        var addPayload = {
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
        };
        // Provenance forwarding. See ROLE ASSIGNMENT PROVENANCE.
        if (provenance.learnedVia !== undefined) {
            addPayload.learnedVia = provenance.learnedVia;
        }
        if (provenance.institutionId !== undefined) {
            addPayload.institutionId = provenance.institutionId;
        }

        var addResult = CC.addProfession(characterId, addPayload);

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

        var result = _assignRoleInternal(characterId, role, options);
        if (result.success) {
            _notify('roleAssigned', {
                characterId: characterId,
                roleId: roleId,
                wasUpdate: result.wasUpdate
            });
        }
        return result;
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

        _notify('roleRemoved', { characterId: characterId, roleId: roleId });
        return _ok({ characterId: characterId, roleId: roleId });
    }

    /**
     * Administrative override. Can raise OR lower skill. Blind write.
     */
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

        _notify('characterSkillUpdated', {
            characterId: characterId,
            roleId: roleId,
            skillLevel: skillLevel,
            mode: 'override'
        });
        return _ok({ characterId: characterId, roleId: roleId, skillLevel: skillLevel });
    }

    /**
     * Domain progression. Can raise skill. Never lowers it.
     */
    function recordCharacterSkillProgress(characterId, roleId, skillLevel) {
        if (!_validString(characterId)) return _fail('Character id is required.');
        if (!_validString(roleId)) return _fail('Role id is required.');
        if (!_validSkillLevel(skillLevel)) {
            return _fail('Skill level must be a number between 0 and 100.');
        }

        var role = RS.getRole(roleId);
        if (!role) return _fail('Role not found.');

        var existing = CC.getProfession(characterId, roleId);
        if (!existing) {
            return _fail('Character does not hold this role. ' +
                'Assign the role before recording progression.');
        }

        var currentSkill = typeof existing.skillLevel === 'number'
            ? existing.skillLevel
            : 0;

        if (skillLevel <= currentSkill) {
            return _ok({
                characterId: characterId,
                roleId: roleId,
                skillLevel: currentSkill,
                requestedSkill: skillLevel,
                unchanged: true
            });
        }

        var result = CC.updateProfession(characterId, roleId, { skillLevel: skillLevel });
        if (!result || result.success !== true) {
            return _fail(result && result.reason
                ? result.reason
                : 'Failed to record skill progression.');
        }

        _notify('characterSkillProgressed', {
            characterId: characterId,
            roleId: roleId,
            previousSkill: currentSkill,
            skillLevel: skillLevel,
            delta: skillLevel - currentSkill
        });

        return _ok({
            characterId: characterId,
            roleId: roleId,
            skillLevel: skillLevel,
            previousSkill: currentSkill,
            delta: skillLevel - currentSkill,
            unchanged: false
        });
    }

    /**
     * Bulk role assignment.
     *
     * Returns { success, assignedCount, failedCount, errors }.
     *
     * success is a BOOLEAN: true iff every requested character was
     * assigned without error. assignedCount is the number of successful
     * assignments; failedCount is the number of failures. errors is an
     * array of { characterId, reason }.
     *
     * The boolean form matches character-creation-commands.bulkCreateCharacters
     * and every single-command result in the codebase. The prior
     * `{ success: number, failed: number }` shape collided with the
     * boolean `success` convention.
     */
    function bulkAssignRole(characterIds, roleId, options) {
        if (!Array.isArray(characterIds)) {
            return {
                success: false,
                assignedCount: 0,
                failedCount: 0,
                errors: [{ reason: 'characterIds must be an array' }]
            };
        }
        if (!_validString(roleId)) {
            return {
                success: false,
                assignedCount: 0,
                failedCount: 0,
                errors: [{ reason: 'Role id is required' }]
            };
        }

        var role = RS.getRole(roleId);
        if (!role) {
            return {
                success: false,
                assignedCount: 0,
                failedCount: 0,
                errors: [{ reason: 'Role not found' }]
            };
        }

        var assignedCount = 0;
        var failedCount = 0;
        var errors = [];

        for (var i = 0; i < characterIds.length; i++) {
            var characterId = characterIds[i];
            var result = _assignRoleInternal(characterId, role, options);
            if (result.success) {
                assignedCount++;
            } else {
                failedCount++;
                errors.push({ characterId: characterId, reason: result.reason });
            }
        }

        if (assignedCount > 0) {
            _notify('rolesBulkAssigned', {
                roleId: roleId,
                assignedCount: assignedCount,
                failedCount: failedCount
            });
        }

        return {
            success: failedCount === 0,
            assignedCount: assignedCount,
            failedCount: failedCount,
            errors: errors
        };
    }

    // =========================================================================
    // 10. SALARY MANAGEMENT
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

        _notify('roleSalaryUpdated', {
            roleId: roleId,
            previousSalary: role.baseSalary,
            newSalary: newSalary
        });

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

        _notify('roleLiteracyUpdated', {
            roleId: roleId,
            requiresLiteracy: requires,
            literacyLevel: level
        });

        return _ok({
            role: updated,
            previousRequiresLiteracy: role.requiresLiteracy,
            previousLiteracyLevel: role.literacyLevel,
            reason: reason || null
        });
    }

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.RoleCommands = {
        // Persistence
        persist: persist,

        // Role CRUD
        createRole: createRole,
        updateRole: updateRole,
        deleteRole: deleteRole,
        setRoles: setRoles,

        // Categories
        addCategory: addCategory,
        updateCategory: updateCategory,
        deleteCategory: deleteCategory,

        // Specializations (role catalogue)
        addRoleSpecialization: addRoleSpecialization,
        removeRoleSpecialization: removeRoleSpecialization,

        // Assignment
        assignRoleToCharacter: assignRoleToCharacter,
        removeRoleFromCharacter: removeRoleFromCharacter,

        // Skill writes
        updateCharacterSkill: updateCharacterSkill,                     // override
        recordCharacterSkillProgress: recordCharacterSkillProgress,     // progression

        bulkAssignRole: bulkAssignRole,

        // Salary / literacy
        updateRoleSalary: updateRoleSalary,
        updateRoleLiteracyRequirement: updateRoleLiteracyRequirement
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.RoleCommands;
    }
})();
