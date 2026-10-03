/**
 * =============================================================================
 * STILL WATERS - CHARACTER COMMANDS (js/character/character-commands.js)
 * =============================================================================
 *
 * Mutation boundary for character-owned state.
 *
 * SCOPE:
 *   - Character-owned field updates
 *   - Profession array management on the character record
 *   - Surname history mutations
 *   - Religion assignment orchestration (delegates to ReligionCommands)
 *   - Bulk character-owned field updates
 *   - Death transition (markDeceased) — the single canonical writer of
 *     isDeceased and its associated fields
 *
 * OUT OF SCOPE:
 *   - Character creation           -> character-creation-commands.js
 *   - Character deletion           -> character-deletion-commands.js
 *   - Family mutations             -> family-commands.js
 *   - Mortality policy             -> mortality-rules.js
 *   - Lifecycle orchestration      -> character-lifecycle.js
 *   - Persistence mechanics        -> character-state.js
 *   - Cross-domain events, toasts  -> caller
 *
 * DEATH TRANSITION (markDeceased):
 *   markDeceased(characterId, deathData) is the ONLY function that writes
 *   isDeceased = true and the associated death fields. It validates via
 *   MortalityRules.validateDeath, then calls CharacterState.updateCharacter
 *   once. It does not dispatch family/relationship/rank/succession
 *   consequences; the caller (CharacterLifecycle.killCharacter or a UI
 *   command) is responsible for that.
 *
 *   deathData is a plain object:
 *   {
 *     deathYear,             number, required
 *     deathCause,            string, required; stable id
 *     deathCauseDetail,      string, optional
 *     deathNotes,            string, optional
 *     isMurder,              boolean, optional
 *     killerId,              string, optional; required when isMurder
 *     murderMotive,          string, optional
 *     murderMethod,          string, optional
 *     isExecution,           boolean, optional
 *     executionReason,       string, optional; required when isExecution
 *     executionMethod,       string, optional
 *     executionLocation,     string, optional
 *   }
 *
 * DEPENDENCIES (REQUIRED):
 *   - character-state.js: CharacterState
 *   - time.js: getCurrentYear, isValidYear
 *
 * DEPENDENCIES (OPTIONAL, called only when the feature is used):
 *   - religion-commands.js (ReligionCommands)
 *   - mortality-rules.js (MortalityRules) — required for markDeceased only
 *
 * CONTRACT:
 *   - Every public command returns { success: boolean, reason?: string, ... }.
 *   - Input is validated before any mutation.
 *   - No recursion guards. Commands may call other commands.
 *   - No fallback dependencies.
 *   - CharacterCommands NEVER touches window.masterData directly.
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    if (!window.CharacterState) {
        throw new Error(
            'character-commands.js requires character-state.js (CharacterState) to load first.'
        );
    }

    var CS = window.CharacterState;

    var _requiredStateMethods = [
        'updateCharacter',
        'updateCharacters',
        'applyDomainFieldPatch',
        '_getLiveCharacterForMutation',
        'getAllCharacters'
    ];
    for (var _m = 0; _m < _requiredStateMethods.length; _m++) {
        var _methodName = _requiredStateMethods[_m];
        if (typeof CS[_methodName] !== 'function') {
            throw new Error(
                'character-commands.js: CharacterState.' + _methodName +
                ' is required.'
            );
        }
    }

    if (typeof window.getCurrentYear !== 'function') {
        throw new Error('character-commands.js requires time.js (getCurrentYear).');
    }
    if (typeof window.isValidYear !== 'function') {
        throw new Error('character-commands.js requires time.js (isValidYear).');
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
    // 2. VALIDATION HELPERS
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
        return window.isValidYear(v) === true;
    }

    function _isValidSalaryOrMissing(v) {
        if (_isMissing(v)) return true;
        return typeof v === 'number' && Number.isFinite(v) && v >= 0;
    }

    function _resolveYear(value) {
        if (_isMissing(value)) return window.getCurrentYear();
        return value;
    }

    // =========================================================================
    // 3. DOMAIN-OWNED FIELD GATE
    // =========================================================================

    var _DOMAIN_OWNED_FIELDS = {
        professions: true,
        rankAssignments: true,
        relationships: true,
        friends: true,
        apprenticeshipDetails: true,
        apprentices: true,
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

    // =========================================================================
    // 4. CHARACTER-OWNED FIELD UPDATES
    // =========================================================================

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

    function updateCharacter(characterId, updates) {
        return updateCharacterFields(characterId, updates);
    }

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
    // 5. DEATH TRANSITION (markDeceased)
    // =========================================================================

    function _requireMortalityRules() {
        if (typeof window.MortalityRules === 'undefined') {
            return { ok: false, reason: 'mortality-rules.js is not loaded.' };
        }
        if (typeof window.MortalityRules.validateDeath !== 'function') {
            return { ok: false, reason: 'MortalityRules.validateDeath is required.' };
        }
        return { ok: true };
    }

    /**
     * Marks a character as deceased. The single canonical death writer.
     *
     * Returns { success, reason?, deathRecord? }.
     */
    function markDeceased(characterId, deathData) {
        if (!_hasId(characterId)) return _fail('Character id is required.');
        if (!_isPlainObject(deathData)) {
            return _fail('deathData must be a plain object.');
        }

        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character) return _fail('Character not found.');
        if (character.isDeceased === true) {
            return _fail('Character is already deceased.');
        }

        var deps = _requireMortalityRules();
        if (!deps.ok) return _fail(deps.reason);

        var currentYear = window.getCurrentYear();

        // Build the facts MortalityRules.validateDeath needs.
        var validationFacts = {
            characterId: characterId,
            isDeceased: character.isDeceased === true,
            birthYear: character.birthYear,
            deathYear: deathData.deathYear,
            currentYear: currentYear,
            deathCause: deathData.deathCause,
            isMurder: deathData.isMurder === true,
            killerId: _isMissing(deathData.killerId) ? null : deathData.killerId,
            isExecution: deathData.isExecution === true,
            executionReason: _isMissing(deathData.executionReason)
                ? null
                : deathData.executionReason
        };

        var validation = window.MortalityRules.validateDeath(validationFacts);
        if (!validation.valid) {
            return _fail(validation.errors.join('; '));
        }

        // Build the update patch.
        var patch = {
            isDeceased: true,
            deathYear: deathData.deathYear,
            deathCause: deathData.deathCause,
            deathCauseDetail: _isMissing(deathData.deathCauseDetail)
                ? ''
                : String(deathData.deathCauseDetail),
            deathNotes: _isMissing(deathData.deathNotes)
                ? ''
                : String(deathData.deathNotes),
            isMurder: deathData.isMurder === true,
            killerId: _isMissing(deathData.killerId) ? null : deathData.killerId,
            murderMotive: _isMissing(deathData.murderMotive)
                ? null
                : String(deathData.murderMotive),
            murderMethod: _isMissing(deathData.murderMethod)
                ? null
                : String(deathData.murderMethod),
            isExecution: deathData.isExecution === true,
            executionReason: _isMissing(deathData.executionReason)
                ? null
                : String(deathData.executionReason),
            executionMethod: _isMissing(deathData.executionMethod)
                ? null
                : String(deathData.executionMethod),
            executionLocation: _isMissing(deathData.executionLocation)
                ? null
                : String(deathData.executionLocation),
            updatedAt: Date.now()
        };

        var writeResult = CS.updateCharacter(characterId, patch);
        if (!writeResult || writeResult.success !== true) {
            return _fail(writeResult && writeResult.reason
                ? writeResult.reason
                : 'CharacterState refused the death write.');
        }

        return _ok({
            characterId: characterId,
            deathYear: deathData.deathYear,
            deathCause: deathData.deathCause
        });
    }

    // =========================================================================
    // 6. PROFESSION NORMALISATION
    // =========================================================================

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
    // 7. PROFESSION API
    // =========================================================================

    function getProfession(characterId, professionId) {
        if (!_hasId(characterId)) return null;
        if (!_hasId(professionId)) return null;

        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character) return null;

        var idx = _findProfessionIndex(character.professions, professionId);
        if (idx === -1) return null;
        return character.professions[idx];
    }

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
                startYear: _isMissing(p.startYear) ? null : p.startYear,
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
            return _fail('startYear must be a valid world year or omitted.');
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
        var next = _normaliseNewProfession(current);

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
                return _fail('startYear must be a valid world year or null.');
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
                return _fail('salaryLastCalculated must be a valid world year or null.');
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

    function removeProfessionFromAll(professionId) {
        if (!_hasId(professionId)) return _fail('Profession id is required.');

        var projections = CS.getAllCharacters();
        var affectedIds = [];

        for (var i = 0; i < projections.length; i++) {
            var live = CS._getLiveCharacterForMutation(projections[i].id);
            if (!live) continue;
            if (!Array.isArray(live.professions)) continue;
            if (_findProfessionIndex(live.professions, professionId) === -1) continue;
            affectedIds.push(live.id);
        }

        if (affectedIds.length === 0) {
            return _ok({ removedCount: 0, characterIds: [] });
        }

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
    // 8. PROFESSION PRIMACY
    // =========================================================================

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
        if (_findProfessionIndex(existing, professionId) === -1) {
            return _fail('Character does not have this profession.');
        }

        var nextProfessions = [];
        for (var i = 0; i < existing.length; i++) {
            var copy = _normaliseNewProfession(existing[i]);
            copy.primary = (existing[i].id === professionId);
            nextProfessions.push(copy);
        }

        var writeResult = _writeProfessions(characterId, nextProfessions);
        if (!writeResult.success) return writeResult;

        return _ok();
    }

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
    // 9. SURNAME HISTORY
    // =========================================================================

    function recordCharacterSurnameChange(id, newSurname, year, reason, options) {
        if (!_hasId(id)) return _fail('Character id is required.');
        if (typeof newSurname !== 'string') {
            return _fail('New surname must be a string.');
        }
        if (_isMissing(options)) options = {};
        if (!_isPlainObject(options)) {
            return _fail('Options must be a plain object.');
        }

        var character = CS._getLiveCharacterForMutation(id);
        if (!character) return _fail('Character not found.');
        if (character.isDeleted === true) {
            return _fail('Character is soft-deleted. Restore first to modify.');
        }

        if (!_isValidYearOrMissing(year)) {
            return _fail('year must be a valid world year or omitted.');
        }
        var changeYear = _resolveYear(year);

        var history;
        if (_isPlainObject(character.surnameHistory)) {
            history = {
                birthSurname: typeof character.surnameHistory.birthSurname === 'string'
                    ? character.surnameHistory.birthSurname
                    : (typeof character.surname === 'string' ? character.surname : ''),
                entries: Array.isArray(character.surnameHistory.entries)
                    ? character.surnameHistory.entries.slice()
                    : [],
                lastUpdated: _isMissing(character.surnameHistory.lastUpdated)
                    ? _resolveYear(character.birthYear)
                    : character.surnameHistory.lastUpdated
            };
        } else {
            history = {
                birthSurname: typeof character.surname === 'string' ? character.surname : '',
                entries: [],
                lastUpdated: _resolveYear(character.birthYear)
            };
        }

        var previousSurname = _isMissing(options.previousSurname)
            ? (typeof character.surname === 'string' ? character.surname : '')
            : options.previousSurname;

        var change = {
            surname: newSurname,
            year: changeYear,
            reason: typeof reason === 'string' ? reason : 'custom',
            previousSurname: previousSurname,
            spouseId: _isMissing(options.spouseId) ? null : options.spouseId,
            notes: _isMissing(options.notes) ? '' : options.notes
        };

        history.entries.push(change);
        history.lastUpdated = changeYear;

        var update = CS.updateCharacter(id, {
            surname: newSurname,
            surnameHistory: history
        });
        if (!update || update.success !== true) {
            return _fail(update && update.reason
                ? update.reason
                : 'CharacterState refused the update.');
        }

        return _ok({ change: change });
    }

    function revertCharacterSurnameChange(id) {
        if (!_hasId(id)) return _fail('Character id is required.');

        var character = CS._getLiveCharacterForMutation(id);
        if (!character) return _fail('Character not found.');
        if (character.isDeleted === true) {
            return _fail('Character is soft-deleted. Restore first to modify.');
        }

        var history = character.surnameHistory;
        if (!_isPlainObject(history)
            || !Array.isArray(history.entries)
            || history.entries.length === 0) {
            return _fail('No surname changes to revert.');
        }

        var entries = history.entries.slice();
        var lastChange = entries.pop();

        var restoredSurname = lastChange.previousSurname
            || history.birthSurname
            || '';

        var nextHistory = {
            birthSurname: typeof history.birthSurname === 'string' ? history.birthSurname : '',
            entries: entries,
            lastUpdated: entries.length > 0
                ? entries[entries.length - 1].year
                : _resolveYear(character.birthYear)
        };

        var update = CS.updateCharacter(id, {
            surname: restoredSurname,
            surnameHistory: nextHistory
        });
        if (!update || update.success !== true) {
            return _fail(update && update.reason
                ? update.reason
                : 'CharacterState refused the update.');
        }

        return _ok({ reverted: lastChange });
    }

    // =========================================================================
    // 10. RELIGION ORCHESTRATION
    // =========================================================================

    function _requireReligionCommands() {
        if (typeof window.ReligionCommands === 'undefined') {
            return { ok: false, reason: 'ReligionCommands module is not loaded.' };
        }
        return { ok: true };
    }

    function assignCharacterReligion(characterId, religionId, options) {
        if (!_hasId(characterId)) return _fail('Character id is required.');
        if (!_hasId(religionId)) return _fail('Religion id is required.');

        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character) return _fail('Character not found.');
        if (character.isDeleted === true) {
            return _fail('Character is soft-deleted. Restore first to modify.');
        }

        if (character.religionId === religionId) {
            return _ok({ character: character, unchanged: true });
        }

        if (_isMissing(options)) options = {};
        if (!_isPlainObject(options)) {
            return _fail('Options must be a plain object.');
        }

        var deps = _requireReligionCommands();
        if (!deps.ok) return _fail(deps.reason);

        if (!_isValidYearOrMissing(options.year)) {
            return _fail('year must be a valid world year or omitted.');
        }

        var resolvedYear = _resolveYear(options.year);
        var result;

        if (_hasId(character.religionId)) {
            result = window.ReligionCommands.convertCharacter(characterId, religionId, {
                year: resolvedYear,
                reason: _isMissing(options.reason) ? 'personal' : options.reason,
                notes: _isMissing(options.notes) ? '' : options.notes
            });
        } else {
            result = window.ReligionCommands.assignReligionToCharacter(characterId, religionId, {
                year: resolvedYear,
                reason: _isMissing(options.reason) ? 'assignment' : options.reason,
                notes: _isMissing(options.notes) ? '' : options.notes
            });
        }

        if (!result || result.success !== true) {
            return _fail(result && result.reason
                ? result.reason
                : 'Religion mutation failed.');
        }
        return _ok(result);
    }

    function removeCharacterReligion(characterId) {
        if (!_hasId(characterId)) return _fail('Character id is required.');

        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character) return _fail('Character not found.');
        if (character.isDeleted === true) {
            return _fail('Character is soft-deleted. Restore first to modify.');
        }

        if (!_hasId(character.religionId)) {
            return _fail('Character has no religion.');
        }

        var deps = _requireReligionCommands();
        if (!deps.ok) return _fail(deps.reason);

        var result = window.ReligionCommands.removeReligionFromCharacter(characterId);
        if (!result || result.success !== true) {
            return _fail(result && result.reason
                ? result.reason
                : 'Religion removal failed.');
        }
        return _ok(result);
    }

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.CharacterCommands = {
        updateCharacterFields: updateCharacterFields,
        updateCharactersFields: updateCharactersFields,
        updateCharacter: updateCharacter,

        markDeceased: markDeceased,

        getProfession: getProfession,
        getProfessions: getProfessions,

        addProfession: addProfession,
        updateProfession: updateProfession,
        removeProfession: removeProfession,
        removeProfessionFromAll: removeProfessionFromAll,
        replaceProfessions: replaceProfessions,

        setPrimaryProfession: setPrimaryProfession,
        clearPrimaryProfession: clearPrimaryProfession,

        recordCharacterSurnameChange: recordCharacterSurnameChange,
        revertCharacterSurnameChange: revertCharacterSurnameChange,

        assignCharacterReligion: assignCharacterReligion,
        removeCharacterReligion: removeCharacterReligion
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterCommands;
    }
})();
