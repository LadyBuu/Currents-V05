/**
 * =============================================================================
 * STILL WATERS - CHARACTER CREATION COMMANDS
 * (js/character/character-creation-commands.js)
 * =============================================================================
 *
 * LOCATION: js/character/character-creation-commands.js
 *
 * Creation boundary for the character domain.
 *
 * SCOPE:
 *   - createCharacter(data, options)           single explicit creation
 *   - createRandomCharacter(options)           random generation + creation
 *   - bulkCreateCharacters(dataArray, options) batch creation
 *   - createCharacterFromData(builtCharacter)  insert a pre-built character
 *
 * OUT OF SCOPE:
 *   - Field updates        -> character-commands.js
 *   - Deletion             -> character-deletion-commands.js
 *   - Family establishment -> family-commands.js (called here for parent ids)
 *   - Persistence          -> character-state.js
 *   - Events / toasts      -> caller
 *
 * COMPOSITION:
 *   All creation paths funnel through _createCharacterInternal:
 *       1. buildCharacter(data, { currentYear })
 *       2. CharacterState.addCharacter(built)
 *       3. FamilyCommands.setParent for each parent in options
 *       4. ReligionCommands.assignReligionToCharacter if applicable
 *
 *   createCharacterFromData is the EXCEPTION: it skips buildCharacter
 *   and inserts a pre-built record directly. It therefore validates the
 *   record's shape first (see PRE-BUILT VALIDATION below).
 *
 * FAMILY EDGES:
 *   The character record no longer stores motherId / fatherId. Parent
 *   edges are created through FamilyCommands.setParent using the
 *   options-based signature:
 *
 *       FamilyCommands.setParent(childId, parentId, {
 *           parentType: 'biological',
 *           parentRole: 'mother' | 'father' | 'parent',
 *           startYear: <birthYear>,
 *           notes: ''
 *       })
 *
 *   Parent ids are supplied via options.parents, an array of
 *   { parentId, parentRole, parentType } entries. This replaces the
 *   deprecated data.motherId / data.fatherId fields.
 *
 * PRE-BUILT VALIDATION:
 *   createCharacterFromData does NOT regenerate the character id (the
 *   caller owns it) and does NOT call buildCharacter. Instead it calls
 *   window.validateBuiltCharacter (from character-factory.js), which
 *   checks:
 *     - the object is a plain object
 *     - id is a non-empty string
 *     - name is a non-empty string
 *     - every domain-owned embedded container is present and has the
 *       correct shape (arrays for professions / rankAssignments /
 *       relationships / friends / apprentices)
 *     - createdAt and updatedAt are present and numeric
 *
 *   If validation fails, this command refuses the insert. The caller
 *   gets a structured failure and can retry with a properly-shaped
 *   record. The old behaviour — inserting whatever the caller supplied
 *   and letting downstream projections observe undefined fields — is
 *   deliberately removed.
 *
 * CONTRACT:
 *   - Every public command returns { success: boolean, reason?, ... }.
 *   - All validation happens before any mutation.
 *   - No lock. Commands are synchronous.
 *   - No fallbacks. Missing dependencies throw at load.
 *
 * DEPENDENCIES (REQUIRED):
 *   - character-state.js      (CharacterState.addCharacter,
 *                              CharacterState.addCharacters)
 *   - character-factory.js    (buildCharacter, validateBuiltCharacter)
 *   - time.js                 (getCurrentYear)
 *
 * DEPENDENCIES (OPTIONAL, called only when the feature is used):
 *   - character-generator.js  (generateRandomCharacterData)
 *   - family-commands.js      (FamilyCommands.setParent)
 *   - religion-commands.js    (ReligionCommands.assignReligionToCharacter)
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function () {
    'use strict';

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
    if (typeof window.validateBuiltCharacter !== 'function') {
        throw new Error(
            'character-creation-commands.js requires character-factory.js ' +
            '(validateBuiltCharacter).'
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
    if (typeof CS.removeCharacter !== 'function') {
        throw new Error(
            'character-creation-commands.js: CharacterState.removeCharacter is required.'
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

    // =========================================================================
    // 3. FAMILY EDGES
    // =========================================================================

    /**
     * Establishes family edges for a freshly created character.
     * The character must already be in CharacterState.
     *
     * options.parents is an array of:
     *     { parentId, parentRole?, parentType? }
     *
     * Defaults:
     *     parentRole  inferred by FamilyRules.normalizeParentRole
     *     parentType  'biological'
     *
     * Returns { ok: boolean, reason?: string }.
     */
    function _establishFamilyEdges(characterId, options, birthYear) {
        if (_isMissing(options)) return { ok: true };
        var parents = options.parents;
        if (_isMissing(parents)) return { ok: true };
        if (!Array.isArray(parents)) {
            return { ok: false, reason: 'options.parents must be an array.' };
        }
        if (parents.length === 0) return { ok: true };

        if (typeof window.FamilyCommands === 'undefined') {
            return {
                ok: false,
                reason: 'FamilyCommands is required to set parent references.'
            };
        }
        if (typeof window.FamilyCommands.setParent !== 'function') {
            return {
                ok: false,
                reason: 'FamilyCommands.setParent is required to set parent references.'
            };
        }

        var startYear = _isMissing(birthYear) ? window.getCurrentYear() : birthYear;

        for (var i = 0; i < parents.length; i++) {
            var p = parents[i];
            if (!_isPlainObject(p) || !_hasId(p.parentId)) {
                return {
                    ok: false,
                    reason: 'options.parents[' + i + '] must have a parentId.'
                };
            }

            var parentType = _isMissing(p.parentType) ? 'biological' : p.parentType;
            var callOptions = {
                parentType: parentType,
                startYear: startYear
            };
            if (!_isMissing(p.parentRole)) callOptions.parentRole = p.parentRole;

            var result = window.FamilyCommands.setParent(
                characterId,
                p.parentId,
                callOptions
            );
            if (!result || result.success !== true) {
                return {
                    ok: false,
                    reason: 'Failed to set parent ' + p.parentId + ': ' +
                        (result && result.reason ? result.reason : 'unknown')
                };
            }
        }

        return { ok: true };
    }

    /**
     * Establishes the religion edge for a freshly created character.
     * Only runs when ReligionCommands is loaded and religionId is set.
     */
    function _establishReligionEdge(characterId, data) {
        if (!data || !_hasId(data.religionId)) return { ok: true };
        if (typeof window.ReligionCommands === 'undefined') return { ok: true };
        if (typeof window.ReligionCommands.assignReligionToCharacter !== 'function') {
            return { ok: true };
        }

        var result = window.ReligionCommands.assignReligionToCharacter(
            characterId,
            data.religionId,
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
    // 4. INTERNAL CREATION PRIMITIVE
    // =========================================================================

    function _createCharacterInternal(data, options) {
        if (_isMissing(options)) options = {};
        var currentYear = _isMissing(options.currentYear)
            ? window.getCurrentYear()
            : options.currentYear;

        var built = window.buildCharacter(data, { currentYear: currentYear });
        if (!built.success) return _fail(built.reason);
        var character = built.data;

        var inserted = CS.addCharacter(character);
        if (!inserted.success) {
            return _fail(inserted.reason || 'CharacterState refused insertion.');
        }

        var familyResult = _establishFamilyEdges(character.id, options, character.birthYear);
        if (!familyResult.ok) {
            CS.removeCharacter(character.id);
            return _fail(familyResult.reason);
        }

        var religionResult = _establishReligionEdge(character.id, data);
        if (!religionResult.ok) {
            CS.removeCharacter(character.id);
            return _fail(religionResult.reason);
        }

        return _ok({ data: character });
    }

    // =========================================================================
    // 5. PUBLIC - SINGLE CREATION
    // =========================================================================

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
     * Inserts a character that the caller has already built via
     * buildCharacter (or an equivalent factory). Skips buildCharacter
     * but validates the record shape first.
     *
     * Idempotency: if a character with the same id already exists,
     * CharacterState.addCharacter refuses the insert and this command
     * surfaces that failure unchanged.
     */
    function createCharacterFromData(builtCharacter) {
        var validation = window.validateBuiltCharacter(builtCharacter);
        if (!validation.ok) {
            return _fail(validation.reason);
        }

        var inserted = CS.addCharacter(builtCharacter);
        if (!inserted.success) {
            return _fail(inserted.reason || 'CharacterState refused insertion.');
        }
        return _ok({ data: builtCharacter });
    }

    // =========================================================================
    // 6. PUBLIC - RANDOM CREATION
    // =========================================================================

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
    // 7. PUBLIC - BULK CREATION
    // =========================================================================

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

        var created = [];
        var errors = [];
        for (var k = 0; k < built.length; k++) {
            var entry = built[k];

            var familyResult = _establishFamilyEdges(
                entry.character.id,
                options,
                entry.character.birthYear
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
    // 8. EXPORTS
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
