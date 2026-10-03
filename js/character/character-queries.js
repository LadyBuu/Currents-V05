/**
 * =============================================================================
 * STILL WATERS - CHARACTER QUERIES (js/character/character-queries.js)
 * =============================================================================
 *
 * Semantic character-level read API.
 *
 * SCOPE:
 *   - Character search (name substring)
 *   - Character summary projection
 *   - Character facts projection for cross-domain consumers
 *   - Location-scoped character lookups
 *   - Whole-collection defensive projection
 *
 * OUT OF SCOPE:
 *   - Family graph semantics         -> family-queries.js
 *   - Profession semantics           -> character-commands.js (reads)
 *   - Population statistics          -> character-statistics.js
 *   - Relationship semantics         -> future relationship domain
 *   - Rank semantics                 -> future rank domain
 *   - Mutation                       -> character-commands.js
 *   - Persistence                    -> storage.js
 *   - Presentation                   -> character-ui-list.js, modals
 *
 * FAMILY DELEGATION:
 *   Family queries delegate to FamilyQueries when it is loaded. The
 *   delegating functions preserve the historical call surface
 *   (getCharacterChildren, getCharacterParents, getCharacterSiblings)
 *   so existing callers continue to work. They do not reimplement
 *   family semantics. If FamilyQueries is not loaded, they return
 *   null or [] without fabricating data.
 *
 * SEMANTIC RULES:
 *   - Missing/invalid input returns null (singular) or [] (collection).
 *   - Invalid explicit input throws.
 *   - Every returned character is a defensive projection. No live
 *     canonical object leaves this module.
 *   - Reads are reentrant. No _processing guard.
 *   - No fallback dependencies. If a required dependency is missing at
 *     load, this module throws.
 *
 * DEPENDENCIES (REQUIRED, load first):
 *   - character-state.js     (CharacterState)
 *   - time.js                (calculateAge, getCurrentYear, isValidYear)
 *
 * DEPENDENCIES (OPTIONAL, present in the current codebase):
 *   - character-commands.js  (CharacterCommands)
 *   - family-queries.js      (FamilyQueries)
 *   - role-queries.js        (RoleQueries)
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    if (!window.CharacterState) {
        throw new Error(
            'character-queries.js requires character-state.js (CharacterState) to load first.'
        );
    }
    if (typeof window.calculateAge !== 'function') {
        throw new Error('character-queries.js requires time.js (calculateAge).');
    }
    if (typeof window.getCurrentYear !== 'function') {
        throw new Error('character-queries.js requires time.js (getCurrentYear).');
    }
    if (typeof window.isValidYear !== 'function') {
        throw new Error('character-queries.js requires time.js (isValidYear).');
    }

    var CS = window.CharacterState;

    // =========================================================================
    // 1. HELPERS
    // =========================================================================

    function _hasId(v) {
        return typeof v === 'string' && v.length > 0;
    }

    function _isMissing(v) {
        return v === undefined || v === null;
    }

    function _readCharacter(id) {
        if (!_hasId(id)) return null;
        return CS.getCharacter(id);
    }

    function _readAll() {
        return CS.getAllCharacters();
    }

    function _age(projection) {
        if (!projection) return null;
        return window.calculateAge(
            projection.birthYear,
            projection.isDeceased === true,
            projection.deathYear
        );
    }

    function _fullName(projection) {
        if (!projection) return '';
        var name = typeof projection.name === 'string' ? projection.name : '';
        var surname = typeof projection.surname === 'string' ? projection.surname : '';
        return (name + ' ' + surname).trim();
    }

    function _validateStringArgument(value, name, allowMissing) {
        if (_isMissing(value)) {
            if (allowMissing) return { ok: true, value: null };
            return { ok: false, reason: name + ' is required' };
        }
        if (typeof value !== 'string') {
            return { ok: false, reason: name + ' must be a string' };
        }
        return { ok: true, value: value };
    }

    // =========================================================================
    // 2. SEARCH
    // =========================================================================

    function searchCharacters(query) {
        var v = _validateStringArgument(query, 'query', true);
        if (!v.ok) throw new Error('searchCharacters: ' + v.reason);

        var all = _readAll();
        if (_isMissing(v.value) || v.value.trim() === '') return all;

        var lower = v.value.trim().toLowerCase();
        var result = [];
        for (var i = 0; i < all.length; i++) {
            var c = all[i];
            var full = ((c.name || '') + ' ' + (c.surname || '')).toLowerCase();
            if (full.indexOf(lower) !== -1) result.push(c);
        }
        return result;
    }

    function readCharactersByName(name) {
        return searchCharacters(name);
    }

    // =========================================================================
    // 3. BASIC LOOKUPS
    // =========================================================================

    function getAllCharacters() {
        return _readAll();
    }

    function getCharacter(id) {
        if (!_hasId(id)) return null;
        return _readCharacter(id);
    }

    function getCharacterDisplayName(id) {
        var projection = _readCharacter(id);
        if (!projection) return null;
        return _fullName(projection);
    }

    function getCurrentLocationId(id) {
        var projection = _readCharacter(id);
        if (!projection) return null;
        return projection.currentLocationId || null;
    }

    function getCharactersInLocations(locationIds) {
        if (!Array.isArray(locationIds) || locationIds.length === 0) return [];

        var idSet = {};
        for (var i = 0; i < locationIds.length; i++) {
            if (_hasId(locationIds[i])) idSet[locationIds[i]] = true;
        }

        var all = _readAll();
        var out = [];
        for (var j = 0; j < all.length; j++) {
            var c = all[j];
            if (c.currentLocationId && idSet[c.currentLocationId]) {
                out.push(c);
            }
        }
        return out;
    }

    // =========================================================================
    // 4. CHARACTER SUMMARY
    // =========================================================================

    function getCharacterSummary(id) {
        var projection = _readCharacter(id);
        if (!projection) return null;

        var age = _age(projection);
        var fullName = _fullName(projection);

        var rankDisplay = null;
        if (projection.activeRankId
            && typeof window.RoleQueries !== 'undefined'
            && typeof window.RoleQueries.getRankSummary === 'function') {
            var rankSummary = window.RoleQueries.getRankSummary(projection.activeRankId);
            if (rankSummary) rankDisplay = rankSummary.name || null;
        }

        var primaryProfession = null;
        var professionCount = 0;
        if (typeof window.CharacterCommands !== 'undefined'
            && typeof window.CharacterCommands.getProfessions === 'function') {
            var professions = window.CharacterCommands.getProfessions(id);
            if (Array.isArray(professions)) {
                professionCount = professions.length;
                for (var i = 0; i < professions.length; i++) {
                    if (professions[i].primary === true) {
                        primaryProfession = professions[i];
                        break;
                    }
                }
                if (!primaryProfession && professions.length > 0) {
                    primaryProfession = professions[0];
                }
            }
        }

        var familyCounts = {
            father: null,
            mother: null,
            childCount: 0,
            hasChildren: false
        };
        if (typeof window.FamilyQueries !== 'undefined') {
            if (typeof window.FamilyQueries.getParents === 'function') {
                var parents = window.FamilyQueries.getParents(id);
                if (Array.isArray(parents)) {
                    for (var p = 0; p < parents.length; p++) {
                        var parentEdge = parents[p];
                        if (parentEdge.parentRole === 'father'
                            && parentEdge.parentType === 'biological'
                            && !familyCounts.father) {
                            familyCounts.father = parentEdge.parentId;
                        }
                        if (parentEdge.parentRole === 'mother'
                            && parentEdge.parentType === 'biological'
                            && !familyCounts.mother) {
                            familyCounts.mother = parentEdge.parentId;
                        }
                    }
                }
            }
            if (typeof window.FamilyQueries.getChildIds === 'function') {
                var children = window.FamilyQueries.getChildIds(id);
                if (Array.isArray(children)) {
                    familyCounts.childCount = children.length;
                    familyCounts.hasChildren = children.length > 0;
                }
            }
        }

        return {
            id: projection.id,
            name: projection.name,
            surname: projection.surname,
            fullName: fullName,
            gender: _isMissing(projection.gender) ? 'unknown' : projection.gender,
            age: age,
            birthYear: _isMissing(projection.birthYear) ? null : projection.birthYear,
            deathYear: _isMissing(projection.deathYear) ? null : projection.deathYear,
            deathCause: _isMissing(projection.deathCause) ? null : projection.deathCause,
            isDeceased: projection.isDeceased === true,
            location: null,
            locationId: projection.currentLocationId || null,
            rank: rankDisplay,
            rankId: projection.activeRankId || null,
            household: projection.household || null,
            religionId: projection.religionId || null,
            cultureId: projection.cultureId || null,
            professionCount: professionCount,
            primaryProfession: primaryProfession,
            notes: _isMissing(projection.notes) ? '' : projection.notes,
            epithet: _isMissing(projection.epithet) ? '' : projection.epithet,
            isDeleted: projection.isDeleted === true,
            family: {
                father: familyCounts.father,
                mother: familyCounts.mother,
                childCount: familyCounts.childCount,
                hasChildren: familyCounts.hasChildren
            }
        };
    }

    // =========================================================================
    // 5. CHARACTER FACTS
    // =========================================================================

    function getCharacterFacts(id) {
        var projection = _readCharacter(id);
        if (!projection) return null;

        return {
            id: projection.id,
            name: projection.name,
            surname: projection.surname,
            fullName: _fullName(projection),
            gender: _isMissing(projection.gender) ? 'unknown' : projection.gender,
            birthYear: _isMissing(projection.birthYear) ? null : projection.birthYear,
            age: _age(projection),
            isDeceased: projection.isDeceased === true,
            deathYear: _isMissing(projection.deathYear) ? null : projection.deathYear,
            currentLocationId: projection.currentLocationId || null,
            household: projection.household || null,
            activeRankId: projection.activeRankId || null,
            religionId: projection.religionId || null,
            cultureId: projection.cultureId || null
        };
    }

    function getAllCharacterFacts() {
        var all = _readAll();
        var out = [];
        for (var i = 0; i < all.length; i++) {
            var facts = getCharacterFacts(all[i].id);
            if (facts) out.push(facts);
        }
        return out;
    }

    function getCharacterIdentityFacts(id) {
        return getCharacterFacts(id);
    }

    // =========================================================================
    // 6. FAMILY COMPATIBILITY DELEGATES
    // =========================================================================
    //
    // These preserve the historical call surface. They delegate to
    // FamilyQueries. They do not reimplement family semantics. If
    // FamilyQueries is not loaded, they return null or [] without
    // fabricating data.

    function _familyAvailable() {
        return typeof window.FamilyQueries !== 'undefined';
    }

    function getCharacterChildren(characterId) {
        if (!_hasId(characterId)) return [];
        if (!_familyAvailable()) return [];
        if (typeof window.FamilyQueries.getChildIds !== 'function') return [];
        return window.FamilyQueries.getChildIds(characterId);
    }

    function getCharacterParents(characterId) {
        var empty = { father: null, mother: null, adoptiveParents: [] };
        if (!_hasId(characterId)) return empty;
        if (!_familyAvailable()) return empty;
        if (typeof window.FamilyQueries.getParentsByRole !== 'function') return empty;

        var roles = window.FamilyQueries.getParentsByRole(characterId);
        if (!roles) return empty;

        var father = null;
        var mother = null;
        for (var f = 0; f < roles.fathers.length; f++) {
            if (roles.fathers[f].parentType === 'biological') {
                father = roles.fathers[f].parentId;
                break;
            }
        }
        for (var m = 0; m < roles.mothers.length; m++) {
            if (roles.mothers[m].parentType === 'biological') {
                mother = roles.mothers[m].parentId;
                break;
            }
        }

        var adoptive = [];
        var parents = window.FamilyQueries.getParents(characterId, { parentType: 'legal' });
        if (Array.isArray(parents)) {
            for (var i = 0; i < parents.length; i++) {
                adoptive.push(parents[i].parentId);
            }
        }

        return {
            father: father,
            mother: mother,
            adoptiveParents: adoptive
        };
    }

    function getCharacterSiblings(characterId) {
        if (!_hasId(characterId)) return [];
        if (!_familyAvailable()) return [];
        if (typeof window.FamilyQueries.getSiblings !== 'function') return [];
        return window.FamilyQueries.getSiblings(characterId);
    }

    function getCharacterGrandparents(characterId, generation) {
        if (!_hasId(characterId)) return [];
        if (!_familyAvailable()) return [];
        if (typeof window.FamilyQueries.getGrandparentIds !== 'function') return [];
        return window.FamilyQueries.getGrandparentIds(characterId, generation);
    }

    function getCharacterGrandchildren(characterId, generation) {
        if (!_hasId(characterId)) return [];
        if (!_familyAvailable()) return [];
        if (typeof window.FamilyQueries.getGrandchildIds !== 'function') return [];
        return window.FamilyQueries.getGrandchildIds(characterId, generation);
    }

    function getCharacterKinship(charId1, charId2) {
        if (!_hasId(charId1) || !_hasId(charId2)) return null;
        if (!_familyAvailable()) return null;
        if (typeof window.FamilyQueries.classifyKinship !== 'function') return null;
        return window.FamilyQueries.classifyKinship(charId1, charId2);
    }

    function getCharacterKinshipCloseness(charId1, charId2) {
        if (!_hasId(charId1) || !_hasId(charId2)) return null;
        if (!_familyAvailable()) return null;
        if (typeof window.FamilyQueries.isBloodRelated !== 'function') return null;
        return window.FamilyQueries.isBloodRelated(charId1, charId2);
    }

    // =========================================================================
    // 7. PROFESSION COMPATIBILITY DELEGATES
    // =========================================================================

    function getCharacterProfessions(id) {
        if (!_hasId(id)) return [];
        if (typeof window.CharacterCommands === 'undefined') return [];
        if (typeof window.CharacterCommands.getProfessions !== 'function') return [];
        return window.CharacterCommands.getProfessions(id);
    }

    function getPrimaryProfession(id) {
        if (!_hasId(id)) return null;
        var professions = getCharacterProfessions(id);
        if (!Array.isArray(professions) || professions.length === 0) return null;
        for (var i = 0; i < professions.length; i++) {
            if (professions[i].primary === true) return professions[i];
        }
        return professions[0];
    }

    // =========================================================================
    // 8. EXPORTS
    // =========================================================================

    window.CharacterQueries = {
        searchCharacters: searchCharacters,
        readCharactersByName: readCharactersByName,

        getAllCharacters: getAllCharacters,
        getCharacter: getCharacter,
        getCharacterDisplayName: getCharacterDisplayName,
        getCurrentLocationId: getCurrentLocationId,
        getCharactersInLocations: getCharactersInLocations,

        getCharacterSummary: getCharacterSummary,
        getCharacterFacts: getCharacterFacts,
        getAllCharacterFacts: getAllCharacterFacts,
        getCharacterIdentityFacts: getCharacterIdentityFacts,

        // Family delegation
        getCharacterChildren: getCharacterChildren,
        getCharacterParents: getCharacterParents,
        getCharacterSiblings: getCharacterSiblings,
        getCharacterGrandparents: getCharacterGrandparents,
        getCharacterGrandchildren: getCharacterGrandchildren,
        getCharacterKinship: getCharacterKinship,
        getCharacterKinshipCloseness: getCharacterKinshipCloseness,

        // Profession delegation
        getCharacterProfessions: getCharacterProfessions,
        getPrimaryProfession: getPrimaryProfession
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterQueries;
    }
})();
