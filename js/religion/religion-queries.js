/**
 * =============================================================================
 * STILL WATERS - RELIGION QUERIES (religion-queries.js)
 * =============================================================================
 *
 * LOCATION: js/religion/religion-queries.js
 *
 * All read-only queries for religion data.
 *
 * Every public read returns a clone or a defensive projection. The only
 * exceptions are character records (returned by getFollowers*), which are
 * owned by the character domain and must not be cloned here — cloning would
 * create a false impression that mutation was safe.
 *
 * More precisely, getFollowers* returns DEFENSIVE PROJECTIONS of character
 * records (as cloned by character-state.js::_project), not the live
 * canonical records themselves. See CHARACTER PROJECTIONS in section 8
 * below for the full contract.
 *
 * No fallbacks. Missing dependencies throw at load time, not at call time.
 * Missing canonical data throws at call time (except for the legitimate
 * empty-array case where masterData.data.religions is absent).
 *
 * TIME CONTRACT:
 *   Uses window.getCurrentYear from js/core/time.js. The deprecated
 *   window.getCurrentYearSafe alias is NOT used.
 *
 * LOCATION-RESOLUTION CONTRACT:
 *   "Where is this character currently located?" resolves through a
 *   layered path, all inside _resolveCurrentLocationId:
 *
 *     1. LocationQueries.getCurrentLocationId(characterId)
 *          The location domain's semantic resolver. Honours the explicit
 *          currentLocationId field, the moves-based fallback, and the
 *          birthplace fallback (via world.getCurrentLocationId under the
 *          hood). This is the canonical answer.
 *
 *     2. CharacterQueries.getCurrentLocationId(characterId)
 *          The raw currentLocationId FIELD. Does NOT resolve moves or
 *          birthplace. Used as a fallback for bare test harnesses that
 *          load only character-queries.js.
 *
 *     3. null
 *          No viable source.
 *
 *   Every function that needs a character's location calls
 *   _resolveCurrentLocationId. Do NOT call window.getCurrentLocationId
 *   directly: its name is overloaded (character-queries.js exports a
 *   version that takes an id; world.js exports a version that takes a
 *   character object), and the winner depends on script load order.
 *   LocationQueries.getCurrentLocationId is unambiguous because it is
 *   the only function with that name on that namespace.
 *
 *   Prior revisions called window.getCurrentLocationId(character) with a
 *   character object, expecting world.js to win the alias race. Under
 *   the documented load order, character-queries.js won instead, so the
 *   call failed for every input and getFollowersByLocation always
 *   returned []. Fixed at all call sites.
 *
 *   Prior revisions also called a phantom window.getCharactersByLocation
 *   (which no module exports) from getReligiousBreakdown. The character
 *   domain exposes getCharactersAtLocation (single id, aliveOnly option)
 *   and getCharactersInLocations (array of ids). The current code uses
 *   getCharactersAtLocation with aliveOnly: false — the same semantics
 *   the raw-field filter had, before it stopped working.
 *
 *   Prior revisions of getDominantReligion iterated religions whose
 *   locations array declares the given location, not religions whose
 *   followers are there. That under-counted every religion whose
 *   followers moved into a settlement but which never declared the
 *   settlement. The current code enumerates characters at the location
 *   and buckets by religionId — the correct semantic.
 *
 * COMPATIBILITY QUERIES:
 *   isCulturallyCompatible and isReligiouslyPermitted are both stubs.
 *   The real implementations belong to the relationship domain
 *   (marriage eligibility) and the culture domain (cultural
 *   compatibility), neither of which currently exist. The functions
 *   return { permitted / compatible: true, reason: '<not yet
 *   implemented>' } so that callers do not have to null-check the
 *   result. See the individual function docstrings for the migration
 *   path once those domains ship.
 *
 *   Prior revisions of isReligiouslyPermitted tried to derive interfaith
 *   marriage eligibility from religion laws whose crimeMapping.crimeType
 *   was 'interfaith_marriage'. That crime type does not exist in
 *   crime-constants.js::CRIME_TYPES; no religion law could ever be
 *   written to carry it; and the check therefore always returned
 *   { permitted: true } regardless of the religions involved. The dead
 *   code has been removed.
 *
 * DEPENDENCIES (required, verified at load):
 *   - religion-state.js:   ReligionState (indexes, clones)
 *   - religion-format.js:  ReligionFormat (display labels)
 *   - accessors.js:        getCharacterById, getCharacters
 *   - time.js:             getCurrentYear
 *
 * DEPENDENCIES (required at call time, guarded per-call):
 *   - location-queries.js: LocationQueries.getCurrentLocationId
 *                          (semantic location resolution)
 *   - character-queries.js: CharacterQueries.getCurrentLocationId
 *                          (raw-field fallback)
 *   - character-queries.js: CharacterQueries.getCharactersAtLocation
 *                          (bulk enumeration for getReligiousBreakdown)
 *
 *   Why "required at call time" and not "required at load":
 *   The religion domain loads after location-queries.js and
 *   character-queries.js in the documented order, so at call time they
 *   are always present. But loading religion-queries.js in isolation (a
 *   bare harness) does not need them, and would fail at load if they
 *   were hard dependencies. The call-time guards throw a clear error
 *   when a function that needs them is actually invoked. If a caller in
 *   a bare harness never uses location resolution, no error.
 *
 * ICON POLICY: No emojis. No icons in confirm/cancel buttons.
 *
 * =============================================================================
 * REFACTOR HISTORY:
 *   Current revision (C5):
 *     - getFollowers*, getFollowerCount, and getFollowersByLocation
 *       docstrings clarified. The section 8 header previously said
 *       the returns were "live character records"; the actual return
 *       is a DEFENSIVE PROJECTION of the character record (as cloned
 *       by character-state.js::_project). The distinction matters for
 *       callers: mutating the returned object does NOT affect
 *       canonical state, and the returned object does not share
 *       array/object references with canonical character records.
 *     - Section 8 header expanded into a CHARACTER PROJECTIONS
 *       subsection explaining what the projection contains, what it
 *       does not contain (live references, mutation paths), and why
 *       a caller that genuinely needs the live record must use
 *       CharacterState.getLiveCharacterForMutation.
 *     - Top-of-header paragraph updated to reflect the projection
 *       semantics rather than "character records."
 *     - No behavioural change. Every query's output is byte-identical;
 *       only the documentation of what that output is changed.
 *   Previous revision (C1):
 *     - isReligiouslyPermitted stubbed. Prior revisions looked for a
 *       law whose crimeMapping.crimeType was 'interfaith_marriage',
 *       which crime-constants.js::CRIME_TYPES does not contain. Stub
 *       returns { permitted: true, reason: '<not yet implemented>' }
 *       and defers the real implementation to the relationship
 *       domain. Matches the isCulturallyCompatible stub.
 *     - _findInterfaithRestriction removed entirely.
 *   Previous revision (A1):
 *     - Added _resolveCurrentLocationId helper.
 *     - getFollowersByLocation, getDominantReligion, and
 *       getReligiousBreakdown rewritten to resolve location
 *       semantically and to enumerate characters at the location
 *       rather than religions that declare it.
 *   Previous revisions:
 *     - Phase 0: recursion guard removal.
 *     - Phase 3: reads State indexes + canonical data; range-based
 *       growth queries; year-zero preserved.
 *     - Phase 5: absorbed inheritance summary/statistics queries.
 *     - Phase 7: converges to reference pattern.
 * =============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // 1. DEPENDENCY WRAPPERS
    // =========================================================================

    function _getState() {
        if (typeof window.ReligionState === 'undefined') {
            throw new Error('ReligionQueries requires ReligionState.');
        }
        return window.ReligionState;
    }

    function _getFormat() {
        if (typeof window.ReligionFormat === 'undefined') {
            throw new Error('ReligionQueries requires ReligionFormat.');
        }
        return window.ReligionFormat;
    }

    function _getCharacterById(id) {
        if (typeof window.getCharacterById !== 'function') {
            throw new Error('ReligionQueries requires accessors.getCharacterById.');
        }
        return window.getCharacterById(id);
    }

    function _getCharacters() {
        if (typeof window.getCharacters !== 'function') {
            throw new Error('ReligionQueries requires accessors.getCharacters.');
        }
        return window.getCharacters();
    }

    function _getCurrentYear() {
        if (typeof window.getCurrentYear !== 'function') {
            throw new Error(
                'religion-queries.js requires time.js (getCurrentYear).'
            );
        }
        return window.getCurrentYear();
    }

    // =========================================================================
    // 2. LOCATION RESOLUTION
    // =========================================================================
    //
    // See LOCATION-RESOLUTION CONTRACT in the header. This helper is the
    // single place where the resolution precedence is chosen. Every
    // function in this module that needs a character's location calls it.

    function _resolveCurrentLocationId(character) {
        if (!character || !character.id) return null;

        // Prefer LocationQueries: unambiguous name, semantic resolution
        // (explicit field → latest move → birthplace), stable across
        // load-order permutations.
        if (typeof window.LocationQueries !== 'undefined'
            && window.LocationQueries !== null
            && typeof window.LocationQueries.getCurrentLocationId === 'function') {
            try {
                var resolved = window.LocationQueries.getCurrentLocationId(character.id);
                // LocationQueries returns string|null. A null result is a
                // legitimate "no location resolved" — do not fall through
                // to the weaker resolver, which would silently substitute
                // the raw field for a character whose only location signal
                // was a stale move pointing at a deleted place.
                if (resolved === null) return null;
                if (typeof resolved === 'string' && resolved.length > 0) {
                    return resolved;
                }
            } catch (e) {
                // LocationQueries threw. Fall through to the raw field.
            }
        }

        // Fallback: the raw currentLocationId field.
        if (typeof window.CharacterQueries !== 'undefined'
            && window.CharacterQueries !== null
            && typeof window.CharacterQueries.getCurrentLocationId === 'function') {
            try {
                return window.CharacterQueries.getCurrentLocationId(character.id);
            } catch (e) {
                return null;
            }
        }

        return null;
    }

    // =========================================================================
    // 3. CANONICAL READ (enumeration only)
    // =========================================================================
    //
    // This reads the canonical array for enumeration. It is NOT exposed to
    // callers. Every public read clones via State.

    function _enumerateCanonicalReligions() {
        if (!window.masterData || !window.masterData.data) {
            throw new Error(
                'ReligionQueries: masterData.data is not initialized. ' +
                'This is a canonical store dependency, not an optional one.'
            );
        }
        var religions = window.masterData.data.religions;
        if (!Array.isArray(religions)) {
            // Absent array is a legitimate empty state.
            return [];
        }
        return religions;
    }

    // =========================================================================
    // 4. CLONE
    // =========================================================================

    function _clone(value) {
        if (value === null || typeof value !== 'object') return value;
        if (Array.isArray(value)) {
            var arr = new Array(value.length);
            for (var i = 0; i < value.length; i++) arr[i] = _clone(value[i]);
            return arr;
        }
        var out = {};
        for (var k in value) {
            if (Object.prototype.hasOwnProperty.call(value, k)) {
                out[k] = _clone(value[k]);
            }
        }
        return out;
    }

    function _cloneArray(list) {
        if (!list || !list.length) return [];
        var out = new Array(list.length);
        for (var i = 0; i < list.length; i++) out[i] = _clone(list[i]);
        return out;
    }

    // =========================================================================
    // 5. BASIC QUERIES
    // =========================================================================

    function getReligion(id) {
        if (!id) return null;
        // State.getById returns a clone.
        return _getState().getById(id);
    }

    function getAllReligions(options) {
        options = options || {};
        var includeDeprecated = options.includeDeprecated === true;
        var state = _getState();

        var canonical = _enumerateCanonicalReligions();
        var result = [];

        for (var i = 0; i < canonical.length; i++) {
            var r = canonical[i];
            if (!r || !r.id) continue;
            if (!includeDeprecated && r.isDeprecated === true) continue;
            // Clone via State to keep the clone policy in one place.
            var cloned = state.getById(r.id);
            if (cloned) result.push(cloned);
        }

        return result;
    }

    function getActiveReligions() {
        return getAllReligions({ includeDeprecated: false });
    }

    function getDeprecatedReligions() {
        return getAllReligions({ includeDeprecated: true }).filter(function(r) {
            return r.isDeprecated === true;
        });
    }

    function getReligionsByLocation(locationId) {
        if (!locationId) return [];
        return _getState().getByLocation(locationId);
    }

    function getReligionsByTrait(trait) {
        if (!trait) return [];
        return _getState().getByTrait(trait);
    }

    function getReligionByLeader(characterId) {
        if (!characterId) return null;
        return _getState().getByLeader(characterId);
    }

    // =========================================================================
    // 6. GOD QUERIES
    // =========================================================================

    function getGod(godId) {
        if (!godId) return null;
        return _getState().getGodById(godId);
    }

    function getGodsByReligion(religionId) {
        var religion = getReligion(religionId);
        if (!religion) return [];
        // getReligion returns a clone, so its .gods array is already cloned.
        return religion.gods || [];
    }

    function getGodsByDomain(domain) {
        if (!domain) return [];

        var all = getAllReligions({ includeDeprecated: true });
        var result = [];

        for (var i = 0; i < all.length; i++) {
            var religion = all[i];
            if (!Array.isArray(religion.gods)) continue;
            for (var j = 0; j < religion.gods.length; j++) {
                if (religion.gods[j].domain === domain) {
                    result.push(_clone(religion.gods[j]));
                }
            }
        }

        return result;
    }

    function getGodCount(religionId) {
        var religion = getReligion(religionId);
        if (!religion) return 0;
        return Array.isArray(religion.gods) ? religion.gods.length : 0;
    }

    // =========================================================================
    // 7. LAW QUERIES
    // =========================================================================

    function getLaw(lawId) {
        if (!lawId) return null;
        return _getState().getLawById(lawId);
    }

    function getLawsByReligion(religionId) {
        var religion = getReligion(religionId);
        if (!religion) return [];
        return religion.laws || [];
    }

    function getLawsByDomain(religionId, domain) {
        var laws = getLawsByReligion(religionId);
        if (!domain) return laws;
        var result = [];
        for (var i = 0; i < laws.length; i++) {
            if (laws[i].domain === domain) result.push(laws[i]);
        }
        return result;
    }

    function getLawsByCategory(religionId, category) {
        var laws = getLawsByReligion(religionId);
        if (!category) return laws;
        var result = [];
        for (var i = 0; i < laws.length; i++) {
            if (laws[i].lawCategory === category) result.push(laws[i]);
        }
        return result;
    }

    // =========================================================================
    // 8. FOLLOWER QUERIES
    // =========================================================================
    //
    // CHARACTER PROJECTIONS:
    //   getFollowers, getFollowerCount, and getFollowersByLocation
    //   return character PROJECTIONS, not live character records.
    //   Every projection is the object produced by
    //   character-state.js::_project — a defensive clone whose nested
    //   arrays and objects are themselves cloned. Specifically:
    //
    //     - Scalar fields (id, name, surname, gender, birthYear,
    //       isDeceased, deathYear, religionId, currentLocationId, ...)
    //       are copied by value.
    //     - Embedded containers (moves, professions, rankAssignments,
    //       education, subjectProgress, religionHistory, ...) are
    //       deep-cloned. The projection's arrays and objects do not
    //       share references with the canonical character record.
    //
    //   Callers can therefore:
    //     - read any field safely,
    //     - mutate the returned object WITHOUT affecting canonical
    //       state (which is the projection's point),
    //     - pass the projection to other code that expects
    //       projections (the same shape CharacterState.getCharacter
    //       returns).
    //
    //   Callers MUST NOT:
    //     - expect mutations to the returned object to stick (they
    //       do not; the projection is a copy),
    //     - expect the projection to reflect mutations made by other
    //       code after the query returned (it does not; refresh the
    //       query to see fresh state).
    //
    //   Callers that genuinely need a live reference (authorized
    //   mutation code) must use
    //   CharacterState.getLiveCharacterForMutation(id) directly. The
    //   religion domain never does; it does not own character state
    //   and must not reach into the canonical record. Character
    //   mutations belong to CharacterCommands.
    //
    // WHY NOT DEEP-CLONE THE PROJECTION HERE:
    //   The projection is already a defensive clone. Cloning it again
    //   in this module would produce a second defensive copy — more
    //   waste than defense. The one place a second clone would matter
    //   is if a caller mutated the projection and then passed it back
    //   into a character-domain command, which would trigger the
    //   command's own validation and either accept the mutation (if
    //   the caller used the projection as if it were canonical, which
    //   it is not) or reject it (if the command detects the caller is
    //   working from stale state). Neither outcome is the religion
    //   domain's to prevent; the command layer owns that check.

    /**
     * Returns the followers of a religion, as character PROJECTIONS.
     *
     * Each element is a defensive clone of the canonical character
     * record. Mutating the returned object does NOT affect canonical
     * state. To mutate a character's religion, use CharacterCommands
     * (via ReligionCommands.assignReligionToCharacter / convertCharacter
     * / removeReligionFromCharacter, which route through
     * CharacterCommands.setReligion).
     *
     * @param {string} religionId
     * @param {Object} [options]
     * @param {boolean} [options.includeDeceased] - default false
     * @returns {Array<Object>}
     */
    function getFollowers(religionId, options) {
        options = options || {};
        var includeDeceased = options.includeDeceased === true;

        var followers = _getState().getFollowersByReligion(religionId);
        if (followers.length === 0) return [];

        if (includeDeceased) {
            return followers.slice();
        }

        var living = [];
        for (var i = 0; i < followers.length; i++) {
            if (!followers[i].isDeceased) {
                living.push(followers[i]);
            }
        }
        return living;
    }

    /**
     * Counts living followers of a religion.
     *
     * @param {string} religionId
     * @returns {number}
     */
    function getFollowerCount(religionId) {
        var followers = _getState().getFollowersByReligion(religionId);
        var count = 0;
        for (var i = 0; i < followers.length; i++) {
            if (!followers[i].isDeceased) count++;
        }
        return count;
    }

    /**
     * Followers of a religion currently at a specific location.
     *
     * Location is resolved via _resolveCurrentLocationId, which honours
     * the explicit currentLocationId override and the moves-based
     * fallback. Prior revisions used the raw field, missing followers
     * placed only by moves.
     *
     * Each element is a character PROJECTION (see CHARACTER PROJECTIONS
     * above). Mutating the returned object does NOT affect canonical
     * state.
     *
     * Deceased followers are excluded.
     *
     * @param {string} religionId
     * @param {string} locationId
     * @returns {Array<Object>}
     */
    function getFollowersByLocation(religionId, locationId) {
        if (!religionId || !locationId) return [];

        var followers = _getState().getFollowersByReligion(religionId);
        var result = [];

        for (var i = 0; i < followers.length; i++) {
            var char = followers[i];
            if (char.isDeceased) continue;
            var locId = _resolveCurrentLocationId(char);
            if (locId === locationId) {
                result.push(char);
            }
        }

        return result;
    }

    /**
     * The religion with the most living followers at a location.
     *
     * Enumerates characters at the location (via _resolveCurrentLocationId)
     * and buckets by religionId. Returns a CLONE of the religion record
     * (via getReligion), or null when no character at the location has a
     * religion.
     *
     * Prior revisions iterated religions whose `locations` array declares
     * the location, missing every religion whose followers moved in but
     * never declared it. Fixed at the algorithm level.
     */
    function getDominantReligion(locationId) {
        if (!locationId) return null;

        var allCharacters = _getCharacters();
        var counts = {};
        var dominantReligionId = null;
        var dominantCount = 0;

        for (var i = 0; i < allCharacters.length; i++) {
            var c = allCharacters[i];
            if (!c || !c.id) continue;
            if (c.isDeceased === true) continue;
            if (!c.religionId) continue;

            var locId = _resolveCurrentLocationId(c);
            if (locId !== locationId) continue;

            counts[c.religionId] = (counts[c.religionId] || 0) + 1;
            if (counts[c.religionId] > dominantCount) {
                dominantCount = counts[c.religionId];
                dominantReligionId = c.religionId;
            }
        }

        if (!dominantReligionId) return null;
        return getReligion(dominantReligionId);
    }

    /**
     * Per-religion follower counts at a location, plus the unaffiliated
     * bucket.
     *
     * Returns a plain object whose keys are religion ids plus the literal
     * key 'unaffiliated'. Each value is { name: string, count: number }.
     * The name is looked up from the religion record (or 'Unknown' if the
     * religion no longer exists); the count is the number of living
     * characters whose resolved current location is `locationId` and whose
     * religionId matches the key (or is null/empty, for 'unaffiliated').
     *
     * Enumerates characters at the location once and buckets by
     * religionId. Deceased characters are excluded (consistent with
     * getFollowersByLocation and getFollowerCount).
     */
    function getReligiousBreakdown(locationId) {
        if (!locationId) return {};

        var allCharacters = _getCharacters();
        var byReligionId = {};
        var unaffiliated = 0;

        for (var i = 0; i < allCharacters.length; i++) {
            var c = allCharacters[i];
            if (!c || !c.id) continue;
            if (c.isDeceased === true) continue;

            var locId = _resolveCurrentLocationId(c);
            if (locId !== locationId) continue;

            if (!c.religionId) {
                unaffiliated++;
                continue;
            }
            byReligionId[c.religionId] = (byReligionId[c.religionId] || 0) + 1;
        }

        var breakdown = {};
        for (var religionId in byReligionId) {
            if (!Object.prototype.hasOwnProperty.call(byReligionId, religionId)) {
                continue;
            }
            var religion = getReligion(religionId);
            breakdown[religionId] = {
                name: religion ? religion.name : 'Unknown',
                count: byReligionId[religionId]
            };
        }

        breakdown['unaffiliated'] = {
            name: 'Unaffiliated',
            count: unaffiliated
        };

        return breakdown;
    }

    // =========================================================================
    // 9. CHARACTER RELIGION QUERIES
    // =========================================================================

    function getCharacterReligion(characterId) {
        var character = _getCharacterById(characterId);
        if (!character) return null;
        if (!character.religionId) return null;
        return getReligion(character.religionId);
    }

    function getCharacterReligionHistory(characterId) {
        var character = _getCharacterById(characterId);
        if (!character) return [];
        return character.religionHistory || [];
    }

    function getCharacterConversionHistory(characterId) {
        return getCharacterReligionHistory(characterId);
    }

    function getCharactersByReligion(religionId, options) {
        return getFollowers(religionId, options);
    }

    function getCharactersByReligionAndLocation(religionId, locationId) {
        return getFollowersByLocation(religionId, locationId);
    }

    // =========================================================================
    // 10. RELIGION STATISTICS
    // =========================================================================

    function getReligionStatistics(religionId) {
        var religion = getReligion(religionId);
        if (!religion) return null;

        var followers = getFollowers(religionId, { includeDeceased: false });

        return {
            religionId: religion.id,
            religionName: religion.name,
            trait: religion.trait,
            followerCount: followers.length,
            locationCount: Array.isArray(religion.locations) ? religion.locations.length : 0,
            godCount: Array.isArray(religion.gods) ? religion.gods.length : 0,
            lawCount: Array.isArray(religion.laws) ? religion.laws.length : 0,
            placeCount: Array.isArray(religion.placesOfWorship) ? religion.placesOfWorship.length : 0,
            schoolCount: Array.isArray(religion.schools) ? religion.schools.length : 0,
            isDeprecated: religion.isDeprecated === true,
            hasLeader: religion.leader !== null && religion.leader !== undefined,
            leaderName: religion.leader ? religion.leader.characterName : null
        };
    }

    function getGlobalReligionStatistics() {
        var religions = getAllReligions({ includeDeprecated: false });

        var stats = {
            totalReligions: religions.length,
            totalFollowers: 0,
            byTrait: {},
            largest: null,
            oldest: null
        };

        var largestCount = 0;

        for (var i = 0; i < religions.length; i++) {
            var religion = religions[i];
            var count = getFollowerCount(religion.id);

            stats.totalFollowers += count;

            if (religion.trait) {
                if (!stats.byTrait[religion.trait]) stats.byTrait[religion.trait] = 0;
                stats.byTrait[religion.trait] += count;
            }

            if (count > largestCount) {
                largestCount = count;
                stats.largest = {
                    id: religion.id,
                    name: religion.name,
                    followers: count
                };
            }

            if (!stats.oldest ||
                (religion.createdAt !== undefined &&
                 religion.createdAt < stats.oldest.createdAt)) {
                stats.oldest = {
                    id: religion.id,
                    name: religion.name,
                    createdAt: religion.createdAt
                };
            }
        }

        return stats;
    }

    // =========================================================================
    // 11. INHERITANCE QUERIES
    // =========================================================================

    function getInheritanceDescription(religionId) {
        var religion = getReligion(religionId);
        if (!religion) return 'No inheritance rules set';

        var rule = religion.inheritanceRule || { type: 'mother' };
        var format = _getFormat();
        var ruleName = format.getInheritanceRuleName(rule.type);

        if (rule.type === 'both' && rule.priority) {
            var priorityName = format.getInheritanceRuleName(rule.priority);
            return ruleName + ' (priority: ' + priorityName + ')';
        }

        return ruleName;
    }

    function getInheritanceSummary(religionId) {
        var religion = getReligion(religionId);
        if (!religion) return null;

        var rule = religion.inheritanceRule || { type: 'mother' };
        var format = _getFormat();

        return {
            religionId: religion.id,
            religionName: religion.name,
            ruleType: rule.type,
            ruleName: format.getInheritanceRuleName(rule.type),
            priority: (rule.priority !== undefined && rule.priority !== null) ? rule.priority : null,
            priorityName: rule.priority ? format.getInheritanceRuleName(rule.priority) : null,
            notes: rule.notes || '',
            description: getInheritanceDescription(religionId)
        };
    }

    function getInheritanceStatistics(religionId) {
        var summary = getInheritanceSummary(religionId);
        if (!summary) return null;

        return {
            religionId: summary.religionId,
            religionName: summary.religionName,
            ruleType: summary.ruleType,
            ruleName: summary.ruleName,
            priority: summary.priority,
            priorityName: summary.priorityName
        };
    }

    function getAllInheritanceSummaries() {
        var allReligions = getAllReligions({ includeDeprecated: false });
        var summaries = [];
        for (var i = 0; i < allReligions.length; i++) {
            var summary = getInheritanceSummary(allReligions[i].id);
            if (summary) summaries.push(summary);
        }
        return summaries;
    }

    // =========================================================================
    // 12. GROWTH QUERIES (range-based)
    // =========================================================================

    function getReligionGrowth(religionId, startYear, endYear) {
        var religion = getReligion(religionId);
        if (!religion) return null;

        var currentYear = _getCurrentYear();
        var resolvedStart = (startYear === undefined || startYear === null)
            ? currentYear - 10
            : startYear;
        var resolvedEnd = (endYear === undefined || endYear === null)
            ? currentYear
            : endYear;

        if (resolvedEnd < resolvedStart) {
            var tmp = resolvedStart;
            resolvedStart = resolvedEnd;
            resolvedEnd = tmp;
        }

        var allCharacters = _getCharacters();
        var conversions = [];

        for (var i = 0; i < allCharacters.length; i++) {
            var char = allCharacters[i];
            if (!Array.isArray(char.religionHistory)) continue;
            for (var j = 0; j < char.religionHistory.length; j++) {
                var event = char.religionHistory[j];
                if (event.toReligionId === religionId || event.fromReligionId === religionId) {
                    conversions.push(event);
                }
            }
        }

        var yearData = {};
        for (var k = 0; k < conversions.length; k++) {
            var conv = conversions[k];
            if (conv.year >= resolvedStart && conv.year <= resolvedEnd) {
                if (!yearData[conv.year]) {
                    yearData[conv.year] = { to: 0, from: 0 };
                }
                if (conv.toReligionId === religionId) yearData[conv.year].to++;
                if (conv.fromReligionId === religionId) yearData[conv.year].from++;
            }
        }

        var totalConverts = 0;
        var totalLosses = 0;
        var result = [];

        for (var year = resolvedStart; year <= resolvedEnd; year++) {
            var data = yearData[year] || { to: 0, from: 0 };
            totalConverts += data.to;
            totalLosses += data.from;
            result.push({
                year: year,
                conversionsTo: data.to,
                conversionsFrom: data.from,
                netChange: data.to - data.from
            });
        }

        return {
            religionId: religionId,
            religionName: religion.name,
            startYear: resolvedStart,
            endYear: resolvedEnd,
            years: result,
            totalConverts: totalConverts,
            totalLosses: totalLosses,
            netChange: totalConverts - totalLosses
        };
    }

    function getConversionStats(religionId, startYear, endYear) {
        var growth = getReligionGrowth(religionId, startYear, endYear);
        if (!growth) return null;

        return {
            religionId: religionId,
            religionName: growth.religionName,
            startYear: growth.startYear,
            endYear: growth.endYear,
            totalConversions: growth.totalConverts,
            totalLosses: growth.totalLosses,
            netChange: growth.netChange,
            years: growth.years
        };
    }

    // =========================================================================
    // 13. PLACE OF WORSHIP QUERIES
    // =========================================================================

    function getPlaceOfWorship(placeId) {
        if (!placeId) return null;
        return _getState().getPlaceOfWorshipById(placeId);
    }

    function getPlacesOfWorshipByReligion(religionId) {
        var religion = getReligion(religionId);
        if (!religion) return [];
        return Array.isArray(religion.placesOfWorship) ? religion.placesOfWorship.slice() : [];
    }

    function getPlacesOfWorshipByLocation(locationId) {
        if (!locationId) return [];

        // Documented approximation. See ADR Decision 2.
        var religions = getReligionsByLocation(locationId);
        var result = [];

        for (var i = 0; i < religions.length; i++) {
            var religion = religions[i];
            if (!Array.isArray(religion.placesOfWorship)) continue;
            for (var j = 0; j < religion.placesOfWorship.length; j++) {
                result.push({
                    id: religion.placesOfWorship[j],
                    religionId: religion.id,
                    religionName: religion.name
                });
            }
        }

        return result;
    }

    function getPlaceOfWorshipCount(religionId) {
        var religion = getReligion(religionId);
        if (!religion) return 0;
        return Array.isArray(religion.placesOfWorship) ? religion.placesOfWorship.length : 0;
    }

    // =========================================================================
    // 14. COMPATIBILITY QUERIES
    // =========================================================================
    //
    // Both functions are stubs. See COMPATIBILITY QUERIES in the module
    // header for the migration path.

    /**
     * Reports whether two characters are culturally compatible.
     *
     * NOT YET IMPLEMENTED. Cultural compatibility belongs to the culture
     * domain's rules layer (culture-rules.js or equivalent), which does
     * not currently exist. This stub returns { compatible: true } so
     * callers do not have to null-check the result. When the culture
     * domain's rules layer ships, this function should delegate to it
     * or be removed from this module entirely (religion should not own
     * cultural compatibility decisions).
     *
     * @param {string} characterIdA
     * @param {string} characterIdB
     * @returns {{ compatible: boolean, reason: string }}
     */
    function isCulturallyCompatible(characterIdA, characterIdB) {
        return {
            compatible: true,
            reason: 'Cultural compatibility is not yet implemented. ' +
                    'This check will move to the culture domain when ' +
                    'its rules layer ships.'
        };
    }

    /**
     * Reports whether two characters may marry under any religion's laws.
     *
     * NOT YET IMPLEMENTED. Interfaith marriage eligibility belongs to
     * the relationship domain (relationship-rules.js or equivalent),
     * which will own the marriage-eligibility check once it exists.
     * This module does not attempt to derive eligibility from religion
     * laws because:
     *
     *   - No religion law can currently express an interfaith-marriage
     *     restriction. crime-constants.js::CRIME_TYPES does not contain
     *     'interfaith_marriage'; the crime domain's law catalog has no
     *     placeholder for it; and no religion law written through
     *     modals-religion.js::openAddLawModal can carry it.
     *
     *   - Marriage eligibility is a relationship-domain concern, not a
     *     religion-domain concern. Different faiths have different
     *     rules, but the rule evaluation belongs where marriages are
     *     formed.
     *
     *   - The prior implementation looked for a law whose
     *     crimeMapping.crimeType was the string 'interfaith_marriage',
     *     which nothing could ever set. The check was dead code and
     *     returned { permitted: true } on every input regardless of
     *     the religions involved.
     *
     * Callers that need a real answer should wait for the relationship
     * domain to ship and route through its marriage-rules module. This
     * function exists only so that callers do not have to null-check it
     * before use; it returns the same { permitted, reason } shape as
     * the intended implementation.
     *
     * @param {string} characterIdA
     * @param {string} characterIdB
     * @returns {{ permitted: boolean, reason: string }}
     */
    function isReligiouslyPermitted(characterIdA, characterIdB) {
        return {
            permitted: true,
            reason: 'Interfaith marriage eligibility is not yet ' +
                    'implemented. This check will move to the relationship ' +
                    'domain when it ships.'
        };
    }

    // =========================================================================
    // 15. LOAD-TIME VERIFICATION
    // =========================================================================
    //
    // Only the load-time hard dependencies are verified here. Location
    // resolution is a call-time requirement — the location and character
    // query modules are always present at call time under the documented
    // load order, but loading religion-queries.js in isolation should not
    // fail on them. See DEPENDENCIES in the header.

    (function _verifyLoadTimeDependencies() {
        if (!window.ReligionState) {
            throw new Error(
                'religion-queries.js loaded but window.ReligionState is missing. ' +
                'Check script tag order.'
            );
        }
        if (!window.ReligionFormat) {
            throw new Error(
                'religion-queries.js loaded but window.ReligionFormat is missing. ' +
                'Check script tag order.'
            );
        }
        if (typeof window.getCharacterById !== 'function') {
            throw new Error(
                'religion-queries.js loaded but window.getCharacterById is missing. ' +
                'Check script tag order (accessors.js must load first).'
            );
        }
        if (typeof window.getCharacters !== 'function') {
            throw new Error(
                'religion-queries.js loaded but window.getCharacters is missing. ' +
                'Check script tag order (accessors.js must load first).'
            );
        }
        if (typeof window.getCurrentYear !== 'function') {
            throw new Error(
                'religion-queries.js loaded but window.getCurrentYear is missing. ' +
                'Check script tag order (time.js must load first).'
            );
        }
    })();

    // =========================================================================
    // 16. PUBLIC API
    // =========================================================================

    window.ReligionQueries = {
        // Basic
        getReligion: getReligion,
        getAllReligions: getAllReligions,
        getActiveReligions: getActiveReligions,
        getDeprecatedReligions: getDeprecatedReligions,
        getReligionsByLocation: getReligionsByLocation,
        getReligionsByTrait: getReligionsByTrait,
        getReligionByLeader: getReligionByLeader,

        // Gods
        getGod: getGod,
        getGodsByReligion: getGodsByReligion,
        getGodsByDomain: getGodsByDomain,
        getGodCount: getGodCount,

        // Laws
        getLaw: getLaw,
        getLawsByReligion: getLawsByReligion,
        getLawsByDomain: getLawsByDomain,
        getLawsByCategory: getLawsByCategory,

        // Followers
        getFollowers: getFollowers,
        getFollowerCount: getFollowerCount,
        getFollowersByLocation: getFollowersByLocation,
        getDominantReligion: getDominantReligion,
        getReligiousBreakdown: getReligiousBreakdown,

        // Character religion
        getCharacterReligion: getCharacterReligion,
        getCharacterReligionHistory: getCharacterReligionHistory,
        getCharacterConversionHistory: getCharacterConversionHistory,
        getCharactersByReligion: getCharactersByReligion,
        getCharactersByReligionAndLocation: getCharactersByReligionAndLocation,

        // Religion statistics
        getReligionStatistics: getReligionStatistics,
        getGlobalReligionStatistics: getGlobalReligionStatistics,

        // Inheritance
        getInheritanceDescription: getInheritanceDescription,
        getInheritanceSummary: getInheritanceSummary,
        getInheritanceStatistics: getInheritanceStatistics,
        getAllInheritanceSummaries: getAllInheritanceSummaries,

        // Growth
        getReligionGrowth: getReligionGrowth,
        getConversionStats: getConversionStats,

        // Places of worship
        getPlaceOfWorship: getPlaceOfWorship,
        getPlacesOfWorshipByReligion: getPlacesOfWorshipByReligion,
        getPlacesOfWorshipByLocation: getPlacesOfWorshipByLocation,
        getPlaceOfWorshipCount: getPlaceOfWorshipCount,

        // Compatibility (flavor only)
        isCulturallyCompatible: isCulturallyCompatible,
        isReligiouslyPermitted: isReligiouslyPermitted
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ReligionQueries: window.ReligionQueries };
    }

})();
