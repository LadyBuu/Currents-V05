/**
 * =============================================================================
 * STILL WATERS - ID GENERATION (ids.js)
 * =============================================================================
 * 
 * LOCATION: js/core/ids.js
 * 
 * This file contains ONLY ID generation functions.
 * NOT included: persistence, state, validation, calculations.
 * 
 * PURPOSE: Generate unique identifiers for all entities (characters, places,
 *          ranks, roles, households, relationships, events, etc.)
 * 
 * DEPENDENCIES: 
 *   - js/core/randomness.js (optional - for seeded random generation)
 * 
 * NOTE: ID FORMAT vs VALIDATION
 *   - This file generates IDs in format: [prefix_]timestamp_random
 *   - validation.js uses a simpler regex [a-zA-Z0-9_-]+ for EXISTING data
 *   - This is intentional: new IDs follow strict format, old IDs may not
 * =============================================================================
 * EXPORTED FUNCTIONS (on window):
 * =============================================================================
 * 
 * Constants:
 *   - ID_PREFIXES - Object with prefix constants for each entity type
 *   - ID_CONFIG - Object with configuration (DEFAULT_RANDOM_LENGTH: 8, SHORT_RANDOM_LENGTH: 4, etc.)
 * 
 * Core ID Generation:
 *   - generateId(prefix, randomLength) - Generates timestamp_random ID (format: [prefix_]timestamp_random)
 *   - generateShortId(prefix, length) - Generates short random ID (higher collision probability)
 *   - generateLongId(prefix) - Generates long ID with extra entropy
 * 
 * Entity-Specific ID Generators:
 *   - generateCharacterId() - Generates character ID (char_ prefix)
 *   - generatePlaceId() - Generates place ID (place_ prefix)
 *   - generateRankId() - Generates rank ID (rank_ prefix)
 *   - generateRoleId() - Generates role ID (role_ prefix)
 *   - generateHouseholdId() - Generates household ID (house_ prefix)
 *   - generateRelationshipId() - Generates relationship ID (rel_ prefix)
 *   - generateEventId() - Generates event ID (event_ prefix)
 * 
 * Batch ID Generation:
 *   - generateBatchIds(count, prefix, generatorFn) - Generates multiple IDs at once
 *   - generateBatchCharacterIds(count) - Generates multiple character IDs
 * 
 * ID Validation (Strict Format - for NEW IDs):
 *   - isValidId(id, expectedPrefix) - Validates strict format (prefix_timestamp_random)
 *   - isCharacterId(id) - Checks if ID is a valid character ID
 *   - isPlaceId(id) - Checks if ID is a valid place ID
 *   - isRankId(id) - Checks if ID is a valid rank ID
 * 
 * ID Parsing:
 *   - parseId(id) - Parses ID into { prefix, timestamp, random }
 *   - getIdTimestamp(id) - Extracts timestamp from ID
 *   - getIdPrefix(id) - Extracts prefix from ID
 * 
 * Cache Management (for testing):
 *   - clearGeneratedIds() - Clears the generated IDs cache
 *   - removeGeneratedId(id) - Removes a specific ID from cache
 * 
 * =============================================================================
 */

// =============================================================================
// 1. CONSTANTS
// =============================================================================

/**
 * ID prefix constants for different entity types
 * Using prefixes makes IDs self-documenting and easier to debug
 */
const ID_PREFIXES = {
    CHARACTER: 'char',
    PLACE: 'place',
    RANK: 'rank',
    ROLE: 'role',
    HOUSEHOLD: 'house',
    LOCATION_TYPE: 'loctype',
    GOVERNMENT_TYPE: 'govtype',
    RELATIONSHIP: 'rel',
    EVENT: 'event',
    DISASTER: 'disaster',
    HOUSEHOLD_MEMBER: 'hmember',
    HOUSEHOLD_DEPARTMENT: 'hdept',
    RANK_ASSIGNMENT: 'rankassign',
    PROFESSION: 'prof',
    MOVE: 'move',
    FRIENDSHIP: 'friend',
    ADOPTION: 'adopt',
    APPRENTICESHIP: 'apprentice'
};

/**
 * Default ID configuration
 */
const ID_CONFIG = {
    DEFAULT_RANDOM_LENGTH: 8,
    SHORT_RANDOM_LENGTH: 4,
    LONG_RANDOM_LENGTH: 12,
    MAX_ID_LENGTH: 100,
    MIN_RANDOM_LENGTH: 4,
    SEPARATOR: '_'
};

// Set of generated IDs in the current session (for collision detection)
const _generatedIds = new Set();

// =============================================================================
// 2. CORE ID GENERATION (Randomness Helpers)
// =============================================================================

/**
 * Generates a random alphanumeric string of specified length
 * Uses seeded RNG from randomness.js if available, otherwise Math.random
 * @param {number} length - Length of random string (default 8)
 * @returns {string} Random string
 */
