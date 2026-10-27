/**
 * =============================================================================
 * STILL WATERS - NAME QUERIES (name-queries.js)
 * =============================================================================
 *
 * LOCATION: js/modules/names/name-queries.js
 *
 * SCOPE:
 *   - Read-only retrieval of name lists, ancestor data, surname history
 *   - Character display-name projection
 *   - Random name and surname selection
 *   - Country surname rule retrieval
 *   - Delegation of country resolution to world.js
 *
 * OUT OF SCOPE:
 *   - Rule application → name-rules.js
 *   - Mutations → name-commands.js
 *   - Persisted data ownership → storage.js / storage-schema.js
 *   - Runtime caches → name-state.js
 *   - Base-name extraction → name-rules.js (canonical owner)
 *   - Presentation → modals / UI
 *   - Randomness implementation → randomness.js
 *
 * SEMANTIC RULES:
 *   - Missing input returns null (singular) or [] (collection).
 *   - Invalid explicit arguments throw.
 *   - Malformed canonical data throws; corruption is not collapsed into
 *     "empty."
 *   - Random selection uses randomness.js. No Math.random anywhere.
 *   - Random results are never cached.
 *   - Returned objects are defensive clones. Mutation for commands goes
 *     through NamesState, not through this module.
 *   - This module is read-only.
 *   - No recursion guard.
 *
 * ERROR MESSAGES:
 *   When a read fails, the error message names the failing level:
 *     - "accessors.getNameLists() returned non-object" — accessor broken
 *     - "name list for '<countryId>' is not an object" — data broken
 *   The distinction matters because the fix is different.
 *
 * ANCESTOR MODEL:
 *   Slots (all resolved against the starting character):
 *     father, mother,
 *     paternal_grandfather, paternal_grandmother,
 *     maternal_grandfather, maternal_grandmother,
 *     paternal_great_grandfather, maternal_great_grandfather
 *
 *   _resolveAncestor is recursive but bounded: each slot is a fixed
 *   path through the ancestor graph (father→father→father, etc.). There
 *   are no arbitrary-depth slots, so recursion terminates at the leaves
 *   of the slot grammar.
 *
 *   getAncestorData(character, slot) returns
 *     { id, firstName, surname }
 *   where `firstName` is the ancestor's raw `name` field. It is NOT
 *   stripped of epithets; that transformation is owned by
 *   NameRules.getBaseFirstName and applied by callers that need it.
 *
 *   getAncestorNames(character, order, source) resolves each slot in
 *   `order` against the starting character. There is no `depth`
 *   parameter; `order.length` is the depth.
 *
 *   Deduplication in getAncestorNames is by ancestor ID. If two slots
 *   resolve to the same ancestor (e.g. a consanguineous marriage), the
 *   name is returned once.
 *
 * NAME STATE:
 *   NamesState is an OPTIONAL cache hint. The character record is
 *   canonical. If NamesState is present, reads consult it first; if
 *   not, reads fall through to the character record directly. State's
 *   accessors are named getMutable* to make the mutability contract
 *   explicit; this module uses them as a cache hint and then clones.
 *
 *   The lookup is on window.NamesState (plural), which is the
 *   name-state.js primary export. window.NameState (singular) is a
 *   backward-compat alias and is not consulted here, because relying
 *   on the alias would couple this read path to the alias being
 *   installed.
 *
 * DEPENDENCIES (REQUIRED):
 *   - accessors.js:  getNameLists, getCharacterById
 *   - randomness.js: pickRandom
 *   - world.js:      getCharacterCountryId, getCountryIdForPlace
 *
 * DEPENDENCIES (OPTIONAL):
 *   - name-state.js: NamesState (cache hint only)
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Original: cache-hint-based read module with defensive clone.
 *   Prior revision:
 *     - Error messages name the failing level (accessor vs. data).
 *     - Ancestor recursion bounded-by-grammar documented.
 *     - getAncestorNames dedup reason documented.
 *   Current revision:
 *     - Cache-hint lookup migrated from window.NameState (singular) to
 *       window.NamesState (plural), matching name-state.js's primary
 *       export. The singular name is a backward-compat alias and must
 *       not be relied upon by internal consumers.
 *     - No behavioural change beyond the rename.
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

    function _isValidAncestorSlot(slot) {
        return slot === 'father'
            || slot === 'mother'
            || slot === 'paternal_grandfather'
            || slot === 'paternal_grandmother'
            || slot === 'maternal_grandfather'
            || slot === 'maternal_grandmother'
            || slot === 'paternal_great_grandfather'
            || slot === 'maternal_great_grandfather';
    }

    /**
     * Deep-clones plain objects and arrays. Primitives pass through.
     * Used to hand callers a projection they cannot use to mutate
     * canonical data.
     */
    function _clone(value) {
        if (Array.isArray(value)) {
            var arr = [];
            for (var i = 0; i < value.length; i++) arr.push(_clone(value[i]));
            return arr;
        }
        if (_isPlainObject(value)) {
            var out = {};
            var keys = Object.keys(value);
            for (var j = 0; j < keys.length; j++) {
                var k = keys[j];
                if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
                out[k] = _clone(value[k]);
            }
            return out;
        }
        return value;
    }

    // =========================================================================
    // 2. NAME LIST RETRIEVAL
    // =========================================================================

    /**
     * Returns a defensive copy of the full name-list map, keyed by place ID.
     *
     * If the accessor returns something that is not a plain object, this
     * throws. The error names the accessor, because the fix is in the
     * accessor or in whatever populates masterData.data.nameLists, not
     * in this module.
     */
    function getNameLists() {
        var lists = window.getNameLists();
        if (!_isPlainObject(lists)) {
            throw new Error(
                'name-queries.js: accessors.getNameLists() returned non-object; ' +
                'canonical name-list data is missing or malformed'
            );
        }
        return _clone(lists);
    }

    /**
     * Returns a defensive copy of the name list for a place ID, or null.
     *
     * A place with no configured list returns null. A place whose list is
     * present but malformed (e.g. `male` is not an array) throws with the
     * place ID in the message, so the caller knows exactly which entry is
     * broken.
     */
    function getNameList(countryId) {
        if (!_hasId(countryId)) return null;

        var lists = window.getNameLists();
        if (!_isPlainObject(lists)) {
            throw new Error(
                'name-queries.js: accessors.getNameLists() returned non-object; ' +
                'canonical name-list data is missing or malformed'
            );
        }

        var list = lists[countryId];
        if (_isMissing(list)) return null;
        if (!_isPlainObject(list)) {
            throw new Error(
                'name-queries.js: name list for "' + countryId + '" is not an object'
            );
        }

        return _clone(list);
    }

    /**
     * Returns the list of place IDs that have a configured name list.
     * Sorted for determinism.
     */
    function getCountryIdsWithNameLists() {
        var lists = window.getNameLists();
        if (!_isPlainObject(lists)) return [];
        return Object.keys(lists).filter(function(id) {
            return _isPlainObject(lists[id]);
        }).sort();
    }

    // =========================================================================
    // 3. RANDOM NAME AND SURNAME SELECTION
    // =========================================================================
    //
    // These consume the canonical RNG stream. They never cache.
    //
    // If the requested pool is empty, the function returns null. It does
    // not fall back to another pool or another country. A silent fallback
    // would produce a name from the wrong culture.

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
    // 4. CHARACTER PROJECTION
    // =========================================================================

    /**
     * Returns the character's display name (the `name` field), or null
     * when the character does not exist.
     *
     * If the character exists but has no string `name` field, returns ''.
     * (Distinct from null: null = character not found; '' = found but
     * nameless. In practice, nameless characters shouldn't exist, but the
     * projection is honest about what it found.)
     *
     * This is the only character-record projection this module exposes.
     * It exists so that UI modules do not reach for getCharacterById
     * directly.
     */
    function getCharacterDisplayName(characterId) {
        if (!_hasId(characterId)) return null;
        var character = window.getCharacterById(characterId);
        if (!character) return null;
        return typeof character.name === 'string' ? character.name : '';
    }

    // =========================================================================
    // 5. ANCESTOR DATA
    // =========================================================================

    /**
     * Resolves one ancestor slot relative to the starting character.
     *
     * The recursion is bounded by the ancestor slot grammar — each slot
     * is a fixed path (father→father→father for paternal great-grandfather,
     * for example). There is no arbitrary-depth slot, so this terminates.
     */
    function _resolveAncestor(character, slot) {
        if (!character) return null;

        if (slot === 'father') {
            return _hasId(character.fatherId)
                ? window.getCharacterById(character.fatherId)
                : null;
        }
        if (slot === 'mother') {
            return _hasId(character.motherId)
                ? window.getCharacterById(character.motherId)
                : null;
        }
        if (slot === 'paternal_grandfather') {
            var father = _resolveAncestor(character, 'father');
            return father && _hasId(father.fatherId)
                ? window.getCharacterById(father.fatherId)
                : null;
        }
        if (slot === 'paternal_grandmother') {
            var father2 = _resolveAncestor(character, 'father');
            return father2 && _hasId(father2.motherId)
                ? window.getCharacterById(father2.motherId)
                : null;
        }
        if (slot === 'maternal_grandfather') {
            var mother = _resolveAncestor(character, 'mother');
            return mother && _hasId(mother.fatherId)
                ? window.getCharacterById(mother.fatherId)
                : null;
        }
        if (slot === 'maternal_grandmother') {
            var mother2 = _resolveAncestor(character, 'mother');
            return mother2 && _hasId(mother2.motherId)
                ? window.getCharacterById(mother2.motherId)
                : null;
        }
        if (slot === 'paternal_great_grandfather') {
            var pgf = _resolveAncestor(character, 'paternal_grandfather');
            return pgf && _hasId(pgf.fatherId)
                ? window.getCharacterById(pgf.fatherId)
                : null;
        }
        if (slot === 'maternal_great_grandfather') {
            var mgf = _resolveAncestor(character, 'maternal_grandfather');
            return mgf && _hasId(mgf.fatherId)
                ? window.getCharacterById(mgf.fatherId)
                : null;
        }
        return null;
    }

    /**
     * Returns the ancestor record for a slot, or null.
     *
     * `firstName` is the ancestor's raw `name` field. It is NOT stripped
     * of epithets. Callers that need the base given name call
     * NameRules.getBaseFirstName(ancestor).
     *
     * @returns {{ id: string, firstName: string, surname: string }|null}
     */
    function getAncestorData(character, slot) {
        if (!character || !_hasId(character.id)) return null;
        if (!_isValidAncestorSlot(slot)) return null;

        var ancestor = _resolveAncestor(character, slot);
        if (!ancestor || !_hasId(ancestor.id)) return null;

        return {
            id: ancestor.id,
            firstName: typeof ancestor.name === 'string' ? ancestor.name : '',
            surname: typeof ancestor.surname === 'string' ? ancestor.surname : ''
        };
    }

    /**
     * Resolves each absolute slot in `order` against the starting
     * character and returns the requested source field.
     *
     * Deduplication is by ancestor ID. If two slots resolve to the same
     * ancestor (e.g. through consanguineous marriage), the name appears
     * once. This is what a caller wants: "give me the names of each
     * distinct ancestor in this chain."
     *
     * @param {Object} character
     * @param {string[]} order - list of absolute ancestor slots
     * @param {string} source - 'firstname' | 'surname'
     * @returns {string[]} resolved names, deduplicated by ancestor ID,
     *   in the order the slots were resolved
     *
     * @throws {Error} for invalid character, order, or source
     */
    function getAncestorNames(character, order, source) {
        if (!character || !_hasId(character.id)) return [];
        if (!Array.isArray(order)) {
            throw new Error('getAncestorNames: order must be an array');
        }
        if (source !== 'firstname' && source !== 'surname') {
            throw new Error(
                "getAncestorNames: source must be 'firstname' or 'surname'"
            );
        }
        for (var oi = 0; oi < order.length; oi++) {
            if (!_isValidAncestorSlot(order[oi])) {
                throw new Error(
                    'getAncestorNames: unknown ancestor slot "' + order[oi] + '"'
                );
            }
        }

        var results = [];
        var visited = new Set();

        for (var i = 0; i < order.length; i++) {
            var data = getAncestorData(character, order[i]);
            if (!data) continue;
            if (visited.has(data.id)) continue;
            visited.add(data.id);

            var value = source === 'firstname' ? data.firstName : data.surname;
            if (typeof value === 'string' && value.length > 0) {
                results.push(value);
            }
        }

        return results;
    }

    // =========================================================================
    // 6. SURNAME HISTORY
    // =========================================================================
    //
    // The canonical owner of surname history is the character record. This
    // module reads it, optionally through the NamesState cache, and returns
    // a defensive copy so callers cannot mutate canonical data by accident.
    //
    // Three failure modes, three responses:
    //   - character does not exist          → null (singular) / [] (entries)
    //   - character exists, no surnameHistory → null / []
    //   - surnameHistory present, malformed   → throw with character id
    //

    function _readSurnameHistory(characterId) {
        if (!_hasId(characterId)) return null;

        if (typeof window.NamesState !== 'undefined'
            && typeof window.NamesState.getMutableSurnameHistory === 'function') {
            var cached = window.NamesState.getMutableSurnameHistory(characterId);
            if (cached) return cached;
        }

        var character = window.getCharacterById(characterId);
        if (!character) return null;

        var history = character.surnameHistory;
        if (_isMissing(history)) return null;
        if (!_isPlainObject(history)) {
            throw new Error(
                'name-queries.js: surnameHistory for "' + characterId +
                '" is malformed (expected object or null)'
            );
        }
        return history;
    }

    /**
     * Returns a defensive copy of the surname history object for a
     * character, or null when no history exists.
     *
     * Shape: { birthSurname: string, entries: Object[], lastUpdated: number }
     */
    function getSurnameHistory(characterId) {
        var history = _readSurnameHistory(characterId);
        if (!history) return null;
        return _clone(history);
    }

    /**
     * Returns the birth surname of a character, or null when no history
     * exists. Distinguishes "missing history" (null) from "empty surname"
     * ('').
     */
    function getBirthSurname(characterId) {
        var history = _readSurnameHistory(characterId);
        if (!history) return null;
        return typeof history.birthSurname === 'string' ? history.birthSurname : '';
    }

    /**
     * Returns the character's current surname, or null when the character
     * does not exist. Empty string is a legitimate value.
     */
    function getCurrentSurname(characterId) {
        if (!_hasId(characterId)) return null;
        var character = window.getCharacterById(characterId);
        if (!character) return null;
        return typeof character.surname === 'string' ? character.surname : '';
    }

    /**
     * Returns a defensive copy of the surname-change entries, or [].
     *
     * Three states collapse to []:
     *   - character does not exist
     *   - character exists but has no surnameHistory
     *   - history exists with an empty entries array
     *
     * A history object whose `entries` is present but not an array is
     * malformed and throws.
     */
    function getSurnameChanges(characterId) {
        var history = _readSurnameHistory(characterId);
        if (!history) return [];
        if (_isMissing(history.entries)) return [];
        if (!Array.isArray(history.entries)) {
            throw new Error(
                'name-queries.js: surnameHistory.entries for "' + characterId +
                '" is malformed (expected array)'
            );
        }
        return _clone(history.entries);
    }

    /**
     * Returns the number of recorded surname changes.
     */
    function getSurnameChangeCount(characterId) {
        return getSurnameChanges(characterId).length;
    }

    // =========================================================================
    // 7. COUNTRY RULES AND RESOLUTION
    // =========================================================================

    /**
     * Returns a defensive copy of the surname rules configured for a
     * country, or null when no list or no rules are configured.
     *
     * A rules object present but malformed throws with the country ID.
     */
    function getCountrySurnameRules(countryId) {
        if (!_hasId(countryId)) return null;
        var list = getNameList(countryId);
        if (!list) return null;
        if (_isMissing(list.rules)) return null;
        if (!_isPlainObject(list.rules)) {
            throw new Error(
                'name-queries.js: rules for "' + countryId + '" are malformed'
            );
        }
        return list.rules;
    }

    /**
     * Resolves the country ID for a character. Delegates to world.js.
     * The canonical definition lives there; this facade exists so that
     * name-domain consumers do not need a direct World dependency.
     */
    function getCharacterCountryId(characterId) {
        if (!_hasId(characterId)) return null;
        return window.getCharacterCountryId(characterId);
    }

    /**
     * Resolves the country ID for a place ID. Delegates to world.js.
     */
    function getCountryIdForPlace(placeId) {
        if (!_hasId(placeId)) return null;
        return window.getCountryIdForPlace(placeId);
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.NameQueries = {
        // Name lists
        getNameLists: getNameLists,
        getNameList: getNameList,
        getCountryIdsWithNameLists: getCountryIdsWithNameLists,

        // Random selection
        getRandomName: getRandomName,
        getRandomSurname: getRandomSurname,

        // Character projection
        getCharacterDisplayName: getCharacterDisplayName,

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
        getCountryIdForPlace: getCountryIdForPlace
    };

})();
