/**
 * =============================================================================
 * STILL WATERS - NAME QUERIES (name-queries.js)
 * =============================================================================
 *
 * LOCATION: js/modules/names/name-queries.js
 *
 * SCOPE:
 *   - Read-only retrieval of name lists, ancestor data, surname history
 *   - Random name and surname selection
 *   - Country surname rule retrieval
 *   - Delegation of country resolution to world.js
 *
 * OUT OF SCOPE:
 *   - Rule application (family / patronymic / chain generation) → name-rules.js
 *   - Mutations (recording surname changes, adding names) → name-commands.js
 *   - Persisted data ownership → storage.js / storage-schema.js
 *   - Runtime caches → name-state.js
 *   - Base-name extraction (was here; moves to name-rules.js)
 *   - Presentation → modals / UI
 *   - Randomness implementation → randomness.js
 *
 * SEMANTIC RULES:
 *   - Missing input returns null (singular) or [] (collection).
 *   - Invalid explicit arguments throw.
 *   - Malformed canonical data throws. It is not silently converted to
 *     an empty collection. "Corrupt" and "empty" are different states.
 *   - Random selection uses randomness.js. No Math.random anywhere.
 *   - Random results are never cached. Caching a random result would
 *     turn getRandomName into "return the previously chosen name".
 *   - Surname history reads do not mutate. Missing history returns null
 *     from the canonical query; empty-string semantics are the caller's
 *     concern.
 *   - Returned objects are defensive clones. Callers may mutate the
 *     result without affecting canonical data. Mutable access for
 *     commands goes through NameState, not through this module.
 *   - This module is read-only. No saveMasterData, no events, no
 *     mutation of character or place records.
 *   - No recursion guard. Queries are reentrant.
 *
 * RANDOMNESS CONTRACT:
 *   getRandomName and getRandomSurname consume the canonical RNG stream.
 *   They are deterministic given a fixed seed and a fixed call sequence.
 *   Callers who need a stable generated name call once and store the
 *   result; callers who need reproducibility set the seed via
 *   randomness.js.
 *
 * COUNTRY RESOLUTION:
 *   Country resolution is delegated to world.js. This module exposes
 *   thin facades (getCharacterCountryId, getCountryIdForPlace) so that
 *   name-domain consumers (notably name-rules.js) can depend only on
 *   NameQueries rather than on World directly. The underlying canonical
 *   definition lives in world.js; this module does not walk the place
 *   hierarchy.
 *
 * ANCESTOR MODEL:
 *   getAncestorData(character, slot) resolves one of six absolute
 *   ancestor slots relative to the given character:
 *     father, mother,
 *     paternal_grandfather, paternal_grandmother,
 *     maternal_grandfather, maternal_grandmother
 *
 *   getAncestorNames(character, order, source) resolves each slot in
 *   `order` against the *starting* character, in sequence, and returns
 *   the requested field ('firstname' or 'surname'). Duplicates by
 *   ancestor ID are removed. The `depth` parameter that used to exist
 *   here has been removed: it was documented as "generations" but
 *   implemented as "max results", and the two readings disagree. The
 *   length of `order` is the depth.
 *
 *   A relative-path model (walk father, then father-of-father, ...) was
 *   considered and rejected: it makes the meaning of the six absolute
 *   slot names ambiguous. Callers who want a three-generation paternal
 *   chain list three absolute slots. The ancestor vocabulary in
 *   name-rules.js is extended accordingly if a preset needs it.
 *
 * DEPENDENCIES (REQUIRED):
 *   - accessors.js:  getNameLists, getCharacterById
 *   - randomness.js: pickRandom
 *   - world.js:      getCharacterCountryId, getCountryIdForPlace
 *
 * DEPENDENCIES (OPTIONAL):
 *   - name-state.js: NameState. If present, getSurnameHistory reads
 *     through its cache. If absent, reads the character record. The
 *     character record is canonical in both cases; NameState is a hint.
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
            || slot === 'maternal_grandmother';
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
     * If the canonical accessor returns something that is not a plain
     * object, this throws. That is a schema violation, not an empty map.
     */
    function getNameLists() {
        var lists = window.getNameLists();
        if (!_isPlainObject(lists)) {
            throw new Error(
                'name-queries.js: getNameLists() returned non-object; ' +
                'canonical name-list data is malformed'
            );
        }
        return _clone(lists);
    }

    /**
     * Returns a defensive copy of the name list for a place ID, or null.
     *
     * A place with no configured list returns null. A place whose list is
     * present but malformed (e.g. `male` is not an array) throws.
     */
    function getNameList(countryId) {
        if (!_hasId(countryId)) return null;

        var lists = window.getNameLists();
        if (!_isPlainObject(lists)) {
            throw new Error(
                'name-queries.js: getNameLists() returned non-object; ' +
                'canonical name-list data is malformed'
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
    // 4. ANCESTOR DATA
    // =========================================================================

    /**
     * Returns the ancestor record for a given absolute ancestor slot, or
     * null when the slot is unresolvable.
     *
     * Slots:
     *   father, mother,
     *   paternal_grandfather, paternal_grandmother,
     *   maternal_grandfather, maternal_grandmother
     *
     * @param {Object} character
     * @param {string} slot
     * @returns {{ id: string, firstName: string, surname: string }|null}
     */
    function getAncestorData(character, slot) {
        if (!character || !_hasId(character.id)) return null;
        if (!_isValidAncestorSlot(slot)) return null;

        var ancestor = null;

        if (slot === 'father') {
            if (_hasId(character.fatherId)) {
                ancestor = window.getCharacterById(character.fatherId);
            }
        } else if (slot === 'mother') {
            if (_hasId(character.motherId)) {
                ancestor = window.getCharacterById(character.motherId);
            }
        } else {
            var parentSlotId = slot.indexOf('paternal_') === 0
                ? character.fatherId
                : character.motherId;
            if (_hasId(parentSlotId)) {
                var parent = window.getCharacterById(parentSlotId);
                if (parent) {
                    var grandparentField = slot.indexOf('_grandfather') !== -1
                        ? 'fatherId'
                        : 'motherId';
                    var grandparentId = parent[grandparentField];
                    if (_hasId(grandparentId)) {
                        ancestor = window.getCharacterById(grandparentId);
                    }
                }
            }
        }

        if (!ancestor || !_hasId(ancestor.id)) return null;

        return {
            id: ancestor.id,
            firstName: _extractBaseFirstName(ancestor),
            surname: typeof ancestor.surname === 'string' ? ancestor.surname : ''
        };
    }

    /**
     * Resolves each absolute slot in `order` against the starting
     * character and returns the requested source field.
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

    /**
     * Extracts the "base" first name from a character: the given name
     * with any trailing epithet or "of Place" suffix stripped.
     *
     * INTERNAL. Not exported. The canonical owner of this transformation
     * is name-rules.js. It lives here temporarily because getAncestorData
     * returns a resolved firstName and callers would otherwise reach for
     * the character record directly. When name-rules.js owns it, this
     * helper is deleted and getAncestorData calls into Rules.
     */
    function _extractBaseFirstName(character) {
        if (!character) return '';
        var name = typeof character.name === 'string' ? character.name : '';
        if (name.length === 0) return '';
        name = name.replace(/\s+the\s+\S+$/, '');
        name = name.replace(/\s+of\s+\S+$/, '');
        return name.trim();
    }

    // =========================================================================
    // 5. SURNAME HISTORY
    // =========================================================================
    //
    // The canonical owner of surname history is the character record. This
    // module reads it, optionally through the NameState cache, and returns
    // a defensive copy so callers cannot mutate canonical data by accident.
    //
    // NameState is optional. If it is absent, this module reads the
    // character record directly. If it is present, it is consulted first
    // as a cache hint, but the character record remains authoritative.

    function _readSurnameHistory(characterId) {
        if (!_hasId(characterId)) return null;

        if (typeof window.NameState !== 'undefined'
            && typeof window.NameState.getSurnameHistory === 'function') {
            var cached = window.NameState.getSurnameHistory(characterId);
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
     * malformed and throws. That is a schema violation, not "no changes".
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
     * Returns the number of recorded surname changes. Uses the same
     * collapse-to-zero semantics as getSurnameChanges.
     */
    function getSurnameChangeCount(characterId) {
        return getSurnameChanges(characterId).length;
    }

    // =========================================================================
    // 6. COUNTRY RULES AND RESOLUTION
    // =========================================================================
    //
    // Country resolution is delegated to world.js. This module exposes
    // thin facades so that name-domain consumers can depend on
    // NameQueries alone rather than on World directly.
    //
    // The canonical owner of "what country is this character in" is
    // world.js. This module does not walk the place hierarchy.

    /**
     * Returns a defensive copy of the surname rules configured for a
     * country, or null when no list or no rules are configured.
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
        getCountryIdForPlace: getCountryIdForPlace
    };

})();