function _randomString(length = ID_CONFIG.DEFAULT_RANDOM_LENGTH) {
    // Try to use seeded RNG from randomness.js if available
    if (typeof window.random !== 'undefined') {
        // Use the seeded RNG for deterministic simulation
        let result = '';
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < length; i++) {
            const index = Math.floor(window.random() * chars.length);
            result += chars[index];
        }
        return result;
    }
    // Fallback to Math.random (non-deterministic)
    return Math.random().toString(36).substring(2, 2 + length);
}

// =============================================================================
// 3. CORE ID GENERATION
// =============================================================================

/**
 * Generates a unique ID using timestamp + random string
 * Format: timestamp_randomString (e.g., "1703123456789_abc123def")
 * 
 * The combination of timestamp and random string ensures uniqueness even
 * when multiple IDs are generated in the same millisecond.
 * 
 * @param {string} prefix - Optional prefix for the ID (e.g., 'char', 'place')
 * @param {number} randomLength - Length of random part (default 8)
 * @returns {string} Unique identifier
 */
function generateId(prefix = null, randomLength = ID_CONFIG.DEFAULT_RANDOM_LENGTH) {
    const timestamp = Date.now();
    const randomStr = _randomString(randomLength);
    let id = `${timestamp}${ID_CONFIG.SEPARATOR}${randomStr}`;
    
    if (prefix) {
        id = `${prefix}${ID_CONFIG.SEPARATOR}${id}`;
    }
    
    // Collision detection (extremely rare but possible)
    if (_generatedIds.has(id)) {
        // Recursively try again with longer random string
        return generateId(prefix, randomLength + 1);
    }
    
    _generatedIds.add(id);
    return id;
}

/**
 * Generates a short ID (for debugging or non-critical use)
 * Format: randomString (e.g., "abc123de")
 * NOTE: Short IDs have higher collision probability - use only when acceptable
 * 
 * @param {string} prefix - Optional prefix
 * @param {number} length - Length of random part (default 6)
 * @returns {string} Short unique identifier
 */
function generateShortId(prefix = null, length = ID_CONFIG.SHORT_RANDOM_LENGTH) {
    const randomStr = _randomString(length);
    let id = randomStr;
    
    if (prefix) {
        id = `${prefix}${ID_CONFIG.SEPARATOR}${id}`;
    }
    
    // Check for collision
    if (_generatedIds.has(id)) {
        return generateShortId(prefix, length + 1);
    }
    
    _generatedIds.add(id);
    return id;
}

/**
 * Generates a long ID with extra entropy
 * @param {string} prefix - Optional prefix
 * @returns {string} Long unique identifier
 */
function generateLongId(prefix = null) {
    return generateId(prefix, ID_CONFIG.LONG_RANDOM_LENGTH);
}

// =============================================================================
// 4. ENTITY-SPECIFIC ID GENERATORS
// =============================================================================

/**
 * Generates a character ID
 * @returns {string} Character ID
 */
function generateCharacterId() {
    return generateId(ID_PREFIXES.CHARACTER);
}

/**
 * Generates a place ID
 * @returns {string} Place ID
 */
function generatePlaceId() {
    return generateId(ID_PREFIXES.PLACE);
}

/**
 * Generates a rank ID
 * @returns {string} Rank ID
 */
function generateRankId() {
    return generateId(ID_PREFIXES.RANK);
}

/**
 * Generates a role ID
 * @returns {string} Role ID
 */
function generateRoleId() {
    return generateId(ID_PREFIXES.ROLE);
}

/**
 * Generates a household ID
 * @returns {string} Household ID
 */
function generateHouseholdId() {
    return generateId(ID_PREFIXES.HOUSEHOLD);
}

/**
 * Generates a relationship ID
 * @returns {string} Relationship ID
 */
function generateRelationshipId() {
    return generateId(ID_PREFIXES.RELATIONSHIP);
}

/**
 * Generates an event ID
 * @returns {string} Event ID
 */
function generateEventId() {
    return generateId(ID_PREFIXES.EVENT);
}

// =============================================================================
// 5. BATCH ID GENERATION
// =============================================================================

/**
 * Generates multiple IDs at once
 * @param {number} count - Number of IDs to generate
 * @param {string} prefix - Optional prefix
 * @param {Function} generatorFn - Generator function to use (default generateId)
 * @returns {Array} Array of generated IDs
 */
function generateBatchIds(count, prefix = null, generatorFn = generateId) {
    if (count <= 0) return [];
    const ids = [];
    for (let i = 0; i < count; i++) {
        ids.push(generatorFn(prefix));
    }
    return ids;
}

/**
 * Generates multiple character IDs at once
 * @param {number} count - Number of character IDs to generate
 * @returns {Array} Array of character IDs
 */
function generateBatchCharacterIds(count) {
    return generateBatchIds(count, ID_PREFIXES.CHARACTER, generateCharacterId);
}

// =============================================================================
// 6. ID VALIDATION (For NEW IDs - strict format)
// =============================================================================

