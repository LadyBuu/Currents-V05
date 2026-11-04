/**
 * =============================================================================
 * STILL WATERS - NAME QUERIES (name-queries.js)
 * =============================================================================
 *
 * LOCATION: js/modules/names/name-queries.js
 *
 * Read-only retrieval of name lists, ancestor data, surname history,
 * character display-name projection, random name and surname selection,
 * and culture surname rule retrieval.
 *
 * CULTURE KEY
 * -----------
 * Name data is keyed by culture.id in masterData.data.nameLists. There
 * is no country key. The subsystem was migrated wholesale: there is no
 * compatibility layer for country-keyed reads, because there is no data
 * keyed by country to read. Country facts belong to the location domain,
 * not to the name domain.
 *
 * A culture's name data is:
 *   masterData.data.nameLists[cultureId] = {
 *     male:     [string, ...],
 *     female:   [string, ...],
 *     surnames: [string, ...],
 *     rules:    { type: 'family'|'patronymic'|'chain'|'random', ... } | null
 *   }
 *
 * The shape is identical to the pre-migration shape. Only the key
 * changed. This is why the migration required no data rewrite: an
 * empty save is empty on both sides.
 *
 * SEMANTIC RULES
 * --------------
 *   - Missing input returns null (singular) or [] (collection).
 *   - Invalid explicit arguments throw.
 *   - Malformed canonical data throws; corruption is not collapsed into
 *     "empty."
 *   - Random selection uses randomness.js. No Math.random anywhere.
 *   - Random results are never cached.
 *   - Returned objects are defensive clones. Mutation for commands goes
 *     through NamesState, not through this module.
 *   - This module is read-only.
 *
 * DEPENDENCIES (REQUIRED):
 *   - accessors.js:     getNameLists, getCharacterById
 *   - randomness.js:    pickRandom
 *   - CultureQueries:   getCultureForCharacter (resolves a character's
 *                       culture for random selection and rules lookup)
 *
 * DEPENDENCIES (OPTIONAL):
 *   - collections.js:   deepClone — used when present, local fallback
 *   - family-queries.js: FamilyQueries.getParentsByRole — required for
 *                        ancestor lookups; absence yields null
 *   - name-state.js:    NamesState (cache hint only)
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (culture-keyed):
 *     - Name data is keyed by culture.id. Country keys are gone.
 *     - getRandomName(cultureId, gender), getRandomSurname(cultureId),
 *       getCountrySurnameRules(cultureId) are renamed to
 *       getCultureSurnameRules(cultureId) — the family of functions
 *       take a culture ID, not a country ID.
 *     - getCharacterCultureId replaces getCharacterCountryId, resolving
 *       through CultureQueries.getCultureForCharacter.
 *     - getCountryIdForPlace is removed. The name subsystem does not
 *       resolve country facts.
 *   Previous revision:
 *     - _resolveAncestor delegates to FamilyQueries.getParentsByRole.
 *     - _clone delegates to window.deepClone when available.
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
            'pickRandom'
        ];
        var missing = [];
        for (var i = 0; i < requiredFns.length; i++) {
            if (typeof window[requiredFns[i]] !== 'function') {
                missing.push(requiredFns[i]);
            }
        }
        if (typeof window.CultureQueries === 'undefined'
            || typeof window.CultureQueries.getCultureForCharacter !== 'function') {
            missing.push('CultureQueries.getCultureForCharacter');
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

    function _localClone(value) {
        if (Array.isArray(value)) {
            var arr = [];
            for (var i = 0; i < value.length; i++) arr.push(_localClone(value[i]));
            return arr;
        }
        if (_isPlainObject(value)) {
            var out = {};
            var keys = Object.keys(value);
            for (var j = 0; j < keys.length; j++) {
                var k = keys[j];
                if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
                out[k] = _localClone(value[k]);
            }
            return out;
        }
        return value;
    }

    function _clone(value) {
        if (typeof window.deepClone === 'function') {
            return window.deepClone(value);
        }
        return _localClone(value);
    }

    // =========================================================================
    // 2. CULTURE NAME LIST RETRIEVAL
    // =========================================================================

    /**
     * Returns a defensive copy of the full name-list map, keyed by
     * culture ID.
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
     * Returns a defensive copy of the name list for a culture ID, or
     * null when the culture has no configured list.
     */
    function getNameList(cultureId) {
        if (!_hasId(cultureId)) return null;

        var lists = window.getNameLists();
        if (!_isPlainObject(lists)) {
            throw new Error(
                'name-queries.js: accessors.getNameLists() returned non-object; ' +
                'canonical name-list data is missing or malformed'
            );
        }

        var list = lists[cultureId];
        if (_isMissing(list)) return null;
        if (!_isPlainObject(list)) {
            throw new Error(
                'name-queries.js: name list for culture "' + cultureId +
                '" is not an object'
            );
        }

        return _clone(list);
    }

    /**
     * Returns the list of culture IDs that have a configured name list.
     * Sorted for determinism.
     */
    function getCultureIdsWithNameLists() {
        var lists = window.getNameLists();
        if (!_isPlainObject(lists)) return [];
        return Object.keys(lists).filter(function(id) {
            return _isPlainObject(lists[id]);
        }).sort();
    }

    // =========================================================================
    // 3. RANDOM NAME AND SURNAME SELECTION
    // =========================================================================

    /**
     * Picks a random given name from a culture's name list.
     *
     * @param {string} cultureId
     * @param {string} [gender] - 'male' | 'female' | 'all' (default 'all')
     * @returns {string|null}
     * @throws {Error} for invalid cultureId or unknown gender
     */
    function getRandomName(cultureId, gender) {
        if (!_hasId(cultureId)) {
            throw new Error('getRandomName: cultureId must be a non-empty string');
        }
        if (_isMissing(gender)) {
            gender = 'all';
        } else if (!_isValidGenderForLookup(gender)) {
            throw new Error(
                "getRandomName: gender must be 'male', 'female', or 'all'"
            );
        }

        var list = getNameList(cultureId);
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
     * Picks a random surname from a culture's name list.
     */
    function getRandomSurname(cultureId) {
        if (!_hasId(cultureId)) {
            throw new Error('getRandomSurname: cultureId must be a non-empty string');
        }
        var list = getNameList(cultureId);
        if (!list) return null;

        var pool = Array.isArray(list.surnames) ? list.surnames : [];
        if (pool.length === 0) return null;

        var chosen = window.pickRandom(pool);
        return typeof chosen === 'string' ? chosen : null;
    }

    // =========================================================================
    // 4. CHARACTER PROJECTION
    // =========================================================================

    function getCharacterDisplayName(characterId) {
        if (!_hasId(characterId)) return null;
        var character = window.getCharacterById(characterId);
        if (!character) return null;
        return typeof character.name === 'string' ? character.name : '';
    }

    // =========================================================================
    // 5. PARENTAGE SOURCE (FamilyQueries bridge)
    // =========================================================================

    function _familyAvailable() {
        return typeof window.FamilyQueries !== 'undefined'
            && typeof window.FamilyQueries.getParentsByRole === 'function';
    }

    function _getParentByRole(characterId, role) {
        if (!_hasId(characterId)) return null;
        if (role !== 'father' && role !== 'mother') return null;
        if (!_familyAvailable()) return null;

        var roles = window.FamilyQueries.getParentsByRole(characterId);
        if (!roles) return null;

        var list = role === 'father' ? roles.fathers : roles.mothers;
        if (!Array.isArray(list)) return null;

        for (var i = 0; i < list.length; i++) {
            if (list[i] && list[i].parentType === 'biological') {
                return window.getCharacterById(list[i].parentId);
            }
        }
        return null;
    }

    // =========================================================================
    // 6. ANCESTOR DATA
    // =========================================================================

    function _resolveAncestor(character, slot) {
        if (!character || !_hasId(character.id)) return null;

        if (slot === 'father') {
            return _getParentByRole(character.id, 'father');
        }
        if (slot === 'mother') {
            return _getParentByRole(character.id, 'mother');
        }
        if (slot === 'paternal_grandfather') {
            var father = _getParentByRole(character.id, 'father');
            if (!father || !_hasId(father.id)) return null;
            return _getParentByRole(father.id, 'father');
        }
        if (slot === 'paternal_grandmother') {
            var father2 = _getParentByRole(character.id, 'father');
            if (!father2 || !_hasId(father2.id)) return null;
            return _getParentByRole(father2.id, 'mother');
        }
        if (slot === 'maternal_grandfather') {
            var mother = _getParentByRole(character.id, 'mother');
            if (!mother || !_hasId(mother.id)) return null;
            return _getParentByRole(mother.id, 'father');
        }
        if (slot === 'maternal_grandmother') {
            var mother2 = _getParentByRole(character.id, 'mother');
            if (!mother2 || !_hasId(mother2.id)) return null;
            return _getParentByRole(mother2.id, 'mother');
        }
        if (slot === 'paternal_great_grandfather') {
            var father3 = _getParentByRole(character.id, 'father');
            if (!father3 || !_hasId(father3.id)) return null;
            var pgf = _getParentByRole(father3.id, 'father');
            if (!pgf || !_hasId(pgf.id)) return null;
            return _getParentByRole(pgf.id, 'father');
        }
        if (slot === 'maternal_great_grandfather') {
            var mother3 = _getParentByRole(character.id, 'mother');
            if (!mother3 || !_hasId(mother3.id)) return null;
            var mgf = _getParentByRole(mother3.id, 'father');
            if (!mgf || !_hasId(mgf.id)) return null;
            return _getParentByRole(mgf.id, 'father');
        }
        return null;
    }

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

    // =========================================================================
    // 7. SURNAME HISTORY
    // =========================================================================

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

    // =========================================================================
    // 8. CULTURE RULES AND RESOLUTION
    // =========================================================================

    /**
     * Returns a defensive copy of the surname rules configured for a
     * culture, or null when no list or no rules are configured.
     */
    function getCultureSurnameRules(cultureId) {
        if (!_hasId(cultureId)) return null;
        var list = getNameList(cultureId);
        if (!list) return null;
        if (_isMissing(list.rules)) return null;
        if (!_isPlainObject(list.rules)) {
            throw new Error(
                'name-queries.js: rules for culture "' + cultureId + '" are malformed'
            );
        }
        return list.rules;
    }

    /**
     * Resolves the culture ID for a character. Delegates to
     * CultureQueries.getCultureForCharacter, which applies the
     * precedence: explicit cultureId → primary culture of current
     * location (semantic, honours moves and birthplace) → primary
     * culture of birthplace → null.
     */
    function getCharacterCultureId(characterId) {
        if (!_hasId(characterId)) return null;
        var culture = window.CultureQueries.getCultureForCharacter(characterId);
        return culture ? culture.id : null;
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.NameQueries = {
        // Name lists (keyed by culture)
        getNameLists: getNameLists,
        getNameList: getNameList,
        getCultureIdsWithNameLists: getCultureIdsWithNameLists,

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

        // Culture rules and resolution
        getCultureSurnameRules: getCultureSurnameRules,
        getCharacterCultureId: getCharacterCultureId
    };

})();
