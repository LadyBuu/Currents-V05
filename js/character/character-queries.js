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
 *   - Character facts (flat projection for cross-domain consumers)
 *   - Location-scoped character lookups
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
 *   - Returned character objects are live canonical references. Callers
 *     must not mutate them. Only CharacterCommands mutates.
 *   - getCharacterFacts returns a defensive projection. It does not leak
 *     the canonical character object.
 *
 * DEPENDENCIES (REQUIRED):
 *   - accessors.js:   getCharacters, getCharacterById
 *   - time.js:        calculateAge, getCurrentYear
 *   - FamilyAccessors
 *
 * DEPENDENCIES (OPTIONAL):
 *   - CharacterState     — for fast indexed lookups
 *   - LocationQueries    — required for getCurrentLocationId and
 *                          location-scoped lookups
 *   - WorldQueries       — for location display
 *   - RankQueries        — for active rank display
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

    function _getAll() {
        if (typeof window.CharacterState !== 'undefined'
            && typeof window.CharacterState.getAllCharacters === 'function') {
            return window.CharacterState.getAllCharacters();
        }
        return window.getCharacters();
    }

    function _getCharacter(id) {
        if (!_hasId(id)) return null;
        if (typeof window.CharacterState !== 'undefined'
            && typeof window.CharacterState.getCharacter === 'function') {
            var c = window.CharacterState.getCharacter(id);
            if (c) return c;
        }
        return window.getCharacterById(id);
    }

    function _age(character) {
        if (!character) return null;
        return window.calculateAge(
            character.birthYear,
            character.isDeceased === true,
            character.deathYear
        );
    }

    function _currentLocationDisplay(character) {
        if (!character) return null;

        if (typeof window.WorldQueries !== 'undefined'
            && typeof window.WorldQueries.getCurrentLocationDisplay === 'function') {
            return window.WorldQueries.getCurrentLocationDisplay(character);
        }

        var locationId = _currentLocationId(character);
        if (!locationId) return null;

        if (typeof window.getPlaceById !== 'function') return null;
        var place = window.getPlaceById(locationId);
        return place && typeof place.displayName === 'string'
            ? place.displayName
            : null;
    }

    /**
     * Resolves the current location id for a character.
     * Delegates to LocationQueries.getCurrentLocationId when available,
     * which is the canonical owner of movement records.
     */
    function _currentLocationId(character) {
        if (!character) return null;

        if (typeof window.LocationQueries !== 'undefined'
            && typeof window.LocationQueries.getCurrentLocationId === 'function') {
            return window.LocationQueries.getCurrentLocationId(character.id);
        }

        // Fallback: character record's currentLocationId field. This is a
        // snapshot; the canonical movement history lives in CharacterState.
        if (_hasId(character.currentLocationId)) return character.currentLocationId;
        return null;
    }

    function _activeRankDisplay(character) {
        if (!character) return null;
        if (!_hasId(character.activeRankId)) return null;

        if (typeof window.RankQueries !== 'undefined'
            && typeof window.RankQueries.getActiveRankDisplay === 'function') {
            return window.RankQueries.getActiveRankDisplay(character);
        }

        if (typeof window.getRankById !== 'function') return null;
        var rank = window.getRankById(character.activeRankId);
        if (!rank) return null;
        return {
            id: rank.id,
            name: rank.name || null,
            display: rank.name || null
        };
    }

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

    function readCharactersByName(name) {
        return searchCharacters(name);
    }

    // =========================================================================
    // 4. CHARACTER FACTS (flat projections for cross-domain consumers)
    // =========================================================================
    //
    // getCharacterFacts returns a flat projection that other domains can
    // consume without knowing the character record shape. It is the API
    // Government and other domains use for eligibility checks.
    //
    // Fields:
    //   id, fullName, name, surname, age, birthYear, gender, isDeceased,
    //   activeRankId, experienceYears, roleIds, skillLevels
    //
    // experienceYears is derived from the character's primary profession
    // startYear. It is null when the character has no primary profession.
    //
    // skillLevels is a map of roleId -> skillLevel for the character's
    // current professions.
    // =========================================================================

    function getCharacterFacts(id) {
        if (!_hasId(id)) return null;
        var character = _getCharacter(id);
        if (!character) return null;

        var age = _age(character);

        var roleIds = [];
        var skillLevels = {};
        if (Array.isArray(character.professions)) {
            for (var i = 0; i < character.professions.length; i++) {
                var p = character.professions[i];
                if (!p || typeof p.id !== 'string' || p.id.length === 0) continue;
                roleIds.push(p.id);
                skillLevels[p.id] = typeof p.skillLevel === 'number'
                    ? p.skillLevel
                    : 0;
            }
        }

        var experienceYears = null;
        var primary = getPrimaryProfession(id);
        if (primary && primary.startYear !== undefined && primary.startYear !== null) {
            var currentYear = window.getCurrentYear();
            var yrs = currentYear - primary.startYear;
            if (typeof yrs === 'number' && isFinite(yrs) && yrs >= 0) {
                experienceYears = yrs;
            }
        }

        return {
            id: character.id,
            fullName: ((character.name || '') + ' ' + (character.surname || '')).trim(),
            name: character.name || '',
            surname: character.surname || '',
            age: age,
            birthYear: character.birthYear !== undefined ? character.birthYear : null,
            gender: character.gender || null,
            isDeceased: character.isDeceased === true,
            activeRankId: character.activeRankId || null,
            experienceYears: experienceYears,
            roleIds: roleIds,
            skillLevels: skillLevels
        };
    }

    function getAllCharacterFacts() {
        var all = _getAll();
        var out = [];
        for (var i = 0; i < all.length; i++) {
            var f = getCharacterFacts(all[i].id);
            if (f) out.push(f);
        }
        return out;
    }

    // =========================================================================
    // 5. LOCATION-SCOPED CHARACTER LOOKUPS
    // =========================================================================

    /**
     * Returns all characters whose current location is in the given id set.
     * Delegates to LocationQueries for current location resolution.
     *
     * @param {string[]} locationIds
     * @returns {Array}
     */
    function getCharactersInLocations(locationIds) {
        if (!Array.isArray(locationIds) || locationIds.length === 0) return [];

        var idSet = {};
        for (var i = 0; i < locationIds.length; i++) {
            if (_hasId(locationIds[i])) idSet[locationIds[i]] = true;
        }

        var all = _getAll();
        var out = [];
        for (var j = 0; j < all.length; j++) {
            var c = all[j];
            var locId = _currentLocationId(c);
            if (locId && idSet[locId]) out.push(c);
        }
        return out;
    }

    /**
     * Returns the current location id for a character.
     * Uses LocationQueries when available; falls back to the character's
     * own currentLocationId field.
     *
     * @param {string} characterId
     * @returns {string|null}
     */
    function getCurrentLocationId(characterId) {
        if (!_hasId(characterId)) return null;
        var character = _getCharacter(characterId);
        if (!character) return null;
        return _currentLocationId(character);
    }

    /**
     * Returns all characters, defensive. Alias for getCharacters accessor
     * exposed on the query surface for cross-domain consumers.
     */
    function getAllCharacters() {
        return _getAll();
    }

    // =========================================================================
    // 6. CHARACTER SUMMARY
    // =========================================================================

    function getCharacterSummary(id) {
        if (!_hasId(id)) return null;
        var character = _getCharacter(id);
        if (!character) return null;

        var age = _age(character);
        var location = _currentLocationDisplay(character);
        var rank = _activeRankDisplay(character);

        var family = null;
        if (typeof window.FamilyStatistics !== 'undefined'
            && typeof window.FamilyStatistics.getFamilyStatistics === 'function') {
            family = window.FamilyStatistics.getFamilyStatistics(id);
        }
        if (!family) {
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

    function getCharacterProfessions(id) {
        if (!_hasId(id)) return [];
        var character = _getCharacter(id);
        if (!character) return [];
        return Array.isArray(character.professions) ? character.professions : [];
    }

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
    // 7. PROFESSION QUERIES
    // =========================================================================

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
    // 8. EDUCATION STATUS (DELEGATED)
    // =========================================================================

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
    // 9. FAMILY QUERIES (THIN ADAPTERS)
    // =========================================================================

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

    function getCharacterGrandparents(characterId, includeAdoptive) {
        if (!_hasId(characterId)) return [];
        return window.FamilyAccessors.getGrandparents(
            characterId,
            includeAdoptive === true
        );
    }

    function getCharacterGrandchildren(characterId, includeDeceased, includeAdopted) {
        if (!_hasId(characterId)) return [];
        return window.FamilyAccessors.getGrandchildren(
            characterId,
            includeDeceased === true,
            includeAdopted !== false
        );
    }

    function getCharacterFirstCousins(characterId, includeDeceased) {
        if (!_hasId(characterId)) return [];
        return window.FamilyAccessors.getFirstCousins(
            characterId,
            includeDeceased === true
        );
    }

    function getCharacterAuntsAndUncles(characterId, includeDeceased) {
        if (!_hasId(characterId)) return [];
        return window.FamilyAccessors.getAuntsAndUncles(
            characterId,
            includeDeceased === true
        );
    }

    function getCharacterNiecesAndNephews(characterId, includeDeceased) {
        if (!_hasId(characterId)) return [];
        return window.FamilyAccessors.getNiecesAndNephews(
            characterId,
            includeDeceased === true
        );
    }

    function getCharacterKinship(charId1, charId2) {
        if (!_hasId(charId1) || !_hasId(charId2)) return null;
        return window.FamilyAccessors.getKinship(charId1, charId2);
    }

    function getCharacterKinshipCloseness(charId1, charId2) {
        if (!_hasId(charId1) || !_hasId(charId2)) return 99;
        return window.FamilyAccessors.getKinshipCloseness(charId1, charId2);
    }

    function getCharacterFamilyStatistics(characterId) {
        if (!_hasId(characterId)) return null;
        if (typeof window.FamilyStatistics === 'undefined') return null;
        if (typeof window.FamilyStatistics.getFamilyStatistics !== 'function') return null;
        return window.FamilyStatistics.getFamilyStatistics(characterId);
    }

    function getCharacterFamilySummary(characterId) {
        if (!_hasId(characterId)) return null;
        if (typeof window.FamilyStatistics === 'undefined') return null;
        if (typeof window.FamilyStatistics.getFamilySummary !== 'function') return null;
        return window.FamilyStatistics.getFamilySummary(characterId);
    }

    // =========================================================================
    // 10. STATISTICS
    // =========================================================================

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
    // 11. EXPORTS
    // =========================================================================

    window.CharacterQueries = {
        // Search
        searchCharacters: searchCharacters,
        readCharactersByName: readCharactersByName,

        // Facts (flat projections)
        getCharacterFacts: getCharacterFacts,
        getAllCharacterFacts: getAllCharacterFacts,

        // Location-scoped
        getCharactersInLocations: getCharactersInLocations,
        getCurrentLocationId: getCurrentLocationId,
        getAllCharacters: getAllCharacters,

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
    // 12. LEGACY GLOBAL ALIASES
    // =========================================================================

    window.getCharacterChildren = getCharacterChildren;
    window.getCharacterParents = getCharacterParents;
    window.getCharacterSiblings = getCharacterSiblings;
    window.getCharacterGrandparents = getCharacterGrandparents;
    window.getCharacterGrandchildren = getCharacterGrandchildren;
    window.getCharacterFamilyStatistics = getCharacterFamilyStatistics;

})();
