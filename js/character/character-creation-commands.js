/**
 * =============================================================================
 * STILL WATERS - CHARACTER CREATION COMMANDS
 * (js/character/character-creation-commands.js)
 * =============================================================================
 *
 * Creation boundary for the character domain.
 *
 * SCOPE:
 *   - createCharacter(data, options)          single explicit creation
 *   - createRandomCharacter(options)          random generation + creation
 *   - bulkCreateCharacters(dataArray, options) batch creation
 *   - createCharacterFromData(builtCharacter)  insert a pre-built character
 *
 * OUT OF SCOPE:
 *   - Field updates       → character-commands.js
 *   - Deletion            → character-deletion-commands.js
 *   - Family establishment → family-commands.js (called here for parent ids)
 *   - Profession records   → already part of character.professions input;
 *                            role-based assignment → role-commands.js
 *   - Persistence          → character-state.js
 *   - Events / toasts      → caller
 *
 * COMPOSITION:
 *   All three creation paths funnel through the same internal primitive:
 *
 *       _createCharacterInternal(data, options)
 *           1. buildCharacter(data, { currentYear })
 *           2. CharacterState.addCharacter(built)
 *           3. FamilyCommands.setParent (motherId / fatherId, if provided)
 *           4. ReligionCommands.assignReligionToCharacter (if religionId
 *              and ReligionCommands are loaded)
 *
 *   The factory produces the record. CharacterState stores it. Family and
 *   religion commands establish their edges. This file orchestrates.
 *
 * CONTRACT:
 *   - Every public command returns { success: boolean, reason?, ... }.
 *   - All validation happens before any mutation. Partial creation on
 *     failure is not permitted.
 *   - The mutation lock is not used. Commands are synchronous; no public
 *     command calls another public command.
 *   - No fallbacks. If the factory or CharacterState is missing at load,
 *     this module throws.
 *
 * DEPENDENCIES (REQUIRED):
 *   - character-state.js      (CharacterState.addCharacter)
 *   - character-factory.js    (buildCharacter)
 *   - time.js                 (getCurrentYear)
 *
 * DEPENDENCIES (OPTIONAL, called only when the feature is used):
 *   - character-generator.js  (generateRandomCharacterData) — for random
 *   - family-commands.js      (FamilyCommands.setParent)
 *   - religion-commands.js    (ReligionCommands.assignReligionToCharacter)
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
            'character-creation-commands.js requires character-state.js (CharacterState).'
        );
    }
    if (typeof window.buildCharacter !== 'function') {
        throw new Error(
            'character-creation-commands.js requires character-factory.js (buildCharacter).'
        );
    }
    if (typeof window.getCurrentYear !== 'function') {
        throw new Error(
            'character-creation-commands.js requires time.js (getCurrentYear).'
        );
    }

    var CS = window.CharacterState;

    if (typeof CS.addCharacter !== 'function') {
        throw new Error(
            'character-creation-commands.js: CharacterState.addCharacter is required.'
        );
    }
    if (typeof CS.addCharacters !== 'function') {
        throw new Error(
            'character-creation-commands.js: CharacterState.addCharacters is required.'
        );
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
    // 2. HELPERS
    // =========================================================================

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isPlainObject(v) {
        if (v === null || typeof v !== 'object') return false;
        var proto = Object.getPrototypeOf(v);
        return proto === Object.prototype || proto === null;
    }

    /**
     * Establishes family edges for a freshly created character.
     * Called only after the character is in CharacterState so that
     * FamilyCommands can resolve both ends.
     *
     * @returns {{ ok: boolean, reason?: string }}
     */
    function _establishFamilyEdges(characterId, data, birthYear) {
        var motherId = _hasId(data.motherId) ? data.motherId : null;
        var fatherId = _hasId(data.fatherId) ? data.fatherId : null;

        if (!motherId && !fatherId) return { ok: true };

        if (typeof window.FamilyCommands === 'undefined') {
            return {
                ok: false,
                reason: 'FamilyCommands is required to set parent references at creation.'
            };
        }
        if (typeof window.FamilyCommands.setParent !== 'function') {
            return {
                ok: false,
                reason: 'FamilyCommands.setParent is required to set parent references.'
            };
        }

        var startYear = _isMissing(birthYear) ? window.getCurrentYear() : birthYear;

        if (motherId) {
            var motherResult = window.FamilyCommands.setParent(
                characterId, motherId, 'mother',
                { biological: true, startYear: startYear }
            );
            if (!motherResult || motherResult.success !== true) {
                return {
                    ok: false,
                    reason: 'Failed to set mother: ' +
                        (motherResult && motherResult.reason ? motherResult.reason : 'unknown')
                };
            }
        }

        if (fatherId) {
            var fatherResult = window.FamilyCommands.setParent(
                characterId, fatherId, 'father',
                { biological: true, startYear: startYear }
            );
            if (!fatherResult || fatherResult.success !== true) {
                return {
                    ok: false,
                    reason: 'Failed to set father: ' +
                        (fatherResult && fatherResult.reason ? fatherResult.reason : 'unknown')
                };
            }
        }

        return { ok: true };
    }

    /**
     * Establishes the religion edge for a freshly created character.
     * Only runs when the data carries a religionId AND ReligionCommands
     * is loaded. Absence of ReligionCommands is tolerated: the character
     * simply keeps whatever religionId the factory stored, which may be
     * null.
     *
     * Note: the factory already stores religionId on the record. This
     * call exists so that ReligionCommands can append to religionHistory
     * and any other religion-side state.
     */
    function _establishReligionEdge(characterId, data) {
        if (!_hasId(data.religionId)) return { ok: true };
        if (typeof window.ReligionCommands === 'undefined') return { ok: true };
        if (typeof window.ReligionCommands.assignReligionToCharacter !== 'function') {
            return { ok: true };
        }

        var result = window.ReligionCommands.assignReligionToCharacter(
            characterId, data.religionId,
            {
                year: _isMissing(data.birthYear) ? window.getCurrentYear() : data.birthYear,
                reason: 'birth',
                notes: ''
            }
        );

        if (!result || result.success !== true) {
            return {
                ok: false,
                reason: 'Failed to record religion: ' +
                    (result && result.reason ? result.reason : 'unknown')
            };
        }
        return { ok: true };
    }

    // =========================================================================
    // 3. INTERNAL CREATION PRIMITIVE
    // =========================================================================

    /**
     * The single creation path. All three public commands funnel here.
     *
     * Steps:
     *   1. Build the character record via the factory.
     *   2. Insert into CharacterState.
     *   3. Establish family edges (motherId / fatherId) if provided.
     *   4. Establish religion edge if religionId provided and available.
     *
     * Family edges are established AFTER the character is in state so that
     * FamilyCommands can resolve both the child and the parent. If family
     * or religion establishment fails, the character is removed from state
     * and the whole operation reports failure. This keeps creation atomic
     * from the caller's perspective.
     *
     * @private
     */
    function _createCharacterInternal(data, options) {
        if (_isMissing(options)) options = {};
        var currentYear = _isMissing(options.currentYear)
            ? window.getCurrentYear()
            : options.currentYear;

        // 1. Build
        var built = window.buildCharacter(data, { currentYear: currentYear });
        if (!built.success) {
            return _fail(built.reason);
        }
        var character = built.data;

        // 2. Insert
        var inserted = CS.addCharacter(character);
        if (!inserted.success) {
            return _fail(inserted.reason || 'CharacterState refused insertion.');
        }

        // 3. Family
        var familyResult = _establishFamilyEdges(character.id, data, character.birthYear);
        if (!familyResult.ok) {
            CS.removeCharacter(character.id);
            return _fail(familyResult.reason);
        }

        // 4. Religion
        var religionResult = _establishReligionEdge(character.id, data);
        if (!religionResult.ok) {
            CS.removeCharacter(character.id);
            return _fail(religionResult.reason);
        }

        return _ok({ data: character });
    }

    // =========================================================================
    // 4. PUBLIC — SINGLE CREATION
    // =========================================================================

    /**
     * Creates a character from explicit data.
     *
     * @param {Object} data       character input (see character-factory.js)
     * @param {Object} [options]
     * @param {number} [options.currentYear]
     * @returns {{ success: boolean, data?: Object, reason?: string }}
     */
    function createCharacter(data, options) {
        if (_isMissing(data)) data = {};
        if (!_isPlainObject(data)) {
            return _fail('Character data must be a plain object.');
        }
        if (!_isMissing(options) && !_isPlainObject(options)) {
            return _fail('Options must be a plain object.');
        }

        return _createCharacterInternal(data, options);
    }

    /**
     * Creates a character from an already-built record.
     * Reserved for import / migration paths.
     *
     * The record is not re-built. It is validated minimally (id, name) and
     * inserted via CharacterState.addCharacter. Family and religion edges
     * are NOT established by this path; the caller is responsible for
     * running the appropriate commands afterwards.
     *
     * @param {Object} builtCharacter
     * @returns {{ success: boolean, data?: Object, reason?: string }}
     */
    function createCharacterFromData(builtCharacter) {
        if (!_isPlainObject(builtCharacter)) {
            return _fail('Character must be a plain object.');
        }
        if (!_hasId(builtCharacter.id)) {
            return _fail('Character id is required.');
        }
        if (typeof builtCharacter.name !== 'string'
            || builtCharacter.name.trim() === '') {
            return _fail('Character name is required.');
        }

        var inserted = CS.addCharacter(builtCharacter);
        if (!inserted.success) {
            return _fail(inserted.reason || 'CharacterState refused insertion.');
        }
        return _ok({ data: builtCharacter });
    }

    // =========================================================================
    // 5. PUBLIC — RANDOM CREATION
    // =========================================================================

    /**
     * Creates a fully random character.
     *
     * @param {Object} [options] passed to generateRandomCharacterData
     * @returns {{ success: boolean, data?: Object, reason?: string }}
     */
    function createRandomCharacter(options) {
        if (_isMissing(options)) options = {};
        if (!_isPlainObject(options)) {
            return _fail('Options must be a plain object.');
        }

        if (typeof window.generateRandomCharacterData !== 'function') {
            return _fail('character-generator.js is not loaded; random generation is unavailable.');
        }

        var generated = window.generateRandomCharacterData(options);
        if (!generated || generated.success !== true) {
            return _fail(generated && generated.reason
                ? generated.reason
                : 'Random generation failed.');
        }

        return _createCharacterInternal(generated.data, options);
    }

    // =========================================================================
    // 6. PUBLIC — BULK CREATION
    // =========================================================================

    /**
     * Bulk-creates multiple characters in one transaction.
     *
     * Validation:
     *   - all entries must be plain objects
     *   - all entries must build successfully via the factory
     *
     * Family and religion edges are established for each entry after the
     * batch is inserted. If any family or religion step fails, the
     * affected character is removed and the entry is reported as an error.
     * The batch does not roll back successful siblings; the response
     * indicates partial success.
     *
     * @param {Array<Object>} dataArray
     * @param {Object} [options]
     * @returns {{ success: boolean, count: number, data: Array, errors: Array }}
     */
    function bulkCreateCharacters(dataArray, options) {
        if (!Array.isArray(dataArray)) {
            return {
                success: false,
                reason: 'Expected an array of character data.',
                count: 0,
                data: [],
                errors: []
            };
        }
        if (dataArray.length === 0) {
            return { success: true, count: 0, data: [], errors: [] };
        }
        if (!_isMissing(options) && !_isPlainObject(options)) {
            return {
                success: false,
                reason: 'Options must be a plain object.',
                count: 0,
                data: [],
                errors: []
            };
        }

        var currentYear = _isMissing(options) || _isMissing(options.currentYear)
            ? window.getCurrentYear()
            : options.currentYear;

        // Phase 1 — build all records. Any build failure aborts the batch.
        var built = [];
        for (var i = 0; i < dataArray.length; i++) {
            var data = dataArray[i];
            if (_isMissing(data)) data = {};
            if (!_isPlainObject(data)) {
                return {
                    success: false,
                    reason: 'Entry at index ' + i + ' is not a plain object.',
                    count: 0,
                    data: [],
                    errors: []
                };
            }

            var result = window.buildCharacter(data, { currentYear: currentYear });
            if (!result.success) {
                return {
                    success: false,
                    reason: 'Entry at index ' + i + ' failed: ' + result.reason,
                    count: 0,
                    data: [],
                    errors: []
                };
            }
            built.push({ data: data, character: result.data });
        }

        // Phase 2 — insert all records in one CharacterState call.
        var characters = [];
        for (var j = 0; j < built.length; j++) {
            characters.push(built[j].character);
        }

        var inserted = CS.addCharacters(characters);
        if (!inserted.success) {
            return {
                success: false,
                reason: inserted.reason || 'CharacterState refused batch insertion.',
                count: 0,
                data: [],
                errors: []
            };
        }

        // Phase 3 — establish family / religion edges per entry.
        var created = [];
        var errors = [];
        for (var k = 0; k < built.length; k++) {
            var entry = built[k];

            var familyResult = _establishFamilyEdges(
                entry.character.id, entry.data, entry.character.birthYear
            );
            if (!familyResult.ok) {
                CS.removeCharacter(entry.character.id);
                errors.push({
                    index: k,
                    characterId: entry.character.id,
                    reason: familyResult.reason
                });
                continue;
            }

            var religionResult = _establishReligionEdge(entry.character.id, entry.data);
            if (!religionResult.ok) {
                CS.removeCharacter(entry.character.id);
                errors.push({
                    index: k,
                    characterId: entry.character.id,
                    reason: religionResult.reason
                });
                continue;
            }

            created.push(entry.character);
        }

        return {
            success: errors.length === 0,
            partial: errors.length > 0 && created.length > 0,
            count: created.length,
            data: created,
            errors: errors
        };
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.CharacterCreationCommands = {
        createCharacter: createCharacter,
        createCharacterFromData: createCharacterFromData,
        createRandomCharacter: createRandomCharacter,
        bulkCreateCharacters: bulkCreateCharacters
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterCreationCommands;
    }
})();
