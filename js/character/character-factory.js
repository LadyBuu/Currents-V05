/**
 * =============================================================================
 * STILL WATERS - CHARACTER FACTORY (js/character/character-factory.js)
 * =============================================================================
 *
 * LOCATION: js/character/character-factory.js
 *
 * Canonical constructor for character entities.
 *
 * Every character that enters the canonical collection through the
 * normal creation path must be produced by this factory. Manual creation,
 * random generation, import, cloning, and any future creation path
 * funnel through buildCharacter().
 *
 * The one exception is createCharacterFromData (in
 * character-creation-commands.js), which inserts a pre-built record
 * directly. That path is legitimate — import and cloning need it — but
 * it must validate the record's shape first. That is what
 * validateBuiltCharacter() is for.
 *
 * SCOPE:
 *   - Validating character-owned input data against the canonical schema
 *   - Applying canonical defaults for missing optional fields
 *   - Generating the character ID
 *   - Assembling the complete character object
 *   - Validating a pre-built character record's shape (for
 *     createCharacterFromData)
 *
 * OUT OF SCOPE:
 *   - Mutation of the canonical collection -> character-creation-commands.js
 *   - Family graph mutations -> family-commands.js
 *   - Random value generation -> character-generator.js
 *   - Persistence -> storage.js
 *   - Derived queries -> character-queries.js
 *   - Presentation -> character-ui-list.js
 *
 * SEMANTIC RULES:
 *   - Missing (undefined/null) optional fields receive canonical defaults.
 *   - Invalid explicit values are REJECTED, not silently coerced.
 *   - Year 0 is preserved. It is a valid world year.
 *   - Unknown input fields are ignored, not copied through.
 *   - Array fields are validated as arrays. Object fields are validated
 *     as plain objects.
 *   - The returned character object is deeply owned by the factory. No
 *     references to caller-supplied arrays or objects are retained.
 *   - Cyclic input objects are rejected outright.
 *   - IDs are generated via ids.js. No fallbacks.
 *   - `birthYear` omitted -> the factory REQUIRES options.currentYear to be
 *     supplied by the caller. It does NOT reach into global time.
 *
 * REMOVED FIELDS:
 *   The parent-child compatibility mirrors (motherId, fatherId, children,
 *   adoptedParents, adoptedChildren) are not part of the character record
 *   any more. Parent edges are created through family-commands.js after
 *   the character exists. This factory does not accept or emit them.
 *
 * DOMAIN-OWNED FIELDS:
 *   The factory constructs the character record. Every embedded array and
 *   pointer that is owned by a domain is constructed in its neutral empty
 *   state here because the persistence schema requires it:
 *
 *       traits                            -> character-commands.js
 *       professions                       -> character-commands.js
 *       rankAssignments                   -> ranks domain
 *       activeRankId, activeRankNumber    -> ranks domain
 *       relationships                     -> relationships domain
 *       friends                           -> relationships domain
 *       apprentices, masterId,
 *         isMaster, masterProfessionId,
 *         apprenticeshipDetails           -> apprenticeship domain
 *       religionHistory                   -> religion commands
 *       education, educationHistory,
 *         subjectProgress, isLiterate     -> education commands
 *
 *   The factory accepts identity pointers (activeRankId, isMaster,
 *   masterId, masterProfessionId) from the caller because those describe
 *   the character's current identity. It does not accept domain records.
 *
 * TRAITS:
 *   `traits` is a character-owned array of canonical trait ids. It is
 *   writable after creation only through CharacterCommands (addTrait /
 *   removeTrait / replaceTraits), not through the generic
 *   updateCharacter path (traits is a domain-owned field).
 *
 *   The factory accepts an optional `traits` array at build time so
 *   that:
 *     - create-character-modal and character-generator can set initial
 *       traits without a separate write
 *     - imports and clones carry their traits through
 *
 *   Validation semantics:
 *     - missing/null           → []
 *     - non-array              → rejected
 *     - non-string entry       → rejected
 *     - unknown trait id       → rejected WHEN CHARACTER_TRAIT_VALUES is
 *                                loaded; skipped (structural check only)
 *                                when it is not, so the factory remains
 *                                usable in a bare test harness that
 *                                didn't load the vocabulary. Production
 *                                load order always has the vocabulary
 *                                before the factory.
 *     - duplicates             → rejected
 *
 * PRE-BUILT VALIDATION (validateBuiltCharacter):
 *   createCharacterFromData inserts a caller-built record directly,
 *   bypassing buildCharacter. That is a legitimate escape hatch for
 *   import, cloning, and test harnesses — but only if the record has the
 *   shape every downstream projection expects. validateBuiltCharacter
 *   enforces that shape without regenerating the id.
 *
 *   The validator is INTENTIONALLY MINIMAL. It checks:
 *     - plain object
 *     - non-empty string id
 *     - non-empty string name
 *     - the six domain-owned embedded arrays are actually arrays
 *     - createdAt and updatedAt are finite numbers
 *
 *   It does NOT validate:
 *     - enum values (gender, attraction, surnameSource)
 *     - year bounds
 *     - cross-field consistency (isDeceased vs deathYear)
 *     - the shape of individual entries inside the embedded arrays
 *     - individual trait ids (that is the factory's job at build time;
 *       pre-built records are trusted to have been built correctly, and
 *       are re-validated for shape, not content)
 *
 *   Those are the responsibility of the caller. The point of the
 *   validator is to catch the shape errors that would silently break
 *   CharacterState._project() and downstream consumers, not to
 *   re-run the full factory.
 *
 * DEPENDENCIES (REQUIRED):
 *   - ids.js:   generateId
 *
 * DEPENDENCIES (OPTIONAL):
 *   - time.js:                isValidYear - used if present to validate
 *                             year fields.
 *   - constants/character-traits.js:
 *                             CHARACTER_TRAIT_VALUES - used if present to
 *                             validate individual trait ids. Absent in
 *                             bare test harnesses; present in production.
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Added `traits` as a character-owned array field:
 *         - FIELD_VALIDATORS entry validates shape and (when the
 *           vocabulary is loaded) trait ids.
 *         - _applyDefaults emits `traits: []` when not supplied.
 *         - validateBuiltCharacter now requires `traits` to be an
 *           array, matching the other domain-owned containers.
 *     - No other behavioural change.
 * =============================================================================
 */

