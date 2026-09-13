/**
 * =============================================================================
 * STILL WATERS - ID GENERATION (ids.js)
 * =============================================================================
 * 
 * LOCATION: js/core/ids.js
 * 
 * This file contains ONLY ID generation functions.
 * 
 * SCOPE:
 *   - Generating unique-enough identifiers for all entities
 *   - Parsing IDs into components (prefix, timestamp, random)
 *   - Syntactic format validation for newly-generated IDs
 * 
 * OUT OF SCOPE:
 *   - Uniqueness enforcement against the database (mutation layer's job)
 *   - Persistence
 *   - Validation of arbitrary existing IDs (see validation.js)
 * 
 * SEMANTIC RULES:
 *   - IDs use INDEPENDENT entropy, not the simulation RNG stream.
 *     This means adding `generateEventId()` calls anywhere does not affect
 *     deterministic simulations that use `window.random()`.
 *   - The format is: [prefix_]timestamp_randomString (e.g., "char_1703123456789_a3f8k2n9")
 *   - Random parts use lowercase alphanumeric only.
 *   - Session collision cache is not global uniqueness. See note below.
 * 
 * NOTE ON UNIQUENESS:
 *   This module guarantees "extremely unlikely to collide." It does NOT
 *   guarantee uniqueness against persisted data. When IDs must be
 *   unique against the current masterData (e.g., importing a character),
 *   the mutation layer is responsible for checking.
 * 
 * DEPENDENCIES: None. Does not require randomness.js.
 * 
 * ICON POLICY: No emojis. No icons.
 * 
 * =============================================================================
 */

// =============================================================================
// 1. CONSTANTS
// =============================================================================

var ID_PREFIXES = Object.freeze({
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
});

var ID_CONFIG = Object.freeze({
    DEFAULT_RANDOM_LENGTH: 8,
    SHORT_RANDOM_LENGTH: 4,
    LONG_RANDOM_LENGTH: 12,
    MAX_ID_LENGTH: 100,
    MIN_RANDOM_LENGTH: 4,
    SEPARATOR: '_',
    RANDOM_ALPHABET: 'abcdefghijklmnopqrstuvwxyz0123456789'
});

// Session-scoped collision registry. This tracks IDs generated in this
// session so we can retry on the extremely-unlikely collision. It does NOT
// know about IDs stored in masterData — that's the mutation layer's concern.
var _sessionGeneratedIds = new Set();

// =============================================================================
// 2. INTERNAL HELPERS
// =============================================================================

/**
 * Generates a random string of the given length using independent entropy.
 * 
 * Uses crypto.getRandomValues when available; falls back to Math.random.
 * Does NOT consume the simulation RNG stream.
 * 
 * @private
 * @param {number} length
 * @returns {string}
 */
function _randomString(length) {
    if (typeof length !== 'number' || length <= 0 || !Number.isInteger(length)) {
        length = ID_CONFIG.DEFAULT_RANDOM_LENGTH;
    }

    var alphabet = ID_CONFIG.RANDOM_ALPHABET;
    var alphabetLength = alphabet.length;
    var result = '';

    // Prefer crypto for stronger entropy. This avoids consuming
    // window.random() so deterministic simulations stay reproducible.
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        var bytes = new Uint8Array(length);
        crypto.getRandomValues(bytes);
        for (var i = 0; i < length; i++) {
            result += alphabet[bytes[i] % alphabetLength];
        }
        return result;
    }

    // Fallback: build the string in a loop so length is always respected.
    // This is what the old implementation got wrong (single random() call
    // produced fewer than `length` characters).
    for (var j = 0; j < length; j++) {
        result += alphabet[Math.floor(Math.random() * alphabetLength)];
    }
    return result;
}

/**
 * Validates a prefix (or returns null if invalid).
 * @private
 */
function _normalizePrefix(prefix) {
    if (prefix === undefined || prefix === null) return null;
    if (typeof prefix !== 'string') return null;
    if (prefix.length === 0) return null;
    // Must be alphanumeric + underscore, no leading/trailing underscore
    if (!/^[a-z][a-z0-9_]*$/i.test(prefix)) return null;
    return prefix;
}

/**
 * Validates a random-part length.
 * @private
 */
function _normalizeLength(length, fallback) {
    if (typeof length !== 'number' || !Number.isFinite(length)) return fallback;
    if (!Number.isInteger(length)) return fallback;
    if (length < ID_CONFIG.MIN_RANDOM_LENGTH) return fallback;
    if (length > 64) return 64; // hard ceiling
    return length;
}

// =============================================================================
// 3. CORE ID GENERATION
// =============================================================================

