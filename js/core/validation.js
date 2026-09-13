/**
 * =============================================================================
 * STILL WATERS - VALIDATION (validation.js)
 * =============================================================================
 *
 * LOCATION: js/core/validation.js
 *
 * SINGLE SOURCE OF TRUTH for validation.
 *
 * SCOPE:
 *   - Field shape validation (year, name, ID syntax, etc.)
 *   - Entity validation (character, place, rank, role, relationship)
 *   - Reference syntax validation within entities
 *   - Import structural + entity validation
 *   - Schema field presence/unknown-field checking
 *
 * OUT OF SCOPE:
 *   - Existence checks ("does this entity exist in canonical data?")
 *     → see accessors.js: characterExists, placeExists, roleExists, ...
 *   - Presentation formatting → see formatting.js
 *   - Data access → see accessors.js
 *   - Storage-boundary string normalization → see storage-schema.js
 *   - Import policy (defaults for invalid fields) → caller / import layer
 *
 * SEMANTIC RULES:
 *   - Years are integers. Fractional years are invalid.
 *   - Year 0 is valid. Negative years are valid within range.
 *   - Validators do not mutate. They return { isValid, errors, warnings }.
 *   - Missing field vs invalid field are distinguished in messages.
 *   - ID syntax here means "well-formed string". Existence is a separate,
 *     explicitly named concern owned by accessors.js.
 *   - Explicit missing checks only. Truthiness is not a domain predicate.
 *   - For supported runtime dependencies, arbitrary caller input does not
 *     throw. Missing dependencies throw (see _requireTimeConstants).
 *     "Total" is bounded by that contract.
 *
 * DEPENDENCIES (REQUIRED):
 *   - time.js: TIME_CONSTANTS.MIN_YEAR, TIME_CONSTANTS.MAX_YEAR
 *
 * OPTIONAL:
 *   - constants.js: GENDER_VALUES, ATTRACTION_VALUES, RELATIONSHIP_STATUS
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

// =============================================================================
// 0. DEPENDENCY GUARDS
// =============================================================================

function _requireTimeConstants() {
    if (typeof window.TIME_CONSTANTS === 'undefined'
        || typeof window.TIME_CONSTANTS.MIN_YEAR !== 'number'
        || typeof window.TIME_CONSTANTS.MAX_YEAR !== 'number') {
        throw new Error(
            'validation.js: time.js must load first ' +
            '(TIME_CONSTANTS.MIN_YEAR / MAX_YEAR missing).'
        );
    }
    return window.TIME_CONSTANTS;
}

/**
 * Returns a canonical domain enum from constants.js if available.
 * Returns null if the canonical source isn't loaded — validation does
 * NOT invent fallback definitions of domain vocabulary.
 * @private
 */
function _getCanonicalEnum(name) {
    if (typeof window[name] !== 'undefined' && Array.isArray(window[name])) {
        return window[name];
    }
    return null;
}

// =============================================================================
// 1. CONSTANTS
// =============================================================================

