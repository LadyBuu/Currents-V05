/**
 * =============================================================================
 * STILL WATERS - CHARACTER COMMANDS (character-commands.js)
 * =============================================================================
 *
 * LOCATION: js/systems/characters/character-commands.js
 *
 * All write operations for the character domain.
 *
 * This module owns `character.professions`. No other module may push to,
 * splice, or reassign that array. Role assignment, skill updates, and
 * profession removal all route through the API below.
 *
 * Contract:
 *   - Validates inputs, returns structured results ({ success, reason?, ... }).
 *   - Delegates to CharacterState for the actual mutation + persistence.
 *   - Never toasts, never dispatches browser events, never logs to the
 *     activity feed. Callers decide those. A thin controller layer handles
 *     presentation.
 *   - No recursion guards. Every operation is synchronous with explicit
 *     side effects. Commands may safely call other commands.
 *   - No fallbacks. If CharacterState or storage is missing, this module
 *     throws at load time rather than silently degrading.
 *
 * Ownership contract:
 *   CharacterState owns:
 *       - the in-memory character records
 *       - profession arrays inside those records
 *       - persistence sync
 *   CharacterCommands owns:
 *       - validation
 *       - orchestration across multiple character mutations
 *
 * Profession API:
 *   - addProfession(characterId, professionData)
 *   - updateProfession(characterId, professionId, updates)
 *   - removeProfession(characterId, professionId)
 *   - removeProfessionFromAll(professionId)
 *   - getProfession(characterId, professionId)
 *   - addProfessionSpecialization(characterId, professionId, spec)
 *   - removeProfessionSpecialization(characterId, professionId, spec)
 *
 * DEPENDENCIES (must be loaded first):
 *   - character-state.js  (CharacterState)
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 1. HARD DEPENDENCY CHECK
    // =========================================================================

    if (!window.CharacterState) {
        throw new Error(
            'character-commands.js requires character-state.js (CharacterState) first.'
        );
    }

    var CS = window.CharacterState;

    var requiredStateMethods = [
        'getCharacter',
        'getAllCharacters',
        'updateCharacter',
        'updateCharacters'
    ];
    for (var _m = 0; _m < requiredStateMethods.length; _m++) {
        if (typeof CS[requiredStateMethods[_m]] !== 'function') {
            throw new Error(
                'character-commands.js: CharacterState.' +
                requiredStateMethods[_m] + ' is required.'
            );
        }
    }

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

    function _validId(v) {
        return _validString(v);
    }

    function _validSkillLevel(v) {
        if (typeof v !== 'number' || !Number.isFinite(v)) return false;
        if (v < 0 || v > 100) return false;
        return true;
    }

    function _validYear(v) {
        if (v === null || v === undefined) return true;
        return typeof v === 'number' && Number.isFinite(v);
    }

    function _validSalary(v) {
        if (v === null || v === undefined) return true;
        return typeof v === 'number' && Number.isFinite(v) && v >= 0;
    }

    // =========================================================================
    // 4. PROFESSION NORMALISATION
    // =========================================================================

    function _normaliseNewProfession(data) {
        return {
            id: data.id,
            name: data.name,
            skillLevel: data.skillLevel,
            startYear: data.startYear === undefined ? null : data.startYear,
            primary: data.primary === true,
            notes: typeof data.notes === 'string' ? data.notes : '',
            specs: Array.isArray(data.specs) ? data.specs.slice() : [],
            baseSalary: typeof data.baseSalary === 'number' ? data.baseSalary : 0,
            customSalary: data.customSalary === undefined ? null : data.customSalary,
            salaryHistory: Array.isArray(data.salaryHistory) ? data.salaryHistory.slice() : [],
            salaryLastCalculated: data.salaryLastCalculated === undefined
                ? null
                : data.salaryLastCalculated,
            paysSalary: data.paysSalary === undefined ? true : data.paysSalary === true
        };
    }

    function _findProfessionIndex(character, professionId) {
        if (!character || !Array.isArray(character.professions)) return -1;
        for (var i = 0; i < character.professions.length; i++) {
            var p = character.professions[i];
            if (p && p.id === professionId) return i;
        }
        return -1;
    }

    // =========================================================================
    // 5. PROFESSION API
    // =========================================================================

    function addProfession(characterId, professionData) {
        if (!_validId(characterId)) return _fail('Character id is required.');
        if (!professionData || typeof professionData !== 'object') {
            return _fail('Profession data is required.');
        }
        if (!_validId(professionData.id)) return _fail('Profession id is required.');
        if (!_validString(professionData.name)) return _fail('Profession name is required.');
        if (!_validSkillLevel(professionData.skillLevel)) {
            return _fail('Skill level must be a number between 0 and 100.');
        }
        if (!_validYear(professionData.startYear)) {
            return _fail('startYear must be a number or omitted.');
        }
        if (!_validSalary(professionData.baseSalary)) {
            return _fail('baseSalary must be a non-negative number or omitted.');
        }
        if (!_validSalary(professionData.customSalary)) {
            return _fail('customSalary must be a non-negative number or null.');
        }

        var character = CS.getCharacter(characterId);
        if (!character) return _fail('Character not found.');

        if (_findProfessionIndex(character, professionData.id) !== -1) {
            return _fail('Character already has a profession with id "' +
                professionData.id + '".');
        }

        var nextProfessions = Array.isArray(character.professions)
            ? character.professions.slice()
            : [];

        var newProfession = _normaliseNewProfession(professionData);
        nextProfessions.push(newProfession);

        var update = CS.updateCharacter(characterId, { professions: nextProfessions });
        if (!update || update.success !== true) {
            return _fail(update && update.reason
                ? update.reason
                : 'CharacterState refused the update.');
        }

        return _ok({ profession: newProfession });
    }

    function updateProfession(characterId, professionId, updates) {
        if (!_validId(characterId)) return _fail('Character id is required.');
        if (!_validId(professionId)) return _fail('Profession id is required.');
        if (!updates || typeof updates !== 'object') {
            return _fail('Updates object is required.');
        }

        var character = CS.getCharacter(characterId);
        if (!character) return _fail('Character not found.');

        var idx = _findProfessionIndex(character, professionId);
        if (idx === -1) return _fail('Character does not have this profession.');

        var current = character.professions[idx];
        var next = {
            id: current.id,
            name: current.name,
            skillLevel: current.skillLevel,
            startYear: current.startYear,
            primary: current.primary === true,
            notes: typeof current.notes === 'string' ? current.notes : '',
            specs: Array.isArray(current.specs) ? current.specs.slice() : [],
            baseSalary: typeof current.baseSalary === 'number' ? current.baseSalary : 0,
            customSalary: current.customSalary === undefined ? null : current.customSalary,
            salaryHistory: Array.isArray(current.salaryHistory)
                ? current.salaryHistory.slice()
                : [],
            salaryLastCalculated: current.salaryLastCalculated === undefined
                ? null
                : current.salaryLastCalculated,
            paysSalary: current.paysSalary === undefined ? true : current.paysSalary === true
        };

        if (updates.name !== undefined) {
            if (!_validString(updates.name)) return _fail('Name cannot be empty.');
            next.name = updates.name;
        }

        if (updates.skillLevel !== undefined) {
            if (!_validSkillLevel(updates.skillLevel)) {
                return _fail('Skill level must be a number between 0 and 100.');
            }
            next.skillLevel = updates.skillLevel;
        }

        if (updates.startYear !== undefined) {
            if (!_validYear(updates.startYear)) {
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
            if (!_validSalary(updates.baseSalary)) {
                return _fail('baseSalary must be a non-negative number.');
            }
            next.baseSalary = updates.baseSalary;
        }

        if (updates.customSalary !== undefined) {
            if (!_validSalary(updates.customSalary)) {
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
            if (!_validYear(updates.salaryLastCalculated)) {
                return _fail('salaryLastCalculated must be a number or null.');
            }
            next.salaryLastCalculated = updates.salaryLastCalculated;
        }

        if (updates.paysSalary !== undefined) {
            next.paysSalary = updates.paysSalary === true;
        }

        var nextProfessions = character.professions.slice();
        nextProfessions[idx] = next;

        var update = CS.updateCharacter(characterId, { professions: nextProfessions });
        if (!update || update.success !== true) {
            return _fail(update && update.reason
                ? update.reason
                : 'CharacterState refused the update.');
        }

        return _ok({ profession: next });
    }

    function removeProfession(characterId, professionId) {
        if (!_validId(characterId)) return _fail('Character id is required.');
        if (!_validId(professionId)) return _fail('Profession id is required.');

        var character = CS.getCharacter(characterId);
        if (!character) return _fail('Character not found.');

        var idx = _findProfessionIndex(character, professionId);
        if (idx === -1) return _fail('Character does not have this profession.');

        var nextProfessions = character.professions.slice();
        nextProfessions.splice(idx, 1);

        var update = CS.updateCharacter(characterId, { professions: nextProfessions });
        if (!update || update.success !== true) {
            return _fail(update && update.reason
                ? update.reason
                : 'CharacterState refused the update.');
        }

        return _ok({ characterId: characterId, professionId: professionId });
    }

    function removeProfessionFromAll(professionId) {
        if (!_validId(professionId)) return _fail('Profession id is required.');

        var all = CS.getAllCharacters();
        var changes = [];
        var affectedCharacterIds = [];

        for (var i = 0; i < all.length; i++) {
            var character = all[i];
            if (!Array.isArray(character.professions)) continue;
            var idx = _findProfessionIndex(character, professionId);
            if (idx === -1) continue;

            var nextProfessions = character.professions.slice();
            nextProfessions.splice(idx, 1);

            changes.push({ id: character.id, updates: { professions: nextProfessions } });
            affectedCharacterIds.push(character.id);
        }

        if (changes.length === 0) {
            return _ok({ removedCount: 0, characterIds: [] });
        }

        var batch = CS.updateCharacters(changes);
        if (!batch || batch.success !== true) {
            return _fail(batch && batch.reason
                ? batch.reason
                : 'CharacterState refused the batch update.');
        }

        return _ok({
            removedCount: affectedCharacterIds.length,
            characterIds: affectedCharacterIds
        });
    }

    function getProfession(characterId, professionId) {
        if (!_validId(characterId)) return null;
        if (!_validId(professionId)) return null;

        var character = CS.getCharacter(characterId);
        if (!character) return null;

        var idx = _findProfessionIndex(character, professionId);
        if (idx === -1) return null;
        return character.professions[idx];
    }

    // =========================================================================
    // 6. PROFESSION SPECIALIZATION API
    // =========================================================================
    //
    // Specializations live on the profession record as `specs`. They describe
    // which specializations of the role this character has actually learned.
    //
    // They are distinct from `role.specializations`, which is the catalogue
    // of specializations the role offers. A character can only learn a
    // specialization that appears on the role's catalogue; that invariant is
    // enforced by the caller (typically ApprenticeshipRules.validateSpecialization)
    // because the character domain has no business reading role records.

    function addProfessionSpecialization(characterId, professionId, specialization) {
        if (!_validId(characterId)) return _fail('Character id is required.');
        if (!_validId(professionId)) return _fail('Profession id is required.');
        if (!_validString(specialization)) return _fail('Specialization is required.');

        var character = CS.getCharacter(characterId);
        if (!character) return _fail('Character not found.');

        var idx = _findProfessionIndex(character, professionId);
        if (idx === -1) return _fail('Character does not have this profession.');

        var current = character.professions[idx];
        var existing = Array.isArray(current.specs) ? current.specs.slice() : [];
        var spec = specialization.trim();

        if (existing.indexOf(spec) !== -1) {
            return _fail('Specialization already present on this profession.');
        }

        existing.push(spec);

        var nextProfessions = character.professions.slice();
        nextProfessions[idx] = Object.assign({}, current, { specs: existing });

        var update = CS.updateCharacter(characterId, { professions: nextProfessions });
        if (!update || update.success !== true) {
            return _fail(update && update.reason
                ? update.reason
                : 'CharacterState refused the update.');
        }

        return _ok({
            characterId: characterId,
            professionId: professionId,
            specialization: spec,
            specs: existing
        });
    }

    function removeProfessionSpecialization(characterId, professionId, specialization) {
        if (!_validId(characterId)) return _fail('Character id is required.');
        if (!_validId(professionId)) return _fail('Profession id is required.');
        if (!_validString(specialization)) return _fail('Specialization is required.');

        var character = CS.getCharacter(characterId);
        if (!character) return _fail('Character not found.');

        var idx = _findProfessionIndex(character, professionId);
        if (idx === -1) return _fail('Character does not have this profession.');

        var current = character.professions[idx];
        var existing = Array.isArray(current.specs) ? current.specs.slice() : [];
        var spec = specialization.trim();

        var specIdx = existing.indexOf(spec);
        if (specIdx === -1) {
            return _fail('Specialization not present on this profession.');
        }

        existing.splice(specIdx, 1);

        var nextProfessions = character.professions.slice();
        nextProfessions[idx] = Object.assign({}, current, { specs: existing });

        var update = CS.updateCharacter(characterId, { professions: nextProfessions });
        if (!update || update.success !== true) {
            return _fail(update && update.reason
                ? update.reason
                : 'CharacterState refused the update.');
        }

        return _ok({
            characterId: characterId,
            professionId: professionId,
            specialization: spec,
            specs: existing
        });
    }

    // =========================================================================
    // 7. GENERIC CHARACTER UPDATE
    // =========================================================================

    function updateCharacterFields(characterId, updates) {
        if (!_validId(characterId)) return _fail('Character id is required.');
        if (!updates || typeof updates !== 'object') {
            return _fail('Updates object is required.');
        }
        if (Object.prototype.hasOwnProperty.call(updates, 'professions')) {
            return _fail(
                'Use addProfession / updateProfession / removeProfession to modify professions.'
            );
        }
        if (Object.prototype.hasOwnProperty.call(updates, 'id')) {
            return _fail('Character id cannot be changed.');
        }

        var character = CS.getCharacter(characterId);
        if (!character) return _fail('Character not found.');

        var update = CS.updateCharacter(characterId, updates);
        if (!update || update.success !== true) {
            return _fail(update && update.reason
                ? update.reason
                : 'CharacterState refused the update.');
        }
        return _ok();
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.CharacterCommands = {
        // Profession API
        addProfession: addProfession,
        updateProfession: updateProfession,
        removeProfession: removeProfession,
        removeProfessionFromAll: removeProfessionFromAll,
        getProfession: getProfession,

        // Profession specializations
        addProfessionSpecialization: addProfessionSpecialization,
        removeProfessionSpecialization: removeProfessionSpecialization,

        // Generic character field updates (never touches professions)
        updateCharacterFields: updateCharacterFields
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterCommands;
    }
})();
