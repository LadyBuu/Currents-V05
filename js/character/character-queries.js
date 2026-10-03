/**
 * =============================================================================
 * STILL WATERS - CHARACTER QUERIES (js/character/character-queries.js)
 * =============================================================================
 *
 * Semantic character-level read API.
 *
 * SCOPE:
 *   - Character search (name substring)
 *   - Character summary projection (identity + age + location + rank +
 *     family counts + primary profession)
 *   - Character facts projection (narrow identity + demographics + rank id
 *     + location id) for cross-domain consumers
 *   - Location-scoped character lookups
 *   - Whole-collection defensive projection
 *
 * OUT OF SCOPE:
 *   - Family graph semantics         → family-queries.js
 *   - Family aggregate counts        → family-statistics.js
 *   - Profession semantics           → professional-queries.js
 *   - Population statistics          → character-statistics.js
 *   - Education status               → education-queries.js
 *   - Relationship semantics         → relationship-queries.js
 *   - Rank semantics                 → role-queries.js (RankQueries facade)
 *   - Mutation                       → character-commands.js
 *   - Persistence                    → storage.js
 *   - Presentation                   → character-ui-list.js, modals
 *
 * COMPATIBILITY DELEGATES:
 *   A small number of functions that used to live here are kept as thin
 *   delegating wrappers. They call the authoritative module and return
 *   its result. They do NOT reimplement semantics. They exist so that
 *   existing callers continue to work during the transition. Each is
 *   marked "COMPAT" below and can be deleted once callers migrate.
 *
 *     getCharacterProfessions(id)             → character-commands.getProfessions
 *     getPrimaryProfession(id)                → professional-queries
 *     getCharactersByProfessionSkill(...)     → professional-queries
 *     getMasterCharacters(...)                → professional-queries
 *
 *     getCharacterChildren(...)               → family-queries
 *     getCharacterParents(...)                → family-queries
 *     getCharacterSiblings(...)               → family-queries
 *     getCharacterGrandparents(...)           → family-queries
 *     getCharacterGrandchildren(...)          → family-queries
 *     getCharacterFirstCousins(...)           → family-queries
 *     getCharacterAuntsAndUncles(...)         → family-queries
 *     getCharacterNiecesAndNephews(...)       → family-queries
 *     getCharacterKinship(a, b)               → family-queries
 *     getCharacterKinshipCloseness(a, b)      → family-queries
 *     getCharacterFamilyStatistics(id)        → family-statistics
 *     getCharacterFamilySummary(id)           → family-statistics
 *
 *     getCharactersByEducationStatus(...)     → education-queries (if loaded)
 *     getCharactersNotInEducation(...)        → education-queries (if loaded)
 *     getCharacterStatistics()                → character-statistics
 *
 * REMOVED FROM THIS MODULE (now live in their own files, delivered in this
 * same refactor slice):
 *   getCharacterStatistics                   → character-statistics.js
 *   getCharacterFacts (professional fields)  → professional-queries.js
 *   getCharactersByProfessionSkill           → professional-queries.js
 *   getMasterCharacters                      → professional-queries.js
 *
 * SEMANTIC RULES:
 *   - Missing/invalid input returns null (singular) or [] (collection).
 *   - Invalid explicit input throws.
 *   - Every returned character is a defensive projection. No live canonical
 *     object leaves this module.
 *   - Reads are reentrant. No _processing guard.
 *   - No fallback dependencies. If a required dependency is missing at load,
 *     this module throws.
 *
 * DEPENDENCIES (REQUIRED, load first):
 *   - character-state.js     (CharacterState) — collection + projections
 *   - time.js                (calculateAge, getCurrentYear, isValidYear)
 *
 * DEPENDENCIES (OPTIONAL, present in the current codebase):
 *   - character-commands.js  (CharacterCommands) — profession delegate
 *   - role-queries.js        (RoleQueries) — rank display
 *   - family-queries.js      (FamilyQueries) — family delegate
 *   - family-statistics.js   (FamilyStatistics) — family stats delegate
 *   - professional-queries.js (ProfessionalQueries) — profession delegate
 *   - character-statistics.js (CharacterStatistics) — statistics delegate
 *   - education-queries.js   (EducationQueries) — education delegate
 *
 *   When an optional dependency is absent, the corresponding compatibility
 *   wrapper returns null (singular) or [] (collection) with no fabricated
 *   data. The wrapper does not invent results.
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 */