(function () {
    'use strict';

    if (typeof window.generateId !== 'function') {
        throw new Error(
            'character-factory.js: ids.js must load first (generateId missing).'
        );
    }

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var VALID_GENDERS = ['male', 'female', 'unknown'];
    var VALID_ATTRACTIONS = ['both', 'men', 'women', 'neither', 'unknown'];
    var VALID_SURNAME_SOURCES = ['country', 'cultural', 'inherited', 'custom', 'none'];

    var NAME_MAX_LENGTH = 100;

    // =========================================================================
    // 2. INTERNAL HELPERS
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

    function _isValidYear(value) {
        if (typeof value !== 'number') return false;
        if (!Number.isFinite(value)) return false;
        if (!Number.isInteger(value)) return false;
        if (typeof window.isValidYear === 'function') {
            return window.isValidYear(value) === true;
        }
        return true;
    }

    // =========================================================================
    // 3. VALIDATORS
    // =========================================================================

    function _validateOptionalString(value, name) {
        if (_isMissing(value)) return { ok: true, value: null };
        if (typeof value !== 'string') {
            return { ok: false, reason: name + ' must be a string when provided' };
        }
        return { ok: true, value: value };
    }

    function _validateOptionalBoolean(value, name) {
        if (_isMissing(value)) return { ok: true, value: null };
        if (typeof value !== 'boolean') {
            return { ok: false, reason: name + ' must be a boolean when provided' };
        }
        return { ok: true, value: value };
    }

    function _validateOptionalId(value, name) {
        if (_isMissing(value)) return { ok: true, value: null };
        if (!_hasId(value)) {
            return { ok: false, reason: name + ' must be a non-empty string when provided' };
        }
        return { ok: true, value: value };
    }

    function _validateOptionalArray(value, name) {
        if (_isMissing(value)) return { ok: true, value: null };
        if (!Array.isArray(value)) {
            return { ok: false, reason: name + ' must be an array when provided' };
        }
        return { ok: true, value: value };
    }

    function _validateOptionalObject(value, name) {
        if (_isMissing(value)) return { ok: true, value: null };
        if (!_isPlainObject(value)) {
            return { ok: false, reason: name + ' must be a plain object when provided' };
        }
        return { ok: true, value: value };
    }

    function _validateOptionalYear(value, name) {
        if (_isMissing(value)) return { ok: true, value: null };
        if (!_isValidYear(value)) {
            return { ok: false, reason: name + ' must be a valid world year' };
        }
        return { ok: true, value: value };
    }

    /**
     * Validates the `traits` field.
     *
     * Structural checks (array, string entries, no duplicates) are
     * always enforced. Trait-id checks are enforced only when the
     * vocabulary is loaded, so the factory remains usable in a bare
     * test harness. Production load order guarantees the vocabulary
     * loads before this file, so in practice unknown ids are always
     * rejected.
     */
    function _validateTraits(value) {
        if (_isMissing(value)) return { ok: true, value: null };
        if (!Array.isArray(value)) {
            return { ok: false, reason: 'traits must be an array when provided' };
        }

        var vocabularyAvailable = Array.isArray(window.CHARACTER_TRAIT_VALUES);
        var seen = {};
        var cleaned = [];

        for (var i = 0; i < value.length; i++) {
            var entry = value[i];
            if (typeof entry !== 'string' || entry.length === 0) {
                return {
                    ok: false,
                    reason: 'traits[' + i + '] must be a non-empty string'
                };
            }
            if (seen[entry] === true) {
                return {
                    ok: false,
                    reason: 'traits[' + i + '] is a duplicate: ' + entry
                };
            }
            seen[entry] = true;

            if (vocabularyAvailable
                && window.CHARACTER_TRAIT_VALUES.indexOf(entry) === -1) {
                return {
                    ok: false,
                    reason: 'traits[' + i + '] is not a known trait: ' + entry
                };
            }

            cleaned.push(entry);
        }

        return { ok: true, value: cleaned };
    }

    // =========================================================================
    // 4. CYCLE-SAFE DEEP CLONE
    // =========================================================================

    function _cloneSchemaValue(value, seen) {
        if (value === null || typeof value !== 'object') return value;

        if (Array.isArray(value)) {
            if (seen.has(value)) return { __cycle: true };
            seen.add(value);
            var arr = [];
            for (var i = 0; i < value.length; i++) {
                var clonedItem = _cloneSchemaValue(value[i], seen);
                if (clonedItem && clonedItem.__cycle === true) return { __cycle: true };
                arr.push(clonedItem);
            }
            seen.delete(value);
            return arr;
        }

        if (_isPlainObject(value)) {
            if (seen.has(value)) return { __cycle: true };
            seen.add(value);
            var obj = {};
            var keys = Object.keys(value);
            for (var j = 0; j < keys.length; j++) {
                var k = keys[j];
                if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
                var clonedValue = _cloneSchemaValue(value[k], seen);
                if (clonedValue && clonedValue.__cycle === true) return { __cycle: true };
                obj[k] = clonedValue;
            }
            seen.delete(value);
            return obj;
        }

        return value;
    }

    function _safeClone(value) {
        var seen = new Set();
        var cloned = _cloneSchemaValue(value, seen);
        if (cloned && cloned.__cycle === true) return null;
        return cloned;
    }

    // =========================================================================
    // 5. NESTED SCHEMA VALIDATORS
    // =========================================================================

    function _validateSurnameHistory(input) {
        if (_isMissing(input)) return { ok: true, value: null };
        if (!_isPlainObject(input)) {
            return { ok: false, reason: 'surnameHistory must be a plain object when provided' };
        }

        var entries = input.entries;
        if (entries === undefined) entries = [];
        if (!Array.isArray(entries)) {
            return { ok: false, reason: 'surnameHistory.entries must be an array' };
        }

        var birthSurname = input.birthSurname;
        if (birthSurname === undefined) birthSurname = '';
        if (typeof birthSurname !== 'string') {
            return { ok: false, reason: 'surnameHistory.birthSurname must be a string' };
        }

        var lastUpdated = input.lastUpdated;
        if (lastUpdated === undefined) lastUpdated = null;
        if (lastUpdated !== null && !_isValidYear(lastUpdated)) {
            return { ok: false, reason: 'surnameHistory.lastUpdated must be a valid year or null' };
        }

        var clonedEntries = [];
        for (var i = 0; i < entries.length; i++) {
            if (!_isPlainObject(entries[i])) {
                return { ok: false, reason: 'surnameHistory.entries[' + i + '] must be a plain object' };
            }
            var cloned = _safeClone(entries[i]);
            if (cloned === null) {
                return { ok: false, reason: 'surnameHistory.entries[' + i + '] contains a cyclic structure' };
            }
            clonedEntries.push(cloned);
        }

        return {
            ok: true,
            value: {
                birthSurname: birthSurname,
                entries: clonedEntries,
                lastUpdated: lastUpdated
            }
        };
    }

    function _validateDeepObject(input, name) {
        if (_isMissing(input)) return { ok: true, value: null };
        if (!_isPlainObject(input)) {
            return { ok: false, reason: name + ' must be a plain object when provided' };
        }
        var cloned = _safeClone(input);
        if (cloned === null) {
            return { ok: false, reason: name + ' contains a cyclic structure' };
        }
        return { ok: true, value: cloned };
    }

    function _validateActiveRankNumber(input) {
        if (_isMissing(input)) return { ok: true, value: null };
        if (typeof input !== 'number' || !Number.isInteger(input) || input < 1) {
            return { ok: false, reason: 'activeRankNumber must be a positive integer when provided' };
        }
        return { ok: true, value: input };
    }

    // =========================================================================
    // 6. NAME VALIDATION
    // =========================================================================

    function _validateName(data) {
        if (_isMissing(data.name)) {
            return { ok: false, reason: 'Character name is required' };
        }
        if (typeof data.name !== 'string') {
            return { ok: false, reason: 'Character name must be a string' };
        }
        var trimmed = data.name.trim();
        if (trimmed.length === 0) {
            return { ok: false, reason: 'Character name must not be empty' };
        }
        if (trimmed.length > NAME_MAX_LENGTH) {
            return { ok: false, reason: 'Character name exceeds ' + NAME_MAX_LENGTH + ' characters' };
        }
        return { ok: true, value: trimmed };
    }

    // =========================================================================
    // 7. FIELD VALIDATION TABLE
    // =========================================================================

    var FIELD_VALIDATORS = {
        // Identity
        'name': function (v) { return _validateOptionalString(v, 'name'); },
        'surname': function (v) { return _validateOptionalString(v, 'surname'); },
        'surnameSource': function (v) {
            if (_isMissing(v)) return { ok: true, value: null };
            if (typeof v !== 'string') {
                return { ok: false, reason: 'surnameSource must be a string' };
            }
            if (VALID_SURNAME_SOURCES.indexOf(v) === -1) {
                return {
                    ok: false,
                    reason: 'surnameSource must be one of: ' + VALID_SURNAME_SOURCES.join(', ')
                };
            }
            return { ok: true, value: v };
        },
        'surnameRules': function (v) { return _validateDeepObject(v, 'surnameRules'); },
        'surnameHistory': function (v) { return _validateSurnameHistory(v); },

        // Demographics
        'gender': function (v) {
            if (_isMissing(v)) return { ok: true, value: null };
            if (typeof v !== 'string') {
                return { ok: false, reason: 'gender must be a string' };
            }
            if (VALID_GENDERS.indexOf(v) === -1) {
                return { ok: false, reason: 'gender must be one of: ' + VALID_GENDERS.join(', ') };
            }
            return { ok: true, value: v };
        },
        'attraction': function (v) {
            if (_isMissing(v)) return { ok: true, value: null };
            if (typeof v !== 'string') {
                return { ok: false, reason: 'attraction must be a string' };
            }
            if (VALID_ATTRACTIONS.indexOf(v) === -1) {
                return {
                    ok: false,
                    reason: 'attraction must be one of: ' + VALID_ATTRACTIONS.join(', ')
                };
            }
            return { ok: true, value: v };
        },
        'traits': function (v) { return _validateTraits(v); },
        'birthYear': function (v) { return _validateOptionalYear(v, 'birthYear'); },
        'isLegitimate': function (v) { return _validateOptionalBoolean(v, 'isLegitimate'); },

        // Life / death
        'isDeceased': function (v) { return _validateOptionalBoolean(v, 'isDeceased'); },
        'deathYear': function (v) { return _validateOptionalYear(v, 'deathYear'); },
        'deathCause': function (v) { return _validateOptionalString(v, 'deathCause'); },
        'deathNotes': function (v) { return _validateOptionalString(v, 'deathNotes'); },

        // Location and movement
        'birthplaceId': function (v) { return _validateOptionalId(v, 'birthplaceId'); },
        'currentLocationId': function (v) { return _validateOptionalId(v, 'currentLocationId'); },
        'household': function (v) { return _validateOptionalId(v, 'household'); },
        'householdHistory': function (v) { return _validateOptionalArray(v, 'householdHistory'); },
        'moves': function (v) { return _validateOptionalArray(v, 'moves'); },

        // Religion / culture
        'religionId': function (v) { return _validateOptionalId(v, 'religionId'); },
        'religionHistory': function (v) { return _validateOptionalArray(v, 'religionHistory'); },
        'cultureId': function (v) { return _validateOptionalId(v, 'cultureId'); },

        // Presentation
        'epithet': function (v) { return _validateOptionalString(v, 'epithet'); },
        'notes': function (v) { return _validateOptionalString(v, 'notes'); },
        'appearance': function (v) { return _validateDeepObject(v, 'appearance'); },

        // Rank identity pointer
        'activeRankId': function (v) { return _validateOptionalId(v, 'activeRankId'); },
        'activeRankNumber': function (v) { return _validateActiveRankNumber(v); },

        // Apprenticeship identity pointer
        'isMaster': function (v) { return _validateOptionalBoolean(v, 'isMaster'); },
        'masterId': function (v) { return _validateOptionalId(v, 'masterId'); },
        'masterProfessionId': function (v) { return _validateOptionalId(v, 'masterProfessionId'); },
        'apprenticeshipDetails': function (v) { return _validateDeepObject(v, 'apprenticeshipDetails'); },

        // Friendship details blob
        'friendshipDetails': function (v) { return _validateDeepObject(v, 'friendshipDetails'); }
    };

    // =========================================================================
    // 8. DEFAULT APPLICATION
    // =========================================================================

    function _applyDefaults(validated, id, currentYear) {
        var now = Date.now();

        var birthYear = _isMissing(validated.birthYear)
            ? currentYear
            : validated.birthYear;

        var surname = typeof validated.surname === 'string' ? validated.surname : '';

        var surnameHistory;
        if (_isPlainObject(validated.surnameHistory)) {
            surnameHistory = validated.surnameHistory;
        } else {
            surnameHistory = {
                birthSurname: surname,
                entries: [],
                lastUpdated: birthYear
            };
        }

        return {
            // Identity
            id: id,
            name: validated.name,
            surname: surname,
            surnameSource: _isMissing(validated.surnameSource) ? 'custom' : validated.surnameSource,
            surnameRules: _isMissing(validated.surnameRules) ? null : validated.surnameRules,
            surnameHistory: surnameHistory,

            // Demographics
            gender: _isMissing(validated.gender) ? 'unknown' : validated.gender,
            attraction: _isMissing(validated.attraction) ? 'both' : validated.attraction,
            traits: Array.isArray(validated.traits) ? validated.traits.slice() : [],
            birthYear: birthYear,
            isLegitimate: _isMissing(validated.isLegitimate) ? true : validated.isLegitimate,

            // Life / death
            isDeceased: _isMissing(validated.isDeceased) ? false : validated.isDeceased,
            deathYear: _isMissing(validated.deathYear) ? null : validated.deathYear,
            deathCause: _isMissing(validated.deathCause) ? '' : validated.deathCause,
            deathNotes: _isMissing(validated.deathNotes) ? '' : validated.deathNotes,

            // Location and movement
            birthplaceId: _isMissing(validated.birthplaceId) ? null : validated.birthplaceId,
            currentLocationId: _isMissing(validated.currentLocationId) ? null : validated.currentLocationId,
            moves: _isMissing(validated.moves) ? [] : validated.moves.slice(),
            household: _isMissing(validated.household) ? null : validated.household,
            householdHistory: _isMissing(validated.householdHistory)
                ? []
                : validated.householdHistory.slice(),

            // Religion / culture
            religionId: _isMissing(validated.religionId) ? null : validated.religionId,
            religionHistory: _isMissing(validated.religionHistory)
                ? []
                : validated.religionHistory.slice(),
            cultureId: _isMissing(validated.cultureId) ? null : validated.cultureId,

            // Presentation
            epithet: _isMissing(validated.epithet) ? '' : validated.epithet,
            notes: _isMissing(validated.notes) ? '' : validated.notes,
            appearance: _isMissing(validated.appearance) ? {} : validated.appearance,

            // Rank identity pointer
            activeRankId: _isMissing(validated.activeRankId) ? null : validated.activeRankId,
            activeRankNumber: _isMissing(validated.activeRankNumber)
                ? null
                : validated.activeRankNumber,

            // Apprenticeship identity pointer
            isMaster: _isMissing(validated.isMaster) ? false : validated.isMaster,
            masterId: _isMissing(validated.masterId) ? null : validated.masterId,
            masterProfessionId: _isMissing(validated.masterProfessionId)
                ? null
                : validated.masterProfessionId,
            apprenticeshipDetails: _isMissing(validated.apprenticeshipDetails)
                ? {}
                : validated.apprenticeshipDetails,

            // Friendship details blob
            friendshipDetails: _isMissing(validated.friendshipDetails)
                ? {}
                : validated.friendshipDetails,

            // Domain-owned embedded fields: neutral empty state only.
            professions: [],
            rankAssignments: [],
            relationships: [],
            friends: [],
            apprentices: [],

            // Soft delete
            isDeleted: false,
            deletedAt: null,

            // Metadata
            createdAt: now,
            updatedAt: now
        };
    }

    // =========================================================================
    // 9. PUBLIC ENTRY POINT - BUILD
    // =========================================================================

    function buildCharacter(data, options) {
        if (_isMissing(data)) data = {};
        if (!_isPlainObject(data)) {
            return { success: false, reason: 'Character data must be a plain object' };
        }
        if (_isMissing(options)) options = {};
        if (!_isPlainObject(options)) {
            return { success: false, reason: 'Options must be a plain object' };
        }

        var nameResult = _validateName(data);
        if (!nameResult.ok) return { success: false, reason: nameResult.reason };

        var currentYear;
        if (_isMissing(data.birthYear)) {
            if (!_isValidYear(options.currentYear)) {
                return {
                    success: false,
                    reason: 'birthYear omitted: options.currentYear must be a valid year.'
                };
            }
            currentYear = options.currentYear;
        } else {
            currentYear = options.currentYear;
        }

        var validated = { name: nameResult.value };
        var fieldNames = Object.keys(FIELD_VALIDATORS);
        for (var i = 0; i < fieldNames.length; i++) {
            var fieldName = fieldNames[i];
            if (fieldName === 'name') continue;
            if (!Object.prototype.hasOwnProperty.call(data, fieldName)) continue;
            if (data[fieldName] === undefined) continue;

            var validator = FIELD_VALIDATORS[fieldName];
            var result = validator(data[fieldName]);
            if (!result.ok) {
                return { success: false, reason: result.reason };
            }
            if (result.value !== null && result.value !== undefined) {
                validated[fieldName] = result.value;
            }
        }

        if (validated.isDeceased === true && _isMissing(validated.deathYear)) {
            return { success: false, reason: 'deathYear is required for a deceased character' };
        }
        if (validated.isDeceased === false && !_isMissing(validated.deathYear)) {
            return { success: false, reason: 'deathYear cannot be set on a living character' };
        }
        if (validated.isDeceased === true
            && !_isMissing(validated.deathYear)
            && !_isMissing(validated.birthYear)
            && validated.deathYear < validated.birthYear) {
            return { success: false, reason: 'deathYear cannot be before birthYear' };
        }

        var id = window.generateId('char');
        if (!_hasId(id)) {
            return { success: false, reason: 'ID generation failed' };
        }

        var character = _applyDefaults(validated, id, currentYear);
        return { success: true, data: character };
    }

    // =========================================================================
    // 10. PUBLIC ENTRY POINT - VALIDATE PRE-BUILT
    // =========================================================================

    /**
     * Validates the shape of a pre-built character record.
     *
     * Used by CharacterCreationCommands.createCharacterFromData. Does
     * NOT regenerate the id, does NOT re-validate enum values, does NOT
     * check cross-field consistency. Only catches the shape errors that
     * would silently break CharacterState._project() and downstream
     * consumers.
     *
     * Returns { ok: true } or { ok: false, reason }.
     *
     * @param {*} character
     * @returns {{ ok: boolean, reason?: string }}
     */
    function validateBuiltCharacter(character) {
        if (!_isPlainObject(character)) {
            return { ok: false, reason: 'Character must be a plain object.' };
        }
        if (!_hasId(character.id)) {
            return { ok: false, reason: 'Character id is required.' };
        }
        if (typeof character.name !== 'string' || character.name.trim() === '') {
            return { ok: false, reason: 'Character name is required.' };
        }

        // Domain-owned embedded containers. CharacterState._project() and
        // every domain reader assumes these are arrays. If they are
        // missing or the wrong type, the projection will silently
        // produce {} or undefined for those fields downstream.
        var requiredArrays = [
            'traits',
            'professions',
            'rankAssignments',
            'relationships',
            'friends',
            'apprentices'
        ];
        for (var i = 0; i < requiredArrays.length; i++) {
            var field = requiredArrays[i];
            if (!Array.isArray(character[field])) {
                return {
                    ok: false,
                    reason: 'Character.' + field + ' must be an array ' +
                            '(buildCharacter normally ensures this).'
                };
            }
        }

        // Metadata fields every consumer reads.
        if (typeof character.createdAt !== 'number'
            || !Number.isFinite(character.createdAt)) {
            return {
                ok: false,
                reason: 'Character.createdAt must be a finite number.'
            };
        }
        if (typeof character.updatedAt !== 'number'
            || !Number.isFinite(character.updatedAt)) {
            return {
                ok: false,
                reason: 'Character.updatedAt must be a finite number.'
            };
        }

        return { ok: true };
    }

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.buildCharacter = buildCharacter;
    window.validateBuiltCharacter = validateBuiltCharacter;
    window.CHARACTER_SCHEMA_FIELDS = Object.keys(FIELD_VALIDATORS);

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            buildCharacter: buildCharacter,
            validateBuiltCharacter: validateBuiltCharacter,
            CHARACTER_SCHEMA_FIELDS: window.CHARACTER_SCHEMA_FIELDS
        };
    }
})();
