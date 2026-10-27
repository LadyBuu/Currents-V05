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
 * FAMILY DELEGATION:
 *   Family queries delegate to FamilyQueries when it is loaded. The
 *   delegating functions preserve the historical call surface
 *   (getCharacterChildren, getCharacterParents, getCharacterSiblings)
 *   so existing callers continue to work. They do not reimplement
 *   family semantics. If FamilyQueries is not loaded, they return
 *   null or [] without fabricating data.
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
 *   moves-based fallback). Baking a resolved display string into the
 *   summary would force one policy choice (e.g. "the place's own name"
 *   vs "the country ancestor" vs "the full breadcrumb") on every
 *   consumer, and would couple this read layer to the location domain —
 *   both of which are out of scope per the module header.
 *
 *   Consumers that need to display a character's location MUST use
 *   locationId (below) and resolve through world.js:
 *
 *       var summary = CharacterQueries.getCharacterSummary(id);
 *       if (!summary) return;
 *
 *       var place = world.getCurrentPlace(
 *           CharacterState.getCharacter(summary.id)
 *       );
 *       var display = place
 *           ? place.displayName
 *           : (summary.locationId ? 'Unknown location' : 'No location');
 *
 *   `summary.locationId` is the raw currentLocationId, exactly as stored
 *   on the character record. It may be a dangling reference (a place
 *   that once existed and has since been deleted). Consumers who need
 *   to distinguish "no location recorded" from "recorded location
 *   missing" check locationId against the resolved place: if locationId
 *   is non-null but the resolved place is null, the reference is
 *   dangling. This matches world.js's DANGING LOCATION REFERENCES
 *   contract.
 *
 *   A future presentation-layer module (e.g. character-presentation.js)
 *   may add a `getCharacterLocationDisplay(characterId)` helper that
 *   centralizes the resolution. Until that module exists, every consumer
 *   resolves through world.js directly. Do NOT re-introduce a fabricated
 *   `location` string in the summary — that was the exact bug this
 *   header section exists to prevent.
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
 *   No accessor is added here for individual traits (e.g. hasTrait) —
 *   the field is exposed as an array and callers use indexOf. That
 *   matches how professions and rankAssignments are exposed.
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
 *   Both fields are null for living characters. Callers that need only
 *   the category can ignore the detail; callers that need the specific
 *   cause ('Consumption') read the detail.
 *
 *   The character record carries both fields (CharacterState._project
 *   also exposes them). getCharacterSummary omitted deathCauseDetail
 *   in an earlier revision, which meant any UI showing a deceased
 *   character could not distinguish the category from the detail.
 *   That gap was closed in Phase 1.3.
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
 *     - Header LOCATION DISPLAY section added. The section explicitly
 *       documents that getCharacterSummary.location is a stable shape
 *       placeholder that is always null, that this module does not
 *       resolve location display strings, and that consumers must
 *       resolve via world.js using locationId. The section exists to
 *       prevent a future contributor from "fixing" the always-null
 *       field by fabricating a display string inside this module.
 *     - Inline comment on the `location` field expanded to match the
 *       header.
 *     - Added explicit out-of-scope entry: "Location semantics and
 *       resolution -> world.js".
 *     - DEPENDENCIES section clarified: world.js is NOT a dependency
 *       of this module.
 *     - No behavioural change. Every function's signature, return
 *       shape, and runtime behaviour are unchanged.
 *   Previous revision (Phase 1.3):
 *     - getCharacterSummary now exposes deathCauseDetail.
 *     - getCharacterFacts now exposes deathCause and deathCauseDetail.
 *     - Header DEATH CAUSE section added.
 *   Previous revision:
 *     - getCharacterSummary.traits and getCharacterFacts.traits added
 *       as defensive copies of the projection's traits array.
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
    //
    // getCharacterSummary.rank must be a human-readable string. The
    // canonical source is:
    //   1. CharacterCommands.getRankAssignment(characterId, activeRankId)
    //      → yields the assignment record (customTitle, number.display)
    //   2. accessors.getRankById(activeRankId) → yields the rank record
    //      (name, symbol) for the fallback display string.
    //
    // If neither layer is available, rank is null. This is deliberate:
    // the summary must never fabricate a rank.

    function _resolveRankDisplay(characterId, activeRankId) {
        if (!_hasId(characterId) || !_hasId(activeRankId)) return null;

        // Prefer the assignment's custom title / display number, because
        // that is what the character has actually been recorded as.
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

        // Fallback: read the rank record itself.
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

            // STABLE SHAPE PLACEHOLDER. Always null. This module does not
            // resolve location display strings. Consumers use locationId
            // and resolve through world.js. See LOCATION DISPLAY in the
            // module header for the resolution pattern. Do NOT populate
            // this field with a fabricated string here — that couples
            // this read layer to the location domain and forces a
            // display-policy choice on every consumer.
            location: null,

            // Raw currentLocationId from the character record. May be a
            // dangling reference (a place that once existed and has since
            // been deleted); check against world.getCurrentPlace() to
            // distinguish "no location" from "recorded location missing".
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
    // 8. FAMILY COMPATIBILITY DELEGATES
    // =========================================================================
    //
    // These return SIMPLIFIED shapes (ids or role-resolved ids), not
    // FamilyQueries' edge wrappers. See the SHAPE NOTE in the header.

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

    /**
     * Numeric kinship closeness between two characters.
     *
     * Returns:
     *   0   self
     *   1   parent / child
     *   2   sibling / grandparent / grandchild
     *   3   aunt/uncle / niece/nephew
     *   4   first cousin
     *   5+  more distant cousins
     *   99  unrelated
     *   null for missing ids or when FamilyQueries is unavailable
     *
     * NOTE: do NOT delegate to FamilyQueries.isBloodRelated — that
     * returns a boolean. This function returns a number, and the two
     * names are deliberately different because the return types are
     * different.
     */
    function getCharacterKinshipCloseness(charId1, charId2) {
        if (!_hasId(charId1) || !_hasId(charId2)) return null;
        if (!_familyAvailable()) return null;
        if (typeof window.FamilyQueries.getKinshipCloseness !== 'function') return null;
        return window.FamilyQueries.getKinshipCloseness(charId1, charId2);
    }

    // =========================================================================
    // 9. PROFESSION COMPATIBILITY DELEGATES
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
    // 10. EXPORTS
    // =========================================================================

    window.CharacterQueries = {
        searchCharacters: searchCharacters,
        readCharactersByName: readCharactersByName,

        getAllCharacters: getAllCharacters,
        getCharacter: getCharacter,
        getCharacterDisplayName: getCharacterDisplayName,
        getCurrentLocationId: getCurrentLocationId,
        getCharactersInLocations: getCharactersInLocations,

        getCharactersByAgeRange: getCharactersByAgeRange,

        getCharacterSummary: getCharacterSummary,
        getCharacterFacts: getCharacterFacts,
        getAllCharacterFacts: getAllCharacterFacts,
        getCharacterIdentityFacts: getCharacterIdentityFacts,

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
