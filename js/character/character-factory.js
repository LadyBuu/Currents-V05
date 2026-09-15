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
 *   - Validating input data against the canonical character schema
 *   - Applying canonical defaults for missing optional fields
 *   - Generating the character ID
 *   - Assembling the complete character object
 *
 * OUT OF SCOPE:
 *   - Mutation of the canonical collection → CharacterCommands
 *   - Family graph mutations → FamilyCommands
 *   - Random value generation → character-generator.js
 *   - Persistence → storage.js
 *   - Derived queries → CharacterQueries
 *   - Presentation → CharacterUI
 *
 * SEMANTIC RULES:
 *   - Missing (undefined/null) optional fields receive canonical defaults.
 *   - Invalid explicit values are REJECTED, not silently coerced.
 *   - Year 0 is preserved. It is a valid world year.
 *   - Unknown input fields are ignored, not copied through. The factory
 *     defines the schema; the caller does not.
 *   - Array fields are validated as arrays. Object fields are validated
 *     as plain objects.
 *   - The returned character object is deeply owned by the factory. No
 *     references to caller-supplied arrays or objects are retained.
 *   - IDs are generated via ids.js. No fallbacks.
 *
 * SCHEMA:
 *   Required fields:  name
 *   Optional fields:  all others below
 *
 *   See _applyDefaults() for the canonical field list and default values.
 *
 * DEPENDENCIES (REQUIRED):
 *   - ids.js:   generateId
 *   - time.js:  getCurrentYear, isValidYear
 *   - accessors.js: getCharacterById
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 0. DEPENDENCY GUARDS
    // =========================================================================

    function _requireDependencies() {
        var required = [
            'generateId',
            'getCurrentYear',
            'isValidYear',
            'getCharacterById'
        ];
        var missing = [];
        for (var i = 0; i < required.length; i++) {
            if (typeof window[required[i]] === 'undefined') {
                missing.push(required[i]);
            }
        }
        if (missing.length > 0) {
            throw new Error(
                'character-factory.js: missing required dependencies: ' +
                missing.join(', ')
            );
        }
    }

    _requireDependencies();

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

    var VALID_GENDERS = ['male', 'female', 'unknown', 'other'];
    var VALID_ATTRACTIONS = ['both', 'men', 'women', 'neither', 'unknown'];
    var VALID_SURNAME_SOURCES = ['country', 'cultural', 'inherited', 'custom', 'none'];

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

    /**
     * Validates a year value. Returns { ok, value?, reason? }.
     * Missing is allowed when the field is optional; the caller decides.
     */
    function _validateYearOrMissing(value, name) {
        if (_isMissing(value)) return { ok: true, value: null };
        if (!window.isValidYear(value)) {
            return { ok: false, reason: name + ' must be a valid world year' };
        }
        return { ok: true, value: value };
    }

    /**
     * Validates a non-empty string ID field (optional).
     * Returns { ok, value?, reason? }.
     */
    function _validateOptionalId(value, name) {
        if (_isMissing(value)) return { ok: true, value: null };
        if (!_hasId(value)) {
            return { ok: false, reason: name + ' must be a non-empty string when provided' };
        }
        return { ok: true, value: value };
    }

    /**
     * Validates that a field is an array. Missing is allowed.
     */
    function _validateOptionalArray(value, name) {
        if (_isMissing(value)) return { ok: true, value: null };
        if (!Array.isArray(value)) {
            return { ok: false, reason: name + ' must be an array when provided' };
        }
        return { ok: true, value: value };
    }

    /**
     * Validates that a field is a plain object. Missing is allowed.
     */
    function _validateOptionalObject(value, name) {
        if (_isMissing(value)) return { ok: true, value: null };
        if (!_isPlainObject(value)) {
            return { ok: false, reason: name + ' must be a plain object when provided' };
        }
        return { ok: true, value: value };
    }

    /**
     * Validates that a field is a string. Missing is allowed.
     */
    function _validateOptionalString(value, name) {
        if (_isMissing(value)) return { ok: true, value: null };
        if (typeof value !== 'string') {
            return { ok: false, reason: name + ' must be a string when provided' };
        }
        return { ok: true, value: value };
    }

    /**
     * Validates that a field is a boolean. Missing is allowed.
     */
    function _validateOptionalBoolean(value, name) {
        if (_isMissing(value)) return { ok: true, value: null };
        if (typeof value !== 'boolean') {
            return { ok: false, reason: name + ' must be a boolean when provided' };
        }
        return { ok: true, value: value };
    }

    /**
     * Deep-clones a value that has been validated as belonging to the
     * canonical schema. Arrays and plain objects are cloned. Scalars pass
     * through.
     *
     * Uses a plain recursive walk; the factory does not accept arbitrary
     * data structures, so no cycle handling is required.
     */
    function _cloneSchemaValue(value) {
        if (value === null || typeof value !== 'object') return value;
        if (Array.isArray(value)) {
            var arr = [];
            for (var i = 0; i < value.length; i++) {
                arr.push(_cloneSchemaValue(value[i]));
            }
            return arr;
        }
        if (_isPlainObject(value)) {
            var obj = {};
            var keys = Object.keys(value);
            for (var j = 0; j < keys.length; j++) {
                var k = keys[j];
                if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
                obj[k] = _cloneSchemaValue(value[k]);
            }
            return obj;
        }
        return value;
    }

    // =========================================================================
    // 3. NAME VALIDATION
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
        if (trimmed.length > 100) {
            return { ok: false, reason: 'Character name exceeds 100 characters' };
        }
        return { ok: true, value: trimmed };
    }

    // =========================================================================
    // 4. SCHEMA APPLICATION
    // =========================================================================
    //
    // _applyDefaults runs after validation. It receives a `validated`
    // object containing only fields that passed validation, plus the
    // generated ID and current year. It returns the fully-formed character.

    function _applyDefaults(validated, id, currentYear) {
        var now = Date.now();
        var birthYear = _isMissing(validated.birthYear)
            ? currentYear - 25
            : validated.birthYear;

        // Surname history — the caller may supply it, otherwise we
        // construct a canonical default.
        var surnameHistory;
        if (_isPlainObject(validated.surnameHistory)) {
            surnameHistory = validated.surnameHistory;
        } else {
            surnameHistory = {
                birthSurname: typeof validated.surname === 'string' ? validated.surname : '',
                entries: [],
                lastUpdated: birthYear
            };
        }
        if (!Array.isArray(surnameHistory.entries)) surnameHistory.entries = [];
        if (_isMissing(surnameHistory.birthSurname)) {
            surnameHistory.birthSurname = typeof validated.surname === 'string' ? validated.surname : '';
        }
        if (_isMissing(surnameHistory.lastUpdated)) {
            surnameHistory.lastUpdated = birthYear;
        }

        return {
            // Identity
            id: id,
            name: validated.name,
            surname: _isMissing(validated.surname) ? '' : validated.surname,
            surnameSource: _isMissing(validated.surnameSource) ? 'country' : validated.surnameSource,
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

            // Relationships
            relationships: _isMissing(validated.relationships) ? [] : validated.relationships,
            friends: _isMissing(validated.friends) ? [] : validated.friends,
            friendshipDetails: _isMissing(validated.friendshipDetails) ? {} : validated.friendshipDetails,

            // Location and movement
            birthplaceId: _isMissing(validated.birthplaceId) ? null : validated.birthplaceId,
            currentLocationId: _isMissing(validated.currentLocationId) ? null : validated.currentLocationId,
            moves: _isMissing(validated.moves) ? [] : validated.moves,
            household: _isMissing(validated.household) ? null : validated.household,
            householdHistory: _isMissing(validated.householdHistory) ? [] : validated.householdHistory,

            // Rank and professions
            rankAssignments: _isMissing(validated.rankAssignments) ? [] : validated.rankAssignments,
            activeRankId: _isMissing(validated.activeRankId) ? null : validated.activeRankId,
            activeRankNumber: _isMissing(validated.activeRankNumber) ? null : validated.activeRankNumber,
            professions: _isMissing(validated.professions) ? [] : validated.professions,

            // Family
            motherId: _isMissing(validated.motherId) ? null : validated.motherId,
            fatherId: _isMissing(validated.fatherId) ? null : validated.fatherId,
            children: _isMissing(validated.children) ? [] : validated.children,
            adoptedParents: _isMissing(validated.adoptedParents) ? [] : validated.adoptedParents,
            adoptedChildren: _isMissing(validated.adoptedChildren) ? [] : validated.adoptedChildren,

            // Apprenticeship
            apprentices: _isMissing(validated.apprentices) ? [] : validated.apprentices,
            masterId: _isMissing(validated.masterId) ? null : validated.masterId,
            isMaster: _isMissing(validated.isMaster) ? false : validated.isMaster,
            masterProfessionId: _isMissing(validated.masterProfessionId) ? null : validated.masterProfessionId,
            apprenticeshipDetails: _isMissing(validated.apprenticeshipDetails) ? {} : validated.apprenticeshipDetails,

            // Epithet
            epithet: _isMissing(validated.epithet) ? '' : validated.epithet,

            // Misc
            notes: _isMissing(validated.notes) ? '' : validated.notes,
            appearance: _isMissing(validated.appearance) ? {} : validated.appearance,

            // Religion
            religionId: _isMissing(validated.religionId) ? null : validated.religionId,
            religionHistory: _isMissing(validated.religionHistory) ? [] : validated.religionHistory,

            // Culture
            cultureId: _isMissing(validated.cultureId) ? null : validated.cultureId,

            // Soft delete
            isDeleted: false,
            deletedAt: null,

            // Metadata
            createdAt: now,
            updatedAt: now
        };
    }

    // =========================================================================
    // 5. FIELD VALIDATION TABLES
    // =========================================================================
    //
    // Every recognized field has an entry in this table. Fields not listed
    // here are dropped, not copied. The factory defines the schema; the
    // caller does not.

    var FIELD_VALIDATORS = {
        // Identity
        'name': function(v) { return _validateOptionalString(v, 'name'); },
        'surname': function(v) { return _validateOptionalString(v, 'surname'); },
        'surnameSource': function(v) {
            if (_isMissing(v)) return { ok: true, value: null };
            if (typeof v !== 'string') return { ok: false, reason: 'surnameSource must be a string' };
            if (VALID_SURNAME_SOURCES.indexOf(v) === -1) {
                return { ok: false, reason: 'surnameSource must be one of: ' + VALID_SURNAME_SOURCES.join(', ') };
            }
            return { ok: true, value: v };
        },
        'surnameRules': function(v) { return _validateOptionalObject(v, 'surnameRules'); },
        'surnameHistory': function(v) { return _validateOptionalObject(v, 'surnameHistory'); },

        // Demographics
        'gender': function(v) {
            if (_isMissing(v)) return { ok: true, value: null };
            if (typeof v !== 'string') return { ok: false, reason: 'gender must be a string' };
            if (VALID_GENDERS.indexOf(v) === -1) {
                return { ok: false, reason: 'gender must be one of: ' + VALID_GENDERS.join(', ') };
            }
            return { ok: true, value: v };
        },
        'attraction': function(v) {
            if (_isMissing(v)) return { ok: true, value: null };
            if (typeof v !== 'string') return { ok: false, reason: 'attraction must be a string' };
            if (VALID_ATTRACTIONS.indexOf(v) === -1) {
                return { ok: false, reason: 'attraction must be one of: ' + VALID_ATTRACTIONS.join(', ') };
            }
            return { ok: true, value: v };
        },
        'birthYear': function(v) { return _validateYearOrMissing(v, 'birthYear'); },
        'isLegitimate': function(v) { return _validateOptionalBoolean(v, 'isLegitimate'); },

        // Life / death
        'isDeceased': function(v) { return _validateOptionalBoolean(v, 'isDeceased'); },
        'deathYear': function(v) { return _validateYearOrMissing(v, 'deathYear'); },
        'deathCause': function(v) { return _validateOptionalString(v, 'deathCause'); },

        // Relationships
        'relationships': function(v) { return _validateOptionalArray(v, 'relationships'); },
        'friends': function(v) { return _validateOptionalArray(v, 'friends'); },
        'friendshipDetails': function(v) { return _validateOptionalObject(v, 'friendshipDetails'); },

        // Location and movement
        'birthplaceId': function(v) { return _validateOptionalId(v, 'birthplaceId'); },
        'currentLocationId': function(v) { return _validateOptionalId(v, 'currentLocationId'); },
        'moves': function(v) { return _validateOptionalArray(v, 'moves'); },
        'household': function(v) { return _validateOptionalId(v, 'household'); },
        'householdHistory': function(v) { return _validateOptionalArray(v, 'householdHistory'); },

        // Rank and professions
        'rankAssignments': function(v) { return _validateOptionalArray(v, 'rankAssignments'); },
        'activeRankId': function(v) { return _validateOptionalId(v, 'activeRankId'); },
        'activeRankNumber': function(v) {
            if (_isMissing(v)) return { ok: true, value: null };
            if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
                return { ok: false, reason: 'activeRankNumber must be a positive integer when provided' };
            }
            return { ok: true, value: v };
        },
        'professions': function(v) { return _validateOptionalArray(v, 'professions'); },

        // Family
        'motherId': function(v) { return _validateOptionalId(v, 'motherId'); },
        'fatherId': function(v) { return _validateOptionalId(v, 'fatherId'); },
        'children': function(v) { return _validateOptionalArray(v, 'children'); },
        'adoptedParents': function(v) { return _validateOptionalArray(v, 'adoptedParents'); },
        'adoptedChildren': function(v) { return _validateOptionalArray(v, 'adoptedChildren'); },

        // Apprenticeship
        'apprentices': function(v) { return _validateOptionalArray(v, 'apprentices'); },
        'masterId': function(v) { return _validateOptionalId(v, 'masterId'); },
        'isMaster': function(v) { return _validateOptionalBoolean(v, 'isMaster'); },
        'masterProfessionId': function(v) { return _validateOptionalId(v, 'masterProfessionId'); },
        'apprenticeshipDetails': function(v) { return _validateOptionalObject(v, 'apprenticeshipDetails'); },

        // Epithet
        'epithet': function(v) { return _validateOptionalString(v, 'epithet'); },

        // Misc
        'notes': function(v) { return _validateOptionalString(v, 'notes'); },
        'appearance': function(v) { return _validateOptionalObject(v, 'appearance'); },

        // Religion
        'religionId': function(v) { return _validateOptionalId(v, 'religionId'); },
        'religionHistory': function(v) { return _validateOptionalArray(v, 'religionHistory'); },

        // Culture
        'cultureId': function(v) { return _validateOptionalId(v, 'cultureId'); }
    };

    // =========================================================================
    // 6. PUBLIC ENTRY POINT
    // =========================================================================

    /**
     * Builds a canonical character object from caller-supplied data.
     *
     * Input validation:
     *   - `data` must be a plain object.
     *   - Unknown fields are ignored.
     *   - Required fields (name) must be present and valid.
     *   - Optional fields, if present, must match the schema's type and
     *     enum constraints. Invalid explicit values are rejected.
     *
     * Output:
     *   - A fully-formed character object with every schema field present.
     *   - Deep-copied arrays and objects; the caller may freely mutate
     *     their input after this call.
     *   - A newly generated ID.
     *   - A single `createdAt`/`updatedAt` timestamp.
     *
     * @param {Object} data
     * @returns {{ success: boolean, data?: Object, reason?: string }}
     */
    function buildCharacter(data) {
        if (_isMissing(data)) {
            data = {};
        }
        if (!_isPlainObject(data)) {
            return { success: false, reason: 'Character data must be a plain object' };
        }

        // Required fields
        var nameResult = _validateName(data);
        if (!nameResult.ok) return { success: false, reason: nameResult.reason };

        // Validate every recognized field. Unknown fields are dropped.
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
                validated[fieldName] = _cloneSchemaValue(result.value);
            }
        }

        // Deceased with a death year must have deathYear >= birthYear
        if (validated.isDeceased === true
            && !_isMissing(validated.deathYear)
            && !_isMissing(validated.birthYear)) {
            if (validated.deathYear < validated.birthYear) {
                return {
                    success: false,
                    reason: 'deathYear cannot be before birthYear'
                };
            }
        }

        // A living character must not have a death year
        if (validated.isDeceased === false && !_isMissing(validated.deathYear)) {
            return {
                success: false,
                reason: 'deathYear cannot be set on a living character'
            };
        }

        // A deceased character must have a death year
        if (validated.isDeceased === true && _isMissing(validated.deathYear)) {
            return {
                success: false,
                reason: 'deathYear is required for a deceased character'
            };
        }

        var currentYear = window.getCurrentYear();
        var id = window.generateId('char');

        var character = _applyDefaults(validated, id, currentYear);
        return { success: true, data: character };
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.buildCharacter = buildCharacter;

    // Expose the schema for callers that want to introspect it (e.g., a
    // future validation module that audits canonical character shape).
    window.CHARACTER_SCHEMA_FIELDS = Object.keys(FIELD_VALIDATORS);

})();