/**
 * Validates if a string matches the expected ID format for NEWLY GENERATED IDs
 * NOTE: This validates the STRICT format used by ids.js.
 * For validating existing data (which may have old formats), use validation.js
 * 
 * @param {string} id - ID to validate
 * @param {string} expectedPrefix - Optional expected prefix
 * @returns {boolean} True if ID format is valid
 */
function isValidId(id, expectedPrefix = null) {
    if (!id || typeof id !== 'string') return false;
    if (id.length > ID_CONFIG.MAX_ID_LENGTH) return false;
    
    let pattern;
    if (expectedPrefix) {
        // Pattern: prefix_timestamp_random (e.g., char_1703123456789_abc123)
        pattern = new RegExp(`^${expectedPrefix}${ID_CONFIG.SEPARATOR}\\d+${ID_CONFIG.SEPARATOR}[a-z0-9]{${ID_CONFIG.MIN_RANDOM_LENGTH},}$`);
    } else {
        // Pattern: optional prefix_timestamp_random
        pattern = new RegExp(`^(?:[a-z]+${ID_CONFIG.SEPARATOR})?\\d+${ID_CONFIG.SEPARATOR}[a-z0-9]{${ID_CONFIG.MIN_RANDOM_LENGTH},}$`);
    }
    
    return pattern.test(id);
}

/**
 * Checks if an ID is a character ID (strict format)
 * @param {string} id - ID to check
 * @returns {boolean}
 */
function isCharacterId(id) {
    return isValidId(id, ID_PREFIXES.CHARACTER);
}

/**
 * Checks if an ID is a place ID (strict format)
 * @param {string} id - ID to check
 * @returns {boolean}
 */
function isPlaceId(id) {
    return isValidId(id, ID_PREFIXES.PLACE);
}

/**
 * Checks if an ID is a rank ID (strict format)
 * @param {string} id - ID to check
 * @returns {boolean}
 */
function isRankId(id) {
    return isValidId(id, ID_PREFIXES.RANK);
}

// =============================================================================
// 7. ID PARSING
// =============================================================================

/**
 * Parses an ID into its components
 * @param {string} id - ID to parse
 * @returns {Object|null} { prefix: string|null, timestamp: number, random: string }
 */
function parseId(id) {
    if (!id || typeof id !== 'string') return null;
    
    const parts = id.split(ID_CONFIG.SEPARATOR);
    
    if (parts.length === 2) {
        // Format: timestamp_random
        const timestamp = parseInt(parts[0], 10);
        if (isNaN(timestamp)) return null;
        return {
            prefix: null,
            timestamp: timestamp,
            random: parts[1]
        };
    } else if (parts.length === 3) {
        // Format: prefix_timestamp_random
        const timestamp = parseInt(parts[1], 10);
        if (isNaN(timestamp)) return null;
        return {
            prefix: parts[0],
            timestamp: timestamp,
            random: parts[2]
        };
    }
    
    return null;
}

/**
 * Extracts the timestamp from an ID
 * @param {string} id - ID to parse
 * @returns {number|null} Timestamp or null if invalid
 */
function getIdTimestamp(id) {
    const parsed = parseId(id);
    return parsed ? parsed.timestamp : null;
}

/**
 * Extracts the prefix from an ID
 * @param {string} id - ID to parse
 * @returns {string|null} Prefix or null
 */
function getIdPrefix(id) {
    const parsed = parseId(id);
    return parsed ? parsed.prefix : null;
}

// =============================================================================
// 8. ID CLEARING (for testing)
// =============================================================================

/**
 * Clears the generated IDs cache
 * Used primarily for testing to reset the collision detection state
 */
function clearGeneratedIds() {
    _generatedIds.clear();
}

/**
 * Removes a specific ID from the cache (if it was generated in error)
 * @param {string} id - ID to remove
 */
function removeGeneratedId(id) {
    _generatedIds.delete(id);
}

// =============================================================================
// 9. EXPORTS (Global Availability)
// =============================================================================

// Constants
window.ID_PREFIXES = Object.freeze({ ...ID_PREFIXES });
window.ID_CONFIG = Object.freeze({ ...ID_CONFIG });

// Core generation
window.generateId = generateId;
window.generateShortId = generateShortId;
window.generateLongId = generateLongId;

// Entity-specific generators
window.generateCharacterId = generateCharacterId;
window.generatePlaceId = generatePlaceId;
window.generateRankId = generateRankId;
window.generateRoleId = generateRoleId;
window.generateHouseholdId = generateHouseholdId;
window.generateRelationshipId = generateRelationshipId;
window.generateEventId = generateEventId;

// Batch generation
window.generateBatchIds = generateBatchIds;
window.generateBatchCharacterIds = generateBatchCharacterIds;

// Validation (strict format for new IDs)
window.isValidId = isValidId;
window.isCharacterId = isCharacterId;
window.isPlaceId = isPlaceId;
window.isRankId = isRankId;

// Parsing
window.parseId = parseId;
window.getIdTimestamp = getIdTimestamp;
window.getIdPrefix = getIdPrefix;

// Cache management
window.clearGeneratedIds = clearGeneratedIds;
window.removeGeneratedId = removeGeneratedId;
