/**
 * =============================================================================
 * STILL WATERS - CHARACTER QUERIES (js/character/character-queries.js)
 * =============================================================================
 *
 * Semantic character queries built on top of accessors, character state,
 * and family accessors.
 *
 * SCOPE:
 *   - Name search
 *   - Character summaries (name, age, location, rank, family)
 *   - Profession queries (by skill, masters)
 *   - Education status adapters (delegated to education-queries.js)
 *   - Character population statistics
 *   - Thin family adapters over FamilyAccessors
 *
 * OUT OF SCOPE:
 *   - Raw accessor lookups → accessors.js
 *   - Family graph traversal → FamilyAccessors
 *   - Family statistics aggregation → FamilyStatistics
 *   - Relationship semantics → relationship-queries.js
 *   - Education semantics → education-queries.js
 *   - Mutation → CharacterCommands
 *   - Persistence → storage.js
 *   - Presentation → CharacterUI, modals
 *
 * SEMANTIC RULES:
 *   - Queries are reentrant. There is no `_processing` guard.
 *   - Missing/invalid input returns null (singular) or [] (collection).
 *   - Invalid explicit query arguments throw, matching the project
 *     convention. Query results do not silently default.
 *   - Missing optional dependencies (EducationQueries, WorldQueries,
 *     RankQueries) do not silently fabricate results. When a dependency is
 *     required for a specific query and unavailable, that query returns a
 *     structured failure or null. It does not fall back to a
 *     second implementation.
 *   - Returned character objects are live canonical references. Callers
 *     must not mutate them. Only CharacterCommands mutates.
 *   - Missing character → null. Missing collection → [].
 *
 * FAMILY DELEGATION:
 *   Family-related queries are thin adapters over FamilyAccessors. This
 *   module does not implement family graph traversal, does not reimplement
 *   adoption logic, and does not maintain a parallel view of the family
 *   graph. When FamilyAccessors is unavailable, family queries return
 *   null and log a load-order error, rather than silently producing empty
 *   results.
 *
 * EDUCATION DELEGATION:
 *   Education status queries are delegated to EducationQueries. When that
 *   module is unavailable, education queries return null. This module
 *   does not walk institution graphs itself.
 *
 * RELATIONSHIP QUERIES:
 *   Spouse/partner queries are NOT here. RelationshipQueries owns
 *   partner semantics. This module does not expose "getCurrentSpouse"
 *   because the concept of "current" partner is relationship-domain
 *   knowledge.
 *
 * DEPENDENCIES (REQUIRED):
 *   - accessors.js:   getCharacters, getCharacterById
 *   - time.js:        calculateAge, getCurrentYear
 *   - FamilyAccessors
 *
 * DEPENDENCIES (OPTIONAL):
 *   - CharacterState     — for fast indexed lookups; falls back to
 *                          accessors.js when absent
 *   - WorldQueries       — for location display; falls back to
 *                          place.displayName
 *   - RankQueries        — for active rank display; falls back to null
 *   - EducationQueries   — required for education-status queries only
 *   - FamilyStatistics   — for family statistics aggregation
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

    function _requireCoreDependencies() {
        var required = [
            'getCharacters',
            'getCharacterById',
            'calculateAge',
            'getCurrentYear'
        ];
        var missing = [];
        for (var i = 0; i < required.length; i++) {
            if (typeof window[required[i]] === 'undefined') {
                missing.push(required[i]);
            }
        }
        if (missing.length > 0) {
            throw new Error(
                'character-queries.js: missing required dependencies: ' +
                missing.join(', ')
            );
        }
        if (typeof window.FamilyAccessors === 'undefined') {
            throw new Error(
                'character-queries.js: family-accessors.js must load first.'
            );
        }
    }

    _requireCoreDependencies();

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

    /**
     * Resolves the character collection. Prefers CharacterState for
     * cached/indexed reads; falls back to the accessor.
     */
    function _getAll() {
        if (typeof window.CharacterState !== 'undefined'
            && typeof window.CharacterState.getAllCharacters === 'function') {
            return window.CharacterState.getAllCharacters();
        }
        return window.getCharacters();
    }

    /**
     * Resolves the character object by ID.
     */
    function _getCharacter(id) {
        if (!_hasId(id)) return null;
        if (typeof window.CharacterState !== 'undefined'
            && typeof window.CharacterState.getCharacter === 'function') {
            var c = window.CharacterState.getCharacter(id);
            if (c) return c;
        }
        return window.getCharacterById(id);
    }

    /**
     * Age helper. Uses the canonical time API.
     */
    function _age(character) {
        if (!character) return null;
        return window.calculateAge(
            character.birthYear,
            character.isDeceased === true,
            character.deathYear
        );
    }

    /**
     * Resolves a display name for the character's current location.
     * Uses WorldQueries if available; otherwise resolves the place from
     * the accessor and returns its displayName. Returns null when the
     * character has no current location or the reference is dangling.
     */
    function _currentLocationDisplay(character) {
        if (!character) return null;

        // Prefer a WorldQueries projection when available.
        if (typeof window.WorldQueries !== 'undefined'
            && typeof window.WorldQueries.getCurrentLocationDisplay === 'function') {
            return window.WorldQueries.getCurrentLocationDisplay(character);
        }

        // Fallback: resolve the location ID directly.
        var locationId = _hasId(character.currentLocationId)
            ? character.currentLocationId
            : (_hasId(character.birthplaceId) ? character.birthplaceId : null);
        if (!locationId) return null;

        if (typeof window.getPlaceById !== 'function') return null;
        var place = window.getPlaceById(locationId);
        return place && typeof place.displayName === 'string'
            ? place.displayName
            : null;
    }

    /**
     * Resolves a rank display for a character.
     */
    function _activeRankDisplay(character) {
        if (!character) return null;
        if (!_hasId(character.activeRankId)) return null;

        if (typeof window.RankQueries !== 'undefined'
            && typeof window.RankQueries.getActiveRankDisplay === 'function') {
            return window.RankQueries.getActiveRankDisplay(character);
        }

        // Minimal fallback: resolve the rank and return its name.
        if (typeof window.getRankById !== 'function') return null;
        var rank = window.getRankById(character.activeRankId);
        if (!rank) return null;
        return {
            id: rank.id,
            name: rank.name || null,
            display: rank.name || null
        };
    }

    /**
     * Wraps FamilyAccessors' return shape ({ character, ... }) into bare
     * character objects.
     */
    function _unwrapCharacters(list) {
        if (!Array.isArray(list)) return [];
        var out = [];
        for (var i = 0; i < list.length; i++) {
            var item = list[i];
            if (!item) continue;
            var c = item.character || item;
            if (c && _hasId(c.id)) out.push(c);
        }
        return out;
    }

    // =========================================================================
    // 2. VALIDATION HELPERS
    // =========================================================================

    function _validateString(value, name, allowMissing) {
        if (_isMissing(value)) {
            if (allowMissing) return { ok: true, value: null };
            return { ok: false, reason: name + ' is required' };
        }
        if (typeof value !== 'string') {
            return { ok: false, reason: name + ' must be a string' };
        }
        return { ok: true, value: value };
    }

    function _validateInteger(value, name, allowMissing) {
        if (_isMissing(value)) {
            if (allowMissing) return { ok: true, value: null };
            return { ok: false, reason: name + ' is required' };
        }
        if (typeof value !== 'number' || !Number.isFinite(value)
            || !Number.isInteger(value)) {
            return { ok: false, reason: name + ' must be an integer' };
        }
        return { ok: true, value: value };
    }

    // =========================================================================
    // 3. SEARCH
    // =========================================================================

    /**
     * Searches characters by name. Case-insensitive substring match
     * against the full name (name + surname).
     *
     * @param {string} [query]
     * @returns {Array}
     */
    function searchCharacters(query) {
        var validation = _validateString(query, 'query', true);
        if (!validation.ok) throw new Error('searchCharacters: ' + validation.reason);

        var all = _getAll();
        if (_isMissing(validation.value) || validation.value.trim() === '') {
            return all;
        }

        var lower = validation.value.toLowerCase().trim();
        var result = [];
        for (var i = 0; i < all.length; i++) {
            var c = all[i];
            var name = typeof c.name === 'string' ? c.name : '';
            var surname = typeof c.surname === 'string' ? c.surname : '';
            var full = (name + ' ' + surname).toLowerCase();
            if (full.indexOf(lower) !== -1) {
                result.push(c);
            }
        }
        return result;
    }

    /**
     * @deprecated Alias for searchCharacters. Kept for backward
     * compatibility with callers that used the older name.
     */
    function readCharactersByName(name) {
        return searchCharacters(name);
    }

    // =========================================================================
    // 4. CHARACTER SUMMARY
    // =========================================================================

    /**
     * Returns a structured summary of a character.
     *
     * @param {string} id
     * @returns {Object|null}
     */
    function getCharacterSummary(id) {
        if (!_hasId(id)) return null;
        var character = _getCharacter(id);
        if (!character) return null;

        var age = _age(character);
        var location = _currentLocationDisplay(character);
        var rank = _activeRankDisplay(character);

        // Family info: prefer FamilyStatistics, fall back to FamilyAccessors
        // direct queries. No third-tier fallback.
        var family = null;
        if (typeof window.FamilyStatistics !== 'undefined'
            && typeof window.FamilyStatistics.getFamilyStatistics === 'function') {
            family = window.FamilyStatistics.getFamilyStatistics(id);
        }
        if (!family) {
            // Minimal shape from direct accessors.
            var parents = window.FamilyAccessors.getParents(id);
            var children = window.FamilyAccessors.getAllChildren(id, false);
            family = {
                parents: {
                    father: parents.father || null,
                    mother: parents.mother || null
                },
                children: { total: Array.isArray(children) ? children.length : 0 },
                hasChildren: Array.isArray(children) && children.length > 0
            };
        }

        var primaryProfession = null;
        if (Array.isArray(character.professions) && character.professions.length > 0) {
            for (var i = 0; i < character.professions.length; i++) {
                if (character.professions[i].primary === true) {
                    primaryProfession = character.professions[i];
                    break;
                }
            }
            if (!primaryProfession) primaryProfession = character.professions[0];
        }

        var name = typeof character.name === 'string' ? character.name : '';
        var surname = typeof character.surname === 'string' ? character.surname : '';

        return {
            id: character.id,
            name: name,
            surname: surname,
            fullName: (name + ' ' + surname).trim(),
            gender: _isMissing(character.gender) ? 'unknown' : character.gender,
            age: age,
            location: location,
            rank: rank ? rank.display : null,
            isDeceased: character.isDeceased === true,
            birthYear: _isMissing(character.birthYear) ? null : character.birthYear,
            deathYear: _isMissing(character.deathYear) ? null : character.deathYear,
            deathCause: _isMissing(character.deathCause) ? null : character.deathCause,
            household: _isMissing(character.household) ? null : character.household,
            professionCount: Array.isArray(character.professions)
                ? character.professions.length
                : 0,
            primaryProfession: primaryProfession,
            notes: _isMissing(character.notes) ? '' : character.notes,
            epithet: _isMissing(character.epithet) ? '' : character.epithet,
            family: {
                father: family.parents ? (family.parents.father || null) : null,
                mother: family.parents ? (family.parents.mother || null) : null,
                childCount: family.children ? (family.children.total || 0) : 0,
                hasChildren: family.hasChildren === true
            }
        };
    }

    /**
     * Returns a character's professions array, or [].
     */
    function getCharacterProfessions(id) {
        if (!_hasId(id)) return [];
        var character = _getCharacter(id);
        if (!character) return [];
        return Array.isArray(character.professions) ? character.professions : [];
    }

    /**
     * Returns the primary profession of a character, or null.
     */
    function getPrimaryProfession(id) {
        var professions = getCharacterProfessions(id);
        if (professions.length === 0) return null;
        for (var i = 0; i < professions.length; i++) {
            if (professions[i] && professions[i].primary === true) {
                return professions[i];
            }
        }
        return professions[0] || null;
    }

    /**
     * Returns a character's surname history, or a synthesized default.
     *
     * Does NOT mutate the character. If the character has no stored
     * history, a synthesized default is returned. Callers who want the
     * canonical creation path use
     * CharacterCommands.ensureCharacterSurnameHistory.
     */
    function getCharacterSurnameHistory(id) {
        if (!_hasId(id)) return null;
        var character = _getCharacter(id);
        if (!character) return null;

        if (character.surnameHistory && _isPlainObject(character.surnameHistory)) {
            return character.surnameHistory;
        }

        var birthYear = _isMissing(character.birthYear)
            ? window.getCurrentYear()
            : character.birthYear;
        return {
            birthSurname: typeof character.surname === 'string' ? character.surname : '',
            entries: [],
            lastUpdated: birthYear
        };
    }

    // =========================================================================
    // 5. PROFESSION QUERIES
    // =========================================================================

    /**
     * Returns living characters with the given profession at or above a
     * minimum skill level.
     *
     * @param {string} roleId
     * @param {number} minSkill - integer in [0, 100]
     * @returns {Array}
     */
    function getCharactersByProfessionSkill(roleId, minSkill) {
        var roleValidation = _validateString(roleId, 'roleId', false);
        if (!roleValidation.ok) {
            throw new Error('getCharactersByProfessionSkill: ' + roleValidation.reason);
        }
        var skillValidation = _validateInteger(minSkill, 'minSkill', false);
        if (!skillValidation.ok) {
            throw new Error('getCharactersByProfessionSkill: ' + skillValidation.reason);
        }
        if (skillValidation.value < 0 || skillValidation.value > 100) {
            throw new Error('getCharactersByProfessionSkill: minSkill must be between 0 and 100');
        }

        var all = _getAll();
        var result = [];
        for (var i = 0; i < all.length; i++) {
            var c = all[i];
            if (c.isDeceased === true) continue;
            if (!Array.isArray(c.professions)) continue;

            for (var j = 0; j < c.professions.length; j++) {
                var p = c.professions[j];
                if (!p || p.id !== roleValidation.value) continue;
                var skill = typeof p.skillLevel === 'number' && Number.isFinite(p.skillLevel)
                    ? p.skillLevel
                    : 0;
                if (skill >= skillValidation.value) {
                    result.push(c);
                    break;
                }
            }
        }
        return result;
    }

    /**
     * Returns all characters at or above the master threshold (76) in the
     * given profession, or all professions when roleId is missing.
     *
     * @param {string} [roleId]
     * @returns {Array}
     */
    function getMasterCharacters(roleId) {
        if (!_isMissing(roleId)) {
            var v = _validateString(roleId, 'roleId', false);
            if (!v.ok) throw new Error('getMasterCharacters: ' + v.reason);
            roleId = v.value;
        } else {
            roleId = null;
        }

        var all = _getAll();
        var result = [];
        for (var i = 0; i < all.length; i++) {
            var c = all[i];
            if (!Array.isArray(c.professions)) continue;

            for (var j = 0; j < c.professions.length; j++) {
                var p = c.professions[j];
                if (!p) continue;
                if (roleId && p.id !== roleId) continue;
                var skill = typeof p.skillLevel === 'number' && Number.isFinite(p.skillLevel)
                    ? p.skillLevel
                    : 0;
                if (skill >= 76) {
                    result.push(c);
                    break;
                }
            }
        }
        return result;
    }

    // =========================================================================
    // 6. EDUCATION STATUS (DELEGATED)
    // =========================================================================

    /**
     * Returns characters by education status. Delegates to
     * EducationQueries. Returns null when that module is not loaded.
     *
     * @param {string} status - 'enrolled' | 'graduated' | 'withdrawn' | 'never_attended'
     * @param {string} [institutionId]
     * @returns {Array|null}
     */
    function getCharactersByEducationStatus(status, institutionId) {
        var statusValidation = _validateString(status, 'status', false);
        if (!statusValidation.ok) {
            throw new Error('getCharactersByEducationStatus: ' + statusValidation.reason);
        }
        var valid = ['enrolled', 'graduated', 'withdrawn', 'never_attended'];
        if (valid.indexOf(statusValidation.value) === -1) {
            throw new Error('getCharactersByEducationStatus: status must be one of ' + valid.join(', '));
        }
        if (!_isMissing(institutionId)) {
            var idValidation = _validateString(institutionId, 'institutionId', false);
            if (!idValidation.ok) {
                throw new Error('getCharactersByEducationStatus: ' + idValidation.reason);
            }
        }

        if (typeof window.EducationQueries === 'undefined'
            || typeof window.EducationQueries.getCharactersByStatus !== 'function') {
            return null;
        }
        return window.EducationQueries.getCharactersByStatus(
            statusValidation.value,
            _isMissing(institutionId) ? null : institutionId
        );
    }

    /**
     * Returns school-age characters not currently enrolled.
     * Delegates to EducationQueries. Returns null when unavailable.
     *
     * @param {number} [minAge] - default 7
     * @param {number} [maxAge] - default 16
     * @returns {Array|null}
     */
    function getCharactersNotInEducation(minAge, maxAge) {
        var minV = _validateInteger(minAge, 'minAge', true);
        if (!minV.ok) throw new Error('getCharactersNotInEducation: ' + minV.reason);
        var maxV = _validateInteger(maxAge, 'maxAge', true);
        if (!maxV.ok) throw new Error('getCharactersNotInEducation: ' + maxV.reason);

        var actualMin = _isMissing(minV.value) ? 7 : minV.value;
        var actualMax = _isMissing(maxV.value) ? 16 : maxV.value;
        if (actualMin > actualMax) {
            throw new Error('getCharactersNotInEducation: minAge must not exceed maxAge');
        }

        if (typeof window.EducationQueries === 'undefined'
            || typeof window.EducationQueries.getCharactersNotEnrolled !== 'function') {
            return null;
        }
        return window.EducationQueries.getCharactersNotEnrolled(actualMin, actualMax);
    }

    // =========================================================================
    // 7. FAMILY QUERIES (THIN ADAPTERS)
    // =========================================================================
    //
    // These delegate to FamilyAccessors. They do not implement family
    // graph traversal.

    /**
     * Returns all children of a character.
     *
     * @param {string} characterId
     * @param {boolean} [includeDeceased] - default false
     * @param {boolean} [includeAdopted]  - default true
     * @returns {Array}
     */
    function getCharacterChildren(characterId, includeDeceased, includeAdopted) {
        if (!_hasId(characterId)) return [];
        includeDeceased = includeDeceased === true;
        includeAdopted = includeAdopted !== false;

        var all = window.FamilyAccessors.getAllChildren(characterId, includeDeceased);
        if (!includeAdopted) {
            all = all.filter(function(entry) { return entry.biological === true; });
        }
        return _unwrapCharacters(all);
    }

    /**
     * Returns a character's parents.
     *
     * @param {string} characterId
     * @param {boolean} [includeAdoptive] - default false
     * @returns {{ father: Object|null, mother: Object|null, adoptiveParents: Array }}
     */
    function getCharacterParents(characterId, includeAdoptive) {
        var empty = { father: null, mother: null, adoptiveParents: [] };
        if (!_hasId(characterId)) return empty;

        var parents = window.FamilyAccessors.getParents(characterId);
        var result = {
            father: parents.father || null,
            mother: parents.mother || null,
            adoptiveParents: []
        };

        if (includeAdoptive === true) {
            var allParents = window.FamilyAccessors.getAllParents(characterId, true);
            for (var i = 0; i < allParents.length; i++) {
                var p = allParents[i];
                if (p && p.adoptive === true && p.character) {
                    result.adoptiveParents.push(p.character);
                }
            }
        }

        return result;
    }

    /**
     * Returns a character's siblings.
     *
     * @param {string} characterId
     * @param {boolean} [includeHalfSiblings] - default true
     * @param {boolean} [includeDeceased]     - default false
     * @param {boolean} [includeAdopted]      - default true
     * @returns {Array}
     */
    function getCharacterSiblings(characterId, includeHalfSiblings, includeDeceased, includeAdopted) {
        if (!_hasId(characterId)) return [];
        includeHalfSiblings = includeHalfSiblings !== false;
        includeDeceased = includeDeceased === true;
        includeAdopted = includeAdopted !== false;

        var all = window.FamilyAccessors.getSiblings(
            characterId,
            includeHalfSiblings,
            includeDeceased,
            includeAdopted
        );
        return _unwrapCharacters(all);
    }

    /**
     * Returns a character's grandparents.
     *
     * @param {string} characterId
     * @param {boolean} [includeAdoptive] - default false
     * @returns {Array}
     */
    function getCharacterGrandparents(characterId, includeAdoptive) {
        if (!_hasId(characterId)) return [];
        return window.FamilyAccessors.getGrandparents(
            characterId,
            includeAdoptive === true
        );
    }

    /**
     * Returns a character's grandchildren.
     *
     * @param {string} characterId
     * @param {boolean} [includeDeceased] - default false
     * @param {boolean} [includeAdopted]  - default true
     * @returns {Array}
     */
    function getCharacterGrandchildren(characterId, includeDeceased, includeAdopted) {
        if (!_hasId(characterId)) return [];
        return window.FamilyAccessors.getGrandchildren(
            characterId,
            includeDeceased === true,
            includeAdopted !== false
        );
    }

    /**
     * Returns a character's first cousins.
     */
    function getCharacterFirstCousins(characterId, includeDeceased) {
        if (!_hasId(characterId)) return [];
        return window.FamilyAccessors.getFirstCousins(
            characterId,
            includeDeceased === true
        );
    }

    /**
     * Returns a character's aunts and uncles.
     */
    function getCharacterAuntsAndUncles(characterId, includeDeceased) {
        if (!_hasId(characterId)) return [];
        return window.FamilyAccessors.getAuntsAndUncles(
            characterId,
            includeDeceased === true
        );
    }

    /**
     * Returns a character's nieces and nephews.
     */
    function getCharacterNiecesAndNephews(characterId, includeDeceased) {
        if (!_hasId(characterId)) return [];
        return window.FamilyAccessors.getNiecesAndNephews(
            characterId,
            includeDeceased === true
        );
    }

    /**
     * Returns the kinship record between two characters. Delegates to
     * FamilyAccessors.
     *
     * The result is structured, not a presentation string. Rendering
     * "Father" or "Cousin" is the caller's responsibility.
     */
    function getCharacterKinship(charId1, charId2) {
        if (!_hasId(charId1) || !_hasId(charId2)) return null;
        return window.FamilyAccessors.getKinship(charId1, charId2);
    }

    /**
     * Returns the kinship closeness score between two characters.
     *
     * The score is a UI sort key that measures graph proximity. It is NOT
     * a blood-relationship coefficient. Affinity (spouse) is NOT included;
     * use relationship-queries.js for affinity.
     *
     * @returns {number} 0 for self, higher for more distant. 99 for
     *   unrelated.
     */
    function getCharacterKinshipCloseness(charId1, charId2) {
        if (!_hasId(charId1) || !_hasId(charId2)) return 99;
        return window.FamilyAccessors.getKinshipCloseness(charId1, charId2);
    }

    /**
     * Returns comprehensive family statistics for a character.
     * Delegates to FamilyStatistics. Returns null when unavailable.
     */
    function getCharacterFamilyStatistics(characterId) {
        if (!_hasId(characterId)) return null;
        if (typeof window.FamilyStatistics === 'undefined') return null;
        if (typeof window.FamilyStatistics.getFamilyStatistics !== 'function') return null;
        return window.FamilyStatistics.getFamilyStatistics(characterId);
    }

    /**
     * Returns a lightweight family summary for a character.
     */
    function getCharacterFamilySummary(characterId) {
        if (!_hasId(characterId)) return null;
        if (typeof window.FamilyStatistics === 'undefined') return null;
        if (typeof window.FamilyStatistics.getFamilySummary !== 'function') return null;
        return window.FamilyStatistics.getFamilySummary(characterId);
    }

    // =========================================================================
    // 8. CHARACTER STATISTICS
    // =========================================================================

    /**
     * Returns aggregate statistics for the character population.
     *
     * @returns {Object}
     */
    function getCharacterStatistics() {
        var all = _getAll();
        var currentYear = window.getCurrentYear();

        var stats = {
            total: all.length,
            living: 0,
            deceased: 0,
            male: 0,
            female: 0,
            unknownGender: 0,
            averageCurrentAge: 0,
            averageAgeAtDeath: 0,
            byAgeGroup: {},
            livingByAgeGroup: {},
            byHousehold: {},
            byProfession: {},
            byRank: {}
        };

        var ageGroups = window.AGE_GROUPS || [];
        for (var g = 0; g < ageGroups.length; g++) {
            stats.byAgeGroup[ageGroups[g]] = 0;
            stats.livingByAgeGroup[ageGroups[g]] = 0;
        }

        var totalCurrentAge = 0;
        var livingCount = 0;
        var totalAgeAtDeath = 0;
        var deceasedCount = 0;

        for (var i = 0; i < all.length; i++) {
            var c = all[i];

            if (c.isDeceased === true) {
                stats.deceased++;
                if (window.isValidYear(c.birthYear) && window.isValidYear(c.deathYear)) {
                    totalAgeAtDeath += c.deathYear - c.birthYear;
                    deceasedCount++;
                }
            } else {
                stats.living++;
                if (window.isValidYear(c.birthYear)) {
                    totalCurrentAge += currentYear - c.birthYear;
                    livingCount++;
                }
            }

            if (c.gender === 'male') stats.male++;
            else if (c.gender === 'female') stats.female++;
            else stats.unknownGender++;

            // Age grouping
            var ageForGrouping = c.isDeceased === true
                ? (window.isValidYear(c.birthYear) && window.isValidYear(c.deathYear)
                    ? c.deathYear - c.birthYear : null)
                : (window.isValidYear(c.birthYear) ? currentYear - c.birthYear : null);

            if (ageForGrouping !== null && ageForGrouping >= 0) {
                var groupKey = _resolveAgeGroup(ageForGrouping, ageGroups);
                if (groupKey) {
                    stats.byAgeGroup[groupKey] = (stats.byAgeGroup[groupKey] || 0) + 1;
                    if (c.isDeceased !== true) {
                        stats.livingByAgeGroup[groupKey] = (stats.livingByAgeGroup[groupKey] || 0) + 1;
                    }
                }
            }

            if (_hasId(c.household)) {
                stats.byHousehold[c.household] = (stats.byHousehold[c.household] || 0) + 1;
            }

            if (Array.isArray(c.professions)) {
                var seenProf = {};
                for (var j = 0; j < c.professions.length; j++) {
                    var p = c.professions[j];
                    if (!p || !_hasId(p.id)) continue;
                    if (seenProf[p.id]) continue;
                    seenProf[p.id] = true;
                    stats.byProfession[p.id] = (stats.byProfession[p.id] || 0) + 1;
                }
            }

            if (_hasId(c.activeRankId)) {
                stats.byRank[c.activeRankId] = (stats.byRank[c.activeRankId] || 0) + 1;
            }
        }

        stats.averageCurrentAge = livingCount > 0
            ? Math.round(totalCurrentAge / livingCount)
            : 0;
        stats.averageAgeAtDeath = deceasedCount > 0
            ? Math.round(totalAgeAtDeath / deceasedCount)
            : 0;

        return stats;
    }

    function _resolveAgeGroup(age, ageGroups) {
        for (var i = 0; i < ageGroups.length; i++) {
            var parts = ageGroups[i].split('-');
            var min = parseInt(parts[0], 10);
            var max = parts[1] === '+' ? Infinity : parseInt(parts[1], 10);
            if (age >= min && age <= max) return ageGroups[i];
        }
        return null;
    }

    // =========================================================================
    // 9. EXPORTS
    // =========================================================================

    window.CharacterQueries = {
        // Search
        searchCharacters: searchCharacters,
        readCharactersByName: readCharactersByName,

        // Summary and projections
        getCharacterSummary: getCharacterSummary,
        getCharacterProfessions: getCharacterProfessions,
        getPrimaryProfession: getPrimaryProfession,
        getCharacterSurnameHistory: getCharacterSurnameHistory,

        // Profession queries
        getCharactersByProfessionSkill: getCharactersByProfessionSkill,
        getMasterCharacters: getMasterCharacters,

        // Education adapters
        getCharactersByEducationStatus: getCharactersByEducationStatus,
        getCharactersNotInEducation: getCharactersNotInEducation,

        // Family adapters
        getCharacterChildren: getCharacterChildren,
        getCharacterParents: getCharacterParents,
        getCharacterSiblings: getCharacterSiblings,
        getCharacterGrandparents: getCharacterGrandparents,
        getCharacterGrandchildren: getCharacterGrandchildren,
        getCharacterFirstCousins: getCharacterFirstCousins,
        getCharacterAuntsAndUncles: getCharacterAuntsAndUncles,
        getCharacterNiecesAndNephews: getCharacterNiecesAndNephews,
        getCharacterKinship: getCharacterKinship,
        getCharacterKinshipCloseness: getCharacterKinshipCloseness,
        getCharacterFamilyStatistics: getCharacterFamilyStatistics,
        getCharacterFamilySummary: getCharacterFamilySummary,

        // Statistics
        getCharacterStatistics: getCharacterStatistics
    };

    // =========================================================================
    // 10. LEGACY GLOBAL ALIASES
    // =========================================================================
    //
    // Thin aliases for callers that use bare globals. Not second
    // implementations.

    window.getCharacterChildren = getCharacterChildren;
    window.getCharacterParents = getCharacterParents;
    window.getCharacterSiblings = getCharacterSiblings;
    window.getCharacterGrandparents = getCharacterGrandparents;
    window.getCharacterGrandchildren = getCharacterGrandchildren;
    window.getCharacterFamilyStatistics = getCharacterFamilyStatistics;

})();