(function () {
    'use strict';

    // =========================================================================
    // 0. HARD DEPENDENCY CHECK
    // =========================================================================

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
     * Reads the character projection from CharacterState.
     * Never returns a live canonical object.
     */
    function _readCharacter(id) {
        if (!_hasId(id)) return null;
        return CS.getCharacter(id);
    }

    /**
     * Reads the full projection array from CharacterState.
     */
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

    function _validateIntegerArgument(value, name, allowMissing) {
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
    // 2. SEARCH
    // =========================================================================

    /**
     * Case-insensitive substring match against the full name.
     * Empty/missing query returns the full collection.
     */
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

    // =========================================================================
    // 4. LOCATION-SCOPED LOOKUPS
    // =========================================================================

    /**
     * Returns all characters whose canonical currentLocationId is in the
     * given id set.
     */
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
    // 5. CHARACTER SUMMARY
    // =========================================================================

    /**
     * Returns a compact semantic projection of a character.
     *
     * Composes CharacterState, RankQueries (if loaded), FamilyStatistics
     * (if loaded), FamilyQueries (if loaded), and CharacterCommands (if
     * loaded) to produce a single object suitable for UI and cross-domain
     * consumers.
     *
     * @param {string} id
     * @returns {Object|null}
     */
    function getCharacterSummary(id) {
        var projection = _readCharacter(id);
        if (!projection) return null;

        var age = _age(projection);
        var fullName = _fullName(projection);

        // Rank display — delegate to RoleQueries.getRankSummary if loaded.
        var rankDisplay = null;
        if (projection.activeRankId
            && typeof window.RoleQueries !== 'undefined'
            && typeof window.RoleQueries.getRankSummary === 'function') {
            var rankSummary = window.RoleQueries.getRankSummary(projection.activeRankId);
            if (rankSummary) rankDisplay = rankSummary.name || null;
        }

        // Primary profession — delegate to CharacterCommands if loaded.
        var primaryProfession = null;
        if (typeof window.CharacterCommands !== 'undefined'
            && typeof window.CharacterCommands.getProfessions === 'function') {
            var professions = window.CharacterCommands.getProfessions(id);
            if (Array.isArray(professions) && professions.length > 0) {
                for (var i = 0; i < professions.length; i++) {
                    if (professions[i].primary === true) {
                        primaryProfession = professions[i];
                        break;
                    }
                }
                if (!primaryProfession) primaryProfession = professions[0];
            }
        }

        // Family counts — delegate to FamilyStatistics if loaded.
        var familyCounts = {
            father: null,
            mother: null,
            childCount: 0,
            hasChildren: false
        };
        if (typeof window.FamilyStatistics !== 'undefined'
            && typeof window.FamilyStatistics.getFamilyStatistics === 'function') {
            var stats = window.FamilyStatistics.getFamilyStatistics(id);
            if (stats) {
                familyCounts.father = stats.parents ? (stats.parents.father || null) : null;
                familyCounts.mother = stats.parents ? (stats.parents.mother || null) : null;
                familyCounts.childCount = stats.children ? (stats.children.total || 0) : 0;
                familyCounts.hasChildren = familyCounts.childCount > 0;
            }
        } else if (typeof window.FamilyQueries !== 'undefined') {
            if (typeof window.FamilyQueries.getParents === 'function') {
                var parents = window.FamilyQueries.getParents(id);
                if (parents) {
                    familyCounts.father = parents.father || null;
                    familyCounts.mother = parents.mother || null;
                }
            }
            if (typeof window.FamilyQueries.getChildren === 'function') {
                var children = window.FamilyQueries.getChildren(id);
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
            location: null, // resolved by UI via LocationQueries; kept null here
            locationId: projection.currentLocationId || null,
            rank: rankDisplay,
            rankId: projection.activeRankId || null,
            household: projection.household || null,
            religionId: projection.religionId || null,
            cultureId: projection.cultureId || null,
            professionCount: (function () {
                if (typeof window.CharacterCommands !== 'undefined'
                    && typeof window.CharacterCommands.getProfessions === 'function') {
                    var ps = window.CharacterCommands.getProfessions(id);
                    return Array.isArray(ps) ? ps.length : 0;
                }
                return 0;
            })(),
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
    // 6. CHARACTER FACTS
    // =========================================================================
    //
    // A deliberately narrow projection for cross-domain consumers. It
    // contains character-owned identity facts only. Professional facts
    // (roles, skill levels, experience) live in professional-queries.js.

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

    /**
     * Alias retained for callers that expect the older name.
     */
    function getCharacterIdentityFacts(id) {
        return getCharacterFacts(id);
    }

    // =========================================================================
    // 7. COMPATIBILITY DELEGATES — PROFESSION
    // =========================================================================
    //
    // These delegate to the authoritative modules. They do not reimplement
    // profession semantics. Absent dependencies return null or [] without
    // fabricating data.

    function getCharacterProfessions(id) {
        if (!_hasId(id)) return [];
        if (typeof window.CharacterCommands === 'undefined') return [];
        if (typeof window.CharacterCommands.getProfessions !== 'function') return [];
        return window.CharacterCommands.getProfessions(id);
    }

    function getPrimaryProfession(id) {
        if (!_hasId(id)) return null;
        if (typeof window.ProfessionalQueries !== 'undefined'
            && typeof window.ProfessionalQueries.getPrimaryProfession === 'function') {
            return window.ProfessionalQueries.getPrimaryProfession(id);
        }
        // Fall back to reading professions and picking the primary flag.
        var professions = getCharacterProfessions(id);
        if (!Array.isArray(professions) || professions.length === 0) return null;
        for (var i = 0; i < professions.length; i++) {
            if (professions[i].primary === true) return professions[i];
        }
        return professions[0];
    }

    function getCharactersByProfessionSkill(roleId, minSkill) {
        var roleCheck = _validateStringArgument(roleId, 'roleId', false);
        if (!roleCheck.ok) {
            throw new Error('getCharactersByProfessionSkill: ' + roleCheck.reason);
        }
        var skillCheck = _validateIntegerArgument(minSkill, 'minSkill', false);
        if (!skillCheck.ok) {
            throw new Error('getCharactersByProfessionSkill: ' + skillCheck.reason);
        }
        if (skillCheck.value < 0 || skillCheck.value > 100) {
            throw new Error('getCharactersByProfessionSkill: minSkill must be between 0 and 100');
        }

        if (typeof window.ProfessionalQueries === 'undefined') return [];
        if (typeof window.ProfessionalQueries.getCharactersByProfessionSkill !== 'function') {
            return [];
        }
        return window.ProfessionalQueries.getCharactersByProfessionSkill(
            roleCheck.value,
            skillCheck.value
        );
    }

    function getMasterCharacters(roleId) {
        if (!_isMissing(roleId)) {
            var v = _validateStringArgument(roleId, 'roleId', false);
            if (!v.ok) throw new Error('getMasterCharacters: ' + v.reason);
            roleId = v.value;
        } else {
            roleId = null;
        }

        if (typeof window.ProfessionalQueries === 'undefined') return [];
        if (typeof window.ProfessionalQueries.getMasterCharacters !== 'function') return [];
        return window.ProfessionalQueries.getMasterCharacters(roleId);
    }

    // =========================================================================
    // 8. COMPATIBILITY DELEGATES — FAMILY
    // =========================================================================
    //
    // These delegate to FamilyQueries / FamilyStatistics. Absent dependencies
    // return null or [] without fabricating data.

    function _familyQueriesAvailable() {
        return typeof window.FamilyQueries !== 'undefined';
    }

    function _familyStatisticsAvailable() {
        return typeof window.FamilyStatistics !== 'undefined';
    }

    function getCharacterChildren(characterId, includeDeceased, includeAdopted) {
        if (!_hasId(characterId)) return [];
        if (!_familyQueriesAvailable()) return [];
        if (typeof window.FamilyQueries.getChildren !== 'function') return [];
        return window.FamilyQueries.getChildren(characterId, {
            includeDeceased: includeDeceased === true,
            includeAdopted: includeAdopted !== false
        });
    }

    function getCharacterParents(characterId, includeAdoptive) {
        var empty = { father: null, mother: null, adoptiveParents: [] };
        if (!_hasId(characterId)) return empty;
        if (!_familyQueriesAvailable()) return empty;
        if (typeof window.FamilyQueries.getParents !== 'function') return empty;
        return window.FamilyQueries.getParents(characterId, {
            includeAdoptive: includeAdoptive === true
        });
    }

    function getCharacterSiblings(characterId, includeHalfSiblings, includeDeceased, includeAdopted) {
        if (!_hasId(characterId)) return [];
        if (!_familyQueriesAvailable()) return [];
        if (typeof window.FamilyQueries.getSiblings !== 'function') return [];
        return window.FamilyQueries.getSiblings(characterId, {
            includeHalf: includeHalfSiblings !== false,
            includeDeceased: includeDeceased === true,
            includeAdoptive: includeAdopted !== false
        });
    }

    function getCharacterGrandparents(characterId, includeAdoptive) {
        if (!_hasId(characterId)) return [];
        if (!_familyQueriesAvailable()) return [];
        if (typeof window.FamilyQueries.getGrandparents !== 'function') return [];
        return window.FamilyQueries.getGrandparents(characterId, {
            includeAdoptive: includeAdoptive === true
        });
    }

    function getCharacterGrandchildren(characterId, includeDeceased, includeAdopted) {
        if (!_hasId(characterId)) return [];
        if (!_familyQueriesAvailable()) return [];
        if (typeof window.FamilyQueries.getGrandchildren !== 'function') return [];
        return window.FamilyQueries.getGrandchildren(characterId, {
            includeDeceased: includeDeceased === true,
            includeAdopted: includeAdopted !== false
        });
    }

    function getCharacterFirstCousins(characterId, includeDeceased) {
        if (!_hasId(characterId)) return [];
        if (!_familyQueriesAvailable()) return [];
        if (typeof window.FamilyQueries.getFirstCousins !== 'function') return [];
        return window.FamilyQueries.getFirstCousins(characterId, {
            includeDeceased: includeDeceased === true
        });
    }

    function getCharacterAuntsAndUncles(characterId, includeDeceased) {
        if (!_hasId(characterId)) return [];
        if (!_familyQueriesAvailable()) return [];
        if (typeof window.FamilyQueries.getAuntsAndUncles !== 'function') return [];
        return window.FamilyQueries.getAuntsAndUncles(characterId, {
            includeDeceased: includeDeceased === true
        });
    }

    function getCharacterNiecesAndNephews(characterId, includeDeceased) {
        if (!_hasId(characterId)) return [];
        if (!_familyQueriesAvailable()) return [];
        if (typeof window.FamilyQueries.getNiecesAndNephews !== 'function') return [];
        return window.FamilyQueries.getNiecesAndNephews(characterId, {
            includeDeceased: includeDeceased === true
        });
    }

    function getCharacterKinship(charId1, charId2) {
        if (!_hasId(charId1) || !_hasId(charId2)) return null;
        if (!_familyQueriesAvailable()) return null;
        if (typeof window.FamilyQueries.getKinship !== 'function') return null;
        return window.FamilyQueries.getKinship(charId1, charId2);
    }

    function getCharacterKinshipCloseness(charId1, charId2) {
        if (!_hasId(charId1) || !_hasId(charId2)) return null;
        if (!_familyQueriesAvailable()) return null;
        if (typeof window.FamilyQueries.getKinshipCloseness !== 'function') return null;
        return window.FamilyQueries.getKinshipCloseness(charId1, charId2);
    }

    function getCharacterFamilyStatistics(characterId) {
        if (!_hasId(characterId)) return null;
        if (!_familyStatisticsAvailable()) return null;
        if (typeof window.FamilyStatistics.getFamilyStatistics !== 'function') return null;
        return window.FamilyStatistics.getFamilyStatistics(characterId);
    }

    function getCharacterFamilySummary(characterId) {
        if (!_hasId(characterId)) return null;
        if (!_familyStatisticsAvailable()) return null;
        if (typeof window.FamilyStatistics.getFamilySummary !== 'function') return null;
        return window.FamilyStatistics.getFamilySummary(characterId);
    }

    // =========================================================================
    // 9. COMPATIBILITY DELEGATES — EDUCATION
    // =========================================================================

    function getCharactersByEducationStatus(status, institutionId) {
        var statusCheck = _validateStringArgument(status, 'status', false);
        if (!statusCheck.ok) {
            throw new Error('getCharactersByEducationStatus: ' + statusCheck.reason);
        }
        if (typeof window.EducationQueries === 'undefined'
            || typeof window.EducationQueries.getCharactersByStatus !== 'function') {
            return null;
        }
        return window.EducationQueries.getCharactersByStatus(
            statusCheck.value,
            _isMissing(institutionId) ? null : institutionId
        );
    }

    function getCharactersNotInEducation(minAge, maxAge) {
        var minV = _validateIntegerArgument(minAge, 'minAge', true);
        if (!minV.ok) throw new Error('getCharactersNotInEducation: ' + minV.reason);
        var maxV = _validateIntegerArgument(maxAge, 'maxAge', true);
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
    // 10. COMPATIBILITY DELEGATES — STATISTICS
    // =========================================================================

    function getCharacterStatistics() {
        if (typeof window.CharacterStatistics === 'undefined') return null;
        if (typeof window.CharacterStatistics.getCharacterStatistics !== 'function') return null;
        return window.CharacterStatistics.getCharacterStatistics();
    }

    // =========================================================================
    // 11. EXPORTS
    // =========================================================================

    window.CharacterQueries = {
        // Search
        searchCharacters: searchCharacters,
        readCharactersByName: readCharactersByName,

        // Basic lookups
        getAllCharacters: getAllCharacters,
        getCharacter: getCharacter,
        getCharacterDisplayName: getCharacterDisplayName,
        getCurrentLocationId: getCurrentLocationId,

        // Location-scoped
        getCharactersInLocations: getCharactersInLocations,

        // Summary and facts
        getCharacterSummary: getCharacterSummary,
        getCharacterFacts: getCharacterFacts,
        getAllCharacterFacts: getAllCharacterFacts,
        getCharacterIdentityFacts: getCharacterIdentityFacts,

        // COMPAT — profession
        getCharacterProfessions: getCharacterProfessions,
        getPrimaryProfession: getPrimaryProfession,
        getCharactersByProfessionSkill: getCharactersByProfessionSkill,
        getMasterCharacters: getMasterCharacters,

        // COMPAT — family
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

        // COMPAT — education
        getCharactersByEducationStatus: getCharactersByEducationStatus,
        getCharactersNotInEducation: getCharactersNotInEducation,

        // COMPAT — statistics
        getCharacterStatistics: getCharacterStatistics
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterQueries;
    }
})();
