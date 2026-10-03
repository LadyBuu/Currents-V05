/**
 * =============================================================================
 * STILL WATERS - CHARACTER FACTORY (js/character/character-factory.js)
 * =============================================================================
 *
 * Canonical constructor for character entities.
 *
 * Every character that enters the canonical collection must be produced by
 * this factory. Manual creation, random generation, import, cloning, and
 * any future creation path funnel through buildCharacter().
 *
 * SCOPE:
 *   - Validating character-owned input data against the character schema
 *   - Applying canonical defaults for missing character-owned fields
 *   - Generating the character ID
 *   - Assembling the complete character object
 *
 * OUT OF SCOPE:
 *   - Mutation of the canonical collection → character-state.js
 *   - Family graph mutations → family-commands.js
 *   - Random value generation → character-generator.js
 *   - Persistence → storage.js
 *   - Derived queries → character-queries.js
 *   - Presentation → character-ui-list.js
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
 *   - IDs are generated via ids.js. No fallbacks.
 *   - `birthYear` omitted → the factory REQUIRES an explicit birthYear
 *     or an explicit `currentYear` option from the caller. It does not
 *     invent "current year minus 25". Generation policy lives in
 *     character-generator.js; the modal's form default lives in the modal.
 *   - Nested schema objects (surnameHistory, appearance, surnameRules,
 *     friendshipDetails, apprenticeshipDetails, activeRankNumber) have
 *     shape validation in the factory. Invalid nested shape is rejected,
 *     not repaired.
 *   - Cyclic input objects are rejected.
 *
 * SCHEMA OWNERSHIP:
 *   The factory constructs Character-owned fields only.
 *
 *   The following fields are physically present on every character because
 *   the current persistence schema requires them, but they are DOMAIN-OWNED
 *   by other modules and always constructed in their neutral empty state
 *   here:
 *
 *       motherId, fatherId                      → family-commands.js
 *       children, adoptedParents, adoptedChildren → family-commands.js
 *       professions                             → character-commands.js
 *       rankAssignments, activeRankId,
 *         activeRankNumber                      → rank-commands.js
 *       relationships, friends,
 *         friendshipDetails                     → relationship-commands.js
 *       apprentices, masterId, isMaster,
 *         masterProfessionId,
 *         apprenticeshipDetails                 → apprenticeship-commands.js
 *       religionHistory                         → religion commands
 *
 *   The factory MUST NOT accept these fields from the caller. If a caller
 *   needs to establish a domain edge, they call the owning domain command
 *   AFTER the character exists.
 *
 * DEPENDENCIES (REQUIRED):
 *   - ids.js:   generateId
 *
 * DEPENDENCIES (OPTIONAL):
 *   - time.js:  isValidYear — used if present to validate year fields.
 *               If absent, the factory validates year fields itself
 *               (finite integer).
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY GUARDS
    // =========================================================================

    function _requireDependencies() {
        if (typeof window.generateId !== 'function') {
            throw new Error(
                'character-factory.js: ids.js must load first (generateId missing).'
            );
        }
    }

    _requireDependencies();

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

    // =========================================================================
    // 3. CYCLE-SAFE DEEP CLONE
    // =========================================================================
    //
    // Callers may pass nested plain objects (appearance, surnameRules,
    // surnameHistory, friendshipDetails, apprenticeshipDetails). We clone
    // deeply so the factory fully owns the returned record. Cyclic input is
    // rejected — the factory does not accept recursive structures.

    function _cloneSchemaValue(value, seen) {
        if (value === null || typeof value !== 'object') return value;

        if (Array.isArray(value)) {
            if (seen.has(value)) return null; // signal via sentinel checked by caller
            seen.add(value);
            var arr = [];
            for (var i = 0; i < value.length; i++) {
                var clonedItem = _cloneSchemaValue(value[i], seen);
                if (clonedItem === null && value[i] !== null) {
                    // The item was a cycle; abort.
                    return null;
                }
                arr.push(clonedItem);
            }
            seen.delete(value);
            return arr;
        }

        if (_isPlainObject(value)) {
            if (seen.has(value)) return null;
            seen.add(value);
            var obj = {};
            var keys = Object.keys(value);
            for (var j = 0; j < keys.length; j++) {
                var k = keys[j];
                if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
                var clonedValue = _cloneSchemaValue(value[k], seen);
                if (clonedValue === null && value[k] !== null) {
                    return null;
                }
                obj[k] = clonedValue;
            }
            seen.delete(value);
            return obj;
        }

        // Unsupported nested types (Date, Map, Set, class instances) are
        // rejected by returning the raw value; the caller validates type.
        return value;
    }

    function _safeClone(value) {
        var seen = new Set();
        var cloned = _cloneSchemaValue(value, seen);
        return cloned;
    }

    // =========================================================================
    // 4. NESTED SCHEMA VALIDATORS
    // =========================================================================
    //
    // Each function receives a plain object and returns
    // { ok: true, value: normalised } or { ok: false, reason }.
    //
    // These normalise to the canonical empty shape and reject invalid nested
    // fields. They do not silently coerce wrong types.

    function _validateSurnameHistory(input) {
        if (_isMissing(input)) {
            return { ok: true, value: null };
        }
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

        // Entries are cloned as-is but must be plain objects.
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

    function _validateSurnameRules(input) {
        if (_isMissing(input)) return { ok: true, value: null };
        if (!_isPlainObject(input)) {
            return { ok: false, reason: 'surnameRules must be a plain object when provided' };
        }
        var cloned = _safeClone(input);
        if (cloned === null) {
            return { ok: false, reason: 'surnameRules contains a cyclic structure' };
        }
        return { ok: true, value: cloned };
    }

    function _validateAppearance(input) {
        if (_isMissing(input)) return { ok: true, value: null };
        if (!_isPlainObject(input)) {
            return { ok: false, reason: 'appearance must be a plain object when provided' };
        }
        var cloned = _safeClone(input);
        if (cloned === null) {
            return { ok: false, reason: 'appearance contains a cyclic structure' };
        }
        return { ok: true, value: cloned };
    }

    function _validateFriendshipDetails(input) {
        if (_isMissing(input)) return { ok: true, value: null };
        if (!_isPlainObject(input)) {
            return { ok: false, reason: 'friendshipDetails must be a plain object when provided' };
        }
        var cloned = _safeClone(input);
        if (cloned === null) {
            return { ok: false, reason: 'friendshipDetails contains a cyclic structure' };
        }
        return { ok: true, value: cloned };
    }

    function _validateApprenticeshipDetails(input) {
        if (_isMissing(input)) return { ok: true, value: null };
        if (!_isPlainObject(input)) {
            return { ok: false, reason: 'apprenticeshipDetails must be a plain object when provided' };
        }
        var cloned = _safeClone(input);
        if (cloned === null) {
            return { ok: false, reason: 'apprenticeshipDetails contains a cyclic structure' };
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
    // 5. NAME VALIDATION
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
    // 6. FIELD VALIDATION TABLE
    // =========================================================================
    //
    // Every entry validates and (where appropriate) normalises a
    // character-owned field from caller input.
    //
    // Fields NOT in this table are ignored. Domain-owned fields (motherId,
    // fatherId, professions, children, relationships, apprentices, etc.)
    // are deliberately absent: the factory will not accept them.

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
        'surnameRules': function (v) { return _validateSurnameRules(v); },
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
        'birthYear': function (v) { return _validateOptionalYear(v, 'birthYear'); },
        'isLegitimate': function (v) { return _validateOptionalBoolean(v, 'isLegitimate'); },

        // Life / death
        'isDeceased': function (v) { return _validateOptionalBoolean(v, 'isDeceased'); },
        'deathYear': function (v) { return _validateOptionalYear(v, 'deathYear'); },
        'deathCause': function (v) { return _validateOptionalString(v, 'deathCause'); },

        // Location and movement
        'birthplaceId': function (v) { return _validateOptionalId(v, 'birthplaceId'); },
        'currentLocationId': function (v) { return _validateOptionalId(v, 'currentLocationId'); },
        'household': function (v) { return _validateOptionalId(v, 'household'); },
        'householdHistory': function (v) { return _validateOptionalArray(v, 'householdHistory'); },
        'moves': function (v) { return _validateOptionalArray(v, 'moves'); },

        // Religion / culture
        'religionId': function (v) { return _validateOptionalId(v, 'religionId'); },
        'cultureId': function (v) { return _validateOptionalId(v, 'cultureId'); },

        // Presentation
        'epithet': function (v) { return _validateOptionalString(v, 'epithet'); },
        'notes': function (v) { return _validateOptionalString(v, 'notes'); },
        'appearance': function (v) { return _validateAppearance(v); },

        // Rank identity (the id itself is character-owned; the assignment
        // history is domain-owned and lives in rank-commands.js)
        'activeRankId': function (v) { return _validateOptionalId(v, 'activeRankId'); },
        'activeRankNumber': function (v) { return _validateActiveRankNumber(v); },

        // Apprenticeship identity (just the flag/id pointers; the records
        // themselves are domain-owned)
        'isMaster': function (v) { return _validateOptionalBoolean(v, 'isMaster'); },
        'masterId': function (v) { return _validateOptionalId(v, 'masterId'); },
        'masterProfessionId': function (v) { return _validateOptionalId(v, 'masterProfessionId'); },
        'apprenticeshipDetails': function (v) { return _validateApprenticeshipDetails(v); },

        // Friendship details (id list is domain-owned; details blob is
        // character-owned embedded data used by the friendship UI)
        'friendshipDetails': function (v) { return _validateFriendshipDetails(v); }
    };

    // =========================================================================
    // 7. DEFAULT APPLICATION
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
            birthYear: birthYear,
            isLegitimate: _isMissing(validated.isLegitimate) ? true : validated.isLegitimate,

            // Life / death
            isDeceased: _isMissing(validated.isDeceased) ? false : validated.isDeceased,
            deathYear: _isMissing(validated.deathYear) ? null : validated.deathYear,
            deathCause: _isMissing(validated.deathCause) ? '' : validated.deathCause,
            deathNotes: '',

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
            religionHistory: [],
            cultureId: _isMissing(validated.cultureId) ? null : validated.cultureId,

            // Presentation
            epithet: _isMissing(validated.epithet) ? '' : validated.epithet,
            notes: _isMissing(validated.notes) ? '' : validated.notes,
            appearance: _isMissing(validated.appearance) ? {} : validated.appearance,

            // Rank identity (id pointers only; assignments are domain-owned)
            activeRankId: _isMissing(validated.activeRankId) ? null : validated.activeRankId,
            activeRankNumber: _isMissing(validated.activeRankNumber)
                ? null
                : validated.activeRankNumber,

            // Apprenticeship identity (id pointers only; records are domain-owned)
            isMaster: _isMissing(validated.isMaster) ? false : validated.isMaster,
            masterId: _isMissing(validated.masterId) ? null : validated.masterId,
            masterProfessionId: _isMissing(validated.masterProfessionId)
                ? null
                : validated.masterProfessionId,
            apprenticeshipDetails: _isMissing(validated.apprenticeshipDetails)
                ? {}
                : validated.apprenticeshipDetails,

            // Friendship details (the id list is domain-owned and starts empty)
            friendshipDetails: _isMissing(validated.friendshipDetails)
                ? {}
                : validated.friendshipDetails,

            // ---- Domain-owned embedded fields, constructed in their
            // ---- neutral empty state. NEVER accepted from caller input.
            professions: [],
            rankAssignments: [],
            relationships: [],
            friends: [],
            motherId: null,
            fatherId: null,
            children: [],
            adoptedParents: [],
            adoptedChildren: [],
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
    // 8. PUBLIC ENTRY POINT
    // =========================================================================

    /**
     * Builds a canonical character object from caller-supplied data.
     *
     * @param {Object} data
     * @param {Object} [options]
     * @param {number} [options.currentYear] - required if data.birthYear is
     *   omitted. Callers should pass getCurrentYear() explicitly rather than
     *   relying on the factory to reach for global time.
     *
     * @returns {{ success: boolean, data?: Object, reason?: string }}
     */
    function buildCharacter(data, options) {
        if (_isMissing(data)) data = {};
        if (!_isPlainObject(data)) {
            return { success: false, reason: 'Character data must be a plain object' };
        }
        if (_isMissing(options)) options = {};
        if (!_isPlainObject(options)) {
            return { success: false, reason: 'Options must be a plain object' };
        }

        // Required: name
        var nameResult = _validateName(data);
        if (!nameResult.ok) return { success: false, reason: nameResult.reason };

        // Required when birthYear is absent: currentYear
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

        // Validate every recognised field. Unknown fields are ignored.
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

        // Cross-field invariants

        // isDeceased === true requires deathYear
        if (validated.isDeceased === true && _isMissing(validated.deathYear)) {
            return { success: false, reason: 'deathYear is required for a deceased character' };
        }
        // isDeceased === false must not have deathYear
        if (validated.isDeceased === false && !_isMissing(validated.deathYear)) {
            return { success: false, reason: 'deathYear cannot be set on a living character' };
        }
        // deathYear must not precede birthYear
        if (!_isMissing(validated.isDeceased) && validated.isDeceased === true
            && !_isMissing(validated.deathYear) && !_isMissing(validated.birthYear)
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
    // 9. EXPORTS
    // =========================================================================

    window.buildCharacter = buildCharacter;

    window.CHARACTER_SCHEMA_FIELDS = Object.keys(FIELD_VALIDATORS);

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            buildCharacter: buildCharacter,
            CHARACTER_SCHEMA_FIELDS: window.CHARACTER_SCHEMA_FIELDS
        };
    }
})();
