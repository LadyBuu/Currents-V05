/**
 * =============================================================================
 * STILL WATERS - ID GENERATION (ids.js)
 * =============================================================================
 * 
 * LOCATION: js/core/ids.js
 * 
 * SINGLE SOURCE OF TRUTH for identifier generation, parsing, and format
 * validation.
 * 
 * SCOPE:
 *   - Generating identifiers for entities
 *   - Parsing IDs into components (prefix, timestamp, random)
 *   - Syntactic validation of generated ID format
 * 
 * OUT OF SCOPE:
 *   - Uniqueness against persisted data (mutation layer's concern)
 *   - Domain-specific ID semantics
 *   - Entity type validation (see validation.js)
 * 
 * SEMANTIC RULES:
 *   - IDs use INDEPENDENT entropy (crypto or Math.random), never the
 *     simulation RNG stream.
 *   - Generation and parsing agree: any ID produced by generateId() or
 *     generateShortId() can be parsed by parseId().
 *   - Prefixes are underscore-free so the ID grammar is unambiguous.
 *   - Missing/invalid input returns null; no fabricated defaults.
 * 
 * GRAMMAR:
 *   Long form:  [prefix_]digits_random
 *   Short form: [prefix_]random
 * 
 *   Where:
 *     prefix = [a-z][a-z0-9]*
 *     digits = [0-9]+
 *     random = [a-z0-9]+ (length >= MIN_RANDOM_LENGTH)
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
    SHORT_RANDOM_LENGTH: 6,
    LONG_RANDOM_LENGTH: 12,
    MIN_RANDOM_LENGTH: 4,
    MAX_RANDOM_LENGTH: 32,
    MAX_ID_LENGTH: 120,
    SEPARATOR: '_',
    RANDOM_ALPHABET: 'abcdefghijklmnopqrstuvwxyz0123456789'
});

// Regexes for grammar validation. Compiled once.
var _RE_PREFIX = /^[a-z][a-z0-9]*$/;
var _RE_DIGITS = /^[0-9]+$/;
var _RE_RANDOM = /^[a-z0-9]+$/;

// Session-scoped collision registry. Prevents duplicate IDs from being
// generated within this JavaScript session. Does NOT enforce global
// uniqueness against persisted data — that's the mutation layer's job.
var _sessionGeneratedIds = new Set();

// =============================================================================
// 2. INTERNAL HELPERS
// =============================================================================

/**
 * Generates a random string of the exact requested length.
 * Uses crypto.getRandomValues when available; falls back to Math.random.
 * Does NOT consume the simulation RNG stream.
 * @private
 */
function _randomString(length) {
    if (!Number.isInteger(length) || length <= 0) {
        length = ID_CONFIG.DEFAULT_RANDOM_LENGTH;
    }

    var alphabet = ID_CONFIG.RANDOM_ALPHABET;
    var alphabetLength = alphabet.length;
    var result = '';

    if (typeof crypto !== 'undefined'
        && typeof crypto.getRandomValues === 'function') {
        var bytes = new Uint8Array(length);
        crypto.getRandomValues(bytes);
        for (var i = 0; i < length; i++) {
            result += alphabet[bytes[i] % alphabetLength];
        }
        return result;
    }

    for (var j = 0; j < length; j++) {
        result += alphabet[Math.floor(Math.random() * alphabetLength)];
    }
    return result;
}

/**
 * Normalizes and validates a prefix.
 * Prefixes must be lowercase alphanumeric starting with a letter.
 * Underscores are disallowed so the ID grammar stays unambiguous.
 * @private
 */
function _normalizePrefix(prefix) {
    if (prefix === undefined || prefix === null) return null;
    if (typeof prefix !== 'string') return null;
    if (prefix.length === 0) return null;
    if (!_RE_PREFIX.test(prefix)) return null;
    return prefix;
}

/**
 * Clamps a random-part length to the configured range.
 * @private
 */
function _normalizeLength(length, fallback) {
    if (!Number.isInteger(length)) return fallback;
    if (length < ID_CONFIG.MIN_RANDOM_LENGTH) return ID_CONFIG.MIN_RANDOM_LENGTH;
    if (length > ID_CONFIG.MAX_RANDOM_LENGTH) return ID_CONFIG.MAX_RANDOM_LENGTH;
    return length;
}

/**
 * Builds an ID string from components.
 * @private
 */
function _composeId(prefix, timestamp, rand) {
    if (prefix) {
        return prefix + ID_CONFIG.SEPARATOR + timestamp + ID_CONFIG.SEPARATOR + rand;
    }
    return String(timestamp) + ID_CONFIG.SEPARATOR + rand;
}

/**
 * Builds a short-form ID.
 * @private
 */
function _composeShortId(prefix, rand) {
    if (prefix) {
        return prefix + ID_CONFIG.SEPARATOR + rand;
    }
    return rand;
}

// =============================================================================
// 3. CORE ID GENERATION
// =============================================================================

