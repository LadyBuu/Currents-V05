/**
 * =============================================================================
 * STILL WATERS - VALIDATION (validation.js)
 * =============================================================================
 * 
 * LOCATION: js/core/validation.js
 * 
 * This file contains ALL validation functions including:
 * - Year validation
 * - Entity validation (characters, places, ranks, roles)
 * - Schema validation
 * - Import data validation
 * 
 * PURPOSE: Ensure data integrity through validation rules
 * 
 * DEPENDENCIES: None (pure validation)
 * =============================================================================
 * EXPORTED FUNCTIONS (on window):
 * =============================================================================
 * 
 * Constants:
 *   - VALIDATION_CONSTANTS - Object with MIN_YEAR (-10000), MAX_YEAR (9999), DEFAULT_MAX_AGE (120), MAX_NAME_LENGTH (100), MAX_SURNAME_LENGTH (100), MAX_DISPLAY_NAME_LENGTH (200), MAX_NOTE_LENGTH (5000), MIN_CHARACTER_AGE (0), MAX_SYMBOL_LENGTH (3), ID_REGEX, NAME_REGEX (Unicode-aware), VARIABLE_KEY_REGEX
 * 
 * Year Validation:
 *   - isValidYear(year, minYear, maxYear) - Validates year is within range (-10000 to 9999)
 *   - validateYearsConsistency(birthYear, deathYear, isDeceased) - Returns { isValid, message }
 * 
 * ID Validation:
 *   - isValidCharacterId(id) - Validates character ID format ([a-zA-Z0-9_-]+)
 *   - isValidPlaceId(id) - Validates place ID format ([a-zA-Z0-9_-]+)
 * 
 * Character Validation:
 *   - validateCharacter(char, context) - Validates character object, returns { isValid, errors: string[] }
 *   - validateCharacterAge(char, currentYear, maxAge) - Returns { isValid, age, message }
 * 
 * Place Validation:
 *   - validatePlace(place, context) - Validates place object, returns { isValid, errors: string[] }
 * 
 * Rank Validation:
 *   - validateRank(rank, context) - Validates rank object, returns { isValid, errors: string[] }
 * 
 * Role/Profession Validation:
 *   - validateRole(role, context) - Validates role object, returns { isValid, errors: string[] }
 * 
 * Relationship Validation:
 *   - validateRelationship(relationship, charId, partnerId, context) - Returns { isValid, errors: string[], warnings: string[] }
 *   - validateBidirectionalRelationship(rel1, rel2) - Validates mutual relationships, returns { isConsistent, issues: string[] }
 * 
 * Import Validation:
 *   - validateImportData(imported) - Validates imported JSON structure, returns { isValid, errors: string[], warnings: string[] }
 * 
 * Schema Validation:
 *   - validateEntitySchema(entity, type) - Validates entity against schema (types: 'character', 'place', 'rank', 'role', 'household')
 *   - ENTITY_SCHEMAS - Read-only object containing schema definitions for each entity type
 * 
 * Utility Functions:
 *   - sanitizeString(str, maxLength) - Sanitizes string for safe display (truncates if needed)
 *   - normalizeNameForStorage(name) - Normalizes name (trims, collapses multiple spaces)
 * 
 * =============================================================================
 * VALIDATION CONSTANTS REFERENCE:
 * =============================================================================
 * 
 * MIN_YEAR: -10000 (BC support)
 * MAX_YEAR: 9999
 * DEFAULT_MAX_AGE: 120
 * MAX_NAME_LENGTH: 100
 * MAX_SURNAME_LENGTH: 100
 * MAX_DISPLAY_NAME_LENGTH: 200
 * MAX_NOTE_LENGTH: 5000
 * MAX_SYMBOL_LENGTH: 3
 * NAME_REGEX: /^[\p{L}\s\-'\.]+$/u (letters, spaces, hyphens, apostrophes, dots)
 * ID_REGEX: /^[a-zA-Z0-9_-]+$/
 * VARIABLE_KEY_REGEX: /^[a-z0-9_]+$/ (lowercase, numbers, underscores only)
 * 
 * =============================================================================
 */

// =============================================================================
// 1. CONSTANTS
// =============================================================================

