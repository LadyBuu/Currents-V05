/**
 * =============================================================================
 * STILL WATERS - NAME QUERIES (name-queries.js)
 * =============================================================================
 *
 * LOCATION: js/modules/names/name-queries.js
 *
 * SCOPE:
 *   - Retrieval of name lists, ancestor data, and surname history
 *   - Random name and surname selection
 *   - Country surname rule retrieval
 *   - Delegation of country resolution to world.js
 *
 * OUT OF SCOPE:
 *   - Rule application (family/patronymic/chain generation) → name-rules.js
 *   - Mutations (recording surname changes, adding names) → name-commands.js
 *   - Persisted data ownership → storage.js / storage-schema.js
 *   - Character / location / kingdom semantics → their domain modules
 *   - Presentation → modals / UI
 *   - Caching of random results (we don't cache randomness)
 *
 * SEMANTIC RULES:
 *   - Missing/invalid input returns null (singular) or [] (collection).
 *   - Invalid explicit query arguments throw.
 *   - Random selection uses randomness.js. No direct Math.random.
 *   - Random results are NOT cached. Caching a random result turns
 *     "pick a random name" into "return the same name every time" until
 *     invalidation.
 *   - Surname history reads do not mutate. Missing history returns null
 *     from the canonical query; empty-string semantics are the caller's
 *     concern.
 *   - This module is read-only. It does not call saveMasterData, does not
 *     emit events, and does not mutate character or place records.
 *   - No `_processingQuery` guard. Queries are reentrant. Genuine graph
 *     traversal uses a local visited Set (see getAncestorChain).
 *
 * RANDOMNESS CONTRACT:
 *   `getRandomName` and `getRandomSurname` consume the canonical RNG
 *   stream. They are deterministic given a fixed seed and a fixed call
 *   sequence. Callers who need a stable generated name should call once
 *   and store the result; callers who need reproducibility should set
 *   the seed via randomness.js.
 *
 * COUNTRY RESOLUTION:
 *   Country resolution is delegated to world.js:
 *     - getCharacterCountryId(characterId)
 *     - getCountryIdForPlace(placeId)
 *     - getCountryPlaces()
 *   This module does not walk the place hierarchy itself. There is one
 *   canonical definition of "what country is this place/character in",
 *   owned by world.js.
 *
 * DEPENDENCIES (REQUIRED):
 *   - accessors.js:  getNameLists, getCharacterById, getPlaceById
 *   - randomness.js: pickRandom
 *   - world.js:      getCharacterCountryId, getCountryIdForPlace
 *   - NameState:     getSurnameHistory (read-only cache), _getCache/_setCache
 *
 * DEPENDENCIES (OPTIONAL):
 *   - None. Every reference to another domain is through a canonical
 *     accessor or a public query in world.js.
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
        var requiredFns = [
            'getNameLists',
            'getCharacterById',
            'getPlaceById',
            'pickRandom',
            'getCharacterCountryId',
            'getCountryIdForPlace'
        ];
        var missing = [];
        for (var i = 0; i < requiredFns.length; i++) {
            if (typeof window[requiredFns[i]] !== 'function') {
                missing.push(requiredFns[i]);
            }
        }
        if (typeof window.NameState === 'undefined') {
            missing.push('NameState');
        }
        if (missing.length > 0) {
            throw new Error(
                'name-queries.js: missing required dependencies: ' +
                missing.join(', ')
            );
        }
    }

    _requireDependencies();

    // =========================================================================
    // 1. INTERNAL HELPERS
    // =========================================================================

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _isPlainObject(v) {
        if (v === null || typeof v !== 'object') return false;
        var proto = Object.getPrototypeOf(v);
        return proto === Object.prototype || proto === null;
    }

    function _isValidGenderForLookup(gender) {
        return gender === 'male' || gender === 'female' || gender === 'all';
    }

    function _isValidAncestorType(type) {
        return type === 'father'
            || type === 'mother'
            || type === 'paternal_grandfather'
            || type === 'paternal_grandmother'
            || type === 'maternal_grandfather'
            || type === 'maternal_grandmother';
    }

    // =========================================================================
    // 2. NAME LIST RETRIEVAL
    // =========================================================================

    /**
     * Returns the full name-list map, keyed by place ID.
     * The returned object is the canonical persisted map; callers must
     * treat it as read-only.
     *
     * Missing map returns {}.
     */
    function getNameLists() {
        var lists = window.getNameLists();
        return _isPlainObject(lists) ? lists : {};
    }

    /**
     * Returns the name list for a place ID, or null.
     *
     * A place with no configured list returns null (not a synthesized
     * empty list). Callers who need "empty when missing" should do that
     * mapping themselves.
     *
     * @param {string} countryId
     * @returns {{ male?: string[], female?: string[], surnames?: string[], rules?: Object }|null}
     */
    function getNameList(countryId) {
        if (!_hasId(countryId)) return null;
        var lists = getNameLists();
        var list = lists[countryId];
        return _isPlainObject(list) ? list : null;
    }

    /**
     * Returns the list of place IDs that have a configured name list.
     */
    function getCountryIdsWithNameLists() {
        var lists = getNameLists();
        return Object.keys(lists).filter(function(id) {
            return _isPlainObject(lists[id]);
        });
    }

    // =========================================================================
    // 3. RANDOM NAME AND SURNAME SELECTION
    // =========================================================================
    //
    // These consume the canonical RNG stream. They do not cache results.
    //
    // If the caller supplies a countryId that has no eligible names, the
    // function returns null. It does not silently select from another
    // country, and it does not fall back to a generic pool. Silent
    // fallback countries would produce a name from the wrong culture.

    /**
     * Picks a random given name from a country's name list.
     *
     * @param {string} countryId
     * @param {string} [gender] - 'male' | 'female' | 'all' (default 'all')
     * @returns {string|null}
     * @throws {Error} for invalid countryId or unknown gender
     */
    function getRandomName(countryId, gender) {
        if (!_hasId(countryId)) {
            throw new Error('getRandomName: countryId must be a non-empty string');
        }
        if (_isMissing(gender)) {
            gender = 'all';
        } else if (!_isValidGenderForLookup(gender)) {
            throw new Error(
                "getRandomName: gender must be 'male', 'female', or 'all'"
            );
        }

        var list = getNameList(countryId);
        if (!list) return null;

        var pool;
        if (gender === 'male') {
            pool = Array.isArray(list.male) ? list.male : [];
        } else if (gender === 'female') {
            pool = Array.isArray(list.female) ? list.female : [];
        } else {
            var malePool = Array.isArray(list.male) ? list.male : [];
            var femalePool = Array.isArray(list.female) ? list.female : [];
            pool = malePool.concat(femalePool);
        }

        if (pool.length === 0) return null;
        var chosen = window.pickRandom(pool);
        return typeof chosen === 'string' ? chosen : null;
    }

    /**
     * Picks a random surname from a country's name list.
     *
     * @param {string} countryId
     * @returns {string|null}
     * @throws {Error} for invalid countryId
     */
    function getRandomSurname(countryId) {
        if (!_hasId(countryId)) {
            throw new Error('getRandomSurname: countryId must be a non-empty string');
        }
        var list = getNameList(countryId);
        if (!list) return null;

        var pool = Array.isArray(list.surnames) ? list.surnames : [];
        if (pool.length === 0) return null;

        var chosen = window.pickRandom(pool);
        return typeof chosen === 'string' ? chosen : null;
    }

    // =========================================================================
    // 4. ANCESTOR DATA
    // =========================================================================

    /**
     * Returns the ancestor record for a given ancestor type, or null.
     *
     * The supported types are the six canonical slots:
     *   father, mother,
     *   paternal_grandfather, paternal_grandmother,
     *   maternal_grandfather, maternal_grandmother
     *
     * @param {Object} character
     * @param {string} type
     * @returns {{ id: string, firstName: string, surname: string }|null}
     */
    function getAncestorData(character, type) {
        if (!character || !_hasId(character.id)) return null;
        if (!_isValidAncestorType(type)) return null;

        var ancestor = null;

        if (type === 'father') {
            if (_hasId(character.fatherId)) {
                ancestor = window.getCharacterById(character.fatherId);
            }
        } else if (type === 'mother') {
            if (_hasId(character.motherId)) {
                ancestor = window.getCharacterById(character.motherId);
            }
        } else {
            // Grandparent slot. Resolve via the appropriate parent.
            var parentSlotId = type.indexOf('paternal_') === 0
                ? character.fatherId
                : character.motherId;
            if (_hasId(parentSlotId)) {
                var parent = window.getCharacterById(parentSlotId);
                if (parent) {
                    var grandparentField = type.indexOf('_grandfather') !== -1
                        ? 'fatherId'
                        : 'motherId';
                    var grandparentId = parent[grandparentField];
                    if (_hasId(grandparentId)) {
                        ancestor = window.getCharacterById(grandparentId);
                    }
                }
            }
        }

        if (!ancestor) return null;
        if (!_hasId(ancestor.id)) return null;

        return {
            id: ancestor.id,
            firstName: _getBaseFirstName(ancestor),
            surname: typeof ancestor.surname === 'string' ? ancestor.surname : ''
        };
    }

    /**
     * Extracts the "base" first name from a character: the given name
     * with any trailing epithet or "of Place" suffix stripped.
     *
     * This is exposed for use by NameRules and legacy callers.
     */
    function _getBaseFirstName(character) {
        if (!character) return '';
        var name = typeof character.name === 'string' ? character.name : '';
        if (name.length === 0) return '';
        name = name.replace(/\s+the\s+\S+$/, '');
        name = name.replace(/\s+of\s+\S+$/, '');
        return name.trim();
    }

    /**
     * Returns an array of ancestor names by walking up the graph.
     *
     * @param {Object} character - the starting character
     * @param {string[]} order - ordered list of ancestor types to visit
     * @param {number} depth - maximum number of ancestor generations
     * @param {string} source - 'firstname' | 'surname'
     * @returns {string[]} resolved names, in order, deduplicated
     *
     * @throws {Error} for invalid arguments
     */
    function getAncestorNames(character, order, depth, source) {
        if (!character || !_hasId(character.id)) return [];
        if (!Array.isArray(order)) {
            throw new Error('getAncestorNames: order must be an array');
        }
        if (order.length === 0) return [];
        for (var oi = 0; oi < order.length; oi++) {
            if (!_isValidAncestorType(order[oi])) {
                throw new Error(
                    'getAncestorNames: unknown ancestor type "' + order[oi] + '"'
                );
            }
        }
        if (typeof depth !== 'number' || !Number.isInteger(depth) || depth < 1) {
            throw new Error('getAncestorNames: depth must be a positive integer');
        }
        if (source !== 'firstname' && source !== 'surname') {
            throw new Error(
                "getAncestorNames: source must be 'firstname' or 'surname'"
            );
        }

        var results = [];
        var visited = new Set();
        var current = character;

        for (var i = 0; i < order.length && results.length < depth; i++) {
            var type = order[i];
            var data = getAncestorData(current, type);
            if (!data) break;
            if (visited.has(data.id)) continue;
            visited.add(data.id);

            var value = source === 'firstname' ? data.firstName : data.surname;
            if (typeof value === 'string' && value.length > 0) {
                results.push(value);
            }

            // Advance current so subsequent slots (e.g. grandfather after
            // father) resolve correctly relative to the resolved ancestor.
            current = window.getCharacterById(data.id);
            if (!current) break;
        }

        return results;
    }

    // =========================================================================
    // 5. SURNAME HISTORY
    // =========================================================================
    //
    // The canonical owner of surname history is the character record. This
    // module reads it, optionally through the NameState cache, and does not
    // mutate it.

    /**
     * Returns the surname history object for a character, or null.
     * The object shape is { birthSurname, entries, lastUpdated }.
     */
    function getSurnameHistory(characterId) {
        if (!_hasId(characterId)) return null;

        // Prefer NameState's cache if available.
        if (typeof window.NameState.getSurnameHistory === 'function') {
            var cached = window.NameState.getSurnameHistory(characterId);
            if (cached) return cached;
        }

        // Fall back to the character record.
        var character = window.getCharacterById(characterId);
        if (!character) return null;
        if (!_isPlainObject(character.surnameHistory)) return null;
        return character.surnameHistory;
    }

    /**
     * Returns the birth surname of a character, or null when no history
     * exists. Distinguishes "missing history" (null) from "empty surname"
     * ('').
     */
    function getBirthSurname(characterId) {
        var history = getSurnameHistory(characterId);
        if (!history) return null;
        return typeof history.birthSurname === 'string' ? history.birthSurname : '';
    }

    /**
     * Returns the character's current surname, or null when the character
     * does not exist. Empty string is a legitimate value (a character may
     * have no surname).
     */
    function getCurrentSurname(characterId) {
        if (!_hasId(characterId)) return null;
        var character = window.getCharacterById(characterId);
        if (!character) return null;
        return typeof character.surname === 'string' ? character.surname : '';
    }

    /**
     * Returns the array of surname-change entries, or [].
     * Missing history returns [].
     */
    function getSurnameChanges(characterId) {
        var history = getSurnameHistory(characterId);
        if (!history) return [];
        return Array.isArray(history.entries) ? history.entries : [];
    }

    /**
     * Returns the number of recorded surname changes.
     */
    function getSurnameChangeCount(characterId) {
        return getSurnameChanges(characterId).length;
    }

    // =========================================================================
    // 6. COUNTRY RULES AND RESOLUTION
    // =========================================================================
    //
    // Country resolution is delegated to world.js. This module does not
    // walk the place hierarchy.

    /**
     * Returns the surname rules configured for a country, or null.
     */
    function getCountrySurnameRules(countryId) {
        if (!_hasId(countryId)) return null;
        var list = getNameList(countryId);
        if (!list) return null;
        return _isPlainObject(list.rules) ? list.rules : null;
    }

    /**
     * Resolves the country ID for a character.
     * Delegates to world.js; this is a thin wrapper kept for name-module
     * callers who reach for a name-domain function.
     */
    function getCharacterCountryId(characterId) {
        if (!_hasId(characterId)) return null;
        return window.getCharacterCountryId(characterId);
    }

    /**
     * Resolves the country ID for a place ID.
     * Delegates to world.js.
     */
    function getCountryIdForPlace(placeId) {
        if (!_hasId(placeId)) return null;
        return window.getCountryIdForPlace(placeId);
    }

    // =========================================================================
    // 7. EXPORTS
    // =========================================================================

    window.NameQueries = {
        // Name lists
        getNameLists: getNameLists,
        getNameList: getNameList,
        getCountryIdsWithNameLists: getCountryIdsWithNameLists,

        // Random selection
        getRandomName: getRandomName,
        getRandomSurname: getRandomSurname,

        // Ancestors
        getAncestorData: getAncestorData,
        getAncestorNames: getAncestorNames,

        // Surname history
        getSurnameHistory: getSurnameHistory,
        getBirthSurname: getBirthSurname,
        getCurrentSurname: getCurrentSurname,
        getSurnameChanges: getSurnameChanges,
        getSurnameChangeCount: getSurnameChangeCount,

        // Country
        getCountrySurnameRules: getCountrySurnameRules,
        getCharacterCountryId: getCharacterCountryId,
        getCountryIdForPlace: getCountryIdForPlace,

        // Helper (exposed because the legacy wrapper and NameRules both
        // need the same base-name extraction, and it is a pure function)
        getBaseFirstName: _getBaseFirstName
    };

})();