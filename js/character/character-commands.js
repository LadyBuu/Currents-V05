/**
 * =============================================================================
 * STILL WATERS - CHARACTER COMMANDS (js/character/character-commands.js)
 * =============================================================================
 *
 * Mutation boundary for the character domain.
 *
 * SCOPE:
 *   - Character-owned field updates (name, gender, birthYear, isDeceased,
 *     location, household, religionId, cultureId, appearance, notes, etc.)
 *   - Profession array management on the character record
 *     (add / update / remove / remove-from-all / lookup)
 *
 * OUT OF SCOPE:
 *   - Profession semantic rules (skill tiers, teaching thresholds, salary
 *     policy) → SkillUtils / RoleConstants / RoleRules
 *   - Role catalogue CRUD → RoleCommands / RoleState
 *   - Family graph mutations → FamilyCommands
 *   - Relationship / friendship / apprenticeship mutations → their own
 *     domain Commands
 *   - Persistence mechanics → CharacterState (via markDataDirty / storage)
 *   - Cross-domain events, toasts, activity log → caller
 *
 * OWNERSHIP:
 *   CharacterCommands owns `character.professions` as the sole writer.
 *   No other module may push to, splice, or reassign that array.
 *   RoleCommands orchestrates assignment decisions but delegates the actual
 *   array write to this module.
 *
 *   CharacterCommands does NOT own the character record's storage. It
 *   delegates every mutation to CharacterState, which is the canonical
 *   runtime owner of character data.
 *
 * WRITE PATH:
 *   Character-owned field patch:
 *       CharacterCommands.updateCharacterFields(id, patch)
 *           → CharacterState.updateCharacter(id, patch)
 *
 *   Profession patch (embedded domain field):
 *       CharacterCommands.addProfession(id, data)
 *           → CharacterState.applyDomainFieldPatch(id, { professions })
 *
 *   The domain-field path bypasses CharacterState's character-owned field
 *   gate, which is why only this module (and FamilyCommands) may use it.
 *
 * CONTRACT:
 *   - Every public command returns { success: boolean, reason?: string, ... }.
 *   - Input is validated before any mutation. Partial mutation on failure
 *     is not permitted.
 *   - No recursion guards. Commands may call other commands.
 *   - No fallbacks. If CharacterState is missing at load, this module throws.
 *
 * DEPENDENCIES (REQUIRED, load first):
 *   - character-state.js  (window.CharacterState)
 *
 * DEPENDENCIES (OPTIONAL):
 *   - None. This module never reaches into RoleState, FamilyState, or any
 *     other domain. Callers compose domain effects.
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 0. HARD DEPENDENCY CHECK
    // =========================================================================

    if (!window.CharacterState) {
        throw new Error(
            'character-commands.js requires character-state.js (CharacterState) to load first.'
        );
    }

    var CS = window.CharacterState;

    var _requiredStateMethods = [
        'updateCharacter',
        'updateCharacters',
        'applyDomainFieldPatch'
    ];
    for (var _m = 0; _m < _requiredStateMethods.length; _m++) {
        var _methodName = _requiredStateMethods[_m];
        if (typeof CS[_methodName] !== 'function') {
            throw new Error(
                'character-commands.js: CharacterState.' + _methodName +
                ' is required. Update character-state.js to expose the ' +
                'canonical mutation primitives.'
            );
        }
    }

    // =========================================================================
    // 1. RESULT HELPERS
    // =========================================================================

    function _ok(data) {
        var result = { success: true };
        if (data && typeof data === 'object') {
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
    // 2. INPUT VALIDATION
    // =========================================================================

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isNonEmptyString(v) {
        return typeof v === 'string' && v.trim() !== '';
    }

    function _isPlainObject(v) {
        if (v === null || typeof v !== 'object') return false;
        var proto = Object.getPrototypeOf(v);
        return proto === Object.prototype || proto === null;
    }

    function _isValidSkillLevel(v) {
        if (typeof v !== 'number' || !Number.isFinite(v)) return false;
        if (v < 0 || v > 100) return false;
        return true;
    }

    function _isValidYearOrMissing(v) {
        if (_isMissing(v)) return true;
        return typeof v === 'number' && Number.isFinite(v);
    }

    function _isValidSalaryOrMissing(v) {
        if (_isMissing(v)) return true;
        return typeof v === 'number' && Number.isFinite(v) && v >= 0;
    }

    // =========================================================================
    // 3. CHARACTER-OWNED FIELD UPDATES
    // =========================================================================
    //
    // The generic character field path. Refuses to touch domain-owned embedded
    // fields (professions, relationships, adoptedParents, apprenticeship
    // fields, rank assignments). Those go through their own domain commands.
    //
    // This list is maintained here (not in CharacterState) because it is the
    // domain-command gate: "what may a general character update write?".
    // CharacterState has a complementary list (what may CharacterState accept
    // through its own primitive?). The two lists overlap but are not the same:
    // CharacterState accepts every character-owned field, including isDeleted
    // and deletedAt, which generic commands must not set.

    var _DOMAIN_OWNED_FIELDS = {
        // Family-owned embedded fields
        motherId: true,
        fatherId: true,
        adoptedParents: true,
        adoptedChildren: true,
        children: true,

        // Relationship / friendship owned
        relationships: true,
        friends: true,
        friendshipDetails: true,

        // Profession / rank owned
        professions: true,
        rankAssignments: true,
        activeRankId: true,
        activeRankNumber: true,

        // Apprenticeship owned
        apprentices: true,
        masterId: true,
        isMaster: true,
        masterProfessionId: true,
        apprenticeshipDetails: true,

        // Lifecycle owned
        isDeleted: true,
        deletedAt: true
    };

    function _collectDomainOwnedKeys(updates) {
        var found = [];
        for (var key in updates) {
            if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;
            if (_DOMAIN_OWNED_FIELDS[key] === true) found.push(key);
        }
        return found;
    }

    /**
     * Updates character-owned fields on a character.
     *
     * Refuses any field owned by another domain. Use the owning domain's
     * command for those.
     *
     * @param {string} characterId
     * @param {Object} updates - partial character patch
     * @returns {{ success: boolean, reason?: string }}
     */
    function updateCharacterFields(characterId, updates) {
        if (!_hasId(characterId)) return _fail('Character id is required.');
        if (!_isPlainObject(updates)) return _fail('Updates must be a plain object.');

        if (Object.prototype.hasOwnProperty.call(updates, 'id')) {
            return _fail('Character id cannot be changed.');
        }

        var offenders = _collectDomainOwnedKeys(updates);
        if (offenders.length > 0) {
            return _fail(
                'Field(s) owned by another domain: ' + offenders.join(', ') +
                '. Use the owning domain\'s command.'
            );
        }

        var result = CS.updateCharacter(characterId, updates);
        if (!result || result.success !== true) {
            return _fail(result && result.reason
                ? result.reason
                : 'CharacterState refused the update.');
        }
        return _ok();
    }

    /**
     * Batch variant of updateCharacterFields.
     *
     * @param {Array<{id: string, updates: Object}>} changes
     * @returns {{ success: boolean, reason?: string }}
     */
    function updateCharactersFields(changes) {
        if (!Array.isArray(changes)) return _fail('changes must be an array.');
        if (changes.length === 0) return _ok();

        for (var i = 0; i < changes.length; i++) {
            var change = changes[i];
            if (!change || typeof change !== 'object') {
                return _fail('Change at index ' + i + ' is not an object.');
            }
            if (!_hasId(change.id)) {
                return _fail('Change at index ' + i + ' has no id.');
            }
            if (!_isPlainObject(change.updates)) {
                return _fail('Change at index ' + i + ' has no updates object.');
            }
            if (Object.prototype.hasOwnProperty.call(change.updates, 'id')) {
                return _fail('Change at index ' + i + ' attempts to change id.');
            }
            var offenders = _collectDomainOwnedKeys(change.updates);
            if (offenders.length > 0) {
                return _fail(
                    'Change at index ' + i + ': field(s) owned by another domain: ' +
                    offenders.join(', ')
                );
            }
        }

        var result = CS.updateCharacters(changes);
        if (!result || result.success !== true) {
            return _fail(result && result.reason
                ? result.reason
                : 'CharacterState refused the batch update.');
        }
        return _ok();
    }

    // =========================================================================
    // 4. PROFESSION NORMALISATION
    // =========================================================================
    //
    // CharacterCommands owns the canonical shape of a profession record. The
    // shape is defined here, not in RoleState. RoleState produces the input
    // facts (role id, name, base salary); this module assembles the record.

    function _normaliseNewProfession(data) {
        return {
            id: data.id,
            name: data.name,
            skillLevel: data.skillLevel,
            startYear: _isMissing(data.startYear) ? null : data.startYear,
            primary: data.primary === true,
            notes: typeof data.notes === 'string' ? data.notes : '',
            specs: Array.isArray(data.specs) ? data.specs.slice() : [],
            baseSalary: typeof data.baseSalary === 'number' ? data.baseSalary : 0,
            customSalary: _isMissing(data.customSalary) ? null : data.customSalary,
            salaryHistory: Array.isArray(data.salaryHistory)
                ? data.salaryHistory.slice()
                : [],
            salaryLastCalculated: _isMissing(data.salaryLastCalculated)
                ? null
                : data.salaryLastCalculated,
            paysSalary: data.paysSalary === undefined ? true : data.paysSalary === true
        };
    }

    function _findProfessionIndex(professions, professionId) {
        if (!Array.isArray(professions)) return -1;
        for (var i = 0; i < professions.length; i++) {
            var p = professions[i];
            if (p && p.id === professionId) return i;
        }
        return -1;
    }

    function _writeProfessions(characterId, nextProfessions) {
        var result = CS.applyDomainFieldPatch(characterId, {
            professions: nextProfessions
        });
        if (!result || result.success !== true) {
            return _fail(result && result.reason
                ? result.reason
                : 'CharacterState refused the profession write.');
        }
        return _ok();
    }

    // =========================================================================
    // 5. PROFESSION API
    // =========================================================================

    /**
     * Returns the character's profession record for a role, or null.
     *
     * This is a read, but it lives here because CharacterCommands owns the
     * profession array and RoleCommands expects it on this surface.
     */
    function getProfession(characterId, professionId) {
        if (!_hasId(characterId)) return null;
        if (!_hasId(professionId)) return null;

        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character) return null;

        var idx = _findProfessionIndex(character.professions, professionId);
        if (idx === -1) return null;
        return character.professions[idx];
    }

    /**
     * Returns a defensive copy of the character's profession array.
     */
    function getProfessions(characterId) {
        if (!_hasId(characterId)) return [];
        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character || !Array.isArray(character.professions)) return [];
        var out = [];
        for (var i = 0; i < character.professions.length; i++) {
            var p = character.professions[i];
            if (!p) continue;
            out.push({
                id: p.id,
                name: p.name,
                skillLevel: p.skillLevel,
                startYear: p.startYear,
                primary: p.primary === true,
                notes: typeof p.notes === 'string' ? p.notes : '',
                specs: Array.isArray(p.specs) ? p.specs.slice() : [],
                baseSalary: typeof p.baseSalary === 'number' ? p.baseSalary : 0,
                customSalary: _isMissing(p.customSalary) ? null : p.customSalary,
                salaryHistory: Array.isArray(p.salaryHistory)
                    ? p.salaryHistory.slice()
                    : [],
                salaryLastCalculated: _isMissing(p.salaryLastCalculated)
                    ? null
                    : p.salaryLastCalculated,
                paysSalary: p.paysSalary === undefined ? true : p.paysSalary === true
            });
        }
        return out;
    }

    /**
     * Adds a profession to a character.
     *
     * Required data fields: id, name, skillLevel.
     * Optional: startYear, primary, notes, specs, baseSalary, customSalary,
     *           salaryHistory, salaryLastCalculated, paysSalary.
     *
     * Fails if the character already has a profession with this id.
     * Fails if the character is soft-deleted or does not exist.
     */
    function addProfession(characterId, professionData) {
        if (!_hasId(characterId)) return _fail('Character id is required.');
        if (!_isPlainObject(professionData)) {
            return _fail('Profession data must be a plain object.');
        }
        if (!_hasId(professionData.id)) return _fail('Profession id is required.');
        if (!_isNonEmptyString(professionData.name)) {
            return _fail('Profession name is required.');
        }
        if (!_isValidSkillLevel(professionData.skillLevel)) {
            return _fail('Skill level must be a number between 0 and 100.');
        }
        if (!_isValidYearOrMissing(professionData.startYear)) {
            return _fail('startYear must be a number or omitted.');
        }
        if (!_isValidSalaryOrMissing(professionData.baseSalary)) {
            return _fail('baseSalary must be a non-negative number or omitted.');
        }
        if (!_isValidSalaryOrMissing(professionData.customSalary)) {
            return _fail('customSalary must be a non-negative number or null.');
        }

        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character) return _fail('Character not found.');
        if (character.isDeleted === true) {
            return _fail('Character is soft-deleted. Restore first to modify.');
        }

        var existing = Array.isArray(character.professions)
            ? character.professions
            : [];

        if (_findProfessionIndex(existing, professionData.id) !== -1) {
            return _fail(
                'Character already has a profession with id "' +
                professionData.id + '".'
            );
        }

        var next = existing.slice();
        var newProfession = _normaliseNewProfession(professionData);
        next.push(newProfession);

        var writeResult = _writeProfessions(characterId, next);
        if (!writeResult.success) return writeResult;

        return _ok({ profession: newProfession });
    }

    /**
     * Partially updates an existing profession on a character.
     *
     * Accepts any subset of:
     *   name, skillLevel, startYear, primary, notes, specs,
     *   baseSalary, customSalary, salaryHistory,
     *   salaryLastCalculated, paysSalary
     *
     * Fields absent from `updates` are left unchanged.
     * Present fields must pass validation.
     */
    function updateProfession(characterId, professionId, updates) {
        if (!_hasId(characterId)) return _fail('Character id is required.');
        if (!_hasId(professionId)) return _fail('Profession id is required.');
        if (!_isPlainObject(updates)) return _fail('Updates must be a plain object.');

        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character) return _fail('Character not found.');
        if (character.isDeleted === true) {
            return _fail('Character is soft-deleted. Restore first to modify.');
        }

        var existing = Array.isArray(character.professions)
            ? character.professions
            : [];
        var idx = _findProfessionIndex(existing, professionId);
        if (idx === -1) return _fail('Character does not have this profession.');

        var current = existing[idx];
        var next = {
            id: current.id,
            name: current.name,
            skillLevel: current.skillLevel,
            startYear: _isMissing(current.startYear) ? null : current.startYear,
            primary: current.primary === true,
            notes: typeof current.notes === 'string' ? current.notes : '',
            specs: Array.isArray(current.specs) ? current.specs.slice() : [],
            baseSalary: typeof current.baseSalary === 'number' ? current.baseSalary : 0,
            customSalary: _isMissing(current.customSalary) ? null : current.customSalary,
            salaryHistory: Array.isArray(current.salaryHistory)
                ? current.salaryHistory.slice()
                : [],
            salaryLastCalculated: _isMissing(current.salaryLastCalculated)
                ? null
                : current.salaryLastCalculated,
            paysSalary: current.paysSalary === undefined
                ? true
                : current.paysSalary === true
        };

        if (updates.name !== undefined) {
            if (!_isNonEmptyString(updates.name)) {
                return _fail('Profession name cannot be empty.');
            }
            next.name = updates.name.trim();
        }

        if (updates.skillLevel !== undefined) {
            if (!_isValidSkillLevel(updates.skillLevel)) {
                return _fail('Skill level must be a number between 0 and 100.');
            }
            next.skillLevel = updates.skillLevel;
        }

        if (updates.startYear !== undefined) {
            if (!_isValidYearOrMissing(updates.startYear)) {
                return _fail('startYear must be a number or null.');
            }
            next.startYear = updates.startYear;
        }

        if (updates.primary !== undefined) {
            next.primary = updates.primary === true;
        }

        if (updates.notes !== undefined) {
            next.notes = typeof updates.notes === 'string' ? updates.notes : '';
        }

        if (updates.specs !== undefined) {
            if (!Array.isArray(updates.specs)) {
                return _fail('specs must be an array.');
            }
            next.specs = updates.specs.slice();
        }

        if (updates.baseSalary !== undefined) {
            if (!_isValidSalaryOrMissing(updates.baseSalary)) {
                return _fail('baseSalary must be a non-negative number.');
            }
            next.baseSalary = updates.baseSalary;
        }

        if (updates.customSalary !== undefined) {
            if (!_isValidSalaryOrMissing(updates.customSalary)) {
                return _fail('customSalary must be a non-negative number or null.');
            }
            next.customSalary = updates.customSalary;
        }

        if (updates.salaryHistory !== undefined) {
            if (!Array.isArray(updates.salaryHistory)) {
                return _fail('salaryHistory must be an array.');
            }
            next.salaryHistory = updates.salaryHistory.slice();
        }

        if (updates.salaryLastCalculated !== undefined) {
            if (!_isValidYearOrMissing(updates.salaryLastCalculated)) {
                return _fail('salaryLastCalculated must be a number or null.');
            }
            next.salaryLastCalculated = updates.salaryLastCalculated;
        }

        if (updates.paysSalary !== undefined) {
            next.paysSalary = updates.paysSalary === true;
        }

        var nextProfessions = existing.slice();
        nextProfessions[idx] = next;

        var writeResult = _writeProfessions(characterId, nextProfessions);
        if (!writeResult.success) return writeResult;

        return _ok({ profession: next });
    }

    /**
     * Removes a single profession from a character.
     *
     * If the removed profession was primary and other professions remain,
     * no automatic promotion is performed. Primacy is a caller decision
     * (RoleCommands / UI) and should be set explicitly via
     * updateProfession(id, rid, { primary: true }).
     */
    function removeProfession(characterId, professionId) {
        if (!_hasId(characterId)) return _fail('Character id is required.');
        if (!_hasId(professionId)) return _fail('Profession id is required.');

        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character) return _fail('Character not found.');
        if (character.isDeleted === true) {
            return _fail('Character is soft-deleted. Restore first to modify.');
        }

        var existing = Array.isArray(character.professions)
            ? character.professions
            : [];
        var idx = _findProfessionIndex(existing, professionId);
        if (idx === -1) return _fail('Character does not have this profession.');

        var nextProfessions = existing.slice();
        nextProfessions.splice(idx, 1);

        var writeResult = _writeProfessions(characterId, nextProfessions);
        if (!writeResult.success) return writeResult;

        return _ok({
            characterId: characterId,
            professionId: professionId
        });
    }

    /**
     * Removes a profession from every character that holds it.
     *
     * Returns { success: true, removedCount, characterIds }.
     *
     * Writes through CharacterState's batch primitive so persistence
     * fires once. This is the operation RoleCommands.deleteRole uses to
     * clean up assignments before deleting a role.
     */
    function removeProfessionFromAll(professionId) {
        if (!_hasId(professionId)) return _fail('Profession id is required.');

        var all = CS.getAllCharacters();
        var affectedIds = [];

        for (var i = 0; i < all.length; i++) {
            var projected = all[i];
            // getAllCharacters returns projections that do NOT include
            // professions. Use the live reference to inspect the array.
            var live = CS._getLiveCharacterForMutation(projected.id);
            if (!live) continue;
            if (!Array.isArray(live.professions)) continue;
            if (_findProfessionIndex(live.professions, professionId) === -1) continue;
            affectedIds.push(live.id);
        }

        if (affectedIds.length === 0) {
            return _ok({ removedCount: 0, characterIds: [] });
        }

        // Build and apply each patch. Each write is one applyDomainFieldPatch
        // so persistence fires per character. The batch primitive in
        // CharacterState.updateCharacters is character-owned only; we cannot
        // route domain-owned field patches through it, so we loop.
        var applied = [];
        for (var j = 0; j < affectedIds.length; j++) {
            var id = affectedIds[j];
            var live = CS._getLiveCharacterForMutation(id);
            if (!live || !Array.isArray(live.professions)) continue;

            var next = live.professions.slice();
            var removeIdx = _findProfessionIndex(next, professionId);
            if (removeIdx === -1) continue;
            next.splice(removeIdx, 1);

            var patch = CS.applyDomainFieldPatch(id, { professions: next });
            if (patch && patch.success === true) {
                applied.push(id);
            }
        }

        return _ok({
            removedCount: applied.length,
            characterIds: applied
        });
    }

    /**
     * Replaces the entire profession array on a character.
     *
     * Reserved for import / migration paths that need to hand a canonical
     * profession array directly to CharacterState. Ordinary callers must
     * use addProfession / updateProfession / removeProfession.
     *
     * Validates each record's minimal shape.
     */
    function replaceProfessions(characterId, professions) {
        if (!_hasId(characterId)) return _fail('Character id is required.');
        if (!Array.isArray(professions)) {
            return _fail('professions must be an array.');
        }

        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character) return _fail('Character not found.');

        var seen = {};
        var normalised = [];
        for (var i = 0; i < professions.length; i++) {
            var p = professions[i];
            if (!_isPlainObject(p)) {
                return _fail('Profession at index ' + i + ' is not an object.');
            }
            if (!_hasId(p.id)) {
                return _fail('Profession at index ' + i + ' has no id.');
            }
            if (!_isNonEmptyString(p.name)) {
                return _fail('Profession at index ' + i + ' has no name.');
            }
            if (!_isValidSkillLevel(p.skillLevel)) {
                return _fail('Profession at index ' + i + ' has invalid skillLevel.');
            }
            if (seen[p.id]) {
                return _fail('Duplicate profession id "' + p.id + '" in array.');
            }
            seen[p.id] = true;
            normalised.push(_normaliseNewProfession(p));
        }

        var writeResult = _writeProfessions(characterId, normalised);
        if (!writeResult.success) return writeResult;

        return _ok({ professions: normalised });
    }

    // =========================================================================
    // 6. PROFESSION PRIMACY
    // =========================================================================

    /**
     * Sets a profession as primary and demotes all others.
     *
     * This is a character-commands concern because it writes professions.
     * Callers (RoleCommands, UI) decide which profession should be primary.
     */
    function setPrimaryProfession(characterId, professionId) {
        if (!_hasId(characterId)) return _fail('Character id is required.');
        if (!_hasId(professionId)) return _fail('Profession id is required.');

        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character) return _fail('Character not found.');
        if (character.isDeleted === true) {
            return _fail('Character is soft-deleted. Restore first to modify.');
        }

        var existing = Array.isArray(character.professions)
            ? character.professions
            : [];

        var targetIdx = _findProfessionIndex(existing, professionId);
        if (targetIdx === -1) {
            return _fail('Character does not have this profession.');
        }

        var nextProfessions = [];
        for (var i = 0; i < existing.length; i++) {
            var p = existing[i];
            var copy = _normaliseNewProfession(p);
            copy.primary = (p.id === professionId);
            nextProfessions.push(copy);
        }

        var writeResult = _writeProfessions(characterId, nextProfessions);
        if (!writeResult.success) return writeResult;

        return _ok();
    }

    /**
     * Clears the primary flag on all professions.
     */
    function clearPrimaryProfession(characterId) {
        if (!_hasId(characterId)) return _fail('Character id is required.');

        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character) return _fail('Character not found.');

        var existing = Array.isArray(character.professions)
            ? character.professions
            : [];
        if (existing.length === 0) return _ok();

        var nextProfessions = [];
        for (var i = 0; i < existing.length; i++) {
            var copy = _normaliseNewProfession(existing[i]);
            copy.primary = false;
            nextProfessions.push(copy);
        }

        var writeResult = _writeProfessions(characterId, nextProfessions);
        if (!writeResult.success) return writeResult;

        return _ok();
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.CharacterCommands = {
        // Character-owned field updates
        updateCharacterFields: updateCharacterFields,
        updateCharactersFields: updateCharactersFields,

        // Profession reads
        getProfession: getProfession,
        getProfessions: getProfessions,

        // Profession writes (owned by this module)
        addProfession: addProfession,
        updateProfession: updateProfession,
        removeProfession: removeProfession,
        removeProfessionFromAll: removeProfessionFromAll,
        replaceProfessions: replaceProfessions,

        // Profession primacy
        setPrimaryProfession: setPrimaryProfession,
        clearPrimaryProfession: clearPrimaryProfession
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterCommands;
    }
})();