/**
 * Generates a long-form ID: [prefix_]timestamp_random.
 * 
 * Collision handling: retries up to 10 times with progressively longer
 * random parts if the session registry contains the ID. Falls back to
 * a 32-character random suffix if all retries collide (astronomically
 * unlikely).
 * 
 * @param {string} [prefix]
 * @param {number} [randomLength]
 * @returns {string}
 */
function generateId(prefix, randomLength) {
    var p = _normalizePrefix(prefix);
    var baseLength = _normalizeLength(randomLength, ID_CONFIG.DEFAULT_RANDOM_LENGTH);

    for (var attempt = 0; attempt < 10; attempt++) {
        var timestamp = Date.now();
        var len = Math.min(baseLength + attempt, ID_CONFIG.MAX_RANDOM_LENGTH);
        var rand = _randomString(len);
        var id = _composeId(p, timestamp, rand);

        if (!_sessionGeneratedIds.has(id)) {
            _sessionGeneratedIds.add(id);
            return id;
        }
    }

    // Pathological fallback
    var finalTimestamp = Date.now();
    var finalRand = _randomString(ID_CONFIG.MAX_RANDOM_LENGTH);
    var finalId = _composeId(p, finalTimestamp, finalRand);
    _sessionGeneratedIds.add(finalId);
    return finalId;
}

/**
 * Generates a short-form ID: [prefix_]random.
 * Has higher collision probability than generateId().
 * Use only when the ID does not need to be globally unique.
 * 
 * @param {string} [prefix]
 * @param {number} [length]
 * @returns {string}
 */
function generateShortId(prefix, length) {
    var p = _normalizePrefix(prefix);
    var baseLength = _normalizeLength(length, ID_CONFIG.SHORT_RANDOM_LENGTH);

    for (var attempt = 0; attempt < 10; attempt++) {
        var len = Math.min(baseLength + attempt, ID_CONFIG.MAX_RANDOM_LENGTH);
        var rand = _randomString(len);
        var id = _composeShortId(p, rand);

        if (!_sessionGeneratedIds.has(id)) {
            _sessionGeneratedIds.add(id);
            return id;
        }
    }

    var fallbackRand = _randomString(ID_CONFIG.MAX_RANDOM_LENGTH);
    var fallbackId = _composeShortId(p, fallbackRand);
    _sessionGeneratedIds.add(fallbackId);
    return fallbackId;
}

/**
 * Generates a long-form ID with extended random part.
 */
function generateLongId(prefix) {
    return generateId(prefix, ID_CONFIG.LONG_RANDOM_LENGTH);
}

// =============================================================================
// 4. ENTITY-SPECIFIC GENERATORS
// =============================================================================

function generateCharacterId() { return generateId(ID_PREFIXES.CHARACTER); }
function generatePlaceId() { return generateId(ID_PREFIXES.PLACE); }
function generateRankId() { return generateId(ID_PREFIXES.RANK); }
function generateRoleId() { return generateId(ID_PREFIXES.ROLE); }
function generateHouseholdId() { return generateId(ID_PREFIXES.HOUSEHOLD); }
function generateRelationshipId() { return generateId(ID_PREFIXES.RELATIONSHIP); }
function generateEventId() { return generateId(ID_PREFIXES.EVENT); }
function generateProfessionId() { return generateId(ID_PREFIXES.PROFESSION); }
function generateMoveId() { return generateId(ID_PREFIXES.MOVE); }

// =============================================================================
// 5. BATCH GENERATION
// =============================================================================

/**
 * Generates multiple IDs.
 * 
 * @param {number} count - non-negative integer
 * @param {Function} generatorFn - a no-argument generator (default generateId)
 * @returns {string[]}
 * @throws {Error} for invalid count or missing generator
 */
function generateBatchIds(count, generatorFn) {
    if (!Number.isInteger(count) || count < 0) {
        throw new Error('generateBatchIds: count must be a non-negative integer');
    }
    if (count > 10000) {
        throw new Error('generateBatchIds: count exceeds maximum (10000)');
    }
    if (count === 0) return [];

    if (generatorFn === undefined) {
        generatorFn = generateId;
    }
    if (typeof generatorFn !== 'function') {
        throw new Error('generateBatchIds: generatorFn must be a function');
    }

    var ids = [];
    for (var i = 0; i < count; i++) {
        var id = generatorFn();
        if (typeof id !== 'string' || id.length === 0) {
            throw new Error('generateBatchIds: generator produced an invalid ID at index ' + i);
        }
        ids.push(id);
    }
    return ids;
}

function generateBatchCharacterIds(count) {
    return generateBatchIds(count, generateCharacterId);
}

// =============================================================================
// 6. PARSING
// =============================================================================

/**
 * Parses a long-form ID into { prefix, timestamp, random }.
 * Returns null for malformed input.
 * 
 * Long form: [prefix_]digits_random
 * 
 * @param {string} id
 * @returns {{ prefix: string|null, timestamp: number, random: string }|null}
 */
