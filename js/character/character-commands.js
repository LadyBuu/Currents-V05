/**
 * =============================================================================
 * STILL WATERS - CHARACTER COMMANDS (js/character/character-commands.js)
 * =============================================================================
 *
 * LOCATION: js/character/character-commands.js
 *
 * Mutation boundary for character-owned state.
 *
 * SCOPE:
 *   - Character-owned field updates
 *   - Trait array management on the character record
 *   - Profession array management on the character record
 *   - Rank assignment array management on the character record
 *   - Surname history mutations
 *   - Religion assignment orchestration (delegates to ReligionCommands)
 *   - Bulk character-owned field updates
 *   - Death transition (markDeceased) — the single canonical writer of
 *     isDeceased and its associated fields
 *   - Education field writers (education, educationHistory, subjectProgress,
 *     isLiterate) — the only sanctioned writers for these character-owned
 *     fields. EducationCommands and EducationLearning route through these.
 *   - Rank field writers (rankAssignments, activeRankId, activeRankNumber) —
 *     the only sanctioned writers for these character-owned fields.
 *     RankCommands and RankAssignment route through these.
 *
 * OUT OF SCOPE:
 *   - Character creation           -> character-creation-commands.js
 *   - Character deletion           -> character-deletion-commands.js
 *   - Family mutations             -> family-commands.js
 *   - Mortality policy             -> mortality-rules.js
 *   - Lifecycle orchestration      -> character-lifecycle.js
 *   - Persistence mechanics        -> character-state.js
 *   - Cross-domain events, toasts  -> caller
 *   - Education policy             -> education-rules.js
 *   - Education orchestration      -> education-commands.js
 *   - Rank policy                  -> rank-rules.js
 *   - Rank orchestration           -> rank-commands.js / rank-assignment.js
 *   - Trait vocabulary             -> constants/character-traits.js
 *   - Trait acquisition policy     -> caller (there is none)
 *
 * DEATH TRANSITION (markDeceased):
 *   markDeceased(characterId, deathData, options) is the ONLY function
 *   that writes isDeceased = true and the associated death fields. It
 *   validates via MortalityRules.validateDeath, then calls
 *   CharacterState.updateCharacter once. It does not dispatch
 *   family/relationship/rank/succession consequences; the caller
 *   (CharacterLifecycle.killCharacter or a UI command) is responsible
 *   for that.
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
 *   options is optional and supports:
 *   {
 *     referenceYear,         number, optional.
 *                            The year to treat as "now" for death-year
 *                            validation. Defaults to window.getCurrentYear().
 *                            This exists because CharacterLifecycle
 *                            simulates multi-year advances: a death in
 *                            year N+K is ahead of wall-clock current year,
 *                            so validating against getCurrentYear() would
 *                            reject every death after the first simulated
 *                            year. The simulation passes the simulated
 *                            year here. UI callers and direct commands
 *                            omit it and get the wall-clock behaviour.
 *   }
 *
 * TRAITS:
 *   The character record carries `traits` as a domain-owned array of
 *   canonical trait ids (see constants/character-traits.js). Traits are
 *   writable only through this module's trait API:
 *
 *     getTraits(characterId)            -> string[]
 *     hasTrait(characterId, traitId)    -> boolean
 *     replaceTraits(characterId, list)  -> replace-all
 *     addTrait(characterId, traitId)    -> idempotent add
 *     removeTrait(characterId, traitId) -> idempotent remove
 *
 *   Traits are NOT character-owned from the perspective of the generic
 *   updateCharacterFields path: `traits` is in _DOMAIN_OWNED_FIELDS so
 *   that path refuses it. This is the same pattern professions and
 *   rankAssignments follow. The single write mechanism is
 *   CS.applyDomainFieldPatch.
 *
 *   Note on naming: `replaceTraits` is the canonical name, matching
 *   `replaceProfessions`. `setTraits` is provided as a one-line alias
 *   for callers that reach for the plan's original name; it does the
 *   same thing.
 *
 * EDUCATION FIELDS:
 *   Four character-owned fields are written only by this module:
 *
 *     character.education         object, keyed by institutionId.
 *     character.educationHistory  array of history entries.
 *     character.subjectProgress   object, keyed by subject key.
 *     character.isLiterate        boolean mirror of the literacy subject.
 *
 *   The generic updateCharacterFields / updateCharactersFields refuse
 *   these four fields. Use the dedicated writers below.
 *
 * RANK FIELDS:
 *   Three character-owned fields are written only by this module:
 *
 *     character.rankAssignments   array of assignment records.
 *     character.activeRankId      string|null.
 *     character.activeRankNumber  number|null.
 *
 *   The generic updateCharacterFields / updateCharactersFields refuse
 *   these three fields. Use the dedicated writers below.
 *
 * DEPENDENCIES (REQUIRED):
 *   - character-state.js: CharacterState
 *   - time.js: getCurrentYear, isValidYear
 *
 * DEPENDENCIES (OPTIONAL, called only when the feature is used):
 *   - religion-commands.js (ReligionCommands)
 *   - mortality-rules.js (MortalityRules) — required for markDeceased only
 *   - constants/character-traits.js (CHARACTER_TRAIT_VALUES) — used
 *     defensively by trait commands to reject unknown ids at the write
 *     boundary. When absent, the commands accept any non-empty string.
 *     Production load order guarantees presence.
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
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Trait API added: getTraits, hasTrait, replaceTraits, setTraits
 *       (alias), addTrait, removeTrait.
 *     - traits added to _DOMAIN_OWNED_FIELDS so the generic update path
 *       refuses it.
 *     - Trait writes route through CS.applyDomainFieldPatch, matching
 *       the professions and rankAssignments pattern.
 *     - No other behavioural change.
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

    function _isValidProficiencyLevel(v) {
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
        traits: true,
        professions: true,
        rankAssignments: true,
        activeRankId: true,
        activeRankNumber: true,
        relationships: true,
        friends: true,
        apprenticeshipDetails: true,
        apprentices: true,
        isDeleted: true,
        deletedAt: true,
        education: true,
        educationHistory: true,
        subjectProgress: true,
        isLiterate: true
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
    // 5. TRAIT NORMALISATION AND WRITE
    // =========================================================================
    //
    // Traits are canonical trait ids (see constants/character-traits.js).
    // The write path uses CS.applyDomainFieldPatch — the same mechanism
    // professions and rankAssignments use. The vocabulary check is
    // defensive: if the constants file is not loaded, the commands
    // accept any non-empty string. In production the vocabulary is
    // always loaded before this file; the soft-fail behaviour exists so
    // that a bare test harness that didn't load constants/ still works.

    function _vocabularyAvailable() {
        return Array.isArray(window.CHARACTER_TRAIT_VALUES);
    }

    function _validateTraitId(traitId) {
        if (typeof traitId !== 'string' || traitId.length === 0) {
            return { ok: false, reason: 'Trait id must be a non-empty string.' };
        }
        if (_vocabularyAvailable()
            && window.CHARACTER_TRAIT_VALUES.indexOf(traitId) === -1) {
            return { ok: false, reason: 'Unknown trait: "' + traitId + '".' };
        }
        return { ok: true };
    }

    /**
     * Normalises a caller-supplied trait array.
     *
     * - Rejects non-arrays.
     * - Rejects non-string entries.
     * - Rejects duplicates.
     * - Rejects unknown ids (when the vocabulary is loaded).
     * - Returns a fresh array.
     */
    function _normaliseTraits(traits) {
        if (!Array.isArray(traits)) {
            return { ok: false, reason: 'traits must be an array.' };
        }
        var seen = {};
        var out = [];
        for (var i = 0; i < traits.length; i++) {
            var entry = traits[i];
            var check = _validateTraitId(entry);
            if (!check.ok) {
                return {
                    ok: false,
                    reason: 'traits[' + i + ']: ' + check.reason
                };
            }
            if (seen[entry] === true) {
                return {
                    ok: false,
                    reason: 'traits[' + i + '] is a duplicate: "' + entry + '".'
                };
            }
            seen[entry] = true;
            out.push(entry);
        }
        return { ok: true, traits: out };
    }

    function _writeTraits(characterId, nextTraits) {
        var result = CS.applyDomainFieldPatch(characterId, {
            traits: nextTraits
        });
        if (!result || result.success !== true) {
            return _fail(result && result.reason
                ? result.reason
                : 'CharacterState refused the trait write.');
        }
        return _ok();
    }

    // =========================================================================
    // 6. TRAIT API
    // =========================================================================

    /**
     * Returns the character's traits as a fresh array. Missing character
     * or missing/absent traits yields [].
     */
    function getTraits(characterId) {
        if (!_hasId(characterId)) return [];
        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character || !Array.isArray(character.traits)) return [];
        return character.traits.slice();
    }

    /**
     * True iff the character currently has the given trait.
     */
    function hasTrait(characterId, traitId) {
        if (!_hasId(characterId)) return false;
        if (typeof traitId !== 'string' || traitId.length === 0) return false;
        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character || !Array.isArray(character.traits)) return false;
        return character.traits.indexOf(traitId) !== -1;
    }

    /**
     * Replaces the character's entire trait array.
     *
     * Validates each entry (shape, deduplication, and — when the
     * vocabulary is loaded — canonicality) before writing.
     */
    function replaceTraits(characterId, traits) {
        if (!_hasId(characterId)) return _fail('Character id is required.');
        if (!Array.isArray(traits)) return _fail('traits must be an array.');

        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character) return _fail('Character not found.');
        if (character.isDeleted === true) {
            return _fail('Character is soft-deleted. Restore first to modify.');
        }

        var normalised = _normaliseTraits(traits);
        if (!normalised.ok) return _fail(normalised.reason);

        var writeResult = _writeTraits(characterId, normalised.traits);
        if (!writeResult.success) return writeResult;

        return _ok({ traits: normalised.traits.slice() });
    }

    /**
     * Alias for replaceTraits, named to match the plan. Both names do
     * the same thing; replaceTraits is canonical because it matches
     * replaceProfessions.
     */
    function setTraits(characterId, traits) {
        return replaceTraits(characterId, traits);
    }

    /**
     * Adds a single trait. Idempotent: if the trait is already present,
     * returns success with unchanged: true and does not write.
     */
    function addTrait(characterId, traitId) {
        if (!_hasId(characterId)) return _fail('Character id is required.');

        var check = _validateTraitId(traitId);
        if (!check.ok) return _fail(check.reason);

        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character) return _fail('Character not found.');
        if (character.isDeleted === true) {
            return _fail('Character is soft-deleted. Restore first to modify.');
        }

        var existing = Array.isArray(character.traits)
            ? character.traits.slice()
            : [];

        if (existing.indexOf(traitId) !== -1) {
            return _ok({ traits: existing, unchanged: true });
        }

        existing.push(traitId);

        var writeResult = _writeTraits(characterId, existing);
        if (!writeResult.success) return writeResult;

        return _ok({ traits: existing.slice(), unchanged: false });
    }

    /**
     * Removes a single trait. Idempotent: if the trait is not present,
     * returns success with unchanged: true and does not write.
     */
    function removeTrait(characterId, traitId) {
        if (!_hasId(characterId)) return _fail('Character id is required.');
        if (typeof traitId !== 'string' || traitId.length === 0) {
            return _fail('Trait id must be a non-empty string.');
        }

        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character) return _fail('Character not found.');
        if (character.isDeleted === true) {
            return _fail('Character is soft-deleted. Restore first to modify.');
        }

        var existing = Array.isArray(character.traits)
            ? character.traits.slice()
            : [];

        var idx = existing.indexOf(traitId);
        if (idx === -1) {
            return _ok({ traits: existing, unchanged: true });
        }

        existing.splice(idx, 1);

        var writeResult = _writeTraits(characterId, existing);
        if (!writeResult.success) return writeResult;

        return _ok({ traits: existing.slice(), unchanged: false });
    }

    // =========================================================================
    // 7. DEATH TRANSITION (markDeceased)
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
     * @param {string} characterId
     * @param {Object} deathData
     * @param {Object} [options]
     * @param {number} [options.referenceYear]
     *   The year to treat as "now" for validation. Defaults to
     *   window.getCurrentYear(). CharacterLifecycle.advanceMortality
     *   supplies the simulated year here so that multi-year simulation
     *   can produce deaths in years ahead of the wall-clock year.
     *
     * Returns { success, reason?, deathRecord? }.
     */
    function markDeceased(characterId, deathData, options) {
        if (!_hasId(characterId)) return _fail('Character id is required.');
        if (!_isPlainObject(deathData)) {
            return _fail('deathData must be a plain object.');
        }
        if (!_isMissing(options) && !_isPlainObject(options)) {
            return _fail('options must be a plain object when provided.');
        }

        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character) return _fail('Character not found.');
        if (character.isDeceased === true) {
            return _fail('Character is already deceased.');
        }

        var deps = _requireMortalityRules();
        if (!deps.ok) return _fail(deps.reason);

        // Reference year: caller-supplied (simulation) or wall-clock.
        // Validation is against this, not against getCurrentYear().
        var referenceYear = (_isPlainObject(options)
            && !_isMissing(options.referenceYear)
            && window.isValidYear(options.referenceYear) === true)
            ? options.referenceYear
            : window.getCurrentYear();

        var validationFacts = {
            characterId: characterId,
            isDeceased: character.isDeceased === true,
            birthYear: character.birthYear,
            deathYear: deathData.deathYear,
            currentYear: referenceYear,
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
    // 8. PROFESSION NORMALISATION
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
    // 9. PROFESSION API
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
    // 10. PROFESSION PRIMACY
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
    // 11. SURNAME HISTORY
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
    // 12. RELIGION ORCHESTRATION
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
    // 13. EDUCATION CONTAINER INITIALISATION
    // =========================================================================

    function initializeEducationContainers(characterId) {
        if (!_hasId(characterId)) return _fail('Character id is required.');

        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character) return _fail('Character not found.');

        var patch = {};
        var changed = false;

        if (!_isPlainObject(character.subjectProgress)) {
            patch.subjectProgress = {};
            changed = true;
        }
        if (character.isLiterate === undefined) {
            patch.isLiterate = false;
            changed = true;
        }
        if (!_isPlainObject(character.education)) {
            patch.education = {};
            changed = true;
        }
        if (!Array.isArray(character.educationHistory)) {
            patch.educationHistory = [];
            changed = true;
        }

        if (!changed) {
            return _ok({ initialized: false });
        }

        patch.updatedAt = Date.now();

        var update = CS.updateCharacter(characterId, patch);
        if (!update || update.success !== true) {
            return _fail(update && update.reason
                ? update.reason
                : 'CharacterState refused the education container write.');
        }

        return _ok({ initialized: true });
    }

    // =========================================================================
    // 14. EDUCATION RECORD (character.education)
    // =========================================================================

    function _normaliseEducationEntry(current, incoming) {
        var base = _isPlainObject(current) ? current : {};
        return {
            institutionName: _isMissing(incoming.institutionName)
                ? (typeof base.institutionName === 'string' ? base.institutionName : '')
                : String(incoming.institutionName),
            institutionType: _isMissing(incoming.institutionType)
                ? (typeof base.institutionType === 'string' ? base.institutionType : '')
                : String(incoming.institutionType),
            enrolledYear: _isMissing(incoming.enrolledYear)
                ? (_isMissing(base.enrolledYear) ? null : base.enrolledYear)
                : incoming.enrolledYear,
            graduated: incoming.graduated === true
                ? true
                : (base.graduated === true),
            graduationYear: incoming.graduationYear !== undefined
                ? incoming.graduationYear
                : (_isMissing(base.graduationYear) ? null : base.graduationYear),
            grantedRole: incoming.grantedRole !== undefined
                ? incoming.grantedRole
                : (_isMissing(base.grantedRole) ? null : base.grantedRole),
            withdrawn: incoming.withdrawn === true
                ? true
                : (base.withdrawn === true),
            withdrawnReason: _isMissing(incoming.withdrawnReason)
                ? (typeof base.withdrawnReason === 'string' ? base.withdrawnReason : '')
                : String(incoming.withdrawnReason),
            withdrawnYear: incoming.withdrawnYear !== undefined
                ? incoming.withdrawnYear
                : (_isMissing(base.withdrawnYear) ? null : base.withdrawnYear)
        };
    }

    function _writeEducationEntry(characterId, institutionId, entry) {
        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character) return _fail('Character not found.');

        var education = _isPlainObject(character.education)
            ? Object.assign({}, character.education)
            : {};
        education[institutionId] = entry;

        var update = CS.updateCharacter(characterId, {
            education: education,
            updatedAt: Date.now()
        });
        if (!update || update.success !== true) {
            return _fail(update && update.reason
                ? update.reason
                : 'CharacterState refused the education write.');
        }
        return _ok();
    }

    function getEducationRecord(characterId, institutionId) {
        if (!_hasId(characterId)) return null;
        if (!_hasId(institutionId)) return null;

        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character) return null;
        if (!_isPlainObject(character.education)) return null;

        var entry = character.education[institutionId];
        return _isPlainObject(entry) ? entry : null;
    }

    function getEducationRecords(characterId) {
        if (!_hasId(characterId)) return [];
        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character || !_isPlainObject(character.education)) return [];

        var out = [];
        for (var institutionId in character.education) {
            if (!Object.prototype.hasOwnProperty.call(character.education, institutionId)) continue;
            var entry = character.education[institutionId];
            if (!_isPlainObject(entry)) continue;
            out.push(Object.assign({ institutionId: institutionId }, entry));
        }
        return out;
    }

    function recordEducationEnrollment(characterId, institutionId, data) {
        if (!_hasId(characterId)) return _fail('Character id is required.');
        if (!_hasId(institutionId)) return _fail('Institution id is required.');
        if (!_isPlainObject(data)) return _fail('Enrollment data must be a plain object.');

        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character) return _fail('Character not found.');
        if (character.isDeleted === true) {
            return _fail('Character is soft-deleted. Restore first to modify.');
        }

        var current = _isPlainObject(character.education)
            ? character.education[institutionId]
            : null;

        if (_isPlainObject(current) && current.graduated === true) {
            return _fail('Character has already graduated from this institution.');
        }

        var entry = _normaliseEducationEntry(current, {
            institutionName: data.institutionName,
            institutionType: data.institutionType,
            enrolledYear: _isMissing(data.enrolledYear)
                ? window.getCurrentYear()
                : data.enrolledYear
        });

        var write = _writeEducationEntry(characterId, institutionId, entry);
        if (!write.success) return write;

        return _ok({ institutionId: institutionId, entry: entry });
    }

    function recordEducationGraduation(characterId, institutionId, data) {
        if (!_hasId(characterId)) return _fail('Character id is required.');
        if (!_hasId(institutionId)) return _fail('Institution id is required.');
        if (!_isPlainObject(data)) return _fail('Graduation data must be a plain object.');

        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character) return _fail('Character not found.');
        if (character.isDeleted === true) {
            return _fail('Character is soft-deleted. Restore first to modify.');
        }

        var current = _isPlainObject(character.education)
            ? character.education[institutionId]
            : null;
        if (!_isPlainObject(current)) {
            return _fail('Character is not enrolled at this institution.');
        }
        if (current.graduated === true) {
            return _fail('Character has already graduated from this institution.');
        }

        var entry = _normaliseEducationEntry(current, {
            graduated: true,
            graduationYear: _isMissing(data.graduationYear)
                ? window.getCurrentYear()
                : data.graduationYear,
            grantedRole: _isMissing(data.grantedRole) ? null : data.grantedRole
        });

        var write = _writeEducationEntry(characterId, institutionId, entry);
        if (!write.success) return write;

        return _ok({ institutionId: institutionId, entry: entry });
    }

    function recordEducationWithdrawal(characterId, institutionId, data) {
        if (!_hasId(characterId)) return _fail('Character id is required.');
        if (!_hasId(institutionId)) return _fail('Institution id is required.');
        if (!_isPlainObject(data)) return _fail('Withdrawal data must be a plain object.');

        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character) return _fail('Character not found.');
        if (character.isDeleted === true) {
            return _fail('Character is soft-deleted. Restore first to modify.');
        }

        var current = _isPlainObject(character.education)
            ? character.education[institutionId]
            : null;
        if (!_isPlainObject(current)) {
            return _fail('Character is not enrolled at this institution.');
        }
        if (current.graduated === true) {
            return _fail('Character has already graduated from this institution.');
        }

        var entry = _normaliseEducationEntry(current, {
            withdrawn: true,
            withdrawnReason: _isMissing(data.reason) ? 'Withdrew' : data.reason,
            withdrawnYear: _isMissing(data.year)
                ? window.getCurrentYear()
                : data.year
        });

        var write = _writeEducationEntry(characterId, institutionId, entry);
        if (!write.success) return write;

        return _ok({ institutionId: institutionId, entry: entry });
    }

    // =========================================================================
    // 15. EDUCATION HISTORY (character.educationHistory)
    // =========================================================================

    function getEducationHistory(characterId) {
        if (!_hasId(characterId)) return [];
        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character || !Array.isArray(character.educationHistory)) return [];
        return character.educationHistory.slice();
    }

    function appendEducationHistory(characterId, entry) {
        if (!_hasId(characterId)) return _fail('Character id is required.');
        if (!_isPlainObject(entry)) {
            return _fail('History entry must be a plain object.');
        }

        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character) return _fail('Character not found.');
        if (character.isDeleted === true) {
            return _fail('Character is soft-deleted. Restore first to modify.');
        }

        var history = Array.isArray(character.educationHistory)
            ? character.educationHistory.slice()
            : [];

        var stored = Object.assign({}, entry);
        history.push(stored);

        var update = CS.updateCharacter(characterId, {
            educationHistory: history,
            updatedAt: Date.now()
        });
        if (!update || update.success !== true) {
            return _fail(update && update.reason
                ? update.reason
                : 'CharacterState refused the education history write.');
        }

        return _ok({ entry: stored, count: history.length });
    }

    // =========================================================================
    // 16. SUBJECT PROGRESS (character.subjectProgress)
    // =========================================================================

    function getSubjectProgress(characterId, key) {
        if (!_hasId(characterId)) return null;
        if (!_hasId(key)) return null;

        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character) return null;
        if (!_isPlainObject(character.subjectProgress)) return null;

        var entry = character.subjectProgress[key];
        return _isPlainObject(entry) ? entry : null;
    }

    function getAllSubjectProgress(characterId) {
        if (!_hasId(characterId)) return [];
        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character || !_isPlainObject(character.subjectProgress)) return [];

        var out = [];
        for (var key in character.subjectProgress) {
            if (!Object.prototype.hasOwnProperty.call(character.subjectProgress, key)) continue;
            var entry = character.subjectProgress[key];
            if (!_isPlainObject(entry)) continue;
            out.push(Object.assign({ key: key }, entry));
        }
        return out;
    }

    function ensureSubjectProgress(characterId, key, initial) {
        if (!_hasId(characterId)) return _fail('Character id is required.');
        if (!_hasId(key)) return _fail('Subject key is required.');
        if (!_isPlainObject(initial)) {
            return _fail('Initial progress must be a plain object.');
        }

        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character) return _fail('Character not found.');
        if (character.isDeleted === true) {
            return _fail('Character is soft-deleted. Restore first to modify.');
        }

        var progress = _isPlainObject(character.subjectProgress)
            ? character.subjectProgress
            : {};

        var existing = progress[key];
        if (_isPlainObject(existing)) {
            return _ok({ created: false, progress: existing });
        }

        var level = _isValidProficiencyLevel(initial.level) ? initial.level : 0;
        var entry = {
            level: level,
            lastStudied: _isMissing(initial.lastStudied)
                ? null
                : initial.lastStudied,
            source: _isMissing(initial.source) ? null : String(initial.source),
            type: initial.type === 'role' ? 'role' : 'subject',
            roleId: initial.type === 'role' && _hasId(initial.roleId)
                ? initial.roleId
                : null
        };

        var next = Object.assign({}, progress);
        next[key] = entry;

        var update = CS.updateCharacter(characterId, {
            subjectProgress: next,
            updatedAt: Date.now()
        });
        if (!update || update.success !== true) {
            return _fail(update && update.reason
                ? update.reason
                : 'CharacterState refused the subject progress write.');
        }

        return _ok({ created: true, progress: entry });
    }

    function updateSubjectProgress(characterId, key, patch) {
        if (!_hasId(characterId)) return _fail('Character id is required.');
        if (!_hasId(key)) return _fail('Subject key is required.');
        if (!_isPlainObject(patch)) {
            return _fail('Progress patch must be a plain object.');
        }

        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character) return _fail('Character not found.');
        if (character.isDeleted === true) {
            return _fail('Character is soft-deleted. Restore first to modify.');
        }

        var progress = _isPlainObject(character.subjectProgress)
            ? character.subjectProgress
            : {};
        var existing = progress[key];
        if (!_isPlainObject(existing)) {
            return _fail('Subject progress entry does not exist for key: ' + key);
        }

        var nextEntry = {
            level: _isValidProficiencyLevel(patch.level)
                ? patch.level
                : (_isValidProficiencyLevel(existing.level) ? existing.level : 0),
            lastStudied: patch.lastStudied !== undefined
                ? patch.lastStudied
                : (_isMissing(existing.lastStudied) ? null : existing.lastStudied),
            source: patch.source !== undefined
                ? (patch.source === null ? null : String(patch.source))
                : (_isMissing(existing.source) ? null : String(existing.source)),
            type: existing.type === 'role' ? 'role' : 'subject',
            roleId: existing.roleId || null
        };

        var next = Object.assign({}, progress);
        next[key] = nextEntry;

        var update = CS.updateCharacter(characterId, {
            subjectProgress: next,
            updatedAt: Date.now()
        });
        if (!update || update.success !== true) {
            return _fail(update && update.reason
                ? update.reason
                : 'CharacterState refused the subject progress write.');
        }

        return _ok({ progress: nextEntry });
    }

    // =========================================================================
    // 17. LITERACY (character.isLiterate)
    // =========================================================================

    function isLiterate(characterId) {
        if (!_hasId(characterId)) return false;
        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character) return false;
        return character.isLiterate === true;
    }

    function setLiterate(characterId, value) {
        if (!_hasId(characterId)) return _fail('Character id is required.');
        if (typeof value !== 'boolean') {
            return _fail('value must be a boolean.');
        }

        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character) return _fail('Character not found.');
        if (character.isDeleted === true) {
            return _fail('Character is soft-deleted. Restore first to modify.');
        }

        if (character.isLiterate === value) {
            return _ok({ isLiterate: value, unchanged: true });
        }

        var update = CS.updateCharacter(characterId, {
            isLiterate: value,
            updatedAt: Date.now()
        });
        if (!update || update.success !== true) {
            return _fail(update && update.reason
                ? update.reason
                : 'CharacterState refused the literacy write.');
        }

        return _ok({ isLiterate: value, unchanged: false });
    }

    // =========================================================================
    // 18. RANK API - NORMALISATION
    // =========================================================================

    function _normaliseNumberInfo(raw) {
        if (_isMissing(raw)) return null;
        if (!_isPlainObject(raw)) return null;

        var rawNumber = raw.rawNumber;
        if (typeof rawNumber !== 'number' || !Number.isFinite(rawNumber)) return null;

        var display = typeof raw.display === 'string' && raw.display.length > 0
            ? raw.display
            : String(rawNumber);

        var type = raw.type;
        if (type !== 'ordinal' && type !== 'roman' && type !== 'custom') {
            type = 'custom';
        }

        var groupId = _hasId(raw.groupId) ? raw.groupId : null;
        var holdersInGroup = (typeof raw.holdersInGroup === 'number'
            && Number.isFinite(raw.holdersInGroup))
            ? raw.holdersInGroup
            : null;

        return {
            rawNumber: rawNumber,
            display: display,
            type: type,
            groupId: groupId,
            holdersInGroup: holdersInGroup
        };
    }

    function _normaliseRankAssignment(input) {
        var order = input.order;
        if (typeof order !== 'number' || !Number.isFinite(order)) {
            order = 10;
        }

        return {
            rankId: input.rankId,
            customTitle: _hasId(input.customTitle) ? input.customTitle : null,
            address: _hasId(input.address) ? input.address : null,
            number: _normaliseNumberInfo(input.number),
            order: order,
            isActive: input.isActive === true,
            isDeprecated: input.isDeprecated === true,
            assignedYear: _isMissing(input.assignedYear) ? null : input.assignedYear,
            notes: typeof input.notes === 'string' ? input.notes : '',
            inheritedFrom: _hasId(input.inheritedFrom) ? input.inheritedFrom : null
        };
    }

    function _findRankAssignmentIndex(assignments, rankId) {
        if (!Array.isArray(assignments)) return -1;
        for (var i = 0; i < assignments.length; i++) {
            var a = assignments[i];
            if (a && a.rankId === rankId) return i;
        }
        return -1;
    }

    function _findActiveRankAssignmentIndex(assignments) {
        if (!Array.isArray(assignments)) return -1;
        for (var i = 0; i < assignments.length; i++) {
            var a = assignments[i];
            if (a && a.rankId && a.isDeprecated !== true && a.isActive === true) return i;
        }
        return -1;
    }

    function _reconcileRankActives(assignments, preferredActiveRankId) {
        var next = [];
        for (var i = 0; i < assignments.length; i++) {
            var copy = _normaliseRankAssignment(assignments[i]);
            copy.isActive = false;
            next.push(copy);
        }

        var activeIdx = -1;

        if (_hasId(preferredActiveRankId)) {
            for (var j = 0; j < next.length; j++) {
                if (next[j].rankId === preferredActiveRankId
                    && next[j].isDeprecated !== true) {
                    activeIdx = j;
                    break;
                }
            }
        }

        if (activeIdx === -1) {
            var sortedIndexes = [];
            for (var k = 0; k < next.length; k++) {
                if (next[k].isDeprecated !== true) sortedIndexes.push(k);
            }
            sortedIndexes.sort(function (a, b) {
                return (next[a].order || 0) - (next[b].order || 0);
            });
            if (sortedIndexes.length > 0) activeIdx = sortedIndexes[0];
        }

        if (activeIdx !== -1) {
            next[activeIdx].isActive = true;
        }

        var activeRankId = activeIdx !== -1 ? next[activeIdx].rankId : null;
        var activeRankNumber = null;
        if (activeIdx !== -1 && next[activeIdx].number) {
            var raw = next[activeIdx].number.rawNumber;
            if (typeof raw === 'number' && Number.isFinite(raw)) {
                activeRankNumber = raw;
            }
        }

        return {
            assignments: next,
            activeRankId: activeRankId,
            activeRankNumber: activeRankNumber
        };
    }

    function _writeRankAssignments(characterId, assignments, preferredActiveRankId) {
        var reconciled = _reconcileRankActives(assignments, preferredActiveRankId);

        var patch = {
            rankAssignments: reconciled.assignments,
            activeRankId: reconciled.activeRankId,
            activeRankNumber: reconciled.activeRankNumber,
            updatedAt: Date.now()
        };

        var result = CS.applyDomainFieldPatch(characterId, patch);
        if (!result || result.success !== true) {
            return _fail(result && result.reason
                ? result.reason
                : 'CharacterState refused the rank assignment write.');
        }

        return _ok({
            assignments: reconciled.assignments,
            activeRankId: reconciled.activeRankId,
            activeRankNumber: reconciled.activeRankNumber
        });
    }

    // =========================================================================
    // 19. RANK API - CONTAINER INITIALISATION
    // =========================================================================

    function initializeRankContainers(characterId) {
        if (!_hasId(characterId)) return _fail('Character id is required.');

        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character) return _fail('Character not found.');

        var needsAssignments = !Array.isArray(character.rankAssignments);
        var needsActiveRankId = character.activeRankId === undefined;
        var needsActiveRankNumber = character.activeRankNumber === undefined;

        if (!needsAssignments && !needsActiveRankId && !needsActiveRankNumber) {
            return _ok({ initialized: false });
        }

        var patch = { updatedAt: Date.now() };
        if (needsAssignments) patch.rankAssignments = [];
        if (needsActiveRankId) patch.activeRankId = null;
        if (needsActiveRankNumber) patch.activeRankNumber = null;

        var write = CS.applyDomainFieldPatch(characterId, patch);
        if (!write || write.success !== true) {
            return _fail(write && write.reason
                ? write.reason
                : 'CharacterState refused the rank container write.');
        }

        return _ok({ initialized: true });
    }

    // =========================================================================
    // 20. RANK API - READS
    // =========================================================================

    function getRankAssignments(characterId) {
        if (!_hasId(characterId)) return [];
        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character || !Array.isArray(character.rankAssignments)) return [];

        var out = [];
        for (var i = 0; i < character.rankAssignments.length; i++) {
            var a = character.rankAssignments[i];
            if (!a) continue;
            out.push(_normaliseRankAssignment(a));
        }
        return out;
    }

    function getRankAssignment(characterId, rankId) {
        if (!_hasId(characterId)) return null;
        if (!_hasId(rankId)) return null;

        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character || !Array.isArray(character.rankAssignments)) return null;

        var idx = _findRankAssignmentIndex(character.rankAssignments, rankId);
        if (idx === -1) return null;
        return _normaliseRankAssignment(character.rankAssignments[idx]);
    }

    function getActiveRank(characterId) {
        if (!_hasId(characterId)) return null;
        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character || !Array.isArray(character.rankAssignments)) return null;

        var idx = _findActiveRankAssignmentIndex(character.rankAssignments);
        if (idx === -1) return null;
        return _normaliseRankAssignment(character.rankAssignments[idx]);
    }

    function hasRankAssignment(characterId, rankId, includeDeprecated) {
        if (!_hasId(characterId)) return false;
        if (!_hasId(rankId)) return false;

        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character || !Array.isArray(character.rankAssignments)) return false;

        for (var i = 0; i < character.rankAssignments.length; i++) {
            var a = character.rankAssignments[i];
            if (!a || a.rankId !== rankId) continue;
            if (includeDeprecated === true) return true;
            if (a.isDeprecated !== true) return true;
        }
        return false;
    }

    // =========================================================================
    // 21. RANK API - WRITES
    // =========================================================================

    function addRankAssignment(characterId, assignmentData) {
        if (!_hasId(characterId)) return _fail('Character id is required.');
        if (!_isPlainObject(assignmentData)) {
            return _fail('Assignment data must be a plain object.');
        }
        if (!_hasId(assignmentData.rankId)) {
            return _fail('rankId is required.');
        }

        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character) return _fail('Character not found.');
        if (character.isDeleted === true) {
            return _fail('Character is soft-deleted. Restore first to modify.');
        }

        var existing = Array.isArray(character.rankAssignments)
            ? character.rankAssignments.slice()
            : [];

        for (var i = 0; i < existing.length; i++) {
            var a = existing[i];
            if (a && a.rankId === assignmentData.rankId && a.isDeprecated !== true) {
                return _fail('Character already has this rank.');
            }
        }

        var normalised = _normaliseRankAssignment(assignmentData);

        var reactivated = false;
        for (var j = 0; j < existing.length; j++) {
            if (existing[j] && existing[j].rankId === assignmentData.rankId
                && existing[j].isDeprecated === true) {
                existing[j] = Object.assign({}, existing[j], normalised, {
                    isDeprecated: false,
                    isActive: false
                });
                reactivated = true;
                break;
            }
        }

        if (!reactivated) {
            existing.push(normalised);
        }

        var preferredActive = null;
        if (!_hasId(character.activeRankId)) {
            preferredActive = assignmentData.rankId;
        }

        var write = _writeRankAssignments(characterId, existing, preferredActive);
        if (!write.success) return write;

        var stored = null;
        for (var k = 0; k < write.assignments.length; k++) {
            if (write.assignments[k].rankId === assignmentData.rankId) {
                stored = write.assignments[k];
                break;
            }
        }

        return _ok({
            assignment: stored,
            activeRankId: write.activeRankId,
            activeRankNumber: write.activeRankNumber,
            reactivated: reactivated
        });
    }

    function updateRankAssignment(characterId, rankId, patch) {
        if (!_hasId(characterId)) return _fail('Character id is required.');
        if (!_hasId(rankId)) return _fail('rankId is required.');
        if (!_isPlainObject(patch)) return _fail('Patch must be a plain object.');

        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character) return _fail('Character not found.');
        if (character.isDeleted === true) {
            return _fail('Character is soft-deleted. Restore first to modify.');
        }

        var existing = Array.isArray(character.rankAssignments)
            ? character.rankAssignments.slice()
            : [];
        var idx = _findRankAssignmentIndex(existing, rankId);
        if (idx === -1) return _fail('Character does not have this rank.');

        var current = _normaliseRankAssignment(existing[idx]);
        var candidate = Object.assign({}, current);

        if (Object.prototype.hasOwnProperty.call(patch, 'customTitle')) {
            candidate.customTitle = _hasId(patch.customTitle) ? patch.customTitle : null;
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'address')) {
            candidate.address = _hasId(patch.address) ? patch.address : null;
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'number')) {
            candidate.number = _normaliseNumberInfo(patch.number);
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'order')) {
            if (typeof patch.order === 'number' && Number.isFinite(patch.order)) {
                candidate.order = patch.order;
            }
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'assignedYear')) {
            candidate.assignedYear = _isMissing(patch.assignedYear)
                ? null
                : patch.assignedYear;
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'notes')) {
            candidate.notes = typeof patch.notes === 'string' ? patch.notes : '';
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'inheritedFrom')) {
            candidate.inheritedFrom = _hasId(patch.inheritedFrom)
                ? patch.inheritedFrom
                : null;
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'isDeprecated')) {
            candidate.isDeprecated = patch.isDeprecated === true;
        }
        if (Object.prototype.hasOwnProperty.call(patch, 'isActive')) {
            candidate.isActive = patch.isActive === true;
        }

        existing[idx] = candidate;

        var preferredActive = null;
        if (candidate.isActive === true && candidate.isDeprecated !== true) {
            preferredActive = rankId;
        } else if (character.activeRankId === rankId
            && candidate.isDeprecated === true) {
            preferredActive = null;
        } else {
            preferredActive = character.activeRankId || null;
        }

        var write = _writeRankAssignments(characterId, existing, preferredActive);
        if (!write.success) return write;

        var stored = null;
        for (var m = 0; m < write.assignments.length; m++) {
            if (write.assignments[m].rankId === rankId) {
                stored = write.assignments[m];
                break;
            }
        }

        return _ok({
            assignment: stored,
            activeRankId: write.activeRankId,
            activeRankNumber: write.activeRankNumber
        });
    }

    function deprecateRankAssignment(characterId, rankId) {
        if (!_hasId(characterId)) return _fail('Character id is required.');
        if (!_hasId(rankId)) return _fail('rankId is required.');

        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character) return _fail('Character not found.');
        if (character.isDeleted === true) {
            return _fail('Character is soft-deleted. Restore first to modify.');
        }

        var existing = Array.isArray(character.rankAssignments)
            ? character.rankAssignments.slice()
            : [];
        var idx = _findRankAssignmentIndex(existing, rankId);
        if (idx === -1) return _fail('Character does not have this rank.');

        var current = _normaliseRankAssignment(existing[idx]);
        if (current.isDeprecated === true) {
            return _ok({ unchanged: true });
        }

        current.isDeprecated = true;
        current.isActive = false;
        existing[idx] = current;

        var preferredActive = character.activeRankId === rankId
            ? null
            : (character.activeRankId || null);

        var write = _writeRankAssignments(characterId, existing, preferredActive);
        if (!write.success) return write;

        return _ok({
            unchanged: false,
            activeRankId: write.activeRankId,
            activeRankNumber: write.activeRankNumber
        });
    }

    function removeRankAssignment(characterId, rankId) {
        if (!_hasId(characterId)) return _fail('Character id is required.');
        if (!_hasId(rankId)) return _fail('rankId is required.');

        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character) return _fail('Character not found.');
        if (character.isDeleted === true) {
            return _fail('Character is soft-deleted. Restore first to modify.');
        }

        var existing = Array.isArray(character.rankAssignments)
            ? character.rankAssignments.slice()
            : [];
        var idx = _findRankAssignmentIndex(existing, rankId);
        if (idx === -1) return _fail('Character does not have this rank.');

        existing.splice(idx, 1);

        var preferredActive = character.activeRankId === rankId
            ? null
            : (character.activeRankId || null);

        var write = _writeRankAssignments(characterId, existing, preferredActive);
        if (!write.success) return write;

        return _ok({
            activeRankId: write.activeRankId,
            activeRankNumber: write.activeRankNumber
        });
    }

    function setActiveRank(characterId, rankId) {
        if (!_hasId(characterId)) return _fail('Character id is required.');
        if (!_hasId(rankId)) return _fail('rankId is required.');

        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character) return _fail('Character not found.');
        if (character.isDeleted === true) {
            return _fail('Character is soft-deleted. Restore first to modify.');
        }

        var existing = Array.isArray(character.rankAssignments)
            ? character.rankAssignments.slice()
            : [];
        var idx = _findRankAssignmentIndex(existing, rankId);
        if (idx === -1) {
            return _fail('Character does not hold this rank.');
        }

        var normalised = _normaliseRankAssignment(existing[idx]);
        if (normalised.isDeprecated === true) {
            return _fail('Cannot activate a deprecated rank assignment.');
        }

        if (character.activeRankId === rankId) {
            return _ok({ unchanged: true, activeRankId: rankId });
        }

        var write = _writeRankAssignments(characterId, existing, rankId);
        if (!write.success) return write;

        return _ok({
            unchanged: false,
            activeRankId: write.activeRankId,
            activeRankNumber: write.activeRankNumber
        });
    }

    function clearActiveRank(characterId) {
        if (!_hasId(characterId)) return _fail('Character id is required.');

        var character = CS._getLiveCharacterForMutation(characterId);
        if (!character) return _fail('Character not found.');

        if (!_hasId(character.activeRankId)) {
            return _ok({ unchanged: true });
        }

        var existing = Array.isArray(character.rankAssignments)
            ? character.rankAssignments.slice()
            : [];

        var write = _writeRankAssignments(characterId, existing, null);
        if (!write.success) return write;

        return _ok({
            unchanged: false,
            activeRankId: write.activeRankId,
            activeRankNumber: write.activeRankNumber
        });
    }

    // =========================================================================
    // 22. EXPORTS
    // =========================================================================

    window.CharacterCommands = {
        updateCharacterFields: updateCharacterFields,
        updateCharactersFields: updateCharactersFields,
        updateCharacter: updateCharacter,

        markDeceased: markDeceased,

        getTraits: getTraits,
        hasTrait: hasTrait,
        replaceTraits: replaceTraits,
        setTraits: setTraits,
        addTrait: addTrait,
        removeTrait: removeTrait,

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
        removeCharacterReligion: removeCharacterReligion,

        initializeEducationContainers: initializeEducationContainers,

        getEducationRecord: getEducationRecord,
        getEducationRecords: getEducationRecords,
        recordEducationEnrollment: recordEducationEnrollment,
        recordEducationGraduation: recordEducationGraduation,
        recordEducationWithdrawal: recordEducationWithdrawal,

        getEducationHistory: getEducationHistory,
        appendEducationHistory: appendEducationHistory,

        getSubjectProgress: getSubjectProgress,
        getAllSubjectProgress: getAllSubjectProgress,
        ensureSubjectProgress: ensureSubjectProgress,
        updateSubjectProgress: updateSubjectProgress,

        isLiterate: isLiterate,
        setLiterate: setLiterate,

        initializeRankContainers: initializeRankContainers,

        getRankAssignments: getRankAssignments,
        getRankAssignment: getRankAssignment,
        getActiveRank: getActiveRank,
        hasRankAssignment: hasRankAssignment,

        addRankAssignment: addRankAssignment,
        updateRankAssignment: updateRankAssignment,
        deprecateRankAssignment: deprecateRankAssignment,
        removeRankAssignment: removeRankAssignment,
        setActiveRank: setActiveRank,
        clearActiveRank: clearActiveRank
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterCommands;
    }
})();