const VALIDATION_CONSTANTS = {
    MIN_YEAR: -10000,  // Support BC years
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
    // Unicode-aware name regex (letters, spaces, hyphens, apostrophes, dots)
    NAME_REGEX: /^[\p{L}\s\-'\.]+$/u,
    // Variable key regex (lowercase, numbers, underscores)
    VARIABLE_KEY_REGEX: /^[a-z0-9_]+$/
};

// =============================================================================
// 2. YEAR VALIDATION
// =============================================================================

/**
 * Validates that a year is within valid range
 * @param {number} year - Year to validate
 * @param {number} minYear - Minimum year (default -10000 for BC support)
 * @param {number} maxYear - Maximum year (default 9999)
 * @returns {boolean} True if valid
 */
function isValidYear(year, minYear = VALIDATION_CONSTANTS.MIN_YEAR, maxYear = VALIDATION_CONSTANTS.MAX_YEAR) {
    if (year === undefined || year === null) return false;
    if (typeof year !== 'number') return false;
    if (isNaN(year)) return false;
    return year >= minYear && year <= maxYear;
}

/**
 * Validates that a birth year and death year are logically consistent
 * @param {number|null} birthYear - Birth year
 * @param {number|null} deathYear - Death year
 * @param {boolean} isDeceased - Whether character is deceased
 * @returns {Object} { isValid: boolean, message: string }
 */
function validateYearsConsistency(birthYear, deathYear, isDeceased) {
    // No birth year - can't validate
    if (!isValidYear(birthYear)) {
        return { isValid: true, message: 'No valid birth year' };
    }
    
    // Deceased must have death year
    if (isDeceased && !isValidYear(deathYear)) {
        return { isValid: false, message: 'Deceased character must have a valid death year' };
    }
    
    // Living character should not have death year
    if (!isDeceased && isValidYear(deathYear)) {
        return { isValid: false, message: 'Living character has a death year' };
    }
    
    // Death cannot be before birth
    if (isValidYear(deathYear) && deathYear < birthYear) {
        return { isValid: false, message: `Death year (${deathYear}) cannot be before birth year (${birthYear})` };
    }
    
    return { isValid: true, message: 'Valid' };
}

// =============================================================================
// 2. CHARACTER VALIDATION
// =============================================================================

/**
 * Validates a character ID format
 * @param {string} id - Character ID
 * @returns {boolean} True if valid format
 */
function isValidCharacterId(id) {
    if (!id || typeof id !== 'string') return false;
    return VALIDATION_CONSTANTS.ID_REGEX.test(id);
}

/**
 * Validates a character object
 * @param {Object} char - Character object to validate
 * @param {Object} context - Optional validation context (e.g., existing characters for duplicate checks)
 * @returns {Object} { isValid: boolean, errors: Array<string> }
 */
function validateCharacter(char, context = {}) {
    const errors = [];
    
    // Required fields
    if (!char.id) errors.push('Character missing ID');
    if (char.id && !isValidCharacterId(char.id)) {
        errors.push(`Character ID "${char.id}" contains invalid characters`);
    }
    
    // Name validation
    if (!char.name || char.name.trim() === '') {
        errors.push('Character name is required');
    } else if (char.name.length > VALIDATION_CONSTANTS.MAX_NAME_LENGTH) {
        errors.push(`Character name exceeds ${VALIDATION_CONSTANTS.MAX_NAME_LENGTH} characters`);
    } else if (!VALIDATION_CONSTANTS.NAME_REGEX.test(char.name.trim())) {
        errors.push(`Character name "${char.name}" contains invalid characters (use letters, spaces, hyphens, apostrophes, or dots)`);
    }
    
    // Surname validation
    if (char.surname && char.surname.length > VALIDATION_CONSTANTS.MAX_SURNAME_LENGTH) {
        errors.push(`Surname exceeds ${VALIDATION_CONSTANTS.MAX_SURNAME_LENGTH} characters`);
    } else if (char.surname && !VALIDATION_CONSTANTS.NAME_REGEX.test(char.surname)) {
        errors.push(`Surname "${char.surname}" contains invalid characters`);
    }
    
    // Gender validation
    const validGenders = ['male', 'female', 'unknown', 'other'];
    if (char.gender && !validGenders.includes(char.gender)) {
        errors.push(`Invalid gender: ${char.gender}`);
    }
    
    // Attraction validation
    const validAttractions = ['both', 'men', 'women', 'neither', 'unknown'];
    if (char.attraction && !validAttractions.includes(char.attraction)) {
        errors.push(`Invalid attraction: ${char.attraction}`);
    }
    
    // Epithet validation
    if (char.epithet && char.epithet.length > 50) {
        errors.push('Epithet exceeds 50 characters');
    }
    
    // Birth year validation
    if (char.birthYear !== undefined && char.birthYear !== null) {
        if (!isValidYear(char.birthYear)) {
            errors.push(`Invalid birth year: ${char.birthYear}`);
        }
    }
    
    // Year consistency
    const yearConsistency = validateYearsConsistency(char.birthYear, char.deathYear, char.isDeceased);
    if (!yearConsistency.isValid) {
        errors.push(yearConsistency.message);
    }
    
    // Birth year cannot be too far in the future
    const currentYear = context.currentYear || 1250;
    if (char.birthYear && char.birthYear > currentYear + 10) {
        errors.push(`Birth year ${char.birthYear} is too far in the future (current: ${currentYear})`);
    }
    
    // Parent references validation
    if (char.motherId && typeof char.motherId !== 'string') {
        errors.push('Mother ID must be a string');
    }
    if (char.fatherId && typeof char.fatherId !== 'string') {
        errors.push('Father ID must be a string');
    }
    
    // Household validation
    if (char.household && typeof char.household !== 'string') {
        errors.push('Household must be a string');
    }
    
    // Notes length
    if (char.notes && char.notes.length > VALIDATION_CONSTANTS.MAX_NOTE_LENGTH) {
        errors.push(`Notes exceed ${VALIDATION_CONSTANTS.MAX_NOTE_LENGTH} characters`);
    }
    
    // Duplicate ID check (if context provides existing IDs)
    if (context.existingCharacterIds && context.existingCharacterIds.has(char.id)) {
        errors.push(`Duplicate character ID: ${char.id}`);
    }
    
    return { isValid: errors.length === 0, errors };
}

/**
 * Validates a character's age range is plausible
 * @param {Object} char - Character object
 * @param {number} currentYear - Current world year
 * @param {number} maxAge - Maximum plausible age (default 120)
 * @returns {Object} { isValid: boolean, age: number|null, message: string }
 */
function validateCharacterAge(char, currentYear, maxAge = VALIDATION_CONSTANTS.DEFAULT_MAX_AGE) {
    if (!char.birthYear || !isValidYear(char.birthYear)) {
        return { isValid: true, age: null, message: 'No valid birth year set' };
    }
    
    let age;
    if (char.isDeceased && char.deathYear && isValidYear(char.deathYear)) {
        age = char.deathYear - char.birthYear;
    } else {
        age = currentYear - char.birthYear;
    }
    
    if (age < 0) {
        return { isValid: false, age: age, message: `Negative age (${age}) - birth year after current year` };
    }
    
    // Check for living infant (age 0) - this is valid
    if (age === 0 && !char.isDeceased) {
        return { isValid: true, age: 0, message: 'Infant (under 1 year)' };
    }
    
    if (age > maxAge) {
        return { isValid: false, age: age, message: `Age ${age} exceeds maximum ${maxAge}` };
    }
    
    // Check for unreasonably old parents
    if (age > 100) {
        return { isValid: true, age: age, message: `Age ${age} is very old but possible` };
    }
    
    return { isValid: true, age: age, message: 'Valid age' };
}

// =============================================================================
// 3. PLACE VALIDATION
// =============================================================================

/**
 * Validates a place ID format
 * @param {string} id - Place ID
 * @returns {boolean} True if valid format
 */
function isValidPlaceId(id) {
    if (!id || typeof id !== 'string') return false;
    return VALIDATION_CONSTANTS.ID_REGEX.test(id);
}

/**
 * Validates a place/location object
 * @param {Object} place - Place object to validate
 * @param {Object} context - Optional validation context
 * @returns {Object} { isValid: boolean, errors: Array<string> }
 */
function validatePlace(place, context = {}) {
    const errors = [];
    
    // Required fields
    if (!place.id) errors.push('Place missing ID');
    if (place.id && !isValidPlaceId(place.id)) {
        errors.push(`Place ID "${place.id}" contains invalid characters`);
    }
    
    if (!place.displayName || place.displayName.trim() === '') {
        errors.push('Place name is required');
    } else if (place.displayName.length > VALIDATION_CONSTANTS.MAX_DISPLAY_NAME_LENGTH) {
        errors.push(`Place name exceeds ${VALIDATION_CONSTANTS.MAX_DISPLAY_NAME_LENGTH} characters`);
    }
    
    // Type ID validation
    if (!place.typeId) {
        errors.push(`Place "${place.displayName || 'unnamed'}" missing type ID`);
    }
    
    // Valid statuses
    const validStatuses = ['active', 'disputed', 'abandoned', 'ruined'];
    if (place.status && !validStatuses.includes(place.status)) {
        errors.push(`Invalid place status: ${place.status}`);
    }
    
    // Variable key format
    if (place.variableKey) {
        if (!VALIDATION_CONSTANTS.VARIABLE_KEY_REGEX.test(place.variableKey)) {
            errors.push(`Variable key "${place.variableKey}" should be lowercase with underscores only`);
        }
    }
    
    // Parent reference check (parent must exist - requires context)
    if (context.existingPlaceIds && place.parentId) {
        if (!context.existingPlaceIds.has(place.parentId)) {
            errors.push(`Parent place "${place.parentId}" does not exist`);
        }
    }
    
    // Notes length
    if (place.notes && place.notes.length > VALIDATION_CONSTANTS.MAX_NOTE_LENGTH) {
        errors.push(`Place notes exceed ${VALIDATION_CONSTANTS.MAX_NOTE_LENGTH} characters`);
    }
    
    // Duplicate ID check
    if (context.existingPlaceIds && context.existingPlaceIds.has(place.id)) {
        errors.push(`Duplicate place ID: ${place.id}`);
    }
    
    return { isValid: errors.length === 0, errors };
}

// =============================================================================
// 4. RANK VALIDATION
// =============================================================================

/**
 * Validates a rank object
 * @param {Object} rank - Rank object to validate
 * @param {Object} context - Optional validation context
 * @returns {Object} { isValid: boolean, errors: Array<string> }
 */
function validateRank(rank, context = {}) {
    const errors = [];
    
    // Required fields
    if (!rank.id) errors.push('Rank missing ID');
    if (!rank.name || rank.name.trim() === '') errors.push('Rank name is required');
    if (rank.name && rank.name.length > VALIDATION_CONSTANTS.MAX_NAME_LENGTH) {
        errors.push(`Rank name exceeds ${VALIDATION_CONSTANTS.MAX_NAME_LENGTH} characters`);
    }
    
    // Priority validation
    if (rank.priority !== undefined) {
        if (typeof rank.priority !== 'number' || rank.priority < 1 || rank.priority > 5) {
            errors.push(`Rank priority must be a number between 1-5, got: ${rank.priority}`);
        }
    }
    
    // Gender restriction validation
    const validGenderRestrictions = ['either', 'male', 'female'];
    if (rank.genderRestriction && !validGenderRestrictions.includes(rank.genderRestriction)) {
        errors.push(`Invalid gender restriction: ${rank.genderRestriction}`);
    }
    
    // Symbol validation
    if (rank.symbol) {
        if (typeof rank.symbol !== 'string') {
            errors.push('Rank symbol must be a string');
        } else if (rank.symbol.length > VALIDATION_CONSTANTS.MAX_SYMBOL_LENGTH) {
            errors.push(`Rank symbol should be 1-${VALIDATION_CONSTANTS.MAX_SYMBOL_LENGTH} characters, got: ${rank.symbol}`);
        }
    }
    
    // Numbered validation
    if (rank.numbered !== undefined && typeof rank.numbered !== 'boolean') {
        errors.push('Rank.numbered must be a boolean');
    }
    
    // Duplicate ID check
    if (context.existingRankIds && context.existingRankIds.has(rank.id)) {
        errors.push(`Duplicate rank ID: ${rank.id}`);
    }
    
    return { isValid: errors.length === 0, errors };
}

// =============================================================================
// 5. ROLE/PROFESSION VALIDATION
// =============================================================================

/**
 * Validates a role/profession object
 * @param {Object} role - Role object to validate
 * @param {Object} context - Optional validation context
 * @returns {Object} { isValid: boolean, errors: Array<string> }
 */
function validateRole(role, context = {}) {
    const errors = [];
    
    if (!role.id) errors.push('Role missing ID');
    if (!role.name || role.name.trim() === '') errors.push('Role name is required');
    if (role.name && role.name.length > VALIDATION_CONSTANTS.MAX_NAME_LENGTH) {
        errors.push(`Role name exceeds ${VALIDATION_CONSTANTS.MAX_NAME_LENGTH} characters`);
    }
    
    const validGenderRestrictions = ['both', 'male', 'female'];
    if (role.genderRestriction && !validGenderRestrictions.includes(role.genderRestriction)) {
        errors.push(`Invalid gender restriction: ${role.genderRestriction}`);
    }
    
    // Specializations validation
    if (role.specializations) {
        if (!Array.isArray(role.specializations)) {
            errors.push('Specializations must be an array');
        } else {
            for (let i = 0; i < role.specializations.length; i++) {
                if (typeof role.specializations[i] !== 'string') {
                    errors.push(`Specialization at index ${i} must be a string`);
                } else if (role.specializations[i].length > 50) {
                    errors.push(`Specialization "${role.specializations[i]}" exceeds 50 characters`);
                }
            }
        }
    }
    
    // Notes length
    if (role.notes && role.notes.length > VALIDATION_CONSTANTS.MAX_NOTE_LENGTH) {
        errors.push(`Role notes exceed ${VALIDATION_CONSTANTS.MAX_NOTE_LENGTH} characters`);
    }
    
    // Duplicate ID check
    if (context.existingRoleIds && context.existingRoleIds.has(role.id)) {
        errors.push(`Duplicate role ID: ${role.id}`);
    }
    
    return { isValid: errors.length === 0, errors };
}

// =============================================================================
// 6. RELATIONSHIP VALIDATION
// =============================================================================

/**
 * Validates a relationship between two characters
 * @param {Object} relationship - Relationship object
 * @param {string} charId - First character ID
 * @param {string} partnerId - Partner character ID
 * @param {Object} context - Optional validation context with existing character IDs
 * @returns {Object} { isValid: boolean, errors: Array<string>, warnings: Array<string> }
 */
function validateRelationship(relationship, charId, partnerId, context = {}) {
    const errors = [];
    const warnings = [];
    
    // Cannot have relationship with self
    if (charId === partnerId) {
        errors.push('Character cannot have a relationship with themselves');
    }
    
    if (relationship.partnerId !== partnerId) {
        errors.push(`Relationship partner mismatch: expected ${partnerId}, got ${relationship.partnerId}`);
    }
    
    const validStatuses = ['ongoing', 'ended', 'widowed'];
    if (!validStatuses.includes(relationship.status)) {
        errors.push(`Invalid relationship status: ${relationship.status}`);
    }
    
    const details = relationship.details || {};
    
    if (details.startYear && !isValidYear(details.startYear)) {
        errors.push(`Invalid start year: ${details.startYear}`);
    }
    
    if (details.endYear && !isValidYear(details.endYear)) {
        errors.push(`Invalid end year: ${details.endYear}`);
    }
    
    if (details.startYear && details.endYear && details.endYear < details.startYear) {
        errors.push(`End year (${details.endYear}) before start year (${details.startYear})`);
    }
    
    const validTypes = ['casual', 'serious', 'affair', 'betrothed', 'marriage'];
    if (details.type && !validTypes.includes(details.type)) {
        errors.push(`Invalid relationship type: ${details.type}`);
    }
    
    // Check if partner exists (if context provided)
    if (context.existingCharacterIds && !context.existingCharacterIds.has(partnerId)) {
        errors.push(`Partner character "${partnerId}" does not exist`);
    }
    
    // Warning: Check if relationship is recorded on both sides
    if (context.partnerHasRelationship === false) {
        warnings.push(`Relationship may not be bidirectional - partner lacks matching relationship record`);
    }
    
    return { isValid: errors.length === 0, errors, warnings };
}

/**
 * Validates bidirectional relationship consistency
 * @param {Object} rel1 - Relationship from character A to B
 * @param {Object} rel2 - Relationship from character B to A
 * @returns {Object} { isConsistent: boolean, issues: Array<string> }
 */
function validateBidirectionalRelationship(rel1, rel2) {
    const issues = [];
    
    if (!rel1 || !rel2) {
        issues.push('Missing bidirectional relationship');
        return { isConsistent: false, issues };
    }
    
    if (rel1.status !== rel2.status) {
        issues.push(`Status mismatch: ${rel1.status} vs ${rel2.status}`);
    }
    
    const details1 = rel1.details || {};
    const details2 = rel2.details || {};
    
    if (details1.startYear !== details2.startYear) {
        issues.push(`Start year mismatch: ${details1.startYear} vs ${details2.startYear}`);
    }
    
    if (details1.endYear !== details2.endYear) {
        issues.push(`End year mismatch: ${details1.endYear} vs ${details2.endYear}`);
    }
    
    if (details1.type !== details2.type) {
        issues.push(`Type mismatch: ${details1.type} vs ${details2.type}`);
    }
    
    return { isConsistent: issues.length === 0, issues };
}

// =============================================================================
// 7. IMPORT VALIDATION
// =============================================================================

/**
 * Validates imported data structure
 * @param {Object} imported - Imported JSON data
 * @returns {Object} { isValid: boolean, errors: Array<string>, warnings: Array<string> }
 */
function validateImportData(imported) {
    const errors = [];
    const warnings = [];
    
    // Check for valid structure
    if (!imported) {
        errors.push('No data provided');
        return { isValid: false, errors, warnings };
    }
    
    // Determine format and validate
    let dataToValidate;
    if (imported.type === "master" && imported.data) {
        dataToValidate = imported.data;
    } else if (imported.data && imported.data.characters) {
        dataToValidate = imported.data;
    } else if (imported.characters) {
        dataToValidate = imported;
    } else {
        errors.push('Unknown file format - expected Still Waters export');
        return { isValid: false, errors, warnings };
    }
    
    // Track IDs for duplicate detection
    const characterIds = new Set();
    const placeIds = new Set();
    const rankIds = new Set();
    const roleIds = new Set();
    
    // Validate characters array
    if (!dataToValidate.characters) {
        warnings.push('No characters found in import data');
    } else if (!Array.isArray(dataToValidate.characters)) {
        errors.push('Characters must be an array');
    } else {
        for (let i = 0; i < dataToValidate.characters.length; i++) {
            const char = dataToValidate.characters[i];
            
            if (!char.name) {
                warnings.push(`Character at index ${i} has no name`);
            }
            
            if (char.id) {
                if (characterIds.has(char.id)) {
                    errors.push(`Duplicate character ID: ${char.id}`);
                } else {
                    characterIds.add(char.id);
                }
            }
            
            if (char.birthYear && typeof char.birthYear !== 'number') {
                errors.push(`Character ${char.name || i} has invalid birth year`);
            }
            
            // Basic validation for each character
            const validation = validateCharacter(char, { currentYear: dataToValidate.currentYear || 1250 });
            if (!validation.isValid) {
                for (const err of validation.errors) {
                    errors.push(`Character ${char.name || i}: ${err}`);
                }
            }
        }
    }
    
    // Validate places array
    if (dataToValidate.places) {
        if (!Array.isArray(dataToValidate.places)) {
            errors.push('Places must be an array');
        } else {
            for (const place of dataToValidate.places) {
                if (place.id) {
                    if (placeIds.has(place.id)) {
                        errors.push(`Duplicate place ID: ${place.id}`);
                    } else {
                        placeIds.add(place.id);
                    }
                }
            }
        }
    }
    
    // Validate ranks array
    if (dataToValidate.ranks) {
        if (!Array.isArray(dataToValidate.ranks)) {
            errors.push('Ranks must be an array');
        } else {
            for (const rank of dataToValidate.ranks) {
                if (rank.id) {
                    if (rankIds.has(rank.id)) {
                        errors.push(`Duplicate rank ID: ${rank.id}`);
                    } else {
                        rankIds.add(rank.id);
                    }
                }
            }
        }
    }
    
    // Validate roles array
    if (dataToValidate.roles) {
        if (!Array.isArray(dataToValidate.roles)) {
            errors.push('Roles must be an array');
        } else {
            for (const role of dataToValidate.roles) {
                if (role.id) {
                    if (roleIds.has(role.id)) {
                        errors.push(`Duplicate role ID: ${role.id}`);
                    } else {
                        roleIds.add(role.id);
                    }
                }
            }
        }
    }
    
    // Validate current year
    if (dataToValidate.currentYear !== undefined && !isValidYear(dataToValidate.currentYear)) {
        warnings.push(`Invalid current year: ${dataToValidate.currentYear}, using default`);
    }
    
    // Check for orphaned references (place parents)
    if (dataToValidate.places && placeIds.size > 0) {
        for (const place of dataToValidate.places) {
            if (place.parentId && !placeIds.has(place.parentId)) {
                warnings.push(`Place "${place.displayName}" references missing parent "${place.parentId}"`);
            }
        }
    }
    
    // Check for orphaned character parents
    if (dataToValidate.characters && characterIds.size > 0) {
        for (const char of dataToValidate.characters) {
            if (char.motherId && !characterIds.has(char.motherId)) {
                warnings.push(`Character "${char.name}" references missing mother "${char.motherId}"`);
            }
            if (char.fatherId && !characterIds.has(char.fatherId)) {
                warnings.push(`Character "${char.name}" references missing father "${char.fatherId}"`);
            }
        }
    }
    
    return { isValid: errors.length === 0, errors, warnings };
}

// =============================================================================
// 8. SCHEMA VALIDATION
// =============================================================================

// Schema definitions for each entity type
const ENTITY_SCHEMAS = {
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

/**
 * Validates an entity against its schema
 * @param {Object} entity - Entity to validate
 * @param {string} type - Entity type ('character', 'place', 'rank', 'role', 'household')
 * @returns {Object} { isValid: boolean, errors: Array<string> }
 */
function validateEntitySchema(entity, type) {
    const errors = [];
    const schema = ENTITY_SCHEMAS[type];
    
    if (!schema) {
        errors.push(`Unknown entity type: ${type}`);
        return { isValid: false, errors };
    }
    
    // Check required fields
    for (const required of schema.required) {
        if (entity[required] === undefined || entity[required] === null) {
            errors.push(`Missing required field: ${required}`);
        }
    }
    
    // Check for invalid fields
    const validFields = [...schema.required, ...schema.optional];
    for (const field of Object.keys(entity)) {
        if (!validFields.includes(field)) {
            errors.push(`Unknown field: ${field}`);
        }
    }
    
    return { isValid: errors.length === 0, errors };
}

// =============================================================================
// 9. UTILITY FUNCTIONS
// =============================================================================

/**
 * Sanitizes a string for safe display
 * @param {string} str - Input string
 * @returns {string} Sanitized string (truncated if needed)
 */
function sanitizeString(str, maxLength = VALIDATION_CONSTANTS.MAX_NAME_LENGTH) {
    if (!str || typeof str !== 'string') return '';
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
}

/**
 * Normalizes a name for consistent storage
 * @param {string} name - Input name
 * @returns {string} Normalized name (trimmed, multiple spaces collapsed)
 */
function normalizeNameForStorage(name) {
    if (!name || typeof name !== 'string') return '';
    return name.trim().replace(/\s+/g, ' ');
}

// =============================================================================
// 10. EXPORTS (Global Availability)
// =============================================================================

// Constants
window.VALIDATION_CONSTANTS = Object.freeze({ ...VALIDATION_CONSTANTS });

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
Object.defineProperty(window, 'ENTITY_SCHEMAS', {
    get: () => ENTITY_SCHEMAS,
    set: () => { throw new Error('ENTITY_SCHEMAS is read-only'); }
});