// Validation-layer constants. These describe validation policy, NOT world
// rules. World rules (year bounds, time policy, simulation parameters)
// belong to their canonical owners.
var VALIDATION_CONSTANTS = {
    MAX_NAME_LENGTH: 100,
    MAX_SURNAME_LENGTH: 100,
    MAX_DISPLAY_NAME_LENGTH: 200,
    MAX_NOTE_LENGTH: 5000,
    MAX_SYMBOL_LENGTH: 3,
    MAX_EPITHET_LENGTH: 50,
    MAX_SPECIALIZATION_LENGTH: 50,
    ID_REGEX: /^[a-zA-Z0-9_-]+$/,
    NAME_REGEX: /^[\p{L}\s\-'\.]+$/u,
    VARIABLE_KEY_REGEX: /^[a-z0-9_]+$/
};

function _getPlaceStatuses() {
    return ['active', 'disputed', 'abandoned', 'ruined'];
}

function _getRankGenderRestrictions() {
    return ['either', 'male', 'female'];
}

function _getRoleGenderRestrictions() {
    return ['both', 'male', 'female'];
}

function _getRelationshipTypes() {
    return ['casual', 'serious', 'affair', 'betrothed', 'marriage', 'committed', 'romance'];
}

// =============================================================================
// 2. YEAR VALIDATION
// =============================================================================

/**
 * Returns true if `year` is a valid integer world year.
 * Year 0 is valid. Fractional years are invalid.
 * Bounds come from TIME_CONSTANTS unless explicitly overridden.
 *
 * @param {number} year
 * @param {number} [minYear]
 * @param {number} [maxYear]
 * @returns {boolean}
 */
function isValidYear(year, minYear, maxYear) {
    var time = _requireTimeConstants();

    if (minYear === undefined || minYear === null) minYear = time.MIN_YEAR;
    if (maxYear === undefined || maxYear === null) maxYear = time.MAX_YEAR;

    if (year === undefined || year === null) return false;
    if (typeof year !== 'number') return false;
    if (!Number.isFinite(year)) return false;
    if (!Number.isInteger(year)) return false;
    return year >= minYear && year <= maxYear;
}

/**
 * Checks consistency between birth year, death year, and deceased flag.
 *
 * Owns ALL birth/death year semantics. Callers should not duplicate the
 * birth-year check separately.
 *
 * @param {number|null} birthYear
 * @param {number|null} deathYear
 * @param {boolean} isDeceased
 * @returns {{ isValid: boolean, message: string }}
 */
function validateYearsConsistency(birthYear, deathYear, isDeceased) {
    // isDeceased must be an actual boolean. Silent coercion hides bugs.
    if (isDeceased !== undefined && isDeceased !== null
        && typeof isDeceased !== 'boolean') {
        return {
            isValid: false,
            message: 'isDeceased must be a boolean, got: ' + typeof isDeceased
        };
    }

    var deceased = isDeceased === true;
    var hasBirth = birthYear !== null && birthYear !== undefined;
    var hasDeath = deathYear !== null && deathYear !== undefined;

    if (!hasBirth) {
        if (hasDeath) {
            return {
                isValid: false,
                message: 'Death year specified without a birth year'
            };
        }
        return { isValid: true, message: 'No birth year specified' };
    }

    if (!isValidYear(birthYear)) {
        return { isValid: false, message: 'Invalid birth year: ' + birthYear };
    }

    if (deceased) {
        if (!hasDeath) {
            return { isValid: false, message: 'Deceased character must have a death year' };
        }
        if (!isValidYear(deathYear)) {
            return { isValid: false, message: 'Invalid death year: ' + deathYear };
        }
        if (deathYear < birthYear) {
            return {
                isValid: false,
                message: 'Death year (' + deathYear + ') cannot be before birth year (' + birthYear + ')'
            };
        }
    } else {
        if (hasDeath) {
            return { isValid: false, message: 'Living character has a death year' };
        }
    }

    return { isValid: true, message: 'Valid' };
}

// =============================================================================
// 3. ID SYNTAX VALIDATION
// =============================================================================
//
// These check that an ID STRING is well-formed. They do NOT check whether
// an entity with that ID exists in canonical data. For existence checks,
// use accessors.js's characterExists / placeExists / roleExists / etc.

/**
 * True if `id` is a well-formed ID string (non-empty, allowed characters).
 * @param {*} id
 * @returns {boolean}
 */
function isValidIdSyntax(id) {
    if (id === undefined || id === null) return false;
    if (typeof id !== 'string' || id.length === 0) return false;
    return VALIDATION_CONSTANTS.ID_REGEX.test(id);
}

/**
 * True if `id` is a well-formed character ID string.
 * Does NOT check existence.
 */
function isValidCharacterId(id) {
    return isValidIdSyntax(id);
}

/**
 * True if `id` is a well-formed place ID string.
 * Does NOT check existence.
 */
function isValidPlaceId(id) {
    return isValidIdSyntax(id);
}

/**
 * Validates a reference ID field: either explicitly missing, or a valid
 * ID string. Never accepts a malformed string, a non-string, or an empty
 * string.
 *
 * @param {*} id
 * @param {string} fieldName - for the error message
 * @param {Function} syntaxChecker - isValidCharacterId / isValidPlaceId / ...
 * @param {string[]} errors - accumulator
 */
function _checkReferenceId(id, fieldName, syntaxChecker, errors) {
    if (id === undefined || id === null) return;
    if (!syntaxChecker(id)) {
        errors.push(fieldName + ' "' + String(id) + '" is not a valid ID');
    }
}

// =============================================================================
// 4. CHARACTER VALIDATION
// =============================================================================

function validateCharacter(char, context) {
    context = context || {};
    var errors = [];

    if (!char || typeof char !== 'object') {
        return { isValid: false, errors: ['Character is null or not an object'] };
    }

    // --- Identity ---
    if (char.id === undefined || char.id === null) {
        errors.push('Character missing ID');
    } else if (!isValidCharacterId(char.id)) {
        errors.push('Character ID "' + char.id + '" is not a valid ID');
    }

    if (char.name === undefined || char.name === null
        || typeof char.name !== 'string' || char.name.trim() === '') {
        errors.push('Character name is required');
    } else if (char.name.length > VALIDATION_CONSTANTS.MAX_NAME_LENGTH) {
        errors.push('Character name exceeds ' + VALIDATION_CONSTANTS.MAX_NAME_LENGTH + ' characters');
    } else if (!VALIDATION_CONSTANTS.NAME_REGEX.test(char.name.trim())) {
        errors.push('Character name "' + char.name + '" contains invalid characters');
    }

    // --- Surname ---
    if (char.surname !== undefined && char.surname !== null) {
        if (typeof char.surname !== 'string') {
            errors.push('Surname must be a string');
        } else if (char.surname.length > VALIDATION_CONSTANTS.MAX_SURNAME_LENGTH) {
            errors.push('Surname exceeds ' + VALIDATION_CONSTANTS.MAX_SURNAME_LENGTH + ' characters');
        } else if (char.surname && !VALIDATION_CONSTANTS.NAME_REGEX.test(char.surname)) {
            errors.push('Surname "' + char.surname + '" contains invalid characters');
        }
    }

    // --- Domain enum fields ---
    var genders = _getCanonicalEnum('GENDER_VALUES');
    if (char.gender !== undefined && char.gender !== null) {
        if (!genders) {
            errors.push('GENDER_VALUES not loaded; cannot validate gender');
        } else if (genders.indexOf(char.gender) === -1) {
            errors.push('Invalid gender: ' + char.gender);
        }
    }

    var attractions = _getCanonicalEnum('ATTRACTION_VALUES');
    if (char.attraction !== undefined && char.attraction !== null) {
        if (!attractions) {
            errors.push('ATTRACTION_VALUES not loaded; cannot validate attraction');
        } else if (attractions.indexOf(char.attraction) === -1) {
            errors.push('Invalid attraction: ' + char.attraction);
        }
    }

    // --- Epithet ---
    if (char.epithet !== undefined && char.epithet !== null) {
        if (typeof char.epithet !== 'string') {
            errors.push('Epithet must be a string');
        } else if (char.epithet.length > VALIDATION_CONSTANTS.MAX_EPITHET_LENGTH) {
            errors.push('Epithet exceeds ' + VALIDATION_CONSTANTS.MAX_EPITHET_LENGTH + ' characters');
        }
    }

    // --- isDeceased ---
    if (char.isDeceased !== undefined && char.isDeceased !== null
        && typeof char.isDeceased !== 'boolean') {
        errors.push('isDeceased must be a boolean');
    }

    // --- Years (consistency validator owns ALL year semantics) ---
    var yearCheck = validateYearsConsistency(char.birthYear, char.deathYear, char.isDeceased);
    if (!yearCheck.isValid) {
        errors.push(yearCheck.message);
    }

    // --- Reference ID syntax ---
    // Mother / father / household are character-or-household IDs; we check
    // syntax only. Existence belongs to accessors / integrity.
    _checkReferenceId(char.motherId, 'Mother ID', isValidCharacterId, errors);
    _checkReferenceId(char.fatherId, 'Father ID', isValidCharacterId, errors);

    if (char.household !== undefined && char.household !== null
        && typeof char.household !== 'string') {
        errors.push('Household must be a string');
    }

    // --- Notes ---
    if (char.notes !== undefined && char.notes !== null) {
        if (typeof char.notes !== 'string') {
            errors.push('Notes must be a string');
        } else if (char.notes.length > VALIDATION_CONSTANTS.MAX_NOTE_LENGTH) {
            errors.push('Notes exceed ' + VALIDATION_CONSTANTS.MAX_NOTE_LENGTH + ' characters');
        }
    }

    // --- Import duplicate detection (only when caller supplies a set that
    //     is NOT the import's own ID set — see validateImportData) ---
    if (context.existingCharacterIds
        && typeof context.existingCharacterIds.has === 'function'
        && char.id !== undefined && char.id !== null
        && context.existingCharacterIds.has(char.id)) {
        errors.push('Duplicate character ID: ' + char.id);
    }

    // --- Reference existence checks (only when caller supplies ID sets
    //     representing the world's canonical ID space, not the import) ---
    if (context.existingCharacterIds && typeof context.existingCharacterIds.has === 'function') {
        if (char.motherId !== undefined && char.motherId !== null
            && !context.existingCharacterIds.has(char.motherId)) {
            errors.push('Mother "' + char.motherId + '" does not exist');
        }
        if (char.fatherId !== undefined && char.fatherId !== null
            && !context.existingCharacterIds.has(char.fatherId)) {
            errors.push('Father "' + char.fatherId + '" does not exist');
        }
    }

    return { isValid: errors.length === 0, errors: errors };
}

/**
 * Validates a character's age against a reference year and maximum.
 *
 * Semantics:
 *   - missing birthYear            → valid, age null
 *   - invalid birthYear            → INVALID
 *   - valid birthYear, no ref year → valid/indeterminate, age null
 *   - negative age                 → invalid
 *   - age > maxAge                 → invalid
 *
 * @param {Object} char
 * @param {number} currentYear
 * @param {number} [maxAge]
 * @returns {{ isValid: boolean, age: number|null, message: string }}
 */
function validateCharacterAge(char, currentYear, maxAge) {
    if (!char || typeof char !== 'object') {
        return { isValid: false, age: null, message: 'Invalid character' };
    }

    if (maxAge !== undefined && maxAge !== null) {
        if (typeof maxAge !== 'number' || !Number.isFinite(maxAge)
            || !Number.isInteger(maxAge) || maxAge < 0) {
            return {
                isValid: false,
                age: null,
                message: 'maxAge must be a non-negative integer'
            };
        }
    }

    var hasBirth = char.birthYear !== undefined && char.birthYear !== null;
    if (!hasBirth) {
        return { isValid: true, age: null, message: 'No birth year set' };
    }
    if (!isValidYear(char.birthYear)) {
        return {
            isValid: false,
            age: null,
            message: 'Invalid birth year: ' + char.birthYear
        };
    }

    var age;
    if (char.isDeceased === true && isValidYear(char.deathYear)) {
        age = char.deathYear - char.birthYear;
    } else if (isValidYear(currentYear)) {
        age = currentYear - char.birthYear;
    } else {
        return {
            isValid: true,
            age: null,
            message: 'Cannot determine age without a reference year'
        };
    }

    if (age < 0) {
        return {
            isValid: false,
            age: age,
            message: 'Negative age (' + age + ') - birth year after reference year'
        };
    }

    if (maxAge !== undefined && maxAge !== null && age > maxAge) {
        return {
            isValid: false,
            age: age,
            message: 'Age ' + age + ' exceeds maximum ' + maxAge
        };
    }

    return { isValid: true, age: age, message: 'Valid age' };
}

// =============================================================================
// 5. PLACE VALIDATION
// =============================================================================

function validatePlace(place, context) {
    context = context || {};
    var errors = [];

    if (!place || typeof place !== 'object') {
        return { isValid: false, errors: ['Place is null or not an object'] };
    }

    if (place.id === undefined || place.id === null) {
        errors.push('Place missing ID');
    } else if (!isValidPlaceId(place.id)) {
        errors.push('Place ID "' + place.id + '" is not a valid ID');
    }

    if (place.displayName === undefined || place.displayName === null
        || typeof place.displayName !== 'string' || place.displayName.trim() === '') {
        errors.push('Place name is required');
    } else if (place.displayName.length > VALIDATION_CONSTANTS.MAX_DISPLAY_NAME_LENGTH) {
        errors.push('Place name exceeds ' + VALIDATION_CONSTANTS.MAX_DISPLAY_NAME_LENGTH + ' characters');
    }

    if (place.typeId === undefined || place.typeId === null) {
        errors.push('Place "' + (place.displayName || 'unnamed') + '" missing type ID');
    } else if (typeof place.typeId !== 'string' || place.typeId.length === 0) {
        errors.push('Place typeId must be a non-empty string');
    }

    if (place.status !== undefined && place.status !== null) {
        if (_getPlaceStatuses().indexOf(place.status) === -1) {
            errors.push('Invalid place status: ' + place.status);
        }
    }

    if (place.variableKey !== undefined && place.variableKey !== null) {
        if (typeof place.variableKey !== 'string') {
            errors.push('Variable key must be a string');
        } else if (place.variableKey && !VALIDATION_CONSTANTS.VARIABLE_KEY_REGEX.test(place.variableKey)) {
            errors.push('Variable key "' + place.variableKey + '" should be lowercase with underscores only');
        }
    }

    _checkReferenceId(place.parentId, 'Parent ID', isValidPlaceId, errors);
    if (place.parentId !== undefined && place.parentId !== null
        && context.existingPlaceIds
        && typeof context.existingPlaceIds.has === 'function'
        && !context.existingPlaceIds.has(place.parentId)) {
        errors.push('Parent place "' + place.parentId + '" does not exist');
    }

    if (place.notes !== undefined && place.notes !== null) {
        if (typeof place.notes !== 'string') {
            errors.push('Place notes must be a string');
        } else if (place.notes.length > VALIDATION_CONSTANTS.MAX_NOTE_LENGTH) {
            errors.push('Place notes exceed ' + VALIDATION_CONSTANTS.MAX_NOTE_LENGTH + ' characters');
        }
    }

    if (context.existingPlaceIds
        && typeof context.existingPlaceIds.has === 'function'
        && place.id !== undefined && place.id !== null
        && context.existingPlaceIds.has(place.id)) {
        errors.push('Duplicate place ID: ' + place.id);
    }

    return { isValid: errors.length === 0, errors: errors };
}

/**
 * Detects parent cycles in a place hierarchy.
 *
 * @param {Object} place
 * @param {Map|Object} placesById - Lookup keyed by place id
 * @returns {{ isValid: boolean, message: string }}
 */
function validatePlaceHierarchy(place, placesById) {
    if (!place || typeof place !== 'object') {
        return { isValid: false, message: 'Invalid place' };
    }
    if (place.parentId === undefined || place.parentId === null) {
        return { isValid: true, message: 'No parent; root place' };
    }
    if (!placesById) {
        return { isValid: true, message: 'Cannot check cycle without lookup' };
    }

    var get = function(id) {
        if (typeof placesById.get === 'function') return placesById.get(id);
        return placesById[id];
    };

    var seen = new Set();
    seen.add(place.id);

    var current = get(place.parentId);
    while (current) {
        if (current.id === undefined || current.id === null) {
            return { isValid: false, message: 'Parent entity missing ID' };
        }
        if (seen.has(current.id)) {
            return { isValid: false, message: 'Circular parent reference detected' };
        }
        seen.add(current.id);
        if (current.parentId === undefined || current.parentId === null) break;
        current = get(current.parentId);
    }

    return { isValid: true, message: 'Valid hierarchy' };
}

// =============================================================================
// 6. RANK VALIDATION
// =============================================================================

function validateRank(rank, context) {
    context = context || {};
    var errors = [];

    if (!rank || typeof rank !== 'object') {
        return { isValid: false, errors: ['Rank is null or not an object'] };
    }

    if (rank.id === undefined || rank.id === null) {
        errors.push('Rank missing ID');
    }
    if (rank.name === undefined || rank.name === null
        || typeof rank.name !== 'string' || rank.name.trim() === '') {
        errors.push('Rank name is required');
    } else if (rank.name.length > VALIDATION_CONSTANTS.MAX_NAME_LENGTH) {
        errors.push('Rank name exceeds ' + VALIDATION_CONSTANTS.MAX_NAME_LENGTH + ' characters');
    }

    if (rank.priority !== undefined && rank.priority !== null) {
        if (typeof rank.priority !== 'number' || !Number.isInteger(rank.priority)
            || rank.priority < 1 || rank.priority > 5) {
            errors.push('Rank priority must be an integer between 1-5, got: ' + rank.priority);
        }
    }

    if (rank.genderRestriction !== undefined && rank.genderRestriction !== null) {
        if (_getRankGenderRestrictions().indexOf(rank.genderRestriction) === -1) {
            errors.push('Invalid gender restriction: ' + rank.genderRestriction);
        }
    }

    if (rank.symbol !== undefined && rank.symbol !== null) {
        if (typeof rank.symbol !== 'string') {
            errors.push('Rank symbol must be a string');
        } else if (rank.symbol.length > VALIDATION_CONSTANTS.MAX_SYMBOL_LENGTH) {
            errors.push('Rank symbol should be at most ' + VALIDATION_CONSTANTS.MAX_SYMBOL_LENGTH + ' characters');
        }
    }

    if (rank.numbered !== undefined && rank.numbered !== null
        && typeof rank.numbered !== 'boolean') {
        errors.push('Rank.numbered must be a boolean');
    }

    if (context.existingRankIds
        && typeof context.existingRankIds.has === 'function'
        && rank.id !== undefined && rank.id !== null
        && context.existingRankIds.has(rank.id)) {
        errors.push('Duplicate rank ID: ' + rank.id);
    }

    return { isValid: errors.length === 0, errors: errors };
}

// =============================================================================
// 7. ROLE VALIDATION
// =============================================================================

function validateRole(role, context) {
    context = context || {};
    var errors = [];

    if (!role || typeof role !== 'object') {
        return { isValid: false, errors: ['Role is null or not an object'] };
    }

    if (role.id === undefined || role.id === null) {
        errors.push('Role missing ID');
    }
    if (role.name === undefined || role.name === null
        || typeof role.name !== 'string' || role.name.trim() === '') {
        errors.push('Role name is required');
    } else if (role.name.length > VALIDATION_CONSTANTS.MAX_NAME_LENGTH) {
        errors.push('Role name exceeds ' + VALIDATION_CONSTANTS.MAX_NAME_LENGTH + ' characters');
    }

    if (role.genderRestriction !== undefined && role.genderRestriction !== null) {
        if (_getRoleGenderRestrictions().indexOf(role.genderRestriction) === -1) {
            errors.push('Invalid gender restriction: ' + role.genderRestriction);
        }
    }

    if (role.specializations !== undefined && role.specializations !== null) {
        if (!Array.isArray(role.specializations)) {
            errors.push('Specializations must be an array');
        } else {
            for (var i = 0; i < role.specializations.length; i++) {
                if (typeof role.specializations[i] !== 'string') {
                    errors.push('Specialization at index ' + i + ' must be a string');
                } else if (role.specializations[i].length > VALIDATION_CONSTANTS.MAX_SPECIALIZATION_LENGTH) {
                    errors.push('Specialization "' + role.specializations[i] + '" exceeds ' + VALIDATION_CONSTANTS.MAX_SPECIALIZATION_LENGTH + ' characters');
                }
            }
        }
    }

    if (role.notes !== undefined && role.notes !== null) {
        if (typeof role.notes !== 'string') {
            errors.push('Role notes must be a string');
        } else if (role.notes.length > VALIDATION_CONSTANTS.MAX_NOTE_LENGTH) {
            errors.push('Role notes exceed ' + VALIDATION_CONSTANTS.MAX_NOTE_LENGTH + ' characters');
        }
    }

    if (context.existingRoleIds
        && typeof context.existingRoleIds.has === 'function'
        && role.id !== undefined && role.id !== null
        && context.existingRoleIds.has(role.id)) {
        errors.push('Duplicate role ID: ' + role.id);
    }

    return { isValid: errors.length === 0, errors: errors };
}

// =============================================================================
// 8. RELATIONSHIP VALIDATION
// =============================================================================

/**
 * Validates a single relationship record owned by `charId`.
 *
 * @param {Object} relationship
 * @param {string} charId - owning character
 * @param {string} partnerId - the other party
 * @param {Object} [context]
 * @returns {{ isValid: boolean, errors: string[], warnings: string[] }}
 */
function validateRelationship(relationship, charId, partnerId, context) {
    context = context || {};
    var errors = [];
    var warnings = [];

    if (!relationship || typeof relationship !== 'object') {
        return { isValid: false, errors: ['Relationship is null or not an object'], warnings: warnings };
    }
    if (!charId || !partnerId) {
        return { isValid: false, errors: ['Missing character or partner ID'], warnings: warnings };
    }
    if (charId === partnerId) {
        errors.push('Character cannot have a relationship with themselves');
    }

    if (relationship.partnerId !== undefined && relationship.partnerId !== null
        && relationship.partnerId !== partnerId) {
        errors.push('Relationship partner mismatch: expected ' + partnerId + ', got ' + relationship.partnerId);
    }

    if (relationship.status !== undefined && relationship.status !== null) {
        var statuses = _getCanonicalEnum('RELATIONSHIP_STATUS');
        // RELATIONSHIP_STATUS is an object (enum), not an array — handle both.
        var statusList = statuses
            ? Object.keys(statuses).map(function(k) { return statuses[k]; })
            : ['ongoing', 'ended', 'widowed', 'single', 'partnered'];
        if (statusList.indexOf(relationship.status) === -1) {
            errors.push('Invalid relationship status: ' + relationship.status);
        }
    }

    var details = relationship.details;
    if (details !== undefined && details !== null) {
        if (typeof details !== 'object' || Array.isArray(details)) {
            errors.push('Relationship details must be an object');
            details = null;
        }
    }
    if (!details) details = {};

    var hasStart = details.startYear !== undefined && details.startYear !== null;
    var hasEnd = details.endYear !== undefined && details.endYear !== null;

    if (hasStart && !isValidYear(details.startYear)) {
        errors.push('Invalid start year: ' + details.startYear);
    }
    if (hasEnd && !isValidYear(details.endYear)) {
        errors.push('Invalid end year: ' + details.endYear);
    }
    if (hasStart && hasEnd
        && isValidYear(details.startYear) && isValidYear(details.endYear)
        && details.endYear < details.startYear) {
        errors.push('End year (' + details.endYear + ') before start year (' + details.startYear + ')');
    }

    if (details.type !== undefined && details.type !== null) {
        if (_getRelationshipTypes().indexOf(details.type) === -1) {
            errors.push('Invalid relationship type: ' + details.type);
        }
    }

    if (context.existingCharacterIds
        && typeof context.existingCharacterIds.has === 'function'
        && !context.existingCharacterIds.has(partnerId)) {
        errors.push('Partner character "' + partnerId + '" does not exist');
    }

    if (context.partnerHasRelationship === false) {
        warnings.push('Relationship may not be bidirectional - partner lacks matching record');
    }

    return { isValid: errors.length === 0, errors: errors, warnings: warnings };
}

/**
 * Validates that two relationship records are reciprocal.
 *
 * @param {Object} rel1 - relationship owned by char1Id
 * @param {string} char1Id
 * @param {Object} rel2 - relationship owned by char2Id
 * @param {string} char2Id
 * @returns {{ isConsistent: boolean, issues: string[] }}
 */
function validateBidirectionalRelationship(rel1, char1Id, rel2, char2Id) {
    var issues = [];

    if (!rel1 || !rel2) {
        issues.push('Missing bidirectional relationship');
        return { isConsistent: false, issues: issues };
    }
    if (!char1Id || !char2Id) {
        issues.push('Missing owner character IDs for bidirectional check');
        return { isConsistent: false, issues: issues };
    }

    // rel1 belongs to char1 and should point at char2.
    // rel2 belongs to char2 and should point at char1.
    if (rel1.partnerId !== undefined && rel1.partnerId !== null
        && rel1.partnerId !== char2Id) {
        issues.push('rel1.partnerId should be ' + char2Id + ', got ' + rel1.partnerId);
    }
    if (rel2.partnerId !== undefined && rel2.partnerId !== null
        && rel2.partnerId !== char1Id) {
        issues.push('rel2.partnerId should be ' + char1Id + ', got ' + rel2.partnerId);
    }

    if (rel1.status !== rel2.status) {
        issues.push('Status mismatch: ' + rel1.status + ' vs ' + rel2.status);
    }

    var details1 = rel1.details || {};
    var details2 = rel2.details || {};
    if (details1.startYear !== details2.startYear) {
        issues.push('Start year mismatch: ' + details1.startYear + ' vs ' + details2.startYear);
    }
    if (details1.endYear !== details2.endYear) {
        issues.push('End year mismatch: ' + details1.endYear + ' vs ' + details2.endYear);
    }
    if (details1.type !== details2.type) {
        issues.push('Type mismatch: ' + details1.type + ' vs ' + details2.type);
    }

    return { isConsistent: issues.length === 0, issues: issues };
}

// =============================================================================
// 9. IMPORT VALIDATION
// =============================================================================

/**
 * @private
 * Detects whether `imported` looks like a Still Waters payload and returns
 * the inner data object. Returns null if unrecognized.
 */
function _detectImportPayload(imported) {
    if (!imported || typeof imported !== 'object') return null;
    if (imported.type === 'master' && imported.data && typeof imported.data === 'object') {
        return imported.data;
    }
    if (imported.data && typeof imported.data === 'object'
        && _hasAnyCanonicalCollection(imported.data)) {
        return imported.data;
    }
    if (_hasAnyCanonicalCollection(imported)) {
        return imported;
    }
    return null;
}

/**
 * @private
 * True if the object contains at least one recognized canonical collection
 * or reference-data field. Used for import format detection only.
 */
function _hasAnyCanonicalCollection(obj) {
    if (!obj || typeof obj !== 'object') return false;
    var keys = ['characters', 'places', 'ranks', 'roles', 'locationTypes',
                'governmentTypes', 'households', 'residences', 'disasters',
                'eventLog', 'nameLists', 'cityNameParts', 'rankInheritanceRules'];
    for (var i = 0; i < keys.length; i++) {
        if (obj[keys[i]] !== undefined) return true;
    }
    return false;
}

/**
 * @private
 * Collects canonical IDs from an array into a Set.
 * Does NOT decide what constitutes an ID; malformed IDs are left for the
 * entity validator to report.
 */
function _collectIds(arr) {
    var set = new Set();
    if (!Array.isArray(arr)) return set;
    for (var i = 0; i < arr.length; i++) {
        var item = arr[i];
        if (!item) continue;
        if (typeof item.id === 'string' && item.id.length > 0) {
            set.add(item.id);
        }
    }
    return set;
}

/**
 * @private
 * Builds an id -> entity map for cycle detection and lookups.
 * Only string IDs are indexed.
 */
function _buildIdLookup(arr) {
    var m = new Map();
    if (!Array.isArray(arr)) return m;
    for (var i = 0; i < arr.length; i++) {
        var item = arr[i];
        if (!item) continue;
        if (typeof item.id === 'string' && item.id.length > 0) {
            m.set(item.id, item);
        }
    }
    return m;
}

/**
 * @private
 * Reports duplicates within an import's own ID set as errors.
 */
function _reportSelfDuplicates(arr, entityLabel, errors) {
    if (!Array.isArray(arr)) return;
    var seen = new Set();
    for (var i = 0; i < arr.length; i++) {
        var item = arr[i];
        if (!item) continue;
        if (typeof item.id !== 'string' || item.id.length === 0) continue;
        if (seen.has(item.id)) {
            errors.push('Duplicate ' + entityLabel + ' ID: ' + item.id);
        } else {
            seen.add(item.id);
        }
    }
}

/**
 * Validates an imported JSON structure.
 *
 * The context passed to entity validators describes the IMPORT's ID space
 * for reference resolution. It is NOT passed as `existing*Ids`, because
 * those are reserved for "IDs already in the canonical world". The import's
 * own duplicate detection is done by dedicated passes.
 *
 * @param {Object} imported
 * @returns {{ isValid: boolean, errors: string[], warnings: string[] }}
 */
function validateImportData(imported) {
    var errors = [];
    var warnings = [];

    var dataToValidate = _detectImportPayload(imported);
    if (!dataToValidate) {
        errors.push('Unknown file format - expected Still Waters export');
        return { isValid: false, errors: errors, warnings: warnings };
    }

    // --- Structural shape checks ---
    var arrayFields = [
        ['characters', 'Characters'],
        ['places', 'Places'],
        ['ranks', 'Ranks'],
        ['roles', 'Roles'],
        ['locationTypes', 'Location types'],
        ['governmentTypes', 'Government types'],
        ['households', 'Households'],
        ['residences', 'Residences'],
        ['disasters', 'Disasters'],
        ['eventLog', 'Event log']
    ];
    for (var i = 0; i < arrayFields.length; i++) {
        var key = arrayFields[i][0];
        var label = arrayFields[i][1];
        if (dataToValidate[key] !== undefined && !Array.isArray(dataToValidate[key])) {
            errors.push(label + ' must be an array');
        }
    }

    // --- Collect IDs (for reference resolution within the import) ---
    var importCharacterIds = _collectIds(dataToValidate.characters);
    var importPlaceIds = _collectIds(dataToValidate.places);

    // --- Self-duplicate detection within the import ---
    _reportSelfDuplicates(dataToValidate.characters, 'character', errors);
    _reportSelfDuplicates(dataToValidate.places, 'place', errors);
    _reportSelfDuplicates(dataToValidate.ranks, 'rank', errors);
    _reportSelfDuplicates(dataToValidate.roles, 'role', errors);

    // --- Validate characters (references resolved against the import) ---
    if (Array.isArray(dataToValidate.characters)) {
        // NOTE: existingCharacterIds here means "IDs available for reference
        // resolution", NOT "IDs that already exist in canonical data". The
        // entity validator uses this set for mother/father existence and,
        // because we do NOT want to double-report duplicates, we do not
        // supply it as the duplicate-detection set.
        var charContext = {
            existingCharacterIds: importCharacterIds
        };
        for (var i = 0; i < dataToValidate.characters.length; i++) {
            var char = dataToValidate.characters[i];
            var v = validateCharacter(char, charContext);
            for (var k = 0; k < v.errors.length; k++) {
                errors.push('Character ' + (char && char.name ? '"' + char.name + '"' : '#' + i) + ': ' + v.errors[k]);
            }
        }
    } else {
        warnings.push('No characters found in import data');
    }

    // --- Validate places (single lookup built once) ---
    if (Array.isArray(dataToValidate.places)) {
        var placeContext = { existingPlaceIds: importPlaceIds };
        var placesById = _buildIdLookup(dataToValidate.places);

        for (var i = 0; i < dataToValidate.places.length; i++) {
            var place = dataToValidate.places[i];
            var pv = validatePlace(place, placeContext);
            for (var k = 0; k < pv.errors.length; k++) {
                errors.push('Place ' + (place && place.displayName ? '"' + place.displayName + '"' : '#' + i) + ': ' + pv.errors[k]);
            }

            if (place && place.parentId !== undefined && place.parentId !== null) {
                var cyc = validatePlaceHierarchy(place, placesById);
                if (!cyc.isValid) {
                    errors.push('Place ' + (place.displayName || place.id) + ': ' + cyc.message);
                }
            }
        }
    }

    // --- Validate ranks ---
    if (Array.isArray(dataToValidate.ranks)) {
        for (var i = 0; i < dataToValidate.ranks.length; i++) {
            var rv = validateRank(dataToValidate.ranks[i], {});
            for (var k = 0; k < rv.errors.length; k++) {
                errors.push('Rank #' + i + ': ' + rv.errors[k]);
            }
        }
    }

    // --- Validate roles ---
    if (Array.isArray(dataToValidate.roles)) {
        for (var i = 0; i < dataToValidate.roles.length; i++) {
            var rlv = validateRole(dataToValidate.roles[i], {});
            for (var k = 0; k < rlv.errors.length; k++) {
                errors.push('Role #' + i + ': ' + rlv.errors[k]);
            }
        }
    }

    // --- Metadata: report only. Import policy decides what to do. ---
    if (dataToValidate.currentYear !== undefined
        && dataToValidate.currentYear !== null
        && !isValidYear(dataToValidate.currentYear)) {
        warnings.push('Invalid current year: ' + dataToValidate.currentYear);
    }

    return { isValid: errors.length === 0, errors: errors, warnings: warnings };
}

// =============================================================================
// 10. SCHEMA VALIDATION
// =============================================================================
//
// Schema validation answers "does this entity have the right shape?"
// It does NOT validate field semantics — that's each entity validator's job.
// ENTITY_SCHEMAS must remain synchronized with the canonical model; drift
// here is silent and dangerous, so treat this as a maintenance liability.

var ENTITY_SCHEMAS = {
    character: {
        required: ['id', 'name'],
        optional: [
            'surname', 'gender', 'attraction', 'birthYear', 'isDeceased', 'deathYear',
            'deathCause', 'birthplaceId', 'household', 'notes', 'motherId', 'fatherId',
            'adoptedParents', 'rankAssignments', 'relationships', 'friends', 'moves',
            'professions', 'apprentices', 'isMaster', 'masterId', 'masterProfessionId',
            'apprenticeshipDetails', 'friendshipDetails', 'appearance', 'epithet'
        ]
    },
    place: {
        required: ['id', 'displayName', 'typeId'],
        optional: [
            'parentId', 'variableKey', 'status', 'isCapital', 'notes',
            'governmentTypeId', 'governmentStyle', 'leaderAssignments'
        ]
    },
    rank: {
        required: ['id', 'name'],
        optional: [
            'priority', 'numbered', 'symbol', 'genderRestriction',
            'locationTypeId', 'locationId', 'deprecateOnDeath', 'spouseInheritance'
        ]
    },
    role: {
        required: ['id', 'name'],
        optional: ['specializations', 'genderRestriction', 'notes']
    },
    household: {
        required: ['id', 'name'],
        optional: ['locationId', 'departments', 'members']
    }
};

/**
 * Checks presence of required fields and absence of unknown fields.
 *
 * @param {Object} entity
 * @param {string} type
 * @returns {{ isValid: boolean, errors: string[] }}
 */
function validateEntitySchema(entity, type) {
    var errors = [];

    if (!entity || typeof entity !== 'object') {
        return { isValid: false, errors: ['Entity is null or not an object'] };
    }

    var schema = ENTITY_SCHEMAS[type];
    if (!schema) {
        return { isValid: false, errors: ['Unknown entity type: ' + type] };
    }

    for (var i = 0; i < schema.required.length; i++) {
        var field = schema.required[i];
        if (entity[field] === undefined || entity[field] === null) {
            errors.push('Missing required field: ' + field);
        }
    }

    var validFields = Object.create(null);
    for (var i = 0; i < schema.required.length; i++) validFields[schema.required[i]] = true;
    for (var i = 0; i < schema.optional.length; i++) validFields[schema.optional[i]] = true;

    var keys = Object.keys(entity);
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (!validFields[key]) {
            errors.push('Unknown field: ' + key);
        }
    }

    return { isValid: errors.length === 0, errors: errors };
}

