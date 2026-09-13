/**
 * =============================================================================
 * STILL WATERS - VALIDATION (validation.js)
 * =============================================================================
 * 
 * LOCATION: js/core/validation.js
 * 
 * SINGLE SOURCE OF TRUTH for all validation functions.
 * 
 * SCOPE:
 *   - Field shape validation (year, name, ID, etc.)
 *   - Entity validation (character, place, rank, role, relationship)
 *   - Import validation (structural + entity-level)
 *   - Schema field checking (presence/unknown fields)
 *   - Utility validators (sanitize/truncate, normalize)
 * 
 * SEMANTIC RULES:
 *   - Years are integers. Fractional years are invalid.
 *   - Year 0 is valid. Negative years are valid within range.
 *   - Validators are TOTAL functions: null/non-object input returns a
 *     validation failure, never throws.
 *   - Missing field vs invalid field are distinguished in messages.
 *   - Validators do not mutate. They return { isValid, errors, warnings }.
 * 
 * DEPENDENCIES:
 *   - time.js (TIME_CONSTANTS for year bounds) — optional
 * 
 * ICON POLICY: No emojis. No icons.
 * 
 * =============================================================================
 */

// =============================================================================
// 1. CONSTANTS
// =============================================================================

var VALIDATION_CONSTANTS = {
    MIN_YEAR: -10000,
    MAX_YEAR: 9999,
    DEFAULT_MAX_AGE: 120,
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

/**
 * Domain enums. Consumed by validators so they don't duplicate the values.
 * Populated lazily from constants.js when available.
 * @private
 */
function _getEnum(name, fallback) {
    if (typeof window[name] !== 'undefined' && Array.isArray(window[name])) {
        return window[name];
    }
    return fallback;
}

function _getGenders() {
    return _getEnum('GENDER_VALUES', ['male', 'female', 'unknown', 'other']);
}

function _getAttractions() {
    return _getEnum('ATTRACTION_VALUES', ['both', 'men', 'women', 'neither', 'unknown']);
}

function _getPlaceStatuses() {
    return ['active', 'disputed', 'abandoned', 'ruined'];
}

function _getRankGenderRestrictions() {
    return ['either', 'male', 'female'];
}

function _getRoleGenderRestrictions() {
    return ['both', 'male', 'female'];
}

function _getRelationshipStatuses() {
    if (typeof window.RELATIONSHIP_STATUS !== 'undefined') {
        var rs = window.RELATIONSHIP_STATUS;
        var out = [];
        for (var k in rs) {
            if (rs.hasOwnProperty(k) && typeof rs[k] === 'string') out.push(rs[k]);
        }
        if (out.length) return out;
    }
    return ['ongoing', 'ended', 'widowed', 'single', 'partnered'];
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
 * 
 * @param {number} year
 * @param {number} [minYear]
 * @param {number} [maxYear]
 * @returns {boolean}
 */
function isValidYear(year, minYear, maxYear) {
    if (minYear === undefined || minYear === null) minYear = VALIDATION_CONSTANTS.MIN_YEAR;
    if (maxYear === undefined || maxYear === null) maxYear = VALIDATION_CONSTANTS.MAX_YEAR;
    if (year === undefined || year === null) return false;
    if (typeof year !== 'number') return false;
    if (!Number.isFinite(year)) return false;
    if (!Number.isInteger(year)) return false;
    return year >= minYear && year <= maxYear;
}

/**
 * Checks consistency between birth year, death year, and deceased flag.
 * Distinguishes missing from invalid.
 * 
 * @param {number|null} birthYear
 * @param {number|null} deathYear
 * @param {boolean} isDeceased
 * @returns {{ isValid: boolean, message: string }}
 */
function validateYearsConsistency(birthYear, deathYear, isDeceased) {
    isDeceased = isDeceased === true;

    var hasBirth = birthYear !== null && birthYear !== undefined;
    var hasDeath = deathYear !== null && deathYear !== undefined;

    if (!hasBirth) {
        return { isValid: true, message: 'No birth year specified' };
    }
    if (!isValidYear(birthYear)) {
        return { isValid: false, message: 'Invalid birth year: ' + birthYear };
    }

    if (isDeceased) {
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
// 3. ID VALIDATION (syntactic)
// =============================================================================

function isValidCharacterId(id) {
    if (!id || typeof id !== 'string') return false;
    return VALIDATION_CONSTANTS.ID_REGEX.test(id);
}

function isValidPlaceId(id) {
    if (!id || typeof id !== 'string') return false;
    return VALIDATION_CONSTANTS.ID_REGEX.test(id);
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

    if (!char.id) {
        errors.push('Character missing ID');
    } else if (!isValidCharacterId(char.id)) {
        errors.push('Character ID "' + char.id + '" contains invalid characters');
    }

    if (!char.name || typeof char.name !== 'string' || char.name.trim() === '') {
        errors.push('Character name is required');
    } else if (char.name.length > VALIDATION_CONSTANTS.MAX_NAME_LENGTH) {
        errors.push('Character name exceeds ' + VALIDATION_CONSTANTS.MAX_NAME_LENGTH + ' characters');
    } else if (!VALIDATION_CONSTANTS.NAME_REGEX.test(char.name.trim())) {
        errors.push('Character name "' + char.name + '" contains invalid characters');
    }

    if (char.surname !== undefined && char.surname !== null) {
        if (typeof char.surname !== 'string') {
            errors.push('Surname must be a string');
        } else if (char.surname.length > VALIDATION_CONSTANTS.MAX_SURNAME_LENGTH) {
            errors.push('Surname exceeds ' + VALIDATION_CONSTANTS.MAX_SURNAME_LENGTH + ' characters');
        } else if (char.surname && !VALIDATION_CONSTANTS.NAME_REGEX.test(char.surname)) {
            errors.push('Surname "' + char.surname + '" contains invalid characters');
        }
    }

    if (char.gender !== undefined && char.gender !== null) {
        if (_getGenders().indexOf(char.gender) === -1) {
            errors.push('Invalid gender: ' + char.gender);
        }
    }

    if (char.attraction !== undefined && char.attraction !== null) {
        if (_getAttractions().indexOf(char.attraction) === -1) {
            errors.push('Invalid attraction: ' + char.attraction);
        }
    }

    if (char.epithet !== undefined && char.epithet !== null) {
        if (typeof char.epithet !== 'string') {
            errors.push('Epithet must be a string');
        } else if (char.epithet.length > VALIDATION_CONSTANTS.MAX_EPITHET_LENGTH) {
            errors.push('Epithet exceeds ' + VALIDATION_CONSTANTS.MAX_EPITHET_LENGTH + ' characters');
        }
    }

    if (char.birthYear !== undefined && char.birthYear !== null) {
        if (!isValidYear(char.birthYear)) {
            errors.push('Invalid birth year: ' + char.birthYear);
        }
    }

    var yearCheck = validateYearsConsistency(char.birthYear, char.deathYear, char.isDeceased);
    if (!yearCheck.isValid) {
        errors.push(yearCheck.message);
    }

    if (char.motherId !== undefined && char.motherId !== null && typeof char.motherId !== 'string') {
        errors.push('Mother ID must be a string');
    }
    if (char.fatherId !== undefined && char.fatherId !== null && typeof char.fatherId !== 'string') {
        errors.push('Father ID must be a string');
    }

    if (char.household !== undefined && char.household !== null && typeof char.household !== 'string') {
        errors.push('Household must be a string');
    }

    if (char.notes !== undefined && char.notes !== null) {
        if (typeof char.notes !== 'string') {
            errors.push('Notes must be a string');
        } else if (char.notes.length > VALIDATION_CONSTANTS.MAX_NOTE_LENGTH) {
            errors.push('Notes exceed ' + VALIDATION_CONSTANTS.MAX_NOTE_LENGTH + ' characters');
        }
    }

    if (context.existingCharacterIds
        && typeof context.existingCharacterIds.has === 'function'
        && context.existingCharacterIds.has(char.id)) {
        errors.push('Duplicate character ID: ' + char.id);
    }

    // Reference existence checks (when context supplies ID sets)
    if (context.existingCharacterIds && typeof context.existingCharacterIds.has === 'function') {
        if (char.motherId && !context.existingCharacterIds.has(char.motherId)) {
            errors.push('Mother "' + char.motherId + '" does not exist');
        }
        if (char.fatherId && !context.existingCharacterIds.has(char.fatherId)) {
            errors.push('Father "' + char.fatherId + '" does not exist');
        }
    }

    return { isValid: errors.length === 0, errors: errors };
}

/**
 * Validates a character's age.
 * @param {Object} char
 * @param {number} currentYear
 * @param {number} [maxAge]
 * @returns {{ isValid: boolean, age: number|null, message: string }}
 */
function validateCharacterAge(char, currentYear, maxAge) {
    maxAge = (maxAge === undefined || maxAge === null)
        ? VALIDATION_CONSTANTS.DEFAULT_MAX_AGE
        : maxAge;

    if (!char || typeof char !== 'object') {
        return { isValid: false, age: null, message: 'Invalid character' };
    }
    if (!isValidYear(char.birthYear)) {
        return { isValid: true, age: null, message: 'No valid birth year set' };
    }

    var age;
    if (char.isDeceased && isValidYear(char.deathYear)) {
        age = char.deathYear - char.birthYear;
    } else if (isValidYear(currentYear)) {
        age = currentYear - char.birthYear;
    } else {
        return { isValid: true, age: null, message: 'Cannot determine age without current year' };
    }

    if (age < 0) {
        return {
            isValid: false,
            age: age,
            message: 'Negative age (' + age + ') - birth year after reference year'
        };
    }

    if (age > maxAge) {
        return { isValid: false, age: age, message: 'Age ' + age + ' exceeds maximum ' + maxAge };
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

    if (!place.id) {
        errors.push('Place missing ID');
    } else if (!isValidPlaceId(place.id)) {
        errors.push('Place ID "' + place.id + '" contains invalid characters');
    }

    if (!place.displayName || typeof place.displayName !== 'string' || place.displayName.trim() === '') {
        errors.push('Place name is required');
    } else if (place.displayName.length > VALIDATION_CONSTANTS.MAX_DISPLAY_NAME_LENGTH) {
        errors.push('Place name exceeds ' + VALIDATION_CONSTANTS.MAX_DISPLAY_NAME_LENGTH + ' characters');
    }

    if (!place.typeId) {
        errors.push('Place "' + (place.displayName || 'unnamed') + '" missing type ID');
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

    if (place.parentId !== undefined && place.parentId !== null) {
        if (typeof place.parentId !== 'string') {
            errors.push('Parent ID must be a string');
        } else if (!isValidPlaceId(place.parentId)) {
            errors.push('Parent ID "' + place.parentId + '" contains invalid characters');
        } else if (context.existingPlaceIds
            && typeof context.existingPlaceIds.has === 'function'
            && !context.existingPlaceIds.has(place.parentId)) {
            errors.push('Parent place "' + place.parentId + '" does not exist');
        }
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
        && context.existingPlaceIds.has(place.id)) {
        errors.push('Duplicate place ID: ' + place.id);
    }

    return { isValid: errors.length === 0, errors: errors };
}

/**
 * Detects parent-cycle if `place` has a parentId and `context.placesById`
 * supplies a way to look up places.
 * 
 * @param {Object} place
 * @param {Map|Object} placesById - Lookup keyed by place id
 * @returns {{ isValid: boolean, message: string }}
 */
function validatePlaceHierarchy(place, placesById) {
    if (!place || typeof place !== 'object') {
        return { isValid: false, message: 'Invalid place' };
    }
    if (!place.parentId) {
        return { isValid: true, message: 'No parent; root place' };
    }
    if (!placesById) {
        return { isValid: true, message: 'Cannot check cycle without lookup' };
    }

    var get = function(id) {
        if (typeof placesById.get === 'function') return placesById.get(id);
        return placesById[id];
    };

    var seen = {};
    seen[place.id] = true;
    var current = get(place.parentId);
    var depth = 0;

    while (current && depth < 50) {
        if (seen[current.id]) {
            return { isValid: false, message: 'Circular parent reference detected' };
        }
        seen[current.id] = true;
        if (!current.parentId) break;
        current = get(current.parentId);
        depth++;
    }

    if (depth >= 50) {
        return { isValid: false, message: 'Hierarchy depth exceeds safety limit' };
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

    if (!rank.id) errors.push('Rank missing ID');
    if (!rank.name || typeof rank.name !== 'string' || rank.name.trim() === '') {
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

    if (rank.numbered !== undefined && rank.numbered !== null && typeof rank.numbered !== 'boolean') {
        errors.push('Rank.numbered must be a boolean');
    }

    if (context.existingRankIds
        && typeof context.existingRankIds.has === 'function'
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

    if (!role.id) errors.push('Role missing ID');
    if (!role.name || typeof role.name !== 'string' || role.name.trim() === '') {
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
        && context.existingRoleIds.has(role.id)) {
        errors.push('Duplicate role ID: ' + role.id);
    }

    return { isValid: errors.length === 0, errors: errors };
}

// =============================================================================
// 8. RELATIONSHIP VALIDATION
// =============================================================================

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

    if (relationship.partnerId !== undefined && relationship.partnerId !== partnerId) {
        errors.push('Relationship partner mismatch: expected ' + partnerId + ', got ' + relationship.partnerId);
    }

    if (relationship.status !== undefined && relationship.status !== null) {
        if (_getRelationshipStatuses().indexOf(relationship.status) === -1) {
            errors.push('Invalid relationship status: ' + relationship.status);
        }
    }

    var details = relationship.details || {};

    if (details.startYear !== undefined && details.startYear !== null && !isValidYear(details.startYear)) {
        errors.push('Invalid start year: ' + details.startYear);
    }
    if (details.endYear !== undefined && details.endYear !== null && !isValidYear(details.endYear)) {
        errors.push('Invalid end year: ' + details.endYear);
    }
    if (details.startYear && details.endYear && details.endYear < details.startYear) {
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

function validateBidirectionalRelationship(rel1, rel2) {
    var issues = [];

    if (!rel1 || !rel2) {
        issues.push('Missing bidirectional relationship');
        return { isConsistent: false, issues: issues };
    }

    if (rel1.partnerId && rel2.partnerId && rel1.partnerId !== rel2.partnerId) {
        issues.push('Partner ID mismatch: ' + rel1.partnerId + ' vs ' + rel2.partnerId);
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
 * Validates an imported JSON structure. This is a structural + entity-level
 * check. Malformed structures return errors; individual malformed entities
 * return per-entity errors.
 * 
 * @param {Object} imported
 * @returns {{ isValid: boolean, errors: string[], warnings: string[] }}
 */
function validateImportData(imported) {
    var errors = [];
    var warnings = [];

    if (!imported) {
        errors.push('No data provided');
        return { isValid: false, errors: errors, warnings: warnings };
    }

    var dataToValidate;
    if (imported.type === "master" && imported.data) {
        dataToValidate = imported.data;
    } else if (imported.data && imported.data.characters) {
        dataToValidate = imported.data;
    } else if (imported.characters) {
        dataToValidate = imported;
    } else {
        errors.push('Unknown file format - expected Still Waters export');
        return { isValid: false, errors: errors, warnings: warnings };
    }

    // Build id sets
    var characterIds = new Set();
    var placeIds = new Set();
    var rankIds = new Set();
    var roleIds = new Set();

    if (dataToValidate.characters !== undefined) {
        if (!Array.isArray(dataToValidate.characters)) {
            errors.push('Characters must be an array');
        } else {
            for (var i = 0; i < dataToValidate.characters.length; i++) {
                var c = dataToValidate.characters[i];
                if (c && c.id) {
                    if (characterIds.has(c.id)) {
                        errors.push('Duplicate character ID: ' + c.id);
                    } else {
                        characterIds.add(c.id);
                    }
                }
            }
        }
    } else {
        warnings.push('No characters found in import data');
    }

    if (dataToValidate.places !== undefined) {
        if (!Array.isArray(dataToValidate.places)) {
            errors.push('Places must be an array');
        } else {
            for (var i = 0; i < dataToValidate.places.length; i++) {
                var p = dataToValidate.places[i];
                if (p && p.id) {
                    if (placeIds.has(p.id)) {
                        errors.push('Duplicate place ID: ' + p.id);
                    } else {
                        placeIds.add(p.id);
                    }
                }
            }
        }
    }

    if (dataToValidate.ranks !== undefined) {
        if (!Array.isArray(dataToValidate.ranks)) {
            errors.push('Ranks must be an array');
        } else {
            for (var i = 0; i < dataToValidate.ranks.length; i++) {
                var r = dataToValidate.ranks[i];
                if (r && r.id) {
                    if (rankIds.has(r.id)) {
                        errors.push('Duplicate rank ID: ' + r.id);
                    } else {
                        rankIds.add(r.id);
                    }
                }
            }
        }
    }

    if (dataToValidate.roles !== undefined) {
        if (!Array.isArray(dataToValidate.roles)) {
            errors.push('Roles must be an array');
        } else {
            for (var i = 0; i < dataToValidate.roles.length; i++) {
                var rl = dataToValidate.roles[i];
                if (rl && rl.id) {
                    if (roleIds.has(rl.id)) {
                        errors.push('Duplicate role ID: ' + rl.id);
                    } else {
                        roleIds.add(rl.id);
                    }
                }
            }
        }
    }

    // Validate individual characters with reference sets
    if (Array.isArray(dataToValidate.characters)) {
        var charContext = {
            existingCharacterIds: characterIds,
            currentYear: dataToValidate.currentYear
        };
        for (var i = 0; i < dataToValidate.characters.length; i++) {
            var char = dataToValidate.characters[i];
            var v = validateCharacter(char, charContext);
            for (var k = 0; k < v.errors.length; k++) {
                errors.push('Character ' + (char && char.name ? '"' + char.name + '"' : '#' + i) + ': ' + v.errors[k]);
            }
        }
    }

    // Validate individual places with place-id set for parent existence
    if (Array.isArray(dataToValidate.places)) {
        var placeContext = { existingPlaceIds: placeIds };
        for (var i = 0; i < dataToValidate.places.length; i++) {
            var place = dataToValidate.places[i];
            var pv = validatePlace(place, placeContext);
            for (var k = 0; k < pv.errors.length; k++) {
                errors.push('Place ' + (place && place.displayName ? '"' + place.displayName + '"' : '#' + i) + ': ' + pv.errors[k]);
            }
            // Cycle detection
            if (place && place.parentId) {
                var cyc = validatePlaceHierarchy(place, placeIds.size > 0 ? _buildIdLookup(dataToValidate.places) : null);
                if (!cyc.isValid) {
                    errors.push('Place ' + (place.displayName || place.id) + ': ' + cyc.message);
                }
            }
        }
    }

    if (Array.isArray(dataToValidate.ranks)) {
        for (var i = 0; i < dataToValidate.ranks.length; i++) {
            var rv = validateRank(dataToValidate.ranks[i], {});
            for (var k = 0; k < rv.errors.length; k++) {
                errors.push('Rank #' + i + ': ' + rv.errors[k]);
            }
        }
    }

    if (Array.isArray(dataToValidate.roles)) {
        for (var i = 0; i < dataToValidate.roles.length; i++) {
            var rlv = validateRole(dataToValidate.roles[i], {});
            for (var k = 0; k < rlv.errors.length; k++) {
                errors.push('Role #' + i + ': ' + rlv.errors[k]);
            }
        }
    }

    // Year check
    if (dataToValidate.currentYear !== undefined
        && dataToValidate.currentYear !== null
        && !isValidYear(dataToValidate.currentYear)) {
        warnings.push('Invalid current year: ' + dataToValidate.currentYear + ', will use default');
    }

    return { isValid: errors.length === 0, errors: errors, warnings: warnings };
}

/**
 * @private
 * Builds an id → place map for cycle detection.
 */
function _buildIdLookup(arr) {
    var m = new Map();
    if (!Array.isArray(arr)) return m;
    for (var i = 0; i < arr.length; i++) {
        if (arr[i] && arr[i].id) m.set(arr[i].id, arr[i]);
    }
    return m;
}

// =============================================================================
// 10. SCHEMA VALIDATION
// =============================================================================

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
 * Does NOT validate field types — that's each entity validator's job.
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

    var validFields = {};
    for (var i = 0; i < schema.required.length; i++) validFields[schema.required[i]] = true;
    for (var i = 0; i < schema.optional.length; i++) validFields[schema.optional[i]] = true;

    for (var key in entity) {
        if (entity.hasOwnProperty(key) && !validFields[key]) {
            errors.push('Unknown field: ' + key);
        }
    }

    return { isValid: errors.length === 0, errors: errors };
}

// =============================================================================
// 11. UTILITY
// =============================================================================

/**
 * Truncates a string for storage, preserving length budget.
 * Renamed from sanitizeString to reflect what it actually does.
 * 
 * @param {string} str
 * @param {number} [maxLength]
 * @returns {string}
 */
function truncateString(str, maxLength) {
    maxLength = (maxLength === undefined || maxLength === null)
        ? VALIDATION_CONSTANTS.MAX_NAME_LENGTH
        : maxLength;
    if (!str || typeof str !== 'string') return '';
    if (str.length <= maxLength) return str;
    if (maxLength <= 3) return str.slice(0, maxLength);
    return str.slice(0, maxLength - 3) + '...';
}

/**
 * @deprecated Use truncateString instead.
 * Kept as alias for backward compatibility.
 */
function sanitizeString(str, maxLength) {
    return truncateString(str, maxLength);
}

function normalizeNameForStorage(name) {
    if (!name || typeof name !== 'string') return '';
    return name.trim().replace(/\s+/g, ' ');
}

// =============================================================================
// 12. EXPORTS
// =============================================================================

// Constants
window.VALIDATION_CONSTANTS = VALIDATION_CONSTANTS;

// Year validation
window.isValidYear = isValidYear;
window.validateYearsConsistency = validateYearsConsistency;

// ID validation
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

// Utility
window.truncateString = truncateString;
window.sanitizeString = sanitizeString; // deprecated
window.normalizeNameForStorage = normalizeNameForStorage;