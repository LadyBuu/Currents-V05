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
 *     through NameState, not through this module.
 *   - This module is read-only.
 *   - No recursion guard.
 *
 * ANCESTOR MODEL:
 *   Slots (all resolved against the starting character):
 *     father, mother,
 *     paternal_grandfather, paternal_grandmother,
 *     maternal_grandfather, maternal_grandmother,
 *     paternal_great_grandfather, maternal_great_grandfather
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
 * NAME STATE:
 *   NameState is an OPTIONAL cache hint. The character record is
 *   canonical. If NameState is present, reads consult it first; if not,
 *   reads fall through to the character record directly.
 *
 * DEPENDENCIES (REQUIRED):
 *   - accessors.js:  getNameLists, getCharacterById
 *   - randomness.js: pickRandom
 *   - world.js:      getCharacterCountryId, getCountryIdForPlace
 *
 * DEPENDENCIES (OPTIONAL):
 *   - name-state.js: NameState (cache hint only)
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function() {
    'use strict';

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

    // -------------------------------------------------------------------------
    // Name lists
    // -------------------------------------------------------------------------

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

    function getCountryIdsWithNameLists() {
        var lists = window.getNameLists();
        if (!_isPlainObject(lists)) return [];
        return Object.keys(lists).filter(function(id) {
            return _isPlainObject(lists[id]);
        }).sort();
    }

    // -------------------------------------------------------------------------
    // Random selection
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // Character projection
    // -------------------------------------------------------------------------

    /**
     * Returns the character's display name (the `name` field), or null
     * when the character does not exist.
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

    // -------------------------------------------------------------------------
    // Ancestor data
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // Surname history
    // -------------------------------------------------------------------------

    function _readSurnameHistory(characterId) {
        if (!_hasId(characterId)) return null;

        if (typeof window.NameState !== 'undefined'
            && typeof window.NameState.getMutableSurnameHistory === 'function') {
            var cached = window.NameState.getMutableSurnameHistory(characterId);
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

    function getSurnameHistory(characterId) {
        var history = _readSurnameHistory(characterId);
        if (!history) return null;
        return _clone(history);
    }

    function getBirthSurname(characterId) {
        var history = _readSurnameHistory(characterId);
        if (!history) return null;
        return typeof history.birthSurname === 'string' ? history.birthSurname : '';
    }

    function getCurrentSurname(characterId) {
        if (!_hasId(characterId)) return null;
        var character = window.getCharacterById(characterId);
        if (!character) return null;
        return typeof character.surname === 'string' ? character.surname : '';
    }

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

    function getSurnameChangeCount(characterId) {
        return getSurnameChanges(characterId).length;
    }

    // -------------------------------------------------------------------------
    // Country rules and resolution
    // -------------------------------------------------------------------------

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

    function getCharacterCountryId(characterId) {
        if (!_hasId(characterId)) return null;
        return window.getCharacterCountryId(characterId);
    }

    function getCountryIdForPlace(placeId) {
        if (!_hasId(placeId)) return null;
        return window.getCountryIdForPlace(placeId);
    }

    // -------------------------------------------------------------------------
    // Exports
    // -------------------------------------------------------------------------

    window.NameQueries = {
        getNameLists: getNameLists,
        getNameList: getNameList,
        getCountryIdsWithNameLists: getCountryIdsWithNameLists,

        getRandomName: getRandomName,
        getRandomSurname: getRandomSurname,

        getCharacterDisplayName: getCharacterDisplayName,

        getAncestorData: getAncestorData,
        getAncestorNames: getAncestorNames,

        getSurnameHistory: getSurnameHistory,
        getBirthSurname: getBirthSurname,
        getCurrentSurname: getCurrentSurname,
        getSurnameChanges: getSurnameChanges,
        getSurnameChangeCount: getSurnameChangeCount,

        getCountrySurnameRules: getCountrySurnameRules,
        getCharacterCountryId: getCharacterCountryId,
        getCountryIdForPlace: getCountryIdForPlace
    };

})();