/**
 * Generates a unique-enough ID.
 * Format: [prefix_]timestamp_randomString
 * 
 * Collision handling: if the generated ID collides with another ID generated
 * in this session (extremely rare), a new ID is generated iteratively with
 * progressively longer random parts. No recursion.
 * 
 * @param {string} [prefix]
 * @param {number} [randomLength]
 * @returns {string}
 */
function generateId(prefix, randomLength) {
    var p = _normalizePrefix(prefix);
    var len = _normalizeLength(randomLength, ID_CONFIG.DEFAULT_RANDOM_LENGTH);

    var attempt = 0;
    while (attempt < 10) {
        var timestamp = Date.now();
        var rand = _randomString(len + attempt);
        var id = p
            ? p + ID_CONFIG.SEPARATOR + timestamp + ID_CONFIG.SEPARATOR + rand
            : String(timestamp) + ID_CONFIG.SEPARATOR + rand;

        if (!_sessionGeneratedIds.has(id)) {
            _sessionGeneratedIds.add(id);
            return id;
        }
        attempt++;
    }

    // Pathological fallback: extremely long random part
    var finalTimestamp = Date.now();
    var finalRand = _randomString(32);
    var finalId = p
        ? p + ID_CONFIG.SEPARATOR + finalTimestamp + ID_CONFIG.SEPARATOR + finalRand
        : String(finalTimestamp) + ID_CONFIG.SEPARATOR + finalRand;
    _sessionGeneratedIds.add(finalId);
    return finalId;
}

/**
 * Generates a short ID for non-critical use.
 * Format: [prefix_]randomString
 * NOTE: Short IDs have higher collision probability against persisted data.
 * Use only when the ID is not required to be globally unique.
 * 
 * @param {string} [prefix]
 * @param {number} [length]
 * @returns {string}
 */
function generateShortId(prefix, length) {
    var p = _normalizePrefix(prefix);
    var len = _normalizeLength(length, ID_CONFIG.SHORT_RANDOM_LENGTH);

    var attempt = 0;
    while (attempt < 10) {
        var rand = _randomString(len + attempt);
        var id = p ? p + ID_CONFIG.SEPARATOR + rand : rand;
        if (!_sessionGeneratedIds.has(id)) {
            _sessionGeneratedIds.add(id);
            return id;
        }
        attempt++;
    }
    var fallback = (p ? p + ID_CONFIG.SEPARATOR : '') + _randomString(16);
    _sessionGeneratedIds.add(fallback);
    return fallback;
}

/**
 * Generates a long ID with extra entropy.
 * @param {string} [prefix]
 * @returns {string}
 */
function generateLongId(prefix) {
    return generateId(prefix, ID_CONFIG.LONG_RANDOM_LENGTH);
}

// =============================================================================
// 4. ENTITY-SPECIFIC GENERATORS
// =============================================================================

function generateCharacterId() {
    return generateId(ID_PREFIXES.CHARACTER);
}

function generatePlaceId() {
    return generateId(ID_PREFIXES.PLACE);
}

function generateRankId() {
    return generateId(ID_PREFIXES.RANK);
}

function generateRoleId() {
    return generateId(ID_PREFIXES.ROLE);
}

function generateHouseholdId() {
    return generateId(ID_PREFIXES.HOUSEHOLD);
}

function generateRelationshipId() {
    return generateId(ID_PREFIXES.RELATIONSHIP);
}

function generateEventId() {
    return generateId(ID_PREFIXES.EVENT);
}

function generateProfessionId() {
    return generateId(ID_PREFIXES.PROFESSION);
}

function generateMoveId() {
    return generateId(ID_PREFIXES.MOVE);
}

// =============================================================================
// 5. BATCH GENERATION
// =============================================================================

/**
 * Generates multiple IDs.
 * 
 * @param {number} count - must be a positive integer
 * @param {Function} generatorFn - one of the entity-specific generators,
 *   or a function accepting no arguments that returns a string
 * @returns {string[]}
 * @throws {Error} if count is invalid
 */
function generateBatchIds(count, generatorFn) {
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
        throw new Error('generateBatchIds: count must be a non-negative integer');
    }
    if (count === 0) return [];
    if (count > 10000) {
        throw new Error('generateBatchIds: count exceeds maximum (10000)');
    }
    if (typeof generatorFn !== 'function') {
        generatorFn = generateId;
    }

    var ids = [];
    for (var i = 0; i < count; i++) {
        ids.push(generatorFn());
    }
    return ids;
}

/**
 * Generates multiple character IDs.
 * @param {number} count
 * @returns {string[]}
 */