function parseLongId(id) {
    if (typeof id !== 'string' || id.length === 0) return null;
    if (id.length > ID_CONFIG.MAX_ID_LENGTH) return null;

    var parts = id.split(ID_CONFIG.SEPARATOR);

    var prefix = null;
    var timestampStr;
    var random;

    if (parts.length === 2) {
        timestampStr = parts[0];
        random = parts[1];
    } else if (parts.length === 3) {
        prefix = parts[0];
        timestampStr = parts[1];
        random = parts[2];
        if (!_RE_PREFIX.test(prefix)) return null;
    } else {
        return null;
    }

    if (!_RE_DIGITS.test(timestampStr)) return null;
    if (!_RE_RANDOM.test(random)) return null;
    if (random.length < ID_CONFIG.MIN_RANDOM_LENGTH) return null;

    var timestamp = Number(timestampStr);
    if (!Number.isFinite(timestamp) || !Number.isInteger(timestamp)) return null;

    return { prefix: prefix, timestamp: timestamp, random: random, form: 'long' };
}

/**
 * Parses a short-form ID into { prefix, random }.
 * Returns null for malformed input.
 * 
 * Short form: [prefix_]random
 * 
 * @param {string} id
 * @returns {{ prefix: string|null, random: string, form: 'short' }|null}
 */
function parseShortId(id) {
    if (typeof id !== 'string' || id.length === 0) return null;
    if (id.length > ID_CONFIG.MAX_ID_LENGTH) return null;

    var parts = id.split(ID_CONFIG.SEPARATOR);

    var prefix = null;
    var random;

    if (parts.length === 1) {
        random = parts[0];
    } else if (parts.length === 2) {
        prefix = parts[0];
        random = parts[1];
        if (!_RE_PREFIX.test(prefix)) return null;
    } else {
        return null;
    }

    if (!_RE_RANDOM.test(random)) return null;
    if (random.length < ID_CONFIG.MIN_RANDOM_LENGTH) return null;

    return { prefix: prefix, random: random, form: 'short' };
}

/**
 * Parses any ID produced by this module (long or short form).
 * Long form takes precedence when both are possible.
 * 
 * @param {string} id
 * @returns {{ prefix: string|null, timestamp?: number, random: string, form: string }|null}
 */
function parseId(id) {
    var long = parseLongId(id);
    if (long) return long;
    var short = parseShortId(id);
    if (short) return short;
    return null;
}

function getIdTimestamp(id) {
    var parsed = parseLongId(id);
    return parsed ? parsed.timestamp : null;
}

function getIdPrefix(id) {
    var parsed = parseId(id);
    return parsed ? parsed.prefix : null;
}

function getIdForm(id) {
    var parsed = parseId(id);
    return parsed ? parsed.form : null;
}

// =============================================================================
// 7. FORMAT VALIDATION
// =============================================================================

/**
 * Returns true if the given ID matches the generated grammar.
 * Accepts both long and short forms.
 * 
 * @param {string} id
 * @param {string} [expectedPrefix]
 * @returns {boolean}
 */
function isValidId(id, expectedPrefix) {
    var parsed = parseId(id);
    if (!parsed) return false;
    if (expectedPrefix === undefined || expectedPrefix === null) return true;
    return parsed.prefix === expectedPrefix;
}

function isLongId(id) {
    return parseLongId(id) !== null;
}

function isShortId(id) {
    return parseShortId(id) !== null;
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
// 8. DEBUG / TEST NAMESPACE
// =============================================================================
// 
// These functions manipulate the session collision registry. They exist
// for tests, not for production code. They are exposed under a namespace
// so they don't look like normal ID operations.

window.IDsDebug = {
    /**
     * Clears the session collision registry.
     */
    clearSessionRegistry: function() {
        _sessionGeneratedIds.clear();
    },

    /**
     * Removes a specific ID from the session cache.
     * Useful for simulating collisions in tests.
     */
    removeFromRegistry: function(id) {
        _sessionGeneratedIds.delete(id);
    },

    /**
     * Returns the number of IDs generated in this session.
     * Diagnostic use only.
     */
    registrySize: function() {
        return _sessionGeneratedIds.size;
    }
};

// =============================================================================
// 9. EXPORTS
// =============================================================================

window.ID_PREFIXES = ID_PREFIXES;
window.ID_CONFIG = ID_CONFIG;

// Core generation
window.generateId = generateId;
window.generateShortId = generateShortId;
window.generateLongId = generateLongId;

// Entity generators
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
window.parseLongId = parseLongId;
window.parseShortId = parseShortId;
window.getIdTimestamp = getIdTimestamp;
window.getIdPrefix = getIdPrefix;
window.getIdForm = getIdForm;

// Validation
window.isValidId = isValidId;
window.isLongId = isLongId;
window.isShortId = isShortId;
window.isCharacterId = isCharacterId;
window.isPlaceId = isPlaceId;
window.isRankId = isRankId;