// =============================================================================
// 11. EXPORTS
// =============================================================================

// Constants
window.VALIDATION_CONSTANTS = VALIDATION_CONSTANTS;

// Year validation
window.isValidYear = isValidYear;
window.validateYearsConsistency = validateYearsConsistency;

// ID syntax validation (does NOT check existence — see accessors.js)
window.isValidIdSyntax = isValidIdSyntax;
window.isValidCharacterId = isValidCharacterId;
window.isValidPlaceId = isValidPlaceId;

// Entity validation
window.validateCharacter = validateCharacter;
window.validateCharacterAge = validateCharacterAge;
window.validatePlace = validatePlace;
window.validatePlaceHierarchy = validatePlaceHierarchy;
window.validateRank = validateRank;
window.validateRole = validateRole;

// Relationship validation
window.validateRelationship = validateRelationship;
window.validateBidirectionalRelationship = validateBidirectionalRelationship;

// Import validation
window.validateImportData = validateImportData;

// Schema validation
window.validateEntitySchema = validateEntitySchema;
window.ENTITY_SCHEMAS = ENTITY_SCHEMAS;

// NOTE: Storage-boundary string utilities (truncateForStorage, sanitizeString,
// normalizeNameForStorage) were removed from this module. They transform data
// rather than validate it. They belong with storage-schema.js or an
// equivalent normalization layer. If callers still reference them,
// migrate them before dropping the globals.