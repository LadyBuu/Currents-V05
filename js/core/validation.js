/**
 * =============================================================================
 * STILL WATERS - VALIDATION (validation.js)
 * =============================================================================
 * 
 * LOCATION: js/core/validation.js
 * 
 * This is the SINGLE SOURCE OF TRUTH for ALL validation functions.
 * 
 * EXPORTED FUNCTIONS:
 *   - isValidYear() - Validates year is within range
 *   - validateYearsConsistency() - Validates birth/death year consistency
 *   - isValidCharacterId() - Validates character ID format
 *   - isValidPlaceId() - Validates place ID format
 *   - validateCharacter() - Validates character object
 *   - validateCharacterAge() - Validates character's age range
 *   - validatePlace() - Validates place object
 *   - validateRank() - Validates rank object
 *   - validateRole() - Validates role object
 *   - validateRelationship() - Validates relationship
 *   - validateBidirectionalRelationship() - Validates mutual relationships
 *   - validateImportData() - Validates imported JSON structure
 *   - validateEntitySchema() - Validates entity against schema
 *   - sanitizeString() - Sanitizes string for safe display
 *   - normalizeNameForStorage() - Normalizes name for storage
 * 
 * DEPENDENCIES: None (pure validation)
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
    DEFAULT_MIN_CHILD_AGE: 0,
    MAX_NAME_LENGTH: 100,
    MAX_SURNAME_LENGTH: 100,
    MAX_DISPLAY_NAME_LENGTH: 200,
    MAX_NOTE_LENGTH: 5000,
    MIN_CHARACTER_AGE: 0,
    MAX_SYMBOL_LENGTH: 3,
    ID_REGEX: /^[a-zA-Z0-9_-]+$/,
    NAME_REGEX: /^[\p{L}\s\-'\.]+$/u,
    VARIABLE_KEY_REGEX: /^[a-z0-9_]+$/
};

// =============================================================================
// 2. YEAR VALIDATION - PRIMARY DEFINITIONS
// =============================================================================

function isValidYear(year, minYear, maxYear) {
    minYear = minYear || VALIDATION_CONSTANTS.MIN_YEAR;
    maxYear = maxYear || VALIDATION_CONSTANTS.MAX_YEAR;
    if (year === undefined || year === null) return false;
    if (typeof year !== 'number') return false;
    if (isNaN(year)) return false;
    return year >= minYear && year <= maxYear;
}

function validateYearsConsistency(birthYear, deathYear, isDeceased) {
    isDeceased = isDeceased || false;
    if (!isValidYear(birthYear)) {
        return { isValid: true, message: 'No valid birth year' };
    }
    
    if (isDeceased && !isValidYear(deathYear)) {
        return { isValid: false, message: 'Deceased character must have a valid death year' };
    }
    
    if (!isDeceased && isValidYear(deathYear)) {
        return { isValid: false, message: 'Living character has a death year' };
    }
    
    if (isValidYear(deathYear) && deathYear < birthYear) {
        return { isValid: false, message: 'Death year (' + deathYear + ') cannot be before birth year (' + birthYear + ')' };
    }
    
    return { isValid: true, message: 'Valid' };
}

// =============================================================================
// 3. ID VALIDATION - PRIMARY DEFINITIONS
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
// 4. CHARACTER VALIDATION - PRIMARY DEFINITIONS
// =============================================================================

function validateCharacter(char, context) {
    context = context || {};
    var errors = [];
    
    if (!char.id) errors.push('Character missing ID');
    if (char.id && !isValidCharacterId(char.id)) {
        errors.push('Character ID "' + char.id + '" contains invalid characters');
    }
    
    if (!char.name || char.name.trim() === '') {
        errors.push('Character name is required');
    } else if (char.name.length > VALIDATION_CONSTANTS.MAX_NAME_LENGTH) {
        errors.push('Character name exceeds ' + VALIDATION_CONSTANTS.MAX_NAME_LENGTH + ' characters');
    } else if (!VALIDATION_CONSTANTS.NAME_REGEX.test(char.name.trim())) {
        errors.push('Character name "' + char.name + '" contains invalid characters');
    }
    
    if (char.surname && char.surname.length > VALIDATION_CONSTANTS.MAX_SURNAME_LENGTH) {
        errors.push('Surname exceeds ' + VALIDATION_CONSTANTS.MAX_SURNAME_LENGTH + ' characters');
    } else if (char.surname && !VALIDATION_CONSTANTS.NAME_REGEX.test(char.surname)) {
        errors.push('Surname "' + char.surname + '" contains invalid characters');
    }
    
    var validGenders = ['male', 'female', 'unknown', 'other'];
    if (char.gender && validGenders.indexOf(char.gender) === -1) {
        errors.push('Invalid gender: ' + char.gender);
    }
    
    var validAttractions = ['both', 'men', 'women', 'neither', 'unknown'];
    if (char.attraction && validAttractions.indexOf(char.attraction) === -1) {
        errors.push('Invalid attraction: ' + char.attraction);
    }
    
    if (char.epithet && char.epithet.length > 50) {
        errors.push('Epithet exceeds 50 characters');
    }
    
    if (char.birthYear !== undefined && char.birthYear !== null) {
        if (!isValidYear(char.birthYear)) {
            errors.push('Invalid birth year: ' + char.birthYear);
        }
    }
    
    var yearConsistency = validateYearsConsistency(char.birthYear, char.deathYear, char.isDeceased);
    if (!yearConsistency.isValid) {
        errors.push(yearConsistency.message);
    }
    
    var currentYear = context.currentYear || 1250;
    if (char.birthYear && char.birthYear > currentYear + 10) {
        errors.push('Birth year ' + char.birthYear + ' is too far in the future (current: ' + currentYear + ')');
    }
    
    if (char.motherId && typeof char.motherId !== 'string') {
        errors.push('Mother ID must be a string');
    }
    if (char.fatherId && typeof char.fatherId !== 'string') {
        errors.push('Father ID must be a string');
    }
    
    if (char.household && typeof char.household !== 'string') {
        errors.push('Household must be a string');
    }
    
    if (char.notes && char.notes.length > VALIDATION_CONSTANTS.MAX_NOTE_LENGTH) {
        errors.push('Notes exceed ' + VALIDATION_CONSTANTS.MAX_NOTE_LENGTH + ' characters');
    }
    
    if (context.existingCharacterIds && context.existingCharacterIds.has(char.id)) {
        errors.push('Duplicate character ID: ' + char.id);
    }
    
    return { isValid: errors.length === 0, errors: errors };
}

function validateCharacterAge(char, currentYear, maxAge) {
    maxAge = maxAge || VALIDATION_CONSTANTS.DEFAULT_MAX_AGE;
    if (!char.birthYear || !isValidYear(char.birthYear)) {
        return { isValid: true, age: null, message: 'No valid birth year set' };
    }
    
    var age;
    if (char.isDeceased && char.deathYear && isValidYear(char.deathYear)) {
        age = char.deathYear - char.birthYear;
    } else {
        age = currentYear - char.birthYear;
    }
    
    if (age < 0) {
        return { isValid: false, age: age, message: 'Negative age (' + age + ') - birth year after current year' };
    }
    
    if (age === 0 && !char.isDeceased) {
        return { isValid: true, age: 0, message: 'Infant (under 1 year)' };
    }
    
    if (age > maxAge) {
        return { isValid: false, age: age, message: 'Age ' + age + ' exceeds maximum ' + maxAge };
    }
    
    if (age > 100) {
        return { isValid: true, age: age, message: 'Age ' + age + ' is very old but possible' };
    }
    
    return { isValid: true, age: age, message: 'Valid age' };
}

// =============================================================================
// 5. PLACE VALIDATION - PRIMARY DEFINITIONS
// =============================================================================

function validatePlace(place, context) {
    context = context || {};
    var errors = [];
    
    if (!place.id) errors.push('Place missing ID');
    if (place.id && !isValidPlaceId(place.id)) {
        errors.push('Place ID "' + place.id + '" contains invalid characters');
    }
    
    if (!place.displayName || place.displayName.trim() === '') {
        errors.push('Place name is required');
    } else if (place.displayName.length > VALIDATION_CONSTANTS.MAX_DISPLAY_NAME_LENGTH) {
        errors.push('Place name exceeds ' + VALIDATION_CONSTANTS.MAX_DISPLAY_NAME_LENGTH + ' characters');
    }
    
    if (!place.typeId) {
        errors.push('Place "' + (place.displayName || 'unnamed') + '" missing type ID');
    }
    
    var validStatuses = ['active', 'disputed', 'abandoned', 'ruined'];
    if (place.status && validStatuses.indexOf(place.status) === -1) {
        errors.push('Invalid place status: ' + place.status);
    }
    
    if (place.variableKey) {
        if (!VALIDATION_CONSTANTS.VARIABLE_KEY_REGEX.test(place.variableKey)) {
            errors.push('Variable key "' + place.variableKey + '" should be lowercase with underscores only');
        }
    }
    
    if (context.existingPlaceIds && place.parentId) {
        if (!context.existingPlaceIds.has(place.parentId)) {
            errors.push('Parent place "' + place.parentId + '" does not exist');
        }
    }
    
    if (place.notes && place.notes.length > VALIDATION_CONSTANTS.MAX_NOTE_LENGTH) {
        errors.push('Place notes exceed ' + VALIDATION_CONSTANTS.MAX_NOTE_LENGTH + ' characters');
    }
    
    if (context.existingPlaceIds && context.existingPlaceIds.has(place.id)) {
        errors.push('Duplicate place ID: ' + place.id);
    }
    
    return { isValid: errors.length === 0, errors: errors };
}

// =============================================================================
// 6. RANK VALIDATION - PRIMARY DEFINITIONS
// =============================================================================

function validateRank(rank, context) {
    context = context || {};
    var errors = [];
    
    if (!rank.id) errors.push('Rank missing ID');
    if (!rank.name || rank.name.trim() === '') errors.push('Rank name is required');
    if (rank.name && rank.name.length > VALIDATION_CONSTANTS.MAX_NAME_LENGTH) {
        errors.push('Rank name exceeds ' + VALIDATION_CONSTANTS.MAX_NAME_LENGTH + ' characters');
    }
    
    if (rank.priority !== undefined) {
        if (typeof rank.priority !== 'number' || rank.priority < 1 || rank.priority > 5) {
            errors.push('Rank priority must be a number between 1-5, got: ' + rank.priority);
        }
    }
    
    var validGenderRestrictions = ['either', 'male', 'female'];
    if (rank.genderRestriction && validGenderRestrictions.indexOf(rank.genderRestriction) === -1) {
        errors.push('Invalid gender restriction: ' + rank.genderRestriction);
    }
    
    if (rank.symbol) {
        if (typeof rank.symbol !== 'string') {
            errors.push('Rank symbol must be a string');
        } else if (rank.symbol.length > VALIDATION_CONSTANTS.MAX_SYMBOL_LENGTH) {
            errors.push('Rank symbol should be 1-' + VALIDATION_CONSTANTS.MAX_SYMBOL_LENGTH + ' characters, got: ' + rank.symbol);
        }
    }
    
    if (rank.numbered !== undefined && typeof rank.numbered !== 'boolean') {
        errors.push('Rank.numbered must be a boolean');
    }
    
    if (context.existingRankIds && context.existingRankIds.has(rank.id)) {
        errors.push('Duplicate rank ID: ' + rank.id);
    }
    
    return { isValid: errors.length === 0, errors: errors };
}

// =============================================================================
// 7. ROLE VALIDATION - PRIMARY DEFINITIONS
// =============================================================================

function validateRole(role, context) {
    context = context || {};
    var errors = [];
    
    if (!role.id) errors.push('Role missing ID');
    if (!role.name || role.name.trim() === '') errors.push('Role name is required');
    if (role.name && role.name.length > VALIDATION_CONSTANTS.MAX_NAME_LENGTH) {
        errors.push('Role name exceeds ' + VALIDATION_CONSTANTS.MAX_NAME_LENGTH + ' characters');
    }
    
    var validGenderRestrictions = ['both', 'male', 'female'];
    if (role.genderRestriction && validGenderRestrictions.indexOf(role.genderRestriction) === -1) {
        errors.push('Invalid gender restriction: ' + role.genderRestriction);
    }
    
    if (role.specializations) {
        if (!Array.isArray(role.specializations)) {
            errors.push('Specializations must be an array');
        } else {
            for (var i = 0; i < role.specializations.length; i++) {
                if (typeof role.specializations[i] !== 'string') {
                    errors.push('Specialization at index ' + i + ' must be a string');
                } else if (role.specializations[i].length > 50) {
                    errors.push('Specialization "' + role.specializations[i] + '" exceeds 50 characters');
                }
            }
        }
    }
    
    if (role.notes && role.notes.length > VALIDATION_CONSTANTS.MAX_NOTE_LENGTH) {
        errors.push('Role notes exceed ' + VALIDATION_CONSTANTS.MAX_NOTE_LENGTH + ' characters');
    }
    
    if (context.existingRoleIds && context.existingRoleIds.has(role.id)) {
        errors.push('Duplicate role ID: ' + role.id);
    }
    
    return { isValid: errors.length === 0, errors: errors };
}

// =============================================================================
// 8. RELATIONSHIP VALIDATION - PRIMARY DEFINITIONS
// =============================================================================

function validateRelationship(relationship, charId, partnerId, context) {
    context = context || {};
    var errors = [];
    var warnings = [];
    
    if (charId === partnerId) {
        errors.push('Character cannot have a relationship with themselves');
    }
    
    if (relationship.partnerId !== partnerId) {
        errors.push('Relationship partner mismatch: expected ' + partnerId + ', got ' + relationship.partnerId);
    }
    
    var validStatuses = ['ongoing', 'ended', 'widowed'];
    if (validStatuses.indexOf(relationship.status) === -1) {
        errors.push('Invalid relationship status: ' + relationship.status);
    }
    
    var details = relationship.details || {};
    
    if (details.startYear && !isValidYear(details.startYear)) {
        errors.push('Invalid start year: ' + details.startYear);
    }
    
    if (details.endYear && !isValidYear(details.endYear)) {
        errors.push('Invalid end year: ' + details.endYear);
    }
    
    if (details.startYear && details.endYear && details.endYear < details.startYear) {
        errors.push('End year (' + details.endYear + ') before start year (' + details.startYear + ')');
    }
    
    var validTypes = ['casual', 'serious', 'affair', 'betrothed', 'marriage'];
    if (details.type && validTypes.indexOf(details.type) === -1) {
        errors.push('Invalid relationship type: ' + details.type);
    }
    
    if (context.existingCharacterIds && !context.existingCharacterIds.has(partnerId)) {
        errors.push('Partner character "' + partnerId + '" does not exist');
    }
    
    if (context.partnerHasRelationship === false) {
        warnings.push('Relationship may not be bidirectional - partner lacks matching relationship record');
    }
    
    return { isValid: errors.length === 0, errors: errors, warnings: warnings };
}

function validateBidirectionalRelationship(rel1, rel2) {
    var issues = [];
    
    if (!rel1 || !rel2) {
        issues.push('Missing bidirectional relationship');
        return { isConsistent: false, issues: issues };
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
// 9. IMPORT VALIDATION - PRIMARY DEFINITIONS
// =============================================================================

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
    
    var characterIds = new Set();
    var placeIds = new Set();
    var rankIds = new Set();
    var roleIds = new Set();
    
    if (!dataToValidate.characters) {
        warnings.push('No characters found in import data');
    } else if (!Array.isArray(dataToValidate.characters)) {
        errors.push('Characters must be an array');
    } else {
        for (var i = 0; i < dataToValidate.characters.length; i++) {
            var char = dataToValidate.characters[i];
            
            if (!char.name) {
                warnings.push('Character at index ' + i + ' has no name');
            }
            
            if (char.id) {
                if (characterIds.has(char.id)) {
                    errors.push('Duplicate character ID: ' + char.id);
                } else {
                    characterIds.add(char.id);
                }
            }
            
            if (char.birthYear && typeof char.birthYear !== 'number') {
                errors.push('Character ' + (char.name || i) + ' has invalid birth year');
            }
            
            var validation = validateCharacter(char, { currentYear: dataToValidate.currentYear || 1250 });
            if (!validation.isValid) {
                for (var j = 0; j < validation.errors.length; j++) {
                    errors.push('Character ' + (char.name || i) + ': ' + validation.errors[j]);
                }
            }
        }
    }
    
    if (dataToValidate.places) {
        if (!Array.isArray(dataToValidate.places)) {
            errors.push('Places must be an array');
        } else {
            for (var i = 0; i < dataToValidate.places.length; i++) {
                var place = dataToValidate.places[i];
                if (place.id) {
                    if (placeIds.has(place.id)) {
                        errors.push('Duplicate place ID: ' + place.id);
                    } else {
                        placeIds.add(place.id);
                    }
                }
            }
        }
    }
    
    if (dataToValidate.ranks) {
        if (!Array.isArray(dataToValidate.ranks)) {
            errors.push('Ranks must be an array');
        } else {
            for (var i = 0; i < dataToValidate.ranks.length; i++) {
                var rank = dataToValidate.ranks[i];
                if (rank.id) {
                    if (rankIds.has(rank.id)) {
                        errors.push('Duplicate rank ID: ' + rank.id);
                    } else {
                        rankIds.add(rank.id);
                    }
                }
            }
        }
    }
    
    if (dataToValidate.roles) {
        if (!Array.isArray(dataToValidate.roles)) {
            errors.push('Roles must be an array');
        } else {
            for (var i = 0; i < dataToValidate.roles.length; i++) {
                var role = dataToValidate.roles[i];
                if (role.id) {
                    if (roleIds.has(role.id)) {
                        errors.push('Duplicate role ID: ' + role.id);
                    } else {
                        roleIds.add(role.id);
                    }
                }
            }
        }
    }
    
    if (dataToValidate.currentYear !== undefined && !isValidYear(dataToValidate.currentYear)) {
        warnings.push('Invalid current year: ' + dataToValidate.currentYear + ', using default');
    }
    
    if (dataToValidate.places && placeIds.size > 0) {
        for (var i = 0; i < dataToValidate.places.length; i++) {
            var place = dataToValidate.places[i];
            if (place.parentId && !placeIds.has(place.parentId)) {
                warnings.push('Place "' + place.displayName + '" references missing parent "' + place.parentId + '"');
            }
        }
    }
    
    if (dataToValidate.characters && characterIds.size > 0) {
        for (var i = 0; i < dataToValidate.characters.length; i++) {
            var char = dataToValidate.characters[i];
            if (char.motherId && !characterIds.has(char.motherId)) {
                warnings.push('Character "' + char.name + '" references missing mother "' + char.motherId + '"');
            }
            if (char.fatherId && !characterIds.has(char.fatherId)) {
                warnings.push('Character "' + char.name + '" references missing father "' + char.fatherId + '"');
            }
        }
    }
    
    return { isValid: errors.length === 0, errors: errors, warnings: warnings };
}

// =============================================================================
// 10. SCHEMA VALIDATION - PRIMARY DEFINITIONS
// =============================================================================

var ENTITY_SCHEMAS = {
    character: {
        required: ['id', 'name'],
        optional: ['surname', 'gender', 'attraction', 'birthYear', 'isDeceased', 'deathYear', 'deathCause', 'birthplaceId', 'household', 'notes', 'motherId', 'fatherId', 'adoptedParents', 'rankAssignments', 'relationships', 'friends', 'moves', 'professions', 'apprentices', 'isMaster', 'masterId', 'masterProfessionId', 'apprenticeshipDetails', 'friendshipDetails', 'appearance', 'epithet']
    },
    place: {
        required: ['id', 'displayName', 'typeId'],
        optional: ['parentId', 'variableKey', 'status', 'isCapital', 'notes', 'governmentTypeId', 'governmentStyle', 'leaderAssignments']
    },
    rank: {
        required: ['id', 'name'],
        optional: ['priority', 'numbered', 'symbol', 'genderRestriction', 'locationTypeId', 'locationId', 'deprecateOnDeath', 'spouseInheritance']
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

function validateEntitySchema(entity, type) {
    var errors = [];
    var schema = ENTITY_SCHEMAS[type];
    
    if (!schema) {
        errors.push('Unknown entity type: ' + type);
        return { isValid: false, errors: errors };
    }
    
    for (var i = 0; i < schema.required.length; i++) {
        var required = schema.required[i];
        if (entity[required] === undefined || entity[required] === null) {
            errors.push('Missing required field: ' + required);
        }
    }
    
    var validFields = schema.required.concat(schema.optional);
    for (var key in entity) {
        if (entity.hasOwnProperty(key)) {
            if (validFields.indexOf(key) === -1) {
                errors.push('Unknown field: ' + key);
            }
        }
    }
    
    return { isValid: errors.length === 0, errors: errors };
}

// =============================================================================
// 11. UTILITY FUNCTIONS - PRIMARY DEFINITIONS
// =============================================================================

function sanitizeString(str, maxLength) {
    maxLength = maxLength || VALIDATION_CONSTANTS.MAX_NAME_LENGTH;
    if (!str || typeof str !== 'string') return '';
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
}

function normalizeNameForStorage(name) {
    if (!name || typeof name !== 'string') return '';
    return name.trim().replace(/\s+/g, ' ');
}

// =============================================================================
// 12. EXPORTS - SINGLE SOURCE OF TRUTH
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
window.validateRank = validateRank;
window.validateRole = validateRole;

// Relationship validation
window.validateRelationship = validateRelationship;
window.validateBidirectionalRelationship = validateBidirectionalRelationship;

// Import validation
window.validateImportData = validateImportData;

// Schema validation
window.validateEntitySchema = validateEntitySchema;

// Utility functions
window.sanitizeString = sanitizeString;
window.normalizeNameForStorage = normalizeNameForStorage;

// Schema definitions (read-only)
window.ENTITY_SCHEMAS = ENTITY_SCHEMAS;