function generateBatchCharacterIds(count) {
    return generateBatchIds(count, generateCharacterId);
}

// =============================================================================
// 6. PARSING
// =============================================================================

/**
 * Parses an ID into its components.
 * Returns null if the ID is malformed.
 * 
 * @param {string} id
 * @returns {{ prefix: string|null, timestamp: number, random: string }|null}
 */
function parseId(id) {
    if (!id || typeof id !== 'string') return null;
    var parts = id.split(ID_CONFIG.SEPARATOR);

    if (parts.length === 2) {
        var ts = parseInt(parts[0], 10);
        if (!Number.isFinite(ts) || ts <= 0) return null;
        if (!parts[1]) return null;
        return { prefix: null, timestamp: ts, random: parts[1] };
    }

    if (parts.length === 3) {
        var ts2 = parseInt(parts[1], 10);
        if (!Number.isFinite(ts2) || ts2 <= 0) return null;
        if (!parts[0] || !parts[2]) return null;
        return { prefix: parts[0], timestamp: ts2, random: parts[2] };
    }

    // Prefixes may contain underscores (e.g., "rank_assign_timestamp_rand"
    // would parse as 4 parts). Our current prefixes are underscore-free
    // so we reject anything else. If prefixes with underscores are added
    // later, this function must be updated.
    return null;
}

function getIdTimestamp(id) {
    var parsed = parseId(id);
    return parsed ? parsed.timestamp : null;
}

function getIdPrefix(id) {
    var parsed = parseId(id);
    return parsed ? parsed.prefix : null;
}

// =============================================================================
// 7. FORMAT VALIDATION
// =============================================================================

/**
 * Returns true if the ID matches the strict format produced by
 * generateId/generateShortId. This is a SYNTACTIC check, not a
 * uniqueness check.
 * 
 * @param {string} id
 * @param {string} [expectedPrefix]
 * @returns {boolean}
 */
function isValidId(id, expectedPrefix) {
    if (!id || typeof id !== 'string') return false;
    if (id.length > ID_CONFIG.MAX_ID_LENGTH) return false;

    var parsed = parseId(id);
    if (!parsed) return false;

    if (expectedPrefix !== undefined && expectedPrefix !== null) {
        if (parsed.prefix !== expectedPrefix) return false;
    }

    // Random part must be at least MIN_RANDOM_LENGTH and only lowercase
    // alphanumeric.
    if (parsed.random.length < ID_CONFIG.MIN_RANDOM_LENGTH) return false;
    if (!/^[a-z0-9]+$/.test(parsed.random)) return false;

    return true;
}

function isCharacterId(id) {
    return isValidId(id, ID_PREFIXES.CHARACTER);
}

function isPlaceId(id) {
    return isValidId(id, ID_PREFIXES.PLACE);
}

function isRankId(id) {
    return isValidId(id, ID_PREFIXES.RANK);
}

// =============================================================================
// 8. SESSION CACHE MANAGEMENT (for testing)
// =============================================================================

/**
 * Clears the session collision registry. Primarily for tests.
 */
function clearGeneratedIds() {
    _sessionGeneratedIds.clear();
}

/**
 * Removes a specific ID from the session cache. For tests that need to
 * simulate a collision.
 */
function removeGeneratedId(id) {
    _sessionGeneratedIds.delete(id);
}

// =============================================================================
// 9. EXPORTS
// =============================================================================

window.ID_PREFIXES = ID_PREFIXES;
window.ID_CONFIG = ID_CONFIG;

// Core
window.generateId = generateId;
window.generateShortId = generateShortId;
window.generateLongId = generateLongId;

// Entity-specific
window.generateCharacterId = generateCharacterId;
window.generatePlaceId = generatePlaceId;
window.generateRankId = generateRankId;
window.generateRoleId = generateRoleId;
window.generateHouseholdId = generateHouseholdId;
window.generateRelationshipId = generateRelationshipId;
window.generateEventId = generateEventId;
window.generateProfessionId = generateProfessionId;
window.generateMoveId = generateMoveId;

// Batch
window.generateBatchIds = generateBatchIds;
window.generateBatchCharacterIds = generateBatchCharacterIds;

// Parsing
window.parseId = parseId;
window.getIdTimestamp = getIdTimestamp;
window.getIdPrefix = getIdPrefix;

// Validation
window.isValidId = isValidId;
window.isCharacterId = isCharacterId;
window.isPlaceId = isPlaceId;
window.isRankId = isRankId;

// Cache (testing)
window.clearGeneratedIds = clearGeneratedIds;
window.removeGeneratedId = removeGeneratedId;