/**
 * =============================================================================
 * STILL WATERS - CHARACTER QUERIES (js/character/character-queries.js)
 * =============================================================================
 *
 * LOCATION: js/character/character-queries.js
 *
 * Semantic character-level read API.
 *
 * SCOPE:
 *   - Character search (name substring)
 *   - Character summary projection
 *   - Character facts projection for cross-domain consumers
 *   - Location-scoped character lookups
 *   - Whole-collection defensive projection
 *   - Age-range filter
 *   - Move history projection (canonical read for the location domain)
 *   - getCharacterById alias (matches the accessor and shim names)
 *
 * OUT OF SCOPE:
 *   - Family graph semantics         -> family-queries.js
 *   - Profession semantics           -> character-commands.js (reads)
 *   - Trait semantics                -> character-commands.js (reads)
 *   - Population statistics          -> character-statistics.js
 *   - Relationship semantics         -> future relationship domain
 *   - Rank semantics                 -> ranks/rank-queries.js
 *   - Location semantics and
 *     resolution                     -> world.js
 *   - Presentation                   -> character-ui-list.js, modals
 *   - Mutation                       -> character-commands.js
 *   - Persistence                    -> storage.js
 *
 * CHARACTER PROJECTION CONTRACT
 *
 *   This module consumes `CharacterState._project` (via `CS.getCharacter`
 *   and `CS.getAllCharacters`). The projection is BUILT by character-
 *   state.js; this module only reads it. Every read in this module
 *   trusts the projection to include the fields listed below.
 *
 *   GUARANTEED FIELDS (this module's reads break silently if any is
 *   removed from the projection):
 *
 *     id                  string
 *     name                string
 *     surname             string | null
 *     gender              'male' | 'female' | 'unknown'
 *     birthYear           number | null
 *     isDeceased          boolean
 *     deathYear           number | null
 *     deathCause          string | null
 *     deathCauseDetail    string | null
 *     currentLocationId   string | null
 *     activeRankId        string | null
 *     household           string | null
 *     religionId          string | null
 *     cultureId           string | null
 *     notes               string
 *     epithet             string
 *     surnameRules        object | null       (names.js reads this)
 *     surnameSource       string | null       (names.js reads this)
 *     isDeleted           boolean
 *     traits              string[]
 *     moves               MoveRecord[]
 *
 *   This list is what the eleven modules named in accessors.js's
 *   CONCRETE DEPENDENCY GRAPH consume (via this module, via
 *   CharacterState directly, or via window.getCharacterById after this
 *   module installs the projection). If character-state.js ever stops
 *   including one of them, that is the contract this list exists to
 *   enforce.
 *
 *   NOT IN THE PROJECTION CONTRACT (do not read these off a projection;
 *   use the module named):
 *
 *     professions         → CharacterCommands.getProfessions / getProfession
 *     subjectProgress     → CharacterCommands.getSubjectProgress /
 *                           getSubjectProgressAll
 *     isLiterate          → CharacterCommands.isLiterate
 *     education           → CharacterCommands (via EducationLearning)
 *     educationHistory    → CharacterCommands (via EducationHistory)
 *     relationships       → CharacterCommands / relationship domain
 *     friends             → CharacterCommands / relationship domain
 *     rankAssignments     → CharacterCommands.getRankAssignment
 *
 *   `modals-roles.js::_openAssignModal` reads `character.professions`
 *   off the projection for a role-count display. That is OUT OF
 *   CONTRACT and should be migrated to
 *   CharacterQueries.getCharacterProfessions or
 *   CharacterCommands.getProfessions. Follow-up work, not a change to
 *   this file.
 *
 * NAME ALIASES:
 *   getCharacter(id) and getCharacterById(id) are the same function.
 *   getCharacter matches CharacterState's canonical read API.
 *   getCharacterById matches accessors.js and the character-system.js
 *   shim. Both names are exported here so callers that reach for either
 *   convention do not have to know which one is "canonical". They are
 *   not different operations.
 *
 *   RUNTIME RESOLUTION OF window.getCharacterById:
 *     Under the documented load order (accessors.js → character-queries.js
 *     → character-system.js shim), the LAST writer of
 *     window.getCharacterById wins. The shim (or this module, if the
 *     shim is absent) installs the projection-returning version. So at
 *     runtime, window.getCharacterById returns a projection.
 *
 *     The cached-live-entity version from accessors.js is still
 *     reachable as `accessors.getCharacterById` if a caller reaches
 *     into the accessor module directly. Callers that specifically
 *     need a live entity for authorized mutation must use
 *     CharacterState.getLiveCharacterForMutation — this is the
 *     sanctioned accessor for that purpose, and it is the ONLY one
 *     whose return value is safe to mutate.
 *
 *     The accessors.js header documents the same distinction from the
 *     other side; see THE CACHED VERSUS PROJECTION ACCESSOR
 *     DISTINCTION there.
 *
 * FAMILY DELEGATION:
 *   Family queries delegate to FamilyQueries when it is loaded. The
 *   delegating functions preserve the historical call surface
 *   (getCharacterChildren, getCharacterParents, getCharacterSiblings)
 *   so existing callers continue to work. They do not reimplement
 *   family semantics. If FamilyQueries is not loaded, they return
 *   null or [] without fabricating data.
 *
 *   FamilyQueries is OPTIONAL. When it is missing, the family fields
 *   on getCharacterSummary.family default to:
 *     father: null, mother: null, childCount: 0, hasChildren: false
 *   That is a legitimate "no family data available" state, not an
 *   error. Callers that need family data must ensure FamilyQueries is
 *   loaded before calling; the summary does not throw.
 *
 *   SHAPE NOTE:
 *     FamilyQueries.getParents returns EDGE WRAPPERS:
 *       { id, parentId, childId, parentType, parentRole, ... }
 *     This module's getCharacterParents returns a SIMPLIFIED shape:
 *       { father, mother, adoptiveParents }
 *     The simplification is intentional — most callers (modals,
 *     summaries) want the role-resolved parent ids, not the full edge
 *     record. Callers that need the full edge data must call
 *     FamilyQueries.getParents or FamilyQueries.getParentsByRole
 *     directly. Do not "improve" getCharacterParents to return edges;
 *     that would break every modal in the character UI.
 *
 * AGE FILTERING:
 *   getCharactersByAgeRange filters by current age (or age at death for
 *   deceased characters). It uses calculateAge when available and falls
 *   back to a numeric difference when not. It never fabricates an age.
 *
 * RANK DISPLAY:
 *   getCharacterSummary.rank is a STRING (the human-readable rank name
 *   or custom title), or null. It is resolved by reading the rank
 *   assignment via CharacterCommands and then the rank record via
 *   accessors. If either layer is unavailable, rank is null. The raw
 *   activeRankId is exposed separately as rankId.
 *
 * LOCATION DISPLAY:
 *   getCharacterSummary.location is a STABLE SHAPE PLACEHOLDER. It is
 *   always null. It exists so that summary consumers have a uniform
 *   field to read, and so that a future presentation-layer module can
 *   populate it without changing the summary shape.
 *
 *   The summary does NOT resolve location display strings, and it never
 *   will. Resolution belongs to world.js, which owns the canonical
 *   place-lookup, hierarchy walk, and current-location resolution
 *   (including the character.currentLocationId override and the
 *   moves-based fallback). Consumers that need to display a character's
 *   location MUST use locationId and resolve through world.js.
 *
 * MOVE HISTORY:
 *   CharacterState._project now exposes `moves` as a defensive clone of
 *   the character's move array. getMoveHistory(characterId) returns that
 *   same array. This is the canonical read for the location domain.
 *
 *   CharacterQueries does NOT own move records — those are character-
 *   owned and written only by CharacterCommands.updateCharacterFields
 *   (via LocationCommands.recordMove). It reads them from the projection
 *   and returns them. Mutating the returned array does NOT affect
 *   canonical data.
 *
 *   Each move record has the following shape (see character-state.js
 *   _cloneMoves for the canonical field list):
 *
 *     {
 *       year:             number | null,
 *       locationId:       string | null,
 *       locationName:     string | null,
 *       note:             string | null,
 *       fromLocationId:   string | null,
 *       fromLocationName: string | null,
 *       isBirthMove:      boolean,
 *       timestamp:        number | null
 *     }
 *
 *   Return values:
 *     Array    move records, one per recorded move (chronological order
 *              as written by CharacterCommands.updateCharacterFields —
 *              LocationCommands.recordMove appends, so the array is
 *              ordered oldest-first)
 *     null     character not found
 *     []       character exists, no moves recorded
 *
 *   Required at load time by:
 *     - location-queries.js
 *     - location-movement.js
 *     - location-view-models.js
 *
 * getCharactersAtLocation:
 *   Convenience wrapper over getCharactersInLocations([locationId])
 *   with optional filtering. Required at load time by
 *   location-view-models.js (used in buildBulkMoveModel). Exposed here
 *   rather than as a world.js query because it operates purely on
 *   character projections.
 *
 * TRAITS:
 *   getCharacterSummary.traits and getCharacterFacts.traits are fresh
 *   arrays cloned from the character projection. Traits are canonical
 *   trait ids (see constants/character-traits.js). Both projections
 *   include the field because both are consumed by code that needs
 *   trait access:
 *
 *     summary — for UI and card rendering (character-ui-list, modals)
 *     facts   — for cross-domain rules and calculations
 *               (jealousy-queries, affair-queries, settlement)
 *
 * DEATH CAUSE:
 *   Both projections expose the death information as two fields:
 *
 *     deathCause        stable category id (natural | disease |
 *                       accident | murder | execution | childbed_fever |
 *                       unknown), or null
 *     deathCauseDetail  free-text detail ('Consumption', 'Treason',
 *                       'Old age'), or null
 *
 *   Both fields are null for living characters.
 *
 * PROFESSIONS AND OTHER CHARACTER-OWNED STORES:
 *   Professions, subjectProgress, isLiterate, education, educationHistory,
 *   relationships, friends, rankAssignments — none of these are in the
 *   projection contract. Each has a dedicated reader owned by the module
 *   that writes it. This module's getCharacterProfessions and
 *   getPrimaryProfession delegate to CharacterCommands; every other
 *   store is read by its owning module's queries. Do NOT read any of
 *   these fields off a projection.
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
 *   - character-commands.js  (CharacterCommands) — used by
 *                            getCharacterSummary for profession and
 *                            rank display resolution
 *   - family-queries.js      (FamilyQueries) — used by
 *                            getCharacterSummary for family counts
 *                            and by the family delegate functions
 *   - accessors.js           (getRankById) — used by
 *                            getCharacterSummary for rank display
 *                            fallback
 *
 * NOTE ON world.js:
 *   world.js is NOT a dependency of this module. Location resolution
 *   belongs to world.js, and this module deliberately does not pull it
 *   in. Consumers resolve via world.getCurrentPlace() using the
 *   summary's locationId. See LOCATION DISPLAY above.
 *
 * ICON POLICY: No emojis. No icons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision:
 *     - Header CHARACTER PROJECTION CONTRACT section added. Names the
 *       fields that must remain on the projection (this module and the
 *       eleven modules named in accessors.js depend on them), and the
 *       fields that must NOT be read off the projection (professions,
 *       subjectProgress, etc. — each has a dedicated reader). Closes
 *       the contract that accessors.js's CONCRETE DEPENDENCY GRAPH
 *       only half-documented.
 *     - Header NAME ALIASES section extended: RUNTIME RESOLUTION OF
 *       window.getCharacterById subsection added. Documents that under
 *       the documented load order the projection-returning version
 *       wins, and that accessors.getCharacterById remains reachable
 *       but is not the sanctioned live-entity path (which is
 *       CharacterState.getLiveCharacterForMutation).
 *     - Header FAMILY DELEGATION section extended: documents that
 *       FamilyQueries is OPTIONAL and that getCharacterSummary.family
 *       defaults to null/0/false when FamilyQueries is missing.
 *     - Header MOVE HISTORY section extended: enumerates the exact
 *       per-record shape (matching character-state.js::_cloneMoves) so
 *       a caller does not need to read character-state.js to know the
 *       fields.
 *     - Header PROFESSIONS AND OTHER CHARACTER-OWNED STORES section
 *       added. Documents the out-of-contract reads.
 *     - Inline comment added near getCharacterSummary's profession
 *       resolution: "Do NOT read projection.professions; use
 *       CharacterCommands.getProfessions." The code already did; the
 *       comment prevents a future regression.
 *     - No behavioural change. Every function's return value is
 *       identical.
 *   Previous revisions:
 *     - getMoveHistory, getCharactersAtLocation, getCharacterById
 *       alias added.
 *     - LOCATION DISPLAY section added.
 *     - DEATH CAUSE section added.
 *     - traits added to summary and facts.
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

    /**
     * Returns a defensive copy of the traits array from a character
     * projection. Missing/malformed yields [].
     */
    function _copyTraits(projection) {
        if (!projection || !Array.isArray(projection.traits)) return [];
        return projection.traits.slice();
    }

    /**
     * Returns a defensive copy of the moves array from a character
     * projection. The projection's moves are already cloned by
     * CharacterState._project, so this is a second-level clone — cheap
     * and ensures callers cannot mutate even the projection's copy.
     *
     * Records are cloned field-by-field using the canonical move shape
     * (see character-state.js::_cloneMoves).
     */
    function _copyMoves(projection) {
        if (!projection || !Array.isArray(projection.moves)) return [];
        var out = [];
        for (var i = 0; i < projection.moves.length; i++) {
            var m = projection.moves[i];
            if (!m || typeof m !== 'object') continue;
            out.push({
                year: _isMissing(m.year) ? null : m.year,
                locationId: _isMissing(m.locationId) ? null : m.locationId,
                locationName: _isMissing(m.locationName) ? null : m.locationName,
                note: _isMissing(m.note) ? null : m.note,
                fromLocationId: _isMissing(m.fromLocationId) ? null : m.fromLocationId,
                fromLocationName: _isMissing(m.fromLocationName) ? null : m.fromLocationName,
                isBirthMove: m.isBirthMove === true,
                timestamp: _isMissing(m.timestamp) ? null : m.timestamp
            });
        }
        return out;
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

    /**
     * Alias of getCharacter(id).
     *
     * The accessor layer (accessors.js) and the character-system.js shim
     * both expose "getCharacterById". Consumers reaching for either
     * convention use this name. Same operation, same return shape.
     *
     * RUNTIME RESOLUTION: under the documented load order, this module
     * (or the shim, whichever loads last) installs
     * window.getCharacterById. At runtime the projection-returning
     * version from this module wins. The cached-live-entity version
     * from accessors.js remains reachable as
     * accessors.getCharacterById, but the sanctioned live-entity path
     * is CharacterState.getLiveCharacterForMutation. See NAME ALIASES
     * in the header.
     */
    function getCharacterById(id) {
        return getCharacter(id);
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

    /**
     * Returns all characters whose currentLocationId matches `locationId`,
     * optionally filtered to living characters.
     *
     * @param {string} locationId
     * @param {Object} [options]
     * @param {boolean} [options.aliveOnly] - default false
     * @returns {Array}
     */
    function getCharactersAtLocation(locationId, options) {
        if (!_hasId(locationId)) return [];
        options = options || {};

        var chars = getCharactersInLocations([locationId]);

        if (options.aliveOnly === true) {
            var filtered = [];
            for (var i = 0; i < chars.length; i++) {
                if (chars[i].isDeceased !== true) filtered.push(chars[i]);
            }
            return filtered;
        }

        return chars;
    }

    // =========================================================================
    // 4. AGE-RANGE FILTER
    // =========================================================================

    /**
     * Returns all characters whose age falls in [minAge, maxAge].
     *
     * Age is computed from the character's current year (or death year
     * for deceased characters). Characters whose age cannot be
     * determined are excluded, not fabricated.
     *
     * @param {number} minAge
     * @param {number} maxAge
     * @param {boolean} [includeDeceased] default true
     * @returns {Array}
     */
    function getCharactersByAgeRange(minAge, maxAge, includeDeceased) {
        var minV = _validateIntegerArgument(minAge, 'minAge', false);
        if (!minV.ok) throw new Error('getCharactersByAgeRange: ' + minV.reason);
        var maxV = _validateIntegerArgument(maxAge, 'maxAge', false);
        if (!maxV.ok) throw new Error('getCharactersByAgeRange: ' + maxV.reason);

        if (minV.value < 0) {
            throw new Error('getCharactersByAgeRange: minAge must not be negative');
        }
        if (maxV.value < minV.value) {
            throw new Error('getCharactersByAgeRange: maxAge must not be less than minAge');
        }

        if (includeDeceased === undefined) includeDeceased = true;

        var all = _readAll();
        var out = [];
        for (var i = 0; i < all.length; i++) {
            var c = all[i];
            if (includeDeceased !== true && c.isDeceased === true) continue;

            var age = _age(c);
            if (typeof age !== 'number' || !Number.isFinite(age)) continue;
            if (age < minV.value || age > maxV.value) continue;
            out.push(c);
        }
        return out;
    }

    // =========================================================================
    // 5. RANK DISPLAY RESOLUTION
    // =========================================================================

    function _resolveRankDisplay(characterId, activeRankId) {
        if (!_hasId(characterId) || !_hasId(activeRankId)) return null;

        if (typeof window.CharacterCommands !== 'undefined'
            && typeof window.CharacterCommands.getRankAssignment === 'function') {
            var assignment = window.CharacterCommands.getRankAssignment(
                characterId,
                activeRankId
            );
            if (assignment) {
                if (_hasId(assignment.customTitle)) {
                    return assignment.customTitle;
                }
                if (assignment.number
                    && typeof assignment.number.display === 'string'
                    && assignment.number.display.length > 0) {
                    return assignment.number.display;
                }
            }
        }

        if (typeof window.getRankById === 'function') {
            var rank = window.getRankById(activeRankId);
            if (rank && typeof rank.name === 'string' && rank.name.length > 0) {
                return rank.name;
            }
        }

        return null;
    }

    // =========================================================================
    // 6. CHARACTER SUMMARY
    // =========================================================================

    function getCharacterSummary(id) {
        var projection = _readCharacter(id);
        if (!projection) return null;

        var age = _age(projection);
        var fullName = _fullName(projection);

        var rankDisplay = _resolveRankDisplay(projection.id, projection.activeRankId);

        // Do NOT read projection.professions here. The projection is
        // not guaranteed to include professions; CharacterCommands is
        // the canonical reader. See PROFESSIONS AND OTHER
        // CHARACTER-OWNED STORES in the header.
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
            deathCauseDetail: _isMissing(projection.deathCauseDetail)
                ? null
                : projection.deathCauseDetail,
            isDeceased: projection.isDeceased === true,
            traits: _copyTraits(projection),

            // STABLE SHAPE PLACEHOLDER. Always null. Consumers use
            // locationId and resolve through world.js. See
            // LOCATION DISPLAY in the module header.
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
    // 7. CHARACTER FACTS
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
            deathCause: _isMissing(projection.deathCause) ? null : projection.deathCause,
            deathCauseDetail: _isMissing(projection.deathCauseDetail)
                ? null
                : projection.deathCauseDetail,
            traits: _copyTraits(projection),
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
    // 8. MOVE HISTORY
    // =========================================================================
    //
    // Canonical read for the location domain. Reads character.moves from
    // the projection (populated by CharacterState._project).
    //
    // Returns:
    //   Array    move records, chronological order (oldest-first)
    //   null     character not found
    //   []       character exists, no moves recorded
    //
    // See MOVE HISTORY in the header for the per-record shape.
    //
    // Required at load time by:
    //   - location-queries.js
    //   - location-movement.js
    //   - location-view-models.js

    function getMoveHistory(characterId) {
        if (!_hasId(characterId)) return null;
        var projection = _readCharacter(characterId);
        if (!projection) return null;
        return _copyMoves(projection);
    }

    // =========================================================================
    // 9. FAMILY COMPATIBILITY DELEGATES
    // =========================================================================
    //
    // FamilyQueries is OPTIONAL. When it is missing, every delegating
    // function returns its documented empty value ([] or null or the
    // empty parents object). No fabrication. See FAMILY DELEGATION in
    // the header.

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
        if (typeof window.FamilyQueries.getKinshipCloseness !== 'function') return null;
        return window.FamilyQueries.getKinshipCloseness(charId1, charId2);
    }

    // =========================================================================
    // 10. PROFESSION COMPATIBILITY DELEGATES
    // =========================================================================
    //
    // Profession reads delegate to CharacterCommands. Do NOT read
    // projection.professions; it is not in the projection contract.
    // See PROFESSIONS AND OTHER CHARACTER-OWNED STORES in the header.

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
    // 11. EXPORTS
    // =========================================================================

    window.CharacterQueries = {
        searchCharacters: searchCharacters,
        readCharactersByName: readCharactersByName,

        getAllCharacters: getAllCharacters,
        getCharacter: getCharacter,
        getCharacterById: getCharacterById,
        getCharacterDisplayName: getCharacterDisplayName,
        getCurrentLocationId: getCurrentLocationId,
        getCharactersInLocations: getCharactersInLocations,
        getCharactersAtLocation: getCharactersAtLocation,

        getCharactersByAgeRange: getCharactersByAgeRange,

        getCharacterSummary: getCharacterSummary,
        getCharacterFacts: getCharacterFacts,
        getAllCharacterFacts: getAllCharacterFacts,
        getCharacterIdentityFacts: getCharacterIdentityFacts,

        getMoveHistory: getMoveHistory,

        getCharacterChildren: getCharacterChildren,
        getCharacterParents: getCharacterParents,
        getCharacterSiblings: getCharacterSiblings,
        getCharacterGrandparents: getCharacterGrandparents,
        getCharacterGrandchildren: getCharacterGrandchildren,
        getCharacterKinship: getCharacterKinship,
        getCharacterKinshipCloseness: getCharacterKinshipCloseness,

        getCharacterProfessions: getCharacterProfessions,
        getPrimaryProfession: getPrimaryProfession
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = window.CharacterQueries;
    }
})();
