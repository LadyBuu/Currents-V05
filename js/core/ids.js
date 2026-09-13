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
 *   - Missing optional arguments use defaults.
 *     Invalid explicit arguments are rejected (throw or return null,
 *     depending on the function's contract).
 *     Valid arguments are preserved exactly; no clamping.
 *   - Generation and parsing agree: any ID produced by generateId() or
 *     generateShortId() can be parsed by parseId().
 *   - Prefixes are underscore-free so the ID grammar is unambiguous.
 *   - The session collision registry guarantees uniqueness WITHIN this
 *     JavaScript session for IDs produced by this module. It does NOT
 *     guarantee uniqueness against persisted data; the mutation layer
 *     must perform that check.
 *
 * GRAMMAR:
 *   Long form:  [prefix_]digits_random
 *   Short form: [prefix_]random
 *
 *   Where:
 *     prefix = [a-z][a-z0-9]*
 *     digits = [0-9]+
 *     random = [a-z0-9]+ (length in [MIN_RANDOM_LENGTH, MAX_RANDOM_LENGTH])
 *
 * DEPENDENCIES:
 *   - Application dependencies: None.
 *   - Browser APIs used: window, crypto, Uint8Array, Date, Set.
 *     The module assumes a browser-like environment. crypto is optional
 *     (falls back to Math.random); the rest are required.
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. CONSTANTS
    // =========================================================================

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

    var _RE_PREFIX = /^[a-z][a-z0-9]*$/;
    var _RE_DIGITS = /^[0-9]+$/;
    var _RE_RANDOM = /^[a-z0-9]+$/;

    // Session-scoped collision registry. Prevents duplicate IDs from being
    // generated within this JavaScript session. Does NOT enforce global
    // uniqueness against persisted data — that's the mutation layer's job.
    var _sessionGeneratedIds = new Set();

    // =========================================================================
    // 2. INTERNAL HELPERS
    // =========================================================================

    /**
     * Generates a random string of the exact requested length.
     *
     * Uses crypto.getRandomValues when available, with rejection sampling
     * to avoid modulo bias. Falls back to Math.random.
     *
     * Does NOT consume the simulation RNG stream.
     *
     * @private
     * @param {number} length - positive integer
     * @returns {string}
     */
    function _randomString(length) {
        var alphabet = ID_CONFIG.RANDOM_ALPHABET;
        var alphabetLength = alphabet.length;

        if (typeof crypto !== 'undefined'
            && typeof crypto.getRandomValues === 'function') {
            // Rejection sampling: values >= limit are discarded to avoid
            // bias from 256 % alphabetLength !== 0.
            var limit = 256 - (256 % alphabetLength);
            var result = '';
            var remaining = length;

            while (remaining > 0) {
                var bytes = new Uint8Array(remaining);
                crypto.getRandomValues(bytes);
                for (var i = 0; i < bytes.length && remaining > 0; i++) {
                    if (bytes[i] >= limit) continue;
                    result += alphabet[bytes[i] % alphabetLength];
                    remaining--;
                }
            }
            return result;
        }

        var fallback = '';
        for (var j = 0; j < length; j++) {
            fallback += alphabet[Math.floor(Math.random() * alphabetLength)];
        }
        return fallback;
    }

    /**
     * Validates and returns a prefix, or null if invalid.
     * Undefined/null input is treated as "no prefix" and returns null as
     * well; callers must distinguish the two cases themselves before
     * calling this.
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
     * Builds a long-form ID string.
     * @private
     */
    function _composeId(prefix, timestamp, rand) {
        if (prefix) {
            return prefix + ID_CONFIG.SEPARATOR + timestamp + ID_CONFIG.SEPARATOR + rand;
        }
        return String(timestamp) + ID_CONFIG.SEPARATOR + rand;
    }

    /**
     * Builds a short-form ID string.
     * @private
     */
    function _composeShortId(prefix, rand) {
        if (prefix) {
            return prefix + ID_CONFIG.SEPARATOR + rand;
        }
        return rand;
    }

    /**
     * Validates the optional `prefix` argument.
     * Returns:
     *   { valid: true, prefix: string|null }
     *   { valid: false }
     * @private
     */
    function _checkPrefixArgument(prefix) {
        if (prefix === undefined || prefix === null) {
            return { valid: true, prefix: null };
        }
        var normalized = _normalizePrefix(prefix);
        if (normalized === null) return { valid: false };
        return { valid: true, prefix: normalized };
    }

    /**
     * Validates the optional `randomLength` argument against the
     * configured range. Missing → default. Explicit and out-of-range
     * is invalid; it is NOT clamped.
     * Returns:
     *   { valid: true, length: number }
     *   { valid: false }
     * @private
     */
    function _checkLengthArgument(randomLength, defaultLength) {
        if (randomLength === undefined || randomLength === null) {
            return { valid: true, length: defaultLength };
        }
        if (!Number.isInteger(randomLength)) return { valid: false };
        if (randomLength < ID_CONFIG.MIN_RANDOM_LENGTH) return { valid: false };
        if (randomLength > ID_CONFIG.MAX_RANDOM_LENGTH) return { valid: false };
        return { valid: true, length: randomLength };
    }

    // =========================================================================
    // 3. CORE ID GENERATION
    // =========================================================================

    /**
     * Generates a long-form ID: [prefix_]timestamp_random.
     *
     * Missing prefix → no prefix. Invalid prefix → null.
     * Missing randomLength → DEFAULT_RANDOM_LENGTH.
     * Invalid randomLength (non-integer or out of range) → null.
     *
     * Collision handling within the session: retries with the same
     * length until a unique ID is produced. The retry loop is unbounded
     * because the alphabet at MIN_RANDOM_LENGTH (4) yields over 1.6M
     * possible suffixes per millisecond, and at the default (8) yields
     * 2.8 trillion — a session would exhaust its own registry size long
     * before the entropy source collides meaningfully.
     *
     * @param {string} [prefix]
     * @param {number} [randomLength]
     * @returns {string|null}
     */
    function generateId(prefix, randomLength) {
        var prefixCheck = _checkPrefixArgument(prefix);
        if (!prefixCheck.valid) return null;

        var lengthCheck = _checkLengthArgument(randomLength, ID_CONFIG.DEFAULT_RANDOM_LENGTH);
        if (!lengthCheck.valid) return null;

        var p = prefixCheck.prefix;
        var len = lengthCheck.length;

        for (;;) {
            var timestamp = Date.now();
            var rand = _randomString(len);
            var id = _composeId(p, timestamp, rand);

            if (!_sessionGeneratedIds.has(id)) {
                _sessionGeneratedIds.add(id);
                return id;
            }
        }
    }

    /**
     * Generates a short-form ID: [prefix_]random.
     *
     * Has higher collision probability than generateId(). Use only when
     * the ID does not need to be globally unique, or when an independent
     * uniqueness check will follow (e.g. mutation-layer insertion).
     *
     * Missing prefix → no prefix. Invalid prefix → null.
     * Missing length → SHORT_RANDOM_LENGTH.
     * Invalid length → null.
     *
     * @param {string} [prefix]
     * @param {number} [length]
     * @returns {string|null}
     */
    function generateShortId(prefix, length) {
        var prefixCheck = _checkPrefixArgument(prefix);
        if (!prefixCheck.valid) return null;

        var lengthCheck = _checkLengthArgument(length, ID_CONFIG.SHORT_RANDOM_LENGTH);
        if (!lengthCheck.valid) return null;

        var p = prefixCheck.prefix;
        var len = lengthCheck.length;

        for (;;) {
            var rand = _randomString(len);
            var id = _composeShortId(p, rand);

            if (!_sessionGeneratedIds.has(id)) {
                _sessionGeneratedIds.add(id);
                return id;
            }
        }
    }

    /**
     * Generates a long-form ID with extended random part.
     */
    function generateLongId(prefix) {
        return generateId(prefix, ID_CONFIG.LONG_RANDOM_LENGTH);
    }

    // =========================================================================
    // 4. ENTITY-SPECIFIC GENERATORS
    // =========================================================================
    //
    // Dedicated generators exist only for entity types that are created
    // through first-class mutation operations. Additional prefix
    // constants (LOCATION_TYPE, DISASTER, RANK_ASSIGNMENT, etc.) are
    // used inline by their owning modules via generateId(prefix) rather
    // than through named convenience functions, because those record
    // kinds are created infrequently and uniformly.

    function generateCharacterId() { return generateId(ID_PREFIXES.CHARACTER); }
    function generatePlaceId() { return generateId(ID_PREFIXES.PLACE); }
    function generateRankId() { return generateId(ID_PREFIXES.RANK); }
    function generateRoleId() { return generateId(ID_PREFIXES.ROLE); }
    function generateHouseholdId() { return generateId(ID_PREFIXES.HOUSEHOLD); }
    function generateRelationshipId() { return generateId(ID_PREFIXES.RELATIONSHIP); }
    function generateEventId() { return generateId(ID_PREFIXES.EVENT); }
    function generateProfessionId() { return generateId(ID_PREFIXES.PROFESSION); }
    function generateMoveId() { return generateId(ID_PREFIXES.MOVE); }

    // =========================================================================
    // 5. BATCH GENERATION
    // =========================================================================

    /**
     * Generates multiple IDs.
     *
     * Throws on invalid count or missing generator, or if the generator
     * produces an invalid ID — this is an operational API and partial
     * results would be worse than an exception.
     *
     * @param {number} count - non-negative integer
     * @param {Function} [generatorFn] - a no-argument generator
     * @returns {string[]}
     * @throws {Error}
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
                throw new Error(
                    'generateBatchIds: generator produced an invalid ID at index ' + i
                );
            }
            ids.push(id);
        }
        return ids;
    }

    function generateBatchCharacterIds(count) {
        return generateBatchIds(count, generateCharacterId);
    }

    // =========================================================================
    // 6. PARSING
    // =========================================================================

    /**
     * Parses a long-form ID into { prefix, timestamp, random }.
     * Returns null for malformed input.
     *
     * The timestamp component is validated with Number.isSafeInteger to
     * reject syntactically valid but unrepresentable values. Note that
     * this is a SYNTAX parser: it reports the numeric component encoded
     * in the ID, not whether the ID was actually produced by Date.now().
     * getIdTimestamp() carries the same caveat.
     *
     * @param {string} id
     * @returns {{ prefix: string|null, timestamp: number, random: string, form: 'long' }|null}
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
        if (!Number.isSafeInteger(timestamp)) return null;

        return { prefix: prefix, timestamp: timestamp, random: random, form: 'long' };
    }

    /**
     * Parses a short-form ID into { prefix, random }.
     * Returns null for malformed input.
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

    // =========================================================================
    // 7. FORMAT VALIDATION
    // =========================================================================

    /**
     * Returns true if the given ID matches the generated grammar.
     * Accepts both long and short forms.
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

    // =========================================================================
    // 8. DEBUG / TEST NAMESPACE
    // =========================================================================
    //
    // These functions manipulate the session collision registry. They
    // exist for tests, not for production code. They are exposed under a
    // namespace so they don't look like normal ID operations.

    var _debug = {
        clearSessionRegistry: function() {
            _sessionGeneratedIds.clear();
        },
        removeFromRegistry: function(id) {
            _sessionGeneratedIds.delete(id);
        },
        registrySize: function() {
            return _sessionGeneratedIds.size;
        }
    };

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

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

    // Debug / test namespace
    window.IDsDebug = _debug;

})();